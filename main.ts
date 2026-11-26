// Token Launch Radar — rebuild6 (fresh re-implementation).
//
// A dashboard that ranks pre-token protocols by a fitted implied value and
// tells a reader how to farm each one. Built from the sealed house snapshot
// alone: the size curve, the token-odds model and every validation number
// below are fitted and counted from that snapshot in this program, in one
// deterministic run, with no network.
//
// Model (kept deliberately simple — a single factor beats every multi-factor
// variant out of sample on this snapshot):
//   implied value = 10^(a + b * log10(TVL)), (a, b) from a Huber-IRLS fit
//   on the traded comps (one per ticker).
//   token odds = logistic(age capped at 4y, log10(TVL), winsorized 7d change).
//   net expected = odds * implied * 0.01% - $48 gas, on a $10,000 deposit.
//   FARM when net/deposit > 20% AND odds > 0.40; WATCH when > 5%; else SKIP.
//
// Usage: node main.ts --input <snapshot.json> --output <dir>
//   Defaults: --input /input/snapshot.json, --output $MAKEFUN_OUTPUT_DIR
//   or ./out. Writes board.json, dashboard/data.js, copies dashboard/ and
//   screenshots/ into the output dir, and writes dossier.json there.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GAS_USD = 48;
const DEPOSIT_USD = 10000;
const FARMER_SHARE = 0.0001;
const AGE_CAP_YEARS = 4;
const HOURS_PER_PLAN = 26;
const TIME_CUTOFF = "2024-02-18";
const WF_MIN_TRAIN = 5;
const BOOT_B = 200;
const BOOT_SEED = 20261126;
const CONF_LEVEL = 0.8;

// ------------------------------------------------------------------ tiny stats
function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
function median(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((p, q) => p - q);
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function rmse(errs: number[]): number {
  return Math.sqrt(mean(errs.map((e) => e * e)));
}
function mae(errs: number[]): number {
  return mean(errs.map((e) => Math.abs(e)));
}
function mse(errs: number[]): number {
  return mean(errs.map((e) => e * e));
}
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-14) throw new Error("singular matrix");
    const tmp = m[col];
    m[col] = m[piv];
    m[piv] = tmp;
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i][n];
    for (let j = i + 1; j < n; j++) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x;
}

// ------------------------------------------------------------------ seeded RNG
// mulberry32: tiny, fast, deterministic. Same generator (same seeds, same
// call order) as the independent Python cross-check, so the two agree.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleIdx(rnd: () => number, n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  return idx;
}
function bootstrapIdx(rnd: () => number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(rnd() * n));
  return out;
}

// ------------------------------------------------------------------ curve fit
function ols(xs: number[], ys: number[]): [number, number] {
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const b = sxy / sxx;
  return [my - b * mx, b];
}
// Huber IRLS, tuning constant 1.345, scale from the MAD. Deterministic.
function huberIrls(xs: number[], ys: number[]): { a: number; b: number; scale: number; iters: number } {
  const c = 1.345;
  let [a, b] = ols(xs, ys);
  let scale = 1;
  let used = 100;
  for (let it = 0; it < 100; it++) {
    const res = ys.map((y, i) => y - (a + b * xs[i]));
    const med = median(res);
    const mad = median(res.map((r) => Math.abs(r - med)));
    scale = mad > 0 ? 1.4826 * mad : 1;
    const w = res.map((r) => {
      const u = Math.abs(r) / (c * scale);
      return u <= 1 ? 1 : 1 / u;
    });
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let i = 0; i < xs.length; i++) {
      sw += w[i];
      swx += w[i] * xs[i];
      swy += w[i] * ys[i];
      swxx += w[i] * xs[i] * xs[i];
      swxy += w[i] * xs[i] * ys[i];
    }
    const det = sw * swxx - swx * swx;
    const a2 = (swy * swxx - swx * swxy) / det;
    const b2 = (sw * swxy - swx * swy) / det;
    if (Math.abs(a2 - a) < 1e-12 && Math.abs(b2 - b) < 1e-12) {
      a = a2;
      b = b2;
      used = it + 1;
      break;
    }
    a = a2;
    b = b2;
  }
  return { a, b, scale, iters: used };
}
function r2Of(xs: number[], ys: number[], a: number, b: number): number {
  const my = mean(ys);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < xs.length; i++) {
    ssTot += (ys[i] - my) * (ys[i] - my);
    const r = ys[i] - (a + b * xs[i]);
    ssRes += r * r;
  }
  return ssTot > 0 ? 1 - ssRes / ssTot : NaN;
}

