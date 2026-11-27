"""Gather one report date's data into the JSON that build.py reads.

Usage: gather.py <out.json> [--date YYYY-MM-DD] [--scheduled]

Sources, all read-only:
  records   formal site   GET  {FEISHU_SIMULATION_ORIGIN}/api/integrations/feishu/export   (connector token)
  prices    DataGateway   POST {DATAGATEWAY_URL}/v1/market-data/security-prices/query    (DATAGATEWAY_TOKEN)
            fallback      GET  {FEISHU_SIMULATION_ORIGIN}/api/kline/<ticker>             (public daily bars)
  names     DataGateway   POST .../security-master/query, fallback GET {origin}/api/search
  FX        DataGateway   POST .../fx/query (CNY per unit), fallback FEISHU_REPORT_FX="HKD=0.85,USD=6.66"
  NAV       DaoPlatform   GET  {DAOPLATFORM_URL}/v1/fund-size/query?fund=<FEISHU_REPORT_FUND>&on=<date>
            fallback      FEISHU_REPORT_NAV="207630245.90@2026-11-23"
Every fallback that is used is written into the workbook's 说明 sheet.

Exit codes: 0 written, 3 nothing to report (scheduled run on a day without closes or records), 1 error.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BJ = dt.timezone(dt.timedelta(hours=8))
CCY = {'HK': 'HKD', 'A': 'CNY', 'US': 'USD'}
ACTION = {'buy': '买入', 'add': '加仓', 'trim': '减仓', 'sell': '卖出', 'hold': '持有', 'pass': '观望'}
HORIZON = {'short': '短期', 'mid': '中期', 'long': '长期'}
FX_RANGE = {'HKD': (0.5, 1.5), 'USD': (5.0, 9.0)}  # CNY per unit; anything else means a wrong quote
REQUESTER = {'requesting_system': 'osbornalpha-feishu-report'}
EXIT_NOTHING = 3


class GatherError(Exception):
    pass


def env(name, default=None):
    value = os.environ.get(name, '').strip()
    return value or default


def http_json(method, url, token=None, body=None, timeout=40):
    headers = {'accept': 'application/json'}
    data = None
    if token:
        headers['authorization'] = 'Bearer ' + token
    if body is not None:
        headers['content-type'] = 'application/json'
        data = json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def beijing(iso):
    """ISO timestamp -> Beijing wall clock 'YYYY-MM-DD HH:MM:SS'."""
    if not iso:
        return None
    t = dt.datetime.fromisoformat(iso.replace('Z', '+00:00'))
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.timezone.utc)
    return t.astimezone(BJ).strftime('%Y-%m-%d %H:%M:%S')


def codes(ticker, market):
    """Formal ticker -> (display ticker like '300 HK', Wind-style symbols to try, in order)."""
    base = ticker.split('.')[0].upper()
    if market == 'HK':
        n = base.lstrip('0') or '0'
        return f'{n} HK', [f'{n.zfill(4)}.HK']
    if market == 'A':
        return f'{base} CH', [ticker.upper()]
    return f'{base} US', [f'{base}.O', f'{base}.N', base]


class Sources:
    """The HTTP sources, each optional except the formal site."""

    def __init__(self, origin, ingest_token, gateway_url=None, gateway_token=None, dao_url=None, dao_token=None):
        self.origin, self.ingest_token = origin.rstrip('/'), ingest_token
        self.gateway_url, self.gateway_token = (gateway_url or '').rstrip('/'), gateway_token
        self.dao_url, self.dao_token = (dao_url or '').rstrip('/'), dao_token
        self._kline = {}

    # formal site
    def export(self, owner):
        try:
            return http_json('GET', f'{self.origin}/api/integrations/feishu/export?owner={urllib.parse.quote(owner)}', self.ingest_token)
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            raise GatherError(f'正式系统导出失败：{error}') from error

    def kline_closes(self, ticker, market):
        if ticker not in self._kline:
            query = 'range=1y' + ('&adjust=none' if market == 'A' else '')
            bars = http_json('GET', f'{self.origin}/api/kline/{urllib.parse.quote(ticker)}?{query}').get('bars') or []
            self._kline[ticker] = {dt.datetime.fromtimestamp(b['time'], BJ).date(): float(b['close']) for b in bars if b.get('close')}
        return self._kline[ticker]

    def search_name(self, ticker):
        rows = http_json('GET', f'{self.origin}/api/search?q={urllib.parse.quote(ticker)}&limit=5')
        rows = rows.get('results', rows) if isinstance(rows, dict) else rows
        for row in rows or []:
            if str(row.get('t') or row.get('ticker', '')).upper() == ticker.upper():
                return row.get('n') or row.get('name')
        return None

    # DataGateway
    def _gateway(self, path, body):
        if not (self.gateway_url and self.gateway_token):
            return None
        try:
            return http_json('POST', self.gateway_url + path, self.gateway_token, {**body, 'requirement': REQUESTER})
        except (urllib.error.URLError, TimeoutError, ValueError):
            return None

    def gateway_closes(self, symbols, day):
        out = self._gateway('/v1/market-data/security-prices/query',
                            {'symbols': symbols, 'date': day.isoformat(), 'mode': 'cache_then_fetch', 'max_wait_seconds': 20})
        return {i['symbol'].upper(): (float(i['value']), i['date'], i.get('source')) for i in (out or {}).get('data', [])}

    def gateway_names(self, symbols):
        out = self._gateway('/v1/market-data/security-master/query', {'symbols': symbols, 'mode': 'cache_then_fetch'})
        return {i['symbol'].upper(): i.get('sec_name') for i in (out or {}).get('data', []) if i.get('sec_name')}

    def gateway_fx(self, currencies, day):
        out = self._gateway('/v1/market-data/fx/query',
                            {'currencies': currencies, 'date': day.isoformat(), 'mode': 'cache_then_fetch', 'max_wait_seconds': 20})
        return {i['symbol'].upper(): (float(i['value']), i['date'], i.get('source')) for i in (out or {}).get('data', [])}

    # DaoPlatform
    def fund_size(self, fund, day):
        if not (self.dao_url and self.dao_token):
            return None
        try:
            out = http_json('GET', f'{self.dao_url}/v1/fund-size/query?fund={urllib.parse.quote(fund)}&on={day.isoformat()}', self.dao_token)
        except (urllib.error.URLError, TimeoutError, ValueError):
            return None
        return out.get('data')


def analyst_labels(bindings, export):
    names, aliases = bindings.get('analystNamesByRole', {}), bindings.get('analystAliasesByRole', {})
    labels = {}
    for a in export['analysts']:
        key = names.get(a['key']) or a.get('displayName') or a['key']
        alias = (aliases.get(a['key']) or [None])[0]
        labels[a['key']] = f'{alias}（{key}）' if alias and alias != key else key
    return labels


def parse_fx_override(text):
    rates = {}
    for part in (text or '').split(','):
        if '=' in part:
            ccy, rate = part.split('=', 1)
            rates[ccy.strip().upper()] = float(rate)
    return rates


def gather(sources, bindings, day, *, scheduled=False, fund='1', approver='PM', fx_override=None, nav_override=None):
    owner = (bindings.get('simulationAccount') or {}).get('id')
    if not owner or (bindings.get('simulationAccount') or {}).get('confirmed') is not True:
        raise GatherError('正式模拟账户未绑定')
    export = sources.export(owner)
    if scheduled and not export['recommendations']:
        return None
    labels = analyst_labels(bindings, export)
    notes = []

    # securities: display code, symbol candidates, currency
    market_of = {r['ticker']: r['market'] for r in export['recommendations']}
    secs = {}
    for ticker, market in market_of.items():
        bb, symbols = codes(ticker, market)
        secs[ticker] = {'bb': bb, 'symbols': symbols, 'market': market, 'currency': CCY[market], 'wind': symbols[0]}

    def closes_on(day_wanted):
        """ticker -> (close, price date, source) for one day, DataGateway first, then daily bars."""
        found = {}
        quoted = sources.gateway_closes([s for v in secs.values() for s in v['symbols']], day_wanted)
        for ticker, v in secs.items():
            for symbol in v['symbols']:
                hit = quoted.get(symbol.upper())
                if hit and hit[1] <= day_wanted.isoformat():
                    v['wind'] = symbol
                    found[ticker] = (hit[0], hit[1], 'DataGateway')
                    break
            if ticker in found:
                continue
            try:
                bars = sources.kline_closes(ticker, v['market'])
            except (urllib.error.URLError, TimeoutError, ValueError):
                continue
            earlier = [d for d in bars if d <= day_wanted]
            if earlier:
                last = max(earlier)
                found[ticker] = (bars[last], last.isoformat(), 'osbornalpha 日线')
        return found

    today = closes_on(day)
    if scheduled and not any(d == day.isoformat() for _, d, _ in today.values()):
        return None
    stale = [f"{secs[t]['bb']} 用 {d}" for t, (_, d, _) in today.items() if d != day.isoformat()]
    if stale:
        notes.append(('价格日期', '以下标的没有报告日收盘价，取最近一个交易日：' + '；'.join(stale) + '。'))
    used = sorted({src for _, _, src in today.values()})

    names = sources.gateway_names([v['wind'] for v in secs.values()])
    for ticker, v in secs.items():
        v['name'] = names.get(v['wind'].upper())
        if not v['name']:
            try:
                v['name'] = sources.search_name(ticker)
            except (urllib.error.URLError, TimeoutError, ValueError):
                v['name'] = None
        v['name'] = v['name'] or v['bb']

    # trades and their closes on the execution date
    trade_days = {}
    for t in export['trades']:
        trade_days.setdefault(beijing(t['executedAt'])[:10], []).append(t)
    trade_close = {}
    for d, ts in trade_days.items():
        on = closes_on(dt.date.fromisoformat(d))
        for t in ts:
            hit = on.get(t['ticker'])
            trade_close[t['id']] = hit[0] if hit and hit[1] == d else None

    held = {}
    for t in export['trades']:
        held[t['ticker']] = held.get(t['ticker'], 0) + (t['quantity'] if t['direction'] == 'buy' else -t['quantity'])
    missing = [secs[t]['bb'] for t, q in held.items() if q and t not in today]
    if missing:
        raise GatherError('持仓标的缺少收盘价：' + '、'.join(missing))

    # FX: CNY per unit of each needed currency
    needed = sorted({v['currency'] for v in secs.values()} - {'CNY'})
    fx, fx_dates = {'CNY': 1.0}, set()
    for ccy, (rate, d, _) in sources.gateway_fx(needed, day).items():
        fx[ccy] = rate
        fx_dates.add(d)
    manual = {c: r for c, r in parse_fx_override(fx_override).items() if c in needed and c not in fx}
    fx.update(manual)
    absent = [c for c in needed if c not in fx]
    if absent:
        raise GatherError('缺少汇率：' + '、'.join(absent))
    for ccy, rate in fx.items():
        low, high = FX_RANGE.get(ccy, (0, float('inf')))
        if ccy != 'CNY' and not low <= rate <= high:
            raise GatherError(f'{ccy} 汇率 {rate} 超出合理范围')
    fx_note = ('汇率（每单位外币折人民币）取自 DataGateway' + (f'（{"、".join(sorted(fx_dates))}）' if fx_dates else '')) if len(fx) - 1 > len(manual) else ''
    if manual:
        fx_note += ('；' if fx_note else '') + '手工输入（FEISHU_REPORT_FX）：' + '、'.join(f'{c} {r}' for c, r in manual.items())
    fx_note = (fx_note or '只涉及人民币标的') + '。'

    # NAV: the fund's size in RMB from DaoPlatform
    size = sources.fund_size(fund, day)
    if size:
        nav, nav_note = float(size['fund_size_rmb']), f"Fund {fund} 规模 {float(size['fund_size_rmb']):,.2f} 元，取自 DaoPlatform（{size['report_date']}）。"
    elif nav_override:
        value, _, as_of = nav_override.partition('@')
        nav, nav_note = float(value), f'Fund {fund} 规模 {float(value):,.2f} 元，手工输入（FEISHU_REPORT_NAV，{as_of or "日期未注明"}）。'
        notes.append(('NAV 来源', '未能从 DaoPlatform 读取基金规模，使用手工输入值。'))
    else:
        raise GatherError('缺少基金规模（DaoPlatform 与 FEISHU_REPORT_NAV 都不可用）')
    nav_note += ' summary!K4 是唯一输入格。'

    trades_of = {}
    for t in export['trades']:
        trades_of.setdefault(t['recommendationId'], []).append(t)
    recs = []
    for r in export['recommendations']:
        linked = trades_of.get(r['id'], [])
        if linked:
            first = linked[0]
            mode = f"模拟成交 {sum(t['quantity'] for t in linked):,.0f} 股 × {first['price']:.2f} {first['currency']}"
        else:
            mode = '仅登记建议'
        score = r.get('score') or {}
        pct = lambda v: None if v is None else v / 100
        recs.append({
            'id': r['id'][:8], 'time': beijing(r['recommendedAt']), 'analyst': labels[r['analystKey']],
            'ticker': secs[r['ticker']]['bb'], 'action': ACTION.get(r['action'], r['action']), 'mode': mode,
            'ref': r.get('referencePrice'), 'target': r.get('targetPrice'), 'stop': r.get('stopLoss'),
            'confidence': r.get('confidence'), 'horizon': HORIZON.get(r.get('horizon')), 'rationale': r.get('rationale') or None,
            'status': '已撤回' if r.get('withdrawnAt') else '有效', 'adopted': '是' if r['adopted'] else '否',
            'approver': approver, 'approvedAt': beijing(r['decidedAt'] if r['adopted'] and r.get('decidedAt') else r['createdAt']),
            'withdrawnAt': beijing(r.get('withdrawnAt')),
            'r5': pct(score.get('forward5dPct')), 'r20': pct(score.get('forward20dPct')), 'r60': pct(score.get('forward60dPct')),
            'hit': {True: '是', False: '否'}.get(score.get('hit')), 'score': score.get('score'),
        })
    trades = [{
        'id': t['id'][:8], 'time': beijing(t['executedAt']), 'ticker': secs[t['ticker']]['bb'],
        'direction': 'Buy' if t['direction'] == 'buy' else 'Sell', 'quantity': t['quantity'], 'price': t['price'],
        'close': trade_close.get(t['id']), 'fee': t['fee'], 'analyst': labels[t['analystKey']],
        'recommendationId': t['recommendationId'][:8], 'approver': approver,
    } for t in export['trades']]
    positions = [{'ticker': secs[p['ticker']]['bb'], 'shares': p['shares'], 'avgCost': p['avgCost'],
                  'realizedPnl': p['realizedPnl'], 'attributedOnly': p['attributedOnly']}
                 for p in export['positions'] if p['ticker'] in secs]
    unscored = sum(1 for r in recs if r['hit'] is None and r['score'] is None)
    if unscored:
        notes.append(('评分', f'{unscored} 条建议尚未到判定日或尚未评分，收益、命中与评分显示「-」。'))
    notes.insert(0, ('来源', '建议、PM 决策、模拟成交与评分取自正式系统（osbornalpha），只含群内已绑定的分析师；'
                           '建议编号、成交编号为正式系统编号前 8 位。'))
    return {
        'banner': f'正式系统记录：群内已绑定分析师的建议与模拟成交（截至 {day.isoformat()}）',
        'notes': [list(n) for n in notes],
        'tradeDate': day.isoformat(), 'nav': nav, 'navNote': nav_note,
        'fx': [[c, fx[c]] for c in ['CNY'] + needed], 'fxNote': fx_note,
        'priceNote': f'Price 为 {day.isoformat()} 收盘价，取自 ' + ' / '.join(used or ['—']) + '。',
        'analysts': [labels[a['key']] for a in export['analysts']],
        'securities': {v['bb']: {'wind': v['wind'], 'name': v['name'], 'currency': v['currency'],
                                 'close': today.get(t, (None,))[0]} for t, v in secs.items()},
        'recommendations': recs, 'trades': trades, 'positions': positions,
    }


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('--date')
    parser.add_argument('--scheduled', action='store_true')
    args = parser.parse_args(argv)
    root = Path(env('FEISHU_RUNTIME_DIR', str(Path(__file__).resolve().parents[3] / 'build' / 'feishu')))
    bindings = json.loads((root / 'feishu-bindings.json').read_text(encoding='utf-8'))
    origin, token = env('FEISHU_SIMULATION_ORIGIN'), env('FEISHU_SIMULATION_INGEST_TOKEN')
    if not origin or not token:
        raise GatherError('FEISHU_SIMULATION_ORIGIN / FEISHU_SIMULATION_INGEST_TOKEN 未配置')
    sources = Sources(origin, token, env('DATAGATEWAY_URL', 'http://127.0.0.1:8800'), env('DATAGATEWAY_TOKEN'),
                      env('DAOPLATFORM_URL', 'http://127.0.0.1:8000'), env('DAOPLATFORM_FUND_SIZE_TOKEN'))
    day = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(BJ).date()
    data = gather(sources, bindings, day, scheduled=args.scheduled, fund=env('FEISHU_REPORT_FUND', '1'),
                  approver=env('FEISHU_REPORT_APPROVER_LABEL', 'PM'), fx_override=env('FEISHU_REPORT_FX'),
                  nav_override=env('FEISHU_REPORT_NAV'))
    if data is None:
        return EXIT_NOTHING
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except GatherError as error:
        print('gather:', error, file=sys.stderr)
        sys.exit(1)
