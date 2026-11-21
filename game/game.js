/* ============================================================================
   SOLMAR BAY — an original open-world crime game (top-down 2D canvas).
   A sun-soaked coastal city of 8 districts, 3400x3400 px. On foot and by car:
   steal cars, dodge traffic, outrun the police, run 6 story missions, collect
   cash, fight, hide, and become the King of Solmar Bay.
   Controls: WASD / arrows move & drive, E enter/exit car, SPACE punch / honk,
   P pause, M mute, R restart after game over. Progress auto-saves.
   No network, no libraries, no external assets: every pixel is drawn here.
   ============================================================================ */
'use strict';

/* ---------------- constants & helpers ---------------- */
const WORLD = 3400;                 // world is WORLD x WORLD pixels
const VIEW_W = 1280, VIEW_H = 800;  // logical canvas size
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* Deterministic city layout: same seed -> same streets & buildings every run. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- audio: tiny WebAudio synth, no files ---------------- */
const Sound = {
  ctx: null, muted: false,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  beep(freq, dur, type, vol, slideTo) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  coin() { this.beep(880, 0.09, 'sine', 0.16); setTimeout(() => this.beep(1318, 0.14, 'sine', 0.16), 70); },
  punch() { this.beep(160, 0.1, 'sawtooth', 0.2, 60); },
  crash() { this.beep(90, 0.25, 'sawtooth', 0.25, 40); },
  siren() { this.beep(700, 0.35, 'triangle', 0.07, 1100); },
  mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 'triangle', 0.15), i * 110)); },
  busted() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 'sawtooth', 0.14), i * 160)); },
  honk() { this.beep(370, 0.18, 'square', 0.12); },
  engine() { this.beep(70, 0.12, 'sawtooth', 0.05, 110); },
};

/* ---------------- districts ---------------- */
const DISTRICTS = [
  { name: 'Marina Bay',     x: 0,    y: 0,    w: 1700, h: 1100, ground: '#c9b489', accent: '#2e86c1', desc: 'yachts & neon' },
  { name: 'Old Town',       x: 1700, y: 0,    w: 1700, h: 1100, ground: '#b7a06e', accent: '#b9770e', desc: 'cobbles & cafes' },
  { name: 'Sunset Strip',   x: 0,    y: 1100, w: 1700, h: 900,  ground: '#d9a06b', accent: '#e75480', desc: 'clubs & lights' },
  { name: 'Palm Court',     x: 1700, y: 1100, w: 1700, h: 900,  ground: '#cbb98a', accent: '#27ae60', desc: 'palms & plazas' },
  { name: 'Harbor Lights',  x: 0,    y: 2000, w: 1700, h: 700,  ground: '#a89a7d', accent: '#16a085', desc: 'docks & diners' },
  { name: 'Dockside',       x: 1700, y: 2000, w: 1700, h: 700,  ground: '#9c8f78', accent: '#5d6d7e', desc: 'crates & cranes' },
  { name: 'North Hills',    x: 0,    y: 2700, w: 1700, h: 700,  ground: '#b5c48a', accent: '#7d6608', desc: 'villas & views' },
  { name: 'University Quarter', x: 1700, y: 2700, w: 1700, h: 700, ground: '#c2b280', accent: '#6c3483', desc: 'campus & books' },
];
function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  return DISTRICTS[0];
}

/* ---------------- city generation (seeded) ---------------- */
const ROAD_EVERY = 425;             // road grid spacing
const roadsV = [], roadsH = [];     // road centre lines
for (let x = ROAD_EVERY; x < WORLD; x += ROAD_EVERY) roadsV.push(x);
for (let y = ROAD_EVERY; y < WORLD; y += ROAD_EVERY) roadsH.push(y);

const BUILDINGS = [];               // {x,y,w,h,color,roof,district}
const PARKS = [];                   // {x,y,w,h}
const PALMS = [];                   // {x,y}
(function buildCity() {
  const rng = mulberry32(20261121);
  const palette = ['#e8b4b8', '#f4d58d', '#a8d5ba', '#b8c4e8', '#e8c39e', '#d5a6bd', '#9fc5e8', '#f9e79f', '#f5b7b1', '#a9cce3'];
  for (let gx = 0; gx < 8; gx++) {
    for (let gy = 0; gy < 8; gy++) {
      const bx = gx * ROAD_EVERY + 55, by = gy * ROAD_EVERY + 55;
      const bw = ROAD_EVERY - 110, bh = ROAD_EVERY - 110;
      if (rng() < 0.16) { PARKS.push({ x: bx, y: by, w: bw, h: bh }); continue; }
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const w = 70 + rng() * 110, h = 60 + rng() * 100;
        const x = bx + rng() * (bw - w), y = by + rng() * (bh - h);
        BUILDINGS.push({ x, y, w, h, color: palette[Math.floor(rng() * palette.length)], roof: rng() < 0.5, district: districtAt(x + w / 2, y + h / 2).name });
      }
    }
  }
  for (let i = 0; i < 260; i++) PALMS.push({ x: rng() * WORLD, y: rng() * WORLD });
})();

function onRoad(x, y, margin) {
  for (const rx of roadsV) if (Math.abs(x - rx) < 26 + (margin || 0)) return true;
  for (const ry of roadsH) if (Math.abs(y - ry) < 26 + (margin || 0)) return true;
  return false;
}
function hitsBuilding(x, y, r) {
  for (const b of BUILDINGS) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}
function randomRoadPoint() {
  if (Math.random() < 0.5) return { x: pick(roadsV) + rand(-14, 14), y: rand(80, WORLD - 80) };
  return { x: rand(80, WORLD - 80), y: pick(roadsH) + rand(-14, 14) };
}
function randomWalkPoint() {
  for (let tries = 0; tries < 40; tries++) {
    const x = rand(80, WORLD - 80), y = rand(80, WORLD - 80);
    if (!hitsBuilding(x, y, 20) && !onRoad(x, y, 0)) return { x, y };
  }
  return { x: 600, y: 600 };
}

/* ---------------- game state ---------------- */
const SAVE_KEY = 'solmar-bay-save-v1';
const Game = {
  state: 'title',           // title | playing | paused | busted | win
  time: 0, clockMin: 9 * 60, // in-game clock, minutes since midnight
  money: 250, health: 100,
  wanted: 0, wantedHeat: 0, // heat 0..100 drives stars; hiding cools it
  missionIndex: 0, missionsDone: 0,
  carsStolen: 0, pedsBumped: 0, cashCollected: 0, copsDodged: 0,
  shotsFired: 0, arrests: 0,
  camX: 0, camY: 0,
  shake: 0, slowmo: 1,
  dialogUntil: 0, toastUntil: 0,
  mission: null,            // active mission runtime object
  statsStart: Date.now(),
};
const player = {
  x: 640, y: 560, angle: 0, speed: 0,
  onFoot: true, car: null, walkSpeed: 230,
  punchCd: 0, invuln: 0, hidden: false,
};
const keys = {};
let traffic = [];     // AI cars
let peds = [];        // pedestrians
let cops = [];        // police cars
let pickups = [];     // cash / health
let particles = [];   // sparks, smoke, stars
let floaters = [];    // floating score text
let bullets = [];     // player punches are melee; bullets are cop rubber shots (visual)

