// Sokoban solver — push-optimal, room-decomposed.
//
// Strategy
// --------
// Generated levels are a 1-wide hallway plus 1-4 rooms, each room holding
// 3-4 boxes and as many goals, connected to the hallway by a single door.
// A box pushed out of its room can never come back, so in any optimal
// solution every box stays in its room and the level's push-optimal count
// is the sum of the rooms' optima. We therefore:
//   1. split the level into rooms (connected floor components off the
//      hallway row, each with one door, boxes == goals),
//   2. solve each room push-optimally with A* over push states
//      (boxes + canonical player region), with an admissible
//      min-assignment heuristic and static + 2x2 deadlock pruning,
//   3. stitch the room solutions together with plain walking moves
//      through the hallway, and replay-verify the whole solution.
// If decomposition fails we fall back to a whole-level A* (same engine,
// weaker heuristic); if that fails we still write a valid (empty) answer.
//
// Determinism: no clock, no randomness, no environment reads. Search is
// cut off only by deterministic expansion counters, so two runs write
// identical bytes. Node 22, built-ins only, no dependencies.
//
// Input : /input/<id>/level.txt  (XSB)
// Output: /output/<id>/solution.txt (moves in u/d/l/r, whitespace ignored)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DR = [-1, 1, 0, 0];
const DC = [0, 0, -1, 1];
const CH = 'udlr';

// ---------------------------------------------------------------- parsing
function parseLevel(text) {
  const raw = text.replace(/\r/g, '').split('\n');
  while (raw.length && raw[raw.length - 1] === '') raw.pop();
  const H = raw.length;
  let W = 0;
  for (const l of raw) W = Math.max(W, l.length);
  const wall = new Uint8Array(W * H);
  const goals = [];
  const boxes = [];
  let player = -1;
  for (let y = 0; y < H; y++) {
    const line = raw[y];
    for (let x = 0; x < W; x++) {
      const c = x < line.length ? line[x] : '#';
      const i = y * W + x;
      if (c === '#') wall[i] = 1;
      else if (c === '.') goals.push(i);
      else if (c === '$') boxes.push(i);
      else if (c === '*') { goals.push(i); boxes.push(i); }
      else if (c === '@') player = i;
      else if (c === '+') { goals.push(i); player = i; }
      // ' ' and anything else: plain floor
    }
  }
  boxes.sort((a, b) => a - b);
  goals.sort((a, b) => a - b);
  return { W, H, wall, goals, boxes, player };
}

// ------------------------------------------------------------ BFS helpers
// BFS distances from `src` over floor cells (wall[] == 0), ignoring boxes.
// Returns Int32Array of distances (-1 = unreachable).
function bfsDist(W, H, wall, src, floor) {
  const dist = new Int32Array(W * H).fill(-1);
  const q = [src];
  dist[src] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const x = c % W, y = (c / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DC[d], ny = y + DR[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] !== -1 || wall[n]) continue;
      if (floor && !floor[n]) continue;
      dist[n] = dist[c] + 1;
      q.push(n);
    }
  }
  return dist;
}

// Flood fill from `src` avoiding walls and `blocked` (a Set of box cells).
// Returns { region: Set, prev: Map(cell -> [fromCell, char]) } for path recovery.
function flood(W, H, wall, floor, src, blocked) {
  const region = new Set([src]);
  const prev = new Map();
  const q = [src];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const x = c % W, y = (c / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DC[d], ny = y + DR[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (region.has(n) || wall[n]) continue;
      if (floor && !floor[n]) continue;
      if (blocked.has(n)) continue;
      region.add(n);
      prev.set(n, [c, CH[d]]);
      q.push(n);
    }
  }
  return { region, prev };
}

function pathFrom(prev, from, to) {
  // path string from `from` to `to` using prev map; '' if unreachable.
  if (from === to) return '';
  if (!prev.has(to)) return null;
  let s = '';
  let c = to;
  while (c !== from) {
    const p = prev.get(c);
    if (!p) return null;
    s = p[1] + s;
    c = p[0];
  }
  return s;
}

