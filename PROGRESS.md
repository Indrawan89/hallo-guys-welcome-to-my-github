# PROGRESS — token-radar-01 rebuild3 (iteration after rebuild2's rank drop)

## Why this rebuild exists

Rebuild2 (submission 01a20bff, submitted 24 Nov 12:19 WIB) was graded
"finished", NOT rejected — but its rank FELL: **3.221/18.595, judge
91,50% (band 88,72–94,29%)**, vs the old entry's 1.629/18.318, judge
93,48% (band 91,77–95,19%). The rebuild implemented the full ATM 20–50
recipe (fitted log-log curve × token odds, LOO/time-split/bootstrap
shown, farm plans netted, 758 census, research note) and still scored
lower. The user (24 Nov 15:00 WIB) ordered: keep developing, leave no
gap for error, rank drop is acceptable, stay with ATM 20–50. This
rebuild is a genuine second diagnosis + rebuild, not a re-run.

## Stage 1 — DIAGNOSIS (live leaderboard, 24 Nov ~15:00 WIB)

### What the 20–50 zone looks like now

- Zone 20–50 judge: **95,64–96,05%** (was 95,56–95,97% on 23 Nov).
  Dossier bytes 592K–1,49M. Ours: 704.470 (in range, low end).
- **Screening line (40th-best interval low): 94,39%.** Our interval
  HIGH is 94,29% — **0,097 points BELOW the line**: rebuild2 as it
  stands would be screened out of the final. The old entry's high
  (95,19%) cleared it. Money line (10th-best low): 94,96%.
- **All 31 entries in ranks 20–50 are `source_withheld: true`,
  `repo_url` empty.** Their code cannot be read — same as the 23 Nov
  ATM report found. The diagnosis below is therefore from titles +
  metrics + the judge criteria, NOT from reading their code. Nothing
  here claims to quote their source.

### New recipe signals in the 24 Nov titles (beyond the 23 Nov report)

- #20 europa-nova v16: "launch value x odds a token ever lists x
  **own-token share**, **every term split-tested**, 9-check…" — a
  third factor (the share of supply a farmer can actually claim) and
  a 9-check integrity strip.
- #21 hazel-harbor-63: "**one-per-ticker** comps fit tested blind" —
  comps deduplicated to one row per token (no double-counting a token
  deployed on many chains).
- #22 griffin v7: "every term **held-out tested** on the board".
- #23 anymore: "TVL x fitted multiple (**size, category, chains, 7d
  growth**) x launch odds by age" — the multiple is fitted on FOUR
  inputs, not log-TVL alone.
- #24 sage-badger-73: "model LOO 1.113" — LOO multiple vs flat.
- #27 tuannhm04: "**one model file run by main.ts and the page
  (198/198 rows recomputed)**, size curve x **12-month launch odds**"
  — the page itself re-runs the model and recomputes every row; odds
  carry a 12-month horizon.
- #33 bright-coyote-67: "**Within-3x KPIs**, **Gas-Drag** Farm Plans &
  **Category Exit Triggers**" — an accuracy KPI (share of comps whose
  true value lands within 3× of the fitted value), gas cost shown as
  drag on value, exit conditions per category.
- #36 y-cat33: "the code proves every claim on screen; impliedValue()
  prices and re-derives every row".
- #48 zha-key v7: "**10/10 live self-audit**, dynamic non-CEX
  exclusions on cover, **Huber-IRLS x Cure Survival (WF 2.31x…)**" —
  robust regression (Huber loss, iteratively reweighted), survival
  framing for launch odds, walk-forward 2,31× better than flat, and a
  live self-audit strip showing 10/10 checks passing.

### Concrete gaps in rebuild2 vs the zone

1. **Single-factor multiple.** Ours: log10(mcap) ~ log10(TVL) only.
   Zone: multiple fitted on size + category + chains + 7d growth.
2. **Comps not deduplicated.** Ours: 121 comps as listed. A token
   deployed on several chains appears as several rows and gets
   counted several times in the fit.
3. **OLS only, no robust fit.** Ours: plain OLS (R² 0,195). Zone:
   Huber-IRLS — resistant to the few giant-mcap outliers that drag
   an OLS line.
