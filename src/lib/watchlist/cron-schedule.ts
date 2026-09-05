import type { WatchlistCronJobId } from './cron-jobs';

/**
 * Dispatcher runs at minutes 2/17/32/47 UTC. Slot matching tolerates normal
 * scheduler delay while queue leases and delivery keys keep retries idempotent.
 */
export function scheduledWatchlistCronJobs(now: Date): WatchlistCronJobId[] {
  const hour = now.getUTCHours();
  const slot = Math.floor(now.getUTCMinutes() / 15);
  const jobs: WatchlistCronJobId[] = ['quote-alerts', 'operational-health'];
  if (slot === 0) jobs.push('review-reminders');
  if (slot === 1) jobs.push('metric-refresh', 'metric-alerts');
  if (slot === 2) jobs.push('perspective-outcomes');
  if (slot === 3) jobs.push('research-refresh');
  if (hour === 16 && slot === 1) jobs.push('research-alerts');
  if (hour === 20 && slot === 3) jobs.push('market-calendar');
  return jobs;
}
