import {
  fetchDatagatewayDailyKline,
  parseDatagatewayDailyKline,
} from '../../src/lib/data/sources/datagateway.ts';

export function parseReplayGatewayHistory(payload, adjustment, symbols) {
  return parseDatagatewayDailyKline(payload, adjustment, {
    requireExplicitAdjustment: true,
    acceptedSymbols: symbols,
  });
}

export async function fetchReplayGatewayHistory({ ticker, market, limit, adjustment, startDate, endDate }, fetchImpl = fetch) {
  if (!startDate || !endDate) return null;
  return fetchDatagatewayDailyKline(ticker, market, limit, adjustment, {
    startDate, endDate, requireExplicitAdjustment: true, timeoutMs: 6000, fetchImpl,
  });
}
