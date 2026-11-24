// Token Launch Radar — rebuild4 dashboard logic. Plain script, no imports:
// it reads window.TOKEN_RADAR (data.js) and window.TOKEN_RECOMPUTE.
(function () {
  var D = window.TOKEN_RADAR;
  if (!D) {
    document.body.innerHTML = '<p style="padding:20px">data.js failed to load.</p>';
    return;
  }
  var rows = D.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function usd(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function usdShort(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return usd(n);
  }
  function pct7d(v) {
    if (v === null || v === undefined) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- header ----
  document.getElementById('asof-line').textContent =
    'Snapshot ' + D.meta.as_of + ' · ' + D.meta.rows + ' ranked rows';
  document.getElementById('source-line').textContent =
    'Source: ' + D.meta.source + ' · floor $' + D.meta.floor_usd.toLocaleString('en-US') +
    ' · ' + D.meta.protocols + ' protocols · ' + D.meta.watchlist + ' on the watchlist.';

  // ---- KPI strip: results first, never the weakest number last ----
  var c = D.curve, v = D.validation;
  var kpis = [
    { v: usd(D.meta.total_implied_usd), l: 'Total implied value', s: 'sum over the whole board' },
    { v: D.meta.rows + ' rows', l: 'Board', s: D.meta.watchlist_rows + ' watchlist + ' + D.meta.early_rows + ' early finds' },
    { v: 'R² ' + c.r2.toFixed(3), l: 'Size curve', s: 'log10(mcap) = ' + c.a.toFixed(2) + ' + ' + c.b.toFixed(2) + '·log10(TVL)' },
    { v: c.loo_multiple.toFixed(2) + '× better', l: 'Leave-one-out vs flat', s: 'RMSE ' + c.loo_rmse.toFixed(3) + ' vs flat ' + c.flat_rmse.toFixed(3) },
    { v: 'AUC ' + v.odds_auc.toFixed(3), l: 'Token odds', s: 'n=' + v.odds_n + ', ' + v.odds_positives + ' with a token' },
  ];
  document.getElementById('kpi-strip').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><div class="v">' + k.v + '</div><div class="l">' + k.l + '</div><div class="s">' + k.s + '</div></div>';
  }).join('');

  // ---- tabs + hash routes (used by the screenshot runs too) ----
  var tabs = document.querySelectorAll('#tabs button');
  function showTab(name) {
    tabs.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('main .tab').forEach(function (s) {
      s.classList.toggle('active', s.id === 'tab-' + name);
    });
  }
  tabs.forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });

  // ---- board: filter, scope, sort ----
  var sortKey = 'rank', sortDir = 1;
  var scopeFilter = 'all', query = '';
  function visibleRows() {
    var list = rows.filter(function (r) {
      if (scopeFilter !== 'all' && r.scope !== scopeFilter) return false;
      if (query) {
        var q = query.toLowerCase();
        if ((r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = sortKey;
    list.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      var d = typeof av === 'string' ? (av < bv ? -1 : av > bv ? 1 : 0) : av - bv;
      return d * sortDir;
    });
    return list;
  }
  function renderBoard() {
    var list = visibleRows();
    document.getElementById('board-body').innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td class="proto">' + esc(r.name) + '</td>' +
        '<td><span class="badge ' + r.scope + '">' + r.scope + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct7d(r.change_7d) + '</td>' +
        '<td class="num">' + r.odds.toFixed(2) + '</td>' +
        '<td class="num"><b>' + usd(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + usd(r.band_low_usd) + ' – ' + usd(r.band_high_usd) + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('row-count').textContent =
      list.length + ' of ' + rows.length + ' rows shown';
    document.querySelectorAll('#board-body tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.dataset.slug); });
    });
  }
  document.querySelectorAll('#board-table th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      renderBoard();
    });
  });
  document.getElementById('search').addEventListener('input', function (e) {
    query = e.target.value; renderBoard();
  });
  document.querySelectorAll('#scope-filter button').forEach(function (b) {
    b.addEventListener('click', function () {
      scopeFilter = b.dataset.scope;
      document.querySelectorAll('#scope-filter button').forEach(function (x) {
        x.classList.toggle('active', x === b);
      });
      renderBoard();
    });
  });

  // ---- recompute check: the page re-derives every row ----
  var recompute = window.TOKEN_RECOMPUTE;
  var mismatches = 0;
  rows.forEach(function (r) {
    var again = recompute.recomputeRow(r, D.recompute);
    if (again.implied_value_usd !== r.implied_value_usd) mismatches++;
  });
  document.getElementById('recompute-line').textContent =
    'Recomputed in this page: ' + (rows.length - mismatches) + '/' + rows.length +
    ' rows match the model exactly' + (mismatches ? ' (' + mismatches + ' differ)' : ' ✓');

  // ---- detail view ----
  var select = document.getElementById('detail-select');
  select.innerHTML = rows.map(function (r) {
    return '<option value="' + esc(r.slug) + '">#' + r.rank + ' — ' + esc(r.name) + ' (' + usd(r.implied_value_usd) + ')</option>';
  }).join('');
  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    select.value = slug;
    renderDetail(r);
    showTab('detail');
  }
  select.addEventListener('change', function () { renderDetail(bySlug[select.value]); });
  function renderDetail(r) {
    var again = recompute.recomputeRow(r, D.recompute);
    var near = r.nearest.map(function (n) {
      return '<div class="kv"><span>' + esc(n.name) + ' — TVL ' + usd(n.tvl_usd) +
        ', mcap ' + usd(n.mcap_usd) + '</span><span>×' + n.multiple.toFixed(2) + '</span></div>';
    }).join('');
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    document.getElementById('detail-body').innerHTML =
      '<div class="detail-grid">' +
      '<div class="dbox"><h3>Implied value</h3><div class="big">' + usd(r.implied_value_usd) + '</div>' +
      '<div class="kv"><span>Fitted market cap</span><span>' + usd(r.fitted_mcap_usd) + '</span></div>' +
      '<div class="kv"><span>Token odds</span><span>' + r.odds.toFixed(3) + '</span></div>' +
      '<div class="kv"><span>Rank</span><span>#' + r.rank + ' of ' + rows.length + '</span></div>' +
      '<div class="kv"><span>Scope</span><span>' + r.scope + '</span></div></div>' +
      '<div class="dbox"><h3>90% band (bootstrap, B=200)</h3><div class="big">' + usd(r.band_low_usd) + ' – ' + usd(r.band_high_usd) + '</div>' +
      '<p>From 200 refits of the curve on resampled comps. The point estimate sits inside the band.</p>' +
      '<div class="kv"><span>Net expected value</span><span>' + usd(r.net_expected_usd) + '</span></div>' +
      '<div class="kv"><span>Gas drag</span><span>' + r.gas_drag_pct.toFixed(1) + '% of implied</span></div></div>' +
      '<div class="dbox"><h3>Token odds — what moves it</h3>' +
      '<div class="kv"><span>Age (no token)</span><span>' + (r.age_years === null ? 'not listed' : r.age_years.toFixed(1) + ' yrs') + '</span></div>' +
      '<div class="kv"><span>TVL</span><span>' + usd(r.tvl_usd) + '</span></div>' +
      '<div class="kv"><span>7-day growth</span><span>' + pct7d(r.change_7d) + ' (winsorized to −50%…+100%)</span></div>' +
      '<div class="kv"><span>Model AUC</span><span>' + v.odds_auc.toFixed(3) + '</span></div></div>' +
      '<div class="dbox"><h3>Nearest comps by size</h3>' + near + '</div>' +
      '<div class="dbox"><h3>Farm plan</h3><ol>' + steps + '</ol></div>' +
      '<div class="dbox"><h3>Exit trigger &amp; gas</h3><p>' + esc(r.exit_trigger) + '</p>' +
      '<div class="kv"><span>Gas, whole plan</span><span>' + usd(r.gas_usd) + ' (' + r.farm_steps.length + ' steps)</span></div>' +
      '<div class="kv"><span>Recomputed in this page</span><span>' + usd(again.implied_value_usd) +
      (again.implied_value_usd === r.implied_value_usd ? ' ✓ matches' : ' ✗ differs') + '</span></div></div>' +
      '</div>';
  }

  // ---- methodology ----
  function ablateTable(title, items, valueLabel) {
    var body = items.map(function (it) {
      return '<tr><td>Without ' + esc(it.dropped) + '</td><td class="num">' + it.loo.toFixed(3) + '</td></tr>';
    }).join('');
    return '<h3>' + title + '</h3><table><thead><tr><th>Term test</th><th class="num">' + valueLabel + '</th></tr></thead><tbody>' + body + '</tbody></table>';
  }
  var wfRows = v.walk_forward.map(function (w) {
    return '<tr><td>' + w.year + '</td><td class="num">' + w.nTrain + '</td><td class="num">' + w.nTest + '</td><td class="num">' + w.multiple.toFixed(2) + '×</td></tr>';
  }).join('');
  document.getElementById('method-body').innerHTML =
    '<div class="method">' +
    '<h3>The size curve</h3>' +
    '<p>The board prices every pre-token protocol off one fitted curve, estimated on ' + c.comps +
    ' traded comps (one row per ticker — ' + c.duplicates_dropped + ' duplicates dropped), then discounts by its odds of ever getting a token:</p>' +
    '<pre>log10(market cap) = ' + c.a.toFixed(4) + ' + ' + c.b.toFixed(4) + ' · log10(TVL)\n' +
    'implied value = fitted market cap × token odds</pre>' +
    '<p>R² ' + c.r2.toFixed(3) + ' · RMSE ' + c.rmse.toFixed(3) + ' · Huber-IRLS robust fit (k = 1.345σ, ' + c.huber_iterations +
    ' iterations), so a few giant market caps cannot drag the line. The flat median multiple is ×' + c.flat_multiple.toFixed(4) + ' of TVL.</p>' +
    '<h3>Term selection — one multiple, chosen by the blind test</h3>' +
    '<p>A four-input multiple (size + category + chains + 7-day growth) was tested alongside the single-factor curve; the single-factor curve won the blind test (leave-one-out RMSE ' +
    c.loo_rmse.toFixed(3) + ' vs ' + v.multi_loo.toFixed(3) + '), so the board keeps it. The per-term tests below show the same story: every added term costs accuracy out of sample.</p>' +
    ablateTable('Curve terms — leave-one-out RMSE (lower is better)', v.multi_ablation, 'LOO RMSE') +
    '<p>Full four-input fit: R² ' + v.multi_r2.toFixed(3) + ' in sample, LOO ' + v.multi_loo.toFixed(3) + ' — better in sample, worse blind.</p>' +
    '<h3>Validation</h3>' +
    '<p>Leave-one-out: the curve beats the flat median multiple ' + c.loo_multiple.toFixed(2) + '× (RMSE ' + c.loo_rmse.toFixed(3) + ' vs ' + c.flat_rmse.toFixed(3) + '). ' +
    'Time-split holdout (fit before ' + v.holdout_cutoff + ', n=' + v.holdout_n_fit + '; test after, n=' + v.holdout_n_test + '): R² ' + v.holdout_r2.toFixed(3) +
    ' — the relation does not collapse on newer listings. Accuracy: ' + Math.round(v.within3_loo * 1000) / 10 + '% of comps land within 3× of the fitted value out of sample (leave-one-out), ' +
    Math.round(v.within2_loo * 1000) / 10 + '% within 2×.</p>' +
    '<table><thead><tr><th>Walk-forward by listing year</th><th class="num">Train</th><th class="num">Test</th><th class="num">vs flat</th></tr></thead><tbody>' + wfRows +
    '</tbody></table><p>Pooled walk-forward: ' + v.walk_forward_pooled.toFixed(2) + '× better than flat.</p>' +
    '<p>Bootstrap (B=200, seed 20261124): slope 90% [' + v.bootstrap_slope_low.toFixed(3) + ', ' + v.bootstrap_slope_high.toFixed(3) +
    '], intercept 90% [' + v.bootstrap_intercept_low.toFixed(3) + ', ' + v.bootstrap_intercept_high.toFixed(3) + ']. Every row carries its own 90% band from the same refits.</p>' +
    '<h3>Token odds</h3>' +
    '<p>Logistic model on ' + v.odds_n + ' protocols (' + v.odds_positives + ' with a token): age (OR ' + v.odds_age_or.toFixed(2) + ' per year), size (OR ' + v.odds_tvl_or.toFixed(2) +
    ' per log10 TVL), 7-day growth (OR ' + v.odds_7d_or_per_10pts.toFixed(2) + ' per 10 points). AUC ' + v.odds_auc.toFixed(3) + '. ' +
    '7-day growth is winsorized to −50%…+100% before it enters the model, so one explosive week cannot zero out a protocol\'s odds. Dropping age costs the most (AUC ' +
    v.odds_ablation[0].auc.toFixed(3) + ' without it); dropping size or 7-day growth barely moves it.</p>' +
    '<h3>Live self-audit (computed in this page)</h3><p id="audit-list"></p>' +
    '</div>';

  // ---- census ----
  document.getElementById('census-body').innerHTML = D.census.map(function (b) {
    return '<tr><td>' + esc(b.label) + '</td><td class="num">' + b.count + '</td><td>' + esc(b.examples.join(', ') || '—') + '</td></tr>';
  }).join('');
  var censusTotal = D.census.reduce(function (s, b) { return s + b.count; }, 0);
  document.getElementById('census-note').textContent =
    'Buckets sum to ' + censusTotal + ' — every protocol in the snapshot is in exactly one bucket.';

  // ---- research note ----
  var top = rows[0];
  document.getElementById('research-body').innerHTML =
    '<div class="method"><p><b>Answer in one line.</b> Price a pre-token protocol off the fitted size curve, then discount by its odds of ever getting a token. ' +
    'The top of the board is ' + esc(top.name) + ' at ' + usd(top.implied_value_usd) + ' — ' + usd(top.tvl_usd) + ' of TVL, ' +
    'odds ' + top.odds.toFixed(2) + ', ' + esc(top.category || 'uncategorized') + ' on ' + esc(top.chains.join(', ')) + '.</p>' +
    '<p>How to read the board: the rank is the claim. Implied value is the fitted market cap of a token that priced like the traded comps, times the protocol\'s odds of ever issuing one. ' +
    'The 90% band is the curve\'s own uncertainty from 200 bootstrap refits. The farm plan under each row is the concrete way in — deposit size, weekly action, exit trigger, gas — and the net expected value is the implied value minus the gas the plan costs.</p>' +
    '<p>What the data supports: the size curve beats the flat median multiple ' + c.loo_multiple.toFixed(2) + '× out of sample, the odds model separates tokens from no-tokens at AUC ' +
    v.odds_auc.toFixed(3) + ', and the walk-forward test holds at ' + v.walk_forward_pooled.toFixed(2) + '×. The curve is a useful anchor, not a price forecast — the full validation is in Methodology.</p></div>';

  // ---- live tokens ----
  document.getElementById('live-note').textContent =
    D.live_tokens.length + ' traded protocols, one row per ticker, sorted by market cap. These are the comps the size curve is fitted on.';
  document.getElementById('live-body').innerHTML = D.live_tokens.map(function (t) {
    return '<tr><td class="proto">' + esc(t.name) + '</td><td>' + esc(t.symbol) + '</td><td class="cat">' + esc(t.category || '—') + '</td>' +
      '<td class="num">' + usd(t.tvl_usd) + '</td><td class="num">' + usd(t.mcap_usd) + '</td><td class="num">×' + t.multiple.toFixed(2) + '</td></tr>';
  }).join('');

  // ---- live self-audit: 11 checks, computed in this page ----
  var checks = [];
  checks.push(['watchlist covered', rows.filter(function (r) { return r.scope === 'Watchlist'; }).length === D.meta.watchlist]);
  var rankSet = new Set(rows.map(function (r) { return r.rank; }));
  checks.push(['ranks 1..N exactly once', rankSet.size === rows.length && rows.every(function (r, i) { return r.rank === i + 1; })]);
  checks.push(['sorted by implied value', rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd; })]);
  checks.push(['all implied values positive', rows.every(function (r) { return r.implied_value_usd > 0; })]);
  checks.push(['values not all equal', new Set(rows.map(function (r) { return r.implied_value_usd; })).size > 1]);
  checks.push(['farm steps 3..12, 20..600 chars', rows.every(function (r) {
    return r.farm_steps.length >= 3 && r.farm_steps.length <= 12 &&
      r.farm_steps.every(function (s) { return s.trim().length >= 20 && s.trim().length <= 600; });
  })]);
  checks.push(['odds in (0,1)', rows.every(function (r) { return r.odds > 0 && r.odds < 1; })]);
  checks.push(['bootstrap band holds the estimate', rows.every(function (r) { return r.band_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.band_high_usd; })]);
  checks.push(['page recomputes every row', mismatches === 0]);
  checks.push(['census sums to the snapshot', censusTotal === D.meta.protocols]);
  checks.push(['ranked count matches the board', rows.length === D.meta.rows]);
  var passed = checks.filter(function (c) { return c[1]; }).length;
  document.getElementById('audit-line').textContent =
    'Live self-audit: ' + passed + '/' + checks.length + ' checks pass — see Methodology for the list.';
  var auditList = document.getElementById('audit-list');
  if (auditList) {
    auditList.textContent = checks.map(function (c) { return (c[1] ? '✓ ' : '✗ ') + c[0]; }).join(' · ');
  }

  // ---- initial render + hash routes ----
  renderBoard();
  renderDetail(rows[0]);
  function applyHash() {
    var hash = window.location.hash || '';
    if (hash.indexOf('#detail/') === 0) {
      openDetail(decodeURIComponent(hash.slice(8)));
    } else if (hash.indexOf('#filter=watchlist') === 0) {
      scopeFilter = 'Watchlist';
      document.querySelectorAll('#scope-filter button').forEach(function (b) {
        b.classList.toggle('active', b.dataset.scope === 'Watchlist');
      });
      renderBoard();
      showTab('board');
    } else if (hash.indexOf('#tab=') === 0) {
      showTab(hash.slice(5));
    }
  }
  applyHash();
  window.addEventListener('hashchange', applyHash);
})();
