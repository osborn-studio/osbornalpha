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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arguments: any;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
}

function buildUrl(cfg: LlmConfig): string {
  return cfg.baseUrl + (cfg.chatPath ?? '/chat/completions');
}

function parseUsage(raw: unknown): Usage {
  const u = (raw ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  return {
    input_tokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0,
    output_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : 0,
  };
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
  },
): Promise<{ content: string; usage: Usage }> {
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

  const data = (await postJson(buildUrl(cfg), cfg.apiKey, body, timeoutMs)) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  const content = data?.choices?.[0]?.message?.content ?? '';
  const usage = parseUsage(data?.usage);
  return { content, usage };
}

export async function toolChat(
  cfg: LlmConfig,
  opts: {
    system?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: any[];
    tools: ToolDef[];
    max_tokens?: number;
    timeoutMs?: number;
  },
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: Usage;
}> {
  const timeoutMs = opts.timeoutMs ?? 60000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let args: any = {};
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function.name, arguments: args };
  });
  const finishReason = choice?.finish_reason ?? '';
  const usage = parseUsage(data?.usage);
  return { content, toolCalls, finishReason, usage };
}
