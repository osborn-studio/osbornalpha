import {NextResponse} from 'next/server';
import {getAnonSupabase} from '@/lib/supabase/anon';
import {supabaseTableClient} from '@/lib/db/table-client';
import {HISTORICAL_CACHE_CONTROL,isCalendarDate,resolveIssuer,successCacheControl,type ResolveQuery} from '@/lib/entities/resolve';

// TODO: add application-level throttling for this public endpoint (cf. security_resolve_rate_limits).
export const dynamic='force-dynamic';
const SAFE=/^[A-Za-z0-9.\/\-]{1,24}$/;
const KEYS=['ticker','isin','cik','lei'] as const;
// invalid_today / invalid_as_of are deliberately absent: the route always passes a validated
// asOf, so either error would be a server bug and correctly surfaces as a 500.
const CLIENT_ERRORS=new Set(['empty_query','ambiguous_query']);
const utcDate=(d:Date)=>d.toISOString().slice(0,10);
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

export async function GET(req:Request){
 // One clock for the whole request: the default asOf and the cache lifetime share it.
 const now=new Date();
 const url=new URL(req.url);
 // searchParams values are already percent-decoded; do not decode again.
 for(const k of [...KEYS,'includeExpired','asOf'])if(url.searchParams.getAll(k).length>1)return err('duplicate_parameter',`${k} given more than once`,400);
 const q:ResolveQuery={};
 for(const k of KEYS){
  const v=url.searchParams.get(k);
  if(!v)continue;
  if(!SAFE.test(v))return err(`invalid_identifier:${k}`,'invalid identifier',400);
  q[k]=v;
 }
 const given=Object.keys(q).length;
 if(given===0)return err('empty_query','ticker, isin, cik or lei required',400);
 if(given>1)return err('ambiguous_query','exactly one of ticker, isin, cik or lei',400);
 const includeExpired=url.searchParams.get('includeExpired');
 if(includeExpired!==null&&includeExpired!=='1')return err('invalid_parameter','includeExpired must be 1 or absent',400);
 const today=utcDate(now);
 const asOfParam=url.searchParams.get('asOf');
 if(asOfParam!==null&&(!isCalendarDate(asOfParam)||asOfParam>today))return err('invalid_parameter:asOf','asOf must be a YYYY-MM-DD calendar date not after today (UTC)',400);
 const asOf=asOfParam??today;
 try{
  // Public reference data: the anon client respects RLS (issuer tables grant anon SELECT).
  const result=await resolveIssuer(supabaseTableClient(getAnonSupabase()),q,{includeExpired:includeExpired==='1',asOf});
  if(!result)return err('not_found','no issuer',404);
  // A past asOf answers for fixed windows (cache a fixed time). For today: if the UTC date flipped
  // while resolving, the answer is for yesterday's windows and must not be shared under today's key.
  const cacheControl=asOf<today?HISTORICAL_CACHE_CONTROL:utcDate(new Date())!==today?'no-store':successCacheControl(now);
  return NextResponse.json(result,{headers:{'Cache-Control':cacheControl}});
 }catch(e){
  const m=e instanceof Error?e.message:'';
  if(m.startsWith('invalid_identifier:')||CLIENT_ERRORS.has(m))return err(m,'invalid query',400);
  // TableError, ambiguous_owner and anything unexpected: log server-side, never leak to the client.
  console.error('[entities/resolve]',e instanceof Error?e.message:e);
  return err('internal','resolve failed',500);
 }
}
