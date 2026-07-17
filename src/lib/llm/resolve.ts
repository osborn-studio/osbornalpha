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
import { getUserLlm } from './settings-store';
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

export async function resolveLlm(): Promise<ResolvedLlm | null> {
  // (1) Per-user settings take precedence.
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

  // (2) Environment fallback.
  return resolvePlatformLlm();
}

export function resolvePlatformLlm(): ResolvedLlm | null {
  const envProvider = process.env.LLM_PROVIDER || 'ark';
  const def = getProvider(envProvider);
  const key = def ? process.env[ENV_KEY[def.id]] : undefined;
  if (def && key) {
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
