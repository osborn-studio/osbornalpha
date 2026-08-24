/**
 * Client for any OpenAI-compatible chat-completions API.
 *
 * Supports two call shapes:
 *   - chat()    — plain text completion
 *   - toolChat() — function/tool calling
 *
 * Designed to work with OpenAI, DeepSeek, Kimi, MiniMax, Volcano Ark, and any
 * other provider that speaks the OpenAI /chat/completions wire format.
 */

import { normalizeUsage, type NormalizedUsage } from '../billing/llm-pricing';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  chatPath?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function buildUrl(cfg: LlmConfig): string {
  return cfg.baseUrl + (cfg.chatPath ?? '/chat/completions');
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('llm ' + res.status + ': ' + text);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(
  cfg: LlmConfig,
  opts: {
    system?: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    max_tokens?: number;
    temperature?: number;
    timeoutMs?: number;
    responseJson?: boolean;
  },
): Promise<{ content: string; usage: NormalizedUsage }> {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  for (const m of opts.messages) messages.push(m);

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
  };
  if (typeof opts.max_tokens === 'number') body.max_tokens = opts.max_tokens;
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature;
  if (opts.responseJson) body.response_format = { type: 'json_object' };

  const data = (await postJson(buildUrl(cfg), cfg.apiKey, body, timeoutMs)) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  const content = data?.choices?.[0]?.message?.content ?? '';
  const usage = normalizeUsage(data?.usage);
  return { content, usage };
}

export async function toolChat(
  cfg: LlmConfig,
  opts: {
    system?: string;
    messages: any[];
    tools: ToolDef[];
    max_tokens?: number;
    timeoutMs?: number;
    thinking?: 'enabled' | 'disabled';
  },
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: NormalizedUsage;
}> {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const messages: any[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  for (const m of opts.messages) messages.push(m);

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    tools: opts.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    tool_choice: 'auto',
  };
  if (typeof opts.max_tokens === 'number') body.max_tokens = opts.max_tokens;
  if (opts.thinking) body.thinking = { type: opts.thinking };

  const data = (await postJson(buildUrl(cfg), cfg.apiKey, body, timeoutMs)) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
      finish_reason?: string;
    }>;
    usage?: unknown;
  };

  const choice = data?.choices?.[0];
  const rawContent = choice?.message?.content;
  const content = rawContent == null ? '' : rawContent;
  const rawCalls = choice?.message?.tool_calls ?? [];
  const toolCalls: ToolCall[] = rawCalls.map((tc) => {
    let args: any = {};
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function.name, arguments: args };
  });
  const finishReason = choice?.finish_reason ?? '';
  const usage = normalizeUsage(data?.usage);
  return { content, toolCalls, finishReason, usage };
}
