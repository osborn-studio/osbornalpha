// Real-call test for one (provider, model, key) on Alpha's actual consumer path: the same config
// builder resolve.ts uses and the same adapters every feature calls, with a 1-token request.
// A pass proves "plain chat on this path returns a protocol-correct response", nothing more
// (design §2 status vocabulary). Failures are classified; upstream text never leaves here.

import { chat } from './openai-compat';
import { anthropicChat } from './anthropic-compat';
import { classifyLlmError, type LlmFailure } from './errors';
import { llmConfigFor, type LlmConfigInput, type ProviderDef } from './providers';

export const PROBE_TIMEOUT_MS = 15_000;
export const PROBE_MAX_BYTES = 1_048_576;

export type ProbeResult = { ok: true; latency_ms: number } | ({ ok: false } & LlmFailure);

export async function probeModel(def: ProviderDef, input: LlmConfigInput): Promise<ProbeResult> {
  const cfg = { ...llmConfigFor(def, input), maxResponseBytes: PROBE_MAX_BYTES };
  const opts = { messages: [{ role: 'user' as const, content: 'ping' }], max_tokens: 1, timeoutMs: PROBE_TIMEOUT_MS };
  const t0 = Date.now();
  try {
    if (def.protocol === 'anthropic') await anthropicChat(cfg, opts);
    else await chat(cfg, opts);
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ...classifyLlmError(e) };
  }
}
