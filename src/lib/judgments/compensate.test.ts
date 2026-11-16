// src/lib/judgments/compensate.test.ts
// F4 Task 12 (spec §7.1 step 0, audits F28/G25/N2): the macro compensation scan over a stub MacroReadApi and a
// stub produce: missing snapshots are produced with binding {snapshot_id}, existing ones (GIN lookup) and failed
// snapshots are skipped, the job-state marker advances under the optimistic lock after every finished snapshot,
// a produce failure stops WITHOUT advancing, a lost CAS reports job_state_conflict, MacroUnavailable and a missing
// methodology skip the scan.
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {emptyCounts,isInfoError} from '@/lib/dq/batches';
import {compensateMacro} from './compensate';
import type {CompensateDeps,ProduceFn} from './compensate';
import {jobKey} from './job-keys';
import {MacroUnavailable,unavailableMacroReadApi} from './macro-api';
import {memoryJudgmentsDb} from './memory-judgments-db';
import {stubInputsDb,withOverrides} from './testing/fixtures';
import type {JudgmentsDb,MacroSnapshotRow,Methodology} from './types';

const METHOD={id:'macro_regime',version:'v2'} as unknown as Methodology;
const KEY=jobKey('produce','macro_regime','v2');
const sid=(i:number)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const snap=(i:number,status:MacroSnapshotRow['status']='active'):MacroSnapshotRow=>({snapshot_id:sid(i),region:'US',as_of:`2026-10-${String(i).padStart(2,'0')}`,methodology_version:'v1.0',
 catalog_version:'catalog/1',observation_ids:[],regime:null,created_at:`2026-10-${String(i).padStart(2,'0')}T06:00:00.000Z`,status});
const ok:ProduceFn=async()=>({counts:{...emptyCounts(),fetched:1,inserted:1},errors:[]});
const bad:ProduceFn=async()=>({counts:{...emptyCounts(),fetched:1,failed:1},errors:[{code:'input_not_public',key:'US'}]});

function setup(snaps:MacroSnapshotRow[],existing:string[]=[]){
 const tables=memoryTableClient({ingest_batches:['batch_id']});
 const mem=memoryJudgmentsDb({tables});
 const db=withOverrides<JudgmentsDb>(mem,{judgmentsBySnapshot:async(id:string)=>existing.includes(id)?['11111111-1111-4111-8111-111111111111']:[]});
 const since=vi.fn(async(marker:{created_at:string;snapshot_id:string}|null,limit:number)=>
  snaps.filter(s=>!marker||s.created_at>marker.created_at||(s.created_at===marker.created_at&&s.snapshot_id>marker.snapshot_id)).slice(0,limit));
 const inputsDb=stubInputsDb({macro:{...stubInputsDb().macro,snapshotsSince:since}});
 const produce=vi.fn<ProduceFn>(ok);
 const deps=(over:Partial<CompensateDeps>={}):CompensateDeps=>({db,inputsDb,tables,codeVersion:'test-code-version',triggeredBy:'cron',signal:new AbortController().signal,methodology:METHOD,produce,...over});
 // the marker fields only (the job state also carries the stall counter and the skipped list, T-07)
 const marker=async()=>{const st=(await mem.jobState(KEY))?.state;return st&&typeof st.marker_snapshot_id==='string'?{marker_created_at:st.marker_created_at,marker_snapshot_id:st.marker_snapshot_id}:null;};
 return {mem,db,tables,since,produce,deps,marker};
}

