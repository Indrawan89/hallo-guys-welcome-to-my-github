# PROGRESS — make.fun news-image-20261120

Kompetisi: **news-image-20261120** — "Sum up 20 November's world news in one image",
hadiah $250 (1st $50, 2nd $30, 3rd $15, 4th–10th $5, 11th–50th $3), deadline
**2026-11-22T00:00:00Z** (07:00 WIB 22 Nov 2026). Status saat dicek 21 Nov 2026
09:35 UTC: `acceptingSubmissions: true`, 22.457 submission. AI judge
(z-ai/glm-5.3-flash) membandingkan gambar dua-dua; 50 terbaik berbagi $250.
Spesifikasi dibaca lengkap dari `GET /api/competitions/news-image-20261120` dan
`/requirements` (21 Nov 2026): program Python 3.13 `main.py` di root repo,
stdlib only, tanpa network, menulis `/output/entry.png` (PNG/JPEG, maks 1 MiB,
maks 1024x1024 px), dua run harus menghasilkan byte identik. Repo harus dibuat
pada/setelah kompetisi dibuka (2026-11-20T00:00:00Z) dan berlisensi OSI-approved.

Koreksi tanggal: 20 November 2026 adalah hari **Jumat** (Friday), bukan Kamis —
diverifikasi dengan `date -d 2026-11-20` dan teks rules kompetisi. Gambar memakai
"FRIDAY, 20 NOVEMBER 2026".

## Berita yang dipakai (semuanya terverifikasi dari pencarian 21 Nov 2026)

| # | Headline di gambar | Sumber |
|---|---|---|
| 1 (hero) | Trump, Xi & Putin sign joint peace pledge — Shenzhen summit, "nuclear war must never be fought", tanpa pemotongan senjata mengikat / kesepakatan Ukraina atau Iran | Open Chronicle, "Global News Brief, November 20, 2026" (openchronicle.org/2026/11/20/...); KLZ Radio Daily Brief 20 Nov 2026 |
| 2 | ICJ: Myanmar guilty of genocide — putusan 19 Nov, dilaporkan 20 Nov; reparasi diperintahkan; 1 jt+ Rohingya masih mengungsi | Open Chronicle (ibid.) |
| 3 | Russia's mass barrage hits Kyiv — 400+ drone & 110 rudal, jembatan & jaringan listrik kena; 2 rudal jatuh di Polandia | Open Chronicle; Meanwhile in Ukraine, "TOP NEWS TODAY, November 20, 2026" (Patreon) |
| 4 | Anthropic's $81bn record IPO — IPO terbesar sepanjang masa, lewati SpaceX; saham dibuka 33% di atas harga penawaran | InformedClearly, "Daily News Summary – 2026-11-20"; KLZ Radio |
| 5 | Microsoft outage goes global — Microsoft 365 down 9+ jam, Outlook & Teams terganggu | InformedClearly (ibid.) |
| 6 | Haiti: 34 killed in gang crackdown — menurut polisi nasional | Open Chronicle (ibid.) |
| 7 | Cyclone Akvan hits India — landfall di pantai timur setelah evakuasi | Open Chronicle (ibid.) |
| Footer "ALSO" | EU–UK summit di Brussels; Jerman menolak kesepakatan "Yalta" baru; US cyber chief (Sean Cairncross) mundur; Taiwan menandai 2.700 akun | Open Chronicle; InformedClearly; KLZ Radio |

Tidak ada headline yang dikarang: setiap angka/klaim di gambar berasal dari
sumber di atas. Putusan ICJ tanggal 19 Nov dicantumkan sebagai berita yang
dilaporkan pada 20 Nov (rules: kejadian ATAU pertama kali dilaporkan pada 20 Nov).

## Desain

