import {describe,it,expect} from 'vitest';
import {createEvaluationHttpClient} from 'dsh-trade-strategy-evaluator/adapters';
import {RevocationAccessDenied} from '../revocation/error';
import {s6Http} from './http';
const owner='10000000-0000-4000-8000-000000000001';
const denied=(code:string)=>Object.assign(new Error('synthetic SQL and private detail must not escape'),{code});
const cases:[string,Error,number,string,string][]=[
 ['direct source error',denied('source_unavailable'),422,'source_unavailable','source_unavailable'],
 ['stale',new RevocationAccessDenied('revocation_stale'),503,'source_unavailable','revocation_check_unavailable'],
 ['revoked',new RevocationAccessDenied('binding_revoked'),403,'policy_blocked','revocation_access_denied'],
 ['grant expired',new RevocationAccessDenied('grant_expired'),403,'policy_blocked','revocation_access_denied'],
 ['transaction invalid',new RevocationAccessDenied('transaction_changed'),500,'internal_error','internal_error'],
 ['candidate invalid',denied('invalid_revocation_candidate'),422,'invalid_schema','invalid_revocation_candidate'],
 ['export ahead',denied('export_watermark_ahead'),503,'source_unavailable','export_watermark_ahead'],
 ['duplicate key',denied('duplicate_key'),422,'invalid_schema','duplicate_key'],
 ['withdrawn',denied('source_withdrawn'),403,'policy_blocked','source_withdrawn'],
 ['version mismatch',denied('source_version_conflict'),409,'source_version_conflict','source_version_conflict'],
 ['unknown',denied('unexpected_database_error'),500,'internal_error','internal_error'],
 ...['transaction_not_clean','transaction_isolation','explicit_transaction_required'].map(cause=>[cause,new RevocationAccessDenied(cause),500,'internal_error','internal_error'] as [string,Error,number,string,string]),
 ['retained tombstone',new RevocationAccessDenied('grant_version_revoked'),403,'policy_blocked','revocation_access_denied'],
 ['unknown cause',new RevocationAccessDenied('synthetic_unknown'),503,'source_unavailable','revocation_check_unavailable'],
 ['nonstring cause',new RevocationAccessDenied({private:'must not serialize'}),503,'source_unavailable','revocation_check_unavailable'],
];
describe('RPC1.0 error compatibility with the pinned trade client',()=>{
 it.each(cases)('%s preserves status, retry classification and browser vocabulary',async(_label,error,status,rpcCode,browserCode)=>{
  const work=async()=>{throw error;};
  const response=await s6Http(work,'evaluator-rpc/1.0');
  expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({error:{code:rpcCode}});
  const browser=await s6Http(work);expect(browser.status).toBe(status);expect(await browser.json()).toEqual({error:{code:browserCode}});
  // Exercise the actual dependency allowlist, not a duplicate maintained by Alpha.
  const client=createEvaluationHttpClient({baseUrl:'http://127.0.0.1:3199',ownerScope:{user_id:owner,workspace_id:null},tokenProvider:async()=>owner+'.'+'1'.repeat(64),fetchImpl:async()=>s6Http(work,'evaluator-rpc/1.0')});
  await expect(client.readObservation(owner)).rejects.toMatchObject({code:rpcCode,status,retryable:status>=500});
 });
 // This tests the revocation brand only; legacy business errors intentionally use .code.
 it('does not infer branded revocation from message and cause alone',async()=>{
  const response=await s6Http(async()=>{throw Object.assign(new Error('revocation_access_denied'),{cause:'binding_revoked'});},'evaluator-rpc/1.0');
  expect(response.status).toBe(500);expect(await response.json()).toEqual({error:{code:'internal_error'}});
 });
});
