# PROGRESS — Lantern Twins (best-spot-the-difference-game-20261121-0451)

Status: **SIAP PUSH, BELUM DISUBMIT.** Semua file entry selesai dan teruji
secara lokal. Belum ada repo GitHub dan belum ada submit — lihat "Blokir"
di bawah. Jangan mengarang repo atau URL submit.

## Yang dibuat

Lokasi: `~/workspace/makefun/entries/best-spot-the-difference-game-20261121-0451/`

- `game/index.html` + `game/src/` (9 file JS, tanpa library, tanpa network):
  `config.js`, `random.js`, `scenes.js` (3 scene orisinal digambar prosedural
  di canvas — Lantern Market, Harbour at Dawn, Garden of Cats — masing-masing
  7 perbedaan), `world.js` (aturan: skor, streak, timer 150 dtk/scene, hint,
  penalti klik salah, timeout, menang), `render.js` (HUD + counter FOUND,
  marker lingkaran hijau bernomor di kedua panel, lensa pembesar 2x, overlay
  title/pause/level-clear/win/timeout), `input.js` (mouse + keyboard),
  `sound.js` (efek Web Audio tersintesis), `shots.js` (scene screenshot
  deterministik `?shot=start|play|harbour|win`), `main.js` (boot + loop).
- `main.ts` — Node 22, stdlib saja; menyalin `game/` + `screenshots/` ke
  `/output` (atau `$MAKEFUN_OUTPUT_DIR`) dan menulis `dossier.json` via
  `buildDossier` dari `vendor/makefun-game.ts`.
- `vendor/makefun-game.ts` — salinan kit resmi, tidak diubah (sha256
  `dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129`,
  diverifikasi identik dengan file kit).
- `screenshots/` — 4 JPG render nyata dari kode game di Chromium headless
  1280x800: `1-start.jpg` (91.274 B), `2-play.jpg` (103.600 B),
  `3-harbour.jpg` (96.164 B), `4-win.jpg` (78.468 B). Semua < 256 KiB.
- `LICENSE` (MIT, dari kit), `README.md` (template readme make.fun, owner
  Indrawan89, repo makefun-best-spot-the-difference-game-20261121-0451,
  referral sh0dz3eg), `serve.ts` (server statis lokal), `shots.json`,
  `DOSSIER.md`.

Spesifikasi dibaca lengkap dari
`https://make.fun/api/competitions/best-spot-the-difference-game-20261121-0451`
dan `.../requirements` (21 Nov 2026, 09:35 UTC; 3205 entry saat dibaca;
deadline 2026-11-21T16:51:00Z / 23:51 WIB; hadiah $50, 10 tempat @ $5).
Kit resmi diunduh dari
`https://make.fun/c/best-spot-the-difference-game-20261121-0451/kit`
(HTTP 200, 6,6 MB) — vendor BUKAN fallback palsu.

## Cara main

`node serve.ts`, buka http://localhost:8080. Klik perbedaan di gambar kiri
atau kanan; atau gerakkan crosshair dengan arrow keys lalu Enter. H = hint
(3 per scene, −50 poin), tahan klik kanan atau L = lensa pembesar, P = pause,
R = restart, M = mute, N = level berikutnya. Temukan 7 perbedaan sebelum
timer 150 detik habis; selesaikan 3 scene untuk menang. Skor: +100 per temuan
+ bonus streak, −25 klik salah, + bonus waktu per scene.

## Hasil uji (21 Nov 2026, ~09:50–10:00 WIB)

- Sintaks: `node --check` lolos untuk ke-9 file `game/src/*.js`.
- Logika (Node, tanpa DOM): 30 assertion lolos — klik semua 7 perbedaan
  level 1 → level selesai; lanjut level 2; klik salah → event + penalti −25;
  hint → −1 hint + flash; timeout pada 0 detik; menang setelah 3 scene
  (totalScore 3630); semua 21 perbedaan di dalam batas panel.
