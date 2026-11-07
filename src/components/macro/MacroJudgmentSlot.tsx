'use client';
// MacroJudgmentSlot — F4 judgment card mount (spec §3.2, canvas JudgmentSlot). Rendered only when the server page
// passes judgmentsEnabled (the judgment flag is read server-side, never here). Collapsed by default. Any F4 failure shows
// "判断层暂不可用" and never falls back to macro-computed numbers. A percent appears only when display.percent is a number.
import { useEffect, useState } from 'react';
import type { RegimeContribution } from '@/lib/macro/types';
import { contributionText, contributionsFrom, parseJudgments, percentOf, type JudgmentCard } from './judgment-view';
import { formatInstant } from './macro-format';
import { useMacroT, type MacroT } from './use-macro-t';
import { pick, type Locale } from './view-model';

type SlotState = { status: 'idle' } | { status: 'loading' } | { status: 'unavailable' } | { status: 'ok'; cards: JudgmentCard[] };

function Basis({ snapshotId, t }: { snapshotId: string; t: MacroT }) {
  const [rows, setRows] = useState<RegimeContribution[] | null | 'error'>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/macro/snapshots/${encodeURIComponent(snapshotId)}`)
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => { if (!cancelled) setRows(contributionsFrom(j)); })
      .catch(() => { if (!cancelled) setRows('error'); });
    return () => { cancelled = true; };
  }, [snapshotId]);
  if (rows === null) return <div className="text-xs text-text-dim">{t('judgment.loading')}</div>;
  if (rows === 'error' || rows.length === 0) return <div className="text-xs text-text-dim">{t('judgment.basisUnavailable')}</div>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10px] text-text-dim">
          <th className="py-1 font-medium">{t('judgment.columns.series')}</th>
          <th className="py-1 font-medium">{t('judgment.columns.rule')}</th>
          <th className="py-1 text-right font-medium">{t('judgment.columns.weight')}</th>
          <th className="py-1 font-medium">{t('judgment.columns.contribution')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={`${c.series_id}-${c.rule_id}`} className="border-t border-border">
            <td className="py-1 font-mono">{c.series_id}</td>
            <td className="py-1 font-mono text-text-dim">{c.rule_id}</td>
            <td className="py-1 text-right font-mono tabular-nums">{c.weight}</td>
            <td className="py-1 font-mono tabular-nums">{contributionText(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The contribution basis is the macro snapshot behind the overview; it substantiates a judgment only when that judgment was
 *  computed from exactly this snapshot. Otherwise the basis is stated as unavailable. */
function Card({ card, t, locale, snapshotId }: { card: JudgmentCard; t: MacroT; locale: Locale; snapshotId: string | null }) {
  const [basisOpen, setBasisOpen] = useState(false);
  const percent = percentOf(card);
  const basisId = snapshotId !== null && card.input_snapshot_id === snapshotId ? snapshotId : null;
  return (
    <article className="rounded-md border border-border bg-bg-elevated">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[11px] text-text-dim">
        <span className="rounded border border-border px-2 py-0.5">{t('judgment.lifecycle')}：{t(`judgment.lifecycles.${card.lifecycle}`)}</span>
        <span className="rounded border border-border px-2 py-0.5">{t('judgment.calibration')}：{card.calibration}</span>
        <a href={card.methodology.href} className="rounded border border-border px-2 py-0.5 font-mono">{pick(card.methodology.title, locale)} {card.methodology.version}</a>
      </div>
      <div className="flex flex-wrap items-baseline gap-3 px-4 pb-3">
        <span className="text-[11px] text-text-dim">{t('judgment.primary')}</span>
        <span className="text-xl font-semibold">{pick(card.display.headline, locale)}</span>
        {percent !== null ? <span className="font-mono tabular-nums">{t('judgment.percent', { value: percent })}</span> : <span className="text-[11px] text-text-dim">{t('judgment.noPercent')}</span>}
        {card.lifecycle === 'abstained' && card.abstain_reason && <span className="text-xs text-text-dim">{t('judgment.abstained', { reason: card.abstain_reason })}</span>}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-border px-4 py-2 text-xs text-text-dim">
        <span>{t('judgment.asOf')} <span className="font-mono text-text">{formatInstant(card.as_of)}</span></span>
        {card.input_snapshot_id && <span>{t('judgment.snapshot')} <span className="font-mono text-text">{card.input_snapshot_id}</span></span>}
      </div>
      <div className="border-t border-border px-4 py-2">
        {basisId ? (
          <>
            <button type="button" aria-expanded={basisOpen} onClick={() => setBasisOpen((v) => !v)} className="text-xs text-text">{t('judgment.basis')}</button>
            {basisOpen && <div className="mt-2"><Basis snapshotId={basisId} t={t} /></div>}
          </>
        ) : <span className="text-xs text-text-dim">{t('judgment.basisUnavailable')}</span>}
      </div>
    </article>
  );
}

export function MacroJudgmentSlot({ region, snapshotId }: { region: 'US' | 'CN'; snapshotId: string | null }) {
  const { t, locale } = useMacroT();
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<SlotState>({ status: 'idle' });
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`/api/judgments?subject_type=macro_region&subject_key=${region}`)
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => {
        if (cancelled) return;
        const parsed = parseJudgments(j);
        setState(parsed.ok ? { status: 'ok', cards: parsed.cards } : { status: 'unavailable' });
      })
      .catch(() => { if (!cancelled) setState({ status: 'unavailable' }); });
    return () => { cancelled = true; };
  }, [open, region, nonce]);
  return (
    <section aria-label={t('judgment.title')} className="space-y-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-left text-sm">
        <span className="text-text">{t('judgment.title')}</span>
        <span className="ml-auto rounded border border-border px-2 py-0.5 text-[11px] text-text-dim">{open ? t('judgment.collapse') : t('judgment.expand')}</span>
      </button>
      {open && state.status === 'loading' && <div className="text-xs text-text-dim">{t('judgment.loading')}</div>}
      {open && state.status === 'unavailable' && (
        <div role="status" className="flex items-start gap-3 rounded-md border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-bg-elevated px-4 py-3 text-xs">
          <div className="space-y-1">
            <div className="text-sm font-semibold">{t('judgment.unavailable')}</div>
            <div className="text-text-dim">{t('judgment.unavailableNote')}</div>
          </div>
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="ml-auto rounded border border-border px-3 py-1">{t('judgment.retry')}</button>
        </div>
      )}
      {open && state.status === 'ok' && (state.cards.length === 0
        ? <div className="text-xs text-text-dim">{t('judgment.noCards')}</div>
        : state.cards.map((c) => <Card key={c.judgment_id} card={c} t={t} locale={locale} snapshotId={snapshotId} />))}
    </section>
  );
}
