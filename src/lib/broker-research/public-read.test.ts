// src/lib/broker-research/public-read.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({resolveIssuer:vi.fn()}));
vi.mock('@/lib/entities/resolve',async(orig)=>({...await orig<typeof import('@/lib/entities/resolve')>(),resolveIssuer:mocks.resolveIssuer}));
import {memoryTableClient} from '../db/memory-table-client';
import {supabaseBrokerResearchDb} from './db';
import {cappedAnon} from './postgrest-stub';
import {decodeCursor,encodeCursor,institutionPageData,listPublicInstitutions,listPublicReports,monthsBefore,publicSpread,reportPageData,resolveTicker} from './public-read';
import type {PublicReadDeps,ReportCursor} from './public-read';
import type {BrokerResearchDb,PublicReportBundle} from './types';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function b(n:number,o:{inst?:number;date?:string;ticker?:string;currency?:string|null;price?:string|null;summary?:boolean;public?:boolean}={}):PublicReportBundle{
 const inst=uuid(900+(o.inst??1));
 return {report:{report_id:uuid(n),title:`T${n}`,published_date:o.date??'2026-10-01',available_at:`${o.date??'2026-10-01'}T08:00:00+00:00`,primary_target_key:o.ticker??'600000.SH',target_price_public:o.public??true,snippet_max_chars:100,summary_public:true},
  targets:[{target_key:o.ticker??'600000.SH',security_ticker:o.ticker??'600000.SH',issuer_id:'iss-1',target_price:o.price===undefined?'10':o.price,target_currency:o.currency===undefined?'CNY':o.currency,price_at_report:'8',price_currency:'CNY',target_price_public:o.public??true,publication_id:uuid(500+n)}],
  hasSummary:{zh:o.summary??false,en:false},snippetCount:0,institution:{institution_id:inst,name_en:`Inst ${o.inst??1}`}};
}
function deps(db:Partial<BrokerResearchDb>):PublicReadDeps{return {db:db as BrokerResearchDb,tables:{} as PublicReadDeps['tables']};}

beforeEach(()=>vi.clearAllMocks());

describe('cursor',()=>{
 it('round-trips and rejects junk',()=>{
  const c={publishedDate:'2026-10-01',reportId:uuid(1)};
  expect(decodeCursor(encodeCursor(c))).toEqual(c);
  for(const s of ['','!!!',Buffer.from('2026-10-01|nope').toString('base64url'),Buffer.from(`2026-1-01|${uuid(1)}`).toString('base64url')])expect(decodeCursor(s)).toBeNull();
 });
});

describe('listPublicReports',()=>{
 it('passes the filter (summaryOnly → hasSummary in the db layer), emits nextCursor only for a full page',async()=>{
  const publicReports=vi.fn().mockResolvedValue([b(1,{summary:true}),b(2,{date:'2026-09-01',summary:true})]);
  const page=await listPublicReports(deps({publicReports}),{limit:2,rating:'buy',summaryOnly:true});
  expect(publicReports).toHaveBeenCalledWith(expect.objectContaining({limit:2,rating:'buy',hasSummary:true}));
  expect(page.reports.map(r=>r.reportId)).toEqual([uuid(1),uuid(2)]);
  expect(decodeCursor(page.nextCursor!)).toEqual({publishedDate:'2026-09-01',reportId:uuid(2)});
  publicReports.mockResolvedValue([b(3)]);
  expect((await listPublicReports(deps({publicReports}),{limit:2})).nextCursor).toBeNull();
 });
 it('walks nextCursor to the end through the Supabase adapter under a server row cap below the page size (P-R4-03)',async()=>{
  const rows=Array.from({length:7},(_,i)=>b(i+1,{date:`2026-0${9-i}-01`}));
  const anon=cappedAnon({broker_reports_public_v:rows.map(x=>({...x.report,target_facets:[],has_summary:false})),broker_report_targets_public_v:rows.flatMap(x=>x.targets),
   broker_report_summaries_public_v:[],broker_report_snippets_public_v:[],research_institutions_public_v:[]},2);
  const d:PublicReadDeps={db:supabaseBrokerResearchDb({anon}),tables:{} as never};
  const seen:string[]=[];const sizes:number[]=[];let cursor:ReportCursor|undefined;
  for(let g=0;g<10;g++){
   const p=await listPublicReports(d,{limit:3,cursor});seen.push(...p.reports.map(r=>r.reportId));sizes.push(p.reports.length);
   if(!p.nextCursor)break;cursor=decodeCursor(p.nextCursor)!;
  }
  expect(sizes).toEqual([3,3,1]);                                                              // full pages despite the cap of 2 rows per response
  expect(seen).toEqual(rows.map((_,i)=>uuid(i+1)));
 });
});

