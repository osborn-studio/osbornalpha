// src/lib/judgments/pg-judgments-db.ts
// TEST-ONLY JudgmentsDb over node-postgres calling the same SQL functions supabaseJudgmentsDb calls
// through PostgREST, so the shared contract and the concurrency tests exercise the real schema.
// Every call runs in its own transaction under the role the production client uses: the public
// reads `set local role anon` (RLS and grants apply exactly as through the anon key); every other
// method `set local role service_role` (proving its grants: select on the nine tables, execute on
// the write RPCs, nothing else). Rows come back as to_jsonb(...) so the db.ts normalisers see the
// JSON shapes PostgREST returns; set-returning functions are read `with ordinality` to keep their
// order. Nothing in src/app imports this.
import type {Pool} from 'pg';
import {byQueueOrder,calibrationFromTable,calibrationIsValid,envelopeFromRpc,eventFromTable,isoTs,judgmentFromTable,methodologyFromTable,queueFromTable,settlementArgs,settlementFromTable,subjectStatus,toJudgmentError,assertLimit,QUEUE_LIST_MAX} from './db';
import {JudgmentError} from './errors';
import type {AppendStatus,JudgmentsDb} from './types';

type Row=Record<string,unknown>;
const QUEUE_WHERE:Record<string,string>={
 due:`q.closed_at is null and q.next_attempt_at <= now() and (q.leased_until is null or q.leased_until < now())`,
 backoff:`q.closed_at is null and q.next_attempt_at > now() and (q.leased_until is null or q.leased_until < now())`,
 leased:`q.closed_at is null and q.leased_until >= now()`,
 all:'true',
};

