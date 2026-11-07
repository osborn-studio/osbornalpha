// src/lib/company/evidence-gate.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {rawHashOf} from '@/lib/facts/providers/shared';
import type {FactRow} from '@/lib/facts/types';
import {applyGate,eventFactIds,evidenceEligible,gateCell,gateEventPayload,gateFacts,metricWithheldReason,toEvidenceDto} from './evidence-gate';
import type {Eligibility} from './evidence-gate';
import {emptyPdfLocatorSource,staticPdfLocatorSource} from './pdf-locator';
import {ISSUER,factRow,filingSummary,resetBuilders} from './test-builders';
import {EVIDENCE_INDEX_VERSION} from './types';
import type {EvidenceDto,EvidenceRecord,FilingSummary,PdfLocator} from './types';

const SHA='a'.repeat(64);
const LOC_US='facts.us-gaap.Revenues.units.USD[0](accn=x,start=2023-01-01,end=2023-12-31)';
const LOC_CN='income:rt1:p1[end_date=20231231,ann=20240403,update_flag=1,row=0]';
const DOC='https://static.cninfo.com.cn/finalpage/2024-04-03/1219.PDF';
function record(fact:FactRow,o:Partial<EvidenceRecord>={}):EvidenceRecord{
 const cn=fact.market==='CN';const loc=cn?LOC_CN:LOC_US;
 return {fact_id:fact.fact_id,raw_hash:rawHashOf(SHA,loc),snapshot_sha256:SHA,snapshot_path:`${cn?'tushare':'edgar'}/${ISSUER}/${SHA}.json`,hash_locator:loc,json_pointer:cn?'/data/items/0':'/facts/us-gaap/Revenues/units/USD/0',field:cn?'total_revenue':null,
  source:cn?'tushare':'edgar',api:cn?'income':null,url:cn?null:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',params:cn?{ts_code:'600519.SH'}:null,captured_at:'2026-11-05T05:15:53.573Z',http_status:200,page:cn?1:null,
  index_version:EVIDENCE_INDEX_VERSION,run_id:fact.run_id,code_version:'c'.repeat(40),tool_versions:{mapping_gen:'1'},mapping_version:'facts-map/1',...o};
}
const pdfOf=(o:Partial<PdfLocator>={}):PdfLocator=>({page:12,table:'合并利润表',row:'营业总收入',column:'本期发生额',documentUrl:DOC,...o});
let usF:FilingSummary,cnF:FilingSummary,us:FactRow,cn:FactRow;
beforeEach(()=>{
 resetBuilders();
 usF=filingSummary();us=factRow(usF,{raw_hash:rawHashOf(SHA,LOC_US)});
 cnF=filingSummary({source:'tushare',url:null,documentUrl:DOC,citation:'linked',formType:'annual'});
 cn=factRow(cnF,{market:'CN',unit:'CNY',raw_hash:rawHashOf(SHA,LOC_CN)});
});
const usDto=(o:Partial<EvidenceRecord>={},f:FilingSummary=usF)=>toEvidenceDto(record(us,o),us,f,null);
const cnDto=(o:Partial<EvidenceRecord>={},pdf:PdfLocator|null=pdfOf(),f:FilingSummary=cnF)=>toEvidenceDto(record(cn,o),cn,f,pdf);
const no=(reason:'evidence_incomplete'|'citation_pending')=>({ok:false,reason});

