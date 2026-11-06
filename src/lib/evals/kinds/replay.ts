// src/lib/evals/kinds/replay.ts
// replay_consistency (spec §5.3, §3.3 replay rows, §14). frozen: the case's sealed setup is checked against
// the rebuilt database first — a reported mismatch, or a recomputed setup_sha256 ≠ the recorded one →
// read_error(setup_mismatch), nothing projected. Equal projection hash → identical. Otherwise the ledger
// decides: hit → explained_diff(ledger_ids); partial → unexplained_diff(partial_ledger); self-approved →
// unexplained_diff(ledger_self_approved); none → unexplained_diff(diff). frozen never yields data_drift.
// live: identical; a privileged run (ctx.hints present) whose hint reader returns ≥ 1 hint since
// recorded.at → data_drift(ledger_ids of a matching entry, else [] — summary.ts counts [] as
// unexplained_diff); otherwise a ledger hit → explained_diff; an unprivileged run (no hint reader) without a
// hit → unexplained_diff(no_hints) (partial / self-approved reasons take precedence). The live tuple uses
// recorded.state_rev → ctx.stateRev(case). A ProjectionError is read_error(reason); any other failure of a
// case (projection, state rev, hints) is read_error(read_failed). Pure: every read is injected.
import {basename} from 'node:path';
import {projectionHash,sha256Hex} from '../canonical-json';
import {ProjectionError,diffProjections} from '../projections/facts';
import type {FrozenReplayCase,LiveReplayCase,ReplayCase,ReplayMode} from '../replay/fixture';
import {matchLedger} from '../replay/ledger';
import type {LedgerEntry,LedgerMatch,ObservedDiff} from '../replay/ledger';
import type {CaseOutcome,CaseReport,EvalModule,GoldSet,Hint,Projection,ReplayRequest,SummaryContext,Thresholds} from '../types';

export type ProjectFn=(request:ReplayRequest)=>Promise<Projection>;
export type SetupCheck={ok:true;setupSha256:string}|{ok:false;mismatch:string[]};
export interface ReplayContext{
 mode:ReplayMode;evaluatorCodeVersion:string;
 /** frozen only: verify the case's setup against the built database (replay/setup.ts::buildFrozenDb). */
 checkSetup?:(c:FrozenReplayCase)=>Promise<SetupCheck>;
 /** live only: the current fact_state_rev of the case's issuer (null = unavailable). */
 stateRev?:(c:LiveReplayCase)=>Promise<number|null>;
 /** live, privileged readers only (PrivilegedReader.hints). Absent = unprivileged. */
 hints?:(request:ReplayRequest,since:string)=>Promise<Hint[]>;
}
export const REPLAY_THRESHOLDS:Thresholds={max_fail:0,min_coverage_optional:'0.95'};
/** The report's set block for a replay file: replay files are not gold sets — set_id 'replay/<file>', version 1, sha256 =
 *  the file bytes, format 'f6', thresholds REPLAY_THRESHOLDS (used by run.ts and the critical frozen test, P1-10). */
export function replaySetOf(path:string,bytes:Uint8Array,module:EvalModule):GoldSet{
 return {schema_version:1,format:'f6',set_id:`replay/${basename(path,'.json')}`,version:1,module,artifact_class:'public',module_implementers:[],review_required:false,tolerance:{rel:'0'},
  thresholds:REPLAY_THRESHOLDS,optional_cases:[],history:[],cases:[],ready:true,path,sha256:sha256Hex(bytes)};
}
export const replaySummaryContext=(subset:boolean):SummaryContext=>({thresholds:REPLAY_THRESHOLDS,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset,evidenceClass:'truth'});

/** The ledger key of one observed change — the ONLY builder: replay below and replay/record.ts --supersede (Codex plan
 *  round 1 P1-5) both use it. frozen: setup pair (recorded case setup → the setup the projection was built from); live:
 *  state_rev pair (recorded → current). changed_fields = diffProjections, or ['projection'] when only the hash differs. */
