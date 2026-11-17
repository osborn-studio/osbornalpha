'use client';
import {useState} from 'react';
import {MarkCard} from '@/components/research-ui/MarkCard';
import {ChartTableSwitch} from '@/components/research-ui/ChartTableSwitch';
import {MacroStateValue} from './MacroState';
import {MacroLineChart} from './charts/MacroLineChart';
import {chartPoints} from './detail-model';
import {displaySeriesRows} from './display-series';
import {useDisplaySeries} from './use-display-series';
import {formatValueText,unitSuffix} from './macro-format';
import {SourceDrawer,type DrawerTarget} from './SourceDrawer';
import {sourceOf,type SeriesObsJson} from './view-model';
import {useMacroT} from './use-macro-t';

export function FedLiquidity({region,createdAt}:{region:'US'|'CN';createdAt?:string|null}) {
 const {t,locale}=useMacroT();
 const loads=useDisplaySeries(region==='US',createdAt);
 const [target,setTarget]=useState<DrawerTarget|null>(null);
 if(region!=='US')return null;
 const rows=displaySeriesRows(region,loads,locale);
 return <><MarkCard kind="fact" title={t('liquidity.title')}>
  <div className="grid gap-3 lg:grid-cols-3">{rows.map(row=>{
   const unit=unitSuffix(row.unit,t);
   const value=(obs:SeriesObsJson)=>`${formatValueText(obs.value_text)}${unit}`;
   const open=(obs:SeriesObsJson)=>setTarget({seriesId:row.id,observationId:obs.observation_id,name:row.name,periodEnd:obs.period_end,display:value(obs),unit:row.unit,source:sourceOf(row.id)});
   const button=(obs:SeriesObsJson)=><button type="button" data-source-value={row.id} className="border-b border-dotted border-accent font-mono tabular-nums" onClick={()=>open(obs)}>{value(obs)}</button>;
   return <article key={row.id} className="min-w-0 space-y-2 rounded border border-border p-3">
    <h3 className="text-sm font-medium">{row.name}</h3>
    {row.latest?<><p>{button(row.latest)}</p><p className="font-mono text-xs text-text-dim">{row.latest.period_end}</p>
     <ChartTableSwitch title={t('detail.chart')} chart={<MacroLineChart points={chartPoints(row.observations,'month')} ariaLabel={row.name} height={180}/>}
      table={<table className="w-full text-xs"><thead><tr><th>{t('detail.columns.period')}</th><th>{t('detail.columns.value')}</th></tr></thead><tbody>{row.observations.map(obs=><tr key={`${obs.period_end}-${obs.observation_id}`}><td className="font-mono">{obs.period_end}</td><td>{button(obs)}</td></tr>)}</tbody></table>}/>
    </>:<MacroStateValue status="missing" detail={row.error==='snapshot_time_unavailable'?t('keyCards.unavailable'):row.error?t('states.loadFailed',{code:row.error}):t('liquidity.missing')}/>}
   </article>;
  })}</div>
 </MarkCard>
  <SourceDrawer target={target} onClose={()=>setTarget(null)} t={t} locale={locale}/>
 </>;
}
