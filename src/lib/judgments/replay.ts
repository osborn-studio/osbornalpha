// src/lib/judgments/replay.ts
// replayJudgment (spec §6.3). Never writes. 1) Integrity: every input's digest(snapshot) must equal its
// stored hash and inputsHash(inputs) the stored inputs_hash; otherwise the storage layer was altered →
// input_hash_mismatch naming each failing input by kind + key (inputLabel: series_id for macro
// observations, metric@period for metrics, …) and nothing else is evaluated (exit 2). 2) Public
// producers (rule / model): the id is recomputed from the stored fields (judgmentIdOf); a different id
// is a divergence. 3) rule: compute / condition re-run on the FROZEN snapshots — no reads, no vendor
// refetch (spec §1.1 point 3) — and compared byte for byte (canonical JSON) with the stored claim /
// condition → exact | diverged (field diffs, exit 2). model / human / third_party → inputs_only;
// abstained rows → inputs_only (gather / target abstentions are not reproducible from frozen inputs).
// Private (human) fixtures skip the id check: their ids are domain-separated (spec §11.2). 4) Optional
// reconcile: each input rebuilt from JudgmentInputsDb at the row's as_of and the CURRENT server time (observedAt) → same | changed |
// unavailable — an upstream audit that never changes the verdict. The registry is passed in (REGISTRY
// in production; tests add test-only methods).
import type {InputKind,JudgmentInputsDb,JudgmentRow,JudgmentsDb,Methodology,Subject} from './types';
import {canonicalize,digest,inputsHash} from './canonical';
import {judgmentIdOf} from './contract';
import {JudgmentError} from './errors';
import {inputLabel,rebuildAndCompare} from './inputs';
import type {BuildOptions} from './inputs';
import {findMethodology} from './registry';

