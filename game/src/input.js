// Mouse and keyboard input, translated into stage coordinates.
import { PANEL, PANEL_LEFT, PANEL_RIGHT, STAGE } from './config.js';

export const ACTION_CONFIRM = 'confirm';
export const ACTION_HINT = 'hint';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';
export const ACTION_MUTE = 'mute';
export const ACTION_LENS = 'lens';
export const ACTION_NEXT = 'next';

export function createInput(canvas) {
  const mouse = { x: STAGE.width / 2, y: 400, down: false, lens: false, inside: false };
  const crosshair = { x: PANEL_LEFT.x + PANEL.width / 2, y: PANEL.y + PANEL.height / 2 };
  const keys = new Set();
  let showCrosshair = false;
  let actionQueue = [];

  function toStage(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * STAGE.width,
      y: ((event.clientY - rect.top) / rect.height) * STAGE.height,
    };
  }
  /** Which panel (if any) a stage point is in, and its panel-local coords. */
  function panelAt(x, y) {
    if (y >= PANEL.y && y <= PANEL.y + PANEL.height) {
      if (x >= PANEL_LEFT.x && x <= PANEL_LEFT.x + PANEL.width) return { right: false, x: x - PANEL_LEFT.x, y: y - PANEL.y };
      if (x >= PANEL_RIGHT.x && x <= PANEL_RIGHT.x + PANEL.width) return { right: true, x: x - PANEL_RIGHT.x, y: y - PANEL.y };
    }
    return null;
  }

  canvas.addEventListener('mousemove', (event) => {
    const p = toStage(event);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.inside = true;
  });
  canvas.addEventListener('mousedown', (event) => {
    const p = toStage(event);
    mouse.x = p.x;
    mouse.y = p.y;
    if (event.button === 2) {
      mouse.lens = true;
      event.preventDefault();
    } else if (event.button === 0) {
      mouse.down = true;
    }
  });
  canvas.addEventListener('mouseup', (event) => {
    if (event.button === 2) mouse.lens = false;
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });

  window.addEventListener('keydown', (event) => {
    const k = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) event.preventDefault();
    if (event.repeat) return;
    keys.add(k);
    showCrosshair = true;
    const step = event.shiftKey ? 4 : 16;
    if (k === 'arrowleft') crosshair.x = Math.max(0, crosshair.x - step);
    else if (k === 'arrowright') crosshair.x = Math.min(STAGE.width, crosshair.x + step);
    else if (k === 'arrowup') crosshair.y = Math.max(0, crosshair.y - step);
    else if (k === 'arrowdown') crosshair.y = Math.min(STAGE.height, crosshair.y + step);
    else if (k === 'enter' || k === ' ') actionQueue.push(ACTION_CONFIRM);
    else if (k === 'h') actionQueue.push(ACTION_HINT);
    else if (k === 'p' || k === 'escape') actionQueue.push(ACTION_PAUSE);
    else if (k === 'r') actionQueue.push(ACTION_RESTART);
    else if (k === 'm') actionQueue.push(ACTION_MUTE);
    else if (k === 'l') actionQueue.push(ACTION_LENS);
    else if (k === 'n') actionQueue.push(ACTION_NEXT);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

  return {
    mouse, crosshair, panelAt,
    get showCrosshair() { return showCrosshair; },
    takeActions() {
      const out = actionQueue;
      actionQueue = [];
      return out;
    },
    /** True once when the left button was pressed since the last call. */
    takeClick() {
      const was = mouse.down;
      mouse.down = false;
      return was;
    },
    toggleLens() { mouse.lens = !mouse.lens; },
    hideCrosshair() { showCrosshair = false; },
  };
}
