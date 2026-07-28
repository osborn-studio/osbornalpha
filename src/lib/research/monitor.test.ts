import { describe, it, expect } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import { createThesis, getThesis, listThesisEvents, transitionThesis } from './theses';
import {
  monitorThesis,
  monitorAllTheses,
  adjudicateAlert,
  listPendingAlerts,
} from './monitor';
import { ThesisError } from './theses';
import type { LlmFn } from './memos';
import type { Thesis } from './types';

function newCtx(): { ctx: ResearchCtx; store: MockStore } {
  return makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore };
}

async function mkActiveThesis(ctx: ResearchCtx): Promise<Thesis> {
  const t = await createThesis(ctx, {
    title: 'NVIDIA 推理需求可持续增长',
    body: '推理 token 经济学支撑数据中心 capex。',
    invalidation_conditions: ['token 单价跌破成本线'],
    watch_metrics: ['NVDA DC 营收 QoQ'],
    next_review_at: '2026-07-18',
  });
  return transitionThesis(ctx, t.id, 'ACTIVE', 'activate for test');
}

/** Insert a recent signal row directly into the in-memory store. */
function seedRecentSignal(ctx: ResearchCtx, store: MockStore, id: string, title: string): void {
  store.seed('research_signals', [{
    id,
    user_id: ctx.userId,
    title,
    summary: 'summary',
    signal_type: 'MODEL_USAGE',
    direction: 'NEGATIVE',
    confidence: 'MEDIUM',
    entity_ids: [],
    source_document_ids: [],
    affected_company_ids: [],
    research_questions: [],
    metadata: {},
    llm_provenance: {},
    created_at: new Date().toISOString(),
  }]);
}

function fakeLlm(payload: unknown): LlmFn {
  return async () => ({ content: JSON.stringify(payload), model: 'fake-monitor-model' });
}

describe('monitorThesis', () => {
  it('writes a pending alert event for a WEAKEN verdict WITHOUT changing thesis status', async () => {
    const { ctx, store } = newCtx();
    const thesis = await mkActiveThesis(ctx);
    seedRecentSignal(ctx, store, 'sig-1', 'token growth slowing');

    const result = await monitorThesis(ctx, thesis, fakeLlm({
      verdict: 'WEAKEN',
      rationale: 'Token growth slowing vs. watch metric.',
      cited_signal_ids: ['sig-1'],
      suggested_status: 'WATCH',
    }));

    expect(result.verdict).toBe('WEAKEN');
    expect(result.event).not.toBeNull();
    // The red line: monitor NEVER auto-transitions.
    expect((await getThesis(ctx, thesis.id))!.status).toBe('ACTIVE');

    const events = (await listThesisEvents(ctx, thesis.id)).filter((e) => e.event_type === 'WEAKEN');
    expect(events).toHaveLength(1);
    const detail = events[0].detail;
    expect(detail.pending).toBe(true);
    expect(detail.rationale).toBe('Token growth slowing vs. watch metric.');
    expect(detail.cited_signal_ids).toEqual(['sig-1']);
    expect(detail.suggested_status).toBe('WATCH');
    expect((detail.llm_provenance as any).model).toBe('fake-monitor-model');
    expect((detail.llm_provenance as any).prompt_sha256).toMatch(/^[0-9a-f]{64}$/);

    const audits = store.rows('research_audit_log').filter((a) => a.action === 'thesis.monitor');
    expect(audits).toHaveLength(1);
  });

  it('drops hallucinated cited signal ids and records them in the event detail', async () => {
    const { ctx, store } = newCtx();
    const thesis = await mkActiveThesis(ctx);
    seedRecentSignal(ctx, store, 'sig-1', 'real signal');
    const result = await monitorThesis(ctx, thesis, fakeLlm({
      verdict: 'SUPPORT',
      rationale: 'ok',
      cited_signal_ids: ['sig-1', 'invented-id'],
      suggested_status: null,
    }));
    expect(result.verdict).toBe('SUPPORT');
    expect(result.event!.detail.cited_signal_ids).toEqual(['sig-1']);
    expect(result.event!.detail.dropped_cited_ids).toEqual(['invented-id']);
  });

  it('writes no event for a NONE verdict', async () => {
    const { ctx, store } = newCtx();
    const thesis = await mkActiveThesis(ctx);
    seedRecentSignal(ctx, store, 'sig-1', 'irrelevant');
    const result = await monitorThesis(ctx, thesis, fakeLlm({ verdict: 'NONE' }));
    expect(result.verdict).toBe('NONE');
    expect(result.event).toBeNull();
    const monitorEvents = (await listThesisEvents(ctx, thesis.id))
      .filter((e) => e.event_type !== 'STATUS_CHANGE');
    expect(monitorEvents).toHaveLength(0);
  });

  it('skips the LLM entirely when there is no new material in the window', async () => {
    const { ctx } = newCtx();
    const thesis = await mkActiveThesis(ctx);
    let called = 0;
    const llm: LlmFn = async () => { called += 1; return { content: '{}', model: 'x' }; };
    const result = await monitorThesis(ctx, thesis, llm);
    expect(called).toBe(0);
    expect(result.verdict).toBe('NONE');
    expect(result.llm.source).toBe('none');
  });

  it('maps LLM failure / garbage output to structured results (never throws)', async () => {
    const { ctx, store } = newCtx();
    const thesis = await mkActiveThesis(ctx);
    seedRecentSignal(ctx, store, 'sig-1', 's');
    const failing: LlmFn = async () => { throw new Error('boom'); };
    const r1 = await monitorThesis(ctx, thesis, failing);
    expect(r1.llm.source).toBe('error');
    expect(r1.event).toBeNull();
    const garbage: LlmFn = async () => ({ content: '{"verdict":"MAYBE"}', model: 'x' });
    const r2 = await monitorThesis(ctx, thesis, garbage);
    expect(r2.llm.source).toBe('error');
  });
});

