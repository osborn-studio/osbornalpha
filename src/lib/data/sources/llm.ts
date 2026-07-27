/**
 * Unified LLM facade — auto-selects available provider.
 *
 * Resolution order:
 *   1. DEEPSEEK_API_KEY  → DeepSeek (preferred for cost)
 *   2. ANTHROPIC_API_KEY → Claude (premium reasoning fallback)
 *
 * To pin a provider, set LLM_PROVIDER=deepseek|anthropic.
 *
 * The router exposes a single chat() that callers use without knowing
 * which provider runs.
 */

import { deepseekChat, isDeepSeekConfigured, type DeepSeekChatOpts } from './deepseek';
import { anthropicChat, isAnthropicConfigured, type ChatOpts as AnthropicOpts } from './anthropic';

export type LLMProvider = 'deepseek' | 'anthropic' | 'none';

export function getActiveProvider(): LLMProvider {
  const pin = process.env.LLM_PROVIDER?.toLowerCase();
  if (pin === 'deepseek' && isDeepSeekConfigured()) return 'deepseek';
  if (pin === 'anthropic' && isAnthropicConfigured()) return 'anthropic';
  if (isDeepSeekConfigured()) return 'deepseek';
  if (isAnthropicConfigured()) return 'anthropic';
  return 'none';
}

export function isLLMConfigured(): boolean {
  return getActiveProvider() !== 'none';
}

export interface UnifiedChatOpts {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Hint the model to return strict JSON (uses response_format on DeepSeek). */
  responseJson?: boolean;
}

export interface UnifiedChatResp {
  /** Legacy env providers, or any user-configured provider id (ark/kimi/openai/…). */
  provider: LLMProvider | string;
  model: string;
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  est_cost_usd: number;
}

// Per-million-token costs (USD); used to estimate per-call cost.
const PRICING: Record<string, { in: number; out: number }> = {
  'deepseek-chat':     { in: 0.27, out: 1.10 },
  'deepseek-reasoner': { in: 0.55, out: 2.19 },
  'claude-sonnet-4-6': { in: 3,    out: 15 },
  'claude-haiku-4-5':  { in: 0.80, out: 4 },
  'claude-opus-4-7':   { in: 15,   out: 75 },
};

function estimateCost(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  const p = PRICING[model] || PRICING['deepseek-chat'];
  return (usage.input_tokens / 1e6) * p.in + (usage.output_tokens / 1e6) * p.out;
}

/**
 * Per-user override (W2-fix): when called inside an authenticated request,
 * the user's 设置→AI 模型 config (llm_settings) takes precedence over the
 * platform env. Crons and signed-out contexts resolve to no user and fall
 * through to the legacy env router below. Dynamic imports keep next/headers
 * out of the module graph for unit tests.
 */
async function tryUserResolvedChat(opts: UnifiedChatOpts): Promise<UnifiedChatResp | null> {
  try {
    const { resolveLlm } = await import('@/lib/llm/resolve');
    const resolved = await resolveLlm();
    if (!resolved) return null;
    const cfg = { baseUrl: resolved.baseUrl, apiKey: resolved.apiKey, model: resolved.model, chatPath: resolved.chatPath };
    if (resolved.protocol === 'anthropic') {
      const { anthropicChat: compatChat } = await import('@/lib/llm/anthropic-compat');
      const r = await compatChat(cfg, {
        system: opts.system,
        messages: opts.messages,
        max_tokens: opts.max_tokens,
        timeoutMs: opts.timeoutMs,
      });
      return {
        provider: resolved.provider,
        model: resolved.model,
        content: r.content,
        usage: { input_tokens: 0, output_tokens: 0 },
        est_cost_usd: 0,
      };
    }
    const { chat: compatChat } = await import('@/lib/llm/openai-compat');
    const r = await compatChat(cfg, {
      system: opts.system,
      messages: opts.messages,
      max_tokens: opts.max_tokens,
      temperature: opts.temperature,
      timeoutMs: opts.timeoutMs,
    });
    const usage = { input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens };
    return {
      provider: resolved.provider,
      model: resolved.model,
      content: r.content,
      usage,
      est_cost_usd: Number(estimateCost(resolved.model, usage).toFixed(5)),
    };
  } catch {
    return null; // any resolution/override failure → legacy env path
  }
}

export async function chat(opts: UnifiedChatOpts): Promise<UnifiedChatResp> {
  const userResolved = await tryUserResolvedChat(opts);
  if (userResolved) return userResolved;

  const provider = getActiveProvider();
  if (provider === 'none') throw new Error('No LLM provider configured (set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY)');

  if (provider === 'deepseek') {
    const dsOpts: DeepSeekChatOpts = {
      system: opts.system,
      messages: opts.messages,
      max_tokens: opts.max_tokens,
      temperature: opts.temperature,
      timeoutMs: opts.timeoutMs,
      responseJson: opts.responseJson,
    };
    const r = await deepseekChat(dsOpts);
    return {
      provider: 'deepseek',
      model: r.model,
      content: r.content,
      usage: r.usage,
      est_cost_usd: Number(estimateCost(r.model, r.usage).toFixed(5)),
    };
  }

  // anthropic
  const acOpts: AnthropicOpts = {
    system: opts.system,
    messages: opts.messages,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature,
    timeoutMs: opts.timeoutMs,
  };
  const r = await anthropicChat(acOpts);
  const model = 'claude-sonnet-4-6';
  return {
    provider: 'anthropic',
    model,
    content: r.content,
    usage: r.usage,
    est_cost_usd: Number(estimateCost(model, r.usage).toFixed(5)),
  };
}

/**
 * Tolerant JSON extraction from any LLM response.
 * Tries direct parse → first {...} block → strip code fences.
 */
export function extractJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  try { return JSON.parse(cleaned); } catch {}
  return null;
}
