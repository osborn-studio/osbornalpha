import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { resolveQuarantine, type QuarantineStatus } from '@/lib/dq/quarantine';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOLUTIONS: readonly QuarantineStatus[] = ['resolved_accept', 'resolved_reject'];
const HTTP_STATUS = { resolved: 200, not_found: 404, already_resolved: 409 } as const;

export async function POST(request: Request, { params }: Ctx) {
  try {
    const user = await requireAdminUser();
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    }
    // Defence in depth against cross-site form posts: a browser-sent Origin must be ours.
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

    const body: unknown = await request.json().catch(() => null);
    const status = (body as { status?: unknown } | null)?.status;
    if (typeof status !== 'string' || !RESOLUTIONS.includes(status as QuarantineStatus)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }

    const client = supabaseTableClient(getAdminSupabase());
    const outcome = await resolveQuarantine(client, id, { status: status as QuarantineStatus, resolvedBy: user.id });
    return NextResponse.json({ id, outcome }, { status: HTTP_STATUS[outcome] });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('[admin/dq]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'quarantine resolve unavailable' }, { status: 500 });
  }
}
