import { getAdminSupabase } from '@/lib/supabase/admin';
import type { QuoteShape } from './resolve-quote';
import {
  loadSharedQuoteSnapshots,
  persistSharedQuoteSnapshots,
  type SharedQuoteSnapshotSet,
} from './snapshot-repository';

const EMPTY: SharedQuoteSnapshotSet = { fresh: {}, stale: {} };

export function isSharedQuoteCacheConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function readSharedQuoteCache(tickers: string[], now = new Date()): Promise<SharedQuoteSnapshotSet> {
  if (!isSharedQuoteCacheConfigured() || tickers.length === 0) return EMPTY;
  try {
    return await loadSharedQuoteSnapshots(getAdminSupabase(), tickers, now);
  } catch {
    return EMPTY;
  }
}

export async function writeSharedQuoteCache(quotes: QuoteShape[], now = new Date()): Promise<boolean> {
  if (!isSharedQuoteCacheConfigured() || quotes.length === 0) return false;
  try {
    await persistSharedQuoteSnapshots(getAdminSupabase(), quotes, now);
    return true;
  } catch {
    return false;
  }
}
