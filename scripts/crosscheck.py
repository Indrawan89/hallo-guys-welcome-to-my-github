#!/usr/bin/env python3
"""Cross-check: compare the TypeScript entry's outputs against the independent
Python analysis (scripts/analyze.py, run from the same snapshot).

Compares, with stated tolerances, the curve, every validation number, and all
198 board rows (implied, odds, net, verdict, bootstrap band, rank range,
anchor). Also checks the farm-steps gate shape per row. Run after main.ts:

    python3 scripts/analyze.py > /dev/null
    MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot>
    python3 scripts/crosscheck.py out
"""
import json
import math
import sys

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else "/tmp/out-test"
PY = json.load(open("/tmp/radar-analysis.json"))
PYROWS = {r["slug"]: r for r in json.load(open("/tmp/radar-rows.json"))}
TS = json.load(open(f"{OUTDIR}/board.json"))
TSROWS = {r["slug"]: r for r in TS["rows"]}
raw = open(f"{OUTDIR}/dashboard/data.js").read()
assert raw.startswith("const RADAR = ") and raw.rstrip().endswith(";")
DATA = json.loads(raw[len("const RADAR = "):].rstrip().rstrip(";"))

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name} {detail}")
    else:
        failed += 1
        print(f"  FAIL {name} {detail}")


def close(a, b, tol):
    return abs(a - b) <= tol


print("== curve ==")
c, tc = PY["curve"], DATA["validation"]["curve"]
check("a", close(c["a"], tc["a"], 1e-4), f"py {c['a']:.4f} ts {tc['a']}")  # data.js rounds to 4dp
check("b", close(c["b"], tc["b"], 1e-4), f"py {c['b']:.4f} ts {tc['b']}")
check("r2", close(c["r2"], tc["r2"], 0.002), f"py {c['r2']:.3f} ts {tc['r2']}")
check("rmse_log", close(c["rmse_log"], tc["rmseLog"], 0.002))
check("n comps", 128 == tc["n"], f"ts {tc['n']}")
check("flat multiple", close(PY["comps"]["flat_multiple_median"], tc["flatMultiple"], 1e-4))

print("== LOO ==")
lo, tlo = PY["loo"], DATA["validation"]["loo"]
for key, tol in (("log_rmse_ratio", 0.01), ("dollar_rmse_ratio", 0.01),
                 ("dollar_mae_ratio", 0.01), ("dollar_mse_ratio", 0.02)):
    tk = {"log_rmse_ratio": "logRatio", "dollar_rmse_ratio": "dollarRmseRatio",
          "dollar_mae_ratio": "dollarMaeRatio", "dollar_mse_ratio": "dollarMseRatio"}[key]
    check(f"loo {key}", close(lo[key], tlo[tk], tol), f"py {lo[key]:.3f} ts {tlo[tk]}")
check("loo within3 model", close(lo["within3_model"], tlo["within3Model"], 0.002))
check("loo within3 flat", close(lo["within3_flat"], tlo["within3Flat"], 0.002))

print("== conformal / holdouts / time-split / placebo / walk-forward ==")
co, tco = PY["conformal80"], DATA["validation"]["conformal"]
check("conformal half-width", close(co["half_width_dex"], tco["halfWidthDex"], 0.002))
check("conformal coverage", close(co["coverage_full_fit"], tco["coverage"], 0.01))
for i, h in enumerate(PY["holdouts"]):
    th = DATA["validation"]["holdouts"][i]
    check(f"holdout seed {h['seed']} log", close(h["log_ratio"], th["logRatio"], 0.01))
    check(f"holdout seed {h['seed']} dollar", close(h["dollar_ratio"], th["dollarRatio"], 0.01))
    check(f"holdout seed {h['seed']} n", h["n_test"] == th["nTest"])
ts_, tts = PY["time_split"], DATA["validation"]["timeSplit"]
check("time-split log", close(ts_["log_ratio"], tts["logRatio"], 0.01))
check("time-split dollar", close(ts_["dollar_ratio"], tts["dollarRatio"], 0.01))
check("time-split r2", close(ts_["test_r2_log"], tts["testR2"], 0.002))
check("placebo r2", close(PY["placebo"]["r2"], DATA["validation"]["placebo"]["r2"], 0.002))
wf, twf = PY["walk_forward"], DATA["validation"]["walkForward"]
check("WF pooled log", close(wf["pooled"]["log_ratio"], twf["pooled"]["logRatio"], 0.01))
check("WF pooled dollar", close(wf["pooled"]["dollar_ratio"], twf["pooled"]["dollarRatio"], 0.01))
check("WF pooled n", wf["pooled"]["n_test"] == twf["pooled"]["nTest"])
for w, tw in zip(wf["per_year"], twf["perYear"]):
    check(f"WF {w['year']} dollar", close(w["dollar_ratio"], tw["dollarRatio"], 0.01),
          f"py {w['dollar_ratio']:.2f} ts {tw['dollarRatio']}")

