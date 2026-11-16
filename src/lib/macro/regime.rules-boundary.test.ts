// Rule type boundaries and safe labels (P5 draft 8 §§2.1, 3.5, 3.8).
import {describe,it,expect} from 'vitest';
import {matchRule,RULES} from './regime';
describe('typed rule boundaries',()=>{
 it('matches only rules of the supplied type',()=>{
  expect(matchRule('fx',7.12,null,null)).toBeNull();expect(matchRule('fx',102.4,.5,.3)).toBeNull();
  expect(matchRule('policy_rate',7.12,null,0)?.id).toBe('policy.ge4_5.up');
  expect(matchRule('growth_yoy',48,null,0)?.id).not.toMatch(/^pmi\./);
 });
 it('has unique, bilingual, safe labels within each type',()=>{
  const forbidden=/概率|置信度|可靠度|预测|probabilit|confidence|reliab|forecast/i;
  for(const rules of Object.values(RULES)){
   const zh=rules.map(r=>r.label.zh),en=rules.map(r=>r.label.en);
   expect(new Set(zh).size).toBe(zh.length);expect(new Set(en).size).toBe(en.length);
   for(const label of [...zh,...en]){expect(label.trim()).not.toBe('');expect(label).not.toMatch(forbidden);}
  }
 });
});
