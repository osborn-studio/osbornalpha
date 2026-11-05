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
// #13; reasons ['explicit']). Reads go through TableClient (selectAll pages in a fixed order);
// the CN key read and the "ending" securities read are single pages (no unique column to page
// on / few rows) and fail loudly if they fill.
import {MAX_PAGE,selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import type {FactsDb,Market} from './types';

export const US_UNIVERSES=['sp500','nasdaq_top500','us_china'] as const;
export const SCOPE_PRIORITY=10;
const CN_TICKER=/\.(SH|SZ|BJ)$/;

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

export interface ScopeDeps{tables:TableClient;db:Pick<FactsDb,'reconcileScope'>}
export interface ScopeReconcileResult{desired:number;retired:number;changed:number;skipped:Record<string,number>}
/** One reconcile_fact_sync_scope input row. */
export type ScopeInputRow={issuer_id:string;reasons:string[];priority:number;fetch_key:string};
type DesiredRow=ScopeInputRow;

const str=(v:unknown)=>typeof v==='string'?v:null;
const normTicker=(t:string)=>t.trim().toUpperCase().replace(/\//g,'.');
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
const isoToday=()=>new Date().toISOString().slice(0,10);

/**
 * Security rows current at `today` by the landed predicate (isCurrentSecurity). Open rows page by
 * ticker (unique among them: issuer_securities_open_owner_idx); rows with a scheduled end are few
 * and read in one page (gte valid_to today, then the predicate keeps valid_to > today only).
 */
export async function currentSecurities(tables:TableClient,today:string):Promise<Row[]>{
 const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
 const ending=await tables.select('issuer_securities',{},{gte:{valid_to:today},orderBy:'ticker',limit:MAX_PAGE});
 if(ending.length>=MAX_PAGE)throw new Error('scope_securities_page_full');
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

async function desiredCn(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DesiredRow[]>{
 const keys=await tables.select('research_entity_keys',{in_scope:true},{limit:MAX_PAGE});
 if(keys.length>=MAX_PAGE)throw new Error('scope_cn_page_full');
 const issuerIds=new Set<string>();
 for(const k of keys){const id=str(k.issuer_id);if(id)issuerIds.add(id);else bump(skipped,'no_issuer');}
 const primaryByIssuer=new Map<string,string[]>();
 for(const s of await currentSecurities(tables,today)){
  const id=str(s.issuer_id),t=normTicker(String(s.ticker));
  if(!id||s.is_primary!==true||!CN_TICKER.test(t))continue;
  (primaryByIssuer.get(id)??primaryByIssuer.set(id,[]).get(id)!).push(t);
 }
 const out:DesiredRow[]=[];
 for(const id of [...issuerIds].sort()){
  const tickers=(primaryByIssuer.get(id)??[]).sort();
  if(tickers.length===0){bump(skipped,'no_cn_ticker');continue;}
  if(tickers.length>1)bump(skipped,'multiple_primary');   // schema should prevent it; the smallest ticker wins deterministically
  out.push({issuer_id:id,reasons:['cohort'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:tickers[0]})});
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
 try{
  if(market==='US')return {issuer_id:issuerId,reasons:['explicit'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('US',{cik:str(issuer.cik)})};
  const tickers=(await tables.select('issuer_securities',{issuer_id:issuerId,is_primary:true},{limit:MAX_PAGE})).filter(r=>isCurrentSecurity(r,today)).map(r=>normTicker(String(r.ticker))).filter(t=>CN_TICKER.test(t)).sort();
  if(tickers.length===0)return null;
  return {issuer_id:issuerId,reasons:['explicit'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:tickers[0]})};
 }catch{return null;}
}

export async function reconcileScope(deps:ScopeDeps,market:Market,opts:{today?:string}={}):Promise<ScopeReconcileResult>{
 const today=opts.today??isoToday();
 const skipped:Record<string,number>={};
 const desired=market==='US'?await desiredUs(deps.tables,today,skipped):await desiredCn(deps.tables,today,skipped);
 const wanted=new Set(desired.map(d=>d.issuer_id));
 // Rows that left the sources keep their fetch_key and drop to priority 0 (never deleted: scheduling history stays).
 const retired:DesiredRow[]=(await selectAll(deps.tables,'fact_sync_scope',{market},'issuer_id'))
  .filter(r=>Number(r.priority)>0&&!wanted.has(String(r.issuer_id)))
  .map(r=>({issuer_id:String(r.issuer_id),reasons:[],priority:0,fetch_key:String(r.fetch_key)}));
 const rows=[...desired,...retired].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
 const changed=rows.length===0?0:await deps.db.reconcileScope(market,rows);
 return {desired:desired.length,retired:retired.length,changed,skipped};
}
