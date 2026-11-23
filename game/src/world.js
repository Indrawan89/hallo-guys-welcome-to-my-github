// SOLMAR BAY's city: one seeded procedural map — road grid, eight districts,
// buildings, parks, a beach on the west edge, parked cars and pickups.
// Everything here is generated from WORLD_SEED, so every run plays the same city.
import { makeRng } from './rng.js';

export const WORLD_SIZE = 3400;
export const WORLD_SEED = 20261123;

// Roads run at these coordinates (both axes); road width is 70 px.
export const ROADS = [170, 680, 1190, 1700, 2210, 2720, 3230];
export const ROAD_W = 70;

// Eight districts in a 4 x 2 grid, each with its own ground tint and accent.
export const DISTRICTS = [
  { name: 'Marina Bay', ground: '#3f7d6b', accent: '#ffd166', x: 0, y: 0, w: 850, h: 1700 },
  { name: 'Old Town', ground: '#8a6f4d', accent: '#e07a5f', x: 850, y: 0, w: 850, h: 1700 },
  { name: 'Sunset Strip', ground: '#7d4a6b', accent: '#f4a261', x: 1700, y: 0, w: 850, h: 1700 },
  { name: 'Palm Court', ground: '#4d7a4a', accent: '#a8e063', x: 2550, y: 0, w: 850, h: 1700 },
  { name: 'Harbor Lights', ground: '#3d5a80', accent: '#98c1d9', x: 0, y: 1700, w: 850, h: 1700 },
  { name: 'Dockside', ground: '#5c5c6e', accent: '#ee6c4d', x: 850, y: 1700, w: 850, h: 1700 },
  { name: 'North Hills', ground: '#6b705c', accent: '#d9c27a', x: 1700, y: 1700, w: 850, h: 1700 },
  { name: 'University Quarter', ground: '#7a5c8a', accent: '#f1c40f', x: 2550, y: 1700, w: 850, h: 1700 },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[0];
}

// True when a point sits on a road (including the beach promenade at x = 170).
export function isRoad(x, y) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < ROAD_W / 2 || Math.abs(y - r) < ROAD_W / 2) return true;
  }
  return false;
}

// True when a point is on the beach strip (west edge, west of the first road).
export function isBeach(x, y) {
  return x < 170 - ROAD_W / 2 && y >= 0 && y <= WORLD_SIZE;
}

// Circle vs building-rectangle collision: returns a corrected position.
export function collideBuildings(x, y, radius, buildings) {
  let nx = x, ny = y;
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx, dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 === 0) { nx = b.x - radius; continue; }
      const d = Math.sqrt(d2);
      nx = cx + (dx / d) * radius;
      ny = cy + (dy / d) * radius;
    }
  }
  return { x: nx, y: ny };
}

export function generateWorld() {
  const rng = makeRng(WORLD_SEED);
  const buildings = [];
  const parks = [];
  const trees = [];
  const parkedCars = [];
  const pickups = [];

  // City blocks sit between neighbouring roads.
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const bx0 = ROADS[i] + ROAD_W / 2 + 12;
      const by0 = ROADS[j] + ROAD_W / 2 + 12;
      const bx1 = ROADS[i + 1] - ROAD_W / 2 - 12;
      const by1 = ROADS[j + 1] - ROAD_W / 2 - 12;
      // The south-west block is the beach; leave it open.
      if (bx0 < 200 && by0 > 2900) continue;
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      const district = districtAt(cx, cy);
      if (rng.chance(0.16)) {
        parks.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0, district });
        const n = rng.int(6, 12);
        for (let t = 0; t < n; t++) {
          trees.push({ x: rng.range(bx0 + 20, bx1 - 20), y: rng.range(by0 + 20, by1 - 20) });
        }
        continue;
      }
      const count = rng.int(1, 4);
      for (let k = 0; k < count; k++) {
        const w = rng.range(90, 180), h = rng.range(90, 180);
        const x = rng.range(bx0, Math.max(bx0 + 1, bx1 - w));
        const y = rng.range(by0, Math.max(by0 + 1, by1 - h));
        buildings.push({
          x, y, w, h,
          color: rng.pick(['#5b6b7a', '#7a6a5b', '#6b7a6b', '#8a7a8a', '#4a5a6b', '#9a8a6a']),
          roof: rng.pick(['#3a4552', '#54453a', '#44523f']),
          district: district.name,
          height: rng.int(1, 3),
        });
      }
    }
  }

  // Palm trees along the beach promenade.
  for (let y = 120; y < WORLD_SIZE; y += 130) {
    trees.push({ x: rng.range(95, 130), y: y + rng.range(-20, 20), palm: true });
  }

  // Parked cars along road edges (stealable).
  const carColors = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#e67e22', '#8e44ad'];
  for (let n = 0; n < 14; n++) {
    const horizontal = rng.chance(0.5);
    const road = rng.pick(ROADS);
    const along = rng.range(240, WORLD_SIZE - 240);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = horizontal ? along : road + side * (ROAD_W / 2 + 14);
    const y = horizontal ? road + side * (ROAD_W / 2 + 14) : along;
    if (isBeach(x, y)) continue;
    parkedCars.push({ x, y, angle: horizontal ? 0 : Math.PI / 2, color: rng.pick(carColors), taken: false });
  }

  // Cash and health pickups scattered near roads.
  for (let n = 0; n < 18; n++) {
    const road = rng.pick(ROADS);
    const along = rng.range(200, WORLD_SIZE - 200);
    const horizontal = rng.chance(0.5);
    const x = horizontal ? along : road;
    const y = horizontal ? road : along;
    pickups.push({ x, y, kind: n % 3 === 0 ? 'health' : 'cash', taken: false, bob: rng.range(0, 6) });
  }

  return { buildings, parks, trees, parkedCars, pickups };
}

// Named places missions point at (all on roads, so they are reachable).
export const PLACES = {
  rayMeet: { x: 680, y: 170, name: "Ray's Marina", district: 'Marina Bay' },
  packagePickup: { x: 2210, y: 680, name: 'Sunset Courier', district: 'Sunset Strip' },
  oldTownDrop: { x: 1190, y: 170, name: 'Old Town Plaza', district: 'Old Town' },
  stripStash1: { x: 1700, y: 1190, name: 'Strip Stash 1', district: 'Sunset Strip' },
  stripStash2: { x: 2210, y: 1190, name: 'Strip Stash 2', district: 'Sunset Strip' },
  stripStash3: { x: 2720, y: 680, name: 'Strip Stash 3', district: 'Sunset Strip' },
  safehouse: { x: 2720, y: 2720, name: 'North Hills Safehouse', district: 'North Hills' },
  bank: { x: 680, y: 2210, name: 'Harbor Lights Bank', district: 'Harbor Lights' },
  yacht: { x: 170, y: 3230, name: 'Marina Yacht', district: 'Marina Bay' },
  spawn: { x: 680, y: 3230, name: 'Dockside', district: 'Dockside' },
};
