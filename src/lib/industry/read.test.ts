// src/lib/industry/read.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {AggregateManifest,FreshnessRow,MembershipRow} from './types';

// memberships.ts (Task 8) and replay.ts (Task 11) are replaced by spec-formula stand-ins so this file
// tests the read models only.
vi.mock('./memberships',()=>({
 isMemberAt:(m:MembershipRow,on:string,knownBy:string)=>{
  const eff=m.valid_to!==null&&m.valid_to_available_date!==null&&m.valid_to_available_date<=knownBy?m.valid_to:null;
  return m.status==='ok'&&m.available_date<=knownBy&&m.valid_from<=on&&(eff===null||eff>on);
 },
}));
vi.mock('./replay',()=>({
 replayFromManifest:vi.fn((m:AggregateManifest)=>({cells:m.cells})),
 replayCell:vi.fn((m:AggregateManifest,k:{metric:string;duration:string;period_start:string})=>({cell:m.cells.find(c=>c.metric===k.metric&&c.duration===k.duration&&c.period_start===k.period_start)??null,reproduced:true,mismatches:[]})),
}));

import {replayCell,replayFromManifest} from './replay';
import {ISSUER_A,ISSUER_B,RUN_ID,cellRow,classRow,factRow,manifestOf,membershipRow,missingCell,readDepsOf,runRow,stubIndustryDb,valuationRow,valuationRunRow} from './fixture-rows';
import {adminReplayView,constituentsView,filterManifest,industryDetailView,industryListView,isEmptyDiff,issuerIndustriesView,manifestDiff,replayView,valuationReplayView} from './read';
import type {ReplayDeps} from './read';

const TREE=[classRow({code:'801120.SI',name_zh:'食品饮料'}),classRow({code:'801080.SI',name_zh:'电子'}),classRow({code:'801124.SI',level:2,name_zh:'食品加工',parent_code:'801120.SI'}),classRow({code:'850111.SI',level:3,name_zh:'白酒Ⅲ',parent_code:'801124.SI'}),
 classRow({scheme:'sic',version:'sec-current',code:'3674',name_zh:null,name_en:'Semiconductors & Related Devices'})];
const FRESH:FreshnessRow[]=[{dataset:'industry.agg.sw2021',status:'fresh',last_ok_at:'2026-11-03T03:10:00.000Z'},{dataset:'industry.sw2021.memberships',status:'fresh',last_ok_at:'2026-10-20T03:10:00.000Z'}];
const listQ={scheme:'sw2021' as const,version:'2021' as const,level:1,metric:'gross_margin' as const,duration:'12M' as const,periods:2};

beforeEach(()=>{vi.mocked(replayFromManifest).mockImplementation(m=>({cells:m.cells,reproduced:true,mismatches:[]}));});

