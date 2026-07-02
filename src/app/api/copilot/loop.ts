import { extractJson } from '@/lib/data/sources/llm';

// Copilot agent loop — provider-agnostic, speaks the OpenAI chat/tool-calling
// protocol (works against ARK/DeepSeek/OpenAI/Kimi/MiniMax via openai-compat).

export type CopilotEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | { type: 'verdict'; data: any }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** One model turn in OpenAI shape (from openai-compat toolChat). */
export interface ModelTurn {
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: any }>;
  finishReason: string;
}

/** OpenAI-format chat message (assistant tool_calls / tool results). */
export interface OaiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: any;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface LoopOpts {
  /** Absent for no-ticker discovery methods (bottleneck-picker / industry-chain) — question carries the task. */
  ticker?: string;
  question?: string;
  model: (messages: OaiMessage[]) => Promise<ModelTurn>;
  runTool: (name: string, args: any) => Promise<unknown>;
  maxHops: number;
  onEvent: (e: CopilotEvent) => void;
}

export async function runCopilotLoop(o: LoopOpts): Promise<void> {
  const task = !o.ticker
    ? (o.question as string)
    : o.question
    ? `${o.question}（标的：${o.ticker}）`
    : `请用 John Cameron 五步分析法分析 ${o.ticker}，给出买卖评级、仓位与止损。`;
  const messages: OaiMessage[] = [{ role: 'user', content: task }];

  try {
    for (let hop = 0; hop < o.maxHops; hop++) {
      const turn = await o.model(messages);
      if (turn.content) o.onEvent({ type: 'token', text: turn.content });

      if (turn.toolCalls.length > 0) {
        // Append the assistant turn carrying the tool calls (OpenAI requires the
        // arguments serialized as a JSON string on the assistant message).
        messages.push({
          role: 'assistant',
          content: turn.content || '',
          tool_calls: turn.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
          })),
        });
        // Execute each tool and append its result as a `tool` message.
        for (const tc of turn.toolCalls) {
          o.onEvent({ type: 'tool_call', name: tc.name, args: tc.arguments });
          let result: unknown; let ok = true;
          try { result = await o.runTool(tc.name, tc.arguments); }
          catch (e) { ok = false; result = { error: String(e) }; }
          o.onEvent({ type: 'tool_result', name: tc.name, ok, summary: summarize(result) });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) });
        }
        continue;
      }

      // No tool calls → final turn. Extract the verdict JSON from the text.
      const verdict = safeJson(turn.content);
      if (verdict) o.onEvent({ type: 'verdict', data: verdict });
      break;
    }
  } catch (e) {
    o.onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    o.onEvent({ type: 'done' });
  }
}

function safeJson(text: string): any | null {
  try { return extractJson(text); } catch { return null; }
}
function summarize(result: unknown): string {
  const s = typeof result === 'string' ? result : JSON.stringify(result);
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}
