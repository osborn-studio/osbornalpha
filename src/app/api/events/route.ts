import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_EVENT_NAME = 80;
const MAX_PATH = 240;
const MAX_METADATA_BYTES = 8_000;

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length <= MAX_METADATA_BYTES) return value as Record<string, unknown>;
  return { truncated: true };
}

export async function POST(req: Request) {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 200 });
  }

  const body = await req.json().catch(() => ({}));
  const eventName = safeString(body.event_name ?? body.name, MAX_EVENT_NAME);
  if (!eventName) {
    return NextResponse.json({ ok: false, error: 'event_name required' }, { status: 400 });
  }

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const path = safeString(body.path, MAX_PATH);
  const sessionId = safeString(body.session_id, 120);
  const metadata = safeMetadata(body.metadata);

  const { error } = await (sb.from('user_events') as any).insert({
    user_id: user?.id ?? null,
    session_id: sessionId,
    event_name: eventName,
    path,
    metadata,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}
