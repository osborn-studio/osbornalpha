// src/lib/judgments/inputs-db.test.ts
import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import type {Row,TableClient} from '@/lib/db/table-client';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {anonJudgmentInputsDb,memoryJudgmentInputsDb,normalizeTableRows} from './inputs-db';
import {MacroUnavailable,fixtureMacroReadApi} from './macro-api';
import type {JudgmentRow} from './types';
import {FIXED_NOW,factCandidate,filingCandidate,publishFacts} from './testing/facts-fixture';

const I='00000000-0000-4000-8000-0000000000b1';
const code=(p:Promise<unknown>)=>p.then(()=>'ok',(e:{code?:string;name?:string})=>e.code??e.name??'error');
async function tables(){
 const t=memoryTableClient();
 await t.insert('industry_classifications',{scheme:'sw2021',version:'2021',code:'801010',level:1,name_zh:'农林牧渔',name_en:null,parent_code:null});
 await t.insert('issuer_industry_memberships',{issuer_id:I,scheme:'sw2021',version:'2021',code:'801010',valid_from:'2024-01-01',valid_to:null,source:'test',provenance:{}});
 await t.insert('issuer_industry_memberships',{issuer_id:I,scheme:'sw2021',version:'2021',code:'801020',valid_from:'2020-01-01',valid_to:'2024-01-01',source:'test',provenance:{}});
 await t.insert('issuer_industry_memberships',{issuer_id:I,scheme:'gics',version:'2023',code:'4520',valid_from:'2020-01-01',valid_to:null,source:'test',provenance:{}});
 for(const [ticker,market] of [['AAA','US'],['AAA.OLD','US'],['0001.HK','HK']] as const)await t.insert('stocks_universe',{ticker,name:ticker,market});
 await t.insert('issuer_securities',{issuer_id:I,ticker:'AAA.OLD',valid_from:'2010-01-01',valid_to:'2020-01-01',is_primary:true});
 await t.insert('issuer_securities',{issuer_id:I,ticker:'AAA',valid_from:'2020-01-01',valid_to:null,is_primary:true});
 await t.insert('issuer_securities',{issuer_id:I,ticker:'0001.HK',valid_from:'2020-01-01',valid_to:null,is_primary:false});
 return t;
}
const J:JudgmentRow={judgment_id:'00000000-0000-8000-8000-0000000000c1',subject_type:'macro_region',subject_key:'US',judgment_type:'macro_regime',methodology_id:'m',methodology_version:'v1',kind:'categorical',producer_kind:'rule',producer_ref:{},producer_nonce:'',as_of:'2026-11-01',registered_at:'2026-11-02T03:04:05.123Z',retrospective:false,inputs:[],inputs_hash:'0'.repeat(64),abstained:true,abstain_reason:'r',claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null,code_version:'abcdef0',batch_id:'00000000-0000-4000-8000-0000000000c2',created_at:'2026-11-02T03:04:05.123Z'};

