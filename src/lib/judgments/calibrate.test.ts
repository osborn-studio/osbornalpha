// src/lib/judgments/calibrate.test.ts
// runCalibrate / stepUnit over a purpose-built fake of the ten JudgmentsDb methods the job calls
// (cohort freeze = a copy of the visible set at that instant, frozen-member keyset paging, generation clear,
// validity revision, insert_calibration semantics, optimistic job state incl. the round cursor) and
// memoryCohortStore. The SQL side of the same flows is calibrate.integration.test.ts.
import {describe,expect,it} from 'vitest';
import type {TableClient} from '../db/table-client';
import {memoryTableClient} from '../db/memory-table-client';
import {CalibrateError,PAGE_SIZE,ROUND_JOB,fingerprintOf,inScope,previewCalibrate,runCalibrate,runUnit,stepUnit,unitPath,unitsOf,windowOf} from './calibrate';
import type {CalibrateDeps,RoundState,StepContext,UnitState} from './calibrate';
import {memoryCohortStore} from './cohort-store';
import type {CohortStore} from './cohort-store';
import {sha256} from './canonical';
import {envelope,methodologyRow,uuidOf} from './testing/envelopes';
import type {CalibrationRow,Envelope,JudgmentsDb,MethodologyRow} from './types';

const T0=Date.parse('2026-11-09T04:00:00.000Z');
const dec=new TextDecoder();

function fakeDb(rows:MethodologyRow[],envelopes:Envelope[]){
 let clock=T0,revision=1,failClears=0,failPageCas=0;
 const jobs=new Map<string,{state:Record<string,unknown>;updated_at:string}>();
 const calibrations:CalibrationRow[]=[];const fingerprints=new Set<string>();
 const hooks:{onCohort?:(call:number)=>void}={};let cohortCalls=0;
 const tick=()=>new Date(clock+=1000).toISOString();
 /** generation → the members frozen at freeze time (a later push into `envelopes` never reaches a frozen set: MVCC). */
 const frozen=new Map<string,Envelope[]>();
 /** generation → its claim marker (the SQL's judgment_job_state['cohort:<generation>'], Q1-05). */
 const markers=new Map<string,{frozen_at:string;n:number}>();
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset']});
 const select=tables.select.bind(tables);
 tables.select=async(table,match,opts)=>{
  const rows=table==='judgment_job_state'?[...jobs].map(([job,v])=>({job,...v})):table==='judgment_calibrations'?calibrations:null;
  return rows?rows.slice(opts?.offset??0,(opts?.offset??0)+(opts?.limit??1000)):select(table,match,opts);
 };
 const db={
  tables,
  async serverTime(){return tick();},
  async methodology(id:string,v:string){return rows.find(r=>r.methodology_id===id&&r.version===v)??null;},
  async calibrationValidity(){return {revision};},
  async freezeCalibrationCohort(generation:string,id:string,v:string,w:{from:string;to:string}){
   const claimed=markers.get(generation);                                                        // Q1-05: claimed once, even when empty
   if(claimed)return {status:'already_frozen' as const,...claimed};
   const at=tick();
   const set=envelopes.filter(e=>e.judgment.methodology_id===id&&e.judgment.methodology_version===v&&!e.judgment.abstained&&e.judgment.as_of>=w.from&&e.judgment.as_of<=w.to&&e.judgment.registered_at<=at)
    .sort((a,b)=>a.judgment.judgment_id<b.judgment.judgment_id?-1:1)
    .map(e=>({...e,settlement:e.settlement&&e.settlement.settled_at<=at?e.settlement:null}));
   frozen.set(generation,structuredClone(set));markers.set(generation,{frozen_at:at,n:set.length});
   return {status:'frozen' as const,frozen_at:at,n:set.length};
  },
  async cohortMembers(generation:string,after:string|null,limit:number){
   hooks.onCohort?.(++cohortCalls);
   return structuredClone((frozen.get(generation)??[]).filter(e=>after===null||e.judgment.judgment_id>after).slice(0,limit));
  },
  async clearCalibrationGeneration(generation:string){const n=frozen.get(generation)?.length??0;frozen.delete(generation);markers.delete(generation);return n;},
  async insertCalibration(row:CalibrationRow,expected:number){
   if(row.validity_revision!==expected||expected!==revision)return 'stale_revision' as const;
   if(fingerprints.has(row.fingerprint))return 'duplicate' as const;
   fingerprints.add(row.fingerprint);calibrations.push(structuredClone(row));return 'inserted' as const;
  },
  async jobState(job:string){const j=jobs.get(job);return j?structuredClone(j):null;},
  async setJobState(job:string,expected:string|null,state:Record<string,unknown>){
   const cur=jobs.get(job);
   if((cur?.updated_at??null)!==expected)return {ok:false,updated_at:null};
   const clearing=Object.keys(state).length===0;
   if(clearing&&failClears>0){failClears--;return {ok:false,updated_at:null};}
   if(!clearing&&(state as unknown as UnitState).manifest?.length&&failPageCas>0){failPageCas--;throw new Error('connection reset');}
   jobs.set(job,{state:structuredClone(state),updated_at:tick()});return {ok:true,updated_at:jobs.get(job)!.updated_at};
  },
  async repairStaleBatches(){return 0;},
 };
 return {db:db as unknown as JudgmentsDb,jobs,calibrations,hooks,frozen,
  bump(){revision++;},failNextClear(n=1){failClears=n;},crashNextPageCas(n=1){failPageCas=n;},advance(ms:number){clock+=ms;},get now(){return clock;},
  round(){return jobs.get(ROUND_JOB)?.state as unknown as RoundState|undefined;}};
}

