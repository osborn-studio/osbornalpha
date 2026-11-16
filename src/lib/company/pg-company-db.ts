// src/lib/company/pg-company-db.ts
// TEST-ONLY CompanyDb over node-postgres (spec §4.7, §12.2): calls the same SQL functions supabaseCompanyDb
// calls through rpc, but every call runs in its own transaction under a real client role, so the
// contract exercises grants and RLS: digest / evidence / event reads as service_role, coverage reads as
// anon, per-user methods as authenticated with JWT claims and WITHOUT a user filter of their own (only
// the RLS policies keep users apart). Nothing in src/app imports this. Dates and timestamps come back as
// raw text (typeParsers), so inbox cursors keep microseconds; normalisers and cursors come from db.ts.
// pgRpcClient gives readSnapshot a Supabase-shaped rpc over a pool and a role.
import type {Pool,PoolClient} from 'pg';
import {typeParsers} from '../db/pg-table-client';
import {EVIDENCE_IDS_PER_CALL,checkEventIds,checkEventsQuery,chunkOf,coverageFromRow,coveragePageFromJson,decodeInboxCursor,decodeIssuerCursor,digestStateFromRow,dueFromJson,
 eventFromRow,evidenceFromJson,inboxPage,issuerPage,replaceResultFromJson,sortCoverage,toCompanyDbError,watchFromRow,watchPatch} from './db';
import type {PgErrorLike,RawEvent} from './db';
import type {RpcClient} from './snapshot-read';
import type {CompanyDb,CompanyDbError,EvidenceRecord} from './types';

type Role='anon'|'authenticated'|'service_role';
type Row=Record<string,unknown>;
const ROLES:readonly Role[]=['anon','authenticated','service_role'];

/** Runs body in one transaction as `role` (with JWT claims when userId is given); errors are mapped like PostgREST errors. */
async function asRole<T>(pool:Pool,role:Role,userId:string|null,body:(c:PoolClient)=>Promise<T>,fk?:CompanyDbError['code']):Promise<T>{
 if(!ROLES.includes(role))throw new Error(`invalid_role:${role}`);
 const c=await pool.connect();let broken:Error|undefined;
 try{
  await c.query('begin');
  if(userId!==null)await c.query(`select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)`,[userId,JSON.stringify({sub:userId,role})]);
  await c.query(`set local role ${role}`);
  const out=await body(c);
  await c.query('commit');
  return out;
 }catch(e){
  await c.query('rollback').catch(x=>{broken=x as Error;});
  throw toCompanyDbError(e,fk);
 }finally{c.release(broken);}
}
const q=async(c:PoolClient,text:string,values:unknown[]=[]):Promise<Row[]>=>(await c.query({text,values,types:typeParsers})).rows as Row[];

