import {RevocationAccessDenied} from './error';
import {ResearchForbidden} from '../store';
import {describe,it,expect} from 'vitest';
import {s4Http} from '../s4/http';
import {s6Http} from '../s6/http';
import {fail} from '../ingest/pa-v1/json.js';
for(const [name,http] of [['S4',s4Http],['S6',s6Http]] as const){
 describe(name+' revocation response contract',()=>{
  for(const cause of ['binding_revoked','grant_expired','binding_missing','grant_config_invalid','grant_version_revoked','revocation_stale','mapping_mismatch','validation_or_database','explicit_transaction_required','SQL detail synthetic-secret']){
   it('sanitizes '+cause,async()=>{
    const response=await http(async()=>{throw new RevocationAccessDenied(cause);});
    const denied=['binding_revoked','grant_expired','grant_version_revoked'].includes(cause);
    const bug=cause==='explicit_transaction_required';
    expect(response.status).toBe(bug?500:denied?403:503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({error:{code:bug?'internal_error':denied?'revocation_access_denied':'revocation_check_unavailable'}});
   });
  }
  it('preserves legacy statuses and ignores message collisions',async()=>{
   for(const [code,status] of [['not_authenticated',401],['scope_denied',403],['not_configured',503],['input_limit',413],['invalid_schema',422],['not_found',name==='S6'?404:500],['unsupported_version',name==='S6'?422:500]] as const){
    const response=await http(async()=>fail(code));expect(response.status).toBe(status);
    expect(await response.json()).toEqual({error:{code:status===500?'internal_error':code}});
   }
   const forbidden=await http(async()=>{throw new ResearchForbidden();});expect(forbidden.status).toBe(403);
   const collision=await http(async()=>{throw new Error('revocation_access_denied');});expect(collision.status).toBe(500);
   for(const cause of [null,{},undefined]){
    const response=await http(async()=>{throw new RevocationAccessDenied(cause);});expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error:{code:'revocation_check_unavailable'}});
   }
  });
  it('preserves existing business and unknown error handling',async()=>{
   const conflict=await http(async()=>fail('revision_conflict'));
   expect(conflict.status).toBe(409);expect(await conflict.json()).toEqual({error:{code:'revision_conflict'}});
   const unknown=await http(async()=>{throw new Error('private SQL connection text');});
   expect(unknown.status).toBe(500);expect(await unknown.json()).toEqual({error:{code:'internal_error'}});
  });
 });
}

describe('S4 registered import error contract',()=>{
 for(const [code,status] of [['invalid_revocation_candidate',422],['export_watermark_ahead',503]] as const){
  it(code,async()=>{
   const response=await s4Http(async()=>fail(code));
   expect(response.status).toBe(status);
   expect(response.headers.get('cache-control')).toBe('no-store');
   expect(response.headers.get('retry-after')).toBeNull();
   expect(await response.json()).toEqual({error:{code}});
   const collision=await s4Http(async()=>{throw new Error(code);});
   expect(collision.status).toBe(500);
   expect(await collision.json()).toEqual({error:{code:'internal_error'}});
  });
 }
});
for(const [name,http] of [['S4',s4Http],['S6',s6Http]] as const){
 for(const value of [null,undefined,'private database text',123]){
  it(name+' sanitizes non-Error throws '+String(value),async()=>{
   const response=await http(async()=>{throw value;});
   expect(response.status).toBe(500);
   expect(response.headers.get('cache-control')).toBe('no-store');
   expect(await response.json()).toEqual({error:{code:'internal_error'}});
  });
 }
}
