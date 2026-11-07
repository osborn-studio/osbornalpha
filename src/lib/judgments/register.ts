// src/lib/judgments/register.ts
// registerJudgment (spec §6.2). Validates everything the public table promises before the RPC —
// methodology active (draft only in dry runs) and consistent with the module; public subject type
// that exists and is active; producer nonce (§3.6); inputs: sorted by (kind, canonical ref), no
// duplicates, kind ∈ public whitelist ∩ the method row's input_kinds, origin from the frozen table,
// max(available_at) ≤ as_of end of day (lookahead), each rebuilt by its fixed builder byte for byte
// (§3.5); active outcomes: claim by kind, horizon = the synced row's, condition through a public
// resolver's validateParams with a predicate compatible with the kind, target consistent with the
// horizon; settle window (target.ts, mirrored by the RPC) and labelAvailableAt for retrospective. Then
// id = judgmentIdOf(...) (claim is not part of the id, §6.1); an existing id with the same normalised
// payload (all semantic columns, i.e. the row minus registered_at / retrospective / code_version /
// batch_id / created_at) is a duplicate, a different one is quarantined (dataset 'judgments',
// table 'judgments', natural_key = id, idempotency_conflict, {registered, attempted}) and refused.
// The RPC insert's unique violation (23505: a concurrent producer won) rereads and compares again.
// The caller owns the batch (produce.ts). Resolvers are injected (resolverOf) so this file does not
// depend on resolvers/index.ts (Task 11); Task 14's deps.ts wires the real table.
import type {TableClient} from '@/lib/db/table-client';
import {quarantine} from '@/lib/dq/quarantine';
import type {Abstained,Active,CategoricalClaim,Claim,Condition,Horizon,Input,IntervalClaim,JudgmentInputsDb,JudgmentInsert,JudgmentRow,JudgmentsDb,Kind,LabelPolicy,Methodology,ProducerRef,PublicSubjectType,Resolver,ResolverName,Subject,Target} from './types';
import {PUBLIC_INPUT_KINDS,PUBLIC_PRODUCER_KINDS,PUBLIC_RESOLVERS,PUBLIC_SUBJECT_TYPES} from './types';
import {canonicalize,inputsHash,jsonClean} from './canonical';
import {JudgmentError} from './errors';
import {isAbstained,judgmentIdOf,producerNonceOf,validateClaim,validateHorizon,validateSubject} from './contract';
import {inputLabel,rebuildAndCompare,sortInputs} from './inputs';
import type {BuildOptions} from './inputs';
import {originKnown} from './origins';
import {labelPolicyOf,settleWindow,targetConsistent} from './target';
import {endOfUtcDay} from './time';

export type ResolverLookup=(name:ResolverName)=>Pick<Resolver,'name'|'version'|'validateParams'|'labelAvailableAt'>|null;
export interface RegisterActor{actor:'cron'|'script'|'admin'|'test';dryRun?:boolean}
export interface RegisterInput{binding?:Record<string,string>;methodology:Methodology;subject:Subject;asOf:string;producerRef:ProducerRef;inputs:Input[];outcome:Active<Claim>|Abstained;condition:Condition|null;target:Target|null;codeVersion:string;batchId:string}
export interface RegisterDeps{db:JudgmentsDb;inputsDb:JudgmentInputsDb;tables:TableClient;resolverOf:ResolverLookup;build?:BuildOptions}
export interface RegisterResult{judgment_id:string;duplicate:boolean;abstained:boolean;dry_run:boolean;row:JudgmentInsert;registered_at:string|null;retrospective:boolean|null;quarantined:boolean}
export const PAYLOAD_FIELDS=['judgment_id','subject_type','subject_key','judgment_type','methodology_id','methodology_version','kind','producer_kind','producer_ref','producer_nonce','as_of','inputs','inputs_hash','abstained','abstain_reason','claim','condition','horizon','target','label_policy','settle_after','settle_by'] as const satisfies readonly (keyof JudgmentRow)[];
export function normalizedPayload(row:Partial<JudgmentRow>|JudgmentInsert):Record<string,unknown>{
 const r=row as Record<string,unknown>;
 return Object.fromEntries(PAYLOAD_FIELDS.map(k=>[k,r[k]??null]));
}
export const samePayload=(a:Partial<JudgmentRow>|JudgmentInsert,b:Partial<JudgmentRow>|JudgmentInsert)=>canonicalize(normalizedPayload(a))===canonicalize(normalizedPayload(b));
const str=(v:unknown)=>typeof v==='string'&&v.length>0;
/** The §3.6 nonce has one implementation (contract.ts, Task 1); the alias keeps this module's name. */
export const nonceOf=producerNonceOf;
/** Task 4 maps 23505 to JudgmentError('duplicate_key'); a raw pg/PostgREST error still carries '23505'. */
export const isUniqueViolation=(e:unknown)=>{const c=(e as {code?:unknown}|null)?.code;return c==='23505'||c==='duplicate_key';};
const NUM_OPS=new Set(['>','>=','<','<=','between']);
function checkPredicate(kind:Kind,claim:Claim,c:Condition):void{
 const bad=(why:string):never=>{throw new JudgmentError('invalid_condition',why);};
 if(!c.text||!str(c.text.zh)||!str(c.text.en))bad('condition.text needs zh and en');
 const p=c.predicate as {op:string;rhs:unknown};
 if(kind==='categorical'){if(p.op!=='eq'||p.rhs!==(claim as CategoricalClaim).selected)bad('categorical predicate must be eq claim.selected');return;}
 if(kind==='interval'){const i=claim as IntervalClaim;if(p.op!=='between'||!Array.isArray(p.rhs)||p.rhs[0]!==i.low||p.rhs[1]!==i.high)bad('interval predicate must be between [low, high]');return;}
 if(p.op==='eq')return;
 if(!NUM_OPS.has(p.op))bad(`predicate op ${p.op}`);
 if(p.op==='between'){if(!Array.isArray(p.rhs)||p.rhs.length!==2||!p.rhs.every(x=>typeof x==='number'&&Number.isFinite(x))||!((p.rhs[0] as number)<(p.rhs[1] as number)))bad('between needs a finite [low, high] with low < high');}
 else if(typeof p.rhs!=='number'||!Number.isFinite(p.rhs))bad('numeric predicate needs a finite rhs');
}
interface Semantic{claim:Claim|null;condition:Condition|null;horizon:Horizon|null;target:Target|null;label_policy:LabelPolicy|null;settle_after:string|null;settle_by:string|null;abstain_reason:string|null}

