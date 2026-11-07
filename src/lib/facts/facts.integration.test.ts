// src/lib/facts/facts.integration.test.ts
// F2-0 (spec §4, §5.4, §11.2): the financial_facts migration on real PostgreSQL — five tables, the
// disclosure-raw bucket, constraints, both triggers, every SQL function (lease, run lifecycle,
// publish with conflict disposition and mapping_gen activation, resolve/promote, metrics,
// read_facts envelope, scope reconcile), real role privileges, and (Task 3) the pgFactsDb contract.
// Rows are never cleaned up: filings and published facts are append-only by design and test:db
// creates a fresh database for every run; every test uses its own issuer.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {quarantine} from '../dq/quarantine';
import {factInsert,factsDbContract,filingInsert} from './db-contract';
import type {ContractHarness} from './db-contract';
import {pgFactsDb} from './pg-facts-db';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261106090000_financial_facts.sql';
// Plan 3 (20261107091000) redefines fact_promote_rows, filings_limited_update, read_facts and
// replace_financial_metrics: replaying the plan-2 file alone would expose the plan-2 versions to
// suites running in parallel, so both files replay in one transaction.
const EXTENSIONS='supabase/migrations/20261107091000_facts_extensions.sql';
const TABLES=['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'];

// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
  }finally{c.release();}
 }
}

