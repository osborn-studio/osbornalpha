// src/lib/entities/claims.ts
// Pending issuer_identifier_claims in the claim/1 shape (spec 3 §4.2.1; plan 3 contract C2): the review
// queue for identifier and window changes that contradict stored data or need a human decision.
// validateClaimDetail mirrors the SQL check identifier_claim_problem that resolve_identifier_claim
// runs again on acceptance: keep the two in step (migration 20261107090000). A claim is keyed by
// (issuer_id, id_type, value, op, target_key) while pending (partial unique index); filing the same key
// again only appends new evidence to detail.sources and never changes target or params.
import {createHash,randomUUID} from 'node:crypto';
import {TableError,callRpc} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {ProvenanceError,sanitizeProvenance} from './provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,ClaimTarget,EvidenceKind} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Exclude<ClaimOp,'legacy'>;detail:ClaimDetail}
export const CLAIM_SCHEMA='claim/1';
export const EVIDENCE_KINDS:readonly EvidenceKind[]=['hard_identifier','official_list','name_match','filing_form','provider_mapping'];
const ISSUER_COLUMNS:readonly string[]=['lei','cik','usci','cninfo_org_id'];
const SECURITY_COLUMNS:readonly string[]=['isin','figi'];
const SHARE_CLASSES:readonly string[]=['A','H','ADR','common','preferred','other','unknown'];
const FROM_METHODS:readonly string[]=['first_observed','listing_date','ticker_change','curated'];
const TO_METHODS:readonly string[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];
const BACKDATE_METHODS:readonly string[]=['listing_date','ticker_change','curated'];
const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
const ISIN=/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const TICKER=/^[A-Z0-9][A-Z0-9.-]{0,31}$/;
const SHA256=/^[0-9a-f]{64}$/;

const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max=64):v is string=>typeof v==='string'&&v.length>=1&&v.length<=max;
const onlyKeys=(o:Record<string,unknown>,allowed:readonly string[])=>Object.keys(o).every(k=>allowed.includes(k));

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(`${v}T00:00:00Z`);
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
const validEvidence=(e:unknown):e is ClaimEvidence=>isObj(e)&&str(e.source)&&isIsoDate(e.as_of)&&typeof e.evidence_sha256==='string'&&SHA256.test(e.evidence_sha256 as string)
 &&(e.locator===undefined||typeof e.locator==='string')&&(e.note===undefined||typeof e.note==='string');

/** op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (= SQL identifier_claim_target_key). */
export function claimTargetKey(op:ClaimOp,target:ClaimTarget):string{
 return target.ticker!==undefined?`${op}:${target.issuer_id}|${target.ticker}|${target.valid_from}`:`${op}:${target.issuer_id}`;
}

/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
export function provenanceKeysFor(op:ClaimOp,idType:ClaimIdType):readonly string[]{
 if(op==='set_identifier'||op==='correct_identifier')return [idType];
 if(op==='attach_security')return ['isin','figi','valid_from'];
 if(op==='close_security')return ['valid_to'];
 if(op==='backdate_window')return ['valid_from'];
 return [];
}

type Verdict={ok:true}|{ok:false;error:string};
const bad=(field:string):Verdict=>({ok:false,error:`invalid_claim:${field}`});

/**
 * claim/1 check for (op, id_type, detail) per spec 3 §4.2.1; with `value`, also that the claim's value
 * column agrees (correct_identifier new_value, close/backdate target.ticker). Unknown top-level detail
 * keys are allowed (amend bookkeeping); unknown params keys are not, except for evidence_only.
 */
