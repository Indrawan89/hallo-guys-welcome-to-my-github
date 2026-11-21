# PROGRESS — SOLMAR BAY (gta6-01-rerecord)

Rebuild from scratch, written fresh in this session. The previous gta6-01
folders were NOT read (forbidden — they would poison thinking_reproduces).
Only the kit (RULES.txt, competition.yaml, kit.json, vendor/makefun-game.ts)
was read.

## Status: SELESAI — siap diserahkan ke koordinator (TANPA submit/push)

- [x] Kit read (RULES.txt, competition.yaml, kit.json, starter main.ts/serve.ts plumbing, vendor lib)
- [x] `game/index.html` — page + HUD + title/pause/game-over/win overlays
- [x] `game/style.css` — HUD + menu styling
- [x] `game/game.js` v1 — full game (~950 lines): city gen, 8 districts, 6 missions, wanted 0–5, traffic/ped/cop AI, combat, pickups, HUD, minimap, save, sound, shot mode
- [x] `game/game.js` revisi 1 — beach coords fix, mission-3 stash counting fix (only `stash` kind counts)
- [x] `game/game.js` revisi 2 — fixed 1280×800 render buffer, removed dead var, fixed chase-shot wanted ordering, painted city frame behind BUSTED shot
- [x] `game/game.js` revisi 3 — BUSTED arrest mechanic (caught on foot at wanted 2+)
- [x] `game/game.js` revisi 4 — dialog dedup ("RAY: RAY:"), canvas CSS 100%, missionsDone koheren di shot play/chase
- [x] `game/game.js` revisi 5 — BUG BESAR: ground fill kamera-relatif (sebelumnya area jauh dari (0,0) transparan/gelap)
- [x] `main.ts` v1 — deterministic dossier entrypoint with screenshot validation
- [x] `main.ts` revisi 1–3 — guard jumlah file game/ (993), guard index.html (1 MiB), log ringkasan output
- [x] `DOSSIER.md` revisi 1–3 — daftar shot, known limits, angka verifikasi nyata
- [x] `serve.ts` v1 — static server
- [x] `shots.json` — 4 shots (title/play/chase/busted)
- [x] `.makefun/owner.json` — wallet 6JPeiLGNwAiVJuE5z93bTFDKudQ1TR5HkZd46bvMsg3h
- [x] `LICENSE` — MIT + SPDX line
- [x] `README.md` v1 + revisi badge rank
- [x] Uji jalan: serve + headless Chromium, HTTP 200 semua file, tidak ada error JS fatal; DOM terkonfirmasi (misi + distrik ter-render)
- [x] 4 screenshot JPG 1280×800, masing-masing < 256 KiB (88.626 / 114.773 / 125.177 / 83.961 B)
- [x] Determinisme: 2× `node main.ts`, diff -r bersih, dossier.json sha256 identik 547399d0…
- [x] Vendor sha256 identik kit (dc671875…); tidak ada referensi eksternal di game/
- [x] Server lokal dimatikan setelah pengujian

## Hasil uji (angka)

- game.js: 1.100 baris, 52.846 byte; index.html 3.416 byte; style.css 5.355 byte
- Dossier: 614.014 byte, sha256 547399d0310c9ae1528e9a05637651799802817750de88272c798dc20368e3fc
- Screenshots: 1-title.jpg 88.626 B, 2-play.jpg 114.773 B, 3-chase.jpg 125.177 B, 4-busted.jpg 83.961 B — semua 1280×800 JPEG

## Rules for this build

- JANGAN submit, JANGAN push, JANGAN hentikan recording. (Dipatuhi — tidak ada yang dilakukan.)
- Jangan tulis file di luar folder ini (kecuali /tmp scratch). (Dipatuhi — screenshot mentah + out1/out2 di /tmp.)
- Setiap file kunci direvisi ≥2× dengan perubahan isi sungguhan. (game.js 5× revisi, main.ts 3×, DOSSIER.md 3×.)

## Rules for this build

- JANGAN submit, JANGAN push, JANGAN hentikan recording.
- Jangan tulis file di luar folder ini (kecuali /tmp scratch).
- Setiap file kunci direvisi ≥2× dengan perubahan isi sungguhan.
