// src/lib/judgments/inputs.test.ts
// spec §14.1 inputs.test.ts: every builder is stable on fixtures and independent of field order;
// financial_fact from the plan-2 EDGAR fixture (CIK0000320193.trimmed.json via the real parser);
// quarantined / non-ok rows → input_not_public; price_bar close-only fields are null; origin keys
// are table rows; inputs_hash ignores array order; the whitelist rejects document_span / legacy_fill.
import {beforeAll,describe,expect,it} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {FORMULA_VERSION} from '@/lib/facts/derive';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import type {MetricRow} from '@/lib/facts/types';
import {canonicalize,digest,jsonClean} from './canonical';
import {JudgmentError} from './errors';
import {memoryJudgmentInputsDb} from './inputs-db';
import {buildInput as rawBuild,buildOrAbstain as rawAbstain,inputLabel,inputsHashOf,mapIndustryInputError,rebuildAndCompare as rawRebuild,sortInputs} from './inputs';
import type {BuildOptions,InputRequest} from './inputs';
import type {KlineRange} from './kline';
import {fixtureMacroReadApi,observationIdOf} from './macro-api';
import type {MacroFixture} from './macro-api';
import {originKnown} from './origins';
import {closeInstantUtc} from './time';
import {RUN_ID,cellRow,runRow,stubIndustryDb} from '@/lib/industry/fixture-rows';
import {IndustryInputError,metricsNaturalKey,valuationsNaturalKey,industryTableRowsInput} from '@/lib/industry/judgment-input';
import type {Input,JudgmentInputsDb,JudgmentRow,KlineRangeRequest,MetricKey} from './types';
import {AAPL_ISSUER,FIXED_NOW,aaplParse,factCandidate,filingCandidate,publishFacts,seedFactId} from './testing/facts-fixture';

// observedAt is required (H-02); tests that are not about it observe long after every fixture date.
const OBS='2030-01-01T00:00:00.000Z';
const buildInput=(r:InputRequest,db:JudgmentInputsDb,asOf:string,opts?:BuildOptions)=>rawBuild(r,db,asOf,OBS,opts);
const buildOrAbstain=(r:InputRequest,db:JudgmentInputsDb,asOf:string,opts?:BuildOptions)=>rawAbstain(r,db,asOf,OBS,opts);
const rebuildAndCompare=(i:Input,db:JudgmentInputsDb,asOf:string,opts?:BuildOptions)=>rawRebuild(i,db,asOf,OBS,opts);
const code=(p:Promise<unknown>)=>p.then(()=>'ok',(e:unknown)=>e instanceof JudgmentError?e.code:`other:${String(e)}`);
describe('industry table input bridge',()=>{
 const nk=metricsNaturalKey(RUN_ID,'801120.SI','2025-12-31');
 it('freezes the shipped adapter snapshot and hash',async()=>{
  const industry=stubIndustryDb({runs:[runRow()],cells:[cellRow()]});
  const db={...memoryJudgmentInputsDb(),industry};
  const input=await rawBuild({kind:'table_rows',ref:{table:'industry_metrics',natural_key:nk}},db,'2026-11-04',OBS);
  const adapted=await industryTableRowsInput(industry,{table:'industry_metrics',natural_key:nk});
  expect(input).toEqual(adapted);
  expect(originKnown('table_rows',input.origin)).toBe(true);
  expect(await rawRebuild(input,db,'2026-11-04',OBS)).toEqual({status:'ok'});
  expect(await rawRebuild({...input,origin:{...input.origin,locator:`manifest:${'f'.repeat(64)}`}},db,'2026-11-04',OBS)).toEqual({status:'input_snapshot_mismatch',field:'origin'});
 });
 it('tableRows resolves industry rows through the adapter and rejects keys outside its grammar',async()=>{
  const industry=stubIndustryDb({runs:[runRow()],cells:[cellRow()]});
  const db=memoryJudgmentInputsDb({industry});
  expect(await db.tableRows('industry_metrics',nk)).toEqual((await industryTableRowsInput(industry,{table:'industry_metrics',natural_key:nk})).snapshot.rows);
  for(const key of [metricsNaturalKey('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA','801120.SI','2025-12-31'),metricsNaturalKey(RUN_ID,'801120.SI','2025-02-30'),`industry_metrics:${RUN_ID}:801120:SI:2025-12-31`])
   expect(await code(db.tableRows('industry_metrics',key))).toBe('input_not_allowed');
 });
 it.each([
  ['invalid_natural_key','input_not_allowed'],['input_not_public','input_not_public'],
  ['input_ambiguous_manifest','input_unavailable'],['unsupported_deferred_i3','input_not_allowed'],
 ] as const)('maps adapter %s to F4 %s',async(adapterCode,f4Code)=>{
  expect(mapIndustryInputError(new IndustryInputError(adapterCode)).code).toBe(f4Code);
 });
 it('does not freeze a run that became available after judgment asOf',async()=>{
  const db=memoryJudgmentInputsDb({industry:stubIndustryDb({runs:[runRow()],cells:[cellRow()]})});
  expect(await code(rawBuild({kind:'table_rows',ref:{table:'industry_metrics',natural_key:nk}},db,'2020-01-01',OBS))).toBe('input_not_public');
 });
 it('rejects valuations and malformed metric keys before reading rows',async()=>{
  const db={...memoryJudgmentInputsDb(),industry:stubIndustryDb({runs:[runRow()],cells:[cellRow()]})};
  expect(await code(db.tableRows('industry_valuations' as never,valuationsNaturalKey(RUN_ID,'801120.SI','2025-12-31')))).toBe('input_not_allowed');
  expect(await code(rawBuild({kind:'table_rows',ref:{table:'industry_valuations' as 'industry_metrics',natural_key:valuationsNaturalKey(RUN_ID,'801120.SI','2025-12-31')}},db,'2026-11-04',OBS))).toBe('input_not_allowed');
  expect(await code(rawBuild({kind:'table_rows',ref:{table:'industry_metrics',natural_key:'industry_metrics:bad:801120.SI:2025-12-31'}},db,'2026-11-04',OBS))).toBe('input_not_allowed');
  expect(await code(rawBuild({kind:'table_rows',ref:{table:'industry_metrics',natural_key:metricsNaturalKey(RUN_ID,'801120.SI','2025-02-30')}},db,'2026-11-04',OBS))).toBe('input_not_allowed');
 });
});
const reversed=<T extends object>(o:T)=>Object.fromEntries(Object.entries(o).reverse());
let aapl:JudgmentInputsDb;let fy23RevenueId:string;
beforeAll(async()=>{
 const facts=memoryFactsDb();facts.setNow(FIXED_NOW);
 const p=aaplParse(2022);
 await publishFacts(facts,{issuer:AAPL_ISSUER,market:'US',filings:p.filings,facts:p.candidates});
 const c=p.candidates.find(x=>x.concept==='revenue'&&x.periodEnd==='2023-09-30'&&x.duration==='12M'&&x.filingRef==='0000320193-23-000106')!;
 fy23RevenueId=seedFactId(AAPL_ISSUER,c.filingRef,c.rawHash);
 aapl=memoryJudgmentInputsDb({facts});
},60_000);

