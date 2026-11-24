#!/usr/bin/env python3
"""Cross-check the token-radar fit in pure Python (stdlib only): recompute
the single-factor OLS + Huber-IRLS curve, the multi-factor OLS + LOO, the
time-split holdout, the logistic odds AUC and the board's implied values
from the snapshot, and compare against out/board.json + out/data.js.
Usage: python3 scripts/crosscheck.py --input input/snapshot.json --out out
"""
import argparse
import json
import math
import sys


def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[(n - 1) // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[piv][col]) < 1e-12:
            raise ValueError("singular matrix")
        M[col], M[piv] = M[piv], M[col]
        d = M[col][col]
        for r in range(col + 1, n):
            f = M[r][col] / d
            for c in range(col, n + 1):
                M[r][c] -= f * M[col][c]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (M[r][n] - sum(M[r][c] * x[c] for c in range(r + 1, n))) / M[r][r]
    return x


def wls(X, y, w):
    p = len(X[0])
    A = [[0.0] * p for _ in range(p)]
    b = [0.0] * p
    for xi, yi, wi in zip(X, y, w):
        for a in range(p):
            b[a] += wi * xi[a] * yi
            for c in range(p):
                A[a][c] += wi * xi[a] * xi[c]
    for a in range(p):
        A[a][a] += 1e-10
    return solve(A, b)


def ols(X, y):
    return wls(X, y, [1.0] * len(X))


def predict(X, beta):
    return [sum(v * beta[j] for j, v in enumerate(row)) for row in X]


def rmse(a, p):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, p)) / len(a))


def r2(a, p):
    m = sum(a) / len(a)
    ss_tot = sum((x - m) ** 2 for x in a)
    ss_res = sum((x - y) ** 2 for x, y in zip(a, p))
    return 1 - ss_res / ss_tot if ss_tot else 0.0


def huber(X, y, k=1.345, max_iter=60):
    beta = ols(X, y)
    for _ in range(max_iter):
        fitted = predict(X, beta)
        resid = [v - f for v, f in zip(y, fitted)]
        med = median(resid)
        mad = median([abs(r - med) for r in resid])
        scale = max(1.4826 * mad, 1e-9)
        w = [1.0 if abs(r) / (k * scale) <= 1 else (k * scale) / abs(r) for r in resid]
        nxt = wls(X, y, w)
        shift = max(abs(a - b) for a, b in zip(nxt, beta))
        beta = nxt
        if shift < 1e-10:
            break
    return beta


def loo_rmse(X, y, fit):
    ss = 0.0
    for i in range(len(X)):
        xt = [r for j, r in enumerate(X) if j != i]
        yt = [v for j, v in enumerate(y) if j != i]
        beta = fit(xt, yt)
        pred = sum(v * beta[j] for j, v in enumerate(X[i]))
        ss += (y[i] - pred) ** 2
    return math.sqrt(ss / len(X))


def sigmoid(x):
    x = max(-30.0, min(30.0, x))
    return 1.0 / (1.0 + math.exp(-x))


def fit_logistic(rawX, y, ridge=1e-4):
    p = len(rawX[0])
    means = [sum(r[j] for r in rawX) / len(rawX) for j in range(p)]
    stds = []
    for j in range(p):
        m = means[j]
        sd = math.sqrt(sum((r[j] - m) ** 2 for r in rawX) / len(rawX))
        stds.append(sd if sd > 1e-9 else 1.0)
    X = [[1.0] + [(r[j] - means[j]) / stds[j] for j in range(p)] for r in rawX]
    beta = [0.0] * (p + 1)
    for _ in range(100):
        eta = [sum(v * beta[j] for j, v in enumerate(row)) for row in X]
        mu = [sigmoid(e) for e in eta]
        w = [max(m * (1 - m), 1e-6) for m in mu]
        z = [eta[i] + (y[i] - mu[i]) / w[i] for i in range(len(X))]
        nxt = wls(X, z, w)
        for j in range(1, len(nxt)):
            nxt[j] = nxt[j] / (1 + ridge)
        shift = max(abs(a - b) for a, b in zip(nxt, beta))
        beta = nxt
        if shift < 1e-10:
            break
    return beta, means, stds


def logi_predict(model, raw):
    beta, means, stds = model
    z = [1.0] + [(raw[j] - means[j]) / stds[j] for j in range(len(raw))]
    return sigmoid(sum(v * beta[j] for j, v in enumerate(z)))


def auc(scores, labels):
    pos = [s for s, l in zip(scores, labels) if l == 1]
    neg = [s for s, l in zip(scores, labels) if l == 0]
    wins = 0.0
    for p in pos:
        for n in neg:
            wins += 1.0 if p > n else (0.5 if p == n else 0.0)
    return wins / (len(pos) * len(neg))