/* ---------------- missions: 6-chapter story ---------------- */
const MISSIONS = [
  {
    id: 'first-wheels', title: 'MISSION 1 — FIRST WHEELS', speaker: 'RAY',
    brief: 'Ray "Sunny" Marlowe just got out. No car, no cash, no crew. Steal a car and drive to the yellow marker at Marina Bay.',
    text: 'Steal any car (walk up and press E), then drive to the marker in Marina Bay.',
    dialog: 'RAY: Fresh out, broke as ever. First rule of Solmar Bay — if it has wheels, it can be yours. Grab a car, meet me at the marina.',
    setup(g) { g.target = { x: 500, y: 300, r: 90, label: 'MARINA MEET' }; },
    check(g) { return player.car && dist(player.x, player.y, g.target.x, g.target.y) < g.target.r; },
    reward: 300,
  },
  {
    id: 'delivery-run', title: 'MISSION 2 — DELIVERY RUN', speaker: 'RAY',
    brief: 'Ray needs a package moved across town before the lunch rush. Drive it to Old Town — fast driving earns a bonus, crashing costs you.',
    text: 'Drive the package to Old Town. Don\'t smash the car up — every crash docks your pay.',
    dialog: 'RAY: Got a package for Old Town. No questions, no peeking. Get it there in one piece and there is $500 in it for you.',
    setup(g) { g.target = { x: 2950, y: 320, r: 100, label: 'DROP-OFF' }; g.crashes = 0; },
    check(g) { return player.car && dist(player.x, player.y, g.target.x, g.target.y) < g.target.r; },
    reward: 500,
  },
  {
    id: 'shakedown', title: 'MISSION 3 — SHAKEDOWN', speaker: 'LENA',
    brief: 'Lena runs the Sunset Strip. Three of her debtors left cash stashes around the Strip — collect all three, and watch out for their goons.',
    text: 'Collect 3 cash stashes on the Sunset Strip. Punch goons with SPACE if they get close.',
    dialog: 'LENA: Three deadbeats owe me. Their cash is stashed around the Strip — grab all three bags and I will cut you in. Mind the goons.',
    setup(g) {
      g.target = { x: 850, y: 1500, r: 120, label: 'SUNSET STRIP' };
      g.need = 3; g.got = 0;
      for (let i = 0; i < 3; i++) {
        const p = { x: 300 + i * 550 + rand(-80, 80), y: 1350 + rand(0, 420) };
        pickups.push({ kind: 'stash', x: p.x, y: p.y, val: 200, bob: rand(0, 6) });
      }
    },
    check(g) { return g.got >= g.need; },
    onPickup(g) { if (Game.lastPickupKind === 'stash') { g.got++; showToast(g.got + ' / ' + g.need + ' STASHES'); } },
    reward: 600,
  },
  {
    id: 'heat-rising', title: 'MISSION 4 — HEAT RISING', speaker: 'RAY',
    brief: 'The job went loud. Solmar Bay PD is all over you — lose the heat completely, then lay low at the Harbor Lights safehouse.',
    text: 'Lose your wanted level completely, then reach the safehouse in Harbor Lights.',
    dialog: 'RAY: You made the news, kid. Cops everywhere. Shake them — hide, lay low — then get to my safehouse at Harbor Lights.',
    setup(g) { addWanted(2); g.target = { x: 850, y: 2350, r: 100, label: 'SAFEHOUSE' }; },
    check(g) { return Game.wanted === 0 && dist(player.x, player.y, g.target.x, g.target.y) < g.target.r; },
    reward: 450,
  },
  {
    id: 'harbor-deal', title: 'MISSION 5 — THE HARBOR DEAL', speaker: 'LENA',
    brief: 'A midnight exchange at Dockside: Lena\'s buyer wants the goods, the dock guards want a cut. Reach the crates, grab the briefcase, get out clean.',
    text: 'Reach the Dockside crates and grab the briefcase. Avoid the dock guards — or punch through them.',
    dialog: 'LENA: The buyer is waiting at Dockside. Grab the briefcase from the crates and do NOT let the guards keep it. Clean and quick.',
    setup(g) {
      g.target = { x: 2900, y: 2300, r: 90, label: 'THE CRATES' };
      pickups.push({ kind: 'briefcase', x: 2900, y: 2300, val: 800, bob: 0 });
      for (let i = 0; i < 3; i++) spawnPed('goon', 2700 + i * 140, 2150 + rand(0, 200));
    },
    check(g) { return g.briefcaseGot; },
    onPickup(g) { if (Game.lastPickupKind === 'briefcase') g.briefcaseGot = true; },
    reward: 800,
  },
  {
    id: 'king-of-solmar', title: 'MISSION 6 — KING OF SOLMAR', speaker: 'RAY',
    brief: 'Finale: the whole city is watching. Drive to the Sunset Strip stage for the showdown — the police will throw everything at you on the way.',
    text: 'Fight through the heat and reach the stage on the Sunset Strip. Finish this and the city is yours.',
    dialog: 'RAY: This is it — the Strip stage, tonight. Every cop in Solmar will try to stop you. Get there, and you are the King of Solmar Bay.',
    setup(g) { addWanted(3); g.target = { x: 850, y: 1350, r: 110, label: 'THE STAGE' }; },
    check(g) { return dist(player.x, player.y, g.target.x, g.target.y) < g.target.r; },
    reward: 1500,
  },
];

function startMission(i) {
  const def = MISSIONS[i];
  if (!def) { winGame(); return; }
  const g = { def, target: null, got: 0, need: 0, crashes: 0, briefcaseGot: false };
  Game.mission = g;
  Game.missionIndex = i;
  def.setup(g);
  showDialog(def.speaker, def.dialog);
  updateMissionHUD();
  Sound.mission();
}
function completeMission() {
  const g = Game.mission;
  const reward = g.def.reward;
  Game.money += reward;
  Game.missionsDone++;
  addFloater(player.x, player.y - 40, '+$' + reward, '#7dff9b');
  showToast('MISSION COMPLETE  +$' + reward);
  Sound.mission();
  saveGame();
  setTimeout(() => { if (Game.state === 'playing') startMission(Game.missionIndex + 1); }, 1800);
  Game.mission = null;
  updateMissionHUD();
}