/** subject_types holds no public type, so the method has exactly one unit ('all'). */
const METHOD=methodologyRow({subject_types:['security']});
/** n settled judgments, ids uuidOf(1..n), as_of 2026-01-02.., registered the same day, settled before the cutoff. */
const cohort=(n:number,extra:Partial<Parameters<typeof envelope>[0]>={})=>Array.from({length:n},(_,i)=>envelope({judgment:{n:i+1},settlement:{settlement_id:uuidOf(700000+i+1),outcome:i%3===0?'miss':'hit'},...extra}));
function deps(db:JudgmentsDb,store:CohortStore,over:Partial<CalibrateDeps>={}):CalibrateDeps{
 let u=0;
 return {db,tables:(db as JudgmentsDb&{tables:TableClient}).tables,store,methods:[{id:METHOD.methodology_id,version:'v1'}],
  codeVersion:'abcdef1',deadline:null,uuid:()=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(++u).padStart(12,'0')}`,pageSize:3,...over};
}
const ctxOf=(db:JudgmentsDb,store:CohortStore,prefix:string):StepContext=>{let u=0;return {db,tables:(db as JudgmentsDb&{tables:TableClient}).tables,store,codeVersion:'abcdef1',batchId:uuidOf(424242),uuid:()=>`${prefix}-aaaa-4aaa-8aaa-${String(++u).padStart(12,'0')}`,pageSize:3};};
const unitAll=unitsOf(METHOD)[0];
const stateOf=(f:ReturnType<typeof fakeDb>)=>f.jobs.get(unitAll.job)?.state as unknown as UnitState|undefined;

describe('units, windows, fingerprints',()=>{
 it('one unit per scope: all, each declared market, each public subject type; storage-safe unit paths',()=>{
  const units=unitsOf(methodologyRow({markets:['A','US'],subject_types:['issuer','security','issuer']}));
  expect(units.map(u=>u.scope)).toEqual([{scope_type:'all',scope_key:''},{scope_type:'market',scope_key:'A'},{scope_type:'market',scope_key:'US'},{scope_type:'subject_type',scope_key:'issuer'}]);
  expect(units.map(u=>u.job)).toEqual(['calibrate:synthetic_fact_metric@v1:all:','calibrate:synthetic_fact_metric@v1:market:A','calibrate:synthetic_fact_metric@v1:market:US','calibrate:synthetic_fact_metric@v1:subject_type:issuer']);
  expect(units.map(unitPath)).toEqual(['synthetic_fact_metric@v1.all','synthetic_fact_metric@v1.market.A','synthetic_fact_metric@v1.market.US','synthetic_fact_metric@v1.subject_type.issuer']);
 });
 it('scope filter: market matches price_return params only; subject_type matches the subject',()=>{
  const e={judgment_id:uuidOf(1),subject_type:'issuer',subject_key:'k',market:'A' as const,as_of:'2026-01-01',window_end:'2026-01-10',retrospective:false,lifecycle:'settled' as const,settlement_id:null,forecast:{kind:'probability' as const,p:0.5},y:1};
  expect(inScope(e,{scope_type:'all',scope_key:''})).toBe(true);
  expect(inScope(e,{scope_type:'market',scope_key:'A'})).toBe(true);
  expect(inScope({...e,market:null},{scope_type:'market',scope_key:'A'})).toBe(false);
  expect(inScope(e,{scope_type:'subject_type',scope_key:'industry'})).toBe(false);
 });
 it('window = [cutoff date − window_years, cutoff date]; Feb 29 → Feb 28',()=>{
  expect(windowOf('2026-11-09T04:00:00.000Z',3)).toEqual({from:'2023-11-09',to:'2026-11-09'});
  expect(windowOf('2028-02-29T04:00:00.000Z',3)).toEqual({from:'2025-02-28',to:'2028-02-29'});
 });
 it('fingerprint changes with validity_revision alone (R05: an out-of-window withdrawal changes the fingerprint, not the cohort)',()=>{
  const x={methodology_id:'m',methodology_version:'v1',scope_type:'all',scope_key:'',window_from:'2023-11-09',window_to:'2026-11-09',threshold_n:100,ece_max:0.1,algorithm_version:'judgments-calibration/1',cohort_sha256:'0'.repeat(64),validity_revision:1,
   query_bounds:{window_from:'2023-11-09',window_to:'2026-11-09',registered_at_lte:'2026-11-09T04:00:00.000Z',settled_at_lte:'2026-11-09T04:00:00.000Z',frozen_at:'2026-11-09T04:00:00.000Z',n:0}};
  expect(fingerprintOf(x)).toBe(fingerprintOf({...x}));
  expect(fingerprintOf({...x,validity_revision:2})).not.toBe(fingerprintOf(x));
  expect(fingerprintOf({...x,query_bounds:{...x.query_bounds,settled_at_lte:'2026-11-09T04:00:01.000Z'}})).not.toBe(fingerprintOf(x));
  expect(PAGE_SIZE).toBe(500);
 });
});

describe('runCalibrate',()=>{
 it('pages the cohort with the fixed cutoff into per-attempt objects, finalizes, inserts, clears the unit and removes the pages',async()=>{
  const f=fakeDb([METHOD],cohort(7));const store=memoryCohortStore();
  const r=await runCalibrate(deps(f.db,store));
  expect(r.status).toBe('success');
  expect(r.counts).toMatchObject({fetched:1,inserted:1,duplicates:0,failed:0,deferred:0});
  expect(r.units).toEqual([expect.objectContaining({job:unitAll.job,outcome:'inserted',pages:3})]);
  expect(f.calibrations).toHaveLength(1);
  const row=f.calibrations[0];
  expect(row).toMatchObject({methodology_id:'synthetic_fact_metric',methodology_version:'v1',scope_type:'all',scope_key:'',n_registered:7,n_settled:7,validity_revision:1,threshold_n:3,ece_max:0.1,kind:'probability',algorithm_version:'judgments-calibration/1',code_version:'abcdef1',batch_id:r.batchId});
  expect(Date.parse(row.valid_until)-Date.parse(row.computed_at)).toBe(14*86_400_000);
  expect(row.query_bounds.registered_at_lte).toBe(row.query_bounds.settled_at_lte);
  expect(row.query_bounds).toMatchObject({frozen_at:row.query_bounds.registered_at_lte,n:7});
  expect(f.frozen.size).toBe(0);                                                             // the generation's members are cleared with the unit
  expect(row.cohort_path).toBe(`cohorts/${row.cohort_sha256}.json`);
  const bytes=await store.get(row.cohort_path);
  expect(sha256(bytes!)).toBe(row.cohort_sha256);
  const file=JSON.parse(dec.decode(bytes!));
  expect(file.entries.map((e:{judgment_id:string})=>e.judgment_id)).toEqual(Array.from({length:7},(_,i)=>uuidOf(i+1)));
  expect(file.entries[0]).toMatchObject({group:`issuer:${envelope().judgment.subject_key}`,sample:true,selected_for_independent:true});
  expect(stateOf(f)).toEqual({});
  expect([...store.objects.keys()].filter(k=>k.startsWith('partial/'))).toEqual([]);
 });
 it('fixes the cutoff at start: a judgment registered or settled after it is not in the cohort (R03)',async()=>{
  const late=envelope({judgment:{n:4,registered_at:'2027-01-01T00:00:00.000Z'}});
  const lateSettle=envelope({judgment:{n:5},settlement:{settled_at:'2027-01-01T00:00:00.000Z'}});
  const f=fakeDb([METHOD],[...cohort(3),late,lateSettle]);
  await runCalibrate(deps(f.db,memoryCohortStore()));
  expect(f.calibrations[0]).toMatchObject({n_registered:4,n_settled:3});
 });
 it('the cohort is the frozen member set: a registration that becomes visible after the freeze (earlier registered_at, later commit) never enters, even behind the cursor (P1-10)',async()=>{
  const envs=cohort(4);const f=fakeDb([METHOD],envs);const store=memoryCohortStore();
  const ctx=ctxOf(f.db,store,'abababab');
  expect((await stepUnit(ctx,unitAll)).kind).toBe('started');
  expect(stateOf(f)!.query_bounds).toMatchObject({n:4});
  envs.push(envelope({judgment:{n:0,registered_at:'2026-01-01T00:00:00.000Z'}}));             // uuidOf(0) sorts before every member
  await runCalibrate(deps(f.db,store));
  expect(f.calibrations[0]).toMatchObject({n_registered:4});
 });
 it('a short page is not exhaustion: paging stops only on an empty page, so a server cap below pageSize never truncates the cohort (P1-02)',async()=>{
  const f=fakeDb([METHOD],cohort(7));
  const capped=new Proxy(f.db,{get:(t,p)=>p==='cohortMembers'?async(g:string,a:string|null,limit:number)=>(await t.cohortMembers(g,a,limit)).slice(0,2):(t as unknown as Record<string|symbol,unknown>)[p]}) as JudgmentsDb;
  const r=await runCalibrate(deps(capped,memoryCohortStore(),{pageSize:3}));
  expect(r.units[0]).toMatchObject({outcome:'inserted',pages:4});                             // 2 + 2 + 2 + 1, then an empty page
  expect(f.calibrations[0].n_registered).toBe(7);
 });
 it('losing the start race drops the loser\'s frozen generation (P1-10)',async()=>{
  const f=fakeDb([METHOD],cohort(2));const store=memoryCohortStore();
  const results=await Promise.all([stepUnit(ctxOf(f.db,store,'aaaaaaaa'),unitAll),stepUnit(ctxOf(f.db,store,'bbbbbbbb'),unitAll)]);
  expect(results.map(r=>r.kind).sort()).toEqual(['conflict','started']);
  expect([...f.frozen.keys()]).toEqual([stateOf(f)!.generation]);
 });
 it('stops paging when the budget is gone and resumes the same generation, cutoff and bounds next run',async()=>{
  const f=fakeDb([METHOD],cohort(9));const store=memoryCohortStore();
  let now=T0;const deadline=new Date(T0+31_500);
  f.hooks.onCohort=()=>{now+=1000;};
  const first=await runCalibrate(deps(f.db,store,{deadline,now:()=>new Date(now)}));
  expect(first.status).toBe('success');
  expect(first.units[0].outcome).toBe('paused');
  expect(first.counts).toMatchObject({fetched:1,deferred:1,inserted:0});
  expect(first.errors).toContainEqual({code:'deadline_hit',key:unitAll.job});
  const mid=stateOf(f)!;
  expect(mid.manifest.length).toBe(2);
  const second=await runCalibrate(deps(f.db,store,{deadline:null}));
  expect(second.units[0]).toMatchObject({outcome:'inserted',pages:1});
  expect(f.calibrations[0].query_bounds).toEqual(mid.query_bounds);                          // same generation, same frozen bounds
  expect(f.calibrations[0].n_registered).toBe(9);
 });
 it('round cursor: several units whose work spans several invocations each finish once before any unit starts again (P2-02)',async()=>{
  const m=methodologyRow({markets:['A']});                                                     // units: all, market A, subject_type issuer
  const f=fakeDb([m],cohort(3));const store=memoryCohortStore();
  // each cohortMembers call costs 10 s; a run has 25 s above the 30 s reserve → roughly one and a half units per run
  const run=async()=>{let now=T0;f.hooks.onCohort=()=>{now+=10_000;};return runCalibrate(deps(f.db,store,{methods:[{id:m.methodology_id,version:'v1'}],deadline:new Date(T0+55_000),now:()=>new Date(now)}));};
  const inserted=(r:Awaited<ReturnType<typeof runCalibrate>>)=>r.units.filter(u=>u.outcome==='inserted').map(u=>u.scope.scope_type);
  const r1=await run();expect(inserted(r1)).toEqual(['all']);
  const r2=await run();expect(inserted(r2)).toEqual(['market']);                               // the paused unit first, not a new 'all' generation
  const r3=await run();expect(inserted(r3)).toEqual(['subject_type']);
  expect(f.calibrations.map(c=>c.scope_type)).toEqual(['all','market','subject_type']);         // nobody ran twice before everybody ran once
  expect(f.round()).toEqual({round:1,outcomes:Object.fromEntries(unitsOf(m).map(u=>[u.job,'completed']))});
  const r4=await run();expect(r4.units[0]).toMatchObject({scope:{scope_type:'all'}});          // round complete → the next round starts at the head
  expect(f.round()!.round).toBe(2);
 });
 it('a unit that fails every run after spending the budget is excluded until the round advances; a later unit still completes (Q1-04)',async()=>{
  const m=methodologyRow({markets:['A'],subject_types:['security']});                          // units: all, market A
  const f=fakeDb([m],cohort(3));const inner=memoryCohortStore();
  let now=T0,failing=0;
  // every page upload of the 'all' unit burns 30 s of the 55 s budget and then fails (its generation stays open)
  const store:CohortStore={put:async(path,bytes,o)=>{if(path.includes('.all/')){failing++;now+=30_000;throw new Error('storage down');}return inner.put(path,bytes,o);},get:p=>inner.get(p),remove:p=>inner.remove(p)};
  // Plan audit R3-02: ONE uuid sequence for this fixture across all runs (deps() would restart its own counter each run, so
  // run 2's market unit would draw the generation uuid the failed 'all' unit still holds → generation_reused).
  let u=0;const uuid=()=>`cccccccc-aaaa-4aaa-8aaa-${String(++u).padStart(12,'0')}`;
  const run=()=>{now=T0;return runCalibrate(deps(f.db,store,{methods:[{id:m.methodology_id,version:'v1'}],deadline:new Date(T0+55_000),now:()=>new Date(now),uuid}));};
  const [all,market]=unitsOf(m).map(u=>u.job);
  const r1=await run();
  expect(r1.units.map(u=>[u.scope.scope_type,u.outcome])).toEqual([['all','failed'],['market','paused']]);   // the failure spent the budget
  expect(f.round()).toEqual({round:1,outcomes:{[all]:'failed'}});
  expect(f.jobs.get(all)?.state).toMatchObject({generation:expect.any(String)});                // still holds a generation
  const r2=await run();
  expect(r2.units.map(u=>[u.scope.scope_type,u.outcome])).toEqual([['market','inserted']]);     // the failed unit is not retried this round
  expect(failing).toBe(1);
  expect(f.round()).toEqual({round:1,outcomes:{[all]:'failed',[market]:'completed'}});
  const r3=await run();                                                                          // round complete → round 2 resumes the failed unit first
  expect(r3.units[0]).toMatchObject({scope:{scope_type:'all'},outcome:'failed'});
  expect(failing).toBe(2);
  expect(f.round()).toEqual({round:2,outcomes:{[all]:'failed'}});
  const r4=await run();
  expect(r4.units.map(u=>[u.scope.scope_type,u.outcome])).toEqual([['market','inserted']]);     // every round still reaches the later unit
 });
 it('an insert whose clear failed stays in_progress for the round and is recovered first next run (Q1-04)',async()=>{
  const f=fakeDb([METHOD],cohort(4));const store=memoryCohortStore();
  f.failNextClear();
  const first=await runCalibrate(deps(f.db,store));
  expect(first.counts.inserted).toBe(1);
  expect(f.round()).toEqual({round:1,outcomes:{[unitAll.job]:'in_progress'}});
  const second=await runCalibrate(deps(f.db,store));
  expect(second.counts.duplicates).toBe(1);
  expect(f.round()).toEqual({round:1,outcomes:{[unitAll.job]:'completed'}});
 });
 it('a reused generation uuid is never refrozen nor cleared: already_frozen fails the unit (Q1-05)',async()=>{
  const f=fakeDb([METHOD],cohort(2));const store=memoryCohortStore();
  const g='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await f.db.freezeCalibrationCohort(g,METHOD.methodology_id,'v1',{from:'2020-01-01',to:'2030-01-01'});
  const r=await runCalibrate(deps(f.db,store,{uuid:()=>g}));
  expect(r.units[0]).toMatchObject({outcome:'failed',code:'generation_reused'});
  expect(f.frozen.get(g)).toHaveLength(2);                                                       // the other owner's set is intact
 });
 it('a failed clear after insert is retried: the next run sees duplicate and clears (R05)',async()=>{
  const f=fakeDb([METHOD],cohort(4));const store=memoryCohortStore();
  f.failNextClear();
  const first=await runCalibrate(deps(f.db,store));
  expect(first.counts.inserted).toBe(1);
  expect(first.errors).toContainEqual({code:'job_state_conflict',key:unitAll.job});
  expect(stateOf(f)!.done).toBe(true);
  const second=await runCalibrate(deps(f.db,store));
  expect(second.counts).toMatchObject({inserted:0,duplicates:1});
  expect(second.units[0].calibration_id).toBe(first.units[0].calibration_id);
  expect(stateOf(f)).toEqual({});
  expect(f.calibrations).toHaveLength(1);
 });
 it('stale_revision: a withdrawal during the run discards the report, clears, and recalculates with a new generation (acceptance example 10)',async()=>{
  const f=fakeDb([METHOD],cohort(4));const store=memoryCohortStore();
  f.hooks.onCohort=call=>{if(call===1)f.bump();};
  const r=await runCalibrate(deps(f.db,store));
  expect(r.errors).toContainEqual({code:'stale_revision',key:unitAll.job});
  expect(r.units[0].outcome).toBe('inserted');
  expect(f.calibrations).toHaveLength(1);
  expect(f.calibrations[0].validity_revision).toBe(2);
 });
 it('stale twice in one run → deferred stale_revision, state cleared for the next run',async()=>{
  const f=fakeDb([METHOD],cohort(2));
  f.hooks.onCohort=()=>f.bump();
  const r=await runCalibrate(deps(f.db,memoryCohortStore()));
  expect(r.units[0].outcome).toBe('stale_revision');
  expect(r.counts).toMatchObject({deferred:1,inserted:0});
  expect(r.status).toBe('success');
  expect(f.calibrations).toHaveLength(0);
  expect(stateOf(f)).toEqual({});
 });
 it('crash between upload and CAS leaves an orphan no manifest names; the retry re-fetches the page under a new attempt id (S01)',async()=>{
  const f=fakeDb([METHOD],cohort(5));const store=memoryCohortStore();
  f.crashNextPageCas();
  const first=await runCalibrate(deps(f.db,store));
  expect(first.units[0].outcome).toBe('failed');
  expect(first.status).toBe('failed');
  const orphans=[...store.objects.keys()].filter(k=>k.startsWith('partial/'));
  expect(orphans).toHaveLength(1);
  store.objects.set(orphans[0],new TextEncoder().encode('{"tampered":true}'));   // proves the orphan is never read
  const second=await runCalibrate(deps(f.db,store,{uuid:(()=>{let u=100;return ()=>`bbbbbbbb-bbbb-4bbb-8bbb-${String(++u).padStart(12,'0')}`;})()}));
  expect(second.units[0].outcome).toBe('inserted');
  expect(f.calibrations[0].n_registered).toBe(5);
  expect(store.objects.has(orphans[0])).toBe(true);   // left for the cleanup script; never consumed
 });
 it('a corrupted manifest object fails the unit, clears it, and the next run starts over',async()=>{
  const f=fakeDb([METHOD],cohort(3));const store=memoryCohortStore();
  const ctx=ctxOf(f.db,store,'cccccccc');
  expect((await stepUnit(ctx,unitAll)).kind).toBe('started');
  const paged=await stepUnit(ctx,unitAll);
  expect(paged.kind).toBe('paged');
  store.objects.set((paged as {path:string}).path,new TextEncoder().encode('x'));
  expect((await stepUnit(ctx,unitAll)).kind).toBe('paging_done');
  const r=await runCalibrate(deps(f.db,store));
  expect(r.units[0]).toMatchObject({outcome:'failed',code:'cohort_object_invalid'});
  expect(stateOf(f)).toEqual({});
  expect((await runCalibrate(deps(f.db,store))).units[0].outcome).toBe('inserted');
 });
 it('skips a registry method that has no synced row',async()=>{
  const f=fakeDb([METHOD],[]);
  const r=await runCalibrate(deps(f.db,memoryCohortStore(),{methods:[{id:'missing_method',version:'v1'},{id:METHOD.methodology_id,version:'v1'}]}));
  expect(r.units.map(u=>u.outcome)).toEqual(['skipped','inserted']);
  expect(f.calibrations[0]).toMatchObject({n_registered:0,state:'insufficient'});
 });
 it('writes one row per scope with the scope-filtered cohort',async()=>{
  const m=methodologyRow({markets:['A']});
  const envs=cohort(3).map((e,i)=>i===0?{...e,judgment:{...e.judgment,condition:{resolver:'price_return' as const,params:{ticker:'600519',market:'A' as const,adjustment:'qfq' as const,source:'eastmoney' as const,base_date:e.judgment.as_of},predicate:{op:'>' as const,rhs:0},text:{zh:'涨',en:'up'}}}}:e);
  const f=fakeDb([m],envs);
  await runCalibrate(deps(f.db,memoryCohortStore()));
  expect(f.calibrations.map(c=>[c.scope_type,c.scope_key,c.n_registered])).toEqual([['all','',3],['market','A',1],['subject_type','issuer',3]]);
 });
});

describe('stepUnit concurrency',()=>{
 it('two workers on one page: only the CAS winner\'s object enters the manifest; the loser deletes its own object (R02)',async()=>{
  const f=fakeDb([METHOD],cohort(5));const shared=memoryCohortStore();
  let reached!:()=>void;const atPut=new Promise<void>(r=>{reached=r;});
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const gated:CohortStore={...shared,async put(path,bytes,o){const r=await shared.put(path,bytes,o);reached();await gate;return r;},get:shared.get,remove:shared.remove};
  const a=ctxOf(f.db,gated,'aaaaaaaa'),b=ctxOf(f.db,shared,'bbbbbbbb');
  expect((await stepUnit(b,unitAll)).kind).toBe('started');
  const pa=stepUnit(a,unitAll);
  await atPut;
  const rb=await stepUnit(b,unitAll);
  expect(rb.kind).toBe('paged');
  release();
  const ra=await pa;
  expect(ra.kind).toBe('page_lost');
  const st=stateOf(f)!;
  expect(st.manifest.map(m=>m.path)).toEqual([(rb as {path:string}).path]);
  expect(shared.objects.has((ra as {path:string}).path)).toBe(false);
  expect(st.after).toBe(uuidOf(3));
 });
 it('rejects a second writer on start: only one generation wins',async()=>{
  const f=fakeDb([METHOD],cohort(1));const store=memoryCohortStore();
  const results=await Promise.all([stepUnit(ctxOf(f.db,store,'aaaaaaaa'),unitAll),stepUnit(ctxOf(f.db,store,'bbbbbbbb'),unitAll)]);
  expect(results.map(r=>r.kind).sort()).toEqual(['conflict','started']);
  expect(f.frozen.size).toBe(1);
 });
});

describe('previewCalibrate',()=>{
 it('reports unit states and revisions without writing',async()=>{
  const f=fakeDb([METHOD],cohort(4));const store=memoryCohortStore();
  const ctx=ctxOf(f.db,store,'dddddddd');
  await stepUnit(ctx,unitAll);await stepUnit(ctx,unitAll);
  f.bump();
  const before=JSON.stringify([...f.jobs]);
  const p=await previewCalibrate({db:f.db,methods:[{id:METHOD.methodology_id,version:'v1'}]});
  expect(p[0]).toMatchObject({job:unitAll.job,state:'paging',pages:1,expected_revision:1,current_revision:2,stale:true});
  expect(p).toHaveLength(1);
  expect(JSON.stringify([...f.jobs])).toBe(before);
  expect(f.calibrations).toHaveLength(0);
 });
 it('CalibrateError carries a code',()=>{expect(new CalibrateError('cohort_object_invalid','x').code).toBe('cohort_object_invalid');});
});

// Additional failure boundaries: corrupted persisted pages must reset rather than poison every retry.
describe('calibration failure boundaries',()=>{
 it.each(['json','job','duplicate','cursor'])('rejects a hash-matching but invalid %s page and clears its generation',async fault=>{
  const f=fakeDb([METHOD],cohort(3)),store=memoryCohortStore(),ctx=ctxOf(f.db,store,'edededed');
  await stepUnit(ctx,unitAll);await stepUnit(ctx,unitAll);await stepUnit(ctx,unitAll);
  const st=stateOf(f)!,page=st.manifest[0];
  const body=JSON.parse(dec.decode(store.objects.get(page.path)!));
  if(fault==='job')body.job='calibrate:other_method@v1:all:';
  if(fault==='duplicate')body.entries[1]=body.entries[0];
  if(fault==='cursor')body.entries[0].judgment_id=uuidOf(999);
  const bytes=new TextEncoder().encode(fault==='json'?'not json':JSON.stringify(body));
  store.objects.set(page.path,bytes);page.sha256=sha256(bytes);
  const r=await runCalibrate(deps(f.db,store));
  expect(r.units[0]).toMatchObject({outcome:'failed',code:'cohort_object_invalid'});
  expect(stateOf(f)).toEqual({});expect(f.frozen.size).toBe(0);expect(f.calibrations).toHaveLength(0);
 });
 it('records a planning failure as a failed batch and unsuccessful freshness attempt',async()=>{
  const f=fakeDb([METHOD],[]),d=deps(f.db,memoryCohortStore());
  d.db={...f.db,methodology:async()=>{throw new Error('database down');}};
  await expect(runCalibrate(d)).rejects.toThrow('database down');
  expect(await d.tables.select('ingest_batches',{})).toEqual([expect.objectContaining({status:'failed',errors:[expect.objectContaining({code:'calibrate_failed'})]})]);
  expect(await d.tables.select('dq_freshness',{})).toEqual([expect.objectContaining({last_ok_at:null,consecutive_errors:1})]);
 });
 it('preserves February 29 when the target year is also a leap year',()=>{
  expect(windowOf('2028-02-29T00:00:00.000Z',4)).toEqual({from:'2024-02-29',to:'2028-02-29'});
 });
});


describe('T16 review cleanup',()=>{
 it.each(['stale','invalid_state','cohort_object_invalid'])('removes owned manifest partials after %s, preserving unlisted objects',async reason=>{
  const f=fakeDb([METHOD],cohort(3)),store=memoryCohortStore(),ctx=ctxOf(f.db,store,'abababab');
  await stepUnit(ctx,unitAll);await stepUnit(ctx,unitAll);await stepUnit(ctx,unitAll);
  const st=stateOf(f)!,path=st.manifest[0].path;
  const orphan=path.replace('start.',''+uuidOf(999)+'.');store.objects.set(orphan,new Uint8Array());
  const finalPath=`cohorts/${'a'.repeat(64)}.json`;store.objects.set(finalPath,new Uint8Array());
  if(reason==='stale')f.bump();
  else if(reason==='invalid_state')delete f.jobs.get(unitAll.job)!.state.cutoff;
  else store.objects.set(path,new Uint8Array());
  const r=await stepUnit(ctx,unitAll);
  expect(r).toMatchObject({kind:reason==='stale'?'stale':'reset',cleared:true});
  expect(store.objects.has(path)).toBe(false);
  expect(f.frozen.has(st.generation)).toBe(false);
  expect(store.objects.has(orphan)).toBe(true);expect(store.objects.has(finalPath)).toBe(true);
 });
 it.each(['other_unit','cohort_path'])('preserves a partial referenced by %s on reset',async owner=>{
  const f=fakeDb([METHOD],cohort(3)),store=memoryCohortStore(),ctx=ctxOf(f.db,store,'abababab');
  await stepUnit(ctx,unitAll);await stepUnit(ctx,unitAll);
  const st=stateOf(f)!,path=st.manifest[0].path;
  if(owner==='other_unit')f.jobs.set('calibrate:retired_method@v9:market:US',{state:{generation:uuidOf(88),manifest:[{path}]},updated_at:'old'});
  else f.calibrations.push({cohort_path:path} as CalibrationRow);
  delete f.jobs.get(unitAll.job)!.state.cutoff;
  await stepUnit(ctx,unitAll);
  expect(store.objects.has(path)).toBe(true);
 });
 it.each(['shared','not_uuid','missing'])('invalid state does not clear unowned %s generation and records info',async fault=>{
  const f=fakeDb([METHOD],cohort(3)),store=memoryCohortStore(),ctx=ctxOf(f.db,store,'abababab');
  await stepUnit(ctx,unitAll);await stepUnit(ctx,unitAll);
  const st=stateOf(f)!,generation=st.generation,path=st.manifest[0].path;
  delete f.jobs.get(unitAll.job)!.state.cutoff;
  if(fault==='shared')f.jobs.set('calibrate:retired_method@v9:all:',{state:{generation},updated_at:'old'});
  if(fault==='not_uuid'){
   f.jobs.get(unitAll.job)!.state.generation='not-a-uuid';f.frozen.set('not-a-uuid',cohort(1));
  }
  if(fault==='missing')delete f.jobs.get(unitAll.job)!.state.generation;
  let steps=0;const r=await runUnit(ctx,unitAll,()=>steps++>0);
  expect(r.infos).toContainEqual(expect.objectContaining({code:'job_state_conflict',key:unitAll.job,message:expect.stringContaining('generation_cleanup_skipped')}));
  expect(f.frozen.has(generation)).toBe(true);expect(store.objects.has(path)).toBe(true);
  if(fault==='not_uuid')expect(f.frozen.has('not-a-uuid')).toBe(true);
  expect(stateOf(f)).toEqual({});
 });
 it('a lost reset CAS keeps the generation and partials',async()=>{
  const f=fakeDb([METHOD],cohort(3)),store=memoryCohortStore(),ctx=ctxOf(f.db,store,'abababab');
  await stepUnit(ctx,unitAll);await stepUnit(ctx,unitAll);
  const st=stateOf(f)!,path=st.manifest[0].path;delete f.jobs.get(unitAll.job)!.state.cutoff;f.failNextClear();
  expect(await stepUnit(ctx,unitAll)).toMatchObject({kind:'reset',cleared:false});
  expect(f.frozen.has(st.generation)).toBe(true);expect(store.objects.has(path)).toBe(true);
 });
});
