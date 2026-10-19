// Model discovery for the settings page: GET the provider's discovery path with the user's key.
// Read-only, never billed, never cached (the key belongs to the user). The result carries ids
// and a completeness flag; failures carry a class and status only (design §3.6).

import { httpClass, type LlmFailure, type LlmFailureClass } from './errors';
import { MODEL_ID_PATTERN, type ProviderDef } from './providers';
import { readJsonBounded, LlmResponseShapeError } from './http';

export const DISCOVERY_MAX_BYTES = 1_048_576;
export const DISCOVERY_MAX_IDS = 500;
export const DISCOVERY_TIMEOUT_MS = 8000;

export type DiscoveryResult =
  | { ok: true; latency_ms: number; models: string[]; truncated: boolean }
  | ({ ok: false } & LlmFailure);

export function discoveryHeaders(def: ProviderDef, apiKey: string): Record<string, string> {
  if (def.protocol === 'anthropic') {
    return { [def.authHeader]: `${def.authPrefix}${apiKey}`, 'anthropic-version': '2023-06-01' };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

const fail = (cls: LlmFailureClass, status?: number): DiscoveryResult =>
  status === undefined ? { ok: false, class: cls } : { ok: false, class: cls, status };

export async function discoverModels(
  def: ProviderDef,
  apiKey: string,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<DiscoveryResult> {
  const f = opts.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DISCOVERY_TIMEOUT_MS);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await f(def.baseUrl + def.discoveryPath, {
      method: 'GET',
      headers: discoveryHeaders(def, apiKey),
      redirect: 'error',
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (controller.signal.aborted) return fail('timeout');
    return fail(e instanceof TypeError ? 'network' : 'unknown');
  }
  let json: unknown;
  try {
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      if (res.status === 404 || res.status === 405) return fail('discovery_unsupported', res.status);
      return fail(httpClass(res.status), res.status);
    }
    json = await readJsonBounded(res, DISCOVERY_MAX_BYTES);
  } catch (e) {
    if (controller.signal.aborted) return fail('timeout');
    if (e instanceof LlmResponseShapeError) return fail('invalid_output', res.status);
    return fail(e instanceof TypeError ? 'network' : 'unknown');
  } finally {
    clearTimeout(timer);
  }
  const latency_ms = Date.now() - t0;
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return fail('invalid_output', res.status);
  const ids = new Set<string>();
  for (const item of data) {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && MODEL_ID_PATTERN.test(id)) ids.add(id);
  }
  const sorted = [...ids].sort();
  const doc = json as { has_more?: unknown; next_page?: unknown };
  const truncated = sorted.length > DISCOVERY_MAX_IDS || doc.has_more === true || Boolean(doc.next_page);
  return { ok: true, latency_ms, models: sorted.slice(0, DISCOVERY_MAX_IDS), truncated };
}
