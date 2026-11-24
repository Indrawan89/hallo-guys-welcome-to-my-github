// Token-radar rebuild: fitted log-log size curve x token-odds model.
//
// Everything here is fitted from the sealed snapshot (758 protocols,
// as_of 2026-11-14). No hardcoded protocol names, no invented numbers:
// the fit, the validation and the census are all computed below from
// the snapshot bytes and reported with their own statistics.

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

export interface SizeCurveFit {
  n: number;
  a: number;
  b: number;
  r2: number;
  rmse: number;
  residualSd: number;
  flatMedianMultiple: number;
}

export interface LooResult {
  rmse: number;
  flatRmse: number;
  oosMultiple: number;
}

export interface TimeSplitResult {
  medianListedAt: string;
  trainN: number;
  testN: number;
  trainA: number;
  trainB: number;
  holdoutR2: number;
  holdoutRmse: number;
}

export interface TokenOddsFit {
  // Standardised logistic coefficients, in feature order
  // [age_days, log10(tvl_usd), change_7d clamped to [-50, 50]].
  weights: number[];
  intercept: number;
  oddsRatios: number[];
  featureMeans: number[];
  featureSds: number[];
  auc: number;
  iterations: number;
  learningRate: number;
}

export interface Comparable {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  scope: "watchlist" | "early";
  rank: number;
  curve_value_usd: number;
  token_odds: number;
  implied_value_usd: number;
  bootstrap_lo_usd: number;
  bootstrap_hi_usd: number;
  comparables: Comparable[];
  farm_steps: string[];
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_tx_count: number;
  farm_hold_days: number;
  farm_net_usd: number;
}

export interface Census {
  total: number;
  traded: number;
  ranked: number;
  excluded: number;
  excludedByReason: Record<string, number>;
  exchangePrefixNamesTotal: number;
  rankedAtOrAboveFloor: number;
  watchlist: number;
  early: number;
}

export interface CategoryMultiple {
  category: string;
  n: number;
  medianMultiple: number;
}

export interface BoardBuild {
  asOf: string;
  floorUsd: number;
  fit: SizeCurveFit;
  loo: LooResult;
  timeSplit: TimeSplitResult;
  odds: TokenOddsFit;
  census: Census;
  categories: CategoryMultiple[];
  rows: BoardRow[];
  traded: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number | null; multiple: number | null }[];
  totalImpliedUsd: number;
}

// ---------------------------------------------------------------------------
// Exclusion rules, re-derived from the snapshot fields (see input README).
// Priority order is fixed so every excluded protocol has exactly one reason.
// ---------------------------------------------------------------------------

const BANNED_CATEGORIES = new Set([
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

const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_RE = /\b(wrapped|staked|staking)\b/i;

export function exclusionReason(p: Protocol): string | null {
  if (p.category !== null && BANNED_CATEGORIES.has(p.category)) return "banned_category";
  if (VERSION_RE.test(p.name)) return "versioned_name";
  if (WRAPPED_RE.test(p.name)) return "wrapped_staked";
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return "exchange_prefix";
  }
  return null;
}

export function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null;
}

export function isStrictPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

// ---------------------------------------------------------------------------
// Size curve: OLS on log10(mcap) = a + b * log10(tvl) over traded comps.
// ---------------------------------------------------------------------------

function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

function fitSizeCurve(comps: Protocol[]): SizeCurveFit {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd as number));
  const n = xs.length;
  const { a, b } = ols(xs, ys);
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (a + b * xs[i]);
    ssRes += r * r;
    ssTot += (ys[i] - my) * (ys[i] - my);
  }
  const ratios = comps
    .map((p) => (p.mcap_usd as number) / p.tvl_usd)
    .sort((u, v) => u - v);
  const flatMedianMultiple =
    n % 2 === 1
      ? ratios[(n - 1) / 2]
      : (ratios[n / 2 - 1] + ratios[n / 2]) / 2;
  return {
    n,
    a,
    b,
    r2: 1 - ssRes / ssTot,
    rmse: Math.sqrt(ssRes / n),
    residualSd: Math.sqrt(ssRes / (n - 2)),
    flatMedianMultiple,
  };
}

