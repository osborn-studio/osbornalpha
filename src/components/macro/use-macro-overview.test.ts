import {beforeEach,expect,it,vi} from 'vitest';
import type {OverviewState} from './use-macro-overview';

// Small hook lifecycle harness: effects run after render and can be replayed independently.
const h=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,effect:undefined as undefined|(()=>void|(()=>void)),auth:undefined as undefined|((event:string)=>void),events:new Map<string,()=>void>(),tick:undefined as undefined|(()=>void)}));
vi.mock('react',()=>({
 useState:(initial:unknown)=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?initial():initial;return [h.slots[i],(value:unknown)=>{h.slots[i]=typeof value==='function'?value(h.slots[i]):value;}];},
 useEffect:(effect:()=>void|(()=>void))=>{h.effect=effect;},
}));
vi.mock('@/lib/supabase/client',()=>({getBrowserSupabase:()=>({auth:{onAuthStateChange:(callback:(event:string)=>void)=>{h.auth=callback;return {data:{subscription:{unsubscribe:()=>{h.auth=undefined;}}}};}}})}));
import {useMacroOverview} from './use-macro-overview';
const useRender=(query='region=US'):OverviewState=>{h.cursor=0;return useMacroOverview(query);};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
let replies:((r:Response)=>void)[];
let fetcher:ReturnType<typeof vi.fn>;
const reply=(i:number,value:string)=>replies[i]({ok:true,json:async()=>({value})} as Response);
beforeEach(()=>{
 h.slots=[];h.events.clear();h.effect=undefined;h.auth=undefined;replies=[];
 fetcher=vi.fn(()=>new Promise<Response>(resolve=>replies.push(resolve)));
 vi.stubGlobal('fetch',fetcher);
 vi.stubGlobal('window',{addEventListener:(name:string,cb:()=>void)=>h.events.set(name,cb),removeEventListener:(name:string)=>h.events.delete(name),setInterval:(cb:()=>void)=>{h.tick=cb;return 1;},clearInterval:()=>{h.tick=undefined;}});
});
it('coalesces effect replay and keeps same-query data visible during explicit freshness checks',async()=>{
 expect(useRender().status).toBe('loading');const cleanup=h.effect!();cleanup?.();h.effect!();
 expect(fetcher).toHaveBeenCalledTimes(1);reply(0,'first');await flush();expect(useRender().status).toBe('ok');
 h.events.get('focus')!();expect(useRender().status).toBe('ok');expect(fetcher).toHaveBeenCalledTimes(2);
 reply(1,'fresh');await flush();expect(useRender()).toMatchObject({status:'ok',data:{value:'fresh'}});
 h.tick!();expect(fetcher).toHaveBeenCalledTimes(3);reply(2,'timed');await flush();
});
it('hides a previous query immediately and ignores its late result',async()=>{
 useRender();const cleanup=h.effect!();
 expect(useRender('region=CN').status).toBe('loading');cleanup?.();h.effect!();
 reply(1,'china');await flush();reply(0,'old-us');await flush();
 expect(useRender('region=CN')).toMatchObject({status:'ok',data:{value:'china'}});
});
it('clears displayed data on auth changes and ignores requests from the old auth generation',async()=>{
 useRender();h.effect!();reply(0,'account-a');await flush();expect(useRender().status).toBe('ok');
 h.events.get('focus')!();h.auth!('SIGNED_OUT');expect(useRender().status).toBe('loading');
 reply(1,'old-account');await flush();expect(useRender().status).toBe('loading');
 replies[2]({ok:false,status:401,json:async()=>({error:{code:'unauthenticated'}})} as Response);await flush();
 expect(useRender()).toEqual({status:'error',code:'unauthenticated'});
 h.auth!('SIGNED_IN');expect(useRender().status).toBe('loading');reply(3,'account-b');await flush();
 expect(useRender()).toMatchObject({status:'ok',data:{value:'account-b'}});
});
it('new mounts perform a new authenticated request and unmounted results are ignored',async()=>{
 useRender();const cleanup=h.effect!();cleanup?.();reply(0,'old');await flush();
 h.slots=[];useRender();h.effect!();expect(fetcher).toHaveBeenCalledTimes(2);reply(1,'new');await flush();
 expect(useRender()).toMatchObject({status:'ok',data:{value:'new'}});
});
