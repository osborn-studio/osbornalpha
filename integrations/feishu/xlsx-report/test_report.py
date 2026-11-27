"""Tests for the Feishu simulation workbook. Run: <venv>/bin/python -m unittest test_report (from this folder)."""
from __future__ import annotations

import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

import build
import evaluate
import gather
import model
import run
import verify

HERE = Path(__file__).resolve().parent
OWNER = '11111111-2222-4333-8444-555555555555'
BINDINGS = {
    'simulationAccount': {'id': OWNER, 'confirmed': True},
    'analystNamesByRole': {'analyst-a': 'lina', 'analyst-b': 'bin'},
    'analystAliasesByRole': {'analyst-a': ['陈利娜'], 'analyst-b': ['陈斌']},
}


def export(trades=True):
    recs = [
        {'id': 'c0527049-aaaa', 'analystKey': 'analyst-a', 'ticker': '01810.HK', 'market': 'HK', 'action': 'buy',
         'recommendedAt': '2026-11-24T07:51:07Z', 'createdAt': '2026-11-24T07:51:49Z', 'withdrawnAt': None,
         'referencePrice': None, 'targetPrice': 30, 'stopLoss': None, 'confidence': 70, 'horizon': 'mid', 'rationale': '',
         'adopted': False, 'decidedAt': None,
         'score': {'hit': True, 'score': 14.7, 'forward5dPct': 3.1, 'forward20dPct': None, 'forward60dPct': None}},
        {'id': '4cfcddf4-bbbb', 'analystKey': 'analyst-a', 'ticker': '00300.HK', 'market': 'HK', 'action': 'buy',
         'recommendedAt': '2026-11-26T07:57:05Z', 'createdAt': '2026-11-26T08:00:44Z', 'withdrawnAt': None,
         'referencePrice': None, 'targetPrice': None, 'stopLoss': None, 'confidence': 70, 'horizon': None, 'rationale': None,
         'adopted': True, 'decidedAt': '2026-11-26T08:00:44Z', 'score': None},
        {'id': '9f00aa11-cccc', 'analystKey': 'analyst-b', 'ticker': 'NVDA', 'market': 'US', 'action': 'sell',
         'recommendedAt': '2026-11-25T14:00:00Z', 'createdAt': '2026-11-25T14:01:00Z', 'withdrawnAt': '2026-11-25T15:00:00Z',
         'referencePrice': 180, 'targetPrice': None, 'stopLoss': None, 'confidence': None, 'horizon': 'short', 'rationale': '到价',
         'adopted': True, 'decidedAt': '2026-11-25T14:30:00Z', 'score': None},
    ]
    tr = [{'id': '2279fcd0-dddd', 'recommendationId': '4cfcddf4-bbbb', 'analystKey': 'analyst-a', 'ticker': '00300.HK',
           'direction': 'buy', 'price': 102.8, 'quantity': 100, 'fee': 5, 'currency': 'HKD', 'executedAt': '2026-11-26T08:00:44Z'}]
    pos = [{'ticker': '00300.HK', 'shares': 100, 'avgCost': 102.85, 'realizedPnl': 0, 'currency': 'HKD', 'attributedOnly': True}]
    return {'ownerId': OWNER, 'analysts': [{'key': 'analyst-a', 'analystId': 'x', 'displayName': 'lina'},
                                           {'key': 'analyst-b', 'analystId': 'y', 'displayName': 'bin'}],
            'recommendations': recs, 'trades': tr if trades else [], 'positions': pos if trades else []}


class FakeSources:
    """No DataGateway and no DaoPlatform by default: exercises the fallbacks."""

    def __init__(self, gateway=None, fx=None, size=None, bars=None):
        self.gateway, self.fx, self.size = gateway or {}, fx or {}, size
        self.bars = bars if bars is not None else {
            '00300.HK': {dt.date(2026, 11, 26): 102.7, dt.date(2026, 11, 27): 103.4},
            '01810.HK': {dt.date(2026, 11, 26): 26.6},
            'NVDA': {dt.date(2026, 11, 26): 188.3},
        }

    def export(self, owner):
        assert owner == OWNER
        return export()

    def kline_closes(self, ticker, market):
        return self.bars.get(ticker, {})

    def search_name(self, ticker):
        return {'00300.HK': '美的集团'}.get(ticker)

    def gateway_closes(self, symbols, day):
        return {s: v for s, v in self.gateway.items() if s in symbols and v[1] == day.isoformat()}

    def gateway_names(self, symbols):
        return {}

    def gateway_fx(self, currencies, day):
        return {c: v for c, v in self.fx.items() if c in currencies}

    def fund_size(self, fund, day):
        return self.size


