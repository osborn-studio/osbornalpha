"""Gather, build, evaluate and verify one workbook; print a JSON result on stdout.

Usage: run.py --out-dir DIR [--date YYYY-MM-DD] [--scheduled] [--data data.json]

Result: {"status": "ok", "name", "file", "tradeDate", "groups": [...]} with the summary figures for the
group card, or {"status": "nothing"} / {"status": "verify_failed", "problems": [...]}.
Exit codes: 0 ok, 2 formula errors or mismatches (nothing to send), 3 nothing to report, 1 error.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import tempfile
from pathlib import Path

import openpyxl

import bitable
import build
import evaluate
import gather
import model
import verify

FIELDS = {5: 'long', 7: 'gross', 9: 'held', 10: 'notional', 11: 'unrealized', 12: 'realized', 13: 'valid',
          14: 'adopted', 15: 'withdrawn', 16: 'trades', 17: 'hitRate', 18: 'score'}


def default_day(now):
    """Report date: today once the A/HK sessions have closed (16:30 Beijing), else the previous weekday.

    Before the close the daily bar of today is an intraday price, not a close.
    """
    day = now.date()
    if now.hour * 60 + now.minute < 16 * 60 + 30:
        day -= dt.timedelta(days=1)
        while day.weekday() >= 5:
            day -= dt.timedelta(days=1)
    return day.isoformat()


def figures(path, analysts):
    s = openpyxl.load_workbook(path, data_only=True)['summary']
    groups, _, _ = build.layout(analysts)
    out = []
    for label, _key, _a, _q, _n, e in groups:
        row = {'label': label}
        for r, field in FIELDS.items():
            v = s[f'{e}{r}'].value
            row[field] = None if v in ('-', None) else v
        out.append(row)
    return out


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--out-dir', required=True)
    p.add_argument('--date')
    p.add_argument('--scheduled', action='store_true')
    p.add_argument('--data')
    args = p.parse_args(argv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now(gather.BJ)
    day = args.date or default_day(now)
    name = f'{day}.xlsx' if args.scheduled else f'{day}-{now:%H%M}.xlsx'

    data_path = Path(args.data) if args.data else out_dir / (name[:-5] + '.json')
    if not args.data:
        code = gather.main([str(data_path), '--date', day] + (['--scheduled'] if args.scheduled else []))
        if code == gather.EXIT_NOTHING:
            print(json.dumps({'status': 'nothing', 'tradeDate': day}))
            return 3
    X = model.load(data_path)
    final = out_dir / name
    with tempfile.TemporaryDirectory() as tmp:
        built = Path(tmp) / 'built.xlsx'
        build.build(X, str(built))
        _, errors = evaluate.evaluate(str(built), str(final))
    problems = [f'formula error {sh}!{ref}: {v}' for sh, ref, v in errors] + verify.verify(X, str(final))
    if problems:
        final.rename(final.with_suffix('.failed.xlsx'))
        (out_dir / (name[:-5] + '.problems.txt')).write_text('\n'.join(problems), encoding='utf-8')
        print(json.dumps({'status': 'verify_failed', 'tradeDate': X.TRADE_DATE.isoformat(), 'problems': problems[:20]}, ensure_ascii=False))
        return 2
    rows = out_dir / (name[:-5] + '.bitable.json')
    rows.write_text(json.dumps(bitable.export(X, str(final)), ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'status': 'ok', 'name': name, 'file': str(final.resolve()), 'tradeDate': X.TRADE_DATE.isoformat(),
                      'groups': figures(str(final), X.ANALYSTS), 'bitable': str(rows.resolve())}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except gather.GatherError as error:
        print(json.dumps({'status': 'error', 'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
