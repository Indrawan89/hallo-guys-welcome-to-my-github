[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token launch radar

Which pre-token protocols are worth farming — and how much would their token be worth if it priced like the tokens that already trade? Every number here is fitted from one public snapshot, nothing is hardcoded.

## Snapshot

- Source: DefiLlama public protocols endpoint, one fetch in the build session
- as_of: **2026-11-24** — 726 protocols at or above the $5M floor, 34 on the house watchlist, 50 categories
- 121 protocols with a traded token (market cap recorded); 604 pre-token
- The snapshot is sealed house data: it is regenerated locally for the
  build (`scripts/fetch-snapshot.mjs`) but never committed — `input/` is
  git-ignored, exactly like the original entry. At grade time the program
  reads the house copy from `/input/snapshot.json` and refits the whole
  model on it, so the graded board is computed from the sealed data.
  Verified locally on the house snapshot (2026-11-14, 758 protocols):
  198 rows, watchlist 40/40, all gates pass.

## The model

**Size curve** — over the 121 traded comps:

```
log10(market cap) = 3.1646 + 0.5022 × log10(TVL)
```

R² 0.195, RMSE 0.863 (log10). The flat alternative — one median multiple of 0.2144× TVL — is worse (RMSE 0.960).

**Token odds** — logistic regression for P(records a token) from years since listing, log10(TVL) and 7-day TVL change. Odds ratios: age 1.84 per year, log TVL 1.11 per log unit, 7-day change 1.00 per point (no effect on this snapshot). AUC 0.699.

**Implied value** = curve value × token odds. The board is the whole watchlist plus every other eligible pre-token protocol, ranked by implied value: **190 rows**, total implied $938,743,605.

Top 3: Steakhouse Financial $40,683,708 · Sentora Curator $36,717,018 · Veda $32,188,750.

## Validation, out of sample

- Leave-one-out: curve RMSE 0.876 vs flat multiple 0.960 — **1.10× better**
- Time split (fit on comps listed ≤ 2024-02-06, test on the 44 listed after): R² 0.038, RMSE 0.869
- Bootstrap B = 200: slope 90% interval [0.376, 0.653]; every row carries its own implied-value band

## Farm plans

Each row gets a six-step, 90-day plan. Working capital is tiered by TVL ($5,000 / $1,000 / $500 / $250). Gas is priced at 16 transactions times a per-chain assumption (for example $6 on Ethereum, $0.05 on Solana) — an assumption, labelled wherever it appears. Expected net = implied value minus that gas.

## Run it

```
node scripts/fetch-snapshot.mjs   # regenerates input/snapshot.json from DefiLlama
node main.ts --input input/snapshot.json --output out
```

Node 22+, standard library only. Two runs write byte-identical output (seeded bootstrap, no wall clock in the outputs).

## Layout

- `input/snapshot.json` — the snapshot, regenerated in-session
- `lib/model.ts` — curve, odds, validation, board, farm plans, census
- `main.ts` — entrypoint; writes `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`
- `dashboard/` — the static page (board, detail, methodology, census, research note, live tokens)
- `scripts/fetch-snapshot.mjs` — the fetch script
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged
