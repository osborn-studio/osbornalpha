import { runCopilotLoop, type CopilotEvent, type OaiMessage } from './loop';
import { toolChat } from '@/lib/llm/openai-compat';
import { anthropicToolChat } from '@/lib/llm/anthropic-compat';
import { resolveLlm } from '@/lib/llm/resolve';
import { TOOLS_BY_NAME, OPENAI_TOOL_DEFS } from '@/lib/agent/tools';
import { JOHN_CAMERON_5STEP } from '@/lib/agent/methods/john-cameron-5step';
import { AGENT_METHODS } from '@/lib/agent/methods/registry';
import { createArtifact } from '@/lib/portfolio/artifacts-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Auto-archive threshold: skip near-empty runs (e.g. immediate errors).
const MIN_ARCHIVE_CHARS = 200;

export async function POST(req: Request) {
  const { ticker, question, methodId } = await req.json().catch(() => ({}));
  if (!ticker) return new Response('missing ticker', { status: 400 });
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();
  const method = AGENT_METHODS[methodId as string] ?? JOHN_CAMERON_5STEP;

  // Resolve the user's (or env) LLM provider config.
  const llm = await resolveLlm();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: CopilotEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      // Step scaffold first so the UI can render the method's step placeholders.
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'steps', steps: method.steps })}\n\n`));

      if (!llm) {
        send({ type: 'error', message: '未配置 AI Provider。请在「设置 → AI 模型」中选择提供商并填入 API Key。' });
        send({ type: 'done' });
        controller.close();
        return;
      }

      // Accumulate token text + verdict for optional post-run archiving.
      let archivedText = '';
      let archivedVerdict: unknown = null;
      const onEvent = (e: CopilotEvent) => {
        if (e.type === 'token') archivedText += e.text;
        if (e.type === 'verdict') archivedVerdict = e.data;
        send(e);
      };

      await runCopilotLoop({
        ticker, question, maxHops: 12, onEvent,
        model: async (messages: OaiMessage[]) => {
          const cfg = { baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model, chatPath: llm.chatPath };
          const call = llm.protocol === 'anthropic' ? anthropicToolChat : toolChat;
          const r = await call(cfg, { system: method.systemPrompt, messages, tools: OPENAI_TOOL_DEFS, max_tokens: 1500 });
          return { content: r.content, toolCalls: r.toolCalls, finishReason: r.finishReason };
        },
        runTool: (name, args) => {
          const tool = TOOLS_BY_NAME[name];
          if (!tool) return Promise.resolve({ error: `unknown tool ${name}` });
          return tool.handler(args, { origin });
        },
      });

      if (method.archive && archivedText.length > MIN_ARCHIVE_CHARS) {
        try {
          await createArtifact({
            skill_id: method.id,
            ticker,
            title: `${ticker} ${method.name} ${new Date().toISOString().slice(0, 10)}`,
            content_md: archivedText,
            params: { question, verdict: archivedVerdict },
          });
        } catch {
          // Archiving is best-effort — never let it break the stream that already closed successfully.
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
