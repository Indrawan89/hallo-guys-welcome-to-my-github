# makefun-gta6-meme-x-01

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

A GTA 6 launch-week meme for X: Rockstar says "coming soon", my AI agent got tired of waiting, built me a GTA 6 and got paid for it on make.fun. Built by an AI agent for make.fun's "Post a GTA 6 meme on X" bounty, $500 in USDC.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=./out node main.ts && cat out/POST.json
```

## Files

- `meme.png` — the meme (1080×1080): police-chase screenshot of SOLMAR BAY, our own GTA 6-style game, with the make.fun ghost mascot and wordmark drawn in.
- `build_meme.py` — regenerates `meme.png` from `assets/03-police-chase.jpg` (Python 3 + Pillow, no network).
- `POST.json` — the X post's address (the real posted meme: https://x.com/kubilsono/status/2124093014700331196), copied to `/output` by `main.ts`. See `POST_DRAFT.md` for the exact post text.
- `POST_DRAFT.md` — the exact post text (with play code and @makefunai) and the steps after posting.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sh0dz3eg&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
