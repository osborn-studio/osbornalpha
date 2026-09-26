/**
 * Shared API helpers for /api/research/* routes.
 * Access control: every route body calls requireResearchUser() first —
 * no session → 401, session without profiles.role==='admin' → 403.
 */

import { NextResponse } from 'next/server';
import { ResearchForbidden } from './store';
import { SourceValidationError } from './sources';
import { ThesisError } from './theses';
import { AxiomBlocked, PlaybookError } from './playbooks';
import { EvalError } from './evals';

export function researchError(e: unknown): NextResponse {
  if (e instanceof ResearchForbidden) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'research os requires admin role' } },
      { status: 403 },
    );
  }
  if (e instanceof Error && e.message === 'not authenticated') {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'not authenticated' } },
      { status: 401 },
    );
  }
  if (e instanceof SourceValidationError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: e.message } },
      { status: 400 },
    );
  }
  if (e instanceof ThesisError) {
    return NextResponse.json(
      { error: { code: 'THESIS_ERROR', message: e.message } },
      { status: e.status },
    );
  }
  if (e instanceof AxiomBlocked) {
    // Axiom gate: the run was NOT persisted (spec acceptance line 1).
    return NextResponse.json(
      { error: { code: 'AXIOM_BLOCKED', message: e.message, results: e.results } },
      { status: 422 },
    );
  }
  if (e instanceof PlaybookError) {
    return NextResponse.json(
      { error: { code: 'PLAYBOOK_ERROR', message: e.message } },
      { status: e.status },
    );
  }
  if (e instanceof EvalError) {
    return NextResponse.json(
      { error: { code: 'EVAL_ERROR', message: e.message } },
      { status: e.status },
    );
  }
  // S4/ledger failures carry a stable `code` (fail() in ingest/pa-v1/json.js); map them like the S4 HTTP layer does.
  const code = e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : null;
  const S4_STATUS: Record<string, number> = { invalid_schema: 400, input_limit: 413, not_authenticated: 401, scope_denied: 403, policy_blocked: 403, not_found: 404,
    idempotency_conflict: 409, revision_conflict: 409, source_version_conflict: 409, observation_scope_conflict: 409, exposure_required: 409, rule_unsupported: 422, data_insufficient: 422,
    hash_mismatch: 422, invalid_timeline: 422, future_input: 422, not_configured: 503, source_unavailable: 503 };
  if (code && S4_STATUS[code]) {
    return NextResponse.json({ error: { code, message: code } }, { status: S4_STATUS[code] });
  }
  const message = e instanceof Error ? e.message : 'internal error';
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message } },
    { status: 500 },
  );
}

/** Wrap a route handler with uniform error mapping (401/403 included). */
export async function withResearch<T>(fn: () => T | Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    if (data instanceof NextResponse) return data;
    return NextResponse.json(data as unknown as Record<string, unknown>);
  } catch (e) {
    return researchError(e);
  }
}
