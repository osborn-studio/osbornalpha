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
  const fact=await read<Record<string,unknown>|null>(anon.from('financial_facts').select('fact_id,concept,period_start,period_end,unit,value_text,filing_id,status').eq('fact_id',factId).eq('status','ok').maybeSingle());
  if(!fact)return err('not_found','No published fact with this id',404);
  const filing=await read<{mapping_gen:number|string}|null>(anon.from('filings').select('mapping_gen').eq('filing_id',String(fact.filing_id)).maybeSingle());
  if(!filing||Number(filing.mapping_gen)<1)return err('not_found','No published fact with this id',404);
  const links=(await read<{role:string;citation_id:string}[]|null>(anon.from('fact_citations').select('role,citation_id').eq('fact_id',factId).order('role').order('citation_id')))??[];
  const wanted=[...new Set(links.map(l=>l.citation_id))];
  const db=supabaseDocumentsDb(getAnonSupabase());
  const rows=new Map<string,{citation_id:string;document_id:string;extraction_id:string;page_no:number}>();
  for(let i=0;i<wanted.length;i+=100)for(const r of await db.citationsByIds(wanted.slice(i,i+100)))rows.set(r.citation_id,r);
  // same rule as /api/citations/[id]: only citations of a public document are exposed (RLS already says so; checked again, never trusted alone)
  const publicDoc=new Map<string,boolean>();
  for(const id of new Set([...rows.values()].map(r=>r.document_id)))publicDoc.set(id,(await db.documentById(id))?.permission==='public');
  for(const [cid,r] of rows)if(publicDoc.get(r.document_id)!==true)rows.delete(cid);
  const citations=links.filter(l=>rows.has(l.citation_id)).map(l=>{const r=rows.get(l.citation_id)!;return {role:l.role,citationId:r.citation_id,documentId:r.document_id,extractionId:r.extraction_id,pageNo:r.page_no};});
  return NextResponse.json({factId,concept:fact.concept,periodStart:fact.period_start,periodEnd:fact.period_end,unit:fact.unit,valueText:String(fact.value_text),citations},
   {status:200,headers:{'Cache-Control':successCacheControl(new Date())}});
 }catch(e){
  console.error('[citations] factId',e instanceof Error?e.message:e);
  return err('citations_unavailable','Citations unavailable',500);
 }
}
