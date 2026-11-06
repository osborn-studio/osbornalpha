// src/lib/entities/cninfo-org-id.ts
// Spec §4.1.6: fill issuers.cninfo_org_id for active issuers that have a USCI, no orgId and an open
// .SH/.SZ row, from 巨潮 topSearch (exact code match, landed resolveOrgId). The guarded update only
// fills an empty column of an active issuer; a unique-index clash (another issuer holds the orgId)
// becomes a set_identifier claim; a different value appearing concurrently becomes
// correct_identifier. The exact topSearch response bytes go to reconcile-raw (kind 'cninfo') so
// the provenance/claim hash is replayable. batchId null = dry run (no bucket, no DB writes).
import {callRpc,selectAll,type TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import type {RawStore} from '../dq/raw-store';
import {fileClaim,type ClaimInput} from './claims';
import {errorMessage,withSkippedSummary,type ApplyResult} from './load-sec';
import type {ClaimEvidence} from './types';

export interface CninfoLookup{hit:{orgId:string;name:string}|null;bytes:Uint8Array}
/** A failed lookup that still carries whatever bytes were received (HTTP error body, unparsable text): stored as evidence before the failure is recorded. */
export class CninfoLookupError extends Error{constructor(message:string,readonly bytes:Uint8Array|null){super(message);this.name='CninfoLookupError';}}
export interface CninfoTarget{issuer_id:string;code:string;ticker:string;provenance:Record<string,unknown>}
export interface CninfoDeps{tables:TableClient;raw:RawStore;lookup:(code:string)=>Promise<CninfoLookup>;asOf:string;sleep?:(ms:number)=>Promise<void>;intervalMs?:number}
export interface CninfoPlanned{issuer_id:string;code:string;orgId:string|null;outcome:'written'|'duplicate'|'claimed'|'not_found'|'failed'|'planned';evidence_sha256?:string|null}

const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
const isJson=(b:Uint8Array)=>{try{JSON.parse(new TextDecoder().decode(b));return true;}catch{return false;}};
const A_SHARE=/^\d{6}\.(SH|SZ)$/;

export async function cninfoTargets(tables:TableClient):Promise<CninfoTarget[]>{
 const issuers=(await selectAll(tables,'issuers',{status:'active',cninfo_org_id:null},'issuer_id')).filter(r=>typeof r.usci==='string'&&r.usci!=='');
 const out:CninfoTarget[]=[];
 for(const i of issuers){
  const rows=await tables.select('issuer_securities',{issuer_id:i.issuer_id,valid_to:null},{orderBy:'ticker'});
  const a=[...rows].sort((x,y)=>Number(y.is_primary===true)-Number(x.is_primary===true)).find(r=>A_SHARE.test(String(r.ticker)));
  if(a)out.push({issuer_id:String(i.issuer_id),code:String(a.ticker).slice(0,6),ticker:String(a.ticker),provenance:obj(i.provenance)});
 }
 return out;
}

export async function fillCninfoOrgIds(deps:CninfoDeps,targets:readonly CninfoTarget[],opts:{batchId:string|null}):Promise<ApplyResult&{claims:Record<string,number>;planned:CninfoPlanned[]}>{
 const {tables}=deps;
 const sleep=deps.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 const counts=emptyCounts();const errors:BatchError[]=[];const planned:CninfoPlanned[]=[];
 const skippedSummary:Record<string,number>={};const claims:Record<string,number>={};
 for(const [n,t] of targets.entries()){
  if(n>0)await sleep(deps.intervalMs??600);
  const apply=opts.batchId!==null;
  // Every received response is stored (apply mode) before it is interpreted; dry run stores nothing.
  const keep=async(bytes:Uint8Array|null):Promise<string|null>=>apply&&bytes&&bytes.byteLength>0?(await deps.raw.put({kind:'cninfo',bytes,contentType:isJson(bytes)?'application/json':'text/html',meta:{code:t.code}})).sha256:null;
  let look:CninfoLookup|null=null,sha:string|null=null;
  try{
   try{look=await deps.lookup(t.code);}
   catch(e){
    const sha0=e instanceof CninfoLookupError?await keep(e.bytes):null;
    throw Object.assign(new Error(errorMessage(e)+(sha0?` (response ${sha0})`:'')),{sha:sha0});
   }
   sha=await keep(look.bytes);
  }catch(e){counts.failed++;errors.push({code:'cninfo_error',key:t.code,message:errorMessage(e)});planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'failed',evidence_sha256:(e as {sha?:string|null}).sha??null});continue;}
  if(!look.hit){skippedSummary.org_id_not_found=(skippedSummary.org_id_not_found??0)+1;planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'not_found',evidence_sha256:sha});continue;}
  const orgId=look.hit.orgId;
  const plan=(outcome:CninfoPlanned['outcome'])=>planned.push({issuer_id:t.issuer_id,code:t.code,orgId,outcome,evidence_sha256:sha});
  if(!apply){plan('planned');continue;}
  try{
   const evidence:ClaimEvidence={source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:sha!,locator:`topSearch:keyWord=${t.code}`};
   const claim=async(op:'set_identifier'|'correct_identifier',current:string|null)=>{
    const c:ClaimInput={issuer_id:t.issuer_id,id_type:'cninfo_org_id',value:orgId,source:'cninfo_topsearch',op,detail:{
     schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:t.issuer_id},params:op==='set_identifier'?{}:{expected_current:current,new_value:orgId},evidence,sources:[evidence],
    }};
    const created=await fileClaim(tables,c);
    const k=created?op:`${op}_appended`;claims[k]=(claims[k]??0)+1;plan('claimed');
   };
   // One locked UPDATE merges the single provenance key (never replaces the object): see set_issuer_identifier.
   const outcome=await callRpc(tables,'set_issuer_identifier',{p_issuer:t.issuer_id,p_column:'cninfo_org_id',p_value:orgId,p_provenance:{source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:sha}}) as string;
   if(outcome==='written'){counts.inserted++;plan('written');continue;}
   if(outcome==='duplicate'){counts.duplicates++;plan('duplicate');continue;}
   if(outcome==='conflict'){
    const [now]=await tables.select('issuers',{issuer_id:t.issuer_id},{limit:1});
    if(typeof now?.cninfo_org_id==='string'&&now.cninfo_org_id!==orgId)await claim('correct_identifier',now.cninfo_org_id);
    else await claim('set_identifier',null);   // the value is held by another issuer
    continue;
   }
   counts.failed++;errors.push({code:outcome==='not_active'?'issuer_changed':'issuer_missing',key:t.issuer_id,message:outcome});plan('failed');
  }catch(e){counts.failed++;errors.push({code:'cninfo_write_error',key:t.issuer_id,message:errorMessage(e)});plan('failed');}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.failed;
 const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims,planned};
}
