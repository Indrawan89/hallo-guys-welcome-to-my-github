#!/usr/bin/env python3
"""Test-level generator + checker for the Sokoban entry.

Mimics the competition generator (spec): 1-wide hallway across the board,
1-4 rooms in 6x6 slots opening onto the hallway through one door, 3-4 boxes
per room set on goals, then 30-80 reverse pulls. A room is kept only when
the entry's own solver proves it from the door in >=12 (3 boxes) / >=14
(4 boxes) pushes. P* per instance = sum of room optima (printed to key.json).

Layout (H=17, W=35): row 0/16 + col 0/34 borders; hallway row 8;
above rooms: interior rows 1..6, door in wall row 7; below rooms:
door in wall row 9, interior rows 10..15.

Usage:
  python3 gen.py <outdir> [seed]     # writes <outdir>/i00N/level.txt + key.json
  python3 gen.py --check <setdir> [outdir]  # scores /output solutions vs key.json
"""
import itertools
import json
import os
import random
import subprocess
import sys
from collections import deque

MAIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "main.ts")
W, H = 35, 17
HY = 8  # hallway row
DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]
# slots: (x0, above?) interior cols x0..x0+5; interior rows 1..6 / 10..15
SLOTS = [(2, True), (11, True), (20, True), (2, False), (11, False), (20, False)]


def room_optimum(level_path):
    r = subprocess.run(["node", MAIN, "--room-optimum", level_path],
                       capture_output=True, text=True, timeout=300)
    return json.loads(r.stdout)


def reachable(floor, boxes, player):
    seen = {player}
    q = deque([player])
    while q:
        c = q.popleft()
        for dx, dy in DIRS:
            n = (c[0] + dx, c[1] + dy)
            if n in floor and n not in boxes and n not in seen:
                seen.add(n)
                q.append(n)
    return seen


def connected(floor):
    s = next(iter(floor))
    seen = {s}
    q = deque([s])
    while q:
        c = q.popleft()
        for dx, dy in DIRS:
            n = (c[0] + dx, c[1] + dy)
            if n in floor and n not in seen:
                seen.add(n)
                q.append(n)
    return seen == floor


def bfs_dist(floor, src):
    dist = {src: 0}
    q = deque([src])
    while q:
        c = q.popleft()
        for dx, dy in DIRS:
            n = (c[0] + dx, c[1] + dy)
            if n in floor and n not in dist:
                dist[n] = dist[c] + 1
                q.append(n)
    return dist


def assignment_sum(floor, boxes, goals):
    """Min total BFS distance assigning each box to a distinct goal (inf if any unreachable)."""
    dg = [bfs_dist(floor, g) for g in goals]
    best = None
    for perm in itertools.permutations(range(len(goals))):
        s = 0
        for b, gi in zip(boxes, perm):
            d = dg[gi].get(b)
            if d is None:
                s = None
                break
            s += d
        if s is not None and (best is None or s < best):
            best = s
    return best if best is not None else 10 ** 9


