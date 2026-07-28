/**
 * Research OS Supabase store (Phase 5 — production Postgres).
 *
 * Replaces the Phase 1-4 local SQLite layer (src/lib/research/db.ts, retired).
 * Every service function now takes a ResearchCtx { supabase, userId } and all
 * rows are scoped by user_id (RLS enforces it for user sessions; service-role
 * contexts MUST filter explicitly — every query in this module tree does).
 *
 * Access control = login + profiles.role === 'admin':
 *   - no session            → Error('not authenticated')  → API 401
 *   - session but not admin → ResearchForbidden           → API 403
 * (The old RESEARCH_OS_ENABLED env gate is deleted entirely.)
 *
 * ⚠️ PostgREST serializes Postgres `numeric` as JSON strings — any numeric
 * column (research_eval_runs.total_score) must be coerced with Number() at the
 * read boundary (see evals.ts), same as src/lib/portfolio/store.ts coerce*Row.
 * jsonb columns travel as real objects/arrays through supabase-js — never
 * JSON.stringify them into the payload.
 */

/**
 * Minimal structural type for the Supabase client used by the research
 * services. The research_* tables are deliberately NOT in
 * src/lib/supabase/database.types.ts (namespace isolation from the SaaS), so
 * we type the query surface loosely and keep correctness in the row mappers.
 */
export interface ResearchSupabase {
  from(table: string): any;
}

export interface ResearchCtx {
  supabase: ResearchSupabase;
  userId: string;
}

/** Thrown when a signed-in user without profiles.role === 'admin' hits Research OS (API → 403). */
export class ResearchForbidden extends Error {
  constructor() {
    super('research os requires admin role');
    this.name = 'ResearchForbidden';
  }
}

/**
 * Gate for every /api/research/* route and /research page: requires a Supabase
 * session (else Error('not authenticated') → 401) AND profiles.role === 'admin'
 * (else ResearchForbidden → 403). Mirrors requireUser() in portfolio/store.ts.
 *
 * next/headers is imported lazily so this module stays importable from plain
 * node scripts (which build their ctx via getServiceResearchCtx instead).
 */
export async function requireResearchUser(): Promise<ResearchCtx> {
  const { getServerSupabase } = await import('@/lib/supabase/server');
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!profile || (profile as { role: string }).role !== 'admin') {
    throw new ResearchForbidden();
  }
  return { supabase: supabase as unknown as ResearchSupabase, userId: data.user.id };
}

/** True when the string is a Postgres-acceptable UUID (route params may be junk). */
export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Append a research_audit_log row (compliance red line: ingest/generate/review
 * all leave a trace). object_type is derived from the action prefix
 * ('source.ingest' → 'source'), matching the old SQLite target_id semantics.
 */
export async function audit(
  ctx: ResearchCtx,
  action: string,
  objectId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await ctx.supabase.from('research_audit_log').insert({
    id: crypto.randomUUID(),
    user_id: ctx.userId,
    actor: 'user',
    action,
    object_type: action.split('.')[0] ?? 'unknown',
    object_id: objectId !== null && isUuid(objectId) ? objectId : null,
    detail: objectId !== null && !isUuid(objectId) ? { ...detail, object_ref: objectId } : detail,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
