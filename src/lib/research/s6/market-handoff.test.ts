import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateMarketHandoff,marketHandoffSchema,type MarketHandoff} from './market-handoff';
import {sha256} from '../ingest/pa-v1/json.js';
const folder='docs/handoffs/alpha-s6/market-interface/';
const fixture=()=>JSON.parse(readFileSync(folder+'split.synthetic.json','utf8')) as MarketHandoff;
const now='2026-01-07T00:00:00.000Z';
const check=(p:MarketHandoff)=>validateMarketHandoff(JSON.stringify(p),now);
describe('offline market provider handoff',()=>{
 it('validates forward split but never grants evaluation or verified status',()=>{
  expect(check(fixture()).blockers).toEqual(expect.arrayContaining(['availability_timestamps_unverified','synthetic_flag_unverified']));
  expect(check(fixture())).toMatchObject({status:'contract_valid',accepted_for_evaluation:false,engine_compatible:false,readiness:'provider_claims_unverified',missing_sessions:[]});
 });
 it('exports the exact executable schema',()=>expect(JSON.parse(readFileSync(folder+'schema.json','utf8'))).toEqual(marketHandoffSchema));
 it('validates reverse splits using price multiplier old/new',()=>{const p=fixture();p.splits.events[0].new_shares=1;p.splits.events[0].old_shares=10;p.bars[0].split_factor=10;expect(check(p).status).toBe('contract_valid');});
 it('reports missing sessions without zero filling',()=>{const p=fixture();p.bars.pop();expect(check(p)).toMatchObject({status:'contract_incomplete',missing_sessions:['2026-01-06'],bar_count:1});});
 it('requires evidence for unavailable sessions',()=>{const p=fixture();p.bars.pop();p.unavailable_sessions.push({session_date:'2026-01-06',status:'suspended',available_at:p.observed_at,evidence_ref:'session_status'});expect(check(p).status).toBe('contract_valid');p.unavailable_sessions[0].evidence_ref='prices';expect(()=>check(p)).toThrow('data_insufficient');});
 it('does not equate listing MIC with calendar or authorize a real provider assertion',()=>{const p=fixture();p.synthetic=false;p.security.ticker='SPY';p.security.listing_mic='ARCX';for(const e of p.evidence)e.source_url='https://example.invalid/'+e.id;expect(check(p)).toMatchObject({engine_compatible:false,accepted_for_evaluation:false,security:{listing_mic:'ARCX'}});});
 it.each([
  ['pre-close price evidence',(p:MarketHandoff)=>{p.evidence[0].received_at='2026-01-05T22:00:00.000Z';},'invalid_timeline'],
  ['future session range',(p:MarketHandoff)=>{p.range.to='2026-01-07';p.splits.basis_date='2026-01-07';p.splits.coverage.to='2026-01-07';},'future_input'],
  ['URL query secret',(p:MarketHandoff)=>{p.evidence[0].source_url='https://example.invalid/?apikey=secret';},'invalid_schema'],
  ['URL fragment secret',(p:MarketHandoff)=>{p.evidence[0].source_url='https://example.invalid/#secret';},'invalid_schema'],
  ['no-op split',(p:MarketHandoff)=>{p.splits.events[0].new_shares=1;},'invalid_schema'],
  ['wrong hash',(p:MarketHandoff)=>{p.evidence[0].content+='x';},'hash_mismatch'],
  ['duplicate evidence',(p:MarketHandoff)=>{p.evidence.push(p.evidence[0]);},'invalid_schema'],
  ['future observation',(p:MarketHandoff)=>{p.observed_at='2026-01-08T00:00:00.000Z';},'future_input'],
  ['invented OHLC bounds',(p:MarketHandoff)=>{p.bars[0].low=101;},'invalid_schema'],
  ['weekend bar',(p:MarketHandoff)=>{p.bars[0].session_date='2026-01-04';},'invalid_schema'],
  ['duplicate bar',(p:MarketHandoff)=>{p.bars.push(p.bars[1]);},'invalid_schema'],
  ['missing identity',(p:MarketHandoff)=>{p.security.identity_ref='unknown';},'data_insufficient'],
  ['wrong factor',(p:MarketHandoff)=>{p.bars[0].split_factor=1;},'split_factor_mismatch'],
  ['credentials in URL',(p:MarketHandoff)=>{p.evidence[0].source_url='https://secret:secret@example.invalid';},'invalid_schema'],
  ['real synthetic URL',(p:MarketHandoff)=>{p.synthetic=false;},'invalid_schema'],
  ['bar before close',(p:MarketHandoff)=>{p.bars[1].available_at='2026-01-06T20:00:00.000Z';},'invalid_timeline'],
  ['invalid date',(p:MarketHandoff)=>{p.range.from='2026-02-30';},'invalid_schema'],
  ['overlapping unavailable',(p:MarketHandoff)=>{p.unavailable_sessions.push({session_date:'2026-01-05',status:'suspended',available_at:p.observed_at,evidence_ref:'session_status'});},'invalid_schema'],
  ['future evidence',(p:MarketHandoff)=>{p.evidence[0].received_at=now;},'future_input'],
 ] as const)('rejects %s',(_,mutate,code)=>{const p=fixture();mutate(p);expect(()=>check(p)).toThrow(code);});
 it('does not accept a fresh split event behind an older per-bar reference',()=>{
  const p=fixture();const e={...p.evidence[1],id:'late-split',received_at:'2026-01-06T23:00:00.000Z'};p.evidence.push(e);p.observed_at=e.received_at;p.splits.events[0].evidence_ref=e.id;expect(()=>check(p)).toThrow('invalid_timeline');
 });
 it('requires availability after coverage proof retrieval',()=>{const p=fixture();p.evidence.push({...p.evidence[1],id:'late-coverage',received_at:'2026-01-06T23:00:00.000Z'});p.observed_at='2026-01-06T23:00:00.000Z';p.splits.coverage.evidence_ref='late-coverage';expect(()=>check(p)).toThrow('invalid_timeline');});
 it('reports partial split coverage as incomplete',()=>{const p=fixture();p.splits.coverage.complete=false;expect(check(p).status).toBe('contract_incomplete');});
 it('rejects self-issued verified fields and unknown versions',()=>{const p=fixture();expect(()=>validateMarketHandoff(JSON.stringify({...p,verified:true}),now)).toThrow('invalid_schema');expect(()=>validateMarketHandoff(JSON.stringify({...p,schema_version:'2.0'}),now)).toThrow('invalid_schema');});
 it('rejects duplicate keys before JSON decoding can erase them',()=>expect(()=>validateMarketHandoff('{"a":1,"a":2}',now)).toThrow('duplicate_key'));
 it('retains raw and canonical hashes separately',()=>{const raw=JSON.stringify(fixture(),null,2);expect(validateMarketHandoff(raw,now).raw_sha256).toBe(sha256(raw));expect(validateMarketHandoff(raw,now).bundle_sha256).toBe(check(fixture()).bundle_sha256);});
 it('bounds input size and rejects malformed Unicode',()=>{expect(()=>validateMarketHandoff(' '.repeat(2*1024*1024+1),now)).toThrow('input_limit');expect(()=>validateMarketHandoff(Buffer.from([0xff]),now)).toThrow('invalid_schema');});
});
