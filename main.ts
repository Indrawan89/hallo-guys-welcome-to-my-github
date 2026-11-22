// main.ts — harness driver for the csv-reader-speed entry (WASM SIMD, Jalur B).
//
// Node 22 runs `node /bot/main.ts`. This file is written in plain
// JavaScript syntax (no TypeScript-only constructs) so Node's type
// stripping accepts it as-is. It reads every case from
// /input/cases.json, answers each with the WASM transducer (runJson from
// solve.js), and writes /output/answers.json.
//
// The answers are never parsed or re-stringified here: each case's answer
// JSON text comes straight out of WASM memory and is joined into the
// output array. The comparison is by parsed JSON values anyway, and the
// transducer is deterministic, so the two harness executions still write
// byte-identical outputs.
//
// CSV_INPUT / CSV_OUTPUT may override the paths for local testing; the
// harness defaults are the spec paths.
import { setFlagsFromString } from 'node:v8';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

setFlagsFromString('--no-incremental-marking');

const { runJson } = await import('./solve.js');

// The harness mounts the input/output at /input and /output in its docker
// sandbox; its process driver (grade-local) instead exposes them through
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR. CSV_INPUT / CSV_OUTPUT override
// both, for local testing.
const inputPath = process.env.CSV_INPUT || join(process.env.MAKEFUN_INPUT_DIR ?? '/input', 'cases.json');
const outputPath = process.env.CSV_OUTPUT || join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'answers.json');

const cases = JSON.parse(readFileSync(inputPath, 'utf8'));
let out = '[';
for (let a = 0; a < cases.length; a++) {
  out += runJson(cases[a].input);
  if (a + 1 < cases.length) out += ',';
}
out += ']';
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, out);
