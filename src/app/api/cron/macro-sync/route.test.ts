// src/app/api/cron/macro-sync/route.test.ts
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {collectableOf} from '@/lib/macro/catalog';
import type {MacroDeps} from '@/lib/macro/deps';
import {memoryMacroDb} from '@/lib/macro/memory-db';
import type {EvidenceInput} from '@/lib/macro/types';

const mocks=vi.hoisted(()=>({deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/macro/deps',()=>({productionMacroDeps:mocks.deps}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));

import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs='',headers:Record<string,string>=AUTH)=>new Request(`https://alpha.example/api/cron/macro-sync${qs?`?${qs}`:''}`,{headers});
const original=process.env.CRON_SECRET;
const FRED=collectableOf('fred_csv');
const codeOfUrl=(url:string)=>new URL(url).searchParams.get('id')!;
/** Tiny valid CSV per series: two daily points (Sep 30, Oct 1) or two monthly points a year apart. */
let early=false;   // true: one extra row in Jan 2000 so the persisted history reaches the start of the full backfill window
function csvFor(code:string){
 const def=FRED.find(d=>d.source!.seriesKey===code)!;
 if(early)return def.period==='day'?`observation_date,${code}\n2000-01-03,4.0\n2026-09-30,4.1\n2026-10-01,4.2\n`:`observation_date,${code}\n2000-01-01,50\n2025-09-01,50\n2026-09-01,51\n`;
 return def.period==='day'?`observation_date,${code}\n2026-09-30,4.1\n2026-10-01,4.2\n`:`observation_date,${code}\n2025-09-01,50\n2026-09-01,51\n`;
}
/** A deps member that fails the test on any use: preview must not touch it. */
const trap=(name:string)=>new Proxy({},{get:(_t,k)=>{throw new Error(`preview touched ${name}.${String(k)}`);}});
function fakeEvidence(){const puts:EvidenceInput[]=[];return {puts,async put(e:EvidenceInput){puts.push(e);return {objectPath:`fred_csv/${e.sha256}.csv`,status:'stored' as const};}};}

let fetchCalls:string[],failCodes:Set<string>,overrides:Map<string,string>,deps:MacroDeps,tables:ReturnType<typeof memoryTableClient>,evidence:ReturnType<typeof fakeEvidence>;
beforeEach(()=>{
 vi.clearAllMocks();process.env.CRON_SECRET='cron-secret';
 early=false;fetchCalls=[];failCodes=new Set();overrides=new Map();
 tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset']});evidence=fakeEvidence();
 const fetch=(async(input:string|URL|Request)=>{
  const url=String(input);fetchCalls.push(url);const code=codeOfUrl(url);
  return failCodes.has(code)?new Response('down',{status:503}):new Response(overrides.get(code)??csvFor(code),{status:200,headers:{'content-type':'application/csv'}});
 }) as typeof globalThis.fetch;
 deps={db:memoryMacroDb({tables}),evidence,tables,codeVersion:'a'.repeat(40),now:()=>new Date('2026-11-06T05:30:00Z'),fetch,sleep:async()=>{}};   // tables: finalizeBatch (第 6 稿)
 mocks.deps.mockImplementation(()=>deps);
 mocks.codeVersion.mockReturnValue('a'.repeat(40));
});
afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;});

