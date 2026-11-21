// Deterministic screenshot scenes behind ?shot=start|play|harbour|win.
// Each one sets the real world state directly (found differences, timer,
// score), so the frame is exactly what a played game looks like — two
// near-identical pictures side by side, green rings on the differences
// found, several still unfound, and the counter showing how many remain.
import { LEVELS } from './scenes.js';
import { SCREEN_LEVEL, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

function markFound(world, indices) {
  for (const i of indices) world.state.found.add(i);
  world.state.finds = world.state.found.size;
}

export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    // Level 1 mid-hunt: 3 of 7 found, 4 still hidden.
    markFound(world, [0, 2, 4]);
    world.state.score = 320;
    world.state.timeLeft = 118;
    world.state.streak = 2;
    world.state.bestStreak = 2;
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  if (name === 'harbour') {
    // Level 2 mid-hunt: 4 of 7 found, 3 still hidden.
    world.startLevel(1);
    markFound(world, [1, 3, 4, 6]);
    world.state.score = 430;
    world.state.totalScore = 1180;
    world.state.timeLeft = 87;
    world.state.streak = 3;
    world.state.bestStreak = 3;
    world.state.hintsLeft = 2;
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  if (name === 'win') {
    // All three scenes cleared: the win screen over the final scene.
    world.startLevel(2);
    markFound(world, [0, 1, 2, 3, 4, 5, 6]);
    world.state.levelDone = true;
    world.state.won = true;
    world.state.totalScore = 4860;
    world.state.bestStreak = 5;
    world.state.wrong = 2;
    return { screen: SCREEN_WIN, best: 4860 };
  }
  if (name === 'level') {
    world.startLevel(0);
    markFound(world, [0, 1, 2, 3, 4, 5, 6]);
    world.state.levelDone = true;
    world.state.score = 1340;
    world.state.totalScore = 1340;
    return { screen: SCREEN_LEVEL, best: 1240 };
  }
  // Default: the title screen over the first scene, nothing found yet.
  world.state.timeLeft = 150;
  return { screen: SCREEN_TITLE, best: 1240 };
}

export function shotNames() {
  return ['start', 'play', 'harbour', 'win'];
}
