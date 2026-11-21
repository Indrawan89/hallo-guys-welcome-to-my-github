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
writeFileSync(outputPath, JSON.stringify(answers));