describe('toEvidenceDto (§0 #62)',()=>{
 it('maps the record; EDGAR gets the stable download endpoint and edgar_index source document',()=>{
  expect(usDto()).toEqual({factId:us.fact_id,rawHash:rawHashOf(SHA,LOC_US),
   snapshot:{source:'edgar',sha256:SHA,path:`edgar/${ISSUER}/${SHA}.json`,api:null,url:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',params:null,capturedAt:'2026-11-05T05:15:53.573Z',httpStatus:200,page:null,download:`/api/companies/snapshot?fact=${us.fact_id}`},
   locator:{hashLocator:LOC_US,jsonPointer:'/facts/us-gaap/Revenues/units/USD/0',field:null,pdf:null},
   run:{runId:us.run_id,codeVersion:'c'.repeat(40),toolVersions:{mapping_gen:'1'}},mappingVersion:'facts-map/1',unitRule:'unit_money',sourceDocument:{kind:'edgar_index',url:usF.url!}} satisfies EvidenceDto);
 });
 it('Tushare: no download; cninfo_pdf only when linked with a document URL',()=>{
  expect(cnDto().snapshot.download).toBeNull();
  expect(cnDto().sourceDocument).toEqual({kind:'cninfo_pdf',url:DOC});
  expect(cnDto({},pdfOf(),{...cnF,citation:'pending',documentUrl:null}).sourceDocument).toBeNull();
 });
});

describe('evidenceEligible (§0 #63): each condition alone disqualifies',()=>{
 const elig=(dto:EvidenceDto|null,fact:FactRow,f:FilingSummary|null,m:'US'|'CN',admin=false)=>evidenceEligible(dto,fact,f,m,{admin});
 it('US: complete evidence is eligible',()=>{expect(elig(usDto(),us,usF,'US')).toEqual({ok:true});});
 it('US base and US-only conditions → evidence_incomplete (admin does not waive them)',()=>{
  const cases:[string,EvidenceDto|null,FactRow,FilingSummary|null][]=[
   ['no dto',null,us,usF],
   ['empty codeVersion',usDto({code_version:''}),us,usF],['null codeVersion',usDto({code_version:null}),us,usF],
   ['null toolVersions',usDto({tool_versions:null}),us,usF],['empty mappingVersion',usDto({mapping_version:''}),us,usF],
   ['rawHash not the fact\'s',usDto(),{...us,raw_hash:'b'.repeat(64)},usF],
   ['rawHash not sha256(sha\\nlocator)',usDto({raw_hash:'c'.repeat(64)}),{...us,raw_hash:'c'.repeat(64)},usF],
   ['empty hashLocator',usDto({hash_locator:''}),us,usF],['bad sha',usDto({snapshot_sha256:'xyz'}),us,usF],
   ['empty jsonPointer',usDto({json_pointer:''}),us,usF],
   ['no download',{...usDto(),snapshot:{...usDto().snapshot,download:null}},us,usF],
   ['no source document',usDto({},{...usF,url:null}),us,{...usF,url:null}],
   ['filing missing',usDto(),us,null],['other filing',usDto(),us,{...usF,filingId:cnF.filingId}],
   ['dto of another fact',{...usDto(),factId:cn.fact_id},us,usF],
   ['wrong source for market',usDto({source:'tushare'}),us,usF],
  ];
  for(const [name,dto,fact,f] of cases){
   expect(elig(dto,fact,f,'US'),name).toEqual(no('evidence_incomplete'));
   expect(elig(dto,fact,f,'US',true),`${name} (admin)`).toEqual(no('evidence_incomplete'));
  }
 });
 it('CN: linked + https document + bound pdf locator is eligible',()=>{expect(elig(cnDto(),cn,cnF,'CN')).toEqual({ok:true});});
 it('CN PDF conditions → citation_pending; admin waives exactly these',()=>{
  const cases:[string,EvidenceDto,FilingSummary][]=[
   ['citation pending',cnDto({},pdfOf(),{...cnF,citation:'pending'}),{...cnF,citation:'pending'}],
   ['no document url',cnDto({},pdfOf(),{...cnF,documentUrl:null}),{...cnF,documentUrl:null}],
   ['http document url',cnDto({},pdfOf({documentUrl:'http://x/1.PDF'}),{...cnF,documentUrl:'http://x/1.PDF'}),{...cnF,documentUrl:'http://x/1.PDF'}],
   ['no pdf locator',cnDto({},null),cnF],
   ['page -1',cnDto({},pdfOf({page:-1})),cnF],['page 0',cnDto({},pdfOf({page:0})),cnF],['page 1.5',cnDto({},pdfOf({page:1.5})),cnF],
   ['empty row',cnDto({},pdfOf({row:''})),cnF],['blank column',cnDto({},pdfOf({column:'  '})),cnF],['empty table',cnDto({},pdfOf({table:''})),cnF],
   ['pdf of another document',cnDto({},pdfOf({documentUrl:'https://static.cninfo.com.cn/other.PDF'})),cnF],
  ];
  for(const [name,dto,f] of cases){
   expect(elig(dto,cn,f,'CN'),name).toEqual(no('citation_pending'));
   expect(elig(dto,cn,f,'CN',true),`${name} (admin)`).toEqual({ok:true});
  }
 });
 it('CN base evidence missing wins over PDF conditions, also for admin',()=>{
  expect(elig(cnDto({code_version:null},null),cn,cnF,'CN')).toEqual(no('evidence_incomplete'));
  expect(elig(cnDto({code_version:null},null),cn,cnF,'CN',true)).toEqual(no('evidence_incomplete'));
  expect(elig(null,cn,cnF,'CN',true)).toEqual(no('evidence_incomplete'));
 });
});

describe('applyGate / gateFacts',()=>{
 it('evidence dictionary only for eligible facts; withheld counts by distinct fact; unknown ids incomplete',()=>{
  const bad=factRow(usF,{raw_hash:rawHashOf(SHA,LOC_US)});
  const r=applyGate({factIds:[us.fact_id,us.fact_id,bad.fact_id,'missing'],facts:new Map([[us.fact_id,us],[bad.fact_id,bad]]),filings:new Map([[usF.filingId,usF]]),
   records:new Map([[us.fact_id,record(us)],[bad.fact_id,record(bad,{code_version:null})]]),pdf:new Map(),market:'US',admin:false});
  expect(Object.keys(r.evidence)).toEqual([us.fact_id]);
  expect(r.eligibility.get(bad.fact_id)).toEqual(no('evidence_incomplete'));
  expect(r.eligibility.get('missing')).toEqual(no('evidence_incomplete'));
  expect(r.withheld).toEqual({evidenceIncomplete:2,citationPending:0});
 });
 it('gateFacts reads evidence once for the sorted unique ids, asks the PDF source only for CN, and does nothing for no ids',async()=>{
  const evidenceOf=vi.fn(async(ids:string[])=>new Map(ids.map(id=>[id,record(id===cn.fact_id?cn:us)])));
  const pdf=staticPdfLocatorSource({[cn.fact_id]:pdfOf()});const locate=vi.spyOn(pdf,'locate');
  const r=await gateFacts({db:{evidenceOf},pdf},{issuerId:ISSUER,market:'CN',admin:false,factIds:[cn.fact_id,cn.fact_id],facts:new Map([[cn.fact_id,cn]]),filings:new Map([[cnF.filingId,cnF]])});
  expect(evidenceOf).toHaveBeenCalledWith([cn.fact_id]);expect(locate).toHaveBeenCalledWith(ISSUER,'CN',[cn.fact_id]);
  expect(r.eligibility.get(cn.fact_id)).toEqual({ok:true});
  const usLocate=vi.spyOn(emptyPdfLocatorSource,'locate');
  await gateFacts({db:{evidenceOf},pdf:emptyPdfLocatorSource},{issuerId:ISSUER,market:'US',admin:false,factIds:[us.fact_id],facts:new Map([[us.fact_id,us]]),filings:new Map([[usF.filingId,usF]])});
  expect(usLocate).not.toHaveBeenCalled();
  evidenceOf.mockClear();
  expect((await gateFacts({db:{evidenceOf},pdf},{issuerId:ISSUER,market:'CN',admin:false,factIds:[],facts:new Map(),filings:new Map()})).withheld).toEqual({evidenceIncomplete:0,citationPending:0});
  expect(evidenceOf).not.toHaveBeenCalled();
  usLocate.mockRestore();
 });
 it('public CN with the default (empty) PDF source is withheld as citation_pending',async()=>{
  const evidenceOf=async(ids:string[])=>new Map(ids.map(id=>[id,record(cn)]));
  const r=await gateFacts({db:{evidenceOf},pdf:emptyPdfLocatorSource},{issuerId:ISSUER,market:'CN',admin:false,factIds:[cn.fact_id],facts:new Map([[cn.fact_id,cn]]),filings:new Map([[cnF.filingId,cnF]])});
  expect(r.eligibility.get(cn.fact_id)).toEqual(no('citation_pending'));expect(r.evidence).toEqual({});
 });
});

describe('index_version and empty inputs',()=>{
 it('a record from another index_version is evidence_incomplete (applyGate)',()=>{
  const r=applyGate({factIds:[us.fact_id],facts:new Map([[us.fact_id,us]]),filings:new Map([[usF.filingId,usF]]),records:new Map([[us.fact_id,record(us,{index_version:'company-evidence/0'})]]),pdf:new Map(),market:'US',admin:false});
  expect(r.eligibility.get(us.fact_id)).toEqual(no('evidence_incomplete'));expect(r.evidence).toEqual({});
 });
 it('derived cell / metric without inputs is withheld; unknown event kind throws; filing_published passes',()=>{
  const d={kind:'derived' as const,metric:'m',value:'1',unit:'USD',inputUnit:'USD',basis:'b',formulaVersion:'v',inputs:[]};
  expect(gateCell(d,new Map())).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:''});
  expect(metricWithheldReason([],new Map())).toBe('evidence_incomplete');
  expect(()=>gateEventPayload({kind:'bogus' as never,payload:{}},new Map())).toThrow('unknown_event_kind');
  expect(gateEventPayload({kind:'filing_published',payload:{a:1}},new Map())).toEqual({a:1});
 });
});