def gen_room(rng, nboxes, slot):
    x0, above = slot
    rows = range(1, 7) if above else range(10, 16)
    cols = range(x0, x0 + 6)
    interior = [(x, y) for y in rows for x in cols]
    door_y = 7 if above else 9
    entry_y = 6 if above else 10
    for attempt in range(80):
        door_x = rng.choice(list(cols))
        door = (door_x, door_y)
        entry = (door_x, entry_y)
        all_cells = interior + [door]
        # carve: 50% growth from door, 50% wall-off from full
        if rng.random() < 0.5:
            floor = {door}
            target = rng.randint(20, 34)
            while len(floor) < target:
                src = rng.choice(list(floor))
                nb = [(src[0] + dx, src[1] + dy) for dx, dy in DIRS]
                nb = [c for c in nb if c in all_cells and c not in floor]
                if not nb:
                    break
                floor.add(rng.choice(nb))
        else:
            floor = set(all_cells)
            cands = [c for c in all_cells if c != door]
            rng.shuffle(cands)
            for c in cands[:rng.randint(2, 12)]:
                trial = floor - {c}
                if connected(trial):
                    floor = trial
        if len(floor) < 14 or entry not in floor:
            continue
        floor_list = [c for c in floor if c != door and c != entry]
        if len(floor_list) < nboxes + 2:
            continue
        goals = rng.sample(floor_list, nboxes)
        # reverse pulls, several restarts; keep max exact assignment sum
        best = None
        for _restart in range(16):
            boxes = set(goals)
            player = door
            for _ in range(rng.randint(30, 80)):
                reach = reachable(floor, boxes, player)
                cands = []
                for b in boxes:
                    for dx, dy in DIRS:
                        behind = (b[0] - dx, b[1] - dy)
                        dest = (b[0] - 2 * dx, b[1] - 2 * dy)
                        if behind in reach and dest in floor and dest not in boxes:
                            cands.append((b, dx, dy, behind, dest))
                if not cands:
                    break
                b, dx, dy, behind, dest = rng.choice(cands)
                boxes.discard(b)
                boxes.add(behind)
                player = dest
            if len(boxes) != nboxes:
                continue
            score = assignment_sum(floor, sorted(boxes), goals)
            if best is None or score > best[0]:
                best = (score, sorted(boxes))
        if best is None:
            continue
        return {"floor": floor, "goals": goals, "boxes": best[1],
                "door": door, "nboxes": nboxes, "scramble": best[0]}
    return None


def build_level(rng, room_specs):
    """room_specs: list of (nboxes, slot). Returns (level_text, rooms)."""
    grid = [["#"] * W for _ in range(H)]
    for x in range(1, W - 1):
        grid[HY][x] = " "
    rooms = []
    used_door_cols = set()
    for nboxes, slot in room_specs:
        for _ in range(300):
            room = gen_room(rng, nboxes, slot)
            if room is None or room["door"][0] in used_door_cols:
                continue
            used_door_cols.add(room["door"][0])
            rooms.append(room)
            break
        else:
            return None, None
    for room in rooms:
        for (x, y) in room["floor"]:
            grid[y][x] = " "
        for (x, y) in room["goals"]:
            grid[y][x] = "."
        for (x, y) in room["boxes"]:
            grid[y][x] = "*" if (x, y) in room["goals"] else "$"
    grid[HY][1] = "@"
    text = "\n".join("".join(r) for r in grid) + "\n"
    return text, rooms


def assemble(rooms):
    """Build level text from a list of room dicts (from gen_room)."""
    grid = [["#"] * W for _ in range(H)]
    for x in range(1, W - 1):
        grid[HY][x] = " "
    for room in rooms:
        for (x, y) in room["floor"]:
            grid[y][x] = " "
        for (x, y) in room["goals"]:
            grid[y][x] = "."
        for (x, y) in room["boxes"]:
            grid[y][x] = "*" if (x, y) in room["goals"] else "$"
    grid[HY][1] = "@"
    return "\n".join("".join(r) for r in grid) + "\n"


def accepted_room(rng, nboxes, slot, tmpdir):
    """Generate rooms for (nboxes, slot) until one passes the solver's
    door-optimum threshold; returns the room dict with 'optimum' set."""
    thr = 12 if nboxes == 3 else 14
    os.makedirs(tmpdir, exist_ok=True)
    lp = os.path.join(tmpdir, "level.txt")
    for attempt in range(200):
        room = gen_room(rng, nboxes, slot)
        if room is None:
            continue
        with open(lp, "w") as f:
            f.write(assemble([room]))
        opt = room_optimum(lp)
        o = opt["rooms"][0] if opt["rooms"] else None
        if o is None or o < thr or o > 60:
            continue
        room["optimum"] = o
        return room
    raise SystemExit(f"no accepted room for {nboxes} boxes in slot {slot}")


