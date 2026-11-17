'use client';
import {useEffect,useState} from 'react';
import {fetchSeriesWindow,windowFrom} from './detail-model';
import {FED_DISPLAY_IDS,type DisplayLoad} from './display-series';
const unavailable:Record<string,DisplayLoad>=Object.fromEntries(FED_DISPLAY_IDS.map(id=>[id,{error:'snapshot_time_unavailable'}]));
export function useDisplaySeries(enabled:boolean,createdAt:string|null|undefined) {
 const [result,setResult]=useState<{createdAt:string;loads:Record<string,DisplayLoad>}|null>(null);
 useEffect(()=>{
  if(!enabled||!createdAt)return;
  let cancelled=false;
  const end=createdAt.slice(0,10);
  setResult({createdAt,loads:{}});
  const update=(id:string,load:DisplayLoad)=>{
   if(!cancelled)setResult(prev=>({createdAt,loads:{...(prev?.createdAt===createdAt?prev.loads:{}),[id]:load}}));
  };
  for(const id of FED_DISPLAY_IDS){
   fetchSeriesWindow(id,windowFrom('y5',end),end,'month','raw',fetch,createdAt)
    .then(data=>update(id,{data}))
    .catch((e:Error)=>update(id,{error:e.message}));
  }
  return ()=>{cancelled=true;};
 },[enabled,createdAt]);
 if(!createdAt)return unavailable;
 return enabled&&result?.createdAt===createdAt?result.loads:{};
}
