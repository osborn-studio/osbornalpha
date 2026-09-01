import type { Market } from '@/lib/supabase/database.types';

export type KlineSourceName = 'datagateway' | 'eastmoney' | 'sina' | 'tencent' | 'twse' | 'tpex';
export type KlineAdjustment = 'qfq' | 'none' | 'intraday';
export type KlineProviderFailureKind =
  | 'unsupported'
  | 'empty'
  | 'not_found'
  | 'rate_limited'
  | 'transient'
  | 'protocol'
  | 'invalid_data';

export interface SourceKlineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SourceKlineSeries {
  source: KlineSourceName;
  bars: SourceKlineBar[];
  adjustment: KlineAdjustment;
  /** All provider adapters normalize volume to individual traded shares. */
  volumeUnit: 'shares';
}

export interface KlineProvider {
  name: KlineSourceName;
  market: Market;
  adjustment: KlineAdjustment;
  timeoutMs: number;
  maxAttempts: number;
  /** Interval this provider actually serves for the request, before aggregation. */
  returnsInterval?: 'minute' | 'day' | 'week' | 'month';
  fetch(signal: AbortSignal): Promise<SourceKlineSeries | null>;
}

export class KlineProviderError extends Error {
  constructor(
    public readonly kind: KlineProviderFailureKind,
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
    public readonly circuitOpen = false,
  ) {
    super(message);
    this.name = 'KlineProviderError';
  }
}

export function asKlineProviderError(error: unknown): KlineProviderError {
  if (error instanceof KlineProviderError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new KlineProviderError('transient', 'Provider request timed out or was aborted', true);
  }
  if (error instanceof Error) {
    const message = error.message || 'Unknown provider error';
    const retryable = /abort|timeout|socket|connect|network|fetch|econn|enotfound|dns/i.test(message);
    return new KlineProviderError(retryable ? 'transient' : 'protocol', message, retryable);
  }
  return new KlineProviderError('protocol', 'Unknown provider error');
}
