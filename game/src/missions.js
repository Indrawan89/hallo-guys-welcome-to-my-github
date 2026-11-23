// SOLMAR BAY's story: six missions in a row, from a stolen car to the last
// ride out of town. Each mission has an objective line, a map marker and a
// payout; finishing all six wins the game.
import { PLACES } from './world.js';
import { dist } from './rng.js';

export const MISSIONS = [
  {
    id: 1, name: 'First Wheels',
    brief: 'Steal a parked car, then meet Ray at the Marina.',
    steps: [
      { text: 'Steal a parked car (walk up and press E)', target: null, kind: 'steal' },
      { text: 'Drive to Ray at Marina Bay', target: PLACES.rayMeet, kind: 'reach' },
    ],
    payout: 300,
  },
  {
    id: 2, name: 'Delivery Run',
    brief: 'Pick up the package, deliver it to Old Town. Crashes cost $50 each.',
    steps: [
      { text: 'Pick up the package at Sunset Courier', target: PLACES.packagePickup, kind: 'reach' },
      { text: 'Deliver it to Old Town Plaza', target: PLACES.oldTownDrop, kind: 'reach' },
    ],
    payout: 400,
  },
  {
    id: 3, name: 'Shakedown',
    brief: "Collect Lena's 3 stashes on the Sunset Strip. Her goons are watching.",
    steps: [
      { text: 'Collect stash 1 of 3 on the Strip', target: PLACES.stripStash1, kind: 'reach' },
      { text: 'Collect stash 2 of 3 on the Strip', target: PLACES.stripStash2, kind: 'reach' },
      { text: 'Collect stash 3 of 3 on the Strip', target: PLACES.stripStash3, kind: 'reach' },
    ],
    payout: 600,
  },
  {
    id: 4, name: 'Hot Pursuit',
    brief: 'Three stars. Lose the cops, then lay low at the North Hills safehouse.',
    steps: [
      { text: 'Survive the heat: stay free for 45 seconds', target: null, kind: 'survive', seconds: 45 },
      { text: 'Reach the North Hills safehouse', target: PLACES.safehouse, kind: 'reach' },
    ],
    payout: 500,
  },
  {
    id: 5, name: 'The Big Score',
    brief: 'Crack the Harbor Lights Bank vault and get out with the cash.',
    steps: [
      { text: 'Reach the Harbor Lights Bank', target: PLACES.bank, kind: 'reach' },
      { text: 'Hold E to crack the vault', target: PLACES.bank, kind: 'hold', seconds: 5 },
      { text: 'Escape with the cash (4 stars!)', target: PLACES.safehouse, kind: 'reach' },
    ],
    payout: 1500,
  },
  {
    id: 6, name: 'Last Ride',
    brief: 'Drive the loot to the Marina yacht in 120 seconds. Roadblocks ahead.',
    steps: [
      { text: 'Drive the loot to the Marina yacht — 120 seconds!', target: PLACES.yacht, kind: 'timed', seconds: 120 },
    ],
    payout: 2000,
  },
];

export function createMissionState() {
  return {
    index: 0, // into MISSIONS
    step: 0, // into the current mission's steps
    timer: 0, // counts down for survive / timed steps
    holdProgress: 0,
    goons: [], // mission 3 chasers
    crashes: 0,
    done: false,
    message: '',
    messageTimer: 0,
  };
}

export function currentMission(ms) {
  return MISSIONS[Math.min(ms.index, MISSIONS.length - 1)];
}

export function currentStep(ms) {
  const m = currentMission(ms);
  return m.steps[Math.min(ms.step, m.steps.length - 1)];
}

export function missionObjective(ms) {
  if (ms.done) return 'All missions complete — SOLMAR BAY is yours!';
  const m = currentMission(ms);
  return `M${m.id} ${m.name}: ${currentStep(ms).text}`;
}

