// main.ts — token-radar-01 rebuild3 entrypoint (Node 22, stdlib only).
// Reads the sealed snapshot at /input/snapshot.json (or --input), fits
// the model in lib/model.ts, writes the ranked board to /output/board.json,
// the dashboard data to /output/data.js, copies dashboard/ and
// screenshots/ to /output, and writes /output/dossier.json with the
// vendored make.fun library. Hard gates run before anything is written:
// a board the gate would refuse exits non-zero here instead.
//
//   mkdir -p out && node main.ts --input input/snapshot.json --output out

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fitModel, type Snapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1] as string;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function fail(msg: string): never {
  process.stderr.write(`token radar: ${msg}\n`);
  process.exit(1);
}

const inputArg = arg("input", "/input");
const inputFile = inputArg.endsWith(".json") ? inputArg : join(inputArg, "snapshot.json");
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory>`);
const out = arg("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");

const snap = JSON.parse(readFileSync(inputFile, "utf8")) as Snapshot;
if (!Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist) || typeof snap.as_of !== "string") {
  fail("snapshot is not shaped like { as_of, protocols[], watchlist[] }");
}

const { fit, rows } = fitModel(snap);

// ---- hard gates (the gate's seven rows, checked here first) ----
if (rows.length < 100 || rows.length > 4000) fail(`board has ${rows.length} rows, need 100..4000`);
const slugs = new Set(snap.protocols.map((p) => p.slug));
const seen = new Set<string>();
rows.forEach((r, i) => {
  if (r.rank !== i + 1) fail(`row ${r.slug} has rank ${r.rank}, expected ${i + 1}`);
  if (!slugs.has(r.slug)) fail(`row ${r.slug} is not in the snapshot`);
  if (seen.has(r.slug)) fail(`row ${r.slug} appears twice`);
  seen.add(r.slug);
  if (!(r.implied_value_usd > 0) || !Number.isInteger(r.implied_value_usd)) {
    fail(`row ${r.slug} has a bad implied value`);
  }
  if (i > 0 && rows[i - 1].implied_value_usd < r.implied_value_usd) {
    fail("board is not sorted by implied value");
  }
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
    fail(`row ${r.slug} has ${r.farm_steps.length} farm steps, need 3..12`);
  }
  for (const s of r.farm_steps) {
    const t = s.trim().length;
    if (t < 20 || t > 600) fail(`row ${r.slug} has a farm step of ${t} chars, need 20..600`);
  }
});
if (fit.watchlistCovered !== fit.watchlistTotal) {
  fail(`watchlist coverage ${fit.watchlistCovered}/${fit.watchlistTotal}`);
}
const censusSum = Object.values(fit.census).reduce((a, b) => a + b, 0);
if (censusSum !== snap.protocols.length) {
  fail(`census sums to ${censusSum}, snapshot has ${snap.protocols.length}`);
}
if (rows.some((r) => r.implied_value_usd === rows[0].implied_value_usd && rows.length > 1)) {
  // All-equal check: at least two distinct implied values must exist.
  if (new Set(rows.map((r) => r.implied_value_usd)).size < 2) fail("all implied values are equal");
}

// ---- write outputs ----
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "board.json"), `${JSON.stringify({ rows })}\n`);

const data = {
  as_of: snap.as_of,
  source: snap.source,
  total: snap.protocols.length,
  watchlist: snap.watchlist,
  coef: {
    intercept: fit.intercept,
    logTvl: fit.logTvl,
  },
  oddsCoef: {
    intercept: fit.odds.intercept,
    age: fit.odds.age,
    logTvl: fit.odds.logTvl,
    change7d: fit.odds.change7d,
  },
  validation: {
    nComps: fit.n,
    dedupBefore: fit.dedupBefore,
    dedupAfter: fit.dedupAfter,
    olsR2: fit.ols.r2,
    olsRmse: fit.ols.rmse,
    huberR2: fit.r2,
    huberRmse: fit.rmse,
    flatMultiple: fit.flatMultiple,
    flatRmse: fit.flatRmse,
    looRmse: fit.looRmse,
    looFlatRmse: fit.looFlatRmse,
    looMultiple: fit.looFlatRmse / fit.looRmse,
    holdout: fit.holdout,
    walkForward: fit.walkForward,
    wfMultiple: fit.wfMultiple,
    ablation: fit.ablation,
    within3: fit.within3,
    within2: fit.within2,
    within3Loo: fit.within3Loo,
    within2Loo: fit.within2Loo,
    slopeLo: fit.slopeLo,
    slopeHi: fit.slopeHi,
    interceptLo: fit.interceptLo,
    interceptHi: fit.interceptHi,
    oddsAuc: fit.odds.auc,
    oddsN: fit.odds.n,
    oddsPos: fit.odds.nPos,
    oddsAblation: fit.odds.ablation,
    selection: fit.selection,
  },
  census: fit.census,
  rows: rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    category: r.category,
    chains: r.chains,
    tvl: r.tvl_usd,
    change7d: r.change_7d,
    age: r.age_used,
    odds: r.odds,
    implied: r.implied_value_usd,
    curve: r.curve_value_usd,
    bandLo: r.band_lo_usd,
    bandHi: r.band_hi_usd,
    netExpected: r.net_expected_usd,
    gas: r.gas_usd,
    gasDrag: r.gas_drag_pct,
    exitTrigger: r.exit_trigger,
    farmSteps: r.farm_steps,
    nearest: r.nearest_comps,
  })),
};
writeFileSync(join(out, "data.js"), `window.RADAR = ${JSON.stringify(data)};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith(".")) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, "dashboard"), join(out, "dashboard"));
const shots = copyFiles(join(here, "screenshots"), join(out, "screenshots"));
if (shots.length < 3) {
  // First run: board + data are written so screenshots can be taken from
  // this /output; the dossier is written on the next run, once the
  // screenshots exist. The gate refuses a dossier without them anyway.
  process.stdout.write(
    `token radar: ${snap.protocols.length} protocols, ${fit.watchlistTotal} on the watchlist, ${rows.length} rows ` +
      `(curve R2 ${fit.r2.toFixed(3)}, LOO ${fit.looRmse.toFixed(3)} vs flat ${fit.looFlatRmse.toFixed(3)}, ` +
      `WF ${fit.wfMultiple.toFixed(2)}x, odds AUC ${fit.odds.auc.toFixed(3)})\n` +
      `token radar: wrote ${join(out, "board.json")} and ${join(out, "data.js")}; ` +
      `screenshots/ holds ${shots.length} images — take 3, then run again to write the dossier\n`,
  );
  process.exit(0);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: bad image name`);
  const st = statSync(join(here, "screenshots", name));
  if (st.size > 524_288) fail(`screenshots/${name} is ${st.size} bytes, over the 512 KiB cap`);
}

writeFileSync(
  join(out, "dossier.json"),
  buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${snap.protocols.length} protocols, ${fit.watchlistTotal} on the watchlist, ${rows.length} rows ` +
    `(curve R2 ${fit.r2.toFixed(3)}, LOO ${fit.looRmse.toFixed(3)} vs flat ${fit.looFlatRmse.toFixed(3)}, ` +
    `WF ${fit.wfMultiple.toFixed(2)}x, odds AUC ${fit.odds.auc.toFixed(3)})\n` +
    `token radar: wrote ${join(out, "board.json")}, ${join(out, "data.js")}, ${join(out, "dashboard")} ` +
    `(${dashFiles.length} files), ${join(out, "screenshots")} (${shots.length} images) and ${join(out, "dossier.json")}\n`,
);
