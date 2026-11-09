// src/lib/industry/jobs.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const runners=vi.hoisted(()=>({loadAShare:vi.fn(),universe:vi.fn(),reconcile:vi.fn(),swClass:vi.fn(),sw:vi.fn(),resolve:vi.fn(),sicClass:vi.fn(),sic:vi.fn(),marks:vi.fn(),agg:vi.fn()}));
vi.mock('./load-a-share',()=>({runLoadAShare:runners.loadAShare}));
vi.mock('./facts-scope',()=>({industryCnUniverse:runners.universe}));
vi.mock('../facts/scope',()=>({reconcileScope:runners.reconcile}));
vi.mock('./classifications',()=>({runClassificationsSw:runners.swClass}));
vi.mock('./source-memberships',()=>({runMembershipsSw:runners.sw}));
vi.mock('./resolve-memberships',()=>({runResolveMemberships:runners.resolve}));
vi.mock('./sic',()=>({runClassificationsSic:runners.sicClass,runMembershipsSic:runners.sic}));
vi.mock('./marks',()=>({runMarks:runners.marks}));
vi.mock('./run-aggregation',()=>({runIndustryAggregation:runners.agg}));
vi.mock('./memberships',()=>({isMemberAt:()=>true}));
vi.mock('./replay',()=>({replayFromManifest:vi.fn((m:{cells:unknown[]})=>({cells:m.cells,reproduced:true,mismatches:[]}))}));
vi.mock('../supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('./db',()=>({supabaseIndustryDb:()=>({})}));
vi.mock('./manifest',()=>({supabaseManifestStore:()=>({})}));

import {RUN_ID,cellRow,manifestOf,missingCell,runRow,stubIndustryDb} from './fixture-rows';
import {combineReceipts,jobGate,marksFetcher,parseSyncArgs,replayCheck,runIndustryJob,sampleCells} from './jobs';
import type {IndustryJobDeps} from './jobs';
import {fixtureTushareCall} from './providers/tushare-industry';

const C=(o:Record<string,number>={})=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0,...o});
const BATCH=(o:Record<string,unknown>={})=>({status:'success',batchId:'b',counts:C({inserted:1}),errors:[],exitCode:0,...o});
const deps={now:()=>new Date('2026-11-07T03:00:00.000Z'),tables:{tag:'tables'},scopeDb:{tag:'scope'}} as unknown as IndustryJobDeps;

