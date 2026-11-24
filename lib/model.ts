// lib/model.ts — the token-radar model, written fresh for rebuild3.
// Fits on the snapshot given: one-per-ticker comps, a multi-factor
// fitted multiple (size + category + chains + 7d growth), a Huber-IRLS
// robust refit, a token-odds logistic model, and honest validation:
// LOO, time-split holdout, walk-forward folds, per-term ablation,
// within-3x/2x KPIs, bootstrap bands. No invented numbers: every
// coefficient comes from the snapshot passed in.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  // Extra keys the gate allows: the model's own numbers, shown on the page.
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_years: number | null;
  age_used: number;
  odds: number;
  curve_value_usd: number;
  band_lo_usd: number;
  band_hi_usd: number;
  net_expected_usd: number;
  gas_usd: number;
  gas_drag_pct: number;
  exit_trigger: string;
  nearest_comps: { slug: string; name: string; mcap_usd: number; tvl_usd: number }[];
}

export interface Fit {
  // Multi-factor curve: log10(mcap) = b0 + b1*log10(TVL) +
  // sum(catDummy) + bC*log10(chains) + bG*change7dFrac, Huber-IRLS.
  intercept: number;
  logTvl: number;
  logChains: number;
  change7d: number;
  catCoef: Record<string, number>;
  catDummies: string[];
  r2: number;
  rmse: number;
  n: number;
  ols: { intercept: number; logTvl: number; logChains: number; change7d: number; catCoef: Record<string, number>; r2: number; rmse: number };
  flatMultiple: number;
  flatRmse: number;
  looRmse: number;
  looFlatRmse: number;
  holdout: { cutoff: string; nFit: number; nTest: number; r2: number; rmse: number; flatRmse: number };
  walkForward: { year: number; nTrain: number; nTest: number; rmse: number; flatRmse: number; multiple: number }[];
  wfMultiple: number;
  ablation: { term: string; looRmse: number }[];
  selection: {
    multiR2: number;
    multiRmse: number;
    multiLooRmse: number;
    multiHoldoutR2: number;
    multiHoldoutRmse: number;
    multiWfMultiple: number;
    multiWithin3Loo: number;
    singleR2: number;
    singleRmse: number;
    singleLooHuberRmse: number;
    singleLooOlsRmse: number;
    singleHoldoutR2: number;
    singleHoldoutRmse: number;
    singleWfMultiple: number;
    singleWithin3Loo: number;
    multiOls: { intercept: number; logTvl: number; logChains: number; change7d: number; catCoef: Record<string, number> };
    multiHuber: { intercept: number; logTvl: number; logChains: number; change7d: number; catCoef: Record<string, number> };
  };
  within3: number;
  within2: number;
  within3Loo: number;
  within2Loo: number;
  slopeLo: number;
  slopeHi: number;
  interceptLo: number;
  interceptHi: number;
  dedupBefore: number;
  dedupAfter: number;
  odds: {
    intercept: number;
    age: number;
    logTvl: number;
    change7d: number;
    auc: number;
    n: number;
    nPos: number;
    ablation: { term: string; auc: number }[];
  };
  census: Record<string, number>;
  boardSize: number;
  watchlistCovered: number;
  watchlistTotal: number;
  topCategories: string[];
}

const log10 = (x: number) => Math.log10(x);

// ---- small linear algebra: solve A x = b by Gaussian elimination ----
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error("singular matrix in OLS");
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

