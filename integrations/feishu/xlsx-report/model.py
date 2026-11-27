"""Report data: the JSON that gather.py writes and build.py / verify.py read.

Times are Beijing wall-clock strings ("YYYY-MM-DD HH:MM:SS"); amounts are in the security's
own currency except NAV (RMB). See fixtures/example.json for a complete instance.
"""
from __future__ import annotations

import datetime as dt
import json
from types import SimpleNamespace

DIRECTIONS = ('Buy', 'Sell')


def _time(value):
    return None if value in (None, '') else dt.datetime.strptime(value, '%Y-%m-%d %H:%M:%S')


def load(path):
    with open(path, encoding='utf-8') as f:
        return from_dict(json.load(f))


def from_dict(d):
    """Shape the JSON into the tuples the builder and the verifier index by position."""
    sec = {k: (v['wind'], v['name'], v['currency'], v['close']) for k, v in d['securities'].items()}
    recs = []
    for r in d['recommendations']:
        recs.append((r['id'], _time(r['time']), r['analyst'], r['ticker'], r['action'], r['mode'], r.get('ref'), r.get('target'),
                     r.get('stop'), r.get('confidence'), r.get('horizon'), r.get('rationale'), r['status'], r['adopted'],
                     r.get('approver'), _time(r.get('approvedAt')), _time(r.get('withdrawnAt')), r.get('r5'), r.get('r20'),
                     r.get('r60'), r.get('hit'), r.get('score')))
    trades = []
    for t in d['trades']:
        if t['direction'] not in DIRECTIONS:
            raise ValueError('unsupported direction ' + repr(t['direction']))
        trades.append((t['id'], _time(t['time']), t['ticker'], t['direction'], t['quantity'], t['price'], t.get('close'),
                       t.get('fee') or 0, t['analyst'], t['recommendationId'], t.get('approver')))
    for tk in {r[3] for r in recs} | {t[2] for t in trades}:
        if tk not in sec:
            raise ValueError('missing security ' + tk)
    return SimpleNamespace(
        BANNER=d['banner'], NOTES=[tuple(n) for n in d.get('notes', [])],
        TRADE_DATE=dt.date.fromisoformat(d['tradeDate']), NAV=float(d['nav']), NAV_NOTE=d['navNote'],
        FX=[(c, float(r)) for c, r in d['fx']], FX_NOTE=d['fxNote'], PRICE_NOTE=d['priceNote'],
        ANALYSTS=list(d['analysts']), SEC=sec, RECS=recs, TRADES=trades,
        POSITIONS=[dict(p) for p in d.get('positions', [])],
    )
