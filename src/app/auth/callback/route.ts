import { NextResponse } from 'next/server';
import { sanitizeAnalyticsId } from '@/lib/analytics/auth-funnel';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/today';
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
