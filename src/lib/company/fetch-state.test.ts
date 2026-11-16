import {describe,it,expect} from 'vitest';
import {stateFor} from './fetch-state';

describe('stateFor',()=>{
 const stored={url:'/a?asOf=1',result:{status:'ok' as const,data:{x:1}}};
 it('returns the stored result only for the same url',()=>{
  expect(stateFor('/a?asOf=1',stored)).toEqual(stored.result);
  expect(stateFor('/a?asOf=2',stored)).toEqual({status:'loading'});
  expect(stateFor('/a',null)).toEqual({status:'loading'});
  expect(stateFor(null,stored)).toEqual({status:'idle'});
 });
});
