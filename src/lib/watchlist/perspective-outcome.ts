import type { Stance } from '@/lib/supabase/database.types';

export interface ClaimedPerspectiveEvaluation {
  perspective_id: string;
  user_id: string;
  ticker: string;
  stance: Stance;
  reference_price: number;
  horizon_days: number;
  attempt_count: number;
}

export interface PerspectiveOutcomeValue {
  returnPct: number;
  directionCorrect: boolean;
}

export function evaluatePerspectiveOutcome(
  stance: Stance,
  referencePrice: number,
  outcomePrice: number,
  neutralBandPct = 5,
): PerspectiveOutcomeValue {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0 || !Number.isFinite(outcomePrice) || outcomePrice <= 0) {
    throw new Error('invalid_perspective_outcome_price');
  }
  const returnPct = ((outcomePrice / referencePrice) - 1) * 100;
  return {
    returnPct: Number(returnPct.toFixed(6)),
    directionCorrect: stance === 'bullish' ? returnPct > 0
      : stance === 'bearish' ? returnPct < 0
        : Math.abs(returnPct) <= Math.max(0, neutralBandPct),
  };
}

export type PerspectiveOutcomeDatabase = object;

export async function claimPerspectiveEvaluations(
  db: PerspectiveOutcomeDatabase,
  limit = 20,
): Promise<ClaimedPerspectiveEvaluation[]> {
  const repository = db as {
    rpc(name: 'claim_perspective_evaluations', args: { p_limit: number }): Promise<{
      data: ClaimedPerspectiveEvaluation[] | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('claim_perspective_evaluations', {
    p_limit: Math.min(Math.max(Math.floor(limit), 1), 100),
  });
  if (error) throw new Error(`perspective_evaluation_claim_failed:${error.message}`);
  return data ?? [];
}

export async function finishPerspectiveEvaluation(
  db: PerspectiveOutcomeDatabase,
  item: ClaimedPerspectiveEvaluation,
  outcomePrice: number,
  evaluatedAt = new Date(),
): Promise<void> {
  const outcome = evaluatePerspectiveOutcome(item.stance, item.reference_price, outcomePrice);
  const repository = db as {
    from(table: 'perspective_outcomes'): {
      upsert(value: Record<string, unknown>, options: { onConflict: 'perspective_id,horizon_days' }): Promise<{ error: { message: string } | null }>;
    };
    from(table: 'perspective_evaluation_queue'): {
      delete(): { eq(column: 'perspective_id', value: string): Promise<{ error: { message: string } | null }> };
    };
  };
  const persisted = await repository.from('perspective_outcomes').upsert({
    user_id: item.user_id,
    perspective_id: item.perspective_id,
    horizon_days: item.horizon_days,
    reference_price: item.reference_price,
    outcome_price: outcomePrice,
    return_pct: outcome.returnPct,
    direction_correct: outcome.directionCorrect,
    evaluated_at: evaluatedAt.toISOString(),
  }, { onConflict: 'perspective_id,horizon_days' });
  if (persisted.error) throw new Error(`perspective_outcome_persist_failed:${persisted.error.message}`);
  const removed = await repository.from('perspective_evaluation_queue').delete().eq('perspective_id', item.perspective_id);
  if (removed.error) throw new Error(`perspective_evaluation_finish_failed:${removed.error.message}`);
}

export async function failPerspectiveEvaluation(
  db: PerspectiveOutcomeDatabase,
  perspectiveId: string,
  errorMessage: string,
  attempt: number,
  now = new Date(),
): Promise<void> {
  const terminal = attempt >= 5;
  const delayMinutes = Math.min(24 * 60, 15 * (2 ** Math.min(Math.max(attempt, 0), 7)));
  const repository = db as {
    from(table: 'perspective_evaluation_queue'): {
      update(value: Record<string, unknown>): { eq(column: 'perspective_id', value: string): Promise<{ error: { message: string } | null }> };
    };
  };
  const result = await repository.from('perspective_evaluation_queue').update({
    claimed_at: null,
    last_error: errorMessage.slice(0, 240),
    next_attempt_at: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
    status: terminal ? 'dead_letter' : 'pending',
    dead_lettered_at: terminal ? now.toISOString() : null,
    updated_at: now.toISOString(),
  }).eq('perspective_id', perspectiveId);
  if (result.error) throw new Error(`perspective_evaluation_retry_failed:${result.error.message}`);
}
