import { describe, expect, it, vi } from 'vitest';
import { validateImportedTickerBatches } from './import-validation';

describe('validateImportedTickerBatches', () => {
  it('validates imports larger than the endpoint limit in batches of 100', async () => {
    const tickers = Array.from({ length: 101 }, (_, index) => `TICKER${index}`);
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tickers: string[] };
      return new Response(JSON.stringify({ accepted: body.tickers, rejected: [] }), { status: 200 });
    });

    const result = await validateImportedTickerBatches(tickers, request);

    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).tickers).toHaveLength(100);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body)).tickers).toEqual(['TICKER100']);
    expect(result).toEqual({ accepted: tickers, rejected: [] });
  });

  it('preserves the service error code when a validation batch fails', async () => {
    const request = vi.fn(async () => new Response(
      JSON.stringify({ error: 'security_master_unavailable' }),
      { status: 503 },
    ));

    await expect(validateImportedTickerBatches(['AAPL'], request)).rejects.toMatchObject({
      code: 'security_master_unavailable',
    });
  });
});
