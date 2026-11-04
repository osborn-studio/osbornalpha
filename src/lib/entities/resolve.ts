// Read-side issuer resolution: ticker / ISIN / CIK / LEI → canonical issuer with its securities.
// Effective dates: a security row is current at `today` iff valid_from <= today and
// (valid_to is null or valid_to > today); ISO date strings compare lexicographically.
// Merges: one merged_into hop is followed (result carries redirected_from); a merged target
// returns null rather than walking a chain, so cycles and stale chains surface as not-found.
import type {Row,TableClient} from '../db/table-client';
import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
import {isValidIsin,isValidLei,normalizeCik} from '../research/entity-keys/identifiers';

export interface ResolveQuery{ticker?:string;isin?:string;cik?:string;lei?:string}
export interface ResolvedSecurity{ticker:string;isin:string|null;figi:string|null;share_class:string|null;is_primary:boolean;valid_from:string;valid_to:string|null}
export interface ResolvedIssuer{
 issuer_id:string;status:string;redirected_from?:string;
 names:{zh:string|null;en:string|null};
 identifiers:{cik:string|null;lei:string|null;usci:string|null};
 securities:ResolvedSecurity[];
}
export interface ResolveOptions{includeExpired?:boolean;today?:string}

const str=(v:unknown)=>typeof v==='string'?v:null;
const isCurrent=(r:Row,today:string)=>{const from=str(r.valid_from),to=str(r.valid_to);return from!==null&&from<=today&&(to===null||to>today);};
const toSecurity=(r:Row):ResolvedSecurity=>({ticker:String(r.ticker),isin:str(r.isin),figi:str(r.figi),share_class:str(r.share_class),is_primary:r.is_primary===true,valid_from:String(r.valid_from),valid_to:str(r.valid_to)});

function normalizeTicker(raw:string):string{
 const market=inferCoreMarket(raw);
 return (market&&normalizeSecurityTicker(raw,market))||raw.trim().toUpperCase();
}

/** Validates every provided identifier, then looks up by the strongest one: lei, cik, isin, ticker. */
function parseQuery(q:ResolveQuery):{column:'lei'|'cik'|'isin'|'ticker';value:string}{
 const t=(v?:string)=>v?.trim()||undefined;
 const lei=t(q.lei)?.toUpperCase(),isin=t(q.isin)?.toUpperCase(),ticker=t(q.ticker);
 let cik:string|undefined;
 if(t(q.cik)){try{cik=normalizeCik(t(q.cik));}catch{throw new Error('invalid_identifier:cik');}}
 if(lei!==undefined&&!isValidLei(lei))throw new Error('invalid_identifier:lei');
 if(isin!==undefined&&!isValidIsin(isin))throw new Error('invalid_identifier:isin');
 if(lei)return {column:'lei',value:lei};
 if(cik)return {column:'cik',value:cik};
 if(isin)return {column:'isin',value:isin};
 if(ticker)return {column:'ticker',value:normalizeTicker(ticker)};
 throw new Error('empty_query');
}

export async function resolveIssuer(client:TableClient,q:ResolveQuery,opts:ResolveOptions={}):Promise<ResolvedIssuer|null>{
 const {column,value}=parseQuery(q);
 const today=opts.today??new Date().toISOString().slice(0,10);
 let issuerId:string|null;
 if(column==='lei'||column==='cik'){
  issuerId=str((await client.select('issuers',{[column]:value},{limit:1}))[0]?.issuer_id);
 }else{
  const rows=await client.select('issuer_securities',{[column]:value},{orderBy:'valid_from',desc:true});
  issuerId=str(rows.find(r=>isCurrent(r,today))?.issuer_id);
 }
 if(!issuerId)return null;
 let issuer=(await client.select('issuers',{issuer_id:issuerId},{limit:1}))[0];
 if(!issuer)return null;
 let redirectedFrom:string|undefined;
 if(issuer.status==='merged'){
  const target=str(issuer.merged_into);
  if(!target)return null;
  redirectedFrom=issuerId;
  issuer=(await client.select('issuers',{issuer_id:target},{limit:1}))[0];
  if(!issuer||issuer.status==='merged')return null;
 }
 const id=String(issuer.issuer_id);
 const secs=await client.select('issuer_securities',{issuer_id:id},{orderBy:'valid_from'});
 return {
  issuer_id:id,status:String(issuer.status),...(redirectedFrom?{redirected_from:redirectedFrom}:{}),
  names:{zh:str(issuer.canonical_name_zh),en:str(issuer.canonical_name_en)},
  identifiers:{cik:str(issuer.cik),lei:str(issuer.lei),usci:str(issuer.usci)},
  securities:(opts.includeExpired?secs:secs.filter(r=>isCurrent(r,today))).map(toSecurity),
 };
}
