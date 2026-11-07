// src/lib/company/events.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {decimalEquals} from '@/lib/facts/json-numbers';
import type {FactRow} from '@/lib/facts/types';
import {EVENTS_VERSION,HEADLINE_CONCEPTS,deriveIssuerEvents} from './events';
import {factRow,filingSummary,resetBuilders,rng,sequenced,withCounts} from './test-builders';
import type {EventInput,FilingSummary} from './types';

const CUT='2026-11-06';
const derive=(rows:FactRow[],filings:FilingSummary[],cutoff=CUT)=>{const seq=sequenced(rows,filings);return deriveIssuerEvents({rows:seq,filings:withCounts(filings,seq),cutoff});};
const kinds=(ev:EventInput[],k:EventInput['kind'])=>ev.filter(e=>e.kind===k);
const shuffle=<T>(xs:T[],r:()=>number)=>{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
beforeEach(()=>resetBuilders());

describe('deriveIssuerEvents',()=>{
 it('version constant',()=>{expect(EVENTS_VERSION).toBe('company-events/1');expect(HEADLINE_CONCEPTS).toEqual(['revenue','revenue_operating','net_income_parent','operating_cash_flow']);});
 it('emits the three kinds with fixed keys, payload schema and meta',()=>{
  const f1=filingSummary({availableDate:'2024-02-01',sourceRef:'A-1'}),f2=filingSummary({availableDate:'2025-02-01',sourceRef:'A-2',fiscalYear:2024});
  const r1=factRow(f1,{value:'100'}),n1=factRow(f1,{concept:'net_income_parent',source_concept:'us-gaap:NetIncomeLoss',value:'10'});
  const r2=factRow(f2,{value:'120'});
  const ev=derive([r1,n1,r2],[f1,f2]);
  expect(kinds(ev,'filing_published')).toEqual([
   {kind:'filing_published',natural_key:f1.filingId,occurred_on:'2024-02-01',period_end:'2023-12-31',concept:null,filing_id:f1.filingId,payload:{formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-12-31',availableDate:'2024-02-01',sourceRef:'A-1',factCount:2},meta:{}},
   {kind:'filing_published',natural_key:f2.filingId,occurred_on:'2025-02-01',period_end:'2023-12-31',concept:null,filing_id:f2.filingId,payload:{formType:'10-K',fiscalYear:2024,fiscalPeriod:'FY',periodEnd:'2023-12-31',availableDate:'2025-02-01',sourceRef:'A-2',factCount:1},meta:{}},
  ]);
  expect(kinds(ev,'period_first_seen')).toEqual([{kind:'period_first_seen',natural_key:'2023-01-01:2023-12-31:12M',occurred_on:'2024-02-01',period_end:'2023-12-31',concept:null,filing_id:f1.filingId,
   payload:{periodStart:'2023-01-01',periodEnd:'2023-12-31',duration:'12M',filingId:f1.filingId,conceptCount:2,headline:{revenue:{factId:r2.fact_id,value:'120',unit:'USD'},net_income_parent:{factId:n1.fact_id,value:'10',unit:'USD'}},ambiguousUnits:[]},meta:{headlineAsOf:CUT}}]);
  expect(kinds(ev,'fact_revised')).toEqual([{kind:'fact_revised',natural_key:'revenue:2023-01-01:2023-12-31:consolidated:USD:2025-02-01',occurred_on:'2025-02-01',period_end:'2023-12-31',concept:'revenue',filing_id:f2.filingId,
   payload:{concept:'revenue',statement:'IS',periodStart:'2023-01-01',periodEnd:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:'USD',from:{factId:r1.fact_id,value:'100',filingId:f1.filingId,availableDate:'2024-02-01'},to:{factId:r2.fact_id,value:'120',filingId:f2.filingId,availableDate:'2025-02-01'},relChange:'0.2'},meta:{}}]);
  expect(ev.map(e=>[e.occurred_on,e.kind,e.natural_key])).toEqual([...ev].map(e=>[e.occurred_on,e.kind,e.natural_key]).sort((a,b)=>a.join('|')<b.join('|')?-1:1));
 });
 it('same value disclosed again (same day or later) → no fact_revised',()=>{
  const f1=filingSummary({availableDate:'2024-02-01'}),f2=filingSummary({availableDate:'2024-02-01'}),f3=filingSummary({availableDate:'2025-02-01'});
  const ev=derive([factRow(f1,{value:'100'}),factRow(f2,{value:'100.00'}),factRow(f3,{value:'1e2'})],[f1,f2,f3]);
  expect(kinds(ev,'fact_revised')).toEqual([]);
 });
 it('same-day different values collapse to the last row of that day (one key per to-date)',()=>{
  const a=filingSummary({availableDate:'2024-02-01'}),b=filingSummary({availableDate:'2024-03-01'}),c=filingSummary({availableDate:'2024-03-01'});
  const ra=factRow(a,{value:'1'}),rb=factRow(b,{value:'2'}),rc=factRow(c,{value:'3'});
  const ev=kinds(derive([ra,rb,rc],[a,b,c]),'fact_revised');
  expect(ev).toHaveLength(1);
  expect(ev[0].payload).toMatchObject({from:{factId:ra.fact_id},to:{factId:rc.fact_id}});
 });
 it('late revision: A then C with a changed value → one edge keyed by C\'s date; relChange omitted when from is 0',()=>{
  const a=filingSummary({availableDate:'2024-02-01'}),c=filingSummary({availableDate:'2024-09-01'});
  const ev=kinds(derive([factRow(a,{value:'0'}),factRow(c,{value:'5'})],[a,c]),'fact_revised');
  expect(ev.map(e=>e.natural_key)).toEqual(['revenue:2023-01-01:2023-12-31:consolidated:USD:2024-09-01']);
  expect('relChange' in ev[0].payload).toBe(false);
 });
 describe('intermediate insertion (front / middle / back)',()=>{
  const base=()=>{resetBuilders();const a=filingSummary({availableDate:'2024-02-01'}),c=filingSummary({availableDate:'2024-06-01'});return {a,c,ra:factRow(a,{value:'1'}),rc:factRow(c,{value:'2'})};};
  const edges=(ev:EventInput[])=>kinds(ev,'fact_revised').map(e=>[e.natural_key.split(':').pop(),(e.payload.from as {value:string}).value,(e.payload.to as {value:string}).value]);
  it('front: B before A adds B→A, A→C unchanged',()=>{
   const {a,c,ra,rc}=base();const b=filingSummary({availableDate:'2024-01-01'});
   expect(edges(derive([ra,rc],[a,c]))).toEqual([['2024-06-01','1','2']]);
   expect(edges(derive([ra,rc,factRow(b,{value:'0.5'})],[a,c,b]))).toEqual([['2024-02-01','0.5','1'],['2024-06-01','1','2']]);
  });
  it('middle: A→C becomes B→C (same key, payload changed) and A→B is new',()=>{
   const {a,c,ra,rc}=base();const b=filingSummary({availableDate:'2024-04-01'});
   const before=kinds(derive([ra,rc],[a,c]),'fact_revised');
   const after=kinds(derive([ra,rc,factRow(b,{value:'1.5'})],[a,c,b]),'fact_revised');
   expect(edges(after)).toEqual([['2024-04-01','1','1.5'],['2024-06-01','1.5','2']]);
   const same=after.find(e=>e.natural_key===before[0].natural_key)!;
   expect(same.payload).not.toEqual(before[0].payload);
  });
  it('back: B after C adds C→B',()=>{
   const {a,c,ra,rc}=base();const b=filingSummary({availableDate:'2024-08-01'});
   expect(edges(derive([ra,rc,factRow(b,{value:'3'})],[a,c,b]))).toEqual([['2024-06-01','1','2'],['2024-08-01','2','3']]);
  });
 });
 it('a quarantined (missing) disclosure removes its edge; promotion brings back the identical event (DB keeps first_seen_at)',()=>{
  const a=filingSummary({availableDate:'2024-02-01'}),c=filingSummary({availableDate:'2024-09-01'});
  const ra=factRow(a,{value:'1'}),rc=factRow(c,{value:'2'});
  const withC=derive([ra,rc],[a,c]);
  expect(kinds(derive([ra,{...rc,status:'quarantined'}],[a,c]),'fact_revised')).toEqual([]);
  expect(derive([ra,rc],[a,c])).toEqual(withC);
 });
 it('a filing without facts still publishes with factCount 0',()=>{
  const f=filingSummary({availableDate:'2024-02-01'});
  expect(derive([],[f])).toEqual([expect.objectContaining({kind:'filing_published',payload:expect.objectContaining({factCount:0})})]);
 });
 it('filters by cutoff, mapping_gen > 0, status ok and consolidated',()=>{
  const f1=filingSummary({availableDate:'2024-02-01'}),late=filingSummary({availableDate:'2027-01-01'}),gen0=filingSummary({availableDate:'2024-03-01',mappingGen:0});
  const ev=derive([factRow(f1),factRow(f1,{consolidation:'parent',value:'9'}),factRow(late,{value:'7'})],[f1,late,gen0]);
  expect(kinds(ev,'filing_published').map(e=>e.filing_id)).toEqual([f1.filingId]);
  expect(kinds(ev,'fact_revised')).toEqual([]);
  expect(()=>deriveIssuerEvents({rows:[],filings:[],cutoff:'2026/11/06'})).toThrow(RangeError);
 });
 it('INSTANT period key uses period_end as start; headline lists a multi-unit concept under ambiguousUnits',()=>{
  const f=filingSummary({availableDate:'2024-02-01'});
  const bs=factRow(f,{concept:'total_assets',statement:'BS',period_start:null,period_end:'2023-12-31',duration:'INSTANT',value:'5'});
  const usd=factRow(f,{value:'100'}),eur=factRow(f,{value:'90',unit:'EUR'}),ocf=factRow(f,{concept:'operating_cash_flow',statement:'CF',value:'7'});
  const ev=kinds(derive([bs,usd,eur,ocf],[f]),'period_first_seen');
  expect(ev.map(e=>e.natural_key)).toEqual(['2023-01-01:2023-12-31:12M','2023-12-31:2023-12-31:INSTANT']);
  expect(ev[0].payload).toMatchObject({conceptCount:2,ambiguousUnits:['revenue'],headline:{operating_cash_flow:{factId:ocf.fact_id,value:'7',unit:'USD'}}});
  expect(ev[0].payload.headline).not.toHaveProperty('revenue');
  expect(ev[1].payload).toMatchObject({periodStart:'2023-12-31',periodEnd:'2023-12-31',duration:'INSTANT',conceptCount:1,headline:{},ambiguousUnits:[]});
 });
 it('period_first_seen: occurred_on = earliest availability in the period; filingId tie → smallest fact_id',()=>{
  const f1=filingSummary({availableDate:'2024-05-01'}),f2=filingSummary({availableDate:'2024-02-01'}),f3=filingSummary({availableDate:'2024-02-01'});
  const x=factRow(f1),y=factRow(f3,{concept:'net_income_parent'}),z=factRow(f2,{concept:'operating_income'});
  const [p]=kinds(derive([x,y,z],[f1,f2,f3]),'period_first_seen');
  expect(p.occurred_on).toBe('2024-02-01');
  expect(p.payload.filingId).toBe(y.fact_id<z.fact_id?f3.filingId:f2.filingId);
 });
 it('a mapping-generation upgrade (new fact ids, gen 2) keeps every natural key and kind',()=>{
  const g1=[filingSummary({availableDate:'2024-02-01'}),filingSummary({availableDate:'2025-02-01'})];
  const v1=[factRow(g1[0],{value:'1'}),factRow(g1[1],{value:'2'})];
  const g2=g1.map(f=>({...f,mappingGen:2}));
  const v2=[factRow(g2[0],{value:'1',mapping_gen:2}),factRow(g2[1],{value:'2',mapping_gen:2})];
  const keys=(ev:EventInput[])=>ev.map(e=>`${e.kind}|${e.natural_key}`);
  const e1=derive(v1,g1),e2=derive(v2,g2);
  expect(keys(e2)).toEqual(keys(e1));
  expect(kinds(e2,'fact_revised')[0].payload).not.toEqual(kinds(e1,'fact_revised')[0].payload);
 });
 it('byte-identical across runs and input permutations',()=>{
  const fs=[0,1,2,3].map(i=>filingSummary({availableDate:`2024-0${i+1}-15`}));
  const rows=fs.flatMap((f,i)=>[factRow(f,{value:String(100+i)}),factRow(f,{concept:'net_income_parent',value:String(10+(i%2))}),factRow(f,{period_start:null,period_end:'2023-12-31',duration:'INSTANT',concept:'total_assets',statement:'BS',value:'9'})]);
  const seq=sequenced(rows,fs);const filings=withCounts(fs,seq);
  const a=JSON.stringify(deriveIssuerEvents({rows:seq,filings,cutoff:CUT}));
  const r=rng(7);
  for(let k=0;k<5;k++)expect(JSON.stringify(deriveIssuerEvents({rows:shuffle(seq,r),filings:shuffle(filings,r),cutoff:CUT}))).toBe(a);
 });
 it('property (seeded, 200 runs): fact_revised count = Σ adjacent changes over each day-collapsed sequence',()=>{
  for(let run=0;run<200;run++){
   resetBuilders();const r=rng(1000+run);
   const nf=1+Math.floor(r()*6);
   const fs=Array.from({length:nf},()=>filingSummary({availableDate:`2024-0${1+Math.floor(r()*4)}-0${1+Math.floor(r()*3)}`}));
   const rows:FactRow[]=[];
   for(const f of fs)for(const concept of ['revenue','net_income_parent'])for(const unit of ['USD','EUR']){
    if(r()<0.4)continue;
    rows.push(factRow(f,{concept,unit,value:['1','2','2.0','3'][Math.floor(r()*4)]}));
   }
   const seq=sequenced(rows,fs);
   const ev=deriveIssuerEvents({rows:shuffle(seq,r),filings:withCounts(fs,seq),cutoff:CUT});
   // oracle: per key, last row of each day in sequence order, count adjacent value changes
   const byKey=new Map<string,FactRow[]>();
   for(const x of seq){const k=`${x.concept}|${x.unit}`;byKey.set(k,[...(byKey.get(k)??[]),x]);}
   let expected=0;
   for(const g of byKey.values()){
    g.sort((p,q)=>p.disclosure_seq!-q.disclosure_seq!);
    const days:FactRow[]=[];for(const x of g){if(days.length&&days[days.length-1].available_date===x.available_date)days[days.length-1]=x;else days.push(x);}
    for(let i=1;i<days.length;i++)if(!decimalEquals(days[i-1].value_text,days[i].value_text))expected++;
   }
   expect(kinds(ev,'fact_revised').length,`run ${run}`).toBe(expected);
   expect(new Set(ev.map(e=>`${e.kind}|${e.natural_key}`)).size,`unique keys run ${run}`).toBe(ev.length);
  }
 });
});