describe('compensateMacro (settle step 0)',()=>{
 it('produces missing snapshots with their binding, skips existing and failed ones, advances the marker to the last finished snapshot',async()=>{
  const s=setup([snap(1),snap(2),snap(3,'failed'),snap(4,'superseded')],[sid(2)]);
  const r=await compensateMacro(s.deps());
  expect(r).toMatchObject({status:'done',reason:null,scanned:4,produced:2,existing:1,skippedFailed:1,stoppedAt:null,errors:[]});
  expect(s.since).toHaveBeenCalledWith(null,200);
  expect(s.produce.mock.calls.map(c=>c[1])).toEqual([
   [{subject:{type:'macro_region',key:'US'},asOf:'2026-10-01',binding:{snapshot_id:sid(1)}}],
   [{subject:{type:'macro_region',key:'US'},asOf:'2026-10-04',binding:{snapshot_id:sid(4)}}]]);
  expect(s.produce.mock.calls[0][2]).toMatchObject({batchId:r.batchId,codeVersion:'test-code-version',actor:'cron'});
  expect(await s.marker()).toEqual({marker_created_at:'2026-10-04T06:00:00.000Z',marker_snapshot_id:sid(4)});
  const batches=s.tables.rows('ingest_batches');
  expect(batches).toHaveLength(1);
  expect(batches[0]).toMatchObject({batch_id:r.batchId,producer:'ts-judgments',dataset:'judgments.produce.macro_regime',status:'success',triggered_by:'cron'});
  const again=await compensateMacro(s.deps());                       // next cron starts after the marker
  expect(s.since).toHaveBeenLastCalledWith({created_at:'2026-10-04T06:00:00.000Z',snapshot_id:sid(4)},200);
  expect(again).toMatchObject({status:'done',scanned:0,produced:0,batchId:null});
 });
 it('a produce failure stops the scan without advancing past the failed snapshot; the next run retries it',async()=>{
  const s=setup([snap(1),snap(2),snap(3)]);
  s.produce.mockImplementationOnce(ok).mockImplementationOnce(bad);
  const r=await compensateMacro(s.deps());
  expect(r).toMatchObject({status:'stopped',reason:'produce_failed',produced:1,stoppedAt:sid(2)});
  expect(await s.marker()).toEqual({marker_created_at:'2026-10-01T06:00:00.000Z',marker_snapshot_id:sid(1)});
  expect(s.tables.rows('ingest_batches')[0]).toMatchObject({status:'partial'});   // one snapshot landed, the next failed
  const retry=await compensateMacro(s.deps());
  expect(s.produce.mock.calls.slice(2).map(c=>c[1][0].binding)).toEqual([{snapshot_id:sid(2)},{snapshot_id:sid(3)}]);
  expect(retry).toMatchObject({status:'done',produced:2});
 });
 it('D1: a duplicate result (an inputs-less abstention re-produced) counts as done and advances the marker',async()=>{
  const s=setup([snap(1)]);
  s.produce.mockImplementationOnce(async()=>({counts:{...emptyCounts(),fetched:1,duplicates:1},errors:[]}));
  expect(await compensateMacro(s.deps())).toMatchObject({status:'done',produced:1,stoppedAt:null});
  expect(await s.marker()).toEqual({marker_created_at:'2026-10-01T06:00:00.000Z',marker_snapshot_id:sid(1)});
 });
 it('a thrown produce counts as a failure of that snapshot',async()=>{
  const s=setup([snap(1)]);
  s.produce.mockImplementationOnce(async()=>{throw new Error('boom');});
  expect(await compensateMacro(s.deps())).toMatchObject({status:'stopped',reason:'produce_failed',stoppedAt:sid(1)});
  expect(await s.marker()).toBeNull();
 });
 it('a lost optimistic lock reports job_state_conflict and stops',async()=>{
  const s=setup([snap(1),snap(2)]);
  const db=withOverrides<JudgmentsDb>(s.db,{setJobState:async()=>({ok:false,updated_at:null})});
  const r=await compensateMacro(s.deps({db}));
  expect(r).toMatchObject({status:'stopped',reason:'job_state_conflict',stoppedAt:sid(1),produced:1,errors:[{code:'job_state_conflict',key:KEY}]});
 });
 it('MacroUnavailable (production before WP-M3) skips with info macro_unavailable; a missing methodology skips silently',async()=>{
  const s=setup([snap(1)]);
  const r=await compensateMacro(s.deps({inputsDb:stubInputsDb({macro:unavailableMacroReadApi()})}));
  expect(r).toMatchObject({status:'skipped',reason:'macro_unavailable',produced:0,batchId:null});
  expect(r.errors.map(e=>e.code)).toEqual(['macro_unavailable']);
  const thrown=await compensateMacro(s.deps({inputsDb:stubInputsDb({macro:{...stubInputsDb().macro,snapshotsSince:async()=>{throw new MacroUnavailable('macro_unavailable');}}})}));
  expect(thrown.reason).toBe('macro_unavailable');
  expect(await compensateMacro(s.deps({methodology:null}))).toMatchObject({status:'skipped',reason:'methodology_missing',errors:[]});
  expect(s.since).not.toHaveBeenCalled();expect(s.produce).not.toHaveBeenCalled();
 });
 it('stops at its budget (deadline_hit) or on abort, keeping the marker at the last finished snapshot',async()=>{
  const s=setup([snap(1),snap(2)]);
  let ms=0;
  s.produce.mockImplementation(async()=>{ms=61_000;return ok(METHOD,[],{} as never);});
  const r=await compensateMacro(s.deps({clock:()=>ms,deadlineAt:60_000}));
  expect(r).toMatchObject({status:'stopped',reason:'deadline',stoppedAt:sid(2),produced:1});
  expect(r.errors.map(e=>e.code)).toEqual(['deadline_hit']);
  expect(await s.marker()).toEqual({marker_created_at:'2026-10-01T06:00:00.000Z',marker_snapshot_id:sid(1)});
  const ctl=new AbortController();ctl.abort();
  expect((await compensateMacro(s.deps({signal:ctl.signal}))).reason).toBe('deadline');
 });
});

