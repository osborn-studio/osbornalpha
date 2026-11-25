import type {SupabaseClient} from '@supabase/supabase-js';
import {callRpc,selectAll,supabaseTableClient,type TableClient,type Row} from '../../db/table-client';
import type {VendorRunKind,Run,RunInput,Retrieval,RetrievalInput,Classification,Membership,Observation,ObservationQuery} from './types';
export {memoryVendorIndustryDb} from './memory-db';

import {VendorDbError,type VendorErrorToken} from './types';
export {VendorDbError} from './types';
/** SEAM — lifecycle stage is OUR judgment (method `industry_lifecycle_stage@v1`, spec §7), never vendor data. A later judgments PR
 * reads facts through this reader; nothing in this module stores, computes or returns a stage. */
export interface VendorObservationReader{
 activeRun(kind:'financials'):Promise<Run|null>;
 observationsOfRun(runId:string,query:ObservationQuery):Promise<Observation[]>;
}
export interface VendorIndustryDb extends VendorObservationReader{
 observationsGrid(runId:string,q:{metrics:string[];periodEnds:string[]}):Promise<Observation[]>;
 recordRetrieval(input:RetrievalInput):Promise<string>;
 createRun(input:RunInput):Promise<{run_id:string;generation:number}>;
 stageClassifications(id:string,rows:Classification[]):Promise<void>;
 stageMemberships(id:string,rows:Membership[]):Promise<void>;
 stageObservations(id:string,rows:Observation[]):Promise<void>;
 activateRun(id:string):Promise<Record<string,number>>;
 failRun(id:string,code:string):Promise<void>;
 activeRun(kind:VendorRunKind):Promise<Run|null>;
 listRuns(kind?:VendorRunKind,limit?:number):Promise<Run[]>;
 classificationsOfRun(id:string):Promise<Classification[]>;
 membershipsOfRun(id:string,code:string):Promise<Membership[]>;
 listRetrievals(limit:number):Promise<Retrieval[]>;
 retrievalsByIds(ids:string[]):Promise<Retrieval[]>;
}
export function vendorDbFromTables(tables:TableClient,reads:Pick<VendorIndustryDb,'observationsOfRun'|'observationsGrid'|'retrievalsByIds'>):VendorIndustryDb{
 async function rpc<T>(fn:string,args:Row):Promise<T>{
  try{return await callRpc(tables,fn,args) as T;}
  catch(e){
   const token=/(?:^|: )(evidence_conflict|retrieval_conflict|invalid_table|run_not_building|wrong_run_kind|retrieval_not_ok|obsolete_run|incomplete_grid|invalid_failure_code|append_only)$/.exec(e instanceof Error?e.message:'');
   throw new VendorDbError(token?token[1] as VendorErrorToken:'vendor_db_failed');
  }
 }
 async function stage(id:string,table:string,rows:Row[]){
  for(let offset=0;offset<Math.max(rows.length,1);offset+=500)
   await rpc('stage_industry_vendor_rows',{p_run:id,p_table:table,p_rows:rows.slice(offset,offset+500)});
 }
 return {
  recordRetrieval:p=>rpc('record_vendor_retrieval',{p}),createRun:p=>rpc('create_industry_vendor_run',{p}),
  stageClassifications:(id,rows)=>stage(id,'classifications',rows),stageMemberships:(id,rows)=>stage(id,'memberships',rows),
  stageObservations:(id,rows)=>stage(id,'observations',rows),activateRun:id=>rpc('activate_industry_vendor_run',{p_run:id}),
  failRun:(id,code)=>rpc('fail_industry_vendor_run',{p_run:id,p_code:code}),
  async activeRun(kind){return (await tables.select('industry_vendor_runs',{kind,status:'active'},{limit:1}))[0] as Run??null;},
  listRuns:(kind,limit=50)=>tables.select('industry_vendor_runs',kind?{kind}:{},{limit,orderBy:'generation',desc:true}) as Promise<Run[]>,
  classificationsOfRun:id=>selectAll(tables,'industry_vendor_classifications',{run_id:id},'code') as Promise<Classification[]>,
  membershipsOfRun:(id,code)=>selectAll(tables,'industry_vendor_memberships',{run_id:id,code},'security_code') as Promise<Membership[]>,
  ...reads,
  listRetrievals:limit=>tables.select('vendor_retrievals',{vendor:'gildata'},{orderBy:'fetched_at',desc:true,limit}) as Promise<Retrieval[]>,
 };
}
// Select the wire decimal text, omitting PostgreSQL's numeric mirror from JSON responses.
export const OBSERVATION_COLUMNS='code,metric,period_start,period_end,duration,status,missing_reason,value_text,unit,vendor_as_of,retrieval_id,locator';
export function supabaseVendorIndustryDb(admin:SupabaseClient):VendorIndustryDb{
 return vendorDbFromTables(supabaseTableClient(admin),{
  async observationsOfRun(runId,{code,metric,from,to}){
   const rows:Observation[]=[];
   for(;;){
    let q=admin.from('industry_vendor_observations').select('*').eq('run_id',runId).eq('code',code);
    if(metric)q=q.eq('metric',metric);
    if(from)q=q.gte('period_end',from);
    if(to)q=q.lte('period_end',to);
    const {data,error}=await q.order('period_end').order('metric').order('duration').range(rows.length,rows.length+499);
    if(error)throw new VendorDbError('vendor_db_failed');
    if(!data?.length)return rows;
    rows.push(...data as Observation[]);
   }
  },
  async observationsGrid(id,{metrics,periodEnds}){
   const rows:Observation[]=[];
   if(!metrics.length||!periodEnds.length)return rows;
   for(;;){
    const {data,error}=await admin.from('industry_vendor_observations').select(OBSERVATION_COLUMNS).eq('run_id',id)
     .in('metric',metrics).in('period_end',periodEnds).order('code').order('period_end').order('metric').order('duration')
     .range(rows.length,rows.length+499);
    if(error)throw new VendorDbError('vendor_db_failed');
    rows.push(...(data??[]) as Observation[]);
    if(!data||data.length<500)return rows;
   }
  },
  async retrievalsByIds(ids){
   const unique=[...new Set(ids)],rows:Retrieval[]=[];
   for(let i=0;i<unique.length;i+=50){
    const {data,error}=await admin.from('vendor_retrievals').select('*').in('retrieval_id',unique.slice(i,i+50));
    if(error)throw new VendorDbError('vendor_db_failed');
    rows.push(...data as Retrieval[]);
   }
   return rows;
  }
 });
}
