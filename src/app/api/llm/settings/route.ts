export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { LlmStoreError, readUserLlm, saveUserLlm, updateUserLlmModel } from '@/lib/llm/settings-store';
import { chatPathFor, getProvider } from '@/lib/llm/providers';
import { encrypt } from '@/lib/llm/crypto';
import { apiKeyField, modelField, providerField, readLlmBody, reject, requireLlmUser } from '@/lib/llm/request-guard';

function storeFailure(e: unknown) {
  if (e instanceof LlmStoreError && e.kind === 'not_authenticated') return reject(401, 'not_authenticated');
  return reject(503, 'store_unavailable');
}

export async function GET() {
  const user = await requireLlmUser();
  if (!user.ok) return user.response;
  let row;
  try {
    row = await readUserLlm();
  } catch (e) {
    return storeFailure(e);
  }
  if (!row) return NextResponse.json({ provider: null, legacyId: null, storedProvider: null, model: null, configured: false, version: null, legacyPath: false });
  const def = getProvider(row.provider);
  return NextResponse.json({
    // A row whose provider the catalog no longer knows is reported as-is so the page can say so.
    provider: def?.id ?? row.provider,
    legacyId: def?.legacyId ?? null,
    storedProvider: row.provider,
    model: row.model,
    configured: true,
    version: row.updatedAt,
    legacyPath: def ? chatPathFor(def, row.provider) !== def.chatPath : false,
    known: Boolean(def),
  });
}

export async function POST(req: Request) {
  const user = await requireLlmUser();
  if (!user.ok) return user.response;
  const body = await readLlmBody(req);
  if (!body.ok) return body.response;

  const def = providerField(body.value.provider);
  if (!def) return reject(400, 'unknown_provider');
  const model = modelField(body.value.model);
  if (!model) return reject(400, 'invalid_model');
  const apiKey = apiKeyField(body.value.apiKey);
  if (apiKey === null) return reject(400, 'invalid_api_key');

  let version: string;
  try {
    if (apiKey === undefined) {
      const candidates = [...new Set([def.storageId, def.id, def.legacyId].filter((x): x is string => Boolean(x)))];
      const updated = await updateUserLlmModel({ storageId: def.storageId, providerCandidates: candidates, model });
      if (!updated) return reject(400, 'key_required');
      version = updated.version;
    } else {
      let cipher: string;
      try {
        cipher = encrypt(apiKey);
      } catch {
        return reject(500, 'encryption_not_configured');
      }
      version = (await saveUserLlm({ storageId: def.storageId, model, apiKeyCipher: cipher })).version;
    }
  } catch (e) {
    return storeFailure(e);
  }

  return NextResponse.json({ ok: true, provider: def.id, legacyId: def.legacyId, storedProvider: def.storageId, model, version, legacyPath: false });
}
