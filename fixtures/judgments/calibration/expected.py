#!/usr/bin/env python3
# fixtures/judgments/calibration/expected.py
# Independent oracle for src/lib/judgments/calibration.ts (spec §8.1, §8.2, §8.4, §8.5, §14.1).
# Plain Python 3 (no numpy / sklearn): run `python3 -I fixtures/judgments/calibration/expected.py`
# and it prints expected.json to stdout. The TypeScript test reads only the JSON; this script is the
# provenance of every expected number and was written and run by someone other than the implementer.
#
# Entry encoding (compact, shared with the test): [id, subject, as_of, window_end, lifecycle, retro, forecast, y]
#   id       int  -> judgment_id '00000000-0000-4000-8000-' + 12-digit zero-padded id
#   subject  str  -> '<subject_type>:<subject_key>'
#   as_of, window_end  int day offsets from 2024-01-01 (UTC dates)
#   lifecycle 's' settled | 'o' open | 'v' void | 'w' withdrawn
#   retro    0|1
#   forecast probability: p | categorical: [selected, margin_pp|None] | score: value | interval: [low, high, nominal]
#   y        probability: 0|1 | categorical: realized class | score/interval: realized number | None (not settled)
import datetime
import json
import math
import sys

BASE = datetime.date(2024, 1, 1)
def iso(d): return (BASE + datetime.timedelta(days=d)).isoformat()

def round6(v): return math.floor(v * 1e6 + 0.5) / 1e6          # JS Math.round(v*1e6)/1e6

def wilson(k, n):                                                # = src/lib/research/fanout/calibration.ts::wilson
    if n <= 0: return {'low': None, 'high': None}
    z = 1.959964; p = k / n; z2 = z * z
    centre = (p + z2 / (2 * n)) / (1 + z2 / n)
    half = (z * math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n)
    return {'low': round6(max(0, centre - half)), 'high': round6(min(1, centre + half))}

def isotonic_fit(points):                                        # = fanout isotonicFit (PAV, equal scores pooled, round6, equal-p merge)
    by = {}
    for s, h in points:
        b = by.setdefault(s, [0, 0]); b[0] += h; b[1] += 1
    blocks = []
    for s in sorted(by):
        sm, n = by[s]; blocks.append([sm, n, s, s])
        while len(blocks) > 1:
            last, prev = blocks[-1], blocks[-2]
            if prev[0] / prev[1] <= last[0] / last[1]: break
            blocks[-2:] = [[prev[0] + last[0], prev[1] + last[1], prev[2], last[3]]]
    segs = []
    for sm, n, lo, hi in blocks:
        p = round6(sm / n)
        if segs and segs[-1]['p'] == p: segs[-1]['x_max'] = hi
        else: segs.append({'x_min': lo, 'x_max': hi, 'p': p})
    return segs

def apply_isotonic(segs, x):                                     # = fanout applyIsotonic
    if not segs: return None
    if x <= segs[0]['x_min']: return segs[0]['p']
    if x >= segs[-1]['x_max']: return segs[-1]['p']
    for i, s in enumerate(segs):
        if s['x_min'] <= x <= s['x_max']: return s['p']
        if i + 1 < len(segs) and s['x_max'] < x < segs[i + 1]['x_min']:
            t = (x - s['x_max']) / (segs[i + 1]['x_min'] - s['x_max'])
            return round6(s['p'] + t * (segs[i + 1]['p'] - s['p']))
    return segs[-1]['p']

def lsum(xs):
    """Left-to-right sum: the TypeScript reduce order, and independent of Python's float sum() algorithm (3.12+ compensates)."""
    t = 0
    for x in xs: t += x
    return t

def mean(xs): return None if not xs else lsum(xs) / len(xs)
def bin_of(p): return max(i for i in range(10) if i == 0 or p >= i / 10)   # boundary comparisons, not floor(p*10): 0.8999999999999999*10 == 9.0 (G-02)

