// src/lib/topics/lexical.test.ts
import {describe,expect,it} from 'vitest';
import {ADVICE_TERMS,adviceMatches,ownerTextFailures} from './lexical';
describe('owner text lexical rules (spec §4.5, §6.6 check 5)',()=>{
 it('lists the spec advice terms',()=>{
  expect([...ADVICE_TERMS]).toEqual(['买入','卖出','推荐','增持','减持','目标价','建仓','抄底','建议','buy','sell','recommend','overweight','underweight','target price','accumulate']);
 });
 it.each([['失业率为 4.3%','numeral_in_owner_text','4.3%'],['过去三个月','numeral_in_owner_text','三个月'],['我们建议关注银行息差','advice_term','建议'],
  ['逢低买入','advice_term','买入'],['We recommend banks','advice_term','recommend'],['胜率很高','forbidden_term','胜率']] as const)('%s → %s',(text,code,match)=>{
  expect(ownerTextFailures(text)).toContainEqual({code,match});
 });
 it('accepts clean text and ignores slots',()=>{
  expect(ownerTextFailures('截至 {{ev:1.period}}，联邦基金有效利率为 {{ev:1}}。')).toEqual([]);
 });
 it('matches English terms on word boundaries only',()=>{
  expect(adviceMatches('The seller buyback programme')).toEqual([]);expect(adviceMatches('Buy now')).toEqual(['buy']);
 });
 it('does not apply the regime-word rule to owner text',()=>{expect(ownerTextFailures('经济复苏阶段的行业表现')).toEqual([]);});
 it('normalises owner text before the inherited checks',()=>{
  expect(ownerTextFailures('ｐｒｏｂａｂｉｌｉｔｙ')).toContainEqual({code:'forbidden_term',match:'probability'});
 });
 it('keeps inherited numeral fragments alongside complete quantity diagnostics',()=>{
  const failures=ownerTextFailures('三个月和三个人，４.３％');
  for(const match of ['三个','三个月','4','3','%','4.3%'])expect(failures).toContainEqual({code:'numeral_in_owner_text',match});
  expect(ownerTextFailures('个人表现')).toEqual([]);
 });
});
