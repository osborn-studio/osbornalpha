// src/lib/industry/sic.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {memoryIndustryDb} from './memory-industry-db';
import {fixtureSecFetch,submissionsUrl} from './providers/sec-sic';
import {RETIRED_DUE,claimSicScopeRow,finishSicScopeRow,planSicClassifications,runClassificationsSic,runMembershipsSic,syncSicScope} from './sic';
import type {IndustryDb,IndustryDeps,ManifestStore} from './types';

const AAPL='b0000000-0000-4000-8000-000000000001',MSFT='b0000000-0000-4000-8000-000000000002',NVDA='b0000000-0000-4000-8000-000000000003';
const GONE='b0000000-0000-4000-8000-000000000004',ODD='b0000000-0000-4000-8000-000000000005',NOCIK='b0000000-0000-4000-8000-000000000006',RETIRED='b0000000-0000-4000-8000-000000000007';
const CIK:Record<string,string|null>={[AAPL]:'320193',[MSFT]:'789019',[NVDA]:'1045810',[GONE]:'1',[ODD]:'2',[NOCIK]:null,[RETIRED]:'3'};
const DAY1='2026-11-08T02:00:00.000Z';
const unusedManifests:ManifestStore={put:async()=>{throw new Error('unused');},get:async()=>{throw new Error('unused');},remove:async()=>{throw new Error('unused');}};
const noSleep=async()=>{};
const json=(o:unknown)=>()=>new Response(JSON.stringify(o),{status:200,headers:{'content-type':'application/json'}});

async function setup(fetchOverrides:Parameters<typeof fixtureSecFetch>[0]={}){
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id'],issuers:['issuer_id'],industry_sync_scope:['issuer_id','job']});
 for(const [id,cik] of Object.entries(CIK))await tables.insert('issuers',{issuer_id:id,cik,canonical_name_en:id,status:'active',provenance:{cik:{source:'sec'}},updated_at:'2026-01-01T00:00:00.000Z'});
 const facts=memoryFactsDb();facts.setNow(DAY1);
 await facts.reconcileScope('US',Object.entries(CIK).filter(([id])=>id!==RETIRED).map(([id,cik])=>({issuer_id:id,reasons:['universe:sp500'],priority:10,fetch_key:(cik??'9').padStart(10,'0')})));
 await facts.reconcileScope('US',[{issuer_id:RETIRED,reasons:[],priority:0,fetch_key:'0000000003'}]);
 let now=new Date(DAY1);
 const db=memoryIndustryDb({tables});db.setNow(DAY1);   // the lease fence reads the scope row from the same tables
 const deps:IndustryDeps={tables,db,facts,manifests:unusedManifests,now:()=>now,codeVersion:'sha',fetch:fixtureSecFetch({[submissionsUrl('2')]:json({cik:'0000000002',sic:'9999',sicDescription:'Unknown',fiscalYearEnd:'1231'}),...fetchOverrides})};
 return {tables,db,deps,facts,setNow:(iso:string)=>{now=new Date(iso);db.setNow(iso);}};
}

describe('planSicClassifications / runClassificationsSic',()=>{
 it('flat level-1 nodes named by the Industry Title, office in attributes',()=>{
  expect(planSicClassifications([{code:'3571',office:'Office of Technology',title:'ELECTRONIC COMPUTERS'}])).toEqual([{scheme:'sic',version:'sec-current',code:'3571',level:1,name_zh:null,name_en:'ELECTRONIC COMPUTERS',parent_code:null,attributes:{office:'Office of Technology'}}]);
 });
 it('loads the recorded table once; a rerun is unchanged; SEC down → failed batch',async()=>{
  const {tables,db,deps}=await setup();
  const r=await runClassificationsSic(deps);
  expect(r.status).toBe('success');expect(r.counts).toMatchObject({fetched:10,inserted:10});
  expect((await db.classificationTree('sic','sec-current')).map(n=>n.code)).toContain('0100');
  expect((await runClassificationsSic(deps)).counts).toMatchObject({inserted:0,duplicates:10});
  const down=await runClassificationsSic({...deps,fetch:fixtureSecFetch({'https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list':()=>new Response('',{status:503})})});
  expect(down).toMatchObject({status:'failed',exitCode:1});
  expect(tables.rows('dq_freshness').find(f=>f.dataset==='industry.sic.classifications')).toMatchObject({consecutive_errors:1});
 });
});

