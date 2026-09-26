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
  DEFAULT_HORIZON_WEEKS,
  OPPORTUNITY_TYPES,
  THESIS_STATUSES,
  THESIS_TRANSITIONS,
  type KillConditionRevision,
  type OpportunityType,
  type Thesis,
  type ThesisCatalyst,
  type ThesisEvent,
  type ThesisPillar,
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
    // WP-A7: rows from before the migration get exactly the migration defaults.
    opportunity_type: OPPORTUNITY_TYPES.includes(row.opportunity_type) ? row.opportunity_type : 'other',
    pillars: arr<ThesisPillar>(row.pillars),
    catalysts: arr<ThesisCatalyst>(row.catalysts),
    horizon_weeks: Array.isArray(row.horizon_weeks) && row.horizon_weeks.length > 0 ? row.horizon_weeks : [...DEFAULT_HORIZON_WEEKS],
    supersedes: typeof row.supersedes === 'string' ? row.supersedes : null,
    kill_condition_revisions: arr<KillConditionRevision>(row.kill_condition_revisions),
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
  // WP-A7 (§5.3), all optional.
  opportunity_type?: OpportunityType;
  pillars?: Array<{ id?: string; text: string; resolvable_by?: string; deadline?: string | null }>;
  catalysts?: Array<{ text: string; expected_date?: string | null }>;
  horizon_weeks?: number[];
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
function optionalDate(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !ISO_DATE.test(v) || !Number.isFinite(Date.parse(v))) {
    throw new ThesisError(`${field} must be an ISO date`, 422);
  }
  return v;
}

/** Validate the §5.3 extension fields; missing ones get the migration defaults. */
function extensionFields(input: CreateThesisInput): { opportunity_type: OpportunityType; pillars: ThesisPillar[]; catalysts: ThesisCatalyst[]; horizon_weeks: number[] } {
  const opportunity_type = input.opportunity_type ?? 'other';
  if (!OPPORTUNITY_TYPES.includes(opportunity_type)) {
    throw new ThesisError(`opportunity_type must be one of ${OPPORTUNITY_TYPES.join(', ')}`, 422);
  }
  if (input.pillars !== undefined && !Array.isArray(input.pillars)) throw new ThesisError('pillars must be an array', 422);
  const ids = new Set<string>();
  const pillars: ThesisPillar[] = (input.pillars ?? []).map((p, i) => {
    if (!p || typeof p.text !== 'string' || p.text.trim() === '') throw new ThesisError(`pillars[${i}].text is required`, 422);
    const id = typeof p.id === 'string' && p.id.trim() !== '' ? p.id.trim() : `p${i + 1}`;
    if (ids.has(id)) throw new ThesisError(`pillars[${i}].id "${id}" is duplicated`, 422);
    ids.add(id);
    return { id, text: p.text.trim(), resolvable_by: typeof p.resolvable_by === 'string' ? p.resolvable_by.trim() : '', deadline: optionalDate(p.deadline, `pillars[${i}].deadline`) };
  });
  if (input.catalysts !== undefined && !Array.isArray(input.catalysts)) throw new ThesisError('catalysts must be an array', 422);
  const catalysts: ThesisCatalyst[] = (input.catalysts ?? []).map((c, i) => {
    if (!c || typeof c.text !== 'string' || c.text.trim() === '') throw new ThesisError(`catalysts[${i}].text is required`, 422);
    return { text: c.text.trim(), expected_date: optionalDate(c.expected_date, `catalysts[${i}].expected_date`) };
  });
  const horizon_weeks = input.horizon_weeks ?? [...DEFAULT_HORIZON_WEEKS];
  if (!Array.isArray(horizon_weeks) || horizon_weeks.length === 0 || !horizon_weeks.every((w) => Number.isInteger(w) && w > 0)) {
    throw new ThesisError('horizon_weeks must be a non-empty array of positive integers', 422);
  }
  return { opportunity_type, pillars, catalysts, horizon_weeks: [...horizon_weeks] };
}

/**
 * Create a DRAFT thesis. Missing title/body/invalidation_conditions/
 * watch_metrics/next_review_at → 422: a thesis without invalidation
 * conditions is not allowed to exist (AX001 spirit).
 */
export async function createThesis(ctx: ResearchCtx, input: CreateThesisInput): Promise<Thesis> {
  return insertThesis(ctx, input, null);
}

async function insertThesis(ctx: ResearchCtx, input: CreateThesisInput, supersedes: string | null): Promise<Thesis> {
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
  const ext = extensionFields(input);

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
    ...ext,
    supersedes,
    kill_condition_revisions: [],
  });
  if (error) throw new Error(error.message);
  await audit(ctx, 'thesis.create', id, {
    title: input.title.trim(),
    invalidation_conditions: invalidation.length,
    watch_metrics: metrics.length,
    opportunity_type: ext.opportunity_type,
    pillars: ext.pillars.length,
    supersedes,
  });
  return (await getThesis(ctx, id))!;
}