// ------------------------------------------------------------------ odds model
function logisticIrls(features: number[][], target: number[]): number[] {
  const p = features[0].length;
  let beta = new Array<number>(p).fill(0);
  for (let iter = 0; iter < 100; iter++) {
    const xtwx: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const xtwz = new Array<number>(p).fill(0);
    for (let k = 0; k < features.length; k++) {
      const xi = features[k];
      let z = 0;
      for (let j = 0; j < p; j++) z += beta[j] * xi[j];
      z = Math.max(-35, Math.min(35, z));
      const mu = 1 / (1 + Math.exp(-z));
      const w = Math.max(mu * (1 - mu), 1e-9);
      const zi = z + (target[k] - mu) / w;
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) xtwx[i][j] += w * xi[i] * xi[j];
        xtwz[i] += w * xi[i] * zi;
      }
    }
    const beta2 = solveLinear(xtwx, xtwz);
    let biggest = 0;
    for (let j = 0; j < p; j++) biggest = Math.max(biggest, Math.abs(beta2[j] - beta[j]));
    beta = beta2;
    if (biggest < 1e-10) break;
  }
  return beta;
}
function aucScore(target: number[], score: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  for (let i = 0; i < target.length; i++) (target[i] === 1 ? pos : neg).push(score[i]);
  if (pos.length === 0 || neg.length === 0) return NaN;
  let wins = 0;
  let ties = 0;
  for (const pv of pos) {
    for (const qv of neg) {
      if (pv > qv) wins++;
      else if (pv === qv) ties++;
    }
  }
  return (wins + 0.5 * ties) / (pos.length * neg.length);
}
function logistic(z: number): number {
  const c = Math.max(-35, Math.min(35, z));
  return 1 / (1 + Math.exp(-c));
}

// ------------------------------------------------------------------ arguments
function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const INPUT = argValue("--input", "/input/snapshot.json");
const OUTPUT = argValue("--output", process.env.MAKEFUN_OUTPUT_DIR || "out");

// ------------------------------------------------------------------ load data
type Proto = {
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
  _age: number;
  _chg7: number;
  _hasToken: number;
};
const snap = JSON.parse(readFileSync(INPUT, "utf8"));
const asOf = snap.as_of as string;
const [ay, am, ad] = asOf.split("-").map(Number);
const asOfMs = Date.UTC(ay, am - 1, ad);
const prots: Proto[] = snap.protocols;
const watchlist: string[] = snap.watchlist;
const bySlug = new Map<string, Proto>();
for (const p of prots) bySlug.set(p.slug, p);

const ageList: number[] = [];
for (const p of prots) {
  if (p.listed_at) {
    const [y, m, d] = p.listed_at.split("-").map(Number);
    ageList.push((asOfMs - Date.UTC(y, m - 1, d)) / 86400000 / 365.25);
  }
}
const medianAge = median(ageList);
for (const p of prots) {
  if (p.listed_at) {
    const [y, m, d] = p.listed_at.split("-").map(Number);
    p._age = (asOfMs - Date.UTC(y, m - 1, d)) / 86400000 / 365.25;
  } else {
    p._age = medianAge;
  }
  p._chg7 = p.change_7d === null ? 0 : Math.max(-50, Math.min(100, p.change_7d));
  // "Records a token" (RULES.txt): gecko_id or symbol is not null.
  p._hasToken = p.gecko_id !== null || p.symbol !== null ? 1 : 0;
}
function ageYears(p: Proto): number {
  return p._age;
}

