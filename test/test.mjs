// test/test.mjs — edge-case suite for solve.js.
// Run: node test/test.mjs
// Every case is checked (a) against a hand-written expected answer where
// one is given, and (b) differentially against the naive reference.
import assert from 'node:assert/strict';
import { run } from '../solve.js';
import { runReference } from './reference.mjs';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// [name, input, expected-or-null]
const cases = [
  ['empty', { text: '', header: true }, { columns: null, rows: [], errors: [] }],
  ['empty no-header', { text: '', header: false }, { columns: null, rows: [], errors: [] }],
  ['bom only', { text: '\uFEFF', header: true }, { columns: null, rows: [], errors: [] }],
  ['basic', { text: 'a,b\n1,2\n', header: true }, { columns: ['a', 'b'], rows: [['1', '2']], errors: [] }],
  ['no trailing LF', { text: 'a,b\n1,2', header: true }, { columns: ['a', 'b'], rows: [['1', '2']], errors: [] }],
  ['bom', { text: '\uFEFFa,b\n1,2\n', header: true }, { columns: ['a', 'b'], rows: [['1', '2']], errors: [] }],
  ['bom mid-text literal', { text: 'a,\uFEFFb\n', header: false }, { columns: null, rows: [['a', '\uFEFFb']], errors: [] }],
  ['crlf', { text: 'a,b\r\n1,2\r\n', header: true }, { columns: ['a', 'b'], rows: [['1', '2']], errors: [] }],
  ['empty line skipped', { text: 'a,b\n\n1,2\n', header: true }, { columns: ['a', 'b'], rows: [['1', '2']], errors: [] }],
  ['empty lines everywhere', { text: '\n\na,b\n\n\n1,2\n\n', header: true }, { columns: ['a', 'b'], rows: [['1', '2']], errors: [] }],
  ['crlf empty line', { text: 'a,b\r\n\r\n1,2\r\n', header: true }, { columns: ['a', 'b'], rows: [['1', '2']], errors: [] }],
  ['short row', { text: 'a,b\n1\n', header: true },
    { columns: ['a', 'b'], rows: [['1', '']], errors: [{ code: 'short_row', line: 2, row: 0, fields: 1 }] }],
  ['long row', { text: 'a,b\n1,2,3\n', header: true },
    { columns: ['a', 'b'], rows: [['1', '2']], errors: [{ code: 'long_row', line: 2, row: 0, extra: ['3'] }] }],
  ['long row multi extra', { text: 'a\n1,2,3\n', header: true },
    { columns: ['a'], rows: [['1']], errors: [{ code: 'long_row', line: 2, row: 0, extra: ['2', '3'] }] }],
  ['header false short/long', { text: 'a,b\n1,2,3\n4\n', header: false },
    { columns: null, rows: [['a', 'b'], ['1', '2'], ['4', '']],
      errors: [
        { code: 'long_row', line: 2, row: 1, extra: ['3'] },
        { code: 'short_row', line: 3, row: 2, fields: 1 },
      ] }],
  ['header row null in errors', { text: '"a"x,b\n1,2\n', header: true },
    { columns: ['ax', 'b'], rows: [['1', '2']], errors: [{ code: 'quote_junk', line: 1, row: null }] }],
  ['quoted comma', { text: '"a,b",c\n"x""y",z\n', header: false },
    { columns: null, rows: [['a,b', 'c'], ['x"y', 'z']], errors: [] }],
  ['quoted empty', { text: '"",a\n', header: false }, { columns: null, rows: [['', 'a']], errors: [] }],
  ['quoted LF', { text: '"a\nb",c\n', header: false }, { columns: null, rows: [['a\nb', 'c']], errors: [] }],
  ['quoted CRLF', { text: '"a\r\nb",c\n', header: false }, { columns: null, rows: [['a\nb', 'c']], errors: [] }],
  ['quoted lone CR', { text: '"a\rb",c\n', header: false }, { columns: null, rows: [['a\nb', 'c']], errors: [] }],
  ['quoted mixed breaks', { text: '"a\r\nb\rc\nd",e\n', header: false }, { columns: null, rows: [['a\nb\nc\nd', 'e']], errors: [] }],
  ['quote junk', { text: '"a"x,c\n', header: false },
    { columns: null, rows: [['ax', 'c']], errors: [{ code: 'quote_junk', line: 1, row: 0 }] }],
  ['quote junk spaces', { text: '"a"  ,c\n', header: false },
    { columns: null, rows: [['a  ', 'c']], errors: [{ code: 'quote_junk', line: 1, row: 0 }] }],
  ['quote junk with quote', { text: '"a"b"c,d\n', header: false },
    { columns: null, rows: [['ab"c', 'd']], errors: [{ code: 'quote_junk', line: 1, row: 0 }] }],
  ['quote junk at EOF', { text: '"a"zz', header: false },
    { columns: null, rows: [['azz']], errors: [{ code: 'quote_junk', line: 1, row: 0 }] }],
  ['unterminated EOF', { text: '"a', header: false },
    { columns: null, rows: [['"a']], errors: [{ code: 'unterminated_quote', line: 1, row: 0 }] }],
  ['unterminated then comma', { text: '"a,b\n', header: false },
    { columns: null, rows: [['"a', 'b']], errors: [{ code: 'unterminated_quote', line: 1, row: 0 }] }],
  ['unterminated spanning lines re-read', { text: '"a\nb\n', header: false },
    { columns: null, rows: [['"a'], ['b']], errors: [{ code: 'unterminated_quote', line: 1, row: 0 }] }],
  ['unterminated doubled at end', { text: '"a""', header: false },
    { columns: null, rows: [['"a""']], errors: [{ code: 'unterminated_quote', line: 1, row: 0 }] }],
  ['unterminated header row null', { text: '"a\n', header: true },
    { columns: ['"a'], rows: [], errors: [{ code: 'unterminated_quote', line: 1, row: null }] }],
  ['quote in unquoted field', { text: 'a"b,c\n', header: false }, { columns: null, rows: [['a"b', 'c']], errors: [] }],
  ['lone quote field', { text: '"\n', header: false },
    { columns: null, rows: [['"']], errors: [{ code: 'unterminated_quote', line: 1, row: 0 }] }],
  ['stray cr in field', { text: 'a\rb,c\n', header: false },
    { columns: null, rows: [['ab', 'c']], errors: [{ code: 'stray_cr', line: 1, row: 0 }] }],
  ['stray cr at EOF', { text: 'a,b\r', header: false },
    { columns: null, rows: [['a', 'b']], errors: [{ code: 'stray_cr', line: 1, row: 0 }] }],
  ['stray cr between records', { text: 'a\n\rb\n', header: false },
    { columns: null, rows: [['a'], ['b']], errors: [{ code: 'stray_cr', line: 2, row: 1 }] }],
  ['stray cr double', { text: 'a\r\rb\n', header: false },
    { columns: null, rows: [['ab']], errors: [
      { code: 'stray_cr', line: 1, row: 0 },
      { code: 'stray_cr', line: 1, row: 0 },
    ] }],
  ['cr only line', { text: '\r\n', header: true }, { columns: null, rows: [], errors: [] }],
  ['only stray crs', { text: '\r\r', header: false },
    { columns: null, rows: [], errors: [
      { code: 'stray_cr', line: 1, row: 0 },
      { code: 'stray_cr', line: 1, row: 0 },
    ] }],
  ['comma only', { text: ',', header: false }, { columns: null, rows: [['', '']], errors: [] }],
  ['trailing comma', { text: 'a,\n', header: false }, { columns: null, rows: [['a', '']], errors: [] }],
  ['leading comma', { text: ',a\n', header: false }, { columns: null, rows: [['', 'a']], errors: [] }],
  ['single field', { text: 'a', header: false }, { columns: null, rows: [['a']], errors: [] }],
  ['spaces kept', { text: ' a , b \n 1 , 2 \n', header: true },
    { columns: [' a ', ' b '], rows: [[' 1 ', ' 2 ']], errors: [] }],
  ['multiline record line numbers', { text: '"a\nb",c,d\ne,f\n', header: true },
    { columns: ['a\nb', 'c', 'd'], rows: [['e', 'f', '']],
      errors: [{ code: 'short_row', line: 3, row: 0, fields: 2 }] }],
  ['short after empty lines', { text: 'a,b,c\n\n\n1,2\n', header: true },
    { columns: ['a', 'b', 'c'], rows: [['1', '2', '']],
      errors: [{ code: 'short_row', line: 4, row: 0, fields: 2 }] }],
  ['junk after multiline quote', { text: '"a\nb"zz,c\n', header: false },
    { columns: null, rows: [['a\nbzz', 'c']], errors: [{ code: 'quote_junk', line: 2, row: 0 }] }],
  ['stray inside junk', { text: '"a\nb"\rc,d\n', header: false },
    { columns: null, rows: [['a\nbc', 'd']],
      errors: [
        { code: 'stray_cr', line: 2, row: 0 },
        { code: 'quote_junk', line: 2, row: 0 },
      ] }],
  ['quoted then stray then comma', { text: '"a"\r,b\n', header: false },
    { columns: null, rows: [['a', 'b']], errors: [{ code: 'stray_cr', line: 1, row: 0 }] }],
  ['crlf inside junk ends record', { text: '"a"x\r\nb,c\n', header: false },
    { columns: null, rows: [['ax'], ['b']],
      errors: [
        { code: 'quote_junk', line: 1, row: 0 },
        { code: 'long_row', line: 2, row: 1, extra: ['c'] },
      ] }],
  ['empty quoted then junk', { text: '""x\n', header: false },
    { columns: null, rows: [['x']], errors: [{ code: 'quote_junk', line: 1, row: 0 }] }],
  ['doubled quotes only', { text: '""""\n', header: false }, { columns: null, rows: [['"']], errors: [] }],
  ['quoted crlf then short', { text: 'a,b,c\n"x\r\ny",2\n', header: true },
    { columns: ['a', 'b', 'c'], rows: [['x\ny', '2', '']],
      errors: [{ code: 'short_row', line: 2, row: 0, fields: 2 }] }],
  ['header only', { text: 'a,b,c\n', header: true }, { columns: ['a', 'b', 'c'], rows: [], errors: [] }],
  ['header only no LF', { text: 'a,b,c', header: true }, { columns: ['a', 'b', 'c'], rows: [], errors: [] }],
  ['one col rows', { text: 'h\n1\n2\n3\n', header: true }, { columns: ['h'], rows: [['1'], ['2'], ['3']], errors: [] }],
  ['crlf at EOF after record', { text: 'a\n', header: false }, { columns: null, rows: [['a']], errors: [] }],
  ['two bom', { text: '\uFEFF\uFEFFa\n', header: false }, { columns: null, rows: [['\uFEFFa']], errors: [] }],
  ['tab chars kept', { text: 'a\tb,c\n', header: false }, { columns: null, rows: [['a\tb', 'c']], errors: [] }],
  ['unicode fields', { text: 'héllo,wörld\n😀,x\n', header: true },
    { columns: ['héllo', 'wörld'], rows: [['😀', 'x']], errors: [] }],
  ['quoted unicode', { text: '"😀,x",y\n', header: false }, { columns: null, rows: [['😀,x', 'y']], errors: [] }],
  // Differential-only cases (expected = null): tricky combos, checked
  // against the naive reference only.
  ['diff: stray at record start then quote', { text: '\r"a",b\n', header: false }, null],
  ['diff: crlf junk', { text: '"a"junk\r\n"b",c\r\n', header: false }, null],
  ['diff: unterminated with quotes later', { text: '"a"b"c\n', header: false }, null],
  ['diff: quote then comma then unterminated', { text: '"ok","no\n', header: false }, null],
  ['diff: many strays', { text: 'a\r\rb\r\rc\rd\n', header: false }, null],
  ['diff: empty quoted fields', { text: '"",""\n"",x\n', header: false }, null],
  ['diff: cr at line start of data', { text: 'h1,h2\n\r1,2\n', header: true }, null],
  ['diff: quoted field is whole file', { text: '"a\nb\nc"', header: false }, null],
  ['diff: unterminated whole file', { text: '"a\nb\nc', header: false }, null],
  ['diff: junk then stray then junk', { text: '"a"x\ry,z\n', header: false }, null],
  ['diff: short row multiline header', { text: '"h\n1",h2,h3\nv1\n', header: true }, null],
  ['diff: crlf quoted junk crlf', { text: '"a"j\r\n"b"j\r\n', header: false }, null],
  ['diff: trailing comma multiline', { text: '"a\nb",\n', header: false }, null],
  ['diff: comma cr comma', { text: ',\r,\n', header: false }, null],
  ['diff: quote junk empty then comma', { text: '"a",\n', header: false }, null],
  ['diff: lone cr inside unquoted at eof', { text: 'a,b\nc\rd\r', header: false }, null],
  ['diff: bom + broken', { text: '\uFEFF"a\rb",c\r\n"d\n', header: true }, null],
  ['diff: nested doubled', { text: '"a""b""c",d\n', header: false }, null],
  ['diff: cr only inside quotes at eof', { text: '"a\r', header: false }, null],
  ['diff: quote at very end after comma', { text: 'a,"\n', header: false }, null],
  ['diff: empty record between quoted', { text: '"a"\n\n"b"\n', header: false }, null],
];

let passed = 0;
let failed = 0;
for (const [name, input, expected] of cases) {
  const got = run(input);
  const ref = runReference(input);
  try {
    assert.ok(eq(got, ref), `solve.js != reference\n got: ${JSON.stringify(got)}\n ref: ${JSON.stringify(ref)}`);
    if (expected !== null) assert.ok(eq(got, expected), `!= hand-written expected\n got: ${JSON.stringify(got)}\n exp: ${JSON.stringify(expected)}`);
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${e.message}`);
  }
}
console.log(`edge cases: ${passed} passed, ${failed} failed, ${cases.length} total`);
process.exit(failed ? 1 : 0);