// ---------------------------------------------------------------------------
// WP-A7 §7.4.3 — supersede: direction still right, a pillar was wrong → a NEW
// thesis. Nothing is inherited; the window starts from zero. Only a thesis that
// has already been INVALIDATED or CLOSED by a human can be superseded.

export async function supersedeThesis(
  ctx: ResearchCtx,
  oldId: string,
  input: CreateThesisInput,
  reason = '',
): Promise<{ thesis: Thesis; superseded: Thesis }> {
  const old = await getThesis(ctx, oldId);
  if (!old) throw new ThesisError('thesis not found', 404);
  if (old.status !== 'INVALIDATED' && old.status !== 'CLOSED') {
    throw new ThesisError(`supersede requires the old thesis to be INVALIDATED or CLOSED (is ${old.status})`, 422);
  }
  const thesis = await insertThesis(ctx, input, old.id);
  const now = new Date().toISOString();
  const { error } = await ctx.supabase.from(EVENTS).insert({
    id: crypto.randomUUID(),
    user_id: ctx.userId,
    thesis_id: old.id,
    kind: 'NOTE',
    detail: { superseded_by: thesis.id, reason },
    created_at: now,
  });
  if (error) throw new Error(error.message);
  await audit(ctx, 'thesis.supersede', thesis.id, { supersedes: old.id, old_status: old.status, reason });
  return { thesis, superseded: old };
}

// ---------------------------------------------------------------------------
// WP-A7 §7.4.4 — the one allowed edit to a kill condition: its wording was
// wrong. The original text is kept forever in kill_condition_revisions; pillars
// and status are untouched. More than two revisions in a quarter → review.

export interface ReviseKillConditionInput { index: number; new_text: string; reason: string }

export async function reviseKillCondition(ctx: ResearchCtx, id: string, input: ReviseKillConditionInput): Promise<Thesis> {
  const thesis = await getThesis(ctx, id);
  if (!thesis) throw new ThesisError('thesis not found', 404);
  if (thesis.status === 'CLOSED') throw new ThesisError('cannot revise a kill condition on a CLOSED thesis', 422);
  const { index } = input;
  if (!Number.isInteger(index) || index < 0 || index >= thesis.invalidation_conditions.length) {
    throw new ThesisError(`index must be between 0 and ${thesis.invalidation_conditions.length - 1}`, 422);
  }
  const newText = typeof input.new_text === 'string' ? input.new_text.trim() : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (newText === '') throw new ThesisError('new_text is required', 422);
  if (reason === '') throw new ThesisError('reason is required', 422);
  const oldText = thesis.invalidation_conditions[index];
  if (newText === oldText) throw new ThesisError('new_text is identical to the current condition', 422);
  const at = new Date().toISOString();
  const revision: KillConditionRevision = { index, old_text: oldText, new_text: newText, reason, at };
  const conditions = [...thesis.invalidation_conditions];
  conditions[index] = newText;
  const priorRevisions = thesis.kill_condition_revisions ?? [];
  // Optimistic concurrency: the update only applies to the snapshot we read
  // (matched on updated_at); a concurrent revision makes it a no-op, which the
  // re-read detects → 409 instead of silently overwriting the other change.
  const { error: upErr } = await ctx.supabase
    .from(TABLE)
    .update({ invalidation_conditions: conditions, kill_condition_revisions: [...priorRevisions, revision], updated_at: at })
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .eq('updated_at', thesis.updated_at);
  if (upErr) throw new Error(upErr.message);
  const after = (await getThesis(ctx, id))!;
  const written = after.kill_condition_revisions ?? [];
  const last = written[written.length - 1];
  if (written.length !== priorRevisions.length + 1 || !last || last.at !== at || last.index !== index || last.new_text !== newText) {
    throw new ThesisError('thesis changed concurrently; reload and retry the revision', 409);
  }
  const { error: evErr } = await ctx.supabase.from(EVENTS).insert({
    id: crypto.randomUUID(),
    user_id: ctx.userId,
    thesis_id: id,
    kind: 'KILL_CONDITION_REVISED',
    detail: { ...revision },
    created_at: at,
  });
  if (evErr) throw new Error(evErr.message);
  await audit(ctx, 'thesis.revise_kill_condition', id, { index, reason });
  return after;
}

export interface QuarterRevisionCount { count: number; quarter: string; needs_review: boolean }

/** Revisions whose `at` falls in the UTC calendar quarter of `now`; >2 → review (§7.4.4). */
export function killConditionRevisionsInQuarter(thesis: Pick<Thesis, 'kill_condition_revisions'>, now: Date = new Date()): QuarterRevisionCount {
  const year = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3);
  const start = Date.UTC(year, q * 3, 1);
  const end = Date.UTC(year, q * 3 + 3, 1);
  const count = (thesis.kill_condition_revisions ?? []).filter((r) => {
    const t = Date.parse(r.at);
    return Number.isFinite(t) && t >= start && t < end;
  }).length;
  return { count, quarter: `${year}Q${q + 1}`, needs_review: count > 2 };
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
