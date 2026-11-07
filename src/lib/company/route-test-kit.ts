// src/lib/company/route-test-kit.ts
// Test-only kit for the company route tests (plan Tasks 9, 10, 14, 15): memory issuer tables read by the
// REAL resolveIssuer (§0 #69 ticker cases), FactRow / FilingSummary / EvidenceRecord builders, a ReadDeps
// stub of vi.fn members, and a deterministic double of applyGate (Task 6 owns the real rules and their
// tests; route code calls applyGate directly so this double replaces it): no fact / no evidence record → evidence_incomplete; CN non-admin without a linked filing AND a PDF locator
// → citation_pending; admin exempts only the CN conditions. Never imported by application code.
import {vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import type {TableClient} from '@/lib/db/table-client';
import {rawHashOf} from '@/lib/facts/providers/shared';
import type {FactRow,FilingRow,Market,MetricRow} from '@/lib/facts/types';
import type {ReadDeps} from './deps';
import type {Eligibility,GateInput,GateResult} from './evidence-gate';
import type {CompanyDb,EventRow,EvidenceDto,EvidenceRecord,FilingSummary,PdfLocator,ReadSnapshotResult,WithheldReason} from './types';

export const kid=(n:number)=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
export const US=kid(1),BRKA=kid(2),CN=kid(4),HK=kid(5),OLD=kid(6),AMB1=kid(7),AMB2=kid(8);
const issuerRow=(id:string,status='active',merged_into:string|null=null)=>({issuer_id:id,status,merged_into,lei:null,cik:null,usci:null,cninfo_org_id:null,hkex_stock_code_primary:null,canonical_name_zh:null,canonical_name_en:`Co ${id.slice(0,2)}`,country_code:null,provenance:{},created_at:'2020-01-01T00:00:00.000Z',updated_at:'2020-01-01T00:00:00.000Z'});
export const secRow=(issuer:string,ticker:string,p:Record<string,unknown>={})=>({issuer_id:issuer,ticker,isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,valid_from_method:'curated',valid_to_method:null,...p});
/** AAPL (US), BRK.A, 600519.SH (CN, share_class A), 00700.HK, OLDX merged into AAPL's issuer, AMBG owned by two issuers. */
export async function seededTables():Promise<TableClient>{
 const c=memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from']});
 for(const [id,t,cls] of [[US,'AAPL','common'],[BRKA,'BRK.A','common'],[CN,'600519.SH','A'],[HK,'00700.HK','H']] as const){await c.insert('issuers',issuerRow(id));await c.insert('issuer_securities',secRow(id,t,{share_class:cls}));}
 await c.insert('issuers',issuerRow(OLD,'merged',US));await c.insert('issuer_securities',secRow(OLD,'OLDX'));
 for(const id of [AMB1,AMB2]){await c.insert('issuers',issuerRow(id));await c.insert('issuer_securities',secRow(id,'AMBG'));}
 return c;
}
export const FIL_US='f0000000-0000-4000-8000-000000000001',FIL_CN_LINKED='f0000000-0000-4000-8000-000000000002',FIL_CN_PENDING='f0000000-0000-4000-8000-000000000003';
let seq=0;
export const fid=()=>`a${String(++seq).padStart(7,'0')}-0000-4000-8000-000000000000`;
export const fact=(p:Partial<FactRow>={}):FactRow=>({fact_id:fid(),issuer_id:US,market:'US',filing_id:FIL_US,run_id:'r0000000-0000-4000-8000-000000000000',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M',value:'383285000000',value_text:'383285000000',unit:'USD',consolidation:'consolidated',available_date:'2023-11-03',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h'.repeat(64),created_at:'2023-11-03T00:00:00Z',disclosure_seq:1,is_current:true,is_revision:false,...p});
export const cnFact=(p:Partial<FactRow>={}):FactRow=>fact({issuer_id:CN,market:'CN',filing_id:FIL_CN_PENDING,source_concept:'revenue',concept:'revenue_operating',unit:'CNY',period_start:'2023-01-01',period_end:'2023-12-31',value:'147693604994.14',value_text:'147693604994.14',available_date:'2024-04-03',...p});
export const summary=(p:Partial<FilingSummary>={}):FilingSummary=>({filingId:FIL_US,formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-09-30',availableDate:'2023-11-03',sourceRef:'0000320193-23-000106',source:'edgar',url:'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/',documentUrl:null,citation:'edgar',linkAttempts:0,factCount:1,mappingGen:1,...p});
export const cnSummary=(p:Partial<FilingSummary>={}):FilingSummary=>summary({filingId:FIL_CN_PENDING,formType:'annual',periodEnd:'2023-12-31',availableDate:'2024-04-03',sourceRef:'600519.SH:annual:20231231',source:'tushare',url:null,documentUrl:null,citation:'pending',...p});
export const filingRow=(p:Partial<FilingRow>={}):FilingRow=>({filing_id:FIL_US,issuer_id:US,market:'US',source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-09-30',available_date:'2023-11-03',source_ref:'0000320193-23-000106',url:'https://www.sec.gov/x',document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r0000000-0000-4000-8000-000000000000',created_at:'2023-11-03T00:00:00Z',accepted_at:null,acceptance_source:null,...p});
export const metricRow=(p:Partial<MetricRow>={}):MetricRow=>({issuer_id:US,market:'US',metric:'gross_margin',period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M',value:'0.4413',unit:'pure',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[],based_on_rev:3,based_on_lineage:[{issuer_id:p.issuer_id??US,state_rev:p.based_on_rev??3}],as_of:'2024-06-01',...p});
export const record=(factId:string,p:Partial<EvidenceRecord>={}):EvidenceRecord=>({fact_id:factId,raw_hash:'h'.repeat(64),snapshot_sha256:'s'.repeat(64),snapshot_path:`edgar/${US}/${'s'.repeat(64)}.json`,hash_locator:'us-gaap/Revenues/USD/0',json_pointer:'/facts/us-gaap/Revenues/units/USD/0',field:null,source:'edgar',api:null,url:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',params:null,captured_at:'2026-11-06T00:00:00Z',http_status:200,page:null,index_version:'company-evidence/1',run_id:'r0000000-0000-4000-8000-000000000000',code_version:'abc123',tool_versions:{mapping_gen:'1'},mapping_version:'facts-map/1',...p});
export const HEADLINE_FACT='b0000000-0000-4000-8000-000000000001';
export const eventRow=(p:Partial<EventRow>={}):EventRow=>({event_id:'e'.repeat(64),issuer_id:US,market:'US',kind:'period_first_seen',natural_key:'2023-07-02:2023-09-30:3M',occurred_on:'2023-11-03',period_end:'2023-09-30',concept:null,filing_id:FIL_US,
 payload:{periodStart:'2023-07-02',periodEnd:'2023-09-30',duration:'3M',filingId:FIL_US,conceptCount:12,headline:{revenue:{factId:HEADLINE_FACT,value:'89498000000',unit:'USD'}},ambiguousUnits:[]},
 meta:{headlineAsOf:'2026-11-06'},payload_hash:'p'.repeat(64),based_on_rev:3,first_seen_at:'2026-11-06T01:00:00Z',payload_changed_at:null,retired_at:null,rebuilt_at:'2026-11-06T01:00:00Z',
 rebuild_id:'c0000000-0000-4000-8000-000000000000',rebuild_batch_id:'d0000000-0000-4000-8000-000000000000',...p});
export const emptySnapshot=(p:Partial<ReadSnapshotResult>={}):ReadSnapshotResult=>({stateRev:1,rows:[],truncated:false,filings:[],...p});

/** ReadDeps of vi.fn members. `noEvidence`: fact ids evidenceOf omits. `pdfFor`: fact ids the PDF source locates. */
export function makeDeps(tables:TableClient,opts:{noEvidence?:Set<string>;pdfFor?:Set<string>}={}):ReadDeps&{noEvidence:Set<string>;pdfFor:Set<string>}{
 const noEvidence=opts.noEvidence??new Set<string>(),pdfFor=opts.pdfFor??new Set<string>();
 const company={
  evidenceOf:vi.fn(async(ids:string[])=>new Map(ids.filter(id=>!noEvidence.has(id)).map(id=>[id,record(id)]))),
  eventsOfIssuer:vi.fn(async()=>({rows:[],nextCursor:null})),
  eventsOfIssuers:vi.fn(async()=>({rows:[],nextCursor:null})),
 } as unknown as CompanyDb;
 return {
  noEvidence,pdfFor,tables,
  facts:{lineageOf:vi.fn(async(issuer:string)=>[issuer]),stateRevs:vi.fn(async(issuers:string[])=>issuers.map(issuer_id=>({issuer_id,state_rev:3}))),readFacts:vi.fn(),factsByIds:vi.fn(async()=>[]),filingsOfIssuer:vi.fn(async()=>[]),metricsOfIssuer:vi.fn(async()=>[])},
  stateRev:vi.fn(async()=>1),
  snapshot:vi.fn(async()=>emptySnapshot()),
  company,
  publicCompany:{coverageOf:vi.fn(async()=>[]),listCoverage:vi.fn(async()=>({rows:[],total:0}))} as unknown as CompanyDb,
  pdf:{locate:vi.fn(async(_issuer:string,_market:Market,ids:string[])=>new Map<string,PdfLocator>(ids.filter(id=>pdfFor.has(id)).map(id=>[id,{page:12,table:'合并利润表',row:'营业收入',column:'本期发生额',documentUrl:'https://static.cninfo.com.cn/finalpage/2024-04-03/1219574887.PDF'}])))},
  metricsComputedAt:vi.fn(async()=>new Map()),
  freshnessTables:vi.fn(),
  signSnapshot:vi.fn(async(path:string,seconds:number)=>`https://storage.example/sign/${path}?expires=${seconds}`),
  audit:vi.fn(async()=>{}),
 };
}
const dtoOf=(r:EvidenceRecord,pdf:PdfLocator|null):EvidenceDto=>({factId:r.fact_id,rawHash:r.raw_hash,
 snapshot:{source:r.source,sha256:r.snapshot_sha256,path:r.snapshot_path,api:r.api,url:r.url,params:r.params,capturedAt:r.captured_at,httpStatus:r.http_status,page:r.page,download:r.source==='edgar'?`/api/companies/snapshot?fact=${r.fact_id}`:null},
 locator:{hashLocator:r.hash_locator,jsonPointer:r.json_pointer,field:r.field,pdf},run:{runId:r.run_id,codeVersion:r.code_version,toolVersions:r.tool_versions},
 mappingVersion:r.mapping_version,unitRule:null,sourceDocument:null});
/** Deterministic double of Task 6 applyGate (same GateInput → GateResult). Tests install it with
 * vi.mock('<…>/evidence-gate', async(orig)=>({...await orig(), applyGate: fakeApplyGate})) so every other
 * Task 6 export (gateEventPayload, eventFactIds, …) stays real. */
export function fakeApplyGate(input:GateInput):GateResult{
 const evidence:Record<string,EvidenceDto>={};const eligibility=new Map<string,Eligibility>();const withheld={evidenceIncomplete:0,citationPending:0};
 const no=(id:string,reason:WithheldReason)=>{eligibility.set(id,{ok:false,reason});if(reason==='evidence_incomplete')withheld.evidenceIncomplete++;else withheld.citationPending++;};
 for(const id of [...new Set(input.factIds)].sort()){
  const f=input.facts.get(id);const rec=input.records.get(id);
  if(!f||!rec||!rec.code_version){no(id,'evidence_incomplete');continue;}
  if(input.market==='US'&&!input.filings.has(f.filing_id)){no(id,'evidence_incomplete');continue;}
  if(input.market==='CN'&&!input.admin){
   const fl=input.filings.get(f.filing_id);
   if(!fl||fl.citation!=='linked'||!fl.documentUrl||!input.pdf.has(id)){no(id,'citation_pending');continue;}
  }
  eligibility.set(id,{ok:true});evidence[id]=dtoOf(rec,input.pdf.get(id)??null);
 }
 return {evidence,eligibility,withheld};
}

export type KitDeps=ReturnType<typeof makeDeps>;

// ---- fixtures for tests that run the REAL applyGate (no fakeApplyGate): the fact's raw_hash is the replay hash of
// (snapshot sha, locator) and the evidence record carries exactly that, so a US fact with a record is eligible
// and a fact whose id is missing from the evidence map (or listed in deps.noEvidence) is withheld by the real rules.
export const REAL_SHA='a'.repeat(64);
export const realLocator=(factId:string)=>`real/${factId}`;
export const realFact=(p:Partial<FactRow>={}):FactRow=>{const f=fact(p);return {...f,raw_hash:rawHashOf(REAL_SHA,realLocator(f.fact_id))};};
export const realRecord=(f:FactRow):EvidenceRecord=>record(f.fact_id,{raw_hash:f.raw_hash,snapshot_sha256:REAL_SHA,hash_locator:realLocator(f.fact_id),
 ...(f.market==='CN'?{source:'tushare' as const,api:'income',url:null,params:{ts_code:'600519.SH'},snapshot_path:`tushare/${f.issuer_id}/${REAL_SHA}.json`}:{})});
/** evidenceOf answers with a consistent record for each of `facts` except those in deps.noEvidence. */
export function realEvidence(deps:KitDeps,facts:FactRow[]):void{
 const by=new Map(facts.map(f=>[f.fact_id,f]));
 (deps.company.evidenceOf as unknown as ReturnType<typeof vi.fn>).mockImplementation(async(ids:string[])=>new Map(ids.filter(id=>by.has(id)&&!deps.noEvidence.has(id)).map(id=>[id,realRecord(by.get(id)!)])));
}