// ------------------------------------------------------- deadlock analysis
// Static dead cells: non-goal floor cells a box can never leave towards a
// goal (corners, and wall-adjacent segments with no goal and no exit).
// A box against a wall slides only along the row/column of that wall: it
// is dead only when its whole contiguous floor segment along that axis
// holds no goal AND the box can never leave the segment (every cell of
// the segment has a wall on one side of the sliding axis). Using just the
// run of cells where the wall persists would be unsound: a box may slide
// to a cell where the wall ends and step onto a goal there.
function staticDead(W, H, wall, floor, goalSet) {
  const dead = new Uint8Array(W * H);
  const blocked = (x, y) =>
    x < 0 || y < 0 || x >= W || y >= H || wall[y * W + x] || (floor && !floor[y * W + x]);
  for (let i = 0; i < W * H; i++) {
    if (wall[i] || (floor && !floor[i]) || goalSet.has(i)) continue;
    const x = i % W, y = (i / W) | 0;
    const up = blocked(x, y - 1), dn = blocked(x, y + 1);
    const lf = blocked(x - 1, y), rt = blocked(x + 1, y);
    if ((up || dn) && (lf || rt)) { dead[i] = 1; continue; } // corner
    // wall above/below: box slides horizontally along its row segment
    if (up || dn) {
      let x0 = x, x1 = x;
      while (!blocked(x0 - 1, y)) x0--;
      while (!blocked(x1 + 1, y)) x1++;
      let hasGoal = false, confined = true;
      for (let cx = x0; cx <= x1; cx++) {
        if (goalSet.has(y * W + cx)) hasGoal = true;
        if (!blocked(cx, y - 1) && !blocked(cx, y + 1)) confined = false;
      }
      if (!hasGoal && confined) { dead[i] = 1; continue; }
    }
    // wall left/right: box slides vertically along its column segment
    if (lf || rt) {
      let y0 = y, y1 = y;
      while (!blocked(x, y0 - 1)) y0--;
      while (!blocked(x, y1 + 1)) y1++;
      let hasGoal = false, confined = true;
      for (let cy = y0; cy <= y1; cy++) {
        if (goalSet.has(cy * W + x)) hasGoal = true;
        if (!blocked(x - 1, cy) && !blocked(x + 1, cy)) confined = false;
      }
      if (!hasGoal && confined) { dead[i] = 1; continue; }
    }
  }
  return dead;
}

