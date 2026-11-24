import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { beijingInputToISO, beijingInputValue } from './public/beijing-time.mjs';
import { exchangeDate } from '../../src/lib/scoring/forward.ts';
import { parseRegistration, registrationEvent, registrationView, scoreRegistration } from './registrations.mjs';

const data = JSON.parse(readFileSync(new URL('./tencent-hk00700.json', import.meta.url), 'utf8'));
const createdAt = '2026-11-22T18:30:00Z';
const inputFields = {
  ticker: '700', market: 'HK', action: 'buy', reference_price: 400, confidence: 72, target_price: 480,
  stop_loss: 380, horizon: 'mid', rationale: '这是独立作答原文', thesis_ref: 'research/700',
  recommended_at: '2026-06-16T10:00:00+08:00',
};

function marketWindow(day, length = 11) {
  const start = data.bars.findIndex(([time]) => time === day);
  assert.notEqual(start, -1);
  const bars = data.bars.slice(start, start + length).map(([time, close]) => ({ time, close }));
  return {
    ticker: data.ticker, market: data.market, name: data.name, currency: data.currency,
    source: data.source, adjustment: data.adjustment, mode: 'snapshot', fetchedAt: data.retrievedAt,
    snapshotId: data.responseSha256, bars, baseDate: bars[0]?.time ?? null,
    d5Date: bars[5]?.time ?? null, d10Date: bars[10]?.time ?? null,
  };
}

function register(role = 'A', fields = {}, pairNo = 1, length = 11) {
  const input = parseRegistration(role, { ...inputFields, ...fields });
  const quote = marketWindow(input.recommended_at.slice(0, 10), length);
  return scoreRegistration(input, quote, { id: role + '-' + pairNo, createdAt, pairNo });
}

test('production normalization and all manual form fields survive registration and refresh', () => {
  assert.throws(() => parseRegistration('PM', inputFields), { status: 403 });
  assert.throws(() => parseRegistration('A', { ...inputFields, market: 'US' }), { status: 400 });
  assert.throws(() => parseRegistration('A', { ...inputFields, reference_price: 0 }), { status: 400 });
  assert.throws(() => parseRegistration('A', { ...inputFields, recommended_at: '2026-06-16' }), { status: 400 });
  const parsed = parseRegistration('A', { ...inputFields, role: 'B', analyst_id: 'invalid' });
  assert.equal(parsed.role, 'A');
  assert.equal(parsed.ticker, '00700.HK');
  assert.equal(parseRegistration('B', { ...inputFields, ticker: 'SH600519', market: 'A' }).ticker, '600519.SH');
  assert.equal(parseRegistration('B', { ...inputFields, ticker: 'nvda', market: 'US' }).ticker, 'NVDA');
  const current = Date.parse(parseRegistration('B', { ...inputFields, recommended_at: undefined }).recommended_at);
  assert.ok(Math.abs(Date.now() - current) < 2000);
  const r = register().recommendation;
  for (const field of ['rationale', 'thesis_ref', 'horizon', 'target_price', 'stop_loss', 'reference_price', 'confidence']) {
    assert.equal(r[field], inputFields[field]);
  }
  assert.equal(r.recommended_at, '2026-06-16T02:00:00.000Z');
  assert.equal(r.created_at, createdAt);
  assert.equal(r.fill_price, 447.4);
  assert.deepEqual(parseRegistration('A', r), parsed);
  const optional = register('B', { reference_price: undefined, confidence: undefined });
  assert.equal(parseRegistration('B', optional.recommendation).reference_price, undefined);
});

