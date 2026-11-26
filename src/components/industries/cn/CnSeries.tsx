import {useLocale,useTranslations} from 'next-intl';
import {lineSegments} from '@/components/research-ui/chart-gaps';
import type {VendorCell,RunHeader,VendorNode} from '@/lib/industry/vendor/page-read';
import {SourceButton,SourceDot} from '../SourceDrawer';
import {vendorCellPayload} from '../drawer-model';
import {nodeName} from '../hrefs';
import {formatCell} from './format';

interface Props {
 points:VendorCell[];
 metric:string;
 node:VendorNode;
 header:RunHeader;
 tableOnly:boolean;
}

export function CnSeries({points,metric,node,header,tableOnly}:Props) {
 const t=useTranslations('industries');
 const locale=useLocale()==='en'?'en':'zh';
 const name=nodeName(node,locale);
 const payload=(cell:VendorCell)=>vendorCellPayload(name,cell,header);
 // Only geometry uses floating point. All displayed digits come from the original decimal text.
 const values=points.map(p=>p.status==='ok' && p.valueText!==null ? Number(p.valueText) : null);
 const finite=values.filter((v):v is number=>v!==null && Number.isFinite(v));
 const low=Math.min(0,...finite), high=Math.max(0,...finite);
 const extrema=[low,high].filter(v=>v!==0).map(value=>({
  value,label:formatCell(points[values.indexOf(value)],locale,t),
 }));
 const width=550, height=205, right=width-42, top=18, bottom=height-28;
 const left=Math.min(width/2,Math.max(42,...extrema.map(tick=>tick.label.length*7+12)));
 const y=(v:number)=>bottom-(v-low)/(high-low||1)*(bottom-top);
 const ticks=extrema.filter(tick=>Math.abs(y(tick.value)-y(0))>14);
 const projected=points.map((cell,i)=>({
  cell,x:points.length===1?(left+right)/2:left+i/Math.max(1,points.length-1)*(right-left),
  y:values[i]===null || !Number.isFinite(values[i]) ? null : y(values[i]),
 }));
 const tickInterval=Math.max(1,Math.ceil(points.length/5));
 return <div className={tableOnly?'':'grid items-start gap-5 xl:grid-cols-2'}>
  {!tableOnly && <figure className="m-0 min-w-0">
   <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('detail.chartLabel',{industry:name,metric:t(`cnMetrics.${metric}`)})} className="w-full">
    <line data-zero-baseline="" x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="var(--text-dim)" strokeDasharray="4 4" />
    <text x={left-5} y={y(0)+3} textAnchor="end" className="fill-[var(--text-dim)] font-mono text-xs">0</text>
    {ticks.map(tick=><text key={tick.value} x={left-5} y={y(tick.value)+3} textAnchor="end" className="fill-[var(--text-dim)] font-mono text-xs">{tick.label}</text>)}
    {lineSegments(projected).map(segment=><path key={segment[0].cell.periodEnd} data-series-segment=""
      d={segment.map(({x,y},i)=>`${i===0?'M':'L'}${x} ${y}`).join(' ')}
      fill="none" stroke="var(--accent)" strokeWidth={2}/>)}
    {projected.map(({x,y,cell})=>y===null?null:<SourceDot key={cell.periodEnd} cx={x} cy={y} payload={payload(cell)}/>)}
    {projected.filter((_,i)=>i%tickInterval===0||i===points.length-1).map(({x,cell})=><text key={cell.periodEnd} x={x} y={height-5} textAnchor="middle" className="fill-[var(--text-dim)] font-mono text-xs">{cell.periodEnd.slice(0,7)}</text>)}
   </svg>
   <figcaption className="text-xs text-text-dim">{t('cnDetail.chartCaption')}</figcaption>
  </figure>}
  <div className="min-w-0 overflow-x-auto">
   <table className="w-full text-left text-xs">
    <caption className="sr-only">{t('detail.tableEquivalent')}</caption>
    <thead className="text-text-dim"><tr>
     {[t('drawer.period'),t('table.value'),t('cnDetail.memberSet'),t('cnDetail.availableAt')].map(label=><th key={label} scope="col" className="px-1 py-2 font-medium">{label}</th>)}
    </tr></thead>
    <tbody>{[...points].reverse().map(cell=>{
     const d=cell.derived;
     return <tr key={cell.periodEnd} className="border-t border-border">
      <th scope="row" className="px-1 py-2 font-mono font-normal">{cell.periodEnd}</th>
      <td className="px-1"><SourceButton payload={payload(cell)}>{formatCell(cell,locale,t)}</SourceButton></td>
      <td className="px-1">{d?.memberSetChanged && d.memberCounts.previous!==null && d.memberCounts.current!==null
       ?t('cnDetail.changed',{previous:d.memberCounts.previous,current:d.memberCounts.current}):'—'}</td>
      <td className="break-all px-1 font-mono text-text-dim">{header.activatedAt??t('cnDetail.unrecorded')}</td>
     </tr>;
    })}</tbody>
   </table>
  </div>
 </div>;
}
