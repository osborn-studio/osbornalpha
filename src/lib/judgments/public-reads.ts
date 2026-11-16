// src/lib/judgments/public-reads.ts
// Read paths of the public judgment routes (spec §10). Everything goes through the anon client, so
// RLS applies the publication gate (spec §5.6, N1): JudgmentsDb public-read methods plus three direct
// table reads the contract does not cover (a judgment's locator, its settlement list, a method's
// recent settlements). Two reads are not database reads: the methodology document from disk
// (docs/methodologies/** is bundled via next.config outputFileTracingIncludes) and the calibration
// sample, read from the private bucket with the service role ONLY after the anon read of the
// calibration row proved the method publishable.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {getAdminSupabase} from '../supabase/admin';
import {getAnonSupabase} from '../supabase/anon';
import {sha256} from './canonical';
import {supabaseCohortStore} from './cohort-store';
import {supabaseJudgmentsDb} from './db';
import type {JudgmentType,JudgmentsDb,PublicSubjectType,SettlementRow} from './types';

type Result={data:unknown;error:{message:string}|null};
interface Query extends PromiseLike<Result>{select(columns:string):Query;eq(column:string,value:unknown):Query;gt(column:string,value:unknown):Query;order(column:string,o:{ascending:boolean}):Query;limit(n:number):Query;maybeSingle():PromiseLike<Result>}
/** Settlement history page size; the loop runs until an EMPTY page, so a server row cap below it is harmless (P2-01). */
export const SETTLEMENT_PAGE=500;
interface LooseClient{from(table:string):Query}

export interface JudgmentLocator{subject_type:PublicSubjectType;subject_key:string;judgment_type:JudgmentType;methodology_id:string;methodology_version:string}
export type RecentSettlement=SettlementRow&{subject_type:string;subject_key:string;judgment_type:string};
export interface PublicReads{
 /** Public-read methods only (latestCards, historyOf, envelopeById, listMethodologies, latestCalibration, methodologyStateAt, calibrationCohort, serverTime). */
 db:JudgmentsDb;
 judgmentLocator(id:string):Promise<JudgmentLocator|null>;
 settlements(id:string):Promise<SettlementRow[]>;
 recentSettlements(methodology:string,version:string,limit:number):Promise<RecentSettlement[]>;
}

const iso=(v:unknown)=>typeof v==='string'?new Date(v).toISOString():v;
/** PostgREST timestamptz text → toISOString() shape (contract: ms-precision UTC). */
export function settlementFromRow(r:Record<string,unknown>):SettlementRow{
 return {...(r as unknown as SettlementRow),seq:Number(r.seq),settled_at:iso(r.settled_at) as string};
}
const check=(r:Result,what:string)=>{if(r.error)throw new Error(`${what}_failed: ${r.error.message}`);return r.data;};

export function publicReads():PublicReads{
 const anon=getAnonSupabase();
 const sb=anon as unknown as LooseClient;
 // Public routes call only anon-routed JudgmentsDb methods; the admin slot also gets the anon client so
 // a mistaken admin-routed call is still RLS-bound instead of silently using the service role.
 const db=supabaseJudgmentsDb({anon,admin:anon});
 return {
  db,
  async judgmentLocator(id){
   const data=check(await sb.from('judgments').select('subject_type,subject_key,judgment_type,methodology_id,methodology_version').eq('judgment_id',id).maybeSingle(),'judgment_locator');
   return (data as JudgmentLocator|null)??null;
  },
  async settlements(id){
   // keyset on seq until an empty page (a short page is not exhaustion: PostgREST max-rows may be below the limit)
   const out:SettlementRow[]=[];
   for(let after=0;;){
    const data=check(await sb.from('judgment_settlements').select('*').eq('judgment_id',id).gt('seq',after).order('seq',{ascending:true}).limit(SETTLEMENT_PAGE),'settlements');
    const page=((data as Record<string,unknown>[]|null)??[]).map(settlementFromRow);
    if(page.length===0)return out;
    out.push(...page);after=page[page.length-1].seq;
   }
  },
  async recentSettlements(methodology,version,limit){
   const data=check(await sb.from('judgment_settlements').select('*,judgments!inner(subject_type,subject_key,judgment_type,methodology_id,methodology_version)')
    .eq('judgments.methodology_id',methodology).eq('judgments.methodology_version',version).order('settled_at',{ascending:false}).limit(limit),'recent_settlements');
   return ((data as (Record<string,unknown>&{judgments:Record<string,string>})[]|null)??[]).map(({judgments,...r})=>({...settlementFromRow(r),subject_type:judgments.subject_type,subject_key:judgments.subject_key,judgment_type:judgments.judgment_type}));
  },
 };
}

const DOC_PATH=/^docs\/methodologies\/[a-z][a-z0-9_]{1,63}\/v[1-9][0-9]{0,3}\.md$/;
/** The registry's doc_path, read from the deployment bundle; never a path outside docs/methodologies. */
export async function readMethodologyDoc(docPath:string,expectedSha256:string):Promise<{markdown:string|null;sha256_matches:boolean}>{
 if(!DOC_PATH.test(docPath))return {markdown:null,sha256_matches:false};
 try{
  const bytes=await readFile(join(process.cwd(),docPath));
  return {markdown:bytes.toString('utf8'),sha256_matches:sha256(bytes)===expectedSha256};
 }catch{return {markdown:null,sha256_matches:false};}
}
export type CohortSample={status:'ok';entries:unknown[]}|{status:'missing'|'integrity_failed';entries:null};
/** Cohort file of a calibration row the caller already read through anon (so the method is publishable). */
export async function readCohortSample(cohortPath:string,cohortSha256:string):Promise<CohortSample>{
 const bytes=await supabaseCohortStore(getAdminSupabase()).get(cohortPath);
 if(!bytes)return {status:'missing',entries:null};
 if(sha256(bytes)!==cohortSha256)return {status:'integrity_failed',entries:null};
 try{
  const body=JSON.parse(new TextDecoder().decode(bytes)) as {entries?:unknown}|null;
  return body&&Array.isArray(body.entries)?{status:'ok',entries:body.entries}:{status:'integrity_failed',entries:null};
 }catch{return {status:'integrity_failed',entries:null};}
}
