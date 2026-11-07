// src/lib/broker-research/replay.ts
// Publication replay without DB writes (spec §4.8 / §5.5, constraint 2). It reads ONLY the immutable publication
// snapshot, the immutable run rows and the bucket — never live field rows, whose span / source text / detail may be
// edited after an unpublish (P-R1-10). For every evidence row of the snapshot: (0) the frozen value_source_text matches
// its frozen sha256; (1) the parse artifact named by parse_run_id still hashes to the snapshot's artifact_hash;
// (2) slicing it at (page, char_start, char_end) gives the frozen value_source_text; (3) for LLM rows, the stored
// runs/{run_id}.response.json re-validated, re-merged and re-located (B1/B3) reproduces a candidate with the same
// identity and span and the snapshot's extracted value — rows whose snapshot says framed=true are exempt from (3) —
// and the run's behavior_digest recomputes from its recorded versions.
import {behaviorDigest} from './behavior';
import {decimalEquals} from '../facts/json-numbers';
import {sliceText} from './extract/locate';
import {buildCandidateRows,mergeChunks} from './extract/merge';
import type {ChunkExtraction} from './extract/merge';
import {validateExtraction} from './extract/schema';
import {sha256Hex} from './hash';
import {artifactLoader} from './parse';
import type {F3Artifact} from './ports/f3';
import type {BrokerDeps} from './deps';
import type {CandidateFieldInput,PublicationRow,RunRow,TypedValue} from './types';

interface SnapField{field_id:string;field:string;target_key:string|null;occurrence:number;status:string;extractor:string;parse_run_id:string|null;run_id:string|null;artifact_hash:string|null;
 page:number|null;char_start:number|null;char_end:number|null;value_source_text:string|null;value_source_sha256:string|null;framed:boolean;extracted:TypedValue;value:TypedValue}
export interface ReplayMismatch{field_id:string;check:'snapshot_source'|'artifact_hash'|'span_verbatim'|'candidate_missing'|'candidate_value'|'behavior_digest'|'response_unreadable';detail?:string}
type RDeps=Pick<BrokerDeps,'db'|'storage'>;
const candidateValueMatches=(c:CandidateFieldInput,v:TypedValue)=>c.value_text===v.value_text&&
 (c.value_num===null||v.value_num===null?c.value_num===v.value_num:decimalEquals(c.value_num,v.value_num))&&
 c.value_currency===v.value_currency&&c.value_unit===v.value_unit&&c.value_date===v.value_date;

async function candidatesOf(deps:RDeps,run:RunRow,artifact:F3Artifact,extractor:string):Promise<CandidateFieldInput[]|null>{
 const bytes=run.response_path?await deps.storage.download(run.response_path):null;
 if(!bytes)return null;
 const calls=(JSON.parse(new TextDecoder().decode(bytes)) as {calls:{chunk:number;content:string|null}[]}).calls;
 const last=new Map<number,ChunkExtraction['extraction']>();
 for(const c of calls){if(c.content===null)continue;let v:unknown;try{v=JSON.parse(c.content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{continue;}const r=validateExtraction(v);if(r.ok)last.set(c.chunk,r.value);}
 const merge=mergeChunks([...last.entries()].sort(([a],[b])=>a-b).map(([chunk,extraction])=>({chunk,extraction})));
 return buildCandidateRows(merge,{pages:artifact.pages,extractor});
}
export async function replayFromSnapshot(deps:RDeps,pub:PublicationRow):Promise<{publicationId:string;ok:boolean;checked:number;mismatches:ReplayMismatch[]}>{
 const snapshot=pub.snapshot as {fields?:SnapField[]};
 const fields=snapshot.fields??[];const load=artifactLoader(deps);const mismatches:ReplayMismatch[]=[];
 const runCache=new Map<string,Promise<CandidateFieldInput[]|null>>();
 for(const f of fields){
  if(f.status==='absent'||f.parse_run_id===null||f.page===null||f.char_start===null||f.char_end===null)continue;
  if(f.value_source_text===null||f.value_source_sha256===null||sha256Hex(f.value_source_text)!==f.value_source_sha256){mismatches.push({field_id:f.field_id,check:'snapshot_source'});continue;}
  const parse=await deps.db.getRun(f.parse_run_id);
  if(!parse||parse.artifact_hash!==f.artifact_hash){mismatches.push({field_id:f.field_id,check:'artifact_hash'});continue;}
  const artifact=await load(f.parse_run_id).catch(()=>null);
  if(!artifact){mismatches.push({field_id:f.field_id,check:'artifact_hash',detail:'unreadable'});continue;}
  if(sliceText(artifact.pages,f.page,f.char_start,f.char_end)!==f.value_source_text){mismatches.push({field_id:f.field_id,check:'span_verbatim'});continue;}
  if(!f.extractor.startsWith('llm:')||!f.run_id)continue;
  const run=await deps.db.getRun(f.run_id);
  if(!run){mismatches.push({field_id:f.field_id,check:'response_unreadable'});continue;}
  const digest=behaviorDigest({extractorVersion:run.extractor_version??'unknown',modelId:run.model_id??'',registryHash:run.registry_hash??'',promptVersion:run.prompt_version??'',schemaVersion:run.schema_version??''});
  if(digest!==run.behavior_digest)mismatches.push({field_id:f.field_id,check:'behavior_digest'});
  if(f.framed)continue;   // human-framed span (snapshot provenance): the candidate never had this span
  let p=runCache.get(run.run_id);if(!p){p=candidatesOf(deps,run,artifact,f.extractor).catch(()=>null);runCache.set(run.run_id,p);}
  const cands=await p;if(!cands){mismatches.push({field_id:f.field_id,check:'response_unreadable'});continue;}
  const c=cands.find(x=>x.target_key===f.target_key&&x.field===f.field&&x.occurrence===f.occurrence&&x.char_start===f.char_start&&x.char_end===f.char_end);
  if(!c){mismatches.push({field_id:f.field_id,check:'candidate_missing'});continue;}
  if(!candidateValueMatches(c,f.extracted))mismatches.push({field_id:f.field_id,check:'candidate_value'});
 }
 return {publicationId:pub.publication_id,ok:mismatches.length===0,checked:fields.filter(f=>f.status!=='absent'&&f.char_start!==null).length,mismatches};
}
export async function replayPublication(deps:RDeps,publicationId:string){
 const pub=await deps.db.getPublication(publicationId);if(!pub)throw new Error(`publication_not_found:${publicationId}`);
 return replayFromSnapshot(deps,pub);
}
