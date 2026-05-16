'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { marketLabel } from '@/lib/utils';
import type { Market } from '@/lib/supabase/database.types';

interface ApiResult { t: string; n: string; py: string; m: Market }

export function SearchInput() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  async function fetchResults(q: string) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      if (!resp.ok) throw new Error('search failed');
      const data = await resp.json();
      setResults(data.results || []);
      setSource(data.source || '');
      setOpen((data.results || []).length > 0);
      setFocusIdx(-1);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setResults([]);
        setSource('error');
      }
    } finally {
      setLoading(false);
    }
  }

  function onChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchResults(v.trim()), 250);
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
          {loading ? '⏳' : '🔍'}
        </span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder="搜索代码或名称（⌘+K · 全 A/H/US · 如 完美世界 / AAPL / 600519）"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full pl-9"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-bg-elevated shadow-lg">
          {results.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-text-dim">
              {loading ? '搜索中...' : '没有匹配结果'}
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.t}-${i}`}
              onClick={() => go(r.t)}
              onMouseEnter={() => setFocusIdx(i)}
              className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 ${
                i === focusIdx ? 'bg-bg-card' : 'hover:bg-bg-card'
              }`}
            >
              <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                {marketLabel(r.m)}
              </span>
              <div>
                <div className="font-semibold">{r.n}</div>
                <div className="text-xs text-text-dim">{r.t} {r.py && `· ${r.py}`}</div>
              </div>
              <span className="text-xs text-text-muted">→</span>
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
