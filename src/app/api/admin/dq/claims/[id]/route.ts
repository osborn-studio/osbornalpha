// src/app/api/admin/dq/claims/[id]/route.ts
// Identifier-claim review (data foundation 3 spec §7.1). Order mirrors the landed quarantine route:
// admin session (401/403) → JSON content type (415) → same Origin (403) → UUID (400) → body. An
// `amend` (only with status 'accepted'; required for evidence_only claims, enforced by the SQL
// function) is validated with validateClaimDetail against the stored claim's evidence before the
// call. resolve_identifier_claim is the final authority: its coded errors are 409, anything else 500.
import { NextResponse } from 'next/server';
import { AdminForbidden, AdminUnauthenticated, requireAdminUser } from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { validateClaimDetail } from '@/lib/entities/claims';
import type { ClaimDetail, ClaimIdType, ClaimOp } from '@/lib/entities/types';
import { audit, type ResearchSupabase } from '@/lib/research/store';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['accepted', 'rejected'] as const;
type Status = typeof STATUSES[number];
type AmendOp = Exclude<ClaimOp, 'legacy' | 'evidence_only'>;
const AMEND_OPS: readonly AmendOp[] = ['set_identifier', 'correct_identifier', 'attach_security', 'close_security', 'backdate_window'];
const CONFLICTS = new Set(['already_resolved', 'legacy_claim', 'amend_required', 'value_conflict', 'ownership_conflict', 'already_closed', 'issuer_not_active']);
interface Amend { op: AmendOp; target: ClaimDetail['target']; params: Record<string, unknown> }
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function parseAmend(v: unknown): Amend | null {
  if (!isObj(v) || Object.keys(v).some((k) => !['op', 'target', 'params'].includes(k))) return null;
  if (typeof v.op !== 'string' || !(AMEND_OPS as readonly string[]).includes(v.op)) return null;
  if (!isObj(v.target) || typeof v.target.issuer_id !== 'string' || !isObj(v.params)) return null;
  return { op: v.op as AmendOp, target: v.target as unknown as ClaimDetail['target'], params: v.params };
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
    const status = isObj(body) ? body.status : undefined;
    if (typeof status !== 'string' || !STATUSES.includes(status as Status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    const rawAmend = isObj(body) ? body.amend : undefined;
    let amend: Amend | null = null;
    if (rawAmend !== undefined && rawAmend !== null) {
      if (status !== 'accepted') return NextResponse.json({ error: 'amend_not_applicable' }, { status: 400 });
      amend = parseAmend(rawAmend);
      if (!amend) return NextResponse.json({ error: 'invalid_amend' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const [claim] = await supabaseTableClient(admin).select('issuer_identifier_claims', { id }, { limit: 1 });
    if (!claim) return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });
    if (amend) {
      if (amend.target.issuer_id !== claim.issuer_id) return NextResponse.json({ error: 'invalid_amend', detail: 'target_issuer_mismatch' }, { status: 400 });
      const stored = isObj(claim.detail) ? claim.detail : {};
      const check = validateClaimDetail(amend.op, claim.id_type as ClaimIdType, { ...stored, target: amend.target, params: amend.params } as unknown as ClaimDetail);
      if (!check.ok) return NextResponse.json({ error: 'invalid_amend', detail: check.error }, { status: 400 });
    }

    const { data, error } = await (admin as unknown as RpcClient).rpc('resolve_identifier_claim', { p_id: id, p_status: status, p_resolved_by: user.id, p_amend: amend });
    if (error) {
      if (CONFLICTS.has(error.message)) return NextResponse.json({ id, error: error.message }, { status: 409 });
      if (error.message === 'claim_not_found') return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });   // deleted between the read and the rpc (Task 1b P0002)
      console.error('[admin/dq/claims]', error.message);
      return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
    }
    const out = isObj(data) ? data : {};
    const result = { id, status, op: typeof out.op === 'string' ? out.op : String(claim.op), applied: out.applied === true, amended: out.amended === true };
    // The resolution is committed: an audit failure is logged, never turned into a retry-inviting 500.
    try {
      await audit({ supabase: admin as unknown as ResearchSupabase, userId: user.id }, 'dq.claim_resolve', id, result);
    } catch (auditError) {
      console.error('[admin/dq/claims] audit failed', auditError instanceof Error ? auditError.message : auditError);
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    if (error instanceof AdminForbidden) return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    console.error('[admin/dq/claims]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
  }
}