/* ---------------- vehicles & people ---------------- */
const CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#2ecc71', '#fd79a8', '#00cec9'];
const CAR_MODELS = [
  { name: 'Solmar Comet', len: 52, wid: 26, top: 175, accel: 420 },
  { name: 'Bay Cruiser', len: 58, wid: 28, top: 150, accel: 340 },
  { name: 'Strip Racer', len: 50, wid: 24, top: 205, accel: 520 },
  { name: 'Harbor Van', len: 62, wid: 30, top: 130, accel: 280 },
  { name: 'Palm Taxi', len: 54, wid: 26, top: 160, accel: 380 },
];
function makeCar(x, y, angle, modelIdx, isCop) {
  const m = CAR_MODELS[modelIdx == null ? randi(0, CAR_MODELS.length - 1) : modelIdx];
  return {
    x, y, angle: angle || 0, speed: 0, model: m, isCop: !!isCop,
    color: isCop ? '#1a1a2e' : pick(CAR_COLORS),
    ai: null, stuck: 0, honkCd: 0, smoke: 0,
  };
}
function spawnTraffic(n) {
  traffic = [];
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint();
    const car = makeCar(p.x, p.y, Math.random() < 0.5 ? 0 : Math.PI / 2);
    car.ai = { target: randomRoadPoint(), wait: 0, speed: rand(90, 150) };
    traffic.push(car);
  }
}
function spawnPed(kind, x, y) {
  const p = x == null ? randomWalkPoint() : { x, y };
  const ped = {
    x: p.x, y: p.y, angle: rand(0, Math.PI * 2), speed: rand(35, 70),
    kind: kind || pick(['walker', 'walker', 'walker', 'jogger', 'tourist']),
    color: pick(['#ff7675', '#74b9ff', '#fdcb6e', '#55efc4', '#a29bfe', '#fd79a8', '#e17055']),
    tx: p.x, ty: p.y, wait: rand(0, 3), scared: 0, hp: kind === 'goon' ? 3 : 1,
  };
  peds.push(ped);
  return ped;
}
function spawnPeds(n) { peds = []; for (let i = 0; i < n; i++) spawnPed(); }
function spawnCop() {
  const a = rand(0, Math.PI * 2);
  const x = clamp(player.x + Math.cos(a) * 700, 60, WORLD - 60);
  const y = clamp(player.y + Math.sin(a) * 700, 60, WORLD - 60);
  const car = makeCar(x, y, angleTo(x, y, player.x, player.y), 1, true);
  car.ai = { target: { x: player.x, y: player.y }, wait: 0, speed: 235 };
  cops.push(car);
  Sound.siren();
}
function spawnPickups() {
  pickups = [];
  for (let i = 0; i < 14; i++) {
    const p = randomWalkPoint();
    pickups.push({ kind: Math.random() < 0.25 ? 'health' : 'cash', x: p.x, y: p.y, val: Math.random() < 0.25 ? 25 : randi(20, 80), bob: rand(0, 6) });
  }
}

/* ---------------- wanted system ---------------- */
function addWanted(n) {
  Game.wantedHeat = clamp(Game.wantedHeat + n * 25, 0, 100);
  updateWantedStars();
}
function updateWantedStars() {
  const stars = Game.wantedHeat <= 2 ? 0 : Game.wantedHeat <= 22 ? 1 : Game.wantedHeat <= 42 ? 2 : Game.wantedHeat <= 62 ? 3 : Game.wantedHeat <= 84 ? 4 : 5;
  if (stars > Game.wanted && stars >= 2) showToast('WANTED LEVEL ' + stars + ' — POLICE IN PURSUIT');
  Game.wanted = stars;
  const el = document.getElementById('wanted');
  el.classList.toggle('hot', stars >= 3);
  [...el.children].forEach((s, i) => s.classList.toggle('lit', i < stars));
}
function updateWanted(dt) {
  // Heat cools when hidden (in a park / alley / far from cops) and slowly otherwise.
  const nearCop = cops.some(c => dist(c.x, c.y, player.x, player.y) < 420);
  const hidden = player.hidden || (!nearCop && player.speed < 5 && Game.wanted > 0 && onRoad(player.x, player.y, 0) === false);
  if (Game.wanted > 0 && !nearCop) Game.wantedHeat = Math.max(0, Game.wantedHeat - dt * (hidden ? 9 : 2.5));
  else if (Game.wanted > 0 && nearCop) Game.wantedHeat = Math.max(0, Game.wantedHeat - dt * 0.6);
  updateWantedStars();
  const targetCops = Game.wanted === 0 ? 0 : Game.wanted === 1 ? 1 : Game.wanted === 2 ? 2 : Game.wanted === 3 ? 3 : Game.wanted === 4 ? 4 : 5;
  while (cops.length < targetCops) spawnCop();
  if (cops.length > targetCops) cops.splice(targetCops);
}

/* ---------------- fx helpers ---------------- */
function addParticles(x, y, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(20, speed || 160);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), max: 0.8, color, size: rand(2, 5) });
  }
}
function addFloater(x, y, text, color) { floaters.push({ x, y, text, color: color || '#fff', life: 1.4 }); }
function showToast(text) {
  const el = document.getElementById('toast');
  el.textContent = text; el.classList.remove('hidden');
  Game.toastUntil = Game.time + 2.2;
}
function showDialog(speaker, text) {
  // Dialog lines already start with "RAY: " / "LENA: " in the script; strip it
  // so the speaker badge does not print the name twice.
  const prefix = speaker + ': ';
  const clean = text.startsWith(prefix) ? text.slice(prefix.length) : text;
  document.getElementById('dialog-speaker').textContent = speaker + ':';
  document.getElementById('dialog-text').textContent = clean;
  document.getElementById('dialog').classList.remove('hidden');
  Game.dialogUntil = Game.time + 6;
}
function damagePlayer(amount, fromX, fromY) {
  if (player.invuln > 0 || Game.state !== 'playing') return;
  Game.health -= amount;
  player.invuln = 0.7;
  Game.shake = 10;
  addParticles(player.x, player.y, 10, '#ff5a4e', 200);
  Sound.punch();
  if (Game.health <= 0) { Game.health = 0; gameOver(false); }
  updateHUD();
}

/* ---------------- input ---------------- */
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key.toLowerCase() === 'e' && Game.state === 'playing') tryEnterExitCar();
  if (e.key.toLowerCase() === ' ' && Game.state === 'playing') doAction();
  if (e.key.toLowerCase() === 'p' && (Game.state === 'playing' || Game.state === 'paused')) togglePause();
  if (e.key.toLowerCase() === 'm') { Sound.muted = !Sound.muted; showToast(Sound.muted ? 'SOUND OFF' : 'SOUND ON'); }
  if (e.key.toLowerCase() === 'r' && (Game.state === 'busted' || Game.state === 'win')) restartGame();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
