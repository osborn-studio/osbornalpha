// src/lib/judgments/testing/synthetic-fixture.ts
// Offline generator of the golden synthetic replay fixture (spec §14.4): AAPL facts from the plan-2
// EDGAR fixture (deterministic ids, FIXED_NOW clock) → memoryFactsDb → memory JudgmentInputsDb;
// synthetic_fact_metric@v1 synced into a memory JudgmentsDb; produce() registers one active judgment;
// the stored row is the fixture. registered_at / created_at come from the memory clock and are run
// metadata (replay and --check compare the normalised payload only).
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {memoryJudgmentInputsDb} from '../inputs-db';
import {memoryJudgmentsDb} from '../memory-judgments-db';
import {produce} from '../produce';
import type {ReplayFixture} from '../replay';
import {batchTables,syncTestMethod,withSubjects} from './db-helpers';
import {AAPL_ISSUER,FIXED_NOW,aaplParse,publishFacts} from './facts-fixture';
import {FIXTURE_RESOLVERS} from './fixture-methods';
import {syntheticFactMetric} from './synthetic-method';

export const SYNTHETIC_FIXTURE_PATH='fixtures/judgments/replay/synthetic-fact-metric.json';
export const SYNTHETIC_AS_OF='2024-12-31';
export const SYNTHETIC_BATCH='00000000-0000-4000-8000-00000000f001';
/** The AAPL facts the fixture was built from, as a memory JudgmentInputsDb (also used to reconcile it). */
export async function aaplInputsDb(){
 const facts=memoryFactsDb();facts.setNow(FIXED_NOW);
 const p=aaplParse(2022);
 await publishFacts(facts,{issuer:AAPL_ISSUER,market:'US',filings:p.filings,facts:p.candidates});
 return memoryJudgmentInputsDb({facts});
}
export async function generateSyntheticReplayFixture(asOf=SYNTHETIC_AS_OF):Promise<ReplayFixture>{
 const inputsDb=await aaplInputsDb();
 const tables=await batchTables(SYNTHETIC_BATCH);
 const db=withSubjects(memoryJudgmentsDb({tables}));
 await syncTestMethod(db,syntheticFactMetric);
 const r=await produce(syntheticFactMetric,[{subject:{type:'issuer',key:AAPL_ISSUER},asOf}],{db,inputsDb,tables,resolverOf:FIXTURE_RESOLVERS,batchId:SYNTHETIC_BATCH,codeVersion:'fixture0'});
 const item=r.items[0];
 if(!item||item.status!=='inserted'||item.abstained||!item.judgment_id)throw new Error(`synthetic replay fixture: no active judgment registered: ${JSON.stringify({counts:r.counts,errors:r.errors,items:r.items})}`);
 const judgment=await db.getJudgment(item.judgment_id);
 if(!judgment)throw new Error('synthetic replay fixture: registered row not found');
 return {fixture_version:'judgment-replay/1',description:`synthetic_fact_metric@v1 on AAPL (plan-2 EDGAR fixture CIK0000320193.trimmed.json) as of ${asOf}: one financial_metric input frozen with its derivation rows`,expect:'exact',judgment};
}