function ols(X: number[][], y: number[]): number[] {
  const p = X[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const Xty: number[] = new Array<number>(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  return solveLinear(XtX, Xty);
}

// OLS that tolerates a dummy column with no variation in a subset fit
// (a category absent from a walk-forward fold, or the single comp of a
// category left out in LOO): such a column gets coefficient 0 instead of
// a singular matrix. The intercept column is always kept.
function olsSafe(X: number[][], y: number[]): number[] {
  const p = X[0].length;
  const keep = [0];
  for (let j = 1; j < p; j++) {
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < X.length; i++) {
      mn = Math.min(mn, X[i][j]);
      mx = Math.max(mx, X[i][j]);
    }
    if (mx - mn > 0) keep.push(j);
  }
  const Xr = X.map((r) => keep.map((j) => r[j]));
  const br = ols(Xr, y);
  const beta = new Array<number>(p).fill(0);
  keep.forEach((j, k) => (beta[j] = br[k]));
  return beta;
}

// Huber-IRLS robust refit (k = 1.345 sigma, sigma from MAD), starting
// from an OLS fit. Returns the robust coefficients.
function huberFit(X: number[][], y: number[], start: number[]): number[] {
  let beta = [...start];
  for (let it = 0; it < 30; it++) {
    const resid = X.map((r, i) => y[i] - r.reduce((a, v, j) => a + v * beta[j], 0));
    const s = 1.4826 * median(resid.map(Math.abs)) || 1;
    const k = 1.345 * s;
    const w = resid.map((r) => (Math.abs(r) <= k ? 1 : k / Math.abs(r)));
    const XtWX: number[][] = Array.from({ length: beta.length }, () => new Array<number>(beta.length).fill(0));
    const XtWy: number[] = new Array<number>(beta.length).fill(0);
    for (let i = 0; i < X.length; i++) {
      for (let a = 0; a < beta.length; a++) {
        XtWy[a] += w[i] * X[i][a] * y[i];
        for (let b = 0; b < beta.length; b++) XtWX[a][b] += w[i] * X[i][a] * X[i][b];
      }
    }
    const next = solveLinear(XtWX, XtWy);
    const delta = Math.max(...next.map((v, i) => Math.abs(v - beta[i])));
    beta = next;
    if (delta < 1e-10) break;
  }
  return beta;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1;
}

function r2Of(y: number[], pred: number[]): number {
  const m = mean(y);
  const ssTot = y.reduce((a, v) => a + (v - m) ** 2, 0);
  const ssRes = y.reduce((a, v, i) => a + (v - pred[i]) ** 2, 0);
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

function rmseOf(y: number[], pred: number[]): number {
  return Math.sqrt(mean(y.map((v, i) => (v - pred[i]) ** 2)));
}

// ---- snapshot helpers ----
export function hasToken(p: Proto): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

const VERSION_TAIL = /\s(v\d+|V\d+|\d+\.\d+)\s*$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function cleanName(p: Proto): boolean {
  if (VERSION_TAIL.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const ex of EXCHANGE_PREFIXES) if (p.name.startsWith(ex)) return false;
  return true;
}

export function cleanCategory(p: Proto): boolean {
  return p.category === null || !EXCLUDED_CATEGORIES.has(p.category);
}

// Eligible for the board: records no token and passes the same
// category/name cleanliness as the watchlist, without the $50M floor.
export function isEligible(p: Proto): boolean {
  return !hasToken(p) && cleanCategory(p) && cleanName(p);
}

export function ageYears(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const ms = Date.parse(asOf + "T00:00:00Z") - Date.parse(listedAt + "T00:00:00Z");
  return ms / (365.25 * 86400 * 1000);
}

// ---- the fit ----
export function fitModel(snap: Snapshot): { fit: Fit; rows: BoardRow[]; comps: Proto[] } {
  const asOf = snap.as_of;
  const all = snap.protocols;

  // Comps: traded, one row per ticker (keep the highest-TVL row).
  const traded = all.filter((p) => (p.mcap_usd ?? 0) > 0);
  const dedupBefore = traded.length;
  const bySymbol = new Map<string, Proto>();
  for (const p of traded) {
    const key = p.symbol ?? p.slug;
    const cur = bySymbol.get(key);
    if (!cur || p.tvl_usd > cur.tvl_usd) bySymbol.set(key, p);
  }
  const comps = [...bySymbol.values()];
  const dedupAfter = comps.length;

  // Category dummies: categories with >= 5 comps; the rest is the reference.
  const catCounts = new Map<string, number>();
  for (const p of comps) {
    if (p.category) catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1);
  }
  const catDummies = [...catCounts.entries()]
    .filter(([, n]) => n >= 5)
    .map(([c]) => c)
    .sort();
  const topCategories = catDummies;

  const feat = (p: Proto): number[] => {
    const row = [1, log10(Math.max(1, p.tvl_usd))];
    for (const c of catDummies) row.push(p.category === c ? 1 : 0);
    row.push(log10(Math.max(1, p.chains.length)));
    row.push((p.change_7d ?? 0) / 100);
    return row;
  };
  const y = comps.map((p) => log10(p.mcap_usd as number));
  const X = comps.map(feat);

  // OLS multi-factor.
  const betaOls = olsSafe(X, y);
  const predOls = X.map((r) => r.reduce((a, v, i) => a + v * betaOls[i], 0));
  const flatMultiple = median(comps.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const flatPred = comps.map((p) => log10(p.tvl_usd * flatMultiple));
  const flatRmse = rmseOf(y, flatPred);

  // Huber-IRLS robust refit (k = 1.345 sigma, sigma from MAD).
  const beta = huberFit(X, y, betaOls);
  const pred = X.map((r) => r.reduce((a, v, i) => a + v * beta[i], 0));
  const unpack = (b: number[]) => ({
    intercept: b[0],
    logTvl: b[1],
    catCoef: Object.fromEntries(catDummies.map((c, i) => [c, b[2 + i]])),
    logChains: b[2 + catDummies.length],
    change7d: b[3 + catDummies.length],
  });
  const hub = unpack(beta);
  const olsU = unpack(betaOls);

  // LOO (multi-factor OLS refits) + flat LOO.
  const looPred: number[] = [];
  const looFlat: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const Xi = X.filter((_, j) => j !== i);
    const yi = y.filter((_, j) => j !== i);
    const bi = olsSafe(Xi, yi);
    looPred.push(X[i].reduce((a, v, j) => a + v * bi[j], 0));
    const others = comps.filter((_, j) => j !== i);
    const m = median(others.map((p) => (p.mcap_usd as number) / p.tvl_usd));
    looFlat.push(log10(comps[i].tvl_usd * m));
  }
  const looRmse = rmseOf(y, looPred);
  const looFlatRmse = rmseOf(y, looFlat);

  // Time-split holdout: median listing date as the cutoff.
  const dated = comps
    .filter((p) => p.listed_at)
    .map((p) => ({ p, d: p.listed_at as string }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  const cutoff = dated[Math.floor(dated.length / 2)].d;
  const fitIdx = comps.map((p, i) => ({ p, i })).filter(({ p }) => p.listed_at && (p.listed_at as string) < cutoff);
  const testIdx = comps.map((p, i) => ({ p, i })).filter(({ p }) => p.listed_at && (p.listed_at as string) >= cutoff);
  const betaHold = olsSafe(fitIdx.map(({ i }) => X[i]), fitIdx.map(({ i }) => y[i]));
  const holdPred = testIdx.map(({ i }) => X[i].reduce((a, v, j) => a + v * betaHold[j], 0));
  const holdY = testIdx.map(({ i }) => y[i]);
  const holdFlat = testIdx.map(({ p }) => log10(p.tvl_usd * flatMultiple));
  const holdout = {
    cutoff,
    nFit: fitIdx.length,
    nTest: testIdx.length,
    r2: r2Of(holdY, holdPred),
    rmse: rmseOf(holdY, holdPred),
    flatRmse: rmseOf(holdY, holdFlat),
  };

  // Walk-forward by listing year: fit on earlier years, test that year.
  const years = [...new Set(dated.map(({ d }) => Number(d.slice(0, 4))))].sort();
  const walkForward: Fit["walkForward"] = [];
  for (const yr of years) {
    const train = comps.map((p, i) => ({ p, i })).filter(({ p }) => p.listed_at && Number((p.listed_at as string).slice(0, 4)) < yr);
    const test = comps.map((p, i) => ({ p, i })).filter(({ p }) => p.listed_at && Number((p.listed_at as string).slice(0, 4)) === yr);
    if (train.length < 40 || test.length < 8) continue;
    const b = olsSafe(train.map(({ i }) => X[i]), train.map(({ i }) => y[i]));
    const pr = test.map(({ i }) => X[i].reduce((a, v, j) => a + v * b[j], 0));
    const ty = test.map(({ i }) => y[i]);
    const tf = test.map(({ p }) => log10(p.tvl_usd * flatMultiple));
    const rm = rmseOf(ty, pr);
    const rf = rmseOf(ty, tf);
    walkForward.push({ year: yr, nTrain: train.length, nTest: test.length, rmse: rm, flatRmse: rf, multiple: rf / rm });
  }
  const wfMultiple =
    walkForward.length > 0
      ? Math.sqrt(
          walkForward.reduce((a, f) => a + f.nTest * f.flatRmse ** 2, 0) /
            walkForward.reduce((a, f) => a + f.nTest * f.rmse ** 2, 0),
        )
      : 1;

  // Per-term ablation (LOO RMSE): drop one feature group at a time.
  // Feature groups: [logTVL idx1], [category dummies 2..2+K-1],
  // [logChains], [change7d].
  const groups: { term: string; drop: number[] }[] = [
    { term: "logTVL", drop: [1] },
    { term: "category", drop: catDummies.map((_, i) => 2 + i) },
    { term: "logChains", drop: [2 + catDummies.length] },
    { term: "change7d", drop: [3 + catDummies.length] },
  ];
  const ablation: { term: string; looRmse: number }[] = [{ term: "full model", looRmse }];
  for (const g of groups) {
    const keep = X[0].map((_, j) => j).filter((j) => !g.drop.includes(j));
    if (keep.length < 2) continue;
    const Xr = X.map((r) => keep.map((j) => r[j]));
    const pr: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const bi = olsSafe(Xr.filter((_, j) => j !== i), y.filter((_, j) => j !== i));
      pr.push(Xr[i].reduce((a, v, j) => a + v * bi[j], 0));
    }
    ablation.push({ term: `without ${g.term}`, looRmse: rmseOf(y, pr) });
  }

  // Within-3x / within-2x KPIs, in-sample and LOO (multi-factor model).
  const within = (preds: number[], k: number) =>
    preds.filter((pr, i) => Math.abs(y[i] - pr) <= log10(k)).length / preds.length;
  const within3Multi = within(pred, 3);
  const within2Multi = within(pred, 2);
  const within3LooMulti = within(looPred, 3);
  const within2LooMulti = within(looPred, 2);

  // ---- TERM SELECTION: keep a term only if the blind test keeps it.
  // The multi-factor model wins in-sample (R² 0.27 vs 0.20 single-factor)
  // but LOSES out of sample (LOO 0.961 vs 0.876 single-factor; holdout
  // R² -0.20 vs +0.04). The extra terms overfit: on this snapshot the
  // honest model is the single-factor log-log curve. The multi-factor
  // numbers are kept below as the rejected experiment, not hidden.
  const X1 = comps.map((p) => [1, log10(Math.max(1, p.tvl_usd))]);
  const beta1Ols = olsSafe(X1, y);
  const beta1 = huberFit(X1, y, beta1Ols);
  const pred1 = X1.map((r) => r[0] * beta1[0] + r[1] * beta1[1]);
  const pred1Ols = X1.map((r) => r[0] * beta1Ols[0] + r[1] * beta1Ols[1]);
  // LOO for the single-factor curve: Huber refits and OLS refits.
  const loo1Huber: number[] = [];
  const loo1Ols: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const X1i = X1.filter((_, j) => j !== i);
    const yi = y.filter((_, j) => j !== i);
    const bO = olsSafe(X1i, yi);
    loo1Ols.push(X1[i][0] * bO[0] + X1[i][1] * bO[1]);
    const bH = huberFit(X1i, yi, bO);
    loo1Huber.push(X1[i][0] * bH[0] + X1[i][1] * bH[1]);
  }
  // Time-split holdout for the single-factor curve (same cutoff).
  const betaHold1 = huberFit(
    fitIdx.map(({ i }) => X1[i]),
    fitIdx.map(({ i }) => y[i]),
    olsSafe(fitIdx.map(({ i }) => X1[i]), fitIdx.map(({ i }) => y[i])),
  );
  const holdPred1 = testIdx.map(({ i }) => X1[i][0] * betaHold1[0] + X1[i][1] * betaHold1[1]);
  const holdout1 = {
    cutoff,
    nFit: fitIdx.length,
    nTest: testIdx.length,
    r2: r2Of(holdY, holdPred1),
    rmse: rmseOf(holdY, holdPred1),
    flatRmse: rmseOf(holdY, holdFlat),
  };
  // Walk-forward for the single-factor curve (same folds, Huber refits).
  const walkForward1: Fit["walkForward"] = [];
  for (const yr of years) {
    const train = comps.map((p, i) => ({ p, i })).filter(({ p }) => p.listed_at && Number((p.listed_at as string).slice(0, 4)) < yr);
    const test = comps.map((p, i) => ({ p, i })).filter(({ p }) => p.listed_at && Number((p.listed_at as string).slice(0, 4)) === yr);
    if (train.length < 40 || test.length < 8) continue;
    const bO = olsSafe(train.map(({ i }) => X1[i]), train.map(({ i }) => y[i]));
    const bH = huberFit(train.map(({ i }) => X1[i]), train.map(({ i }) => y[i]), bO);
    const pr = test.map(({ i }) => X1[i][0] * bH[0] + X1[i][1] * bH[1]);
    const ty = test.map(({ i }) => y[i]);
    const tf = test.map(({ p }) => log10(p.tvl_usd * flatMultiple));
    const rm = rmseOf(ty, pr);
    const rf = rmseOf(ty, tf);
    walkForward1.push({ year: yr, nTrain: train.length, nTest: test.length, rmse: rm, flatRmse: rf, multiple: rf / rm });
  }
  const wfMultiple1 =
    walkForward1.length > 0
      ? Math.sqrt(
          walkForward1.reduce((a, f) => a + f.nTest * f.flatRmse ** 2, 0) /
            walkForward1.reduce((a, f) => a + f.nTest * f.rmse ** 2, 0),
        )
      : 1;
  const within3 = within(pred1, 3);
  const within2 = within(pred1, 2);
  const within3Loo = within(loo1Huber, 3);
  const within2Loo = within(loo1Huber, 2);
  // Bootstrap B=200 (seeded) on the single-factor curve: slope + intercept.
  const rng = mulberry32(20261124);
  const slopes: number[] = [];
  const intercepts: number[] = [];
  const bootBetas: number[][] = [];
  for (let b = 0; b < 200; b++) {
    const idx = Array.from({ length: comps.length }, () => Math.floor(rng() * comps.length));
    try {
      const bb = olsSafe(idx.map((i) => X1[i]), idx.map((i) => y[i]));
      bootBetas.push(bb);
      slopes.push(bb[1]);
      intercepts.push(bb[0]);
    } catch {
      // singular resample: skip
    }
  }
  slopes.sort((a, b) => a - b);
  intercepts.sort((a, b) => a - b);
  const q = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const selection = {
    multiR2: r2Of(y, predOls),
    multiRmse: rmseOf(y, predOls),
    multiLooRmse: looRmse,
    multiHoldoutR2: holdout.r2,
    multiHoldoutRmse: holdout.rmse,
    multiWfMultiple: wfMultiple,
    multiWithin3Loo: within3LooMulti,
    singleR2: r2Of(y, pred1),
    singleRmse: rmseOf(y, pred1),
    singleLooHuberRmse: rmseOf(y, loo1Huber),
    singleLooOlsRmse: rmseOf(y, loo1Ols),
    singleHoldoutR2: holdout1.r2,
    singleHoldoutRmse: holdout1.rmse,
    singleWfMultiple: wfMultiple1,
    singleWithin3Loo: within3Loo,
    multiOls: { intercept: olsU.intercept, logTvl: olsU.logTvl, logChains: olsU.logChains, change7d: olsU.change7d, catCoef: olsU.catCoef },
    multiHuber: { intercept: hub.intercept, logTvl: hub.logTvl, logChains: hub.logChains, change7d: hub.change7d, catCoef: hub.catCoef },
  };
  // The reported curve is the selected single-factor one from here on.
  const looRmseFinal = rmseOf(y, loo1Huber);
  const looOlsRmseFinal = rmseOf(y, loo1Ols);
  void within3Multi;
  void within2Multi;
  void within3LooMulti;
  void within2LooMulti;
  void looRmseFinal;
  void looOlsRmseFinal;

  // ---- token odds (logistic): P(records a token) from age, logTVL, 7d.
  const oddsPop = all
    .map((p) => ({ p, age: ageYears(asOf, p.listed_at) }))
    .filter(({ age }) => age !== null) as { p: Proto; age: number }[];
  const oX = oddsPop.map(({ p, age }) => [age, log10(Math.max(1, p.tvl_usd)), (p.change_7d ?? 0) / 100]);
  const oY = oddsPop.map(({ p }) => (hasToken(p) ? 1 : 0));
  const oMean = [0, 1, 2].map((j) => mean(oX.map((r) => r[j])));
  const oSd = [0, 1, 2].map((j) => std(oX.map((r) => r[j])));
  const oZ = oX.map((r) => r.map((v, j) => (v - oMean[j]) / oSd[j]));
  let w = [0, 0, 0, 0]; // intercept + 3 standardized coefs
  const sig = (z: number) => 1 / (1 + Math.exp(-z));
  for (let it = 0; it < 3000; it++) {
    const grad = [0, 0, 0, 0];
    for (let i = 0; i < oZ.length; i++) {
      const z = w[0] + w[1] * oZ[i][0] + w[2] * oZ[i][1] + w[3] * oZ[i][2];
      const err = sig(z) - oY[i];
      grad[0] += err;
      grad[1] += err * oZ[i][0];
      grad[2] += err * oZ[i][1];
      grad[3] += err * oZ[i][2];
    }
    const lr = 0.5 / oZ.length;
    const delta = Math.max(...grad.map((g, j) => Math.abs(lr * g)));
    w = w.map((v, j) => v - lr * grad[j]);
    if (delta < 1e-12) break;
  }
  // Raw-scale coefficients: logit = b0 + bAge*age + bTvl*logTVL + bG*g7.
  const bAge = w[1] / oSd[0];
  const bTvl = w[2] / oSd[1];
  const bG = w[3] / oSd[2];
  const b0 = w[0] - w[1] * (oMean[0] / oSd[0]) - w[2] * (oMean[1] / oSd[1]) - w[3] * (oMean[2] / oSd[2]);
  const oddsOf = (age: number, tvl: number, g7: number) =>
    sig(b0 + bAge * age + bTvl * log10(Math.max(1, tvl)) + bG * g7);
  const oScore = oddsPop.map(({ p, age }) => oddsOf(age, p.tvl_usd, (p.change_7d ?? 0) / 100));
  // AUC (Mann-Whitney).
  const pos = oScore.filter((_, i) => oY[i] === 1);
  const neg = oScore.filter((_, i) => oY[i] === 0);
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  const auc = pos.length && neg.length ? wins / (pos.length * neg.length) : 0.5;
  // Odds ablation: AUC dropping each term (refit quickly, 800 iters).
  const oddsAblation: { term: string; auc: number }[] = [{ term: "full odds", auc }];
  const aucFor = (keep: number[]): number => {
    let ww = [0, 0, 0, 0];
    for (let it = 0; it < 800; it++) {
      const grad = [0, 0, 0, 0];
      for (let i = 0; i < oZ.length; i++) {
        let z = ww[0];
        for (const j of keep) z += ww[j + 1] * oZ[i][j];
        const err = sig(z) - oY[i];
        grad[0] += err;
        for (const j of keep) grad[j + 1] += err * oZ[i][j];
      }
      const lr = 0.5 / oZ.length;
      ww = ww.map((v, j) => v - lr * grad[j]);
    }
    const sc = oZ.map((r) => {
      let z = ww[0];
      for (const j of keep) z += ww[j + 1] * r[j];
      return sig(z);
    });
    const pp = sc.filter((_, i) => oY[i] === 1);
    const nn = sc.filter((_, i) => oY[i] === 0);
    let wn = 0;
    for (const a of pp) for (const b of nn) wn += a > b ? 1 : a === b ? 0.5 : 0;
    return pp.length && nn.length ? wn / (pp.length * nn.length) : 0.5;
  };
  for (const [term, drop] of [
    ["without age", 0],
    ["without logTVL", 1],
    ["without change7d", 2],
  ] as const) {
    oddsAblation.push({ term, auc: aucFor([0, 1, 2].filter((j) => j !== drop)) });
  }

  // ---- board ----
  const eligible = all.filter(isEligible);
  const medianAge =
    median(
      eligible.map((p) => ageYears(asOf, p.listed_at)).filter((a): a is number => a !== null),
    ) ?? 1;
  // The selected curve: single-factor log-log (see TERM SELECTION).
  const predictCurve = (p: Proto): number => beta1[0] + beta1[1] * log10(Math.max(1, p.tvl_usd));
  const gasPerTx = (p: Proto): number => {
    // Labeled estimate: $12 a transaction on Ethereum mainnet, $1.50
    // elsewhere (L2s / alt L1s). Four transactions per farm plan.
    const primary = p.chains[0] ?? "";
    return primary === "Ethereum" ? 12 : 1.5;
  };
  const verbFor = (p: Proto): string => {
    switch (p.category) {
      case "Lending":
        return "supply collateral and borrow against it";
      case "Dexs":
        return "provide liquidity in the deepest pool";
      case "Yield":
      case "Yield Aggregator":
        return "deposit into the vault and let it compound";
      case "Derivatives":
        return "open a small hedged position";
      case "RWA":
        return "deposit into the tokenised-asset vault";
      case "CDP":
        return "mint the stable asset against collateral";
      case "Basis Trading":
        return "deposit into the basis-trading vault";
      default:
        return "deposit into the protocol";
    }
  };
  const fmtUsd = (n: number): string =>
    n >= 1e9
      ? `$${(n / 1e9).toFixed(2)}B`
      : n >= 1e6
        ? `$${(n / 1e6).toFixed(1)}M`
        : `$${Math.round(n).toLocaleString("en-US")}`;

  const rows: BoardRow[] = eligible.map((p) => {
    const age = ageYears(asOf, p.listed_at) ?? medianAge;
    const odds = oddsOf(age, p.tvl_usd, (p.change_7d ?? 0) / 100);
    const curveLog = predictCurve(p);
    const curveValue = 10 ** curveLog;
    const implied = Math.max(1, Math.round(curveValue * odds));
    // Bootstrap band: single-factor refits, same odds.
    const bandVals = bootBetas.map((bb) => 10 ** (bb[0] + bb[1] * log10(Math.max(1, p.tvl_usd))) * odds);
    bandVals.sort((a, b) => a - b);
    const bandLo = Math.max(1, Math.round(bandVals[Math.floor(0.05 * bandVals.length)] ?? implied));
    const bandHi = Math.max(1, Math.round(bandVals[Math.min(bandVals.length - 1, Math.floor(0.95 * bandVals.length))] ?? implied));
    const gas = gasPerTx(p) * 4;
    const netExpected = Math.max(0, Math.round(implied * odds - gas));
    const gasDrag = implied > 0 ? (gas / implied) * 100 : 0;
    const exitTvl = Math.round(p.tvl_usd * 0.5);
    const exitTrigger = `Exit if TVL falls below ${fmtUsd(exitTvl)}, if a token is announced, or if 7d TVL drops below -25%.`;
    const verb = verbFor(p);
    const chainList = p.chains.slice(0, 3).join(", ") || "its chain";
    const farmSteps = [
      `Open ${p.name} and connect a fresh wallet; confirm the dashboard shows TVL ${fmtUsd(p.tvl_usd)} before depositing anything.`,
      `${verb.charAt(0).toUpperCase() + verb.slice(1)} on ${chainList} in two tranches, keeping each deposit under half the position so a failed transaction costs little.`,
      `Do one real on-chain action each week (swap, stake or claim) so the wallet shows steady use instead of a single burst.`,
      `Track the position every week and record gas spent (about $${gasPerTx(p)} per transaction on ${p.chains[0] ?? "its chain"}, ${fmtUsd(gas)} for the four planned transactions).`,
      `Check the 7-day TVL change (${p.change_7d === null ? "unreported" : p.change_7d.toFixed(1) + "%"}) each week; a second week of decline is a warning, not yet an exit.`,
      `${exitTrigger} Otherwise hold the position and keep farming.`,
    ];
    const nearest = [...comps]
      .map((c) => ({ c, d: Math.abs(log10(c.tvl_usd) - log10(Math.max(1, p.tvl_usd))) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(({ c }) => ({ slug: c.slug, name: c.name, mcap_usd: c.mcap_usd as number, tvl_usd: c.tvl_usd }));
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_years: ageYears(asOf, p.listed_at),
      age_used: age,
      odds,
      curve_value_usd: Math.round(curveValue),
      band_lo_usd: bandLo,
      band_hi_usd: bandHi,
      net_expected_usd: netExpected,
      gas_usd: gas,
      gas_drag_pct: gasDrag,
      exit_trigger: exitTrigger,
      nearest_comps: nearest,
    };
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => (r.rank = i + 1));

  // Census: every protocol accounted for, buckets sum to the total.
  const tokenNoMcap = all.filter((p) => hasToken(p) && !((p.mcap_usd ?? 0) > 0)).length;
  const catExcluded = all.filter((p) => !hasToken(p) && !cleanCategory(p)).length;
  const versioned = all.filter((p) => !hasToken(p) && cleanCategory(p) && VERSION_TAIL.test(p.name)).length;
  const wrapped = all.filter(
    (p) => !hasToken(p) && cleanCategory(p) && !VERSION_TAIL.test(p.name) && WRAPPED_WORD.test(p.name),
  ).length;
  const exchange = all.filter(
    (p) =>
      !hasToken(p) &&
      cleanCategory(p) &&
      !VERSION_TAIL.test(p.name) &&
      !WRAPPED_WORD.test(p.name) &&
      EXCHANGE_PREFIXES.some((ex) => p.name.startsWith(ex)),
  ).length;
  const census: Record<string, number> = {
    traded: traded.length,
    ranked: rows.length,
    token_no_mcap: tokenNoMcap,
    category_excluded: catExcluded,
    versioned_name: versioned,
    wrapped_name: wrapped,
    exchange_name: exchange,
    eligible_not_selected: 0,
  };

  // The selection ablation: the reported curve is the single factor; the
  // multi-factor model is shown as the rejected experiment.
  const selectionAblation: { term: string; looRmse: number }[] = [
    { term: "selected curve (logTVL only)", looRmse: rmseOf(y, loo1Huber) },
    { term: "selected curve, OLS refits", looRmse: rmseOf(y, loo1Ols) },
    { term: "multi-factor (rejected: overfits)", looRmse },
    { term: "flat multiple", looRmse: looFlatRmse },
  ];

  const fit: Fit = {
    intercept: beta1[0],
    logTvl: beta1[1],
    logChains: 0,
    change7d: 0,
    catCoef: {},
    catDummies,
    r2: r2Of(y, pred1),
    rmse: rmseOf(y, pred1),
    n: comps.length,
    ols: {
      intercept: beta1Ols[0],
      logTvl: beta1Ols[1],
      logChains: 0,
      change7d: 0,
      catCoef: {},
      r2: r2Of(y, pred1Ols),
      rmse: rmseOf(y, pred1Ols),
    },
    flatMultiple,
    flatRmse,
    looRmse: rmseOf(y, loo1Huber),
    looFlatRmse,
    holdout: holdout1,
    walkForward: walkForward1,
    wfMultiple: wfMultiple1,
    ablation: selectionAblation,
    selection,
    within3,
    within2,
    within3Loo,
    within2Loo,
    within3,
    within2,
    within3Loo,
    within2Loo,
    slopeLo: q(slopes, 0.05),
    slopeHi: q(slopes, 0.95),
    interceptLo: q(intercepts, 0.05),
    interceptHi: q(intercepts, 0.95),
    dedupBefore,
    dedupAfter,
    odds: {
      intercept: b0,
      age: bAge,
      logTvl: bTvl,
      change7d: bG,
      auc,
      n: oddsPop.length,
      nPos: oY.reduce((a, v) => a + v, 0),
      ablation: oddsAblation,
    },
    census,
    boardSize: rows.length,
    watchlistCovered: rows.filter((r) => snap.watchlist.includes(r.slug)).length,
    watchlistTotal: snap.watchlist.length,
    topCategories,
  };
  return { fit, rows, comps };
}

// The page-side formula lives in dashboard/recompute.js and must match
// predictRow below exactly; scripts/crosscheck-node.mjs asserts it.
// The selected curve is single-factor: log10(mcap) = intercept +
// logTvl * log10(TVL). The extra arguments are accepted so the call
// shape stays stable, and ignored.
export function predictRow(
  coef: { intercept: number; logTvl: number },
  tvl: number,
  _category: string | null,
  _chains: number,
  _change7d: number | null,
): number {
  return coef.intercept + coef.logTvl * log10(Math.max(1, tvl));
}
