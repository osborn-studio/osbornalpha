'use client';

// Plan-3 panels of /admin/dq (spec §7.2; layout per the Claude Design canvas named in the Task 19b
// brief): filing calendar, identifier claims (evidence_only amendment form), reconciliation counts
// by pair. Pure rules live in src/lib/dq/dashboard-view.ts; tokens and components are the existing ones.

import { useRef, useState } from 'react';
import { Panel } from '@/components/ui';
import type { CalendarBlock, ClaimsBlock, ReconciliationsByPair } from '@/lib/dq/dashboard-blocks';
import { AMEND_METHODS, amendBody, claimMode, disclosureTone, overdueDays, suggestedOp, sumByMarket } from '@/lib/dq/dashboard-view';
import type { AmendForm } from '@/lib/dq/dashboard-view';
import { Detail, Pill, STATUS_TONE, Table, btn, num, s, td } from './primitives';
import type { Row, T } from './primitives';

export type MarketFilter = '' | 'US' | 'CN';
const display = (r: Row) => (r.detail as { display?: { ticker?: unknown; name?: unknown } } | null)?.display ?? {};
const deadlineLabel = (t: T, state: unknown) => (t.has(`calendar.deadline.${s(state)}`) ? t(`calendar.deadline.${s(state)}`) : s(state));
const rowKey = (r: Row) => `${s(r.issuer_id)}|${s(r.market)}|${s(r.report_kind)}|${s(r.period_end)}`;

