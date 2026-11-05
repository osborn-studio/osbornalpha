// src/lib/facts/derive.test.ts
import {describe,it,expect} from 'vitest';
import {FactsDbError} from './types';
import type {Duration,FactRow,FactsDb,Market,MetricRow,ReadFactsResult} from './types';
import {FORMULA_VERSION,deriveMetrics,materialize,metricNames} from './derive';

let n=0;
type P=Partial<FactRow>&{concept:string;period_end:string;value:string;duration:Duration};
const f=(p:P):FactRow=>({fact_id:`f${++n}`,issuer_id:'I',market:'US',filing_id:'F1',run_id:'R',source_concept:p.concept,statement:'IS',period_start:null,unit:'USD',consolidation:'consolidated',available_date:'2024-01-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-01-01T00:00:00Z',value_text:p.value,disclosure_seq:1,is_current:true,is_revision:false,...p});
const dur=(concept:string,start:string,end:string,value:string,extra:Partial<FactRow>={})=>f({concept,period_start:start,period_end:end,value,duration:({3:'3M',6:'6M',9:'9M',12:'12M'} as const)[monthsBetween(start,end)]!,...extra});
const inst=(concept:string,end:string,value:string,extra:Partial<FactRow>={})=>f({concept,statement:'BS',period_end:end,value,duration:'INSTANT',...extra});
function monthsBetween(s:string,e:string):3|6|9|12{const m=(Number(e.slice(0,4))-Number(s.slice(0,4)))*12+Number(e.slice(5,7))-Number(s.slice(5,7))+1;return m as 3|6|9|12;}
const pick=(rows:MetricRow[],metric:string)=>rows.filter(r=>r.metric===metric).map(r=>[r.period_start,r.period_end,r.value]);
const opts={market:'US' as Market,asOf:'2025-01-01'};

describe('deriveMetrics: ratios and sums',()=>{
 it('gross_margin prefers gross_profit, falls back to revenue - cost_of_revenue; net_margin; exact decimals; pure unit',()=>{
  const rows=[dur('revenue','2024-01-01','2024-03-31','1000'),dur('gross_profit','2024-01-01','2024-03-31','400'),dur('net_income_parent','2024-01-01','2024-03-31','123.456'),
   dur('revenue','2024-04-01','2024-06-30','300'),dur('cost_of_revenue','2024-04-01','2024-06-30','100')];
  const out=deriveMetrics(rows,opts);
  expect(pick(out,'gross_margin')).toEqual([['2024-01-01','2024-03-31','0.4'],['2024-04-01','2024-06-30','0.6666666667']]);
  expect(pick(out,'net_margin')).toEqual([['2024-01-01','2024-03-31','0.123456']]);
  const gm=out.find(r=>r.metric==='gross_margin')!;
  expect(gm).toMatchObject({unit:'pure',input_unit:'USD',basis:'us_standard',duration:'3M',formula_version:FORMULA_VERSION,as_of:'2025-01-01',based_on_rev:0});
  expect(gm.inputs.map(i=>i.concept)).toEqual(['gross_profit','revenue']);
 });
 it('missing stays missing: no denominator, zero denominator, unit mismatch, non-unique match → no row',()=>{
  const rows=[dur('gross_profit','2024-01-01','2024-03-31','400'),                                   // no revenue
   dur('revenue','2024-04-01','2024-06-30','0'),dur('gross_profit','2024-04-01','2024-06-30','1'),   // zero denominator
   dur('revenue','2024-07-01','2024-09-30','10'),dur('gross_profit','2024-07-01','2024-09-30','4',{unit:'EUR'}),   // unit mismatch
   dur('revenue','2024-10-01','2024-12-31','10'),dur('gross_profit','2024-10-01','2024-12-31','4',{unit:'USD'}),dur('gross_profit','2024-10-01','2024-12-31','5',{unit:'CAD'})];   // ambiguous without unit: same unit picks the USD one
  const out=deriveMetrics(rows,opts);
  expect(pick(out,'gross_margin')).toEqual([['2024-10-01','2024-12-31','0.4']]);
 });
 it('fcf and borrowings_total use the market basis; CN requires all three borrowing inputs',()=>{
  const us=deriveMetrics([dur('operating_cash_flow','2024-01-01','2024-12-31','500'),dur('capex','2024-01-01','2024-12-31','120.5'),
   inst('short_term_borrowings','2024-12-31','10'),inst('long_term_borrowings','2024-12-31','20')],opts);
  expect(us.find(r=>r.metric==='fcf')).toMatchObject({value:'379.5',unit:'USD',input_unit:'USD',basis:'us_standard',duration:'12M'});
  expect(us.find(r=>r.metric==='borrowings_total')).toMatchObject({period_start:'2024-12-31',period_end:'2024-12-31',duration:'INSTANT',value:'30',basis:'us_standard'});
  const cnRows=[dur('operating_cash_flow','2024-01-01','2024-12-31','500',{market:'CN',unit:'CNY'}),dur('capex_incl_intangibles','2024-01-01','2024-12-31','100',{market:'CN',unit:'CNY'}),
   inst('short_term_borrowings','2024-12-31','1',{market:'CN',unit:'CNY'}),inst('long_term_borrowings','2024-12-31','2',{market:'CN',unit:'CNY'})];
  const cn=deriveMetrics(cnRows,{market:'CN',asOf:'2025-01-01'});
  expect(cn.find(r=>r.metric==='fcf')).toMatchObject({value:'400',basis:'cn_incl_intangibles'});
  expect(cn.find(r=>r.metric==='borrowings_total')).toBeUndefined();
  const cn2=deriveMetrics([...cnRows,inst('bonds_payable','2024-12-31','4',{market:'CN',unit:'CNY'})],{market:'CN',asOf:'2025-01-01'});
  expect(cn2.find(r=>r.metric==='borrowings_total')).toMatchObject({value:'7',basis:'cn_incl_bonds',unit:'CNY'});
 });
 it('CN margins use revenue_operating with cn_standard basis',()=>{
  const out=deriveMetrics([dur('revenue_operating','2024-01-01','2024-12-31','200',{market:'CN',unit:'CNY'}),dur('cost_of_revenue','2024-01-01','2024-12-31','150',{market:'CN',unit:'CNY'}),dur('revenue','2024-01-01','2024-12-31','210',{market:'CN',unit:'CNY'})],{market:'CN',asOf:'2025-01-01'});
  expect(out.find(r=>r.metric==='gross_margin')).toMatchObject({value:'0.25',basis:'cn_standard',input_unit:'CNY'});
 });
});

