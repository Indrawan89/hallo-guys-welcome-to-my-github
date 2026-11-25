// Take the three dashboard screenshots with headless Chromium and convert
// them to JPEGs under 256 KiB. Written fresh for token-radar rebuild5.
// Usage: node scripts/shoot.mjs [--out out]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? join(root, 'out');
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const W = 1440;
const H = 900;

const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')).rows;
const top = board[0];
const shots = [
  { name: '01-board.jpg', hash: '' },
  { name: '02-detail.jpg', hash: `#detail/${top.slug}` },
  { name: '03-watchlist.jpg', hash: '#tab=board&filter=watchlist' },
];
const tmpDir = join(root, '.shoot-tmp');
mkdirSync(tmpDir, { recursive: true });
const shotDir = join(root, 'screenshots');
mkdirSync(shotDir, { recursive: true });

for (const shot of shots) {
  const png = join(tmpDir, `${shot.name}.png`);
  const url = `file://${join(out, 'dashboard', 'index.html')}${shot.hash}`;
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      `--window-size=${W},${H}`,
      '--virtual-time-budget=6000',
      `--screenshot=${png}`,
      url,
    ],
    { stdio: 'pipe', timeout: 120_000 },
  );
  // PNG -> JPEG, stepping quality down until under 256 KiB.
  let quality = 84;
  let jpg = join(shotDir, shot.name);
  for (;;) {
    execFileSync(
      'python3',
      [
        '-c',
        `from PIL import Image; im = Image.open(${JSON.stringify(png)}).convert('RGB'); im.save(${JSON.stringify(jpg)}, 'JPEG', quality=${quality})`,
      ],
      { stdio: 'pipe' },
    );
    const bytes = statSync(jpg).size;
    if (bytes < 262_144 || quality <= 55) {
      process.stdout.write(`shoot: ${shot.name} ${bytes} bytes (quality ${quality})\n`);
      break;
    }
    quality -= 7;
  }
}
rmSync(tmpDir, { recursive: true, force: true });
if (!existsSync(join(shotDir, '01-board.jpg'))) process.exit(1);
process.stdout.write('shoot: done\n');