document.getElementById('btn-play').addEventListener('click', () => { Sound.ensure(); startNewGame(); });
document.getElementById('btn-continue').addEventListener('click', () => { Sound.ensure(); loadGame(); });
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-restart').addEventListener('click', () => { document.getElementById('pause-screen').classList.add('hidden'); startNewGame(); });
document.getElementById('btn-quit-title').addEventListener('click', () => { document.getElementById('pause-screen').classList.add('hidden'); showTitle(); });
document.getElementById('btn-retry').addEventListener('click', restartGame);
document.getElementById('btn-title2').addEventListener('click', showTitle);
document.getElementById('btn-again').addEventListener('click', restartGame);
document.getElementById('btn-title3').addEventListener('click', showTitle);

function doAction() {
  if (player.onFoot) {
    // Punch: hit the nearest ped / goon in front of you.
    if (player.punchCd > 0) return;
    player.punchCd = 0.45;
    const px = player.x + Math.cos(player.angle) * 34, py = player.y + Math.sin(player.angle) * 34;
    addParticles(px, py, 6, '#ffd23f', 140);
    Sound.punch();
    for (const ped of peds) {
      if (dist(ped.x, ped.y, player.x, player.y) < 55) {
        ped.hp--; ped.scared = 3;
        ped.x += Math.cos(player.angle) * 26; ped.y += Math.sin(player.angle) * 26;
        addFloater(ped.x, ped.y - 24, ped.hp <= 0 ? 'K.O.!' : 'WHAM!', '#ffd23f');
        if (ped.hp <= 0) {
          if (ped.kind === 'goon') { Game.money += 60; addFloater(ped.x, ped.y - 40, '+$60', '#7dff9b'); }
          else addWanted(1);
          peds.splice(peds.indexOf(ped), 1);
          setTimeout(() => { if (Game.state === 'playing') spawnPed(); }, 4000);
        }
        break;
      }
    }
  } else if (player.car) {
    Sound.honk();
    addFloater(player.x, player.y - 40, 'HONK!', '#fff');
  }
}

function nearestCar(maxD) {
  let best = null, bestD = maxD;
  const all = traffic.concat(cops);
  for (const c of all) { const d = dist(c.x, c.y, player.x, player.y); if (d < bestD) { best = c; bestD = d; } }
  return best;
}
function tryEnterExitCar() {
  if (player.onFoot) {
    const car = nearestCar(70);
    if (!car) { showToast('NO CAR NEARBY'); return; }
    player.onFoot = false; player.car = car;
    if (car.isCop) addWanted(2);
    else { Game.carsStolen++; addWanted(1); showToast('CAR STOLEN — ' + car.model.name.toUpperCase()); }
    const idx = traffic.indexOf(car); if (idx >= 0) traffic.splice(idx, 1);
    const cidx = cops.indexOf(car); if (cidx >= 0) cops.splice(cidx, 1);
    player.angle = car.angle; player.speed = 0;
    Sound.engine();
  } else {
    const car = player.car;
    player.onFoot = true; player.car = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.speed = 0;
    car.speed = 0;
    car.ai = { target: randomRoadPoint(), wait: 0, speed: rand(90, 150) };
    traffic.push(car);
  }
  updateHUD();
}

