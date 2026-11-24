#!/usr/bin/env python3
"""Independent cross-check of the token-radar fit (pure Python, no TS code).

Recomputes from input/snapshot.json: the log-log size curve, flat multiple,
LOO errors, the time-split holdout, the logistic token-odds model and the
bootstrap bands for the top 3 board rows. Compares against out/board.json
and out/data.js. Exits non-zero on any mismatch beyond tolerance.
"""
import json
import math
import re
import sys

SNAP = "input/snapshot.json"
BOARD = "out/board.json"
DATA = "out/data.js"


def median(xs):
    s = sorted(xs)
    m = len(s)
    return s[(m - 1) // 2] if m % 2 == 1 else (s[m // 2 - 1] + s[m // 2]) / 2


def mean(xs):
    return sum(xs) / len(xs)


def ols(xs, ys):
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx
    return my - b * mx, b


def r2(xs, ys, a, b):
    my = mean(ys)
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return 1 - ss_res / ss_tot


def rmse(xs, ys, a, b):
    return math.sqrt(sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys)) / len(xs))


def mulberry32(seed):
    s = seed & 0xFFFFFFFF

    def nxt():
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = s
        t = (((t ^ (t >> 15)) & 0xFFFFFFFF) * (t | 1)) & 0xFFFFFFFF
        im = (((t ^ (t >> 7)) & 0xFFFFFFFF) * (t | 61)) & 0xFFFFFFFF
        t = (t ^ ((t + im) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def main():
    snap = json.load(open(SNAP))
    protos = snap["protocols"]
    as_of = snap["as_of"]
    comps = [p for p in protos if p["mcap_usd"] is not None and p["mcap_usd"] > 0 and p["tvl_usd"] > 0]
    xs = [math.log10(p["tvl_usd"]) for p in comps]
    ys = [math.log10(p["mcap_usd"]) for p in comps]
    a, b = ols(xs, ys)
    mults = [p["mcap_usd"] / p["tvl_usd"] for p in comps]
    flat = median(mults)
    flat_log = math.log(flat) / math.log(10)
    flat_rmse = math.sqrt(sum((y - (flat_log + x)) ** 2 for x, y in zip(xs, ys)) / len(xs))

    # LOO
    ss_c = ss_f = 0.0
    for i in range(len(comps)):
        xl = [x for j, x in enumerate(xs) if j != i]
        yl = [y for j, y in enumerate(ys) if j != i]
        ai, bi = ols(xl, yl)
        ss_c += (ys[i] - (ai + bi * xs[i])) ** 2
        ss_f += (ys[i] - (flat_log + xs[i])) ** 2
    loo_rmse = math.sqrt(ss_c / len(comps))
    loo_flat = math.sqrt(ss_f / len(comps))

    # Time-split holdout
    dated = [p for p in comps if p["listed_at"] is not None]
    dates = sorted(p["listed_at"] for p in dated)
    cutoff = dates[len(dates) // 2]
    fit_set = [p for p in dated if p["listed_at"] <= cutoff]
    test_set = [p for p in dated if p["listed_at"] > cutoff]
    xf = [math.log10(p["tvl_usd"]) for p in fit_set]
    yf = [math.log10(p["mcap_usd"]) for p in fit_set]
    af, bf = ols(xf, yf)
    xt = [math.log10(p["tvl_usd"]) for p in test_set]
    yt = [math.log10(p["mcap_usd"]) for p in test_set]

    # Logistic token odds (same recipe: standardise, GD lr 0.1, 3000 iters)
    ages_known = [
        max(0.0, (math.floor(__import__("datetime").datetime.fromisoformat(as_of).timestamp())
                  - math.floor(__import__("datetime").datetime.fromisoformat(p["listed_at"]).timestamp())) / (365.25 * 86400))
        for p in protos if p["listed_at"] is not None
    ]
    med_age = median(ages_known)

    def age_years(p):
        if p["listed_at"] is None:
            return med_age
        import datetime
        d0 = datetime.datetime.fromisoformat(as_of)
        d1 = datetime.datetime.fromisoformat(p["listed_at"])
        return max(0.0, (d0 - d1).total_seconds() / (365.25 * 86400))

    feats = []
    for p in protos:
        chg = 0.0 if p["change_7d"] is None else max(-100.0, min(500.0, p["change_7d"]))
        feats.append((age_years(p), math.log10(p["tvl_usd"]), chg,
                      1 if (p["gecko_id"] is not None or p["symbol"] is not None) else 0))
    m_age = mean([f[0] for f in feats])
    m_log = mean([f[1] for f in feats])
    m_chg = mean([f[2] for f in feats])
    sd = lambda v, mu: math.sqrt(sum((x - mu) ** 2 for x in v) / len(v)) or 1.0
    s_age = sd([f[0] for f in feats], m_age)
    s_log = sd([f[1] for f in feats], m_log)
    s_chg = sd([f[2] for f in feats], m_chg)
    z = [((f[0] - m_age) / s_age, (f[1] - m_log) / s_log, (f[2] - m_chg) / s_chg) for f in feats]
    w0 = w1 = w2 = w3 = 0.0
    n = len(feats)
    for _ in range(3000):
        g0 = g1 = g2 = g3 = 0.0
        for i in range(n):
            lin = w0 + w1 * z[i][0] + w2 * z[i][1] + w3 * z[i][2]
            d = 1.0 / (1.0 + math.exp(-lin)) - feats[i][3] if lin >= 0 else math.exp(lin) / (1.0 + math.exp(lin)) - feats[i][3]
            g0 += d
            g1 += d * z[i][0]
            g2 += d * z[i][1]
            g3 += d * z[i][2]
        w0 -= 0.1 * g0 / n
        w1 -= 0.1 * g1 / n
        w2 -= 0.1 * g2 / n
        w3 -= 0.1 * g3 / n
    c_age = w1 / s_age
    c_log = w2 / s_log
    c_chg = w3 / s_chg
    c0 = w0 - w1 * m_age / s_age - w2 * m_log / s_log - w3 * m_chg / s_chg

    def odds_of(p):
        lin = c0 + c_age * age_years(p) + c_log * math.log10(p["tvl_usd"]) + c_chg * (
            0.0 if p["change_7d"] is None else max(-100.0, min(500.0, p["change_7d"])))
        return 1.0 / (1.0 + math.exp(-lin)) if lin >= 0 else math.exp(lin) / (1.0 + math.exp(lin))

    scored = [(odds_of(p), 1 if (p["gecko_id"] is not None or p["symbol"] is not None) else 0) for p in protos]
    pos = [s for s, y in scored if y == 1]
    neg = [s for s, y in scored if y == 0]
    wins = ties = 0
    for x in pos:
        for y in neg:
            if x > y:
                wins += 1
            elif x == y:
                ties += 1
    auc = (wins + 0.5 * ties) / (len(pos) * len(neg))

    # Bootstrap bands for the top 3 rows (B=200, seed 20261124)
    rng = mulberry32(20261124)
    pairs = []
    for _ in range(200):
        rx, ry = [], []
        for _ in range(len(comps)):
            j = int(rng() * len(comps))
            rx.append(xs[j])
            ry.append(ys[j])
        pairs.append(ols(rx, ry))
    board = json.load(open(BOARD))
    m = board["model"]
    data = json.loads(re.sub(r"^window\.TOKEN_RADAR = ", "", open(DATA).read()).rstrip().rstrip(";"))
    fails = []

    def cmp(name, got, want, tol):
        ok = abs(got - want) <= tol
        print(f"  {'PASS' if ok else 'FAIL'} {name}: python={got:.6g} ts={want:.6g} tol={tol:g}")
        if not ok:
            fails.append(name)

    print("CROSS-CHECK (python vs typescript output)")
    cmp("curve a", a, m["size_curve"]["a"], 1e-9)
    cmp("curve b", b, m["size_curve"]["b"], 1e-9)
    cmp("curve R2", r2(xs, ys, a, b), m["size_curve"]["r2"], 1e-9)
    cmp("curve RMSE", rmse(xs, ys, a, b), m["size_curve"]["rmse"], 1e-9)
    cmp("flat multiple", flat, m["size_curve"]["flat_multiple"], 1e-9)
    cmp("flat RMSE", flat_rmse, m["size_curve"]["flat_rmse"], 1e-9)
    cmp("LOO curve RMSE", loo_rmse, m["loo"]["rmse"], 1e-9)
    cmp("LOO flat RMSE", loo_flat, m["loo"]["flat_rmse"], 1e-9)
    cmp("holdout R2", r2(xt, yt, af, bf), m["holdout"]["r2"], 1e-9)
    cmp("holdout RMSE", rmse(xt, yt, af, bf), m["holdout"]["rmse"], 1e-9)
    cmp("odds intercept", c0, m["token_odds"]["intercept"], 1e-6)
    cmp("odds coef age", c_age, m["token_odds"]["coef_age_years"], 1e-6)
    cmp("odds coef logTvl", c_log, m["token_odds"]["coef_log_tvl"], 1e-6)
    cmp("odds coef change", c_chg, m["token_odds"]["coef_change_7d"], 1e-6)
    cmp("odds AUC", auc, m["token_odds"]["auc"], 1e-9)
    print(f"  holdout cutoff: python={cutoff} ts={m['holdout']['cutoff']} nFit={len(fit_set)}/{m['holdout']['n_fit']} nTest={len(test_set)}/{m['holdout']['n_test']}")
    if cutoff != m["holdout"]["cutoff"] or len(fit_set) != m["holdout"]["n_fit"] or len(test_set) != m["holdout"]["n_test"]:
        fails.append("holdout split")
    for row in data["rows"][:3]:
        lt = math.log10(row["tvl_usd"])
        vals = sorted(10 ** (pa + pb * lt) * row["odds"] for pa, pb in pairs)
        lo = vals[int(0.05 * len(vals))]
        hi = vals[int(0.95 * len(vals))]
        cmp(f"band lo {row['slug']}", lo, row["band_lo_usd"], 1.0)
        cmp(f"band hi {row['slug']}", hi, row["band_hi_usd"], 1.0)
    if fails:
        print(f"{len(fails)} mismatch(es): {fails}")
        sys.exit(1)
    print("all cross-checks match")


if __name__ == "__main__":
    main()
