/**
 * Thesis monitor (Research OS Phase 5 — Supabase Postgres).
 * New signals + sources (7-day window, small data → full scan) are reviewed
 * against each ACTIVE/WATCH/AT_RISK thesis by the LLM. Non-NONE verdicts are
 * written as PENDING thesis_events — the monitor NEVER changes thesis status
 * (spec §3.3); only adjudicateAlert(), driven by a human, transitions via the
 * T3 guard table.
 */

import { audit, isUuid, type ResearchCtx } from './store';
import { defaultLlm, type LlmFn } from './memos';
import { listSignalsSince } from './signals';
import { rowToSource } from './sources';
import {
  ThesisError,
  eventDetail,
  getThesis,
  listThesesByStatus,
  rowToThesisEvent,
  transitionThesis,
} from './theses';
import { buildMonitorPrompt, validateMonitorVerdict, type MonitorVerdictKind } from './monitor-prompt';
import type { SourceDocument, Thesis, ThesisEvent, ThesisStatus } from './types';

const EVENTS = 'research_thesis_events';
const MONITOR_WINDOW_DAYS = 7;
const MONITOR_EVENT_TYPES = ['SUPPORT', 'WEAKEN', 'INVALIDATE'] as const;

export interface MonitorResult {
  thesis_id: string;
  verdict: MonitorVerdictKind;
  /** The pending alert event, or null for NONE / failures. */
  event: ThesisEvent | null;
  llm:
    | { source: 'llm'; model: string }
    | { source: 'none' | 'no-key' | 'error'; message: string };
}

