// src/lib/judgments/target.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {JudgmentError} from './errors';
import {memoryJudgmentInputsDb} from './inputs-db';
import {DEFAULT_GRACE_DAYS,defaultResolveTarget,graceDaysOf,labelPolicyOf,nthQuarterEndAfter,retrospectiveOf,settleWindow,stepQuarter,targetConsistent} from './target';
import type {Horizon,Input,Target} from './types';
import {FIXED_NOW,filingCandidate,publishFacts} from './testing/facts-fixture';

const codeOf=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof JudgmentError?e.code:'other';}};
const bar=(date:string)=>({kind:'price_bar',ref:{ticker:'X',market:'US',date,source:'eastmoney',adjustment:'qfq'},snapshot:{ticker:'X',market:'US',date,source:'eastmoney',adjustment:'qfq',open:null,high:null,low:null,close:1,volume:null,amount:null,fields_present:['close']},hash:'h',available_at:`${date}T20:00:00.000Z`,origin:{publisher:'p',adapter:'eastmoney',locator:'l'}}) as Input;
const H=(unit:Horizon['unit'],n:number):Horizon=>({unit,n});
const I='00000000-0000-4000-8000-0000000000f1';

describe('defaultResolveTarget (spec §3.4)',()=>{
 const empty=memoryJudgmentInputsDb();
 it('session_index from the latest price_bar input; no bar → target_unresolvable',async()=>{
  const item={subject:{type:'issuer' as const,key:I},asOf:'2024-06-12'};
  expect(await defaultResolveTarget(H('trading_sessions',5),item,[bar('2024-06-10'),bar('2024-06-12')],empty)).toEqual({kind:'session_index',base_date:'2024-06-12',n:5});
  expect(await defaultResolveTarget(H('trading_sessions',5),item,[],empty)).toEqual({abstained:true,reason:'target_unresolvable',missing:['price_bar']});
 });
 it('date = as_of + n days (leap day); period = month(as_of) + n, n = 0 is the as_of month',async()=>{
  const item={subject:{type:'macro_region' as const,key:'US'},asOf:'2024-02-28'};
  expect(await defaultResolveTarget(H('calendar_days',1),item,[],empty)).toEqual({kind:'date',date:'2024-02-29'});
  expect(await defaultResolveTarget(H('calendar_months',3),{...item,asOf:'2024-11-15'},[],empty)).toEqual({kind:'period',period:'2025-02'});
  expect(await defaultResolveTarget(H('calendar_months',0),{...item,asOf:'2024-11-15'},[],empty)).toEqual({kind:'period',period:'2024-11'});
 });
 it('fiscal_period: anchor = latest published filing period_end with available_date ≤ as_of, multi-quarter extrapolation, frozen calendar',async()=>{
  const facts=memoryFactsDb();facts.setNow(FIXED_NOW);
  await publishFacts(facts,{issuer:I,market:'US',facts:[],filings:[
   filingCandidate({sourceRef:'k23',availableDate:'2024-02-01',periodEnd:'2023-12-31',formType:'10-K'}),
   filingCandidate({sourceRef:'q124',availableDate:'2024-05-01',periodEnd:'2024-03-31'}),
   filingCandidate({sourceRef:'q224-late',availableDate:'2024-08-01',periodEnd:'2024-06-30'})]});
  await publishFacts(facts,{issuer:I,market:'US',facts:[],publish:false,filings:[filingCandidate({sourceRef:'staged',availableDate:'2024-07-10',periodEnd:'2024-06-30'})]});
  const tables=memoryTableClient();
  await tables.insert('stocks_universe',{ticker:'XYZ',name:'XYZ',market:'US'});
  await tables.insert('issuer_securities',{issuer_id:I,ticker:'XYZ',valid_from:'2000-01-01',valid_to:null,is_primary:true});
  const db=memoryJudgmentInputsDb({facts,tables});
  const item={subject:{type:'issuer' as const,key:I},asOf:'2024-07-20'};
  expect(await defaultResolveTarget(H('fiscal_quarters',1),item,[],db)).toEqual({kind:'fiscal_period',period_end:'2024-09-30',calendar:{anchor_period_end:'2024-03-31',months:3},extrapolated:true});
  expect(await defaultResolveTarget(H('fiscal_quarters',3),item,[],db)).toMatchObject({period_end:'2025-03-31',calendar:{anchor_period_end:'2024-03-31',months:3}});
  expect(await defaultResolveTarget(H('fiscal_quarters',1),{...item,asOf:'2024-08-02'},[],db)).toMatchObject({period_end:'2024-09-30',calendar:{anchor_period_end:'2024-06-30',months:3}});
  expect(await defaultResolveTarget(H('fiscal_quarters',1),{...item,asOf:'2024-01-15'},[],db)).toEqual({abstained:true,reason:'target_unresolvable',missing:['published_filing']});
  expect(await defaultResolveTarget(H('fiscal_quarters',1),{subject:{type:'macro_region',key:'US'},asOf:'2024-07-20'},[],db)).toMatchObject({reason:'target_unresolvable',missing:['issuer_subject']});
  expect(await defaultResolveTarget(H('fiscal_quarters',1),{subject:{type:'issuer',key:'00000000-0000-4000-8000-0000000000f9'},asOf:'2024-07-20'},[],db)).toMatchObject({missing:['facts_market']});
 });
 it('stepQuarter keeps month ends on month ends and clamps other days; nthQuarterEndAfter counts strictly after as_of',()=>{
  expect(stepQuarter('2023-11-30',1)).toBe('2024-02-29');
  expect(stepQuarter('2024-08-31',2)).toBe('2025-02-28');
  expect(stepQuarter('2024-03-30',1)).toBe('2024-06-30');
  expect(stepQuarter('2023-12-30',1)).toBe('2024-03-30');
  expect(nthQuarterEndAfter('2024-03-31','2024-06-30',1)).toBe('2024-09-30');
  expect(nthQuarterEndAfter('2024-03-31','2024-06-29',1)).toBe('2024-06-30');
 });
});

