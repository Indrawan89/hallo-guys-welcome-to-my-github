# PROGRESS — GTA 6 meme for X (gta6-meme-x-01)

## Kompetisi (dibaca lengkap 21 Nov 2026, via API)
- **gta6-meme-x-01 "Post a GTA 6 meme on X"**, hadiah **$500** (juara 1 $100,
  top 50 berbagi), deadline **2026-11-23T14:00:00Z**, buka
  2026-11-19T14:00:00Z, **4.741 entry** saat dicek, `acceptingSubmissions: true`.
- Sumber: `GET /api/competitions/gta6-meme-x-01`,
  `.../requirements`, `.../quota` — ketiganya dibaca (deliverables, 56 checks,
  prerequisites, how_to_submit, readme_template).
- Kuota akun (dicek 21 Nov 2026): 0 entry dibuat, 5/hari tersisa, 10 total
  tersisa, `can_submit: true`.
- Inti: buat 1 meme GTA 6, posting dari akun X publik, serahkan URL post-nya.
  Juri AI membandingkan post dua-dua (win rate): gambar harus menunjukkan
  make.fun (maskot hantu / logo / nama), lalu kelucuan, relevansi GTA 6,
  seberapa baik post menjual make.fun, caption, orisinalitas, kebersihan gambar.
- Prerequisite: Node.js 22.18+ (mesin ini: Node v24.22.1 ✅) dan **akun X
  publik yang bisa posting gambar** — lihat BLOKIR di bawah.
- Play code (diambil via `GET /api/competitions/gta6-meme-x-01/play-code?n=0..3`;
  menurut rules code ini bukan rahasia): code 0
  `makefun-trolley-cliff-rutabaga` (dipakai di draf), code 1
  `makefun-gust-pizza-drizzle`, code 2 `makefun-isthmus-motel-foghorn`,
  code 3 `makefun-forge-sherbet-pomelo`.

## Yang dibuat (di `~/workspace/makefun/entries/gta6-meme-x-01/`, total 637 KB)

| File | Isi |
| --- | --- |
| `meme.png` (1080×1080, 394 KB) | Meme original: screenshot police-chase SOLMAR BAY (game GTA 6-style buatan kami, entry gta6-01) + teks "GTA 6 LAUNCH WEEK / ROCKSTAR: 'GTA 6 IS COMING...' / ME, ALREADY WANTED: / MY AI AGENT BUILT ME A GTA 6 — AND GOT PAID FOR IT." + maskot hantu make.fun (putih, outline hitam, mata sparkle, koin magenta berbintang) + wordmark `make.fun`. Digambar dari nol dengan Pillow. |
| `build_meme.py` | Generator meme (Python 3 + Pillow, tanpa network) dari `assets/03-police-chase.jpg`. |
| `assets/03-police-chase.jpg` (228 KB) | Screenshot sumber dari game SOLMAR BAY. |
| `POST.json` (62 byte) | **PLACEHOLDER**: `{"url":"https://x.com/PLACEHOLDER/status/0000000000000000000"}` — bentuk URL valid, tapi bukan post sungguhan. Wajib diganti setelah posting (lihat BLOKIR). |
| `POST_DRAFT.md` | Teks post persis (219 karakter, < 280): mengandung link bounty make.fun, tag `@makefunai`, play code, dan ajakan "got paid for it on make.fun". |
| `main.ts` | Entrypoint Node 22 (stdlib only): validasi POST.json (JSON object, ≤ 16384 byte, URL bentuk X post) lalu salin byte-per-byte ke `/output` (atau `$MAKEFUN_OUTPUT_DIR` lokal). |
| `README.md` | Template readme resmi: badge make.fun, owner Indrawan89, repo `makefun-gta6-meme-x-01`, referral `sh0dz3eg`. |
| `LICENSE` | MIT © 2026 Indrawan89. |

## Hasil uji lokal (21 Nov 2026)
- ✅ `python3 build_meme.py` 2× → sha256 identik
  `20d524a9ad5ee543a21b676deb7d296a026f58cd9dd4adc192c34fecd0b70191`
  (deterministik). Gambar dicek visual: teks terbaca, hantu + koin jelas,
  tidak ada teks tertutup (2 revisi layout sebelum final).
- ✅ `meme.png`: PNG 1080×1080 RGB; teks 44–64 px → tetap terbaca saat
  diperkecil ke 480×480 (batas baca juri).
- ✅ `MAKEFUN_OUTPUT_DIR=/tmp/meme_out1 node main.ts` dan run ke-2 →
  output identik byte-per-byte (`cmp` OK) dan sama dengan `POST.json` repo.
- ✅ Uji negatif: `POST.json` dengan URL `https://example.com/not-x` ditolak
  main.ts (`Error: POST.json url is not an X post address`).
- ✅ Pindai kredensial di repo: tidak ada API key / seed / private key.
- ✅ Tidak ada submit, tidak ada repo GitHub dibuat (sesuai instruksi).

## Status: BLOKIR — butuh dari user (belum SIAP PUSH untuk submit)
Repo lokal **siap secara teknis**, tapi entry TIDAK BISA disubmit sebelum:
1. **Akun X publik milik user** — Muse tidak punya akses / tidak terhubung
   ke akun X mana pun, dan tidak boleh mengarang akun/post. Yang dibutuhkan:
   nama/handle akun X publik (post tidak protected) yang dipakai posting.
2. **Posting meme** — user (atau agen dengan akses X) memposting `meme.png`
   dengan teks persis di `POST_DRAFT.md`, sebelum deadline
   2026-11-23T14:00:00Z, dari akun tersebut.
3. Setelah posting: ganti `url` di `POST.json` dengan alamat post asli,
   jalankan ulang `main.ts`, lalu push ke repo GitHub yang sudah ada,
   `Indrawan89/hallo-guys-welcome-to-my-github` — per keputusan user
   21 Nov 2026 17:00 WIB, repo terpisah `makefun-<slug>` DIBATALKAN dan
   entry make.fun memakai repo itu saja (tata letak subfolder per entry
   menunggu konfirmasi parent; badge `makefun-gta6-meme-x-01` di README.md
   masih mengikuti template resmi dan harus disesuaikan dengan nama repo
   final). Submit via kit CLI beserta transcript bundle.
4. `.makefun/owner.json` TIDAK diperlukan (owner repo = login GitHub akun,
   Indrawan89).

## Koreksi 21 Nov 17:57 WIB
- POST.json SUDAH diganti ke URL X asli https://x.com/kubilsono/status/2124093014700331196 (bersih, tanpa query param) dan main.ts dijalankan ulang — out/POST.json identik. BELUM DISUBMIT.
- KOREKSI butir 4 di atas: `.makefun/owner.json` TERNYATA WAJIB — /api/me menunjukkan github_login=null, jadi repo_owner hanya lolos bila commit yang disubmit membawa .makefun/owner.json berisi wallet 6JPeiLGNwAiVJuE5z93bTFDKudQ1TR5HkZd46bvMsg3h (sama seperti CSV).
- README badge rank/reward masih memakai repo makefun-gta6-meme-x-01 — WAJIB diganti ke Indrawan89/hallo-guys-welcome-to-my-github sebelum push.
- Repo About harus diganti ke homepage bounty meme-x + topik makefun, ai-agents, bounties, growth sebelum submit.
- Kit meme-x belum diunduh; bundle transcript WAJIB (thinking checks applies True).
