# SOLMAR BAY — Dossier

**Competition:** make.fun gta6-01 "Make GTA 6" · **Prize pool:** $1,666 (top 100)
**Entrant:** Indrawan89 · **Repo:** Indrawan89/hallo-guys-welcome-to-my-github
**License:** MIT (SPDX-License-Identifier: MIT)

## What it is

SOLMAR BAY is an original top-down 2D open-world crime game that runs offline
in a desktop browser from static files. No Rockstar names, characters, map, or
assets — the city, story, vehicles, and art are all drawn from scratch on a
single HTML canvas with plain JavaScript and WebAudio beeps.

## The world

- **Map:** 3400×3400 px coastal city, seeded procedural layout (same streets and
  buildings every run): a road grid, ~120 buildings, parks, palm trees, and a
  beach along the west edge.
- **8 districts:** Marina Bay, Old Town, Sunset Strip, Palm Court, Harbor
  Lights, Dockside, North Hills, University Quarter — each with its own ground
  tint, accent colour, and flavour.
- **Life:** 18 traffic cars driving the road grid, 26 pedestrians walking the
  sidewalks (they flee when scared), parked cars to steal, cash and health
  pickups scattered around town.
- **Police:** a wanted level of 0–5 stars; cruisers spawn per star and chase,
  ram, and bust the player. The heat cools off when no cruiser is close.

## Story — 6 sequential missions

1. **First Wheels** — steal a parked car, meet Ray at Marina Bay.
2. **Delivery Run** — package to Old Town; each crash docks $50 from the pay.
3. **Shakedown** — collect 3 cash stashes on the Sunset Strip past Lena's goons.
4. **Hot Pursuit** — three stars on your tail; survive 45 seconds, then reach
   the North Hills safehouse.
5. **The Big Score** — crack the Harbor Lights Bank vault (hold E), escape
   with the cash at 4 stars.
6. **Last Ride** — drive the loot to the Marina yacht in 120 seconds, through
   roadblocks, to win.

## Systems

- Driving with acceleration, steering, handbrake and building collision;
  on-foot movement with the same collision.
- HUD: cash, health bar, wanted stars, district name, mission objective with
  live timers, centre messages, and a minimap with the objective marker,
  police dots and the viewport.
- Objective marker: a pulsing diamond over the target, or an edge arrow with
  distance when it is off-screen.
- Sound: WebAudio engine hum tied to speed, two-tone police siren, pickup
  blips, crash thuds, mission jingles. M mutes.
- Save: mission progress and cash persist in localStorage; finishing all six
  missions clears the save and shows the win screen.

## Files

- `game/index.html` — canvas page, loads the game as ES modules.
- `game/src/main.js` — loop, state machine (title / playing / paused /
  busted / wasted / win), save and load.
- `game/src/world.js` — seeded city generation, districts, collision, places.
- `game/src/entities.js` — player, traffic, pedestrians, police.
- `game/src/missions.js` — the six missions, goons, objective text.
- `game/src/render.js` — city, entities, marker, HUD, minimap, screens.
- `game/src/shots.js` — deterministic `?shot=` presets for screenshots.
- `game/src/rng.js` — seeded RNG and angle helpers.
- `game/src/audio.js` — WebAudio synth. `game/src/input.js` — keyboard.
- `main.ts` — entrypoint: copies game/ + screenshots/ to /output, writes
  dossier.json via vendor/makefun-game.ts.
- `screenshots/` — 4 real renders of the game (cover, drive, chase, mission).
