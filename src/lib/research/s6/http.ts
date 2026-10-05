import {revocationHttpError} from '../revocation/http-error';
import {parseStrict} from 'dsh-trade-strategy-evaluator/engine';
import {fail} from '../ingest/pa-v1/json.js';
import {bodyText} from '../s4/http';
import {ResearchForbidden} from '../store';
import {createRegisteredEvaluatorStore,type Commit} from './store';

const rpcRevocationCodes:Record<NonNullable<ReturnType<typeof revocationHttpError>>['code'],string>={
 revocation_access_denied:'policy_blocked',revocation_check_unavailable:'source_unavailable',internal_error:'internal_error',
};

export async function s6Http(fn:()=>Promise<unknown>,dialect?:'evaluator-rpc/1.0'){
 try{return Response.json(await fn(),{headers:{'Cache-Control':'no-store'}});}
 catch(e){
  const revocation=revocationHttpError(e);
  // RPC 1.0 clients have a fixed code allowlist; preserve actionable semantics.
  if(revocation)return Response.json({error:{code:dialect?rpcRevocationCodes[revocation.code]:revocation.code}},{status:revocation.status,headers:{'Cache-Control':'no-store'}});
  let code=(e as {code?:string}|null)?.code||'internal_error';
  if(e instanceof ResearchForbidden)code='scope_denied';
  if(e instanceof Error&&e.message==='not authenticated')code='not_authenticated';
  const status=code==='not_authenticated'?401:code==='not_found'?404:['not_configured','export_watermark_ahead'].includes(code)?503:
   ['scope_denied','policy_blocked','anchor_integrity_failed','source_withdrawn','exposure_required'].includes(code)?403:
   ['idempotency_conflict','revision_conflict','source_version_conflict','observation_scope_conflict'].includes(code)?409:
   code==='input_limit'?413:['invalid_revocation_candidate','invalid_schema','unsupported_version','hash_mismatch','future_input','invalid_timeline','data_insufficient','rule_unsupported','source_unavailable','duplicate_key','security_unresolved'].includes(code)?422:500;
  if(status===500)code='internal_error';
  else if(dialect){
   if(code==='invalid_revocation_candidate'||code==='duplicate_key')code='invalid_schema';
   else if(code==='export_watermark_ahead')code='source_unavailable';
   else if(code==='source_withdrawn')code='policy_blocked';
  }
  return Response.json({error:{code}},{status,headers:{'Cache-Control':'no-store'}});
 }
}
/** Same handler used by Next and actual loopback HTTP integration tests. */
export async function evaluatorRpc(req:Request,operation:'observation'|'market'|'commit',id?:string){
 return s6Http(async()=>{
  const configured=process.env.ALPHA_S4_ORIGIN;
  if(!configured)fail('not_configured');
  const origin=new URL(configured!),url=new URL(req.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||url.origin!==origin.origin||req.headers.get('host')!==origin.host||req.headers.get('origin')||req.headers.get('sec-fetch-site')==='cross-site')fail('scope_denied');
  if(req.headers.get('x-evaluator-protocol')!=='evaluator-rpc/1.0')fail('unsupported_version');
  const match=/^Bearer ([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{64})$/.exec(req.headers.get('authorization')||'');
  if(!match)fail('not_authenticated');
  const token=match![1],store=createRegisteredEvaluatorStore({userId:token.split('.')[0],kind:'agent'},token);
  if(operation==='observation')return store.readObservation(id!);
  if(operation==='market')return store.readMarketSnapshot(id!);
  const body=parseStrict(await bodyText(req)) as Commit;
  if(req.headers.get('idempotency-key')!==body.idempotency_key)fail('invalid_schema');
  return store.commitEvaluationResult(body);
 },'evaluator-rpc/1.0');
}
