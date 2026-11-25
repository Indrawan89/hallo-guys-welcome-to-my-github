// Token-radar model — written fresh for rebuild5 (25 Nov 2026).
// Single-factor Huber-IRLS log-log size curve + token-odds logistic model,
// with held-out-twice validation, a placebo test, split-conformal intervals,
// walk-forward, bootstrap bands, per-term ablation, and a ranked board of
// every eligible pre-token protocol (no row cap).
//
// No network, Node 22 stdlib only. Deterministic: every shuffle and
// resample uses a fixed seed; the snapshot's as_of is the only date.

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

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (typeof raw.as_of !== 'string' || typeof raw.source !== 'string') {
    throw new Error('snapshot: as_of/source missing');
  }
  if (typeof raw.floor_usd !== 'number' || !Array.isArray(raw.protocols)) {
    throw new Error('snapshot: floor_usd/protocols missing');
  }
  if (!Array.isArray(raw.watchlist)) throw new Error('snapshot: watchlist missing');
  const protocols: Protocol[] = (raw.protocols as Record<string, unknown>[]).map((p) => {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string') {
      throw new Error('snapshot: protocol without slug/name');
    }
    if (typeof p.tvl_usd !== 'number') throw new Error(`snapshot: ${p.slug} without tvl_usd`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? (p.chains as string[]) : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: raw.as_of,
    source: raw.source,
    floor_usd: raw.floor_usd,
    protocols,
    watchlist: raw.watchlist as string[],
  };
}

// ---------------------------------------------------------------------------
// Exclusions (the house watchlist rule, kit input/README.md)
// ---------------------------------------------------------------------------

const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

export function hasToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

export function isTraded(p: Protocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0;
}

export function isVersioned(name: string): boolean {
  return VERSION_RE.test(name);
}

export function hasWrappedWord(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w === 'wrapped' || w === 'staked' || w === 'staking');
}

export function startsWithExchange(name: string): boolean {
  return EXCHANGE_NAMES.some((e) => name.startsWith(e));
}

export function isCategoryExcluded(p: Protocol): boolean {
  return p.category !== null && EXCLUDED_CATEGORIES.has(p.category);
}

export type Bucket =
  | 'traded'
  | 'token-no-mcap'
  | 'category-excluded'
  | 'versioned'
  | 'wrapped'
  | 'exchange'
  | 'ranked';

export function bucketOf(p: Protocol): Bucket {
  if (isTraded(p)) return 'traded';
  if (hasToken(p)) return 'token-no-mcap';
  if (isCategoryExcluded(p)) return 'category-excluded';
  if (isVersioned(p.name)) return 'versioned';
  if (hasWrappedWord(p.name)) return 'wrapped';
  if (startsWithExchange(p.name)) return 'exchange';
  return 'ranked';
}

export interface Census {
  buckets: { name: Bucket; count: number; example: string }[];
  total: number;
}

export function censusOf(snapshot: Snapshot): Census {
  const counts = new Map<Bucket, number>();
  const examples = new Map<Bucket, string>();
  for (const p of snapshot.protocols) {
    const b = bucketOf(p);
    counts.set(b, (counts.get(b) ?? 0) + 1);
    if (!examples.has(b)) examples.set(b, p.name);
  }
  const order: Bucket[] = [
    'traded',
    'ranked',
    'token-no-mcap',
    'category-excluded',
    'versioned',
    'wrapped',
    'exchange',
  ];
  return {
    buckets: order.map((name) => ({
      name,
      count: counts.get(name) ?? 0,
      example: examples.get(name) ?? '—',
    })),
    total: snapshot.protocols.length,
  };
}

/** Traded comps, one per ticker (case-insensitive), keeping the larger TVL
 * of a duplicated ticker. Returned in TVL-descending order so the
 * shuffle/resample order matches the Python cross-check (which sorts the
 * same way before it shuffles). */
export function compsOf(snapshot: Snapshot): Protocol[] {
  const traded = snapshot.protocols.filter(isTraded);
  const byTicker = new Map<string, Protocol>();
  for (const p of [...traded].sort((x, y) => y.tvl_usd - x.tvl_usd)) {
    const t = (p.symbol ?? '').toLowerCase();
    if (t && !byTicker.has(t)) byTicker.set(t, p);
    if (!t) byTicker.set(`__no_symbol_${p.slug}`, p);
  }
  return [...byTicker.values()].sort((a, b) => b.tvl_usd - a.tvl_usd);
}