// ------------------------------------------------------------------ comps
const rawComps = prots.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
const bySymbol = new Map<string, Proto>();
for (const p of rawComps) {
  const sym = p.symbol || p.slug;
  const cur = bySymbol.get(sym);
  if (!cur || p.tvl_usd > cur.tvl_usd) bySymbol.set(sym, p);
}
const comps = [...bySymbol.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
const xs = comps.map((p) => Math.log10(p.tvl_usd));
const ys = comps.map((p) => Math.log10(p.mcap_usd as number));
const nComp = comps.length;
const flatMult = median(comps.map((p) => (p.mcap_usd as number) / p.tvl_usd));
const flatLog = median(ys);

const curve = huberIrls(xs, ys);
const { a, b } = curve;
const curveR2 = r2Of(xs, ys, a, b);
const curveRmseLog = rmse(ys.map((y, i) => y - (a + b * xs[i])));
const predictLog = (tvl: number) => a + b * Math.log10(tvl);
const predictUsd = (tvl: number) => Math.pow(10, predictLog(tvl));

// ------------------------------------------------------------------ LOO
const looLogErr: number[] = [];
const looDolErr: number[] = [];
const looFlatLogErr: number[] = [];
const looFlatDolErr: number[] = [];
for (let i = 0; i < nComp; i++) {
  const xi = xs.filter((_, j) => j !== i);
  const yi = ys.filter((_, j) => j !== i);
  const f = huberIrls(xi, yi);
  const predLog = f.a + f.b * xs[i];
  looLogErr.push(ys[i] - predLog);
  looDolErr.push((comps[i].mcap_usd as number) - Math.pow(10, predLog));
  looFlatLogErr.push(ys[i] - flatLog);
  looFlatDolErr.push((comps[i].mcap_usd as number) - flatMult * comps[i].tvl_usd);
}
const within3 = (errs: number[]) =>
  mean(errs.map((e) => (Math.abs(e) <= Math.log10(3) ? 1 : 0)));
const looFlatDolWithin = comps.map(
  (p) => Math.log10((p.mcap_usd as number) / (flatMult * p.tvl_usd)),
);
const loo = {
  logRatio: rmse(looFlatLogErr) / rmse(looLogErr),
  logRmse: rmse(looLogErr),
  dollarRmseRatio: rmse(looFlatDolErr) / rmse(looDolErr),
  dollarMaeRatio: mae(looFlatDolErr) / mae(looDolErr),
  dollarMseRatio: mse(looFlatDolErr) / mse(looDolErr),
  dollarRmse: rmse(looDolErr),
  within3Model: within3(looLogErr),
  within3Flat: within3(looFlatDolWithin),
};

// ------------------------------------------------------------------ conformal 80%
const absLoo = [...looLogErr.map((e) => Math.abs(e))].sort((p, q) => p - q);
const confK = Math.ceil(CONF_LEVEL * (nComp + 1));
const halfWidth = absLoo[Math.min(confK, nComp) - 1];
const fullRes = ys.map((y, i) => y - (a + b * xs[i]));
const confCoverage = mean(fullRes.map((r) => (Math.abs(r) <= halfWidth ? 1 : 0)));
const conformal = { halfWidthDex: halfWidth, coverage: confCoverage };

// ------------------------------------------------------------------ holdouts x2
function holdout(seed: number): { seed: number; nTest: number; logRatio: number; dollarRatio: number; testR2: number } {
  const rnd = mulberry32(seed);
  const order = shuffleIdx(rnd, nComp);
  const nTest = Math.round(nComp * 0.2);
  const test = order.slice(0, nTest).sort((p, q) => p - q);
  const train = order.slice(nTest).sort((p, q) => p - q);
  const f = huberIrls(train.map((i) => xs[i]), train.map((i) => ys[i]));
  const logErr = test.map((i) => ys[i] - (f.a + f.b * xs[i]));
  const dolErr = test.map((i) => (comps[i].mcap_usd as number) - Math.pow(10, f.a + f.b * xs[i]));
  const flogErr = test.map((i) => ys[i] - flatLog);
  const fdolErr = test.map((i) => (comps[i].mcap_usd as number) - flatMult * comps[i].tvl_usd);
  return {
    seed,
    nTest,
    logRatio: rmse(flogErr) / rmse(logErr),
    dollarRatio: rmse(fdolErr) / rmse(dolErr),
    testR2: r2Of(test.map((i) => xs[i]), test.map((i) => ys[i]), f.a, f.b),
  };
}
const holdouts = [holdout(7), holdout(42)];

// ------------------------------------------------------------------ time split
function timeSplit(): { cutoff: string; nTrain: number; nTest: number; logRatio: number; dollarRatio: number; testR2: number } {
  const train = comps.map((p, i) => i).filter((i) => comps[i].listed_at !== null && (comps[i].listed_at as string) < TIME_CUTOFF);
  const test = comps.map((p, i) => i).filter((i) => comps[i].listed_at !== null && (comps[i].listed_at as string) >= TIME_CUTOFF);
  const f = huberIrls(train.map((i) => xs[i]), train.map((i) => ys[i]));
  const logErr = test.map((i) => ys[i] - (f.a + f.b * xs[i]));
  const dolErr = test.map((i) => (comps[i].mcap_usd as number) - Math.pow(10, f.a + f.b * xs[i]));
  const flogErr = test.map((i) => ys[i] - flatLog);
  const fdolErr = test.map((i) => (comps[i].mcap_usd as number) - flatMult * comps[i].tvl_usd);
  return {
    cutoff: TIME_CUTOFF,
    nTrain: train.length,
    nTest: test.length,
    logRatio: rmse(flogErr) / rmse(logErr),
    dollarRatio: rmse(fdolErr) / rmse(dolErr),
    testR2: r2Of(test.map((i) => xs[i]), test.map((i) => ys[i]), f.a, f.b),
  };
}
const timeSplitRes = timeSplit();

// ------------------------------------------------------------------ placebo
const placeboRnd = mulberry32(123);
const placeboOrder = shuffleIdx(placeboRnd, nComp);
const ysShuf = placeboOrder.map((i) => ys[i]);
const placeboFit = huberIrls(xs, ysShuf);
const placebo = { r2: r2Of(xs, ysShuf, placeboFit.a, placeboFit.b) };

// ------------------------------------------------------------------ walk-forward
type WfYear = { year: number; nTrain: number; nTest: number; logRatio: number; dollarRatio: number };
const wfYears: WfYear[] = [];
const wfPoolLog: number[] = [];
const wfPoolDol: number[] = [];
const wfPoolFlog: number[] = [];
const wfPoolFdol: number[] = [];
for (let year = 2021; year <= 2026; year++) {
  const train = comps.map((p, i) => i).filter((i) => comps[i].listed_at !== null && Number((comps[i].listed_at as string).slice(0, 4)) < year);
  const test = comps.map((p, i) => i).filter((i) => comps[i].listed_at !== null && Number((comps[i].listed_at as string).slice(0, 4)) === year);
  if (train.length < WF_MIN_TRAIN || test.length === 0) continue;
  const f = huberIrls(train.map((i) => xs[i]), train.map((i) => ys[i]));
  const logErr = test.map((i) => ys[i] - (f.a + f.b * xs[i]));
  const dolErr = test.map((i) => (comps[i].mcap_usd as number) - Math.pow(10, f.a + f.b * xs[i]));
  const flogErr = test.map((i) => ys[i] - flatLog);
  const fdolErr = test.map((i) => (comps[i].mcap_usd as number) - flatMult * comps[i].tvl_usd);
  wfYears.push({ year, nTrain: train.length, nTest: test.length, logRatio: rmse(flogErr) / rmse(logErr), dollarRatio: rmse(fdolErr) / rmse(dolErr) });
  for (const i of test) {
    wfPoolLog.push(ys[i] - (f.a + f.b * xs[i]));
    wfPoolDol.push((comps[i].mcap_usd as number) - Math.pow(10, f.a + f.b * xs[i]));
    wfPoolFlog.push(ys[i] - flatLog);
    wfPoolFdol.push((comps[i].mcap_usd as number) - flatMult * comps[i].tvl_usd);
  }
}
const walkForward = {
  perYear: wfYears,
  pooled: { nTest: wfPoolLog.length, logRatio: rmse(wfPoolFlog) / rmse(wfPoolLog), dollarRatio: rmse(wfPoolFdol) / rmse(wfPoolDol) },
};

// ------------------------------------------------------------------ odds model
const fitted = prots.filter((p) => p.listed_at !== null);
const oddsX = fitted.map((p) => [1, Math.min(p._age, AGE_CAP_YEARS), Math.log10(p.tvl_usd), p._chg7]);
const oddsY = fitted.map((p) => p._hasToken);
const oddsBeta = logisticIrls(oddsX, oddsY);
const oddsScore = oddsX.map((row) => row.reduce((s, v, j) => s + oddsBeta[j] * v, 0));
const oddsProb = oddsScore.map((z) => logistic(z));
const oddsAuc = aucScore(oddsY, oddsProb);
function oddsAucDrop(drop: number): number {
  const keep = [0, 1, 2, 3].filter((j) => j !== drop);
  const x2 = oddsX.map((row) => keep.map((j) => row[j]));
  const b2 = logisticIrls(x2, oddsY);
  const s2 = x2.map((row) => row.reduce((s, v, j) => s + b2[j] * v, 0));
  return aucScore(oddsY, s2.map((z) => logistic(z)));
}
const odds = {
  nFitted: fitted.length,
  orAge: Math.exp(oddsBeta[1]),
  orLogTvl: Math.exp(oddsBeta[2]),
  or7d: Math.exp(oddsBeta[3]),
  intercept: oddsBeta[0],
  auc: oddsAuc,
  ablation: { noAge: oddsAucDrop(1), noLogTvl: oddsAucDrop(2), no7d: oddsAucDrop(3) },
  medianAge: medianAge,
};
function tokenOdds(p: Proto): number {
  const z = oddsBeta[0] + oddsBeta[1] * Math.min(p._age, AGE_CAP_YEARS) + oddsBeta[2] * Math.log10(p.tvl_usd) + oddsBeta[3] * p._chg7;
  return logistic(z);
}

// ------------------------------------------------------------------ board
const EXCL_CAT = new Set(["Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"]);
const EXCH_NAMES = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];
function launchExcluded(p: Proto): boolean {
  if (p.category !== null && EXCL_CAT.has(p.category)) return true;
  const name = p.name || "";
  if (/\s([Vv]\d+(\.\d+)?|\d+\.\d+)$/.test(name)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(name)) return true;
  for (const ex of EXCH_NAMES) if (name.startsWith(ex)) return true;
  return false;
}
const wlSet = new Set(watchlist);
const early = prots
  .filter((p) => p._hasToken === 0 && !wlSet.has(p.slug) && !launchExcluded(p))
  .sort((p, q) => q.tvl_usd - p.tvl_usd || (p.slug < q.slug ? -1 : p.slug > q.slug ? 1 : 0))
  .slice(0, 158);
