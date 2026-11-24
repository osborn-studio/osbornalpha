import assert from 'node:assert/strict';
import test from 'node:test';
import { initialState, applyAction, viewState } from './engine.mjs';

function submit(state, role, action, rationale = '记录我的判断依据') {
  return applyAction(state, role, 'submit', { action, rationale, confidence: 70 });
}
function advance(state) {
  return applyAction(state, 'PM', 'advance');
}

test('the first submission and future closes stay private until their respective reveal', () => {
  const state = initialState();
  assert.equal(viewState(state, 'A').market.bars.length, 0);
  applyAction(state, 'PM', 'start');
  const group = submit(state, 'A', 'buy', '本人的独立理由');
  assert.equal(state.phase, 'collecting');
  for (const role of ['B', 'PM']) {
    const view = viewState(state, role);
    assert.deepEqual(view.submissions[0], { role: 'A', submitted: true });
    assert.equal(JSON.stringify(view).includes('本人的独立理由'), false);
    assert.ok(view.market.bars.every(row => row.date <= '2026-06-16'));
    assert.deepEqual(view.history, []);
  }
  assert.equal(JSON.stringify(group).includes('本人的独立理由'), false);
  assert.equal(viewState(state, 'A').submissions[0].rationale, '本人的独立理由');
  assert.throws(() => advance(state));
  assert.throws(() => submit(state, 'A', 'pass'));
  const reveal = submit(state, 'B', 'pass');
  assert.equal(state.phase, 'locked');
  assert.ok(reveal[0].text.includes('本人的独立理由'));
  assert.equal(viewState(state, 'B').submissions[0].action, 'buy');

  advance(state);
  const five = viewState(state, 'PM');
  assert.equal(five.finalDay, 10);
  assert.equal(five.market.asOf, '2026-06-24');
  assert.equal(five.history[0].score, -4.2);
  assert.equal(five.history[0].d10Date, null);
  assert.equal(five.history[0].d10Close, null);
  assert.equal(five.history[0].return10, null);
  assert.equal(five.history[0].hit10, null);
  assert.equal(five.history[0].return20, null);
  assert.ok(five.market.bars.every(row => row.date <= five.market.asOf));
});

test('the final PM and group receipt agree with hand calculations on the actual frozen market dates', () => {
  const state = initialState();
  applyAction(state, 'PM', 'start');
  for (let i = 0; i < 2; i++) {
    submit(state, 'A', 'buy');
    submit(state, 'B', 'pass');
    advance(state);
    const [period] = advance(state);
    assert.match(period.title, /T\+10/);
    assert.match(period.text, /历史行情回放/);
    assert.match(period.text, /5 日未命中，评分 -\d\.\d｜10 日未命中，评分 -\d\.\d/);
    advance(state);
  }
  assert.equal(state.phase, 'review');
  assert.throws(() => applyAction(state, 'A', 'accept', { note: '越权' }));
  assert.throws(() => applyAction(state, 'PM', 'return', { note: ' ' }));
  const receipt = applyAction(state, 'PM', 'accept', { note: '已核对真实收盘日期、收盘价和两人分数。' });
  const { results, history, review } = viewState(state, 'PM');
  assert.deepEqual(results, [
    { role: 'A', hits: 0, n: 2, hitRate: 0, avgScore: -2.7 },
    { role: 'B', hits: 2, n: 2, hitRate: 100, avgScore: 2.7 },
  ]);
  assert.deepEqual(history.filter(row => row.role === 'A').map(row =>
    [row.baseDate, row.baseClose, row.d5Date, row.d5Close, row.d10Date, row.d10Close, row.hit10, row.score10]),
  [
    ['2026-06-16', 447.4, '2026-06-24', 428.8, '2026-07-02', 430.2, false, -3.8],
    ['2026-09-03', 433, '2026-09-10', 425.6, '2026-09-17', 426, false, -1.6],
  ]);
  assert.equal(review.decision, 'accept');
  assert.equal(state.phase, 'complete');
  assert.ok(receipt[0].text.includes('+2.70'));
  assert.ok(receipt[0].text.includes('-2.70'));
  assert.throws(() => applyAction(state, 'PM', 'accept', { note: '再次' }));
});

