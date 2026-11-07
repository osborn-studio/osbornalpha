// src/components/company/tracking/EventSummaryText.tsx
// One-line text of a tracking event (spec §7.3; artboards Tracking / M-Tracking). Values come from
// eventSummary: scaled exact decimal text always followed by its currency + scale caption; withheld values
// show their reason only.
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { eventSummary, type EventLocale, type ValueView } from '@/lib/company/event-text';
import type { PublicEvent } from '@/lib/company/event-dto';
import type { ScaleId } from '@/components/company/format';

const SCALE_KEYS: Record<ScaleId, string> = { raw: 'scaleRaw', thousand: 'scaleThousand', million: 'scaleMillion', hundred_million: 'scaleHundredMillion' };

export function useConceptLabel() {
  const tc = useTranslations('company');
  return (concept: string) => (tc.has(`concepts.${concept}`) ? tc(`concepts.${concept}`) : concept);
}

function Value({ v }: { v: ValueView }) {
  const t = useTranslations('tracking');
  const tst = useTranslations('company.statements');
  if (v.kind === 'value') {
    return (
      <>
        <span className="font-mono tabular-nums">{v.text}</span>
        {v.caption && (
          <span className="ml-1 text-[11px] text-text-dim" data-testid="unit-caption">
            {v.caption.scaleId ? `${tst(SCALE_KEYS[v.caption.scaleId])} · ` : ''}{v.caption.unit}
          </span>
        )}
      </>
    );
  }
  if (v.kind === 'withheld') return <span className="text-text-dim">— {t(`withheld.${v.reason}`)}</span>;
  return <span className="text-text-dim">—</span>;
}

export function EventSummaryText({ event }: { event: Pick<PublicEvent, 'kind' | 'payload' | 'meta'> }) {
  const t = useTranslations('tracking');
  const locale: EventLocale = useLocale() === 'en' ? 'en' : 'zh';
  const label = useConceptLabel();
  const s = eventSummary(event, locale);
  if (s.kind === 'filing_published') {
    return (
      <span>
        {s.formType} {s.fiscalYear ?? ''} {s.fiscalPeriod ?? ''}
        {s.factCount !== null && <> · {t('summary.facts', { count: s.factCount })}</>}
      </span>
    );
  }
  if (s.kind === 'period_first_seen') {
    return (
      <span>
        <span className="font-mono">{s.periodEnd}</span> {s.duration}
        {s.headlineAsOf && <span className="text-text-dim"> · {t('summary.headlineAsOf', { date: s.headlineAsOf })}</span>}
        {s.headline.length === 0 && <> · {t('summary.noHeadline')}</>}
        {s.headline.map((h) => (
          <span key={h.concept}> · {label(h.concept)} <Value v={h.value} /></span>
        ))}
        {s.ambiguousUnits.length > 0 && (
          <span className="text-text-dim"> · {t('summary.ambiguous', { concepts: s.ambiguousUnits.map(label).join(t('summary.listSep')) })}</span>
        )}
      </span>
    );
  }
  return (
    <span>
      <span className="font-mono">{s.periodEnd}</span> {s.duration} {label(s.concept)} <Value v={s.from} /> → <Value v={s.to} />
      {s.relChange && <> {t('summary.parenOpen')}<Value v={s.relChange} />{t('summary.parenClose')}</>}
    </span>
  );
}
