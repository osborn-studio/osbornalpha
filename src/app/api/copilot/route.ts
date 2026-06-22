import { runCopilotLoop, type CopilotEvent } from './loop';
import { anthropicToolChat, type AnthropicMessage } from '@/lib/data/sources/anthropic';
import { TOOLS_BY_NAME, TOOL_DEFS } from '@/lib/agent/tools';
import { JOHN_CAMERON_5STEP } from '@/lib/agent/methods/john-cameron-5step';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const { ticker, question } = await req.json().catch(() => ({}));
  if (!ticker) return new Response('missing ticker', { status: 400 });
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: CopilotEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      // Emit step scaffold first so the UI can render §1..§5 placeholders.
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'steps', steps: JOHN_CAMERON_5STEP.steps })}\n\n`));
      await runCopilotLoop({
        ticker, question, maxHops: 12, onEvent: send,
        model: (messages: AnthropicMessage[]) => anthropicToolChat({
          system: JOHN_CAMERON_5STEP.systemPrompt, messages, tools: TOOL_DEFS, max_tokens: 1500,
        }),
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
