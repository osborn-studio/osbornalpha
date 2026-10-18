// State machine for the LLM settings card (design §3.8). Pure: the component renders this state
// and sends the request builders' output to fetch unchanged. `saved` is what the server last
// reported; `draft` is what the user is editing. Readiness is evidence bound to the saved
// configuration's version, never to the presence of a key.

import type { LlmFailure } from './errors';
import { NON_CHAT } from './registry/derive';
import type { CatalogModel } from './catalog';

export interface SavedConfig {
  provider: string | null;
  legacyId: string | null;
  storedProvider: string | null;
  model: string | null;
  version: string | null;
  legacyPath: boolean;
  known: boolean;
  configured: boolean;
}

export type Readiness = 'unconfigured' | 'configured_unverified' | 'ready' | 'stale';

export interface DiscoveryOk { ok: true; latency_ms: number; models: string[]; truncated: boolean; key_source: 'request' | 'saved' }
export type DiscoveryResponse = DiscoveryOk | ({ ok: false; key_source?: 'request' | 'saved' } & LlmFailure) | { ok: false; error: string };
export type ProbeResponse =
  | { ok: true; latency_ms: number; key_source: 'request' | 'saved'; version: string | null }
  | ({ ok: false; key_source?: 'request' | 'saved'; version?: string | null } & LlmFailure)
  | { ok: false; error: string };
export type SaveResponse =
  | { ok: true; provider: string; legacyId: string | null; storedProvider: string; model: string; version: string; legacyPath: boolean }
  | { ok: false; error: string };

export interface ProbeState {
  status: 'running' | 'ok' | 'failed';
  seq?: number;
  /** The probe targeted the saved provider+model with the saved key (no typed key). */
  aboutSaved?: boolean;
  latency_ms?: number;
  failure?: LlmFailure;
  error?: string;
}

export interface SettingsState {
  providers: Array<{ id: string; suggestedModel: string | null }>;
  saved: SavedConfig | null;
  draft: { provider: string; key: string; keyGeneration: number; model: string | null };
  discovery:
    | { status: 'idle' }
    | { status: 'running'; seq: number }
    | { status: 'done'; result: DiscoveryOk }
    | { status: 'failed'; failure?: LlmFailure; error?: string };
  probes: Record<string, ProbeState>;
  readiness: Readiness;
  saving: boolean;
  saveSeq: number | null;
  saveError: string | null;
}

export type Event =
  | { type: 'init'; providers: Array<{ id: string; suggestedModel: string | null }> }
  | { type: 'loaded'; saved: SavedConfig }
  | { type: 'selectProvider'; provider: string }
  | { type: 'editKey'; key: string }
  | { type: 'selectModel'; model: string | null }
  | { type: 'discoverStarted'; seq: number }
  | { type: 'discoverFinished'; seq: number; provider: string; response: DiscoveryResponse }
  | { type: 'probeStarted'; seq: number; model: string }
  | { type: 'probeFinished'; seq: number; provider: string; model: string; response: ProbeResponse }
  | { type: 'saveStarted'; seq: number }
  | { type: 'saveFinished'; seq: number; response: SaveResponse };

export function initialState(providers: Array<{ id: string; suggestedModel: string | null }>): SettingsState {
  return {
    providers,
    saved: null,
    draft: { provider: providers[0]?.id ?? '', key: '', keyGeneration: 0, model: providers[0]?.suggestedModel ?? null },
    discovery: { status: 'idle' },
    probes: {},
    readiness: 'unconfigured',
    saving: false,
    saveSeq: null,
    saveError: null,
  };
}

const typedKey = (s: SettingsState) => s.draft.key.trim();
/** Editing is locked until the saved configuration has been loaded and while a save is in flight. */
export const locked = (s: SettingsState) => s.saving || s.saved === null;
const suggested = (s: SettingsState, provider: string) => s.providers.find((p) => p.id === provider)?.suggestedModel ?? null;
const dropReady = (r: Readiness): Readiness => (r === 'ready' || r === 'stale' ? 'configured_unverified' : r);
const baseline = (saved: SavedConfig | null): Readiness => (saved?.configured ? 'configured_unverified' : 'unconfigured');

