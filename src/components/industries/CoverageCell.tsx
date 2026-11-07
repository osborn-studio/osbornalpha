// src/components/industries/CoverageCell.tsx
// The content of one aggregate cell wherever it appears (heatmap, tables): the formatted value, or
// "x/y" (coverage < 0.8), or "z unresolved" (> 5%), or "—" with its missing reason (spec §5.2, §8.2;
// canvas "Entry" coverage badges). Never 0 for missing; Geist Mono, tabular figures.
import {useLocale,useTranslations} from 'next-intl';
import {formatMetricValue} from '@/lib/industry/display';
import type {PublicCell} from '@/lib/industry/read';
import type {AggMetric} from '@/lib/industry/types';
import {missingReasonOf} from './cell-text';

export function CoverageCell({cell,metric}:{cell:PublicCell|null;metric:AggMetric}){
  const t=useTranslations('industries');
  const locale=useLocale()==='en'?'en':'zh';
  if(!cell||cell.display==='missing'||(cell.display==='value'&&cell.value===null)){
    const reason=t(`missing.${missingReasonOf(cell)}`);
    return (<span className="font-mono text-text-dim" title={reason}>—<span className="sr-only"> {reason}</span></span>);
  }
  if(cell.display==='unresolved'){
    return (<span className="rounded-[3px] border border-dashed border-warn px-1 font-mono text-[12px] tabular-nums text-warn">{t('coverage.unresolved',{n:cell.nUnresolved})}</span>);
  }
  if(cell.display==='insufficient'){
    return (<span className="rounded-[3px] border border-dashed border-text-dim px-1 font-mono text-[12px] tabular-nums text-text-dim">{t('coverage.ratio',{n:cell.nWithData,d:cell.nMembers+cell.nUnresolved})}</span>);
  }
  return <span className="font-mono tabular-nums">{formatMetricValue(metric,cell.value??'',locale)}</span>;
}
