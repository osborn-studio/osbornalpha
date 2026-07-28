const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 500;
const MAX_METADATA_BYTES = 8_000;

const SECRET_KEYS = new Set([
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'password',
  'secret',
  'clientsecret',
  'servicerolekey',
]);

function isSecretKey(key: string): boolean {
  const compact = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SECRET_KEYS.has(compact) || compact.endsWith('apikey');
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value !== 'object') return undefined;

  const entries: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(key)) continue;
    const sanitized = sanitizeValue(child, depth + 1);
    if (sanitized !== undefined) entries.push([key.slice(0, 120), sanitized]);
  }
  return Object.fromEntries(entries);
}

export function sanitizeEventMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const sanitized = sanitizeValue(value, 0) as Record<string, unknown>;
  try {
    if (JSON.stringify(sanitized).length > MAX_METADATA_BYTES) return { truncated: true };
  } catch {
    return {};
  }
  return sanitized;
}

export function safeHeader(value: string | null, max = MAX_STRING_LENGTH): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function normalizeReferrer(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, MAX_STRING_LENGTH);
  } catch {
    return null;
  }
}

export function sanitizeEventName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-z][a-z0-9_]{0,79}$/.test(trimmed) ? trimmed : null;
}
