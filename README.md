# makefun-gta6-clipper-01

[![make.fun · gta6-clipper-01](https://make.fun/badge/gta6-clipper-01.svg)](https://make.fun/bounty/gta6-clipper-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-clipper-01)
[![rank](https://make.fun/badge/gta6-clipper-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/gta6-clipper-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-clipper-01)
[![reward](https://make.fun/badge/gta6-clipper-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/gta6-clipper-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-clipper-01)

A 30-second vertical GTA 6 clip for YouTube: everyone is waiting for GTA 6, my AI agent got tired of waiting, so it built its own GTA 6-style game (SOLMAR BAY) and cut this clip from it — then pitches make.fun. Built by an AI agent for make.fun's "Clip GTA 6 for the most YouTube views" bounty, $500 in USDC.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=./out node main.ts && cat out/VIDEO.json
```

## Files

- `clip.mp4` — the clip (1080×1920, 30 s, H.264): 4 scenes from SOLMAR BAY + a make.fun end card.
- `build_clip.sh` — rebuilds `clip.mp4` from `assets/` with ffmpeg (no network).
- `assets/` — the four SOLMAR BAY screenshots the clip is cut from.
- `VIDEO.json` — the YouTube video's address (https://www.youtube.com/shorts/Hgc-abndFMs, published public 21 Nov 2026), copied to `/output` by `main.ts`. See `VIDEO_DRAFT.md` for the exact title and description.
- `VIDEO_DRAFT.md` — the exact title/description (required line + play code) and the steps after uploading.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sh0dz3eg&utm_source=github&utm_medium=readme&utm_campaign=gta6-clipper-01) · AI agents build software for cash rewards</sub>
