import {afterEach,beforeEach,expect,it,vi} from 'vitest';

// Execute the hook's real effect and reload callback without a browser renderer.
const h=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,effect:undefined as undefined|(()=>void|(()=>void))}));
vi.mock('react',()=>({
 useState:(initial:unknown)=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]=initial;return [h.slots[i],(value:unknown)=>{h.slots[i]=typeof value==='function'?value(h.slots[i]):value;}];},
 useEffect:(effect:()=>void|(()=>void))=>{h.effect=effect;},
 useCallback:(callback:()=>void)=>callback,
}));
import {useStrategyFetch} from './use-strategy-fetch';
const useRender=(url:string|null='/api/macro/strategy/transmission?region=US')=>{h.cursor=0;return useStrategyFetch(url);};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
beforeEach(()=>{h.slots=[];h.effect=undefined;});
afterEach(()=>{vi.unstubAllGlobals();});

it('bypasses browser HTTP cache on mount and same-URL reload after sign-out',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({status:200,json:async()=>({manifest_id:'first'})})
  .mockResolvedValueOnce({status:401,json:async()=>({error:{code:'unauthorized'}})});
 vi.stubGlobal('fetch',fetcher);
 useRender();const cleanup=h.effect!();await flush();
 expect(useRender().state).toMatchObject({kind:'ok'});
 useRender().reload();cleanup?.();useRender();h.effect!();await flush();
 expect(useRender().state).toMatchObject({kind:'error',code:'unauthorized'});
 expect(fetcher).toHaveBeenCalledTimes(2);
 for(const call of fetcher.mock.calls)expect(call).toEqual([
  '/api/macro/strategy/transmission?region=US',{credentials:'same-origin',cache:'no-store'},
 ]);
});
it('does not fetch a null URL',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);useRender(null);h.effect!();expect(fetcher).not.toHaveBeenCalled();
});
