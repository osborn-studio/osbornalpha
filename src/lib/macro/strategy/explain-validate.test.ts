// src/lib/macro/strategy/explain-validate.test.ts
import {describe,expect,it} from 'vitest';
import {FORBIDDEN_TERMS,lexicalFailures,parseModelContent,REGIME_TERMS,validateExplanation,VALIDATOR_VERSION} from './explain-validate';

const FACTS=new Set(['obs:US_CPI_YOY','chg:US_DGS10','evt:2026-10-28']);
const one=(hypothesis:string,fact_ids=['obs:US_CPI_YOY'])=>({points:[{fact_ids,hypothesis}],counterpoints:[]});
const codesOf=(text:string)=>{const r=validateExplanation(one(text),FACTS);return r.ok?[]:r.codes;};

describe('validator version',()=>{it('is macro-explain-validator/1',()=>expect(VALIDATOR_VERSION).toBe('macro-explain-validator/1'));});

describe('lexical policy — numerals (spec §6.3 step 4, N10)',()=>{
 // spec positives (must pass) plus more
 it.each(['进一步','统一','一致','万一','someone','none','often','happen',
  '通胀回落可能通过实际利率渠道影响美元资产的相对吸引力','若政策利率上调，则短端融资成本上升可能压制风险偏好','十分','千万不要忽视','一方面融资成本上升','唯一的约束','两国利差',
  'Tighter policy may raise real yields and weigh on duration-sensitive assets.','An oneness of purpose','Tone and phone ring often','The approach is happening','Sweptone'])('passes: %s',(text)=>{
  expect(codesOf(text)).toEqual([]);
 });
 // spec negatives (must reject) plus more
 it.each(['3','３','③','三个月','第二','两倍','百分之五','five','twice','25bp',
  '²','½','٣','一次','三成','五个百分点','十年','两周','第三方','零点','一年内','涨了%','千分之‰','利差扩大五十基点','Seven','ONE','half of it','double','a dozen','zero','bp','pp','bps','the 2pp move'])('rejects as numeral: %s',(text)=>{
  expect(codesOf(text)).toContain('numeral');
 });
 it('NFKC folds full-width and circled digits before matching',()=>{
  expect(lexicalFailures('１'.normalize('NFKC'))).toEqual([{code:'numeral',match:'1'}]);
  expect(lexicalFailures('⑤'.normalize('NFKC'))[0]).toMatchObject({code:'numeral',match:'5'});
 });
 it('collects every distinct matched fragment of each family, not only the first',()=>{
  expect(lexicalFailures('probability confidence recession stagflation')).toEqual([
   {code:'forbidden_term',match:'probability'},{code:'forbidden_term',match:'confidence'},
   {code:'regime_term',match:'stagflation'},{code:'regime_term',match:'recession'}]);
  expect(lexicalFailures('三个月 and 25bp, 25bp again')).toEqual([
   {code:'numeral',match:'2'},{code:'numeral',match:'5'},{code:'numeral',match:'bp'},{code:'numeral',match:'三个'}]);
  const r=validateExplanation(one('probability confidence recession stagflation'),FACTS);
  expect(r.ok).toBe(false);
  if(!r.ok)expect(r.failures.map(f=>f.match)).toEqual(['probability','confidence','stagflation','recession']);
 });
});

describe('lexical policy — forbidden and regime terms (spec §6.3 steps 5–6)',()=>{
 it.each(FORBIDDEN_TERMS.map(t=>[t]))('rejects forbidden term %s',(t)=>{
  expect(codesOf(`如果 ${t} 出现`)).toContain('forbidden_term');
 });
 it.each(['PROBABILITY','Confidence','Odds','Win  Rate','Will\nRise','Is Going To'])('English terms are case-insensitive and whitespace-tolerant: %s',(t)=>{
  expect(codesOf(t)).toContain('forbidden_term');
 });
 it.each(['probably','oddsmaker','winrate','chances'])('English terms match on word boundaries only: %s passes',(t)=>{
  expect(codesOf(t)).toEqual([]);
 });
 it.each(REGIME_TERMS.map(t=>[t]))('rejects regime term %s',(t)=>{
  expect(codesOf(`处于${t}`)).toContain('regime_term');
 });
 it('Recession in any case is rejected; "recover" is not a regime term',()=>{
  expect(codesOf('Recession')).toContain('regime_term');
  expect(codesOf('demand may recover')).toEqual([]);
 });
});

