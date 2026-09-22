## Scope and verdict

Static re-audit of the supplied text only. No tools run, no build, no tests executed. **I make no claim of S4 acceptance.** Supplied files have no line numbers, so I cite file + the exact statement; that is the anchor.

**Evidence not supplied** (so the corresponding dispositions are *unverifiable*, not *refuted*): `calendar.json`, `market-policy.json.sha256`, `calendar.json.sha256`, `__fixtures__/s3/**` (golden pack, `trusted-test-config.json`). Every claim about 251 sessions, the holiday/DST set, the sidecar digests, and the six byte-identical producer files rests on files I cannot see.

## P0

None identified in the supplied code.

## P1 — residual, concrete

**1. `CandidateBinding` is cast, never validated; the two safety switches fail open.**
`scripts/s4-verify-candidate.ts`: `const binding = parseStrict(readFileSync(bindingPath)) as CandidateBinding;`

`parseStrict` returns a null-prototype object with no schema check, and there is no runtime validator for `CandidateBinding` anywhere in the slice. In `candidate.ts`, `binding.revoked` is consumed as a bare truthiness test (`if (!isUuid(actor) || actor !== binding.localUserId || binding.revoked) fail('scope_denied')`) and `binding.synthetic` likewise (`if (binding.synthetic && actor === binding.upstreamScope.user_id)` and `...(binding.synthetic ? ['synthetic_agent_operated'] : [])`).

Trigger: an operator binding file that misspells or omits the key — `"revoked_at": "..."` instead of `"revoked"`, or no `synthetic` field. Result: a revoked binding verifies normally, and a synthetic-operated import emits `"synthetic": false` in the receipt with `synthetic_agent_operated` dropped from `contaminationReasons`. The hard gates still hold by accident (`trustedConfig` undefined → `policy_blocked` in `verifySourcePack`; `approvedPayloadHash` undefined → `policy_blocked` unless the manifest is also null, which then dies at `manifestCheck`), so nothing is *imported*, but the two controls the operator relies on silently evaporate and the produced receipt is wrong.

I hold this at P1 rather than P0 because nothing crosses a DB/HTTP boundary in this scope; the harm is a misleading provenance receipt and a non-enforcing revocation flag — which is the integrity property this slice exists to establish. Fix: validate `CandidateBinding` with Ajv (require all seven fields, booleans as booleans, both hashes `^[0-9a-f]{64}$`) before the first use in `prepareCandidate`, not in the script.

## P2 — actionable

**2. The fixture blocklist is byte-exact; the relabel test over-attests.**
`candidate.ts`: `if (manifest?.payload_digest === FIXTURE_PAYLOAD_HASH) fail('fixture_not_operational');`

`payload_digest` is `digest(payload_manifest)`, and `manifest.json` is excluded from `payload_manifest`. The test `rejects a relabelled golden even when operator pins were mistakenly configured for it` only mutates `extensions['pa.evaluation_mode']`, which cannot change `payload_digest` — so it proves the blocklist survives metadata relabelling, and nothing more. Trigger: edit one byte of the golden's `candidate.json` (e.g. `reason`), recompute `payload_manifest`/`payload_digest`, set `pa.evaluation_mode` to `'baseline'`, and have the operator pin the recomputed pair. The `FIXTURE_PAYLOAD_HASH` guard is bypassed, and the `evaluation_mode === 'fixture'` gate in `candidate-pack.js` is bypassed by the relabel. This needs a mistaken operator pin — the same precondition as any pin — but the *lineage* is undetected. Fix: block on golden lineage (`source_ref.source_id` / `origin_pack_refs` / inner `source/manifest.json` `pack_id`) rather than one payload hash, and add a test that mutates payload bytes.

**3. "Deep freeze" is a hand-enumerated shallow freeze; `calendar.range` is left mutable.**
`market-policy.ts`: `Object.freeze(policy.windows_trading_sessions); Object.freeze(policy.calendar_out_of_range); Object.freeze(policy.endpoint_missing); export const MARKET_POLICY = Object.freeze(policy);` and later `Object.freeze(calendar.sessions); Object.freeze(calendar);`

The enumeration happens to cover every nested object in the *current* `market-policy.json`, but `Object.freeze(calendar)` is shallow and `calendar.range` — read on every call at `if (cutoff < Date.parse(calendar.range[0]) || cutoff >= Date.parse(calendar.range[1]) + 86400000)` — is never frozen. Trigger: any in-process module mutating `calendar.range[1]`, or adding a nested key to `market-policy.json`, silently produces a mutable frozen-policy object whose `MARKET_POLICY_HASH` still matches. Fix: a recursive freeze helper applied to both roots; the test `does not permit mutation after policy hashing` currently only probes `windows_trading_sessions`.

**4. Transport ceiling (2 MiB) is below the pack ceiling (4 MiB), with no producer-side guard and a misleading error.**
`json.js`: `MAX_JSON_BYTES = 2 * 1024 * 1024` vs `pack.js`: `MAX_PACK_BYTES = 4 * 1024 * 1024`. `prepareCandidate` calls `parseStrict(raw)` on the whole serialized transport. The disposition says this is "documented as lower than directory pack limits" — **I find no such comment in any supplied file.** `buildCandidatePack` validates only via `verifyCandidatePack` (directory limits), so it can emit a pack that `prepareCandidate` will always reject; JSON string-escaping of `raw.txt` makes this reachable well below 2 MiB of payload. The failure surfaces as `fail('input_limit')` carrying the default `recovery = 'Check the source and retry.'`, which is wrong advice for a size ceiling. Fix: state the ceiling in a comment at both constants, add a transport-size assertion in `buildCandidatePack`, and give `input_limit` a specific recovery string.

**5. `isUuid` is laxer than the schemas and drags the DB module into the offline path.**
`candidate.ts`: `import { isUuid } from '../store';` — `store.ts`'s regex is `[0-9a-f]{4}-[0-9a-f]{4}` for version/variant, while every schema requires `[1-8]` / `[89ab]`. The nil UUID passes `isUuid`. Impact is bounded because `actor` must equal the operator-set `localUserId`, but the "no database" importer now imports the Supabase/auth store for one predicate. Fix: local UUID predicate in `pa-v1/json.js` matching the schema pattern.

**6. The actor/binding independence check is tautological in the only current caller.**
`scripts/s4-verify-candidate.ts`: `prepareCandidate(readFileSync(packPath, 'utf8'), binding.localUserId, binding)` makes `actor !== binding.localUserId` unfalsifiable. It is meaningful only once `actor` comes from a session at the future HTTP boundary. Worth an explicit comment so the check is not later "simplified away".

## Dispositions I can confirm from the supplied text

Operator-pinned payload **and** JCS manifest digest are both required before `verifyCandidatePack` runs; the golden `payload_digest` is hard-rejected ahead of the pins; `allowFixture` is never passed by `prepareCandidate`; there is no externally supplied clock parameter (`const now = new Date()`); `localUserId`/`upstreamScope`/`idempotencyKey` are in the output; the four causal-ordering comparisons plus `source_cutoff_at` equality are present; `fetched_at: null` and `independence: 'unknown'` are preserved rather than invented; `planObservationSessions` enforces `candidates.length === policy.max_wait_trading_sessions` and calls `observationWindowEnds(full.at(-1)!.close)`, which transitively guarantees 60-session coverage for every earlier fallback; no prices or endpoint evaluation appear in the planner.

Source revocation integration and DB enforcement remain required before activation — finding 1 is the reason the current `revoked` flag should not be counted toward that.
