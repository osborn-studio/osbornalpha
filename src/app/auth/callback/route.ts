import { NextResponse } from 'next/server';
import { loginReturnDestination } from '@/lib/auth/return-destination';
import { sanitizeAnalyticsId } from '@/lib/analytics/auth-funnel';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requestedNext = searchParams.get('next');
  // Recovery may finish on the reset screen; login returns intentionally exclude
  // auth screens. Only these exact local paths bypass that loop prevention.
  const next = requestedNext === '/reset-password' || requestedNext === '/en/reset-password'
    ? requestedNext
    : loginReturnDestination(requestedNext);
  const anonymousId = sanitizeAnalyticsId(searchParams.get('aid'));

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase.from('user_events') as any).insert({
        user_id: user?.id ?? null,
        anonymous_id: anonymousId,
        event_name: anonymousId ? 'email_confirmation_succeeded' : 'auth_callback_succeeded',
        path: '/auth/callback',
        metadata: { next, channel: anonymousId ? 'email' : 'oauth' },
      });
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
