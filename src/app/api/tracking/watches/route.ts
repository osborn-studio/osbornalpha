// src/app/api/tracking/watches/route.ts
// GET: the user's watches with names, current tickers, coverage streams and unread counts (spec §6.2).
// POST: {issuerId} | {ticker} → insert … on conflict do nothing; trigger limit → 409 watch_limit.
import {getAnonSupabase} from '@/lib/supabase/anon';
import {supabaseCompanyDb} from '@/lib/company/db';
import {MAX_COMPANY_WATCHES} from '@/lib/company/db';
import {unreadCounts} from '@/lib/company/inbox';
import {loadIssuerLites,toWatchCards,type SelectInClient} from '@/lib/company/tracking-issuers';
import {jsonObject,mutationGuard,resolveWatchTarget,serviceCompanyDb,trackingError,trackingFailure,trackingJson,trackingSession,unauthenticated,watchDto} from '@/lib/company/tracking-route';
import {utcDate} from '@/lib/facts/public-route';

export const dynamic='force-dynamic';

export async function GET(){
 const s=await trackingSession();
 if(!s)return unauthenticated();
 try{
  const watches=await s.db.watchesOf(s.userId);
  const ids=watches.map(w=>w.issuer_id);
  const service=serviceCompanyDb();
  const [lites,coverage,unread]=await Promise.all([
   loadIssuerLites(s.sb as unknown as SelectInClient,ids),
   ids.length?supabaseCompanyDb(getAnonSupabase()).coverageOf(ids):Promise.resolve([]),
   unreadCounts({eventsOfIssuers:(i,o)=>service.eventsOfIssuers(i,o),readEventIds:(e)=>s.db.readEventIds(s.userId,e)},watches.filter(w=>!w.muted).map(w=>w.issuer_id)),
  ]);
  const cards=toWatchCards({watches,issuers:lites.issuers,securities:lites.securities,coverage,unread,today:utcDate(new Date())});
  return trackingJson({count:cards.length,limit:MAX_COMPANY_WATCHES,unreadComplete:unread.complete,watches:cards});
 }catch(e){return trackingFailure(e,'tracking/watches');}
}

export async function POST(request:Request){
 const s=await trackingSession();
 if(!s)return unauthenticated();
 const guard=mutationGuard(request);if(guard)return guard;
 const body=await jsonObject(request);
 if(!body)return trackingError('invalid_parameter:body','JSON object required',400);
 try{
  const t=await resolveWatchTarget(s.tables,body);
  if('error' in t)return t.error;
  const {row,created}=await s.db.upsertWatch(s.userId,t.issuerId);
  return trackingJson({watch:{...watchDto(row),created}},created?201:200);
 }catch(e){return trackingFailure(e,'tracking/watches');}
}
