// Local replica of the token-radar gate's seven checks, run on an output
// directory main.ts wrote. Usage:
//   node scripts/gate-check.ts [--out out] [--input input/snapshot.json]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const out = arg('out', 'out');
const inputFile = arg('input', 'input/snapshot.json');
const snapshot = JSON.parse(readFileSync(inputFile, 'utf8')) as {
  protocols: { slug: string }[];
  watchlist: string[];
};

const results: { check: string; pass: boolean; detail: string }[] = [];
function record(check: string, pass: boolean, detail: string): void {
  results.push({ check, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${check}: ${detail}\n`);
}

// --- image dimensions (PNG IHDR / JPEG SOF) ---
function imageSize(buf: Buffer): { w: number; h: number; kind: string } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), kind: 'png' };
  }
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) break;
      const marker = buf[off + 1]!;
      const len = buf.readUInt16BE(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(off + 7), h: buf.readUInt16BE(off + 5), kind: 'jpeg' };
      }
      off += 2 + len;
    }
  }
  return null;
}

function listFiles(dir: string, base = ''): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(path).isDirectory()) {
      if (!name.startsWith('.')) found.push(...listFiles(path, rel));
    } else if (statSync(path).isFile()) {
      found.push(rel);
    }
  }
  return found;
}

// 1. dashboard_files
{
  const dashDir = join(out, 'dashboard');
  const files = existsSync(dashDir) ? listFiles(dashDir) : [];
  const totalBytes = files.reduce((s, f) => s + statSync(join(dashDir, f)).size, 0);
  const hasHtml = files.includes('index.html');
  const hasCss = files.some((f) => f.endsWith('.css'));
  const hasJs = files.some((f) => f.endsWith('.js'));
  const badName = files.find((f) => !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(f) || f.startsWith('.') || f.startsWith('-'));
  let badNet: string | null = null;
  for (const f of files) {
    const text = readFileSync(join(dashDir, f), 'utf8');
    if (f.endsWith('.html') || f.endsWith('.css') || f.endsWith('.js')) {
      if (/https?:\/\//.test(text.replace(/\/\/[^\n]*/g, ''))) {
        // Visible text may carry URLs; only attribute/import values count.
        const attrHit =
          /(href|src|action)\s*=\s*["']https?:\/\//.test(text) ||
          /@import\s+["']https?:\/\//.test(text) ||
          /import\s+[^'"]*["']https?:\/\//.test(text) ||
          /url\(\s*["']?https?:\/\//.test(text);
        if (attrHit) badNet = f;
      }
    }
  }
  record(
    'dashboard_files',
    hasHtml && hasCss && hasJs && files.length <= 400 && totalBytes <= 4_194_304 && !badName && !badNet,
    `${files.length} files, ${totalBytes} bytes${badName ? `, bad name ${badName}` : ''}${badNet ? `, network address in ${badNet}` : ''}`,
  );
}

// 2/3/5. board_file, sorted_by_value, farm_steps
const boardPath = join(out, 'board.json');
const boardJson = JSON.parse(readFileSync(boardPath, 'utf8')) as {
  rows: { slug: string; name: string; rank: number; implied_value_usd: number; farm_steps: string[] }[];
};
const rows = boardJson.rows;
const slugs = new Set(snapshot.protocols.map((p) => p.slug));
{
  let ok = rows.length >= 100 && rows.length <= 4000;
  let detail = `${rows.length} rows`;
  for (const r of rows) {
    if (!slugs.has(r.slug)) {
      ok = false;
      detail = `slug ${r.slug} not in snapshot`;
      break;
    }
    if (!r.name || !Number.isInteger(r.rank) || r.rank < 1 || !Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      ok = false;
      detail = `row ${r.slug} has a bad field`;
      break;
    }
  }
  record('board_file', ok, detail);
}
{
  const ranks = new Set(rows.map((r) => r.rank));
  const sorted = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1]!.implied_value_usd);
  const allEqual = new Set(rows.map((r) => r.implied_value_usd)).size === 1;
  const complete = rows.every((_, i) => ranks.has(i + 1));
  record(
    'sorted_by_value',
    sorted && !allEqual && complete && ranks.size === rows.length,
    `ranks 1..${rows.length} ${complete ? 'complete' : 'incomplete'}, non-increasing ${sorted}`,
  );
}
{
  let ok = true;
  let detail = 'all rows carry 3–12 steps of 20–600 chars';
  for (const r of rows) {
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      ok = false;
      detail = `row ${r.slug} has ${r.farm_steps.length} steps`;
      break;
    }
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600) {
        ok = false;
        detail = `row ${r.slug} has a step of ${s.trim().length} chars`;
        break;
      }
    }
    if (!ok) break;
  }
  record('farm_steps', ok, detail);
}

// 4. coverage
{
  const onBoard = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !onBoard.has(s));
  record('coverage', missing.length === 0, `${snapshot.watchlist.length - missing.length}/${snapshot.watchlist.length} watchlist covered`);
}

// 6. screenshots
{
  const shotDir = join(out, 'screenshots');
  const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((n) => !n.startsWith('.')) : [];
  let ok = shots.length >= 3 && shots.length <= 4;
  let detail = `${shots.length} images`;
  for (const name of shots) {
    const buf = readFileSync(join(shotDir, name));
    const size = imageSize(buf);
    if (!size) {
      ok = false;
      detail = `${name} is not a whole PNG/JPEG`;
      break;
    }
    if (buf.length > 524_288) {
      ok = false;
      detail = `${name} is ${buf.length} bytes, over the 512 KiB cap`;
      break;
    }
    const long = Math.max(size.w, size.h);
    const short = Math.min(size.w, size.h);
    if (long > 1440 || short < 800) {
      ok = false;
      detail = `${name} is ${size.w}x${size.h}`;
      break;
    }
    detail = `${shots.length} images, ${size.w}x${size.h} ${size.kind}`;
  }
  record('screenshots', ok, detail);
}

// 7. dossier_matches
{
  const tmp = join(out, '.gate-check-dossier.json');
  const built = buildDossier(out, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  });
  writeFileSync(tmp, built);
  const actual = readFileSync(join(out, 'dossier.json'));
  const ok = actual.equals(Buffer.from(built)) && actual.length <= 1_572_864;
  record('dossier_matches', ok, `dossier ${actual.length} bytes${ok ? ', byte-identical' : ', DIFFERS from a fresh build'}`);
  unlinkSync(tmp);
}

const failed = results.filter((r) => !r.pass);
process.stdout.write(`gate: ${results.length - failed.length}/${results.length} pass\n`);
process.exit(failed.length === 0 ? 0 : 1);