describe('industryListView',()=>{
 it('unlicensed: answers before reading anything else (RLS would return 0 rows anyway)',async()=>{
  const db=stubIndustryDb({public:new Set(),tree:TREE});
  const spy=vi.spyOn(db,'classificationTree');
  expect(await industryListView(readDepsOf(db),listQ)).toEqual({state:'unlicensed',datasetKey:'scheme:sw2021:2021'});
  expect(spy).not.toHaveBeenCalled();
 });
 it('admin preview skips the licence gate and says so',async()=>{
  const v=await industryListView(readDepsOf(stubIndustryDb({public:new Set(),tree:TREE,runs:[runRow()]}),{preview:true}),listQ);
  expect(v).toMatchObject({state:'ok',preview:true});
 });
 it('empty when the scheme is licensed but has no active run',async()=>{
  const v=await industryListView(readDepsOf(stubIndustryDb({tree:TREE,freshness:FRESH})),listQ);
  expect(v).toMatchObject({state:'empty',kind:'aggregate',freshness:'fresh'});
  if(v.state==='empty')expect(v.nodes.map(n=>n.code)).toEqual(['801080.SI','801120.SI']);
 });
 it('ok: L1 nodes, annual period ends only (last `periods`), cells with display state and missing reasons, header',async()=>{
  const cells=[cellRow(),cellRow({period_start:'2024-01-01',period_end:'2024-12-31',value:'0.47',n_with_data:6}),missingCell({code:'801080.SI'}),cellRow({period_start:'2023-01-01',period_end:'2023-12-31'}),cellRow({metric:'gross_margin',duration:'3M',period_start:'2025-07-01',period_end:'2025-09-30'})];
  const v=await industryListView(readDepsOf(stubIndustryDb({tree:TREE,runs:[runRow()],cells,freshness:FRESH})),listQ);
  expect(v.state).toBe('ok');
  if(v.state!=='ok'||v.kind!=='aggregate')return;
  expect(v.periodEnds).toEqual(['2024-12-31','2025-12-31']);
  expect(v.header).toMatchObject({runId:RUN_ID,methodVersion:'industry-agg/1.0',factsAsOf:'2026-11-03',historyClass:'reconstruction',generation:3});
  expect(v.cells.map(c=>[c.code,c.periodEnd,c.display,c.value,c.missingReason])).toEqual([
   ['801120.SI','2025-12-31','value','0.478',null],['801120.SI','2024-12-31','insufficient','0.47',null],['801080.SI','2025-12-31','missing',null,'financial_excluded'],
  ]);
  expect(v.companion).toEqual([]);
  expect(v.valuation).toEqual({state:'not_enabled'});
  expect(v.freshness).toBe('fresh');
 });
 it('fetches the stored YoY companion of a sum, never computing it',async()=>{
  const cells=[cellRow({metric:'revenue_sum',value:'110',unit:'CNY'}),cellRow({metric:'revenue_yoy',value:'0.1',unit:'ratio'})];
  const v=await industryListView(readDepsOf(stubIndustryDb({tree:TREE,runs:[runRow()],cells})),{...listQ,metric:'revenue_sum'});
  if(v.state!=='ok'||v.kind!=='aggregate')throw new Error(v.state);
  expect(v.cells.map(c=>c.metric)).toEqual(['revenue_sum']);
  expect(v.companion.map(c=>[c.metric,c.value])).toEqual([['revenue_yoy','0.1']]);
 });
 it('freshness: stale beyond the weekly window + grace, error as stored, missing without a row',async()=>{
  const deps=(rows:FreshnessRow[])=>readDepsOf(stubIndustryDb({tree:TREE,runs:[runRow()],freshness:rows}));
  const at=async(rows:FreshnessRow[])=>{const v=await industryListView(deps(rows),listQ);return v.state==='unlicensed'?null:v.freshness;};
  expect(await at([{dataset:'industry.agg.sw2021',status:'fresh',last_ok_at:'2026-10-20T00:00:00.000Z'}])).toBe('stale');
  expect(await at([{dataset:'industry.agg.sw2021',status:'error',last_ok_at:'2026-11-04T00:00:00.000Z'}])).toBe('error');
  expect(await at([])).toBe('missing');
 });
 it('valuation snapshot: latest published date per (code, metric); unpublished when nothing published',async()=>{
  const runs=[valuationRunRow()];
  const v=await industryListView(readDepsOf(stubIndustryDb({tree:TREE,runs:[runRow()],valuationRuns:runs,valuations:[valuationRow(),valuationRow({trade_date:'2026-10-23',value:'25.3'}),valuationRow({metric:'pb',value:'4.91'}),valuationRow({trade_date:'2026-10-16',published:false})]})),listQ);
  if(v.state!=='ok'||v.kind!=='aggregate')throw new Error(v.state);
  expect(v.valuation.state==='published'&&v.valuation.cells.map(c=>[c.metric,c.tradeDate,c.value])).toEqual([['pb','2026-10-30','4.91'],['pe_ttm','2026-10-30','24.8']]);
  const none=await industryListView(readDepsOf(stubIndustryDb({tree:TREE,runs:[runRow()],valuationRuns:runs,valuations:[valuationRow({published:false})]})),listQ);
  expect(none.state==='ok'&&none.kind==='aggregate'&&none.valuation.state).toBe('unpublished');
 });
 it('SIC: navigation list with member counts, no runs read',async()=>{
  const db=stubIndustryDb({tree:TREE});
  const runs=vi.spyOn(db,'activeMetricRun');
  const v=await industryListView(readDepsOf(db,{memberCounts:async()=>new Map([['3674',62]])}),{...listQ,scheme:'sic',version:'sec-current'});
  expect(v).toMatchObject({state:'ok',kind:'navigation'});
  if(v.state==='ok'&&v.kind==='navigation')expect(v.nodes).toEqual([{code:'3674',level:1,nameZh:null,nameEn:'Semiconductors & Related Devices',parentCode:null,members:62}]);
  expect(runs).not.toHaveBeenCalled();
 });
});

