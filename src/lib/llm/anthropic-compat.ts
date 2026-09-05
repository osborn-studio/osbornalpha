// Anthropic Messages API adapter for the copilot loop. The loop speaks the
// OpenAI message shape (OaiMessage); these pure converters translate at the
// boundary. Used for providers with protocol: 'anthropic' (ARK Agent Plan).

import type { LlmConfig, ToolDef, ToolCall } from './openai-compat';
import { normalizeUsage, type NormalizedUsage } from '../billing/llm-pricing';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface AnthropicMessage { role: 'user' | 'assistant'; content: Block[] }

export function oaiToAnthropic(messages: any[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const block: Block = { type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content ?? '') };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && last.content[0]?.type === 'tool_result') last.content.push(block);
      else out.push({ role: 'user', content: [block] });
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: 'text', text: String(m.content) });
      for (const tc of m.tool_calls) {
        let input: unknown = {};
        try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    if (m.role === 'user' || m.role === 'assistant') {
      // Anthropic rejects empty text blocks with a 400 — fall back to a space.
      out.push({ role: m.role, content: [{ type: 'text', text: String(m.content ?? '') || ' ' }] });
    }
    // system handled separately by the caller
  }
  return out;
}

export function toolDefsToAnthropic(tools: ToolDef[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function sumTokens(...values: number[]): { value: number; overflowed: boolean } {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number.isSafeInteger(total)
    ? { value: total, overflowed: false }
    : { value: Number.MAX_SAFE_INTEGER, overflowed: true };
}

/** Anthropic reports uncached input and cache counters separately, not as one total. */
function normalizeAnthropicUsage(raw: unknown): NormalizedUsage {
  if (!isRecord(raw)) return normalizeUsage(raw);

  const inputTokens = tokenCount(raw.input_tokens);
  const outputTokens = tokenCount(raw.output_tokens);
  const cacheReadTokens = raw.cache_read_input_tokens === undefined
    ? 0
    : tokenCount(raw.cache_read_input_tokens);
  const cacheCreationTokens = raw.cache_creation_input_tokens === undefined
    ? 0
    : tokenCount(raw.cache_creation_input_tokens);
  const input = inputTokens ?? 0;
  const hit = cacheReadTokens ?? 0;
  const creation = cacheCreationTokens ?? 0;
  const total = sumTokens(input, hit, creation);
  const miss = sumTokens(input, creation);
  const malformed = inputTokens === undefined
    || outputTokens === undefined
    || cacheReadTokens === undefined
    || cacheCreationTokens === undefined
    || total.overflowed
    || miss.overflowed;

  return normalizeUsage({
    input_tokens: total.value,
    output_tokens: outputTokens ?? 0,
    prompt_cache_hit_tokens: hit,
    prompt_cache_miss_tokens: miss.value,
    estimated: raw.estimated === true || malformed,
  });
}

export function responseToTurn(data: { content?: any[]; stop_reason?: string; usage?: unknown }): {
  content: string; toolCalls: ToolCall[]; finishReason: string; usage: NormalizedUsage;
} {
  const blocks = data.content ?? [];
  const content = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const toolCalls: ToolCall[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, arguments: b.input ?? {} }));
  const usage = normalizeAnthropicUsage(data.usage);
  return { content, toolCalls, finishReason: data.stop_reason ?? '', usage };
}

export async function anthropicToolChat(
  cfg: LlmConfig,
  opts: { system?: string; messages: any[]; tools: ToolDef[]; max_tokens?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<{ content: string; toolCalls: ToolCall[]; finishReason: string; usage: NormalizedUsage }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  const signal = opts.signal ? AbortSignal.any([controller.signal, opts.signal]) : controller.signal;
  try {
    const res = await fetch(cfg.baseUrl + (cfg.chatPath ?? '/v1/messages'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: opts.max_tokens ?? 1500,
        ...(opts.system ? { system: opts.system } : {}),
        messages: oaiToAnthropic(opts.messages),
        ...(opts.tools.length ? { tools: toolDefsToAnthropic(opts.tools) } : {}),
      }),
      signal,
    });
    if (!res.ok) throw new Error('llm ' + res.status + ': ' + (await res.text().catch(() => '')));
    return responseToTurn(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Plain-text completion for /api/llm/test connectivity checks. */
export async function anthropicChat(
  cfg: LlmConfig,
  opts: { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: string }>; max_tokens?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<{ content: string; usage: NormalizedUsage }> {
  const r = await anthropicToolChat(cfg, { system: opts.system, messages: opts.messages, tools: [], max_tokens: opts.max_tokens ?? 64, timeoutMs: opts.timeoutMs, signal: opts.signal });
  return { content: r.content, usage: r.usage };
}