class CodesTest(unittest.TestCase):
    def test_formal_tickers_map_to_display_and_wind_codes(self):
        self.assertEqual(gather.codes('00300.HK', 'HK'), ('300 HK', ['0300.HK']))
        self.assertEqual(gather.codes('01810.HK', 'HK'), ('1810 HK', ['1810.HK']))
        self.assertEqual(gather.codes('600519.SH', 'A'), ('600519 CH', ['600519.SH']))
        self.assertEqual(gather.codes('NVDA', 'US'), ('NVDA US', ['NVDA.O', 'NVDA.N', 'NVDA']))

    def test_beijing_time(self):
        self.assertEqual(gather.beijing('2026-11-26T08:00:44Z'), '2026-11-26 16:00:44')
        self.assertEqual(gather.beijing('2026-11-26T16:00:44+08:00'), '2026-11-26 16:00:44')


class GatherTest(unittest.TestCase):
    day = dt.date(2026, 11, 27)

    def test_maps_formal_records_with_fallback_prices_manual_fx_and_daoplatform_nav(self):
        size = {'fund': '1', 'report_date': '2026-11-27', 'fund_size_rmb': 203817593.7}
        d = gather.gather(FakeSources(size=size), BINDINGS, self.day, fx_override='HKD=0.85004,USD=6.6643', approver='欧阳（PM）')
        self.assertEqual(d['analysts'], ['陈利娜（lina）', '陈斌（bin）'])
        self.assertEqual(d['nav'], 203817593.7)
        self.assertIn('DaoPlatform（2026-11-27）', d['navNote'])
        self.assertEqual(d['fx'], [['CNY', 1.0], ['HKD', 0.85004], ['USD', 6.6643]])
        self.assertIn('手工输入', d['fxNote'])
        self.assertEqual(d['securities']['300 HK'], {'wind': '0300.HK', 'name': '美的集团', 'currency': 'HKD', 'close': 103.4})
        self.assertEqual(d['securities']['1810 HK']['close'], 26.6)  # last close before the report date
        self.assertTrue(any(k == '价格日期' and '1810 HK 用 2026-11-26' in v for k, v in d['notes']))
        by = {r['id']: r for r in d['recommendations']}
        self.assertEqual(by['c0527049']['adopted'], '否')
        self.assertEqual(by['c0527049']['approvedAt'], '2026-11-24 15:51:49')  # registration time
        self.assertAlmostEqual(by['c0527049']['r5'], 0.031)
        self.assertEqual(by['c0527049']['hit'], '是')
        self.assertEqual(by['c0527049']['horizon'], '中期')
        self.assertEqual(by['4cfcddf4']['mode'], '模拟成交 100 股 × 102.80 HKD')
        self.assertEqual(by['4cfcddf4']['approvedAt'], '2026-11-26 16:00:44')
        self.assertEqual((by['9f00aa11']['status'], by['9f00aa11']['adopted']), ('已撤回', '是'))
        self.assertEqual(d['trades'], [{'id': '2279fcd0', 'time': '2026-11-26 16:00:44', 'ticker': '300 HK', 'direction': 'Buy',
                                        'quantity': 100, 'price': 102.8, 'close': 102.7, 'fee': 5, 'analyst': '陈利娜（lina）',
                                        'recommendationId': '4cfcddf4', 'approver': '欧阳（PM）'}])

    def test_prefers_datagateway(self):
        sources = FakeSources(gateway={'0300.HK': (104.0, '2026-11-27', 'wind'), 'NVDA.N': (190.0, '2026-11-27', 'wind')},
                              fx={'HKD': (0.9, '2026-11-27', 'wind'), 'USD': (7.1, '2026-11-27', 'wind')},
                              size={'fund': '1', 'report_date': '2026-11-26', 'fund_size_rmb': 1e8})
        d = gather.gather(sources, BINDINGS, self.day)
        self.assertEqual(d['securities']['300 HK']['close'], 104.0)
        self.assertEqual(d['securities']['NVDA US']['wind'], 'NVDA.N')
        self.assertEqual(d['fx'][1:], [['HKD', 0.9], ['USD', 7.1]])
        self.assertIn('DataGateway', d['priceNote'])

    def test_refuses_missing_or_absurd_inputs(self):
        with self.assertRaisesRegex(gather.GatherError, '缺少基金规模'):
            gather.gather(FakeSources(), BINDINGS, self.day, fx_override='HKD=0.85,USD=6.66')
        with self.assertRaisesRegex(gather.GatherError, '缺少汇率'):
            gather.gather(FakeSources(), BINDINGS, self.day, nav_override='1e8@2026-11-23')
        with self.assertRaisesRegex(gather.GatherError, '超出合理范围'):
            gather.gather(FakeSources(), BINDINGS, self.day, fx_override='HKD=85,USD=6.66', nav_override='1e8')
        with self.assertRaisesRegex(gather.GatherError, '持仓标的缺少收盘价'):
            gather.gather(FakeSources(bars={}), BINDINGS, self.day, fx_override='HKD=0.85,USD=6.66', nav_override='1e8')

    def test_scheduled_run_skips_a_day_without_closes(self):
        self.assertIsNone(gather.gather(FakeSources(), BINDINGS, dt.date(2026, 11, 28), scheduled=True,
                                        fx_override='HKD=0.85,USD=6.66', nav_override='1e8'))