describe('settleWindow (plan 契约补充：must equal the SQL recomputation)',()=>{
 it('settle_after per target kind at 00:00Z; settle_by = + grace_days (defaults per unit, leap years, month ends)',()=>{
  expect(settleWindow({kind:'session_index',base_date:'2024-02-27',n:5},H('trading_sessions',5),{})).toEqual({settle_after:'2024-03-03T00:00:00.000Z',settle_by:'2024-05-02T00:00:00.000Z'});
  expect(settleWindow({kind:'date',date:'2024-12-31'},H('calendar_days',30),{})).toEqual({settle_after:'2024-12-31T00:00:00.000Z',settle_by:'2025-01-30T00:00:00.000Z'});
  expect(settleWindow({kind:'period',period:'2024-02'},H('calendar_months',3),{})).toEqual({settle_after:'2024-03-01T00:00:00.000Z',settle_by:'2024-03-31T00:00:00.000Z'});
  expect(settleWindow({kind:'period',period:'2023-02'},H('calendar_months',3),{})).toMatchObject({settle_after:'2023-03-01T00:00:00.000Z'});
  expect(settleWindow({kind:'period',period:'2024-12'},H('calendar_months',3),{})).toMatchObject({settle_after:'2025-01-01T00:00:00.000Z'});
  expect(settleWindow({kind:'fiscal_period',period_end:'2024-09-30',calendar:{anchor_period_end:'2024-06-30',months:3},extrapolated:true},H('fiscal_quarters',1),{})).toEqual({settle_after:'2024-10-01T00:00:00.000Z',settle_by:'2025-01-29T00:00:00.000Z'});
  expect(settleWindow({kind:'date',date:'2024-12-31'},H('calendar_days',30),{grace_days:7}).settle_by).toBe('2025-01-07T00:00:00.000Z');
  expect(DEFAULT_GRACE_DAYS).toEqual({trading_sessions:60,calendar_days:30,calendar_months:30,fiscal_quarters:120});
 });
 it('grace_days follows time.ts graceDaysOf (integer >= 1, number or digit string; SQL twin); label_policy must be one of the two policies',()=>{
  for(const g of [0,1.5,'x'])expect(codeOf(()=>graceDaysOf({grace_days:g},H('calendar_days',1)))).toBe('invalid_parameter');
  expect(graceDaysOf({grace_days:'10'},H('calendar_days',1))).toBe(10);
  expect(labelPolicyOf({label_policy:'cutoff_vintage'})).toBe('cutoff_vintage');
  expect(codeOf(()=>labelPolicyOf({}))).toBe('invalid_parameter');
  expect(codeOf(()=>labelPolicyOf({label_policy:'latest'}))).toBe('invalid_parameter');
 });
});

describe('targetConsistent and retrospectiveOf (spec §3.4, §6.2 step 2)',()=>{
 it('a target must match the horizon unit, n and as_of; session_index needs the price_bar it is based on',()=>{
  expect(targetConsistent({kind:'date',date:'2024-03-01'},H('calendar_days',1),'2024-02-29',[])).toBe(true);
  expect(targetConsistent({kind:'date',date:'2024-03-02'},H('calendar_days',1),'2024-02-29',[])).toBe(false);
  expect(targetConsistent({kind:'period',period:'2025-02'},H('calendar_months',3),'2024-11-30',[])).toBe(true);
  expect(targetConsistent({kind:'period',period:'2025-02'},H('calendar_days',3),'2024-11-30',[])).toBe(false);
  expect(targetConsistent({kind:'session_index',base_date:'2024-06-12',n:5},H('trading_sessions',5),'2024-06-12',[bar('2024-06-12')])).toBe(true);
  expect(targetConsistent({kind:'session_index',base_date:'2024-06-12',n:5},H('trading_sessions',5),'2024-06-12',[bar('2024-06-11')])).toBe(false);
  const fp:Target={kind:'fiscal_period',period_end:'2024-09-30',calendar:{anchor_period_end:'2024-03-31',months:3},extrapolated:true};
  expect(targetConsistent(fp,H('fiscal_quarters',1),'2024-07-20',[])).toBe(true);
  expect(targetConsistent(fp,H('fiscal_quarters',2),'2024-07-20',[])).toBe(false);
 });
 it('retrospective iff as_of < registered_at date, or the earliest due instant ≤ registered_at, or the label was already available',()=>{
  const base={as_of:'2026-11-05',registered_at:'2026-11-05T23:00:00.000Z',settle_after:'2027-02-01T00:00:00.000Z',label_available_at:null};
  expect(retrospectiveOf(base)).toBe(false);
  expect(retrospectiveOf({...base,registered_at:'2026-11-06T00:00:00.000Z'})).toBe(true);
  expect(retrospectiveOf({...base,settle_after:'2026-11-05T00:00:00.000Z'})).toBe(true);
  expect(retrospectiveOf({...base,label_available_at:'2026-11-05T22:59:59.999Z'})).toBe(true);
  expect(retrospectiveOf({...base,label_available_at:'2027-03-01T00:00:00.000Z'})).toBe(false);
  expect(retrospectiveOf({...base,settle_after:null})).toBe(false);
 });
});
