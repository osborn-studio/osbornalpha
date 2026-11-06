import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { markAudited, resolveFactsItem, type FactsResolveOutcome } from '@/lib/dq/facts-resolver';
import { resolveQuarantine, type QuarantineStatus, type ResolveOutcome } from '@/lib/dq/quarantine';
import { restoreInputsHashNow } from '@/lib/dq/reconcile/deps';
import { supabaseFactsDb } from '@/lib/facts/db';
import { FactsDbError } from '@/lib/facts/types';
import { audit, type ResearchSupabase } from '@/lib/research/store';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Resolution = Exclude<QuarantineStatus, 'open'>;
const RESOLUTIONS: readonly Resolution[] = ['resolved_accept', 'resolved_reject'];
const MAX_CHOSEN = 100;
type Outcome = ResolveOutcome | FactsResolveOutcome | 'run_pending';
// facts.* items (spec §7.3): run_pending and already_resolved are 409 (retry later / nothing to do),
// hook_retried is a successful re-run of materialize on an already accepted item; a retry whose
// materialize fails again answers 502 (the verdict is committed, the derived layer is not refreshed).
// plan 3 (§4.6): rule_failed / invalid_choice 400; conflict (generation_moved, conflict_exists, duplicate, replay_required, filing_not_found, not_passing, lineage_changed, scope_missing, unresolved, stale_evaluation, target_not_active, use_dedicated_resolver, read_truncated) 409; batch_mismatch is a 500; refusal bodies are {id, outcome, error:<code>, detail?:{restore_note}} (plan 3 接口对齐记录 #9).
const HTTP_STATUS: Record<Outcome, number> = { resolved: 200, hook_retried: 200, not_found: 404, already_resolved: 409, run_pending: 409, invalid_choice: 400, rule_failed: 400, conflict: 409 };
const MAX_CANDIDATE_INDEX = 999;
const AUDITED: readonly Outcome[] = ['resolved', 'hook_retried'];

