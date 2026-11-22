// test/fuzz.mjs — differential fuzzing: solve.js vs the naive reference.
// Run: node test/fuzz.mjs [iterations]
// Two generators: (1) pure random strings over a nasty alphabet,
// (2) structured random records with quoted / broken fields.
import { run } from '../solve.js';
import { runReference } from './reference.mjs';

const ITER = Number(process.argv[2] || 3000);

// Seeded PRNG (mulberry32) so runs are reproducible.
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

const ALPHABET = ['a', 'b', '1', ',', '"', '\n', '\r', ' ', '\uFEFF', 'x', ';', '\t'];

function randomString(r, len) {
  let s = '';
  for (let k = 0; k < len; k++) s += ALPHABET[Math.floor(r() * ALPHABET.length)];
  return s;
}

function randomField(r) {
  const kind = r();
  const inner = () => {
    let s = '';
    const len = Math.floor(r() * 8);
    for (let k = 0; k < len; k++) s += 'ab12 ,'.charAt(Math.floor(r() * 7));
    return s;
  };
  if (kind < 0.45) return inner(); // plain
  if (kind < 0.65) return '"' + inner().replaceAll('"', '""') + '"'; // quoted
  if (kind < 0.75) return '"' + inner() + '"junk'; // quote junk
  if (kind < 0.82) return '"' + inner(); // unterminated
  if (kind < 0.88) return '"' + inner().replaceAll('\n', '\n') + '\n' + inner() + '"'; // multiline quoted
  if (kind < 0.94) return inner() + '\r' + inner(); // stray CR inside
  return '"' + inner() + '""' + inner() + '"'; // doubled quotes
}

function structuredText(r) {
  const lines = [];
  const nRec = 1 + Math.floor(r() * 6);
  for (let rec = 0; rec < nRec; rec++) {
    if (r() < 0.1) {
      lines.push(''); // empty line
      continue;
    }
    const nField = 1 + Math.floor(r() * 4);
    const fields = [];
    for (let f = 0; f < nField; f++) fields.push(randomField(r));
    let line = fields.join(',');
    if (r() < 0.3) line = line.replace('\n', '\r\n');
    lines.push(line);
  }
  let text = lines.join(r() < 0.5 ? '\n' : '\r\n');
  if (r() < 0.5) text += '\n';
  if (r() < 0.2) text = '\uFEFF' + text;
  return text;
}

let checked = 0;
let failed = 0;
function check(text, header, tag) {
  const input = { text, header };
  const got = run(input);
  const ref = runReference(input);
  checked++;
  if (JSON.stringify(got) !== JSON.stringify(ref)) {
    failed++;
    console.error(`MISMATCH ${tag} header=${header} text=${JSON.stringify(text)}`);
    console.error(` got: ${JSON.stringify(got)}`);
    console.error(` ref: ${JSON.stringify(ref)}`);
    if (failed > 5) {
      console.error('too many mismatches, aborting');
      process.exit(1);
    }
  }
}

const r1 = rng(12345);
for (let k = 0; k < ITER; k++) {
  const len = Math.floor(r1() * 60);
  check(randomString(r1, len), k % 2 === 0, `random#${k}`);
}
const r2 = rng(987654321);
for (let k = 0; k < ITER; k++) {
  check(structuredText(r2), k % 2 === 0, `structured#${k}`);
}
// Larger structured inputs (a few KB each).
const r3 = rng(555);
for (let k = 0; k < 60; k++) {
  let text = '';
  for (let j = 0; j < 40; j++) text += structuredText(r3) + '\n';
  check(text, k % 2 === 0, `large#${k}`);
}

console.log(`fuzz: ${checked} cases checked, ${failed} mismatches`);
process.exit(failed ? 1 : 0);
