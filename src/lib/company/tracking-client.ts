// src/lib/company/tracking-client.ts
// Browser helpers for the tracking API (spec §6.2). Mutations send Content-Type application/json (the routes'
// CSRF guard); every call is cache: 'no-store'; a non-2xx answer throws TrackingApiError(code, status).
import {readBatches} from './inbox';
import type {EventKind,EvidenceDto,WithheldCounts} from './types';
import type {PublicEvent} from './event-dto';
import type {WatchCard} from './tracking-issuers';
import type {ImportResult} from './tracking-import';
export type {WatchCard,ImportResult};

export interface InboxRowDto extends PublicEvent{read:boolean}
export interface InboxResponse{rows:InboxRowDto[];nextCursor:string|null;evidence:Record<string,EvidenceDto>}
export interface WatchesResponse{count:number;limit:number;unreadComplete:boolean;watches:WatchCard[]}
export interface WatchDto{issuerId:string;note:string|null;muted:boolean;createdAt:string;updatedAt:string}
/** Task 10 EventsDto (handlers/events.ts), the fields this client reads; replay truncation is a 400 replay_truncated, not a flag. */
export interface EventsResponse{rows:PublicEvent[];nextCursor:string|null;evidence:Record<string,EvidenceDto>;computed:'materialized'|'live';withheld:WithheldCounts}

export class TrackingApiError extends Error{
 constructor(public readonly code:string,public readonly status:number){super(code);this.name='TrackingApiError';}
}
async function call<T>(url:string,init?:RequestInit):Promise<T>{
 const res=await fetch(url,{...init,cache:'no-store'});
 const body=await res.json().catch(()=>null) as {error?:{code?:string}}|null;
 if(!res.ok)throw new TrackingApiError(body?.error?.code??'internal',res.status);
 return body as T;
}
const send=<T>(method:'POST'|'PATCH'|'DELETE',url:string,body:unknown)=>call<T>(url,{method,body:JSON.stringify(body??{}),headers:{'content-type':'application/json'}});

export const fetchWatches=()=>call<WatchesResponse>('/api/tracking/watches');
export function fetchInbox(q:{cursor?:string|null;limit?:number;kinds?:EventKind[];unreadOnly?:boolean;issuerId?:string|null}):Promise<InboxResponse>{
 const p=new URLSearchParams();
 if(q.limit!==undefined)p.set('limit',String(q.limit));
 if(q.kinds&&q.kinds.length)p.set('kinds',q.kinds.join(','));
 if(q.unreadOnly)p.set('unreadOnly','1');
 if(q.issuerId)p.set('issuerId',q.issuerId);
 if(q.cursor)p.set('cursor',q.cursor);
 const qs=p.toString();
 return call<InboxResponse>(`/api/tracking/inbox${qs?`?${qs}`:''}`);
}
export function fetchCompanyEvents(ticker:string,q:{asOf?:string|null;cursor?:string|null;limit?:number}):Promise<EventsResponse>{
 const p=new URLSearchParams();
 p.set('limit',String(q.limit??50));
 if(q.asOf)p.set('asOf',q.asOf);
 if(q.cursor)p.set('cursor',q.cursor);
 return call<EventsResponse>(`/api/companies/${encodeURIComponent(ticker)}/events?${p.toString()}`);
}
export const addWatch=(target:{issuerId:string}|{ticker:string})=>send<{watch:WatchDto&{created:boolean}}>('POST','/api/tracking/watches',target);
export const patchWatch=(issuerId:string,patch:{note?:string|null;muted?:boolean})=>send<{watch:WatchDto}>('PATCH',`/api/tracking/watches/${issuerId}`,patch);
export const removeWatch=(issuerId:string)=>send<{deleted:true}>('DELETE',`/api/tracking/watches/${issuerId}`,{});
export const markRead=(issuerId:string,eventIds:string[])=>send<{inserted:number}>('POST',`/api/tracking/watches/${issuerId}/read`,{eventIds});
export const importFromWatchlist=()=>send<ImportResult>('POST','/api/tracking/watches/import-watchlist',{});
/** "Mark this page read": the unread ids shown, per issuer, ≤ 500 per request; returns receipts inserted. */
export async function markRowsRead(rows:{eventId:string;issuerId:string;read:boolean}[]):Promise<number>{
 let inserted=0;
 for(const b of readBatches(rows))inserted+=(await markRead(b.issuerId,b.eventIds)).inserted;
 return inserted;
}
/** true / false from the inbox's 200 / 404 watch_not_found for one issuer (cheap: limit=1). Other errors throw. */
export async function isWatching(issuerId:string):Promise<boolean>{
 try{await fetchInbox({issuerId,limit:1});return true;}
 catch(e){if(e instanceof TrackingApiError&&e.code==='watch_not_found')return false;throw e;}
}
