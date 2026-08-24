/**
 * Unified LLM facade — auto-selects available provider.
 *
 * Resolution order:
 *   1. DEEPSEEK_API_KEY  → DeepSeek (preferred for cost)
 *   2. ANTHROPIC_API_KEY → Claude (premium reasoning fallback)
 *
 * To pin a provider, set LLM_PROVIDER=deepseek|anthropic. A pin is
 * authoritative: if that provider's key is absent, resolution fails closed
 * instead of spending through another configured provider.
 *
 * The router exposes a single chat() that callers use without knowing
 * which provider runs.
 */

import { deepseekChat, isDeepSeekConfigured, type DeepSeekChatOpts } from './deepseek';
import { anthropicChat, isAnthropicConfigured, type ChatOpts as AnthropicOpts } from './anthropic';
import { calculateCostUsd, normalizeUsage, type NormalizedUsage } from '@/lib/billing/llm-pricing';
import type { ResolvedLlm } from '@/lib/llm/resolve';

export type LLMProvider = 'deepseek' | 'anthropic' | 'none';

export function getActiveProvider(): LLMProvider {
  const pin = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (pin) {
    if (pin === 'deepseek') return isDeepSeekConfigured() ? 'deepseek' : 'none';
    if (pin === 'anthropic') return isAnthropicConfigured() ? 'anthropic' : 'none';
    return 'none';
  }
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

export interface ResolvedChatResp {
  content: string;
  usage: NormalizedUsage;
}

/**
 * Calls one already-resolved provider without silently switching credentials.
 * Billing-sensitive routes use this after deciding whether the resolved key is
 * BYO or platform-owned.
 */
export async function chatResolved(
  resolved: ResolvedLlm,
  opts: UnifiedChatOpts,
): Promise<ResolvedChatResp> {
  const cfg = {
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
    model: resolved.model,
    chatPath: resolved.chatPath,
  };
  if (resolved.protocol === 'anthropic') {
    const { anthropicChat: compatChat } = await import('@/lib/llm/anthropic-compat');
    return compatChat(cfg, {
      system: opts.system,
      messages: opts.messages,
      max_tokens: opts.max_tokens,
      timeoutMs: opts.timeoutMs,
    });
  }

  const { chat: compatChat } = await import('@/lib/llm/openai-compat');
  return compatChat(cfg, {
    system: opts.system,
    messages: opts.messages,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature,
    timeoutMs: opts.timeoutMs,
    responseJson: opts.responseJson,
  });
}

function estimateCost(provider: string, model: string, usage: NormalizedUsage): number {
  try {
    return Number(calculateCostUsd(provider, model, usage).toFixed(5));
  } catch {
    return 0;
  }
}

/**
 * Per-user override (W2-fix): when called inside an authenticated request,
 * the user's 设置→AI 模型 config (llm_settings) takes precedence over the
 * platform env. Crons and signed-out contexts resolve to no user and fall
 * through to the legacy env router below. Dynamic imports keep next/headers
 * out of the module graph for unit tests.
 */
async function tryUserResolvedChat(opts: UnifiedChatOpts): Promise<UnifiedChatResp | null> {
  let resolved: ResolvedLlm | null;
  try {
    const { resolveLlm } = await import('@/lib/llm/resolve');
    resolved = await resolveLlm();
  } catch {
    return null;
  }
  if (!resolved) return null;

  // Once credentials have been resolved, provider errors must propagate.
  // Falling through here would turn a failed BYO request into shared-key spend.
  const r = await chatResolved(resolved, opts);
  const usage = { input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens };
  return {
    provider: resolved.provider,
    model: resolved.model,
    content: r.content,
    usage,
    est_cost_usd: estimateCost(resolved.provider, resolved.model, r.usage),
  };
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
    const normalizedUsage = normalizeUsage(r.usage);
    return {
      provider: 'deepseek',
      model: r.model,
      content: r.content,
      usage: r.usage,
      est_cost_usd: estimateCost('deepseek', r.model, normalizedUsage),
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
  const normalizedUsage = normalizeUsage(r.usage);
  return {
    provider: 'anthropic',
    model,
    content: r.content,
    usage: r.usage,
    est_cost_usd: estimateCost('anthropic', model, normalizedUsage),
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
