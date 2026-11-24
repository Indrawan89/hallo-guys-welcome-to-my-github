// fetch-snapshot.mjs — regenerate input/snapshot.json from the live
// DefiLlama feed, in this session. Node stdlib only (fetch + fs).
// Output shape mirrors the house snapshot: { as_of, source, floor_usd,
// protocols[], watchlist[] }. A protocol row carries exactly the ten
// fields the house snapshot carries.
import { writeFileSync, mkdirSync } from "node:fs";

const ENDPOINT = "https://api.llama.fi/protocols";
const FLOOR_PROTOCOL_USD = 5_000_000;
const FLOOR_WATCHLIST_USD = 50_000_000;

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

function hasToken(p) {
  return p.gecko_id !== null || p.symbol !== null;
}

// The watchlist rule, in my own words: big enough (at or above the
// $50M floor), records no token at all, DefiLlama names no parent
// protocol for it (so it is not a product of another protocol), it is
// not in an excluded category, its name carries no version tail and no
// wrapped/staked/staking word, and it does not start with an exchange's
// name.
function onWatchlist(p) {
  if (p.tvl_usd < FLOOR_WATCHLIST_USD) return false;
  if (hasToken(p)) return false;
  if (p.parent_protocol !== null) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_TAIL.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(ex)) return false;
  }
  return true;
}

function dayOf(tsSeconds) {
  if (tsSeconds === null || tsSeconds === undefined) return null;
  const d = new Date(tsSeconds * 1000);
  return d.toISOString().slice(0, 10);
}

function nullIfDash(v) {
  return v === "-" || v === "" || v === undefined ? null : v;
}

const res = await fetch(ENDPOINT, { headers: { accept: "application/json" } });
if (!res.ok) throw new Error(`DefiLlama fetch failed: HTTP ${res.status}`);
const raw = await res.json();
if (!Array.isArray(raw)) throw new Error("DefiLlama did not return an array");

const now = new Date();
const asOf = now.toISOString().slice(0, 10);

const protocols = [];
for (const r of raw) {
  const tvl = typeof r.tvl === "number" ? Math.trunc(r.tvl) : 0;
  if (tvl < FLOOR_PROTOCOL_USD) continue;
  const mcap =
    typeof r.mcap === "number" ? Math.trunc(r.mcap) : null;
  protocols.push({
    slug: String(r.slug),
    name: String(r.name),
    category: r.category === undefined ? null : r.category,
    chains: Array.isArray(r.chains) ? r.chains.map(String) : [],
    tvl_usd: tvl,
    change_7d:
      typeof r.change_7d === "number" ? r.change_7d : null,
    mcap_usd: mcap,
    listed_at: dayOf(r.listedAt ?? null),
    gecko_id: nullIfDash(r.gecko_id ?? null),
    symbol: nullIfDash(r.symbol ?? null),
    // Internal only: DefiLlama's parent record, used by the watchlist
    // rule, stripped before the snapshot is written (it is not one of
    // the snapshot's ten fields).
    parent_protocol: r.parentProtocol === undefined ? null : r.parentProtocol,
  });
}
protocols.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

const watchlist = protocols.filter(onWatchlist).map((p) => p.slug);

// Strip the internal field: snapshot rows carry exactly ten fields.
for (const p of protocols) delete p.parent_protocol;

const snapshot = {
  as_of: asOf,
  source: `${ENDPOINT} fetched ${now.toISOString()}`,
  floor_usd: FLOOR_WATCHLIST_USD,
  protocols,
  watchlist,
};

mkdirSync("input", { recursive: true });
writeFileSync("input/snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");

const traded = protocols.filter((p) => (p.mcap_usd ?? 0) > 0).length;
const cats = new Set(protocols.map((p) => p.category).filter(Boolean)).size;
console.log(`as_of ${asOf} | raw ${raw.length} | protocols ${protocols.length} | watchlist ${watchlist.length} | traded ${traded} | categories ${cats}`);