// ---------------------------------------------------------------------------
// Deterministic RNG: a byte-exact replica of CPython's random.Random
// (MT19937 with init_by_array seeding for int seeds, getrandbits /
// randbelow / shuffle / randrange). The diagnosis numbers were computed
// with Python's Random(20261125) / Random(20261124); using the same stream
// here makes the build reproduce them exactly instead of a different split.
// Verified against Python: Random(42).random() == 0.6394267984578837 and
// Random(20261125).shuffle / Random(20261124).randrange match item for item.
// ---------------------------------------------------------------------------

export class PythonRandom {
  private mt = new Uint32Array(624);
  private idx = 625;

  constructor(seed: number) {
    const key = [seed >>> 0];
    this.mt[0] = 19650218;
    for (let i = 1; i < 624; i++) {
      this.mt[i] = (Math.imul(1812433253, this.mt[i - 1]! ^ (this.mt[i - 1]! >>> 30)) + i) >>> 0;
    }
    let i = 1;
    let j = 0;
    const k = Math.max(624, key.length);
    for (let n = 0; n < k; n++) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = (this.mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1664525)) + key[j]! + j;
      this.mt[i] = this.mt[i]! >>> 0;
      i++;
      j++;
      if (i >= 624) {
        this.mt[0] = this.mt[623]!;
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let n = 0; n < 623; n++) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = (this.mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) - i;
      this.mt[i] = this.mt[i]! >>> 0;
      i++;
      if (i >= 624) {
        this.mt[0] = this.mt[623]!;
        i = 1;
      }
    }
    this.mt[0] = 0x80000000;
  }

  private twist(): void {
    for (let i = 0; i < 624; i++) {
      const y = (this.mt[i]! & 0x80000000) | (this.mt[(i + 1) % 624]! & 0x7fffffff);
      let xa = y >>> 1;
      if (y & 1) xa ^= 0x9908b0df;
      this.mt[i] = (this.mt[(i + 397) % 624]! ^ xa) >>> 0;
    }
    this.idx = 0;
  }

  private genrandInt32(): number {
    if (this.idx >= 624) this.twist();
    let y = this.mt[this.idx++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  getrandbits(k: number): number {
    if (k <= 32) return this.genrandInt32() >>> (32 - k);
    let r = 0;
    let rem = k;
    while (rem > 0) {
      const take = Math.min(32, rem);
      r = r * 2 ** take + (this.genrandInt32() >>> (32 - take));
      rem -= take;
    }
    return r;
  }

  randbelow(n: number): number {
    if (n <= 0) throw new Error('randbelow: n <= 0');
    const k = n.toString(2).length;
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  randrange(n: number): number {
    return this.randbelow(n);
  }

  shuffle<T>(xs: T[]): void {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
  }
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function rmseOf(errs: number[]): number {
  return Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
}

/** Gaussian elimination with partial pivoting. The augmented column is
 * carried through elimination and read back in back-substitution — the
 * original right-hand side is never reused after pivoting. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    }
    if (Math.abs(M[piv]![c]!) < 1e-12) throw new Error('solveLinear: singular matrix');
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      for (let cc = c; cc <= n; cc++) M[r]![cc]! -= f * M[c]![cc]!;
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

/** Ordinary least squares for y ~ X (X rows already include the intercept
 * column when wanted). Returns the coefficient vector. */
export function ols(X: number[][], y: number[]): number[] {
  const p = X[0]!.length;
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b: number[] = new Array<number>(p).fill(0);
  for (let k = 0; k < X.length; k++) {
    for (let i = 0; i < p; i++) {
      b[i]! += X[k]![i]! * y[k]!;
      for (let j = 0; j < p; j++) A[i]![j]! += X[k]![i]! * X[k]![j]!;
    }
  }
  return solveLinear(A, b);
}

export function predict(beta: number[], x: number[]): number {
  return beta.reduce((s, bi, i) => s + bi * x[i]!, 0);
}

export function rSquared(y: number[], yHat: number[]): number {
  const m = mean(y);
  const ssTot = y.reduce((s, v) => s + (v - m) * (v - m), 0);
  const ssRes = y.reduce((s, v, i) => s + (v - yHat[i]!) * (v - yHat[i]!), 0);
  return 1 - ssRes / ssTot;
}

// ---------------------------------------------------------------------------
// Huber-IRLS single-factor curve: log10(mcap) = a + b * log10(tvl)
// ---------------------------------------------------------------------------

export interface CurveFit {
  a: number;
  b: number;
  r2: number;
  rmse: number;
  n: number;
  flatMultiple: number;
  flatRmse: number;
}

export function huberFit(xs: number[], ys: number[], iters = 10, k = 1.345): CurveFit {
  let [a, b] = ols2(xs, ys);
  for (let it = 0; it < iters; it++) {
    const res = ys.map((y, i) => y - (a + b * xs[i]!));
    const med = median(res);
    const sigma = 1.4826 * median(res.map((r) => Math.abs(r - med))) || 1e-9;
    const w = res.map((r) => (Math.abs(r) <= k * sigma ? 1 : (k * sigma) / Math.abs(r)));
    const sw = w.reduce((s, v) => s + v, 0);
    const mx = w.reduce((s, wi, i) => s + wi * xs[i]!, 0) / sw;
    const my = w.reduce((s, wi, i) => s + wi * ys[i]!, 0) / sw;
    const sxx = w.reduce((s, wi, i) => s + wi * (xs[i]! - mx) * (xs[i]! - mx), 0);
    const sxy = w.reduce((s, wi, i) => s + wi * (xs[i]! - mx) * (ys[i]! - my), 0);
    b = sxy / sxx;
    a = my - b * mx;
  }
  const res = ys.map((y, i) => y - (a + b * xs[i]!));
  const flatMultiple = median(ys.map((y, i) => 10 ** (y - xs[i]!)));
  const flatRes = ys.map((y, i) => y - (xs[i]! + Math.log10(flatMultiple)));
  return {
    a,
    b,
    r2: rSquared(ys, ys.map((_, i) => a + b * xs[i]!)),
    rmse: rmseOf(res),
    n: xs.length,
    flatMultiple,
    flatRmse: rmseOf(flatRes),
  };
}

function ols2(xs: number[], ys: number[]): [number, number] {
  const mx = mean(xs);
  const my = mean(ys);
  const sxx = xs.reduce((s, x) => s + (x - mx) * (x - mx), 0);
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0);
  const b = sxy / sxx;
  return [my - b * mx, b];
}

// ---------------------------------------------------------------------------
// Validation — all out-of-sample, all recomputed from the snapshot
// ---------------------------------------------------------------------------

export interface LooResult {
  rmse: number;
  flatRmse: number;
  ratio: number;
  within3: number;
  within2: number;
  residuals: number[];
}

/** Leave-one-out with Huber refits; the flat model is the median multiple
 * of the remaining comps each fold. */
export function looCurve(xs: number[], ys: number[], comps: Protocol[]): LooResult {
  const errs: number[] = [];
  const flatErrs: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const xi = xs.filter((_, j) => j !== i);
    const yi = ys.filter((_, j) => j !== i);
    const fit = huberFit(xi, yi);
    errs.push(ys[i]! - (fit.a + fit.b * xs[i]!));
    const fm = median(
      comps.filter((_, j) => j !== i).map((p) => p.mcap_usd! / p.tvl_usd),
    );
    flatErrs.push(ys[i]! - (xs[i]! + Math.log10(fm)));
  }
  const rmse = rmseOf(errs);
  const flatRmse = rmseOf(flatErrs);
  return {
    rmse,
    flatRmse,
    ratio: flatRmse / rmse,
    within3: errs.filter((e) => Math.abs(e) <= Math.log10(3)).length / errs.length,
    within2: errs.filter((e) => Math.abs(e) <= Math.log10(2)).length / errs.length,
    residuals: errs,
  };
}

export interface HoldoutResult {
  ratio: number;
  r2: number;
  nTrain: number;
  nTest: number;
  cutoff?: string;
}

/** Random 80/20 holdout with a fixed seed. */
export function randomHoldout(
  xs: number[],
  ys: number[],
  flatMultiple: number,
  seed = 20261125,
): HoldoutResult {
  const rand = new PythonRandom(seed);
  const idx = xs.map((_, i) => i);
  rand.shuffle(idx);
  const cut = Math.floor(0.8 * idx.length);
  const tr = idx.slice(0, cut);
  const te = idx.slice(cut);
  const fit = huberFit(tr.map((i) => xs[i]!), tr.map((i) => ys[i]!));
  const errs = te.map((i) => ys[i]! - (fit.a + fit.b * xs[i]!));
  const flat = te.map((i) => ys[i]! - (xs[i]! + Math.log10(flatMultiple)));
  const testMean = mean(te.map((i) => ys[i]!));
  return {
    ratio: rmseOf(flat) / rmseOf(errs),
    r2: 1 - errs.reduce((s, e) => s + e * e, 0) / te.reduce((s, i) => s + (ys[i]! - testMean) ** 2, 0),
    nTrain: tr.length,
    nTest: te.length,
  };
}

/** Time-split holdout: the median listing date splits fit from test. */
export function timeSplitHoldout(
  xs: number[],
  ys: number[],
  comps: Protocol[],
  flatMultiple: number,
): HoldoutResult {
  const dated = comps
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.listed_at !== null)
    .sort((x, y) => (x.p.listed_at! < y.p.listed_at! ? -1 : 1));
  const cutoff = dated[Math.floor(dated.length / 2)]!.p.listed_at!;
  const tr = dated.filter(({ p }) => p.listed_at! < cutoff).map(({ i }) => i);
  const te = dated.filter(({ p }) => p.listed_at! >= cutoff).map(({ i }) => i);
  const fit = huberFit(tr.map((i) => xs[i]!), tr.map((i) => ys[i]!));
  const errs = te.map((i) => ys[i]! - (fit.a + fit.b * xs[i]!));
  const flat = te.map((i) => ys[i]! - (xs[i]! + Math.log10(flatMultiple)));
  const testMean = mean(te.map((i) => ys[i]!));
  return {
    ratio: rmseOf(flat) / rmseOf(errs),
    r2: 1 - errs.reduce((s, e) => s + e * e, 0) / te.reduce((s, i) => s + (ys[i]! - testMean) ** 2, 0),
    nTrain: tr.length,
    nTest: te.length,
    cutoff,
  };
}

