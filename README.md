# Sokoban solver — push-optimal, room-decomposed

Entry for the make.fun competition `sokoban-solver-01-run-20261121`
("Build the best Sokoban solver", $100, deadline 2026-11-23T03:00:00Z).

## What it is

One program, `main.ts` (plain JavaScript in a `.ts` file, Node 22, no
dependencies), that answers a whole set of 5 Sokoban levels in one run:

- reads `/input/<id>/level.txt` (XSB) for each instance `i001`–`i005`,
- writes `/output/<id>/solution.txt` (player moves in `u/d/l/r`).

Score per instance is 1,000 points only at the push-optimal count `P*`
(one push over already drops it below 500), so the solver is built to be
**push-optimal**, not just to solve.

## Algorithm

Generated levels are a 1-wide hallway plus 1–4 rooms, each holding 3–4
boxes and as many goals, joined to the hallway by a single door. A box
pushed out of its room can never come back, so in an optimal solution
every box stays in its room and `P*` is the sum of the rooms' optima.
The solver exploits that structure:

1. **Decompose** — split the level into rooms: connected floor
   components off the hallway row (the player's row), each with exactly
   one door, boxes == goals. The hallway cell in front of each door is
   kept as a player-only cell, so a box sitting on the door can be
   pushed back up into the room.
2. **Push-optimal A\* per room** — search over push states (sorted box
   positions + canonical player region). Admissible heuristic: minimum
   assignment of boxes to goals by BFS distance ignoring boxes
   (exact permutations for ≤ 4 boxes). Pruning: static dead squares
   (corners, and wall-adjacent segments with no goal and no exit —
   computed with a sound segment+confinement rule) and 2×2 freeze
   deadlocks. Each push is expanded to the player's shortest walk to
   the pushing square, so the output is a full move string.
3. **Stitch** — walk the player through the hallway from room to room
   (door-column order), concatenate the room solutions, then
   **replay-verify** the whole move string on the full level.
4. **Fallback** — if the level doesn't match the hallway+rooms shape,
   or a room search fails, a whole-level A\* (same engine, weaker
   heuristic) is tried; if that fails too, a valid empty answer is
   written rather than an illegal one.

**Determinism:** no clock, no randomness, no environment reads. Search
is cut off only by deterministic expansion counters, so two runs write
byte-identical outputs.

## Local test results

Test levels were generated with `tests/gen.py`, which mimics the
competition generator (hallway + 6×6 rooms, boxes set on goals, 30–80
reverse pulls, rooms kept only when the solver proves ≥ 12 pushes for
3 boxes / ≥ 14 for 4 boxes from the door). Optimality was cross-checked
against an independent brute-force push-BFS (`/tmp/pybfs.py`, not
shipped): 45/45 rooms agreed exactly, including after a deadlock-rule
bug was found and fixed by that cross-check.

| set | instances (P\*) | result | time |
|-----|----------------|--------|------|
| seed 1 | 13, 18, 30, 48, 62 | **1,000,000 / 1,000,000** (every instance at exactly P\* pushes) | 0.7 s |
| seed 42 | 13, 14, 29, 43, 58 | **1,000,000 / 1,000,000** (every instance at exactly P\* pushes) | 0.8 s |

Two consecutive runs on seed 1 wrote byte-identical `solution.txt`
files. Total runtime is far inside the 60 s wall budget for the set.

## Files

- `main.ts` — the entry (run as `node /bot/main.ts` by the grader).
- `LICENSE` — MIT.
- `README.md` — this file.
- `PROGRESS.md` — algorithm notes, test log, limitations, submit status.
- `tests/gen.py` — test-level generator (hallway+rooms, reverse pulls,
  solver-verified optima) and scorer/checker used for local testing.
  Not needed at grading time.

## Limits

- The room decomposition assumes the generator's layout (hallway row
  = the player's row, one door per room). Anything else falls back to
  whole-level A\*, which is push-optimal when it finishes inside its
  expansion cap but may be slow on large open levels.
- Per-room expansion cap is 400,000; whole-level cap 1,500,000
  (deterministic counters, not wall-clock).
