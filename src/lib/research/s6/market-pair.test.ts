import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateMarketPair} from './market-pair';
import type {MarketHandoff} from './market-handoff';
const base='docs/handoffs/alpha-s6/market-interface/';
const load=(name:string)=>JSON.parse(readFileSync(base+name+'.synthetic.json','utf8')) as MarketHandoff;
const now='2026-01-07T00:00:00.000Z';
const check=(a:MarketHandoff,b:MarketHandoff)=>validateMarketPair(JSON.stringify(a),JSON.stringify(b),now);
describe('two-leg market handoff',()=>{
 it('aligns XNYS target and ARCX SPY using one session calendar without granting evaluation',()=>{
  const result=check(load('split'),load('spy'));
  expect(result.proposed_policy_status).toBe('released');expect(result.released_market_policy_version).toBe('market-policy/2.0');
  expect(result.proposed_policy_jcs_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result).toMatchObject({status:'contract_valid',aligned_session_count:2,accepted_for_evaluation:false,engine_compatible:true,target:{listing_mic:'XNYS'},benchmark:{listing_mic:'ARCX'},unavailable_sessions:[]});
 });
 it('requires SPY under ARCX, never relabels it XNYS',()=>{
  const spy=load('spy');spy.security.listing_mic='XNYS';expect(()=>check(load('split'),spy)).toThrow('market_identity_mismatch');
 });
 it('rejects an unsupported target venue despite matching dates',()=>{const target=load('split');target.security.listing_mic='XHKG';expect(()=>check(target,load('spy'))).toThrow('market_identity_mismatch');});
 it('rejects mismatched range and synthetic provenance',()=>{
  const spy=load('spy');spy.range.from='2026-01-06';spy.splits.coverage.from='2026-01-06';spy.bars.shift();expect(()=>check(load('split'),spy)).toThrow('pair_mismatch');
  const other=load('spy');other.synthetic=false;for(const e of other.evidence)e.source_url='https://example.invalid/'+e.id;expect(()=>check(load('split'),other)).toThrow('pair_mismatch');
 });
 it('does not turn a documented unavailable benchmark close into a usable pair',()=>{
  const spy=load('spy');spy.bars.pop();spy.unavailable_sessions.push({session_date:'2026-01-06',status:'no_valid_close',available_at:spy.observed_at,evidence_ref:'session_status'});
  const result=check(load('split'),spy);expect(result).toMatchObject({status:'contract_incomplete',aligned_session_count:1,unavailable_sessions:[{session_date:'2026-01-06',target:'bar',benchmark:'unavailable'}]});
 });
 it('reports an unexplained gap without silently filling it',()=>{
  const spy=load('spy');spy.bars.pop();expect(check(load('split'),spy)).toMatchObject({status:'contract_incomplete',unavailable_sessions:[{session_date:'2026-01-06',benchmark:'missing'}]});
 });
 it('binds pair digest to bundle content',()=>{
  const a=load('split'),b=load('spy'),hash=check(a,b).pair_sha256;
  b.bars[0].close=105.5;expect(check(a,b).pair_sha256).not.toBe(hash);
  expect(()=>check(b,a)).toThrow('market_identity_mismatch');
 });
});

it('does not count shared real price evidence as an independent benchmark leg',()=>{
 const a=load('split'),b=load('spy');a.synthetic=false;b.synthetic=false;
 for(const p of [a,b])for(const e of p.evidence)e.source_url='https://example.invalid/'+e.id;
 b.evidence.find(e=>e.kind==='prices')!.content=a.evidence.find(e=>e.kind==='prices')!.content;
 b.evidence.find(e=>e.kind==='prices')!.sha256=a.evidence.find(e=>e.kind==='prices')!.sha256;
 const result=check(a,b);expect(result).toMatchObject({status:'contract_incomplete',accepted_for_evaluation:false});expect(result.blockers).toContain('legs_share_price_evidence');
});

it('flags identical real OHLCV paths even when the evidence hashes differ',()=>{
 const a=load('split'),b=load('spy');a.synthetic=false;b.synthetic=false;
 for(const p of [a,b])for(const e of p.evidence)e.source_url='https://example.invalid/'+e.id;
 b.bars=structuredClone(a.bars);
 const result=check(a,b);expect(result).toMatchObject({status:'contract_incomplete',accepted_for_evaluation:false});expect(result.blockers).toContain('legs_have_identical_price_path');
});
