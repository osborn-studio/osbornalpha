'use client';
import {MacroStateValue} from '../MacroState';
import type {ReactNode} from 'react';
import type {AssetByCycle} from '@/lib/macro/series-extras';
import type {Cycle} from '@/lib/macro/cycles';
import {assetBarPanels,barGeometry} from './chart-geometry';
import { ChartTableSwitch } from '@/components/research-ui/ChartTableSwitch';
import {cycleKey} from '../detail-model';
import type {MacroT} from '../use-macro-t';

/** Asset returns only: percentage and yield changes have independent, centred scales. */
export function AssetBars({assets,cycles,locale,t,table}:{assets:readonly AssetByCycle[];cycles:readonly Cycle[];locale:'zh'|'en';t:MacroT;table:ReactNode}){
 const panels=assetBarPanels(assets,cycles);
 const chart=<div className="space-y-3">
  {panels.map((panel,index)=>{
   const cycle=cycles[index];
   if(panel.pct.rows.length===0&&panel.bp.rows.length===0)return null;
   return <section key={`${cycle.start}-${cycle.direction}`} className="space-y-2">
    <h4 className="text-xs font-medium">{t(cycleKey(cycle))} · {cycle.start} → {cycle.end}{cycle.ongoing?` · ${t('detail.ongoing')}`:''}</h4>
    <div className="grid gap-3 sm:grid-cols-2">
     {(['pct','bp'] as const).map(unit=>panel[unit].rows.length>0&&<div key={unit} className="space-y-1" role="group" aria-label={unit==='pct'?'%':'bp'}>
      <div className="text-[11px] text-text-dim">{unit==='pct'?'%':'bp'}</div>
      {panel[unit].rows.map(row=>{
       const source=assets.find(a=>a.cycle_index===index&&a.asset_id===row.asset_id);
       const title=t('assetBars.endpoints',{unit:unit==='pct'?'%':'bp',start:cycle.start,end:cycle.end,from:source?.start_period??cycle.start,to:source?.end_period??cycle.end});
       const text=row.value===null?t('assetBars.missing'):row.text;
       const geometry=barGeometry(row.value,panel[unit].domainMax,50);
       return <div key={row.asset_id} title={title} className="grid grid-cols-3 items-center gap-2 text-xs">
        <span className="min-w-0 break-words">{row.name[locale]}</span>
        {row.value===null?<span aria-hidden="true"/>:<svg role="img" aria-label={`${row.name[locale]} · ${text} · ${title}`} viewBox="0 0 100 16" className="h-4 w-full">
         <title>{title}</title>
         <line x1={50} x2={50} y1={0} y2={16} stroke="var(--border)" vectorEffect="non-scaling-stroke"/>
         {geometry.width>0&&<rect x={geometry.x} y={4} width={geometry.width} height={8} fill={row.value<0?'var(--down)':'var(--up)'}/>}
        </svg>}
        <span className={`text-right font-mono tabular-nums ${row.value===null||row.value===0?'text-text-dim':row.value<0?'text-down':'text-up'}`}>{row.value === null ? <MacroStateValue status="missing"/> : text}</span>
       </div>;
      })}
     </div>)}
    </div>
   </section>;
  })}
 </div>;
 return <ChartTableSwitch chart={chart} table={table}/>;
}
