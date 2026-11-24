// recompute.js — the same model main.ts runs, in the browser.
// Re-derives a row's implied value from its inputs and the fitted
// coefficients, so the page can prove every row it shows. Plain script,
// no imports: it defines window.TOKEN_RECOMPUTE.
window.TOKEN_RECOMPUTE = (function () {
  function sigmoid(x) {
    var e = Math.max(-30, Math.min(30, x));
    return 1 / (1 + Math.exp(-e));
  }

  function winsorize(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // input: { tvl_usd, change_7d, age_years }; coef: the recompute block
  // from data.js (curve + odds coefficients + medians + winsor bounds).
  function recomputeRow(input, coef) {
    var fitted = Math.pow(10, coef.curveA + coef.curveB * Math.log10(input.tvl_usd));
    var age = input.age_years === null || input.age_years === undefined ? coef.medAge : input.age_years;
    var ch7 = winsorize(
      input.change_7d === null || input.change_7d === undefined ? coef.medChange7d : input.change_7d,
      coef.winLo,
      coef.winHi,
    );
    var z = [age, Math.log10(input.tvl_usd), ch7];
    var eta = coef.oddsBeta[0];
    for (var j = 0; j < 3; j++) {
      eta += coef.oddsBeta[j + 1] * ((z[j] - coef.oddsMeans[j]) / coef.oddsStds[j]);
    }
    var odds = sigmoid(eta);
    return {
      fitted_mcap_usd: Math.round(fitted),
      odds: odds,
      implied_value_usd: Math.max(1, Math.round(fitted * odds)),
    };
  }

  return { recomputeRow: recomputeRow, sigmoid: sigmoid, winsorize: winsorize };
})();
