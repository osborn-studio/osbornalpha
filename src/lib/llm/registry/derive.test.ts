import { describe, it, expect } from 'vitest';
import {
  deriveProviders,
  unsupportedProviders,
  authFor,
  endpointFor,
  providerById,
  resolveUrl,
  referencePrice,
  toMicroCny,
  NON_CHAT,
  registryProviders,
  registryModels,
} from './derive';
import fixture from './fixtures/alpha-derived.json';

describe('registry/derive (port of @osborn-pa/llm-registry derive.js)', () => {
  it("deriveProviders('alpha') reproduces the upstream derive.js output exactly, in order", () => {
    const derived = deriveProviders('alpha');
    expect(Object.keys(derived)).toEqual(Object.keys(fixture.providers));
    expect(derived).toEqual(fixture.providers);
  });

  it("unsupportedProviders('alpha') matches upstream (ollama is local-only)", () => {
    expect(unsupportedProviders('alpha')).toEqual(fixture.unsupported);
  });

  it('rejects unknown app ids', () => {
    expect(() => deriveProviders('nope')).toThrow(/unknown app/);
  });

  it('authFor returns the endpoint override when present, else the provider auth', () => {
    const gemini = providerById('gemini')!;
    expect(authFor(gemini, 'openai-chat-completions')).toEqual({ type: 'api-key', header: 'Authorization', prefix: 'Bearer ' });
    expect(authFor(gemini, 'gemini-generate-content')).toEqual({ type: 'api-key', header: 'x-goog-api-key', prefix: '' });
    expect(authFor(providerById('claude')!, 'anthropic-messages')).toEqual({ type: 'api-key', header: 'x-api-key', prefix: '' });
  });

  it('endpointFor prefers the default endpoint when the app speaks it, else the first spoken endpoint', () => {
    const doubao = providerById('doubao')!;
    expect(endpointFor('alpha', doubao)).toBe('openai-chat-completions');
    const claude = providerById('claude')!;
    expect(endpointFor('alpha', claude)).toBe('anthropic-messages');
    const gemini = providerById('gemini')!;
    // default is gemini-generate-content, which alpha does not speak → OpenAI-compatible path
    expect(endpointFor('alpha', gemini)).toBe('openai-chat-completions');
  });

  it('every derived provider carries the raw registry record for auth and discovery', () => {
    for (const id of Object.keys(fixture.providers)) {
      const p = providerById(id);
      expect(p).not.toBeNull();
      expect(p!.auth.type).toBe('api-key');
      const derived = (fixture.providers as Record<string, { endpoint: string }>)[id];
      const ep = p!.endpoints[derived.endpoint as keyof NonNullable<typeof p>["endpoints"]];
      expect(ep).toBeDefined();
      expect(ep!.discovery_path.startsWith('/')).toBe(true);
    }
  });

  it('resolveUrl is string concatenation with {model} percent-encoded', () => {
    const ep = { base_url: 'https://x.example/v1', chat_path: '/chat/completions', discovery_path: '/models' };
    expect(resolveUrl(ep, 'chat')).toBe('https://x.example/v1/chat/completions');
    expect(resolveUrl(ep, 'discovery')).toBe('https://x.example/v1/models');
    const g = { base_url: 'https://g.example/v1beta', chat_path: '/models/{model}:generateContent', discovery_path: '/models' };
    expect(resolveUrl(g, 'chat', { model: 'a/b c' })).toBe('https://g.example/v1beta/models/a%2Fb%20c:generateContent');
    expect(() => resolveUrl(g, 'chat')).toThrow(/model id required/);
    expect(() => resolveUrl(ep, 'bogus' as never)).toThrow(/unknown url kind/);
  });

  it('toMicroCny rounds and bounds', () => {
    expect(toMicroCny(0.15, 7.1)).toBe(1_065_000);
    expect(toMicroCny(0, 7.1)).toBe(0);
    expect(toMicroCny(-1, 7.1)).toBeNull();
    expect(toMicroCny(1e12, 7.1)).toBeNull();
  });

  it('referencePrice prefers the verified CNY price over the USD conversion', () => {
    const meta = { fetched_at: '2026-10-18', usd_cny: 7.1 };
    expect(referencePrice({ price_cny_micro: { input: 150000, output: 1500000, as_of: '2026-10-01' }, cost_usd: { input: 1, output: 2 } }, meta))
      .toEqual({ input: 150000, output: 1500000, as_of: '2026-10-01', reference: false });
    expect(referencePrice({ price_cny_micro: null, cost_usd: { input: 0.15, output: 0.6 } }, meta))
      .toEqual({ input: 1_065_000, output: 4_260_000, as_of: '2026-10-18', reference: true });
    expect(referencePrice({ price_cny_micro: null, cost_usd: null }, meta)).toBeNull();
    // zero is a legitimate (free) price, not a missing one
    expect(referencePrice({ price_cny_micro: null, cost_usd: { input: 0, output: 0 } }, meta))
      .toEqual({ input: 0, output: 0, as_of: '2026-10-18', reference: true });
  });

  it('referencePrice defaults to the bundled models.json meta', () => {
    const m = registryModels.providers.deepseek['deepseek-v4-flash'];
    expect(referencePrice(m)).toEqual({ input: 1_065_000, output: 4_260_000, as_of: registryModels.meta.fetched_at, reference: true });
  });

  it('NON_CHAT filters embeddings, audio, image and similar ids', () => {
    for (const id of ['text-embedding-3-small', 'whisper-1', 'dall-e-3', 'tts-1', 'gpt-4o-realtime-preview', 'omni-moderation-latest']) {
      expect(NON_CHAT.test(id)).toBe(true);
    }
    for (const id of ['deepseek-v4-flash', 'MiniMax-M3', 'kimi-k3', 'gpt-5.5']) {
      expect(NON_CHAT.test(id)).toBe(false);
    }
  });

  it('exposes the raw registry documents', () => {
    expect(registryProviders.schema).toBe('osborn-llm-registry/providers@1');
    expect(registryModels.schema).toBe('osborn-llm-registry/models@1');
    expect(registryProviders.providers.length).toBe(15);
  });
});
