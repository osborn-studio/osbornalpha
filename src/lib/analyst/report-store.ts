import type { AnalystProfile, Decision, Recommendation, RecommendationScore, Trade } from '@/lib/supabase/database.types';
import type { getServerSupabase } from '@/lib/supabase/server';
import type { AnalystReport, ReportRecommendation, ReportTrade } from './report-types';

type Client = Awaited<ReturnType<typeof getServerSupabase>>;
type ProfileRow = Pick<AnalystProfile, 'id' | 'user_id' | 'display_name' | 'is_self'>;
type ScoreRow = Pick<RecommendationScore, 'recommendation_id' | 'user_id' | 'scored_at' | 'score' | 'hit' |
  'forward_5d_pct' | 'forward_20d_pct' | 'forward_60d_pct'>;
type RecommendationRow = Pick<Recommendation, 'id' | 'analyst_id' | 'user_id' | 'ticker' | 'market' | 'action' |
  'reference_price' | 'target_price' | 'stop_loss' | 'recommended_at' | 'withdrawn_at'> & { assessment: ScoreRow | ScoreRow[] | null };
type LinkedDecision = Pick<Decision, 'id' | 'user_id' | 'recommendation_id'>;
type TradeRow = Omit<Trade, 'note'> & { decision: LinkedDecision | LinkedDecision[] | null };
type Page = { data: unknown; error: unknown };

const pageSize = 250;
const filterSize = 80; // Keep UUID IN lists within the PostgREST request URL limit.

async function allRows<T extends { id: string }>(
  ids: string[], fetchPage: (batch: string[], after: string | null) => PromiseLike<Page>
): Promise<T[]> {
  const result: T[] = [];
  for (let index = 0; index < ids.length; index += filterSize) {
    const batch = ids.slice(index, index + filterSize);
    let after: string | null = null;
    for (;;) {
      const { data, error } = await fetchPage(batch, after);
      if (error || !Array.isArray(data)) throw new Error('Report query failed');
      if (data.length === 0) break;
      for (const row of data as T[]) {
        if (!row.id || (after !== null && row.id <= after)) throw new Error('Invalid report page');
        result.push(row);
        after = row.id;
      }
      // Hosted installations can cap a page below the requested limit.
    }
  }
  return result;
}

function one<T>(value: T | T[] | null): T | null {
  if (!Array.isArray(value)) return value;
  if (value.length > 1) throw new Error('Ambiguous report association');
  return value[0] ?? null;
}

function number(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) throw new Error('Invalid report amount');
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Invalid report amount');
  return result;
}

const nullableNumber = (value: unknown) => value == null ? null : number(value);

export async function loadAnalystReport(
  client: Client, ownerId: string, configuredIds: Iterable<string>, signal: AbortSignal
): Promise<AnalystReport> {
  const bound = new Set(configuredIds);
  const profiles = await allRows<ProfileRow>([...bound], (batch, after) => {
    let query = client.from('analyst_profiles').select('id,user_id,display_name,is_self')
      .eq('user_id', ownerId).eq('is_self', false).in('id', batch);
    if (after) query = query.gt('id', after);
    return query.order('id').limit(pageSize).abortSignal(signal);
  });
  const analysts = profiles.map(row => {
    if (row.user_id !== ownerId || row.is_self !== false || !bound.has(row.id)) throw new Error('Unexpected report analyst');
    return { id: row.id, name: row.display_name };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const analystIds = new Set(analysts.map(analyst => analyst.id));

  const rows = await allRows<RecommendationRow>([...analystIds], (batch, after) => {
    let query = client.from('recommendations').select(
      'id,user_id,analyst_id,ticker,market,action,recommended_at,withdrawn_at,reference_price,target_price,stop_loss,' +
      'assessment:recommendation_scores(recommendation_id,user_id,scored_at,score,hit,forward_5d_pct,forward_20d_pct,forward_60d_pct)'
    ).eq('user_id', ownerId).eq('assessment.user_id', ownerId).in('analyst_id', batch);
    if (after) query = query.gt('id', after);
    return query.order('id').limit(pageSize).abortSignal(signal);
  });
  const recommendations: ReportRecommendation[] = rows.map(row => {
    const score = one(row.assessment);
    if (row.user_id !== ownerId || !analystIds.has(row.analyst_id) ||
        (score && (score.user_id !== ownerId || score.recommendation_id !== row.id))) {
      throw new Error('Unexpected report recommendation');
    }
    return {
      id: row.id, analystId: row.analyst_id, ticker: row.ticker, market: row.market, action: row.action,
      recommendedAt: row.recommended_at, withdrawnAt: row.withdrawn_at,
      referencePrice: nullableNumber(row.reference_price), targetPrice: nullableNumber(row.target_price), stopLoss: nullableNumber(row.stop_loss),
      score: nullableNumber(score?.score), hit: score?.hit ?? null, scoredAt: score?.scored_at ?? null,
      forward5dPct: nullableNumber(score?.forward_5d_pct), forward20dPct: nullableNumber(score?.forward_20d_pct),
      forward60dPct: nullableNumber(score?.forward_60d_pct),
    };
  }).sort((a, b) => Date.parse(b.recommendedAt) - Date.parse(a.recommendedAt) || a.id.localeCompare(b.id));
  const byId = new Map(recommendations.map(row => [row.id, row]));
  const fills = await allRows<TradeRow>([...byId.keys()], (batch, after) => {
    // Start from fills to preserve every partial execution. The decision FK must point to one
    // of this report's recommendations; a coincidentally matching ticker or owner is insufficient.
    let query = client.from('trades').select(
      'id,user_id,decision_id,ticker,direction,price,quantity,fee,currency,executed_at,decision:decisions!inner(id,user_id,recommendation_id)'
    ).eq('user_id', ownerId).eq('decision.user_id', ownerId).in('decision.recommendation_id', batch);
    if (after) query = query.gt('id', after);
    return query.order('id').limit(pageSize).abortSignal(signal);
  });
  const trades: ReportTrade[] = fills.map(row => {
    const decision = one(row.decision);
    const recommendation = decision?.recommendation_id ? byId.get(decision.recommendation_id) : null;
    if (row.user_id !== ownerId || !decision || decision.user_id !== ownerId || decision.id !== row.decision_id || !recommendation) {
      throw new Error('Unexpected report trade');
    }
    return {
      id: row.id, decisionId: decision.id, recommendationId: recommendation.id, analystId: recommendation.analystId,
      ticker: row.ticker, direction: row.direction, price: number(row.price), quantity: number(row.quantity),
      fee: number(row.fee), currency: row.currency, executedAt: row.executed_at,
    };
  }).sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt) || a.id.localeCompare(b.id));
  return { generatedAt: new Date().toISOString(), analysts, recommendations, trades };
}
