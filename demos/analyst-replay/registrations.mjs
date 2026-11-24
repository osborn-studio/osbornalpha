// Registrations use the production parser, exchange calendar convention, forward scorer and paper book.
import { beijingInputValue, beijingInputToISO } from './public/beijing-time.mjs';
import { parseRecommendationInput } from '../../src/lib/analyst/validate.ts';
import { buildBook } from '../../src/lib/analyst/book.ts';
import { exchangeDate, callDirection } from '../../src/lib/scoring/forward.ts';
import { FINAL_SCORING_DAY, scoreDemoForward } from './demo-score.mjs';
import { bandOf } from '../../src/lib/judgments/band.ts';
import { selfAssessment } from '../../src/lib/judgments/adapters/recommendation.ts';
import { selfAssessmentView } from '../../src/components/judgments/analyst-view.ts';

const analystIds = {
  A: '00000000-0000-4000-8000-00000000000a',
  B: '00000000-0000-4000-8000-00000000000b',
};
const profileRole = /^analyst-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const defaultAnalystProfiles = [
  {id:'A', display_name:'分析师 A'},
  {id:'B', display_name:'分析师 B'},
];
const legacyMembers = defaultAnalystProfiles.map(p => p.id);
const actions = { buy: '买入', add: '加仓', hold: '持有', pass: '观望', sell: '卖出', trim: '减仓' };
const formFields = [
  'ticker', 'market', 'action', 'reference_price', 'confidence', 'rationale',
  'target_price', 'stop_loss', 'horizon', 'thesis_ref', 'recommended_at',
];

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export function parseRegistration(role, fields) {
  const analystId = Object.hasOwn(analystIds, role) ? analystIds[role] : profileRole.exec(role)?.[1];
  if (!analystId) fail(403, '只有分析师可以登记本人的建议。');
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail(400, '建议格式无效。');
  // Supply the authenticated analyst, and accept the same optional fields when refreshing a persisted row.
  const form = Object.fromEntries(formFields.filter(key => fields[key] != null).map(key => [key, fields[key]]));
  // Unzoned date-time fields follow the demo's Beijing-time label, including direct API calls.
  if (typeof form.recommended_at === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+$/.test(form.recommended_at)) {
    try { form.recommended_at = beijingInputToISO(form.recommended_at); }
    catch { fail(400, '建议时间无效，请检查北京日期和时分。'); }
  }
  const parsed = parseRecommendationInput({ ...form, analyst_id: analystId, source_type: 'manual' });
  if (!parsed.ok) {
    if (parsed.error === 'recommended_at must not be in the future') {
      fail(400, '建议时间晚于当前北京时间 ' + beijingInputValue().replace('T',' ') + '。请选择已经发生的时刻，或点击「使用当前北京时间」。');
    }
    fail(400, '建议登记未通过校验：' + parsed.error);
  }
  const horizon = ['5d', '10d'].includes(form.horizon) ? form.horizon : parsed.value.horizon;
  return { ...parsed.value, horizon, role, recommended_at: parsed.value.recommended_at ?? new Date().toISOString() };
}

function windowDisclosure(evidence, status) {
  if (evidence.mode === 'unavailable') return '建议已登记。' + evidence.reason + '取得行情后可刷新评分。';
  if (status === 'pending') {
    if (!evidence.baseDate) return (evidence.availableThrough ? '行情截至 ' + evidence.availableThrough + '。' : '') +
      '等待建议日或之后的首个已收盘交易日。取得其后 5 个交易日的收盘价后可评方向命中。';
    return '基准交易日为 ' + evidence.baseDate + '，已有 ' + evidence.completedDays +
      ' 个后续交易日收盘。满 5 个交易日后可评方向命中。';
  }
  if (status === 'provisional' && evidence.completedDays >= FINAL_SCORING_DAY) {
    return '已有 T+5 暂评。刷新评分可核对 T+' + FINAL_SCORING_DAY + ' 收盘价及结算结果。';
  }
  const window = status === 'final'
    ? 'T+' + FINAL_SCORING_DAY + ' 为 ' + evidence.d10Date + '，评分按 ' + FINAL_SCORING_DAY + ' 个交易日结算。'
    : '已取得 5 个交易日的观察结果，当前暂用 5 日收益评分，满 ' + FINAL_SCORING_DAY + ' 个交易日后更新。';
  return '历史行情回放，按已完成的实际交易周期计分。基准日为 ' + evidence.baseDate +
    '，T+5 为 ' + evidence.d5Date + '。' + window;
}

