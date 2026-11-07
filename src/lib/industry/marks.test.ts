// src/lib/industry/marks.test.ts
import {describe,it,expect,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {memoryTableClient} from '../db/memory-table-client';
import type {TableClient} from '../db/table-client';
import {decMul} from './decimal';
import {memoryIndustryDb} from './memory-industry-db';
import {fetchDailyBasic,fixtureTushareCall} from './providers/tushare-industry';
import {planMarkRows,runMarks,upstreamOf} from './marks';
import type {DailyBasicFetch,DailyBasicRow,MarksDeps} from './marks';
import {IndustryDbError} from './types';
import type {IndustryDb} from './types';

const DATE='2026-10-30';
/** Test loader: the ten recorded daily_basic rows of 2026-10-30 through the Task 5 adapter (lossless decimals). */
async function loadFixture(edit:(r:DailyBasicRow)=>DailyBasicRow=r=>r):Promise<DailyBasicFetch>{
 const pages=await fetchDailyBasic(fixtureTushareCall(),{tradeDate:'20261030'},{sleep:async()=>{}});
 return {trade_date:DATE,pages:pages.length,rows:pages.flatMap(p=>p.rows.map((r,row)=>edit({...r,page:p.page,row,page_sha256:p.raw_hash})))};
}
// synthetic edits of real responses (the real rows all pass every rule): 600036.SH market value off by 2%,
// 000001.SZ close above the range (total_mv kept consistent), 600887.SH close missing; 601398.SH is left out of the universe
const RULE_CASES=(r:DailyBasicRow):DailyBasicRow=>r.ts_code==='600036.SH'?{...r,total_mv:decMul(r.total_mv!,'1.02')}:r.ts_code==='000001.SZ'?{...r,close:'150000',total_mv:decMul('150000',r.total_share!)}:r.ts_code==='600887.SH'?{...r,close:null}:r;
const UNIVERSE=['000001.SZ','000858.SZ','000869.SZ','600036.SH','600519.SH','600887.SH','601166.SH','601318.SH','603288.SH'];
const rowsOf=(t:TableClient,table:string)=>(t as unknown as {rows(x:string):Record<string,unknown>[]}).rows(table);

describe('planMarkRows',()=>{
 it('converts 万股 to shares exactly (total_share and free_share), maps the exchange, applies the identity and range rules, skips and rejects',async()=>{
  const p=planMarkRows(await loadFixture(RULE_CASES),new Set(UNIVERSE));
  expect(p.rows.map(r=>[r.ticker,r.close,r.total_share,r.free_share,r.upstream,r.status])).toEqual([
   ['000001.SZ','150000','19405918198','8160565553','szse','quarantined'],   // close above the 100000 range
   ['000858.SZ','74.7','3881608005','1706512403','szse','ok'],
   ['000869.SZ','16.91','643280128','109581764','szse','ok'],
   ['600036.SH','43.55','25219845601','11718361832','sse','quarantined'],   // total_mv edited +2%: mcap_vs_tushare fails
   ['600519.SH','1392.05','1250081601','568798666','sse','ok'],
   ['601166.SH','19.65','21162864665','16540719840','sse','ok'],
   ['601318.SH','52.8','18107641995','9697345981','sse','ok'],
   ['603288.SH','34.86','5843973444','1452954658','sse','ok'],
  ]);
  expect(p.quarantined.map(q=>[q.ticker,q.reason])).toEqual([['000001.SZ','close_range'],['600036.SH','mcap_mismatch']]);
  expect(p.quarantined[1].detail).toMatchObject({rule:'mcap_vs_tushare',market_cap:'1098324275923.55',tushare_market_cap:'1120290761397.6'});
  expect(p.skipped).toEqual({not_in_universe:1});
  expect(p.rejected).toEqual([{ticker:'600887.SH',reason:'invalid_value'}]);
  const r=p.rows.find(x=>x.ticker==='600519.SH')!;
  expect(r).toMatchObject({trade_date:DATE,source:'tushare:daily_basic',locator:{api:'daily_basic',trade_date:DATE,page:1,row:4,transform:'wan_to_unit'}});
  expect(r.raw_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(planMarkRows(await loadFixture(RULE_CASES),new Set(UNIVERSE)).rows.map(x=>x.raw_hash)).toEqual(p.rows.map(x=>x.raw_hash));
  // the real rows pass every rule (K2: total_mv = close × total_share exactly)
  expect(planMarkRows(await loadFixture(),new Set([...UNIVERSE,'601398.SH'])).quarantined).toEqual([]);
 });
 it('free_share missing or non-positive is stored as null; upstream from the suffix only; a date mismatch is rejected and an identical duplicate row collapses',async()=>{
  const nf=planMarkRows(await loadFixture(r=>r.ts_code==='600519.SH'?{...r,free_share:null}:r.ts_code==='000858.SZ'?{...r,free_share:'0'}:r),new Set(UNIVERSE));
  expect(nf.rows.filter(x=>x.ticker==='600519.SH'||x.ticker==='000858.SZ').map(x=>x.free_share)).toEqual([null,null]);
  expect([upstreamOf('600001.sh'),upstreamOf('000002.SZ'),upstreamOf('830003.BJ'),upstreamOf('00700.HK')]).toEqual(['sse','szse','bse',null]);
  const f=await loadFixture();
  const p=planMarkRows({...f,rows:[{...f.rows[0],trade_date:'20261029'},f.rows[1],{...f.rows[1],row:99}]},new Set(UNIVERSE));
  expect(p.rejected).toEqual([{ticker:'000001.SZ',reason:'date_mismatch'}]);expect(p.conflicts).toEqual([]);
  expect(p.rows).toHaveLength(1);
 });
});

describe('planMarkRows duplicates',()=>{
 it('conflicting rows for one ticker/date publish nothing and are parked with both locators, in either page order',async()=>{
  const f=await loadFixture();
  const a=f.rows.find(r=>r.ts_code==='600519.SH')!;
  const b={...a,close:'1400',total_mv:decMul('1400',a.total_share!),page:2,row:0,page_sha256:'e'.repeat(64)};
  for(const rows of [[a,b],[b,a]]){
   const p=planMarkRows({...f,rows},new Set(UNIVERSE));
   expect(p.rows).toEqual([]);
   expect(p.conflicts).toHaveLength(1);
   expect(p.conflicts[0]).toMatchObject({ticker:'600519.SH',reason:'mark_conflict'});
   expect((p.conflicts[0].detail.locators as {page:number}[]).map(l=>l.page)).toEqual([a.page,2]);   // sorted by page,row: same both ways
  }
 });
});

describe('runMarks',()=>{
 let tables:TableClient;let db:IndustryDb;
 const deps=(fetch:()=>DailyBasicFetch|Promise<DailyBasicFetch>,over:Partial<MarksDeps>={}):MarksDeps=>({tables,db,now:()=>new Date('2026-10-31T02:00:00.000Z'),codeVersion:'b'.repeat(40),fetchDailyBasic:async()=>fetch(),...over});
 beforeEach(async()=>{
  tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id'],stocks_universe:['ticker']});
  for(const t of UNIVERSE)await tables.insert('stocks_universe',{ticker:t,name:t,market:'A'});
  db=memoryIndustryDb({tables});
 });
 it('first run: rule failures are stored as quarantined observations and parked; the invalid row is rejected',async()=>{
  const r1=await runMarks(deps(()=>loadFixture(RULE_CASES)),{tradeDates:[DATE]});
  expect(r1).toMatchObject({status:'done',batchStatus:'partial'});   // the invalid row is a rejection
  expect(r1.dates[0]).toMatchObject({fetched:10,attempts:1,result:{inserted:8,duplicates:0,superseded:0}});
  expect(r1.counts).toMatchObject({fetched:9,inserted:8,quarantined:2,failed:1});
  const q=rowsOf(tables,'dq_quarantine');
  expect(q.filter(x=>x.reason_code==='mcap_mismatch').map(x=>x.natural_key)).toEqual([`600036.SH:${DATE}`]);
  expect(q.filter(x=>x.reason_code==='close_range').map(x=>x.natural_key)).toEqual([`000001.SZ:${DATE}`]);
  expect(await db.currentMarksOn(DATE,['600036.SH','000001.SZ'])).toEqual([]);                    // quarantined observations are never current
  expect((await db.currentMarksOn(DATE,['600519.SH']))[0]).toMatchObject({close:'1392.05',total_share:'1250081601',free_share:'568798666',upstream:'sse'});
  expect(rowsOf(tables,'dq_freshness').find(x=>x.dataset==='industry.marks')).toMatchObject({expected_cadence:'weekly',consecutive_errors:0});
 });
 // The A→B→A and V7 cases use three real tickers; B is a synthetic edit of a real response (600519.SH close revised).
 const CLEAN=['600519.SH','000858.SZ','603288.SH'];
 const A=async()=>{const f=await loadFixture();return {...f,rows:f.rows.filter(r=>CLEAN.includes(r.ts_code))};};
 const B=async()=>{const f=await loadFixture(r=>r.ts_code==='600519.SH'?{...r,close:'1392.06',total_mv:decMul('1392.06',r.total_share!)}:r);return {...f,rows:f.rows.filter(r=>CLEAN.includes(r.ts_code))};};
 const F=async()=>{const f=await loadFixture(r=>r.ts_code==='600519.SH'?{...r,free_share:'56880'}:r);return {...f,rows:f.rows.filter(r=>CLEAN.includes(r.ts_code))};};
 it('A → B → A: three fetch events, three observations, the third current; apply_observations quarantines each revision as mark_revised',async()=>{
  const r1=await runMarks(deps(A),{tradeDates:[DATE]});
  expect(r1.dates[0].result).toEqual({inserted:3,duplicates:0,superseded:0});
  const r2=await runMarks(deps(B),{tradeDates:[DATE]});
  expect(r2.dates[0].result).toEqual({inserted:0,duplicates:2,superseded:1});
  const r3=await runMarks(deps(A),{tradeDates:[DATE]});
  expect(r3.dates[0].result).toEqual({inserted:0,duplicates:2,superseded:1});   // A again is a new version, not a duplicate of the superseded A
  const events=[r1,r2,r3].map(r=>r.dates[0].fetch_event_id);
  expect(new Set(events).size).toBe(3);
  const cur=await db.currentMarksOn(DATE,['600519.SH']);
  expect(cur).toHaveLength(1);
  expect(cur[0]).toMatchObject({close:'1392.05',total_share:'1250081601',fetch_event_id:events[2],upstream:'sse',status:'ok'});
  expect(r2.counts).toMatchObject({versioned:1,duplicates:2,inserted:0});
  expect(rowsOf(tables,'dq_quarantine').filter(x=>x.reason_code==='mark_revised').map(x=>x.natural_key)).toEqual([`600519.SH:${DATE}`]);   // one open item per key (reused)
 });
 it('a free_share revision alone is a new observation (content = close, total_share, free_share)',async()=>{
  await runMarks(deps(A),{tradeDates:[DATE]});
  const r=await runMarks(deps(F),{tradeDates:[DATE]});
  expect(r.dates[0].result).toEqual({inserted:0,duplicates:2,superseded:1});
  expect((await db.currentMarksOn(DATE,['600519.SH']))[0]).toMatchObject({close:'1392.05',free_share:'568800000'});
 });
 it('V7: a retried event whose content is unchanged stays a duplicate even after a later event changed the current observation',async()=>{
  await runMarks(deps(A),{tradeDates:[DATE]});                       // E1: A
  const e2=(await runMarks(deps(A),{tradeDates:[DATE]})).dates[0];    // E2: A again → all duplicates
  expect(e2.result).toEqual({inserted:0,duplicates:3,superseded:0});
  await runMarks(deps(B),{tradeDates:[DATE]});                       // E3: B
  await db.retryFetchEvent(e2.fetch_event_id!);                       // retry E2 with its own payload A
  const rowsA=planMarkRows(await A(),new Set(UNIVERSE)).rows;
  expect(await db.applyObservations('marks',e2.fetch_event_id!,rowsA)).toEqual({inserted:0,duplicates:3,superseded:0});
  expect((await db.currentMarksOn(DATE,['600519.SH']))[0].close).toBe('1392.06');   // B stays current
  await expect(db.applyObservations('marks',e2.fetch_event_id!,planMarkRows(await B(),new Set(UNIVERSE)).rows)).rejects.toMatchObject({code:'fetch_event_payload_changed'});
 });
 it('retries a failed apply with the same fetch event (attempt + 1), never begins a second event for the date',async()=>{
  const calls:string[]=[];let fail=1;
  const flaky={...db,
   beginFetchEvent:async(j:string,p:Record<string,unknown>,b:string)=>{const id=await db.beginFetchEvent(j,p,b);calls.push(`begin:${id}`);return id;},
   retryFetchEvent:async(id:string)=>{calls.push(`retry:${id}`);await db.retryFetchEvent(id);},
   applyObservations:(async(k:'marks',id:string,rows:never[])=>{calls.push(`apply:${id}`);if(fail-->0)throw new Error('network reset');return db.applyObservations(k,id,rows);}) as IndustryDb['applyObservations'],
  } as IndustryDb;
  const r=await runMarks(deps(()=>loadFixture(),{db:flaky}),{tradeDates:[DATE]});
  const id=r.dates[0].fetch_event_id!;
  expect(calls).toEqual([`begin:${id}`,`apply:${id}`,`retry:${id}`,`apply:${id}`]);
  expect(r.dates[0]).toMatchObject({attempts:2,result:{inserted:9}});
  fail=5;
  const bad=await runMarks(deps(()=>loadFixture(),{db:flaky}),{tradeDates:[DATE],maxApplyAttempts:2});
  expect(bad.dates[0]).toMatchObject({error:'apply_failed',attempts:2});
  expect(bad.batchStatus).toBe('failed');
  const payload={...db,applyObservations:(async()=>{throw new IndustryDbError('fetch_event_payload_changed');}) as IndustryDb['applyObservations']} as IndustryDb;
  expect((await runMarks(deps(()=>loadFixture(),{db:payload}),{tradeDates:[DATE]})).dates[0]).toMatchObject({error:'fetch_event_payload_changed',attempts:1});
 });
 it('empty days are skipped_summary(no_rows); quota stops the job; no code version → rejected',async()=>{
  const r=await runMarks(deps(()=>({trade_date:DATE,rows:[],pages:1})),{tradeDates:[DATE,'2026-10-23']});
  expect(r.dates.map(d=>d.skipped)).toEqual([{no_rows:1},{no_rows:1}]);
  expect(r.batchStatus).toBe('success');
  // synthetic: the fetch answers a quota error
  const quota=Object.assign(new Error('积分不足'),{code:'quota_exhausted'});
  const q=await runMarks(deps(()=>{throw quota;}),{tradeDates:['2026-10-23',DATE]});
  expect(q.dates).toHaveLength(1);expect(q.dates[0].error).toBe('quota_exhausted');expect(q.batchStatus).toBe('failed');
  expect(await runMarks(deps(()=>loadFixture(),{codeVersion:null}),{tradeDates:[DATE]})).toMatchObject({status:'rejected',code:'code_version_missing',batchId:null});
  await expect(runMarks(deps(()=>loadFixture()),{tradeDates:['2026-10-3']})).rejects.toThrow('invalid_date');
 });
 it('a conflicting duplicate is quarantined mark_conflict and no observation is written',async()=>{
  const mk=async()=>{const f=await loadFixture();const a=f.rows.find(r=>r.ts_code==='600519.SH')!;return {...f,rows:[...f.rows,{...a,close:'1400',total_mv:decMul('1400',a.total_share!),page:2,row:0}]};};
  const r=await runMarks(deps(mk),{tradeDates:[DATE]});
  expect(rowsOf(tables,'dq_quarantine').filter(x=>x.reason_code==='mark_conflict').map(x=>x.natural_key)).toEqual([`600519.SH:${DATE}`]);
  expect(await db.currentMarksOn(DATE,['600519.SH'])).toEqual([]);
  expect(r.dates[0].result).toMatchObject({inserted:8});
 });
 it('rule failures of a committed chunk are parked even when a later chunk fails',async()=>{
  const big=async()=>{const f=await loadFixture(RULE_CASES);
   const extra:DailyBasicRow[]=[];
   for(let i=0;i<600;i++){const t=`${String(300000+i)}.SZ`;extra.push({ts_code:t,trade_date:'20261030',close:'10',total_share:'100',free_share:'50',total_mv:'1000',page:3,row:i,page_sha256:'d'.repeat(64)});}
   return {...f,rows:[...f.rows,...extra]};};
  for(let i=0;i<600;i++)await tables.insert('stocks_universe',{ticker:`${String(300000+i)}.SZ`,name:'x',market:'A'});
  let n=0;
  const flaky={...db,applyObservations:(async(k:'marks',id:string,rows:never[])=>{if(++n>=2)throw new Error('network reset');return db.applyObservations(k,id,rows);}) as IndustryDb['applyObservations']} as IndustryDb;
  const r=await runMarks(deps(big,{db:flaky}),{tradeDates:[DATE],maxApplyAttempts:1});
  expect(r.dates[0].error).toBe('apply_failed');
  const q=rowsOf(tables,'dq_quarantine').filter(x=>x.reason_code==='mcap_mismatch'||x.reason_code==='close_range');
  expect(q.map(x=>x.natural_key)).toEqual([`000001.SZ:${DATE}`]);   // chunk 1 (committed) holds 000001.SZ; 600036.SH sorts into the failed chunk 2, whose rows were not applied
 });
 it('skip-only days are a success; a day with only rejected rows is not a fresh attempt; IndustryDbError is not retried; a failing retry fails only its date',async()=>{
  const skipOnly=async()=>{const f=await loadFixture();return {...f,rows:f.rows.filter(r=>r.ts_code==='601398.SH')};};
  const s=await runMarks(deps(skipOnly),{tradeDates:[DATE]});
  expect(s.batchStatus).toBe('success');expect(s.counts.fetched).toBe(0);
  const invalid=async()=>{const f=await loadFixture(r=>({...r,close:null}));return f;};
  const bad=await runMarks(deps(invalid),{tradeDates:[DATE]});
  expect(bad.batchStatus).toBe('failed');
  expect(rowsOf(tables,'dq_freshness').find(x=>x.dataset==='industry.marks')).toMatchObject({consecutive_errors:1});
  let calls=0;
  const typed={...db,applyObservations:(async()=>{calls++;throw new IndustryDbError('lease_lost');}) as IndustryDb['applyObservations']} as IndustryDb;
  const t=await runMarks(deps(()=>loadFixture(),{db:typed}),{tradeDates:[DATE]});
  expect(calls).toBe(1);expect(t.dates[0].error).toBe('lease_lost');
  let applies=0;
  const retryFail={...db,
   applyObservations:(async(k:'marks',id:string,rows:never[])=>{if(++applies===1)throw new Error('reset');return db.applyObservations(k,id,rows);}) as IndustryDb['applyObservations'],
   retryFetchEvent:(async()=>{throw new Error('db down');}) as IndustryDb['retryFetchEvent'],
  } as IndustryDb;
  const perDate=async(d:string)=>({...(await loadFixture(r=>({...r,trade_date:d.replace(/-/g,'')}))),trade_date:d});
  const r=await runMarks(deps(()=>loadFixture(),{db:retryFail,fetchDailyBasic:perDate}),{tradeDates:[DATE,'2026-10-31']});
  expect(r.dates).toHaveLength(2);expect(r.dates[0].error).toBe('retry_failed');expect(r.dates[1].result).toMatchObject({inserted:9});
 });
});
