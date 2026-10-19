import { describe, expect, it } from 'vitest';
import {
  initialState,
  locked,
  reduce,
  canDiscover,
  canProbe,
  canSave,
  discoverRequest,
  probeRequest,
  saveRequest,
  modelRows,
  type SettingsState,
  type SavedConfig,
} from './settings-state';

const PROVIDERS = [
  { id: 'deepseek', suggestedModel: 'deepseek-v4-flash' },
  { id: 'minimax_cn', suggestedModel: 'MiniMax-M3' },
  { id: 'doubao', suggestedModel: 'doubao-seed-code' },
];

const SAVED: SavedConfig = { provider: 'deepseek', legacyId: 'deepseek', storedProvider: 'deepseek', model: 'deepseek-chat', version: 'v1', legacyPath: false, known: true, configured: true };
const NONE: SavedConfig = { provider: null, legacyId: null, storedProvider: null, model: null, version: null, legacyPath: false, known: false, configured: false };

function loaded(saved: SavedConfig = SAVED): SettingsState {
  return reduce(initialState(PROVIDERS), { type: 'loaded', saved });
}

describe('settings-state: nothing is editable until the saved configuration has loaded', () => {
  it('ignores edits and refuses actions before loaded, so a slow initial request cannot swallow a pasted key', () => {
    let s = reduce(initialState(PROVIDERS), { type: 'editKey', key: 'pasted-early' });
    expect(s.draft.key).toBe('');
    expect(locked(s)).toBe(true);
    expect(canSave(s)).toBe(false);
    expect(canDiscover(s)).toBe(false);
    s = reduce(s, { type: 'selectProvider', provider: 'minimax_cn' });
    expect(s.draft.provider).toBe('deepseek');
    s = reduce(s, { type: 'loaded', saved: NONE });
    expect(locked(s)).toBe(false);
    expect(reduce(s, { type: 'editKey', key: 'k' }).draft.key).toBe('k');
  });
});

describe('settings-state: loading', () => {
  it('init seeds the provider list and replays an already-loaded saved configuration', () => {
    let s = reduce(initialState([]), { type: 'loaded', saved: SAVED });
    s = reduce(s, { type: 'init', providers: PROVIDERS });
    expect(s.providers).toEqual(PROVIDERS);
    expect(s.draft).toMatchObject({ provider: 'deepseek', model: 'deepseek-chat' });
    expect(reduce(initialState([]), { type: 'init', providers: PROVIDERS }).draft.provider).toBe('deepseek');
  });

  it('preselects the saved provider and model and starts configured_unverified', () => {
    const s = loaded();
    expect(s.draft.provider).toBe('deepseek');
    expect(s.draft.model).toBe('deepseek-chat');
    expect(s.readiness).toBe('configured_unverified');
  });
  it('without a row: first provider, its suggested model, unconfigured', () => {
    const s = loaded(NONE);
    expect(s.draft.provider).toBe('deepseek');
    expect(s.draft.model).toBe('deepseek-v4-flash');
    expect(s.readiness).toBe('unconfigured');
  });
});

describe('settings-state: provider switch clears the plaintext key and everything derived from it', () => {
  it('clears key, discovery, probes and preselects the suggested model', () => {
    let s = loaded();
    s = reduce(s, { type: 'editKey', key: 'sk-A' });
    s = reduce(s, { type: 'discoverStarted', seq: 1 });
    s = reduce(s, { type: 'discoverFinished', seq: 1, provider: 'deepseek', response: { ok: true, latency_ms: 5, models: ['deepseek-chat'], truncated: false, key_source: 'request' } });
    s = reduce(s, { type: 'selectProvider', provider: 'minimax_cn' });
    expect(s.draft.key).toBe('');
    expect(s.draft.model).toBe('MiniMax-M3');
    expect(s.discovery.status).toBe('idle');
    expect(s.probes).toEqual({});
    expect(discoverRequest(s)).toEqual({ provider: 'minimax_cn' });
  });
  it('switching back to the saved provider preselects the saved model', () => {
    let s = loaded();
    s = reduce(s, { type: 'selectProvider', provider: 'minimax_cn' });
    s = reduce(s, { type: 'selectProvider', provider: 'deepseek' });
    expect(s.draft.model).toBe('deepseek-chat');
  });
});

