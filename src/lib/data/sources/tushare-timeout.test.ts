import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tushareCall, TushareError } from './tushare';
beforeEach(()=>vi.stubEnv('TUSHARE_TOKEN','synthetic-test-token'));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
const payload={code:0,data:{fields:['ts_code','close'],items:[['SYNTHETIC',12]]}};
describe('Tushare owned fetch/body deadline synthetic acceptance',()=>{
  it('retains row mapping and makes a single provider call',async()=>{
    const fn=vi.fn().mockResolvedValue(Response.json(payload));vi.stubGlobal('fetch',fn);expect(await tushareCall('synthetic',{},'ts_code,close')).toEqual([{ts_code:'SYNTHETIC',close:12}]);expect(fn).toHaveBeenCalledTimes(1);expect(fn.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('bounds stuck body at8s, aborts resource and cannot admit late decoded rows',async()=>{
    vi.useFakeTimers();let deliver:(v:unknown)=>void=()=>{};let signal:AbortSignal|undefined;
    const fn=vi.fn((_,options)=>{signal=options.signal;return Promise.resolve({ok:true,json:()=>new Promise(resolve=>{deliver=resolve;})});});vi.stubGlobal('fetch',fn);
    const outcome=tushareCall('synthetic',{},'close').then(()=> 'unexpected-success',(e:Error)=>e.name);await vi.advanceTimersByTimeAsync(8000);expect(await outcome).toBe('TimeoutError');expect(signal!.aborted).toBe(true);deliver(payload);await vi.advanceTimersByTimeAsync(0);expect(await outcome).toBe('TimeoutError');expect(fn).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });
  it('uses one total deadline for slow fetch plus slow body',async()=>{
    vi.useFakeTimers();const fn=vi.fn(()=>new Promise(resolve=>setTimeout(()=>resolve({ok:true,json:()=>new Promise(()=>{})}),7000)));vi.stubGlobal('fetch',fn);
    const outcome=tushareCall('synthetic',{},'close').catch((e:Error)=>e.name);await vi.advanceTimersByTimeAsync(7999);expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(1);expect(await outcome).toBe('TimeoutError');expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects transport ignoring abort and does not read a late response',async()=>{
    vi.useFakeTimers();let deliver:(r:unknown)=>void=()=>{};const fn=vi.fn(()=>new Promise(resolve=>{deliver=resolve;}));vi.stubGlobal('fetch',fn);const outcome=tushareCall('synthetic',{},'close',100).catch((e:Error)=>e.name);await vi.advanceTimersByTimeAsync(100);expect(await outcome).toBe('TimeoutError');const json=vi.fn(async()=>payload);deliver({ok:true,json});await vi.advanceTimersByTimeAsync(0);expect(json).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves HTTP and provider errors, empty rows and JSON rejection without retries',async()=>{
    const fn=vi.fn().mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(Response.json({code:2002,msg:'synthetic'})).mockResolvedValueOnce(Response.json({code:0,data:null})).mockResolvedValueOnce(new Response('{'));vi.stubGlobal('fetch',fn);
    await expect(tushareCall('synthetic',{},'close')).rejects.toMatchObject({code:429});await expect(tushareCall('synthetic',{},'close')).rejects.toBeInstanceOf(TushareError);expect(await tushareCall('synthetic',{},'close')).toEqual([]);await expect(tushareCall('synthetic',{},'close')).rejects.toBeInstanceOf(SyntaxError);expect(fn).toHaveBeenCalledTimes(4);
  });
  it('real localhost body stream is released on the owned deadline',async()=>{
    // Real undici, loopback only; provider URL is intercepted before dispatch.
    const originalFetch=globalThis.fetch;
    let didStart=false;let disconnected=false;
    const server=createServer((req,res)=>{
      didStart=true;req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.write('{');res.on('close',()=>{disconnected=true;});
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw Error('local fixture address');
    const intercepted=vi.fn((_:unknown,options:RequestInit)=>originalFetch(`http://127.0.0.1:${address.port}`,options));vi.stubGlobal('fetch',intercepted);
    try{
      await expect(tushareCall('synthetic',{},'close',250)).rejects.toMatchObject({name:'TimeoutError',message:'Tushare request timed out after 250ms'});
      const until=Date.now()+1000;while(!disconnected&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
      expect(didStart).toBe(true);expect(disconnected).toBe(true);expect(intercepted).toHaveBeenCalledTimes(1);
    }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
  });
  it('dispatches nothing for invalid timeout or missing token',async()=>{
    const fn=vi.fn();vi.stubGlobal('fetch',fn);for(const timeout of [NaN,Infinity,0,-1,3e9])await expect(tushareCall('synthetic',{},'close',timeout)).rejects.toBeInstanceOf(RangeError);vi.stubEnv('TUSHARE_TOKEN','');await expect(tushareCall('synthetic',{},'close')).rejects.toMatchObject({code:-1});expect(fn).not.toHaveBeenCalled();
  });
});