// The SQL function resolve_facts_quarantine is the final authority; its non-coded errors arrive as
// FactsDbError('unknown', '<message>').
// Codes of the plan-3 SQL verdict functions that reach the route without passing through the resolver's own refusal mapping
// (the resolver maps them itself; this is defence in depth). batch_mismatch is deliberately absent: a programming error (spec §4.6/§8) that stays a 500.
const SQL_CONFLICT_CODES: readonly string[] = ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'not_passing', 'unresolved', 'read_truncated'];
const SQL_CHOICE_CODES: readonly string[] = ['invalid_choice', 'invalid_candidate'];
function factsOutcome(e: unknown): { outcome: Outcome; code?: string } | null {
  if (!(e instanceof FactsDbError)) return null;
  if (e.code === 'run_pending') return { outcome: 'run_pending' };
  if (e.code === 'invalid_chosen') return { outcome: 'invalid_choice' };
  if (e.code === 'item_not_open') return { outcome: 'already_resolved' };
  if (SQL_CHOICE_CODES.includes(e.code)) return { outcome: 'invalid_choice', code: e.code };
  if (SQL_CONFLICT_CODES.includes(e.code)) return { outcome: 'conflict', code: e.code };
  return null;
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const user = await requireAdminUser();
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    }
    // Defence in depth against cross-site form posts: a browser-sent Origin must be ours.
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

    const body: unknown = await request.json().catch(() => null);
    const status = (body as { status?: unknown } | null)?.status;
    if (typeof status !== 'string' || !RESOLUTIONS.includes(status as Resolution)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    const chosen = (body as { chosen_fact_ids?: unknown } | null)?.chosen_fact_ids;
    if (chosen !== undefined && (!Array.isArray(chosen) || chosen.length > MAX_CHOSEN || chosen.some((v) => typeof v !== 'string' || !UUID_RE.test(v)))) {
      return NextResponse.json({ error: 'invalid_chosen_fact_ids' }, { status: 400 });
    }

    const index = (body as { chosen_candidate_index?: unknown } | null)?.chosen_candidate_index;
    if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > MAX_CANDIDATE_INDEX)) {
      return NextResponse.json({ error: 'invalid_chosen_candidate_index' }, { status: 400 });
    }
    const keep = (body as { keep_fact_id?: unknown } | null)?.keep_fact_id;
    if (keep !== undefined && (typeof keep !== 'string' || !UUID_RE.test(keep))) {
      return NextResponse.json({ error: 'invalid_keep_fact_id' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const client = supabaseTableClient(admin);
    const [item] = await client.select('dq_quarantine', { id }, { limit: 1 });
    if (!item) return NextResponse.json({ id, outcome: 'not_found' }, { status: 404 });

    // chosen_fact_ids is a verdict on a same_day_conflict accept and nothing else
    if (chosen !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'same_day_conflict')) {
      return NextResponse.json({ error: 'chosen_fact_ids_not_applicable' }, { status: 400 });
    }
    // chosen_candidate_index adopts a candidate of an ambiguous_value item; keep_fact_id settles a lineage_conflict (plan 3 §4.4, §4.6)
    if (index !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'ambiguous_value')) {
      return NextResponse.json({ error: 'chosen_candidate_index_not_applicable' }, { status: 400 });
    }
    if (keep !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'lineage_conflict')) {
      return NextResponse.json({ error: 'keep_fact_id_not_applicable' }, { status: 400 });
    }

    let outcome: Outcome;
    let auditAs: Outcome | null | undefined;
    let hookFailed = false;
    let isFacts = false;
    let recovered: Awaited<ReturnType<typeof resolveFactsItem>>['recovered'];
    let extra: Record<string, unknown> = {};
    if (String(item.dataset).startsWith('facts.')) {
      isFacts = true;
      try {
        const r = await resolveFactsItem(supabaseFactsDb(admin), client, item, {
          status: status as Resolution, chosenFactIds: chosen as string[] | undefined,
          chosenCandidateIndex: index as number | undefined, keepFactId: keep as string | undefined, resolvedBy: user.id,
          inputsHashNow: restoreInputsHashNow(admin),
        });
        outcome = r.outcome;
        auditAs = r.auditAs;
        recovered = r.recovered;
        hookFailed = r.hook?.state === 'failed';
        extra = {
          hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null,
          ...(r.adoptedFactId !== undefined ? { adopted_fact_id: r.adoptedFactId } : {}),
          // the PERSISTED choices (a retry's body may differ from what was committed)
          ...(r.chosenCandidateIndex !== undefined ? { chosen_candidate_index: r.chosenCandidateIndex } : {}),
          ...(r.keepFactId !== undefined ? { keep_fact_id: r.keepFactId } : {}),
          ...(r.restore !== undefined ? { restore: r.restore } : {}),
          // restore_note lives in ONE place, detail.restore_note, on success (no_rows_promoted) and on refusal alike (spec §4.6/§8)
          ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}),
          ...(r.quarantined !== undefined ? { quarantined: r.quarantined } : {}),
        };
        // refusals carry only {error:<code>, detail?} (no hook/promoted/... nulls); same body shape as the claims route (接口对齐记录 #9)
        if (r.outcome === 'rule_failed' || r.outcome === 'invalid_choice' || r.outcome === 'conflict') extra = r.code !== undefined ? { error: r.code, ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}) } : {};
      } catch (e) {
        const mapped = factsOutcome(e);
        if (mapped === null) throw e;
        outcome = mapped.outcome;
        if (mapped.code !== undefined) extra = { error: mapped.code };
      }
    } else {
      outcome = await resolveQuarantine(client, id, { status: status as Resolution, resolvedBy: user.id });
    }
    const auditOutcome = auditAs === undefined ? (AUDITED.includes(outcome) ? outcome : null) : auditAs;
    if (auditOutcome !== null) {
      // Audit trail through the shared research_audit_log helper (service role, scoped to the
      // resolving admin). The resolution is already committed, so an audit failure is logged
      // rather than turned into a 500 that would invite a retry answered with 409.
      try {
        // A recovered 'resolved' row describes the persisted resolution (original resolver, accept,
        // committed ids); the retrying admin is recorded separately.
        if (recovered) {
          await audit({ supabase: admin as unknown as ResearchSupabase, userId: recovered.resolvedBy }, 'dq.quarantine_resolve', id, {
            id, status: recovered.status, outcome: auditOutcome, ...extra, chosen_fact_ids: recovered.chosenFactIds, recovered_by: recovered.recoveredBy, recovered_at: recovered.recoveredAt,
          });
        } else {
          await audit({ supabase: admin as unknown as ResearchSupabase, userId: user.id }, 'dq.quarantine_resolve', id, { id, status, outcome: auditOutcome, ...extra });
        }
        if (isFacts) await markAudited(client, id);
      } catch (auditError) {
        console.error('[admin/dq] audit failed', auditError instanceof Error ? auditError.message : auditError);
      }
    }
    return NextResponse.json({ id, outcome, ...extra }, { status: outcome === 'hook_retried' && hookFailed ? 502 : HTTP_STATUS[outcome] });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('[admin/dq]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'quarantine resolve unavailable' }, { status: 500 });
  }
}
