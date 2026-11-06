// src/lib/entities/link-ah.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryRawStore} from '../dq/raw-store';
import {loaderOutcome} from './load-sec';
import {mapIsins,type FigiJob,type FigiJobResult,type FigiRecord} from './identifiers/openfigi';
import {applyAhLinks,figiErrorsFromResults,figiHitsFromResults,planAhLinks,selectAhIssuers,shareClassFor,type AhFigiHit,type AhIssuer,type AhLinkInput} from './link-ah';

const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.ah-link';
const A='10000000-0000-4000-8000-0000000000a1',B='10000000-0000-4000-8000-0000000000b1',C='10000000-0000-4000-8000-0000000000c1';
const LEI='529900T8BM49AURSDO55';
const iss=(o:Partial<AhIssuer>):AhIssuer=>({issuer_id:A,lei:LEI,usci:null,names:['Weichai Power Co., Ltd.','潍柴动力股份有限公司'],aTickers:['000338.SZ'],hTickers:[],...o});
const hit=(o:Partial<AhFigiHit>={}):AhFigiHit=>({issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},gleifSha256:'a'.repeat(64),requestSha256:'b'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:LEI,...o});
const UNI=new Map([['02338.HK',{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}],['02899.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
const HK_ISIN=(code:string,isin='CNE1000004L9')=>[code,{isin,file:'isin_hkex' as const,sha256:'e'.repeat(64),row:7}] as const;
const input=(o:Partial<AhLinkInput>={}):AhLinkInput=>({asOf:ASOF,issuers:[iss({})],figiHits:[hit()],universe:UNI,openOwner:new Map(),hkex:null,hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('02899')]),...o});

const hkexList=(rows:{stockCode:string;name:string;category:string}[])=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:rows.map((r,i)=>({...r,isin:null,row:i+5}))});
const RAWS={gleif:{sha256:'a'.repeat(64),path:`gleif/${'a'.repeat(64)}.csv`},hkex:{sha256:'d'.repeat(64),path:`hkex/${'d'.repeat(64)}.xlsx`}};
const U2=new Map([...UNI,['80700.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
const strip=(p:ReturnType<typeof planAhLinks>)=>JSON.stringify(p);

describe('planAhLinks · rule 1 (same LEI, hard identifiers only)',()=>{
 it('auto-attaches only when the HKEX ISIN equals the hit ISIN; provenance.isin is the HKEX evidence, GLEIF/OpenFIGI corroborate',()=>{
  const p=planAhLinks(input());
  expect(p.attaches).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',share_class:'H',is_primary:false,valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi',provenance:{
   isin:{source:'hkex_isin_hkex',as_of:ASOF,evidence_sha256:'e'.repeat(64),locator:'isin_hkex:row:7',corroborated_by:[{source:'gleif_openfigi',evidence_sha256:'a'.repeat(64),locator:`gleif:${LEI},CNE1000004L9;openfigi:${'c'.repeat(64)}#0`}]},
   figi:{source:'openfigi',as_of:ASOF,evidence_sha256:'c'.repeat(64),job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},level:'composite'},
   valid_from:{source:'stocks_universe.list_date',provider:'tushare_hk_basic',as_of:ASOF,row:{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}},
  }}]);
  expect(p.claims).toEqual([]);
 });
 it('falls back to first_observed without a list date; share class unknown without A rows or USCI',()=>{
  const p=planAhLinks(input({issuers:[iss({aTickers:[]})],figiHits:[hit({ticker:'02899.HK',figi:null,level:null})]}));
  expect(p.attaches[0]).toMatchObject({ticker:'02899.HK',valid_from:ASOF,valid_from_method:'first_observed',share_class:'unknown',figi:null});
  expect(Object.keys(p.attaches[0].provenance??{})).toEqual(['isin']);
  expect(shareClassFor(iss({aTickers:[],usci:'91370000163446410B'}))).toBe('H');
 });
 it('quarantines a line owned by another issuer with the full evidence, whatever the validation class',()=>{
  const e={gleif_sha256:'a'.repeat(64),gleif_path:RAWS.gleif.path,openfigi_response_sha256:'c'.repeat(64),openfigi_path:`openfigi/${'c'.repeat(64)}.json`,hkex_sha256:'d'.repeat(64),hkex_path:RAWS.hkex.path};
  const owned=planAhLinks(input({openOwner:new Map([['02338.HK',B]]),raw:RAWS}));
  expect(owned.attaches).toEqual([]);
  expect(owned.conflicts).toEqual([{naturalKey:`02338.HK:${ASOF}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:B,classified:['hard'],evidence:e},payload:{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9'}}]);
  const soft=planAhLinks(input({hkexIsins:new Map(),openOwner:new Map([['02338.HK',B]]),raw:RAWS}));
  expect([soft.claims,soft.attaches]).toEqual([[],[]]);
  expect(soft.conflicts[0].detail).toMatchObject({classified:['soft'],owner_issuer_id:B});
 });
 it('summarises not-in-universe and not-equity drops; an own existing line is already_attached',()=>{
  expect(planAhLinks(input({figiHits:[hit({ticker:'09999.HK'})],hkexIsins:new Map([HK_ISIN('09999')])})).skipped).toEqual(['ticker_not_in_universe']);
  expect(planAhLinks(input({hkex:hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity Warrants'}])})).skipped.includes('not_equity')).toBe(true);
  expect(planAhLinks(input({hkex:hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Real Estate Investment Trusts'}])})).attaches).toEqual([]);
  expect(planAhLinks(input({issuers:[iss({hTickers:['02338.HK']})]})).skipped).toEqual(['already_attached']);
 });
 it('files a provider_mapping attach_security claim for a hit without an HKEX ISIN, with ticker-lookup evidence; never auto-attaches',()=>{
  const tl={figi:'BBG000WEICH1',level:'composite' as const,evidence:{request_sha256:'f'.repeat(64),response_sha256:'9'.repeat(64),index:2}};
  const p=planAhLinks(input({hkexIsins:new Map(),tickerLookup:new Map([['02338.HK',tl]])}));
  expect(p.attaches).toEqual([]);
  expect(p.claims).toHaveLength(1);
  const c=p.claims[0];
  expect(c).toMatchObject({issuer_id:A,id_type:'ticker',value:'02338.HK',op:'attach_security',source:'gleif_openfigi',detail:{evidence_kind:'provider_mapping',target:{issuer_id:A},
   params:{ticker:'02338.HK',isin:'CNE1000004L9',share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi'}}});
  expect(c.detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi','openfigi_ticker']);
  expect(c.detail.sources[0].note).toContain(`request ${'b'.repeat(64)}`);
  expect(c.detail.sources[0].note).toContain('FIGI BBG000WEICH1, composite');
  expect(c.detail.sources[1]).toMatchObject({evidence_sha256:'9'.repeat(64),locator:`openfigi:${'9'.repeat(64)}#2`});
  expect(c.detail.sources[1].note).toContain(`request ${'f'.repeat(64)}`);
  expect(c.detail.sources[1].note).toContain('matches ISIN-level FIGI BBG000WEICH1');
  expect(Object.keys(c.detail.provenance_written??{})).toEqual(['valid_from']);
 });
 it('files a claim (no isin param) when HKEX and GLEIF/OpenFIGI ISINs disagree, and when the issuer already holds an H line',()=>{
  const d=planAhLinks(input({hkexIsins:new Map([HK_ISIN('02338','HK0000000001')])}));
  expect(d.attaches).toEqual([]);
  expect(d.claims).toHaveLength(1);
  expect(d.claims[0].detail.params).not.toHaveProperty('isin');
  expect(d.claims[0].detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi','hkex_isin_hkex']);
  expect(d.claims[0].detail.sources[1].note).toContain('disagrees');
  const second=planAhLinks(input({issuers:[iss({hTickers:['00001.HK']})]}));
  expect([second.attaches.length,second.claims.length]).toEqual([0,1]);
 });
 it('never links every ticker OpenFIGI returns for an ISIN (Tencent: 00700.HK, 80700.HK, TCTZF): only the HKEX-confirmed one attaches',()=>{
  const p=planAhLinks(input({universe:U2,figiHits:[hit(),hit({ticker:'80700.HK',figi:'BBG000WEICH3'})],hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('80700','HK0000000001')])}));
  expect(p.attaches.map(a=>a.ticker)).toEqual(['02338.HK']);
  expect(p.claims.map(c=>c.value)).toEqual(['80700.HK']);
 });
 it('rejects -OLD superseded counters before any validation: no attach, no claim, summarised',()=>{
  const old=hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H-OLD',category:'Equity'}]);
  const a=planAhLinks(input({hkex:old}));
  expect([a.attaches,a.claims,a.conflicts]).toEqual([[],[],[]]);
  expect(a.skipped.filter(x=>x==='superseded_counter')).toEqual(['superseded_counter']);
  // dropped from the ISIN workbooks only (no list rows): same outcome, even with no HKEX ISIN left for the code
  const b=planAhLinks(input({hkexIsins:new Map(),hkexSuperseded:new Set(['02338'])}));
  expect([b.attaches,b.claims,b.conflicts]).toEqual([[],[],[]]);
  expect(b.skipped).toEqual(['superseded_counter']);
  // also not quarantined when another issuer owns the old counter
  expect(planAhLinks(input({hkex:old,openOwner:new Map([['02338.HK',B]])})).conflicts).toEqual([]);
 });
 it('is independent of hit order and keeps ambiguity: an invalid hit before or after a valid one gives the same plan',()=>{
  const ok=hit();
  const old=hit({ticker:'02899.HK'});
  const list=hkexList([{stockCode:'02899',name:'OTHER CO LTD - H-OLD',category:'Equity'}]);
  const x=planAhLinks(input({figiHits:[old,ok],hkex:list}));
  const y=planAhLinks(input({figiHits:[ok,old],hkex:list}));
  expect(strip(x)).toBe(strip(y));
  expect(x.attaches.map(a=>a.ticker)).toEqual(['02338.HK']);
  // two ISINs for one ticker, only one confirmed by HKEX: ambiguous → one claim, no attach, no isin param, any order
  const other=hit({isin:'CNE1000004M7',index:1});
  const p1=planAhLinks(input({figiHits:[ok,other]}));
  const p2=planAhLinks(input({figiHits:[other,ok]}));
  expect(strip(p1)).toBe(strip(p2));
  expect(p1.attaches).toEqual([]);
  expect(p1.claims).toHaveLength(1);
  expect(p1.claims[0].detail.params).not.toHaveProperty('isin');
  expect(p1.claims[0].detail.sources.length).toBeGreaterThanOrEqual(3);
 });
});

describe('selectAhIssuers',()=>{
 it('keeps LEI-bearing issuers for rule 1 even without A rows or USCI; A-share restriction stays with rule 2 / share class',()=>{
  const rows=[
   {issuer_id:A,lei:LEI,usci:null,names:['X']},
   {issuer_id:B,lei:null,usci:'91370000163446410B',names:['Y']},
   {issuer_id:C,lei:null,usci:null,names:['Z']},
   {issuer_id:'10000000-0000-4000-8000-0000000000d1',lei:null,usci:null,names:['W']},
  ];
  const sel=selectAhIssuers(rows,[{issuer_id:C,ticker:'601899.SH'},{issuer_id:A,ticker:'AAPL'},{issuer_id:A,ticker:'02338.HK'}]);
  expect(sel.map(i=>i.issuer_id)).toEqual([A,C]);
  expect(sel[0]).toMatchObject({aTickers:[],hTickers:['02338.HK']});
  expect(shareClassFor(sel[0])).toBe('unknown');
  expect(shareClassFor(sel[1])).toBe('H');
  // an LEI issuer with no A rows still gets a rule-1 attach (share class unknown) and no rule-2 claim
  const p=planAhLinks(input({issuers:[{...sel[0],hTickers:[]}],hkex:hkexList([{stockCode:'02338',name:'X',category:'Equity'}])}));
  expect(p.attaches[0]).toMatchObject({issuer_id:A,share_class:'unknown'});
  expect(p.claims).toEqual([]);
 });
});

describe('planAhLinks · rule 2 (HKEX name match)',()=>{
 const hkex=hkexList;
 it('files one attach_security claim (name_match) for exactly one equal Equity name',()=>{
  const p=planAhLinks(input({figiHits:[],hkex:hkex([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'},{stockCode:'02339',name:'WEICHAI POWER CO LTD - H',category:'Debt Securities'}])}));
  expect(p.attaches).toEqual([]);
  expect(p.claims).toHaveLength(1);
  expect(p.claims[0]).toMatchObject({issuer_id:A,id_type:'ticker',value:'02338.HK',source:'hkex_list_name_match',op:'attach_security',detail:{
   schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:A},
   params:{ticker:'02338.HK',share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'hkex_list_name_match'},
   evidence:{source:'hkex_list_of_securities',as_of:ASOF,evidence_sha256:'d'.repeat(64),locator:'list_of_securities:row:5'},
  }});
 });
 it('files nothing for zero or several matches, for issuers without A rows, or when rule 1 already linked',()=>{
  const two=hkex([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'},{stockCode:'02340',name:'Weichai Power Co Ltd',category:'Equity'}]);
  expect(planAhLinks(input({figiHits:[],hkex:two})).skipped).toEqual(['name_match_multiple']);
  expect(planAhLinks(input({figiHits:[],hkex:hkex([{stockCode:'00700',name:'TENCENT',category:'Equity'}])})).skipped).toEqual(['name_match_none']);
  expect(planAhLinks(input({figiHits:[],issuers:[iss({aTickers:[]})],hkex:two})).claims).toEqual([]);
  expect(planAhLinks(input({hkex:two})).claims).toEqual([]);
 });
});

describe('figiHitsFromResults',()=>{
 it('keeps HK candidates of each issuer LEI, with a FIGI only when exactly one group exists',()=>{
  const rec=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000WEICH1',compositeFIGI:'BBG000WEICH1',ticker:'2338',exchCode:'HK',securityType:'Common Stock',marketSector:'Equity',...o});
  const job:FigiJob={idType:'ID_ISIN',idValue:'CNE1000004L9'};
  const results=new Map<string,FigiJobResult>([['CNE1000004L9',{job,status:'ok',records:[rec({}),rec({ticker:'000338',exchCode:'CS',figi:'BBG000WEICH2',compositeFIGI:'BBG000WEICH2'})],evidence:{request_sha256:'b'.repeat(64),response_sha256:'c'.repeat(64),index:3}}]]);
  const hits=figiHitsFromResults([iss({})],{sha256:'a'.repeat(64),byLei:new Map([[LEI,['CNE1000004L9']]])},results);
  expect(hits).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job,gleifSha256:'a'.repeat(64),requestSha256:'b'.repeat(64),responseSha256:'c'.repeat(64),index:3,lei:LEI}]);
 });

 it('lists per-job error results (not not_found) with their evidence; an HTTP-200 all-errors response fails the batch',async()=>{
  const fetch=(async()=>new Response(JSON.stringify([{error:'Invalid idValue format'}]),{status:200})) as typeof globalThis.fetch;
  const m=await mapIsins(['CNE1000004L9'],{fetch,raw:memoryRawStore(),sleep:async()=>{}});
  const gleif={sha256:'a'.repeat(64),byLei:new Map([[LEI,['CNE1000004L9']]])};
  expect(figiHitsFromResults([iss({})],gleif,m.byKey)).toEqual([]);
  const errs=figiErrorsFromResults([iss({})],gleif,m.byKey);
  expect(errs).toHaveLength(1);
  expect(errs[0]).toMatchObject({isin:'CNE1000004L9',lei:LEI,message:'Invalid idValue format',evidence:{index:0}});
  const nf=new Map<string,FigiJobResult>([['CNE1000004L9',{job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},status:'not_found',message:'No identifier found.',evidence:errs[0].evidence}]]);
  expect(figiErrorsFromResults([iss({})],gleif,nf)).toEqual([]);
  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  const res=await applyAhLinks(c,planAhLinks(input({figiHits:[],figiErrors:errs})),{batchId:BATCH,dataset:DATASET});
  expect(res.counts.failed).toBe(1);
  expect(res.errors.find(e=>e.code==='openfigi_error')).toMatchObject({key:'CNE1000004L9'});
  expect(JSON.parse(res.errors.find(e=>e.code==='openfigi_error')!.message!)).toMatchObject({request_sha256:errs[0].evidence.request_sha256,response_sha256:errs[0].evidence.response_sha256,index:0});
  expect(loaderOutcome('partial',res.counts)).toEqual({ok:false,exitCode:1});
 });
});

describe('applyAhLinks',()=>{
 it('attaches, quarantines and files claims once; a replay is a duplicate',async()=>{
  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  await c.insert('issuer_securities',{issuer_id:B,ticker:'02899.HK',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{}});
  const plan=planAhLinks(input({issuers:[iss({}),iss({issuer_id:C,lei:null,names:['Zijin Mining Group Co., Ltd.'],aTickers:['601899.SH']})],
   figiHits:[hit(),hit({issuer_id:A,ticker:'02899.HK'})],openOwner:new Map([['02899.HK',B]]),
   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:'02899',name:'ZIJIN MINING GROUP CO LTD - H',category:'Equity',isin:null,row:9}]},raw:RAWS}));
  const res=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
  expect(c.rows('issuer_securities').find(r=>r.ticker==='02338.HK')).toMatchObject({issuer_id:A,share_class:'H',valid_from_method:'listing_date'});
  expect(c.rows('dq_quarantine').map(q=>[q.natural_key,q.reason_code])).toEqual([[`02899.HK:${ASOF}`,'ownership_conflict']]);
  expect(res.counts).toMatchObject({inserted:1,quarantined:1,failed:0});
  expect(res.claims).toEqual({});
  expect(res.skippedSummary).toEqual({name_match_owned:1});
  const again=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
  expect(again.counts).toMatchObject({inserted:0,duplicates:1});
 });

 it('keeps the planned evidence and names the real cause when attachSecurity conflicts at apply time',async()=>{
  const mk=()=>memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  const row=(o:Record<string,unknown>)=>({issuer_id:B,ticker:'02338.HK',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{},...o});
  const plan=planAhLinks(input({raw:RAWS}));
  // another issuer opened the ticker after planning
  const c1=mk();await c1.insert('issuer_securities',row({}));
  const r1=await applyAhLinks(c1,plan,{batchId:BATCH,dataset:DATASET});
  const q1=c1.rows('dq_quarantine')[0];
  expect(q1.reason_code).toBe('ownership_conflict');
  expect(q1.detail).toMatchObject({reason:'ticker_owned_by_other_issuer',owner_issuer_id:B,rule:'same_lei',validated_by:'hkex_isin',evidence:{gleif_sha256:'a'.repeat(64),gleif_path:RAWS.gleif.path,hkex_sha256:'d'.repeat(64)}});
  expect(r1.counts).toMatchObject({quarantined:1,inserted:0});
  // the issuer's own row already covers an overlapping window
  const c2=mk();await c2.insert('issuer_securities',row({issuer_id:A,valid_from:'2010-01-01'}));
  await applyAhLinks(c2,plan,{batchId:BATCH,dataset:DATASET});
  expect(c2.rows('dq_quarantine')[0].reason_code).toBe('window_conflict');
  expect(c2.rows('dq_quarantine')[0].detail).toMatchObject({reason:'window_overlaps_own_row',evidence:{gleif_sha256:'a'.repeat(64)}});
 });
});
