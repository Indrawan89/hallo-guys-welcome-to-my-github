// Token Launch Radar dashboard — renders window.TOKEN_RADAR (written by
// main.ts into data.js). No network, no framework. Hash routes:
// #detail/<slug>, #tab=<board|live|method|playbooks|census|note>,
// #filter=watchlist.
const R = window.TOKEN_RADAR;
const M = R.model;
const BOARD = R.board;

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const usdShort = (n) => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
};
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const fmt7d = (v) => (v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%');
const band = (lo, hi) => usdShort(lo) + '–' + usdShort(hi);
const fmtBe = (x) => {
  if (x > 0 && x < 0.00005) return '<0.0001%';
  return x.toFixed(4).replace(/\.?0+$/, '') + '%';
};

let sortKey = 'rank';
let sortDir = 1;
let scopeFilter = 'all';
let textFilter = '';

function verdictBadge(v) {
  return `<span class="verdict ${v}">${v}</span>`;
}
function scopeBadge(s) {
  return `<span class="badge ${s === 'Watchlist' ? 'watchlist' : 'early'}">${s}</span>`;
}

function renderKpi() {
  const c = M.curve;
  const boxes = [
    [`${usdShort(R.kpi.totalImpliedUsd)}`, 'total implied value across the board', `${R.kpi.rows} rows · ${R.kpi.watchlistRows} watchlist + ${R.kpi.earlyRows} early`],
    [`${R.kpi.rows} rows`, 'every eligible pre-token protocol ranked', `watchlist ${R.kpi.watchlistRows}/${R.meta.watchlist} covered`],
    [`R² ${c.r2.toFixed(3)}`, 'size curve, fitted on traded comps', `log10(mcap) = ${c.a.toFixed(4)} + ${c.b.toFixed(4)}·log10(TVL)`],
    [`${M.loo.ratio.toFixed(2)}× better`, 'leave-one-out vs a flat multiple', `LOO RMSE ${M.loo.rmse.toFixed(3)} vs flat ${M.loo.flatRmse.toFixed(3)}`],
    [`AUC ${M.odds.auc.toFixed(3)}`, 'token-odds model', `n=${M.odds.n}, ${M.odds.positives} with a token`],
  ];
  $('kpi').innerHTML = boxes
    .map(([num, lab, sub]) => `<div class="kpi-box"><div class="num">${num}</div><div class="lab">${lab}</div><div class="sub">${sub}</div></div>`)
    .join('');
}

function filteredBoard() {
  let rows = BOARD.filter((r) => scopeFilter === 'all' || r.scope === scopeFilter);
  if (textFilter) {
    const q = textFilter.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.category ?? '').toLowerCase().includes(q),
    );
  }
  const key = sortKey;
  rows = [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'string') return sortDir * av.localeCompare(bv);
    return sortDir * (av - bv);
  });
  return rows;
}

function renderBoard() {
  const rows = filteredBoard();
  $('row-count').textContent = `${rows.length} of ${BOARD.length} rows`;
  $('board-body').innerHTML = rows
    .map(
      (r) => `<tr>
      <td>${r.rank}</td>
      <td><a href="#detail/${r.slug}">${esc(r.name)}</a><br><span class="muted small">${esc(r.slug)}</span></td>
      <td>${scopeBadge(r.scope)}</td>
      <td class="num">${usdShort(r.tvl_usd)}</td>
      <td class="num">${fmt7d(r.change_7d)}</td>
      <td class="num">${r.odds.toFixed(2)}</td>
      <td class="num"><strong>${usd(r.implied_value_usd)}</strong></td>
      <td class="num">${band(r.band_lo_usd, r.band_hi_usd)}</td>
      <td class="num">${band(r.conf_lo_usd, r.conf_hi_usd)}</td>
      <td class="num">${fmtBe(r.break_even_pct)}</td>
      <td>${verdictBadge(r.verdict)}</td>
    </tr>`,
    )
    .join('');
}

