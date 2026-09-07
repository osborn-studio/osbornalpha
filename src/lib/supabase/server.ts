import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

type ServerSupabaseRequest = Pick<Request, 'headers'>;

function bearerAuthorization(request?: ServerSupabaseRequest): string | null {
  const value = request?.headers.get('authorization')?.trim();
  return value && /^Bearer [^\s]+$/i.test(value) ? value : null;
}

export async function getServerSupabase(request?: ServerSupabaseRequest) {
  const cookieStore = await cookies();
  const authorization = bearerAuthorization(request);
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
    {
      ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            toSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options as any);
            });
          } catch {
            // RSC contexts can't write cookies; safe to ignore
          }
        },
      },
    }
  );
}

export function serverIsSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')
  );
}