export function pgJudgmentsDb(pool:Pool):JudgmentsDb{
 // 40P01 is retried (3 attempts, whole transaction): judgments.integration.test.ts replays the migration (DDL locks) while this
 // file's tests run in parallel under test:db; a deadlock victim there is a harness artefact, not an F4 function defect.
 const run=async(role:'anon'|'service_role',text:string,values:unknown[]=[]):Promise<unknown[]>=>{
  for(let attempt=1;;attempt++){
   const c=await pool.connect();
   try{
    await c.query('begin');await c.query(`set local role ${role}`);
    const r=await c.query(text,values);
    await c.query('commit');
    return r.rows.map(x=>(x as {v:unknown}).v);
   }catch(e){
    await c.query('rollback').catch(()=>{});
    if((e as {code?:string}).code==='40P01'&&attempt<3)continue;
    throw toJudgmentError(e);
   }finally{c.release();}
  }
 };
 const pub=(t:string,v:unknown[]=[])=>run('anon',t,v);
 const svc=(t:string,v:unknown[]=[])=>run('service_role',t,v);
 const first=async(p:Promise<unknown[]>)=>(await p)[0];
 const j=(v:unknown)=>v===null||v===undefined?null:JSON.stringify(v);
 const serverTime=async()=>isoTs(await first(pub(`select to_jsonb(public.judgments_server_time()) v`)));
 const srf=(fn:string,args:string)=>`select to_jsonb(e) - 'ordinality' v from public.${fn}(${args}) with ordinality e order by e.ordinality`;
 return {
  serverTime,
  async methodology(id,version){const r=await first(svc(`select to_jsonb(t) v from public.judgment_methodologies t where t.methodology_id=$1 and t.version=$2`,[id,version]));return r?methodologyFromTable(r as Row):null;},
  subjectExists:subject=>subjectStatus(subject,{
   async issuerStatus(id){const r=await first(svc(`select to_jsonb(i.status) v from public.issuers i where i.issuer_id=$1::uuid`,[id]));return r===undefined?null:String(r);},
   async industryExists(scheme,version,code){return (await svc(`select to_jsonb(true) v from public.industry_classifications t where t.scheme=$1 and t.version=$2 and t.code=$3`,[scheme,version,code])).length>0;},
  }),
  async getJudgment(id){const r=await first(svc(`select to_jsonb(t) v from public.judgments t where t.judgment_id=$1::uuid`,[id]));return r?judgmentFromTable(r as Row):null;},
  async judgmentsBySnapshot(snapshotId){return (await svc(`select to_jsonb(t.judgment_id) v from public.judgments t where t.inputs @> $1::jsonb order by t.judgment_id`,[JSON.stringify([{kind:'macro_snapshot',ref:{snapshot_id:snapshotId}}])])).map(String);},
  async registerJudgment(row,queue){
   const r=await first(svc(`select public.register_judgment($1::jsonb,$2::jsonb) v`,[JSON.stringify(row),j(queue)])) as {registered_at:string;retrospective:boolean};
   return {registered_at:isoTs(r.registered_at),retrospective:r.retrospective===true};
  },
  async latestCards(subject,o){return (await pub(srf('latest_judgment_cards','$1,$2,$3::text[],$4,$5::timestamptz'),[subject.type,subject.key,o.types??null,o.view,o.cutoff??null])).map(x=>envelopeFromRpc(x as Row));},
  async historyOf(subject,type,m,o){return (await pub(srf('judgment_history','$1,$2,$3,$4,$5,$6,$7::timestamptz,$8::uuid,$9'),[subject.type,subject.key,type,m.id,m.version,o.view,o.cutoff??null,o.before??null,o.limit])).map(x=>envelopeFromRpc(x as Row));},
  async claimDue(limit,leaseSeconds){return (await svc(`select to_jsonb(q) v from public.claim_due_judgments($1,$2) q`,[limit,leaseSeconds])).map(x=>queueFromTable(x as Row)).sort(byQueueOrder);},
  async releaseLease(judgmentId,leaseToken,patch){await svc(`select public.release_lease($1::uuid,$2::uuid,$3::jsonb) v`,[judgmentId,leaseToken,JSON.stringify(patch)]);},
  async queueRow(id){const r=await first(svc(`select to_jsonb(q) v from public.judgment_settle_queue q where q.judgment_id=$1::uuid`,[id]));return r?queueFromTable(r as Row):null;},
  async queueList(o){
   const where=QUEUE_WHERE[o.filter];
   if(where===undefined)throw new JudgmentError('invalid_parameter',`filter:${String(o.filter)}`);
   assertLimit(o.limit,QUEUE_LIST_MAX);
   return (await svc(`select to_jsonb(q) v from public.judgment_settle_queue q where ${where} and ($1::uuid is null or q.judgment_id > $1::uuid) order by q.judgment_id limit $2`,[o.after??null,o.limit])).map(x=>queueFromTable(x as Row));
  },
  async settlementsOf(ids){return (await svc(`select to_jsonb(s) v from public.judgment_settlements s where s.judgment_id = any($1::uuid[]) order by s.judgment_id, s.seq`,[[...new Set(ids)]])).map(x=>settlementFromTable(x as Row));},
  async appendSettlement(judgmentId,leaseToken,requestKey,row){
   const r=await first(svc(`select public.append_settlement($1::uuid,$2::uuid,$3,$4::jsonb) v`,[judgmentId,leaseToken,requestKey,JSON.stringify(settlementArgs(judgmentId,row))])) as {seq:number;status:AppendStatus};
   return {seq:Number(r.seq),status:r.status};
  },
  async quarantineSettlement(judgmentId,leaseToken,reasonCode,payload,patch,batchId){
   const r=await first(svc(`select public.quarantine_settlement($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6::uuid) v`,[judgmentId,leaseToken,reasonCode,JSON.stringify(payload),JSON.stringify(patch),batchId])) as {status:'quarantined'|'lease_lost';quarantine_id:string|null};
   return {status:r.status,quarantine_id:r.quarantine_id??null};
  },
  async applyQuarantineOverride(judgmentId,override,quarantineId,audit){return await first(svc(`select public.apply_quarantine_override($1::uuid,$2::jsonb,$3::uuid,$4::jsonb) v`,[judgmentId,JSON.stringify(override),quarantineId,JSON.stringify(audit)])) as 'applied'|'stale'|'closed'|'item_not_open';},
  async rejectQuarantinedSettlement(judgmentId,quarantineId,expected,requestKey,row,audit){
   const r=await first(svc(`select public.reject_quarantined_settlement($1::uuid,$2::uuid,$3::jsonb,$4,$5::jsonb,$6::jsonb) v`,[judgmentId,quarantineId,JSON.stringify(expected),requestKey,JSON.stringify(settlementArgs(judgmentId,row)),JSON.stringify(audit)])) as {seq:number;status:AppendStatus|'stale'|'item_not_open'};
   return {seq:Number(r.seq),status:r.status};
  },
  async envelopeById(id,o){const [x]=await pub(srf('judgment_envelope_by_id','$1::uuid,$2,$3::timestamptz'),[id,o.view,o.cutoff??null]);return x?envelopeFromRpc(x as Row):null;},
  async freezeCalibrationCohort(generation,m,v,w){
   const r=await first(svc(`select public.freeze_calibration_cohort($1::uuid,$2,$3,$4::date,$5::date) v`,[generation,m,v,w.from,w.to])) as {status:'frozen'|'already_frozen';frozen_at:string;n:number};
   return {status:r.status,frozen_at:isoTs(r.frozen_at),n:Number(r.n)};
  },
  async cohortMembers(generation,after,limit){return (await svc(srf('calibration_cohort_members','$1::uuid,$2::uuid,$3'),[generation,after,limit])).map(x=>envelopeFromRpc(x as Row));},
  async clearCalibrationGeneration(generation){return Number(await first(svc(`select public.clear_calibration_generation($1::uuid) v`,[generation])));},
  async calibrationCohort(m,v,w,cutoff,after,limit){return (await pub(srf('calibration_cohort','$1,$2,$3::date,$4::date,$5::timestamptz,$6::uuid,$7'),[m,v,w.from,w.to,cutoff,after,limit])).map(x=>envelopeFromRpc(x as Row));},
  async calibrationCohortInternal(m,v,w,cutoff,after,limit){return (await svc(srf('calibration_cohort_internal','$1,$2,$3::date,$4::date,$5::timestamptz,$6::uuid,$7'),[m,v,w.from,w.to,cutoff,after,limit])).map(x=>envelopeFromRpc(x as Row));},
  async latestCalibration(m,v,scope){
   const r=await first(pub(`select to_jsonb(c) v from public.judgment_calibrations c where c.methodology_id=$1 and c.methodology_version=$2 and c.scope_type=$3 and c.scope_key=$4 order by c.computed_at desc, c.calibration_id limit 1`,[m,v,scope.scope_type,scope.scope_key]));
   if(!r)return null;
   const row=calibrationFromTable(r as Row);
   const rev=await first(pub(`select to_jsonb(x.revision) v from public.judgment_calibration_validity x where x.methodology_id=$1 and x.version=$2`,[m,v]));
   return {row,valid:calibrationIsValid(row,rev===undefined?null:Number(rev),await serverTime())};
  },
  async calibrationValidity(m,v){
   const rev=await first(svc(`select to_jsonb(x.revision) v from public.judgment_calibration_validity x where x.methodology_id=$1 and x.version=$2`,[m,v]));
   if(rev===undefined)throw new JudgmentError('unknown_methodology',`${m}@${v}`);
   return {revision:Number(rev)};
  },
  async insertCalibration(row,expectedRevision){return await first(svc(`select public.insert_calibration($1::jsonb,$2) v`,[JSON.stringify(row),expectedRevision])) as 'inserted'|'duplicate'|'stale_revision';},
  async syncMethodology(row,actor,reason){const r=await first(svc(`select public.sync_methodology($1::jsonb,$2,$3) v`,[JSON.stringify(row),actor,reason])) as {changed:boolean;seq:number};return {changed:r.changed===true,seq:Number(r.seq)};},
  async listMethodologies(status){return (await pub(`select to_jsonb(t) v from public.judgment_methodologies t where ($1::text is null or t.status=$1) order by t.methodology_id, t.version`,[status??null])).map(x=>methodologyFromTable(x as Row));},
  async methodologyStateAt(id,version,cutoff){
   const r=await first(pub(`select to_jsonb(e) v from public.methodology_state_at($1,$2,$3::timestamptz) e`,[id,version,cutoff])) as Row|undefined;
   return r&&r.event_id!==null&&r.event_id!==undefined?eventFromTable(r):null;
  },
  async jobState(job){const r=await first(svc(`select jsonb_build_object('state',t.state,'updated_at',t.updated_at) v from public.judgment_job_state t where t.job=$1`,[job])) as Row|undefined;return r?{state:r.state as Record<string,unknown>,updated_at:isoTs(r.updated_at)}:null;},
  async setJobState(job,expectedUpdatedAt,state){return (await first(svc(`select public.set_job_state($1,$2::timestamptz,$3::jsonb) v`,[job,expectedUpdatedAt,JSON.stringify(state)])))===true;},
  async repairStaleBatches(dataset,olderThanSeconds){return Number(await first(svc(`select public.repair_stale_batches($1,$2::interval) v`,[dataset,`${olderThanSeconds} seconds`])));},
 };
}
