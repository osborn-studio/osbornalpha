// src/lib/judgments/contract.test.ts
// spec §3.1–§3.4, §3.6, §6.1: subject formats and the public subset, claims per kind, horizon bounds,
// Active|Abstained discrimination, nonce per producer kind, the three retrospective rules, and the
// content-addressed id (golden value computed from pa-v1/json.js before this task).
import {describe,expect,it} from 'vitest';
import {uuidV8} from './uuid-v8';
import {digest} from './canonical';
import {isAbstained,isRetrospective,judgmentIdOf,producerNonceOf,validateClaim,validateHorizon,validateSubject} from './contract';
import {JudgmentError} from './errors';

const ISSUER='3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof JudgmentError?e.code:`other:${String(e)}`;}};

describe('validateSubject',()=>{
 it('accepts the four public formats and returns only type and key',()=>{
  expect(validateSubject({type:'issuer',key:ISSUER})).toEqual({type:'issuer',key:ISSUER});
  expect(validateSubject({type:'industry',key:'sw2021:2021:801010'})).toEqual({type:'industry',key:'sw2021:2021:801010'});
  expect(validateSubject({type:'macro_region',key:'CN'})).toEqual({type:'macro_region',key:'CN'});
  expect(validateSubject({type:'macro_series',key:'US.CPIAUCSL'})).toEqual({type:'macro_series',key:'US.CPIAUCSL'});
  expect(validateSubject({type:'macro_region',key:'US',extra:1})).toEqual({type:'macro_region',key:'US'});
 });
 it('refuses security and document on the public table and accepts them for private adapters',()=>{
  expect(code(()=>validateSubject({type:'security',key:'US:AAPL'}))).toBe('subject_type_not_public');
  expect(code(()=>validateSubject({type:'document',key:'doc-1'}))).toBe('subject_type_not_public');
  expect(validateSubject({type:'security',key:'A:600519'},{publicOnly:false})).toEqual({type:'security',key:'A:600519'});
  expect(validateSubject({type:'document',key:'doc-1'},{publicOnly:false})).toEqual({type:'document',key:'doc-1'});
 });
 it('refuses malformed keys and unknown types with subject_missing',()=>{
  const bad:unknown[]=[{type:'issuer',key:'not-a-uuid'},{type:'issuer',key:ISSUER.toUpperCase()},{type:'industry',key:'sw2021:2021'},{type:'industry',key:'nope:2021:801010'},{type:'industry',key:'sw2021::801010'},{type:'industry',key:'sw2021:2021:801 010'},
   {type:'macro_region',key:'HK'},{type:'macro_series',key:''},{type:'macro_series',key:'x'.repeat(129)},{type:'macro_series',key:' CPI'},{type:'planet',key:'x'},{type:'issuer'},null,'issuer'];
  for(const s of bad)expect({s,c:code(()=>validateSubject(s))}).toEqual({s,c:'subject_missing'});
  for(const s of [{type:'security',key:'JP:7203'},{type:'security',key:'US:'},{type:'security',key:'AAPL'}])expect({s,c:code(()=>validateSubject(s,{publicOnly:false}))}).toEqual({s,c:'subject_missing'});
 });
});

const P={p:0.6,event:{zh:'上涨',en:'up'}};
const C={selected:'recovery',classes:['recovery','overheat','stagflation','recession'],distribution:{recovery:0.4,overheat:0.3,stagflation:0.2,recession:0.1},scores_are_not_probabilities:true,margin_pp:10,catalog_version:'cat/1'};
const S={value:62,scale:{min:0,max:100},dims:[{id:'growth',value:70,weight:0.5,coverage:true},{id:'valuation',value:null,weight:0.5,coverage:false}],coverage:0.5,realized_metric:'revenue_cagr_3y'};
const I={metric:'price_return',low:-0.1,high:0.2,unit:'ratio',nominal_coverage:0.8,scenarios:[{label:'bear',p:0.2,value:-0.1},{label:'base',p:0.5,value:0.05},{label:'bull',p:0.3,value:0.2}],scenario_event_hash:'e'.repeat(64)};