/* ---------------- player update ---------------- */
function updatePlayer(dt) {
  player.punchCd = Math.max(0, player.punchCd - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  const up = keys['w'] || keys['arrowup'], down = keys['s'] || keys['arrowdown'];
  const left = keys['a'] || keys['arrowleft'], right = keys['d'] || keys['arrowright'];

  if (player.onFoot) {
    let mx = (right ? 1 : 0) - (left ? 1 : 0), my = (down ? 1 : 0) - (up ? 1 : 0);
    if (mx || my) {
      const len = Math.hypot(mx, my); mx /= len; my /= len;
      player.angle = Math.atan2(my, mx);
      const nx = player.x + mx * player.walkSpeed * dt, ny = player.y + my * player.walkSpeed * dt;
      if (!hitsBuilding(nx, player.y, 14)) player.x = nx;
      if (!hitsBuilding(player.x, ny, 14)) player.y = ny;
      player.speed = player.walkSpeed;
      if (Math.random() < dt * 6) addParticles(player.x, player.y + 12, 1, '#d8c9a3', 30);
    } else player.speed = 0;
  } else {
    const car = player.car;
    const top = car.model.top * (Game.wanted >= 3 ? 1.12 : 1); // adrenaline at high wanted
    if (up) car.speed += car.model.accel * dt;
    if (down) car.speed -= car.model.accel * 0.9 * dt;
    if (!up && !down) car.speed *= Math.pow(0.4, dt);
    car.speed = clamp(car.speed, -90, top);
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    if (Math.abs(car.speed) > 8) car.angle += steer * 2.4 * dt * Math.sign(car.speed) * clamp(Math.abs(car.speed) / 90, 0.4, 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const hit = hitsBuilding(nx, ny, 20);
    if (hit) {
      if (Math.abs(car.speed) > 120) {
        Game.health -= 6; addParticles(car.x, car.y, 16, '#ffb347', 260); Sound.crash(); Game.shake = 12;
        if (Game.mission && Game.mission.def.id === 'delivery-run') { Game.mission.crashes++; addFloater(car.x, car.y - 40, 'PACKAGE DAMAGED -$50', '#ff5a4e'); Game.money = Math.max(0, Game.money - 50); }
      }
      car.speed *= -0.35;
    } else { car.x = nx; car.y = ny; }
    player.x = car.x; player.y = car.y; player.angle = car.angle; player.speed = Math.abs(car.speed);
    if (Math.abs(car.speed) > 150 && Math.random() < dt * 8) Sound.engine();
    // Running over pedestrians is a crime — and it raises the heat.
    for (const ped of [...peds]) {
      if (Math.abs(car.speed) > 60 && dist(ped.x, ped.y, car.x, car.y) < 30) {
        addParticles(ped.x, ped.y, 14, '#ff7675', 240);
        peds.splice(peds.indexOf(ped), 1);
        Game.pedsBumped++; addWanted(1);
        addFloater(ped.x, ped.y - 30, 'PEDESTRIAN DOWN!', '#ff5a4e');
        setTimeout(() => { if (Game.state === 'playing') spawnPed(); }, 5000);
      }
    }
    // Bump traffic cars.
    for (const other of traffic) {
      if (dist(other.x, other.y, car.x, car.y) < 46) {
        other.x += Math.cos(angleTo(car.x, car.y, other.x, other.y)) * 12;
        other.y += Math.sin(angleTo(car.x, car.y, other.x, other.y)) * 12;
        if (Math.abs(car.speed) > 100) { Sound.crash(); addWanted(0); Game.shake = 6; }
        car.speed *= 0.7;
      }
    }
  }
  player.x = clamp(player.x, 30, WORLD - 30);
  player.y = clamp(player.y, 30, WORLD - 30);
  if (player.onFoot) player.hidden = PARKS.some(p => player.x > p.x && player.x < p.x + p.w && player.y > p.y && player.y < p.y + p.h);
  else player.hidden = false;
}

/* ---------------- traffic / peds / cops AI ---------------- */
function updateTraffic(dt) {
  for (const car of traffic) {
    const ai = car.ai;
    if (!ai) continue;
    if (ai.wait > 0) { ai.wait -= dt; continue; }
    const d = dist(car.x, car.y, ai.target.x, ai.target.y);
    if (d < 60) { ai.target = randomRoadPoint(); continue; }
    const want = angleTo(car.x, car.y, ai.target.x, ai.target.y);
    car.angle += clamp(angleDiff(car.angle, want), -1.8 * dt, 1.8 * dt);
    car.speed = lerp(car.speed, ai.speed, dt * 1.2);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!hitsBuilding(nx, ny, 20)) { car.x = nx; car.y = ny; }
    else { ai.target = randomRoadPoint(); car.angle += Math.PI / 2; }
    // Don't pile into the player.
    if (player.car && dist(car.x, car.y, player.x, player.y) < 50) { car.speed *= 0.5; }
  }
  if (traffic.length < 14 && Math.random() < dt * 0.5) {
    const p = randomRoadPoint();
    const car = makeCar(p.x, p.y, 0);
    car.ai = { target: randomRoadPoint(), wait: 0, speed: rand(90, 150) };
    traffic.push(car);
  }
}
function updatePeds(dt) {
  for (const ped of peds) {
    if (ped.scared > 0) {
      ped.scared -= dt;
      const a = angleTo(player.x, player.y, ped.x, ped.y);
      ped.x += Math.cos(a) * 150 * dt; ped.y += Math.sin(a) * 150 * dt;
      continue;
    }
    if (ped.wait > 0) { ped.wait -= dt; continue; }
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 24) { ped.tx = rand(60, WORLD - 60); ped.ty = rand(60, WORLD - 60); ped.wait = rand(0.5, 3); continue; }
    const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
    ped.angle = a;
    const nx = ped.x + Math.cos(a) * ped.speed * dt, ny = ped.y + Math.sin(a) * ped.speed * dt;
    if (!hitsBuilding(nx, ny, 10) && !onRoad(nx, ny, 0)) { ped.x = nx; ped.y = ny; }
    else { ped.tx = rand(60, WORLD - 60); ped.ty = rand(60, WORLD - 60); }
    // Goons chase and shove the player on foot.
    if (ped.kind === 'goon' && player.onFoot && dist(ped.x, ped.y, player.x, player.y) < 220) {
      ped.tx = player.x; ped.ty = player.y; ped.speed = 110;
      if (dist(ped.x, ped.y, player.x, player.y) < 26) damagePlayer(8, ped.x, ped.y);
    }
  }
}
function updateCops(dt) {
  for (const cop of cops) {
    const d = dist(cop.x, cop.y, player.x, player.y);
    const want = angleTo(cop.x, cop.y, player.x, player.y);
    cop.angle += clamp(angleDiff(cop.angle, want), -2.6 * dt, 2.6 * dt);
    const targetSpeed = d > 300 ? 250 : d > 90 ? 210 : 120;
    cop.speed = lerp(cop.speed, targetSpeed, dt * 1.5);
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    if (!hitsBuilding(nx, ny, 20)) { cop.x = nx; cop.y = ny; } else { cop.angle += 1.2; }
    if (Math.random() < dt * 0.5) Sound.siren();
    // Ram the player: on foot it hurts, in a car it spins you. Caught on foot
    // at wanted 2+ and the cuffs come out: busted, run over.
    if (d < 44) {
      if (player.onFoot) {
        damagePlayer(12, cop.x, cop.y);
        if (Game.wanted >= 2 && Game.health > 0 && Math.random() < 0.02) gameOver(true);
      }
      else if (player.car) {
        player.car.speed *= 0.55; player.car.angle += rand(-0.4, 0.4);
        Game.shake = 8; Sound.crash();
        addParticles(player.x, player.y, 10, '#8fe3ff', 200);
      }
      cop.speed *= 0.4;
      cop.x -= Math.cos(cop.angle) * 20; cop.y -= Math.sin(cop.angle) * 20;
    }
    if (d < 60) addParticles(cop.x, cop.y - 18, 1, Math.random() < 0.5 ? '#ff2d2d' : '#2d7dff', 20);
  }
}

/* ---------------- pickups & mission checks ---------------- */
function updatePickups(dt) {
  for (const p of [...pickups]) {
    p.bob += dt * 3;
    if (dist(p.x, p.y, player.x, player.y) < 42) {
      pickups.splice(pickups.indexOf(p), 1);
      Game.lastPickupKind = p.kind;
      if (p.kind === 'health') {
        Game.health = Math.min(100, Game.health + p.val);
        addFloater(p.x, p.y - 30, '+' + p.val + ' HP', '#7dff9b');
      } else {
        Game.money += p.val; Game.cashCollected++;
        addFloater(p.x, p.y - 30, '+$' + p.val, '#7dff9b');
        Sound.coin();
      }
      if (Game.mission && Game.mission.def.onPickup) Game.mission.def.onPickup(Game.mission);
      updateHUD();
    }
  }
  if (pickups.filter(p => p.kind === 'cash').length < 8 && Math.random() < dt * 0.12) {
    const p = randomWalkPoint();
    pickups.push({ kind: 'cash', x: p.x, y: p.y, val: randi(20, 80), bob: 0 });
  }
}
function updateMission(dt) {
  const g = Game.mission;
  if (!g) return;
  if (g.def.check(g)) {
    Game.mission = null;
    completeMission();
  }
}

