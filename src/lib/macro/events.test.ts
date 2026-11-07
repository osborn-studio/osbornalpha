// Derived US policy events (spec §6.1): effective date, exact bp, all inputs as evidence, determinism.
import {describe,expect,it} from 'vitest';
import {EVENTS_VERSION,derivePolicyEvents,toBp} from './events';
const row=(id:string,d:string,v:string)=>({observation_id:id,period_end:d,value_text:v});
describe('derivePolicyEvents',()=>{
 const upper=[row('u1','2024-09-17','5.5'),row('u2','2024-09-18','5'),row('u3','2024-09-19','5'),row('u4','2024-11-08','4.75'),row('u5','2025-01-02','4.75')];
 const lower=[row('l1','2024-09-17','5.25'),row('l2','2024-09-18','4.75'),row('l3','2024-09-19','4.75'),row('l4','2024-11-08','4.5'),row('l5','2025-01-02','4.5')];
 it('emits one derived event per change with effective date, bp and all four inputs as evidence',()=>{
  expect(derivePolicyEvents(upper,lower)).toEqual([
   {kind:'policy_target_change',region:'US',effective_date:'2024-09-18',upper_from:'5.5',upper_to:'5',lower_from:'5.25',lower_to:'4.75',change_bp:'-50',source:'derived',evidence:['u1','u2','l1','l2'],version:EVENTS_VERSION},
   {kind:'policy_target_change',region:'US',effective_date:'2024-11-08',upper_from:'5',upper_to:'4.75',lower_from:'4.75',lower_to:'4.5',change_bp:'-25',source:'derived',evidence:['u3','u4','l3','l4'],version:EVENTS_VERSION},
  ]);
 });
 it('is deterministic',()=>{
  expect(JSON.stringify(derivePolicyEvents(upper,lower))).toBe(JSON.stringify(derivePolicyEvents([...upper],[...lower])));
 });
 it('compares neighbouring joint days across calendar gaps, and only days where both bounds exist',()=>{
  const u=[row('a','2026-09-11','3.75'),row('b','2026-09-17','4')];
  const l=[row('c','2026-09-11','3.5'),row('d','2026-09-17','3.75')];
  expect(derivePolicyEvents(u,l).map(e=>[e.effective_date,e.change_bp])).toEqual([['2026-09-17','25']]);
  expect(derivePolicyEvents(u,[l[1]])).toEqual([]);
 });
 it('uses the lower-bound move when only the lower bound changed',()=>{
  const e=derivePolicyEvents([row('a','2026-01-01','4'),row('b','2026-01-02','4')],[row('c','2026-01-01','3.75'),row('d','2026-01-02','3.5')]);
  expect(e.map(x=>x.change_bp)).toEqual(['-25']);
 });
 it('reads trailing-zero decimals exactly ("4.50" vs "4.5" is no change)',()=>{
  expect(derivePolicyEvents([row('a','2026-01-01','4.50'),row('b','2026-01-02','4.5')],[row('c','2026-01-01','4.25'),row('d','2026-01-02','4.250')])).toEqual([]);
 });
 it('rejects unsorted input',()=>{
  expect(()=>derivePolicyEvents([upper[1],upper[0]],lower)).toThrow(/events_unsorted/);
 });
 it('toBp shifts exactly',()=>{
  expect(toBp('-0.25')).toBe('-25');expect(toBp('0.125')).toBe('12.5');expect(toBp('0')).toBe('0');
 });
});