4. **No per-term testing.** Ours tests the curve (LOO + time-split)
   but never tests each odds/curve term alone (ablation). Zone:
   every term split-tested / held-out tested.
5. **No accuracy KPI.** Ours shows R²/RMSE. Zone shows within-3x
   hit rates.
6. **No live self-audit on the cover.** Ours computes hard gates in
   main.ts (invisible to the judge except via source). Zone shows a
   self-audit strip (9–10 checks) on the page itself.
7. **Page does not recompute.** Our dashboard displays precomputed
   data.js. Zone: the page re-runs the shared model file and
   recomputes every row in the browser.
8. **Farm plans lack exit triggers and gas drag.** Ours: 6 steps with
   gas + duration + netted dollars. Zone adds an exit condition per
   row and gas cost as drag on the expected value.
9. **No own-token share, no survival framing.** Cannot be filled
   honestly from this snapshot: the snapshot carries no tokenomics
   and no token-launch dates, so a per-protocol share or a true
   survival/cure fit would be invented numbers. NOT implemented;
   recorded here as a known, unfillable gap.

### Why rebuild2 scored lower than the old entry (hypotheses)

a. **Noise / band overlap — most likely the largest part.** Rebuild2
   band 88,72–94,29% vs old 91,77–95,19%: the intervals overlap
   heavily. The dev judge is provisional (12 games vs fixed house
   anchors, margin-weighted); a ~2-point swing is inside the noise.
b. **Honestly displayed weak validation.** Rebuild2 shows holdout R²
   0,038 and says so on the dashboard. The old entry showed NO
   validation at all — nothing for the judge to mark down. The fix
   is a genuinely stronger model, never hiding the number.
c. **A criterion-named factor with zero effect.** Our odds model
   found 7-day change OR 1,00 (no effect) — the judge criteria name
   7-day growth explicitly, so a term that does nothing reads as a
   broken model.
d. **Fewer rows in the submitted artifact.** 190 rows / 34 watchlist
   in the dossier and screenshots (the 24 Nov snapshot genuinely has
   fewer eligible protocols); the graded run on the house snapshot
   produces 198/40, but the judge sees the 190-row artifact.
e. **Smaller implied values.** Top row $40,7M vs the old model's
   $652,5M. Weak as an explanation on its own — the zone also uses
   fitted × odds — but bolder values may read better head-to-head.

## What rebuild3 changes (design, my own implementation)

1. **One-per-ticker comps:** dedup traded comps by symbol, keeping
   the highest-TVL row per symbol; report counts before/after.
2. **Multi-factor fitted multiple:** log10(mcap) ~ log10(TVL) +
   category effects (top categories as dummies, rest pooled) +
   log(chains) + 7d growth. Report R² vs the single-factor curve.
3. **Huber-IRLS robust refit** (k = 1,345σ, iterated to convergence)
   as the final curve; report OLS vs Huber coefficients.
4. **Per-term ablation:** LOO RMSE for the full model vs dropping
   each term (logTVL, category, chains, 7d, age, odds terms);
   displayed as a table.
5. **Walk-forward validation** by listing year (expanding window),
   reporting the OOS multiple vs flat alongside LOO.
6. **Within-3x / within-2x KPIs**, in-sample and LOO.
7. **Live self-audit strip** on the dashboard cover: coverage,
   sorted order, census sum, recompute check, farm-step lengths —
   computed live in the page, shown as N/N passing.
8. **In-page recompute:** data.js embeds per-row inputs + fitted
   coefficients; app.js re-derives every implied value in the
   browser and shows "recomputed N/N ✓".
9. **Farm plans + exit trigger + gas drag** per row (exit condition
   derived from the row's own TVL/7d figures; gas drag as % of
   expected value).
10. **Snapshot regenerated in-session** from DefiLlama by a script
    written here; `input/` git-ignored from the start.
11. Everything else kept from the rebuild2 pattern that worked:
    refit at runtime from /input/snapshot.json, 7 gates, deterministic
    2×, Python cross-check, full `makefun check`.

