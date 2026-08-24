export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserLlm, setUserLlm } from '@/lib/llm/settings-store';
import { getProvider } from '@/lib/llm/providers';
import { encrypt } from '@/lib/llm/crypto';

export async function GET() {
  const u = await getUserLlm();
  return NextResponse.json({
    provider: u?.provider ?? null,
    model: u?.model ?? null,
    configured: !!u,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { provider, model, apiKey } = body as {
    provider?: string;
    model?: string;
    apiKey?: string;
  };

  if (!provider || !apiKey) {
    return NextResponse.json(
      { error: 'provider and apiKey required' },
      { status: 400 },
    );
  }

  const def = getProvider(provider);
  if (!def) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 400 });
  }

  let cipher: string;
  try {
    cipher = encrypt(apiKey);
  } catch {
    return NextResponse.json(
      { error: 'encryption not configured (set LLM_ENC_KEY)' },
      { status: 500 },
    );
  }

  try {
    await setUserLlm({
      provider,
      model: model || def.defaultModel,
      apiKeyCipher: cipher,
    });
  } catch {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
