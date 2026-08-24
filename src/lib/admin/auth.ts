import type { User } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/supabase/server';

export class AdminUnauthenticated extends Error {}
export class AdminForbidden extends Error {}

export async function requireAdminUser(): Promise<User> {
  const sb = await getServerSupabase();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) throw new AdminUnauthenticated('authentication required');

  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role: string | null }>();
  if (profileError) throw new Error('profile lookup failed');
  if (profile?.role !== 'admin') throw new AdminForbidden('admin role required');
  return user;
}
