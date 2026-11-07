// src/lib/company/inbox.ts
// Tracking inbox helpers (spec §6.2, §7.3, §4.3, §0 #64; plan Task 16). Pure: callers inject the two reads —
// eventsOfIssuers on the SERVICE-ROLE CompanyDb (issuer_events is service_role only, restricted by the caller
// to the user's watched issuer ids) and readEventIds on the SESSION CompanyDb (RLS) — so keyset paging, the
// receipt join and unread counting are unit-testable. Nothing here writes receipts. Browser-safe (no Buffer):
// the fold/section/batch helpers are also used by the tracking UI.
import type {EventKind,EventRow,WatchRow} from './types';
import {EVENT_KINDS} from './types';

// MAX_COMPANY_WATCHES (decision F) is defined once in db.ts (Task 3, server-only); this browser-safe module does not re-export it.
export const INBOX_DEFAULT_LIMIT=50;
export const INBOX_MAX_LIMIT=200;
/** POST /api/tracking/watches/[issuerId]/read accepts at most this many ids. */
export const READ_BATCH_MAX=500;
/** Unread counting stops at this many per issuer; shown as 99+. */
export const UNREAD_CAP=100;
const ID_CHUNK=100;
const MAX_CURSOR_LEN=1024;

export interface InboxSources{
 eventsOfIssuers(issuers:string[],opts:{kinds?:EventKind[];cursor?:string|null;limit:number}):Promise<{rows:EventRow[];nextCursor:string|null}>;
 readEventIds(eventIds:string[]):Promise<Set<string>>;
}
/** Receipt lookup in chunks of 100 ids (keeps PostgREST `in` filters short). */
export async function readSet(src:Pick<InboxSources,'readEventIds'>,ids:string[]):Promise<Set<string>>{
 const out=new Set<string>();
 for(let i=0;i<ids.length;i+=ID_CHUNK)for(const id of await src.readEventIds(ids.slice(i,i+ID_CHUNK)))out.add(id);
 return out;
}

export interface InboxQuery{issuerIds:string[];kinds?:EventKind[];unreadOnly:boolean;limit:number;cursor:string|null;maxScans?:number}
export interface InboxPage{rows:(EventRow&{read:boolean})[];nextCursor:string|null}
/**
 * One inbox page, keyset (first_seen_at desc, event_id desc). Each source call asks for exactly the rows still
 * missing, so every fetched row is either returned or (unreadOnly) skipped as read; the source's nextCursor is
 * then exactly "after the last consumed row": nothing is skipped or repeated across pages, ties included.
 * maxScans bounds an unreadOnly page over many read rows: it may come back short with a non-null cursor.
 */
export async function assembleInbox(src:InboxSources,q:InboxQuery):Promise<InboxPage>{
 const rows:InboxPage['rows']=[];
 if(q.issuerIds.length===0)return {rows,nextCursor:null};
 const maxScans=q.maxScans??10;
 let cursor=q.cursor,scans=0;
 while(rows.length<q.limit&&scans<maxScans){
  const need=q.limit-rows.length;
  const page=await src.eventsOfIssuers(q.issuerIds,{kinds:q.kinds,cursor,limit:need});
  scans++;
  if(page.rows.length>need)throw new Error('inbox_source_overflow');
  if(page.rows.length===0){cursor=null;break;}
  const read=await readSet(src,page.rows.map(r=>r.event_id));
  for(const r of page.rows){const isRead=read.has(r.event_id);if(q.unreadOnly&&isRead)continue;rows.push({...r,read:isRead});}
  cursor=page.nextCursor;
  if(cursor===null)break;
 }
 return {rows,nextCursor:cursor};
}

export interface UnreadCounts{counts:Map<string,number>;complete:boolean}
/**
 * Unread (no receipt, retired_at is null) per issuer, scanning in inbox order. An issuer stops counting at
 * UNREAD_CAP. complete=false: the scan budget ran out first, so unsaturated counts are lower bounds.
 */
export async function unreadCounts(src:InboxSources,issuerIds:string[],opts:{pageSize?:number;maxScans?:number}={}):Promise<UnreadCounts>{
 const counts=new Map<string,number>(issuerIds.map(id=>[id,0]));
 if(issuerIds.length===0)return {counts,complete:true};
 const pageSize=opts.pageSize??200,maxScans=opts.maxScans??25;
 let cursor:string|null=null;
 for(let scan=0;scan<maxScans;scan++){
  const page=await src.eventsOfIssuers(issuerIds,{cursor,limit:pageSize});
  const open=page.rows.filter(r=>(counts.get(r.issuer_id)??UNREAD_CAP)<UNREAD_CAP);
  const read=await readSet(src,open.map(r=>r.event_id));
  for(const r of open)if(!read.has(r.event_id))counts.set(r.issuer_id,Math.min(UNREAD_CAP,(counts.get(r.issuer_id)??0)+1));
  cursor=page.nextCursor;
  if(cursor===null||page.rows.length===0||[...counts.values()].every(n=>n>=UNREAD_CAP))return {counts,complete:true};
 }
 return {counts,complete:false};
}
export function formatUnread(n:number|null,complete:boolean):string|null{
 if(n===null)return null;
 if(n>=UNREAD_CAP)return '99+';
 return complete?String(n):`${n}+`;
}

