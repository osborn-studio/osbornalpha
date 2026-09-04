'use client';

import { useMemo, useState } from 'react';
import { Bell, BellOff, Check, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WatchlistAlert } from '@/lib/supabase/database.types';
import { useWatchlistAlerts } from '@/lib/hooks/useWatchlistAlerts';
import { WatchlistAlertPreferences } from './WatchlistAlertPreferences';
import { WATCHLIST_ALERT_CATALOG } from '@/lib/watchlist/alert-catalog';

const NUMERIC_TYPES: WatchlistAlert['alert_type'][] = ['price', 'change_pct', 'volume_ratio', 'valuation'];

function alertLabel(alert: WatchlistAlert, t: ReturnType<typeof useTranslations>) {
  const type = t(`types.${alert.alert_type}`);
  if (alert.threshold_numeric == null || !alert.operator) return type;
  const operator = t(`operators.${alert.operator}`);
  const metric = alert.alert_type === 'valuation' && alert.config.metric === 'pb' ? 'PB' : type;
  return `${metric} ${operator} ${alert.threshold_numeric}`;
}

function draftAlertLabel(
  type: WatchlistAlert['alert_type'],
  operator: WatchlistAlert['operator'],
  threshold: string,
  valuationMetric: string,
  discreteValue: string,
  t: ReturnType<typeof useTranslations>,
) {
  const typeLabel = t(`types.${type}`);
  if (NUMERIC_TYPES.includes(type)) {
    if (!threshold.trim() || !operator) return typeLabel;
    const metric = type === 'valuation' ? valuationMetric.toUpperCase() : typeLabel;
    return `${metric} ${t(`operators.${operator}`)} ${threshold}`;
  }
  return discreteValue ? `${typeLabel}: ${t(`values.${discreteValue}`)}` : typeLabel;
}

