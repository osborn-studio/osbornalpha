import type { WatchlistResearchJob } from '@/lib/supabase/database.types';

export type WatchlistResearchJobDatabase = object;

export class WatchlistResearchJobRepositoryError extends Error {
  constructor(
    public readonly code: string,
    public readonly quota: { used: number; limit: number; plan: string } | null = null,
  ) {
    super(code);
    this.name = 'WatchlistResearchJobRepositoryError';
  }
}

function enqueueError(message: string | undefined): WatchlistResearchJobRepositoryError {
  const code = message?.includes('watchlist_research_rate_limit')
    ? 'watchlist_research_rate_limit'
    : message?.includes('watchlist_research_plan_limit')
      ? 'watchlist_research_plan_limit'
      : message?.includes('watchlist_item_not_found')
        ? 'watchlist_item_not_found'
        : 'watchlist_research_job_enqueue_failed';
  const match = message?.match(/watchlist_research_(?:plan|rate)_limit:(\d+):(-?\d+):([a-z]+)/i);
  return new WatchlistResearchJobRepositoryError(code, match ? {
    used: Number(match[1]), limit: Number(match[2]), plan: match[3],
  } : null);
}

export async function enqueueWatchlistResearchJob(
  db: WatchlistResearchJobDatabase,
  ticker: string,
): Promise<WatchlistResearchJob> {
  const repository = db as {
    rpc(name: 'enqueue_watchlist_research_job', args: { p_ticker: string }): Promise<{
      data: WatchlistResearchJob | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('enqueue_watchlist_research_job', { p_ticker: ticker });
  if (error || !data) throw enqueueError(error?.message);
  return data;
}

export async function loadWatchlistResearchJob(
  db: WatchlistResearchJobDatabase,
  id: string,
): Promise<WatchlistResearchJob | null> {
  const repository = db as {
    from(name: 'watchlist_research_jobs'): {
      select(columns: '*'): {
        eq(column: 'id', value: string): {
          maybeSingle(): Promise<{ data: WatchlistResearchJob | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await repository.from('watchlist_research_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`watchlist_research_job_load_failed:${error.message}`);
  return data;
}

export async function loadActiveWatchlistResearchJob(
  db: WatchlistResearchJobDatabase,
  ticker: string,
): Promise<WatchlistResearchJob | null> {
  const repository = db as {
    from(name: 'watchlist_research_jobs'): {
      select(columns: '*'): {
        eq(column: 'ticker', value: string): {
          in(column: 'status', values: Array<WatchlistResearchJob['status']>): {
            order(column: 'created_at', options: { ascending: false }): {
              limit(count: 1): {
                maybeSingle(): Promise<{ data: WatchlistResearchJob | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };
    };
  };
  const { data, error } = await repository.from('watchlist_research_jobs').select('*')
    .eq('ticker', ticker).in('status', ['queued', 'running'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`watchlist_research_job_load_active_failed:${error.message}`);
  return data;
}

export async function cancelWatchlistResearchJob(
  db: WatchlistResearchJobDatabase,
  id: string,
): Promise<WatchlistResearchJob | null> {
  const repository = db as {
    rpc(name: 'cancel_watchlist_research_job', args: { p_job_id: string }): Promise<{
      data: WatchlistResearchJob | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('cancel_watchlist_research_job', { p_job_id: id });
  if (error) throw new Error(`watchlist_research_job_cancel_failed:${error.message}`);
  return data;
}

export async function claimWatchlistResearchJobs(
  db: WatchlistResearchJobDatabase,
  limit: number,
  jobId: string | null = null,
): Promise<WatchlistResearchJob[]> {
  const repository = db as {
    rpc(name: 'claim_watchlist_research_jobs', args: { p_limit: number; p_lease_minutes: number; p_job_id: string | null }): Promise<{
      data: WatchlistResearchJob[] | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('claim_watchlist_research_jobs', {
    p_limit: Math.min(Math.max(Math.floor(limit), 1), 5), p_lease_minutes: 10, p_job_id: jobId,
  });
  if (error) throw new Error(`watchlist_research_job_claim_failed:${error.message}`);
  return data ?? [];
}

export async function updateWatchlistResearchJob(
  db: WatchlistResearchJobDatabase,
  id: string,
  leaseToken: string,
  patch: Partial<WatchlistResearchJob>,
): Promise<boolean> {
  const repository = db as {
    from(name: 'watchlist_research_jobs'): {
      update(value: Partial<WatchlistResearchJob>): {
        eq(column: 'id' | 'lease_token' | 'status', value: string): {
          eq(column: 'id' | 'lease_token' | 'status', value: string): {
            eq(column: 'id' | 'lease_token' | 'status', value: string): {
              select(columns: 'id'): {
                maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };
    };
  };
  const { data, error } = await repository.from('watchlist_research_jobs').update(patch)
    .eq('id', id).eq('lease_token', leaseToken).eq('status', 'running').select('id').maybeSingle();
  if (error) throw new Error(`watchlist_research_job_update_failed:${error.message}`);
  return data?.id === id;
}
