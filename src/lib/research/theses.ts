/**
 * Thesis lifecycle service (Research OS Phase 5 — Supabase Postgres).
 * A thesis may not exist without invalidation conditions + watch metrics +
 * a next review date (AX001 spirit). Status changes only flow through the
 * guarded transition table below — the monitor NEVER calls transitionThesis;
 * only human adjudication does (spec §3.3).
 *
 * Column mapping: app-level ThesisEvent.event_type ↔ research_thesis_events.kind;
 * source_document_ids has no dedicated column — non-empty arrays are folded
 * into detail.source_document_ids and surfaced back as the typed field.
 */

import { audit, isUuid, type ResearchCtx } from './store';
import {
  THESIS_STATUSES,
  THESIS_TRANSITIONS,
  type Thesis,
  type ThesisEvent,
  type ThesisStatus,
} from './types';

export { THESIS_TRANSITIONS };

const TABLE = 'research_theses';
const EVENTS = 'research_thesis_events';

export class ThesisError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = 'ThesisError';
  }
}

// ---------------------------------------------------------------------------
// Row mapping

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function rowToThesis(row: any): Thesis {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    company_ids: arr<string>(row.company_ids),
    theme_ids: arr<string>(row.theme_ids),
    supporting_evidence_ids: arr<string>(row.supporting_evidence_ids),
    invalidation_conditions: arr<string>(row.invalidation_conditions),
    watch_metrics: arr<string>(row.watch_metrics),
    status: row.status,
    next_review_at: row.next_review_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function rowToThesisEvent(row: any): ThesisEvent {
  const detail =
    row.detail && typeof row.detail === 'object' ? (row.detail as Record<string, unknown>) : {};
  return {
    id: row.id,
    thesis_id: row.thesis_id,
    event_type: row.kind,
    detail,
    source_document_ids: arr<string>(detail.source_document_ids),
    created_at: row.created_at,
  };
}

/** Build the detail jsonb for an event: non-empty source ids fold into detail. */
export function eventDetail(
  detail: Record<string, unknown>,
  sourceDocumentIds: string[],
): Record<string, unknown> {
  return sourceDocumentIds.length > 0
    ? { ...detail, source_document_ids: sourceDocumentIds }
    : detail;
}

export async function getThesis(ctx: ResearchCtx, id: string): Promise<Thesis | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToThesis(data) : null;
}

export async function listTheses(ctx: ResearchCtx): Promise<Thesis[]> {
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToThesis);
}

export async function listThesesByStatus(ctx: ResearchCtx, statuses: ThesisStatus[]): Promise<Thesis[]> {
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .in('status', statuses)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToThesis);
}

export async function listThesisEvents(ctx: ResearchCtx, thesisId: string): Promise<ThesisEvent[]> {
  if (!isUuid(thesisId)) return [];
  const { data, error } = await ctx.supabase
    .from(EVENTS)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('thesis_id', thesisId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToThesisEvent);
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
  const arr2 = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : [];
  if (arr2.length === 0) {
    throw new ThesisError(`${field} requires at least one non-empty entry`, 422);
  }
  return arr2;
}

/**
 * Create a DRAFT thesis. Missing title/body/invalidation_conditions/
 * watch_metrics/next_review_at → 422: a thesis without invalidation
 * conditions is not allowed to exist (AX001 spirit).
 */
export async function createThesis(ctx: ResearchCtx, input: CreateThesisInput): Promise<Thesis> {
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
  const { error } = await ctx.supabase.from(TABLE).insert({
    id,
    user_id: ctx.userId,
    title: input.title.trim(),
    body: input.body.trim(),
    company_ids: input.company_ids ?? [],
    theme_ids: input.theme_ids ?? [],
    supporting_evidence_ids: input.supporting_evidence_ids ?? [],
    invalidation_conditions: invalidation,
    watch_metrics: metrics,
    status: 'DRAFT',
    next_review_at: input.next_review_at.trim(),
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  await audit(ctx, 'thesis.create', id, {
    title: input.title.trim(),
    invalidation_conditions: invalidation.length,
    watch_metrics: metrics.length,
  });
  return (await getThesis(ctx, id))!;
}

// ---------------------------------------------------------------------------
// Transition (the only path that changes thesis status)

export async function transitionThesis(
  ctx: ResearchCtx,
  id: string,
  to: ThesisStatus,
  reason: string,
): Promise<Thesis> {
  const thesis = await getThesis(ctx, id);
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
  const { error: upErr } = await ctx.supabase
    .from(TABLE)
    .update({ status: to, updated_at: now })
    .eq('user_id', ctx.userId)
    .eq('id', id);
  if (upErr) throw new Error(upErr.message);
  const { error: evErr } = await ctx.supabase.from(EVENTS).insert({
    id: crypto.randomUUID(),
    user_id: ctx.userId,
    thesis_id: id,
    kind: 'STATUS_CHANGE',
    detail: { from: thesis.status, to, reason },
    created_at: now,
  });
  if (evErr) throw new Error(evErr.message);
  await audit(ctx, 'thesis.transition', id, { from: thesis.status, to, reason });
  return (await getThesis(ctx, id))!;
}
