// src/lib/evals/evals-facts.integration.test.ts
// F6 facts evidence on real PostgreSQL (spec §1.1, §13.3 as revised by §0 R5-1/R5-2). One F6-owned deterministic build
// (replay/setup.ts over the committed base setup: seed ZZEVA/ZZEVB/ZZEVC → reconcileScope → runFactsSync over the F6
// fixtures with a fixed clock), then every path through the SAME runGoldSet entry and exitCodeOf: synthetic-us passes
// (0); a FactsDb decorator changing one value fails (1); a decorator dropping a required case is incomplete (3);
// plan2.json through the legacy adapter is incomplete with gold.ready false (3); a privileged run resolves every
// passing case to its raw snapshot (R5-5); a later 10-K/A keeps the document-bound case passing while the current copy
// read at the amendment date fails; a quarantined row is not_visible to a privileged reader (incomplete) and missing to
// an unprivileged one. The cases share state and run in order; the restatement and conflict syncs touch ZZEVC ONLY, so
// ZZEVA/ZZEVB stay as built for the frozen replay cases Task 11 appends. plan2.json's AAPL/MSFT are deliberately not
// provisioned here (sync-us may have provisioned them in the shared database): only the gate is asserted for it.
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {padCik} from '../facts/providers/shared';
import type {FactsDb} from '../facts/types';
import {factsReader,privilegedFactsReader} from './adapters/facts';
import {memoryRawStorage} from './adapters/provenance';
import {LANDED_PARSERS} from './cli/deps';
import {checkLock,loadGoldSet} from './gold/load';
import {SETUP_CODE_VERSION,buildFrozenDb,loadSetup} from './replay/setup';
import type {FrozenWorld} from './replay/setup';
import {runGoldSet} from './run-gold-set';
import type {CaseReport,EvalEnv,GoldCase,GoldLock,GoldSet,ModuleReader,ReportEnvironment} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const SETUP='src/lib/evals/fixtures/replay/f6-base.setup.json';
const SYNTHETIC='src/lib/evals/fixtures/gold/facts/synthetic-us.json';
const PLAN2='src/lib/facts/fixtures/gold/plan2.json';
const LOCK='src/lib/evals/fixtures/gold/lock.json';
const A_REV_DOC='ZZEVA/revenue/2022-09-25..2023-09-30/consolidated/USD/document';
const A_REV_CUR='ZZEVA/revenue/2022-09-25..2023-09-30/consolidated/USD/current@2023-11-03';
const A_NI_DOC='ZZEVA/net_income_parent/2022-09-25..2023-09-30/consolidated/USD/document';
const A_MISSING='ZZEVA/interest_expense_bank/2022-09-25..2023-09-30/consolidated/USD/missing';
const B_REV_DOC='ZZEVB/revenue/2022-07-01..2023-06-30/consolidated/USD/document';
const AMENDED_ON='2026-06-15';
const ENVIRONMENT:ReportEnvironment={db_host:'localhost',app_origin:null,db_state_rev:null};

/** readFacts decorator: the issuer's rows of (concept, period_end) carry a different value. */
const tampered=(db:FactsDb,issuer:string,concept:string,periodEnd:string):FactsDb=>({...db,async readFacts(i,m,o){
 const r=await db.readFacts(i,m,o);
 return i!==issuer?r:{...r,rows:r.rows.map(x=>x.concept===concept&&x.period_end===periodEnd?{...x,value:`${x.value_text}1`,value_text:`${x.value_text}1`}:x)};
}});
/** readFacts decorator: the issuer's rows of (concept, period_end) disappear. */
const dropped=(db:FactsDb,issuer:string,concept:string,periodEnd:string):FactsDb=>({...db,async readFacts(i,m,o){
 const r=await db.readFacts(i,m,o);
 return i!==issuer?r:{...r,rows:r.rows.filter(x=>!(x.concept===concept&&x.period_end===periodEnd))};
}});