export function reduce(s: SettingsState, e: Event): SettingsState {
  switch (e.type) {
    case 'init': {
      const fresh = initialState(e.providers);
      return s.saved ? reduce(fresh, { type: 'loaded', saved: s.saved }) : fresh;
    }
    case 'loaded': {
      const provider = e.saved.provider && e.saved.known ? e.saved.provider : s.draft.provider;
      const model = e.saved.provider && e.saved.known ? e.saved.model : suggested(s, provider);
      return { ...s, saved: e.saved, draft: { provider, key: '', keyGeneration: s.draft.keyGeneration + 1, model }, discovery: { status: 'idle' }, probes: {}, readiness: baseline(e.saved) };
    }
    case 'selectProvider': {
      if (locked(s)) return s;
      const model = s.saved?.provider === e.provider && s.saved.model ? s.saved.model : suggested(s, e.provider);
      return {
        ...s,
        draft: { provider: e.provider, key: '', keyGeneration: s.draft.keyGeneration + 1, model },
        discovery: { status: 'idle' },
        probes: {},
        readiness: dropReady(s.readiness),
        saveError: null,
      };
    }
    case 'editKey':
      if (locked(s)) return s;
      // Probe and discovery results describe the key they ran with; a different key makes them (and
      // in-flight ones) meaningless.
      return { ...s, draft: { ...s.draft, key: e.key, keyGeneration: s.draft.keyGeneration + 1 }, discovery: { status: 'idle' }, probes: {}, readiness: dropReady(s.readiness), saveError: null };
    case 'selectModel':
      if (locked(s)) return s;
      return { ...s, draft: { ...s.draft, model: e.model }, readiness: dropReady(s.readiness), saveError: null };
    case 'discoverStarted':
      return { ...s, discovery: { status: 'running', seq: e.seq } };
    case 'discoverFinished': {
      if (s.discovery.status !== 'running' || s.discovery.seq !== e.seq || s.draft.provider !== e.provider) return s;
      const r = e.response;
      if (r.ok) return { ...s, discovery: { status: 'done', result: r } };
      if ('error' in r) return { ...s, discovery: { status: 'failed', error: r.error } };
      return { ...s, discovery: { status: 'failed', failure: { class: r.class, status: r.status } } };
    }
    case 'probeStarted': {
      const aboutSaved = !typedKey(s) && Boolean(s.saved?.configured) && s.saved?.provider === s.draft.provider && s.saved?.model === e.model;
      return { ...s, probes: { ...s.probes, [e.model]: { status: 'running', seq: e.seq, aboutSaved } } };
    }
    case 'probeFinished': {
      const current = s.probes[e.model];
      if (!current || current.status !== 'running' || current.seq !== e.seq || s.draft.provider !== e.provider) return s;
      const r = e.response;
      const probes = { ...s.probes };
      const saved = s.saved;
      // Whether this probe targeted the saved configuration was decided when it started, so an
      // early failure (key_required because another tab changed the row) still withdraws evidence.
      const aboutSaved = current.aboutSaved === true;
      if (!r.ok) {
        probes[e.model] = 'error' in r ? { status: 'failed', error: r.error } : { status: 'failed', failure: { class: r.class, status: r.status } };
        return { ...s, probes, readiness: aboutSaved ? dropReady(s.readiness) : s.readiness };
      }
      probes[e.model] = { status: 'ok', latency_ms: r.latency_ms };
      let readiness = s.readiness;
      if (aboutSaved && r.key_source === 'saved' && saved) readiness = r.version === saved.version ? 'ready' : 'stale';
      return { ...s, probes, readiness };
    }
    case 'saveStarted':
      return { ...s, saving: true, saveSeq: e.seq, saveError: null };
    case 'saveFinished': {
      if (!s.saving || s.saveSeq !== e.seq) return s;
      const r = e.response;
      if (!r.ok) return { ...s, saving: false, saveSeq: null, saveError: r.error };
      const saved: SavedConfig = { provider: r.provider, legacyId: r.legacyId, storedProvider: r.storedProvider, model: r.model, version: r.version, legacyPath: r.legacyPath, known: true, configured: true };
      return {
        ...s,
        saving: false,
        saveSeq: null,
        saved,
        draft: { provider: r.provider, key: '', keyGeneration: s.draft.keyGeneration + 1, model: r.model },
        // every in-flight probe predates this version: a bumped generation makes them stale
        probes: {},
        readiness: 'configured_unverified',
      };
    }
    default:
      return s;
  }
}

// ---- selectors / request builders ------------------------------------------------------------

export const savedKeyUsable = (s: SettingsState) => Boolean(s.saved?.configured && s.saved.known && s.saved.provider === s.draft.provider);
export const hasKey = (s: SettingsState) => typedKey(s).length > 0 || savedKeyUsable(s);

export const canDiscover = (s: SettingsState) => !locked(s) && hasKey(s) && s.discovery.status !== 'running';
export const canProbe = (s: SettingsState, model: string) => !locked(s) && hasKey(s) && s.probes[model]?.status !== 'running';
export const canSave = (s: SettingsState) => !locked(s) && hasKey(s) && Boolean(s.draft.model);

function withKey<T extends object>(s: SettingsState, body: T): T & { apiKey?: string } {
  const key = typedKey(s);
  return key ? { ...body, apiKey: key } : body;
}
export const discoverRequest = (s: SettingsState) => withKey(s, { provider: s.draft.provider });
export const probeRequest = (s: SettingsState, model: string) => withKey(s, { provider: s.draft.provider, model });
export const saveRequest = (s: SettingsState) => (s.draft.model ? withKey(s, { provider: s.draft.provider, model: s.draft.model }) : null);

export interface ModelRow {
  id: string;
  discovered: boolean;
  catalog: CatalogModel | null;
  saved: boolean;
  custom: boolean;
}

/** Discovery ∪ catalog ∪ saved model ∪ custom draft model, chat-only when `chatOnly`. */
export function modelRows(s: SettingsState, catalog: CatalogModel[], chatOnly: boolean): ModelRow[] {
  const rows = new Map<string, ModelRow>();
  const add = (id: string, patch: Partial<ModelRow>) => {
    const row = rows.get(id) ?? { id, discovered: false, catalog: null, saved: false, custom: false };
    rows.set(id, { ...row, ...patch });
  };
  if (s.discovery.status === 'done') for (const id of s.discovery.result.models) add(id, { discovered: true });
  for (const m of catalog) add(m.id, { catalog: m });
  const savedModel = s.saved?.configured && s.saved.provider === s.draft.provider ? s.saved.model : null;
  if (savedModel) add(savedModel, { saved: true });
  if (s.draft.model && !rows.has(s.draft.model)) add(s.draft.model, { custom: true });
  return [...rows.values()]
    .filter((r) => r.saved || r.custom || !chatOnly || !NON_CHAT.test(r.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}