export function pgCompanyDb(pool:Pool):CompanyDb{
 const fn=<T>(role:Role,call:string,values:unknown[]):Promise<T>=>asRole(pool,role,null,async c=>(await q(c,`select ${call} as v`,values))[0].v as T);
 const svc=<T>(body:(c:PoolClient)=>Promise<T>)=>asRole(pool,'service_role',null,body);
 const user=<T>(userId:string,body:(c:PoolClient)=>Promise<T>,fk?:CompanyDbError['code'])=>asRole(pool,'authenticated',userId,body,fk);
 return {
  async digestDue(now,limit,market){return dueFromJson(await fn('service_role','public.company_digest_due($1::timestamptz,$2,$3)',[now.toISOString(),limit,market??null]));},
  async sweepDue(olderThan,now,limit,market){return dueFromJson(await fn('service_role','public.company_sweep_due($1::timestamptz,$2::timestamptz,$3,$4)',[olderThan.toISOString(),now.toISOString(),limit,market??null]));},
  async beginAttempt(issuer,market,now){return Number(await fn('service_role','public.begin_company_digest_attempt($1,$2,$3::timestamptz)',[issuer,market,now.toISOString()]));},
  async replaceDigest(issuer,market,batch,attemptId,rebuildId,basedOnRev,sweep,events,coverage){
   return replaceResultFromJson(await fn('service_role','public.replace_company_digest($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)',[issuer,market,batch,attemptId,rebuildId,basedOnRev,sweep,JSON.stringify(events),JSON.stringify(coverage)]));
  },
  async markDigestFailed(issuer,market,attemptId,now){return (await fn('service_role','public.mark_company_digest_failed($1,$2,$3,$4::timestamptz)',[issuer,market,attemptId,now.toISOString()]))===true;},
  async backlog(){return {failedStreams:Number(await fn('service_role','public.company_digest_backlog()',[]))};},
  async digestState(issuer,market){const [r]=await svc(c=>q(c,`select * from public.company_digest_state where issuer_id = $1 and market = $2`,[issuer,market]));return r?digestStateFromRow(r):null;},
  async replaceEvidence(issuer,market,attemptId,basedOnRev,rows){
   const x=await fn<{upserted:unknown;deleted:unknown}>('service_role','public.replace_company_fact_evidence($1,$2,$3,$4,$5::jsonb)',[issuer,market,attemptId,basedOnRev,JSON.stringify(rows)]);
   return {upserted:Number(x.upserted),deleted:Number(x.deleted)};
  },
  async eventsOfIssuer(issuer,market,o){
   checkEventsQuery(o);
   const cur=o.cursor?decodeIssuerCursor(o.cursor):null;
   const values:unknown[]=[issuer,market];let where='issuer_id = $1 and market = $2 and retired_at is null';
   if(o.since!==undefined){values.push(o.since);where+=` and occurred_on >= $${values.length}::date`;}
   if(o.until!==undefined){values.push(o.until);where+=` and occurred_on <= $${values.length}::date`;}
   if(o.kinds?.length){values.push(o.kinds);where+=` and kind = any($${values.length}::text[])`;}
   if(cur){values.push(cur[0],cur[1]);where+=` and (occurred_on < $${values.length-1}::date or (occurred_on = $${values.length-1}::date and event_id collate "C" > $${values.length}))`;}
   values.push(o.limit+1);
   const rows=await svc(c=>q(c,`select * from public.issuer_events where ${where} order by occurred_on desc, event_id collate "C" limit $${values.length}`,values));
   return issuerPage(rows.map(eventFromRow),o.limit);
  },
  async eventsOfIssuers(issuers,o){
   checkEventsQuery(o);
   const cur=o.cursor?decodeInboxCursor(o.cursor):null;
   const ids=[...new Set(issuers)];
   if(!ids.length)return {rows:[],nextCursor:null};
   const values:unknown[]=[ids];let where='issuer_id = any($1::uuid[]) and retired_at is null';
   if(o.kinds?.length){values.push(o.kinds);where+=` and kind = any($${values.length}::text[])`;}
   if(cur){values.push(cur[0],cur[1]);where+=` and (first_seen_at < $${values.length-1}::timestamptz or (first_seen_at = $${values.length-1}::timestamptz and event_id collate "C" < $${values.length}))`;}
   values.push(o.limit+1);
   const rows=await svc(c=>q(c,`select * from public.issuer_events where ${where} order by first_seen_at desc, event_id collate "C" desc limit $${values.length}`,values));
   return inboxPage(rows.map((r):RawEvent=>({row:eventFromRow(r),seen:String(r.first_seen_at)})),o.limit);
  },
  async evidenceOf(factIds){
   const out=new Map<string,EvidenceRecord>();
   for(const part of chunkOf([...new Set(factIds)],EVIDENCE_IDS_PER_CALL)){
    const x=await fn<Record<string,Row>>('service_role','public.company_fact_evidence($1::uuid[])',[part]);
    for(const [k,v] of Object.entries(x??{}))out.set(k,evidenceFromJson(v));
   }
   return out;
  },
  async coverageOf(issuers){
   const ids=[...new Set(issuers)];
   if(!ids.length)return [];
   return sortCoverage((await asRole(pool,'anon',null,c=>q(c,`select * from public.issuer_coverage where issuer_id = any($1::uuid[])`,[ids]))).map(coverageFromRow));
  },
  async listCoverage(filter,sort,page){
   return coveragePageFromJson(await fn('anon','public.company_list_coverage($1,$2::uuid[],$3,$4,$5)',[filter.market??null,filter.issuerIds??null,sort,page.offset,page.limit]));
  },
  async watchesOf(userId){return (await user(userId,c=>q(c,`select * from public.company_watches order by updated_at desc, issuer_id`))).map(watchFromRow);},
  async upsertWatch(userId,issuerId){
   return user(userId,async c=>{
    const [made]=await q(c,`insert into public.company_watches(user_id,issuer_id) values($1,$2) on conflict (user_id,issuer_id) do nothing returning *`,[userId,issuerId]);
    if(made)return {row:watchFromRow(made),created:true};
    const [r]=await q(c,`select * from public.company_watches where issuer_id = $1`,[issuerId]);
    if(!r)throw new Error('watch_not_visible');
    return {row:watchFromRow(r),created:false};
   });
  },
  async patchWatch(userId,issuerId,patch){
   const p=watchPatch(patch);const cols=Object.keys(p);
   const [r]=await user(userId,c=>cols.length
    ?q(c,`update public.company_watches set ${cols.map((k,i)=>`${k==='note'?'note':'muted'} = $${i+2}`).join(', ')} where issuer_id = $1 returning *`,[issuerId,...cols.map(k=>p[k])])
    :q(c,`select * from public.company_watches where issuer_id = $1`,[issuerId]));
   return r?watchFromRow(r):null;
  },
  async deleteWatch(userId,issuerId){return (await user(userId,c=>q(c,`delete from public.company_watches where issuer_id = $1 returning issuer_id`,[issuerId]))).length>0;},
  async markRead(userId,issuerId,eventIds){
   const ids=checkEventIds(eventIds);
   if(!ids.length)return {inserted:0};
   const rows=await user(userId,c=>q(c,`insert into public.company_event_reads(user_id,issuer_id,event_id) select $1, $2, unnest($3::text[]) on conflict (user_id,event_id) do nothing returning event_id`,[userId,issuerId,ids]),'invalid_read');
   return {inserted:rows.length};
  },
  async readEventIds(userId,eventIds){
   const ids=checkEventIds(eventIds);
   if(!ids.length)return new Set();
   return new Set((await user(userId,c=>q(c,`select event_id from public.company_event_reads where event_id = any($1::text[])`,[ids]))).map(r=>String(r.event_id)));
  },
 };
}

const NAME=/^[a-z_][a-z0-9_]*$/;
/** Supabase-shaped rpc over node-postgres as one client role: named arguments, jsonb results, PostgREST-like {data, error}. */
export function pgRpcClient(pool:Pool,role:Role):RpcClient{
 return {
  async rpc(fnName,args){
   const keys=Object.keys(args);
   if(!NAME.test(fnName)||!keys.every(k=>NAME.test(k)))return {data:null,error:{message:'invalid_rpc_name'}};
   try{
    const data=await asRole(pool,role,null,async c=>(await q(c,`select public.${fnName}(${keys.map((k,i)=>`${k} => $${i+1}`).join(', ')}) as v`,keys.map(k=>args[k])))[0].v);
    return {data,error:null};
   }catch(e){
    const x=e as {message?:string;code?:string;details?:string|null};
    return {data:null,error:{message:x.message,code:x.code,details:x.details??null} satisfies PgErrorLike};
   }
  },
 };
}
