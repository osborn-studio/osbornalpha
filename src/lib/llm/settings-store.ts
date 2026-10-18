// Server-only store for per-user LLM settings (provider, model, encrypted API key).
//
// The API key is stored as an AES-256-GCM ciphertext produced by src/lib/llm/crypto.ts.
// Plaintext keys never touch the database — encryption happens before insert/update
// and decryption only happens server-side in routes that need to call the provider.
//
// Row-level access is enforced both here (we always scope by the authenticated user)
// and in Postgres via the RLS policies in
// supabase/migrations/20260624090000_llm_settings.sql.
//
// `provider` is stored as the provider's storage id (src/lib/llm/providers.ts): legacy Alpha ids
// for the providers that had one, registry ids otherwise. `updated_at` doubles as the opaque
// configuration version the settings page compares test results against.

import { getServerSupabase } from '@/lib/supabase/server';

export interface UserLlm {
  provider: string;
  model: string;
  apiKeyCipher: string;
  /** ISO timestamp of the last write; the configuration version. */
  updatedAt: string | null;
}

export class LlmStoreError extends Error {
  constructor(public readonly kind: 'not_authenticated' | 'store_unavailable') {
    super(kind);
    this.name = 'LlmStoreError';
  }
}

async function userAndClient() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase: supabase as any, user };
}

/**
 * Returns the authenticated user's LLM settings, or null if there is no user
 * or no row has been persisted yet. A failed read is reported as "no row" here;
 * resolve.ts relies on that and the settings routes use readUserLlm() instead.
 */
export async function getUserLlm(): Promise<UserLlm | null> {
  try {
    return await readUserLlm();
  } catch {
    return null;
  }
}

/** Like getUserLlm() but tells no-user and a failed read apart (throws LlmStoreError). */
export async function readUserLlm(): Promise<UserLlm | null> {
  const { supabase, user } = await userAndClient();
  if (!user) throw new LlmStoreError('not_authenticated');

  const { data, error } = await supabase
    .from('llm_settings')
    .select('provider, model, api_key_cipher, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw new LlmStoreError('store_unavailable');
  if (!data) return null;

  return {
    provider: data.provider as string,
    model: data.model as string,
    apiKeyCipher: data.api_key_cipher as string,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
  };
}

/**
 * Upserts the authenticated user's LLM settings with a new ciphertext. The caller
 * encrypts via src/lib/llm/crypto.ts before invoking this function.
 */
export async function saveUserLlm(v: { storageId: string; model: string; apiKeyCipher: string }): Promise<{ version: string }> {
  const { supabase, user } = await userAndClient();
  if (!user) throw new LlmStoreError('not_authenticated');
  const version = new Date().toISOString();

  const { error } = await supabase
    .from('llm_settings')
    .upsert(
      {
        user_id: user.id,
        provider: v.storageId,
        model: v.model,
        api_key_cipher: v.apiKeyCipher,
        updated_at: version,
      },
      { onConflict: 'user_id' },
    );

  if (error) throw new LlmStoreError('store_unavailable');
  return { version };
}

/**
 * Atomically changes the model (and normalizes the stored provider id) of the user's existing row
 * for one of `providerCandidates`, keeping the ciphertext untouched. Returns null when no such row
 * exists, so a concurrent key rotation can never be overwritten with a stale ciphertext.
 */
export async function updateUserLlmModel(v: {
  storageId: string;
  providerCandidates: string[];
  model: string;
}): Promise<{ version: string } | null> {
  const { supabase, user } = await userAndClient();
  if (!user) throw new LlmStoreError('not_authenticated');
  const version = new Date().toISOString();

  const { data, error } = await supabase
    .from('llm_settings')
    .update({ provider: v.storageId, model: v.model, updated_at: version })
    .eq('user_id', user.id)
    .in('provider', v.providerCandidates)
    .select('updated_at');

  if (error) throw new LlmStoreError('store_unavailable');
  if (!Array.isArray(data) || data.length === 0) return null;
  return { version };
}