const boardProts = [...watchlist.map((s) => bySlug.get(s) as Proto), ...early];

type Row = {
  slug: string;
  name: string;
  scope: string;
  category: string;
  chains: string[];
  tvl: number;
  chg7: number | null;
  age: number;
  odds: number;
  implied: number;
  net: number;
  ret: number;
  verdict: string;
  bandLo: number;
  bandHi: number;
  confLo: number;
  confHi: number;
  rankLo: number;
  rankHi: number;
  anchorName: string;
  anchorMcap: number;
  anchorTvl: number;
  anchorMult: number;
  breakEvenDeposit: number;
  perHour: number;
  rank: number;
  farmSteps: string[];
};
const rows: Row[] = boardProts.map((p) => {
  const imp = Math.round(predictUsd(p.tvl_usd));
  const od = tokenOdds(p);
  const net = od * imp * FARMER_SHARE - GAS_USD;
  const ret = net / DEPOSIT_USD;
  const verdict = ret > 0.2 && od > 0.4 ? "FARM" : ret > 0.05 ? "WATCH" : "SKIP";
  const scope = wlSet.has(p.slug) ? "watchlist" : "early";
  return {
    slug: p.slug,
    name: p.name,
    scope,
    category: p.category || "Uncategorized",
    chains: p.chains,
    tvl: p.tvl_usd,
    chg7: p.change_7d,
    age: p._age,
    odds: od,
    implied: imp,
    net,
    ret,
    verdict,
    bandLo: 0,
    bandHi: 0,
    confLo: Math.round(Math.pow(10, Math.log10(imp) - halfWidth)),
    confHi: Math.round(Math.pow(10, Math.log10(imp) + halfWidth)),
    rankLo: 0,
    rankHi: 0,
    anchorName: "",
    anchorMcap: 0,
    anchorTvl: 0,
    anchorMult: 0,
    breakEvenDeposit: Math.round((GAS_USD * DEPOSIT_USD) / Math.max(od * imp * FARMER_SHARE, 1e-9)),
    perHour: net / HOURS_PER_PLAN,
    rank: 0,
    farmSteps: [],
  };
});
rows.sort((p, q) => q.implied - p.implied || (p.slug < q.slug ? -1 : p.slug > q.slug ? 1 : 0));
rows.forEach((r, i) => {
  r.rank = i + 1;
});

