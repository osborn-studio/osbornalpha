// src/lib/entities/identifiers/plan.test.ts
import {describe,it,expect} from 'vitest';
import type {FigiEvidence,FigiJob,FigiJobResult,FigiRecord} from './openfigi';
import {planIdentifierWrites,type PlanInput,type SecRow} from './plan';

const ASOF='2026-11-05';
const I1='10000000-0000-4000-8000-000000000001',I2='10000000-0000-4000-8000-000000000002';
const LEI1='HWUPKR0MPOU8FGXBT394';
const GSHA='a'.repeat(64),RSHA='c'.repeat(64);
const ev=(index:number):FigiEvidence=>({request_sha256:'b'.repeat(64),response_sha256:RSHA,index});
const okR=(job:FigiJob,records:FigiRecord[],i=0):FigiJobResult=>({job,status:'ok',records,evidence:ev(i)});
const rec=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000B9XRY4',compositeFIGI:'BBG000B9XRY4',ticker:'AAPL',exchCode:'US',securityType:'Common Stock',marketSector:'Equity',...o});
const row=(o:Partial<SecRow>):SecRow=>({issuer_id:I1,ticker:'AAPL',valid_from:'2026-01-02',isin:null,figi:null,provenance:{exchange:'Nasdaq'},...o});
const AAPL_JOB:FigiJob={idType:'ID_ISIN',idValue:'US0378331005'};
const base=(o:Partial<PlanInput>={}):PlanInput=>({
 asOf:ASOF,stages:new Set(['A','B']),issuers:[{issuer_id:I1,lei:LEI1,usci:null}],openRows:[row({})],
 universe:new Set(['AAPL','AAPLW','00700.HK']),
 gleif:{sha256:GSHA,byLei:new Map([[LEI1,['US0378331005']]])},
 isinResults:new Map([['US0378331005',okR(AAPL_JOB,[rec({}),rec({figi:'BBG000B9XVV8',exchCode:'UW'})])]]),
 tickerResults:new Map(),hkex:null,...o,
});
const ISIN_PROV={source:'gleif_openfigi',as_of:ASOF,evidence_sha256:GSHA,locator:`gleif:${LEI1},US0378331005;openfigi:${RSHA}#0`};
const FIGI_PROV={source:'openfigi',as_of:ASOF,evidence_sha256:RSHA,job:{idType:'ID_ISIN',idValue:'US0378331005'},level:'composite'};