test('a previously revealed 20-day session retains its results and finishes under the original rules', () => {
  const state = { ...initialState(), finalDay: 20 };
  applyAction(state, 'PM', 'start');
  submit(state, 'A', 'buy');
  submit(state, 'B', 'pass');
  advance(state);
  advance(state);
  // Older persisted sessions have no scoring-window field.
  delete state.finalDay;
  const legacy = viewState(state, 'PM');
  assert.equal(legacy.finalDay, 20);
  assert.equal(legacy.phase, 'd20');
  assert.equal(legacy.history[0].d20Close, 484);
  assert.equal(legacy.history[0].score5, -4.2);
  assert.equal(legacy.history[0].score, 8.2);
  assert.equal(legacy.history[0].d10Close, null);
  advance(state);
  submit(state, 'A', 'buy');
  submit(state, 'B', 'pass');
  advance(state);
  advance(state);
  assert.equal(state.phase, 'd20');
  advance(state);
  applyAction(state, 'PM', 'accept', { note: '按已公布口径验收' });
  assert.equal(viewState(state, 'PM').results[0].avgScore, 2.75);
  assert.equal(viewState(state, 'PM').review.decision, 'accept');
});

test('hold has no directional sample and a PM return is recorded against the finished replay', () => {
  const state = initialState();
  applyAction(state, 'PM', 'start');
  const before = structuredClone(state);
  assert.throws(() => submit(state, 'PM', 'buy'));
  assert.throws(() => applyAction(state, 'A', 'submit', { action: 'invalid', confidence: 70, rationale: 'test' }));
  assert.throws(() => applyAction(state, 'A', 'submit', { action: 'buy', confidence: 300, rationale: 'test' }));
  assert.throws(() => applyAction(state, 'A', 'submit', { action: 'buy', confidence: 70, rationale: '' }));
  assert.deepEqual(state, before);
  for (let i = 0; i < 2; i++) {
    submit(state, 'A', 'hold');
    submit(state, 'B', 'pass');
    advance(state);
    advance(state);
    advance(state);
  }
  assert.deepEqual(viewState(state, 'A').results[0], { role: 'A', hits: 0, n: 0, hitRate: null, avgScore: null });
  applyAction(state, 'PM', 'return', { note: '样本需要补充' });
  assert.equal(state.phase, 'returned');
  assert.equal(viewState(state, 'B').review.note, '样本需要补充');
});

test('private entries only affect their owner’s book until both analysts lock the round', () => {
  const state = initialState();
  applyAction(state, 'PM', 'start');
  const emptyBook = viewState(state, 'PM').books.A;
  submit(state, 'A', 'buy', '首轮仅自己可见');
  const own = viewState(state, 'A').books.A;
  assert.equal(own.summary.unpriced, 1);
  assert.equal(own.timeline[0].fill, null);
  assert.equal(own.timeline[0].band, 'high');
  for (const viewer of ['B', 'PM']) assert.deepEqual(viewState(state, viewer).books.A, emptyBook);

  submit(state, 'B', 'hold');
  const { self_assessment, ...shareableBook } = own;
  assert.equal(self_assessment.independent, 0);
  assert.deepEqual(viewState(state, 'B').books.A, shareableBook);
  assert.equal(viewState(state, 'A').books.B.timeline[0].band, null);
  advance(state);
  const five = viewState(state, 'PM').books.A;
  assert.equal(five.positions[0].avg_fill, 447.4);
  assert.equal(five.positions[0].last_close, 428.8);
  assert.equal(five.timeline[0].return10, null);
  advance(state);
  const first = viewState(state, 'PM').books.A;
  assert.equal(first.positions[0].last_close, 430.2);
  assert.equal(first.positions[0].unrealized_pct, -3.84);
  assert.equal(first.positions[0].weight, 1);
  assert.equal(first.summary.avg_score, -3.8);

  advance(state);
  submit(state, 'A', 'sell', '第二轮先行登记');
  for (const viewer of ['B', 'PM']) assert.deepEqual(viewState(state, viewer).books.A, first);
  submit(state, 'B', 'trim');
  advance(state);
  const settled = viewState(state, 'PM').books;
  assert.equal(settled.B.summary.no_position_to_sell, 1);
  assert.deepEqual(settled.A.positions, []);
  assert.equal(settled.A.closed[0].exit_price, 433);
  assert.equal(settled.A.summary.avg_realized_pct, -3.22);
  assert.equal(settled.A.summary.closed_units, 1);
  assert.deepEqual(settled.A.timeline.map(row => row.round), [2, 1]);
  assert.deepEqual(settled.A.timeline.map(row => row.return60), [null, null]);
});

