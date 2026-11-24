// All prices stay on the local server. Only the currently revealed prefix leaves viewState.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { callDirection, scoreForward } from '../../src/lib/scoring/forward.ts';
import { buildBook } from '../../src/lib/analyst/book.ts';
import { bandOf } from '../../src/lib/judgments/band.ts';
import { selfAssessment } from '../../src/lib/judgments/adapters/recommendation.ts';
import { selfAssessmentView } from '../../src/components/judgments/analyst-view.ts';
import { FINAL_SCORING_DAY, scoreDemoForward } from './demo-score.mjs';

const bytes = readFileSync(new URL('./tencent-hk00700.json', import.meta.url));
const snapshotId = createHash('sha256').update(bytes).digest('hex');
if (snapshotId !== '41c4929d2e45ec32bcb2d5997fc3e54f07f39dc7595c983d3d2148991d1302a0') {
  throw new Error('行情文件校验失败，请恢复随演示提供的原始快照。');
}
const dataset = JSON.parse(bytes);
let previousDate = '';
const bars = dataset.bars.map(([time, close]) => {
  const day = new Date(time + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(time) || !Number.isFinite(+day) || day.toISOString().slice(0, 10) !== time ||
      time <= previousDate || time > dataset.cutoff || !Number.isFinite(close) || close <= 0) {
    throw new Error('行情日期或收盘价无效。');
  }
  previousDate = time;
  return { time, close };
});

const roles = ['A', 'B'];
const actions = new Map(Object.entries({ buy: '买入', add: '加仓', hold: '持有', pass: '观望', trim: '减仓', sell: '卖出' }));
const decisionDates = ['2026-06-16', '2026-09-03'];
const leadIn = 10;
const indices = decisionDates.map(date => bars.findIndex(bar => bar.time === date));
if (indices.some((index, r) => index < leadIn || index + 20 >= bars.length || (r > 0 && index <= indices[r - 1] + 20))) {
  throw new Error('每轮需要独立的建议日与完整的前后交易窗口。');
}

function fail(message, status = 409) {
  throw Object.assign(new Error(message), { status });
}

function inputText(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    fail(name + '需填写 1–' + max + ' 个字符。', 400);
  }
  return value.trim();
}

function checkVersion(state) {
  if (state.snapshotId !== snapshotId) fail('本场次使用不同版本的行情，请新建演示场次。');
}

export function initialState() {
  return {
    phase: 'idle',
    round: 1,
    finalDay: FINAL_SCORING_DAY,
    snapshotId,
    rounds: decisionDates.map(() => ({ entries: {}, outcomes: {} })),
    review: null,
  };
}

function entriesForView(state, viewer) {
  const entries = state.rounds[state.round - 1].entries;
  const locked = roles.every(role => entries[role]);
  return roles.map(role => {
    if (!entries[role] || (!locked && viewer !== role)) return { role, submitted: !!entries[role] };
    return { role, submitted: true, ...entries[role] };
  });
}

function finalDayFor(state) {
  // A session that already exposed a 20-day result keeps the original scores and review.
  return state.finalDay ?? (state.rounds.some(round => round.outcomes.d20) ? 20 : FINAL_SCORING_DAY);
}

function latestReveal(round, finalDay) {
  if (round.outcomes['d' + finalDay]) return finalDay;
  return round.outcomes.d5 ? 5 : 0;
}

function visibleMarket(state) {
  const index = indices[state.round - 1];
  const day = latestReveal(state.rounds[state.round - 1], finalDayFor(state));
  const visible = state.phase === 'idle' ? [] : bars.slice(index - leadIn, index + day + 1);
  return {
    name: dataset.name, ticker: dataset.ticker, currency: dataset.currency, adjustment: dataset.adjustment,
    source: dataset.source, snapshotId, asOf: visible.at(-1)?.time ?? null,
    bars: visible.map(({ time: date, close }) => ({ date, close })),
  };
}

function ledgerRows(state, role, viewer) {
  const finalDay = finalDayFor(state);
  return state.rounds.flatMap((round, i) => {
    const entry = round.entries[role];
    if (!entry || (viewer !== role && !roles.every(key => round.entries[key]))) return [];
    const latest = round.outcomes['d' + finalDay] ?? round.outcomes.d5;
    const score = latest?.scores[role] ?? null;
    return [{
      round: i + 1,
      score5: round.outcomes.d5?.scores[role].score ?? null,
      recommendation: {
        id: (i + 1) + '-' + role, ticker: dataset.ticker, market: dataset.market,
        recommended_at: decisionDates[i] + 'T08:00:00Z', created_at: entry.submittedAt, action: entry.action,
        rationale: entry.rationale, confidence: entry.confidence,
        withdrawn_at: null, fill_price: score?.base_close ?? null, fill_date: score?.base_date ?? null,
      },
      score: score ? { ...score, scored_at: latest.at } : null,
    }];
  });
}

