// model.ts — the token-radar value model, fitted from the snapshot alone.
//
// Everything here is computed from input/snapshot.json at run time: no
// hardcoded protocol names, no hardcoded multiples. The model has two parts:
//
//   1. A fitted log-log size curve: log10(market cap) ~ log10(TVL) over the
//      protocols whose token already trades. A pre-token protocol's curve
//      value is what its token would be worth if it priced like the traded
//      comps of its size.
//   2. A token-odds model: logistic regression for P(records a token) from
//      how long a protocol has run without one, its (log) TVL and its 7-day
//      TVL change. A pre-token protocol's implied value is
//      curve value x token odds.
//
// Validation shown on the dashboard: leave-one-out error of the curve
// against a flat-median-multiple baseline, a time-split holdout (fit on
// older listings, test on newer ones), and bootstrap bands (B = 200).
//
// All randomness is seeded (mulberry32), so two runs of main.ts write the
// same bytes.

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

export interface CurveFit {
  n: number;
  a: number; // intercept: log10(mcap) = a + b * log10(tvl)
  b: number; // slope
  r2: number;
  rmse: number;
  residSd: number;
  flatMultiple: number; // median(mcap / tvl) over the same comps
  flatRmse: number; // RMSE of the flat multiple, in log10 space
}

export interface OddsModel {
  n: number;
  nPositive: number;
  intercept: number; // raw-scale coefficients (see fitTokenOdds)
  coefAge: number; // per year without a token
  coefLogTvl: number; // per unit of log10(TVL)
  coefChange: number; // per percentage point of 7-day change
  orAge: number;
  orLogTvl: number;
  orChange: number;
  auc: number;
  medianAge: number; // years, used when listed_at is missing
  meanAge: number;
  meanLogTvl: number;
  meanChange: number;
  sdAge: number;
  sdLogTvl: number;
  sdChange: number;
}

export interface LooResult {
  rmse: number;
  flatRmse: number;
  ratio: number; // flatRmse / rmse: how many times better the curve is
}

export interface HoldoutResult {
  cutoff: string; // median listed_at among comps
  nFit: number;
  nTest: number;
  a: number;
  b: number;
  r2: number;
  rmse: number;
}

export interface BootstrapResult {
  b: number;
  aLo: number;
  aHi: number;
  bLo: number;
  bHi: number;
  pairs: { a: number; b: number }[];
}