describe('planIdentifierWrites · stage B',()=>{
 it('writes an empty ISIN and FIGI as guarded sets carrying one sanitized provenance key each',()=>{
  const p=planIdentifierWrites(base());
  expect(p.writes.map(w=>[w.kind,w.column,w.value,w.patch])).toEqual([['set','isin','US0378331005',{isin:ISIN_PROV}],['set','figi','BBG000B9XRY4',{figi:FIGI_PROV}]]);
  expect(p.writes[0]).toMatchObject({issuer_id:I1,ticker:'AAPL',valid_from:'2026-01-02',source:'gleif_openfigi',evidenceKind:'provider_mapping'});
  expect(p.claims).toEqual([]);expect(p.duplicates).toBe(0);expect(p.figiMissing).toEqual([]);
 });
 it('same value: provenance-only write when the key is missing, duplicate when present',()=>{
  const p=planIdentifierWrites(base({openRows:[row({isin:'US0378331005',figi:'BBG000B9XRY4',provenance:{figi:{source:'openfigi'}}})]}));
  expect(p.writes.map(w=>[w.kind,w.column])).toEqual([['provenance','isin']]);
  expect(p.duplicates).toBe(1);
 });
 it('a different stored value becomes correct_identifier and is never overwritten',()=>{
  const p=planIdentifierWrites(base({openRows:[row({figi:'BBG000OLD001'})]}));
  expect(p.writes.map(w=>w.column)).toEqual(['isin']);
  expect(p.claims).toHaveLength(1);
  expect(p.claims[0]).toMatchObject({issuer_id:I1,id_type:'figi',value:'BBG000B9XRY4',source:'openfigi',op:'correct_identifier',detail:{
   schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:I1,ticker:'AAPL',valid_from:'2026-01-02'},
   params:{expected_current:'BBG000OLD001',new_value:'BBG000B9XRY4'},provenance_written:{figi:FIGI_PROV},
  }});
  expect(p.claims[0].detail.sources).toEqual([p.claims[0].detail.evidence]);
 });
 it('several FIGI groups for one ticker: one set_identifier claim per group, ISIN still written',()=>{
  const two=okR(AAPL_JOB,[rec({figi:'BBG000VENUE1',compositeFIGI:null}),rec({figi:'BBG000VENUE2',compositeFIGI:null})]);
  const p=planIdentifierWrites(base({isinResults:new Map([['US0378331005',two]])}));
  expect(p.writes.map(w=>w.column)).toEqual(['isin']);
  const candidates=[{figi:'BBG000VENUE1',level:'venue'},{figi:'BBG000VENUE2',level:'venue'}];
  expect(p.claims.map(c=>[c.op,c.id_type,c.value,c.detail.params])).toEqual([['set_identifier','figi','BBG000VENUE1',{candidates}],['set_identifier','figi','BBG000VENUE2',{candidates}]]);
  expect(p.claims[0].detail.evidence.note).toBe('one of 2 candidate FIGIs: BBG000VENUE1(venue), BBG000VENUE2(venue)');
  expect(p.skipped).toContain('figi_multiple_groups');
 });
 it('attach claims, ownership quarantines, universe skips and A+H candidates for tickers the issuer does not hold',()=>{
  const res=okR(AAPL_JOB,[rec({ticker:'AAPLW',figi:'BBG000ZZZZ01',compositeFIGI:'BBG000ZZZZ01'}),rec({ticker:'ZZNOPE',figi:'BBG000ZZZZ02',compositeFIGI:'BBG000ZZZZ02'}),rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})]);
  const p=planIdentifierWrites(base({openRows:[row({ticker:'600000.SH'})],isinResults:new Map([['US0378331005',res]])}));
  expect(p.claims.map(c=>[c.op,c.id_type,c.value])).toEqual([['attach_security','ticker','AAPLW']]);
  expect(p.claims[0].detail.params).toEqual({share_class:'unknown',valid_from:ASOF,valid_from_method:'first_observed',source:'gleif_openfigi',isin:'US0378331005'});
  expect(p.claims[0].detail.target).toEqual({issuer_id:I1});
  expect(p.skipped).toEqual(expect.arrayContaining(['ticker_not_in_universe','ah_link_candidate']));
  expect(p.ahCandidates).toEqual([{issuer_id:I1,ticker:'00700.HK',isin:'US0378331005',evidence:{source:'gleif_openfigi',as_of:ASOF,evidence_sha256:GSHA,locator:`gleif:${LEI1},US0378331005;openfigi:${RSHA}#0`}}]);
  const owned=planIdentifierWrites(base({openRows:[row({ticker:'600000.SH'}),row({issuer_id:I2,ticker:'AAPLW'})],isinResults:new Map([['US0378331005',res]])}));
  expect(owned.claims.map(c=>c.value)).toEqual(['AAPLW']);
  expect(owned.quarantines).toEqual([{naturalKey:`AAPLW:${ASOF}`,reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',stage:'B',owner_issuer_id:I2},payload:{issuer_id:I1,ticker:'AAPLW',isin:'US0378331005'}}]);
 });
 it('two ISINs pointing at the same row are ambiguous: claims only',()=>{
  const p=planIdentifierWrites(base({
   gleif:{sha256:GSHA,byLei:new Map([[LEI1,['US0378331005','US5949181045']]])},
   isinResults:new Map([['US0378331005',okR(AAPL_JOB,[rec({})])],['US5949181045',okR({idType:'ID_ISIN',idValue:'US5949181045'},[rec({})],1)]]),
  }));
  expect(p.writes.map(w=>w.column)).toEqual(['figi']);
  expect(p.claims.map(c=>[c.op,c.value])).toEqual([['set_identifier','US0378331005'],['set_identifier','US5949181045']]);
  expect(p.skipped).toContain('ambiguous_isin');
 });
 it('records why nothing was queried or found',()=>{
  const p=planIdentifierWrites(base({isinResults:new Map([['US0378331005',{job:AAPL_JOB,status:'not_found',message:'No identifier found.',evidence:ev(0)}]])}));
  expect(p.skipped).toEqual(['openfigi_not_found']);
  expect(planIdentifierWrites(base({isinResults:new Map()})).skipped).toEqual(['figi_not_queried']);
  expect(planIdentifierWrites(base({stages:new Set(['D'])})).writes).toEqual([]);
 });
});

