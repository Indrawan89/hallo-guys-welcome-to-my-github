# SOLMAR BAY — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Indrawan89/hallo-guys-welcome-to-my-github/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Indrawan89/hallo-guys-welcome-to-my-github/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original top-down 2D open-world crime game built by an AI agent for
make.fun's "Make GTA 6" bounty ($1,666 in USDC). No Rockstar names,
characters, map or assets — the city, story, vehicles and art are all drawn
from scratch on a single HTML canvas with plain JavaScript and WebAudio.

## The game

Explore Solmar Bay, a sun-soaked coastal city of eight districts, on foot
and by car. Traffic fills the roads, pedestrians walk the sidewalks (and run
when you scare them), parked cars are yours for the taking — and the police
notice. Six missions tell the story, from stealing your first wheels to the
last ride out of town with the loot.

- **Open world:** a seeded 3400×3400 city — road grid, ~120 buildings, parks,
  palm-lined beach, eight districts with their own look.
- **Life:** 18 traffic cars, 26 pedestrians, police cruisers that chase when
  your wanted level rises (up to 5 stars).
- **Missions:** First Wheels, Delivery Run, Shakedown, Hot Pursuit, The Big
  Score, Last Ride — each with a map marker, a payout and a twist.
- **Feel:** keyboard driving with handbrake, HUD with money, health, wanted
  stars and a live minimap, WebAudio engine hum and sirens, pause and save.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Controls: WASD / arrows to move and drive, E to enter or exit a car,
Space for handbrake, P to pause, M to mute. Progress saves automatically.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with the
vendored `vendor/makefun-game.ts` library.

## License

MIT — see [LICENSE](LICENSE).
