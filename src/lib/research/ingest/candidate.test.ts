import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prepareCandidate } from './candidate';
import { buildCandidatePack, verifyCandidatePack } from './pa-v1/candidate-pack.js';
import { buildSourcePack } from './pa-v1/pack.js';
import { canonicalize, digest, parseStrict, sha256 } from './pa-v1/json.js';

const root = join(process.cwd(), 'src/lib/research/ingest/__fixtures__/s3');
const config = JSON.parse(readFileSync(join(root, 'trusted-test-config.json'), 'utf8'));
const files: Record<string, string> = {};
function collect(dir: string, prefix = '') {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) collect(join(dir, e.name), prefix + e.name + '/');
    else files[prefix + e.name] = readFileSync(join(dir, e.name), 'utf8');
  }
}
collect(join(root, 'candidate-pack'));
const now = new Date('2026-09-23T00:00:00Z');
const binding = { localUserId: '99999999-9999-4999-8999-999999999999', upstreamScope: config.grant.scope,
  trustedConfig: config, synthetic: true, revoked: false, approvedPayloadHash: parseStrict(files['manifest.json']).payload_digest, approvedManifestHash: digest(parseStrict(files['manifest.json'])) };
// New test-only bytes and identities; never promote or overwrite the frozen golden.
function generatedCase() {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const c = structuredClone(config);
  const r = parseStrict(files['source/source.json']);
  const sourceId = randomUUID(), versionId = randomUUID(), raw = randomUUID();
  c.grant.input_selector.source_ids = [sourceId];
  c.grant.grant_id = randomUUID(); c.rights.policy_id = randomUUID();
  c.grant.basis_ref = c.rights.basis_ref = 'fixture:generated-unit-test';
  r.grant = c.grant; r.rights = c.rights;
  Object.assign(r.source_ref, { source_id: sourceId, version_id: versionId, raw_sha256: sha256(raw) });
  Object.assign(r.source_version, { source_id: sourceId, version_id: versionId, raw_sha256: sha256(raw),
    normalized_text_sha256: sha256(raw), rights_policy_ref: c.rights.policy_id });
  const sourcePack = buildSourcePack({ record: r, rawText: raw, producerCommit: '0'.repeat(40),
    trustedConfig: c, scope: c.grant.scope, purpose: 'alpha_research_import', recipient: 'alpha-local', now });
  const pack = buildCandidatePack({ sourcePack, reason: 'generated unit test only', userId: c.grant.scope.user_id,
    companyName: null, confirmExport: true, producerCommit: '0'.repeat(40), trustedConfig: c, scope: c.grant.scope });
  return { raw, pack, binding: { ...binding, trustedConfig: c, approvedPayloadHash: pack.manifest.payload_digest,
    approvedManifestHash: digest(pack.manifest) } };
}
afterEach(() => vi.useRealTimers());
describe('frozen S3 consumer', () => {
  it('fails closed on omitted, misspelled or incorrectly typed binding controls', () => {
    for (const key of ['localUserId', 'upstreamScope', 'trustedConfig', 'revoked', 'synthetic', 'approvedPayloadHash', 'approvedManifestHash']) {
      const bad = { ...binding } as Record<string, unknown>;
      delete bad[key];
      expect(() => prepareCandidate(JSON.stringify({ files }), binding.localUserId, bad as unknown as typeof binding)).toThrow('invalid_schema');
    }
    expect(() => prepareCandidate(JSON.stringify({ files }), binding.localUserId,
      { ...binding, synthetic: 'false' } as unknown as typeof binding)).toThrow('invalid_schema');
    expect(() => prepareCandidate(JSON.stringify({ files }), binding.localUserId,
      { ...binding, approvedPayloadhash: binding.approvedPayloadHash } as unknown as typeof binding)).toThrow('invalid_schema');
  });
  it('rejects original golden source lineage even if payload bytes and pins are changed', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const manifest = parseStrict(files['manifest.json']);
    const candidate = parseStrict(files['candidate.json']); candidate.reason += ' changed';
    const mutated: Record<string, string> = { ...files, 'candidate.json': canonicalize(candidate) };
    const entry = manifest.payload_manifest.find((e: { relative_path: string }) => e.relative_path === 'candidate.json');
    entry.sha256 = sha256(mutated['candidate.json']); entry.size_bytes = Buffer.byteLength(mutated['candidate.json']);
    manifest.payload_digest = digest(manifest.payload_manifest); manifest.extensions['pa.evaluation_mode'] = 'baseline';
    mutated['manifest.json'] = canonicalize(manifest);
    expect(() => prepareCandidate(JSON.stringify({ files: mutated }), binding.localUserId,
      { ...binding, approvedPayloadHash: manifest.payload_digest, approvedManifestHash: digest(manifest) })).toThrow('fixture_not_operational');
  });
  it('documents oversized transport recovery before parsing bytes', () => {
    expect(() => prepareCandidate(' '.repeat(2 * 1024 * 1024 + 1), binding.localUserId, binding)).toThrow('input_limit');
  });
  it('preserves successful import identity and conservative provenance', () => {
    const t = generatedCase();
    const result = prepareCandidate(JSON.stringify(t.pack), t.binding.localUserId, t.binding);
    expect(result.rawText).toBe(t.raw);
    expect(result.localUserId).toBe(t.binding.localUserId);
    expect(result.sourceKey).toBe(digest(result.sourceRef));
    expect(result.idempotencyKey).toBe(digest([t.binding.localUserId, result.payloadHash]));
    expect(result.wiki).toBeNull();
    expect(result.occurrence.fetched_at).toBeNull();
    expect(result.researchStream).toBe('descriptive');
    expect(result.contaminationReasons).toContain('synthetic_agent_operated');
  });
  it('requires both independently approved hashes and refuses expired authorization at real call time', () => {
    const t = generatedCase();
    expect(() => prepareCandidate(JSON.stringify(t.pack), t.binding.localUserId,
      { ...t.binding, approvedPayloadHash: '0'.repeat(64) })).toThrow('policy_blocked');
    expect(() => prepareCandidate(JSON.stringify(t.pack), t.binding.localUserId,
      { ...t.binding, approvedManifestHash: '0'.repeat(64) })).toThrow('policy_blocked');
    expect(() => prepareCandidate(JSON.stringify(t.pack), t.binding.localUserId,
      { ...t.binding, upstreamScope: { ...t.binding.upstreamScope, workspace_id: randomUUID() } })).toThrow('scope_denied');
    vi.setSystemTime(new Date('2028-01-01T00:00:00Z'));
    expect(() => prepareCandidate(JSON.stringify(t.pack), t.binding.localUserId, t.binding)).toThrow('policy_blocked');
  });
  it('rejects a contradictory outer manifest and future or causally inverted imports', () => {
    const t = generatedCase();
    expect(() => prepareCandidate(JSON.stringify({ ...t.pack, manifest: { ...t.pack.manifest, pack_id: randomUUID() } }),
      t.binding.localUserId, t.binding)).toThrow('hash_mismatch');
    const future = { ...t.pack.manifest, created_at: '2026-09-24T00:00:00.000Z' };
    const changed = { manifest: future, files: { ...t.pack.files, 'manifest.json': canonicalize(future) } };
    expect(() => prepareCandidate(JSON.stringify(changed), t.binding.localUserId,
      { ...t.binding, approvedManifestHash: digest(future) })).toThrow('future_input');
    future.created_at = '2026-09-22T23:59:59.000Z';
    changed.files['manifest.json'] = canonicalize(future);
    expect(() => prepareCandidate(JSON.stringify(changed), t.binding.localUserId,
      { ...t.binding, approvedManifestHash: digest(future) })).toThrow('invalid_timeline');
  });
  it('validates unchanged producer golden only in explicit fixture mode', () => {
    expect(verifyCandidatePack(files, { trustedConfig: config, scope: config.grant.scope, now, allowFixture: true }).status).toBe('accepted');
  });
  it('never imports the golden as an operational candidate', () => {
    expect(() => prepareCandidate(JSON.stringify({ files }), binding.localUserId, binding)).toThrow('fixture_not_operational');
  });
  it('requires an independently configured local actor binding', () => {
    expect(() => prepareCandidate(JSON.stringify({ files }), config.grant.scope.user_id, binding)).toThrow('scope_denied');
    expect(() => prepareCandidate(JSON.stringify({ files }), binding.localUserId, { ...binding, revoked: true })).toThrow('scope_denied');
  });
  it('rejects duplicate keys before JSON parsing loses them', () => {
    expect(() => parseStrict('{"files":{},"files":{}}')).toThrow('duplicate_key');
  });
  it('detects corrupt bytes and traversal', () => {
    const options = { trustedConfig: config, scope: config.grant.scope, now, allowFixture: true };
    expect(() => verifyCandidatePack({ ...files, 'candidate.json': files['candidate.json'] + ' ' }, options)).toThrow('hash_mismatch');
    expect(() => verifyCandidatePack({ ...files, '../escape.txt': 'x' }, options)).toThrow('invalid_path');
  });
  it('rejects a relabelled golden even when operator pins were mistakenly configured for it', () => {
    const manifest = parseStrict(files['manifest.json']);
    manifest.extensions['pa.evaluation_mode'] = 'baseline';
    const forged = { ...files, 'manifest.json': canonicalize(manifest) };
    expect(() => prepareCandidate(JSON.stringify({ files: forged }), binding.localUserId,
      { ...binding, approvedManifestHash: digest(manifest) })).toThrow('fixture_not_operational');
  });
  it('requires synthetic identities to remain isolated', () => {
    expect(() => prepareCandidate(JSON.stringify({ files }), config.grant.scope.user_id,
      { ...binding, localUserId: config.grant.scope.user_id })).toThrow('scope_denied');
  });
  it('rejects expired and mismatched trusted grants', () => {
    expect(() => verifyCandidatePack(files, { trustedConfig: config, scope: config.grant.scope,
      now: new Date('2028-01-01'), allowFixture: true })).toThrow('policy_blocked');
    expect(() => verifyCandidatePack(files, { trustedConfig: { ...config, grant: { ...config.grant, recipient_system: 'cloud' } },
      scope: config.grant.scope, now, allowFixture: true })).toThrow('policy_blocked');
  });
});