describe('planIdentifierWrites · stages C and D',()=>{
 it('lists rows still without a FIGI for stage C, then writes the single TICKER group',()=>{
  const input=base({openRows:[row({}),row({ticker:'00700.HK',valid_from:'2026-02-01'})],stages:new Set(['A','B','C'])});
  expect(planIdentifierWrites(input).figiMissing).toEqual(['00700.HK']);
  const job:FigiJob={idType:'TICKER',idValue:'700',exchCode:'HK'};
  const p=planIdentifierWrites({...input,tickerResults:new Map([['00700.HK',okR(job,[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})],2)]])});
  expect(p.figiMissing).toEqual([]);
  const w=p.writes.find(x=>x.ticker==='00700.HK')!;
  expect(w).toMatchObject({column:'figi',value:'BBG000TENCT1',patch:{figi:{source:'openfigi',as_of:ASOF,evidence_sha256:RSHA,job:{idType:'TICKER',idValue:'700',exchCode:'HK'},level:'composite'}}});
  const nf=planIdentifierWrites({...input,tickerResults:new Map([['00700.HK',{job,status:'not_found',message:'x',evidence:ev(0)}]])});
  expect(nf.skipped).toContain('figi_not_found');expect(nf.figiMissing).toEqual([]);
 });
 it('HKEX ISIN is the primary source for .HK rows; a disagreeing stage-B ISIN becomes a text reconciliation and a claim',()=>{
  const HK=row({ticker:'00700.HK'});
  const res=okR(AAPL_JOB,[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})]);
  const hkex=new Map([['00700',{isin:'KYG875721634',file:'list_of_securities' as const,sha256:'d'.repeat(64),row:5}]]);
  const p=planIdentifierWrites(base({stages:new Set(['A','B','D']),openRows:[HK],isinResults:new Map([['US0378331005',res]]),hkex}));
  const isin=p.writes.find(w=>w.column==='isin')!;
  expect(isin).toMatchObject({value:'KYG875721634',source:'hkex_list_of_securities',evidenceKind:'official_list',patch:{isin:{source:'hkex_list_of_securities',as_of:ASOF,evidence_sha256:'d'.repeat(64),locator:'list_of_securities:row:5'}}});
  expect(p.recons).toEqual([{naturalKey:'00700.HK:2026-01-02',passed:false,leftText:'US0378331005',rightText:'KYG875721634',leftSource:'gleif_openfigi',rightSource:'hkex_list_of_securities',
   detail:{left:{evidence_sha256:GSHA,locator:`gleif:${LEI1},US0378331005;openfigi:${RSHA}#0`},right:{document:'list_of_securities',sha256:'d'.repeat(64),locator:'row:5'}}}]);
  // the correction assumes HKEX's value is stored, so apply files it only once the HKEX write has landed
  expect(p.claims).toEqual([]);
  expect(isin.followUps!.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','US0378331005',{expected_current:'KYG875721634',new_value:'US0378331005'}]]);
  const agree=planIdentifierWrites(base({stages:new Set(['A','B','D']),openRows:[HK],gleif:{sha256:GSHA,byLei:new Map([[LEI1,['KYG875721634']]])},
   isinResults:new Map([['KYG875721634',okR({idType:'ID_ISIN',idValue:'KYG875721634'},[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})])]]),hkex}));
  expect(agree.recons.map(r=>r.passed)).toEqual([true]);expect(agree.claims).toEqual([]);
  expect(planIdentifierWrites(base({stages:new Set(['D']),openRows:[HK],hkex:new Map()})).skipped).toEqual(['hkex_no_isin']);
 });
});

