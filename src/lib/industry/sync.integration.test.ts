// src/lib/industry/sync.integration.test.ts
// Plan Task 14 / spec §13.3 offline integration on real PostgreSQL (critical; valuation parts excluded —
// I-3 is deferred). pgIndustryDb + pgFactsDb + pgTableClient over the test:db instance, manifests in a
// memory ManifestStore whose index rows go to industry_manifests through the real put_industry_manifest.
// Fixture fixtures/facts/cn-aggregate.json: two SW2021 test level-3 nodes (food under 801120.SI, banks
// under 801780.SI) × four period_ends, five issuers, one unresolved source record.
// Isolation (test:db runs suites in parallel on one database): every code, ticker, org id and issuer id
// is suite-specific (T14.*, 6889xx/3009xx/9209xx), and the runs use level 3 — the (sw2021, 2021, 3) run
// slot is reserved for this suite (other suites must not create level-3 metric runs).
// Membership seeding drives the IndustryDb contract (upsertSourceMemberships → applyMemberships), i.e.
// the same RPCs Task 7/8's runMembershipsSw / applyResolutions call; CN facts are published through the
// plan-2 write path (claimLease → beginRun → stageFilings → stageFacts → publishRun → releaseLease).
// The cases SHARE STATE and run in order: first run → manifest-only replay → later filing → reuse →
// out_date correction → marks. Do not reorder them.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {MAPPING_GEN,MAPPING_VERSION} from '../facts/concepts';
import {pgFactsDb} from '../facts/pg-facts-db';
import type {Duration,FactInsert,FactsDb,FilingInsert} from '../facts/types';
import {sha256Hex} from './canonical-json';
import {decCmp,decMul} from './decimal';
import {decodeManifest,memoryManifestStore} from './manifest';
import {planMarkRows,runMarks} from './marks';
import type {DailyBasicFetch} from './marks';
import {pgIndustryDb} from './pg-industry-db';
import {fetchDailyBasic,fixtureTushareCall} from './providers/tushare-industry';
import {replayFromManifest} from './replay';
import {windowEnd} from './resolve-memberships';
import {claimSicScopeRow,finishSicScopeRow} from './sic';
import {runIndustryAggregation} from './run-aggregation';
import type {AggregationOptions,AggregationReceipt} from './run-aggregation';
import type {ClassificationRow,IndustryDb,IndustryDeps,MetricCellRow} from './types';

const enabled=!!process.env.S4_TEST_STATE;
interface Fixture{
 facts_as_of:string;history_start:string;level:number;
 classifications:{code:string;level:number;parent_code:string|null;name_zh:string}[];
 issuers:{key:string;issuer_id:string;ticker:string;name:string;org_id:string}[];
 source_memberships:{ts_code:string;issuer:string|null;l1_code:string;l2_code:string;l3_code:string;in_date:string;out_date:string|null}[];
 reports:Record<string,{period_end:string;available_date:string;values:Record<string,string>}[]>;
 later_filing:{issuer:string;report_type:string;period_end:string;available_date:string;values:Record<string,string>};
 out_date_correction:{ts_code:string;out_date:string};
}
const FX=JSON.parse(readFileSync(new URL('./fixtures/facts/cn-aggregate.json',import.meta.url),'utf8')) as Fixture;
const FOOD='T14.L3.FOOD',BANK='T14.L3.BANK';
const ID=Object.fromEntries(FX.issuers.map(i=>[i.key,i.issuer_id])) as Record<string,string>;
const TICKER=Object.fromEntries(FX.issuers.map(i=>[i.key,i.ticker])) as Record<string,string>;
const OPTS:AggregationOptions={scheme:'sw2021',version:'2021',level:FX.level,factsAsOf:FX.facts_as_of,historyStart:FX.history_start,codes:[FOOD,BANK]};
// Landed behaviour (fix batches): `codes` only SELECTS groups that are always recomputed; the published grid is always every code at the level.
// Reuse scenarios therefore run without `codes` (reuse whenever the fingerprint/dependency set allows).
const REUSE_OPTS:AggregationOptions={scheme:'sw2021',version:'2021',level:FX.level,factsAsOf:FX.facts_as_of,historyStart:FX.history_start};
const DUR:Record<string,Duration>={'03':'3M','06':'6M','09':'9M','12':'12M'};
const FORM={'03':'q1','06':'semiannual','09':'q3','12':'annual'} as const;
const FP={'03':'Q1','06':'H1','09':'9M','12':'FY'} as const;
const SOURCE='tushare:index_member_all';

