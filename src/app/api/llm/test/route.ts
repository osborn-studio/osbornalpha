// Real-call test for one model on Alpha's actual adapter path (design §3.6b, §3.7). The response
// carries the saved configuration version the key came from so the page can bind `ready` to it.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { probeModel } from '@/lib/llm/probe';
import { apiKeyField, modelField, providerField, rateLimited, readLlmBody, reject, requireLlmUser, resolveRequestKey } from '@/lib/llm/request-guard';

export async function POST(req: Request) {
  const user = await requireLlmUser();
  if (!user.ok) return user.response;
  if (rateLimited(user.value.userId)) return reject(429, 'rate_limited');
  const body = await readLlmBody(req);
  if (!body.ok) return body.response;

  const def = providerField(body.value.provider);
  if (!def) return reject(400, 'unknown_provider');
  const model = modelField(body.value.model);
  if (!model) return reject(400, 'invalid_model');
  const requestKey = apiKeyField(body.value.apiKey);
  if (requestKey === null) return reject(400, 'invalid_api_key');

  const key = await resolveRequestKey(def, requestKey);
  if (!key.ok) return key.response;

  const result = await probeModel(def, { model, apiKey: key.value.apiKey, storedProviderId: key.value.storedProviderId });
  return NextResponse.json({
    ...result,
    provider: def.id,
    model,
    key_source: key.value.version === null ? 'request' : 'saved',
    version: key.value.version,
  });
}
