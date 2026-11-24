// gate-check.ts — re-implements this competition's seven gate rows locally
// against an out/ directory and a snapshot, so a bad artifact is caught
// before any check. Node standard library only.
// Usage: node scripts/gate-check.ts --out out --input input/snapshot.json
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';
import { loadSnapshot } from '../lib/model.ts';

function parseArgs(argv: string[]): { out: string; input: string } {
  let out = 'out';
  let input = 'input/snapshot.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) out = argv[++i]!;
    else if (argv[i] === '--input' && argv[i + 1]) input = argv[++i]!;
  }
  return { out, input };
}

interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

function pngSize(buf: Buffer): [number, number] | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function jpegSize(buf: Buffer): [number, number] | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const len = buf.readUInt16BE(off + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = buf.readUInt16BE(off + 5);
      const w = buf.readUInt16BE(off + 7);
      return [w, h];
    }
    off += 2 + len;
  }
  return null;
}

function main(): void {
  const { out, input } = parseArgs(process.argv.slice(2));
  const snapshot = loadSnapshot(input);
  const results: [string, boolean, string][] = [];
  const fail = (name: string, detail: string) => results.push([name, false, detail]);
  const pass = (name: string, detail: string) => results.push([name, true, detail]);

  // dashboard_files
  {
    const dash = join(out, 'dashboard');
    const files: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (e.name.startsWith('.')) throw new Error(`dot-directory ${p}`);
          walk(join(dir, e.name), p);
        } else if (e.isFile()) files.push(p);
      }
    };
    let ok = true;
    let detail = '';
    try {
      walk(dash, '');
      const hasHtml = files.some((f) => f === 'index.html');
      const hasCss = files.some((f) => f.endsWith('.css'));
      const hasJs = files.some((f) => f.endsWith('.js'));
      const totalBytes = files.reduce((s, f) => s + lstatSync(join(dash, f)).size, 0);
      const badName = files.find((f) => !/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(f.split('/').pop()!));
      const netRe = /(href|src)\s*=\s*["']https?:|@import\s+["']https?:|import\s+[^'"]*["']https?:|url\(\s*["']?https?:/i;
      let netFile = '';
      for (const f of files) {
        if (!/\.(html|css|js|mjs)$/.test(f)) continue;
        const text = readFileSync(join(dash, f), 'utf8');
        if (netRe.test(text)) {
          netFile = f;
          break;
        }
      }
      if (!hasHtml || !hasCss || !hasJs) { ok = false; detail = 'missing index.html/css/js'; }
      else if (files.length > 400 || totalBytes > 4 * 1024 * 1024) { ok = false; detail = 'too many files/bytes'; }
      else if (badName) { ok = false; detail = `bad name ${badName}`; }
      else if (netFile) { ok = false; detail = `network address in ${netFile}`; }
      else detail = `${files.length} files, ${totalBytes} bytes`;
    } catch (err) {
      ok = false;
      detail = String((err as Error).message);
    }
    ok ? pass('dashboard_files', detail) : fail('dashboard_files', detail);
  }

  // board_file + sorted_by_value + coverage + farm_steps
  const boardPath = join(out, 'board.json');
  const board = JSON.parse(readFileSync(boardPath, 'utf8')) as { rows: Row[] };
  const rows = board.rows;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  {
    let bad = '';
    if (!Array.isArray(rows) || rows.length < 100 || rows.length > 4000) bad = `row count ${rows?.length}`;
    else {
      for (const r of rows) {
        if (!slugs.has(r.slug)) { bad = `unknown slug ${r.slug}`; break; }
        if (typeof r.name !== 'string' || r.name.length === 0) { bad = `empty name ${r.slug}`; break; }
        if (!Number.isInteger(r.rank) || r.rank <= 0) { bad = `bad rank ${r.slug}`; break; }
        if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) { bad = `bad implied ${r.slug}`; break; }
        if (!Array.isArray(r.farm_steps)) { bad = `no farm_steps ${r.slug}`; break; }
      }
    }
    bad ? fail('board_file', bad) : pass('board_file', `${rows.length} rows`);
  }
  {
    let bad = '';
    const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
    if (!ranks.every((v, i) => v === i + 1)) bad = 'ranks are not 1..N';
    else if (!rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1]!.implied_value_usd)) bad = 'implied rises with rank';
    else if (new Set(rows.map((r) => r.implied_value_usd)).size < 2) bad = 'all implied equal';
    bad ? fail('sorted_by_value', bad) : pass('sorted_by_value', 'ranks 1..N, non-increasing');
  }
  {
    const rowSlugs = new Set(rows.map((r) => r.slug));
    const missing = snapshot.watchlist.filter((w) => !rowSlugs.has(w));
    missing.length ? fail('coverage', `missing ${missing.join(', ')}`) : pass('coverage', `${snapshot.watchlist.length}/${snapshot.watchlist.length}`);
  }
  {
    let bad = '';
    for (const r of rows) {
      if (r.farm_steps.length < 3 || r.farm_steps.length > 12) { bad = `${r.slug}: ${r.farm_steps.length} steps`; break; }
      for (const s of r.farm_steps) {
        const t = s.trim();
        if (t.length < 20 || t.length > 600) { bad = `${r.slug}: step ${t.length} chars`; break; }
      }
      if (bad) break;
    }
    bad ? fail('farm_steps', bad) : pass('farm_steps', 'all rows 3..12 steps, 20..600 chars');
  }

  // screenshots
  {
    const dir = join(out, 'screenshots');
    const names = existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name).sort()
      : [];
    let bad = '';
    if (names.length < 3 || names.length > 4) bad = `${names.length} screenshots`;
    else {
      for (const n of names) {
        const buf = readFileSync(join(dir, n));
        if (buf.length > 512 * 1024) { bad = `${n} is ${buf.length} bytes`; break; }
        const size = pngSize(buf) ?? jpegSize(buf);
        if (!size) { bad = `${n} is not a whole PNG/JPEG`; break; }
        const [w, h] = size;
        if (Math.max(w, h) > 1440 || Math.min(w, h) < 800) { bad = `${n} is ${w}x${h}`; break; }
      }
    }
    bad ? fail('screenshots', bad) : pass('screenshots', names.map((n) => `${n} ${(readFileSync(join(dir, n)).length / 1024).toFixed(0)}KB`).join(', '));
  }

  // dossier_matches
  {
    let detail = '';
    let ok = true;
    try {
      const expected = buildDossier(out, { text_max_bytes: 65536 });
      const actual = readFileSync(join(out, 'dossier.json'));
      if (!actual.equals(Buffer.from(expected))) {
        ok = false;
        detail = `dossier.json differs (${actual.length} vs ${expected.length} bytes)`;
      } else detail = `${actual.length} bytes`;
    } catch (err) {
      ok = false;
      detail = String((err as Error).message);
    }
    ok ? pass('dossier_matches', detail) : fail('dossier_matches', detail);
  }

  let failed = 0;
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
    if (!ok) failed++;
  }
  console.log(failed === 0 ? 'gate: 7/7 pass' : `gate: ${7 - failed}/7 pass, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