describe('runIndustryJob (adapts each runner of Tasks 5–13 to a RunnerReceipt)',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  runners.loadAShare.mockResolvedValue({status:'success',batchId:'b',plan:{candidates:3,skipped:{},rejected:{}},apply:{counts:C({inserted:3}),errors:[],skippedSummary:{},rejectedSummary:{},issuers:{created:3,backfilled:0},lookups:0},exitCode:0});
  for(const f of [runners.swClass,runners.sw,runners.resolve,runners.sicClass])f.mockResolvedValue(BATCH());
  runners.sic.mockResolvedValue({...BATCH(),processed:5,added:2});
  runners.marks.mockResolvedValue({status:'done',batchId:'m',batchStatus:'partial',counts:C({fetched:7,inserted:5,failed:1}),errors:[{code:'rejected_summary',key:'2026-10-30'}],dates:[]});
  runners.agg.mockResolvedValue({status:'active',batchId:'a',batchStatus:'success',runId:RUN_ID,generation:2,activatedAt:'x',historyClass:'reconstruction',groups:8,reusedGroups:5,cells:{ok:30,missing:28},manifestMismatches:0,truncatedIssuers:[]});
  runners.universe.mockResolvedValue([{issuer_id:'i'}]);
  runners.reconcile.mockResolvedValue({desired:10,retired:1,changed:2,skipped:{no_cn_ticker:1}});
 });
 it('load-a-share: apply semantics, --limit caps the org-id lookups',async()=>{
  expect(await runIndustryJob('load-a-share',deps,{dryRun:false,triggeredBy:'cron',limit:50})).toEqual({job:'load-a-share',receipt:{batchId:'b',status:'success',counts:C({inserted:3}),errors:[]}});
  expect(runners.loadAShare).toHaveBeenCalledWith(deps,{apply:true,triggeredBy:'cron',today:undefined,maxLookups:50});
 });
 it('passes explicit CLI selection through dispatch to the loader',async()=>{
  const parsed=parseSyncArgs(['--job','load-a-share','--ticker','600519.SH','--ticker','000333.SZ']);
  expect(parsed.ok).toBe(true);if(!parsed.ok)throw new Error(parsed.error);
  await runIndustryJob(parsed.args.job,deps,{...parsed.args,dryRun:!parsed.args.apply,triggeredBy:'script'});
  expect(runners.loadAShare.mock.calls[0][1]).toMatchObject({apply:false,tickers:['600519.SH','000333.SZ']});
 });
 it('snapshot store (plan-2 raw-bytes store) is handed to every Tushare page fetcher when deps carry one, and omitted otherwise',async()=>{
  const store={put:vi.fn()};const sd={...deps,snapshots:store} as unknown as IndustryJobDeps;
  await runIndustryJob('load-a-share',sd,{dryRun:false,triggeredBy:'script'});
  expect(runners.loadAShare.mock.calls[0][1].snapshots).toEqual({store});
  await runIndustryJob('memberships-sw',sd,{dryRun:false,triggeredBy:'script'});
  expect(runners.swClass.mock.calls[0][1].snapshots).toEqual({store});
  expect(runners.sw.mock.calls[0][1].snapshots).toEqual({store});
  await runIndustryJob('load-a-share',deps,{dryRun:false,triggeredBy:'script'});
  expect('snapshots' in runners.loadAShare.mock.calls[1][1]).toBe(false);
 });
 it('marks: the daily_basic pages are stored as evidence too (page_sha256 resolves to a stored object)',async()=>{
  const put=vi.fn().mockResolvedValue('stored');
  await runIndustryJob('marks',{...deps,tushare:fixtureTushareCall(),snapshots:{put}} as unknown as IndustryJobDeps,{dryRun:false,triggeredBy:'script',tradeDates:['2026-10-30']});
  await runners.marks.mock.calls[0][0].fetchDailyBasic('2026-10-30');
  expect(put).toHaveBeenCalledTimes(1);
  expect(put.mock.calls[0][1]).toMatch(/^tushare\/[0-9a-f-]{36}\/[0-9a-f]{64}\.json$/);
 });
 it('memberships-sw apply: the resolver gets the snapshot capture too (stock_basic D evidence)',async()=>{
  const snapshots={put:vi.fn()};
  await runIndustryJob('memberships-sw',{...deps,snapshots} as unknown as IndustryJobDeps,{dryRun:false,triggeredBy:'script'});
  expect(runners.resolve).toHaveBeenCalledWith(expect.anything(),{triggeredBy:'script',today:undefined,snapshots:{store:snapshots}});
 });
 it('memberships-sw: classifications → source → resolution on apply; only the source plan on a dry run',async()=>{
  const r=await runIndustryJob('memberships-sw',deps,{dryRun:false,triggeredBy:'script',l1Codes:['801120.SI']});
  expect(runners.sw).toHaveBeenCalledWith(deps,{apply:true,l1Codes:['801120.SI'],triggeredBy:'script'});
  expect(runners.resolve).toHaveBeenCalledWith(deps,{triggeredBy:'script',today:undefined});
  expect('receipt' in r&&r.receipt).toMatchObject({status:'success',counts:{'classifications.inserted':1,'source.inserted':1,'memberships.inserted':1}});
  vi.clearAllMocks();runners.sw.mockResolvedValue({...BATCH({status:'dry_run',batchId:null}),plans:[]});
  expect(await runIndustryJob('memberships-sw',deps,{dryRun:true,triggeredBy:'script'})).toMatchObject({receipt:{status:'dry_run',batchId:null}});
  expect(runners.swClass).not.toHaveBeenCalled();expect(runners.resolve).not.toHaveBeenCalled();
  runners.swClass.mockResolvedValue(BATCH({status:'failed',errors:[{code:'tushare_error'}]}));
  const f=await runIndustryJob('memberships-sw',deps,{dryRun:false,triggeredBy:'cron'});
  expect(f).toMatchObject({receipt:{status:'failed',errors:[{code:'tushare_error',key:'classifications'}]}});
  expect(runners.resolve).not.toHaveBeenCalled();
 });
 it('memberships-sic: classifications then memberships; no dry run',async()=>{
  const r=await runIndustryJob('memberships-sic',deps,{dryRun:false,triggeredBy:'cron',limit:100});
  expect(runners.sic).toHaveBeenCalledWith(deps,{limit:100,triggeredBy:'cron'});
  expect(r).toMatchObject({receipt:{status:'success',counts:{'memberships.processed':5,'memberships.added':2}}});
  expect(await runIndustryJob('memberships-sic',deps,{dryRun:true,triggeredBy:'script'})).toMatchObject({receipt:{status:'dry_run',errors:[{code:'dry_run_unsupported'}]}});
 });
 it('marks: needs explicit trade dates, wires the daily_basic adapter, maps the batch status',async()=>{
  expect(await runIndustryJob('marks',deps,{dryRun:false,triggeredBy:'cron'})).toMatchObject({receipt:{status:'failed',errors:[{code:'trade_dates_required'}]}});
  const r=await runIndustryJob('marks',{...deps,tushare:fixtureTushareCall()},{dryRun:false,triggeredBy:'script',tradeDates:['2026-10-30']});
  expect(r).toMatchObject({receipt:{batchId:'m',status:'partial',counts:{inserted:5,failed:1}}});
  const [md,mo]=runners.marks.mock.calls[0];
  expect(mo).toEqual({tradeDates:['2026-10-30'],triggeredBy:'script'});
  expect(typeof md.fetchDailyBasic).toBe('function');
 });
 it('facts-scope: dry run computes the industry universe only; apply reconciles the CN scope',async()=>{
  expect(await runIndustryJob('facts-scope',deps,{dryRun:true,triggeredBy:'script',today:'2026-11-07'})).toMatchObject({receipt:{status:'dry_run',counts:{industry_universe:1}}});
  expect(runners.universe).toHaveBeenCalledWith(deps.tables,'2026-11-07',{});
  expect(runners.reconcile).not.toHaveBeenCalled();
  expect(await runIndustryJob('facts-scope',deps,{dryRun:false,triggeredBy:'script'})).toMatchObject({receipt:{status:'success',counts:{desired:10,retired:1,changed:2,'skipped.no_cn_ticker':1}}});
  expect(runners.reconcile).toHaveBeenCalledWith({tables:deps.tables,db:deps.scopeDb},'CN',{today:'2026-11-07'});
 });
 it('aggregate: level 1, factsAsOf defaults to today (UTC); failures carry the run code',async()=>{
  expect(await runIndustryJob('aggregate',deps,{dryRun:false,triggeredBy:'script'})).toMatchObject({job:'aggregate',receipt:{batchId:'a',status:'success',counts:{groups:8,reused_groups:5,cells_ok:30}}});
  expect(runners.agg).toHaveBeenCalledWith(deps,{scheme:'sw2021',version:'2021',level:1,factsAsOf:'2026-11-07',triggeredBy:'script'});
  runners.agg.mockResolvedValueOnce({status:'failed',code:'facts_scope_not_ready',batchId:'a',batchStatus:'failed',runId:RUN_ID,generation:3,activatedAt:null,historyClass:'reconstruction',groups:8,reusedGroups:0,cells:{ok:0,missing:0},manifestMismatches:0,truncatedIssuers:[]});
  expect(await runIndustryJob('aggregate',deps,{dryRun:false,triggeredBy:'cron'})).toMatchObject({receipt:{status:'failed',errors:[{code:'facts_scope_not_ready',key:RUN_ID}]}});
  expect(await runIndustryJob('aggregate',deps,{dryRun:true,triggeredBy:'script'})).toMatchObject({receipt:{status:'dry_run',errors:[{code:'dry_run_unsupported'}]}});
 });
 it('official and valuation are deferred (I-3) and touch nothing',async()=>{
  expect(await runIndustryJob('official',deps,{dryRun:false,triggeredBy:'cron'})).toEqual({job:'official',skipped:'deferred_i3'});
  expect(await runIndustryJob('valuation',deps,{dryRun:false,triggeredBy:'cron'})).toEqual({job:'valuation',skipped:'deferred_i3'});
  for(const f of Object.values(runners))expect(f).not.toHaveBeenCalled();
 });
});

