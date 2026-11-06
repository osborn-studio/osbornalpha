// src/lib/evals/replay/fixture.test.ts
import {describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection} from '../types';
import {isDraft,parseReplayFile,recordedCases,serializeReplayFile} from './fixture';

const P:Projection={module:'facts',rows:[{concept:'revenue',value_text:'1'}]};
const C='c'.repeat(40),S='5'.repeat(64);
const frozenCase=(p:Record<string,unknown>={})=>({case_id:'zzeva-revenue',request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'},setup:{setup_sha256:S,today:'2026-11-06'},recorded:{code_version:C,at:'2026-11-06T00:00:00.000Z'},expected:{projection_hash:projectionHash(P),projection:P},...p});
const file=(cases:unknown[],p:Record<string,unknown>={})=>({schema_version:1,module:'facts',mode:'frozen',cases,...p});
const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof EvalError?e.code:`other:${String(e)}`;}};

describe('parseReplayFile',()=>{
 it('accepts a recorded frozen file and round-trips through serializeReplayFile',()=>{
  const f=parseReplayFile(file([frozenCase()]),{allowDrafts:false});
  expect(recordedCases(f).map(c=>c.case_id)).toEqual(['zzeva-revenue']);
  expect(parseReplayFile(JSON.parse(serializeReplayFile(f)),{allowDrafts:false})).toEqual(f);
  expect(serializeReplayFile(f).endsWith('}\n')).toBe(true);
 });
 it('drafts (recorded and expected null) only when allowed; recordedCases refuses them',()=>{
  const draft=frozenCase({recorded:null,expected:null,setup:{today:'2026-11-06'}});
  expect(code(()=>parseReplayFile(file([draft]),{allowDrafts:false}))).toBe('gold_invalid');
  const f=parseReplayFile(file([draft]),{allowDrafts:true});
  expect(isDraft(f.cases[0])).toBe(true);
  expect(code(()=>recordedCases(f))).toBe('gold_invalid');
 });
 it('refuses: expected hash ≠ projection, duplicate case_id, unknown concept, concepts with metrics, bad asOf, bad code_version, live without state_rev',()=>{
  expect(code(()=>parseReplayFile(file([frozenCase({expected:{projection_hash:'0'.repeat(64),projection:P}})]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase(),frozenCase()]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase({request:{issuer:{market:'US',cik:'9990601'},concepts:['nope'],asOf:'2025-06-30'}})]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase({request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],metrics:['gross_margin'],asOf:'2025-06-30'}})]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase({request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-6-30'}})]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase({recorded:{code_version:'abc',at:'2026-11-06T00:00:00Z'}})]),{allowDrafts:false}))).toBe('gold_invalid');
  const live={case_id:'l',request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'},recorded:{code_version:C,at:'2026-11-06T00:00:00Z'},expected:{projection_hash:projectionHash(P),projection:P}};
  expect(code(()=>parseReplayFile(file([live],{mode:'live'}),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([{...live,recorded:{...live.recorded,state_rev:3}}],{mode:'live'}),{allowDrafts:false}))).toBe('ok');
  expect(code(()=>parseReplayFile(file([frozenCase({setup:{today:'2026-11-06'}})]),{allowDrafts:false}))).toBe('gold_invalid');   // recorded frozen case needs a sealed setup
 });
});
