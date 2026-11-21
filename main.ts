// SOLMAR BAY — gta6-01 entry program (Node 22, standard library only).
// Hands the game in: copies this repo's game/ and screenshots/ beside this file
// into the output directory and writes /output/dossier.json with the vendored
// make.fun library (vendor/makefun-game.ts). Fully deterministic: same inputs,
// same bytes, every run — no timestamps, no randomness, no network.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output every run so a stale file can never leak into the dossier.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// Guard the scorer's game_files cap early: at most 993 files + directories
// under game/ (the dossier, screenshots and output dir share /output's own
// 1,000-entry cap, so game/ must leave them room).
let gameEntries = 0;
(function countGame(dir: string): void {
  for (const name of readdirSync(dir)) {
    gameEntries++;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) countGame(p);
  }
})(join(out, 'game'));
if (gameEntries > 993) throw new Error(`game/ holds ${gameEntries} entries (cap 993)`);

const shotsDir = join(here, 'screenshots');
const outShots = join(out, 'screenshots');
mkdirSync(outShots, { recursive: true });
if (existsSync(shotsDir)) {
  const shots = readdirSync(shotsDir)
    .filter((n) => !n.startsWith('.'))
    .sort();
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`screenshots/: expected 3 or 4 images, found ${shots.length}`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > 262144) throw new Error(`screenshots/${name} is ${size} bytes (cap 256 KiB)`);
  }
  cpSync(shotsDir, outShots, { recursive: true });
}

// game/index.html must exist and stay under the scorer's 1 MiB cap.
const indexPath = join(out, 'game', 'index.html');
if (!existsSync(indexPath)) throw new Error('game/index.html is missing');
const indexBytes = statSync(indexPath).size;
if (indexBytes > 1048576) throw new Error(`game/index.html is ${indexBytes} bytes (cap 1 MiB)`);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`SOLMAR BAY dossier written to ${out}`);
console.log(`game/ entries: ${gameEntries}, index.html: ${indexBytes} bytes, dossier: ${statSync(join(out, 'dossier.json')).size} bytes`);
