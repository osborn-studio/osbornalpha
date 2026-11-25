import {randomUUID} from 'node:crypto';
import type {VendorIndustryDb} from './db';
import {VendorDbError} from './types';
import type {Run,Classification,Membership,Observation,Retrieval} from './types';

export function memoryVendorIndustryDb():VendorIndustryDb{
 const runs:Run[]=[],retrievals=new Map<string,Retrieval>(),evidence=new Map<string,string>();
 const classes=new Map<string,Classification[]>(),members=new Map<string,Membership[]>(),obs=new Map<string,Observation[]>();
 function building(id:string){
  const run=runs.find(r=>r.run_id===id);
  if(run?.status!=='building')throw new VendorDbError('run_not_building');return run;
 }
 function stage<T extends Classification|Membership|Observation>(id:string,rows:T[],map:Map<string,T[]>,key:(r:T)=>string){
  const run=building(id);
  if((run.kind==='memberships')!==(map===members))throw new VendorDbError('wrong_run_kind');
  const existing=map.get(id)??[],keys=new Set(existing.map(key));
  for(const row of rows){
   if(row.retrieval_id!==null||!('status' in row&&row.status==='missing')){
    const r=retrievals.get(row.retrieval_id??'');
    if(r?.outcome!=='ok'||r.vendor!==run.vendor)throw new VendorDbError('retrieval_not_ok');
   }
   if(keys.has(key(row)))throw new VendorDbError('vendor_db_failed');keys.add(key(row));
  }
  map.set(id,[...existing,...structuredClone(rows)]);
 }
 const obsKey=(r:Pick<Observation,'code'|'period_end'|'metric'|'duration'>)=>JSON.stringify([r.code,r.period_end,r.metric,r.duration]);
 return {
  async recordRetrieval(input){
   const {object_path,content_type,byte_length,...r}=input;
   if(!content_type||byte_length<1||/authorization|bearer|api[_-]?key|secret|token/i.test(JSON.stringify(r.request_canonical)))throw new VendorDbError('vendor_db_failed');
   if(evidence.has(r.sha256)&&evidence.get(r.sha256)!==object_path)throw new VendorDbError('evidence_conflict');
   const prev=retrievals.get(r.retrieval_id);
   if(prev&&prev.sha256!==r.sha256)throw new VendorDbError('retrieval_conflict');
   evidence.set(r.sha256,object_path);if(!prev)retrievals.set(r.retrieval_id,structuredClone(r));return r.retrieval_id;
  },
  async createRun(p){
   const generation=1+Math.max(0,...runs.filter(r=>r.kind===p.kind).map(r=>r.generation));
   const run_id=p.run_id??randomUUID();runs.push({...structuredClone(p),run_id,generation,status:'building',activated_at:null,failure_code:null});
   return {run_id,generation};
  },
  async stageClassifications(id,rows){stage(id,rows,classes,r=>r.code);},
  async stageMemberships(id,rows){stage(id,rows,members,r=>r.code+'/'+r.security_code);},
  async stageObservations(id,rows){stage(id,rows,obs,obsKey);},
  async activateRun(id){
   const run=building(id),prev=runs.find(r=>r.kind===run.kind&&r.status==='active');
   if(prev&&prev.generation>=run.generation)throw new VendorDbError('obsolete_run');
   const {codes,metrics,period_ends}=run.expected_grid;
   const c=classes.get(id)??[],m=members.get(id)??[],o=obs.get(id)??[];
   const actual=new Set((run.kind==='memberships'?m:c).map(r=>r.code));
   if(!codes.length||actual.size!==codes.length||codes.some(code=>!actual.has(code)))throw new VendorDbError('incomplete_grid');
   if(run.kind==='financials'){
    const staged=new Set(o.map(obsKey));
    if(!metrics?.length||!period_ends||o.length!==codes.length*metrics.length*period_ends.length)throw new VendorDbError('incomplete_grid');
    for(const code of codes)for(const period_end of period_ends)for(const pair of metrics)
     if(!staged.delete(obsKey({code,period_end,...pair})))throw new VendorDbError('incomplete_grid');
   }
   if(prev)prev.status='superseded';
   run.status='active';run.activated_at=new Date().toISOString();
   return {memberships:m.length,classifications:c.length,observations:o.length};
  },
  async failRun(id,code){const run=building(id);if(!/^[a-z_]{1,64}$/.test(code))throw new VendorDbError('invalid_failure_code');run.status='failed';run.failure_code=code;},
  async activeRun(kind){return structuredClone(runs.find(r=>r.kind===kind&&r.status==='active')??null);},
  async listRuns(kind,limit=50){return structuredClone(runs.filter(r=>!kind||r.kind===kind).sort((a,b)=>b.generation-a.generation).slice(0,limit));},
  async classificationsOfRun(id){return structuredClone(classes.get(id)??[]);},
  async membershipsOfRun(id,code){return structuredClone((members.get(id)??[]).filter(r=>r.code===code));},
  async observationsOfRun(id,q){return structuredClone((obs.get(id)??[]).filter(r=>r.code===q.code&&(!q.metric||r.metric===q.metric)&&(!q.from||r.period_end>=q.from)&&(!q.to||r.period_end<=q.to)));},
  async observationsGrid(id,{metrics,periodEnds}){
   const rows=(obs.get(id)??[]).filter(r=>metrics.includes(r.metric)&&periodEnds.includes(r.period_end));
   return structuredClone(rows.sort((a,b)=>a.code.localeCompare(b.code)||a.period_end.localeCompare(b.period_end)||
    a.metric.localeCompare(b.metric)||a.duration.localeCompare(b.duration)));
  },
  async listRetrievals(limit){return structuredClone([...retrievals.values()].reverse().sort((a,b)=>b.fetched_at.localeCompare(a.fetched_at)).slice(0,limit));},
  async retrievalsByIds(ids){return structuredClone([...new Set(ids)].flatMap(id=>retrievals.get(id)??[]));},
 };
}
