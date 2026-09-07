import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveEvidenceSearchProvider, resolveEvidenceSearchProviders } from './resolve-provider';

const KEYS = ['SEARCH_PROVIDER', 'TAVILY_API_KEY', 'BRAVE_SEARCH_API_KEY', 'SERPER_API_KEY', 'OPENAI_API_KEY'] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('evidence search provider resolution', () => {
  it('uses a deterministic automatic preference', () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave';
    process.env.TAVILY_API_KEY = 'tavily';
    expect(resolveEvidenceSearchProvider()?.id).toBe('tavily');
    expect(resolveEvidenceSearchProviders().map((provider) => provider.id)).toEqual(['tavily', 'brave']);
  });

  it('keeps an explicit provider first while retaining configured failovers', () => {
    process.env.SEARCH_PROVIDER = 'brave';
    process.env.BRAVE_SEARCH_API_KEY = 'brave';
    process.env.TAVILY_API_KEY = 'tavily';
    expect(resolveEvidenceSearchProviders().map((provider) => provider.id)).toEqual(['brave', 'tavily']);
  });

  it('uses the model-routed web search adapter as the final configured fallback', () => {
    process.env.OPENAI_API_KEY = 'openai';
    expect(resolveEvidenceSearchProvider()?.id).toBe('openai');
    process.env.BRAVE_SEARCH_API_KEY = 'brave';
    expect(resolveEvidenceSearchProviders().map((provider) => provider.id)).toEqual(['brave', 'openai']);
  });

  it('supports explicitly selecting OpenAI web search', () => {
    process.env.SEARCH_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'openai';
    process.env.TAVILY_API_KEY = 'tavily';
    expect(resolveEvidenceSearchProviders().map((provider) => provider.id)).toEqual(['openai', 'tavily']);
  });

  it('fails closed when an explicitly pinned provider lacks its own key', () => {
    process.env.SEARCH_PROVIDER = 'brave';
    process.env.TAVILY_API_KEY = 'tavily';
    expect(resolveEvidenceSearchProvider()).toBeNull();
  });

  it('returns null for unknown providers', () => {
    process.env.SEARCH_PROVIDER = 'unknown';
    process.env.TAVILY_API_KEY = 'tavily';
    expect(resolveEvidenceSearchProvider()).toBeNull();
  });
});
