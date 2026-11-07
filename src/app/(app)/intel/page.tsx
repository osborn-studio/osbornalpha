'use client';

import { useEffect, useRef, useState } from 'react';
import { MarketLabel } from '@/components/MarketLabel';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { WizardCard } from '@/components/intel/WizardCard';
import { WatchlistScreener } from '@/components/intel/WatchlistScreener';
import type { Market } from '@/lib/supabase/database.types';
import { Disclaimer } from '@/components/Disclaimer';
// INDUSTRY:BEGIN
import { IndustryEntryCard } from '@/components/industries/IndustryEntryCard';
// INDUSTRY:END
// MACRO
import { MacroSummaryCard } from '@/components/macro/MacroSummaryCard';
// /MACRO

interface SearchResult { t: string; n: string; py: string; m: Market }
interface Artifact { id: string; skill_id: string; ticker: string | null; title: string; content_md: string; created_at: string }

type Tab = 'discover' | 'research';

export default function IntelPage() {
  const t = useTranslations('intel');
  const [tab, setTab] = useState<Tab>('discover');

  return (
    <>
      <h1 className="mb-1 text-xl font-bold">{t('page.title')}</h1>
      <p className="mb-4 text-sm text-text-dim">{t('page.subtitle')}</p>
      {/* MACRO */}
      <div className="mb-4"><MacroSummaryCard /></div>
      {/* /MACRO */}

      <div className="mb-4 flex gap-1 rounded-md border border-border p-1 text-sm">
        <button
          type="button"
          onClick={() => setTab('discover')}
          className={`flex-1 rounded px-3 py-1.5 font-semibold ${tab === 'discover' ? 'bg-accent-dim/20 text-accent' : 'text-text-dim'}`}
        >
          {t('tabs.discover')}
        </button>
        <button
          type="button"
          onClick={() => setTab('research')}
          className={`flex-1 rounded px-3 py-1.5 font-semibold ${tab === 'research' ? 'bg-accent-dim/20 text-accent' : 'text-text-dim'}`}
        >
          {t('tabs.research')}
        </button>
      </div>

      {tab === 'discover' ? <DiscoverTab /> : <ResearchTab />}

      <Disclaimer />
    </>
  );
}

function DiscoverTab() {
  const t = useTranslations('intel');
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <WizardCard
          icon="🔭"
          title={t('wizards.bottleneck.title')}
          desc={t('wizards.bottleneck.desc')}
          placeholder={t('wizards.bottleneck.placeholder')}
          methodId="stock-bottleneck-picker"
        />
        <WizardCard
          icon="🕸"
          title={t('wizards.industryChain.title')}
          desc={t('wizards.industryChain.desc')}
          placeholder={t('wizards.industryChain.placeholder')}
          methodId="industry-chain-diligence"
        />
      </div>
      <WatchlistScreener />
    </div>
  );
}

function ResearchTab() {
  const t = useTranslations('intel');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [artErr, setArtErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/artifacts?limit=10')
      .then((r) => r.json())
      .then((body) => { if (!cancelled) setArtifacts(body.artifacts ?? []); })
      .catch((e) => { if (!cancelled) setArtErr(String(e)); });
    return () => { cancelled = true; };
  }, []);

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

  return (
    <div className="space-y-3">
      {/* INDUSTRY:BEGIN */}
      <IndustryEntryCard />
      {/* INDUSTRY:END */}
      <div className="card-base">
        <div className="mb-2 text-sm font-semibold text-text-dim">{t('research.search.title')}</div>
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('research.search.placeholder')}
          className="w-full rounded-md bg-bg-card px-3 py-2 text-sm"
        />
        {loading && <div className="mt-1.5 text-xs text-text-muted">{t('research.search.searching')}</div>}
        {results.length > 0 && (
          <div className="mt-2 space-y-1">
            {results.map((r) => (
              <button
                key={r.t}
                type="button"
                onClick={() => router.push(`/stock/${encodeURIComponent(r.t)}` as any)}
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
          <div className="mt-1.5 text-xs text-text-muted">{t('research.search.noMatches')}</div>
        )}
      </div>

      <div className="card-base">
        <div className="mb-2 text-sm font-semibold text-text-dim">{t('research.artifacts.title')}</div>
        {artErr && <div className="text-xs text-down">{t('research.artifacts.loadFailed', { error: artErr })}</div>}
        {!artErr && artifacts === null && <div className="text-xs text-text-muted">{t('research.artifacts.loading')}</div>}
        {!artErr && artifacts !== null && artifacts.length === 0 && (
          <div className="text-xs text-text-muted">{t('research.artifacts.empty')}</div>
        )}
        {artifacts && artifacts.length > 0 && (
          <div className="space-y-1">
            {artifacts.map((a) => {
              const open = openId === a.id;
              return (
                <div key={a.id} className="rounded-md bg-bg-card">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : a.id)}
                    className="grid w-full grid-cols-[auto_auto_1fr] items-center gap-3 px-3 py-2 text-left"
                  >
                    <span className="font-mono text-[11px] text-text-dim">{a.created_at.slice(0, 10)}</span>
                    <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-dim">
                      {a.skill_id}{a.ticker ? ` · ${a.ticker}` : ''}
                    </span>
                    <span className="truncate text-sm">{a.title}</span>
                  </button>
                  {open && (
                    <pre className="whitespace-pre-wrap border-t border-border px-3 py-2 text-[11px] leading-relaxed text-text-muted">
                      {a.content_md}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2 text-right">
          <Link href="/skills" className="text-xs text-accent">
            {t('research.artifacts.viewAll')}
          </Link>
        </div>
      </div>
    </div>
  );
}
