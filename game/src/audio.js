// Tiny WebAudio synth for SOLMAR BAY: engine hum, sirens, pickups, crashes and
// mission jingles. Everything is generated — no audio files, no network.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let enabled = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  // Call from a user gesture (Enter / click) so the browser allows sound.
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol) {
    if (!ensure() || !enabled) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch { /* sound is optional */ }
  }

  return {
    unlock,
    pickup() { blip(880, 0.12, 'sine', 0.15); setTimeout(() => blip(1320, 0.15, 'sine', 0.15), 70); },
    crash() { blip(90, 0.25, 'sawtooth', 0.2); },
    busted() { blip(220, 0.4, 'square', 0.15); setTimeout(() => blip(165, 0.5, 'square', 0.15), 200); },
    mission() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.16), i * 110)); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.16), i * 130)); },
    horn() { blip(370, 0.18, 'square', 0.1); },
    // Engine pitch follows speed (0..1); 0 silences it.
    engine(speed) {
      if (!ensure() || !enabled) return;
      try {
        engineGain.gain.setTargetAtTime(speed > 0.02 ? 0.03 + speed * 0.04 : 0, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(55 + speed * 90, ctx.currentTime, 0.1);
      } catch { /* ignore */ }
    },
    // Two-tone police siren while wanted; call with false to stop.
    siren(on) {
      if (!ensure() || !enabled) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = 'sine';
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0.045;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(ctx.destination);
          sirenOsc.start();
          let hi = false;
          sirenTimer = setInterval(() => {
            hi = !hi;
            sirenOsc.frequency.value = hi ? 960 : 720;
          }, 350);
        } else if (!on && sirenOsc) {
          clearInterval(sirenTimer);
          sirenTimer = null;
          sirenOsc.stop();
          sirenOsc.disconnect();
          sirenOsc = null;
        }
      } catch { /* ignore */ }
    },
  };
}
