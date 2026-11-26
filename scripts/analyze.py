#!/usr/bin/env python3
"""Token-radar rebuild6-fresh: independent numeric analysis of the house snapshot.

Computes, from the sealed snapshot alone, every number the dashboard will
show: the Huber-IRLS size curve, leave-one-out validation in log and dollar
units, two random holdouts, a time split, a placebo refit, conformal bands,
a walk-forward test, the token-odds logistic model, bootstrap rank ranges,
and the 198-row board with farmer-share net expected and return verdicts.

Nothing here is copied from any earlier entry: every figure is fitted or
counted from the snapshot in this session. The TypeScript entry (main.ts)
re-implements the same pipeline; scripts/crosscheck.py compares the two.
"""
import json
import math
import random
from datetime import date

SNAP = "/home/hatch/workspace/makefun/kits/token-radar-01-kit/token-radar-01-kit/input/snapshot.json"
OUT = "/tmp/radar-analysis.json"

AS_OF = date(2026, 11, 14)
GAS_USD = 48.0
DEPOSIT_USD = 10_000.0
FARMER_SHARE = 0.0001          # one $10k farmer captures ~0.01% of implied value
AGE_CAP_YEARS = 4.0
HOURS_PER_PLAN = 26.0         # hours of attention across a 90-day farm plan


# ---------------------------------------------------------------- PRNG (mulberry32, mirrored in main.ts)
def mulberry32(seed):
    state = seed & 0xFFFFFFFF

    def rnd():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rnd


def shuffle_idx(rnd, n):
    idx = list(range(n))
    for i in range(n - 1, 0, -1):
        j = int(rnd() * (i + 1))
        idx[i], idx[j] = idx[j], idx[i]
    return idx


def bootstrap_idx(rnd, n):
    return [int(rnd() * n) for _ in range(n)]


