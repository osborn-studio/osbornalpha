import {expect,it,vi} from 'vitest';
import {OverviewRequest} from './overview-request';
const response=(value:unknown)=>({ok:true,json:async()=>value}) as Response;
it('coalesces only in-flight same-query work in this component, always authenticates later requests',async()=>{
 let finish!:(r:Response)=>void;
 const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));
 const local=new OverviewRequest(fetcher);
 const a=local.load('region=US'),b=local.load('region=US');
 expect(fetcher).toHaveBeenCalledTimes(1);finish(response({regions:{}}));await Promise.all([a,b]);
 const c=local.load('region=US');expect(fetcher).toHaveBeenCalledTimes(2);finish(response({regions:{}}));await c;
 const other=new OverviewRequest(fetcher);const d=other.load('region=US');
 expect(fetcher).toHaveBeenCalledTimes(3);finish(response({regions:{}}));await d;
 expect(fetcher).toHaveBeenCalledWith('/api/macro/overview?region=US',expect.objectContaining({cache:'no-store',credentials:'same-origin'}));
});
it('auth invalidation aborts old work and never joins a prior account request',async()=>{
 const signals:AbortSignal[]=[];
 const fetcher=vi.fn((_url:RequestInfo|URL,init?:RequestInit)=>{signals.push(init!.signal!);return Promise.resolve(response({regions:{}}));});
 const local=new OverviewRequest(fetcher);const old=local.load('region=US');local.invalidate();
 const current=local.load('region=US');expect(fetcher).toHaveBeenCalledTimes(2);expect(signals[0].aborted).toBe(true);
 await Promise.all([old,current]);
});
it('does not reuse failures or completed responses for another query',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({ok:false,status:401,json:async()=>({error:{code:'unauthenticated'}})}).mockResolvedValue(response({regions:{}}));
 const local=new OverviewRequest(fetcher);await expect(local.load('region=US')).rejects.toThrow('unauthenticated');
 await local.load('region=US');await local.load('region=CN');expect(fetcher).toHaveBeenCalledTimes(3);
});
