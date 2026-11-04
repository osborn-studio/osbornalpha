import {NextResponse} from 'next/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTableClient} from '@/lib/db/table-client';
import {resolveIssuer} from '@/lib/entities/resolve';

export const dynamic='force-dynamic';
const SAFE=/^[A-Za-z0-9.\-]{1,24}$/;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status});

export async function GET(req:Request){
 const url=new URL(req.url);
 const pick=(k:string)=>{const v=url.searchParams.get(k);return v&&SAFE.test(v)?v:undefined;};
 const q={ticker:pick('ticker'),isin:pick('isin'),cik:pick('cik'),lei:pick('lei')};
 if(!q.ticker&&!q.isin&&!q.cik&&!q.lei)return err('empty_query','ticker, isin, cik or lei required',400);
 try{
  // Public reference data (public-read RLS); the service client only reads here.
  const result=await resolveIssuer(supabaseTableClient(getAdminSupabase()),q,{includeExpired:url.searchParams.get('includeExpired')==='1'});
  if(!result)return err('not_found','no issuer',404);
  return NextResponse.json(result,{headers:{'Cache-Control':'public, s-maxage=86400, stale-while-revalidate=3600'}});
 }catch(e){
  const m=e instanceof Error?e.message:'';
  if(m.startsWith('invalid_identifier:')||m==='empty_query')return err(m,'invalid query',400);
  throw e;
 }
}
