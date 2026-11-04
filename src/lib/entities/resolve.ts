// Read-side issuer resolution: exactly one of ticker / ISIN / CIK / LEI → canonical issuer with
// its securities. Zero identifiers → 'empty_query'; more than one → 'ambiguous_query' (callers
// must not rely on an implicit precedence between conflicting identifiers).
// Effective dates: validity windows are DATE-level and evaluated against a UTC calendar date
// (`today`, default = current UTC date); exchange-local trading dates are out of scope. A security
// row is current at `today` iff valid_from <= today and (valid_to is null or valid_to > today).
// `date` columns arrive from PostgREST as 'YYYY-MM-DD' strings, so ISO strings compare
// lexicographically; the in-memory client used in tests must be fed the same string form.
// Merges: one merged_into hop is followed (result carries redirected_from); a merged target
// returns null rather than walking a chain, so cycles and stale chains surface as not-found.
// Provenance (source) and identifier claims are deliberately not part of the response.
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

/** Validates `today` as a real calendar date 'YYYY-MM-DD'; defaults to the current UTC date. */
function resolveToday(today?:string):string{
 if(today===undefined)return new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new Error('invalid_today');
 const ms=Date.parse(`${today}T00:00:00Z`);
 if(Number.isNaN(ms)||new Date(ms).toISOString().slice(0,10)!==today)throw new Error('invalid_today');
 return today;
}

/**
 * Ticker candidates in lookup order. The exact (trimmed, upper-cased, '/'→'.') form comes first:
 * the shared normalizer strips Wind suffixes (.A/.N/.O/...), which would turn BRK.A into BRK.
 * The normalized form is only a fallback when the exact form has no current row.
 */
function tickerCandidates(raw:string):string[]{
 const exact=raw.trim().toUpperCase().replace(/\//g,'.');
 const market=inferCoreMarket(raw);
 const normalized=(market&&normalizeSecurityTicker(raw,market))||exact;
 return normalized===exact?[exact]:[exact,normalized];
}

type Lookup={column:'lei'|'cik'|'isin';value:string}|{column:'ticker';values:string[]};

/** Requires exactly one non-blank identifier and validates it. */
function parseQuery(q:ResolveQuery):Lookup{
 const t=(v?:string)=>v?.trim()||undefined;
 const given=(['ticker','isin','cik','lei'] as const).filter(k=>t(q[k])!==undefined);
 if(given.length===0)throw new Error('empty_query');
 if(given.length>1)throw new Error('ambiguous_query');
 const key=given[0],raw=t(q[key])!;
 switch(key){
  case 'lei':{const v=raw.toUpperCase();if(!isValidLei(v))throw new Error('invalid_identifier:lei');return {column:'lei',value:v};}
  case 'isin':{const v=raw.toUpperCase();if(!isValidIsin(v))throw new Error('invalid_identifier:isin');return {column:'isin',value:v};}
  case 'cik':{try{return {column:'cik',value:normalizeCik(raw)};}catch{throw new Error('invalid_identifier:cik');}}
  case 'ticker':return {column:'ticker',values:tickerCandidates(raw)};
 }
}

/** The single issuer owning a current row; null if none; 'ambiguous_owner' if several. */
async function currentOwner(client:TableClient,column:'isin'|'ticker',value:string,today:string):Promise<string|null>{
 const rows=(await client.select('issuer_securities',{[column]:value})).filter(r=>isCurrent(r,today));
 const owners=new Set(rows.map(r=>str(r.issuer_id)).filter((v):v is string=>v!==null));
 // The schema's exclusion constraint should make this impossible; keep it as defense.
 if(owners.size>1)throw new Error('ambiguous_owner');
 return owners.values().next().value??null;
}

export async function resolveIssuer(client:TableClient,q:ResolveQuery,opts:ResolveOptions={}):Promise<ResolvedIssuer|null>{
 const lookup=parseQuery(q);
 const today=resolveToday(opts.today);
 let issuerId:string|null=null;
 if(lookup.column==='lei'||lookup.column==='cik'){
  issuerId=str((await client.select('issuers',{[lookup.column]:lookup.value},{limit:1}))[0]?.issuer_id);
 }else if(lookup.column==='ticker'){
  for(const v of lookup.values){issuerId=await currentOwner(client,'ticker',v,today);if(issuerId)break;}
 }else{
  issuerId=await currentOwner(client,'isin',lookup.value,today);
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
 // Single page: PostgREST caps responses at 1000 rows, far above any one issuer's listings.
 const secs=await client.select('issuer_securities',{issuer_id:id},{orderBy:'valid_from'});
 return {
  issuer_id:id,status:String(issuer.status),...(redirectedFrom?{redirected_from:redirectedFrom}:{}),
  names:{zh:str(issuer.canonical_name_zh),en:str(issuer.canonical_name_en)},
  identifiers:{cik:str(issuer.cik),lei:str(issuer.lei),usci:str(issuer.usci)},
  securities:(opts.includeExpired?secs:secs.filter(r=>isCurrent(r,today))).map(toSecurity),
 };
}

/**
 * Cache-Control for a successful resolve. Validity windows flip at UTC date boundaries, so a
 * shared cache may hold a response at most until the next UTC midnight (clamped to [60, 3600]s);
 * stale-while-revalidate is kept short so a post-midnight flip is served stale for <= 10 minutes.
 */
export function successCacheControl(now:Date):string{
 const nextMidnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
 const secs=Math.min(3600,Math.max(60,Math.floor((nextMidnight-now.getTime())/1000)));
 return `public, s-maxage=${secs}, stale-while-revalidate=600`;
}
