// src/app/(app)/admin/broker-research/_shared/admin-fetch.ts
// Browser helper for the C admin routes (spec §8.2): JSON body on every write (the routes answer 415
// otherwise; the browser adds Origin), no-store, error body {error:{code,...}} → code.
export const ADMIN_API='/api/admin/broker-research';
export type ApiResult<T>={ok:true;status:number;data:T}|{ok:false;status:number;code:string;body:unknown};
export function errorCode(body:unknown,status:number):string{
 const c=(body as {error?:{code?:unknown}}|null)?.error?.code;return typeof c==='string'&&c.length>0?c:`http_${status}`;
}
export const baseCode=(code:string)=>code.split(':')[0];
/** Reads a value the route may put on error or on error.detail (e.g. the existing document id of a duplicate). */
export function errorField(body:unknown,camel:string,snake:string):unknown{
 const e=(body as {error?:Record<string,unknown>}|null)?.error;if(!e)return undefined;
 const d=e.detail as Record<string,unknown>|undefined;
 return e[camel]??e[snake]??d?.[camel]??d?.[snake];
}
export async function adminJson<T=unknown>(method:'GET'|'POST'|'PATCH',path:string,body?:unknown):Promise<ApiResult<T>>{
 const write=method!=='GET';
 let res:Response;
 try{res=await fetch(`${ADMIN_API}${path}`,{method,cache:'no-store',...(write?{headers:{'content-type':'application/json'},body:JSON.stringify(body??{})}:{})});}
 catch{return {ok:false,status:0,code:'network_error',body:null};}
 const json=await res.json().catch(()=>null);
 return res.ok?{ok:true,status:res.status,data:json as T}:{ok:false,status:res.status,code:errorCode(json,res.status),body:json};
}

// Serializable, client-safe admin page contracts. No server loader imports.
import type {AccessLogInput,LicenceRow,ReportRow,SettingsRow} from '@/lib/broker-research/types';
type Row=Record<string,unknown>;
export interface GoldReceiptView{receiptId:string;ranAt:string|null;passed:boolean;nDocs:number;corpusMatches:boolean;codeVersion:string|null;
 tuple:{extractorVersion:string|null;modelId:string|null;registryHash:string|null;promptVersion:string|null;schemaVersion:string|null};
 precisionMin:number|null;recallMin:number|null;worst:{field:string;metric:'precision'|'recall';value:number}|null}

export interface OverviewData{
 settings:SettingsRow;
 counts:{toParse:number;toExtract:number;toReview:number;toPublish:number;published:number;withdrawn:number};
 gates:{d1:{ok:boolean;confirmed:number;total:number};gold:{ok:boolean}};
 gold:GoldReceiptView|null;batches:Row[];quarantine:{total:number;rows:Row[]};
 attention:{mappingUpdates:number;outboxFailed:number;licencesPending:number};
 reviewQueue:ReportRow[];recentDocuments:Row[];
}

export interface LicenceView{licence:LicenceRow;confirmed:boolean;pending:boolean;documents:number;publishedReports:number;hiddenReports:number;approvedSnippets:number;approvedSummaries:number;revertedTexts:number}

export type AccessLogView=AccessLogInput&{id:string;created_at:string};

export const CHIP_ACCENT='inline-flex items-center rounded border border-[var(--border-active)] px-1.5 py-0.5 text-[11px] text-accent';
export const CHIP_WARN='inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[11px] text-text-dim';
export const BTN_PRIMARY='inline-flex min-h-9 items-center justify-center rounded-md border border-accent bg-[var(--accent-wash)] px-3 text-xs text-accent disabled:opacity-50';
export const BTN_GHOST='inline-flex min-h-9 items-center justify-center rounded-md px-3 text-xs text-text-dim';
export const ERROR_BAR='flex items-center gap-2 rounded border border-danger p-3 text-sm text-danger';
export const FIELD_LABEL='mb-1 block text-xs text-text-dim';
export const H3='text-sm font-semibold';
