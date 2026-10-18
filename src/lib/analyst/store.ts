// Supabase I/O for the analyst layer. Every call runs as the signed-in user
// (RLS enforced). Recommendations are append-only: this module exposes create
// and withdraw, nothing else mutates a row except the scorer's one-shot fill.

import { getServerSupabase } from '@/lib/supabase/server';
import type { AnalystProfile, Recommendation, RecommendationScore } from '@/lib/supabase/database.types';
import type { ProfileInput, ProfilePatch, RecommendationInput } from './validate';
import type { BookInput } from './book';

// PostgREST serializes Postgres `numeric` as JSON strings; coerce at the read
// boundary so pure functions always do real arithmetic.
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function coerceProfileRow(row: Record<string, unknown>): AnalystProfile {
  return row as unknown as AnalystProfile;
}

export function coerceRecommendationRow(row: Record<string, unknown>): Recommendation {
  const r = row as unknown as Recommendation;
  return {
    ...r,
    reference_price: n(r.reference_price),
    target_price: n(r.target_price),
    stop_loss: n(r.stop_loss),
    fill_price: n(r.fill_price),
  };
}

export function coerceScoreRow(row: Record<string, unknown>): RecommendationScore {
  const r = row as unknown as RecommendationScore;
  return {
    ...r,
    forward_5d_pct: n(r.forward_5d_pct),
    forward_20d_pct: n(r.forward_20d_pct),
    forward_60d_pct: n(r.forward_60d_pct),
    score: n(r.score),
    last_close: n(r.last_close),
  };
}

export async function requireUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  return { supabase, userId: data.user.id };
}

// ─── Profiles ───

// The owner's own "我" profile is created lazily; the partial unique index on
// (user_id) where is_self makes a concurrent double-create fail with 23505, in
// which case we simply re-read.
export async function ensureSelfProfile(): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const { data: existing, error } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('is_self', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return coerceProfileRow(existing as Record<string, unknown>);

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  const display_name = (profile as { display_name?: string | null } | null)?.display_name?.trim() || '我';
  const { data: created, error: insErr } = await (supabase as any)
    .from('analyst_profiles')
    .insert({ user_id: userId, display_name, kind: 'human', is_self: true })
    .select('*')
    .single();
  if (insErr) {
    if (insErr.code !== '23505') throw new Error(insErr.message);
    const { data: again, error: againErr } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('is_self', true).single();
    if (againErr) throw new Error(againErr.message);
    return coerceProfileRow(again as Record<string, unknown>);
  }
  return coerceProfileRow(created);
}

export async function listProfiles(opts: { includeArchived?: boolean } = {}): Promise<AnalystProfile[]> {
  await ensureSelfProfile();
  const { supabase, userId } = await requireUser();
  let q = supabase.from('analyst_profiles').select('*').eq('user_id', userId).order('is_self', { ascending: false }).order('created_at', { ascending: true });
  if (!opts.includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(coerceProfileRow);
}

export async function getProfile(id: string): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('analyst not found');
  return coerceProfileRow(data as Record<string, unknown>);
}

export async function createProfile(input: ProfileInput): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await (supabase as any)
    .from('analyst_profiles')
    .insert({ user_id: userId, display_name: input.display_name, kind: input.kind, note: input.note ?? null })
    .select('*')
    .single();
  if (error) throw new Error(error.code === '23505' ? 'analyst name taken' : error.message);
  return coerceProfileRow(data);
}

export async function patchProfile(id: string, patch: ProfilePatch): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const current = await getProfile(id);
  if (patch.archived && current.is_self) throw new Error('self profile cannot be archived');
  const update: Record<string, unknown> = {};
  if (patch.display_name !== undefined) update.display_name = patch.display_name;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.archived !== undefined) update.archived_at = patch.archived ? new Date().toISOString() : null;
  const { data, error } = await (supabase as any)
    .from('analyst_profiles').update(update).eq('id', id).eq('user_id', userId).select('*').single();
  if (error) throw new Error(error.code === '23505' ? 'analyst name taken' : error.message);
  return coerceProfileRow(data);
}

