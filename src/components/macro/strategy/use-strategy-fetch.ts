// src/components/macro/strategy/use-strategy-fetch.ts
// Client fetch of one strategy API url into a LoadState (spec §9.1 states via loadStateOf). A null url fetches nothing.
import {useCallback,useEffect,useState} from 'react';
import {loadStateOf,type LoadState} from './strategy-view-model';
export function useStrategyFetch<T>(url:string|null):{state:LoadState<T>;reload:()=>void}{
 const [state,setState]=useState<LoadState<T>>({kind:'loading'});
 const [tick,setTick]=useState(0);
 useEffect(()=>{
  if(!url)return;
  let cancelled=false;
  setState({kind:'loading'});
  fetch(url,{credentials:'same-origin',cache:'no-store'})
   .then(async r=>{const body:unknown=await r.json().catch(()=>null);if(!cancelled)setState(loadStateOf<T>(r.status,body));})
   .catch(()=>{if(!cancelled)setState({kind:'error',code:'network'});});
  return ()=>{cancelled=true;};
 },[url,tick]);
 const reload=useCallback(()=>setTick(n=>n+1),[]);
 return {state,reload};
}
