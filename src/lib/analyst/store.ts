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

// PostgREST caps every read at the server's max_rows (1000 locally; hosted may differ), so page by range() and advance by the rows actually returned; stop on an empty page.
const PAGE = 1000;
async function readAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    if (rows.length === 0) return out;
    out.push(...rows);
    from += rows.length;
  }
}

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

async function readAllRecommendations(supabase: Supabase, userId: string, analystId?: string): Promise<Recommendation[]> {
  const rows = await readAll<Record<string, unknown>>((a, b) => {
    let q = supabase.from('recommendations').select('*').eq('user_id', userId)
      .order('recommended_at', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true }).range(a, b);
    if (analystId) q = q.eq('analyst_id', analystId);
    return q;
  });
  return rows.map(coerceRecommendationRow);
}

async function readAllScores(supabase: Supabase, userId: string): Promise<RecommendationScore[]> {
  const rows = await readAll<Record<string, unknown>>((a, b) =>
    supabase.from('recommendation_scores').select('*').eq('user_id', userId).order('recommendation_id', { ascending: true }).range(a, b));
  return rows.map(coerceScoreRow);
}

// ─── Profiles ───

// The owner's own "我" profile is created lazily; the partial unique index on
// (user_id) where is_self makes a concurrent double-create fail with 23505, in
// which case we simply re-read. If 23505 instead comes from a display-name
// collision, it falls back to the default name '我'.
export async function ensureSelfProfile(): Promise<AnalystProfile> {
  const { supabase, userId } = await requireUser();
  const { data: existing, error } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('is_self', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return coerceProfileRow(existing as Record<string, unknown>);

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  const raw = (profile as { display_name?: string | null } | null)?.display_name?.trim() || '我';
  const display_name = Array.from(raw).slice(0, 60).join(''); // column check is 1-60 chars
  const insertSelf = (name: string) => (supabase as any).from('analyst_profiles')
    .insert({ user_id: userId, display_name: name, kind: 'human', is_self: true }).select('*').single();
  let { data: created, error: insErr } = await insertSelf(display_name);
  if (insErr?.code === '23505') {
    // Either a concurrent self-create (re-read wins) or the display-name index (fall back to the default name).
    const { data: again, error: againErr } = await supabase.from('analyst_profiles').select('*').eq('user_id', userId).eq('is_self', true).maybeSingle();
    if (againErr) throw new Error(againErr.message);
    if (again) return coerceProfileRow(again as Record<string, unknown>);
    ({ data: created, error: insErr } = await insertSelf('我'));
    if (insErr?.code === '23505') throw new Error('analyst name taken');
  }
  if (insErr) throw new Error(insErr.message);
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
  if (patch.archived !== undefined && patch.archived !== Boolean(current.archived_at)) update.archived_at = patch.archived ? new Date().toISOString() : null;
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

export function joinViews(recs: Recommendation[], scores: RecommendationScore[], decisions: Array<{ id: string; recommendation_id: string | null }>): RecommendationView[] {
  const byId = new Map(scores.map((s) => [s.recommendation_id, s]));
  const adopted = new Map<string, string[]>();
  for (const d of decisions) {
    if (!d.recommendation_id) continue;
    adopted.set(d.recommendation_id, [...(adopted.get(d.recommendation_id) ?? []), d.id]);
  }
  return recs.map((r) => ({ ...r, score: byId.get(r.id) ?? null, adopted_by: adopted.get(r.id) ?? [] }));
}

export async function listRecommendations(opts: { analystId?: string; ticker?: string; openOnly?: boolean } = {}): Promise<RecommendationView[]> {
  const { supabase, userId } = await requireUser();
  // Display cap for the timeline; the paper book uses the unlimited loaders below.
  let q = supabase.from('recommendations').select('*').eq('user_id', userId).order('recommended_at', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  if (opts.analystId) q = q.eq('analyst_id', opts.analystId);
  if (opts.ticker) q = q.eq('ticker', opts.ticker.trim().toUpperCase());
  if (opts.openOnly) q = q.is('withdrawn_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const recs = ((data ?? []) as Record<string, unknown>[]).map(coerceRecommendationRow);
  if (recs.length === 0) return [];
  const [scores, { data: decisionRows, error: dErr }] = await Promise.all([
    readAllScores(supabase, userId),
    supabase.from('decisions').select('id, recommendation_id').eq('user_id', userId).not('recommendation_id', 'is', null),
  ]);
  if (dErr) throw new Error(dErr.message);
  return joinViews(recs, scores, (decisionRows ?? []) as Array<{ id: string; recommendation_id: string | null }>);
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
    const { data: existing, error: existErr } = await supabase.from('recommendations').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (existErr) throw new Error(existErr.message);
    throw new Error(existing ? 'recommendation withdrawn' : 'recommendation not found');
  }
  return coerceRecommendationRow(rows[0]);
}

// Rows for buildBook(): every recommendation of one analyst with its score (unlimited, paged).
export async function loadBookRows(analystId: string): Promise<BookInput[]> {
  const { supabase, userId } = await requireUser();
  const [recs, scores] = await Promise.all([readAllRecommendations(supabase, userId, analystId), readAllScores(supabase, userId)]);
  const byId = new Map(scores.map((s) => [s.recommendation_id, s]));
  return recs.map((recommendation) => ({ recommendation, score: byId.get(recommendation.id) ?? null }));
}

// Rows for every analyst at once (overview summaries), grouped by analyst_id.
export async function loadBookRowsByAnalyst(): Promise<Map<string, BookInput[]>> {
  const { supabase, userId } = await requireUser();
  const [recs, scores] = await Promise.all([readAllRecommendations(supabase, userId), readAllScores(supabase, userId)]);
  const byId = new Map(scores.map((s) => [s.recommendation_id, s]));
  const groups = new Map<string, BookInput[]>();
  for (const recommendation of recs) {
    const row = { recommendation, score: byId.get(recommendation.id) ?? null };
    groups.set(recommendation.analyst_id, [...(groups.get(recommendation.analyst_id) ?? []), row]);
  }
  return groups;
}
