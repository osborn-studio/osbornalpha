export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/llm/providers';
import { chat } from '@/lib/llm/openai-compat';
import { anthropicChat } from '@/lib/llm/anthropic-compat';

export async function POST(req: Request) {
  const { provider, model, apiKey } = (await req.json().catch(() => ({}))) as {
    provider?: string;
    model?: string;
    apiKey?: string;
  };

  const def = provider ? getProvider(provider) : null;
  if (!def || !apiKey) {
    return NextResponse.json(
      { ok: false, error: 'provider and apiKey required' },
      { status: 400 },
    );
  }

  const t0 = Date.now();
  try {
    const cfg = {
      baseUrl: def.baseUrl,
      apiKey,
      model: model || def.defaultModel,
      chatPath: def.chatPath,
    };
    const opts = {
      messages: [{ role: 'user' as const, content: 'ping' }],
      max_tokens: 1,
      timeoutMs: 15000,
    };
    const call = def.protocol === 'anthropic' ? anthropicChat : chat;
    await call(cfg, opts);
    return NextResponse.json({ ok: true, latencyMs: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