/* ---------------- rendering ---------------- */
function drawCar(c, isPlayer) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  const m = c.model, L = m.len, W = m.wid;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  ctx.fillStyle = c.color;
  roundRect(-L / 2, -W / 2, L, W, 8); ctx.fill();
  ctx.fillStyle = 'rgba(20,30,50,.85)';
  roundRect(-L / 2 + 10, -W / 2 + 4, L * 0.32, W - 8, 4); ctx.fill(); // windshield + cabin
  ctx.fillStyle = 'rgba(140,220,255,.5)';
  roundRect(-L / 2 + 12, -W / 2 + 5, 8, W - 10, 3); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(L / 2 - 6, -W / 2 - 2, 5, 6); ctx.fillRect(L / 2 - 6, W / 2 - 4, 5, 6);
  ctx.fillRect(-L / 2 + 2, -W / 2 - 2, 5, 6); ctx.fillRect(-L / 2 + 2, W / 2 - 4, 5, 6);
  if (c.isCop) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
    const blink = Math.floor(Game.time * 6) % 2 === 0;
    ctx.fillStyle = blink ? '#ff2d2d' : '#2d7dff';
    ctx.beginPath(); ctx.arc(0, -W / 2 - 1, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = blink ? '#2d7dff' : '#ff2d2d';
    ctx.beginPath(); ctx.arc(0, W / 2 + 1, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (isPlayer) {
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, L / 2 + 10, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawWorld() {
  const d = districtAt(Game.camX + VIEW_W / 2, Game.camY + VIEW_H / 2);
  // Paint the ground over the VISIBLE world rect (camera-relative), not the
  // world origin: otherwise areas away from (0,0) show through transparent.
  ctx.fillStyle = d.ground;
  ctx.fillRect(Game.camX - 80, Game.camY - 80, VIEW_W + 160, VIEW_H + 160);
  // Beach strip along the west edge (Marina Bay shoreline), in world coords.
  ctx.fillStyle = '#f7e7b4';
  ctx.fillRect(0, 0, 70, WORLD);
  ctx.fillStyle = '#3aa7d6';
  ctx.fillRect(-60, 0, 60, WORLD);
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(70, 0); ctx.lineTo(70, WORLD); ctx.stroke();
  // Parks.
  for (const p of PARKS) {
    if (!onScreen(p.x, p.y, p.w, p.h)) continue;
    ctx.fillStyle = '#7ec850'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#5da83c';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(p.x + 40 + i * 60, p.y + 50 + (i % 2) * 120, 22, 0, Math.PI * 2); ctx.fill(); }
  }
  // Roads.
  ctx.fillStyle = '#3d4450';
  for (const rx of roadsV) ctx.fillRect(rx - 26, 0, 52, WORLD);
  for (const ry of roadsH) ctx.fillRect(0, ry - 26, WORLD, 52);
  ctx.strokeStyle = '#f7d774'; ctx.lineWidth = 3; ctx.setLineDash([26, 30]);
  for (const rx of roadsV) { ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD); ctx.stroke(); }
  for (const ry of roadsH) { ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD, ry); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
  for (const rx of roadsV) { ctx.beginPath(); ctx.moveTo(rx - 26, 0); ctx.lineTo(rx - 26, WORLD); ctx.moveTo(rx + 26, 0); ctx.lineTo(rx + 26, WORLD); ctx.stroke(); }
  for (const ry of roadsH) { ctx.beginPath(); ctx.moveTo(0, ry - 26); ctx.lineTo(WORLD, ry - 26); ctx.moveTo(0, ry + 26); ctx.lineTo(WORLD, ry + 26); ctx.stroke(); }
  // Buildings with roof detail + drop shadow.
  for (const b of BUILDINGS) {
    if (!onScreen(b.x, b.y, b.w, b.h)) continue;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (b.roof) {
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 8, 16, 16);
    } else {
      ctx.fillStyle = 'rgba(20,40,80,.55)';
      const cols = Math.max(2, Math.floor(b.w / 26)), rows = Math.max(2, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ctx.fillRect(b.x + 8 + i * 24, b.y + 8 + j * 24, 12, 12);
    }
  }
  // Palm trees.
  ctx.fillStyle = '#2e8b57';
  for (const p of PALMS) {
    if (!onScreen(p.x, p.y, 10, 10)) continue;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
  }
  // Mission target beacon.
  const g = Game.mission;
  if (g && g.target) {
    const t = g.target, pulse = 1 + Math.sin(Game.time * 4) * 0.12;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, t.r * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,63,.18)';
    ctx.beginPath(); ctx.arc(0, 0, t.r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('▼ ' + t.label, 0, -t.r - 12);
    ctx.restore();
  }
}
function onScreen(x, y, w, h) {
  return x + w > Game.camX - 60 && x < Game.camX + VIEW_W + 60 && y + h > Game.camY - 60 && y < Game.camY + VIEW_H + 60;
}
function drawPickups() {
  for (const p of pickups) {
    if (!onScreen(p.x, p.y, 20, 20)) continue;
    const bobY = Math.sin(p.bob) * 4;
    ctx.save(); ctx.translate(p.x, p.y + bobY);
    if (p.kind === 'health') {
      ctx.fillStyle = '#fff'; ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(-3, -9, 6, 18); ctx.fillRect(-9, -3, 18, 6);
    } else if (p.kind === 'stash' || p.kind === 'briefcase') {
      ctx.fillStyle = p.kind === 'briefcase' ? '#6c3483' : '#8b5a2b';
      roundRect(-13, -10, 26, 20, 4); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-6, -10, 12, 5);
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText('$', 0, 6);
    } else {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b7950b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#b7950b'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('$', 0, 5);
    }
    ctx.restore();
  }
}
function drawPeds() {
  for (const ped of peds) {
    if (!onScreen(ped.x, ped.y, 20, 20)) continue;
    ctx.save(); ctx.translate(ped.x, ped.y);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 9, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5c99b'; ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 - 2, 5, 0, Math.PI * 2); ctx.fill();
    if (ped.kind === 'goon') {
      ctx.fillStyle = '#111'; ctx.fillRect(-8, -14, 16, 5);
      ctx.fillStyle = '#ff5a4e'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -16);
    }
    if (ped.scared > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 10, -12); }
    ctx.restore();
  }
}
function drawPlayer() {
  if (!player.onFoot) return;
  ctx.save(); ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 10, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  if (player.invuln > 0 && Math.floor(Game.time * 12) % 2 === 0) ctx.globalAlpha = 0.4;
  ctx.rotate(player.angle);
  ctx.fillStyle = '#2e86c1'; roundRect(-11, -9, 22, 18, 6); ctx.fill(); // jacket
  ctx.fillStyle = '#f5c99b'; ctx.beginPath(); ctx.arc(11, 0, 6, 0, Math.PI * 2); ctx.fill(); // head
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(12, -3, 5, Math.PI, Math.PI * 2); ctx.fill(); // hair
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(13, -3, 8, 3); ctx.fillRect(13, 0, 8, 3); // fists out
  ctx.restore();
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(player.x, player.y, 20 + Math.sin(Game.time * 3) * 2, 0, Math.PI * 2); ctx.stroke();
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawFloaters() {
  ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - (1.4 - f.life) * 30);
  }
  ctx.globalAlpha = 1;
}
function drawMinimap() {
  const S = 220 / WORLD;
  mctx.clearRect(0, 0, 220, 220);
  mctx.fillStyle = '#0d1b2e'; mctx.fillRect(0, 0, 220, 220);
  for (const d of DISTRICTS) { mctx.fillStyle = d.accent + '55'; mctx.fillRect(d.x * S, d.y * S, d.w * S, d.h * S); }
  mctx.strokeStyle = 'rgba(255,255,255,.6)'; mctx.lineWidth = 1;
  for (const rx of roadsV) { mctx.beginPath(); mctx.moveTo(rx * S, 0); mctx.lineTo(rx * S, 220); mctx.stroke(); }
  for (const ry of roadsH) { mctx.beginPath(); mctx.moveTo(0, ry * S); mctx.lineTo(220, ry * S); mctx.stroke(); }
  const g = Game.mission;
  if (g && g.target) {
    mctx.fillStyle = '#ffd23f';
    mctx.beginPath(); mctx.arc(g.target.x * S, g.target.y * S, 6 + Math.sin(Game.time * 5) * 2, 0, Math.PI * 2); mctx.fill();
  }
  for (const c of cops) { mctx.fillStyle = '#2d7dff'; mctx.beginPath(); mctx.arc(c.x * S, c.y * S, 3.5, 0, Math.PI * 2); mctx.fill(); }
  mctx.fillStyle = '#fff';
  mctx.save(); mctx.translate(player.x * S, player.y * S); mctx.rotate(player.angle);
  mctx.beginPath(); mctx.moveTo(7, 0); mctx.lineTo(-5, -4); mctx.lineTo(-5, 4); mctx.closePath(); mctx.fill();
  mctx.restore();
  // North + view cone edge.
  mctx.strokeStyle = 'rgba(255,255,255,.9)'; mctx.lineWidth = 2;
  mctx.strokeRect(1, 1, 218, 218);
}
function drawVignetteAndSun() {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, 'rgba(255,170,60,.10)');
  grad.addColorStop(0.5, 'rgba(255,170,60,0)');
  grad.addColorStop(1, 'rgba(10,10,40,.18)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Sunset glow top-right.
  const sun = ctx.createRadialGradient(VIEW_W - 120, 90, 10, VIEW_W - 120, 90, 190);
  sun.addColorStop(0, 'rgba(255,220,130,.5)'); sun.addColorStop(1, 'rgba(255,220,130,0)');
  ctx.fillStyle = sun; ctx.fillRect(VIEW_W - 320, 0, 320, 280);
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const shX = Game.shake > 0 ? rand(-Game.shake, Game.shake) : 0;
  const shY = Game.shake > 0 ? rand(-Game.shake, Game.shake) : 0;
  ctx.save();
  ctx.translate(-Game.camX + shX, -Game.camY + shY);
  drawWorld();
  drawPickups();
  for (const c of traffic) if (onScreen(c.x, c.y, 80, 80)) drawCar(c, false);
  for (const c of cops) if (onScreen(c.x, c.y, 80, 80)) drawCar(c, false);
  if (player.car) drawCar(player.car, true);
  drawPeds();
  drawPlayer();
  drawParticles();
  drawFloaters();
  ctx.restore();
  drawVignetteAndSun();
  if (Game.state === 'playing') drawMinimap();
  // Off-screen objective arrow at screen edge.
  const g = Game.mission;
  if (g && g.target && Game.state === 'playing') {
    const sx = g.target.x - Game.camX, sy = g.target.y - Game.camY;
    if (sx < 0 || sx > VIEW_W || sy < 0 || sy > VIEW_H) {
      const cx = VIEW_W / 2, cy = VIEW_H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ex = cx + Math.cos(a) * (VIEW_W / 2 - 60), ey = cy + Math.sin(a) * (VIEW_H / 2 - 60);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.round(dist(player.x, player.y, g.target.x, g.target.y)) + 'm', ex, ey + 30);
    }
  }
}

