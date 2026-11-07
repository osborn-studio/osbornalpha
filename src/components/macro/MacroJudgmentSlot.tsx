'use client';
import { useEffect, useState } from 'react';
import type { RegimeContribution } from '@/lib/macro/types';
import { contributionText, basisFrom, clockFrom, clockMetadataFrom, parseJudgments, type ClockMetadata, type ClockView, type JudgmentCard } from './judgment-view';
import { MacroRegimeClock } from './MacroRegimeClock';
import { RULES, RULES_VERSION } from '@/lib/macro/regime';
import { formatInstant } from './macro-format';
import { useMacroT, type MacroT } from './use-macro-t';
import { pick, type Locale } from './view-model';

type SlotState = { status: 'idle' } | { status: 'loading' } | { status: 'unavailable' } | { status: 'ok'; cards: JudgmentCard[] };

type BasisState = {rows: RegimeContribution[]; rulesVersion: unknown; metadata: ClockMetadata | null} | null | 'error';

function Basis({ rows, snapshotId, t, locale }: { rows: BasisState; snapshotId: string; t: MacroT; locale: Locale }) {
  if (rows === null) return <div className="text-xs text-text-dim">{t('judgment.loading')}</div>;
  if (rows === 'error' || rows.rows.length === 0) return <div className="text-xs text-text-dim">{t('judgment.basisUnavailable')}</div>;
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
        {rows.rows.map((c) => (
          <tr key={`${c.series_id}-${c.rule_id}`} className="border-t border-border">
            <td className="py-1 font-mono"><a className="text-accent" href={`/api/macro/snapshots/${encodeURIComponent(snapshotId)}`}>{c.series_id}</a><div className="max-w-40 break-all text-[10px] text-text-dim">{c.observation_id}</div></td>
            <td className="py-1 font-mono text-text-dim">{rows.rulesVersion === RULES_VERSION ? pick(Object.values(RULES).flat().find(r => r.id === c.rule_id)?.label ?? {en: c.rule_id, zh: c.rule_id}, locale) : c.rule_id}</td>
            <td className="py-1 text-right font-mono tabular-nums">{c.weight}</td>
            <td className="py-1 font-mono tabular-nums">{contributionText(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Fetch basis by the F4 input reference, including when it differs from the overview. */
function Card({ card, rows, t, locale }: { card: JudgmentCard; rows: BasisState; t: MacroT; locale: Locale }) {
  const [basisOpen, setBasisOpen] = useState(false);
  const basisId = card.input_snapshot_id;
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
        {card.settlement_summary && <span className="text-xs text-text-dim">{pick(card.settlement_summary, locale)}</span>}
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
            {basisOpen && <div className="mt-2 overflow-x-auto"><Basis rows={rows} snapshotId={basisId} t={t} locale={locale} /></div>}
          </>
        ) : <span className="text-xs text-text-dim">{t('judgment.basisUnavailable')}</span>}
      </div>
    </article>
  );
}

/** One request supplies both the adjacent limitations and the expandable evidence table. */
function BoundClock({ clock, reason, t, locale }: { clock: ClockView; reason: string | null; t: MacroT; locale: Locale }) {
  const snapshotId = clock.card?.input_snapshot_id;
  const [rows, setRows] = useState<BasisState>(null);
  useEffect(() => {
    if (!snapshotId) return;
    let cancelled = false;
    fetch(`/api/macro/snapshots/${encodeURIComponent(snapshotId)}`)
      .then(async r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(j => {
        const basis = basisFrom(j, snapshotId);
        if (!cancelled) setRows(basis === null ? 'error' : {rows: basis, rulesVersion: j.rulesVersion, metadata: clockMetadataFrom(j, snapshotId)});
      })
      .catch(() => { if (!cancelled) setRows('error'); });
    return () => { cancelled = true; };
  }, [snapshotId]);
  return <>
    <MacroRegimeClock selected={clock.selected} reason={reason} metadata={rows && rows !== 'error' ? rows.metadata : null} metadataLoading={!!snapshotId && rows === null} t={t} />
    {clock.card && <Card card={clock.card} rows={rows} t={t} locale={locale} />}
  </>;
}

export function MacroJudgmentSlot({ region }: { region: 'US' | 'CN' }) {
  const { t, locale } = useMacroT();
  const [open, setOpen] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!open) return;
    const refresh = () => setNonce(n => n + 1);
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [open]);
  const [state, setState] = useState<SlotState>({ status: 'idle' });
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`/api/judgments?subject_type=macro_region&subject_key=${region}&types=macro_regime&view=latest&include_abstained=1`, { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => {
        if (cancelled) return;
        const parsed = parseJudgments(j);
        setState(parsed.ok ? { status: 'ok', cards: parsed.cards } : { status: 'unavailable' });
      })
      .catch(() => { if (!cancelled) setState({ status: 'unavailable' }); });
    return () => { cancelled = true; };
  }, [open, region, nonce]);
  const clock = clockFrom(state.status === 'ok' ? state.cards : [], region);
  const reason = state.status === 'loading' || state.status === 'idle' ? t('judgment.loading') : state.status === 'unavailable' ? t('judgment.unavailable') : clock.reason ? t(`judgment.clock.reasons.${clock.reason}`) + (clock.card?.abstain_reason ? `: ${clock.card.abstain_reason}` : '') : null;
  return (
    <section aria-label={t('judgment.title')} className="space-y-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-left text-sm">
        <span className="text-text">{t('judgment.title')}</span>
        <span className="ml-auto rounded border border-border px-2 py-0.5 text-[11px] text-text-dim">{open ? t('judgment.collapse') : t('judgment.expand')}</span>
      </button>
      {open && <button type="button" onClick={() => setNonce(n => n + 1)} className="text-xs text-accent">{t('judgment.clock.refresh')}</button>}
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
      {open && <BoundClock key={`${clock.card?.judgment_id}:${clock.card?.input_snapshot_id}`} clock={clock} reason={reason} t={t} locale={locale} />}
    </section>
  );
}
