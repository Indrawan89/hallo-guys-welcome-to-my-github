// Keyboard input for SOLMAR BAY: WASD / arrows to move and drive, E or Enter
// to interact, Space for handbrake, P to pause, M to mute.
export function createInput() {
  const keys = new Set();
  const pressed = new Set();
  let muted = false;

  function keyName(e) {
    // Lower-case everything: 'Enter' -> 'enter', 'ArrowUp' -> 'arrowup'.
    return e.key.toLowerCase();
  }

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (!e.repeat) pressed.add(k);
    keys.add(k);
    if (k === 'm') muted = !muted;
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => { keys.clear(); });

  return {
    get muted() { return muted; },
    down(...names) { return names.some((n) => keys.has(n)); },
    // True only on the frame the key went down; call once per frame.
    wasPressed(name) { return pressed.has(name); },
    // Movement vector from WASD / arrows, normalised.
    moveVector() {
      let x = 0, y = 0;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      if (keys.has('w') || keys.has('arrowup')) y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    // Clear the just-pressed set at the end of each frame.
    endFrame() { pressed.clear(); },
  };
}
