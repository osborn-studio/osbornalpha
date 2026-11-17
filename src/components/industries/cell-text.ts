import {unifiedState,type ResearchState} from '@/components/research-ui/states';
import {DISPLAY_MIN_MEMBERS_SIC} from '@/lib/industry/method-constants';
// src/components/industries/cell-text.ts
// Plain-text rendering of one aggregate cell for accessible names (aria-label / title): the value, the
// coverage ratio, the unresolved count, or the missing reason — the same cases CoverageCell draws.
import {formatMetricValue} from '@/lib/industry/display';
import type {Locale} from '@/lib/industry/display';
import type {PublicCell} from '@/lib/industry/read';
import type {AggMetric} from '@/lib/industry/types-us';

export type Translate=(key:string,values?:Record<string,string|number>)=>string;

/** reason key shown for a cell that has no value (absent row, missing cell, or an ok cell without a value) */
export function missingReasonOf(cell:PublicCell|null):string{return cell?(cell.missingReason??'empty_set'):'absent';}

export type DisplayCell=Omit<PublicCell,'display'>&{display:PublicCell['display']|'unlicensed'};
export function cellPresentation(cell:DisplayCell|null,metric:AggMetric,locale:Locale,t:Translate):{state:ResearchState|null;detail?:string;value?:string}{
  if(cell?.display==='unlicensed')return {state:unifiedState('unlicensed')};
  if(!cell||cell.display==='missing'||(cell.display==='value'&&cell.value===null))return {state:unifiedState('missing'),detail:t(`missing.${missingReasonOf(cell as PublicCell|null)}`)};
  if(cell.display==='members')return {state:unifiedState('members'),detail:t('coverage.tooFewMembers',{n:cell.nMembers,min:DISPLAY_MIN_MEMBERS_SIC})};
  if(cell.display==='coverageSic'||cell.display==='insufficient')return {state:unifiedState(cell.display),detail:`${cell.nWithData}/${cell.nMembers+(cell.display==='insufficient'?cell.nUnresolved:0)}`};
  if(cell.display==='unresolved')return {state:unifiedState('low_coverage'),detail:t('coverage.unresolved',{n:cell.nUnresolved})};
  return {state:null,value:formatMetricValue(metric,cell.value??'',locale,cell.unit)};
}
export function cellText(cell:DisplayCell|null,metric:AggMetric,locale:Locale,t:Translate,research?:Translate):string{
  const p=cellPresentation(cell,metric,locale,t);
  return p.state?[research?.(`states.${p.state}`),p.detail].filter(Boolean).join(' '):p.value??'';
}
