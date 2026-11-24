#!/usr/bin/env python3
"""Independent cross-check of lib/model.ts, in pure stdlib Python.
Reads input/snapshot.json + out/data.js and recomputes: comps + dedup,
multi-factor OLS (coefficients, R2, RMSE), flat multiple, LOO RMSE,
time-split holdout, logistic odds + AUC, within-3x. Exits non-zero on any
mismatch beyond tolerance. No third-party packages.
"""
import json
import math
import sys

SNAP = sys.argv[sys.argv.index("out/data.js") + 1] if "out/data.js" in sys.argv else "out/data.js"
snap = json.load(open("input/snapshot.json"))
raw = open(SNAP).read()
data = json.loads(raw[raw.index("{") : raw.rindex("}") + 1])
V = data["validation"]


def log10(x):
    return math.log10(max(1.0, x))


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        assert abs(M[piv][col]) > 1e-12, "singular"
        M[col], M[piv] = M[piv], M[col]
        for r in range(col + 1, n):
            f = M[r][col] / M[col][col]
            for c in range(col, n + 1):
                M[r][c] -= f * M[col][c]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (M[r][n] - sum(M[r][c] * x[c] for c in range(r + 1, n))) / M[r][r]
    return x


def ols(X, y):
    p = len(X[0])
    XtX = [[0.0] * p for _ in range(p)]
    Xty = [0.0] * p
    for xi, yi in zip(X, y):
        for a in range(p):
            Xty[a] += xi[a] * yi
            for b in range(p):
                XtX[a][b] += xi[a] * xi[b]
    return solve(XtX, Xty)


def mean(xs):
    return sum(xs) / len(xs)


def median(xs):
    s = sorted(xs)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


def r2(y, pred):
    m = mean(y)
    ss_tot = sum((v - m) ** 2 for v in y)
    ss_res = sum((v - p) ** 2 for v, p in zip(y, pred))
    return 1 - ss_res / ss_tot if ss_tot else 0.0


def rmse(y, pred):
    return math.sqrt(mean([(v - p) ** 2 for v, p in zip(y, pred)]))


# --- comps, one per ticker ---
traded = [p for p in snap["protocols"] if (p["mcap_usd"] or 0) > 0]
by_sym = {}
for p in traded:
    k = p["symbol"] or p["slug"]
    if k not in by_sym or p["tvl_usd"] > by_sym[k]["tvl_usd"]:
        by_sym[k] = p
comps = list(by_sym.values())
assert len(comps) == V["nComps"], f"nComps {len(comps)} != {V['nComps']}"
assert len(traded) == V["dedupBefore"] and len(comps) == V["dedupAfter"]

from collections import Counter

cats = Counter(p["category"] for p in comps if p["category"])
dummies = sorted(c for c, n in cats.items() if n >= 5)


def feat(p):
    row = [1.0, log10(p["tvl_usd"])]
    row += [1.0 if p["category"] == c else 0.0 for c in dummies]
    row += [log10(len(p["chains"])), (p["change_7d"] or 0) / 100.0]
    return row


X = [feat(p) for p in comps]
y = [log10(p["mcap_usd"]) for p in comps]
beta = ols(X, y)
pred = [sum(v * b for v, b in zip(row, beta)) for row in X]
print(f"OLS R2 {r2(y, pred):.4f} (TS multi {V['selection']['multiR2']:.4f})  RMSE {rmse(y, pred):.4f} (TS multi {V['selection']['multiRmse']:.4f})")
assert abs(r2(y, pred) - V["selection"]["multiR2"]) < 1e-6
assert abs(rmse(y, pred) - V["selection"]["multiRmse"]) < 1e-6
assert abs(beta[1] - V["selection"]["multiOls"]["logTvl"]) < 1e-6, "multi logTvl coef differs"

flat = median([p["mcap_usd"] / p["tvl_usd"] for p in comps])
flat_pred = [log10(p["tvl_usd"] * flat) for p in comps]
assert abs(flat - V["flatMultiple"]) < 1e-9
assert abs(rmse(y, flat_pred) - V["flatRmse"]) < 1e-6

# --- LOO (multi-factor) ---
loo = []
for i in range(len(comps)):
    bi = ols([r for j, r in enumerate(X) if j != i], [v for j, v in enumerate(y) if j != i])
    loo.append(sum(v * b for v, b in zip(X[i], bi)))
print(f"LOO RMSE (multi) {rmse(y, loo):.4f} (TS {V['selection']['multiLooRmse']:.4f})")
assert abs(rmse(y, loo) - V["selection"]["multiLooRmse"]) < 1e-6

# --- single-factor OLS + LOO (the selected curve) ---
X1 = [[1.0, log10(p["tvl_usd"])] for p in comps]
b1 = ols(X1, y)
p1 = [sum(v * b for v, b in zip(row, b1)) for row in X1]
print(f"single-factor OLS R2 {r2(y, p1):.4f} (TS {V['olsR2']:.4f})  RMSE {rmse(y, p1):.4f} (TS {V['olsRmse']:.4f})")
assert abs(r2(y, p1) - V["olsR2"]) < 1e-6
assert abs(rmse(y, p1) - V["olsRmse"]) < 1e-6
loo1 = []
for i in range(len(comps)):
    bi = ols([r for j, r in enumerate(X1) if j != i], [v for j, v in enumerate(y) if j != i])
    loo1.append(sum(v * b for v, b in zip(X1[i], bi)))
