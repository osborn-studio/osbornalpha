import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildYahooReturnSnapshot, yahooChartReturnProvider } from './yahoo-chart';

afterEach(() => vi.unstubAllGlobals());

function payload() {
  return {
    chart: { result: [{
      meta: { symbol: 'AAPL', currency: 'USD' },
      timestamp: [1_725_148_800, 1_756_684_800],
      indicators: {
        quote: [{ close: [100, 108] }],
        adjclose: [{ adjclose: [98, 108] }],
      },
      events: { dividends: { one: { amount: 1 } }, splits: {} },
    }] },
  };
}

describe('Yahoo adjusted-close return provider', () => {
  it('publishes price return separately from reinvested total return', () => {
    const result = buildYahooReturnSnapshot('AAPL', '1y', payload());
    expect(result.priceReturnPct).toBeCloseTo(8);
    expect(result.totalReturnPct).toBeCloseTo((108 / 98 - 1) * 100);
    expect(result.distributionContributionPct).toBeCloseTo(result.totalReturnPct! - 8);
    expect(result).toMatchObject({
      dividendCount: 1, splitCount: 0, currency: 'USD',
      methodology: { priceBasis: 'unadjusted_close', totalReturnBasis: 'adjusted_close_reinvestment' },
    });
  });

  it('does not fabricate total return when adjusted-close coverage is incomplete', () => {
    const value = payload();
    value.chart.result[0].indicators.adjclose[0].adjclose[0] = null as unknown as number;
    const result = buildYahooReturnSnapshot('AAPL', '1y', value);
    expect(result.totalReturnPct).toBeNull();
    expect(result.warnings).toContain('adjusted_close_incomplete');
  });

  it('maps Shanghai tickers and requests dividend and split events', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload())));
    vi.stubGlobal('fetch', fetcher);
    await yahooChartReturnProvider.load('600519.SH', '6m');
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain('/600519.SS?');
    expect(url).toContain('range=6mo');
    expect(url).toContain('events=div%2Csplits');
  });

  it('propagates caller cancellation into the Yahoo request', async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();

    const pending = yahooChartReturnProvider.load('AAPL', '1m', controller.signal);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
