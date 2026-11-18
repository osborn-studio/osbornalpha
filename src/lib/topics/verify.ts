import type {TableClient} from '@/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch} from '@/lib/dq/batches';
import {DATASETS} from '@/lib/dq/datasets';
import {quarantine} from '@/lib/dq/quarantine';
import {sha256Hex} from '@/lib/evidence/hash';
import type {Resolver} from '@/lib/evidence/resolve';
import {TopicError} from './errors';
import type {TopicsDb} from './types';

export interface VerifyResult{
 version_no:number;matched:number;skipped:number;
 mismatched:{ordinal:number;reason:'digest_changed'|'state_changed'|'snapshot_hash'}[];
}
export const SYSTEM_ACTOR='00000000-0000-0000-0000-000000000000';
type Deps={db:TopicsDb;resolver:Resolver;tables:TableClient;now():Date;codeVersion?:string|null};

async function quarantineMismatches(d:Deps,versionId:string,result:VerifyResult,actor:string){
 const dataset=DATASETS.topics.replay;
 const {batchId}=await startBatch(d.tables,{dataset,producer:'topic-verify',codeVersion:d.codeVersion??undefined,triggeredBy:actor===SYSTEM_ACTOR?'cron':'manual'});
 const counts={...emptyCounts(),fetched:result.mismatched.length};
 try{
  for(const {ordinal,reason} of result.mismatched){
   await quarantine(d.tables,{batchId,dataset,table:'topic_versions',naturalKey:versionId+':'+ordinal,reasonCode:'replay_mismatch',detail:{reason}});
   counts.quarantined++;
  }
 }finally{
  counts.failed=counts.fetched-counts.quarantined;
  await finishBatch(d.tables,batchId,{counts,errors:counts.failed?[{code:'quarantine_failed'}]:[]},d.now());
 }
}
export async function verifyVersion(d:Deps,i:{topicId:string;versionNo:number;actor:string}):Promise<VerifyResult>{
 const version=(await d.db.versionsOfTopic(i.topicId)).find(v=>v.version_no===i.versionNo);
 if(!version)throw new TopicError('not_found');
 const result:VerifyResult={version_no:i.versionNo,matched:0,skipped:0,mismatched:[]};
 if(sha256Hex(version.snapshot_text)!==version.snapshot_hash)result.mismatched.push({ordinal:0,reason:'snapshot_hash'});
 const restricted=new Set((await d.db.driftOf(version.version_id)).filter(r=>r.drift==='retracted'||r.drift==='now_withheld').map(r=>r.ordinal));
 const evidence=version.snapshot.evidence.filter(e=>e.resolved.state==='ok'&&!restricted.has(e.ordinal));
 result.skipped=version.snapshot.evidence.length-evidence.length;
 const {resolved}=await d.resolver.resolve(evidence.map(e=>e.ref),{audience:'public',locale:'zh',now:d.now()});
 evidence.forEach((e,index)=>{
  const answer=resolved[index];
  if(answer.state!==e.resolved.state)result.mismatched.push({ordinal:e.ordinal,reason:'state_changed'});
  else if(answer.digest!==e.resolved.digest)result.mismatched.push({ordinal:e.ordinal,reason:'digest_changed'});
  else result.matched++;
 });
 try{
  if(result.mismatched.length)await quarantineMismatches(d,version.version_id,result,i.actor);
 }finally{
  await d.db.recordEvent({topicId:i.topicId,actor:i.actor,action:'replay_verify',detail:{...result}});
 }
 return result;
}
