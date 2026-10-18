// Connection test for the settings page: GET the provider's model list with the user's key.
// Never billed, never cached, never an environment key (design §3.7).
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { discoverModels } from '@/lib/llm/discover';
import { apiKeyField, providerField, rateLimited, readLlmBody, reject, requireLlmUser, resolveRequestKey } from '@/lib/llm/request-guard';

export async function POST(req: Request) {
  const user = await requireLlmUser();
  if (!user.ok) return user.response;
  if (rateLimited(user.value.userId)) return reject(429, 'rate_limited');
  const body = await readLlmBody(req);
  if (!body.ok) return body.response;

  const def = providerField(body.value.provider);
  if (!def) return reject(400, 'unknown_provider');
  const requestKey = apiKeyField(body.value.apiKey);
  if (requestKey === null) return reject(400, 'invalid_api_key');

  const key = await resolveRequestKey(def, requestKey);
  if (!key.ok) return key.response;

  const result = await discoverModels(def, key.value.apiKey);
  return NextResponse.json({ ...result, provider: def.id, key_source: key.value.version === null ? 'request' : 'saved' });
}
