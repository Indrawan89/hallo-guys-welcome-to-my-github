# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that ranks pre-token protocols by fitted implied value — what a
token would be worth if it priced like the tokens that already trade — and
shows how to farm each one.

## How it works

- **Size curve:** `log10(market cap) = 3.15 + 0.51·log10(TVL)`, fitted with a
  Huber-IRLS robust regression on 120 traded comps (one row per ticker).
  It beats the flat median multiple 1.10× out of sample (leave-one-out).
- **Token odds:** a logistic model on age, size and winsorized 7-day growth
  (AUC 0.719, n=617, 313 with a token). 7-day growth is winsorized to
  −50%…+100% so one explosive week cannot zero out a protocol's odds.
- **Board:** 189 rows (34 watchlist + 155 early finds), ranked by implied
  value = fitted market cap × token odds. Total implied value $879,271,001.
- **Validation:** leave-one-out, time-split holdout, walk-forward by listing
  year (1.14× pooled), per-term ablation, bootstrap B=200 per-row 90% bands.
  The page re-derives every row's implied value in the browser (189/189 match).
- **Farm plans:** 6 concrete steps per row with cost, duration, exit trigger
  and gas drag; net expected value is implied value minus gas.

## Run it

```sh
node main.ts --input input/snapshot.json --output out
```

`main.ts` reads the snapshot, refits the model at runtime, and writes
`board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json`
into the output directory. No network, Node standard library only.
The snapshot in `input/` is the sealed house data at grade time; it is
git-ignored here and never committed.

## Layout

- `main.ts` — entrypoint: gates, then writes the outputs
- `lib/model.ts` — the fit, the odds model, the board, the farm plans, the census
- `dashboard/` — the page (index.html, app.css, app.js, recompute.js)
- `scripts/` — fetch-snapshot, cross-checks (Python + Node), gate-check, screenshots
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit
- `screenshots/` — board, detail, watchlist filter