class WorkbookTest(unittest.TestCase):
    def pipeline(self, data):
        with tempfile.TemporaryDirectory() as tmp:
            built, final = Path(tmp) / 'b.xlsx', Path(tmp) / 'f.xlsx'
            build.build(data, str(built))
            _, errors = evaluate.evaluate(str(built), str(final))
            return errors, verify.verify(data, str(final)), run.figures(str(final), data.ANALYSTS)

    def test_example_fixture_has_no_formula_errors_or_mismatches(self):
        errors, problems, groups = self.pipeline(model.load(HERE / 'fixtures' / 'example.json'))
        self.assertEqual((errors, problems), ([], []))
        pooled = groups[0]
        self.assertEqual((pooled['label'], pooled['held'], pooled['valid'], pooled['adopted'], pooled['withdrawn'], pooled['trades']),
                         ('全组', 5, 10, 9, 1, 9))
        self.assertAlmostEqual(pooled['hitRate'], 2 / 3)

    def test_gathered_data_reconciles_with_the_formal_position(self):
        size = {'fund': '1', 'report_date': '2026-11-27', 'fund_size_rmb': 203817593.7}
        raw = gather.gather(FakeSources(size=size), BINDINGS, dt.date(2026, 11, 27), fx_override='HKD=0.85004,USD=6.6643')
        errors, problems, groups = self.pipeline(model.from_dict(raw))
        self.assertEqual((errors, problems), ([], []))
        self.assertEqual((groups[1]['held'], groups[1]['adopted'], groups[2]['withdrawn']), (1, 1, 1))

    def test_verify_reports_a_formal_position_that_disagrees(self):
        raw = json.loads((HERE / 'fixtures' / 'example.json').read_text(encoding='utf-8'))
        raw['positions'] = [{'ticker': '300 HK', 'shares': 20000, 'avgCost': 99.0, 'realizedPnl': 0, 'attributedOnly': True},
                            {'ticker': '700 HK', 'shares': 1, 'avgCost': 1, 'realizedPnl': 0, 'attributedOnly': False}]
        _, problems, _ = self.pipeline(model.from_dict(raw))
        self.assertEqual(problems, ['formal position 300 HK avg cost: want 99.0, got 102.804'])


if __name__ == '__main__':
    unittest.main()
