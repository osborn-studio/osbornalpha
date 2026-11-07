// src/lib/dq/reconcile/us-sample.test.ts
import {describe,expect,it} from 'vitest';
import {snapshotOf} from '../../facts/providers/shared';
import {MIN_KEYS_PER_SIDE,US_SAMPLE_SCHEMA,buildSampleFiling,entityIs,pickSample,usNaturalKey,validateUsSample} from './us-sample';
import type {SampleCandidate,UsSample} from './us-sample';

const CIK='9990300',ACCN='0009990300-25-000001';
const e=(start:string|undefined,end:string,val:number,accn=ACCN)=>({...(start?{start}:{}),end,val,accn,fy:2024,fp:'FY',form:'10-K',filed:'2025-02-15'});
const companyfacts=()=>snapshotOf(new TextEncoder().encode(JSON.stringify({cik:Number(CIK),entityName:'ZIX',facts:{'us-gaap':{
 Revenues:{units:{USD:[e('2024-01-01','2024-12-31',1000)]}},
 NetIncomeLoss:{units:{USD:[e('2024-01-01','2024-12-31',100),e('2023-01-01','2023-12-31',90,'0009990300-24-000001')]}},
 Assets:{units:{USD:[e(undefined,'2024-12-31',5000)]}},
 StockholdersEquity:{units:{USD:[e(undefined,'2024-12-31',2000)]}},
 ResearchAndDevelopmentExpense:{units:{USD:[e('2024-01-01','2024-12-31',50)]}},
}}})),{source:'edgar'});
const H='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2024">';
const ctx=(id:string,period:string,ident=`000${CIK}`)=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">${ident}</xbrli:identifier></xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
const nf=(name:string,c:string,v:string)=>`<ix:nonFraction name="us-gaap:${name}" contextRef="${c}" unitRef="usd">${v}</ix:nonFraction>`;
const doc=new TextEncoder().encode(`${H}<body><ix:header><ix:resources>${ctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}${ctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')}${ctx('other','<xbrli:instant>2024-12-31</xbrli:instant>','0000000042')}${ctx('old','<xbrli:instant>2009-12-31</xbrli:instant>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>`
 +nf('RevenueFromContractWithCustomerExcludingAssessedTax','d','1,000')+nf('NetIncomeLoss','d','100')+nf('Assets','i','5,000')+nf('StockholdersEquity','i','2,000')+nf('CostOfRevenue','d','700')+nf('Assets','other','1')+nf('Assets','old','1')+nf('Revenues','i','3')+'</body></html>');
const input={cik:CIK,accn:ACCN,form:'10-K',period_end:'2024-12-31',primary_document:'zix-20241231.htm',doc_url:`https://www.sec.gov/Archives/edgar/data/${CIK}/000999030025000001/zix-20241231.htm`,is_inline_xbrl:true,submissions_category:'Non-accelerated filer',companyfacts:companyfacts(),doc,sinceYear:2015};

