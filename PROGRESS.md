# PROGRESS — csv-reader-speed-01-run-20261121

Kompetisi: **csv-reader-speed-01-run-20261121** — "Read broken CSV files
faster", hadiah $100 (10 tempat × $10), deadline **2026-11-23T02:42:00Z**
(09:42 WIB 23 Nov 2026). Harness: program/v1, 6 kasus per set, peringkat
dari CPU time (paling kecil dulu), lolos hanya jika mengalahkan baseline
csv-reader 1.0.0 pada confidence 95%.

Status: **SELESAI DIBANGUN & TERUJI LOKAL — SIAP PUSH, BELUM DISUBMIT.**

## Yang dibuat

`~/workspace/makefun/entries/csv-reader-speed-01-run-20261121/`:

- `solve.js` — entry: ES module dependency-free, `export function run({text, header})`
  → `{columns, rows, errors}`.
- `main.ts` — driver harness (sintaks JS polos dalam file `.ts`, agar type
  stripping Node 22/24 menerimanya; mematikan V8 incremental marking
  sebelum import `solve.js`, seperti driver baseline; baca
  `/input/cases.json`, tulis `/output/answers.json`; `CSV_INPUT` /
  `CSV_OUTPUT` override path untuk uji lokal).
- `package.json` — `{"type": "module"}`.
- `LICENSE` — MIT.
- `README.md` — deskripsi entry, semantik, cara uji, hasil benchmark.
- `test/reference.mjs` — implementasi referensi naif (char-by-char) yang
  ditulis langsung dari deskripsi spesifikasi; otoritas semantik untuk
  uji diferensial.
- `test/test.mjs` — 82 edge case.
- `test/fuzz.mjs` — fuzz diferensial (string acak + record terstruktur rusak).
- `test/bench.mjs` — benchmark set skala house (6 kasus, ~11,8 MB).

Total ukuran repo: cek `du` di bawah (jauh di bawah batas 1 MiB).

## Pendekatan optimasi

1. **Fast line path** — record yang linenya tidak mengandung `"` diparse
   dengan `String.split(',')` native setelah memotong satu CRLF di akhir
   dan membuang stray CR (masing-masing dilaporkan). Ini mencakup
   sebagian besar data CSV nyata. Jalur ini ~20 ms / 2 MB (clean).
2. **General path** — hanya untuk record yang baris pertamanya mengandung
   quote (bisa multi-baris). Field dicari dengan `indexOf` + kursor peek
   monotonik untuk LF / CR berikutnya (setiap byte di-scan paling banyak
   sekali selama satu `run()`), slicing bukan copy per karakter; nilai
   quoted dirakit dengan `join()` hanya bila benar-benar mengandung
   `""` atau normalisasi CR/LF; junk setelah closing quote hanya di-scan
   bila tidak kosong (kasus umum: karakter berikutnya langsung `,`, LF,
   CRLF, atau EOF).
3. Nomor baris dijaga inkremental; line break di dalam quoted field
   dihitung lokal dan baru diterapkan setelah field dipastikan tertutup.
4. Tanpa cache antar kasus: semua state lokal di satu `run()`, jawaban
   deterministik dan independen per kasus (dua eksekusi `main.ts`
   menghasilkan byte yang identik — diverifikasi).

Iterasi: versi pertama (regex `DELIM.exec` per field + `match()` per
segmen quoted) ternyata **lebih lambat** dari referensi naif (0,61x pada
run dingin, lalu 1,43x) — regex per field lebih mahal daripada loop
`charCodeAt` yang rapat. Mengganti regex dengan `indexOf` + peek cursor
menaikkan ke 1,37–2,10x vs referensi naif.

## Hasil uji edge case

`node test/test.mjs` — **82 passed, 0 failed** (dari 82 kasus).
Mencakup: string kosong, BOM (awal & di tengah), CRLF, baris kosong,
`short_row`/`long_row` (termasuk `fields`/`extra` dan `row: null` untuk
header), quoted comma, doubled quotes, quoted LF/CRLF/lone CR, quote
junk (termasuk spasi, quote di dalam junk, di EOF, setelah multiline),
unterminated quote (di EOF, lalu koma, spanning lines + re-read,
doubled di akhir), quote literal di field unquoted, stray CR (di field,
di EOF, antar record, ganda, hanya CR), `,` / trailing comma / leading
comma, spasi & tab dipertahankan, nomor baris setelah record multiline,
stray di dalam junk, unicode/emoji, plus 21 kasus differential-only.

