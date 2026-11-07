// Coverage directory view (spec §8; artboard Directory): freshness strip (GET /api/companies/freshness),
// prefix search, market filter, three sorts, 100 per page, table with a frozen first column on mobile.
// Facts only: no ratings, no judgment counts, no per-user fields; last sync is stated, not colour-coded.
// Rows, total and pagination are bound to the query key of the response that produced them (directory-view.ts).
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Card, Tag } from '@/components/ui';
import { ErrorCard } from '@/components/company/StateCallout';
import { Seg } from '@/components/company/Seg';
import type { DirectoryRow, DirectorySort } from '@/lib/company/directory';
import { citationParts, displayName, qStateOf, queryKeyOf, viewOf } from '@/lib/company/directory-view';
import { freshnessKey } from '@/lib/company/header-model';

interface DirectoryResponse { total: number; conceptsTotal: number; rows: DirectoryRow[] }
interface Freshness { dataset: string; status: string | null; lastOkAt: string | null; lastAttemptAt: string | null }
type MarketFilter = 'all' | 'CN' | 'US';
const SORTS: DirectorySort[] = ['latest_available_date', 'latest_period_end', 'name'];
const PAGE_SIZE = 100;
const fmtAt = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : null);
const FIELD = 'rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';

export function CompanyDirectory({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('company.directory');
  const tf = useTranslations('company.header.freshness');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [market, setMarket] = useState<MarketFilter>('all');
  const [sort, setSort] = useState<DirectorySort>('latest_available_date');
  const [page, setPage] = useState(1);
  const [ok, setOk] = useState<{ key: string; seq: number; data: DirectoryResponse } | null>(null);
  const [err, setErr] = useState<{ key: string; seq: number; code: string } | null>(null);
  const [fresh, setFresh] = useState<Freshness[] | 'unavailable' | null>(null);
  const [reload, setReload] = useState(0);
  const gen = useRef(0);

  useEffect(() => { const h = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 250); return () => clearTimeout(h); }, [q]);
  useEffect(() => {
    let live = true;
    fetch('/api/companies/freshness')
      .then(async (r) => { if (!r.ok) throw new Error('freshness'); return (await r.json()) as { datasets?: Freshness[] }; })
      .then((b) => { if (live) setFresh(Array.isArray(b.datasets) ? b.datasets : 'unavailable'); })
      .catch(() => { if (live) setFresh('unavailable'); });
    return () => { live = false; };
  }, []);

  const qState = qStateOf(debouncedQ);
  const key = queryKeyOf({ q: debouncedQ, market, sort, page });
  useEffect(() => {
    if (qState === 'invalid') return;   // invalid q: inline hint, no request
    const seq = ++gen.current;
    const ctl = new AbortController();
    const p = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
    if (market !== 'all') p.set('market', market);
    if (debouncedQ) p.set('q', debouncedQ);
    fetch(`/api/companies?${p.toString()}`, { signal: ctl.signal })
      .then(async (r) => {
        let b: unknown = null;
        try { b = await r.json(); } catch { b = null; }   // non-JSON bodies (proxy error pages)
        if (!r.ok) {
          const code = (b as { error?: { code?: unknown } } | null)?.error?.code;
          throw new Error(typeof code === 'string' ? code : `http_${r.status}`);
        }
        if (!b || !Array.isArray((b as DirectoryResponse).rows)) throw new Error('bad_response');
        return b as DirectoryResponse;
      })
      .then((data) => setOk({ key, seq, data }))
      .catch((e: Error) => { if (e.name !== 'AbortError') setErr({ key, seq, code: e.message || 'internal' }); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, qState, reload]);

  const view = qState === 'invalid' ? ({ status: 'loading' } as const) : viewOf(key, ok, err);
  const data = view.status === 'ready' ? view.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = debouncedQ !== '' || market !== 'all';
  const th = 'px-3 py-2';

  return (
    <>
      <div className="mb-1 text-[11px] text-[var(--text-dim)]">{t('breadcrumb')}</div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <div className="flex flex-wrap gap-1" data-testid="freshness-strip">
          {fresh === 'unavailable' && <Tag tone="accent">{t('freshnessUnavailable')}</Tag>}
          {Array.isArray(fresh) && fresh.map((f) => {
            const k = freshnessKey(f.status);
            return (
              <Tag key={f.dataset} tone={k === 'fresh' || k === 'unknown' ? 'neutral' : 'accent'}>
                {t('freshness', { dataset: f.dataset, status: tf(k), at: fmtAt(f.lastOkAt) ?? t('never') })}
              </Tag>
            );
          })}
        </div>
      </div>

      <Card className="mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] text-[var(--text-dim)]">
            {t('searchLabel')}
            <input value={q} maxLength={24} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')}
              aria-invalid={qState === 'invalid' || undefined} className={FIELD} data-testid="directory-search" />
          </label>
          <div className="flex flex-col gap-1 text-[11px] text-[var(--text-dim)]">
            {t('market')}
            <Seg label={t('market')} value={market} onChange={(m) => { setMarket(m); setPage(1); }}
              options={[{ value: 'all', label: t('marketAll') }, { value: 'CN', label: t('marketCN') }, { value: 'US', label: t('marketUS') }]} />
          </div>
          <label className="flex flex-col gap-1 text-[11px] text-[var(--text-dim)]">
            {t('sort')}
            <select value={sort} onChange={(e) => { setSort(e.target.value as DirectorySort); setPage(1); }} className={FIELD}>
              {SORTS.map((s) => <option key={s} value={s}>{t(`sort_${s}`)}</option>)}
            </select>
          </label>
        </div>
        {qState === 'invalid' && <p role="alert" className="mt-2 text-[12px]" data-testid="directory-q-hint">{t('invalidQ')}</p>}
        <p className="mt-2 text-[11px] text-[var(--text-dim)]">{t('industryHint')}</p>
      </Card>

      {qState !== 'invalid' && view.status === 'error' && (
        <div className="mb-3"><ErrorCard message={t('error', { code: view.code })} onRetry={() => setReload((n) => n + 1)} /></div>
      )}

      {qState !== 'invalid' && view.status === 'loading' && (
        <Card className="text-[13px] text-[var(--text-dim)]" role="status" aria-busy="true" data-testid="directory-loading">{t('loading')}</Card>
      )}

      {data && data.rows.length === 0 && (
        <Card className="text-[13px] text-[var(--text-dim)]" data-testid="directory-empty">
          {filtered ? t('noMatch') : t('empty')}
          {!filtered && isAdmin && <> <Link href="/admin/dq" className="text-[var(--accent)]">{t('adminDq')}</Link></>}
        </Card>
      )}

      {data && data.rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-[13px]" data-testid="directory-table">
            <thead className="text-left text-[11px] text-[var(--text-dim)]">
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className={`sticky left-0 bg-[var(--bg-card)] ${th}`}>{t('col.name')}</th>
                <th scope="col" className={th}>{t('col.ticker')}</th>
                <th scope="col" className={th}>{t('col.stream')}</th>
                <th scope="col" className={th}>{t('col.latestPeriod')}</th>
                <th scope="col" className={th}>{t('col.latestFiling')}</th>
                <th scope="col" className={th}>{t('col.concepts')}</th>
                <th scope="col" className={th}>{t('col.citations')}</th>
                <th scope="col" className={th}>{t('col.lastSync')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const name = displayName(r, locale, sort);
                const extra = r.tickers.slice(1);
                return (
                  <tr key={`${r.issuerId}:${r.market}`} className="border-b border-[var(--border)] last:border-b-0" data-testid="directory-row">
                    <th scope="row" className="sticky left-0 bg-[var(--bg-card)] px-3 py-2 text-left font-semibold">
                      {r.primaryTicker ? <Link href={`/stock/${encodeURIComponent(r.primaryTicker)}` as never} className="hover:text-[var(--accent)]">{name}</Link> : name}
                    </th>
                    <td className="px-3 py-2 font-mono">
                      {r.primaryTicker ?? '—'}
                      {extra.length > 0 && <span className="ml-1 text-[var(--text-dim)]" title={t('moreTickers', { list: extra.join(', ') })}>+{extra.length}</span>}
                    </td>
                    <td className="px-3 py-2">{r.market}</td>
                    <td className="px-3 py-2 font-mono">{r.latestPeriodEnd ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{r.latestAvailableDate ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{t('conceptsOf', { covered: r.conceptsCovered, total: data.conceptsTotal })}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{citationParts(r.market, r.citationSummary).map((c) => `${c.key} ${c.n}`).join(' · ')}</td>
                    <td className="px-3 py-2 font-mono text-[var(--text-muted)]">
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
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-dim)]">
          <span>{t('footer', { total: data.total, pageSize: PAGE_SIZE })}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('prev')}</Button>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('next')}</Button>
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-[var(--text-dim)]">{t('syncNote')}</p>
    </>
  );
}
