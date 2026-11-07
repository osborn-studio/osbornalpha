// src/lib/judgments/testing/macro-fixture.ts
// Test / script helpers for macro_regime@v1 (Task 19). Loads fixtures/judgments/macro/*.json, serves them through
// fixtureMacroReadApi (macro side) and the frozen macro_series catalog (table_rows side), syncs the methodology row into a
// memory JudgmentsDb with a deterministic clock and an optional draft override for gate tests —
// and builds the golden replay fixture (spec §14.4). Production code never imports this file.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Input,JudgmentInputsDb,PublicTable,WorkItem} from '@/lib/judgments/types';
import {fixtureMacroReadApi,type MacroFixture} from '@/lib/judgments/macro-api';
import {memoryJudgmentsDb,type MemoryJudgmentsDb} from '@/lib/judgments/memory-judgments-db';
import {formulaHashOf} from '@/lib/judgments/formula-hash';
import {methodologyRowOf} from '@/lib/judgments/registry';
import {produce,type ProduceDeps} from '@/lib/judgments/produce';
import {defaultResolverOf,type CompensateDeps} from '@/lib/judgments/compensate';
import {REPLAY_FIXTURE_VERSION,type ReplayFixture} from '@/lib/judgments/replay';
import {macroRegimeV1} from '@/lib/judgments/methodologies/macro-regime.v1';

export const MACRO_S1='6f1d2c3a-0b5e-4c47-9a51-2f0d7e9c1a01';
export const MACRO_S2='6f1d2c3a-0b5e-4c47-9a51-2f0d7e9c1a02';
export const MACRO_CODE_VERSION='f4-fixture-code-version';
export const MACRO_BATCH_ID='00000000-0000-4000-8000-0000000019b1';
/** Normalised run metadata of the golden fixture: excluded from the id and from replay (spec §6.2, §6.3). */
export const REPLAY_REGISTERED_AT='2026-09-11T23:00:00.000Z';
export type MacroFixtureName='us-2026-09-11'|'us-2026-09-revised'|'us-2026-09-low-coverage';

export function loadMacroFixture(name:MacroFixtureName):MacroFixture{
 return JSON.parse(readFileSync(join(process.cwd(),'fixtures/judgments/macro',`${name}.json`),'utf8')) as MacroFixture;
}
export function mergeMacroFixtures(base:MacroFixture,...more:MacroFixture[]):MacroFixture{
 const out:MacroFixture=structuredClone(base);
 for(const m of more){
  out.observations.push(...m.observations);out.snapshots.push(...m.snapshots);out.classifications.push(...m.classifications);
  for(const r of ['US','CN'] as const)out.series_catalog[r]=[...(out.series_catalog[r]??[]),...(m.series_catalog[r]??[])];
 }
 return out;
}
const notInFixture=(what:string)=>async():Promise<never>=>{throw new Error(`${what} is not part of the macro fixture`);};
export function macroInputsDb(fx:MacroFixture):JudgmentInputsDb{
 return {
  facts:{readFacts:notInFixture('facts.readFacts'),factsByIds:notInFixture('facts.factsByIds'),filingsOfIssuer:notInFixture('facts.filingsOfIssuer')},
  deriveMetricsAsOf:notInFixture('deriveMetricsAsOf'),
  macro:fixtureMacroReadApi(fx),
  async tableRows(table:PublicTable,naturalKey:string){return table==='macro_series'&&(naturalKey==='US'||naturalKey==='CN')?(fx.series_catalog[naturalKey]??[]):[];},
  async publicJudgment(){return null;},
  async kline(){return {failure:'unsupported' as const};},
  async issuerPrimarySecurity(){return null;},
 };
}
export async function macroDb(status:'active'|'draft'):Promise<MemoryJudgmentsDb>{
 const db=memoryJudgmentsDb();db.setNow(REPLAY_REGISTERED_AT);
 await db.tables.insert('ingest_batches',{batch_id:MACRO_BATCH_ID,status:'running',dataset:'judgments.produce.macro_regime'});
 const row=methodologyRowOf(macroRegimeV1,formulaHashOf(macroRegimeV1),{publishable:false,code_version:MACRO_CODE_VERSION});
 await db.syncMethodology({...row,status},'script','Task 19 fixture status');
 return db;
}
export function macroWork(fx:MacroFixture,snapshotId:string):WorkItem{
 const s=fx.snapshots.find(x=>x.snapshot_id===snapshotId);
 if(!s)throw new Error(`snapshot ${snapshotId} is not in the fixture`);
 return {subject:{type:'macro_region',key:s.region},asOf:s.as_of,observedAt:REPLAY_REGISTERED_AT,binding:{snapshot_id:s.snapshot_id}};
}
/** Task 10 ProduceDeps over the real resolver table (Task 11 via compensate.ts defaultResolverOf). */
export const produceCtx=(db:MemoryJudgmentsDb,inputsDb:JudgmentInputsDb,opts:{dryRun?:boolean}={}):ProduceDeps=>
 ({db,inputsDb,tables:db.tables,resolverOf:defaultResolverOf,batchId:MACRO_BATCH_ID,codeVersion:MACRO_CODE_VERSION,signal:new AbortController().signal,dryRun:opts.dryRun??false,actor:'test'});
/** Task 12 CompensateDeps: the scan opens its own produce batch in `tables`. */
export const compensateCtx=(db:MemoryJudgmentsDb,inputsDb:JudgmentInputsDb):CompensateDeps=>
 ({db,inputsDb,tables:db.tables,codeVersion:MACRO_CODE_VERSION,triggeredBy:'cron',signal:new AbortController().signal,methodology:macroRegimeV1});

/** Frozen inputs of snapshot s1, for REGISTRY-wide property tests (spec §14.1). */
export async function macroSampleInputs():Promise<Input[]>{
 const fx=loadMacroFixture('us-2026-09-11');
 const g=await macroRegimeV1.gather(macroWork(fx,MACRO_S1),macroInputsDb(fx));
 if(!Array.isArray(g))throw new Error(`macro sample gather abstained: ${g.reason}`);
 return g;
}

export async function buildMacroReplayFixture():Promise<ReplayFixture>{
 const fx=loadMacroFixture('us-2026-09-11');const db=await macroDb('active');
 const res=await produce(macroRegimeV1,[macroWork(fx,MACRO_S1)],produceCtx(db,macroInputsDb(fx)));
 const item=res.items[0];
 if(!item?.judgment_id||item.status!=='inserted')throw new Error(`macro replay fixture: produce failed ${JSON.stringify(item)}`);
 const row=await db.getJudgment(item.judgment_id);
 if(!row)throw new Error('macro replay fixture: registered row not found');
 const judgment=row;
 return {fixture_version:REPLAY_FIXTURE_VERSION,description:'macro_regime@v1 · US · 2026-09-11 · snapshot s1 (acceptance example 2: tamper a macro_observation → input_hash_mismatch naming its series_id)',expect:'exact',judgment};
}
