import {transaction,type S4Actor} from './db';
import {validateRegisteredStoredCandidate} from './registered';
import {withRegisteredCandidatesInTransaction} from '../revocation/access';
import {resolveStoredReference} from '../revocation/registered-access';
import {fail} from '../ingest/pa-v1/json.js';
export interface CandidatePageCursor {createdAt:string;id:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Candidate-only fail-closed page: no denied-row omission, no count/health claim.
 * A full page's next cursor may lead to an empty page. Microseconds preserve SQL order.
 * Returned created_at is display-only; only nextCursor is a pagination token. */
export async function listRegisteredCandidates(actor:S4Actor,limit=20,after?:CandidatePageCursor){
 if(!Number.isInteger(limit)||limit<1||limit>100)fail('invalid_schema');
 if(after!==undefined&&(after===null||typeof after!=='object'||Object.getPrototypeOf(after)!==Object.prototype||Object.keys(after).sort().join(',')!=='createdAt,id'||typeof after.id!=='string'||!uuid.test(after.id)||typeof after.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(after.createdAt)
  ||!Number.isFinite(Date.parse(after.createdAt))||new Date(after.createdAt).toISOString()!==after.createdAt.replace(/(\.\d{3})\d{3}Z$/,'$1Z')))fail('invalid_schema');
 return transaction(actor,async db=>{
  const rows=(await db.query(`select id,payload_hash,revision,status,created_at,last_observation_id,
   to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time
   from public.research_s4_candidates where user_id=$1
   and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid))
   order by created_at desc,id desc limit $4`,[actor.userId,after?.createdAt??null,after?.id??null,limit])).rows;
  if(rows.length===0)return {candidates:[],nextCursor:null};
  return withRegisteredCandidatesInTransaction(db,actor.userId,async client=>Promise.all(rows.map(async row=>({payloadHash:row.payload_hash,expected:await resolveStoredReference(client,actor.userId,row.payload_hash)}))),async(client,items)=>{
   const candidates=[];
   for(const selected of rows){
    const item=items.find(i=>i.payloadHash===selected.payload_hash);if(!item)fail('scope_denied');
    const row=await validateRegisteredStoredCandidate(client,actor,selected.id,selected.payload_hash,item!.expected);
    candidates.push({id:row.id,payload_hash:row.payload_hash,revision:row.revision,status:row.status,created_at:row.created_at,last_observation_id:row.last_observation_id});
   }
   const last=rows.at(-1)!;
   return {candidates,nextCursor:rows.length===limit?{createdAt:last.cursor_time as string,id:last.id as string}:null};
  });
 });
}