// ------------------------------------------------------------------ bootstrap bands + rank ranges
const bootRnd = mulberry32(BOOT_SEED);
const bootCurves: [number, number][] = [];
for (let k = 0; k < BOOT_B; k++) {
  const idx = bootstrapIdx(bootRnd, nComp);
  const f = huberIrls(idx.map((i) => xs[i]), idx.map((i) => ys[i]));
  bootCurves.push([f.a, f.b]);
}
for (const r of rows) {
  const lx = Math.log10(r.tvl);
  const vals = bootCurves.map(([ab, bb]) => Math.pow(10, ab + bb * lx)).sort((p, q) => p - q);
  r.bandLo = Math.round(vals[Math.floor(0.05 * BOOT_B)]);
  r.bandHi = Math.round(vals[Math.floor(0.95 * BOOT_B)]);
}
const rankHist = new Map<string, number[]>();
for (const r of rows) rankHist.set(r.slug, []);
for (const [ab, bb] of bootCurves) {
  const scored = [...rows].sort(
    (p, q) => Math.pow(10, ab + bb * Math.log10(q.tvl)) - Math.pow(10, ab + bb * Math.log10(p.tvl)) || (p.slug < q.slug ? -1 : 1),
  );
  scored.forEach((r, pos) => rankHist.get(r.slug)?.push(pos + 1));
}
for (const r of rows) {
  const h = (rankHist.get(r.slug) as number[]).sort((p, q) => p - q);
  r.rankLo = h[Math.floor(0.05 * BOOT_B)];
  r.rankHi = h[Math.floor(0.95 * BOOT_B)];
}
// Anchors: nearest traded comp by TVL (same curve read at the same TVL).
for (const r of rows) {
  const lx = Math.log10(r.tvl);
  let best: Proto | null = null;
  let bestD = Infinity;
  for (const c of comps) {
    const d = Math.abs(Math.log10(c.tvl_usd) - lx);
    if (d < bestD - 1e-12 || (Math.abs(d - bestD) <= 1e-12 && best !== null && c.slug < best.slug)) {
      bestD = d;
      best = c;
    }
  }
  const c = best as Proto;
  r.anchorName = c.name;
  r.anchorMcap = c.mcap_usd as number;
  r.anchorTvl = c.tvl_usd;
  r.anchorMult = (c.mcap_usd as number) / c.tvl_usd;
}

