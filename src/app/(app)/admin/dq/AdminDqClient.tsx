'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Panel } from '@/components/ui';
import type { DqSummary } from '@/lib/dq/dashboard';
import type { CalendarBlock, ClaimsBlock, ReconciliationsByPair } from '@/lib/dq/dashboard-blocks';
import { conflictCode, quarantineActions, quarantineControl, successNoticeCode, sumByMarket } from '@/lib/dq/dashboard-view';
import { CalendarPanel, ClaimsPanel, ReconciliationPairs } from './panels';
import type { MarketFilter } from './panels';
import { DANGER_BG, Detail, Pill, Table, Tile, btn, count, num, pct, s, td } from './primitives';
import type { Row } from './primitives';

interface DqResponse {
  summary: DqSummary;
  batches24hTruncated: boolean;
  batches: Row[];
  freshness: (Row & { status: string; stored_status: string })[];
  quarantine: { rows: Row[]; page: number; pageSize: number; total: number };
  reconciliations: Row[];
  datasets?: string[];
  calendar: CalendarBlock;
  claims: ClaimsBlock;
  reconciliationsByPair: ReconciliationsByPair;
  refreshedAt: string;
}
type Resolution = 'resolved_accept' | 'resolved_reject';

export function AdminDqClient() {
  const t = useTranslations('admin.dq');
  const locale = useLocale();
  const [dataset, setDataset] = useState('');
  const [market, setMarket] = useState<MarketFilter>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DqResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, number | string>>({});
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams({ page: String(page) });
    if (dataset) qs.set('dataset', dataset);
    if (market) qs.set('market', market);
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
  }, [dataset, market, page, tick, t]);

  const time = (v: unknown) => {
    const d = new Date(String(v ?? ''));
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  /** One POST helper for quarantine and claims; 409 bodies carry a code shown as a notice. */
  async function post(url: string, id: string, body: Record<string, unknown>) {
    setPending(id); setError(null); setNotice(null);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      if (r.ok) {
        if (successNoticeCode(await r.json().catch(() => ({})))) setNotice(t('quarantine.noRowsPromoted'));
        reload();
      } else if (r.status === 409) {
        // The claims route answers 409 {error:<code>}; the quarantine route keeps {id, outcome} and may add
        // detail.restore_note or a top-level restore_note (plan 3 接口对齐记录 #9). All three are read.
        const code = conflictCode(await r.json().catch(() => ({})));
        setNotice(code && t.has(`conflicts.${code}`) ? t(`conflicts.${code}`) : t('alreadyResolved'));
        reload();
      } else if (r.status === 404) { setError(t('notFound')); reload(); }
      else setError(t('resolveFailed'));
    } catch {
      setError(t('resolveFailed'));
    } finally {
      setPending(null);
    }
  }
  const resolve = (id: string, body: { status: Resolution; chosen_candidate_index?: number; keep_fact_id?: string }) => post(`/api/admin/dq/quarantine/${id}`, id, body);
  const resolveClaim = (id: string, body: Record<string, unknown>) => post(`/api/admin/dq/claims/${id}`, id, body);

  const busy = loading || pending !== null;
  const sm = data?.summary;
  const q = data?.quarantine;
  const cal = data?.calendar;
  const today = (data?.refreshedAt ?? new Date().toISOString()).slice(0, 10);
  const pages = q ? Math.max(1, Math.ceil(q.total / q.pageSize)) : 1;
  // Registry inventory (Task 2) ∪ what this response loaded ∪ the current selection, so it never disappears.
  const datasets = Array.from(new Set([
    ...(data?.datasets ?? []),
    ...[...(data?.freshness ?? []), ...(data?.batches ?? []), ...(q?.rows ?? [])].map((r) => String(r.dataset)),
    ...(dataset ? [dataset] : []),
  ])).sort();
  const by = sm?.batchesByStatus ?? {};
  const batchTotal = Object.values(by).reduce((a, b) => a + b, 0);
  const recShown = data?.reconciliations.length ?? 0;
  const recTotal = sm?.failedReconciliationsTotal ?? 0;
  const recTitle = recTotal > recShown
    ? `${t('sections.reconciliations')} · ${t('sections.reconciliationsLatest', { shown: recShown, total: recTotal })}`
    : t('sections.reconciliations');
  const overdue = sumByMarket(cal?.overdueByMarket);

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label={t('tiles.notFresh')} value={sm ? `${sm.notFresh.length} / ${sm.freshnessTotal}` : '—'}
          tone={sm && sm.notFresh.length > 0 ? 'text-warn' : undefined}
          note={sm ? t('tiles.notFreshNote', sm.notFreshByStatus) : null} />
        <Tile label={t('tiles.overdue')} value={cal ? overdue : '—'} tone={overdue > 0 ? 'text-danger' : undefined}
          note={cal ? t('tiles.overdueNote', { us: cal.overdueByMarket.US, cn: cal.overdueByMarket.CN, filed: sumByMarket(cal.filedNotIngestedByMarket), unknown: sumByMarket(cal.unknownUpstreamByMarket) }) : null} />
        <Tile label={t('tiles.openQuarantine')} value={sm ? sm.openQuarantineTotal : '—'} note={t('tiles.openQuarantineNote')} />
        <Tile label={t('tiles.failedReconciliations')} value={sm ? sm.failedReconciliationsTotal : '—'}
          tone={sm && sm.failedReconciliationsTotal > 0 ? 'text-danger' : undefined} />
        <Tile label={t('tiles.batches24h')} value={sm ? `${data?.batches24hTruncated ? '≥' : ''}${batchTotal}` : '—'}
          note={sm ? t('tiles.batchesNote', { success: by.success ?? 0, partial: by.partial ?? 0, failed: by.failed ?? 0 }) : null} />
      </div>

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

      <CalendarPanel t={t} calendar={cal} market={market} onMarket={(m) => setMarket(m)} today={today} busy={busy} />

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
            {(q?.rows ?? []).flatMap((r) => {
              const id = String(r.id);
              const control = quarantineControl(r);
              const inline = control.kind === 'candidates' || control.kind === 'lineage';
              const main = (
                <tr key={id} className={pending === id ? 'opacity-50' : undefined}>
                  <td className={td}>{time(r.created_at)}</td><td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.table_name)}</td>
                  <td className={`${td} font-mono`}>{s(r.natural_key)}</td><td className={td}>{s(r.reason_code)}</td>
                  <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
                  <td className="px-2 py-1.5 align-top">{actions(r, 'table')}</td>
                </tr>
              );
              // Canvas: candidate / keep-row choices sit in a sub-row under the item (Quarantine artboard).
              return inline ? [main, <tr key={`${id}-choice`} className="bg-bg-card"><td colSpan={7} className="px-2 py-2">{choiceBlock(r, 'table')}</td></tr>] : [main];
            })}
          </Table>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">{t('notes.quarantine')}</p>
      </Panel>

      <ClaimsPanel t={t} claims={data?.claims} busy={busy} pending={pending} time={time} onResolve={resolveClaim} />

      <Panel title={recTitle}>
        <ReconciliationPairs t={t} byPair={data?.reconciliationsByPair} time={time} />
        <Table empty={t('empty')} head={[{ label: t('columns.pair') }, { label: t('columns.kind') }, { label: t('columns.outcome') }, { label: t('columns.naturalKey') }, { label: t('columns.leftSource') }, { label: t('columns.leftValue'), num: true }, { label: t('columns.rightSource') }, { label: t('columns.rightValue'), num: true }, { label: t('columns.relDiff'), num: true }, { label: t('columns.tolerance'), num: true }, { label: t('columns.detail') }]}>
          {(data?.reconciliations ?? []).map((r) => (
            <tr key={String(r.id)}>
              <td className={`${td} font-mono`}>{s(r.pair ?? r.dataset)}</td><td className={td}>{s(r.kind)}</td><td className={td}>{s(r.outcome)}</td>
              <td className={`${td} font-mono`}>{s(r.natural_key)}</td>
              <td className={td}>{s(r.left_source)}</td><td className={num}>{s(r.left_value)}</td><td className={td}>{s(r.right_source)}</td><td className={num}>{s(r.right_value)}</td>
              <td className={`${num} ${r.passed === false ? 'text-danger' : ''}`}>{pct(r.rel_diff)}</td><td className={num}>{pct(r.tolerance)}</td>
              <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );

  /** Radios only; the buttons (adopt / keep / acknowledge / accept / restore / reject) come from quarantineActions. */
  function choiceBlock(row: Row, surface: 'table' | 'card') {
    const id = String(row.id);
    const control = quarantineControl(row);
    if (control.kind !== 'candidates' && control.kind !== 'lineage') return null;
    const options = control.kind === 'candidates' ? control.options.map((o) => ({ value: o.index as number | string, label: o.label })) : control.options.map((o) => ({ value: o.factId as number | string, label: o.label }));
    return (
      <fieldset className="space-y-1 text-xs">
        <legend className="text-text-dim">{control.kind === 'candidates' ? t('quarantine.chooseCandidate') : t('quarantine.keepRow')}</legend>
        {options.map((o) => (
          <label key={String(o.value)} className="flex items-center gap-2 font-mono">
            <input type="radio" name={`choice-${surface}-${id}`} checked={choice[id] === o.value} onChange={() => setChoice((c) => ({ ...c, [id]: o.value }))} disabled={busy} />
            <span className="break-all">{o.label}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  function buttons(row: Row) {
    const id = String(row.id);
    const key = s(row.natural_key);
    const control = quarantineControl(row);
    const sel = choice[id] ?? null;
    return (
      <div className="flex flex-wrap gap-2">
        {quarantineActions(control, sel).map((a) => {
          const label = a.id === 'adopt' ? t('quarantine.adopt', { n: typeof sel === 'number' ? sel : '—' })
            : a.id === 'keep' ? t('quarantine.keep')
            : a.id === 'acknowledge' ? t('quarantine.acknowledge')
            : a.id === 'restore' ? t('quarantine.restore.action')
            : a.id === 'reject' ? t('reject') : t('accept');
          return (
            <button key={a.id} type="button" disabled={busy || a.body === null} aria-label={`${label} ${key}`}
              title={a.id === 'restore' && a.body === null && a.reason ? t(`quarantine.restore.${a.reason}`) : undefined}
              onClick={() => a.body && resolve(id, a.body as { status: Resolution })}
              className={`${btn} ${a.id === 'reject' ? 'text-danger' : 'text-accent'}`}>{label}</button>
          );
        })}
      </div>
    );
  }

  function actions(row: Row, surface: 'table' | 'card') {
    const control = quarantineControl(row);
    return (
      <div className="space-y-2">
        {surface === 'card' ? choiceBlock(row, 'card') : null}
        {buttons(row)}
        {control.kind === 'restore' ? <div className={`text-[11px] ${control.enabled ? 'text-text-dim' : 'text-text-muted'}`}>{t(`quarantine.restore.${control.reason}`)}</div> : null}
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
        <div className="py-1">{actions(row, 'card')}</div>
      </div>
    );
  }
}