print("== odds ==")
od, tod = PY["odds"], DATA["validation"]["odds"]
check("OR age", close(od["or_age_per_year"], tod["orAge"], 0.01), f"py {od['or_age_per_year']:.2f} ts {tod['orAge']}")
check("OR logTVL", close(od["or_logtvl"], tod["orLogTvl"], 0.01))
check("OR 7d", close(od["or_7d_per_point"], tod["or7d"], 0.002))
check("AUC", close(od["auc"], tod["auc"], 0.002), f"py {od['auc']:.3f} ts {tod['auc']}")
for k in ("no_age", "no_logtvl", "no_7d"):
    tk = {"no_age": "noAge", "no_logtvl": "noLogTvl", "no_7d": "no7d"}[k]
    check(f"ablation {k}", close(od["ablation"][k], tod["ablation"][tk], 0.002))

print("== board rows ==")
check("row count", len(TSROWS) == 198, f"ts {len(TSROWS)}")
bad = {"implied": 0, "odds": 0, "net": 0, "verdict": 0, "band": 0, "rankrange": 0, "anchor": 0}
for slug, pr in PYROWS.items():
    tr = TSROWS.get(slug)
    if tr is None:
        for k in bad:
            bad[k] += 1
        continue
    if not close(pr["implied"], tr["implied_value_usd"], 2):
        bad["implied"] += 1
    if not close(pr["odds"], tr["token_odds"], 0.005):
        bad["odds"] += 1
    if not close(pr["net"], tr["net_expected_usd"], 2):
        bad["net"] += 1
    if pr["verdict"] != tr["verdict"]:
        bad["verdict"] += 1
    if not (close(pr["band_lo"], tr["range_90pct_usd"][0], max(500, 0.02 * pr["band_lo"])) and
            close(pr["band_hi"], tr["range_90pct_usd"][1], max(500, 0.02 * pr["band_hi"]))):
        bad["band"] += 1
    if not (abs(pr["rank_lo"] - tr["rank_range"][0]) <= 1 and
            abs(pr["rank_hi"] - tr["rank_range"][1]) <= 1):
        bad["rankrange"] += 1
    if pr["anchor"] != tr["anchor"]["name"]:
        bad["anchor"] += 1
for k, v in bad.items():
    check(f"board {k} 198/198", v == 0, f"mismatches {v}")
check("total implied", close(PY["board"]["total_implied"], DATA["meta"]["totalImplied"], 198),
      f"py {PY['board']['total_implied']} ts {DATA['meta']['totalImplied']}")
check("top row", TS["rows"][0]["name"] == PY["board"]["top3"][0][0],
      f"ts {TS['rows'][0]['name']}")
check("verdicts", PY["board"]["verdicts"] == {"FARM": sum(1 for r in TS["rows"] if r["verdict"] == "FARM"),
      "WATCH": sum(1 for r in TS["rows"] if r["verdict"] == "WATCH"),
      "SKIP": sum(1 for r in TS["rows"] if r["verdict"] == "SKIP")},
      f"py {PY['board']['verdicts']}")
check("FARM in top 8", PY["board"]["farm_in_top8"] == sum(1 for r in TS["rows"][:8] if r["verdict"] == "FARM"))
check("census sums to 758", DATA["census"]["total"] == 758 and
      DATA["census"]["comps"] + DATA["census"]["tradedNotComps"] + DATA["census"]["board"] + DATA["census"]["offBoard"] == 758)

print("== farm steps shape ==")
bad_steps = 0
for r in TS["rows"]:
    steps = r["farm_steps"]
    if not (3 <= len(steps) <= 12):
        bad_steps += 1
        continue
    for s in steps:
        if not (20 <= len(s.strip()) <= 600):
            bad_steps += 1
            break
check("farm_steps 3-12 x 20-600 chars, all rows", bad_steps == 0, f"bad rows {bad_steps}")
# ranks exactly 1..N, implied non-increasing
ranks = [r["rank"] for r in TS["rows"]]
check("ranks 1..N", sorted(ranks) == list(range(1, 199)))
impl = [r["implied_value_usd"] for r in TS["rows"]]
check("implied non-increasing by rank", all(impl[i] >= impl[i + 1] for i in range(len(impl) - 1)))

print(f"\nCROSSCHECK: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
