/**
 * DeepSeek API client (OpenAI-compatible).
 *
 * Endpoint:  https://api.deepseek.com/chat/completions
 * Auth:      Bearer DEEPSEEK_API_KEY
 *
 * Models (set DEEPSEEK_MODEL env var to override):
 *   deepseek-chat        — DeepSeek-V3+ general chat (default, best for personas)
 *   deepseek-reasoner    — DeepSeek-R1 reasoning (slower, supports CoT)
 *
 * Pricing (2026 approximate):
 *   deepseek-chat:     $0.27 input / $1.10 output per Mtok
 *   deepseek-reasoner: $0.55 input / $2.19 output per Mtok
 * → 9-persona run ≈ $0.004 (chat) or $0.009 (reasoner) — 8-10x cheaper than Sonnet.
 */

export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

export function isDeepSeekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export function getDeepSeekModel(): string {
  return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
}

interface Msg { role: 'system' | 'user' | 'assistant'; content: string }

export interface DeepSeekChatOpts {
  model?: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  timeoutMs?: number;
  responseJson?: boolean;  // request response_format json_object
}

export interface DeepSeekChatResp {
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  finish_reason: string;
}

export async function deepseekChat(opts: DeepSeekChatOpts): Promise<DeepSeekChatResp> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

  const model = opts.model || getDeepSeekModel();
  const messages: Msg[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  for (const m of opts.messages) messages.push(m);

  const body: any = {
    model,
    messages,
    max_tokens: opts.max_tokens ?? 600,
    temperature: opts.temperature ?? 0.7,
    stream: false,
  };
  if (opts.responseJson) {
    body.response_format = { type: 'json_object' };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);

  let resp: Response;
  try {
    resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const json = await resp.json();
  const choice = json.choices?.[0];
  return {
    content: choice?.message?.content || '',
    usage: {
      input_tokens: json.usage?.prompt_tokens || 0,
      output_tokens: json.usage?.completion_tokens || 0,
    },
    model: json.model || model,
    finish_reason: choice?.finish_reason || 'stop',
  };
}
