// src/components/topics/directory/directory-model.test.ts
import {describe,expect,it} from 'vitest';
import {cardModel,COUNT_ORDER} from './directory-model';
const item=(o:Partial<Parameters<typeof cardModel>[0]>={})=>({slug:'a',category:'macro' as const,title:{zh:'利率',en:'Rates'},dek:{zh:'d',en:'d'},version_no:3,published_at:'2026-11-08T09:00:00.000Z',
 evidence_counts:{ok:12,missing:2,withheld:1,not_served:0,unsupported:0,retracted:0},drift_counts:{revised:2,newer_period:0,retracted:0,now_withheld:0,unverifiable:0},stale:false,...o});
describe('directory card model',()=>{
 it('orders the status chips and drops zero counts',()=>{
  expect(COUNT_ORDER).toEqual(['ok','missing','withheld','not_served','unsupported','retracted']);
  expect(cardModel(item(),'zh').counts).toEqual([{state:'ok',n:12},{state:'missing',n:2},{state:'withheld',n:1}]);
 });
 it('builds the version line and picks the locale',()=>{expect(cardModel(item(),'en')).toMatchObject({title:'Rates',versionLine:'v3 · 2026-11-08',href:'/intel/topics/a'});});
 it('shows the revised badge, the stale badge and the mostly-withheld chip only when they apply',()=>{
  expect(cardModel(item(),'zh').badges).toEqual([{kind:'revised',n:2}]);
  expect(cardModel(item({stale:true,drift_counts:{revised:0,newer_period:0,retracted:0,now_withheld:0,unverifiable:0}}),'zh').badges).toEqual([{kind:'stale'}]);
  expect(cardModel(item({evidence_counts:{ok:3,missing:0,withheld:9,not_served:0,unsupported:0,retracted:0}}),'zh').badges).toContainEqual({kind:'mostlyWithheld'});
  expect(cardModel(item({evidence_counts:{ok:6,missing:0,withheld:6,not_served:0,unsupported:0,retracted:0}}),'zh').badges).not.toContainEqual({kind:'mostlyWithheld'});
 });
});
