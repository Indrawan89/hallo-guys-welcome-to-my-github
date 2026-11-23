// The living city: the player (on foot or in a car), traffic, pedestrians who
// flee, and police who chase when the wanted level rises.
import { makeRng, clamp, dist, angleTo, angleDiff } from './rng.js';
import { ROADS, ROAD_W, WORLD_SIZE, collideBuildings, isRoad } from './world.js';

const CAR_COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#e67e22', '#8e44ad', '#16a085'];
const PED_SHIRTS = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#9b59b6', '#1abc9c', '#fd79a8'];

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    onFoot: true, health: 100, money: 0,
    car: null, // the car being driven, when any
    wanted: 0, wantedTimer: 0,
    invulnerable: 0,
  };
}

export function createTraffic(count, rng) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const horizontal = rng.chance(0.5);
    const road = rng.pick(ROADS);
    const dir = rng.chance(0.5) ? 1 : -1;
    cars.push({
      horizontal, road, dir,
      pos: rng.range(100, WORLD_SIZE - 100),
      speed: rng.range(90, 150),
      color: rng.pick(CAR_COLORS),
      stopped: 0,
    });
  }
  return cars;
}

export function createPedestrians(count, rng) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const road = rng.pick(ROADS);
    const along = rng.range(150, WORLD_SIZE - 150);
    const horizontal = rng.chance(0.5);
    peds.push({
      x: horizontal ? along : road + rng.range(-55, 55),
      y: horizontal ? road + rng.range(-55, 55) : along,
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(28, 55),
      shirt: rng.pick(PED_SHIRTS),
      flee: 0, // seconds left of fleeing
      targetAngle: rng.range(0, Math.PI * 2),
      retarget: rng.range(1, 4),
    });
  }
  return peds;
}

export function createPolice() {
  return []; // spawned on demand by wanted level
}

// --- Player movement -------------------------------------------------------

export function updatePlayerOnFoot(p, input, dt, world) {
  const mv = input.moveVector();
  const speed = 185;
  let nx = p.x + mv.x * speed * dt;
  let ny = p.y + mv.y * speed * dt;
  nx = clamp(nx, 30, WORLD_SIZE - 30);
  ny = clamp(ny, 30, WORLD_SIZE - 30);
  const fixed = collideBuildings(nx, ny, 14, world.buildings);
  p.x = fixed.x; p.y = fixed.y;
  if (mv.x !== 0 || mv.y !== 0) p.angle = Math.atan2(mv.y, mv.x);
  p.speed = (mv.x !== 0 || mv.y !== 0) ? speed : 0;
  if (p.invulnerable > 0) p.invulnerable -= dt;
}

export function updatePlayerCar(p, input, dt, world, onCrash) {
  const car = p.car;
  const accel = input.down('w', 'arrowup') ? 1 : input.down('s', 'arrowdown') ? -0.6 : 0;
  const steer = input.down('a', 'arrowleft') ? -1 : input.down('d', 'arrowright') ? 1 : 0;
  const handbrake = input.down(' ');
  const maxSpeed = 430;
  car.speed += accel * 320 * dt;
  if (accel === 0) car.speed *= Math.pow(0.4, dt); // rolling drag
  if (handbrake) car.speed *= Math.pow(0.05, dt);
  car.speed = clamp(car.speed, -140, maxSpeed);
  const dir = car.speed >= 0 ? 1 : -1;
  car.angle += steer * 1.9 * dt * dir * clamp(Math.abs(car.speed) / 120, 0, 1);
  let nx = car.x + Math.cos(car.angle) * car.speed * dt;
  let ny = car.y + Math.sin(car.angle) * car.speed * dt;
  nx = clamp(nx, 30, WORLD_SIZE - 30);
  ny = clamp(ny, 30, WORLD_SIZE - 30);
  const before = { x: car.x, y: car.y };
  const fixed = collideBuildings(nx, ny, 20, world.buildings);
  if (Math.abs(fixed.x - nx) > 0.5 || Math.abs(fixed.y - ny) > 0.5) {
    // Hit a building: stop hard and take a little damage.
    if (Math.abs(car.speed) > 120 && onCrash) onCrash(Math.abs(car.speed));
    car.speed *= 0.25;
  }
  car.x = fixed.x; car.y = fixed.y;
  p.x = car.x; p.y = car.y; p.angle = car.angle; p.speed = Math.abs(car.speed);
  if (p.invulnerable > 0) p.invulnerable -= dt;
}

