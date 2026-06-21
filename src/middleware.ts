import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware refreshes the Supabase SSR session on each request (when Supabase
 * env vars are set). The old SITE_PASSWORD shared-password gate was removed in
 * the multi-tenant auth upgrade — the app is publicly browsable (guest mode),
 * and private data is protected per-account by Supabase Auth + RLS.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (sbUrl && sbKey && !sbUrl.includes('placeholder')) {
    const supabase = createServerClient(sbUrl, sbKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          toSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as any);
          });
        },
      },
    });
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
