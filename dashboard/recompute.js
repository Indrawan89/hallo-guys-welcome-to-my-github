// Recompute helper, shared by the dashboard page and the Node cross-check.
// Kept dependency-free and DOM-free: the same formula the model in
// lib/model.ts uses, so the page can re-derive every row's implied value
// and show whether it matches the board. Loaded as a CLASSIC script:
// file:// pages cannot load ES modules, so this file has no import/export
// — the result lands on window.RECOMPUTE.
function impliedFromCurve(tvlUsd, a, b) {
  return Math.round(10 ** (a + b * Math.log10(tvlUsd)));
}

function recomputeBoard(board, a, b) {
  let matched = 0;
  let worstGap = 0;
  for (const row of board) {
    const again = impliedFromCurve(row.tvl_usd, a, b);
    const gap = Math.abs(again - row.implied_value_usd);
    if (gap === 0) matched += 1;
    if (gap > worstGap) worstGap = gap;
  }
  return { matched, total: board.length, worstGap };
}

if (typeof window !== 'undefined') {
  window.RECOMPUTE = { impliedFromCurve, recomputeBoard };
}
