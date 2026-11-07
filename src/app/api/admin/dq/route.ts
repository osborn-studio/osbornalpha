import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { loadDqDashboard, parseDqQuery } from '@/lib/dq/dashboard';
import { restoreInputsHashNow } from '@/lib/dq/reconcile/deps';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminUser();
    const parsed = parseDqQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const admin = getAdminSupabase();
    const client = supabaseTableClient(admin);
    return NextResponse.json(
      await loadDqDashboard(client, parsed.query, new Date(), { inputsHashNow: restoreInputsHashNow(admin) }),
    );
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('[admin/dq]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'dq dashboard unavailable' }, { status: 500 });
  }
}
