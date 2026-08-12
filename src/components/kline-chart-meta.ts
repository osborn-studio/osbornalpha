import type { KlineMeta } from '@/lib/chart/kline';

export type ChartStatusKey =
  | 'freshness.fresh'
  | 'freshness.stale'
  | 'fallbackUsed'
  | 'cache.shared-swr'
  | 'cache.memory-lkg'
  | 'coveragePartial'
  | 'partialBar';

export function chartStatusKeys(meta: KlineMeta): ChartStatusKey[] {
  const keys: ChartStatusKey[] = [meta.freshness === 'stale' ? 'freshness.stale' : 'freshness.fresh'];
  if (meta.fallbackUsed) keys.push('fallbackUsed');
  if (meta.cacheStatus === 'shared-swr') keys.push('cache.shared-swr');
  if (meta.cacheStatus === 'memory-lkg') keys.push('cache.memory-lkg');
  if (meta.completeness === 'partial') keys.push('coveragePartial');
  if (meta.partial) keys.push('partialBar');
  return keys;
}

export function sourceTranslationKey(meta: KlineMeta): `sources.${KlineMeta['source']}` {
  return `sources.${meta.source}`;
}
