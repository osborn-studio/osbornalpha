// src/lib/evals/reduce.ts
// The one kind-aware reduction of a run's cases against its AUTHENTICATED fixture (Codex plan round 1 P1-2, P2-2).
// Used by the kinds that build reports (Task 14 reference, and by the release-manifest validator, Task 12) so a stored
// summary can be re-derived without trusting anything the report says about itself. The fixture decides: the exact
// case-id population (missing / extra ids are problems; a missing member is reduced as `missing`, so the gate cannot pass), each case's `required` flag, retraction (a retracted gold case
// must be skipped(retracted), and only those), the thresholds, the gold block (summary.ts::goldBlockOf) and the
// evidence class. `subset` is read from the cases (any skipped(subset)); the report's own thresholds / gold / subset are
// never inputs. reference_regression: the fixture-designated canary (sample.canary) is excluded from the population
// consistently — its case stays in report.cases (§5.4 (c)) but is never reduced.
import {REFERENCE_THRESHOLDS} from './kinds/reference';
import type {ReferenceSampleFile} from './kinds/reference';
import {REPLAY_THRESHOLDS} from './kinds/replay';
import {recordedCases} from './replay/fixture';
import type {ReplayFile} from './replay/fixture';
import {goldBlockOf,summarize} from './summary';
import type {CaseReport,EvalKind,EvidenceClass,GoldSet,Summary,SummaryContext} from './types';

export type ReductionFixture=
 |{kind:'official_reconciliation'|'dual_source';set:GoldSet}
 |{kind:'replay_consistency';file:ReplayFile}
 |{kind:'reference_regression';samples:ReferenceSampleFile};
export interface Reduction{summary:Summary;problems:string[]}
export interface ReduceOptions{
 /** dual_source only: the pair registration's class (same_feed → adapter_check); other kinds derive it from the kind. */
 evidenceClass?:EvidenceClass;
 /** store.ts::caseRowsTruncated of the report (a pure function of its cases). */
 reconciliationsTruncated?:boolean;
}

interface Member{id:string;required:boolean;retracted:boolean}
const isSkip=(c:CaseReport,reason:string)=>c.outcome.result==='skipped'&&c.outcome.reason===reason;

export function reduceForKind(kind:EvalKind,cases:CaseReport[],fixture:ReductionFixture,opts:ReduceOptions={}):Reduction{
 if(fixture.kind!==kind)throw new Error(`reduceForKind: ${kind} with a ${fixture.kind} fixture`);
 let members:Member[];let ctx:Omit<SummaryContext,'subset'>;let excluded=new Set<string>();
 if('set' in fixture){
  members=fixture.set.cases.map(c=>({id:c.case_id,required:c.required,retracted:c.retracted!==null}));
  ctx={thresholds:fixture.set.thresholds,gold:goldBlockOf(fixture.set),evidenceClass:fixture.kind==='dual_source'?(opts.evidenceClass??'truth'):'truth'};
 }else if('file' in fixture){
  members=recordedCases(fixture.file).map(c=>({id:c.case_id,required:true,retracted:false}));
  ctx={thresholds:REPLAY_THRESHOLDS,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},evidenceClass:'truth'};
 }else{
  excluded=new Set(fixture.samples.samples.filter(s=>s.canary).map(s=>s.sample_id));
  members=fixture.samples.samples.filter(s=>!s.canary).map(s=>({id:s.sample_id,required:true,retracted:false}));
  ctx={thresholds:REFERENCE_THRESHOLDS,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},evidenceClass:'comparison'};
 }
 const problems:string[]=[];
 const byId=new Map<string,CaseReport>();
 for(const c of cases){
  if(excluded.has(c.case_id))continue;
  if(byId.has(c.case_id))problems.push(`duplicate case ${c.case_id}`);
  byId.set(c.case_id,c);
 }
 const known=new Set(members.map(m=>m.id));
 for(const id of byId.keys())if(!known.has(id))problems.push(`extra case ${id}`);
 const reduced:CaseReport[]=[];
 for(const m of members){
  const c=byId.get(m.id);
  if(!c){problems.push(`missing case ${m.id}`);reduced.push({case_id:m.id,required:m.required,outcome:m.retracted?{result:'skipped',reason:'retracted'}:{result:'missing'},left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail:{}});continue;}
  if(c.required!==m.required)problems.push(`case ${m.id}: required=${c.required} but the fixture says ${m.required}`);
  if(m.retracted!==isSkip(c,'retracted'))problems.push(m.retracted?`case ${m.id} is retracted but not skipped(retracted)`:`case ${m.id} is skipped(retracted) but not retracted in the fixture`);
  reduced.push({...c,required:m.required});
 }
 const summary=summarize(reduced,{...ctx,subset:reduced.some(c=>isSkip(c,'subset')),reconciliationsTruncated:opts.reconciliationsTruncated??false});
 return {summary,problems};
}