describe('memoryJudgmentInputsDb (spec §5.7)',()=>{
 it('tableRows parses natural keys, keeps every row of the key, normalises and sorts deterministically',async()=>{
  const db=memoryJudgmentInputsDb({tables:await tables()});
  const rows=await db.tableRows('issuer_industry_memberships',`${I}:sw2021:2021`);
  expect(rows.map(r=>r.code).sort()).toEqual(['801010','801020']);
  expect(rows).toEqual(normalizeTableRows(rows));
  expect(await db.tableRows('issuer_industry_memberships',`${I}:sw2021:2021`)).toEqual(rows);
  expect((await db.tableRows('industry_classifications','sw2021:2021:801010'))[0]).toMatchObject({name_zh:'农林牧渔'});
  expect(await code(db.tableRows('industry_classifications','sw2021:801010'))).toBe('input_not_allowed');
  expect(await code(db.tableRows('issuers' as never,'x'))).toBe('input_not_allowed');
  expect(await code(db.tableRows('macro_series','US'))).toBe('MacroUnavailable');
 });
 it('macro_series rows come from MacroReadApi.seriesCatalog with ISO timestamps',async()=>{
  const macro=fixtureMacroReadApi({fixture_version:'macro-fixture/1',observations:[],snapshots:[],classifications:[],series_catalog:{US:[{id:'us_cpi_yoy',weight:0.25,updated_at:'2026-10-01T00:00:00+00:00'}]}});
  const db=memoryJudgmentInputsDb({macro});
  expect(await db.tableRows('macro_series','US')).toEqual([{id:'us_cpi_yoy',weight:0.25,updated_at:'2026-10-01T00:00:00.000Z'}]);
  expect(await code(db.tableRows('macro_series','HK'))).toBe('input_not_allowed');
 });
 it('issuerPrimarySecurity uses the holding window and the stocks_universe market; ambiguity → null',async()=>{
  const t=await tables();const db=memoryJudgmentInputsDb({tables:t});
  expect(await db.issuerPrimarySecurity(I,'2015-06-01')).toEqual({ticker:'AAA.OLD',market:'US'});
  expect(await db.issuerPrimarySecurity(I,'2024-06-01')).toEqual({ticker:'AAA',market:'US'});
  expect(await db.issuerPrimarySecurity(I,'2005-01-01')).toBeNull();
  await t.insert('issuer_securities',{issuer_id:I,ticker:'0001.HK',valid_from:'2026-01-01',valid_to:null,is_primary:true});
  expect(await db.issuerPrimarySecurity(I,'2026-06-01')).toBeNull();   // two primaries in the window
 });
 it('publicJudgment returns clones of fixture rows; unknown ids → null',async()=>{
  const db=memoryJudgmentInputsDb({judgments:[J]});
  const a=(await db.publicJudgment(J.judgment_id))!;a.subject_key='CN';
  expect((await db.publicJudgment(J.judgment_id))!.subject_key).toBe('US');
  expect(await db.publicJudgment('00000000-0000-8000-8000-0000000000ff')).toBeNull();
  expect(await db.publicJudgment('not-a-uuid')).toBeNull();
 });
 it('facts: factsByIds hides non-ok rows like the anon policy; readFacts drops includeNonOk',async()=>{
  const f=memoryFactsDb();f.setNow(FIXED_NOW);
  const filing=filingCandidate({sourceRef:'k1',availableDate:'2024-02-01',periodEnd:'2023-12-31',formType:'10-K'});
  const ok=factCandidate({filingRef:'k1',concept:'revenue',periodStart:'2023-01-01',periodEnd:'2023-12-31',duration:'12M',value:'10'});
  const bad=factCandidate({filingRef:'k1',concept:'net_income_parent',periodStart:'2023-01-01',periodEnd:'2023-12-31',duration:'12M',value:'1'});
  const out=await publishFacts(f,{issuer:I,market:'US',filings:[filing],facts:[ok,bad],quarantineRawHashes:[bad.rawHash]});
  const db=memoryJudgmentInputsDb({facts:f});
  expect((await db.facts.factsByIds([...out.factIds.values()])).map(r=>r.concept)).toEqual(['revenue']);
  const spy=vi.spyOn(f,'readFacts');
  await db.facts.readFacts(I,'US',{concepts:['revenue','net_income_parent'],asOf:'2024-12-31',history:true});
  expect(spy.mock.calls[0][2]).toEqual({concepts:['revenue','net_income_parent'],asOf:'2024-12-31',history:true});
 });
});

