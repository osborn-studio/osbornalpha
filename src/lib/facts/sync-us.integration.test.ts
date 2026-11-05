// src/lib/facts/sync-us.integration.test.ts
// Plan 2 §11.3 offline replay on real PostgreSQL: AAPL + MSFT trimmed companyfacts fixtures injected as
// fetchUs, pgFactsDb + pgTableClient, memory snapshot store. Two runs (second = all duplicates), a later
// 10-K revision fixture (versioned=1, asOf replay on both sides; the revised fixture then STAYS active so
// later generations cover it, round-1 #15), mapping-gen bump (old generation invisible but fetchable by id;
// the active generation is carried forward to every later run), two concurrent runs on one issuer (lease),
// stale replaceMetrics rejected, materialize twice identical (§11.3), and the US gold gate
// (fixtures/gold/plan2.json, round-1 #19). Two cases beyond the plan close review carry-overs:
//  - R7-1 materialize half: a published same_day_conflict is resolved through resolveFactsQuarantine and the
//    derived metrics then carry the chosen fact (and never the unchosen one) in their inputs;
//  - a real stale_computation interleaving: state_rev moves between materialize's readFacts and
//    replaceMetrics, materialize retries once and the stored metrics are based on the current state_rev.
// The cases run in order and SHARE STATE by design (fixtures swapped to the revised one, activeGen bumped, ZZ issuer evolving); do not
// run or reorder them in isolation.
// Gold gate deviation from the plan: while the gold file says ready:false the gate WARNS and does not fail
// (the owner has not transcribed yet); recorded entries are still replayed, and ready:true enforces it all.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgFactsDb} from './pg-facts-db';
import {memorySnapshotStore} from './snapshot-store';
import {runFactsSync} from './sync';
import type {SyncDeps,SyncOptions} from './sync';
import {MAPPING_GEN,conceptById} from './concepts';
import {FORMULA_VERSION,materialize} from './derive';
import {ProviderError,snapshotOf} from './providers/shared';
import {companyFactsUrl,parseCompanyFacts} from './providers/edgar-companyfacts';
import type {FactRow,FactsDb,RawSnapshot} from './types';

const enabled=!!process.env.S4_TEST_STATE;
// Deterministic issuer ids so any other suite loading the same fixture shares the issuer (filings.source_ref is global).
// Every gold-asserted US issuer must appear here with a recorded fixture (gold `ready` gate).
// THE fixture issuer list. Adding a gold issuer = record its fixture (record-fixture.ts --edgar <cik>) and add
// one entry here: stocks_universe / issuers / issuer_securities provisioning, the scope rows, the fixture map
// and every replay run all derive from this list, so nothing else needs touching (round-2 #19, round-3 N3).
const FIXTURE_ISSUERS:readonly {ticker:string;cik:string;name:string}[]=[
 {ticker:'AAPL',cik:'320193',name:'Apple Inc.'},
 {ticker:'MSFT',cik:'789019',name:'Microsoft Corp.'},
];
const CIK:Record<string,string>=Object.fromEntries(FIXTURE_ISSUERS.map(i=>[i.ticker,i.cik]));
const FIX:Record<string,string>=Object.fromEntries(FIXTURE_ISSUERS.map(i=>[i.cik.padStart(10,'0'),`CIK${i.cik.padStart(10,'0')}.trimmed.json`]));
const REVISED='CIK0000320193.revised.json';
const fx=(n:string)=>new Uint8Array(readFileSync(new URL(`./fixtures/edgar/${n}`,import.meta.url)));
const today=()=>new Date().toISOString().slice(0,10);
interface GoldEntry{issuer:{ticker:string;market:'US'|'CN'};concept:string;period_end:string;unit:string;duration?:string;value:string;as_of?:string|null;source?:{document?:string;page_or_row?:string;url?:string};recorded_by:string;recorded_at?:string|null}
interface GoldFile{ready:boolean;required:{US:boolean;CN:boolean};entries:GoldEntry[]}
const isPending=(e:GoldEntry)=>e.recorded_by==='<pending>'||e.value==='<pending>';
const blank=(v:unknown)=>typeof v!=='string'||v.trim()===''||v.trim()==='<pending>';
/** Provenance a human must have written down: document, page/row, url and a recording timestamp. Returns the missing fields. */
const provenanceGaps=(e:GoldEntry):string[]=>[...(['document','page_or_row','url'] as const).filter(k=>blank(e.source?.[k])).map(k=>`source.${k}`),...(e.recorded_at==null||blank(e.recorded_at)?['recorded_at']:[])];
/** No CN replay suite exists yet (sync-cn.integration.test.ts is created only with real Tushare fixtures), so CN entries cannot be replay-verified here. */
const CN_REPLAY_SUITE=false;

