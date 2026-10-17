import {describe,it,expect} from 'vitest';
import {ARM_ENROLLMENT_STATES,ARM_ENROLLMENT_EVENTS,nextArmEnrollmentState} from './arm-state';
describe('inactive enrollment ordering gate, no human evidence fabricated',()=>{
 it('accepts only four declared forward edges and termination from every nonterminal state',()=>{
  expect(Object.isFrozen(ARM_ENROLLMENT_STATES)).toBe(true);expect(Object.isFrozen(ARM_ENROLLMENT_EVENTS)).toBe(true);
  // Abstract protocol states, not a real confirmed human enrollment.
  const expected=new Map([
   ['enrolled|baseline.confirmed','baseline_confirmed'],
   ['baseline_confirmed|ai.exposed','ai_exposed'],
   ['ai_exposed|collaboration.confirmed','collaboration_confirmed'],
   ['collaboration_confirmed|bindings.completed','observation_bindings_complete'],
  ]);
  for(const state of ARM_ENROLLMENT_STATES)for(const event of ARM_ENROLLMENT_EVENTS){
   const result=state!=='terminated'&&event==='terminated'?'terminated':expected.get(`${state}|${event}`);
   if(result)expect(nextArmEnrollmentState(state,event)).toBe(result);
   else expect(()=>nextArmEnrollmentState(state,event)).toThrow(state==='terminated'?'terminal_state':'invalid_transition');
  }
 });
 it('never treats duplicate events, missing collaboration or completed state as new authorization',()=>{
  expect(()=>nextArmEnrollmentState('baseline_confirmed','baseline.confirmed')).toThrow('invalid_transition');
  expect(()=>nextArmEnrollmentState('ai_exposed','bindings.completed')).toThrow('invalid_transition');
  for(const event of ARM_ENROLLMENT_EVENTS)expect(()=>nextArmEnrollmentState('terminated',event)).toThrow('terminal_state');
  expect(nextArmEnrollmentState('observation_bindings_complete','terminated')).toBe('terminated');
 });
 it('rejects unknown/inherited/nonstring states and client authority objects',()=>{
  for(const value of ['__proto__','constructor','toString','averaged','expired',null,{},0,{state:'enrolled',actor_kind:'human'}]){
   expect(()=>nextArmEnrollmentState(value,'baseline.confirmed')).toThrow('invalid_schema');
   expect(()=>nextArmEnrollmentState('enrolled',value)).toThrow('invalid_schema');
  }
 });
});
