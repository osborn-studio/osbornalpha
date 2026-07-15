import { inferCoreMarket, isCompleteCodeQuery, normalizeSecurityTicker } from '@/lib/securities/normalize';

export interface SelectableSecurityRow {
  ticker: string;
  is_active: boolean;
  list_status: string;
  source: string | null;
}

export interface SearchSelectionResult {
  t: string;
  selectable?: boolean;
  verification_status?: string;
}

export type SearchAction = 'resolve' | 'select' | 'wait';

export function canAddResult(result: SearchSelectionResult): boolean {
  return result.selectable === true && result.verification_status !== 'external-unverified';
}

export function nextSearchAction(input: {
  localResults: SearchSelectionResult[];
  query: string;
}): SearchAction {
  if (input.localResults.some(canAddResult)) return 'select';
  return isCompleteCodeQuery(input.query.trim()) ? 'resolve' : 'wait';
}

export function canonicalizeSecurityTicker(value: string): string | null {
  const market = inferCoreMarket(value);
  return market ? normalizeSecurityTicker(value, market) : null;
}

export async function validateSelectableSecurities(
  requestedTickers: string[],
  load: (canonicalTickers: string[]) => Promise<SelectableSecurityRow[]>,
) {
  const normalized = requestedTickers.map((requested) => ({
    requested,
    canonical: canonicalizeSecurityTicker(requested.trim()),
  }));
  const uniqueCanonical = [...new Set(normalized.flatMap((row) => row.canonical ? [row.canonical] : []))];
  const rows = uniqueCanonical.length ? await load(uniqueCanonical) : [];
  const selectable = new Set(rows
    .filter((row) => row.is_active
      && row.list_status === 'listed'
      && row.source !== 'legacy-watchlist')
    .map((row) => row.ticker));
  const accepted = normalized.filter((row) => row.canonical && selectable.has(row.canonical));
  const rejected = normalized.filter((row) => !row.canonical || !selectable.has(row.canonical ?? ''));
  return {
    valid: rejected.length === 0,
    canonicalTickers: accepted.map((row) => row.canonical!),
    rejected: rejected.map((row) => row.canonical ?? row.requested),
  };
}

export async function validateSelectableSecuritiesWithClient(client: any, requestedTickers: string[]) {
  return validateSelectableSecurities(requestedTickers, async (canonicalTickers) => {
    const { data, error } = await client.from('stocks_universe')
      .select('ticker,is_active,list_status,source')
      .in('ticker', canonicalTickers);
    if (error) throw new Error('Security master unavailable.');
    return data ?? [];
  });
}
