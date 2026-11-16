// Component-local in-flight reuse; every refresh still authenticates on the server.
import {useEffect,useState} from 'react';
import {getBrowserSupabase} from '@/lib/supabase/client';
import {OverviewRequest} from './overview-request';
import type {OverviewJson} from './view-model';
export type OverviewState={status:'loading'}|{status:'error';code:string}|{status:'ok';data:OverviewJson};
export function useMacroOverview(query:string):OverviewState{
 const [requests]=useState(()=>new OverviewRequest());
 const [result,setResult]=useState<{query:string;state:OverviewState}>({query,state:{status:'loading'}});
 useEffect(()=>{
  let cancelled=false,generation=0;
  const refresh=(clear=false)=>{
   const current=++generation;
   if(clear)requests.invalidate();
   setResult(old=>({query,state:!clear&&old.query===query&&old.state.status==='ok'?old.state:{status:'loading'}}));
   requests.load(query)
    .then(data=>{if(!cancelled&&generation===current)setResult({query,state:{status:'ok',data}});})
    .catch((e:Error)=>{if(!cancelled&&generation===current)setResult({query,state:{status:'error',code:e.message}});});
  };
  refresh();
  const onFocus=()=>refresh();
  window.addEventListener('focus',onFocus);
  window.addEventListener('pageshow',onFocus);
  // Recheck the active snapshot/collection and UTC day while the page stays open.
  const timer=window.setInterval(()=>refresh(),60_000);
  const {data:{subscription}}=getBrowserSupabase().auth.onAuthStateChange(event=>{
   if(event!=='INITIAL_SESSION')refresh(true);
  });
  return ()=>{
   cancelled=true;subscription.unsubscribe();window.clearInterval(timer);
   window.removeEventListener('focus',onFocus);window.removeEventListener('pageshow',onFocus);
   // Keep only the in-flight request for React's effect replay. No result is cached here.
  };
 },[query,requests]);
 // A changed query must never show the previous region for the render before its effect runs.
 return result.query===query?result.state:{status:'loading'};
}
