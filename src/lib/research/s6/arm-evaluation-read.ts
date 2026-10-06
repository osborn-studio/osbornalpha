import type {PoolClient} from 'pg';
import type {S4Actor} from '../s4/db';
import {isUuid} from '../s4/ledger';
import {fail} from '../ingest/pa-v1/json.js';
import {verifyArmEvaluationBatch} from './arm-evaluations';
/** Internal integrity read in a caller-owned owner-locked transaction.
 * Inputs must come from the authorized observation; this does not grant disclosure.
 * No casts or revision filters may discard malformed/newer rows before validation. */
export async function loadArmEvaluationHistory(db:PoolClient,actor:S4Actor,candidateId:string,observationId:string,observationHash:string){
 if(!isUuid(actor.userId)||!isUuid(candidateId)||!isUuid(observationId)||!/^[0-9a-f]{64}$/.test(observationHash))fail('invalid_schema');
 const rows=(await db.query(`select * from public.research_s6_evaluations
 where user_id=$1 and observation_id=$2 order by id limit 101`,[actor.userId,observationId])).rows;
 if(rows.length>100)fail('input_limit');
 // Match either linkage so a control with a corrupt observation_ref is not hidden.
 // Do not filter candidate_id: a wrongly bound candidate must fail validation.
 const controls=(await db.query(`select user_id,candidate_id,kind,payload,payload_hash
 from public.research_s4_records where user_id=$1 and kind='ControlEvent'
 and payload->>'type'='evaluation.append'
 and (payload->>'observation_ref'=$2 or payload->>'evaluation_ref'=any($3::text[]))
 order by id limit 101`,[actor.userId,observationId,rows.map(r=>r.id)])).rows;
 return verifyArmEvaluationBatch(actor.userId,candidateId,observationId,observationHash,rows,controls).highestInBatch;
}
