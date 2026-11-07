// src/lib/evals/kinds/read-only.test.ts
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {assertReadOnly,writeLikeProperties} from './read-only';

class Store{insertRun(){return 1;}read(){return 2;}}
class Reader{value(){return null;}}

describe('writeLikeProperties',()=>{
 it('finds write-like names on own props, nested plain objects and prototype methods',()=>{
  expect(writeLikeProperties({reader:{value:()=>null},today:'2026-11-06'})).toEqual([]);
  expect(writeLikeProperties({reader:{value:()=>null,insert:()=>0}})).toEqual(['reader.insert']);
  expect(writeLikeProperties({db:new Store()})).toEqual(['db.insertRun']);
  expect(writeLikeProperties({a:{update:1},rpc:()=>0,storeX:()=>0,upsert_row:()=>0,delete:()=>0})).toEqual(['a.update','delete','rpc','storeX','upsert_row']);
  expect(writeLikeProperties({r:new Reader(),storage:{},updated_at:'x',inserted:true})).toEqual([]);   // prefixes need a word boundary
 });
 it('survives cycles and getters (never invoked)',()=>{
  const a:Record<string,unknown>={};a.self=a;
  Object.defineProperty(a,'boom',{get(){throw new Error('invoked');},enumerable:true});
  expect(writeLikeProperties(a)).toEqual([]);
 });
 it('assertReadOnly throws the given EvalError code with the offending paths',()=>{
  try{assertReadOnly({reader:{upsert:()=>0}},'reference_write_attempt','ReadDeps');throw new Error('not thrown');}
  catch(e){expect(e).toBeInstanceOf(EvalError);expect((e as EvalError).code).toBe('reference_write_attempt');expect((e as EvalError).detail).toEqual({properties:['reader.upsert']});}
  expect(()=>assertReadOnly({reader:new Reader()},'reference_write_attempt','ReadDeps')).not.toThrow();
 });
});
