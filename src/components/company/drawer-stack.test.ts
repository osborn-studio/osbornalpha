import {describe,it,expect} from 'vitest';
import {emptyStack,stackReducer,isInteractive} from './drawer-stack';

describe('drawer stack',()=>{
 it('keeps lower drawers in the stack and makes only the top interactive',()=>{
  let s=emptyStack<string>();
  s=stackReducer(s,{type:'open',target:'formula'});s=stackReducer(s,{type:'open',target:'history'});
  expect(s.entries.map(e=>e.target)).toEqual(['formula','history']);
  expect(s.entries.map(e=>isInteractive(s,e.id))).toEqual([false,true]);
 });
 it('closing pops only the top and names exactly that entry for focus return',()=>{
  let s=emptyStack<string>();
  s=stackReducer(s,{type:'open',target:'formula'});s=stackReducer(s,{type:'open',target:'history'});
  const topId=s.entries[1].id;
  s=stackReducer(s,{type:'close'});
  expect(s.entries.map(e=>e.target)).toEqual(['formula']);
  expect(s.returnFocusTo).toBe(topId);
  expect(isInteractive(s,s.entries[0].id)).toBe(true);
  s=stackReducer(s,{type:'focused'});expect(s.returnFocusTo).toBeNull();
 });
 it('closing an empty stack is a no-op and ids are never reused',()=>{
  let s=emptyStack<string>();expect(stackReducer(s,{type:'close'})).toBe(s);
  s=stackReducer(s,{type:'open',target:'a'});const a=s.entries[0].id;s=stackReducer(s,{type:'close'});s=stackReducer(s,{type:'open',target:'b'});
  expect(s.entries[0].id).not.toBe(a);
 });
});
