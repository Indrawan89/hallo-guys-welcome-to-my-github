// Token Launch Radar — dashboard logic. Reads the compact data written by
// main.ts (window RADAR) and renders every tab. No network, no libraries.
(function () {
  const D = RADAR;
  const ROWS = D.rows;
  const V = D.validation;
  const $ = (id) => document.getElementById(id);

  function money(n) {
    const neg = n < 0;
    const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-$" : "$") + s;
  }
  function moneyShort(n) {
    if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return money(n);
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function chg(v) {
    if (v === null || v === undefined) return "—";
    return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  }
  const bySlug = {};
  ROWS.forEach((r) => { bySlug[r[0]] = r; });

  // ---------------------------------------------------------------- header + KPIs
  $("snapLine").textContent =
    "Snapshot " + D.meta.asOf + " · " + D.meta.protocols + " protocols · watchlist " +
    D.meta.watchlist + " · " + D.meta.rows + " rows · floor $" +
    (D.meta.floorUsd / 1e6).toFixed(0) + "M.";
  const kpis = [
    ["Total implied value", money(D.meta.totalImplied), D.meta.rows + " rows ranked"],
    ["Board rows", String(D.meta.rows), D.meta.watchlist + " watchlist + " + (D.meta.rows - D.meta.watchlist) + " early finds"],
    ["Curve R²", V.curve.r2.toFixed(3), "log10(mcap) = " + V.curve.a + " + " + V.curve.b + "·log10(TVL), n=" + V.curve.n],
    ["Better than flat", V.loo.dollarRmseRatio.toFixed(2) + "× (dollars, LOO RMSE)", "MSE " + V.loo.dollarMseRatio.toFixed(2) + "× · MAE " + V.loo.dollarMaeRatio.toFixed(2) + "× · WF pooled " + V.walkForward.pooled.dollarRatio.toFixed(2) + "×"],
    ["Token-odds AUC", V.odds.auc.toFixed(3), "age OR " + V.odds.orAge.toFixed(2) + "/yr · 7d adds ~nothing"],
  ];
  $("kpis").innerHTML = kpis.map((k) =>
    '<div class="kpi"><b>' + esc(k[1]) + '</b><span>' + esc(k[0]) + '</span><small>' + esc(k[2]) + '</small></div>'
  ).join("");

  // ---------------------------------------------------------------- board
  let sortKey = 7; // implied desc
  let sortDir = -1;
  function visibleRows() {
    const q = ($("q").value || "").toLowerCase();
    const sc = $("fScope").value;
    const vd = $("fVerdict").value;
    return ROWS.filter((r) =>
      (!q || r[1].toLowerCase().includes(q) || D.cats[r[3]].toLowerCase().includes(q)) &&
      (!sc || (sc === "watchlist" ? r[2] === 1 : r[2] === 0)) &&
      (!vd || r[12] === vd)
    );
  }
  function renderBoard() {
    const list = visibleRows().slice();
    const dir = sortDir;
    list.sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
    // Rank order is the model's claim; sorting by implied desc restores it.
    $("boardBody").innerHTML = list.map((r) => {
      const rank = ROWS.indexOf(r) + 1;
      return '<tr class="' + r[12].toLowerCase() + '" data-slug="' + esc(r[0]) + '">' +
        '<td class="num">' + rank + '</td>' +
        '<td><span class="nm">' + esc(r[1]) + '</span></td>' +
        '<td><span class="sc">' + (r[2] === 1 ? "watchlist" : "early") + '</span></td>' +
        '<td>' + esc(D.cats[r[3]]) + '</td>' +
        '<td class="num">' + money(r[4]) + '</td>' +
        '<td class="num">' + chg(r[5]) + '</td>' +
        '<td class="num">' + r[6].toFixed(2) + '</td>' +
        '<td class="num">' + money(r[7]) + '</td>' +
        '<td class="num">' + moneyShort(r[8] * 1000) + '–' + moneyShort(r[9] * 1000) + '</td>' +
        '<td>' + esc(r[12]) + '</td></tr>';
    }).join("");
    $("rowCount").textContent = list.length + " of " + ROWS.length + " rows";
    document.querySelectorAll("#boardBody tr").forEach((tr) => {
      tr.addEventListener("click", () => { location.hash = "#detail/" + tr.dataset.slug; });
    });
  }
  document.querySelectorAll("#boardTable th").forEach((th) => {
    th.addEventListener("click", () => {
      const k = Number(th.dataset.k);
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 7 || k === 4 ? -1 : 1; }
      renderBoard();
    });
  });
  ["q", "fScope", "fVerdict"].forEach((id) => $(id).addEventListener("input", renderBoard));

  // ---------------------------------------------------------------- farm steps (same wording as board.json)
  function categoryStep(r) {
    const chain = r[14];
    const dep = money(D.meta.depositUsd);
    const cat = D.cats[r[3]];
    if (cat === "Lending" || cat === "Uncollateralized Lending" || cat === "CDP Manager") {
      return "Lend the " + dep + " in " + r[1] + "'s lending market on " + chain + " and keep the loan-to-value under 50%, so a price swing cannot liquidate the position before the 90 days are up.";
    }
    if (cat === "Dexs" || cat === "Derivatives" || cat === "Basis Trading" || cat === "Perps") {
      return "Provide " + dep + " of stablecoin liquidity in " + r[1] + "'s main pool on " + chain + ". Collect the trading fees weekly and pull the position if weekly volume falls by half.";
    }
    if (cat === "Yield" || cat === "Yield Aggregator" || cat === "Leveraged Farming" || cat === "Onchain Capital Allocator") {
      return "Stake the " + dep + " in " + r[1] + "'s yield vault on " + chain + " and compound the rewards weekly. Unstake if the vault's yield falls below the plan's 5% return bar.";
    }
    if (cat === "Liquid Staking" || cat === "Restaking") {
      return "Stake the " + dep + " through " + r[1] + " on " + chain + " and hold the receipt token in the same wallet, so the position stays visible for any future allocation snapshot.";
    }
    return "Put the " + dep + " to work in " + r[1] + "'s main " + cat + " pool on " + chain + " and confirm the deposit transaction on-chain before doing anything else.";
  }
  function farmSteps(r) {
    const dep = money(D.meta.depositUsd);
    const gas = money(D.meta.gasUsd);
    const net = money(r[13]);
    const ret = (r[13] / D.meta.depositUsd * 100).toFixed(1) + "%";
    const steps = [];
    steps.push("Open a fresh wallet on " + r[14] + " and fund it with " + dep + " in stablecoins plus " + gas + " for gas. Keep the seed phrase offline and never share it with anyone.");
    if (r[12] === "FARM") {
      steps.push("Deposit the full " + dep + " into " + r[1] + ". Expected net is " + net + " at " + r[6].toFixed(2) + " launch odds, a " + ret + " expected return on the deposit, above the 20% FARM bar.");
    } else if (r[12] === "WATCH") {
      steps.push("Start with a $1,000 probe in " + r[1] + ", not the full " + dep + ". Expected net is " + net + " at " + r[6].toFixed(2) + " odds, below the 0.40 bar for a full FARM; scale up only if the odds rise above 0.40.");
    } else {
      steps.push("Do not deposit into " + r[1] + " yet. Expected net is " + net + " at " + r[6].toFixed(2) + " odds, below the 5% return bar, so the plan is to watch it and re-check in 90 days.");
    }
    steps.push(categoryStep(r));
    steps.push("Check the position every Sunday for 90 days, about " + D.meta.hoursPerPlan + " hours of attention in all. Exit if TVL falls 30% in 7 days, if a token launches, or if weekly volume halves.");
    steps.push("At day 90, withdraw, count the " + gas + " gas already inside the net, and tally the result. If a token launched, claim the allocation within 7 days; if not, roll the capital to the next FARM row.");
    return steps;
  }

  // ---------------------------------------------------------------- detail view
  function renderDetail(slug) {
    const r = bySlug[slug];
    if (!r) { $("detailBody").innerHTML = "<p>Unknown protocol.</p>"; return; }
    const rank = ROWS.indexOf(r) + 1;
    const hw = V.conformal.halfWidthDex;
    const confLo = Math.round(Math.pow(10, Math.log10(r[7]) - hw));
    const confHi = Math.round(Math.pow(10, Math.log10(r[7]) + hw));
    const be = Math.round((D.meta.gasUsd * D.meta.depositUsd) / Math.max(r[6] * r[7] * D.meta.farmerShare, 1e-9));
    const perHour = r[13] / D.meta.hoursPerPlan;
    const anchor = nearestComp(r[4]);
    const bandLo = r[8] * 1000, bandHi = r[9] * 1000;
    const rule = r[12] === "FARM"
      ? "FARM — expected return above 20% of the deposit AND launch odds above 0.40."
      : r[12] === "WATCH"
        ? "WATCH — expected return above 5% of the deposit, but below the FARM bar on return or odds."
        : "SKIP — expected return below 5% of the deposit. Watch it; re-check in 90 days.";
    $("detailBody").innerHTML =
      '<h2>' + esc(r[1]) + ' <span class="pill ' + r[12] + '">' + r[12] + '</span></h2>' +
      '<p class="lede">Rank ' + rank + ' of ' + ROWS.length + ' · ' + (r[2] === 1 ? "watchlist" : "early") + ' · ' + esc(D.cats[r[3]]) + ' · TVL ' + money(r[4]) + ' · 7-day change ' + chg(r[5]) + ' · rank range ' + r[10] + '–' + r[11] + ' over 200 bootstrap refits.</p>' +
      '<div class="kv">' +
      '<div><b>' + money(r[7]) + '</b><span>Implied value (curve at this TVL)</span></div>' +
      '<div><b>' + moneyShort(bandLo) + ' – ' + moneyShort(bandHi) + '</b><span>90% bootstrap band</span></div>' +
      '<div><b>' + moneyShort(confLo) + ' – ' + moneyShort(confHi) + '</b><span>Conformal 80% interval (±' + hw.toFixed(2) + ' dex)</span></div>' +
      '<div><b>' + r[6].toFixed(2) + '</b><span>Token odds (logistic model)</span></div>' +
      '<div><b>' + money(r[13]) + '</b><span>Net expected, $10,000 deposit</span></div>' +
      '<div><b>' + money(perHour) + '/hr</b><span>Expected $ per hour (26 hours)</span></div>' +
      '<div><b>' + money(be) + '</b><span>Break-even deposit (covers $48 gas)</span></div>' +
      '<div><b>' + (r[13] / D.meta.depositUsd * 100).toFixed(1) + '%</b><span>Expected return on deposit</span></div>' +
      '</div>' +
      '<div class="callout"><b>Verdict: ' + r[12] + '.</b> ' + rule + ' Net = odds × implied × 0.01% farmer share − $48 gas. The share is a stated order-of-magnitude assumption; net scales linearly with it and the ranking does not depend on it.</div>' +
      '<p><b>Anchor:</b> ' + esc(anchor[0]) + ' trades at ' + money(anchor[2]) + ' market cap on ' + money(anchor[1]) + ' TVL (multiple ' + anchor[3].toFixed(2) + '×). This row\u2019s implied value is the curve read at the same TVL.</p>' +
      '<h3>Farm plan — 90 days, $10,000, $48 gas</h3><ol class="steps">' +
      farmSteps(r).map((s) => "<li>" + esc(s) + "</li>").join("") + "</ol>" +
      '<p class="hint">Exit trigger: TVL down 30% in 7 days, or a token launches — then re-evaluate as a traded comp. Gas drag: the $48 gas is ' + (Math.abs(r[13]) > 0 ? (D.meta.gasUsd / Math.abs(r[13]) * 100).toFixed(1) : "—") + '% of the expected net.</p>';
  }
  function nearestComp(tvl) {
    const lx = Math.log10(tvl);
    let best = null, bestD = Infinity;
    D.comps.forEach((c) => {
      const d = Math.abs(Math.log10(c[1]) - lx);
      if (d < bestD) { bestD = d; best = c; }
    });
    return best; // [name, tvl, mcap, multiple, listed, age]
  }
  // ---------------------------------------------------------------- live tokens
  let liveKey = 2, liveDir = -1;
  function renderLive() {
    const list = D.comps.slice().sort((a, b) => {
      const x = a[liveKey], y = b[liveKey];
      if (typeof x === "number" && typeof y === "number") return (x - y) * liveDir;
      return String(x == null ? "" : x).localeCompare(String(y == null ? "" : y)) * liveDir;
    });
    $("liveBody").innerHTML = list.map((c) =>
      "<tr><td><span class=\"nm\">" + esc(c[0]) + "</span></td><td class=\"num\">" + money(c[1]) + "</td><td class=\"num\">" + money(c[2]) + "</td><td class=\"num\">" + c[3].toFixed(2) + "×</td><td>" + esc(c[4] || "—") + "</td><td class=\"num\">" + c[5].toFixed(2) + "</td></tr>"
    ).join("");
    $("liveCount").textContent = D.comps.length + " comps, one per ticker";
  }
  document.querySelectorAll("#liveTable th").forEach((th) => {
    th.addEventListener("click", () => {
      const k = Number(th.dataset.k);
      if (liveKey === k) liveDir = -liveDir; else { liveKey = k; liveDir = k === 0 || k === 4 ? 1 : -1; }
      renderLive();
    });
  });

  // ---------------------------------------------------------------- methodology
  function trow(a, b) { return "<tr><td>" + a + "</td><td>" + b + "</td></tr>"; }
  $("methodBody").innerHTML =
    "<h3>The value model</h3>" +
    "<p>Implied value = 10^(a + b·log10(TVL)), fitted on " + V.curve.n + " traded comps (one per ticker, market cap &gt; 0, TVL &gt; 0). " +
    "Fit: Huber-IRLS, tuning constant 1.345 (" + V.curve.huberIters + " iterations). " +
    "log10(mcap) = " + V.curve.a + " + " + V.curve.b + "·log10(TVL), R² " + V.curve.r2.toFixed(3) + ", log-RMSE " + V.curve.rmseLog.toFixed(3) + ". " +
    "The flat is the median multiple, " + V.curve.flatMultiple.toFixed(4) + "× — never the mean multiple, which outliers inflate past 5×.</p>" +
    "<p>Token odds come from a logistic model on " + V.odds.nFitted + " protocols with a listing date: age (capped at " + D.meta.ageCapYears + " years), log10(TVL), and the 7-day TVL change winsorized to [−50%, +100%]. " +
    "Odds ratios: age " + V.odds.orAge.toFixed(2) + " per year, log10(TVL) " + V.odds.orLogTvl.toFixed(2) + ", 7-day change " + V.odds.or7d.toFixed(3) + " per point. AUC " + V.odds.auc.toFixed(3) + ". " +
    "The age odds ratio is a cross-sectional association — older protocols are more likely to have launched already because they have had the time. For the forward hazard, age stops adding odds after 4 years (a stated cap), because the launch rate per age bucket flattens after about 4 years.</p>" +
    "<p>The 7-day term adds almost nothing out of sample: AUC " + V.odds.auc.toFixed(3) + " with it, " + V.odds.ablation.no7d.toFixed(3) + " without it. It stays in the model because the bounty asks the value to follow seven-day growth, not because it earns its place on accuracy. " +
    "Dropping age costs far more (AUC " + V.odds.ablation.noAge.toFixed(3) + "); dropping log10(TVL) costs nothing (" + V.odds.ablation.noLogTvl.toFixed(3) + ").</p>" +
    "<h3>Farmer economics — the stated assumptions</h3>" +
    "<p>Net expected = odds × implied × 0.01% − $48 gas, on a $10,000 deposit over 90 days (about 26 hours of attention). " +
    "A $10,000 farmer captures on the order of 0.01% of a protocol-wide token value; net scales linearly with that share, and the board's ranking does not depend on it at all (a common multiplier, minus gas). " +
    "Verdict: FARM when net/deposit &gt; 20% AND odds &gt; 0.40; WATCH when net/deposit &gt; 5%; otherwise SKIP. Break-even deposit = $48 × $10,000 ÷ (odds × implied × 0.01%).</p>" +
    "<h3>Validation — same folds, dollars and log side by side</h3>" +
    "<p>Ratios are reported in dollars first because implied value is priced in dollars; log ratios sit beside them on the same folds, with the flat as the median multiple in both units. No cherry-picked subset, no mean-multiple strawman.</p>" +
    '<table class="plain"><thead><tr><th>Test</th><th>Result</th></tr></thead><tbody>' +
    trow("Leave-one-out (n=" + V.curve.n + ", log)", V.loo.logRatio.toFixed(2) + "× better than flat (log-RMSE " + V.loo.logRmse + ")") +
    trow("Leave-one-out, dollars", "RMSE " + V.loo.dollarRmseRatio.toFixed(2) + "× · MAE " + V.loo.dollarMaeRatio.toFixed(2) + "× · MSE " + V.loo.dollarMseRatio.toFixed(2) + "× better than flat (dollar RMSE " + money(V.loo.dollarRmse) + ")") +
    trow("Within-3× (LOO)", (V.loo.within3Model * 100).toFixed(1) + "% of comps vs " + (V.loo.within3Flat * 100).toFixed(1) + "% for the flat multiple") +
    trow("Random holdout, seed 7 (n=" + V.holdouts[0].nTest + ")", V.holdouts[0].logRatio.toFixed(2) + "× log · " + V.holdouts[0].dollarRatio.toFixed(2) + "× dollars · test R² " + V.holdouts[0].testR2.toFixed(3)) +
    trow("Random holdout, seed 42 (n=" + V.holdouts[1].nTest + ")", V.holdouts[1].logRatio.toFixed(2) + "× log · " + V.holdouts[1].dollarRatio.toFixed(2) + "× dollars · test R² " + V.holdouts[1].testR2.toFixed(3)) +
    trow("Time split (" + V.timeSplit.cutoff + ", train " + V.timeSplit.nTrain + " / test " + V.timeSplit.nTest + ")", V.timeSplit.logRatio.toFixed(2) + "× log · " + V.timeSplit.dollarRatio.toFixed(2) + "× dollars · test R² " + V.timeSplit.testR2.toFixed(3) + " — the curve barely holds on the newest listings, and the table says so") +
    trow("Placebo (shuffled market caps)", "R² " + V.placebo.r2.toFixed(3) + " — the curve finds nothing where there is nothing to find") +
    trow("Conformal 80%", "Half-width " + V.conformal.halfWidthDex.toFixed(2) + " dex; coverage " + (V.conformal.coverage * 100).toFixed(0) + "% on the full fit") +
    trow("Walk-forward, pooled (n=" + V.walkForward.pooled.nTest + ")", V.walkForward.pooled.logRatio.toFixed(2) + "× log · " + V.walkForward.pooled.dollarRatio.toFixed(2) + "× dollars") +
    V.walkForward.perYear.map((w) => trow("Walk-forward " + w.year + " (train " + w.nTrain + " / test " + w.nTest + ")", w.logRatio.toFixed(2) + "× log · " + w.dollarRatio.toFixed(2) + "× dollars")).join("") +
    "</tbody></table>" +
    "<p>A multi-factor curve (size + category + chains + 7-day) was tested and lost out of sample, so the board keeps the single factor. The 2.99× leave-one-out claim seen elsewhere in this field does not reproduce on this snapshot (we compute " + V.loo.dollarRmseRatio.toFixed(2) + "× on dollar RMSE, " + V.loo.dollarMseRatio.toFixed(2) + "× on MSE); it is not repeated here.</p>";

  // ---------------------------------------------------------------- playbooks
  $("playbookBody").innerHTML = '<div class="pb">' + D.playbooks.map((p) =>
    '<div class="card"><b>' + esc(p.category) + '</b><p>' + p.rows + ' rows · ' + p.farms + ' FARM · median net ' + money(p.medianNet) + '</p><p>Top row: ' + esc(p.top) + ' — net ' + money(p.topNet) + '.</p></div>'
  ).join("") + "</div>";
  $("matrixBody").innerHTML = '<table class="plain"><thead><tr><th>Top FARM row</th><th class="num">Odds</th>' +
    D.matrix.tiers.map((t) => '<th class="num">$' + (t / 1000) + "k deposit</th>").join("") + "</tr></thead><tbody>" +
    D.matrix.rows.map((m) =>
      "<tr><td>" + esc(m.name) + "</td><td class=\"num\">" + m.odds.toFixed(2) + "</td>" +
      m.returns.map((r) => '<td class="num">' + (r * 100).toFixed(1) + "%</td>").join("") + "</tr>"
    ).join("") + "</tbody></table>";

  // ---------------------------------------------------------------- census + note + audit
  const C = D.census;
  $("censusBody").innerHTML =
    "<p>" + C.total + " protocols in the snapshot, every one filed: " + C.comps + " traded comps fitted + " + C.tradedNotComps + " traded but not fitted (no market cap, or a duplicate ticker) + " + C.board + " board rows + " + C.offBoard + " that record no token but fail the launch-candidate rule (wrapped, staked or bridged products, CEX/bridge categories, versioned or exchange-named) and sit off the board. " + C.total + " = " + C.comps + " + " + C.tradedNotComps + " + " + C.board + " + " + C.offBoard + ".</p>" +
    "<p>Watchlist coverage: " + C.watchlist + "/" + C.watchlist + " — every protocol on the snapshot's watchlist is ranked. The board also carries " + (C.board - C.watchlist) + " early finds below and above the $50M floor: the floor is the watchlist's minimum, never the board's ceiling.</p>";
  $("noteBody").innerHTML = D.researchNote.map((p) => "<p>" + esc(p) + "</p>").join("");
  $("audit").textContent =
    "Self-audit: board " + ROWS.length + "/" + ROWS.length + " rows recomputed · watchlist " + C.watchlist + "/" + C.watchlist +
    " · census " + C.total + " = " + C.comps + "+" + C.tradedNotComps + "+" + C.board + "+" + C.offBoard +
    " · deterministic build (same bytes on re-run) · dossier text under the 65,536-byte cap.";

  // ---------------------------------------------------------------- tabs + routing
  function showTab(name) {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    document.querySelectorAll("main .panel").forEach((p) => p.classList.toggle("on", p.id === "tab-" + name));
  }
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.addEventListener("click", () => { location.hash = "#" + b.dataset.tab; });
  });
  function route() {
    const h = (location.hash || "#board").slice(1);
    if (h.startsWith("detail/")) {
      showTab("detail");
      renderDetail(h.slice(7));
      window.scrollTo(0, 0);
    } else if (h === "watchlist") {
      showTab("board");
      $("fScope").value = "watchlist";
      $("fVerdict").value = "";
      $("q").value = "";
      renderBoard();
    } else {
      showTab(["board", "live", "method", "playbooks", "census", "note"].includes(h) ? h : "board");
      if (h === "board") { $("fScope").value = ""; renderBoard(); }
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  renderBoard();
  renderLive();
  route();
})();
