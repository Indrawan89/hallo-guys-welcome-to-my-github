// Screenshot presets for SOLMAR BAY: ?shot=start|play|chase|mission sets up a
// fixed, deterministic scene so the dossier's screenshots show the game's best
// sides — the city, a drive, a police chase and a mission in progress.
import { PLACES } from './world.js';
import { makeRng } from './rng.js';

export function applyShot(state, shot) {
  const { player, ms } = state;
  const rng = makeRng(777);
  if (shot === 'play') {
    // Driving a car down Sunset Strip with traffic around.
    state.mode = 'playing';
    const car = { x: 2210, y: 1190, angle: 0, speed: 260, color: '#e67e22', parked: false };
    player.onFoot = false;
    player.car = car;
    player.x = car.x; player.y = car.y; player.angle = 0;
    player.money = 1250;
    state.cam.x = car.x; state.cam.y = car.y;
    return;
  }
  if (shot === 'chase') {
    // Three wanted stars, cruisers closing in on the player's car.
    state.mode = 'playing';
    const car = { x: 1700, y: 1700, angle: Math.PI / 4, speed: 320, color: '#c0392b', parked: false };
    player.onFoot = false;
    player.car = car;
    player.x = car.x; player.y = car.y; player.angle = car.angle;
    player.wanted = 3;
    player.money = 2400;
    state.cam.x = car.x; state.cam.y = car.y;
    for (let i = 0; i < 3; i++) {
      state.police.push({
        x: car.x + rng.range(-520, -360),
        y: car.y + rng.range(-220, 220),
        angle: Math.PI / 4, speed: 300, color: '#1a1a2e', siren: rng.next(),
      });
    }
    return;
  }
  if (shot === 'mission') {
    // Mission 5: cracking the Harbor Lights Bank vault.
    state.mode = 'playing';
    ms.index = 4;
    ms.step = 1;
    ms.holdProgress = 2.6;
    player.x = PLACES.bank.x + 40;
    player.y = PLACES.bank.y + 20;
    player.angle = Math.PI;
    player.money = 3100;
    player.wanted = 2;
    // The shot is a still: police are visible but cannot bust the player
    // before the screenshot is taken.
    player.invulnerable = 60;
    state.cam.x = player.x; state.cam.y = player.y;
    return;
  }
  // Default: the title screen.
  state.mode = 'title';
}
