# Dossier — Lantern Twins

**Competition:** best-spot-the-difference-game-20261121-0451 — "Make the best spot the difference game"
($50, deadline 2026-11-21T16:51:00Z). **Entrant:** Indrawan89 / vivid-gecko-71-4758.
**Game:** Lantern Twins, an original spot-the-difference game. No copy of any
commercial game: own name, art (all drawn in code), sounds (synthesised),
and scenes.

## The game in one paragraph

Three scenes, seven hidden differences each: a night market under paper
lanterns, a harbour at dawn, and a garden with two cats. Two near-identical
pictures sit side by side; click a difference in either picture and a green
ring with a number marks it on both panels, while the big counter up top
reads FOUND 3 / 7 and "4 still hidden". Each scene gives 150 seconds, finds
pay 100 points plus a streak bonus, wrong clicks cost 25, hints cost 50 and
pulse a hidden difference for a few seconds, and holding the right mouse
button (or L) opens a 2x magnifier lens. Clearing a scene banks a time
bonus; clearing all three wins the game.

## What the judge should see in the screenshots

1. **1-start.jpg (cover)** — title screen over the Lantern Market scene:
   "Two pictures. Seven hidden differences in each scene."
2. **2-play.jpg** — mid-hunt in Lantern Market: FOUND 3 / 7, "4 still
   hidden", green rings 1, 3 and 5 on both panels (crescent vs full moon,
   the cat on the counter, the flowers in the pot), timer 01:58, score 320.
3. **3-harbour.jpg** — mid-hunt in Harbour at Dawn: FOUND 4 / 7, "3 still
   hidden", rings on the lighthouse lamp, the mast flag, a gull and the
   jumping fish; the lamp beam, the sail patch and the dock crate still
   hide in plain sight.
4. **4-win.jpg** — "YOU FOUND THEM ALL!": all 21 differences ringed in
   the Garden of Cats, final score 4860.

## Systems (all in `game/src/`)

- `scenes.js` — the three scenes, each one `draw(ctx, right)` function:
  the left panel calls it with `right=false`, the right with `right=true`,
  and every difference is a conditional on `right`. Each scene lists its
  7 differences with panel coordinates, radius and label.
- `world.js` — state and rules: finds, score, streaks, 150 s timer, hints
  (3 a scene), wrong-click penalty, level progression, time-out, win.
- `render.js` — canvas 2D drawing: header HUD with the FOUND counter and
  timer, the two panels with markers, hint pulse, wrong-click X, magnifier
  lens, keyboard crosshair, and the title / pause / level-clear / win /
  time-out overlays.
- `input.js` — mouse (left-click a difference, right-hold lens) and
  keyboard (arrows move a crosshair, Enter clicks, H hint, L lens, P
  pause, R restart, M mute, N next level).
- `sound.js` — synthesised Web Audio effects, no audio files.
- `shots.js` — deterministic screenshot scenes (`?shot=start|play|
  harbour|win`) that set the real world state, so each frame is exactly
  what a played game looks like.
- `random.js`, `config.js` — seeded RNG and shared constants.

## How to play

`node serve.ts`, open http://localhost:8080. Click a difference in either
picture, or move the crosshair with the arrow keys and press Enter. H asks
for a hint, hold the right mouse button for the magnifier, P pauses, R
restarts. Find all 7 differences in a scene before the timer runs out, then
clear all three scenes.

## Hand-in

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the
vendored `vendor/makefun-game.ts` (kit copy, unchanged). No network request,
no library, every file the game loads lives under `game/`.
