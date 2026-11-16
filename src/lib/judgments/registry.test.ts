// src/lib/judgments/registry.test.ts
import {describe,expect,it} from 'vitest';
import {formulaHashOf} from './formula-hash';
import {validateMethodology} from './methodology-sync';
import {REGISTRY,findMethodology,methodologyRowOf} from './registry';
import type {Methodology} from './types';

describe('REGISTRY (spec §4)',()=>{
 it('ids are unique and every registered module validates against the repository',()=>{
  expect(new Set(REGISTRY.map(m=>`${m.id}@${m.version}`)).size).toBe(REGISTRY.length);
  for(const m of REGISTRY)expect({key:`${m.id}@${m.version}`,problems:validateMethodology(m,process.cwd(),formulaHashOf(m).closure)}).toEqual({key:`${m.id}@${m.version}`,problems:[]});
 });
 it('methodologyRowOf maps a module and its hashes to the sync row',()=>{
  const m={id:'row_test',version:'v2',judgment_type:'macro_regime',kind:'categorical',producer_kind:'rule',subject_types:['macro_region'],input_kinds:['macro_snapshot'],markets:undefined,title:{zh:'行',en:'row'},doc:'docs/x.md',params:{grace_days:30,label_policy:'cutoff_vintage'},horizon:{unit:'calendar_months',n:3},upstream:{macro_methodology_version:'v1.0',facts_formula_version:undefined},deps:[],module:'src/x.ts',status:'draft'} as unknown as Methodology;
  const h={doc_sha256:'a'.repeat(64),implementation_sha256:'b'.repeat(64),deps_sha256:'c'.repeat(64),formula_hash:'d'.repeat(64)};
  expect(methodologyRowOf(m,h,{publishable:false,code_version:'abc1234'})).toEqual({methodology_id:'row_test',version:'v2',judgment_type:'macro_regime',kind:'categorical',producer_kind:'rule',subject_types:['macro_region'],input_kinds:['macro_snapshot'],markets:null,title_zh:'行',title_en:'row',doc_path:'docs/x.md',...h,params:{grace_days:30,label_policy:'cutoff_vintage'},params_json:{},horizon:{unit:'calendar_months',n:3},upstream:{macro_methodology_version:'v1.0'},status:'draft',publishable:false,code_version:'abc1234'});
  expect(findMethodology([m],'row_test','v2')).toBe(m);expect(findMethodology([m],'row_test','v1')).toBeNull();
 });
});
