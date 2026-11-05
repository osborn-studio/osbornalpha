// src/lib/facts/db-contract.ts
// Shared FactsDb contract (spec §4.5–§4.8, §5.3, §5.4): the same scenarios run against
// memoryFactsDb (db.test.ts) and pgFactsDb (facts.integration.test.ts), so the in-memory rules the
// unit tests rely on are exactly the SQL functions' rules. Not a test file: it registers
// describe/it only when called. dq_quarantine items are created with plan-1 quarantine() on the
// harness TableClient, the way sync.ts will.
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {TableClient} from '../db/table-client';
import {quarantine} from '../dq/quarantine';
import {FactsDbError} from './types';
import type {FactInsert,FactsDb,FilingInsert,Market,MetricRow} from './types';

export interface ContractHarness{
 db:FactsDb;tables:TableClient;
 issuer():Promise<string>;batch():Promise<string>;
 expireLease(issuer:string,market:Market):Promise<void>;
 close?():Promise<void>;
}
export function filingInsert(issuer:string,o:Partial<FilingInsert>={}):FilingInsert{
 return {filing_id:randomUUID(),issuer_id:issuer,sourceRef:randomUUID(),market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-12-31',availableDate:'2024-02-01',url:null,...o};
}
export function factInsert(issuer:string,filing:FilingInsert,o:Partial<FactInsert>={}):FactInsert{
 return {fact_id:randomUUID(),issuer_id:issuer,market:'US',filing_id:filing.filing_id,concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'100',unit:'USD',consolidation:'consolidated',available_date:filing.availableDate,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'h',...o};
}
/** 'code:message' of a FactsDbError rejection, 'resolved' when it did not reject. */
const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof FactsDbError?`${e.code}:${e.message}`:`not_facts_db_error:${String(e)}`);

