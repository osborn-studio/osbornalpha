// src/app/api/tracking/watches/import-watchlist/route.ts
// POST: server-side watchlist_items tickers (RLS) → resolveIssuer → watches (spec §6.2). Guest/localStorage
// watchlists are invisible to the server: no rows → 409 no_server_watchlist.
import {resolveIssuer} from '@/lib/entities/resolve';
import {utcDate} from '@/lib/facts/public-route';
import {importWatchlist} from '@/lib/company/tracking-import';
import {mutationGuard,trackingError,trackingFailure,trackingJson,trackingSession,unauthenticated} from '@/lib/company/tracking-route';

export const dynamic='force-dynamic';
const MAX_TICKERS=1000;

export async function POST(request:Request){
 const s=await trackingSession();
 if(!s)return unauthenticated();
 const guard=mutationGuard(request);if(guard)return guard;
 try{
  const {data,error}=await s.sb.from('watchlist_items').select('ticker').limit(MAX_TICKERS);
  if(error)throw new Error('watchlist_read_failed');
  const tickers=((data??[]) as {ticker:unknown}[]).map(r=>r.ticker).filter((t):t is string=>typeof t==='string');
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
