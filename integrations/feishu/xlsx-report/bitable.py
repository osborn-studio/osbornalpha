"""Rows for the Feishu 多维表格 view, read from the verified workbook's cached values.

The 多维表格 mirrors the Excel report in record form: 每日汇总 (one row per report date and scope,
appended), 当前持仓 (replaced on every run), 模拟成交 and 建议台账 (one row per formal id, updated in
place). The schema travels with the rows, so the connector can create or extend the tables itself.
Field types follow the Bitable API: 1 text, 2 number, 3 single select, 5 date, 15 URL.
Percent-of-NAV figures are stored in percentage points with four decimals (0.0042 = 0.0042%),
because the API's percent formats stop at two decimals.
"""
from __future__ import annotations

import datetime as dt

import openpyxl

import build

BJ = dt.timezone(dt.timedelta(hours=8))
TEXT, NUMBER, SELECT, DATE, URL = 1, 2, 3, 5, 15


def num(fmt):
    return {'formatter': fmt}


DAY = {'date_formatter': 'yyyy/MM/dd'}
MINUTE = {'date_formatter': 'yyyy-MM-dd HH:mm'}
PP4, MONEY, INT, PRICE, FX, PCT, ONE = num('0.0000'), num('1,000.00'), num('0'), num('0.000'), num('0.0000'), num('0.00%'), num('0.0')

SCHEMA = {
    '每日汇总': ('汇总键', False, [
        ('汇总键', TEXT, None), ('报告日期', DATE, DAY), ('范围', SELECT, None),
        ('Long（%）', NUMBER, PP4), ('Short（%）', NUMBER, PP4), ('Gross（%）', NUMBER, PP4), ('Net（%）', NUMBER, PP4),
        ('持仓只数', NUMBER, INT), ('持仓名义（元）', NUMBER, MONEY), ('未实现盈亏（元）', NUMBER, MONEY),
        ('已实现盈亏（元）', NUMBER, MONEY), ('有效建议', NUMBER, INT), ('已采纳', NUMBER, INT), ('已撤回', NUMBER, INT),
        ('模拟成交笔数', NUMBER, INT), ('命中率', NUMBER, PCT), ('平均评分', NUMBER, ONE), ('NAV（元）', NUMBER, MONEY),
        ('Excel', URL, None),
    ]),
    '当前持仓': ('持仓键', True, [
        ('持仓键', TEXT, None), ('范围', SELECT, None), ('Ticker', TEXT, None), ('名称', TEXT, None), ('币种', SELECT, None),
        ('股数', NUMBER, num('1,000')), ('均价', NUMBER, FX), ('收盘价', NUMBER, PRICE), ('汇率', NUMBER, FX),
        ('人民币市值（元）', NUMBER, MONEY), ('Exp（%）', NUMBER, PP4), ('未实现盈亏（元）', NUMBER, MONEY), ('报告日期', DATE, DAY),
    ]),
    '模拟成交': ('成交编号', False, [
        ('成交编号', TEXT, None), ('成交时间', DATE, MINUTE), ('分析师', SELECT, None), ('Ticker', TEXT, None),
        ('名称', TEXT, None), ('方向', SELECT, None), ('股数', NUMBER, num('1,000')), ('成交价', NUMBER, PRICE),
        ('币种', SELECT, None), ('手续费', NUMBER, num('0.00')), ('当日收盘价', NUMBER, PRICE), ('汇率', NUMBER, FX),
        ('人民币金额（元）', NUMBER, MONEY), ('成交后均价（分析师）', NUMBER, FX), ('已实现盈亏·分析师（元）', NUMBER, MONEY),
        ('已实现盈亏·全组（元）', NUMBER, MONEY), ('建议编号', TEXT, None), ('审批人', TEXT, None),
    ]),
    '建议台账': ('建议编号', False, [
        ('建议编号', TEXT, None), ('提交时间', DATE, MINUTE), ('分析师', SELECT, None), ('Ticker', TEXT, None),
        ('名称', TEXT, None), ('动作', SELECT, None), ('执行方式', TEXT, None), ('参考价', NUMBER, PRICE),
        ('目标价', NUMBER, PRICE), ('止损', NUMBER, PRICE), ('信心', NUMBER, INT), ('期限', SELECT, None),
        ('理由', TEXT, None), ('状态', SELECT, None), ('已采纳', SELECT, None), ('审批人', TEXT, None),
        ('审批时间', DATE, MINUTE), ('撤回时间', DATE, MINUTE), ('关联成交', TEXT, None), ('5日收益', NUMBER, PCT),
        ('20日收益', NUMBER, PCT), ('60日收益', NUMBER, PCT), ('命中', SELECT, None), ('评分', NUMBER, ONE),
    ]),
}
SUMMARY_ROWS = {5: 'Long（%）', 6: 'Short（%）', 7: 'Gross（%）', 8: 'Net（%）', 9: '持仓只数', 10: '持仓名义（元）',
                11: '未实现盈亏（元）', 12: '已实现盈亏（元）', 13: '有效建议', 14: '已采纳', 15: '已撤回', 16: '模拟成交笔数',
                17: '命中率', 18: '平均评分'}