describe('combineReceipts / marksFetcher',()=>{
 it('worst status wins; counts and error keys are prefixed by step',()=>{
  expect(combineReceipts([{name:'a',receipt:{batchId:'1',status:'success',counts:{x:1},errors:[]}},{name:'b',receipt:{batchId:'2',status:'partial',counts:{x:2},errors:[{code:'e',key:'k'}]}}]))
   .toEqual({batchId:'2',status:'partial',counts:{'a.x':1,'b.x':2},errors:[{code:'e',key:'b:k'}]});
 });
 it('adapts the Task 5 daily_basic pages (real recordings of 2026-10-30) to the marks fetch: decimals as strings, free_share, page sha256, row index',async()=>{
  const f=await marksFetcher(fixtureTushareCall())('2026-10-30');
  expect(f).toMatchObject({trade_date:'2026-10-30',pages:1});
  expect(f.rows).toHaveLength(10);
  expect(f.rows[0]).toMatchObject({ts_code:'000001.SZ',trade_date:'20261030',close:'11.64',total_share:'1940591.8198',free_share:'816056.5553',total_mv:'22588488.7848',page:1,row:0});
  expect(f.rows[0].page_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(f.rows[9]).toMatchObject({ts_code:'603288.SH',row:9});
 });
});

describe('jobGate',()=>{
 it('Tushare jobs need a token even for a dry run; CN-dependent jobs need their flags only to apply',()=>{
  expect(jobGate('marks',{},{apply:false})?.code).toBe('tushare_unavailable');
  expect(jobGate('marks',{TUSHARE_TOKEN:'t'},{apply:true})).toBeNull();
  expect(jobGate('memberships-sic',{},{apply:true})).toBeNull();
  expect(jobGate('aggregate',{},{apply:false})).toBeNull();
  expect(jobGate('aggregate',{},{apply:true})?.code).toBe('job_disabled');
  expect(jobGate('aggregate',{FACTS_CN_ENABLED:'1'},{apply:true})).toBeNull();
  expect(jobGate('facts-scope',{FACTS_CN_ENABLED:'1'},{apply:true})?.code).toBe('job_disabled');
  expect(jobGate('facts-scope',{FACTS_CN_INDUSTRY_UNIVERSE:'1'},{apply:true})).toBeNull();
  expect(jobGate('valuation',{},{apply:true})).toBeNull();
 });
});

describe('parseSyncArgs',()=>{
 it('parses the documented flags',()=>{
  expect(parseSyncArgs(['--job','marks','--apply','--trade-date','2026-10-30','--trade-date','2026-10-23'])).toEqual({ok:true,args:{job:'marks',apply:true,tradeDates:['2026-10-30','2026-10-23'],l1Codes:[]}});
  expect(parseSyncArgs(['--job','aggregate','--facts-as-of','2026-11-03'])).toMatchObject({ok:true,args:{job:'aggregate',apply:false,factsAsOf:'2026-11-03'}});
  expect(parseSyncArgs(['--job','memberships-sw','--l1','801120.SI'])).toMatchObject({ok:true,args:{l1Codes:['801120.SI']}});
 });
 it('accepts repeatable exact canonical tickers only for load-a-share, with a hard cap',()=>{
  expect(parseSyncArgs(['--job','load-a-share','--ticker','600519.SH','--ticker','000333.SZ','--limit','1'])).toMatchObject({ok:true,args:{tickers:['600519.SH','000333.SZ'],limit:1}});
  expect(parseSyncArgs(['--job','load-a-share',...Array.from({length:10},(_,i)=>['--ticker',`${String(i).padStart(6,'0')}.BJ`]).flat()]).ok).toBe(true);
  for(const value of ['600519','600519.SS','sh600519','600519.sh','600519.SH\n',' 600519.SH','600519.SH,000333.SZ','AAPL',''])
   expect(parseSyncArgs(['--job','load-a-share','--ticker',value]).ok,value).toBe(false);
  for(const argv of [
   ['--job','load-a-share','--ticker'],
   ['--job','marks','--ticker','600519.SH'],
   ['--job','load-a-share','--ticker','600519.SH','--ticker','600519.SH'],
   ['--job','load-a-share',...Array.from({length:11},(_,i)=>['--ticker',`${String(i).padStart(6,'0')}.SZ`]).flat()],
  ])expect(parseSyncArgs(argv).ok).toBe(false);
 });
 it('rejects --limit when the selected job does not consume it',()=>{
  for(const job of ['memberships-sw','facts-scope','marks','aggregate','official','valuation'])
   expect(parseSyncArgs(['--job',job,'--limit','1'])).toEqual({ok:false,error:'--limit is only supported by load-a-share (cninfo lookups) and memberships-sic (issuer processing); it does not bound the whole job'});
  for(const job of ['load-a-share','memberships-sic'])
   expect(parseSyncArgs(['--limit','1','--job',job])).toMatchObject({ok:true,args:{limit:1}});
 });
 it('rejects unknown jobs, flags, missing values and misplaced --recompute-from',()=>{
  for(const argv of [[],['--job','pe'],['--job','marks','--x'],['--job'],['--job','marks','--limit','0'],['--job','marks','--trade-date','20261030'],['--job','aggregate','--recompute-from','2025-01-01'],['--job','memberships-sw','--l1','801120']])
   expect(parseSyncArgs(argv).ok,argv.join(' ')).toBe(false);
  expect(parseSyncArgs(['--job','valuation','--recompute-from','2025-01-01']).ok).toBe(true);
 });
});

describe('replayCheck',()=>{
 it('samples ok cells deterministically and replays each manifest offline',async()=>{
  const cells=[cellRow(),cellRow({metric:'revenue_sum',value:'110',unit:'CNY'}),missingCell({period_end:'2024-12-31',period_start:'2024-01-01'})];
  const db=stubIndustryDb({runs:[runRow()],cells});
  const r=await replayCheck({db,manifests:{get:async()=>manifestOf()}},{sample:50,seed:'w45'});
  expect(r).toEqual({runId:RUN_ID,sampled:2,reproduced:2,mismatches:[]});
  expect(sampleCells(cells,1,'a')).toEqual(sampleCells(cells,1,'a'));
 });
 it('reports value_differs and manifest_unreadable; unknown run',async()=>{
  const db=stubIndustryDb({runs:[runRow()],cells:[cellRow({value:'0.5'}),cellRow({metric:'revenue_sum',value:'110',unit:'CNY',manifest_hash:'f'.repeat(64)})]});
  const r=await replayCheck({db,manifests:{get:async h=>{if(h==='f'.repeat(64))throw new Error('404');return manifestOf();}}},{runId:RUN_ID,sample:10,seed:'s'});
  if('error' in r)throw new Error(r.error);
  expect(r.mismatches.map(m=>[m.metric,m.reason]).sort()).toEqual([['gross_margin','value_differs'],['revenue_sum','manifest_unreadable']]);
  expect(await replayCheck({db,manifests:{get:async()=>manifestOf()}},{runId:'00000000-0000-4000-8000-000000000000',sample:1,seed:'s'})).toEqual({error:'unknown_run'});
 });
});
