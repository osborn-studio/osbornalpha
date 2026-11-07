// src/lib/judgments/canonical.test.ts
// canonical.ts wraps pa-v1/json.js unchanged (RFC 8785) and adds inputsHash (spec §3.5): free of input
// order, sensitive to every kind/ref/hash; jsonClean drops undefined members the way JSON storage does.
// errors.ts: the code table covers spec §13 plus the plan's codes.
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {canonicalize as jcs,digest as jcsDigest} from '../research/ingest/pa-v1/json.js';
import {canonicalize,digest,inputsHash,jsonClean,sha256} from './canonical';
import {JUDGMENT_ERROR_CODES,JudgmentError,isJudgmentError} from './errors';

const obs=(series:string,hash='a'.repeat(64))=>({kind:'macro_observation' as const,ref:{series_id:series,period_end:'2026-01-31',vintage_id:'v1'},hash});

describe('canonical',()=>{
 it('is the pa-v1 RFC 8785 implementation',()=>{
  const v={b:[1,'x',null,true],a:{d:0.1,c:'中'}};
  expect(canonicalize(v)).toBe(jcs(v));
  expect(canonicalize(v)).toBe('{"a":{"c":"中","d":0.1},"b":[1,"x",null,true]}');
  expect(digest(v)).toBe(jcsDigest(v));
  expect(sha256('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  expect(()=>canonicalize({x:undefined})).toThrow('invalid_schema');
 });
 it('jsonClean drops undefined object members recursively and keeps everything else',()=>{
  expect(jsonClean({a:1,b:undefined,c:{d:undefined,e:[1,{f:undefined,g:null}]}})).toEqual({a:1,c:{e:[1,{g:null}]}});
  expect(digest(jsonClean({a:1,b:undefined}))).toBe(digest({a:1}));
  expect(jsonClean(null)).toBeNull();
  expect(jsonClean('x')).toBe('x');
 });
 it('inputsHash ignores input order and changes with any kind, ref or hash',()=>{
  const a=obs('CPI'),b=obs('GDP'),c={kind:'financial_fact' as const,ref:{fact_id:'f1'},hash:'b'.repeat(64)};
  const h=inputsHash([a,b,c]);
  expect(h).toMatch(/^[0-9a-f]{64}$/);
  expect(inputsHash([c,b,a])).toBe(h);
  expect(inputsHash([b,c,a])).toBe(h);
  expect(inputsHash([a,b,{...c,hash:'c'.repeat(64)}])).not.toBe(h);
  expect(inputsHash([a,b,{...c,ref:{fact_id:'f2'}}])).not.toBe(h);
  expect(inputsHash([a,b,{...c,kind:'financial_metric' as const}])).not.toBe(h);
  expect(inputsHash([a,obs('GDP','d'.repeat(64)),c])).not.toBe(h);
  expect(inputsHash([])).toBe(digest([]));
  expect(inputsHash([a])).toBe(digest([['macro_observation',a.ref,a.hash]]));
 });
 it('inputsHash is order-free even for repeated (kind, ref) pairs and canonical in ref key order',()=>{
  const x=obs('CPI','1'.repeat(64)),y=obs('CPI','2'.repeat(64));
  expect(inputsHash([x,y])).toBe(inputsHash([y,x]));
  expect(inputsHash([{kind:'macro_observation',ref:{vintage_id:'v1',period_end:'2026-01-31',series_id:'CPI'},hash:'a'.repeat(64)}])).toBe(inputsHash([obs('CPI')]));
 });
});

describe('errors',()=>{
 it('covers every spec §13 code and every plan code',()=>{
  const spec13=['methodology_unavailable','subject_missing','subject_inactive','subject_type_not_public','input_not_allowed','input_snapshot_mismatch','input_not_public','input_origin_unknown','lease_lost','stale_revision','request_key_conflict','job_state_conflict','formula_hash_drift','lookahead','idempotency_conflict','invalid_claim','invalid_condition','code_version_missing','input_hash_mismatch','invalid_parameter','unknown_judgment','unknown_methodology','settlement_sequence','resolution_not_applicable'];
  const plan=['unsupported_formula_version','metric_not_reproducible','market_unsupported','target_unresolvable','macro_unavailable','read_truncated','methodology_mismatch','settle_window_mismatch','duplicate_key','item_not_open','unknown',
   'input_unavailable','snapshot_unclassified','binding_not_referenced','override_mismatch'];   // integrator (D5): every code a later task throws
  for(const c of [...spec13,...plan])expect(JUDGMENT_ERROR_CODES).toContain(c);
  expect(new Set(JUDGMENT_ERROR_CODES).size).toBe(JUDGMENT_ERROR_CODES.length);
 });
 it('carries code, message and detail; isJudgmentError narrows by code',()=>{
  const e=new JudgmentError('lookahead','late input',{input:0});
  expect(e).toBeInstanceOf(Error);expect(e.name).toBe('JudgmentError');
  expect(e.code).toBe('lookahead');expect(e.message).toBe('late input');expect(e.detail).toEqual({input:0});
  expect(new JudgmentError('unknown').message).toBe('unknown');
  expect(isJudgmentError(e)).toBe(true);expect(isJudgmentError(e,'lookahead')).toBe(true);
  expect(isJudgmentError(e,'lease_lost')).toBe(false);expect(isJudgmentError(new Error('lookahead'))).toBe(false);
 });
});
