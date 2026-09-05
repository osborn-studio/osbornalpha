// Resolves the effective LLM configuration for the current request.
//
// Resolution order:
//   1. Per-user settings persisted in `llm_settings` (if a user is signed in
//      and has saved a provider + encrypted API key).
//   2. Process-level environment variables (LLM_PROVIDER / LLM_MODEL plus the
//      provider-specific *_API_KEY).
//   3. null — caller must handle "no LLM configured" gracefully.

import { getProvider } from './providers';
import { decrypt } from './crypto';
import { getUserLlm, getUserLlmForUser, type UserLlmSettingsClient } from './settings-store';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { LlmConfig } from './openai-compat';

export interface ResolvedLlm extends LlmConfig {
  provider: string;
  protocol: 'openai' | 'anthropic';
  // 'user' = the caller's own API key (BYO) — billing must never quota-gate
  // or count these calls against the platform's free/pro limits.
  // 'env' = the platform's shared key — subject to quota.
  source: 'user' | 'env';
}

const ENV_KEY: Record<string, string> = {
  ark: 'ARK_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openai: 'OPENAI_API_KEY',
  kimi: 'KIMI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
};

// Production preference is explicit and deterministic. DeepSeek is the
// reviewed default, while the remaining providers preserve a stable fallback
// order when operators configure a key without pinning LLM_PROVIDER.
const AUTO_PROVIDER_PREFERENCE = ['deepseek', 'ark', 'openai', 'kimi', 'minimax'] as const;

/**
 * Resolve only the authenticated user's own key. User-triggered features that
 * are outside the platform metering matrix must use this boundary so they can
 * never silently spend the shared environment credential.
 */
export async function resolveUserLlm(): Promise<ResolvedLlm | null> {
  const u = await getUserLlm();
  if (u) {
    const def = getProvider(u.provider);
    if (def) {
      let apiKey: string | null = null;
      try {
        apiKey = decrypt(u.apiKeyCipher);
      } catch {
        apiKey = null;
      }
      if (apiKey) {
        return {
          provider: u.provider,
          baseUrl: def.baseUrl,
          model: u.model || def.defaultModel,
          apiKey,
          chatPath: def.chatPath,
          protocol: def.protocol,
          source: 'user',
        };
      }
    }
  }
  return null;
}

export async function resolveLlm(): Promise<ResolvedLlm | null> {
  // (1) Per-user settings take precedence.
  const user = await resolveUserLlm();
  if (user) return user;

  // (2) Environment fallback.
  return resolvePlatformLlm();
}

export async function resolveLlmForUser(
  userId: string,
  client: UserLlmSettingsClient = getAdminSupabase(),
): Promise<ResolvedLlm | null> {
  const user = await getUserLlmForUser(client, userId);
  if (user) {
    const definition = getProvider(user.provider);
    let apiKey: string | null = null;
    try { apiKey = decrypt(user.apiKeyCipher); } catch { apiKey = null; }
    if (definition && apiKey) {
      return {
        provider: user.provider,
        baseUrl: definition.baseUrl,
        model: user.model || definition.defaultModel,
        apiKey,
        chatPath: definition.chatPath,
        protocol: definition.protocol,
        source: 'user',
      };
    }
  }
  return resolvePlatformLlm();
}

export function resolvePlatformLlm(): ResolvedLlm | null {
  const explicitProvider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const selectedProvider = explicitProvider || AUTO_PROVIDER_PREFERENCE.find((provider) => {
    const keyName = ENV_KEY[provider];
    return typeof process.env[keyName] === 'string' && process.env[keyName]!.trim().length > 0;
  });
  if (!selectedProvider) return null;

  const def = getProvider(selectedProvider);
  const key = def ? process.env[ENV_KEY[def.id]] : undefined;
  if (def && key?.trim()) {
    return {
      provider: def.id,
      baseUrl: def.baseUrl,
      model: process.env.LLM_MODEL || def.defaultModel,
      apiKey: key,
      chatPath: def.chatPath,
      protocol: def.protocol,
      source: 'env',
    };
  }

  // Nothing configured.
  return null;
}
