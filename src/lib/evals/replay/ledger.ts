// src/lib/evals/replay/ledger.ts
// Replay explanation ledger fixtures/replay/explanations.json (spec §5.3.3, §14, §16 D6). parseLedger
// refuses a structurally invalid file with EvalError('gold_invalid'): missing approval_ref, the mode's
// pair missing (live: from/to_state_rev; frozen: from/to_setup_sha256) or the other mode's pair present,
// malformed hashes / code versions, unknown reason_code, reason-specific evidence missing
// (quarantine_resolved: evidence.quarantine_id; bug_fixed: evidence.pr + evidence.regression_test),
// duplicate ledger_id. A self-approved entry (approved_by = added_by) parses but never explains:
// matchLedger reports self_approved → unexplained_diff(ledger_self_approved). A hit needs the exact tuple
// (case_id, mode, before_hash, after_hash, from_code, to_code + the mode's pair) AND changed_fields equal
// to the observed set; the same tuple with other fields is partial → unexplained_diff(partial_ledger).
import {readFileSync} from 'node:fs';
import {EvalError} from '../errors';
import type {ReplayMode} from './fixture';

export const LEDGER_REASONS=['late_filing','quarantine_resolved','mapping_gen_upgrade','formula_version_change','ticker_reassignment','bug_fixed'] as const;
export type LedgerReason=typeof LEDGER_REASONS[number];
export interface LedgerEntry{
 ledger_id:string;case_id:string;mode:ReplayMode;changed_fields:string[];before_hash:string;after_hash:string;from_code:string;to_code:string;
 from_state_rev?:number;to_state_rev?:number;from_setup_sha256?:string;to_setup_sha256?:string;
 reason_code:LedgerReason;evidence:Record<string,unknown>;added_by:string;added_at:string;approved_by:string;approval_ref:string;approved_at:string;
}
export interface ObservedDiff{
 case_id:string;mode:ReplayMode;before_hash:string;after_hash:string;from_code:string;to_code:string;
 from_state_rev?:number|null;to_state_rev?:number|null;from_setup_sha256?:string;to_setup_sha256?:string;changed_fields:string[];
}
export interface LedgerMatch{kind:'hit'|'partial'|'self_approved'|'none';ledger_ids:string[]}

const HEX64=/^[0-9a-f]{64}$/,HEX40=/^[0-9a-f]{40}$/;
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const nonEmpty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const isTs=(v:unknown):v is string=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
const isRev=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const hex=(re:RegExp,v:unknown)=>typeof v==='string'&&re.test(v);

export const isSelfApproved=(e:LedgerEntry):boolean=>e.approved_by===e.added_by;

export function parseLedger(raw:unknown):LedgerEntry[]{
 if(!Array.isArray(raw))throw new EvalError('gold_invalid','explanations.json: expected an array',{file:'explanations.json'});
 const seen=new Set<string>();
 return raw.map((e,i)=>{
  const id=isObj(e)&&typeof e.ledger_id==='string'?e.ledger_id:null;
  const bad=(field:string):never=>{throw new EvalError('gold_invalid',`explanations.json[${i}]: ${field}`,{file:'explanations.json',index:i,ledger_id:id,field});};
  if(!isObj(e))return bad('entry');
  if(!nonEmpty(e.ledger_id))return bad('ledger_id');
  if(seen.has(e.ledger_id))return bad('ledger_id_duplicate');seen.add(e.ledger_id);
  if(!nonEmpty(e.case_id))return bad('case_id');
  if(e.mode!=='frozen'&&e.mode!=='live')return bad('mode');
  const f=e.changed_fields;
  if(!Array.isArray(f)||f.length===0||!f.every(nonEmpty)||new Set(f).size!==f.length)return bad('changed_fields');
  if(!hex(HEX64,e.before_hash))return bad('before_hash');
  if(!hex(HEX64,e.after_hash))return bad('after_hash');
  if(!hex(HEX40,e.from_code))return bad('from_code');
  if(!hex(HEX40,e.to_code))return bad('to_code');
  if(e.mode==='live'){
   if(!isRev(e.from_state_rev)||!isRev(e.to_state_rev))return bad('state_rev_pair');
   if(e.from_setup_sha256!==undefined||e.to_setup_sha256!==undefined)return bad('setup_pair_on_live');
  }else{
   if(!hex(HEX64,e.from_setup_sha256)||!hex(HEX64,e.to_setup_sha256))return bad('setup_pair');
   if(e.from_state_rev!==undefined||e.to_state_rev!==undefined)return bad('state_rev_pair_on_frozen');
  }
  if(!(LEDGER_REASONS as readonly unknown[]).includes(e.reason_code))return bad('reason_code');
  const ev=e.evidence;
  if(!isObj(ev))return bad('evidence');
  if(e.reason_code==='quarantine_resolved'&&!nonEmpty(ev.quarantine_id))return bad('evidence.quarantine_id');
  if(e.reason_code==='bug_fixed'&&!(typeof ev.pr==='number'&&Number.isSafeInteger(ev.pr)&&ev.pr>0&&nonEmpty(ev.regression_test)))return bad('evidence.bug_fixed');
  if(!nonEmpty(e.added_by))return bad('added_by');
  if(!nonEmpty(e.approved_by))return bad('approved_by');
  if(!nonEmpty(e.approval_ref))return bad('approval_ref');
  if(!isTs(e.added_at))return bad('added_at');
  if(!isTs(e.approved_at))return bad('approved_at');
  return e as unknown as LedgerEntry;
 });
}

export function loadLedger(path:string):LedgerEntry[]{
 let raw:unknown;
 try{raw=JSON.parse(readFileSync(path,'utf8'));}
 catch(err){throw new EvalError('gold_invalid',`${path}: unreadable (${err instanceof Error?err.message:String(err)})`,{file:path});}
 return parseLedger(raw);
}

const sameTuple=(e:LedgerEntry,d:ObservedDiff)=>e.case_id===d.case_id&&e.mode===d.mode&&e.before_hash===d.before_hash&&e.after_hash===d.after_hash&&e.from_code===d.from_code&&e.to_code===d.to_code
 &&(d.mode==='live'?e.from_state_rev===d.from_state_rev&&e.to_state_rev===d.to_state_rev:e.from_setup_sha256===d.from_setup_sha256&&e.to_setup_sha256===d.to_setup_sha256);
const sameSet=(a:string[],b:string[])=>{const x=new Set(a),y=new Set(b);return x.size===y.size&&[...x].every(v=>y.has(v));};
const ids=(xs:LedgerEntry[])=>xs.map(e=>e.ledger_id).sort();

export function matchLedger(entries:LedgerEntry[],d:ObservedDiff):LedgerMatch{
 const tuple=entries.filter(e=>sameTuple(e,d));
 if(tuple.length===0)return {kind:'none',ledger_ids:[]};
 const exact=tuple.filter(e=>sameSet(e.changed_fields,d.changed_fields));
 const hit=exact.filter(e=>!isSelfApproved(e));
 if(hit.length>0)return {kind:'hit',ledger_ids:ids(hit)};
 if(exact.length>0)return {kind:'self_approved',ledger_ids:ids(exact)};
 return {kind:'partial',ledger_ids:ids(tuple)};
}
