'use client';

import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MarketLabel } from '@/components/MarketLabel';
import { useToast } from '@/components/Toast';
import { trackEvent } from '@/lib/analytics/client';
import type { AssetType } from '@/lib/supabase/database.types';
import { classifyAssetType } from '@/lib/stocks/asset-type';
import { normalizeWindTicker } from '@/lib/stocks/wind-normalize';
import { canAddResult, nextSearchAction } from '@/lib/watchlist/security-validation';
import type { WatchlistSecurityIdentity } from '@/lib/watchlist/security-identity';
import { watchlistJsonResult } from '@/lib/watchlist/api-client';

export type WatchlistSecurityResult = WatchlistSecurityIdentity;

export function WatchlistSecuritySearch({ onAdd, onClose, framed = true }: { onAdd: (info: WatchlistSecurityResult) => void; onClose: () => void; framed?: boolean }) {
  const t = useTranslations('market.watchlist.kanban');
  const assetTypes = useTranslations('market.watchlist.assetTypes');
  const { show } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WatchlistSecurityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<'unavailable' | 'failed' | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => { abortRef.current?.abort(); if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  async function runSearch(value: string) {
    trackEvent('stock_search_submitted', { query_length: value.length });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSearchError(null);
    try {
      const search = await watchlistJsonResult<{ results?: WatchlistSecurityResult[] }>(`/api/search?q=${encodeURIComponent(value)}`, {
        signal: controller.signal,
      }, 'security_search_failed');
      if (!search.ok) {
        setResults([]);
        setSearchError(search.error.code === 'security_master_unavailable' ? 'unavailable' : 'failed');
        return;
      }
      const body = search.body;
      let next = (body.results || []).map((result: Omit<WatchlistSecurityResult, 'asset_type'> & { asset_type?: AssetType }) => ({ ...result, asset_type: result.asset_type ?? classifyAssetType({ ticker: result.t, name: result.n }) }));
      if (nextSearchAction({ localResults: next, query: value }) === 'resolve') {
        const resolvedResponse = await watchlistJsonResult<{ result?: WatchlistSecurityResult }>('/api/securities/resolve', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: value }), signal: controller.signal,
        }, 'security_resolve_failed');
        if (resolvedResponse.ok) {
          const resolved = resolvedResponse.body;
          next = resolved.result ? [{ ...resolved.result, asset_type: resolved.result.asset_type ?? classifyAssetType({ ticker: resolved.result.t, name: resolved.result.n }) }] : [];
        } else if (resolvedResponse.status !== 404) setSearchError(resolvedResponse.status === 503 ? 'unavailable' : 'failed');
      }
      setResults(next);
      setFocusIndex(next.findIndex(canAddResult));
      trackEvent('stock_search_completed', { query_length: value.length, results: next.length });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setResults([]);
      setSearchError('failed');
      trackEvent('stock_search_failed', { query_length: value.length });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function changeQuery(value: string) {
    setQuery(value);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => void runSearch(value.trim()), 250);
  }

  function select(result: WatchlistSecurityResult) {
    if (!canAddResult(result)) return;
    onAdd(result);
    setQuery('');
    setResults([]);
    show(t('addedSelection', { ticker: result.t }));
    inputRef.current?.focus();
  }

  function confirm() {
    const focused = focusIndex >= 0 ? results[focusIndex] : undefined;
    const target = focused && canAddResult(focused) ? focused : results.find(canAddResult);
    if (target) select(target);
    else if (query.trim()) void runSearch(query.trim());
  }

  return (
    <div className={framed ? 'rounded-md border border-accent/35 bg-bg-elevated p-2' : ''}>
      <input ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls="watchlist-security-results" aria-activedescendant={focusIndex >= 0 ? `watchlist-security-option-${focusIndex}` : undefined} value={query} onChange={(event) => changeQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); confirm(); }
        else if (event.key === 'Escape') onClose();
        else if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setFocusIndex((index) => (index + 1) % results.length); }
        else if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setFocusIndex((index) => (index - 1 + results.length) % results.length); }
      }} placeholder={t('searchPlaceholder')} className="h-10 w-full text-sm" autoComplete="off" />
      {results.length > 0 && <div id="watchlist-security-results" role="listbox" className="mt-2 max-h-56 overflow-y-auto rounded border border-border bg-bg-card">{results.map((result, index) => <button id={`watchlist-security-option-${index}`} role="option" aria-selected={index === focusIndex} type="button" key={`${result.t}-${index}`} onClick={() => select(result)} onMouseEnter={() => setFocusIndex(index)} disabled={!canAddResult(result)} className={`grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-b border-border px-2.5 py-2 text-left last:border-b-0 ${index === focusIndex ? 'bg-bg-hover' : 'hover:bg-bg-elevated'} disabled:cursor-not-allowed disabled:opacity-50`}><span className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold text-text-dim"><MarketLabel m={result.m} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{result.n}</span><span className="flex flex-wrap items-center gap-1 text-[11px] text-text-dim"><span className="font-mono">{result.t}</span><span aria-hidden="true">/</span><span>{assetTypes(result.asset_type)}</span>{!canAddResult(result) && <span>{t('pendingVerification')}</span>}</span></span></button>)}</div>}
      {query.trim() && !loading && results.length === 0 && <div className="mt-2 text-[11px] text-text-muted">{searchError === 'unavailable' ? t('searchUnavailable') : searchError ? t('searchFailed') : t('noMatch', { query: query.trim() })}{!searchError && normalizeWindTicker(query.trim()) !== query.trim().toUpperCase() ? ` ${t('normalizedNote', { canonical: normalizeWindTicker(query.trim()) })}` : ''}</div>}
      <div className="mt-2 flex gap-2"><button type="button" onClick={confirm} disabled={loading || !results.some(canAddResult)} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{loading ? t('searching') : t('add')}</button><button type="button" onClick={onClose} className="h-9 rounded border border-border px-3 text-xs text-text-dim">{t('done')}</button></div>
    </div>
  );
}
