import { runCopilotLoop, type CopilotEvent, type OaiMessage } from './loop';
import { toolChat } from '@/lib/llm/openai-compat';
import { anthropicToolChat } from '@/lib/llm/anthropic-compat';
import { resolveLlm } from '@/lib/llm/resolve';
import { TOOLS_BY_NAME, OPENAI_TOOL_DEFS } from '@/lib/agent/tools';
import { JOHN_CAMERON_5STEP } from '@/lib/agent/methods/john-cameron-5step';
import { AGENT_METHODS } from '@/lib/agent/methods/registry';
import { createArtifact } from '@/lib/portfolio/artifacts-store';
import { checkQuota, recordUsage, type QuotaResult } from '@/lib/billing/quota';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Auto-archive threshold: skip near-empty runs (e.g. immediate errors).
const MIN_ARCHIVE_CHARS = 200;

export async function POST(req: Request) {
  const { ticker, question, methodId } = await req.json().catch(() => ({}));
  const method = methodId ? AGENT_METHODS[methodId as string] : undefined;
  // No-ticker discovery methods (e.g. bottleneck-picker / industry-chain) are
  // allowed through when a known methodId pairs with a non-empty question —
  // the loop's task template falls back to the question itself in that case.
  const noTickerAllowed = !!method && typeof question === 'string' && question.trim().length > 0;
  if (!ticker && !noTickerAllowed) return new Response('missing ticker', { status: 400 });
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();
  const resolvedMethod = method ?? JOHN_CAMERON_5STEP;

  // Resolve the user's (or env) LLM provider config.
  const llm = await resolveLlm();
  const byo = llm?.source === 'user';

  // Non-BYO calls are subject to the daily platform quota. This route is
  // public in middleware, so 'not authenticated' from checkQuota() fails
  // CLOSED — anonymous callers get no platform-key budget (fail-open would
  // let bare curl burn the platform key unmetered). Other failures
  // (transient DB) fail open: quota is cost protection, not a 500 excuse.
  let quota: QuotaResult | null = null;
  if (!byo) {
    try {
      quota = await checkQuota('copilot');
    } catch (e) {
      if ((e as Error).message === 'not authenticated') {
        return new Response(JSON.stringify({ error: 'not authenticated' }), {
          status: 401, headers: { 'content-type': 'application/json' },
        });
      }
      quota = null;
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: CopilotEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      // Step scaffold first so the UI can render the method's step placeholders.
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'steps', steps: resolvedMethod.steps })}\n\n`));

      if (!llm) {
        send({ type: 'error', message: '未配置 AI Provider。请在「设置 → AI 模型」中选择提供商并填入 API Key。' });
        send({ type: 'done' });
        controller.close();
        return;
      }

      if (quota && !quota.allowed) {
        // Backward-compatible shape: `message` is always present (old clients
        // still render the red-text error), `quota` is additive (new clients
        // detect it and render the QuotaNotice upgrade card instead).
        send({
          type: 'error',
          message: '今日平台额度已用完',
          quota: { used: quota.used, limit: quota.limit, plan: quota.plan },
        });
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
        ticker: ticker || undefined, question, maxHops: 12, onEvent,
        model: async (messages: OaiMessage[]) => {
          const cfg = { baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model, chatPath: llm.chatPath };
          const call = llm.protocol === 'anthropic' ? anthropicToolChat : toolChat;
          const r = await call(cfg, { system: resolvedMethod.systemPrompt, messages, tools: OPENAI_TOOL_DEFS, max_tokens: 1500 });
          return { content: r.content, toolCalls: r.toolCalls, finishReason: r.finishReason };
        },
        runTool: (name, args) => {
          const tool = TOOLS_BY_NAME[name];
          if (!tool) return Promise.resolve({ error: `unknown tool ${name}` });
          return tool.handler(args, { origin });
        },
      });

      // Best-effort ledger entry — tokens aren't surfaced through the tool-call
      // loop today, so tokensIn/tokensOut are recorded as 0 (spec-accepted:
      // usage_events is a count-based quota ledger first, token audit second).
      // recordUsage() never throws (see quota.ts) so this can't break the stream.
      await recordUsage('copilot', { ticker: ticker || undefined, byo });

      if (resolvedMethod.archive && archivedText.length > MIN_ARCHIVE_CHARS) {
        try {
          const label = ticker || question?.slice(0, 40) || resolvedMethod.name;
          await createArtifact({
            skill_id: resolvedMethod.id,
            ticker: ticker || null,
            title: `${label} ${resolvedMethod.name} ${new Date().toISOString().slice(0, 10)}`,
            content_md: archivedText,
            params: { question, verdict: archivedVerdict },
          });
        } catch {
          // Archiving is best-effort — a failure here must not prevent the stream from closing below.
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