def ece(pairs):
    if not pairs: return None
    bins = [[0, 0.0, 0] for _ in range(10)]
    for p, y in pairs:
        b = bins[bin_of(p)]; b[0] += 1; b[1] += p; b[2] += y
    total = 0.0
    for n, sp, sy in bins:
        if n: total += (n / len(pairs)) * abs(sp / n - sy / n)
    return total

def brier_parts(pairs):
    if not pairs: return None, None, None
    ys = [y for _, y in pairs]; ybar = mean(ys)
    brier = mean([(p - y) ** 2 for p, y in pairs])
    clim = mean([(ybar - y) ** 2 for y in ys])
    skill = None if clim == 0 else 1 - brier / clim
    return brier, clim, skill

def reliability(pairs):
    out = []
    for i in range(10):
        inb = [(p, y) for p, y in pairs if bin_of(p) == i]
        n = len(inb); k = lsum(y for _, y in inb); w = wilson(k, n)
        out.append({'bin_low': i / 10, 'bin_high': (i + 1) / 10, 'n': n,
                    'mean_p': None if n == 0 else lsum(p for p, _ in inb) / n,
                    'hit_rate': None if n == 0 else k / n, 'wilson_low': w['low'], 'wilson_high': w['high']})
    return out

def select_independent(samples, embargo):
    groups = {}
    for s in samples: groups.setdefault(s['subject'], []).append(s)
    chosen = set()
    for g in groups.values():
        last_end = None
        for s in sorted(g, key=lambda s: (s['as_of'], s['id'])):
            if last_end is None or s['as_of'] > last_end + embargo:
                chosen.add(s['id']); last_end = s['window_end']
    return chosen

def quantile7(xs, q):
    xs = sorted(xs); h = (len(xs) - 1) * q; lo = math.floor(h)
    if lo + 1 >= len(xs): return xs[lo]
    return xs[lo] + (h - lo) * (xs[lo + 1] - xs[lo])

def median(xs):
    if not xs: return None
    xs = sorted(xs); n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2

def avg_ranks(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i]); r = [0.0] * len(vals); i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]: j += 1
        for t in range(i, j + 1): r[order[t]] = (i + j) / 2 + 1
        i = j + 1
    return r

def spearman(xs, ys):
    if len(xs) < 2: return None
    rx, ry = avg_ranks(xs), avg_ranks(ys); mx, my = mean(rx), mean(ry)
    num = lsum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(lsum((a - mx) ** 2 for a in rx) * lsum((b - my) ** 2 for b in ry))
    return None if den == 0 else num / den

HOLDOUT_MIN = 20

