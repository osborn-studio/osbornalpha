// 计划第 3 轮审计 R7: a late response of a superseded scope never writes rows, errors or the loading flag.
import {describe,expect,it} from 'vitest';
import {LoadGenerations,guardedLoad,type LoadSink,type PageResult} from './guarded-load';

function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};}
function recorder(){
 const log:{rows:string[];cursor:string|null;error:string|null;loading:boolean}={rows:[],cursor:null,error:null,loading:false};
 const sink:LoadSink<string>={setLoading:(v)=>{log.loading=v;},page:(from,r)=>{log.rows=from?[...log.rows,...r.rows]:r.rows;log.cursor=r.nextCursor;log.error=null;},fail:(c)=>{log.error=c;}};
 return {log,sink};
}
const codeOf=(e:unknown)=>e instanceof Error?e.message:'internal';

describe('guardedLoad (company tracking view)',()=>{
 it('current-mode response resolving after the replay response never replaces replay rows',async()=>{
  const gens=new LoadGenerations();const {log,sink}=recorder();
  const inbox=deferred<PageResult<string>>(),replay=deferred<PageResult<string>>();
  const a=guardedLoad(gens,null,()=>inbox.promise,sink,codeOf);
  gens.invalidate();log.rows=[];log.cursor=null;
  const b=guardedLoad(gens,null,()=>replay.promise,sink,codeOf);
  replay.resolve({rows:['historical-2024-06-30'],nextCursor:null});await b;
  expect(log).toEqual({rows:['historical-2024-06-30'],cursor:null,error:null,loading:false});
  inbox.resolve({rows:['current-event'],nextCursor:'c1'});await a;
  expect(log.rows).toEqual(['historical-2024-06-30']);
  expect(log.rows).not.toContain('current-event');
  expect(log.cursor).toBeNull();expect(log.loading).toBe(false);
 });
 it('a stale failure writes no error and does not clear the loading flag of the live request',async()=>{
  const gens=new LoadGenerations();const {log,sink}=recorder();
  const old=deferred<PageResult<string>>(),live=deferred<PageResult<string>>();
  const a=guardedLoad(gens,null,()=>old.promise,sink,codeOf);
  const b=guardedLoad(gens,null,()=>live.promise,sink,codeOf);
  old.reject(new Error('not_authenticated'));await a;
  expect(log.error).toBeNull();expect(log.loading).toBe(true);
  live.resolve({rows:['x'],nextCursor:null});await b;
  expect(log).toMatchObject({rows:['x'],error:null,loading:false});
 });
 it('invalidate (unmount / scope change) drops every in-flight result',async()=>{
  const gens=new LoadGenerations();const {log,sink}=recorder();
  const d=deferred<PageResult<string>>();
  const a=guardedLoad(gens,null,()=>d.promise,sink,codeOf);
  gens.invalidate();d.resolve({rows:['late'],nextCursor:'c'});await a;
  expect(log.rows).toEqual([]);expect(log.cursor).toBeNull();
  const g=gens.peek();expect(gens.isCurrent(g)).toBe(true);gens.invalidate();expect(gens.isCurrent(g)).toBe(false);
 });
});