// Deterministic PRNG (mulberry32). Same seed -> same sequence, every run.
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function log10(x: number): number {
  return Math.log(x) / Math.LN10;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length;
  if (m === 0) return NaN;
  return m % 2 === 1 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sd(xs: number[], mu: number): number {
  const v = xs.reduce((a, b) => a + (b - mu) * (b - mu), 0) / xs.length;
  return Math.sqrt(v) || 1;
}

// Ordinary least squares for y ~ a + b*x. Returns null on degenerate input.
function ols(xs: number[], ys: number[]): { a: number; b: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

function rSquared(xs: number[], ys: number[], a: number, b: number): number {
  const my = mean(ys);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < xs.length; i++) {
    const pred = a + b * xs[i];
    ssTot += (ys[i] - my) * (ys[i] - my);
    ssRes += (ys[i] - pred) * (ys[i] - pred);
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

function rmseOf(xs: number[], ys: number[], a: number, b: number): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = ys[i] - (a + b * xs[i]);
    s += d * d;
  }
  return Math.sqrt(s / xs.length);
}

// The traded comps: protocols whose token already has a market cap.
export function tradedComps(protocols: Protocol[]): Protocol[] {
  return protocols.filter((p) => p.mcap_usd != null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

// Fit the log-log size curve on the traded comps.
export function fitSizeCurve(comps: Protocol[]): CurveFit {
  const xs = comps.map((p) => log10(p.tvl_usd));
  const ys = comps.map((p) => log10(p.mcap_usd as number));
  const fit = ols(xs, ys);
  if (fit === null) throw new Error("size curve: degenerate comps");
  const multiples = comps.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  const flatMultiple = median(multiples);
  const flatLog = Math.log(flatMultiple) / Math.LN10;
  // Flat baseline in log space: log10(mcap) = log10(multiple) + log10(tvl).
  let flatSs = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = ys[i] - (flatLog + xs[i]);
    flatSs += d * d;
  }
  const flatRmse = Math.sqrt(flatSs / xs.length);
  const rmse = rmseOf(xs, ys, fit.a, fit.b);
  const r2 = rSquared(xs, ys, fit.a, fit.b);
  let residSs = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = ys[i] - (fit.a + fit.b * xs[i]);
    residSs += d * d;
  }
  const residSd = Math.sqrt(residSs / Math.max(1, xs.length - 2));
  return {
    n: comps.length,
    a: fit.a,
    b: fit.b,
    r2,
    rmse,
    residSd,
    flatMultiple,
    flatRmse,
  };
}

// Leave-one-out error of the curve vs the flat multiple.
export function looCurve(comps: Protocol[]): LooResult {
  const xs = comps.map((p) => log10(p.tvl_usd));
  const ys = comps.map((p) => log10(p.mcap_usd as number));
  const multiples = comps.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  const flatMultiple = median(multiples);
  const flatLog = Math.log(flatMultiple) / Math.LN10;
  let ssCurve = 0;
  let ssFlat = 0;
  for (let i = 0; i < comps.length; i++) {
    const xsLoo = xs.filter((_, j) => j !== i);
    const ysLoo = ys.filter((_, j) => j !== i);
    const fit = ols(xsLoo, ysLoo);
    if (fit === null) continue;
    const dCurve = ys[i] - (fit.a + fit.b * xs[i]);
    const dFlat = ys[i] - (flatLog + xs[i]);
    ssCurve += dCurve * dCurve;
    ssFlat += dFlat * dFlat;
  }
  const rmse = Math.sqrt(ssCurve / comps.length);
  const flatRmse = Math.sqrt(ssFlat / comps.length);
  return { rmse, flatRmse, ratio: flatRmse / rmse };
}

// Time-split holdout: fit on the older-listed half of comps, test on the newer.
export function timeSplitHoldout(comps: Protocol[]): HoldoutResult {
  const dated = comps.filter((p) => p.listed_at != null);
  const dates = dated.map((p) => p.listed_at as string).sort();
  const cutoff = dates[Math.floor(dates.length / 2)];
  const fitSet = dated.filter((p) => (p.listed_at as string) <= cutoff);
  const testSet = dated.filter((p) => (p.listed_at as string) > cutoff);
  const xsFit = fitSet.map((p) => log10(p.tvl_usd));
  const ysFit = fitSet.map((p) => log10(p.mcap_usd as number));
  const fit = ols(xsFit, ysFit);
  if (fit === null) throw new Error("time split: degenerate fit set");
  const xsTest = testSet.map((p) => log10(p.tvl_usd));
  const ysTest = testSet.map((p) => log10(p.mcap_usd as number));
  return {
    cutoff,
    nFit: fitSet.length,
    nTest: testSet.length,
    a: fit.a,
    b: fit.b,
    r2: rSquared(xsTest, ysTest, fit.a, fit.b),
    rmse: rmseOf(xsTest, ysTest, fit.a, fit.b),
  };
}

// Bootstrap the curve: resample comps with replacement, refit, take the
// 90% interval (p5-p95) of each coefficient.
export function bootstrapCurve(comps: Protocol[], seed: number, b: number): BootstrapResult {
  const rng = mulberry32(seed);
  const xs = comps.map((p) => log10(p.tvl_usd));
  const ys = comps.map((p) => log10(p.mcap_usd as number));
  const n = comps.length;
  const pairs: { a: number; b: number }[] = [];
  for (let k = 0; k < b; k++) {
    const rx: number[] = [];
    const ry: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng() * n);
      rx.push(xs[j]);
      ry.push(ys[j]);
    }
    const fit = ols(rx, ry);
    if (fit !== null) pairs.push({ a: fit.a, b: fit.b });
  }
  const as = pairs.map((p) => p.a).sort((x, y) => x - y);
  const bs = pairs.map((p) => p.b).sort((x, y) => x - y);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  return {
    b: pairs.length,
    aLo: q(as, 0.05),
    aHi: q(as, 0.95),
    bLo: q(bs, 0.05),
    bHi: q(bs, 0.95),
    pairs,
  };
}

