// recompute.js — the page-side copy of the model's pricing formula.
// It must match lib/model.ts exactly: the selected curve is single-factor,
// log10(mcap) = intercept + logTvl*log10(TVL); odds = sigmoid(b0 +
// bAge*age + bTvl*log10(TVL) + bG*(change7d/100)); implied =
// round(10^curve * odds). scripts/crosscheck-node.mjs asserts this file
// and lib/model.ts agree on every row. No DOM, no imports.
window.Recompute = (function () {
  function log10(x) {
    return Math.log10(Math.max(1, x));
  }
  function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
  }
  function implied(coef, oddsCoef, row) {
    var curve = coef.intercept + coef.logTvl * log10(row.tvl);
    var g7 = row.change7d === null || row.change7d === undefined ? 0 : row.change7d;
    var odds = sigmoid(
      oddsCoef.intercept +
        oddsCoef.age * row.age +
        oddsCoef.logTvl * log10(row.tvl) +
        oddsCoef.change7d * (g7 / 100),
    );
    return {
      curveLog: curve,
      curveValue: Math.pow(10, curve),
      odds: odds,
      implied: Math.max(1, Math.round(Math.pow(10, curve) * odds)),
    };
  }
  return { implied: implied };
})();
