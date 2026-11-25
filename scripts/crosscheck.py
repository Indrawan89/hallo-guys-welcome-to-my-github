#!/usr/bin/env python3
"""Reference implementation for token-radar rebuild5 — recomputes every
model number from the snapshot + data.js and checks the TS output agrees.
Usage: python3 scripts/crosscheck.py [--input input/snapshot.json] [--out out]
Exit 0 when all checks pass."""
import json, math, random, statistics, sys, argparse

ap = argparse.ArgumentParser()
ap.add_argument('--input', default='input/snapshot.json')
ap.add_argument('--out', default='out')
args = ap.parse_args()

snap = json.load(open(args.input))
P = snap['protocols']
as_of = snap['as_of']

def median(xs):
    return statistics.median(xs)

def solve2(a11, a12, a22, b1, b2):
    det = a11 * a22 - a12 * a12
    assert abs(det) > 1e-12, 'singular 2x2'
    return ((b1 * a22 - b2 * a12) / det, (a11 * b2 - a12 * b1) / det)

def ols2(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx
    a = my - b * mx
    return a, b

def huber_fit(xs, ys, iters=10, k=1.345):
    a, b = ols2(xs, ys)
    for _ in range(iters):
        res = [y - (a + b * x) for x, y in zip(xs, ys)]
        med = median(res)
        sigma = 1.4826 * median([abs(r - med) for r in res]) or 1e-9
        w = [1.0 if abs(r) <= k * sigma else k * sigma / abs(r) for r in res]
        sw = sum(w)
        mx = sum(wi * x for wi, x in zip(w, xs)) / sw
        my = sum(wi * y for wi, y in zip(w, ys)) / sw
        sxx = sum(wi * (x - mx) ** 2 for wi, x in zip(w, xs))
        sxy = sum(wi * (x - mx) * (y - my) for wi, x, y in zip(w, xs, ys))
        b = sxy / sxx
        a = my - b * mx
    res = [y - (a + b * x) for x, y in zip(xs, ys)]
    rmse = math.sqrt(sum(r * r for r in res) / len(res))
    mean_y = sum(ys) / len(ys)
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    r2 = 1 - sum(r * r for r in res) / ss_tot
    return a, b, r2, rmse

def solve_lin(A, b):
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        assert abs(M[piv][c]) > 1e-12, 'singular'
        M[c], M[piv] = M[piv], M[c]
        for r in range(c + 1, n):
            f = M[r][c] / M[c][c]
            for cc in range(c, n + 1):
                M[r][cc] -= f * M[c][cc]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        s = M[r][n] - sum(M[r][c] * x[c] for c in range(r + 1, n))
        x[r] = s / M[r][r]
    return x

def ols_multi(X, y):
    p = len(X[0])
    A = [[sum(X[k][i] * X[k][j] for k in range(len(X))) for j in range(p)] for i in range(p)]
    b = [sum(X[k][i] * y[k] for k in range(len(X))) for i in range(p)]
    return solve_lin(A, b)

def predict_multi(beta, x):
    return sum(bi * xi for bi, xi in zip(beta, x))

def logistic_fit(X, y, iters=50):
    p = len(X[0])
    beta = [0.0] * p
    for _ in range(iters):
        g = [0.0] * p
        H = [[0.0] * p for _ in range(p)]
        for xi, yi in zip(X, y):
            z = sum(bi * xij for bi, xij in zip(beta, xi))
            z = max(-30.0, min(30.0, z))
            pr = 1.0 / (1.0 + math.exp(-z))
            w = pr * (1.0 - pr) + 1e-9
            for i in range(p):
                g[i] += (yi - pr) * xi[i]
                for j in range(p):
                    H[i][j] += w * xi[i] * xi[j]
        # ridge for stability
        for i in range(p):
            H[i][i] += 1e-6
        step = solve_lin(H, g)
        beta = [bi + si for bi, si in zip(beta, step)]
        if max(abs(s) for s in step) < 1e-8:
            break
    return beta

def auc(scores, labels):
    pos = [s for s, l in zip(scores, labels) if l == 1]
    neg = [s for s, l in zip(scores, labels) if l == 0]
    wins = 0.0
    for p in pos:
        for n in neg:
            wins += 1.0 if p > n else (0.5 if p == n else 0.0)
    return wins / (len(pos) * len(neg))

# ---- comps: traded, dedup one-per-ticker (keep larger TVL) ----
comps_raw = [p for p in P if p['mcap_usd'] is not None and p['mcap_usd'] > 0]
seen = {}
for p in sorted(comps_raw, key=lambda x: -x['tvl_usd']):
    s = (p['symbol'] or '').lower()
    if s and s in seen:
        continue
    seen[s] = p
comps = list(seen.values())
xs = [math.log10(p['tvl_usd']) for p in comps]
ys = [math.log10(p['mcap_usd']) for p in comps]
a, b, r2, rmse = huber_fit(xs, ys)
mults = [p['mcap_usd'] / p['tvl_usd'] for p in comps]
flat_mult = median(mults)
flat_rmse = math.sqrt(sum((y - (x + math.log10(flat_mult))) ** 2 for x, y in zip(xs, ys)) / len(xs))

# LOO (Huber refits)
loo_err, loo_flat_err = [], []
for i in range(len(comps)):
    xi = xs[:i] + xs[i + 1:]
    yi = ys[:i] + ys[i + 1:]
    ai, bi, _, _ = huber_fit(xi, yi)
    loo_err.append(ys[i] - (ai + bi * xs[i]))
    fm = median([comps[j]['mcap_usd'] / comps[j]['tvl_usd'] for j in range(len(comps)) if j != i])
    loo_flat_err.append(ys[i] - (xs[i] + math.log10(fm)))
loo_rmse = math.sqrt(sum(e * e for e in loo_err) / len(loo_err))
loo_flat_rmse = math.sqrt(sum(e * e for e in loo_flat_err) / len(loo_flat_err))
loo_ratio = loo_flat_rmse / loo_rmse
within3 = sum(1 for e in loo_err if abs(e) <= math.log10(3)) / len(loo_err)
within2 = sum(1 for e in loo_err if abs(e) <= math.log10(2)) / len(loo_err)

# random 80/20 holdout, fixed seed
rng = random.Random(20261125)
idx = list(range(len(comps)))
rng.shuffle(idx)
cut = int(0.8 * len(idx))
tr, te = idx[:cut], idx[cut:]
ah, bh, _, _ = huber_fit([xs[i] for i in tr], [ys[i] for i in tr])
herr = [ys[i] - (ah + bh * xs[i]) for i in te]
hflat = [ys[i] - (xs[i] + math.log10(flat_mult)) for i in te]
hold_ratio = math.sqrt(sum(e * e for e in hflat) / len(hflat)) / math.sqrt(sum(e * e for e in herr) / len(herr))

# time-split holdout (median listing date)
dated = [(p, i) for i, p in enumerate(comps) if p['listed_at']]
dates = sorted(p['listed_at'] for p, _ in dated)
cutoff = dates[len(dates) // 2]
tr2 = [i for p, i in dated if p['listed_at'] < cutoff]
te2 = [i for p, i in dated if p['listed_at'] >= cutoff]
at, bt, _, _ = huber_fit([xs[i] for i in tr2], [ys[i] for i in tr2])
terr = [ys[i] - (at + bt * xs[i]) for i in te2]
tflat = [ys[i] - (xs[i] + math.log10(flat_mult)) for i in te2]
ts_ratio = math.sqrt(sum(e * e for e in tflat) / len(tflat)) / math.sqrt(sum(e * e for e in terr) / len(terr))
ts_r2 = 1 - sum(e * e for e in terr) / sum((ys[i] - sum(ys[j] for j in te2) / len(te2)) ** 2 for i in te2)

# placebo: shuffle log-mcap, OLS R^2
ys_shuf = ys[:]
rng2 = random.Random(20261125)
rng2.shuffle(ys_shuf)
ap_, bp_ = ols2(xs, ys_shuf)
res_p = [y - (ap_ + bp_ * x) for x, y in zip(xs, ys_shuf)]
my = sum(ys_shuf) / len(ys_shuf)
placebo_r2 = 1 - sum(r * r for r in res_p) / sum((y - my) ** 2 for y in ys_shuf)

# conformal: cross-conformal from LOO residuals, coverage on the random holdout
abs_loo = sorted(abs(e) for e in loo_err)
hw = abs_loo[math.ceil(0.80 * (len(abs_loo) + 1)) - 1]
cov = sum(1 for e in herr if abs(e) <= hw) / len(herr)

# walk-forward by listing year
wf_num, wf_den, wf_n = [], [], 0
wf_years = {}
for p, i in dated:
    y = int(p['listed_at'][:4])
    train = [j for q, j in dated if int(q['listed_at'][:4]) < y]
    if len(train) < 5:
        continue
    aw, bw, _, _ = huber_fit([xs[j] for j in train], [ys[j] for j in train])
    e = ys[i] - (aw + bw * xs[i])
    f = ys[i] - (xs[i] + math.log10(flat_mult))
    wf_num.append(e * e)
    wf_den.append(f * f)
    wf_n += 1
    wf_years.setdefault(y, [0.0, 0.0, 0])
    wf_years[y][0] += e * e
    wf_years[y][1] += f * f
    wf_years[y][2] += 1
wf_ratio = math.sqrt(sum(wf_den) / len(wf_den)) / math.sqrt(sum(wf_num) / len(wf_num)) if wf_num else float('nan')

# multi-factor OLS (for the neutral sentence + ablation)
cats = sorted({p['category'] for p in comps if p['category']})
cat_counts = {c: sum(1 for p in comps if p['category'] == c) for c in cats}
big_cats = [c for c in cats if cat_counts[c] >= 5]
def feats(p):
    v = [1.0, math.log10(p['tvl_usd'])]
    v += [1.0 if p['category'] == c else 0.0 for c in big_cats]
    v.append(math.log10(len(p['chains']) or 1))
    v.append((p['change_7d'] or 0.0) / 100.0)
    return v
X = [feats(p) for p in comps]
beta_m = ols_multi(X, ys)
res_m = [y - predict_multi(beta_m, x) for x, y in zip(X, ys)]
rmse_m = math.sqrt(sum(r * r for r in res_m) / len(res_m))
r2_m = 1 - sum(r * r for r in res_m) / sum((y - sum(ys) / len(ys)) ** 2 for y in ys)
loo_m = []
for i in range(len(comps)):
    Xi = X[:i] + X[i + 1:]
    yi = ys[:i] + ys[i + 1:]
    bi = ols_multi(Xi, yi)
    loo_m.append(ys[i] - predict_multi(bi, X[i]))
loo_rmse_m = math.sqrt(sum(e * e for e in loo_m) / len(loo_m))

# bootstrap B=200
rng3 = random.Random(20261124)
slopes, inters = [], []
for _ in range(200):
    sidx = [rng3.randrange(len(comps)) for _ in range(len(comps))]
    ab, bb, _, _ = huber_fit([xs[i] for i in sidx], [ys[i] for i in sidx])
    inters.append(ab)
    slopes.append(bb)
slopes_s, inters_s = sorted(slopes), sorted(inters)
slope_lo, slope_hi = slopes_s[9], slopes_s[190]
int_lo, int_hi = inters_s[9], inters_s[190]

# odds logistic: sample = listed_at non-null; features age / logTVL / winsorized 7d
def age_years(p):
    from datetime import date
    y0, m0, d0 = map(int, p['listed_at'].split('-'))
    y1, m1, d1 = map(int, as_of.split('-'))
    return (date(y1, m1, d1) - date(y0, m0, d0)).days / 365.25
odds_rows = []
for p in P:
    if not p['listed_at']:
        continue
    c7 = p['change_7d'] if p['change_7d'] is not None else 0.0
    c7w = max(-50.0, min(100.0, c7))
    odds_rows.append((p, [1.0, age_years(p), math.log10(p['tvl_usd']), c7w / 10.0],
                      1 if (p['gecko_id'] is not None or p['symbol'] is not None) else 0))
Xo = [r[1] for r in odds_rows]
yo = [r[2] for r in odds_rows]
bo = logistic_fit(Xo, yo)
scores = [sum(bi * xi for bi, xi in zip(bo, x)) for x in Xo]
odds_auc = auc(scores, yo)
ors = [math.exp(bo[1]), math.exp(bo[2]), math.exp(bo[3])]
# ablation
def auc_without(drop):
    keep = [i for i in range(4) if i != drop]
    Xi = [[x[i] for i in keep] for x in Xo]
    bi = logistic_fit(Xi, yo)
    si = [sum(bj * xj for bj, xj in zip(bi, x)) for x in Xi]
    return auc(si, yo)
auc_no_age, auc_no_tvl, auc_no_7d = auc_without(1), auc_without(2), auc_without(3)

print(f"comps n={len(comps)} curve a={a:.4f} b={b:.4f} R2={r2:.3f} rmse={rmse:.3f} flat_mult={flat_mult:.4f} flat_rmse={flat_rmse:.3f}")
print(f"LOO rmse={loo_rmse:.3f} flat={loo_flat_rmse:.3f} ratio={loo_ratio:.3f} within3={within3:.3f} within2={within2:.3f}")
print(f"holdout80/20 ratio={hold_ratio:.3f} (n_test={len(te)}) time-split ratio={ts_ratio:.3f} R2={ts_r2:.3f} (cutoff {cutoff}, fit {len(tr2)}, test {len(te2)})")
print(f"placebo R2={placebo_r2:.4f} conformal hw={hw:.3f} dex coverage={cov:.2f} (n_test={len(herr)})")
print(f"WF pooled={wf_ratio:.3f} n={wf_n} years={ {y: (round(math.sqrt(v[1]/v[2])/math.sqrt(v[0]/v[2]),3), v[2]) for y,v in sorted(wf_years.items())} }")
print(f"multi OLS R2={r2_m:.3f} rmse={rmse_m:.3f} LOO={loo_rmse_m:.3f}")
print(f"bootstrap slope 90% [{slope_lo:.3f},{slope_hi:.3f}] intercept [{int_lo:.3f},{int_hi:.3f}]")
print(f"odds n={len(odds_rows)} pos={sum(yo)} AUC={odds_auc:.3f} ORs age={ors[0]:.2f} logTVL={ors[1]:.2f} 7d={ors[2]:.2f} ablation no-age={auc_no_age:.3f} no-tvl={auc_no_tvl:.3f} no-7d={auc_no_7d:.3f}")

# ---- compare against the TS output (data.js) ----
data_txt = open(f'{args.out}/data.js').read()
prefix = 'window.TOKEN_RADAR = '
assert data_txt.startswith(prefix), 'data.js prefix mismatch'
radar = json.loads(data_txt[len(prefix):].rstrip().rstrip(';'))
model = radar['model']
board = json.load(open(f'{args.out}/board.json'))['rows']
fails = []
def chk(name, got, want, tol):
    ok = abs(got - want) <= tol
    print(('PASS' if ok else 'FAIL'), f'{name}: got {got:.4f} want {want:.4f} tol {tol}')
    if not ok:
        fails.append(name)
chk('curve_a', model['curve']['a'], a, 0.005)
chk('curve_b', model['curve']['b'], b, 0.005)
chk('curve_r2', model['curve']['r2'], r2, 0.01)
chk('curve_rmse', model['curve']['rmse'], rmse, 0.01)
chk('loo_ratio', model['loo']['ratio'], loo_ratio, 0.02)
chk('loo_rmse', model['loo']['rmse'], loo_rmse, 0.01)
chk('holdout_ratio', model['heldOut']['random']['ratio'], hold_ratio, 0.02)
chk('timesplit_ratio', model['heldOut']['timeSplit']['ratio'], ts_ratio, 0.02)
chk('placebo_r2', model['placebo']['r2'], placebo_r2, 0.01)
chk('conformal_hw', model['conformal']['halfWidthDex'], hw, 0.01)
chk('conformal_cov', model['conformal']['coverage'], cov, 0.02)
chk('wf_ratio', model['walkForward']['pooled'], wf_ratio, 0.02)
chk('multi_loo', model['multi']['looRmse'], loo_rmse_m, 0.01)
chk('odds_auc', model['odds']['auc'], odds_auc, 0.01)
chk('odds_n', model['odds']['n'], len(odds_rows), 0)
chk('odds_pos', model['odds']['positives'], sum(yo), 0)
chk('slope_lo', model['bootstrap']['slope'][0], slope_lo, 0.01)
chk('slope_hi', model['bootstrap']['slope'][1], slope_hi, 0.01)
chk('within3', model['loo']['within3'], within3, 0.01)
# board implied values
bad = 0
for row in board:
    p = next(q for q in P if q['slug'] == row['slug'])
    want = 10 ** (a + b * math.log10(p['tvl_usd']))
    got = row['implied_value_usd']
    if abs(got - want) > max(1.0, want * 0.001):
        bad += 1
        if bad <= 3:
            print('FAIL board implied', row['slug'], 'got', got, 'want', round(want))
print(('PASS' if bad == 0 else 'FAIL'), f'board implied {len(board) - bad}/{len(board)}')
if bad:
    fails.append('board_implied')
print('RESULT:', 'ALL PASS' if not fails else f'FAILED: {fails}')
sys.exit(0 if not fails else 1)
