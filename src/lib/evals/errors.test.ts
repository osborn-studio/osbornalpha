// src/lib/evals/errors.test.ts
import {describe,expect,it} from 'vitest';
import {EvalError,exitCodeOfError,REFUSAL_CODES} from './errors';
import type {EvalErrorCode} from './errors';

const ALL:EvalErrorCode[]=['gold_invalid','gold_lock_mismatch','gold_diff_violation','code_version_missing','dirty_tree','synthetic_in_report','restricted_in_ci','kind_not_enabled','report_write_failed','store_write_failed','store_conflict','store_partial','reference_result_schema','reference_write_attempt','replay_rerecord_refused','resume_mismatch','redact_violation','manifest_invalid','expert_invalid','audit_invalid'];

describe('exitCodeOfError',()=>{
 it('has exactly 10 refusal codes',()=>{expect(REFUSAL_CODES.size).toBe(10);});
 for(const code of ALL)it(`${code} → ${REFUSAL_CODES.has(code)?2:1}`,()=>{
  expect(exitCodeOfError(new EvalError(code))).toBe(REFUSAL_CODES.has(code)?2:1);
 });
 it('every refusal code is 2 and every other code is 1',()=>{
  for(const code of ALL)expect(exitCodeOfError(new EvalError(code))).toBe(REFUSAL_CODES.has(code)?2:1);
  expect(ALL.filter(c=>REFUSAL_CODES.has(c))).toHaveLength(10);
  expect(ALL.filter(c=>!REFUSAL_CODES.has(c))).toHaveLength(10);
 });
});
describe('EvalError',()=>{
 it('defaults message to the code and detail to {}',()=>{
  const e=new EvalError('dirty_tree');
  expect(e.name).toBe('EvalError');expect(e.message).toBe('dirty_tree');expect(e.code).toBe('dirty_tree');expect(e.detail).toEqual({});
  expect(e).toBeInstanceOf(Error);
 });
 it('keeps an explicit message and detail',()=>{
  const e=new EvalError('store_conflict','boom',{run_id:'r'});
  expect(e.message).toBe('boom');expect(e.detail).toEqual({run_id:'r'});
 });
});
