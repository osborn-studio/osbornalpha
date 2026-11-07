// Broker ticker parsing and issuer resolution (spec §5.4 parseBrokerTicker/1, §4.5 resolution
// snapshot, §7.1 R9). Unparseable codes keep a verbatim stated: key with no candidates.
// HK target keys use four or more digits; universe candidates use five digits. Resolution
// snapshots record the lookup results without exposing report text or other private content.
import type {TableClient} from '../db/table-client';
import {resolveIssuer} from '../entities/resolve';
import {normalizeSecurityTicker} from '../securities/ticker';
import {TICKER_VERSION} from './versions';

export type TickerMarket='A'|'HK'|'US';
export interface ParsedTicker{method:string;stated:string;targetKey:string;market:TickerMarket|null;candidates:string[]}

const BBG_US=new Set(['US','UN','UW','UQ','UA','UR','UP','UV']);
const BBG_A:Readonly<Record<string,'SH'|'SZ'|'BJ'|'CH'>>={SS:'SH',SH:'SH',CG:'SH',C1:'SH',SZ:'SZ',CS:'SZ',C2:'SZ',BJ:'BJ',CH:'CH'};
const HINTS:Readonly<Record<string,{market:TickerMarket;exchange?:'SH'|'SZ'|'BJ'}>>={
 NYSE:{market:'US'},NASDAQ:{market:'US'},'NYSE AMERICAN':{market:'US'},AMEX:{market:'US'},'NYSE ARCA':{market:'US'},NYSEARCA:{market:'US'},US:{market:'US'},
 HKEX:{market:'HK'},SEHK:{market:'HK'},HKSE:{market:'HK'},HK:{market:'HK'},
 SSE:{market:'A',exchange:'SH'},SH:{market:'A',exchange:'SH'},SHANGHAI:{market:'A',exchange:'SH'},
 SZSE:{market:'A',exchange:'SZ'},SZ:{market:'A',exchange:'SZ'},SHENZHEN:{market:'A',exchange:'SZ'},
 BSE:{market:'A',exchange:'BJ'},BJ:{market:'A',exchange:'BJ'},
};
const PREFIX=/^(NYSE AMERICAN|NYSE ARCA|NYSEARCA|NYSE|NASDAQ|AMEX|HKEX|SEHK|HKSE|SSE|SZSE|BSE) ?[:：] ?(.+)$/;

const norm=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase().replace(/^\((.*)\)$/,'$1').trim();
const aShare=(code:string,ex:'SH'|'SZ'|'BJ'|'CH')=>ex==='CH'?normalizeSecurityTicker(code,'A'):`${code}.${ex}`;
const hk=(code:string,stated:string):ParsedTicker=>{
 const digits=code.replace(/^0+(?=\d)/,'');
 return {method:TICKER_VERSION,stated,targetKey:`${digits.padStart(4,'0')}.HK`,market:'HK',candidates:[`${digits.padStart(5,'0')}.HK`]};
};
const us=(stated:string,...cands:string[]):ParsedTicker=>({method:TICKER_VERSION,stated,targetKey:cands[0],market:'US',candidates:cands});
const a=(stated:string,t:string|null):ParsedTicker|null=>t?{method:TICKER_VERSION,stated,targetKey:t,market:'A',candidates:[t]}:null;

function parse(s:string,stated:string,hint:{market:TickerMarket;exchange?:'SH'|'SZ'|'BJ'}|null|'unknown'):ParsedTicker|null{
 let m:RegExpExecArray|null;
 // Explicit exchange suffixes and prefixes take precedence over a supplied hint.
 if((m=/^(\d{1,5})[ .]HK$/.exec(s)))return hk(m[1],stated);
 if((m=/^(\d{6})[ .](SS|SH|CG|C1|SZ|CS|C2|BJ|CH)$/.exec(s)))return a(stated,aShare(m[1],BBG_A[m[2]]));
 if((m=/^(SH|SZ|BJ)(\d{6})$/.exec(s)))return a(stated,`${m[2]}.${m[1]}`);
 if((m=/^([A-Z][A-Z0-9]{0,5})(?:[./]([A-Z]))? (US|UN|UW|UQ|UA|UR|UP|UV)$/.exec(s))&&BBG_US.has(m[3]))return us(stated,m[2]?`${m[1]}.${m[2]}`:m[1]);
 if((m=/^([A-Z][A-Z0-9]{0,5})\.(N|O|OQ|K)$/.exec(s)))return us(stated,m[1]);
 // .A may be an exchange suffix or a class-A share; check both exact candidates.
 if((m=/^([A-Z][A-Z0-9]{0,5})\.A$/.exec(s)))return us(stated,`${m[1]}.A`,m[1]);
 if((m=/^([A-Z][A-Z0-9]{0,5})[./]([B-Z])$/.exec(s)))return us(stated,`${m[1]}.${m[2]}`);
 if(hint==='unknown')return null;
 if(/^\d{6}$/.test(s)){
  if(hint&&hint.market!=='A')return null;
  return a(stated,hint?.exchange?`${s}.${hint.exchange}`:normalizeSecurityTicker(s,'A'));
 }
 if(/^\d{1,5}$/.test(s))return !hint||hint.market==='HK'?hk(s,stated):null;
 if(/^[A-Z][A-Z0-9]{0,5}$/.test(s))return !hint||hint.market==='US'?us(stated,s):null;
 return null;
}

