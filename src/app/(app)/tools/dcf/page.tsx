'use client';

import { useRef, useState } from 'react';
import { MarketLabel } from '@/components/MarketLabel';
import { useTranslations } from 'next-intl';
import { DcfStudio } from '@/components/DcfStudio';
import type { Market } from '@/lib/supabase/database.types';
import { Disclaimer } from '@/components/Disclaimer';

interface SearchResult { t: string; n: string; py: string; m: Market }

export default function DcfWorkbenchPage() {
  const t = useTranslations('tools.dcf');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticker, setTicker] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function runSearch(q: string) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => { setResults(d.results || []); setLoading(false); })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setResults([]);
        setLoading(false);
      });
  }

  function onChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(v.trim()), 250);
  }

  function pick(t: string) {
    setTicker(t);
    setResults([]);
    setQuery('');
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-bold">{t('heading')}</h1>
      <p className="mb-4 text-sm text-text-dim">{t('subheading')}</p>

      <div className="card-base mb-3">
        <div className="mb-2 text-sm font-semibold text-text-dim">{t('pickStock')}</div>
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) pick(query.trim().toUpperCase());
          }}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-md bg-bg-card px-3 py-2 text-sm"
        />
        {loading && <div className="mt-1.5 text-xs text-text-muted">{t('searching')}</div>}
        {results.length > 0 && (
          <div className="mt-2 space-y-1">
            {results.map((r) => (
              <button
                key={r.t}
                type="button"
                onClick={() => pick(r.t)}
                className="grid w-full grid-cols-[auto_1fr] items-center gap-2 rounded-md bg-bg-card px-2 py-1.5 text-left hover:bg-bg-elevated"
              >
                <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                  <MarketLabel m={r.m} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{r.n}</div>
                  <div className="truncate text-[11px] text-text-dim">{r.t}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {query.trim() && !loading && results.length === 0 && (
          <div className="mt-1.5 text-xs text-text-muted">{t('noMatch')}</div>
        )}
      </div>

      {ticker ? (
        <DcfStudio ticker={ticker} />
      ) : (
        <div className="card-base text-sm text-text-muted">{t('emptyState')}</div>
      )}

      <Disclaimer />
    </>
  );
}
