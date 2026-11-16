// Client fetch of one strategy API URL. Auth changes invalidate displayed and in-flight responses.
import {useCallback,useEffect,useState} from 'react';
import {getBrowserSupabase} from '@/lib/supabase/client';
import {loadStateOf,type LoadState} from './strategy-view-model';
export function useStrategyFetch<T>(url:string|null):{state:LoadState<T>;reload:()=>void}{
 const [tick,setTick]=useState(0);
 const [result,setResult]=useState<{url:string|null;tick:number;state:LoadState<T>}>({url,tick,state:{kind:'loading'}});
 useEffect(()=>{
  if(!url)return;
  let cancelled=false,generation=0;
  const refresh=()=>{
   const current=++generation;
   setResult({url,tick,state:{kind:'loading'}});
   fetch(url,{credentials:'same-origin',cache:'no-store'})
    .then(async r=>{const body:unknown=await r.json().catch(()=>null);if(!cancelled&&generation===current)setResult({url,tick,state:loadStateOf<T>(r.status,body)});})
    .catch(()=>{if(!cancelled&&generation===current)setResult({url,tick,state:{kind:'error',code:'network'}});});
  };
  refresh();
  const {data:{subscription}}=getBrowserSupabase().auth.onAuthStateChange(event=>{
   if(event!=='INITIAL_SESSION')refresh();
  });
  return ()=>{cancelled=true;subscription.unsubscribe();};
 },[url,tick]);
 const reload=useCallback(()=>setTick(n=>n+1),[]);
 return {state:url!==null&&result.url===url&&result.tick===tick?result.state:{kind:'loading'},reload};
}
