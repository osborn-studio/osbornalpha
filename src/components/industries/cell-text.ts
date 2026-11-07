// src/components/industries/cell-text.ts
// Plain-text rendering of one aggregate cell for accessible names (aria-label / title): the value, the
// coverage ratio, the unresolved count, or the missing reason — the same cases CoverageCell draws.
import {formatMetricValue} from '@/lib/industry/display';
import type {Locale} from '@/lib/industry/display';
import type {PublicCell} from '@/lib/industry/read';
import type {AggMetric} from '@/lib/industry/types';

export type Translate=(key:string,values?:Record<string,string|number>)=>string;

/** reason key shown for a cell that has no value (absent row, missing cell, or an ok cell without a value) */
export function missingReasonOf(cell:PublicCell|null):string{return cell?(cell.missingReason??'empty_set'):'absent';}

export function cellText(cell:PublicCell|null,metric:AggMetric,locale:Locale,t:Translate):string{
  if(!cell||cell.display==='missing'||(cell.display==='value'&&cell.value===null))return t(`missing.${missingReasonOf(cell)}`);
  if(cell.display==='unresolved')return t('coverage.unresolved',{n:cell.nUnresolved});
  if(cell.display==='insufficient')return t('coverage.ratio',{n:cell.nWithData,d:cell.nMembers+cell.nUnresolved});
  return formatMetricValue(metric,cell.value??'',locale);
}
