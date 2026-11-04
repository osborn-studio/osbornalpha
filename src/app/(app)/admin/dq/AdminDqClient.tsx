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
  refreshedAt: string;
}
type Resolution = 'resolved_accept' | 'resolved_reject';

const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pct = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(2)}%`);
const count = (row: Row, key: string) => s((row.counts as Record<string, unknown> | null)?.[key] ?? 0);
const STATUS_TONE: Record<string, string> = {
  fresh: 'text-accent', success: 'text-accent', stale: 'text-warn', partial: 'text-warn', running: 'text-text-dim',
  missing: 'text-up', error: 'text-up', failed: 'text-up', rejected: 'text-up',
};

function Pill({ value }: { value: string }) {
  return <span className={`rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] ${STATUS_TONE[value] ?? 'text-text-dim'}`}>{value}</span>;
}

function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-bg-elevated p-3">
      <div className="truncate text-[11px] text-text-dim" title={label}>{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {note ? <div className="mt-1 truncate text-[11px] text-text-muted">{note}</div> : null}
    </div>
  );
}

function Table({ head, children, empty }: { head: string[]; children: ReactNode[]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] text-left text-xs tabular-nums">
        <thead className="bg-bg-card text-text-dim"><tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {children.length ? children : <tr><td colSpan={head.length} className="px-2 py-3 text-text-muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const td = 'whitespace-nowrap px-2 py-1.5';

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
  const [resolved, setResolved] = useState<Record<string, { status: Resolution; at: string }>>({});
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams({ page: String(page) });
    if (dataset) qs.set('dataset', dataset);
    setLoading(true);
    fetch(`/api/admin/dq?${qs}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<DqResponse>; })
      .then((d) => { setData(d); setResolved({}); setError(null); setLoading(false); })
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
      if (r.ok) setResolved((m) => ({ ...m, [id]: { status, at: new Date().toISOString() } }));
      else if (r.status === 409) { setNotice(t('resolved')); reload(); }
      else { setError(t('resolveFailed')); if (r.status === 404) reload(); }
    } catch {
      setError(t('resolveFailed'));
    } finally {
      setPending(null);
    }
  }

  const sm = data?.summary;
  const q = data?.quarantine;
  const pages = q ? Math.max(1, Math.ceil(q.total / q.pageSize)) : 1;
  const datasets = Array.from(new Set([...(data?.freshness ?? []), ...(data?.batches ?? [])].map((r) => String(r.dataset)))).sort();
  if (dataset && !datasets.includes(dataset)) datasets.unshift(dataset);
  const by = sm?.batchesByStatus ?? {};
  const batchTotal = Object.values(by).reduce((a, b) => a + b, 0);

  return (
    <div data-density="data" className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-xs text-text-dim">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {data ? <span className="rounded border border-border bg-bg-card px-2 py-1 font-mono text-[11px] text-text-dim">{t('refreshedAt', { time: new Date(data.refreshedAt).toLocaleTimeString(locale, { hour12: false }) })}</span> : null}
          <button type="button" onClick={reload} disabled={loading} className="min-h-9 rounded-md border border-border bg-bg-elevated px-3 text-xs hover:text-accent disabled:opacity-50">{loading ? t('loading') : t('refresh')}</button>
        </div>
      </header>

      {notice ? <div role="status" className="rounded-md border border-border bg-bg-card px-3 py-2 text-xs text-warn">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-md bg-down/10 px-3 py-2 text-xs text-down">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t('tiles.notFresh')} value={sm ? `${sm.notFresh.length} / ${sm.freshnessTotal}` : '—'}
          note={sm ? `stale ${sm.notFreshByStatus.stale} · missing ${sm.notFreshByStatus.missing} · error ${sm.notFreshByStatus.error}` : null} />
        <Tile label={t('tiles.openQuarantine')} value={sm ? sm.openQuarantineTotal : '—'} />
        <Tile label={t('tiles.failedReconciliations')} value={sm ? sm.failedReconciliationsTotal : '—'} />
        <Tile label={t('tiles.batches24h')} value={sm ? `${data?.batches24hTruncated ? '≥' : ''}${batchTotal}` : '—'}
          note={sm ? `success ${by.success ?? 0} · partial ${by.partial ?? 0} · failed ${by.failed ?? 0}` : null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('sections.freshness')}>
          <Table empty={t('empty')} head={[t('columns.dataset'), t('columns.cadence'), t('columns.lastOk'), t('columns.status'), t('columns.stored')]}>
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
          <Table empty={t('empty')} head={[t('columns.started'), t('columns.dataset'), t('columns.producer'), t('columns.batchStatus'), t('columns.inserted'), t('columns.quarantined'), t('columns.failed')]}>
            {(data?.batches ?? []).map((b) => (
              <tr key={String(b.batch_id)}>
                <td className={td}>{time(b.started_at)}</td><td className={`${td} font-mono`}>{s(b.dataset)}</td><td className={td}>{s(b.producer)}</td>
                <td className={td}><Pill value={String(b.status)} /></td>
                <td className={td}>{count(b, 'inserted')}</td><td className={td}>{count(b, 'quarantined')}</td><td className={td}>{count(b, 'failed')}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <Panel title={t('sections.quarantine')}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <select value={dataset} onChange={(e) => { setDataset(e.target.value); setPage(1); }} className="min-h-9 rounded-md border border-border bg-bg-card px-2 font-mono">
            <option value="">{t('all')}</option>
            {datasets.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="flex items-center gap-2 text-text-dim">
            <span className="tabular-nums">{t('page', { page: q?.page ?? page, pages, total: q?.total ?? 0 })}</span>
            <button type="button" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)} className="min-h-9 rounded-md border border-border px-2 disabled:opacity-40">{t('prev')}</button>
            <button type="button" disabled={loading || page >= pages} onClick={() => setPage((p) => p + 1)} className="min-h-9 rounded-md border border-border px-2 disabled:opacity-40">{t('next')}</button>
          </div>
        </div>
        <div className="divide-y divide-border rounded-md border border-border sm:hidden">
          {(q?.rows ?? []).map(quarantineCard)}
          {q && q.rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('empty')}</div> : null}
        </div>
        <div className="hidden sm:block">
          <Table empty={t('empty')} head={[t('columns.time'), t('columns.dataset'), t('columns.table'), t('columns.naturalKey'), t('columns.reason'), t('columns.detail'), t('columns.actions')]}>
            {(q?.rows ?? []).map((r) => (
              <tr key={String(r.id)} className={resolved[String(r.id)] ? 'opacity-50' : undefined}>
                <td className={td}>{time(r.created_at)}</td><td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.table_name)}</td>
                <td className={`${td} font-mono`}>{s(r.natural_key)}</td><td className={td}>{s(r.reason_code)}</td>
                <td className="max-w-[16rem] truncate px-2 py-1.5 font-mono text-text-muted" title={JSON.stringify(r.detail)}>{JSON.stringify(r.detail ?? {})}</td>
                <td className={td}>{actions(String(r.id))}</td>
              </tr>
            ))}
          </Table>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">{t('notes.quarantine')}</p>
      </Panel>

      <Panel title={t('sections.reconciliations')}>
        <Table empty={t('empty')} head={[t('columns.dataset'), t('columns.naturalKey'), t('columns.leftSource'), t('columns.leftValue'), t('columns.rightSource'), t('columns.rightValue'), t('columns.relDiff'), t('columns.tolerance')]}>
          {(data?.reconciliations ?? []).map((r) => (
            <tr key={String(r.id)}>
              <td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.natural_key)}</td>
              <td className={td}>{s(r.left_source)}</td><td className={td}>{s(r.left_value)}</td><td className={td}>{s(r.right_source)}</td><td className={td}>{s(r.right_value)}</td>
              <td className={`${td} ${r.passed === false ? 'text-up' : ''}`}>{pct(r.rel_diff)}</td><td className={td}>{pct(r.tolerance)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );

  function actions(id: string) {
    const done = resolved[id];
    if (done) return <span className="text-text-dim">{t('resolved')} · {t(done.status === 'resolved_accept' ? 'accept' : 'reject')} · {time(done.at)}</span>;
    const btn = 'min-h-9 rounded-md border border-border px-3 disabled:opacity-40';
    return (
      <div className="flex gap-2">
        <button type="button" disabled={pending !== null} onClick={() => resolve(id, 'resolved_accept')} className={`${btn} text-accent`}>{t('accept')}</button>
        <button type="button" disabled={pending !== null} onClick={() => resolve(id, 'resolved_reject')} className={`${btn} text-up`}>{t('reject')}</button>
      </div>
    );
  }

  function quarantineCard(row: Row) {
    return (
      <div key={String(row.id)} className={`space-y-1 p-3 text-xs ${resolved[String(row.id)] ? 'opacity-50' : ''}`}>
        <div className="flex justify-between gap-2 font-mono"><span>{s(row.dataset)} · {s(row.table_name)}</span><span className="text-text-dim">{time(row.created_at)}</span></div>
        <div className="break-all font-mono">{s(row.natural_key)}</div>
        <div className="text-text-dim">{s(row.reason_code)}</div>
        <div className="py-1">{actions(String(row.id))}</div>
      </div>
    );
  }
}
