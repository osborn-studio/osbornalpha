import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTwseQuotesBatch } from './twse';
const payload = (code: string, price = '12') => ({ msgArray: [{ c: code, ex: 'tse', z: price, y: '11', d: '20261006', t: '12:00:00' }] });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('TWSE single-layer quote cache synthetic fixtures', () => {
  it('uses monotonic TTL and bypasses Next Data Cache on expiry', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(payload('9211'))).mockResolvedValueOnce(Response.json(payload('9211', '13')));
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchTwseQuotesBatch(['9211.TW'])).get('9211.TW')?.price).toBe(12);
    clock.mockReturnValue(60_999);
    expect((await fetchTwseQuotesBatch(['9211.TW'])).get('9211.TW')?.price).toBe(12);
    expect(fetcher).toHaveBeenCalledOnce();
    clock.mockReturnValue(61_000);
    expect((await fetchTwseQuotesBatch(['9211.TW'])).get('9211.TW')?.price).toBe(13);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, options] of fetcher.mock.calls) {
      expect(options.cache).toBe('no-store');
      expect(options).not.toHaveProperty('next');
    }
  });
  it('does not renew retention when wall clock jumps backward', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const wall = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(payload('9212'))).mockResolvedValueOnce(Response.json(payload('9212', '14')));
    vi.stubGlobal('fetch', fetcher);
    await fetchTwseQuotesBatch(['9212.TW']);
    wall.mockReturnValue(1); clock.mockReturnValue(61_000);
    expect((await fetchTwseQuotesBatch(['9212.TW'])).get('9212.TW')?.price).toBe(14);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not send duplicate exact ticker strings in a batch', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload('9213')));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchTwseQuotesBatch(['9213.TW', '9213.TW', 'INVALID', 'INVALID']);
    expect(result.size).toBe(2); expect(result.get('INVALID')).toBeNull();
    const query = new URL(fetcher.mock.calls[0][0]).searchParams;
    expect(query.get('ex_ch')).toBe('tse_9213.tw');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not retain failure or renew an expired quote after a failed fetch', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(payload('9214'))).mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json(payload('9214', '15')));
    vi.stubGlobal('fetch', fetcher); await fetchTwseQuotesBatch(['9214.TW']);
    clock.mockReturnValue(61_000);
    expect((await fetchTwseQuotesBatch(['9214.TW'])).get('9214.TW')).toBeNull();
    expect((await fetchTwseQuotesBatch(['9214.TW'])).get('9214.TW')?.price).toBe(15);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([false, true])('does not let older responses renew or overwrite a newer cache entry (equal ticks=%s)', async equalTicks => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const code = equalTicks ? '9216' : '9215';
    const ticker = `${code}.TW`;
    let deliver: (value: Response) => void = () => {};
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { deliver = resolve; }))
      .mockResolvedValueOnce(Response.json(payload(code, '13')))
      .mockResolvedValueOnce(Response.json(payload(code, '16')));
    vi.stubGlobal('fetch', fetcher);
    const older = fetchTwseQuotesBatch([ticker, '9299.TW']);
    const laterStart = equalTicks ? 1000 : 2000;
    clock.mockReturnValue(laterStart);
    expect((await fetchTwseQuotesBatch([ticker])).get(ticker)?.price).toBe(13);
    clock.mockReturnValue(4900); deliver(Response.json(payload(code, '12')));
    expect((await older).get(ticker)?.price).toBe(12);
    clock.mockReturnValue(laterStart + 59_999);
    expect((await fetchTwseQuotesBatch([ticker])).get(ticker)?.price).toBe(13);
    expect(fetcher).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(laterStart + 60_000);
    expect((await fetchTwseQuotesBatch([ticker])).get(ticker)?.price).toBe(16);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('counts in-flight elapsed time in retention rather than stamping body receipt', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    let deliver: (value: Response) => void = () => {};
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { deliver = resolve; }))
      .mockResolvedValueOnce(Response.json(payload('9217', '17')));
    vi.stubGlobal('fetch', fetcher);
    const pending = fetchTwseQuotesBatch(['9217.TW']);
    clock.mockReturnValue(4900); deliver(Response.json(payload('9217'))); await pending;
    clock.mockReturnValue(61_000);
    expect((await fetchTwseQuotesBatch(['9217.TW'])).get('9217.TW')?.price).toBe(17);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
