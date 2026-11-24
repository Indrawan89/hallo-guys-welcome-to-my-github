// Entrypoint: read the sealed snapshot, build the fitted radar board,
// write board.json + data.js, copy dashboard/ + screenshots/ to the
// output directory, and write dossier.json with the kit library.
//
// Run locally:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
//
// Node 22.18+ runs this TypeScript as it is (erasable syntax only).
// Deterministic: two runs to different directories are byte-identical.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildBoard } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const MAX_IMPLIED = 100_000_000_000_000;

function fail(message: string): never {
  throw new Error("gate refused: " + message);
}

function parseArgs(argv: string[]): { input: string } {
  let input = "/input/snapshot.json";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && i + 1 < argv.length) {
      input = argv[++i];
    }
  }
  return { input };
}

function readSnapshot(inputPath: string): unknown {
  let file = inputPath;
  if (existsSync(file) && statSync(file).isDirectory()) {
    file = join(file, "snapshot.json");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src).sort()) {
    const from = join(src, name);
    if (statSync(from).isFile()) copyFileSync(from, join(dest, name));
  }
}

async function main(): Promise<void> {
  const { input } = parseArgs(process.argv.slice(2));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR
    ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
    : "/output";
  const root = resolve(import.meta.dirname ?? ".");

  const snapshot = readSnapshot(resolve(root, input)) as Parameters<
    typeof buildBoard
  >[0];
  const built = buildBoard(snapshot);

  // ---- gates, with a clear message for each refusal ----
  const rows = built.rows;
  if (rows.length < 100 || rows.length > 4000) {
    fail(`board has ${rows.length} rows, outside 100..4000`);
  }
  const watchlist = new Set(
    (snapshot as { watchlist: string[] }).watchlist,
  );
  const seen = new Set<string>();
  for (const row of rows) {
    if (!watchlist.has(row.slug) && row.scope === "watchlist") {
      fail(`row ${row.slug} claims watchlist scope but is not listed`);
    }
    if (seen.has(row.slug)) fail(`duplicate slug ${row.slug}`);
    seen.add(row.slug);
  }
  const missing = [...watchlist].filter((slug) => !seen.has(slug));
  if (missing.length > 0) {
    fail(`watchlist not covered, missing ${missing.length}: ${missing.slice(0, 5).join(", ")}`);
  }
  if (built.census.watchlist !== watchlist.size) {
    fail(`watchlist coverage ${built.census.watchlist}/${watchlist.size}`);
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.rank !== i + 1) fail(`rank ${row.rank} at position ${i + 1}`);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      fail(`row ${row.slug} implied value is not a positive whole number`);
    }
    if (row.implied_value_usd > MAX_IMPLIED) {
      fail(`row ${row.slug} implied value exceeds ${MAX_IMPLIED}`);
    }
    if (i > 0 && rows[i - 1].implied_value_usd < row.implied_value_usd) {
      fail(`implied value rises from rank ${i} to rank ${i + 1}`);
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      fail(`row ${row.slug} has ${row.farm_steps.length} farm steps, outside 3..12`);
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) {
        fail(`row ${row.slug} farm step of ${len} characters, outside 20..600`);
      }
    }
  }

  mkdirSync(outDir, { recursive: true });

  // board.json: the ranked board.
  writeFileSync(
    join(outDir, "board.json"),
    JSON.stringify({ rows }, null, 2) + "\n",
    "utf8",
  );

  // data.js: everything the dashboard renders, beside the page.
  const radar = {
    meta: {
      asOf: built.asOf,
      floorUsd: built.floorUsd,
      rows: built.rows.length,
      totalImpliedUsd: built.totalImpliedUsd,
      scopeWatchlist: built.census.watchlist,
      scopeEarly: built.census.early,
    },
    fit: built.fit,
    loo: built.loo,
    timeSplit: built.timeSplit,
    odds: {
      weights: built.odds.weights,
      intercept: built.odds.intercept,
      oddsRatios: built.odds.oddsRatios,
      featureMeans: built.odds.featureMeans,
      featureSds: built.odds.featureSds,
      auc: built.odds.auc,
      iterations: built.odds.iterations,
      learningRate: built.odds.learningRate,
    },
    census: built.census,
    categories: built.categories,
    bootstrap: { draws: 200, seed: 20261124 },
    gasAssumptions: {
      Ethereum: 8,
      "L2 (Base, Arbitrum, Optimism, Polygon, zkSync Era, Blast, Linea, Scroll, Mode, Mantle, Gnosis, Celo)": 0.5,
      "BSC / BNB Chain": 0.3,
      Avalanche: 0.4,
      Fantom: 0.3,
      "Solana / Sui / Aptos / NEAR": 0.05,
      Tron: 0.5,
      "other chains": 1,
    },
    rows: built.rows,
    traded: built.traded,
  };
  writeFileSync(
    join(outDir, "data.js"),
    "window.RADAR = " + JSON.stringify(radar) + ";\n",
    "utf8",
  );

  copyDir(join(root, "dashboard"), join(outDir, "dashboard"));
  copyDir(join(root, "screenshots"), join(outDir, "screenshots"));

  const dossier = await buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  if (typeof dossier === "string") {
    writeFileSync(join(outDir, "dossier.json"), dossier, "utf8");
  } else if (dossier instanceof Uint8Array) {
    writeFileSync(join(outDir, "dossier.json"), dossier);
  } else if (dossier !== undefined && dossier !== null) {
    writeFileSync(
      join(outDir, "dossier.json"),
      JSON.stringify(dossier, null, 2) + "\n",
      "utf8",
    );
  }
  // If buildDossier wrote dossier.json itself, there is nothing more to do.

  console.log(
    `token-radar rebuild: ${rows.length} rows, ` +
      `watchlist ${built.census.watchlist}/${watchlist.size}, ` +
      `top ${rows[0].slug} $${rows[0].implied_value_usd.toLocaleString("en-US")}, ` +
      `total implied $${built.totalImpliedUsd.toLocaleString("en-US")}`,
  );
}

await main();
