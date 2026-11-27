"""Independently recompute the workbook and compare it with the cached values in the file.

Usage: verify.py <data.json> <evaluated.xlsx>
The recomputation replays the trades with the formal system's position rule (ingest_feishu_simulation),
per analyst and pooled, and reconciles the pooled book with the account positions exported by the
formal system. Any difference is reported; the connector only sends a workbook with none.
"""
from __future__ import annotations

import sys

import openpyxl

import model
from build import layout

TOL = 1e-6


def replay(X, analyst=None):
    """ticker -> [shares, avg cost (local), realized (RMB), realized (local)]"""
    fx = dict(X.FX)
    pos = {}
    for tid, when, tk, di, q, fill, close, fee, an, rid, ap in sorted(X.TRADES, key=lambda r: r[1]):
        if analyst and an != analyst:
            continue
        p = pos.setdefault(tk, [0, 0.0, 0.0, 0.0])
        if di == 'Buy':
            p[1] = (p[0] * p[1] + q * fill + fee) / (p[0] + q)
            p[0] += q
        else:
            gain = (fill - p[1]) * q - fee
            p[2] += gain * fx[X.SEC[tk][2]]
            p[3] += gain
            p[0] -= q
            if p[0] == 0:
                p[1] = 0
    return pos


def summary_rows(s):
    rows = {}
    r = 21
    while s[f'B{r}'].value != 'Short' and r < 10000:
        if s[f'B{r}'].value:
            rows[s[f'B{r}'].value] = r
        r += 1
    return rows


def verify(X, path):
    s = openpyxl.load_workbook(path, data_only=True)['summary']
    groups, _, check = layout(X.ANALYSTS)
    rowof = summary_rows(s)
    fx = dict(X.FX)
    problems = []

    def cmp(label, want, got):
        if isinstance(want, str) or isinstance(got, str):
            ok = want == got
        else:
            ok = got is not None and abs(got - want) <= TOL * max(1.0, abs(want))
        if not ok:
            problems.append(f'{label}: want {want!r}, got {got!r}')

    for label, key, a_, q_, n_, e_ in groups:
        pos = replay(X, key)
        long = notional = unrealized = 0.0
        held = 0
        for tk, (sh, avg, real, _) in pos.items():
            if tk not in rowof:
                problems.append(f'{label} {tk}: missing row')
                continue
            r = rowof[tk]
            px, rate = X.SEC[tk][3] or 0, fx[X.SEC[tk][2]]
            cmp(f'{label} {tk} Quantity', sh, s[f'{q_}{r}'].value)
            cmp(f'{label} {tk} Avg Cost', avg, s[f'{a_}{r}'].value)
            cmp(f'{label} {tk} Notional', sh * px * rate, s[f'{n_}{r}'].value)
            cmp(f'{label} {tk} Exp', sh * px * rate / X.NAV, s[f'{e_}{r}'].value)
            long += sh * px * rate / X.NAV
            notional += sh * px * rate
            unrealized += (px - avg) * sh * rate
            held += sh != 0
        recs = [x for x in X.RECS if key is None or x[2] == key]
        hits = [x[20] for x in recs if x[20] in ('是', '否')]
        scores = [x[21] for x in recs if x[21] is not None]
        want = {5: long, 8: long, 9: held, 10: notional, 11: unrealized, 12: sum(p[2] for p in pos.values()),
                13: sum(x[12] == '有效' for x in recs), 14: sum(x[13] == '是' for x in recs),
                15: sum(x[12] == '已撤回' for x in recs), 16: sum(1 for t in X.TRADES if key is None or t[8] == key),
                17: hits.count('是') / len(hits) if hits else '-', 18: sum(scores) / len(scores) if scores else '-'}
        for r, v in want.items():
            cmp(f'{label} {s[f"H{r}"].value}', v, s[f'{e_}{r}'].value)
    for tk, r in rowof.items():
        cmp(f'check {tk}', 0, s[f'{check}{r}'].value)

    # The pooled book must equal the formal system's own positions where only bound analysts traded.
    pooled = replay(X)
    for p in X.POSITIONS:
        if not p.get('attributedOnly'):
            continue
        sh, avg, _, real_local = pooled.get(p['ticker'], [0, 0.0, 0.0, 0.0])
        cmp(f'formal position {p["ticker"]} shares', p['shares'], sh)
        cmp(f'formal position {p["ticker"]} avg cost', p['avgCost'], avg)
        cmp(f'formal position {p["ticker"]} realized', p['realizedPnl'], real_local)
    return problems


if __name__ == '__main__':
    found = verify(model.load(sys.argv[1]), sys.argv[2])
    print('\n'.join(found) or 'no mismatches')
    sys.exit(1 if found else 0)
