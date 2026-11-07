// src/lib/company/tracking-issuers.ts
// Issuer cards for GET /api/tracking/watches (spec §6.2): names and CURRENT tickers from issuers /
// issuer_securities (anon-readable reference data, read with the session client), stream dates from
// issuer_coverage (public), unread counts from inbox.unreadCounts. toWatchCards is pure.
import {isCurrentSecurity} from '../entities/resolve';
import {publicMarketOf} from '../facts/public-route';
import {formatUnread,UNREAD_CAP,type UnreadCounts} from './inbox';
import type {CoverageRow,WatchRow} from './types';

export interface IssuerLite{issuer_id:string;canonical_name_zh:string|null;canonical_name_en:string|null}
export interface SecurityLite{issuer_id:string;ticker:string;is_primary:boolean;valid_from:string;valid_to:string|null}
export type TickerStream='US'|'CN'|'HK';
export interface WatchCard{
 issuerId:string;names:{zh:string|null;en:string|null};
 tickers:{ticker:string;stream:TickerStream|null;isPrimary:boolean}[];
 primaryTicker:Partial<Record<TickerStream,string>>;
 streams:{market:'US'|'CN';latestPeriodEnd:string|null;latestAvailableDate:string|null}[];
 hkOnly:boolean;note:string|null;muted:boolean;createdAt:string;updatedAt:string;
 unread:number|null;unreadLabel:string|null;
}

export const streamOfTicker=(ticker:string):TickerStream|null=>/\.HK$/i.test(ticker)?'HK':publicMarketOf(ticker.toUpperCase());

/** Minimal structural view of the session Supabase client used here (cast at the call site). */
export interface SelectInClient{from(table:string):{select(cols:string):{in(col:string,vals:string[]):PromiseLike<{data:unknown[]|null;error:{message:string}|null}>}}}
const CHUNK=100;
async function selectIn<T>(sb:SelectInClient,table:string,cols:string,col:string,ids:string[]):Promise<T[]>{
 const out:T[]=[];
 for(let i=0;i<ids.length;i+=CHUNK){
  const {data,error}=await sb.from(table).select(cols).in(col,ids.slice(i,i+CHUNK));
  if(error)throw new Error(`${table}_read_failed`);
  out.push(...((data??[]) as T[]));
 }
 return out;
}
export async function loadIssuerLites(sb:SelectInClient,ids:string[]):Promise<{issuers:IssuerLite[];securities:SecurityLite[]}>{
 if(ids.length===0)return {issuers:[],securities:[]};
 const [issuers,securities]=await Promise.all([
  selectIn<IssuerLite>(sb,'issuers','issuer_id,canonical_name_zh,canonical_name_en','issuer_id',ids),
  selectIn<SecurityLite>(sb,'issuer_securities','issuer_id,ticker,is_primary,valid_from,valid_to','issuer_id',ids),
 ]);
 return {issuers,securities};
}

export function toWatchCards(input:{watches:WatchRow[];issuers:IssuerLite[];securities:SecurityLite[];coverage:CoverageRow[];unread:UnreadCounts;today:string}):WatchCard[]{
 const issuer=new Map(input.issuers.map(i=>[i.issuer_id,i]));
 const cards=input.watches.map((w):WatchCard=>{
  const secs=input.securities.filter(s=>s.issuer_id===w.issuer_id&&isCurrentSecurity(s as unknown as Record<string,unknown>,input.today))
   .sort((x,y)=>Number(y.is_primary)-Number(x.is_primary)||x.valid_from.localeCompare(y.valid_from)||x.ticker.localeCompare(y.ticker));
  const tickers=secs.map(s=>({ticker:s.ticker,stream:streamOfTicker(s.ticker),isPrimary:s.is_primary}));
  const primaryTicker:WatchCard['primaryTicker']={};
  for(const t of tickers)if(t.stream&&!primaryTicker[t.stream])primaryTicker[t.stream]=t.ticker;
  const streams=input.coverage.filter(c=>c.issuer_id===w.issuer_id).sort((x,y)=>x.market.localeCompare(y.market))
   .map(c=>({market:c.market,latestPeriodEnd:c.latest_period_end,latestAvailableDate:c.latest_available_date}));
  const n=w.muted?null:Math.min(UNREAD_CAP,input.unread.counts.get(w.issuer_id)??0);
  const i=issuer.get(w.issuer_id);
  return {
   issuerId:w.issuer_id,names:{zh:i?.canonical_name_zh??null,en:i?.canonical_name_en??null},tickers,primaryTicker,streams,
   hkOnly:tickers.length>0&&tickers.every(t=>t.stream==='HK')&&streams.length===0,
   note:w.note,muted:w.muted,createdAt:w.created_at,updatedAt:w.updated_at,
   unread:n,unreadLabel:formatUnread(n,input.unread.complete),
  };
 });
 return cards.sort((x,y)=>y.updatedAt.localeCompare(x.updatedAt)||x.issuerId.localeCompare(y.issuerId));
}