describe('industryDetailView',()=>{
 const members=[membershipRow(),membershipRow({membership_id:'m2',issuer_id:ISSUER_B,valid_from:'2019-01-01',available_date:'2019-01-01',valid_to:'2026-09-29',valid_to_available_date:'2026-09-29'}),
  membershipRow({membership_id:'m3',issuer_id:'cccccccc-0000-4000-8000-000000000003',valid_from:'2026-01-05',available_date:'2026-01-05',valid_to:'2026-12-31',valid_to_available_date:'2026-12-31'})];
 const q={scheme:'sw2021' as const,version:'2021' as const,code:'801120.SI',metrics:['gross_margin' as const],durations:null,window:'5y' as const};
 it('unknown code → unknown_industry',async()=>{
  expect(await industryDetailView(readDepsOf(stubIndustryDb({tree:TREE})),{...q,code:'999999.SI'})).toEqual({state:'unknown_industry'});
 });
 it('members by the time-estimation rule (closed member out, future close not yet effective), unresolved count, series in window, method',async()=>{
  const cells=[cellRow(),cellRow({period_start:'2020-01-01',period_end:'2020-12-31'})];
  const unresolved=vi.fn(async()=>1);
  const v=await industryDetailView(readDepsOf(stubIndustryDb({tree:TREE,runs:[runRow({expected_grid:{codes:['801120.SI'],period_ends:['2020-12-31','2025-12-31'],metrics:['gross_margin']}})],cells,memberships:members}),{unresolved:{unresolvedCount:unresolved}}),q);
  if(v.state!=='ok')throw new Error(v.state);
  expect(v.members).toEqual({count:2,unresolved:1,lastAddition:'2026-01-05'});
  expect(unresolved).toHaveBeenCalledWith({code:'801120.SI',level:1,on:'2026-11-05',knownBy:'2026-11-05'});
  expect(v.periodEnds).toEqual(['2025-12-31']);
  expect(v.series.map(c=>c.periodEnd)).toEqual(['2025-12-31']);
  expect(v.children.map(c=>c.code)).toEqual(['801124.SI']);
  expect(v.aggregated).toBe(true);
  expect(v.method.methodVersion).toBe('industry-agg/1.0');
  expect(v.sources).toEqual(['sw_via_tushare','exchange_via_tushare','tushare_statements']);
 });
 it('an L2 node has ancestors and no aggregate series (v1 aggregates L1 only)',async()=>{
  const v=await industryDetailView(readDepsOf(stubIndustryDb({tree:TREE,runs:[runRow()]})),{...q,code:'850111.SI'});
  if(v.state!=='ok')throw new Error(v.state);
  expect(v.ancestors.map(a=>a.code)).toEqual(['801120.SI','801124.SI']);
  expect(v.aggregated).toBe(false);
  expect(v.series).toEqual([]);
 });
});

