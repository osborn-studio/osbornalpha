import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export async function enqueueWatchlistReviewReminders(
  db: SupabaseClient<Database>,
  limit = 500,
): Promise<number> {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 0), 2_000);
  const repository = db as unknown as {
    rpc(name: 'enqueue_watchlist_review_reminders', args: { p_limit: number }): Promise<{
      data: number | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('enqueue_watchlist_review_reminders', {
    p_limit: boundedLimit,
  });
  if (error) throw new Error(`watchlist_review_reminder_enqueue_failed:${error.message}`);
  if (!Number.isSafeInteger(data) || Number(data) < 0) {
    throw new Error('watchlist_review_reminder_response_invalid');
  }
  return Number(data);
}