export function scoreRegistration(input, quote, { id, createdAt, pairNo }) {
  // The market gateway establishes the base before trimming the series, and returns completed closes only.
  const { role, source_ref: ignoredSourceRef, ...fields } = input;
  const bars = quote?.bars;
  if (!Array.isArray(bars) || bars.length > FINAL_SCORING_DAY + 1 || quote.ticker !== input.ticker || quote.market !== input.market ||
      bars.some((bar, index) => !Number.isFinite(bar?.close) || bar.close <= 0 || !bar.time ||
        (index > 0 && bar.time <= bars[index - 1].time))) {
    fail(502, '行情窗口无效，请重试。');
  }
  const base = bars[0], d5 = bars[5], d10 = bars[FINAL_SCORING_DAY];
  if ((base?.time ?? null) !== quote.baseDate || (d5?.time ?? null) !== quote.d5Date ||
      (d10?.time ?? null) !== quote.d10Date || (base && base.time < exchangeDate(input.recommended_at, input.market))) {
    fail(502, '行情基准日或交易日窗口不一致，请重试。');
  }
  const result = scoreDemoForward({
    market: input.market, action: input.action, at: input.recommended_at, confidence: input.confidence ?? null,
  }, bars);
  const score = result ? { ...result, recommendation_id: id, scored_at: new Date().toISOString() } : null;
  const recommendation = {
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value ?? null])),
    id, source_type: 'manual', source_ref: null, created_at: createdAt, withdrawn_at: null, withdraw_reason: null,
    fill_price: score?.base_close ?? null, fill_date: score?.base_date ?? null,
  };
  const status = d10 ? 'final' : d5 ? 'provisional' : 'pending';
  const evidence = {
    ticker: quote.ticker, market: quote.market, name: quote.name, currency: quote.currency,
    source: quote.source, mode: quote.mode, ...(quote.reason ? {reason:quote.reason} : {}), adjustment: quote.adjustment, fetchedAt: quote.fetchedAt,
    snapshotId: quote.snapshotId, availableThrough: quote.availableThrough ?? null, baseDate: base?.time ?? null, baseClose: base?.close ?? null,
    d5Date: d5?.time ?? null, d5Close: d5?.close ?? null, d10Date: d10?.time ?? null, d10Close: d10?.close ?? null,
    finalDay: FINAL_SCORING_DAY, completedDays: Math.max(0, bars.length - 1),
  };
  evidence.disclosure = windowDisclosure(evidence, status);
  return { id, role, pairNo, recommendation, score, status, evidence };
}

export function registrationForView(entry) {
  const evidence = entry.evidence;
  if (evidence.finalDay) return entry;
  if (entry.status === 'final' && evidence.d20Date) return { ...entry, evidence: { ...evidence, finalDay: 20 } };
  return {
    ...entry, evidence: {
      ...evidence, finalDay: FINAL_SCORING_DAY, disclosure: windowDisclosure(evidence, entry.status),
    },
  };
}

function bookFor(entries, role, viewer) {
  const rows = entries.filter(entry => entry.role === role);
  const timeline = [...rows].sort((a, b) =>
    b.recommendation.recommended_at.localeCompare(a.recommendation.recommended_at) || b.pairNo - a.pairNo
  ).map(({ recommendation: rec, score, pairNo, status, evidence }) => ({
    ...rec, round: pairNo, pairNo, status, finalDay: evidence.finalDay, date: exchangeDate(rec.recommended_at, rec.market),
    band: callDirection(rec.action) && rec.confidence != null ? bandOf(rec.confidence / 100) : null,
    fill: rec.fill_price, return5: score?.forward_5d_pct ?? null, return10: score?.forward_10d_pct ?? null,
    return20: score?.forward_20d_pct ?? null, return60: score?.forward_60d_pct ?? null,
    hit: score?.hit ?? null, hit10: score?.hit_10d ?? null, score: score?.score ?? null,
    score5: score?.score_5d ?? (status === 'provisional' ? score?.score ?? null : null),
    score10: score?.score_10d ?? null,
  }));
  // Old 20-day finals remain visible and auditable. Both policies still use the same 5-day hit signal.
  const legacy = [];
  const book = buildBook(rows.map(row => {
    if (row.evidence.finalDay === FINAL_SCORING_DAY || row.score?.score == null) return row;
    legacy.push(row.score.score);
    return { ...row, score: { ...row.score, score: null } };
  }));
  book.summary.legacy_n_score = legacy.length;
  book.summary.legacy_avg_score = legacy.length
    ? Math.round(legacy.reduce((sum, score) => sum + score, 0) / legacy.length * 100) / 100
    : null;
  if (viewer === role) book.self_assessment = selfAssessmentView(selfAssessment(rows));
  return { ...book, timeline };
}

function groupsFor(entries, cohorts) {
  const submitted = new Map();
  for (const entry of entries) {
    if (!submitted.has(entry.pairNo)) submitted.set(entry.pairNo, new Set());
    submitted.get(entry.pairNo).add(entry.role);
  }
  const known = cohorts ?? [...submitted.keys()].map(pairNo => ({pairNo,memberIds:legacyMembers}));
  return known.map(({pairNo,memberIds}) => {
    const submittedIds = memberIds.filter(role => submitted.get(pairNo)?.has(role));
    return {pairNo,memberIds,submittedIds,complete:memberIds.length === submittedIds.length};
  });
}

