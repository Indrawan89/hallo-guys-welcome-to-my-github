// app.js — Token Launch Radar dashboard. Renders window.RADAR (written by
// main.ts into ../data.js). No network, no framework. The page re-derives
// every row's implied value with window.Recompute (dashboard/recompute.js)
// and shows the live self-audit strip from that check.
(function () {
  var D = window.RADAR;
  var rows = D.rows;
  var V = D.validation;

  function $(id) {
    return document.getElementById(id);
  }
  function fmtUsd(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function pct(x, d) {
    return (x * 100).toFixed(d === undefined ? 1 : d) + "%";
  }

  // ---- live self-audit: 10 checks, computed in the page, shown on cover.
  var audit = [];
  function check(name, ok) {
    audit.push({ name: name, ok: !!ok });
  }
  var watchSet = {};
  D.watchlist.forEach(function (s) { watchSet[s] = true; });
  D.watchlistSet = watchSet;
  check("watchlist covered", D.watchlist.every(function (s) {
    return rows.some(function (r) { return r.slug === s; });
  }));
  check("ranks 1..N exactly once", rows.every(function (r, i) { return r.rank === i + 1; }));
  check("sorted by implied value", rows.every(function (r, i) { return i === 0 || rows[i - 1].implied >= r.implied; }));
  check("all implied values positive", rows.every(function (r) { return r.implied > 0; }));
  check("values not all equal", new Set(rows.map(function (r) { return r.implied; })).size > 1);
  check("farm steps 3..12, 20..600 chars", rows.every(function (r) {
    return r.farmSteps.length >= 3 && r.farmSteps.length <= 12 &&
      r.farmSteps.every(function (s) { return s.trim().length >= 20 && s.trim().length <= 600; });
  }));
  check("odds in (0,1)", rows.every(function (r) { return r.odds > 0 && r.odds < 1; }));
  check("bootstrap band holds the estimate", rows.every(function (r) { return r.bandLo <= r.implied && r.implied <= r.bandHi; }));
  var recomputed = 0;
  rows.forEach(function (r) {
    var again = window.Recompute.implied(D.coef, D.oddsCoef, r);
    if (again.implied === r.implied) recomputed += 1;
  });
  check("page recomputes every row", recomputed === rows.length);
  var censusSum = Object.keys(D.census).reduce(function (a, k) { return a + D.census[k]; }, 0);
  check("census sums to the snapshot", censusSum === D.total);
  check("ranked count matches the board", D.census.ranked === rows.length);
  var passed = audit.filter(function (a) { return a.ok; }).length;

  // ---- header / KPIs ----
  $("asof").textContent = "Snapshot " + D.as_of + " · " + rows.length + " ranked rows";
  var kpis = [
    ["Comps (one per ticker)", V.nComps + " (from " + V.dedupBefore + " rows, " + (V.dedupBefore - V.dedupAfter) + " duplicates dropped)"],
    ["Curve R² (Huber)", V.huberR2.toFixed(3)],
    ["LOO RMSE vs flat", V.looRmse.toFixed(3) + " vs " + V.looFlatRmse.toFixed(3) + " (" + V.looMultiple.toFixed(2) + "×)"],
    ["Walk-forward", V.wfMultiple.toFixed(2) + "× vs flat"],
    ["Within-3× (LOO)", pct(V.within3Loo)],
    ["Odds AUC", V.oddsAuc.toFixed(3)],
    ["Holdout R²", V.holdout.r2.toFixed(3)],
  ];
  $("kpis").innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><div class="kpi-v">' + k[1] + "</div><div class=\"kpi-k\">" + k[0] + "</div></div>";
  }).join("");

  $("audit").innerHTML =
    '<span class="audit-score">' + passed + "/" + audit.length + " live self-audit</span> " +
    audit.map(function (a) {
      return '<span class="audit-item ' + (a.ok ? "ok" : "bad") + '">' + (a.ok ? "✓ " : "✗ ") + a.name + "</span>";
    }).join("");

  // ---- board ----
  var state = { sort: "implied", dir: -1, q: "", watchOnly: false, cat: "" };
  function visibleRows() {
    var list = rows.filter(function (r) {
      if (state.watchOnly && !D.watchlistSet[r.slug]) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.q && (r.name + " " + r.slug + " " + (r.category || "")).toLowerCase().indexOf(state.q) < 0) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      var d = key === "implied" ? a.implied - b.implied : key === "tvl" ? a.tvl - b.tvl : a.odds - b.odds;
      return d * state.dir;
    });
    return list;
  }
  function renderBoard() {
    var list = visibleRows();
    $("rowcount").textContent = list.length + " of " + rows.length + " rows";
    $("board").innerHTML = list.map(function (r) {
      return "<tr data-slug=\"" + r.slug + "\"><td>" + r.rank + "</td><td><b>" + r.name + "</b><br><span class=\"dim\">" +
        r.slug + "</span></td><td>" + (r.category || "—") + "</td><td class=\"num\">" + fmtUsd(r.tvl) + "</td><td class=\"num\">" +
        (r.change7d === null ? "—" : r.change7d.toFixed(1) + "%") + "</td><td class=\"num\">" + pct(r.odds) + "</td><td class=\"num\"><b>" +
        fmtUsd(r.implied) + "</b></td><td class=\"num\">" + fmtUsd(r.netExpected) + "</td></tr>";
    }).join("");
    document.querySelectorAll("#board tr").forEach(function (tr) {
      tr.addEventListener("click", function () { showDetail(tr.getAttribute("data-slug")); });
    });
  }
  // Watchlist membership for the filter comes from the snapshot's own
  // watchlist shipped in data.js; the gate verified coverage in main.ts.
  var cats = [];
  rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  $("catfilter").innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
    return '<option value="' + c + '">' + c + "</option>";
  }).join("");

  $("q").addEventListener("input", function (e) { state.q = e.target.value.toLowerCase(); renderBoard(); });
  $("watchonly").addEventListener("change", function (e) { state.watchOnly = e.target.checked; renderBoard(); });
  $("catfilter").addEventListener("change", function (e) { state.cat = e.target.value; renderBoard(); });
  document.querySelectorAll("th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.getAttribute("data-sort");
      if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = -1; }
      renderBoard();
    });
  });

  // ---- detail ----
  function showDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var again = window.Recompute.implied(D.coef, D.oddsCoef, r);
    $("detail").innerHTML =
      "<h2>#" + r.rank + " " + r.name + "</h2>" +
      "<p class=\"dim\">" + r.slug + " · " + (r.category || "no category") + " · " + r.chains.join(", ") +
      " · TVL " + fmtUsd(r.tvl) + " · 7d " + (r.change7d === null ? "—" : r.change7d.toFixed(1) + "%") +
      " · age " + (r.age === null ? "unknown" : r.age.toFixed(1) + "y") + "</p>" +
      "<div class=\"kpis\">" +
      "<div class=\"kpi\"><div class=\"kpi-v\">" + fmtUsd(r.implied) + "</div><div class=\"kpi-k\">implied value</div></div>" +
      "<div class=\"kpi\"><div class=\"kpi-v\">" + fmtUsd(r.curve) + "</div><div class=\"kpi-k\">curve value (before odds)</div></div>" +
      "<div class=\"kpi\"><div class=\"kpi-v\">" + pct(r.odds) + "</div><div class=\"kpi-k\">token odds</div></div>" +
      "<div class=\"kpi\"><div class=\"kpi-v\">" + fmtUsd(r.bandLo) + "–" + fmtUsd(r.bandHi) + "</div><div class=\"kpi-k\">90% bootstrap band</div></div>" +
      "<div class=\"kpi\"><div class=\"kpi-v\">" + fmtUsd(r.netExpected) + "</div><div class=\"kpi-k\">net expected (odds − gas)</div></div>" +
      "<div class=\"kpi\"><div class=\"kpi-v\">" + fmtUsd(r.gas) + " (" + r.gasDrag.toFixed(2) + "%)</div><div class=\"kpi-k\">gas drag</div></div>" +
      "</div>" +
      "<p>Recomputed in this page: " + fmtUsd(again.implied) + " " + (again.implied === r.implied ? "✓ matches" : "✗ MISMATCH") + "</p>" +
      "<p><b>Nearest comps:</b> " + r.nearest.map(function (c) {
        return c.name + " (" + fmtUsd(c.mcap_usd) + " on " + fmtUsd(c.tvl_usd) + " TVL)";
      }).join(" · ") + "</p>" +
      "<h3>Farm plan</h3><ol>" + r.farmSteps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>" +
      "<p><b>Exit trigger:</b> " + r.exitTrigger + "</p>";
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    $("tab-detail").classList.add("active");
    document.querySelectorAll(".pane").forEach(function (p) { p.classList.remove("active"); });
    $("pane-detail").classList.add("active");
  }

  // ---- tabs ----
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      document.querySelectorAll(".pane").forEach(function (p) { p.classList.remove("active"); });
      $(t.getAttribute("data-pane")).classList.add("active");
    });
  });

  // ---- methodology ----
  var coef = D.coef;
  var sel = V.selection;
  $("method").innerHTML =
    "<p><b>Curve (Huber-IRLS robust fit, k = 1.345σ):</b> log10(mcap) = " + coef.intercept.toFixed(4) +
    " + " + coef.logTvl.toFixed(4) + "·log10(TVL). " +
    "Fitted on " + V.nComps + " traded comps (one per ticker). R² " + V.huberR2.toFixed(3) +
    ", RMSE " + V.huberRmse.toFixed(3) + " (OLS R² " + V.olsR2.toFixed(3) + ", flat multiple " +
    V.flatMultiple.toFixed(4) + ", flat RMSE " + V.flatRmse.toFixed(3) + ").</p>" +
    "<h3>Term selection — kept only if the blind test keeps it</h3>" +
    "<p>A multi-factor multiple (size + category + chains + 7-day growth) was fitted too. " +
    "It wins in-sample (R² " + sel.multiR2.toFixed(3) + " vs " + sel.singleR2.toFixed(3) + ") but " +
    "loses out of sample, so its extra terms were dropped:</p>" +
    "<table><tr><th>Model</th><th class=\"num\">LOO RMSE</th><th class=\"num\">Holdout R²</th><th class=\"num\">Walk-forward</th><th class=\"num\">Within-3× (LOO)</th></tr>" +
    "<tr><td><b>Selected: logTVL only</b></td><td class=\"num\">" + sel.singleLooHuberRmse.toFixed(3) +
    "</td><td class=\"num\">" + sel.singleHoldoutR2.toFixed(3) + "</td><td class=\"num\">" + sel.singleWfMultiple.toFixed(2) +
    "×</td><td class=\"num\">" + pct(sel.singleWithin3Loo) + "</td></tr>" +
    "<tr><td>Multi-factor (rejected)</td><td class=\"num\">" + sel.multiLooRmse.toFixed(3) +
    "</td><td class=\"num\">" + sel.multiHoldoutR2.toFixed(3) + "</td><td class=\"num\">" + sel.multiWfMultiple.toFixed(2) +
    "×</td><td class=\"num\">" + pct(sel.multiWithin3Loo) + "</td></tr>" +
    "<tr><td>Flat multiple</td><td class=\"num\">" + V.looFlatRmse.toFixed(3) + "</td><td class=\"num\">—</td><td class=\"num\">1.00×</td><td class=\"num\">—</td></tr></table>" +
    "<p><b>Token odds (logistic):</b> logit = " + D.oddsCoef.intercept.toFixed(3) + " + " +
    D.oddsCoef.age.toFixed(3) + "·age(years) + " + D.oddsCoef.logTvl.toFixed(3) + "·log10(TVL) + " +
    D.oddsCoef.change7d.toFixed(3) + "·(7d/100). AUC " + V.oddsAuc.toFixed(3) + " on " + V.oddsN +
    " protocols (" + V.oddsPos + " with a token). Implied value = 10^curve × odds.</p>" +
    "<h3>Curve ablation (LOO RMSE — lower is better)</h3><table><tr><th>Model</th><th class=\"num\">LOO RMSE</th></tr>" +
    V.ablation.map(function (a) { return "<tr><td>" + a.term + "</td><td class=\"num\">" + a.looRmse.toFixed(3) + "</td></tr>"; }).join("") + "</table>" +
    "<h3>Odds ablation (AUC — higher is better)</h3><table><tr><th>Model</th><th class=\"num\">AUC</th></tr>" +
    V.oddsAblation.map(function (a) { return "<tr><td>" + a.term + "</td><td class=\"num\">" + a.auc.toFixed(3) + "</td></tr>"; }).join("") + "</table>" +
    "<h3>Walk-forward (fit on earlier listings, test that year)</h3><table><tr><th>Year</th><th class=\"num\">train</th><th class=\"num\">test</th><th class=\"num\">RMSE</th><th class=\"num\">flat</th><th class=\"num\">multiple</th></tr>" +
    V.walkForward.map(function (f) {
      return "<tr><td>" + f.year + "</td><td class=\"num\">" + f.nTrain + "</td><td class=\"num\">" + f.nTest +
        "</td><td class=\"num\">" + f.rmse.toFixed(3) + "</td><td class=\"num\">" + f.flatRmse.toFixed(3) +
        "</td><td class=\"num\">" + f.multiple.toFixed(2) + "×</td></tr>";
    }).join("") + "</table>" +
    "<p>Walk-forward pooled: <b>" + V.wfMultiple.toFixed(2) + "× better than a flat multiple</b>. " +
    "Time-split holdout (cutoff " + V.holdout.cutoff + ", fit " + V.holdout.nFit + ", test " + V.holdout.nTest +
    "): R² " + V.holdout.r2.toFixed(3) + ", RMSE " + V.holdout.rmse.toFixed(3) + " vs flat " + V.holdout.flatRmse.toFixed(3) + ".</p>" +
    "<p>Within-3×: " + pct(V.within3) + " in-sample, " + pct(V.within3Loo) + " out-of-sample (LOO). Within-2×: " +
    pct(V.within2) + " / " + pct(V.within2Loo) + ". Bootstrap B=200: slope 90% [" + V.slopeLo.toFixed(3) + ", " +
    V.slopeHi.toFixed(3) + "], intercept 90% [" + V.interceptLo.toFixed(3) + ", " + V.interceptHi.toFixed(3) + "].</p>" +
    "<p><b>Gas assumption (labeled estimate):</b> $12 per transaction on Ethereum, $1.50 elsewhere; four " +
    "transactions per farm plan. Gas drag = gas ÷ implied value. Net expected = implied × odds − gas. " +
    "Age unknown for some protocols: the median age of ranked rows is used and the row shows age unknown.</p>";

  // ---- census ----
  $("census").innerHTML = "<table><tr><th>Bucket</th><th class=\"num\">Protocols</th></tr>" +
    Object.keys(D.census).map(function (k) {
      return "<tr><td>" + k.replace(/_/g, " ") + "</td><td class=\"num\">" + D.census[k] + "</td></tr>";
    }).join("") + "</table><p>Every protocol in the snapshot sits in exactly one bucket.</p>";

  // ---- research note ----
  $("research").innerHTML =
    "<p><b>What the data says.</b> The size curve is real but weak: log-TVL explains about a fifth of " +
    "log-market-cap among traded comps (R² " + V.huberR2.toFixed(3) + "). The selected curve beats a flat multiple " +
    "out of sample by " + V.looMultiple.toFixed(2) + "× (LOO) and " + V.wfMultiple.toFixed(2) + "× (walk-forward), " +
    "but the holdout R² (" + V.holdout.r2.toFixed(3) + ") stays low: most of a token's value is not in TVL. " +
    "A multi-factor multiple (size + category + chains + 7-day growth) was fitted and then dropped: it wins " +
    "in-sample yet loses out of sample (LOO " + sel.multiLooRmse.toFixed(3) + " vs " + sel.singleLooHuberRmse.toFixed(3) +
    "), so the board keeps only the terms the blind test keeps. The odds model separates launchers from " +
    "non-launchers at AUC " + V.oddsAuc.toFixed(3) + "; age is its strongest term.</p>" +
    "<p><b>What did not work.</b> Dropping any single odds term barely moves AUC except age — no one factor " +
    "carries the model, which is why the board shows the ablation tables instead of hiding them. " +
    "The 7-day growth term is small in the curve (it was tested and dropped); it matters more in the odds.</p>" +
    "<p><b>What this board is not.</b> It does not predict whether or when a token launches — the " +
    "snapshot carries no launch dates, so no survival or horizon claim is made. Implied value is " +
    "this entry's own claim from the snapshot's own figures, never a promise. Farm plans are " +
    "estimates: gas is a labeled assumption, and every plan carries an exit trigger.</p>";

  // ---- initial state from the hash (for screenshots) ----
  renderBoard();
  if (location.hash === "#detail") showDetail(rows[0].slug);
  if (location.hash === "#watchlist") {
    state.watchOnly = true;
    $("watchonly").checked = true;
    renderBoard();
  }
})();
