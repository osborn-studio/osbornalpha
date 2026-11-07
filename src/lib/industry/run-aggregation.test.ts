// src/lib/industry/run-aggregation.test.ts
import {describe,it,expect,beforeEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import type {TableClient} from '../db/table-client';
import {startBatch,finishBatch,emptyCounts} from '../dq/batches';
import {memoryFactsDb} from '../facts/memory-facts-db';
import type {MemoryFactsDb} from '../facts/memory-facts-db';
import {MAPPING_GEN,MAPPING_VERSION} from '../facts/concepts';
import type {Duration,FactInsert,FilingInsert} from '../facts/types';
import {memoryIndustryDb} from './memory-industry-db';
import {encodeManifest,memoryManifestStore} from './manifest';
import {replayFromManifest} from './replay';
import {buildCellManifest,runIndustryAggregation} from './run-aggregation';
import type {AggregationOptions} from './run-aggregation';
import {CONFIG_HASH,METHOD_VERSION} from './method';
import {IndustryDbError} from './types';
import type {ClassificationRow,IndustryDb,IndustryDeps,ManifestStore} from './types';

// ---- fixture: one food industry (3 members + 1 unresolved record) and one bank industry (2 members) ----
const FOOD='801120.SI',BANK='801780.SI';
const ISSUERS={F1:'10000000-0000-4000-8000-000000000001',F2:'10000000-0000-4000-8000-000000000002',F3:'10000000-0000-4000-8000-000000000003',B1:'10000000-0000-4000-8000-000000000004',B2:'10000000-0000-4000-8000-000000000005'} as const;
type Key=keyof typeof ISSUERS;
const TICKER:Record<Key,string>={F1:'600001.SH',F2:'000002.SZ',F3:'830003.BJ',B1:'600004.SH',B2:'000005.SZ'};
const node=(code:string,level:number,parent:string|null,name:string):ClassificationRow=>({scheme:'sw2021',version:'2021',code,level,name_zh:name,name_en:null,parent_code:parent,attributes:{}});
const TREE=[node(FOOD,1,null,'食品饮料'),node('801124.SI',2,FOOD,'食品加工'),node('851241.SI',3,'801124.SI','肉制品'),node(BANK,1,null,'银行'),node('801782.SI',2,BANK,'国有大型银行'),node('857821.SI',3,'801782.SI','国有大型银行Ⅲ')];
const L23:Record<string,[string,string]>={[FOOD]:['801124.SI','851241.SI'],[BANK]:['801782.SI','857821.SI']};
const MEMBERS:{key:Key|null;ts:string;l1:string;in:string}[]=[
 {key:'F1',ts:TICKER.F1,l1:FOOD,in:'2021-12-13'},{key:'F2',ts:TICKER.F2,l1:FOOD,in:'2021-12-13'},{key:'F3',ts:TICKER.F3,l1:FOOD,in:'2024-07-01'},
 {key:null,ts:'600999.SH',l1:FOOD,in:'2021-12-13'},
 {key:'B1',ts:TICKER.B1,l1:BANK,in:'2021-12-13'},{key:'B2',ts:TICKER.B2,l1:BANK,in:'2021-12-13'},
];
/** YTD reports: [period_end, available_date, {concept: value}] (equity_parent is the INSTANT at period_end). */
type Report=[string,string,Record<string,string>];
const food=(s:number):Report[]=>[
 ['2023-12-31','2024-03-29',{revenue:`${800*s}`,revenue_operating:`${780*s}`,cost_of_revenue:`${500*s}`,net_income_parent:`${80*s}`,equity_parent:`${1000*s}`}],
 ['2024-03-31','2024-04-29',{revenue:`${210*s}`,net_income_parent:`${20*s}`,equity_parent:`${1020*s}`}],
 ['2024-06-30','2024-08-30',{revenue:`${430*s}`,net_income_parent:`${42*s}`,equity_parent:`${1040*s}`}],
 ['2024-09-30','2024-10-30',{revenue:`${650*s}`,net_income_parent:`${63*s}`,equity_parent:`${1060*s}`}],
 ['2024-12-31','2025-03-28',{revenue:`${880*s}`,revenue_operating:`${860*s}`,cost_of_revenue:`${540*s}`,net_income_parent:`${88*s}`,equity_parent:`${1080*s}`}],
];
const bank=(s:number):Report[]=>[
 ['2023-12-31','2024-03-29',{revenue:`${500*s}`,net_income_parent:`${150*s}`,equity_parent:`${2000*s}`}],
 ['2024-12-31','2025-03-28',{revenue:`${520*s}`,net_income_parent:`${160*s}`,equity_parent:`${2100*s}`}],
];
const REPORTS:Record<Key,Report[]>={F1:food(1),F2:food(2),F3:[],B1:bank(1),B2:bank(3)};
const DUR:Record<string,Duration>={'03':'3M','06':'6M','09':'9M','12':'12M'};

async function publish(facts:MemoryFactsDb,tables:TableClient,key:Key,reports:Report[],tag='1'){
 const issuer=ISSUERS[key],ticker=TICKER[key];
 const {batchId}=await startBatch(tables,{producer:'test-facts',dataset:'facts.cn.test'});
 await facts.reconcileScope('CN',[{issuer_id:issuer,reasons:['test'],priority:10,fetch_key:ticker}]);
 expect(await facts.claimLease(issuer,'CN',batchId,600)).toBe(true);
 const run=await facts.beginRun(issuer,'CN',batchId,MAPPING_GEN);
 const filings:FilingInsert[]=reports.map(([pe,avail])=>({filing_id:randomUUID(),issuer_id:issuer,sourceRef:`${ticker}:${pe.replaceAll('-','')}:${tag}:${avail.replaceAll('-','')}`,market:'CN',source:'tushare',origin:ticker.endsWith('.SH')?'sse':ticker.endsWith('.SZ')?'szse':'bse',
  formType:tag==='1'?({'03':'q1','06':'semiannual','09':'q3','12':'annual'} as const)[pe.slice(5,7) as '03']:'restatement',fiscalYear:Number(pe.slice(0,4)),fiscalPeriod:({'03':'Q1','06':'H1','09':'9M','12':'FY'} as const)[pe.slice(5,7) as '03'],periodEnd:pe,availableDate:avail,url:null}));
 const ids=await facts.stageFilings(run,filings);
 const rows:FactInsert[]=reports.flatMap(([pe,avail],i)=>Object.entries(reports[i][2]).map(([concept,value])=>({fact_id:randomUUID(),issuer_id:issuer,market:'CN' as const,filing_id:ids.get(filings[i].sourceRef)!,concept,source_concept:`test.${concept}`,
  statement:concept==='equity_parent'?'BS' as const:'IS' as const,period_start:concept==='equity_parent'?null:`${pe.slice(0,4)}-01-01`,period_end:pe,duration:concept==='equity_parent'?'INSTANT' as const:DUR[pe.slice(5,7)],value,unit:'CNY',consolidation:'consolidated' as const,available_date:avail,mapping_gen:MAPPING_GEN,mapping_version:MAPPING_VERSION,raw_hash:`raw:${ticker}:${pe}:${concept}:${tag}`})));
 if(rows.length>0)await facts.stageFacts(run,rows);
 await facts.publishRun(run,[...ids.values()]);
 await facts.releaseLease(issuer,'CN',batchId,'success','2030-01-01T00:00:00.000Z');
 await finishBatch(tables,batchId,{counts:{...emptyCounts(),inserted:rows.length,fetched:rows.length},errors:[]});
}

let tables:TableClient;let facts:MemoryFactsDb;let db:IndustryDb;let manifests:ManifestStore&{objects:Map<string,Uint8Array>};let deps:IndustryDeps;
const OPTS:AggregationOptions={scheme:'sw2021',version:'2021',level:1,factsAsOf:'2025-05-15',historyStart:'2024-06-30'};
const sourceIds=new Map<string,string>();
async function seedMemberships(availability:'effective_date_assumed'|'evidenced'='effective_date_assumed',method:'today'|'as_of'='today'){
 const {batchId}=await startBatch(tables,{producer:'test-industry',dataset:'industry.test'});
 // issuer rows, in case the memory implementation checks them like the SQL function's issuer lock
 for(const k of Object.keys(ISSUERS) as Key[])await tables.insert('issuers',{issuer_id:ISSUERS[k],canonical_name_zh:k,status:'active',cninfo_org_id:null,provenance:{}});
 await db.upsertClassifications(batchId,TREE);
 await db.upsertSourceMemberships(batchId,MEMBERS.map(m=>({source:'tushare:index_member_all',ts_code:m.ts,name:null,l1_code:m.l1,l2_code:L23[m.l1][0],l3_code:L23[m.l1][1],in_date:m.in,out_date:null,observed_at:'2025-05-01T00:00:00.000Z',raw_hash:`raw:${m.ts}`,locator:{api:'index_member_all',ts_code:m.ts}})));
 const current=await db.currentSourceMemberships({});
 for(const m of MEMBERS){
  const src=current.find(s=>s.ts_code===m.ts)!;sourceIds.set(m.ts,src.id);
  if(m.key===null)continue;
  const prov={availability,source_membership_id:src.id,raw_hash:src.raw_hash,locator:src.locator};
  await db.applyMemberships(batchId,ISSUERS[m.key],'sw2021','2021',[[m.l1,1],[L23[m.l1][0],2],[L23[m.l1][1],3]].map(([code,level])=>({code:code as string,level:level as number,valid_from:m.in,valid_to:null,available_date:m.in,valid_to_available_date:null,source:'tushare:index_member_all',provenance:prov})),[src.id],{method,resolved_at:'2025-05-01T00:00:00.000Z',...(method==='as_of'?{as_of:'2025-05-01'}:{})});
 }
}
beforeEach(async()=>{
 tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id'],issuers:['issuer_id']});
 facts=memoryFactsDb(tables);db=memoryIndustryDb({tables});manifests=memoryManifestStore(db);
 deps={tables,db,facts,manifests,now:()=>new Date('2025-05-17T03:00:00.000Z'),codeVersion:'a'.repeat(40)};
 await seedMemberships();
 for(const k of Object.keys(ISSUERS) as Key[])await publish(facts,tables,k,REPORTS[k]);
});
const rowsOf=async(run:string)=>db.metricRowsOfRun(run);
const val=async(run:string,code:string,metric:string,duration:string,pe:string)=>(await rowsOf(run)).find(r=>r.code===code&&r.metric===metric&&r.duration===duration&&r.period_end===pe)!;

describe('runIndustryAggregation',()=>{
 it('refuses to run without a code version and writes nothing',async()=>{
  const r=await runIndustryAggregation({...deps,codeVersion:null},OPTS);
  expect(r).toMatchObject({status:'rejected',code:'code_version_missing',batchId:null,runId:null});
  expect((tables as unknown as {rows(t:string):unknown[]}).rows('ingest_batches').filter(b=>(b as {producer:string}).producer==='industry-agg')).toEqual([]);
  expect(await db.activeMetricRun('sw2021','2021',1)).toBeNull();
 });
 it('first run: every grid cell staged, values by the whole method, reconstruction, dependencies per member, manifests replay, activated',async()=>{
  const r=await runIndustryAggregation(deps,OPTS);
  expect(r).toMatchObject({status:'active',batchStatus:'success',generation:1,historyClass:'reconstruction',groups:8,reusedGroups:0,manifestMismatches:0,truncatedIssuers:[]});
  const run=(await db.metricRun(r.runId!))!;
  expect(run).toMatchObject({status:'active',facts_as_of:'2025-05-15',knowledge_date:'2025-05-15',method_version:METHOD_VERSION,config_hash:CONFIG_HASH,formula_version:'facts-derive/1.0',code_version:'a'.repeat(40),reused_from_run:null,
   expected_grid:{codes:[FOOD,BANK].sort(),period_ends:['2024-06-30','2024-09-30','2024-12-31','2025-03-31']}});
  expect(run.coverage_summary).toMatchObject({facts_scope_ready:true,universe:5,ready:5,groups:8,reused_groups:0});
  const rows=await rowsOf(r.runId!);
  expect(rows).toHaveLength(2*(6+6+11+6));
  expect(rows.every(x=>x.updated_at===run.activated_at)).toBe(true);
  // food 2024-12-31: F1 (s=1) + F2 (s=2); F3 has no facts (excluded, still a member); one unresolved record
  expect(await val(r.runId!,FOOD,'revenue_sum','12M','2024-12-31')).toMatchObject({status:'ok',value:'2640',n_members:3,n_with_data:2,n_unresolved:1,unit:'CNY'});
  expect((await val(r.runId!,FOOD,'revenue_sum','3M','2024-12-31')).value).toBe('690');            // (880-650)·3
  expect((await val(r.runId!,FOOD,'gross_margin','12M','2024-12-31')).value).toBe('0.3720930233'); // (860-540)/860
  expect((await val(r.runId!,FOOD,'revenue_yoy','12M','2024-12-31')).value).toBe('0.1');           // (880-800)/800
  expect((await val(r.runId!,FOOD,'member_count','INSTANT','2024-06-30'))).toMatchObject({value:'2',n_members:2,n_unresolved:1});   // F3 joins 2024-07-01
  expect((await val(r.runId!,FOOD,'roe','TTM','2024-12-31')).value).toBe('0.0846153846');           // 2·88 / (1000+1080)
  // banks: gross margin is financial_excluded; revenue sums still computed
  expect(await val(r.runId!,BANK,'gross_margin','12M','2024-12-31')).toMatchObject({status:'missing',missing_reason:'financial_excluded',value:null,manifest_hash:null});
  expect((await val(r.runId!,BANK,'revenue_sum','12M','2024-12-31')).value).toBe('2080');           // 520 + 1560
  // missing stays missing: no 3M facts for banks → empty_set, never 0
  expect(await val(r.runId!,BANK,'revenue_sum','3M','2024-12-31')).toMatchObject({status:'missing',missing_reason:'empty_set',value:null});
  // dependencies: one per member per (code, period_end), state_rev = that issuer's envelope
  const deps1=await db.runDependencies('aggregate',r.runId!);
  expect(deps1.filter(d=>d.cell_key===`${FOOD}:2024-12-31`).map(d=>d.issuer_id).sort()).toEqual([ISSUERS.F1,ISSUERS.F2,ISSUERS.F3].sort());
  expect(deps1.filter(d=>d.cell_key===`${FOOD}:2024-06-30`)).toHaveLength(2);
  const revs=new Map((await facts.scopeAll('CN')).map(s=>[s.issuer_id,s.state_rev]));
  for(const d of deps1)expect(d.state_rev).toBe(revs.get(d.issuer_id));
  // every ok row's manifest replays to the stored value
  for(const row of rows.filter(x=>x.status==='ok')){
   const m=await manifests.get(row.manifest_hash!);
   const c=replayFromManifest(m);expect(c.reproduced).toBe(true);
   expect(c.cells.find(x=>x.metric===row.metric&&x.duration===row.duration)?.value_text).toBe(row.value);
   expect(m).toMatchObject({code:row.code,period_end:row.period_end,history_class:'reconstruction',code_version:'a'.repeat(40)});
  }
  const fresh=(tables as unknown as {rows(t:string):Record<string,unknown>[]}).rows('dq_freshness').find(x=>x.dataset==='industry.agg.sw2021');
  expect(fresh).toMatchObject({expected_cadence:'weekly',consecutive_errors:0});
 });
 it('second run with unchanged state reuses every manifest; a new filing recomputes only the groups containing that issuer',async()=>{
  const r1=await runIndustryAggregation(deps,OPTS);
  const r2=await runIndustryAggregation(deps,OPTS);
  expect(r2).toMatchObject({status:'active',generation:2,reusedGroups:8});
  expect((await db.metricRun(r2.runId!))?.reused_from_run).toBe(r1.runId);
  const h=(rows:Awaited<ReturnType<typeof rowsOf>>)=>rows.map(x=>`${x.code}|${x.metric}|${x.duration}|${x.period_end}|${x.status}|${x.value}|${x.manifest_hash}`).sort();
  expect(h(await rowsOf(r2.runId!))).toEqual(h(await rowsOf(r1.runId!)));
  const d=(x:{cell_key:string;issuer_id:string;state_rev:number}[])=>x.map(y=>`${y.cell_key}|${y.issuer_id}|${y.state_rev}`).sort();
  expect(d(await db.runDependencies('aggregate',r2.runId!))).toEqual(d(await db.runDependencies('aggregate',r1.runId!)));
  // a member with no facts gets its first filing: its state_rev moves → the food groups it belongs to recompute;
  // banks and food 2024-06-30 (F3 joins on 2024-07-01) are reused
  await publish(facts,tables,'F3',[['2024-12-31','2025-04-30',{revenue:'100',net_income_parent:'10',equity_parent:'200'}]],'1');
  const r3=await runIndustryAggregation(deps,OPTS);
  expect(r3).toMatchObject({status:'active',generation:3,reusedGroups:5});
  expect(await val(r3.runId!,FOOD,'revenue_sum','12M','2024-12-31')).toMatchObject({value:'2740',n_with_data:3});
  const old=await val(r1.runId!,FOOD,'revenue_sum','12M','2024-12-31'),now=await val(r3.runId!,FOOD,'revenue_sum','12M','2024-12-31');
  expect(now.manifest_hash).not.toBe(old.manifest_hash);
  expect(now.updated_at!>old.updated_at!).toBe(true);
  expect((await val(r3.runId!,BANK,'revenue_sum','12M','2024-12-31')).manifest_hash).toBe((await val(r1.runId!,BANK,'revenue_sum','12M','2024-12-31')).manifest_hash);
  expect((await db.metricRun(r1.runId!))?.status).toBe('superseded');
 });
 it('reads each issuer exactly once per run (one envelope, V6) and excludes a truncated envelope everywhere',async()=>{
  const reads:string[]=[];
  const counting={...facts,readFacts:async(i:string,m:'CN'|'US',o:Parameters<MemoryFactsDb['readFacts']>[2])=>{reads.push(i);const e=await facts.readFacts(i,m,o);return i===ISSUERS.F2?{...e,rows:[],truncated:true}:e;}};
  const r=await runIndustryAggregation({...deps,facts:counting},OPTS);
  expect(r.status).toBe('active');
  expect(reads.sort()).toEqual(Object.values(ISSUERS).sort());
  expect(r.truncatedIssuers).toEqual([ISSUERS.F2]);
  expect(await val(r.runId!,FOOD,'revenue_sum','12M','2024-12-31')).toMatchObject({value:'880',n_with_data:1,n_members:3});
  const m=await manifests.get((await val(r.runId!,FOOD,'revenue_sum','12M','2024-12-31')).manifest_hash!);
  expect(m.roles.filter(x=>x.issuer_id===ISSUERS.F2&&x.metric!=='member_count').every(x=>x.reason==='read_truncated')).toBe(true);
  expect(m.warnings).toContain(`read_truncated:${ISSUERS.F2}`);
  expect((await db.metricRun(r.runId!))?.coverage_summary).toMatchObject({read_truncated:[ISSUERS.F2],read_truncated_count:1});
 });
 it('fails the run when fewer than 95% of the members have a successful facts sync (facts_scope_not_ready)',async()=>{
  const notReady={...facts,scopeAll:async(m:'CN'|'US')=>(await facts.scopeAll(m)).map(s=>s.issuer_id===ISSUERS.B2?{...s,last_success_at:null}:s)};
  const r=await runIndustryAggregation({...deps,facts:notReady},OPTS);
  expect(r).toMatchObject({status:'failed',code:'facts_scope_not_ready',batchStatus:'failed'});
  expect(await db.metricRun(r.runId!)).toMatchObject({status:'failed',coverage_summary:{facts_scope_ready:false,universe:5,ready:4}});
  expect(await rowsOf(r.runId!)).toEqual([]);
  expect(await db.activeMetricRun('sw2021','2021',1)).toBeNull();
  const fresh=(tables as unknown as {rows(t:string):Record<string,unknown>[]}).rows('dq_freshness').find(x=>x.dataset==='industry.agg.sw2021');
  expect(fresh).toMatchObject({consecutive_errors:1,last_ok_at:null});
 });
 it('a manifest self-check mismatch makes that cell missing:manifest_mismatch and quarantines it; the run still activates',async()=>{
  const r=await runIndustryAggregation(deps,OPTS,{replay:m=>{const x=replayFromManifest(m);return m.code===FOOD&&m.period_end==='2024-12-31'?{...x,reproduced:false,mismatches:['revenue_sum:12M:2024-01-01']}:x;}});
  expect(r).toMatchObject({status:'active',manifestMismatches:1,batchStatus:'success'});
  expect(await val(r.runId!,FOOD,'revenue_sum','12M','2024-12-31')).toMatchObject({status:'missing',missing_reason:'manifest_mismatch',value:null,manifest_hash:null});
  expect((await val(r.runId!,FOOD,'revenue_sum','3M','2024-12-31')).status).toBe('ok');
  const q=(tables as unknown as {rows(t:string):Record<string,unknown>[]}).rows('dq_quarantine').filter(x=>x.reason_code==='manifest_mismatch');
  expect(q).toHaveLength(1);
  expect(q[0]).toMatchObject({dataset:'industry.agg.sw2021',table_name:'industry_metrics',natural_key:`${r.runId}:${FOOD}:2024-12-31:revenue_sum:12M:2024-01-01`,status:'open'});
  // a group with a manifest_mismatch row is never reused
  const r2=await runIndustryAggregation(deps,OPTS);
  expect(r2.reusedGroups).toBe(7);
  expect((await val(r2.runId!,FOOD,'revenue_sum','12M','2024-12-31')).status).toBe('ok');
 });
 it('buildCellManifest recomputes one group through the run code path: same canonical bytes as the stored manifest, nothing written',async()=>{
  const r=await runIndustryAggregation(deps,OPTS);
  const stored=await val(r.runId!,FOOD,'revenue_sum','12M','2024-12-31');
  const objects=manifests.objects.size;
  const m=await buildCellManifest({db,facts,codeVersion:'a'.repeat(40)},{scheme:'sw2021',version:'2021',level:1,code:FOOD,periodEnd:'2024-12-31',factsAsOf:'2025-05-15',knowledgeDate:'2025-05-15',historyClass:'reconstruction'});
  expect(encodeManifest(m).hash).toBe(stored.manifest_hash);
  expect(manifests.objects.size).toBe(objects);
  expect((await db.activeMetricRun('sw2021','2021',1))?.run_id).toBe(r.runId);
  // a later filing shows up in the recompute but not in the stored manifest
  await publish(facts,tables,'F3',[['2024-12-31','2025-04-30',{revenue:'100',net_income_parent:'10',equity_parent:'200'}]],'1');
  const m2=await buildCellManifest({db,facts,codeVersion:'a'.repeat(40)},{scheme:'sw2021',version:'2021',level:1,code:FOOD,periodEnd:'2024-12-31',factsAsOf:'2025-05-15',knowledgeDate:'2025-05-15',historyClass:'reconstruction'});
  expect(m2.cells.find(c=>c.metric==='revenue_sum'&&c.duration==='12M')?.value_text).toBe('2740');
 });
 it('maps activation refusals to a failed run with the function code (obsolete_run, dependency_regression)',async()=>{
  await runIndustryAggregation(deps,OPTS);
  const older=await runIndustryAggregation(deps,{...OPTS,factsAsOf:'2025-05-01'});
  expect(older).toMatchObject({status:'failed',code:'obsolete_run',batchStatus:'failed'});
  expect((await db.metricRun(older.runId!))?.status).toBe('failed');
  const regress={...db,activateMetricRun:async()=>{throw new IndustryDbError('dependency_regression');}} as IndustryDb;
  const r=await runIndustryAggregation({...deps,db:regress},OPTS);
  expect(r).toMatchObject({status:'failed',code:'dependency_regression'});
  expect((await db.metricRun(r.runId!))?.status).toBe('failed');
  const upload={...manifests,put:async()=>{throw new Error('storage down');}};
  const u=await runIndustryAggregation({...deps,manifests:upload},{...OPTS,factsAsOf:'2025-05-16'});
  expect(u).toMatchObject({status:'failed',code:'manifest_upload_failed'});
 });
 it('a filtered run (codes) recomputes only those groups and never shrinks the active level or history', async()=>{
  const r1=await runIndustryAggregation(deps,OPTS);
  const r2=await runIndustryAggregation(deps,{...OPTS,codes:[FOOD],historyStart:'2024-12-31'});
  expect(r2).toMatchObject({status:'active',groups:8,reusedGroups:4});
  expect((await db.metricRun(r2.runId!))?.expected_grid).toEqual((await db.metricRun(r1.runId!))?.expected_grid);
  const codesOf=async(run:string)=>[...new Set((await rowsOf(run)).map(x=>x.code))].sort();
  expect(await codesOf(r2.runId!)).toEqual([FOOD,BANK].sort());
  expect((await rowsOf(r2.runId!)).some(x=>x.period_end==='2024-06-30')).toBe(true);
  expect((await db.activeMetricRun('sw2021','2021',1))?.run_id).toBe(r2.runId);
  // a code filter that matches nothing is rejected
  expect(await runIndustryAggregation(deps,{...OPTS,codes:['999999.SI']})).toMatchObject({status:'failed',code:'no_classifications'});
 });
 it('the readiness denominator is the whole facts universe: an unsynced a_stock issuer outside the grid blocks activation', async()=>{
  const extra='10000000-0000-4000-8000-0000000000ff';
  await tables.insert('issuers',{issuer_id:extra,canonical_name_zh:'X',status:'active',cninfo_org_id:null,provenance:{}});
  await tables.insert('issuer_securities',{issuer_id:extra,ticker:'688888.SH',isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2020-01-01',valid_to:null});
  await tables.insert('security_universe_memberships',{universe:'a_stock',ticker:'688888.SH',is_active:true});
  const r=await runIndustryAggregation(deps,OPTS);
  expect(r).toMatchObject({status:'failed',code:'facts_scope_not_ready'});
  expect((await db.metricRun(r.runId!))?.coverage_summary).toMatchObject({facts_scope_ready:false,universe:6,ready:5});
 });
 it('a reused group keeps its truncated issuers in the run coverage summary', async()=>{
  const trunc={...facts,readFacts:async(i:string,m:'CN'|'US',o:Parameters<MemoryFactsDb['readFacts']>[2])=>{const e=await facts.readFacts(i,m,o);return i===ISSUERS.F2?{...e,rows:[],truncated:true}:e;}};
  await runIndustryAggregation({...deps,facts:trunc},OPTS);
  const r2=await runIndustryAggregation(deps,OPTS);
  expect(r2).toMatchObject({reusedGroups:8,truncatedIssuers:[ISSUERS.F2]});
  expect((await db.metricRun(r2.runId!))?.coverage_summary).toMatchObject({read_truncated:[ISSUERS.F2],read_truncated_count:1});
 });
 it('reuse is blocked when the unresolved records or the members change although every state_rev is unchanged', async()=>{
  await runIndustryAggregation(deps,OPTS);
  const {batchId}=await startBatch(tables,{producer:'test-industry',dataset:'industry.test2'});
  await db.upsertSourceMemberships(batchId,[{source:'tushare:index_member_all',ts_code:'600998.SH',name:null,l1_code:FOOD,l2_code:L23[FOOD][0],l3_code:L23[FOOD][1],in_date:'2021-12-13',out_date:null,observed_at:'2025-05-02T00:00:00.000Z',raw_hash:'raw:600998',locator:{api:'index_member_all',ts_code:'600998.SH'}}]);
  const r2=await runIndustryAggregation(deps,OPTS);
  expect(r2).toMatchObject({status:'active',reusedGroups:4});            // the four food groups gained an unresolved record
  const src=(await db.currentSourceMemberships({})).find(s=>s.ts_code===TICKER.F3)!;
  const prov={availability:'effective_date_assumed' as const,source_membership_id:src.id,raw_hash:src.raw_hash,locator:src.locator};
  await db.applyMemberships(batchId,ISSUERS.F3,'sw2021','2021',[[FOOD,1],[L23[FOOD][0],2],[L23[FOOD][1],3]].map(([code,level])=>({code:code as string,level:level as number,valid_from:'2024-07-01',valid_to:'2025-01-31',available_date:'2024-07-01',valid_to_available_date:'2025-02-01',source:'tushare:index_member_all',provenance:prov})),[src.id],{method:'today',resolved_at:'2025-05-03T00:00:00.000Z'});
  const r3=await runIndustryAggregation(deps,OPTS);
  expect(r3).toMatchObject({status:'active',reusedGroups:5});            // F3's window (valid_to, part of the manifest members) changed in the three food groups it belongs to
  expect((await val(r3.runId!,FOOD,'member_count','INSTANT','2025-03-31')).value).toBe('2');
 });
 it('history_class is point_in_time only when every member row is evidenced and its source resolved as_of', async()=>{
  tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id'],issuers:['issuer_id']});
  facts=memoryFactsDb(tables);db=memoryIndustryDb({tables});manifests=memoryManifestStore(db);
  deps={...deps,tables,db,facts,manifests};
  await seedMemberships('evidenced','as_of');
  for(const k of Object.keys(ISSUERS) as Key[])await publish(facts,tables,k,REPORTS[k]);
  const r=await runIndustryAggregation(deps,OPTS);
  expect(r).toMatchObject({status:'active',historyClass:'point_in_time'});
  expect((await db.metricRun(r.runId!))?.history_class).toBe('point_in_time');
 });
 it('self-check: an unmatched mismatch (missing_cell:) fails the run with manifest_mismatch; unexpected_cell: quarantines that cell', async()=>{
  const bad=await runIndustryAggregation(deps,OPTS,{replay:m=>({...replayFromManifest(m),reproduced:false,mismatches:['missing_cell:revenue_sum:3M:2099-01-01']})});
  expect(bad).toMatchObject({status:'failed',code:'manifest_mismatch'});
  expect((await db.metricRun(bad.runId!))?.status).toBe('failed');
  expect(await db.activeMetricRun('sw2021','2021',1)).toBeNull();
  const odd=await runIndustryAggregation(deps,OPTS,{replay:m=>{const x=replayFromManifest(m);return m.code===FOOD&&m.period_end==='2024-12-31'?{...x,reproduced:false,mismatches:['unexpected_cell:revenue_sum:12M:2024-01-01']}:x;}});
  expect(odd).toMatchObject({status:'active',manifestMismatches:1});
  expect(await val(odd.runId!,FOOD,'revenue_sum','12M','2024-12-31')).toMatchObject({status:'missing',missing_reason:'manifest_mismatch'});
 });
 it('maps incomplete_run and dependencies_incomplete refusals, and a staging error, to a failed run', async()=>{
  for(const code of ['incomplete_run','dependencies_incomplete'] as const){
   const refuse={...db,activateMetricRun:async()=>{throw new IndustryDbError(code);}} as IndustryDb;
   const r=await runIndustryAggregation({...deps,db:refuse},OPTS);
   expect(r).toMatchObject({status:'failed',code});
   expect((await db.metricRun(r.runId!))?.status).toBe('failed');
  }
  const stage={...db,stageMetricRows:async()=>{throw new Error('staging down');}} as IndustryDb;
  const s=await runIndustryAggregation({...deps,db:stage},OPTS);
  expect(s).toMatchObject({status:'failed',code:'compute_failed',batchStatus:'failed'});
  expect((await db.metricRun(s.runId!))?.status).toBe('failed');
  expect(await db.activeMetricRun('sw2021','2021',1)).toBeNull();
 });
});
