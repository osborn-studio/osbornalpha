import {expect,it} from 'vitest';
import {PresetsMemo} from './presets-memo';
it('bounds LRU at 32 responses, refreshes hits, and does not cache failed computations',async()=>{
 const memo=new PresetsMemo<number>();let calls=0;const compute=async()=>++calls;
 for(let i=0;i<32;i++)await memo.get(String(i),compute);
 expect((await memo.get('0',compute)).hit).toBe(true);
 await memo.get('32',compute);
 expect((await memo.get('0',compute)).hit).toBe(true);
 expect((await memo.get('1',compute)).hit).toBe(false);
 await expect(memo.get('bad',async()=>{throw Error('down');})).rejects.toThrow('down');
 expect((await memo.get('bad',compute)).hit).toBe(false);
});
it('returns rejected values without storing them, then memoizes an accepted retry',async()=>{
 const memo=new PresetsMemo<number>();let calls=0;
 const compute=async()=>++calls;
 const shouldStore=(value:number)=>value>1;
 expect(await memo.get('retry',compute,shouldStore)).toEqual({value:1,hit:false});
 expect(await memo.get('retry',compute,shouldStore)).toEqual({value:2,hit:false});
 expect(await memo.get('retry',compute,shouldStore)).toEqual({value:2,hit:true});
 expect(calls).toBe(2);
});
it('coalesces concurrent reads even when their value must not be stored',async()=>{
 const memo=new PresetsMemo<number>();let calls=0;
 const compute=async()=>++calls;
 const shouldStore=()=>false;
 const results=await Promise.all([memo.get('retry',compute,shouldStore),memo.get('retry',compute,shouldStore)]);
 expect(results).toEqual([{value:1,hit:false},{value:1,hit:false}]);
 expect(calls).toBe(1);
 expect(await memo.get('retry',compute,shouldStore)).toEqual({value:2,hit:false});
});
