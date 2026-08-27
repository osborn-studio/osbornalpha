/** Sina minute K-line fallback for mainland A shares. */

import type { Market } from '@/lib/supabase/database.types';
import { KlineProviderError, type SourceKlineBar } from '@/lib/data/kline/types';

export interface SinaIntradayKlineOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function symbolOf(ticker: string): string | null {
  const match = ticker.trim().toUpperCase().match(/^(\d{6})\.(SH|SZ)$/);
  return match ? `${match[2].toLowerCase()}${match[1]}` : null;
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSinaIntradayKline(payload: unknown): SourceKlineBar[] {
  if (!Array.isArray(payload)) throw new KlineProviderError('protocol', 'Sina minute K-line payload is not an array');
  return payload.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const time = typeof row.day === 'string' ? row.day.replace(' ', 'T') : null;
    const open = number(row.open);
    const high = number(row.high);
    const low = number(row.low);
    const close = number(row.close);
    const volume = number(row.volume);
    if (!time || open === null || high === null || low === null || close === null || volume === null) return [];
    return [{ time, open, high, low, close, volume }];
  });
}

export async function fetchSinaIntradayKline(
  ticker: string,
  market: Market,
  limit: number,
  options: SinaIntradayKlineOptions = {},
): Promise<{ source: 'sina'; bars: SourceKlineBar[]; adjustment: 'intraday'; volumeUnit: 'shares' } | null> {
  if (market !== 'A') return null;
  const symbol = symbolOf(ticker);
  if (!symbol) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4_500);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=1&ma=no&datalen=${Math.max(1, Math.min(limit, 240))}`;
    const response = await fetch(url, {
      headers: { Referer: 'https://finance.sina.com.cn/', 'User-Agent': 'Mozilla/5.0 (compatible; StockMonitor/1.0)' },
      signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      throw new KlineProviderError(retryable ? 'transient' : 'protocol', `Sina minute K-line HTTP ${response.status}`, retryable, response.status);
    }
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new KlineProviderError('protocol', 'Sina minute K-line response is invalid JSON'); }
    const bars = parseSinaIntradayKline(payload).slice(-limit);
    return bars.length > 0 ? { source: 'sina', bars, adjustment: 'intraday', volumeUnit: 'shares' } : null;
  } catch (error) {
    if (error instanceof KlineProviderError) throw error;
    const aborted = controller.signal.aborted || options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
    throw new KlineProviderError('transient', aborted ? 'Sina minute K-line request timed out' : 'Sina minute K-line request failed', true);
  } finally {
    clearTimeout(timer);
  }
}
