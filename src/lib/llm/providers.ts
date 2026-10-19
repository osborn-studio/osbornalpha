// Provider catalog derived from the cross-app LLM registry snapshot (src/lib/llm/registry/,
// design docs/superpowers/specs/2026-10-18-llm-registry-adoption-design.md).
//
// Runtime ids are registry ids (doubao, kimi_cn, minimax_cn, ...). Rows already saved in
// llm_settings with the legacy Alpha ids (ark, kimi, minimax) are resolved through
// `aliases.alpha` and are never migrated; those five providers keep writing their legacy id so an
// older build can still read the row (storageId).
//
// Alpha-side overrides on top of the registry, each with a reason:
//   - doubao uses the anthropic-messages endpoint (ARK coding plan keys only work at /api/coding).
//   - rows stored under the legacy id `minimax` keep the pre-registry chat path for every model (the
//     registry path is unverified for them); rows this build writes use `minimax_cn` and the new path.
// Auth comes from the registry per endpoint (authFor): gemini's OpenAI-compatible endpoint declares
// Bearer, claude declares x-api-key.

import {
  authFor,
  deriveProviders,
  providerById,
  registryModels,
  NON_CHAT,
  type EndpointType,
  type RegistryEndpoint,
  type RegistryProvider,
} from './registry/derive';

export type Protocol = 'openai' | 'anthropic';

export interface ProviderDef {
  /** Registry id, the runtime identity. */
  id: string;
  /** Legacy Alpha id (aliases.alpha) when one exists. */
  legacyId: string | null;
  /** Id written to llm_settings.provider: the legacy id when one exists (so an older build can read
   *  the row), except minimax_cn, whose stored id also encodes the chat-path generation. */
  storageId: string;
  label: string;
  baseUrl: string;
  chatPath: string;
  discoveryPath: string;
  protocol: Protocol;
  authHeader: string;
  authPrefix: string;
  /** Model used by the env fallback when LLM_MODEL is unset. Only the five legacy providers have one. */
  platformDefaultModel: string | null;
  /** Model preselected on the settings page. Reviewed pin or newest chat model in models.json. */
  suggestedModel: string | null;
  keyUrl: string | null;
  docsUrl: string | null;
  region: string;
}

/** Same rule as the PA models-list endpoint. */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,100}$/;

// --- Alpha-side overrides ---------------------------------------------------------------------

/** Endpoint type to use instead of what endpointFor('alpha') picks. */
const ENDPOINT_OVERRIDE: Record<string, EndpointType> = {
  doubao: 'anthropic-messages',
};

/** Chat path kept from before the registry, keyed by the stored provider id that selects it. */
const LEGACY_CHAT_PATH_BY_STORED_ID: Record<string, { provider: string; chatPath: string }> = {
  minimax: { provider: 'minimax_cn', chatPath: '/text/chatcompletion_v2' },
};

/** Providers whose storage id is the registry id even though a legacy alias exists. */
const STORE_REGISTRY_ID = new Set(['minimax_cn']);

/** Env-fallback defaults, byte for byte what providers.ts shipped before the registry. */
const PLATFORM_DEFAULT_MODEL: Record<string, string> = {
  doubao: 'doubao-seed-code',
  deepseek: 'deepseek-v4-flash',
  openai: 'gpt-4o',
  kimi_cn: 'moonshot-v1-32k',
  minimax_cn: 'MiniMax-Text-01',
};

/** Reviewed settings-page suggestions that must not drift with models.json. */
const SUGGESTED_MODEL_PIN: Record<string, string> = {
  deepseek: 'deepseek-v4-flash', // the reviewed platform default
  doubao: 'doubao-seed-code', // the doubao catalog entries are hand-written overrides without release dates
};

/** Newest chat model in models.json for a provider: latest release_date, ties by id, undated last. */
export function newestCatalogModel(providerId: string): string | null {
  const catalog = registryModels.providers[providerId];
  if (!catalog) return null;
  let best: { id: string; date: string } | null = null;
  for (const [id, m] of Object.entries(catalog)) {
    if (NON_CHAT.test(id)) continue;
    const date = m.release_date ?? '';
    if (!best || date > best.date || (date === best.date && id < best.id)) best = { id, date };
  }
  return best?.id ?? null;
}

function build(p: RegistryProvider, derived: { protocol: string; endpoint: EndpointType; alias: string | null }): ProviderDef {
  const endpointType = ENDPOINT_OVERRIDE[p.id] ?? derived.endpoint;
  const endpoint = p.endpoints[endpointType] as RegistryEndpoint;
  const protocol: Protocol = endpointType === 'anthropic-messages' ? 'anthropic' : 'openai';
  const auth = authFor(p, endpointType);
  const registryAuth = auth.type === 'api-key' ? auth : { header: 'Authorization', prefix: 'Bearer ' };
  const legacyId = derived.alias;
  return {
    id: p.id,
    legacyId,
    storageId: legacyId && !STORE_REGISTRY_ID.has(p.id) ? legacyId : p.id,
    label: p.label.zh,
    baseUrl: endpoint.base_url,
    chatPath: endpoint.chat_path,
    discoveryPath: endpoint.discovery_path,
    protocol,
    authHeader: registryAuth.header,
    authPrefix: registryAuth.prefix,
    platformDefaultModel: PLATFORM_DEFAULT_MODEL[p.id] ?? null,
    suggestedModel: SUGGESTED_MODEL_PIN[p.id] ?? newestCatalogModel(p.id),
    keyUrl: p.links?.api_key ?? null,
    docsUrl: p.links?.docs ?? null,
    region: p.region,
  };
}

const derivedAlpha = deriveProviders('alpha');

export const PROVIDERS: Record<string, ProviderDef> = Object.fromEntries(
  Object.entries(derivedAlpha).map(([id, d]) => [id, build(providerById(id)!, d)]),
);

export const PROVIDER_IDS: string[] = Object.keys(PROVIDERS);

const BY_ALIAS = new Map<string, string>();
for (const def of Object.values(PROVIDERS)) {
  if (def.legacyId) BY_ALIAS.set(def.legacyId, def.id);
}

/** Registry id for a registry id or a legacy Alpha id; null when unknown. */
export function resolveProviderId(idOrAlias: string): string | null {
  if (typeof idOrAlias !== 'string' || !idOrAlias) return null;
  if (Object.hasOwn(PROVIDERS, idOrAlias)) return idOrAlias;
  return BY_ALIAS.get(idOrAlias) ?? null;
}

export function getProvider(idOrAlias: string): ProviderDef | null {
  const id = resolveProviderId(idOrAlias);
  return id ? PROVIDERS[id] : null;
}

/**
 * Chat path for a provider given the id the row (or LLM_PROVIDER) was stored under: the registry
 * path unless that stored id selects a legacy path.
 */
export function chatPathFor(def: ProviderDef, storedProviderId: string | null | undefined): string {
  const legacy = storedProviderId ? LEGACY_CHAT_PATH_BY_STORED_ID[storedProviderId] : undefined;
  return legacy && legacy.provider === def.id ? legacy.chatPath : def.chatPath;
}

export interface LlmConfigInput {
  model: string;
  apiKey: string;
  /** The id the configuration was stored under (llm_settings.provider or LLM_PROVIDER). */
  storedProviderId?: string | null;
}

/** The adapter configuration for a provider. Shared by resolve.ts and the settings-page probe. */
export function llmConfigFor(def: ProviderDef, input: LlmConfigInput) {
  return {
    baseUrl: def.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    chatPath: chatPathFor(def, input.storedProviderId),
    authHeader: def.authHeader,
    authPrefix: def.authPrefix,
  };
}
