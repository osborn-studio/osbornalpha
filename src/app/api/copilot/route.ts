import { runCopilotLoop, type CopilotEvent, type OaiMessage } from './loop';
import { toolChat } from '@/lib/llm/openai-compat';
import { resolveLlm } from '@/lib/llm/resolve';
import { TOOLS_BY_NAME, OPENAI_TOOL_DEFS } from '@/lib/agent/tools';
import { JOHN_CAMERON_5STEP } from '@/lib/agent/methods/john-cameron-5step';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { ticker, question } = await req.json().catch(() => ({}));
  if (!ticker) return new Response('missing ticker', { status: 400 });
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();

  // Resolve the user's (or env) LLM provider config.
  const llm = await resolveLlm();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: CopilotEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      // Step scaffold first so the UI can render §1..§5 placeholders.
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'steps', steps: JOHN_CAMERON_5STEP.steps })}\n\n`));

      if (!llm) {
        send({ type: 'error', message: '未配置 AI Provider。请在「设置 → AI 模型」中选择提供商并填入 API Key。' });
        send({ type: 'done' });
        controller.close();
        return;
      }

      await runCopilotLoop({
        ticker, question, maxHops: 12, onEvent: send,
        model: async (messages: OaiMessage[]) => {
          const r = await toolChat(
            { baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model, chatPath: llm.chatPath },
            { system: JOHN_CAMERON_5STEP.systemPrompt, messages, tools: OPENAI_TOOL_DEFS, max_tokens: 1500 },
          );
          return { content: r.content, toolCalls: r.toolCalls, finishReason: r.finishReason };
        },
        runTool: (name, args) => {
          const tool = TOOLS_BY_NAME[name];
          if (!tool) return Promise.resolve({ error: `unknown tool ${name}` });
          return tool.handler(args, { origin });
        },
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