describe('settings-state: request builders omit the key when the input is empty', () => {
  it('discover/probe/save carry apiKey only when typed', () => {
    let s = loaded();
    expect(discoverRequest(s)).toEqual({ provider: 'deepseek' });
    expect(probeRequest(s, 'deepseek-chat')).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
    expect(saveRequest(s)).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
    s = reduce(s, { type: 'editKey', key: ' sk-new ' });
    expect(discoverRequest(s)).toEqual({ provider: 'deepseek', apiKey: 'sk-new' });
    expect(probeRequest(s, 'other')).toEqual({ provider: 'deepseek', model: 'other', apiKey: 'sk-new' });
    expect(saveRequest(s)).toEqual({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-new' });
  });
  it('canDiscover/canProbe need a key: typed, or saved for the same provider', () => {
    let s = loaded();
    expect(canDiscover(s)).toBe(true);
    s = reduce(s, { type: 'selectProvider', provider: 'minimax_cn' });
    expect(canDiscover(s)).toBe(false);
    expect(canProbe(s, 'MiniMax-M3')).toBe(false);
    s = reduce(s, { type: 'editKey', key: 'k' });
    expect(canDiscover(s)).toBe(true);
    expect(canProbe(s, 'MiniMax-M3')).toBe(true);
    expect(canSave(s)).toBe(true);
    s = reduce(s, { type: 'selectModel', model: null });
    expect(canSave(s)).toBe(false);
    expect(saveRequest(s)).toBeNull();
  });
});

describe('settings-state: late responses are discarded', () => {
  it('ignores a discovery response whose seq or provider no longer matches', () => {
    let s = loaded();
    s = reduce(s, { type: 'editKey', key: 'k' });
    s = reduce(s, { type: 'discoverStarted', seq: 1 });
    s = reduce(s, { type: 'selectProvider', provider: 'minimax_cn' });
    s = reduce(s, { type: 'discoverFinished', seq: 1, provider: 'deepseek', response: { ok: true, latency_ms: 5, models: ['deepseek-chat'], truncated: false, key_source: 'request' } });
    expect(s.discovery.status).toBe('idle');
    s = reduce(s, { type: 'editKey', key: 'k2' });
    s = reduce(s, { type: 'discoverStarted', seq: 2 });
    s = reduce(s, { type: 'discoverFinished', seq: 3, provider: 'minimax_cn', response: { ok: true, latency_ms: 5, models: ['MiniMax-M3'], truncated: true, key_source: 'request' } });
    expect(s.discovery.status).toBe('running');
    s = reduce(s, { type: 'discoverFinished', seq: 2, provider: 'minimax_cn', response: { ok: true, latency_ms: 5, models: ['MiniMax-M3'], truncated: true, key_source: 'request' } });
    expect(s.discovery).toMatchObject({ status: 'done', result: { models: ['MiniMax-M3'], truncated: true } });
  });
  it('drops discovery results, finished or in flight, when the key changes', () => {
    let s = loaded();
    s = reduce(s, { type: 'editKey', key: 'A' });
    s = reduce(s, { type: 'discoverStarted', seq: 1 });
    s = reduce(s, { type: 'editKey', key: 'B' });
    s = reduce(s, { type: 'discoverFinished', seq: 1, provider: 'deepseek', response: { ok: true, latency_ms: 5, models: ['deepseek-chat'], truncated: false, key_source: 'request' } });
    expect(s.discovery.status).toBe('idle');
    s = reduce(s, { type: 'discoverStarted', seq: 2 });
    s = reduce(s, { type: 'discoverFinished', seq: 2, provider: 'deepseek', response: { ok: true, latency_ms: 5, models: ['deepseek-chat'], truncated: false, key_source: 'request' } });
    expect(s.discovery.status).toBe('done');
    expect(reduce(s, { type: 'editKey', key: 'C' }).discovery.status).toBe('idle');
  });
  it('ignores a probe response after the key changed', () => {
    let s = loaded();
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-chat' });
    s = reduce(s, { type: 'editKey', key: 'rotated' });
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-chat', response: { ok: true, latency_ms: 3, key_source: 'saved', version: 'v1' } });
    expect(s.probes['deepseek-chat']).toBeUndefined();
    expect(s.readiness).toBe('configured_unverified');
  });
});

describe('settings-state: readiness is evidence bound to the saved configuration', () => {
  const ok = (version: string | null, key_source: 'saved' | 'request') => ({ ok: true as const, latency_ms: 3, key_source, version });
  it('becomes ready only when a saved-key probe of the saved provider+model returns the saved version', () => {
    let s = loaded();
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-chat' });
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-chat', response: ok('v1', 'saved') });
    expect(s.readiness).toBe('ready');
    expect(s.probes['deepseek-chat']).toMatchObject({ status: 'ok', latency_ms: 3 });
  });
  it('a request-key probe proves the typed key, not the saved configuration', () => {
    let s = loaded();
    s = reduce(s, { type: 'editKey', key: 'typed' });
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-chat' });
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-chat', response: ok(null, 'request') });
    expect(s.probes['deepseek-chat']).toMatchObject({ status: 'ok' });
    expect(s.readiness).toBe('configured_unverified');
  });
  it('a probe of another model or a version mismatch never yields ready; mismatch flags stale', () => {
    let s = loaded();
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-reasoner' });
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-reasoner', response: ok('v1', 'saved') });
    expect(s.readiness).toBe('configured_unverified');
    s = reduce(s, { type: 'probeStarted', seq: 2, model: 'deepseek-chat' });
    s = reduce(s, { type: 'probeFinished', seq: 2, provider: 'deepseek', model: 'deepseek-chat', response: ok('v2-elsewhere', 'saved') });
    expect(s.readiness).toBe('stale');
  });
  it('typing a key, selecting a model, switching provider or saving drops ready', () => {
    const ready = () => {
      let s = loaded();
      s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-chat' });
      return reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-chat', response: ok('v1', 'saved') });
    };
    expect(reduce(ready(), { type: 'editKey', key: 'x' }).readiness).toBe('configured_unverified');
    expect(reduce(ready(), { type: 'selectModel', model: 'deepseek-reasoner' }).readiness).toBe('configured_unverified');
    expect(reduce(ready(), { type: 'selectProvider', provider: 'minimax_cn' }).readiness).toBe('configured_unverified');
    let s = reduce(ready(), { type: 'saveStarted', seq: 5 });
    s = reduce(s, { type: 'saveFinished', seq: 5, response: { ok: true, provider: 'deepseek', legacyId: 'deepseek', storedProvider: 'deepseek', model: 'deepseek-chat', version: 'v2', legacyPath: false } });
    expect(s.readiness).toBe('configured_unverified');
  });
  it('a failed retest of the saved configuration withdraws ready; a failed probe of another model does not', () => {
    let s = loaded();
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-chat' });
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-chat', response: ok('v1', 'saved') });
    expect(s.readiness).toBe('ready');
    s = reduce(s, { type: 'probeStarted', seq: 2, model: 'deepseek-reasoner' });
    s = reduce(s, { type: 'probeFinished', seq: 2, provider: 'deepseek', model: 'deepseek-reasoner', response: { ok: false, class: 'not_found', status: 404, key_source: 'saved', version: 'v1' } });
    expect(s.readiness).toBe('ready');
    s = reduce(s, { type: 'probeStarted', seq: 3, model: 'deepseek-chat' });
    s = reduce(s, { type: 'probeFinished', seq: 3, provider: 'deepseek', model: 'deepseek-chat', response: { ok: false, class: 'auth', status: 401, key_source: 'saved', version: 'v1' } });
    expect(s.readiness).toBe('configured_unverified');
  });
  it('an early server failure (key_required after another tab changed the row) withdraws ready', () => {
    let s = loaded();
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-chat' });
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-chat', response: ok('v1', 'saved') });
    expect(s.readiness).toBe('ready');
    s = reduce(s, { type: 'probeStarted', seq: 2, model: 'deepseek-chat' });
    s = reduce(s, { type: 'probeFinished', seq: 2, provider: 'deepseek', model: 'deepseek-chat', response: { ok: false, error: 'key_required' } });
    expect(s.readiness).toBe('configured_unverified');
    expect(s.probes['deepseek-chat']).toEqual({ status: 'failed', error: 'key_required' });
  });
  it('selecting another model while a saved-model probe is in flight stops its late success from setting ready', () => {
    let s = loaded();
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-chat' });
    s = reduce(s, { type: 'selectModel', model: 'deepseek-reasoner' });
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-chat', response: ok('v1', 'saved') });
    expect(s.probes['deepseek-chat']).toMatchObject({ status: 'ok' });
    expect(s.readiness).toBe('configured_unverified');
  });
  it('failed probes record the failure class and never set ready', () => {
    let s = loaded();
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'deepseek-chat' });
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'deepseek', model: 'deepseek-chat', response: { ok: false, class: 'auth', status: 401, key_source: 'saved', version: 'v1' } });
    expect(s.probes['deepseek-chat']).toEqual({ status: 'failed', failure: { class: 'auth', status: 401 } });
    expect(s.readiness).toBe('configured_unverified');
  });
});