// ---- Token odds: logistic regression for P(records a token) -------------
//
// Features: how long the protocol has run without a token (years since
// listed_at), log10(TVL), and the 7-day TVL change in percent. Training
// label: 1 when the protocol records a token (gecko_id or symbol set),
// 0 otherwise. Features are standardised for the gradient descent, then
// the coefficients are converted back to the raw scale so the dashboard
// can quote them per year / per log unit / per percentage point.

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

function ageYears(listedAt: string | null, asOf: string, fallback: number): number {
  if (listedAt == null) return fallback;
  const ms = Date.parse(asOf + "T00:00:00Z") - Date.parse(listedAt + "T00:00:00Z");
  return Math.max(0, ms / (365.25 * 86400 * 1000));
}

function recordsToken(p: Protocol): boolean {
  return p.gecko_id != null || p.symbol != null;
}

export function fitTokenOdds(protocols: Protocol[], asOf: string): OddsModel {
  const agesKnown = protocols
    .filter((p) => p.listed_at != null)
    .map((p) => ageYears(p.listed_at, asOf, 0));
  const medianAge = median(agesKnown);
  const feats = protocols.map((p) => {
    const age = ageYears(p.listed_at, asOf, medianAge);
    const logTvl = Math.log(p.tvl_usd) / Math.LN10;
    const chg =
      p.change_7d == null ? 0 : Math.max(-100, Math.min(500, p.change_7d));
    return { age, logTvl, chg, y: recordsToken(p) ? 1 : 0 };
  });
  const meanAge = mean(feats.map((f) => f.age));
  const meanLogTvl = mean(feats.map((f) => f.logTvl));
  const meanChange = mean(feats.map((f) => f.chg));
  const sdAge = sd(feats.map((f) => f.age), meanAge);
  const sdLogTvl = sd(feats.map((f) => f.logTvl), meanLogTvl);
  const sdChange = sd(feats.map((f) => f.chg), meanChange);
  const z = feats.map((f) => [
    (f.age - meanAge) / sdAge,
    (f.logTvl - meanLogTvl) / sdLogTvl,
    (f.chg - meanChange) / sdChange,
  ]);
  // Plain gradient descent on the standardised features. Deterministic:
  // zero start, fixed step, fixed iteration count.
  let w0 = 0;
  let w1 = 0;
  let w2 = 0;
  let w3 = 0;
  const lr = 0.1;
  const iters = 3000;
  const n = feats.length;
  for (let it = 0; it < iters; it++) {
    let g0 = 0;
    let g1 = 0;
    let g2 = 0;
    let g3 = 0;
    for (let i = 0; i < n; i++) {
      const lin = w0 + w1 * z[i][0] + w2 * z[i][1] + w3 * z[i][2];
      const d = sigmoid(lin) - feats[i].y;
      g0 += d;
      g1 += d * z[i][0];
      g2 += d * z[i][1];
      g3 += d * z[i][2];
    }
    w0 -= (lr * g0) / n;
    w1 -= (lr * g1) / n;
    w2 -= (lr * g2) / n;
    w3 -= (lr * g3) / n;
  }
  // Convert back to the raw scale: logit = c0 + cAge*age + cLog*logTvl + cChg*chg.
  const coefAge = w1 / sdAge;
  const coefLogTvl = w2 / sdLogTvl;
  const coefChange = w3 / sdChange;
  const intercept =
    w0 - (w1 * meanAge) / sdAge - (w2 * meanLogTvl) / sdLogTvl - (w3 * meanChange) / sdChange;
  // AUC by the Mann-Whitney rank sum on the fitted probabilities.
  const scored = feats.map((f) => {
    const lin =
      intercept + coefAge * f.age + coefLogTvl * f.logTvl + coefChange * f.chg;
    return { p: sigmoid(lin), y: f.y };
  });
  const pos = scored.filter((s) => s.y === 1);
  const neg = scored.filter((s) => s.y === 0);
  let wins = 0;
  let ties = 0;
  for (const a of pos) {
    for (const b of neg) {
      if (a.p > b.p) wins++;
      else if (a.p === b.p) ties++;
    }
  }
  const auc = (wins + 0.5 * ties) / (pos.length * neg.length);
  return {
    n,
    nPositive: pos.length,
    intercept,
    coefAge,
    coefLogTvl,
    coefChange,
    orAge: Math.exp(coefAge),
    orLogTvl: Math.exp(coefLogTvl),
    orChange: Math.exp(coefChange),
    auc,
    medianAge,
    meanAge,
    meanLogTvl,
    meanChange,
    sdAge,
    sdLogTvl,
    sdChange,
  };
}