export type ReplayStatus='exact'|'diverged'|'inputs_only'|'input_hash_mismatch';
export interface HashMismatch{index:number;kind:InputKind|'inputs_hash';label:string;stored:string;computed:string}
export interface ReplayDiff{field:'judgment_id'|'claim'|'condition'|'abstained';registered:unknown;replayed:unknown}
export interface ReconcileEntry{kind:InputKind;ref:unknown;label:string;status:'same'|'changed'|'unavailable';detail?:string}
export interface ReplayReport{judgment_id:string;methodology:{id:string;version:string};producer_kind:string;status:ReplayStatus;hash_mismatches:HashMismatch[];diffs:ReplayDiff[];reconcile:ReconcileEntry[]|null}
export interface ReplayDeps{db:Pick<JudgmentsDb,'getJudgment'>&Partial<Pick<JudgmentsDb,'serverTime'>>;registry:readonly Methodology[];inputsDb?:JudgmentInputsDb;reconcile?:boolean;build?:BuildOptions;/** reconcile only: current server time (default: the db's serverTime, else the local clock). */now?:()=>Promise<string>|string}
export const REPLAY_FIXTURE_VERSION='judgment-replay/1';
export interface ReplayFixture{fixture_version:'judgment-replay/1';description:string;expect:'exact'|'inputs_only';judgment:JudgmentRow}
export function parseReplayFixture(raw:unknown):ReplayFixture{
 const bad=(why:string):never=>{throw new Error(`replay_fixture_invalid:${why}`);};
 const fx=raw as ReplayFixture;
 if(!fx||typeof fx!=='object'||fx.fixture_version!==REPLAY_FIXTURE_VERSION)bad('fixture_version');
 if(fx.expect!=='exact'&&fx.expect!=='inputs_only')bad('expect');
 if(typeof fx.description!=='string')bad('description');
 const j=fx.judgment;
 if(!j||typeof j.judgment_id!=='string'||!Array.isArray(j.inputs)||typeof j.inputs_hash!=='string'||typeof j.methodology_id!=='string')bad('judgment');
 return fx;
}
export function fixtureJudgmentsDb(rows:readonly JudgmentRow[]):Pick<JudgmentsDb,'getJudgment'>{
 const byId=new Map(rows.map(r=>[r.judgment_id,r] as const));
 return {getJudgment:async id=>{const r=byId.get(id);return r?structuredClone(r):null;}};
}
export function checkInputHashes(row:Pick<JudgmentRow,'inputs'|'inputs_hash'>):HashMismatch[]{
 const out:HashMismatch[]=[];
 row.inputs.forEach((x,index)=>{const computed=digest(x.snapshot);if(computed!==x.hash)out.push({index,kind:x.kind,label:inputLabel(x),stored:x.hash,computed});});
 const h=inputsHash(row.inputs);
 if(h!==row.inputs_hash)out.push({index:-1,kind:'inputs_hash',label:'inputs_hash',stored:row.inputs_hash,computed:h});
 return out;
}
const same=(a:unknown,b:unknown)=>canonicalize(a??null)===canonicalize(b??null);
async function reconcileInputs(row:JudgmentRow,deps:Omit<ReplayDeps,'db'>):Promise<ReconcileEntry[]>{
 const out:ReconcileEntry[]=[];
 const noDb=row.inputs.map(x=>({kind:x.kind,ref:x.ref,label:inputLabel(x),status:'unavailable' as const,detail:'no_inputs_db'}));
 if(!deps.inputsDb)return noDb;
 let observedAt:string;
 try{observedAt=await (deps.now??(()=>new Date().toISOString()))();}
 catch(e){const detail=`clock_unavailable: ${e instanceof Error?e.message:String(e)}`;return noDb.map(x=>({...x,detail}));}
 for(const x of row.inputs){
  const base={kind:x.kind,ref:x.ref,label:inputLabel(x)};
  try{
   const r=await rebuildAndCompare(x,deps.inputsDb,row.as_of,observedAt,deps.build);
   out.push(r.status==='ok'?{...base,status:'same'}:r.status==='input_not_public'?{...base,status:'unavailable',detail:r.code}:{...base,status:'changed',detail:r.field});
  }catch(e){out.push({...base,status:'unavailable',detail:e instanceof Error?e.message:String(e)});}
 }
 return out;
}
export async function replayRow(row:JudgmentRow,deps:Omit<ReplayDeps,'db'>):Promise<ReplayReport>{
 // The verdict comes from the frozen snapshots alone; reconcile runs afterwards and can only add its own entries.
 const r=await replayFrozen(row,deps);
 if(!deps.reconcile)return r;
 let reconcile:ReconcileEntry[];
 try{reconcile=await reconcileInputs(row,deps);}
 catch(e){const detail=e instanceof Error?e.message:String(e);reconcile=row.inputs.map(x=>({kind:x.kind,ref:x.ref,label:inputLabel(x),status:'unavailable' as const,detail}));}
 return {...r,reconcile};
}
async function replayFrozen(row:JudgmentRow,deps:Omit<ReplayDeps,'db'>):Promise<ReplayReport>{
 const base={judgment_id:row.judgment_id,methodology:{id:row.methodology_id,version:row.methodology_version},producer_kind:String(row.producer_kind)};
 const reconcile=null;
 const hash_mismatches=checkInputHashes(row);
 if(hash_mismatches.length>0)return {...base,status:'input_hash_mismatch',hash_mismatches,diffs:[],reconcile};
 const diffs:ReplayDiff[]=[];
 const pk=String(row.producer_kind);
 if(pk==='rule'||pk==='model'){
  const id=judgmentIdOf({subject_type:row.subject_type,subject_key:row.subject_key,judgment_type:row.judgment_type,methodology_id:row.methodology_id,methodology_version:row.methodology_version,as_of:row.as_of,inputs_hash:row.inputs_hash,producer_nonce:row.producer_nonce});
  if(id!==row.judgment_id)diffs.push({field:'judgment_id',registered:row.judgment_id,replayed:id});
 }
 if(pk!=='rule'||row.abstained)return {...base,status:diffs.length>0?'diverged':'inputs_only',hash_mismatches,diffs,reconcile};
 const m=findMethodology(deps.registry,row.methodology_id,row.methodology_version);
 if(!m)throw new JudgmentError('unknown_methodology',`${row.methodology_id}@${row.methodology_version} is not in the replay registry`);
 const subject:Subject={type:row.subject_type,key:row.subject_key};
 const inputs=structuredClone(row.inputs);
 const out=m.compute(subject,inputs);
 if(out.abstained)diffs.push({field:'abstained',registered:false,replayed:out});
 else{
  if(!same(out.claim,row.claim))diffs.push({field:'claim',registered:row.claim,replayed:out.claim});
  const cond=m.condition(subject,inputs,out.claim);
  if(!same(cond,row.condition))diffs.push({field:'condition',registered:row.condition,replayed:cond});
 }
 return {...base,status:diffs.length>0?'diverged':'exact',hash_mismatches,diffs,reconcile};
}
export async function replayJudgment(id:string,deps:ReplayDeps):Promise<ReplayReport>{
 const row=await deps.db.getJudgment(id);
 if(!row)throw new JudgmentError('unknown_judgment',id);
 const {db,...rest}=deps;
 return replayRow(row,{...rest,now:rest.now??(db.serverTime?()=>db.serverTime!():undefined)});
}
export const replayExitCode=(r:ReplayReport):0|2=>r.status==='input_hash_mismatch'||r.status==='diverged'?2:0;
