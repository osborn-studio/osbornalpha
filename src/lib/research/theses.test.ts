import { describe, it, expect } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import {
  createThesis,
  getThesis,
  killConditionRevisionsInQuarter,
  listTheses,
  listThesisEvents,
  reviseKillCondition,
  supersedeThesis,
  transitionThesis,
  ThesisError,
  THESIS_TRANSITIONS,
} from './theses';
import { THESIS_STATUSES, type ThesisStatus } from './types';

const VALID_INPUT = {
  title: 'NVIDIA 推理需求可持续增长',
  body: '数据中心 GPU 需求由训练转向推理，token 经济学支撑持续 capex。',
  invalidation_conditions: ['推理 token 单价跌破成本线', 'hyperscaler capex 指引连续两季下调'],
  watch_metrics: ['NVDA 数据中心营收 QoQ', 'OpenRouter token 总量趋势'],
  next_review_at: '2026-07-18',
};

function newCtx(): { ctx: ResearchCtx; store: MockStore } {
  return makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore };
}

/** Create a thesis then force its status directly in the store (bypass guard). */
async function mkThesis(ctx: ResearchCtx, store: MockStore, status: ThesisStatus = 'DRAFT'): Promise<string> {
  const t = await createThesis(ctx, VALID_INPUT);
  if (status !== 'DRAFT') {
    const row = store.rows('research_theses').find((r) => r.id === t.id)!;
    row.status = status;
  }
  return t.id;
}

describe('createThesis', () => {
  it('creates a DRAFT thesis with required fields and audit log', async () => {
    const { ctx, store } = newCtx();
    const t = await createThesis(ctx, { ...VALID_INPUT, company_ids: ['c1'], theme_ids: ['t1'] });
    expect(t.status).toBe('DRAFT');
    expect(t.title).toBe(VALID_INPUT.title);
    expect(t.invalidation_conditions).toHaveLength(2);
    expect(t.watch_metrics).toHaveLength(2);
    expect(t.company_ids).toEqual(['c1']);
    expect(t.next_review_at).toBe('2026-07-18');
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'thesis.create');
    expect(audits).toHaveLength(1);
    expect(audits[0].object_id).toBe(t.id);
    expect(await listTheses(ctx)).toHaveLength(1);
  });

  it.each([
    ['title', { ...VALID_INPUT, title: ' ' }],
    ['body', { ...VALID_INPUT, body: '' }],
    ['invalidation_conditions', { ...VALID_INPUT, invalidation_conditions: [] }],
    ['watch_metrics', { ...VALID_INPUT, watch_metrics: [] }],
    ['next_review_at', { ...VALID_INPUT, next_review_at: '' }],
  ] as const)('rejects missing %s with 422 (AX001 spirit)', async (_field, input) => {
    const { ctx } = newCtx();
    try {
      await createThesis(ctx, input as any);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ThesisError);
      expect((e as ThesisError).status).toBe(422);
    }
  });
});

