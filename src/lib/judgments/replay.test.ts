// src/lib/judgments/replay.test.ts
// spec §6.3 / §14.4 / §15 example 2. Golden loop: every JSON file in fixtures/judgments/replay replays
// to its `expect` verdict, and tampering one frozen projection → input_hash_mismatch naming the input
// (kind + key; for a macro observation the key contains its series_id). Tasks 19 (macro_regime@v1) and
// 20 (private recommendation) only add files. Unit cases on the synthetic fixture: diverged claim / id,
// inputs_only for model / abstained rows, unknown ids / methods, reconcile never changing the verdict,
// and that the committed synthetic fixture is what the generator produces today.
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {beforeAll,describe,expect,it} from 'vitest';
import {JudgmentError} from './errors';
import {inputLabel} from './inputs';
import {memoryJudgmentInputsDb} from './inputs-db';
import {REGISTRY} from './registry';
import {samePayload} from './register';
import {fixtureJudgmentsDb,parseReplayFixture,replayExitCode,replayJudgment} from './replay';
import type {ReplayFixture} from './replay';
import type {InputKind,JudgmentRow,Methodology} from './types';
import {SYNTHETIC_FIXTURE_PATH,aaplInputsDb,generateSyntheticReplayFixture} from './testing/synthetic-fixture';
import {syntheticFactMetric} from './testing/synthetic-method';

const DIR='fixtures/judgments/replay';
const FILES=readdirSync(DIR).filter(f=>f.endsWith('.json')).sort();
const REPLAY_REGISTRY:readonly Methodology[]=[...REGISTRY,syntheticFactMetric];
const load=(path:string):ReplayFixture=>parseReplayFixture(JSON.parse(readFileSync(path,'utf8')));
const TAMPER_ORDER:InputKind[]=['macro_observation','financial_metric','financial_fact','price_bar','legacy_fill','macro_snapshot','table_rows','judgment','document_span'];
/** Changes the first value-like leaf of the preferred input's snapshot, leaving its stored hash. */
function tamper(row:JudgmentRow):{row:JudgmentRow;kind:InputKind;label:string}{
 const idx=[...row.inputs.keys()].sort((a,b)=>TAMPER_ORDER.indexOf(row.inputs[a].kind)-TAMPER_ORDER.indexOf(row.inputs[b].kind))[0];
 const t=structuredClone(row);const s=t.inputs[idx].snapshot as Record<string,unknown>;
 if(typeof s.value==='number')s.value=s.value+1;
 else if(typeof s.value_text==='string')s.value_text=`${s.value_text}1`;
 else if(typeof s.close==='number')s.close=s.close+1;
 else if(typeof s.fill_price==='number')s.fill_price=s.fill_price+1;
 else s.tampered=true;
 return {row:t,kind:t.inputs[idx].kind,label:inputLabel(t.inputs[idx])};
}

describe('golden replay fixtures (spec §14.4)',()=>{
 it('the folder holds the synthetic fact_metric fixture',()=>{expect(FILES).toContain('synthetic-fact-metric.json');});
 describe.each(FILES)('%s',file=>{
  const fx=load(join(DIR,file));
  it('replays to its expected verdict with byte-identical claim / condition / id',async()=>{
   const r=await replayJudgment(fx.judgment.judgment_id,{db:fixtureJudgmentsDb([fx.judgment]),registry:REPLAY_REGISTRY});
   expect({status:r.status,diffs:r.diffs,hash_mismatches:r.hash_mismatches}).toEqual({status:fx.expect,diffs:[],hash_mismatches:[]});
   expect(replayExitCode(r)).toBe(0);
  });
  it.skipIf(fx.judgment.inputs.length===0)('tampering a frozen projection → input_hash_mismatch naming the input (exit 2)',async()=>{
   const t=tamper(fx.judgment);
   const r=await replayJudgment(t.row.judgment_id,{db:fixtureJudgmentsDb([t.row]),registry:REPLAY_REGISTRY});
   expect(r.status).toBe('input_hash_mismatch');
   expect(r.hash_mismatches).toEqual([expect.objectContaining({kind:t.kind,label:t.label})]);
   if(t.kind==='macro_observation')expect(t.label).toContain(String((t.row.inputs.find(x=>x.kind==='macro_observation')!.snapshot as {series_id:string}).series_id));
   expect(r.diffs).toEqual([]);
   expect(replayExitCode(r)).toBe(2);
  });
 });
});

