import { extractJson } from '@/lib/data/sources/llm';
import { sanitizeAiText } from '@/lib/llm/sanitize';

// Copilot agent loop — provider-agnostic, speaks the OpenAI chat/tool-calling
// protocol (works against ARK/DeepSeek/OpenAI/Kimi/MiniMax via openai-compat).

export type CopilotEvent =
  | { type: 'run'; run_id: string }
  | { type: 'notice'; code: 'provider_fallback'; message: string }
  | { type: 'token'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | { type: 'verdict'; data: any }
  | { type: 'done' }
  | { type: 'error'; message: string; quota?: { used: number; limit: number; plan: string } };

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
  // Neutral default task — the method's systemPrompt fully specifies the
  // workflow (five-step verdict, deep-dive, no-verdict diligence brief, chain
  // panorama…), so the task must NOT inject a method-specific framing. The old
  // ticker-only default hardcoded "John 五步 + 买卖评级", which leaked a rating
  // demand into the no-verdict methods (company-diligence / industry-chain).
  const task = !o.ticker
    ? (o.question as string)
    : o.question
    ? `${o.question}（标的：${o.ticker}）`
    : `请对标的 ${o.ticker} 执行你的分析框架并给出结论。`;
  const messages: OaiMessage[] = [{ role: 'user', content: task }];

  try {
    for (let hop = 0; hop < o.maxHops; hop++) {
      const turn = await o.model(messages);
      const cleanedContent = sanitizeAiText(turn.content);
      if (cleanedContent) o.onEvent({ type: 'token', text: cleanedContent });

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
        // Tools emitted in one model turn are independent reads. Start them
        // together so a slow endpoint does not make the whole John workflow
        // exceed the serverless request budget.
        for (const tc of turn.toolCalls) {
          o.onEvent({ type: 'tool_call', name: tc.name, args: tc.arguments });
        }
        const toolResults = await Promise.all(turn.toolCalls.map(async (tc) => {
          let result: unknown; let ok = true;
          try { result = await o.runTool(tc.name, tc.arguments); }
          catch (e) { ok = false; result = { error: String(e) }; }
          o.onEvent({ type: 'tool_result', name: tc.name, ok, summary: ok ? '完成' : '失败' });
          return { tc, result };
        }));
        // Preserve the provider's original tool-call order in conversation
        // history even though execution completes concurrently.
        for (const { tc, result } of toolResults) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) });
        }
        // Budget guard: the richer methods (15-dimension chain, 7-section
        // diligence) gather greedily and could burn every hop on tool calls,
        // leaving no turn to write the report. In the final hops, force
        // synthesis with whatever data is in hand — missing items get 待核实.
        if (hop >= o.maxHops - 2) {
          messages.push({
            role: 'user',
            content: '⚠️ 取数预算即将耗尽：请立即停止调用任何工具，用现有数据完成并输出完整报告正文，未取到的项标「待核实」，最后附上本方法规定的 JSON 收尾块。',
          });
        }
        continue;
      }

      // No tool calls → final turn. Extract the verdict JSON from the text.
      if (!cleanedContent) {
        throw new Error(`provider empty response (finish_reason=${turn.finishReason || 'unknown'})`);
      }
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
