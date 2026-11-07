// src/lib/industry/public-deps.ts
// Production wiring of the industry read models (spec §8, §9). The anon IndustryDb (RLS licence gate)
// serves everything the public may see; the service role is used only for (a) counts of the
// non-public source records, (b) the private manifest bucket after the anon authorization chain,
// (c) the recompute path and (d) the official comparison value of a published 'within' pair. The
// classification tree of a PUBLIC dataset is cached under the 'industries' tag (spec §4.6/§4.8: the
// licence switch calls revalidateTag('industries')); reads of a non-public dataset are never cached.
// Ad-hoc reads (issuer cards, SIC member counts, pairs) use the client's from() directly: they are
// read-only, single-caller, and not part of the IndustryDb write contract.
import {unstable_cache} from 'next/cache';
import {supabaseFactsDb} from '../facts/db';
import {getAdminSupabase} from '../supabase/admin';
import {getAnonSupabase} from '../supabase/anon';
import {supabaseIndustryDb} from './db';
import {schemeDatasetKey} from './licenses';
import {supabaseManifestStore} from './manifest';
import {buildCellManifest} from './run-aggregation';
// E2E fixture mode (Task 20): synthetic deps under INDUSTRY_E2E_FIXTURES=1 outside production only.
import {fixtureMode,fixtureReadDeps,fixtureReplayDeps,fixtureValuationReplayDeps} from './e2e-fixture';
import type {IssuerCard,ReadDb,ReadDeps,ReplayDeps,ValuationReplayDeps} from './read';
import type {IndustryDb} from './types';

interface PgResult<T>{data:T|null;error:{message?:string}|null}
interface Query<T> extends PromiseLike<PgResult<T>>{
 select(cols:string):Query<T>;eq(col:string,v:unknown):Query<T>;in(col:string,v:unknown[]):Query<T>;lte(col:string,v:unknown):Query<T>;
 or(filter:string):Query<T>;order(col:string):Query<T>;range(from:number,to:number):Query<T>;maybeSingle():PromiseLike<PgResult<T extends (infer U)[]?U:T>>;
}
type Loose={from<T=Record<string,unknown>[]>(table:string):Query<T>};
const loose=(sb:unknown)=>sb as Loose;

function cachedTree(db:IndustryDb):ReadDb['classificationTree']{
 return async(scheme,version)=>{
  if(!await db.isDatasetPublic(schemeDatasetKey(scheme,version)))return db.classificationTree(scheme,version);
  return unstable_cache(()=>db.classificationTree(scheme,version),['industry-tree',scheme,version],{tags:['industries'],revalidate:3600})();
 };
}
function readDb(db:IndustryDb,cacheTree:boolean):ReadDb{
 return {
  isDatasetPublic:k=>db.isDatasetPublic(k),
  classificationTree:cacheTree?cachedTree(db):(s,v)=>db.classificationTree(s,v),
  freshness:()=>db.freshness(),
  activeMetricRun:(s,v,l)=>db.activeMetricRun(s,v,l),
  metricRun:r=>db.metricRun(r),
  metricRowsOfRun:(r,f)=>db.metricRowsOfRun(r,f),
  metricRunVisible:r=>db.metricRunVisible(r),
  activeValuationRun:(s,v,l)=>db.activeValuationRun(s,v,l),
  publishedValuations:(r,f)=>db.publishedValuations(r,f),
  membershipCandidates:q=>db.membershipCandidates(q),
  membershipsOfIssuer:(i,q)=>db.membershipsOfIssuer(i,q),
 };
}

