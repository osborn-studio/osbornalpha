import {revocationHttpError} from '../revocation/http-error';
import {NextResponse} from 'next/server';
import {parseStrict,fail} from '../ingest/pa-v1/json.js';
import {ResearchForbidden} from '../store';
export async function bodyText(req:Request) {
  if(!req.body)fail('invalid_schema');
  const reader=req.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();fail('input_limit');}chunks.push(value);}}
  finally{reader.releaseLock();}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw fail('invalid_schema');}
}
export async function bodyJson(req:Request){return parseStrict(await bodyText(req));}
export async function s4Http(fn:()=>Promise<unknown>) {
  try{return NextResponse.json(await fn(),{headers:{'Cache-Control':'no-store'}});}
  catch(e){
  const revocation=revocationHttpError(e);
  if(revocation)return Response.json({error:{code:revocation.code}},{status:revocation.status,headers:{'Cache-Control':'no-store'}});
    let code=(e as {code?:string}).code||'internal_error';
    if(e instanceof ResearchForbidden)code='scope_denied';
    if(e instanceof Error&&e.message==='not authenticated')code='not_authenticated';
    const status=code==='not_authenticated'?401:code==='not_configured'?503:
      ['scope_denied','policy_blocked','anchor_integrity_failed','source_withdrawn','exposure_required'].includes(code)?403:
      ['idempotency_conflict','revision_conflict','source_version_conflict','observation_scope_conflict'].includes(code)?409:
      code==='input_limit'?413:['invalid_schema','future_input','invalid_timeline','hash_mismatch','fixture_not_operational','duplicate_key','security_unresolved','data_insufficient','source_unavailable'].includes(code)?422:500;
    if(status===500)code='internal_error';
    return NextResponse.json({error:{code}},{status,headers:{'Cache-Control':'no-store'}});
  }
}
