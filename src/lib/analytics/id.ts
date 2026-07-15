export interface AnalyticsCryptoSource {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

function browserCrypto(): AnalyticsCryptoSource | undefined {
  if (typeof globalThis.crypto === 'undefined') return undefined;
  return {
    randomUUID: typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID.bind(globalThis.crypto)
      : undefined,
    getRandomValues: typeof globalThis.crypto.getRandomValues === 'function'
      ? globalThis.crypto.getRandomValues.bind(globalThis.crypto)
      : undefined,
  };
}

function byteUuid(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createAnalyticsId(source: AnalyticsCryptoSource | undefined = browserCrypto()): string {
  if (source?.randomUUID) return source.randomUUID();
  if (source?.getRandomValues) return byteUuid(source.getRandomValues(new Uint8Array(16)));
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
