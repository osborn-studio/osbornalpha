'use client';
import {MacroStateValue} from './MacroState';
import {useState} from 'react';
import {useSnapshotTime,type SnapshotTime} from './use-snapshot-time';
import {IndicatorDetail} from './IndicatorDetail';
import {Sparkline} from './charts/Sparkline';
import {useMacroT} from './use-macro-t';
import {keyIndicatorRows, toIndicatorView, type OverviewEnvelopeJson} from './view-model';

/** Cache belongs to this mounted overview; failed lookups never fall back to live history. */
export function KeyIndicatorCards({env, region, snapshotTime}: {snapshotTime?:SnapshotTime; env: OverviewEnvelopeJson; region: 'US'|'CN'}) {
 const {t, locale}=useMacroT();
 const localSnapshotTime=useSnapshotTime(snapshotTime===undefined?env.snapshotId:null);
 const {createdAt,error}=snapshotTime??localSnapshotTime;
 const rows=keyIndicatorRows(env,region);
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set(rows.slice(0,2).map(r=>r.series_id)));
 if(rows.length===0)return null;
 return <section aria-label={t('keyCards.title')} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
  {rows.map(row=>{
   const view=toIndicatorView(row,locale,t);const open=expanded.has(row.series_id);
   return <article key={row.series_id} className="card-base !rounded-md min-w-0 space-y-2">
    <button type="button" aria-expanded={open} aria-controls={`key-card-${row.series_id}`} onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(next.has(row.series_id))next.delete(row.series_id);else next.add(row.series_id);return next;})} className="flex w-full items-baseline justify-between gap-2 text-left">
     <h3 className="text-sm font-semibold">{view.name}</h3><span className="text-xs text-text-dim">{t(open?'keyCards.collapse':'keyCards.expand')}</span>
    </button>
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
     <div><dt className="text-text-dim">{t('keyCards.snapshot')}</dt><dd className="font-mono tabular-nums"><MacroStateValue status={view.muted ? view.status==='active'?'missing':view.status : view.timeliness} value={`${view.value}${view.unit}`} detail={view.reason??undefined}/></dd></div>
     <div><dt className="text-text-dim">{t('detail.period')}</dt><dd className="font-mono">{view.period}</dd></div>
     <div><dt className="text-text-dim">{t('detail.change')}</dt><dd className="font-mono">{view.change?`${view.change.arrow} ${view.change.text}`:'—'}</dd></div>
    </dl>
    <div id={`key-card-${row.series_id}`}>
     {open ? (!view.muted && (createdAt
      ? <IndicatorDetail key={`${row.series_id}|${createdAt}`} seriesId={row.series_id} compact asOf={createdAt} snapshotObservationId={row.observation_id}/>
      : <p role="status" className="text-xs text-text-dim">{t(error||!env.snapshotId?'keyCards.unavailable':'states.loading')}</p>))
      : !view.muted && <Sparkline values={row.sparkline} label={t('table.sparkLabel',{name:view.name})}/>}
    </div>
   </article>;
  })}
 </section>;
}
