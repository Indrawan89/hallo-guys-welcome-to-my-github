// crosscheck-node.mjs — verify the page's recompute.js agrees with the
// model's numbers: re-derive every row's implied value from data.js and
// compare with the board. Node stdlib only.
// Usage: node scripts/crosscheck-node.mjs --out out
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function parseArgs(argv) {
  let out = 'out';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) out = argv[++i];
  }
  return { out };
}

const { out } = parseArgs(process.argv.slice(2));
const dataJs = readFileSync(join(out, 'data.js'), 'utf8');
const data = JSON.parse(dataJs.slice('window.TOKEN_RADAR = '.length).replace(/;\s*$/, ''));

// load recompute.js in a sandbox with a fake window
const recomputeSrc = readFileSync(join(out, 'dashboard', 'recompute.js'), 'utf8');
const sandboxWindow = {};
const fn = new Function('window', `${recomputeSrc}; return window.TOKEN_RECOMPUTE;`);
const recompute = fn(sandboxWindow);

let mismatches = 0;
let worst = 0;
for (const row of data.rows) {
  const again = recompute.recomputeRow(row, data.recompute);
  if (again.implied_value_usd !== row.implied_value_usd) {
    mismatches++;
    if (mismatches <= 5) {
      console.log(`MISMATCH ${row.slug}: recompute ${again.implied_value_usd} vs board ${row.implied_value_usd}`);
    }
  }
  worst = Math.max(worst, Math.abs(again.fitted_mcap_usd - row.fitted_mcap_usd));
}
console.log(`recompute: ${data.rows.length - mismatches}/${data.rows.length} rows match exactly`);
console.log(`worst fitted-mcap rounding gap: $${worst}`);
process.exit(mismatches === 0 ? 0 : 1);
