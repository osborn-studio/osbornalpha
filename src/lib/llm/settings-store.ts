// Server-only store for per-user LLM settings (provider, model, encrypted API key).
//
// The API key is stored as an AES-256-GCM ciphertext produced by src/lib/llm/crypto.ts.
// Plaintext keys never touch the database — encryption happens before insert/update
// and decryption only happens server-side in routes that need to call the provider.
//
// Row-level access is enforced both here (we always scope by the authenticated user)
// and in Postgres via the RLS policies in
// supabase/migrations/20260624090000_llm_settings.sql.

import { getServerSupabase } from '@/lib/supabase/server';

export interface UserLlm {
  provider: string;
  model: string;
  apiKeyCipher: string;
}

export type UserLlmSettingsClient = object;

export async function getUserLlmForUser(
  client: UserLlmSettingsClient,
  userId: string,
): Promise<UserLlm | null> {
  const repository = client as {
    from(name: 'llm_settings'): {
      select(columns: string): {
        eq(column: 'user_id', value: string): {
          maybeSingle(): Promise<{
            data: { provider: string; model: string; api_key_cipher: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await repository.from('llm_settings')
    .select('provider, model, api_key_cipher')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return { provider: data.provider, model: data.model, apiKeyCipher: data.api_key_cipher };
}

/**
 * Returns the authenticated user's LLM settings, or null if there is no user
 * or no row has been persisted yet.
 */
export async function getUserLlm(): Promise<UserLlm | null> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return getUserLlmForUser(supabase, user.id);
}

/**
 * Upserts the authenticated user's LLM settings. Throws if no user is signed in.
 * The caller is responsible for encrypting `apiKeyCipher` via src/lib/llm/crypto.ts
 * before invoking this function.
 */
export async function setUserLlm(v: UserLlm): Promise<void> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { error } = await (supabase as any)
    .from('llm_settings')
    .upsert(
      {
        user_id: user.id,
        provider: v.provider,
        model: v.model,
        api_key_cipher: v.apiKeyCipher,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
}
