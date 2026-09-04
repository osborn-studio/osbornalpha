import type { EvidenceSearchProvider } from './types';
import { createBraveProvider } from './providers/brave';
import { createSerperProvider } from './providers/serper';
import { createTavilyProvider } from './providers/tavily';

type SearchProviderId = 'tavily' | 'brave' | 'serper';

const KEYS: Record<SearchProviderId, string> = {
  tavily: 'TAVILY_API_KEY',
  brave: 'BRAVE_SEARCH_API_KEY',
  serper: 'SERPER_API_KEY',
};

const FACTORIES: Record<SearchProviderId, (apiKey: string) => EvidenceSearchProvider> = {
  tavily: createTavilyProvider,
  brave: createBraveProvider,
  serper: createSerperProvider,
};

const PREFERENCE: SearchProviderId[] = ['tavily', 'brave', 'serper'];

export function resolveEvidenceSearchProvider(): EvidenceSearchProvider | null {
  const explicit = process.env.SEARCH_PROVIDER?.trim().toLowerCase();
  const id = explicit
    ? (PREFERENCE.includes(explicit as SearchProviderId) ? explicit as SearchProviderId : null)
    : PREFERENCE.find((candidate) => Boolean(process.env[KEYS[candidate]]?.trim())) ?? null;
  if (!id) return null;
  const apiKey = process.env[KEYS[id]]?.trim();
  return apiKey ? FACTORIES[id](apiKey) : null;
}

export function isEvidenceSearchConfigured(): boolean {
  return resolveEvidenceSearchProvider() !== null;
}
