import { describe, expect, it } from 'vitest';
import { scheduledWatchlistCronJobs } from './cron-schedule';

describe('Watchlist cron schedule', () => {
  it('always evaluates quote alerts and operational health', () => {
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T05:02:00Z'))).toEqual([
      'quote-alerts', 'operational-health', 'review-reminders',
    ]);
  });

  it('adds hourly and daily jobs in their intended quarter-hour slot', () => {
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T02:19:00Z'))).toEqual([
      'quote-alerts', 'operational-health', 'metric-refresh', 'metric-alerts',
    ]);
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T02:32:00Z'))).toContain('perspective-outcomes');
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T17:47:00Z'))).toContain('research-refresh');
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T20:50:00Z'))).toContain('market-calendar');
  });

  it('separates durable queue polling across the hourly slots', () => {
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T17:17:00Z'))).toContain('metric-refresh');
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T17:17:00Z'))).not.toContain('perspective-outcomes');
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T17:32:00Z'))).toContain('perspective-outcomes');
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T17:47:00Z'))).toContain('research-refresh');
  });

  it('enqueues due review reminders once per hour', () => {
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T05:02:00Z'))).toContain('review-reminders');
    expect(scheduledWatchlistCronJobs(new Date('2026-09-04T05:17:00Z'))).not.toContain('review-reminders');
  });
});
