import {describe,it,expect} from 'vitest';
import {publicWorkErrorCode} from './work-error';
import {fail} from '../ingest/pa-v1/json.js';
import {MarketPolicyError} from '../market-policy';

describe('publicWorkErrorCode',()=>{
 it('keeps the fail() convention: message equals code and a recovery string',()=>{
  let error:unknown;try{fail('idempotency_conflict');}catch(e){error=e;}
  expect(publicWorkErrorCode(error)).toBe('idempotency_conflict');
 });
 it('recognizes MarketPolicyError and preserves its public code',()=>{
  expect(publicWorkErrorCode(new MarketPolicyError('invalid_timestamp'))).toBe('invalid_schema');
  expect(publicWorkErrorCode(new MarketPolicyError('calendar_not_frozen'))).toBe('data_insufficient');
 });
 it('rejects everything else so unknown failures stay sanitized',()=>{
  expect(publicWorkErrorCode(new Error('invalid_schema'))).toBeNull();
  expect(publicWorkErrorCode(Object.assign(new Error('boom'),{code:'invalid_schema',recovery:'x'}))).toBeNull();
  expect(publicWorkErrorCode(Object.assign(new Error('Bad Code'),{code:'Bad Code',recovery:'x'}))).toBeNull();
  expect(publicWorkErrorCode({code:'invalid_schema',message:'invalid_schema',recovery:'x'})).toBeNull();
  expect(publicWorkErrorCode(null)).toBeNull();
 });
});
