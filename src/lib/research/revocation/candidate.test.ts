import {describe,it,expect} from 'vitest';
import {prepareCandidate} from '../ingest/candidate';
import {randomUUID} from 'node:crypto';
import {testPack} from '../../../../scripts/s4/test-pack';
import {canonicalize,digest} from '../ingest/pa-v1/json.js';
import {prepareRevocationCandidate,type GrantReference} from './candidate';
function fixture(workspace=false){
 const actor=randomUUID(),t=testPack(actor,{scope:{user_id:randomUUID(),workspace_id:workspace?randomUUID():null}});
 const reference:GrantReference={protocol_version:'pa-grant-reference/v1',feed_id:randomUUID(),owner_scope:t.scope,
 source_id:t.sourceId,grant_id:t.config.grant.grant_id,grant_version:1,observed_at:t.version.ingested_at,revocation_seq_at_export:'0'};
 const expected={feedId:reference.feed_id,scope:structuredClone(t.scope),sourceId:reference.source_id,grantId:reference.grant_id,grantVersion:reference.grant_version};
 function encode(approve=true){t.pack.manifest.extensions['pa.revocation_reference']=reference;t.pack.files['manifest.json']=canonicalize(t.pack.manifest);if(approve)t.binding.approvedManifestHash=digest(t.pack.manifest);return JSON.stringify(t.pack);}
 return {actor,t,reference,expected,encode};
}
describe('approved candidate revocation reference',()=>{
 for(const workspace of [false,true])it(`accepts exact approved ${workspace?'workspace':'personal'} reference`,()=>{
  const f=fixture(workspace);const result=prepareRevocationCandidate(f.encode(),f.actor,f.t.binding,f.expected);
  expect(result.reference).toEqual(f.reference);expect(result.prepared.payloadHash).toBe(f.t.binding.approvedPayloadHash);
 });
 it('rejects manifest-only substitution even though payload approval is unchanged',()=>{
  const f=fixture();f.encode();const hash=f.t.binding.approvedPayloadHash;f.reference.observed_at=new Date(Date.parse(f.reference.observed_at)-1000).toISOString();
  expect(()=>prepareRevocationCandidate(f.encode(false),f.actor,f.t.binding,f.expected)).toThrow('policy_blocked');
  expect(f.t.binding.approvedPayloadHash).toBe(hash);
 });
 const mutations:Record<string,(r:GrantReference)=>void>={
  feed:r=>{r.feed_id=randomUUID();},source:r=>{r.source_id=randomUUID();},grant:r=>{r.grant_id=randomUUID();},
  owner:r=>{r.owner_scope={...r.owner_scope,user_id:randomUUID()};},workspace:r=>{r.owner_scope={...r.owner_scope,workspace_id:randomUUID()};},
  differentValidVersion:r=>{r.grant_version=2;},zeroVersion:r=>{r.grant_version=0;},fractionVersion:r=>{r.grant_version=1.5;},overflowVersion:r=>{r.grant_version=2147483648;},
  overflowSequence:r=>{r.revocation_seq_at_export='9223372036854775808';},leadingZero:r=>{r.revocation_seq_at_export='01';},
  futureObservation:r=>{r.observed_at='2099-01-01T00:00:00.000Z';},noncanonicalTime:r=>{r.observed_at='2026-01-01';},
  unknownField:r=>{Object.assign(r,{permission:'allow'});},
 };
 for(const [name,mutate] of Object.entries(mutations))it(`rejects approved but inconsistent ${name}`,()=>{
  const f=fixture();mutate(f.reference);expect(()=>prepareRevocationCandidate(f.encode(),f.actor,f.t.binding,f.expected)).toThrow('invalid_revocation_candidate');
 });
 it('rejects workspace downgrade and preserves input limits',()=>{
  const f=fixture(true);f.reference.owner_scope={...f.reference.owner_scope,workspace_id:null};expect(()=>prepareRevocationCandidate(f.encode(),f.actor,f.t.binding,f.expected)).toThrow('invalid_revocation_candidate');
  expect(()=>prepareRevocationCandidate(' '.repeat(2*1024*1024+1),f.actor,f.t.binding,f.expected)).toThrow('input_limit');
 });
 it('rejects missing extension instead of guessing a legacy grant version',()=>{
  const f=fixture();f.t.binding.approvedManifestHash=digest(f.t.pack.manifest);const raw=JSON.stringify(f.t.pack);expect(()=>prepareCandidate(raw,f.actor,f.t.binding)).not.toThrow();expect(()=>prepareRevocationCandidate(raw,f.actor,f.t.binding,f.expected)).toThrow('invalid_revocation_candidate');
 });
 it('preserves actor, revocation and payload approval gates',()=>{
  const f=fixture(),raw=f.encode();
  for(const [binding,code] of [[{...f.t.binding,revoked:true},'scope_denied'],[{...f.t.binding,approvedPayloadHash:'0'.repeat(64)},'policy_blocked'],[{...f.t.binding,localUserId:randomUUID()},'scope_denied']] as const)
   expect(()=>prepareRevocationCandidate(raw,f.actor,binding,f.expected)).toThrow(code);
 });
});
