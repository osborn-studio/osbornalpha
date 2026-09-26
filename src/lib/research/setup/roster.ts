/** WP-A11 — roster load result: a failed or malformed response is an error, never an empty roster. */
export const ROSTER_LOAD_ERROR = '名单加载失败，请重试';

export function companiesFromResponse<T = unknown>(ok: boolean, body: unknown): { companies: T[] } | { error: string } {
  if (!ok || !body || typeof body !== 'object') return { error: ROSTER_LOAD_ERROR };
  const companies = (body as { companies?: unknown }).companies;
  if (!Array.isArray(companies)) return { error: ROSTER_LOAD_ERROR };
  return { companies: companies as T[] };
}