describe('constituentsView',()=>{
 const members=[membershipRow(),membershipRow({membership_id:'m-l2',level:2,code:'801124.SI'}),membershipRow({membership_id:'m-l3',level:3,code:'850111.SI'}),
  membershipRow({membership_id:'m-b',issuer_id:ISSUER_B,valid_from:'2014-02-21',available_date:'2014-02-21'})];
 const q={scheme:'sw2021' as const,version:'2021' as const,code:'801120.SI',on:'2026-11-03',page:1,pageSize:1};
 it('pages members by (valid_from, issuer), adds names, L1>L2>L3 path, latest annual facts; unresolved is a count only',async()=>{
  const readFacts=vi.fn(async()=>({stateRev:3,truncated:false,rows:[factRow({period_end:'2024-12-31',period_start:'2024-01-01',fact_id:'old'}),factRow(),factRow({concept:'net_income_parent',fact_id:'ni',value_text:'86228000000'}),factRow({duration:'3M',fact_id:'q'})]}));
  const v=await constituentsView(readDepsOf(stubIndustryDb({tree:TREE,memberships:members}),{
   unresolved:{unresolvedCount:async()=>2},issuers:async ids=>new Map(ids.map(id=>[id,{issuerId:id,nameZh:id===ISSUER_B?'古越龙山':'贵州茅台',nameEn:null,ticker:id===ISSUER_B?'600059.SH':'600519.SH'}])),facts:{readFacts}}),q);
  if(v.state!=='ok')throw new Error(v.state);
  expect(v).toMatchObject({total:2,page:1,pageSize:1,unresolvedCount:2,currentOnly:false,knownBy:'2026-11-05'});
  expect(v.rows).toHaveLength(1);
  expect(v.rows[0]).toMatchObject({issuerId:ISSUER_B,ticker:'600059.SH',nameZh:'古越龙山'});
  const page2=await constituentsView(readDepsOf(stubIndustryDb({tree:TREE,memberships:members}),{facts:{readFacts},issuers:async ids=>new Map(ids.map(id=>[id,{issuerId:id,nameZh:'贵州茅台',nameEn:null,ticker:'600519.SH'}]))}),{...q,page:2});
  if(page2.state!=='ok')throw new Error(page2.state);
  expect(page2.rows[0].path.map(n=>n.code)).toEqual(['801120.SI','801124.SI','850111.SI']);
  expect(page2.rows[0].revenue).toMatchObject({factId:'99999999-9999-4999-8999-999999999901',value:'170899000000',periodEnd:'2025-12-31'});
  expect(page2.rows[0].netIncome).toMatchObject({factId:'ni'});
  expect(page2.rows[0].membership).toMatchObject({availability:'effective_date_assumed',rawHash:'41c0d2e7',validFrom:'2021-07-30'});
  expect(readFacts).toHaveBeenCalledWith(ISSUER_A,'CN',{concepts:['revenue','net_income_parent'],asOf:'2026-11-03',from:'2024-01-01',to:'2026-11-03'});
 });
 it('SIC is current_only and never asks for unresolved counts',async()=>{
  const unresolved=vi.fn(async()=>9);
  const sic=membershipRow({scheme:'sic',version:'sec-current',code:'3674',valid_from:'2026-06-02',available_date:'2026-06-02',source:'sec:submissions',source_membership_id:null});
  const v=await constituentsView(readDepsOf(stubIndustryDb({tree:TREE,memberships:[sic]}),{unresolved:{unresolvedCount:unresolved}}),{...q,scheme:'sic',version:'sec-current',code:'3674',pageSize:50});
  if(v.state!=='ok')throw new Error(v.state);
  expect(v).toMatchObject({currentOnly:true,unresolvedCount:0,total:1});
  expect(v.rows[0].path.map(n=>n.code)).toEqual(['3674']);
  expect(unresolved).not.toHaveBeenCalled();
 });
});