function looValidation(comps: Protocol[], flatMedian: number): LooResult {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd as number));
  const n = xs.length;
  let looSe = 0;
  let flatSe = 0;
  for (let i = 0; i < n; i++) {
    const xs2: number[] = [];
    const ys2: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j !== i) {
        xs2.push(xs[j]);
        ys2.push(ys[j]);
      }
    }
    const { a, b } = ols(xs2, ys2);
    const e = ys[i] - (a + b * xs[i]);
    looSe += e * e;
    const fe = ys[i] - Math.log10(flatMedian * Math.pow(10, xs[i]));
    flatSe += fe * fe;
  }
  const rmse = Math.sqrt(looSe / n);
  const flatRmse = Math.sqrt(flatSe / n);
  return { rmse, flatRmse, oosMultiple: flatRmse / rmse };
}

function timeSplitValidation(comps: Protocol[]): TimeSplitResult {
  const dated = comps
    .filter((p) => p.listed_at !== null)
    .slice()
    .sort((u, v) => (u.listed_at as string) < (v.listed_at as string) ? -1 : 1);
  const medianListedAt = dated[Math.floor(dated.length / 2)].listed_at as string;
  const train = dated.filter((p) => (p.listed_at as string) <= medianListedAt);
  const test = dated.filter((p) => (p.listed_at as string) > medianListedAt);
  const { a, b } = ols(
    train.map((p) => Math.log10(p.tvl_usd)),
    train.map((p) => Math.log10(p.mcap_usd as number)),
  );
  const ys = test.map((p) => Math.log10(p.mcap_usd as number));
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let se = 0;
  let st = 0;
  for (let i = 0; i < test.length; i++) {
    const pred = a + b * Math.log10(test[i].tvl_usd);
    se += (ys[i] - pred) * (ys[i] - pred);
    st += (ys[i] - my) * (ys[i] - my);
  }
  return {
    medianListedAt,
    trainN: train.length,
    testN: test.length,
    trainA: a,
    trainB: b,
    holdoutR2: 1 - se / st,
    holdoutRmse: Math.sqrt(se / test.length),
  };
}

// ---------------------------------------------------------------------------
// Token-odds model: logistic regression on all 758 protocols.
// Features: [age_days since listed_at, log10(tvl_usd), change_7d clamped].
// Label y = 1 when the snapshot records a token, else 0.
// Deterministic full-batch gradient descent, fixed iterations, no random.
// ---------------------------------------------------------------------------

const AS_OF = "2026-11-14";
const AS_OF_MS = Date.parse(AS_OF + "T00:00:00Z");

function ageDays(p: Protocol, medianAge: number): number {
  if (p.listed_at === null) return medianAge;
  return Math.round((AS_OF_MS - Date.parse(p.listed_at + "T00:00:00Z")) / 86400000);
}

function clampChange(p: Protocol): number {
  if (p.change_7d === null) return 0;
  if (p.change_7d > 50) return 50;
  if (p.change_7d < -50) return -50;
  return p.change_7d;
}

function oddsFeatures(p: Protocol, medianAge: number): number[] {
  return [ageDays(p, medianAge), Math.log10(p.tvl_usd), clampChange(p)];
}

function sigmoid(z: number): number {
  if (z < -30) return 0;
  if (z > 30) return 1;
  return 1 / (1 + Math.exp(-z));
}

