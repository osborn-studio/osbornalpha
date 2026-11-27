import { NextResponse } from 'next/server';
import { loginReturnDestination } from '@/lib/auth/return-destination';
import { matchesSharedLoginToken, sharedLoginConfig, signInAsOwner } from '@/lib/auth/shared-login';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

// The secret sits in the path, so keep it out of caches and Referer headers.
const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' };

function notFound() {
  return new NextResponse('Not found', { status: 404, headers });
}

export async function GET(request: Request, { params }: Ctx) {
  const config = sharedLoginConfig();
  const { token } = await params;
  if (!config || !matchesSharedLoginToken(token, config.token)) return notFound();

  const url = new URL(request.url);
  const requested = url.searchParams.get('next');
  const next = requested ? loginReturnDestination(requested) : '/analyst';
  const supabase = await getServerSupabase();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id?.toLowerCase() !== config.ownerId) {
      await signInAsOwner(getAdminSupabase(), supabase, config.ownerId);
      await (supabase.from('user_events') as any).insert({
        user_id: config.ownerId,
        event_name: 'shared_login',
        path: '/auth/go',
        metadata: { next },
      });
    }
  } catch {
    return NextResponse.redirect(`${url.origin}/login?error=auth_failed`, { headers });
  }
  return NextResponse.redirect(`${url.origin}${next}`, { headers });
}
