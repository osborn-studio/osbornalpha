'use client';
import {useEffect,useState} from 'react';
import {hubState,type HubState} from './hub-model';

interface Entry<T>{state:HubState;data:T|null}

// Each endpoint decodes its public response before its destination becomes available.
export function useHubEntry<T>(url:string,decode:(body:unknown)=>T){
 const [entry,setEntry]=useState<Entry<T>>({state:'loading',data:null});
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){
   let status=0;
   let data:T|null=null;
   try{
    const response=await fetch(url,{signal:controller.signal});
    status=response.status;
    if(status===200)data=decode(await response.json());
   }catch{/* Unavailable transport or an invalid public response. */}
   if(!controller.signal.aborted)setEntry({state:hubState(status,data!==null),data});
  }
  void load();
  return ()=>controller.abort();
 },[url,decode]);
 return entry;
}
