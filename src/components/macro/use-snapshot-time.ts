'use client';
import {useEffect,useRef,useState} from 'react';
export interface SnapshotTime {createdAt:string|null;error:boolean}
/** Resolve the overview's exact instant; never substitute its reporting date or wall clock. */
export function useSnapshotTime(snapshotId:string|null|undefined):SnapshotTime {
 const cache=useRef(new Map<string, Promise<string>>());
 const [snapshot,setSnapshot]=useState<({id:string}&SnapshotTime)|null>(null);
 useEffect(()=>{
  const id=snapshotId;if(!id)return;
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
 },[snapshotId]);
 return snapshot&&snapshot.id===snapshotId ? snapshot : {createdAt:null,error:!snapshotId};
}
