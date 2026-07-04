/**
 * Thesis monitor (Research OS Phase 2).
 * New signals + sources (7-day window, small data → full scan) are reviewed
 * against each ACTIVE/WATCH/AT_RISK thesis by the LLM. Non-NONE verdicts are
 * written as PENDING thesis_events — the monitor NEVER changes thesis status
 * (spec §3.3); only adjudicateAlert(), driven by a human, transitions via the
 * T3 guard table.
 */

import { logAudit, type ResearchDb } from './db';
import { defaultLlm, type LlmFn } from './memos';
import { listSignalsSince } from './signals';
import {
  ThesisError,
  getThesis,
  listThesesByStatus,
  rowToThesisEvent,
  transitionThesis,
} from './theses';
import { buildMonitorPrompt, validateMonitorVerdict, type MonitorVerdictKind } from './monitor-prompt';
import {
  readJson,
  writeJson,
  type SourceDocument,
  type Thesis,
  type ThesisEvent,
  type ThesisStatus,
} from './types';

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

function listSourcesSince(db: ResearchDb, sinceIso: string): SourceDocument[] {
  const rows: any[] = db
    .prepare(`select * from source_documents where ingested_at >= ? order by ingested_at desc`)
    .all(sinceIso);
  return rows.map((row) => ({
    ...row,
    entity_ids: readJson<string[]>(row.entity_ids, []),
  })) as SourceDocument[];
}

/**
 * Monitor one thesis against the last 7 days of signals + sources.
 * NONE → no event. SUPPORT/WEAKEN/INVALIDATE → pending thesis_event with
 * rationale, validated citations, suggested_status and llm_provenance.
 */
export async function monitorThesis(
  db: ResearchDb,
  thesis: Thesis,
  llm: LlmFn = defaultLlm,
): Promise<MonitorResult> {
  const since = windowStartIso();
  const signals = listSignalsSince(db, since);
  const sources = listSourcesSince(db, since);
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
    logAudit(db, 'thesis.monitor', thesis.id, {
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
  db.prepare(
    `insert into thesis_events (id, thesis_id, event_type, detail, source_document_ids, created_at)
     values (?, ?, ?, ?, ?, ?)`,
  ).run(
    eventId,
    thesis.id,
    verdict.verdict,
    writeJson(detail),
    writeJson(prompt.source_document_ids),
    now,
  );
  logAudit(db, 'thesis.monitor', thesis.id, {
    verdict: verdict.verdict,
    event_id: eventId,
    model,
    prompt_sha256: prompt.prompt_sha256,
    cited_signal_ids: verdict.cited_signal_ids,
    dropped_cited_ids: verdict.dropped_cited_ids,
  });
  const row = db.prepare(`select * from thesis_events where id = ?`).get(eventId);
  return {
    thesis_id: thesis.id,
    verdict: verdict.verdict,
    event: rowToThesisEvent(row),
    llm: { source: 'llm', model },
  };
}

/** Monitor every ACTIVE / WATCH / AT_RISK thesis (the daily script entry). */
export async function monitorAllTheses(
  db: ResearchDb,
  llm: LlmFn = defaultLlm,
): Promise<MonitorResult[]> {
  const theses = listThesesByStatus(db, ['ACTIVE', 'WATCH', 'AT_RISK']);
  const results: MonitorResult[] = [];
  for (const thesis of theses) {
    results.push(await monitorThesis(db, thesis, llm));
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

export function listPendingAlerts(db: ResearchDb): PendingAlert[] {
  const rows: any[] = db
    .prepare(
      `select te.*, t.title as thesis_title, t.status as thesis_status
       from thesis_events te
       join theses t on t.id = te.thesis_id
       where te.event_type in ('SUPPORT', 'WEAKEN', 'INVALIDATE')
         and (case when json_valid(te.detail)
              then json_extract(te.detail, '$.pending') end) = 1
       order by te.created_at desc, te.id desc`,
    )
    .all();
  return rows.map((row) => ({
    thesis_id: row.thesis_id,
    thesis_title: row.thesis_title,
    thesis_status: row.thesis_status,
    event: rowToThesisEvent(row),
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
export function adjudicateAlert(
  db: ResearchDb,
  thesisId: string,
  eventId: string,
  action: AdjudicationAction,
  reason: string,
): AdjudicationResult {
  if (!ADJUDICATION_ACTIONS.includes(action)) {
    throw new ThesisError(
      `action must be one of ${ADJUDICATION_ACTIONS.join(', ')}`, 422,
    );
  }
  const thesis = getThesis(db, thesisId);
  if (!thesis) throw new ThesisError('thesis not found', 404);
  const row = db
    .prepare(`select * from thesis_events where id = ? and thesis_id = ?`)
    .get(eventId, thesisId);
  if (!row || !(MONITOR_EVENT_TYPES as readonly string[]).includes(row.event_type)) {
    throw new ThesisError('alert event not found', 404);
  }
  const event = rowToThesisEvent(row);
  if (event.detail.pending !== true) {
    throw new ThesisError('alert already adjudicated', 409);
  }

  // Guarded transition first — if illegal, ThesisError propagates and the
  // alert stays pending (nothing half-applied).
  const targetStatus = ACTION_TO_STATUS[action];
  if (targetStatus) {
    transitionThesis(db, thesisId, targetStatus, `alert adjudication: ${action}${reason ? ` — ${reason}` : ''}`);
  }

  const detail: Record<string, unknown> = {
    ...event.detail,
    pending: false,
    resolution: { action, reason, at: new Date().toISOString() },
  };
  db.prepare(`update thesis_events set detail = ? where id = ?`).run(writeJson(detail), eventId);
  logAudit(db, 'thesis.adjudicate', eventId, {
    thesis_id: thesisId,
    action,
    reason,
    verdict: event.event_type,
  });
  const updated = db.prepare(`select * from thesis_events where id = ?`).get(eventId);
  return { thesis: getThesis(db, thesisId)!, event: rowToThesisEvent(updated) };
}
