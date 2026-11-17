'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {getBrowserSupabase} from '@/lib/supabase/client';
import type {PresetCard} from '@/lib/macro/preset-contract';
import {CorrelationResult,type RunJson} from './CorrelationResult';
import {useMacroT} from './use-macro-t';

function PresetResult({card}:{card:PresetCard}){
 const {t}=useMacroT();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [run,setRun]=useState<RunJson|null>(null);
 const attempt=useRef<{requestId:string;runId?:string}|null>(null);
 async function save(){
  setBusy(true);setError(null);
  attempt.current??={requestId:crypto.randomUUID()};
  try{
   if(!attempt.current.runId){
    const r=await fetch('/api/macro/analyses',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({...card.spec,request_id:attempt.current.requestId})});
    const j=await r.json();
    if(j.runId)attempt.current.runId=j.runId;
    if(!r.ok&&!j.runId){
     if(r.status<500)attempt.current=null;
     throw Error(j.error?.code??`http_${r.status}`);
    }
   }
   const runId=attempt.current?.runId;
   if(!runId)throw Error('write_failed');
   const r=await fetch(`/api/macro/analyses/${encodeURIComponent(runId)}`,{credentials:'same-origin',cache:'no-store'});
   const j=await r.json();
   if(!r.ok||!j.run)throw Error(j.error?.code??`http_${r.status}`);
   setRun(j.run);attempt.current=null;
  }catch(e){setError(e instanceof Error?e.message:'network');}
  finally{setBusy(false);}
 }
 return <div className="space-y-2">
  <CorrelationResult run={card} mode="preset" />
  <button type="button" disabled={busy} onClick={()=>void save()} className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50">{busy?t('correlation.submitting'):t('correlation.preset.recalculate')}</button>
  {error&&<div role="alert" className="text-xs text-warn">{t('correlation.preset.saveFailed',{code:error})}</div>}
  {run&&<div className="space-y-2">
   {run.data_hash!==card.data_hash&&<p role="status" className="text-xs text-text-dim">{t('correlation.preset.inputsChanged')}</p>}
   <CorrelationResult run={run}/>
   <Link href={`/macro/analyses/${run.run_id}`} className="text-xs text-accent">{t('correlation.result.openRun')}</Link>
  </div>}
 </div>;
}

export function CorrelationPresetResults({region}:{region:'US'|'CN'}){
 const {t}=useMacroT();
 const [state,setState]=useState<{region:string;cards:PresetCard[];error?:string}|null>(null);
 useEffect(()=>{
  let active=true;let generation=0;
  async function load(){
   const current=++generation;setState(null);
   try{
    const r=await fetch(`/api/macro/analyses/presets?region=${region}`,{credentials:'same-origin',cache:'no-store'});
    const j=await r.json();
    if(!r.ok)throw Error(j.error?.code??`http_${r.status}`);
    if(active&&current===generation)setState({region,cards:j.cards});
   }catch(e){if(active&&current===generation)setState({region,cards:[],error:e instanceof Error?e.message:'network'});}
  }
  void load();
  const {data}=getBrowserSupabase().auth.onAuthStateChange(event=>{if(event!=='INITIAL_SESSION')void load();});
  return ()=>{active=false;generation++;data.subscription.unsubscribe();};
 },[region]);
 return <section aria-label={t('correlation.preset.title')} className="space-y-3">
  <h3 className="text-sm font-semibold">{t('correlation.preset.title')}</h3>
  {!state||state.region!==region?<p role="status" className="text-xs text-text-dim">{t('correlation.preset.loading')}</p>
   :state.error?<p role="alert" className="text-xs text-warn">{t('states.loadFailed',{code:state.error})}</p>
   :state.cards.length===0?<p className="text-xs text-text-dim">{t('correlation.preset.noSnapshot')}</p>
   :state.cards.map(card=><PresetResult key={card.preset_id} card={card}/>)}
 </section>;
}