// Advance the mission state by one frame. Returns events for the main loop:
// { stole, pickedUp, crashed, completed, failed, busted }.
export function updateMissions(ms, player, dt, input, interactPressed, interactHeld) {
  const events = {};
  if (ms.done) return events;
  const m = currentMission(ms);
  const step = currentStep(ms);
  const indexBefore = ms.index;

  if (ms.messageTimer > 0) ms.messageTimer -= dt;

  // finish() stamps a mission-completion event (with its payout) whenever
  // this frame moved the mission index forward, then returns the events.
  function finish() {
    if (ms.index > indexBefore) {
      events.missionComplete = true;
      events.completedMission = indexBefore;
      events.payout = MISSIONS[indexBefore].payout;
    }
    return events;
  }

  if (step.kind === 'steal') {
    if (!player.onFoot) { advance(ms); events.stole = true; }
    return finish();
  }

  if (step.kind === 'reach' && step.target) {
    if (dist(player.x, player.y, step.target.x, step.target.y) < 70) {
      advance(ms);
      events.pickedUp = true;
    }
    return finish();
  }

  if (step.kind === 'survive') {
    if (ms.timer <= 0) ms.timer = step.seconds;
    ms.timer -= dt;
    if (player.wanted <= 0) ms.timer -= dt * 0.5; // cooling off helps
    if (ms.timer <= 0) advance(ms);
    return finish();
  }

  if (step.kind === 'hold') {
    if (interactHeld && dist(player.x, player.y, step.target.x, step.target.y) < 90) {
      // Cracking the vault takes both hands: the cops can close in, but
      // they cannot grab the player mid-crack — the heat lands afterwards.
      player.invulnerable = Math.max(player.invulnerable, 0.3);
      ms.holdProgress += dt;
      if (ms.holdProgress >= step.seconds) {
        ms.holdProgress = 0;
        advance(ms);
        events.cracked = true;
      }
    } else {
      ms.holdProgress = Math.max(0, ms.holdProgress - dt * 2);
    }
    return finish();
  }

  if (step.kind === 'timed') {
    if (ms.timer <= 0) ms.timer = step.seconds;
    ms.timer -= dt;
    if (dist(player.x, player.y, step.target.x, step.target.y) < 80) {
      advance(ms);
      events.delivered = true;
    } else if (ms.timer <= 0) {
      events.failed = 'Out of time — the yacht sailed without you.';
    }
    return finish();
  }

  return finish();
}

function advance(ms) {
  const m = currentMission(ms);
  ms.step += 1;
  ms.timer = 0;
  ms.holdProgress = 0;
  if (ms.step >= m.steps.length) {
    ms.index += 1;
    ms.step = 0;
    ms.message = `Mission complete: ${m.name} (+$${m.payout})`;
    ms.messageTimer = 4;
    if (ms.index >= MISSIONS.length) {
      ms.done = true;
      ms.message = 'ALL MISSIONS COMPLETE — You own Solmar Bay!';
      ms.messageTimer = 8;
    }
  }
}

// Mission 3 goons: they chase the player on foot and shove on contact.
export function spawnGoons(ms, rng) {
  ms.goons = [];
  for (let i = 0; i < 3; i++) {
    ms.goons.push({
      x: PLACES.stripStash2.x + rng.range(-260, 260),
      y: PLACES.stripStash2.y + rng.range(-260, 260),
      angle: 0, speed: 150, shirt: '#2d3436',
    });
  }
}

export function updateGoons(ms, player, dt) {
  for (const g of ms.goons) {
    const a = Math.atan2(player.y - g.y, player.x - g.x);
    g.angle = a;
    g.x += Math.cos(a) * g.speed * dt;
    g.y += Math.sin(a) * g.speed * dt;
    if (dist(g.x, g.y, player.x, player.y) < 26 && player.invulnerable <= 0) {
      player.health -= 12;
      player.invulnerable = 1.2;
      return true; // hit the player
    }
  }
  return false;
}
