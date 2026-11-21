# SOLMAR BAY — Dossier

**Competition:** make.fun gta6-01 "Make GTA 6" · **Prize pool:** $1,666 (top 100)
**Entrant:** Indrawan89 · **Repo:** Indrawan89/hallo-guys-welcome-to-my-github · **Referral:** sh0dz3eg
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
- **Life:** 16+ traffic cars driving the road grid, 26 pedestrians walking the
  sidewalks (they flee when scared), parked cars to steal, cash and health
  pickups scattered around town.

## Story — 6 sequential missions

1. **First Wheels** — steal a car, meet Ray at Marina Bay.
2. **Delivery Run** — package to Old Town; crashes dock your pay.
3. **Shakedown** — collect 3 cash stashes on the Sunset Strip past Lena's goons.
4. **Heat Rising** — lose your wanted level, then reach the Harbor Lights safehouse.
5. **The Harbor Deal** — grab the briefcase at Dockside, dodge the guards.
6. **King of Solmar** — fight through maximum heat to the Strip stage; finishing
   shows the win screen and your final stats.

## Systems

- **Wanted 0–5 stars:** stealing cars, hitting pedestrians, and punching
  bystanders raise the heat; 1–5 police cars spawn by level and ram the player.
  Heat cools when hidden (parks, alleys, out of sight) and slowly otherwise.
  Caught on foot at wanted 2+ and you are BUSTED; health at zero and you are WASTED.
- **Driving:** 5 car models (Comet, Cruiser, Racer, Van, Taxi) with distinct top
  speed and acceleration; steering scales with speed; collisions shake the
  camera, spark particles, and cost health.
- **Combat:** punch (SPACE) on foot — goons take 3 hits and drop cash; running
  over pedestrians at speed is a crime.
- **Economy:** mission rewards ($300–$1,500), cash pickups, goon drops, crash
  penalties on the delivery run.
- **HUD:** money, health bar, wanted stars (flashing red at 3+), in-game clock,
  current district, mission tracker, speedometer, circular live minimap with the
  mission marker, police blips, and the player arrow; off-screen objective arrow
  at the screen edge with distance.
- **Screens:** animated title (slow camera pan over Marina Bay), pause, BUSTED /
  WASTED game over with stats, and a KING OF SOLMAR BAY win screen.
- **Save:** progress auto-saves to localStorage; CONTINUE on the title screen.
- **Sound:** WebAudio synth only — coins, punches, crashes, sirens, honks,
  mission fanfares. No audio files, no network.

## Controls

WASD / arrows — walk & drive · E — enter/exit car · SPACE — punch / honk ·
P — pause · M — mute · R — restart after game over.

## How it was built

- `game/game.js` (~950 lines) — the whole game: seeded city generation,
  missions, wanted system, traffic/ped/cop AI, combat, pickups, particles,
  rendering, minimap, save/load, and screenshot mode (`?shot=start|play|chase|end`).
- `game/index.html` + `game/style.css` — page, HUD, and menu overlays.
- `main.ts` — Node 22 entrypoint: copies `game/` and `screenshots/` to the
  output dir and writes `dossier.json` with `buildDossier` from
  `vendor/makefun-game.ts`. Deterministic: two runs produce byte-identical output.
- `serve.ts` — static server for local play (`node serve.ts` → localhost:8080).
- `screenshots/` — 4 real headless-Chromium renders of the game's own code at
  1280×800, each under 256 KiB: title, on-foot mission, 4-star police chase,
  BUSTED screen.
- `vendor/makefun-game.ts` — the kit's copy, unchanged.

## Screenshots (what the judge sees)

1. **1-title.jpg** — title screen over a slow camera pan of Marina Bay.
2. **2-play.jpg** — on foot in Palm Court during Mission 2, HUD + minimap + mission
   tracker visible, cash pickup and pedestrians in frame.
3. **3-chase.jpg** — driving the Strip Racer through Sunset Strip at wanted 4,
   three police cars in pursuit, sirens flashing, mission 6 objective on the HUD.
4. **4-busted.jpg** — BUSTED screen with run stats over the live city frame.

Each is a real render of `game/game.js` in headless Chromium at 1280×800,
taken with `?shot=start|play|chase|end` (see `shots.json`).

## Known limits & future work

- Top-down 2D by design: the camera is a smooth follow-cam, not a 3D chase cam.
- Combat is melee (punch) plus vehicular — no firearms, by design, to keep the
  game playable with keyboard only.
- Traffic follows the road grid and avoids buildings, but cars do not yet stop
  at intersections for each other; pile-ups resolve by nudging apart.
- The in-game clock runs for flavour (day passes in ~40 real minutes); a full
  day/night lighting cycle is the next polish step.

## Verification (measured 21 Nov 2026, this session)

- `node main.ts` run twice (MAKEFUN_OUTPUT_DIR=/tmp/out1 and /tmp/out2):
  `diff -r` clean, `dossier.json` byte-identical, sha256
  `547399d0310c9ae1528e9a05637651799802817750de88272c798dc20368e3fc`
  both runs; dossier 614,014 bytes (< 1.5 MiB cap); game/ 3 entries.
- Game served with `node serve.ts` and opened in headless Chromium (Playwright
  chromium-1148): index/game.js/style.css all HTTP 200, no fatal JS errors —
  HUD values, mission box, district name, and minimap all render in the DOM
  and in the screenshots. Only log noise was Chromium's D-Bus warnings.
- Screenshots: 4× JPEG 1280×800 — 1-title 88,626 B; 2-play 114,773 B;
  3-chase 125,177 B; 4-busted 83,961 B — each < 256 KiB. Pixel-checked:
  ground renders tan (206,184,134) after fixing a camera-relative ground-fill bug.
- `vendor/makefun-game.ts` sha256 `dc671875…` — byte-identical to the kit's copy.
- No external references in `game/`: no `http(s)://` loads; every asset is a
  local file or drawn on canvas. (`serve.ts` mentions only `http://localhost`.)
- `game/game.js` is 1,100 lines; `game/index.html` 3,416 bytes (< 1 MiB).