/** Issuers whose events the inbox reads: non-muted watches; an explicit watched issuer even when muted; not watched → null. */
export function inboxIssuerIds(watches:Pick<WatchRow,'issuer_id'|'muted'>[],issuerId:string|null):string[]|null{
 if(issuerId!==null)return watches.some(w=>w.issuer_id===issuerId)?[issuerId]:null;
 return watches.filter(w=>!w.muted).map(w=>w.issuer_id);
}

export function inboxFingerprint(q:{kinds?:EventKind[];unreadOnly:boolean;issuerId:string|null}):string{
 return `${[...(q.kinds??EVENT_KINDS)].sort().join(',')}|${q.unreadOnly?1:0}|${q.issuerId??''}`;
}
const b64u=(s:string)=>{let bin='';for(const b of new TextEncoder().encode(s))bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64u=(s:string)=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));
/** Public cursor = the CompanyDb cursor bound to the filter it was issued for. */
export function encodeInboxCursor(dbCursor:string,fingerprint:string):string{return b64u(JSON.stringify({v:1,f:fingerprint,c:dbCursor}));}
/** Throws Error('invalid_cursor') for anything not issued by encodeInboxCursor under the same fingerprint. */
export function decodeInboxCursor(raw:string,fingerprint:string):string{
 if(raw.length===0||raw.length>MAX_CURSOR_LEN||!/^[A-Za-z0-9_-]+$/.test(raw))throw new Error('invalid_cursor');
 let o:unknown;
 try{o=JSON.parse(unb64u(raw));}catch{throw new Error('invalid_cursor');}
 const c=o as {v?:unknown;f?:unknown;c?:unknown}|null;
 if(!c||c.v!==1||c.f!==fingerprint||typeof c.c!=='string'||c.c==='')throw new Error('invalid_cursor');
 return c.c;
}

export interface FoldableEvent{eventId:string;issuerId:string;occurredOn:string;firstSeenAt:string|null}
export interface FoldGroup<T extends FoldableEvent>{key:string;head:T;rest:T[]}
/** §7.3 same issuer, same day: groups rows with equal (issuer, occurred_on, first-seen UTC day); group sits at its first row. */
export function foldSameIssuerDay<T extends FoldableEvent>(rows:T[]):FoldGroup<T>[]{
 const groups:FoldGroup<T>[]=[];const byKey=new Map<string,FoldGroup<T>>();
 for(const r of rows){
  const key=`${r.issuerId}|${r.occurredOn}|${r.firstSeenAt?new Date(r.firstSeenAt).toISOString().slice(0,10):''}`;
  const g=byKey.get(key);
  if(g)g.rest.push(r);else{const n={key,head:r,rest:[]};byKey.set(key,n);groups.push(n);}
 }
 return groups;
}
export function firstSeenSection(firstSeenAt:string|null,today:string):'today'|'earlier'{
 return firstSeenAt!==null&&new Date(firstSeenAt).toISOString().slice(0,10)===today?'today':'earlier';
}
/** "Mark this page read": the UNREAD ids the client actually shows, per issuer, ≤ READ_BATCH_MAX per request. */
export function readBatches(rows:{eventId:string;issuerId:string;read:boolean}[]):{issuerId:string;eventIds:string[]}[]{
 const per=new Map<string,string[]>();
 for(const r of rows){if(r.read)continue;const l=per.get(r.issuerId);if(l)l.push(r.eventId);else per.set(r.issuerId,[r.eventId]);}
 const out:{issuerId:string;eventIds:string[]}[]=[];
 for(const [issuerId,ids] of per)for(let i=0;i<ids.length;i+=READ_BATCH_MAX)out.push({issuerId,eventIds:ids.slice(i,i+READ_BATCH_MAX)});
 return out;
}
/** "已更新" badge: payload changed strictly after first sight (§7.2: no re-count as unread). */
export function isUpdated(e:{firstSeenAt:string|null;payloadChangedAt:string|null}):boolean{
 if(e.firstSeenAt===null||e.payloadChangedAt===null)return false;
 return Date.parse(e.payloadChangedAt)>Date.parse(e.firstSeenAt);
}