// Enter the nearest parked car within reach; returns the car or null.
export function tryEnterCar(p, parkedCars) {
  let best = null, bestD = 70;
  for (const c of parkedCars) {
    if (c.taken) continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return null;
  best.taken = true;
  p.onFoot = false;
  p.car = { x: best.x, y: best.y, angle: best.angle, speed: 0, color: best.color, parked: true };
  return best;
}

export function exitCar(p, parkedCars) {
  if (!p.car) return;
  const c = p.car;
  parkedCars.push({ x: c.x, y: c.y, angle: c.angle, color: c.color, taken: false });
  p.car = null;
  p.onFoot = true;
  p.x = c.x + Math.cos(c.angle + Math.PI / 2) * 34;
  p.y = c.y + Math.sin(c.angle + Math.PI / 2) * 34;
  p.speed = 0;
}

// --- Traffic ----------------------------------------------------------------

export function updateTraffic(cars, dt, player, onNearMiss) {
  for (const c of cars) {
    if (c.stopped > 0) { c.stopped -= dt; continue; }
    c.pos += c.dir * c.speed * dt;
    if (c.pos < 90 || c.pos > WORLD_SIZE - 90) {
      c.dir *= -1;
      c.pos = clamp(c.pos, 90, WORLD_SIZE - 90);
    }
    // At an intersection, sometimes turn onto the crossing road.
    const onCross = ROADS.some((r) => Math.abs(c.pos - r) < 4);
    if (onCross && Math.random() < 0.004) {
      const other = c.horizontal;
      c.horizontal = !other;
      const tmp = c.road;
      c.road = c.pos;
      c.pos = tmp;
      c.dir = Math.random() < 0.5 ? 1 : -1;
    }
    // Don't rear-end the player: brake when close ahead.
    const cx = c.horizontal ? c.pos : c.road;
    const cy = c.horizontal ? c.road : c.pos;
    const d = dist(cx, cy, player.x, player.y);
    if (d < 90 && onNearMiss && Math.abs(player.speed) > 200) onNearMiss();
    if (d < 55) c.stopped = 0.8;
  }
}

export function trafficPosition(c) {
  return c.horizontal ? { x: c.pos, y: c.road, angle: c.dir > 0 ? 0 : Math.PI }
    : { x: c.road, y: c.pos, angle: c.dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
}

// --- Pedestrians ------------------------------------------------------------

export function updatePedestrians(peds, dt, player, world) {
  for (const p of peds) {
    const d = dist(p.x, p.y, player.x, player.y);
    if (d < 130 && player.speed > 60) p.flee = 2.5; // scared of a speeding car
    if (p.flee > 0) {
      p.flee -= dt;
      p.targetAngle = angleTo(player.x, player.y, p.x, p.y);
    } else {
      p.retarget -= dt;
      if (p.retarget <= 0) {
        p.retarget = 2 + Math.random() * 3;
        p.targetAngle = Math.random() * Math.PI * 2;
      }
    }
    const sp = p.flee > 0 ? p.speed * 2.6 : p.speed;
    p.angle += angleDiff(p.angle, p.targetAngle) * Math.min(1, dt * 6);
    let nx = p.x + Math.cos(p.angle) * sp * dt;
    let ny = p.y + Math.sin(p.angle) * sp * dt;
    // Peds stay near roads and out of buildings.
    if (!isRoad(nx, ny) && Math.random() < 0.7) { p.targetAngle += Math.PI / 2; continue; }
    const fixed = collideBuildings(nx, ny, 10, world.buildings);
    p.x = clamp(fixed.x, 30, WORLD_SIZE - 30);
    p.y = clamp(fixed.y, 30, WORLD_SIZE - 30);
  }
}

// --- Police -----------------------------------------------------------------

export function updatePolice(police, dt, player, world, rng, onBusted) {
  const want = Math.min(5, Math.floor(player.wanted));
  // Spawn up to one cruiser per wanted star, at a road near the player.
  while (police.length < want) {
    const road = ROADS[Math.floor(rng.next() * ROADS.length)];
    const horizontal = rng.next() < 0.5;
    const along = clamp(player.x + (rng.next() < 0.5 ? -1 : 1) * rng.range(500, 800), 100, WORLD_SIZE - 100);
    police.push({
      x: horizontal ? along : road,
      y: horizontal ? road : clamp(player.y + (rng.next() < 0.5 ? -1 : 1) * rng.range(500, 800), 100, WORLD_SIZE - 100),
      angle: 0, speed: 0, color: '#1a1a2e', siren: rng.next(),
    });
  }
  while (police.length > want) police.pop();

  for (const c of police) {
    const target = angleTo(c.x, c.y, player.x, player.y);
    c.angle += angleDiff(c.angle, target) * Math.min(1, dt * 2.2);
    const sp = 300 + want * 22;
    c.speed = Math.min(sp, c.speed + 260 * dt);
    let nx = c.x + Math.cos(c.angle) * c.speed * dt;
    let ny = c.y + Math.sin(c.angle) * c.speed * dt;
    const fixed = collideBuildings(nx, ny, 20, world.buildings);
    c.x = clamp(fixed.x, 30, WORLD_SIZE - 30);
    c.y = clamp(fixed.y, 30, WORLD_SIZE - 30);
    // Busted: a cruiser catches the player on foot.
    if (player.onFoot && dist(c.x, c.y, player.x, player.y) < 30 && player.invulnerable <= 0) {
      onBusted();
    }
    // Rammed: a cruiser hits the player's car hard.
    if (!player.onFoot && dist(c.x, c.y, player.x, player.y) < 34 && c.speed > 150) {
      player.health -= 25 * dt;
      c.speed *= 0.4;
    }
  }
}

// Wanted level slowly cools off when no cruiser is close.
export function decayWanted(p, dt, police) {
  if (p.wanted <= 0) return;
  const near = police.some((c) => dist(c.x, c.y, p.x, p.y) < 420);
  if (!near) {
    p.wantedTimer += dt;
    if (p.wantedTimer > 9) { p.wanted = Math.max(0, p.wanted - 1); p.wantedTimer = 0; }
  } else {
    p.wantedTimer = 0;
  }
}

export function makeRngFor(seed) { return makeRng(seed); }
