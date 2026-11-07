/** Actual route exports, synthetic memory data. No deployed database, cookies, or storage requests. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {memoryTableClient} from '../../src/lib/db/memory-table-client';
import {CATALOG_VERSION} from '../../src/lib/macro/catalog';
import {memoryMacroDb, type MemoryMacroDb} from '../../src/lib/macro/memory-db';
import {memoryEvidenceStore, sha256Hex} from '../../src/lib/macro/evidence';
import {seedCatalog} from '../../src/lib/macro/testing/seed';
import type {MacroDb} from '../../src/lib/macro/db';
import type {MacroRouteDeps} from '../../src/lib/macro/route-helpers';
import type {VersionsJson} from '../../src/components/macro/view-model';
import {proofRows, selectVersion} from '../../src/components/macro/view-model';
import {fixtures as browserFixtures} from './fixtures';

const boundary = vi.hoisted(() => ({
  auth: vi.fn(),
  deps: vi.fn<() => MacroRouteDeps>(),
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({auth: {getUser: boundary.auth}}),
}));
// Throwing clients make accidentally falling through to production wiring a test failure.
vi.mock('@/lib/supabase/admin', () => ({getAdminSupabase: () => {throw new Error('production client forbidden');}}));
vi.mock('@/lib/supabase/anon', () => ({getAnonSupabase: () => {throw new Error('production client forbidden');}}));
vi.mock('@/lib/macro/route-helpers', async original => ({
  ...await original<typeof import('../../src/lib/macro/route-helpers')>(),
  macroRouteDeps: boundary.deps,
}));

import {GET as evidenceGET} from '../../src/app/api/macro/evidence/[sha256]/route';
import {GET as versionsGET} from '../../src/app/api/macro/series/[id]/versions/route';

const ORIGIN = 'http://127.0.0.1:3147';
const PERIOD = '2026-09-30';
const OLD_AT = '2026-10-15T12:30:00.000Z';
const NEW_AT = '2026-10-16T12:30:00.000Z';
const OLD_BATCH = '00000000-0000-4000-8000-000000000501';
const NEW_BATCH = '00000000-0000-4000-8000-000000000502';
const OLD_BYTES = new TextEncoder().encode('DATE,CPIAUCSL\n2025-09-30,100\n2026-09-30,102.9\n');
const NEW_BYTES = new TextEncoder().encode('DATE,CPIAUCSL\n2026-09-30,103.4\n');
const OLD_SHA = sha256Hex(OLD_BYTES);
const NEW_SHA = sha256Hex(NEW_BYTES);
const code = (suffix: string) => `fixture-session-5-${suffix}`;
const getEvidence = (sha256: string) => evidenceGET(
  new Request(`${ORIGIN}/api/macro/evidence/${encodeURIComponent(sha256)}`),
  {params: Promise.resolve({sha256})},
);
const getVersions = (series = 'US_CPI_YOY', query = `period_end=${PERIOD}`) => versionsGET(
  new Request(`${ORIGIN}/api/macro/series/${series}/versions?${query}`),
  {params: Promise.resolve({id: series})},
);

let db: MemoryMacroDb;
let store: ReturnType<typeof memoryEvidenceStore>;
let deps: MacroRouteDeps;
let oldReceipt: string;
let newReceipt: string;
let oldNative: string;
let baseNative: string;
let oldDerived: string;
let newDerived: string;
let signedObjects: Map<string, string>;

async function registerBytes(bytes: Uint8Array, batch: string, at: string) {
  const sha256 = sha256Hex(bytes);
  const receipt = {
    fetch_url: 'https://source.invalid/fixture/cpi.csv', fetch_host: 'source.invalid',
    http_status: 200, fetched_at: at, batch_id: batch, tool_versions: {parser: 'fixture-csv/1'},
  };
  const saved = await store.put({
    sha256, bytes, adapter: 'fred_csv', fetchUrl: receipt.fetch_url, fetchHost: receipt.fetch_host,
    httpStatus: 200, contentType: 'text/csv', fetchedAt: at, toolVersions: receipt.tool_versions,
  });
  return db.putRetrieval({
    sha256, object_path: saved.objectPath, adapter: 'fred_csv', content_type: 'text/csv', byte_length: bytes.byteLength,
  }, receipt);
}

/** Mask one read boundary to model an unreadable ancestor or missing receipt/object. */
function withDb(overrides: Partial<MacroDb>) {
  boundary.deps.mockReturnValue({...deps, db: new Proxy(db, {
    get(target, key, receiver) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) return Reflect.get(overrides, key);
      const value = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  })});
}

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(() => {throw new Error('network forbidden in audit fixtures');}));
  boundary.auth.mockResolvedValue({data: {user: {id: 'fixture-session-5'}}, error: null});
  db = memoryMacroDb();
  db.setNow(OLD_AT);
  store = memoryEvidenceStore();
  signedObjects = new Map();
  deps = {
    db, tables: memoryTableClient({}),
    signedUrl: vi.fn(async (path, expires) => {
      if (!store.read(path)) throw new Error('fixture object absent');
      const url = `${ORIGIN}/__fixture/evidence/${encodeURIComponent(path)}?expires=${expires}`;
      signedObjects.set(url, path);
      return url;
    }),
  };
  boundary.deps.mockReturnValue(deps);
  await seedCatalog(db);
  db.setBatchStatus(OLD_BATCH, 'running');
  oldReceipt = await registerBytes(OLD_BYTES, OLD_BATCH, OLD_AT);
  const raw = await db.writeObservations(OLD_BATCH, code('old'), [
    {series_id: 'US_CPI_INDEX', period_end: '2025-09-30', value_text: '100', available_at: OLD_AT, revisable: true,
      retrieval_id: oldReceipt, locator: {kind: 'csv_row', line: 2, column: 1}},
    {series_id: 'US_CPI_INDEX', period_end: PERIOD, value_text: '102.9', available_at: OLD_AT, revisable: true,
      retrieval_id: oldReceipt, locator: {kind: 'csv_row', line: 3, column: 1}},
  ]);
  expect(raw).toMatchObject({inserted: 2, conflicts: []});
  db.setBatchStatus(OLD_BATCH, 'success');
  [baseNative] = (await db.versionsOf('US_CPI_INDEX', '2025-09-30')).map(r => r.observation_id);
  [oldNative] = (await db.versionsOf('US_CPI_INDEX', PERIOD)).map(r => r.observation_id);
  db.setBatchStatus(OLD_BATCH, 'running');
  const derived = await db.writeObservations(OLD_BATCH, code('old'), [{
    series_id: 'US_CPI_YOY', period_end: PERIOD, value_text: '2.9', available_at: OLD_AT, revisable: true,
    derived_from: [baseNative, oldNative], transform: 'yoy_from_index@1',
  }]);
  expect(derived).toMatchObject({inserted: 1, conflicts: []});
  db.setBatchStatus(OLD_BATCH, 'success');
  [oldDerived] = (await db.versionsOf('US_CPI_YOY', PERIOD)).map(r => r.observation_id);

  db.setNow(NEW_AT);
  db.setBatchStatus(NEW_BATCH, 'running');
  newReceipt = await registerBytes(NEW_BYTES, NEW_BATCH, NEW_AT);
  const revision = await db.writeObservations(NEW_BATCH, code('new'), [{
    series_id: 'US_CPI_INDEX', period_end: PERIOD, value_text: '103.4', available_at: NEW_AT, revisable: true,
    retrieval_id: newReceipt, locator: {kind: 'csv_row', line: 2, column: 1},
  }]);
  expect(revision).toMatchObject({versioned: 1, conflicts: []});
  db.setBatchStatus(NEW_BATCH, 'success');
  const current = (await db.versionsOf('US_CPI_INDEX', PERIOD)).find(r => r.version === 2)!;
  expect(current).toBeDefined();
  db.setBatchStatus(NEW_BATCH, 'running');
  const revisedDerived = await db.writeObservations(NEW_BATCH, code('new'), [{
    series_id: 'US_CPI_YOY', period_end: PERIOD, value_text: '3.4', available_at: NEW_AT, revisable: true,
    derived_from: [baseNative, current.observation_id], transform: 'yoy_from_index@1',
  }]);
  expect(revisedDerived).toMatchObject({versioned: 1, conflicts: []});
  db.setBatchStatus(NEW_BATCH, 'success');
  newDerived = (await db.versionsOf('US_CPI_YOY', PERIOD)).find(r => r.version === 2)!.observation_id;
  boundary.deps.mockClear();
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

