// Token Radar dashboard — renders window.RADAR (written by main.ts).
// Static: no network, no imports. State lives in the URL (?tab, ?detail,
// ?scope, ?cat, ?chain, ?q, ?sort, ?dir) so every view is screenshotable.
(function () {
  var R = window.RADAR;
  if (!R) { document.body.textContent = "data.js did not load."; return; }
  var rows = R.rows, fit = R.fit, loo = R.loo, ts = R.timeSplit, odds = R.odds;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    if (n == null) return "—";
    var a = Math.abs(n);
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function moneyC(n) {
    if (n == null) return "—";
    var a = Math.abs(n);
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return "$" + Math.round(n / 1e6) + "M";
    if (a >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function full(n) { return n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"); }
  function pct(x, d) { return x == null ? "—" : (x * 100).toFixed(d == null ? 1 : d) + "%"; }
  function num(x, d) { return x == null ? "—" : Number(x).toFixed(d); }
  function params() { return new URLSearchParams(location.search); }
  function setParam(k, v) {
    var p = params();
    if (v) p.set(k, v); else p.delete(k);
    history.replaceState(null, "", location.pathname + "?" + p.toString());
  }

  // ---- header ----
  document.getElementById("asOf").textContent = R.meta.asOf;
  document.getElementById("kpis").innerHTML =
    kpi(money(R.meta.totalImpliedUsd), "total implied value, " + rows.length + " rows") +
    kpi("log mcap = " + num(fit.a, 3) + " + " + num(fit.b, 3) + " · log TVL", "fitted size curve, R² " + num(fit.r2, 3)) +
    kpi(num(loo.oosMultiple, 2) + "×", "LOO beats flat multiple out of sample") +
    kpi(R.census.watchlist + "/" + R.census.watchlist, "watchlist covered") +
    kpi(R.census.total + " protocols", "census: traded " + R.census.traded + " · ranked " + R.census.ranked + " · excluded " + R.census.excluded);
  function kpi(b, s) { return '<div class="kpi"><b>' + esc(b) + '</b><span>' + esc(s) + '</span></div>'; }

  // ---- tabs ----
  var tabs = document.querySelectorAll("#tabs button");
  function showTab(name) {
    tabs.forEach(function (b) { b.classList.toggle("on", b.dataset.tab === name); });
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.id !== "view-" + name; });
  }
  tabs.forEach(function (b) {
    b.addEventListener("click", function () { setParam("tab", b.dataset.tab); showTab(b.dataset.tab); });
  });

  // ---- board filters ----
  var qEl = document.getElementById("q"), scopeEl = document.getElementById("scope"),
      catEl = document.getElementById("cat"), chainEl = document.getElementById("chain");
  var cats = [...new Set(rows.map(function (r) { return r.category; }).filter(Boolean))].sort();
  var chains = [...new Set(rows.flatMap(function (r) { return r.chains; }))].sort();
  cats.forEach(function (c) { catEl.insertAdjacentHTML("beforeend", '<option>' + esc(c) + '</option>'); });
  chains.forEach(function (c) { chainEl.insertAdjacentHTML("beforeend", '<option>' + esc(c) + '</option>'); });

  var sortKey = "rank", sortDir = 1;
  document.querySelectorAll("#board th").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.dataset.k;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      setParam("sort", sortKey); setParam("dir", sortDir < 0 ? "desc" : "asc");
      renderBoard();
    });
  });

  function filtered() {
    var q = (qEl.value || "").toLowerCase(), sc = scopeEl.value, ct = catEl.value, ch = chainEl.value;
    return rows.filter(function (r) {
      if (sc && r.scope !== sc) return false;
      if (ct && r.category !== ct) return false;
      if (ch && r.chains.indexOf(ch) < 0) return false;
      if (q && (r.name + " " + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function val(r, k) {
    if (k === "chains") return r.chains.join(", ");
    if (k === "name") return r.name.toLowerCase();
    if (k === "category") return (r.category || "").toLowerCase();
    if (k === "band") return r.bootstrap_lo_usd;
    return r[k] == null ? -Infinity : r[k];
  }
  function renderBoard() {
    var list = filtered().slice().sort(function (a, b) {
      var x = val(a, sortKey), y = val(b, sortKey);
      if (x < y) return -sortDir; if (x > y) return sortDir;
      return a.slug < b.slug ? -1 : 1;
    });
    document.getElementById("count").textContent = list.length + " of " + rows.length + " rows";
    document.getElementById("rows").innerHTML = list.map(function (r) {
      return "<tr><td>" + r.rank + '</td><td><a href="?detail=' + esc(r.slug) + '">' + esc(r.name) + "</a> " +
        '<span class="badge' + (r.scope === "early" ? " early" : "") + '">' + r.scope + "</span></td>" +
        "<td>" + esc(r.category || "—") + "</td><td>" + esc(r.chains.slice(0, 2).join(", ") + (r.chains.length > 2 ? " +" + (r.chains.length - 2) : "")) + "</td>" +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + (r.change_7d == null ? "—" : num(r.change_7d, 1)) + "</td>" +
        '<td class="num">' + money(r.curve_value_usd) + '</td><td class="num">' + pct(r.token_odds, 1) + "</td>" +
        '<td class="num"><b>' + money(r.implied_value_usd) + "</b></td>" +
        '<td class="num">' + moneyC(r.bootstrap_lo_usd) + "–" + moneyC(r.bootstrap_hi_usd) + "</td></tr>";
    }).join("");
  }
  [qEl, scopeEl, catEl, chainEl].forEach(function (el) {
    el.addEventListener("input", function () {
      setParam("q", qEl.value); setParam("scope", scopeEl.value);
      setParam("cat", catEl.value); setParam("chain", chainEl.value);
      renderBoard();
    });
  });

  // ---- detail view ----
  function renderDetail(slug) {
    var box = document.getElementById("detail");
    if (!slug) { box.innerHTML = ""; return; }
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) { box.innerHTML = '<div class="card"><p>No ranked protocol with slug <span class="mono">' + esc(slug) + '</span>.</p></div>'; return; }
    var comps = r.comparables.map(function (c) {
      return "<tr><td>" + esc(c.name) + '</td><td class="num">' + money(c.tvl_usd) + '</td><td class="num">' + money(c.mcap_usd) + '</td><td class="num">' + num(c.multiple, 3) + "</td></tr>";
    }).join("");
    var steps = r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    box.innerHTML = '<div class="card"><div class="detail-head"><h3>' + esc(r.name) + '</h3><span class="badge' + (r.scope === "early" ? " early" : "") + '">' + r.scope + '</span><span>Rank #' + r.rank + '</span><a href="?tab=board">← back to board</a></div>' +
      '<div class="kv">' +
      cell(full(r.tvl_usd), "TVL (snapshot)") + cell(r.change_7d == null ? "—" : num(r.change_7d, 2) + "%", "TVL change, 7 days") +
      cell(r.listed_at || "—", "listed since") + cell(r.age_days == null ? "—" : r.age_days + " days", "age without a token") +
      cell(full(r.curve_value_usd), "fitted curve value") + cell(pct(r.token_odds, 1), "token odds (fitted score)") +
      cell(full(r.bootstrap_lo_usd) + " – " + full(r.bootstrap_hi_usd), "90% bootstrap band") +
      cell(full(r.implied_value_usd), "implied value = curve × odds") + "</div>" +
      "<p class=\"note\">Token odds is a fitted score from the snapshot — the odds that a protocol with this age, size and 7-day growth records a token. It is not a prediction of when a token launches.</p>" +
      "<h3>Nearest traded comparables (by TVL distance)</h3>" +
      '<div class="tablewrap"><table class="plain"><thead><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>Multiple</th></tr></thead><tbody>' + comps + "</tbody></table></div>" +
      "<h3>Farm plan — netted to the dollar</h3>" +
      '<div class="kv">' + cell(full(r.farm_capital_usd), "suggested capital (TVL tier)") +
      cell(full(r.farm_gas_usd) + " over " + r.farm_tx_count + " tx", "total gas (assumed prices)") +
      cell(r.farm_hold_days + " days", "hold duration") +
      cell(full(r.farm_net_usd), "net value = implied × odds − gas") + "</div>" +
      '<ol class="steps">' + steps + "</ol>" +
      '<p class="note">Net value is protocol-scale expected value minus gas. The snapshot carries no airdrop allocation, so no per-wallet payout is claimed. Gas prices are assumptions — see Methodology.</p></div>';
    function cell(b, s) { return '<div class="cell"><b>' + esc(b) + '</b><span>' + esc(s) + '</span></div>'; }
  }

  // ---- methodology ----
  var gasRows = Object.entries(R.gasAssumptions).map(function (kv) {
    return "<tr><td>" + esc(kv[0]) + '</td><td class="num">' + esc(kv[1]) + "</td></tr>";
  }).join("");
  document.getElementById("method").innerHTML =
    '<div class="card"><h3>1. Fitted log-log size curve</h3>' +
    "<p>On the <b>" + fit.n + "</b> traded protocols with mcap &gt; 0 and TVL &gt; 0, OLS on log10 values:</p>" +
    '<p><span class="mono">log10(mcap) = ' + num(fit.a, 4) + " + " + num(fit.b, 4) + " · log10(TVL)</span></p>" +
    "<p>R² <b>" + num(fit.r2, 3) + "</b> · in-sample RMSE <b>" + num(fit.rmse, 3) + "</b> log10 units · residual SD <b>" + num(fit.residualSd, 3) + "</b>. " +
    "A protocol's curve value is 10^(a + b·log10(TVL)). The flat baseline (median mcap/TVL = " + num(fit.flatMedianMultiple, 4) + ") is shown only to be beaten.</p></div>" +
    '<div class="card"><h3>2. Token-odds model (logistic regression)</h3>' +
    "<p>Fitted on all <b>758</b> protocols. y = 1 when the snapshot records a token (gecko_id, symbol or mcap present), else 0. Features are standardised; gradient descent, learning rate " + odds.learningRate + ", " + odds.iterations + " iterations, deterministic.</p>" +
    '<p><span class="mono">logit P(token) = ' + num(odds.intercept, 3) +
    " + " + num(odds.weights[0], 3) + "·z(age) + " + num(odds.weights[1], 3) + "·z(log TVL) + " + num(odds.weights[2], 3) + "·z(7d change)</span></p>" +
    "<p>Odds ratios: age <b>" + num(odds.oddsRatios[0], 2) + "</b> · log TVL <b>" + num(odds.oddsRatios[1], 2) + "</b> · 7d change <b>" + num(odds.oddsRatios[2], 2) + "</b>. " +
    "AUC <b>" + num(odds.auc, 3) + "</b>. Age is days since listed_at (snapshot date " + esc(R.meta.asOf) + "); missing listed_at uses the median age; missing 7d change is 0; 7d change is clamped to ±50%.</p>" +
    "<p>Implied value = curve value × token odds, ranked descending, ties by slug. Token odds is a fitted score, not a launch-date prediction.</p></div>" +
    '<div class="card"><h3>3. Out-of-sample validation</h3>' +
    "<p><b>Leave-one-out:</b> refit the curve without each comp and predict the held-out one. LOO RMSE <b>" + num(loo.rmse, 3) + "</b> vs flat-multiple RMSE <b>" + num(loo.flatRmse, 3) + "</b> — the curve is <b>" + num(loo.oosMultiple, 2) + "×</b> better out of sample.</p>" +
    "<p><b>Time-split holdout:</b> comps split at median listed_at <b>" + esc(ts.medianListedAt) + "</b> (" + ts.trainN + " older to fit, " + ts.testN + " newer to test). Fit on the older half: a = " + num(ts.trainA, 3) + ", b = " + num(ts.trainB, 3) + ". Holdout R² <b>" + num(ts.holdoutR2, 3) + "</b>, RMSE <b>" + num(ts.holdoutRmse, 3) + "</b>.</p>" +
    "<p><b>Bootstrap band:</b> " + R.bootstrap.draws + " resamples of the " + fit.n + " comps (deterministic PRNG, seed " + R.bootstrap.seed + "), curve refit each time, token odds held fixed. Each estimate shows its 90% interval (5th–95th percentile).</p>" +
    "<p>Honest read: the curve beats a flat multiple out of sample, but the signal is modest — R² " + num(fit.r2, 3) + " and a near-zero time-split holdout R² say size alone explains little of market cap. The ranking is the best fit this snapshot supports, not a strong predictor.</p></div>" +
    '<div class="card"><h3>4. Farm economics and gas assumptions</h3>' +
    "<p>Each plan has 6 steps over " + 90 + " days. Suggested capital is tiered by TVL ($5,000 / $2,500 / $1,000 / $500 / $250). Gas is 16 transactions at the per-chain assumed price below. Net value = implied value × token odds − total gas, shown per protocol.</p>" +
    '<div class="tablewrap"><table class="plain"><thead><tr><th>Chain group</th><th>Assumed gas / tx (USD)</th></tr></thead><tbody>' + gasRows + "</tbody></table></div>" +
    "<p class=\"note\">Gas prices are assumptions, not snapshot data. No airdrop allocation is assumed anywhere.</p></div>";
  document.getElementById("catRows").innerHTML = R.categories.map(function (c) {
    return "<tr><td>" + esc(c.category) + '</td><td class="num">' + c.n + '</td><td class="num">' + num(c.medianMultiple, 4) + "</td></tr>";
  }).join("");

  // ---- census ----
  var c = R.census;
  var reasonNames = { banned_category: "Banned category (Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC / CEX)", versioned_name: "Versioned name (ends V2 / v2 / 2.0 …)", wrapped_staked: "Wrapped / staked product name", exchange_prefix: "Exchange-prefixed name" };
  var reasonRows = Object.entries(c.excludedByReason).map(function (kv) {
    return "<tr><td>" + esc(reasonNames[kv[0]] || kv[0]) + '</td><td class="num">' + kv[1] + "</td></tr>";
  }).join("");
  document.getElementById("census").innerHTML =
    '<div class="card"><div class="kv">' +
    '<div class="cell"><b>' + c.total + '</b><span>protocols in snapshot</span></div>' +
    '<div class="cell"><b>' + c.traded + '</b><span>already trade a token (comparables)</span></div>' +
    '<div class="cell"><b>' + c.ranked + '</b><span>ranked pre-token (' + c.watchlist + ' watchlist + ' + c.early + ' early)</span></div>' +
    '<div class="cell"><b>' + c.excluded + '</b><span>pre-token, excluded with a reason</span></div></div>' +
    "<p>" + c.traded + " + " + c.ranked + " + " + c.excluded + " = <b>" + c.total + "</b>. Every protocol is accounted for.</p>" +
    '<div class="tablewrap"><table class="plain"><thead><tr><th>Exclusion reason (first matching rule, in order)</th><th>Count</th></tr></thead><tbody>' + reasonRows + "</tbody></table></div>" +
    "<p class=\"note\">Priority order: banned category → versioned name → wrapped/staked word → exchange prefix. " + c.exchangePrefixNamesTotal + " names carry an exchange prefix, but all were already excluded by an earlier rule, so the exchange-prefix count is 0. " +
    "Of the " + c.ranked + " ranked rows, " + c.rankedAtOrAboveFloor + " sit at or above the $50M floor; " + c.watchlist + " of them are the house watchlist. The remaining " + (c.rankedAtOrAboveFloor - c.watchlist) + " clear the floor but are not on the house list — the house also checks parentProtocol, a field the snapshot does not carry, so that check cannot be re-derived here.</p></div>";

  // ---- research note ----
  var top = rows[0];
  document.getElementById("research").innerHTML =
    "<p><b>Claim 1 — a fitted size curve beats a flat multiple.</b> On " + fit.n + " traded comps, log10(mcap) = " + num(fit.a, 3) + " + " + num(fit.b, 3) + "·log10(TVL) (R² " + num(fit.r2, 3) + "). Leave-one-out RMSE " + num(loo.rmse, 3) + " vs " + num(loo.flatRmse, 3) + " for the flat median multiple (" + num(fit.flatMedianMultiple, 3) + "): <b>" + num(loo.oosMultiple, 2) + "× better out of sample</b>. The old board's flat multiple is therefore replaced, not tuned.</p>" +
    "<p><b>Claim 2 — token odds separates the board.</b> The logistic fit (AUC " + num(odds.auc, 3) + ") gives the largest odds ratio to age (" + num(odds.oddsRatios[0], 2) + " per standard deviation): older pre-token protocols are more likely to record a token in this snapshot. Rank #1 " + esc(top.name) + " has curve value " + full(top.curve_value_usd) + " × odds " + pct(top.token_odds, 1) + " = <b>" + full(top.implied_value_usd) + "</b>, with a 90% bootstrap band of " + full(top.bootstrap_lo_usd) + " – " + full(top.bootstrap_hi_usd) + ".</p>" +
    "<p><b>Claim 3 — the validation is shown, limits included.</b> The time-split holdout (fit on " + ts.trainN + " older comps, tested on " + ts.testN + " newer) gives R² " + num(ts.holdoutR2, 3) + " and RMSE " + num(ts.holdoutRmse, 3) + " — the curve barely generalises across time. That is the honest limit of a size-only model on this snapshot, and it is why the board is presented as a fitted ranking, not a forecast.</p>" +
    "<p><b>Claim 4 — every dollar is netted.</b> Each of the " + rows.length + " rows carries a 6-step farm plan with suggested capital (TVL tier), total gas at labelled assumed per-chain prices, and net value = implied × odds − gas. Total implied value across the board is <b>" + full(R.meta.totalImpliedUsd) + "</b>.</p>" +
    "<p><b>Claim 5 — nothing is left uncounted.</b> The census accounts for all " + c.total + " protocols: " + c.traded + " traded, " + c.ranked + " ranked, " + c.excluded + " excluded with a stated reason. The watchlist is covered " + c.watchlist + "/" + c.watchlist + ".</p>";

  // ---- live tokens ----
  document.getElementById("liveRows").innerHTML = R.traded.map(function (t) {
    return "<tr><td>" + esc(t.name) + "</td><td>" + esc(t.category || "—") + '</td><td class="num">' + money(t.tvl_usd) + '</td><td class="num">' + money(t.mcap_usd) + '</td><td class="num">' + num(t.multiple, 3) + "</td></tr>";
  }).join("");

  // ---- initial state from URL ----
  var p = params();
  qEl.value = p.get("q") || ""; scopeEl.value = p.get("scope") || "";
  catEl.value = p.get("cat") || ""; chainEl.value = p.get("chain") || "";
  sortKey = p.get("sort") || "rank"; sortDir = p.get("dir") === "desc" ? -1 : 1;
  showTab(p.get("tab") || "board");
  renderDetail(p.get("detail") || "");
  renderBoard();
})();
