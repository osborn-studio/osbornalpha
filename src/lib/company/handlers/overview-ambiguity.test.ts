import {describe,it,expect,vi} from 'vitest';
import type {FactRow} from '@/lib/facts/types';
import type {OverviewResponse} from '../client';
import {companyRoute} from '../route';
import {CN,eventRow,emptySnapshot,makeDeps,realFact,realEvidence,seededTables,summary,cnSummary} from '../route-test-kit';
import {overviewHandler,OVERVIEW_PARAMS,latestBlock} from './overview';

const wiring=vi.hoisted(()=>({deps:null as unknown,admin:vi.fn(async()=>({id:'admin'}))}));
vi.mock('../deps',()=>({productionReadDeps:()=>wiring.deps}));
vi.mock('@/lib/admin/auth',()=>({requireAdminUser:wiring.admin}));

// Exact reported 2025 values; 2024 controls reproduce the two independent YoY candidates.
function mixed():FactRow[]{
 return ['CNY','USD'].flatMap((unit,i)=>[
  realFact({concept:'revenue',unit,value:['2610240000','373259000'][i],period_start:'2025-01-01',period_end:'2025-12-31',available_date:'2026-04-29'}),
  realFact({concept:'net_income_parent',unit,value:['558857000','79915000'][i],period_start:'2025-01-01',period_end:'2025-12-31',available_date:'2026-04-29'}),
  realFact({concept:'operating_cash_flow',statement:'CF',unit,value:['976609000','139652000'][i],period_start:'2025-01-01',period_end:'2025-12-31',available_date:'2026-04-29'}),
  realFact({concept:'revenue',unit,value:['2600982000','356333000'][i],period_start:'2024-01-01',period_end:'2024-12-31',available_date:'2025-04-29'}),
 ]).map(r=>({...r,value_text:r.value}));
}
async function read(rows:FactRow[],opts:{truncated?:boolean;missing?:string[];mode?:'public'|'admin';cn?:boolean;live?:boolean;status?:number;eventFact?:FactRow}={}){
 const deps=makeDeps(await seededTables());
 realEvidence(deps,rows);for(const id of opts.missing??[])deps.noEvidence.add(id);
 vi.mocked(deps.snapshot).mockResolvedValue(emptySnapshot({rows,truncated:opts.truncated??false,filings:[opts.cn?cnSummary({availableDate:'2026-04-29'}):summary({availableDate:'2026-04-29'})]}));
 if(opts.eventFact){const f=opts.eventFact;vi.mocked(deps.company.eventsOfIssuer).mockResolvedValue({rows:[eventRow({payload:{periodStart:f.period_start,periodEnd:f.period_end,duration:f.duration,headline:{[f.concept]:{factId:f.fact_id,value:f.value,unit:f.unit}},ambiguousUnits:[]}})],nextCursor:null});}
 wiring.deps=deps;
 const ticker=opts.cn?'600519.SH':'AAPL';
 const response=await companyRoute({tag:'overview',mode:opts.mode??'public',params:OVERVIEW_PARAMS,handler:overviewHandler})(new Request(`https://test.invalid/api/companies/${ticker}/overview${opts.live?'?asOf=2026-05-01':''}`),{params:Promise.resolve({ticker})});
 expect(response.status).toBe(opts.status??200);
 return await response.json() as OverviewResponse;
}
const reasons={facts:{revenue:'multiple_units',net_income_parent:'multiple_units',operating_cash_flow:'multiple_units'},derived:{revenue_yoy:'multiple_units'}};
describe('overview exact-period multiunit explanation via normal GET factory and real evidence gate',()=>{
 it.each(['public','admin'] as const)('%s explains confirmed suppression without choosing a currency or returning diagnostic evidence',async mode=>{
  const rows=mixed();const body=await read(rows,{mode});
  expect(body.latest).toMatchObject({periodKey:'2025-01-01:2025-12-31:12M',facts:{revenue:null,net_income_parent:null,operating_cash_flow:null},derived:{gross_margin:null,revenue_yoy:null},unavailableReasons:reasons});
  expect(body.evidence).toEqual({});expect(body.withheld).toEqual({evidenceIncomplete:0,citationPending:0});
  for(const row of rows)expect(JSON.stringify(body.latest)).not.toContain(row.fact_id);
  expect(JSON.stringify(body.latest)).not.toMatch(/CNY|USD/);
 });
 it('uses the same rule with explicit asOf and live events',async()=>{
  expect((await read(mixed(),{live:true})).latest?.unavailableReasons).toEqual(reasons);
 });
 it('preserves sparse unique facts, missing gross-margin inputs, and a single derived candidate',async()=>{
  const rows=mixed().filter(r=>r.unit==='CNY'||r.concept==='net_income_parent');
  const body=await read(rows);
  expect(body.latest?.facts.revenue).toMatchObject({kind:'fact',value:'2610240000',unit:'CNY'});
  expect(body.latest?.derived.revenue_yoy).toMatchObject({kind:'derived',unit:'pure'});
  expect(body.latest?.derived.gross_margin).toBeNull();
  expect(body.latest?.unavailableReasons).toEqual({facts:{net_income_parent:'multiple_units'},derived:{}});
 });
 it('requires all candidates and derived inputs to pass, never reasons from an eligible subset',async()=>{
  const rows=mixed();const body=await read(rows,{missing:[rows[4].fact_id,rows[3].fact_id]});
  expect(body.latest?.unavailableReasons).toEqual({facts:{net_income_parent:'multiple_units',operating_cash_flow:'multiple_units'},derived:{}});
  expect(body.latest?.facts.revenue).toBeNull();expect(body.latest?.derived.revenue_yoy).toBeNull();
  expect(body.evidence).toEqual({});expect(body.withheld).toEqual({evidenceIncomplete:0,citationPending:0});
 });
 it('retains withheld markers on unique cells without assigning a multiunit reason',async()=>{
  const rows=mixed().filter(r=>r.unit==='CNY');const body=await read(rows,{missing:[rows[0].fact_id]});
  expect(body.latest?.facts.revenue).toMatchObject({kind:'withheld',reason:'evidence_incomplete'});
  expect(body.latest?.derived.revenue_yoy).toMatchObject({kind:'withheld',reason:'evidence_incomplete'});
  expect(body.latest?.unavailableReasons).toBeUndefined();expect(body.withheld.evidenceIncomplete).toBe(2);
 });
 it('does not explain same-unit conflicts, even alongside another unit',async()=>{
  const rows=mixed();rows.push(realFact({...rows[0],fact_id:'duplicate-usd',unit:'USD'}));
  await read(rows,{status:500});
  expect(()=>latestBlock(rows,'US','2026-05-01',1)).toThrow('derive_multiple_current');
 });
 it('does not borrow ambiguity from older periods or a different duration/start',async()=>{
  const rows=mixed().filter(r=>r.unit==='CNY');
  rows.push(realFact({...rows[0],fact_id:'wrong-period',unit:'USD',period_start:'2025-07-01',duration:'6M'}));
  const body=await read(rows);expect(body.latest?.unavailableReasons).toBeUndefined();
  expect(body.latest?.facts.revenue).toMatchObject({kind:'fact',unit:'CNY'});
 });
 it('truncated or absent anchors produce no reasons',async()=>{
  expect((await read(mixed(),{truncated:true})).latest).toEqual({periodKey:null,facts:{},derived:{},stateRev:1,truncated:true});
  expect((await read(mixed().filter(r=>r.concept!=='revenue'))).latest).toBeNull();
 });
 it.each(['public','admin'] as const)('CN %s respects citation pending and the existing admin exemption',async mode=>{
  const rows=mixed().filter(r=>r.period_end==='2025-12-31').map(r=>realFact({...r,issuer_id:CN,market:'CN',filing_id:cnSummary().filingId,concept:r.concept==='revenue'?'revenue_operating':r.concept}));
  const body=await read(rows,{cn:true,mode});
  expect(body.latest?.unavailableReasons).toEqual(mode==='public'?undefined:{facts:{revenue_operating:'multiple_units',net_income_parent:'multiple_units',operating_cash_flow:'multiple_units'},derived:{}});
  expect(body.evidence).toEqual({});expect(body.withheld).toEqual({evidenceIncomplete:0,citationPending:0});
 });
 it('explains derived margin only when both same-unit input pairs exist and pass',async()=>{
  const rows=mixed();rows.push(...rows.filter(r=>r.concept==='revenue'&&r.period_end==='2025-12-31').map(r=>realFact({...r,fact_id:`gp-${r.unit}`,concept:'gross_profit',value:'100',value_text:'100'})));
  expect((await read(rows)).latest?.unavailableReasons?.derived.gross_margin).toBe('multiple_units');
  expect((await read(rows,{missing:['gp-USD']})).latest?.unavailableReasons?.derived.gross_margin).toBeUndefined();
 });
 it('keeps zero-valued unique facts visible and missing derived inputs missing',async()=>{
  const row=realFact({value:'0',value_text:'0'});const body=await read([row]);
  expect(body.latest?.facts.revenue).toMatchObject({kind:'fact',value:'0'});
  expect(body.latest?.derived).toEqual({gross_margin:null,revenue_yoy:null});
  expect(body.latest?.unavailableReasons).toBeUndefined();
 });
 it.each(['future','bad-status'] as const)('does not confirm an out-of-gate-scope candidate: %s',async edge=>{
  const rows=mixed();rows[4]={...rows[4],...(edge==='future'?{available_date:'2999-01-01'}:{status:'rejected' as FactRow['status']})};
  const body=await read(rows);expect(body.latest?.unavailableReasons?.facts.revenue).toBeUndefined();
  expect(body.latest?.unavailableReasons?.derived.revenue_yoy).toBeUndefined();
 });
 it('preserves evidence and withheld counts for diagnostic inputs independently visible in events',async()=>{
  const rows=mixed();const body=await read(rows,{eventFact:rows[0]});
  expect(Object.keys(body.evidence)).toEqual([rows[0].fact_id]);
  expect(body.latest?.unavailableReasons?.facts.revenue).toBe('multiple_units');
  const blocked=await read(rows,{eventFact:rows[0],missing:[rows[0].fact_id]});
  expect(blocked.evidence).toEqual({});expect(blocked.withheld).toEqual({evidenceIncomplete:1,citationPending:0});
  expect(blocked.latest?.unavailableReasons?.facts.revenue).toBeUndefined();
 });
 it('keeps pure latest-block financial selection unchanged',()=>{
  const block=latestBlock(mixed(),'US','2026-05-01',1);
  expect(block?.facts).toEqual({revenue:null,net_income_parent:null,operating_cash_flow:null});
  expect(block?.derived).toEqual({gross_margin:null,revenue_yoy:null});
 });
});
