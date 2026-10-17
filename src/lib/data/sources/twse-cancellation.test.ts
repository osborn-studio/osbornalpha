import { afterEach, describe, expect, it, vi } from 'vitest';
import { quoteSourcesFor } from './registry';
vi.mock('./datagateway-quote', () => ({ isDatagatewayConfigured: () => false }));
import { fetchTwseQuotesBatch } from './twse';
const payload = (code: string) => ({ msgArray: [{ c: code, ex: 'tse', z: '12', y: '11', d: '20261006', t: '12:00:00' }] });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('TWSE quote synthetic cancellation and cache safety', () => {
  it('starts no request for pre-aborted signal', async () => {
    const c=new AbortController(); c.abort(); const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(fetchTwseQuotesBatch(['9101.TW'],c.signal)).rejects.toMatchObject({ name:'AbortError' });expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels real fetch signal cooperatively', async () => {
    let child:AbortSignal|undefined;
    vi.stubGlobal('fetch',vi.fn((_,opts)=>new Promise((_,reject)=>{child=opts.signal;child!.addEventListener('abort',()=>reject(new DOMException('synthetic','AbortError')),{once:true});})));
    const c=new AbortController();const result=fetchTwseQuotesBatch(['9102.TW'],c.signal).catch((e:Error)=>e.name);c.abort();expect(await result).toBe('AbortError');expect(child!.aborted).toBe(true);
  });
  it('bounds body decoding at4s even when the body ignores abort; late body cannot cache', async () => {
    vi.useFakeTimers();let deliver:(v:unknown)=>void=()=>{};
    const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:()=>new Promise(resolve=>{deliver=resolve;})}).mockResolvedValueOnce(Response.json(payload('9103')));vi.stubGlobal('fetch',fetcher);
    const result=fetchTwseQuotesBatch(['9103.TW']);await vi.advanceTimersByTimeAsync(4000);expect((await result).get('9103.TW')).toBe(null);
    deliver(payload('9103'));await vi.advanceTimersByTimeAsync(0);await fetchTwseQuotesBatch(['9103.TW']);expect(fetcher).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
  });
  it('discards a late fetch response after disconnect', async () => {
    let deliver:(v:Response)=>void=()=>{};const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{deliver=resolve;})).mockResolvedValueOnce(Response.json(payload('9104')));vi.stubGlobal('fetch',fetcher);
    const c=new AbortController();const result=fetchTwseQuotesBatch(['9104.TW'],c.signal).catch((e:Error)=>e.name);c.abort();expect(await result).toBe('AbortError');const json=vi.fn(async()=>payload('9104'));deliver({ok:true,json} as unknown as Response);await new Promise(resolve=>setTimeout(resolve,0));expect(json).not.toHaveBeenCalled();await fetchTwseQuotesBatch(['9104.TW']);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('shares an identical miss batch without letting one caller cancel another', async () => {
    let child: AbortSignal | undefined;
    let deliver: (response: Response) => void = () => {};
    const fetcher=vi.fn().mockImplementationOnce((_,opts)=>{child=opts.signal;return new Promise<Response>(resolve=>{deliver=resolve;});});vi.stubGlobal('fetch',fetcher);
    const c=new AbortController();const cancelled=fetchTwseQuotesBatch(['9105.TW'],c.signal).catch((e:Error)=>e.name);const successful=fetchTwseQuotesBatch(['9105.TW']);c.abort();expect(await cancelled).toBe('AbortError');expect(child!.aborted).toBe(false);
    deliver(Response.json(payload('9105')));expect((await successful).get('9105.TW')?.price).toBe(12);
    expect((await fetchTwseQuotesBatch(['9105.TW'])).get('9105.TW')?.source).toBe('twse');expect(fetcher).toHaveBeenCalledOnce();
    const aborted=new AbortController();aborted.abort();await expect(fetchTwseQuotesBatch(['9105.TW'],aborted.signal)).rejects.toMatchObject({name:'AbortError'});expect(fetcher).toHaveBeenCalledOnce();
  });
  it('keeps fresh cache hits when another ticker misses and times out', async () => {
    vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValueOnce(Response.json(payload('9111'))).mockImplementationOnce(()=>new Promise(()=>{}));vi.stubGlobal('fetch',fetcher);
    await fetchTwseQuotesBatch(['9111.TW']);const pending=fetchTwseQuotesBatch(['9111.TW','9112.TW']);await vi.advanceTimersByTimeAsync(4000);const result=await pending;expect(result.get('9111.TW')?.price).toBe(12);expect(result.get('9112.TW')).toBe(null);expect(vi.getTimerCount()).toBe(0);
  });
  it('does not decode or cache a fetch response delivered after provider timeout', async () => {
    vi.useFakeTimers();let deliver:(r:Response)=>void=()=>{};const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{deliver=resolve;})).mockResolvedValueOnce(Response.json(payload('9113')));vi.stubGlobal('fetch',fetcher);
    const pending=fetchTwseQuotesBatch(['9113.TW']);await vi.advanceTimersByTimeAsync(4000);expect((await pending).get('9113.TW')).toBe(null);
    const json=vi.fn(async()=>payload('9113'));deliver({ok:true,json} as unknown as Response);await vi.advanceTimersByTimeAsync(0);expect(json).not.toHaveBeenCalled();await fetchTwseQuotesBatch(['9113.TW']);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('registry forwards the caller signal before provider dispatch', async () => {
    const c=new AbortController();c.abort();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const provider=quoteSourcesFor('TW').find(source=>source.name==='twse')!;await expect(provider.fetch('9114.TW',c.signal)).rejects.toMatchObject({name:'AbortError'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves invalid JSON and missing ticker null behavior', async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('{')).mockResolvedValueOnce(Response.json({msgArray:[]}));vi.stubGlobal('fetch',fetcher);
    expect((await fetchTwseQuotesBatch(['9106.TW'])).get('9106.TW')).toBe(null);expect((await fetchTwseQuotesBatch(['9107.TW','NOT-TW'])).get('9107.TW')).toBe(null);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('shares sorted miss sets despite different cached-hit input composition', async () => {
    let deliver: (response: Response) => void = () => {};
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(payload('9301')))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { deliver = resolve; }));
    vi.stubGlobal('fetch', fetcher); await fetchTwseQuotesBatch(['9301.TW']);
    const a = fetchTwseQuotesBatch(['9303.TW', '9302.TW']);
    const b = fetchTwseQuotesBatch(['9301.TW', '9302.TW', '9303.TW']);
    deliver(Response.json({ msgArray: [...payload('9302').msgArray, ...payload('9303').msgArray] }));
    expect((await a).get('9302.TW')?.price).toBe(12); expect((await b).get('9301.TW')?.price).toBe(12);
    expect((await b).get('9303.TW')?.price).toBe(12); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not deduplicate different overlapping miss sets', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ msgArray: [...payload('9304').msgArray, ...payload('9305').msgArray] }));
    vi.stubGlobal('fetch', fetcher);
    const a = fetchTwseQuotesBatch(['9304.TW']); const b = fetchTwseQuotesBatch(['9304.TW', '9305.TW']);
    expect((await a).get('9304.TW')?.price).toBe(12); expect((await b).get('9305.TW')?.price).toBe(12); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('skips malformed message elements for every subscriber while preserving missing nulls', async () => {
    let deliver: (response: Response) => void = () => {};
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { deliver = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const a = fetchTwseQuotesBatch(['9306.TW', '9307.TW']); const b = fetchTwseQuotesBatch(['9307.TW', '9306.TW']);
    deliver(Response.json({ msgArray: [null, [], 4, 'synthetic', ...payload('9306').msgArray] }));
    for (const pending of [a, b]) { const result = await pending; expect(result.get('9306.TW')?.price).toBe(12); expect(result.get('9307.TW')).toBeNull(); }
    expect(fetcher).toHaveBeenCalledOnce();
  });

});