test('observed trading sessions define final, provisional and pending independently of the submitted reference price', () => {
  const settled = register();
  assert.equal(settled.status, 'final');
  assert.equal(settled.score.hit, false);
  assert.equal(settled.score.score, -3.8);
  assert.equal(settled.score.score_5d, -4.2);
  assert.equal(settled.score.score_10d, -3.8);
  assert.equal(settled.score.hit_10d, false);
  const { evidence: e } = settled;
  assert.deepEqual([e.baseDate, e.baseClose, e.d5Date, e.d5Close, e.d10Date, e.d10Close],
    ['2026-06-16', 447.4, '2026-06-24', 428.8, '2026-07-02', 430.2]);
  assert.match(e.disclosure, /已完成的实际交易周期/);
  assert.equal(e.snapshotId, data.responseSha256);
  const partial = register('A', {}, 1, 10);
  assert.equal(partial.status, 'provisional');
  assert.equal(partial.score.score, -4.2);
  assert.equal(partial.score.score_5d, -4.2);
  assert.equal(partial.score.score_10d, null);
  assert.equal(partial.score.hit_10d, null);
  assert.equal(partial.score.forward_10d_pct, null);
  assert.equal(partial.evidence.d10Close, null);
  assert.match(partial.evidence.disclosure, /暂用 5 日/);
  for (const length of [0, 1, 5]) {
    const pending = register('B', {}, 1, length);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.score, null);
    assert.equal(pending.recommendation.fill_price, null);
    assert.equal(pending.evidence.completedDays, Math.max(0, length - 1));
    assert.equal(pending.evidence.d5Date, null);
    assert.match(pending.evidence.disclosure, /5 个交易日/);
  }
  const hold = register('B', { action: 'hold' });
  assert.equal(hold.status, 'final');
  assert.equal(hold.score.hit, null);
  assert.equal(hold.score.hit_10d, null);
  assert.equal(hold.score.score_5d, null);
  assert.equal(hold.score.score_10d, null);
  assert.equal(hold.score.score, null);
  assert.equal(registrationView([hold], 'B').books.B.summary.scorable, 0);
});

test('rejects mismatched symbols and inconsistent quote windows without manufacturing results', () => {
  const q = marketWindow('2026-06-16');
  const input = parseRegistration('A', inputFields);
  for (const quote of [null, { ...q, market: 'A' }, { ...q, ticker: '00005.HK' }, { ...q, d5Date: q.d10Date },
    { ...q, bars: [...q.bars].reverse() }, { ...q, bars: [{ ...q.bars[0], close: NaN }, ...q.bars.slice(1)] }]) {
    assert.throws(() => scoreRegistration(input, quote, { id: 'A-1', createdAt, pairNo: 1 }), { status: 502 });
  }
});

test('the first card publishes the computed result before the PM can open paired registration details', () => {
  const first = register();
  const second = register('A', {
    recommended_at: '2026-09-03T10:00:00+08:00', rationale: '第二组的私有判断', action: 'buy',
  }, 2);
  const bFirst = register('B', { action: 'pass' });
  const onlyA = [first, second];
  const own = registrationView(onlyA, 'A');
  assert.equal(own.entries.length, 2);
  assert.equal(own.books.A.summary.avg_score, -2.7);
  assert.equal(own.books.A.summary.hit_rate, 0);
  assert.equal(own.books.A.self_assessment.independent, 0);
  for (const viewer of ['PM', 'B']) {
    const v = registrationView(onlyA, viewer);
    assert.equal(v.entries.length, 0);
    assert.equal(v.books.A.summary.recommendations, 0);
    assert.equal(v.books.A.summary.hit_rate, null);
    assert.equal(Object.hasOwn(v.books.A, 'self_assessment'), false);
    assert.equal(v.paired, 0);
    assert.deepEqual(v.submitted, { A: 2, B: 0 });
    assert.equal(JSON.stringify(v).includes(inputFields.rationale), false);
  }
  const before = registrationEvent([first], first);
  assert.equal(before.title, '第 1 组 · 分析师 A 评分结果');
  assert.match(before.text, /分析师 A｜00700\.HK｜买入/);
  assert.match(before.text, /T\+5 未命中 · 评分 -4\.2｜T\+10 未命中 · 评分 -3\.8/);
  assert.match(before.text, /命中 0\/1｜命中率 0\.00%/);
  assert.match(before.text, /2026-07-02/);
  assert.doesNotMatch(before.text, /分析师 B｜00700|独立作答原文|research\/700|self_assessment/);
  const entries = [...onlyA, bFirst];
  const shared = registrationView(entries, 'PM');
  assert.deepEqual(shared.entries.map(e => e.id), ['A-1', 'B-1']);
  assert.equal(shared.paired, 1);
  assert.equal(shared.results[0].avgScore, -3.8);
  assert.equal(shared.results[1].hitRate, 100);
  assert.equal(shared.books.A.timeline[0].reference_price, 400);
  assert.equal(shared.books.A.timeline[0].fill, 447.4);
  assert.equal(JSON.stringify(shared).includes('第二组的私有判断'), false);
  const broadcast = registrationEvent(entries, bFirst);
  assert.equal(broadcast.title, '第 1 组 · 双方登记结果');
  assert.match(broadcast.text, /待 PM 核对验收/);
  assert.match(broadcast.text, /分析师 A｜00700.HK/);
  assert.match(broadcast.text, /分析师 B｜00700.HK/);
  assert.match(broadcast.text, /命中率 100.00%/);
  assert.match(broadcast.text, /T\+5 命中 · 评分 \+4\.2｜T\+10 命中 · 评分 \+3\.8/);
  assert.match(broadcast.text, /2026-07-02/);
  assert.doesNotMatch(broadcast.text, /第二组的私有判断|独立作答原文|research\/700|2\.7|self_assessment/);
});

