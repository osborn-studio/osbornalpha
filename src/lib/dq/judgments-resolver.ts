// src/lib/dq/judgments-resolver.ts
// Quarantine hook for dataset 'judgments' (spec §7.6), called by POST /api/admin/dq/quarantine/[id]. Accept verdicts
// per reason_code must determine one realised value (audit G12): settlement_basis_mismatch → {kind:'accept_refetched',
// evidence_hash} equal to the item's frozen evidence hash (re-checked against digest(payload.evidence)); the override
// carries that complete evidence so the next settle run never refetches. settlement_ambiguous_fact → {kind:'choose_fact',
// chosen} whose digest is one of payload.candidates. settlement_base_bar_missing / settlement_benchmark_gap → only
// reject (resolution_not_applicable). Accept = apply_quarantine_override: locks queue then item, accepts only the
// queue's CURRENT inconsistency, revokes any lease, flips the item and writes research_audit_log in ONE transaction
// (audited=true: the route must not audit again); override.cutoff = payload.cutoff (P1-03). Reject of a settlement
// item = reject_quarantined_settlement: void(quarantine_rejected) as admin:<id> (request_key quarantine-reject:<item
// id>, a manual judgments.settle batch) + item flip + audit in ONE transaction (plan audit P1-05), bound to the
// payload's evidence_hash / cutoff read here (Q1-03: a worker refresh in between → stale; an item without them →
// invalid_resolution), unless the judgment is already final (then validated atomic cleanup). RPC 'stale' / 'closed' → stale (nothing written); 'item_not_open' →
// already_resolved. Other judgments reasons (idempotency_conflict on table judgments) are a plain resolveQuarantine, audited by the route.
import type {Row,TableClient} from '../db/table-client';
import {digest} from '../judgments/canonical';
import {resolverFor} from '../judgments/resolvers';
import type {JudgmentsDb,QuarantineOverride} from '../judgments/types';
import {emptyCounts,finishBatch,startBatch} from './batches';
import {resolveQuarantine} from './quarantine';

export type JudgmentsResolveOutcome='resolved'|'already_resolved'|'stale'|'resolution_not_applicable'|'invalid_resolution'|'unknown_judgment'|'code_version_unavailable';
export interface JudgmentsResolveResult{outcome:JudgmentsResolveOutcome;audited:boolean;judgmentId:string|null;resolution:'accept_refetched'|'choose_fact'|'quarantine_rejected'|'plain'|null;seq:number|null}
export interface JudgmentsResolveDeps{db:JudgmentsDb;tables:TableClient;codeVersion:string|null;now?:()=>Date}

const SETTLEMENT_REASONS:readonly string[]=['settlement_basis_mismatch','settlement_ambiguous_fact','settlement_base_bar_missing','settlement_benchmark_gap'];
const REJECT_ONLY:readonly string[]=['settlement_base_bar_missing','settlement_benchmark_gap'];
const FINAL=new Set(['settled','void','withdrawn']);
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);

