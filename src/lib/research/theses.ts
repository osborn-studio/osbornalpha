/**
 * Thesis lifecycle service (Research OS Phase 2).
 * A thesis may not exist without invalidation conditions + watch metrics +
 * a next review date (AX001 spirit). Status changes only flow through the
 * guarded transition table below — the monitor NEVER calls transitionThesis;
 * only human adjudication does (spec §3.3).
 */

import { logAudit, type ResearchDb } from './db';
import {
  THESIS_STATUSES,
  THESIS_TRANSITIONS,
  readJson,
  writeJson,
  type Thesis,
  type ThesisEvent,
  type ThesisStatus,
} from './types';

export { THESIS_TRANSITIONS };

export class ThesisError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = 'ThesisError';
  }
}

// ---------------------------------------------------------------------------
// Row mapping

function rowToThesis(row: any): Thesis {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    company_ids: readJson<string[]>(row.company_ids, []),
    theme_ids: readJson<string[]>(row.theme_ids, []),
    supporting_evidence_ids: readJson<string[]>(row.supporting_evidence_ids, []),
    invalidation_conditions: readJson<string[]>(row.invalidation_conditions, []),
    watch_metrics: readJson<string[]>(row.watch_metrics, []),
    status: row.status,
    next_review_at: row.next_review_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function rowToThesisEvent(row: any): ThesisEvent {
  return {
    id: row.id,
    thesis_id: row.thesis_id,
    event_type: row.event_type,
    detail: readJson<Record<string, unknown>>(row.detail, {}),
    source_document_ids: readJson<string[]>(row.source_document_ids, []),
    created_at: row.created_at,
  };
}

export function getThesis(db: ResearchDb, id: string): Thesis | null {
  const row = db.prepare(`select * from theses where id = ?`).get(id);
  return row ? rowToThesis(row) : null;
}

export function listTheses(db: ResearchDb): Thesis[] {
  return db.prepare(`select * from theses order by created_at desc`).all().map(rowToThesis);
}

export function listThesesByStatus(db: ResearchDb, statuses: ThesisStatus[]): Thesis[] {
  const marks = statuses.map(() => '?').join(', ');
  return db
    .prepare(`select * from theses where status in (${marks}) order by created_at desc`)
    .all(...statuses)
    .map(rowToThesis);
}

export function listThesisEvents(db: ResearchDb, thesisId: string): ThesisEvent[] {
  return db
    .prepare(`select * from thesis_events where thesis_id = ? order by created_at desc, id desc`)
    .all(thesisId)
    .map(rowToThesisEvent);
}

// ---------------------------------------------------------------------------
// Create

export interface CreateThesisInput {
  title: string;
  body: string;
  invalidation_conditions: string[];
  watch_metrics: string[];
  next_review_at: string;
  company_ids?: string[];
  theme_ids?: string[];
  supporting_evidence_ids?: string[];
}

function requireStringArray(v: unknown, field: string): string[] {
  const arr = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : [];
  if (arr.length === 0) {
    throw new ThesisError(`${field} requires at least one non-empty entry`, 422);
  }
  return arr;
}

/**
 * Create a DRAFT thesis. Missing title/body/invalidation_conditions/
 * watch_metrics/next_review_at → 422: a thesis without invalidation
 * conditions is not allowed to exist (AX001 spirit).
 */
export function createThesis(db: ResearchDb, input: CreateThesisInput): Thesis {
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    throw new ThesisError('title is required', 422);
  }
  if (typeof input.body !== 'string' || input.body.trim() === '') {
    throw new ThesisError('body is required', 422);
  }
  const invalidation = requireStringArray(input.invalidation_conditions, 'invalidation_conditions');
  const metrics = requireStringArray(input.watch_metrics, 'watch_metrics');
  if (typeof input.next_review_at !== 'string' || input.next_review_at.trim() === '') {
    throw new ThesisError('next_review_at is required', 422);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `insert into theses
       (id, title, body, company_ids, theme_ids, supporting_evidence_ids,
        invalidation_conditions, watch_metrics, status, next_review_at,
        created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
  ).run(
    id,
    input.title.trim(),
    input.body.trim(),
    writeJson(input.company_ids ?? []),
    writeJson(input.theme_ids ?? []),
    writeJson(input.supporting_evidence_ids ?? []),
    writeJson(invalidation),
    writeJson(metrics),
    input.next_review_at.trim(),
    now,
    now,
  );
  logAudit(db, 'thesis.create', id, {
    title: input.title.trim(),
    invalidation_conditions: invalidation.length,
    watch_metrics: metrics.length,
  });
  return getThesis(db, id)!;
}

// ---------------------------------------------------------------------------
// Transition (the only path that changes thesis status)

export function transitionThesis(
  db: ResearchDb,
  id: string,
  to: ThesisStatus,
  reason: string,
): Thesis {
  const thesis = getThesis(db, id);
  if (!thesis) throw new ThesisError('thesis not found', 404);
  if (!THESIS_STATUSES.includes(to)) {
    throw new ThesisError(`unknown status: ${String(to)}`, 422);
  }
  const allowed = THESIS_TRANSITIONS[thesis.status];
  if (!allowed.includes(to)) {
    throw new ThesisError(
      `illegal transition ${thesis.status} → ${to} (allowed: ${allowed.join(', ') || 'none'})`,
      422,
    );
  }
  const now = new Date().toISOString();
  db.prepare(`update theses set status = ?, updated_at = ? where id = ?`).run(to, now, id);
  db.prepare(
    `insert into thesis_events (id, thesis_id, event_type, detail, source_document_ids, created_at)
     values (?, ?, 'STATUS_CHANGE', ?, '[]', ?)`,
  ).run(
    crypto.randomUUID(),
    id,
    writeJson({ from: thesis.status, to, reason }),
    now,
  );
  logAudit(db, 'thesis.transition', id, { from: thesis.status, to, reason });
  return getThesis(db, id)!;
}