describe('transitionThesis — full table', () => {
  const LEGAL: ReadonlyArray<[ThesisStatus, ThesisStatus]> = [
    ['DRAFT', 'ACTIVE'], ['DRAFT', 'CLOSED'],
    ['ACTIVE', 'WATCH'], ['ACTIVE', 'AT_RISK'], ['ACTIVE', 'INVALIDATED'], ['ACTIVE', 'CLOSED'],
    ['WATCH', 'ACTIVE'], ['WATCH', 'AT_RISK'], ['WATCH', 'INVALIDATED'], ['WATCH', 'CLOSED'],
    ['AT_RISK', 'ACTIVE'], ['AT_RISK', 'WATCH'], ['AT_RISK', 'INVALIDATED'], ['AT_RISK', 'CLOSED'],
    ['INVALIDATED', 'CLOSED'],
  ];

  it('THESIS_TRANSITIONS matches the plan allow-table exactly', () => {
    const flattened = Object.entries(THESIS_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => [from, to] as [string, string]));
    expect(flattened.sort()).toEqual([...LEGAL].sort());
  });

  it.each(LEGAL)('%s → %s is allowed, writes STATUS_CHANGE event + audit', async (from, to) => {
    const { ctx, store } = newCtx();
    const id = await mkThesis(ctx, store, from);
    const t = await transitionThesis(ctx, id, to, 'test reason');
    expect(t.status).toBe(to);
    const events = await listThesisEvents(ctx, id);
    const change = events.find((e) => e.event_type === 'STATUS_CHANGE');
    expect(change).toBeTruthy();
    expect(change!.detail).toEqual({ from, to, reason: 'test reason' });
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'thesis.transition');
    expect(audits).toHaveLength(1);
  });

  const ILLEGAL: Array<[ThesisStatus, ThesisStatus]> = [];
  for (const from of THESIS_STATUSES) {
    for (const to of THESIS_STATUSES) {
      if (!LEGAL.some(([f, t]) => f === from && t === to)) ILLEGAL.push([from, to]);
    }
  }

  it.each(ILLEGAL)('%s → %s is rejected with 422 and changes nothing', async (from, to) => {
    const { ctx, store } = newCtx();
    const id = await mkThesis(ctx, store, from);
    try {
      await transitionThesis(ctx, id, to, 'nope');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ThesisError);
      expect((e as ThesisError).status).toBe(422);
    }
    expect((await getThesis(ctx, id))!.status).toBe(from);
    expect(await listThesisEvents(ctx, id)).toHaveLength(0);
  });

  it('rejects an unknown target status and a missing thesis', async () => {
    const { ctx, store } = newCtx();
    const id = await mkThesis(ctx, store);
    await expect(transitionThesis(ctx, id, 'BANANA' as ThesisStatus, 'x')).rejects.toThrow(ThesisError);
    try {
      await transitionThesis(ctx, '00000000-0000-4000-8000-0000000000ff', 'ACTIVE', 'x');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ThesisError).status).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// WP-A7: §5.3 fields, §7.4 supersede and kill-condition revision

async function expectThesisError(p: Promise<unknown>, status: number, pattern?: RegExp) {
  try {
    await p;
    expect.unreachable('should have thrown');
  } catch (e) {
    expect(e).toBeInstanceOf(ThesisError);
    expect((e as ThesisError).status).toBe(status);
    if (pattern) expect((e as ThesisError).message).toMatch(pattern);
  }
}

describe('createThesis — WP-A7 fields', () => {
  it('fills §5.3 defaults and maps rows that predate the migration', async () => {
    const { ctx, store } = newCtx();
    const t = await createThesis(ctx, VALID_INPUT);
    expect(t).toMatchObject({ opportunity_type: 'other', pillars: [], catalysts: [], horizon_weeks: [4, 13, 26], supersedes: null, kill_condition_revisions: [] });
    // A legacy row without the new columns still maps to the same defaults.
    const row = store.rows('research_theses').find((r) => r.id === t.id)!;
    for (const k of ['opportunity_type', 'pillars', 'catalysts', 'horizon_weeks', 'supersedes', 'kill_condition_revisions']) delete row[k];
    expect(await getThesis(ctx, t.id)).toMatchObject({ opportunity_type: 'other', pillars: [], horizon_weeks: [4, 13, 26], supersedes: null });
  });

  it('stores opportunity type, pillars (with generated ids), catalysts and horizons', async () => {
    const { ctx } = newCtx();
    const t = await createThesis(ctx, {
      ...VALID_INPUT,
      opportunity_type: 'B',
      pillars: [{ text: '推理需求增速 > 训练', resolvable_by: '季报数据中心拆分' }, { id: 'p-custom', text: '毛利率维持 70%+', resolvable_by: '季报', deadline: '2026-12-31' }],
      catalysts: [{ text: 'GTC 发布', expected_date: '2026-03-15' }, { text: '财报' }],
      horizon_weeks: [4, 13],
    });
    expect(t.opportunity_type).toBe('B');
    expect(t.pillars).toEqual([
      { id: 'p1', text: '推理需求增速 > 训练', resolvable_by: '季报数据中心拆分', deadline: null },
      { id: 'p-custom', text: '毛利率维持 70%+', resolvable_by: '季报', deadline: '2026-12-31' },
    ]);
    expect(t.catalysts).toEqual([{ text: 'GTC 发布', expected_date: '2026-03-15' }, { text: '财报', expected_date: null }]);
    expect(t.horizon_weeks).toEqual([4, 13]);
  });

  it.each([
    ['opportunity_type', { opportunity_type: 'D' }],
    ['horizon_weeks empty', { horizon_weeks: [] }],
    ['horizon_weeks non-positive', { horizon_weeks: [4, 0] }],
    ['horizon_weeks fractional', { horizon_weeks: [4.5] }],
    ['pillar without text', { pillars: [{ text: ' ', resolvable_by: 'x' }] }],
    ['pillar duplicate id', { pillars: [{ id: 'a', text: 'x', resolvable_by: '' }, { id: 'a', text: 'y', resolvable_by: '' }] }],
    ['catalyst without text', { catalysts: [{ text: '' }] }],
    ['catalyst bad date', { catalysts: [{ text: 'x', expected_date: 'soon' }] }],
  ] as const)('rejects %s with 422', async (_label, extra) => {
    const { ctx } = newCtx();
    await expectThesisError(createThesis(ctx, { ...VALID_INPUT, ...(extra as any) }), 422);
  });
});

describe('transitionThesis — isolation (§7.4.2)', () => {
  it('touches only the thesis, its events and the audit log — never S4 tables', async () => {
    const { ctx, store } = newCtx();
    const id = await mkThesis(ctx, store, 'ACTIVE');
    store.seed('research_s4_observation_state', [{ observation_id: 'o1', status: 'open', revision: 0 }]);
    const snapshot = JSON.stringify(store.rows('research_s4_observation_state'));
    const touched = new Set<string>();
    const orig = ctx.supabase.from.bind(ctx.supabase);
    (ctx.supabase as any).from = (table: string) => { touched.add(table); return orig(table); };
    await transitionThesis(ctx, id, 'INVALIDATED', '失效条件 1 成立');
    expect([...touched].sort()).toEqual(['research_audit_log', 'research_theses', 'research_thesis_events']);
    expect(JSON.stringify(store.rows('research_s4_observation_state'))).toBe(snapshot);
  });
});

describe('supersedeThesis (§7.4.3)', () => {
  const NEW_INPUT = { ...VALID_INPUT, title: '新 thesis：方向对但支柱换了', invalidation_conditions: ['新失效条件'], watch_metrics: ['新指标'] };

  it.each(['DRAFT', 'ACTIVE', 'WATCH', 'AT_RISK'] as ThesisStatus[])('refuses to supersede a %s thesis', async (status) => {
    const { ctx, store } = newCtx();
    const oldId = await mkThesis(ctx, store, status);
    await expectThesisError(supersedeThesis(ctx, oldId, NEW_INPUT), 422, /INVALIDATED or CLOSED/);
    expect(await listTheses(ctx)).toHaveLength(1);
  });

  it.each(['INVALIDATED', 'CLOSED'] as ThesisStatus[])('creates a fresh DRAFT successor of a %s thesis without inheriting anything', async (status) => {
    const { ctx, store } = newCtx();
    const oldId = await mkThesis(ctx, store, status);
    const { thesis, superseded } = await supersedeThesis(ctx, oldId, { ...NEW_INPUT, pillars: [{ text: '新支柱', resolvable_by: '季报' }] }, '支柱 2 判断错误');
    expect(superseded.id).toBe(oldId);
    expect(superseded.status).toBe(status);
    expect(thesis.status).toBe('DRAFT');
    expect(thesis.supersedes).toBe(oldId);
    expect(thesis.id).not.toBe(oldId);
    expect(thesis.invalidation_conditions).toEqual(['新失效条件']);
    expect(thesis.pillars!.map((p) => p.text)).toEqual(['新支柱']);
    expect(thesis.kill_condition_revisions).toEqual([]);
    const note = (await listThesisEvents(ctx, oldId)).find((e) => e.event_type === 'NOTE');
    expect(note?.detail).toEqual({ superseded_by: thesis.id, reason: '支柱 2 判断错误' });
    expect(store.rows('research_audit_log').filter((a) => a.action === 'thesis.supersede')).toHaveLength(1);
  });

  it('404s on a missing old thesis and validates the new input like createThesis', async () => {
    const { ctx, store } = newCtx();
    await expectThesisError(supersedeThesis(ctx, '00000000-0000-4000-8000-0000000000ff', NEW_INPUT), 404);
    const oldId = await mkThesis(ctx, store, 'CLOSED');
    await expectThesisError(supersedeThesis(ctx, oldId, { ...NEW_INPUT, invalidation_conditions: [] }), 422);
    expect(await listTheses(ctx)).toHaveLength(1);
  });
});

describe('reviseKillCondition (§7.4.4)', () => {
  it('replaces the wording, keeps the original in kill_condition_revisions, writes event + audit', async () => {
    const { ctx, store } = newCtx();
    const id = await mkThesis(ctx, store, 'ACTIVE');
    const t = await reviseKillCondition(ctx, id, { index: 1, new_text: 'hyperscaler capex 指引连续两季同比下调', reason: '原文写成环比，口径错误' });
    expect(t.invalidation_conditions).toEqual(['推理 token 单价跌破成本线', 'hyperscaler capex 指引连续两季同比下调']);
    expect(t.kill_condition_revisions).toHaveLength(1);
    expect(t.kill_condition_revisions![0]).toMatchObject({ index: 1, old_text: 'hyperscaler capex 指引连续两季下调', new_text: 'hyperscaler capex 指引连续两季同比下调', reason: '原文写成环比，口径错误' });
    expect(t.kill_condition_revisions![0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const ev = (await listThesisEvents(ctx, id)).find((e) => e.event_type === 'KILL_CONDITION_REVISED');
    expect(ev?.detail).toMatchObject({ index: 1, old_text: 'hyperscaler capex 指引连续两季下调' });
    expect(store.rows('research_audit_log').filter((a) => a.action === 'thesis.revise_kill_condition')).toHaveLength(1);
    // Pillars are not touched by a wording revision; status is unchanged.
    expect(t.status).toBe('ACTIVE');
    expect(t.pillars).toEqual([]);
  });

  it.each([
    ['index out of range', { index: 5, new_text: 'x', reason: 'r' }],
    ['negative index', { index: -1, new_text: 'x', reason: 'r' }],
    ['empty text', { index: 0, new_text: ' ', reason: 'r' }],
    ['empty reason', { index: 0, new_text: 'x', reason: '' }],
    ['unchanged text', { index: 0, new_text: '推理 token 单价跌破成本线', reason: 'r' }],
  ] as const)('rejects %s with 422 and writes nothing', async (_label, input) => {
    const { ctx, store } = newCtx();
    const id = await mkThesis(ctx, store, 'ACTIVE');
    await expectThesisError(reviseKillCondition(ctx, id, input as any), 422);
    expect((await getThesis(ctx, id))!.kill_condition_revisions).toEqual([]);
    expect(await listThesisEvents(ctx, id)).toHaveLength(0);
  });

  it('refuses on a CLOSED thesis and 404s on a missing one', async () => {
    const { ctx, store } = newCtx();
    const id = await mkThesis(ctx, store, 'CLOSED');
    await expectThesisError(reviseKillCondition(ctx, id, { index: 0, new_text: 'x', reason: 'r' }), 422, /CLOSED/);
    await expectThesisError(reviseKillCondition(ctx, '00000000-0000-4000-8000-0000000000ff', { index: 0, new_text: 'x', reason: 'r' }), 404);
  });

  it('counts revisions per UTC calendar quarter and flags more than two', () => {
    const rev = (at: string) => ({ index: 0, old_text: 'a', new_text: 'b', reason: 'r', at });
    const t = { kill_condition_revisions: [rev('2026-07-01T00:00:00Z'), rev('2026-08-15T12:00:00Z'), rev('2026-09-30T23:59:59Z'), rev('2026-10-01T00:00:00Z'), rev('2026-04-01T00:00:00Z')] };
    expect(killConditionRevisionsInQuarter(t as any, new Date('2026-09-26T00:00:00Z'))).toEqual({ count: 3, quarter: '2026Q3', needs_review: true });
    expect(killConditionRevisionsInQuarter(t as any, new Date('2026-10-05T00:00:00Z'))).toEqual({ count: 1, quarter: '2026Q4', needs_review: false });
    expect(killConditionRevisionsInQuarter({} as any, new Date('2026-01-01T00:00:00Z'))).toEqual({ count: 0, quarter: '2026Q1', needs_review: false });
  });
});
