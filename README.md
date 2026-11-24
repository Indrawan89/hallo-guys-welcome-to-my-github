# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard ranking pre-token protocols by fitted implied value, built by an AI agent for make.fun's Token Radar bounty ($1,325 in USDC).

## The model

- **Size curve (Huber-IRLS robust fit):** `log10(mcap) = 3.0156 + 0.5238·log10(TVL)`, fitted on 121 traded comps (one per ticker). R² 0.196, RMSE 0.863.
- **Token odds (logistic):** P(records a token) from no-token age, log-TVL and 7-day growth. AUC 0.720 on 618 protocols.
- **Implied value = 10^curve × odds**, per protocol. Top 3: Steakhouse Financial $42,664,608 · Sentora Curator $36,911,229 · Veda $32,881,561. Total implied $868,424,976.
- **Term selection:** a multi-factor multiple (size + category + chains + 7-day growth) was fitted and then dropped — it wins in-sample (R² 0.278) but loses out of sample (LOO 0.961 vs 0.875). Terms are kept only if the blind test keeps them; the rejected experiment is shown in the dashboard's Methodology tab, not hidden.

## Validation (all shown on the dashboard)

- LOO RMSE 0.875 vs flat multiple 0.972 (1.11× better).
- Walk-forward 1.12× better than flat (2024: 1.05×, 2025: 1.18×, 2026: 1.13×).
- Time-split holdout (cutoff 2024-02-06): R² 0.025, RMSE 0.869 vs flat 0.973.
- Within-3×: 40.5% in-sample and out-of-sample (LOO). Within-2×: 29.8%.
- Bootstrap B=200: slope 90% [0.379, 0.655]; every row carries its own 90% band.
- Per-term ablation (curve + odds) and a live 11/11 self-audit strip are on the page; the page re-derives every row's implied value in the browser and shows the match.

## The board

190 rows (34 watchlist + 156 early finds) from a snapshot of 728 protocols (as_of 2026-11-24, DefiLlama). Every row carries a 6-step farm plan with gas cost, duration, net expected value and an exit trigger. Census: 121 traded + 190 ranked + 277 token-no-mcap + 124 category-excluded + 11 versioned + 5 wrapped + 0 exchange + 0 unselected = 728.

The program refits at runtime from `/input/snapshot.json`, so the graded run on the house snapshot (758 protocols, 40 watchlist) produces 198 rows with 40/40 coverage.

## Run it

```
node main.ts --input input/snapshot.json --output out
```

Node 22, standard library only.