describe('issuerIndustriesView',()=>{
 const issuers=async(ids:string[])=>new Map(ids.filter(i=>i===ISSUER_A).map(i=>[i,{issuerId:i,nameZh:'贵州茅台',nameEn:null,ticker:'600519.SH'}]));
 const rows=[membershipRow(),membershipRow({membership_id:'l2',level:2,code:'801124.SI',valid_from:'2021-08-01',available_date:'2021-08-01'}),membershipRow({membership_id:'sic',scheme:'sic',version:'sec-current',code:'3674',valid_from:'2026-06-02',available_date:'2026-06-02'})];
 it('unknown issuer → unknown_issuer',async()=>{
  expect(await issuerIndustriesView(readDepsOf(stubIndustryDb({tree:TREE}),{issuers}),{issuerId:ISSUER_B,on:'2026-11-03'})).toEqual({state:'unknown_issuer'});
 });
 it('public schemes only; the scheme list says which are public',async()=>{
  const v=await issuerIndustriesView(readDepsOf(stubIndustryDb({public:new Set(['scheme:sic:sec-current']),tree:TREE,memberships:rows}),{issuers}),{issuerId:ISSUER_A,on:'2026-11-03'});
  if(v.state!=='ok')throw new Error(v.state);
  expect(v.schemes.map(s=>[s.scheme,s.public])).toEqual([['sw2021',false],['sic',true]]);
  expect(v.industries.map(i=>[i.scheme,i.currentOnly,i.path.map(n=>n.code)])).toEqual([['sic',true,['3674']]]);
 });
 it('SW path L1>L2 with since = the deepest level',async()=>{
  const v=await issuerIndustriesView(readDepsOf(stubIndustryDb({tree:TREE,memberships:rows}),{issuers}),{issuerId:ISSUER_A,on:'2026-11-03'});
  if(v.state!=='ok')throw new Error(v.state);
  expect(v.industries[0]).toMatchObject({scheme:'sw2021',since:'2021-08-01',membershipId:'l2'});
  expect(v.industries[0].path.map(n=>n.code)).toEqual(['801120.SI','801124.SI']);
 });
});

