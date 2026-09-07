import type { PerspectiveClaimFeedback, PerspectiveFeedback, PerspectiveOutcome, Stance } from '@/lib/supabase/database.types';

export interface PerspectiveFeedbackInput {
  perspectiveId: string;
  verdict: PerspectiveFeedback['verdict'];
  reason: string | null;
  correctedStance: Stance | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERDICTS = new Set<PerspectiveFeedback['verdict']>(['helpful', 'incorrect', 'outdated']);
const STANCES = new Set<Stance>(['bullish', 'neutral', 'bearish']);

export function parsePerspectiveFeedback(value: unknown): PerspectiveFeedbackInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.perspectiveId !== 'string' || !UUID.test(body.perspectiveId)
    || typeof body.verdict !== 'string' || !VERDICTS.has(body.verdict as PerspectiveFeedback['verdict'])
    || (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string')
    || (body.correctedStance !== undefined && body.correctedStance !== null
      && (typeof body.correctedStance !== 'string' || !STANCES.has(body.correctedStance as Stance)))) return null;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > 500) return null;
  return {
    perspectiveId: body.perspectiveId,
    verdict: body.verdict as PerspectiveFeedback['verdict'],
    reason: reason || null,
    correctedStance: (body.correctedStance as Stance | null | undefined) ?? null,
  };
}

export type PerspectiveFeedbackClient = object;

export interface PerspectiveAssessment {
  feedback: PerspectiveFeedback | null;
  claimFeedback: PerspectiveClaimFeedback[];
  outcomes: PerspectiveOutcome[];
}

export async function loadPerspectiveAssessments(
  client: PerspectiveFeedbackClient,
  userId: string,
  perspectiveIds: string[],
): Promise<Record<string, PerspectiveAssessment>> {
  const ids = [...new Set(perspectiveIds.filter((id) => UUID.test(id)))].slice(0, 100);
  if (ids.length === 0) return {};
  type Query<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }> & {
    eq(column: 'user_id', value: string): Query<T>;
    in(column: 'perspective_id', values: string[]): Query<T>;
    order(column: 'horizon_days', options: { ascending: boolean }): Query<T>;
  };
  const db = client as {
    from(table: 'perspective_feedback'): { select(columns: '*'): Query<PerspectiveFeedback> };
    from(table: 'perspective_claim_feedback'): { select(columns: '*'): Query<PerspectiveClaimFeedback> };
    from(table: 'perspective_outcomes'): { select(columns: '*'): Query<PerspectiveOutcome> };
  };
  const [feedbackResult, claimFeedbackResult, outcomeResult] = await Promise.all([
    db.from('perspective_feedback').select('*').eq('user_id', userId).in('perspective_id', ids),
    db.from('perspective_claim_feedback').select('*').eq('user_id', userId).in('perspective_id', ids),
    db.from('perspective_outcomes').select('*').eq('user_id', userId).in('perspective_id', ids)
      .order('horizon_days', { ascending: true }),
  ]);
  if (feedbackResult.error) throw new Error(`perspective_feedback_load_failed:${feedbackResult.error.message}`);
  if (claimFeedbackResult.error) throw new Error(`perspective_claim_feedback_load_failed:${claimFeedbackResult.error.message}`);
  if (outcomeResult.error) throw new Error(`perspective_outcomes_load_failed:${outcomeResult.error.message}`);
  const feedbackById = new Map((feedbackResult.data ?? []).map((item) => [item.perspective_id, item]));
  const outcomesById = new Map<string, PerspectiveOutcome[]>();
  const claimFeedbackById = new Map<string, PerspectiveClaimFeedback[]>();
  for (const item of claimFeedbackResult.data ?? []) {
    claimFeedbackById.set(item.perspective_id, [...(claimFeedbackById.get(item.perspective_id) ?? []), item]);
  }
  for (const item of outcomeResult.data ?? []) {
    outcomesById.set(item.perspective_id, [...(outcomesById.get(item.perspective_id) ?? []), item]);
  }
  return Object.fromEntries(ids.map((id) => [id, {
    feedback: feedbackById.get(id) ?? null,
    claimFeedback: claimFeedbackById.get(id) ?? [],
    outcomes: outcomesById.get(id) ?? [],
  }]));
}

export async function deletePerspectiveFeedback(
  client: PerspectiveFeedbackClient,
  userId: string,
  perspectiveId: string,
): Promise<void> {
  const db = client as {
    from(table: 'perspective_feedback'): {
      delete(): { eq(column: 'user_id' | 'perspective_id', value: string): unknown };
    };
  };
  const query = db.from('perspective_feedback').delete()
    .eq('user_id', userId) as { eq(column: 'perspective_id', value: string): Promise<{ error: { message: string } | null }> };
  const result = await query.eq('perspective_id', perspectiveId);
  if (result.error) throw new Error(`perspective_feedback_delete_failed:${result.error.message}`);
}

export async function savePerspectiveFeedback(
  client: PerspectiveFeedbackClient,
  userId: string,
  input: PerspectiveFeedbackInput,
): Promise<PerspectiveFeedback> {
  type Query = {
    eq(column: 'id' | 'user_id', value: string): Query;
    maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
  const db = client as {
    from(table: 'perspectives'): { select(columns: 'id'): Query };
    from(table: 'perspective_feedback'): {
      upsert(value: Record<string, unknown>, options: { onConflict: 'user_id,perspective_id' }): {
        select(columns: '*'): { single(): Promise<{ data: PerspectiveFeedback | null; error: { message: string } | null }> };
      };
    };
  };
  const ownership = await db.from('perspectives').select('id')
    .eq('id', input.perspectiveId).eq('user_id', userId).maybeSingle();
  if (ownership.error) throw new Error(`perspective_lookup_failed:${ownership.error.message}`);
  if (!ownership.data) throw new Error('perspective_not_found');
  const saved = await db.from('perspective_feedback').upsert({
    user_id: userId,
    perspective_id: input.perspectiveId,
    verdict: input.verdict,
    reason: input.reason,
    corrected_stance: input.correctedStance,
  }, { onConflict: 'user_id,perspective_id' }).select('*').single();
  if (saved.error || !saved.data) throw new Error(`perspective_feedback_save_failed:${saved.error?.message ?? 'empty'}`);
  return saved.data;
}