function fakeAnon(rows:Record<string,Row[]>,rpc:(fn:string,args:Record<string,unknown>)=>unknown){
 const from=(t:string)=>{
  const filters:[string,unknown][]=[];let lo=0,hi=Number.MAX_SAFE_INTEGER;
  const b:any={select:()=>b,eq:(k:string,v:unknown)=>{filters.push([k,v]);return b;},is:(k:string,v:unknown)=>{filters.push([k,v]);return b;},in:()=>b,gte:()=>b,lte:()=>b,lt:()=>b,order:()=>b,
   range:(f:number,to:number)=>{lo=f;hi=to;return b;},
   then:(res:(v:unknown)=>unknown,rej?:(e:unknown)=>unknown)=>Promise.resolve({data:(rows[t]??[]).filter(r=>filters.every(([k,v])=>r[k]===v)).slice(lo,hi+1),error:null}).then(res,rej)};
  return b;
 };
 const calls:[string,Record<string,unknown>][]=[];
 return {client:{from,rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push([fn,args]);return {data:rpc(fn,args),error:null};}} as unknown as SupabaseClient,calls};
}
describe('anonJudgmentInputsDb (spec §3.5: anon read paths only)',()=>{
 it('reads facts through the read_facts rpc without non-ok rows, judgments through RLS select, normalises timestamps',async()=>{
  const {client,calls}=fakeAnon({judgments:[{...J,registered_at:'2026-11-02T03:04:05.123456+00:00',created_at:'2026-11-02 03:04:05.123+00',as_of:'2026-11-01'}]},()=>({state_rev:4,truncated:false,row_count:0,rows:[]}));
  const db=anonJudgmentInputsDb({anon:client});
  expect(await db.facts.readFacts(I,'US',{concepts:['revenue'],asOf:'2024-12-31',history:true})).toEqual({stateRev:4,rows:[],truncated:false});
  expect(calls[0][0]).toBe('read_facts');expect(calls[0][1]).toMatchObject({p_include_non_ok:false,p_history:true,p_as_of:'2024-12-31'});
  const j=(await db.publicJudgment(J.judgment_id))!;
  expect([j.registered_at,j.created_at,j.as_of]).toEqual(['2026-11-02T03:04:05.123Z','2026-11-02T03:04:05.123Z','2026-11-01']);
  expect(await db.kline({ticker:'AAPL',market:'US',adjustment:'qfq',source:'sina',from:'2024-01-02',to:'2024-01-03',signal:AbortSignal.timeout(1000)})).toEqual({failure:'unsupported'});
  await expect(db.macro.snapshot('x')).rejects.toBeInstanceOf(MacroUnavailable);
 });
});

const capped=(t:TableClient,max:number):TableClient=>({...t,select:(table,match,o)=>t.select(table,match,{...o,limit:Math.min(o?.limit??max,max)})});
describe('review fixes (filings visibility, paging, parameters)',()=>{
 it('filingsOfIssuer drops unpublished (mapping_gen 0) filings before applying limit',async()=>{
  const f=memoryFactsDb();f.setNow(FIXED_NOW);
  await publishFacts(f,{issuer:I,market:'US',filings:[filingCandidate({sourceRef:'a',availableDate:'2024-01-01',periodEnd:'2023-12-31'}),filingCandidate({sourceRef:'b',availableDate:'2024-02-01',periodEnd:'2023-12-31'})],facts:[]});
  await publishFacts(f,{issuer:I,market:'US',filings:[filingCandidate({sourceRef:'c',availableDate:'2024-09-01',periodEnd:'2024-06-30'})],facts:[],publish:false});
  const db=memoryJudgmentInputsDb({facts:f});
  const all=await db.facts.filingsOfIssuer(I,'US',{});
  expect(all.every(x=>x.mapping_gen>0)).toBe(true);expect(all).toHaveLength(2);
  expect(await db.facts.filingsOfIssuer(I,'US',{limit:1})).toHaveLength(1);
  expect((await db.facts.filingsOfIssuer(I,'US',{limit:1}))[0].available_date).toBe('2024-02-01');
 });
 it('tableRows and issuerPrimarySecurity page until an empty page under a max_rows cap',async()=>{
  const t=await tables();
  for(let i=0;i<7;i++)await t.insert('issuer_industry_memberships',{issuer_id:I,scheme:'sw2021',version:'2021',code:`9${i}`,valid_from:'2024-01-01',valid_to:null,source:'test',provenance:{}});
  const db=memoryJudgmentInputsDb({tables:capped(t,3)});
  expect(await db.tableRows('issuer_industry_memberships',`${I}:sw2021:2021`)).toHaveLength(9);
  expect(await db.issuerPrimarySecurity(I,'2024-06-01')).toEqual({ticker:'AAA',market:'US'});
 });
});