describe('listPublicInstitutions',()=>{
 it('reads counts from the institutions view and sums the totals',async()=>{
  const publicInstitutions=vi.fn().mockResolvedValue([
   {institution_id:uuid(901),name_en:'Inst 1',report_count:2,last_published_date:'2026-10-01',last_available_at:'2026-10-02T08:00:00+00:00'},
   {institution_id:uuid(902),name_en:'Inst 2',report_count:5,last_published_date:'2026-11-01',last_available_at:'2026-11-01T08:00:00+00:00'}]);
  const r=await listPublicInstitutions(deps({publicInstitutions}));
  expect(r.institutions.map(i=>[i.id,i.reportCount])).toEqual([[uuid(902),5],[uuid(901),2]]);
  expect(r.totals).toEqual({reports:7,institutions:2,lastAvailableAt:'2026-11-01T08:00:00+00:00'});
 });
});

describe('resolveTicker',()=>{
 it('returns null for unknown, prefers the exact then the normalised security',async()=>{
  mocks.resolveIssuer.mockResolvedValueOnce(null);
  expect(await resolveTicker({} as never,'zzzz','2026-11-06')).toBeNull();
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-1',securities:[{ticker:'09988.HK',is_primary:true},{ticker:'BABA',is_primary:false}]});
  expect(await resolveTicker({} as never,'baba','2026-11-06')).toEqual({issuerId:'iss-1',securityTicker:'BABA'});
  expect(await resolveTicker({} as never,'9988','2026-11-06')).toEqual({issuerId:'iss-1',securityTicker:'09988.HK'});
  expect(mocks.resolveIssuer).toHaveBeenLastCalledWith({},{ticker:'9988'},{today:'2026-11-06'});
 });
 it('merged issuer: OLD keeps its own security (read from the source rows), never the destination primary listing (P-R2-05)',async()=>{
  const tables=memoryTableClient({issuer_securities:['ticker','valid_from']});
  await tables.insert('issuer_securities',{issuer_id:'iss-old',ticker:'OLDCO',valid_from:'2000-01-01',valid_to:null});
  await tables.insert('issuer_securities',{issuer_id:'iss-new',ticker:'NEWCO',valid_from:'2000-01-01',valid_to:null});
  mocks.resolveIssuer.mockResolvedValue({issuer_id:'iss-new',redirected_from:'iss-old',securities:[{ticker:'NEWCO',is_primary:true}]});
  expect(await resolveTicker(tables,'oldco','2026-11-06')).toEqual({issuerId:'iss-new',securityTicker:'OLDCO'});
  await tables.update('issuer_securities',{ticker:'OLDCO'},{valid_to:'2026-01-01'});              // the old line is no longer current
  expect(await resolveTicker(tables,'oldco','2026-11-06')).toBeNull();                          // not NEWCO
  expect(await resolveTicker(tables,'ghost','2026-11-06')).toBeNull();
 });
});

