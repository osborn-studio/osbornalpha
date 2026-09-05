import { describe, expect, it } from 'vitest';
import { watchlistBatchJobOutcome } from './cron-jobs';

describe('watchlistBatchJobOutcome', () => {
  it('reports a fully processed or empty batch as complete', () => {
    expect(watchlistBatchJobOutcome(0, 0)).toEqual({ ok: true, status: 'complete' });
    expect(watchlistBatchJobOutcome(3, 0)).toEqual({ ok: true, status: 'complete' });
  });

  it('does not hide partial or failed work from the dispatcher', () => {
    expect(watchlistBatchJobOutcome(3, 0, 1)).toEqual({ ok: false, status: 'partial' });
    expect(watchlistBatchJobOutcome(3, 1)).toEqual({ ok: false, status: 'failed' });
    expect(watchlistBatchJobOutcome(3, 1, 1)).toEqual({ ok: false, status: 'failed' });
  });
});
