// src/components/industries/PercentileBar.tsx
// Percentile bar (canvas "Entry" components; spec §6.5): single brass fill, the percent text, and
// n / expected. A percentile is a statistic, not an over/under-valued judgment. `value` is a 0..1
// decimal string; null (unpublished or insufficient sample) draws the dashed empty bar.
import {useTranslations} from 'next-intl';
import {percentText} from '@/lib/industry/display';

export function PercentileBar({value,n,expected,width='w-[140px]'}:{value:string|null;n?:number;expected?:number;width?:string}){
  const t=useTranslations('industries.valuation');
  if(value===null){
    return (
      <span className="inline-flex items-center gap-2">
        <span className={`inline-block h-1.5 ${width} rounded-full border border-dashed border-border`} />
        <span className="text-xs text-text-dim">{t('unpublished')}</span>
      </span>
    );
  }
  const pct=percentText(value);
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`relative inline-block h-1.5 ${width} overflow-hidden rounded-full bg-bg-card`}>
        <span className="absolute inset-y-0 left-0 bg-accent" style={{width:`${pct}%`}} />
      </span>
      <span className="font-mono text-xs tabular-nums">{pct}%</span>
      {n!==undefined&&expected!==undefined&&<span className="font-mono text-[11px] tabular-nums text-text-dim">{n}/{expected}</span>}
    </span>
  );
}