// 2x2 freeze: a 2x2 block of walls/boxes containing a box on a non-goal.
function frozen2x2(W, H, wall, floor, boxes, boxSet, goalSet) {
  for (const b of boxes) {
    if (goalSet.has(b)) continue;
    const x = b % W, y = (b / W) | 0;
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const x0 = x + dx, y0 = y + dy;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) continue;
      let ok = true, hasBox = false;
      for (let yy = 0; yy < 2; yy++) {
        for (let xx = 0; xx < 2; xx++) {
          const c = (y0 + yy) * W + (x0 + xx);
          if (boxSet.has(c)) { hasBox = true; if (goalSet.has(c)) { ok = false; } }
          else if (!wall[c] && !(floor && !floor[c])) { ok = false; }
        }
      }
      if (ok && hasBox) return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------- heap
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmp(a[p], a[i]) <= 0) break;
      const t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t;
        i = m;
      }
    }
    return top;
  }
}
// item: [f, h, counter, nodeIdx]; lower f, then lower h, then earlier first.
function cmp(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

// ------------------------------------------------------------- A* solver
// Push-optimal A* over one subproblem (a room, or the whole level).
// floor: Uint8Array(1 = usable cell) or null for "all non-wall".
// noBoxCell: a cell the player may stand on but a box may never occupy
// (the hallway cell in front of a room's door; -1 when none).
// Returns { moves, pushes, endPlayer } or null.
function solveSub(W, H, wall, floor, boxes0, goals, startPlayer, maxExpansions, noBoxCell) {
  const n = boxes0.length;
  const goalSet = new Set(goals);
  const dead = staticDead(W, H, wall, floor, goalSet);
  if (noBoxCell >= 0) dead[noBoxCell] = 1; // boxes may never enter it
  for (const b of boxes0) if (dead[b]) return null;

  // distToGoal[g][cell]: steps ignoring boxes.
  const distToGoal = goals.map((g) => bfsDist(W, H, wall, g, floor));

  // heuristic: min-cost assignment boxes->goals (exact permutations for
  // n <= 4, else sum of per-box minima, both admissible).
  function heuristic(boxes) {
    if (n <= 4) {
      let best = Infinity;
      const used = new Array(n).fill(false);
      const cur = new Array(n);
      (function rec(k) {
        if (best === 0) return;
        if (k === n) {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const d = distToGoal[cur[i]][boxes[i]];
            if (d < 0) { s = Infinity; break; }
            s += d;
          }
          if (s < best) best = s;
          return;
        }
        for (let j = 0; j < n; j++) {
          if (used[j]) continue;
          used[j] = true; cur[k] = j;
          rec(k + 1);
          used[j] = false;
        }
      })(0);
      return best;
    }
    let s = 0;
    for (const b of boxes) {
      let m = Infinity;
      for (let g = 0; g < n; g++) {
        const d = distToGoal[g][b];
        if (d >= 0 && d < m) m = d;
      }
      if (m === Infinity) return Infinity;
      s += m;
    }
    return s;
  }

  function isGoal(boxes) {
    for (const b of boxes) if (!goalSet.has(b)) return false;
    return true;
  }

  const startBoxes = boxes0.slice().sort((a, b) => a - b);
  if (isGoal(startBoxes)) return { moves: '', pushes: 0, endPlayer: startPlayer };

  const nodesBoxes = [startBoxes];
  const nodesPlayer = [startPlayer];
  const nodesParent = [-1];
  const nodesMove = [''];
  const nodesG = [0];
  const h0 = heuristic(startBoxes);
  if (h0 === Infinity) return null;

  const heap = new Heap();
  let counter = 0;
  heap.push([h0, h0, counter++, 0]);
  const best = new Map(); // state key -> best g seen
  best.set(startBoxes.join(',') + '|' + startPlayer, 0);

  let expansions = 0;
  while (heap.size) {
    const [, , , ni] = heap.pop();
    const boxes = nodesBoxes[ni];
    const player = nodesPlayer[ni];
    const g = nodesG[ni];
    if (expansions++ >= maxExpansions) return null;
    const boxSet = new Set(boxes);
    const fl = flood(W, H, wall, floor, player, boxSet);
    const region = fl.region;
    // canonical player position = smallest reachable cell (state dedup)
    // (we still keep the real player position in the node for pathing)
    for (let bi = 0; bi < n; bi++) {
      const b = boxes[bi];
      const bx = b % W, by = (b / W) | 0;
      for (let d = 0; d < 4; d++) {
        const px = bx - DC[d], py = by - DR[d]; // pusher cell
        const tx = bx + DC[d], ty = by + DR[d]; // target cell
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const pcell = py * W + px;
        const tcell = ty * W + tx;
        if (!region.has(pcell)) continue;
        if (wall[tcell] || (floor && !floor[tcell]) || boxSet.has(tcell)) continue;
        const walk = pathFrom(fl.prev, player, pcell);
        if (walk === null) continue;
        const nb = boxes.slice();
        nb[bi] = tcell;
        nb.sort((a, b) => a - b);
        if (dead[tcell]) continue;
        const nbSet = new Set(nb);
        if (frozen2x2(W, H, wall, floor, nb, nbSet, goalSet)) continue;
        const ng = g + 1;
        // canonical key: boxes + min reachable cell of the new state.
        // Cheap approximation: min of the new region is expensive to
        // compute exactly; use the player's post-push cell (the old box
        // cell) plus a flood only when the key collides. Instead we flood
        // once here (room is tiny) for exact canonicalisation.
        const fl2 = flood(W, H, wall, floor, b, nbSet);
        let canon = Infinity;
        for (const c of fl2.region) if (c < canon) canon = c;
        const key = nb.join(',') + '|' + canon;
        const prevBest = best.get(key);
        if (prevBest !== undefined && prevBest <= ng) continue;
        best.set(key, ng);
        const move = walk + CH[d];
        const idx = nodesBoxes.length;
        nodesBoxes.push(nb);
        nodesPlayer.push(b); // after a push the player stands on old box cell
        nodesParent.push(ni);
        nodesMove.push(move);
        nodesG.push(ng);
        if (isGoal(nb)) {
          // reconstruct
          let s = '';
          let cur = idx;
          const parts = [];
          while (cur > 0) { parts.push(nodesMove[cur]); cur = nodesParent[cur]; }
          parts.reverse();
          s = parts.join('');
          return { moves: s, pushes: ng, endPlayer: b };
        }
        const h = heuristic(nb);
        if (h === Infinity) continue;
        heap.push([ng + h, h, counter++, idx]);
      }
    }
  }
  return null;
}

