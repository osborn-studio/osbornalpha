import { describe, expect, it, vi } from 'vitest';
import { withQuoteSourceTimeout } from './source-timeout';

describe('quote source timeout', () => {
  it('returns a source result that completes inside its budget', async () => {
    await expect(withQuoteSourceTimeout(() => Promise.resolve('ok'), 100)).resolves.toBe('ok');
  });

  it('stops awaiting a source that exceeds its budget', async () => {
    vi.useFakeTimers();
    try {
      const pending = withQuoteSourceTimeout(() => new Promise<string>(() => {}), 2_500);
      const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(2_500);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
