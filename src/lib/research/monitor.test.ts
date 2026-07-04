import { describe, it, expect } from 'vitest';
import { openTestDb, type ResearchDb } from './db';
import { ingestSource } from './sources';
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

function mkActiveThesis(db: ResearchDb): Thesis {
  const t = createThesis(db, {
    title: 'NVIDIA 推理需求可持续增长',
    body: '推理 token 经济学支撑数据中心 capex。',
    invalidation_conditions: ['token 单价跌破成本线'],
    watch_metrics: ['NVDA DC 营收 QoQ'],
    next_review_at: '2026-07-18',
  });
  return transitionThesis(db, t.id, 'ACTIVE', 'activate for test');
}

function seedRecentSignal(db: ResearchDb, id: string, title: string): void {
  db.prepare(
    `insert into signals
       (id, title, summary, signal_type, direction, confidence, created_at)
     values (?, ?, 'summary', 'MODEL_USAGE', 'NEGATIVE', 'MEDIUM', ?)`,
  ).run(id, title, new Date().toISOString());
}

function fakeLlm(payload: unknown): LlmFn {
  return async () => ({ content: JSON.stringify(payload), model: 'fake-monitor-model' });
}

describe('monitorThesis', () => {
  it('writes a pending alert event for a WEAKEN verdict WITHOUT changing thesis status', async () => {
    const db = openTestDb();
    const thesis = mkActiveThesis(db);
    seedRecentSignal(db, 'sig-1', 'token growth slowing');

    const result = await monitorThesis(db, thesis, fakeLlm({
      verdict: 'WEAKEN',
      rationale: 'Token growth slowing vs. watch metric.',
      cited_signal_ids: ['sig-1'],
      suggested_status: 'WATCH',
    }));

    expect(result.verdict).toBe('WEAKEN');
    expect(result.event).not.toBeNull();
    // The red line: monitor NEVER auto-transitions.
    expect(getThesis(db, thesis.id)!.status).toBe('ACTIVE');

    const events = listThesisEvents(db, thesis.id).filter((e) => e.event_type === 'WEAKEN');
    expect(events).toHaveLength(1);
    const detail = events[0].detail;
    expect(detail.pending).toBe(true);
    expect(detail.rationale).toBe('Token growth slowing vs. watch metric.');
    expect(detail.cited_signal_ids).toEqual(['sig-1']);
    expect(detail.suggested_status).toBe('WATCH');
    expect((detail.llm_provenance as any).model).toBe('fake-monitor-model');
    expect((detail.llm_provenance as any).prompt_sha256).toMatch(/^[0-9a-f]{64}$/);

    const audits = db.prepare(`select * from audit_log where action = 'thesis.monitor'`).all();
    expect(audits).toHaveLength(1);
    db.close();
  });

  it('drops hallucinated cited signal ids and records them in the event detail', async () => {
    const db = openTestDb();
    const thesis = mkActiveThesis(db);
    seedRecentSignal(db, 'sig-1', 'real signal');
    const result = await monitorThesis(db, thesis, fakeLlm({
      verdict: 'SUPPORT',
      rationale: 'ok',
      cited_signal_ids: ['sig-1', 'invented-id'],
      suggested_status: null,
    }));
    expect(result.verdict).toBe('SUPPORT');
    expect(result.event!.detail.cited_signal_ids).toEqual(['sig-1']);
    expect(result.event!.detail.dropped_cited_ids).toEqual(['invented-id']);
    db.close();
  });

  it('writes no event for a NONE verdict', async () => {
    const db = openTestDb();
    const thesis = mkActiveThesis(db);
    seedRecentSignal(db, 'sig-1', 'irrelevant');
    const result = await monitorThesis(db, thesis, fakeLlm({ verdict: 'NONE' }));
    expect(result.verdict).toBe('NONE');
    expect(result.event).toBeNull();
    const monitorEvents = listThesisEvents(db, thesis.id)
      .filter((e) => e.event_type !== 'STATUS_CHANGE');
    expect(monitorEvents).toHaveLength(0);
    db.close();
  });

  it('skips the LLM entirely when there is no new material in the window', async () => {
    const db = openTestDb();
    const thesis = mkActiveThesis(db);
    let called = 0;
    const llm: LlmFn = async () => { called += 1; return { content: '{}', model: 'x' }; };
    const result = await monitorThesis(db, thesis, llm);
    expect(called).toBe(0);
    expect(result.verdict).toBe('NONE');
    expect(result.llm.source).toBe('none');
    db.close();
  });

  it('maps LLM failure / garbage output to structured results (never throws)', async () => {
    const db = openTestDb();
    const thesis = mkActiveThesis(db);
    seedRecentSignal(db, 'sig-1', 's');
    const failing: LlmFn = async () => { throw new Error('boom'); };
    const r1 = await monitorThesis(db, thesis, failing);
    expect(r1.llm.source).toBe('error');
    expect(r1.event).toBeNull();
    const garbage: LlmFn = async () => ({ content: '{"verdict":"MAYBE"}', model: 'x' });
    const r2 = await monitorThesis(db, thesis, garbage);
    expect(r2.llm.source).toBe('error');
    db.close();
  });
});

