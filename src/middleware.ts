import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Auth gate. The product is NOT publicly browsable — only the marketing landing
 * (`/`) and the auth pages are public; everything else requires a Supabase
 * session. Unauthenticated requests to protected paths are redirected to /login;
 * authenticated users hitting /login or /register are sent to /dashboard.
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

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

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
