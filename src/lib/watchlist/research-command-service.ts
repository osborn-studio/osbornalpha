import type { WatchlistResearchJob } from '@/lib/supabase/database.types';
import { userOwnsWatchlistTicker, type WatchlistServerClient } from './server-repository';
import {
  enqueueWatchlistResearchJob,
  WatchlistResearchJobRepositoryError,
  type WatchlistResearchJobDatabase,
} from './research-job-repository';
import { scheduleWatchlistResearchWorker } from './research-job-dispatch';

export async function enqueueWatchlistResearchRefresh(
  client: WatchlistServerClient & WatchlistResearchJobDatabase,
  userId: string,
  ticker: string,
): Promise<WatchlistResearchJob> {
  if (!await userOwnsWatchlistTicker(client, userId, ticker)) {
    throw new WatchlistResearchJobRepositoryError('watchlist_item_not_found');
  }
  const job = await enqueueWatchlistResearchJob(client, ticker);
  if (job.status === 'queued') scheduleWatchlistResearchWorker(job.id);
  return job;
}
