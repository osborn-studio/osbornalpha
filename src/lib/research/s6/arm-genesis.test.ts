import {describe,expect,it} from 'vitest';
import {canonicalize,digest} from '../ingest/pa-v1/json.js';
import {ARM_COHORT_PROTOCOL,parseArmGenesis,verifyArmGenesis} from './arm-genesis';
import {ARM_PAYOFF_PROTOCOL} from './arm-payoff';
import {ARM_SOURCE_BUNDLE_PROTOCOL} from './arm-source-bundle';
import vectors from './__fixtures__/arm-genesis-v2.json';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,h=(n:number)=>n.toString(16).padStart(64,'0');
const grant=(n:number,purpose:string,recipient='alpha-local')=>({grant_id:id(n),grant_version:1,grant_hash:h(n),mapping_hash:h(n+10),purpose,recipient});
// Synthetic origin shapes; no actual user confirmations or approved source records.
function fixture(external=false){return {protocol:ARM_COHORT_PROTOCOL,owner_id:id(1),enrollment_id:id(2),candidate_id:id(3),thesis_id:id(4),observation_ids:{human_baseline:id(5),ai_candidate:id(6),collab:id(7)},calendar_session_ref:id(8),calendar_hash:h(1),security_identity_hash:h(2),evaluation_policy_hash:h(3),payoff_protocol:ARM_PAYOFF_PROTOCOL,created_at:'2026-10-06T13:24:00.000Z',confirmation_deadline:'2026-10-07T13:24:00.000Z',session_anchor:'2026-10-08T13:24:00.000Z',creator_actor_ref:id(9),authorization_ref:id(10),authorization_hash:h(4),source_bundle:{protocol:ARM_SOURCE_BUNDLE_PROTOCOL,source_reference:{feed_id:id(11),source_id:id(12),source_version_hash:h(5)},generation_mode:external?'external':'local',processor:external?'deepseek-analysis':null,purpose_map:{capture:grant(13,'alpha_arm_capture'),disclosure:grant(14,'alpha_arm_disclosure'),processing:external?grant(15,'external_model_processing','deepseek-analysis'):null}}};}
describe('inactive exact v2 genesis integrity, no real human/source authority',()=>{
 it('binds complete frozen local/external payload and preserves canonical JSON roundtrip',()=>{
  for(const external of [false,true]){const f=fixture(external),expected=digest(f),result=verifyArmGenesis(f,expected);expect(result.genesis_hash).toBe(expected);expect(result.integrity_only).toBe(true);expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.payload)).toBe(true);expect(Object.isFrozen(result.payload.observation_ids)).toBe(true);expect(Object.isFrozen(result.payload.source_bundle.purpose_map)).toBe(true);expect(verifyArmGenesis(JSON.parse(JSON.stringify(result.payload)),expected)).toEqual(result);
   f.observation_ids.collab=id(99);f.source_bundle.purpose_map.capture.grant_version=2;expect(result.payload.observation_ids.collab).toBe(id(7));expect(result.payload.source_bundle.purpose_map.capture.grant_version).toBe(1);
  }
 });
 it('binds every scalar, observation and full source-mode/bundle change to independently fixed digest',()=>{
  const f=fixture(),expected=digest(f);
  for(const key of ['owner_id','enrollment_id','candidate_id','thesis_id','calendar_session_ref','creator_actor_ref','authorization_ref'])expect(()=>verifyArmGenesis({...f,[key]:id(100)},expected)).toThrow('hash_mismatch');
  for(const key of ['calendar_hash','security_identity_hash','evaluation_policy_hash','authorization_hash'])expect(()=>verifyArmGenesis({...f,[key]:h(100)},expected)).toThrow('hash_mismatch');
  for(const key of ['created_at','confirmation_deadline','session_anchor'] as const)expect(()=>verifyArmGenesis({...f,[key]:new Date(Date.parse(f[key])+1).toISOString()},expected)).toThrow('hash_mismatch');
  for(const arm of ['human_baseline','ai_candidate','collab'])expect(()=>verifyArmGenesis({...f,observation_ids:{...f.observation_ids,[arm]:id(100)}},expected)).toThrow('hash_mismatch');
  expect(()=>verifyArmGenesis(fixture(true),expected)).toThrow('hash_mismatch');
  const changed=fixture();changed.source_bundle.purpose_map.disclosure.mapping_hash=h(100);expect(()=>verifyArmGenesis(changed,expected)).toThrow('hash_mismatch');
  expect(()=>verifyArmGenesis(f,h(100))).toThrow('hash_mismatch');for(const wrong of [null,{},'',h(100).toUpperCase().replace('6','A')])expect(()=>verifyArmGenesis(f,wrong)).toThrow('invalid_schema');
 });
 it('refuses version projection, wrapper fields, malformed/missing scalars and aliased observations',()=>{
  const f=fixture();for(const key of Object.keys(f)){const missing={...f} as Record<string,unknown>;delete missing[key];expect(()=>parseArmGenesis(missing)).toThrow('invalid_schema');}
  for(const patch of [{protocol:'alpha-arm-plan/1.0'},{payoff_protocol:'legacy-adopt-reject'},{recorded_at:f.created_at},{genesis_hash:digest(f)},{owner_id:null},{calendar_hash:'x'},{creator_actor_ref:{toString(){throw Error('trap');}}},{authorization_hash:null}])expect(()=>parseArmGenesis({...f,...patch})).toThrow('invalid_schema');
  for(const arm of ['human_baseline','ai_candidate','collab']){const missing={...f.observation_ids} as Record<string,unknown>;delete missing[arm];expect(()=>parseArmGenesis({...f,observation_ids:missing})).toThrow('invalid_schema');}
  expect(()=>parseArmGenesis({...f,observation_ids:{...f.observation_ids,collab:f.observation_ids.human_baseline}})).toThrow('invalid_schema');
 });
 it('refuses every cross-object identity alias while allowing owner actor principal equality',()=>{
  const paths=[['enrollment_id'],['candidate_id'],['thesis_id'],['calendar_session_ref'],['authorization_ref'],['observation_ids','human_baseline'],['observation_ids','ai_candidate'],['observation_ids','collab'],['source_bundle','source_reference','feed_id'],['source_bundle','source_reference','source_id'],['source_bundle','purpose_map','capture','grant_id'],['source_bundle','purpose_map','disclosure','grant_id'],['source_bundle','purpose_map','processing','grant_id']];
  const get=(v:unknown,path:string[]):unknown=>path.reduce((o,k)=>(o as Record<string,unknown>)[k],v);
  for(let a=0;a<paths.length;a++)for(let b=a+1;b<paths.length;b++){const f=fixture(true);const parent=get(f,paths[b].slice(0,-1)) as Record<string,unknown>;parent[paths[b].at(-1)!]=get(f,paths[a]);expect(()=>parseArmGenesis(f)).toThrow('invalid_schema');}
  const f=fixture();f.creator_actor_ref=f.owner_id;expect(parseArmGenesis(f).creator_actor_ref).toBe(f.owner_id);
 });
 it('pins canonical bytes and independently computed known-answer genesis hashes',()=>{
  for(const [name,external] of [['local',false],['external',true]] as const){const f=fixture(external),v=vectors[name];expect(canonicalize(f)).toBe(v.canonical);expect(verifyArmGenesis(f,v.genesis_hash).genesis_hash).toBe(v.genesis_hash);}
  // Genesis identifier fields are ASCII-only. Unicode is pinned as a separate
  // pa-jcs/1.0 profile vector, not invented as an accepted processor/source ID.
  const unicode={z:'雪',a:'é\n"'};expect(canonicalize(unicode)).toBe(vectors.unicode_profile.canonical);expect(digest(unicode)).toBe(vectors.unicode_profile.hash);
  const f=fixture(true);f.source_bundle.processor='模型';f.source_bundle.purpose_map.processing!.recipient='模型';expect(()=>parseArmGenesis(f)).toThrow('invalid_schema');
 });
 it('refuses timestamp boundary/reordering/normalization without consulting current clock',()=>{
  const f=fixture();for(const patch of [{confirmation_deadline:f.created_at},{session_anchor:f.confirmation_deadline},{created_at:f.session_anchor},{created_at:'2026-02-30T13:24:00.000Z'},{created_at:'2026-10-06T13:24:00Z'},{created_at:'2026-10-06T13:24:00.000+00:00'}])expect(()=>parseArmGenesis({...f,...patch})).toThrow('invalid_schema');
  const future={...f,created_at:'2099-01-01T00:00:00.000Z',confirmation_deadline:'2099-01-02T00:00:00.000Z',session_anchor:'2099-01-03T00:00:00.000Z'};expect(parseArmGenesis(future).created_at).toBe(future.created_at); // Structural validity does NOT prove server time or admission.
 });
 it('refuses Proxy/accessor/symbol/inherited fields without traps and canonicalizes key order',()=>{
  let calls=0;const proxy=new Proxy({},{ownKeys(){calls++;throw Error('trap');},getPrototypeOf(){calls++;throw Error('trap');}}),f=fixture();
  for(const v of [proxy,[],Object.create(f),{...f,[Symbol('extra')]:true}])expect(()=>parseArmGenesis(v)).toThrow('invalid_schema');
  for(const key of ['observation_ids','source_bundle'])expect(()=>parseArmGenesis({...f,[key]:proxy})).toThrow('invalid_schema');
  Object.defineProperty(f,'authorization_ref',{enumerable:true,get(){calls++;return id(10);}});expect(()=>parseArmGenesis(f)).toThrow('invalid_schema');expect(calls).toBe(0);
  const original=fixture(),reversed=Object.fromEntries(Object.entries(original).reverse());expect(verifyArmGenesis(reversed,digest(original)).genesis_hash).toBe(digest(original));
 });
});
