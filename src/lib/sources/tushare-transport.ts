import { createPacer } from '../facts/providers/shared';

export const TUSHARE_ENDPOINT = 'https://api.tushare.pro';
export const TUSHARE_MIN_INTERVAL_MS = 400;
export const tusharePacer = createPacer(TUSHARE_MIN_INTERVAL_MS);
export const resetTusharePacing = () => tusharePacer.reset();

/** Direct importers that intentionally bypass shared admission: interactive, sync, diagnostic and recording paths. */
export const TUSHARE_UNPACED_CALL_SITES = [
  'scripts/industry/record-fixture.ts',
  'src/app/api/diag/tushare/route.ts',
  'src/lib/data/sources/tushare.ts',
  'src/lib/dq/calendar-deps.ts',
  'src/lib/securities/sources/tushare-a.ts',
  'src/lib/securities/sources/tushare-cb.ts',
  'src/lib/securities/sources/tushare-client.ts',
  'src/lib/securities/sources/tushare-funds.ts',
  'src/lib/securities/sources/tushare-hk.ts',
] as const;

interface TushareBody {
  api_name: string;
  token: string;
  params: Record<string, unknown>;
  fields: string;
}

export function postTushare(
  { api_name, token, params, fields }: TushareBody,
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<Response> {
  return (opts.fetch ?? fetch)(TUSHARE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_name, token, params, fields }),
    ...(opts.signal && { signal: opts.signal }),
  });
}