export function observedDiffOf(c:ReplayCase,mode:ReplayMode,actual:Projection,to:{code:string;setupSha256?:string;stateRev?:number|null}):ObservedDiff{
 const diff=diffProjections(c.expected.projection,actual);
 const base={case_id:c.case_id,before_hash:c.expected.projection_hash,after_hash:projectionHash(actual),from_code:c.recorded.code_version,to_code:to.code,changed_fields:diff.length>0?diff:['projection']};
 if(mode==='frozen')return {...base,mode,from_setup_sha256:(c as FrozenReplayCase).setup.setup_sha256,to_setup_sha256:to.setupSha256??''};
 return {...base,mode,from_state_rev:(c as LiveReplayCase).recorded.state_rev,to_state_rev:to.stateRev??null};
}

const report=(c:ReplayCase,outcome:CaseOutcome,detail:Record<string,unknown>):CaseReport=>({case_id:c.case_id,required:true,outcome,left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail});
const missReason=(m:LedgerMatch,fallback:'diff'|'no_hints'):'diff'|'no_hints'|'partial_ledger'|'ledger_self_approved'=>
 m.kind==='partial'?'partial_ledger':m.kind==='self_approved'?'ledger_self_approved':fallback;

async function one(c:ReplayCase,project:ProjectFn,ledger:LedgerEntry[],ctx:ReplayContext):Promise<CaseReport>{
 const before=c.expected.projection_hash;
 const detail:Record<string,unknown>={mode:ctx.mode,before_hash:before,from_code:c.recorded.code_version,to_code:ctx.evaluatorCodeVersion};
 let setupSha='';
 if(ctx.mode==='frozen'){
  const fc=c as FrozenReplayCase;
  const s=await ctx.checkSetup!(fc);
  if(!s.ok)return report(c,{result:'read_error',reason:'setup_mismatch'},{...detail,mismatch:s.mismatch});
  if(s.setupSha256!==fc.setup.setup_sha256)return report(c,{result:'read_error',reason:'setup_mismatch'},{...detail,mismatch:['setup_sha256']});
  setupSha=s.setupSha256;
 }
 let actual:Projection;
 try{actual=await project(c.request);}
 catch(e){return report(c,{result:'read_error',reason:e instanceof ProjectionError?e.reason:'read_failed'},{...detail,message:e instanceof Error?e.message:String(e)});}
 const after=projectionHash(actual);detail.after_hash=after;
 if(after===before)return report(c,{result:'identical'},detail);
 if(ctx.mode==='frozen'){
  const d=observedDiffOf(c,'frozen',actual,{code:ctx.evaluatorCodeVersion,setupSha256:setupSha});
  detail.changed_fields=d.changed_fields;
  const m=matchLedger(ledger,d);
  detail.ledger=m;
  return report(c,m.kind==='hit'?{result:'explained_diff',ledger_ids:m.ledger_ids}:{result:'unexplained_diff',reason:missReason(m,'diff')},detail);
 }
 const lc=c as LiveReplayCase;
 const toRev=ctx.stateRev?await ctx.stateRev(lc):null;
 detail.from_state_rev=lc.recorded.state_rev;detail.to_state_rev=toRev;
 const d=observedDiffOf(c,'live',actual,{code:ctx.evaluatorCodeVersion,stateRev:toRev});
 detail.changed_fields=d.changed_fields;
 const m=matchLedger(ledger,d);
 detail.ledger=m;
 const hints=ctx.hints?await ctx.hints(c.request,lc.recorded.at):null;
 if(hints!==null&&hints.length>0)return report(c,{result:'data_drift',ledger_ids:m.kind==='hit'?m.ledger_ids:[],hints},detail);
 if(m.kind==='hit')return report(c,{result:'explained_diff',ledger_ids:m.ledger_ids},detail);
 return report(c,{result:'unexplained_diff',reason:missReason(m,hints===null?'no_hints':'diff')},detail);
}

export async function evaluateReplay(cases:ReplayCase[],project:ProjectFn,ledger:LedgerEntry[],ctx:ReplayContext):Promise<CaseReport[]>{
 if(ctx.mode==='frozen'&&!ctx.checkSetup)throw new Error('replay frozen: ctx.checkSetup is required');
 const out:CaseReport[]=[];
 for(const c of cases){
  try{out.push(await one(c,project,ledger,ctx));}
  catch(e){out.push(report(c,{result:'read_error',reason:'read_failed'},{mode:ctx.mode,message:e instanceof Error?e.message:String(e)}));}
 }
 return out;
}
