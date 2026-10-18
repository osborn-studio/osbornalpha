// Entry boundary shared by the three LLM settings POST routes (design §3.7): authenticate first,
// then a bounded body, then runtime field validation, then the per-user rate limit. The key used
// for a request is resolved here too, so "saved key only for its own provider" lives in one place.

import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { decrypt } from './crypto';
import { getProvider, MODEL_ID_PATTERN, type ProviderDef } from './providers';
import { LlmStoreError, readUserLlm } from './settings-store';

export const LLM_BODY_LIMIT_BYTES = 8 * 1024;
export const LLM_API_KEY_MAX_LENGTH = 512;
export const LLM_RATE_LIMIT_PER_MINUTE = 30;

type Guarded<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export const reject = (status: number, error: string): NextResponse => NextResponse.json({ ok: false, error }, { status });

export async function requireLlmUser(): Promise<Guarded<{ userId: string }>> {
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { ok: false, response: reject(401, 'not_authenticated') };
    return { ok: true, value: { userId: data.user.id } };
  } catch {
    return { ok: false, response: reject(503, 'store_unavailable') };
  }
}

export async function readLlmBody(req: Request): Promise<Guarded<Record<string, unknown>>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > LLM_BODY_LIMIT_BYTES) return { ok: false, response: reject(413, 'body_too_large') };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: reject(400, 'invalid_body') };
  }
  if (text.length > LLM_BODY_LIMIT_BYTES) return { ok: false, response: reject(413, 'body_too_large') };
  try {
    const parsed: unknown = JSON.parse(text || '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, response: reject(400, 'invalid_body') };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: reject(400, 'invalid_body') };
  }
}

export function providerField(v: unknown): ProviderDef | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > 64) return null;
  return getProvider(v);
}

export function modelField(v: unknown): string | null {
  return typeof v === 'string' && MODEL_ID_PATTERN.test(v) ? v : null;
}

const CONTROL = /[\u0000-\u001f\u007f]/;

/** undefined when absent; null when present but invalid. */
export function apiKeyField(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || v.length > LLM_API_KEY_MAX_LENGTH || CONTROL.test(v)) return null;
  return v;
}

// Per-user sliding window, in-process (one instance is enough for an interactive settings page).
const windows = new Map<string, number[]>();
export function rateLimited(userId: string, now = Date.now()): boolean {
  const cutoff = now - 60_000;
  const hits = (windows.get(userId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= LLM_RATE_LIMIT_PER_MINUTE) {
    windows.set(userId, hits);
    return true;
  }
  hits.push(now);
  windows.set(userId, hits);
  return false;
}
export function __resetRateLimitForTests() {
  windows.clear();
}

export interface RequestKey {
  apiKey: string;
  /** The id the configuration is (or will be) stored under; selects legacy chat paths. */
  storedProviderId: string;
  /** Version of the saved row the key came from; null when the key came from the request. */
  version: string | null;
}

/**
 * The key a discover/test call runs with: the one in the request, else the saved key when, and
 * only when, the saved row belongs to the same provider. Never an environment key.
 */
export async function resolveRequestKey(def: ProviderDef, requestKey: string | undefined): Promise<Guarded<RequestKey>> {
  if (requestKey !== undefined) return { ok: true, value: { apiKey: requestKey, storedProviderId: def.storageId, version: null } };
  let row;
  try {
    row = await readUserLlm();
  } catch (e) {
    if (e instanceof LlmStoreError && e.kind === 'not_authenticated') return { ok: false, response: reject(401, 'not_authenticated') };
    return { ok: false, response: reject(503, 'store_unavailable') };
  }
  if (!row || getProvider(row.provider)?.id !== def.id) return { ok: false, response: reject(400, 'key_required') };
  let apiKey: string;
  try {
    apiKey = decrypt(row.apiKeyCipher);
  } catch {
    return { ok: false, response: reject(500, 'key_unreadable') };
  }
  if (!apiKey) return { ok: false, response: reject(500, 'key_unreadable') };
  return { ok: true, value: { apiKey, storedProviderId: row.provider, version: row.updatedAt } };
}
