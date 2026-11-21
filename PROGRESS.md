# PROGRESS — sokoban-solver-01-run-20261121

Kompetisi: "Build the best Sokoban solver", $100, deadline
2026-11-23T03:00:00Z (10:00 WIB 23 Nov 2026). Skor 0–1.000.000 atas
5 instance; tiap instance 1.000 poin hanya jika pushes = P\* (1 push
lebih → < 500). Harus mengalahkan baseline house plain-astar 1.0.0.
Entry: `main.ts` di root repo, dijalankan `node /bot/main.ts` (Node 22),
baca `/input/<id>/level.txt`, tulis `/output/<id>/solution.txt`,
maks. 60 detik untuk seluruh set, deterministik, repo ≤ 1 MiB.

## Algoritma (lihat README.md untuk ringkasan)

1. **Dekomposisi room** — level generator (hallway 1 sel + 1–4 room,
   tiap room 3–4 box, 1 pintu) membuat P\* = jumlah optima room.
   Level dipecah jadi komponen lantai di luar baris hallway (baris
   player), masing-masing 1 pintu, box == goal. Sel hallway di depan
   pintu dipertahankan sebagai sel player-only agar box di sel pintu
   bisa didorong kembali ke dalam room.
2. **A\* push-optimal per room** — state = posisi box terurut +
   region player kanonis (flood fill). Heuristik admissible: assignment
   minimum box→goal dari jarak BFS (permutasi eksak untuk ≤ 4 box).
   Pruning: dead square statis (corner + segmen dinding tanpa goal dan
   tanpa jalan keluar — aturan segmen+confinement yang sound) dan
   freeze 2×2. Setiap push diekspansi ke walk terpendek player ke
   kotak pendorong, jadi output adalah string move lengkap.
3. **Stitching + replay-verify** — jalan kaki lewat hallway antar
   room (urut kolom pintu), gabung solusi room, lalu replay penuh di
   level utuh; gagal → fallback A\* level penuh → gagal → jawaban
   kosong yang valid (bukan jawaban ilegal).
4. **Determinisme** — tanpa jam/random/env; cutoff hanya berupa
   counter ekspansi deterministik (400.000/room, 1.500.000 fallback).

## Hasil uji (level buatan sendiri, `tests/gen.py`)

Generator uji meniru spek: hallway + slot 6×6, box di atas goal, 30–80
reverse pull, room dipertahankan hanya bila solver membuktikan optimum
≥ 12 push (3 box) / ≥ 14 (4 box) dari pintu. P\* = jumlah optima room.

| Set | P\* per instance | Skor | Waktu |
|-----|------------------|------|-------|
| seed 1 | i001=13, i002=18, i003=30, i004=48, i005=62 | **1.000.000 / 1.000.000** — semua instance tepat P\* push (45, 88, 108, 210, 274 move) | 0,7 dtk |
| seed 42 | i001=13, i002=14, i003=29, i004=43, i005=58 | **1.000.000 / 1.000.000** — semua instance tepat P\* push (69, 57, 103, 167, 253 move) | 0,8 dtk |

- **Determinisme:** dua run berurutan di set seed 1 menghasilkan
  `solution.txt` yang byte-identik untuk kelima instance (`cmp` OK).
- **Optimalitas terverifikasi independen:** solver dibandingkan dengan
  brute-force push-BFS Python tanpa heuristik (`/tmp/pybfs.py`, tidak
  ikut dikirim): **45/45 room cocok persis**. Perbandingan ini
  menemukan dan memperbaiki satu bug nyata (lihat bawah).
- **Edge case:**
  - Level sudah selesai → jawaban kosong (valid, solved, 0 push).
  - Level klasik kecil tanpa hallway/room → fallback A\* level penuh
    menyelesaikannya dalam 2 push (optimal).
  - Box mulai di atas sel pintu → selesai 10 push, sama dengan
    room-optimum (model BFS Python tidak bisa menangani kasus ini
    karena player-nya mulai di dalam box — keterbatasan checker
    pembanding, bukan solver).

