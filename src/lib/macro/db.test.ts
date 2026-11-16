// src/lib/macro/db.test.ts
// memoryMacroDb against the shared contract, and supabaseMacroDb wiring over stub clients: RPC
// names/arguments, writes on admin / reads on anon, error-code mapping, write packing that keeps a
// (series, period) group in one call, history paging with truncation, id chunking, row
// normalisation (timestamps to ISO, bigint to number, numeric `value` never surfaced).
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import type {TableClient} from '../db/table-client';
import {startBatch} from '../dq/batches';
import {HISTORY_PAGE_CONCURRENCY,IN_CHUNK,MacroDbError,READ_PAGE,WRITE_CHUNK,highestPerPeriod,mergeResults,packWrites,selectEligibleHistoryAsOf,supabaseMacroDb,toMacroDbError} from './db';
import {macroDbContract,nativeRow,outcome} from './db-contract';
import {memoryMacroDb} from './memory-db';
import {verifyHistoricalBatches} from './regime-selection';
import {macroDbStrategyPort} from './strategy/wiring';
import type {ObservationRow,ObservationWrite,PublishInput} from './types';

describe('historical vintage selection',()=>{
 const cutoff='2026-10-18T00:00:00Z';
 const row=(version:number,batch_id:string,available_at='2026-10-15T00:00:00Z')=>({observation_id:`o${version}`,series_id:'US_UNRATE',period_end:'2026-09-30',version,batch_id,available_at,status:'ok',derived_from:[]} as unknown as ObservationRow);
 const receipts:Record<string,{status:string;finished_at:string|null}>={a:{status:'success',finished_at:'2026-10-16T00:00:00Z'},b:{status:'success',finished_at:'2026-10-20T00:00:00Z'},missing:{status:'success',finished_at:null}};
 const select=(candidates:ObservationRow[])=>selectEligibleHistoryAsOf(candidates,cutoff,10,async()=>[],async()=>receipts);
 it('selects the earlier finalized version when the newer version finished after cutoff',async()=>{expect((await select([row(1,'a'),row(2,'b')])).map(r=>r.version)).toEqual([1]);});
 it('ignores a missing receipt when availability is after cutoff or a higher proven vintage wins',async()=>{
  expect((await select([row(1,'a'),row(2,'missing','2026-10-20T00:00:00Z')])).map(r=>r.version)).toEqual([1]);
  expect((await select([row(1,'missing'),row(2,'a')])).map(r=>r.version)).toEqual([2]);
 });
 it('fails closed when the otherwise selected version has no receipt',async()=>{await expect(select([row(1,'a'),row(2,'missing')])).rejects.toThrow('historical_cutoff_unsupported');});
 it('checks required ancestors before choosing a derived vintage',async()=>{
  const ancestor=row(3,'b');const derived={...row(2,'a'),derived_from:[ancestor.observation_id]};
  expect((await selectEligibleHistoryAsOf([row(1,'a'),derived],cutoff,10,async()=>[ancestor],async()=>receipts)).map(r=>r.version)).toEqual([1]);
  await expect(selectEligibleHistoryAsOf([row(1,'a'),derived],cutoff,10,async()=>[{...ancestor,batch_id:'missing'}],async()=>receipts)).rejects.toThrow('historical_cutoff_unsupported');
 });
 it('rejects an invalid cutoff before selecting even an empty history',async()=>{
  await expect(selectEligibleHistoryAsOf([],'not-a-date',10,async()=>[],async()=>receipts)).rejects.toThrow('historical_cutoff_unsupported');
 });
 it('rejects missing or invalid availability on any candidate or ancestor',async()=>{
  for(const available_at of [undefined,'not-a-date']){
   await expect(select([row(1,'a'),{...row(2,'a'),available_at} as ObservationRow])).rejects.toThrow('historical_cutoff_unsupported');
   const derived={...row(2,'a'),derived_from:['parent']};
   await expect(selectEligibleHistoryAsOf([row(1,'a'),derived],cutoff,10,async()=>[{...row(3,'a'),observation_id:'parent',available_at} as ObservationRow],async()=>receipts)).rejects.toThrow('historical_cutoff_unsupported');
  }
 });
 it('rejects a missing required ancestor instead of selecting an older vintage',async()=>{
  const derived={...row(2,'a'),derived_from:['missing-parent']};
  await expect(select([row(1,'a'),derived])).rejects.toThrow('historical_cutoff_unsupported');
 });
 it('receipt verification rejects malformed cutoff and dangling ancestry',async()=>{
  const derived={...row(2,'a'),derived_from:['missing-parent']};
  const built={input:{region:'US' as const,series:{}},observations:[derived],historyIds:[]};
  const loadRows=async(ids:string[])=>ids.includes(derived.observation_id)?[derived]:[];
  const loadBatches=async()=>({a:'2026-10-16T00:00:00Z'});
  await expect(verifyHistoricalBatches(built,'not-a-date',loadRows,loadBatches)).rejects.toThrow('historical_cutoff_unsupported');
  await expect(verifyHistoricalBatches(built,cutoff,loadRows,loadBatches)).rejects.toThrow('historical_cutoff_unsupported');
 });
});

describe('memory finalization receipts',()=>{
 it('requires an explicit valid timestamp and keeps a terminal receipt immutable',async()=>{
  const db=memoryMacroDb();db.setBatchStatus('b','success');expect((await db.batchFinishedAt(['b'])).b).toBeNull();
  expect(()=>db.setBatchStatus('b','success',undefined,'not-a-date')).toThrow('invalid_finished_at');
  db.setBatchStatus('b','success',undefined,'2026-10-16T00:00:00Z');
  expect(()=>db.setBatchStatus('b','running')).toThrow('immutable_finished_at');
  expect(()=>db.setBatchStatus('b','success',undefined,'2026-10-20T00:00:00Z')).toThrow('immutable_finished_at');
  expect((await db.batchFinishedAt(['b'])).b).toBe('2026-10-16T00:00:00.000Z');
 });
});

macroDbContract('memoryMacroDb contract',async()=>{
 const db=memoryMacroDb();
 return {db,resolver:async()=>randomUUID(),
  batch:async(dataset)=>{const id=randomUUID();db.setBatchStatus(id,'running',dataset);return id;},
  finish:async(id,status='success')=>{db.setBatchStatus(id,status);},
  addQuarantine:async i=>db.addQuarantineItem({dataset:i.dataset,natural_key:i.naturalKey,batch_id:i.batchId,reason_code:i.reasonCode}),
  quarantineStatus:async id=>db.quarantineItem(id)?.status??null,
  peek:async(series,period)=>db.allObservations().filter(o=>o.series_id===series&&o.period_end===period&&o.status==='ok').sort((a,b)=>a.version-b.version)};
});