## Data — regenerated in-session

- Script: `scripts/fetch-snapshot.mjs` (written fresh, Node stdlib only).
- Source: `https://api.llama.fi/protocols` (HTTP 200, 9,100 records).
- New snapshot as_of **2026-11-24**: 728 protocols ≥ $5M floor, watchlist
  **34**, 50 categories, 121 traded comps (mcap > 0), 330 protocols
  recording no token, 13,196 lines. First attempt gave watchlist 53: the rule
  missed DefiLlama's `parentProtocol` field — 19 of the 53 name a parent
  protocol. Fixed in-session; the count then matched rebuild2's 34
  exactly, a good cross-check of the rule.
- Data quirk kept from rebuild2: `autofinance` carries mcap_usd = -1
  (DefiLlama sentinel). Treated as not-traded; it records a token, so
  it lands in the token-no-mcap census bucket.
- Snapshot file: 288,571 bytes, 2-space-indent JSON. `input/` was
  git-ignored from the very first commit of this folder.

## Fit — refit on the new snapshot

- Comps: 121 traded, **one per ticker** (dedup by symbol, keep the
  highest-TVL row). Dedup changed nothing on this snapshot — 121
  unique symbols, 0 duplicates — and 0 on the house snapshot too
  (128/128). The dedup is kept anyway: it is the zone's stated
  practice and costs nothing.
- Multi-factor experiment (fitted, then REJECTED): log10(mcap) ~
  log10(TVL) + category dummies (9, each ≥5 comps) + log10(chains) +
  7d/100. OLS R² 0.278, RMSE 0.818 — better in-sample — but LOO
  0.961 vs 0.876 single-factor, holdout R² -0.202, walk-forward
  1.03×. The extra terms overfit. Ablation: without category 0.899,
  without logChains 0.951, without change7d 0.918, without logTVL
  1.030 — every added term hurts out-of-sample.
- **Selected curve (Huber-IRLS, k = 1.345σ):**
  `log10(mcap) = 3.0156 + 0.5238·log10(TVL)`, R² 0.196, RMSE 0.863,
  n = 121. Flat median multiple 0.2144 (flat RMSE 0.972).
- Odds (logistic, age / logTVL / 7d change): intercept -2.161,
  age +0.607 (OR 1.84/yr), logTVL +0.117 (OR 1.12), 7d -1.494
  (OR 0.98 per point — small, kept: it does not hurt AUC);
  **AUC 0.720** on 618 protocols (313 with a token). Ablation:
  without age 0.571, without logTVL 0.716, without change7d 0.716.
- LOO (Huber refits): curve RMSE 0.875 vs flat 0.972 → **1.11×**.
- Time-split holdout (cutoff 2024-02-06; fit 44, test 45): **R²
  0.025**, RMSE 0.869 vs flat 0.973. Still weak — stated honestly.
- Walk-forward by listing year: 2024 1.05× (train 43, test 17),
  2025 1.18× (60/20), 2026 1.13× (80/9); pooled **1.12×**.
- Within-3×: 40.5% in-sample and LOO. Within-2×: 29.8% both.
- Bootstrap B = 200, seed 20261124: slope 90% [0.379, 0.655],
  intercept 90% [2.012, 4.207]. Per-row implied-value bands from the
  same refits.
- Board: **190 rows** (34 watchlist + 156 early). Top 3: Steakhouse
  Financial $42,664,608 · Sentora Curator $36,911,229 · Veda
  $32,881,561. Total implied $868,424,976.
- Census sums exactly: traded 121 + ranked 190 + token-no-mcap 277 +
  category-excluded 124 + versioned 11 + wrapped 5 + exchange 0 +
  eligible-not-selected 0 = 728.
- Farm plans: 6 steps/row + exit trigger + gas drag (labeled
  estimate: $12/tx on Ethereum, $1.50 elsewhere, 4 txs/plan) and net
  expected value (implied × odds − gas).

## Implementation — written fresh in this session