/** Placebo: shuffle the target and refit by OLS — a real signal must
 * collapse to R² ≈ 0. */
export function placeboTest(xs: number[], ys: number[], seed = 20261125): number {
  const rand = new PythonRandom(seed);
  const shuffled = [...ys];
  rand.shuffle(shuffled);
  const [a, b] = ols2(xs, shuffled);
  return rSquared(shuffled, shuffled.map((_, i) => a + b * xs[i]!));
}

export interface ConformalResult {
  halfWidthDex: number;
  coverage: number;
  nTest: number;
  level: number;
}

/** Cross-conformal 80% intervals from the LOO residuals; coverage is
 * measured on the random 80/20 holdout's test rows (never used to fit). */
export function conformalFromLoo(
  looResiduals: number[],
  xs: number[],
  ys: number[],
  flatMultiple: number,
  seed = 20261125,
): ConformalResult {
  const absRes = [...looResiduals].map(Math.abs).sort((x, y) => x - y);
  const q = Math.ceil(0.8 * (absRes.length + 1)) - 1;
  const halfWidthDex = absRes[Math.min(q, absRes.length - 1)]!;
  const rand = new PythonRandom(seed);
  const idx = xs.map((_, i) => i);
  rand.shuffle(idx);
  const te = idx.slice(Math.floor(0.8 * idx.length));
  const fit = huberFit(
    idx.slice(0, Math.floor(0.8 * idx.length)).map((i) => xs[i]!),
    idx.slice(0, Math.floor(0.8 * idx.length)).map((i) => ys[i]!),
  );
  const errs = te.map((i) => ys[i]! - (fit.a + fit.b * xs[i]!));
  return {
    halfWidthDex,
    coverage: errs.filter((e) => Math.abs(e) <= halfWidthDex).length / errs.length,
    nTest: errs.length,
    level: 0.8,
  };
}

