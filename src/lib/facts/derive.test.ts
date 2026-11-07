// src/lib/facts/derive.test.ts
import {describe,it,expect} from 'vitest';
import {FactsDbError} from './types';
import type {Duration,FactRow,LineageRev,Market,MetricRow,ReadFactsLineageResult} from './types';
import {FORMULA_VERSION,deriveLineageMetrics,deriveMetrics,materialize,metricNames} from './derive';
import type {MaterializeDb} from './derive';
import {memoryFactsDb} from './memory-facts-db';

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

describe('deriveMetrics: quality review follow-ups',()=>{
 function lcg(seed:number){let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
 const shuffled=<T,>(xs:T[],seed:number)=>{const r=lcg(seed),a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const ytd=(c:string,y:number,v:string[],extra:Partial<FactRow>={})=>[['03-31','01-01'],['06-30','01-01'],['09-30','01-01'],['12-31','01-01']].slice(0,v.length).map(([e,st],i)=>dur(c,`${y}-${st}`,`${y}-${e}`,v[i],extra));
 it('conflicting YTD differences for one quarter are ambiguous and independent of row order; equal ones keep the smallest fact ids',()=>{
  const mk=(a2:string,b2:string)=>[dur('revenue','2024-01-01','2024-12-31','70',{fact_id:'a1'}),dur('revenue','2024-01-01','2024-09-30','45',{fact_id:'b1'}),
   dur('revenue','2024-01-05','2024-12-31',a2,{fact_id:'a2'}),dur('revenue','2024-01-05','2024-09-30',b2,{fact_id:'b2'})];
  const conflict=mk('80','45'),equal=mk('75','50');
  const q4=(rows:FactRow[])=>deriveMetrics(rows,opts).filter(r=>r.metric==='q_single_revenue'&&r.period_end==='2024-12-31');
  for(let seed=1;seed<=8;seed++){
   expect(q4(shuffled(conflict,seed))).toEqual([]);
   const eq=q4(shuffled(equal,seed));
   expect(eq.map(r=>r.value)).toEqual(['25']);expect(eq[0].inputs.map(i=>i.fact_id)).toEqual(['a1','b1']);
  }
 });
 it('whole output is permutation invariant',()=>{
  const rows=[...ytd('revenue',2023,['10','25','45','70']),...ytd('revenue',2024,['12','30','54','80']),...ytd('net_income_parent',2024,['1','2','3','4']),
   inst('equity_parent','2023-12-31','100'),inst('equity_parent','2024-12-31','120'),dur('revenue','2024-04-01','2024-06-30','18')];
  const base=JSON.stringify(deriveMetrics(rows,opts));
  for(let seed=1;seed<=10;seed++)expect(JSON.stringify(deriveMetrics(shuffled(rows,seed),opts))).toBe(base);
 });
 it('throws on several current rows, on mixed issuer/market, and on a market that differs from the options',()=>{
  const a=dur('revenue','2024-01-01','2024-03-31','1',{fact_id:'x1',disclosure_seq:1,is_current:true}),b=dur('revenue','2024-01-01','2024-03-31','2',{fact_id:'x2',disclosure_seq:2,is_current:true});
  expect(()=>deriveMetrics([a,b],opts)).toThrow('derive_multiple_current');
  expect(()=>deriveMetrics([dur('revenue','2024-01-01','2024-03-31','1'),dur('revenue','2024-04-01','2024-06-30','1',{issuer_id:'J'})],opts)).toThrow('derive_mixed_scope');
  expect(()=>deriveMetrics([dur('revenue','2024-01-01','2024-03-31','1',{market:'CN'})],opts)).toThrow('derive_mixed_scope');
 });
 it('revision fallback compares numbers, not strings (10 vs 10.0 is not a revision)',()=>{
  const rows=[dur('revenue','2024-01-01','2024-06-30','25',{filing_id:'F6',is_revision:undefined,disclosure_seq:1,is_current:false,value_text:'25'}),
   dur('revenue','2024-01-01','2024-06-30','25.0',{filing_id:'F6b',is_revision:undefined,disclosure_seq:2,is_current:true,available_date:'2024-02-01'}),
   dur('revenue','2024-01-01','2024-09-30','45',{filing_id:'F9'})];
  expect(pick(deriveMetrics(rows,opts),'q_single_revenue')).toEqual([['2024-07-01','2024-09-30','20']]);   // 25 → 25.0 is not a revision: rule b applies
 });
 it('both gross_margin branches list the numerator source first, then revenue',()=>{
  const gp=deriveMetrics([dur('revenue','2024-01-01','2024-03-31','10'),dur('gross_profit','2024-01-01','2024-03-31','4')],opts).find(r=>r.metric==='gross_margin')!;
  const cor=deriveMetrics([dur('revenue','2024-01-01','2024-03-31','10'),dur('cost_of_revenue','2024-01-01','2024-03-31','6')],opts).find(r=>r.metric==='gross_margin')!;
  expect(gp.inputs.map(i=>i.concept)).toEqual(['gross_profit','revenue']);
  expect(cor.inputs.map(i=>i.concept)).toEqual(['cost_of_revenue','revenue']);
 });
 it('TTM across a year boundary (2023Q4-2024Q3) from two YTD series',()=>{
  const out=deriveMetrics([...ytd('revenue',2023,['10','25','45','70']),...ytd('revenue',2024,['12','30','54'])],opts);
  expect(pick(out,'ttm_revenue').filter(r=>r[1]==='2024-09-30')).toEqual([['2023-10-01','2024-09-30','79']]);
 });
 it('random 2-year YTD series reproduce exact quarter and TTM strings (integer cents)',()=>{
  const fmt=(c:number)=>{const n=Math.abs(c),i=Math.floor(n/100),f=String(n%100).padStart(2,'0').replace(/0+$/,'');return `${c<0?'-':''}${i}${f?`.${f}`:''}`;};
  for(let seed=1;seed<=200;seed++){
   const r=lcg(seed);const q=Array.from({length:8},()=>Math.floor(r()*2000001)-1000000);
   const y=(k:number)=>{let acc=0;return q.slice(k*4,k*4+4).map(v=>fmt(acc+=v));};
   const out=deriveMetrics([...ytd('revenue',2023,y(0)),...ytd('revenue',2024,y(1))],opts);
   expect(pick(out,'q_single_revenue').map(x=>x[2])).toEqual(q.map(fmt));
   expect(pick(out,'ttm_revenue').map(x=>x[2])).toEqual([3,4,5,6,7].map(i=>fmt(q.slice(i-3,i+1).reduce((a,v)=>a+v,0))));
  }
 });
 it('YoY with a negative prior divides by its absolute value',()=>{
  const out=deriveMetrics([dur('net_income_parent','2023-01-01','2023-12-31','-100'),dur('net_income_parent','2024-01-01','2024-12-31','-50')],opts);
  expect(pick(out,'net_income_yoy')).toEqual([['2024-01-01','2024-12-31','0.5']]);
 });
 it('ROE: non-positive average equity → missing; opening equity on Feb 29 works; mixed-scale division is exact',()=>{
  const q=(a:string,b:string)=>dur('net_income_parent',a,b,'5');
  const leap=[q('2024-03-01','2024-05-31'),q('2024-06-01','2024-08-31'),q('2024-09-01','2024-11-30'),q('2024-12-01','2025-02-28')];
  const roe=(e0:string,e1:string)=>pick(deriveMetrics([...leap,inst('equity_parent','2024-02-29',e0),inst('equity_parent','2025-02-28',e1)],opts),'roe');
  expect(roe('90','110')).toEqual([['2024-03-01','2025-02-28','0.2']]);
  expect(roe('-100','60')).toEqual([]);expect(roe('-100','100')).toEqual([]);
  expect(roe('-10','50')).toEqual([['2024-03-01','2025-02-28','1']]);
  const gm=deriveMetrics([dur('revenue','2024-01-01','2024-03-31','3.5'),dur('gross_profit','2024-01-01','2024-03-31','0.001')],opts);
  expect(pick(gm,'gross_margin')).toEqual([['2024-01-01','2024-03-31','0.0002857143']]);
 });
});

describe('materialize (lineage contract, spec §4.4 / T9)',()=>{
 const env=(stateRevs:LineageRev[],rows:FactRow[],truncated=false):ReadFactsLineageResult=>({stateRevs,lineage:stateRevs.map(x=>x.issuer_id),rows,conflicts:[],truncated});
 function fakeDb(envs:ReadFactsLineageResult[],o:{staleFirst?:boolean;staleAlways?:boolean;target?:string;lineage?:string[]}={}){
  let reads=0,replaces=0;const calls:{issuer:string;basedOn:LineageRev[];rows:MetricRow[]}[]=[];const readArgs:string[][]=[];
  const db:MaterializeDb={
   async targetOf(i){return o.target??i;},
   async lineageOf(t){return o.lineage??[t];},
   async readFactsLineage(issuers){readArgs.push(issuers);return envs[Math.min(reads++,envs.length-1)];},
   async replaceMetricsLineage(issuer,_m,basedOn,rows){replaces++;if(o.staleAlways||(o.staleFirst&&replaces===1))throw new FactsDbError('stale_computation');calls.push({issuer,basedOn,rows});return rows.length;},
  };
  return {db,calls,reads:()=>reads,readArgs};
 }
 it('reads the lineage envelope, derives, replaces under the rev vector, and retries once on stale_computation',async()=>{
  const rows=[dur('revenue','2024-01-01','2024-03-31','10'),dur('gross_profit','2024-01-01','2024-03-31','4')];
  const {db,calls,reads}=fakeDb([env([{issuer_id:'I',state_rev:7}],rows),env([{issuer_id:'I',state_rev:8}],rows)],{staleFirst:true});
  expect(await materialize(db,'I','US',{today:'2025-01-01'})).toEqual({rows:2,stateRev:8,retried:true,target:'I',basedOn:[{issuer_id:'I',state_rev:8}]});
  expect(reads()).toBe(2);
  expect(calls[0]).toMatchObject({issuer:'I',basedOn:[{issuer_id:'I',state_rev:8}]});
  expect(calls[0].rows.map(x=>x.metric)).toEqual(['gross_margin','q_single_revenue']);   // gross_margin + q_single_revenue (round-1 #17c)
  expect(calls[0].rows[0]).toMatchObject({metric:'gross_margin',value:'0.4',based_on_rev:8,based_on_lineage:[{issuer_id:'I',state_rev:8}],as_of:'2025-01-01'});
 });
 it('a merged source materialises its target T over the whole lineage: rows of both issuers form one series for T',async()=>{
  const lin=[{issuer_id:'S',state_rev:2},{issuer_id:'T',state_rev:5}];
  const rows=[dur('revenue','2024-01-01','2024-03-31','10',{issuer_id:'S'}),dur('gross_profit','2024-01-01','2024-03-31','4',{issuer_id:'T'})];
  const {db,calls,readArgs}=fakeDb([env(lin,rows)],{target:'T',lineage:['T','S']});
  expect(await materialize(db,'S','US',{today:'2025-01-01'})).toMatchObject({target:'T',stateRev:5,basedOn:lin,retried:false});
  expect(readArgs[0]).toEqual(['T','S']);
  expect(calls[0].issuer).toBe('T');
  const gm=calls[0].rows.find(x=>x.metric==='gross_margin')!;
  expect(gm).toMatchObject({issuer_id:'T',value:'0.4',based_on_rev:5,based_on_lineage:lin});
  expect(gm.inputs.map(i=>i.fact_id).sort()).toEqual(rows.map(x=>x.fact_id).sort());
 });
 it('gives up after the second stale_computation',async()=>{
  const {db}=fakeDb([env([{issuer_id:'I',state_rev:1}],[])],{staleAlways:true});
  await expect(materialize(db,'I','US')).rejects.toMatchObject({code:'stale_computation'});
 });
 it('empty facts still replace with []; rows outside the lineage or market are refused',async()=>{
  const {db,calls}=fakeDb([env([{issuer_id:'I',state_rev:5}],[])]);
  expect(await materialize(db,'I','US',{today:'2025-01-01'})).toEqual({rows:0,stateRev:5,retried:false,target:'I',basedOn:[{issuer_id:'I',state_rev:5}]});
  expect(calls).toEqual([{issuer:'I',basedOn:[{issuer_id:'I',state_rev:5}],rows:[]}]);
  const other=fakeDb([env([{issuer_id:'I',state_rev:5}],[dur('revenue','2024-01-01','2024-03-31','1',{issuer_id:'OTHER'})])]);
  await expect(materialize(other.db,'I','US')).rejects.toThrow('derive_scope_mismatch');
  expect(other.calls).toEqual([]);
  expect(()=>deriveLineageMetrics([],'I',['I'],{market:'US',asOf:'2025-01-01',basedOn:[]})).toThrow('derive_scope_mismatch');
  expect(()=>deriveLineageMetrics([dur('revenue','2024-01-01','2024-03-31','1',{market:'CN'})],'I',['I'],{market:'US',asOf:'2025-01-01',basedOn:[]})).toThrow('derive_scope_mismatch');
 });
 it('refuses a truncated envelope with read_truncated and writes nothing',async()=>{
  const {db,calls}=fakeDb([env([{issuer_id:'I',state_rev:3}],[],true)]);
  await expect(materialize(db,'I','US')).rejects.toMatchObject({code:'read_truncated'});
  expect(calls).toEqual([]);
 });
 it('re-resolves the target inside the retry: a merge of T into U before the first replace makes the retry materialise U',async()=>{
  const mem=memoryFactsDb();
  await mem.setMerge('00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-0000000000ff');   // a→b: scopes for both exist
  const T='00000000-0000-4000-8000-00000000000b',U='00000000-0000-4000-8000-00000000000c',A='00000000-0000-4000-8000-00000000000a';
  mem.setTopology({[U]:{status:'active',merged_into:null}});
  let merged=false;const replaced:string[]=[];
  const db:MaterializeDb={targetOf:i=>mem.targetOf(i),lineageOf:t=>mem.lineageOf(t),readFactsLineage:(i,m,o)=>mem.readFactsLineage(i,m,o),
   async replaceMetricsLineage(i,m,b,r){
    if(!merged){merged=true;await mem.setMerge(T,U,'00000000-0000-4000-8000-0000000000ff');}   // T becomes merged into U before the first replace lands
    replaced.push(i);return mem.replaceMetricsLineage(i,m,b,r);
   }};
  const res=await materialize(db,A,'US',{today:'2025-01-01'});
  expect(res).toMatchObject({retried:true,target:U});
  expect(replaced).toEqual([T,U]);
 });
});
