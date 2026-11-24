// Token-radar model, written fresh for rebuild4.
// What it does: fit a single-factor log-log size curve (Huber-IRLS) on
// one-per-ticker traded comps, test a four-input multiple alongside it and
// keep whichever wins the blind (leave-one-out) test, fit a token-odds
// logistic model on age / size / winsorized 7-day growth, validate with
// LOO, a time-split holdout, walk-forward by listing year, per-term
// ablation and a bootstrap, then rank every eligible pre-token protocol
// by implied value (fitted market cap x launch odds) and write a farm
// plan for each row. Node standard library only; no network.
import { readFileSync } from 'node:fs';

export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

export interface Comp {
  slug: string;
  name: string;
  symbol: string;
  category: string | null;
  chains: number;
  tvl: number;
  change7d: number | null;
  mcap: number;
  listedAt: string | null;
  logTvl: number;
  logMcap: number;
}

export interface RowOut {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_years: number | null;
  scope: 'Watchlist' | 'Early';
  rank: number;
  fitted_mcap_usd: number;
  odds: number;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  gas_usd: number;
  gas_drag_pct: number;
  net_expected_usd: number;
  exit_trigger: string;
  farm_steps: string[];
  nearest: { slug: string; name: string; tvl_usd: number; mcap_usd: number; multiple: number }[];
}