async function bodyOfVersions(series?: string): Promise<VersionsJson> {
  const response = await getVersions(series);
  expect(response.status).toBe(200);
  return response.json();
}

async function expectError(response: Response, status: number, errorCode: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const messages: Record<string, string> = {
    internal: 'macro read failed', unauthenticated: 'sign in required',
    not_found: 'evidence not found', 'invalid_parameter:sha256': 'invalid sha256',
  };
  expect(await response.json()).toEqual({error: {code: errorCode, message: messages[errorCode]}});
}

describe('actual evidence GET with fixture memory dependencies', () => {
  it('accepts every registered browser evidence object through the real memory DB/store and GET contract', async () => {
    db.setBatchStatus(NEW_BATCH, 'running');
    for (const [sha, metadata] of Object.entries(browserFixtures.valid.evidence)) {
      const bytes = new TextEncoder().encode(browserFixtures.valid.evidenceBodies[sha]);
      expect(sha256Hex(bytes)).toBe(sha);
      expect(metadata.evidence.byte_length).toBe(bytes.byteLength);
      const receipt = metadata.retrievals[0];
      const saved = await store.put({sha256: sha, bytes, adapter: metadata.evidence.adapter,
        contentType: metadata.evidence.content_type, fetchUrl: receipt.fetch_url, fetchHost: receipt.fetch_host,
        fetchedAt: receipt.fetched_at, httpStatus: receipt.http_status, toolVersions: receipt.tool_versions});
      expect(metadata.evidence.object_path).toBe(saved.objectPath);
      const receiptId = await db.putRetrieval(metadata.evidence, {...receipt, batch_id: NEW_BATCH});
      const response = await getEvidence(sha);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.evidence).toMatchObject({sha256: sha, object_path: saved.objectPath,
        adapter: metadata.evidence.adapter, content_type: metadata.evidence.content_type, byte_length: bytes.byteLength});
      expect(body.retrievals).toHaveLength(1);
      expect(body.retrievals[0]).toMatchObject({retrieval_id: receiptId, sha256: sha, fetch_url: receipt.fetch_url});
      expect(store.read(signedObjects.get(body.download.url)!)).toEqual(bytes);
    }
  });

  it('returns exact metadata, receipts, and a 60 second download URL for hashed fixture bytes', async () => {
    const response = await getEvidence(OLD_SHA);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body.catalogVersion).toBe(CATALOG_VERSION);
    expect(body.evidence).toEqual(await db.evidenceObject(OLD_SHA));
    expect(body.evidence).toMatchObject({sha256: OLD_SHA, byte_length: OLD_BYTES.byteLength, content_type: 'text/csv'});
    expect(body.retrievals).toEqual(await db.retrievalsOf(OLD_SHA));
    expect(body.retrievals).toHaveLength(1);
    expect(body.retrievals[0].retrieval_id).toBe(oldReceipt);
    expect(body.download.expiresIn).toBe(60);
    expect(deps.signedUrl).toHaveBeenCalledWith(`fred_csv/${OLD_SHA}.csv`, 60);
    const bytes = store.read(signedObjects.get(body.download.url)!);
    expect(bytes).toEqual(OLD_BYTES);
    expect(sha256Hex(bytes!)).toBe(body.evidence.sha256);
    expect(new TextDecoder().decode(bytes as Uint8Array)).toContain('2026-09-30,102.9');
  });

  it('keeps repeated retrieval receipts for identical bytes, excluding a different hash', async () => {
    db.setBatchStatus(NEW_BATCH, 'running');
    const repeated = await registerBytes(OLD_BYTES, NEW_BATCH, NEW_AT);
    db.setBatchStatus(NEW_BATCH, 'success');
    const response = await getEvidence(OLD_SHA);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.retrievals.map((r: {retrieval_id: string}) => r.retrieval_id)).toEqual([oldReceipt, repeated]);
    expect(body.retrievals.every((r: {sha256: string}) => r.sha256 === OLD_SHA)).toBe(true);
    expect(body.retrievals.map((r: {retrieval_id: string}) => r.retrieval_id)).not.toContain(newReceipt);
    expect(store.read(signedObjects.get(body.download.url)!)).toEqual(OLD_BYTES);
  });

  it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), ` ${OLD_SHA}`, `${OLD_SHA}\n`, '../raw.csv'])(
    'rejects malformed SHA %j before constructing read/sign dependencies', async sha => {
      await expectError(await getEvidence(sha), 400, 'invalid_parameter:sha256');
      expect(boundary.deps).not.toHaveBeenCalled();
      expect(deps.signedUrl).not.toHaveBeenCalled();
    },
  );

  it('reports an absent well formed SHA explicitly, without signing or substituting another object', async () => {
    const absent = 'f'.repeat(64);
    expect(absent).not.toBe(OLD_SHA);
    await expectError(await getEvidence(absent), 404, 'not_found');
    expect(deps.signedUrl).not.toHaveBeenCalled();
  });

  it('checks session before even malformed parameters and does not construct dependencies', async () => {
    boundary.auth.mockResolvedValue({data: {user: null}, error: null});
    await expectError(await getEvidence('bad'), 401, 'unauthenticated');
    expect(boundary.deps).not.toHaveBeenCalled();
    expect(deps.signedUrl).not.toHaveBeenCalled();
  });

  it('rechecks session after a successful read instead of reusing an authorized result', async () => {
    expect((await getEvidence(OLD_SHA)).status).toBe(200);
    boundary.auth.mockResolvedValue({data: {user: null}, error: null});
    boundary.deps.mockClear();
    await expectError(await getEvidence(OLD_SHA), 401, 'unauthenticated');
    expect(boundary.deps).not.toHaveBeenCalled();
  });

  it('denies a session-provider error even if a user object accompanies it', async () => {
    boundary.auth.mockResolvedValue({data: {user: {id: 'fixture-session-5'}}, error: {message: 'fixture auth failure'}});
    await expectError(await getEvidence(OLD_SHA), 401, 'unauthenticated');
    expect(boundary.deps).not.toHaveBeenCalled();
  });

  it.each(['evidenceObject', 'retrievalsOf'] as const)('returns sanitized no-store 500 if %s fails', async method => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    withDb({[method]: async () => {throw new Error('fixture-private-error-marker');}});
    const response = await getEvidence(OLD_SHA);
    await expectError(response, 500, 'internal');
  });

  it('does not return a successful preview when signing fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    deps.signedUrl = vi.fn(async () => {throw new Error('fixture-private-signing-marker');});
    await expectError(await getEvidence(OLD_SHA), 500, 'internal');
  });
});

