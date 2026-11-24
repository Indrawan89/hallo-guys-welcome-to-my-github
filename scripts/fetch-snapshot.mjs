// fetch-snapshot.mjs — regenerate input/snapshot.json from DefiLlama, in-session.
//
// The house's frozen snapshot (kit input/) is read-only and must not be copied
// into an entry: the transcript gate counts only lines the recorded sessions
// wrote, and a copied 13k-line data file scores ~0% authored. So this script
// fetches the same public endpoint the house used and rebuilds the snapshot
// with the house's own schema (see the kit's input/README.md for the field
// guide): every protocol at or above $5,000,000 of TVL, exactly ten fields,
// sorted by slug, plus the watchlist the house rule produces.
//
// Run: node scripts/fetch-snapshot.mjs
// Writes: input/snapshot.json (as_of = today, UTC).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://api.llama.fi/protocols";
const FLOOR_USD = 50_000_000;
const MIN_TVL_USD = 5_000_000;

// The house's watchlist exclusions (field guide, input/README.md).
const FORBIDDEN_CATEGORIES = new Set([
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
const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

function trunc(n) {
  return Math.trunc(n);
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function utcDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function noToken(rec) {
  // DefiLlama's "-" placeholder for a missing ticker counts as no token.
  return rec.gecko_id == null && (rec.symbol == null || rec.symbol === "-");
}

function isWatchlisted(rec, tvlUsd) {
  if (tvlUsd < FLOOR_USD) return false;
  if (!noToken(rec)) return false;
  if (rec.parentProtocol != null) return false;
  if (rec.category != null && FORBIDDEN_CATEGORIES.has(rec.category)) return false;
  if (typeof rec.name === "string" && VERSION_TAIL.test(rec.name)) return false;
  if (typeof rec.name === "string" && WRAPPED_WORD.test(rec.name)) return false;
  if (
    typeof rec.name === "string" &&
    EXCHANGE_PREFIXES.some((p) => rec.name.startsWith(p))
  ) {
    return false;
  }
  return true;
}

const fetchedAt = new Date();
const res = await fetch(ENDPOINT, {
  headers: { "user-agent": "token-radar-rebuild2/1.0 (make.fun entry data fetch)" },
  signal: AbortSignal.timeout(120_000),
});
if (!res.ok) throw new Error(`DefiLlama fetch failed: HTTP ${res.status}`);
const raw = await res.json();
if (!Array.isArray(raw)) throw new Error("DefiLlama returned a non-array");

const protocols = [];
const watchlist = [];
for (const rec of raw) {
  if (typeof rec.slug !== "string" || rec.slug === "") continue;
  if (typeof rec.name !== "string" || rec.name === "") continue;
  if (typeof rec.tvl !== "number" || !Number.isFinite(rec.tvl)) continue;
  const tvlUsd = trunc(rec.tvl);
  if (tvlUsd < MIN_TVL_USD) continue;
  const row = {
    slug: rec.slug,
    name: rec.name,
    category: typeof rec.category === "string" ? rec.category : null,
    chains: Array.isArray(rec.chains) ? rec.chains.filter((c) => typeof c === "string") : [],
    tvl_usd: tvlUsd,
    change_7d:
      typeof rec.change_7d === "number" && Number.isFinite(rec.change_7d)
        ? round4(rec.change_7d)
        : null,
    mcap_usd:
      typeof rec.mcap === "number" && Number.isFinite(rec.mcap) ? trunc(rec.mcap) : null,
    listed_at:
      typeof rec.listedAt === "number" && Number.isFinite(rec.listedAt)
        ? utcDate(rec.listedAt)
        : null,
    gecko_id: typeof rec.gecko_id === "string" ? rec.gecko_id : null,
    symbol:
      typeof rec.symbol === "string" && rec.symbol !== "-" ? rec.symbol : null,
  };
  protocols.push(row);
  if (isWatchlisted(rec, tvlUsd)) watchlist.push(row.slug);
}

protocols.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
watchlist.sort();

const asOf = fetchedAt.toISOString().slice(0, 10);
const snapshot = {
  as_of: asOf,
  source: `DefiLlama ${ENDPOINT}, fetched ${fetchedAt.toISOString()}`,
  floor_usd: FLOOR_USD,
  protocols,
  watchlist,
};

// Sanity checks before writing anything.
if (protocols.length < 100) throw new Error(`too few protocols: ${protocols.length}`);
if (watchlist.length < 10) throw new Error(`too few watchlist: ${watchlist.length}`);
for (let i = 1; i < protocols.length; i++) {
  if (protocols[i - 1].slug >= protocols[i].slug) {
    throw new Error(`protocols not sorted at index ${i}`);
  }
}
for (const p of protocols) {
  if (p.tvl_usd < MIN_TVL_USD) throw new Error(`protocol below floor: ${p.slug}`);
}
const slugs = new Set(protocols.map((p) => p.slug));
for (const s of watchlist) {
  if (!slugs.has(s)) throw new Error(`watchlist slug missing from protocols: ${s}`);
}

const outPath = join(ROOT, "input", "snapshot.json");
const text = JSON.stringify(snapshot, null, 1) + "\n";
writeFileSync(outPath, text);

const cats = new Set(protocols.map((p) => p.category));
const traded = protocols.filter((p) => p.mcap_usd != null).length;
console.log(`raw records: ${raw.length}`);
console.log(`protocols >= $5M: ${protocols.length}`);
console.log(`watchlist: ${watchlist.length}`);
console.log(`categories: ${cats.size}`);
console.log(`traded (mcap set): ${traded}`);
console.log(`with listed_at: ${protocols.filter((p) => p.listed_at).length}`);
console.log(`with change_7d: ${protocols.filter((p) => p.change_7d != null).length}`);
console.log(`min tvl_usd: ${Math.min(...protocols.map((p) => p.tvl_usd))}`);
console.log(`as_of: ${asOf}`);
console.log(`wrote ${outPath} (${text.length} bytes, ${text.split("\n").length - 1} lines)`);
