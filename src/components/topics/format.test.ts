// Topic spec §7.2: industry units retain decimal precision.
import {expect,it} from 'vitest';
import {formatTopicSlot} from './format';
it('formats ratios as one-decimal percentages and delegates other units',()=>{
 for(const locale of ['zh','en'] as const){
  for(const [value_text,want] of [['0.201','20.1%'],['0.2005','20.1%'],['-0.2005','-20.1%'],['0','0.0%']])expect(formatTopicSlot({value_text,unit:'ratio'},locale)).toBe(want);
  expect(formatTopicSlot({value_text:'3.75',unit:'pct'},locale)).toBe('3.75%');
  expect(formatTopicSlot({value_text:'1000',unit:'count'},locale)).toBe('1,000');
 }
});
