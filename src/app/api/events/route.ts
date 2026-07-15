import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import {
  normalizeReferrer,
  safeHeader,
  sanitizeEventMetadata,
  sanitizeEventName,
} from '@/lib/analytics/sanitize';

export const dynamic = 'force-dynamic';

const MAX_PATH = 240;

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function POST(req: Request) {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 200 });
  }

  const body = await req.json().catch(() => ({}));
  const eventName = sanitizeEventName(body.event_name ?? body.name);
  if (!eventName) {
    return NextResponse.json({ ok: false, error: 'event_name required' }, { status: 400 });
  }

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const path = safeString(body.path, MAX_PATH);
  const sessionId = safeString(body.session_id, 120);
  const anonymousId = safeString(body.anonymous_id, 120);
  const metadata = sanitizeEventMetadata(body.metadata ?? body.properties);
  const userAgent = safeHeader(req.headers.get('user-agent'));
  const referrer = normalizeReferrer(req.headers.get('referer'));

  const { error } = await (sb.from('user_events') as any).insert({
    user_id: user?.id ?? null,
    anonymous_id: anonymousId,
    session_id: sessionId,
    event_name: eventName,
    path,
    metadata,
    user_agent: userAgent,
    referrer,
  });

  if (error) {
    console.warn('event storage unavailable', { code: error.code });
    return NextResponse.json({ ok: false, error: 'storage unavailable' }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}
