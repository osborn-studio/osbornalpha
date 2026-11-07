// src/lib/judgments/compensate.test.ts
// F4 Task 12 (spec §7.1 step 0, audits F28/G25/N2): the macro compensation scan over a stub MacroReadApi and a
// stub produce: missing snapshots are produced with binding {snapshot_id}, existing ones (GIN lookup) and failed
// snapshots are skipped, the job-state marker advances under the optimistic lock after every finished snapshot,
// a produce failure stops WITHOUT advancing, a lost CAS reports job_state_conflict, MacroUnavailable and a missing
// methodology skip the scan.
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {emptyCounts} from '@/lib/dq/batches';
import {compensateMacro} from './compensate';
import type {CompensateDeps,ProduceFn} from './compensate';
import {jobKey} from './job-keys';
import {MacroUnavailable,unavailableMacroReadApi} from './macro-api';
import {memoryJudgmentsDb} from './memory-judgments-db';
import {stubInputsDb,withOverrides} from './testing/fixtures';
import type {JudgmentsDb,MacroSnapshotRow,Methodology} from './types';

const METHOD={id:'macro_regime',version:'v1'} as unknown as Methodology;
const KEY=jobKey('produce','macro_regime','v1');
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
 const marker=async()=>(await mem.jobState(KEY))?.state??null;
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
  const db=withOverrides<JudgmentsDb>(s.db,{setJobState:async()=>false});
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
