import { describe, it, expect } from 'vitest';
import { PROVIDERS, PROVIDER_IDS, getProvider, type ProviderId } from './providers';

describe('llm/providers', () => {
  const expectedIds: ProviderId[] = ['ark', 'deepseek', 'openai', 'kimi', 'minimax'];

  it('contains all 5 expected ids in PROVIDERS', () => {
    for (const id of expectedIds) {
      expect(PROVIDERS[id]).toBeDefined();
      expect(PROVIDERS[id].id).toBe(id);
    }
    expect(Object.keys(PROVIDERS).sort()).toEqual([...expectedIds].sort());
  });

  it('contains all 5 expected ids in PROVIDER_IDS', () => {
    expect([...PROVIDER_IDS].sort()).toEqual([...expectedIds].sort());
    expect(PROVIDER_IDS).toHaveLength(5);
  });

  it('every provider has a baseUrl starting with https://', () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].baseUrl.startsWith('https://')).toBe(true);
    }
  });

  it('every provider has non-empty defaultModel and chatPath', () => {
    for (const id of PROVIDER_IDS) {
      const def = PROVIDERS[id];
      expect(typeof def.defaultModel).toBe('string');
      expect(def.defaultModel.length).toBeGreaterThan(0);
      expect(typeof def.chatPath).toBe('string');
      expect(def.chatPath.length).toBeGreaterThan(0);
    }
  });

  it('every provider has a non-empty label', () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].label.length).toBeGreaterThan(0);
    }
  });

  it('getProvider returns the def for a known id', () => {
    for (const id of PROVIDER_IDS) {
      const def = getProvider(id);
      expect(def).not.toBeNull();
      expect(def).toBe(PROVIDERS[id]);
    }
  });

  it('getProvider returns null for "bogus"', () => {
    expect(getProvider('bogus')).toBeNull();
  });

  it('getProvider returns null for empty string', () => {
    expect(getProvider('')).toBeNull();
  });
});