describe('replayView (spec §9 authorization order and per-cell filtering)',()=>{
 const deps=(p:Partial<ReplayDeps>={},data:Parameters<typeof stubIndustryDb>[0]={}):ReplayDeps=>({
  db:stubIndustryDb({runs:[runRow()],cells:[cellRow(),cellRow({metric:'revenue_sum',value:'110',unit:'CNY'}),missingCell({period_end:'2024-12-31',period_start:'2024-01-01'})],...data}),
  manifests:{get:vi.fn(async()=>manifestOf())},recompute:vi.fn(async()=>manifestOf()),now:new Date('2026-11-05T08:00:00.000Z'),...p,
 });
 const q={scheme:'sw2021' as const,version:'2021' as const,code:'801120.SI',runId:RUN_ID,metric:'gross_margin' as const,duration:null,periodEnd:'2025-12-31',mode:'original' as const};
 it('unlicensed → unknown_run (run not visible) → scheme mismatch → unknown_cell (absent / missing status), manifest never read',async()=>{
  const d=deps();
  expect(await replayView(deps({},{public:new Set()}),q)).toEqual({state:'unlicensed',datasetKey:'scheme:sw2021:2021'});
  expect(await replayView(deps({},{runs:[runRow({status:'failed'})]}),q)).toEqual({state:'unknown_run'});
  expect(await replayView(d,{...q,scheme:'sic',version:'sec-current'})).toEqual({state:'unknown_run'});   // the run is sw2021
  expect(await replayView(d,{...q,code:'801080.SI'})).toEqual({state:'unknown_cell'});
  expect(await replayView(d,{...q,periodEnd:'2024-12-31'})).toEqual({state:'unknown_cell'});
  expect(d.manifests.get).not.toHaveBeenCalled();
 });
 it('two durations on one period end without duration → ambiguous_duration',async()=>{
  const d=deps({},{cells:[cellRow({metric:'revenue_sum',unit:'CNY',value:'110'}),cellRow({metric:'revenue_sum',unit:'CNY',value:'30',duration:'3M',period_start:'2025-10-01'})]});
  expect(await replayView(d,{...q,metric:'revenue_sum'})).toEqual({state:'ambiguous_duration'});
  expect((await replayView(d,{...q,metric:'revenue_sum',duration:'3M'})).state).toBe('ok');
 });
 it('original: per-cell filtered manifest (members in full, roles/facts of the metric only), reproduced=true',async()=>{
  const v=await replayView(deps(),q);
  if(v.state!=='ok'||v.mode!=='original')throw new Error(v.state);
  expect(v.reproduced).toBe(true);
  expect(v.manifest.members).toHaveLength(1);
  expect(v.manifest.member_state_revs).toEqual([{issuer_id:ISSUER_A,state_rev:4}]);
  expect(v.manifest.roles.map(r=>r.metric)).toEqual(['gross_margin']);
  expect(v.manifest.facts.map(f=>f.concept).sort()).toEqual(['cost_of_revenue','revenue_operating']);
  expect(v.manifest.cells.map(c=>c.metric)).toEqual(['gross_margin']);
  expect(v.replay).toHaveLength(1);
  expect(replayCell).toHaveBeenLastCalledWith(v.manifest,expect.objectContaining({metric:'gross_margin',duration:'12M'}));   // exactly the returned payload is validated
  expect(v.header.runId).toBe(RUN_ID);
 });
 it('original: reproduced=false when the replayed value differs (canonical decimal compare; 0.4780 equals 0.478)',async()=>{
  vi.mocked(replayCell).mockReturnValueOnce({reproduced:true,mismatches:[],cell:{metric:'gross_margin',duration:'12M',period_start:'2025-01-01',status:'ok',value_text:'0.4780',n_members:10,n_with_data:9,n_unresolved:0,unit:'ratio'}});
  const same=await replayView(deps(),q);
  expect(same.state==='ok'&&same.mode==='original'&&same.reproduced).toBe(true);
  vi.mocked(replayCell).mockReturnValueOnce({reproduced:true,mismatches:[],cell:{metric:'gross_margin',duration:'12M',period_start:'2025-01-01',status:'ok',value_text:'0.476',n_members:10,n_with_data:9,n_unresolved:0,unit:'ratio'}});
  const diff=await replayView(deps(),q);
  expect(diff.state==='ok'&&diff.mode==='original'&&diff.reproduced).toBe(false);
 });
 it('recompute: match on identical evidence; changed lists the new fact, the state_rev move and the cell',async()=>{
  const match=await replayView(deps(),{...q,mode:'recompute'});
  expect(match.state==='ok'&&match.mode==='recompute'&&match.result).toBe('match');
  const later=manifestOf();
  later.member_state_revs=[{issuer_id:ISSUER_A,state_rev:5}];
  later.facts=[later.facts[0],{...later.facts[1],fact_id:'f-cost-2',value_text:'50'},later.facts[2]];   // a revised cost fact supersedes f-cost
  later.cells=[{...later.cells[0],value_text:'0.5'},later.cells[1]];
  const r=await replayView(deps({recompute:vi.fn(async()=>later)}),{...q,mode:'recompute'});
  if(r.state!=='ok'||r.mode!=='recompute')throw new Error(r.state);
  expect(r.result).toBe('changed');
  expect(r.diff.facts).toEqual({added:['f-cost-2'],removed:['f-cost']});
  expect(r.diff.stateRevs).toEqual([{issuerId:ISSUER_A,from:4,to:5}]);
  expect(r.diff.cells.map(c=>[c.metric,c.stored?.value_text,c.recomputed?.value_text])).toEqual([['gross_margin','0.478','0.5']]);
 });
});

