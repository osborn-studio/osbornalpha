// src/lib/broker-research/public-read.ts
// Public read loaders shared by the /api/broker-research/* routes and the /intel/foreign-research
// server pages (spec §8.1, §9.2–9.3). Anon client over the §4.11 views only; whitelist DTOs from
// public-dto.ts; ticker → issuer via resolveIssuer by today's ownership (HK included — unlike the
// facts layer there is no market restriction); opaque base64url cursors; rating history and the
// cross-institution spread (same security + currency, newest report per institution, 12 months).
import {getAnonSupabase} from '../supabase/anon';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {isCurrentSecurity,resolveIssuer} from '../entities/resolve';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {supabaseBrokerResearchDb} from './db';
import type {BrokerResearchDb,PublicReportBundle} from './types';
import {notNull,toPublicHistoryRow,toPublicInstitution,toPublicInstitutionAnalyst,toPublicReport,toPublicReportDetail} from './public-dto';
import type {PublicHistoryRowDto,PublicInstitutionDto,PublicReportDetailDto,PublicReportDto} from './public-dto';

// Spread selection is performed by broker_spread_latest_v, without a report traversal limit.

export {LIST_DEFAULT_LIMIT,LIST_MAX_LIMIT,BY_TICKER_DEFAULT_LIMIT,BY_TICKER_MAX_LIMIT,HISTORY_DEFAULT_LIMIT,HISTORY_MAX_LIMIT,SPREAD_WINDOW_MONTHS,INSTITUTION_ANALYSTS_LIMIT,currencyOf,focusTarget,monthsBefore} from './public-types';
export type {ReportCursor,ListQuery,ReportPage,LibraryTotals,PublicSpreadRowDto,ReportPageData,InstitutionPageData} from './public-types';
import {LIST_MAX_LIMIT,HISTORY_MAX_LIMIT,SPREAD_WINDOW_MONTHS,INSTITUTION_ANALYSTS_LIMIT,currencyOf,focusTarget,monthsBefore} from './public-types';
import type {ReportCursor,ListQuery,ReportPage,LibraryTotals,PublicSpreadRowDto,ReportPageData,InstitutionPageData} from './public-types';

export interface PublicReadDeps{db:BrokerResearchDb;tables:TableClient}
export function anonPublicDeps():PublicReadDeps{const sb=getAnonSupabase();return {db:supabaseBrokerResearchDb({anon:sb}),tables:supabaseTableClient(sb)};}

const CURSOR_RE=/^(\d{4}-\d{2}-\d{2})\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const encodeCursor=(c:ReportCursor)=>Buffer.from(`${c.publishedDate}|${c.reportId}`,'utf8').toString('base64url');
export function decodeCursor(s:string):ReportCursor|null{
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(s))return null;
 const m=CURSOR_RE.exec(Buffer.from(s,'base64url').toString('utf8'));
 return m?{publishedDate:m[1],reportId:m[2].toLowerCase()}:null;
}
const cursorOf=(b:PublicReportBundle):string|null=>{
 const d=b.report.published_date,id=b.report.report_id;
 return typeof d==='string'&&typeof id==='string'?encodeCursor({publishedDate:d.slice(0,10),reportId:id}):null;
};

/** One view page. summaryOnly → PublicReportFilter.hasSummary (filtered in the db layer, so pages stay full); nextCursor follows the last fetched row. */
export async function listPublicReports(deps:PublicReadDeps,q:ListQuery):Promise<ReportPage>{
 const bundles=await deps.db.publicReports({institutionId:q.institutionId,issuerId:q.issuerId,rating:q.rating,scope:q.scope,from:q.from,to:q.to,limit:q.limit,cursor:q.cursor,...(q.summaryOnly?{hasSummary:true}:{}),
  ...(q.securityTicker!==undefined?{securityTicker:q.securityTicker}:{}),...(q.currency!==undefined?{currency:q.currency}:{})});
 const last=bundles.at(-1);
 const reports=bundles.map(x=>toPublicReport(x)).filter(notNull);
 return {reports,nextCursor:bundles.length>=q.limit&&last?cursorOf(last):null,count:reports.length};
}

/** Public institutions with their counts (report_count / last_* come from research_institutions_public_v in one query) and the library totals. */
export async function listPublicInstitutions(deps:PublicReadDeps):Promise<{institutions:PublicInstitutionDto[];totals:LibraryTotals}>{
 const institutions=(await deps.db.publicInstitutions()).map(r=>toPublicInstitution(r)).filter(notNull)
  .sort((a,b)=>b.reportCount-a.reportCount||a.nameEn.localeCompare(b.nameEn));
 const last=institutions.map(i=>i.lastAvailableAt).filter(notNull).sort().at(-1)??null;
 return {institutions,totals:{reports:institutions.reduce((n,i)=>n+i.reportCount,0),institutions:institutions.length,lastAvailableAt:last}};
}

/** Universe ticker → issuer (today's owner) and EXACTLY the security that resolved the request (exact form, then the
 * normalised form). A merged issuer: resolveIssuer returns the destination's securities, so the requested OLD ticker is
 * read from the source issuer_securities rows with the landed current-security predicate (same as facts'
 * resolvePublicIssuer). Never substitutes a primary / first listing: no matching current row → null (P-R2-05). */
