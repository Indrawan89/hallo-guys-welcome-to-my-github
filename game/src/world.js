// Game state and rules: levels, finds, score, timer, hints, streaks.
import { HINTS_PER_LEVEL, LEVEL_SECONDS, POINTS_FIND, POINTS_HINT, POINTS_WRONG, STREAK_BONUS } from './config.js';
import { LEVELS } from './scenes.js';

export const EVENT_FIND = 1;
export const EVENT_WRONG = 2;
export const EVENT_LEVEL = 4;
export const EVENT_WIN = 8;
export const EVENT_TIMEOUT = 16;
export const EVENT_HINT = 32;

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    found: new Set(),
    score: 0,
    totalScore: 0,
    timeLeft: LEVEL_SECONDS,
    hintsLeft: HINTS_PER_LEVEL,
    streak: 0,
    bestStreak: 0,
    wrong: 0,
    finds: 0,
    levelDone: false,
    won: false,
    timedOut: false,
    hintFlash: null, // {x, y, r, until}
    wrongFlash: null, // {x, y, until}
    lastFindLabel: '',
    elapsed: 0,
    paused: false,
  };

  function level() {
    return LEVELS[state.levelIndex];
  }
  function total() {
    return level().differences.length;
  }
  function remaining() {
    return total() - state.found.size;
  }

  function reset() {
    state.levelIndex = 0;
    state.found = new Set();
    state.score = 0;
    state.totalScore = 0;
    state.timeLeft = LEVEL_SECONDS;
    state.hintsLeft = HINTS_PER_LEVEL;
    state.streak = 0;
    state.bestStreak = 0;
    state.wrong = 0;
    state.finds = 0;
    state.levelDone = false;
    state.won = false;
    state.timedOut = false;
    state.hintFlash = null;
    state.wrongFlash = null;
    state.lastFindLabel = '';
    state.elapsed = 0;
    state.paused = false;
  }

  function startLevel(index) {
    state.levelIndex = index;
    state.found = new Set();
    state.timeLeft = LEVEL_SECONDS;
    state.hintsLeft = HINTS_PER_LEVEL;
    state.streak = 0;
    state.levelDone = false;
    state.timedOut = false;
    state.hintFlash = null;
    state.wrongFlash = null;
    state.lastFindLabel = '';
  }

  /** Test a click at panel-local (x, y). Returns an event bitmask. */
  function clickAt(x, y) {
    if (state.levelDone || state.won || state.timedOut || state.paused) return 0;
    const diffs = level().differences;
    for (let i = 0; i < diffs.length; i += 1) {
      if (state.found.has(i)) continue;
      const d = diffs[i];
      const dx = x - d.x;
      const dy = y - d.y;
      if (dx * dx + dy * dy <= d.r * d.r) {
        state.found.add(i);
        state.finds += 1;
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
        const bonus = (state.streak - 1) * STREAK_BONUS;
        state.score += POINTS_FIND + bonus;
        state.lastFindLabel = d.label;
        if (state.found.size === diffs.length) {
          const timeBonus = Math.round(state.timeLeft) * 2;
          state.score += timeBonus;
          state.totalScore += state.score;
          state.levelDone = true;
          if (state.levelIndex === LEVELS.length - 1) {
            state.won = true;
            return EVENT_FIND | EVENT_LEVEL | EVENT_WIN;
          }
          return EVENT_FIND | EVENT_LEVEL;
        }
        return EVENT_FIND;
      }
    }
    state.wrong += 1;
    state.streak = 0;
    state.score = Math.max(0, state.score + POINTS_WRONG);
    state.wrongFlash = { x, y, until: state.elapsed + 0.6 };
    return EVENT_WRONG;
  }

  function useHint() {
    if (state.levelDone || state.won || state.timedOut || state.paused) return 0;
    if (state.hintsLeft <= 0) return 0;
    const unfound = level().differences.map((d, i) => (state.found.has(i) ? null : d)).filter(Boolean);
    if (unfound.length === 0) return 0;
    const pick = unfound[Math.floor(random() * unfound.length)];
    state.hintsLeft -= 1;
    state.score = Math.max(0, state.score + POINTS_HINT);
    state.streak = 0;
    state.hintFlash = { x: pick.x, y: pick.y, r: pick.r, until: state.elapsed + 2.5 };
    return EVENT_HINT;
  }

  function nextLevel() {
    if (!state.levelDone || state.won) return false;
    state.score = 0;
    startLevel(state.levelIndex + 1);
    return true;
  }

  function step(dt) {
    if (state.paused || state.levelDone || state.won || state.timedOut) return 0;
    state.elapsed += dt;
    state.timeLeft -= dt;
    if (state.hintFlash && state.elapsed > state.hintFlash.until) state.hintFlash = null;
    if (state.wrongFlash && state.elapsed > state.wrongFlash.until) state.wrongFlash = null;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.timedOut = true;
      return EVENT_TIMEOUT;
    }
    return 0;
  }

  return {
    state, level, total, remaining, reset, startLevel, clickAt, useHint, nextLevel, step,
  };
}
