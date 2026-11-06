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
  for(const c of ['run_pending','run_published','mapping_gen_regression','stale_computation','stale_plan'])expect(toFactsDbError({message:c,code:'P0001'}).code).toBe(c);
  expect(toFactsDbError({message:'duplicate key value violates unique constraint "filings_pkey"',code:'23505'}).code).toBe('duplicate_key');
  expect(toFactsDbError({message:'item_not_open',code:'P0001'})).toMatchObject({code:'item_not_open',message:'item_not_open'});
  expect(toFactsDbError({message:undefined,code:undefined}).code).toBe('unknown');
  expect(toFactsDbError({message:'x'})).toBeInstanceOf(FactsDbError);
  for(const c of ['fence_failed','member_incomplete','stale_evaluation','batch_mismatch','invalid_choice','invalid_candidate','generation_moved','duplicate','conflict_exists','replay_required','filing_not_found','not_passing','lineage_changed','scope_missing','unresolved','acceptance_conflict','source_not_active','has_referrers','invalid_result'])
   expect(toFactsDbError({message:c,code:'P0001'}).code).toBe(c);
  expect(toFactsDbError({message:'topology_write_forbidden: issuers.status/merged_into change only through set_merge/set_dissolved',code:'23514'}).code).toBe('topology_write_forbidden');
  expect(toFactsDbError({message:'duplicate key value violates unique constraint "x"',code:'23505'}).code).toBe('duplicate_key');   // 23505 wins over the head word
  for(const c of ['use_dedicated_resolver','target_not_active','invalid_members'])expect(toFactsDbError({message:c,code:'22023'}).code).toBe(c);
  expect(toFactsDbError({message:'invalid_based_on',code:'22023'})).toMatchObject({code:'unknown',message:'invalid_based_on'});
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
  n=pages.length;
  expect((await db.scopeAll('US')).length).toBeGreaterThan(0);
  expect(pages[n]).toContainEqual(['eq',['market','US']]);expect(pages[n]).toContainEqual(['order',['issuer_id']]);
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
  await db.replaceMetrics(iss,'US',3,[{issuer_id:iss,market:'US',metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,based_on_lineage:[{issuer_id:iss,state_rev:3}],as_of:'2024-01-01'}]);
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
 it('publishRun passes the expected state_rev (null when absent)',async()=>{
  const {db,calls}=stub(()=>({data:1}));
  await db.publishRun('r',['f']);await db.publishRun('r',['f'],4);
  expect(calls.map(c=>c.args)).toEqual([{p_run:'r',p_manifest:['f'],p_expected_rev:null},{p_run:'r',p_manifest:['f'],p_expected_rev:4}]);
 });
 it('plan-3 RPCs: names and p_ arguments; envelopes normalised (lineage revs sorted and numeric, value from value_text, ISO timestamps)',async()=>{
  const I1='11111111-1111-4111-8111-111111111111',I2='22222222-2222-4222-8222-222222222222';
  const {calls,db}=stub(fn=>{
   if(fn==='read_facts_lineage')return {data:{state_revs:[{issuer_id:I2,state_rev:'4'},{issuer_id:I1,state_rev:3}],lineage:[I1,I2],truncated:false,row_count:1,rows:[{fact_id:'a',issuer_id:I2,value:7,value_text:'7.0',disclosure_seq:null,is_current:false,is_revision:false}],conflicts:[{key:{concept:'revenue'},available_date:'2024-02-01',fact_ids:['x','y']}]}};
   if(fn==='read_filing_facts')return {data:{rows:[{fact_id:'f',value:1,value_text:'1.50',run_status:'published',created_at:'2024-01-01 00:00:00+00'}]}};
   if(fn==='adopt_candidate')return {data:{fact_id:'nf',run_id:'nr',issuer_id:I1,market:'US'}};
   if(fn==='restore_reconciled')return {data:{promoted:'0',skipped:[{fact_id:'f',reason:'ineligible'}]}};
   if(fn==='resolve_lineage_conflict')return {data:{quarantined:2}};
   if(fn==='claim_reconcile_member')return {data:null};
   if(fn==='apply_reconcile_result')return {data:{reused:false,reconciliation_id:'r1',item_id:null,quarantined:1,materialize:{issuer_id:I1,market:'US'}}};
   if(fn==='complete_reconcile_member')return {data:{compared_passed:1,compared_failed:'0',not_compared:2}};
   if(fn==='set_merge')return {data:{repointed:'1'}};
   if(fn==='open_reconcile_cycle')return {data:{created:true,cycle:{pair:'facts.lineage_same_day',cycle_id:'c'},transferred:[{issuer_id:I1,market:'US',source:I2}]}};
   if(fn==='set_filing_acceptance')return {data:true};
   if(fn==='replace_financial_metrics_lineage')return {data:3};
   return {data:null};
  });
  expect(await db.readFactsLineage([I2,I1],'US',{concepts:['revenue'],asOf:'2030-01-01',history:true})).toEqual({stateRevs:[{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}],lineage:[I1,I2],
   rows:[{fact_id:'a',issuer_id:I2,value:'7.0',value_text:'7.0',disclosure_seq:undefined,is_current:false,is_revision:false}],conflicts:[{key:{concept:'revenue'},available_date:'2024-02-01',fact_ids:['x','y']}],truncated:false});
  expect(calls.at(-1)).toEqual({fn:'read_facts_lineage',args:{p_issuers:[I2,I1],p_market:'US',p_concepts:['revenue'],p_as_of:'2030-01-01',p_from:null,p_to:null,p_history:true,p_limit:null,p_include_non_ok:false}});
  expect(await db.stateRevs([I1,I2],'US')).toEqual([{issuer_id:I1,state_rev:3},{issuer_id:I2,state_rev:4}]);
  expect(calls.at(-1)!.args).toMatchObject({p_issuers:[I1,I2],p_concepts:[]});              // revs only: one snapshot, no rows
  expect(await db.stateRevs([],'US')).toEqual([]);
  expect(await db.readFilingFacts('g',true)).toEqual([{fact_id:'f',value:'1.50',value_text:'1.50',run_status:'published',created_at:'2024-01-01T00:00:00.000Z'}]);
  expect(calls.at(-1)).toEqual({fn:'read_filing_facts',args:{p_filing:'g',p_include_non_ok:true}});
  expect(await db.adoptCandidate('it',2,'b',5,'adm')).toEqual({factId:'nf',runId:'nr',issuerId:I1,market:'US'});
  expect(calls.at(-1)).toEqual({fn:'adopt_candidate',args:{p_item:'it',p_index:2,p_batch:'b',p_expected_rev:5,p_resolved_by:'adm'}});
  expect(await db.restoreReconciled('it','b','h','adm')).toEqual({promoted:0,skipped:[{fact_id:'f',reason:'ineligible'}]});
  expect(calls.at(-1)).toEqual({fn:'restore_reconciled',args:{p_item:'it',p_batch:'b',p_inputs_hash_now:'h',p_resolved_by:'adm'}});
  expect(await db.resolveLineageConflict('it','k','b','adm')).toEqual({quarantined:2});
  expect(calls.at(-1)).toEqual({fn:'resolve_lineage_conflict',args:{p_item:'it',p_keep:'k',p_batch:'b',p_resolved_by:'adm'}});
  expect(await db.claimReconcileMember('us.companyfacts_vs_ixbrl','c1',I1,'US','b')).toBeNull();
  expect(calls.at(-1)).toEqual({fn:'claim_reconcile_member',args:{p_pair:'us.companyfacts_vs_ixbrl',p_cycle_id:'c1',p_issuer:I1,p_market:'US',p_batch:'b'}});
  const fence={pair:'us.companyfacts_vs_ixbrl' as const,cycle_id:'c1',issuer_id:I1,market:'US' as const,batch_id:'b',attempt:1};
  const result={natural_key:'k',kind:'numeric' as const,outcome:'compared' as const,passed:false,left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',tolerance:'0',left_source:'l',right_source:'r',detail:{},action:'quarantine_left' as const,left_fact_id:'f',inputs_hash:'h'};
  expect(await db.applyReconcileResult(fence,result)).toEqual({reused:false,reconciliationId:'r1',itemId:null,quarantined:1,materialize:{issuerId:I1,market:'US'}});
  expect(calls.at(-1)).toEqual({fn:'apply_reconcile_result',args:{p_fence:fence,p_result:result}});
  expect(await db.completeReconcileMember(fence)).toEqual({compared_passed:1,compared_failed:0,not_compared:2});
  await db.failReconcileMember(fence,'boom');
  expect(calls.at(-1)).toEqual({fn:'fail_reconcile_member',args:{p_fence:fence,p_error:'boom'}});
  const open={pair:'facts.lineage_same_day' as const,cycleId:'c',startedAt:'2026-11-05T00:00:00.000Z',members:[{issuer_id:I1,market:'US' as const,expected_keys:[]}],pending:[{issuer_id:I1,market:'US' as const,source:I2}]};
  expect(await db.openReconcileCycle(open)).toEqual({created:true,cycle:{pair:'facts.lineage_same_day',cycle_id:'c'},transferred:[{issuer_id:I1,market:'US',source:I2}]});
  expect(calls.at(-1)).toEqual({fn:'open_reconcile_cycle',args:{p_pair:'facts.lineage_same_day',p_cycle_id:'c',p_started_at:'2026-11-05T00:00:00.000Z',p_members:open.members,p_pending:open.pending}});
  expect(await db.setMerge('s','t','adm')).toEqual({repointed:1});
  expect(calls.at(-1)).toEqual({fn:'set_merge',args:{p_source:'s',p_target:'t',p_resolved_by:'adm'}});
  await db.setDissolved('s','adm');
  expect(calls.at(-1)).toEqual({fn:'set_dissolved',args:{p_issuer:'s',p_resolved_by:'adm'}});
  expect(await db.setFilingAcceptance('g','2024-02-01T21:05:00.000Z','sec_submissions')).toBe(true);
  expect(calls.at(-1)).toEqual({fn:'set_filing_acceptance',args:{p_filing:'g',p_accepted:'2024-02-01T21:05:00.000Z',p_source:'sec_submissions'}});
  const m={issuer_id:I1,market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:3,based_on_lineage:[{issuer_id:I1,state_rev:3}],as_of:'2024-01-01'};
  expect(await db.replaceMetricsLineage(I1,'US',[{issuer_id:I1,state_rev:3}],[m])).toBe(3);
  expect(calls.at(-1)).toEqual({fn:'replace_financial_metrics_lineage',args:{p_issuer:I1,p_market:'US',p_based_on:[{issuer_id:I1,state_rev:3}],p_rows:[{metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],as_of:'2024-01-01'}]}});
 });
 it('plan-3 table reads: targetOf, lineageOf (target first, referrers ordered), findFilingBySourceRef, filingsForCalendar (complete set with run status, accepted_at ISO)',async()=>{
  const {db}=stub(()=>({data:null}),(table,ops)=>{
   if(table==='issuers'&&ops.some(o=>o[0]==='eq'&&o[1][0]==='issuer_id'))return [{merged_into:'T'}];
   if(table==='issuers')return [{issuer_id:'A'},{issuer_id:'B'}];
   if(table==='filings'&&ops.some(o=>o[0]==='eq'&&o[1][0]==='source_ref'))return [{filing_id:'g',accepted_at:'2024-02-01T21:05:00+00:00',acceptance_source:'sec_submissions',created_at:'2024-02-01T00:00:00+00:00'}];
   if(table==='filings')return [{filing_id:'g1',run_id:'r1',period_end:'2024-03-31',accepted_at:null,created_at:'2024-02-01T00:00:00+00:00'}];
   if(table==='fact_sync_runs')return [{run_id:'r1',status:'published'}];
   return [];
  });
  expect(await db.targetOf('S')).toBe('T');
  expect(await db.lineageOf('T')).toEqual(['T','A','B']);
  expect(await db.findFilingBySourceRef('edgar','0000320193-24-000123')).toMatchObject({filing_id:'g',accepted_at:'2024-02-01T21:05:00.000Z',acceptance_source:'sec_submissions'});
  expect(await db.filingsForCalendar('I','US',{fromPeriodEnd:'2024-01-01'})).toEqual([expect.objectContaining({filing_id:'g1',run_status:'published',accepted_at:null,acceptance_source:null})]);
 });
 it('filingsForCalendar: >1,000 filings over many run-id chunks, filters pushed into the query; every eligible filing keeps its run status and mapping_gen',async()=>{
  const N=1250;const status=(i:number)=>['published','staged','abandoned'][i%3];
  const mk=(i:number,over:Record<string,unknown>={})=>({filing_id:`g${String(i).padStart(5,'0')}`,issuer_id:'I',market:'US',run_id:`r${i}`,period_end:`2024-${String(1+i%12).padStart(2,'0')}-28`,available_date:'2024-06-01',mapping_gen:i%4,created_at:'2024-06-01T00:00:00+00:00',accepted_at:null,...over});
  const all=[...Array.from({length:N},(_,i)=>mk(i)),mk(5000,{issuer_id:'OTHER'}),mk(5001,{market:'CN'}),mk(5002,{period_end:'2023-12-31'})];
  const runIn:number[]=[];let filingPages=0;
  const {db}=stub(()=>({data:null}),(table,ops)=>{
   const eq=(c:string)=>ops.filter(o=>o[0]==='eq'&&o[1][0]===c).map(o=>o[1][1]);
   if(table==='filings'){
    const after=ops.filter(o=>o[0]==='gt'&&o[1][0]==='filing_id').map(o=>String(o[1][1]));
    const limit=Number(ops.find(o=>o[0]==='limit')![1][0]);
    expect(ops.some(o=>o[0]==='order'&&o[1][0]==='filing_id')).toBe(true);
    const rows=all.filter(r=>eq('issuer_id').every(v=>r.issuer_id===v)&&eq('market').every(v=>r.market===v)&&ops.filter(o=>o[0]==='gte').every(o=>String(r.period_end)>=String(o[1][1]))&&after.every(a=>r.filing_id>a))
     .sort((a,b)=>a.filing_id<b.filing_id?-1:1);
    filingPages++;
    return rows.slice(0,limit);
   }
   if(table==='fact_sync_runs'){
    const ids=ops.find(o=>o[0]==='in')![1][1] as string[];runIn.push(ids.length);
    const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];
    return ids.map(id=>({run_id:id,status:status(Number(id.slice(1)))})).slice(from,to+1);
   }
   return [];
  });
  const out=await db.filingsForCalendar('I','US',{fromPeriodEnd:'2024-01-01'});
  expect(out).toHaveLength(N);
  expect(new Set(out.map(f=>f.filing_id)).size).toBe(N);
  expect(out.some(f=>f.issuer_id!=='I'||f.market!=='US'||(f.period_end??'')<'2024-01-01')).toBe(false);
  expect(filingPages).toBe(2);                                                          // 1,000 + 250: keyset pages
  expect(out.map(f=>[f.period_end,f.available_date,f.filing_id])).toEqual([...out.map(f=>[f.period_end,f.available_date,f.filing_id])].sort());
  expect(runIn.length).toBeGreaterThan(1);expect(Math.max(...runIn)).toBeLessThanOrEqual(200);
  for(const f of out){const i=Number(f.filing_id.slice(1));expect(f.run_status).toBe(status(i));expect(f.mapping_gen).toBe(i%4);expect(f.run_id).toBe(`r${i}`);}
 });
 it('filingsForCalendar omits a filing whose run row is missing; a keyset page that repeats a row is deduped',async()=>{
  const g=(id:string,run:string)=>({filing_id:id,issuer_id:'I',market:'US',run_id:run,period_end:'2024-03-31',available_date:'2024-05-01',created_at:'2024-05-01T00:00:00+00:00'});
  const {db}=stub(()=>({data:null}),table=>table==='filings'?[g('g1','r1'),g('g1','r1'),g('g2','gone')]:table==='fact_sync_runs'?[{run_id:'r1',status:'published'}]:[]);
  expect((await db.filingsForCalendar('I','US',{fromPeriodEnd:'2024-01-01'})).map(f=>[f.filing_id,f.run_status])).toEqual([['g1','published']]);
 });
 it('malformed reconcile envelopes throw instead of becoming NaN / undefined fields',async()=>{
  const {db}=stub(fn=>({data:fn==='apply_reconcile_result'?{reused:false}:fn==='complete_reconcile_member'?{compared_passed:'x',compared_failed:0,not_compared:0}:null}));
  const fence={pair:'us.companyfacts_vs_ixbrl' as const,cycle_id:'c',issuer_id:'i',market:'US' as const,batch_id:'b',attempt:1};
  await expect(db.applyReconcileResult(fence,{} as never)).rejects.toMatchObject({code:'unknown',message:expect.stringContaining('malformed')});
  await expect(db.completeReconcileMember(fence)).rejects.toMatchObject({code:'unknown',message:expect.stringContaining('malformed')});
 });
 it('metrics read compares the full based_on_lineage vector across pages: one rev but two vectors is unstable',async()=>{
  const row=(i:number,lineage:unknown)=>({issuer_id:'iss',market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:1,value_text:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:2,based_on_lineage:lineage,as_of:'2024-01-01'});
  const a=[{issuer_id:'iss',state_rev:2}],b=[{issuer_id:'iss',state_rev:2},{issuer_id:'src',state_rev:5}];
  const {db}=stub(()=>({data:null}),(_t,ops)=>{const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];return Array.from({length:Math.min(1001,to+1)-from},(_,k)=>row(from+k,from+k<1000?a:b));},()=>1001);
  await expect(db.metricsOfIssuer('iss','US','v')).rejects.toMatchObject({message:'metrics_unstable'});
  const ok=stub(()=>({data:null}),(_t,ops)=>{const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];return Array.from({length:Math.min(2,to+1)-from},(_,k)=>row(from+k,b));},()=>2);
  expect((await ok.db.metricsOfIssuer('iss','US','v')).map(m=>m.based_on_lineage)).toEqual([[{issuer_id:'iss',state_rev:2},{issuer_id:'src',state_rev:5}],[{issuer_id:'iss',state_rev:2},{issuer_id:'src',state_rev:5}]]);
 });
});