describe('consumers: every financial value is withheld when its fact is not eligible',()=>{
 const E=(entries:[string,Eligibility][])=>new Map(entries);
 it('statement fact cell and derived cell inputs',()=>{
  const cell={kind:'fact' as const,factId:'f1',value:'1',unit:'USD',availableDate:'2024-01-01',filingId:'g',disclosureSeq:1,isRevision:false,mappingGen:1,rawHash:'h',runId:'r',otherUnits:false};
  expect(gateCell(cell,E([['f1',{ok:true}]]))).toBe(cell);
  expect(gateCell(cell,E([['f1',no('citation_pending')]]))).toEqual({kind:'withheld',reason:'citation_pending',factId:'f1'});
  expect(gateCell(cell,E([]))).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:'f1'});
  const derived={kind:'derived' as const,metric:'q_single_revenue',value:'5',unit:'USD',inputUnit:'USD',basis:'us_standard',formulaVersion:'facts-derive/1.0',inputs:[{factId:'a',concept:'revenue',filingId:'g',availableDate:'2024-01-01'},{factId:'b',concept:'revenue',filingId:'g',availableDate:'2024-01-01'}],rule:'a' as const};
  expect(gateCell(derived,E([['a',{ok:true}],['b',{ok:true}]]))).toBe(derived);
  expect(gateCell(derived,E([['a',{ok:true}],['b',no('citation_pending')]]))).toEqual({kind:'withheld',reason:'citation_pending',factId:'b'});
  expect(gateCell(derived,E([['a',no('citation_pending')],['b',no('evidence_incomplete')]]))).toEqual({kind:'withheld',reason:'evidence_incomplete',factId:'b'});
  expect(gateCell(null,E([]))).toBeNull();
 });
 it('event headline, fact_revised from/to and relChange; filing_published untouched',()=>{
  const pfs={kind:'period_first_seen' as const,payload:{headline:{revenue:{factId:'r',value:'1',unit:'USD'},net_income_parent:{factId:'n',value:'2',unit:'USD'}},ambiguousUnits:[]}};
  expect(gateEventPayload(pfs,E([['r',{ok:true}],['n',no('evidence_incomplete')]]))).toEqual({headline:{revenue:{factId:'r',value:'1',unit:'USD'},net_income_parent:{factId:'n',value:{kind:'withheld',reason:'evidence_incomplete',factId:'n'},unit:'USD'}},ambiguousUnits:[]});
  const rev={kind:'fact_revised' as const,payload:{concept:'revenue',from:{factId:'a',value:'1',filingId:'g',availableDate:'2024-01-01'},to:{factId:'b',value:'2',filingId:'h',availableDate:'2024-05-01'},relChange:'1'}};
  expect(gateEventPayload(rev,E([['a',{ok:true}],['b',{ok:true}]]))).toEqual(rev.payload);
  expect(gateEventPayload(rev,E([['a',no('citation_pending')],['b',{ok:true}]]))).toEqual({concept:'revenue',from:{factId:'a',value:{kind:'withheld',reason:'citation_pending',factId:'a'},filingId:'g',availableDate:'2024-01-01'},to:rev.payload.to,relChange:{kind:'withheld',reason:'citation_pending'}});
  const fp={kind:'filing_published' as const,payload:{formType:'10-K',factCount:3}};
  expect(gateEventPayload(fp,E([]))).toEqual(fp.payload);
  expect(eventFactIds(pfs).sort()).toEqual(['n','r']);expect(eventFactIds(rev)).toEqual(['a','b']);expect(eventFactIds(fp)).toEqual([]);
 });
 it('metric row: any ineligible input withholds the whole row',()=>{
  expect(metricWithheldReason([{fact_id:'a'},{fact_id:'b'}],E([['a',{ok:true}],['b',{ok:true}]]))).toBeNull();
  expect(metricWithheldReason([{fact_id:'a'},{fact_id:'b'}],E([['a',{ok:true}],['b',no('citation_pending')]]))).toBe('citation_pending');
  expect(metricWithheldReason([{fact_id:'a'}],E([]))).toBe('evidence_incomplete');
 });
});
