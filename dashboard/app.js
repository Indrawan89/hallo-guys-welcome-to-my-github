// app.js — renders the token radar dashboard from window.TOKEN_RADAR
// (loaded from ../data.js, one level above this page). No network calls,
// no external resources: everything on this page comes from the snapshot
// the entry was built on.

(function () {
  var D = window.TOKEN_RADAR;
  if (!D) {
    document.getElementById("metaLine").textContent = "data.js did not load.";
    return;
  }
  var meta = D.meta;
  var rows = D.rows;
  var live = D.live;

  function usd(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function pct(x, digits) {
    return (x * 100).toFixed(digits == null ? 1 : digits) + "%";
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  // The snapshot source line carries a URL scheme; display it scheme-free.
  function showSource(s) {
    return String(s).replace(/^[a-z]+:\/\//, "");
  }

  // ---- header + KPIs -----------------------------------------------------
  document.getElementById("metaLine").textContent =
    "Snapshot " + meta.as_of + "  ·  " + showSource(meta.source) +
    "  ·  floor " + usd(meta.floor_usd) + "  ·  " + meta.protocols +
    " protocols, " + meta.watchlist + " watchlist";
  var kpis = [
    { k: "Size curve R²", v: meta.curve.r2.toFixed(3), d: "log10(mcap) = " + meta.curve.a.toFixed(3) + " + " + meta.curve.b.toFixed(3) + " · log10(TVL), n = " + meta.curve.n },
    { k: "LOO vs flat multiple", v: meta.loo.ratio.toFixed(2) + "× better", d: "curve RMSE " + meta.loo.rmse.toFixed(3) + " vs flat " + meta.loo.flatRmse.toFixed(3) },
    { k: "Token-odds AUC", v: meta.odds.auc.toFixed(3), d: "age OR " + meta.odds.orAge.toFixed(2) + " · logTVL OR " + meta.odds.orLogTvl.toFixed(2) + " · 7d OR " + meta.odds.orChange.toFixed(2) },
    { k: "Board", v: meta.rows + " rows", d: meta.watchlist + " watchlist + " + (meta.rows - meta.watchlist) + " early finds" },
    { k: "Total implied", v: usd(meta.totalImplied), d: "sum of implied values over the board" },
  ];
  document.getElementById("kpis").innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><div class="k">' + esc(k.k) + '</div><div class="v">' + esc(k.v) + '</div><div class="d">' + esc(k.d) + '</div></div>';
  }).join("");

  // ---- tabs --------------------------------------------------------------
  var tabs = document.querySelectorAll("#tabs button");
  function showTab(name) {
    tabs.forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    document.querySelectorAll("main .tab").forEach(function (s) {
      s.classList.toggle("active", s.id === "tab-" + name);
    });
  }
  tabs.forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.tab); });
  });

  // ---- board table --------------------------------------------------------
  var sortKey = "rank";
  var sortDir = 1;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var fCat = document.getElementById("fCat");
  var fChain = document.getElementById("fChain");
  var cats = {};
  var chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement("option"); o.value = c; o.textContent = c; fCat.appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement("option"); o.value = c; o.textContent = c; fChain.appendChild(o);
  });

  function filteredRows() {
    var q = document.getElementById("q").value.trim().toLowerCase();
    var scope = document.getElementById("fScope").value;
    var cat = fCat.value;
    var chain = fChain.value;
    var out = rows.filter(function (r) {
      if (scope && r.scope !== scope) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (q && (r.name + " " + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = sortKey;
    out.sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (key === "band") { av = a.band_lo_usd; bv = b.band_lo_usd; }
      if (typeof av === "string") return sortDir * av.localeCompare(bv);
      return sortDir * (av - bv);
    });
    return out;
  }

  function renderBoard() {
    var list = filteredRows();
    document.getElementById("countLine").textContent =
      list.length + " of " + rows.length + " rows";
    document.getElementById("boardBody").innerHTML = list.map(function (r) {
      return "<tr><td class='num'>" + r.rank + "</td>" +
        "<td><a href='?view=detail&amp;slug=" + encodeURIComponent(r.slug) + "' data-slug='" + esc(r.slug) + "'>" + esc(r.name) + "</a></td>" +
        "<td><span class='badge " + r.scope + "'>" + (r.scope === "watchlist" ? "Watchlist" : "Early") + "</span></td>" +
        "<td>" + esc(r.category || "—") + "</td>" +
        "<td class='num'>" + usd(r.tvl_usd) + "</td>" +
        "<td class='num'><strong>" + usd(r.implied_value_usd) + "</strong></td>" +
        "<td class='num'>" + pct(r.odds) + "</td>" +
        "<td class='num mono'>" + usd(r.band_lo_usd) + " – " + usd(r.band_hi_usd) + "</td></tr>";
    }).join("");
    document.querySelectorAll("#boardBody a[data-slug]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        showDetail(a.dataset.slug);
        showTab("detail");
      });
    });
  }
  document.querySelectorAll("#boardTable th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir;
      else { sortKey = k; sortDir = 1; }
      renderBoard();
    });
  });
  ["q", "fScope", "fCat", "fChain"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", renderBoard);
  });
  renderBoard();

  // ---- detail view ---------------------------------------------------------
  function showDetail(slug) {
    var r = bySlug[slug];
    var el = document.getElementById("detailBody");
    if (!r) {
      el.innerHTML = "<p class='hint'>No protocol with that slug on the board.</p>";
      return;
    }
    var compRows = r.nearest.map(function (c) {
      return "<tr><td>" + esc(c.name) + "</td><td class='num'>" + usd(c.tvl_usd) + "</td><td class='num'>" + usd(c.mcap_usd) + "</td><td class='num'>" + c.multiple.toFixed(3) + "×</td></tr>";
    }).join("");
    el.innerHTML =
      "<div class='card'><h2 style='margin-top:0'>" + esc(r.name) + " <span class='badge " + r.scope + "'>" + (r.scope === "watchlist" ? "Watchlist" : "Early") + "</span></h2>" +
      "<p class='mono'>rank #" + r.rank + " · " + esc(r.slug) + " · " + esc(r.category || "uncategorised") + " · chains: " + esc(r.chains.join(", ")) + "</p>" +
      "<p>TVL " + usd(r.tvl_usd) + " · 7-day change " + (r.change_7d == null ? "n/a" : r.change_7d.toFixed(2) + "%") + " · listed " + (r.listed_at || "unknown") + " (" + r.age_years.toFixed(2) + " years without a token)</p></div>" +
      "<div class='grid'>" +
      "<div class='stat'><div class='k'>Curve value</div><div class='v'>" + usd(r.curve_value_usd) + "</div><div class='k'>what the token would be worth at traded-comps pricing</div></div>" +
      "<div class='stat'><div class='k'>Token odds</div><div class='v'>" + pct(r.odds) + "</div><div class='k'>logistic model on age, log TVL, 7-day change</div></div>" +
      "<div class='stat'><div class='k'>Implied value</div><div class='v'>" + usd(r.implied_value_usd) + "</div><div class='k'>curve value × token odds</div></div>" +
      "<div class='stat'><div class='k'>90% bootstrap band</div><div class='v'>" + usd(r.band_lo_usd) + " – " + usd(r.band_hi_usd) + "</div><div class='k'>B = " + meta.bootstrap.b + " refits of the size curve</div></div>" +
      "</div>" +
      "<h3>Nearest traded comps by size</h3>" +
      "<div class='tablewrap'><table><thead><tr><th>Protocol</th><th>TVL</th><th>Market cap</th><th>Multiple</th></tr></thead><tbody>" + compRows + "</tbody></table></div>" +
      "<h3>Farm plan — 90 days, net of gas</h3>" +
      "<div class='card'><ol class='steps'>" + r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" +
      "<p class='hint'>Gas figures are assumptions per chain, not measured fees. The plan prices 16 transactions; the expected net is the implied value minus that gas.</p></div>";
  }

  // ---- methodology ---------------------------------------------------------
  document.getElementById("methodBody").innerHTML =
    "<div class='card'><h3 style='margin-top:0'>1. The size curve</h3>" +
    "<p>Over the " + meta.curve.n + " protocols whose token already trades, the fitted relation is " +
    "<code>log10(market cap) = " + meta.curve.a.toFixed(4) + " + " + meta.curve.b.toFixed(4) + " × log10(TVL)</code> " +
    "(R² " + meta.curve.r2.toFixed(3) + ", RMSE " + meta.curve.rmse.toFixed(3) + " in log10 space). " +
    "A slope below 1 means bigger protocols trade at a smaller multiple of TVL — the market discounts size. " +
    "The naive alternative, one flat median multiple of " + meta.flatMultiple.toFixed(3) + "× TVL, is worse: its RMSE is " + meta.loo.flatRmse.toFixed(3) + " against the curve's " + meta.loo.rmse.toFixed(3) + " in leave-one-out testing.</p></div>" +
    "<div class='card'><h3 style='margin-top:0'>2. Token odds</h3>" +
    "<p>A logistic regression for P(records a token) from three features: years since listing without a token, log10(TVL), and the 7-day TVL change. " +
    "Odds ratios: age " + meta.odds.orAge.toFixed(2) + " per year, log TVL " + meta.odds.orLogTvl.toFixed(2) + " per log unit, 7-day change " + meta.odds.orChange.toFixed(2) + " per percentage point. " +
    "AUC " + meta.odds.auc.toFixed(3) + " — the model separates tokened from pre-token protocols better than chance, but it is a ranking signal, not a launch date. " +
    "A protocol missing a listing date gets the median age; a missing 7-day change is treated as 0.</p></div>" +
    "<div class='card'><h3 style='margin-top:0'>3. Validation, out of sample</h3>" +
    "<p>Leave-one-out: the curve beats the flat multiple " + meta.loo.ratio.toFixed(2) + "× on RMSE. " +
    "Time split: fitted on the " + meta.holdout.nFit + " comps listed on or before " + meta.holdout.cutoff + ", tested on the " + meta.holdout.nTest + " listed after; " +
    "holdout R² " + meta.holdout.r2.toFixed(3) + ", RMSE " + meta.holdout.rmse.toFixed(3) + ". " +
    "Bootstrap: B = " + meta.bootstrap.b + " resamples give a 90% interval for the slope of [" + meta.bootstrap.bLo.toFixed(3) + ", " + meta.bootstrap.bHi.toFixed(3) + "] and for the intercept of [" + meta.bootstrap.aLo.toFixed(3) + ", " + meta.bootstrap.aHi.toFixed(3) + "]; every row carries its own implied-value band from the same refits.</p></div>" +
    "<div class='card'><h3 style='margin-top:0'>4. Farm plans</h3>" +
    "<p>Each row gets a six-step plan over 90 days. Working capital is tiered by TVL ($5,000 / $1,000 / $500 / $250). " +
    "Gas is priced at 16 transactions times a per-chain assumption (for example $6 on Ethereum, $0.05 on Solana) — an assumption, labelled wherever it appears. " +
    "The expected net is the implied value minus that gas. Plans are templates driven by the row's own numbers, never by its name.</p></div>" +
    "<div class='card'><h3 style='margin-top:0'>5. What the snapshot cannot see</h3>" +
    "<p>The house also excludes protocols whose parent protocol already has a token, but the snapshot does not carry a parent field, so this check cannot be reproduced here and is stated as a limitation. " +
    "Likewise, a token that launched after the snapshot date is invisible to the board. The census counts every protocol once, with the first matching exclusion reason.</p></div>";

  // ---- census ----------------------------------------------------------------
  var cen = meta.census;
  var cenRows = [
    ["Total protocols in snapshot", cen.total, "—"],
    ["Token already trades (market cap recorded)", cen.traded, "—"],
    ["On the board (watchlist + early finds)", cen.ranked, "—"],
    ["Records a token but no market cap", cen.tokenNoMcap, cen.examples.tokenNoMcap],
    ["Forbidden category (bridge, liquid staking, CEX…)", cen.forbiddenCategory, cen.examples.forbiddenCategory],
    ["Versioned name (… V2, v3, 2.0)", cen.versionedName, cen.examples.versionedName],
    ["Wrapped / staked / staking in the name", cen.wrappedWord, cen.examples.wrappedWord],
    ["Named after an exchange", cen.exchangePrefix, cen.examples.exchangePrefix],
    ["Eligible, below the " + meta.rows + "-row cut", cen.eligibleNotSelected, cen.examples.eligibleNotSelected],
  ];
  var sumCheck = cen.traded + cen.ranked + cen.tokenNoMcap + cen.forbiddenCategory + cen.versionedName + cen.wrappedWord + cen.exchangePrefix + cen.eligibleNotSelected;
  document.getElementById("censusBody").innerHTML =
    "<div class='tablewrap'><table><thead><tr><th>Bucket</th><th>Count</th><th>Examples</th></tr></thead><tbody>" +
    cenRows.map(function (r) {
      var ex = Array.isArray(r[2]) ? r[2].map(esc).join(", ") : "—";
      return "<tr><td>" + esc(r[0]) + "</td><td class='num'>" + r[1] + "</td><td class='mono'>" + ex + "</td></tr>";
    }).join("") + "</tbody></table></div>" +
    "<p class='hint'>Buckets sum to " + sumCheck + " = total " + cen.total + " (first matching reason wins; board rows are never double-counted).</p>";

  // ---- research note -----------------------------------------------------------
  var top = rows.slice(0, 3);
  document.getElementById("researchBody").innerHTML =
    "<div class='card'><p><strong>Question.</strong> Among protocols without a token, which ones are worth farming — and how much would their token be worth if it priced like the tokens that already trade?</p>" +
    "<p><strong>Answer in one line.</strong> Price a pre-token protocol off the fitted size curve, then discount by its odds of ever getting a token. The top of the board is " + esc(top[0].name) + " at " + usd(top[0].implied_value_usd) + ", then " + esc(top[1].name) + " at " + usd(top[1].implied_value_usd) + " and " + esc(top[2].name) + " at " + usd(top[2].implied_value_usd) + ".</p>" +
    "<p><strong>What the data actually supports.</strong> Size explains only " + pct(meta.curve.r2) + " of the variance in traded market caps (R² " + meta.curve.r2.toFixed(3) + "), so the curve is a useful anchor, not a price forecast. The curve still beats the flat median multiple " + meta.loo.ratio.toFixed(2) + "× out of sample, and the time-split holdout (R² " + meta.holdout.r2.toFixed(3) + ") shows the relation does not collapse on newer listings. The odds model (AUC " + meta.odds.auc.toFixed(3) + ") says older protocols are much more likely to have a token already — the clock matters more than the 7-day growth number.</p>" +
    "<p><strong>What it does not support.</strong> Nothing here predicts a launch date, an airdrop size, or a farming return. Implied value is an expected value under the model; the bootstrap band on each row is the honest width of that guess. A protocol can sit high on this board and never launch — the odds are the discount for exactly that risk.</p>" +
    "<p><strong>Changes since the last snapshot.</strong> This board is fitted on the " + meta.as_of + " snapshot (" + meta.protocols + " protocols, " + meta.watchlist + " on the watchlist), regenerated from the live DefiLlama feed in the build session — not carried over from the previous edition. Watchlist, comps and every fitted number above come from that snapshot alone.</p></div>";

  // ---- live tokens ---------------------------------------------------------------
  document.getElementById("liveBody").innerHTML = live.map(function (p) {
    return "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.category || "—") + "</td><td class='num'>" + usd(p.tvl_usd) + "</td><td class='num'>" + usd(p.mcap_usd) + "</td><td class='num'>" + p.multiple.toFixed(3) + "×</td><td class='num'>" + (p.change_7d == null ? "—" : p.change_7d.toFixed(2) + "%") + "</td><td>" + esc(p.listed_at || "—") + "</td></tr>";
  }).join("");

  // ---- deep links ------------------------------------------------------------------
  var params = new URLSearchParams(window.location.search);
  var view = params.get("view");
  var slug = params.get("slug");
  var scope = params.get("scope");
  if (scope) {
    var fs = document.getElementById("fScope");
    fs.value = scope;
    renderBoard();
  }
  if (view === "detail" && slug) {
    showDetail(slug);
    showTab("detail");
  } else if (view) {
    showTab(view);
  }
})();
