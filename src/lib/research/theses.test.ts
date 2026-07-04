import { describe, it, expect } from 'vitest';
import { openTestDb, type ResearchDb } from './db';
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

function mkThesis(db: ResearchDb, status: ThesisStatus = 'DRAFT'): string {
  const t = createThesis(db, VALID_INPUT);
  if (status !== 'DRAFT') {
    db.prepare(`update theses set status = ? where id = ?`).run(status, t.id);
  }
  return t.id;
}

describe('createThesis', () => {
  it('creates a DRAFT thesis with required fields and audit log', () => {
    const db = openTestDb();
    const t = createThesis(db, { ...VALID_INPUT, company_ids: ['c1'], theme_ids: ['t1'] });
    expect(t.status).toBe('DRAFT');
    expect(t.title).toBe(VALID_INPUT.title);
    expect(t.invalidation_conditions).toHaveLength(2);
    expect(t.watch_metrics).toHaveLength(2);
    expect(t.company_ids).toEqual(['c1']);
    expect(t.next_review_at).toBe('2026-07-18');
    const audits = db.prepare(`select * from audit_log where action = 'thesis.create'`).all();
    expect(audits).toHaveLength(1);
    expect(audits[0].target_id).toBe(t.id);
    expect(listTheses(db)).toHaveLength(1);
    db.close();
  });

  it.each([
    ['title', { ...VALID_INPUT, title: ' ' }],
    ['body', { ...VALID_INPUT, body: '' }],
    ['invalidation_conditions', { ...VALID_INPUT, invalidation_conditions: [] }],
    ['watch_metrics', { ...VALID_INPUT, watch_metrics: [] }],
    ['next_review_at', { ...VALID_INPUT, next_review_at: '' }],
  ] as const)('rejects missing %s with 422 (AX001 spirit)', (_field, input) => {
    const db = openTestDb();
    try {
      createThesis(db, input as any);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ThesisError);
      expect((e as ThesisError).status).toBe(422);
    }
    db.close();
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

  it.each(LEGAL)('%s → %s is allowed, writes STATUS_CHANGE event + audit', (from, to) => {
    const db = openTestDb();
    const id = mkThesis(db, from);
    const t = transitionThesis(db, id, to, 'test reason');
    expect(t.status).toBe(to);
    const events = listThesisEvents(db, id);
    const change = events.find((e) => e.event_type === 'STATUS_CHANGE');
    expect(change).toBeTruthy();
    expect(change!.detail).toEqual({ from, to, reason: 'test reason' });
    const audits = db.prepare(`select * from audit_log where action = 'thesis.transition'`).all();
    expect(audits).toHaveLength(1);
    db.close();
  });

  const ILLEGAL: Array<[ThesisStatus, ThesisStatus]> = [];
  for (const from of THESIS_STATUSES) {
    for (const to of THESIS_STATUSES) {
      if (!LEGAL.some(([f, t]) => f === from && t === to)) ILLEGAL.push([from, to]);
    }
  }

  it.each(ILLEGAL)('%s → %s is rejected with 422 and changes nothing', (from, to) => {
    const db = openTestDb();
    const id = mkThesis(db, from);
    try {
      transitionThesis(db, id, to, 'nope');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ThesisError);
      expect((e as ThesisError).status).toBe(422);
    }
    expect(getThesis(db, id)!.status).toBe(from);
    expect(listThesisEvents(db, id)).toHaveLength(0);
    db.close();
  });

  it('rejects an unknown target status and a missing thesis', () => {
    const db = openTestDb();
    const id = mkThesis(db);
    expect(() => transitionThesis(db, id, 'BANANA' as ThesisStatus, 'x')).toThrow(ThesisError);
    try {
      transitionThesis(db, 'no-such-id', 'ACTIVE', 'x');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ThesisError).status).toBe(404);
    }
    db.close();
  });
});
