import { fail, digest, sha256 } from '../ingest/pa-v1/json.js';
import { transaction, serverTime, type S4Actor } from './db';
import { addRecord, candidateFor } from './records';
import { weekPeriod } from './cards';

export async function listCandidates(actor:S4Actor) {
  return transaction(actor,async db=>{
    const rows=(await db.query('select id,payload_hash,revision,status,created_at,last_observation_id from public.research_s4_candidates where user_id=$1 order by created_at desc limit 100',[actor.userId])).rows;
    const visible=[];
    for(const row of rows) {
      try{await candidateFor(db,actor,row.id);visible.push(row);}
      catch(e){if(!['scope_denied','policy_blocked'].includes((e as {code?:string}).code||''))throw e;}
    }
    return visible;
  });
}
export async function reviewHistory(actor:S4Actor,id:string) {
  return transaction(actor,async db=>{
    const {row}=await candidateFor(db,actor,id);
    const records=(await db.query(`select r.id,r.kind,r.payload,r.payload_hash,r.recorded_at,s.status,s.anchor_status from public.research_s4_records r
      left join public.research_s4_observation_state s on s.user_id=r.user_id and s.observation_id=r.id
      where r.user_id=$1 and r.candidate_id=$2 and kind in ('Decision','Observation','Review','AnchorReceipt') order by r.recorded_at,r.id`,[actor.userId,id])).rows;
    const at=await serverTime(db);
    if(records.length) await addRecord(db,actor,id,'ExposureEvent',{actor_ref:actor.userId,actor_kind:actor.kind,evaluation_period_id:weekPeriod(at),
      subject_refs:[digest([row.imported.sourceRef.owner_system,row.imported.sourceRef.owner_scope,row.imported.sourceRef.source_id])],
      exposed_artifact_ids:records.map(r=>r.id),displayed_at:at,origin:'alpha_history',shadow_exposed:records.some(r=>r.payload.observation_kind==='shadow')});
    return {candidateId:id,revision:row.revision,records};
  });
}
export async function researchOptions(actor:S4Actor) {
  return transaction(actor,async db=>({
    securities:(await db.query("select ticker,name,exchange,currency,metadata->'synthetic' as synthetic from public.stocks_universe where exchange in ('XNYS','NYSE') and currency='USD' and is_active=true order by ticker limit 1000")).rows,
    companies:(await db.query("select id,name from public.research_entities where user_id=$1 and type='COMPANY' order by name limit 1000",[actor.userId])).rows,
  }));
}
export async function candidateStatus(actor:S4Actor,id:string) {
  return transaction(actor,async db=>{
    const {row}=await candidateFor(db,actor,id);
    const observations=(await db.query(`select s.observation_id,s.status,s.anchor_status from public.research_s4_observation_state s
      join public.research_s4_records r on r.user_id=s.user_id and r.id=s.observation_id where r.user_id=$1 and r.candidate_id=$2`,[actor.userId,id])).rows;
    return {revision:row.revision,observations};
  });
}
export async function citation(actor:S4Actor,id:string,cardId:string,index:number) {
  if(!Number.isInteger(index)||index<0||index>7||!/^[0-9a-f-]{36}$/.test(cardId))fail('invalid_schema');
  return transaction(actor,async db=>{
    await candidateFor(db,actor,id);
    const card=(await db.query("select payload from public.research_s4_records where user_id=$1 and candidate_id=$2 and id=$3 and kind='ChangeCard'",[actor.userId,id,cardId])).rows[0];
    const exposed=(await db.query("select id from public.research_s4_records where user_id=$1 and candidate_id=$2 and kind='ExposureEvent' and payload->'exposed_artifact_ids' ? $3 limit 1",[actor.userId,id,cardId])).rows[0];
    if(!card||!exposed)fail('exposure_required');
    const fact=card.payload.facts[index];if(!fact)fail('invalid_schema');
    const source=(await db.query(`select s.raw_text from public.research_source_versions v join public.research_source_documents s on s.user_id=v.user_id and s.id=v.source_document_id
      where v.user_id=$1 and v.source_key=$2`,[actor.userId,digest(fact.source_ref)])).rows[0];
    if(!source||sha256(source.raw_text)!==fact.source_ref.raw_sha256)fail('hash_mismatch');
    const bytes=Buffer.from(source.raw_text);
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(fact.span.start,fact.span.end));
    if(text!==fact.text)fail('hash_mismatch');
    const at=await serverTime(db);
    await addRecord(db,actor,id,'ExposureEvent',{actor_ref:actor.userId,actor_kind:actor.kind,evaluation_period_id:weekPeriod(at),
      subject_refs:[digest([fact.source_ref.owner_system,fact.source_ref.owner_scope,fact.source_ref.source_id])],
      exposed_artifact_ids:[cardId],displayed_at:at,origin:'alpha_citation',shadow_exposed:false});
    return {text,source_ref:fact.source_ref,span:fact.span};
  });
}
