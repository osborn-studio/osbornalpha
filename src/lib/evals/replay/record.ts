// src/lib/evals/replay/record.ts
// Append-only recording of replay expectations (spec §5.3.1 录制, §5.3.2 录制, §5.3.3, §14
// replay_rerecord_refused). A draft case (recorded = expected = null) gets its expected projection,
// recorded {code_version, at[, state_rev]} and (frozen) the sealed setup. A recorded case whose new
// projection hash equals the stored one is left untouched. A changed one is refused unless --supersede
// names a ledger entry that is approved (approved_by ≠ added_by), for this case and mode, whose
// before_hash is the stored hash and whose after_hash is the new hash, AND that matchLedger reports as a hit for the
// same ObservedDiff replay builds (kinds/replay.ts::observedDiffOf: code versions, setup / state_rev pair, the exact
// changed_fields — Codex plan round 1 P1-5); then expected/recorded are replaced,
// the setup is kept and the supersession is appended to case.supersessions. Pure: returns a new file.
import {projectionHash} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection} from '../types';
import {isDraft} from './fixture';
import type {FrozenReplayCase,LiveReplayCase,ReplayFile,SealedSetup} from './fixture';
import {observedDiffOf} from '../kinds/replay';
import {isSelfApproved,matchLedger} from './ledger';
import type {LedgerEntry} from './ledger';

export interface RecordInput{case_id:string;projection:Projection;setup?:SealedSetup;code_version:string;at:string;state_rev?:number|null}
export interface RecordOptions{supersede?:string;ledger:LedgerEntry[]}
export type RecordAction='recorded'|'unchanged'|'superseded';
export interface RecordResult{file:ReplayFile;action:RecordAction;projection_hash:string}

const refuse=(message:string,detail:Record<string,unknown>)=>new EvalError('replay_rerecord_refused',message,detail);

export function applyRecording(file:ReplayFile,input:RecordInput,opts:RecordOptions):RecordResult{
 const i=file.cases.findIndex(c=>c.case_id===input.case_id);
 if(i<0)throw new EvalError('gold_invalid',`unknown replay case ${input.case_id}`,{case_id:input.case_id});
 if(!/^[0-9a-f]{40}$/.test(input.code_version))throw new EvalError('code_version_missing',`recording needs a 40-hex evaluator code version, got ${input.code_version}`);
 const hash=projectionHash(input.projection);
 const expected={projection_hash:hash,projection:structuredClone(input.projection)};
 const recorded=()=>{
  if(file.mode==='frozen')return {code_version:input.code_version,at:input.at};
  if(typeof input.state_rev!=='number'||!Number.isSafeInteger(input.state_rev)||input.state_rev<0)throw new EvalError('gold_invalid',`live case ${input.case_id}: state_rev unavailable`,{case_id:input.case_id});
  return {code_version:input.code_version,at:input.at,state_rev:input.state_rev};
 };
 const next=structuredClone(file);
 const c=next.cases[i];
 if(isDraft(c)){
  if(opts.supersede!==undefined)throw refuse(`case ${c.case_id}: --supersede applies to recorded cases only`,{case_id:c.case_id});
  if(file.mode==='frozen'){
   if(!input.setup)throw new EvalError('gold_invalid',`frozen case ${c.case_id}: recording needs the sealed setup`,{case_id:c.case_id});
   const rec:FrozenReplayCase={case_id:c.case_id,request:c.request,setup:structuredClone(input.setup),recorded:recorded(),expected};
   next.cases[i]=rec;
  }else{
   const rec:LiveReplayCase={case_id:c.case_id,request:c.request,recorded:recorded() as LiveReplayCase['recorded'],expected};
   next.cases[i]=rec;
  }
  return {file:next,action:'recorded',projection_hash:hash};
 }
 const before=c.expected.projection_hash;
 // A frozen input.setup is the CANDIDATE setup (built from the current setup draft / config). It may differ from the recorded one:
 // a setup transition is as much a change as a new projection hash and needs the same approved ledger entry (matched on the OLD recorded setup).
 const oldSetupSha=file.mode==='frozen'?(c as FrozenReplayCase).setup?.setup_sha256:undefined;
 const setupMoved=file.mode==='frozen'&&input.setup!==undefined&&input.setup.setup_sha256!==oldSetupSha;
 if(before===hash&&!setupMoved)return {file,action:'unchanged',projection_hash:hash};
 const detail={case_id:c.case_id,before_hash:before,after_hash:hash,...(setupMoved?{from_setup_sha256:oldSetupSha,to_setup_sha256:input.setup!.setup_sha256}:{})};
 if(opts.supersede===undefined)throw refuse(`case ${c.case_id}: ${before===hash?'setup changed':`projection changed (${before} → ${hash})`}; re-recording needs --supersede <approved ledger_id>`,detail);
 const e=opts.ledger.find(x=>x.ledger_id===opts.supersede);
 const why=!e?'ledger_id not found':isSelfApproved(e)?'ledger entry is self-approved':e.case_id!==c.case_id?'ledger entry is for another case'
  :e.mode!==file.mode?'ledger entry is for another mode':e.before_hash!==before?'ledger before_hash ≠ recorded projection hash':e.after_hash!==hash?'ledger after_hash ≠ new projection hash':null;
 if(why!==null||!e)throw refuse(`case ${c.case_id}: ${why}`,{...detail,ledger_id:opts.supersede});
 const observed=observedDiffOf(c,file.mode,input.projection,{code:input.code_version,setupSha256:input.setup?.setup_sha256??(c as FrozenReplayCase).setup?.setup_sha256,stateRev:input.state_rev??null});
 const m=matchLedger([e],observed);
 if(m.kind!=='hit')throw refuse(`case ${c.case_id}: ledger entry ${e.ledger_id} does not match the observed change (${m.kind}: code versions, setup/state pair or changed_fields differ)`,{...detail,ledger_id:e.ledger_id,observed});
 next.cases[i]={...c,...(setupMoved?{setup:structuredClone(input.setup)}:{}),recorded:recorded(),expected,supersessions:[...(c.supersessions??[]),{ledger_id:e.ledger_id,before_hash:before,after_hash:hash,at:input.at}]} as FrozenReplayCase|LiveReplayCase;
 return {file:next,action:'superseded',projection_hash:hash};
}
