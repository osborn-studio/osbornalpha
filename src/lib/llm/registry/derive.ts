// TypeScript port of @osborn-pa/llm-registry src/derive.js + src/model-filter.js, restricted to
// what Alpha consumes. Pure functions over the bundled JSON snapshot (see SOURCE.md); no network,
// no secrets. `derive.test.ts` asserts `deriveProviders('alpha')` reproduces the upstream output
// byte for byte (fixtures/alpha-derived.json). Replace with the published package when it exists.

import providersDoc from './providers.json';
import modelsDoc from './models.json';

export type EndpointType = 'openai-chat-completions' | 'openai-responses' | 'anthropic-messages' | 'gemini-generate-content';

export type RegistryAuth = { type: 'api-key'; header: string; prefix: string } | { type: 'none' };

export interface RegistryEndpoint {
  base_url: string;
  chat_path: string;
  discovery_path: string;
  stream_chat_path?: string;
  /** Endpoint-level override of the provider's auth (added upstream after Alpha's feedback, 2026-10-18). */
  auth?: RegistryAuth;
  dialect?: {
    stream_options?: boolean;
    developer_role?: boolean;
    reasoning_split?: boolean;
    temperature?: boolean;
    thinking_disable?: { path: string; value: unknown } | null;
  };
}

export interface RegistryProvider {
  id: string;
  label: { zh: string; en: string };
  region: 'cn' | 'intl' | 'us' | 'local';
  editions: string[];
  aliases?: Record<string, string>;
  sources?: Record<string, string>;
  secret: { id: string; env: string[]; required: boolean };
  auth: RegistryAuth;
  endpoints: Partial<Record<EndpointType, RegistryEndpoint>>;
  default_endpoint: EndpointType;
  links?: { docs?: string; api_key?: string; models?: string };
  status: 'active' | 'deprecated';
}

export interface RegistryModel {
  source: string;
  context: number;
  output: number;
  structured_output: boolean;
  reasoning: boolean;
  cost_usd: { input: number; output: number } | null;
  release_date?: string | null;
  capabilities?: Record<string, unknown>;
  price_cny_micro: { input: number; output: number; as_of: string } | null;
  response_model: string | null;
  response_model_verified_at: string | null;
  hint_zh: string | null;
}

export interface RegistryModelsDoc {
  schema: string;
  meta: { source: string; fetched_at: string; usd_cny: number; generator: string };
  providers: Record<string, Record<string, RegistryModel>>;
}

export const registryProviders = providersDoc as unknown as {
  schema: string;
  updated_at: string;
  endpoint_types: EndpointType[];
  providers: RegistryProvider[];
};
export const registryModels = modelsDoc as unknown as RegistryModelsDoc;

const byId = new Map(registryProviders.providers.map((p) => [p.id, p]));
export function providerById(id: string): RegistryProvider | null {
  return byId.get(id) ?? null;
}

/** url = base_url + path, with {model} percent-encoded. String concatenation by design (URL resolution would eat /v1). */
export function resolveUrl(
  endpoint: Pick<RegistryEndpoint, 'base_url' | 'chat_path' | 'discovery_path' | 'stream_chat_path'>,
  which: 'chat' | 'stream_chat' | 'discovery',
  { model }: { model?: string } = {},
): string {
  const path = which === 'chat'
    ? endpoint.chat_path
    : which === 'stream_chat'
      ? (endpoint.stream_chat_path ?? endpoint.chat_path)
      : which === 'discovery'
        ? endpoint.discovery_path
        : null;
  if (typeof path !== 'string') throw new Error(`unknown url kind: ${which}`);
  if (path.includes('{model}')) {
    if (typeof model !== 'string' || !model) throw new Error('model id required for this endpoint path');
    return endpoint.base_url + path.split('{model}').join(encodeURIComponent(model));
  }
  return endpoint.base_url + path;
}

// Which endpoint types each app's L1 adapters implement, and the protocol name that app uses for them.
const APP_PROTOCOLS: Record<string, Partial<Record<EndpointType, string>>> = {
  pa: { 'openai-chat-completions': 'openai_compatible', 'gemini-generate-content': 'gemini' },
  // OsbornAlpha: src/lib/llm/{openai-compat,anthropic-compat}.ts; BYOK per user, env fallback.
  alpha: { 'openai-chat-completions': 'openai', 'anthropic-messages': 'anthropic' },
};
function appRules(appId: string) {
  const r = APP_PROTOCOLS[appId];
  if (!r) throw new Error(`unknown app: ${appId}`);
  return r;
}

