import type {EvidenceRef} from '@/lib/evidence/ref';
import type {LatestIdentity,Resolver,ResolveState} from '@/lib/evidence/resolve';
import type {Drift,DriftRow,TopicsDb} from './types';

export function driftOf(frozen:{ref:EvidenceRef;state:ResolveState;value_text:string|null},latest:LatestIdentity|null):Pick<DriftRow,'drift'|'current_identity'>{
 let drift:Drift='unchanged';
 if(frozen.state==='ok'){
  if(!latest)drift='unverifiable';
  else if(latest.state==='retracted')drift='retracted';
  else if(latest.state==='withheld')drift='now_withheld';
  else if(latest.state==='missing')drift='unverifiable';
  else if(latest.object_id!==frozen.ref.id&&latest.value&&latest.value.value_text!==frozen.value_text)
   return {drift:'revised',current_identity:latest.value};
  else if(latest.newer_period)return {drift:'newer_period',current_identity:{period:latest.newer_period,value_text:null,unit:null,available_at:null}};
 }
 return {drift,current_identity:null};
}
export const DRIFT_BATCH=500;
type DriftDb=Pick<TopicsDb,'liveEvidence'|'versionById'|'upsertDrift'|'settings'>;
export async function runDrift(d:{db:DriftDb;resolver:Resolver;now():Date},o:{deadlineMs:number}){
 const end=d.now().getTime()+o.deadlineMs;
 let cursor=(await d.db.settings()).drift_cursor,checked=0;
 const counts:Record<Drift,number>={unchanged:0,revised:0,newer_period:0,retracted:0,now_withheld:0,unverifiable:0};
 // Rows arrive in version order. Only the current version must stay in memory.
 let cachedId:string|undefined;
 const values=new Map<number,string|null>();
 do{
  const batch=await d.db.liveEvidence(cursor,DRIFT_BATCH);
  const rows:DriftRow[]=[];
  for(const {version_id,ordinal,ref,state} of batch){
   if(version_id!==cachedId){
    const version=await d.db.versionById(version_id);
    if(!version)throw new Error('drift_version_missing');
    values.clear();
    for(const item of version.snapshot.evidence){
     const slot=item.resolved.display.fact?.slots.value;
     values.set(item.ordinal,typeof slot==='string'?slot:slot?.value_text??null);
    }
    cachedId=version_id;
   }
   if(!values.has(ordinal))throw new Error('drift_ordinal_missing');
   const latest=state==='ok'?await d.resolver.latestIdentity(ref).catch(()=>null):null;
   const result=driftOf({ref,state,value_text:values.get(ordinal)??null},latest);
   counts[result.drift]++;rows.push({version_id,ordinal,...result});
  }
  const complete=batch.length<DRIFT_BATCH,last=batch.at(-1);
  cursor=complete||!last?null:{version_id:last.version_id,ordinal:last.ordinal};
  await d.db.upsertDrift(rows,d.now().toISOString(),complete,cursor);
  checked+=rows.length;
  if(complete)return {checked,complete,counts};
 }while(d.now().getTime()<end);
 return {checked,complete:false,counts};
}