function windowStartIso(): string {
  return new Date(Date.now() - MONITOR_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function listSourcesSince(ctx: ResearchCtx, sinceIso: string): Promise<SourceDocument[]> {
  const { data, error } = await ctx.supabase
    .from('research_source_documents')
    .select('*')
    .eq('user_id', ctx.userId)
    .gte('ingested_at', sinceIso)
    .order('ingested_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToSource);
}

async function getThesisEvent(
  ctx: ResearchCtx,
  eventId: string,
  thesisId?: string,
): Promise<ThesisEvent | null> {
  if (!isUuid(eventId)) return null;
  let q = ctx.supabase
    .from(EVENTS)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', eventId);
  if (thesisId !== undefined) q = q.eq('thesis_id', thesisId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToThesisEvent(data) : null;
}

/**
 * Monitor one thesis against the last 7 days of signals + sources.
 * NONE → no event. SUPPORT/WEAKEN/INVALIDATE → pending thesis_event with
 * rationale, validated citations, suggested_status and llm_provenance.
 */
export async function monitorThesis(
  ctx: ResearchCtx,
  thesis: Thesis,
  llm: LlmFn = defaultLlm,
): Promise<MonitorResult> {
  const since = windowStartIso();
  const signals = await listSignalsSince(ctx, since);
  const sources = await listSourcesSince(ctx, since);
  if (signals.length === 0 && sources.length === 0) {
    return {
      thesis_id: thesis.id, verdict: 'NONE', event: null,
      llm: { source: 'none', message: 'no new material in monitor window' },
    };
  }

  const prompt = buildMonitorPrompt({ thesis, signals, sources });

  let content: string;
  let model: string;
  try {
    const r = await llm({ system: prompt.system, user: prompt.user });
    content = r.content;
    model = r.model;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const noKey = /no llm provider configured/i.test(message);
    return {
      thesis_id: thesis.id, verdict: 'NONE', event: null,
      llm: { source: noKey ? 'no-key' : 'error', message },
    };
  }

  const { extractJson } = await import('@/lib/data/sources/llm');
  const verdict = validateMonitorVerdict(extractJson(content), prompt.signal_ids);
  if (!verdict) {
    return {
      thesis_id: thesis.id, verdict: 'NONE', event: null,
      llm: { source: 'error', message: 'LLM output was not a valid monitor verdict' },
    };
  }

  if (verdict.verdict === 'NONE') {
    await audit(ctx, 'thesis.monitor', thesis.id, {
      verdict: 'NONE', model, prompt_sha256: prompt.prompt_sha256,
      dropped_cited_ids: verdict.dropped_cited_ids,
    });
    return { thesis_id: thesis.id, verdict: 'NONE', event: null, llm: { source: 'llm', model } };
  }

  const now = new Date().toISOString();
  const detail: Record<string, unknown> = {
    rationale: verdict.rationale,
    cited_signal_ids: verdict.cited_signal_ids,
    suggested_status: verdict.suggested_status,
    pending: true,
    llm_provenance: { model, prompt_sha256: prompt.prompt_sha256, generated_at: now },
  };
  if (verdict.dropped_cited_ids.length > 0) {
    detail.dropped_cited_ids = verdict.dropped_cited_ids;
  }
  const eventId = crypto.randomUUID();
  const { error } = await ctx.supabase.from(EVENTS).insert({
    id: eventId,
    user_id: ctx.userId,
    thesis_id: thesis.id,
    kind: verdict.verdict,
    detail: eventDetail(detail, prompt.source_document_ids),
    created_at: now,
  });
  if (error) throw new Error(error.message);
  await audit(ctx, 'thesis.monitor', thesis.id, {
    verdict: verdict.verdict,
    event_id: eventId,
    model,
    prompt_sha256: prompt.prompt_sha256,
    cited_signal_ids: verdict.cited_signal_ids,
    dropped_cited_ids: verdict.dropped_cited_ids,
  });
  return {
    thesis_id: thesis.id,
    verdict: verdict.verdict,
    event: await getThesisEvent(ctx, eventId),
    llm: { source: 'llm', model },
  };
}

/** Monitor every ACTIVE / WATCH / AT_RISK thesis (the daily script/cron entry). */
export async function monitorAllTheses(
  ctx: ResearchCtx,
  llm: LlmFn = defaultLlm,
): Promise<MonitorResult[]> {
  const theses = await listThesesByStatus(ctx, ['ACTIVE', 'WATCH', 'AT_RISK']);
  const results: MonitorResult[] = [];
  for (const thesis of theses) {
    results.push(await monitorThesis(ctx, thesis, llm));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Pending alerts + human adjudication (the ONLY path from alert → status)

export interface PendingAlert {
  thesis_id: string;
  thesis_title: string;
  thesis_status: ThesisStatus;
  event: ThesisEvent;
}

export async function listPendingAlerts(ctx: ResearchCtx): Promise<PendingAlert[]> {
  const { data, error } = await ctx.supabase
    .from(EVENTS)
    .select('*')
    .eq('user_id', ctx.userId)
    .in('kind', [...MONITOR_EVENT_TYPES])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  const pending = ((data ?? []) as any[])
    .map(rowToThesisEvent)
    .filter((e) => e.detail.pending === true);
  if (pending.length === 0) return [];

  const thesisIds = [...new Set(pending.map((e) => e.thesis_id))];
  const { data: theses, error: tErr } = await ctx.supabase
    .from('research_theses')
    .select('id, title, status')
    .eq('user_id', ctx.userId)
    .in('id', thesisIds);
  if (tErr) throw new Error(tErr.message);
  const byId = new Map(
    ((theses ?? []) as Array<{ id: string; title: string; status: ThesisStatus }>).map(
      (t) => [t.id, t] as const,
    ),
  );
  return pending
    .filter((e) => byId.has(e.thesis_id))
    .map((event) => ({
      thesis_id: event.thesis_id,
      thesis_title: byId.get(event.thesis_id)!.title,
      thesis_status: byId.get(event.thesis_id)!.status,
      event,
    }));
}

export type AdjudicationAction =
  | 'IGNORE'
  | 'ACKNOWLEDGE'
  | 'WATCH'
  | 'CONFIRM_AT_RISK'
  | 'CLOSE';

const ACTION_TO_STATUS: Partial<Record<AdjudicationAction, ThesisStatus>> = {
  WATCH: 'WATCH',
  CONFIRM_AT_RISK: 'AT_RISK',
  CLOSE: 'CLOSED',
};

const ADJUDICATION_ACTIONS: readonly AdjudicationAction[] = [
  'IGNORE', 'ACKNOWLEDGE', 'WATCH', 'CONFIRM_AT_RISK', 'CLOSE',
];

export interface AdjudicationResult {
  thesis: Thesis;
  event: ThesisEvent;
}

/**
 * Human adjudication of a pending monitor alert. Status-changing actions
 * reuse transitionThesis (T3 guards apply — an illegal edge throws 422 and
 * leaves the alert pending). Resolution is recorded on the event detail.
 */
export async function adjudicateAlert(
  ctx: ResearchCtx,
  thesisId: string,
  eventId: string,
  action: AdjudicationAction,
  reason: string,
): Promise<AdjudicationResult> {
  if (!ADJUDICATION_ACTIONS.includes(action)) {
    throw new ThesisError(
      `action must be one of ${ADJUDICATION_ACTIONS.join(', ')}`, 422,
    );
  }
  const thesis = await getThesis(ctx, thesisId);
  if (!thesis) throw new ThesisError('thesis not found', 404);
  const event = await getThesisEvent(ctx, eventId, thesisId);
  if (!event || !(MONITOR_EVENT_TYPES as readonly string[]).includes(event.event_type)) {
    throw new ThesisError('alert event not found', 404);
  }
  if (event.detail.pending !== true) {
    throw new ThesisError('alert already adjudicated', 409);
  }

  // Guarded transition first — if illegal, ThesisError propagates and the
  // alert stays pending (nothing half-applied).
  const targetStatus = ACTION_TO_STATUS[action];
  if (targetStatus) {
    await transitionThesis(ctx, thesisId, targetStatus, `alert adjudication: ${action}${reason ? ` — ${reason}` : ''}`);
  }

  // event.detail already carries source_document_ids (folded jsonb) — the
  // spread keeps it intact across the resolution update.
  const detail: Record<string, unknown> = {
    ...event.detail,
    pending: false,
    resolution: { action, reason, at: new Date().toISOString() },
  };
  const { error } = await ctx.supabase
    .from(EVENTS)
    .update({ detail })
    .eq('user_id', ctx.userId)
    .eq('id', eventId);
  if (error) throw new Error(error.message);
  await audit(ctx, 'thesis.adjudicate', eventId, {
    thesis_id: thesisId,
    action,
    reason,
    verdict: event.event_type,
  });
  return {
    thesis: (await getThesis(ctx, thesisId))!,
    event: (await getThesisEvent(ctx, eventId))!,
  };
}
