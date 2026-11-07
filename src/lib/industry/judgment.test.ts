// src/lib/industry/judgment.test.ts
import {describe,expect,it,vi} from 'vitest';
vi.mock('./memberships',()=>({isMemberAt:()=>true}));
vi.mock('./replay',()=>({replayFromManifest:(m:{cells:unknown[]})=>({cells:m.cells})}));
import {digest} from '../research/ingest/pa-v1/json';
import {RUN_ID,cellRow,missingCell,runRow,stubIndustryDb} from './fixture-rows';
import {fetchIndustryJudgments,industrySubjectKey,judgmentCardView,judgmentsEnabled,judgmentsUrl,judgmentsViewState,startJudgmentsLoad} from './judgment-contract';
import type {JudgmentCard} from './judgment-contract';
import {IndustryInputError,endOfUtcDay,industryTableRowsInput,metricsNaturalKey,parseIndustryNaturalKey,valuationsNaturalKey} from './judgment-input';

const card=(p:Record<string,unknown>={}):JudgmentCard=>({
 judgment_id:'j1',subject:{type:'industry',key:'sw2021:2021:801120.SI'},judgment_type:'industry_lifecycle_stage',kind:'categorical',
 lifecycle:'open',outcome:null,calibration:'insufficient',retrospective:false,as_of:'2026-11-01',registered_at:'2026-11-01T04:00:00Z',
 methodology:{id:'industry_lifecycle',version:'v1',title:{zh:'生命周期阶段',en:'Lifecycle stage'},href:'/intel/methods/industry_lifecycle/v1'},
 display:{headline:{zh:'成熟期',en:'Mature'},percent:null,value:'mature',band:'mid'},
 condition:{text:{zh:'若 2027 年报期营收 3 年 CAGR > 8% 则判断不成立',en:'Fails if the 3-year revenue CAGR at FY2027 exceeds 8%'},horizon:{},target:{},label_policy:'first_observed',settle_after:'2028-01-01',settle_by:'2028-05-01'},
 settlement:null,calibration_summary:{n_independent:0,n_total:0,threshold_n:30,brier:null,brier_skill:null,ece_raw_holdout:null,valid_until:null,hit_rate:null,href:'#'},inputs:[],...p,
} as unknown as JudgmentCard);