describe('actual versions GET to evidence GET lineage', () => {
  it('preserves captured derived inputs after a newer observation and evidence revision', async () => {
    const body = await bodyOfVersions();
    expect(body).toMatchObject({series_id: 'US_CPI_YOY', read_series_id: 'US_CPI_YOY', period_end: PERIOD});
    expect(body.versions.map(v => v.observation_id)).toEqual([newDerived, oldDerived]);
    const captured = selectVersion(body.versions, oldDerived)!;
    expect(captured).toMatchObject({version: 1, value_text: '2.9', transform: 'yoy_from_index@1',
      retrieval: null, evidence: null, derived_from: [baseNative, oldNative], code_version: code('old')});
    expect(captured.inputs.map(i => i.observation_id)).toEqual([baseNative, oldNative]);
    const currentInput = captured.inputs[1];
    expect(currentInput).toMatchObject({observation_id: oldNative, value_text: '102.9',
      retrieval: {retrieval_id: oldReceipt}, evidence: {sha256: OLD_SHA}, locator: {kind: 'csv_row', line: 3, column: 1}});
    if ('missing' in currentInput) throw new Error('fixture input unexpectedly missing');
    const preview = proofRows(currentInput, key => key).find(r => r.key === 'sha256')!;
    expect(preview.href).toBe(`/api/macro/evidence/${OLD_SHA}`);
    const response = await getEvidence(currentInput.evidence!.sha256);
    expect(response.status).toBe(200);
    const evidence = await response.json();
    expect(evidence.evidence.sha256).toBe(OLD_SHA);
    expect(store.read(signedObjects.get(evidence.download.url)!)).toEqual(OLD_BYTES);
    expect(JSON.stringify(captured)).not.toContain(NEW_SHA);
    expect(selectVersion(body.versions, 'unreadable-displayed-id')).toBeNull();
  });

  it('raw revisions retain their own receipts and evidence, with no derived inputs', async () => {
    const body = await bodyOfVersions('US_CPI_INDEX');
    expect(body.versions.map(v => v.version)).toEqual([2, 1]);
    const captured = selectVersion(body.versions, oldNative)!;
    expect(captured).toMatchObject({value_text: '102.9', retrieval: {retrieval_id: oldReceipt},
      evidence: {sha256: OLD_SHA}, derived_from: null, transform: null, inputs: []});
    expect(body.versions[0]).toMatchObject({value_text: '103.4', retrieval: {retrieval_id: newReceipt}, evidence: {sha256: NEW_SHA}});
    expect((await getEvidence(captured.evidence!.sha256)).status).toBe(200);
  });

  it('retains unreadable derived ancestor identity as missing without substituting the newest input', async () => {
    withDb({observationsByIds: async ids => (await db.observationsByIds(ids)).filter(r => r.observation_id !== oldNative)});
    const body = await bodyOfVersions();
    const captured = selectVersion(body.versions, oldDerived)!;
    expect(captured.inputs).toHaveLength(2);
    expect(captured.inputs[1]).toEqual({observation_id: oldNative, missing: true});
    expect(captured.derived_from).toEqual([baseNative, oldNative]);
    expect(captured.value_text).toBe('2.9');
    expect(JSON.stringify(captured)).not.toContain(NEW_SHA);
    expect(body.versions[0].inputs[1]).toMatchObject({value_text: '103.4', evidence: {sha256: NEW_SHA}});
  });

  it('raw receipt missing is null provenance, not a missing derived input or fallback evidence', async () => {
    withDb({retrieval: async id => id === oldReceipt ? null : db.retrieval(id)});
    const captured = selectVersion((await bodyOfVersions('US_CPI_INDEX')).versions, oldNative)!;
    expect(captured).toMatchObject({value_text: '102.9', retrieval: null, evidence: null, inputs: [],
      locator: {kind: 'csv_row', line: 3, column: 1}});
    const proof = proofRows(captured, key => key);
    expect(proof.find(r => r.key === 'sha256')).toMatchObject({missing: true});
    expect(proof.find(r => r.key === 'sha256')).not.toHaveProperty('href');
  });

  it('derived input evidence missing preserves the input and receipt but offers no fabricated preview', async () => {
    withDb({evidenceObject: async sha => sha === OLD_SHA ? null : db.evidenceObject(sha)});
    const captured = selectVersion((await bodyOfVersions()).versions, oldDerived)!;
    const input = captured.inputs[1];
    expect(input).toMatchObject({observation_id: oldNative, value_text: '102.9', retrieval: {retrieval_id: oldReceipt}, evidence: null});
    if ('missing' in input) throw new Error('readable input incorrectly marked missing');
    const row = proofRows(input, key => key).find(r => r.key === 'sha256')!;
    expect(row.missing).toBe(true);
    expect(row).not.toHaveProperty('href');
    await expectError(await getEvidence(OLD_SHA), 404, 'not_found');
  });

  it('raw evidence missing preserves its raw receipt and locator without inventing a SHA link', async () => {
    withDb({evidenceObject: async sha => sha === OLD_SHA ? null : db.evidenceObject(sha)});
    const captured = selectVersion((await bodyOfVersions('US_CPI_INDEX')).versions, oldNative)!;
    expect(captured).toMatchObject({observation_id: oldNative, value_text: '102.9',
      retrieval: {retrieval_id: oldReceipt}, evidence: null, inputs: [], derived_from: null,
      locator: {kind: 'csv_row', line: 3, column: 1}});
    const row = proofRows(captured, key => key).find(r => r.key === 'sha256')!;
    expect(row.missing).toBe(true);
    expect(row).not.toHaveProperty('href');
    expect(JSON.stringify(captured)).not.toContain(NEW_SHA);
  });

  it('derived input receipt missing preserves the readable input rather than marking the whole input missing', async () => {
    withDb({retrieval: async id => id === oldReceipt ? null : db.retrieval(id)});
    const captured = selectVersion((await bodyOfVersions()).versions, oldDerived)!;
    expect(captured.inputs[1]).toMatchObject({observation_id: oldNative, value_text: '102.9', retrieval: null, evidence: null});
    expect(captured.inputs[1]).not.toHaveProperty('missing');
    expect(captured.inputs).toHaveLength(2);
    expect(captured.value_text).toBe('2.9');
  });

  it('missing-input read failure is explicit 500 rather than successful empty inputs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    withDb({observationsByIds: async () => {throw new Error('fixture-input-read-failure');}});
    await expectError(await getVersions(), 500, 'internal');
  });
});
