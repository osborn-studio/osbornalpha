// src/lib/evals/kinds/official.ts
// official_reconciliation (spec §5.1, §3.3, §4.6), per case in input order: retracted → skipped(retracted); a legacy
// '<pending>' entry → skipped(pending); subject → read_error(subject_unresolved); the read by binding (document: the
// filing named by source.document_id, at env.today; current: as_of ?? env.today); a reader error or truncation →
// read_error(reason); expect 'missing': a row in the target unit → fail(unexpected_value), none → expected_absent —
// with verify.sources the official source is fetched and hashed for absence cases too (an absence is only evidence
// when the document was checked; Codex plan round 1 P1-8), a failed check → provenance_incomplete(reason);
// no row: privileged readNonVisible → not_visible(reason), else missing; units (gold/schema.ts::unitOfSpec): no row
// in the target unit → unit_mismatch, more than one → fail(ambiguous); value: compareWithinTolerance(system, gold,
// set rel) → fail(value); source chain (§5.1.4): unprivileged = required fields present, producer_code_version
// 'unavailable:anon'; privileged = reader.resolveProvenance({artifacts: verify.artifacts}); verify.sources =
// sha256(fetchSource(source.url)) equals source.sha256, each url fetched once (anything else → provenance_incomplete);
// otherwise pass. Pure over the injected reader: no clock, no store, and no gold value is ever produced or corrected.
import {missingFields} from '../adapters/provenance';
import type {FactProvenance} from '../adapters/provenance';
import {sha256Hex} from '../canonical-json';
import {compareWithinTolerance} from '../compare';
import {unitOfSpec} from '../gold/schema';
import type {CaseOutcome,CaseReport,DocumentId,EvalEnv,GoldCase,ModuleReader,PrivilegedReader,ReadErrorReason,ReadResult,ReadRow,SubjectRef,UnitSpec} from '../types';

export interface OfficialContext{env:EvalEnv;privileged:boolean;verify:{artifacts:boolean;sources:boolean};tolerance:string;fetchSource?:(url:string)=>Promise<Uint8Array>}
export const ANON_PRODUCER='unavailable:anon';
type SourceCheck=true|'source_sha256_missing'|'source_fetch_unavailable'|'source_fetch_failed'|'source_sha256_mismatch';
type SourceMemo=Map<string,Promise<string|null>>;

const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
const nul=<T>(v:T|undefined):T|null=>v===undefined?null:v;
/** Facts unit of the gold unit spec; null when the spec has none (index/count/percent_points) — no facts row can match. */
const unitOf=(u:UnitSpec):string|null=>{try{return unitOfSpec(u);}catch{return null;}};
const isPrivileged=(reader:ModuleReader,ctx:OfficialContext):reader is PrivilegedReader=>ctx.privileged&&reader.privileged===true;
const caseDetail=(c:GoldCase):Record<string,unknown>=>({binding:c.binding,as_of:c.binding==='current'?c.as_of:null,document_type:c.source.document_type,document_id:nul(c.source.document_id),locator:nul(c.source.locator)});
const rowDetail=(row:ReadRow,expectedUnit:string|null):Record<string,unknown>=>({fact_id:nul(row.fact_id),filing_id:nul(row.filing_id),source_ref:nul(row.source_ref),available_date:row.available_date,unit:row.unit,expected_unit:expectedUnit});

async function verifySource(c:GoldCase,ctx:OfficialContext,memo:SourceMemo):Promise<SourceCheck>{
 const expected=c.source.sha256;
 if(!expected)return 'source_sha256_missing';
 const fetchSource=ctx.fetchSource;
 if(!fetchSource)return 'source_fetch_unavailable';
 let p=memo.get(c.source.url);
 if(!p){p=fetchSource(c.source.url).then(b=>sha256Hex(b),()=>null);memo.set(c.source.url,p);}
 const got=await p;
 return got===null?'source_fetch_failed':got===expected?true:'source_sha256_mismatch';
}

async function provenanceOf(c:GoldCase,ref:SubjectRef,row:ReadRow,reader:ModuleReader,ctx:OfficialContext,memo:SourceMemo):Promise<FactProvenance>{
 let prov:FactProvenance;
 if(isPrivileged(reader,ctx)){
  try{prov=await reader.resolveProvenance(ref,row,{artifacts:ctx.verify.artifacts});}
  catch{prov={ok:false,missing:[],reason:'provenance_lookup_failed'};}
 }else{
  const missing=missingFields(row);
  prov={ok:missing.length===0,missing,...(missing.length>0?{reason:'fields_missing'}:{}),producer_code_version:ANON_PRODUCER};
 }
 if(!ctx.verify.sources)return {...prov,source_verified:'skipped'};
 const check=await verifySource(c,ctx,memo);
 if(check===true)return {...prov,source_verified:true};
 return {...prov,ok:false,reason:prov.ok?check:(prov.reason??check),source_verified:false};
}