describe('judgment contract (F4 §9 + owner decision D)',()=>{
 it('subject key, flag, URL',()=>{
  expect(industrySubjectKey('sw2021','2021','801120.SI')).toBe('sw2021:2021:801120.SI');
  expect(judgmentsEnabled({})).toBe(false);expect(judgmentsEnabled({INDUSTRY_JUDGMENTS_ENABLED:'1'})).toBe(true);
  expect(judgmentsUrl('sw2021:2021:801120.SI')).toBe('/api/judgments?subject_type=industry&subject_key=sw2021%3A2021%3A801120.SI&include_abstained=1');
 });
 it('uncalibrated: label + badge + condition; no percent even for a probability with a percent',()=>{
  const v=judgmentCardView(card(),'zh');
  expect(v).toMatchObject({title:'生命周期阶段',headline:'成熟期',badge:{kind:'uncalibrated',n:0,threshold:30},percent:null,condition:'若 2027 年报期营收 3 年 CAGR > 8% 则判断不成立',footer:{method:'industry_lifecycle@v1',asOf:'2026-11-01',settleBy:'2028-05-01'}});
  expect(judgmentCardView(card({kind:'probability',display:{headline:{zh:'x',en:'x'},percent:62,value:0.62}}),'en').percent).toBeNull();
  expect(judgmentCardView(card({kind:'probability',calibration:'calibrated',display:{headline:{zh:'x',en:'x'},percent:62,value:0.62}}),'en')).toMatchObject({percent:62,badge:{kind:'calibrated'}});
  expect(judgmentCardView(card({lifecycle:'abstained',condition:null,abstain_reason:'needs 3y CAGR'}),'en')).toMatchObject({abstainReason:'needs 3y CAGR',condition:null});
 });
 it('failed calibration: badge carries the raw holdout ECE; no percent',()=>{
  const v=judgmentCardView(card({kind:'probability',calibration:'failed',display:{headline:{zh:'x',en:'x'},percent:62,value:0.62},calibration_summary:{n_independent:40,n_total:40,threshold_n:30,brier:0.3,brier_skill:-0.1,ece_raw_holdout:0.137,valid_until:null,hit_rate:null,href:'#'}}),'zh');
  expect(v.badge).toEqual({kind:'failed',ece:0.137});expect(v.percent).toBeNull();
  expect(judgmentCardView(card({calibration:'failed',calibration_summary:null}),'en').badge).toEqual({kind:'failed',ece:null});
 });
 it('footer target/horizon, inputs (with and without href) and a settled card\'s outcome',()=>{
  const v=judgmentCardView(card({
   condition:{text:{zh:'a',en:'a'},horizon:'FY2027',target:{metric:'revenue_cagr_3y',gt:0.08},label_policy:'first_observed',settle_after:'2028-01-01',settle_by:'2028-05-01'},
   inputs:[{kind:'table_rows',ref:'industry_metrics:r:801120.SI:2025-12-31',available_at:'2026-11-03T23:59:59.999Z',origin:{},href:'/api/industries/sw2021/801120.SI/replay'},{kind:'table_rows',ref:{table:'x'},available_at:'2026-11-04T00:00:00Z',origin:{},href:null}],
   lifecycle:'settled',settlement:{kind:'auto',outcome:'hit',realized:0.05,settled_at:'2028-05-02T01:00:00Z',evidence_summary:{}},
  }),'en');
  expect(v.footer).toMatchObject({target:'{"metric":"revenue_cagr_3y","gt":0.08}',horizon:'FY2027'});
  expect(v.inputs).toEqual([{kind:'table_rows',ref:'industry_metrics:r:801120.SI:2025-12-31',availableAt:'2026-11-03T23:59:59.999Z',href:'/api/industries/sw2021/801120.SI/replay'},{kind:'table_rows',ref:'{"table":"x"}',availableAt:'2026-11-04T00:00:00Z',href:null}]);
  expect(v.settlement).toEqual({outcome:'hit',realized:'0.05',settledAt:'2028-05-02T01:00:00Z'});
  expect(judgmentCardView(card(),'en')).toMatchObject({inputs:[],settlement:null,footer:{target:null,horizon:null}});
 });
 it('view state: disabled wins; loading until the fetched subject matches (loaded→disabled, A→B)',()=>{
  const A={key:'A',result:{state:'ok' as const,cards:[card()]}};
  expect(judgmentsViewState(true,'A',A)).toEqual(A.result);
  expect(judgmentsViewState(false,'A',A)).toEqual({state:'disabled'});
  expect(judgmentsViewState(true,null,A)).toEqual({state:'disabled'});
  expect(judgmentsViewState(true,'B',A)).toEqual({state:'loading'});
  expect(judgmentsViewState(true,'B',null)).toEqual({state:'loading'});
 });
 it('startJudgmentsLoad: no request while disabled or without a subject; tags the result with its subject; aborted loads are dropped',async()=>{
  const f=vi.fn(async()=>new Response(JSON.stringify({subject:{type:'industry',key:'A'},asOf:null,view:'latest',cards:[card({subject:{type:'industry',key:'A'}})]}),{status:200}));
  const got=vi.fn();
  startJudgmentsLoad({enabled:false,subjectKey:'A',onResult:got,fetch:f})();
  startJudgmentsLoad({enabled:true,subjectKey:null,onResult:got,fetch:f})();
  expect(f).not.toHaveBeenCalled();
  startJudgmentsLoad({enabled:true,subjectKey:'A',onResult:got,fetch:f});
  await vi.waitFor(()=>expect(got).toHaveBeenCalledWith({key:'A',result:expect.objectContaining({state:'ok'})}));
  expect(f).toHaveBeenCalledTimes(1);
  expect(String((f.mock.calls as unknown as unknown[][])[0][0])).toContain('include_abstained=1');
  got.mockClear();
  startJudgmentsLoad({enabled:true,subjectKey:'B',onResult:got,fetch:f})();
  await new Promise(r=>setTimeout(r,10));
  expect(got).not.toHaveBeenCalled();
 });
 it('fetch: never requests while disabled; ok / error otherwise',async()=>{
  const f=vi.fn(async()=>new Response(JSON.stringify({subject:{type:'industry',key:'k'},asOf:null,view:'latest',cards:[card({subject:{type:'industry',key:'k'}})]}),{status:200}));
  expect(await fetchIndustryJudgments('k',{enabled:false,fetch:f})).toEqual({state:'disabled'});
  expect(f).not.toHaveBeenCalled();
  expect(await fetchIndustryJudgments('k',{enabled:true,fetch:f})).toMatchObject({state:'ok',cards:[{judgment_id:'j1'}]});
  expect(await fetchIndustryJudgments('k',{enabled:true,fetch:vi.fn(async()=>new Response('{}',{status:404}))})).toEqual({state:'error',code:'http_404'});
  expect(await fetchIndustryJudgments('k',{enabled:true,fetch:vi.fn(async()=>new Response('{}',{status:200}))})).toEqual({state:'error',code:'malformed'});
  for(const body of [{cards:[card()]},{subject:{type:'industry',key:'other'},asOf:null,view:'latest',cards:[]},{subject:{type:'industry',key:'k'},asOf:null,view:'latest',cards:[{}]},{subject:{type:'industry',key:'k'},asOf:null,view:'other',cards:[]}])
   expect(await fetchIndustryJudgments('k',{enabled:true,fetch:vi.fn(async()=>new Response(JSON.stringify(body),{status:200}))})).toEqual({state:'error',code:'malformed'});
 });
});

