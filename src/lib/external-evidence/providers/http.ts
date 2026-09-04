export async function fetchSearchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 7_000,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`search_provider_http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function asJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
