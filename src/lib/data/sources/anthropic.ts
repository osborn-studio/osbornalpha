/**
 * Anthropic Claude API client.
 *
 * Set env var on Vercel:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * For Stock Monitor, we use:
 * - claude-haiku-4-5    — fast, cheap, news sentiment classification
 * - claude-sonnet-4-6   — perspective generation (9 personas in parallel)
 * - claude-opus-4-7     — daily brief composition (long-form synthesis)
 *
 * Pricing (approximate, 2026):
 * - Haiku   : $0.80 / Mtok input,  $4   / Mtok output
 * - Sonnet  : $3   / Mtok input,  $15  / Mtok output
 * - Opus    : $15  / Mtok input,  $75  / Mtok output
 *
 * Typical perspective call: ~800 input tok + ~150 output tok = $0.0048 per persona.
 * 9 personas per stock = ~$0.043 per perspectives refresh.
 */

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

interface Msg { role: 'user' | 'assistant'; content: string }

export interface ChatOpts {
  model?: 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-7';
  system?: string;
  messages: Msg[];
  max_tokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ChatResp {
  content: string;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

export async function anthropicChat(opts: ChatOpts): Promise<ChatResp> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const body: any = {
    model: opts.model || 'claude-sonnet-4-6',
    max_tokens: opts.max_tokens ?? 600,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);

  let resp: Response;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const json = await resp.json();
  const content = Array.isArray(json.content)
    ? json.content.map((b: any) => b.text || '').join('')
    : '';
  return {
    content,
    usage: { input_tokens: json.usage?.input_tokens || 0, output_tokens: json.usage?.output_tokens || 0 },
    stop_reason: json.stop_reason,
  };
}

/** Parse a JSON object from a text response, tolerant of code fences and extra text. */
export function extractJson(text: string): any {
  // Try direct parse
  try { return JSON.parse(text); } catch {}
  // Try extracting first {...} block
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  // Try stripping code fences
  const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  try { return JSON.parse(cleaned); } catch {}
  return null;
}

// ── Tool-use capable call (for the agent loop) ──────────────────────────────
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown>; }
export interface TextBlock { type: 'text'; text: string; }
export interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: any; }
export type ContentBlock = TextBlock | ToolUseBlock;
export interface AnthropicMessage { role: 'user' | 'assistant'; content: any; }
export interface ToolChatResp { content: ContentBlock[]; stop_reason: string; usage: { input_tokens: number; output_tokens: number }; }

export async function anthropicToolChat(opts: {
  model?: 'claude-sonnet-4-6' | 'claude-opus-4-7';
  system?: string;
  messages: AnthropicMessage[];
  tools: ToolDef[];
  max_tokens?: number;
  timeoutMs?: number;
}): Promise<ToolChatResp> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 55_000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: opts.model || 'claude-sonnet-4-6',
        max_tokens: opts.max_tokens ?? 1500,
        system: opts.system,
        tools: opts.tools,
        messages: opts.messages,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${await resp.text()}`);
    const j = await resp.json();
    return { content: j.content as ContentBlock[], stop_reason: j.stop_reason, usage: j.usage };
  } finally { clearTimeout(timer); }
}
