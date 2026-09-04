export async function fetchSearchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 7_000,
): Promise<any> {
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