/** Plan-2 write path for one issuer: lease → run → filings → facts → publish → release (an empty report list publishes an empty run). */
async function publishCn(facts:FactsDb,tables:TableClient,key:string,reports:Fixture['reports'][string],reportType='1'){
 const issuer=ID[key],ticker=TICKER[key];
 const {batchId}=await startBatch(tables,{producer:'test-industry-facts',dataset:'facts.cn.t14'});
 await facts.reconcileScope('CN',[{issuer_id:issuer,reasons:['test:t14'],priority:10,fetch_key:ticker}]);
 expect(await facts.claimLease(issuer,'CN',batchId,600)).toBe(true);
 const run=await facts.beginRun(issuer,'CN',batchId,MAPPING_GEN);
 const filings:FilingInsert[]=reports.map(r=>{const mm=r.period_end.slice(5,7) as keyof typeof FORM;return {filing_id:randomUUID(),issuer_id:issuer,
  sourceRef:`${ticker}:${r.period_end.replaceAll('-','')}:${reportType}:${r.available_date.replaceAll('-','')}`,market:'CN',source:'tushare',origin:ticker.endsWith('.SH')?'sse':ticker.endsWith('.SZ')?'szse':'bse',
  formType:reportType==='1'?FORM[mm]:'restatement',fiscalYear:Number(r.period_end.slice(0,4)),fiscalPeriod:FP[mm],periodEnd:r.period_end,availableDate:r.available_date,url:null};});
 const ids=filings.length>0?await facts.stageFilings(run,filings):new Map<string,string>();
 const rows:FactInsert[]=reports.flatMap((r,i)=>Object.entries(r.values).map(([concept,value])=>{const instant=concept==='equity_parent';return {fact_id:randomUUID(),issuer_id:issuer,market:'CN' as const,filing_id:ids.get(filings[i].sourceRef)!,concept,
  source_concept:`t14.${concept}`,statement:instant?'BS' as const:'IS' as const,period_start:instant?null:`${r.period_end.slice(0,4)}-01-01`,period_end:r.period_end,duration:instant?'INSTANT' as const:DUR[r.period_end.slice(5,7)],
  value,unit:'CNY',consolidation:'consolidated' as const,available_date:r.available_date,mapping_gen:MAPPING_GEN,mapping_version:MAPPING_VERSION,raw_hash:sha256Hex(`t14:${ticker}:${r.period_end}:${concept}:${reportType}`)};}));
 if(rows.length>0)await facts.stageFacts(run,rows);
 await facts.publishRun(run,[...ids.values()]);
 await facts.releaseLease(issuer,'CN',batchId,'success',new Date(Date.now()+7*86_400_000).toISOString());
 await finishBatch(tables,batchId,{counts:{...emptyCounts(),fetched:rows.length,inserted:rows.length},errors:[]});
}
const cellOf=(rows:MetricCellRow[],code:string,metric:string,duration:string,pe:string)=>{const r=rows.find(x=>x.code===code&&x.metric===metric&&x.duration===duration&&x.period_end===pe);expect(r,`${code} ${metric} ${duration} ${pe}`).toBeDefined();return r!;};

