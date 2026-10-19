// Shared HTTP helpers for the chat adapters: bounded body reads and the error thrown when a
// provider's response does not have the protocol shape the consumers read.

export const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_ERROR_BODY_BYTES = 64 * 1024;

/** Thrown when a 2xx response cannot be consumed; classified as `invalid_output`. */
export class LlmResponseShapeError extends Error {
  constructor(detail: string) {
    super(`llm invalid_output: ${detail}`);
    this.name = 'LlmResponseShapeError';
  }
}

type BodyLike = {
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
  json(): Promise<unknown>;
};

/** Read at most `limit` bytes of a body (streamed when possible), cancelling the rest. */
export async function readBounded(res: BodyLike, limit: number): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) {
    const text = await res.text();
    return text.length > limit ? { text: text.slice(0, limit), truncated: true } : { text, truncated: false };
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > limit) {
        parts.push(value.subarray(0, limit - size));
        size = limit;
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      parts.push(value);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock?.();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return { text: new TextDecoder().decode(merged), truncated };
}

/** Parse a 2xx JSON body, reading at most `limit` bytes; over the limit is a shape error. */
export async function readJsonBounded(res: BodyLike, limit = DEFAULT_MAX_RESPONSE_BYTES): Promise<unknown> {
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader : null;
  if (!reader) {
    // Test stubs and non-streaming responses: no body stream to bound.
    return res.json();
  }
  const { text, truncated } = await readBounded(res, limit);
  if (truncated) throw new LlmResponseShapeError(`response body over ${limit} bytes`);
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmResponseShapeError('response body is not JSON');
  }
}

/** Read a non-2xx body for the thrown error message, capped at 64 KB. Never throws. */
export async function readErrorText(res: BodyLike): Promise<string> {
  try {
    return (await readBounded(res, MAX_ERROR_BODY_BYTES)).text;
  } catch {
    return '';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
