// src/app/api/admin/documents/candidates/regenerate/route.ts
// POST regeneration request (spec §7.3, §9): {filter:{source?, issuer_id?, document_id?}} →
// requestCandidatesRegen (current extraction versions with candidates_role <> 'none' and a
// finished candidates status go back to pending); the next candidates run regenerates. Audited.
import {requireAdminUser} from '@/lib/admin/auth';
import {adminFailure,auditBestEffort,json,jsonError,UUID_RE,writeGuard} from '@/lib/documents/candidates/admin-http';
import {supabaseDocumentsDb} from '@/lib/documents/db';
import type {CandidatesFilter,ListedSource} from '@/lib/documents/types';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
const SOURCES:readonly ListedSource[]=['edgar','cninfo','hkexnews'];

function parseFilter(v:unknown):CandidatesFilter|null{
 if(v===null||typeof v!=='object'||Array.isArray(v))return null;
 const out:CandidatesFilter={};
 for(const [k,x] of Object.entries(v as Record<string,unknown>)){
  if(k==='source'){if(typeof x!=='string'||!SOURCES.includes(x as ListedSource))return null;out.source=x as ListedSource;}
  else if(k==='issuer_id'){if(typeof x!=='string'||!UUID_RE.test(x))return null;out.issuer_id=x;}
  else if(k==='document_id'){if(typeof x!=='string'||!UUID_RE.test(x))return null;out.document_id=x;}
  else return null;
 }
 return out;
}

export async function POST(request:Request){
 try{
  const user=await requireAdminUser();
  const guard=writeGuard(request);if(guard)return guard;
  const body:unknown=await request.json().catch(()=>null);
  const filter=parseFilter((body as {filter?:unknown}|null)?.filter);
  if(filter===null)return jsonError('invalid_filter',400);
  const admin=getAdminSupabase();
  const requested=await supabaseDocumentsDb(admin).requestCandidatesRegen(filter,user.id);
  await auditBestEffort(admin,user.id,'document.candidates_regenerate',null,{filter,requested});
  return json({requested});
 }catch(e){return adminFailure(e,'admin/documents/candidates/regenerate');}
}