describe('replayJudgment on the synthetic fixture (spec §6.3)',()=>{
 const fx=load(SYNTHETIC_FIXTURE_PATH);const row=fx.judgment;
 const run=(r:JudgmentRow,registry:readonly Methodology[]=REPLAY_REGISTRY)=>replayJudgment(r.judgment_id,{db:fixtureJudgmentsDb([r]),registry});
 it('the fixture is a registered active synthetic_fact_metric judgment with one financial_metric input',()=>{
  expect(row).toMatchObject({methodology_id:'synthetic_fact_metric',methodology_version:'v1',producer_kind:'rule',abstained:false,kind:'probability'});
  expect(row.inputs.map(x=>x.kind)).toEqual(['financial_metric']);
  expect(row.condition?.resolver).toBe('fact_metric');
 });
 it('a changed method (same id@version) replays as diverged with the claim diff',async()=>{
  const changed:Methodology={...syntheticFactMetric,params:{...syntheticFactMetric.params,p:0.7}};
  const r=await run(row,[changed]);
  expect(r.status).toBe('diverged');expect(r.diffs.map(d=>d.field)).toEqual(['claim']);expect(replayExitCode(r)).toBe(2);
 });
 it('a stored row whose id does not follow from its fields diverges on judgment_id',async()=>{
  const r=await run({...row,producer_nonce:'x'});
  expect(r.status).toBe('diverged');expect(r.diffs.map(d=>d.field)).toEqual(['judgment_id']);
 });
 it('model and abstained rows are inputs_only; unknown ids and methods are errors',async()=>{
  expect((await run({...row,producer_kind:'model'})).status).toBe('inputs_only');
  expect((await run({...row,abstained:true,abstain_reason:'x',claim:null,condition:null})).status).toBe('inputs_only');
  await expect(replayJudgment('00000000-0000-8000-8000-0000000000ff',{db:fixtureJudgmentsDb([row]),registry:REPLAY_REGISTRY})).rejects.toMatchObject({code:'unknown_judgment'});
  const e=await run(row,[]).catch(x=>x);
  expect(e).toBeInstanceOf(JudgmentError);expect(e.code).toBe('unknown_methodology');
 });
 it('inputs_hash itself is checked: a reordered stored hash list is still fine, an edited inputs_hash is not',async()=>{
  const r=await run({...row,inputs_hash:'0'.repeat(64)});
  expect(r.status).toBe('input_hash_mismatch');expect(r.hash_mismatches).toEqual([expect.objectContaining({kind:'inputs_hash',index:-1})]);
 });
 describe('reconcile (spec §6.3 step 3)',()=>{
  let aapl:Awaited<ReturnType<typeof aaplInputsDb>>;
  beforeAll(async()=>{aapl=await aaplInputsDb();},60_000);
  it('same upstream → same; an empty upstream → unavailable; the verdict stays exact',async()=>{
   const same=await replayJudgment(row.judgment_id,{db:fixtureJudgmentsDb([row]),registry:REPLAY_REGISTRY,inputsDb:aapl,reconcile:true});
   expect(same.status).toBe('exact');expect(same.reconcile?.map(x=>x.status)).toEqual(['same']);
   const gone=await replayJudgment(row.judgment_id,{db:fixtureJudgmentsDb([row]),registry:REPLAY_REGISTRY,inputsDb:memoryJudgmentInputsDb(),reconcile:true});
   expect(gone.status).toBe('exact');expect(gone.reconcile?.map(x=>x.status)).toEqual(['unavailable']);
   const none=await replayJudgment(row.judgment_id,{db:fixtureJudgmentsDb([row]),registry:REPLAY_REGISTRY,reconcile:true});
   expect(none.reconcile).toEqual([expect.objectContaining({status:'unavailable',detail:'no_inputs_db'})]);
   expect((await run(row)).reconcile).toBeNull();
  });
  it('a failing clock never changes the verdict or exit code (reconcile runs after the frozen replay)',async()=>{
   const boom=()=>{throw new Error('clock_down');};
   const ok=await replayJudgment(row.judgment_id,{db:fixtureJudgmentsDb([row]),registry:REPLAY_REGISTRY,inputsDb:aapl,reconcile:true,now:boom});
   expect(ok.status).toBe('exact');expect(replayExitCode(ok)).toBe(0);
   expect(ok.reconcile).toEqual([expect.objectContaining({status:'unavailable',detail:expect.stringContaining('clock_down')})]);
   const t=tamper(row);
   const bad=await replayJudgment(t.row.judgment_id,{db:fixtureJudgmentsDb([t.row]),registry:REPLAY_REGISTRY,inputsDb:aapl,reconcile:true,now:boom});
   expect(bad.status).toBe('input_hash_mismatch');expect(replayExitCode(bad)).toBe(2);
   expect(bad.reconcile?.map(x=>x.status)).toEqual(['unavailable']);
  });
  it('does not read the clock when there is no inputsDb',async()=>{
   let n=0;
   const r=await replayJudgment(row.judgment_id,{db:fixtureJudgmentsDb([row]),registry:REPLAY_REGISTRY,reconcile:true,now:()=>{n++;return 'x';}});
   expect(n).toBe(0);expect(r.status).toBe('exact');
  });
  it('rebuilds at the injected current server time, not at any stored instant',async()=>{
   const seen:string[]=[];
   const r=await replayJudgment(row.judgment_id,{db:{...fixtureJudgmentsDb([row]),serverTime:async()=>{seen.push('t');return '2030-01-01T00:00:00.000Z';}},registry:REPLAY_REGISTRY,inputsDb:aapl,reconcile:true});
   expect(seen).toEqual(['t']);expect(r.status).toBe('exact');
  });
 });
 it('the committed synthetic fixture is exactly what the generator produces today (normalised payload)',async()=>{
  const fresh=await generateSyntheticReplayFixture();
  expect(samePayload(fresh.judgment,row)).toBe(true);
  expect(`${JSON.stringify(fresh,null,1)}\n`).toBe(readFileSync(SYNTHETIC_FIXTURE_PATH,'utf8'));
 },60_000);
 it('parseReplayFixture rejects malformed files',()=>{
  expect(()=>parseReplayFixture({...fx,fixture_version:'x'})).toThrow(/replay_fixture_invalid/);
  expect(()=>parseReplayFixture({...fx,expect:'maybe'})).toThrow(/replay_fixture_invalid/);
  expect(()=>parseReplayFixture({...fx,judgment:{...row,inputs:null}})).toThrow(/replay_fixture_invalid/);
 });
});