// ─── Recommendations ───

export interface RecommendationView extends Recommendation {
  score: RecommendationScore | null;
  /** portfolio decision ids that adopted this recommendation */
  adopted_by: string[];
}

export async function listRecommendations(opts: { analystId?: string; ticker?: string; openOnly?: boolean } = {}): Promise<RecommendationView[]> {
  const { supabase, userId } = await requireUser();
  let q = supabase.from('recommendations').select('*').eq('user_id', userId).order('recommended_at', { ascending: false }).limit(500);
  if (opts.analystId) q = q.eq('analyst_id', opts.analystId);
  if (opts.ticker) q = q.eq('ticker', opts.ticker.trim().toUpperCase());
  if (opts.openOnly) q = q.is('withdrawn_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const recs = ((data ?? []) as Record<string, unknown>[]).map(coerceRecommendationRow);
  if (recs.length === 0) return [];
  const ids = recs.map((r) => r.id);
  const [{ data: scoreRows, error: sErr }, { data: decisionRows, error: dErr }] = await Promise.all([
    supabase.from('recommendation_scores').select('*').eq('user_id', userId).in('recommendation_id', ids),
    supabase.from('decisions').select('id, recommendation_id').eq('user_id', userId).in('recommendation_id', ids),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (dErr) throw new Error(dErr.message);
  const scores = new Map(((scoreRows ?? []) as Record<string, unknown>[]).map(coerceScoreRow).map((s) => [s.recommendation_id, s]));
  const adopted = new Map<string, string[]>();
  for (const d of (decisionRows ?? []) as Array<{ id: string; recommendation_id: string | null }>) {
    if (!d.recommendation_id) continue;
    adopted.set(d.recommendation_id, [...(adopted.get(d.recommendation_id) ?? []), d.id]);
  }
  return recs.map((r) => ({ ...r, score: scores.get(r.id) ?? null, adopted_by: adopted.get(r.id) ?? [] }));
}

export async function createRecommendation(input: RecommendationInput): Promise<Recommendation> {
  const { supabase, userId } = await requireUser();
  const analyst = await getProfile(input.analyst_id);
  if (analyst.archived_at) throw new Error('analyst archived');
  const { recommended_at, ...rest } = input;
  const { data, error } = await (supabase as any)
    .from('recommendations')
    .insert({ ...rest, user_id: userId, recommended_at: recommended_at ?? new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return coerceRecommendationRow(data);
}

export async function withdrawRecommendation(id: string, reason: string | undefined): Promise<Recommendation> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await (supabase as any)
    .from('recommendations')
    .update({ withdrawn_at: new Date().toISOString(), withdraw_reason: reason ?? null })
    .eq('id', id).eq('user_id', userId).is('withdrawn_at', null)
    .select('*');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    const { data: existing } = await supabase.from('recommendations').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    throw new Error(existing ? 'recommendation withdrawn' : 'recommendation not found');
  }
  return coerceRecommendationRow(rows[0]);
}

// Strip the view-only fields so buildBook() receives a plain Recommendation.
function toBookInput(view: RecommendationView): BookInput {
  const { score, ...rest } = view;
  const recommendation: Recommendation & { adopted_by?: string[] } = { ...rest };
  delete recommendation.adopted_by;
  return { recommendation, score };
}

// Rows for buildBook(): every recommendation of one analyst with its score.
export async function loadBookRows(analystId: string): Promise<BookInput[]> {
  const views = await listRecommendations({ analystId });
  return views.map(toBookInput);
}

// Rows for every analyst at once (overview summaries), grouped by analyst_id.
export async function loadBookRowsByAnalyst(): Promise<Map<string, BookInput[]>> {
  const views = await listRecommendations();
  const groups = new Map<string, BookInput[]>();
  for (const view of views) {
    const row = toBookInput(view);
    groups.set(view.analyst_id, [...(groups.get(view.analyst_id) ?? []), row]);
  }
  return groups;
}
