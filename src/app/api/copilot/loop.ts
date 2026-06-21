import { extractJson } from '@/lib/data/sources/llm';
import type { ContentBlock, ToolChatResp, AnthropicMessage } from '@/lib/data/sources/anthropic';

export type CopilotEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | { type: 'verdict'; data: any }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface LoopOpts {
  ticker: string;
  question?: string;
  model: (messages: AnthropicMessage[]) => Promise<ToolChatResp>;
  runTool: (name: string, args: any) => Promise<unknown>;
  maxHops: number;
  onEvent: (e: CopilotEvent) => void;
}

export async function runCopilotLoop(o: LoopOpts): Promise<void> {
  const task = o.question
    ? `${o.question}（标的：${o.ticker}）`
    : `请用 John Cameron 五步分析法分析 ${o.ticker}，给出买卖评级、仓位与止损。`;
  const messages: AnthropicMessage[] = [{ role: 'user', content: task }];

  try {
    for (let hop = 0; hop < o.maxHops; hop++) {
      const resp = await o.model(messages);
      const toolResults: any[] = [];

      for (const block of resp.content as ContentBlock[]) {
        if (block.type === 'text' && block.text) o.onEvent({ type: 'token', text: block.text });
        if (block.type === 'tool_use') {
          o.onEvent({ type: 'tool_call', name: block.name, args: block.input });
          let result: unknown; let ok = true;
          try { result = await o.runTool(block.name, block.input); }
          catch (e) { ok = false; result = { error: String(e) }; }
          o.onEvent({ type: 'tool_result', name: block.name, ok, summary: summarize(result) });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result).slice(0, 6000) });
        }
      }

      messages.push({ role: 'assistant', content: resp.content });

      if (resp.stop_reason === 'tool_use' && toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
        continue;
      }
      // Final turn: extract verdict from the concatenated text.
      const finalText = (resp.content as ContentBlock[])
        .filter((b) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
      const verdict = safeJson(finalText);
      if (verdict) o.onEvent({ type: 'verdict', data: verdict });
      break;
    }
  } catch (e) {
    o.onEvent({ type: 'error', message: String(e) });
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
