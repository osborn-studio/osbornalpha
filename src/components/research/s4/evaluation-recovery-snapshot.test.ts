import {describe,it,expect} from 'vitest';
import {recoverySnapshot} from './evaluation-recovery-snapshot';
describe('bounded damaged journal snapshot',()=>{
 it('compares structural JSON exactly while ignoring object insertion order',()=>{expect(recoverySnapshot({b:[null,false,3],a:'标记'})).toBe(recoverySnapshot({a:'标记',b:[null,false,3]}));expect(recoverySnapshot([1,2])).not.toBe(recoverySnapshot([2,1]));});
 it.each([undefined,NaN,Infinity,-0,1n,new Date(),new Map(),new Set(),[undefined],Array(1),{a:undefined},'x'.repeat(8193),'中'.repeat(3000)])('rejects unsupported or over-budget input %#',value=>{expect(()=>recoverySnapshot(value)).toThrow('evaluation_journal_unavailable');});
 it('does not run getters and rejects cycles, aliases and extra array properties',()=>{
  let called=false;const getter={get a(){called=true;return 1;}};expect(()=>recoverySnapshot(getter)).toThrow();expect(called).toBe(false);
  const cycle:unknown[]=[];cycle.push(cycle);expect(()=>recoverySnapshot(cycle)).toThrow();
  const child={};expect(()=>recoverySnapshot([child,child])).toThrow();expect(()=>recoverySnapshot(Object.assign([1],{extra:true}))).toThrow();
 });
 it('bounds nesting and node count',()=>{let deep:unknown=0;for(let i=0;i<10;i++)deep=[deep];expect(()=>recoverySnapshot(deep)).toThrow();expect(()=>recoverySnapshot(Array(256).fill(null))).toThrow();});
});