describe('memoryFactsDb plan-3 specifics',()=>{
 it('topology helper, targetOf, stateRevs order; setMerge registers the target on the latest lineage cycle; the plan-2 wrapper keeps "no scope ⇒ rev 0"',async()=>{
  const db=memoryFactsDb();const [a,b,c]=['a','b','c'].map(x=>`${x}0000000-0000-4000-8000-000000000000`);
  db.setTopology({[a]:{status:'merged',merged_into:c},[b]:{status:'merged',merged_into:c}});
  expect(await db.lineageOf(c)).toEqual([c,a,b]);expect(await db.targetOf(a)).toBe(c);expect(await db.targetOf(c)).toBe(c);expect(await db.targetOf('unknown')).toBe('unknown');
  expect(await db.stateRevs([c,a,a],'US')).toEqual([{issuer_id:a,state_rev:0},{issuer_id:c,state_rev:0}]);
  await db.tables.insert('dq_reconcile_cycles',{pair:'facts.lineage_same_day',cycle_id:'old',status:'complete',started_at:'2026-01-01T00:00:00.000Z',detail:{}});
  await db.tables.insert('dq_reconcile_cycles',{pair:'facts.lineage_same_day',cycle_id:'new',status:'complete',started_at:'2026-02-01T00:00:00.000Z',detail:{pending_members:[{issuer_id:c,market:'US',source:'earlier-source'}]}});
  const s=`d0000000-0000-4000-8000-000000000000`;
  expect(await db.setMerge(s,c,'adm')).toEqual({repointed:0});
  const cycles=await db.tables.select('dq_reconcile_cycles',{pair:'facts.lineage_same_day'});
  expect(cycles.find(x=>x.cycle_id==='new')!.detail).toEqual({pending_members:[{issuer_id:c,market:'US',source:'earlier-source'},{issuer_id:c,market:'CN',source:s},{issuer_id:c,market:'US',source:s}]});   // one entry per merged source (plan audit Q2)
  expect(cycles.find(x=>x.cycle_id==='old')!.detail).toEqual({});
  expect(db.scope().filter(x=>x.issuer_id===s).map(x=>[x.market,x.priority,x.fetch_key,x.state_rev]).sort()).toEqual([['CN',0,'topology',1],['US',0,'topology',1]]);
  const m={issuer_id:'z',market:'US' as const,metric:'m',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M' as const,value:'1',unit:'u',input_unit:'USD',basis:'us_standard',formula_version:'v',inputs:[],based_on_rev:0,based_on_lineage:[{issuer_id:'z',state_rev:0}],as_of:'2024-01-01'};
  await expect(db.replaceMetrics('z','US',0,[m])).rejects.toMatchObject({code:'scope_missing'});
  await expect(db.replaceMetrics('z','US',1,[m])).rejects.toMatchObject({code:'stale_computation'});
 });
 it('filings carry accepted_at/acceptance_source = null until setFilingAcceptance; readFilingFacts lists every generation with the run status',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
  expect((await db.filingsOfIssuer(iss,'US',{}))[0]).toMatchObject({accepted_at:null,acceptance_source:null});
  const x=factInsert(iss,f);await db.stageFacts(run,[x]);
  expect(await db.readFilingFacts(f.filing_id,true)).toEqual([expect.objectContaining({fact_id:x.fact_id,status:'staged',run_status:'staged'})]);
  expect(await db.readFilingFacts(f.filing_id,false)).toEqual([]);
  await expect(db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00Z','other' as 'sec_submissions')).rejects.toMatchObject({message:'invalid_acceptance'});
  expect(await db.setFilingAcceptance(f.filing_id,'2024-02-01T21:05:00Z','sec_submissions')).toBe(true);
  expect((await db.findFilingBySourceRef('edgar',f.sourceRef))!.accepted_at).toBe('2024-02-01T21:05:00.000Z');
 });
});

describe('memoryFactsDb applyReconcileResult side constraints',()=>{
 const setup=async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await db.claimLease(iss,'US',b,60);
  const run=await db.beginRun(iss,'US',b,1);const f=filingInsert(iss);await db.stageFilings(run,[f]);
  const x=factInsert(iss,f);await db.stageFacts(run,[x]);await db.publishRun(run,[f.filing_id]);
  const pair='facts.lineage_same_day' as const;
  const keys=['k1','k2','k3'];
  await db.openReconcileCycle({pair,cycleId:'c1',startedAt:'2026-01-01T00:00:00.000Z',members:[{issuer_id:iss,market:'US',expected_keys:keys.map(naturalKey=>({naturalKey,locator:{}}))}],pending:[]});
  const fence=(await db.claimReconcileMember(pair,'c1',iss,'US',randomUUID()))!;
  const res=(over:Record<string,unknown>)=>({natural_key:'k1',kind:'numeric' as const,outcome:'compared' as const,passed:false,left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',tolerance:'0',left_source:'l',right_source:'r',detail:{},action:'quarantine_left' as const,left_fact_id:x.fact_id,inputs_hash:'h',...over});
  return {db,fence,res,x};
 };
 it('rejects result rows the SQL check constraints refuse, before any mutation',async()=>{
  const {db,fence,res,x}=await setup();
  const untouched=async()=>{
   expect(await db.tables.select('dq_reconciliations',{})).toEqual([]);
   expect(await db.tables.select('dq_quarantine',{})).toEqual([]);
   expect(db.facts().find(f=>f.fact_id===x.fact_id)!.status).toBe('ok');
   expect(db.scope()[0].state_rev).toBe(1);
  };
  await expect(db.applyReconcileResult(fence,res({right_value:null}))).rejects.toMatchObject({code:'invalid_result'});
  await expect(db.applyReconcileResult(fence,res({left_value:null}))).rejects.toMatchObject({code:'invalid_result'});
  await expect(db.applyReconcileResult(fence,res({kind:'text',left_value:'1',right_value:null,abs_diff:null,rel_diff:null}))).rejects.toMatchObject({code:'invalid_result'});
  await expect(db.applyReconcileResult(fence,res({kind:'date',left_value:null,right_value:null,abs_diff:'1',rel_diff:null}))).rejects.toMatchObject({code:'invalid_result'});
  await expect(db.applyReconcileResult(fence,res({kind:'text',left_value:null,right_value:null,abs_diff:null,rel_diff:'0'}))).rejects.toMatchObject({code:'invalid_result'});
  await untouched();
  // allowed shapes: a non-compared numeric outcome may carry null sides; a text compare carries only detail
  expect((await db.applyReconcileResult(fence,res({natural_key:'k2',outcome:'right_missing',left_value:null,right_value:null,abs_diff:null,rel_diff:null,action:'record'}))).reused).toBe(false);
  expect((await db.applyReconcileResult(fence,res({natural_key:'k3',kind:'text',left_value:null,right_value:null,abs_diff:null,rel_diff:null,passed:true,action:'record'}))).reused).toBe(false);
 });
});
