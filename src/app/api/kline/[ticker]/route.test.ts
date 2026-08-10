import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ eastmoney: vi.fn(), twse: vi.fn() }));
vi.mock('@/lib/data/sources/eastmoney', () => ({ fetchEastmoneyKline: mocks.eastmoney }));
vi.mock('@/lib/data/sources/twse', () => ({ fetchTwseKline: mocks.twse }));

import { GET } from './route';

const ctx = (ticker: string) => ({ params: Promise.resolve({ ticker }) });
const bars = [{ time: '2026-08-10 09:30:00', open: 10, high: 12, low: 9, close: 11, volume: 100 }];

describe('GET /api/kline/[ticker]', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.eastmoney.mockResolvedValue({ source: 'eastmoney', bars }); });

  it('maps the public 1D range to minute provider data and metadata', async () => {
    const response = await GET(new Request('https://example.test/api/kline/NVDA?range=1d'), ctx('NVDA'));
    expect(response.status).toBe(200);
    expect(mocks.eastmoney).toHaveBeenCalledWith('NVDA', '1', 240);
    const body = await response.json();
    expect(body.meta).toMatchObject({ range: '1d', interval: 'minute', timezone: 'America/New_York', delayed: true });
    expect(body.bars[0].time).toBe(Date.UTC(2026, 7, 10, 9, 30) / 1000);
  });

  it('rejects invalid ranges and unsupported Taiwan ranges', async () => {
    expect((await GET(new Request('https://example.test/api/kline/NVDA?range=5y'), ctx('NVDA'))).status).toBe(400);
    const response = await GET(new Request('https://example.test/api/kline/2330.TW?range=1d'), ctx('2330.TW'));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe('intraday_unsupported');
    expect(mocks.twse).not.toHaveBeenCalled();
  });

  it('uses daily TWSE data for supported Taiwan ranges', async () => {
    mocks.twse.mockResolvedValue({ source: 'twse', bars: [{ ...bars[0], time: '2026-08-08' }] });
    const response = await GET(new Request('https://example.test/api/kline/2330.TW?range=3m'), ctx('2330.TW'));
    expect(response.status).toBe(200);
    expect(mocks.twse).toHaveBeenCalledWith('2330.TW', 'D', 66);
  });
});
