// Seeded random numbers for SOLMAR BAY: the whole city is generated from one
// fixed seed, so the same streets and buildings appear on every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const rand = mulberry32(seed);
  return {
    // Float in [0, 1).
    next: rand,
    // Float in [min, max).
    range(min, max) { return min + rand() * (max - min); },
    // Integer in [min, max] inclusive.
    int(min, max) { return Math.floor(min + rand() * (max - min + 1)); },
    // One element of an array.
    pick(list) { return list[Math.floor(rand() * list.length)]; },
    // True with probability p.
    chance(p) { return rand() < p; },
  };
}

// Clamp a value into [min, max].
export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

// Distance between two points.
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Angle from (ax, ay) toward (bx, by).
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

// Shortest signed turn from angle a toward angle b.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