def winsor(v, lo, hi):
    return min(hi, max(lo, v))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="input/snapshot.json")
    ap.add_argument("--out", default="out")
    args = ap.parse_args()

    snap = json.load(open(args.input))
    board = json.load(open(f"{args.out}/board.json"))
    # data.js is a JS file: strip the leading assignment
    raw = open(f"{args.out}/data.js").read()
    data = json.loads(raw[len("window.TOKEN_RADAR = "):-2])

    traded = [p for p in snap["protocols"] if p["mcap_usd"] is not None and p["mcap_usd"] > 0]
    by_sym = {}
    for p in traded:
        key = (p["symbol"] or p["slug"]).upper()
        if key not in by_sym or p["tvl_usd"] > by_sym[key]["tvl_usd"]:
            by_sym[key] = p
    comps = sorted(by_sym.values(), key=lambda p: p["slug"])
    y = [math.log10(p["mcap_usd"]) for p in comps]
    X = [[1.0, math.log10(p["tvl_usd"])] for p in comps]

    checks = []

    def check(name, got, want, tol):
        ok = abs(got - want) <= tol
        checks.append((name, ok, got, want))
        print(f"{'OK  ' if ok else 'FAIL'} {name}: got {got:.6g}, want {want:.6g} (tol {tol:g})")

    # single-factor Huber curve
    beta = huber(X, y)
    check("curve intercept", beta[0], data["curve"]["a"], 1e-6)
    check("curve slope", beta[1], data["curve"]["b"], 1e-6)
    pred = predict(X, beta)
    check("curve R2", r2(y, pred), data["curve"]["r2"], 1e-6)
    check("curve RMSE", rmse(y, pred), data["curve"]["rmse"], 1e-6)
    loo = loo_rmse(X, y, lambda xt, yt: huber(xt, yt))
    check("curve LOO", loo, data["curve"]["loo_rmse"], 1e-6)

    # multi-factor OLS + LOO
    med7 = median([p["change_7d"] for p in comps if p["change_7d"] is not None])
    from collections import Counter
    cats = Counter(p["category"] for p in comps if p["category"])
    dummies = sorted([c for c, n in cats.items() if n >= 5])[:9]

    def mrow(p):
        return [1.0, math.log10(p["tvl_usd"])] + \
            [1.0 if p["category"] == c else 0.0 for c in dummies] + \
            [math.log10(max(1, len(p["chains"]))), (p["change_7d"] if p["change_7d"] is not None else med7) / 100.0]

    Xm = [mrow(p) for p in comps]
    bm = ols(Xm, y)
    check("multi R2", r2(y, predict(Xm, bm)), data["validation"]["multi_r2"], 1e-6)
    check("multi LOO", loo_rmse(Xm, y, lambda xt, yt: ols(xt, yt)), data["validation"]["multi_loo"], 1e-6)

    # holdout
    dated = [p for p in comps if p["listed_at"]]
    dates = sorted(p["listed_at"] for p in dated)
    cutoff = dates[len(dates) // 2]
    fitset = [p for p in dated if p["listed_at"] < cutoff]
    testset = [p for p in dated if p["listed_at"] >= cutoff]
    bh = huber([[1.0, math.log10(p["tvl_usd"])] for p in fitset],
               [math.log10(p["mcap_usd"]) for p in fitset])
    hp = [bh[0] + bh[1] * math.log10(p["tvl_usd"]) for p in testset]
    ha = [math.log10(p["mcap_usd"]) for p in testset]
    check("holdout R2", r2(ha, hp), data["validation"]["holdout_r2"], 1e-6)
    check("holdout cutoff", 0, 0, 0) if cutoff == data["validation"]["holdout_cutoff"] else \
        print(f"FAIL holdout cutoff: got {cutoff}, want {data['validation']['holdout_cutoff']}")

    # logistic odds + AUC
    as_of = snap["as_of"]
    import datetime
    def age_years(day):
        return (datetime.date.fromisoformat(as_of) - datetime.date.fromisoformat(day)).days / 365.25
    rows = []
    for p in snap["protocols"]:
        if not p["listed_at"]:
            continue
        raw7 = p["change_7d"] if p["change_7d"] is not None else med7
        rows.append((p, 0 if (p["gecko_id"] is None and p["symbol"] is None) else 1,
                     [age_years(p["listed_at"]), math.log10(p["tvl_usd"]), winsor(raw7, -50, 100)]))
    Xl = [r[2] for r in rows]
    yl = [r[1] for r in rows]
    model = fit_logistic(Xl, yl)
    scores = [logi_predict(model, r[2]) for r in rows]
    check("odds AUC", auc(scores, yl), data["validation"]["odds_auc"], 1e-4)
    check("odds n", len(rows), data["validation"]["odds_n"], 0)
    check("odds positives", sum(yl), data["validation"]["odds_positives"], 0)

    # board implied values: fitted x odds, rounded
    bad = 0
    for row in board["rows"]:
        p = next(q for q in snap["protocols"] if q["slug"] == row["slug"])
        fitted = 10 ** (beta[0] + beta[1] * math.log10(p["tvl_usd"]))
        age = age_years(p["listed_at"]) if p["listed_at"] else \
            median([r[2][0] for r in rows])
        raw7 = p["change_7d"] if p["change_7d"] is not None else med7
        odds = logi_predict(model, [age, math.log10(p["tvl_usd"]), winsor(raw7, -50, 100)])
        implied = max(1, round(fitted * odds))
        if implied != row["implied_value_usd"]:
            bad += 1
            if bad <= 3:
                print(f"FAIL board {row['slug']}: got {implied}, want {row['implied_value_usd']}")
    print(f"{'OK  ' if bad == 0 else 'FAIL'} board implied values: {len(board['rows']) - bad}/{len(board['rows'])} match")
    if bad:
        checks.append(("board implied", False, bad, 0))
    else:
        checks.append(("board implied", True, 0, 0))

    failed = [c for c in checks if not c[1]]
    print(f"cross-check: {len(checks) - len(failed)}/{len(checks)} pass")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
