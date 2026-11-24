// gate-check.ts — an independent simulation of the scorer's seven gates,
// run against a built output directory. Exits non-zero if any gate fails.
// Usage: node scripts/gate-check.ts --out out
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDossier } from "../vendor/makefun-board.ts";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const outDir = arg("--out") ?? "out";
const snapPath = arg("--snapshot") ?? "input/snapshot.json";
const failures: string[] = [];
const passes: string[] = [];
function check(name: string, ok: boolean, detail: string): void {
  if (ok) passes.push(`${name}: ${detail}`);
  else failures.push(`${name}: ${detail}`);
}

const snap = JSON.parse(readFileSync(snapPath, "utf8")) as {
  protocols: { slug: string }[];
  watchlist: string[];
};

// 1. dashboard_files: <= 400 files, <= 4 MiB, no http/https in the sources.
const dashDir = join(outDir, "dashboard");
const dashFiles = readdirSync(dashDir).filter((f) => !f.startsWith("."));
let dashBytes = 0;
let httpFound = "";
for (const f of dashFiles) {
  const p = join(dashDir, f);
  dashBytes += statSync(p).size;
  const text = readFileSync(p, "utf8");
  if (text.includes("http://") || text.includes("https://")) httpFound = f;
}
check("dashboard_files", dashFiles.length <= 400 && dashBytes <= 4 * 1024 * 1024 && httpFound === "",
  `${dashFiles.length} files, ${dashBytes} bytes, http/https in: ${httpFound || "none"}`);

// 2. board_file + 3. sorted_by_value + 5. farm_steps
const board = JSON.parse(readFileSync(join(outDir, "board.json"), "utf8")) as {
  rows: { slug: string; rank: number; implied_value_usd: number; farm_steps: string[] }[];
};
const rows = board.rows;
const ranksOk = rows.every((r, i) => r.rank === i + 1);
const sortedOk = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd);
const allEqual = rows.length > 0 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd);
const stepsOk = rows.every((r) => {
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return false;
  return r.farm_steps.every((s) => {
    const t = s.trim();
    return t.length >= 20 && t.length <= 600;
  });
});
check("board_file", rows.length >= 100 && rows.length <= 4000 && ranksOk && !allEqual,
  `${rows.length} rows, ranks 1..N: ${ranksOk}, all equal: ${allEqual}`);
check("sorted_by_value", sortedOk, `implied non-increasing: ${sortedOk}`);
check("farm_steps", stepsOk, `every row 3-12 steps of 20-600 chars: ${stepsOk}`);

// 4. coverage: every watchlist slug on the board.
const boardSlugs = new Set(rows.map((r) => r.slug));
const covered = snap.watchlist.filter((s) => boardSlugs.has(s)).length;
check("coverage", covered === snap.watchlist.length,
  `${covered}/${snap.watchlist.length} watchlist slugs on the board`);

// 6. screenshots: 3-4 files, <= 512 KiB each, long side <= 1440, short >= 800.
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}
const shotsDir = join(outDir, "screenshots");
const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((f) => !f.startsWith(".")) : [];
let shotsOk = shots.length >= 3 && shots.length <= 4;
const shotDetails: string[] = [];
for (const f of shots) {
  const buf = readFileSync(join(shotsDir, f));
  const size = jpegSize(buf);
  const okSize = buf.length <= 512 * 1024;
  const okDim = size !== null && Math.max(size.w, size.h) <= 1440 && Math.min(size.w, size.h) >= 800;
  if (!okSize || !okDim) shotsOk = false;
  shotDetails.push(`${f}: ${buf.length} B, ${size ? `${size.w}x${size.h}` : "no dims"}`);
}
check("screenshots", shotsOk, `${shots.length} files — ${shotDetails.join("; ") || "none"}`);

// 7. dossier_matches: rebuild the dossier from a copy without dossier.json
//    and byte-compare with the shipped one.
const dossierPath = join(outDir, "dossier.json");
let dossierOk = false;
let dossierDetail = "missing";
if (existsSync(dossierPath)) {
  const tmp = join(outDir, ".gate-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, "dashboard"), { recursive: true });
  mkdirSync(join(tmp, "screenshots"), { recursive: true });
  for (const f of dashFiles) {
    writeFileSync(join(tmp, "dashboard", f), readFileSync(join(dashDir, f)));
  }
  for (const f of shots) {
    writeFileSync(join(tmp, "screenshots", f), readFileSync(join(shotsDir, f)));
  }
  const rebuilt = Buffer.from(buildDossier(tmp, { text_max_bytes: 65536 }));
  const shipped = readFileSync(dossierPath);
  dossierOk = rebuilt.length === shipped.length && rebuilt.equals(shipped);
  dossierDetail = `rebuilt ${rebuilt.length} B, shipped ${shipped.length} B, identical: ${dossierOk}`;
  rmSync(tmp, { recursive: true, force: true });
}
check("dossier_matches", dossierOk, dossierDetail);

console.log("GATE CHECK — " + outDir);
for (const p of passes) console.log("  PASS " + p);
for (const f of failures) console.log("  FAIL " + f);
if (failures.length > 0) {
  console.log(`${failures.length} gate(s) failed`);
  process.exit(1);
}
console.log("all 7 gates pass");
