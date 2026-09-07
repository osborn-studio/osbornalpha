import type { PerspectiveClaimFeedback } from '@/lib/supabase/database.types';

export type PerspectiveClaimVerdict = PerspectiveClaimFeedback['verdict'];

export interface PerspectiveClaimFeedbackInput {
  perspectiveId: string;
  claimId: string;
  verdict: PerspectiveClaimVerdict;
  reason: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIM_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const VERDICTS = new Set<PerspectiveClaimVerdict>(['helpful', 'incorrect', 'outdated', 'unsupported']);

export function parsePerspectiveClaimFeedback(value: unknown): PerspectiveClaimFeedbackInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.perspectiveId !== 'string' || !UUID.test(body.perspectiveId)
    || typeof body.claimId !== 'string' || !CLAIM_ID.test(body.claimId)
    || typeof body.verdict !== 'string' || !VERDICTS.has(body.verdict as PerspectiveClaimVerdict)
    || (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string')) return null;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > 500) return null;
  return {
    perspectiveId: body.perspectiveId,
    claimId: body.claimId,
    verdict: body.verdict as PerspectiveClaimVerdict,
    reason: reason || null,
  };
}

export type PerspectiveClaimFeedbackDatabase = object;

function hasClaim(value: unknown, claimId: string): boolean {
  return Array.isArray(value) && value.some((claim) => {
    return !!claim && typeof claim === 'object' && !Array.isArray(claim)
      && (claim as Record<string, unknown>).id === claimId;
  });
}

export async function savePerspectiveClaimFeedback(
  client: PerspectiveClaimFeedbackDatabase,
  userId: string,
  input: PerspectiveClaimFeedbackInput,
): Promise<PerspectiveClaimFeedback> {
  type Lookup = {
    eq(column: 'id' | 'user_id', value: string): Lookup;
    maybeSingle(): Promise<{ data: { id: string; claims: unknown } | null; error: { message: string } | null }>;
  };
  const db = client as {
    from(table: 'perspectives'): { select(columns: 'id, claims'): Lookup };
    from(table: 'perspective_claim_feedback'): {
      upsert(value: Record<string, unknown>, options: { onConflict: 'user_id,perspective_id,claim_id' }): {
        select(columns: '*'): { single(): Promise<{ data: PerspectiveClaimFeedback | null; error: { message: string } | null }> };
      };
    };
  };
  const perspective = await db.from('perspectives').select('id, claims')
    .eq('id', input.perspectiveId).eq('user_id', userId).maybeSingle();
  if (perspective.error) throw new Error(`perspective_lookup_failed:${perspective.error.message}`);
  if (!perspective.data) throw new Error('perspective_not_found');
  if (!hasClaim(perspective.data.claims, input.claimId)) throw new Error('perspective_claim_not_found');
  const saved = await db.from('perspective_claim_feedback').upsert({
    user_id: userId,
    perspective_id: input.perspectiveId,
    claim_id: input.claimId,
    verdict: input.verdict,
    reason: input.reason,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,perspective_id,claim_id' }).select('*').single();
  if (saved.error || !saved.data) throw new Error(`perspective_claim_feedback_save_failed:${saved.error?.message ?? 'empty'}`);
  return saved.data;
}

export async function deletePerspectiveClaimFeedback(
  client: PerspectiveClaimFeedbackDatabase,
  userId: string,
  perspectiveId: string,
  claimId: string,
): Promise<void> {
  const db = client as {
    from(table: 'perspective_claim_feedback'): {
      delete(): { eq(column: 'user_id' | 'perspective_id' | 'claim_id', value: string): unknown };
    };
  };
  const userQuery = db.from('perspective_claim_feedback').delete()
    .eq('user_id', userId) as { eq(column: 'perspective_id', value: string): unknown };
  const perspectiveQuery = userQuery.eq('perspective_id', perspectiveId) as {
    eq(column: 'claim_id', value: string): Promise<{ error: { message: string } | null }>;
  };
  const result = await perspectiveQuery.eq('claim_id', claimId);
  if (result.error) throw new Error(`perspective_claim_feedback_delete_failed:${result.error.message}`);
}
