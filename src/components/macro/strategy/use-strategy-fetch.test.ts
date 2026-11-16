import {afterEach,beforeEach,expect,it,vi} from 'vitest';

// Execute the hook's real effect and reload callback without a browser renderer.
const h=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,effect:undefined as undefined|(()=>void|(()=>void)),auth:undefined as undefined|((event:string)=>void)}));
vi.mock('react',()=>({
 useState:(initial:unknown)=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]=initial;return [h.slots[i],(value:unknown)=>{h.slots[i]=typeof value==='function'?value(h.slots[i]):value;}];},
 useEffect:(effect:()=>void|(()=>void))=>{h.effect=effect;},
 useCallback:(callback:()=>void)=>callback,
}));
vi.mock('@/lib/supabase/client',()=>({getBrowserSupabase:()=>({auth:{onAuthStateChange:(callback:(event:string)=>void)=>{h.auth=callback;return {data:{subscription:{unsubscribe:()=>{h.auth=undefined;}}}};}}})}));
import {useStrategyFetch} from './use-strategy-fetch';
const useRender=(url:string|null='/api/macro/strategy/transmission?region=US')=>{h.cursor=0;return useStrategyFetch(url);};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
beforeEach(()=>{h.slots=[];h.effect=undefined;h.auth=undefined;});
afterEach(()=>{vi.unstubAllGlobals();});

it('bypasses browser HTTP cache on mount and same-URL reload after sign-out',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({status:200,json:async()=>({manifest_id:'first'})})
  .mockResolvedValueOnce({status:401,json:async()=>({error:{code:'unauthorized'}})});
 vi.stubGlobal('fetch',fetcher);
 useRender();const cleanup=h.effect!();await flush();
 expect(useRender().state).toMatchObject({kind:'ok'});
 useRender().reload();expect(useRender().state).toEqual({kind:'loading'});cleanup?.();useRender();h.effect!();await flush();
 expect(useRender().state).toMatchObject({kind:'error',code:'unauthorized'});
 expect(fetcher).toHaveBeenCalledTimes(2);
 for(const call of fetcher.mock.calls)expect(call).toEqual([
  '/api/macro/strategy/transmission?region=US',{credentials:'same-origin',cache:'no-store'},
 ]);
});
it('does not fetch a null URL',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);useRender(null);h.effect!();expect(fetcher).not.toHaveBeenCalled();
});

it('clears account data on auth changes and rejects late responses from the previous session',async()=>{
 const replies:((r:unknown)=>void)[]=[];
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>replies.push(resolve))));
 const reply=(i:number,status:number,body:unknown)=>replies[i]({status,json:async()=>body});
 useRender();const cleanup=h.effect!();reply(0,200,{account:'a'});await flush();
 expect(useRender().state).toMatchObject({kind:'ok'});
 expect(h.auth).toBeTypeOf('function');
 h.auth!('INITIAL_SESSION');expect(replies).toHaveLength(1);
 h.auth!('TOKEN_REFRESHED');expect(useRender().state).toEqual({kind:'loading'});
 h.auth!('SIGNED_OUT');expect(replies).toHaveLength(3);
 reply(1,200,{account:'a-late'});await flush();expect(useRender().state).toEqual({kind:'loading'});
 reply(2,401,{error:{code:'unauthorized'}});await flush();
 expect(useRender().state).toEqual({kind:'error',code:'unauthorized'});
 h.auth!('SIGNED_IN');reply(3,200,{account:'b'});await flush();
 expect(useRender().state).toMatchObject({kind:'ok',data:{account:'b'}});
 cleanup?.();expect(h.auth).toBeUndefined();
});
it('hides the old URL response immediately when switching regions or disabling the request',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:200,json:async()=>({region:'US'})}));
 useRender();h.effect!();await flush();expect(useRender().state.kind).toBe('ok');
 expect(useRender('/api/macro/strategy/transmission?region=CN').state.kind).toBe('loading');
 expect(useRender(null).state.kind).toBe('loading');
});

it('clears a visible successful response immediately on SIGNED_OUT',async()=>{
 const replies:((r:unknown)=>void)[]=[];
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>replies.push(resolve))));
 useRender();const cleanup=h.effect!();
 replies[0]({status:200,json:async()=>({account:'a'})});await flush();
 expect(useRender().state.kind).toBe('ok');
 h.auth!('SIGNED_OUT');expect(useRender().state).toEqual({kind:'loading'});
 expect(replies).toHaveLength(2);
 replies[1]({status:401,json:async()=>({error:{code:'unauthorized'}})});await flush();
 expect(useRender().state).toEqual({kind:'error',code:'unauthorized'});cleanup?.();
});
