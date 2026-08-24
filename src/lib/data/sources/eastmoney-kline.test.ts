import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEastmoneyKline } from './eastmoney';

describe('Eastmoney K-line adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests A-share daily bars as qfq and preserves adjustment metadata', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('cb({"data":{"klines":["2026-08-11,10,11,12,9,100"]}});', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchEastmoneyKline('600519.SH', 'D', 22, { adjustment: 'qfq' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('&fqt=1');
    expect(result).toMatchObject({ source: 'eastmoney', adjustment: 'qfq', volumeUnit: 'shares' });
    expect(result?.bars[0].volume).toBe(10_000);
  });

  it('requests unadjusted HK history and intraday bars with explicit semantics', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('cb({"data":{"klines":["2026-08-11,10,11,12,9,100"]}});', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchEastmoneyKline('00700.HK', 'D', 22, { adjustment: 'none' }))?.adjustment).toBe('none');
    expect(String(fetchMock.mock.calls[0][0])).toContain('&fqt=0');
    expect((await fetchEastmoneyKline('00700.HK', '1', 240))?.adjustment).toBe('intraday');
  });

  it('classifies retryable HTTP and malformed protocol responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(fetchEastmoneyKline('600519.SH', 'D', 22)).rejects.toMatchObject({ kind: 'transient', retryable: true, status: 503 });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>blocked</html>', { status: 200 })));
    await expect(fetchEastmoneyKline('600519.SH', 'D', 22)).rejects.toMatchObject({ kind: 'protocol', retryable: false });
  });
});
