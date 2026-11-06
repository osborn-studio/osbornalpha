// src/lib/industry/facts-scope.ts
// Industry fact universe for the CN facts scope (spec §4.10, V3/V4; owner decision E). It is NOT a separate
// upsert job: src/lib/facts/scope.ts::desiredCn merges industryCnUniverse into the authoritative CN desired set
// inside its `// INDUSTRY` block, only when FACTS_CN_INDUSTRY_UNIVERSE=1 (flag off → desiredCn is plan 2's).
// Universe = issuers resolved from CURRENT industry_source_memberships rows (issuer_id not null; historical
// members included, so delisted issuers too; unresolved rows stay out — they are counted in n_unresolved)
// ∪ issuers currently owning an active `a_stock` universe ticker. Reasons per issuer: 'universe:sw2021' and/or
// 'universe:a_stock'; mergeDesired unions them with the cohort's ['cohort'] per issuer (sorted), so
// reconcile_fact_sync_scope (which REPLACES reasons) receives the union and retires only issuers outside it.
// fetch_key: the current A-share ticker (landed chooseCnTicker); an issuer without one (historical member)
// takes the ticker of its most recently CLOSED A-share window (chooseCnTicker over the rows with the largest
// valid_to); still none → skipped.no_cn_ticker. Merged issuers are skipped (industry_issuer_merged).
// Inputs are read to exhaustion by KEYSET paging (scope.ts::keysetAll: restart from the last key inclusive, so a row
// superseded or inserted between pages cannot shift later rows out of the read): industry_source_memberships on its
// unique `id`, the a_stock memberships on `ticker` (unique within one universe), issuers on `issuer_id`, securities
// (open and scheduled-end rows) and each issuer's historical rows on `ticker` with the (issuer_id, ticker, valid_from) key.
// The fallback ticker of a historical member must not be owned today by another issuer (industry_ticker_reused).
// Reads go through the service-role TableClient (industry_source_memberships grants service_role SELECT), so a
// memory harness must hold the source rows in its TableClient too.
import type {Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {SCOPE_PRIORITY,chooseCnTicker,fetchKey,keysetAll} from '../facts/scope';
import type {ScopeInputRow} from '../facts/scope';

export const INDUSTRY_UNIVERSE_FLAG='FACTS_CN_INDUSTRY_UNIVERSE';
export const REASON_SW2021='universe:sw2021';
export const REASON_A_STOCK='universe:a_stock';
const SEC_KEY=['issuer_id','ticker','valid_from'];
const CN_TICKER=/\.(SH|SZ|BJ)$/;
const B_SHARE=/^(900\d{3}\.SH|200\d{3}\.SZ)$/;
const str=(v:unknown)=>typeof v==='string'&&v.length>0?v:null;
const norm=(t:unknown)=>String(t).trim().toUpperCase().replace(/\//g,'.');
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};

export const industryUniverseEnabled=(env:Record<string,string|undefined>=process.env)=>env[INDUSTRY_UNIVERSE_FLAG]==='1';

/** The ticker of the issuer's most recently closed A-share window (valid_to <= today; rows with the largest valid_to), or a reason. */
export function closedWindowTicker(secs:Row[],today:string):{ticker:string}|{reason:'no_cn_ticker'|'ambiguous_cn_ticker'}{
 const closed=secs.filter(r=>str(r.valid_to)!==null&&String(r.valid_to)<=today&&CN_TICKER.test(norm(r.ticker))&&!B_SHARE.test(norm(r.ticker)));
 if(closed.length===0)return {reason:'no_cn_ticker'};
 const last=closed.reduce((m,r)=>String(r.valid_to)>m?String(r.valid_to):m,'');
 return chooseCnTicker(closed.filter(r=>String(r.valid_to)===last));
}

/** Current securities by the landed predicate, read by keyset paging (open rows and scheduled-end rows). */
async function currentSecuritiesKeyset(tables:TableClient,today:string):Promise<Row[]>{
 const open=await keysetAll(tables,'issuer_securities',{valid_to:null},{},'ticker',SEC_KEY);
 const ending=await keysetAll(tables,'issuer_securities',{},{gte:{valid_to:today}},'ticker',SEC_KEY);
 return [...open,...ending].filter(r=>isCurrentSecurity(r,today));
}

/** Desired CN scope rows of the industry universe (spec §4.10). `skipped` is the caller's counter map. */
export async function industryCnUniverse(tables:TableClient,today:string,skipped:Record<string,number>):Promise<ScopeInputRow[]>{
 const reasons=new Map<string,Set<string>>();
 const add=(id:string,r:string)=>{(reasons.get(id)??reasons.set(id,new Set()).get(id)!).add(r);};
 for(const s of await keysetAll(tables,'industry_source_memberships',{status:'current',scheme:'sw2021'},{},'id',['id'])){
  const id=str(s.issuer_id);if(id)add(id,REASON_SW2021);
 }
 const current=await currentSecuritiesKeyset(tables,today);
 const ownerByTicker=new Map<string,string>();
 const byIssuer=new Map<string,Row[]>();
 for(const s of current){
  const id=str(s.issuer_id);if(!id)continue;
  ownerByTicker.set(norm(s.ticker),id);
  (byIssuer.get(id)??byIssuer.set(id,[]).get(id)!).push(s);
 }
 for(const m of await keysetAll(tables,'security_universe_memberships',{universe:'a_stock',is_active:true},{},'ticker',['ticker'])){
  const id=ownerByTicker.get(norm(m.ticker));
  if(id)add(id,REASON_A_STOCK);else bump(skipped,'industry_unknown_ticker');
 }
 const issuers=new Map((await keysetAll(tables,'issuers',{},{},'issuer_id',['issuer_id'])).map(i=>[String(i.issuer_id),i]));
 const out:ScopeInputRow[]=[];
 for(const id of [...reasons.keys()].sort()){
  const issuer=issuers.get(id);
  if(!issuer){bump(skipped,'industry_unknown_issuer');continue;}
  if(issuer.status==='merged'){bump(skipped,'industry_issuer_merged');continue;}
  let choice=chooseCnTicker(byIssuer.get(id)??[]);
  if('reason' in choice&&choice.reason==='no_cn_ticker'){
   choice=closedWindowTicker(await keysetAll(tables,'issuer_securities',{issuer_id:id},{},'ticker',SEC_KEY),today);
   const owner='ticker' in choice?ownerByTicker.get(norm(choice.ticker)):undefined;
   if(owner&&owner!==id){bump(skipped,'industry_ticker_reused');continue;}
  }
  if('reason' in choice){bump(skipped,`industry_${choice.reason}`);continue;}
  out.push({issuer_id:id,reasons:[...reasons.get(id)!].sort(),priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:choice.ticker})});
 }
 return out;
}

/** Per-issuer union: reasons merged and sorted; the cohort row's fetch_key and priority win when both exist. */
export function mergeDesired(cohort:ScopeInputRow[],industry:ScopeInputRow[]):ScopeInputRow[]{
 const out=new Map<string,ScopeInputRow>();
 for(const r of cohort)out.set(r.issuer_id,{...r,reasons:[...r.reasons]});
 for(const r of industry){
  const have=out.get(r.issuer_id);
  if(!have){out.set(r.issuer_id,{...r,reasons:[...r.reasons]});continue;}
  have.reasons=[...new Set([...have.reasons,...r.reasons])].sort();
 }
 return [...out.values()].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
}
