// crosscheck-node.mjs — verify the page-side formula in
// dashboard/recompute.js agrees with lib/model.ts on every board row.
// Run: node scripts/crosscheck-node.mjs --input input/snapshot.json
// Reads the fitted board from out/board.json + out/data.js and re-derives
// each row's implied value through recompute.js. Exits non-zero on any
// mismatch. Node stdlib only.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const inputArg = args[args.indexOf("--input") + 1] ?? "input/snapshot.json";
const boardPath = args[args.indexOf("--board") + 1] ?? "out/board.json";
const dataPath = args[args.indexOf("--data") + 1] ?? "out/data.js";

// Load recompute.js in a tiny sandbox: it only sets window.Recompute.
const window = {};
const src = readFileSync("dashboard/recompute.js", "utf8");
new Function("window", src)(window);
const recompute = window.Recompute.implied;

// Load data.js the same way: it only sets window.RADAR.
const window2 = {};
new Function("window", readFileSync(dataPath, "utf8"))(window2);
const data = window2.RADAR;

const board = JSON.parse(readFileSync(boardPath, "utf8")).rows;
const bySlug = new Map(data.rows.map((r) => [r.slug, r]));

let mismatches = 0;
for (const brow of board) {
  const drow = bySlug.get(brow.slug);
  if (!drow) {
    console.log(`MISSING in data.js: ${brow.slug}`);
    mismatches++;
    continue;
  }
  const again = recompute(data.coef, data.oddsCoef, drow);
  if (again.implied !== brow.implied_value_usd) {
    console.log(`MISMATCH ${brow.slug}: board ${brow.implied_value_usd} vs recompute ${again.implied}`);
    mismatches++;
  }
  if (again.implied !== drow.implied) {
    console.log(`MISMATCH data.js ${brow.slug}: data ${drow.implied} vs recompute ${again.implied}`);
    mismatches++;
  }
}
console.log(`recompute check: ${board.length - mismatches}/${board.length} rows agree`);
if (mismatches > 0) process.exit(1);
