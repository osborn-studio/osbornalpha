// src/components/company/directory/CompanyDirectory.tsx
// Coverage directory view (spec §8; artboard Directory): freshness strip (GET /api/companies/freshness),
// prefix search, market filter, three sorts, 100 per page, table with a frozen first column on mobile.
// Facts only: no ratings, no judgment counts, no per-user fields; last sync is stated, not colour-coded.
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Tag } from '@/components/ui';
import type { DirectoryRow, DirectorySort } from '@/lib/company/directory';
import { freshnessKey } from '@/lib/company/header-model';

interface DirectoryResponse { total: number; page: number; pageSize: number; conceptsTotal: number; rows: DirectoryRow[] }
interface Freshness { dataset: string; status: string | null; lastOkAt: string | null; lastAttemptAt: string | null }
type MarketFilter = 'all' | 'CN' | 'US';
const SORTS: DirectorySort[] = ['latest_available_date', 'latest_period_end', 'name'];
const PAGE_SIZE = 100;
const fmtAt = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : null);

export function CompanyDirectory({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('company.directory');
  const tf = useTranslations('company.header.freshness');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [market, setMarket] = useState<MarketFilter>('all');
  const [sort, setSort] = useState<DirectorySort>('latest_available_date');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [fresh, setFresh] = useState<Freshness[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const seq = useRef(0);

  useEffect(() => { const h = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 250); return () => clearTimeout(h); }, [q]);
  useEffect(() => {
    fetch('/api/companies/freshness').then((r) => (r.ok ? r.json() : null)).then((b) => setFresh(b?.datasets ?? [])).catch(() => setFresh([]));
  }, []);
  useEffect(() => {
    const my = ++seq.current;
    const p = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
    if (market !== 'all') p.set('market', market);
    if (debouncedQ) p.set('q', debouncedQ);
    fetch(`/api/companies?${p.toString()}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.code ?? 'internal'); return b as DirectoryResponse; })
      .then((b) => { if (my === seq.current) { setData(b); setError(null); } })
      .catch((e: Error) => { if (my === seq.current) setError(e.message); });
  }, [debouncedQ, market, sort, page, reload]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = debouncedQ !== '' || market !== 'all';
  return (
    <>
      <div className="mb-1 text-[11px] text-text-dim">{t('breadcrumb')}</div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <div className="flex flex-wrap gap-1" data-testid="freshness-strip">
          {fresh.map((f) => (
            <Tag key={f.dataset} tone="neutral">{t('freshness', { dataset: f.dataset, status: tf(freshnessKey(f.status)), at: fmtAt(f.lastOkAt) ?? t('never') })}</Tag>
          ))}
        </div>
      </div>

      <Card className="mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] text-text-dim">
            {t('searchLabel')}
            <input value={q} maxLength={24} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')}
              className="rounded-md bg-bg-card px-2 py-1.5 text-sm text-text" data-testid="directory-search" />
          </label>
          <div className="flex flex-col gap-1 text-[11px] text-text-dim">
            {t('market')}
            <div className="flex gap-1 rounded-md border border-border p-1 text-xs">
              {(['all', 'CN', 'US'] as MarketFilter[]).map((m) => (
                <button key={m} type="button" onClick={() => { setMarket(m); setPage(1); }}
                  className={`rounded px-2 py-0.5 ${market === m ? 'bg-[color-mix(in_srgb,var(--accent-dim)_20%,transparent)] font-semibold text-accent' : 'text-text-dim'}`}>
                  {m === 'all' ? t('marketAll') : m === 'CN' ? t('marketCN') : t('marketUS')}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-[11px] text-text-dim">
            {t('sort')}
            <select value={sort} onChange={(e) => { setSort(e.target.value as DirectorySort); setPage(1); }} className="rounded-md bg-bg-card px-2 py-1.5 text-sm text-text">
              {SORTS.map((s) => <option key={s} value={s}>{t(`sort_${s}`)}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-text-dim">{t('industryHint')}</p>
      </Card>

      {error && <Card className="mb-3 text-[13px]">{t('error', { code: error })} <Button variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>{t('retry')}</Button></Card>}

      {data && data.rows.length === 0 && (
        <Card className="text-[13px] text-text-dim" data-testid="directory-empty">
          {filtered ? t('noMatch') : t('empty')}
          {!filtered && isAdmin && <> <Link href="/admin/dq" className="text-accent">{t('adminDq')}</Link></>}
        </Card>
      )}

      {data && data.rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-[13px]" data-testid="directory-table">
            <thead className="text-left text-[11px] text-text-dim">
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-bg-card px-3 py-2">{t('col.name')}</th>
                <th className="px-3 py-2">{t('col.ticker')}</th>
                <th className="px-3 py-2">{t('col.stream')}</th>
                <th className="px-3 py-2">{t('col.latestPeriod')}</th>
                <th className="px-3 py-2">{t('col.latestFiling')}</th>
                <th className="px-3 py-2">{t('col.concepts')}</th>
                <th className="px-3 py-2">{t('col.citations')}</th>
                <th className="px-3 py-2">{t('col.lastSync')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const name = r.names.zh ?? r.names.en ?? r.primaryTicker ?? r.issuerId;
                return (
                  <tr key={`${r.issuerId}:${r.market}`} className="border-b border-border last:border-b-0" data-testid="directory-row">
                    <td className="sticky left-0 bg-bg-card px-3 py-2 font-semibold">
                      {r.primaryTicker ? <Link href={`/stock/${encodeURIComponent(r.primaryTicker)}` as never} className="hover:text-accent">{name}</Link> : name}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {r.primaryTicker ?? '—'}
                      {r.tickers.length > 1 && <span className="ml-1 text-text-dim">+{r.tickers.length - 1}</span>}
                    </td>
                    <td className="px-3 py-2">{r.market}</td>
                    <td className="px-3 py-2 font-mono">{r.latestPeriodEnd ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{r.latestAvailableDate ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{t('conceptsOf', { covered: r.conceptsCovered, total: data.conceptsTotal })}</td>
                    <td className="px-3 py-2 text-text-muted">{t('citations', { linked: r.citationSummary.linked, pending: r.citationSummary.pending, edgar: r.citationSummary.edgar })}</td>
                    <td className="px-3 py-2 font-mono text-text-muted">
                      {r.scopeLastSuccessAt || r.scopeLastStatus
                        ? t('lastSync', { at: fmtAt(r.scopeLastSuccessAt) ?? t('never'), status: r.scopeLastStatus ? t(`status_${r.scopeLastStatus}`) : t('never') })
                        : t('never')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.total > 0 && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-text-dim">
          <span>{t('footer', { total: data.total, pageSize: PAGE_SIZE })}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</Button>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('next')}</Button>
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-text-dim">{t('syncNote')}</p>
    </>
  );
}
