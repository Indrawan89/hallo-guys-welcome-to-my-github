# Token-radar rebuild — progress

Rebuild selesai 24 Nov 2026 ~01:00 WIB. Folder: `entries/token-radar-01-rebuild/`.
BELUM disubmit, BELUM di-push. Entry lama tidak disentuh; starter kit tidak dibaca
(hanya library `vendor/makefun-board.ts` dan data `input/snapshot.json` yang di-cp).

## Apa yang diubah dari versi lama

- **Model diganti total.** Lama: multiple datar median mcap/TVL per kategori +
  growth weight arbitrer 0,6. Baru: fitted log-log size curve × token-odds
  (regresi logistik), ranking by implied value.
- **Dashboard ditulis ulang.** Board 198 baris (sort per kolom + filter nama /
  kategori / chain / scope), detail view per protokol (breakdown model, band
  bootstrap, 3 komparabel terdekat, farm plan), tab Methodology, tab Census 758,
  tab Research note 1 halaman, tab Live tokens (416 traded, tidak dicampur ke ranking).
- **Farm plans dinetted sampai dolar.** Tiap baris 6 langkah: modal tiered by TVL,
  total gas (16 tx × harga gas asumsi per-chain, dilabeli asumsi), durasi hold
  90 hari, nilai bersih = implied × odds − gas.
- **Sensus 758.** Semua protokol diakuntansi: 416 traded + 198 ranked +
  144 excluded beralasan (kategori terlarang 128, nama berversi 11,
  wrapped/staked 5, prefix exchange 0 — 16 nama berprefix exchange sudah
  tertangkap aturan yang lebih dulu).

## Angka fit + validasi (semua difit dari snapshot, as_of 2026-11-14)

- Size curve (n = 128 comps, mcap > 0 & TVL > 0):
  `log10(mcap) = 3.0247 + 0.5223 · log10(TVL)`, R² 0.194, RMSE 0.902,
  residual SD 0.909. Flat baseline median multiple 0.2138.
- Token odds (logistik, 758 protokol, GD lr 0.5, 2000 iterasi, deterministik):
  intercept +0.233; umur +0.708 (OR 2.03), log TVL +0.066 (OR 1.07),
  7d change −0.140 (OR 0.87); AUC 0.695. Odds baris ranked: 0.158–0.876.
- LOO: RMSE 0.915 vs flat 0.989 → kurva **1.08× lebih baik** out-of-sample.
- Time-split holdout (median listed 2024-02-18; fit 48 comps lama, uji 47 baru):
  a = 2.746, b = 0.563, holdout R² 0.015, RMSE 0.921.
- Bootstrap: B = 200, mulberry32 seed 20261124, interval 90% (p5–p95) per estimasi.
- Sensus: ranked 198 = 40 watchlist + 158 early; 60 ranked ≥ floor $50M
  (40 watchlist + 20 yang lolos aturan kami tapi bukan house list — house juga
  cek parentProtocol, field yang tidak ada di snapshot).
- Board: 198 baris (sama dengan board lama — hitungan dari data, bukan disalin).
  Top 3: Steakhouse Financial $45.289.557 · Sentora Curator $39.080.875 ·
  Veda $37.140.799. Total implied $1.044.330.242.

## Pengujian lokal

- `main.ts` dijalankan sukses **6×** (Node 24.22.1). Determinisme: 2× diff -r
  out vs out2 kosong (byte-identik).
- Simulasi 7 baris gate lokal: **semua PASS** — dashboard_files (3 file,
  24.950 byte, tanpa http/https di atribut/CSS/import), board_file (198 baris),
  sorted_by_value (rank 1..198, implied tidak naik), coverage 40/40,
  farm_steps (6 langkah/baris, 147–231 karakter), screenshots (3 JPG,
  1440×900, 325.600 / 327.026 / 337.893 byte), dossier_matches (rebuild
  dossier via buildDossier({text_max_bytes: 65536}) byte-identik).
- Cross-check independen python3: OLS (a, b, R²), LOO RMSE, flat RMSE,
  time-split (R², RMSE), bootstrap top-3 (lo/hi) — **semua sama persis**
  dengan angka TypeScript (selisih 0).
- Ketiga screenshot dibuka dan diperiksa visual: board (semua 10 kolom
  terlihat), detail rank #1 (metrik + komparabel + farm plan), filter
  Watchlist aktif (40 of 198 rows). Tab Methodology / Census / Research /
  Live juga di-screenshot dan diperiksa.
- Pindai secret: tidak ada API key / secret / seed di file entry.
- Dashboard total 24.950 byte (< 55.000 target). dossier.json 1.347.594 byte
  (≤ 1,5 MiB). board.json 497.239 byte, data.js 449.282 byte.

## Catatan alat

- `chrome --headless --screenshot` tidak menghasilkan file di build ini;
  screenshot diambil via CDP (remote-debugging-port + WebSocket Node).
  Chrome butuh policy file WebGL (`hatch-webgl-all-origins-v1` + sha256).
- JPEG 1280×800 mentok ~226 KB di kualitas 95; agar masuk 300–350 KB,
  tangkap di 1440×900 + JPEG 4:4:4 (board q92, detail q97, filtered q92).

## Prediksi rank

Naik — tapi belum tentu sampai zona 20–50. Resep ATM 20–50 sudah diwujudkan
semua (curve fitted, token odds, LOO + time-split + bootstrap tampil, farm
netted, sensus 758, research note). Yang menahan: sinyalnya jujur lemah —
R² 0,194 dan holdout time-split R² 0,015; kurva hanya 1,08× lebih baik dari
flat multiple. Itu tetap jauh lebih baik dari model lama (multiple datar
tanpa validasi sama sekali, judge 93,48%), jadi kenaikan dari ~1.540
diharapkan, tapi garis screening place 40 butuh interval high ≥ #40
(95,64%) — tidak bisa dijamin dari angka fit ini saja.
