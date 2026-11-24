// Token-radar entrypoint, written fresh for rebuild4.
// Reads a DefiLlama snapshot, fits the model (lib/model.ts), and writes
// /output: board.json, data.js (the page's data), dashboard/, screenshots/
// (copied from the repository) and dossier.json (when screenshots exist).
// Node standard library only; deterministic: no timestamps in any output.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, loadSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = process.env.MAKEFUN_INPUT ?? '/input/snapshot.json';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) input = argv[++i]!;
    else if (argv[i] === '--output' && argv[i + 1]) output = argv[++i]!;
  }
  return { input, output };
}

function copyTree(src: string, dst: string): number {
  mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name);
    const d = join(dst, e.name);
    if (e.isDirectory()) n += copyTree(s, d);
    else if (e.isFile()) {
      copyFileSync(s, d);
      n++;
    }
  }
  return n;
}

function fail(msg: string): never {
  throw new Error(`gate failed: ${msg}`);
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot = loadSnapshot(input);
  const built = buildBoard(snapshot);
  const { rows, liveTokens, census, fit } = built;

  // ---- hard gates: refuse to write a bad board ----
  const watchSet = new Set(snapshot.watchlist);
  const rowSlugs = new Set(rows.map((r) => r.slug));
  for (const w of watchSet) {
    if (!rowSlugs.has(w)) fail(`watchlist ${w} missing from the board`);
  }
  if (rows.length < 100 || rows.length > 4000) fail(`board has ${rows.length} rows`);
  rows.forEach((r, i) => {
    if (r.rank !== i + 1) fail(`row ${r.slug} has rank ${r.rank}, expected ${i + 1}`);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      fail(`row ${r.slug} has a bad implied value`);
    }
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      fail(`board not sorted by value at rank ${r.rank}`);
    }
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      fail(`row ${r.slug} has ${r.farm_steps.length} farm steps`);
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) fail(`row ${r.slug} has a farm step of ${t.length} chars`);
    }
  });
  if (new Set(rows.map((r) => r.implied_value_usd)).size < 2) {
    fail('all implied values are equal: not a ranking');
  }
  const censusSum = census.reduce((s, b) => s + b.count, 0);
  if (censusSum !== snapshot.protocols.length) {
    fail(`census sums to ${censusSum}, snapshot has ${snapshot.protocols.length}`);
  }
  const watchCovered = rows.filter((r) => r.scope === 'Watchlist').length;
  if (watchCovered !== snapshot.watchlist.length) {
    fail(`board covers ${watchCovered} watchlist rows, snapshot lists ${snapshot.watchlist.length}`);
  }

  mkdirSync(output, { recursive: true });

  // ---- board.json ----
  const board = {
    rows: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      rank: r.rank,
      implied_value_usd: r.implied_value_usd,
      farm_steps: r.farm_steps,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      scope: r.scope,
      fitted_mcap_usd: r.fitted_mcap_usd,
      odds: r.odds,
      band_low_usd: r.band_low_usd,
      band_high_usd: r.band_high_usd,
      gas_usd: r.gas_usd,
      net_expected_usd: r.net_expected_usd,
      exit_trigger: r.exit_trigger,
      nearest: r.nearest,
    })),
  };
  writeFileSync(join(output, 'board.json'), JSON.stringify(board, null, 2) + '\n');

  // ---- data.js: everything the page renders (inputs + fitted numbers) ----
  const data = {
    meta: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      rows: rows.length,
      watchlist_rows: watchCovered,
      early_rows: rows.length - watchCovered,
      total_implied_usd: built.totalImplied,
    },
    curve: {
      a: fit.curveA,
      b: fit.curveB,
      r2: fit.curveR2,
      rmse: fit.curveRmse,
      loo_rmse: fit.curveLoo,
      loo_multiple: fit.looMultiple,
      flat_multiple: fit.flatMultiple,
      flat_rmse: fit.flatRmse,
      comps: fit.compsAfter,
      duplicates_dropped: fit.duplicatesDropped,
      huber_iterations: fit.huberIterations,
    },
    validation: {
      multi_r2: fit.multiR2,
      multi_loo: fit.multiLoo,
      multi_ablation: fit.multiAblation,
      holdout_cutoff: fit.holdoutCutoff,
      holdout_n_fit: fit.holdoutNfit,
      holdout_n_test: fit.holdoutNtest,
      holdout_r2: fit.holdoutR2,
      holdout_rmse: fit.holdoutRmse,
      holdout_flat_rmse: fit.holdoutFlatRmse,
      walk_forward: fit.walkForward,
      walk_forward_pooled: fit.walkForwardPooled,
      within3_in_sample: fit.within3InSample,
      within3_loo: fit.within3Loo,
      within2_in_sample: fit.within2InSample,
      within2_loo: fit.within2Loo,
      bootstrap_slope_low: fit.bootstrapSlopeLow,
      bootstrap_slope_high: fit.bootstrapSlopeHigh,
      bootstrap_intercept_low: fit.bootstrapInterceptLow,
      bootstrap_intercept_high: fit.bootstrapInterceptHigh,
      odds_n: fit.oddsN,
      odds_positives: fit.oddsPositives,
      odds_auc: fit.oddsAuc,
      odds_age_or: fit.oddsAgeOr,
      odds_tvl_or: fit.oddsTvlOr,
      odds_7d_or_per_10pts: fit.odds7dOr,
      odds_ablation: fit.oddsAblation,
      odds_7d_winsorized: fit.odds7dWinsorized,
    },
    recompute: built.recompute,
    rows: rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_years: r.age_years,
      scope: r.scope,
      rank: r.rank,
      fitted_mcap_usd: r.fitted_mcap_usd,
      odds: r.odds,
      implied_value_usd: r.implied_value_usd,
      band_low_usd: r.band_low_usd,
      band_high_usd: r.band_high_usd,
      gas_usd: r.gas_usd,
      gas_drag_pct: r.gas_drag_pct,
      net_expected_usd: r.net_expected_usd,
      exit_trigger: r.exit_trigger,
      farm_steps: r.farm_steps,
      nearest: r.nearest,
    })),
    live_tokens: liveTokens,
    census,
  };
  writeFileSync(join(output, 'data.js'), `window.TOKEN_RADAR = ${JSON.stringify(data, null, 2)};\n`);

  // ---- dashboard + screenshots ----
  const dashFiles = copyTree(join(REPO_ROOT, 'dashboard'), join(output, 'dashboard'));
  let shotCount = 0;
  const shotsSrc = join(REPO_ROOT, 'screenshots');
  if (existsSync(shotsSrc)) {
    shotCount = copyTree(shotsSrc, join(output, 'screenshots'));
  }

  // ---- dossier (only once screenshots exist) ----
  let dossierBytes = 0;
  if (shotCount >= 3) {
    const dossier = buildDossier(output, { text_max_bytes: 65536 });
    writeFileSync(join(output, 'dossier.json'), dossier);
    dossierBytes = dossier.length;
  } else {
    console.log(`note: ${shotCount} screenshots in the repo, dossier skipped (need 3)`);
  }

  const top3 = rows.slice(0, 3).map((r) => `${r.name} $${r.implied_value_usd.toLocaleString('en-US')}`);
  console.log(`rows: ${rows.length} (${watchCovered} watchlist + ${rows.length - watchCovered} early)`);
  console.log(`top 3: ${top3.join(' · ')}`);
  console.log(`total implied: $${built.totalImplied.toLocaleString('en-US')}`);
  console.log(
    `curve: log10(mcap) = ${fit.curveA.toFixed(4)} + ${fit.curveB.toFixed(4)}·log10(TVL), R² ${fit.curveR2.toFixed(3)}, LOO ${fit.looMultiple.toFixed(2)}×, odds AUC ${fit.oddsAuc.toFixed(3)}`,
  );
  console.log(`dashboard files copied: ${dashFiles}, screenshots copied: ${shotCount}, dossier: ${dossierBytes} bytes`);
}

main();
