import type { DataEnvelope } from './overview-contract';

export function unavailableDataEnvelope<T>(
  source: string | null,
  reasonCode: string,
  options: { retryable?: boolean; total?: number } = {},
): DataEnvelope<T> {
  return {
    value: null,
    asOf: null,
    source,
    status: 'unavailable',
    warnings: [reasonCode],
    reasonCode,
    retryable: options.retryable ?? true,
    coverage: { available: 0, total: options.total ?? 1 },
  };
}

export function freshDataEnvelope<T>(
  value: T,
  source: string,
  asOf = new Date().toISOString(),
): DataEnvelope<T> {
  return {
    value,
    asOf,
    source,
    status: 'fresh',
    warnings: [],
    coverage: { available: 1, total: 1 },
  };
}
