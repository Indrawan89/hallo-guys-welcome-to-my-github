// Token-radar rebuild5 entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input), scores
// every pre-token protocol with the model in lib/model.ts, writes the ranked
// board to /output/board.json, the dashboard's data to /output/data.js,
// copies dashboard/ and screenshots/ to /output, and writes
// /output/dossier.json with the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, censusOf, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);

// Hard gates before writing anything.
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);
const census = censusOf(snapshot);
const censusSum = census.buckets.reduce((s, b) => s + b.count, 0);
if (censusSum !== census.total) {
  fail(`census sums to ${censusSum}, snapshot holds ${census.total}`);
}
const covered = new Set(board.map((r) => r.slug));
if (snapshot.watchlist.some((s) => !covered.has(s))) {
  fail('the board does not cover the whole watchlist');
}
for (const row of board) {
  if (!Number.isFinite(row.odds) || !Number.isFinite(row.implied_value_usd)) {
    fail(`row ${row.slug} carries a non-finite value`);
  }
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

const verdicts = {
  FARM: board.filter((r) => r.verdict === 'FARM').length,
  WATCH: board.filter((r) => r.verdict === 'WATCH').length,
  SKIP: board.filter((r) => r.verdict === 'SKIP').length,
};
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.kpi.earlyRows} early, ${radar.live.length} live set aside)\n` +
    `token radar: curve log10(mcap) = ${radar.model.curve.a.toFixed(4)} + ${radar.model.curve.b.toFixed(4)} log10(TVL), R2 ${radar.model.curve.r2.toFixed(3)}, LOO ${radar.model.loo.ratio.toFixed(2)}x, odds AUC ${radar.model.odds.auc.toFixed(3)}\n` +
    `token radar: verdicts FARM ${verdicts.FARM} / WATCH ${verdicts.WATCH} / SKIP ${verdicts.SKIP}, total implied $${radar.kpi.totalImpliedUsd.toLocaleString('en-US')}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