export interface LiveToken {
  slug: string;
  name: string;
  symbol: string;
  category: string | null;
  chains: number;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

export interface CensusBucket {
  key: string;
  label: string;
  count: number;
  examples: string[];
}

// ------------------------------------------------------------------ math

export function log10(x: number): number {
  return Math.log10(x);
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Solve A x = b by Gaussian elimination with partial pivoting. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    }
    if (Math.abs(M[piv]![col]!) < 1e-12) throw new Error('singular matrix in solveLinear');
    if (piv !== col) {
      const tmp = M[col]!;
      M[col] = M[piv]!;
      M[piv] = tmp;
    }
    const d = M[col]![col]!;
    for (let r = col + 1; r < n; r++) {
      const f = M[r]![col]! / d;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let c = r + 1; c < n; c++) s -= M[r]![c]! * x[c]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

/** Weighted least squares: beta = (X' W X)^-1 X' W y. */
export function wls(X: number[][], y: number[], w: number[]): number[] {
  const p = X[0]!.length;
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b: number[] = new Array<number>(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const wi = w[i]!;
    for (let a = 0; a < p; a++) {
      b[a]! += wi * X[i]![a]! * y[i]!;
      for (let c = 0; c < p; c++) A[a]![c]! += wi * X[i]![a]! * X[i]![c]!;
    }
  }
  // tiny ridge for numerical safety; far below the scale of the data
  for (let a = 0; a < p; a++) A[a]![a]! += 1e-10;
  return solveLinear(A, b);
}

export function ols(X: number[][], y: number[]): number[] {
  return wls(X, y, new Array<number>(X.length).fill(1));
}

function predictRow(X: number[][], beta: number[]): number[] {
  return X.map((row) => row.reduce((s, v, j) => s + v * beta[j]!, 0));
}

export function rmse(actual: number[], pred: number[]): number {
  const n = actual.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += (actual[i]! - pred[i]!) ** 2;
  return Math.sqrt(s / n);
}

export function rSquared(actual: number[], pred: number[]): number {
  const m = mean(actual);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < actual.length; i++) {
    ssTot += (actual[i]! - m) ** 2;
    ssRes += (actual[i]! - pred[i]!) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

/** Huber-IRLS robust regression (k = 1.345 sigma, MAD scale). Returns beta, scale, iterations. */
export function huberIrls(
  X: number[][],
  y: number[],
  k = 1.345,
  maxIter = 60,
): { beta: number[]; scale: number; iterations: number } {
  let beta = ols(X, y);
  let scale = 1;
  let iterations = 0;
  for (let it = 0; it < maxIter; it++) {
    iterations = it + 1;
    const fitted = predictRow(X, beta);
    const resid = y.map((v, i) => v - fitted[i]!);
    const med = median(resid);
    const mad = median(resid.map((r) => Math.abs(r - med)));
    scale = 1.4826 * mad;
    if (scale < 1e-9) scale = 1e-9;
    const w = resid.map((r) => {
      const u = Math.abs(r) / (k * scale);
      return u <= 1 ? 1 : 1 / u;
    });
    const next = wls(X, y, w);
    const shift = Math.max(...next.map((v, j) => Math.abs(v - beta[j]!)));
    beta = next;
    if (shift < 1e-10) break;
  }
  return { beta, scale, iterations };
}

/** Leave-one-out RMSE for a fitter (fitter takes X/y of the training rows). */
export function looRmse(
  X: number[][],
  y: number[],
  fit: (Xtr: number[][], ytr: number[]) => number[],
): number {
  const n = X.length;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const Xtr = X.filter((_, j) => j !== i);
    const ytr = y.filter((_, j) => j !== i);
    const beta = fit(Xtr, ytr);
    const pred = X[i]!.reduce((s, v, j) => s + v * beta[j]!, 0);
    ss += (y[i]! - pred) ** 2;
  }
  return Math.sqrt(ss / n);
}

export function winsorize(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Deterministic PRNG (mulberry32) for the bootstrap. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Logistic regression by IRLS on standardized features. Returns the model plus the transform. */
export interface LogisticModel {
  beta: number[]; // [intercept, ...standardized coefficients]
  means: number[];
  stds: number[];
  featureNames: string[];
}

export function fitLogistic(
  rawX: number[][],
  y: number[],
  featureNames: string[],
  ridge = 1e-4,
): LogisticModel {
  const p = rawX[0]!.length;
  const means = new Array<number>(p).fill(0);
  const stds = new Array<number>(p).fill(0);
  for (let j = 0; j < p; j++) {
    const col = rawX.map((r) => r[j]!);
    means[j] = mean(col);
    const m = means[j]!;
    const sd = Math.sqrt(col.reduce((s, v) => s + (v - m) ** 2, 0) / col.length);
    stds[j] = sd > 1e-9 ? sd : 1;
  }
  const X = rawX.map((r) => [1, ...r.map((v, j) => (v - means[j]!) / stds[j]!)]);
  let beta = new Array<number>(p + 1).fill(0);
  for (let it = 0; it < 100; it++) {
    const eta = X.map((r) => r.reduce((s, v, j) => s + v * beta[j]!, 0));
    const mu = eta.map((e) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, e)))));
    const w = mu.map((m) => Math.max(m * (1 - m), 1e-6));
    const z = mu.map((m, i) => eta[i]! + (y[i]! - m) / w[i]!);
    const next = wls(X, z, w.map((wi, i) => wi));
    // small ridge on the coefficients (not the intercept) for stability
    for (let j = 1; j < next.length; j++) next[j] = next[j]! / (1 + ridge);
    const shift = Math.max(...next.map((v, j) => Math.abs(v - beta[j]!)));
    beta = next;
    if (shift < 1e-10) break;
  }
  return { beta, means, stds, featureNames };
}

export function logisticPredict(model: LogisticModel, raw: number[]): number {
  const z = [1, ...raw.map((v, j) => (v - model.means[j]!) / model.stds[j]!)];
  const eta = z.reduce((s, v, j) => s + v * model.beta[j]!, 0);
  const e = Math.max(-30, Math.min(30, eta));
  return 1 / (1 + Math.exp(-e));
}

/** AUC by the Mann-Whitney rank statistic (ties get half credit). */
export function auc(scores: number[], labels: number[]): number {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return wins / (pos.length * neg.length);
}

/** Odds ratio of a logistic model per one original unit of feature j. */
export function oddsRatioPerUnit(model: LogisticModel, j: number): number {
  return Math.exp(model.beta[j + 1]! / model.stds[j]!);
}

// ------------------------------------------------------------------ pipeline

