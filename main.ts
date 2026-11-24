// main.ts — token launch radar entrypoint.
//
// Reads input/snapshot.json (the protocol universe, regenerated in-session
// by scripts/fetch-snapshot.mjs), fits the value model from lib/model.ts,
// and writes the graded outputs:
//
//   <out>/board.json       ranked board (whole watchlist + eligible early
//                          finds — 190 rows on the 24 Nov snapshot)
//   <out>/data.js          the dashboard's data (window.TOKEN_RADAR)
//   <out>/dashboard/       the static page (copied from dashboard/)
//   <out>/screenshots/     the three screenshots (copied from screenshots/)
//   <out>/dossier.json     buildDossier output over dashboard + screenshots
//
// Invocation (local):  node main.ts --input input/snapshot.json --output out
// The grader runs it with no flags: the snapshot is read from
// /input/snapshot.json when that path exists, and outputs go to /output
// when that directory exists and is writable. Both runs must write the
// same bytes: every number here is fitted from the snapshot, and the only
// randomness (the bootstrap) is seeded.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";
import {
  bootstrapCurve,
  buildBoard,
  fitSizeCurve,
  fitTokenOdds,
  looCurve,
  timeSplitHoldout,
  tradedComps,
  type Snapshot,
} from "./lib/model.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function resolveInput(): string {
  const flag = arg("--input");
  if (flag) return resolve(flag);
  if (existsSync("/input/snapshot.json")) return "/input/snapshot.json";
  const nextToMain = join(HERE, "input", "snapshot.json");
  if (existsSync(nextToMain)) return nextToMain;
  return resolve("input", "snapshot.json");
}

function resolveOutput(): string {
  const flag = arg("--output") ?? arg("--out");
  if (flag) return resolve(flag);
  if (process.env.MAKEFUN_OUTPUT_DIR) return resolve(process.env.MAKEFUN_OUTPUT_DIR);
  try {
    mkdirSync("/output", { recursive: true });
    return "/output";
  } catch {
    return resolve("out");
  }
}

function fail(msg: string): never {
  console.error(`main.ts: ${msg}`);
  process.exit(1);
}

const inputPath = resolveInput();
const outDir = resolveOutput();
const snap = JSON.parse(readFileSync(inputPath, "utf8")) as Snapshot;
if (!Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) {
  fail(`snapshot at ${inputPath} has no protocols/watchlist arrays`);
}
if (typeof snap.floor_usd !== "number" || typeof snap.as_of !== "string") {
  fail("snapshot is missing floor_usd / as_of");
}

const comps = tradedComps(snap.protocols);
const curve = fitSizeCurve(comps);
const odds = fitTokenOdds(snap.protocols, snap.as_of);
const loo = looCurve(comps);
const holdout = timeSplitHoldout(comps);
const boot = bootstrapCurve(comps, 20261124, 200);
const board = buildBoard(snap, curve, odds, boot.pairs);

// Hard gates: refuse to write a board that cannot pass the scorer.
if (board.rows.length < 100) fail(`only ${board.rows.length} board rows`);
if (board.watchlistCovered !== board.watchlistTotal) {
  fail(`watchlist coverage ${board.watchlistCovered}/${board.watchlistTotal}`);
}
for (let i = 0; i < board.rows.length; i++) {
  const r = board.rows[i];
  if (r.rank !== i + 1) fail(`rank mismatch at index ${i}`);
  if (i > 0 && r.implied_value_usd > board.rows[i - 1].implied_value_usd) {
    fail("implied values rise with rank");
  }
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
    fail(`row ${r.slug} has ${r.farm_steps.length} farm steps`);
  }
  for (const s of r.farm_steps) {
    const t = s.trim();
    if (t.length < 20 || t.length > 600) fail(`row ${r.slug} farm step length ${t.length}`);
  }
}
const c = board.census;
const censusSum =
  c.traded + c.ranked + c.tokenNoMcap + c.forbiddenCategory + c.versionedName +
  c.wrappedWord + c.exchangePrefix + c.eligibleNotSelected;
if (censusSum !== c.total) fail(`census sums to ${censusSum}, total is ${c.total}`);

mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, "dashboard"), { recursive: true });

// board.json: the ranked board the scorer reads.
const boardJson = {
  generated_from: { as_of: snap.as_of, source: snap.source, floor_usd: snap.floor_usd },
  model: {
    size_curve: {
      formula: `log10(mcap) = ${curve.a.toFixed(4)} + ${curve.b.toFixed(4)} * log10(tvl)`,
      a: curve.a,
      b: curve.b,
      r2: curve.r2,
      rmse: curve.rmse,
      n_comps: curve.n,
      flat_multiple: curve.flatMultiple,
      flat_rmse: curve.flatRmse,
    },
    token_odds: {
      intercept: odds.intercept,
      coef_age_years: odds.coefAge,
      coef_log_tvl: odds.coefLogTvl,
      coef_change_7d: odds.coefChange,
      or_age: odds.orAge,
      or_log_tvl: odds.orLogTvl,
      or_change: odds.orChange,
      auc: odds.auc,
      n: odds.n,
      n_positive: odds.nPositive,
    },
    loo: { rmse: loo.rmse, flat_rmse: loo.flatRmse, ratio: loo.ratio },
    holdout: {
      cutoff: holdout.cutoff,
      n_fit: holdout.nFit,
      n_test: holdout.nTest,
      r2: holdout.r2,
      rmse: holdout.rmse,
    },
    bootstrap: { b: boot.b, a_lo: boot.aLo, a_hi: boot.aHi, b_lo: boot.bLo, b_hi: boot.bHi },
  },
  rows: board.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
    curve_value_usd: r.curve_value_usd,
    odds: r.odds,
    band_lo_usd: r.band_lo_usd,
    band_hi_usd: r.band_hi_usd,
    tvl_usd: r.tvl_usd,
    category: r.category,
    scope: r.scope,
  })),
};
writeFileSync(join(outDir, "board.json"), JSON.stringify(boardJson, null, 2) + "\n");

