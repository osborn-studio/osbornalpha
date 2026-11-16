'use client';

// /admin/judgments client (spec §9.5, §10; canvas board 5): settle queue (due / backoff / leased / all) from
// GET /api/admin/judgments/queue, actions POST /api/admin/judgments/[id]/{settle,withdraw,reopen} with {reason}. Withdraw and
// reopen require a reason in an accessible dialog; every action is audited server-side (research_audit_log). Quarantine
// items live in /admin/dq.
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminActionResponse, QueueItem, QueueResponse } from '@/components/judgments/api-types';
import { LINK, minute, queueActions, segmentClass, targetText } from '@/components/judgments/view-model';

type Filter = 'due' | 'backoff' | 'leased' | 'all';
const FILTERS: Filter[] = ['due', 'backoff', 'leased', 'all'];
type Pending = { action: 'withdraw' | 'reopen'; item: QueueItem };

async function post(id: string, action: 'settle' | 'withdraw' | 'reopen', reason: string, requestId: string): Promise<AdminActionResponse> {
  // Task 18 adminBody: {reason (1..500 chars, required for withdraw / reopen, optional for settle → null), request_id (uuid; idempotency key)}
  const r = await fetch(`/api/admin/judgments/${encodeURIComponent(id)}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() || null, request_id: requestId }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: { code?: string } }).error?.code ?? `http ${r.status}`);
  return j as AdminActionResponse;
}

function ReasonDialog({ pending, onCancel, onSubmit, busy, notice }: { pending: Pending; onCancel: () => void; onSubmit: (reason: string) => void; busy: boolean; notice: string | null }) {
  const t = useTranslations('judgments');
  const [reason, setReason] = useState('');
  const titleId = useId();
  const fieldId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal(); fieldRef.current?.focus();
    return () => { dialog?.close(); trigger?.focus(); };
  }, []);
  return (
    <dialog ref={dialogRef} aria-modal="true" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }} className="w-[calc(100%-2rem)] max-w-md space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-[var(--text)] backdrop:bg-black/50">
        <h2 id={titleId} className="text-base font-semibold">{t(`ui.admin.${pending.action}Title`)}</h2>
        <p className="num text-xs text-[var(--text-dim)]">{pending.item.judgment_id.slice(0, 8)}… · {pending.item.judgment?.subject_key ?? '—'} · {pending.item.judgment ? `${pending.item.judgment.methodology_id}@${pending.item.judgment.methodology_version}` : '—'}</p>
        {notice && <p role="alert" className="text-sm text-[var(--danger)]">{notice}</p>}
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!busy && reason.trim() && reason.trim().length <= 500) onSubmit(reason.trim()); }}>
          <label htmlFor={fieldId} className="block text-xs text-[var(--text-dim)]">{t('ui.admin.reasonLabel')}</label>
          <textarea id={fieldId} ref={fieldRef} required maxLength={500} disabled={busy} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] p-2 text-sm" />
          <p className="text-[11px] text-[var(--text-muted)]">{t('ui.admin.appendOnlyNote')}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded px-3 py-1.5 text-sm text-[var(--text-dim)] hover:text-[var(--text)]" disabled={busy} onClick={onCancel}>{t('ui.admin.cancel')}</button>
            <button type="submit" disabled={busy || !reason.trim()} className="rounded border border-[var(--down)] px-3 py-1.5 text-sm text-[var(--down)] disabled:opacity-50">{t(`ui.admin.${pending.action}`)}</button>
          </div>
        </form>
    </dialog>
  );
}

export function AdminJudgmentsClient() {
  const t = useTranslations('judgments');
  const [filter, setFilter] = useState<Filter>('due');
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const running = useRef(false);
  // Preserve the key after an ambiguous transport failure; changed payloads get a new key.
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const load = useCallback(async (f: Filter, after?: string) => {
    const version = ++requestVersion.current;
    setLoading(true); setError(null);
    if (!after) setData(null);
    try {
      const r = await fetch(`/api/admin/judgments/queue?filter=${f}&limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: { code?: string } }).error?.code ?? `http ${r.status}`);
      if (version !== requestVersion.current) return;
      const page = j as QueueResponse;
      setData((previous) => after && previous?.filter === f ? { ...page, rows: [...previous.rows, ...page.rows.filter((q) => !previous.rows.some((p) => p.judgment_id === q.judgment_id))] } : page);
    } catch (e) {
      if (version === requestVersion.current) setError(e instanceof Error ? e.message : String(e));
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, []);
  const invalidate = useCallback(() => { requestVersion.current++; }, []);
  useEffect(() => { void load(filter); return invalidate; }, [load, filter, invalidate]);

  async function run(item: QueueItem, action: 'settle' | 'withdraw' | 'reopen', reason: string) {
    if (running.current) return;
    running.current = true;
    const signature = JSON.stringify([item.judgment_id, action, reason.trim()]);
    if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() };
    setBusy(item.judgment_id); setNotice(null);
    try {
      const res = await post(item.judgment_id, action, reason, retry.current.id);
      setNotice(t('ui.admin.done', { action: t(`ui.admin.${action}`), status: res.outcome }));
      retry.current = null;
      setPending(null);
      await load(filter);
    } catch (e) {
      setNotice(t('ui.common.error', { message: e instanceof Error ? e.message : String(e) }));
    } finally { running.current = false; setBusy(null); }
  }
  const cancel = useCallback(() => setPending(null), []);

  const th = 'whitespace-nowrap px-2 py-1.5 font-medium';
  const td = 'whitespace-nowrap px-2 py-1.5';
  const now = data?.now ?? new Date().toISOString();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('ui.admin.title')}</h1>
      <section aria-label={t('ui.admin.summary')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['due', 'backoff', 'leased'] as const).map((k) => (
          <div key={k} className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="text-[11px] text-[var(--text-dim)]">{t(`ui.admin.filters.${k}`)}</div>
            <div className="num mt-1 text-xl font-semibold">{data ? (data.counts[k] >= 500 ? '500+' : data.counts[k]) : '—'}</div>
          </div>
        ))}
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <div className="text-[11px] text-[var(--text-dim)]">{t('ui.admin.quarantine')}</div>
          <Link className={`mt-1 inline-block text-sm ${LINK}`} href="/admin/dq">{t('ui.admin.quarantineLink')}</Link>
        </div>
      </section>
      <div role="group" aria-label={t('ui.admin.filterLabel')} className="inline-flex overflow-hidden rounded border border-[var(--border)] text-xs">
        {FILTERS.map((f) => <button type="button" key={f} disabled={busy !== null} aria-pressed={filter === f} className={`px-2.5 py-1 ${segmentClass(filter === f)}`} onClick={() => setFilter(f)}>{t(`ui.admin.filters.${f}`)}</button>)}
      </div>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{t('ui.common.error', { message: error })}</p>}
      {notice && <p role="status" className="text-sm text-[var(--text-dim)]">{notice}</p>}
      <div className="overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-[960px] text-left text-xs">
          <caption className="sr-only">{t('ui.admin.caption')}</caption>
          <thead className="bg-[var(--bg-card)] text-[var(--text-dim)]">
            <tr>
              <th scope="col" className={th}>{t('ui.admin.columns.judgment')}</th>
              <th scope="col" className={th}>{t('ui.admin.columns.method')}</th>
              <th scope="col" className={th}>{t('ui.admin.columns.target')}</th>
              <th scope="col" className={th}>{t('ui.admin.columns.window')}</th>
              <th scope="col" className={`${th} text-right`}>{t('ui.admin.columns.attempts')}</th>
              <th scope="col" className={th}>{t('ui.admin.columns.next')}</th>
              <th scope="col" className={th}>{t('ui.admin.columns.status')}</th>
              <th scope="col" className={th}>{t('ui.admin.columns.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {(data?.rows ?? []).map((q) => {
              const a = queueActions(q, now);
              const rowBusy = busy !== null || loading;
              return (
                <tr key={q.judgment_id}>
                  <td className={`${td} num`}>{q.judgment_id.slice(0, 8)}… {q.judgment?.subject_key ?? ''}</td>
                  <td className={`${td} num`}>{q.judgment ? `${q.judgment.methodology_id}@${q.judgment.methodology_version}` : '—'}</td>
                  <td className={`${td} num text-[var(--text-dim)]`}>{q.judgment?.target ? targetText(q.judgment.target) : '—'}</td>
                  <td className={`${td} num text-[var(--text-dim)]`}>{minute(q.settle_after)} / {minute(q.settle_by)}</td>
                  <td className={`${td} num text-right`}>{q.attempts}</td>
                  <td className={`${td} num text-[var(--text-dim)]`}>{q.closed_at ? '—' : minute(q.next_attempt_at)}</td>
                  <td className={td}>{q.latest_settlement ? t(`ui.timeline.${q.latest_settlement.kind === 'settled' ? (q.latest_settlement.outcome === 'miss' ? 'settledMiss' : 'settledHit') : q.latest_settlement.kind}`) : q.leased_until && q.leased_until > now ? t('ui.admin.leasedUntil', { at: minute(q.leased_until) }) : q.last_status ? t(`ui.admin.lastStatus.${q.last_status}`) : '—'}{q.last_detail.incident && !q.closed_at ? <Link className={`ml-2 ${LINK}`} href="/admin/dq">{t('ui.admin.quarantine')}</Link> : null}</td>
                  <td className={td}>
                    <span className="flex gap-1.5">
                      <button type="button" disabled={a.settle !== 'enabled' || rowBusy} title={a.settle === 'enabled' ? undefined : t(`ui.admin.settleDisabled.${a.settle}`)} className="rounded border border-[var(--border)] px-2 py-0.5 disabled:opacity-50" onClick={() => run(q, 'settle', 'manual settle from /admin/judgments')}>{a.settle === 'enabled' ? t('ui.admin.settle') : t(`ui.admin.settleDisabled.${a.settle}`)}</button>
                      {a.withdraw && <button type="button" disabled={rowBusy} className="rounded px-2 py-0.5 text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-50" onClick={() => { setNotice(null); setPending({ action: 'withdraw', item: q }); }}>{t('ui.admin.withdrawEllipsis')}</button>}
                      {a.reopen && <button type="button" disabled={rowBusy} className="rounded border border-[var(--border)] px-2 py-0.5 disabled:opacity-50" onClick={() => { setNotice(null); setPending({ action: 'reopen', item: q }); }}>{t('ui.admin.reopen')}</button>}
                    </span>
                  </td>
                </tr>
              );
            })}
            {data && data.rows.length === 0 && <tr><td colSpan={8} className="px-2 py-3 text-[var(--text-muted)]">{t('ui.admin.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
      {loading && <p role="status" className="text-sm text-[var(--text-dim)]">{t('ui.common.loading')}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={loading || busy !== null} onClick={() => load(filter)} className="rounded border border-[var(--border)] px-3 py-2 text-xs">{t('ui.admin.refresh')}</button>
        {data?.next_after && <button type="button" disabled={loading || busy !== null} onClick={() => load(filter, data.next_after ?? undefined)} className="rounded border border-[var(--border)] px-3 py-2 text-xs">{t('ui.admin.more')}</button>}
      </div>
      {pending && <ReasonDialog pending={pending} notice={notice} busy={busy !== null} onCancel={cancel} onSubmit={(reason) => run(pending.item, pending.action, reason)} />}
    </div>
  );
}
