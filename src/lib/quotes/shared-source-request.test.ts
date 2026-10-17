import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSharedSourceRequests } from './shared-source-request';
afterEach(() => vi.useRealTimers());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
describe('shared quote source ownership synthetic only', () => {
  it('shares an exact key and detaches one caller without cancelling another', async () => {
    const run = createSharedSourceRequests<number>(4000);
    const d = deferred<number>(); let child!: AbortSignal;
    const op = vi.fn((signal: AbortSignal) => { child = signal; return d.promise; });
    const c = new AbortController();
    const a = run('same', op, c.signal).catch(error => error.name);
    const b = run('same', op);
    c.abort(); expect(await a).toBe('AbortError'); expect(child.aborted).toBe(false);
    d.resolve(42); expect(await b).toBe(42); expect(op).toHaveBeenCalledOnce();
  });
  it('starts no request for a pre-aborted subscriber', async () => {
    const run = createSharedSourceRequests<number>(4000); const op = vi.fn();
    const c = new AbortController(); c.abort(); await expect(run('same', op, c.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(op).not.toHaveBeenCalled();
  });
  it('aborts when all subscribers leave and lets a later caller start fresh', async () => {
    const run = createSharedSourceRequests<number>(4000);
    const old = deferred<number>(); const next = deferred<number>(); const signals: AbortSignal[] = [];
    const op = vi.fn((signal: AbortSignal) => { signals.push(signal); return signals.length === 1 ? old.promise : next.promise; });
    const ca = new AbortController(); const cb = new AbortController();
    const a = run('same', op, ca.signal).catch(error => error.name); const b = run('same', op, cb.signal).catch(error => error.name);
    ca.abort(); expect(await a).toBe('AbortError'); expect(signals[0].aborted).toBe(false);
    cb.abort(); expect(await b).toBe('AbortError'); expect(signals[0].aborted).toBe(true);
    const later = run('same', op); old.resolve(1); await Promise.resolve();
    const joined = run('same', op); expect(op).toHaveBeenCalledTimes(2);
    next.resolve(2); expect(await later).toBe(2); expect(await joined).toBe(2);
  });
  it('does not renew the owner deadline for late subscribers and cleans timers', async () => {
    vi.useFakeTimers(); const run = createSharedSourceRequests<number>(4000);
    const op = vi.fn(() => new Promise<number>(() => {}));
    const a = run('same', op).catch(error => error.name);
    await vi.advanceTimersByTimeAsync(3000); const b = run('same', op).catch(error => error.name);
    await vi.advanceTimersByTimeAsync(1000); expect(await a).toBe('TimeoutError'); expect(await b).toBe('TimeoutError'); expect(op).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    expect(await run('same', async () => 3)).toBe(3); expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans failed requests, separates keys, and preserves operation errors', async () => {
    const run = createSharedSourceRequests<number>(4000);
    const fail = vi.fn(async () => { throw new Error('synthetic failure'); });
    await expect(run('bad', fail)).rejects.toThrow('synthetic failure');
    expect(await run('bad', async () => 5)).toBe(5);
    const da = deferred<number>(); const db = deferred<number>();
    const a = run('a', () => da.promise); const b = run('b', () => db.promise);
    da.resolve(6); db.resolve(7); expect(await a).toBe(6); expect(await b).toBe(7);
  });
  it('removes subscriber abort listeners after success and cancellation', async () => {
    const run = createSharedSourceRequests<number>(4000); const c = new AbortController();
    const add = vi.spyOn(c.signal, 'addEventListener'); const remove = vi.spyOn(c.signal, 'removeEventListener');
    expect(await run('same', async () => 8, c.signal)).toBe(8); expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    c.abort(); expect(await run('same', async () => 9)).toBe(9);
  });
  it('publishes a real shared promise before synchronous operation re-entry', async () => {
    const run = createSharedSourceRequests<number>(4000);
    const unused = vi.fn(async () => 0); let nested!: Promise<number>;
    const owner = run('same', () => { nested = run('same', unused); return Promise.resolve(10); });
    expect(await owner).toBe(10); expect(await nested).toBe(10); expect(unused).not.toHaveBeenCalled();
  });
  it('removes abort listeners when a subscriber cancels', async () => {
    const run = createSharedSourceRequests<number>(4000); const c = new AbortController();
    const add = vi.spyOn(c.signal, 'addEventListener'); const remove = vi.spyOn(c.signal, 'removeEventListener');
    const pending = run('same', () => new Promise<number>(() => {}), c.signal).catch(error => error.name);
    c.abort(); expect(await pending).toBe('AbortError'); expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
  });

});
