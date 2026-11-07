// src/components/macro/use-macro-overview.ts
// Client fetch of GET /api/macro/overview (spec §8). Errors surface as a code; there are never placeholder numbers.
import {useEffect,useState} from 'react';
import type {OverviewJson} from './view-model';
export type OverviewState={status:'loading'}|{status:'error';code:string}|{status:'ok';data:OverviewJson};
export function useMacroOverview(query:string):OverviewState{
 const [state,setState]=useState<OverviewState>({status:'loading'});
 useEffect(()=>{
  let cancelled=false;
  setState({status:'loading'});
  fetch(`/api/macro/overview?${query}`)
   .then(async r=>{const b=await r.json().catch(()=>null);if(!r.ok)throw new Error(b?.error?.code??`http_${r.status}`);return b as OverviewJson;})
   .then(data=>{if(!cancelled)setState({status:'ok',data});})
   .catch((e:Error)=>{if(!cancelled)setState({status:'error',code:e.message});});
  return ()=>{cancelled=true;};
 },[query]);
 return state;
}
