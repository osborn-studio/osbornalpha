import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { COOKIE_NAME, verifyCookieValue, isSitePasswordEnabled } from '@/lib/auth/site-password';

/**
 * Middleware does two things:
 *   1. Site-level password gate (when SITE_PASSWORD env is set)
 *   2. Supabase SSR session refresh (when Supabase env vars are set)
 *
 * Gate exemptions (always pass through):
 *   - /unlock                  the gate page itself
 *   - /api/auth/*              login / logout endpoints
 *   - /api/cron/*              Vercel cron uses Bearer secret, not cookies
 *   - static assets            _next, favicon, manifest, icons
 */

const EXEMPT_PATH_PREFIXES = [
  '/unlock',
  '/api/auth/',
  '/api/cron/',
  '/_next/',
  '/icon-',
  '/favicon',
  '/manifest.json',
  '/robots.txt',
  '/sitemap.xml',
];

function isExempt(pathname: string): boolean {
  for (const p of EXEMPT_PATH_PREFIXES) {
    if (pathname === p || pathname.startsWith(p)) return true;
  }
  // Static files with image extensions
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|map)$/.test(pathname)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ── 1. Site password gate ──────────────────────────────────
  if (isSitePasswordEnabled() && !isExempt(pathname)) {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const ok = await verifyCookieValue(cookie);
    if (!ok) {
      const url = request.nextUrl.clone();
      url.pathname = '/unlock';
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  // ── 2. Supabase session refresh ────────────────────────────
  let response = NextResponse.next({ request });
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
    // Run on all routes except already-static asset paths handled by Next itself
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