export interface WalkForwardResult {
  pooled: number;
  years: { year: number; ratio: number; nTest: number }[];
  n: number;
}

/** Walk-forward by listing year: train on comps listed before the year,
 * test on comps listed in it. */
export function walkForward(xs: number[], ys: number[], comps: Protocol[]): WalkForwardResult {
  const dated = comps
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.listed_at !== null);
  const years = [...new Set(dated.map(({ p }) => Number(p.listed_at!.slice(0, 4))))].sort();
  const flatMultiple = median(comps.map((p) => p.mcap_usd! / p.tvl_usd));
  const allErr: number[] = [];
  const allFlat: number[] = [];
  const perYear: { year: number; ratio: number; nTest: number }[] = [];
  for (const y of years) {
    const train = dated.filter(({ p }) => Number(p.listed_at!.slice(0, 4)) < y);
    const test = dated.filter(({ p }) => Number(p.listed_at!.slice(0, 4)) === y);
    if (train.length < 5 || test.length < 3) continue;
    const fit = huberFit(train.map(({ i }) => xs[i]!), train.map(({ i }) => ys[i]!));
    const errs = test.map(({ i }) => ys[i]! - (fit.a + fit.b * xs[i]!));
    const flat = test.map(({ i }) => ys[i]! - (xs[i]! + Math.log10(flatMultiple)));
    allErr.push(...errs);
    allFlat.push(...flat);
    perYear.push({ year: y, ratio: rmseOf(flat) / rmseOf(errs), nTest: test.length });
  }
  return { pooled: rmseOf(allFlat) / rmseOf(allErr), years: perYear, n: allErr.length };
}

