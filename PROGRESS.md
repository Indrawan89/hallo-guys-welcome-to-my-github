# PROGRESS — GTA 6 clipper (gta6-clipper-01)

## Kompetisi (dibaca lengkap 21 Nov 2026, via API)
- **gta6-clipper-01 "Clip GTA 6 for the most YouTube views"**, hadiah
  **$500** (juara 1 $100, top 20 berbagi), deadline **2026-11-23T01:00:00Z**,
  buka 2026-11-20T01:00:00Z, **1.779 entry** saat dicek,
  `acceptingSubmissions: true`.
- Sumber: `GET /api/competitions/gta6-clipper-01`,
  `.../requirements`, `.../quota` — ketiganya dibaca (deliverables, 56 checks,
  prerequisites, how_to_submit, readme_template).
- Kuota akun (dicek 21 Nov 2026): 0 entry dibuat, 5/hari tersisa, 10 total
  tersisa, `can_submit: true`.
- Inti: potong momen GTA 6 jadi klip vertikal pendek yang memancing penonton
  lalu mem-pitch make.fun (teks di layar / suara), upload sebagai video
  publik YouTube, serahkan URL-nya. **Peringkat murni dari jumlah views**
  saat deadline (YouTube Data API) — 20 teratas berbagi $500. Deskripsi
  wajib memuat baris persis `Made by my AI agent for a $500 bounty on
  make.fun, where you can earn money making clips with AI:
  https://make.fun/bounty/gta6-clipper-01` + satu play code.
- Prerequisite: Node.js 22.18+ (mesin ini: Node v24.22.1 ✅), ffmpeg ✅
  (8.1.2), dan **channel YouTube yang bisa publish video publik** — lihat
  BLOKIR di bawah.
- Play code (diambil via `GET /api/competitions/gta6-clipper-01/play-code?n=0..3`;
  menurut rules code ini bukan rahasia): code 0
  `makefun-wombat-cinnamon-cushion` (dipakai di draf), code 1
  `makefun-magnet-highland-cradle`, code 2
  `makefun-hickory-atrium-barnyard`, code 3 `makefun-broom-maraca-seagull`.
- Kejujuran footage: TIDAK ada footage Rockstar/GTA 6 asli yang tersedia di
  mesin ini. Klip dipotong dari SOLMAR BAY — game GTA 6-style buatan kami
  sendiri (entry gta6-01). Klip mengatakannya terus terang di layar
  ("SO IT BUILT ITS OWN GTA 6 — SOLMAR BAY") dan di draf deskripsi.

## Yang dibuat (di `~/workspace/makefun/entries/gta6-clipper-01/`, total 5,6 MB)

| File | Isi |
| --- | --- |
| `clip.mp4` (4,6 MB) | Klip vertikal 1080×1920, 30 dtk, H.264 30 fps, tanpa audio. 4 scene × 6 dtk (title screen, driving downtown, police chase, harbor heist) dengan slow pan horizontal + fade, teks hook di layar, lalu end card 6 dtk: "MAKE CLIPS LIKE THIS WITH AI AND EARN REAL MONEY ON make.fun" + `make.fun/bounty/gta6-clipper-01`. |
| `build_clip.sh` | Script rebuild `clip.mp4` dari `assets/` (ffmpeg 2 pass: potong/pan/concat, lalu burn-in teks). |
| `assets/` (4 JPG, 804 KB) | Screenshot SOLMAR BAY sumber klip. |
| `VIDEO.json` (52 byte) | **URL ASLI 21 Nov 18:13 WIB**: `{"url":"https://www.youtube.com/shorts/Hgc-abndFMs"}` — Short dari channel YouTube user, deskripsi terverifikasi cocok kata per kata dengan VIDEO_DRAFT.md (termasuk play code makefun-wombat-cinnamon-cushion) via browser.open halaman YouTube. Uji ulang main.ts: out/VIDEO.json IDENTIK. |
| `VIDEO_DRAFT.md` | Judul + deskripsi persis (baris wajib word-for-word + play code + penjelasan footage SOLMAR BAY) + tag saran + langkah setelah upload. |
| `main.ts` | Entrypoint Node 22 (stdlib only): validasi VIDEO.json (JSON object, ≤ 16384 byte, URL bentuk video YouTube) lalu salin byte-per-byte ke `/output` (atau `$MAKEFUN_OUTPUT_DIR` lokal). |
| `README.md` | Template readme resmi: badge make.fun, owner Indrawan89, repo `makefun-gta6-clipper-01`, referral `sh0dz3eg`. |
| `LICENSE` | MIT © 2026 Indrawan89. |

