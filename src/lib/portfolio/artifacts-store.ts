// Supabase I/O for research artifacts (skill run archives). All calls run as
// the signed-in user (RLS enforced). No numeric columns here, so unlike
// store.ts there's no coercion boundary to cross.

import { getServerSupabase } from '@/lib/supabase/server';
import type { Artifact } from '@/lib/supabase/database.types';

async function requireUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  return { supabase, userId: data.user.id };
}

export interface CreateArtifactInput {
  skill_id: string;
  ticker?: string | null;
  title: string;
  content_md: string;
  params?: Record<string, unknown>;
}

export async function createArtifact(input: CreateArtifactInput): Promise<Artifact> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await (supabase as any)
    .from('artifacts')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Artifact;
}

export async function listArtifacts(opts: { skill_id?: string; ticker?: string; limit?: number } = {}): Promise<Artifact[]> {
  const { supabase, userId } = await requireUser();
  let q = supabase
    .from('artifacts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.skill_id) q = q.eq('skill_id', opts.skill_id);
  if (opts.ticker) q = q.eq('ticker', opts.ticker.trim().toUpperCase());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Artifact[];
}

export async function getArtifact(id: string): Promise<Artifact | null> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('artifacts').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as Artifact) : null;
}
