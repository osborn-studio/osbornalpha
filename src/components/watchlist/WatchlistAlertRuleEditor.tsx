'use client';

import { useState } from 'react';
import { Activity, Bell, Gauge, Plus, TrendingDown, TrendingUp, Waves } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WatchlistAlert } from '@/lib/supabase/database.types';
import type { NewWatchlistAlert } from '@/lib/hooks/useWatchlistAlerts';
import { WATCHLIST_ALERT_CATALOG } from '@/lib/watchlist/alert-catalog';
import { alertThresholdUnit, WATCHLIST_ALERT_PRESETS, type WatchlistAlertPresetKey } from '@/lib/watchlist/alert-presets';
import type { WatchlistMetricAlertKey } from '@/lib/watchlist/alert-metrics';
import {
  watchlistAlertCadence,
  watchlistAlertUsesDiscreteCrossing,
} from '@/lib/watchlist/alert-cadence';
import {
  DEFAULT_WATCHLIST_ALERT_DRAFT,
  applyWatchlistAlertPreset,
  watchlistAlertDraftInput,
  watchlistAlertDraftIsNumeric,
  watchlistAlertDraftIsValid,
  type WatchlistAlertDraft,
} from '@/lib/watchlist/alert-draft';

const PRESET_ICONS = {
  priceAbove: TrendingUp,
  priceBelow: TrendingDown,
  largeMove: Activity,
  unusualVolume: Gauge,
  rsiOversold: Waves,
  volatilityHigh: Activity,
  ratingBuy: Bell,
} satisfies Record<WatchlistAlertPresetKey, typeof Bell>;

function metricLabel(metric: unknown, t: ReturnType<typeof useTranslations>): string | null {
  const definition = WATCHLIST_ALERT_CATALOG.metricDefinitions.find((item) => item.key === metric);
  return definition ? t(`metrics.${definition.key}`) : null;
}

function draftLabel(draft: WatchlistAlertDraft, t: ReturnType<typeof useTranslations>) {
  const typeLabel = t(`types.${draft.type}`);
  if (watchlistAlertDraftIsNumeric(draft)) {
    if (!draft.threshold.trim() || !draft.operator) return typeLabel;
    const metric = draft.type === 'valuation'
      ? draft.valuationMetric.toUpperCase()
      : draft.type === 'metric' ? metricLabel(draft.watchlistMetric, t) ?? typeLabel : typeLabel;
    return `${metric} ${t(`operators.${draft.operator}`)} ${draft.threshold}`;
  }
  return draft.discreteValue ? `${typeLabel}: ${t(`values.${draft.discreteValue}`)}` : typeLabel;
}