describe.skipIf(!enabled)('industry offline integration on real PostgreSQL (Task 14)',()=>{
 let admin:Pool;let tables:TableClient;let db:IndustryDb;let facts:FactsDb;let manifests:ReturnType<typeof memoryManifestStore>;let deps:IndustryDeps;let batch:string;
 const runs:AggregationReceipt[]=[];
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  tables=pgTableClient(admin);db=pgIndustryDb(admin);facts=pgFactsDb(admin);manifests=memoryManifestStore(db);
  deps={tables,db,facts,manifests,now:()=>new Date(),codeVersion:'t14-industry-sync'};
  // issuers, A-share securities and universe rows (FK order); the unresolved ticker gets a universe row only
  for(const i of FX.issuers){
   await admin.query(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'A') on conflict (ticker) do nothing`,[i.ticker,i.name]);
   await admin.query(`insert into public.issuers(issuer_id,canonical_name_zh,country_code,cninfo_org_id) values($1,$2,'CN',$3) on conflict do nothing`,[i.issuer_id,i.name,i.org_id]);
   await admin.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'A',true,'2015-01-05','test:t14') on conflict do nothing`,[i.issuer_id,i.ticker]);
  }
  ({batchId:batch}=await startBatch(tables,{producer:'test-industry',dataset:'industry.t14'}));
  const tree:ClassificationRow[]=FX.classifications.map(c=>({scheme:'sw2021',version:'2021',code:c.code,level:c.level,name_zh:c.name_zh,name_en:null,parent_code:c.parent_code,attributes:{}}));
  await db.upsertClassifications(batch,tree);
  await db.upsertSourceMemberships(batch,FX.source_memberships.map(m=>({source:SOURCE,ts_code:m.ts_code,name:null,l1_code:m.l1_code,l2_code:m.l2_code,l3_code:m.l3_code,in_date:m.in_date,out_date:m.out_date,observed_at:'2025-05-01T00:00:00.000Z',raw_hash:sha256Hex(`t14:member:${m.ts_code}`),locator:{api:'index_member_all',is_new:'Y',ts_code:m.ts_code}})));
  const current=await db.currentSourceMemberships({});
  for(const m of FX.source_memberships){
   if(m.issuer===null)continue;
   const src=current.find(s=>s.ts_code===m.ts_code&&s.l3_code===m.l3_code)!;
   const provenance={availability:'effective_date_assumed' as const,source_membership_id:src.id,raw_hash:src.raw_hash,locator:src.locator};
   await db.applyMemberships(batch,ID[m.issuer],'sw2021','2021',[[m.l1_code,1],[m.l2_code,2],[m.l3_code,3]].map(([code,level])=>({code:code as string,level:level as number,valid_from:m.in_date,valid_to:windowEnd(m.out_date,null),available_date:m.in_date,valid_to_available_date:windowEnd(m.out_date,null),source:SOURCE,provenance})),[src.id],{method:'today',resolved_at:new Date().toISOString()});
  }
  for(const i of FX.issuers)await publishCn(facts,tables,i.key,FX.reports[i.key]);
 },120_000);
 afterAll(async()=>{
  // retire this suite's scope rows so no scheduled CN path of another suite picks them up (facts are append-only)
  if(facts)await facts.reconcileScope('CN',FX.issuers.map(i=>({issuer_id:i.issuer_id,reasons:[],priority:0,fetch_key:i.ticker}))).catch(()=>{});
  await admin?.end();
 });

 it('first run: point-in-time members, whole-method cells, missing stays missing, one dependency per member, activated',async()=>{
  const r=await runIndustryAggregation(deps,OPTS);runs.push(r);
  expect(r).toMatchObject({status:'active',batchStatus:'success',historyClass:'reconstruction',groups:8,manifestMismatches:0});
  const run=(await db.metricRun(r.runId!))!;
  expect(run).toMatchObject({status:'active',level:3,facts_as_of:FX.facts_as_of,knowledge_date:FX.facts_as_of,history_class:'reconstruction',code_version:'t14-industry-sync'});
  expect(run.coverage_summary).toMatchObject({facts_scope_ready:true,universe:5,ready:5});
  const rows=await db.metricRowsOfRun(r.runId!);
  expect(rows).toHaveLength(2*(6+6+11+6));
  expect(rows.every(x=>x.updated_at!==null&&new Date(x.updated_at).toISOString()===new Date(run.activated_at!).toISOString())).toBe(true);
  expect(cellOf(rows,FOOD,'revenue_sum','12M','2024-12-31')).toMatchObject({status:'ok',value:'2640',unit:'CNY',n_members:3,n_with_data:2,n_unresolved:1});
  expect(cellOf(rows,FOOD,'revenue_sum','3M','2024-12-31').value).toBe('690');
  expect(cellOf(rows,FOOD,'gross_margin','12M','2024-12-31').value).toBe('0.3720930233');
  expect(cellOf(rows,FOOD,'roe','TTM','2024-12-31').value).toBe('0.0846153846');
  expect(cellOf(rows,FOOD,'roe','TTM','2025-03-31').value).toBe('0.0867924528');
  expect(cellOf(rows,FOOD,'revenue_yoy','3M','2025-03-31').value).toBe('0.0952380952');
  expect(cellOf(rows,FOOD,'member_count','INSTANT','2024-06-30')).toMatchObject({value:'2',n_members:2,n_unresolved:1});
  expect(cellOf(rows,BANK,'gross_margin','12M','2024-12-31')).toMatchObject({status:'missing',missing_reason:'financial_excluded',value:null,manifest_hash:null});
  expect(cellOf(rows,BANK,'revenue_sum','12M','2024-12-31').value).toBe('2080');
  expect(cellOf(rows,BANK,'revenue_sum','3M','2024-12-31')).toMatchObject({status:'missing',missing_reason:'empty_set',value:null});
  const dependencies=await db.runDependencies('aggregate',r.runId!);
  expect(dependencies.filter(d=>d.cell_key===`${FOOD}:2024-12-31`).map(d=>d.issuer_id).sort()).toEqual([ID.F1,ID.F2,ID.F3].sort());
  const revs=new Map((await facts.scopeRows('CN',Object.values(ID))).map(s=>[s.issuer_id,s.state_rev]));
  for(const d of dependencies)expect(d.state_rev).toBe(revs.get(d.issuer_id));
 },120_000);

 it('replays every stored cell from the manifests alone (no database reads): reproduced and equal to the stored values',async()=>{
  const rows=await db.metricRowsOfRun(runs[0].runId!);
  // "drop the database": copy the manifest objects out of the store, then use nothing but those bytes
  const pathOf=new Map<string,string>();
  for(const h of new Set(rows.filter(x=>x.status==='ok').map(x=>x.manifest_hash!)))pathOf.set(h,(await db.manifestObjectPath(h))!);   // incarnation keys, read before "dropping" the database
  const offline=new Map([...manifests.objects].map(([p,b])=>[p,new Uint8Array(b)]));
  const byHash=new Map<string,ReturnType<typeof replayFromManifest>>();
  for(const row of rows.filter(x=>x.status==='ok')){
   const h=row.manifest_hash!;
   if(!byHash.has(h))byHash.set(h,replayFromManifest(decodeManifest(offline.get(pathOf.get(h)!)!,h)));
   const rep=byHash.get(h)!;
   expect(rep.reproduced).toBe(true);
   expect(rep.cells.find(c=>c.metric===row.metric&&c.duration===row.duration&&c.period_start===row.period_start)?.value_text).toBe(row.value);
  }
  expect(byHash.size).toBe(8);
  // every ok manifest hash has an index row in industry_manifests
  const idx=await admin.query(`select manifest_hash from public.industry_manifests where manifest_hash = any($1::text[])`,[[...byHash.keys()]]);
  expect(idx.rowCount).toBe(8);
 },120_000);

 it('a later filing changes the recompute: new run, new values, later updated_at; untouched groups keep their manifests; the old manifest still replays the old value',async()=>{
  const lf=FX.later_filing;
  await publishCn(facts,tables,lf.issuer,[{period_end:lf.period_end,available_date:lf.available_date,values:lf.values}],lf.report_type);
  const r=await runIndustryAggregation(deps,OPTS);runs.push(r);
  expect(r).toMatchObject({status:'active',generation:runs[0].generation!+1});
  const before=await db.metricRowsOfRun(runs[0].runId!),after=await db.metricRowsOfRun(r.runId!);
  const oldCell=cellOf(before,FOOD,'revenue_sum','12M','2024-12-31'),newCell=cellOf(after,FOOD,'revenue_sum','12M','2024-12-31');
  expect(newCell).toMatchObject({value:'2660',n_with_data:2});                                   // 900 + 1760
  expect(newCell.manifest_hash).not.toBe(oldCell.manifest_hash);
  expect(Date.parse(newCell.updated_at!)).toBeGreaterThan(Date.parse(oldCell.updated_at!));
  expect(cellOf(after,FOOD,'revenue_yoy','12M','2024-12-31').value).toBe('0.1083333333');        // (2660-2400)/2400
  expect(cellOf(after,FOOD,'revenue_sum','3M','2024-12-31')).toMatchObject({value:'460',n_with_data:1});   // F1's Q4 is version-inconsistent now
  const m=await manifests.get(cellOf(after,FOOD,'revenue_sum','3M','2024-12-31').manifest_hash!);
  expect(m.roles.find(x=>x.issuer_id===ID.F1&&x.metric==='revenue_sum'&&x.duration==='3M')).toMatchObject({role:'excluded',reason:'version_inconsistent'});
  // the old run's manifest is immutable evidence: it still replays to the old value
  const old=replayFromManifest(await manifests.get(oldCell.manifest_hash!));
  expect(old.reproduced).toBe(true);
  expect(old.cells.find(c=>c.metric==='revenue_sum'&&c.duration==='12M')?.value_text).toBe('2640');
  // banks did not change: same manifests (reused)
  expect(cellOf(after,BANK,'revenue_sum','12M','2024-12-31').manifest_hash).toBe(cellOf(before,BANK,'revenue_sum','12M','2024-12-31').manifest_hash);
  expect((await db.metricRun(runs[0].runId!))?.status).toBe('superseded');
 },120_000);

 it('a second run with unchanged state_rev reuses every manifest hash and copies the dependencies',async()=>{
  const r=await runIndustryAggregation(deps,REUSE_OPTS);runs.push(r);
  expect(r).toMatchObject({status:'active',reusedGroups:8});
  expect((await db.metricRun(r.runId!))?.reused_from_run).toBe(runs[1].runId);
  const key=(x:MetricCellRow)=>`${x.code}|${x.metric}|${x.duration}|${x.period_end}|${x.status}|${x.value}|${x.manifest_hash}`;
  expect((await db.metricRowsOfRun(r.runId!)).map(key).sort()).toEqual((await db.metricRowsOfRun(runs[1].runId!)).map(key).sort());
  const dk=(d:{cell_key:string;issuer_id:string;state_rev:number})=>`${d.cell_key}|${d.issuer_id}|${d.state_rev}`;
  expect((await db.runDependencies('aggregate',r.runId!)).map(dk).sort()).toEqual((await db.runDependencies('aggregate',runs[1].runId!)).map(dk).sort());
 },120_000);

 it('an out_date correction supersedes the old membership rows and changes membership in the next run',async()=>{
  const c=FX.out_date_correction;const m=FX.source_memberships.find(x=>x.ts_code===c.ts_code)!;
  const up=await db.upsertSourceMemberships(batch,[{source:SOURCE,ts_code:m.ts_code,name:null,l1_code:m.l1_code,l2_code:m.l2_code,l3_code:m.l3_code,in_date:m.in_date,out_date:c.out_date,observed_at:'2025-05-10T00:00:00.000Z',raw_hash:sha256Hex(`t14:member:${m.ts_code}:out`),locator:{api:'index_member_all',is_new:'N',ts_code:m.ts_code}}]);
  expect(up).toMatchObject({superseded:1});
  expect(up.changed).toHaveLength(1);expect(up.changed[0].nullToDate).toBe(true);
  const fresh=(await db.currentSourceMemberships({})).find(s=>s.id===up.changed[0].new_id)!;
  expect(fresh.issuer_id).toBeNull();
  const provenance={availability:'effective_date_assumed' as const,source_membership_id:fresh.id,raw_hash:fresh.raw_hash,locator:fresh.locator};
  const applied=await db.applyMemberships(batch,ID[m.issuer!],'sw2021','2021',[[m.l1_code,1],[m.l2_code,2],[m.l3_code,3]].map(([code,level])=>({code:code as string,level:level as number,valid_from:m.in_date,valid_to:windowEnd(c.out_date,null),available_date:m.in_date,valid_to_available_date:windowEnd(c.out_date,null),source:SOURCE,provenance})),[fresh.id],{method:'today',resolved_at:new Date().toISOString()});
  expect(applied).toMatchObject({inserted:3,superseded:3});
  const l3=(await admin.query(`select membership_id, status, superseded_by, valid_to::text as valid_to, valid_to_available_date::text as vta from public.issuer_industry_memberships where issuer_id = $1 and level = 3 order by status`,[ID[m.issuer!]])).rows;
  expect(l3.map(x=>x.status)).toEqual(['ok','superseded']);
  expect(l3[1].superseded_by).toBe(l3[0].membership_id);                                            // history kept, pointing at its replacement
  expect(l3[0]).toMatchObject({valid_to:windowEnd(c.out_date,null),vta:windowEnd(c.out_date,null)});   // K3: out_date + 1 day
  const r=await runIndustryAggregation(deps,REUSE_OPTS);runs.push(r);
  expect(r.status).toBe('active');
  const rows=await db.metricRowsOfRun(r.runId!);
  expect(cellOf(rows,FOOD,'member_count','INSTANT','2025-03-31')).toMatchObject({value:'2'});      // F2's last member day was 2025-01-15
  expect(cellOf(rows,FOOD,'member_count','INSTANT','2024-12-31')).toMatchObject({value:'3'});
  expect(r.reusedGroups).toBe(4);                                                                    // food groups changed (F2 window), banks reused
 },120_000);

 it('marks on PostgreSQL: A → B → A gives three observations with the third current; a retried event stays a duplicate (V7)',async()=>{
  // the recorded daily_basic rows of three real tickers (Task 5 fixtures), re-keyed to this suite's tickers
  const map:Record<string,string>={'600519.SH':TICKER.F1,'000858.SZ':TICKER.F2,'603288.SH':TICKER.F3};
  const pages=await fetchDailyBasic(fixtureTushareCall(),{tradeDate:'20261030'},{sleep:async()=>{}});
  const day='2026-10-30';
  const fetchOf=(closeF1:string|null):DailyBasicFetch=>({trade_date:day,pages:pages.length,rows:pages.flatMap(p=>p.rows.flatMap((r,i)=>{const t=map[r.ts_code];if(!t)return [];
   const close=t===TICKER.F1&&closeF1?closeF1:r.close;   // B: synthetic edit of a real response (close revised, total_mv kept consistent)
   return [{...r,ts_code:t,close,total_mv:t===TICKER.F1&&closeF1?decMul(closeF1,r.total_share!):r.total_mv,page:p.page,row:i,page_sha256:p.raw_hash}];}))});
  const A=()=>fetchOf(null),B=()=>fetchOf('1392.06');
  const mdeps=(f:()=>DailyBasicFetch)=>({tables,db,now:()=>new Date(),codeVersion:'t14-industry-sync',fetchDailyBasic:async()=>f()});
  const e1=(await runMarks(mdeps(A),{tradeDates:[day]})).dates[0];
  expect(e1.result).toEqual({inserted:3,duplicates:0,superseded:0});
  const e2=(await runMarks(mdeps(A),{tradeDates:[day]})).dates[0];
  expect(e2.result).toEqual({inserted:0,duplicates:3,superseded:0});
  const e3=(await runMarks(mdeps(B),{tradeDates:[day]})).dates[0];
  expect(e3.result).toEqual({inserted:0,duplicates:2,superseded:1});
  const e4=(await runMarks(mdeps(A),{tradeDates:[day]})).dates[0];
  expect(e4.result).toEqual({inserted:0,duplicates:2,superseded:1});
  const cur=await db.currentMarksOn(day,[TICKER.F1]);
  expect(cur).toHaveLength(1);
  expect(cur[0]).toMatchObject({close:'1392.05',total_share:'1250081601',free_share:'568798666',fetch_event_id:e4.fetch_event_id,upstream:'sse',status:'ok'});
  expect(decCmp(cur[0].market_cap,'1740176092672.05')).toBe(0);                                   // generated close × total_share
  const all=await admin.query(`select status, fetch_event_id from public.security_marks where ticker = $1 and trade_date = $2 order by created_at`,[TICKER.F1,day]);
  expect(all.rows.map(x=>x.status)).toEqual(['superseded','superseded','ok']);
  expect(new Set(all.rows.map(x=>x.fetch_event_id)).size).toBe(3);
  // V7: retrying E2 (unchanged A) after E3/E4 is a duplicate and changes nothing
  await db.retryFetchEvent(e2.fetch_event_id!);
  const universe=new Set(Object.values(TICKER));
  expect(await db.applyObservations('marks',e2.fetch_event_id!,planMarkRows(A(),universe).rows)).toEqual({inserted:0,duplicates:3,superseded:0});
  expect((await db.currentMarksOn(day,[TICKER.F1]))[0].fetch_event_id).toBe(e4.fetch_event_id);
  await expect(db.applyObservations('marks',e2.fetch_event_id!,planMarkRows(B(),universe).rows)).rejects.toMatchObject({code:'fetch_event_payload_changed'});
 },120_000);

 it('SIC scope leases on two connections (Codex round 1 #6): one concurrent claim wins; the loser can neither complete nor clear the lease',async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  const p1=new Pool({connectionString:state.adminUrl,max:1}),p2=new Pool({connectionString:state.adminUrl,max:1});
  try{
   const t1=pgTableClient(p1),t2=pgTableClient(p2);
   const issuer=ID.B2;const now=new Date();
   await admin.query(`delete from public.industry_sync_scope where issuer_id=$1 and job='sic'`,[issuer]);
   await t1.insert('industry_sync_scope',{issuer_id:issuer,job:'sic',next_due_at:new Date(now.getTime()-60_000).toISOString(),lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:new Date(now.getTime()-60_000).toISOString()});
   const [r1]=await t1.select('industry_sync_scope',{issuer_id:issuer,job:'sic'});const [r2]=await t2.select('industry_sync_scope',{issuer_id:issuer,job:'sic'});
   const a=randomUUID(),b=randomUUID();
   const won=await Promise.all([claimSicScopeRow(t1,r1,a,now),claimSicScopeRow(t2,r2,b,now)]);
   expect(won.filter(Boolean)).toHaveLength(1);
   const [winner,loser,lt]=won[0]?[a,b,t2]:[b,a,t1];
   expect(await finishSicScopeRow(lt,issuer,loser,{last_status:'success',last_attempt_at:now.toISOString(),updated_at:now.toISOString()})).toBe(false);
   expect((await admin.query(`select lease_batch_id::text b, last_status s from public.industry_sync_scope where issuer_id=$1 and job='sic'`,[issuer])).rows[0]).toEqual({b:winner,s:null});
   expect(await finishSicScopeRow(won[0]?t1:t2,issuer,winner,{last_status:'success',last_attempt_at:now.toISOString(),updated_at:now.toISOString()})).toBe(true);
   expect((await admin.query(`select lease_batch_id b, lease_until u, last_status s from public.industry_sync_scope where issuer_id=$1 and job='sic'`,[issuer])).rows[0]).toEqual({b:null,u:null,s:'success'});
   await admin.query(`delete from public.industry_sync_scope where issuer_id=$1 and job='sic'`,[issuer]);
  }finally{await p1.end();await p2.end();}
 },60_000);
});