describe('F4 table_rows input adapter (spec §7.1)',()=>{
 const rows=[cellRow({metric:'revenue_sum',value:'110',unit:'CNY'}),cellRow(),cellRow({metric:'revenue_sum',duration:'3M',period_start:'2025-10-01',value:'30',unit:'CNY'}),missingCell({metric:'roe',duration:'TTM'})];
 const db=stubIndustryDb({runs:[runRow()],cells:rows});
 const nk=metricsNaturalKey(RUN_ID,'801120.SI','2025-12-31');
 it('natural keys round-trip; malformed keys are rejected',()=>{
  expect(nk).toBe(`industry_metrics:${RUN_ID}:801120.SI:2025-12-31`);
  expect(parseIndustryNaturalKey(nk)).toEqual({table:'industry_metrics',runId:RUN_ID,code:'801120.SI',date:'2025-12-31'});
  expect(parseIndustryNaturalKey(valuationsNaturalKey(RUN_ID,'801120.SI','2026-10-30'))?.table).toBe('industry_valuations');
  for(const bad of ['industry_metrics:x:801120.SI:2025-12-31',`industry_metrics:${RUN_ID}:801120.SI`,`other:${RUN_ID}:801120.SI:2025-12-31`,`industry_metrics:${RUN_ID}:a:b:2025-12-31`,`industry_metrics:${RUN_ID}:801120.SI:2025-02-30`])expect(parseIndustryNaturalKey(bad)).toBeNull();
 });
 it('snapshot = ok rows ordered by (metric, period_start, duration); hash = digest(snapshot); available_at = updated_at end of UTC day',async()=>{
  const input=await industryTableRowsInput(db,{table:'industry_metrics',natural_key:nk});
  expect(input.snapshot.rows.map(r=>[r.metric,r.period_start,r.duration])).toEqual([['gross_margin','2025-01-01','12M'],['revenue_sum','2025-01-01','12M'],['revenue_sum','2025-10-01','3M']]);
  expect(input.hash).toBe(digest(input.snapshot));
  expect(input.available_at).toBe('2026-11-03T23:59:59.999Z');
  expect(input.origin).toEqual({publisher:'OsbornAlpha',adapter:'industry-agg/1.0',locator:`manifest:${'e'.repeat(64)}`,transform:`${'c'.repeat(64)};history_class=reconstruction`,license:'scheme:sw2021:2021'});
  expect(Object.keys(input.snapshot.rows[0]).sort()).toEqual(['code','duration','manifest_hash','metric','missing_reason','n_members','n_unresolved','n_with_data','period_end','period_start','run_id','status','unit','updated_at','value']);
 });
 it('not public: invisible run, no ok rows, building rows; valuations deferred; bad key',async()=>{
  const err=async(p:Promise<unknown>,code:string)=>{await expect(p).rejects.toBeInstanceOf(IndustryInputError);await expect(p).rejects.toMatchObject({code});};
  await err(industryTableRowsInput(stubIndustryDb({runs:[]}),{table:'industry_metrics',natural_key:nk}),'input_not_public');
  await err(industryTableRowsInput(db,{table:'industry_metrics',natural_key:metricsNaturalKey(RUN_ID,'801080.SI','2025-12-31')}),'input_not_public');
  await err(industryTableRowsInput(stubIndustryDb({runs:[runRow({status:'building'})],cells:rows}),{table:'industry_metrics',natural_key:nk}),'input_not_public');
  await err(industryTableRowsInput(stubIndustryDb({runs:[runRow()],cells:[cellRow({updated_at:null})]}),{table:'industry_metrics',natural_key:nk}),'input_not_public');
  await err(industryTableRowsInput(stubIndustryDb({runs:[runRow()],cells:[cellRow(),cellRow({metric:'revenue_sum',manifest_hash:'f'.repeat(64)})]}),{table:'industry_metrics',natural_key:nk}),'input_ambiguous_manifest');
  await err(industryTableRowsInput(db,{table:'industry_valuations',natural_key:valuationsNaturalKey(RUN_ID,'801120.SI','2026-10-30')}),'unsupported_deferred_i3');
  await err(industryTableRowsInput(db,{table:'industry_valuations',natural_key:nk}),'invalid_natural_key');
 });
 it('endOfUtcDay keeps the UTC day of a late-evening activation (the cross-midnight rule)',()=>{
  expect(endOfUtcDay('2026-11-03T23:59:00.000Z')).toBe('2026-11-03T23:59:59.999Z');
  expect(endOfUtcDay('2026-11-04T00:00:01.000+00:00')).toBe('2026-11-04T23:59:59.999Z');
 });
});