export function WatchlistAlertRuleEditor({
  idPrefix,
  saving = false,
  submitText,
  onSubmit,
}: {
  idPrefix: string;
  saving?: boolean;
  submitText?: string;
  onSubmit: (input: NewWatchlistAlert) => Promise<boolean>;
}) {
  const t = useTranslations('market.table.drawer.alerts');
  const [draft, setDraft] = useState(DEFAULT_WATCHLIST_ALERT_DRAFT);
  const numeric = watchlistAlertDraftIsNumeric(draft);
  const valid = watchlistAlertDraftIsValid(draft);
  const thresholdUnit = alertThresholdUnit(draft.type, draft.watchlistMetric);
  const cadence = watchlistAlertCadence({ alert_type: draft.type });
  const discreteCrossing = watchlistAlertUsesDiscreteCrossing({ operator: numeric ? draft.operator : null });
  const update = <K extends keyof WatchlistAlertDraft>(key: K, value: WatchlistAlertDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const submit = async () => {
    const input = watchlistAlertDraftInput(draft);
    if (!input) return;
    if (await onSubmit(input)) update('threshold', '');
  };

  return (
    <div>
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-medium text-text-muted">{t('templates')}</div>
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t('templates')}>
          {WATCHLIST_ALERT_PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.key];
            return <button key={preset.key} type="button" onClick={() => setDraft((current) => applyWatchlistAlertPreset(current, preset.key))} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-border bg-bg-elevated px-2.5 text-[11px] text-text-dim hover:border-accent/40 hover:text-text"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{t(`presets.${preset.key}`)}</button>;
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(110px,0.8fr)_auto]">
        <label className="sr-only" htmlFor={`${idPrefix}-type`}>{t('type')}</label>
        <select id={`${idPrefix}-type`} value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as WatchlistAlert['alert_type'], discreteValue: '' }))} className="h-9 border-border bg-bg-elevated px-2 text-xs">
          {WATCHLIST_ALERT_CATALOG.types.map((value) => <option key={value} value={value}>{t(`types.${value}`)}</option>)}
        </select>
        {numeric ? <>
          <label className="sr-only" htmlFor={`${idPrefix}-operator`}>{t('operator')}</label>
          <select id={`${idPrefix}-operator`} value={draft.operator} onChange={(event) => update('operator', event.target.value as NonNullable<WatchlistAlert['operator']>)} className="h-9 border-border bg-bg-elevated px-2 text-xs">
            {WATCHLIST_ALERT_CATALOG.operators.map((value) => <option key={value} value={value}>{t(`operators.${value}`)}</option>)}
          </select>
          {draft.type === 'valuation' || draft.type === 'metric' ? <div className="flex min-w-0 gap-1">
            {draft.type === 'valuation'
              ? <select aria-label={t('valuationMetric')} value={draft.valuationMetric} onChange={(event) => update('valuationMetric', event.target.value as 'pe_ttm' | 'pb')} className="h-9 w-[68px] border-border bg-bg-elevated px-1.5 text-xs"><option value="pe_ttm">PE</option><option value="pb">PB</option></select>
              : <select aria-label={t('metric')} value={draft.watchlistMetric} onChange={(event) => update('watchlistMetric', event.target.value as WatchlistMetricAlertKey)} className="h-9 min-w-0 flex-1 border-border bg-bg-elevated px-1.5 text-xs">{WATCHLIST_ALERT_CATALOG.metricDefinitions.map((definition) => <option key={definition.key} value={definition.key}>{t(`metrics.${definition.key}`)}</option>)}</select>}
            <label className="relative min-w-[72px] flex-1"><span className="sr-only">{t('threshold')}</span><input aria-label={t('threshold')} inputMode="decimal" value={draft.threshold} onChange={(event) => update('threshold', event.target.value)} placeholder={t('threshold')} className={`h-9 min-w-0 w-full text-xs ${thresholdUnit ? 'pr-7' : ''}`} />{thresholdUnit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-text-muted">{thresholdUnit}</span>}</label>
          </div> : <label className="relative min-w-0"><span className="sr-only">{t('threshold')}</span><input aria-label={t('threshold')} inputMode="decimal" value={draft.threshold} onChange={(event) => update('threshold', event.target.value)} placeholder={t('threshold')} className={`h-9 min-w-0 w-full text-xs ${thresholdUnit ? 'pr-7' : ''}`} />{thresholdUnit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-text-muted">{thresholdUnit}</span>}</label>}
        </> : <select value={draft.discreteValue} onChange={(event) => update('discreteValue', event.target.value)} className="h-9 border-border bg-bg-elevated px-2 text-xs sm:col-span-2" aria-label={t('matchValue')}><option value="">{t('selectValue')}</option>{(draft.type === 'event' ? WATCHLIST_ALERT_CATALOG.values.event : draft.type === 'rating' ? WATCHLIST_ALERT_CATALOG.values.rating : WATCHLIST_ALERT_CATALOG.values.perspective).map((value) => <option key={value} value={value}>{t(`values.${value}`)}</option>)}</select>}
        <button type="button" onClick={() => void submit()} disabled={!valid || saving} className={`inline-flex h-9 items-center justify-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50 ${submitText ? '' : 'w-9 px-0'}`} title={submitText ?? t('add')} aria-label={submitText ?? t('add')}><Plus className="h-4 w-4" aria-hidden="true" />{submitText}</button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-[11px] text-text-muted"><span>{t('cooldown')}</span><select value={draft.cooldownMinutes} onChange={(event) => update('cooldownMinutes', Number(event.target.value))} className="h-7 border-border bg-bg-elevated px-2 text-[11px]">{WATCHLIST_ALERT_CATALOG.cooldownMinutes.map((value) => <option key={value} value={value}>{t(`cooldowns.${value}`)}</option>)}</select></label>
      <div className="mt-2 rounded border border-accent/20 bg-accent/5 px-2.5 py-2 text-[11px] text-text-dim"><span className="font-medium text-text">{t('preview')}:</span> {draftLabel(draft, t)}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
        {t(`cadence.${cadence}`)}{discreteCrossing ? ` ${t('discreteCrossing')}` : ''}
      </p>
    </div>
  );
}
