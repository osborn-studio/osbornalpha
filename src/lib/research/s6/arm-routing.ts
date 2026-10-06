import type {PoolClient} from 'pg';
import type {S4Actor} from '../s4/db';
import {isUuid} from '../s4/ledger';
import {fail} from '../ingest/pa-v1/json.js';
import {validateArmSince,validateRegisteredArmWindow} from './arm-eligibility';
/** Internal routing read only, NOT a disclosure API or registered report.
 * Caller owns the owner-locked transaction and must validate all lineage, grants,
 * ResearchCard provenance, evaluations and final freshness before returning anything.
 * Select 101 to detect overflow; never truncate or drop unsupported ledger rows. */
export async function loadArmRoutingWindow(db:PoolClient,actor:S4Actor,since?:string){
 if(!isUuid(actor.userId))fail('invalid_schema');
 const bound=validateArmSince(since);
 const rows=(await db.query(`select id as decision_id,thesis_id,week_of::text as week_of,
 arm,action,observation_id,card_id,cited_judgment_ids,
 exists(select 1 from public.research_decisions prior where prior.user_id=d.user_id
 and prior.observation_id=d.observation_id and prior.id<>d.id) as reused_observation
 from public.research_decisions d
 where user_id=$1 and ($2::date is null or week_of >= $2::date)
 order by created_at,id limit 101`,[actor.userId,bound??null])).rows;
 const result=validateRegisteredArmWindow(rows);
 if(rows.some(r=>r.reused_observation))fail('not_configured');
 return result;
}
