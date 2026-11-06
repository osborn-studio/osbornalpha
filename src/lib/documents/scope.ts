// src/lib/documents/scope.ts
// Document sync scope (spec §6.4). reconcileDocumentScope(source) is idempotent: it computes the
// desired rows of one source, retires rows that left the sources (reasons [], priority 0, fetch_key
// kept; never deleted) and hands everything to DocumentsDb.reconcileScope (SQL
// reconcile_document_sync_scope), which only writes reasons/priority/fetch_key.
//  edgar:    the facts US scope source (active tickers of US_UNIVERSES → current owner → active issuer
//            with a CIK); fetch_key = 10-digit CIK; reasons universe:<u>.
//  cninfo:   research_entity_keys.in_scope with issuer_id → the issuer's current A-share by the facts
//            rule (chooseCnTicker); only .SH/.SZ (.BJ is not on cninfo's sse/szse columns: skipped
//            bj_excluded); fetch_key '<code>,<cninfo_org_id>' ('<code>,' when the org id is unknown).
//  hkexnews: research_entity_keys.in_scope with issuer_id whose issuers.hkex_stock_code_primary is
//            set; fetch_key = that 5-digit code.
// Merged issuers never enter. Shared helpers come from src/lib/facts/scope.ts by import (that file is
// not edited); its keysetAll is not exported, so the same keyset reader is repeated here.
// documentScopeRowFor builds ONE issuer's row the same way for explicit runs (reasons ['explicit']).
import {MAX_PAGE,selectAll} from '../db/table-client';
import type {RangeOptions,Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {US_UNIVERSES,chooseCnTicker,currentSecurities,fetchKey} from '../facts/scope';
import type {DocScopeInput,DocumentsDb,ListedSource} from './types';

export const DOC_SCOPE_PRIORITY=10;
export interface DocScopeDeps{tables:TableClient;db:Pick<DocumentsDb,'reconcileScope'|'scopeRows'|'scopeAll'>}
/**
 * Safety margin subtracted from the client clock for the default snapshotAt (same reasoning as
 * facts/scope.ts::SNAPSHOT_SKEW_MARGIN_MS): skew can only delay a retirement, never retire a newer activation.
 */
export const SNAPSHOT_SKEW_MARGIN_MS=5*60_000;
export interface DocScopeOpts{today?:string;snapshotAt?:string;now?:()=>number}
export interface DocScopeResult{desired:number;retired:number;skipped:Record<string,number>}

const str=(v:unknown)=>typeof v==='string'&&v.trim().length>0?v.trim():null;
const normTicker=(t:string)=>t.trim().toUpperCase().replace(/\//g,'.');
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
const isoToday=()=>new Date().toISOString().slice(0,10);

/** 5-digit HKEX stock code of an issuer row (issuers.hkex_stock_code_primary). */
export function hkFetchKey(issuer:{hkex_stock_code_primary?:unknown}):string{
 const code=str(issuer.hkex_stock_code_primary);
 if(!code||!/^\d{5}$/.test(code))throw new Error('missing_hkex_code');
 return code;
}
/** '<6-digit code>,<orgId>'; orgId null/empty → '<code>,' (the adapter resolves it through topSearch). */
export function cninfoFetchKey(code:string,orgId:string|null):string{
 if(!/^\d{6}$/.test(code))throw new Error('not_cn_code');
 const org=orgId?.trim()??'';
 if(org.includes(','))throw new Error('invalid_org_id');
 return `${code},${org}`;
}

/**
 * Keyset paging on a non-unique column (same algorithm as facts/scope.ts::keysetAll, which is not exported).
 * A page shorter than requested is NOT the end: a server row cap (PostgREST max_rows) below MAX_PAGE returns
 * short pages. The read ends when a page adds no new row; a full-size page of only seen rows is a tie group
 * larger than a page and fails loudly instead of truncating.
 */
async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:string[]):Promise<Row[]>{
 const seen=new Set<string>(),out:Row[]=[];
 let cursor:string|null=null;
 for(;;){
  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
  let fresh=0;
  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);fresh++;}}
  if(fresh===0){
   if(page.length>=MAX_PAGE)throw new Error('scope_tie_group_overflow');
   return out;
  }
  cursor=String(page[page.length-1][orderBy]);
 }
}
const SEC_KEY=['issuer_id','ticker','valid_from'];

