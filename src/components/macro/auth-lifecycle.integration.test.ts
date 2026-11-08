// Real React effects/state/StrictMode; only the external auth and HTTP boundaries are fixtures.
import {act, createElement, StrictMode} from 'react';
import {create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useMacroOverview} from './use-macro-overview';
import {useStrategyFetch} from './strategy/use-strategy-fetch';

const auth = vi.hoisted(() => ({listeners: new Set<(event: string) => void>()}));
vi.mock('@/lib/supabase/client', () => ({getBrowserSupabase: () => ({auth: {
  onAuthStateChange: (listener: (event: string) => void) => {
    auth.listeners.add(listener);
    return {data: {subscription: {unsubscribe: () => auth.listeners.delete(listener)}}};
  },
}})}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}
const overviewBody = (id: string) => ({regions: {US: {
  snapshotId: id, asOf: '2026-11-08', catalogVersion: 'test', methodologyVersion: 'test',
  collection: [], indicators: [], changes: {counts: {new_release: 0, revised: 0, late: 0, missing: 0}, items: []}, catalogCounts: null,
}}});
function OverviewProbe({region}: {region: string}) {
  return createElement('output', null, JSON.stringify(useMacroOverview(`region=${region}`)));
}
function StrategyProbe({region}: {region: string}) {
  const {state} = useStrategyFetch(`/api/macro/strategy/transmission?region=${region}`);
  return createElement('output', null, JSON.stringify(state));
}

let root: ReactTestRenderer | undefined;
let requests: {url: string; options?: RequestInit; response: ReturnType<typeof deferred<Response>>}[];
let events: EventTarget;
async function emitAuth(event: string) {
  await act(async () => {for (const listener of auth.listeners) listener(event);});
}
async function respond(index: number, body: unknown, status = 200) {
  await act(async () => {requests[index].response.resolve(new Response(JSON.stringify(body), {status}));});
}
function rendered() {
  const output = root!.toJSON() as {children: string[]};
  return JSON.parse(output.children.join(''));
}
beforeEach(() => {
  auth.listeners.clear(); requests = []; events = new EventTarget();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
  });
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    const response = deferred<Response>(); requests.push({url, options, response}); return response.promise;
  }));
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  expect(auth.listeners.size).toBe(0);
  vi.unstubAllGlobals();
});

for (const surface of ['overview', 'strategy'] as const) {
  const Probe = surface === 'overview' ? OverviewProbe : StrategyProbe;
  const body = surface === 'overview' ? overviewBody : (id: string) => ({manifest_id: id});
  const loading = surface === 'overview' ? {status: 'loading'} : {kind: 'loading'};
  const ok = (id: string) => surface === 'overview'
    ? {status: 'ok', data: body(id)} : {kind: 'ok', data: body(id)};
  const mount = async () => {
    await act(async () => {root = create(createElement(StrictMode, null, createElement(Probe, {region: 'US'})));});
    expect(auth.listeners.size).toBe(1);
    for (const request of requests) expect(request.options).toMatchObject({cache: 'no-store', credentials: 'same-origin'});
  };
  describe(`${surface} real React auth lifecycle`, () => {
    it('clears visible data on logout and rejects an old body that completes after the new account', async () => {
      await mount();
      const initial = requests.length - 1;
      await respond(initial, body('account-a'));
      expect(rendered()).toEqual(ok('account-a'));
      await emitAuth('TOKEN_REFRESHED');
      const oldBody = deferred<unknown>();
      const oldRequest = requests.length - 1;
      // Headers have arrived, but parsing continues across both auth transitions.
      await act(async () => {requests[oldRequest].response.resolve({ok: true, status: 200, json: () => oldBody.promise} as Response);});
      await emitAuth('SIGNED_OUT');
      expect(rendered()).toEqual(loading);
      await respond(requests.length - 1, {error: {code: 'unauthenticated'}}, 401);
      expect(rendered()).toMatchObject(surface === 'overview' ? {status: 'error'} : {kind: 'error'});
      expect(JSON.stringify(rendered())).not.toContain('account-a');
      await emitAuth('SIGNED_IN');
      expect(rendered()).toEqual(loading);
      await respond(requests.length - 1, body('account-b'));
      expect(rendered()).toEqual(ok('account-b'));
      await act(async () => {oldBody.resolve(body('account-a-late'));});
      expect(rendered()).toEqual(ok('account-b'));
      // StrictMode's discarded first strategy request must also remain discarded.
      if (initial > 0) await respond(0, body('strict-replay-late'));
      expect(rendered()).toEqual(ok('account-b'));
    });
    it('ignores INITIAL_SESSION, clears on a direct account switch, and rejects the old response', async () => {
      await mount();
      const count = requests.length;
      await emitAuth('INITIAL_SESSION'); expect(requests).toHaveLength(count);
      await respond(count - 1, body('account-a'));
      await emitAuth('TOKEN_REFRESHED'); const oldRequest = requests.length - 1;
      await emitAuth('SIGNED_IN'); expect(rendered()).toEqual(loading);
      await respond(requests.length - 1, body('account-b'));
      await respond(oldRequest, body('account-a-late'));
      expect(rendered()).toEqual(ok('account-b'));
    });
    it('keeps the new region when the previous region completes late and unsubscribes on unmount', async () => {
      await mount(); const oldRequest = requests.length - 1;
      await act(async () => {root!.update(createElement(StrictMode, null, createElement(Probe, {region: 'CN'})));});
      expect(rendered()).toEqual(loading); expect(auth.listeners.size).toBe(1);
      expect(requests.at(-1)!.url).toContain('region=CN');
      await respond(requests.length - 1, body('cn-current'));
      await respond(oldRequest, body('us-late'));
      expect(rendered()).toEqual(ok('cn-current'));
      await act(async () => root!.unmount()); root = undefined;
      expect(auth.listeners.size).toBe(0);
      const count = requests.length;
      await emitAuth('SIGNED_IN');
      await act(async () => {events.dispatchEvent(new Event('focus'));});
      expect(requests).toHaveLength(count);
    });
  });
}