describe('deriveMetrics: single quarters, TTM, YoY, ROE',()=>{
 const ytd=(c:string,y:number,q:[string,string,string,string],extra:Partial<FactRow>={})=>[
  dur(c,`${y}-01-01`,`${y}-03-31`,q[0],extra),dur(c,`${y}-01-01`,`${y}-06-30`,q[1],extra),dur(c,`${y}-01-01`,`${y}-09-30`,q[2],extra),dur(c,`${y}-01-01`,`${y}-12-31`,q[3],extra)];
 it('differences YTD facts with the same period_start into quarters, prefers a direct 3M fact, and sums four adjacent quarters',()=>{
  const rows=[...ytd('revenue',2024,['10','25','45','70']),dur('revenue','2024-04-01','2024-06-30','15.5')];   // direct Q2 differs from 25-10 and wins
  const out=deriveMetrics(rows,opts);
  expect(pick(out,'q_single_revenue')).toEqual([['2024-01-01','2024-03-31','10'],['2024-04-01','2024-06-30','15.5'],['2024-07-01','2024-09-30','20'],['2024-10-01','2024-12-31','25']]);
  expect(pick(out,'ttm_revenue')).toEqual([['2024-01-01','2024-12-31','70.5']]);
  const q4=out.find(r=>r.metric==='q_single_revenue'&&r.period_end==='2024-12-31')!;
  expect(q4.inputs.map(i=>i.concept)).toEqual(['revenue','revenue']);   // 12M and 9M facts, flattened
  const ttm=out.find(r=>r.metric==='ttm_revenue')!;
  expect(new Set(ttm.inputs.map(i=>`${i.fact_id}|${i.quarter}`)).size).toBe(ttm.inputs.length);   // deduplicated per (fact, quarter)
  expect([...new Set(ttm.inputs.map(i=>String(i.quarter)))]).toEqual(['2024-01-01,2024-03-31','2024-04-01,2024-06-30','2024-07-01,2024-09-30','2024-10-01,2024-12-31']);   // replayable quarter grouping
 });
 it('compatibility rule: revised 9M with an unrevised 6M from another filing → no Q3; same filing → Q3 (rule a)',()=>{
  const nine=[dur('revenue','2024-01-01','2024-09-30','40',{filing_id:'F9',available_date:'2024-10-30',disclosure_seq:1,is_current:false}),
   dur('revenue','2024-01-01','2024-09-30','45',{filing_id:'F10K',available_date:'2025-02-01',disclosure_seq:2,is_current:true,is_revision:true})];
  const six=dur('revenue','2024-01-01','2024-06-30','25',{filing_id:'F6'});
  expect(pick(deriveMetrics([...nine,six],opts),'q_single_revenue')).toEqual([]);
  const sixSameFiling=dur('revenue','2024-01-01','2024-06-30','26',{filing_id:'F10K',available_date:'2025-02-01'});
  expect(pick(deriveMetrics([...nine,sixSameFiling],opts),'q_single_revenue')).toEqual([['2024-07-01','2024-09-30','19']]);
 });
 it('rule b: both sequences unrevised across different filings → difference',()=>{
  const out=deriveMetrics([dur('revenue','2024-01-01','2024-06-30','25',{filing_id:'F6'}),dur('revenue','2024-01-01','2024-09-30','45',{filing_id:'F9'})],opts);
  expect(pick(out,'q_single_revenue')).toEqual([['2024-07-01','2024-09-30','20']]);
 });
 it('TTM needs exactly adjacent quarters; a gap breaks the window',()=>{
  const out=deriveMetrics([...ytd('revenue',2024,['10','25','45','70']).filter(r=>r.period_end!=='2024-06-30')],opts);
  expect(pick(out,'q_single_revenue')).toEqual([['2024-01-01','2024-03-31','10'],['2024-10-01','2024-12-31','25']]);   // Q2 and Q3 both need the 6M fact
  expect(pick(out,'ttm_revenue')).toEqual([]);
 });
 it('YoY: unique prior same-duration fact ending 350–380 days earlier; ambiguity or zero prior → omit',()=>{
  const out=deriveMetrics([dur('revenue','2023-01-01','2023-12-31','100'),dur('revenue','2024-01-01','2024-12-31','125'),
   dur('net_income_parent','2023-01-01','2023-12-31','0'),dur('net_income_parent','2024-01-01','2024-12-31','5')],opts);
  expect(pick(out,'revenue_yoy')).toEqual([['2024-01-01','2024-12-31','0.25']]);
  expect(pick(out,'net_income_yoy')).toEqual([]);
  const amb=deriveMetrics([dur('revenue','2023-01-01','2023-12-31','100'),dur('revenue','2023-01-01','2023-12-30','101'),dur('revenue','2024-01-01','2024-12-31','125')],opts);   // two 12M facts 366 and 367 days back
  expect(pick(amb,'revenue_yoy')).toEqual([]);
 });
 it('ROE = TTM net income / average of opening (window start − 1 day, exact) and closing equity',()=>{
  const rows=[...ytd('net_income_parent',2024,['10','20','30','40']),inst('equity_parent','2023-12-31','180'),inst('equity_parent','2024-12-31','220')];
  expect(pick(deriveMetrics(rows,opts),'roe')).toEqual([['2024-01-01','2024-12-31','0.2']]);
  const off=[...ytd('net_income_parent',2024,['10','20','30','40']),inst('equity_parent','2023-12-30','180'),inst('equity_parent','2024-12-31','220')];
  expect(pick(deriveMetrics(off,opts),'roe')).toEqual([]);
  const roe=deriveMetrics(rows,opts).find(r=>r.metric==='roe')!;
  expect(roe.inputs.map(i=>i.concept)).toEqual([...Array(7).fill('net_income_parent'),'equity_parent','equity_parent']);   // Q1 (3M) + three differenced quarters (2 facts each), then opening and closing equity
  expect(roe.inputs.filter(i=>i.concept==='equity_parent').every(i=>i.quarter===undefined)).toBe(true);
 });
 it('metricNames lists the market vocabulary and output is sorted deterministically',()=>{
  expect(metricNames('US')).toContain('q_single_capex');
  expect(metricNames('CN')).toContain('ttm_capex_incl_intangibles');
  const out=deriveMetrics([...ytd('revenue',2024,['10','25','45','70']),dur('gross_profit','2024-01-01','2024-03-31','4')],opts);
  expect(out.map(r=>r.metric)).toEqual([...out.map(r=>r.metric)].sort());
 });
});