function fitTokenOdds(all: Protocol[]): TokenOddsFit {
  const ages = all
    .filter((p) => p.listed_at !== null)
    .map((p) => ageDays(p, 0))
    .sort((u, v) => u - v);
  const medianAge = ages[Math.floor(ages.length / 2)];
  const raw = all.map((p) => oddsFeatures(p, medianAge));
  const labels = all.map((p) => (recordsToken(p) ? 1 : 0));
  const n = all.length;
  const means = [0, 1, 2].map(
    (j) => raw.reduce((s, r) => s + r[j], 0) / n,
  );
  const sds = [0, 1, 2].map((j) =>
    Math.sqrt(raw.reduce((s, r) => s + (r[j] - means[j]) * (r[j] - means[j]), 0) / n),
  );
  const z = raw.map((r) => [0, 1, 2].map((j) => (r[j] - means[j]) / sds[j]));
  const weights = [0, 0, 0];
  let intercept = 0;
  const learningRate = 0.5;
  const iterations = 2000;
  for (let iter = 0; iter < iterations; iter++) {
    const gw = [0, 0, 0];
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const lin =
        intercept + weights[0] * z[i][0] + weights[1] * z[i][1] + weights[2] * z[i][2];
      const err = sigmoid(lin) - labels[i];
      gw[0] += err * z[i][0];
      gw[1] += err * z[i][1];
      gw[2] += err * z[i][2];
      gb += err;
    }
    for (let j = 0; j < 3; j++) weights[j] -= (learningRate * gw[j]) / n;
    intercept -= (learningRate * gb) / n;
  }
  const oddsRatios = weights.map((w) => Math.exp(w));
  // AUC (pairwise, ties count 1/2).
  const score = (i: number): number =>
    sigmoid(
      intercept +
        weights[0] * z[i][0] +
        weights[1] * z[i][1] +
        weights[2] * z[i][2],
    );
  let wins = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    if (labels[i] !== 1) continue;
    for (let j = 0; j < n; j++) {
      if (labels[j] !== 0) continue;
      pairs++;
      const si = score(i);
      const sj = score(j);
      if (si > sj) wins += 1;
      else if (si === sj) wins += 0.5;
    }
  }
  return {
    weights,
    intercept,
    oddsRatios,
    featureMeans: means,
    featureSds: sds,
    auc: wins / pairs,
    iterations,
    learningRate,
  };
}

function tokenOdds(
  p: Protocol,
  fit: TokenOddsFit,
  medianAge: number,
): number {
  const f = oddsFeatures(p, medianAge);
  let lin = fit.intercept;
  for (let j = 0; j < 3; j++) {
    lin += fit.weights[j] * ((f[j] - fit.featureMeans[j]) / fit.featureSds[j]);
  }
  return sigmoid(lin);
}

