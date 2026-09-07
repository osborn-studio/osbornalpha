import type { EvidenceSearchProvider } from './types';
import { createBraveProvider } from './providers/brave';
import { createSerperProvider } from './providers/serper';
import { createTavilyProvider } from './providers/tavily';
import { createOpenAIWebSearchProvider } from './providers/openai-web-search';

type SearchProviderId = 'tavily' | 'brave' | 'serper' | 'openai';
type Environment = Record<string, string | undefined>;

const KEYS: Record<SearchProviderId, string> = {
  tavily: 'TAVILY_API_KEY',
  brave: 'BRAVE_SEARCH_API_KEY',
  serper: 'SERPER_API_KEY',
  openai: 'OPENAI_API_KEY',
};

const FACTORIES: Record<SearchProviderId, (apiKey: string, environment: Environment) => EvidenceSearchProvider> = {
  tavily: createTavilyProvider,
  brave: createBraveProvider,
  serper: createSerperProvider,
  openai: (apiKey, environment) => createOpenAIWebSearchProvider(apiKey, {
    model: environment.OPENAI_WEB_SEARCH_MODEL,
  }),
};

const PREFERENCE: SearchProviderId[] = ['tavily', 'brave', 'serper', 'openai'];

export function resolveEvidenceSearchProvider(environment: Environment = process.env): EvidenceSearchProvider | null {
  return resolveEvidenceSearchProviders(environment)[0] ?? null;
}

export function resolveEvidenceSearchProviders(environment: Environment = process.env): EvidenceSearchProvider[] {
  const explicit = environment.SEARCH_PROVIDER?.trim().toLowerCase();
  if (explicit && !PREFERENCE.includes(explicit as SearchProviderId)) return [];
  const preferred = explicit as SearchProviderId | undefined;
  if (preferred && !environment[KEYS[preferred]]?.trim()) return [];
  const ordered = preferred
    ? [preferred, ...PREFERENCE.filter((candidate) => candidate !== preferred)]
    : PREFERENCE;
  return ordered.flatMap((id) => {
    const apiKey = environment[KEYS[id]]?.trim();
    return apiKey ? [FACTORIES[id](apiKey, environment)] : [];
  });
}

export function isEvidenceSearchConfigured(environment: Environment = process.env): boolean {
  return resolveEvidenceSearchProvider(environment) !== null;
}
