'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Panel } from '@/components/ui';
import type { DqSummary } from '@/lib/dq/dashboard';

type Row = Record<string, unknown>;
interface DqResponse {
  summary: DqSummary;
  batches24hTruncated: boolean;
  batches: Row[];
  freshness: (Row & { status: string; stored_status: string })[];
  quarantine: { rows: Row[]; page: number; pageSize: number; total: number };
  reconciliations: Row[];
  datasets: string[];
  refreshedAt: string;
}
type Resolution = 'resolved_accept' | 'resolved_reject';
type Col = { label: string; num?: boolean };

const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pct = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(2)}%`);
const count = (row: Row, key: string) => s((row.counts as Record<string, unknown> | null)?.[key] ?? 0);
// Fixed semantic tones: never text-up/text-down, which flip with the market colour scheme.
const STATUS_TONE: Record<string, string> = {
  fresh: '', success: '', stale: 'text-warn', partial: 'text-warn', running: 'text-text-dim',
  missing: 'text-text-muted', error: 'text-danger', failed: 'text-danger', rejected: 'text-danger',
};
// Tailwind 3 cannot apply an opacity modifier to a var() colour, so mix it explicitly.
const DANGER_BG = 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]';

function Pill({ value }: { value: string }) {
  return <span className={`rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] ${STATUS_TONE[value] ?? 'text-text-dim'}`}>{value}</span>;
}

function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-bg-elevated p-3">
      <div className="truncate text-[11px] text-text-dim" title={label}>{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
      {note ? <div className="mt-1 truncate text-[11px] text-text-muted">{note}</div> : null}
    </div>
  );
}

function Table({ head, children, empty }: { head: Col[]; children: ReactNode[]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] text-left text-xs tabular-nums">
        <thead className="bg-bg-card text-text-dim"><tr>{head.map((h) => <th key={h.label} scope="col" className={`whitespace-nowrap px-2 py-1.5 font-medium ${h.num ? 'text-right' : ''}`}>{h.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {children.length ? children : <tr><td colSpan={head.length} className="px-2 py-3 text-text-muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ value, className }: { value: unknown; className?: string }) {
  const json = JSON.stringify(value ?? {});
  return (
    <details className={className}>
      <summary className="cursor-pointer truncate font-mono text-text-muted">{json}</summary>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-bg-card p-2 font-mono text-[11px]">{JSON.stringify(value ?? {}, null, 2)}</pre>
    </details>
  );
}

const td = 'whitespace-nowrap px-2 py-1.5';
const num = `${td} text-right tabular-nums`;

export function AdminDqClient() {
  const t = useTranslations('admin.dq');
  const locale = useLocale();
  const [dataset, setDataset] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DqResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams({ page: String(page) });
    if (dataset) qs.set('dataset', dataset);
    setLoading(true);
    fetch(`/api/admin/dq?${qs}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<DqResponse>; })
      .then((d) => {
        setData(d); setError(null); setLoading(false);
        // A resolve can empty the last page; step back to the new last page and refetch.
        const lastPage = Math.max(1, Math.ceil(d.quarantine.total / d.quarantine.pageSize));
        if (d.quarantine.rows.length === 0 && d.quarantine.total > 0 && page > lastPage) setPage(lastPage);
      })
      .catch((e) => { if (e instanceof Error && e.name === 'AbortError') return; setError(t('loadFailed')); setLoading(false); });
    return () => controller.abort();
  }, [dataset, page, tick, t]);

  const time = (v: unknown) => {
    const d = new Date(String(v ?? ''));
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  async function resolve(id: string, status: Resolution) {
    setPending(id);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch(`/api/admin/dq/quarantine/${id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }), cache: 'no-store',
      });
      if (r.ok) reload();
      else if (r.status === 409) { setNotice(t('alreadyResolved')); reload(); }
      else if (r.status === 404) { setError(t('notFound')); reload(); }
      else setError(t('resolveFailed'));
    } catch {
      setError(t('resolveFailed'));
    } finally {
      setPending(null);
    }
  }

  const busy = loading || pending !== null;
  const sm = data?.summary;
  const q = data?.quarantine;
  const pages = q ? Math.max(1, Math.ceil(q.total / q.pageSize)) : 1;
  // Options: the server's registry ∪ loaded datasets (spec 3 §6.3), plus the current selection so it never disappears.
  const datasets = Array.from(new Set([...(data?.datasets ?? []), ...(dataset ? [dataset] : [])])).sort();
  const by = sm?.batchesByStatus ?? {};
  const batchTotal = Object.values(by).reduce((a, b) => a + b, 0);
  const recShown = data?.reconciliations.length ?? 0;
  const recTotal = sm?.failedReconciliationsTotal ?? 0;
  const recTitle = recTotal > recShown
    ? `${t('sections.reconciliations')} · ${t('sections.reconciliationsLatest', { shown: recShown, total: recTotal })}`
    : t('sections.reconciliations');

  return (
    <div data-density="data" className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-xs text-text-dim">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {data ? <span className="rounded border border-border bg-bg-card px-2 py-1 font-mono text-[11px] text-text-dim">{t('refreshedAt', { time: new Date(data.refreshedAt).toLocaleTimeString(locale, { hour12: false }) })}</span> : null}
          <button type="button" onClick={reload} disabled={busy} className="min-h-9 rounded-md border border-border bg-bg-elevated px-3 text-xs hover:text-accent disabled:opacity-50">{loading ? t('loading') : t('refresh')}</button>
        </div>
      </header>

      {notice ? <div role="status" className="rounded-md border border-border bg-bg-card px-3 py-2 text-xs text-warn">{notice}</div> : null}
      {error ? <div role="alert" className={`rounded-md ${DANGER_BG} px-3 py-2 text-xs text-danger`}>{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t('tiles.notFresh')} value={sm ? `${sm.notFresh.length} / ${sm.freshnessTotal}` : '—'}
          tone={sm && sm.notFresh.length > 0 ? 'text-warn' : undefined}
          note={sm ? t('tiles.notFreshNote', sm.notFreshByStatus) : null} />
        <Tile label={t('tiles.openQuarantine')} value={sm ? sm.openQuarantineTotal : '—'} note={t('tiles.openQuarantineNote')} />
        <Tile label={t('tiles.failedReconciliations')} value={sm ? sm.failedReconciliationsTotal : '—'}
          tone={sm && sm.failedReconciliationsTotal > 0 ? 'text-danger' : undefined} />
        <Tile label={t('tiles.batches24h')} value={sm ? `${data?.batches24hTruncated ? '≥' : ''}${batchTotal}` : '—'}
          note={sm ? t('tiles.batchesNote', { success: by.success ?? 0, partial: by.partial ?? 0, failed: by.failed ?? 0 }) : null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('sections.freshness')}>
          <Table empty={t('empty')} head={[{ label: t('columns.dataset') }, { label: t('columns.cadence') }, { label: t('columns.lastOk') }, { label: t('columns.status') }, { label: t('columns.stored') }]}>
            {(data?.freshness ?? []).map((f) => (
              <tr key={String(f.dataset)}>
                <td className={`${td} font-mono`}>{s(f.dataset)}</td><td className={td}>{s(f.expected_cadence)}</td>
                <td className={td}>{time(f.last_ok_at)}</td><td className={td}><Pill value={f.status} /></td>
                <td className={`${td} font-mono ${f.status !== f.stored_status ? 'text-warn' : 'text-text-dim'}`}>{f.status !== f.stored_status ? `≠ ${f.stored_status}` : f.stored_status}</td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-[11px] text-text-muted">{t('notes.freshness')}</p>
        </Panel>
        <Panel title={t('sections.batches')}>
          <Table empty={t('empty')} head={[{ label: t('columns.started') }, { label: t('columns.dataset') }, { label: t('columns.producer') }, { label: t('columns.batchStatus') }, { label: t('columns.inserted'), num: true }, { label: t('columns.quarantined'), num: true }, { label: t('columns.failed'), num: true }]}>
            {(data?.batches ?? []).map((b) => (
              <tr key={String(b.batch_id)}>
                <td className={td}>{time(b.started_at)}</td><td className={`${td} font-mono`}>{s(b.dataset)}</td><td className={td}>{s(b.producer)}</td>
                <td className={td}><Pill value={String(b.status)} /></td>
                <td className={num}>{count(b, 'inserted')}</td><td className={num}>{count(b, 'quarantined')}</td><td className={num}>{count(b, 'failed')}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <Panel title={t('sections.quarantine')}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2 text-text-dim">
            <span>{t('columns.dataset')}</span>
            <select value={dataset} disabled={pending !== null} onChange={(e) => { setDataset(e.target.value); setPage(1); }} className="min-h-9 rounded-md border border-border bg-bg-card px-2 font-mono text-text">
              <option value="">{t('all')}</option>
              {datasets.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2 text-text-dim">
            <span className="tabular-nums">{t('page', { page: q?.page ?? page, pages, total: q?.total ?? 0 })}</span>
            <button type="button" disabled={busy || page <= 1} onClick={() => setPage((p) => p - 1)} className="min-h-9 rounded-md border border-border px-2 disabled:opacity-40">{t('prev')}</button>
            <button type="button" disabled={busy || page >= pages} onClick={() => setPage((p) => p + 1)} className="min-h-9 rounded-md border border-border px-2 disabled:opacity-40">{t('next')}</button>
          </div>
        </div>
        <div className="divide-y divide-border rounded-md border border-border sm:hidden">
          {(q?.rows ?? []).map(quarantineCard)}
          {q && q.rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('empty')}</div> : null}
        </div>
        <div className="hidden sm:block">
          <Table empty={t('empty')} head={[{ label: t('columns.time') }, { label: t('columns.dataset') }, { label: t('columns.table') }, { label: t('columns.naturalKey') }, { label: t('columns.reason') }, { label: t('columns.detail') }, { label: t('columns.actions') }]}>
            {(q?.rows ?? []).map((r) => (
              <tr key={String(r.id)} className={pending === String(r.id) ? 'opacity-50' : undefined}>
                <td className={td}>{time(r.created_at)}</td><td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.table_name)}</td>
                <td className={`${td} font-mono`}>{s(r.natural_key)}</td><td className={td}>{s(r.reason_code)}</td>
                <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
                <td className={td}>{actions(r)}</td>
              </tr>
            ))}
          </Table>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">{t('notes.quarantine')}</p>
      </Panel>

      <Panel title={recTitle}>
        <Table empty={t('empty')} head={[{ label: t('columns.dataset') }, { label: t('columns.naturalKey') }, { label: t('columns.leftSource') }, { label: t('columns.leftValue'), num: true }, { label: t('columns.rightSource') }, { label: t('columns.rightValue'), num: true }, { label: t('columns.relDiff'), num: true }, { label: t('columns.tolerance'), num: true }]}>
          {(data?.reconciliations ?? []).map((r) => (
            <tr key={String(r.id)}>
              <td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.natural_key)}</td>
              <td className={td}>{s(r.left_source)}</td><td className={num}>{s(r.left_value)}</td><td className={td}>{s(r.right_source)}</td><td className={num}>{s(r.right_value)}</td>
              <td className={`${num} ${r.passed === false ? 'text-danger' : ''}`}>{pct(r.rel_diff)}</td><td className={num}>{pct(r.tolerance)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );

  function actions(row: Row) {
    const id = String(row.id);
    const key = s(row.natural_key);
    const btn = 'min-h-9 rounded-md border border-border px-3 disabled:opacity-40';
    return (
      <div className="flex gap-2">
        <button type="button" disabled={busy} aria-label={`${t('accept')} ${key}`} onClick={() => resolve(id, 'resolved_accept')} className={`${btn} text-accent`}>{t('accept')}</button>
        <button type="button" disabled={busy} aria-label={`${t('reject')} ${key}`} onClick={() => resolve(id, 'resolved_reject')} className={`${btn} text-danger`}>{t('reject')}</button>
      </div>
    );
  }

  function quarantineCard(row: Row) {
    return (
      <div key={String(row.id)} className={`space-y-1 p-3 text-xs ${pending === String(row.id) ? 'opacity-50' : ''}`}>
        <div className="flex justify-between gap-2 font-mono"><span>{s(row.dataset)} · {s(row.table_name)}</span><span className="text-text-dim">{time(row.created_at)}</span></div>
        <div className="break-all font-mono">{s(row.natural_key)}</div>
        <div className="text-text-dim">{s(row.reason_code)}</div>
        <Detail value={row.detail} className="min-w-0" />
        <div className="py-1">{actions(row)}</div>
      </div>
    );
  }
}
