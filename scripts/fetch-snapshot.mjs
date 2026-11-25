// Fetch the DefiLlama protocol list and write the 10-field snapshot this
// entry reads. Written fresh for token-radar rebuild5 (25 Nov 2026).
// Node 22+ stdlib only. Usage: node scripts/fetch-snapshot.mjs [out.json]
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'input/snapshot.json';
const FLOOR_USD = 50_000_000;
const MIN_TVL = 5_000_000;
const VERSION = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
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

function hasWrappedWord(name) {
  return (name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w === 'wrapped' || w === 'staked' || w === 'staking');
}

function startsWithExchange(name) {
  return EXCHANGE_NAMES.some((e) => (name ?? '').startsWith(e));
}

/** The house watchlist rule (kit input/README.md): floor, no token, not
 * versioned, not a wrapped/staked/bridged product of a traded token. */
function onWatchlist(p) {
  if (p.tvl_usd < FLOOR_USD) return false;
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (VERSION.test(p.name)) return false;
  if (p.parentProtocol) return false;
  if (EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (hasWrappedWord(p.name)) return false;
  if (startsWithExchange(p.name)) return false;
  return true;
}

const fetchedAt = new Date();
const res = await fetch('https://api.llama.fi/protocols');
if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`);
const raw = await res.json();

const protocols = [];
for (const r of raw) {
  const tvl = typeof r.tvl === 'number' ? Math.trunc(r.tvl) : 0;
  if (!r.slug || !r.name || tvl < MIN_TVL) continue;
  const change7d =
    typeof r.change_7d === 'number' ? Math.round(r.change_7d * 1e4) / 1e4 : null;
  const mcap =
    typeof r.mcap === 'number' ? Math.trunc(r.mcap) : null;
  const listedAt =
    typeof r.listedAt === 'number'
      ? new Date(r.listedAt * 1000).toISOString().slice(0, 10)
      : null;
  protocols.push({
    slug: r.slug,
    name: r.name,
    category: typeof r.category === 'string' ? r.category : null,
    chains: Array.isArray(r.chains) ? r.chains : [],
    tvl_usd: tvl,
    change_7d: change7d,
    mcap_usd: mcap,
    listed_at: listedAt,
    gecko_id: typeof r.gecko_id === 'string' ? r.gecko_id : null,
    symbol:
      typeof r.symbol === 'string' && r.symbol !== '-' ? r.symbol : null,
    parentProtocol: r.parentProtocol ?? null,
  });
}
protocols.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

const watchlist = protocols.filter(onWatchlist).map((p) => p.slug);
const asOf = fetchedAt.toISOString().slice(0, 10);
const snapshot = {
  as_of: asOf,
  source: `DefiLlama https://api.llama.fi/protocols, fetched ${fetchedAt.toISOString()}`,
  floor_usd: FLOOR_USD,
  protocols: protocols.map(({ parentProtocol: _pp, ...ten }) => ten),
  watchlist,
};
writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
const traded = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length;
process.stdout.write(
  `fetch-snapshot: ${protocols.length} protocols >= $5M, watchlist ${watchlist.length}, traded ${traded}, as_of ${asOf}\n`,
);
