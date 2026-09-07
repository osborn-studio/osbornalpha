import { describe, expect, it, vi } from 'vitest';
import { createWatchlistRequestReporter } from './request-reporter';

describe('Watchlist request reporter', () => {
  it('keeps one request id across successful responses and step logs', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const reporter = createWatchlistRequestReporter('watchlist_test', { method: 'POST' }, 'request-1');
      await expect(reporter.step('store', async () => 2)).resolves.toBe(2);
      const response = reporter.json({ ok: true }, { status: 201, fields: { item_count: 1 } });
      expect(response.status).toBe(201);
      expect(response.headers.get('x-request-id')).toBe('request-1');
      expect(info.mock.calls.map(([value]) => JSON.parse(String(value)))).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: 'request_step_complete', request_id: 'request-1', step: 'store' }),
        expect.objectContaining({ event: 'request_complete', status: 201, item_count: 1 }),
      ]));
    } finally {
      info.mockRestore();
    }
  });

  it('logs stable internal codes while returning the public error contract', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const reporter = createWatchlistRequestReporter('watchlist_test', { method: 'PATCH' }, 'request-2');
      const response = reporter.fail(new Error('database_failed:private detail'), 'watchlist_update_failed');
      expect(response.headers.get('x-request-id')).toBe('request-2');
      await expect(response.json()).resolves.toMatchObject({
        code: 'watchlist_update_failed', requestId: 'request-2',
      });
      expect(JSON.parse(String(errorLog.mock.calls[0][0]))).toMatchObject({
        event: 'request_failed', error_code: 'database_failed',
      });
    } finally {
      errorLog.mockRestore();
    }
  });

  it('adds the request id and completion log to non-JSON responses', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const reporter = createWatchlistRequestReporter('watchlist_export', { method: 'GET' }, 'request-3');
      const response = reporter.response('ticker\nAAPL', {
        headers: { 'content-type': 'text/csv' },
      }, { format: 'csv' });
      expect(response.headers.get('x-request-id')).toBe('request-3');
      expect(await response.text()).toBe('ticker\nAAPL');
      expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({
        event: 'request_complete', status: 200, format: 'csv',
      });
    } finally {
      info.mockRestore();
    }
  });
});