// ---------------------------------------------------------------------------
// Multi-factor OLS (fitted, then set aside by the blind test — one neutral
// sentence in Methodology, never a headline)
// ---------------------------------------------------------------------------

export interface MultiResult {
  r2: number;
  rmse: number;
  looRmse: number;
  terms: string[];
}

export function multiFactor(
  xs: number[],
  ys: number[],
  comps: Protocol[],
): MultiResult {
  const cats = [...new Set(comps.map((p) => p.category).filter((c): c is string => c !== null))];
  const counts = new Map<string, number>();
  for (const p of comps) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const bigCats = cats.filter((c) => (counts.get(c) ?? 0) >= 5);
  const feats = (p: Protocol): number[] => [
    1,
    Math.log10(p.tvl_usd),
    ...bigCats.map((c) => (p.category === c ? 1 : 0)),
    Math.log10(Math.max(1, p.chains.length)),
    (p.change_7d ?? 0) / 100,
  ];
  const X = comps.map(feats);
  const beta = ols(X, ys);
  const yHat = X.map((x) => predict(beta, x));
  const errs = ys.map((y, i) => y - yHat[i]!);
  const looErrs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const Xi = X.filter((_, j) => j !== i);
    const yi = ys.filter((_, j) => j !== i);
    const bi = ols(Xi, yi);
    looErrs.push(ys[i]! - predict(bi, X[i]!));
  }
  return {
    r2: rSquared(ys, yHat),
    rmse: rmseOf(errs),
    looRmse: rmseOf(looErrs),
    terms: ['logTVL', ...bigCats.map((c) => `cat:${c}`), 'logChains', 'change7d'],
  };
}

// ---------------------------------------------------------------------------
// Bootstrap (B=200, seeded): slope/intercept intervals + per-row bands
// ---------------------------------------------------------------------------

export interface BootstrapResult {
  slope: [number, number];
  intercept: [number, number];
  b: number;
  /** Per comp index: [5th, 95th] percentile of the implied value. */
  rowBands: [number, number][];
}

export function bootstrap(
  xs: number[],
  ys: number[],
  boardTvls: number[],
  seed = 20261124,
  B = 200,
): BootstrapResult {
  const rand = new PythonRandom(seed);
  const slopes: number[] = [];
  const inters: number[] = [];
  const impliedSamples: number[][] = boardTvls.map(() => []);
  for (let k = 0; k < B; k++) {
    const idx = Array.from({ length: xs.length }, () => rand.randrange(xs.length));
    const fit = huberFit(idx.map((i) => xs[i]!), idx.map((i) => ys[i]!));
    slopes.push(fit.b);
    inters.push(fit.a);
    boardTvls.forEach((tvl, r) => {
      impliedSamples[r]!.push(10 ** (fit.a + fit.b * Math.log10(tvl)));
    });
  }
  const pct = (sorted: number[], q: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))]!;
  slopes.sort((x, y) => x - y);
  inters.sort((x, y) => x - y);
  return {
    slope: [pct(slopes, 0.05), pct(slopes, 0.95)],
    intercept: [pct(inters, 0.05), pct(inters, 0.95)],
    b: B,
    rowBands: impliedSamples.map((s) => {
      s.sort((x, y) => x - y);
      return [pct(s, 0.05), pct(s, 0.95)];
    }),
  };
}

// ---------------------------------------------------------------------------
// Token-odds logistic model: P(has token) from age, logTVL, winsorized 7d
// ---------------------------------------------------------------------------

export function ageYears(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const d0 = Date.parse(`${listedAt}T00:00:00Z`);
  const d1 = Date.parse(`${asOf}T00:00:00Z`);
  return (d1 - d0) / (365.25 * 86400 * 1000);
}

export function winsorize7d(change7d: number | null): number {
  const v = change7d ?? 0;
  return Math.max(-50, Math.min(100, v));
}

export interface OddsResult {
  coefficients: number[];
  oddsRatios: { age: number; logTvl: number; change7d: number };
  auc: number;
  n: number;
  positives: number;
  ablation: { noAge: number; noLogTvl: number; noChange7d: number };
}

