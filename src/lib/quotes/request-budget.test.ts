import { afterEach, describe, expect, it, vi } from 'vitest';
import { withQuoteRequestBudget, waitQuoteRetry } from './request-budget';
import { withQuoteSourceTimeout } from './source-timeout';
afterEach(() => vi.useRealTimers());
describe('quote request cancellation with synthetic work', () => {
  it('dispatches no work for a cancelled request', async () => {
    const parent = new AbortController(); parent.abort(); const work = vi.fn();
    await expect(withQuoteRequestBudget(parent.signal,work)).rejects.toMatchObject({name:'AbortError'}); expect(work).not.toHaveBeenCalled();
  });
  it('ends stalled route work at20s and cancels nested source waiting', async () => {
    vi.useFakeTimers(); let child: AbortSignal | undefined;
    const p=withQuoteRequestBudget(new AbortController().signal, signal => withQuoteSourceTimeout(s => { child=s; return new Promise(() => {}); },30_000,signal));
    const result=p.catch((e: Error)=>e.name); await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toBe('TimeoutError'); expect(child!.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates caller disconnect and discards late completion', async () => {
    let deliver: (value:string)=>void=()=>{}; let child: AbortSignal | undefined;
    const parent=new AbortController(); const p=withQuoteRequestBudget(parent.signal, signal=> { child=signal; return new Promise<string>(resolve=>{deliver=resolve;}); });
    const result=p.catch((e:Error)=>e.name); parent.abort(); deliver('late'); expect(await result).toBe('AbortError'); expect(child!.aborted).toBe(true);
  });
  it('cleans listeners/timers and aborts completed resources', async () => {
    vi.useFakeTimers(); const parent=new AbortController(); const remove=vi.spyOn(parent.signal,'removeEventListener'); let child:AbortSignal|undefined;
    expect(await withQuoteRequestBudget(parent.signal, async s=> {child=s;return 'ok';})).toBe('ok'); expect(remove).toHaveBeenCalled(); expect(child!.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels retry sleeps without pending timers', async () => {
    vi.useFakeTimers(); const c=new AbortController(); const result=waitQuoteRetry(c.signal).catch((e:Error)=>e.name); c.abort(); expect(await result).toBe('AbortError'); expect(vi.getTimerCount()).toBe(0);
  });
  it('source pre-abort does not dispatch and cleans timer', async () => {
    vi.useFakeTimers(); const parent=new AbortController(); parent.abort(); const work=vi.fn(); await expect(withQuoteSourceTimeout(work,2500,parent.signal)).rejects.toMatchObject({name:'AbortError'});expect(work).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
});