print(f"single-factor OLS LOO {rmse(y, loo1):.4f} (TS {V['selection']['singleLooOlsRmse']:.4f})")
assert abs(rmse(y, loo1) - V["selection"]["singleLooOlsRmse"]) < 1e-6

def huber_fit(X, y, start):
    beta = list(start)
    for _ in range(30):
        resid = [yi - sum(v * b for v, b in zip(row, beta)) for row, yi in zip(X, y)]
        s = 1.4826 * median([abs(r) for r in resid]) or 1.0
        k = 1.345 * s
        w = [1.0 if abs(r) <= k else k / abs(r) for r in resid]
        p = len(beta)
        XtWX = [[0.0] * p for _ in range(p)]
        XtWy = [0.0] * p
        for row, yi, wi in zip(X, y, w):
            for a in range(p):
                XtWy[a] += wi * row[a] * yi
                for b in range(p):
                    XtWX[a][b] += wi * row[a] * row[b]
        nxt = solve(XtWX, XtWy)
        delta = max(abs(a - b) for a, b in zip(nxt, beta))
        beta = nxt
        if delta < 1e-10:
            break
    return beta


# --- time-split holdout (median listing date), Huber refit like TS ---
dated = sorted([p for p in comps if p["listed_at"]], key=lambda p: p["listed_at"])
cutoff = dated[len(dated) // 2]["listed_at"]
fit_idx = [i for i, p in enumerate(comps) if p["listed_at"] and p["listed_at"] < cutoff]
test_idx = [i for i, p in enumerate(comps) if p["listed_at"] and p["listed_at"] >= cutoff]
b_start = ols([X1[i] for i in fit_idx], [y[i] for i in fit_idx])
bh = huber_fit([X1[i] for i in fit_idx], [y[i] for i in fit_idx], b_start)
hp = [sum(v * b for v, b in zip(X1[i], bh)) for i in test_idx]
hy = [y[i] for i in test_idx]
print(f"holdout cutoff {cutoff} (TS {V['holdout']['cutoff']}) R2 {r2(hy, hp):.4f} (TS {V['holdout']['r2']:.4f})")
assert cutoff == V["holdout"]["cutoff"]
assert abs(r2(hy, hp) - V["holdout"]["r2"]) < 1e-6
assert abs(rmse(hy, hp) - V["holdout"]["rmse"]) < 1e-6

# --- logistic odds + AUC ---
as_of = snap["as_of"]


def age(p):
    if not p["listed_at"]:
        return None
    from datetime import date

    a = date.fromisoformat(as_of)
    b = date.fromisoformat(p["listed_at"])
    return (a - b).days / 365.25


pop = [(p, age(p)) for p in snap["protocols"]]
pop = [(p, a) for p, a in pop if a is not None]
OX = [[a, log10(p["tvl_usd"]), (p["change_7d"] or 0) / 100.0] for p, a in pop]
OY = [1 if (p["gecko_id"] is not None or p["symbol"] is not None) else 0 for p, _ in pop]
mu = [mean([r[j] for r in OX]) for j in range(3)]
sd = [(mean([(r[j] - mu[j]) ** 2 for r in OX]) ** 0.5 or 1) for j in range(3)]
OZ = [[(r[j] - mu[j]) / sd[j] for j in range(3)] for r in OX]
w = [0.0] * 4
for _ in range(3000):
    grad = [0.0] * 4
    for zi, yi in zip(OZ, OY):
        z = w[0] + sum(w[j + 1] * zi[j] for j in range(3))
        err = 1 / (1 + math.exp(-z)) - yi
        grad[0] += err
        for j in range(3):
            grad[j + 1] += err * zi[j]
    lr = 0.5 / len(OZ)
    delta = max(abs(lr * g) for g in grad)
    w = [v - lr * g for v, g in zip(w, grad)]
    if delta < 1e-12:
        break
scores = []
for zi in OZ:
    z = w[0] + sum(w[j + 1] * zi[j] for j in range(3))
    scores.append(1 / (1 + math.exp(-z)))
pos = [s for s, t in zip(scores, OY) if t == 1]
neg = [s for s, t in zip(scores, OY) if t == 0]
wins = sum(1 if a > b else 0.5 if a == b else 0 for a in pos for b in neg)
auc = wins / (len(pos) * len(neg))
print(f"odds AUC {auc:.4f} (TS {V['oddsAuc']:.4f})  n={len(pop)} pos={sum(OY)}")
assert abs(auc - V["oddsAuc"]) < 1e-3
assert len(pop) == V["oddsN"] and sum(OY) == V["oddsPos"]

# --- within-3x (in-sample, OLS) ---
w3 = sum(1 for v, p in zip(y, pred) if abs(v - p) <= math.log10(3)) / len(y)
print(f"within-3x in-sample (OLS) {w3:.3f}")
print("ALL PYTHON CROSS-CHECKS PASSED")
