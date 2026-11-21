// Synthesised sound effects (Web Audio, no audio files).
export function createSound() {
  let ctx = null;
  let muted = false;
  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type = 'sine', vol = 0.12) {
    if (muted) return;
    const audio = ensure();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, audio.currentTime + start);
    gain.gain.linearRampToValueAtTime(vol, audio.currentTime + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + start + dur);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(audio.currentTime + start);
    osc.stop(audio.currentTime + start + dur + 0.05);
  }
  return {
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    unlock() { ensure(); },
    find() { tone(660, 0, 0.12); tone(880, 0.09, 0.16); tone(1320, 0.18, 0.2, 'sine', 0.08); },
    wrong() { tone(160, 0, 0.18, 'sawtooth', 0.06); tone(110, 0.1, 0.22, 'sawtooth', 0.05); },
    hint() { tone(520, 0, 0.1, 'triangle', 0.1); tone(780, 0.08, 0.14, 'triangle', 0.1); },
    level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.22)); },
    win() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.12, 0.3)); },
    click() { tone(440, 0, 0.05, 'triangle', 0.05); },
  };
}