Dua ekspektasi tulisan tangan sempat salah dan diperbaiki setelah
diverifikasi manual (bukan bug kode): `a\r\rb` memang 2× `stray_cr`
(CR kedua diikuti `b`, bukan LF), dan `"a"x\r\nb,c` membuat lebar 1
sehingga `b,c` memang `long_row`.

## Hasil fuzz diferensial

`node test/fuzz.mjs` — **6.060 kasus: 0 mismatch**, lalu run tambahan
**16.060 kasus: 0 mismatch** (total 22.120 kasus diferensial tanpa
selisih antara `solve.js` dan referensi naif). Generator: string acak
dari alfabet `a b 1 , " \n \r space BOM x ; tab` (panjang 0–60) dan
record terstruktur acak (quoted, junk, unterminated, multiline quoted,
stray CR, doubled quotes, baris kosong, CRLF), header true/false,
plus 60 input besar (±40 record).

## Hasil benchmark

`node test/bench.mjs`, Node v24.22.1, set 6 kasus / 11,79 MiB
(clean 20k×10 ×2, quoted 20k×10, quoted 15k×10, broken 20k×10,
wide 2k×100), median 5 run atas keseluruhan set; kesamaan jawaban
dengan referensi dicek dulu pada set benchmark (lolos):

| Run | solve.js | referensi naif | Speedup |
| --- | --- | --- | --- |
| 1 | 301,1 ms | 411,9 ms | 1,37x |
| 2 | 189,6 ms | 397,5 ms | 2,10x |

Per-kasus (run 2, median 7 rep): clean 21,3 / 17,2 ms; quoted
85,3 / 66,3 ms; broken 63,2 ms; wide 12,9 ms — vs referensi naif
90,5 / 84,0 / 90,3 / 76,2 / 95,4 / 67,9 ms.

Pembanding house: house melaporkan csv-reader 1.0.0 ≈ 1,38 dtk CPU
untuk set ~11 MB. Entry ini ≈ 0,19–0,30 dtk pada skala yang sama,
**kira-kira 5–7x lebih cepat dari baseline house** — jauh di atas
ambang gate (mengalahkan baseline pada 95% confidence). Catatan:
timing VM lokal noisy (CPU shared 1,5 core, throttling) sehingga ada
rentang antar run; entry mengalahkan referensi naif di semua run.

## Uji end-to-end `main.ts`

6 kasus campuran (BOM, quoted multiline, unterminated, stray CR,
quote junk, kosong) via `CSV_INPUT`/`CSV_OUTPUT`: `node main.ts`
berjalan, dua eksekusi menghasilkan file **byte-identik**
(deterministik), dan jawaban sama persis dengan pemanggilan `run()`
langsung. (`node --check solve.js` lolos.)

## Keputusan interpretasi (tempat spesifikasi menyisakan ruang)

Kit resmi / source baseline csv-reader 1.0.0 tidak tersedia di VM ini,
jadi semantik diimplementasikan dari deskripsi kompetisi (`description`
+ `rules` di spec JSON). Keputusan yang diambil — didokumentasikan agar
bisa ditinjau — dan diimplementasikan **identik** di `solve.js` dan
referensi naif:

- `line` untuk error `short_row`/`long_row` = baris awal record
  (eksplisit di spesifikasi). Untuk error lain, `line` = baris saat
  error ditemui: `stray_cr` = baris CR-nya; `quote_junk` = baris
  closing quote; `unterminated_quote` = baris tempat quote pembuka
  berada (bukan baris EOF, karena setelah re-read sebagai unquoted,
  LF pertama di ekor menutup record dan baris-baris sesudahnya menjadi
  record baru).
- `row` untuk error di dalam record = indeks record itu di `rows`
  (`null` untuk header); stray CR di awal record (sebelum field
  pertama) memakai indeks record berikutnya; stray CR di EOF setelah
  record terakhir memakai `rows.length` (satu setelah terakhir).
