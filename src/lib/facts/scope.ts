// src/lib/facts/scope.ts
// Sync scope (spec §6.4). reconcileScope is idempotent: it computes the desired set for one market
// from the sources, marks rows that vanished with priority 0, and hands everything to
// FactsDb.reconcileScope (SQL reconcile_fact_sync_scope), which only touches reasons/priority/
// fetch_key and never the scheduling or lease columns.
//  US: active tickers of universes sp500/nasdaq_top500/us_china → the issuer currently owning the
//      ticker (issuer_securities row current at `today` by the landed predicate of
//      entities/resolve.ts — a scheduled future end keeps the owner current, round-1 #22) that has
//      a CIK; fetch_key = 10-digit CIK; priority 10.
//  CN: research_entity_keys.in_scope and issuer_id is not null → the issuer's current primary
//      .SH/.SZ/.BJ ticker; reasons ['cohort']; priority 10 (owner decision A).
//  Watchlists are never a source (owner decision B).
// scopeRowFor derives ONE issuer's row the same way for explicit --issuer / replay runs (round-1
// #13; reasons ['explicit']). Source reads go through TableClient and always page to exhaustion
// (selectAll, fixed order; completeness is never inferred from one page). Rows already in the scope
// table are read through FactsDb.scopeAll (the table client cannot see the memory adapter's rows).
// CN ticker choice: the current primary A-share (.SH/.SZ/.BJ, B shares excluded); no primary → the
// single current A-share; several primaries or several non-primary candidates → ambiguous_cn_ticker.
import {MAX_PAGE,selectAll} from '../db/table-client';
import type {RangeOptions,Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import type {FactsDb,Market} from './types';

export const US_UNIVERSES=['sp500','nasdaq_top500','us_china'] as const;
export const SCOPE_PRIORITY=10;
const CN_TICKER=/\.(SH|SZ|BJ)$/;
// B shares trade under A-share-looking codes but are another class (same pattern as entities/link-research.ts, not exported there).
const B_SHARE=/^(900\d{3}\.SH|200\d{3}\.SZ)$/;

export function fetchKey(market:Market,issuer:{cik?:string|null;ticker?:string|null}):string{
 if(market==='US'){
  const cik=issuer.cik?.trim();
  if(!cik||!/^\d{1,10}$/.test(cik))throw new Error('missing_cik');
  return cik.padStart(10,'0');
 }
 const t=issuer.ticker?.trim().toUpperCase();
 if(!t||!CN_TICKER.test(t))throw new Error('not_cn_ticker');
 return t;
}

export interface ScopeDeps{tables:TableClient;db:Pick<FactsDb,'reconcileScope'|'scopeAll'>}
export interface ScopeReconcileResult{desired:number;retired:number;changed:number;skipped:Record<string,number>}
/** One reconcile_fact_sync_scope input row. */
export type ScopeInputRow={issuer_id:string;reasons:string[];priority:number;fetch_key:string};
type DesiredRow=ScopeInputRow;

const FETCH_KEY_ERRORS=new Set(['missing_cik','not_cn_ticker']);   // the only errors scopeRowFor turns into null
const str=(v:unknown)=>typeof v==='string'?v:null;
const normTicker=(t:string)=>t.trim().toUpperCase().replace(/\//g,'.');
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
const isoToday=()=>new Date().toISOString().slice(0,10);

/**
 * Keyset paging for tables whose key is composite while TableClient orders by ONE column: page on
 * `orderBy` (not unique), and after a full page restart from the last value INCLUSIVE (gte), so every
 * row tied with the boundary value is read again from its first row; `keyCols` de-duplicate. Offset
 * paging would drop or repeat tied rows at a page boundary (a dropped current row retires an issuer).
 * A single tie group of MAX_PAGE rows or more cannot advance and fails loudly.
 */
async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:string[]):Promise<Row[]>{
 const seen=new Set<string>(),out:Row[]=[];
 let cursor:string|null=null;
 for(;;){
  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);}}
  if(page.length<MAX_PAGE)return out;
  const last=String(page[page.length-1][orderBy]);
  if(last===cursor)throw new Error('scope_tie_group_overflow');
  cursor=last;
 }
}
const SEC_KEY=['issuer_id','ticker','valid_from'];

/**
 * Security rows current at `today` by the landed predicate (isCurrentSecurity). Open rows page by
 * ticker (unique among them: issuer_securities_open_owner_idx); rows with a scheduled end are few
 * and read in one page (gte valid_to today, then the predicate keeps valid_to > today only).
 */
export async function currentSecurities(tables:TableClient,today:string):Promise<Row[]>{
 const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
 // Rows with a scheduled end: several validity windows per ticker are allowed, so ticker is not unique: keyset paging.
 const ending=await keysetAll(tables,'issuer_securities',{},{gte:{valid_to:today}},'ticker',SEC_KEY);
 return [...open,...ending].filter(r=>isCurrentSecurity(r,today));
}

