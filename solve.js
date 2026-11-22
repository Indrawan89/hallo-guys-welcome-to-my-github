// solve.js — WASM SIMD driver for csv-reader-speed-01-run-20261121 (Jalur B, ATM).
//
// run({ text, header }) -> { columns, rows, errors }  (same contract as the
// JS solver in solve-js.js, which stays in the repo as the fallback for
// oversized inputs and for any WASM trap).
//
// The fast path never builds an object graph: runJson() returns the answer
// JSON text straight out of WASM memory, and main.ts joins those texts.
// The transducer itself is src/transducer.ts (AssemblyScript, compiled by
// build.mjs into solver.wasm); its semantics are an exact port of
// test/reference.mjs, verified differentially against it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run as runJs } from './solve-js.js';

const wasmPath = join(dirname(fileURLToPath(import.meta.url)), 'solver.wasm');
const mod = new WebAssembly.Module(readFileSync(wasmPath));
const inst = new WebAssembly.Instance(mod, {});
const mem = inst.exports.memory;
const runWasm = inst.exports.run;
const IN_BASE = inst.exports.inBase();
const OUT_BASE = inst.exports.outBase();

// Max input the WASM layout supports (12M UTF-16 code units = 24 MiB).
// The house sets are 10–12 MB total across 6 cases, so a single case is
// far below this; anything bigger falls back to the JS solver.
const MAX_IN = 12000000;

export function runJson(input) {
  const text = input.text;
  const header = input.header ? 1 : 0;
  if (text.length > MAX_IN) return JSON.stringify(runJs(input));
  try {
    const buf = Buffer.from(mem.buffer, IN_BASE, text.length * 2);
    buf.write(text, 0, text.length * 2, 'utf16le');
    const outLen = runWasm(text.length, header);
    return Buffer.from(mem.buffer, OUT_BASE, outLen * 2).toString('utf16le');
  } catch {
    // WASM trap (e.g. a region overflow on a pathological case) — fall back
    // to the JS solver, which is always correct.
    return JSON.stringify(runJs(input));
  }
}

export function run(input) {
  try {
    return JSON.parse(runJson(input));
  } catch {
    return runJs(input);
  }
}

export default run;
