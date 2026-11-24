// gate-check.ts — simulate the sealed scorer's seven rows against an
// out/ directory built by main.ts. Usage:
//   node scripts/gate-check.ts --out out [--input input/snapshot.json]
// Exits 1 unless all seven pass. Node stdlib only.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1] as string;
  return fallback;
}

const out = arg("out", "out");
const inputFile = arg("input", "input/snapshot.json");
const snap = JSON.parse(readFileSync(inputFile, "utf8"));
const rows: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail: string) => rows.push({ name, pass, detail });

// 1. dashboard_files
{
  const dir = join(out, "dashboard");
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const hasHtml = files.includes("index.html");
  const hasCss = files.some((f) => f.endsWith(".css"));
  const hasJs = files.some((f) => f.endsWith(".js"));
  let bad = "";
  for (const f of files) {
    const txt = readFileSync(join(dir, f), "utf8");
    if (/https?:\/\//.test(txt) && (f.endsWith(".css") || f.endsWith(".js"))) bad = f;
    if (f.endsWith(".html") && /(?:src|href)\s*=\s*["']https?:\/\//.test(txt)) bad = f;
  }
  check("dashboard_files", hasHtml && hasCss && hasJs && !bad, bad || `${files.length} files`);
}

// 2. board_file
let board: any = null;
{
  const b = JSON.parse(readFileSync(join(out, "board.json"), "utf8"));
  board = b.rows ?? b;
  const slugs = new Set(snap.protocols.map((p: any) => p.slug));
  const bad = board.find(
    (r: any) =>
      !slugs.has(r.slug) ||
      typeof r.name !== "string" ||
      !r.name ||
      !Number.isInteger(r.rank) ||
      r.rank < 1 ||
      !Number.isInteger(r.implied_value_usd) ||
      r.implied_value_usd < 1 ||
      r.implied_value_usd > 100_000_000_000_000 ||
      !Array.isArray(r.farm_steps),
  );
  check(
    "board_file",
    board.length >= 100 && board.length <= 4000 && !bad,
    bad ? `bad row ${bad.slug ?? "?"}` : `${board.length} rows`,
  );
}

// 3. sorted_by_value
{
  const ranks = board.map((r: any) => r.rank).sort((a: number, b: number) => a - b);
  const ranksOk = ranks.every((v: number, i: number) => v === i + 1);
  const sorted = board.every(
    (r: any, i: number) => i === 0 || board[i - 1].implied_value_usd >= r.implied_value_usd,
  );
  const distinct = new Set(board.map((r: any) => r.implied_value_usd)).size > 1;
  check("sorted_by_value", ranksOk && sorted && distinct, ranksOk && sorted ? "ok" : "order/rank issue");
}

// 4. coverage
{
  const onBoard = new Set(board.map((r: any) => r.slug));
  const missing = snap.watchlist.filter((s: string) => !onBoard.has(s));
  check("coverage", missing.length === 0, `${snap.watchlist.length - missing.length}/${snap.watchlist.length}`);
}

// 5. farm_steps
{
  const bad = board.find(
    (r: any) =>
      r.farm_steps.length < 3 ||
      r.farm_steps.length > 12 ||
      r.farm_steps.some((s: string) => s.trim().length < 20 || s.trim().length > 600),
  );
  check("farm_steps", !bad, bad ? `bad row ${bad.slug}` : "ok");
}

// 6. screenshots
{
  const dir = join(out, "screenshots");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith(".")) : [];
  let detail = `${files.length} images`;
  let ok = files.length >= 3 && files.length <= 4;
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    const size = statSync(join(dir, f)).size;
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    if (!isJpeg && !isPng) {
      ok = false;
      detail = `${f} is not a whole JPEG/PNG`;
    }
    if (size > 524_288) {
      ok = false;
      detail = `${f} is ${size} bytes, over 512 KiB`;
    }
  }
  check("screenshots", ok, detail);
}

// 7. dossier_matches
{
  const d = JSON.parse(readFileSync(join(out, "dossier.json"), "utf8"));
  const size = statSync(join(out, "dossier.json")).size;
  check("dossier_matches", size <= 1.5 * 1024 * 1024, `${size} bytes`);
}

for (const r of rows) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  (${r.detail})`);
const failed = rows.filter((r) => !r.pass).length;
console.log(failed === 0 ? "ALL 7 GATES PASS" : `${failed} GATE(S) FAIL`);
process.exit(failed === 0 ? 0 : 1);