/** Auth for one endpoint: the endpoint's own override when present, else the provider's. */
export function authFor(p: RegistryProvider, endpointType: EndpointType): RegistryAuth {
  return p.endpoints[endpointType]?.auth ?? p.auth;
}

/** The endpoint an app should use for a provider: its default when the app speaks it, else the first endpoint the app does speak. */
export function endpointFor(appId: string, p: RegistryProvider): EndpointType | null {
  const protocols = appRules(appId);
  if (protocols[p.default_endpoint]) return p.default_endpoint;
  return (Object.keys(p.endpoints) as EndpointType[]).find((t) => protocols[t]) ?? null;
}

export interface DerivedProvider {
  protocol: string;
  endpoint: EndpointType;
  base: string;
  chat_path: string;
  keys: string[];
  label: string;
  region: string;
  stream_usage: boolean;
  alias: string | null;
  auth: RegistryAuth;
}

/** Providers the app can call today, in the app's legacy catalog shape. Same key order as the registry. */
export function deriveProviders(appId: string): Record<string, DerivedProvider> {
  const protocols = appRules(appId);
  const out: Record<string, DerivedProvider> = {};
  for (const p of registryProviders.providers) {
    if (p.status !== 'active' || p.region === 'local') continue;
    const type = endpointFor(appId, p);
    if (!type) continue;
    const e = p.endpoints[type]!;
    out[p.id] = {
      protocol: protocols[type]!,
      endpoint: type,
      base: e.base_url,
      chat_path: e.chat_path,
      keys: [...p.secret.env],
      label: p.label.zh,
      region: p.region,
      stream_usage: e.dialect?.stream_options !== false,
      alias: p.aliases?.[appId] ?? null,
      auth: { ...authFor(p, type) },
    };
  }
  return out;
}

/** Providers in the registry the app cannot use, with a stable reason for the settings page. */
export function unsupportedProviders(appId: string): Array<{ id: string; reason: 'local_only' | 'unsupported_endpoint_type' }> {
  appRules(appId);
  const out: Array<{ id: string; reason: 'local_only' | 'unsupported_endpoint_type' }> = [];
  for (const p of registryProviders.providers) {
    if (p.status !== 'active') continue;
    if (p.region === 'local') out.push({ id: p.id, reason: 'local_only' });
    else if (!endpointFor(appId, p)) out.push({ id: p.id, reason: 'unsupported_endpoint_type' });
  }
  return out;
}

// ---- Prices (design §4) ------------------------------------------------------------------------
/** USD per million tokens → integer micro-CNY per million tokens, or null when out of range. */
export function toMicroCny(usd: number, rate: number): number | null {
  const m = Math.round(usd * rate * 1e6);
  return Number.isSafeInteger(m) && m >= 0 && m <= 1_000_000_000_000 ? m : null;
}

export interface ReferencePrice {
  input: number;
  output: number;
  as_of: string;
  /** true when converted from models.dev USD (reference only), false when a verified CNY price. */
  reference: boolean;
}

/** Price precedence: price_cny_micro (verified) > cost_usd × usd_cny (reference) > null. */
export function referencePrice(
  m: Pick<RegistryModel, 'price_cny_micro' | 'cost_usd'>,
  meta: { fetched_at: string; usd_cny: number } = registryModels.meta,
): ReferencePrice | null {
  if (m.price_cny_micro) {
    return { input: m.price_cny_micro.input, output: m.price_cny_micro.output, as_of: m.price_cny_micro.as_of, reference: false };
  }
  if (m.cost_usd) {
    const i = toMicroCny(m.cost_usd.input, meta.usd_cny);
    const o = toMicroCny(m.cost_usd.output, meta.usd_cny);
    if (i !== null && o !== null) return { input: i, output: o, as_of: meta.fetched_at, reference: true };
  }
  return null;
}

// One chat-model filter shared by every consumer (upstream src/model-filter.js).
export const NON_CHAT = /embedding|embed|tts|whisper|audio|transcri|image|dall|realtime|moderation|rerank|vision-only|live|veo|lyria|deep-research|computer-use/i;
