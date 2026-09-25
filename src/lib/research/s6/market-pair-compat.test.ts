/** Versioned-proposal and frozen-engine compatibility replay for the two-leg market handoff.
 * Offline only: fixtures, the unreleased policy-v2 proposal and the pinned S5 0.2.0 engine.
 */
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {mapAlphaKline} from 'dsh-trade-strategy-evaluator/adapters';
import {validateMarketSnapshot,type EvaluationInput} from 'dsh-trade-strategy-evaluator/engine';
import {digest} from '../ingest/pa-v1/json.js';
import type {MarketHandoff} from './market-handoff';
import {syntheticMapping} from '../../../../scripts/s6/fixtures';
import calendar from '../../../../docs/handoffs/alpha-s4/calendar.json';

const base='docs/handoffs/alpha-s6/market-interface/';
const proposalPath='../../../../docs/handoffs/alpha-s6/market-interface/policy-v2.proposal.json';
const load=(name:string)=>JSON.parse(readFileSync(base+name+'.synthetic.json','utf8')) as MarketHandoff;
const proposal=()=>JSON.parse(readFileSync(base+'policy-v2.proposal.json','utf8')) as Record<string,unknown>;
const now='2026-01-07T00:00:00.000Z';
async function pairWith(mutate:(p:Record<string,unknown>)=>void){
 vi.resetModules();
 const p=proposal();mutate(p);
 vi.doMock(proposalPath,()=>({default:p}));
 const {validateMarketPair}=await import('./market-pair');
 return (a:MarketHandoff,b:MarketHandoff)=>validateMarketPair(JSON.stringify(a),JSON.stringify(b),now);
}
afterEach(()=>{vi.doUnmock(proposalPath);vi.resetModules();});

describe('versioned proposal gate',()=>{
 it('binds the pair verdict to the exact unreleased proposal content',async()=>{
  const check=await pairWith(()=>{});
  const result=check(load('split'),load('spy'));
  expect(result.proposed_policy_jcs_sha256).toBe(digest(proposal()));
  const annotated=await pairWith(p=>{p.note='same gates, different bytes';});
  const other=annotated(load('split'),load('spy'));
  expect(other.status).toBe('contract_valid');
  expect(other.proposed_policy_jcs_sha256).not.toBe(result.proposed_policy_jcs_sha256);
  expect(other.pair_sha256).not.toBe(result.pair_sha256);
 });
 it('a proposal marked released without a versioned engine still fails closed',async()=>{
  const check=await pairWith(p=>{p.status='released';});
  expect(()=>check(load('split'),load('spy'))).toThrow('rule_unsupported');
 });
 it('a proposal that opens real evaluation early fails closed',async()=>{
  const check=await pairWith(p=>{p.real_evaluation='open';});
  expect(()=>check(load('split'),load('spy'))).toThrow('rule_unsupported');
 });
 it('a proposal whose parent policy hash or session calendar drifted fails closed',async()=>{
  const parent=await pairWith(p=>{p.parent_market_policy_sha256='0'.repeat(64);});
  expect(()=>parent(load('split'),load('spy'))).toThrow('rule_unsupported');
  const version=await pairWith(p=>{(p.session_calendar as Record<string,string>).version='XNYS-2030-2032-frozen-2030-01-01';});
  expect(()=>version(load('split'),load('spy'))).toThrow('rule_unsupported');
  const venue=await pairWith(p=>{(p.session_calendar as Record<string,string>).calendar_mic='ARCX';});
  expect(()=>venue(load('split'),load('spy'))).toThrow('rule_unsupported');
 });
 it('widening the benchmark or target venues in the proposal does not relabel the fixtures',async()=>{
  const widened=await pairWith(p=>{p.target_listing_mics=['XNYS','ARCX'];});
  const target=load('split');target.security.listing_mic='ARCX';
  // Target may now be ARCX, but the SPY benchmark ticker rule and distinct-ticker rule still hold.
  expect(widened(target,load('spy')).status).toBe('contract_valid');
  const spy=load('spy');spy.security.ticker='IVV';
  expect(()=>widened(load('split'),spy)).toThrow('market_identity_mismatch');
 });
});

describe('frozen engine compatibility replay',()=>{
 const cal=calendar as EvaluationInput['calendar'];
 const snapshot=(security:Parameters<typeof syntheticMapping>[0])=>{
  const mapped=mapAlphaKline({...syntheticMapping(security),calendar:cal});
  if(!mapped.ok)throw new Error(mapped.error.code);
  return mapped.snapshot;
 };
 it('the pinned 0.2.0 engine accepts the XNYS synthetic leg the pair check aligns',()=>{
  expect(()=>validateMarketSnapshot(snapshot({ticker:'S6SYNTH',exchange:'XNYS',currency:'USD',synthetic:true,company_entity_id:null}),cal,now)).not.toThrow();
 });
 it('the pinned 0.2.0 adapter and engine both refuse the proposal benchmark identity SPY/ARCX',()=>{
  // The adapter is the first frozen gate: mapping stops before any snapshot exists.
  // The frozen types only spell XNYS; the cast is the point: a real ARCX listing has no typed home in 0.2.0.
  const arcx='ARCX' as unknown as 'XNYS';
  const mapped=mapAlphaKline({...syntheticMapping({ticker:'SPY',exchange:arcx,currency:'USD',synthetic:true,company_entity_id:null}),calendar:cal});
  expect(mapped.ok).toBe(false);
  if(!mapped.ok)expect(mapped.error).toMatchObject({code:'data_insufficient',reason:'market_mismatch'});
  // A snapshot relabelled after mapping is still refused by the engine itself.
  const relabelled=snapshot({ticker:'SPY',exchange:'XNYS',currency:'USD',synthetic:true,company_entity_id:null});
  (relabelled.security as {exchange:string}).exchange='ARCX';
  expect(()=>validateMarketSnapshot(relabelled,cal,now)).toThrow(expect.objectContaining({code:'data_insufficient',reason:'market_mismatch'}));
 });
 it('a contract_valid pair never claims engine compatibility or evaluation acceptance',async()=>{
  const check=await pairWith(()=>{});
  const result=check(load('split'),load('spy'));
  expect(result).toMatchObject({status:'contract_valid',engine_compatible:false,accepted_for_evaluation:false});
  expect(result.blockers).toEqual(expect.arrayContaining(['engine_policy_upgrade_required','benchmark_identity_unverified','calendar_venue_compatibility_unverified']));
 });
});

describe('leg attribution',()=>{
 it('names the failing leg so a provider can be told which bundle to fix',async()=>{
  const check=await pairWith(()=>{});
  const spy=load('spy');spy.observed_at='2027-01-01T00:00:00.000Z';
  expect(()=>check(load('split'),spy)).toThrow(expect.objectContaining({code:'future_input',leg:'benchmark'}));
  const target=load('split');target.evidence[0].sha256='0'.repeat(64);
  expect(()=>check(target,load('spy'))).toThrow(expect.objectContaining({code:'hash_mismatch',leg:'target'}));
  const same=load('spy');
  expect(()=>check(same,load('spy'))).toThrow('market_identity_mismatch');
 });
});
