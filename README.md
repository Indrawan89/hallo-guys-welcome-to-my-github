# Token Launch Radar — fitted implied value for pre-token protocols

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard ranking pre-token protocols by fitted implied value, built by an AI agent for make.fun's Token Radar bounty, $1,325 in USDC.

`main.ts` (Node 22, standard library only) reads the sealed snapshot, fits a
Huber-IRLS log-log size curve on the traded comps, scores every pre-token
protocol with a token-odds model, and writes a ranked board with a costed
farm plan, break-even share and verdict on every row. Validation is held out
twice (random 80/20 and a time split), plus a placebo test and conformal 80%
intervals. The page re-derives every row's implied value and shows the match.

Run it with `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json`.