export function factsDbContract(label:string,setup:()=>Promise<ContractHarness>):void{
 describe(label,()=>{
  let h:ContractHarness;let db:FactsDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const ready=async()=>{
   const iss=await h.issuer();const b=await h.batch();
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(1);
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);
   return {iss,b};
  };
  const conflict=(iss:string,b:string,run:string,ids:string[],date='2024-02-01')=>quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,reasonCode:'same_day_conflict',batchId:b,
   payload:{key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:date},fact_ids:ids,values:[],run_id:run}});
  const item=async(id:string)=>{const [r]=await h.tables.select('dq_quarantine',{id});return {status:r.status,fact_ids:(r.payload as {fact_ids:string[]}).fact_ids,chosen:(r.detail as {chosen_fact_ids?:string[]}).chosen_fact_ids??null};};
  const statusOf=async(id:string)=>(await db.factsByIds([id]))[0]?.status??null;
  const current=(iss:string,concepts=['revenue'],history=true)=>db.readFacts(iss,'US',{concepts,asOf:'2030-01-01',history});
  /** A published run: f0 (2024-01-01) carries r0 = 90, f (2024-02-01) carries r = 100, same key. state_rev 1. */
  const published=async()=>{
   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);
   const f0=filingInsert(iss,{availableDate:'2024-01-01'});const f=filingInsert(iss);
   const m=await db.stageFilings(run,[f0,f]);
   expect(m.get(f0.sourceRef)).toBe(f0.filing_id);expect(m.get(f.sourceRef)).toBe(f.filing_id);expect(m.size).toBe(2);
   const r0=factInsert(iss,f0,{value:'90'});const r=factInsert(iss,f);
   expect(await db.stageFacts(run,[r0,r])).toBe(2);
   expect(await db.publishRun(run,[f0.filing_id,f.filing_id])).toBe(2);
   return {iss,b,run,f0,f,r0:r0.fact_id,r:r.fact_id};
  };

  it('lease: exclusive, renewable by the holder, lost after expiry; release needs the holder and sets the schedule',async()=>{
   const {iss,b}=await ready();const b2=await h.batch();
   expect(await db.claimLease(randomUUID(),'US',b,600)).toBe(false);          // no scope row
   expect(await db.claimLease(iss,'US',b2,600)).toBe(false);
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);                     // renew
   await h.expireLease(iss,'US');
   expect(await db.claimLease(iss,'US',b2,600)).toBe(true);
   expect(await code(db.beginRun(iss,'US',b,1))).toBe('lease_lost:lease_lost');
   expect(await code(db.releaseLease(iss,'US',b,'failed','2030-01-01T00:00:00.000Z'))).toBe('lease_lost:lease_lost');
   await db.releaseLease(iss,'US',b2,'success','2030-01-01T00:00:00.000Z');
   const due=(at:string)=>db.scopeDue('US',at,1000).then(rows=>rows.find(x=>x.issuer_id===iss));
   expect(await due('2029-12-31T23:59:59.000Z')).toBeUndefined();
   expect(await due('2030-01-01T00:00:00.000Z')).toMatchObject({issuer_id:iss,market:'US',lease_until:null,lease_batch_id:null,last_status:'success',last_batch_id:b2,state_rev:0,priority:10});
   expect(await db.claimLease(iss,'US',b,600)).toBe(true);                     // released → claimable again
  });

  it('runs: begin abandons staged runs and prunes empty gen-0 filings; stage dedupes; abandon refuses published runs; closed runs refuse writes',async()=>{
   const {iss,b,run,f0,f,r0,r}=await published();
   const run2=await db.beginRun(iss,'US',b,1);
   const f2=filingInsert(iss);const m=await db.stageFilings(run2,[f,f2]);
   expect(m.get(f.sourceRef)).toBe(f.filing_id);expect(m.get(f2.sourceRef)).toBe(f2.filing_id);
   expect(await db.stageFacts(run2,[factInsert(iss,f)])).toBe(0);              // same candidate key → not written
   const x=factInsert(iss,f2,{value:'7'});expect(await db.stageFacts(run2,[x])).toBe(1);
   expect(await statusOf(x.fact_id)).toBe('staged');
   expect((await current(iss)).rows.map(y=>y.fact_id)).toEqual([r0,r]);
   const run3=await db.beginRun(iss,'US',b,1);                                  // abandons run2
   expect(await statusOf(x.fact_id)).toBeNull();
   expect((await db.filingsOfIssuer(iss,'US',{})).map(g=>g.filing_id).sort()).toEqual([f0.filing_id,f.filing_id].sort());
   expect(await code(db.abandonRun(run))).toBe('run_published:run_published');
   await db.abandonRun(run3);await db.abandonRun(run3);
   expect(await code(db.stageFacts(run3,[]))).toBe('run_abandoned:run_abandoned');
   expect(await code(db.stageFacts(run,[]))).toBe('run_published:run_published');
   expect(await code(db.publishRun(randomUUID(),[]))).toBe('unknown:run_not_found');
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2024-01-15'})).rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current])).toEqual([[r0,1,true]]);
   expect((await current(iss)).rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current,y.is_revision])).toEqual([[r0,1,false,false],[r,2,true,true]]);
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await current(iss)).stateRev).toBe(1);
  });

  it('generations: publish activates manifest filings, refuses a regression, keeps old-generation rows as evidence',async()=>{
   const {iss,b,f,r0,r}=await published();
   const run2=await db.beginRun(iss,'US',b,2);const a2=factInsert(iss,f,{value:'101'});
   expect(await db.stageFacts(run2,[a2])).toBe(1);expect(await db.publishRun(run2,[f.filing_id])).toBe(1);
   expect((await current(iss)).rows.map(y=>[y.fact_id,y.is_revision])).toEqual([[r0,false],[a2.fact_id,true]]);
   expect((await db.factsByIds([r,a2.fact_id])).map(y=>y.status)).toEqual(['ok','ok']);
   const run3=await db.beginRun(iss,'US',b,1);const a3=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT'});
   expect(await db.stageFacts(run3,[a3])).toBe(1);
   expect(await code(db.publishRun(run3,[f.filing_id]))).toBe('mapping_gen_regression:mapping_gen_regression');
   expect(await statusOf(a3.fact_id)).toBe('staged');
   expect((await current(iss)).stateRev).toBe(2);
  });

  it('publish with expectedRev: a promotion after planning makes the plan stale (stale_plan, nothing published); the current rev publishes (round-3 P1)',async()=>{
   const {iss,b}=await published();
   const run2=await db.beginRun(iss,'US',b,1);const fq=filingInsert(iss,{availableDate:'2024-03-01'});await db.stageFilings(run2,[fq]);
   const qd=factInsert(iss,fq,{value:'100'});await db.stageFacts(run2,[qd]);
   const itemId=await conflict(iss,b,run2,[qd.fact_id],'2024-03-01');await db.quarantineFacts(run2,[qd.fact_id],itemId);
   expect(await db.publishRun(run2,[fq.filing_id],1)).toBe(0);                          // matching rev publishes; the parked row stays out
   const planned=(await current(iss)).stateRev;expect(planned).toBe(2);                 // the plan is made here: qd is not ok, so a different same-day value looks conflict-free
   const run3=await db.beginRun(iss,'US',b,1);const f3=filingInsert(iss,{availableDate:'2024-03-01'});await db.stageFilings(run3,[f3]);
   const a3=factInsert(iss,f3,{value:'200'});await db.stageFacts(run3,[a3]);
   expect(await db.resolveFactsQuarantine(itemId,[qd.fact_id],randomUUID())).toMatchObject({promoted:1,skipped:0});   // admin promotes qd after planning
   expect(await code(db.publishRun(run3,[f3.filing_id],planned))).toBe('stale_plan:stale_plan');
   expect(await statusOf(a3.fact_id)).toBe('staged');expect(await statusOf(qd.fact_id)).toBe('ok');
   expect(await db.publishRun(run3,[f3.filing_id],planned+1)).toBe(1);
  });

  it('same-day conflict: register, abandon, retry, publish; resolve is run_pending until publish; the verdict promotes chosen rows and binds the rest',async()=>{
   const {iss,b,r0,r}=await published();
   const runB=await db.beginRun(iss,'US',b,1);const fb=filingInsert(iss);await db.stageFilings(runB,[fb]);
   const c=factInsert(iss,fb,{value:'200'});await db.stageFacts(runB,[c]);
   const itemId=await conflict(iss,b,runB,[c.fact_id,r]);
   expect(await db.quarantineFacts(runB,[c.fact_id],itemId)).toBe(1);
   expect((await db.openConflicts(iss,'US')).map(i=>({id:i.id,fact_ids:i.fact_ids,available_date:i.available_date,concept:i.key.concept}))).toEqual([{id:itemId,fact_ids:[c.fact_id,r],available_date:'2024-02-01',concept:'revenue'}]);
   await db.abandonRun(runB);
   expect(await statusOf(r)).toBe('ok');expect(await statusOf(c.fact_id)).toBeNull();expect((await item(itemId)).status).toBe('open');
   const runC=await db.beginRun(iss,'US',b,1);const fc=filingInsert(iss);await db.stageFilings(runC,[fc]);
   const c2=factInsert(iss,fc,{value:'200'});await db.stageFacts(runC,[c2]);
   expect(await code(db.quarantineFacts(runC,[c2.fact_id],randomUUID()))).toBe('item_not_open:item_not_open');
   expect(await db.quarantineFacts(runC,[c2.fact_id,c2.fact_id],itemId)).toBe(1);
   expect((await item(itemId)).fact_ids).toEqual([c.fact_id,r,c2.fact_id]);
   expect(await code(db.resolveFactsQuarantine(itemId,[r],randomUUID()))).toBe('run_pending:run_pending');
   expect((await item(itemId)).status).toBe('open');
   expect(await db.publishRun(runC,[fc.filing_id])).toBe(0);
   expect(await statusOf(r)).toBe('quarantined');expect(await statusOf(c2.fact_id)).toBe('quarantined');
   expect((await current(iss,['revenue'],false)).rows.map(y=>[y.fact_id,y.value])).toEqual([[r0,'90']]);
   expect(await code(db.resolveFactsQuarantine(itemId,[randomUUID()],randomUUID()))).toBe('invalid_chosen:invalid_chosen');
   expect(await db.resolveFactsQuarantine(itemId,[r],randomUUID())).toMatchObject({promoted:1,skipped:0});
   expect(await item(itemId)).toEqual({status:'resolved_accept',fact_ids:[c.fact_id,r,c2.fact_id],chosen:[r]});
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await current(iss)).stateRev).toBe(3);
   expect(await db.openConflicts(iss,'US')).toEqual([]);
   const other=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{},fact_ids:[c2.fact_id],run_id:runC}});
   expect(await db.resolveFactsQuarantine(other,[],randomUUID())).toMatchObject({promoted:0,skipped:1});
   expect(await statusOf(c2.fact_id)).toBe('quarantined');
   expect(await code(db.resolveFactsQuarantine(other,[],randomUUID()))).toBe('item_not_open:item_not_open');
  });

  it('resolve: chosen rows with differing values are invalid_chosen; an item of another table is not open',async()=>{
   const {iss,b,r}=await published();
   const runB=await db.beginRun(iss,'US',b,1);const fb=filingInsert(iss);await db.stageFilings(runB,[fb]);
   const c=factInsert(iss,fb,{value:'200'});await db.stageFacts(runB,[c]);
   const itemId=await conflict(iss,b,runB,[c.fact_id,r]);await db.quarantineFacts(runB,[c.fact_id],itemId);
   expect(await db.publishRun(runB,[fb.filing_id])).toBe(0);
   expect(await code(db.resolveFactsQuarantine(itemId,[c.fact_id,r],randomUUID()))).toBe('invalid_chosen:invalid_chosen');   // 200 vs 100
   expect((await item(itemId)).status).toBe('open');
   expect(await db.resolveFactsQuarantine(itemId,[c.fact_id],randomUUID())).toMatchObject({promoted:1,skipped:0,chosenFactIds:[c.fact_id]});
   // the committed verdict and a durable pending hook land in the same transaction (review round: Codex P1)
   const [done]=await h.tables.select('dq_quarantine',{id:itemId});
   expect((done.detail as {chosen_fact_ids:string[]}).chosen_fact_ids).toEqual([c.fact_id]);
   expect((done.detail as {hook:{stage:string;state:string;at:string}}).hook).toMatchObject({stage:'materialize',state:'pending'});
   const foreign=await quarantine(h.tables,{dataset:'facts.us',table:'other_table',naturalKey:`${iss}:US:${randomUUID()}`,reasonCode:'same_day_conflict',batchId:b,payload:{key:{},fact_ids:[],run_id:runB}});
   expect(await code(db.resolveFactsQuarantine(foreign,[],randomUUID()))).toBe('item_not_open:item_not_open');
   expect((await item(foreign)).status).toBe('open');
  });

  it('ordering: equal-day disclosures tie-break by created_at then fact_id (rows of one stageFacts call share created_at, so the larger fact_id is current)',async()=>{
   const {iss,b}=await ready();const run=await db.beginRun(iss,'US',b,1);
   const fa=filingInsert(iss);const fb=filingInsert(iss);await db.stageFilings(run,[fa,fb]);
   const [lo,hi]=[randomUUID(),randomUUID()].sort();
   const opts={concept:'net_income',value:'5'};
   expect(await db.stageFacts(run,[factInsert(iss,fa,{...opts,fact_id:hi}),factInsert(iss,fb,{...opts,fact_id:lo})])).toBe(2);   // larger id inserted first
   expect(await db.publishRun(run,[fa.filing_id,fb.filing_id])).toBe(2);
   expect((await current(iss,['net_income'])).rows.map(y=>[y.fact_id,y.disclosure_seq,y.is_current,y.is_revision])).toEqual([[lo,1,false,false],[hi,2,true,false]]);
  });

  it('duplicate keys: a filing_id reused with another source_ref and a repeated metric primary key are duplicate_key and leave state unchanged',async()=>{
   const {iss,b,f,r}=await (async()=>{const x=await published();return {...x};})();
   const run=await db.beginRun(iss,'US',b,1);
   expect((await code(db.stageFilings(run,[filingInsert(iss,{filing_id:f.filing_id})]))).startsWith('duplicate_key')).toBe(true);
   await db.abandonRun(run);
   const row=(v:string):MetricRow=>({issuer_id:iss,market:'US',metric:'gross_margin',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,as_of:'2024-03-01'});
   expect(await db.replaceMetrics(iss,'US',1,[row('0.5')])).toBe(1);
   expect((await code(db.replaceMetrics(iss,'US',1,[row('0.6'),row('0.7')]))).startsWith('duplicate_key')).toBe(true);
   expect((await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).map(m=>m.value)).toEqual(['0.5']);
  });

  it('stageFilings: a source_ref already owned by another issuer is an error, never a silent skip, and the owner keeps its row',async()=>{
   const {iss,f}=await published();
   const {iss:other,b:bo}=await ready();
   const run=await db.beginRun(other,'US',bo,1);
   expect((await code(db.stageFilings(run,[filingInsert(other,{sourceRef:f.sourceRef})]))).startsWith('unknown:filing_not_staged')).toBe(true);
   expect((await db.filingsOfIssuer(iss,'US',{})).map(g=>g.filing_id)).toContain(f.filing_id);
   expect((await db.filingsOfIssuer(other,'US',{})).filter(g=>g.source_ref===f.sourceRef)).toEqual([]);
  });

  it('stageFilings validates the whole batch: a reused filing_id with a new source_ref rejects the call and writes nothing; factsByIds is deduped and ordered',async()=>{
   const {iss,b,f,r0,r}=await published();
   const run=await db.beginRun(iss,'US',b,1);
   const fresh=filingInsert(iss);
   expect((await code(db.stageFilings(run,[fresh,filingInsert(iss,{filing_id:f.filing_id})]))).startsWith('duplicate_key')).toBe(true);
   expect((await db.filingsOfIssuer(iss,'US',{})).some(g=>g.filing_id===fresh.filing_id)).toBe(false);
   const ids=[r0,r].sort();
   expect((await db.factsByIds([ids[1],ids[0],ids[1],randomUUID()])).map(y=>y.fact_id)).toEqual(ids);
  });

  it('metrics: stale based_on_rev is refused after publish; replacement is per issuer and atomic; metricsOfIssuer filters by formula version',async()=>{
   const {iss,b,r}=await published();
   const row=(v:string,metric='gross_margin'):MetricRow=>({issuer_id:iss,market:'US',metric,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:0,as_of:'2024-03-01'});
   expect(await code(db.replaceMetrics(iss,'US',0,[row('0.5')]))).toBe('stale_computation:stale_computation');
   expect(await db.replaceMetrics(iss,'US',1,[row('0.5')])).toBe(1);
   const run=await db.beginRun(iss,'US',b,1);expect(await db.publishRun(run,[])).toBe(0);   // empty run still advances state_rev
   expect(await code(db.replaceMetrics(iss,'US',1,[row('0.6')]))).toBe('stale_computation:stale_computation');
   expect(await db.replaceMetrics(iss,'US',2,[row('0.6'),row('0.7','net_margin')])).toBe(2);
   expect((await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).map(m=>[m.metric,m.value,m.based_on_rev,m.inputs[0].fact_id,m.as_of])).toEqual([['gross_margin','0.6',2,r,'2024-03-01'],['net_margin','0.7',2,r,'2024-03-01']]);
   expect(await db.metricsOfIssuer(iss,'US','facts-derive/0.9')).toEqual([]);
   expect(await db.replaceMetrics(iss,'US',2,[])).toBe(0);
   expect(await db.metricsOfIssuer(iss,'US','facts-derive/1.0')).toEqual([]);
   expect(await code(db.replaceMetrics(randomUUID(),'US',1,[]))).toBe('stale_computation:stale_computation');   // no scope row ⇒ rev 0
  });

  it('reads: key ranking and limit, from/to, asOf, non-ok rows without sequence, factsByIds, filings and links, scope reconcile and due',async()=>{
   const {iss,b,run,f0,f,r0,r}=await published();
   const run1=await db.beginRun(iss,'US',b,1);
   const t1=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT',period_end:'2023-12-31',value:'1'});
   const t2=factInsert(iss,f,{concept:'total_assets',statement:'BS',period_start:null,duration:'INSTANT',period_end:'2023-09-30',value:'2'});
   expect(await db.stageFacts(run1,[t1,t2])).toBe(2);await db.publishRun(run1,[f.filing_id]);
   const all=await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true});
   expect(all.rows.map(y=>y.fact_id)).toEqual([r0,r,t1.fact_id,t2.fact_id]);                       // period_end desc, concept asc, then disclosure order
   expect((await db.readFacts(iss,'US',{concepts:['revenue','total_assets'],asOf:'2030-01-01',history:true,limit:2})).rows.map(y=>y.fact_id)).toEqual([r0,r,t1.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['total_assets'],asOf:'2030-01-01',from:'2023-10-01'})).rows.map(y=>y.fact_id)).toEqual([t1.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['total_assets'],asOf:'2030-01-01',to:'2023-09-30'})).rows.map(y=>y.fact_id)).toEqual([t2.fact_id]);
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2023-12-31'})).rows).toEqual([]);
   expect((await db.readFacts(iss,'US',{concepts:['nope'],asOf:'2030-01-01'})).rows).toEqual([]);
   const [row]=(await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:false})).rows;
   expect(row).toMatchObject({fact_id:r,issuer_id:iss,market:'US',run_id:run,filing_id:f.filing_id,concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:'100',value_text:'100',unit:'USD',consolidation:'consolidated',available_date:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',disclosure_seq:2,is_current:true,is_revision:true});
   expect(typeof row.created_at).toBe('string');
   const run2=await db.beginRun(iss,'US',b,1);const fq=filingInsert(iss,{availableDate:'2024-03-01'});await db.stageFilings(run2,[fq]);
   const qd=factInsert(iss,fq,{value:'105'});await db.stageFacts(run2,[qd]);
   const itemId=await conflict(iss,b,run2,[qd.fact_id],'2024-03-01');await db.quarantineFacts(run2,[qd.fact_id],itemId);await db.publishRun(run2,[fq.filing_id]);
   const withNonOk=await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:true,includeNonOk:true});
   expect(withNonOk.rows.map(y=>[y.fact_id,y.status,y.disclosure_seq??null,y.is_current])).toEqual([[r0,'ok',1,false],[r,'ok',2,true],[qd.fact_id,'quarantined',null,false]]);
   expect(withNonOk.stateRev).toBe(3);
   expect((await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:false,includeNonOk:true})).rows.map(y=>y.fact_id)).toEqual([r]);
   expect((await db.factsByIds([qd.fact_id,randomUUID()])).map(y=>[y.fact_id,y.status,y.value])).toEqual([[qd.fact_id,'quarantined','105']]);
   expect(await db.factsByIds([])).toEqual([]);
   const list=await db.filingsOfIssuer(iss,'US',{});
   expect(list.map(g=>g.filing_id)).toEqual([fq.filing_id,f.filing_id,f0.filing_id]);                 // available_date desc
   expect(list[1]).toMatchObject({issuer_id:iss,market:'US',source:'edgar',origin:'sec',source_ref:f.sourceRef,form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-02-01',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:run});
   expect((await db.filingsOfIssuer(iss,'US',{from:'2024-02-01',to:'2024-02-28'})).map(g=>g.filing_id)).toEqual([f.filing_id]);
   expect((await db.filingsOfIssuer(iss,'US',{limit:1})).map(g=>g.filing_id)).toEqual([fq.filing_id]);
   await db.updateFilingLink(f.filing_id,{document_ref:'doc-1',document_url:'https://example.test/doc-1',link_attempts:1});
   await db.updateFilingLink(f0.filing_id,{link_attempts:3});
   expect((await db.filingsOfIssuer(iss,'US',{unlinkedOnly:true})).map(g=>[g.filing_id,g.link_attempts])).toEqual([[fq.filing_id,0],[f0.filing_id,3]]);
   expect((await db.filingsOfIssuer(iss,'US',{})).find(g=>g.filing_id===f.filing_id)).toMatchObject({document_ref:'doc-1',document_url:'https://example.test/doc-1',link_attempts:1,mapping_gen:1});
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])).toBe(0);
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['sp500'],priority:0,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeDue('US','2100-01-01T00:00:00.000Z',1000)).find(x=>x.issuer_id===iss)).toBeUndefined();   // priority 0 is out of scope
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:['sp500'],priority:5,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeDue('US','2100-01-01T00:00:00.000Z',1000)).find(x=>x.issuer_id===iss)).toMatchObject({market:'US',reasons:['sp500'],priority:5,fetch_key:'0000000001',lease_batch_id:b,state_rev:3,last_status:null,last_batch_id:null});
   expect(await db.scopeDue('US','2100-01-01T00:00:00.000Z',0)).toEqual([]);
   expect((await db.scopeRows('US',[iss,randomUUID()])).map(x=>[x.issuer_id,x.priority,x.fetch_key])).toEqual([[iss,5,'0000000001']]);   // by id, whatever priority / next_due_at
   expect(await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:0,fetch_key:'0000000001'}])).toBe(1);
   expect((await db.scopeRows('US',[iss])).map(x=>x.priority)).toEqual([0]);
   expect(await db.scopeRows('CN',[iss])).toEqual([]);
   expect(await db.scopeRows('US',[])).toEqual([]);
   expect((await db.scopeAll('US')).find(x=>x.issuer_id===iss)).toMatchObject({priority:0,fetch_key:'0000000001'});   // scopeAll keeps priority 0 rows
   expect((await db.scopeAll('CN')).find(x=>x.issuer_id===iss)).toBeUndefined();
  });

  it('reconcileScope snapshotAt: a retirement from an older snapshot does not undo a newer activation; activations and later snapshots apply',async()=>{
   const iss=await h.issuer();
   const row=(priority:number)=>[{issuer_id:iss,reasons:priority>0?['r']:[],priority,fetch_key:'0000000007'}];
   const older=new Date(Date.now()-3_600_000).toISOString(),newer=new Date(Date.now()+3_600_000).toISOString();
   expect(await db.reconcileScope('US',row(10))).toBe(1);                       // activation just now
   expect(await db.reconcileScope('US',row(0),older)).toBe(0);                  // stale retirement refused
   expect((await db.scopeRows('US',[iss]))[0].priority).toBe(10);
   expect(await db.reconcileScope('US',row(0),newer)).toBe(1);                  // snapshot taken after the last change: retires
   expect((await db.scopeRows('US',[iss]))[0].priority).toBe(0);
   expect(await db.reconcileScope('US',row(10),older)).toBe(1);                 // activation applies whatever the snapshot
   expect((await db.scopeRows('US',[iss]))[0].priority).toBe(10);
  });

  it('reconcileScope snapshotAt: an unchanged active confirmation by a newer reconcile also blocks an older retirement (and is not counted as a change)',async()=>{
   const iss=await h.issuer();
   const row=(priority:number)=>[{issuer_id:iss,reasons:priority>0?['r']:[],priority,fetch_key:'0000000008'}];
   expect(await db.reconcileScope('US',row(10))).toBe(1);
   const snap=new Date().toISOString();                                         // run A read its sources here
   await new Promise(r=>setTimeout(r,40));
   expect(await db.reconcileScope('US',row(10))).toBe(0);                       // run B confirms, unchanged
   expect(await db.reconcileScope('US',row(0),snap)).toBe(0);                   // A's retirement is refused
   expect((await db.scopeRows('US',[iss]))[0].priority).toBe(10);
  });

  it("promotion blocks on an OPEN same_day_conflict for the row's (K, date) even when the row is not in that item's member list (round-1 #3)",async()=>{
   const {iss,b,r}=await published();                                                     // r: revenue 100 on 2024-02-01, ok
   const runB=await db.beginRun(iss,'US',b,1);const fb=filingInsert(iss);await db.stageFilings(runB,[fb]);
   const c=factInsert(iss,fb,{value:'200'});await db.stageFacts(runB,[c]);
   const dispute=await conflict(iss,b,runB,[c.fact_id,r]);                                // open dispute on (K, 2024-02-01): members c, r
   await db.quarantineFacts(runB,[c.fact_id],dispute);
   expect(await db.publishRun(runB,[fb.filing_id])).toBe(0);                              // r disposed
   // Run C discloses the same K on the same day (value 100) from a third filing, parked by an
   // identity item only: it is NOT a member of the dispute.
   const runC=await db.beginRun(iss,'US',b,1);const fc=filingInsert(iss);await db.stageFilings(runC,[fc]);
   const c3=factInsert(iss,fc,{value:'100'});await db.stageFacts(runC,[c3]);
   const identity=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:IS:${randomUUID()}`,reasonCode:'identity_gp',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[c3.fact_id],run_id:runC}});
   await db.quarantineFacts(runC,[c3.fact_id],identity);
   expect(await db.publishRun(runC,[fc.filing_id])).toBe(0);
   expect(await db.resolveFactsQuarantine(identity,[],randomUUID())).toMatchObject({promoted:0,skipped:1});   // (K, 2024-02-01) is still disputed
   expect(await statusOf(c3.fact_id)).toBe('quarantined');
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.value)).toEqual(['90']);                  // the day still has no ok value
   expect(await db.resolveFactsQuarantine(dispute,[r],randomUUID())).toMatchObject({promoted:1,skipped:0});
   expect(await statusOf(r)).toBe('ok');expect(await statusOf(c3.fact_id)).toBe('quarantined');       // c3 waits for promote_quarantined (§7.3), the dispute no longer blocks it
   expect((await current(iss,['revenue'],false)).rows.map(y=>y.fact_id)).toEqual([r]);
  });

  it('an item without fact rows is run_pending while its anchor run is staged; acknowledged once that run is published or abandoned (round-1 #10)',async()=>{
   const {iss,b}=await published();
   const run=await db.beginRun(iss,'US',b,1);
   const parked=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:cash::2023-09-30:consolidated:USD:acc-9:1`,reasonCode:'ambiguous_value',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run}});
   expect(await code(db.resolveFactsQuarantine(parked,[],randomUUID()))).toBe('run_pending:run_pending');
   expect((await item(parked)).status).toBe('open');
   expect(await db.publishRun(run,[])).toBe(0);
   expect(await db.resolveFactsQuarantine(parked,[],randomUUID())).toMatchObject({promoted:0,skipped:0});
   expect((await item(parked)).status).toBe('resolved_accept');
   expect((await current(iss)).stateRev).toBe(3);                                         // publish + resolution
   const run2=await db.beginRun(iss,'US',b,1);
   const parked2=await quarantine(h.tables,{dataset:'facts.us',table:'financial_facts',naturalKey:`${iss}:US:cash::2023-06-30:consolidated:USD:acc-9:1`,reasonCode:'odd_duration',batchId:b,payload:{key:{issuer_id:iss,market:'US'},fact_ids:[],run_id:run2}});
   expect(await code(db.resolveFactsQuarantine(parked2,[],randomUUID()))).toBe('run_pending:run_pending');
   await db.abandonRun(run2);
   expect(await db.resolveFactsQuarantine(parked2,[],randomUUID())).toMatchObject({promoted:0,skipped:0});
  });

  it('complete-set reads return every row past 1,000: filingsOfIssuer without limit, metricsOfIssuer, scopeRows (round-1 #7)',async()=>{
   const {iss,b,r}=await published();
   const run=await db.beginRun(iss,'US',b,1);
   const many=Array.from({length:1001},(_,i)=>filingInsert(iss,{availableDate:'2020-01-01',sourceRef:`bulk-${iss}-${String(i).padStart(4,'0')}`}));   // (source, source_ref) is globally unique
   expect((await db.stageFilings(run,many)).size).toBe(1001);
   expect(await db.publishRun(run,many.map(f=>f.filing_id))).toBe(0);
   expect((await db.filingsOfIssuer(iss,'US',{})).length).toBe(1003);
   expect((await db.filingsOfIssuer(iss,'US',{limit:5})).length).toBe(5);
   expect((await db.filingsOfIssuer(iss,'US',{from:'2020-01-01',to:'2020-01-01'})).length).toBe(1001);
   const rev=(await current(iss)).stateRev;
   const rows=Array.from({length:1001},(_,i):MetricRow=>({issuer_id:iss,market:'US',metric:`m${String(i).padStart(4,'0')}`,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:String(i),unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[{fact_id:r,concept:'revenue',filing_id:'f',available_date:'2024-02-01'}],based_on_rev:rev,as_of:'2024-03-01'}));
   expect(await db.replaceMetrics(iss,'US',rev,rows)).toBe(1001);
   const got=await db.metricsOfIssuer(iss,'US','facts-derive/1.0');
   expect(got.length).toBe(1001);expect(got.at(-1)).toMatchObject({metric:'m1000',value:'1000'});
  },60000);
 });
}