export async function resolveJudgmentsItem(deps:JudgmentsResolveDeps,item:Row,input:{status:'resolved_accept'|'resolved_reject';resolution?:unknown;resolvedBy:string}):Promise<JudgmentsResolveResult>{
 const id=String(item.id),reason=String(item.reason_code);
 const judgmentId=typeof item.natural_key==='string'?item.natural_key:null;
 const result=(outcome:JudgmentsResolveOutcome,extra:Partial<JudgmentsResolveResult>={}):JudgmentsResolveResult=>({outcome,audited:false,judgmentId,resolution:null,seq:null,...extra});
 if(item.status!=='open')return result('already_resolved');
 if(item.table_name!=='judgment_settlements'||!SETTLEMENT_REASONS.includes(reason)){
  if(input.status==='resolved_accept'&&input.resolution!==undefined)return result('resolution_not_applicable');
  const o=await resolveQuarantine(deps.tables,id,{status:input.status,resolvedBy:input.resolvedBy});
  return result(o==='resolved'?'resolved':'already_resolved',{resolution:'plain'});
 }
 const judgment=judgmentId?await deps.db.getJudgment(judgmentId):null;
 if(!judgment||!judgment.condition)return result('unknown_judgment');
 const payload=isObj(item.payload)?item.payload:{};
 const evidenceHash=typeof payload.evidence_hash==='string'?payload.evidence_hash:null;
 const cutoff=typeof payload.cutoff==='string'?payload.cutoff:null;   // the resolution cutoff of this inconsistency (P1-03)
 const jid=judgment.judgment_id;
 const audit=(extra:Record<string,unknown>)=>({action:'dq.quarantine_resolve',user_id:input.resolvedBy,object_id:id,
  detail:{id,status:input.status,outcome:'resolved',reason_code:reason,judgment_id:jid,evidence_hash:evidenceHash,...extra}});
 if(input.status==='resolved_accept'){
  if(REJECT_ONLY.includes(reason))return result('resolution_not_applicable');
  const res=input.resolution;
  if(!isObj(res)||cutoff===null)return result('invalid_resolution');
  const at=(deps.now??(()=>new Date()))().toISOString();
  let override:QuarantineOverride;
  if(reason==='settlement_basis_mismatch'){
   if(res.kind!=='accept_refetched'||typeof res.evidence_hash!=='string'||evidenceHash===null||res.evidence_hash!==evidenceHash||!isObj(payload.evidence)||digest(payload.evidence)!==evidenceHash)return result('invalid_resolution');
   override={reason_code:reason,resolution:{kind:'accept_refetched',evidence_hash:evidenceHash,evidence:payload.evidence},evidence_hash:evidenceHash,resolved_by:input.resolvedBy,at,cutoff};
  }else{
   const candidates=Array.isArray(payload.candidates)?payload.candidates:[];
   const chosen=res.chosen;
   if(evidenceHash===null||res.kind!=='choose_fact'||!isObj(chosen)||!candidates.some(c=>digest(c)===digest(chosen)))return result('invalid_resolution');
   override={reason_code:reason,resolution:{kind:'choose_fact',chosen},evidence_hash:evidenceHash,resolved_by:input.resolvedBy,at,cutoff};
  }
  const status=await deps.db.applyQuarantineOverride(judgment.judgment_id,override,id,audit({resolution:override.resolution.kind,evidence_hash:override.evidence_hash}));
  if(status==='item_not_open')return result('already_resolved');
  if(status!=='applied')return result('stale');
  return result('resolved',{audited:true,resolution:override.resolution.kind});
 }
 if(!deps.codeVersion)return result('code_version_unavailable');
 if(evidenceHash===null||cutoff===null)return result('invalid_resolution');
 const latest=(await deps.db.settlementsOf([judgment.judgment_id])).reduce<{seq:number;kind:string}|null>((m,s)=>!m||s.seq>m.seq?{seq:s.seq,kind:s.kind}:m,null);
 if(latest&&FINAL.has(latest.kind)){
  const flipped=await deps.db.resolveClosedQuarantine(jid,id,{evidence_hash:evidenceHash,cutoff},input.resolvedBy,audit({resolution:'quarantine_rejected'}));
  if(flipped!=='applied')return result(flipped==='item_not_open'?'already_resolved':'stale');
  return result('resolved',{audited:true,resolution:'quarantine_rejected',seq:latest.seq});
 }
 // Q1-03: the rejection is bound to the evidence identity read here; a worker refresh in between makes the RPC answer stale.
 const resolver=resolverFor(judgment.condition.resolver);
 const {batchId}=await startBatch(deps.tables,{producer:'ts-judgments',dataset:'judgments.settle',codeVersion:deps.codeVersion,triggeredBy:'manual'});
 const counts={...emptyCounts(),fetched:1};
 let errors:{code:string;key:string;message?:string}[]=[];
 try{
  // P1-05: void + item flip + audit in ONE transaction (locks queue then item; replay-safe on the request key).
  const r=await deps.db.rejectQuarantinedSettlement(judgment.judgment_id,id,{evidence_hash:evidenceHash,cutoff},`quarantine-reject:${id}`,{kind:'void',outcome:null,realized:null,
   evidence:{quarantine_id:id,reason_code:reason,evidence_hash:evidenceHash},resolver:resolver.name,resolver_version:resolver.version,reason:'quarantine_rejected',
   actor:`admin:${input.resolvedBy}`,code_version:deps.codeVersion,batch_id:batchId},audit({resolution:'quarantine_rejected'}));
  if(r.status==='applied')counts.versioned=1;
  else if(r.status==='already_applied')counts.duplicates=1;
  else if(r.status==='stale'||r.status==='item_not_open'){counts.fetched=0;errors=[{code:`quarantine_reject_${r.status}`,key:jid}];}
  if(r.status==='applied'||r.status==='already_applied')return result('resolved',{audited:true,resolution:'quarantine_rejected',seq:r.seq});
  if(r.status==='item_not_open')return result('already_resolved');
  if(r.status==='stale')return result('stale');
  throw new Error(`reject_quarantined_settlement: ${r.status} for ${judgment.judgment_id}`);
 }catch(e){
  counts.failed=1;
  errors=[{code:'reject_failed',key:jid,message:e instanceof Error?e.message:String(e)}];
  throw e;
 }finally{
  await finishBatch(deps.tables,batchId,{counts,errors});
 }
}
