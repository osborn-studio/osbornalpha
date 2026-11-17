// src/lib/topics/slots.test.ts
import {describe,expect,it} from 'vitest';
import {parseSlots,renderSlots,SLOT_RE} from './slots';
describe('evidence slots (spec §4.5, change list: syntax is {{ev:n}})',()=>{
 it('finds value and period slots with their positions',()=>{
  expect(parseSlots('截至 {{ev:1.period}}，利率为 {{ev:1}}。见 {{ev:14}}。')).toEqual([
   {ordinal:1,part:'period',start:3,end:18,raw:'{{ev:1.period}}'},{ordinal:1,part:'value',start:23,end:31,raw:'{{ev:1}}'},{ordinal:14,part:'value',start:34,end:43,raw:'{{ev:14}}'}]);
 });
 it.each(['{{ev:0}}','{{ev:01}}','{{ ev:1 }}','{{ev:1.value}}','{{ev:1.Period}}','{​{ev:1}​}'])('does not treat %s as a slot',s=>{
  expect(parseSlots(s)).toEqual([]);expect(SLOT_RE.test(s)).toBe(false);
 });
 it('renders slots into parts, leaving text untouched',()=>{
  const parts=renderSlots('A {{ev:2}} B',n=>n===2?{state:'ok',text:'4.3%',period:'2026-08'}:null);
  expect(parts).toEqual([{type:'text',text:'A '},{type:'slot',ordinal:2,part:'value',state:'ok',text:'4.3%'},{type:'text',text:' B'}]);
 });
 it('renders a non-ok slot as its state, never a number, and a dangling slot as dangling',()=>{
  expect(renderSlots('{{ev:5}}',()=>({state:'withheld',text:null,period:'2026Q3'}))).toEqual([{type:'slot',ordinal:5,part:'value',state:'withheld',text:null}]);
  expect(renderSlots('{{ev:9}}',()=>null)).toEqual([{type:'slot',ordinal:9,part:'value',state:'dangling',text:null}]);
 });
 it('strips slots for lexical checking',async()=>{
  const {withoutSlots}=await import('./slots');expect(withoutSlots('为 {{ev:1}}，截至 {{ev:1.period}}')).toBe('为 ，截至 ');
 });
});