export async function resolveTicker(tables:TableClient,raw:string,today:string):Promise<{issuerId:string;securityTicker:string}|null>{
 const given=raw.trim().toUpperCase().replace(/\//g,'.');
 const r=await resolveIssuer(tables,{ticker:given},{today});
 if(!r)return null;
 const core=inferCoreMarket(given),norm=core?normalizeSecurityTicker(given,core):null;
 let ticker=(r.securities.find(s=>s.ticker.toUpperCase()===given)??(norm?r.securities.find(s=>s.ticker.toUpperCase()===norm):undefined))?.ticker;
 if(ticker===undefined){
  for(const t of norm&&norm!==given?[given,norm]:[given]){
   const rows=await tables.select('issuer_securities',{ticker:t});
   if(rows.length===0)continue;
   if(rows.some(x=>isCurrentSecurity(x,today)))ticker=t;
   break;
  }
 }
 return ticker===undefined?null:{issuerId:r.issuer_id,securityTicker:ticker};
}

export async function getPublicReport(deps:PublicReadDeps,reportId:string):Promise<PublicReportDetailDto|null>{
 const d=await deps.db.publicReport(reportId);return d?toPublicReportDetail(d):null;
}
export async function publicHistory(deps:PublicReadDeps,q:{securityTicker:string;institutionId?:string;currency?:string;limit:number}):Promise<PublicHistoryRowDto[]>{
 return (await deps.db.ratingHistory(q)).map(r=>toPublicHistoryRow(r)).filter(notNull);
}

const newestFirst=(a:PublicReportDto,b:PublicReportDto)=>(b.publishedDate??'').localeCompare(a.publishedDate??'')||b.reportId.localeCompare(a.reportId);

export async function publicSpread(deps:PublicReadDeps,q:{issuerId:string;securityTicker:string;currency:string|null;today:string;windowMonths?:number}):Promise<PublicSpreadRowDto[]>{
 const reports=(await deps.db.spreadReports({issuerId:q.issuerId,securityTicker:q.securityTicker,currency:q.currency,from:monthsBefore(q.today,q.windowMonths??SPREAD_WINDOW_MONTHS)})).map(toPublicReport).filter(notNull);
 const latest=new Map<string,PublicSpreadRowDto>();
 for(const r of [...reports].sort(newestFirst)){
  if(!r.institution||latest.has(r.institution.id))continue;
  const t=r.targets.find(x=>x.securityTicker===q.securityTicker&&currencyOf(x)===q.currency);
  if(!t)continue;
  latest.set(r.institution.id,{currency:t.currency,reportId:r.reportId,institution:r.institution,publishedDate:r.publishedDate,rating:{raw:t.rating.raw,normalized:t.rating.normalized},targetPricePublic:r.targetPricePublic,
   target:t.target?{price:t.target.price,currency:t.target.currency}:null,priceAtReport:t.priceAtReport?{value:t.priceAtReport.value,currency:t.priceAtReport.currency}:null,upsidePct:t.upsidePct});
 }
 return [...latest.values()];
}

export async function reportPageData(deps:PublicReadDeps,reportId:string,today:string):Promise<ReportPageData|null>{
 const report=await getPublicReport(deps,reportId);if(!report)return null;
 const t=focusTarget(report);
 if(!t||!t.securityTicker)return {report,history:[],spread:[],focusTargetKey:t?.targetKey??null};
 const sec=t.securityTicker,histCurrency=t.target?.currency??null;
 const [history,spread]=await Promise.all([
  report.institution?publicHistory(deps,{securityTicker:sec,institutionId:report.institution.id,currency:histCurrency??undefined,limit:HISTORY_MAX_LIMIT}):Promise.resolve([] as PublicHistoryRowDto[]),
  t.issuerId?publicSpread(deps,{issuerId:t.issuerId,securityTicker:sec,currency:currencyOf(t),today}):Promise.resolve([] as PublicSpreadRowDto[]),
 ]);
 return {report,history:history.filter(h=>h.targetCurrency===histCurrency),spread,focusTargetKey:t.targetKey};
}

/** Counts come from the institutions view (exact); the report list is the newest LIST_MAX_LIMIT; securities count the listed reports. */
export async function institutionPageData(deps:PublicReadDeps,institutionId:string):Promise<InstitutionPageData|null>{
 const institution=(await deps.db.publicInstitutions()).map(r=>toPublicInstitution(r)).filter(notNull).find(i=>i.id===institutionId);
 if(!institution)return null;
 const [page,analysts]=await Promise.all([listPublicReports(deps,{institutionId,limit:LIST_MAX_LIMIT}),deps.db.publicAnalysts({institutionId,limit:INSTITUTION_ANALYSTS_LIMIT})]);
 const securities=new Set(page.reports.flatMap(r=>r.targets.map(t=>t.securityTicker??t.tickerAsStated)));
 return {institution,reports:page.reports,analysts:analysts.map(toPublicInstitutionAnalyst).filter(notNull),securities:securities.size,lastPublishedDate:institution.lastPublishedDate,moreReports:page.nextCursor!==null};
}