describe('deriveMetrics: property (seeded LCG, 200 series)',()=>{
 function lcg(seed:number){let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
 it('YTD facts differenced then summed reproduce the generated quarters and their TTM',()=>{
  for(let seed=1;seed<=200;seed++){
   const rnd=lcg(seed);
   const q=Array.from({length:4},()=>{const v=Math.floor(rnd()*20001)-10000;return rnd()<0.3?`${v}.${Math.floor(rnd()*100)}`:String(v);});
   const ytdVals=q.reduce<string[]>((acc,v,i)=>{const prev=i?Number(acc[i-1]):0;const s=(Math.round((prev+Number(v))*100)/100).toString();return [...acc,s];},[]);
   const rows=[dur('revenue','2024-01-01','2024-03-31',ytdVals[0]),dur('revenue','2024-01-01','2024-06-30',ytdVals[1]),dur('revenue','2024-01-01','2024-09-30',ytdVals[2]),dur('revenue','2024-01-01','2024-12-31',ytdVals[3])];
   if(rnd()<0.5)rows.push(dur('revenue','2024-04-01','2024-06-30',q[1]));   // 10-Q style direct quarter, same value
   const out=deriveMetrics(rows,opts);
   const got=pick(out,'q_single_revenue').map(r=>Number(r[2]));
   expect(got).toEqual(q.map(Number));
   expect(Number(pick(out,'ttm_revenue')[0][2])).toBeCloseTo(q.reduce((a,v)=>a+Number(v),0),6);
  }
 });
});

describe('deriveMetrics: review follow-ups',()=>{
 const full=(c:string,y:number,q:[string,string,string,string],extra:Partial<FactRow>={})=>[
  dur(c,`${y}-01-01`,`${y}-03-31`,q[0],extra),dur(c,`${y}-01-01`,`${y}-06-30`,q[1],extra),dur(c,`${y}-01-01`,`${y}-09-30`,q[2],extra),dur(c,`${y}-01-01`,`${y}-12-31`,q[3],extra)];
 it('only consolidated rows are used: parent-only gross profit makes no margin; mixed bases never duplicate keys',()=>{
  const parent=(r:FactRow):FactRow=>({...r,consolidation:'parent'});
  expect(pick(deriveMetrics([dur('revenue','2024-01-01','2024-03-31','100'),parent(dur('gross_profit','2024-01-01','2024-03-31','40'))],opts),'gross_margin')).toEqual([]);
  const base=[...full('revenue',2024,['10','25','45','70']),dur('gross_profit','2024-01-01','2024-03-31','4')];
  const mixed=[...base,...base.map(r=>parent({...r,value:'999',value_text:'999'}))];
  const out=deriveMetrics(mixed,opts);
  expect(out).toEqual(deriveMetrics(base,opts));
  const keys=out.map(m=>`${m.metric}|${m.period_start}|${m.period_end}|${m.input_unit}|${m.basis}`);
  expect(new Set(keys).size).toBe(keys.length);
 });
 it('a differenced interval must itself classify as 3M: Jan 1-Apr 14 minus Jan 1-Jun 14 gives no quarter',()=>{
  const out=deriveMetrics([dur('operating_cash_flow','2024-01-01','2024-04-14','10',{duration:'3M'}),dur('operating_cash_flow','2024-01-01','2024-06-14','30',{duration:'6M'})],opts);
  expect(pick(out,'q_single_operating_cash_flow').map(r=>r[1])).toEqual(['2024-04-14']);   // only the direct 3M-classified fact
  expect(out.filter(r=>r.metric==='q_single_operating_cash_flow').length).toBe(1);
 });
 it('cash-flow differencing: OCF Q2 = 6M - 3M, lineage records ytd_rule and quarter',()=>{
  const out=deriveMetrics([...full('operating_cash_flow',2024,['10','25','45','70'],{filing_id:'Q1'}).slice(0,1),...full('operating_cash_flow',2024,['10','25','45','70'],{filing_id:'Q2'}).slice(1)],opts);
  expect(pick(out,'q_single_operating_cash_flow')[1]).toEqual(['2024-04-01','2024-06-30','15']);
  const q2=out.find(r=>r.metric==='q_single_operating_cash_flow'&&r.period_end==='2024-06-30')!;
  expect(q2.inputs.map(i=>[i.ytd_rule,i.quarter])).toEqual([['never_revised',['2024-04-01','2024-06-30']],['never_revised',['2024-04-01','2024-06-30']]]);
  const q1=out.find(r=>r.metric==='q_single_operating_cash_flow'&&r.period_end==='2024-03-31')!;
  expect(q1.inputs).toHaveLength(1);expect(q1.inputs[0].ytd_rule).toBeUndefined();
 });
 it('lineage ytd_rule is same_filing when both facts come from one filing but are revised',()=>{
  const rows=[dur('revenue','2024-01-01','2024-06-30','25',{filing_id:'K'}),dur('revenue','2024-01-01','2024-09-30','45',{filing_id:'K',is_revision:true})];
  expect(deriveMetrics(rows,opts).find(r=>r.metric==='q_single_revenue')!.inputs.map(i=>i.ytd_rule)).toEqual(['same_filing','same_filing']);
 });
 it('TTM skips windows with two quarters ending on the same date, without duplicate keys',()=>{
  const rows=[...full('revenue',2024,['10','25','45','70']),dur('revenue','2024-04-05','2024-06-30','7')];   // second Q2 candidate, same end, different start
  const out=deriveMetrics(rows,opts);
  expect(pick(out,'ttm_revenue')).toEqual([]);
  const keys=out.map(m=>`${m.metric}|${m.period_start}|${m.period_end}|${m.input_unit}|${m.basis}`);
  expect(new Set(keys).size).toBe(keys.length);
 });
 it('ratio rounding is half away from zero, also for negatives and exact halves',()=>{
  const r=(rev:string,gp:string)=>pick(deriveMetrics([dur('revenue','2024-01-01','2024-03-31',rev),dur('gross_profit','2024-01-01','2024-03-31',gp)],opts),'gross_margin')[0][2];
  expect(r('20000000000','1')).toBe('0.0000000001');      // exactly 5e-11 rounds up
  expect(r('20000000000','-1')).toBe('-0.0000000001');    // exactly -5e-11 rounds away from zero
  expect(r('30000000000','1')).toBe('0');                 // 3.3e-11 rounds down
  expect(r('-3','1')).toBe('-0.3333333333');
  expect(r('3','-1')).toBe('-0.3333333333');
  expect(r('3','2')).toBe('0.6666666667');
  expect(r('-3','2')).toBe('-0.6666666667');
 });
 it('CN borrowings_total with bonds_payable missing stays missing',()=>{
  const cn={market:'CN' as Market,unit:'CNY'};
  const out=deriveMetrics([inst('short_term_borrowings','2024-12-31','1',cn),inst('long_term_borrowings','2024-12-31','2',cn)],{market:'CN',asOf:'2025-01-01'});
  expect(out.find(m=>m.metric==='borrowings_total')).toBeUndefined();
 });
});

describe('materialize',()=>{
 const env=(stateRev:number,rows:FactRow[],truncated=false):ReadFactsResult=>({stateRev,rows,truncated});
 function fakeDb(envs:ReadFactsResult[],behaviour:{staleFirst?:boolean}={}){
  let reads=0,replaces=0;const calls:{basedOnRev:number;rows:MetricRow[]}[]=[];
  const db:Pick<FactsDb,'readFacts'|'replaceMetrics'>={
   async readFacts(){return envs[Math.min(reads++,envs.length-1)];},
   async replaceMetrics(_i,_m,basedOnRev,rows){replaces++;if(behaviour.staleFirst&&replaces===1)throw new FactsDbError('stale_computation');calls.push({basedOnRev,rows});return rows.length;},
  };
  return {db,calls,reads:()=>reads};
 }
 it('reads the envelope, derives, replaces under the envelope state_rev, and retries once on stale_computation',async()=>{
  const rows=[dur('revenue','2024-01-01','2024-03-31','10'),dur('gross_profit','2024-01-01','2024-03-31','4')];
  const {db,calls,reads}=fakeDb([env(7,rows),env(8,rows)],{staleFirst:true});
  const r=await materialize(db,'I','US',{today:'2025-01-01'});
  expect(r).toEqual({rows:2,stateRev:8,retried:true});   // gross_margin + q_single_revenue (the direct 3M revenue fact is itself a single quarter), round-1 #17c
  expect(reads()).toBe(2);
  expect(calls[0].basedOnRev).toBe(8);
  expect(calls[0].rows.map(x=>x.metric)).toEqual(['gross_margin','q_single_revenue']);
  expect(calls[0].rows[0]).toMatchObject({metric:'gross_margin',value:'0.4',based_on_rev:8,as_of:'2025-01-01'});
  expect(calls[0].rows[1]).toMatchObject({metric:'q_single_revenue',value:'10',period_start:'2024-01-01',period_end:'2024-03-31'});
 });
 it('gives up after the second stale_computation',async()=>{
  const {db}=fakeDb([env(1,[])]);
  const stale:Pick<FactsDb,'readFacts'|'replaceMetrics'>={...db,async replaceMetrics(){throw new FactsDbError('stale_computation');}};
  await expect(materialize(stale,'I','US')).rejects.toMatchObject({code:'stale_computation'});
 });
 it('refuses a truncated envelope with read_truncated and writes nothing',async()=>{
  const {db,calls}=fakeDb([env(3,[],true)]);
  await expect(materialize(db,'I','US')).rejects.toMatchObject({code:'read_truncated'});
  expect(calls).toEqual([]);
 });
});