async function issuerMap(tables:TableClient):Promise<Map<string,Row>>{
 return new Map((await selectAll(tables,'issuers',{},'issuer_id')).map(i=>[String(i.issuer_id),i]));
}
async function inScopeIssuers(tables:TableClient,skipped:Record<string,number>):Promise<string[]>{
 const keys=await keysetAll(tables,'research_entity_keys',{in_scope:true},{},'entity_id',['user_id','entity_id']);
 const ids=new Set<string>();
 for(const k of keys){const id=str(k.issuer_id);if(id)ids.add(id);else bump(skipped,'no_issuer');}
 return [...ids].sort();
}
/** Issuer usable for documents: exists and is not merged (merged issuers' filings belong to the survivor). */
function usable(issuers:Map<string,Row>,id:string,skipped:Record<string,number>):Row|null{
 const i=issuers.get(id);
 if(!i){bump(skipped,'unknown_issuer');return null;}
 if(i.status==='merged'){bump(skipped,'issuer_merged');return null;}
 return i;
}

async function desiredEdgar(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DocScopeInput[]>{
 const reasonsByTicker=new Map<string,Set<string>>();
 for(const u of US_UNIVERSES){
  for(const m of await selectAll(tables,'security_universe_memberships',{universe:u,is_active:true},'ticker')){
   const t=normTicker(String(m.ticker));
   (reasonsByTicker.get(t)??reasonsByTicker.set(t,new Set()).get(t)!).add(`universe:${u}`);
  }
 }
 const ownerByTicker=new Map<string,string>();
 for(const s of await currentSecurities(tables,today)){const id=str(s.issuer_id);if(id)ownerByTicker.set(normTicker(String(s.ticker)),id);}
 const issuers=await issuerMap(tables);
 const out=new Map<string,DocScopeInput>();
 for(const [ticker,reasons] of reasonsByTicker){
  const id=ownerByTicker.get(ticker);
  if(!id){bump(skipped,'unknown_ticker');continue;}
  const issuer=usable(issuers,id,skipped);   // merged issuers never enter, the same rule as cninfo and hkexnews
  if(!issuer)continue;
  let key:string;
  try{key=fetchKey('US',{cik:str(issuer.cik)});}catch{bump(skipped,'no_cik');continue;}
  const row=out.get(id)??out.set(id,{issuer_id:id,reasons:[],priority:DOC_SCOPE_PRIORITY,fetch_key:key}).get(id)!;
  row.reasons=[...new Set([...row.reasons,...reasons])].sort();
 }
 return [...out.values()];
}

/** cninfo row of one issuer from its current securities, or the skip reason. */
function cninfoRow(issuer:Row,secs:Row[],reasons:string[]):DocScopeInput|{reason:string}{
 const c=chooseCnTicker(secs);
 if('reason' in c)return {reason:c.reason};
 const m=/^(\d{6})\.(SH|SZ|BJ)$/.exec(c.ticker);
 if(!m)return {reason:'no_cn_ticker'};
 if(m[2]==='BJ')return {reason:'bj_excluded'};
 try{return {issuer_id:String(issuer.issuer_id),reasons,priority:DOC_SCOPE_PRIORITY,fetch_key:cninfoFetchKey(m[1],str(issuer.cninfo_org_id))};}
 catch{return {reason:'invalid_org_id'};}
}

async function desiredCninfo(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DocScopeInput[]>{
 const ids=await inScopeIssuers(tables,skipped);
 const issuers=await issuerMap(tables);
 const byIssuer=new Map<string,Row[]>();
 for(const s of await currentSecurities(tables,today)){const id=str(s.issuer_id);if(id)(byIssuer.get(id)??byIssuer.set(id,[]).get(id)!).push(s);}
 const out:DocScopeInput[]=[];
 for(const id of ids){
  const issuer=usable(issuers,id,skipped);if(!issuer)continue;
  const r=cninfoRow(issuer,byIssuer.get(id)??[],['cohort']);
  if('reason' in r){bump(skipped,r.reason);continue;}
  out.push(r);
 }
 return out;
}

async function desiredHk(tables:TableClient,skipped:Record<string,number>):Promise<DocScopeInput[]>{
 const ids=await inScopeIssuers(tables,skipped);
 const issuers=await issuerMap(tables);
 const out:DocScopeInput[]=[];
 for(const id of ids){
  const issuer=usable(issuers,id,skipped);if(!issuer)continue;
  let key:string;
  try{key=hkFetchKey(issuer);}catch{bump(skipped,'no_hkex_code');continue;}
  out.push({issuer_id:id,reasons:['cohort'],priority:DOC_SCOPE_PRIORITY,fetch_key:key});
 }
 return out;
}

export async function reconcileDocumentScope(deps:DocScopeDeps,source:ListedSource,opts:DocScopeOpts={}):Promise<DocScopeResult>{
 const snapshotAt=opts.snapshotAt??new Date((opts.now??Date.now)()-SNAPSHOT_SKEW_MARGIN_MS).toISOString();   // taken BEFORE any source is read
 const today=opts.today??isoToday();
 const skipped:Record<string,number>={};
 const desired=source==='edgar'?await desiredEdgar(deps.tables,today,skipped):source==='cninfo'?await desiredCninfo(deps.tables,today,skipped):await desiredHk(deps.tables,skipped);
 const wanted=new Set(desired.map(d=>d.issuer_id));
 const retired:DocScopeInput[]=(await deps.db.scopeAll(source))
  .filter(r=>r.priority>0&&!wanted.has(r.issuer_id))
  .map(r=>({issuer_id:r.issuer_id,reasons:[],priority:0,fetch_key:r.fetch_key}));
 const rows=[...desired,...retired].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
 if(rows.length>0)await deps.db.reconcileScope(source,rows,snapshotAt);
 // a retirement the database refused as stale (a newer reconcile activated or confirmed the row) leaves it active
 let applied=retired.length;
 if(retired.length>0){
  const still=(await deps.db.scopeRows(source,retired.map(r=>r.issuer_id))).filter(r=>r.priority>0).length;
  if(still>0){skipped.stale_retirement=still;applied-=still;}
 }
 return {desired:desired.length,retired:applied,skipped};
}

/**
 * One issuer's scope input for explicit runs (scripts --issuer, replay tests), reasons ['explicit'].
 * Null when the issuer is unknown or merged or has no fetch key for this source; the sync core then
 * reports scope_unresolved. Database errors propagate.
 */
export async function documentScopeRowFor(tables:TableClient,source:ListedSource,issuerId:string,opts:{today?:string}={}):Promise<DocScopeInput|null>{
 const today=opts.today??isoToday();
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 if(!issuer||issuer.status==='merged')return null;
 const reasons=['explicit'];
 if(source==='edgar'){
  try{return {issuer_id:issuerId,reasons,priority:DOC_SCOPE_PRIORITY,fetch_key:fetchKey('US',{cik:str(issuer.cik)})};}catch{return null;}
 }
 if(source==='hkexnews'){
  try{return {issuer_id:issuerId,reasons,priority:DOC_SCOPE_PRIORITY,fetch_key:hkFetchKey(issuer)};}catch{return null;}
 }
 const secs=(await keysetAll(tables,'issuer_securities',{issuer_id:issuerId},{},'ticker',SEC_KEY)).filter(r=>isCurrentSecurity(r,today));
 const r=cninfoRow(issuer,secs,reasons);
 return 'reason' in r?null:r;
}