- Render: server lokal `node serve.ts --port 8081` (index 200, main.js 200),
  Chromium 131 headless `--screenshot --window-size=1280,800
  --virtual-time-budget=6000` untuk ke-4 `?shot=` — keempatnya dirender dan
  diperiksa visual: dua gambar berdampingan, marker hijau bernomor di kedua
  panel, counter "FOUND 3/7 · 4 still hidden" (play) dan "FOUND 4/7 · 3 still
  hidden" (harbour), layar judul dan layar menang terbaca. Dua cacat visual
  ditemukan dan diperbaiki lalu di-render ulang: burung di kabel pasar tak
  terlihat (stroke gelap di langit gelap → dibuat terang) dan teks
  "PASAR SENJA" kontras rendah (ditambah pita gelap) + jalan di bawah konter
  yang kosong (ditambah karung & batu).
- Referensi: `grep` tidak menemukan `http://`/`https://` di `game/` — tanpa
  network, semua asset lokal.
- main.ts deterministik: 2x run ke `/tmp/out1` dan `/tmp/out2` menghasilkan
  pohon identik (`diff -r` kosong), dossier.json sha256 sama
  (`76fd17e2ad6b45d07427ddadd7020a3ce8c7efafdacbee2c9a3bf234d33a9bfb`).
- Batas gate: game/ 10 file, 46.457 B (< 993 file / 48 MiB); index.html
  825 B (< 1 MiB); screenshot 4 file, masing-masing < 256 KiB, 1280x800
  (sisi panjang ≤ 1280, sisi pendek ≥ 480); dossier.json 541.769 B (< 1,5 MiB).

## Keterbatasan

- Screenshot diambil dengan Chromium headless via CLI + `?shot=` (bukan
  klik manual di browser interaktif); state shot diatur langsung dari state
  world yang asli, bukan autopilot bermain.
- Lensa pembesar dan suara tidak tercakup dalam screenshot statis; suara
  butuh interaksi pengguna pertama (kebijakan autoplay browser).
- Tidak ada mode mobile/touch khusus — game ditargetkan desktop browser
  sesuai spesifikasi kompetisi.

## Blokir — SIAP PUSH, BELUM DISUBMIT

Entry ini BELUM disubmit dan TIDAK BOLEH dianggap sudah disubmit. Yang masih
dibutuhkan, dan tidak bisa dibuat oleh subagent ini:

1. Repo GitHub publik milik user: `Indrawan89/makefun-best-spot-the-difference-game-20261121-0451`,
   dibuat setelah kompetisi dibuka, berisi semua file di atas.
2. GitHub App make.fun terinstal pada repo tersebut (agar submit bisa
   diverifikasi sebagai milik akun).
3. Transcript bundle (kit CLI `node cli/makefun.mjs bundle`) + submit via kit
   CLI dengan keypair Solana user — langkah ini butuh aksi user/parent agent,
   dan TIDAK PERNAH memakai/menampilkan API key, seed phrase, atau private
   key apa pun di sini.

Tidak ada repo yang dibuat, tidak ada URL submit yang dikarang.

## Koreksi 21 Nov 2026 (persiapan submit)
- Repo yang dipakai: Indrawan89/hallo-guys-welcome-to-my-github (satu repo untuk semua entry, satu entry per commit) — BUKAN repo terpisah makefun-best-spot-the-difference-game-20261121-0451 seperti tertulis di atas.
- `.makefun/owner.json` (wallet 6JPeiLGNwAiVJuE5z93bTFDKudQ1TR5HkZd46bvMsg3h) WAJIB ada di commit yang disubmit karena github_login akun make.fun null.
- Badge rank/reward README sudah diganti ke hallo-guys-welcome-to-my-github. Referral sh0dz3eg dibiarkan — itu kode referral akun sendiri (GET /api/me/referrals).
