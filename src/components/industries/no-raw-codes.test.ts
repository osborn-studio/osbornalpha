import {expect,it} from 'vitest';
import zh from '../../../messages/zh/industries.json';
import en from '../../../messages/en/industries.json';
import zhJudgments from '../../../messages/zh/judgments.json';
import enJudgments from '../../../messages/en/judgments.json';

const bracketed=/[（(]\s*[a-z]+(?:_[a-z]+)*\s*[）)]/;
function offendingPaths(value:unknown,path:string,pattern:RegExp):string[]{
 if(typeof value==='string')return pattern.test(value)?[path]:[];
 if(!value||typeof value!=='object')return [];
 return Object.entries(value).flatMap(([key,child])=>offendingPaths(child,`${path}.${key}`,pattern));
}

for(const [locale,industries,judgments,label] of [['zh',zh,zhJudgments,'仅当前值'],['en',en,enJudgments,'Current only']] as const){
 it(`uses the stock current-only label for the industry state (${locale})`,()=>{
  expect(industries.stock.currentOnly).toBe(label);
  expect(industries.states.currentOnly.title).toBe(industries.stock.currentOnly);
 });
 it(`keeps raw codes out of industry notices and availability labels (${locale})`,()=>{
  const {availabilityAssumed,availabilityObserved,availabilityEvidenced}=industries.drawer;
  const sources=Object.fromEntries(Object.entries(industries.sources).filter(([key])=>key.startsWith('availability')));
  const copy={states:industries.states,missing:industries.missing,sources,drawer:{availabilityAssumed,availabilityObserved,availabilityEvidenced}};
  expect(industries.cnList.missing+' · '+industries.missing.not_in_run).toBe(locale==='zh'?'缺失 · 本次运行未包含':'Missing · not in this run');
  const vendorCodes=/\b(?:not_in_run|vendor_not_provided|no_prior_period|invalid_denominator|vendor:gildata:[a-z-]+|scheme:sw2021:2021)\b/;
  expect(offendingPaths({drawer:industries.cnDrawer,datasets:industries.cnDatasets,missing:industries.missing},'industries',vendorCodes)).toEqual([]);
  expect(offendingPaths(copy,'industries',new RegExp(`${bracketed.source}|\\bmanifest_mismatch\\b`))).toEqual([]);
 });
 it(`keeps bracketed codes out of timeline copy (${locale})`,()=>{
  expect(offendingPaths(judgments.ui.timeline,'judgments.ui.timeline',bracketed)).toEqual([]);
 });
}