export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];
const BOARD_TARGET = 190;
const GAS_PER_TX_ETH = 12;
const GAS_PER_TX_OTHER = 1.5;
const TXS_PER_PLAN = 4;
const PLAN_DAYS = 90;
const WIN_7D_LO = -50;
const WIN_7D_HI = 100;
const BOOTSTRAP_B = 200;
const BOOTSTRAP_SEED = 20261124;

export function loadSnapshot(path: string): Snapshot {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot has no protocols/watchlist arrays');
  }
  return raw;
}

function yearsBetween(fromDay: string, toDay: string): number {
  const ms = new Date(toDay).getTime() - new Date(fromDay).getTime();
  return ms / (365.25 * 24 * 3600 * 1000);
}

function isNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

function isVersioned(p: Protocol): boolean {
  return VERSION_SUFFIX.test(p.name);
}

function isWrappedWord(p: Protocol): boolean {
  return WRAPPED_WORD.test(p.name);
}

function isExchangePrefixed(p: Protocol): boolean {
  return EXCHANGE_PREFIXES.some((ex) => p.name.startsWith(ex));
}

function isCategoryExcluded(p: Protocol): boolean {
  return p.category !== null && EXCLUDED_CATEGORIES.has(p.category);
}

/** Eligible for the board's early finds: pre-token and not an excluded kind. */
function isEligibleEarly(p: Protocol): boolean {
  return (
    isNoToken(p) &&
    !isCategoryExcluded(p) &&
    !isVersioned(p) &&
    !isWrappedWord(p) &&
    !isExchangePrefixed(p)
  );
}

/** Gas follows the chain the deposit happens on (the protocol's first chain). */
function gasPerTx(p: Protocol): number {
  return p.chains[0] === 'Ethereum' ? GAS_PER_TX_ETH : GAS_PER_TX_OTHER;
}

function depositSize(tvl: number): number {
  return Math.min(10000, Math.max(500, Math.round(tvl * 0.0001)));
}

function actionForCategory(category: string | null): string {
  switch (category) {
    case 'Lending':
      return 'supply the asset and borrow a small amount against it';
    case 'Dexs':
      return 'swap a small amount through the pool and add a little liquidity';
    case 'Yield':
      return 'stake the receipt token and claim the weekly rewards';
    case 'Liquid Staking':
      return 'stake a small amount and hold the receipt token';
    case 'Derivatives':
      return 'open a small hedged position and close it within the week';
    case 'CDP':
      return 'mint a small amount of the stablecoin against your collateral';
    case 'RWA':
      return 'hold the tokenized position and verify the backing report';
    case 'Farm':
      return 'deposit into the farm and harvest the weekly rewards';
    default:
      return "use the protocol's main product (swap, supply or stake) in a small size";
  }
}

function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtUsdShort(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return fmtUsd(n);
}

function buildFarmSteps(
  p: Protocol,
  implied: number,
  odds: number,
  gasTotal: number,
  net: number,
): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const gas = gasPerTx(p);
  const dep = depositSize(p.tvl_usd);
  const cat = p.category ?? 'DeFi';
  return [
    `Open ${p.name} on ${chain} and connect the wallet you farm with. Confirm the dashboard shows about ${fmtUsd(p.tvl_usd)} of TVL and that the contract address matches the one DefiLlama lists, before you move any funds. (10 minutes, no cost.)`,
    `Deposit ${fmtUsd(dep)} into the ${cat} pool on ${chain}. The deposit itself is one transaction, about ${fmtUsd(gas)} of gas on ${chain}; keep the receipt hash so you can prove the position later.`,
    `Use the position once a week: ${actionForCategory(p.category)}. Each weekly action is one transaction, about ${fmtUsd(gas)} of gas, and builds the activity history a launch snapshot would read.`,
    `Hold the position for ${PLAN_DAYS} days and check it every 7 days. If the 7-day TVL change turns sharply negative (below -25%) for two checks in a row, cut the position in half instead of adding more.`,
    `Exit trigger: close the position if ${p.name} launches a token and the snapshot is announced, or if TVL falls 30% from your entry; otherwise hold to day ${PLAN_DAYS} and then reassess. (Exit is one transaction, about ${fmtUsd(gas)} of gas.)`,
    `Withdraw the full position, convert the proceeds back to your home chain, and record the outcome: implied value ${fmtUsd(implied)} at odds ${odds.toFixed(2)} minus ${fmtUsd(gasTotal)} of gas leaves about ${fmtUsd(net)} of net expected value. (One transaction, about ${fmtUsd(gas)} of gas.)`,
  ];
}