describe('spread, report page, institution page',()=>{
 it('monthsBefore is calendar arithmetic in UTC',()=>{expect(monthsBefore('2026-11-06',12)).toBe('2025-11-06');});
 it('keeps the newest report per institution with the same security and currency',async()=>{
  const spreadReports=vi.fn().mockResolvedValue([b(1,{inst:1,date:'2026-09-01'}),b(2,{inst:1,date:'2026-10-01'}),b(3,{inst:2,currency:'USD'}),b(4,{inst:3,public:false,currency:null})]);
  const rows=await publicSpread(deps({spreadReports}),{issuerId:'iss-1',securityTicker:'600000.SH',currency:'CNY',today:'2026-11-06'});
  expect(spreadReports).toHaveBeenCalledWith(expect.objectContaining({issuerId:'iss-1',from:'2025-11-06'}));
  // same date → newest-first by report_id desc; inst 3's target is hidden → its currency comes from price_currency
  expect(rows.map(r=>r.reportId)).toEqual([uuid(4),uuid(2)]);
  expect(rows[0]).toMatchObject({targetPricePublic:false,target:null});
 });
 it('populated currency columns with null prices yield null DTO/spread currency (P-R6-06)',async()=>{
  const bundle=b(1);bundle.targets=bundle.targets.map(t=>({...t,target_price:null,price_at_report:null,target_currency:'USD',price_currency:'USD'}));
  const spreadReports=vi.fn().mockResolvedValue([bundle]);
  const rows=await publicSpread(deps({spreadReports}),{issuerId:'iss-1',securityTicker:'600000.SH',currency:null,today:'2026-11-06'});
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({target:null,priceAtReport:null});
  expect(spreadReports).toHaveBeenCalledWith(expect.objectContaining({currency:null}));
 });
 it('spread uses database winners without a 50-page report traversal (P-R6-05)',async()=>{
  const spreadReports=vi.fn().mockResolvedValue([b(10999,{inst:1}),b(11000,{inst:2})]);
  const rows=await publicSpread(deps({spreadReports}),{issuerId:'iss-1',securityTicker:'600000.SH',currency:'CNY',today:'2026-11-06'});
  expect(rows.map(r=>r.institution.id).sort()).toEqual([uuid(901),uuid(902)]);
  expect(spreadReports).toHaveBeenCalledOnce();
 });
 it('reportPageData returns null when not public and filters history by the target currency',async()=>{
  expect(await reportPageData(deps({publicReport:vi.fn().mockResolvedValue(null)}),uuid(1),'2026-11-06')).toBeNull();
  const detail={...b(1),citations:[],snippets:[],summaries:[],analysts:[]};
  const ratingHistory=vi.fn().mockResolvedValue([{report_id:uuid(1),security_ticker:'600000.SH',target_currency:'CNY'},{report_id:uuid(7),security_ticker:'600000.SH',target_currency:'USD'}]);
  const data=(await reportPageData(deps({publicReport:vi.fn().mockResolvedValue(detail),ratingHistory,spreadReports:vi.fn().mockResolvedValue([b(1)])}),uuid(1),'2026-11-06'))!;
  expect(ratingHistory).toHaveBeenCalledWith({securityTicker:'600000.SH',institutionId:uuid(901),currency:'CNY',limit:200});
  expect(data.history.map(h=>h.reportId)).toEqual([uuid(1)]);
  expect(data.spread).toHaveLength(1);expect(data.focusTargetKey).toBe('600000.SH');
 });
 it('institutionPageData is null for an institution that is not public; analysts via publicAnalysts',async()=>{
  const db={publicInstitutions:vi.fn().mockResolvedValue([{institution_id:uuid(901),name_en:'Inst 1',report_count:2,last_published_date:'2026-10-01'}]),publicReports:vi.fn().mockResolvedValue([b(1),b(2,{ticker:'AAPL'})]),
   publicAnalysts:vi.fn().mockResolvedValue([{analyst_id:'a1',display_name:'Analyst One',institution_id:uuid(901),report_count:2}])};
  expect(await institutionPageData(deps(db),uuid(999))).toBeNull();
  expect(await institutionPageData(deps(db),uuid(901))).toMatchObject({securities:2,lastPublishedDate:'2026-10-01',moreReports:false,analysts:[{analystId:'a1',displayName:'Analyst One',reportCount:2}]});
  expect(db.publicAnalysts).toHaveBeenCalledWith({institutionId:uuid(901),limit:50});
 });
});
