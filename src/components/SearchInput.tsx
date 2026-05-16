'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MOCK_UNIVERSE } from '@/lib/data/mock';
import { searchUniverse, type SearchResult } from '@/lib/stocks/search';
import { marketLabel } from '@/lib/utils';

export function SearchInput() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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

  function onChange(v: string) {
    setQuery(v);
    const next = searchUniverse(MOCK_UNIVERSE, v);
    setResults(next);
    setOpen(next.length > 0);
    setFocusIdx(-1);
  }

  function go(ticker: string) {
    setOpen(false);
    setQuery('');
    router.push(`/stock/${encodeURIComponent(ticker)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
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
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">🔍</span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder="搜索代码或名称（⌘+K · 如 腾讯 / AAPL / 600519）"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full pl-9"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[360px] overflow-y-auto rounded-lg border border-border bg-bg-elevated shadow-lg">
          {results.map((r, i) => (
            <button
              key={r.t}
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
                <div className="text-xs text-text-dim">{r.t}</div>
              </div>
              <span className="text-xs text-text-muted">→ 详情</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