def gen_set(outdir, seed):
    rng = random.Random(seed)
    specs = [
        [(3, SLOTS[0])],
        [(4, SLOTS[1])],
        [(4, SLOTS[0]), (4, SLOTS[3])],
        [(4, SLOTS[0]), (4, SLOTS[3]), (4, SLOTS[1])],
        [(4, SLOTS[0]), (4, SLOTS[3]), (4, SLOTS[1]), (4, SLOTS[4])],
    ]
    # pool of accepted rooms per (nboxes, slot); 3 spares each so door
    # columns can be kept distinct inside an instance.
    combos = sorted({(nb, s) for spec in specs for nb, s in spec})
    pool = {}
    tmpdir = os.path.join(outdir, ".tmp")
    for nb, s in combos:
        pool[(nb, s)] = [accepted_room(rng, nb, s, tmpdir) for _ in range(3)]
        print(f"pool {(nb, s)}: optima "
              f"{[r['optimum'] for r in pool[(nb, s)]]}")
    key = {}
    os.makedirs(outdir, exist_ok=True)
    for i, spec in enumerate(specs, 1):
        iid = f"i{i:03d}"
        # pick one room per slot with distinct door columns
        chosen = []
        used_cols = set()
        for nb, s in spec:
            for r in pool[(nb, s)]:
                if r["door"][0] not in used_cols and r not in chosen:
                    chosen.append(r)
                    used_cols.add(r["door"][0])
                    break
            else:
                raise SystemExit(f"no compatible room for {iid} {nb} {s}")
        text = assemble(chosen)
        idir = os.path.join(outdir, iid)
        os.makedirs(idir, exist_ok=True)
        with open(os.path.join(idir, "level.txt"), "w") as f:
            f.write(text)
        optima = [r["optimum"] for r in chosen]
        key[iid] = {"p_star": sum(optima), "room_optima": optima,
                    "rooms": len(chosen), "boxes": sum(r["nboxes"] for r in chosen)}
        print(f"{iid}: rooms={len(chosen)} boxes={key[iid]['boxes']} "
              f"room_optima={optima} P*={sum(optima)}")
    with open(os.path.join(outdir, "key.json"), "w") as f:
        json.dump(key, f, indent=2)
    print("wrote", outdir)


def replay(level_text, moves):
    lines = level_text.rstrip("\n").split("\n")
    Wd = max(len(l) for l in lines)
    grid = [list(l.ljust(Wd, "#")) for l in lines]
    Hh = len(grid)
    boxes = set()
    goals = set()
    p = None
    for y in range(Hh):
        for x in range(Wd):
            c = grid[y][x]
            if c in "$*":
                boxes.add((x, y))
            if c in ".*":
                goals.add((x, y))
            if c == "@":
                p = (x, y)
    dmap = {"u": (0, -1), "d": (0, 1), "l": (-1, 0), "r": (1, 0)}
    pushes = 0
    for ch in moves:
        if ch.lower() not in dmap:
            if ch.isspace():
                continue
            return {"legal": False, "solved": False, "pushes": 0}
        dx, dy = dmap[ch.lower()]
        n = (p[0] + dx, p[1] + dy)
        if grid[n[1]][n[0]] == "#":
            return {"legal": False, "solved": False, "pushes": pushes}
        if n in boxes:
            t = (n[0] + dx, n[1] + dy)
            if grid[t[1]][t[0]] == "#" or t in boxes:
                return {"legal": False, "solved": False, "pushes": pushes}
            boxes.discard(n)
            boxes.add(t)
            pushes += 1
        p = n
    return {"legal": True, "solved": boxes <= goals, "pushes": pushes}


def check(setdir, outdir="/output"):
    key = json.load(open(os.path.join(setdir, "key.json")))
    total = 0
    for iid in sorted(key):
        level = open(os.path.join(setdir, iid, "level.txt")).read()
        sol_path = os.path.join(outdir, iid, "solution.txt")
        moves = open(sol_path).read() if os.path.exists(sol_path) else None
        if moves is None:
            print(f"{iid}: MISSING answer -> 0")
            continue
        r = replay(level, moves)
        ps = key[iid]["p_star"]
        if not r["legal"] or not r["solved"]:
            pts = 0
        elif r["pushes"] == ps:
            pts = 1000
        else:
            pts = 500 * ps / r["pushes"]
        total += pts
        print(f"{iid}: P*={ps} pushes={r['pushes']} legal={r['legal']} "
              f"solved={r['solved']} moves={len(moves.strip())} pts={pts:.1f}")
    print(f"TOTAL score = {total / len(key) * 1000:.0f} / 1000000")


if __name__ == "__main__":
    if sys.argv[1] == "--check":
        check(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "/output")
    else:
        gen_set(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1)