export function WatchlistAlertPanel({ itemId }: { itemId: string }) {
  const t = useTranslations('market.table.drawer.alerts');
  const model = useWatchlistAlerts(itemId);
  const [type, setType] = useState<WatchlistAlert['alert_type']>('price');
  const [operator, setOperator] = useState<NonNullable<WatchlistAlert['operator']>>('crosses_above');
  const [threshold, setThreshold] = useState('');
  const [valuationMetric, setValuationMetric] = useState<'pe_ttm' | 'pb'>('pe_ttm');
  const [discreteValue, setDiscreteValue] = useState('');
  const [cooldownMinutes, setCooldownMinutes] = useState(1440);
  const numeric = NUMERIC_TYPES.includes(type);
  const valid = numeric ? threshold.trim() !== '' && Number.isFinite(Number(threshold))
    : type === 'event' || type === 'rating' || type === 'perspective' ? !!discreteValue : true;
  const unread = useMemo(() => model.events.filter((event) => !event.read_at).length, [model.events]);

  async function addAlert() {
    if (!valid) return;
    const created = await model.create({
      alertType: type,
      operator: numeric ? operator : null,
      threshold: numeric ? Number(threshold) : null,
      config: type === 'valuation' ? { metric: valuationMetric }
        : type === 'event' ? { kinds: [discreteValue] }
          : type === 'rating' || type === 'perspective' ? { values: [discreteValue] }
            : {},
      cooldownMinutes,
    });
    if (created) setThreshold('');
  }

  return (
    <section className="mt-5 border-t border-border pt-4" aria-label={t('title')}>
      <WatchlistAlertPreferences />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-text">{t('title')}</h3>
        </div>
        {unread > 0 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{t('unread', { count: unread })}</span>}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(110px,0.8fr)_36px]">
        <label className="sr-only" htmlFor={`alert-type-${itemId}`}>{t('type')}</label>
        <select id={`alert-type-${itemId}`} value={type} onChange={(event) => { setType(event.target.value as WatchlistAlert['alert_type']); setDiscreteValue(''); }} className="h-9 border-border bg-bg-elevated px-2 text-xs">
          {(['price', 'change_pct', 'volume_ratio', 'valuation', 'event', 'rating', 'perspective'] as const).map((value) => <option key={value} value={value}>{t(`types.${value}`)}</option>)}
        </select>
        {numeric ? (
          <>
            <label className="sr-only" htmlFor={`alert-operator-${itemId}`}>{t('operator')}</label>
            <select id={`alert-operator-${itemId}`} value={operator} onChange={(event) => setOperator(event.target.value as NonNullable<WatchlistAlert['operator']>)} className="h-9 border-border bg-bg-elevated px-2 text-xs">
              {(['gt', 'gte', 'lt', 'lte', 'crosses_above', 'crosses_below'] as const).map((value) => <option key={value} value={value}>{t(`operators.${value}`)}</option>)}
            </select>
            {type === 'valuation' ? (
              <div className="flex min-w-0 gap-1">
                <select aria-label={t('valuationMetric')} value={valuationMetric} onChange={(event) => setValuationMetric(event.target.value as 'pe_ttm' | 'pb')} className="h-9 w-[68px] border-border bg-bg-elevated px-1.5 text-xs"><option value="pe_ttm">PE</option><option value="pb">PB</option></select>
                <input aria-label={t('threshold')} inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder={t('threshold')} className="h-9 min-w-0 flex-1 text-xs" />
              </div>
            ) : <input aria-label={t('threshold')} inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder={t('threshold')} className="h-9 min-w-0 text-xs" />}
          </>
        ) : <select value={discreteValue} onChange={(event) => setDiscreteValue(event.target.value)} className="h-9 border-border bg-bg-elevated px-2 text-xs sm:col-span-2" aria-label={t('matchValue')}><option value="">{t('selectValue')}</option>{(type === 'event' ? WATCHLIST_ALERT_CATALOG.values.event : type === 'rating' ? WATCHLIST_ALERT_CATALOG.values.rating : WATCHLIST_ALERT_CATALOG.values.perspective).map((value) => <option key={value} value={value}>{t(`values.${value}`)}</option>)}</select>}
        <button type="button" onClick={addAlert} disabled={!valid || model.saving} className="icon-button !h-9 !w-9 !basis-9 bg-accent-dim text-white disabled:opacity-50" title={t('add')} aria-label={t('add')}><Plus className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-[10px] text-text-muted"><span>{t('cooldown')}</span><select value={cooldownMinutes} onChange={(event) => setCooldownMinutes(Number(event.target.value))} className="h-7 border-border bg-bg-elevated px-2 text-[10px]">{WATCHLIST_ALERT_CATALOG.cooldownMinutes.map((value) => <option key={value} value={value}>{t(`cooldowns.${value}`)}</option>)}</select></label>
      <div className="mt-2 rounded border border-accent/20 bg-accent/5 px-2.5 py-2 text-[11px] text-text-dim"><span className="font-medium text-text">{t('preview')}:</span> {draftAlertLabel(type, numeric ? operator : null, threshold, valuationMetric, discreteValue, t)}</div>

      {model.error && <p className="mt-2 text-[11px] text-status-bad" role="alert">{t('error')}</p>}
      {model.loading ? <div className="mt-3 h-12 animate-pulse rounded bg-bg-elevated" /> : (
        <div className="mt-3 divide-y divide-border/70 border-y border-border/70">
          {model.alerts.map((alert) => (
            <div key={alert.id} className="flex min-h-10 items-center gap-2 py-2">
              {alert.enabled ? <Bell className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" /> : <BellOff className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}
              <span className={`min-w-0 flex-1 truncate text-xs ${alert.enabled ? 'text-text' : 'text-text-muted'}`}>{alertLabel(alert, t)}</span>
              <button type="button" disabled={model.saving} onClick={() => void model.update(alert.id, { enabled: !alert.enabled })} className="rounded px-2 py-1 text-[10px] text-text-dim hover:bg-bg-elevated">{alert.enabled ? t('pause') : t('resume')}</button>
              <button type="button" disabled={model.saving} onClick={() => void model.remove(alert.id)} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent text-text-muted hover:text-status-bad" aria-label={t('delete')} title={t('delete')}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </div>
          ))}
          {model.alerts.length === 0 && <div className="py-3 text-xs text-text-muted">{t('empty')}</div>}
        </div>
      )}

      {model.events.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-[10px] font-semibold uppercase text-text-muted">{t('history')}</h4>
          <div className="divide-y divide-border/60">
            {model.events.slice(0, 5).map((event) => (
              <div key={event.id} className="flex w-full items-center gap-2 py-2 text-left">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.read_at ? 'bg-border-active' : 'bg-accent'}`} />
                <button type="button" onClick={() => !event.read_at && void model.markRead(event.id)} className="min-w-0 flex-1 truncate text-left text-[11px] text-text">{String(event.payload.label || t(`types.${event.alert_type}`))}</button>
                {(event.delivery_status === 'failed' || event.delivery_status === 'dead_letter') && <span className="shrink-0 rounded border border-status-bad/25 px-1 py-0.5 text-[9px] text-status-bad">{t(`delivery.${event.delivery_status}`)}</span>}
                <time className="shrink-0 text-[10px] text-text-muted">{new Date(event.triggered_at).toLocaleString()}</time>
                {(event.delivery_status === 'failed' || event.delivery_status === 'dead_letter') ? <button type="button" disabled={model.saving} onClick={() => void model.retryDelivery(event.id)} className="text-[10px] text-accent">{t('delivery.retry')}</button> : !event.read_at && <Check className="h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
