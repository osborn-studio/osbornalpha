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
import { LlmResponseShapeError, isRecord, readErrorText, readJsonBounded } from './http';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  chatPath?: string;
  /** Auth header for anthropic-protocol providers; the OpenAI adapter always sends Bearer. */
  authHeader?: string;
  authPrefix?: string;
  /** Upper bound on a 2xx body; over it the call fails as invalid_output. */
  maxResponseBytes?: number;
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
  cfg: LlmConfig,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      // A redirect would carry the user's key to another host.
      redirect: 'error',
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await readErrorText(res);
      throw new Error('llm ' + res.status + ': ' + text);
    }
    return await readJsonBounded(res, cfg.maxResponseBytes);
  } finally {
    clearTimeout(timer);
  }
}

interface ChatCompletionChoice {
  message: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
  finish_reason?: string;
}

/** The fields every consumer reads must have the documented types; anything else is invalid_output. */
function validateChoice(data: unknown): { choice: ChatCompletionChoice; usage: unknown } {
  if (!isRecord(data)) throw new LlmResponseShapeError('response is not an object');
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new LlmResponseShapeError('choices missing or empty');
  const first = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) throw new LlmResponseShapeError('choices[0].message is not an object');
  const content = first.message.content;
  if (content !== undefined && content !== null && typeof content !== 'string') {
    throw new LlmResponseShapeError('message.content is not a string');
  }
  const toolCalls = first.message.tool_calls;
  if (toolCalls !== undefined) {
    if (!Array.isArray(toolCalls)) throw new LlmResponseShapeError('message.tool_calls is not an array');
    for (const tc of toolCalls) {
      if (!isRecord(tc) || typeof tc.id !== 'string' || !isRecord(tc.function)
        || typeof tc.function.name !== 'string' || typeof tc.function.arguments !== 'string') {
        throw new LlmResponseShapeError('malformed tool_call');
      }
    }
  }
  if (first.finish_reason !== undefined && typeof first.finish_reason !== 'string') {
    throw new LlmResponseShapeError('finish_reason is not a string');
  }
  return { choice: first as unknown as ChatCompletionChoice, usage: data.usage };
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

  const { choice, usage: rawUsage } = validateChoice(await postJson(buildUrl(cfg), cfg, body, timeoutMs));
  const content = choice.message.content ?? '';
  const usage = normalizeUsage(rawUsage);
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

  const { choice, usage: rawUsage } = validateChoice(await postJson(buildUrl(cfg), cfg, body, timeoutMs));
  const rawContent = choice.message.content;
  const content = rawContent == null ? '' : rawContent;
  const rawCalls = choice.message.tool_calls ?? [];
  const toolCalls: ToolCall[] = rawCalls.map((tc) => {
    let args: any = {};
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function.name, arguments: args };
  });
  const finishReason = choice.finish_reason ?? '';
  const usage = normalizeUsage(rawUsage);
  return { content, toolCalls, finishReason, usage };
}