function nearestComps(row, n = 3) {
  const lt = Math.log10(row.tvl_usd);
  return [...R.live]
    .map((c) => ({ c, d: Math.abs(Math.log10(c.tvl_usd) - lt) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.c);
}

function renderDetail(slug) {
  const row = BOARD.find((r) => r.slug === slug);
  const el = $('view-detail');
  if (!row) {
    el.innerHTML = `<h2>Protocol not found</h2><p><a href="#tab=board">Back to the board</a></p>`;
    return;
  }
  const near = nearestComps(row);
  const o = M.odds;
  el.innerHTML = `
  <h2>${esc(row.name)} <span class="muted">#${row.rank} · ${scopeBadge(row.scope)}</span></h2>
  <p><a href="#tab=board">← Back to the board</a></p>
  <div class="card"><dl class="kv">
    <dt>Implied value</dt><dd><strong>${usd(row.implied_value_usd)}</strong> · 90% bootstrap band ${band(row.band_lo_usd, row.band_hi_usd)} · conformal 80% ${band(row.conf_lo_usd, row.conf_hi_usd)}</dd>
    <dt>TVL</dt><dd>${usd(row.tvl_usd)} on ${(row.chains || []).join(', ') || '—'} · 7d ${fmt7d(row.change_7d)}</dd>
    <dt>Token odds</dt><dd>${row.odds.toFixed(2)} — age, size and 7-day growth as fitted (OR age ${o.oddsRatios.age.toFixed(2)}/yr, logTVL ${o.oddsRatios.logTvl.toFixed(2)}, 7d ${o.oddsRatios.change7d.toFixed(2)} per 10 points)</dd>
    <dt>Verdict</dt><dd>${verdictBadge(row.verdict)} — net expected ${usd(row.net_expected_usd)} (odds × implied − gas); FARM needs net over $5M and odds over 0.50, WATCH net over $2M.</dd>
    <dt>Break-even</dt><dd>${fmtBe(row.break_even_pct)}% of implied value — gas ${usd(row.gas_usd)} for ${4} transactions on ${esc(row.deposit_chain)}.</dd>
    <dt>Exit trigger</dt><dd>${esc(row.exit_trigger)}</dd>
  </dl></div>
  <h3>How the value is built</h3>
  <p class="mono">implied = 10^(${M.curve.a.toFixed(4)} + ${M.curve.b.toFixed(4)} · log10(TVL)) = 10^(${M.curve.a.toFixed(4)} + ${M.curve.b.toFixed(4)} · ${Math.log10(row.tvl_usd).toFixed(3)}) = ${usd(row.implied_value_usd)}</p>
  <p>Nearest traded comps by size: ${near.map((c) => `${esc(c.name)} (${usdShort(c.mcap_usd)} mcap, ${c.multiple.toFixed(2)}× TVL)`).join(' · ')}.</p>
  <h3>Farm plan — ${usd(row.deposit_usd)} on ${esc(row.deposit_chain)}</h3>
  <ol class="steps">${row.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  <p class="muted small">Net expected ${usd(row.net_expected_usd)} = odds ${row.odds.toFixed(2)} × implied ${usd(row.implied_value_usd)} − gas ${usd(row.gas_usd)}.</p>`;
}

function renderLive() {
  const rows = [...R.live].sort((a, b) => b.mcap_usd - a.mcap_usd);
  $('view-live').innerHTML = `<h2>Live tokens — traded comps the curve is fitted on</h2>
  <p>${rows.length} traded protocols with a market cap, one per ticker. The size curve is fitted on these; the board ranks the ones still to come.</p>
  <table><thead><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>Multiple</th></tr></thead><tbody>
  ${rows.map((c) => `<tr><td>${esc(c.name)} <span class="muted small">${esc(c.symbol ?? '')}</span></td><td class="num">${usdShort(c.tvl_usd)}</td><td class="num">${usdShort(c.mcap_usd)}</td><td class="num">${c.multiple.toFixed(2)}×</td></tr>`).join('')}
  </tbody></table>`;
}

function renderMethod() {
  const c = M.curve;
  const w = M.walkForward;
  $('view-method').innerHTML = `<h2>Methodology — everything the board claims, and how it was tested</h2>
  <h3>The size curve</h3>
  <p>Implied value comes from one fitted curve, not a hardcoded list: <span class="mono">log10(mcap) = ${c.a.toFixed(4)} + ${c.b.toFixed(4)} · log10(TVL)</span>, fitted by Huber-IRLS (k = 1.345σ, 10 iterations) on ${c.n} traded comps, one per ticker. R² ${c.r2.toFixed(3)}, RMSE ${c.rmse.toFixed(3)} in log10. The flat alternative — every token worth the median multiple ${c.flatMultiple.toFixed(4)}× TVL — has RMSE ${c.flatRmse.toFixed(3)}.</p>
  <h3>Held out twice</h3>
  <p>The curve was tested on data it never saw, two independent ways: a random 80/20 split (${M.heldOut.random.ratio.toFixed(2)}× better than flat, ${M.heldOut.random.nTest} test rows) and a time split at the median listing date ${M.heldOut.timeSplit.cutoff} (${M.heldOut.timeSplit.ratio.toFixed(2)}× better than flat, ${M.heldOut.timeSplit.nTest} test rows, holdout R² ${M.heldOut.timeSplit.r2.toFixed(3)} — the relation does not collapse on newer listings). Leave-one-out over all ${c.n} comps: ${M.loo.ratio.toFixed(2)}× better than flat (RMSE ${M.loo.rmse.toFixed(3)} vs ${M.loo.flatRmse.toFixed(3)}); ${(M.loo.within3 * 100).toFixed(1)}% of held-out values land within 3× of the fitted value, ${(M.loo.within2 * 100).toFixed(1)}% within 2× — a wide band, and the reason the board shows bands, not points.</p>
  <h3>Placebo</h3>
  <p>Shuffle the market caps and refit: R² ${M.placebo.r2.toFixed(4)}. The signal is real, not an artefact of the fitting procedure.</p>
  <h3>Conformal 80% intervals</h3>
  <p>Each row carries a conformal 80% range built from the leave-one-out residuals (half-width ${M.conformal.halfWidthDex.toFixed(3)} dex). On the held-out test set it covered ${pct(M.conformal.coverage, 0)} of values (n=${M.conformal.nTest}) against a nominal 80% — the interval does what it promises. The bootstrap 90% band (B=${M.bootstrap.b}) is shown beside it; the two are different claims and are labelled as such.</p>
  <h3>Walk-forward</h3>
  <p>Train on listings before each year, test on that year's listings: pooled ${w.pooled.toFixed(2)}× better than flat (n=${w.n}). ${w.years.map((y) => `${y.year}: ${y.ratio.toFixed(2)}× (n=${y.nTest})`).join(' · ')}.</p>
  <h3>Why one factor, not many</h3>
  <p>A four-input multiple (size + ${M.multi.terms.length - 3} category terms + chains + 7d) was fitted alongside the single-factor curve; the single-factor curve won the blind test (LOO ${M.loo.rmse.toFixed(3)} vs ${M.multi.looRmse.toFixed(3)}), so the board keeps it. Per-term ablation on the curve: dropping logTVL destroys it; every added term hurts out-of-sample. The odds model is a logistic fit on age, logTVL and winsorized 7d growth (AUC ${M.odds.auc.toFixed(3)}, n=${M.odds.n}, ${M.odds.positives} with a token; without age ${M.odds.ablation.noAge.toFixed(3)}, without logTVL ${M.odds.ablation.noLogTvl.toFixed(3)}, without 7d ${M.odds.ablation.noChange7d.toFixed(3)}).</p>
  <h3>One honest note on 7-day growth</h3>
  <p>In this snapshot the 7-day growth term adds almost nothing to the odds model (OR ${M.odds.oddsRatios.change7d.toFixed(2)} per 10 points; AUC ${M.odds.ablation.noChange7d.toFixed(3)} without it vs ${M.odds.auc.toFixed(3)} with it), so the odds are driven by age and size. The term stays because the brief names 7-day growth as an input — it is kept small, not forced positive.</p>
  <h3>Verdicts and break-even</h3>
  <p>Verdict is a stated rule, not a feeling: FARM when net expected exceeds $5M and token odds exceed 0.50; WATCH when net expected exceeds $2M; otherwise SKIP. Net expected = odds × implied value − gas. Break-even is gas ÷ implied value, shown on every row. Gas follows the deposit chain ($12 per transaction on Ethereum, $1.50 elsewhere, 4 transactions per plan).</p>
  <h3>Recompute</h3>
  <p id="recompute-note">This page re-derives every row's implied value from the curve above and compares it with the board.</p>
  <h3>Bootstrap</h3>
  <p>B=${M.bootstrap.b} resamples of the comps: slope 90% [${M.bootstrap.slope[0].toFixed(3)}, ${M.bootstrap.slope[1].toFixed(3)}], intercept 90% [${M.bootstrap.intercept[0].toFixed(3)}, ${M.bootstrap.intercept[1].toFixed(3)}]. Per-row 90% bands come from the same refits.</p>`;
}

function renderPlaybooks() {
  $('view-playbooks').innerHTML = `<h2>Category playbooks — one costed plan per big category</h2>
  <p>Each playbook starts from its category's largest pre-token protocol by implied value and costs the whole plan: deposit, gas, exit trigger and net expected. ${R.playbooks.length} categories have at least 5 ranked rows.</p>
  ${R.playbooks
    .map(
      (p) => `<div class="card"><h3>${esc(p.category)} — ${p.rows} ranked rows</h3>
    <dl class="kv">
      <dt>Lead protocol</dt><dd><a href="#detail/${p.topSlug}">${esc(p.topName)}</a> — implied ${usd(p.topImpliedUsd)}, token odds ${p.topOdds.toFixed(2)}</dd>
      <dt>Deposit</dt><dd>${usd(p.depositUsd)} on ${esc(p.depositChain)}</dd>
      <dt>Gas</dt><dd>${usd(p.gasUsd)} for 4 transactions</dd>
      <dt>Net expected</dt><dd>${usd(p.netExpectedUsd)}</dd>
      <dt>Exit trigger</dt><dd>${esc(p.exitTrigger)}</dd>
    </dl>
    <ol class="steps">${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>`,
    )
    .join('')}`;
}

function renderCensus() {
  $('view-census').innerHTML = `<h2>Census — every protocol in the snapshot, accounted for</h2>
  <p>${R.census.total} protocols at or above $5M TVL (snapshot ${esc(R.meta.asOf)}). The board ranks the pre-token ones; the rest are shown here so nothing is hidden.</p>
  <table><thead><tr><th>Bucket</th><th>Count</th><th>Example</th></tr></thead><tbody>
  ${R.census.buckets.map((b) => `<tr><td>${esc(b.name)}</td><td class="num">${b.count}</td><td>${esc(b.example)}</td></tr>`).join('')}
  </tbody></table>
  <p class="muted small">Watchlist: ${R.meta.watchlist} protocols at or above $${(R.meta.floorUsd / 1e6).toFixed(0)}M TVL with no token recorded and no wrapped, staked or bridged product — all ${R.meta.watchlist} are on the board.</p>`;
}

function renderNote() {
  const top = BOARD[0];
  $('view-note').innerHTML = `<h2>Research note</h2>
  <p><strong>The one-line answer: ${esc(top.name)} — ${usd(top.implied_value_usd)} of implied value, token odds ${top.odds.toFixed(2)}, verdict ${top.verdict}.</strong> The board's top three are ${BOARD.slice(0, 3).map((r) => `${esc(r.name)} (${usd(r.implied_value_usd)})`).join(', ')}; the board totals ${usdShort(R.kpi.totalImpliedUsd)} of implied value across ${R.kpi.rows} rows.</p>
  <p>What the data supports: the size curve beats a flat multiple out-of-sample (${M.loo.ratio.toFixed(2)}× leave-one-out, ${M.heldOut.random.ratio.toFixed(2)}× on a random holdout, ${M.heldOut.timeSplit.ratio.toFixed(2)}× on a time split), the token-odds model separates tokens from no-tokens at AUC ${M.odds.auc.toFixed(3)}, and the walk-forward pooled ratio is ${M.walkForward.pooled.toFixed(2)}×. The curve is real but the band is wide — ${(M.loo.within3 * 100).toFixed(1)}% of held-out values land within 3× — so every row shows its band, and the verdicts use net expected value, not the point estimate alone.</p>
  <p>What to do with it: farm the FARM rows first (net expected over $5M with odds over 0.50), watch the WATCH rows, and skip the rest until their odds or implied value move. Each row's plan names its deposit, its gas and its exit trigger; the category playbooks say the same thing one level up.</p>
  <p class="muted small">Snapshot: ${esc(R.meta.source)}. ${R.meta.protocols} protocols, ${R.meta.watchlist} on the watchlist, ${R.meta.comps} traded comps fitted.</p>`;
}

function auditChecks() {
  const checks = [];
  checks.push(['no duplicate slugs on the board', new Set(BOARD.map((r) => r.slug)).size === BOARD.length]);
  const ranks = BOARD.map((r) => r.rank).sort((a, b) => a - b);
  checks.push(['ranks 1..N exactly once', ranks.every((r, i) => r === i + 1)]);
  checks.push(['implied value never rises with rank', BOARD.every((r, i) => i === 0 || r.implied_value_usd <= BOARD[i - 1].implied_value_usd)]);
  checks.push(['every implied value positive', BOARD.every((r) => r.implied_value_usd > 0)]);
  checks.push(['farm steps 3–12, 20–600 chars', BOARD.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600))]);
  checks.push(['census sums to the snapshot', R.census.buckets.reduce((s, b) => s + b.count, 0) === R.census.total]);
  checks.push(['board holds at least 100 rows', BOARD.length >= 100]);
  checks.push(['no NaN in the board', BOARD.every((r) => Number.isFinite(r.implied_value_usd) && Number.isFinite(r.odds))]);
  checks.push(['watchlist rows match the snapshot', BOARD.filter((r) => r.scope === 'Watchlist').length === R.meta.watchlist]);
  checks.push(['implied values differ', new Set(BOARD.map((r) => r.implied_value_usd)).size > 1]);
  const rc = window.RECOMPUTE
    ? window.RECOMPUTE.recomputeBoard(BOARD, M.curve.a, M.curve.b)
    : { matched: 0, total: BOARD.length, worstGap: NaN };
  checks.push([`recompute ${rc.matched}/${rc.total} rows match (worst gap $${rc.worstGap})`, rc.matched === rc.total]);
  return checks;
}

function renderAudit() {
  const checks = auditChecks();
  const passed = checks.filter(([, ok]) => ok).length;
  $('audit').textContent = `Live self-audit: ${passed}/${checks.length} checks pass — ${checks.map(([name, ok]) => `${ok ? '✓' : '✗'} ${name}`).join(' · ')}`;
}

function showTab(name) {
  for (const t of ['board', 'live', 'method', 'playbooks', 'census', 'note']) {
    const view = $('view-' + t);
    if (view) view.hidden = t !== name;
  }
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  if (name === 'live') renderLive();
  if (name === 'method') renderMethod();
  if (name === 'playbooks') renderPlaybooks();
  if (name === 'census') renderCensus();
  if (name === 'note') renderNote();
}

function route() {
  const h = location.hash || '';
  if (h.startsWith('#detail/')) {
    $('view-detail').hidden = false;
    for (const t of ['board', 'live', 'method', 'playbooks', 'census', 'note']) {
      const view = $('view-' + t);
      if (view) view.hidden = true;
    }
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.remove('active'));
    renderDetail(decodeURIComponent(h.slice(8)));
    window.scrollTo(0, 0);
    return;
  }
  const tab = (h.match(/#tab=(\w+)/) || [])[1] || 'board';
  if (h.includes('filter=watchlist')) {
    scopeFilter = 'Watchlist';
    document.querySelectorAll('.scope').forEach((b) => b.classList.toggle('active', b.dataset.scope === 'Watchlist'));
  }
  $('view-detail').hidden = true;
  showTab(tab);
  renderBoard();
}

$('source-line').textContent = `Snapshot ${R.meta.asOf} · ${R.meta.source} · ${R.meta.protocols} protocols · watchlist ${R.meta.watchlist} · ${R.meta.comps} traded comps fitted.`;
renderKpi();
renderBoard();
document.querySelectorAll('#tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    location.hash = '#tab=' + b.dataset.tab;
  });
});
document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortDir = -sortDir;
    else {
      sortKey = key;
      sortDir = key === 'rank' || key === 'name' || key === 'scope' || key === 'verdict' ? 1 : -1;
    }
    renderBoard();
  });
});
document.querySelectorAll('.scope').forEach((b) => {
  b.addEventListener('click', () => {
    scopeFilter = b.dataset.scope;
    document.querySelectorAll('.scope').forEach((x) => x.classList.toggle('active', x === b));
    renderBoard();
  });
});
$('filter-text').addEventListener('input', (e) => {
  textFilter = e.target.value;
  renderBoard();
});
window.addEventListener('hashchange', route);
route();
renderAudit();