- `lib/model.ts` (~25 KB): comps + one-per-ticker dedup, multi-factor
  OLS, Huber-IRLS, term selection, LOO, time-split, walk-forward,
  ablation, within-3x, bootstrap, logistic odds, board builder, farm
  plans, census. Written from the diagnosis + snapshot facts only —
  rebuild2's code files were never read or copied.
- `main.ts`: entrypoint, hard gates before writing (coverage 34/34,
  ranks 1..N, implied non-increasing, farm-step lengths, census sum),
  writes board.json / data.js / dashboard / screenshots / dossier.json.
- `dashboard/` (index.html + app.css + app.js ~15 KB + recompute.js
  1.1 KB): dark theme, KPI strip, **11/11 live self-audit strip**
  computed in the page, sortable/filterable board, detail view
  (model breakdown, bootstrap band, 3 nearest comps, farm plan,
  exit trigger), methodology (selection table + ablation +
  walk-forward), census, research note. The page re-derives every
  row's implied value with `recompute.js` and shows the match.
- `vendor/makefun-board.ts`: copied unchanged from the kit starter
  (sha256 9ca51b6e…).
- `scripts/fetch-snapshot.mjs`: the fetch + watchlist rule (with the
  parentProtocol fix found in-session).

## Test runs (local)

- Run 1 (24 Nov ~15:30 WIB): `node main.ts --input
  input/snapshot.json --output out` — exit 0, dossier skipped (no
  screenshots yet). All hard gates passed; census 728 == 728.
- Determinism: `out` vs `out2` byte-identical (full directory diff).
- Python cross-check (`scripts/crosscheck.py`): all comparisons match
  exactly (multi OLS R² 0.2777, multi LOO 0.9613, single OLS R²
  0.1967, single OLS LOO 0.8756, holdout R² 0.0246, odds AUC 0.7198,
  n=618 pos=313).
- Node recompute check (`scripts/crosscheck-node.mjs`): **190/190
  rows agree** between `dashboard/recompute.js` and lib/model.ts.
- Gate simulation (`scripts/gate-check.ts --out out`): **all 7 gates
  pass** (dashboard_files, board_file 190 rows, sorted_by_value,
  coverage 34/34, farm_steps, screenshots 3× 1440×900, dossier_matches
  548,090 bytes).
- House-snapshot run: `node main.ts --input <kit>/input/snapshot.json`
  (the sealed 2026-11-14 data, 758 protocols) → **198 rows,
  watchlist 40/40, census 758, all 7 gates pass** (curve R² 0.193,
  LOO 0.913 vs flat 1.003, WF 1.12×, odds AUC 0.712). This is what the
  grader will run: the program refits at runtime from
  `/input/snapshot.json`.
- Screenshots (vanilla Chrome for Testing from the Playwright cache,
  driven over CDP): board, detail rank #1, watchlist filter — all
  three visually checked, 1440×900 JPEG. Two bugs found by the visual
  check and fixed in-session: nearest comps showed `$NaN` (field-name
  mismatch in app.js) and the audit strip overflowed the viewport
  (now wraps).

## makefun check

- Bundle `token-radar-01-rebuild3-transcripts-v1.tar.gz` (196,325 B,
  sha256 e8782452…), local commit a588f5d.
- **Check v1: 15 pass, 1 fail, 5 skip, 5 submission-only. The only
  failure is `thinking_priced` (0 usage rows)** — expected for a
  subagent: the usage row is written only once the run completes. The
  bundle warning says so itself, and the parent re-bundles with
  `--muse-usage` after this session ends (same as rebuild2, whose
  re-bundle then passed fully). Nothing needs rebuilding.
- **`thinking_reproduces` PASS: 1919 of 2244 counted lines (85,5%:
  1919 authored, 0 pasted)**, at least 30% required. The input/
  exclusion from the start + fresh implementation held the ratio.
- thinking_revised PASS, thinking_own_work PASS,
  transcripts_run_record PASS. Kit note (level 34 vs 40) NOT followed,
  per the standing rule.
- **Not pushed, not submitted** — awaiting the parent's EVAL with the
  user. Repo target when approved: hallo-guys-welcome-to-my-github
  (replace rebuild2's files; screenshots 01-board/02-detail/
  03-watchlist.jpg keep their names).