- `quote_junk` dipicu sekali per field yang junk-nya tidak kosong,
  dilaporkan saat field berakhir; junk berakhir di `,` / LF / CRLF /
  EOF; lone CR di dalam junk dibuang (`stray_cr`) dan junk berlanjut.
- `unterminated_quote`: hanya terbukti di EOF (quoted field boleh
  melewati baris); nilai = `"` + ekor yang dibaca ulang sebagai
  unquoted (doubled quote tetap dua karakter, LF pertama menutup
  record).
- Baris yang hanya berisi stray CR setelah dibuang = "line left with
  no characters" → bukan record.
- `columns = null` bila tidak ada record sama sekali (termasuk
  `header: true` dengan input kosong).

## Keterbatasan

- Kebenaran vs csv-reader 1.0.0 **asli** tidak bisa diverifikasi langsung
  di sini (kit/baseline tidak ada di VM); yang diverifikasi adalah
  kesamaan `solve.js` dengan referensi naif yang ditulis dari deskripsi
  spesifikasi, pada 22.120 kasus fuzz + 82 edge case. Risiko sisa ada
  di sudut interpretasi di atas bila implementasi asli berbeda.
- Jalur umum (record ber-quote) masih ~3–4x lebih lambat dari jalur
  cepat clean; pada data yang hampir semua field-nya quoted dan
  multiline, keunggulan vs baseline menyempit (tetap jauh lebih cepat
  dari baseline house menurut angka house).
- `main.ts` memakai type stripping Node 22/24 (sintaks JS polos, tanpa
  konstruksi TypeScript) — sesuai cara harness menjalankan
  `node /bot/main.ts`; tidak diuji pada Node 22 persis (lokal: Node 24).

## Catatan submit — SIAP PUSH, BELUM DISUBMIT

- **Bundle transcript tidak wajib untuk kompetisi ini** (deliverable
  `bundle` di spec: `required: false`; transcript hanya opsional).
- **Blokir:** submit membutuhkan repo GitHub publik milik user +
  commit SHA. Saat ini tidak ada akun/repo GitHub user yang terhubung.
  Jangan mengarang repo, jangan submit URL palsu, jangan push ke repo
  bukan milik user. Entry tinggal di-push ke repo user saat repo
  tersedia, lalu submit `repo_url` + `commit_sha` via API/UI make.fun.
- Tidak ada API key / seed phrase / private key yang dipakai atau
  ditampilkan di mana pun dalam pengerjaan ini.

## Perbaikan 22 Nov 2026 — GAGAL TES di leaderboard, diperbaiki
- Leaderboard live 22 Nov 09:03 WIB: rank 6976, prize_eligible FALSE, reasons failed_tests + cost_unpriced, cases_passed 1 (dari 6).
- Akar masalah (ditemukan via practice kit 1/6 lolos): oracle (vendor csv-reader 1.0.0) mengatribusikan SEMUA error ke line record START, sementara solve.js memakai line saat ini — selisih +2/+3 pada error di record multi-baris. Juga `columns` harus `[]` (bukan null) bila header=true tanpa record. Referensi naif lokal (test/reference.mjs) punya bug yang sama, makanya 82/82 edge + 22.120 fuzz lama tidak menangkapnya.
- Perbaikan solve.js: (1) `recLine` = line awal record, dipakai untuk stray_cr / quote_junk / unterminated_quote; (2) lone CR di awal record TIDAK lagi dikonsumsi sebelum record — dibiarkan jadi bagian field pertama (unquoted), sehingga quote sesudahnya literal (sebelumnya salah membuka quoted field → unterminated_quote palsu); (3) record satu field kosong unquoted bukan record (check oracle); (4) columns `[]` untuk header tanpa record.
- Verifikasi: practice kit 6/6; edge suite 82/82; fuzz diferensial vs oracle kit 150.000 iterasi, 0 mismatch; bench set house 11,79 MiB: solve.js 328 ms vs baseline csv-reader ~1,38 dtk (~4x lebih cepat).
- README 3 badge live ke hallo-guys ✓; LICENSE ditambah SPDX-License-Identifier: MIT; owner.json wallet 6JPeiLGNwAiVJuE5z93bTFDKudQ1TR5HkZd46bvMsg3h ✓.