/** idempotency_conflict; `quarantined` says whether a dq_quarantine row was written (not in dry runs). */
export class IdempotencyConflict extends JudgmentError{constructor(message:string,public readonly quarantined:boolean){super('idempotency_conflict',message);}}
export async function registerJudgment(actor:RegisterActor,input:RegisterInput,deps:RegisterDeps):Promise<RegisterResult>{
 const m=input.methodology;const {db}=deps;const s=input.subject;
 if(typeof input.codeVersion!=='string'||input.codeVersion.length<7||input.codeVersion.length>64)throw new JudgmentError('code_version_missing');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf))throw new JudgmentError('invalid_parameter',`as_of ${input.asOf}`);
 // 1. methodology
 const mrow=await db.methodology(m.id,m.version);
 if(!mrow)throw new JudgmentError('methodology_unavailable',`${m.id}@${m.version} is not synced`);
 if(mrow.status==='retired'||(mrow.status==='draft'&&!actor.dryRun))throw new JudgmentError('methodology_unavailable',`${m.id}@${m.version} is ${mrow.status}`);
 if(mrow.kind!==m.kind||mrow.producer_kind!==m.producer_kind||mrow.judgment_type!==m.judgment_type)throw new JudgmentError('methodology_unavailable',`${m.id}@${m.version}: the synced row differs from the module`);
 if(!(PUBLIC_PRODUCER_KINDS as readonly string[]).includes(m.producer_kind))throw new JudgmentError('methodology_unavailable',`producer_kind ${m.producer_kind} is not public`);
 // 2. subject
 validateSubject(s);
 if(!(PUBLIC_SUBJECT_TYPES as readonly string[]).includes(s.type)||!mrow.subject_types.includes(s.type))throw new JudgmentError('subject_type_not_public',`${s.type} for ${m.id}@${m.version}`);
 const exists=await db.subjectExists(s);
 if(exists==='missing')throw new JudgmentError('subject_missing',`${s.type}:${s.key}`);
 if(exists==='inactive')throw new JudgmentError('subject_inactive',`${s.type}:${s.key}`);
 // 3. producer
 const producer_nonce=nonceOf(m.producer_kind,input.producerRef);
 // 4. inputs (rebuilt at the database server's time: the observation instant of unfinished price bars, H-02)
 const observedAt=await db.serverTime();
 const inputs=sortInputs(input.inputs);
 const seen=new Set<string>();
 for(const x of inputs){
  const k=`${x.kind}\u0000${canonicalize(x.ref)}`;
  if(seen.has(k))throw new JudgmentError('input_not_allowed',`duplicate input ${inputLabel(x)}`);
  seen.add(k);
  if(!(PUBLIC_INPUT_KINDS as readonly string[]).includes(x.kind)||!mrow.input_kinds.includes(x.kind))throw new JudgmentError('input_not_allowed',inputLabel(x));
  if(!originKnown(x.kind,x.origin))throw new JudgmentError('input_origin_unknown',inputLabel(x));
 }
 const bound=Date.parse(endOfUtcDay(input.asOf));
 for(const x of inputs)if(!(Date.parse(x.available_at)<=bound))throw new JudgmentError('lookahead',`${inputLabel(x)} available_at ${x.available_at} > ${endOfUtcDay(input.asOf)}`);
 for(const x of inputs){
  const r=await rebuildAndCompare(x,deps.inputsDb,input.asOf,observedAt,deps.build);
  if(r.status==='input_snapshot_mismatch')throw new JudgmentError('input_snapshot_mismatch',`${inputLabel(x)}: ${r.field}`);
  if(r.status==='input_not_public')throw new JudgmentError('input_not_public',`${inputLabel(x)}: ${r.code}`);
 }
 // 5. outcome
 let o:Active<Claim>|Abstained=jsonClean(input.outcome);let sem:Semantic;let labelAvailableAt:string|null=null;
 // R-01: the target is recomputed from the frozen inputs, never trusted from the caller (spec §6.2 step 2).
 let recomputed:Target|null=null;
 if(!o.abstained){
  const tr=await m.resolveTarget({subject:s,asOf:input.asOf,observedAt,...(input.binding?{binding:input.binding}:{})},inputs,deps.inputsDb);
  if(isAbstained(tr))o={abstained:true,reason:tr.reason,...(tr.missing?{missing:tr.missing}:{})};else recomputed=tr;
 }
 if(o.abstained){
  if(!str(o.reason))throw new JudgmentError('invalid_claim','abstained without a reason');
  sem={claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null,abstain_reason:o.reason};
 }else{
  if(inputs.length===0)throw new JudgmentError('invalid_claim','an active judgment needs inputs');
  validateClaim(m.kind,o.claim);
  validateHorizon(m.horizon);
  if(canonicalize(mrow.horizon)!==canonicalize(m.horizon))throw new JudgmentError('methodology_unavailable','horizon differs from the synced row');
  const c=input.condition===null?null:jsonClean(input.condition),t=input.target;
  if(!c)throw new JudgmentError('invalid_condition','missing condition');
  if(!t)throw new JudgmentError('invalid_condition','missing target');
  if(!(PUBLIC_RESOLVERS as readonly string[]).includes(c.resolver))throw new JudgmentError('invalid_condition',`resolver ${c.resolver} is not public`);
  const res=deps.resolverOf(c.resolver);
  if(!res)throw new JudgmentError('invalid_condition',`no resolver ${c.resolver}`);
  if(!res.validateParams(c.params))throw new JudgmentError('invalid_condition',`params rejected by ${c.resolver}@${res.version}`);
  checkPredicate(m.kind,o.claim,c);
  if(canonicalize(jsonClean(t))!==canonicalize(recomputed))throw new JudgmentError('invalid_condition','target differs from the one recomputed from the inputs');
  if(!targetConsistent(t,m.horizon,input.asOf,inputs))throw new JudgmentError('invalid_condition','target does not match the horizon');
  const label_policy=labelPolicyOf(m.params);
  const w=settleWindow(t,m.horizon,m.params);
  labelAvailableAt=res.labelAvailableAt(c.params,t);
  sem={claim:o.claim,condition:c,horizon:m.horizon,target:t,label_policy,settle_after:w.settle_after,settle_by:w.settle_by,abstain_reason:null};
 }
 // 6. identity and duplicate / conflict
 const inputs_hash=inputsHash(inputs);
 const judgment_id=judgmentIdOf({subject_type:s.type,subject_key:s.key,judgment_type:m.judgment_type,methodology_id:m.id,methodology_version:m.version,as_of:input.asOf,inputs_hash,producer_nonce});
 const row:JudgmentInsert=jsonClean({judgment_id,subject_type:s.type as PublicSubjectType,subject_key:s.key,judgment_type:m.judgment_type,methodology_id:m.id,methodology_version:m.version,kind:m.kind,producer_kind:m.producer_kind as 'rule'|'model',
  producer_ref:input.producerRef,producer_nonce,as_of:input.asOf,inputs,inputs_hash,abstained:o.abstained,...sem,code_version:input.codeVersion,batch_id:input.batchId,retrospective_hint:{label_available_at:labelAvailableAt}} as JudgmentInsert);
 const dry=!!actor.dryRun;
 const settle=async(existing:JudgmentRow):Promise<RegisterResult>=>{
  if(samePayload(existing,row))return {judgment_id,duplicate:true,abstained:row.abstained,dry_run:dry,row,registered_at:existing.registered_at,retrospective:existing.retrospective,quarantined:false};
  if(!dry)await quarantine(deps.tables,{dataset:'judgments',table:'judgments',naturalKey:judgment_id,reasonCode:'idempotency_conflict',batchId:input.batchId,payload:{registered:normalizedPayload(existing),attempted:normalizedPayload(row)}});
  throw new IdempotencyConflict(`${judgment_id}: same id, different payload`,!dry);
 };
 const existing=await db.getJudgment(judgment_id);
 if(existing)return settle(existing);
 if(dry)return {judgment_id,duplicate:false,abstained:row.abstained,dry_run:true,row,registered_at:null,retrospective:null,quarantined:false};
 try{
  const r=await db.registerJudgment(row,row.abstained?null:{settle_after:row.settle_after!,settle_by:row.settle_by!,label_policy:row.label_policy!});
  return {judgment_id,duplicate:false,abstained:row.abstained,dry_run:false,row,registered_at:r.registered_at,retrospective:r.retrospective,quarantined:false};
 }catch(e){
  if(!isUniqueViolation(e))throw e;
  const winner=await db.getJudgment(judgment_id);
  if(!winner)throw e;
  return settle(winner);
 }
}