export function registrationView(entries, viewer, {profiles = defaultAnalystProfiles, cohorts} = {}) {
  const roles = profiles.map(profile => profile.id);
  if (viewer !== 'PM' && !roles.includes(viewer)) fail(403, '无法查看此账本。');
  const groups = groupsFor(entries, cohorts);
  const visibleGroups = new Set(groups.filter(group => group.complete &&
    (viewer === 'PM' || group.memberIds.includes(viewer))).map(group => group.pairNo));
  const visible = entries.filter(entry => entry.role === viewer || visibleGroups.has(entry.pairNo)).map(registrationForView);
  const books = Object.fromEntries(roles.map(role => [role, bookFor(visible, role, viewer)]));
  const results = roles.map(role => {
    const summary = books[role].summary;
    return { role, hits: summary.hits, n: summary.scorable, hitRate: summary.hit_rate, avgScore: summary.avg_score };
  });
  const submitted = Object.fromEntries(roles.map(role => [role, 0]));
  for (const entry of entries) submitted[entry.role]++;
  return {entries:visible, books, results, submitted, groups, paired:groups.filter(group => group.complete).length};
}

function publishedCheckpoint(day, hit, score) {
  const direction = hit === undefined ? '待评' : hit === null ? '无方向' : hit ? '命中' : '未命中';
  const points = score == null ? '—' : (score > 0 ? '+' : '') + score.toFixed(1);
  return 'T+' + day + ' ' + direction + ' · 评分 ' + points;
}

function publishedResult(entry, names) {
  const { role, recommendation: rec, evidence: e, score } = registrationForView(entry);
  const day5 = publishedCheckpoint(5, score?.hit,
    score?.score_5d ?? (entry.status === 'provisional' ? score?.score : null));
  const day10 = publishedCheckpoint(10, e.d10Date ? score?.hit_10d : undefined, score?.score_10d);
  const results = e.finalDay === 20
    ? day5 + '｜历史 T+20 评分 ' + (score?.score?.toFixed(1) ?? '—')
    : day5 + '｜' + day10;
  return names.get(role) + '｜' + rec.ticker + '｜' + actions[rec.action] + '｜' + results +
    '\n' + e.disclosure + ' 数据来源：' + e.source + (e.mode === 'snapshot' ? '（历史快照）' : e.mode === 'provider' ? '（行情接口）' : '');
}

function publishedTotals(results, names) {
  return results.map(r => names.get(r.role) + '｜累计 5 日命中 ' + r.hits + '/' + r.n +
    '｜命中率 ' + (r.hitRate == null ? '—' : r.hitRate.toFixed(2) + '%') +
    '｜5/10 日口径平均评分 ' + (r.avgScore == null ? '—' : r.avgScore.toFixed(2)));
}

export function registrationEvent(entries, addedEntry, updated = false,
  {profiles = defaultAnalystProfiles, cohorts} = {}) {
  const names = new Map(profiles.map(profile => [profile.id, profile.display_name]));
  const group = groupsFor(entries, cohorts).find(group => group.pairNo === addedEntry.pairNo);
  const {complete, memberIds, submittedIds} = group;
  const pair = new Map(entries.filter(entry => entry.pairNo === addedEntry.pairNo).map(entry => [entry.role, entry]));
  const allLabel = memberIds.length === 2 ? '双方' : '全组';
  const title = '第 ' + addedEntry.pairNo + ' 组 · ' + (updated ? '行情评分已更新' :
    complete ? allLabel + '登记结果' : names.get(addedEntry.role) + ' 评分结果');
  const lines = [];
  if (complete) {
    const {results} = registrationView(entries, 'PM', {profiles,cohorts});
    lines.push(...memberIds.map(role => publishedResult(pair.get(role), names)),
      '已配对建议累计成绩', ...publishedTotals(results.filter(result => pair.has(result.role)), names),
      allLabel + '已登记 · 待 PM 核对验收');
  } else {
    const {results} = registrationView(entries, addedEntry.role, {profiles,cohorts});
    lines.push(publishedResult(addedEntry, names),
      ...publishedTotals(results.filter(result => result.role === addedEntry.role), names),
      memberIds.length === 2 ? '等待另一位分析师登记' : `已登记 ${submittedIds.length}/${memberIds.length} 人`);
  }
  return {title, text:lines.join('\n')};
}

export function reviewEvent(pair, {pairNo, decision, note, at}, profiles = defaultAnalystProfiles) {
  const names = new Map(profiles.map(profile => [profile.id, profile.display_name]));
  const outcome = decision === 'accept' ? '验收通过' : '退回';
  const provisional = pair.some(entry => entry.status === 'provisional');
  return {
    title:'第 ' + pairNo + ' 组建议 · PM ' + outcome,
    text:[
      '验收结论 ' + outcome,
      'PM 意见 ' + note,
      '验收时间（北京时间） ' + beijingInputValue(at).replace('T', ' '),
      provisional ? '以下包含 5 日暂评，评分更新后需重新核对。' : '本次核对的评分',
      ...pair.map(entry => publishedResult(entry, names)),
    ].join('\n'),
  };
}
