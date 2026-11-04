// Freshness registry (spec §5.1 dq_freshness). Status is a pure function of cadence window
// and grace; writers store it, readers recompute it with `now` (freshnessOf) because a
// producer that stops running never calls recordAttempt again. Unknown cadence or an
// unparseable timestamp fails closed (error / stale), never fresh.
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';

export type Cadence='daily'|'monthly'|'quarterly'|'event';
export type FreshnessStatus='fresh'|'stale'|'error'|'missing';
const DAY=86_400_000;
const WINDOW_MS:Record<Cadence,number|null>={daily:1*DAY,monthly:31*DAY,quarterly:92*DAY,event:null};
// Daily grace of 2d lets a weekday-only feed survive a weekend (Fri ok -> Mon is 3d <= 1d+2d).
const GRACE_MS:Record<Cadence,number>={daily:2*DAY,monthly:3*DAY,quarterly:3*DAY,event:0};
const CADENCES:readonly Cadence[]=['daily','monthly','quarterly','event'];

export function computeFreshness(input:{cadence:Cadence;lastOkAt:Date|null;consecutiveErrors:number;now:Date}):FreshnessStatus{
 if(input.consecutiveErrors>=2)return 'error';
 if(!input.lastOkAt)return 'missing';
 const window=WINDOW_MS[input.cadence];
 if(window===null)return 'fresh';
 const age=input.now.getTime()-input.lastOkAt.getTime();
 return age<=window+GRACE_MS[input.cadence]?'fresh':'stale'; // NaN age -> stale
}

/**
 * Records one producer attempt as a read-then-upsert. Assumes a single producer per dataset:
 * concurrent attempts for the same dataset can lose a consecutive_errors increment.
 */
export async function recordAttempt(client:TableClient,dataset:string,input:{ok:boolean;cadence:Cadence;now?:Date;detail?:Record<string,unknown>}):Promise<FreshnessStatus>{
 if(typeof dataset!=='string'||dataset.length<1||dataset.length>64)throw new Error('invalid_dataset');
 if(!CADENCES.includes(input.cadence))throw new Error('invalid_cadence');
 const now=input.now??new Date();
 const existing=(await client.select('dq_freshness',{dataset}))[0];
 const prevOk=existing?.last_ok_at?new Date(existing.last_ok_at as string):null;
 const prevErrors=Number(existing?.consecutive_errors??0);
 const consecutiveErrors=input.ok?0:prevErrors+1;
 const lastOkAt=input.ok?now:prevOk;
 const status=computeFreshness({cadence:input.cadence,lastOkAt,consecutiveErrors,now});
 await client.upsert('dq_freshness',{
  dataset,expected_cadence:input.cadence,last_ok_at:lastOkAt?lastOkAt.toISOString():null,last_attempt_at:now.toISOString(),
  consecutive_errors:consecutiveErrors,status,detail:input.detail??{},updated_at:now.toISOString(),
 },'dataset');
 return status;
}

/** All freshness rows with status recomputed at `now`; `stored_status` keeps what the writer last stored. */
export async function freshnessOf(client:TableClient,now=new Date()):Promise<(Row&{stored_status:string;status:FreshnessStatus})[]>{
 const rows=await selectAll(client,'dq_freshness',{},'dataset');
 return rows.map(r=>({...r,stored_status:String(r.status),status:CADENCES.includes(r.expected_cadence as Cadence)?computeFreshness({
  cadence:r.expected_cadence as Cadence,lastOkAt:r.last_ok_at?new Date(r.last_ok_at as string):null,
  consecutiveErrors:Number(r.consecutive_errors??0),now}):'error'}));
}