// ------------------------------------------------------------ level solve
function solveLevel(lv) {
  const { W, H, wall, goals, boxes, player } = lv;
  if (boxes.length === 0) return '';
  const goalSet = new Set(goals);
  if (boxes.every((b) => goalSet.has(b))) return '';

  const floorAll = null; // every non-wall cell
  const rooms = decompose(lv);
  if (rooms) {
    const solved = [];
    let ok = true;
    for (const r of rooms) {
      const res = solveSub(W, H, wall, r.floor, r.boxes, r.goals, r.entry, 400000, r.entry);
      if (!res) { ok = false; break; }
      solved.push({ room: r, res });
    }
    if (ok) {
      const stitched = stitch(lv, rooms, solved);
      if (stitched !== null && replay(lv, stitched).solved) return stitched;
    }
  }
  // Fallback: whole-level A* (weaker heuristic, larger cap).
  const whole = solveSub(W, H, wall, floorAll, boxes, goals, player, 1500000, -1);
  if (whole && replay(lv, whole.moves).solved) return whole.moves;
  return ''; // valid empty answer rather than an illegal one
}

// Split into rooms off the hallway row (the player's row).
// Returns null when the shape does not match the generator's layout.
function decompose(lv) {
  const { W, H, wall, goals, boxes, player } = lv;
  if (player < 0) return null;
  const hy = (player / W) | 0;
  const goalSet = new Set(goals);
  const boxSet = new Set(boxes);
  // hallway-row floor cells must hold no box/goal
  for (let x = 0; x < W; x++) {
    const c = hy * W + x;
    if (!wall[c] && (boxSet.has(c) || goalSet.has(c))) return null;
  }
  const seen = new Uint8Array(W * H);
  const rooms = [];
  const assignedBoxes = new Set();
  const assignedGoals = new Set();
  for (let i = 0; i < W * H; i++) {
    const y = (i / W) | 0;
    if (wall[i] || y === hy || seen[i]) continue;
    // BFS one component of off-hallway floor
    const comp = [];
    const q = [i];
    seen[i] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      comp.push(c);
      const x = c % W, yy = (c / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DC[d], ny = yy + DR[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (wall[n] || seen[n]) continue;
        if (ny === hy) continue;
        seen[n] = 1;
        q.push(n);
      }
    }
    const compSet = new Set(comp);
    const rBoxes = comp.filter((c) => boxSet.has(c));
    const rGoals = comp.filter((c) => goalSet.has(c));
    if (rBoxes.length === 0 && rGoals.length === 0) continue; // empty pocket
    if (rBoxes.length === 0 || rBoxes.length !== rGoals.length) return null;
    // door: the single component cell adjacent to a hallway floor cell;
    // entry: that hallway cell (the player starts a room solve there, so
    // a box sitting on the door can be pushed back up into the room).
    let door = -1, entry = -1;
    for (const c of comp) {
      const x = c % W, y = (c / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DC[d], ny = y + DR[d];
        if (ny === hy && nx >= 0 && nx < W && !wall[ny * W + nx]) {
          if (door !== -1) return null; // more than one opening
          door = c;
          entry = ny * W + nx;
        }
      }
    }
    if (door < 0) return null;
    for (const b of rBoxes) assignedBoxes.add(b);
    for (const g of rGoals) assignedGoals.add(g);
    const floor = new Uint8Array(W * H);
    for (const c of comp) floor[c] = 1;
    floor[entry] = 1; // player-only cell in front of the door
    rooms.push({ floor, boxes: rBoxes, goals: rGoals, door, entry });
  }
  if (rooms.length === 0) return null;
  if (assignedBoxes.size !== boxes.length || assignedGoals.size !== goals.length) return null;
  rooms.sort((a, b) => a.door - b.door);
  return rooms;
}