test('the ledger presents the actual HK fills and safely displays submitted text', async () => {
  const { renderLedger } = await import('./public/ledger.js');
  const state = initialState();
  applyAction(state, 'PM', 'start');
  const reason = '<i>本人的登记</i>';
  submit(state, 'A', 'buy', reason);
  assert.doesNotMatch(renderLedger(viewState(state, 'PM'), 'A'), /本人的登记/);
  submit(state, 'B', 'pass');
  advance(state);
  const html = renderLedger(viewState(state, 'PM'), 'A');
  assert.match(html, /447\.400/);
  assert.match(html, /高 · 未校准/);
  assert.match(html, /登记信心 70%/);
  assert.match(html, /&lt;i&gt;本人的登记&lt;\/i&gt;/);
  assert.ok(!html.includes(reason));
});

test('the private self-assessment excludes retrospectively registered replay calls', async () => {
  const { renderLedger } = await import('./public/ledger.js');
  const state = initialState();
  applyAction(state, 'PM', 'start');
  const notifications = [...submit(state, 'A', 'buy'), ...submit(state, 'B', 'pass')];
  // Real registration instants are later than the historical decision date.
  for (const entry of Object.values(state.rounds[0].entries)) entry.submittedAt = '2026-11-22T08:00:00Z';
  notifications.push(...advance(state));
  assert.equal(viewState(state, 'A').books.A.summary.scorable, 1);
  for (const viewer of ['A', 'B', 'PM']) {
    const view = viewState(state, viewer);
    for (const role of ['A', 'B']) {
      if (viewer === role) {
        assert.equal(view.books[role].self_assessment.empty, true);
        assert.equal(view.books[role].self_assessment.independent, 0);
        assert.match(renderLedger(view, role), /0 个独立样本/);
      } else {
        assert.equal(Object.hasOwn(view.books[role], 'self_assessment'), false);
        assert.doesNotMatch(renderLedger(view, role), /自评（不可审计）/);
      }
    }
  }
  assert.doesNotMatch(JSON.stringify(notifications), /Brier|self_assessment|独立样本|不可审计/);
});

test('on-time registration produces the production Brier and Wilson figures only for the owner', async () => {
  const { renderLedger } = await import('./public/ledger.js');
  const state = initialState();
  applyAction(state, 'PM', 'start');
  for (const [i, day] of ['2026-06-16', '2026-09-03'].entries()) {
    submit(state, 'A', i === 0 ? 'buy' : 'pass');
    submit(state, 'B', 'hold');
    // Model advice actually registered on each exchange decision date, with p = 0.70.
    for (const entry of Object.values(state.rounds[i].entries)) entry.submittedAt = day + 'T08:00:00Z';
    advance(state);
    advance(state);
    advance(state);
  }
  const own = viewState(state, 'A');
  const assessment = own.books.A.self_assessment;
  assert.equal(assessment.settled, 2);
  assert.equal(assessment.independent, 2);
  assert.equal(assessment.hitRate, '50%');
  assert.equal(assessment.interval, '9–91%');
  assert.equal(assessment.brier, '0.290'); // ((0.7 - 0)² + (0.7 - 1)²) / 2
  assert.equal(assessment.brierSkill, '-0.16');
  assert.deepEqual(assessment.bands[0], { band: 'high', n: 2, hits: 1, rate: '50%', interval: '9–91%' });
  assert.match(renderLedger(own, 'A'), /0\.290/);
  assert.equal(viewState(state, 'B').books.B.self_assessment.independent, 0);
  for (const viewer of ['B', 'PM']) assert.equal(Object.hasOwn(viewState(state, viewer).books.A, 'self_assessment'), false);
  const receipt = applyAction(state, 'PM', 'accept', { note: '核对完成' });
  assert.doesNotMatch(JSON.stringify(receipt), /Brier|self_assessment|0\.290/);
});