export function logisticFit(X: number[][], y: number[], iters = 50): number[] {
  const p = X[0]!.length;
  let beta = new Array<number>(p).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array<number>(p).fill(0);
    const H: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    for (let k = 0; k < X.length; k++) {
      const z = Math.max(-30, Math.min(30, predict(beta, X[k]!)));
      const pr = 1 / (1 + Math.exp(-z));
      const w = pr * (1 - pr) + 1e-9;
      for (let i = 0; i < p; i++) {
        g[i]! += (y[k]! - pr) * X[k]![i]!;
        for (let j = 0; j < p; j++) H[i]![j]! += w * X[k]![i]! * X[k]![j]!;
      }
    }
    for (let i = 0; i < p; i++) H[i]![i]! += 1e-6;
    const step = solveLinear(H, g);
    beta = beta.map((bi, i) => bi + step[i]!);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return beta;
}

export function aucOf(scores: number[], labels: number[]): number {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  }
  return wins / (pos.length * neg.length);
}

export function oddsModel(snapshot: Snapshot): OddsResult {
  const rows: { x: number[]; y: number }[] = [];
  for (const p of snapshot.protocols) {
    const age = ageYears(snapshot.as_of, p.listed_at);
    if (age === null) continue;
    rows.push({
      x: [1, age, Math.log10(p.tvl_usd), winsorize7d(p.change_7d) / 10],
      y: hasToken(p) ? 1 : 0,
    });
  }
  const X = rows.map((r) => r.x);
  const y = rows.map((r) => r.y);
  const beta = logisticFit(X, y);
  const scores = X.map((x) => predict(beta, x));
  const auc = aucOf(scores, y);
  const aucWithout = (drop: number): number => {
    const keep = [0, 1, 2, 3].filter((i) => i !== drop);
    const Xi = X.map((x) => keep.map((i) => x[i]!));
    const bi = logisticFit(Xi, y);
    return aucOf(Xi.map((x) => predict(bi, x)), y);
  };
  return {
    coefficients: beta,
    oddsRatios: {
      age: Math.exp(beta[1]!),
      logTvl: Math.exp(beta[2]!),
      change7d: Math.exp(beta[3]!),
    },
    auc,
    n: rows.length,
    positives: y.reduce((s, v) => s + v, 0),
    ablation: { noAge: aucWithout(1), noLogTvl: aucWithout(2), noChange7d: aucWithout(3) },
  };
}

export function oddsOf(
  beta: number[],
  asOf: string,
  p: Protocol,
): number {
  const age = ageYears(asOf, p.listed_at) ?? 0;
  const z = beta[0]! + beta[1]! * age + beta[2]! * Math.log10(p.tvl_usd) + beta[3]! * (winsorize7d(p.change_7d) / 10);
  const zc = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-zc));
}

// ---------------------------------------------------------------------------
// Board: every eligible pre-token protocol, ranked by implied value
// ---------------------------------------------------------------------------

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  scope: 'Watchlist' | 'Early';
  odds: number;
  implied_value_usd: number;
  band_lo_usd: number;
  band_hi_usd: number;
  conf_lo_usd: number;
  conf_hi_usd: number;
  gas_usd: number;
  net_expected_usd: number;
  break_even_pct: number;
  verdict: 'FARM' | 'WATCH' | 'SKIP';
  deposit_usd: number;
  deposit_chain: string;
  exit_trigger: string;
  farm_steps: string[];
}

export const GAS_PER_TX: Record<string, number> = {};
export const GAS_TXS_PER_PLAN = 4;
export const GAS_ETHEREUM_USD = 12;
export const GAS_OTHER_USD = 1.5;

export function gasPerTx(chain: string): number {
  return chain === 'Ethereum' ? GAS_ETHEREUM_USD : GAS_OTHER_USD;
}

export function depositFor(tvlUsd: number): number {
  return Math.round(Math.min(10000, Math.max(1000, 0.001 * tvlUsd)));
}

export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function fmtPct(x: number, digits = 4): string {
  return x.toFixed(digits).replace(/\.?0+$/, '');
}

export function verdictFor(netExpectedUsd: number, odds: number): 'FARM' | 'WATCH' | 'SKIP' {
  if (netExpectedUsd > 5_000_000 && odds > 0.5) return 'FARM';
  if (netExpectedUsd > 2_000_000) return 'WATCH';
  return 'SKIP';
}