export function tokenOdds(p: Protocol, model: OddsModel, asOf: string): number {
  const age = ageYears(p.listed_at, asOf, model.medianAge);
  const logTvl = Math.log(p.tvl_usd) / Math.LN10;
  const chg = p.change_7d == null ? 0 : Math.max(-100, Math.min(500, p.change_7d));
  const lin =
    model.intercept + model.coefAge * age + model.coefLogTvl * logTvl + model.coefChange * chg;
  return sigmoid(lin);
}

export function curveValue(tvlUsd: number, fit: CurveFit): number {
  return Math.pow(10, fit.a + fit.b * (Math.log(tvlUsd) / Math.LN10));
}

export function impliedValue(
  p: Protocol,
  fit: CurveFit,
  model: OddsModel,
  asOf: string,
): { curve: number; odds: number; implied: number } {
  const curve = curveValue(p.tvl_usd, fit);
  const odds = tokenOdds(p, model, asOf);
  return { curve, odds, implied: curve * odds };
}

// ---- Board selection -----------------------------------------------------
//
// A protocol is board-eligible when it records no token and is not a
// wrapped, staked or bridged product of a token that already trades, by
// every check the snapshot itself can answer. (The house also checks
// parentProtocol, a field the snapshot does not carry; the Methodology tab
// says so.) The board is the whole watchlist plus the largest eligible
// protocols below it, 198 rows in all.

export const FORBIDDEN_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);
export const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];
export const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
export const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id == null && p.symbol == null;
}

export function boardEligible(p: Protocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category != null && FORBIDDEN_CATEGORIES.has(p.category)) return false;
  if (VERSION_TAIL.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_years: number;
  rank: number;
  implied_value_usd: number;
  curve_value_usd: number;
  odds: number;
  band_lo_usd: number;
  band_hi_usd: number;
  scope: "watchlist" | "early";
  farm_steps: string[];
  nearest: { slug: string; name: string; tvl_usd: number; mcap_usd: number; multiple: number }[];
}

export interface Census {
  total: number;
  traded: number;
  ranked: number;
  tokenNoMcap: number;
  forbiddenCategory: number;
  versionedName: number;
  wrappedWord: number;
  exchangePrefix: number;
  eligibleNotSelected: number;
  examples: Record<string, string[]>;
}

// Gas assumptions, per transaction, by the protocol's main chain. These are
// assumptions (labelled as such on the dashboard), not measured fees:
// a flat 16-transaction plan priced at the chain's typical simple-transfer
// cost in November 2026.
export const GAS_PER_TX: Record<string, number> = {
  Ethereum: 6.0,
  Solana: 0.05,
  Base: 0.1,
  Arbitrum: 0.3,
  Optimism: 0.2,
  Polygon: 0.05,
  "BNB Chain": 0.2,
  Binance: 0.2,
  Avalanche: 0.3,
  Sui: 0.05,
  Aptos: 0.05,
  Sonic: 0.05,
  Sei: 0.05,
  "zkSync Era": 0.2,
};
export const FARM_TX_COUNT = 16;
export const HOLD_DAYS = 90;

