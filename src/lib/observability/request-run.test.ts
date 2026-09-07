import { describe, expect, it, vi } from 'vitest';
import {
  requestErrorCode,
  requestRunDuration,
  runRequestStep,
  startRequestRun,
} from './request-run';

describe('request run observability', () => {
  it('keeps one request id and stable duration across steps', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const context = startRequestRun('watchlist_overview', 'GET', 100);
    const ticks = [120, 145];
    await expect(runRequestStep(context, 'database_page', async () => 7, () => ticks.shift() ?? 145)).resolves.toBe(7);
    expect(context.requestId).toEqual(expect.any(String));
    expect(requestRunDuration(context, 160)).toBe(60);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"duration_ms":25'));
    info.mockRestore();
  });

  it('accepts a validated domain request id for idempotent workflows', () => {
    expect(startRequestRun('bulk', 'POST', 100, 'request-123')).toEqual({
      requestId: 'request-123', name: 'bulk', method: 'POST', startedAtMs: 100,
    });
  });

  it('extracts only stable error codes', () => {
    expect(requestErrorCode(new Error('watchlist_load_failed:provider detail'), 'fallback')).toBe('watchlist_load_failed');
    expect(requestErrorCode(new Error('unsafe detail here'), 'fallback')).toBe('fallback');
  });
});
