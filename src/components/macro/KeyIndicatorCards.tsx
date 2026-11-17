'use client';
import {useEffect, useRef, useState} from 'react';
import {IndicatorDetail} from './IndicatorDetail';
import {Sparkline} from './charts/Sparkline';
import {useMacroT} from './use-macro-t';
import {keyIndicatorRows, toIndicatorView, type OverviewEnvelopeJson} from './view-model';

/** Cache belongs to this mounted overview; failed lookups never fall back to live history. */
export function KeyIndicatorCards({env, region}: {env: OverviewEnvelopeJson; region: 'US'|'CN'}) {
 const {t, locale}=useMacroT();
 const cache=useRef(new Map<string, Promise<string>>());
 const [snapshot, setSnapshot]=useState<{id:string;createdAt:string|null;error:boolean}|null>(null);
 const rows=keyIndicatorRows(env,region);
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set(rows.slice(0,2).map(r=>r.series_id)));
 useEffect(()=>{
  const id=env.snapshotId;if(!id)return;
  let cancelled=false;
  let pending=cache.current.get(id);
  if(!pending){
   pending=fetch(`/api/macro/snapshots/${encodeURIComponent(id)}`).then(async response=>{
    const body=await response.json();
    const instant=body?.snapshot?.created_at;
    if(!response.ok||body?.snapshot?.snapshot_id!==id||typeof instant!=='string'||!Number.isFinite(Date.parse(instant)))throw new Error('snapshot_unavailable');
    return instant;
   });
   cache.current.set(id,pending);
  }
  pending.then(createdAt=>{if(!cancelled)setSnapshot({id,createdAt,error:false});})
   .catch(()=>{cache.current.delete(id);if(!cancelled)setSnapshot({id,createdAt:null,error:true});});
  return ()=>{cancelled=true;};
 },[env.snapshotId]);
 const createdAt=snapshot?.id===env.snapshotId?snapshot.createdAt:null;
 if(rows.length===0)return null;
 return <section aria-label={t('keyCards.title')} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
  {rows.map(row=>{
   const view=toIndicatorView(row,locale,t);const open=expanded.has(row.series_id);
   return <article key={row.series_id} className="card-base !rounded-md min-w-0 space-y-2">
    <button type="button" aria-expanded={open} aria-controls={`key-card-${row.series_id}`} onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(next.has(row.series_id))next.delete(row.series_id);else next.add(row.series_id);return next;})} className="flex w-full items-baseline justify-between gap-2 text-left">
     <h3 className="text-sm font-semibold">{view.name}</h3><span className="text-xs text-text-dim">{t(open?'keyCards.collapse':'keyCards.expand')}</span>
    </button>
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
     <div><dt className="text-text-dim">{t('keyCards.snapshot')}</dt><dd className="font-mono tabular-nums">{view.value}{view.unit}</dd></div>
     <div><dt className="text-text-dim">{t('detail.period')}</dt><dd className="font-mono">{view.period}</dd></div>
     <div><dt className="text-text-dim">{t('detail.change')}</dt><dd className="font-mono">{view.change?`${view.change.arrow} ${view.change.text}`:'—'}</dd></div>
    </dl>
    {view.muted && <p className="text-xs text-text-dim">{t(`status.${view.status==='active'?'missing':view.status}`)}{view.reason?` · ${view.reason}`:''}</p>}
    <div id={`key-card-${row.series_id}`}>
     {open ? (!view.muted && (createdAt
      ? <IndicatorDetail key={`${row.series_id}|${createdAt}`} seriesId={row.series_id} compact asOf={createdAt} snapshotObservationId={row.observation_id}/>
      : <p role="status" className="text-xs text-text-dim">{t(snapshot?.id===env.snapshotId&&snapshot.error||!env.snapshotId?'keyCards.unavailable':'states.loading')}</p>))
      : !view.muted && <Sparkline values={row.sparkline} label={t('table.sparkLabel',{name:view.name})}/>}
    </div>
   </article>;
  })}
 </section>;
}
