// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between title, play, paused, level-clear, win and time-out screens.
// ?seed=N fixes the decorative random stream. ?shot=start|play|harbour|win
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_FIND, EVENT_HINT, EVENT_LEVEL, EVENT_TIMEOUT, EVENT_WIN, EVENT_WRONG } from './world.js';
import { ACTION_CONFIRM, ACTION_HINT, ACTION_LENS, ACTION_MUTE, ACTION_NEXT, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, overlayButton, playButtons, SCREEN_LEVEL, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TIMEOUT, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { createSound } from './sound.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const sound = createSound();

let screen = SCREEN_TITLE;
let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
} catch {
  best = 0;
}
function saveBest() {
  const total = world.state.totalScore;
  if (total > best) {
    best = total;
    try {
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Private mode: the best score just lives for this session.
    }
  }
}
function announce(message) {
  status.textContent = message;
}

function handleEvents(events) {
  if (events & EVENT_FIND) {
    sound.find();
    const s = world.state;
    announce(`Found: ${s.lastFindLabel}. ${s.found.size} of ${s.level().differences.length} found.`);
  }
  if (events & EVENT_WRONG) {
    sound.wrong();
    announce('Not a difference. 25 points lost.');
  }
  if (events & EVENT_HINT) sound.hint();
  if (events & EVENT_LEVEL) {
    sound.level();
    saveBest();
    screen = world.state.won ? SCREEN_WIN : SCREEN_LEVEL;
    if (world.state.won) sound.win();
  }
  if (events & EVENT_WIN) announce(`You found them all! Final score ${world.state.totalScore}.`);
  if (events & EVENT_TIMEOUT) {
    sound.wrong();
    screen = SCREEN_TIMEOUT;
    announce('Time ran out.');
  }
}

function clickAtStage(x, y) {
  sound.unlock();
  if (screen === SCREEN_TITLE) {
    const b = overlayButton(SCREEN_TITLE);
    if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      sound.click();
      world.reset();
      screen = SCREEN_PLAY;
      announce('Level 1: Lantern Market. Find 7 differences.');
    }
    return;
  }
  if (screen === SCREEN_LEVEL) {
    const b = overlayButton(SCREEN_LEVEL);
    if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      sound.click();
      world.nextLevel();
      screen = SCREEN_PLAY;
    }
    return;
  }
  if (screen === SCREEN_WIN || screen === SCREEN_TIMEOUT) {
    const b = overlayButton(screen);
    if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      sound.click();
      world.reset();
      screen = SCREEN_PLAY;
    }
    return;
  }
  if (screen === SCREEN_PAUSED) return;
  if (screen !== SCREEN_PLAY) return;
  for (const b of playButtons(world.state)) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.id === 'hint') handleEvents(world.useHint());
      else if (b.id === 'sound') sound.toggleMute();
      else if (b.id === 'restart') {
        world.reset();
        screen = SCREEN_PLAY;
        announce('Restarted. Level 1: Lantern Market.');
      } else if (b.id === 'next' && world.nextLevel()) screen = SCREEN_PLAY;
      sound.click();
      return;
    }
  }
  const panel = input.panelAt(x, y);
  if (panel) handleEvents(world.clickAt(panel.x, panel.y));
}

function handleActions() {
  for (const action of input.takeActions()) {
    if (action === ACTION_MUTE) {
      sound.toggleMute();
      announce(sound.muted ? 'Sound off.' : 'Sound on.');
    } else if (action === ACTION_RESTART) {
      world.reset();
      screen = SCREEN_PLAY;
      announce('Restarted. Level 1: Lantern Market.');
    } else if (action === ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        world.state.paused = true;
        screen = SCREEN_PAUSED;
      } else if (screen === SCREEN_PAUSED) {
        world.state.paused = false;
        screen = SCREEN_PLAY;
      }
    } else if (action === ACTION_HINT) {
      if (screen === SCREEN_PLAY) handleEvents(world.useHint());
    } else if (action === ACTION_LENS) {
      if (screen === SCREEN_PLAY) input.toggleLens();
    } else if (action === ACTION_NEXT) {
      if (screen === SCREEN_LEVEL && world.nextLevel()) screen = SCREEN_PLAY;
      else if (screen === SCREEN_TITLE) {
        world.reset();
        screen = SCREEN_PLAY;
      }
    } else if (action === ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) {
        world.reset();
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_LEVEL && world.nextLevel()) screen = SCREEN_PLAY;
      else if (screen === SCREEN_WIN || screen === SCREEN_TIMEOUT) {
        world.reset();
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_PLAY) {
        confirmAtCrosshair();
      }
    }
  }
}

// The confirm action clicks wherever the keyboard crosshair sits, but only
// when it is inside one of the two pictures.
function confirmAtCrosshair() {
  const panel = input.panelAt(input.crosshair.x, input.crosshair.y);
  if (panel) handleEvents(world.clickAt(panel.x, panel.y));
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  handleActions();
  if (input.takeClick()) clickAtStage(input.mouse.x, input.mouse.y);
  if (screen === SCREEN_PLAY) {
    let elapsed = dt;
    while (elapsed > 0) {
      const step = Math.min(STEP, elapsed);
      handleEvents(world.step(step));
      elapsed -= step;
    }
  }
  renderer.draw(world.state, screen, input.mouse, input.crosshair, input.showCrosshair, best);
  requestAnimationFrame(frame);
}

if (shot) {
  const staged = stageShot(shot, world);
  screen = staged.screen;
  best = staged.best;
  renderer.draw(world.state, screen, input.mouse, input.crosshair, false, best);
  renderer.draw(world.state, screen, input.mouse, input.crosshair, false, best);
  window.__shotReady = true;
} else {
  announce('Lantern Twins. Press Enter or click Start the hunt to play.');
  requestAnimationFrame(frame);
}