async function evaluateCase(c:GoldCase,reader:ModuleReader,ctx:OfficialContext,memo:SourceMemo):Promise<CaseReport>{
 const base:CaseReport={case_id:c.case_id,required:c.required,outcome:{result:'pass'},left:null,right:null,abs_diff:null,rel_diff:null,tolerance:ctx.tolerance,provenance:null,detail:caseDetail(c)};
 const done=(outcome:CaseOutcome,extra:Partial<Omit<CaseReport,'case_id'|'required'|'outcome'|'tolerance'>>={}):CaseReport=>({...base,...extra,outcome,detail:{...base.detail,...(extra.detail??{})}});
 const readError=(reason:ReadErrorReason,detail:Record<string,unknown>={})=>done({result:'read_error',reason},{detail});
 if(c.retracted)return done({result:'skipped',reason:'retracted'},{detail:{retracted:c.retracted}});
 if(c.pending)return done({result:'skipped',reason:'pending'});
 let ref:SubjectRef|null;
 try{ref=await reader.resolveSubject(c.subject,ctx.env.today);}catch(e){return readError('read_failed',{message:message(e)});}
 if(!ref)return readError('subject_unresolved');
 const documentId:DocumentId|null=c.binding==='document'?c.source.document_id??null:null;
 if(c.binding==='document'&&documentId===null)return readError('filing_not_found',{message:'document binding without source.document_id'});
 const asOf=c.binding==='current'?c.as_of??ctx.env.today:ctx.env.today;
 let read:ReadResult;
 try{read=documentId!==null?await reader.readDocumentBound(ref,c.target,documentId,ctx.env.today):await reader.readCurrent(ref,c.target,asOf);}
 catch(e){return readError('read_failed',{message:message(e)});}
 if(read.error)return readError(read.error,{truncated:read.truncated});
 if(read.truncated)return readError('truncated',{truncated:true});
 const unit=unitOf(c.target.unit);
 const rows=read.rows;
 const inUnit=rows.filter(r=>unit!==null&&r.unit===unit);
 if(c.expect==='missing'){
  if(inUnit.length===0){
   const detail={rows:rows.length,expected_unit:unit};
   if(!ctx.verify.sources)return done({result:'expected_absent'},{detail});
   const check=await verifySource(c,ctx,memo);
   const provenance={ok:check===true,missing:[],...(check===true?{}:{reason:check}),source_verified:check===true};
   return done(check===true?{result:'expected_absent'}:{result:'provenance_incomplete',reason:check},{provenance,detail});
  }
  return done({result:'fail',reason:'unexpected_value'},{left:inUnit.length===1?inUnit[0].value_text:null,detail:{...rowDetail(inUnit[0],unit),rows:inUnit.length}});
 }
 if(rows.length===0){
  if(isPrivileged(reader,ctx)){
   let hidden:'quarantined'|'superseded_generation'|null;
   try{hidden=await reader.readNonVisible(ref,c.target,documentId,asOf);}catch(e){return readError('read_failed',{message:message(e)});}
   if(hidden)return done({result:'not_visible',reason:hidden});
  }
  return done({result:'missing'});
 }
 if(inUnit.length===0)return done({result:'unit_mismatch'},{left:rows.length===1?rows[0].value_text:null,detail:{units:[...new Set(rows.map(r=>r.unit))].sort(),expected_unit:unit,rows:rows.length}});
 if(inUnit.length>1)return done({result:'fail',reason:'ambiguous'},{detail:{rows:inUnit.length,expected_unit:unit,fact_ids:inUnit.map(r=>nul(r.fact_id))}});
 const row=inUnit[0];
 const right=c.canonical?.value;
 if(right===undefined)return readError('read_failed',{message:'present case without canonical.value'});
 const cmp=compareWithinTolerance(row.value_text,right,ctx.tolerance);
 const compared={left:row.value_text,right,abs_diff:cmp.absDiff,rel_diff:cmp.relDiff,detail:{...rowDetail(row,unit),rows:1}};
 if(!cmp.passed)return done({result:'fail',reason:'value'},compared);
 const {input_chains:inputs,...check}=await provenanceOf(c,ref,row,reader,ctx,memo);
 const withProvenance={...compared,provenance:check,detail:{...compared.detail,...(inputs?{inputs}:{})}};
 if(!check.ok)return done({result:'provenance_incomplete',reason:check.reason??'fields_missing'},withProvenance);
 return done({result:'pass'},withProvenance);
}

export async function evaluateOfficial(cases:GoldCase[],reader:ModuleReader,ctx:OfficialContext):Promise<CaseReport[]>{
 const memo:SourceMemo=new Map();
 const out:CaseReport[]=[];
 for(const c of cases)out.push(await evaluateCase(c,reader,ctx,memo));   // sequential: deterministic reads and one fetch per url
 return out;
}