describe('validateClaim',()=>{
 it('accepts a valid claim of each kind and returns it unchanged',()=>{
  expect(validateClaim('probability',P)).toEqual(P);
  expect(validateClaim('probability',{...P,p:0})).toEqual({...P,p:0});
  expect(validateClaim('probability',{...P,p:1})).toEqual({...P,p:1});
  expect(validateClaim('categorical',C)).toEqual(C);
  expect(validateClaim('categorical',{selected:'a',classes:['a','b'],scores_are_not_probabilities:false})).toEqual({selected:'a',classes:['a','b'],scores_are_not_probabilities:false});
  expect(validateClaim('score',S)).toEqual(S);
  expect(validateClaim('interval',I)).toEqual(I);
  expect(validateClaim('interval',{metric:'m',low:1,high:1,unit:'x',nominal_coverage:0.5})).toEqual({metric:'m',low:1,high:1,unit:'x',nominal_coverage:0.5});
 });
 it('probability: p in [0,1], bilingual event, no unknown members',()=>{
  for(const c of [{...P,p:1.01},{...P,p:-0.01},{...P,p:Number.NaN},{...P,p:'0.5'},{...P,event:{zh:'x'}},{...P,event:{zh:'',en:'x'}},{...P,event:{zh:'x',en:'y',fr:'z'}},{...P,extra:1},{p:0.5},null,[]])
   expect({c,r:code(()=>validateClaim('probability',c))}).toEqual({c,r:'invalid_claim'});
 });
 it('categorical: selected in unique classes, distribution keys in classes and non-negative, flag required',()=>{
  for(const c of [{...C,selected:'boom'},{...C,classes:['a','a']},{...C,classes:[]},{...C,distribution:{boom:1}},{...C,distribution:{recovery:-0.1}},{...C,scores_are_not_probabilities:undefined},{...C,margin_pp:-1},{...C,catalog_version:''},{...C,extra:true}])
   expect({c,r:code(()=>validateClaim('categorical',c))}).toEqual({c,r:'invalid_claim'});
 });
 it('score: value inside the scale, missing dimensions stay missing, coverage in [0,1]',()=>{
  const dims=S.dims;
  for(const c of [{...S,value:101},{...S,scale:{min:5,max:5}},{...S,dims:[{...dims[0],value:null}]},{...S,dims:[{...dims[1],value:50}]},{...S,dims:[dims[0],dims[0]]},{...S,dims:[{...dims[0],weight:-1}]},{...S,coverage:1.5},{...S,realized_metric:''},{...S,dims:[{...dims[0],note:'x'}]}])
   expect({c,r:code(()=>validateClaim('score',c))}).toEqual({c,r:'invalid_claim'});
 });
 it('interval: low <= high, nominal coverage strictly inside (0,1), scenario probabilities sum to 1',()=>{
  for(const c of [{...I,low:0.3},{...I,nominal_coverage:0},{...I,nominal_coverage:1},{...I,scenarios:[{label:'a',p:0.5,value:1},{label:'b',p:0.4,value:2}]},{...I,scenarios:[]},{...I,scenarios:[{label:'',p:1,value:1}]},{...I,scenario_event_hash:'xyz'},{...I,unit:''},{...I,extra:1}])
   expect({c,r:code(()=>validateClaim('interval',c))}).toEqual({c,r:'invalid_claim'});
 });
});

describe('validateHorizon, isAbstained',()=>{
 it('accepts each unit inside its bounds (calendar_months allows n=0) and refuses everything else',()=>{
  expect(validateHorizon({unit:'trading_sessions',n:5})).toEqual({unit:'trading_sessions',n:5});
  expect(validateHorizon({unit:'calendar_months',n:0})).toEqual({unit:'calendar_months',n:0});
  expect(validateHorizon({unit:'fiscal_quarters',n:12})).toEqual({unit:'fiscal_quarters',n:12});
  for(const h of [{unit:'trading_sessions',n:0},{unit:'calendar_days',n:1.5},{unit:'calendar_days',n:3661},{unit:'weeks',n:2},{unit:'calendar_days',n:3,extra:1},{unit:'fiscal_quarters'},null])
   expect({h,r:code(()=>validateHorizon(h))}).toEqual({h,r:'invalid_condition'});
 });
 it('discriminates Abstained from Active',()=>{
  expect(isAbstained({abstained:true,reason:'no_inputs'})).toBe(true);
  expect(isAbstained({abstained:false,claim:P})).toBe(false);
  for(const x of [null,'abstained',{abstained:'true'},{reason:'x'}])expect(isAbstained(x)).toBe(false);
 });
});

