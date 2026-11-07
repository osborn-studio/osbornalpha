import type { ClockMetadata } from './judgment-view';
import type { Regime } from '@/lib/macro/judgment-contract';
import type { MacroT } from './use-macro-t';

/** The axes describe the four categories; no coordinates or scores are computed from facts. */
export function MacroRegimeClock({ selected, reason, metadata, metadataLoading, t }: { selected: Regime | null; reason: string | null; metadata: ClockMetadata | null; metadataLoading: boolean; t: MacroT }) {
  return (
    <figure className="space-y-3 rounded-md border border-border bg-bg-elevated p-4">
      <figcaption className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">{t('judgment.clock.title')}</h3>
        <span role="status" className={selected ? 'text-sm text-accent' : 'text-xs text-text-dim'}>
          {selected ? `${t('judgment.clock.current')}: ${t(`judgment.clock.${selected}`)}` : reason}
        </span>
      </figcaption>
      <div role="status" className="space-y-1 rounded border border-warn p-3 text-sm text-warn">
        {metadata ? <>
          <p className="font-semibold">{t('judgment.clock.coverage', {value: Math.round(metadata.coverage * 100)})}</p>
          <p>{t('judgment.clock.uncovered', {value: metadata.uncoveredWeight})}</p>
          {(metadata.growth_axis === null || metadata.inflation_axis === null) && <p className="font-semibold">{t('judgment.clock.missingAxis', {axes: [metadata.growth_axis === null ? t('judgment.clock.growth') : '', metadata.inflation_axis === null ? t('judgment.clock.inflation') : ''].filter(Boolean).join(' / ')})}</p>}
          {metadata.margin_pp === 0 && <p className="font-semibold">{t('judgment.clock.tie', {primary: t(`judgment.clock.${metadata.primary_state}`), secondary: metadata.secondary_state ? t(`judgment.clock.${metadata.secondary_state}`) : t('judgment.clock.secondaryUnavailable')})}</p>}
        </> : <p>{t(metadataLoading ? 'judgment.clock.metadataLoading' : 'judgment.clock.metadataUnavailable')}</p>}
      </div>
      <div className="mx-auto max-w-lg space-y-2">
        <div className="text-center text-xs text-text-dim">{t('judgment.clock.growthUp')} ↑</div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
          {(['recovery', 'overheat', 'recession', 'stagflation'] as const).map(regime => (
            <div key={regime} className={`flex min-h-28 flex-col justify-center gap-2 p-4 ${selected === regime ? 'bg-[var(--accent-wash)] text-accent ring-1 ring-inset ring-accent' : 'bg-bg-elevated text-text-dim'}`}>
              <span className="text-sm font-semibold">{t(`judgment.clock.${regime}`)}</span>
              <span className="text-[11px]">{t(`judgment.clock.${regime}Axes`)}</span>
              {selected === regime && <span className="text-xs font-medium">● {t('judgment.clock.current')}</span>}
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-text-dim">↓ {t('judgment.clock.growthDown')}</div>
        <div className="flex justify-between gap-3 border-t border-border pt-2 text-xs text-text-dim">
          <span>← {t('judgment.clock.inflationDown')}</span><span>{t('judgment.clock.inflationUp')} →</span>
        </div>
      </div>
      <p className="text-[11px] text-text-dim">{t('judgment.clock.note')}</p>
    </figure>
  );
}