function booksFor(state, viewer) {
  const finalDay = finalDayFor(state);
  return Object.fromEntries(roles.map(role => {
    const rows = ledgerRows(state, role, viewer);
    const timeline = rows.slice().reverse().map(({ round, recommendation: r, score, score5 }) => ({
      round, finalDay, ticker: r.ticker, market: r.market, date: r.recommended_at.slice(0, 10),
      action: r.action, rationale: r.rationale, confidence: r.confidence,
      band: callDirection(r.action) === 0 ? null : bandOf(r.confidence / 100),
      fill: r.fill_price, return5: score?.forward_5d_pct ?? null,
      return10: score?.forward_10d_pct ?? null,
      return20: score?.forward_20d_pct ?? null, return60: score?.forward_60d_pct ?? null,
      hit: score?.hit ?? null, hit10: score?.hit_10d ?? null,
      score5, score10: score?.score_10d ?? null, score: score?.score ?? null,
    }));
    const book = { ...buildBook(rows), timeline };
    if (viewer === role) book.self_assessment = selfAssessmentView(selfAssessment(rows));
    return [role, book];
  }));
}

function resultsFor(books) {
  return roles.map(role => {
    const s = books[role].summary;
    return { role, hits: s.hits, n: s.scorable, hitRate: s.hit_rate, avgScore: s.avg_score };
  });
}

function historyFor(state) {
  const finalDay = finalDayFor(state);
  return state.rounds.flatMap((round, i) => {
    const latest = round.outcomes['d' + finalDay] ?? round.outcomes.d5;
    if (!latest) return [];
    const index = indices[i];
    return roles.map(role => {
      const score = latest.scores[role];
      return {
        round: i + 1, role, finalDay, ...round.entries[role],
        baseDate: score.base_date, baseClose: score.base_close,
        d5Date: bars[index + 5].time, d5Close: bars[index + 5].close,
        d10Date: round.outcomes.d10 ? bars[index + 10].time : null,
        d10Close: round.outcomes.d10 ? bars[index + 10].close : null,
        d20Date: round.outcomes.d20 ? bars[index + 20].time : null,
        d20Close: round.outcomes.d20 ? bars[index + 20].close : null,
        return5: score.forward_5d_pct, return10: score.forward_10d_pct ?? null, return20: score.forward_20d_pct,
        hit: score.hit, hit10: score.hit_10d ?? null,
        score: score.score, score5: round.outcomes.d5.scores[role].score, score10: score.score_10d ?? null,
      };
    });
  });
}

export function viewState(state, role) {
  checkVersion(state);
  if (role !== 'PM' && role !== 'observer' && !roles.includes(role)) fail('未知的演示角色。', 403);
  const books = booksFor(state, role);
  return {
    phase: state.phase, round: state.round, finalDay: finalDayFor(state), totalRounds: decisionDates.length, market: visibleMarket(state),
    submissions: entriesForView(state, role), results: resultsFor(books), books, history: historyFor(state), review: state.review,
  };
}

function submit(state, role, input) {
  if (!roles.includes(role)) fail('仅分析师能提交本人的建议。', 403);
  if (state.phase !== 'collecting') fail('当前阶段未开放提交。');
  const entries = state.rounds[state.round - 1].entries;
  if (entries[role]) fail('本轮建议已登记。');
  const { action, confidence } = input;
  if (!actions.has(action)) fail('请选择已列出的建议动作。', 400);
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) fail('信心值须为 0–100 的整数。', 400);
  const rationale = inputText(input.rationale, '判断理由', 500);
  entries[role] = { action, confidence, rationale, submittedAt: new Date().toISOString() };
  if (!roles.every(key => entries[key])) {
    return [{ title: '第 ' + state.round + ' 轮 · 1/2 已提交', text: '分析师 ' + role + ' 已提交。双方建议将在本轮锁定后同时公布。' }];
  }
  state.phase = 'locked';
  return [{
    title: '第 ' + state.round + ' 轮 · 双方建议已锁定',
    text: '基准交易日 ' + decisionDates[state.round - 1] + '\n' +
      roles.map(key => '分析师 ' + key + '｜' + actions.get(entries[key].action) + '｜信心 ' +
        entries[key].confidence + '%\n' + entries[key].rationale).join('\n'),
  }];
}

