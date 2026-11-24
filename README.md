# Token Radar — Pre-Token DeFi Value Model

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for pre-token DeFi protocols, fitted on the sealed snapshot (758 protocols, as of 2026-11-14, DefiLlama). It ranks 198 pre-token protocols — the full 40-protocol watchlist plus 158 early finds — by implied value, and shows how to farm each one, costed to the dollar.

## Model (all fitted from the snapshot, nothing hardcoded)

1. **Fitted log-log size curve.** On the 128 traded protocols with mcap > 0 and TVL > 0, OLS gives `log10(mcap) = 3.0247 + 0.5223 · log10(TVL)`, R² 0.194, in-sample RMSE 0.902 log10 units. A protocol's curve value is 10^(a + b·log10(TVL)).
2. **Token-odds model.** Logistic regression on all 758 protocols (y = 1 when the snapshot records a token). Standardised coefficients: age +0.708 (odds ratio 2.03), log TVL +0.066 (OR 1.07), 7-day change −0.140 (OR 0.87); intercept +0.233; AUC 0.695. Token odds is a fitted score, not a prediction of when a token launches.
3. **Implied value** = curve value × token odds, ranked descending, ties by slug. Top row: Steakhouse Financial, $45,289,557. Total implied value across the board: $1,044,330,242.

## Validation (shown in the dashboard, limits included)

- **Leave-one-out:** LOO RMSE 0.915 vs 0.989 for the flat median multiple — the curve is 1.08× better out of sample.
- **Time-split holdout:** fit on 48 older comps (listed ≤ 2024-02-18), tested on 47 newer: holdout R² 0.015, RMSE 0.921. The honest read: size alone explains little of market cap, and the board is a fitted ranking, not a forecast.
- **Bootstrap band:** 200 resamples (deterministic PRNG, seed 20261124), curve refit each time; every estimate shows its 90% interval.

## Census

All 758 protocols accounted for: 416 already trade a token, 198 ranked, 144 pre-token excluded with a stated reason (banned category 128, versioned name 11, wrapped/staked name 5, exchange prefix 0 — 16 names carry an exchange prefix but were already excluded by an earlier rule).

## Farm plans

Every row carries a 6-step plan over 90 days: suggested capital tiered by TVL ($5,000 / $2,500 / $1,000 / $500 / $250), total gas at labelled assumed per-chain prices (Ethereum ~$8/tx, L2 ~$0.50/tx, Solana-class ~$0.05/tx), and net value = implied × odds − gas. Gas prices are assumptions, not snapshot data; no airdrop allocation is claimed anywhere.

## Run

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Node 22.18+ (runs the TypeScript as it is). Reads `input/snapshot.json`, writes `out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/`, and writes `out/dossier.json` with the kit library. Two runs to different directories are byte-identical.

## License

MIT — see LICENSE.
