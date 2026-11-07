// src/app/api/tracking/watches/import-watchlist/route.ts
// POST: server-side watchlist_items tickers (RLS) → resolveIssuer → watches (spec §6.2). Guest/localStorage
// watchlists are invisible to the server: no rows → 409 no_server_watchlist.
import {resolveIssuer} from '@/lib/entities/resolve';
import {utcDate} from '@/lib/facts/public-route';
import {importWatchlist} from '@/lib/company/tracking-import';
import {mutationGuard,trackingError,trackingFailure,trackingJson,trackingSession,unauthenticated} from '@/lib/company/tracking-route';

export const dynamic='force-dynamic';
const PAGE=1000;
const MAX_PAGES=100;   // 100k rows: a hard ceiling, far above any real watchlist
type Page={data:unknown[]|null;error:{message:string}|null};
type Pager={from(t:string):{select(c:string):{order(c:string):{order(c:string):{range(a:number,b:number):PromiseLike<Page>}}}}};
/** Every session-visible watchlist_items ticker, paged in a stable unique order (id is unique). */
async function allTickers(sb:Pager):Promise<string[]>{
 const out:string[]=[];
 for(let p=0;p<MAX_PAGES;p++){
  const {data,error}=await sb.from('watchlist_items').select('ticker').order('added_at').order('id').range(p*PAGE,p*PAGE+PAGE-1);
  if(error)throw new Error('watchlist_read_failed');
  const rows=(data??[]) as {ticker:unknown}[];
  for(const r of rows)if(typeof r.ticker==='string')out.push(r.ticker);
  if(rows.length<PAGE)return out;
 }
 throw new Error('watchlist_too_large');
}

export async function POST(request:Request){
 const s=await trackingSession();
 if(!s)return unauthenticated();
 const guard=mutationGuard(request);if(guard)return guard;
 try{
  const tickers=[...new Set((await allTickers(s.sb as unknown as Pager)).map(t=>t.trim().toUpperCase()).filter(t=>t!==''))];
  if(tickers.length===0)return trackingError('no_server_watchlist','no server-side watchlist to import',409);
  const today=utcDate(new Date());
  const existing=new Set((await s.db.watchesOf(s.userId)).map(w=>w.issuer_id));
  const result=await importWatchlist(tickers,{
   resolve:async t=>(await resolveIssuer(s.tables,{ticker:t},{today}))?.issuer_id??null,
   existing,
   upsert:async id=>({created:(await s.db.upsertWatch(s.userId,id)).created}),
  });
  return trackingJson(result);
 }catch(e){return trackingFailure(e,'tracking/import');}
}
