import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_EVENT_NAME = 80;
const MAX_PATH = 300;
const MAX_ID = 120;
const MAX_PROPERTIES_BYTES = 8_000;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanProperties(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > MAX_PROPERTIES_BYTES) return { truncated: true };
  return JSON.parse(json);
}

export async function POST(request: Request) {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ ok: false, skipped: 'supabase_not_configured' }, { status: 200 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const eventName = cleanText(body.event_name, MAX_EVENT_NAME);
  if (!eventName) {
    return NextResponse.json({ ok: false, error: 'missing_event_name' }, { status: 400 });
  }

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const userAgent = request.headers.get('user-agent');

  const row = {
    user_id: user?.id ?? null,
    anonymous_id: cleanText(body.anonymous_id, MAX_ID),
    session_id: cleanText(body.session_id, MAX_ID),
    event_name: eventName,
    path: cleanText(body.path, MAX_PATH),
    referrer: cleanText(body.referrer, MAX_PATH),
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
    properties: cleanProperties(body.properties),
  };

  const { error } = await (sb.from('user_events') as any).insert(row);
  if (error) {
    console.warn('analytics event insert failed', { eventName, error: error.message });
    return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
