import { canonicalizeSecurityTicker } from '@/lib/watchlist/security-validation';

interface CopilotSecurityResult {
  t: string;
  match_kind?: string;
  selectable?: boolean;
  verification_status?: string;
}

type CopilotSecuritySearch = (
  query: string,
  limit: number,
) => Promise<CopilotSecurityResult[]>;

const EXACT_MATCH_KINDS = new Set([
  'exact',
  'exact_alias',
  'exact_name',
  'exact_symbol',
  'exact_ticker',
]);

export function normalizeCopilotTicker(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return canonicalizeSecurityTicker(value);
}

export async function resolveCopilotTicker(
  value: unknown,
  search: CopilotSecuritySearch,
): Promise<string | null> {
  const direct = normalizeCopilotTicker(value);
  if (direct) return direct;
  if (typeof value !== 'string') return null;

  const query = value.trim();
  if (!query || query.length > 80) return null;
  const results = await search(query, 5);
  const exactTickers = [...new Set(results
    .filter((result) => result.selectable === true
      && result.verification_status !== 'external-unverified'
      && EXACT_MATCH_KINDS.has(result.match_kind ?? ''))
    .map((result) => result.t))];
  return exactTickers.length === 1 ? exactTickers[0] : null;
}
