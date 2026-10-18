import { describe, it, expect } from 'vitest';
import {
  PROVIDERS,
  PROVIDER_IDS,
  getProvider,
  resolveProviderId,
  chatPathFor,
  llmConfigFor,
  MODEL_ID_PATTERN,
  type ProviderDef,
} from './providers';
import fixture from './registry/fixtures/alpha-derived.json';
import { registryModels, NON_CHAT } from './registry/derive';

const LEGACY: Array<[string, string]> = [
  ['ark', 'doubao'],
  ['deepseek', 'deepseek'],
  ['openai', 'openai'],
  ['kimi', 'kimi_cn'],
  ['minimax', 'minimax_cn'],
];

describe('llm/providers (derived from the registry snapshot)', () => {
  it("exposes every deriveProviders('alpha') provider in registry order", () => {
    expect(PROVIDER_IDS).toEqual(Object.keys(fixture.providers));
    expect(Object.keys(PROVIDERS)).toEqual(PROVIDER_IDS);
    for (const id of PROVIDER_IDS) expect(PROVIDERS[id].id).toBe(id);
  });

  it('resolves the five legacy ids through aliases.alpha; four keep the legacy id as storage id', () => {
    for (const [legacy, canonical] of LEGACY) {
      expect(resolveProviderId(legacy)).toBe(canonical);
      expect(resolveProviderId(canonical)).toBe(canonical);
      const def = getProvider(legacy)!;
      expect(def.id).toBe(canonical);
      expect(def.legacyId).toBe(legacy);
      expect(def.storageId).toBe(canonical === 'minimax_cn' ? 'minimax_cn' : legacy);
      expect(getProvider(canonical)).toBe(def);
    }
    expect(getProvider('zhipu')!.legacyId).toBeNull();
    expect(getProvider('zhipu')!.storageId).toBe('zhipu');
  });

  it('returns null for unknown, empty, prototype-property and local-only ids', () => {
    expect(getProvider('bogus')).toBeNull();
    expect(getProvider('')).toBeNull();
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(resolveProviderId(bad)).toBeNull();
      expect(getProvider(bad)).toBeNull();
    }
    expect(getProvider(undefined as unknown as string)).toBeNull();
    expect(getProvider('ollama')).toBeNull();
    expect(resolveProviderId('ollama')).toBeNull();
  });

  it('keeps the four unchanged legacy endpoints byte for byte', () => {
    const expected: Record<string, [string, string, 'openai' | 'anthropic']> = {
      ark: ['https://ark.cn-beijing.volces.com/api/coding', '/v1/messages', 'anthropic'],
      deepseek: ['https://api.deepseek.com', '/chat/completions', 'openai'],
      openai: ['https://api.openai.com/v1', '/chat/completions', 'openai'],
      kimi: ['https://api.moonshot.cn/v1', '/chat/completions', 'openai'],
    };
    for (const [legacy, [base, path, protocol]] of Object.entries(expected)) {
      const def = getProvider(legacy)!;
      expect(def.baseUrl).toBe(base);
      expect(def.chatPath).toBe(path);
      expect(def.protocol).toBe(protocol);
    }
  });

  it('ARK coding plan explicitly uses the doubao anthropic-messages endpoint, not the registry default', () => {
    const def = getProvider('ark')!;
    expect(fixture.providers.doubao.endpoint).toBe('openai-chat-completions');
    expect(def.protocol).toBe('anthropic');
    expect(def.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/coding');
    expect(def.chatPath).toBe('/v1/messages');
    expect(def.discoveryPath).toBe('/v1/models');
    expect(def.authHeader).toBe('Authorization');
    expect(def.authPrefix).toBe('Bearer ');
  });

  it('MiniMax: rows stored under the legacy id keep the legacy path for any model; new rows use the registry path', () => {
    const def = getProvider('minimax')!;
    expect(def.baseUrl).toBe('https://api.minimaxi.com/v1');
    expect(def.chatPath).toBe('/chat/completions');
    expect(def.storageId).toBe('minimax_cn');
    expect(chatPathFor(def, 'minimax')).toBe('/text/chatcompletion_v2');
    expect(chatPathFor(def, 'minimax_cn')).toBe('/chat/completions');
    expect(chatPathFor(def, null)).toBe('/chat/completions');
    expect(chatPathFor(getProvider('minimax_intl')!, 'minimax')).toBe('/chat/completions');
    expect(chatPathFor(getProvider('deepseek')!, 'minimax')).toBe('/chat/completions');
  });

  it('llmConfigFor builds the adapter config shared by resolve and the probe', () => {
    const def = getProvider('minimax')!;
    expect(llmConfigFor(def, { model: 'abc', apiKey: 'k', storedProviderId: 'minimax' })).toEqual({
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'k',
      model: 'abc',
      chatPath: '/text/chatcompletion_v2',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
    });
    expect(llmConfigFor(getProvider('claude')!, { model: 'c', apiKey: 'k' })).toEqual({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'k',
      model: 'c',
      chatPath: '/v1/messages',
      authHeader: 'x-api-key',
      authPrefix: '',
    });
  });

  it('platform default models for the five env-fallback providers are unchanged', () => {
    expect(getProvider('ark')!.platformDefaultModel).toBe('doubao-seed-code');
    expect(getProvider('deepseek')!.platformDefaultModel).toBe('deepseek-v4-flash');
    expect(getProvider('openai')!.platformDefaultModel).toBe('gpt-4o');
    expect(getProvider('kimi')!.platformDefaultModel).toBe('moonshot-v1-32k');
    expect(getProvider('minimax')!.platformDefaultModel).toBe('MiniMax-Text-01');
    for (const id of PROVIDER_IDS) {
      if (!LEGACY.some(([, c]) => c === id)) expect(PROVIDERS[id].platformDefaultModel).toBeNull();
    }
  });

  it('suggested models: reviewed pins for deepseek and doubao, newest chat model elsewhere, null when the catalog is empty', () => {
    expect(getProvider('deepseek')!.suggestedModel).toBe('deepseek-v4-flash');
    expect(getProvider('doubao')!.suggestedModel).toBe('doubao-seed-code');
    expect(registryModels.providers.doubao).toBeUndefined();
    for (const id of PROVIDER_IDS) {
      const def = PROVIDERS[id];
      const catalog = registryModels.providers[id];
      if (id === 'deepseek' || id === 'doubao') continue;
      if (!catalog) {
        expect(def.suggestedModel).toBeNull();
        continue;
      }
      const chat = Object.entries(catalog).filter(([mid]) => !NON_CHAT.test(mid));
      const newest = chat
        .slice()
        .sort(([ai, a], [bi, b]) => {
          const ad = a.release_date ?? '';
          const bd = b.release_date ?? '';
          if (ad !== bd) return ad > bd ? -1 : 1;
          return ai < bi ? -1 : ai > bi ? 1 : 0;
        })[0]?.[0] ?? null;
      expect(def.suggestedModel).toBe(newest);
      if (def.suggestedModel) expect(NON_CHAT.test(def.suggestedModel)).toBe(false);
    }
    expect(getProvider('minimax')!.suggestedModel).toBe('MiniMax-M3');
  });

  it('auth: openai-protocol providers always use Bearer; anthropic-protocol providers use the registry auth', () => {
    for (const id of PROVIDER_IDS) {
      const def = PROVIDERS[id];
      if (def.protocol === 'openai') {
        expect(def.authHeader).toBe('Authorization');
        expect(def.authPrefix).toBe('Bearer ');
      }
    }
    // gemini's registry auth is x-goog-api-key, but its OpenAI-compatible endpoint takes Bearer
    expect(getProvider('gemini')!.authHeader).toBe('Authorization');
    expect(getProvider('claude')!.protocol).toBe('anthropic');
    expect(getProvider('claude')!.authHeader).toBe('x-api-key');
    expect(getProvider('claude')!.authPrefix).toBe('');
  });

  it('every provider has https base, slash-prefixed paths, a label, links and a region', () => {
    for (const id of PROVIDER_IDS) {
      const def: ProviderDef = PROVIDERS[id];
      expect(def.baseUrl.startsWith('https://')).toBe(true);
      expect(def.baseUrl.endsWith('/')).toBe(false);
      expect(def.chatPath.startsWith('/')).toBe(true);
      expect(def.discoveryPath.startsWith('/')).toBe(true);
      expect(def.label.length).toBeGreaterThan(0);
      expect(['cn', 'intl', 'us']).toContain(def.region);
      expect(['openai', 'anthropic']).toContain(def.protocol);
      expect(def.keyUrl === null || def.keyUrl.startsWith('https://')).toBe(true);
    }
    expect(getProvider('deepseek')!.keyUrl).toBe('https://platform.deepseek.com/api_keys');
  });

  it('MODEL_ID_PATTERN matches the PA models-list rule', () => {
    for (const ok of ['deepseek-v4-flash', 'MiniMax-Text-01', 'gpt-4o-2024-08-06', 'qwen/qwen3:latest', 'a']) {
      expect(MODEL_ID_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of ['', ' x', 'a b', 'x'.repeat(101), 'model\n', '模型']) {
      expect(MODEL_ID_PATTERN.test(bad)).toBe(false);
    }
  });
});