describe('syncSicScope',()=>{
 it('adds every active US facts-scope issuer once (due now); retired scope rows are not added',async()=>{
  const {tables,deps}=await setup();
  const first=await syncSicScope(deps);
  expect(first.added).toBe(6);expect(first.active.has(RETIRED)).toBe(false);
  expect(tables.rows('industry_sync_scope').every(r=>r.job==='sic'&&r.next_due_at===DAY1&&r.last_status===null)).toBe(true);
  expect((await syncSicScope(deps)).added).toBe(0);
 });
 it('retires rows of issuers that left the scope (never while leased), re-activates them when they return, and never overwrites an existing row (Codex round 1 #7)',async()=>{
  const {tables,deps,facts}=await setup();
  await tables.insert('industry_sync_scope',{issuer_id:RETIRED,job:'sic',next_due_at:'2026-01-01T00:00:00.000Z',lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:'2026-01-01T00:00:00.000Z'});
  await tables.insert('industry_sync_scope',{issuer_id:AAPL,job:'sic',next_due_at:'2026-01-01T00:00:00.000Z',lease_until:'2026-11-08T02:10:00.000Z',lease_batch_id:'other-batch',last_attempt_at:null,last_success_at:null,last_status:null,updated_at:'2026-11-08T01:59:00.000Z'});
  const r=await syncSicScope(deps);
  expect(r).toMatchObject({added:5,retired:1,reactivated:0});
  expect(tables.rows('industry_sync_scope').find(x=>x.issuer_id===RETIRED)!.next_due_at).toBe(RETIRED_DUE);
  expect(tables.rows('industry_sync_scope').find(x=>x.issuer_id===AAPL)).toMatchObject({lease_batch_id:'other-batch',next_due_at:'2026-01-01T00:00:00.000Z'});   // existing row and lease untouched
  await facts.reconcileScope('US',[{issuer_id:RETIRED,reasons:['universe:sp500'],priority:10,fetch_key:'0000000003'}]);
  expect(await syncSicScope(deps)).toMatchObject({reactivated:1});
  expect(tables.rows('industry_sync_scope').find(x=>x.issuer_id===RETIRED)!.next_due_at).toBe(DAY1);
 });
});

