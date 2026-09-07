import { describe, expect, it } from 'vitest';
import type { WatchlistResearchJob } from '@/lib/supabase/database.types';
import { watchlistResearchJobView } from './research-job-contract';

const job: WatchlistResearchJob = {
  id: 'job-1', user_id: 'user-1', ticker: 'AAPL', status: 'succeeded', stage: 'complete', progress: 120,
  attempt_count: 1, max_attempts: 3, quota_plan: 'free', quota_limit: 10, quota_used: 1,
  next_attempt_at: '2026-09-05T12:00:00Z', lease_expires_at: null, lease_token: null,
  cancel_requested_at: null, error_code: null, created_at: '2026-09-05T11:00:00Z',
  started_at: '2026-09-05T11:00:01Z', finished_at: '2026-09-05T11:00:05Z', updated_at: '2026-09-05T11:00:05Z',
  result: {
    changes: { hasChanges: true, newNews: 2, newReports: 1, perspectivesChanged: false, ratingChanges: [] },
    refresh: { status: 'complete', refreshedAt: '2026-09-05T11:00:04Z', warnings: [] },
  },
};

describe('watchlistResearchJobView', () => {
  it('returns a bounded, sanitized user-facing job result', () => {
    expect(watchlistResearchJobView(job)).toMatchObject({
      id: 'job-1', progress: 100, result: { changes: { newNews: 2 }, refresh: { status: 'complete' } },
    });
  });

  it('does not expose malformed or unfinished results', () => {
    expect(watchlistResearchJobView({ ...job, status: 'running', result: job.result }).result).toBeNull();
    expect(watchlistResearchJobView({ ...job, result: { secret: 'raw payload' } }).result).toBeNull();
  });
});
