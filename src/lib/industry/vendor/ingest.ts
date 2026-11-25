import {randomUUID} from 'node:crypto';
import type {TableClient} from '../../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../../dq/batches';
import {recordAttempt} from '../../dq/freshness';
import {quarantine} from '../../dq/quarantine';
import {budgetFor} from '../../facts/providers/shared';
import {canonicalRequest,VendorError,type VendorSource} from '../../vendor/source';
import {vendorRawPath,type VendorRawStore} from '../../vendor/raw-store';
import {swL1Members,swL1Financials} from '../../vendor/gildata/templates';
import {parseSwL1Members,MEMBERS_PARSER_VERSION} from '../../vendor/gildata/parse-members';
import {parseSwL1Financials,FINANCIAL_METRICS,FINANCIALS_PARSER_VERSION} from '../../vendor/gildata/parse-financials';
import {decodeGildataBody,GildataParseError} from '../../vendor/gildata/envelope';
import {canonicalJson,sha256Hex} from '../canonical-json';
import type {RunnerReceipt} from '../jobs';
import {SW2021_L1_GILDATA,SW2021_GILDATA_MAPPING_VERSION} from './sw2021-gildata-codes';
import {VendorDbError,type VendorIndustryDb} from './db';
import {FRESHNESS,VENDOR_DATASET_KEYS,failedReceipt,type Mode,type VendorRunKind,type Membership,type Classification,type Observation,type RetrievalInput} from './types';

export interface VendorDeps{
 source:VendorSource|null;raw?:VendorRawStore;db?:VendorIndustryDb;tables?:TableClient;now:()=>Date;codeVersion:string|null;
 universe?:typeof SW2021_L1_GILDATA;
}
export interface VendorOptions{mode:Mode;triggeredBy:'cron'|'script';l1Codes?:string[];fromYear?:number;toYear?:number;deadlineMs?:number}
class Deadline extends Error{}
function errorCode(e:unknown){
 if(e instanceof Deadline)return 'time_budget_exceeded';
 if(e instanceof VendorDbError||e instanceof VendorError)return e.code;
 if(e instanceof GildataParseError)return e.outcome+':'+e.reason;
 return 'vendor_ingest_failed';
}
function contentHash(members:Membership[],classes:Classification[],observations:Observation[]){
 // Project only semantic columns. Exact decimal strings distinguish vendor precision.
 function sorted<T extends Record<string,string|null>>(rows:T[],keys:(keyof T)[]){
  return rows.sort((a,b)=>{
   for(const key of keys){
    const x=a[key]??'',y=b[key]??'';
    if(x!==y)return x<y?-1:1;
   }
   return 0;
  });
 }
 return sha256Hex(canonicalJson({
  memberships:sorted(members.map(({code,security_code,security_name})=>({code,security_code,security_name})),['code','security_code']),
  classifications:sorted(classes.map(({code,vendor_code,name_zh})=>({code,vendor_code,name_zh})),['code']),
  observations:sorted(observations.map(({code,metric,duration,period_end,status,missing_reason,value_text,unit})=>
   ({code,metric,duration,period_end,status,missing_reason,value_text,unit})),['code','metric','duration','period_end'])
 }));
}