describe.skipIf(!enabled)('F6 facts evaluation on real PostgreSQL (evals-facts)',()=>{
 let pool:Pool;let world:FrozenWorld;let synthetic:GoldSet;let env:EvalEnv;
 // the world lives in its own isolated database (replay/setup.ts, R2-2): readers use the world's tables, never the admin pool
 const unprivileged=(db:FactsDb=world.db):ModuleReader=>factsReader({db,tables:world.tables,stateRev:async()=>null});
 const privileged=(db:FactsDb=world.db):ModuleReader=>privilegedFactsReader({db,tables:world.tables,stateRev:async()=>null,storage:memoryRawStorage(world.storage.objects),parsers:LANDED_PARSERS});
 const run=(set:GoldSet,reader:ModuleReader,verify?:{artifacts:boolean;sources:boolean})=>runGoldSet({set,mode:'ci',reader,env,environment:ENVIRONMENT,...(verify?{verify}:{})});
 const byId=(id:string):GoldCase=>{const c=synthetic.cases.find(x=>x.case_id===id);if(!c)throw new Error(`synthetic-us lacks ${id}`);return c;};
 const outcomeOf=(cases:CaseReport[],id:string)=>cases.find(c=>c.case_id===id)?.outcome;
 /** A ZZEVA case moved to ZZEVC (CIK 9990603: AAPL's FY2023 10-K only — same values, accessions 0009990603-…). */
 const toC=(c:GoldCase,over:Partial<GoldCase>={}):GoldCase=>{
  const doc=c.source.document_id;
  return {...c,case_id:c.case_id.replace(/^ZZEVA\//,'ZZEVC/'),subject:{market:'US',cik:'9990603'},
   source:{...c.source,...(doc?{document_id:{...doc,value:doc.value.replace(/^0009990601-/,'0009990603-')}}:{})},required:true,...over};
 };
 const cSet=(cases:GoldCase[]):GoldSet=>({...synthetic,set_id:'facts/synthetic-us-zzevc',optional_cases:[],cases});

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')) as {adminUrl:string};
  pool=new Pool({connectionString:state.adminUrl});
  const b=await buildFrozenDb(pool,loadSetup(SETUP));
  if(!b.ok)throw new Error(`F6 base setup does not verify: ${b.mismatch}`);
  world=b.world;
  synthetic=loadGoldSet(SYNTHETIC);
  env={today:world.today,now:()=>world.now,evaluatorCodeVersion:'f'.repeat(40),dirty:false};
 },300_000);
 afterAll(async()=>{
  await world?.close();   // drops the isolated database
  await pool?.end();
 });

 it('the evaluated gold files are the locked bytes; synthetic-us is all synthetic',()=>{
  const lock=JSON.parse(readFileSync(LOCK,'utf8')) as GoldLock;
  expect(()=>checkLock(synthetic,lock)).not.toThrow();
  expect(()=>checkLock(loadGoldSet(PLAN2),lock)).not.toThrow();
  expect(synthetic).toMatchObject({format:'f6',ready:true,set_id:'facts/synthetic-us'});
  expect(synthetic.cases).toHaveLength(10);
  expect(synthetic.cases.every(c=>c.provenance_kind==='synthetic')).toBe(true);
 });

 it('synthetic-us passes through the database read path: gate pass, exit 0',async()=>{
  const o=await run(synthetic,unprivileged());
  const bad=o.report.cases.filter(c=>c.outcome.result!=='pass'&&c.outcome.result!=='expected_absent').map(c=>`${c.case_id}: ${JSON.stringify(c.outcome)}`);
  expect(bad).toEqual([]);
  expect(outcomeOf(o.report.cases,A_MISSING)).toEqual({result:'expected_absent'});
  expect(o.report.summary).toMatchObject({gate:'pass',population:10,correctness:{pass:10,fail:0,unit_mismatch:0,provenance_incomplete:0},
   coverage:{missing_required:0,missing_optional:0,not_visible:0},execution:{read_error:0,subset:false},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},evidence_class:'truth'});
  expect(o.exitCode).toBe(0);
  for(const c of o.report.cases.filter(x=>x.outcome.result==='pass'))expect(c.provenance).toMatchObject({ok:true,producer_code_version:'unavailable:anon'});
  expect(o.report.environment.db_state_rev).toBeGreaterThan(0);
 },120_000);

 it('privileged with verify.artifacts: every passing case resolves to its raw snapshot object and the producer version',async()=>{
  const o=await run(synthetic,privileged(),{artifacts:true,sources:false});
  expect(o.report.summary.gate).toBe('pass');expect(o.exitCode).toBe(0);
  expect(o.report).toMatchObject({privileged:true,provenance:{verified:{artifacts:true,sources:false}}});
  const passed=o.report.cases.filter(c=>c.outcome.result==='pass');
  expect(passed).toHaveLength(9);
  const byCik=Object.fromEntries(world.seed.map(s=>[s.cik,world.issuers[s.ticker]]));
  for(const c of passed){
   const issuerId=byCik[byId(c.case_id).subject.cik!];
   expect(c.provenance).toMatchObject({ok:true,producer_code_version:SETUP_CODE_VERSION,object_path:expect.stringMatching(new RegExp(`^edgar/${issuerId}/[0-9a-f]{64}\\.json$`)),locator:expect.stringMatching(/^facts\.us-gaap\./)});
  }
 },300_000);

 it('a FactsDb decorator changing one value → correctness.fail 1, gate fail, exit 1',async()=>{
  const o=await run(synthetic,unprivileged(tampered(world.db,world.issuers.ZZEVA,'net_income_parent','2023-09-30')));
  expect(outcomeOf(o.report.cases,A_NI_DOC)).toEqual({result:'fail',reason:'value'});
  expect(o.report.cases.find(c=>c.case_id===A_NI_DOC)).toMatchObject({left:'969950000001',right:'96995000000'});
  expect(o.report.summary).toMatchObject({gate:'fail',correctness:{fail:1,pass:9}});expect(o.exitCode).toBe(1);
 },120_000);

 it('a FactsDb decorator dropping a required case → coverage.missing_required 1, gate incomplete, exit 3',async()=>{
  const o=await run(synthetic,unprivileged(dropped(world.db,world.issuers.ZZEVB,'revenue','2023-06-30')));
  expect(outcomeOf(o.report.cases,B_REV_DOC)).toEqual({result:'missing'});
  expect(o.report.summary).toMatchObject({gate:'incomplete',coverage:{missing_required:1},correctness:{fail:0}});expect(o.exitCode).toBe(3);
 },120_000);

 it('plan2.json via the legacy adapter → incomplete with gold.ready false, exit 3, whatever its recorded values',async()=>{
  const legacy=loadGoldSet(PLAN2);
  expect(legacy.format).toBe('legacy_plan2');
  const o=await run(legacy,unprivileged());
  expect(o.report.summary.gold).toMatchObject({format:'legacy_plan2',ready:false});
  expect(o.report.summary.gate).toBe('incomplete');expect(o.exitCode).toBe(3);
 },120_000);

 it('restatement on ZZEVC: a later 10-K/A keeps the document-bound case passing; the current copy read at the amendment date fails',async()=>{
  expect((await world.sync('CIK0009990603.amended.json')).counts).toMatchObject({versioned:1,failed:0});
  const doc=toC(byId(A_REV_DOC));
  const atFiling=toC(byId(A_REV_CUR));
  const atAmendment=toC(byId(A_REV_CUR),{case_id:`${toC(byId(A_REV_CUR)).case_id.replace(/@.*$/,'')}@${AMENDED_ON}`,as_of:AMENDED_ON,source:{...atFiling.source,available_date:AMENDED_ON}});
  const o=await run(cSet([doc,atFiling,atAmendment]),unprivileged());
  expect(outcomeOf(o.report.cases,doc.case_id)).toEqual({result:'pass'});
  expect(outcomeOf(o.report.cases,atFiling.case_id)).toEqual({result:'pass'});
  expect(outcomeOf(o.report.cases,atAmendment.case_id)).toEqual({result:'fail',reason:'value'});
  expect(o.report.cases.find(c=>c.case_id===atAmendment.case_id)).toMatchObject({left:'383285000001',right:'383285000000',detail:{source_ref:'0009990603-26-900001'}});
  expect(o.report.summary).toMatchObject({gate:'fail',correctness:{pass:2,fail:1}});expect(o.exitCode).toBe(1);
 },120_000);

 it('quarantine on ZZEVC: a same-day conflict parks the row; privileged → not_visible(quarantined) → incomplete, unprivileged → missing',async()=>{
  expect((await world.sync('CIK0009990603.conflict.json')).counts).toMatchObject({quarantined:1,failed:0});
  const ni=toC(byId(A_NI_DOC));
  const p=await run(cSet([ni]),privileged());
  expect(p.report.cases[0].outcome).toEqual({result:'not_visible',reason:'quarantined'});
  expect(p.report.summary).toMatchObject({gate:'incomplete',coverage:{not_visible:1}});expect(p.exitCode).toBe(3);
  const u=await run(cSet([ni]),unprivileged());
  expect(u.report.cases[0].outcome).toEqual({result:'missing'});
  expect(u.report.summary).toMatchObject({gate:'incomplete',coverage:{missing_required:1,not_visible:0}});expect(u.exitCode).toBe(3);
 },120_000);
});