describe('valuationReplayView',()=>{
 const run=valuationRunRow();
 const q={scheme:'sw2021' as const,version:'2021' as const,code:'801120.SI',runId:run.run_id,metric:'pe_ttm' as const,tradeDate:'2026-10-30'};
 it('unpublished cell → unknown_cell; officialValue only when the official dataset is public',async()=>{
  const officialValue=vi.fn(async()=>'24.6');
  const db=(pub:string[])=>stubIndustryDb({public:new Set(pub),valuationRuns:[run],valuations:[valuationRow(),valuationRow({trade_date:'2026-10-23',published:false})]});
  expect(await valuationReplayView({db:db(['scheme:sw2021:2021']),officialValue},{...q,tradeDate:'2026-10-23'})).toEqual({state:'unknown_cell'});
  const internal=await valuationReplayView({db:db(['scheme:sw2021:2021']),officialValue},q);
  expect(internal).toMatchObject({state:'ok',kind:'valuation',replay:'deferred_i3'});
  expect('officialValue' in internal).toBe(false);
  expect(officialValue).not.toHaveBeenCalled();
  expect(await valuationReplayView({db:db(['scheme:sw2021:2021','official:tushare-sw_daily']),officialValue},q)).toMatchObject({officialValue:'24.6'});
 });
});

describe('adminReplayView',()=>{
 it('reads any run status, every cell of the group with reproduced, the unresolved list and a focus for the drawer',async()=>{
  const db={...stubIndustryDb({runs:[runRow({status:'failed'})],cells:[cellRow(),cellRow({metric:'revenue_sum',value:'110',unit:'CNY'}),missingCell({metric:'member_count',duration:'INSTANT',period_start:'2025-12-31'})]}),unresolvedOf:vi.fn(async()=>[{ts_code:'600999.SH',in_date:'2021-07-30',out_date:null,source_membership_id:'s1'}])};
  const v=await adminReplayView({db,manifests:{get:async()=>manifestOf()}},{runId:RUN_ID,code:'801120.SI',periodEnd:'2025-12-31',metric:'gross_margin',duration:null});
  if(v.state!=='ok')throw new Error(v.state);
  expect(v.cells.map(c=>[c.metric,c.reproduced])).toEqual([['gross_margin',true],['revenue_sum',true],['member_count',null]]);
  expect(v.unresolved).toHaveLength(1);
  expect(v.focus?.reproduced).toBe(true);
  expect(replayCell).toHaveBeenCalledWith(expect.objectContaining({cells:[expect.objectContaining({metric:'gross_margin'})]}),expect.objectContaining({metric:'gross_margin'}));   // the focus payload itself is validated
  expect(v.focus?.manifest.roles.map(r=>r.metric)).toEqual(['gross_margin']);
  expect(await adminReplayView({db,manifests:{get:async()=>manifestOf()}},{runId:'00000000-0000-4000-8000-000000000000',code:'801120.SI',periodEnd:'2025-12-31',metric:null,duration:null})).toEqual({state:'unknown_run'});
 });
});

