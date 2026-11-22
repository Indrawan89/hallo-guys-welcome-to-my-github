// main.ts — harness driver for the csv-reader-speed entry.
//
// Node 22 runs `node /bot/main.ts`. This file is written in plain
// JavaScript syntax (no TypeScript-only constructs) so Node's type
// stripping accepts it as-is. It reads every case from
// /input/cases.json, answers each with run() from solve.js, and writes
// /output/answers.json.
//
// CSV_INPUT / CSV_OUTPUT may override the paths for local testing; the
// harness defaults are the spec paths.
import { setFlagsFromString } from 'node:v8';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

setFlagsFromString('--no-incremental-marking');

const { run } = await import('./solve.js');

const inputPath = process.env.CSV_INPUT || '/input/cases.json';
const outputPath = process.env.CSV_OUTPUT || '/output/answers.json';

const cases = JSON.parse(readFileSync(inputPath, 'utf8'));
const answers = cases.map((c) => run(c.input));
mkdirSync(dirname(outputPath), { recursive: true });
// Serialize the answers without a single top-level JSON.stringify: the
// native stringifier is measurably slower when it must walk the whole
// object graph (6 answer objects, each with columns/rows/errors) than
// when it is handed each flat section — columns (string[] | null), rows
// (string[][]) and errors (small objects) — separately, with the small
// skeleton assembled here. The bytes produced are identical to
// JSON.stringify(answers) (verified on the practice set), and the
// comparison is by parsed JSON values anyway, so only the values matter;
// the serializer is deterministic, so the two harness executions still
// write byte-identical outputs.
let out = '[';
for (let a = 0; a < answers.length; a++) {
  const ans = answers[a];
  out += '{"columns":' + (ans.columns === null ? 'null' : JSON.stringify(ans.columns))
    + ',"rows":' + JSON.stringify(ans.rows)
    + ',"errors":' + JSON.stringify(ans.errors) + '}';
  if (a + 1 < answers.length) out += ',';
}
out += ']';
writeFileSync(outputPath, out);
