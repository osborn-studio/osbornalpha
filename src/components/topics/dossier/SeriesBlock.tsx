// Topic spec §7.2, A17: each line segment has a complete table equivalent.
'use client';
import {useTranslations,useLocale} from 'next-intl';
import {ChartTableSwitch,lineSegments} from '@/components/research-ui';
import type {PublicEvidence} from '@/lib/topics/public-dto';
import {TopicBadge} from '../TopicBadge';
import {evidenceRowModel} from './evidence-row-model';
import {seriesModel} from './series-model';
export function SeriesBlock({rows,onOpenSource}:{rows:PublicEvidence[];onOpenSource:(ordinal:number)=>void}){
 const t=useTranslations('topics'),locale=useLocale(),m=seriesModel(rows);if(!m)return null;
 const values=m.points.flatMap(p=>p.y===null?[]:[p.y]);
 const low=Math.min(...values),high=Math.max(...values),span=high-low||1;
 const x=(index:number)=>20+index*560/Math.max(1,m.points.length-1),y=(value:number)=>160-(value-low)*130/span;
 const chart=<div className="h-[120px] w-full flex flex-col" role="img" aria-label={m.series}>
  <div className="relative min-h-0 flex-1">
   <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="h-full w-full text-accent" aria-hidden="true">
    {lineSegments(m.points).map((segment,i)=><polyline key={i} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={segment.map(p=>`${x(m.points.indexOf(p))},${y(p.y!)}`).join(' ')}/>)}
   </svg>
   {m.points.map((p,i)=>p.y!==null?<span key={i} data-series-point style={{left:`${x(i)/6}%`,top:`${y(p.y)/2}%`}} className="absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"/>:<span key={i} style={{left:`${x(i)/6}%`}} className="absolute top-1/2 -translate-x-1/2 text-[11px] text-text-muted font-mono tabular-nums">{t('states.missing')}</span>)}
  </div>
  <div className="flex justify-between text-[11px] text-text-muted font-mono tabular-nums"><span>{m.points[0]?.x}</span><span>{m.points.at(-1)?.x}</span></div>
 </div>;
 const table=<table className="w-full table-fixed text-left text-xs" aria-label={m.series}><thead><tr>{['period','fact','state'].map(key=><th key={key} scope="col" className="py-2">{t(`dossier.${key}`)}</th>)}</tr></thead><tbody>{m.tableRows.map(e=>{const row=evidenceRowModel(e,locale);return <tr key={e.ordinal} className="border-t border-border"><td className="py-3 font-mono tabular-nums break-words">{row.period}</td><td className="py-3 font-mono tabular-nums break-words">{row.valueButton?<button type="button" className="min-h-[44px] text-accent" onClick={()=>onOpenSource(e.ordinal)}>{row.valueText}</button>:'—'}</td><td className="py-3"><TopicBadge badge={row.stateBadge}/></td></tr>;})}</tbody></table>;
 return <div data-testid="topic-series" className="min-w-0"><ChartTableSwitch chart={chart} table={table} title={m.series}/></div>;
}