describe('filterManifest / manifestDiff',()=>{
 it('keeps facts cited by the metric’s derived rows',()=>{
  const eq=(id:string,end:string)=>({issuer_id:ISSUER_A,concept:'equity_parent',period_start:null,period_end:end,duration:'INSTANT',fact_id:id,value_text:'5',unit:'CNY',consolidation:'consolidated',available_date:'2026-04-03',mapping_gen:1,filing_id:'g1',source_ref:null,raw_hash:'h',citation:'pending' as const});
  const m=manifestOf({facts:[...manifestOf().facts,eq('f-eq0','2024-12-31'),eq('f-eq1','2025-12-31')],
   roles:[{issuer_id:ISSUER_A,metric:'roe',duration:'TTM',role:'included'}],
   derived:[{issuer_id:ISSUER_A,metric:'ttm_net_income_parent',period_start:'2025-01-01',period_end:'2025-12-31',duration:'TTM',value:'9',unit:'CNY',basis:'cn',formula_version:'facts-derive/1.0',inputs:[{fact_id:'f-rev',concept:'net_income_parent',filing_id:'g1',available_date:'2026-04-03'}]}],
   cells:[{metric:'roe',duration:'TTM',period_start:'2025-01-01',status:'ok',value_text:'0.2',n_members:1,n_with_data:1,n_unresolved:0,unit:'ratio'}]});
  const f=filterManifest(m,'roe',{duration:'TTM',period_start:'2025-01-01'});
  expect(f.derived).toHaveLength(1);
  expect(f.facts.map(x=>x.fact_id).sort()).toEqual(['f-eq0','f-eq1','f-rev']);   // the two equity points + the fact the TTM row cites; nothing else
  expect(f.cells).toHaveLength(1);
 });
 it('filters by the requested cell’s own inputs: annual revenue_sum has no prior-year fact and no quarterly derived row',()=>{
  const base=manifestOf().facts[2];
  const prior={...base,fact_id:'f-rev-2024',period_start:'2024-01-01',period_end:'2024-12-31',value_text:'90'};
  const q4={issuer_id:ISSUER_A,metric:'q_single_revenue',period_start:'2025-10-01',period_end:'2025-12-31',duration:'3M',value:'30',unit:'CNY',basis:'cn',formula_version:'facts-derive/1.0',inputs:[{fact_id:'f-rev',concept:'revenue',filing_id:'g1',available_date:'2026-04-03'}]};
  const m=manifestOf({facts:[...manifestOf().facts,prior],derived:[q4],
   roles:[{issuer_id:ISSUER_A,metric:'revenue_sum',duration:'12M',role:'included'},{issuer_id:ISSUER_A,metric:'revenue_sum',duration:'3M',role:'included'}],
   cells:[...manifestOf().cells,{metric:'revenue_sum',duration:'3M',period_start:'2025-10-01',status:'ok',value_text:'30',n_members:10,n_with_data:9,n_unresolved:0,unit:'CNY'}]});
  const annual=filterManifest(m,'revenue_sum',{duration:'12M',period_start:'2025-01-01'});
  expect(annual.facts.map(x=>x.fact_id)).toEqual(['f-rev']);expect(annual.derived).toEqual([]);expect(annual.roles).toHaveLength(1);
  const quarter=filterManifest(m,'revenue_sum',{duration:'3M',period_start:'2025-10-01'});
  expect(quarter.derived.map(d=>d.metric)).toEqual(['q_single_revenue']);expect(quarter.facts.map(x=>x.fact_id)).toEqual(['f-rev']);   // cited by the derived row only
 });
 it('identical manifests have an empty diff; a removed member is reported',()=>{
  const a=manifestOf();
  expect(manifestDiff(a,manifestOf()).members).toEqual({added:[],removed:[],modified:[]});
  const b=manifestOf({members:[]});
  expect(manifestDiff(a,b).members.removed).toEqual([`${ISSUER_A}:2021-07-30::`]);
 });
 it('evidence changes with identical dates and results are reported as modified members, not a match',()=>{
  const a=manifestOf();
  const b=manifestOf({members:[{...a.members[0],source_membership_id:'ffffffff-ffff-4fff-8fff-ffffffffff99',raw_hash:'deadbeef',locator:{page:2,row:3},resolution_method:'ticker_history' as never,available_date:'2021-08-01'}]});
  const d=manifestDiff(a,b);
  expect(d.members).toEqual({added:[],removed:[],modified:[`${ISSUER_A}:2021-07-30::`]});
  expect(isEmptyDiff(d)).toBe(false);
 });
});
