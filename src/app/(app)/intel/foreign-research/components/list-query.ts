// URL filters and four public list response states (spec §9.2).
import type {ReportPage} from '@/lib/broker-research/public-types';
export interface ListFilters{ticker:string;institution:string;rating:string;from:string;to:string;summary:boolean}
export const EMPTY_FILTERS:ListFilters={ticker:'',institution:'',rating:'',from:'',to:'',summary:false};
export function parseListFilters(sp:URLSearchParams):ListFilters{return {ticker:sp.get('ticker')??'',institution:sp.get('institution')??'',rating:sp.get('rating')??'',from:sp.get('from')??'',to:sp.get('to')??'',summary:sp.get('summary')==='1'};}
export function filtersToParams(f:ListFilters):URLSearchParams{const p=new URLSearchParams();if(f.ticker.trim())p.set('ticker',f.ticker.trim());for(const k of ['institution','rating','from','to'] as const)if(f[k])p.set(k,f[k]);if(f.summary)p.set('summary','1');return p;}
export const isFiltered=(f:ListFilters)=>filtersToParams(f).toString()!=='';
export function apiQuery(f:ListFilters,cursor:string|null,limit:number){const p=filtersToParams(f);p.set('limit',String(limit));if(cursor)p.set('cursor',cursor);return p.toString();}
export type ListOutcome={kind:'ok';page:ReportPage}|{kind:'empty'}|{kind:'noResults';unknownTicker:boolean}|{kind:'error'};
export async function classifyListResponse(res:Response,filtered:boolean,paging:boolean):Promise<ListOutcome>{
 if(res.status===404){const body=await res.json().catch(()=>null) as {error?:{code?:string}}|null;return body?.error?.code==='unknown_ticker'?{kind:'noResults',unknownTicker:true}:filtered?{kind:'noResults',unknownTicker:false}:{kind:'empty'};}
 if(!res.ok)return {kind:'error'};const page=await res.json().catch(()=>null) as ReportPage|null;
 if(!page||!Array.isArray(page.reports))return {kind:'error'};
 if(!page.reports.length&&!paging)return filtered?{kind:'noResults',unknownTicker:false}:{kind:'empty'};
 return {kind:'ok',page};
}