describe('settings-state: saving locks the card and replaces the saved configuration', () => {
  it('locks while saving, then adopts the response, clears the key and invalidates in-flight probes', () => {
    let s = loaded(NONE);
    s = reduce(s, { type: 'selectProvider', provider: 'minimax_cn' });
    s = reduce(s, { type: 'editKey', key: 'k' });
    s = reduce(s, { type: 'probeStarted', seq: 1, model: 'MiniMax-M3' });
    s = reduce(s, { type: 'saveStarted', seq: 2 });
    expect(s.saving).toBe(true);
    expect(canDiscover(s)).toBe(false);
    expect(canSave(s)).toBe(false);
    s = reduce(s, { type: 'saveFinished', seq: 2, response: { ok: true, provider: 'minimax_cn', legacyId: 'minimax', storedProvider: 'minimax_cn', model: 'MiniMax-M3', version: 'v3', legacyPath: false } });
    expect(s.saving).toBe(false);
    expect(s.saved).toMatchObject({ provider: 'minimax_cn', model: 'MiniMax-M3', version: 'v3', configured: true });
    expect(s.draft.key).toBe('');
    expect(s.readiness).toBe('configured_unverified');
    s = reduce(s, { type: 'probeFinished', seq: 1, provider: 'minimax_cn', model: 'MiniMax-M3', response: { ok: true, latency_ms: 1, key_source: 'request', version: null } });
    expect(s.probes['MiniMax-M3']).toBeUndefined();
    expect(canDiscover(s)).toBe(true);
  });
  it('a failed save unlocks and keeps the draft and the previous saved configuration', () => {
    let s = loaded();
    s = reduce(s, { type: 'editKey', key: 'k' });
    s = reduce(s, { type: 'saveStarted', seq: 1 });
    s = reduce(s, { type: 'saveFinished', seq: 1, response: { ok: false, error: 'store_unavailable' } });
    expect(s.saving).toBe(false);
    expect(s.saveError).toBe('store_unavailable');
    expect(s.draft.key).toBe('k');
    expect(s.saved).toEqual(SAVED);
  });
});

