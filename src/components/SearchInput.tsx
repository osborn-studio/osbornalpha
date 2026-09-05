'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Search } from 'lucide-react';
import { MarketLabel } from '@/components/MarketLabel';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Market } from '@/lib/supabase/database.types';
import { nextSearchAction } from '@/lib/watchlist/security-validation';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

interface ApiResult {
  t: string;
  n: string;
  py: string;
  m: Market;
  selectable?: boolean;
  verification_status?: string;
}

export function SearchInput() {
  const t = useTranslations('components.search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>('');
  const [error, setError] = useState<'unavailable' | 'failed' | null>(null);
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  // close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const fetchResults = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setResults([]);
        setSource('');
        setError(data?.error === 'security_master_unavailable' ? 'unavailable' : 'failed');
        setOpen(true);
        return;
      }
      let nextResults: ApiResult[] = data.results || [];
      let nextSource = data.source || '';
      if (nextSearchAction({ localResults: nextResults, query: q }) === 'resolve') {
        const resolveResponse = await fetch('/api/securities/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
          signal: ctrl.signal,
        });
        if (resolveResponse.ok) {
          const resolved = await resolveResponse.json();
          nextResults = resolved.result ? [resolved.result] : [];
          nextSource = resolved.source || nextSource;
        } else if (resolveResponse.status !== 404) {
          setError(resolveResponse.status === 503 ? 'unavailable' : 'failed');
        }
      }
      setResults(nextResults);
      setSource(nextSource);
      setOpen(true);
      setFocusIdx(-1);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setResults([]);
        setSource('');
        setError('failed');
        setOpen(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!debouncedQuery) {
      abortRef.current?.abort();
      setLoading(false);
      setResults([]);
      setOpen(false);
      return;
    }
    void fetchResults(debouncedQuery);
    return () => abortRef.current?.abort();
  }, [debouncedQuery, fetchResults]);

  function onChange(v: string) {
    setQuery(v);
    setError(null);
    if (v.trim().length === 0) {
      abortRef.current?.abort();
      setLoading(false);
      setResults([]);
      setOpen(false);
    }
  }

  function go(ticker: string) {
    setOpen(false);
    setQuery('');
    router.push(`/stock/${encodeURIComponent(ticker)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => (results.length ? (i + 1) % results.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => (results.length ? (i - 1 + results.length) % results.length : -1));
    } else if (e.key === 'Enter') {
      const target = focusIdx >= 0 ? results[focusIdx] : results[0];
      if (target) go(target.t);
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
        </span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="global-security-search-results"
          aria-activedescendant={focusIdx >= 0 ? `global-security-search-option-${focusIdx}` : undefined}
          placeholder={t('placeholder')}
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full pl-9"
        />
      </div>
      {open && (
        <div id="global-security-search-results" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-bg-elevated shadow-lg">
          {results.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-text-dim">
              {loading ? t('searching') : error === 'unavailable' ? t('unavailable') : error ? t('failed') : t('noResults')}
            </div>
          )}
          {results.map((r, i) => (
            <button
              id={`global-security-search-option-${i}`}
              role="option"
              aria-selected={i === focusIdx}
              key={`${r.t}-${i}`}
              onClick={() => go(r.t)}
              onMouseEnter={() => setFocusIdx(i)}
              className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 ${
                i === focusIdx ? 'bg-bg-card' : 'hover:bg-bg-card'
              }`}
            >
              <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                <MarketLabel m={r.m} />
              </span>
              <div>
                <div className="font-semibold">{r.n}</div>
                <div className="text-xs text-text-dim">{r.t} {r.py && `· ${r.py}`}</div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            </button>
          ))}
          {source && (
            <div className="px-3 py-1 text-right text-[10px] text-text-muted">
              source: {source}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