/* ---------------- HUD ---------------- */
function updateHUD() {
  document.getElementById('money-val').textContent = Game.money;
  document.getElementById('health-fill').style.width = Game.health + '%';
  document.getElementById('health-text').textContent = Math.round(Game.health) + ' HP';
  document.getElementById('speed-val').textContent = Math.round(player.speed * 0.45);
  const h = Math.floor(Game.clockMin / 60) % 24, m = Math.floor(Game.clockMin % 60);
  document.getElementById('clock-time').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  document.getElementById('district-name').textContent = districtAt(player.x, player.y).name;
}
function updateMissionHUD() {
  const g = Game.mission;
  const box = document.getElementById('mission-box');
  if (!g) {
    document.getElementById('mission-title').textContent = 'ALL MISSIONS COMPLETE';
    document.getElementById('mission-text').textContent = 'Solmar Bay is yours. Free-roam, collect cash, dodge the law.';
    document.getElementById('mission-progress').textContent = '';
    return;
  }
  document.getElementById('mission-title').textContent = g.def.title;
  document.getElementById('mission-text').textContent = g.def.text;
  document.getElementById('mission-progress').textContent =
    g.def.id === 'shakedown' ? 'Stashes: ' + g.got + ' / ' + g.need :
    g.def.id === 'delivery-run' ? 'Crashes: ' + g.crashes :
    'Missions done: ' + Game.missionsDone + ' / 6';
}

