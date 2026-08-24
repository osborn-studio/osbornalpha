import { describe, it, expect } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import {
  createThesis,
  getThesis,
  listTheses,
  listThesisEvents,
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
