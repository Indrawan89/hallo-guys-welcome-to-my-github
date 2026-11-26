# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that ranks pre-token protocols by a fitted implied value and gives each row a costed farm verdict. Built by an AI agent for make.fun's Token Radar bounty ($1,325 in USDC).

## What it is

Every protocol in the sealed house snapshot that records no token — 198 rows, 40 on the watchlist and 158 early finds — ranked by an implied value from one fitted curve, with a farm plan on every row.

## The model (fitted from the snapshot, nothing hardcoded)

- **Implied value** = 10^(a + b·log10(TVL)), a Huber-IRLS fit on 128 traded comps (one per ticker). log10(mcap) = 2.8066 + 0.5517·log10(TVL), R² 0.193.
- **Token odds** from a logistic model (age capped at 4 years, log10(TVL), 7-day change winsorized to [−50%, +100%]). AUC 0.711. The 7-day term adds almost nothing (AUC 0.711 with it, 0.708 without it) and stays only because the bounty asks the value to follow seven-day growth.
- **Net expected** = odds × implied × 0.01% farmer share − $48 gas, on a $10,000 deposit over 90 days. A $10,000 farmer captures on the order of 0.01% of a protocol-wide token value; the ranking does not depend on the share.
- **Verdict:** FARM when net/deposit > 20% AND odds > 0.40; WATCH when net/deposit > 5%; otherwise SKIP. 5 FARM / 39 WATCH / 154 SKIP, with 4 FARM rows in the top 8.

## Validation (same folds, dollars and log side by side)

- Leave-one-out: 1.10× better than the flat multiple in log-RMSE; **1.63× in dollar RMSE, 1.67× in MAE, 2.66× in MSE**. Within-3×: 42.2% vs 35.2% for the flat.
- Two random holdouts (seeds 7 and 42): 1.08× / 1.15× log, 1.12× / 1.44× dollars.
- Time split (cutoff 2024-02-18): 1.00× log, 1.03× dollars, test R² 0.003 — the curve barely holds on the newest listings, and the methodology says so.
- Walk-forward pooled (n=88): 1.05× log, **1.34× dollars**; per year 2022: 1.77×, 2023: 1.78×, 2024: 5.17×, 2025: 1.00×, 2026: 1.02×.
- Placebo (shuffled market caps): R² 0.001. Conformal 80%: half-width 1.06 dex, coverage 82%.
- A multi-factor curve was tested and lost out of sample, so the board keeps the single factor. The 2.99× leave-one-out claim seen elsewhere does not reproduce on this snapshot (we compute 1.63× on dollar RMSE); it is not repeated here.

## The dashboard

Six tabs: the ranked **Board** (sortable, filterable, one-line rows, 10 columns — the 90% bootstrap band and the conformal 80% interval share one Range column), **Live tokens** (the 128 comps the curve is fitted on), **Methodology** (every number defined), **Category playbooks** (90-day plans with expected $/hour and a deposit-tier matrix), **Census** (758 = 128 + 288 + 198 + 144, watchlist 40/40), and a **Research note**.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot at `/input/snapshot.json` by default, writes the ranked board to `/output/board.json`, the dashboard data to `/output/dashboard/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json`. Both runs write identical bytes.

## Files

- `main.ts` — the whole program: fit, validation, board, dossier.
- `dashboard/` — `index.html`, `app.css`, `app.js`, `data.js` (generated).
- `screenshots/` — board, detail view, watchlist filter.
- `scripts/` — `analyze.py` (independent Python analysis of the snapshot), `crosscheck.py` (Python vs TypeScript recompute), `gate.py` (the 7 gate checks).
- `vendor/makefun-board.ts` — make.fun's dossier library, as shipped in the kit.

## License

MIT — see `LICENSE`.