export function CalendarPanel({ t, calendar, market, onMarket, today, busy }: { t: T; calendar: CalendarBlock | undefined; market: MarketFilter; onMarket: (m: MarketFilter) => void; today: string; busy: boolean }) {
  const rows = calendar?.rows ?? [];
  const noRule = calendar?.noRuleRows ?? [];
  const cols = ['issuer', 'market', 'reportKind', 'periodEnd', 'deadlineState', 'dueDate', 'dueRule', 'expectedDate', 'upstreamFiled', 'disclosureState', 'overdueDays'];
  const period = (r: Row) => (
    <>{s(r.period_end)}{r.period_end_estimated === true ? <span className="ml-1 text-text-muted" title={t('calendar.estimatedHint')}>{t('calendar.estimatedMark')}</span> : null}</>
  );
  return (
    <Panel title={t('sections.calendar')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-mono text-[11px] text-text-dim">
          {calendar ? t('calendar.counts', {
            overdue: sumByMarket(calendar.overdueByMarket), filed: sumByMarket(calendar.filedNotIngestedByMarket), unknown: sumByMarket(calendar.unknownUpstreamByMarket),
            estimated: sumByMarket(calendar.estimatedByMarket), noRule: sumByMarket(calendar.noRuleByMarket),
          }) : '—'}
        </span>
        <label className="flex items-center gap-2 text-text-dim">
          <span>{t('calendar.market')}</span>
          <select value={market} disabled={busy} onChange={(e) => onMarket(e.target.value as MarketFilter)} className="min-h-9 rounded-md border border-border bg-bg-card px-2 font-mono text-text">
            <option value="">{t('calendar.allMarkets')}</option><option value="US">US</option><option value="CN">CN</option>
          </select>
        </label>
      </div>
      <p className="mb-2 text-[11px] text-text-muted">{t('calendar.legend')}</p>
      <div className="divide-y divide-border rounded-md border border-border sm:hidden">
        {rows.map((r) => {
          const d = display(r);
          const late = overdueDays(r, today);
          return (
            <div key={rowKey(r)} className="space-y-1 p-3 text-xs">
              <div className="flex items-center justify-between gap-2"><span><span className="font-mono">{s(d.ticker)}</span> <span className="text-text-dim">{s(d.name)}</span></span><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></div>
              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.reportKind')}</span><span className="font-mono">{s(r.market)} · {s(r.report_kind)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.periodEnd')}</span><span className="font-mono">{period(r)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.deadlineState')}</span><span>{deadlineLabel(t, r.deadline_state)} · <span className="font-mono text-text-dim">{s(r.due_rule)}</span></span></div>
              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.dueDate')}</span><span className="font-mono">{s(r.due_date)}</span></div>
              {r.expected_date ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.expectedDate')}</span><span className="font-mono">{s(r.expected_date)}</span></div> : null}
              {r.upstream_filed_date ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.upstreamFiled')}</span><span className="font-mono">{s(r.upstream_filed_date)}</span></div> : null}
              {late ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.overdueDays')}</span><span className="font-mono text-danger">{late}</span></div> : null}
            </div>
          );
        })}
        {rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('calendar.empty')}</div> : null}
      </div>
      <div className="hidden sm:block">
        <Table empty={t('calendar.empty')} head={cols.map((c) => ({ label: t(`calendar.columns.${c}`), num: c === 'overdueDays' }))}>
          {rows.map((r) => {
            const d = display(r);
            const late = overdueDays(r, today);
            return (
              <tr key={rowKey(r)}>
                <td className={td}><span className="font-mono">{s(d.ticker)}</span> <span className="text-text-dim">{s(d.name)}</span></td>
                <td className={td}>{s(r.market)}</td><td className={`${td} font-mono`}>{s(r.report_kind)}</td>
                <td className={`${td} font-mono`}>{period(r)}</td>
                <td className={td}>{deadlineLabel(t, r.deadline_state)}</td>
                <td className={`${td} font-mono`}>{s(r.due_date)}</td><td className={`${td} font-mono text-text-dim`}>{s(r.due_rule)}</td>
                <td className={`${td} font-mono`}>{s(r.expected_date)}</td><td className={`${td} font-mono`}>{s(r.upstream_filed_date)}</td>
                <td className={td}><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></td>
                <td className={`${num} ${late ? 'text-danger' : ''}`}>{late ?? '—'}</td>
              </tr>
            );
          })}
        </Table>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-text-dim">{t('calendar.noRuleTitle', { n: noRule.length })}</summary>
        <div className="mt-2">
          <Table empty={t('calendar.noRuleEmpty')} head={['issuer', 'market', 'reportKind', 'periodEnd', 'dueRule', 'disclosureState'].map((c) => ({ label: t(`calendar.columns.${c}`) }))}>
            {noRule.map((r) => (
              <tr key={rowKey(r)}>
                <td className={`${td} font-mono`}>{s(display(r).ticker)}</td><td className={td}>{s(r.market)}</td><td className={`${td} font-mono`}>{s(r.report_kind)}</td>
                <td className={`${td} font-mono`}>{s(r.period_end)}</td><td className={`${td} font-mono text-text-dim`}>{s(r.due_rule)}</td>
                <td className={td}><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
      <p className="mt-2 text-[11px] text-text-muted">{t('notes.calendar')}</p>
    </Panel>
  );
}

interface Draft { id: string; op: AmendForm['op']; security: string; date: string; method: string }
const securityKey = (x: Row | undefined) => (x ? `${s(x.ticker)}|${s(x.valid_from)}` : '');

export function ClaimsPanel({ t, claims, busy, pending, time, onResolve }: { t: T; claims: ClaimsBlock | undefined; busy: boolean; pending: string | null; time: (v: unknown) => string; onResolve: (id: string, body: Record<string, unknown>) => void }) {
  // One draft shared by the mobile card and the desktop row, so resizing never loses input.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [amendError, setAmendError] = useState<string | null>(null);
  const toggles = useRef<Record<string, HTMLButtonElement | null>>({});
  const rows = claims?.rows ?? [];
  const title = claims && claims.total > rows.length ? `${t('sections.claims')} · ${t('claims.latest', { shown: rows.length, total: claims.total })}` : t('sections.claims');
  const securitiesOf = (r: Row) => claims?.securitiesByIssuer[String(r.issuer_id)] ?? [];
  const focusToggle = (id: string) => {
    // Return focus to the visible toggle of the row (the other surface is display:none).
    setTimeout(() => { for (const k of [`card-${id}`, `table-${id}`]) { const el = toggles.current[k]; if (el && el.offsetParent !== null) { el.focus(); return; } } }, 0);
  };
  const close = (id: string) => { setDraft(null); setAmendError(null); focusToggle(id); };
  const open = (r: Row) => {
    const id = String(r.id);
    if (draft?.id === id) { close(id); return; }
    const op = suggestedOp(r.detail);
    setAmendError(null);
    setDraft({ id, op, security: securityKey(securitiesOf(r)[0]), date: '', method: AMEND_METHODS[op][0] });
  };
  const submit = (r: Row) => {
    if (!draft) return;
    const [ticker, validFrom] = draft.security.split('|');
    const res = amendBody({ op: draft.op, issuerId: String(r.issuer_id), ticker: ticker ?? '', validFrom: validFrom ?? '', date: draft.date, method: draft.method });
    if (!res.ok) { setAmendError(t(`claims.errors.${res.error}`)); return; }
    const id = String(r.id);
    setAmendError(null); setDraft(null); focusToggle(id);
    onResolve(id, res.body);
  };
  const form = (r: Row) => draft && draft.id === String(r.id)
    ? <AmendFormView t={t} draft={draft} onChange={setDraft} securities={securitiesOf(r)} busy={busy} error={amendError} onSubmit={() => submit(r)} onCancel={() => close(draft.id)} />
    : null;
  const controls = (r: Row, surface: 'card' | 'table') => {
    const id = String(r.id);
    const mode = claimMode(r.op);
    if (mode === 'sql_only') return <span className="text-text-muted">{t('claims.sqlOnly')}</span>;
    const acceptLabel = mode === 'amend' ? t('claims.amendAccept') : t('accept');
    return (
      <div className="flex gap-2">
        <button type="button" ref={(el) => { toggles.current[`${surface}-${id}`] = el; }} disabled={busy} className={`${btn} text-accent`} aria-label={`${acceptLabel} ${id}`}
          aria-expanded={mode === 'amend' ? draft?.id === id : undefined}
          onClick={() => (mode === 'amend' ? open(r) : onResolve(id, { status: 'accepted' }))}>{acceptLabel}</button>
        <button type="button" disabled={busy} className={`${btn} text-danger`} aria-label={`${t('reject')} ${id}`} onClick={() => onResolve(id, { status: 'rejected' })}>{t('reject')}</button>
      </div>
    );
  };
  const cells = (r: Row) => {
    const detail = (r.detail ?? {}) as { evidence_kind?: unknown };
    return [time(r.created_at), s(r.issuer_id).slice(0, 8), s(r.op), s(r.id_type), s(r.value), s(detail.evidence_kind), s(r.source)];
  };
  return (
    <Panel title={title}>
      <div className="divide-y divide-border rounded-md border border-border sm:hidden">
        {rows.map((r) => (
          <div key={String(r.id)} className={`space-y-1 p-3 text-xs ${pending === String(r.id) ? 'opacity-50' : ''}`}>
            <div className="flex justify-between gap-2 font-mono"><span>{s(r.op)} · {s(r.id_type)}</span><span className="text-text-dim">{time(r.created_at)}</span></div>
            <div className="break-all font-mono">{s(r.value)}</div>
            <Detail value={r.detail} className="min-w-0" />
            <div className="py-1">{controls(r, 'card')}</div>
            {form(r)}
          </div>
        ))}
        {rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('claims.empty')}</div> : null}
      </div>
      <div className="hidden sm:block">
        <Table empty={t('claims.empty')} head={['time', 'issuer', 'op', 'idType', 'value', 'evidenceKind', 'source', 'detail', 'actions'].map((c) => ({ label: t(`claims.columns.${c}`) }))}>
          {rows.flatMap((r) => {
            const id = String(r.id);
            const main = (
              <tr key={id} className={pending === id ? 'opacity-50' : undefined}>
                {cells(r).map((c, i) => <td key={i} className={`${td} ${i > 0 && i < 5 ? 'font-mono' : ''}`}>{c}</td>)}
                <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
                <td className={td}>{controls(r, 'table')}</td>
              </tr>
            );
            if (draft?.id !== id) return [main];
            return [main, (
              <tr key={`${id}-amend`} className="bg-bg-card"><td colSpan={9} className="px-2 py-2">{form(r)}</td></tr>
            )];
          })}
        </Table>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">{t('notes.claims')}</p>
    </Panel>
  );
}

function AmendFormView({ t, draft, onChange, securities, busy, error, onSubmit, onCancel }: { t: T; draft: Draft; onChange: (d: Draft) => void; securities: Row[]; busy: boolean; error: string | null; onSubmit: () => void; onCancel: () => void }) {
  const field = 'min-h-9 rounded-md border border-border bg-bg-elevated px-2 font-mono text-text';
  const { op } = draft;
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg-card p-2 text-xs" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.op')}
        <select value={op} onChange={(e) => { const next = e.target.value as AmendForm['op']; onChange({ ...draft, op: next, method: AMEND_METHODS[next][0] }); }} className={field}>
          <option value="backdate_window">backdate_window</option><option value="close_security">close_security</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.security')}
        <select value={draft.security} onChange={(e) => onChange({ ...draft, security: e.target.value })} className={field}>
          {securities.map((x) => <option key={securityKey(x)} value={securityKey(x)}>{s(x.ticker)} · {s(x.valid_from)} → {s(x.valid_to)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-text-dim">{op === 'backdate_window' ? t('claims.amend.newValidFrom') : t('claims.amend.validTo')}
        <input type="date" value={draft.date} onChange={(e) => onChange({ ...draft, date: e.target.value })} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.method')}
        <select value={draft.method} onChange={(e) => onChange({ ...draft, method: e.target.value })} className={field}>
          {AMEND_METHODS[op].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy || securities.length === 0} className={`${btn} text-accent`}>{t('claims.amend.submit')}</button>
      <button type="button" onClick={onCancel} className={btn}>{t('claims.amend.cancel')}</button>
      {securities.length === 0 ? <span className="text-text-muted">{t('claims.amend.noSecurities')}</span> : null}
      {error ? <span role="alert" className="text-danger">{error}</span> : null}
    </form>
  );
}

/** Per-pair failure counts as neutral bars (length = failed / max; never up/down colours) plus the pair's latest cycle. */
export function ReconciliationPairs({ t, byPair, time }: { t: T; byPair: ReconciliationsByPair | undefined; time: (v: unknown) => string }) {
  const entries = Object.entries(byPair ?? {});
  const max = Math.max(1, ...entries.map(([, v]) => v.failed));
  return (
    <div className="mb-3 space-y-1.5 text-xs">
      {entries.map(([pair, v]) => (
        <div key={pair} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-full min-w-0 break-all font-mono sm:w-72 sm:shrink-0">{pair}</span>
          <div className="h-2 min-w-20 flex-1 overflow-hidden rounded-sm bg-bg-card" aria-hidden="true"><div className="h-2 bg-text-muted" style={{ width: `${(v.failed / max) * 100}%` }} /></div>
          <span className={`w-14 text-right font-mono tabular-nums ${v.failed > 0 ? 'text-danger' : 'text-text-dim'}`}>{t('reconciliation.failed', { n: v.failed })}</span>
          {v.lastCycle
            ? <span className="flex items-center gap-2"><span className={`rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] ${STATUS_TONE[v.lastCycle.status] ?? 'text-text-dim'}`} title={v.lastCycle.cycle_id}>{t('reconciliation.lastCycle', { status: v.lastCycle.status })}</span><span className="font-mono text-[11px] text-text-muted">{time(v.lastCycle.finished_at)}</span></span>
            : <span className="text-text-muted">{t('reconciliation.noCycle')}</span>}
        </div>
      ))}
    </div>
  );
}
