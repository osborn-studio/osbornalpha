// Summary cards select stored cells only; suppressed latest cells are never backfilled.
import {useLocale,useTranslations} from 'next-intl';
import type {NodeView,PublicCell,RunHeader} from '@/lib/industry/read';
import type {AggDuration,AggMetric,Scheme} from '@/lib/industry/types-us';
import {CoverageCell} from './CoverageCell';
import {SourceButton} from './SourceDrawer';
import {nodeName} from './hrefs';
export function LatestValues({scheme,node,metric,duration,cells,header,preview}:{scheme:Scheme;node:NodeView;metric:AggMetric;duration:AggDuration;cells:PublicCell[];header:RunHeader;preview:boolean}){
 const t=useTranslations('industries');
 const locale=useLocale()==='en'?'en':'zh';
 const metrics=[...new Set([metric,'revenue_sum' as const])];
 return <>{metrics.map(m=>{
  const basis=m===metric?duration:'12M';
  const cell=cells.filter(c=>c.metric===m&&c.duration===basis).reduce<PublicCell|null>((latest,c)=>!latest||c.periodEnd>latest.periodEnd?c:latest,null);
  if(!cell)return null;
  return <div key={m} className="min-w-0 rounded-md border border-border bg-bg-elevated p-3">
   <div className="text-xs text-text-dim">{t(`metrics.${m}`)} · <span className="font-mono tabular-nums">{cell.periodEnd}</span></div>
   <SourceButton payload={{kind:'aggregate',scheme,code:node.code,nodeName:nodeName(node,locale),cell,header,preview}} label={`${t(`metrics.${m}`)} · ${cell.periodEnd}`} className="my-2 text-xl"><CoverageCell cell={cell} metric={m}/></SourceButton>
   <div className="text-xs text-text-dim">{t('table.coverage')} <span className="font-mono tabular-nums">{cell.nWithData}/{cell.nMembers+cell.nUnresolved}</span></div>
  </div>;
 })}</>;
}