// Synthetic issuer for the quarantine/materialize cases (not a gold issuer): FY2023 revenue disclosed twice on the
// same day by two accessions with different values (a same_day_conflict), plus one net income in the first accession.
const ZZ={ticker:'ZZCF',cik:'9990001',name:'ZZ Conflict Co'};
const ZZ_CIK10=ZZ.cik.padStart(10,'0');
const ZZ_ACCN_A='0009990001-24-000001',ZZ_ACCN_B='0009990001-24-000002';
const ZZ_ACCN_C='0009990001-24-000003';
let zzRevised=false;   // flips on when the competing writer of the stale_computation case publishes a later, changed FY2023 revenue
const zzDoc=()=>{
 const e=(accn:string,val:number,form:string,filed='2024-02-15')=>({start:'2023-01-01',end:'2023-12-31',val,accn,fy:2023,fp:'FY',form,filed});
 return new TextEncoder().encode(JSON.stringify({cik:Number(ZZ.cik),entityName:ZZ.name,facts:{'us-gaap':{
  Revenues:{units:{USD:[e(ZZ_ACCN_A,1000,'10-K'),e(ZZ_ACCN_B,1001,'10-K/A'),...(zzRevised?[e(ZZ_ACCN_C,1002,'10-K/A','2024-03-01')]:[])]}},
  NetIncomeLoss:{units:{USD:[e(ZZ_ACCN_A,100,'10-K')]}},
 }}}));
};