/** Runs body inside one transaction on its own connection (pid known); rolls back only if still open, and discards the connection if even that fails. */
interface Tx{c:PoolClient;pid:number;commit():Promise<void>}
async function inTx(pool:Pool,body:(tx:Tx)=>Promise<void>):Promise<void>{
 const c=await pool.connect();let open=false;let broken:Error|undefined;
 try{
  await c.query('begin');open=true;
  const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
  await body({c,pid,commit:async()=>{await c.query('commit');open=false;}});
 }finally{
  if(open)await c.query('rollback').catch(e=>{broken=e as Error;});
  c.release(broken);
 }
}
/** Deterministic "is blocked": polls (20 ms, <= 3 s) until some backend waits on `pid`, then asserts p is still pending. */
async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
 let settled=false;p.then(()=>{settled=true;},()=>{settled=true;});
 for(const deadline=Date.now()+3000;;){
  const n=Number((await pool.query(`select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid])).rows[0].n);
  if(n>=1)break;
  if(settled||Date.now()>deadline)throw new Error(`no backend blocked behind pid ${pid} (settled=${settled})`);
  await new Promise(r=>setTimeout(r,20));
 }
 expect(settled).toBe(false);
}

type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string};
type Envelope={state_rev:number;rows:Record<string,unknown>[];truncated:boolean;row_count:number};

describe.skipIf(!enabled)('F2-0 financial facts migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Facts Test')`,[id]);return id;};
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'facts-sync','facts.us')`,[id]);return id;};
 const scope=(iss:string)=>one(`select public.reconcile_fact_sync_scope('US',$1::jsonb) v`,[JSON.stringify([{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
 const claim=(iss:string,b:string,ttl=600)=>one(`select public.claim_fact_sync_lease($1,'US',$2,$3) v`,[iss,b,ttl]);
 const begin=(iss:string,b:string,gen=1)=>one(`select public.begin_sync_run($1,'US',$2,$3) v`,[iss,b,gen]);
 const filing=async(run:string,available='2024-02-01',sourceRef=randomUUID())=>{
  const id=randomUUID();
  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:id,source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:available,source_ref:sourceRef,url:null}])]);
  return m[sourceRef] as string;
 };
 const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:'facts-map/1',raw_hash:'h'});
 const stage=async(run:string,rows:FactSpec[])=>{const full=rows.map(factRow);const n=await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(full)]);return {n:n as number,ids:full.map(r=>r.fact_id)};};
 const quarantine=(run:string,ids:string[],item:string)=>one(`select public.quarantine_facts($1,$2::uuid[],$3) v`,[run,ids,item]);
 const publish=(run:string,manifest:string[])=>one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,manifest]);
 const abandon=(run:string)=>q(`select public.abandon_sync_run($1)`,[run]);
 const resolve=(item:string,chosen:string[],by=randomUUID())=>one(`select public.resolve_facts_quarantine($1,$2::uuid[],$3) v`,[item,chosen,by]);
 const promote=(iss:string,ids:string[])=>one(`select public.promote_quarantined($1,'US',$2::uuid[]) v`,[iss,ids]);
 const status=async(id:string)=>(await q(`select status from public.financial_facts where fact_id=$1`,[id]))[0]?.status??null;
 const runStatus=async(run:string)=>(await q(`select status from public.fact_sync_runs where run_id=$1`,[run]))[0].status;
 const rev=(iss:string)=>one(`select public.fact_state_rev($1,'US') v`,[iss]).then(Number);
 const read=async(iss:string,o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
  (await client.query(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[iss,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as Envelope;
 const conflictItem=async(iss:string,b:string,run:string,factIds:string[],date='2024-02-01')=>{
  const id=randomUUID();
  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'same_day_conflict',$3,$4::jsonb)`,
   [id,`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,b,JSON.stringify({key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:date},fact_ids:factIds,values:[],run_id:run})]);
  return id;
 };
 const item=async(id:string)=>(await q(`select status,payload->'fact_ids' fact_ids,detail->'chosen_fact_ids' chosen from public.dq_quarantine where id=$1`,[id]))[0];
 /** A leased issuer with one published run: filing f0 (2024-01-01) carries r0 = revenue 90, filing f (2024-02-01) carries r = revenue 100 for the same key. state_rev = 1. */
 const published=async()=>{
  const iss=await issuer();const b=await batch();expect(await scope(iss)).toBe(1);expect(await claim(iss,b)).toBe(true);
  const run=await begin(iss,b);const f0=await filing(run,'2024-01-01');const f=await filing(run);
  const {ids:[r0]}=await stage(run,[{filing_id:f0,value:'90',available_date:'2024-01-01'}]);
  const {ids:[r]}=await stage(run,[{filing_id:f,value:'100'}]);
  expect(await publish(run,[f0,f])).toBe(2);
  return {iss,b,run,f0,f,r0,r};
 };

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates five RLS tables, the disclosure-raw bucket, select-only grants, function grants, and replays',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect(r.relrowsecurity).toBe(true);
  expect(await q(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='disclosure-raw'`)).toEqual([{id:'disclosure-raw',public:false,file_size_limit:'52428800',allowed_mime_types:['application/json']}]);
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ['anon','authenticated','service_role'])for(const t of TABLES)for(const p of ['INSERT','DELETE','TRUNCATE'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const role of ['anon','authenticated'])for(const t of TABLES)expect({role,t,ok:await priv(role,t,'UPDATE')}).toEqual({role,t,ok:false});
  for(const t of TABLES)expect({t,ok:await priv('service_role',t,'UPDATE')}).toEqual({t,ok:false});   // table-level UPDATE: none (filings has a column grant only)
  for(const t of ['filings','financial_facts','financial_metrics'])for(const role of ['anon','authenticated','service_role'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:true});
  for(const t of ['fact_sync_runs','fact_sync_scope']){for(const role of ['anon','authenticated'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:false});expect(await priv('service_role',t,'SELECT')).toBe(true);}
  expect(await one(`select has_column_privilege('service_role','public.filings','document_ref','UPDATE') v`)).toBe(true);
  expect(await one(`select has_column_privilege('service_role','public.filings','link_attempts','UPDATE') v`)).toBe(true);
  expect(await one(`select has_column_privilege('service_role','public.filings','mapping_gen','UPDATE') v`)).toBe(false);
  const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
  for(const role of ['anon','authenticated','service_role']){
   expect(await fn(role,'public.read_facts(uuid,text,text[],date,date,date,boolean,int,boolean)')).toBe(true);
   expect(await fn(role,'public.fact_state_rev(uuid,text)')).toBe(true);
  }
  for(const sig of ['public.begin_sync_run(uuid,text,uuid,int)','public.reconcile_fact_sync_scope(text,jsonb,timestamptz)','public.resolve_facts_quarantine(uuid,uuid[],uuid)','public.replace_financial_metrics(uuid,text,bigint,jsonb)']){
   for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
   expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
  }
  for(const role of ['anon','authenticated','service_role'])expect(await fn(role,'public.fact_promote_rows(uuid,text,uuid[])')).toBe(false);
  await expect(replayMigration(admin,`${readFileSync(MIGRATION,'utf8')}\n${readFileSync(EXTENSIONS,'utf8')}`)).resolves.toBeUndefined();
 },60000);

 it('enforces the candidate key (nulls not distinct), both composite foreign keys, the period checks, and keeps 20-digit values exact',async()=>{
  const iss=await issuer();const b=await batch();const run=randomUUID();
  await q(`insert into public.fact_sync_runs(run_id,issuer_id,market,batch_id,mapping_gen) values($1,$2,'US',$3,1)`,[run,iss,b]);
  const f=randomUUID();
  await q(`insert into public.filings(filing_id,issuer_id,market,source,origin,form_type,available_date,source_ref,run_id) values($1,$2,'US','edgar','sec','10-K','2024-02-01',$3,$4)`,[f,iss,randomUUID(),run]);
  const ins=(cols:Record<string,unknown>)=>{
   const r:Record<string,unknown>={fact_id:randomUUID(),issuer_id:iss,market:'US',filing_id:f,run_id:run,concept:'total_assets',source_concept:'Assets',statement:'BS',period_start:null,period_end:'2023-12-31',duration:'INSTANT',value:'1',unit:'USD',available_date:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...cols};
   const k=Object.keys(r);return q(`insert into public.financial_facts(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c]));
  };
  await ins({});
  await expect(ins({})).rejects.toThrow(/financial_facts_candidate_key/);
  await ins({mapping_gen:2});                                                                   // another generation is another candidate
  await expect(ins({available_date:'2024-02-02',period_end:'2023-11-30'})).rejects.toThrow(/financial_facts_filing_date_fkey/);
  await expect(ins({issuer_id:randomUUID(),period_end:'2023-11-30'})).rejects.toThrow(/financial_facts_filing_fkey/);
  await expect(ins({period_start:'2023-12-31',duration:'3M'})).rejects.toThrow(/financial_facts_period/);
  await expect(ins({period_start:'2023-10-01',duration:'INSTANT',period_end:'2023-11-30'})).rejects.toThrow(/financial_facts_instant/);
  await ins({period_end:'2023-06-30',value:'12345678901234567890'});
  expect(await one(`select value_text v from public.financial_facts where run_id=$1 and period_end='2023-06-30'`,[run])).toBe('12345678901234567890');
 });

 it('triggers: facts are append-only with a status-only lifecycle; filings allow link columns and a rising mapping_gen; deletes are gated',async()=>{
  const iss=await issuer();const b=await batch();const run=randomUUID();
  await q(`insert into public.fact_sync_runs(run_id,issuer_id,market,batch_id,mapping_gen) values($1,$2,'US',$3,1)`,[run,iss,b]);
  const f=randomUUID();const g=randomUUID();
  await q(`insert into public.filings(filing_id,issuer_id,market,source,origin,form_type,available_date,source_ref,run_id) values($1,$2,'US','edgar','sec','10-K','2024-02-01',$3,$4),($5,$2,'US','edgar','sec','10-Q','2024-02-01',$6,$4)`,[f,iss,randomUUID(),run,g,randomUUID()]);
  const id=randomUUID();
  const base=`insert into public.financial_facts(fact_id,issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash,status) values($1,$2,'US',$3,$4,'revenue','Revenues','IS','2023-10-01','2023-12-31','3M',100,'USD','2024-02-01',1,'facts-map/1','h',$5)`;
  await expect(q(base,[id,iss,f,run,'ok'])).rejects.toThrow(/append_only:/);
  await q(base,[id,iss,f,run,'staged']);
  await expect(q(`update public.financial_facts set value=101 where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  await expect(q(`update public.financial_facts set raw_hash='h2' where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  await expect(q(`update public.financial_facts set status='staged' where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  // Every permitted transition, as a plain UPDATE in a BEFORE trigger (round-1 #1: the generated
  // value_text is not computed for NEW yet, so the immutable-field check must not compare it).
  await q(`update public.financial_facts set status='ok' where fact_id=$1`,[id]);                 // staged → ok
  await expect(q(`update public.financial_facts set status='staged' where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  await q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[id]);        // ok → quarantined
  await q(`update public.financial_facts set status='ok' where fact_id=$1`,[id]);                 // quarantined → ok
  const id2=randomUUID();
  await q(base.replace("'2023-10-01','2023-12-31'","'2023-07-01','2023-09-30'"),[id2,iss,f,run,'staged']);
  await q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[id2]);       // staged → quarantined
  await expect(q(`update public.financial_facts set status='staged' where fact_id=$1`,[id2])).rejects.toThrow(/append_only:/);
  expect((await q(`select value_text from public.financial_facts where fact_id=any($1::uuid[]) order by period_end`,[[id,id2]])).map(x=>x.value_text)).toEqual(['100','100']);
  await expect(q(`delete from public.financial_facts where fact_id=$1`,[id])).rejects.toThrow(/append_only:/);
  await expect(q(`update public.filings set url='x' where filing_id=$1`,[f])).rejects.toThrow(/append_only:/);
  await q(`update public.filings set document_ref='a',document_url='u',link_attempts=1,mapping_gen=2 where filing_id=$1`,[f]);
  await expect(q(`update public.filings set mapping_gen=1 where filing_id=$1`,[f])).rejects.toThrow(/append_only:/);
  await expect(q(`delete from public.filings where filing_id=$1`,[g])).rejects.toThrow(/append_only:/);
  await q(`begin; select set_config('facts.allow_filing_delete','on',true); delete from public.filings where filing_id='${g}'; commit;`);
  expect(await q(`select 1 from public.filings where filing_id=$1`,[g])).toHaveLength(0);
  await q(`update public.fact_sync_runs set status='abandoned' where run_id=$1`,[run]);
  await q(`delete from public.financial_facts where fact_id=$1`,[id]);
  expect(await status(id)).toBeNull();
 });

 it('lease: exclusive per issuer and market, renewable by its holder, lost after expiry, released only by the holder',async()=>{
  const iss=await issuer();const b1=await batch();const b2=await batch();
  expect(await claim(iss,b1)).toBe(false);                                   // no scope row yet
  expect(await scope(iss)).toBe(1);
  expect(await claim(iss,b1)).toBe(true);
  expect(await claim(iss,b2)).toBe(false);
  expect(await claim(iss,b1)).toBe(true);                                    // renew
  expect((await Promise.all(Array.from({length:8},()=>claim(iss,b2)))).every(x=>x===false)).toBe(true);
  await q(`update public.fact_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1`,[iss]);
  const racers=await Promise.all(Array.from({length:8},()=>batch()));
  const winners=await Promise.all(racers.map(r=>claim(iss,r)));
  expect(winners.filter(Boolean)).toHaveLength(1);
  const holder=racers[winners.indexOf(true)];
  expect(await fails(begin(iss,b1))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect(await fails(q(`select public.release_fact_sync_lease($1,'US',$2,'failed',now())`,[iss,b1]))).toMatchObject({message:'lease_lost',code:'55P03'});
  expect((await fails(q(`select public.release_fact_sync_lease($1,'US',$2,'maybe',now())`,[iss,holder]))).message).toBe('invalid_outcome');
  await q(`select public.release_fact_sync_lease($1,'US',$2,'success',now()+interval '7 days')`,[iss,holder]);
  const s=(await q(`select lease_until,lease_batch_id,last_status,last_batch_id,last_success_at is not null ok,next_due_at > now()+interval '6 days' due from public.fact_sync_scope where issuer_id=$1`,[iss]))[0];
  expect(s).toEqual({lease_until:null,lease_batch_id:null,last_status:'success',last_batch_id:holder,ok:true,due:true});
  expect(await claim(iss,b1)).toBe(true);                                    // released → claimable again
 });

 it('run lifecycle: begin abandons staged runs (mark, delete facts, prune gen-0 filings); abandon refuses published runs and is idempotent; published quarantined rows survive',async()=>{
  const {iss,b,run:run1,f,r}=await published();
  const run2=await begin(iss,b);
  const {ids:[c]}=await stage(run2,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',value:'5'}]);
  const itemId=await conflictItem(iss,b,run2,[c]);
  expect(await quarantine(run2,[c],itemId)).toBe(1);
  expect(await publish(run2,[f])).toBe(0);
  expect(await status(c)).toBe('quarantined');
  const run3=await begin(iss,b);
  const f3=await filing(run3);
  const {ids:[s3]}=await stage(run3,[{filing_id:f3,value:'7'}]);
  const run4=await begin(iss,b);                                             // abandons run3
  expect(await runStatus(run3)).toBe('abandoned');
  expect(await status(s3)).toBeNull();
  expect(await q(`select 1 from public.filings where filing_id=$1`,[f3])).toHaveLength(0);   // gen 0, no facts → pruned
  expect(await q(`select 1 from public.filings where filing_id=$1`,[f])).toHaveLength(1);    // activated → kept
  expect(await status(r)).toBe('ok');expect(await status(c)).toBe('quarantined');
  expect(await fails(abandon(run1))).toMatchObject({message:'run_published',code:'P0001'});
  await abandon(run4);await abandon(run4);
  expect(await runStatus(run4)).toBe('abandoned');
  expect((await fails(stage(run4,[{filing_id:f}]))).message).toBe('run_abandoned');
  expect((await fails(stage(run1,[{filing_id:f}]))).message).toBe('run_published');
 });

 it('publish: rows become visible atomically, mapping_gen activates per manifest, regression is refused without side effects, state_rev advances',async()=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
  const run=await begin(iss,b);const f=await filing(run);
  const {n,ids:[a]}=await stage(run,[{filing_id:f}]);expect(n).toBe(1);
  expect((await stage(run,[{filing_id:f}])).n).toBe(0);                      // same candidate key → duplicates, not written
  expect((await read(iss)).rows).toHaveLength(0);expect(await rev(iss)).toBe(0);
  expect((await read(iss,{nonOk:true})).rows).toHaveLength(0);              // filing still gen 0: not the active generation
  expect(await publish(run,[f])).toBe(1);
  const env=await read(iss);
  expect(env).toMatchObject({state_rev:1,truncated:false,row_count:1});
  expect(env.rows[0]).toMatchObject({fact_id:a,status:'ok',value:'100',value_text:'100',mapping_gen:1,disclosure_seq:1,is_current:true,is_revision:false});
  expect((await q(`select mapping_gen from public.filings where filing_id=$1`,[f]))[0].mapping_gen).toBe(1);
  expect((await q(`select status,manifest,published_at is not null p from public.fact_sync_runs where run_id=$1`,[run]))[0]).toEqual({status:'published',manifest:[f],p:true});
  const run2=await begin(iss,b,2);const {ids:[a2]}=await stage(run2,[{filing_id:f,value:'101'}]);
  expect(await publish(run2,[f])).toBe(1);
  expect((await read(iss)).rows.map(x=>x.fact_id)).toEqual([a2]);           // generation 1 rows are no longer current
  expect((await q(`select status from public.financial_facts where fact_id=$1`,[a]))[0].status).toBe('ok');   // but remain as evidence
  const run3=await begin(iss,b,1);const {ids:[a3]}=await stage(run3,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT'}]);
  expect(await fails(publish(run3,[f]))).toMatchObject({message:'mapping_gen_regression',code:'P0001'});
  expect(await status(a3)).toBe('staged');expect(await runStatus(run3)).toBe('staged');
  expect((await q(`select mapping_gen from public.filings where filing_id=$1`,[f]))[0].mapping_gen).toBe(2);
  expect(await rev(iss)).toBe(2);
 });

 it('same-day conflict: register, abandon, retry, publish disposes the published ok row; dangling ids of deleted candidates are ignored',async()=>{
  const {iss,b,r0,r}=await published();
  const runB=await begin(iss,b);const fb=await filing(runB);
  const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);
  expect(await quarantine(runB,[c],itemId)).toBe(1);
  await abandon(runB);
  expect(await status(r)).toBe('ok');expect(await status(c)).toBeNull();expect((await item(itemId)).status).toBe('open');
  const runC=await begin(iss,b);const fc=await filing(runC);
  const {ids:[c2]}=await stage(runC,[{filing_id:fc,value:'200'}]);
  expect(await quarantine(runC,[c2,c2],itemId)).toBe(1);
  expect((await item(itemId)).fact_ids).toEqual([c,r,c2]);                 // merged, deduplicated, order kept
  expect(await publish(runC,[fc])).toBe(0);
  expect(await status(r)).toBe('quarantined');expect(await status(c2)).toBe('quarantined');
  const env=await read(iss,{concepts:['revenue']});
  expect(env.rows.map(x=>x.fact_id)).toEqual([r0]);expect(env.rows[0]).toMatchObject({value:'90',is_current:true});
  expect(await rev(iss)).toBe(2);
 });

 it('resolve_facts_quarantine: run_pending while any member run is staged; verdict persisted atomically; chosen promoted; unchosen bound for good',async()=>{
  const {iss,b,r}=await published();
  const runB=await begin(iss,b);const fb=await filing(runB);const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);await quarantine(runB,[c],itemId);
  expect(await fails(resolve(itemId,[r]))).toMatchObject({message:'run_pending',code:'P0001'});
  expect((await item(itemId)).status).toBe('open');
  await publish(runB,[fb]);
  expect(await status(r)).toBe('quarantined');
  expect((await fails(resolve(itemId,[randomUUID()]))).message).toBe('invalid_chosen');
  expect(await resolve(itemId,[r])).toMatchObject({promoted:1,skipped:0,chosen_fact_ids:[r]});
  expect(await item(itemId)).toEqual({status:'resolved_accept',fact_ids:[c,r],chosen:[r]});
  expect(await one(`select detail->'hook' v from public.dq_quarantine where id=$1`,[itemId])).toMatchObject({stage:'materialize',state:'pending'});   // durable pending hook, same transaction
  expect(await status(r)).toBe('ok');expect(await status(c)).toBe('quarantined');expect(await rev(iss)).toBe(3);
  expect((await read(iss,{concepts:['revenue']})).rows.map(x=>x.fact_id)).toContain(r);   // chosen row really visible (R7-1)
  const other=randomUUID();
  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'identity_gp',$3,$4::jsonb)`,[other,`${iss}:US:IS:${other}`,b,JSON.stringify({key:{},fact_ids:[c],run_id:runB})]);
  expect(await resolve(other,[])).toMatchObject({promoted:0,skipped:1});          // c is bound by the verdict
  expect(await status(c)).toBe('quarantined');
  expect((await fails(resolve(other,[]))).message).toBe('item_not_open');
  expect((await fails(resolve(randomUUID(),[]))).message).toBe('item_not_open');
 });

 it('resolve_facts_quarantine refuses chosen rows with differing values and non-facts items, without side effects',async()=>{
  const {iss,b,r}=await published();                                         // r = revenue 100
  const runB=await begin(iss,b);const fb=await filing(runB);const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);await quarantine(runB,[c],itemId);await publish(runB,[fb]);
  const before=await rev(iss);
  expect(await fails(resolve(itemId,[r,c]))).toMatchObject({message:'invalid_chosen',code:'22023'});
  expect((await item(itemId)).status).toBe('open');
  expect(await status(r)).toBe('quarantined');expect(await status(c)).toBe('quarantined');expect(await rev(iss)).toBe(before);
  const foreign=randomUUID();
  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','other_table',$2,'identity_gp',$3,$4::jsonb)`,[foreign,`${iss}:other:${foreign}`,b,JSON.stringify({key:{},fact_ids:[c],run_id:runB})]);
  expect(await fails(resolve(foreign,[]))).toMatchObject({message:'item_not_open',code:'P0001'});
  expect((await item(foreign)).status).toBe('open');expect(await status(c)).toBe('quarantined');
 });

 it('promote_quarantined eligibility: staged runs, open items and unchosen verdicts block; ok rows are skipped',async()=>{
  const {iss,b,f,r}=await published();
  const run=await begin(iss,b);
  const {ids:[x]}=await stage(run,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT'}]);
  const itemId=await conflictItem(iss,b,run,[x]);await quarantine(run,[x],itemId);
  expect(await promote(iss,[x])).toBe(0);                                    // run still staged
  await publish(run,[f]);
  expect(await promote(iss,[x])).toBe(0);                                    // referenced by an open item
  await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[itemId,randomUUID()]);
  expect(await promote(iss,[x])).toBe(0);                                    // resolved conflict that never chose x
  await q(`update public.dq_quarantine set detail=jsonb_build_object('chosen_fact_ids',jsonb_build_array($2::text)) where id=$1`,[itemId,x]);
  expect(await promote(iss,[x,r])).toBe(1);                                  // r is ok already → not counted
  expect(await status(x)).toBe('ok');expect(await rev(iss)).toBe(3);
  expect(await promote(iss,[x])).toBe(0);expect(await rev(iss)).toBe(3);    // nothing promoted → state_rev unchanged
 });

 it('resolution serialises behind an uncommitted publish while readers never block',async()=>{
  const {iss,b,r}=await published();
  const runB=await begin(iss,b);const fb=await filing(runB);const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);await quarantine(runB,[c],itemId);
  await inTx(admin,async({c:c1,pid,commit})=>{
   await c1.query(`select public.publish_sync_run($1,$2::uuid[])`,[runB,[fb]]);
   const before=await read(iss,{concepts:['revenue']});
   expect(before.state_rev).toBe(1);expect(before.rows.map(x=>x.fact_id)).toContain(r);      // uncommitted publish invisible, read not blocked
   const pending=resolve(itemId,[r]);
   await stillBlockedBehind(admin,pid,pending);                                                 // waits for the scope row lock
   await commit();
   expect(await pending).toMatchObject({promoted:1,skipped:0,chosen_fact_ids:[r]});                                       // saw the published run, not run_pending
  });
  expect(await status(r)).toBe('ok');expect(await status(c)).toBe('quarantined');expect(await rev(iss)).toBe(3);
 });

 it('a merge that commits while a resolution waits for the scope lock is seen by that resolution: the member set is rebuilt under the lock (round-1 #2)',async()=>{
  const {iss,b,r}=await published();
  const runB=await begin(iss,b);const fb=await filing(runB);const {ids:[c]}=await stage(runB,[{filing_id:fb,value:'200'}]);
  const itemId=await conflictItem(iss,b,runB,[c,r]);await quarantine(runB,[c],itemId);await publish(runB,[fb]);
  // Members [c, r] are both published: resolvable. Run C now stages c2 and merges it into the item
  // inside an open transaction (quarantine_facts holds the scope row lock through fact_run_lock).
  const runC=await begin(iss,b);const fc=await filing(runC);const {ids:[c2]}=await stage(runC,[{filing_id:fc,value:'300'}]);
  await inTx(admin,async({c:c1,pid,commit})=>{
   await c1.query(`select public.quarantine_facts($1,$2::uuid[],$3)`,[runC,[c2],itemId]);
   const pending=fails(resolve(itemId,[r]));                                          // provisional read saw [c, r]; now blocked on the scope lock
   await stillBlockedBehind(admin,pid,pending);
   await commit();
   expect(await pending).toMatchObject({message:'run_pending',code:'P0001'});          // rebuilt members include c2, whose run C is staged
  });
  expect(await item(itemId)).toMatchObject({status:'open',fact_ids:[c,r,c2]});
  expect(await status(r)).toBe('quarantined');                                        // nothing was promoted on the stale member set
  await publish(runC,[fc]);
  expect(await resolve(itemId,[r])).toMatchObject({promoted:1,skipped:0});
  expect(await status(r)).toBe('ok');expect(await status(c2)).toBe('quarantined');
 });

 it('replace_financial_metrics refuses a stale based_on_rev across publish and promote, and replaces the issuer atomically',async()=>{
  const {iss,b,r}=await published();
  const metric=(v:string,name='gross_margin')=>({metric:name,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],as_of:'2024-03-01'});
  const replace=(based:number,rows:unknown[])=>one(`select public.replace_financial_metrics($1,'US',$2,$3::jsonb) v`,[iss,based,JSON.stringify(rows)]);
  expect(await fails(replace(0,[metric('0.5')]))).toMatchObject({message:'stale_computation',code:'P0001'});
  expect(await replace(1,[metric('0.5')])).toBe(1);
  const run=await begin(iss,b);expect(await publish(run,[])).toBe(0);     // an empty run still advances state_rev
  expect((await fails(replace(1,[metric('0.6')]))).message).toBe('stale_computation');
  expect(await replace(2,[metric('0.6'),metric('0.7','net_margin')])).toBe(2);
  expect(await q(`select metric,value_text,based_on_rev from public.financial_metrics where issuer_id=$1 order by metric`,[iss])).toEqual([{metric:'gross_margin',value_text:'0.6',based_on_rev:'2'},{metric:'net_margin',value_text:'0.7',based_on_rev:'2'}]);
  expect(await replace(2,[])).toBe(0);
  expect(await q(`select 1 from public.financial_metrics where issuer_id=$1`,[iss])).toHaveLength(0);
  expect(await fails(replace(2,[metric('x')]))).toBeTruthy();                // numeric cast error → whole call rejected, nothing deleted
  expect(await fails(replace(9,[]))).toMatchObject({message:'stale_computation'});
 });

 it('read_facts: sequences, revisions, history, K limit, non-ok rows for the owner only, anon sees ok only',async()=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
  const disclose=async(available:string,value:string)=>{const run=await begin(iss,b);const f=await filing(run,available);const {ids:[id]}=await stage(run,[{filing_id:f,value,available_date:available}]);await publish(run,[f]);return id;};
  const d1=await disclose('2024-02-01','100');const d2=await disclose('2024-05-01','100');const d3=await disclose('2024-08-01','120');
  const at=async(asOf:string,history:boolean)=>(await read(iss,{concepts:['revenue'],asOf,history})).rows.map(x=>[x.fact_id,x.disclosure_seq,x.is_current,x.is_revision]);
  expect(await at('2024-05-01',false)).toEqual([[d2,2,true,false]]);
  expect(await at('2024-04-30',false)).toEqual([[d1,1,true,false]]);
  expect(await at('2024-12-31',true)).toEqual([[d1,1,false,false],[d2,2,false,false],[d3,3,true,true]]);
  expect(await at('2024-12-31',false)).toEqual([[d3,3,true,true]]);
  const run=await begin(iss,b);const f=await filing(run,'2024-09-01');const {ids:[qd]}=await stage(run,[{filing_id:f,value:'121',available_date:'2024-09-01'}]);
  const itemId=await conflictItem(iss,b,run,[qd],'2024-09-01');await quarantine(run,[qd],itemId);await publish(run,[f]);
  const all=await read(iss,{concepts:['revenue'],nonOk:true});
  expect(all.rows.find(x=>x.fact_id===qd)).toMatchObject({status:'quarantined',disclosure_seq:null,is_current:false,is_revision:false});
  expect(all.rows.filter(x=>x.status==='ok').map(x=>x.disclosure_seq)).toEqual([1,2,3]);   // non-ok rows do not take part in sequences
  const c=await admin.connect();
  try{
   await c.query('set role anon');
   const anon=await read(iss,{concepts:['revenue'],nonOk:true},c);
   expect(anon.rows.map(x=>x.status)).toEqual(['ok','ok','ok']);expect(anon.state_rev).toBe(4);
   await expect(c.query(`select * from public.fact_sync_scope`)).rejects.toThrow(/permission denied/);
  }finally{await c.query('reset role').catch(()=>{});c.release();}
  const run2=await begin(iss,b);const f2=await filing(run2,'2024-10-01');
  await stage(run2,[{filing_id:f2,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:'2024-06-30',value:'1',available_date:'2024-10-01'},{filing_id:f2,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:'2024-03-31',value:'2',available_date:'2024-10-01'}]);
  await publish(run2,[f2]);
  expect((await read(iss,{limit:1})).rows.map(x=>x.period_end)).toEqual(['2024-06-30']);              // keys ranked by period_end desc
  expect((await read(iss,{limit:2})).rows.map(x=>x.period_end)).toEqual(['2024-06-30','2024-03-31']);
  expect((await read(iss,{history:false})).rows).toHaveLength(3);
  expect((await read(iss,{concepts:['nope']})).rows).toHaveLength(0);
 });

 it('read_facts caps the envelope at 10,000 rows: 1,001 rows pass through, 10,001 are refused as truncated',async()=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
  const day=(i:number)=>new Date(Date.UTC(1990,0,1)+i*86400000).toISOString().slice(0,10);
  const bulk=async(from:number,to:number)=>{
   const run=await begin(iss,b);const f=await filing(run);let n=0;
   for(let s=from;s<to;s+=500){const rows:FactSpec[]=[];for(let i=s;i<Math.min(to,s+500);i++)rows.push({filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:day(i),value:String(i)});n+=(await stage(run,rows)).n;}
   await publish(run,[f]);return n;
  };
  expect(await bulk(0,1001)).toBe(1001);
  const small=await read(iss,{concepts:['total_assets']});
  expect(small).toMatchObject({truncated:false,row_count:1001});expect(small.rows).toHaveLength(1001);
  expect(await bulk(1001,10001)).toBe(9000);
  expect(await read(iss,{concepts:['total_assets']})).toMatchObject({state_rev:2,truncated:true,row_count:0,rows:[]});
  expect((await read(iss,{concepts:['total_assets'],limit:1000})).rows).toHaveLength(1000);
 },120000);

 it('reconcile_fact_sync_scope upserts scheduling inputs only and counts real changes',async()=>{
  const iss=await issuer();const b=await batch();
  expect(await scope(iss)).toBe(1);await claim(iss,b);
  await q(`update public.fact_sync_scope set next_due_at='2030-01-01',state_rev=5 where issuer_id=$1`,[iss]);
  const rows=(p:number)=>JSON.stringify([{issuer_id:iss,reasons:['sp500'],priority:p,fetch_key:'0000000002'}]);
  expect(await one(`select public.reconcile_fact_sync_scope('US',$1::jsonb) v`,[rows(0)])).toBe(1);
  expect(await one(`select public.reconcile_fact_sync_scope('US',$1::jsonb) v`,[rows(0)])).toBe(0);
  const s=(await q(`select reasons,priority,fetch_key,lease_batch_id,state_rev,next_due_at::date::text due from public.fact_sync_scope where issuer_id=$1`,[iss]))[0];
  expect(s).toEqual({reasons:['sp500'],priority:0,fetch_key:'0000000002',lease_batch_id:b,state_rev:'5',due:'2030-01-01'});
  expect((await fails(q(`select public.reconcile_fact_sync_scope('HK','[]'::jsonb)`))).message).toBe('invalid_market');
  expect((await fails(q(`select public.reconcile_fact_sync_scope('US','{}'::jsonb)`))).message).toBe('invalid_rows');
 });

 it('reconcile_fact_sync_scope: a retirement from an older snapshot does not undo a newer activation; activations always apply',async()=>{
  const iss=await issuer();
  const call=(p:number,snap:string|null)=>one(`select public.reconcile_fact_sync_scope('US',$1::jsonb,$2::timestamptz) v`,[JSON.stringify([{issuer_id:iss,reasons:['r'],priority:p,fetch_key:'0000000003'}]),snap]);
  expect(await call(10,null)).toBe(1);
  expect(await call(0,'2000-01-01T00:00:00Z')).toBe(0);   // snapshot older than the row's last scope change → refused
  expect((await q(`select priority from public.fact_sync_scope where issuer_id=$1`,[iss]))[0].priority).toBe(10);
  expect(await call(0,'2100-01-01T00:00:00Z')).toBe(1);   // snapshot newer → retired
  expect(await call(10,'2000-01-01T00:00:00Z')).toBe(1);  // activation applies whatever the snapshot
 });

 it('reconcile_fact_sync_scope: an unchanged active upsert by a newer reconcile also protects the row from an older retirement',async()=>{
  const iss=await issuer();
  const call=(p:number,snap:string|null)=>one(`select public.reconcile_fact_sync_scope('US',$1::jsonb,$2::timestamptz) v`,[JSON.stringify([{issuer_id:iss,reasons:['r'],priority:p,fetch_key:'0000000004'}]),snap]);
  expect(await call(10,null)).toBe(1);
  const snap=(await q(`select now()::text t`))[0].t as string;   // run A reads its sources here
  await q(`select pg_sleep(0.05)`);
  expect(await call(10,null)).toBe(0);                          // run B confirms the row unchanged (not counted)
  expect(await call(0,snap)).toBe(0);                           // A's stale retirement is refused
  expect((await q(`select priority from public.fact_sync_scope where issuer_id=$1`,[iss]))[0].priority).toBe(10);
 });

 it('roles: no role writes the fact tables directly; service_role updates link columns only; anon and authenticated cannot call write functions',async()=>{
  const {iss,f,r,r0}=await published();
  const c=await admin.connect();
  try{
   await c.query('set role service_role');
   await expect(c.query(`insert into public.financial_facts(fact_id,issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash) select gen_random_uuid(),issuer_id,market,filing_id,run_id,'x',source_concept,statement,period_start,period_end,duration,value,unit,available_date,mapping_gen,mapping_version,raw_hash from public.financial_facts where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.financial_facts set status='quarantined' where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`delete from public.financial_facts where fact_id=$1`,[r])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.filings set mapping_gen=9 where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.filings set url='x' where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
   await expect(c.query(`insert into public.fact_sync_scope(issuer_id,market,fetch_key) values($1,'CN','x')`,[iss])).rejects.toThrow(/permission denied/);
   await expect(c.query(`update public.fact_sync_scope set state_rev=99 where issuer_id=$1`,[iss])).rejects.toThrow(/permission denied/);
   await expect(c.query(`delete from public.financial_metrics where issuer_id=$1`,[iss])).rejects.toThrow(/permission denied/);
   expect((await c.query(`update public.filings set document_ref='doc',document_url='https://example.test/doc',link_attempts=1 where filing_id=$1`,[f])).rowCount).toBe(1);
   expect((await c.query(`select count(*)::int n from public.fact_sync_runs where issuer_id=$1`,[iss])).rows[0].n).toBe(1);
   expect((await read(iss,{concepts:['revenue'],nonOk:true},c)).rows).toHaveLength(2);
   for(const role of ['anon','authenticated']){
    await c.query('reset role');await c.query(`set role ${role}`);
    await expect(c.query(`select * from public.fact_sync_runs`)).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.begin_sync_run($1,'US',$2,1)`,[iss,randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.resolve_facts_quarantine($1,'{}'::uuid[],$1)`,[randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(c.query(`select public.replace_financial_metrics($1,'US',1,'[]'::jsonb)`,[iss])).rejects.toThrow(/permission denied/);
    await expect(c.query(`update public.filings set document_ref='x' where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
    expect(Number((await c.query(`select public.fact_state_rev($1,'US') v`,[iss])).rows[0].v)).toBe(1);
    expect((await read(iss,{concepts:['revenue']},c)).rows.map(x=>x.fact_id)).toEqual([r0,r]);
    expect((await c.query(`select document_ref from public.filings where filing_id=$1`,[f])).rows[0].document_ref).toBe('doc');
   }
  }finally{await c.query('reset role').catch(()=>{});c.release();}
 });
});

