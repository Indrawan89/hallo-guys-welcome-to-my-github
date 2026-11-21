// test/bench.mjs — benchmark solve.js vs the naive reference on
// house-scale inputs (6 cases, ~11 MB total, like the house's drawn sets:
// 10.2–11.8 MB per set). Run: node test/bench.mjs
// Times run() only (no JSON I/O), warm-up + 5 timed reps, median reported.
import { run } from '../solve.js';
import { runReference } from './reference.mjs';

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
function word(r) {
  return WORDS[Math.floor(r() * WORDS.length)];
}

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
    if (r() < 0.03) {
      lines.push('');
      continue;
    }
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
    lines.push(f.join(r() < 0.3 ? ',' : ','));
    if (r() < 0.3) lines[lines.length - 1] += '';
  }
  let text = lines.join('\n');
  // Sprinkle CRLF endings.
  text = text.replaceAll('\n', () => (r() < 0.4 ? '\r\n' : '\n'));
  return text + '\n';
}

function genWide(r, rows, cols) {
  return genClean(r, rows, cols);
}

const r = rng(20261121);
const cases = [
  { name: 'clean 20k x 10', input: { text: genClean(r, 20000, 10), header: true } },
  { name: 'clean 20k x 10 (b)', input: { text: genClean(r, 20000, 10), header: true } },
  { name: 'quoted 20k x 10', input: { text: genQuoted(r, 20000, 10), header: true } },
  { name: 'quoted 15k x 10 (b)', input: { text: genQuoted(r, 15000, 10), header: true } },
  { name: 'broken 20k x 10', input: { text: genBroken(r, 20000, 10), header: true } },
  { name: 'wide 2k x 100', input: { text: genWide(r, 2000, 100), header: true } },
];
const totalBytes = cases.reduce((s, c) => s + c.input.text.length, 0);
console.log(`set: ${cases.length} cases, ${(totalBytes / 1048576).toFixed(2)} MiB total`);

// Correctness on the bench set first (solve vs reference must agree).
for (const c of cases) {
  const a = JSON.stringify(run(c.input));
  const b = JSON.stringify(runReference(c.input));
  if (a !== b) {
    console.error(`BENCH SET MISMATCH on ${c.name}`);
    process.exit(1);
  }
}
console.log('bench set: solve.js == reference on all cases');

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function time(fn, cases) {
  const ts = [];
  for (let rep = 0; rep < 5; rep++) {
    const t0 = process.hrtime.bigint();
    for (const c of cases) fn(c.input);
    const t1 = process.hrtime.bigint();
    ts.push(Number(t1 - t0) / 1e6);
  }
  return median(ts);
}

// Warm-up.
run(cases[0].input);
runReference(cases[0].input);

const tFast = time(run, cases);
const tRef = time(runReference, cases);
console.log(`solve.js (median of 5 runs over the set): ${tFast.toFixed(1)} ms`);
console.log(`naive reference (median):                  ${tRef.toFixed(1)} ms`);
console.log(`speedup vs naive reference:                 ${(tRef / tFast).toFixed(2)}x`);
console.log(`solve.js throughput:                        ${(totalBytes / 1048576 / (tFast / 1000)).toFixed(1)} MB/s`);
console.log(`reference throughput:                       ${(totalBytes / 1048576 / (tRef / 1000)).toFixed(1)} MB/s`);

// Per-case breakdown for solve.js and the reference.
for (const c of cases) {
  const med1 = (fn) => {
    const ts = [];
    for (let rep = 0; rep < 7; rep++) {
      const t0 = process.hrtime.bigint();
      fn(c.input);
      ts.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return median(ts);
  };
  console.log(`  ${c.name}: ${(c.input.text.length / 1024).toFixed(0)} KiB -> solve ${med1(run).toFixed(1)} ms, ref ${med1(runReference).toFixed(1)} ms`);
}
