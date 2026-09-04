import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveEvidenceSearchProvider } from './resolve-provider';

const KEYS = ['SEARCH_PROVIDER', 'TAVILY_API_KEY', 'BRAVE_SEARCH_API_KEY', 'SERPER_API_KEY'] as const;
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