/* ---------------- flow: title / save / game over / win ---------------- */
function showTitle() {
  Game.state = 'title';
  document.getElementById('title-screen').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('win-screen').classList.add('hidden');
  document.getElementById('pause-screen').classList.add('hidden');
  const hasSave = !!localStorage.getItem(SAVE_KEY);
  document.getElementById('btn-continue').classList.toggle('hidden', !hasSave);
}
function startNewGame() {
  resetWorld();
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  Game.state = 'playing';
  startMission(0);
  updateHUD(); updateMissionHUD();
}
function restartGame() {
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('win-screen').classList.add('hidden');
  startNewGame();
}
function togglePause() {
  if (Game.state === 'playing') {
    Game.state = 'paused';
    document.getElementById('pause-screen').classList.remove('hidden');
    saveGame();
  } else if (Game.state === 'paused') {
    Game.state = 'playing';
    document.getElementById('pause-screen').classList.add('hidden');
  }
}
function gameOver(busted) {
  Game.state = 'busted';
  Game.arrests += busted ? 1 : 0;
  Sound.busted();
  document.getElementById('gameover-title').textContent = busted ? 'BUSTED' : 'WASTED';
  document.getElementById('gameover-text').textContent = busted
    ? 'The Solmar Bay police caught up with you.'
    : 'Solmar Bay chewed you up. Get back out there.';
  document.getElementById('gameover-stats').innerHTML =
    'Missions completed: ' + Game.missionsDone + ' / 6<br>Cash: $' + Game.money +
    ' &nbsp;·&nbsp; Cars stolen: ' + Game.carsStolen + ' &nbsp;·&nbsp; Time: ' + Math.round((Date.now() - Game.statsStart) / 1000) + 's';
  document.getElementById('gameover-screen').classList.remove('hidden');
  localStorage.removeItem(SAVE_KEY);
}
function winGame() {
  Game.state = 'win';
  Sound.mission();
  document.getElementById('win-stats').innerHTML =
    'Final cash: $' + Game.money + '<br>Missions: 6 / 6 &nbsp;·&nbsp; Cars stolen: ' + Game.carsStolen +
    ' &nbsp;·&nbsp; Cash collected: ' + Game.cashCollected + ' &nbsp;·&nbsp; Time: ' + Math.round((Date.now() - Game.statsStart) / 1000) + 's';
  document.getElementById('win-screen').classList.remove('hidden');
  localStorage.removeItem(SAVE_KEY);
}
function resetWorld() {
  Game.money = 250; Game.health = 100; Game.wanted = 0; Game.wantedHeat = 0;
  Game.missionIndex = 0; Game.missionsDone = 0; Game.carsStolen = 0; Game.pedsBumped = 0;
  Game.cashCollected = 0; Game.clockMin = 9 * 60; Game.mission = null; Game.statsStart = Date.now();
  player.x = 640; player.y = 560; player.angle = -Math.PI / 2; player.speed = 0;
  player.onFoot = true; player.car = null; player.punchCd = 0; player.invuln = 0;
  traffic = []; peds = []; cops = []; pickups = []; particles = []; floaters = []; bullets = [];
  spawnTraffic(16); spawnPeds(26); spawnPickups();
  // A few parked cars near the spawn so mission 1 is quick to start.
  for (let i = 0; i < 4; i++) {
    const c = makeCar(560 + i * 90, 700, 0);
    c.ai = null; traffic.push(c);
  }
  updateWantedStars();
}
function saveGame() {
  if (Game.state !== 'playing') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: Game.money, health: Game.health, missionIndex: Game.missionIndex,
      missionsDone: Game.missionsDone, carsStolen: Game.carsStolen, cashCollected: Game.cashCollected,
      x: player.x, y: player.y, clockMin: Game.clockMin,
    }));
  } catch (e) { /* storage unavailable */ }
}
function loadGame() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { /* bad save */ }
  resetWorld();
  if (s) {
    Game.money = s.money; Game.health = s.health; Game.missionsDone = s.missionsDone;
    Game.carsStolen = s.carsStolen; Game.cashCollected = s.cashCollected; Game.clockMin = s.clockMin || 540;
    player.x = s.x; player.y = s.y;
  }
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  Game.state = 'playing';
  startMission(s ? s.missionIndex : 0);
  updateHUD(); updateMissionHUD();
}

/* ---------------- screenshot mode (?shot= & ?seed=) ---------------- */
const params = new URLSearchParams(location.search);
function applyShotMode() {
  const shot = params.get('shot');
  if (!shot) return;
  resetWorld();
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  Game.state = 'playing';
  if (shot === 'start') { showTitle(); return; }
  if (shot === 'play') {
    // On foot in Palm Court, mid-mission 2, cash in view.
    player.x = 2100; player.y = 1350; Game.money = 780; Game.missionsDone = 1;
    startMission(1);
  } else if (shot === 'chase') {
    // Driving fast through Sunset Strip, wanted 4, cops on your tail.
    const car = makeCar(850, 1500, 0, 2);
    player.onFoot = false; player.car = car; player.x = car.x; player.y = car.y;
    car.speed = 190; Game.money = 2450; Game.missionsDone = 5;
    startMission(5); // mission 6 setup adds wanted 3; set the final heat after it
    Game.wantedHeat = 78; updateWantedStars();
    cops = []; for (let i = 0; i < 3; i++) spawnCop();
    showToast('WANTED LEVEL 4 — POLICE IN PURSUIT');
  } else if (shot === 'end') {
    Game.camX = clamp(player.x - VIEW_W / 2, 0, WORLD - VIEW_W);
    Game.camY = clamp(player.y - VIEW_H / 2, 0, WORLD - VIEW_H);
    render(); // paint the city once so the BUSTED overlay sits on a live frame
    gameOver(true);
    return;
  }
  updateHUD(); updateMissionHUD();
  // Freeze a lively frame: run the sim a little so traffic/peds spread out.
  for (let i = 0; i < 40; i++) { updateTraffic(1 / 30); updatePeds(1 / 30); }
  Game.camX = clamp(player.x - VIEW_W / 2, 0, WORLD - VIEW_W);
  Game.camY = clamp(player.y - VIEW_H / 2, 0, WORLD - VIEW_H);
  render();
}

/* ---------------- main loop ---------------- */
let lastT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (Game.state === 'playing') {
    Game.time += dt;
    Game.clockMin += dt * 0.6; // a game day passes in ~40 real minutes
    Game.shake = Math.max(0, Game.shake - dt * 30);
    if (Game.dialogUntil && Game.time > Game.dialogUntil) document.getElementById('dialog').classList.add('hidden');
    if (Game.toastUntil && Game.time > Game.toastUntil) document.getElementById('toast').classList.add('hidden');
    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updateCops(dt);
    updatePickups(dt);
    updateWanted(dt);
    updateMission(dt);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    for (const f of floaters) f.life -= dt;
    floaters = floaters.filter(f => f.life > 0);
    // Camera follows the player, clamped to the world.
    Game.camX = lerp(Game.camX, clamp(player.x - VIEW_W / 2, 0, WORLD - VIEW_W), 1 - Math.pow(0.001, dt));
    Game.camY = lerp(Game.camY, clamp(player.y - VIEW_H / 2, 0, WORLD - VIEW_H), 1 - Math.pow(0.001, dt));
    updateHUD();
    if (Math.random() < dt * 0.02) saveGame();
  }
  if (Game.state === 'playing' || Game.state === 'paused') render();
  else if (Game.state === 'title') {
    // Slow cinematic pan across Marina Bay behind the title.
    Game.time += dt;
    Game.camX = 200 + Math.sin(Game.time * 0.05) * 200;
    Game.camY = 100 + Math.cos(Game.time * 0.04) * 120;
    render();
  }
}

/* ---------------- boot ---------------- */
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
function resizeCanvas() {
  // Fixed 1280x800 render buffer; CSS stretches it to fill the window so the
  // HUD layout and the 1280x800 screenshots always match the game logic.
  // Use 100% (not innerWidth px) so the canvas fills the viewport exactly.
  canvas.width = VIEW_W; canvas.height = VIEW_H;
  canvas.style.width = '100%'; canvas.style.height = '100%';
}
resetWorld();
if (params.get('shot')) applyShotMode();
else showTitle();
requestAnimationFrame(frame);