Poster gaya koran 1024x1024, "THE WORLD IN ONE DAY", masthead navy + garis emas,
panel hero Shenzhen (dengan bendera AS / Tiongkok / Rusia yang digambar),
grid 2x3 berisi 6 berita dengan kicker berwarna + angka kunci, dan footer navy
berisi berita tambahan + atribusi sumber. Semua teks besar dan terbaca agar
juri AI (yang tidak punya feed berita) bisa menilai hanya dari gambarnya.

## File yang dibuat (di `~/workspace/makefun/entries/news-image-20261120/`)

- `main.py` (223.664 byte) — program entry, **pure stdlib** (hanya `base64` +
  `os`): men-decode PNG yang di-embed dan menulis `/output/entry.png`.
  Ini sesuai rules: sandbox tanpa network & stdlib-only, dan rules secara
  eksplisit membolehkan repo yang menyimpan gambar + program yang menyalinnya.
- `entry.png` (156.306 byte, 1024x1024, RGB) — gambar hasil render, untuk
  audit/preview.
- `build_image.py` — generator gambar (Pillow + font DejaVu, hanya langkah
  build lokal; bukan bagian dari eksekusi entry). Menjalankannya me-regenerasi
  `entry.png`, lalu `main.py` harus di-regenerasi dari PNG baru.
- `README.md` — persis template `readme_template` dari requirements, dengan
  owner=`Indrawan89`, repo=`makefun-news-image-20261120`,
  referral=`sh0dz3eg`, deskripsi & run terisi.
- `LICENSE` — MIT, copyright 2026 Indrawan89.
- `PROGRESS.md` — file ini.

## Hasil uji lokal (21 Nov 2026, ~09:51 WIB)

- `python3 build_image.py` → `entry.png` 1024x1024, 156.306 byte (< 1 MiB).
- `python3 main.py` dijalankan **2x** (dengan `/output/entry.png` dihapus
  di antaranya): kedua run menghasilkan file valid PNG 1024x1024 RGB,
  `PIL.Image.verify()` lolos, dan **sha256 identik**:
  `f82ab87e2db8c821c2a319349820151cd1269b8924c924059818be872968d0cc`
  → deterministik, memenuhi syarat "both runs must write the same bytes".
- Gambar diperiksa visual 3x (setelah perbaikan): tidak ada teks terpotong /
  tumpang tindih pada versi final (perbaikan: stat "1M+ ROHINGYA DISPLACED",
  "400+ DRONES, 110 MISSILES", deck Microsoft dipersingkat, footer ALSO dibungkus
  2 baris).
- Tidak ada API key / seed phrase / private key yang dipakai atau ditampilkan
  di mana pun dalam entry ini.

## Status: SIAP PUSH, BELUM DISUBMIT

Entry selesai dan teruji lokal. **Belum disubmit** — diblokir oleh hal berikut,
dan tidak ada yang dikarang/dipalsukan:

1. **Belum ada repo GitHub publik** `Indrawan89/makefun-news-image-20261120`.
   Repo harus dibuat oleh user (atau atas instruksi user) dan berisi file-file
   di atas, lalu commit SHA-nya dipakai saat submit.
2. **GitHub App make.fun harus terinstal** di repo itu (syarat repo ownership /
   verifikasi sesuai requirements), dan submit membutuhkan transcript bundle
   dari sesi agen yang membangun entry ini + entry message yang ditandatangani
   wallet Solana yang terhubung ke akun make.fun user.
3. Deadline submit: **2026-11-22T00:00:00Z (07:00 WIB 22 Nov 2026)**.

Langkah berikut setelah repo dibuat: push file, catat commit SHA, jalankan
kit CLI make.fun (`node cli/makefun.mjs submit --competition
news-image-20261120 --repo-url https://github.com/Indrawan89/makefun-news-image-20261120
--commit <sha> --title "The World in One Day — 20 Nov 2026" --bundle <file>
--keypair <file>`), dengan repo About diisi deskripsi + homepage
`https://make.fun/bounty/news-image-20261120` + topik
`makefun,ai-agents,bounties,growth` sesuai `repo_about` di requirements.