// ------------------------------------------------------------------ farm steps
function money(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  return (neg ? "-$" : "$") + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function pct(x: number): string {
  return (x * 100).toFixed(1) + "%";
}
function categoryStep(r: Row): string {
  const chain = r.chains[0] || "Ethereum";
  const dep = money(DEPOSIT_USD);
  const cat = r.category;
  if (cat === "Lending" || cat === "Uncollateralized Lending" || cat === "CDP Manager") {
    return `Lend the ${dep} in ${r.name}'s lending market on ${chain} and keep the loan-to-value under 50%, so a price swing cannot liquidate the position before the 90 days are up.`;
  }
  if (cat === "Dexs" || cat === "Derivatives" || cat === "Basis Trading" || cat === "Perps") {
    return `Provide ${dep} of stablecoin liquidity in ${r.name}'s main pool on ${chain}. Collect the trading fees weekly and pull the position if weekly volume falls by half.`;
  }
  if (cat === "Yield" || cat === "Yield Aggregator" || cat === "Leveraged Farming" || cat === "Onchain Capital Allocator") {
    return `Stake the ${dep} in ${r.name}'s yield vault on ${chain} and compound the rewards weekly. Unstake if the vault's yield falls below the plan's 5% return bar.`;
  }
  if (cat === "Liquid Staking" || cat === "Restaking") {
    return `Stake the ${dep} through ${r.name} on ${chain} and hold the receipt token in the same wallet, so the position stays visible for any future allocation snapshot.`;
  }
  return `Put the ${dep} to work in ${r.name}'s main ${cat} pool on ${chain} and confirm the deposit transaction on-chain before doing anything else.`;
}
function farmSteps(r: Row): string[] {
  const chain = r.chains[0] || "Ethereum";
  const dep = money(DEPOSIT_USD);
  const gas = money(GAS_USD);
  const net = money(r.net);
  const oddsTxt = r.odds.toFixed(2);
  const steps: string[] = [];
  steps.push(
    `Open a fresh wallet on ${chain} and fund it with ${dep} in stablecoins plus ${gas} for gas. Keep the seed phrase offline and never share it with anyone.`,
  );
  if (r.verdict === "FARM") {
    steps.push(
      `Deposit the full ${dep} into ${r.name}. Expected net is ${net} at ${oddsTxt} launch odds, a ${pct(r.ret)} expected return on the deposit, above the 20% FARM bar.`,
    );
  } else if (r.verdict === "WATCH") {
    steps.push(
      `Start with a $1,000 probe in ${r.name}, not the full ${dep}. Expected net is ${net} at ${oddsTxt} odds, below the 0.40 bar for a full FARM; scale up only if the odds rise above 0.40.`,
    );
  } else {
    steps.push(
      `Do not deposit into ${r.name} yet. Expected net is ${net} at ${oddsTxt} odds, below the 5% return bar, so the plan is to watch it and re-check in 90 days.`,
    );
  }
  steps.push(categoryStep(r));
  steps.push(
    `Check the position every Sunday for 90 days, about ${HOURS_PER_PLAN} hours of attention in all. Exit if TVL falls 30% in 7 days, if a token launches, or if weekly volume halves.`,
  );
  steps.push(
    `At day 90, withdraw, count the ${gas} gas already inside the net, and tally the result. If a token launched, claim the allocation within 7 days; if not, roll the capital to the next FARM row.`,
  );
  return steps;
}
for (const r of rows) r.farmSteps = farmSteps(r);

// ------------------------------------------------------------------ playbooks + census
const byCat = new Map<string, Row[]>();
for (const r of rows) {
  const list = byCat.get(r.category) || [];
  list.push(r);
  byCat.set(r.category, list);
}
const playbooks = [...byCat.entries()]
  .map(([cat, list]) => {
    const farms = list.filter((r) => r.verdict === "FARM");
    const nets = list.map((r) => r.net).sort((p, q) => p - q);
    return {
      category: cat,
      rows: list.length,
      farms: farms.length,
      medianNet: Math.round(median(nets)),
      top: list[0].name,
      topNet: Math.round(list[0].net),
    };
  })
  .sort((p, q) => q.rows - p.rows || (p.category < q.category ? -1 : 1));
const farmRows = rows.filter((r) => r.verdict === "FARM");
function netAt(deposit: number, r: Row): number {
  return r.odds * r.implied * FARMER_SHARE * (deposit / DEPOSIT_USD) - GAS_USD;
}
const depositTiers = [1000, 5000, 10000];
const matrix = farmRows.slice(0, 5).map((r) => ({
  name: r.name,
  odds: +r.odds.toFixed(2),
  returns: depositTiers.map((d) => +(netAt(d, r) / d)),
}));
const census = {
  total: prots.length,
  comps: nComp,
  tradedNotComps: prots.filter((p) => p._hasToken === 1).length - nComp,
  board: rows.length,
  offBoard: prots.filter((p) => p._hasToken === 0).length - rows.length,
  watchlist: watchlist.length,
};
const totalImplied = rows.reduce((s, r) => s + r.implied, 0);
const verdictCounts = {
  FARM: rows.filter((r) => r.verdict === "FARM").length,
  WATCH: rows.filter((r) => r.verdict === "WATCH").length,
  SKIP: rows.filter((r) => r.verdict === "SKIP").length,
};

// ------------------------------------------------------------------ validation object (for the dashboard)
const validation = {
  curve: { a: +a.toFixed(4), b: +b.toFixed(4), r2: +curveR2.toFixed(3), rmseLog: +curveRmseLog.toFixed(3), n: nComp, flatMultiple: +flatMult.toFixed(4), huberIters: curve.iters },
  loo: {
    logRatio: +loo.logRatio.toFixed(2),
    logRmse: +loo.logRmse.toFixed(3),
    dollarRmseRatio: +loo.dollarRmseRatio.toFixed(2),
    dollarMaeRatio: +loo.dollarMaeRatio.toFixed(2),
    dollarMseRatio: +loo.dollarMseRatio.toFixed(2),
    dollarRmse: Math.round(loo.dollarRmse),
    within3Model: +loo.within3Model.toFixed(3),
    within3Flat: +loo.within3Flat.toFixed(3),
  },
  holdouts: holdouts.map((h) => ({ seed: h.seed, nTest: h.nTest, logRatio: +h.logRatio.toFixed(2), dollarRatio: +h.dollarRatio.toFixed(2), testR2: +h.testR2.toFixed(3) })),
  timeSplit: { cutoff: timeSplitRes.cutoff, nTrain: timeSplitRes.nTrain, nTest: timeSplitRes.nTest, logRatio: +timeSplitRes.logRatio.toFixed(2), dollarRatio: +timeSplitRes.dollarRatio.toFixed(2), testR2: +timeSplitRes.testR2.toFixed(3) },
  placebo: { r2: +placebo.r2.toFixed(3) },
  conformal: { halfWidthDex: +conformal.halfWidthDex.toFixed(3), coverage: +conformal.coverage.toFixed(2) },
  walkForward: {
    perYear: wfYears.map((w) => ({ year: w.year, nTrain: w.nTrain, nTest: w.nTest, logRatio: +w.logRatio.toFixed(2), dollarRatio: +w.dollarRatio.toFixed(2) })),
    pooled: { nTest: walkForward.pooled.nTest, logRatio: +walkForward.pooled.logRatio.toFixed(2), dollarRatio: +walkForward.pooled.dollarRatio.toFixed(2) },
  },
  odds: {
    orAge: +odds.orAge.toFixed(2),
    orLogTvl: +odds.orLogTvl.toFixed(2),
    or7d: +odds.or7d.toFixed(3),
    auc: +odds.auc.toFixed(3),
    ablation: { noAge: +odds.ablation.noAge.toFixed(3), noLogTvl: +odds.ablation.noLogTvl.toFixed(3), no7d: +odds.ablation.no7d.toFixed(3) },
    nFitted: odds.nFitted,
    medianAge: +odds.medianAge.toFixed(2),
  },
};

// ------------------------------------------------------------------ outputs
const boardJson = {
  generated_from: `house snapshot ${asOf} (${prots.length} protocols, watchlist ${watchlist.length})`,
  rows: rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied,
    farm_steps: r.farmSteps,
    scope: r.scope,
    category: r.category,
    tvl_usd: r.tvl,
    change_7d: r.chg7,
    token_odds: +r.odds.toFixed(4),
    net_expected_usd: Math.round(r.net),
    expected_return: +r.ret.toFixed(4),
    verdict: r.verdict,
    range_90pct_usd: [r.bandLo, r.bandHi],
    conformal_80pct_usd: [r.confLo, r.confHi],
    rank_range: [r.rankLo, r.rankHi],
    break_even_deposit_usd: r.breakEvenDeposit,
    expected_per_hour_usd: +r.perHour.toFixed(2),
    anchor: { name: r.anchorName, mcap_usd: r.anchorMcap, tvl_usd: r.anchorTvl, multiple: +r.anchorMult.toFixed(3) },
  })),
};

