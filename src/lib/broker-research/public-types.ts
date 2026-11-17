// Client-safe public read contracts and pure helpers. Keep server loaders in public-read.ts.
import type {NormalizedRating,ReportScope} from './types';
import type {PublicHistoryRowDto,PublicInstitutionAnalystDto,PublicInstitutionDto,PublicInstitutionRef,PublicReportDetailDto,PublicReportDto,PublicTargetDto} from './public-dto';

export const LIST_DEFAULT_LIMIT=50,LIST_MAX_LIMIT=200,BY_TICKER_DEFAULT_LIMIT=5,BY_TICKER_MAX_LIMIT=20;
export const HISTORY_DEFAULT_LIMIT=50,HISTORY_MAX_LIMIT=200,SPREAD_WINDOW_MONTHS=12,INSTITUTION_ANALYSTS_LIMIT=50;
export interface ReportCursor{publishedDate:string;reportId:string}
export interface ListQuery{institutionId?:string;issuerId?:string;rating?:NormalizedRating;securityTicker?:string;currency?:string|null;scope?:ReportScope;from?:string;to?:string;limit:number;cursor?:ReportCursor;summaryOnly?:boolean}
export interface ReportPage{reports:PublicReportDto[];nextCursor:string|null;count:number}
export interface LibraryTotals{reports:number;institutions:number;lastAvailableAt:string|null}
export function monthsBefore(today:string,months:number):string{
 const d=new Date(`${today}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()-months);return d.toISOString().slice(0,10);
}
export const currencyOf=(t:PublicTargetDto):string|null=>t.currency;
export const focusTarget=(r:PublicReportDto):PublicTargetDto|null=>r.targets.find(t=>t.targetKey===r.primaryTargetKey)??r.targets[0]??null;
export interface PublicSpreadRowDto{currency:string|null;reportId:string;institution:PublicInstitutionRef;publishedDate:string|null;rating:{raw:string|null;normalized:NormalizedRating|null};targetPricePublic:boolean;target:{price:string;currency:string|null}|null;priceAtReport:{value:string;currency:string|null}|null;upsidePct:string|null}
export interface ReportPageData{report:PublicReportDetailDto;history:PublicHistoryRowDto[];spread:PublicSpreadRowDto[];focusTargetKey:string|null}
export interface InstitutionPageData{institution:PublicInstitutionDto;reports:PublicReportDto[];analysts:PublicInstitutionAnalystDto[];securities:number;lastPublishedDate:string|null;moreReports:boolean}