export function farmStepsFor(row: {
  name: string;
  category: string | null;
  depositChain: string;
  depositUsd: number;
  gasUsd: number;
  breakEvenPct: number;
}): string[] {
  const { name, category, depositChain, depositUsd, gasUsd, breakEvenPct } = row;
  return [
    `Move ${fmtUsd(depositUsd)} in stablecoins to ${depositChain}; keep it in a wallet you control, separate from exchange accounts.`,
    `Deposit into ${name} on ${depositChain} (${category ?? 'uncategorised'}) and leave the position open — a launch rewards time in the protocol, not a single transaction.`,
    `Use the position weekly: add, remove or rebalance a small amount so the address shows repeated on-chain activity.`,
    `Follow ${name}'s announcements for a token or points program; launches reward addresses active before the announcement, not after it.`,
    `Budget about ${fmtUsd(gasUsd)} of gas for ${GAS_TXS_PER_PLAN} transactions on ${depositChain}; that is ${fmtPct(breakEvenPct)}% of the row's implied value.`,
    `Exit if ${name}'s TVL falls 30% from its level at entry, or if a token launches and the implied value is paid out; do not chase a second airdrop with the same capital.`,
  ];
}

export interface Playbook {
  category: string;
  rows: number;
  topSlug: string;
  topName: string;
  topImpliedUsd: number;
  topOdds: number;
  depositUsd: number;
  depositChain: string;
  gasUsd: number;
  netExpectedUsd: number;
  exitTrigger: string;
  steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

export interface Radar {
  meta: {
    asOf: string;
    source: string;
    floorUsd: number;
    protocols: number;
    watchlist: number;
    comps: number;
  };
  model: {
    curve: CurveFit;
    loo: Omit<LooResult, 'residuals'>;
    heldOut: { random: HoldoutResult; timeSplit: HoldoutResult };
    placebo: { r2: number };
    conformal: ConformalResult;
    walkForward: WalkForwardResult;
    multi: MultiResult;
    bootstrap: { slope: [number, number]; intercept: [number, number]; b: number };
    odds: OddsResult;
  };
  kpi: { totalImpliedUsd: number; rows: number; watchlistRows: number; earlyRows: number };
  census: Census;
  playbooks: Playbook[];
  live: LiveRow[];
  board: BoardRow[];
}

export function dataScript(radar: Radar): string {
  return `window.TOKEN_RADAR = ${JSON.stringify(radar)};\n`;
}

/** The gate's own shape checks, run before writing anything. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board has ${board.length} rows, need 100 to 4000`;
  }
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const ranks = new Set<number>();
  let prev = Number.POSITIVE_INFINITY;
  let allEqual = true;
  for (const row of board) {
    if (!slugs.has(row.slug)) return `row names ${row.slug}, not in the snapshot`;
    if (!row.name) return `row ${row.slug} has an empty name`;
    if (!Number.isInteger(row.rank) || row.rank < 1) return `row ${row.slug} has rank ${row.rank}`;
    if (ranks.has(row.rank)) return `rank ${row.rank} appears twice`;
    ranks.add(row.rank);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has implied value ${row.implied_value_usd}`;
    }
    if (row.implied_value_usd > 100_000_000_000_000) return `row ${row.slug} implied value over the cap`;
    if (row.implied_value_usd > prev) return `implied value rises at rank ${row.rank}`;
    if (row.implied_value_usd !== prev && prev !== Number.POSITIVE_INFINITY) allEqual = false;
    prev = row.implied_value_usd;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, need 3 to 12`;
    }
    for (const s of row.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${row.slug} has a farm step of ${t.length} characters`;
    }
  }
  for (let r = 1; r <= board.length; r++) {
    if (!ranks.has(r)) return `rank ${r} is missing`;
  }
  if (allEqual) return 'every implied value is the same';
  for (const slug of snapshot.watchlist) {
    if (!board.some((row) => row.slug === slug)) return `watchlist slug ${slug} is not on the board`;
  }
  return null;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const comps = compsOf(snapshot);
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const curve = huberFit(xs, ys);
  const loo = looCurve(xs, ys, comps);
  const random = randomHoldout(xs, ys, curve.flatMultiple);
  const timeSplit = timeSplitHoldout(xs, ys, comps, curve.flatMultiple);
  const placebo = placeboTest(xs, ys);
  const conformal = conformalFromLoo(loo.residuals, xs, ys, curve.flatMultiple);
  const wf = walkForward(xs, ys, comps);
  const multi = multiFactor(xs, ys, comps);
  const odds = oddsModel(snapshot);

  const watchlist = new Set(snapshot.watchlist);
  const ranked = snapshot.protocols.filter((p) => bucketOf(p) === 'ranked');
  const impliedOf = (p: Protocol): number => 10 ** (curve.a + curve.b * Math.log10(p.tvl_usd));

  // Sort first (bootstrap bands are attached in board order).
  const ordered = [...ranked].sort((x, y) => impliedOf(y) - impliedOf(x));
  const boot = bootstrap(xs, ys, ordered.map((p) => p.tvl_usd));

  const board: BoardRow[] = ordered.map((p, i) => {
    const implied = impliedOf(p);
    const oddsP = oddsOf(odds.coefficients, snapshot.as_of, p);
    const depositChain = p.chains[0] ?? 'Ethereum';
    const gasUsd = GAS_TXS_PER_PLAN * gasPerTx(depositChain);
    const netExpected = oddsP * implied - gasUsd;
    const breakEvenPct = (gasUsd / implied) * 100;
    const [bandLo, bandHi] = boot.rowBands[i]!;
    const confLo = implied * 10 ** -conformal.halfWidthDex;
    const confHi = implied * 10 ** conformal.halfWidthDex;
    const depositUsd = depositFor(p.tvl_usd);
    const exitTrigger = `Exit if ${p.name}'s TVL falls 30% from entry, or if a token launches and the implied value is paid out.`;
    const row: BoardRow = {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      scope: watchlist.has(p.slug) ? 'Watchlist' : 'Early',
      odds: oddsP,
      implied_value_usd: Math.round(implied),
      band_lo_usd: Math.round(bandLo),
      band_hi_usd: Math.round(bandHi),
      conf_lo_usd: Math.round(confLo),
      conf_hi_usd: Math.round(confHi),
      gas_usd: gasUsd,
      net_expected_usd: Math.round(netExpected),
      break_even_pct: breakEvenPct,
      verdict: verdictFor(netExpected, oddsP),
      deposit_usd: depositUsd,
      deposit_chain: depositChain,
      exit_trigger: exitTrigger,
      farm_steps: [],
    };
    row.farm_steps = farmStepsFor({
      name: p.name,
      category: p.category,
      depositChain,
      depositUsd,
      gasUsd,
      breakEvenPct,
    });
    return row;
  });

  // Category playbooks: every category with at least 5 ranked rows.
  const byCat = new Map<string, BoardRow[]>();
  for (const row of board) {
    if (!row.category) continue;
    const list = byCat.get(row.category) ?? [];
    list.push(row);
    byCat.set(row.category, list);
  }
  const playbooks: Playbook[] = [...byCat.entries()]
    .filter(([, rows]) => rows.length >= 5)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([category, rows]) => {
      const top = rows[0]!;
      return {
        category,
        rows: rows.length,
        topSlug: top.slug,
        topName: top.name,
        topImpliedUsd: top.implied_value_usd,
        topOdds: top.odds,
        depositUsd: top.deposit_usd,
        depositChain: top.deposit_chain,
        gasUsd: top.gas_usd,
        netExpectedUsd: top.net_expected_usd,
        exitTrigger: top.exit_trigger,
        steps: [
          `Start with the category's largest pre-token protocol by implied value: ${top.name} (${fmtUsd(top.implied_value_usd)}, odds ${top.odds.toFixed(2)}).`,
          `Deposit ${fmtUsd(top.deposit_usd)} on ${top.deposit_chain} and hold the position for at least 90 days; ${category} launches reward patience over activity spikes.`,
          `Spread a second, smaller deposit across the next two rows in this category to cover the case where the leader never launches.`,
          `Budget about ${fmtUsd(top.gas_usd)} of gas per protocol for the plan's ${GAS_TXS_PER_PLAN} transactions; exit any row whose TVL falls 30% from entry.`,
          `Take profit at launch: sell half the allocation in the first week, keep the rest only if the token holds above its implied value.`,
        ],
      };
    });

  const live: LiveRow[] = comps
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      multiple: p.mcap_usd! / p.tvl_usd,
    }))
    .sort((x, y) => y.mcap_usd - x.mcap_usd);

  const radar: Radar = {
    meta: {
      asOf: snapshot.as_of,
      source: snapshot.source,
      floorUsd: snapshot.floor_usd,
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      comps: comps.length,
    },
    model: {
      curve,
      loo: {
        rmse: loo.rmse,
        flatRmse: loo.flatRmse,
        ratio: loo.ratio,
        within3: loo.within3,
        within2: loo.within2,
      },
      heldOut: { random, timeSplit },
      placebo: { r2: placebo },
      conformal,
      walkForward: wf,
      multi,
      bootstrap: { slope: boot.slope, intercept: boot.intercept, b: boot.b },
      odds,
    },
    kpi: {
      totalImpliedUsd: board.reduce((s, r) => s + r.implied_value_usd, 0),
      rows: board.length,
      watchlistRows: board.filter((r) => r.scope === 'Watchlist').length,
      earlyRows: board.filter((r) => r.scope === 'Early').length,
    },
    census: censusOf(snapshot),
    playbooks,
    live,
    board,
  };
  return { board, radar };
}