# ---------------------------------------------------------------- small numeric helpers
def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def quantile(xs, q):
    s = sorted(xs)
    if not s:
        return float("nan")
    pos = q * (len(s) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def mean(xs):
    return sum(xs) / len(xs)


def rmse(errs):
    return math.sqrt(mean([e * e for e in errs]))


def mae(errs):
    return mean([abs(e) for e in errs])


def mse(errs):
    return mean([e * e for e in errs])


def solve_linear(a, b):
    """Solve a small dense linear system by Gaussian elimination."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[piv][col]) < 1e-14:
            raise ValueError("singular matrix")
        m[col], m[piv] = m[piv], m[col]
        for r in range(col + 1, n):
            f = m[r][col] / m[col][col]
            for c in range(col, n + 1):
                m[r][c] -= f * m[col][c]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (m[i][n] - sum(m[i][j] * x[j] for j in range(i + 1, n))) / m[i][i]
    return x


def huber_irls(xs, ys, c=1.345, iters=100, tol=1e-12):
    """Huber IRLS fit of y = a + b*x. Returns (a, b, scale, iters_used)."""
    n = len(xs)
    # OLS start
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    for it in range(iters):
        res = [y - (a + b * x) for x, y in zip(xs, ys)]
        mad = median([abs(r - median(res)) for r in res])
        scale = 1.4826 * mad if mad > 0 else 1.0
        w = []
        for r in res:
            u = abs(r) / (c * scale)
            w.append(1.0 if u <= 1 else 1.0 / u)
        sw = sum(w)
        swx = sum(wi * x for wi, x in zip(w, xs))
        swy = sum(wi * y for wi, y in zip(w, ys))
        swxx = sum(wi * x * x for wi, x in zip(w, xs))
        swxy = sum(wi * x * y for wi, x, y in zip(w, xs, ys))
        det = sw * swxx - swx * swx
        a2 = (swy * swxx - swx * swxy) / det
        b2 = (sw * swxy - swx * swy) / det
        if abs(a2 - a) < tol and abs(b2 - b) < tol:
            return a2, b2, scale, it + 1
        a, b = a2, b2
    return a, b, scale, iters


def ols(xs, ys):
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my - b * mx, b


def r2_of(xs, ys, a, b):
    my = mean(ys)
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")


def logistic_irls(features, target, iters=100, tol=1e-10):
    """Logistic regression by IRLS. features: list of feature vectors (with
    leading 1 for the intercept). Returns coefficients."""
    p = len(features[0])
    beta = [0.0] * p
    for _ in range(iters):
        xtwx = [[0.0] * p for _ in range(p)]
        xtwz = [0.0] * p
        for xi, yi in zip(features, target):
            z = sum(b * v for b, v in zip(beta, xi))
            mu = 1.0 / (1.0 + math.exp(-max(-35.0, min(35.0, z))))
            w = max(mu * (1.0 - mu), 1e-9)
            zi = z + (yi - mu) / w
            for i in range(p):
                for j in range(p):
                    xtwx[i][j] += w * xi[i] * xi[j]
                xtwz[i] += w * xi[i] * zi
        beta2 = solve_linear(xtwx, xtwz)
        if max(abs(x - y) for x, y in zip(beta2, beta)) < tol:
            return beta2
        beta = beta2
    return beta


def auc_score(target, score):
    pos = [s for t, s in zip(target, score) if t == 1]
    neg = [s for t, s in zip(target, score) if t == 0]
    if not pos or not neg:
        return float("nan")
    wins = ties = 0
    for p in pos:
        for q in neg:
            if p > q:
                wins += 1
            elif p == q:
                ties += 1
    return (wins + 0.5 * ties) / (len(pos) * len(neg))


# ---------------------------------------------------------------- load snapshot
snap = json.load(open(SNAP))
prots = snap["protocols"]
watch = snap["watchlist"]
by_slug = {p["slug"]: p for p in prots}

ages = {}
for p in prots:
    if p.get("listed_at"):
        y, m, d = (int(v) for v in p["listed_at"].split("-"))
        ages[p["slug"]] = (AS_OF - date(y, m, d)).days / 365.25
median_age = median(list(ages.values()))
for p in prots:
    p["_age"] = ages.get(p["slug"], median_age)
    ch = p.get("change_7d")
    p["_chg7"] = 0.0 if ch is None else max(-50.0, min(100.0, ch))
    # "records a token" per RULES.txt: gecko_id OR symbol is not null.
    # gecko_id alone misses tokens whose market cap the snapshot does not
    # carry (e.g. Binance CEX records symbol BNB but no gecko_id/mcap).
    p["_has_token"] = 1 if (p.get("gecko_id") is not None
                            or p.get("symbol") is not None) else 0


def age_years(p):
    return p["_age"]


# ---------------------------------------------------------------- comps: one per ticker, mcap>0 and tvl>0
raw_comps = [p for p in prots if p.get("mcap_usd") and p["mcap_usd"] > 0
             and p.get("tvl_usd") and p["tvl_usd"] > 0]
by_sym = {}
for p in raw_comps:
    sym = p.get("symbol") or p["slug"]
    if sym not in by_sym or p["tvl_usd"] > by_sym[sym]["tvl_usd"]:
        by_sym[sym] = p
comps = sorted(by_sym.values(), key=lambda p: p["slug"])
xs = [math.log10(p["tvl_usd"]) for p in comps]
ys = [math.log10(p["mcap_usd"]) for p in comps]
n_comp = len(comps)
multiples = [p["mcap_usd"] / p["tvl_usd"] for p in comps]
flat_mult = median(multiples)
flat_log = median(ys)

a, b, scale, huber_iters = huber_irls(xs, ys)
a_ols, b_ols = ols(xs, ys)
fit_r2 = r2_of(xs, ys, a, b)
fit_rmse_log = rmse([y - (a + b * x) for x, y in zip(xs, ys)])
report = {
    "snapshot": {"as_of": snap["as_of"], "protocols": len(prots),
                 "watchlist": len(watch), "floor_usd": snap["floor_usd"]},
    "comps": {"raw": len(raw_comps), "one_per_ticker": n_comp,
              "dropped_dupes": len(raw_comps) - n_comp,
              "flat_multiple_median": flat_mult,
              "flat_log_median": flat_log},
    "curve": {"a": a, "b": b, "r2": fit_r2, "rmse_log": fit_rmse_log,
              "huber_scale": scale, "huber_iters": huber_iters,
              "ols_a": a_ols, "ols_b": b_ols},
}


def predict_log(tvl):
    return a + b * math.log10(tvl)


def predict_usd(tvl):
    return 10 ** predict_log(tvl)


# ---------------------------------------------------------------- LOO (log + dollar)
loo_log_err, loo_dol_err, loo_flat_log_err, loo_flat_dol_err = [], [], [], []
for i in range(n_comp):
    xs_i = xs[:i] + xs[i + 1:]
    ys_i = ys[:i] + ys[i + 1:]
    ai, bi, _, _ = huber_irls(xs_i, ys_i)
    pred_log = ai + bi * xs[i]
    loo_log_err.append(ys[i] - pred_log)
    loo_dol_err.append(comps[i]["mcap_usd"] - 10 ** pred_log)
    loo_flat_log_err.append(ys[i] - flat_log)
    loo_flat_dol_err.append(comps[i]["mcap_usd"] - flat_mult * comps[i]["tvl_usd"])

within3_model = mean([1.0 if abs(e) <= math.log10(3) else 0.0 for e in loo_log_err])
within3_flat = mean([1.0 if abs(math.log10(comps[i]["mcap_usd"] / (flat_mult * comps[i]["tvl_usd"]))) <= math.log10(3) else 0.0 for i in range(n_comp)])
report["loo"] = {
    "log_rmse_ratio": rmse(loo_flat_log_err) / rmse(loo_log_err),
    "log_rmse_model": rmse(loo_log_err),
    "dollar_rmse_ratio": rmse(loo_flat_dol_err) / rmse(loo_dol_err),
    "dollar_mae_ratio": mae(loo_flat_dol_err) / mae(loo_dol_err),
    "dollar_mse_ratio": mse(loo_flat_dol_err) / mse(loo_dol_err),
    "dollar_rmse_model": rmse(loo_dol_err),
    "within3_model": within3_model,
    "within3_flat": within3_flat,
}

# ---------------------------------------------------------------- conformal 80% from LOO residuals
abs_loo = sorted(abs(e) for e in loo_log_err)
k = math.ceil(0.80 * (n_comp + 1))
half_width = abs_loo[min(k, n_comp) - 1]
fit_res = [y - (a + b * x) for x, y in zip(xs, ys)]
coverage = mean([1.0 if abs(r) <= half_width else 0.0 for r in fit_res])
report["conformal80"] = {"half_width_dex": half_width, "coverage_full_fit": coverage}


# ---------------------------------------------------------------- holdouts (two random splits)
def holdout(seed, frac=0.2):
    rnd = mulberry32(seed)
    order = shuffle_idx(rnd, n_comp)
    n_test = int(round(n_comp * frac))
    test = sorted(order[:n_test])
    train = sorted(order[n_test:])
    atr, btr, _, _ = huber_irls([xs[i] for i in train], [ys[i] for i in train])
    log_err = [ys[i] - (atr + btr * xs[i]) for i in test]
    dol_err = [comps[i]["mcap_usd"] - 10 ** (atr + btr * xs[i]) for i in test]
    flog_err = [ys[i] - flat_log for i in test]
    fdol_err = [comps[i]["mcap_usd"] - flat_mult * comps[i]["tvl_usd"] for i in test]
    return {"seed": seed, "n_test": n_test,
            "log_ratio": rmse(flog_err) / rmse(log_err),
            "dollar_ratio": rmse(fdol_err) / rmse(dol_err),
            "test_r2_log": r2_of([xs[i] for i in test], [ys[i] for i in test], atr, btr)}


report["holdouts"] = [holdout(7), holdout(42)]

# ---------------------------------------------------------------- time split
CUTOFF = "2024-02-18"
train_idx = [i for i, p in enumerate(comps)
             if p.get("listed_at") and p["listed_at"] < CUTOFF]
test_idx = [i for i, p in enumerate(comps)
            if p.get("listed_at") and p["listed_at"] >= CUTOFF]
atr, btr, _, _ = huber_irls([xs[i] for i in train_idx], [ys[i] for i in train_idx])
log_err = [ys[i] - (atr + btr * xs[i]) for i in test_idx]
dol_err = [comps[i]["mcap_usd"] - 10 ** (atr + btr * xs[i]) for i in test_idx]
flog_err = [ys[i] - flat_log for i in test_idx]
fdol_err = [comps[i]["mcap_usd"] - flat_mult * comps[i]["tvl_usd"] for i in test_idx]
report["time_split"] = {
    "cutoff": CUTOFF, "n_train": len(train_idx), "n_test": len(test_idx),
    "log_ratio": rmse(flog_err) / rmse(log_err),
    "dollar_ratio": rmse(fdol_err) / rmse(dol_err),
    "test_r2_log": r2_of([xs[i] for i in test_idx], [ys[i] for i in test_idx], atr, btr),
}

# ---------------------------------------------------------------- placebo: shuffled outcome
rnd = mulberry32(123)
order = shuffle_idx(rnd, n_comp)
ys_shuf = [ys[i] for i in order]
ap, bp, _, _ = huber_irls(xs, ys_shuf)
report["placebo"] = {"r2": r2_of(xs, ys_shuf, ap, bp)}

# ---------------------------------------------------------------- walk-forward by listing year
# Expanding window by calendar year: train on comps listed in earlier years
# (at least 5), test on the next year's listings. Years before 2022 have
# too little training data to test. Pooled = all test years together.
wf_tests = []
pool_log, pool_dol, pool_flog, pool_fdol = [], [], [], []
for year in range(2021, 2027):
    tr = [i for i, p in enumerate(comps)
          if p.get("listed_at") and int(p["listed_at"][:4]) < year]
    te = [i for i, p in enumerate(comps)
          if p.get("listed_at") and int(p["listed_at"][:4]) == year]
    if len(tr) < 5 or not te:
        continue
    aw, bw, _, _ = huber_irls([xs[i] for i in tr], [ys[i] for i in tr])
    log_err = [ys[i] - (aw + bw * xs[i]) for i in te]
    dol_err = [comps[i]["mcap_usd"] - 10 ** (aw + bw * xs[i]) for i in te]
    flog_err = [ys[i] - flat_log for i in te]
    fdol_err = [comps[i]["mcap_usd"] - flat_mult * comps[i]["tvl_usd"] for i in te]
    wf_tests.append({"year": year, "n_train": len(tr), "n_test": len(te),
                     "log_ratio": rmse(flog_err) / rmse(log_err),
                     "dollar_ratio": rmse(fdol_err) / rmse(dol_err)})
    for i in te:
        pool_log.append(ys[i] - (aw + bw * xs[i]))
        pool_dol.append(comps[i]["mcap_usd"] - 10 ** (aw + bw * xs[i]))
        pool_flog.append(ys[i] - flat_log)
        pool_fdol.append(comps[i]["mcap_usd"] - flat_mult * comps[i]["tvl_usd"])
report["walk_forward"] = {
    "per_year": wf_tests,
    "pooled": {"n_test": len(pool_log),
               "log_ratio": rmse(pool_flog) / rmse(pool_log),
               "dollar_ratio": rmse(pool_fdol) / rmse(pool_dol)},
}

# ---------------------------------------------------------------- odds model (logistic, age capped at 4y)
fitted = [p for p in prots if p.get("listed_at")]
X = [[1.0, min(p["_age"], AGE_CAP_YEARS), math.log10(p["tvl_usd"]), p["_chg7"]]
     for p in fitted]
y = [p["_has_token"] for p in fitted]
beta = logistic_irls(X, y)
scores = [sum(bi * xi for bi, xi in zip(beta, row)) for row in X]
probs = [1.0 / (1.0 + math.exp(-max(-35.0, min(35.0, s)))) for s in scores]
odds_auc = auc_score(y, probs)


def odds_auc_drop(drop):
    keep = [j for j in range(4) if j != drop]
    X2 = [[row[j] for j in keep] for row in X]
    b2 = logistic_irls(X2, y)
    s2 = [sum(bi * xi for bi, xi in zip(b2, row)) for row in X2]
    p2 = [1.0 / (1.0 + math.exp(-max(-35.0, min(35.0, s)))) for s in s2]
    return auc_score(y, p2)


report["odds"] = {
    "n_fitted": len(fitted),
    "or_age_per_year": math.exp(beta[1]),
    "or_logtvl": math.exp(beta[2]),
    "or_7d_per_point": math.exp(beta[3]),
    "intercept": beta[0],
    "auc": odds_auc,
    "ablation": {"no_age": odds_auc_drop(1), "no_logtvl": odds_auc_drop(2),
                 "no_7d": odds_auc_drop(3)},
    "median_age_years": median_age,
}


def token_odds(p):
    z = (beta[0] + beta[1] * min(p["_age"], AGE_CAP_YEARS)
         + beta[2] * math.log10(p["tvl_usd"]) + beta[3] * p["_chg7"])
    return 1.0 / (1.0 + math.exp(-max(-35.0, min(35.0, z))))


# ---------------------------------------------------------------- board: watchlist 40 + 158 early rows
# "Records no token" = both gecko_id and symbol null (RULES.txt). Early rows
# are the protocols that record no token, are not on the watchlist, and pass
# the watchlist rule's own launch-candidate checks (not a wrapped, staked or
# bridged product; category not Bridge/Canonical Bridge/Liquid Staking/
# Liquid Restaking/Restaked BTC/CEX; name carries no version marker and no
# whole word wrapped/staked/staking; name does not begin with an exchange's
# name). There are exactly 158 of them, so the board holds every launch
# candidate the snapshot records. No floor condition is applied to early
# rows: the floor bounds the watchlist, not the board (RULES.txt: the
# watchlist is the floor, never the ceiling). The house's parentProtocol
# check cannot be applied: it is not one of the snapshot's ten fields.
import re as _re
EXCL_CAT = {"Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking",
            "Restaked BTC", "CEX"}
EXCH_NAMES = ("Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX",
              "Bitfinex", "Gemini")


def _excluded(p):
    if p.get("category") in EXCL_CAT:
        return True
    name = p.get("name") or ""
    if _re.search(r"\s([Vv]\d+(\.\d+)?|\d+\.\d+)$", name):
        return True
    if _re.search(r"\b(wrapped|staked|staking)\b", name, _re.I):
        return True
    if name.startswith(EXCH_NAMES):
        return True
    return False


wl_set = set(watch)
early = [p for p in prots if not p["_has_token"] and p["slug"] not in wl_set
         and not _excluded(p)]
early.sort(key=lambda p: (-p["tvl_usd"], p["slug"]))
board_prots = [by_slug[s] for s in watch] + early[:158]
rows = []
for p in board_prots:
    imp = predict_usd(p["tvl_usd"])
    od = token_odds(p)
    net = od * imp * FARMER_SHARE - GAS_USD
    ret = net / DEPOSIT_USD
    verdict = "FARM" if (ret > 0.20 and od > 0.40) else ("WATCH" if ret > 0.05 else "SKIP")
    rows.append({"slug": p["slug"], "name": p["name"], "tvl": p["tvl_usd"],
                 "implied": round(imp), "odds": od, "net": net,
                 "return": ret, "verdict": verdict})
rows.sort(key=lambda r: (-r["implied"], r["slug"]))
for i, r in enumerate(rows):
    r["rank"] = i + 1
report["board"] = {
    "rows": len(rows),
    "total_implied": sum(r["implied"] for r in rows),
    "top3": [(r["name"], r["implied"]) for r in rows[:3]],
    "verdicts": {v: sum(1 for r in rows if r["verdict"] == v)
                 for v in ("FARM", "WATCH", "SKIP")},
    "farm_in_top8": sum(1 for r in rows[:8] if r["verdict"] == "FARM"),
    "top_net": round(rows[0]["net"]),
    "max_odds": max(r["odds"] for r in rows),
}

# ---------------------------------------------------------------- bootstrap bands + rank ranges (B=200)
B = 200
rnd = mulberry32(20261126)
boot_curves = []
for _ in range(B):
    idx = bootstrap_idx(rnd, n_comp)
    ab, bb, _, _ = huber_irls([xs[i] for i in idx], [ys[i] for i in idx])
    boot_curves.append((ab, bb))
for r in rows:
    p = by_slug[r["slug"]]
    lx = math.log10(p["tvl_usd"])
    vals = sorted(10 ** (ab + bb * lx) for ab, bb in boot_curves)
    r["band_lo"] = vals[int(0.05 * B)]
    r["band_hi"] = vals[int(0.95 * B)]
    conf_lo = 10 ** (math.log10(r["implied"]) - half_width)
    conf_hi = 10 ** (math.log10(r["implied"]) + half_width)
    r["conf_lo"], r["conf_hi"] = conf_lo, conf_hi
# rank ranges: per refit, rank all 198 rows by implied
rank_hist = {r["slug"]: [] for r in rows}
for ab, bb in boot_curves:
    scored = sorted(rows, key=lambda r: (-(10 ** (ab + bb * math.log10(by_slug[r["slug"]]["tvl_usd"]))), r["slug"]))
    for pos, r in enumerate(scored):
        rank_hist[r["slug"]].append(pos + 1)
for r in rows:
    h = sorted(rank_hist[r["slug"]])
    r["rank_lo"] = h[int(0.05 * B)]
    r["rank_hi"] = h[int(0.95 * B)]
report["bootstrap"] = {
    "B": B,
    "band_example_top1": {"lo": rows[0]["band_lo"], "hi": rows[0]["band_hi"]},
    "rank_range_top1": [rows[0]["rank_lo"], rows[0]["rank_hi"]],
    "median_band_width_ratio": median([r["band_hi"] / r["band_lo"] for r in rows]),
}

# ---------------------------------------------------------------- census partition
# 758 = 128 fitted comps + 288 traded but not fitted + 198 board rows
# + 144 protocols that record no token but fail the launch-candidate rule
# (wrapped/staked/bridged, CEX/bridge categories, versioned or
# exchange-named) and so are off the board.
n_traded = sum(1 for p in prots if p["_has_token"])
n_notok = len(prots) - n_traded
n_notok_offboard = n_notok - len(board_prots)
report["census"] = {
    "total": len(prots),
    "traded_comps_fitted": n_comp,
    "traded_not_comps": n_traded - n_comp,
    "board_rows": len(rows),
    "no_token_off_board": n_notok_offboard,
    "check_sum": n_comp + (n_traded - n_comp) + len(rows) + n_notok_offboard,
    "watchlist_covered": len(watch),
}

# ---------------------------------------------------------------- anchors: nearest traded comp by TVL
for r in rows:
    p = by_slug[r["slug"]]
    lx = math.log10(p["tvl_usd"])
    best = min(comps, key=lambda c: (abs(math.log10(c["tvl_usd"]) - lx), c["slug"]))
    r["anchor"] = {"name": best["name"], "mcap": best["mcap_usd"],
                   "tvl": best["tvl_usd"],
                   "multiple": best["mcap_usd"] / best["tvl_usd"]}

json.dump(report, open(OUT, "w"), indent=1)
json.dump([{"slug": r["slug"], "name": r["name"], "rank": r["rank"],
            "implied": r["implied"], "odds": r["odds"], "net": r["net"],
            "verdict": r["verdict"], "band_lo": r["band_lo"],
            "band_hi": r["band_hi"], "rank_lo": r["rank_lo"],
            "rank_hi": r["rank_hi"], "anchor": r["anchor"]["name"]}
           for r in rows], open("/tmp/radar-rows.json", "w"), indent=1)
print(json.dumps(report, indent=1))
print("\nWROTE", OUT)
