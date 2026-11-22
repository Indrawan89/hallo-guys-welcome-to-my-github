// test/bench-wasm.mjs — benchmark the WASM transducer vs the JS -fast solver.
// Run: node test/bench-wasm.mjs
// Times (a) runJson() per case (WASM, no object graph) vs run() (-fast JS),
// (b) the full main.ts pipeline (read + JSON.parse cases + answer + write)
// for both entries on the practice set, via subprocess.
import { runJson } from '../solve.js';
import { run as runJs } from '../solve-js.js';
import { runReference } from './reference.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'eps', 'zeta', 'eta', 'theta', '12345', '98.6', 'hello world', 'x'];
function word(r) { return WORDS[Math.floor(r() * WORDS.length)]; }
function genClean(r, rows, cols) {
  const lines = [];
  lines.push(Array.from({ length: cols }, (_, k) => 'col' + k).join(','));
  for (let i = 0; i < rows; i++) {
    const f = [];
    for (let k = 0; k < cols; k++) f.push(word(r) + i);
    lines.push(f.join(','));
  }
  return lines.join('\n') + '\n';
}
function genQuoted(r, rows, cols) {
  const lines = [];
  lines.push(Array.from({ length: cols }, (_, k) => 'col' + k).join(','));
  for (let i = 0; i < rows; i++) {
    const f = [];
    for (let k = 0; k < cols; k++) {
      const w = word(r);
      if (r() < 0.5) f.push('"' + w + ', ' + word(r) + '"');
      else if (r() < 0.15) f.push('"' + w + '""quoted""' + '"');
      else f.push(w + i);
    }
    lines.push(f.join(','));
  }
  return lines.join('\n') + '\n';
}
function genBroken(r, rows, cols) {
  const lines = [];
  lines.push(Array.from({ length: cols }, (_, k) => 'col' + k).join(','));
  for (let i = 0; i < rows; i++) {
    if (r() < 0.03) { lines.push(''); continue; }
    const nF = r() < 0.1 ? cols + 2 : r() < 0.1 ? cols - 2 : cols;
    const f = [];
    for (let k = 0; k < nF; k++) {
      const roll = r();
      if (roll < 0.2) f.push('"' + word(r) + ', ' + word(r) + '"');
      else if (roll < 0.25) f.push('"' + word(r) + '"junk');
      else if (roll < 0.28) f.push(word(r) + '\r' + word(r));
      else if (roll < 0.3) f.push('"' + word(r));
      else f.push(word(r) + i);
    }
    lines.push(f.join(','));
  }
  let text = lines.join('\n');
  text = text.replaceAll('\n', () => (r() < 0.4 ? '\r\n' : '\n'));
  return text + '\n';
}

const r = rng(20261121);
const cases = [
  { name: 'clean 20k x 10', input: { text: genClean(r, 20000, 10), header: true } },
  { name: 'clean 20k x 10 (b)', input: { text: genClean(r, 20000, 10), header: true } },
  { name: 'quoted 20k x 10', input: { text: genQuoted(r, 20000, 10), header: true } },
  { name: 'quoted 15k x 10 (b)', input: { text: genQuoted(r, 15000, 10), header: true } },
  { name: 'broken 20k x 10', input: { text: genBroken(r, 20000, 10), header: true } },
  { name: 'wide 2k x 100', input: { text: genClean(r, 2000, 100), header: true } },
];
const totalBytes = cases.reduce((s, c) => s + c.input.text.length, 0);
console.log(`set: ${cases.length} cases, ${(totalBytes / 1048576).toFixed(2)} MiB total`);

// Correctness first: WASM JSON text must equal the JS answer as a value.
for (const c of cases) {
  const a = runJson(c.input);
  const b = JSON.stringify(runJs(c.input));
  const ref = JSON.stringify(runReference(c.input));
  if (JSON.stringify(JSON.parse(a)) !== b || b !== ref) {
    console.error(`MISMATCH on ${c.name}`);
    process.exit(1);
  }
}
console.log('bench set: WASM == -fast == reference on all cases');

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function time(fn, cases) {
  const ts = [];
  for (let rep = 0; rep < 7; rep++) {
    const t0 = process.hrtime.bigint();
    for (const c of cases) fn(c.input);
    const t1 = process.hrtime.bigint();
    ts.push(Number(t1 - t0) / 1e6);
  }
  return median(ts);
}
// Warm-up.
runJson(cases[0].input);
runJs(cases[0].input);

const tWasm = time((inp) => runJson(inp), cases);
const tJs = time((inp) => runJs(inp), cases);
console.log(`WASM runJson (median of 7): ${tWasm.toFixed(1)} ms`);
console.log(`-fast run() (median of 7):  ${tJs.toFixed(1)} ms`);
console.log(`speedup:                    ${(tJs / tWasm).toFixed(2)}x`);
console.log(`WASM throughput:            ${(totalBytes / 1048576 / (tWasm / 1000)).toFixed(1)} MB/s`);
for (const c of cases) {
  const med = (fn) => {
    const ts = [];
    for (let rep = 0; rep < 7; rep++) {
      const t0 = process.hrtime.bigint();
      fn(c.input);
      ts.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return median(ts);
  };
  console.log(`  ${c.name}: wasm ${med((i) => runJson(i)).toFixed(1)} ms, js ${med((i) => runJs(i)).toFixed(1)} ms`);
}

// Full main.ts pipeline on the practice set (both entries, subprocess).
const KIT = process.env.HOME + '/workspace/makefun/kits/csv-reader-speed-01-run-20261121-kit/csv-reader-speed-01-run-20261121-kit';
function pipeline(entryDir, tag) {
  const ts = [];
  for (let rep = 0; rep < 5; rep++) {
    const t0 = process.hrtime.bigint();
    execFileSync('node', ['main.ts'], {
      cwd: entryDir,
      env: {
        ...process.env,
        CSV_INPUT: KIT + '/practice/input/cases.json',
        CSV_OUTPUT: '/tmp/wasm-practice/output/answers.json',
      },
      stdio: 'ignore',
    });
    ts.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  console.log(`pipeline ${tag} (median of 5, practice set): ${median(ts).toFixed(1)} ms`);
  return median(ts);
}
const pWasm = pipeline(process.cwd(), 'WASM ');
const pJs = pipeline(process.cwd().replace('-wasm', '-fast'), '-fast');
console.log(`pipeline speedup: ${(pJs / pWasm).toFixed(2)}x`);
