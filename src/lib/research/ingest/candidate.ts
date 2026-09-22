import { verifyCandidatePack } from './pa-v1/candidate-pack.js';
import { canonicalize, digest, parseStrict, fail, MAX_JSON_BYTES } from './pa-v1/json.js';
import Ajv from 'ajv';
const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const scopeSchema = { type: 'object', additionalProperties: false, required: ['user_id', 'workspace_id'],
  properties: { user_id: { type: 'string', pattern: UUID_PATTERN }, workspace_id: { anyOf: [{ type: 'null' }, { type: 'string', pattern: UUID_PATTERN }] } } };
const checkBinding = new Ajv({ strict: true }).compile({
  type: 'object', additionalProperties: false,
  required: ['localUserId', 'upstreamScope', 'trustedConfig', 'synthetic', 'revoked', 'approvedPayloadHash', 'approvedManifestHash'],
  properties: {
    localUserId: { type: 'string', pattern: UUID_PATTERN }, upstreamScope: scopeSchema,
    trustedConfig: { type: 'object', required: ['rights', 'grant'], properties: { rights: { type: 'object' }, grant: { type: 'object' } } },
    synthetic: { type: 'boolean' }, revoked: { type: 'boolean' },
    approvedPayloadHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    approvedManifestHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  },
});
const FIXTURE_SOURCE_ID = '22222222-2222-4222-8222-222222222222';
// Frozen S3 golden; self-reported manifest mode cannot promote it.
const FIXTURE_PAYLOAD_HASH = 'd59c334cf30c16d094f5c912f19c870ac5dcee3ef8caa5500acea7fd1a1b2e29';

/** Server/operator configuration, never accepted from the uploaded document. */
export interface CandidateBinding {
  localUserId: string;
  upstreamScope: { user_id: string; workspace_id: string | null };
  trustedConfig: Record<string, unknown>;
  synthetic: boolean;
  revoked: boolean;
  approvedPayloadHash: string;
  approvedManifestHash: string;
}

export function prepareCandidate(raw: string, actor: string, binding: CandidateBinding) {
  const now = new Date();
  if (!checkBinding(binding)) fail('invalid_schema', 'Supply all required operator binding fields with their declared types.');
  if (!new RegExp(UUID_PATTERN).test(actor) || actor !== binding.localUserId || binding.revoked !== false) fail('scope_denied');
  if (binding.synthetic && actor === binding.upstreamScope.user_id) fail('scope_denied');
  // JSON transport (including escaping) is deliberately limited to 2 MiB,
  // lower than the frozen producer's 4 MiB directory-pack aggregate.
  if (typeof raw !== 'string') fail('invalid_schema');
  if (Buffer.byteLength(raw) > MAX_JSON_BYTES) fail('input_limit', 'Use a JSON transport of at most 2 MiB including escaping; retrying unchanged bytes will not help.');
  const transport = parseStrict(raw);
  if (!transport || Array.isArray(transport) || typeof transport.files !== 'object' || !transport.files || Array.isArray(transport.files) ||
      Object.keys(transport).some(k => !['manifest', 'files'].includes(k)) ||
      Object.values(transport.files).some(v => typeof v !== 'string')) fail('invalid_schema');
  const manifest = parseStrict(transport.files['manifest.json'] || 'null');
  if (manifest?.payload_digest === FIXTURE_PAYLOAD_HASH) fail('fixture_not_operational');
  if (manifest?.payload_digest !== binding.approvedPayloadHash || digest(manifest) !== binding.approvedManifestHash) fail('policy_blocked');
  const result = verifyCandidatePack(transport.files, {
    trustedConfig: binding.trustedConfig, scope: binding.upstreamScope, now,
  });
  if (transport.manifest && canonicalize(transport.manifest) !== canonicalize(result.manifest)) fail('hash_mismatch');
  const record = parseStrict(transport.files['source/source.json']);
  if (record.source_ref.source_id === FIXTURE_SOURCE_ID) fail('fixture_not_operational');
  const version = record.source_version;
  if (version.extraction_status !== 'available') fail('source_unavailable');
  const times = [version.first_observed_at, version.ingested_at, result.manifest.created_at,
    result.candidate.selected_at];
  if (times.some(t => !Number.isFinite(Date.parse(t)) || Date.parse(t) > +now)) fail('future_input');
  if (Date.parse(version.first_observed_at) > Date.parse(version.ingested_at) ||
      Date.parse(version.ingested_at) > Date.parse(result.candidate.selected_at) ||
      Date.parse(result.candidate.selected_at) > Date.parse(result.manifest.created_at) ||
      result.manifest.source_cutoff_at !== version.ingested_at) fail('invalid_timeline');
  const rawText = transport.files['source/' + version.snapshot_ref];
  return {
    localUserId: binding.localUserId,
    upstreamScope: binding.upstreamScope,
    idempotencyKey: digest([binding.localUserId, result.manifest.payload_digest]),
    // External reference, never an unscoped Alpha primary key.
    candidateId: result.candidate.candidate_id as string,
    payloadHash: result.manifest.payload_digest as string,
    sourceKey: digest(record.source_ref),
    sourceRef: record.source_ref,
    sourceVersion: version,
    rawText: rawText as string,
    candidate: result.candidate,
    manifest: result.manifest,
    rights: record.rights,
    grant: record.grant,
    wiki: transport.files['wiki-reference.json'] ? parseStrict(transport.files['wiki-reference.json']) : null,
    synthetic: binding.synthetic,
    receivedAt: now.toISOString(),
    // S3 has no occurrence export. Preserve the import receipt without inventing a fetch.
    occurrence: { pack_id: result.manifest.pack_id, source_ref: record.source_ref,
      received_at: now.toISOString(), fetched_at: null, independence: 'unknown' },
    researchStream: 'descriptive' as const,
    contaminationReasons: ['upstream_exposure_history_unknown', ...(binding.synthetic ? ['synthetic_agent_operated'] : [])],
  };
}

export type PreparedCandidate = ReturnType<typeof prepareCandidate>;