async function desiredUs(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DesiredRow[]>{
 const reasonsByTicker=new Map<string,Set<string>>();
 for(const u of US_UNIVERSES){
  for(const m of await selectAll(tables,'security_universe_memberships',{universe:u,is_active:true},'ticker')){
   const t=normTicker(String(m.ticker));
   (reasonsByTicker.get(t)??reasonsByTicker.set(t,new Set()).get(t)!).add(`universe:${u}`);
  }
 }
 const ownerByTicker=new Map<string,string>();
 for(const s of await currentSecurities(tables,today)){const id=str(s.issuer_id);if(id)ownerByTicker.set(normTicker(String(s.ticker)),id);}
 const issuers=new Map<string,Row>();
 for(const i of await selectAll(tables,'issuers',{status:'active'},'issuer_id'))issuers.set(String(i.issuer_id),i);
 const out=new Map<string,DesiredRow>();
 for(const [ticker,reasons] of reasonsByTicker){
  const id=ownerByTicker.get(ticker);
  if(!id){bump(skipped,'unknown_ticker');continue;}
  const issuer=issuers.get(id);
  if(!issuer){bump(skipped,'issuer_not_active');continue;}
  let key:string;
  try{key=fetchKey('US',{cik:str(issuer.cik)});}catch{bump(skipped,'no_cik');continue;}
  const row=out.get(id)??out.set(id,{issuer_id:id,reasons:[],priority:SCOPE_PRIORITY,fetch_key:key}).get(id)!;
  row.reasons=[...new Set([...row.reasons,...reasons])].sort();
 }
 return [...out.values()];
}

/**
 * The issuer's A-share ticker among its current securities rows: primary first, else the single
 * candidate; null + reason when none or ambiguous.
 */
function chooseCnTicker(secs:Row[]):{ticker:string}|{reason:'no_cn_ticker'|'ambiguous_cn_ticker'}{
 const cands=new Map<string,Row>();
 for(const r of secs){const t=normTicker(String(r.ticker));if(CN_TICKER.test(t)&&!B_SHARE.test(t))cands.set(t,r);}
 const narrow=(list:[string,Row][])=>{
  if(list.length<=1)return list;
  const a=list.filter(([,r])=>str(r.share_class)?.toUpperCase()==='A');
  return a.length===1?a:list;
 };
 const all=[...cands.entries()];
 const primary=narrow(all.filter(([,r])=>r.is_primary===true));
 if(primary.length===1)return {ticker:primary[0][0]};
 if(primary.length>1)return {reason:'ambiguous_cn_ticker'};
 const rest=narrow(all);
 if(rest.length===1)return {ticker:rest[0][0]};
 return {reason:rest.length===0?'no_cn_ticker':'ambiguous_cn_ticker'};
}

async function desiredCn(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DesiredRow[]>{
 // (user_id, entity_id) is the key and TableClient orders by one column: keyset paging on entity_id, de-duplicated on the full key.
 const keys=await keysetAll(tables,'research_entity_keys',{in_scope:true},{},'entity_id',['user_id','entity_id']);
 const issuerIds=new Set<string>();
 for(const k of keys){const id=str(k.issuer_id);if(id)issuerIds.add(id);else bump(skipped,'no_issuer');}
 const byIssuer=new Map<string,Row[]>();
 for(const s of await currentSecurities(tables,today)){
  const id=str(s.issuer_id);if(!id)continue;
  (byIssuer.get(id)??byIssuer.set(id,[]).get(id)!).push(s);
 }
 const out:DesiredRow[]=[];
 for(const id of [...issuerIds].sort()){
  const c=chooseCnTicker(byIssuer.get(id)??[]);
  if('reason' in c){bump(skipped,c.reason);continue;}
  out.push({issuer_id:id,reasons:['cohort'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:c.ticker})});
 }
 return out;
}

/**
 * One issuer's scope input row for explicit runs (scripts --issuer, replay tests): US from
 * issuers.cik, CN from the current primary .SH/.SZ/.BJ listing. Null when the issuer is unknown,
 * merged, or has no fetch key — the sync core reports that issuer as scope_unresolved.
 */
export async function scopeRowFor(tables:TableClient,market:Market,issuerId:string,opts:{today?:string}={}):Promise<ScopeInputRow|null>{
 const today=opts.today??isoToday();
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 if(!issuer||issuer.status==='merged')return null;
 const secs=market==='CN'?(await keysetAll(tables,'issuer_securities',{issuer_id:issuerId},{},'ticker',SEC_KEY)).filter(r=>isCurrentSecurity(r,today)):[];   // DB errors propagate
 try{
  if(market==='US')return {issuer_id:issuerId,reasons:['explicit'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('US',{cik:str(issuer.cik)})};
  const c=chooseCnTicker(secs);
  if('reason' in c)return null;
  return {issuer_id:issuerId,reasons:['explicit'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:c.ticker})};
 }catch(e){if(e instanceof Error&&FETCH_KEY_ERRORS.has(e.message))return null;throw e;}
}

export async function reconcileScope(deps:ScopeDeps,market:Market,opts:{today?:string}={}):Promise<ScopeReconcileResult>{
 const today=opts.today??isoToday();
 const skipped:Record<string,number>={};
 const desired=market==='US'?await desiredUs(deps.tables,today,skipped):await desiredCn(deps.tables,today,skipped);
 const wanted=new Set(desired.map(d=>d.issuer_id));
 // Rows that left the sources keep their fetch_key and drop to priority 0 (never deleted: scheduling history stays).
 const retired:DesiredRow[]=(await deps.db.scopeAll(market))
  .filter(r=>Number(r.priority)>0&&!wanted.has(String(r.issuer_id)))
  .map(r=>({issuer_id:String(r.issuer_id),reasons:[],priority:0,fetch_key:String(r.fetch_key)}));
 const rows=[...desired,...retired].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
 const changed=rows.length===0?0:await deps.db.reconcileScope(market,rows);
 return {desired:desired.length,retired:retired.length,changed,skipped};
}
