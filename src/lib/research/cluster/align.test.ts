import {describe,expect,it} from 'vitest';
import {decideAlignments,findCandidates,type AliasEntry} from './align';

const aliases:AliasEntry[]=[
 {entity_id:'e-hs',alias:'恒生电子'},{entity_id:'e-hs',alias:'Hundsun'},{entity_id:'e-hs',alias:'600570.SH'},
 {entity_id:'e-th',alias:'同花顺'},{entity_id:'e-pltr',alias:'Palantir'},{entity_id:'e-pltr',alias:'PLTR'},{entity_id:'e-x',alias:'AI'},{entity_id:'e-y',alias:'金'},
];
describe('findCandidates',()=>{
 it('matches CJK aliases anywhere and Latin aliases on word boundaries, counting hits and first position',()=>{
  const c=findCandidates({title:'恒生电子公告',raw_text:'恒生电子（Hundsun）今日公告。The Hundsun update is unrelated to Palantirs.'},aliases);
  expect(c.map(x=>[x.entity_id,x.hits,x.alias])).toEqual([['e-hs',4,'恒生电子']]); // Palantirs ≠ Palantir; ticker absent
  expect(c[0].position).toBe(0);
 });
 it('ignores aliases that are too short to be safe and is case-insensitive for Latin',()=>{
  const c=findCandidates({title:'AI and gold 金',raw_text:'pltr rallies; palantir too.'},aliases);
  expect(c.map(x=>x.entity_id)).toEqual(['e-pltr']);
 });
});
describe('decideAlignments',()=>{
 it('aligns a single candidate with hit-based confidence, queues multiple candidates as ambiguous, writes nothing for none',()=>{
  expect(decideAlignments([{entity_id:'e-hs',alias:'恒生电子',hits:3,position:0}])).toEqual([{entity_id:'e-hs',method:'rule',status:'aligned',confidence:0.9,evidence:{alias:'恒生电子',hits:3,position:0}}]);
  const two=decideAlignments([{entity_id:'e-hs',alias:'恒生电子',hits:1,position:5},{entity_id:'e-th',alias:'同花顺',hits:1,position:9}]);
  expect(two.map(d=>d.status)).toEqual(['ambiguous','ambiguous']);
  expect(two.every(d=>d.confidence===null)).toBe(true);
  expect(decideAlignments([])).toEqual([]);
 });
 it('caps confidence at 1',()=>{
  expect(decideAlignments([{entity_id:'e',alias:'a',hits:9,position:0}])[0].confidence).toBe(1);
 });
});
