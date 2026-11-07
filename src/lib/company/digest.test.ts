// src/lib/company/digest.test.ts
// runCompanyDigest on memoryCompanyDb + memoryFactsDb (spec §6.3, §12.1). Real startBatch/finishBatch/
// recordAttempt over a memory TableClient so batch status and the "no unaccounted" invariant are real.
import {randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {factInsert,filingInsert} from '@/lib/facts/db-contract';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import type {MemoryFactsDb} from '@/lib/facts/memory-facts-db';
import type {Market} from '@/lib/facts/types';
import {DigestError,interleave,runCompanyDigest,selectStreams} from './digest';
import type {DigestDeps} from './digest';
import {deriveIssuerEvents} from './events';
import {memorySnapshotObjectStore} from './evidence-index';
import {memoryCompanyDb} from './memory-company-db';
import type {MemoryCompanyDb} from './memory-company-db';
import {memorySnapshotReader} from './snapshot-read';
import {summarizeCoverage} from './coverage';
import {CompanyDbError} from './types';
import type {CompanyDb,DueStream} from './types';

const CODE='a'.repeat(40);
function harness(){
 const tables=memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
 const facts=memoryFactsDb(tables);
 const mem=memoryCompanyDb({facts});
 // memoryCompanyDb has no ingest_batches table: every batch id the digest passes was opened by startBatch
 // (producer 'company-digest', status 'running'), so register it on the way in.
 const db:MemoryCompanyDb={...mem,replaceDigest:(i,m,b,...rest)=>{mem.registerBatch(b);return mem.replaceDigest(i,m,b,...rest);}};
 const deps:DigestDeps={db,tables,readSnapshot:memorySnapshotReader(facts),facts,reader:memorySnapshotObjectStore(new Map()),now:()=>new Date(),deadline:null,codeVersion:CODE};
 return {tables,facts,db,deps};
}
type H=ReturnType<typeof harness>;
async function stream(h:H,market:Market='US'){const id=randomUUID();await h.facts.reconcileScope(market,[{issuer_id:id,reasons:['t'],priority:1,fetch_key:`k-${id}`}]);return id;}
async function disclose(facts:MemoryFactsDb,issuer:string,availableDate:string,value:string,concept='revenue'){
 const b=randomUUID();
 expect(await facts.claimLease(issuer,'US',b,600)).toBe(true);
 const run=await facts.beginRun(issuer,'US',b,1);
 const f=filingInsert(issuer,{availableDate,periodEnd:'2023-12-31'});
 await facts.stageFilings(run,[f]);
 const x=factInsert(issuer,f,{value,concept,period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M'});
 await facts.stageFacts(run,[x]);await facts.publishRun(run,[f.filing_id]);
 await facts.releaseLease(issuer,'US',b,'success',new Date(Date.now()+86_400_000).toISOString());
 return {factId:x.fact_id,filingId:f.filing_id};
}
const batchRow=(h:H)=>h.tables.rows('ingest_batches').at(-1)!;
const freshness=(h:H)=>h.tables.rows('dq_freshness').find(r=>r.dataset==='company.events')!;
const active=async(db:CompanyDb,issuer:string)=>(await db.eventsOfIssuer(issuer,'US',{limit:200})).rows;
const due=(issuerId:string,stateRev=1,digestedRev=0,market:Market='US'):DueStream=>({issuerId,market,stateRev,digestedRev});

describe('selection',()=>{
 it('interleaves four incremental streams with one sweep stream, then drains the rest',()=>{
  expect(interleave([1,2,3,4,5,6,7,8,9],['a','b','c'])).toEqual([1,2,3,4,'a',5,6,7,8,'b',9,'c']);
  expect(interleave([],['a','b'])).toEqual(['a','b']);expect(interleave([1,2],[])).toEqual([1,2]);
 });
 it('80/20 budget with integer arithmetic, 7-day sweep age, dedupe (both lists → sweep=true, moved to the sweep list), market filter',async()=>{
  const digestDue=vi.fn(async()=>[due('i1'),due('i2'),due('x'),due('c1',1,0,'CN')]);
  const sweepDue=vi.fn(async()=>[due('x',1,1),due('s1',1,1)]);
  const now=new Date('2026-11-06T12:00:00.000Z');
  const deps={db:{digestDue,sweepDue}} as unknown as DigestDeps;
  const plan=await selectStreams(deps,{mode:'incremental',limit:200},now);
  expect(digestDue).toHaveBeenCalledWith(now,160,undefined);
  expect(sweepDue).toHaveBeenCalledWith(new Date('2026-10-30T12:00:00.000Z'),now,40,undefined);
  expect(plan.map(p=>[p.issuerId,p.sweep,p.source])).toEqual([['i1',false,'incremental'],['i2',false,'incremental'],['c1',false,'incremental'],['x',true,'sweep'],['s1',true,'sweep']]);
  expect((await selectStreams(deps,{mode:'incremental',limit:7,market:'CN'},now)).map(p=>p.issuerId)).toEqual(['c1']);
  expect(digestDue).toHaveBeenLastCalledWith(now,6,'CN');expect(sweepDue).toHaveBeenLastCalledWith(expect.any(Date),now,1,'CN');
  sweepDue.mockClear();await selectStreams(deps,{mode:'incremental',limit:4},now);expect(sweepDue).not.toHaveBeenCalled();
 });
 it('overlap keeps the sweep share: 160 incremental + 40 sweep overlapping positions 121-160 → 4 sweeps in the first 20',async()=>{
  const inc=Array.from({length:160},(_,i)=>due(`i${i+1}`)),sw=inc.slice(120).map(d=>({...d,digestedRev:1}));
  const deps={db:{digestDue:async()=>inc,sweepDue:async()=>sw}} as unknown as DigestDeps;
  const plan=await selectStreams(deps,{mode:'incremental',limit:200},new Date('2026-11-06T12:00:00.000Z'));
  expect(plan).toHaveLength(160);expect(plan.slice(0,20).filter(p=>p.sweep)).toHaveLength(4);
  expect(plan.filter(p=>p.sweep).map(p=>p.issuerId)).toEqual(sw.map(d=>d.issuerId));
 });
 it('full mode: explicit issuers via scopeRows per market, otherwise scopeAll; all sweep; issuerIds without full is rejected',async()=>{
  const h=harness();const a=await stream(h),b=await stream(h),c=await stream(h,'CN');
  const all=await selectStreams(h.deps,{mode:'full'},new Date());
  expect(all.filter(p=>p.market==='US').map(p=>p.issuerId)).toEqual([a,b].sort());
  expect(all.filter(p=>p.market==='CN').map(p=>p.issuerId)).toEqual([c]);
  expect(all.every(p=>p.sweep&&p.source==='full')).toBe(true);
  expect((await selectStreams(h.deps,{mode:'full',issuerIds:[b,b],market:'US'},new Date())).map(p=>p.issuerId)).toEqual([b]);
  await expect(runCompanyDigest(h.deps,{mode:'incremental',issuerIds:[a]})).rejects.toMatchObject({code:'invalid_options'});
 });
});

describe('runCompanyDigest',()=>{
 it('rejects apply without a code version and writes no batch',async()=>{
  const h=harness();
  await expect(runCompanyDigest({...h.deps,codeVersion:null},{mode:'incremental'})).rejects.toBeInstanceOf(DigestError);
  await expect(runCompanyDigest({...h.deps,codeVersion:''},{mode:'incremental'})).rejects.toMatchObject({code:'code_version_missing'});
  expect(h.tables.rows('ingest_batches')).toEqual([]);
 });
 it('first run materializes due streams (inserted per stream), evidence before events; second run sweeps unchanged (duplicates, first_seen_at kept); third run is idle',async()=>{
  const h=harness();const a=await stream(h),b=await stream(h);
  await disclose(h.facts,a,'2024-02-01','100');await disclose(h.facts,b,'2024-03-01','5');
  const order:string[]=[];
  const db:CompanyDb={...h.db,replaceEvidence:async(...x)=>{order.push(`evidence:${x[0]}`);return h.db.replaceEvidence(...x);},replaceDigest:async(...x)=>{order.push(`digest:${x[0]}`);return h.db.replaceDigest(...x);}};
  const r1=await runCompanyDigest({...h.deps,db},{mode:'incremental',limit:4,triggeredBy:'cron'});   // limit 4 → sweep quota 0, so swept_at stays null
  expect(r1.status).toBe('success');
  expect(r1.counts).toEqual({fetched:2,inserted:2,duplicates:0,versioned:0,quarantined:0,failed:0});
  for(const id of [a,b])expect(order.indexOf(`evidence:${id}`)).toBeLessThan(order.indexOf(`digest:${id}`));
  expect(batchRow(h)).toMatchObject({producer:'company-digest',dataset:'company.events',status:'success',code_version:CODE,triggered_by:'cron'});
  expect((batchRow(h).tool_versions as Record<string,string>).events).toBe('company-events/1');
  expect(freshness(h)).toMatchObject({consecutive_errors:0,expected_cadence:'daily'});
  const before=await active(h.db,a);
  expect(before.map(e=>e.kind).sort()).toEqual(['filing_published','period_first_seen']);
  const r2=await runCompanyDigest(h.deps,{mode:'incremental'});
  expect(r2.counts).toMatchObject({fetched:2,inserted:0,duplicates:2,failed:0});
  expect(r2.detail).toMatchObject({swept:2,succeeded:2,events:{changed:0,retired:0,revived:0}});
  expect((await active(h.db,a)).map(e=>[e.event_id,e.first_seen_at])).toEqual(before.map(e=>[e.event_id,e.first_seen_at]));
  const r3=await runCompanyDigest(h.deps,{mode:'incremental'});
  expect(r3).toMatchObject({idle:true,counts:{fetched:0}});expect(r3.detail.idle).toBe(true);
 });
 it('a later revision → exactly one new fact_revised on the next incremental run',async()=>{
  const h=harness();const a=await stream(h);
  await disclose(h.facts,a,'2024-02-01','100');
  await runCompanyDigest(h.deps,{mode:'incremental'});
  await disclose(h.facts,a,'2025-02-01','120');
  const r=await runCompanyDigest(h.deps,{mode:'incremental'});
  expect(r.counts.inserted).toBe(1);
  const revised=(await active(h.db,a)).filter(e=>e.kind==='fact_revised');
  expect(revised).toHaveLength(1);expect(revised[0].payload).toMatchObject({relChange:'0.2'});
 });
 it('stale_computation → re-read and recompute once with the same attempt id',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');
  let raced=false;const attempts:number[]=[];const evAttempts:number[]=[];
  const deps:DigestDeps={...h.deps,
   readSnapshot:async(...x)=>{const env=await h.deps.readSnapshot(...x);if(!raced){raced=true;await disclose(h.facts,a,'2024-05-01','101');}return env;},
   db:{...h.db,replaceEvidence:async(...x)=>{evAttempts.push(x[2]);return h.db.replaceEvidence(...x);},replaceDigest:async(...x)=>{attempts.push(x[3]);return h.db.replaceDigest(...x);}}};
  const r=await runCompanyDigest(deps,{mode:'incremental'});
  expect(r.streams[0]).toMatchObject({outcome:'changed',retried:true});
  // the evidence fence (first write) catches the race, so the stale pass never reaches replaceDigest
  expect(evAttempts).toHaveLength(2);expect(evAttempts[0]).toBe(evAttempts[1]);expect(attempts).toEqual([evAttempts[0]]);
  expect((await h.db.digestState(a,'US'))?.digested_rev).toBe(r.streams[0].basedOnRev);
 });
 it('storageError in the evidence index → no evidence/digest write, failed evidence_index_failed, backed off',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');
  const ev=vi.fn(h.db.replaceEvidence),rd=vi.fn(h.db.replaceDigest),mark=vi.spyOn(h.db,'markDigestFailed');
  const failing:DigestDeps['reader']={get:async()=>{throw new Error('storage 500');},meta:async()=>{throw new Error('storage 500');}} as unknown as DigestDeps['reader'];
  const r=await runCompanyDigest({...h.deps,reader:failing,db:{...h.db,replaceEvidence:ev,replaceDigest:rd,markDigestFailed:mark}},{mode:'incremental'});
  expect(r.streams[0]).toMatchObject({outcome:'failed',code:'evidence_index_failed'});
  expect(ev).not.toHaveBeenCalled();expect(rd).not.toHaveBeenCalled();expect(mark).toHaveBeenCalledTimes(1);
  expect(r.counts).toMatchObject({fetched:1,failed:1,inserted:0});expect(r.status).toBe('failed');
 });
 it('each stream gets a fresh evidence cache (released after the stream)',async()=>{
  const h=harness();const a=await stream(h),b=await stream(h);await disclose(h.facts,a,'2024-02-01','1');await disclose(h.facts,b,'2024-02-01','2');
  const made:Map<string,unknown>[]=[];
  await runCompanyDigest({...h.deps,newCache:()=>{const m=new Map();made.push(m);return m;}},{mode:'incremental'});
  expect(made).toHaveLength(2);expect(made[0]).not.toBe(made[1]);
 });
 it('stale_computation twice → failed and backed off',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');
  const mark=vi.spyOn(h.db,'markDigestFailed');
  const r=await runCompanyDigest({...h.deps,db:{...h.db,markDigestFailed:mark,replaceDigest:async()=>{throw new CompanyDbError('stale_computation');}}},{mode:'incremental'});
  expect(r.streams[0]).toMatchObject({outcome:'failed',code:'stale_computation',retried:true});
  expect(mark).toHaveBeenCalledTimes(1);
 });
 it('stale_attempt and unknown_stream are skips counted as duplicates (info only, batch success, no unaccounted)',async()=>{
  for(const code of ['stale_attempt','unknown_stream'] as const){
   const h=harness();const a=await stream(h);const b=await stream(h);await disclose(h.facts,a,'2024-02-01','1');await disclose(h.facts,b,'2024-02-01','2');
   const mark=vi.fn(h.db.markDigestFailed);
   const r=await runCompanyDigest({...h.deps,db:{...h.db,markDigestFailed:mark,replaceDigest:async()=>{throw new CompanyDbError(code);}}},{mode:'incremental'});
   expect(r.counts).toEqual({fetched:2,inserted:0,duplicates:2,versioned:0,quarantined:0,failed:0});
   expect(r.detail[code==='stale_attempt'?'skippedStale':'skippedUnknown']).toBe(2);
   expect(r.errors.filter(e=>e.code==='skipped_summary').map(e=>JSON.parse(e.message!))).toEqual([{[code]:1},{[code]:1}]);
   expect(mark).not.toHaveBeenCalled();
   expect(batchRow(h).status).toBe('success');
   expect((batchRow(h).errors as {code:string}[]).some(e=>e.code==='unaccounted')).toBe(false);
  }
 });
 it('read_truncated → failed, markDigestFailed with the attempt id, backoff; the backed-off stream keeps freshness not ok while idle',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');
  const mark=vi.spyOn(h.db,'markDigestFailed');
  const r=await runCompanyDigest({...h.deps,db:{...h.db,markDigestFailed:mark},readSnapshot:async(...x)=>({...(await h.deps.readSnapshot(...x)),rows:[],truncated:true})},{mode:'incremental'});
  expect(r.streams[0]).toMatchObject({outcome:'failed',code:'read_truncated'});
  expect(mark).toHaveBeenCalledWith(a,'US',r.streams[0].attemptId,expect.any(Date));
  expect(r.counts).toMatchObject({fetched:1,failed:1});expect(r.status).toBe('failed');
  expect(freshness(h).consecutive_errors).toBe(1);
  const st=await h.db.digestState(a,'US');
  expect(st).toMatchObject({last_status:'failed',consecutive_failures:1});
  expect(Date.parse(st!.next_attempt_at)).toBeGreaterThan(Date.now()+50*60_000);
  const idle=await runCompanyDigest(h.deps,{mode:'incremental'});
  expect(idle).toMatchObject({idle:true});expect(idle.detail.backlogFailed).toBe(1);
  expect(freshness(h).consecutive_errors).toBe(2);
 });
 it('invalid_event → failed and recorded (module bug signal)',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');
  const mark=vi.spyOn(h.db,'markDigestFailed');
  const r=await runCompanyDigest({...h.deps,db:{...h.db,markDigestFailed:mark,replaceDigest:async()=>{throw new CompanyDbError('invalid_event');}}},{mode:'incremental'});
  expect(r.streams[0]).toMatchObject({outcome:'failed',code:'invalid_event'});
  expect(r.errors).toContainEqual({code:'invalid_event',key:`${a}:US`});
  expect(mark).toHaveBeenCalledTimes(1);
 });
 it('a sweep failing on the same state_rev is recorded (failed, backoff) and makes freshness not ok',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');
  await runCompanyDigest(h.deps,{mode:'incremental',limit:4});   // no sweep quota: swept_at stays null
  const r=await runCompanyDigest({...h.deps,db:{...h.db,replaceDigest:async()=>{throw new Error('boom');}}},{mode:'incremental'});
  expect(r.streams[0]).toMatchObject({sweep:true,outcome:'failed',code:'digest_issuer_failed'});
  expect((await h.db.digestState(a,'US'))?.last_status).toBe('failed');
  expect(freshness(h).consecutive_errors).toBe(1);
 });
 it('a late failure report after a later success is ignored (attempt identity, §0 #70)',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');
  const {batchId}=await (await import('@/lib/dq/batches')).startBatch(h.tables,{producer:'company-digest',dataset:'company.events',codeVersion:CODE});
  const a1=await h.db.beginAttempt(a,'US',new Date()),a2=await h.db.beginAttempt(a,'US',new Date());
  const env=await h.deps.readSnapshot(a,'US',{concepts:null,asOf:new Date().toISOString().slice(0,10),history:true});
  const events=deriveIssuerEvents({rows:env.rows,filings:env.filings,cutoff:new Date().toISOString().slice(0,10)});
  await h.db.replaceDigest(a,'US',batchId,a2,randomUUID(),env.stateRev,false,events,summarizeCoverage({rows:env.rows,filings:env.filings,scope:null}));
  expect(await h.db.markDigestFailed(a,'US',a1,new Date())).toBe(false);
  expect((await h.db.digestState(a,'US'))?.last_status).toBe('success');
 });
 it('two replaces of one stream in one batch: the second omits an event → it is retired',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');await disclose(h.facts,a,'2025-02-01','120');
  const {batchId}=await (await import('@/lib/dq/batches')).startBatch(h.tables,{producer:'company-digest',dataset:'company.events',codeVersion:CODE});
  const today=new Date().toISOString().slice(0,10);
  const env=await h.deps.readSnapshot(a,'US',{concepts:null,asOf:today,history:true});
  const events=deriveIssuerEvents({rows:env.rows,filings:env.filings,cutoff:today});
  const cov=summarizeCoverage({rows:env.rows,filings:env.filings,scope:null});
  await h.db.replaceDigest(a,'US',batchId,await h.db.beginAttempt(a,'US',new Date()),randomUUID(),env.stateRev,false,events,cov);
  const r=await h.db.replaceDigest(a,'US',batchId,await h.db.beginAttempt(a,'US',new Date()),randomUUID(),env.stateRev,false,events.filter(e=>e.kind!=='fact_revised'),cov);
  expect(r.retired).toBe(1);
  expect((await active(h.db,a)).some(e=>e.kind==='fact_revised')).toBe(false);
 });
 it('deadline: no new stream with < 30 s left; the interleaved sweep has already run; deadline_hit is informational',async()=>{
  const h=harness();
  const old:string[]=[await stream(h),await stream(h)];for(const id of old)await disclose(h.facts,id,'2024-02-01','1');
  await runCompanyDigest(h.deps,{mode:'incremental',limit:2});   // digested; swept_at stays null for the sweep below
  const fresh:string[]=[];for(let i=0;i<8;i++){const id=await stream(h);await disclose(h.facts,id,'2024-02-01',String(i+2));fresh.push(id);}
  let t=Date.now();const start=t;
  const oldDue=(await h.db.sweepDue(new Date(),new Date(),10)).filter(d=>old.includes(d.issuerId));
  const db:CompanyDb={...h.db,sweepDue:async()=>oldDue,beginAttempt:async(...x)=>{t+=50_000;return h.db.beginAttempt(...x);}};
  const r=await runCompanyDigest({...h.deps,db,now:()=>new Date(t),deadline:new Date(start+240_000)},{mode:'incremental',limit:10,now:new Date(start)});
  expect(r.streams).toHaveLength(5);
  expect(r.streams.map(s=>s.sweep)).toEqual([false,false,false,false,true]);
  expect(r.errors).toContainEqual({code:'deadline_hit',message:JSON.stringify({not_started:5})});
  expect(r.status).toBe('success');
 });
 it('dry run writes nothing and reports planned streams with their event counts',async()=>{
  const h=harness();const a=await stream(h);await disclose(h.facts,a,'2024-02-01','100');
  const replace=vi.spyOn(h.db,'replaceDigest'),begin=vi.spyOn(h.db,'beginAttempt'),ev=vi.spyOn(h.db,'replaceEvidence');
  const r=await runCompanyDigest({...h.deps,codeVersion:null,db:{...h.db,replaceDigest:replace,beginAttempt:begin,replaceEvidence:ev}},{mode:'full',dryRun:true});
  expect(r).toMatchObject({batchId:null,status:'dry_run'});
  expect(r.streams).toEqual([expect.objectContaining({issuerId:a,outcome:'planned',events:2})]);
  expect(replace).not.toHaveBeenCalled();expect(begin).not.toHaveBeenCalled();expect(ev).not.toHaveBeenCalled();
  expect(h.tables.rows('ingest_batches')).toEqual([]);
 });
});
