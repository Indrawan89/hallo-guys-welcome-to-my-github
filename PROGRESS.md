# PROGRESS — token-radar-01 rebuild2 (fix after the 24 Nov rejection)

## Why this rebuild exists

Submission 01a20b31 (rebuild1) was rejected by the site:
`rejected: thinking_reproduces: the transcripts account for 1271 of 12861
counted lines (9.8%), under the 30% required`. Cause: `input/snapshot.json`
(13,729 lines) was copied from the old entry, not written in a recorded
session. Local `makefun check` passed (79.1%) because it counts code lines
only; the site counts every repo line. This rebuild fixes that honestly:
the snapshot is regenerated from the live DefiLlama feed inside this
session by a script written here, and the model is refit on it.

## Data — regenerated in-session

- Script: `scripts/fetch-snapshot.mjs` (written fresh, Node stdlib only).
- Source: `https://api.llama.fi/protocols` (HTTP 200, 9,101 records).
- New snapshot as_of **2026-11-24**: 726 protocols ≥ $5M floor, watchlist
  **34** (was 40 on the 14 Nov snapshot), 50 categories, 121 traded comps
  (mcap > 0), 604 pre-token, 616 with listed_at, 723 with change_7d.
- Watchlist drop 40 → 34 is real data movement: firelight, mezo-earn,
  tulipa-capital, noble fell below the $50M floor; infinifi launched a
  token (INFI); opentrade and plume-vaults left the protocols list.
- Data quirk found: `autofinance` carries mcap_usd = -1 (DefiLlama
  sentinel). Treated as not-traded; it records a token, so it lands in
  the token-no-mcap census bucket.
- Snapshot file: 237,459 bytes, 13,168 lines, 1-space-indent JSON.

## Fit — refit on the new snapshot

- Curve: `log10(mcap) = 3.1646 + 0.5022·log10(TVL)`, R² 0.195, RMSE 0.863,
  n = 121 comps. Flat median multiple 0.2144 (flat RMSE 0.960).