describe('structure and references (spec §6.3 steps 1–2)',()=>{
 it('accepts a well-formed output and defaults counterpoints to []',()=>{
  const r=validateExplanation({points:[{fact_ids:['obs:US_CPI_YOY','chg:US_DGS10'],hypothesis:'通胀回落可能通过实际利率影响长端收益率'}]},FACTS);
  expect(r).toEqual({ok:true,output:{points:[{fact_ids:['obs:US_CPI_YOY','chg:US_DGS10'],hypothesis:'通胀回落可能通过实际利率影响长端收益率'}],counterpoints:[]},failures:[]});
 });
 it.each([
  ['no points',{points:[],counterpoints:[]}],
  ['seven points',{points:Array.from({length:7},()=>({fact_ids:['obs:US_CPI_YOY'],hypothesis:'h'})),counterpoints:[]}],
  ['five fact ids',{points:[{fact_ids:['a','b','c','d','e'],hypothesis:'h'}]}],
  ['empty fact ids',{points:[{fact_ids:[],hypothesis:'h'}]}],
  ['text over 240 characters',{points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'很'.repeat(241)}]}],
  ['extra key',{points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'h',score:1}]}],
  ['wrong text key',{points:[{fact_ids:['obs:US_CPI_YOY'],text:'h'}]}],
  ['top-level extra',{points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'h'}],summary:'x'}],
  ['not an object',['x']],
 ])('schema failure: %s',(_,raw)=>{
  const r=validateExplanation(raw,FACTS);
  expect(r.ok).toBe(false);if(!r.ok)expect(r.codes).toEqual(['schema']);
 });
 it('240 characters exactly is allowed',()=>{
  expect(validateExplanation(one('很'.repeat(240)),FACTS).ok).toBe(true);
 });
 it('unknown fact ids are rejected with the id as the match',()=>{
  const r=validateExplanation(one('h',['obs:NOPE']),FACTS);
  expect(r).toEqual({ok:false,codes:['unknown_fact'],failures:[{code:'unknown_fact',section:'points',index:0,match:'obs:NOPE'}]});
 });
 it('collects every failure with section, index and fragment; codes are a sorted set',()=>{
  const r=validateExplanation({points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'利率将会上升三个月'},{fact_ids:['obs:US_CPI_YOY'],hypothesis:'正常文本'}],counterpoints:[{fact_ids:['obs:X'],text:'Recession odds'}]},FACTS);
  expect(r.ok).toBe(false);
  if(r.ok)return;
  expect(r.codes).toEqual(['forbidden_term','numeral','regime_term','unknown_fact']);
  expect(r.failures).toEqual([
   {code:'numeral',match:'三个',section:'points',index:0},
   {code:'forbidden_term',match:'将会',section:'points',index:0},
   {code:'unknown_fact',section:'counterpoints',index:0,match:'obs:X'},
   {code:'forbidden_term',match:'odds',section:'counterpoints',index:0},
   {code:'regime_term',match:'Recession',section:'counterpoints',index:0},
  ]);
 });
 it('parseModelContent accepts plain JSON and a json fence, nothing else',()=>{
  expect(parseModelContent('{"points":[]}')).toEqual({points:[]});
  expect(parseModelContent('```json\n{"points":[]}\n```')).toEqual({points:[]});
  expect(parseModelContent('Here: {"points":[]}')).toBeUndefined();
  expect(validateExplanation(parseModelContent('nope'),FACTS)).toEqual({ok:false,codes:['parse'],failures:[{code:'parse',section:'output',index:null,match:null}]});
 });
});
