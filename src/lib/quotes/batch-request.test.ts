import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quoteRetryAfterMs, requestQuoteBatch } from './batch-request';
import { mergeQuoteBatchResults, shouldRetryQuoteBatchError } from './batch-client';

describe('bounded quote transport with synthetic responses', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] }); vi.setSystemTime(new Date('2026-10-06T00:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  const ok = () => Response.json({ quotes: { A: { price: 10 } } });
  it.each([429, 502, 503])('retries HTTP %s once after Retry-After, then accepts cold-start recovery', async (status) => {
    const fn = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status, headers: { 'Retry-After': '2' } })).mockResolvedValueOnce(ok());
    const promise = requestQuoteBatch('/synthetic', fn);
    await vi.advanceTimersByTimeAsync(1999); expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(await promise).toEqual({ quotes: { A: { price: 10 } } }); expect(fn).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
  it('waits until HTTP-date and refuses a delay beyond the total budget', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': 'Tue, 06 Oct 2026 00:00:03 GMT' } })).mockResolvedValueOnce(ok());
    const p = requestQuoteBatch('/synthetic', fn); await vi.advanceTimersByTimeAsync(2999); expect(fn).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(1); await p;
    const limited = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
    await expect(requestQuoteBatch('/synthetic', limited)).rejects.toThrow('HTTP 429'); expect(limited).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('terminates transport ignoring abort within50s, including the wait and second attempt', async () => {
    const signals: AbortSignal[] = [];
    const fn = vi.fn<typeof fetch>().mockImplementation((_, options) => { signals.push(options!.signal!); return new Promise(() => {}); });
    const result = requestQuoteBatch('/synthetic', fn).catch((e: Error) => e.name);
    await vi.advanceTimersByTimeAsync(49_999); expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(await result).toBe('AbortError'); expect(signals.every(s => s.aborted)).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds stalled JSON bodies and retries transient network errors once', async () => {
    const stalled = { ok: true, json: () => new Promise(() => {}) } as Response;
    const fn = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('synthetic')).mockResolvedValueOnce(stalled);
    const result = requestQuoteBatch('/synthetic', fn).catch((e: Error) => e.name);
    await vi.advanceTimersByTimeAsync(25_250); expect(await result).toBe('AbortError'); expect(fn).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([400, 401, 403, 404])('never retries HTTP %s', async status => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
    await expect(requestQuoteBatch('/synthetic', fn)).rejects.toThrow(`HTTP ${status}`); expect(fn).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not retry partial/stale results, preserves fallback provenance and missing cached quotes', async () => {
    const payload = { quotes: { A: { price: 10 }, B: null }, meta: { stale: 1, failed_tickers: ['B'], selected_sources: { A: 'synthetic-fallback' } } };
    const fn = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    const value = await requestQuoteBatch<{ price: number }>('/synthetic', fn);
    const merged = mergeQuoteBatchResults({ tickers: ['A','B'], chunks: [['A','B']], settled: [{ status: 'fulfilled', value }], previousQuotes: { B: { price: 5 } } });
    expect(fn).toHaveBeenCalledTimes(1); expect(merged.meta.failed).toBe(1); expect(merged.meta.stale).toBe(2); expect(merged.meta.selected_sources).toEqual({ A: 'synthetic-fallback', B: 'client-cache' });
  });
  it('rejects malformed payloads without retries', async () => {
    for (const body of ['null','[]','"synthetic"','{']) {
      const fn = vi.fn<typeof fetch>().mockResolvedValue(new Response(body)); await expect(requestQuoteBatch('/synthetic', fn)).rejects.toBeInstanceOf(Error); expect(fn).toHaveBeenCalledTimes(1);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
  it('handles cooperative abort rejections without unhandled promises', async () => {
    const fn = vi.fn<typeof fetch>().mockImplementation((_, options) => new Promise((_, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new DOMException('synthetic abort', 'AbortError')), { once: true });
    }));
    const result = requestQuoteBatch('/synthetic', fn).catch((e: Error) => e.name);
    await vi.advanceTimersByTimeAsync(50_000); expect(await result).toBe('AbortError'); expect(fn).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    // Vitest reports any unhandled rejection as a test-run failure. Promise.race
    // retains rejection handlers on both inputs after its first settlement.
  });
  it('propagates second transient failure with no third request and aborts unread responses', async () => {
    const signals: AbortSignal[] = [];
    const fn = vi.fn<typeof fetch>().mockImplementation(async (_, options) => {
      signals.push(options!.signal!); return new Response('synthetic-error-body', { status: signals.length === 1 ? 503 : 502 });
    });
    const result = requestQuoteBatch('/synthetic', fn).catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(250); expect(await result).toBe('quote batch HTTP 502'); expect(fn).toHaveBeenCalledTimes(2); expect(signals.every(s => s.aborted)).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('refuses a30s Retry-After after24s spent waiting for the first response', async () => {
    const fn = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(new Response('', { status: 429, headers: { 'Retry-After': '30' } })),24_000)));
    const result = requestQuoteBatch('/synthetic', fn).catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(24_000); expect(await result).toBe('quote batch HTTP 429'); expect(fn).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('uses default delay after timeout and discards late200 results', async () => {
    let deliver: ((response: Response) => void) | undefined;
    const fn = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { deliver=resolve; })).mockResolvedValueOnce(ok());
    const result = requestQuoteBatch('/synthetic', fn);
    await vi.advanceTimersByTimeAsync(25_000); expect(fn).toHaveBeenCalledTimes(1);
    deliver!(Response.json({ quotes: { A: { price: 999 } } }));
    await vi.advanceTimersByTimeAsync(249); expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(await result).toEqual({ quotes: { A: { price: 10 } } }); expect(fn).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
  it('validates retry metadata and attempt bounds', () => {
    const now = Date.now();
    for (const text of ['1.5','-1','garbage','10/06/2026']) expect(quoteRetryAfterMs(text,now)).toBe(null);
    expect(quoteRetryAfterMs('9999999999999999999999',now)).toBe(Infinity);
    expect(quoteRetryAfterMs('Tue, 06 Oct 2026 00:00:00 GMT',now)).toBe(0);
    for (const attempt of [-1,NaN,Infinity,.5,1,100]) expect(shouldRetryQuoteBatchError(new Error('HTTP 502'),attempt)).toBe(false);
  });
});