// ---------------------------------------------------------------------------
// Bootstrap band: B resamples of the traded comps, deterministic mulberry32.
// Only the size curve is refit; token odds are held fixed.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapBands(
  comps: Protocol[],
  rows: { slug: string; tvl: number; odds: number }[],
  seed: number,
  draws: number,
): Map<string, [number, number]> {
  const rng = mulberry32(seed);
  const n = comps.length;
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd as number));
  const samples = new Map<string, number[]>();
  for (const r of rows) samples.set(r.slug, []);
  for (let k = 0; k < draws; k++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(Math.floor(rng() * n));
    const { a, b } = ols(
      idx.map((i) => xs[i]),
      idx.map((i) => ys[i]),
    );
    for (const r of rows) {
      const v = Math.pow(10, a + b * Math.log10(r.tvl)) * r.odds;
      samples.get(r.slug)!.push(v);
    }
  }
  const out = new Map<string, [number, number]>();
  for (const [slug, vals] of samples) {
    vals.sort((u, v) => u - v);
    const lo = vals[Math.floor(0.05 * draws)];
    const hi = vals[Math.floor(0.95 * draws) - 1];
    out.set(slug, [Math.round(lo), Math.round(hi)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Farm plans: 6 concrete steps, costed in dollars, netted to the dollar.
// Gas prices are ASSUMPTIONS (labelled as such), not snapshot data.
// ---------------------------------------------------------------------------

const GAS_PER_TX: Record<string, number> = {
  Ethereum: 8,
  Solana: 0.05,
  Sui: 0.05,
  Aptos: 0.05,
  NEAR: 0.05,
  Base: 0.5,
  Arbitrum: 0.5,
  Optimism: 0.5,
  Polygon: 0.5,
  "zkSync Era": 0.5,
  Blast: 0.5,
  Linea: 0.5,
  Scroll: 0.5,
  Mode: 0.5,
  Mantle: 0.5,
  Gnosis: 0.5,
  Celo: 0.5,
  Tron: 0.5,
  BSC: 0.3,
  "BNB Chain": 0.3,
  Avalanche: 0.4,
  Fantom: 0.3,
};

export function gasPerTx(chain: string): number {
  return GAS_PER_TX[chain] ?? 1;
}

export const FARM_HOLD_DAYS = 90;
const FARM_TX_PER_STEP = [2, 1, 12, 0, 0, 1];

const PRODUCT_BY_CATEGORY: Record<string, string> = {
  Lending: "lending market",
  Dexs: "liquidity pool",
  Yield: "yield vault",
  "Yield Aggregator": "vault",
  Derivatives: "perpetuals market",
  CDP: "vault",
  Restaking: "restaking pool",
  "Liquid Staking": "staking pool",
  "Cross Chain": "bridge pool",
  RWA: "vault",
};

function productFor(category: string | null): string {
  if (category !== null && PRODUCT_BY_CATEGORY[category]) {
    return PRODUCT_BY_CATEGORY[category];
  }
  return "core product";
}

export function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 5000;
  if (tvl >= 500_000_000) return 2500;
  if (tvl >= 200_000_000) return 1000;
  if (tvl >= 100_000_000) return 500;
  return 250;
}

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export interface FarmPlan {
  steps: string[];
  capitalUsd: number;
  gasUsd: number;
  txCount: number;
  holdDays: number;
  netUsd: number;
}

export function farmPlan(
  p: Protocol,
  impliedValueUsd: number,
): FarmPlan {
  const chain = p.chains.length > 0 ? p.chains[0] : "Ethereum";
  const gas = gasPerTx(chain);
  const capital = capitalFor(p.tvl_usd);
  const txCount = FARM_TX_PER_STEP.reduce((s, v) => s + v, 0);
  const gasUsd = Math.round(txCount * gas * 100) / 100;
  const netUsd = Math.round(impliedValueUsd - gasUsd);
  const product = productFor(p.category);
  const weeklyTx = FARM_TX_PER_STEP[2];
  const steps = [
    `Fund a fresh wallet on ${chain} with ${money(capital)} in stablecoins plus about ${money(gasUsd)} for fees; bridging in takes roughly 15 minutes and the first transaction costs about ${money(gas)} in gas (assumed price, not snapshot data).`,
    `Deposit the full ${money(capital)} into ${p.name}'s ${product} on ${chain}; the deposit is one transaction costing about ${money(gas)} in gas (assumed) and confirms in about 2 minutes.`,
    `Keep the deposit in place for ${FARM_HOLD_DAYS} days and make one small transaction a week, about ${weeklyTx} transactions at roughly ${money(gas)} each, so activity is spread out instead of a single burst.`,
    `Once a week open ${p.name}'s app, check the position and any points or eligibility screen, and save the transaction hashes plus a screenshot of the dashboard for your own records.`,
    `If ${p.name} announces a token, snapshot, or points conversion, follow only the announcement on its official channels; ignore links sent by replies or direct messages and never move funds to a new address.`,
    `After the announced snapshot date withdraw the ${money(capital)} principal plus any yield; total gas across this plan is about ${money(gasUsd)} over ${txCount} transactions, giving a model net value of about ${money(netUsd)} (protocol-scale expected value minus gas).`,
  ];
  return { steps, capitalUsd: capital, gasUsd, txCount, holdDays: FARM_HOLD_DAYS, netUsd };
}

// ---------------------------------------------------------------------------
// Full build.
// ---------------------------------------------------------------------------

function medianOf(values: number[]): number {
  const v = values.slice().sort((a, b) => a - b);
  const n = v.length;
  return n % 2 === 1 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}

export function buildBoard(snapshot: Snapshot): BoardBuild {
  const all = snapshot.protocols;
  const watchlist = new Set(snapshot.watchlist);

  // Traded comps for the size curve: market cap and TVL both positive.
  const comps = all.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const fit = fitSizeCurve(comps);
  const loo = looValidation(comps, fit.flatMedianMultiple);
  const timeSplit = timeSplitValidation(comps);
  const oddsFit = fitTokenOdds(all);

  const ages = all
    .filter((p) => p.listed_at !== null)
    .map((p) => ageDays(p, 0))
    .sort((a, b) => a - b);
  const medianAge = ages[Math.floor(ages.length / 2)];

  // Rankable: strict pre-token + exclusion rules. No TVL floor here:
  // the watchlist floor is a floor, never a ceiling.
  const ranked: Protocol[] = [];
  const excludedByReason: Record<string, number> = {};
  let tradedCount = 0;
  for (const p of all) {
    if (recordsToken(p)) {
      tradedCount++;
      continue;
    }
    const reason = exclusionReason(p);
    if (reason !== null) {
      excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
    } else {
      ranked.push(p);
    }
  }

  // Nearest traded comparables by |log10 TVL| distance.
  const comparablesFor = (p: Protocol): Comparable[] => {
    const lt = Math.log10(p.tvl_usd);
    return comps
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        tvl_usd: c.tvl_usd,
        mcap_usd: c.mcap_usd as number,
        multiple: (c.mcap_usd as number) / c.tvl_usd,
        dist: Math.abs(Math.log10(c.tvl_usd) - lt),
      }))
      .sort((u, v) => (u.dist === v.dist ? (u.slug < v.slug ? -1 : 1) : u.dist - v.dist))
      .slice(0, 3)
      .map(({ slug, name, tvl_usd, mcap_usd, multiple }) => ({
        slug,
        name,
        tvl_usd,
        mcap_usd,
        multiple,
      }));
  };

  const priced = ranked.map((p) => {
    const curve = Math.pow(10, fit.a + fit.b * Math.log10(p.tvl_usd));
    const odds = tokenOdds(p, oddsFit, medianAge);
    return {
      p,
      curveValue: Math.round(curve),
      odds,
      implied: Math.round(curve * odds),
    };
  });
  priced.sort((u, v) =>
    v.implied !== u.implied
      ? v.implied - u.implied
      : u.p.slug < v.p.slug
        ? -1
        : 1,
  );

  const bands = bootstrapBands(
    comps,
    priced.map((r) => ({ slug: r.p.slug, tvl: r.p.tvl_usd, odds: r.odds })),
    20261124,
    200,
  );

  const rows: BoardRow[] = priced.map((r, i) => {
    const plan = farmPlan(r.p, r.implied);
    const [lo, hi] = bands.get(r.p.slug) as [number, number];
    return {
      slug: r.p.slug,
      name: r.p.name,
      category: r.p.category,
      chains: r.p.chains,
      tvl_usd: r.p.tvl_usd,
      change_7d: r.p.change_7d,
      listed_at: r.p.listed_at,
      age_days: r.p.listed_at === null ? null : ageDays(r.p, medianAge),
      scope: watchlist.has(r.p.slug) ? "watchlist" : "early",
      rank: i + 1,
      curve_value_usd: r.curveValue,
      token_odds: Math.round(r.odds * 10000) / 10000,
      implied_value_usd: r.implied,
      bootstrap_lo_usd: lo,
      bootstrap_hi_usd: hi,
      comparables: comparablesFor(r.p),
      farm_steps: plan.steps,
      farm_capital_usd: plan.capitalUsd,
      farm_gas_usd: plan.gasUsd,
      farm_tx_count: plan.txCount,
      farm_hold_days: plan.holdDays,
      farm_net_usd: plan.netUsd,
    };
  });

  // Category multiples among traded comps.
  const byCat = new Map<string, number[]>();
  for (const c of comps) {
    const key = c.category ?? "(no category)";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push((c.mcap_usd as number) / c.tvl_usd);
  }
  const categories: CategoryMultiple[] = [...byCat.entries()]
    .map(([category, vals]) => ({
      category,
      n: vals.length,
      medianMultiple: medianOf(vals),
    }))
    .sort((u, v) =>
      v.n !== u.n ? v.n - u.n : u.category < v.category ? -1 : 1,
    );

  // Live tokens: every protocol that records a token (416), by market
  // cap descending; mcap is null for 272 of them, shown as "no mcap".
  const traded = all
    .filter((p) => recordsToken(p))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      multiple:
        p.mcap_usd === null ? null : p.mcap_usd / p.tvl_usd,
    }))
    .sort((u, v) => (v.mcap_usd ?? -1) - (u.mcap_usd ?? -1));

  const exchangePrefixNamesTotal = all.filter((p) =>
    EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix)),
  ).length;

  const census: Census = {
    total: all.length,
    traded: tradedCount,
    ranked: rows.length,
    excluded: all.length - tradedCount - rows.length,
    excludedByReason,
    exchangePrefixNamesTotal,
    rankedAtOrAboveFloor: rows.filter((r) => r.tvl_usd >= snapshot.floor_usd).length,
    watchlist: rows.filter((r) => r.scope === "watchlist").length,
    early: rows.filter((r) => r.scope === "early").length,
  };

  return {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    fit,
    loo,
    timeSplit,
    odds: oddsFit,
    census,
    categories,
    rows,
    traded,
    totalImpliedUsd: rows.reduce((s, r) => s + r.implied_value_usd, 0),
  };
}