// data.js: everything the dashboard page renders.
const live = comps
  .map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd as number,
    multiple: (p.mcap_usd as number) / p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
  }))
  .sort((a, b) => b.mcap_usd - a.mcap_usd);
const data = {
  meta: {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    protocols: snap.protocols.length,
    watchlist: snap.watchlist.length,
    rows: board.rows.length,
    curve: { a: curve.a, b: curve.b, r2: curve.r2, rmse: curve.rmse, n: curve.n },
    flatMultiple: curve.flatMultiple,
    odds: {
      intercept: odds.intercept,
      coefAge: odds.coefAge,
      coefLogTvl: odds.coefLogTvl,
      coefChange: odds.coefChange,
      orAge: odds.orAge,
      orLogTvl: odds.orLogTvl,
      orChange: odds.orChange,
      auc: odds.auc,
    },
    loo: { rmse: loo.rmse, flatRmse: loo.flatRmse, ratio: loo.ratio },
    holdout: {
      cutoff: holdout.cutoff,
      nFit: holdout.nFit,
      nTest: holdout.nTest,
      r2: holdout.r2,
      rmse: holdout.rmse,
    },
    bootstrap: { b: boot.b, aLo: boot.aLo, aHi: boot.aHi, bLo: boot.bLo, bHi: boot.bHi },
    census: board.census,
    totalImplied: board.rows.reduce((s, r) => s + r.implied_value_usd, 0),
  },
  rows: board.rows,
  live,
};
writeFileSync(join(outDir, "data.js"), `window.TOKEN_RADAR = ${JSON.stringify(data)};\n`);

// dashboard/ and screenshots/ are copied verbatim into the output.
cpSync(join(HERE, "dashboard"), join(outDir, "dashboard"), { recursive: true });
const shotsDir = join(HERE, "screenshots");
const shotFiles = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((f) => !f.startsWith("."))
  : [];
if (shotFiles.length > 0) {
  mkdirSync(join(outDir, "screenshots"), { recursive: true });
  for (const f of shotFiles) copyFileSync(join(shotsDir, f), join(outDir, "screenshots", f));
}

// dossier.json, from the kit's own library. It refuses an empty
// screenshots/ directory, so on a first run before any screenshot exists
// the dossier is skipped and the run still exits 0.
if (shotFiles.length > 0) {
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, "dossier.json"), dossier);
  console.log(`dossier.json: ${dossier.length} bytes`);
} else {
  console.log("no screenshots yet: dossier.json skipped (run again after shooting)");
}

console.log(`snapshot: ${snap.protocols.length} protocols, as_of ${snap.as_of}, watchlist ${snap.watchlist.length}`);
console.log(`curve: log10(mcap) = ${curve.a.toFixed(4)} + ${curve.b.toFixed(4)}*log10(tvl), R2=${curve.r2.toFixed(3)}, RMSE=${curve.rmse.toFixed(3)}, n=${curve.n}`);
console.log(`flat multiple: ${curve.flatMultiple.toFixed(4)}, flat RMSE=${curve.flatRmse.toFixed(3)}`);
console.log(`odds: intercept=${odds.intercept.toFixed(3)} age=${odds.coefAge.toFixed(3)} (OR ${odds.orAge.toFixed(2)}) logTvl=${odds.coefLogTvl.toFixed(3)} (OR ${odds.orLogTvl.toFixed(2)}) chg=${odds.coefChange.toFixed(3)} (OR ${odds.orChange.toFixed(2)}) AUC=${odds.auc.toFixed(3)}`);
console.log(`LOO: curve RMSE=${loo.rmse.toFixed(3)} flat RMSE=${loo.flatRmse.toFixed(3)} ratio=${loo.ratio.toFixed(2)}x`);
console.log(`holdout: cutoff=${holdout.cutoff} fit=${holdout.nFit} test=${holdout.nTest} R2=${holdout.r2.toFixed(3)} RMSE=${holdout.rmse.toFixed(3)}`);
console.log(`bootstrap: B=${boot.b} a=[${boot.aLo.toFixed(3)}, ${boot.aHi.toFixed(3)}] b=[${boot.bLo.toFixed(3)}, ${boot.bHi.toFixed(3)}]`);
console.log(`board: ${board.rows.length} rows, top3=${board.rows.slice(0, 3).map((r) => r.slug).join(", ")}`);
console.log(`census sum check: ${censusSum} == ${c.total}`);
console.log(`wrote ${outDir}`);
