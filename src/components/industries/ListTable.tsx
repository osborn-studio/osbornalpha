// src/components/industries/ListTable.tsx
// Table view of the list (spec §8.2; canvas "List-Table", "M-List"): the same cells as the heatmap,
// latest period per industry — members (unresolved), latest period end, value, coverage, the stored
// YoY companion for sums ('—' otherwise: no page-side arithmetic), a source button. Below 640px
// code, period and source columns collapse; values stay buttons.
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import {formatMetricValue} from '@/lib/industry/display';
import type {NodeView,PublicCell,RunHeader} from '@/lib/industry/read';
import type {AggMetric,Scheme} from '@/lib/industry/types';
import {CoverageCell} from './CoverageCell';
import {SourceButton} from './SourceDrawer';
import {industryPath,nodeName} from './hrefs';

export function ListTable({scheme,nodes,periodEnds,cells,companion,metric,header,preview}:{scheme:Scheme;nodes:NodeView[];periodEnds:string[];cells:PublicCell[];companion:PublicCell[];metric:AggMetric;header:RunHeader;preview:boolean}){
  const t=useTranslations('industries');
  const locale=useLocale()==='en'?'en':'zh';
  const latest=periodEnds[periodEnds.length-1];
  const at=(list:PublicCell[],code:string)=>list.find(c=>c.code===code&&c.periodEnd===latest)??null;
  return (
    <section aria-label={t('table.label')} className="card-base" style={{padding:'4px 0'}}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-dim">
            <th className="py-2 pl-3 font-normal sm:pl-4">{t('table.industry')}</th>
            <th className="hidden py-2 font-normal sm:table-cell">{t('table.code')}</th>
            <th className="hidden py-2 text-right font-normal sm:table-cell">{t('table.members')}</th>
            <th className="hidden py-2 font-normal sm:table-cell">{t('table.latestPeriod')}</th>
            <th className="py-2 text-right font-normal">{t('table.value')}</th>
            <th className="py-2 text-right font-normal">{t('table.coverage')}</th>
            <th className="py-2 text-right font-normal">{t('table.yoy')}</th>
            <th className="hidden py-2 pr-4 font-normal sm:table-cell">{t('table.source')}</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map(n=>{
            const c=at(cells,n.code),y=at(companion,n.code);const name=nodeName(n,locale);
            const payload=c?{kind:'aggregate' as const,scheme,code:n.code,nodeName:name,cell:c,header,preview}:null;
            return (
              <tr key={n.code} className="border-t border-border">
                <td className="py-1.5 pl-3 sm:pl-4"><Link href={industryPath(scheme,n.code)} className="text-text hover:text-accent">{name}</Link></td>
                <td className="hidden py-1.5 font-mono text-xs text-text-dim sm:table-cell">{n.code}</td>
                <td className="hidden py-1.5 text-right font-mono tabular-nums sm:table-cell">{c?<>{c.nMembers} <span className="text-text-dim">({c.nUnresolved})</span></>:'—'}</td>
                <td className="hidden py-1.5 font-mono text-xs tabular-nums text-text-dim sm:table-cell">{latest??'—'}</td>
                <td className="py-1.5 text-right">{payload?<SourceButton payload={payload} label={`${name} ${latest}`}><CoverageCell cell={c} metric={metric} /></SourceButton>:<CoverageCell cell={null} metric={metric} />}</td>
                <td className="py-1.5 text-right font-mono text-xs tabular-nums text-text-dim">{c?`${c.nWithData}/${c.nMembers+c.nUnresolved}`:'—'}</td>
                <td className="py-1.5 text-right">
                  {y&&y.status==='ok'&&y.value!==null
                    ?<SourceButton payload={{kind:'aggregate',scheme,code:n.code,nodeName:name,cell:y,header,preview}} label={`${name} ${t(`metrics.${y.metric}`)}`} className="text-xs text-text-dim">{formatMetricValue(y.metric,y.value,locale)}</SourceButton>
                    :<span className="font-mono text-xs text-text-dim" title={t('table.yoyNotStored')}>—</span>}
                </td>
                <td className="hidden py-1.5 pr-4 sm:table-cell">{payload&&<SourceButton payload={payload} label={`${t('table.sourceButton')} ${name}`} className="font-sans text-xs text-text-dim">{t('table.sourceButton')}</SourceButton>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-text-dim">{t('table.note')}</p>
    </section>
  );
}
