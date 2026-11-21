/* Token Radar dashboard: board, detail view, live-token view and methodology.
   Reads window.RADAR from ../data.js (written by main.ts from the same board.json the
   gate reads). No fetch, no network, no framework. State lives in the URL query so a
   board, a detail view and a filtered view are each a link: ?detail=<slug>,
   ?scope=watchlist, ?cat=Lending, ?q=<text>, ?sort=value|tvl|growth|age|name. */
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.getElementById('content').innerHTML = '<p class="empty">No radar data found (data.js missing).</p>'; return; }

  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(window.location.search);
  var state = {
    view: params.get('view') || 'board',
    detail: params.get('detail') || '',
    q: params.get('q') || '',
    cat: params.get('cat') || '',
    chain: params.get('chain') || '',
    scope: params.get('scope') || 'all',
    sort: params.get('sort') || 'value'
  };

  function money(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageText(n) { return n === null || n === undefined ? 'unknown' : n >= 365 ? (n / 365).toFixed(1) + ' yrs' : n + ' days'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function chainList(chains) { return chains.length ? esc(chains.slice(0, 3).join(', ')) + (chains.length > 3 ? ' +' + (chains.length - 3) : '') : '—'; }

  function setParam(key, value) {
    var p = new URLSearchParams(window.location.search);
    if (value) p.set(key, value); else p.delete(key);
    window.history.replaceState(null, '', window.location.pathname + (p.toString() ? '?' + p.toString() : ''));
  }

  /* ---------------------------------------------------------- header/stats */
  $('asof').textContent = D.as_of;
  $('modelver').textContent = D.model_version;
  var top = D.rows[0];
  $('stats').innerHTML =
    stat(money(D.total_implied_usd), 'total implied value, board') +
    stat(D.board_size, 'pre-token protocols ranked') +
    stat(D.watchlist_size + ' / ' + D.watchlist_size, 'watchlist covered') +
    stat(D.early_size, 'early finds below the $50M floor') +
    stat(top ? esc(top.name) : '—', 'rank 1 · ' + (top ? money(top.implied_value_usd) : ''));
  function stat(b, label) { return '<div class="stat"><b>' + b + '</b><span>' + label + '</span></div>'; }

  /* ------------------------------------------------------------- controls */
  var cats = [...new Set(D.rows.map(function (r) { return r.category; }).filter(Boolean))].sort();
  var chains = [...new Set(D.rows.flatMap(function (r) { return r.chains; }))].sort();
  function options(list, current, allLabel) {
    return '<option value="">' + allLabel + '</option>' + list.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }
  function renderControls() {
    $('controls').innerHTML =
      '<label>Search<input type="search" id="f-q" placeholder="Name or slug…" value="' + esc(state.q) + '"></label>' +
      '<label>Category<select id="f-cat">' + options(cats, state.cat, 'All categories') + '</select></label>' +
      '<label>Chain<select id="f-chain">' + options(chains, state.chain, 'All chains') + '</select></label>' +
      '<label>Sort<select id="f-sort">' +
        '<option value="value"' + (state.sort === 'value' ? ' selected' : '') + '>Implied value</option>' +
        '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
        '<option value="growth"' + (state.sort === 'growth' ? ' selected' : '') + '>7-day growth</option>' +
        '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Age</option>' +
        '<option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>Name A–Z</option>' +
      '</select></label>' +
      '<label>Scope<span class="seg" role="group" aria-label="Scope">' +
        '<button type="button" data-scope="all"' + (state.scope === 'all' ? ' class="active"' : '') + '>All</button>' +
        '<button type="button" data-scope="watchlist"' + (state.scope === 'watchlist' ? ' class="active"' : '') + '>Watchlist</button>' +
        '<button type="button" data-scope="early"' + (state.scope === 'early' ? ' class="active"' : '') + '>Early finds</button>' +
      '</span></label>' +
      '<span class="count" id="f-count"></span>';
    $('f-q').addEventListener('input', function (e) { state.q = e.target.value; state.detail = ''; setParam('q', state.q); setParam('detail', ''); render(); });
    $('f-cat').addEventListener('change', function (e) { state.cat = e.target.value; setParam('cat', state.cat); render(); });
    $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; setParam('chain', state.chain); render(); });
    $('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; setParam('sort', state.sort); render(); });
    document.querySelectorAll('[data-scope]').forEach(function (b) {
      b.addEventListener('click', function () { state.scope = b.getAttribute('data-scope'); setParam('scope', state.scope === 'all' ? '' : state.scope); render(); });
    });
  }

  /* ---------------------------------------------------------------- board */
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.on_watchlist) return false;
      if (state.scope === 'early' && r.on_watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      return true;
    });
    var sorts = {
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      name: function (a, b) { return a.name.localeCompare(b.name); }
    };
    return rows.sort(sorts[state.sort] || sorts.value);
  }

  function renderBoard() {
    var rows = filteredRows();
    $('f-count').textContent = rows.length + ' of ' + D.board_size + ' protocols';
    if (!rows.length) { $('content').innerHTML = '<p class="empty">No protocol matches these filters. Clear the search or widen the scope.</p>'; return; }
    var html = '<table class="board"><thead><tr><th class="num">#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">Implied value</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="num rank">' + r.rank + '</td>' +
        '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + '</span>' +
        (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + chainList(r.chains) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td></tr>';
    });
    $('content').innerHTML = html + '</tbody></table>' +
      '<p style="color:var(--faint);font-size:13px">Click any row for its detail view: the model&rsquo;s working, its live-token comparables and its farm plan.</p>';
    document.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') openDetail(tr.getAttribute('data-slug')); });
    });
  }

  /* --------------------------------------------------------------- detail */
  function openDetail(slug) {
    state.detail = slug;
    setParam('detail', slug);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderDetail() {
    var r = D.rows.find(function (x) { return x.slug === state.detail; });
    if (!r) { $('detail').hidden = true; renderBoard(); return; }
    $('content').innerHTML = '';
    var base = r.tvl_usd * r.comp_multiple;
    var maxBar = Math.max.apply(null, D.rows.slice(0, 10).map(function (x) { return x.implied_value_usd; }));
    var compRows = r.comps.length ? r.comps.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td class="num">' + money(c.tvl_usd) + '</td><td class="num">' + money(c.mcap_usd) +
        '</td><td class="num">' + c.ratio.toFixed(3) + '×</td></tr>';
    }).join('') : '<tr><td colspan="4">No live-token protocol in this category — the global median multiple was used.</td></tr>';
    $('detail').hidden = false;
    $('detail').innerHTML =
      '<article class="detail"><button class="back" id="back" type="button">&larr; Back to the board</button>' +
      '<h2>#' + r.rank + ' ' + esc(r.name) + (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' &middot; ' + esc(r.category || 'Uncategorised') + ' &middot; ' + chainList(r.chains) +
      ' &middot; tracked since ' + (r.listed_at || 'unknown') + ' &middot; records no token (no market cap, no CoinGecko id, no symbol).</p>' +
      '<div class="kv">' +
        '<div><b>' + money(r.implied_value_usd) + '</b><span>implied value</span></div>' +
        '<div><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
        '<div><b>' + pct(r.change_7d).replace(/<[^>]+>/g, '') + '</b><span>TVL change, 7 days</span></div>' +
        '<div><b>' + ageText(r.age_days) + '</b><span>tracked, no token</span></div>' +
      '</div>' +
      '<h3>The model&rsquo;s working</h3>' +
      '<table class="model-table"><thead><tr><th>Step</th><th>Figure</th><th class="num">Value</th></tr></thead><tbody>' +
      '<tr><td>TVL × category multiple</td><td>' + money(r.tvl_usd) + ' × ' + r.comp_multiple.toFixed(3) + '× (' + (r.comp_fallback ? 'global median, ' : '') + r.comp_count + ' live comparables)</td><td class="num">' + money(base) + '</td></tr>' +
      '<tr><td>× growth multiplier</td><td>7d ' + (r.change_7d === null ? 'unreported' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</td><td class="num">' + r.growth_multiplier.toFixed(3) + '×</td></tr>' +
      '<tr><td>× maturity multiplier</td><td>' + ageText(r.age_days) + ' with no token</td><td class="num">' + r.maturity_multiplier.toFixed(3) + '×</td></tr>' +
      '<tr><td>× chain-breadth multiplier</td><td>' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</td><td class="num">' + r.breadth_multiplier.toFixed(3) + '×</td></tr>' +
      '<tr><td><strong>Implied value</strong></td><td><span class="bar"><i style="width:' + Math.max(4, Math.round(100 * r.implied_value_usd / maxBar)) + '%"></i></span></td><td class="num"><strong>' + moneyFull(r.implied_value_usd) + '</strong></td></tr>' +
      '</tbody></table>' +
      '<h3>Live-token comparables in ' + esc(r.category || 'this category') + '</h3>' +
      '<table class="comp-table"><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>' + compRows + '</tbody></table>' +
      '<p class="note">The multiple is the median market-cap-to-TVL of the tokens that already trade in this category. ' +
      'If a category has fewer than 3 live tokens, the global median across all live tokens is used instead.</p>' +
      '<h3>Farm plan — six steps</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) {
        var m = s.match(/ Cost: (.*)\. Time: (.*)\.$/);
        var text = m ? s.slice(0, m.index) : s;
        return '<li>' + esc(text) + (m ? '<span class="meta">Cost: <b>' + esc(m[1]) + '</b> &middot; Time: <b>' + esc(m[2]) + '</b></span>' : '') + '</li>';
      }).join('') + '</ol>' +
      '<p class="note">This plan assumes a token may be issued; it does not predict that one will be. ' +
      'Only farm with funds you can afford to leave in the position, and only claim from links the protocol itself publishes.</p>' +
      '</article>';
    $('back').addEventListener('click', function () { state.detail = ''; setParam('detail', ''); render(); });
  }

  /* ----------------------------------------------------------------- live */
  function renderLive() {
    var rows = D.live.map(function (p) {
      return '<tr><td class="name"><b>' + esc(p.name) + '</b><span>' + esc(p.slug) + '</span></td><td>' + esc(p.category || '—') + '</td>' +
        '<td>' + chainList(p.chains) + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">' + pct(p.change_7d) + '</td></tr>';
    }).join('');
    $('content').innerHTML =
      '<p class="note" style="margin:0 0 14px">These protocols already have a token that trades, so the board does not rank them. ' +
      'Their market caps are the market&rsquo;s own values — and the comparables the pre-token board is priced off.</p>' +
      '<table class="board"><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' +
      rows + '</tbody></table>';
  }

  /* --------------------------------------------------------------- method */
  function renderMethod() {
    var compRows = D.category_comps.filter(function (c) { return c.count > 0; }).map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.count + '</td><td class="num">' + c.median_ratio.toFixed(3) + '×</td><td class="num">' + c.multiple.toFixed(3) + '×</td><td>' + (c.fallback ? 'global median' : 'category median') + '</td></tr>';
    }).join('');
    $('content').innerHTML =
      '<article class="detail method"><h2>How the model works</h2>' +
      '<p class="sub">Model ' + esc(D.model_version) + ' · snapshot ' + esc(D.as_of) + ' · floor $' + D.floor_usd.toLocaleString('en-US') + '</p>' +
      '<h3>The idea</h3><p>A token launch is priced the way a market prices one: against the tokens that already trade. ' +
      'For each category, take every live-token protocol&rsquo;s market-cap-to-TVL ratio and use the median as the category&rsquo;s multiple. ' +
      'A pre-token protocol&rsquo;s implied value is its TVL times that multiple, adjusted for growth, for how long it has run with no token, and for how many chains it runs on.</p>' +
      '<p class="formula">comp = median(mcap / TVL) over live tokens in the category (min 3, else global median), clamped [0.05, 1.00]<br>' +
      'implied = TVL × comp × (1 + clamp(7d%, −50, 100) / 100 × 0.6) × (0.7 + min(age, 1095) / 1095 × 0.3) × (1 + 0.03 × min(chains − 1, 5))</p>' +
      '<h3>Who gets ranked</h3><p>Every protocol that records no token (no market cap, no CoinGecko id, no symbol) and is not a wrapped, staked or bridged product: ' +
      'not a Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX protocol, no versioned name (V2, 2.0…), no whole word &ldquo;wrapped&rdquo;, &ldquo;staked&rdquo; or &ldquo;staking&rdquo; in its name, and not named after an exchange. ' +
      'That is the same rule the house used for its 40-protocol watchlist, replayed on the ten fields the snapshot carries — the snapshot has no parent-protocol field, so the watchlist itself is read from the file, not re-derived. ' +
      'The board holds all ' + D.board_size + ' protocols that pass: the ' + D.watchlist_size + ' on the watchlist plus ' + D.early_size + ' early finds below the $50M floor.</p>' +
      '<h3>Category multiples</h3>' +
      '<table class="comp-table"><thead><tr><th>Category</th><th class="num">Live tokens</th><th class="num">Median mcap/TVL</th><th class="num">Multiple used</th><th>Source</th></tr></thead><tbody>' + compRows + '</tbody></table>' +
      '<h3>What this is not</h3><p>The board does not predict whether or when a token is issued. Implied value is a valuation <em>if</em> a token launched and traded like its category peers, on the snapshot&rsquo;s figures as they stand. ' +
      'A protocol that &ldquo;records no token&rdquo; may still have one its DefiLlama record does not carry. Farm plans are generic steps derived from each protocol&rsquo;s category, chains, TVL and age — not investment advice.</p>' +
      '</article>';
  }

  /* ---------------------------------------------------------------- render */
  function render() {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === state.view); });
    var inDetail = !!state.detail;
    $('controls').style.display = state.view === 'board' && !inDetail ? '' : 'none';
    $('stats').style.display = state.view === 'board' && !inDetail ? '' : 'none';
    if (inDetail) { $('detail').hidden = false; renderDetail(); return; }
    $('detail').hidden = true;
    if (state.view === 'live') renderLive();
    else if (state.view === 'method') renderMethod();
    else renderBoard();
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      state.view = t.getAttribute('data-view'); state.detail = '';
      setParam('view', state.view === 'board' ? '' : state.view); setParam('detail', '');
      render();
    });
  });
  renderControls();
  render();
})();
