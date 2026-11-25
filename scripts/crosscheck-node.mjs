// Node recompute check: dashboard/recompute.js (a classic script, loaded
// here through a vm context with a fake window) must re-derive every board
// row's implied value exactly. Usage:
//   node scripts/crosscheck-node.mjs [--out out]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'out';
const dataTxt = readFileSync(join(out, 'data.js'), 'utf8');
const prefix = 'window.TOKEN_RADAR = ';
if (!dataTxt.startsWith(prefix)) {
  process.stderr.write('crosscheck-node: data.js prefix mismatch\n');
  process.exit(1);
}
const radar = JSON.parse(dataTxt.slice(prefix.length).replace(/;\s*$/, ''));
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')).rows;
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(out, 'dashboard', 'recompute.js'), 'utf8'), sandbox);
const { recomputeBoard } = sandbox.window.RECOMPUTE;
const { matched, total, worstGap } = recomputeBoard(board, radar.model.curve.a, radar.model.curve.b);
process.stdout.write(`crosscheck-node: recompute ${matched}/${total} rows match (worst gap $${worstGap})\n`);
process.exit(matched === total ? 0 : 1);