interface IssuerRec{issuer_id:string;canonical_name_zh:string|null;canonical_name_en:string|null}
interface SecurityRec{issuer_id:string;ticker:string;is_primary:boolean;valid_from:string;valid_to:string|null}
/** Names and today's primary ticker (issuers / issuer_securities are anon-readable: 20261105091000_issuers.sql). */
export function issuerDirectory(sb:unknown):ReadDeps['issuers']{
 return async(ids,today)=>{
  const out=new Map<string,IssuerCard>();
  for(let i=0;i<ids.length;i+=100){
   const chunk=ids.slice(i,i+100);
   const [iss,secs]=await Promise.all([
    loose(sb).from<IssuerRec[]>('issuers').select('issuer_id,canonical_name_zh,canonical_name_en').in('issuer_id',chunk),
    loose(sb).from<SecurityRec[]>('issuer_securities').select('issuer_id,ticker,is_primary,valid_from,valid_to').in('issuer_id',chunk),
   ]);
   if(iss.error||secs.error)throw new Error('issuer_directory_failed');
   const current=(secs.data??[]).filter(s=>s.valid_from<=today&&(s.valid_to===null||s.valid_to>today));
   for(const r of iss.data??[]){
    const mine=current.filter(s=>s.issuer_id===r.issuer_id).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||(a.ticker<b.ticker?-1:a.ticker>b.ticker?1:0));
    out.set(r.issuer_id,{issuerId:r.issuer_id,nameZh:r.canonical_name_zh,nameEn:r.canonical_name_en,ticker:mine[0]?.ticker??null});
   }
  }
  return out;
 };
}
/** SIC navigation counts: current ok memberships per code, paged until an empty page (PostgREST max_rows). */
export function memberCounter(sb:unknown):NonNullable<ReadDeps['memberCounts']>{
 return async(scheme,version,on)=>{
  const counts=new Map<string,number>();
  for(let from=0;;){
   const {data,error}=await loose(sb).from<{code:string}[]>('issuer_industry_memberships').select('code,membership_id').eq('scheme',scheme).eq('version',version).eq('status','ok')
    .lte('valid_from',on).or(`valid_to.is.null,valid_to.gt.${on}`).order('membership_id').range(from,from+999);
   if(error)throw new Error('member_count_failed');
   const page=data??[];
   if(page.length===0)return counts;
   for(const r of page)counts.set(r.code,(counts.get(r.code)??0)+1);
   from+=page.length;
  }
 };
}

/** Public pages and routes: anon reads; service role only for unresolved counts (lazy: no key needed until used). */
export function publicReadDeps(now:Date):ReadDeps{
 if(fixtureMode())return fixtureReadDeps(now);
 const anon=getAnonSupabase();
 return {db:readDb(supabaseIndustryDb(anon),true),unresolved:{unresolvedCount:q=>supabaseIndustryDb(getAdminSupabase()).unresolvedCount(q)},
  issuers:issuerDirectory(anon),facts:supabaseFactsDb(anon),memberCounts:memberCounter(anon),now,preview:false};
}
/** Admin internal preview only (the caller has passed requireAdminUser): service-role reads, licence gate skipped. */
export function adminReadDeps(now:Date):ReadDeps{
 if(fixtureMode())return fixtureReadDeps(now,true);
 const admin=getAdminSupabase();const db=supabaseIndustryDb(admin);
 return {db:readDb(db,false),unresolved:db,issuers:issuerDirectory(admin),facts:supabaseFactsDb(admin),memberCounts:memberCounter(admin),now,preview:true};
}
export function replayDeps(now:Date):ReplayDeps{
 if(fixtureMode())return fixtureReplayDeps(now);
 return {
  db:supabaseIndustryDb(getAnonSupabase()),
  manifests:{get:h=>{const admin=getAdminSupabase();return supabaseManifestStore(admin,supabaseIndustryDb(admin)).get(h);}},
  recompute:q=>{const admin=getAdminSupabase();return buildCellManifest({db:supabaseIndustryDb(admin),facts:supabaseFactsDb(admin),codeVersion:process.env.VERCEL_GIT_COMMIT_SHA??null},q);},
  now,
 };
}
export function valuationReplayDeps():ValuationReplayDeps{
 if(fixtureMode())return fixtureValuationReplayDeps();
 return {
  db:supabaseIndustryDb(getAnonSupabase()),
  officialValue:async q=>{
   const {data,error}=await loose(getAdminSupabase()).from<{official_value:string|null;pair_status:string}[]>('industry_valuation_pairs').select('official_value::text,pair_status')
    .eq('run_id',q.runId).eq('scheme',q.scheme).eq('version',q.version).eq('code',q.code).eq('trade_date',q.tradeDate).eq('metric',q.metric).maybeSingle();
   if(error)throw new Error('official_value_failed');
   return data&&data.pair_status==='within'&&data.official_value!==null?data.official_value:null;   // ::text keeps the numeric exact (no JS number)
  },
 };
}