describe('monitorAllTheses', () => {
  it('only monitors ACTIVE / WATCH / AT_RISK theses', async () => {
    const db = openTestDb();
    mkActiveThesis(db); // ACTIVE
    createThesis(db, {  // stays DRAFT
      title: 'draft thesis', body: 'b',
      invalidation_conditions: ['c'], watch_metrics: ['m'], next_review_at: '2026-08-01',
    });
    seedRecentSignal(db, 'sig-1', 's');
    let calls = 0;
    const llm: LlmFn = async () => { calls += 1; return { content: '{"verdict":"NONE"}', model: 'x' }; };
    const results = await monitorAllTheses(db, llm);
    expect(results).toHaveLength(1);
    expect(calls).toBe(1);
    db.close();
  });
});

describe('adjudicateAlert', () => {
  async function mkPendingAlert(db: ResearchDb): Promise<{ thesis: Thesis; eventId: string }> {
    const thesis = mkActiveThesis(db);
    const sigId = crypto.randomUUID();
    seedRecentSignal(db, sigId, 's');
    const r = await monitorThesis(db, thesis, fakeLlm({
      verdict: 'WEAKEN', rationale: 'r', cited_signal_ids: [sigId], suggested_status: 'WATCH',
    }));
    return { thesis, eventId: r.event!.id };
  }

  it('ACKNOWLEDGE resolves the alert without any status change', async () => {
    const db = openTestDb();
    const { thesis, eventId } = await mkPendingAlert(db);
    const r = adjudicateAlert(db, thesis.id, eventId, 'ACKNOWLEDGE', 'noted');
    expect(r.event.detail.pending).toBe(false);
    expect((r.event.detail.resolution as any).action).toBe('ACKNOWLEDGE');
    expect(r.thesis.status).toBe('ACTIVE');
    expect(listPendingAlerts(db)).toHaveLength(0);
    const audits = db.prepare(`select * from audit_log where action = 'thesis.adjudicate'`).all();
    expect(audits).toHaveLength(1);
    db.close();
  });

  it('WATCH adjudication transitions via the T3 guard and resolves the alert', async () => {
    const db = openTestDb();
    const { thesis, eventId } = await mkPendingAlert(db);
    const r = adjudicateAlert(db, thesis.id, eventId, 'WATCH', 'watching');
    expect(r.thesis.status).toBe('WATCH');
    expect(r.event.detail.pending).toBe(false);
    // Transition wrote its own STATUS_CHANGE event through the guarded path.
    const changes = listThesisEvents(db, thesis.id).filter((e) => e.event_type === 'STATUS_CHANGE');
    expect(changes.some((e) => e.detail.to === 'WATCH')).toBe(true);
    db.close();
  });

  it('CONFIRM_AT_RISK / CLOSE map to AT_RISK / CLOSED transitions', async () => {
    const db = openTestDb();
    const a = await mkPendingAlert(db);
    expect(adjudicateAlert(db, a.thesis.id, a.eventId, 'CONFIRM_AT_RISK', '').thesis.status).toBe('AT_RISK');
    const b = await mkPendingAlert(db);
    expect(adjudicateAlert(db, b.thesis.id, b.eventId, 'CLOSE', '').thesis.status).toBe('CLOSED');
    db.close();
  });

  it('rejects unknown actions (422), resolved alerts (409), and missing events (404)', async () => {
    const db = openTestDb();
    const { thesis, eventId } = await mkPendingAlert(db);
    expect(() => adjudicateAlert(db, thesis.id, eventId, 'PANIC' as any, '')).toThrow(ThesisError);
    adjudicateAlert(db, thesis.id, eventId, 'IGNORE', '');
    try {
      adjudicateAlert(db, thesis.id, eventId, 'IGNORE', '');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ThesisError).status).toBe(409);
    }
    try {
      adjudicateAlert(db, thesis.id, 'no-such-event', 'IGNORE', '');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ThesisError).status).toBe(404);
    }
    db.close();
  });

  it('an illegal implied transition leaves the alert pending (guard rejects atomically)', async () => {
    const db = openTestDb();
    const { thesis, eventId } = await mkPendingAlert(db);
    // Force the thesis to CLOSED behind the alert's back → WATCH is illegal.
    db.prepare(`update theses set status = 'CLOSED' where id = ?`).run(thesis.id);
    expect(() => adjudicateAlert(db, thesis.id, eventId, 'WATCH', '')).toThrow(/illegal transition/);
    // Alert must still be pending — nothing was half-applied.
    expect(listPendingAlerts(db)).toHaveLength(1);
    db.close();
  });
});

describe('listPendingAlerts', () => {
  it('lists pending monitor events with thesis titles, newest first', async () => {
    const db = openTestDb();
    const thesis = mkActiveThesis(db);
    seedRecentSignal(db, 'sig-1', 's');
    await monitorThesis(db, thesis, fakeLlm({
      verdict: 'INVALIDATE', rationale: 'bad', cited_signal_ids: ['sig-1'], suggested_status: 'INVALIDATED',
    }));
    const alerts = listPendingAlerts(db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].thesis_id).toBe(thesis.id);
    expect(alerts[0].thesis_title).toBe(thesis.title);
    expect(alerts[0].event.event_type).toBe('INVALIDATE');
    db.close();
  });
});