export function capitalTier(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 5000;
  if (tvlUsd >= 100_000_000) return 1000;
  if (tvlUsd >= 10_000_000) return 500;
  return 250;
}

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

const CATEGORY_ACTION: Record<string, string> = {
  Dexs: "swap through its pools",
  Lending: "lend assets and open a small borrow",
  Yield: "deposit into its vaults",
  Bridge: "bridge assets through it",
  "Liquid Staking": "stake through it",
  Derivatives: "open a small hedged position",
  "CDP": "open a collateralised position",
  "Algo-Stables": "mint and hold its stable asset",
  Farm: "stake in its farms",
  Staking: "stake through it",
  "Restaking": "restake through it",
  "Prediction Market": "place small prediction positions",
  "Options": "open a small options position",
  "Perpetuals": "open a small perpetual position",
};

export function farmPlan(row: BoardRow): string[] {
  const chain = row.chains.length > 0 ? row.chains[0] : "Ethereum";
  const gasPerTx = GAS_PER_TX[chain] ?? 1.0;
  const gasTotal = FARM_TX_COUNT * gasPerTx;
  const capital = capitalTier(row.tvl_usd);
  const action = CATEGORY_ACTION[row.category ?? ""] ?? "use its core product";
  const net = Math.max(0, row.implied_value_usd - gasTotal);
  const steps = [
    `Move ${usd(capital)} to ${chain}, the protocol's main chain, as working capital and keep it ready for ${HOLD_DAYS} days of activity.`,
    `${capFirst(action)} with ${usd(Math.round(capital * 0.4))} on ${chain} in 3 to 5 transactions during the first week.`,
    `Repeat the core action once a week for 12 weeks so the usage history is steady, not a single burst on one day.`,
    `Keep a record of every transaction hash and check the dashboard's eligibility checklist once a month.`,
    `Budget ${usd(gasTotal)} of gas for the whole plan (${FARM_TX_COUNT} transactions at about ${usd(gasPerTx)} each on ${chain}, an assumption, not a measured fee).`,
    `Expected net: ${usd(row.implied_value_usd)} implied value minus ${usd(gasTotal)} gas is ${usd(net)}; if a token launches, claim within 7 days and exit half the position.`,
  ];
  return steps;
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Three traded comps nearest in size (log TVL distance) to the row.
export function nearestComps(
  row: BoardRow,
  comps: Protocol[],
): BoardRow["nearest"] {
  const lt = Math.log(row.tvl_usd) / Math.LN10;
  return comps
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      tvl_usd: c.tvl_usd,
      mcap_usd: c.mcap_usd as number,
      multiple: (c.mcap_usd as number) / c.tvl_usd,
      d: Math.abs(Math.log(c.tvl_usd) / Math.LN10 - lt),
    }))
    .sort((a, b) => a.d - b.d || (a.slug < b.slug ? -1 : 1))
    .slice(0, 3)
    .map(({ slug, name, tvl_usd, mcap_usd, multiple }) => ({
      slug,
      name,
      tvl_usd,
      mcap_usd,
      multiple,
    }));
}

// Bootstrap band for one row's implied value: refit the curve on each
// resample, price the row with each refit, take the 90% interval.
export function rowBand(
  pairs: { a: number; b: number }[],
  tvlUsd: number,
  odds: number,
): { lo: number; hi: number } {
  const lt = Math.log(tvlUsd) / Math.LN10;
  const vals = pairs
    .map(({ a, b }) => Math.pow(10, a + b * lt) * odds)
    .sort((x, y) => x - y);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  return { lo: q(0.05), hi: q(0.95) };
}

export interface BoardBuild {
  rows: BoardRow[];
  census: Census;
  watchlistCovered: number;
  watchlistTotal: number;
}

