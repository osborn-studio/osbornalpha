// An offline dataset contract preflight, separate from schema validity and evaluation gates.
// Call only with a parsed GoldSet. No network, database, licence inference or flag mutation.
import {checkLock} from './load';
import {goldBlockOf} from '../summary';
import type {GoldLock,GoldSet,ValidatorFinding} from '../types';

export function assessGoldAdmission(set:GoldSet,lock:GoldLock){
 const findings:ValidatorFinding[]=[];
 const add=(code:string,where:string,message:string)=>findings.push({code,where,message});
 try{checkLock(set,lock);}catch{add('gold_lock_mismatch',set.path,'Dataset bytes, version and format must match lock.json.');}
 if(set.format!=='f6')add('legacy_format',set.path,'Migrate human transcription and provenance to the F6 contract.');
 if(!set.ready)add('not_ready',set.path,'The dataset declares ready=false.');
 if(set.artifact_class!=='public')add('restricted_license_pending',set.path,'D8 restricted gold licence decision remains pending.');
 const live=set.cases.filter(c=>c.retracted===null);
 if(live.length===0)add('empty_population',set.path,'At least one non-retracted case is required.');
 for(const c of live){
  const where=`${set.path}#${c.case_id}`;
  if(c.provenance_kind!=='transcribed')add('synthetic_case',where,'Synthetic cases test machinery and cannot supply gold evidence.');
  if(c.pending)add('pending_case',where,'Human transcription or recorder evidence is pending.');
  if(c.provenance_gaps.length)add('provenance_gaps',where,`Missing evidence: ${c.provenance_gaps.join(', ')}`);
 }
 // Counts describe the same active population as findings; they do not authenticate evidence.
 // Count cases per gap (not occurrences), with stable keys for review/report consumers.
 const gaps=new Map<string,number>();
 for(const c of live)for(const gap of new Set(c.provenance_gaps))gaps.set(gap,(gaps.get(gap)??0)+1);
 const prerequisites={pending_cases:live.filter(c=>c.pending).length,
  synthetic_cases:live.filter(c=>c.provenance_kind!=='transcribed').length,
  provenance_gap_cases:live.filter(c=>c.provenance_gaps.length>0).length,
  provenance_gaps:Object.fromEntries([...gaps].sort(([a],[b])=>a<b?-1:a>b?1:0))};
 return {ok:findings.length===0,prerequisites,scope:'dataset_contract_only' as const,
  set:{path:set.path,set_id:set.set_id,version:set.version,sha256:set.sha256,format:set.format},
  gold:goldBlockOf(set),population:live.length,
  cases:live.map(c=>({case_id:c.case_id,pending:c.pending,provenance_kind:c.provenance_kind,provenance_gaps:[...c.provenance_gaps]})),findings,
  not_verified:['source_bytes_and_transcription_accuracy','recorder_identity_and_independent_pr_approval','license_and_retention_approval','release_manifest_and_production_readiness']};
}
