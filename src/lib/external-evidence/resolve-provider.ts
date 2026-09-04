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
  return resolveEvidenceSearchProviders()[0] ?? null;
}

export function resolveEvidenceSearchProviders(): EvidenceSearchProvider[] {
  const explicit = process.env.SEARCH_PROVIDER?.trim().toLowerCase();
  if (explicit && !PREFERENCE.includes(explicit as SearchProviderId)) return [];
  const preferred = explicit as SearchProviderId | undefined;
  if (preferred && !process.env[KEYS[preferred]]?.trim()) return [];
  const ordered = preferred
    ? [preferred, ...PREFERENCE.filter((candidate) => candidate !== preferred)]
    : PREFERENCE;
  return ordered.flatMap((id) => {
    const apiKey = process.env[KEYS[id]]?.trim();
    return apiKey ? [FACTORIES[id](apiKey)] : [];
  });
}

export function isEvidenceSearchConfigured(): boolean {
  return resolveEvidenceSearchProvider() !== null;
}
