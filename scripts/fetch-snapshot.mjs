// Fetch the DefiLlama protocol list and shape it into this competition's
// snapshot format: protocols >= $5M TVL, ten fields each, sorted by slug,
// plus the watchlist produced by the house rule (floor $50M, no token
// recorded, no parent protocol, no versioned/wrapped/staked/bridged name,
// no excluded category, no exchange prefix). Node stdlib only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLOOR_USD = 50_000_000;
const MIN_TVL_USD = 5_000_000;
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
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
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

function dayOf(tsSeconds) {
  const d = new Date(tsSeconds * 1000);
  return d.toISOString().slice(0, 10);
}

function cleanSymbol(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t === '' || t === '-' ? null : t;
}

function cleanGecko(g) {
  if (g === null || g === undefined) return null;
  const t = String(g).trim();
  return t === '' ? null : t;
}

function onWatchlist(p, raw) {
  if (p.tvl_usd < FLOOR_USD) return false;
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (raw.parentProtocol !== null && raw.parentProtocol !== undefined) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(ex)) return false;
  }
  return true;
}

async function main() {
  const url = 'https://api.llama.fi/protocols';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  const rawList = await res.json();
  const fetchedAt = new Date().toISOString();
  const asOf = fetchedAt.slice(0, 10);

  const protocols = [];
  let droppedNoSlug = 0;
  for (const raw of rawList) {
    const slug = raw.slug ?? raw.id ?? null;
    const name = raw.name ?? null;
    const tvl = raw.tvl ?? null;
    if (slug === null || name === null || tvl === null) {
      droppedNoSlug++;
      continue;
    }
    const tvlUsd = Math.trunc(Number(tvl));
    if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL_USD) continue;
    const mcapRaw = raw.mcap ?? null;
    const mcapUsd =
      mcapRaw === null || mcapRaw === undefined ? null : Math.trunc(Number(mcapRaw));
    const changeRaw = raw.change_7d ?? null;
    const change7d =
      changeRaw === null || changeRaw === undefined
        ? null
        : Math.round(Number(changeRaw) * 10000) / 10000;
    const listedRaw = raw.listedAt ?? null;
    const listedAt =
      listedRaw === null || listedRaw === undefined ? null : dayOf(Number(listedRaw));
    protocols.push({
      slug: String(slug),
      name: String(name),
      category: raw.category ?? null,
      chains: Array.isArray(raw.chains) ? raw.chains.map(String) : [],
      tvl_usd: tvlUsd,
      change_7d: change7d,
      mcap_usd: mcapUsd,
      listed_at: listedAt,
      gecko_id: cleanGecko(raw.gecko_id),
      symbol: cleanSymbol(raw.symbol),
    });
    // keep the raw record's parentProtocol for the watchlist rule
    protocols[protocols.length - 1]._parent = raw.parentProtocol ?? null;
  }
  protocols.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const bySlug = new Map(protocols.map((p) => [p.slug, p]));
  const watchlist = [];
  for (const p of protocols) {
    const rawParent = p._parent;
    if (onWatchlist(p, { parentProtocol: rawParent })) watchlist.push(p.slug);
  }
  watchlist.sort();

  for (const p of protocols) delete p._parent;

  const snapshot = {
    as_of: asOf,
    source: `DefiLlama https://api.llama.fi/protocols, fetched ${fetchedAt}`,
    floor_usd: FLOOR_USD,
    protocols,
    watchlist,
  };

  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');
  mkdirSync(join(root, 'input'), { recursive: true });
  const outPath = join(root, 'input', 'snapshot.json');
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n');
  const traded = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length;
  const noToken = protocols.filter((p) => p.mcap_usd === null).length;
  const cats = new Set(protocols.map((p) => p.category).filter((c) => c !== null)).size;
  console.log(`fetched ${rawList.length} raw records, dropped ${droppedNoSlug} without slug/name/tvl`);
  console.log(`protocols >= $5M: ${protocols.length}, watchlist: ${watchlist.length}`);
  console.log(`traded (mcap>0): ${traded}, no-token (mcap null): ${noToken}, categories: ${cats}`);
  console.log(`as_of ${asOf}, wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