test('either analyst can publish first and the card distinguishes pending and provisional evidence', () => {
  const pending = register('B', { action: 'pass' }, 1, 1);
  const pendingNotice = registrationEvent([pending], pending);
  assert.equal(pendingNotice.title, '第 1 组 · 分析师 B 评分结果');
  assert.match(pendingNotice.text, /T\+5 待评[\s\S]*T\+10 待评/);
  assert.match(pendingNotice.text, /命中率 —/);
  const provisional = register('B', { action: 'pass' }, 1, 6);
  const provisionalNotice = registrationEvent([provisional], provisional);
  assert.match(provisionalNotice.text, /T\+5 命中 · 评分 \+4\.2｜T\+10 待评/);
  assert.match(provisionalNotice.text, /命中率 100\.00%/);
  assert.doesNotMatch(provisionalNotice.text, /独立作答原文|research\/700/);
});

test('Beijing wall times survive a Pacific browser/server timezone and keep the exchange-local scoring date', () => {
  // When Beijing starts Monday, California and New York may still be on Sunday.
  const beijingMonday = '2026-11-23T00:30';
  const instant = '2026-11-22T16:30:00.000Z';
  assert.equal(beijingInputToISO(beijingMonday), instant);
  assert.equal(beijingInputValue(instant), beijingMonday);
  assert.equal(exchangeDate(instant, 'HK'), '2026-11-23');
  assert.equal(exchangeDate(instant, 'US'), '2026-11-22');
  assert.equal(beijingInputToISO('2026-11-23T13:30'), '2026-11-23T05:30:00.000Z');
  assert.equal(beijingInputToISO('2026-06-16T15:30:45.1'), '2026-06-16T07:30:45.100Z');
  assert.throws(() => beijingInputToISO('2026-02-31T09:30'));
  assert.throws(() => beijingInputToISO('2026-06-16T24:00'));
  const nowBeijing = beijingInputValue();
  const fields = { ...inputFields, recommended_at: nowBeijing };
  assert.equal(parseRegistration('A', fields).recommended_at, beijingInputToISO(nowBeijing));
  const later = beijingInputValue(Date.now() + 60 * 60 * 1000);
  assert.throws(() => parseRegistration('A', { ...fields, recommended_at: later }), /当前北京时间/);
});

test('the recommendation horizon neither changes maturity nor flips separate 5 and 10 day outcomes', () => {
  const quote = marketWindow('2026-06-16');
  quote.bars[10].close = 460;
  for (const horizon of [undefined, '5d', '10d']) {
    const input = parseRegistration('A', { ...inputFields, horizon });
    const entry = scoreRegistration(input, quote, { id:'A-1', createdAt, pairNo: 1 });
    assert.equal(entry.recommendation.horizon, horizon ?? null);
    assert.deepEqual([entry.evidence.finalDay, entry.status, entry.score.hit, entry.score.hit_10d,
      entry.score.score_5d, entry.score.score_10d, entry.score.score], [10, 'final', false, true, -4.2, 2.8, 2.8]);
  }
});

test('older finals keep 20-day evidence without mixing their points into the 5/10-day average', () => {
  const current = register();
  const prior = register('A', {}, 2);
  delete prior.evidence.finalDay;
  delete prior.evidence.d10Date;
  delete prior.evidence.d10Close;
  prior.evidence.d20Date = '2026-07-16';
  prior.evidence.d20Close = 484;
  prior.evidence.disclosure = 'T+20 为 2026-07-16';
  prior.score.score = 8.2;
  prior.score.forward_20d_pct = 8.18;
  delete prior.score.forward_10d_pct;
  delete prior.score.hit_10d;
  delete prior.score.score_5d;
  delete prior.score.score_10d;
  const view = registrationView([current, prior], 'A');
  const { summary, timeline } = view.books.A;
  assert.equal(view.entries[1].evidence.finalDay, 20);
  assert.equal(timeline[0].score, 8.2);
  assert.equal(timeline[0].finalDay, 20);
  assert.equal(timeline[0].return20, 8.18);
  assert.equal(summary.recommendations, 2);
  assert.equal(summary.scorable, 2);
  assert.equal(summary.n_score, 1);
  assert.equal(summary.avg_score, -3.8);
  assert.equal(summary.legacy_n_score, 1);
  assert.equal(summary.legacy_avg_score, 8.2);
});