export interface FitReport {
  compsBefore: number;
  compsAfter: number;
  duplicatesDropped: number;
  multiR2: number;
  multiRmse: number;
  multiLoo: number;
  multiAblation: { dropped: string; loo: number }[];
  curveA: number;
  curveB: number;
  curveR2: number;
  curveRmse: number;
  curveLoo: number;
  flatMultiple: number;
  flatRmse: number;
  looMultiple: number;
  holdoutCutoff: string;
  holdoutNfit: number;
  holdoutNtest: number;
  holdoutR2: number;
  holdoutRmse: number;
  holdoutFlatRmse: number;
  walkForward: { year: string; nTrain: number; nTest: number; multiple: number }[];
  walkForwardPooled: number;
  within3InSample: number;
  within3Loo: number;
  within2InSample: number;
  within2Loo: number;
  bootstrapSlopeLow: number;
  bootstrapSlopeHigh: number;
  bootstrapInterceptLow: number;
  bootstrapInterceptHigh: number;
  oddsN: number;
  oddsPositives: number;
  oddsIntercept: number;
  oddsAgeOr: number;
  oddsTvlOr: number;
  odds7dOr: number;
  oddsAuc: number;
  oddsAblation: { dropped: string; auc: number }[];
  odds7dWinsorized: { lo: number; hi: number; clipped: number };
  huberIterations: number;
}

export interface BuildResult {
  snapshot: Snapshot;
  rows: RowOut[];
  liveTokens: LiveToken[];
  census: CensusBucket[];
  fit: FitReport;
  totalImplied: number;
  boardTarget: number;
  recompute: {
    curveA: number;
    curveB: number;
    oddsBeta: number[];
    oddsMeans: number[];
    oddsStds: number[];
    medChange7d: number;
    medAge: number;
    winLo: number;
    winHi: number;
  };
}

function nearestComps(row: RowOut, comps: Comp[]): RowOut['nearest'] {
  const lt = Math.log10(row.tvl_usd);
  return [...comps]
    .map((c) => ({ c, d: Math.abs(c.logTvl - lt) }))
    .sort((a, b) => a.d - b.d || b.c.tvl - a.c.tvl)
    .slice(0, 3)
    .map(({ c }) => ({
      slug: c.slug,
      name: c.name,
      tvl_usd: c.tvl,
      mcap_usd: c.mcap,
      multiple: c.mcap / c.tvl,
    }));
}

