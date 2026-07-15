import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isScannerPath } from '@/lib/security/scanner-paths';

/**
 * Auth gate. The product is NOT publicly browsable — only the marketing landing
 * (`/`) and the auth pages are public; everything else requires a Supabase
 * session. Unauthenticated requests to protected paths are redirected to /login;
 * authenticated users hitting /login or /register are sent to /today.
 * When Supabase env vars are absent (local dev), the gate is disabled so the app
 * still runs. The (app)/layout.tsx server guard is the belt-and-suspenders backup.
 */
const PUBLIC_PATHS = new Set([
  '/', '/about', '/login', '/register', '/forgot-password', '/reset-password',
  '/design', // V3 design-system showcase — static demo content, no user data
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/auth/')) return true; // OAuth / email callbacks
  if (pathname.startsWith('/api/')) return true;  // API routes carry their own RLS/auth
  return false;
}

// /en or /en/<path> — the public-page locale prefix (middleware-rewrite
// strategy, no [locale] route segment; see docs/superpowers/specs/2026-07-03-g1-i18n-design.md).
const EN_PREFIX = /^\/en(\/|$)/;

function stripEnPrefix(pathname: string): string {
  const stripped = pathname.replace(/^\/en/, '');
  return stripped === '' ? '/' : stripped;
}

/**
 * Build a request-headers-cloning NextResponse.rewrite so the x-app-locale
 * header actually reaches the RSC layer (src/i18n/request.ts reads it via
 * next/headers). Passing `{ request: { headers } }` is the Next 14-supported
 * way to inject a header that downstream server components can see — setting
 * it only on the *response* headers (res.headers.set) does not propagate to
 * the request the RSC render sees.
 */
function rewriteWithLocale(request: NextRequest, pathname: string, locale: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-app-locale', locale);
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export async function middleware(request: NextRequest) {
  const { pathname: rawPathname } = request.nextUrl;

  if (isScannerPath(rawPathname)) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'cache-control': 'public, max-age=3600' },
    });
  }

  const isEnPrefixed = EN_PREFIX.test(rawPathname);
  const pathname = isEnPrefixed ? stripEnPrefix(rawPathname) : rawPathname;

  // /en/<protected path> — don't rewrite (would leak the /en prefix into the
  // post-login redirect target); send straight to the unprefixed protected
  // path. Locale preference is carried by the NEXT_LOCALE cookie, not the URL,
  // for anything behind the auth gate.
  if (isEnPrefixed && !isPublic(pathname)) {
    return NextResponse.redirect(new URL(pathname, request.url));
  }

  const response = isEnPrefixed
    ? rewriteWithLocale(request, pathname, 'en')
    : NextResponse.next({ request });

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey || sbUrl.includes('placeholder')) return response; // unconfigured → no gate (dev)

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
  const { data: { user } } = await supabase.auth.getUser();

  // Note: `pathname` here is already the stripped (unprefixed) path, so the
  // `next` query param never carries an /en prefix into /login.
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/today', request.url));
  }
  if (!user && !isPublic(pathname)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
