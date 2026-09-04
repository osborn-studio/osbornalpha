import { describe, expect, it, vi } from 'vitest';
import { cronErrorCode, cronRunDuration, logCronEvent, startCronRun } from './cron-run';

describe('cron run observability', () => {
  it('creates stable duration and error-code context', () => {
    const context = startCronRun('watchlist-research', 100);
    expect(context.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(cronRunDuration(context, 175)).toBe(75);
    expect(cronErrorCode(new Error('provider_timeout:brave'), 'fallback')).toBe('provider_timeout');
    expect(cronErrorCode('bad', 'fallback')).toBe('fallback');
  });

  it('emits structured fields without logging an error stack', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const context = startCronRun('watchlist-alerts', 100);
    logCronEvent('info', 'cron_started', context, { batch: 2 });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"cron_run_id"'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"batch":2'));
    spy.mockRestore();
  });
});
