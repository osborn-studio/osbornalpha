// Resolves the effective LLM configuration for the current request.
//
// Resolution order:
//   1. Per-user settings persisted in `llm_settings` (if a user is signed in
//      and has saved a provider + encrypted API key).
//   2. Process-level environment variables (LLM_PROVIDER / LLM_MODEL plus the
//      provider-specific *_API_KEY).
//   3. null — caller must handle "no LLM configured" gracefully.
//
// Provider ids: `provider` on the result is the registry id (doubao, kimi_cn, ...). Rows saved
// under the legacy Alpha ids (ark, kimi, minimax) and LLM_PROVIDER values using them resolve
// through the catalog aliases; the stored id is also what selects a legacy chat path (MiniMax).

import { getProvider, llmConfigFor, resolveProviderId } from './providers';
import { decrypt } from './crypto';
import { getUserLlm } from './settings-store';
import type { LlmConfig } from './openai-compat';

export interface ResolvedLlm extends LlmConfig {
  /** Registry provider id. */
  provider: string;
  protocol: 'openai' | 'anthropic';
  // 'user' = the caller's own API key (BYO) — billing must never quota-gate
  // or count these calls against the platform's free/pro limits.
  // 'env' = the platform's shared key — subject to quota.
  source: 'user' | 'env';
}

// Environment variable per registry id. Names are unchanged from before the registry.
const ENV_KEY: Record<string, string> = {
  doubao: 'ARK_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openai: 'OPENAI_API_KEY',
  kimi_cn: 'KIMI_API_KEY',
  minimax_cn: 'MINIMAX_API_KEY',
};

// Production preference is explicit and deterministic. DeepSeek is the
// reviewed default, while the remaining providers preserve a stable fallback
// order when operators configure a key without pinning LLM_PROVIDER.
const AUTO_PROVIDER_PREFERENCE = ['deepseek', 'doubao', 'openai', 'kimi_cn', 'minimax_cn'] as const;

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
        const model = u.model || def.platformDefaultModel || def.suggestedModel;
        if (model) {
          return {
            provider: def.id,
            ...llmConfigFor(def, { model, apiKey, storedProviderId: u.provider }),
            protocol: def.protocol,
            source: 'user',
          };
        }
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

export function resolvePlatformLlm(): ResolvedLlm | null {
  const explicitProvider = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const explicitId = explicitProvider ? resolveProviderId(explicitProvider) : null;
  if (explicitProvider && !explicitId) return null;
  const selectedProvider = explicitId || AUTO_PROVIDER_PREFERENCE.find((provider) => {
    const keyName = ENV_KEY[provider];
    return typeof process.env[keyName] === 'string' && process.env[keyName]!.trim().length > 0;
  });
  if (!selectedProvider) return null;

  const def = getProvider(selectedProvider);
  const keyName = def ? ENV_KEY[def.id] : undefined;
  const key = keyName ? process.env[keyName] : undefined;
  if (def && key?.trim()) {
    const model = process.env.LLM_MODEL || def.platformDefaultModel;
    if (!model) return null;
    return {
      provider: def.id,
      // Env configurations predate the registry: an unpinned or legacy-pinned provider keeps the
      // legacy chat path (MiniMax); only an explicit registry id opts into the registry path.
      ...llmConfigFor(def, { model, apiKey: key, storedProviderId: explicitProvider || def.legacyId || def.id }),
      protocol: def.protocol,
      source: 'env',
    };
  }

  // Nothing configured.
  return null;
}