describe.skipIf(!enabled)('F2-3 US offline replay on real PostgreSQL',()=>{
 let admin:Pool;let db:FactsDb;let deps:SyncDeps;
 const issuers:Record<string,string>={};
 let zz='';
 const fixtures={...FIX};
 let activeGen=MAPPING_GEN;   // bumped by the mapping-gen test; every later run must use it (a lower gen is mapping_gen_regression)
 // mappingGen is a SyncOptions field (Part B), not a SyncDeps field.
 const run=(ids:string[],extra:Partial<SyncOptions>={})=>runFactsSync(deps,{market:'US',limit:10,issuerIds:ids,dryRun:false,triggeredBy:'script',mappingGen:activeGen,...extra});
 const revenueFy23=(asOf:string,history=true)=>db.readFacts(issuers.AAPL,'US',{concepts:['revenue'],asOf,from:'2023-09-30',to:'2023-09-30',history}).then(r=>r.rows.filter(x=>x.duration==='12M'));
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  // Provision every fixture issuer from the one list, in FK order: stocks_universe (issuer_securities.ticker
  // references it; ON CONFLICT DO NOTHING does not cover a missing parent) → issuers → issuer_securities.
  const provision=async(ticker:string,cik:string,name:string)=>{
   await admin.query(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[ticker,name]);
   await admin.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[randomUUID(),name,cik]);
   const id=(await admin.query(`select issuer_id from public.issuers where cik=$1`,[cik])).rows[0].issuer_id as string;
   await admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','test') on conflict do nothing`,[id,ticker]);
   return id;
  };
  for(const {ticker,cik,name} of FIXTURE_ISSUERS){
   expect(FIX[cik.padStart(10,'0')],`${ticker}: fixture file name`).toBeDefined();
   issuers[ticker]=await provision(ticker,cik,name);
  }
  zz=await provision(ZZ.ticker,ZZ.cik,ZZ.name);
  db=pgFactsDb(admin);
  await db.reconcileScope('US',[...FIXTURE_ISSUERS.map(i=>({issuer_id:issuers[i.ticker],reasons:['test'],priority:10,fetch_key:i.cik.padStart(10,'0')})),{issuer_id:zz,reasons:['test'],priority:10,fetch_key:ZZ_CIK10}]);
  deps={db,tables:pgTableClient(admin),storage:memorySnapshotStore(),
   fetchUs:async(cik10:string):Promise<RawSnapshot>=>{
    if(cik10===ZZ_CIK10)return snapshotOf(zzDoc(),{source:'edgar',url:companyFactsUrl(cik10)});
    const n=fixtures[cik10];if(!n)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(fx(n),{source:'edgar',url:companyFactsUrl(cik10)});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','not in this suite');},
   parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','not in this suite');},
   now:()=>new Date(),deadline:null,codeVersion:'test'};
 });
 // Facts and filings are append-only and test:db builds a fresh database per run, so rows are not deleted;
 // the cleanup that does apply covers every fixture issuer: retire their scope rows (priority 0) so no
 // scheduled-path test of another suite picks them up.
 afterAll(async()=>{
  if(db&&Object.keys(issuers).length>0)await db.reconcileScope('US',[...FIXTURE_ISSUERS.filter(i=>issuers[i.ticker]).map(i=>({issuer_id:issuers[i.ticker],reasons:[],priority:0,fetch_key:i.cik.padStart(10,'0')})),...(zz?[{issuer_id:zz,reasons:[],priority:0,fetch_key:ZZ_CIK10}]:[])]).catch(()=>{});
  await admin?.end();
 });

 it('first run publishes every fixture issuer; AAPL revenue asOf 2024-06-30 is the 2023-11-03 10-K row, not a later comparative',async()=>{
  const r1=await run(Object.values(issuers));                                           // every fixture-backed issuer, so every gold issuer has facts
  expect(r1.status).toBe('success');expect(r1.detail).toMatchObject({published:Object.keys(CIK).length,failed:0});
  expect(r1.counts.inserted+r1.counts.duplicates).toBeGreaterThan(100);
  const rows=await revenueFy23('2024-06-30',false);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({available_date:'2023-11-03',value_text:'383285000000',unit:'USD',disclosure_seq:1,is_current:true,is_revision:false,mapping_gen:MAPPING_GEN,status:'ok'});
  expect((await db.readFacts(issuers.MSFT,'US',{concepts:['revenue'],asOf:today(),from:'2023-06-30',to:'2023-06-30'})).rows.some(x=>x.value_text==='211915000000')).toBe(true);
 },120_000);

 it('second run is all duplicates: nothing inserted or versioned, no new facts visible',async()=>{
  const before=(await db.readFacts(issuers.AAPL,'US',{concepts:['revenue','total_assets'],asOf:today(),history:true})).rows.length;
  const r2=await run(Object.values(issuers));
  expect(r2.status).toBe('success');
  expect(r2.counts).toMatchObject({inserted:0,versioned:0,quarantined:0,failed:0});
  expect(r2.counts.duplicates).toBeGreaterThan(100);
  expect((await db.readFacts(issuers.AAPL,'US',{concepts:['revenue','total_assets'],asOf:today(),history:true})).rows.length).toBe(before);
 },120_000);

 it('a later 10-K with a different FY2023 revenue is versioned=1 and replays on both sides of its filed date',async()=>{
  const before=await revenueFy23('2025-10-31');
  expect(before.length).toBeGreaterThanOrEqual(2);
  for(const x of before)expect(x.is_revision).toBe(false);                            // same value re-disclosed by later 10-Ks: sequence members, not revisions
  // The revised fixture stays active for the rest of the suite: the synthetic filing must be part of
  // every later manifest, or the generation bump below would leave it on the old generation (round-1 #15).
  fixtures['0000320193']=REVISED;
  const r3=await run([issuers.AAPL]);
  expect(r3.status).toBe('success');expect(r3.counts).toMatchObject({versioned:1,inserted:0,quarantined:0});
  const after=await revenueFy23('2025-12-31');
  expect(after).toHaveLength(before.length+1);
  expect(after.at(-1)).toMatchObject({available_date:'2025-11-01',value_text:'383285000001',is_current:true,is_revision:true,disclosure_seq:before.length+1});
  expect(after.slice(0,-1).map(x=>x.fact_id)).toEqual(before.map(x=>x.fact_id));
  const earlier=await revenueFy23('2025-10-31');
  expect(earlier.map(x=>[x.fact_id,x.is_current])).toEqual(before.map(x=>[x.fact_id,x.is_current]));
  expect((await revenueFy23('2024-06-30',false))[0].value_text).toBe('383285000000');
  // spec acceptance example: before the synthetic revision, the FY2023 current row is the second disclosure (a later 10-K comparative with the same value)
  const june=(await revenueFy23('2025-06-30',false));
  expect(june).toHaveLength(1);
  expect(june[0]).toMatchObject({disclosure_seq:2,is_revision:false,is_current:true,value_text:'383285000000'});
 },120_000);

 it('a mapping-gen bump re-publishes under the new generation per filing; old-generation rows leave read_facts but stay fetchable by id',async()=>{
  const old=await revenueFy23(today());
  expect(old.some(x=>x.available_date==='2025-11-01')).toBe(true);                   // the synthetic revision is part of the set being bumped
  activeGen=MAPPING_GEN+1;
  const r4=await run([issuers.AAPL]);
  expect(r4.status).toBe('success');expect(r4.counts.inserted).toBeGreaterThan(100);
  const now=await revenueFy23(today());
  expect(now.length).toBe(old.length);
  for(const x of now)expect(x.mapping_gen).toBe(activeGen);
  expect(new Set(now.map(x=>x.fact_id)).size).toBe(now.length);
  expect(now.some(x=>old.some(o=>o.fact_id===x.fact_id))).toBe(false);
  // per-filing generation: every AAPL filing was in the manifest and is now on the active generation
  const filings=await db.filingsOfIssuer(issuers.AAPL,'US',{});
  expect(filings.length).toBeGreaterThan(10);
  expect(filings.filter(g=>g.mapping_gen!==activeGen).map(g=>g.source_ref)).toEqual([]);
  const all=await db.readFacts(issuers.AAPL,'US',{concepts:['revenue','total_assets'],asOf:today(),history:true});
  expect(all.rows.every(x=>x.mapping_gen===activeGen)).toBe(true);
  const byId=await db.factsByIds(old.map(o=>o.fact_id));
  expect(byId.map((x:FactRow)=>x.fact_id).sort()).toEqual(old.map(o=>o.fact_id).sort());
  for(const x of byId)expect(x).toMatchObject({mapping_gen:MAPPING_GEN,status:'ok'});
  expect((await revenueFy23('2024-06-30',false))[0]).toMatchObject({value_text:'383285000000',mapping_gen:activeGen});   // asOf replay is generation-independent
 },120_000);

 it('two concurrent runs on one issuer: B is refused the lease while A is held inside its fetch; A publishes exactly once, no staged run is left behind',async()=>{
  const counts=async()=>Object.fromEntries((await admin.query(`select status,count(*)::int n from public.fact_sync_runs where issuer_id=$1 and market='US' group by status`,[issuers.AAPL])).rows.map(r=>[r.status,r.n as number]));
  const before=await counts();
  let entered!:()=>void;const inFetch=new Promise<void>(r=>{entered=r;});
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const heldDeps:SyncDeps={...deps,fetchUs:async(cik10,b)=>{entered();await gate;return deps.fetchUs(cik10,b);}};
  const a=runFactsSync(heldDeps,{market:'US',limit:10,issuerIds:[issuers.AAPL],dryRun:false,triggeredBy:'script',mappingGen:activeGen});
  await inFetch;                                                                  // A holds the lease and an open staged run
  const mid=await counts();expect(mid.staged??0).toBe(1);
  let bResult;
  try{bResult=await run([issuers.AAPL]);}finally{release();}                      // A is released only after B has returned
  const aResult=await a;
  expect(bResult.detail).toMatchObject({attempted:1,published:0,skipped:1,failed:0});
  expect(bResult.issuers[0]).toMatchObject({outcome:'skipped',code:'leased'});
  const skipped=bResult.errors.filter(e=>e.code==='skipped_summary'&&e.key===issuers.AAPL);
  expect(skipped).toHaveLength(1);expect(skipped[0].message).toContain('"leased":1');
  expect(aResult.detail).toMatchObject({published:1,failed:0});
  const after=await counts();
  expect(after.published??0).toBe((before.published??0)+1);
  expect(after.staged??0).toBe(0);
 },120_000);

 it('replaceMetrics accepts the current state_rev and rejects a stale one',async()=>{
  const {stateRev}=await db.readFacts(issuers.AAPL,'US',{concepts:['revenue'],asOf:today()});
  expect(stateRev).toBeGreaterThan(0);
  await expect(db.replaceMetrics(issuers.AAPL,'US',stateRev,[])).resolves.toBe(0);
  await expect(db.replaceMetrics(issuers.AAPL,'US',stateRev-1,[])).rejects.toMatchObject({code:'stale_computation'});
 });

 it('materialize twice yields identical metric rows (computed_at is not part of MetricRow) and a non-empty set for AAPL',async()=>{
  const first=await materialize(db,issuers.AAPL,'US');
  expect(first.rows).toBeGreaterThan(0);
  const a=await db.metricsOfIssuer(issuers.AAPL,'US',FORMULA_VERSION);
  const second=await materialize(db,issuers.AAPL,'US');
  expect(second.stateRev).toBe(first.stateRev);expect(second.rows).toBe(first.rows);
  const b=await db.metricsOfIssuer(issuers.AAPL,'US',FORMULA_VERSION);
  expect(b).toEqual(a);
  expect(a.some(m=>m.metric==='gross_margin'&&m.duration==='12M')).toBe(true);
  for(const m of a)expect(m).toMatchObject({issuer_id:issuers.AAPL,market:'US',formula_version:FORMULA_VERSION,based_on_rev:first.stateRev});
 },120_000);

 // R7-1, materialize half. Parked same-day conflict rows are not visible to read_facts (status quarantined), so no
 // revenue-based metric exists; resolveFactsQuarantine promotes exactly the chosen row and the next materialize
 // derives from it only.
 it('same_day_conflict: after resolveFactsQuarantine the metrics carry the chosen fact and never the unchosen one',async()=>{
  const r=await run([zz]);
  expect(r.status).toBe('success');expect(r.detail).toMatchObject({published:1,failed:0});
  expect(r.counts.quarantined).toBe(2);                                         // both new rows of the conflict are parked
  const open=await db.openConflicts(zz,'US');
  expect(open).toHaveLength(1);
  const members=await db.factsByIds(open[0].fact_ids);
  expect(members.map(x=>x.value_text).sort()).toEqual(['1000','1001']);
  for(const m of members)expect(m.status).toBe('quarantined');
  expect((await db.readFacts(zz,'US',{concepts:['revenue'],asOf:today()})).rows).toEqual([]);
  await materialize(db,zz,'US');
  expect((await db.metricsOfIssuer(zz,'US',FORMULA_VERSION)).filter(m=>m.metric==='net_margin')).toEqual([]);
  const chosen=members.find(x=>x.value_text==='1001')!,unchosen=members.find(x=>x.value_text==='1000')!;
  const res=await db.resolveFactsQuarantine(open[0].id,[chosen.fact_id],randomUUID());
  expect(res).toMatchObject({promoted:1,skipped:0,chosenFactIds:[chosen.fact_id]});
  expect((await db.factsByIds([chosen.fact_id]))[0].status).toBe('ok');
  expect((await db.factsByIds([unchosen.fact_id]))[0].status).toBe('quarantined');
  expect(await db.openConflicts(zz,'US')).toEqual([]);
  // a re-sync of the same disclosures must not reopen the resolved conflict or re-park anything
  const again=await run([zz]);
  expect(again.detail).toMatchObject({published:1,failed:0});expect(again.counts).toMatchObject({inserted:0,versioned:0,quarantined:0,failed:0});
  expect(await db.openConflicts(zz,'US')).toEqual([]);
  expect((await db.factsByIds([chosen.fact_id]))[0].status).toBe('ok');
  expect((await db.factsByIds([unchosen.fact_id]))[0].status).toBe('quarantined');
  const m=await materialize(db,zz,'US');
  expect(m.rows).toBeGreaterThan(0);
  const metrics=await db.metricsOfIssuer(zz,'US',FORMULA_VERSION);
  const margin=metrics.find(x=>x.metric==='net_margin'&&x.duration==='12M');
  expect(margin,'net_margin derived from the chosen revenue').toBeDefined();
  expect(margin!.inputs.map(i=>i.fact_id)).toContain(chosen.fact_id);
  expect(margin!.value).toBe('0.0999000999');                                  // 100 / 1001
  for(const x of metrics)expect(x.inputs.map(i=>i.fact_id)).not.toContain(unchosen.fact_id);
  expect(metrics.every(x=>x.based_on_rev===m.stateRev)).toBe(true);
 },120_000);

 // A real interleaving that CHANGES the inputs: right after materialize's readFacts, another writer publishes a later, revised
 // FY2023 revenue (new accession, later filed date) for the same issuer. The first replaceMetrics is stale (state_rev + 1);
 // materialize re-reads and recomputes once, and the stored metrics reflect the new fact and not the superseded one.
 it('stale_computation interleaving: a competing publish changes the inputs, materialize retries once and stores metrics from the new fact on the current state_rev',async()=>{
  const rev=async()=>Number((await admin.query(`select public.fact_state_rev($1,'US') v`,[zz])).rows[0].v);
  const startRev=await rev();
  const before=(await db.metricsOfIssuer(zz,'US',FORMULA_VERSION)).find(x=>x.metric==='net_margin'&&x.duration==='12M')!;
  expect(before.value).toBe('0.0999000999');
  const superseded=before.inputs.find(i=>i.concept==='revenue')!.fact_id;
  let reads=0,bumpedTo=0;let competing!:Awaited<ReturnType<typeof run>>;
  const racing:FactsDb={...db,
   readFacts:async(i,m,o)=>{
    const env=await db.readFacts(i,m,o);reads++;
    if(reads===1){                                                              // the competing writer publishes a changed fact after our snapshot
     zzRevised=true;competing=await run([zz]);
     bumpedTo=await rev();
     expect(bumpedTo).toBeGreaterThan(env.stateRev);
    }
    return env;
   }};
  const m=await materialize(racing,zz,'US');
  expect(competing.detail).toMatchObject({published:1,failed:0});
  expect(competing.counts).toMatchObject({inserted:0,versioned:1,quarantined:0});   // exactly the new accession's revenue, counted as a version; the resolved conflict stays closed
  expect(await db.openConflicts(zz,'US')).toEqual([]);
  expect(reads).toBe(2);expect(m.retried).toBe(true);
  expect(startRev).toBeLessThan(bumpedTo);
  expect(m.stateRev).toBe(bumpedTo);
  const current=await rev();
  expect(m.stateRev).toBe(current);
  const rows=(await db.readFacts(zz,'US',{concepts:['revenue'],asOf:today(),history:true})).rows;
  const fresh=rows.find(x=>x.value_text==='1002')!;
  expect(fresh).toMatchObject({is_current:true,is_revision:true,available_date:'2024-03-01'});
  const metrics=await db.metricsOfIssuer(zz,'US',FORMULA_VERSION);
  expect(metrics.length).toBe(m.rows);expect(metrics.length).toBeGreaterThan(0);
  for(const x of metrics){
   expect(x.based_on_rev).toBe(current);
   expect(x.inputs.map(i=>i.fact_id)).not.toContain(superseded);
  }
  const margin=metrics.find(x=>x.metric==='net_margin'&&x.duration==='12M')!;
  expect(margin.value).toBe('0.0998003992');                                    // 100 / 1002
  expect(margin.inputs.map(i=>i.fact_id)).toContain(fresh.fact_id);
 },120_000);

 // Gold gate. ready:false = the owner has not transcribed yet: warn loudly, do not fail (deviation from the plan's designed red).
 it('US gold gate: while ready:false it only reports (INCOMPLETE, non-failing); recorded entries always replay; ready:true enforces the whole matrix (round-1 #19)',async()=>{
  const gold=JSON.parse(readFileSync(new URL('./fixtures/gold/plan2.json',import.meta.url),'utf8')) as GoldFile;
  expect(gold.entries.length).toBeGreaterThan(0);
  for(const e of gold.entries)expect(['US','CN'],`${e.issuer.ticker}/${e.concept}: market`).toContain(e.issuer.market);
  const us=gold.entries.filter(e=>e.issuer.market==='US');
  const missing=Object.keys(CIK).filter(t=>!us.some(e=>e.issuer.ticker===t&&!isPending(e)));
  const gaps=gold.entries.map(e=>({e,gaps:provenanceGaps(e)})).filter(x=>x.gaps.length>0).map(x=>`${x.e.issuer.ticker}/${x.e.concept}/${x.e.period_end}: ${x.gaps.join(',')}`);
  if(!gold.ready){
   console.warn(`GOLD INCOMPLETE (ready:false, not failing): ${gold.entries.filter(isPending).length}/${gold.entries.length} entries still <pending>; no recorded entry for ${missing.join(', ')||'-'}; incomplete provenance: ${gaps.join(' | ')||'-'}. Owner step (runbook 8.11-6) blocks F2-7.`);
  }else{
   // 1. required.US: an explicit, named failure when AAPL / MSFT are not recorded.
   if(gold.required.US)for(const t of Object.keys(CIK))expect(us.some(e=>e.issuer.ticker===t&&!isPending(e)),`gold entry for ${t} is still <pending> — owner step (runbook 8.11-6) blocks F2-7`).toBe(true);
   // 2. ready: no template left, and every entry carries its provenance (document, page/row, url, recorded_at).
   expect(gold.entries.filter(isPending).map(e=>`${e.issuer.ticker}/${e.concept}/${e.period_end}`),'pending entries in a ready gold file').toEqual([]);
   expect(gaps,'gold entries with incomplete provenance in a ready gold file').toEqual([]);
   for(const e of us)expect(e.issuer.ticker in CIK&&issuers[e.issuer.ticker]!==undefined,`${e.issuer.ticker}: no recorded fixture (record-fixture.ts --edgar, then add {ticker,cik,name} to FIXTURE_ISSUERS so it is provisioned and ingested)`).toBe(true);
   // 3. the §11.4 matrix PER PERIOD, counting only entries this suite replay-verifies: fixture-backed US entries, and CN entries
   //    only once a CN replay suite exists AND required.CN is true. Each of >= 6 issuers has >= 2 period_ends that each carry >= 6 concepts (round-2 N2).
   const counted=gold.entries.filter(e=>!isPending(e)&&(e.issuer.market==='US'?e.issuer.ticker in CIK:CN_REPLAY_SUITE&&gold.required.CN));
   const byIssuer=new Map<string,Map<string,Set<string>>>();
   for(const e of counted){const periods=byIssuer.get(e.issuer.ticker)??byIssuer.set(e.issuer.ticker,new Map()).get(e.issuer.ticker)!;(periods.get(e.period_end)??periods.set(e.period_end,new Set()).get(e.period_end)!).add(e.concept);}
   expect(byIssuer.size,'§11.4: at least 6 replay-verified issuers').toBeGreaterThanOrEqual(6);
   for(const [t,periods] of byIssuer){
    const full=[...periods].filter(([,concepts])=>concepts.size>=6).map(([p])=>p);
    expect(full.length,`${t}: at least 2 periods with >= 6 concepts each (have ${[...periods].map(([p,c])=>`${p}:${c.size}`).join(', ')})`).toBeGreaterThanOrEqual(2);
   }
  }
  // 3. every recorded US entry replays (asOf = as_of or today; the current row of that period and unit) — ready or not.
  for(const e of us.filter(e=>!isPending(e))){
   const issuer=issuers[e.issuer.ticker];
   expect(issuer,`no fixture-backed issuer for ${e.issuer.ticker}`).toBeDefined();
   const res=await db.readFacts(issuer,'US',{concepts:[e.concept],asOf:e.as_of??today(),from:e.period_end,to:e.period_end});
   const duration=e.duration??(conceptById(e.concept)?.nature==='instant'?'INSTANT':'12M');
   const row=res.rows.find(r=>r.period_end===e.period_end&&r.unit===e.unit&&r.duration===duration&&r.is_current);
   expect(row,`${e.issuer.ticker} ${e.concept} ${e.period_end} ${duration} ${e.unit}`).toBeDefined();
   expect(row!.value_text).toBe(e.value);
  }
 });
});