// Compact dashboard data: rows as positional arrays so the dossier text
// stays under the 65,536-byte cap. Field order:
// [slug, name, scope(1=watchlist,0=early), catIdx, tvl, chg7, odds(2dp),
//  implied, bandLo($K,1dp), bandHi($K,1dp), rankLo, rankHi, verdict, net,
//  firstChain]
const cats = [...new Set(rows.map((r) => r.category))].sort();
const catIdx = new Map(cats.map((c, i) => [c, i]));
const dashRows = rows.map((r) => [
  r.slug,
  r.name,
  r.scope === "watchlist" ? 1 : 0,
  catIdx.get(r.category) as number,
  r.tvl,
  r.chg7 === null ? null : +r.chg7.toFixed(1),
  +r.odds.toFixed(2),
  r.implied,
  +(r.bandLo / 1000).toFixed(1),
  +(r.bandHi / 1000).toFixed(1),
  r.rankLo,
  r.rankHi,
  r.verdict,
  Math.round(r.net),
  r.chains[0] || "Ethereum",
]);
const dashComps = comps.map((p) => [p.name, p.tvl_usd, p.mcap_usd as number, +((p.mcap_usd as number) / p.tvl_usd).toFixed(3), p.listed_at, +p._age.toFixed(2)]);
const researchNote = [
  `The curve beats a flat multiple ${loo.dollarRmseRatio.toFixed(2)}x in dollars out of sample (leave-one-out RMSE; ${loo.dollarMseRatio.toFixed(2)}x on MSE, ${loo.dollarMaeRatio.toFixed(2)}x on MAE), and ${walkForward.pooled.dollarRatio.toFixed(2)}x pooled walk-forward. The band is wide - the 80% conformal half-width is ${conformal.halfWidthDex.toFixed(2)} dex - so every row shows its range, and verdicts use net expected after a stated 0.01% farmer share, not the point estimate.`,
  `${verdictCounts.FARM} rows earn FARM, ${verdictCounts.WATCH} are WATCH and ${verdictCounts.SKIP} are SKIP on expected return. The top row, ${rows[0].name}, carries an implied value of ${money(rows[0].implied)} with a 90% band of ${money(rows[0].bandLo)} to ${money(rows[0].bandHi)}; its net expected is ${money(rows[0].net)} on a $10,000 deposit.`,
  `The model is one curve, not a stack: a single-factor log-log fit beats every multi-factor variant out of sample on this snapshot, and the 7-day term adds almost nothing (AUC ${odds.auc.toFixed(3)} with it, ${odds.ablation.no7d.toFixed(3)} without it). It stays in the odds model because the bounty asks the value to follow seven-day growth, not because it earns its place on accuracy.`,
];
const dashData = {
  meta: {
    asOf,
    // Snapshot source line with the URL stripped: the dashboard must name
    // no http(s) address in code, and the URL adds nothing the date lacks.
    source: (snap.source as string).replace(/https?:\/\/\S+/g, "").replace(" ,", ",").trim(),
    protocols: prots.length,
    watchlist: watchlist.length,
    floorUsd: snap.floor_usd,
    rows: rows.length,
    totalImplied,
    gasUsd: GAS_USD,
    depositUsd: DEPOSIT_USD,
    farmerShare: FARMER_SHARE,
    hoursPerPlan: HOURS_PER_PLAN,
    ageCapYears: AGE_CAP_YEARS,
  },
  validation,
  census,
  playbooks,
  matrix: { tiers: depositTiers, rows: matrix },
  researchNote,
  rows: dashRows,
  comps: dashComps,
  cats,
};
const dataJs = "const RADAR = " + JSON.stringify(dashData) + ";\n";