## Bug yang ditemukan & diperbaiki saat pengujian

1. **Aturan wall-deadlock tidak sound** (`staticDead`): "run sepanjang
   dinding" memakai arah dinding, bukan tegak lurus, lalu menandai
   banyak sel hidup sebagai mati (mis. box di (6,4) yang bisa didorong
   turun ke goal (6,5)). Akibat: solver salah melaporkan room
   unsolvable (6 dari 15 room pertama). Diganti aturan
   segmen+confinement yang sound: box terkurung di segmen baris/kolom
   kontinu hanya bila segmen itu tanpa goal DAN setiap selnya punya
   dinding di satu sisi sumbu geser. Setelah perbaikan: 30/30 room
   cocok dengan BFS independen.
2. **Model subproblem room tidak menyertakan sel hallway depan pintu**:
   box di sel pintu membuat solver mengembalikan null. Sekarang room
   solve mulai dari sel hallway depan pintu (player-only, box dilarang
   masuk), jadi box di pintu bisa didorong kembali ke room.
3. **Generator uji** sempat membuat room menyentuh hallway di banyak
   sel (bukan satu pintu) dan pull yang macet saat goal menempati sel
   pintu masuk — diperbaiki (interior 6×6 + pintu di baris dinding,
   goal tidak boleh di sel entry, skor scramble = assignment-sum eksak,
   pool room lolos per slot lalu dirakit jadi instance).

## Keterbatasan

- Dekomposisi mengasumsikan layout generator (baris hallway = baris
  player, satu pintu per room). Level lain memakai fallback A\* level
  penuh — push-optimal bila selesai dalam cap ekspansi, tapi bisa
  lambat pada level besar/terbuka.
- Cap ekspansi deterministik: 400.000 per room, 1.500.000 fallback.
  Room pada set uji selesai jauh di bawah cap (waktu total < 1 dtk),
  tapi room final yang jauh lebih sulit secara teori bisa mencapai cap
  dan gagal (lalu fallback/empty).
- Heuristik assignment mengabaikan interaksi antar-box; pada room
  yang sangat padat pencarian bisa melebar. Tidak ada macro-push /
  deadlock table lanjutan (belum diperlukan pada ukuran room spek).
- Pengujian memakai generator tiruan, bukan kit resmi / practice set
  (kit tidak diunduh di sesi ini); distribusi kesulitan level final
  bisa berbeda, tapi solver membuktikan optimal pada semua room uji
  dan terverifikasi terhadap BFS independen.

## Status submit — SIAP PUSH, BELUM DISUBMIT

- Entry lengkap dan teruji lokal di
  `~/workspace/makefun/entries/sokoban-solver-01-run-20261121/`:
  `main.ts`, `LICENSE` (MIT), `README.md`, `PROGRESS.md`,
  `tests/gen.py`. Total ukuran repo di bawah 1 MiB (cek `du`).
- **Belum disubmit, dan jangan submit dari sesi ini**: submit butuh
  repo GitHub publik milik user + commit SHA. Info terbaru: akun
  GitHub user adalah **Indrawan89** (https://github.com/Indrawan89,
  id 90293074, terhubung 21 Nov 2026) dan saat dicek belum ada repo
  publik (public_repos 0). Repo publik untuk entry ini **belum dibuat**
  — perlu dibuat oleh user / atas instruksi eksplisit user, lalu entry
  di-push dan disubmit via kit (`node cli/makefun.mjs submit`).
  Jangan mengarang URL repo atau commit SHA palsu.
- **Bundle transcript tidak wajib** untuk kompetisi ini
  (`transcripts_required: false` di spek; bundle/transcripts opsional).
  Tidak ada bundle yang dibuat.
- Tidak ada API key, seed phrase, atau private key yang dipakai atau
  ditampilkan selama pengerjaan ini.
