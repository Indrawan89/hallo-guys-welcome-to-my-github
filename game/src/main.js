// SOLMAR BAY — main loop and state machine. Modes: title, playing, paused,
// busted, wasted, win. The game runs offline from static files; nothing here
// touches the network.
import { generateWorld, PLACES, WORLD_SIZE, DISTRICTS } from './world.js';
import { makeRng, clamp, dist } from './rng.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import {
  createPlayer, createTraffic, createPedestrians, createPolice,
  updatePlayerOnFoot, updatePlayerCar, tryEnterCar, exitCar,
  updateTraffic, updatePedestrians, updatePolice, decayWanted,
} from './entities.js';
import {
  createMissionState, updateMissions, missionObjective,
  spawnGoons, updateGoons, currentMission,
} from './missions.js';
import { drawWorld, drawEntities, drawMarker, drawHud, drawTitle, drawEnd } from './render.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const input = createInput();
const audio = createAudio();
const world = generateWorld();
world.districts = DISTRICTS;

const rng = makeRng(4242);
const player = createPlayer(PLACES.spawn.x, PLACES.spawn.y);
const traffic = createTraffic(18, rng);
const peds = createPedestrians(26, rng);
const police = createPolice();
const ms = createMissionState();

const state = {
  mode: 'title',
  time: 0,
  cam: { x: player.x, y: player.y },
  vw: 1280, vh: 800,
  world, player, traffic, peds, police, ms,
};

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  state.vw = w;
  state.vh = h;
}
window.addEventListener('resize', resize);
resize();