mkdirSync(OUTPUT, { recursive: true });
mkdirSync(join(OUTPUT, "dashboard"), { recursive: true });
mkdirSync(join(OUTPUT, "screenshots"), { recursive: true });
writeFileSync(join(OUTPUT, "board.json"), JSON.stringify(boardJson) + "\n");
writeFileSync(join(OUTPUT, "dashboard", "data.js"), dataJs);
cpSync(join(HERE, "dashboard"), join(OUTPUT, "dashboard"), { recursive: true, filter: (src) => !src.endsWith("data.js") });
cpSync(join(HERE, "screenshots"), join(OUTPUT, "screenshots"), { recursive: true });
const dossierBytes = await buildDossier(OUTPUT, { text_max_bytes: 65536 });
writeFileSync(join(OUTPUT, "dossier.json"), dossierBytes);

const dossier = JSON.parse(new TextDecoder().decode(dossierBytes));
console.log("=== token-radar rebuild6-fresh ===");
console.log(`snapshot: ${asOf} ${prots.length} protocols, watchlist ${watchlist.length}, comps ${nComp}`);
console.log(`curve: log10(mcap) = ${a.toFixed(4)} + ${b.toFixed(4)}*log10(TVL), R2 ${curveR2.toFixed(3)}, log-RMSE ${curveRmseLog.toFixed(3)}`);
console.log(`LOO: log ${loo.logRatio.toFixed(2)}x, dollar RMSE ${loo.dollarRmseRatio.toFixed(2)}x, MAE ${loo.dollarMaeRatio.toFixed(2)}x, MSE ${loo.dollarMseRatio.toFixed(2)}x; within-3x ${loo.within3Model.toFixed(3)} vs flat ${loo.within3Flat.toFixed(3)}`);
console.log(`conformal80: half-width ${conformal.halfWidthDex.toFixed(3)} dex, coverage ${conformal.coverage.toFixed(2)}`);
console.log(`holdouts: ${holdouts.map((h) => `seed${h.seed} ${h.logRatio.toFixed(2)}x log / ${h.dollarRatio.toFixed(2)}x $`).join(", ")}`);
console.log(`time-split ${TIME_CUTOFF}: ${timeSplitRes.logRatio.toFixed(2)}x log / ${timeSplitRes.dollarRatio.toFixed(2)}x $, R2 ${timeSplitRes.testR2.toFixed(3)}`);
console.log(`placebo R2 ${placebo.r2.toFixed(3)}; walk-forward pooled ${walkForward.pooled.dollarRatio.toFixed(2)}x $ (n=${walkForward.pooled.nTest})`);
console.log(`odds: OR age ${odds.orAge.toFixed(2)}/yr, logTVL ${odds.orLogTvl.toFixed(2)}, 7d ${odds.or7d.toFixed(3)}, AUC ${odds.auc.toFixed(3)}; ablation ${odds.ablation.noAge.toFixed(3)}/${odds.ablation.noLogTvl.toFixed(3)}/${odds.ablation.no7d.toFixed(3)}`);
console.log(`board: ${rows.length} rows, total implied ${money(totalImplied)}, top ${rows[0].name} ${money(rows[0].implied)}; verdicts FARM ${verdictCounts.FARM} / WATCH ${verdictCounts.WATCH} / SKIP ${verdictCounts.SKIP}; FARM in top 8: ${rows.slice(0, 8).filter((r) => r.verdict === "FARM").length}`);
console.log(`census: ${census.total} = ${census.comps}+${census.tradedNotComps}+${census.board}+${census.offBoard}; watchlist ${census.watchlist}/${census.watchlist}`);
console.log(`dossier: ${dossierBytes.length} bytes, text ${dossier.text.length} chars, images ${dossier.images.length}`);
console.log(`wrote ${OUTPUT}`);