export function buildBoard(
  snap: Snapshot,
  fit: CurveFit,
  oddsModel: OddsModel,
  pairs: { a: number; b: number }[],
): BoardBuild {
  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
  const comps = tradedComps(snap.protocols);
  const picked: Protocol[] = [];
  const pickedSlugs = new Set<string>();
  for (const slug of snap.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined && !pickedSlugs.has(slug)) {
      picked.push(p);
      pickedSlugs.add(slug);
    }
  }
  const early = snap.protocols
    .filter((p) => !pickedSlugs.has(p.slug) && boardEligible(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const TARGET_ROWS = 198;
  for (const p of early) {
    if (picked.length >= TARGET_ROWS) break;
    picked.push(p);
    pickedSlugs.add(p.slug);
  }
  const rows: BoardRow[] = picked.map((p) => {
    const { curve, odds, implied } = impliedValue(p, fit, oddsModel, snap.as_of);
    const band = rowBand(pairs, p.tvl_usd, odds);
    const row: BoardRow = {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_years: ageYears(p.listed_at, snap.as_of, oddsModel.medianAge),
      rank: 0,
      implied_value_usd: Math.max(1, Math.round(implied)),
      curve_value_usd: Math.max(1, Math.round(curve)),
      odds,
      band_lo_usd: Math.max(1, Math.round(band.lo)),
      band_hi_usd: Math.max(1, Math.round(band.hi)),
      scope: snap.watchlist.includes(p.slug) ? "watchlist" : "early",
      farm_steps: [],
      nearest: nearestComps(
        {
          slug: p.slug,
          name: p.name,
          category: p.category,
          chains: p.chains,
          tvl_usd: p.tvl_usd,
          change_7d: p.change_7d,
          listed_at: p.listed_at,
          age_years: 0,
          rank: 0,
          implied_value_usd: 0,
          curve_value_usd: 0,
          odds: 0,
          band_lo_usd: 0,
          band_hi_usd: 0,
          scope: "watchlist",
          farm_steps: [],
          nearest: [],
        },
        comps,
      ),
    };
    row.farm_steps = farmPlan(row);
    return row;
  });
  rows.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : 1),
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  // Census: every protocol accounted for, first matching reason wins.
  const examples: Record<string, string[]> = {
    tokenNoMcap: [],
    forbiddenCategory: [],
    versionedName: [],
    wrappedWord: [],
    exchangePrefix: [],
    eligibleNotSelected: [],
  };
  const c: Census = {
    total: snap.protocols.length,
    traded: 0,
    ranked: rows.length,
    tokenNoMcap: 0,
    forbiddenCategory: 0,
    versionedName: 0,
    wrappedWord: 0,
    exchangePrefix: 0,
    eligibleNotSelected: 0,
    examples,
  };
  for (const p of snap.protocols) {
    if (p.mcap_usd != null && p.mcap_usd > 0) {
      c.traded++;
      continue;
    }
    if (pickedSlugs.has(p.slug)) continue; // ranked
    if (!recordsNoToken(p)) {
      c.tokenNoMcap++;
      if (examples.tokenNoMcap.length < 10) examples.tokenNoMcap.push(p.slug);
      continue;
    }
    if (p.category != null && FORBIDDEN_CATEGORIES.has(p.category)) {
      c.forbiddenCategory++;
      if (examples.forbiddenCategory.length < 10) examples.forbiddenCategory.push(p.slug);
      continue;
    }
    if (VERSION_TAIL.test(p.name)) {
      c.versionedName++;
      if (examples.versionedName.length < 10) examples.versionedName.push(p.slug);
      continue;
    }
    if (WRAPPED_WORD.test(p.name)) {
      c.wrappedWord++;
      if (examples.wrappedWord.length < 10) examples.wrappedWord.push(p.slug);
      continue;
    }
    if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) {
      c.exchangePrefix++;
      if (examples.exchangePrefix.length < 10) examples.exchangePrefix.push(p.slug);
      continue;
    }
    c.eligibleNotSelected++;
    if (examples.eligibleNotSelected.length < 10) examples.eligibleNotSelected.push(p.slug);
  }
  return {
    rows,
    census: c,
    watchlistCovered: snap.watchlist.filter((s) => pickedSlugs.has(s)).length,
    watchlistTotal: snap.watchlist.length,
  };
}
