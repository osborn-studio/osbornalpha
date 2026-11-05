// src/lib/facts/db.test.ts
// memoryFactsDb against the shared contract, memory-only rules (clock, atomic validation), and the
// supabaseFactsDb wiring (rpc names/args, chunking, envelope normalisation, error mapping) over a
// stub client.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {quarantine} from '../dq/quarantine';
import {FactsDbError,supabaseFactsDb,toFactsDbError} from './db';
import {factInsert,factsDbContract,filingInsert} from './db-contract';
import {memoryFactsDb,numericEquals} from './memory-facts-db';

factsDbContract('memoryFactsDb contract',async()=>{
 const db=memoryFactsDb();
 return {db,tables:db.tables,issuer:async()=>randomUUID(),batch:async()=>randomUUID(),expireLease:async(i,m)=>db.expireLease(i,m)};
});

describe('memoryFactsDb specifics',()=>{
 it('expires leases against the injected clock',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b1=randomUUID();const b2=randomUUID();
  db.setNow('2026-01-01T00:00:00.000Z');
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);
  expect(await db.claimLease(iss,'US',b1,60)).toBe(true);
  db.setNow('2026-01-01T00:00:59.000Z');expect(await db.claimLease(iss,'US',b2,60)).toBe(false);
  db.setNow('2026-01-01T00:01:00.000Z');expect(await db.claimLease(iss,'US',b2,60)).toBe(true);
  await expect(db.beginRun(iss,'US',b1,1)).rejects.toMatchObject({code:'lease_lost'});
  expect(db.scope()[0]).toMatchObject({lease_batch_id:b2,lease_until:'2026-01-01T00:02:00.000Z'});
 });
 it('validates a stageFacts batch before writing any row, like one SQL statement',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
  const good=factInsert(iss,f);
  await expect(db.stageFacts(run,[good,factInsert(iss,f,{period_start:'2023-12-31'})])).rejects.toMatchObject({code:'unknown',message:'financial_facts_period'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{duration:'INSTANT'})])).rejects.toMatchObject({message:'financial_facts_instant'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{available_date:'2024-02-02'})])).rejects.toMatchObject({message:'financial_facts_filing_date_fkey'});
  await expect(db.stageFacts(run,[factInsert(iss,f,{filing_id:randomUUID()})])).rejects.toMatchObject({message:'financial_facts_filing_fkey'});
  expect(db.facts()).toEqual([]);
  expect(await db.stageFacts(run,[good])).toBe(1);
  await expect(db.stageFacts(run,[{...factInsert(iss,f,{concept:'net_income'}),fact_id:good.fact_id}])).rejects.toMatchObject({code:'duplicate_key'});
 });
 it('serializes operations: concurrent quarantineFacts keep both members; a read during publish never sees new rows with the old state_rev',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
  const c1=factInsert(iss,f,{value:'1'});const c2=factInsert(iss,f,{concept:'net_income',value:'2'});await db.stageFacts(run,[c1,c2]);
  const item=await quarantine(db.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:x:2024-02-01`,reasonCode:'same_day_conflict',batchId:b,payload:{key:{},fact_ids:[],run_id:run}});
  expect(await Promise.all([db.quarantineFacts(run,[c1.fact_id],item),db.quarantineFacts(run,[c2.fact_id],item)])).toEqual([1,1]);
  expect(((await db.tables.select('dq_quarantine',{id:item}))[0].payload as {fact_ids:string[]}).fact_ids.sort()).toEqual([c1.fact_id,c2.fact_id].sort());
  const run2=await db.beginRun(iss,'US',b,1);const g=filingInsert(iss);await db.stageFilings(run2,[g]);
  await db.stageFacts(run2,[factInsert(iss,g,{concept:'net_income',value:'9'})]);
  const [n,seen]=await Promise.all([db.publishRun(run2,[g.filing_id]),db.readFacts(iss,'US',{concepts:['net_income'],asOf:'2030-01-01'})]);
  expect(n).toBe(1);expect(seen.rows.length).toBe(seen.stateRev);   // (0 rows, rev 0) or (1 row, rev 1)
  expect((await db.readFacts(iss,'US',{concepts:['net_income'],asOf:'2030-01-01'})).stateRev).toBe(1);
 });
 it('shares dq_quarantine with the TableClient it was given',async()=>{
  const db=memoryFactsDb();
  await db.tables.insert('dq_quarantine',{id:'i1',dataset:'facts.us',table_name:'financial_facts',natural_key:'a:US:x',reason_code:'same_day_conflict',status:'open',payload:{key:{available_date:'2024-01-01'},fact_ids:['f1']},detail:{},batch_id:'b',created_at:'2026-01-01T00:00:00.000Z'});
  expect(await db.openConflicts('a','US')).toEqual([{id:'i1',natural_key:'a:US:x',fact_ids:['f1'],available_date:'2024-01-01',key:{available_date:'2024-01-01'}}]);
  expect(await db.openConflicts('b','US')).toEqual([]);
 });
});

describe('numericEquals',()=>{
 it('compares canonical decimal strings as numeric would',()=>{
  expect(numericEquals('100','100.000')).toBe(true);
  expect(numericEquals('-0','0')).toBe(true);
  expect(numericEquals('0100','100')).toBe(true);
  expect(numericEquals('1.50','1.5')).toBe(true);
  expect(numericEquals('12345678901234567890','12345678901234567891')).toBe(false);
  expect(numericEquals('1','2')).toBe(false);
  expect(numericEquals('-1','1')).toBe(false);
 });
});

describe('toFactsDbError',()=>{
 it('maps SQLSTATE and the code-as-message convention',()=>{
  expect(toFactsDbError({message:'lease_lost',code:'55P03'})).toMatchObject({name:'FactsDbError',code:'lease_lost'});
  expect(toFactsDbError({message:'canceling statement due to lock timeout',code:'55P03'}).code).toBe('lease_lost');
  for(const c of ['run_pending','run_published','mapping_gen_regression','stale_computation'])expect(toFactsDbError({message:c,code:'P0001'}).code).toBe(c);
  expect(toFactsDbError({message:'duplicate key value violates unique constraint "filings_pkey"',code:'23505'}).code).toBe('duplicate_key');
  expect(toFactsDbError({message:'item_not_open',code:'P0001'})).toMatchObject({code:'unknown',message:'item_not_open'});
  expect(toFactsDbError({message:undefined,code:undefined}).code).toBe('unknown');
  expect(toFactsDbError({message:'x'})).toBeInstanceOf(FactsDbError);
 });
});

describe('supabaseFactsDb',()=>{
 type Call={fn:string;args:Record<string,unknown>};
 type Op=[string,unknown[]];
 type FromResponder=(table:string,ops:Op[])=>unknown[];
 /** A thenable PostgREST-like builder: every chained call is recorded, `respond` answers when awaited. */
 const builder=(table:string,respond:FromResponder,count?:(table:string)=>number)=>{
  const ops:Op[]=[];
  const proxy:Record<string|symbol,unknown>=new Proxy({},{get:(_t,m)=>m==='then'
   ?(res:(v:unknown)=>unknown,rej:(e:unknown)=>unknown)=>Promise.resolve({data:respond(table,ops),error:null,count:count?count(table):null}).then(res,rej)
   :(...a:unknown[])=>{ops.push([String(m),a]);return proxy;}});
  return proxy;
 };
 const stub=(respond:(fn:string,args:Record<string,unknown>)=>{data?:unknown;error?:{message:string;code?:string}|null},from:FromResponder=()=>{throw new Error('from() not expected');},count?:(table:string)=>number)=>{
  const calls:Call[]=[];
  const client={rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});const r=respond(fn,args);return {data:r.data??null,error:r.error??null};},from:(table:string)=>builder(table,from,count)};
  return {calls,db:supabaseFactsDb(client as unknown as SupabaseClient)};
 };
 it('pages complete-set table reads past PostgREST max_rows in a fixed order and pushes filters into the query (round-1 #7)',async()=>{
  const metric=(i:number)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:'2',as_of:'2024-01-01'});
  const scope=(i:number)=>({issuer_id:`i${i}`,market:'US',reasons:[],priority:10,fetch_key:'k',next_due_at:'2026-01-01T00:00:00+00:00',lease_until:null,lease_batch_id:null,state_rev:'0',last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
  const pages:Op[][]=[];
  const totals:Record<string,number>={financial_metrics:1005,filings:1002,fact_sync_scope:3,financial_facts:2};
  const {db}=stub(()=>({data:null}),(table,ops)=>{
   pages.push(ops);
   const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];
   return Array.from({length:Math.max(0,Math.min(totals[table],to+1)-from)},(_,i)=>table==='financial_metrics'?metric(from+i):table==='filings'?{filing_id:`f${from+i}`,value_text:'1',created_at:'2026-01-01T00:00:00+00:00'}:table==='fact_sync_scope'?scope(from+i):{fact_id:`a${from+i}`,value_text:'1',created_at:'2026-01-01T00:00:00+00:00'});
  },t=>totals[t]);
  const ranges=(from:number)=>pages.slice(from).map(ops=>ops.find(o=>o[0]==='range')![1]);
  const metrics=await db.metricsOfIssuer('iss','US','v');
  expect(metrics).toHaveLength(1005);expect(metrics[1004]).toMatchObject({metric:'m1004',based_on_rev:2});
  expect(pages[0]).toContainEqual(['eq',['formula_version','v']]);                       // filtered in the query, not after the read
  expect(ranges(0)).toEqual([[0,999],[1000,1999]]);                                      // full page → next page; short page → stop
  let n=pages.length;
  expect(await db.filingsOfIssuer('iss','US',{})).toHaveLength(1002);
  expect(ranges(n)).toEqual([[0,999],[1000,1999]]);
  expect(pages[n]).toContainEqual(['order',['available_date',{ascending:false}]]);
  n=pages.length;
  expect(await db.filingsOfIssuer('iss','US',{limit:3})).toHaveLength(3);
  expect(ranges(n)).toEqual([[0,2]]);                                                    // an explicit limit is a cap, not a page size
  n=pages.length;
  expect((await db.scopeRows('US',['i0','i1','i2'])).map(s=>s.issuer_id)).toEqual(['i0','i1','i2']);
  expect(pages[n]).toContainEqual(['in',['issuer_id',['i0','i1','i2']]]);
  expect(pages[n]).toContainEqual(['eq',['market','US']]);
  n=pages.length;
  expect(await db.factsByIds(['a0','a1'])).toHaveLength(2);
  expect(pages[n]).toContainEqual(['in',['fact_id',['a0','a1']]]);
  expect(await db.scopeRows('US',[])).toEqual([]);expect(await db.factsByIds([])).toEqual([]);
 });
 it('table reads normalise PostgREST timestamps (offset form, microseconds) to toISOString() form',async()=>{
  const {db}=stub(()=>({data:null}),table=>table==='filings'?[{filing_id:'f',created_at:'2030-01-01T00:00:00+00:00'}]
   :table==='financial_facts'?[{fact_id:'x',value_text:'1',created_at:'2030-01-01T00:00:00.123456+00:00'}]
   :[{issuer_id:'i',market:'US',reasons:[],priority:1,fetch_key:'k',next_due_at:'2030-01-01T00:00:00+00:00',lease_until:'2030-01-01T01:02:03.5+00:00',lease_batch_id:null,state_rev:'0',last_attempt_at:'2030-01-01T00:00:00.000001+00:00',last_success_at:null,last_batch_id:null,last_status:null}]);
  expect((await db.filingsOfIssuer('i','US',{}))[0].created_at).toBe('2030-01-01T00:00:00.000Z');
  expect((await db.factsByIds(['x']))[0].created_at).toBe('2030-01-01T00:00:00.123Z');
  expect((await db.scopeRows('US',['i']))[0]).toMatchObject({next_due_at:'2030-01-01T00:00:00.000Z',lease_until:'2030-01-01T01:02:03.500Z',last_attempt_at:'2030-01-01T00:00:00.000Z',last_success_at:null});
  expect((await db.scopeDue('US','2031-01-01T00:00:00.000Z',5))[0].next_due_at).toBe('2030-01-01T00:00:00.000Z');
 });
 it('metrics read: a replacement between pages (mixed based_on_rev or a short count) retries the whole read, persistent instability fails as metrics_unstable',async()=>{
  const row=(i:number,rev:number)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:rev,as_of:'2024-01-01'});
  const page=(from:number,to:number,rev:(from:number)=>number)=>Array.from({length:Math.max(0,Math.min(1005,to+1)-from)},(_,i)=>row(from+i,rev(from)));
  let reads=0;
  const flaky=stub(()=>({data:null}),(_t,ops)=>{
   const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];
   reads++;
   return page(from,to,f=>reads===2&&f===1000?3:2);                 // 2nd page of the 1st attempt comes from a newer revision
  },()=>1005);
  expect((await flaky.db.metricsOfIssuer('iss','US','v')).every(m=>m.based_on_rev===2)).toBe(true);
  expect(reads).toBe(4);                                              // 2 pages, retried once
  let n=0;
  const broken=stub(()=>({data:null}),(_t,ops)=>{
   const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];
   n++;return page(from,to,()=>2).slice(0,from===0?1000:4);          // 1005 counted, 1004 returned
  },()=>1005);
  await expect(broken.db.metricsOfIssuer('iss','US','v')).rejects.toMatchObject({code:'unknown',message:'metrics_unstable'});
  expect(n).toBe(6);                                                  // 3 attempts x 2 pages
 });
 it('calls the SQL functions with p_ arguments and chunks staging at 500 rows (an empty batch still calls once)',async()=>{
  const {calls,db}=stub((fn,args)=>fn==='stage_facts'?{data:(args.p_rows as unknown[]).length}:fn==='stage_filings'?{data:Object.fromEntries((args.p_rows as {source_ref:string;filing_id:string}[]).map(r=>[r.source_ref,r.filing_id]))}:{data:true});
  const iss=randomUUID();const f=filingInsert(iss);
  expect(await db.claimLease(iss,'US','b',600)).toBe(true);
  expect(calls[0]).toEqual({fn:'claim_fact_sync_lease',args:{p_issuer:iss,p_market:'US',p_batch:'b',p_ttl_seconds:600}});
  const rows=Array.from({length:1200},()=>factInsert(iss,f));
  expect(await db.stageFacts('run',rows)).toBe(1200);
  expect(calls.slice(1).map(c=>[c.fn,(c.args.p_rows as unknown[]).length])).toEqual([['stage_facts',500],['stage_facts',500],['stage_facts',200]]);
  expect(await db.stageFacts('run',[])).toBe(0);
  expect(calls.at(-1)).toEqual({fn:'stage_facts',args:{p_run:'run',p_rows:[]}});
  const m=await db.stageFilings('run',[f]);
  expect(m.get(f.sourceRef)).toBe(f.filing_id);
  expect(calls.at(-1)!.args.p_rows).toEqual([{filing_id:f.filing_id,source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-02-01',source_ref:f.sourceRef,url:null}]);
  await db.releaseLease(iss,'US','b','success','2030-01-01T00:00:00.000Z');
  expect(calls.at(-1)).toEqual({fn:'release_fact_sync_lease',args:{p_issuer:iss,p_market:'US',p_batch:'b',p_outcome:'success',p_next_due:'2030-01-01T00:00:00.000Z'}});
  await db.resolveFactsQuarantine('item',['a'],'admin');
  expect(calls.at(-1)).toEqual({fn:'resolve_facts_quarantine',args:{p_item:'item',p_chosen:['a'],p_resolved_by:'admin'}});
  await db.replaceMetrics(iss,'US',3,[{issuer_id:iss,market:'US',metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,as_of:'2024-01-01'}]);
  expect(calls.at(-1)!.args).toEqual({p_issuer:iss,p_market:'US',p_based_on_rev:3,p_rows:[{metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],as_of:'2024-01-01'}]});
 });
 it('stageFilings treats a source_ref missing from the returned map (owned by another issuer) as an error',async()=>{
  const {db}=stub(()=>({data:{}}));
  await expect(db.stageFilings('run',[filingInsert(randomUUID())])).rejects.toMatchObject({name:'FactsDbError',code:'unknown',message:expect.stringContaining('filing_not_staged')});
 });
 it('normalises the read_facts envelope: numeric state_rev, value from value_text, null sequence fields dropped',async()=>{
  const {calls,db}=stub(()=>({data:{state_rev:'7',truncated:false,row_count:2,rows:[{fact_id:'a',value:123,value_text:'123',disclosure_seq:1,is_current:true,is_revision:false},{fact_id:'b',value:1,value_text:'1.0',disclosure_seq:null,is_current:false,is_revision:false}]}}));
  const out=await db.readFacts('iss','US',{concepts:['revenue'],asOf:'2024-06-30',history:true});
  expect(calls[0]).toEqual({fn:'read_facts',args:{p_issuer:'iss',p_market:'US',p_concepts:['revenue'],p_as_of:'2024-06-30',p_from:null,p_to:null,p_history:true,p_limit:null,p_include_non_ok:false}});
  expect(out).toEqual({stateRev:7,truncated:false,rows:[{fact_id:'a',value:'123',value_text:'123',disclosure_seq:1,is_current:true,is_revision:false},{fact_id:'b',value:'1.0',value_text:'1.0',disclosure_seq:undefined,is_current:false,is_revision:false}]});
  const {db:t}=stub(()=>({data:{state_rev:9,truncated:true,row_count:0,rows:[]}}));
  expect(await t.readFacts('iss','US',{concepts:['revenue'],asOf:'2024-06-30'})).toEqual({stateRev:9,truncated:true,rows:[]});
 });
 it('maps PostgREST errors to FactsDbError codes',async()=>{
  const {db}=stub(fn=>({error:fn==='begin_sync_run'?{message:'lease_lost',code:'55P03'}:fn==='publish_sync_run'?{message:'mapping_gen_regression',code:'P0001'}:{message:'boom',code:'XX000'}}));
  await expect(db.beginRun('i','US','b',1)).rejects.toMatchObject({name:'FactsDbError',code:'lease_lost'});
  await expect(db.publishRun('r',[])).rejects.toMatchObject({code:'mapping_gen_regression'});
  await expect(db.abandonRun('r')).rejects.toMatchObject({code:'unknown',message:'boom'});
 });
});
