// Sanitized LLM failure classes for the settings page (design 2026-10-18 §3.5). Upstream response
// text is never carried: a failure is a class plus, when known, the HTTP status. The UI maps the
// class to an action the user can take.

export type LlmFailureClass =
  | 'auth' // 401/403 → replace the key
  | 'quota' // 402 → top up
  | 'not_found' // 404 → refresh the list and pick another model
  | 'rate_limited' // 429 → retry later
  | 'server_error' // 5xx → retry later
  | 'bad_request' // other 4xx → check the model name / parameters
  | 'timeout'
  | 'network'
  | 'invalid_output' // response did not have the protocol's shape
  | 'discovery_unsupported' // the provider has no model-list endpoint at this path
  | 'unknown';

export interface LlmFailure {
  class: LlmFailureClass;
  status?: number;
}

export function httpClass(status: number): LlmFailureClass {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'quota';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'bad_request';
}

const ADAPTER_PREFIX = /^llm (\d{3}):/;

/**
 * Classify an error thrown by the chat adapters or by fetch. The adapters throw
 * `Error('llm <status>: <upstream body>')`; only the status survives here.
 */
export function classifyLlmError(e: unknown): LlmFailure {
  if (e && typeof e === 'object') {
    const name = (e as { name?: unknown }).name;
    if (name === 'AbortError' || name === 'TimeoutError') return { class: 'timeout' };
    if (name === 'LlmResponseShapeError') return { class: 'invalid_output' };
    if (e instanceof Error) {
      const m = ADAPTER_PREFIX.exec(e.message);
      if (m) {
        const status = Number(m[1]);
        return { class: httpClass(status), status };
      }
      if (e instanceof TypeError) return { class: 'network' };
    }
  }
  return { class: 'unknown' };
}
