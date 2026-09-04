import { NextResponse } from 'next/server';
import { AdminForbidden, AdminUnauthenticated, requireAdminUser } from '@/lib/admin/auth';
import { aggregateWatchlistOperations, parseWatchlistOperationCommand } from '@/lib/admin/watchlist-operations';
import { executeWatchlistOperation, loadWatchlistOperationsInput } from '@/lib/admin/watchlist-operations-repository';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminUser();
    return NextResponse.json(aggregateWatchlistOperations(
      await loadWatchlistOperationsInput(getAdminSupabase()),
    ));
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('admin watchlist operations failed');
    return NextResponse.json({ error: 'watchlist operations unavailable' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminUser();
    const command = parseWatchlistOperationCommand(await request.json().catch(() => null));
    if (!command) return watchlistApiError('invalid_watchlist_operation', 400);
    return NextResponse.json({ ok: true, result: await executeWatchlistOperation(getAdminSupabase(), user.id, command) });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) return watchlistApiError('not_authenticated', 401);
    if (error instanceof AdminForbidden) return watchlistApiError('admin_required', 403);
    console.error('admin watchlist operation failed');
    return watchlistApiError('watchlist_operation_unavailable', 503);
  }
}
