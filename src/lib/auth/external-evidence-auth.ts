import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

export type ExternalEvidenceAuth =
  | { ok: true; userId: string | null; client: Awaited<ReturnType<typeof getServerSupabase>> | null }
  | { ok: false; status: 401 | 503; error: 'not_authenticated' | 'authentication_unavailable' };

export async function authorizeExternalEvidenceRequest(): Promise<ExternalEvidenceAuth> {
  if (!serverIsSupabaseConfigured()) {
    return process.env.NODE_ENV === 'production'
      ? { ok: false, status: 503, error: 'authentication_unavailable' }
      : { ok: true, userId: null, client: null };
  }
  try {
    const db = await getServerSupabase();
    const { data, error } = await db.auth.getUser();
    return !error && data.user
      ? { ok: true, userId: data.user.id, client: db }
      : { ok: false, status: 401, error: 'not_authenticated' };
  } catch {
    return { ok: false, status: 503, error: 'authentication_unavailable' };
  }
}