describe('judgmentIdOf, producerNonceOf, isRetrospective',()=>{
 const F={subject_type:'macro_region' as const,subject_key:'US',judgment_type:'macro_regime',methodology_id:'macro_regime',methodology_version:'v1',as_of:'2026-11-06',inputs_hash:'a'.repeat(64),producer_nonce:''};
 it('is uuidV8 of the digest of exactly the eight addressed fields (spec §6.1)',()=>{
  expect(judgmentIdOf(F)).toBe('e1b53b0d-831f-8a78-a4ce-42858ea12057');
  expect(judgmentIdOf(F)).toBe(uuidV8(digest(F)));
  expect(judgmentIdOf({...F,claim:{p:0.9}} as typeof F)).toBe(judgmentIdOf(F));   // claim is not addressed
  for(const k of Object.keys(F) as (keyof typeof F)[]){
   const v=k==='inputs_hash'?'b'.repeat(64):k==='subject_type'?'issuer':`${F[k]}x`;
   expect({k,same:judgmentIdOf({...F,[k]:v})===judgmentIdOf(F)}).toEqual({k,same:false});
  }
  expect(code(()=>judgmentIdOf({...F,inputs_hash:'abc'}))).toBe('invalid_parameter');
 });
 it('derives the nonce per producer kind (spec §3.6)',()=>{
  expect(producerNonceOf('rule',{})).toBe('');
  expect(producerNonceOf('model',{model:'m1',prompt_sha256:'c'.repeat(64),run_id:'run-7'})).toBe('run-7');
  expect(producerNonceOf('human',{analyst_id:'a1',source_record:{table:'recommendations',id:'r9'}})).toBe('a1:recommendations:r9');
  expect(producerNonceOf('third_party',{institution:'GS',document_id:'d1',version_hash:'f'.repeat(64)})).toBe(`d1:${'f'.repeat(64)}`);
  expect(code(()=>producerNonceOf('rule',{x:1} as never))).toBe('invalid_parameter');
  expect(code(()=>producerNonceOf('model',{model:'m1',prompt_sha256:'short',run_id:'r'}))).toBe('invalid_parameter');
  expect(code(()=>producerNonceOf('human',{analyst_id:'a1'} as never))).toBe('invalid_parameter');
 });
 it('applies the three retrospective rules of spec §3.4 against registered_at',()=>{
  const at='2026-11-06T03:00:00.000Z';
  const base={as_of:'2026-11-06',registered_at:at,settle_after:'2026-12-01T00:00:00.000Z',label_available_at:null};
  expect(isRetrospective(base)).toBe(false);
  expect(isRetrospective({...base,as_of:'2026-11-05'})).toBe(true);
  expect(isRetrospective({...base,settle_after:at})).toBe(true);
  expect(isRetrospective({...base,settle_after:null})).toBe(false);
  expect(isRetrospective({...base,label_available_at:'2026-11-06T02:59:59.999Z'})).toBe(true);
  expect(isRetrospective({...base,label_available_at:'2026-11-06T03:00:00.001Z'})).toBe(false);
  expect(isRetrospective({...base,registered_at:'2026-11-06T23:59:59.999Z'})).toBe(false);   // UTC date of registered_at
  expect(code(()=>isRetrospective({...base,as_of:'2026-02-30'}))).toBe('invalid_parameter');
  expect(code(()=>isRetrospective({...base,registered_at:'garbage'}))).toBe('invalid_parameter');
 });
});
