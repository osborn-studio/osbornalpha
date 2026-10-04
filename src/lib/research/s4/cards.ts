import {registeredCandidateTransaction} from './registered';
import Ajv from 'ajv';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { digest, sha256, fail } from '../ingest/pa-v1/json.js';
import { addRecord, candidateFor, replayRequest, saveRequest } from './records';
import { assertWritableChain, serverTime, transaction, type S4Actor } from './db';

export const BASELINE_RULE_VERSION='alpha-baseline-rules/1.0';
export interface BeforeInput { requestKey:string; judgment:string; alreadySeen:string[]; independentJudgment:boolean }
const validateBefore=new Ajv({strict:true}).compile({type:'object',additionalProperties:false,
 required:['requestKey','judgment','alreadySeen','independentJudgment'],properties:{
 requestKey:{type:'string',minLength:8,maxLength:128},judgment:{type:'string',minLength:1,maxLength:4000},
 alreadySeen:{type:'array',maxItems:40,items:{type:'string',maxLength:200}},independentJudgment:{type:'boolean'}}});
export function weekPeriod(at:string) {
  const d=new Date(at);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
/** At most eight exact mentions plus one exploration and one seeded omission review. */
export function selectFanout(theses:Array<{id:string;title:string;company_ids:string[]}>,entityIds:string[],seed:string) {
  const matched=theses.filter(t=>t.company_ids.some(id=>entityIds.includes(id)));
  const unmatched=theses.filter(t=>!matched.slice(0,8).includes(t));
  const audit=unmatched.sort((a,b)=>(digest([seed,a.id])<digest([seed,b.id])?-1:1))[0];
  return { selected:[...matched.slice(0,8).map(t=>({thesis:t,reason:'entity_match'})),
    {thesis:null,reason:'exploration'},...(audit?[{thesis:audit,reason:'random_omission_review'}]:[])],
    considered:theses.length,matched:matched.length,omitted:Math.max(0,matched.length-8),seed,maximum:10 };
}
async function buildCards(db:PoolClient,actor:S4Actor,row:any) {
  const prior=(await db.query("select id,kind,payload,payload_hash,recorded_at from public.research_s4_records where user_id=$1 and candidate_id=$2 and kind='ChangeCard' order by recorded_at,id",[actor.userId,row.id])).rows;
  if(prior.length) return prior.map(r=>({...r,recorded_at:r.recorded_at.toISOString()}));
  const source=(await db.query(`select s.raw_text,v.source_ref,v.source_version,v.received_at from public.research_source_versions v
    join public.research_source_documents s on s.user_id=v.user_id and s.id=v.source_document_id
    where v.user_id=$1 and v.id=$2`,[actor.userId,row.source_version_id])).rows[0];
  if(!source || sha256(source.raw_text)!==source.source_ref.raw_sha256) fail('hash_mismatch');
  const at=await serverTime(db);
  if(source.received_at.getTime()>Date.parse(at)) fail('future_input');
  const names=(row.imported.candidate.entity_candidates as Array<{name:string}>).map(e=>e.name);
  const entities=names.length?(await db.query(`select id,name,ticker from public.research_entities where user_id=$1
    and type='COMPANY' and (name=any($2::text[]) or aliases ?| $2::text[]) order by id limit 50`,[actor.userId,names])).rows:[];
  const seed=randomUUID();
  const theses=(await db.query(`select id,title,body,company_ids,invalidation_conditions,watch_metrics,updated_at
    from public.research_theses where user_id=$1 and updated_at<=$2 and status not in ('CLOSED','INVALIDATED') order by (company_ids ?| $3::text[]) desc,md5(id::text || $4) limit 101`,[actor.userId,at,entities.map(e=>e.id),seed])).rows;
  const fanout=selectFanout(theses.slice(0,100),entities.map(e=>e.id),seed);
  const quotes:Array<Record<string,unknown>>=[];
  let offset=0;
  for(const line of (source.raw_text as string).split('\n').slice(0,8)) {
    const text=Array.from(line).slice(0,1200).join(''); const start=offset;offset+=Buffer.byteLength(line+'\n');
    if(text.trim()) quotes.push({text,source_ref:source.source_ref,span:{unit:'utf8_bytes',start,end:start+Buffer.byteLength(text)},assertion_status:'unknown',independence:'unknown'});
  }
  const cards=[];
  for(const target of fanout.selected) {
    const priorRevision=target.thesis?(await db.query("select id from public.research_s4_records where user_id=$1 and kind='ThesisRevision' and payload->>'thesis_id'=$2 and recorded_at<=$3 order by recorded_at desc,id desc limit 1",[actor.userId,target.thesis.id,at])).rows[0]:null;
    const revision=target.thesis?await addRecord(db,actor,row.id,'ThesisRevision',{
      thesis_id:target.thesis.id,body:(target.thesis as any).body,body_hash:sha256((target.thesis as any).body),
      source_updated_at:(target.thesis as any).updated_at.toISOString(),previous_revision_id:priorRevision?.id||null,
      invalidation_conditions:(target.thesis as any).invalidation_conditions,research_stream:'other',recorded_at:at }):null;
    const input={source_refs:[source.source_ref],source_version_id:row.source_version_id,
      thesis_revision_ref:revision?.id||null,wiki_reference:row.imported.wiki,wiki_available_at:row.created_at.toISOString(),
      input_cutoff_at:at,entity_mapping:entities,entity_mapping_status:'name_match_unverified',
      retrieval_version:BASELINE_RULE_VERSION,fanout:{...fanout,selected:fanout.selected.map(s=>({thesis_id:s.thesis?.id||null,reason:s.reason})),scope_truncated:theses.length>100},
      request_blob_ref:{source_version_id:row.source_version_id,thesis_revision_ref:revision?.id||null},
      rights_policy_ref:row.imported.rights.policy_id};
    const snapshot=await addRecord(db,actor,row.id,'InputSnapshot',{...input,request_hash:digest(input)});
    const run=await addRecord(db,actor,row.id,'JudgmentRun',{snapshot_id:snapshot.id,request_key:digest([actor.userId,snapshot.id,BASELINE_RULE_VERSION]),
      backend:'deterministic_rules',requested_model:null,actual_model:null,adapter_version:BASELINE_RULE_VERSION,
      started_at:at,finished_at:await serverTime(db),attempts:1,status:'completed',usage:{tokens:0,cost_minor:0,currency:'USD'},external_processing:'disabled'});
    const judgment=await addRecord(db,actor,row.id,'Judgment',{run_id:run.id,question:'资料是否明确关联既有研究范围？',
      primitive:'entity_mention',options_version:'1.0',selection:target.reason,distribution:null,vendor_confidence:null,
      calibration:null,status:target.reason==='entity_match'?'rule_match':'insufficient',source_refs:[source.source_ref]});
    const payload={schema_version:'alpha-change-card/1.0',title:target.thesis?.title||'探索候选 · 尚未形成公司判断',
      snapshot_ref:snapshot.id,judgment_ref:judgment.id,thesis_revision_ref:revision?.id||null,thesis_id:target.thesis?.id||null,
      facts:quotes,inferences:[],profit_transmission:'待验证：原文不足以建立盈利传导。',new_advantage:'待验证',
      valuation_expectations:'缺少价格与共识数据，不能判断是否被低估。',support:quotes.map(q=>q.text),counterevidence:[],
      related_companies:entities,related_securities:entities.filter(e=>e.ticker).map(e=>e.ticker),
      original_event_count:null,original_event_status:'unknown',source_document_count:1,
      next_ten_minutes:'核对原文与引用，确认公司/证券及独立原始事件；记录支持与反证。',catalyst:'待核实',invalidation:'找不到独立证据或原文不支持时停止采纳。',
      provenance_edges:quotes.map(q=>({relation:'quotes',source_ref:q.source_ref,span:q.span})),
      recall_reason:target.reason,method:BASELINE_RULE_VERSION,jev:{mode:'disabled',rel_refs:[],wiki_refs:row.imported.candidate.wiki_revision_refs},
      generated_at:at,synthetic:row.imported.synthetic};
    cards.push(await addRecord(db,actor,row.id,'ChangeCard',payload));
  }
  return cards;
}
export async function revealCards(actor:S4Actor,candidateId:string,input:BeforeInput) {return revealCardsWithPolicy(actor,candidateId,input,false);}
/** Candidate entrypoint; no production route activation. */
export async function revealRegisteredCards(actor:S4Actor,candidateId:string,input:BeforeInput) {return revealCardsWithPolicy(actor,candidateId,input,true);}
async function revealCardsWithPolicy(actor:S4Actor,candidateId:string,input:BeforeInput,registered:boolean) {
  if(!validateBefore(input)||!input.judgment.trim()) fail('invalid_schema');
  const work=async (db:PoolClient)=>{
    await assertWritableChain(db,actor);
    const {row}=await candidateFor(db,actor,candidateId);
    const request={action:'reveal',candidateId,...input,actor_kind:actor.kind};
    const replay=await replayRequest(db,actor,input.requestKey,request);if(replay)return replay;
    const at=await serverTime(db),period=weekPeriod(at);
    const sourceSubject=digest([row.imported.sourceRef.owner_system,row.imported.sourceRef.owner_scope,row.imported.sourceRef.source_id]);
    const subjects=[sourceSubject,...row.imported.candidate.wiki_revision_refs];
    const exposures=(await db.query(`select id,payload from public.research_s4_records where user_id=$1 and kind='ExposureEvent'
      and payload->>'evaluation_period_id'=$2 and payload->'subject_refs' ?| $3::text[]`,[actor.userId,period,subjects])).rows;
    const reasons=[...row.imported.contaminationReasons,...(actor.kind==='agent'?['agent_operated']:[]),
      ...(exposures.some(e=>e.payload.shadow_exposed)?['shadow_exposed']:[]),
      ...(exposures.length?['prior_related_exposure']:[]),...(!input.independentJudgment?['no_independent_prior_judgment']:[])];
    const label=await addRecord(db,actor,row.id,'HumanLabel',{phase:'before_display',actor_kind:actor.kind,
      judgment:input.judgment,already_seen:input.alreadySeen,claimed_independent:input.independentJudgment,
      independent:false,research_stream:'descriptive',contamination_reasons:reasons,evaluation_period_id:period,
      related_exposure_refs:exposures.map(e=>e.id),rubric_version:'alpha-review/1.0',recorded_at:at});
    const cards=await buildCards(db,actor,row);
    const exposure=await addRecord(db,actor,row.id,'ExposureEvent',{actor_ref:actor.userId,actor_kind:actor.kind,
      evaluation_period_id:period,subject_refs:subjects,exposed_artifact_ids:cards.map(c=>c.id),
      wiki_revision_refs:row.imported.candidate.wiki_revision_refs,baseline_label_ref:label.id,
      displayed_at:await serverTime(db),origin:'alpha_review',shadow_exposed:false,upstream_history:'unknown'});
    const occurrenceCount=Number((await db.query('select count(*) n from public.research_source_occurrences where user_id=$1 and source_version_id=$2',[actor.userId,row.source_version_id])).rows[0].n);
    const response={candidateId:row.id,revision:row.revision,cards:cards.map(c=>({...c,occurrence_count:occurrenceCount})),
      labelId:label.id,exposureId:exposure.id,researchStream:'descriptive',contaminationReasons:reasons};
    await saveRequest(db,actor,input.requestKey,request,response);return response;
  };
  return registered?registeredCandidateTransaction(actor,candidateId,work):transaction(actor,work);
}
