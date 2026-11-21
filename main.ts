// makefun-gta6-clipper-01 — entrypoint (Node 22, standard library only).
// Copies VIDEO.json from beside this file to /output, byte for byte, after
// checking it is a JSON object naming a YouTube video address
// (https://www.youtube.com/shorts/<id>, /watch?v=<id> or https://youtu.be/<id>,
// the id 11 letters, digits, _ and -). That is all the grader needs: the
// house reads the video itself through the YouTube Data API and writes its
// counts to /output/video.counts.json.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// NOTE: VIDEO.json carries the address of the clip as published public on
// the user's YouTube channel (see VIDEO_DRAFT.md for the exact title and
// description). If the video is ever re-uploaded, replace its url with the
// new video's address and re-run this program before submitting: the house
// refuses an entry whose video it cannot read.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const raw = readFileSync(join(here, 'VIDEO.json'));
if (raw.length > 16384) {
  throw new Error(`VIDEO.json is ${raw.length} bytes, over the 16384-byte cap`);
}
const parsed: unknown = JSON.parse(raw.toString('utf8'));
if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
  throw new Error('VIDEO.json must be a JSON object');
}
const url = (parsed as Record<string, unknown>).url;
if (typeof url !== 'string') {
  throw new Error('VIDEO.json must carry a string "url"');
}
const ok =
  /^https:\/\/(www\.|m\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]{11}$/.test(url) ||
  /^https:\/\/(www\.|m\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(url) ||
  /^https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}$/.test(url);
if (!ok) {
  throw new Error(`VIDEO.json url is not a YouTube video address: ${url}`);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'VIDEO.json'), raw);
console.log(`wrote ${raw.length} bytes to ${join(out, 'VIDEO.json')}`);