const formatScore = (value, digits = 1) => value === null ? '—' : (value > 0 ? '+' : '') + value.toFixed(digits);
const formatPct = value => value === null ? '—' : value.toFixed(2) + '%';
function totalsText(state) {
  return resultsFor(booksFor(state, 'PM')).map(r => '分析师 ' + r.role + '｜5 日命中 ' + r.hits + '/' + r.n +
    '（' + formatPct(r.hitRate) + '）｜平均评分 ' + formatScore(r.avgScore, 2)).join('\n');
}

function reveal(state, day) {
  const i = state.round - 1;
  const index = indices[i];
  const round = state.rounds[i];
  const visible = bars.slice(index, index + day + 1);
  const scoreWindow = finalDayFor(state) === 20 ? scoreForward : scoreDemoForward;
  const scores = {};
  for (const role of roles) {
    const { action, confidence } = round.entries[role];
    scores[role] = scoreWindow({ action, confidence, market: dataset.market, at: decisionDates[i] + 'T08:00:00Z' }, visible);
    if (!scores[role]) fail('行情窗口不完整，无法结算。');
  }
  const phase = 'd' + day;
  round.outcomes[phase] = { at: new Date().toISOString(), scores };
  state.phase = phase;
  const details = roles.map(role => {
    const { score, hit, hit_10d } = scores[role];
    const day5 = '5 日' + hitLabel(hit) + '，评分 ' + formatScore(round.outcomes.d5.scores[role].score);
    const next = day === 5 ? '' : '｜' + (day === 10 ? '10 日' + hitLabel(hit_10d) + '，' : '20 日') + '评分 ' + formatScore(score);
    return '分析师 ' + role + '｜' + actions.get(round.entries[role].action) + '｜' + day5 + next;
  });
  return [{
    title: '第 ' + state.round + ' 轮 · T+' + day + (day === 5 ? ' 暂评分' : ' 评分'),
    text: ['历史行情回放｜' + dataset.ticker + '｜' + visible[0].time + ' 收盘 ' + visible[0].close + ' → ' +
      visible.at(-1).time + ' 收盘 ' + visible.at(-1).close + ' ' + dataset.currency, ...details, '累计成绩', totalsText(state)].join('\n'),
  }];
}

function hitLabel(hit) {
  return hit == null ? '无方向' : hit ? '命中' : '未命中';
}

export function applyAction(state, role, kind, input = {}) {
  checkVersion(state);
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('请求内容格式错误。', 400);
  if (kind === 'submit') return submit(state, role, input);
  if (role !== 'PM') fail('该操作仅限本场 PM。', 403);
  if (kind === 'start' && state.phase === 'idle') {
    state.phase = 'collecting';
    return [{ title: '双人历史行情回放 · 开场', text: '第 1 轮使用 ' + dataset.name + '（' + dataset.ticker + '）截至 ' +
      decisionDates[0] + ' 的真实交易数据。两位分析师请分别提交建议。' }];
  }
  if (kind === 'advance') {
    if (state.phase === 'locked') return reveal(state, 5);
    const finalDay = finalDayFor(state);
    if (state.phase === 'd5') return reveal(state, finalDay);
    if (state.phase === 'd' + finalDay) {
      if (state.round === decisionDates.length) {
        state.phase = 'review';
        return [{ title: '两轮完成 · 等待 PM 验收', text: totalsText(state) }];
      }
      state.round += 1;
      state.phase = 'collecting';
      return [{ title: '第 ' + state.round + ' 轮 · 开放提交', text: '本轮决策日为 ' + decisionDates[state.round - 1] + '，请独立提交判断。' }];
    }
  }
  if ((kind === 'accept' || kind === 'return') && state.phase === 'review') {
    const note = inputText(input.note, '验收意见', 500);
    state.review = { decision: kind, note, at: new Date().toISOString() };
    state.phase = kind === 'accept' ? 'complete' : 'returned';
    return [{ title: kind === 'accept' ? 'PM 验收通过' : 'PM 已退回', text: note + '\n' + totalsText(state) }];
  }
  fail('当前阶段无法执行此操作。');
}