describe('buildSampleFiling (expected keys = union of two independent sources)',()=>{
 it('unions companyfacts keys of the accession and iXBRL keys of the filer, with origins',()=>{
  const f=buildSampleFiling(input);
  expect(f.expected_keys.map(k=>[k.concept,k.period_start,k.period_end,k.unit,k.source_concept,k.origin])).toEqual([
   ['cost_of_revenue','2024-01-01','2024-12-31','USD','us-gaap:CostOfRevenue','right'],
   ['equity_parent',null,'2024-12-31','USD','us-gaap:StockholdersEquity','both'],
   ['net_income_parent','2024-01-01','2024-12-31','USD','us-gaap:NetIncomeLoss','both'],
   ['rd_expense','2024-01-01','2024-12-31','USD','us-gaap:ResearchAndDevelopmentExpense','left'],
   ['revenue','2024-01-01','2024-12-31','USD','us-gaap:Revenues','both'],
   ['total_assets',null,'2024-12-31','USD','us-gaap:Assets','both'],
  ]);   // NetIncomeLoss 2023 belongs to another accession; Assets of entity 42, the 2009 Assets and the instant-context Revenues are not keys
  expect(f).toMatchObject({accn:ACCN,raw_sha256:input.companyfacts.sha256,is_inline_xbrl:true,submissions_category:'Non-accelerated filer'});
  expect(f.doc_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(usNaturalKey(CIK,ACCN,f.expected_keys[0])).toBe(`${CIK}:${ACCN}:cost_of_revenue:2024-01-01:2024-12-31:USD`);
 });
 it(`refuses a filing with fewer than ${MIN_KEYS_PER_SIDE} keys on either side`,()=>{
  expect(()=>buildSampleFiling({...input,doc:new TextEncoder().encode(`${H}<body><ix:header><ix:resources>${ctx('d','<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>')}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${nf('NetIncomeLoss','d','100')}</body></html>`)})).toThrow(/sample_side_too_small:.*right=1/);
 });
 it('entityIs compares the SEC CIK identifier without leading zeros',()=>{
  expect(entityIs('http://www.sec.gov/CIK#0000320193','320193')).toBe(true);
  expect(entityIs('http://www.sec.gov/CIK#0000320194','320193')).toBe(false);
  expect(entityIs('http://example.com#320193','320193')).toBe(false);
 });
});

describe('validateUsSample',()=>{
 const good=():UsSample=>({schema:US_SAMPLE_SCHEMA,generated_at:'2026-11-05T00:00:00Z',selection:'fixture/1',issuers:[{cik:CIK,ticker:'ZIX',regime:'10-K',filings:[buildSampleFiling(input)]}]});
 it('accepts a well-formed manifest',()=>{expect(validateUsSample(good())).toEqual({ok:true,sample:good()});});
 it.each([
  ['schema',(s:UsSample)=>{(s as {schema:string}).schema='x';}],
  ['accn',(s:UsSample)=>{s.issuers[0].filings[0].accn='123';}],
  ['cik',(s:UsSample)=>{s.issuers[0].cik='0320193';}],
  ['duplicate key',(s:UsSample)=>{s.issuers[0].filings[0].expected_keys.push({...s.issuers[0].filings[0].expected_keys[0]});}],
  ['unknown concept',(s:UsSample)=>{s.issuers[0].filings[0].expected_keys[0].concept='nope';}],
  ['side too small',(s:UsSample)=>{s.issuers[0].filings[0].expected_keys=s.issuers[0].filings[0].expected_keys.slice(0,3);}],
  ['doc_url host',(s:UsSample)=>{s.issuers[0].filings[0].doc_url='https://evil.example/x.htm';}],
  ['doc_url query',(s:UsSample)=>{s.issuers[0].filings[0].doc_url+='?token=x';}],
  ['sha',(s:UsSample)=>{s.issuers[0].filings[0].raw_sha256='abc';}],
  ['no filings',(s:UsSample)=>{s.issuers[0].filings=[];}],
 ])('rejects: %s',(_n,mutate)=>{const s=good();mutate(s);const r=validateUsSample(s);expect(r.ok).toBe(false);});
});

describe('pickSample (spec §5.3 sample rule)',()=>{
 const cand=(i:number,o:Partial<SampleCandidate>={}):SampleCandidate=>({ticker:`T${String(i).padStart(3,'0')}`,cik:String(1000+i),exchange:'NYSE',fiscalYearEnd:'1231',acceleration:'large_accelerated',...o});
 it('keeps required tickers, fills the rest at equal steps in ticker order, and meets every quota by swapping',()=>{
  const all=[...Array.from({length:60},(_,i)=>cand(i)),cand(100,{ticker:'AAPL',exchange:'Nasdaq',fiscalYearEnd:'0930'}),cand(101,{ticker:'MSFT',exchange:'Nasdaq',fiscalYearEnd:'0630'}),cand(102,{ticker:'ZNAS',exchange:'Nasdaq'}),cand(103,{ticker:'ZACC',acceleration:'accelerated'}),cand(104,{ticker:'ZNON',acceleration:'non_accelerated'})];
  const {picked,unmet}=pickSample(all,['AAPL','MSFT'],30);
  expect(picked).toHaveLength(30);expect(unmet).toEqual([]);
  expect(picked.map(p=>p.ticker)).toEqual(expect.arrayContaining(['AAPL','MSFT','ZNAS','ZACC','ZNON']));
  expect(picked.filter(p=>p.exchange==='NYSE').length).toBeGreaterThanOrEqual(3);
  expect(new Set(picked.map(p=>p.ticker)).size).toBe(30);
  expect(picked.map(p=>p.ticker)).toEqual([...picked.map(p=>p.ticker)].sort());
 });
 it('reports a mandatory gold ticker that is not a candidate even when every quota passes',()=>{
  const all=[...Array.from({length:60},(_,i)=>cand(i)),cand(101,{ticker:'MSFT',exchange:'Nasdaq',fiscalYearEnd:'0630'}),cand(102,{ticker:'ZNAS',exchange:'Nasdaq'}),cand(103,{ticker:'ZNAS2',exchange:'Nasdaq'}),cand(104,{ticker:'ZACC',acceleration:'accelerated'}),cand(105,{ticker:'ZNON',acceleration:'non_accelerated',fiscalYearEnd:'0630'})];
  const {picked,unmet}=pickSample(all,['AAPL','MSFT'],30);
  expect(unmet).toEqual(['required:AAPL']);expect(picked.map(p=>p.ticker)).toContain('MSFT');
 });
 it('reports a quota that cannot be met instead of inventing candidates',()=>{
  const {picked,unmet}=pickSample(Array.from({length:10},(_,i)=>cand(i)),[],30);
  expect(picked).toHaveLength(10);
  expect(unmet).toEqual(['nasdaq','fye_not_1231','not_large_accelerated']);
 });
});