describe('financial_fact (spec §3.5, §3.7)',()=>{
 it('projects the AAPL FY2023 revenue row from the recorded EDGAR fixture, stably',async()=>{
  const a=await buildInput({kind:'financial_fact',ref:{fact_id:fy23RevenueId}},aapl,'2023-12-31');
  expect(a.snapshot).toMatchObject({fact_id:fy23RevenueId,issuer_id:AAPL_ISSUER,market:'US',concept:'revenue',period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M',value_text:'383285000000',unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1});
  expect(Object.keys(a.snapshot).sort()).toEqual(['available_date','concept','consolidation','duration','fact_id','filing_id','issuer_id','mapping_gen','market','period_end','period_start','unit','value_text']);
  expect(a.available_at).toBe('2023-11-03T23:59:59.999Z');
  expect(a.hash).toBe(digest(a.snapshot));
  expect(digest(reversed(a.snapshot))).toBe(a.hash);   // field order is irrelevant (RFC 8785)
  expect(a.origin).toMatchObject({adapter:'edgar'});expect('license_status' in a.origin).toBe(false);expect(originKnown('financial_fact',a.origin)).toBe(true);
  expect(await buildInput({kind:'financial_fact',ref:{fact_id:fy23RevenueId}},aapl,'2023-12-31')).toEqual(a);
  expect(await rebuildAndCompare(a,aapl,'2023-12-31')).toEqual({status:'ok'});
 });
 it('a row not yet available at as_of, quarantined, staged or unknown → input_not_public',async()=>{
  expect(await code(buildInput({kind:'financial_fact',ref:{fact_id:fy23RevenueId}},aapl,'2023-11-02'))).toBe('input_not_public');
  const facts=memoryFactsDb();facts.setNow(FIXED_NOW);
  const I='00000000-0000-4000-8000-0000000000d1';
  const k=filingCandidate({sourceRef:'k1',availableDate:'2024-02-01',periodEnd:'2023-12-31',formType:'10-K'});
  const ok=factCandidate({filingRef:'k1',concept:'revenue',periodStart:'2023-01-01',periodEnd:'2023-12-31',duration:'12M',value:'10'});
  const q=factCandidate({filingRef:'k1',concept:'net_income_parent',periodStart:'2023-01-01',periodEnd:'2023-12-31',duration:'12M',value:'1'});
  const r1=await publishFacts(facts,{issuer:I,market:'US',filings:[k],facts:[ok,q],quarantineRawHashes:[q.rawHash]});
  const k2=filingCandidate({sourceRef:'k2',availableDate:'2024-03-01',periodEnd:'2023-12-31',formType:'10-K/A'});
  const staged=factCandidate({filingRef:'k2',concept:'gross_profit',periodStart:'2023-01-01',periodEnd:'2023-12-31',duration:'12M',value:'4'});
  const r2=await publishFacts(facts,{issuer:I,market:'US',filings:[k2],facts:[staged],publish:false});
  const db=memoryJudgmentInputsDb({facts});
  expect(await code(buildInput({kind:'financial_fact',ref:{fact_id:r1.factIds.get(ok.rawHash)!}},db,'2024-12-31'))).toBe('ok');
  expect(await code(buildInput({kind:'financial_fact',ref:{fact_id:r1.factIds.get(q.rawHash)!}},db,'2024-12-31'))).toBe('input_not_public');
  expect(await code(buildInput({kind:'financial_fact',ref:{fact_id:r2.factIds.get(staged.rawHash)!}},db,'2024-12-31'))).toBe('input_not_public');
  expect(await code(buildInput({kind:'financial_fact',ref:{fact_id:'00000000-0000-8000-8000-00000000dead'}},db,'2024-12-31'))).toBe('input_not_public');
 });
});

describe('financial_metric (spec §3.5 S04/S05)',()=>{
 const latestTtm=async(asOf:string):Promise<MetricRow>=>{
  const {metrics}=await aapl.deriveMetricsAsOf(AAPL_ISSUER,'US',asOf,FORMULA_VERSION);
  return metrics.filter(m=>m.metric==='ttm_revenue').sort((a,b)=>a.period_end<b.period_end?-1:1).at(-1)!;
 };
 const keyOf=(m:MetricRow):MetricKey=>({issuer_id:m.issuer_id,market:m.market,metric:m.metric,period_start:m.period_start,period_end:m.period_end,input_unit:m.input_unit,basis:m.basis,formula_version:m.formula_version});
 it('freezes value, lineage and the derivation rows; re-deriving from them alone reproduces the metric',async()=>{
  const m=await latestTtm('2024-12-31');
  const a=await buildInput({kind:'financial_metric',ref:keyOf(m)},aapl,'2024-12-31');
  if(a.kind!=='financial_metric')throw new Error('kind');
  expect(a.ref).toEqual(keyOf(m));
  expect(a.snapshot).toMatchObject({...keyOf(m),value_text:m.value,unit:m.unit,duration:'TTM',as_of:'2024-12-31',based_on_rev:m.based_on_rev,lineage:m.inputs});
  expect(a.snapshot.derivation).toMatchObject({formula_version:FORMULA_VERSION,as_of:'2024-12-31',state_rev:m.based_on_rev});
  const ids=new Set(a.snapshot.derivation.rows.map(r=>r.fact_id));
  for(const i of m.inputs)expect(ids.has(i.fact_id)).toBe(true);
  const concepts=new Set(m.inputs.map(i=>i.concept));
  for(const r of a.snapshot.derivation.rows){expect(concepts.has(r.concept)).toBe(true);expect(r.period_end<=m.period_end).toBe(true);expect(Object.values(r).includes(undefined as never)).toBe(false);}
  expect(a.available_at).toBe(`${m.inputs.map(i=>i.available_date).sort().at(-1)}T23:59:59.999Z`);
  expect(a.origin.transform).toBe(`derive:${FORMULA_VERSION}`);
  expect(await buildInput({kind:'financial_metric',ref:reversed(keyOf(m)) as MetricKey},aapl,'2024-12-31')).toEqual(a);
  expect(await rebuildAndCompare(a,aapl,'2024-12-31')).toEqual({status:'ok'});
 });
 it('metric_not_reproducible when the frozen subset cannot reproduce it; other formula → unsupported; absent key → not public',async()=>{
  const m=await latestTtm('2024-12-31');
  const broken:JudgmentInputsDb={...aapl,deriveMetricsAsOf:async(...a)=>{const r=await aapl.deriveMetricsAsOf(...a);return {...r,envelope:{...r.envelope,rows:[]}};}};
  expect(await code(buildInput({kind:'financial_metric',ref:keyOf(m)},broken,'2024-12-31'))).toBe('metric_not_reproducible');
  expect(await buildOrAbstain({kind:'financial_metric',ref:keyOf(m)},broken,'2024-12-31')).toEqual({abstained:true,reason:'metric_not_reproducible',missing:[inputLabel({kind:'financial_metric',ref:keyOf(m)})]});
  expect(await code(buildInput({kind:'financial_metric',ref:{...keyOf(m),formula_version:'facts-derive/0.9'}},aapl,'2024-12-31'))).toBe('unsupported_formula_version');
  expect(await code(buildInput({kind:'financial_metric',ref:{...keyOf(m),period_end:'2030-12-31'}},aapl,'2024-12-31'))).toBe('input_not_public');
 });
});

const bar=(time:string,close:number)=>({time,open:close-1,high:close+1,low:close-2,close,volume:1000,amount:close*1000});
const klineOf=(series:Partial<KlineRange>|{failure:string})=>async(r:KlineRangeRequest)=>('failure' in series?series:{source:r.source,adjustment:r.adjustment,volumeUnit:'shares',close_only:false,from:r.from,to:r.to,bars:[],...series}) as never;
const VERIFIED={capability:()=>({status:'verified' as const})};
const BAR_REF={ticker:'600519.SH',market:'A' as const,date:'2024-06-19',source:'eastmoney' as const,adjustment:'qfq' as const};
describe('price_bar (spec §3.5, §7.4 G27)',()=>{
 it('OHLCV bar: every field, available_at = exchange close in UTC, origin from the table',async()=>{
  const db=memoryJudgmentInputsDb({kline:klineOf({bars:[bar('2024-06-19',1500)]})});
  const a=await buildInput({kind:'price_bar',ref:BAR_REF},db,'2024-06-19',VERIFIED);
  expect(a.snapshot).toEqual({...BAR_REF,open:1499,high:1501,low:1498,close:1500,volume:1000,amount:1500000,fields_present:['open','high','low','close','volume','amount']});
  expect(a.available_at).toBe(closeInstantUtc('2024-06-19','A'));
  expect(a.origin.locator).toBe('eastmoney:kline:A:600519.SH:2024-06-19:qfq');expect('transform' in a.origin).toBe(false);
  expect(await rebuildAndCompare(a,db,'2024-06-19',VERIFIED)).toEqual({status:'ok'});
 });
 it('close-only bar: open/high/low/volume/amount are null, fields_present = [close], transform close_only',async()=>{
  const ref={...BAR_REF,source:'datagateway' as const,ticker:'NVDA',market:'US' as const,date:'2024-06-10'};
  const db=memoryJudgmentInputsDb({kline:klineOf({close_only:true,bars:[{time:'2024-06-10',open:121.79,high:121.79,low:121.79,close:121.79,volume:0}]})});
  const a=await buildInput({kind:'price_bar',ref},db,'2024-06-10',VERIFIED);
  expect(a.snapshot).toEqual({...ref,open:null,high:null,low:null,close:121.79,volume:null,amount:null,fields_present:['close']});
  expect(a.origin.transform).toBe('close_only');expect(originKnown('price_bar',a.origin)).toBe(true);
 });
 it('unverified capability → market_unsupported; empty / missing date → not public; transient → input_unavailable',async()=>{
  const db=memoryJudgmentInputsDb({kline:klineOf({bars:[bar('2024-06-19',1500)]})});
  expect(await code(buildInput({kind:'price_bar',ref:{...BAR_REF,source:'sina'}},db,'2024-06-19'))).toBe('market_unsupported');
  expect(await buildOrAbstain({kind:'price_bar',ref:{...BAR_REF,source:'sina'}},db,'2024-06-19')).toMatchObject({abstained:true,reason:'market_unsupported'});
  expect(await code(buildInput({kind:'price_bar',ref:{...BAR_REF,date:'2024-06-18'}},db,'2024-06-19',VERIFIED))).toBe('input_not_public');
  expect(await code(buildInput({kind:'price_bar',ref:BAR_REF},memoryJudgmentInputsDb({kline:klineOf({failure:'empty'})}),'2024-06-19',VERIFIED))).toBe('input_not_public');
  expect(await code(buildInput({kind:'price_bar',ref:BAR_REF},memoryJudgmentInputsDb({kline:klineOf({failure:'transient'})}),'2024-06-19',VERIFIED))).toBe('input_unavailable');
 });
});

const obs=(series_id:string,value:number,available_at:string)=>({observation_id:observationIdOf({series_id,period_end:'2026-09-30',vintage_id:'v1'}),series_id,period_end:'2026-09-30',vintage_id:'v1',value,unit:'pct',available_at});
const O1=obs('us_ism_pmi',49.1,'2026-10-01T14:00:00.000Z'),O2=obs('us_cpi_yoy',2.9,'2026-10-15T12:30:00.000Z');
const NORM={recovery:0.4,overheat:0.3,stagflation:0.2,recession:0.1};
const MACRO:MacroFixture={fixture_version:'macro-fixture/1',observations:[O1,O2],classifications:[],series_catalog:{US:[{id:'us_cpi_yoy',weight:0.25,created_at:'2026-09-01T00:00:00.000Z',updated_at:'2026-10-01T08:00:00.000Z'},{id:'us_ism_pmi',weight:0.25,created_at:'2026-09-01T00:00:00.000Z'}]},snapshots:[
 {snapshot_id:'s-ok',region:'US',as_of:'2026-10-16',methodology_version:'v1.0',catalog_version:'cat-1',observation_ids:[O1.observation_id,O2.observation_id],regime:{primary_state:'recovery',secondary_state:'overheat',scores:NORM,norm:NORM,coverage:0.8,margin_pp:10,growth_axis:0.5,inflation_axis:-0.2},created_at:'2026-10-01T00:00:00.000Z',status:'active'},
 {snapshot_id:'s-none',region:'US',as_of:'2026-10-16',methodology_version:'v1.0',catalog_version:'cat-1',observation_ids:[O1.observation_id],regime:null,created_at:'2026-10-16T00:00:00.000Z',status:'active'},
 {snapshot_id:'s-failed',region:'US',as_of:'2026-10-16',methodology_version:'v1.0',catalog_version:'cat-1',observation_ids:[O1.observation_id],regime:null,created_at:'2026-10-16T00:00:00.000Z',status:'failed'}]};
describe('macro_observation / macro_snapshot (spec §3.7, audit F10)',()=>{
 const db=memoryJudgmentInputsDb({macro:fixtureMacroReadApi(MACRO)});
 it('observation: frozen value / vintage / available_at',async()=>{
  const a=await buildInput({kind:'macro_observation',ref:{series_id:'us_cpi_yoy',period_end:'2026-09-30',vintage_id:'v1'}},db,'2026-10-16');
  expect(a.snapshot).toEqual({series_id:'us_cpi_yoy',period_end:'2026-09-30',value:2.9,unit:'pct',vintage_id:'v1',available_at:'2026-10-15T12:30:00.000Z'});
  expect(a.available_at).toBe('2026-10-15T12:30:00.000Z');
  expect(await code(buildInput({kind:'macro_observation',ref:{series_id:'us_cpi_yoy',period_end:'2026-09-30',vintage_id:'v9'}},db,'2026-10-16'))).toBe('input_not_public');
 });
 it('snapshot: available_at is the max of its observations, not created_at; unclassified / failed / unavailable',async()=>{
  const a=await buildInput({kind:'macro_snapshot',ref:{snapshot_id:'s-ok'}},db,'2026-10-16');
  expect(a.available_at).toBe('2026-10-15T12:30:00.000Z');
  expect(a.snapshot).toEqual({snapshot_id:'s-ok',region:'US',as_of:'2026-10-16',methodology_version:'v1.0',catalog_version:'cat-1',observation_ids:[O1.observation_id,O2.observation_id],primary_state:'recovery',secondary_state:'overheat',scores:NORM,norm:NORM,coverage:0.8,margin_pp:10,growth_axis:0.5,inflation_axis:-0.2});
  expect(await code(buildInput({kind:'macro_snapshot',ref:{snapshot_id:'s-none'}},db,'2026-10-16'))).toBe('snapshot_unclassified');
  expect(await code(buildInput({kind:'macro_snapshot',ref:{snapshot_id:'s-failed'}},db,'2026-10-16'))).toBe('input_not_public');
  expect(await code(buildInput({kind:'macro_snapshot',ref:{snapshot_id:'s-ok'}},memoryJudgmentInputsDb(),'2026-10-16'))).toBe('input_unavailable');
 });
});

describe('table_rows and judgment (spec §3.5, §3.7)',()=>{
 const I='00000000-0000-4000-8000-0000000000e1';
 it('table_rows: available_at = max system timestamp of the rows; rows without one → input_unavailable (abstain), never as_of; future valid_from dropped (P1-08)',async()=>{
  const t=memoryTableClient();
  // The landed schema (20261105091000_issuers.sql) gives neither table a created_at / updated_at.
  await t.insert('issuer_industry_memberships',{issuer_id:I,scheme:'sw2021',version:'2021',code:'801010',valid_from:'2024-01-01',valid_to:null,source:'test',provenance:{}});
  await t.insert('issuer_industry_memberships',{issuer_id:I,scheme:'sw2021',version:'2021',code:'801020',valid_from:'2027-01-01',valid_to:null,source:'test',provenance:{}});
  await t.insert('industry_classifications',{scheme:'sw2021',version:'2021',code:'801010',level:1,name_zh:'农林牧渔',name_en:null,parent_code:null});
  const db=memoryJudgmentInputsDb({tables:t});
  const mem={kind:'table_rows' as const,ref:{table:'issuer_industry_memberships' as const,natural_key:`${I}:sw2021:2021`}};
  const cls={kind:'table_rows' as const,ref:{table:'industry_classifications' as const,natural_key:'sw2021:2021:801010'}};
  expect(await code(buildInput(mem,db,'2026-11-01'))).toBe('input_unavailable');            // valid_from is an effective date, not availability
  expect(await code(buildInput(cls,db,'2026-11-01'))).toBe('input_unavailable');            // no timestamp at all: never as_of end of day
  expect(await buildOrAbstain(cls,db,'2026-11-01')).toEqual({abstained:true,reason:'input_unavailable',missing:['table_rows:industry_classifications:sw2021:2021:801010']});
  expect(await code(buildInput({kind:'table_rows',ref:{table:'industry_classifications',natural_key:'sw2021:2021:999999'}},db,'2026-11-01'))).toBe('input_not_public');
  // macro_series rows carry system timestamps: available_at = max(updated_at ?? created_at) over the rows
  const mdb=memoryJudgmentInputsDb({macro:fixtureMacroReadApi(MACRO)});
  const macro=await buildInput({kind:'table_rows',ref:{table:'macro_series',natural_key:'US'}},mdb,'2026-11-01');
  if(macro.kind!=='table_rows')throw new Error('kind');
  expect(macro.available_at).toBe('2026-10-01T08:00:00.000Z');expect(macro.origin.adapter).toBe('macro_workbench');
  // …so a historical as_of before the rows were known cannot use them (registration's lookahead bound is as_of end of day)
  expect(Date.parse(macro.available_at)>Date.parse('2026-09-15T23:59:59.999Z')).toBe(true);
  // one row without a system timestamp makes the whole input unevidenced
  const bare=memoryJudgmentInputsDb({macro:fixtureMacroReadApi({...MACRO,series_catalog:{US:[...MACRO.series_catalog.US!,{id:'us_unrate',weight:0.1}]}})});
  expect(await code(buildInput({kind:'table_rows',ref:{table:'macro_series',natural_key:'US'}},bare,'2026-11-01'))).toBe('input_unavailable');
  // a future-effective row is dropped before the timestamp rule applies
  const t2=memoryTableClient();
  await t2.insert('issuer_industry_memberships',{issuer_id:I,scheme:'sw2021',version:'2021',code:'801020',valid_from:'2027-01-01',valid_to:null,source:'test',provenance:{}});
  expect(await code(buildInput(mem,memoryJudgmentInputsDb({tables:t2}),'2026-11-01'))).toBe('input_not_public');
 });
 it('judgment: public, active rows only; available_at = registered_at',async()=>{
  const base={subject_type:'macro_region',subject_key:'US',judgment_type:'macro_regime',methodology_id:'m',methodology_version:'v1',kind:'categorical',producer_kind:'rule',producer_ref:{},producer_nonce:'',as_of:'2026-10-16',registered_at:'2026-10-16T02:00:00.000Z',retrospective:false,inputs:[],inputs_hash:'0'.repeat(64),code_version:'abcdef0',batch_id:'00000000-0000-4000-8000-0000000000e2',created_at:'2026-10-16T02:00:00.000Z',horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null,condition:null} as const;
  const active={...base,judgment_id:'00000000-0000-8000-8000-0000000000e3',abstained:false,abstain_reason:null,claim:{selected:'recovery',classes:['recovery','overheat','stagflation','recession'],scores_are_not_probabilities:true}} as unknown as JudgmentRow;
  const abstained={...base,judgment_id:'00000000-0000-8000-8000-0000000000e4',abstained:true,abstain_reason:'x',claim:null} as unknown as JudgmentRow;
  const db=memoryJudgmentInputsDb({judgments:[active,abstained]});
  const a=await buildInput({kind:'judgment',ref:{judgment_id:active.judgment_id}},db,'2026-10-17');
  expect(a.snapshot).toEqual({judgment_id:active.judgment_id,claim:active.claim,as_of:'2026-10-16'});
  expect(a.available_at).toBe('2026-10-16T02:00:00.000Z');
  expect(await code(buildInput({kind:'judgment',ref:{judgment_id:abstained.judgment_id}},db,'2026-10-17'))).toBe('input_not_public');
 });
});

describe('whitelist, hashing and rebuild (spec §3.5, §6.2 step 1)',()=>{
 it('legacy_fill and document_span are never public inputs',async()=>{
  const db=memoryJudgmentInputsDb();
  expect(await code(buildInput({kind:'legacy_fill',ref:{recommendation_id:'r'}} as unknown as InputRequest,db,'2026-01-01'))).toBe('input_not_allowed');
  expect(await code(buildInput({kind:'document_span',ref:{doc:'d'}} as unknown as InputRequest,db,'2026-01-01'))).toBe('input_not_allowed');
  const fake={kind:'legacy_fill',ref:{recommendation_id:'r'},snapshot:{},hash:digest({}),available_at:'2026-01-01T00:00:00.000Z',origin:{publisher:'p',adapter:'eastmoney',locator:'l'}} as unknown as Input;
  expect(await code(rebuildAndCompare(fake,db,'2026-01-01'))).toBe('input_not_allowed');
 });
 it('inputs_hash and sortInputs ignore array order',async()=>{
  const db=memoryJudgmentInputsDb({macro:fixtureMacroReadApi(MACRO)});
  const a=await buildInput({kind:'macro_snapshot',ref:{snapshot_id:'s-ok'}},db,'2026-10-16');
  const b=await buildInput({kind:'macro_observation',ref:{series_id:'us_ism_pmi',period_end:'2026-09-30',vintage_id:'v1'}},db,'2026-10-16');
  const c=await buildInput({kind:'macro_observation',ref:{series_id:'us_cpi_yoy',period_end:'2026-09-30',vintage_id:'v1'}},db,'2026-10-16');
  expect(inputsHashOf([a,b,c])).toBe(inputsHashOf([c,a,b]));
  expect(sortInputs([c,a,b]).map(x=>inputLabel(x))).toEqual(sortInputs([a,b,c]).map(x=>inputLabel(x)));
  expect(sortInputs([c,a,b]).map(x=>x.kind)).toEqual(['macro_observation','macro_observation','macro_snapshot']);
 });
 it('rebuildAndCompare names the mismatching field; a vanished row is input_not_public',async()=>{
  const db=memoryJudgmentInputsDb({macro:fixtureMacroReadApi(MACRO)});
  const a=await buildInput({kind:'macro_snapshot',ref:{snapshot_id:'s-ok'}},db,'2026-10-16');
  if(a.kind!=='macro_snapshot')throw new Error('kind');
  const tampered={...a,snapshot:{...a.snapshot,coverage:0.9}};
  expect(await rebuildAndCompare({...tampered,hash:digest(tampered.snapshot)},db,'2026-10-16')).toEqual({status:'input_snapshot_mismatch',field:'snapshot'});
  expect(await rebuildAndCompare(tampered,db,'2026-10-16')).toEqual({status:'input_snapshot_mismatch',field:'hash'});
  expect(await rebuildAndCompare({...a,available_at:'2026-10-01T00:00:00.000Z'},db,'2026-10-16')).toEqual({status:'input_snapshot_mismatch',field:'available_at'});
  expect(await rebuildAndCompare({...a,origin:{...a.origin,locator:'macro_snapshots:other'}},db,'2026-10-16')).toEqual({status:'input_snapshot_mismatch',field:'origin'});
  expect(await rebuildAndCompare({...a,ref:{...a.ref,extra:'x'} as never},db,'2026-10-16')).toEqual({status:'input_snapshot_mismatch',field:'ref'});
  expect(await rebuildAndCompare(a,memoryJudgmentInputsDb({macro:fixtureMacroReadApi({...MACRO,snapshots:[]})}),'2026-10-16')).toEqual({status:'input_not_public',code:'input_not_public'});
  expect(canonicalize(a.ref)).toBe('{"snapshot_id":"s-ok"}');
 });
});

describe('review fixes H-01..H-04',()=>{
 it('H-01: ticker ↔ market identity is checked before the capability lookup and the close time',async()=>{
  const seen:string[]=[];
  const opts={capability:(_s:unknown,m:string)=>{seen.push(m);return {status:'verified' as const};}} as unknown as BuildOptions;
  const db=memoryJudgmentInputsDb({kline:klineOf({bars:[bar('2024-06-18',100)]})});
  const nv={ticker:'NVDA',date:'2024-06-18',adjustment:'qfq' as const};
  expect(await code(buildInput({kind:'price_bar',ref:{...nv,market:'A',source:'eastmoney'}},db,'2024-06-18',opts))).toBe('input_not_public');
  expect(await code(buildInput({kind:'price_bar',ref:{...nv,market:'A',source:'datagateway'}},db,'2024-06-18',opts))).toBe('input_not_public');
  expect(await code(buildInput({kind:'price_bar',ref:{ticker:'600519.SH',date:'2024-06-18',adjustment:'qfq',market:'US',source:'eastmoney'}},db,'2024-06-18',opts))).toBe('input_not_public');
  expect(seen).toEqual([]);
  const a=await buildInput({kind:'price_bar',ref:{...nv,market:'US',source:'eastmoney'}},db,'2024-06-18',opts);
  expect(seen).toEqual(['US']);expect(a.available_at).toBe(closeInstantUtc('2024-06-18','US'));
 });
 it('H-02: an unfinished daily bar is never frozen (observedAt)',async()=>{
  const db=memoryJudgmentInputsDb({kline:klineOf({bars:[bar('2026-11-06',1500)]})});
  const req:InputRequest={kind:'price_bar',ref:{...BAR_REF,date:'2026-11-06'}};
  const early=rawBuild(req,db,'2026-11-06','2026-11-06T02:00:00.000Z',VERIFIED);
  expect(await code(early)).toBe('input_unavailable');
  expect(await rawAbstain(req,db,'2026-11-06','2026-11-06T02:00:00.000Z',VERIFIED)).toMatchObject({abstained:true,reason:'input_unavailable'});
  const a=await rawBuild(req,db,'2026-11-06','2026-11-06T07:01:00.000Z',VERIFIED);
  expect(a.available_at).toBe(closeInstantUtc('2026-11-06','A'));
  expect(await rawRebuild(a,db,'2026-11-06','2026-11-06T02:00:00.000Z',VERIFIED).then(()=>'ok',(e:unknown)=>e instanceof JudgmentError?e.code:'other')).toBe('input_unavailable');
 });
 it('H-03: table_rows availability is max(created_at, updated_at); updated_at < created_at is unevidenced',async()=>{
  const mk=(row:object)=>memoryJudgmentInputsDb({macro:fixtureMacroReadApi({...MACRO,series_catalog:{US:[{id:'x',weight:1,...row}]}})});
  const req:InputRequest={kind:'table_rows',ref:{table:'macro_series',natural_key:'US'}};
  const ok=await buildInput(req,mk({created_at:'2026-11-06T00:00:00.000Z',updated_at:'2026-11-07T00:00:00.000Z'}),'2026-11-08');
  expect(ok.available_at).toBe('2026-11-07T00:00:00.000Z');
  expect(await code(buildInput(req,mk({created_at:'2026-11-06T00:00:00.000Z',updated_at:'2026-01-01T00:00:00.000Z'}),'2026-11-08'))).toBe('input_unavailable');
  expect((await buildInput(req,mk({created_at:'2026-11-06T00:00:00.000Z'}),'2026-11-08')).available_at).toBe('2026-11-06T00:00:00.000Z');
 });
 it('H2-01: a present but malformed timestamp is unevidenced, never silently dropped',async()=>{
  const mk=(row:object)=>memoryJudgmentInputsDb({macro:fixtureMacroReadApi({...MACRO,series_catalog:{US:[{id:'x',weight:1,...row}]}})});
  const req:InputRequest={kind:'table_rows',ref:{table:'macro_series',natural_key:'US'}};
  expect(await code(buildInput(req,mk({created_at:'2026-11-06T00:00:00.000Z',updated_at:'garbage'}),'2026-11-08'))).toBe('input_unavailable');
  expect(await code(buildInput(req,mk({created_at:'garbage',updated_at:'2026-11-07T00:00:00.000Z'}),'2026-11-08'))).toBe('input_unavailable');
  expect(await code(buildInput(req,mk({created_at:'2026-11-06T00:00:00.000Z',updated_at:12345}),'2026-11-08'))).toBe('input_unavailable');
 });
 it('H-04: sparse arrays are rejected; a snapshot must survive a JSON round trip',async()=>{
  const holes=[1,,3] as unknown[];
  expect(()=>canonicalize(holes)).toThrow(JudgmentError);
  expect(()=>canonicalize({a:{b:[holes]}})).toThrow(JudgmentError);
  expect(()=>jsonClean(holes)).toThrow(JudgmentError);
  const db=memoryJudgmentInputsDb({macro:fixtureMacroReadApi(MACRO)});
  const a=await buildInput({kind:'macro_snapshot',ref:{snapshot_id:'s-ok'}},db,'2026-10-16');
  if(a.kind!=='macro_snapshot')throw new Error('kind');
  const wrapped={...a,snapshot:{...a.snapshot,observation_ids:Object.assign([...a.snapshot.observation_ids],{extra:1})}};
  expect(await code(rebuildAndCompare(wrapped as Input,db,'2026-10-16'))).toBe('invalid_parameter');
 });
 it('minor: financial_metric label carries issuer and market; asOf must be a real date',async()=>{
  const l=inputLabel({kind:'financial_metric',ref:{issuer_id:'I',market:'US',metric:'ttm_revenue',period_start:'a',period_end:'b'}});
  expect(l).toContain('I');expect(l).toContain('US');
  expect(await code(buildInput({kind:'judgment',ref:{judgment_id:'x'}},memoryJudgmentInputsDb(),'2026-02-31'))).toBe('invalid_parameter');
 });
});
