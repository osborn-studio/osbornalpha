import type { WatchlistCronJobId } from './cron-jobs';
import { scheduledWatchlistCronJobs } from './cron-schedule';
import type { WatchlistCronDispatchSlot } from './cron-dispatch-repository';

const JOB_DEPENDENCIES: Partial<Record<WatchlistCronJobId, WatchlistCronJobId[]>> = {
  'metric-alerts': ['metric-refresh'],
};

export function watchlistCronJobDependencies(id: WatchlistCronJobId): WatchlistCronJobId[] {
  return JOB_DEPENDENCIES[id] ?? [];
}

export function watchlistCronJobWaves(jobs: WatchlistCronJobId[]): WatchlistCronJobId[][] {
  const scheduled = new Set(jobs);
  const remaining = new Set(jobs);
  const completed = new Set<WatchlistCronJobId>();
  const waves: WatchlistCronJobId[][] = [];

  while (remaining.size > 0) {
    const wave = jobs.filter((id) => remaining.has(id) && watchlistCronJobDependencies(id)
      .every((dependency) => !scheduled.has(dependency) || completed.has(dependency)));
    if (wave.length === 0) throw new Error('watchlist_cron_dependency_cycle');
    waves.push(wave);
    wave.forEach((id) => {
      remaining.delete(id);
      completed.add(id);
    });
  }
  return waves;
}

export interface WatchlistCronDispatchPlan {
  jobs: WatchlistCronJobId[];
  slots: Array<WatchlistCronDispatchSlot & { jobs: WatchlistCronJobId[] }>;
}

export function planWatchlistCronDispatch(
  claimedSlots: WatchlistCronDispatchSlot[],
): WatchlistCronDispatchPlan {
  const jobs: WatchlistCronJobId[] = [];
  const seenJobs = new Set<WatchlistCronJobId>();
  const seenSlots = new Set<string>();
  const slots = [...claimedSlots]
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor))
    .map((slot) => {
      if (seenSlots.has(slot.scheduledFor)) throw new Error('watchlist_cron_dispatch_duplicate_slot');
      seenSlots.add(slot.scheduledFor);
      const slotJobs = scheduledWatchlistCronJobs(new Date(slot.scheduledFor));
      slotJobs.forEach((job) => {
        if (seenJobs.has(job)) return;
        seenJobs.add(job);
        jobs.push(job);
      });
      return { ...slot, jobs: slotJobs };
    });
  return { jobs, slots };
}

export async function runWatchlistCronJobWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error('watchlist_cron_job_timeout');
          controller.abort(error);
          reject(error);
        }, Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
