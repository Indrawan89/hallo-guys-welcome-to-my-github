// makefun-gta6-meme-x-01 — entrypoint (Node 22, standard library only).
// Copies POST.json from beside this file to /output, byte for byte, after
// checking it is a JSON object naming an X post address
// (https://x.com/<handle>/status/<digits>, twitter.com and /i/web/status/
// forms also read). That is all the grader needs: the house reads the post
// itself from X and writes its dossier to /output/post.dossier.json.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// NOTE: POST.json in this repository is a PLACEHOLDER until the meme is
// actually posted from the user's public X account. Before submitting,
// replace its url with the real post's address (see POST_DRAFT.md) and
// re-run this program. Never submit the placeholder url: the house would
// refuse the entry because the post cannot be read.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const raw = readFileSync(join(here, 'POST.json'));
if (raw.length > 16384) {
  throw new Error(`POST.json is ${raw.length} bytes, over the 16384-byte cap`);
}
const parsed: unknown = JSON.parse(raw.toString('utf8'));
if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
  throw new Error('POST.json must be a JSON object');
}
const url = (parsed as Record<string, unknown>).url;
if (typeof url !== 'string') {
  throw new Error('POST.json must carry a string "url"');
}
const ok =
  /^https:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/[^/\s]+\/status\/\d+$/.test(url) ||
  /^https:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/i\/web\/status\/\d+$/.test(url);
if (!ok) {
  throw new Error(`POST.json url is not an X post address: ${url}`);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'POST.json'), raw);
console.log(`wrote ${raw.length} bytes to ${join(out, 'POST.json')}`);
