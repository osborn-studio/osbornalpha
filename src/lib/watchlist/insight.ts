import type { AssetType } from '@/lib/supabase/database.types';

export interface PostAddInsight {
  ticker: string;
  assetType: AssetType;
  tone: 'up' | 'down' | 'flat' | 'unknown';
  messageKey: 'positive' | 'negative' | 'flat' | 'unavailable';
  changePct: number | null;
  stale: boolean;
}

export function buildPostAddInsight(input: {
  ticker: string;
  assetType: AssetType;
  quote: { change_pct: number; delayed: boolean } | null;
}): PostAddInsight {
  if (!input.quote) {
    return {
      ticker: input.ticker,
      assetType: input.assetType,
      tone: 'unknown',
      messageKey: 'unavailable',
      changePct: null,
      stale: false,
    };
  }

  const changePct = input.quote.change_pct;
  const direction = changePct > 0.05
    ? { tone: 'up' as const, messageKey: 'positive' as const }
    : changePct < -0.05
      ? { tone: 'down' as const, messageKey: 'negative' as const }
      : { tone: 'flat' as const, messageKey: 'flat' as const };

  return {
    ticker: input.ticker,
    assetType: input.assetType,
    ...direction,
    changePct,
    stale: input.quote.delayed,
  };
}