describe('compensateMacro hardening (T-03, T-04, T-07)',()=>{
 it('T-04: marker writes are strictly monotonic — a snapshot that sorts before the stored marker (S3 then S2) stops the scan and is neither produced nor written',async()=>{
  const s=setup([snap(3),snap(2)]);
  const feed=vi.fn(async()=>[snap(3),snap(2)]);
  const r=await compensateMacro(s.deps({inputsDb:stubInputsDb({macro:{...stubInputsDb().macro,snapshotsSince:feed}})}));
  expect(r).toMatchObject({status:'stopped',reason:'marker_regression',stoppedAt:sid(2),produced:1});
  expect(r.errors).toEqual([expect.objectContaining({code:'marker_regression',key:sid(2)})]);
  expect(isInfoError(r.errors[0])).toBe(false);
  expect(s.produce).toHaveBeenCalledTimes(1);
  expect(await s.marker()).toEqual({marker_created_at:'2026-10-03T06:00:00.000Z',marker_snapshot_id:sid(3)});
  // equal created_at: ordered by snapshot_id
  const t=setup([]);
  const twin=(id:string,c:string):MacroSnapshotRow=>({...snap(1),snapshot_id:id,created_at:c});
  const r2=await compensateMacro(t.deps({inputsDb:stubInputsDb({macro:{...stubInputsDb().macro,snapshotsSince:async()=>[twin(sid(9),'2026-10-01T06:00:00.000Z'),twin(sid(5),'2026-10-01T06:00:00.000Z')]}})}));
  expect(r2).toMatchObject({reason:'marker_regression',stoppedAt:sid(5)});
 });
 it('T-04: the scan keeps ownership of the revision it wrote — a foreign write in between makes its next write a conflict instead of being overwritten',async()=>{
  const s=setup([snap(1),snap(2)]);
  let n=0;
  const db=withOverrides<JudgmentsDb>(s.db,{setJobState:async(job,exp,state)=>{
   const r=await s.db.setJobState(job,exp,state);
   if(++n===1)await s.db.setJobState(job,r.updated_at,{marker_created_at:'2026-10-09T00:00:00.000Z',marker_snapshot_id:sid(9)});   // another writer
   return r;
  }});
  const r=await compensateMacro(s.deps({db}));
  expect(r).toMatchObject({status:'stopped',reason:'job_state_conflict',produced:2});
  expect(r.errors).toContainEqual({code:'job_state_conflict',key:KEY});
  expect((await s.mem.jobState(KEY))!.state).toMatchObject({marker_snapshot_id:sid(9)});   // the foreign write survives
 });
 it('T-07: a snapshot whose produce fails on 3 consecutive runs is recorded in skipped, the marker moves past it, the scan continues, and a NON-info compensation_skipped is reported',async()=>{
  const s=setup([snap(1),snap(2),snap(3)]);
  s.produce.mockImplementation(async(_m,work)=>work[0].binding?.snapshot_id===sid(2)?bad(METHOD,[],{} as never):ok(METHOD,[],{} as never));
  const r1=await compensateMacro(s.deps());
  expect(r1).toMatchObject({status:'stopped',reason:'produce_failed',stoppedAt:sid(2)});
  expect((await s.mem.jobState(KEY))!.state).toMatchObject({failing:{snapshot_id:sid(2),attempts:1}});
  const r2=await compensateMacro(s.deps());
  expect(r2).toMatchObject({status:'stopped',reason:'produce_failed'});
  expect((await s.mem.jobState(KEY))!.state).toMatchObject({failing:{snapshot_id:sid(2),attempts:2}});
  const r3=await compensateMacro(s.deps());
  expect(r3).toMatchObject({status:'done',reason:null,stoppedAt:null});
  const skip=r3.errors.find(e=>e.code==='compensation_skipped')!;
  expect(skip).toMatchObject({key:sid(2)});expect(isInfoError(skip)).toBe(false);
  const st=(await s.mem.jobState(KEY))!.state;
  expect(st).toMatchObject({marker_snapshot_id:sid(3),skipped:[{snapshot_id:sid(2),created_at:'2026-10-02T06:00:00.000Z',reason:'produce_failed',attempts:3}]});
  expect(st.failing).toBeUndefined();
  expect(s.produce.mock.calls.map(c=>c[1][0].binding?.snapshot_id)).toEqual([sid(1),sid(2),sid(2),sid(2),sid(3)]);   // S1 once, S2 three times, S3 after the skip
  expect(await compensateMacro(s.deps())).toMatchObject({status:'done',scanned:0});
 });
 it('T-07: the stall counter is per snapshot and consecutive — a success (or a duplicate) clears it; a different snapshot restarts at 1',async()=>{
  const s=setup([snap(1),snap(2)]);
  s.produce.mockImplementationOnce(bad).mockImplementationOnce(bad);
  await compensateMacro(s.deps());await compensateMacro(s.deps());
  expect((await s.mem.jobState(KEY))!.state).toMatchObject({failing:{snapshot_id:sid(1),attempts:2}});
  s.produce.mockImplementationOnce(async()=>({counts:{...emptyCounts(),fetched:1,duplicates:1},errors:[]}));   // third run: duplicate = done
  const r=await compensateMacro(s.deps());
  expect(r).toMatchObject({status:'done',produced:2});expect(r.errors.map(e=>e.code)).not.toContain('compensation_skipped');
  const st=(await s.mem.jobState(KEY))!.state;expect(st.failing).toBeUndefined();expect(st.skipped).toBeUndefined();
 });
 it('T2-01/T2-03: a hung snapshot read stops at the abort; produce is NOT raced — it is awaited and cooperates through deps.signal, and its deferred result is a stop, not a stall count',async()=>{
  const s=setup([snap(1)]);
  const ctl=new AbortController();
  const hung=compensateMacro(s.deps({signal:ctl.signal,inputsDb:stubInputsDb({macro:{...stubInputsDb().macro,snapshotsSince:()=>new Promise(()=>undefined)}})}));
  setTimeout(()=>ctl.abort(),5);
  expect(await hung).toMatchObject({status:'stopped',reason:'deadline'});
  const ctl2=new AbortController();let got:AbortSignal|undefined;let settled=false;
  s.produce.mockImplementationOnce(async(_m,_w,d)=>{got=d.signal;await new Promise<void>(r=>d.signal!.addEventListener('abort',()=>r(),{once:true}));await new Promise(r=>setTimeout(r,20));settled=true;
   return {counts:{...emptyCounts(),fetched:1,deferred:1},errors:[{code:'deadline_hit',key:'US'}]};});
  const p=compensateMacro(s.deps({signal:ctl2.signal}));
  setTimeout(()=>ctl2.abort(),5);
  const r=await p;
  expect(settled).toBe(true);                                   // the in-flight produce item was awaited to its end
  expect(got).toBeDefined();expect(got!.aborted).toBe(true);
  expect(r).toMatchObject({status:'stopped',reason:'deadline',stoppedAt:sid(1),produced:0});
  expect(r.errors.map(e=>e.code)).toContain('deadline_hit');
  expect((await s.mem.jobState(KEY))?.state.failing).toBeUndefined();
  expect(s.tables.rows('ingest_batches')[0]).toMatchObject({status:'success'});   // the produce batch is finished with its counts
 });
 it('T2-03: compensation has its OWN budget signal — an un-aborted parent still stops at deadlineAt, for snapshotsSince, judgmentsBySnapshot and produce',async()=>{
  const soon=()=>Date.now()+30;
  const a=setup([snap(1)]);
  const t0=Date.now();
  const r1=await compensateMacro(a.deps({deadlineAt:soon(),inputsDb:stubInputsDb({macro:{...stubInputsDb().macro,snapshotsSince:()=>new Promise(()=>undefined)}})}));
  expect(r1).toMatchObject({status:'stopped',reason:'deadline'});expect(Date.now()-t0).toBeLessThan(2000);
  const b=setup([snap(1)]);
  const hungDb=withOverrides<JudgmentsDb>(b.db,{judgmentsBySnapshot:()=>new Promise<string[]>(()=>undefined)});
  expect(await compensateMacro(b.deps({db:hungDb,deadlineAt:soon()}))).toMatchObject({status:'stopped',reason:'deadline',stoppedAt:sid(1)});
  const c=setup([snap(1)]);let seen:AbortSignal|undefined;
  c.produce.mockImplementationOnce(async(_m,_w,d)=>{seen=d.signal;await new Promise<void>(r=>d.signal!.addEventListener('abort',()=>r(),{once:true}));return {counts:{...emptyCounts(),fetched:1,deferred:1},errors:[]};});
  const r3=await compensateMacro(c.deps({deadlineAt:soon()}));
  expect(seen!.aborted).toBe(true);expect(r3).toMatchObject({status:'stopped',reason:'deadline'});
 });
});

describe('T12 r3 cancellation before produce',()=>{
 it.each(['batch','zero-fetched'] as const)('%s cancellation never advances the failing marker',async phase=>{
  const s=setup([snap(1)]);const ac=new AbortController();
  await s.mem.setJobState(KEY,null,{failing:{snapshot_id:sid(1),attempts:2}});
  const before=await s.mem.jobState(KEY);
  const tables={...s.tables,insert:async(...args:Parameters<typeof s.tables.insert>)=>{
   const row=await s.tables.insert(...args);if(phase==='batch')ac.abort();return row;
  }};
  s.produce.mockImplementation(async()=>({counts:emptyCounts(),errors:[{code:'deadline_hit'}]}));
  const r=await compensateMacro(s.deps({tables,signal:ac.signal}));
  expect(r).toMatchObject({status:'stopped',reason:'deadline',skippedStalled:0});
  expect(await s.mem.jobState(KEY)).toEqual(before);
  if(phase==='batch')expect(s.produce).not.toHaveBeenCalled();
 });
});
