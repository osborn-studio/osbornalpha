import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Signs the user out of Supabase (clears auth cookies). The old SITE_PASSWORD
// cookie logout was removed with the shared-password gate.
export async function POST() {
  if (serverIsSupabaseConfigured()) {
    const sb = await getServerSupabase();
    await sb.auth.signOut();
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  if (serverIsSupabaseConfigured()) {
    const sb = await getServerSupabase();
    await sb.auth.signOut();
  }
  return NextResponse.redirect(new URL('/login', req.url));
}
