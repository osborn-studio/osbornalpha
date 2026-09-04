import { classifyMarket } from '@/lib/utils';
import { marketReturnProviderFor } from './registry';
import type { MarketReturnProvider, MarketReturnSnapshot, WatchlistHistoryRange } from './types';

export async function loadMarketReturnSnapshot(
  ticker: string,
  range: WatchlistHistoryRange,
  dependencies: { provider?: MarketReturnProvider | null } = {},
): Promise<MarketReturnSnapshot | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const provider = dependencies.provider === undefined
    ? marketReturnProviderFor(classifyMarket(normalizedTicker))
    : dependencies.provider;
  if (!provider) return null;
  try {
    return await provider.load(normalizedTicker, range);
  } catch {
    return null;
  }
}