describe('runMembershipsSic',()=>{
 it('writes one observed SIC row per issuer, records fiscalYearEnd provenance, skips and quarantines per spec §11',async()=>{
  const {tables,db,deps}=await setup();
  await runClassificationsSic(deps);
  const r=await runMembershipsSic(deps,{sleep:noSleep,triggeredBy:'cron'});
  expect(r.processed).toBe(6);expect(r.added).toBe(6);
  expect(r.counts).toEqual({fetched:4,inserted:3,duplicates:0,versioned:0,quarantined:1,failed:0});
  expect(r.status).toBe('partial');
  expect(r.errors[0]).toEqual({code:'skipped_summary',message:JSON.stringify({no_submissions:1,no_cik:1})});
  expect(r.errors.slice(1).map(e=>e.code)).toEqual(['unknown_sic_code']);
  const [aapl]=await db.membershipsOfIssuer(AAPL,{scheme:'sic'});
  expect(aapl).toMatchObject({scheme:'sic',version:'sec-current',code:'3571',level:1,valid_from:'2026-11-08',available_date:'2026-11-08',valid_to:null,status:'ok',source_membership_id:null,
   provenance:{availability:'observed',locator:{url:'https://data.sec.gov/submissions/CIK0000320193.json',field:'sic',cik:'320193'},sic_description:'Electronic Computers'}});
  expect(String(aapl.provenance.raw_hash)).toMatch(/^[0-9a-f]{64}$/);
  const issuer=tables.rows('issuers').find(i=>i.issuer_id===NVDA)!;
  expect(issuer.provenance).toMatchObject({cik:{source:'sec'},sec_submissions:{source:'sec:submissions',fiscal_year_end:'0131',sic:'3674',sic_description:'Semiconductors & Related Devices',observed_at:DAY1}});
  expect(tables.rows('dq_quarantine').map(q=>[q.reason_code,q.natural_key])).toEqual([['unknown_sic_code',`sic:${ODD}:9999`]]);
  const scope=tables.rows('industry_sync_scope').find(s=>s.issuer_id===AAPL)!;
  expect(scope).toMatchObject({last_status:'success',last_success_at:DAY1,next_due_at:'2026-11-15T02:00:00.000Z',lease_until:null,lease_batch_id:null});
  expect(tables.rows('dq_freshness').find(f=>f.dataset==='industry.sic.memberships')).toMatchObject({expected_cadence:'weekly'});
  // same day again: nothing is due
  expect((await runMembershipsSic(deps,{sleep:noSleep})).processed).toBe(0);
 });
 it('a week later: same code → duplicate; changed code → old row closed at the observation date, new row opened; a second change that day → same_day_change',async()=>{
  const {tables,db,deps,setNow}=await setup();
  await runClassificationsSic(deps);
  await runMembershipsSic(deps,{sleep:noSleep});
  setNow('2026-11-15T02:00:00.000Z');
  const changed={...deps,fetch:fixtureSecFetch({[submissionsUrl('320193')]:json({cik:'0000320193',sic:'3674',sicDescription:'Semiconductors & Related Devices',fiscalYearEnd:'0926'}),[submissionsUrl('2')]:json({cik:'2',sic:''})})};
  const week2=await runMembershipsSic(changed,{sleep:noSleep});
  expect(week2.counts).toMatchObject({inserted:0,duplicates:2,versioned:1});
  const rows=(await db.membershipsOfIssuer(AAPL,{scheme:'sic'})).map(m=>[m.code,m.valid_from,m.valid_to,m.valid_to_available_date]).sort();
  expect(rows).toEqual([['3571','2026-11-08','2026-11-15','2026-11-15'],['3674','2026-11-15',null,null]]);
  await tables.update('industry_sync_scope',{issuer_id:AAPL,job:'sic'},{next_due_at:'2026-11-15T00:00:00.000Z'});
  setNow('2026-11-15T03:00:00.000Z');
  const again=await runMembershipsSic({...deps,fetch:fixtureSecFetch({[submissionsUrl('320193')]:json({cik:'320193',sic:'7372'})})},{sleep:noSleep});
  expect(again.counts).toMatchObject({quarantined:1});
  expect(tables.rows('dq_quarantine').filter(q=>q.reason_code==='same_day_change').map(q=>q.natural_key)).toEqual([`sic:${AAPL}:2026-11-15`]);
 });
 it('SEC unavailable: error entry (batch partial/failed), retried the next day; no classifications → no_classifications',async()=>{
  const {tables,deps}=await setup({[submissionsUrl('320193')]:()=>new Response('',{status:429})});
  await runClassificationsSic(deps);
  const r=await runMembershipsSic(deps,{sleep:noSleep});
  expect(r.errors.some(e=>e.code==='sec_unavailable'&&e.key===AAPL)).toBe(true);
  expect(tables.rows('industry_sync_scope').find(s=>s.issuer_id===AAPL)).toMatchObject({last_status:'failed',next_due_at:'2026-11-09T02:00:00.000Z'});
  const empty=await setup();
  const none=await runMembershipsSic(empty.deps,{sleep:noSleep});
  expect(none).toMatchObject({status:'failed',processed:0});
  expect(none.errors.map(e=>e.code)).toEqual(['no_classifications']);
 });
 it('more than 400 inactive overdue rows ahead of the active ones cannot starve them (Codex round 1 #7)',async()=>{
  const {tables,deps}=await setup();
  await runClassificationsSic(deps);
  for(let i=0;i<450;i++)await tables.insert('industry_sync_scope',{issuer_id:`c0000000-0000-4000-8000-${String(i).padStart(12,'0')}`,job:'sic',next_due_at:'2025-01-01T00:00:00.000Z',lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:'2025-01-01T00:00:00.000Z'});
  const r=await runMembershipsSic(deps,{sleep:noSleep});
  expect(r).toMatchObject({processed:6,added:6,retired:450});
 },60_000);
 it('claims are compare-and-swap and completion is fenced by the lease batch (Codex round 1 #6)',async()=>{
  const {tables,deps}=await setup();
  await syncSicScope(deps);
  const [row]=await tables.select('industry_sync_scope',{issuer_id:AAPL,job:'sic'});
  const now=new Date(DAY1);
  expect(await claimSicScopeRow(tables,row,'batch-a',now)).toBe(true);
  expect(await claimSicScopeRow(tables,row,'batch-b',now)).toBe(false);          // same stale read: loses
  expect(await finishSicScopeRow(tables,AAPL,'batch-b',{last_status:'success'})).toBe(false);   // not the lease holder
  expect(tables.rows('industry_sync_scope').find(x=>x.issuer_id===AAPL)).toMatchObject({lease_batch_id:'batch-a',last_status:null});
  expect(await finishSicScopeRow(tables,AAPL,'batch-a',{last_status:'success'})).toBe(true);
  expect(tables.rows('industry_sync_scope').find(x=>x.issuer_id===AAPL)).toMatchObject({lease_batch_id:null,lease_until:null,last_status:'success'});
 });
 it('a lease takeover rejects the old worker\'s data write inside the apply transaction (Codex round 2 R2-3)',async()=>{
  const {tables,db,deps,setNow}=await setup();
  await runClassificationsSic(deps);
  await syncSicScope(deps);
  const [row]=await tables.select('industry_sync_scope',{issuer_id:AAPL,job:'sic'});
  expect(await claimSicScopeRow(tables,row,'batch-a',new Date(DAY1))).toBe(true);
  setNow('2026-11-08T02:20:00.000Z');   // batch-a's 15-minute lease expired; batch-b takes the row over
  const [taken]=await tables.select('industry_sync_scope',{issuer_id:AAPL,job:'sic'});
  expect(await claimSicScopeRow(tables,taken,'batch-b',new Date('2026-11-08T02:20:00.000Z'))).toBe(true);
  const prov={availability:'observed',raw_hash:'h'};
  await expect(db.applySicMembership('batch-a',AAPL,'2026-11-08','3571',prov,{leaseBatch:'batch-a',secSubmissions:{sic:'3571'}})).rejects.toMatchObject({code:'lease_lost'});
  expect(await db.membershipsOfIssuer(AAPL,{scheme:'sic'})).toEqual([]);
  expect((tables.rows('issuers').find(i=>i.issuer_id===AAPL)!.provenance as Record<string,unknown>).sec_submissions).toBeUndefined();
  expect(await db.applySicMembership('batch-b',AAPL,'2026-11-08','3571',prov,{leaseBatch:'batch-b',secSubmissions:{sic:'3571'}})).toBe('inserted');
  expect((tables.rows('issuers').find(i=>i.issuer_id===AAPL)!.provenance as Record<string,unknown>).sec_submissions).toEqual({sic:'3571'});
 });
 it('skip-only runs (404-only, empty-SIC-only) are a success, not unaccounted',async()=>{
  for(const kind of ['404','empty'] as const){
   const {tables,deps}=await setup();
   const d={...deps,fetch:(async(u:RequestInfo|URL)=>{const m=/CIK(\d{10})\.json$/.exec(String(u));
    if(!m)return fixtureSecFetch()(u);
    return kind==='404'?new Response('',{status:404}):new Response(JSON.stringify({cik:m[1],sic:''}),{status:200});}) as typeof fetch};
   await runClassificationsSic(d);
   const r=await runMembershipsSic(d,{sleep:noSleep});
   expect(r.counts.fetched).toBe(0);expect(r.status).toBe('success');expect(r.errors.map(e=>e.code)).toEqual(['skipped_summary']);
   expect(tables.rows('dq_freshness').find(f=>f.dataset==='industry.sic.memberships')).toMatchObject({consecutive_errors:0});
  }
 });
 it('pages due rows deterministically: tied timestamps, server cap below the page size',async()=>{
  const {tables,deps}=await setup();
  await runClassificationsSic(deps);
  const capped={...tables,select:async(t:string,m:Record<string,unknown>,o:Record<string,unknown>={})=>tables.select(t,m,{...o,limit:Math.min(Number(o.limit??1000),2)})} as typeof tables;
  const r=await runMembershipsSic({...deps,tables:capped},{sleep:noSleep});
  expect(r.processed).toBe(6);
 });
 it('a body read failure is sec_unavailable (retried the next day)',async()=>{
  const {tables,deps}=await setup({[submissionsUrl('320193')]:()=>({status:200,ok:true,arrayBuffer:async()=>{throw new TypeError('terminated');}}) as unknown as Response});
  await runClassificationsSic(deps);
  const r=await runMembershipsSic(deps,{sleep:noSleep});
  expect(r.errors.some(e=>e.code==='sec_unavailable'&&e.key===AAPL)).toBe(true);
  expect(tables.rows('industry_sync_scope').find(s=>s.issuer_id===AAPL)).toMatchObject({next_due_at:'2026-11-09T02:00:00.000Z'});
 });
 it('observed is the day the response arrived: a request crossing UTC midnight opens and closes at the new day',async()=>{
  const {db,deps,setNow}=await setup();
  await runClassificationsSic(deps);
  const mk=(sic:string,tick:()=>void)=>fixtureSecFetch({[submissionsUrl('320193')]:()=>{tick();return new Response(JSON.stringify({cik:'0000320193',sic,fiscalYearEnd:'0926'}),{status:200});}});
  const only=(f:typeof fetch)=>(async(u:RequestInfo|URL,i?:RequestInit)=>String(u)===submissionsUrl('320193')?f(u,i):new Response('',{status:404})) as typeof fetch;
  let clock=new Date('2026-11-08T23:59:59.000Z');
  const run=(sic:string,after:string)=>runMembershipsSic({...deps,now:()=>clock,fetch:only(mk(sic,()=>{clock=new Date(after);}))},{sleep:noSleep});
  setNow('2026-11-08T23:59:59.000Z');
  await run('3571','2026-11-09T00:00:01.000Z');
  expect((await db.membershipsOfIssuer(AAPL,{scheme:'sic'})).map(m=>[m.code,m.valid_from,m.available_date])).toEqual([['3571','2026-11-09','2026-11-09']]);
  clock=new Date('2026-11-16T23:59:59.000Z');setNow('2026-11-16T23:59:59.000Z');
  await run('3674','2026-11-17T00:00:01.000Z');
  expect((await db.membershipsOfIssuer(AAPL,{scheme:'sic'})).map(m=>[m.code,m.valid_from,m.valid_to,m.valid_to_available_date]).sort()).toEqual([['3571','2026-11-09','2026-11-17','2026-11-17'],['3674','2026-11-17',null,null]]);
 });
 it('a response for another CIK is quarantined cik_mismatch with no writes',async()=>{
  const {tables,db,deps}=await setup({[submissionsUrl('320193')]:json({cik:'0000789019',sic:'7372',fiscalYearEnd:'0630'})});
  await runClassificationsSic(deps);
  const r=await runMembershipsSic(deps,{sleep:noSleep});
  expect(tables.rows('dq_quarantine').filter(q=>q.reason_code==='cik_mismatch').map(q=>q.natural_key)).toEqual([`sic:${AAPL}:cik_mismatch`]);
  expect(await db.membershipsOfIssuer(AAPL,{scheme:'sic'})).toEqual([]);
  expect((tables.rows('issuers').find(i=>i.issuer_id===AAPL)!.provenance as Record<string,unknown>).sec_submissions).toBeUndefined();
  expect(r.errors.some(e=>e.code==='cik_mismatch'&&e.key===AAPL)).toBe(true);
 });
 it('honours the limit and paces requests',async()=>{
  const {deps}=await setup();
  await runClassificationsSic(deps);
  const waits:number[]=[];
  const r=await runMembershipsSic(deps,{limit:2,sleep:async ms=>{waits.push(ms);}});
  expect(r.processed).toBe(2);expect(waits).toEqual([150]);
 });
});
