// build.mjs — rebuild solver.wasm from src/transducer.ts (AssemblyScript).
//
//   node build.mjs
//
// Toolchain: AssemblyScript 0.27.35, installed at
// ~/workspace/makefun/wasm-tools (npm i assemblyscript@0.27.35, Node 24).
// Flags: --runtime stub (tiny module, no GC), --enable simd (v128 i16x8
// lanes), --optimize, --initialMemory 2400 --maximumMemory 4096 pages
// (150 MiB fixed layout: input 1..25, recBuf 25..49, spans 49..57,
// columns 57..59, errors 59..67, output 67..147, numbuf 147 MiB).
//
// The build is deterministic: rebuilding must produce byte-identical
// solver.wasm (verified by sha256 after the build).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const asc = join(process.env.HOME, 'workspace/makefun/wasm-tools/node_modules/.bin/asc');
const src = join(dir, 'src/transducer.ts');
const out = join(dir, 'solver.wasm');

execFileSync(asc, [
  src,
  '--outFile', out,
  '--runtime', 'stub',
  '--enable', 'simd',
  '--optimize',
  '--initialMemory', '2400',
  '--maximumMemory', '4096',
], { stdio: 'inherit' });

const bytes = readFileSync(out);
const sha = createHash('sha256').update(bytes).digest('hex');
console.log(`solver.wasm: ${bytes.length} bytes, sha256 ${sha}`);