describe('settings-state: model rows', () => {
  it('unions discovery, catalog, the saved model and the custom draft model, tagged by source', () => {
    let s = loaded({ ...SAVED, model: 'legacy-custom' });
    s = reduce(s, { type: 'editKey', key: 'k' });
    s = reduce(s, { type: 'discoverStarted', seq: 1 });
    s = reduce(s, { type: 'discoverFinished', seq: 1, provider: 'deepseek', response: { ok: true, latency_ms: 1, models: ['deepseek-chat', 'deepseek-new'], truncated: false, key_source: 'request' } });
    s = reduce(s, { type: 'selectModel', model: 'my-custom' });
    const rows = modelRows(s, [{ id: 'deepseek-chat', context: 128000, output: 8192, reasoning: false, structured_output: true, price: null, hint: null }, { id: 'text-embedding', context: 1, output: 1, reasoning: false, structured_output: false, price: null, hint: null }], true);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId['deepseek-chat']).toMatchObject({ discovered: true, catalog: expect.objectContaining({ context: 128000 }) });
    expect(byId['deepseek-new']).toMatchObject({ discovered: true, catalog: null });
    expect(byId['legacy-custom']).toMatchObject({ discovered: false, catalog: null, saved: true });
    expect(byId['my-custom']).toMatchObject({ discovered: false, catalog: null, custom: true });
    expect(byId['text-embedding']).toBeUndefined();
    expect(modelRows(s, [], false).map((r) => r.id)).toContain('my-custom');
  });
});