interface PgHarness extends ContractHarness{pool:Pool;close():Promise<void>}
async function pgHarness():Promise<PgHarness>{
 const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
 const pool=new Pool({connectionString:state.adminUrl,statement_timeout:4000});   // a regression that blocks fails cleanly instead of hanging afterAll
 return {
  pool,db:pgFactsDb(pool),tables:pgTableClient(pool),
  issuer:async()=>{const id=randomUUID();await pool.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Facts Contract')`,[id]);return id;},
  batch:async()=>{const id=randomUUID();await pool.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'facts-sync','facts.us')`,[id]);return id;},
  expireLease:async(issuer,market)=>{await pool.query(`update public.fact_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1 and market=$2`,[issuer,market]);},
  user:async()=>{const id=randomUUID();await pool.query(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@contract.test`]);return id;},
  expireReconcileClaim:async(pair,cycleId,issuer,market)=>{await pool.query(`update public.dq_reconcile_cursor set claim_until=clock_timestamp()-interval '1 second' where pair=$1 and cycle_id=$2 and issuer_id=$3 and market=$4`,[pair,cycleId,issuer,market]);},
  close:async()=>{await pool.end();},
 };
}

describe.skipIf(!enabled)('pgFactsDb on real PostgreSQL',()=>{
 // The same scenarios memoryFactsDb passes in db.test.ts, now against the SQL functions.
 factsDbContract('pgFactsDb contract',pgHarness);

 describe('concurrency',()=>{
  let h:PgHarness;
  beforeAll(async()=>{h=await pgHarness();});
  afterAll(async()=>{await h?.close();});
  const ready=async()=>{const iss=await h.issuer();const b=await h.batch();await h.db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);expect(await h.db.claimLease(iss,'US',b,600)).toBe(true);return {iss,b};};

  it('claimLease: eight batches race for one issuer and exactly one wins; the winner renews, the rest stay refused',async()=>{
   const iss=await h.issuer();await h.db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);
   const batches=await Promise.all(Array.from({length:8},()=>h.batch()));
   const won=await Promise.all(batches.map(b=>h.db.claimLease(iss,'US',b,600)));
   expect(won.filter(Boolean)).toHaveLength(1);
   const winner=batches[won.indexOf(true)];
   const again=await Promise.all(batches.map(b=>h.db.claimLease(iss,'US',b,600)));
   expect(again).toEqual(batches.map(b=>b===winner));
  });

  it('a stale worker: the new holder abandons its staged run, every later write is lease_lost, published and quarantined rows survive',async()=>{
   const {db}=h;const {iss,b:b1}=await ready();const b2=await h.batch();
   const run1=await db.beginRun(iss,'US',b1,1);const f1=filingInsert(iss);await db.stageFilings(run1,[f1]);
   const ok=factInsert(iss,f1);const qd=factInsert(iss,f1,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   expect(await db.stageFacts(run1,[ok,qd])).toBe(2);
   const item=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:BS:${randomUUID()}`,reasonCode:'identity_bs',batchId:b1,payload:{key:{},fact_ids:[qd.fact_id],run_id:run1}});
   expect(await db.quarantineFacts(run1,[qd.fact_id],item)).toBe(1);
   expect(await db.publishRun(run1,[f1.filing_id])).toBe(1);
   const run2=await db.beginRun(iss,'US',b1,1);const f2=filingInsert(iss);await db.stageFilings(run2,[f2]);
   const x=factInsert(iss,f2,{value:'7'});expect(await db.stageFacts(run2,[x])).toBe(1);
   await h.expireLease(iss,'US');
   expect(await db.claimLease(iss,'US',b2,600)).toBe(true);
   const run3=await db.beginRun(iss,'US',b2,1);                               // abandons run2 under b1
   expect(await db.factsByIds([x.fact_id])).toEqual([]);
   expect((await db.filingsOfIssuer(iss,'US',{})).map(g=>g.filing_id)).toEqual([f1.filing_id]);
   const stale:Array<()=>Promise<unknown>>=[
    ()=>db.stageFacts(run2,[x]),()=>db.quarantineFacts(run2,[x.fact_id],item),()=>db.publishRun(run2,[]),()=>db.abandonRun(run2),
    ()=>db.beginRun(iss,'US',b1,1),()=>db.releaseLease(iss,'US',b1,'failed','2030-01-01T00:00:00.000Z'),
   ];
   for(const call of stale)await expect(call()).rejects.toMatchObject({name:'FactsDbError',code:'lease_lost'});
   expect((await db.factsByIds([ok.fact_id,qd.fact_id])).map(y=>y.status).sort()).toEqual(['ok','quarantined']);
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01'})).rows.map(y=>y.fact_id)).toEqual([ok.fact_id]);
   expect(await db.publishRun(run3,[])).toBe(0);
   await db.releaseLease(iss,'US',b2,'success','2030-01-01T00:00:00.000Z');
  });

  it('a reader sees nothing of an in-flight publish and the whole run after commit; beginRun waits behind it',async()=>{
   const {db}=h;const {iss,b}=await ready();
   const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
   const a=factInsert(iss,f);const t=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   expect(await db.stageFacts(run,[a,t])).toBe(2);
   await inTx(h.pool,async({c:c1,pid,commit})=>{
    await c1.query(`select public.publish_sync_run($1,$2::uuid[])`,[run,[f.filing_id]]);
    const during=await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true,includeNonOk:true});
    expect(during).toEqual({stateRev:0,rows:[],truncated:false});                        // not blocked, nothing visible
    const next=db.beginRun(iss,'US',b,1);
    await stillBlockedBehind(h.pool,pid,next);                                              // waits for the scope lock
    await commit();
    const run2=await next;expect(run2).not.toBe(run);
   });
   const after=await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true});
   expect(after.stateRev).toBe(1);expect(after.rows.map(y=>y.fact_id).sort()).toEqual([a.fact_id,t.fact_id].sort());
   expect((await db.factsByIds([a.fact_id])).map(y=>y.status)).toEqual(['ok']);         // run stayed published; beginRun abandoned nothing of it
  });

  const opened=async(iss:string,b:string,run:string,ids:string[])=>(await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:BS:${randomUUID()}`,reasonCode:'identity_bs',batchId:b,payload:{key:{},fact_ids:ids,run_id:run}})) as string;
  const itemIds=async(id:string)=>((await h.pool.query(`select payload from public.dq_quarantine where id=$1`,[id])).rows[0].payload.fact_ids as string[]);
  const statusOf=async(id:string)=>(await h.db.factsByIds([id]))[0]?.status;
  const stagedRun=async()=>{
   const {db}=h;const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
   const a=factInsert(iss,f);const t=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   expect(await db.stageFacts(run,[a,t])).toBe(2);
   return {iss,b,run,f,a,t,item:await opened(iss,b,run,[])};
  };

  it('quarantine_facts waits behind an in-flight publish on the same scope, then fails run_published; nothing is merged, rows stay ok',async()=>{
   const {db}=h;const {run,f,a,t,item}=await stagedRun();
   await inTx(h.pool,async({c:c1,pid,commit})=>{
    await c1.query(`select public.publish_sync_run($1,$2::uuid[])`,[run,[f.filing_id]]);
    const q=db.quarantineFacts(run,[t.fact_id],item);q.catch(()=>{});
    await stillBlockedBehind(h.pool,pid,q);
    await commit();
    await expect(q).rejects.toMatchObject({name:'FactsDbError',code:'run_published'});
   });
   expect(await itemIds(item)).toEqual([]);
   expect(await statusOf(a.fact_id)).toBe('ok');expect(await statusOf(t.fact_id)).toBe('ok');
  });

  it('publish waits behind an in-flight quarantine_facts and sees the merge: the member stays quarantined, the item lists it, the rest becomes ok',async()=>{
   const {db}=h;const {run,f,a,t,item}=await stagedRun();
   await inTx(h.pool,async({c:c1,pid,commit})=>{
    expect((await c1.query(`select public.quarantine_facts($1,$2::uuid[],$3) v`,[run,[t.fact_id],item])).rows[0].v).toBe(1);
    const p=db.publishRun(run,[f.filing_id]);p.catch(()=>{});
    await stillBlockedBehind(h.pool,pid,p);
    await commit();
    expect(await p).toBe(1);
   });
   expect(await itemIds(item)).toEqual([t.fact_id]);
   expect(await statusOf(a.fact_id)).toBe('ok');expect(await statusOf(t.fact_id)).toBe('quarantined');
  });

  it('a write in flight while the lease changes hands: the new claim waits for the old holder\'s transaction, then the old holder is lease_lost and its staged rows never become ok',async()=>{
   const {db}=h;
   const iss=await h.issuer();const bA=await h.batch();const bB=await h.batch();
   await db.reconcileScope('US',[{issuer_id:iss,reasons:['t'],priority:1,fetch_key:'k'}]);
   expect(await db.claimLease(iss,'US',bA,3)).toBe(true);                               // 3 s lease
   const run=await db.beginRun(iss,'US',bA,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
   const x=factInsert(iss,f),y=factInsert(iss,f,{concept:'net_income',value:'5'});
   await inTx(h.pool,async({c:c1,pid,commit})=>{
    await c1.query(`select public.stage_facts($1,$2::jsonb)`,[run,JSON.stringify([x])]);   // holds the scope lock, lease still valid at its start
    for(const deadline=Date.now()+6000;;){                                                 // the lease expires while the write is in flight
     if((await h.pool.query(`select lease_until <= clock_timestamp() as expired from public.fact_sync_scope where issuer_id=$1 and market='US'`,[iss])).rows[0].expired)break;
     if(Date.now()>deadline)throw new Error('lease never expired');
     await new Promise(res=>setTimeout(res,50));
    }
    const claim=db.claimLease(iss,'US',bB,600);claim.catch(()=>{});
    await stillBlockedBehind(h.pool,pid,claim);
    await commit();
    expect(await claim).toBe(true);
   });
   await expect(db.stageFacts(run,[y])).rejects.toMatchObject({code:'lease_lost'});
   await expect(db.publishRun(run,[f.filing_id])).rejects.toMatchObject({name:'FactsDbError',code:'lease_lost'});
   expect(await statusOf(x.fact_id)).toBe('staged');expect(await statusOf(y.fact_id)).toBeUndefined();
   await db.beginRun(iss,'US',bB,1);                                                       // the new holder abandons the orphan
   expect(await db.factsByIds([x.fact_id])).toEqual([]);
  });

  it('raw table reads return timestamps in toISOString() form, the same normalisation the Supabase adapter applies to PostgREST values',async()=>{
   const {db}=h;const {iss,b,run,f,a}=await stagedRun();
   await db.publishRun(run,[f.filing_id]);
   const isoRe=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
   const g=(await db.filingsOfIssuer(iss,'US',{}))[0];expect(g.created_at).toMatch(isoRe);expect(g.created_at).toBe(new Date(g.created_at).toISOString());
   expect((await db.factsByIds([a.fact_id]))[0].created_at).toMatch(isoRe);
   await db.releaseLease(iss,'US',b,'success','2030-01-01T00:00:00.000Z');
   const sc=(await db.scopeRows('US',[iss]))[0];
   for(const v of [sc.next_due_at,sc.last_attempt_at,sc.last_success_at])expect(v).toMatch(isoRe);
   expect(sc.next_due_at).toBe('2030-01-01T00:00:00.000Z');
   expect((await db.scopeDue('US','2031-01-01T00:00:00.000Z',5000)).some(r=>r.issuer_id===iss&&isoRe.test(r.next_due_at))).toBe(true);
  });
 });
});
