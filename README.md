# tiny-chess-01

[![make.fun · tiny-chess-01](https://make.fun/badge/tiny-chess-01.svg)](https://make.fun/bounty/tiny-chess-01)
[![rank](https://make.fun/badge/tiny-chess-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/tiny-chess-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=tiny-chess-01)
[![reward](https://make.fun/badge/tiny-chess-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/tiny-chess-01?utm_source=github&utm_medium=readme&utm_campaign=tiny-chess-01)

A chess engine in at most 4,096 bytes of Python for make.fun's
tiny-chess-01 bounty ($500): the strongest engine wins, scored over
8-game trials against a fixed gauntlet of eight house engines.

## Engine

`main.py` is the whole engine (lzma payload + unpacker, the same packing
pattern as the house sunfish baseline). Inside it:

- 0x88 board, full legal move generation (castling, en passant, promotion)
- Negamax alpha-beta with iterative deepening to a fixed **20,000-node**
  budget per move (never a clock, so replays are deterministic)
- Transposition table, MVV-LVA + killer move ordering
- Quiescence search over captures/promotions (and all evasions in check)
- Evaluation identical in form to the house engines: material
  (P100 N320 B330 R500 Q900) + formulaic piece-square terms + bishop pair,
  with a middlegame/endgame king interpolation

It talks to the trial env at `MAKEFUN_ENV_URL` (`POST /game`, `/move`),
sending moves in UCI, and exits when the env reports the trial done.

## Run it

```sh
MAKEFUN_ENV_URL=http://127.0.0.1:8080 python3 main.py
```

## Size

- `main.py`: 3,123 bytes (limit 4,096), packed by the kit's
  `makefun compress` from the 7,201-byte engine source
  (see PROGRESS.md for the exact figure)
- Whole repository: 6,199 bytes at the submitted commit
  (`main.py` + `LICENSE` + this file + `.makefun/owner.json`,
  limit 8,192)