POINTS = {'Long（%）', 'Short（%）', 'Gross（%）', 'Net（%）'}


def ms(value):
    """Beijing wall-clock datetime or date -> Unix milliseconds."""
    if isinstance(value, dt.datetime):
        moment = value.replace(tzinfo=BJ)
    elif isinstance(value, dt.date):
        moment = dt.datetime(value.year, value.month, value.day, tzinfo=BJ)
    else:
        return None
    return int(moment.timestamp() * 1000)


def clean(row):
    """Drop empty cells and the workbook's '-' placeholders; Bitable leaves those fields blank."""
    return {k: v for k, v in row.items() if v is not None and v != '-' and v != ''}


def coerce(table, row):
    """Numbers only in number fields, text in text and select fields, so a stray label never fails a write."""
    types = {f: ty for f, ty, _ in SCHEMA[table][2]}
    out = {}
    for field, value in row.items():
        ty = types[field]
        if ty in (NUMBER, DATE):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                continue
        elif ty in (TEXT, SELECT):
            value = str(value)
        out[field] = value
    return out


def export(X, path):
    wb = openpyxl.load_workbook(path, data_only=True)
    s, t, g = wb['summary'], wb['Trade'], wb['建议台账']
    groups, _, _ = build.layout(X.ANALYSTS)
    day = ms(X.TRADE_DATE)
    names = {tk: v[1] for tk, v in X.SEC.items()}

    summary = []
    for label, _key, _a, _q, _n, e in groups:
        row = {'汇总键': f'{X.TRADE_DATE.isoformat()} {label}', '报告日期': day, '范围': label, 'NAV（元）': X.NAV}
        for r, field in SUMMARY_ROWS.items():
            v = s[f'{e}{r}'].value
            row[field] = v * 100 if field in POINTS and isinstance(v, (int, float)) else v
        summary.append(clean(row))

    holdings = []
    r = 21
    while s[f'B{r}'].value != 'Short' and r < 10000:
        tk = s[f'B{r}'].value
        if tk:
            price, ccy, fx = s[f'F{r}'].value or 0, s[f'G{r}'].value, s[f'H{r}'].value
            for label, _key, a, q, n, e in groups:
                qty = s[f'{q}{r}'].value or 0
                if not qty:
                    continue
                avg = s[f'{a}{r}'].value or 0
                holdings.append(clean({
                    '持仓键': f'{label} {tk}', '范围': label, 'Ticker': tk, '名称': s[f'D{r}'].value, '币种': ccy,
                    '股数': qty, '均价': avg, '收盘价': price, '汇率': fx, '人民币市值（元）': s[f'{n}{r}'].value,
                    'Exp（%）': (s[f'{e}{r}'].value or 0) * 100, '未实现盈亏（元）': (price - avg) * qty * fx, '报告日期': day,
                }))
        r += 1

    trades = []
    for row in t.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue
        v = dict(zip('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z AA AB'.split(), row))
        trades.append(clean({
            '成交编号': v['S'], '成交时间': ms(v['A']), '分析师': v['O'], 'Ticker': v['B'], '名称': names.get(v['B']),
            '方向': {'Buy': '买入', 'Sell': '卖出'}.get(v['D'], v['D']), '股数': v['E'], '成交价': v['H'], '币种': v['J'],
            '手续费': v['T'], '当日收盘价': v['I'], '汇率': v['K'], '人民币金额（元）': v['G'], '成交后均价（分析师）': v['W'],
            '已实现盈亏·分析师（元）': v['X'], '已实现盈亏·全组（元）': v['AB'], '建议编号': v['P'], '审批人': v['Q'],
        }))

    recs = []
    for row in g.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue
        (when, an, tk, _wind, name, act, mode, ref, tgt, stop, conf, hz, why, st, adopted, approver, apt, wd, linked,
         r5, r20, r60, hit, score, rid) = row[:25]
        recs.append(clean({
            '建议编号': rid, '提交时间': ms(when), '分析师': an, 'Ticker': tk, '名称': name, '动作': act, '执行方式': mode,
            '参考价': ref, '目标价': tgt, '止损': stop, '信心': conf, '期限': hz, '理由': why, '状态': st, '已采纳': adopted,
            '审批人': approver, '审批时间': ms(apt), '撤回时间': ms(wd), '关联成交': linked, '5日收益': r5, '20日收益': r20,
            '60日收益': r60, '命中': hit, '评分': score,
        }))

    rows = {'每日汇总': summary, '当前持仓': holdings, '模拟成交': trades, '建议台账': recs}
    tables = []
    for name, (key, replace, fields) in SCHEMA.items():
        tables.append({'name': name, 'key': key, 'replace': replace,
                       'fields': [{'field_name': f, 'type': ty, **({'property': p} if p else {})} for f, ty, p in fields],
                       'rows': [coerce(name, row) for row in rows[name]]})
    return {'reportDate': X.TRADE_DATE.isoformat(), 'tables': tables}