describe('monitorAllTheses', () => {
  it('only monitors ACTIVE / WATCH / AT_RISK theses', async () => {
    const { ctx, store } = newCtx();
    await mkActiveThesis(ctx); // ACTIVE
    await createThesis(ctx, {  // stays DRAFT
      title: 'draft thesis', body: 'b',
      invalidation_conditions: ['c'], watch_metrics: ['m'], next_review_at: '2026-08-01',
    });
    seedRecentSignal(ctx, store, 'sig-1', 's');
    let calls = 0;
    const llm: LlmFn = async () => { calls += 1; return { content: '{"verdict":"NONE"}', model: 'x' }; };
    const results = await monitorAllTheses(ctx, llm);
    expect(results).toHaveLength(1);
    expect(calls).toBe(1);
  });
});

describe('adjudicateAlert', () => {
  async function mkPendingAlert(ctx: ResearchCtx, store: MockStore): Promise<{ thesis: Thesis; eventId: string }> {
    const thesis = await mkActiveThesis(ctx);
    const sigId = crypto.randomUUID();
    seedRecentSignal(ctx, store, sigId, 's');
    const r = await monitorThesis(ctx, thesis, fakeLlm({
      verdict: 'WEAKEN', rationale: 'r', cited_signal_ids: [sigId], suggested_status: 'WATCH',
    }));
    return { thesis, eventId: r.event!.id };
  }

  it('ACKNOWLEDGE resolves the alert without any status change', async () => {
    const { ctx, store } = newCtx();
    const { thesis, eventId } = await mkPendingAlert(ctx, store);
    const r = await adjudicateAlert(ctx, thesis.id, eventId, 'ACKNOWLEDGE', 'noted');
    expect(r.event.detail.pending).toBe(false);
    expect((r.event.detail.resolution as any).action).toBe('ACKNOWLEDGE');
    expect(r.thesis.status).toBe('ACTIVE');
    expect(await listPendingAlerts(ctx)).toHaveLength(0);
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'thesis.adjudicate');
    expect(audits).toHaveLength(1);
  });

  it('WATCH adjudication transitions via the T3 guard and resolves the alert', async () => {
    const { ctx, store } = newCtx();
    const { thesis, eventId } = await mkPendingAlert(ctx, store);
    const r = await adjudicateAlert(ctx, thesis.id, eventId, 'WATCH', 'watching');
    expect(r.thesis.status).toBe('WATCH');
    expect(r.event.detail.pending).toBe(false);
    // Transition wrote its own STATUS_CHANGE event through the guarded path.
    const changes = (await listThesisEvents(ctx, thesis.id)).filter((e) => e.event_type === 'STATUS_CHANGE');
    expect(changes.some((e) => e.detail.to === 'WATCH')).toBe(true);
  });

  it('CONFIRM_AT_RISK / CLOSE map to AT_RISK / CLOSED transitions', async () => {
    const { ctx, store } = newCtx();
    const a = await mkPendingAlert(ctx, store);
    expect((await adjudicateAlert(ctx, a.thesis.id, a.eventId, 'CONFIRM_AT_RISK', '')).thesis.status).toBe('AT_RISK');
    const b = await mkPendingAlert(ctx, store);
    expect((await adjudicateAlert(ctx, b.thesis.id, b.eventId, 'CLOSE', '')).thesis.status).toBe('CLOSED');
  });

  it('rejects unknown actions (422), resolved alerts (409), and missing events (404)', async () => {
    const { ctx, store } = newCtx();
    const { thesis, eventId } = await mkPendingAlert(ctx, store);
    await expect(adjudicateAlert(ctx, thesis.id, eventId, 'PANIC' as any, '')).rejects.toThrow(ThesisError);
    await adjudicateAlert(ctx, thesis.id, eventId, 'IGNORE', '');
    try {
      await adjudicateAlert(ctx, thesis.id, eventId, 'IGNORE', '');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ThesisError).status).toBe(409);
    }
    try {
      await adjudicateAlert(ctx, thesis.id, '00000000-0000-4000-8000-0000000000ee', 'IGNORE', '');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ThesisError).status).toBe(404);
    }
  });

  it('an illegal implied transition leaves the alert pending (guard rejects atomically)', async () => {
    const { ctx, store } = newCtx();
    const { thesis, eventId } = await mkPendingAlert(ctx, store);
    // Force the thesis to CLOSED behind the alert's back → WATCH is illegal.
    store.rows('research_theses').find((t) => t.id === thesis.id)!.status = 'CLOSED';
    await expect(adjudicateAlert(ctx, thesis.id, eventId, 'WATCH', '')).rejects.toThrow(/illegal transition/);
    // Alert must still be pending — nothing was half-applied.
    expect(await listPendingAlerts(ctx)).toHaveLength(1);
  });
});

describe('listPendingAlerts', () => {
  it('lists pending monitor events with thesis titles, newest first', async () => {
    const { ctx, store } = newCtx();
    const thesis = await mkActiveThesis(ctx);
    seedRecentSignal(ctx, store, 'sig-1', 's');
    await monitorThesis(ctx, thesis, fakeLlm({
      verdict: 'INVALIDATE', rationale: 'bad', cited_signal_ids: ['sig-1'], suggested_status: 'INVALIDATED',
    }));
    const alerts = await listPendingAlerts(ctx);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].thesis_id).toBe(thesis.id);
    expect(alerts[0].thesis_title).toBe(thesis.title);
    expect(alerts[0].event.event_type).toBe('INVALIDATE');
  });
});
