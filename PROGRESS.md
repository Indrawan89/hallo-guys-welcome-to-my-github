# PROGRESS — token-radar-01 "Build the best token launch radar"

Status: **SIAP PUSH, BELUM DISUBMIT.** Entry selesai dan teruji lokal. Tidak ada repo
GitHub yang dibuat dan tidak ada submission yang dikirim — keduanya butuh tindakan
user (lihat "Blokir" di bawah).

- Kompetisi: `token-radar-01`, hadiah $1.325 (juara 1 $1.000), deadline 2026-12-14T10:00:00Z.
- Spesifikasi dibaca lengkap dari `GET /api/competitions/token-radar-01`,
  `/requirements`, dan kit resmi (`/c/token-radar-01/kit`, bundle sha256
  `ea1c9dcc…`) termasuk `RULES.txt`, `competition.yaml`, starter, dan
  `input/snapshot.json` (758 protokol DefiLlama, snapshot 2026-11-14, floor $50M,
  watchlist 40 protokol).

## Apa yang dibuat

Lokasi: `~/workspace/makefun/entries/token-radar-01/` (calon isi repo publik).

| File | Isi |
|---|---|
| `main.ts` | Entrypoint Node 22 (stdlib saja). Baca snapshot dari `/input/snapshot.json` (atau `--input`), tulis `board.json`, `data.js`, salin `dashboard/` + `screenshots/`, tulis `dossier.json` via `buildDossier`. Deterministik. |
| `lib/model.ts` | **Model comparables (asli, bukan starter):** implied value = TVL × median(mcap/TVL) token live di kategori yang sama (min 3 komparabel, else median global; clamp 0,05–1,00) × pertumbuhan 7d × maturitas (lama tanpa token) × breadth chain. Aturan rankable = aturan watchlist house yang diputar ulang dari 10 field snapshot (tanpa `parentProtocol`, yang memang tidak ada di snapshot). Farm plan 6 langkah per protokol, diturunkan dari kategori/chain/TVL/umur — tanpa daftar nama hardcoded. |
| `vendor/makefun-board.ts` | Library dossier dari kit, byte-for-byte (sha256 `9ca51b6e…`, sama dengan manifest kit). |
| `dashboard/index.html`, `app.css`, `app.js` | Dashboard statis tanpa network (27.762 byte total): board 198 baris yang bisa di-sort, filter (cari, kategori, chain, scope All/Watchlist/Early finds), detail view per protokol (cara kerja model, komparabel live, farm plan 6 langkah + biaya/waktu), tab Live tokens (24, harga pasar — tidak dicampur ke ranking), tab metodologi (rumus + tabel multiple per kategori). State di URL (`?detail=`, `?scope=`, `?cat=` …) sehingga tiap view adalah link. |
| `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png` | Screenshot asli dashboard ini (Chromium headless): board 1280×800, detail Steakhouse Financial 1280×1250, filtered Watchlist 1280×800. |
| `LICENSE` | MIT. |
| `README.md` | Singkat + badge make.fun (lihat blokir: `OWNER/REPO` masih placeholder). |
| `.gitignore` | `input/`, `out/`, `node_modules/`. |
| `input/snapshot.json` | Salinan lokal snapshot tersegel, hanya untuk uji dev (git-ignored, bukan bagian entry). |
| `out/` | Hasil run lokal terakhir (git-ignored): `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`. |

Board: **198 baris** — seluruh 40 watchlist + 158 early finds di bawah floor $50M
yang lolos aturan yang sama. Top 3: #1 Steakhouse Financial $652.539.962,
#2 Sentora Curator $608.535.708, #3 Gauntlet $391.639.194. Total implied value
board $4,65 miliar. Farm steps 129–211 karakter (batas gate 20–600).

## Hasil uji (lokal, 21 Nov 2026)

- `MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json` (Node v24.22.1):
  sukses — "758 protocols, 40 on the watchlist, 198 rows scored (158 early,
  24 live set aside)".
- **Determinisme:** dua run ke direktori berbeda → `diff -r` identik byte-per-byte.
- **Simulasi 7 baris gate scorer: 7/7 PASS** — `dashboard_files` (3 file,
  27.762 byte, tanpa alamat http(s) apa pun di source), `board_file` (198 baris,
  0 slug inventaris), `sorted_by_value` (rank 1..198, implied tidak naik,
  tidak semua sama), `coverage` (40/40 watchlist), `farm_steps` (6 langkah/baris,
  semua dalam batas), `screenshots` (3 PNG, 117–177 KB ≤ 512 KiB, sisi panjang
  ≤ 1440, sisi pendek ≥ 800), `dossier_matches` (dossier hasil rebuild identik
  byte-per-byte, 627.949 byte ≤ 1,5 MiB, teks 28.028 byte ≤ 65.536).
- **Visual:** ketiga screenshot dibuka dan diperiksa — board, detail (model
  working + komparabel + farm plan), dan filtered (Watchlist aktif, "40 of 198")
  semuanya ter-render dengan data benar. Tab Live tokens dan How the model works
  juga dicek render via DOM dump.
- **Secret scan:** tidak ada API key / private key / seed di file entry.

## Keterbatasan / catatan

- Model memakai median global bila kategori punya < 3 token live (mis. Risk
  Curators hanya punya 1 komparabel live, Api3) — dijelaskan di dashboard.
- "Records no token" ≠ "tidak punya token": snapshot DefiLlama bisa tidak mencatat
  token yang ada; dashboard menyatakan caveat ini.
- Entry ini **bukan** starter yang disalin: `main.ts`, `lib/model.ts`, dan dashboard
  ditulis baru di sesi ini (model comparables + UI berbeda dari starter). Hanya
  `vendor/makefun-board.ts` yang disalin dari kit, sesuai instruksi kit.
- Tidak ada pengujian terhadap grader server (grade-local butuh kit CLI + tidak
  dijalankan di sini); simulasi gate di atas adalah re-implementasi lokal dari
  7 baris yang dijelaskan di RULES.txt.

## Blokir — SIAP PUSH tapi BELUM DISUBMIT

1. **Repo GitHub publik milik user belum ada.** Entry ini belum di-push ke mana pun.
   Saat repo dibuat (harus dibuat *setelah* kompetisi dibuka, 14 Nov 2026 — repo
   baru memenuhi syarat), isi direktori ini yang di-push. Jangan mengarang URL repo.
2. **README.md masih berisi placeholder `OWNER/REPO`** pada badge rank/reward —
   ganti dengan `owner/repo` asli saat repo dibuat (juga About repo + topik sesuai
   template di requirements).
3. **GitHub App make.fun harus terinstal** di repo/organisasi sebelum submit
   (prasyarat submit; belum diverifikasi di sini).
4. **Transkrip + bundle submit-time:** submission butuh transcript bundle
   (`node cli/makefun.mjs bundle` dari kit) dan entry message yang ditandatangani
   wallet Solana user — dibuat pada saat submit oleh parent agent, bukan sekarang.
5. Jangan submit sebelum 1–4 di atas beres. Kuota: maks 5 submit/hari, 10 total;
   submit terakhir sebelum deadline adalah entry final.