## Hasil uji lokal (21 Nov 2026)
- ✅ `ffprobe clip.mp4`: H.264, 1080×1920, 30 fps, durasi 30,000 dtk,
  900 frame, 4.809.881 byte.
- ✅ `ffmpeg -i clip.mp4 -f null -`: decode penuh tanpa error.
- ✅ Frame di t=3/9/15/21/27 diekstrak dan dicek visual (contact sheet):
  teks hook terbaca, pan berjalan, end card pitch make.fun jelas.
- ✅ `MAKEFUN_OUTPUT_DIR=/tmp/clip_out1 node main.ts` dan run ke-2 →
  output identik byte-per-byte (`cmp` OK) dan sama dengan `VIDEO.json` repo.
- ✅ Uji negatif: `VIDEO.json` dengan URL `https://example.com/watch?v=123`
  ditolak main.ts (`Error: VIDEO.json url is not a YouTube video address`).
- ✅ Pindai kredensial di repo: tidak ada API key / seed / private key.
- ✅ Tidak ada submit, tidak ada repo GitHub dibuat (sesuai instruksi).

## Status: BLOKIR — butuh dari user (belum SIAP PUSH untuk submit)
Repo lokal **siap secara teknis**, tapi entry TIDAK BISA disubmit sebelum:
1. **Channel YouTube milik user** — Muse tidak punya akses / tidak terhubung
   ke channel YouTube mana pun, dan tidak boleh mengarang channel/upload.
   Yang dibutuhkan: channel YouTube yang bisa publish video publik.
2. **Upload klip** — user (atau agen dengan akses YouTube) mengupload
   `clip.mp4` sebagai video **publik** (Short) dengan judul + deskripsi
   persis di `VIDEO_DRAFT.md`, sebelum deadline 2026-11-23T01:00:00Z.
3. Setelah upload: ganti `url` di `VIDEO.json` dengan alamat video asli
   (Share link), jalankan ulang `main.ts`, lalu push ke repo GitHub yang
   sudah ada, `Indrawan89/hallo-guys-welcome-to-my-github` — per keputusan
   user 21 Nov 2026 17:00 WIB, repo terpisah `makefun-<slug>` DIBATALKAN
   dan entry make.fun memakai repo itu saja (tata letak subfolder per entry
   menunggu konfirmasi parent; badge `makefun-gta6-clipper-01` di README.md
   masih mengikuti template resmi dan harus disesuaikan dengan nama repo
   final). Submit via kit CLI beserta transcript bundle.
4. `.makefun/owner.json` WAJIB ada di commit yang disubmit (KOREKSI 21 Nov 18:13 WIB — butir ini sebelumnya salah): akun make.fun github_login=null, jadi owner.json berisi wallet 6JPeiLGNwAiVJuE5z93bTFDKudQ1TR5HkZd46bvMsg3h wajib disertakan, sama seperti CSV/Sokoban. (README badge rank/reward juga masih memakai Indrawan89/makefun-gta6-clipper-01 — WAJIB diganti ke Indrawan89/hallo-guys-welcome-to-my-github sebelum push.)
5. Catatan peringkat: karena peringkat murni dari views, video perlu
   dipromosikan/ditonton setelah upload — views 0 tidak masuk 20 besar.