describe('macro-sync cron',()=>{
 it('fails closed without CRON_SECRET and rejects a wrong bearer before building deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req())).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req('',{}))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();
 });
 it('validates preview and refuses a real run without a code version',async()=>{
  for(const qs of ['preview=0','preview=true','preview=1&preview=1'])expect((await GET(req(qs))).status,qs).toBe(400);
  mocks.codeVersion.mockReturnValue(null);
  const res=await POST(req());
  expect(res.status).toBe(503);expect((await res.json()).error.code).toBe('code_version_unavailable');
  expect(mocks.deps).not.toHaveBeenCalled();
 });
 it('preview=1 fetches and parses every FRED series with ZERO database writes and ZERO uploads',async()=>{
  mocks.codeVersion.mockReturnValue(null);   // preview needs no code version
  deps={...deps,db:trap('db') as MacroDeps['db'],evidence:trap('evidence') as MacroDeps['evidence'],tables:trap('tables') as MacroDeps['tables']};
  const res=await GET(req('preview=1'));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.preview).toBe(true);expect(body.ok).toBe(true);
  expect(fetchCalls.map(codeOfUrl).sort()).toEqual(FRED.map(d=>d.source!.seriesKey).sort());
  expect(fetchCalls.every(u=>u.includes('cosd=2000-01-01'))).toBe(true);
  expect(body.counts.fetched).toBe(2*FRED.length);
  const dgs=body.series.find((s:{series_id:string})=>s.series_id==='US_DGS10_D');
  expect(dgs).toMatchObject({points:2,first:'2026-09-30',last:'2026-10-01',sample:[{period_end:'2026-09-30',value_text:'4.1'},{period_end:'2026-10-01',value_text:'4.2'}]});
 });
 it('runs one macro.fred batch: evidence, observations, US derivation, finalizeBatch and freshness',async()=>{
  const res=await GET(req());
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({ok:true,status:'success',date:'2026-11-06'});
  expect(body.counts.failed).toBe(0);
  expect(body.counts.inserted).toBeGreaterThanOrEqual(2*FRED.length);   // natives plus derived rows
  expect(evidence.puts).toHaveLength(FRED.length);
  const [batch]=tables.rows('ingest_batches');
  expect(batch).toMatchObject({batch_id:body.batchId,producer:'ts-fred',dataset:'macro.fred',status:'success',triggered_by:'cron',code_version:'a'.repeat(40)});
  expect(tables.rows('dq_freshness')).toEqual([expect.objectContaining({dataset:'macro.fred',expected_cadence:'daily',consecutive_errors:0})]);
  expect((await deps.db.seriesHistory('US_DGS10_D',{maxRows:10})).map(o=>o.value_text)).toEqual(['4.1','4.2']);
  const derived=await deps.db.seriesHistory('US_DGS10',{maxRows:10});
  expect(derived.map(o=>[o.period_end,o.value_text,o.transform,o.batch_id])).toEqual([['2026-09-30','4.1','month_end@1',body.batchId]]);
  expect((await deps.db.seriesHistory('US_CPI_YOY',{maxRows:10})).map(o=>[o.period_end,o.value_text])).toEqual([['2026-09-30','2']]);
 });
 it('asks for a recent window once a series has data',async()=>{
  early=true;
  await GET(req());fetchCalls=[];
  await GET(req());
  const dff=fetchCalls.find(u=>codeOfUrl(u)==='DFF')!,cpi=fetchCalls.find(u=>codeOfUrl(u)==='CPIAUCSL')!;
  expect(dff).toContain('cosd=2025-10-02');expect(cpi).toContain('cosd=2020-11-01');
 });
 it('a failing series makes the batch partial; the rest is written and freshness stays ok',async()=>{
  failCodes.add('DFF');
  const body=await (await GET(req())).json();
  expect(body.status).toBe('partial');expect(body.ok).toBe(false);
  expect(body.errors).toContainEqual({code:'fetch_http_5xx',key:'US_FEDFUNDS_EFF_D'});
  expect(body.counts.failed).toBe(1);expect(body.native_counts.failed).toBe(1);
  expect(tables.rows('ingest_batches')[0]).toMatchObject({status:'partial',counts:{failed:1}});
  expect(fetchCalls.filter(u=>codeOfUrl(u)==='DFF')).toHaveLength(4);   // 1 try + 3 retries
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:0});
 });
 it('all series failing → failed batch, one more consecutive error, no observations',async()=>{
  for(const d of FRED)failCodes.add(d.source!.seriesKey);
  const body=await (await GET(req())).json();
  expect(body.status).toBe('failed');
  expect(body.counts.failed).toBe(FRED.length);expect(body.native_counts.failed).toBe(FRED.length);
  expect(tables.rows('ingest_batches')[0]).toMatchObject({status:'failed',counts:{failed:FRED.length}});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'macro.fred',consecutive_errors:1,last_ok_at:null});
  expect(await deps.db.seriesHistory('US_DGS10_D',{maxRows:10})).toEqual([]);
 });
 it('all series failing AFTER a populated run is still failed: no derivation, no duplicate inflation, freshness not refreshed (第 5 稿 P2-2)',async()=>{
  expect((await (await GET(req())).json()).status).toBe('success');
  for(const d of FRED)failCodes.add(d.source!.seriesKey);
  const body=await (await GET(req())).json();
  expect(body.status).toBe('failed');                                                              // derived duplicates no longer count as landed work
  expect(body.native_counts).toMatchObject({inserted:0,duplicates:0,versioned:0});
  expect(body.derived_counts).toEqual({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});   // derivation skipped
  expect(body.errors).toContainEqual({code:'no_native_outcomes'});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'macro.fred',consecutive_errors:1});
 });
 it('a fatal derivation abort after native writes (quarantine_link_failed) finalizes the batch FAILED with the actual counts; its rows stay ineligible (第 6 稿 P2-4)',async()=>{
  const mem=deps.db as ReturnType<typeof memoryMacroDb>;
  const write=mem.writeObservations.bind(mem);
  // derived rows come back as a stored quarantined conflict whose item cannot be bound (the memory db never saw the item) → IngestAbort
  mem.writeObservations=async(b,c,rows,t)=>rows.some(r=>'derived_from' in r)
   ?{inserted:0,duplicates:0,versioned:0,quarantined:1,conflicts:[{series_id:rows[0].series_id,period_end:rows[0].period_end,reason:'unexpected_revision',value_text:rows[0].value_text,current_value_text:null,observation_id:'00000000-0000-4000-8000-0000000000ab'}]}
   :write(b,c,rows,t);
  const res=await GET(req());
  expect(res.status).toBe(500);expect((await res.json()).error.code).toBe('sync_failed');
  const [batch]=tables.rows('ingest_batches');
  expect(batch).toMatchObject({status:'failed',counts:{inserted:2*FRED.length,quarantined:1,failed:0}});   // native writes + the aborted derivation's committed outcome — not 'partial'
  expect(batch.errors).toContainEqual(expect.objectContaining({code:'quarantine_link_failed'}));
  expect(await deps.db.latestEligible(['US_DGS10_D'])).toEqual([]);                                // a failed batch's rows never publish
  expect((deps.db as ReturnType<typeof memoryMacroDb>).allObservations().filter(o=>o.series_id==='US_DGS10_D'&&o.batch_id===batch.batch_id).length).toBe(2);                  // written (ok) but ineligible
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'macro.fred',consecutive_errors:1});
 });
 it('a native abort after a committed retrieval (四轮 P2-2): stored counters equal the committed rows, batch failed',async()=>{
  const [a,b]=FRED;expect([a.period,b.period]).toEqual(['day','day']);
  expect((await (await GET(req())).json()).status).toBe('success');
  const code=(d:typeof a)=>d.source!.seriesKey;
  overrides.set(code(a),`observation_date,${code(a)}\n2026-10-02,4.3\n2026-10-05,4.4\n`);                    // two new periods: inserted 2
  overrides.set(code(b),`observation_date,${code(b)}\n2026-09-30,4.1\n2026-10-01,4.15\n`);                   // duplicate + an older-dated different value
  deps.now=()=>new Date('2026-11-05T05:30:00Z');                                                     // fetched before run 1 → stale_delivery, stored quarantined; its item cannot be bound
  const res=await GET(req());
  expect(res.status).toBe(500);
  const batch=tables.rows('ingest_batches').find(r=>r.status==='failed')!;
  const mine=(deps.db as ReturnType<typeof memoryMacroDb>).allObservations().filter(o=>o.series_id===a.id&&o.batch_id===batch.batch_id&&o.status==='ok').length;
  const quarantinedRows=(deps.db as ReturnType<typeof memoryMacroDb>).allObservations().filter(o=>o.batch_id===batch.batch_id&&o.status==='quarantined').length;
  expect([mine,quarantinedRows]).toEqual([2,1]);
  expect(batch.counts).toEqual({fetched:4,inserted:2,duplicates:1,versioned:0,quarantined:1,failed:0});      // before: all six were zero
  expect(batch.errors).toContainEqual(expect.objectContaining({code:'quarantine_link_failed'}));
  expect(tables.rows('dq_freshness')[0]).toMatchObject({consecutive_errors:1});
 });
 it('keeps the full window until the backfill reaches 2000: a series with only recent rows is refetched in full',async()=>{
  await GET(req());fetchCalls=[];
  await GET(req());
  expect(fetchCalls.every(u=>u.includes('cosd=2000-01-01'))).toBe(true);
 });
 it('a failed backfill write keeps the full window next run (T7-2)',async()=>{
  early=true;
  const mem=deps.db as ReturnType<typeof memoryMacroDb>;
  const write=mem.writeObservations.bind(mem);let failed=0;
  mem.writeObservations=async(b,c,rows,t)=>{if(rows.some(r=>r.series_id==='US_FEDFUNDS_EFF_D')&&failed===0){failed++;throw new Error('boom');}return write(b,c,rows,t);};
  const body=await (await GET(req())).json();
  expect(body.status).toBe('partial');expect(body.counts.failed).toBe(3);
  fetchCalls=[];
  await GET(req());
  const dff=fetchCalls.find(u=>codeOfUrl(u)==='DFF')!,dgs=fetchCalls.find(u=>codeOfUrl(u)==='DGS10')!;
  expect(dff).toContain('cosd=2000-01-01');expect(dgs).toContain('cosd=2025-10-02');
 });
 it('a parse failure keeps the evidence and retrieval id in the batch error and counts one failed series (T7-1/T7-3)',async()=>{
  overrides.set('DFF','not,a\nvalid csv');
  const body=await (await GET(req())).json();
  const stored=tables.rows('ingest_batches')[0].errors as {code:string;key?:string;message?:string}[];
  const e=stored.find(x=>x.key==='US_FEDFUNDS_EFF_D')!;
  expect(e.code.startsWith('parse_')).toBe(true);expect(e.message).toMatch(/^retrieval [0-9a-f-]{36}: /);
  expect(evidence.puts).toHaveLength(FRED.length);                                                 // the bad bytes were stored too
  expect(body.counts.failed).toBe(1);expect(body.errors.find((x:{key?:string})=>x.key==='US_FEDFUNDS_EFF_D')).toEqual({code:e.code,key:'US_FEDFUNDS_EFF_D'});
 });
 it('is scheduled daily at 05:30 UTC in vercel.json',()=>{
  const cfg=JSON.parse(readFileSync(new URL('../../../../../vercel.json',import.meta.url),'utf8')) as {crons:{path:string;schedule:string}[]};
  expect(cfg.crons).toContainEqual({path:'/api/cron/macro-sync',schedule:'30 5 * * *'});
 });
});