// Walk between rooms through the hallway and concatenate room solutions.
function stitch(lv, rooms, solved) {
  const { W, H, wall, boxes } = lv;
  let curBoxes = boxes.slice();
  let curPlayer = lv.player;
  let out = '';
  for (const { room, res } of solved) {
    const boxSet = new Set(curBoxes);
    const fl = flood(W, H, wall, null, curPlayer, boxSet);
    const walk = pathFrom(fl.prev, curPlayer, room.entry);
    if (walk === null) return null;
    out += walk;
    out += res.moves;
    // update state: this room's boxes are now on its goals
    const roomBoxSet = new Set(room.boxes);
    curBoxes = curBoxes.filter((b) => !roomBoxSet.has(b)).concat(room.goals.slice());
    curPlayer = res.endPlayer;
  }
  return out;
}

// Replay a move string on the level; returns { solved, pushes, legal }.
function replay(lv, moves) {
  const { W, H, wall, goals, boxes, player } = lv;
  const goalSet = new Set(goals);
  const boxSet = new Set(boxes);
  let p = player;
  let pushes = 0;
  for (const ch of moves) {
    const d = CH.indexOf(ch.toLowerCase());
    if (d < 0) continue; // whitespace is ignored by the checker; other chars invalid
    const x = p % W, y = (p / W) | 0;
    const nx = x + DC[d], ny = y + DR[d];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return { solved: false, pushes, legal: false };
    const n = ny * W + nx;
    if (wall[n]) return { solved: false, pushes, legal: false };
    if (boxSet.has(n)) {
      const tx = nx + DC[d], ty = ny + DR[d];
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return { solved: false, pushes, legal: false };
      const t = ty * W + tx;
      if (wall[t] || boxSet.has(t)) return { solved: false, pushes, legal: false };
      boxSet.delete(n);
      boxSet.add(t);
      pushes++;
    }
    p = n;
  }
  let solved = true;
  for (const b of boxSet) if (!goalSet.has(b)) { solved = false; break; }
  return { solved, pushes, legal: true };
}

// ------------------------------------------------------------------- main
function main() {
  const inDir = '/input';
  const outDir = '/output';
  let ids = [];
  try {
    ids = fs.readdirSync(inDir)
      .filter((d) => { try { return fs.statSync(path.join(inDir, d)).isDirectory(); } catch { return false; } })
      .sort();
  } catch { ids = []; }
  if (!ids.length) ids = ['i001', 'i002', 'i003', 'i004', 'i005'];
  for (const id of ids) {
    const levelPath = path.join(inDir, id, 'level.txt');
    let solution = '';
    try {
      const text = fs.readFileSync(levelPath, 'utf8');
      const lv = parseLevel(text);
      solution = solveLevel(lv);
    } catch {
      solution = '';
    }
    const dir = path.join(outDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'solution.txt'), solution, 'utf8');
  }
}

// Diagnostic hook only: `node main.ts --room-optimum <level.txt>` prints the
// push-optimum of each room as JSON. Never used by the grader (no argv).
if (process.argv[2] === '--room-optimum') {
  const text = fs.readFileSync(process.argv[3], 'utf8');
  const lv = parseLevel(text);
  const rooms = decompose(lv);
  const out = [];
  if (rooms) {
    for (const r of rooms) {
      const res = solveSub(lv.W, lv.H, lv.wall, r.floor, r.boxes, r.goals, r.entry, 400000, r.entry);
      out.push(res ? res.pushes : null);
    }
  }
  console.log(JSON.stringify({ rooms: out, total: out.length && out.every((x) => x !== null) ? out.reduce((a, b) => a + b, 0) : null }));
  process.exit(0);
}

main();
