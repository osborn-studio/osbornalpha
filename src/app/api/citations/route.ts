// src/app/api/citations/route.ts
// GET /api/citations?factId=<uuid> (spec §9, R5-4): the evidence of one published fact. Anon
// client, so RLS decides visibility: financial_facts shows only status 'ok'; the fact's filing
// must be on a published generation (mapping_gen > 0; an older generation's ok row is still
// served by id, spec §12 example 9); fact_citations are visible with their ok fact; the citation
// rows themselves pass through the §4.12 policy (public document + ok fact link), so anything RLS
// hides is dropped. Exactly one factId; errors {error:{code,message}} with no-store; success is
// public with successCacheControl. Part C owns /api/citations/[id].
import {NextResponse} from 'next/server';
import {supabaseDocumentsDb} from '@/lib/documents/db';
import {strictParams} from '@/lib/documents/read-route';
import {paramErrorResponse} from '@/lib/facts/public-route';
import {successCacheControl} from '@/lib/entities/resolve';
import {getAnonSupabase} from '@/lib/supabase/anon';
import {readPublicFactCitations} from '@/lib/documents/public-citations';

export const dynamic='force-dynamic';
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
interface Res<T>{data:T;error:{message:string}|null}
// Loosely typed on purpose (as src/lib/facts/db.ts): the hand-maintained Database type does not describe the F3 tables' relationships.
interface AnonClient{from:(table:string)=>any}
async function read<T>(p:PromiseLike<Res<T>>):Promise<T>{const {data,error}=await p;if(error)throw new Error(error.message);return data;}

export async function GET(request:Request){
 // strictParams: factId is the only parameter; anything else (a cache-buster) or a repeat is a 400 naming it
 let factId:string|undefined;
 try{factId=strictParams(new URL(request.url),['factId']).get('factId');}
 catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 if(factId===undefined||!UUID_RE.test(factId))return err('invalid_parameter:factId','factId must be given once as a uuid',400);
 try{
  const anon=getAnonSupabase() as unknown as AnonClient;
  const db=supabaseDocumentsDb(getAnonSupabase());
  const result=await readPublicFactCitations(factId,{
   fact:id=>read<Record<string,unknown>|null>(anon.from('financial_facts').select('fact_id,concept,period_start,period_end,unit,value_text,filing_id,status').eq('fact_id',id).eq('status','ok').maybeSingle()),
   filing:id=>read<{mapping_gen:number|string}|null>(anon.from('filings').select('mapping_gen').eq('filing_id',id).maybeSingle()),
   links:async(id,from,to)=>(await read<{role:string;citation_id:string}[]|null>(anon.from('fact_citations').select('role,citation_id').eq('fact_id',id).order('role').order('citation_id').range(from,to)))??[],
  },db);
  if(!result)return err('not_found','No published fact with this id',404);
  return NextResponse.json(result,
   {status:200,headers:{'Cache-Control':successCacheControl(new Date())}});
 }catch(e){
  console.error('[citations] factId',e instanceof Error?e.message:e);
  return err('citations_unavailable','Citations unavailable',500);
 }
}
