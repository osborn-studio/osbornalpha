import { randomUUID } from 'node:crypto';
import { canonicalize, parseStrict, sha256, digest, fail } from './json.js';
import { validate, CONTRACT_DIGEST } from './contracts.js';
export const MAX_FILES = 128, MAX_FILE_BYTES = 2 * 1024 * 1024, MAX_PACK_BYTES = 4 * 1024 * 1024;
export function safePath(path) {
  if (typeof path !== 'string' || path.length > 160 || !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.[a-z0-9]+$/.test(path)) fail('invalid_path');
  return path;
}
const same = (a, b) => canonicalize(a) === canonicalize(b);
// trustedConfig comes from the producer's DB or an explicitly selected LOCAL configuration, never from the imported pack.
export function authorize({ rights, grant, source, scope, purpose, recipient, now = new Date() }) {
  validate('RightsPolicy', rights); validate('ProcessingGrant', grant); validate('SourceVersion', source); validate('Scope', scope);
  if (!same(scope, rights.owner_scope) || !same(scope, grant.scope)) fail('scope_denied');
  if (rights.approved_by !== scope.user_id || grant.confirmed_by !== scope.user_id) fail('scope_denied');
  if (grant.purpose !== purpose || grant.recipient_system !== recipient) fail('policy_blocked');
  if (rights.classification === 'unknown' || rights.redistribution !== 'allowed' || !rights.basis_ref || !grant.basis_ref) fail('policy_blocked');
  if (![rights.valid_until, grant.valid_until].every(t => Number.isFinite(Date.parse(t)) && Date.parse(t) > +now)
    || ![rights.approved_at, grant.confirmed_at].every(t => Number.isFinite(Date.parse(t)) && Date.parse(t) <= +now)) fail('policy_blocked');
  if (purpose === 'external_model_processing' && (rights.external_processing !== 'allowlisted' || !rights.allowed_processors.includes(recipient))) fail('policy_blocked');
  const selector = grant.input_selector;
  let domain = null;
  try { const u = new URL(source.canonical_uri); if (['https:', 'http:'].includes(u.protocol)) domain = u.hostname; } catch { /* explicit IDs still work */ }
  if (!selector.source_ids.includes(source.source_id) && !(domain && selector.domains.includes(domain))) fail('scope_denied');
}
export function buildSourcePack({ record, rawText, producerCommit, buildClean = false, trustedConfig, scope, purpose, recipient, now = new Date() }) {
  validate('SourceRecord', record);
  if (!trustedConfig || !same(record.rights, trustedConfig.rights) || !same(record.grant, trustedConfig.grant)) fail('policy_blocked');
  authorize({ ...trustedConfig, source: record.source_version, scope, purpose, recipient, now });
  if (record.withdrawn_at) fail('source_withdrawn');
  const version = record.source_version;
  const files = { 'source.json': canonicalize(record) };
  if (version.extraction_status === 'available') {
    if (typeof rawText !== 'string' || !rawText.isWellFormed()) fail('source_unavailable');
    files[safePath(version.snapshot_ref)] = rawText;
  } else if (rawText != null || version.snapshot_ref != null || version.raw_sha256 != null || version.normalized_text_sha256 != null) fail('invalid_schema');
  const entries = Object.keys(files).sort().map(relative_path => ({ relative_path, media_type: relative_path.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8', size_bytes: Buffer.byteLength(files[relative_path]), sha256: sha256(files[relative_path]) }));
  const manifest = {
    schema_name: 'pa-source-pack', schema_version: '1.0', pack_id: randomUUID(), producer_system: 'pa', producer_commit: producerCommit,
    owner_scope: scope, created_at: now.toISOString(), source_cutoff_at: version.ingested_at, payload_manifest: entries,
    extensions: { 'pa.build_clean': buildClean },
    contract_digest: CONTRACT_DIGEST, payload_digest: digest(entries), export_policy_ref: record.grant.grant_id, history_completeness: record.history_completeness,
  };
  files['manifest.json'] = canonicalize(manifest);
  verifySourcePack(files, { trustedConfig, scope, purpose, recipient, now });
  return { manifest, files };
}
export function verifySourcePack(files, options) {
  const paths = Object.keys(files);
  if (paths.length > MAX_FILES) fail('input_limit');
  let total = 0;
  for (const path of paths) {
    safePath(path);
    const size = Buffer.byteLength(files[path]); total += size;
    if (size > MAX_FILE_BYTES || total > MAX_PACK_BYTES) fail('input_limit');
  }
  if (!files['manifest.json']) fail('invalid_schema');
  const m = parseStrict(files['manifest.json']);
  if (m.schema_version !== '1.0' || m.schema_name !== 'pa-source-pack') fail('unsupported_version');
  validate('Manifest', m);
  if (m.contract_digest !== CONTRACT_DIGEST || m.payload_digest !== digest(m.payload_manifest)) fail('hash_mismatch');
  const listed = new Set();
  for (const entry of m.payload_manifest) {
    const path = safePath(entry.relative_path);
    if (path === 'manifest.json' || listed.has(path) || !Object.hasOwn(files, path)) fail('invalid_schema');
    listed.add(path);
    if (Buffer.byteLength(files[path]) !== entry.size_bytes || sha256(files[path]) !== entry.sha256) fail('hash_mismatch');
  }
  if (listed.size + 1 !== paths.length || !listed.has('source.json')) fail('invalid_schema');
  const record = validate('SourceRecord', parseStrict(files['source.json']));
  const { source_ref: ref, source_version: v } = record;
  if (!same(ref.owner_scope, m.owner_scope) || ref.source_id !== v.source_id || ref.version_id !== v.version_id || ref.raw_sha256 !== v.raw_sha256
    || v.rights_policy_ref !== record.rights.policy_id || m.export_policy_ref !== record.grant.grant_id || m.source_cutoff_at !== v.ingested_at
    || m.history_completeness !== record.history_completeness) fail('invalid_schema');
  if (v.extraction_status === 'available') {
    if (v.snapshot_ref !== 'snapshots/raw.txt' || !listed.has(v.snapshot_ref) || listed.size !== 2) fail('invalid_schema');
    const raw = files[v.snapshot_ref];
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(raw)); } catch { fail('invalid_schema'); }
    if (sha256(raw) !== v.raw_sha256 || sha256(text.replace(/\r\n?/g, '\n')) !== v.normalized_text_sha256) fail('hash_mismatch');
  } else if (listed.size !== 1 || v.snapshot_ref !== null || v.raw_sha256 !== null || v.normalized_text_sha256 !== null) fail('invalid_schema');
  if (record.withdrawn_at) fail('source_withdrawn');
  if (!options?.trustedConfig || !same(record.rights, options.trustedConfig.rights) || !same(record.grant, options.trustedConfig.grant)) fail('policy_blocked');
  authorize({ rights: options.trustedConfig.rights, grant: options.trustedConfig.grant, scope: options.scope, purpose: options.purpose, recipient: options.recipient, now: options.now, source: v });
  return { status: 'accepted', payload_digest: m.payload_digest, source_ref: ref, content_status: v.extraction_status, history_completeness: m.history_completeness };
}
