// src/lib/judgments/job-keys.test.ts
// spec §5.5b R01: jobKey is the only constructor of judgment_job_state keys; every component is
// percent-encoded so 'v1', 'US', ':' and non-ASCII scope keys are all legal and never collide.
import {describe,expect,it} from 'vitest';
import {JudgmentError} from './errors';
import {jobKey,parseJobKey} from './job-keys';
import type {CalibrationScope} from './types';

const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof JudgmentError?e.code:'other';}};

describe('jobKey',()=>{
 it('builds the produce and calibrate keys of spec §5.5b',()=>{
  expect(jobKey('produce','macro_regime','v1')).toBe('produce:macro_regime@v1');
  expect(jobKey('calibrate','macro_regime','v1',{scope_type:'all',scope_key:''})).toBe('calibrate:macro_regime@v1:all:');
  expect(jobKey('calibrate','macro_regime','v1',{scope_type:'market',scope_key:'US'})).toBe('calibrate:macro_regime@v1:market:US');
  expect(jobKey('calibrate','x','v2',{scope_type:'subject_type',scope_key:'issuer'})).toBe('calibrate:x@v2:subject_type:issuer');
 });
 it('percent-encodes separators, % and non-ASCII in every component',()=>{
  expect(jobKey('calibrate','m','v1',{scope_type:'market',scope_key:'sw2021:2021:801010'})).toBe('calibrate:m@v1:market:sw2021%3A2021%3A801010');
  expect(jobKey('calibrate','m','v1',{scope_type:'market',scope_key:'港股'})).toBe('calibrate:m@v1:market:%E6%B8%AF%E8%82%A1');
  expect(jobKey('produce','a@b%c','v1')).toBe('produce:a%40b%25c@v1');
  expect(jobKey('calibrate_round')).toBe('calibrate_round');                               // P2-02: one global round cursor
  expect(parseJobKey('calibrate_round')).toEqual({kind:'calibrate_round'});
 });
 it('round-trips through parseJobKey and keeps distinct inputs distinct',()=>{
  const cases:{id:string;version:string;scope?:CalibrationScope}[]=[
   {id:'macro_regime',version:'v1'},{id:'macro_regime',version:'v1',scope:{scope_type:'all',scope_key:''}},{id:'m',version:'v1',scope:{scope_type:'market',scope_key:'US'}},
   {id:'m',version:'v1',scope:{scope_type:'market',scope_key:'a:b'}},{id:'m:1',version:'v1',scope:{scope_type:'market',scope_key:'b'}},{id:'m',version:'v1',scope:{scope_type:'market',scope_key:'港股'}},{id:'a@b%c',version:'v9'}];
  const keys=new Set<string>();
  for(const c of cases){
   const key=c.scope?jobKey('calibrate',c.id,c.version,c.scope):jobKey('produce',c.id,c.version);
   keys.add(key);
   expect(parseJobKey(key)).toEqual(c.scope?{kind:'calibrate',methodologyId:c.id,version:c.version,scope:c.scope}:{kind:'produce',methodologyId:c.id,version:c.version});
  }
  expect(keys.size).toBe(cases.length);
 });
 it('refuses empty components, a key on scope all, an empty key elsewhere, over-long keys and malformed input',()=>{
  expect(code(()=>jobKey('produce','','v1'))).toBe('invalid_parameter');
  expect(code(()=>jobKey('produce','m',''))).toBe('invalid_parameter');
  expect(code(()=>jobKey('calibrate','m','v1',{scope_type:'all',scope_key:'US'}))).toBe('invalid_parameter');
  expect(code(()=>jobKey('calibrate','m','v1',{scope_type:'market',scope_key:''}))).toBe('invalid_parameter');
  expect(code(()=>jobKey('calibrate','m','v1',{scope_type:'planet' as never,scope_key:'x'}))).toBe('invalid_parameter');
  expect(code(()=>jobKey('calibrate','m','v1',{scope_type:'market',scope_key:'港'.repeat(60)}))).toBe('invalid_parameter');   // 60 × 9 encoded chars > 512
  for(const k of ['produce:m','produce:m@v1:all:','calibrate:m@v1','calibrate:m@v1:all','other:m@v1','produce:m@v1%ZZ','calibrate_round:x','calibrate_round@v1'])expect({k,c:code(()=>parseJobKey(k))}).toEqual({k,c:'invalid_parameter'});
 });
});