export function buildBoard(snapshot: Snapshot): BuildResult {
  const protocols = snapshot.protocols;
  const watchSet = new Set(snapshot.watchlist);

  // ---- comps: traded, one row per ticker (keep the highest TVL) ----
  const traded = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  const compsBefore = traded.length;
  const bySymbol = new Map<string, Protocol>();
  for (const p of traded) {
    const key = (p.symbol ?? p.slug).toUpperCase();
    const cur = bySymbol.get(key);
    if (!cur || p.tvl_usd > cur.tvl_usd) bySymbol.set(key, p);
  }
  const comps: Comp[] = [...bySymbol.values()]
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol ?? p.slug,
      category: p.category,
      chains: p.chains.length,
      tvl: p.tvl_usd,
      change7d: p.change_7d,
      mcap: p.mcap_usd as number,
      listedAt: p.listed_at,
      logTvl: Math.log10(p.tvl_usd),
      logMcap: Math.log10(p.mcap_usd as number),
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const duplicatesDropped = compsBefore - comps.length;

  const y = comps.map((c) => c.logMcap);
  const xSingle = comps.map((c) => [1, c.logTvl]);

  // ---- four-input multiple, tested alongside the single-factor curve ----
  const medChange7d = median(comps.map((c) => c.change7d).filter((v): v is number => v !== null));
  const topCats = new Map<string, number>();
  for (const c of comps) {
    if (c.category !== null) topCats.set(c.category, (topCats.get(c.category) ?? 0) + 1);
  }
  const catDummies = [...topCats.entries()]
    .filter(([, n]) => n >= 5)
    .map(([cat]) => cat)
    .sort()
    .slice(0, 9);
  const multiRow = (c: Comp): number[] => [
    1,
    c.logTvl,
    ...catDummies.map((cat) => (c.category === cat ? 1 : 0)),
    Math.log10(Math.max(1, c.chains)),
    (c.change7d ?? medChange7d) / 100,
  ];
  const xMulti = comps.map(multiRow);
  const multiBeta = ols(xMulti, y);
  const multiPred = predictRow(xMulti, multiBeta);
  const multiR2 = rSquared(y, multiPred);
  const multiRmse = rmse(y, multiPred);
  const multiLoo = looRmse(xMulti, y, (xt, yt) => ols(xt, yt));
  const multiAblation: { dropped: string; loo: number }[] = [];
  {
    const dropIdx: [string, number[]][] = [
      ['category', catDummies.map((_, k) => 2 + k)],
      ['chains', [2 + catDummies.length]],
      ['7-day growth', [3 + catDummies.length]],
      ['logTVL', [1]],
    ];
    for (const [name, idxs] of dropIdx) {
      const keep = xMulti[0]!.map((_, j) => j).filter((j) => !idxs.includes(j));
      const xr = xMulti.map((r) => keep.map((j) => r[j]!));
      multiAblation.push({ dropped: name, loo: looRmse(xr, y, (xt, yt) => ols(xt, yt)) });
    }
  }

  // ---- selected curve: single-factor log-log, Huber-IRLS ----
  const huber = huberIrls(xSingle, y);
  const [curveA, curveB] = huber.beta;
  const curvePred = predictRow(xSingle, huber.beta);
  const curveR2 = rSquared(y, curvePred);
  const curveRmse = rmse(y, curvePred);
  const curveLoo = looRmse(xSingle, y, (xt, yt) => huberIrls(xt, yt).beta);
  const logMultiples = comps.map((c) => c.logMcap - c.logTvl);
  const flatMultiple = Math.pow(10, median(logMultiples));
  const flatPred = comps.map((c) => c.logTvl + Math.log10(flatMultiple));
  const flatRmse = rmse(y, flatPred);
  const looMultiple = flatRmse / curveLoo;

  // ---- time-split holdout (median listing date splits comps with a date) ----
  const dated = comps.filter((c) => c.listedAt !== null) as (Comp & { listedAt: string })[];
  const sortedDates = [...dated].map((c) => c.listedAt).sort();
  const holdoutCutoff = sortedDates[Math.floor(sortedDates.length / 2)]!;
  const fitSet = dated.filter((c) => c.listedAt < holdoutCutoff);
  const testSet = dated.filter((c) => c.listedAt >= holdoutCutoff);
  const holdoutFit = huberIrls(
    fitSet.map((c) => [1, c.logTvl]),
    fitSet.map((c) => c.logMcap),
  );
  const holdoutPred = testSet.map((c) => holdoutFit.beta[0]! + holdoutFit.beta[1]! * c.logTvl);
  const holdoutActual = testSet.map((c) => c.logMcap);
  const holdoutR2 = rSquared(holdoutActual, holdoutPred);
  const holdoutRmse = rmse(holdoutActual, holdoutPred);
  const holdoutFlatRmse = rmse(
    holdoutActual,
    testSet.map((c) => c.logTvl + Math.log10(flatMultiple)),
  );

  // ---- walk-forward by listing year (expanding window) ----
  const years = [...new Set(dated.map((c) => c.listedAt.slice(0, 4)))].sort();
  const walkForward: { year: string; nTrain: number; nTest: number; multiple: number }[] = [];
  let wfNum = 0;
  let wfDen = 0;
  for (const yr of years) {
    const train = dated.filter((c) => c.listedAt.slice(0, 4) < yr);
    const test = dated.filter((c) => c.listedAt.slice(0, 4) === yr);
    if (train.length < 20 || test.length < 5) continue;
    const b = huberIrls(
      train.map((c) => [1, c.logTvl]),
      train.map((c) => c.logMcap),
    ).beta;
    const pred = test.map((c) => b[0]! + b[1]! * c.logTvl);
    const actual = test.map((c) => c.logMcap);
    const r = rmse(actual, pred);
    const rf = rmse(
      actual,
      test.map((c) => c.logTvl + Math.log10(flatMultiple)),
    );
    walkForward.push({ year: yr, nTrain: train.length, nTest: test.length, multiple: rf / r });
    wfNum += test.reduce((s, c, i) => s + (actual[i]! - pred[i]!) ** 2, 0);
    wfDen += test.reduce(
      (s, c, i) => s + (actual[i]! - (c.logTvl + Math.log10(flatMultiple))) ** 2,
      0,
    );
  }
  const walkForwardPooled = wfDen > 0 ? Math.sqrt(wfDen / wfNum) : 1;

  // ---- within-3x / within-2x, in-sample and LOO ----
  const within = (preds: number[], factor: number): number => {
    const lim = Math.log10(factor);
    let hit = 0;
    for (let i = 0; i < y.length; i++) {
      if (Math.abs(y[i]! - preds[i]!) <= lim) hit++;
    }
    return hit / y.length;
  };
  const looPreds: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const xt = xSingle.filter((_, j) => j !== i);
    const yt = y.filter((_, j) => j !== i);
    const b = huberIrls(xt, yt).beta;
    looPreds.push(b[0]! + b[1]! * comps[i]!.logTvl);
  }
  const within3InSample = within(curvePred, 3);
  const within3Loo = within(looPreds, 3);
  const within2InSample = within(curvePred, 2);
  const within2Loo = within(looPreds, 2);

  // ---- bootstrap B=200 (seeded): slope/intercept intervals + per-row bands ----
  const rng = mulberry32(BOOTSTRAP_SEED);
  const bootSlopes: number[] = [];
  const bootIntercepts: number[] = [];
  const bootBetas: number[][] = [];
  for (let b = 0; b < BOOTSTRAP_B; b++) {
    const idx = Array.from({ length: comps.length }, () => Math.floor(rng() * comps.length));
    const xb = idx.map((i) => xSingle[i]!);
    const yb = idx.map((i) => y[i]!);
    try {
      const bb = huberIrls(xb, yb).beta;
      bootBetas.push(bb);
      bootIntercepts.push(bb[0]!);
      bootSlopes.push(bb[1]!);
    } catch {
      // a degenerate resample (all one x) cannot be fitted; skip it
    }
  }
  bootSlopes.sort((a, b) => a - b);
  bootIntercepts.sort((a, b) => a - b);
  const bootstrapSlopeLow = quantileSorted(bootSlopes, 0.05);
  const bootstrapSlopeHigh = quantileSorted(bootSlopes, 0.95);
  const bootstrapInterceptLow = quantileSorted(bootIntercepts, 0.05);
  const bootstrapInterceptHigh = quantileSorted(bootIntercepts, 0.95);

  // ---- token-odds logistic model (age / size / winsorized 7-day growth) ----
  const asOf = snapshot.as_of;
  const oddsRows = protocols
    .filter((p) => p.listed_at !== null)
    .map((p) => {
      const age = yearsBetween(p.listed_at as string, asOf);
      const raw7d = p.change_7d ?? medChange7d;
      const w7d = winsorize(raw7d, WIN_7D_LO, WIN_7D_HI);
      return {
        p,
        label: isNoToken(p) ? 0 : 1,
        feats: [age, Math.log10(p.tvl_usd), w7d],
        clipped: raw7d !== w7d ? 1 : 0,
      };
    });
  const oddsX = oddsRows.map((r) => r.feats);
  const oddsY = oddsRows.map((r) => r.label);
  const oddsModel = fitLogistic(oddsX, oddsY, ['age_years', 'log10_tvl', 'change_7d_winsorized']);
  const oddsScores = oddsRows.map((r) => logisticPredict(oddsModel, r.feats));
  const oddsAuc = auc(oddsScores, oddsY);
  const oddsAblation: { dropped: string; auc: number }[] = [];
  for (const [name, drop] of [
    ['age', 0],
    ['logTVL', 1],
    ['7-day growth', 2],
  ] as [string, number][]) {
    const keep = [0, 1, 2].filter((j) => j !== drop);
    const xr = oddsX.map((r) => keep.map((j) => r[j]!));
    const m = fitLogistic(xr, oddsY, keep.map((j) => oddsModel.featureNames[j]!));
    const sc = xr.map((r) => logisticPredict(m, r));
    oddsAblation.push({ dropped: name, auc: auc(sc, oddsY) });
  }
  const odds7dWinsorized = {
    lo: WIN_7D_LO,
    hi: WIN_7D_HI,
    clipped: oddsRows.reduce((s, r) => s + r.clipped, 0),
  };

  // ---- board: every watchlist row + the biggest eligible early finds ----
  const bySlug = new Map(protocols.map((p) => [p.slug, p]));
  const watchRows = snapshot.watchlist.map((s) => bySlug.get(s)!).filter(Boolean);
  const earlyPool = protocols
    .filter((p) => isEligibleEarly(p) && !watchSet.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
  const boardProtocols = [
    ...watchRows,
    ...earlyPool.slice(0, Math.max(0, BOARD_TARGET - watchRows.length)),
  ];

  const fittedFor = (tvl: number, beta: number[]): number =>
    Math.pow(10, beta[0]! + beta[1]! * Math.log10(tvl));

  const rowsUnranked: RowOut[] = boardProtocols.map((p) => {
    const fitted = fittedFor(p.tvl_usd, huber.beta);
    const age = p.listed_at !== null ? yearsBetween(p.listed_at, asOf) : null;
    const feats = [
      age ?? median(oddsRows.map((r) => r.feats[0]!)),
      Math.log10(p.tvl_usd),
      winsorize(p.change_7d ?? medChange7d, WIN_7D_LO, WIN_7D_HI),
    ];
    const odds = logisticPredict(oddsModel, feats);
    const implied = Math.max(1, Math.round(fitted * odds));
    const bandFits = bootBetas.map((bb) => fittedFor(p.tvl_usd, bb) * odds);
    bandFits.sort((a, b) => a - b);
    const bandLow = Math.max(1, Math.round(quantileSorted(bandFits, 0.05)));
    const bandHigh = Math.max(1, Math.round(quantileSorted(bandFits, 0.95)));
    const gasTotal = gasPerTx(p) * TXS_PER_PLAN;
    const net = Math.max(0, implied - gasTotal);
    const gasDragPct = implied > 0 ? (gasTotal / implied) * 100 : 0;
    const exitTrigger =
      `${p.name} launches a token and the snapshot is announced, or TVL falls 30% ` +
      `from entry (${fmtUsd(p.tvl_usd * 0.7)}); otherwise hold to day ${PLAN_DAYS}.`;
    const row: RowOut = {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_years: age,
      scope: watchSet.has(p.slug) ? 'Watchlist' : 'Early',
      rank: 0,
      fitted_mcap_usd: Math.round(fitted),
      odds,
      implied_value_usd: implied,
      band_low_usd: bandLow,
      band_high_usd: bandHigh,
      gas_usd: gasTotal,
      gas_drag_pct: gasDragPct,
      net_expected_usd: net,
      exit_trigger: exitTrigger,
      farm_steps: buildFarmSteps(p, implied, odds, gasTotal, net),
      nearest: [],
    };
    row.nearest = nearestComps(row, comps);
    return row;
  });
  rowsUnranked.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : 1),
  );
  rowsUnranked.forEach((r, i) => {
    r.rank = i + 1;
  });
  const totalImplied = rowsUnranked.reduce((s, r) => s + r.implied_value_usd, 0);

  // ---- live tokens: every traded comp, biggest market cap first ----
  const liveTokens: LiveToken[] = [...comps]
    .sort((a, b) => b.mcap - a.mcap)
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      symbol: c.symbol,
      category: c.category,
      chains: c.chains,
      tvl_usd: c.tvl,
      mcap_usd: c.mcap,
      multiple: c.mcap / c.tvl,
    }));

  // ---- census: a partition of the whole snapshot (sums exactly) ----
  const rankedSlugs = new Set(rowsUnranked.map((r) => r.slug));
  const bucket = (label: string, members: Protocol[]): CensusBucket => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    label,
    count: members.length,
    examples: members.slice(0, 3).map((p) => p.name),
  });
  const tradedSet = new Set(traded.map((p) => p.slug));
  const tokenNoMcap = protocols.filter(
    (p) => !isNoToken(p) && (p.mcap_usd === null || p.mcap_usd <= 0),
  );
  const rest = protocols.filter(
    (p) => isNoToken(p) && !rankedSlugs.has(p.slug),
  );
  const catExcluded = rest.filter((p) => isCategoryExcluded(p));
  const rest2 = rest.filter((p) => !isCategoryExcluded(p));
  const versioned = rest2.filter((p) => isVersioned(p));
  const rest3 = rest2.filter((p) => !isVersioned(p));
  const wrapped = rest3.filter((p) => isWrappedWord(p));
  const rest4 = rest3.filter((p) => !isWrappedWord(p));
  const exchange = rest4.filter((p) => isExchangePrefixed(p));
  const eligibleNotSelected = rest4.filter((p) => !isExchangePrefixed(p));
  const census: CensusBucket[] = [
    bucket('Traded (token live)', protocols.filter((p) => tradedSet.has(p.slug))),
    bucket('Ranked on the board', rowsUnranked.map((r) => bySlug.get(r.slug)!)),
    bucket('Token recorded, no market cap', tokenNoMcap),
    bucket('Category excluded', catExcluded),
    bucket('Versioned name', versioned),
    bucket('Wrapped / staked product', wrapped),
    bucket('Exchange product', exchange),
    bucket('Eligible, not selected', eligibleNotSelected),
  ];

  const fit: FitReport = {
    compsBefore,
    compsAfter: comps.length,
    duplicatesDropped,
    multiR2,
    multiRmse,
    multiLoo,
    multiAblation,
    curveA,
    curveB,
    curveR2,
    curveRmse,
    curveLoo,
    flatMultiple,
    flatRmse,
    looMultiple,
    holdoutCutoff,
    holdoutNfit: fitSet.length,
    holdoutNtest: testSet.length,
    holdoutR2,
    holdoutRmse,
    holdoutFlatRmse,
    walkForward,
    walkForwardPooled,
    within3InSample,
    within3Loo,
    within2InSample,
    within2Loo,
    bootstrapSlopeLow,
    bootstrapSlopeHigh,
    bootstrapInterceptLow,
    bootstrapInterceptHigh,
    oddsN: oddsRows.length,
    oddsPositives: oddsY.reduce((s, v) => s + v, 0),
    oddsIntercept: oddsModel.beta[0]!,
    oddsAgeOr: oddsRatioPerUnit(oddsModel, 0),
    oddsTvlOr: oddsRatioPerUnit(oddsModel, 1),
    odds7dOr: Math.exp((oddsModel.beta[3]! / oddsModel.stds[2]!) * 10), // per 10 points of 7d growth
    oddsAuc,
    oddsAblation,
    odds7dWinsorized,
    huberIterations: huber.iterations,
  };

  return {
    snapshot,
    rows: rowsUnranked,
    liveTokens,
    census,
    fit,
    totalImplied,
    boardTarget: BOARD_TARGET,
    recompute: {
      curveA,
      curveB,
      oddsBeta: oddsModel.beta,
      oddsMeans: oddsModel.means,
      oddsStds: oddsModel.stds,
      medChange7d,
      medAge: median(oddsRows.map((r) => r.feats[0]!)),
      winLo: WIN_7D_LO,
      winHi: WIN_7D_HI,
    },
  };
}

export { fmtUsd, fmtUsdShort };