- Odds (logistic, age / logTVL / 7d change): intercept -1.790, age +0.611
  (OR 1.84), logTVL +0.100 (OR 1.11), 7d change -0.002 (OR 1.00 — no
  effect on this snapshot, unlike rebuild1's -0.140), AUC 0.699.
- LOO: curve RMSE 0.876 vs flat 0.960 → 1.10× better.
- Time-split holdout (cutoff 2024-02-06; fit 45, test 44): R² 0.038,
  RMSE 0.869. Better than rebuild1's 0.015, still weak — stated honestly
  on the dashboard.
- Bootstrap B = 200, seed 20261124: slope 90% [0.376, 0.653],
  intercept 90% [2.032, 4.247]. Per-row implied-value bands from the
  same refits.
- Board: **190 rows** (34 watchlist + 156 early). Not 198: the new
  snapshot has only 190 eligible protocols — every eligible protocol is
  on the board (eligible-not-selected = 0). Gate allows 100–4,000 rows.
- Top 3 (same order as rebuild1, lower values): Steakhouse Financial
  $40,683,708 · Sentora Curator $36,717,018 · Veda $32,188,750.
  Total implied $938,743,605.
- Census sums exactly: traded 121 + ranked 190 + token-no-mcap 277 +
  forbidden 122 + versioned 11 + wrapped 5 + exchange 0 +
  eligible-not-selected 0 = 726.
- Farm plans: 6 steps/row, lengths 83–138 chars (gate: 20–600).

## Implementation — written fresh in this session

- `lib/model.ts` (~24 KB): curve OLS, logistic odds (GD, standardised,
  raw-scale coefficients), LOO, time-split, bootstrap, board builder,
  farm plans, census. Written from the brief + rebuild1 PROGRESS.md
  facts only — rebuild1's code files were never read or copied.
- `main.ts`: entrypoint, hard gates before writing (coverage 34/34,
  ranks 1..N, implied non-increasing, farm-step lengths, census sum),
  writes board.json / data.js / dashboard / screenshots / dossier.json.
- `dashboard/` (index.html 3,736 B + app.css 3,822 B + app.js ~16.8 KB):
  dark theme, KPI strip, sortable/filterable board, detail view (model
  breakdown, bootstrap band, 3 nearest comps, farm plan), methodology,
  census, research note, live tokens. Total ~24.4 KB, under the 64 KB
  dossier text cap. Loads `../data.js` (output root, not in dossier).
- `vendor/makefun-board.ts`: copied unchanged from the kit starter
  (sha256 9ca51b6e…).
- `scripts/fetch-snapshot.mjs`: the fetch + watchlist rule.

## Test runs (local)

- Run 1 (24 Nov ~10:35 WIB): `node main.ts --input input/snapshot.json
  --output out` — exit 0, dossier skipped (no screenshots yet).
  All hard gates passed; census 726 == 726.
- Determinism: `out` vs `out2` byte-identical twice (before and after
  screenshots + dossier were added).
- Python cross-check (`scripts/crosscheck.py`): all 21 comparisons match
  exactly (curve, flat multiple, LOO, holdout, odds coefficients + AUC,
  bootstrap bands for the top 3 rows).
- Gate simulation (`scripts/gate-check.ts --out out`): **all 7 gates pass**
  (dashboard_files, board_file, sorted_by_value, coverage 34/34,
  farm_steps, screenshots 3× 1440×900, dossier_matches byte-identical).
- House-snapshot run: `node main.ts --input <kit>/input/snapshot.json`
  (the sealed 2026-11-14 data, 758 protocols) → 198 rows, watchlist
  40/40, census 758 == 758, all 7 gates pass. This is what the grader
  will run: the program refits at runtime from `/input/snapshot.json`.
- Screenshots (vanilla Chrome for Testing from the Playwright cache —
  the system browser refuses to start without a Hatch WebGL policy
  file): board, detail rank #1, watchlist filter — all three visually
  checked, 1440×900 JPEG.

## makefun check v1 (bundle without usage rows)

- Bundle `token-radar-01-rebuild2-transcripts-v1.tar.gz` (316,823 B,
  sha256 40653d43…): 14 pass, 2 fail.
- **thinking_reproduces FAIL: 1985 of 13106 counted lines (15.1%)**,
  under the 30% required. Root cause found by reading the kit's
  authorship v12 ledger: the snapshot's 13,168 lines were IN the repo,
  so they dominated the denominator while counting as neither authored
  nor pasted (a script's output never appears in the transcript).
  Regenerating the snapshot in-session was necessary but not sufficient.
- **Fix (the original entry's own pattern): `input/` is git-ignored,
  exactly like the original token-radar-01 entry — the sealed snapshot
  is house data, read from `/input/snapshot.json` at grade time, and
  never committed.** After removing it from git, tracked lines fall
  from 16,810 to ~3,644 and the ratio should rise to ~76%.
- thinking_priced FAIL: 0 usage rows — expected for a subagent: the
  usage row is written only once the run completes. The check's own fix
  text says the top-level agent re-runs the SELECT and re-bundles after
  the subagent finishes. The parent must do that step.
- thinking_revised PASS (model.ts from 4 messages, main.ts from 3);
  thinking_own_work PASS (1985 own lines, 0 from another entry);
  transcripts_run_record PASS; repo_* checks are submission-only.

## makefun check v2 (after input/ excluded from git)

- Bundle `token-radar-01-rebuild2-transcripts-v2.tar.gz` (352,357 B,
  sha256 207bcfad…), commit 715b398.
- **thinking_reproduces PASS: 1881 of 2172 counted lines (86.6%),
  at least 30% required; main.ts has 206 authored lines.** The input/
  exclusion fixed the ratio (was 15.1% with the snapshot committed).
- **thinking_priced still FAIL (0 usage rows)** — the only remaining
  failure. It cannot be fixed from inside this session: the usage row
  for this agent is written only once the run completes. The parent
  runs the SELECT from `agent.agent_message_token_usage` (join
  `agent.agents` for the model), writes
  `~/.makefun/muse-usage-token-radar-01-rebuild2.jsonl`, and re-bundles
  with `--muse-usage` added. Nothing needs rebuilding.
- Everything else passes (15 pass, 5 skip, 5 submission-only).
- Note in the check output: "this kit copy is level 34 and
  https://make.fun is at level 40" — the kit's download-again note is
  NOT followed (standing rule).
