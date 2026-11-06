// src/lib/entities/link-ah.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import type {FigiJob,FigiJobResult,FigiRecord} from './identifiers/openfigi';
import {applyAhLinks,figiHitsFromResults,planAhLinks,shareClassFor,type AhFigiHit,type AhIssuer,type AhLinkInput} from './link-ah';

const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.ah-link';
const A='10000000-0000-4000-8000-0000000000a1',B='10000000-0000-4000-8000-0000000000b1',C='10000000-0000-4000-8000-0000000000c1';
const LEI='529900T8BM49AURSDO55';
const iss=(o:Partial<AhIssuer>):AhIssuer=>({issuer_id:A,lei:LEI,usci:null,names:['Weichai Power Co., Ltd.','潍柴动力股份有限公司'],aTickers:['000338.SZ'],hTickers:[],...o});
const hit=(o:Partial<AhFigiHit>={}):AhFigiHit=>({issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:LEI,...o});
const UNI=new Map([['02338.HK',{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}],['02899.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
const HK_ISIN=(code:string,isin='CNE1000004L9')=>[code,{isin,file:'isin_hkex' as const,sha256:'e'.repeat(64),row:7}] as const;
const input=(o:Partial<AhLinkInput>={}):AhLinkInput=>({asOf:ASOF,issuers:[iss({})],figiHits:[hit()],universe:UNI,openOwner:new Map(),hkex:null,hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('02899')]),...o});

describe('planAhLinks · rule 1 (same LEI)',()=>{
 it('attaches the HK line at its listing date as an H share with GLEIF/OpenFIGI/listing provenance',()=>{
  const p=planAhLinks(input());
  expect(p.attaches).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',share_class:'H',is_primary:false,valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi',provenance:{
   isin:{source:'gleif_openfigi',as_of:ASOF,evidence_sha256:'a'.repeat(64),locator:`gleif:${LEI},CNE1000004L9;openfigi:${'c'.repeat(64)}#0;hkex:isin_hkex:${'e'.repeat(64)}:row:7`},
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
 it('quarantines a line owned by another issuer and skips issuers that already hold an H line',()=>{
  const owned=planAhLinks(input({openOwner:new Map([['02338.HK',B]]),raw:{gleif:{sha256:'a'.repeat(64),path:`gleif/${'a'.repeat(64)}.csv`},hkex:{sha256:'d'.repeat(64),path:`hkex/${'d'.repeat(64)}.xlsx`}}}));
  expect(owned.attaches).toEqual([]);
  expect(owned.conflicts).toEqual([{naturalKey:`02338.HK:${ASOF}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:B,validated_by:'hkex_isin',evidence:{gleif_sha256:'a'.repeat(64),gleif_path:`gleif/${'a'.repeat(64)}.csv`,openfigi_response_sha256:'c'.repeat(64),openfigi_path:`openfigi/${'c'.repeat(64)}.json`,hkex_sha256:'d'.repeat(64),hkex_path:`hkex/${'d'.repeat(64)}.xlsx`}},payload:{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9'}}]);
  expect(planAhLinks(input({issuers:[iss({hTickers:['02338.HK']})]})).skipped).toEqual(['already_has_h']);
  expect(planAhLinks(input({figiHits:[hit({ticker:'09999.HK'})],hkexIsins:new Map([HK_ISIN('09999')])})).skipped).toEqual(['ticker_not_in_universe']);
 });
 it('never links a co-mapped ticker that cannot be validated as the issuer\'s own line (Tencent: 00700.HK, 80700.HK, TCTZF)',()=>{
  const U=new Map([...UNI,['80700.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
  const multi=[hit(),hit({ticker:'80700.HK',figi:'BBG000WEICH3'})];
  // HKEX ISIN match only for the real counter; the RMB counter has a different HKEX ISIN
  const p=planAhLinks(input({universe:U,figiHits:multi,hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('80700','HK0000000001')])}));
  expect(p.attaches.map(a=>a.ticker)).toEqual(['02338.HK']);
  expect(p.skipped).toEqual(['hkex_isin_mismatch']);
  // no HKEX ISIN for the code and no ticker-level FIGI → unvalidated, nothing attached or quarantined
  const none=planAhLinks(input({universe:U,figiHits:[hit({ticker:'80700.HK'})],hkexIsins:new Map(),openOwner:new Map([['80700.HK',B]])}));
  expect([none.attaches,none.conflicts,none.claims]).toEqual([[],[],[]]);
  expect(none.skipped).toEqual(['ticker_unvalidated']);
 });
 it('accepts a ticker-level FIGI equal to the ISIN-level FIGI when HKEX has no ISIN for the code',()=>{
  const ok=planAhLinks(input({hkexIsins:new Map(),tickerFigi:new Map([['02338.HK','BBG000WEICH1']])}));
  expect(ok.attaches).toHaveLength(1);
  expect((ok.attaches[0].provenance as {isin:{locator:string}}).isin.locator).toContain('openfigi_ticker:BBG000WEICH1');
  expect(planAhLinks(input({hkexIsins:new Map(),tickerFigi:new Map([['02338.HK','BBG000OTHER9']])})).skipped).toEqual(['ticker_unvalidated']);
  expect(planAhLinks(input({hkexIsins:new Map(),figiHits:[hit({figi:null,level:null})],tickerFigi:new Map([['02338.HK','BBG000WEICH1']])})).skipped).toEqual(['ticker_unvalidated']);
 });
 it('rejects a non-equity HKEX category and ignores -OLD counters in the name match',()=>{
  const row=(category:string,name='WEICHAI POWER CO LTD - H')=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:[{stockCode:'02338',name,category,isin:null,row:5}]});
  expect(planAhLinks(input({hkex:row('Equity Warrants')})).skipped).toEqual(['name_match_none','not_equity']);
  expect(planAhLinks(input({figiHits:[],hkex:row('Equity','WEICHAI POWER CO LTD - H-OLD')})).skipped).toEqual(['name_match_none']);
 });
});

describe('planAhLinks · rule 2 (HKEX name match)',()=>{
 const hkex=(rows:{stockCode:string;name:string;category:string}[])=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:rows.map((r,i)=>({...r,isin:null,row:i+5}))});
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
  expect(hits).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job,gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:3,lei:LEI}]);
 });
});

describe('applyAhLinks',()=>{
 it('attaches, quarantines and files claims once; a replay is a duplicate',async()=>{
  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  await c.insert('issuer_securities',{issuer_id:B,ticker:'02899.HK',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{}});
  const plan=planAhLinks(input({issuers:[iss({}),iss({issuer_id:C,lei:null,names:['Zijin Mining Group Co., Ltd.'],aTickers:['601899.SH']})],
   figiHits:[hit(),hit({issuer_id:A,ticker:'02899.HK'})],openOwner:new Map([['02899.HK',B]]),
   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:'02899',name:'ZIJIN MINING GROUP CO LTD - H',category:'Equity',isin:null,row:9}]}}));
  const res=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
  expect(c.rows('issuer_securities').find(r=>r.ticker==='02338.HK')).toMatchObject({issuer_id:A,share_class:'H',valid_from_method:'listing_date'});
  expect(c.rows('dq_quarantine').map(q=>[q.natural_key,q.reason_code])).toEqual([[`02899.HK:${ASOF}`,'ownership_conflict']]);
  expect(res.counts).toMatchObject({inserted:1,quarantined:1,failed:0});
  expect(res.claims).toEqual({});
  expect(res.skippedSummary).toEqual({name_match_owned:1});
  const again=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
  expect(again.counts).toMatchObject({inserted:0,duplicates:1});
 });
});
