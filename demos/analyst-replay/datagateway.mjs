import { KlineProviderError } from '../../src/lib/data/kline/types.ts';
import {
  datagatewayConfig,
  datagatewayDailyKlineBody,
  datagatewayDailyKlineUrl,
  parseDatagatewayDailyKline,
} from '../../src/lib/data/sources/datagateway.ts';

const MAX_RESPONSE_BYTES = 1_000_000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function field(value, ...names) {
  if (!object(value)) return undefined;
  const entries = new Map(Object.entries(value).map(([key, item]) => [key.toLowerCase(), item]));
  return names.map(name => entries.get(name)).find(item => item !== undefined);
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(value + 'T00:00:00Z');
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

export function parseReplayGatewayHistory(payload, adjustment, symbols) {
  const nested = field(payload, 'data', 'result', 'results');
  const data = object(nested) ? nested : payload;
  const reported = field(data, 'adjustment') ?? field(payload, 'adjustment');
  if (typeof reported !== 'string' || !reported.trim()) {
    throw new KlineProviderError('invalid_data', 'Datagateway did not report the price adjustment');
  }

  const listed = Array.isArray(nested) ? nested : Array.isArray(payload) ? payload
    : field(data, 'bars', 'items', 'kline', 'rows', 'records');
  const rows = Array.isArray(listed) ? listed : Object.values(data).filter(object);
  const columns = field(data, 'fields');
  for (const row of rows) {
    const entry = Array.isArray(row) && Array.isArray(columns) && columns.every(name => typeof name === 'string')
      ? Object.fromEntries(columns.map((name, index) => [name, row[index]])) : row;
    const symbol = field(entry, 'symbol', 'ticker', 'windcode', 's_info_windcode');
    if (symbol != null && !symbols.includes(String(symbol).trim().toUpperCase())) {
      throw new KlineProviderError('invalid_data', 'Datagateway returned a different security');
    }
  }

  // Keep the legacy decoder shared. Replays must also reject a history where the decoder
  // had to discard rows, because it would change which close counts as T+5 or T+10.
  const history = parseDatagatewayDailyKline(payload, adjustment);
  if (history.bars.length !== rows.length) {
    throw new KlineProviderError('invalid_data', 'Datagateway scoring history contains a missing or invalid close');
  }
  return history;
}

async function readHistoryPayload(response) {
  const oversized = () => new KlineProviderError('protocol', 'Datagateway response exceeded the size limit');
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw oversized();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  for await (const chunk of response.body ?? []) {
    bytes += chunk.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) throw oversized();
    text += decoder.decode(chunk, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

export async function fetchReplayGatewayHistory({ ticker, market, limit, adjustment, startDate, endDate }, fetchImpl = fetch) {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate) || startDate > endDate) return null;
  const config = datagatewayConfig();
  const url = config && datagatewayDailyKlineUrl(config, { ticker, market, limit, adjustment });
  const body = url && datagatewayDailyKlineBody({ ticker, market, limit, startDate, endDate });
  if (!body) return null;

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new KlineProviderError('transient', `Datagateway HTTP ${response.status}`);
  return parseReplayGatewayHistory(await readHistoryPayload(response), adjustment, [ticker.toUpperCase(), ...body.symbols]);
}