def evaluate(kind, entries, opts):
    E = [dict(id=e[0], subject=e[1], as_of=e[2], window_end=e[3], life=e[4], retro=e[5], f=e[6], y=e[7]) for e in entries]
    settled = [e for e in E if e['life'] == 's']
    samples = [e for e in settled if not e['retro'] and e['y'] is not None]
    chosen = select_independent(samples, opts['embargo_days'])
    ind = sorted([s for s in samples if s['id'] in chosen], key=lambda s: (s['as_of'], s['id']))
    counts = {'n_registered': len(E), 'n_settled': len(settled), 'n_independent': len(ind),
              'n_void': lsum(1 for e in E if e['life'] == 'v'),
              'n_retrospective_excluded': lsum(1 for e in settled if e['retro'])}
    thr, emax = opts['threshold_n'], opts['ece_max']; n = len(ind)
    rel, iso_segs = [], None
    if kind == 'probability':
        pairs = [(s['f'], s['y']) for s in ind]
        b, c, sk = brier_parts(pairs); k = lsum(y for _, y in pairs); w = wilson(k, n)
        allp = [(s['f'], s['y']) for s in samples]; ab, _, _ = brier_parts(allp)
        ntr = (7 * n) // 10; train, hold_raw = ind[:ntr], ind[ntr:]
        boundary = max((s['window_end'] for s in train), default=None)
        hold = [s for s in hold_raw if boundary is None or s['as_of'] > boundary]
        hp = [(s['f'], s['y']) for s in hold]
        segs = isotonic_fit([(s['f'], s['y']) for s in train]) if train else None
        if len(hold) >= HOLDOUT_MIN:
            hb, _, hsk = brier_parts(hp); he = ece(hp)
            hm = ece([(apply_isotonic(segs, p), y) for p, y in hp]) if segs else None
        else:
            hb = hsk = he = hm = None
        metrics = {'n_total': len(samples), 'base_rate': None if n == 0 else k / n, 'brier': b, 'brier_climatology': c,
                   'brier_skill': sk, 'ece_raw': ece(pairs),
                   'hit_rate': None if n == 0 else {'rate': k / n, 'low': w['low'], 'high': w['high']},
                   'correlated': {'n': len(samples), 'brier': ab, 'ece_raw': ece(allp)},
                   'temporal_split': {'n_train': len(train), 'n_holdout': len(hold), 'n_dropped_overlap': len(hold_raw) - len(hold),
                                      'boundary': None if boundary is None else iso(boundary), 'ece_raw_holdout': he,
                                      'brier_holdout': hb, 'brier_skill_holdout': hsk, 'ece_mapped_holdout': hm}}
        rel = reliability(pairs); iso_segs = segs if n > 0 else None
        if n < thr or he is None: state = 'insufficient'
        elif he <= emax and hsk is not None and hsk > 0: state = 'calibrated'
        else: state = 'failed'
    elif kind == 'categorical':
        hits = [1 if s['f'][0] == s['y'] else 0 for s in ind]; k = lsum(hits); w = wilson(k, n)
        freq = {}
        for s in ind: freq[s['y']] = freq.get(s['y'], 0) + 1
        maj = min(freq, key=lambda c: (-freq[c], c)) if freq else None
        conf = {}
        for s in ind:
            row = conf.setdefault(s['f'][0], {}); row[s['y']] = row.get(s['y'], 0) + 1
        bins = []
        for lo, hi in [(0, 5), (5, 15), (15, 100)]:
            inb = [s for s in ind if s['f'][1] is not None and (lo == 0 or s['f'][1] >= lo) and (hi == 100 or s['f'][1] < hi)]
            kb = lsum(1 for s in inb if s['f'][0] == s['y']); wb = wilson(kb, len(inb))
            bins.append({'bin_low': lo, 'bin_high': hi, 'n': len(inb), 'accuracy': None if not inb else kb / len(inb),
                         'wilson_low': wb['low'], 'wilson_high': wb['high']})
        allhits = [1 if s['f'][0] == s['y'] else 0 for s in samples]
        metrics = {'n_total': len(samples), 'accuracy': None if n == 0 else k / n,
                   'accuracy_wilson': {'low': w['low'], 'high': w['high']}, 'majority_class': maj,
                   'majority_rate': None if n == 0 else freq[maj] / n, 'confusion': conf, 'margin_bins': bins,
                   'n_missing_margin': lsum(1 for s in ind if s['f'][1] is None),
                   'correlated': {'n': len(samples), 'accuracy': mean(allhits)}}
        if n < thr: state = 'insufficient'
        elif w['low'] is not None and w['low'] > metrics['majority_rate']: state = 'calibrated'
        else: state = 'failed'
    elif kind == 'score':
        xs = [s['f'] for s in ind]; ys = [s['y'] for s in ind]
        srt = sorted(ind, key=lambda s: (s['f'], s['id'])); terts = []
        binary = n > 0 and all(y in (0, 1) for y in ys)
        for t in range(3):
            g = [s for i, s in enumerate(srt) if (3 * i) // n == t] if n else []
            kk = lsum(s['y'] for s in g); ww = wilson(kk, len(g)) if binary else None
            terts.append({'tertile': t + 1, 'n': len(g), 'value_min': min((s['f'] for s in g), default=None),
                          'value_max': max((s['f'] for s in g), default=None), 'realized_mean': mean([s['y'] for s in g]),
                          'hit_rate': {'rate': kk / len(g), 'low': ww['low'], 'high': ww['high']} if binary and g else None})
        metrics = {'n_total': len(samples), 'spearman': spearman(xs, ys), 'tertiles': terts,
                   'correlated': {'n': len(samples), 'spearman': spearman([s['f'] for s in samples], [s['y'] for s in samples])}}
        state = 'insufficient' if n < thr else 'evaluated'
    else:
        cov = [1 if s['f'][0] <= s['y'] <= s['f'][1] else 0 for s in ind]; k = lsum(cov); w = wilson(k, n)
        nominal = mean([s['f'][2] for s in ind]); coverage = mean(cov)
        widths = [s['f'][1] - s['f'][0] for s in ind]
        groups = {}
        for s in ind: groups.setdefault(s['subject'], []).append(s['y'])
        base = {}
        if nominal is not None:
            for g, vals in groups.items():
                if len(vals) >= 2: base[g] = quantile7(vals, (1 + nominal) / 2) - quantile7(vals, (1 - nominal) / 2)
        bl = [base[s['subject']] for s in ind if s['subject'] in base]
        wm, bm = median(widths), median(bl)
        ratio = None if wm is None or bm is None or bm == 0 else wm / bm
        allcov = [1 if s['f'][0] <= s['y'] <= s['f'][1] else 0 for s in samples]
        metrics = {'n_total': len(samples), 'coverage': coverage, 'coverage_wilson': {'low': w['low'], 'high': w['high']},
                   'nominal_coverage': nominal, 'coverage_gap': None if coverage is None else coverage - nominal,
                   'width_median': wm, 'baseline_width_median': bm, 'width_ratio': ratio,
                   'correlated': {'n': len(samples), 'coverage': mean(allcov)}}
        if n < thr: state = 'insufficient'
        elif abs(metrics['coverage_gap']) <= emax and ratio is not None and ratio <= 1: state = 'calibrated'
        else: state = 'failed'
    metrics['n_invalid_endpoint'] = 0; metrics['n_unusable_value'] = 0   # the compact encoding has no invalid endpoints / unusable values
    return {'state': state, **counts, 'metrics': metrics, 'reliability': rel, 'isotonic_segments': iso_segs,
            'selected': sorted(s['id'] for s in ind)}

def lcg(seed):
    x = seed
    while True:
        x = (1103515245 * x + 12345) % 2147483648
        yield x / 2147483648

def seq(id0, subject, n, p_of, y_of, step=2, span=1, start=0):
    """Block of n settled, non-retrospective entries of one subject: id = id0 + i, as_of = start + step*i, window_end = as_of + span."""
    return {'seq': [id0, subject, start, step, span], 'f': [p_of(i) for i in range(n)], 'y': [y_of(i) for i in range(n)]}

def expand(blocks):
    out = []
    for b in blocks:
        if isinstance(b, dict):
            id0, subject, start, step, span = b['seq']
            out += [[id0 + i, subject, start + step * i, start + step * i + span, 's', 0, f, y] for i, (f, y) in enumerate(zip(b['f'], b['y']))]
        else: out.append(b)
    return out

O = lambda thr=100, emax=0.10, emb=0: {'threshold_n': thr, 'ece_max': emax, 'embargo_days': emb}
cases = []
def case(name, kind, blocks, opts, note):
    cases.append({'name': name, 'kind': kind, 'opts': opts, 'note': note, 'blocks': blocks, 'entries': expand(blocks)})
def derive(name, base, drop, opts, note):
    b = next(c for c in cases if c['name'] == base)
    cases.append({'name': name, 'kind': b['kind'], 'opts': opts, 'note': note, 'derive': {'from': base, 'drop': drop},
                  'entries': [e for e in b['entries'] if e[0] not in set(drop)]})

A8 = lambda i: 0.8 if i % 10 < 5 else 0.2                       # two groups, true hit rates 0.8 and 0.2
Y8 = lambda i: 1 if i % 10 < 4 or i % 10 == 5 else 0
case('perfect_forecast', 'probability', [seq(1, 'issuer:S1', 10, lambda i: 1 - i % 2, lambda i: 1 - i % 2)], O(),
     'p equals the outcome: Brier 0, skill 1, ECE 0')
case('constant_half', 'probability', [seq(1, 'issuer:S1', 10, lambda i: 0.5, lambda i: i % 2)], O(),
     'p = 0.5 with half hits: Brier 0.25 = climatology, skill 0')
case('constant_half_all_hits', 'probability', [seq(1, 'issuer:S1', 10, lambda i: 0.5, lambda i: 1)], O(),
     'all hits: climatology 0, so skill is null (zero denominator)')
P = [0.05, 0.15, 0.35, 0.45, 0.55, 0.62, 0.78, 0.85, 0.97, 1.0]; r1 = lcg(7); U1 = [next(r1) for _ in range(50)]
case('skill_and_bins', 'probability', [seq(1, 'issuer:S1', 50, lambda i: P[i % 10], lambda i: 1 if U1[i] < P[i % 10] else 0)], O(),
     'ten equal bins, p = 1.0 lands in the last bin, bin [0.2,0.3) stays empty (null hit rate), Wilson per bin')
case('ece_holdout', 'probability',
     [seq(1, 'issuer:S1', 56, A8, Y8), seq(57, 'issuer:S1', 24, lambda i: 0.8 if i % 2 == 0 else 0.2, lambda i: 1 - i % 2, start=112)], O(50),
     'first 70% calibrated, last 30% under-confident: ece_raw differs from ece_raw_holdout 0.2 -> failed')
case('boundary_overlap', 'probability',
     [[1, 'issuer:B', 0, 220, 's', 0, 0.7, 1], seq(2, 'issuer:A', 100, A8, Y8, step=3)], O(),
     "holdout samples whose as_of falls inside a training target window (issuer B's ends on day 220) are dropped")
r2 = lcg(11); U2 = [next(r2) for _ in range(300)]
case('macro_daily_91', 'probability',
     [seq(1, 'macro_region:US', 200, lambda i: 0.6, lambda i: 1 if U2[i] < 0.6 else 0, step=1, span=90),
      seq(1001, 'macro_region:CN', 100, lambda i: 0.4, lambda i: 1 if U2[200 + i] < 0.4 else 0, step=1, span=90)], O(),
     'daily as_of with 91-day target windows: one independent sample per 91 days per region (US days 0/91/182, CN 0/91)')
case('same_stock_dedup', 'probability',
     [seq(1, 'issuer:X', 10, lambda i: 0.7, lambda i: 1 if i % 3 else 0, step=1, span=4),
      seq(101, 'issuer:Y', 10, lambda i: 0.3, lambda i: 1 if i == 4 else 0, step=1, span=0)], O(),
     'daily calls on one stock with 5-day windows keep days 0 and 5; same-day windows on another stock keep all ten')
case('embargo_0', 'probability', [seq(1, 'issuer:Z', 10, lambda i: 0.5, lambda i: i % 2, step=11, span=9)], O(),
     'windows of 10 days every 11 days do not overlap: all ten independent')
derive('embargo_2', 'embargo_0', [], O(100, 0.10, 2), 'embargo_days = 2: the next as_of must be after window_end + 2 days, so every other one')
case('g01_counterexample', 'probability', [seq(1, 'issuer:S1', 100, lambda i: 0.92 if i % 10 < 5 else 0.32, Y8)], O(),
     'raw p is 0.12 off in both groups: ece_raw_holdout 0.12 > 0.10 while the isotonic-mapped holdout ECE is ~0 -> failed (the gate tests raw p)')
extra = [[901, 'issuer:S1', 300, 301, 'o', 0, 0.8, None], [902, 'issuer:S1', 302, 303, 'o', 0, 0.2, None],
         [903, 'issuer:S1', 304, 305, 'v', 0, 0.8, None], [904, 'issuer:S1', 306, 307, 'v', 0, 0.2, None], [905, 'issuer:S1', 308, 309, 'v', 0, 0.8, None],
         [906, 'issuer:S1', 310, 311, 'w', 0, 0.8, None],
         [907, 'issuer:S1', 1, 1, 's', 1, 0.8, 0], [908, 'issuer:S1', 3, 3, 's', 1, 0.2, 1], [909, 'issuer:S1', 5, 5, 's', 1, 0.8, 0], [910, 'issuer:S1', 7, 7, 's', 1, 0.2, 1]]
case('acceptance4_100', 'probability', [seq(1, 'issuer:S1', 100, A8, Y8)] + extra, O(),
     'acceptance example 4: 100 independent samples, holdout raw ECE ~0 and skill > 0 -> calibrated; open/void/withdrawn/retrospective rows are only counted')
derive('acceptance4_99', 'acceptance4_100', [100], O(), 'acceptance example 4: the same cohort without its last sample: 99 independent -> insufficient')
C4 = ['recovery', 'overheat', 'stagflation', 'recession']; r3 = lcg(5); U3 = [next(r3) for _ in range(40)]
case('categorical_calibrated', 'categorical',
     [seq(1, 'macro_region:US', 40, lambda i: [C4[i % 4], [2.5, 7.0, 15.0, None, 30.0][i % 5]], lambda i: C4[i % 4] if U3[i] < 0.9 else C4[(i + 1) % 4])], O(20),
     'accuracy ~0.9 against a majority baseline ~0.3: Wilson low above majority_rate -> calibrated; margin_pp bins [0,5) [5,15) [15,100], one margin missing per 5')
case('categorical_failed', 'categorical',
     [seq(1, 'macro_region:US', 30, lambda i: ['recovery', 4.0], lambda i: 'recovery' if i % 10 < 7 else 'recession')], O(20),
     'always predicting the majority class: accuracy 0.7 = majority_rate, Wilson low below it -> failed')
r4 = lcg(3); RV = [round(next(r4) * 20 - 10, 3) for _ in range(30)]
case('interval_failed', 'interval',
     [seq(1, 'issuer:A', 15, lambda i: [RV[i] - 3 + (i % 3), RV[i] + 3 - (i % 2), 0.8], lambda i: RV[i] if i % 5 else RV[i] + 9),
      seq(101, 'issuer:B', 15, lambda i: [-4.0, 4.0, 0.8], lambda i: RV[15 + i])], O(20),
     'coverage 0.63 vs nominal 0.8 (gap > ece_max) -> failed; width_ratio against the per-subject empirical quantile width')
case('interval_calibrated', 'interval',
     [seq(1, 'issuer:A', 15, lambda i: [RV[i] - 1, RV[i] + 1, 0.8], lambda i: RV[i] if i % 5 else RV[i] + 5),
      seq(101, 'issuer:B', 15, lambda i: [RV[15 + i] - 1, RV[15 + i] + 1, 0.8], lambda i: RV[15 + i] if i % 5 else RV[15 + i] - 5)], O(20),
     'coverage 0.8 = nominal, narrow intervals (width_ratio < 1) -> calibrated')
case('score_ties', 'score', [seq(1, 'industry:sw:2021:801010', 30, lambda i: ((i * 7) % 10) * 10, lambda i: ((i * 3) % 7) - 3 + (i % 10) / 5)], O(20),
     'Spearman with average ranks over tied values; tertiles by value; evaluated')
derive('score_insufficient', 'score_ties', [], O(100), 'the same cohort under threshold_n = 100: insufficient')
case('score_binary', 'score', [seq(1, 'industry:sw:2021:801020', 12, lambda i: i * 5, lambda i: 1 if i >= 6 else 0)], O(5),
     'binary realized metric: tertile hit rates with Wilson')

# --- gate-pinning cases (plan review G-05): new inputs only, same algorithms ---
def alt(a, b): return lambda i: a if i % 2 == 0 else b
HY = lambda i: 1 if i % 2 else 0
case('gate_skill_not_positive', 'probability', [seq(1, 'issuer:S1', 100, lambda i: 0.5, HY)], O(),
     'n = threshold, holdout 30 >= 20, holdout ECE 0 <= 0.10 but constant p = base rate gives skill exactly 0 -> failed (skill > 0 is part of the gate)')
case('gate_skill_null', 'probability', [seq(1, 'issuer:S1', 100, lambda i: 0.95, lambda i: HY(i) if i < 70 else 1)], O(),
     'holdout all hits: climatology 0, brier_skill_holdout null while holdout ECE 0.05 <= 0.10 -> failed, not calibrated')
case('gate_holdout_small_after_drop', 'probability',
     [[1, 'issuer:B', 0, 250, 's', 0, 0.7, 1], seq(2, 'issuer:A', 100, A8, Y8, step=3)], O(),
     '101 independent samples but the 31-sample holdout loses 15 to the boundary overlap drop: 16 < 20 -> holdout metrics null -> insufficient')
case('gate_holdout_20', 'probability', [seq(1, 'issuer:S1', 64, A8, Y8)], O(60),
     'n = 64: train 44, holdout exactly 20 = HOLDOUT_MIN -> holdout metrics computed, calibrated')
derive('gate_holdout_19', 'gate_holdout_20', [64], O(60), 'n = 63: train 44, holdout 19 < 20 -> holdout metrics null -> insufficient')
K = lambda i: i // 2
case('gate_ece_equals_max', 'probability',
     [seq(1, 'issuer:S1', 106, alt(0.25, 0.75), lambda i: (1 if K(i) % 8 == 0 else 0) if i % 2 == 0 else (0 if K(i) % 8 == 0 else 1))], O(100, 0.125),
     'holdout (32): p 0.25 hit rate 0.125, p 0.75 hit rate 0.875 -> ECE exactly 0.125 = ece_max (binary-exact) and skill 0.5 -> calibrated (<=)')
case('interval_wide_gap_ok', 'interval',
     [seq(1, 'issuer:A', 15, lambda i: [RV[i] - 14, RV[i] + 14, 0.8], lambda i: RV[i] if i % 5 else RV[i] + 17),
      seq(101, 'issuer:B', 15, lambda i: [RV[15 + i] - 14, RV[15 + i] + 14, 0.8], lambda i: RV[15 + i] if i % 5 else RV[15 + i] - 17)], O(20),
     'coverage 0.8 = nominal (gap 0 <= ece_max) but intervals wider than the empirical quantile baseline (width_ratio > 1) -> failed')

out = {'generator': 'fixtures/judgments/calibration/expected.py', 'algorithm': 'judgments-calibration/1', 'holdout_min': HOLDOUT_MIN,
       'cases': []}
for c in cases:
    rec = {k: c[k] for k in ('name', 'kind', 'opts', 'note')}
    if 'derive' in c: rec['derive'] = c['derive']
    else: rec['blocks'] = c['blocks']
    rec['expected'] = evaluate(c['kind'], c['entries'], c['opts'])
    out['cases'].append(rec)
# One case per line so diffs stay readable; the JSON is still a single valid document.
head = json.dumps({k: out[k] for k in ('generator', 'algorithm', 'holdout_min')}, separators=(',', ':'))[:-1]
sys.stdout.write(head + ',"cases":[\n')
sys.stdout.write(',\n'.join(json.dumps(c, separators=(',', ':'), allow_nan=False) for c in out['cases']))
sys.stdout.write('\n]}\n')
