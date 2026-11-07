// src/components/industries/SeriesChart.tsx
// One aggregate series as an SVG line + its table equivalent (spec §8.3; canvas "Detail" §3 and
// "M-Detail": below 640px only the table renders). Every dot and every table value opens the source
// drawer; missing points break the line and appear in the table as '—' with the reason.
import {useLocale,useTranslations} from 'next-intl';
import type {NodeView,PublicCell,RunHeader} from '@/lib/industry/read';
import type {AggMetric,Scheme} from '@/lib/industry/types';
import {CoverageCell} from './CoverageCell';
import {SourceButton,SourceDot} from './SourceDrawer';
import {nodeName} from './hrefs';
import {seriesGeometry} from './series-model';
import type {SeriesPoint} from './series-model';

export function SeriesChart({scheme,node,metric,points,header,preview,tableOnly}:{scheme:Scheme;node:NodeView;metric:AggMetric;points:SeriesPoint[];header:RunHeader;preview:boolean;tableOnly:boolean}){
  const t=useTranslations('industries');
  const locale=useLocale()==='en'?'en':'zh';
  const g=seriesGeometry(points,metric,locale);
  const name=nodeName(node,locale);
  const payload=(cell:PublicCell)=>({kind:'aggregate' as const,scheme,code:node.code,nodeName:name,cell,header,preview});
  const table=(
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-text-dim">{t('detail.tableEquivalent')}</div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-text-dim"><th className="py-1 font-normal">period_end</th><th className="py-1 text-right font-normal">{t(`metrics.${metric}`)}</th><th className="py-1 text-right font-normal">{t('table.coverage')}</th></tr></thead>
        <tbody>
          {[...points].reverse().map(p=>(
            <tr key={p.periodEnd} className="border-t border-border">
              <td className="py-1 font-mono text-xs tabular-nums text-text-dim">{p.periodEnd}</td>
              <td className="py-1 text-right">{p.cell?<SourceButton payload={payload(p.cell)} label={`${name} ${p.periodEnd}`}><CoverageCell cell={p.cell} metric={metric} /></SourceButton>:<CoverageCell cell={null} metric={metric} />}</td>
              <td className="py-1 text-right font-mono text-xs tabular-nums text-text-dim">{p.cell?`${p.cell.nWithData}/${p.cell.nMembers+p.cell.nUnresolved}`:'—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if(tableOnly)return table;
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <figure className="m-0 hidden sm:block">
        <svg viewBox={`0 0 ${g.width} ${g.height}`} width="100%" role="img" aria-label={t('detail.chartLabel',{industry:name,metric:t(`metrics.${metric}`)})}>
          <g className="stroke-[var(--border)]" strokeWidth={1}>
            {g.yTicks.map(tk=><line key={tk.y} x1={g.pad.l} x2={g.width-g.pad.r} y1={tk.y} y2={tk.y} />)}
          </g>
          <g className="fill-[var(--text-dim)] font-mono" fontSize={11}>
            {g.yTicks.map(tk=><text key={tk.y} x={g.pad.l-8} y={tk.y+4} textAnchor="end">{tk.label}</text>)}
            {g.xLabels.map(l=><text key={l.x} x={l.x} y={g.height-8} textAnchor="middle">{l.label}</text>)}
          </g>
          {g.segments.map(d=><path key={d} d={d} fill="none" className="stroke-[var(--accent)]" strokeWidth={2} />)}
          {g.dots.map(d=><SourceDot key={d.periodEnd} cx={d.x} cy={d.y} label={`${name} ${d.periodEnd}`} payload={payload(d.cell)} />)}
        </svg>
        <figcaption className="text-xs text-text-dim">{t('detail.chartCaption')}</figcaption>
      </figure>
      {table}
    </div>
  );
}