async function ingest(kind:VendorRunKind,deps:VendorDeps,opts:VendorOptions):Promise<RunnerReceipt>{
 const {source,raw,db,tables,codeVersion}=deps,universe=deps.universe??SW2021_L1_GILDATA;
 const industries=universe.filter(r=>!opts.l1Codes||opts.l1Codes.includes(r.indexCode));
 const apply=opts.mode==='apply',financial=kind==='financials',dataset=FRESHNESS[kind];
 if(opts.mode==='plan')return {batchId:null,status:'dry_run',errors:[],counts:{industries:industries.length,planned_calls:industries.length}};
 if(apply&&opts.l1Codes&&(industries.length!==universe.length||opts.l1Codes.some(code=>!universe.some(r=>r.indexCode===code))))return failedReceipt('subset_apply_refused');
 if(apply&&!codeVersion)return failedReceipt('code_version_unavailable');
 if(!source||apply&&(!raw||!db||!tables))return failedReceipt('deps_unavailable');
 const start=deps.now(),today=start.toISOString().slice(0,10),fromYear=opts.fromYear??2016,toYear=opts.toYear??start.getUTCFullYear();
 const duration=opts.deadlineMs??Number.POSITIVE_INFINITY;
 const wallBudget=budgetFor(duration);
 function remainingMs(){return Math.min(wallBudget.remainingMs(),duration-(deps.now().getTime()-start.getTime()));}
 function check(){if(remainingMs()<=0)throw new Deadline();}
 const budget={signal:wallBudget.signal,remainingMs};
 const callsBefore=source.callsMade(),counts:Record<string,number>={industries_ok:0,industries_failed:0,calls:0,bytes:0,
  ...(financial?{periods:0,observations_ok:0,observations_missing:0}:{members:0})};
 if(!apply&&db)counts.would_change=0;
 const receipt:RunnerReceipt={batchId:null,status:'dry_run',counts,errors:[]};
 const members:Membership[]=[],classes:Classification[]=[],observations:Observation[]=[],fetchTimes:string[]=[];
 let runId:string|null=null,periods:string[]=[],templateId='',templateVersion=1;
 const parserVersion=financial?FINANCIALS_PARSER_VERSION:MEMBERS_PARSER_VERSION;
 try{
  if(apply)receipt.batchId=(await startBatch(tables!,{producer:'industry-vendor-gildata',dataset,codeVersion:codeVersion!,triggeredBy:opts.triggeredBy})).batchId;
  for(const industry of industries){
   check();
   const {indexCode:code,nameZh,gildataCode}=industry;
   try{
    const request=financial?swL1Financials({nameZh,fromYear,toYear}):swL1Members({nameZh});
    templateId=request.templateId;templateVersion=request.templateVersion;
    const res=await source.fetch(request,budget),retrieval_id=randomUUID(),content_type='application/json';
    counts.bytes+=res.bytes.length;fetchTimes.push(res.fetchedAt);
    const evidence:RetrievalInput={retrieval_id,vendor:res.vendor,product:res.product,interface:request.tool,query_template_id:templateId,
     query_template_version:templateVersion,request_canonical:canonicalRequest(request),sha256:res.sha256,canonical_sha256:null,api_names_returned:[],
     object_path:vendorRawPath(res.vendor,res.sha256),content_type,byte_length:res.bytes.length,http_status:res.httpStatus,
     fetched_at:res.fetchedAt,vendor_as_of:null,batch_id:receipt.batchId,attempt:res.attempt,outcome:'ok',outcome_reason:null};
    if(apply)await raw!.put({vendor:res.vendor,sha256:res.sha256,bytes:res.bytes,contentType:content_type});
    try{
     if(financial){
      const parsed=parseSwL1Financials(res.bytes,{nameZh,gildataCode,fromYear,toYear,today});
      periods=parsed.periods;counts.periods+=periods.length;
      evidence.canonical_sha256=parsed.canonicalSha256;evidence.api_names_returned=parsed.apiNames;
      const c=parsed.classification;
      classes.push({code,vendor_code:c.gildataCode,name_zh:c.nameZh,scheme_label:c.schemeLabel,level:1,retrieval_id});
      for(const o of parsed.observations){
       counts['observations_'+o.status]++;
       observations.push({code,retrieval_id,metric:o.metric,duration:o.duration,period_start:o.periodStart,period_end:o.periodEnd,
        status:o.status,missing_reason:o.missingReason,value_text:o.valueText,unit:o.unit,locator:o.locator,vendor_as_of:null});
      }
     }else{
      const parsed=parseSwL1Members(res.bytes,{nameZh});
      evidence.canonical_sha256=parsed.canonicalSha256;evidence.api_names_returned=parsed.apiNames;
      for(const m of parsed.members)members.push({code,security_code:m.securityCode,security_name:m.securityName,locator:m.locator,retrieval_id});
      counts.members+=parsed.members.length;
     }
    }catch(e){
     if(apply&&e instanceof GildataParseError){
      // A scope or schema rejection can still carry a decodable envelope.
      try{
       const decoded=decodeGildataBody(res.bytes);
       evidence.canonical_sha256=decoded.canonicalSha256;
       evidence.api_names_returned=[...new Set(decoded.blocks.map(b=>b.apiName))];
      }catch{/* Undecodable evidence retains its exact-byte hash. */}
      await db!.recordRetrieval({...evidence,outcome:e.outcome,outcome_reason:e.reason});
      await quarantine(tables!,{dataset,table:'vendor_retrievals',naturalKey:retrieval_id,reasonCode:e.reason,batchId:receipt.batchId!,
       payload:{retrieval_id,sha256:res.sha256,outcome:e.outcome,reason:e.reason,index_code:code}});
     }
     throw e;
    }
    if(apply)await db!.recordRetrieval(evidence);
    counts.industries_ok++;
   }catch(e){
    counts.industries_failed++;
    const token=remainingMs()<=0?'time_budget_exceeded':errorCode(e);
    receipt.errors.push({code:token,key:code});
    if(token==='vendor_auth_failed'||token==='vendor_call_budget_exceeded'||token==='time_budget_exceeded'||token.startsWith('budget_'))break;
   }
  }
  if(!receipt.errors.length){
   check();
   if(db){
    const hash=contentHash(members,classes,observations),active=await db.activeRun(kind);
    const same=active?.content_hash===hash&&active.parser_version===parserVersion&&active.mapping_version===SW2021_GILDATA_MAPPING_VERSION;
    check();
    if(!apply)counts.would_change=Number(!same);
    else if(same)counts.unchanged=1;
    else{
     fetchTimes.sort();
     const run=await db.createRun({kind,vendor:source.vendor,product:source.product,scheme:'sw2021',version:'2021',level:1,
      dataset_key:financial?VENDOR_DATASET_KEYS[0]:'scheme:sw2021:2021',expected_grid:{codes:industries.map(r=>r.indexCode),
       ...(financial?{period_ends:periods,metrics:FINANCIAL_METRICS.map(({metric,duration})=>({metric,duration}))}:{})},
      content_hash:hash,parser_version:parserVersion,mapping_version:SW2021_GILDATA_MAPPING_VERSION,query_template_id:templateId,
      query_template_version:templateVersion,code_version:codeVersion!,coverage_summary:{industries:counts.industries_ok},
      fetched_from:fetchTimes[0],fetched_to:fetchTimes[fetchTimes.length-1],batch_id:receipt.batchId});
     runId=run.run_id;
     async function stage<T>(rows:T[],write:(id:string,chunk:T[])=>Promise<void>){
      for(let i=0;i<rows.length;i+=500){check();await write(run.run_id,rows.slice(i,i+500));}
     }
     await stage(classes,db.stageClassifications);await stage(members,db.stageMemberships);await stage(observations,db.stageObservations);
     check();await db.activateRun(runId);runId=null;
    }
   }
  }
 }catch(e){
  const code=errorCode(e);receipt.errors.push({code});
  if(runId){
   const failureCode=code.replace(/[^a-z_]/g,'_').slice(0,64)||'vendor_ingest_failed';
   try{await db!.failRun(runId,failureCode);}catch(failure){receipt.errors.push({code:errorCode(failure)});}
  }
 }
 counts.calls=source.callsMade()-callsBefore;
 receipt.status=receipt.errors.length?'failed':apply?'success':'dry_run';
 if(apply&&receipt.batchId){
  const ok=receipt.status==='success',batchCounts=emptyCounts();
  batchCounts.fetched=counts.industries_ok+counts.industries_failed;
  if(!ok)batchCounts.failed=Math.max(1,counts.industries_failed);
  else if(counts.unchanged)batchCounts.duplicates=counts.industries_ok;
  else batchCounts.inserted=counts.industries_ok;
  try{await finishBatch(tables!,receipt.batchId,{counts:batchCounts,errors:receipt.errors},deps.now());}
  catch{receipt.errors.push({code:'batch_finish_failed'});receipt.status='failed';}
  try{await recordAttempt(tables!,dataset,{ok:receipt.status==='success',cadence:'weekly',now:deps.now()});}
  catch{receipt.errors.push({code:'freshness_failed'});receipt.status='failed';}
 }
 return receipt;
}
export const runGildataMemberships=(deps:VendorDeps,opts:VendorOptions)=>ingest('memberships',deps,opts);
export const runGildataFinancials=(deps:VendorDeps,opts:VendorOptions)=>ingest('financials',deps,opts);