export function validateClaimDetail(op:ClaimOp,idType:ClaimIdType,detail:unknown,value?:string):Verdict{
 if(op==='legacy')return {ok:false,error:'legacy_claim'};
 if(!isObj(detail)||detail.schema!==CLAIM_SCHEMA)return bad('schema');
 if(!EVIDENCE_KINDS.includes(detail.evidence_kind as EvidenceKind))return bad('evidence_kind');
 const t=detail.target,pa=detail.params;
 if(!isObj(t)||!str(t.issuer_id))return bad('target.issuer_id');
 if(!isObj(pa))return bad('params');
 if(!validEvidence(detail.evidence))return bad('evidence');
 if(!Array.isArray(detail.sources)||!detail.sources.every(validEvidence))return bad('sources');
 if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
 const full='ticker' in t||'valid_from' in t;
 if(full){if(!str(t.ticker,32)||!isIsoDate(t.valid_from)||Object.keys(t).length!==3)return bad('target');}
 else if(Object.keys(t).length!==1)return bad('target');
 switch(op){
  case 'set_identifier':
  case 'correct_identifier':
   if(ISSUER_COLUMNS.includes(idType)){if(full)return bad('target');}
   else if(SECURITY_COLUMNS.includes(idType)){if(!full)return bad('target');}
   else return bad('op_id_type');
   if(op==='set_identifier'){
    if(!onlyKeys(pa,['candidates','note'])||(pa.candidates!==undefined&&!Array.isArray(pa.candidates))||(pa.note!==undefined&&typeof pa.note!=='string'))return bad('params');
   }else{
    if(!onlyKeys(pa,['expected_current','new_value','candidates','note'])||!str(pa.expected_current)||!str(pa.new_value)||pa.expected_current===pa.new_value)return bad('params');
    if(value!==undefined&&pa.new_value!==value)return bad('params.new_value');
   }
   break;
  case 'attach_security':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if(!onlyKeys(pa,['share_class','valid_from','valid_from_method','source','isin','note','ticker'])||(pa.ticker!==undefined&&!(typeof pa.ticker==='string'&&TICKER.test(pa.ticker)))||!SHARE_CLASSES.includes(pa.share_class as string)
    ||!isIsoDate(pa.valid_from)||!FROM_METHODS.includes(pa.valid_from_method as string)||!str(pa.source)
    ||(pa.isin!==undefined&&pa.isin!==null&&!(typeof pa.isin==='string'&&ISIN.test(pa.isin as string))))return bad('params');
   // the inserted ticker is params.ticker, else the claim value (SQL: params.ticker)
   if(pa.ticker===undefined&&value!==undefined&&!TICKER.test(value))return bad('params.ticker');
   break;
  case 'close_security':
  case 'backdate_window':
   if(idType!=='ticker'||!full)return bad('op_id_type');
   if(value!==undefined&&t.ticker!==value)return bad('target.ticker');
   if(op==='close_security'){
    if(!onlyKeys(pa,['valid_to','valid_to_method','note'])||!isIsoDate(pa.valid_to)||!TO_METHODS.includes(pa.valid_to_method as string)||(pa.valid_to as string)<=(t.valid_from as string))return bad('params');
   }else if(!onlyKeys(pa,['new_valid_from','valid_from_method','note'])||!isIsoDate(pa.new_valid_from)||!BACKDATE_METHODS.includes(pa.valid_from_method as string)||(pa.new_valid_from as string)>=(t.valid_from as string))return bad('params');
   break;
  case 'evidence_only':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if('suggested_op' in pa&&!SUGGESTED_OPS.includes(String(pa.suggested_op)))return bad('params.suggested_op');
   break;
  default:
   return bad('op');
 }
 if(detail.provenance_written!==undefined){
  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
  // SQL: it must carry the op's own provenance key (the one resolve_identifier_claim merges)
  const own=op==='close_security'?'valid_to':op==='set_identifier'||op==='correct_identifier'?idType:'valid_from';
  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
 }
 return {ok:true};
}

/** Canonical JSON (keys sorted at every level, undefined dropped): the bytes whose sha256 names a record. */
export function canonicalJson(v:unknown):string{
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 if(isObj(v))return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
 return JSON.stringify(v??null);
}

/** Evidence for a claim derived from an input record: sha256 over its canonical JSON; as_of is the record's date (first 10 chars) or today (UTC). */
export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
 const day=typeof input.asOf==='string'?input.asOf.slice(0,10):'';
 return {
  source:input.source,as_of:isIsoDate(day)?day:new Date().toISOString().slice(0,10),
  evidence_sha256:createHash('sha256').update(canonicalJson(input.record)).digest('hex'),
  ...(input.locator?{locator:input.locator}:{}),...(input.note?{note:input.note}:{}),
 };
}

export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
 return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
}

/**
 * Appends `evidence` to the pending claim matching `key` (plan audit round 1, P3): ONE call of the
 * row-locking SQL function append_claim_evidence (migration 20261107090000, Task 1b), which dedupes
 * against the claim's evidence and sources and patches detail.sources only — concurrent filers never
 * lose each other's evidence, target / params / the first evidence are never touched. A claim resolved
 * meanwhile answers 'not_found' and is left alone. Needs client.rpc (callRpc: rpc_unavailable otherwise).
 */
async function appendEvidence(client:TableClient,key:Row,evidence:ClaimEvidence):Promise<false>{
 await callRpc(client,'append_claim_evidence',{p_issuer:key.issuer_id,p_id_type:key.id_type,p_value:key.value,p_op:key.op,p_target_key:key.target_key,p_evidence:evidence});
 return false;
}

/**
 * Files a pending claim/1 claim. Validates first (throws invalid_claim:<field> / legacy_claim, no DB
 * access). The same pending (issuer_id, id_type, value, op, target_key) → appends the new evidence to
 * detail.sources and returns false; a concurrent duplicate (23505 on the partial unique index) is
 * treated the same way. Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const v=validateClaimDetail(c.op,c.id_type,c.detail,c.value);
 if(!v.ok)throw new Error(v.error);
 if(c.detail.target.issuer_id!==c.issuer_id)throw new Error('invalid_claim:target.issuer_id');
 if(!str(c.source))throw new Error('invalid_claim:source');
 if(!str(c.value))throw new Error('invalid_claim:value');
 const target_key=claimTargetKey(c.op,c.detail.target);
 const key:Row={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,op:c.op,target_key,status:'pending'};
 if((await client.select('issuer_identifier_claims',key,{limit:1})).length)return appendEvidence(client,key,c.detail.evidence);
 try{
  await client.insert('issuer_identifier_claims',{
   id:randomUUID(),issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,confidence:null,status:'pending',
   op:c.op,target_key,detail:{...c.detail,sources:c.detail.sources??[]},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
  });
  return true;
 }catch(e){
  if(isUnique(e))return appendEvidence(client,key,c.detail.evidence);
  throw e;
 }
}
