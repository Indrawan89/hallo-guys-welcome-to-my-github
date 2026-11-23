# SOLMAR BAY — Build progress

Rebuilt from scratch in a fresh folder under a live make.fun recording
(gta6-01 strict transcripts). Every file below was written in the recorded
session, from the design brief — no old entry file was read or copied.

## Files written

- game/src/rng.js — seeded RNG (mulberry32) and helpers.
- game/src/world.js — seeded city: road grid, 8 districts, buildings, parks,
  beach, parked cars, pickups, mission places.
- game/src/audio.js — WebAudio synth: engine, siren, pickups, jingles.
- game/src/input.js — keyboard: WASD/arrows, E, Space, P, M.
- game/src/entities.js — player on foot / in car, traffic, pedestrians, police.
- game/src/missions.js — six missions with steps, timers, goons.
- game/src/render.js — city, entities, marker, HUD, minimap, title/end screens.
- game/src/shots.js — ?shot=start|play|chase|mission presets.
- game/src/main.js — loop, modes, save/load, mission side effects.
- game/index.html, main.ts, serve.ts, shots.json, LICENSE, README.md,
  DOSSIER.md, vendor/makefun-game.ts (kit copy, unchanged), .makefun/owner.json.

## Verification — 23 Nov 00:22 WIB — SEMUA LOLOS

- [x] Headless play-test (Playwright + Chromium, /tmp/gta6-shots/playtest.mjs):
  boot OK, Enter mulai game, jalan kaki, curi mobil (wanted +1, misi lanjut),
  mengemudi 430 px/dtk, misi 1 selesai (+$300), 0 error JS/console/network.
  Tiga bug ditemukan & diperbaiki selama tes: (1) tombol Enter/panah tidak
  jalan (normalisasi key), (2) payout misi tidak dibayar + wanted curi mobil
  dobel, (3) hold E tidak jalan (wasPressed vs held) + pemain pasti ketangkap
  saat membobol brankas (invulnerable saat hold + wanted direset setelah M4).
- [x] Jalur misi penuh (/tmp/gta6-shots/missiontest.mjs): keenam misi selesai
  berurutan — M1 $300, M2 $400, M3 $600, M4 $500, M5 $1.500, M6 $2.000 —
  total $5.300, layar kemenangan tampil, 0 error.
- [x] 4 screenshots 1280×800, masing-masing < 256 KiB, diverifikasi visual:
  1-start (layar judul), 2-play (mengemudi di Sunset Strip), 3-chase
  (3 bintang, polisi mengejar), 4-mission (membobol Bank Harbor Lights).
- [x] main.ts 2× → dossier.json byte-identik (sha256
  cb0b9b3f…dea0, 408.149 byte < 1,5 MiB).
- [x] makefun check --worktree: ok true, 0 failed — lolos competition_open,
  snapshot, license_osi, entrypoint. 5 cek at-submission (repo_public,
  repo_owner, repo_created_after_open, commit_in_repo, duplicate_snapshot)
  baru terjawab saat push + submit ke hallo-guys. Cek transkrip berstatus
  skip (transcripts None) karena recording belum disegel — wajar, situs
  membangun transkrip dari recording yang disegel saat submit.

## Sisa untuk parent (JANGAN saya lakukan)

1. Tulis usage row sesi ini ke ~/.makefun/muse-usage-gta6-01.jsonl.
2. Seal recording 01a205c0-8938-7000-9e95-c2b5f4979a0e (PID 13330, log
   ~/.makefun/record-gta6-01.log) — verifikasi N/N record witnessed.
3. Commit + push ke hallo-guys (repo saat ini berisi Sokoban golf3, sudah
   tersubmit — aman diganti), set About ke gta6-01 via browser.
4. Loop EVAL ke user, lalu submit --recording <id baru> + --keypair.
   Deadline 24 Nov 22:00 WIB.