describe('planIdentifierWrites · review fixes',()=>{
 const ISIN_B='US5949181045',JOB_B:FigiJob={idType:'ID_ISIN',idValue:ISIN_B};
 const two=(order:string[])=>base({
  gleif:{sha256:GSHA,byLei:new Map([[LEI1,order]])},
  isinResults:new Map([['US0378331005',okR(AAPL_JOB,[rec({figi:'BBG000AAAAA1',compositeFIGI:'BBG000AAAAA1'})],0)],[ISIN_B,okR(JOB_B,[rec({figi:'BBG000BBBBB2',compositeFIGI:'BBG000BBBBB2'})],1)]]),
 });
 it('different FIGI groups from different ISINs: no automatic FIGI write, claims carry the complete list (both orders)',()=>{
  const cands=[{figi:'BBG000AAAAA1',level:'composite'},{figi:'BBG000BBBBB2',level:'composite'}];
  const outs=[['US0378331005',ISIN_B],[ISIN_B,'US0378331005']].map(o=>planIdentifierWrites(two(o)));
  for(const p of outs){
   expect(p.writes.filter(w=>w.column==='figi')).toEqual([]);
   const f=p.claims.filter(c=>c.id_type==='figi');
   expect(f.map(c=>[c.op,c.value,c.detail.params])).toEqual([['set_identifier','BBG000AAAAA1',{candidates:cands}],['set_identifier','BBG000BBBBB2',{candidates:cands}]]);
  }
  expect(outs[0].claims.filter(c=>c.id_type==='figi')).toEqual(outs[1].claims.filter(c=>c.id_type==='figi'));
 });
 it('a stored FIGI matching one of several groups is a duplicate; the alternatives become correct_identifier claims with the full list',()=>{
  const p=planIdentifierWrites(two(['US0378331005',ISIN_B]));
  const q=planIdentifierWrites({...two(['US0378331005',ISIN_B]),openRows:[row({figi:'BBG000AAAAA1'})]});
  expect(q.duplicates).toBe(1);
  const f=q.claims.filter(c=>c.id_type==='figi');
  expect(f.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','BBG000BBBBB2',{expected_current:'BBG000AAAAA1',new_value:'BBG000BBBBB2',candidates:[{figi:'BBG000AAAAA1',level:'composite'},{figi:'BBG000BBBBB2',level:'composite'}]}]]);
  expect(p.claims.filter(c=>c.id_type==='figi')).toHaveLength(2);
 });
 it('stored ISIN equal to the GLEIF value while HKEX differs: exactly one correction, expected_current = stored',()=>{
  const res=okR(AAPL_JOB,[rec({ticker:'700',exchCode:'HK',figi:'BBG000TENCT1',compositeFIGI:'BBG000TENCT1'})]);
  const hkex=new Map([['00700',{isin:'KYG875721634',file:'list_of_securities' as const,sha256:'d'.repeat(64),row:5}]]);
  const p=planIdentifierWrites(base({stages:new Set(['A','B','D']),openRows:[row({ticker:'00700.HK',isin:'US0378331005'})],isinResults:new Map([['US0378331005',res]]),hkex}));
  expect(p.claims.map(c=>[c.op,c.value,c.detail.params])).toEqual([['correct_identifier','KYG875721634',{expected_current:'US0378331005',new_value:'KYG875721634'}]]);
  expect(p.writes.filter(w=>w.column==='isin')).toEqual([]);
 });
 it('ISIN claims carry the OpenFIGI response as its own evidence item so a new response appends',()=>{
  const p=planIdentifierWrites(base({openRows:[row({isin:'US9999999999'})]}));
  const c=p.claims.find(x=>x.id_type==='isin')!;
  expect(c.detail.sources.map(s=>[s.source,s.evidence_sha256])).toEqual([['gleif_openfigi',GSHA],['openfigi',RSHA]]);
 });
});