// Save / load: mission progress and money persist across visits.
function saveGame() {
  try {
    localStorage.setItem('solmar-bay-save', JSON.stringify({
      money: player.money, mission: ms.index, health: player.health,
    }));
  } catch { /* storage may be unavailable */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem('solmar-bay-save');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

function resetGame(fromSave) {
  const save = fromSave ? loadSave() : null;
  player.x = PLACES.spawn.x; player.y = PLACES.spawn.y;
  player.angle = -Math.PI / 2; player.speed = 0;
  player.onFoot = true; player.car = null;
  player.health = save ? save.health : 100;
  player.money = save ? save.money : 0;
  player.wanted = 0; player.wantedTimer = 0; player.invulnerable = 0;
  const fresh = createMissionState();
  ms.index = save ? Math.min(save.mission, 5) : 0;
  ms.step = fresh.step; ms.timer = 0; ms.holdProgress = 0;
  ms.goons = []; ms.done = false; ms.message = ''; ms.messageTimer = 0;
  police.length = 0;
  state.cam.x = player.x; state.cam.y = player.y;
}

function startGame() {
  audio.unlock();
  resetGame(false);
  state.mode = 'playing';
  announce('SOLMAR BAY: ' + missionObjective(ms));
}

// Mission side effects that the main loop owns.
function onMissionEvent(events) {
  if (events.stole) {
    // The wanted star for the theft itself is added where the car is
    // entered (step()); here we only celebrate the mission step.
  }
  if (events.cracked) {
    // The vault is open — the $1,500 payout lands when the loot reaches
    // the safehouse and the mission completes. The alarm puts 4 stars
    // on the player for the escape.
    player.wanted = 4;
    audio.mission();
  }
  if (events.missionComplete) {
    player.money += events.payout;
    // Laying low at the safehouse after Hot Pursuit clears the heat.
    if (events.completedMission === 3) {
      player.wanted = 0;
      police.length = 0;
    }
    audio.mission();
    saveGame();
  }
  if (events.failed) {
    state.mode = 'busted';
    state.failReason = events.failed;
  }
  if (ms.done) {
    state.mode = 'win';
    audio.win();
    try { localStorage.removeItem('solmar-bay-save'); } catch { /* ignore */ }
  }
}

function onBusted() {
  const fine = Math.min(player.money, 400);
  player.money -= fine;
  player.wanted = 0;
  police.length = 0;
  state.mode = 'busted';
  state.failReason = `Busted! The cops took $${fine} and let you walk.`;
  audio.busted();
  audio.siren(false);
}

function onWasted() {
  state.mode = 'wasted';
  state.failReason = 'You ran out of health on the streets of Solmar Bay.';
  audio.busted();
  audio.siren(false);
}

// One simulation step.
function step(dt) {
  state.time += dt;

  if (state.mode === 'playing') {
    const interact = input.wasPressed('e') || input.wasPressed('enter');

    // Enter / exit cars.
    if (interact && player.onFoot) {
      const car = tryEnterCar(player, world.parkedCars);
      if (car) {
        player.wanted = Math.min(5, player.wanted + 1);
        ms.message = 'Car stolen — the cops noticed! (+1 star)';
        ms.messageTimer = 3;
        audio.horn();
      }
    } else if (interact && !player.onFoot) {
      exitCar(player, world.parkedCars);
    }

    if (player.onFoot) {
      updatePlayerOnFoot(player, input, dt, world);
    } else {
      updatePlayerCar(player, input, dt, world, (speed) => {
        player.health -= Math.round(speed / 40);
        audio.crash();
        if (ms.index === 1) {
          // Delivery Run: crashes dock the pay.
          ms.crashes += 1;
          player.money = Math.max(0, player.money - 50);
          ms.message = 'Crash! Delivery pay docked $50';
          ms.messageTimer = 2;
        }
      });
    }

    // Pickups.
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      if (dist(player.x, player.y, pk.x, pk.y) < 34) {
        pk.taken = true;
        if (pk.kind === 'cash') player.money += 50;
        else player.health = Math.min(100, player.health + 30);
        audio.pickup();
      }
    }

    // Knocking a pedestrian over is a crime.
    for (const p of peds) {
      if (!player.onFoot && player.speed > 120 && dist(p.x, p.y, player.x, player.y) < 30) {
        p.flee = 3;
        player.wanted = Math.min(5, player.wanted + 1);
        player.health = Math.max(0, player.health - 2);
      }
    }

    updateTraffic(traffic, dt, player);
    updatePedestrians(peds, dt, player, world);
    updatePolice(police, dt, player, world, rng, onBusted);
    decayWanted(player, dt, police);

    // Mission 3 goons appear when the mission starts.
    if (ms.index === 2 && ms.goons.length === 0) spawnGoons(ms, rng);
    if (ms.goons.length > 0) {
      if (updateGoons(ms, player, dt)) audio.crash();
      if (ms.index !== 2) ms.goons = [];
    }

    // Mission 4 forces the heat up.
    if (ms.index === 3 && player.wanted < 3) player.wanted = 3;

    const events = updateMissions(ms, player, dt, input, interact, input.down('e') || input.down('enter'));
    onMissionEvent(events);

    if (player.health <= 0) onWasted();

    // Camera follows the player, clamped to the world.
    const tx = clamp(player.x, state.vw / 2, WORLD_SIZE - state.vw / 2);
    const ty = clamp(player.y, state.vh / 2, WORLD_SIZE - state.vh / 2);
    state.cam.x += (tx - state.cam.x) * Math.min(1, dt * 5);
    state.cam.y += (ty - state.cam.y) * Math.min(1, dt * 5);

    audio.engine(player.onFoot ? 0 : Math.abs(player.speed) / 430);
    audio.siren(player.wanted > 0 && !input.muted);
    if (input.muted) audio.engine(0);
  }

  if (input.wasPressed('p') && state.mode === 'playing') state.mode = 'paused';
  else if (input.wasPressed('p') && state.mode === 'paused') state.mode = 'playing';

  if ((input.wasPressed('enter') || input.wasPressed('e')) && state.mode === 'title') {
    audio.unlock();
    startGame();
  }
  if (input.wasPressed('enter') && (state.mode === 'busted' || state.mode === 'wasted' || state.mode === 'win')) {
    startGame();
  }
  if (input.wasPressed(' ') && state.mode === 'title') {
    audio.unlock();
    startGame();
  }

  input.endFrame();
}

function render() {
  const { vw, vh } = state;
  ctx.clearRect(0, 0, vw, vh);
  if (state.mode === 'title') {
    drawTitle(ctx, vw, vh, state);
    return;
  }
  if (state.mode === 'busted') {
    drawEnd(ctx, vw, vh, 'BUSTED', [state.failReason || '', `Cash: $${player.money.toLocaleString('en-US')}`], '#e74c3c');
    return;
  }
  if (state.mode === 'wasted') {
    drawEnd(ctx, vw, vh, 'WASTED', [state.failReason || '', `Cash: $${player.money.toLocaleString('en-US')}`], '#e74c3c');
    return;
  }
  if (state.mode === 'win') {
    drawEnd(ctx, vw, vh, 'SOLMAR BAY IS YOURS', [
      'All six missions complete.',
      `Final cash: $${player.money.toLocaleString('en-US')}`,
      'Thanks for playing — see you in the next heat.',
    ], '#2ecc71');
    return;
  }

  // World view, centred on the camera.
  ctx.save();
  ctx.translate(Math.round(vw / 2 - state.cam.x), Math.round(vh / 2 - state.cam.y));
  drawWorld(ctx, world, state.cam, vw, vh, state.time);
  drawEntities(ctx, state);
  ctx.restore();

  drawMarker(ctx, state, vw, vh);
  drawHud(ctx, state);

  if (state.mode === 'paused') {
    ctx.fillStyle = 'rgba(8,10,18,0.7)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', vw / 2, vh / 2);
    ctx.font = '18px sans-serif';
    ctx.fillText('Press P to resume', vw / 2, vh / 2 + 40);
  }
}

// Screenshot presets (?shot=start|play|chase|mission) for the dossier.
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) applyShot(state, shot);

// Expose a little debug surface for automated play-tests.
window.__solmar = {
  state,
  start: startGame,
  player,
  ms,
  reset: resetGame,
};

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