/** spec §5.4. `stated` is kept verbatim in the fallback key. */
export function parseBrokerTicker(stated:string,exchangeHint?:string|null):ParsedTicker{
 if(stated.trim()==='')throw new Error('empty_ticker');
 let s=norm(stated);
 const h=exchangeHint?.trim()?norm(exchangeHint):null;
 let hint:{market:TickerMarket;exchange?:'SH'|'SZ'|'BJ'}|null|'unknown'=h===null?null:HINTS[h]??'unknown';
 const p=PREFIX.exec(s);
 if(p){hint=HINTS[p[1]]??'unknown';s=p[2].trim();}
 return parse(s,stated,hint)??{method:TICKER_VERSION,stated,targetKey:`stated:${stated}`,market:null,candidates:[]};
}

export type ResolutionOutcome='resolved'|'unresolved'|'conflict';
export interface TargetResolution{
 targetKey:string;tickerAsStated:string;outcome:ResolutionOutcome;issuerId:string|null;securityTicker:string|null;
 reasonCode:'unresolved_ticker'|'ticker_issuer_conflict'|null;
 resolution:Record<string,unknown>;
}
interface Lookup{ticker:string;issuer_id:string|null;redirected_from?:string;error?:string;row:{issuer_id:string;ticker:string;valid_from:string;valid_to:string|null}|null}

/** UTC calendar date of the document's uploaded_at timestamp. */
export function uploadedAtToday(uploadedAt:string):string{
 const ms=Date.parse(uploadedAt);
 if(Number.isNaN(ms))throw new Error('invalid_uploaded_at');
 return new Date(ms).toISOString().slice(0,10);
}

/** Resolve all candidates and retain lookup snapshots; never silently choose conflicting owners. */
export async function resolveTargets(client:TableClient,stated:{tickerAsStated:string;exchangeHint?:string|null}[],uploadedAt:string):Promise<TargetResolution[]>{
 const today=uploadedAtToday(uploadedAt);
 const cache=new Map<string,Promise<Lookup[]>>();
 const lookupAll=(p:ParsedTicker)=>Promise.all(p.candidates.map(async(ticker):Promise<Lookup>=>{
  try{
   const r=await resolveIssuer(client,{ticker},{today});
   if(!r)return {ticker,issuer_id:null,row:null};
   const sec=r.securities.find(x=>x.ticker===ticker);
   return {ticker,issuer_id:r.issuer_id,...(r.redirected_from?{redirected_from:r.redirected_from}:{}),row:sec?{issuer_id:r.issuer_id,ticker:sec.ticker,valid_from:sec.valid_from,valid_to:sec.valid_to}:null};
  }catch(e){
   if(e instanceof Error&&e.message==='ambiguous_owner')return {ticker,issuer_id:null,error:'ambiguous_owner',row:null};
   throw e;
  }
 }));
 const out:TargetResolution[]=[];
 for(const s of stated){
  const p=parseBrokerTicker(s.tickerAsStated,s.exchangeHint);
  if(!cache.has(p.targetKey))cache.set(p.targetKey,lookupAll(p));
  const lookups=await cache.get(p.targetKey)!;
  const issuers=[...new Set(lookups.map(l=>l.issuer_id).filter((v):v is string=>v!==null))];
  const conflict=issuers.length>1||lookups.some(l=>l.error==='ambiguous_owner');
  const outcome:ResolutionOutcome=conflict?'conflict':issuers.length===1?'resolved':'unresolved';
  const hit=outcome==='resolved'?lookups.find(l=>l.issuer_id!==null)!:null;
  out.push({
   targetKey:p.targetKey,tickerAsStated:s.tickerAsStated,outcome,
   issuerId:hit?.issuer_id??null,securityTicker:hit?.ticker??null,
   reasonCode:outcome==='resolved'?null:outcome==='conflict'?'ticker_issuer_conflict':'unresolved_ticker',
   resolution:{method:p.method,candidates:p.candidates,resolver:'resolveIssuer',today,outcome,issuer_securities_row:hit?.row??null,lookups},
  });
 }
 return out;
}