describe('memoryMacroDb specifics',()=>{
 it('stamps ingested_at / created_at from the injected clock and records an audit row per resolution',async()=>{
  const db=memoryMacroDb();db.setNow('2026-11-06T05:30:00.000Z');
  const v='macro-catalog/abcdefabcdef';
  await db.upsertCatalog([{id:'X_A',region:'US',role:'indicator',type:'labor_rate',name:{zh:'a',en:'a'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:{adapter:'fred_csv',fetchHost:'fred.stlouisfed.org',publisher:{zh:'p',en:'p'},seriesKey:'X',rights:'public_domain',attribution:{zh:'a',en:'a'}},revisionPolicy:'immutable',weight:0,changeKind:'pp',definitionVersion:1}],v,'macro-rules/1');
  const b=randomUUID();db.setBatchStatus(b,'running');const sha='a'.repeat(64);
  const r=await db.putRetrieval({sha256:sha,object_path:`fred_csv/${sha}.csv`,adapter:'fred_csv',content_type:'text/csv',byte_length:1},{fetch_url:'https://fred.stlouisfed.org/x',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:'2026-11-06T05:00:00.000Z',batch_id:b,tool_versions:{}});
  await db.writeObservations(b,'c',[nativeRow('X_A','2026-09-30','1',r,'2026-11-06T05:00:00.000Z')]);
  expect((db.allObservations().filter(o=>o.series_id==='X_A'&&o.period_end==='2026-09-30'))[0].ingested_at).toBe('2026-11-06T05:30:00.000Z');
  db.setNow('2026-11-06T06:00:00.000Z');
  const res=await db.writeObservations(b,'c',[nativeRow('X_A','2026-09-30','2',r,'2026-11-06T05:00:00.000Z',false)]);
  expect(db.allObservations().map(o=>o.status)).toEqual(['ok','quarantined']);
  const q=db.addQuarantineItem({dataset:'macro.fred',natural_key:'X_A|2026-09-30',batch_id:b,reason_code:'unexpected_revision'});
  const obs=res.conflicts[0].observation_id!;await db.linkQuarantine(q,[obs]);
  const by=randomUUID();db.setBatchStatus(b,'success');await db.resolveConflict(q,'accept',by,obs);
  expect(db.quarantineItem(q)).toMatchObject({status:'resolved_accept',resolved_by:by,resolved_at:'2026-11-06T06:00:00.000Z'});
  expect(db.audit).toEqual([{user_id:by,action:'dq.quarantine_resolve',object_type:'dq',object_id:q,detail:expect.objectContaining({decision:'accept',status:'resolved_accept',observation_id:obs,rejected:0})}]);
  const p=await db.publishSnapshot({region:'US',expectedRevision:0,expectedInputRevision:(await db.publishState('US')).inputRevision,asOf:'2026-11-06',methodologyVersion:'m',catalogVersion:v,observationIds:[],historyIds:[],catalogCounts:{verified:0,missing:0,restricted:0},regime:null,contributions:[],rulesVersion:'r',uncoveredWeight:0});
  expect((await db.snapshot(p.snapshot_id))?.created_at).toBe('2026-11-06T06:00:00.000Z');
 });
 it('writes need a known running batch (invalid_batch / batch_not_running); declared running batches are ineligible until they finish success/partial',async()=>{
  const db=memoryMacroDb();
  const v='macro-catalog/abcdefabcdef';
  await db.upsertCatalog([{id:'X_B',region:'US',role:'indicator',type:'labor_rate',name:{zh:'b',en:'b'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:{adapter:'fred_csv',fetchHost:'fred.stlouisfed.org',publisher:{zh:'p',en:'p'},seriesKey:'X',rights:'public_domain',attribution:{zh:'a',en:'a'}},revisionPolicy:'revisable',weight:0,changeKind:'pp',definitionVersion:1}],v,'macro-rules/1');
  const retrieve=(b:string)=>{const sha=randomUUID().replace(/-/g,'').padEnd(64,'0');return db.putRetrieval({sha256:sha,object_path:`fred_csv/${sha}.csv`,adapter:'fred_csv',content_type:'text/csv',byte_length:1},{fetch_url:'https://fred.stlouisfed.org/x',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:'2026-11-06T05:00:00.000Z',batch_id:b,tool_versions:{}});};
  const write=async(b:string,period:string)=>{const r=await retrieve(b);await db.writeObservations(b,'c',[nativeRow('X_B',period,'1',r,'2026-11-06T05:00:00.000Z')]);};
  const undeclared=randomUUID(),done=randomUUID(),running=randomUUID();db.setBatchStatus(done,'running');db.setBatchStatus(running,'running');
  expect(await outcome(retrieve(undeclared))).toBe('rpc_failed:invalid_batch');
  expect(await outcome(db.writeObservations(undeclared,'c',[]))).toBe('rpc_failed:invalid_batch');
  await write(done,'2026-08-31');await write(running,'2026-09-30');
  db.setBatchStatus(done,'success');
  expect((await db.latestEligible(['X_B']))[0].period_end).toBe('2026-08-31');
  expect(await outcome(write(done,'2026-07-31'))).toBe('rpc_failed:batch_not_running');
  db.setBatchStatus(running,'partial');
  expect((await db.latestEligible(['X_B']))[0].period_end).toBe('2026-09-30');
 });
 it('finalizeBatch bumps input_revision of every region the batch wrote (review A3): a publisher that read before finalization is stale',async()=>{
  const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset']});
  const db=memoryMacroDb({tables});
  const v='macro-catalog/abcdefabcdef';
  const def=(id:string,region:'US'|'CN')=>({id,region,role:'indicator' as const,type:'labor_rate' as const,name:{zh:id,en:id},unit:'pct',nativeFrequency:'monthly' as const,period:'month' as const,adjustment:'sa' as const,status:'active' as const,source:{adapter:'fred_csv' as const,fetchHost:'fred.stlouisfed.org',publisher:{zh:'p',en:'p'},seriesKey:id,rights:'public_domain' as const,attribution:{zh:'a',en:'a'}},revisionPolicy:'revisable' as const,weight:0,changeKind:'pp' as const,definitionVersion:1});
  await db.upsertCatalog([def('X_US','US'),def('X_CN','CN')],v,'macro-rules/1');
  const {batchId:b}=await startBatch(tables,{producer:'ts-fred',dataset:'macro.fred',triggeredBy:'cron'});
  const sha=randomUUID().replace(/-/g,'').padEnd(64,'0');
  const r=await db.putRetrieval({sha256:sha,object_path:`fred_csv/${sha}.csv`,adapter:'fred_csv',content_type:'text/csv',byte_length:1},{fetch_url:'https://fred.stlouisfed.org/x',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:'2026-11-06T05:00:00.000Z',batch_id:b,tool_versions:{}});
  await db.writeObservations(b,'c',[nativeRow('X_US','2026-09-30','1',r,'2026-11-06T05:00:00.000Z')]);
  const us=await db.publishState('US'),cn=await db.publishState('CN');
  const ZERO={fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0};
  await db.finalizeBatch(b,{status:'success',counts:ZERO,errors:[],finishedAt:'2026-11-06T05:31:00.000Z'},null);
  expect(await db.publishState('US')).toEqual({revision:us.revision,inputRevision:us.inputRevision+1});
  expect(await db.publishState('CN')).toEqual(cn);                                                      // untouched region
  const stale={region:'US' as const,expectedRevision:us.revision,expectedInputRevision:us.inputRevision,asOf:'2026-11-06',methodologyVersion:'m',catalogVersion:v,observationIds:[],historyIds:[],catalogCounts:{verified:0,missing:0,restricted:0},regime:null,contributions:[],rulesVersion:'r',uncoveredWeight:0};
  expect(await outcome(db.publishSnapshot(stale))).toBe('stale_publisher:stale_publisher');
  await db.finalizeBatch(b,{status:'failed',counts:ZERO,errors:[{code:'x'}],finishedAt:'2026-11-06T05:32:00.000Z'},null);   // already finished: no second bump
  expect((await db.publishState('US')).inputRevision).toBe(us.inputRevision+1);
 });
 it('finalizeBatch / recordFreshness (第 6 稿 P1-1/P2-4): need the DQ TableClient; tokens are checked first; finalize writes once and moves eligibility; freshness has recordAttempt semantics and is recorded once per run',async()=>{
  const ZERO={fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0};
  const fin=(status:'success'|'failed',finishedAt='2026-11-06T05:31:00.000Z')=>({status,counts:ZERO,errors:status==='failed'?[{code:'sync_crashed'}]:[],finishedAt});
  expect(await outcome(memoryMacroDb().finalizeBatch(randomUUID(),fin('success'),null))).toBe('rpc_failed:memory_tables_required');
  const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset']});
  const db=memoryMacroDb({tables});
  const {batchId:cron}=await startBatch(tables,{producer:'ts-fred',dataset:'macro.fred',triggeredBy:'cron'});
  expect(await db.finalizeBatch(cron,fin('failed','2000-01-01T00:00:00.000Z'),null)).toEqual({status:'failed',finalized:true});   // cron: no run, no tokens
  const row=tables.rows('ingest_batches')[0];
  expect(row).toMatchObject({status:'failed',errors:[{code:'sync_crashed'}]});
  expect(Date.parse(String(row.finished_at))).toBeGreaterThanOrEqual(Date.parse(String(row.started_at)));   // clamped like finishBatch
  expect(await db.finalizeBatch(cron,fin('success'),null)).toEqual({status:'failed',finalized:false});        // read back, never twice
  expect(await outcome(db.finalizeBatch(cron,fin('success'),{ownerToken:'x',finishToken:'y'}))).toBe('fenced:fenced');
  const {batchId:b}=await startBatch(tables,{producer:'py-akshare',dataset:'macro.akshare'});
  const t=(await db.claimIngest(b,'macro.akshare',{maxAgeMs:7_200_000,processingTimeoutMs:600_000,takeover:false})).ownerToken!;
  const f1=await db.beginFinish(b,0,t),f2=await db.beginFinish(b,0,t);
  if(f1.status!=='finishing'||f2.status!=='finishing')throw new Error('unreachable');
  const old={ownerToken:t,finishToken:f1.finishToken},cur={ownerToken:t,finishToken:f2.finishToken};
  const fw={dataset:'macro.akshare',ok:false,cadence:'daily' as const,now:'2026-11-06T05:31:00.000Z',detail:{batch_id:b}};
  for(const call of [()=>db.finalizeBatch(b,fin('success'),old),()=>db.finalizeBatch(b,fin('success'),null),()=>db.recordFreshness(b,fw,old)])expect(await outcome(call())).toBe('fenced:fenced');
  expect(await outcome(db.recordFreshness(b,{...fw,dataset:'macro.fred'},cur))).toBe('rpc_failed:invalid_dataset');
  expect(tables.rows('dq_freshness')).toEqual([]);
  expect(tables.rows('ingest_batches').find(x=>x.batch_id===b)).toMatchObject({status:'running'});
  expect(await db.finalizeBatch(b,fin('success'),cur)).toEqual({status:'success',finalized:true});
  expect(await db.recordFreshness(b,fw,cur)).toMatchObject({freshness_recorded:{ok:false,status:'missing'}});
  expect(await db.recordFreshness(b,{...fw,ok:true},cur)).toMatchObject({freshness_recorded:{ok:false,status:'missing'}});   // once per run
  expect(tables.rows('dq_freshness')).toEqual([expect.objectContaining({dataset:'macro.akshare',consecutive_errors:1,status:'missing',detail:{batch_id:b}})]);
  await db.recordFinishStep(b,'receipt',{},cur);
  expect(await outcome(db.recordFreshness(b,fw,old))).toBe('fenced:fenced');                                     // obsolete token after finish: fenced, not run_not_finishing
 });
 // ---- run-lock barriers (四轮 P2-1): a TableClient whose next write to `table` pauses until released holds a call inside its
 // awaited mutation, exactly where the unlocked twin used to yield.
 function gated(base:ReturnType<typeof memoryTableClient>){
  let armed:{table:string;hit:()=>void;open:Promise<void>}|null=null;
  const pause=async(table:string)=>{const a=armed;if(a&&a.table===table){armed=null;a.hit();await a.open;}};
  const client:TableClient={
   insert:(t,r)=>base.insert(t,r),select:(t,m,o)=>base.select(t,m,o),count:(t,m,o)=>base.count(t,m,o),
   async update(t,m,p){await pause(t);return base.update(t,m,p);},
   async upsert(t,r,k){await pause(t);return base.upsert(t,r,k);},
  };
  const arm=(table:string)=>{let hit!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>{hit=r;});const open=new Promise<void>(r=>{release=r;});armed={table,hit,open};return {reached,release};};
  return {client,arm};
 }
 const settled=<T,>(p:Promise<T>,log:string[],name:string)=>p.then(v=>{log.push(name);return v;},e=>{log.push(name);throw e;});
 const drain=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
 const LEASE={maxAgeMs:7_200_000,processingTimeoutMs:600_000,takeover:false};
 const fw=(batch:string)=>({dataset:'macro.akshare',ok:false,cadence:'daily' as const,now:'2026-11-06T05:31:00.000Z',detail:{batch_id:batch}});
 it('run lock (四轮 P2-1): a freshness write paused inside the lock holds off token rotation and takeover; the newer run\'s attempt is never overwritten',async()=>{
  const base=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset']});const {client,arm}=gated(base);
  const db=memoryMacroDb({tables:client});
  const {batchId:a}=await startBatch(base,{producer:'py-akshare',dataset:'macro.akshare'});
  const ta=(await db.claimIngest(a,'macro.akshare',LEASE)).ownerToken!;
  const fa=await db.beginFinish(a,0,ta);if(fa.status!=='finishing')throw new Error('unreachable');
  const gate=arm('dq_freshness');const log:string[]=[];
  const held=settled(db.recordFreshness(a,fw(a),{ownerToken:ta,finishToken:fa.finishToken}),log,'freshness');
  await gate.reached;                                                                                    // A is inside its upsert, lock held
  const rotate=settled(db.beginFinish(a,0,ta),log,'rotate');
  const {batchId:b}=await startBatch(base,{producer:'py-akshare',dataset:'macro.akshare'});
  db.setNow(new Date(Date.now()+3*3_600_000).toISOString());                                           // A is past its max age
  const takeover=settled(db.claimIngest(b,'macro.akshare',LEASE),log,'takeover');
  await drain();
  expect(log).toEqual([]);                                                                               // both wait for A's run lock
  gate.release();
  const [rec,rot,claim]=await Promise.all([held,rotate,takeover]);
  expect(log).toEqual(['freshness','rotate','takeover']);
  expect(rec).toMatchObject({freshness_recorded:{ok:false,status:'missing'}});
  expect(rot.status).toBe('finishing');                                                                  // rotated only after A's write
  expect(claim).toMatchObject({status:'claimed',aborted:[a]});
  const tb=claim.ownerToken!;const fb=await db.beginFinish(b,0,tb);if(fb.status!=='finishing')throw new Error('unreachable');
  await db.recordFreshness(b,fw(b),{ownerToken:tb,finishToken:fb.finishToken});
  expect(await outcome(db.recordFreshness(a,fw(a),{ownerToken:ta,finishToken:fa.finishToken}))).toBe('fenced:fenced');
  expect(base.rows('dq_freshness')).toEqual([expect.objectContaining({consecutive_errors:2,detail:{batch_id:b}})]);   // B's attempt follows A's, never overwritten
 });
 it('run lock (四轮 P2-1): an obsolete operation entering after a queued rotation runs after it and is fenced',async()=>{
  const ZERO={fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0};
  const fin={status:'success' as const,counts:ZERO,errors:[],finishedAt:'2026-11-06T05:31:00.000Z'};
  const base=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset']});const {client,arm}=gated(base);
  const db=memoryMacroDb({tables:client});
  const {batchId:a}=await startBatch(base,{producer:'py-akshare',dataset:'macro.akshare'});
  const t=(await db.claimIngest(a,'macro.akshare',LEASE)).ownerToken!;
  const f1=await db.beginFinish(a,0,t);if(f1.status!=='finishing')throw new Error('unreachable');
  const cur={ownerToken:t,finishToken:f1.finishToken};
  const gate=arm('dq_freshness');const log:string[]=[];
  const held=settled(db.recordFreshness(a,fw(a),cur),log,'freshness');
  await gate.reached;
  const rotate=settled(db.beginFinish(a,0,t),log,'rotate');                                             // queued: will rotate the finish token
  const late=outcome(settled(db.finalizeBatch(a,fin,cur),log,'finalize'));                                // cur is still current when called…
  await drain();
  expect(log).toEqual([]);
  gate.release();
  const [,rot]=await Promise.all([held,rotate]);
  expect(await late).toBe('fenced:fenced');                                                                // …but it runs after the rotation
  expect(log).toEqual(['freshness','rotate','finalize']);
  expect(base.rows('ingest_batches').find(x=>x.batch_id===a)).toMatchObject({status:'running'});
  if(rot.status!=='finishing')throw new Error('unreachable');
  expect(await db.finalizeBatch(a,fin,{ownerToken:t,finishToken:rot.finishToken})).toEqual({status:'success',finalized:true});
 });
 it('returns copies: mutating a read row does not change stored state',async()=>{
  const db=memoryMacroDb();
  expect(await db.publishState('US')).toEqual({revision:0,inputRevision:0});
  const st=await db.publishState('US');st.revision=99;
  expect((await db.publishState('US')).revision).toBe(0);
 });
});

// ---------------------------------------------------------------- supabase stubs
type Res={data:unknown;error:{message:string}|null;count?:number|null};
type Call=[string,unknown[]];
function stub(o:{rpc?:(fn:string,args:Record<string,unknown>)=>Res;select?:(calls:Call[])=>Res|Promise<Res>}={}){
 const rpcCalls:[string,Record<string,unknown>][]=[];const queries:Call[][]=[];
 const from=(table:string)=>{
  const calls:Call[]=[['from',[table]]];queries.push(calls);
  const b:unknown=new Proxy({},{get(_t,prop){
   if(prop==='then'){const res=o.select?.(calls)??{data:[],error:null};return (ok:(v:Res)=>unknown,ko:(e:unknown)=>unknown)=>Promise.resolve(res).then(ok,ko);}
   return (...args:unknown[])=>{calls.push([String(prop),args]);return b;};
  }});
  return b;
 };
 const client={rpc:async(fn:string,args:Record<string,unknown>)=>{rpcCalls.push([fn,args]);return o.rpc?.(fn,args)??{data:null,error:null};},from};
 return {client:client as unknown as SupabaseClient,rpcCalls,queries};
}
const pgObs=(o:Record<string,unknown>={})=>({observation_id:randomUUID(),series_id:'US_UNRATE',period_end:'2026-09-30',value:4.1,value_text:'4.1',version:1,available_at:'2026-11-02T05:30:00+00:00',availability_basis:'first_seen',ingested_at:'2026-11-02T05:30:01.123+00:00',status:'ok',retrieval_id:randomUUID(),locator:{kind:'csv_row',line:2,column:1},derived_from:null,transform:null,code_version:'abc',batch_id:randomUUID(),...o});
const publishInput:PublishInput={region:'US',expectedRevision:3,expectedInputRevision:7,asOf:'2026-11-06',methodologyVersion:'macro-method/1.0',catalogVersion:'macro-catalog/abcdefabcdef',observationIds:['o1'],historyIds:['o0','o1'],catalogCounts:{verified:5,missing:2,restricted:1},regime:null,contributions:[],rulesVersion:'macro-rules/1',uncoveredWeight:20};
const chunkRow={seq:0,total:1,state:'done',counts:{fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0},native_usable:1,errors:[{code:'x',key:'CN_A'}],claim_keys:['CN_A|2026-09-30'],located_keys:[]};
const finalizeInput={status:'success' as const,counts:chunkRow.counts,errors:[],finishedAt:'2026-11-06T05:31:00.000Z'};
const freshnessInput={dataset:'macro.akshare',ok:true,cadence:'daily' as const,now:'2026-11-06T05:31:00.000Z',detail:{batch_id:'b1'}};

describe('supabaseMacroDb wiring',()=>{
 it('eligibleHistoryAsOf applies cutoff and receipt filters with bounded batch-id reads',async()=>{
  const cutoff='2026-10-18T00:00:00.000Z';
  const first=pgObs({available_at:'2026-10-15T00:00:00Z',batch_id:'a',version:1});
  const second=pgObs({available_at:'2026-10-15T00:00:00Z',batch_id:'b',version:2});
  const admin=stub({select:calls=>{
   const table=calls[0][1][0];
   if(table==='macro_observations')return {data:[first,second],error:null};
   return {data:[{batch_id:'a',status:'success',finished_at:'2026-10-16T00:00:00Z'},{batch_id:'b',status:'success',finished_at:'2026-10-20T00:00:00Z'}],error:null};
  }});
  const db=supabaseMacroDb({admin:admin.client,anon:stub().client});
  expect((await db.eligibleHistoryAsOf('US_UNRATE',{to:'2026-10-31',asOf:cutoff,maxRows:2})).map(r=>r.version)).toEqual([1]);
  const observationQuery=admin.queries.find(q=>q[0][1][0]==='macro_observations')!;
  expect(observationQuery).toContainEqual(['eq',['series_id','US_UNRATE']]);
  expect(observationQuery).toContainEqual(['eq',['status','ok']]);
  expect(observationQuery).toContainEqual(['lte',['available_at',cutoff]]);
  expect(observationQuery).toContainEqual(['lte',['period_end','2026-10-31']]);
  expect(observationQuery).toContainEqual(['in',['batch.status',['success','partial']]]);
  expect(observationQuery).toContainEqual(['or',[`finished_at.lte.${cutoff},finished_at.is.null`,{referencedTable:'batch'}]]);
  const batchQueries=admin.queries.filter(q=>q[0][1][0]==='ingest_batches');
  expect(batchQueries.length).toBeGreaterThan(0);
  for(const q of batchQueries){
   const ids=q.find(([name])=>name==='in')![1][1] as string[];
   expect(ids.length).toBeLessThanOrEqual(IN_CHUNK);
  }
 });
 it('maps every write to its service RPC with exact argument names, on the admin client only',async()=>{
  const data:Record<string,unknown>={macro_put_retrieval:'id-1',record_failed_macro_snapshot:'id-1',publish_macro_snapshot:{snapshot_id:'s1',revision:'4',replayed:false},republish_macro_snapshot:{snapshot_id:'s2',revision:'5',source_snapshot_id:'s1'},
   macro_write_observations:{inserted:1,duplicates:0,versioned:0,quarantined:0,conflicts:[]},macro_claim_ingest:{status:'claimed',owner_token:'tok-1',aborted:[]},macro_claim_chunk:{status:'done',chunk:chunkRow},
   macro_complete_chunk:chunkRow,macro_begin_finish:{status:'finishing',progress:{},finish_token:'fin-1'},macro_record_finish_step:{derived:{counts:chunkRow.counts,errors:[]}},macro_link_quarantine:1,
   macro_finalize_batch:{status:'success',finalized:true},macro_record_freshness:{freshness_recorded:{ok:true,status:'fresh'}}};
  const admin=stub({rpc:fn=>({data:data[fn]??null,error:null})});
  const anon=stub();
  const db=supabaseMacroDb({admin:admin.client,anon:anon.client});
  await db.upsertCatalog([],'macro-catalog/abcdefabcdef','macro-rules/1');
  expect(await db.putRetrieval({sha256:'a'.repeat(64),object_path:`fred_csv/${'a'.repeat(64)}.csv`,adapter:'fred_csv',content_type:'text/csv',byte_length:10},{fetch_url:'https://fred.stlouisfed.org/x',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:'2026-11-01T05:30:00.000Z',batch_id:'b1',tool_versions:{node:'22'}},'tok-1')).toBe('id-1');
  expect(await db.claimIngest('b1','macro.akshare',{maxAgeMs:7_200_000,processingTimeoutMs:600_000,takeover:true})).toEqual({status:'claimed',ownerToken:'tok-1',aborted:[],holder:null});
  expect(await db.claimChunk('b1',0,1,'tok-1')).toEqual({status:'done',chunk:chunkRow});
  expect(await db.completeChunk('b1',0,{counts:chunkRow.counts,nativeUsable:1,errors:chunkRow.errors,claimKeys:chunkRow.claim_keys,locatedKeys:[]},'tok-1')).toEqual(chunkRow);
  expect(await db.beginFinish('b1',1,'tok-1')).toEqual({status:'finishing',progress:{},finishToken:'fin-1'});
  expect(await db.recordFinishStep('b1','derived',{counts:chunkRow.counts,errors:[]},{ownerToken:'tok-1',finishToken:'fin-1'})).toEqual({derived:{counts:chunkRow.counts,errors:[]}});
  expect(await db.finalizeBatch('b1',finalizeInput,{ownerToken:'tok-1',finishToken:'fin-1'})).toEqual({status:'success',finalized:true});
  expect(await db.finalizeBatch('b2',finalizeInput,null)).toEqual({status:'success',finalized:true});                          // cron: no run, no tokens
  expect(await db.recordFreshness('b1',freshnessInput,{ownerToken:'tok-1',finishToken:'fin-1'})).toEqual({freshness_recorded:{ok:true,status:'fresh'}});
  expect(await db.writeObservations('b1','code',[nativeRow('US_UNRATE','2026-09-30','4.1','r1','2026-11-01T05:30:00.000Z')],'tok-1')).toEqual({inserted:1,duplicates:0,versioned:0,quarantined:0,conflicts:[]});
  expect(await db.publishSnapshot({...publishInput,publishKey:'ingest:b1',batchId:'b1',ownerToken:'tok-1',finishToken:'fin-1'})).toEqual({snapshot_id:'s1',revision:4,replayed:false});
  expect(await db.republishSnapshot('s1',4,7)).toEqual({snapshot_id:'s2',revision:5});
  expect(await db.recordFailedSnapshot({region:'CN',asOf:'2026-11-06',methodologyVersion:'m',catalogVersion:'c',reason:'x'})).toBe('id-1');
  expect(await db.linkQuarantine('q1',['o9'],{batchId:'b1',ownerToken:'tok-1'})).toBe(1);
  expect(await db.linkQuarantine('q1',['o9'])).toBe(1);
  await db.resolveConflict('q1','accept','u1','o9');
  await db.resolveConflict('q2','reject','u1');
  expect(admin.rpcCalls).toEqual([
   ['macro_upsert_catalog',{p_catalog_version:'macro-catalog/abcdefabcdef',p_rules_version:'macro-rules/1',p_defs:[]}],
   ['macro_put_retrieval',{p_sha256:'a'.repeat(64),p_object_path:`fred_csv/${'a'.repeat(64)}.csv`,p_adapter:'fred_csv',p_content_type:'text/csv',p_byte_length:10,p_fetch_url:'https://fred.stlouisfed.org/x',p_fetch_host:'fred.stlouisfed.org',p_http_status:200,p_fetched_at:'2026-11-01T05:30:00.000Z',p_batch_id:'b1',p_tool_versions:{node:'22'},p_owner_token:'tok-1'}],
   ['macro_claim_ingest',{p_batch_id:'b1',p_dataset:'macro.akshare',p_max_age:'7200000 milliseconds',p_processing_timeout:'600000 milliseconds',p_takeover:true}],
   ['macro_claim_chunk',{p_batch_id:'b1',p_seq:0,p_total:1,p_owner_token:'tok-1'}],
   ['macro_complete_chunk',{p_batch_id:'b1',p_seq:0,p_counts:chunkRow.counts,p_native_usable:1,p_errors:chunkRow.errors,p_claim_keys:chunkRow.claim_keys,p_located_keys:[],p_owner_token:'tok-1'}],
   ['macro_begin_finish',{p_batch_id:'b1',p_total:1,p_owner_token:'tok-1'}],
   ['macro_record_finish_step',{p_batch_id:'b1',p_step:'derived',p_data:{counts:chunkRow.counts,errors:[]},p_owner_token:'tok-1',p_finish_token:'fin-1'}],
   ['macro_finalize_batch',{p_batch_id:'b1',p_owner_token:'tok-1',p_finish_token:'fin-1',p_status:'success',p_counts:chunkRow.counts,p_errors:[],p_finished_at:'2026-11-06T05:31:00.000Z'}],
   ['macro_finalize_batch',{p_batch_id:'b2',p_owner_token:null,p_finish_token:null,p_status:'success',p_counts:chunkRow.counts,p_errors:[],p_finished_at:'2026-11-06T05:31:00.000Z'}],
   ['macro_record_freshness',{p_batch_id:'b1',p_owner_token:'tok-1',p_finish_token:'fin-1',p_dataset:'macro.akshare',p_ok:true,p_cadence:'daily',p_now:'2026-11-06T05:31:00.000Z',p_detail:{batch_id:'b1'}}],
   ['macro_write_observations',{p_batch:'b1',p_code_version:'code',p_rows:[nativeRow('US_UNRATE','2026-09-30','4.1','r1','2026-11-01T05:30:00.000Z')],p_owner_token:'tok-1'}],
   ['publish_macro_snapshot',{p_region:'US',p_expected_revision:3,p_expected_input_revision:7,p_as_of:'2026-11-06',p_methodology_version:'macro-method/1.0',p_catalog_version:'macro-catalog/abcdefabcdef',p_observation_ids:['o1'],p_history_ids:['o0','o1'],p_catalog_counts:{verified:5,missing:2,restricted:1},p_regime:null,p_contributions:[],p_rules_version:'macro-rules/1',p_uncovered_weight:20,p_publish_key:'ingest:b1',p_batch_id:'b1',p_owner_token:'tok-1',p_finish_token:'fin-1'}],
   ['republish_macro_snapshot',{p_snapshot_id:'s1',p_expected_revision:4,p_expected_input_revision:7}],
   ['record_failed_macro_snapshot',{p_region:'CN',p_as_of:'2026-11-06',p_methodology_version:'m',p_catalog_version:'c',p_reason:'x'}],
   ['macro_link_quarantine',{p_quarantine_id:'q1',p_observation_ids:['o9'],p_batch_id:'b1',p_owner_token:'tok-1'}],
   ['macro_link_quarantine',{p_quarantine_id:'q1',p_observation_ids:['o9'],p_batch_id:null,p_owner_token:null}],
   ['macro_resolve_conflict',{p_quarantine_id:'q1',p_decision:'accept',p_resolved_by:'u1',p_observation_id:'o9'}],
   ['macro_resolve_conflict',{p_quarantine_id:'q2',p_decision:'reject',p_resolved_by:'u1',p_observation_id:null}],
  ]);
  expect(anon.rpcCalls).toEqual([]);expect(anon.queries).toEqual([]);
 });
 it('eligible reads go through the admin client (service-only RPCs); eligibleHistory pages by p_after and throws truncated beyond maxRows',async()=>{
  const page=(from:number,n:number)=>Array.from({length:n},(_,i)=>pgObs({period_end:`${String(1900+Math.floor((from+i)/12)).padStart(4,'0')}-${String(1+((from+i)%12)).padStart(2,'0')}-28`,value_text:String(from+i)}));
  const all=page(0,1500);
  const admin=stub({rpc:(fn,args)=>{
   if(fn==='macro_latest_eligible_observations')return {data:[all[0]],error:null};
   const after=args.p_after as string|null;const start=after===null?0:all.findIndex(r=>r.period_end===after)+1;
   return {data:all.slice(start,start+Number(args.p_limit)),error:null};
  }});
  const anon=stub();
  const db=supabaseMacroDb({admin:admin.client,anon:anon.client});
  expect((await db.latestEligible(['US_UNRATE'],{includeBatch:'b1'}))[0].value_text).toBe('0');
  const got=await db.eligibleHistory('US_UNRATE',{maxRows:2000,includeBatch:'b1',asOf:'2026-11-06T00:00:00.000Z'});
  expect(got).toHaveLength(1500);
  expect(admin.rpcCalls.map(([fn,a])=>[fn,a.p_after??null,a.p_limit??null])).toEqual([['macro_latest_eligible_observations',null,null],['macro_eligible_history',null,READ_PAGE],['macro_eligible_history',all[999].period_end,READ_PAGE]]);
  expect(admin.rpcCalls[0][1]).toEqual({p_series_ids:['US_UNRATE'],p_as_of:null,p_period_end_lte:null,p_include_batch:'b1'});
  expect(admin.rpcCalls[1][1]).toMatchObject({p_series_id:'US_UNRATE',p_from:null,p_to:null,p_as_of:'2026-11-06T00:00:00.000Z',p_include_batch:'b1'});
  await expect(db.eligibleHistory('US_UNRATE',{maxRows:1499})).rejects.toMatchObject({code:'truncated'});
  expect(anon.rpcCalls).toEqual([]);
 });
 it('reads through anon (RLS): latest and since via invoker RPCs, single rows via select; publish state, chunks and judgments (service-only, 第 6 稿 P1-2) via admin',async()=>{
  const row=pgObs();
  const admin=stub({select:calls=>({data:calls[0][1][0]==='macro_publish_state'?{revision:'5',input_revision:'9'}:calls[0][1][0]==='macro_regime_results'?null:[{batch_id:'b1',received_at:'2026-11-06T05:30:00+00:00',completed_at:null,...chunkRow}],error:null})});
  const anon=stub({rpc:fn=>({data:fn==='macro_latest_observations'?[row]:[],error:null}),select:()=>({data:null,error:null})});
  const db=supabaseMacroDb({admin:admin.client,anon:anon.client});
  const [o]=await db.latestObservations(['US_UNRATE'],{asOf:'2026-11-03T00:00:00.000Z'});
  expect(o).toEqual({observation_id:row.observation_id,series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.1',version:1,available_at:'2026-11-02T05:30:00.000Z',availability_basis:'first_seen',ingested_at:'2026-11-02T05:30:01.123Z',status:'ok',retrieval_id:row.retrieval_id,locator:{kind:'csv_row',line:2,column:1},derived_from:null,transform:null,code_version:'abc',batch_id:row.batch_id});
  expect('value' in o).toBe(false);
  expect(await db.latestObservations([])).toEqual([]);
  await db.snapshotsSince({created_at:'2026-11-06T05:30:00.000Z',snapshot_id:'s1'},5000);
  expect(anon.rpcCalls).toEqual([
   ['macro_latest_observations',{p_series_ids:['US_UNRATE'],p_as_of:'2026-11-03T00:00:00.000Z',p_period_end_lte:null}],
   ['macro_snapshots_since',{p_created_at:'2026-11-06T05:30:00.000Z',p_snapshot_id:'s1',p_limit:1000}],
  ]);
  expect(await db.activeSnapshot('US')).toBeNull();
  expect(anon.queries.at(-1)).toEqual([['from',['macro_snapshots']],['select',['*']],['eq',['region','US']],['eq',['status','active']],['maybeSingle',[]]]);
  expect(await db.previousSnapshot('US','2026-11-06T05:30:00.000Z')).toBeNull();
  expect(anon.queries.at(-1)).toEqual([['from',['macro_snapshots']],['select',['*']],['eq',['region','US']],['neq',['status','failed']],['lt',['created_at','2026-11-06T05:30:00.000Z']],['order',['created_at',{ascending:false}]],['order',['snapshot_id',{ascending:false}]],['limit',[1]],['maybeSingle',[]]]);
  expect(await db.publishState('CN')).toEqual({revision:5,inputRevision:9});
  expect(admin.queries.at(-1)).toEqual([['from',['macro_publish_state']],['select',['revision,input_revision']],['eq',['region','CN']],['maybeSingle',[]]]);
  expect(await db.chunksOf('b1')).toEqual([chunkRow]);
  expect(await db.regimeOf('s1')).toBeNull();
  expect(admin.queries.at(-1)).toEqual([['from',['macro_regime_results']],['select',['*']],['eq',['snapshot_id','s1']],['maybeSingle',[]]]);
  expect(anon.queries.some(c=>c[0][1][0]==='macro_regime_results')).toBe(false);                      // never through the anon key
  expect(admin.rpcCalls).toEqual([]);
 });
 it('maps Postgres messages to MacroDbError codes',async()=>{
  for(const [m,code] of [['stale_publisher','stale_publisher'],['invalid_manifest','invalid_manifest'],['quota_exceeded','quota_exceeded'],['already_resolved','already_resolved'],['not_found','not_found'],['reject_only','reject_only'],['fenced','fenced'],['quarantine_closed','quarantine_closed'],['member_ineligible','rpc_failed'],['batch_not_running','rpc_failed'],['ancestry_too_deep','rpc_failed'],['not_quarantined','rpc_failed'],['invalid_value_text','rpc_failed'],['chunk_total_mismatch','rpc_failed'],['new row for relation "macro_retrievals" violates check constraint "macro_retrievals_host"','rpc_failed']] as const){
   const e=toMacroDbError({message:m});expect(e).toBeInstanceOf(MacroDbError);expect([e.code,e.message]).toEqual([code,m]);
  }
  const admin=stub({rpc:()=>({data:null,error:{message:'stale_publisher'}})});
  const db=supabaseMacroDb({admin:admin.client,anon:stub().client});
  await expect(db.publishSnapshot(publishInput)).rejects.toMatchObject({name:'MacroDbError',code:'stale_publisher'});
  const anonErr=stub({select:()=>({data:null,error:{message:'permission denied for table macro_publish_state'}})});
  await expect(supabaseMacroDb({admin:anonErr.client,anon:anonErr.client}).publishState('US')).rejects.toMatchObject({code:'rpc_failed'});
  await expect(supabaseMacroDb({admin:stub({select:()=>({data:null,error:null})}).client,anon:stub().client}).publishState('US')).rejects.toMatchObject({code:'not_found'});
 });
 it('packWrites packs into calls of at most WRITE_CHUNK rows without splitting a (series, period) group; writeObservations itself sends ONE RPC per call (review T3-1)',async()=>{
  const rows:ObservationWrite[]=[];
  for(let i=0;i<WRITE_CHUNK-1;i++)rows.push(nativeRow('S',`2000-01-${String(1+(i%28)).padStart(2,'0')}`.replace('2000',String(2000+Math.floor(i/28))),'1','r','2026-11-01T05:30:00.000Z'));
  rows.push(nativeRow('G','2026-09-30','1','r','2026-11-01T05:30:00.000Z'),nativeRow('X','2026-09-30','1','r','2026-11-01T05:30:00.000Z'),nativeRow('G','2026-09-30','2','r','2026-11-01T05:30:00.000Z'));
  const packs=packWrites(rows);
  expect(packs.map(p=>p.length)).toEqual([WRITE_CHUNK-1,3]);
  expect(packs[1].map(r=>[r.series_id,r.value_text])).toEqual([['G','1'],['G','2'],['X','1']]);   // group contiguous, groups in first-appearance order
  expect(packWrites([])).toEqual([]);
  const admin=stub({rpc:(_fn,args)=>({data:{inserted:(args.p_rows as unknown[]).length,duplicates:0,versioned:0,quarantined:1,conflicts:[{series_id:'x',period_end:'2026-09-30',reason:'conflicting_rows',value_text:'1',current_value_text:null,observation_id:null}]},error:null})});
  const res=await supabaseMacroDb({admin:admin.client,anon:stub().client}).writeObservations('b','c',rows);
  expect(admin.rpcCalls).toHaveLength(1);                                                                // never split client-side
  expect(admin.rpcCalls[0][1].p_rows).toHaveLength(rows.length);
  expect(res.inserted).toBe(rows.length);expect(res.quarantined).toBe(1);expect(res.conflicts).toHaveLength(1);
  expect(await supabaseMacroDb({admin:stub().client,anon:stub().client}).writeObservations('b','c',[])).toEqual({inserted:0,duplicates:0,versioned:0,quarantined:0,conflicts:[]});
  const failing=stub({rpc:()=>({data:null,error:{message:'invalid_row'}})});
  await expect(supabaseMacroDb({admin:failing.client,anon:stub().client}).writeObservations('b','c',rows)).rejects.toMatchObject({code:'rpc_failed',message:'invalid_row'});
  expect(failing.rpcCalls).toHaveLength(1);                                                              // no later chunk after a failure
  expect(mergeResults([{inserted:1,duplicates:0,versioned:0,quarantined:0,conflicts:[]},{inserted:2,duplicates:1,versioned:0,quarantined:0,conflicts:[]}])).toEqual({inserted:3,duplicates:1,versioned:0,quarantined:0,conflicts:[]});
 });
 it('versionsOf and quarantineMembers page to completion (review T3-2): >1000 rows, stable ordering, member lookups in IN_CHUNK batches',async()=>{
  const all=Array.from({length:1500},(_,i)=>pgObs({version:i+1,value_text:String(i)}));
  const anon=stub({select:calls=>{const r=calls.find(c=>c[0]==='range')![1] as [number,number];return {data:all.slice(r[0],r[1]+1),error:null};}});
  const got=await supabaseMacroDb({admin:stub().client,anon:anon.client}).versionsOf('US_UNRATE','2026-09-30');
  expect(got).toHaveLength(1500);expect(got[1499].version).toBe(1500);
  expect(anon.queries.map(q=>q.find(c=>c[0]==='range')![1])).toEqual([[0,READ_PAGE-1],[READ_PAGE,2*READ_PAGE-1]]);
  expect(anon.queries[0]).toContainEqual(['order',['version',{ascending:true}]]);
  const members=Array.from({length:1250},()=>pgObs({status:'quarantined'}));
  const byId=new Map<string,unknown>(members.map(m=>[m.observation_id as string,m]));
  const admin=stub({select:calls=>{
   const table=calls[0][1][0];
   if(table==='macro_quarantine_members'){const r=calls.find(c=>c[0]==='range')![1] as [number,number];return {data:members.slice(r[0],r[1]+1).map(m=>({observation_id:m.observation_id})),error:null};}
   const ids=calls.find(c=>c[0]==='in')![1][1] as string[];return {data:ids.map(id=>byId.get(id)),error:null};
  }});
  const ms=await supabaseMacroDb({admin:admin.client,anon:stub().client}).quarantineMembers('q1');
  expect(ms).toHaveLength(1250);
  const memberQueries=admin.queries.filter(q=>q[0][1][0]==='macro_quarantine_members');
  expect(memberQueries.map(q=>q.find(c=>c[0]==='range')![1])).toEqual([[0,READ_PAGE-1],[READ_PAGE,2*READ_PAGE-1]]);
  expect(memberQueries[0]).toContainEqual(['order',['observation_id',{ascending:true}]]);
  const lookups=admin.queries.filter(q=>q[0][1][0]==='macro_observations').map(q=>(q.find(c=>c[0]==='in')![1][1] as string[]).length);
  expect(lookups).toEqual([200,200,200,200,200,200,50]);
  expect(Math.max(...lookups)).toBeLessThanOrEqual(IN_CHUNK);
 });
 it.each([[0,1],[20,1],[999,1],[1000,1],[1001,2],[1500,2],[15000,15]])('cold history fixture: %i rows use %i requests including exact count',async(size,budget)=>{
  const all=Array.from({length:size},(_,i)=>pgObs({period_end:new Date(Date.UTC(1980,0,1+i)).toISOString().slice(0,10),value_text:String(i)}));
  const anon=stub({select:calls=>{
   const range=calls.find(c=>c[0]==='range');
   const [from,to]=range?.[1] as [number,number]??[0,-1];
   return {data:range?all.slice(from,to+1):null,count:all.length,error:null};
  }});
  const got=await supabaseMacroDb({admin:stub().client,anon:anon.client}).seriesHistory('US_UNRATE',{maxRows:20000});
  expect(got.map(r=>r.value_text)).toEqual(all.map(r=>r.value_text));
  expect(anon.queries).toHaveLength(budget);
  expect(anon.queries[0]).toContainEqual(['select',['*',{count:'exact'}]]);
 });
 it.each(['first','later','lower-server-cap','zero-count-with-body','changed-count'] as const)('rejects incomplete counted history: %s',async fault=>{
  const all=Array.from({length:1500},(_,i)=>pgObs({period_end:new Date(Date.UTC(1980,0,1+i)).toISOString().slice(0,10)}));
  const anon=stub({select:calls=>{
   const [from,to]=calls.find(c=>c[0]==='range')![1] as [number,number];
   let data=all.slice(from,to+1),count=all.length;
   if((fault==='first'&&from===0)||(fault==='later'&&from>0))data=data.slice(0,-1);
   if(fault==='lower-server-cap')data=data.slice(0,500);
   if(fault==='zero-count-with-body')count=0;
   if(fault==='changed-count'&&from>0)count++;
   return {data,count,error:null};
  }});
  await expect(supabaseMacroDb({admin:stub().client,anon:anon.client}).seriesHistory('US_UNRATE',{maxRows:2000})).rejects.toMatchObject({code:'rpc_failed'});
 });
 it.each([999,1000,1001])('proves completeness at the raw maxRows boundary: %i rows',async count=>{
  const all=Array.from({length:count},(_,i)=>pgObs({period_end:'2026-09-30',version:i+1,value_text:String(i)}));
  const anon=stub({select:calls=>{
   const [from,to]=calls.find(c=>c[0]==='range')![1] as [number,number];
   return {data:all.slice(from,to+1),count,error:null};
  }});
  const job=supabaseMacroDb({admin:stub().client,anon:anon.client}).seriesHistory('US_UNRATE',{maxRows:1000});
  if(count>1000)await expect(job).rejects.toMatchObject({code:'truncated'});
  else expect((await job).map(r=>r.value_text)).toEqual([String(count-1)]);
  expect(anon.queries).toHaveLength(1); // many vintages cannot evade the raw cap by deduplication
 });
 it('deduplicates the winning vintage only after reading across a page boundary',async()=>{
  const all=Array.from({length:1001},(_,i)=>pgObs({period_end:new Date(Date.UTC(1980,0,1+Math.min(i,999))).toISOString().slice(0,10),version:i===1000?2:1,value_text:String(i)}));
  const anon=stub({select:calls=>{
   const [from,to]=calls.find(c=>c[0]==='range')![1] as [number,number];
   return {data:all.slice(from,to+1),count:all.length,error:null};
  }});
  const got=await supabaseMacroDb({admin:stub().client,anon:anon.client}).seriesHistory('US_UNRATE',{maxRows:1001});
  expect(got).toHaveLength(1000);expect(got.at(-1)).toMatchObject({version:2,value_text:'1000'});
 });
 it('rejects an over-cap count before reading doomed pages; strategy retries still select highest visible vintages',async()=>{
  // 7,500 periods with two visible vintages each: the strategy adapter must retry its 10,000 raw-row cap.
  const all=Array.from({length:15000},(_,i)=>pgObs({period_end:new Date(Date.UTC(1980,0,1+Math.floor(i/2))).toISOString().slice(0,10),version:i%2+1,value_text:String(i)}));
  const anon=stub({select:calls=>{
   const range=calls.find(c=>c[0]==='range');const [from,to]=range?.[1] as [number,number]??[0,-1];
   return {data:range?all.slice(from,to+1):null,count:all.length,error:null};
  }});
  const db=supabaseMacroDb({admin:stub().client,anon:anon.client});
  const got=await macroDbStrategyPort(db).seriesHistory('US_UNRATE',{asOf:'2026-11-06T00:00:00Z',maxRows:10000});
  expect(got.map(r=>r.value_text)).toEqual(all.filter(r=>r.version===2).map(r=>r.value_text));
  expect(anon.queries).toHaveLength(16); // one failed first page + fifteen pages on the enlarged cap
  expect(anon.queries.filter(q=>q.some(c=>c[0]==='select'&&(c[1][1] as {count?:string})?.count==='exact'))).toHaveLength(2);
 });
 it('pages history with .range() (≤ READ_PAGE per page), keeps the highest version per period, throws truncated beyond maxRows',async()=>{
  const all=Array.from({length:1500},(_,i)=>pgObs({period_end:`${String(1900+Math.floor(i/12)).padStart(4,'0')}-${String(1+(i%12)).padStart(2,'0')}-28`,value_text:String(i)}));
  const anon=stub({select:calls=>{const range=calls.find(c=>c[0]==='range');if(!range)return {data:null,count:all.length,error:null};const r=range[1] as [number,number];return {data:all.slice(r[0],r[1]+1),count:all.length,error:null};}});
  const db=supabaseMacroDb({admin:stub().client,anon:anon.client});
  const got=await db.seriesHistory('US_UNRATE',{maxRows:2000,from:'1900-01-01',to:'2100-01-01',asOf:'2026-11-06T00:00:00.000Z'});
  expect(got).toHaveLength(1500);
  expect(anon.queries.map(q=>q.find(c=>c[0]==='range')?.[1]??'count')).toEqual([[0,READ_PAGE-1],[READ_PAGE,1499]]);
  expect(anon.queries[0].slice(0,9)).toEqual([['from',['macro_observations']],['select',['*',{count:'exact'}]],['eq',['series_id','US_UNRATE']],['eq',['status','ok']],['gte',['period_end','1900-01-01']],['lte',['period_end','2100-01-01']],['lte',['available_at','2026-11-06T00:00:00.000Z']],['order',['period_end',{ascending:true}]],['order',['version',{ascending:true}]]]);
  for(const q of anon.queries)expect(q.slice(2,9)).toEqual(anon.queries[0].slice(2,9));
  expect(anon.queries[1]).toContainEqual(['select',['*']]);
  await expect(db.seriesHistory('US_UNRATE',{maxRows:1499})).rejects.toMatchObject({code:'truncated'});
  const v=[pgObs({period_end:'2026-08-31',version:1,value_text:'1'}),pgObs({period_end:'2026-09-30',version:1,value_text:'2'}),pgObs({period_end:'2026-09-30',version:2,value_text:'3'})].map(r=>({...r,available_at:'2026-11-02T05:30:00.000Z',ingested_at:'2026-11-02T05:30:00.000Z'}));
  const one=supabaseMacroDb({admin:stub().client,anon:stub({select:calls=>calls.some(c=>c[0]==='range')?{data:v,count:v.length,error:null}:{data:null,count:v.length,error:null}}).client});
  expect((await one.seriesHistory('X',{maxRows:10})).map(x=>x.value_text)).toEqual(['1','3']);
  expect(highestPerPeriod([])).toEqual([]);
 });
 it.each([undefined,null,-1,1.5,Number.MAX_SAFE_INTEGER+1])('fails closed for an unusable history count %s',async count=>{
  const anon=stub({select:()=>({data:[pgObs()],count,error:null})});
  await expect(supabaseMacroDb({admin:stub().client,anon:anon.client}).seriesHistory('X',{maxRows:2000})).rejects.toMatchObject({code:'rpc_failed'});
  expect(anon.queries).toHaveLength(1);
 });
 it('bounds counted history fan-out and preserves every ordered page',async()=>{
  const all=Array.from({length:15000},(_,i)=>pgObs({period_end:`${String(1800+Math.floor(i/12)).padStart(4,'0')}-${String(i%12+1).padStart(2,'0')}-28`,value_text:String(i)}));
  let inFlight=0,maxInFlight=0;
  const anon=stub({select:async calls=>{
   const range=calls.find(c=>c[0]==='range');if(!range)return {data:null,count:all.length,error:null};
   inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await new Promise(r=>setTimeout(r,1));inFlight--;
   const [from,to]=range[1] as [number,number];return {data:all.slice(from,to+1),count:all.length,error:null};
  }});
  const got=await supabaseMacroDb({admin:stub().client,anon:anon.client}).seriesHistory('US_UNRATE',{maxRows:20000});
  expect(got.map(r=>r.value_text)).toEqual(all.map(r=>r.value_text));
  expect(maxInFlight).toBeLessThanOrEqual(HISTORY_PAGE_CONCURRENCY);
  expect(anon.queries.filter(q=>q.some(c=>c[0]==='range')).map(q=>q.find(c=>c[0]==='range')![1])).toEqual(Array.from({length:15},(_,i)=>[i*1000,i*1000+999]));
 });
 it('shares the history-page budget across thirteen histories, including their first pages',async()=>{
  const all=Array.from({length:2001},(_,i)=>pgObs({period_end:new Date(Date.UTC(1980,0,1+i)).toISOString().slice(0,10),value_text:String(i)}));
  const releases:(()=>void)[]=[];let active=0,peak=0,completed=0;
  const anon=stub({select:async calls=>{
   const [from,to]=calls.find(c=>c[0]==='range')![1] as [number,number];
   active++;peak=Math.max(peak,active);
   await new Promise<void>(resolve=>releases.push(resolve));active--;completed++;
   return {data:all.slice(from,to+1),count:all.length,error:null};
  }});
  const db=supabaseMacroDb({admin:stub().client,anon:anon.client});
  const jobs=Promise.all(Array.from({length:13},(_,i)=>db.seriesHistory(`source${i}`,{maxRows:3000})));
  await new Promise<void>(resolve=>setImmediate(resolve));
  const initial=active;
  // Release successive waves explicitly; no elapsed-time assumption determines the bound.
  for(let wave=0;wave<40&&completed<39;wave++){
   releases.splice(0).forEach(release=>release());
   await new Promise<void>(resolve=>setImmediate(resolve));
  }
  const histories=await jobs;
  expect(initial).toBe(HISTORY_PAGE_CONCURRENCY);
  expect(peak).toBe(HISTORY_PAGE_CONCURRENCY);expect(completed).toBe(39);
  for(const history of histories)expect(history.map(r=>r.value_text)).toEqual(all.map(r=>r.value_text));
 });
 it.each([0,1000])('propagates a timeout at offset %i and releases shared history permits for subsequent reads',async offset=>{
  const all=Array.from({length:1500},(_,i)=>pgObs({period_end:new Date(Date.UTC(1980,0,1+i)).toISOString().slice(0,10)}));
  let fail=true,active=0,peak=0;
  const anon=stub({select:async calls=>{
   const [from,to]=calls.find(c=>c[0]==='range')![1] as [number,number];
   active++;peak=Math.max(peak,active);await new Promise<void>(resolve=>setImmediate(resolve));active--;
   if(fail&&from===offset){fail=false;return {data:null,error:{message:'canceling statement due to statement timeout',code:'57014'}};}
   return {data:all.slice(from,to+1),count:all.length,error:null};
  }});
  const db=supabaseMacroDb({admin:stub().client,anon:anon.client});
  const settled=await Promise.allSettled(Array.from({length:13},(_,i)=>db.seriesHistory(`source${i}`,{maxRows:2000})));
  const failures=settled.filter(r=>r.status==='rejected');
  expect(failures).toHaveLength(1);
  expect((failures[0] as PromiseRejectedResult).reason).toMatchObject({code:'rpc_failed',message:'canceling statement due to statement timeout'});
  expect(await db.seriesHistory('after-error',{maxRows:2000})).toHaveLength(1500);
  expect(active).toBe(0);expect(peak).toBeLessThanOrEqual(HISTORY_PAGE_CONCURRENCY);
 });
 it('drains admitted pages and stops claiming new pages after a history page fails',async()=>{
  const all=Array.from({length:15000},(_,i)=>pgObs({period_end:new Date(Date.UTC(1980,0,1+i)).toISOString().slice(0,10)}));
  const releases=new Map<number,()=>void>();let active=0,activeAtRejection=-1,settled=false;
  const starts:number[]=[];
  const anon=stub({select:async calls=>{
   const [from,to]=calls.find(c=>c[0]==='range')![1] as [number,number];starts.push(from);
   if(from===0)return {data:all.slice(from,to+1),count:all.length,error:null};
   active++;await new Promise<void>(resolve=>releases.set(from,resolve));active--;
   if(from===1000)return {data:null,error:{message:'canceling statement due to statement timeout'}};
   return {data:all.slice(from,to+1),error:null};
  }});
  const db=supabaseMacroDb({admin:stub().client,anon:anon.client});
  const job=db.seriesHistory('US_UNRATE',{maxRows:20000}).catch(error=>{activeAtRejection=active;settled=true;return error;});
  await new Promise<void>(resolve=>setImmediate(resolve));
  expect(releases.size).toBe(HISTORY_PAGE_CONCURRENCY);releases.get(1000)!();releases.delete(1000);
  await new Promise<void>(resolve=>setImmediate(resolve));
  const settledBeforeDrain=settled;
  for(let wave=0;wave<20&&!settled;wave++){
   const ready=[...releases.values()];releases.clear();ready.forEach(release=>release());
   await new Promise<void>(resolve=>setImmediate(resolve));
  }
  // Also release peer jobs on the old immediate-rejection implementation before making assertions.
  for(let wave=0;wave<20&&releases.size;wave++){
   const ready=[...releases.values()];releases.clear();ready.forEach(release=>release());
   await new Promise<void>(resolve=>setImmediate(resolve));
  }
  expect(await job).toMatchObject({code:'rpc_failed',message:'canceling statement due to statement timeout'});
  expect(settledBeforeDrain).toBe(false);expect(activeAtRejection).toBe(0);
  expect(starts).toEqual(Array.from({length:HISTORY_PAGE_CONCURRENCY+1},(_,i)=>i*1000));
 });
 it('chunks observationsByIds by IN_CHUNK and returns input order, ok rows only',async()=>{
  const ids=Array.from({length:IN_CHUNK*2+50},()=>randomUUID());
  const anon=stub({select:calls=>{const inIds=calls.find(c=>c[0]==='in')![1][1] as string[];return {data:inIds.filter((_,i)=>i%2===0).map(id=>pgObs({observation_id:id})),error:null};}});
  const got=await supabaseMacroDb({admin:stub().client,anon:anon.client}).observationsByIds([...ids].reverse());
  expect(anon.queries.map(q=>(q.find(c=>c[0]==='in')![1][1] as string[]).length)).toEqual([IN_CHUNK,IN_CHUNK,50]);
  for(const q of anon.queries)expect(q).toContainEqual(['eq',['status','ok']]);
  const expected=[...ids].reverse().filter(id=>anon.queries.some(q=>{const part=q.find(c=>c[0]==='in')![1][1] as string[];return part.indexOf(id)%2===0;}));
  expect(got.map(x=>x.observation_id)).toEqual(expected);
 });
});
