## Summary

Reviewed as a static audit of the supplied slice only. I did not run anything; the "6 passed / typecheck passed" status is your report, not something I verified. Two supporting modules referenced by the code (`./pa-v1/contracts.js`, `./pa-v1/candidate-pack.schema.json`, and `../store`) were not supplied, so several invariants below are flagged as *unverifiable* rather than *broken*.

The headline: the slice's central safety property — "the golden fixture never becomes an operational candidate" — rests on a field that the pack format does not authenticate, and the test that claims to prove it only exercises the honest path.

---

## P0

### P0-1 — Fixture guard keys off an unauthenticated manifest field; golden fixture is importable with a one-field edit

**Where:** `pa-v1/candidate-pack.js` (the `pa.evaluation_mode` checks in `verifyCandidatePack`), relied on by `candidate.ts:20-22` (`verifyCandidatePack(transport.files, {...})`, which passes no `allowFixture`).

**Trigger:** `manifest.payload_digest` is `digest(manifest.payload_manifest)`, and `payload_manifest` deliberately excludes `manifest.json` (`if(e.relative_path==='manifest.json'||...)fail('hash_mismatch')`). Nothing else signs or pins the manifest. So every manifest-only field is attacker-chosen: `extensions['pa.evaluation_mode']`, `pack_id`, `created_at`, `producer_commit`. Take the shipped `__fixtures__/s3/candidate-pack`, open `manifest.json`, change `"fixture"` to `"baseline"`, re-serialize. `contract_digest` still matches, `payload_digest` still matches (payload bytes untouched), `owner_scope`, `export_policy_ref`, and every cross-check in the big conjunction still pass. `prepareCandidate` accepts it as an operational candidate.

**Why it is the wrapper's problem, not the producer's:** the producer contract is frozen and unsigned. That means `pa.evaluation_mode` is a *self-description*, not an assertion. The Alpha wrapper is currently treating it as an authenticated label.

**Fix (two layers, both in the Alpha wrapper):**

1. Hard denylist by content. Compute the fixture pack's `payload_digest` and `candidate_id` at build time from `__fixtures__/s3`, freeze them into a constant, and reject in `prepareCandidate` *before* returning, regardless of declared mode:
   ```ts
   if (FIXTURE_PAYLOAD_DIGESTS.has(result.manifest.payload_digest) ||
       FIXTURE_CANDIDATE_IDS.has(result.candidate.candidate_id)) fail('fixture_not_operational');
   ```
   Content-addressed, so it survives manifest edits.
2. Positive gate instead of negative. Require the operator's local config to authorize the specific payload: `binding.trustedConfig.expected_payload_digests` (or an explicit `binding.allowOperationalImport` recorded alongside the digest in the outbox). Treat `manifest.extensions`, `pack_id`, `created_at`, and `producer_commit` as untrusted self-reported strings everywhere downstream — including `occurrence.pack_id` at `candidate.ts:46`, which currently persists an attacker-chosen identifier as provenance.

**Tests to add:**
- Take `files`, parse `manifest.json`, flip `pa.evaluation_mode` to `'baseline'`, re-canonicalize, and assert `prepareCandidate` still throws `fixture_not_operational`. This is the test that would have caught it.
- Same flip, but also mutate `pack_id`/`created_at`/`producer_commit`, and assert rejection.
- Assert that a `baseline` pack whose `payload_digest` is not in the operator allowlist is rejected.

---

## P1

### P1-1 — Caller-supplied `now` defeats grant expiry and the future-input cutoff

**Where:** `candidate.ts:14` (`now = new Date()`), flowing to `verifyCandidatePack` → `authorize` (`pack.js`, the `valid_until`/`approved_at` block) and to the `times` check at `candidate.ts:27-29`.

**Trigger:** `now` is an ordinary optional parameter used for *both* authorization cutoffs and the persisted receipt. A caller that passes a request-derived, replayed, or cached timestamp can import under a rights policy or processing grant that has since expired (`Date.parse(valid_until) > +now` is satisfied by rewinding `now`), and simultaneously stamps `receivedAt` / `occurrence.received_at` with that false time. The tests pin `now` to a literal, so this path is exercised only in its benign form.

**Fix:** split the clock from the parameter. Authorize against the real clock unconditionally; accept the injected clock only for deterministic-time assertions:
```ts
const wall = new Date();
if (Math.abs(+now - +wall) > MAX_CLOCK_SKEW_MS) fail('scope_denied');
```
or take `now` only via an injected `clock` interface that production wires to `Date.now`. `receivedAt` and `occurrence.received_at` should always use the wall clock.

**Tests:** grant with `valid_until` in the past + `now` rewound before it → expect `policy_blocked`; `now` more than the skew window from wall clock → expect rejection; assert `receivedAt` is not the injected value when they diverge.

### P1-2 — "Independently configured actor binding" is enforced by fixture data, not by code

**Where:** `candidate.ts:15` — `if (!isUuid(actor) || actor !== binding.localUserId || binding.revoked) fail('scope_denied');`

**Trigger:** the only independence property checked is `actor === binding.localUserId`, where both values come from the same caller. Nothing asserts `binding.localUserId !== binding.upstreamScope.user_id`. The test at `candidate.test.ts` ("requires an independently configured local actor binding") passes solely because the fixture hardcodes `localUserId: '99999999-…'` differently from `config.grant.scope.user_id`. A caller that constructs `binding.localUserId = binding.upstreamScope.user_id` — the natural mistake when wiring a single-operator deployment — collapses local and upstream identity with no error, which is exactly the conflation the contamination fields elsewhere in this function are trying to record.

**Fix:**
```ts
if (binding.localUserId === binding.upstreamScope.user_id) fail('scope_denied');
```
plus `isUuid(binding.localUserId)` explicitly rather than inferring it through the equality with `actor`.

**Tests:** `{ ...binding, localUserId: config.grant.scope.user_id }` with a matching `actor` → expect `scope_denied`. Also a non-UUID `actor` (currently the `isUuid` branch has no test at all), and a `binding.upstreamScope` that disagrees with `trustedConfig.grant.scope` → expect `scope_denied` from `authorize`.

### P1-3 — The prepared record drops the local binding, and carries a producer-chosen primary key

**Where:** `candidate.ts:31-50` (the returned object).

**Trigger:** the return value contains `synthetic` and `receivedAt` but neither `localUserId` nor `upstreamScope`. Given the stated next step — PostgreSQL with RLS, CAS, append-only decisions/observations/outbox — the tenant key that authorized the import is not propagated to the thing being persisted. The persistence layer must re-derive it from a separate argument, which is precisely how rows get written under the wrong owner or with the upstream `user_id` as the RLS key.

Compounding: `candidateId: result.candidate.candidate_id` is a producer-chosen UUID from the untrusted pack. If it becomes a bare primary key or CAS key, two tenants (or one tenant replaying a hostile pack) can collide on it. `payloadHash` is the content-addressed value and is the safer idempotency key.

**Fix:** include `localUserId` and `upstreamScope` in the returned record; document that the CAS/unique key is `(localUserId, payloadHash)` and that `candidate_id` is an untrusted external reference, not an identity.

**Tests:** assert the returned object carries `localUserId === binding.localUserId`; assert two packs differing only in `candidate_id` but identical in payload collide on the idempotency key (once the store lands).

### P1-4 — No successful-import test exists; the entire happy path is uncovered

**Where:** `candidate.test.ts` — all three `prepareCandidate` assertions are `.toThrow(...)`.

**Trigger:** `prepareCandidate` is never once called successfully. Everything after the `verifyCandidatePack` call is dead to the test suite: the `transport.manifest` cross-check, `source_unavailable`, the entire `times` / `future_input` block, `rawText` resolution, `sourceKey`, `wiki` attachment, `occurrence`, `contaminationReasons`. "6 passed" is consistent with `prepareCandidate` returning garbage on every real input.

The structural cause is worth naming: the repo has only a `fixture`-mode pack, so there is no artifact the success path *can* be tested against. That is the fixture-confusion trap in its second form.

**Fix:** generate a `baseline`-mode pack in the test setup via `buildCandidatePack({ ..., evaluationMode: 'baseline' })` with a test-local trusted config, and assert the full returned shape — `payloadHash` equals the manifest digest, `rawText` equals the fixture snapshot bytes, `sourceKey === digest(record.source_ref)`, `occurrence.fetched_at === null`, `independence === 'unknown'`, `contaminationReasons` contains `synthetic_agent_operated` when `synthetic: true` and omits it when `false`, `wiki` is non-null when `wiki-reference.json` is present and `null` when absent.

---

## P2

### P2-1 — Time checks are incomplete and unordered

`candidate.ts:27-29` checks four timestamps for parseability and for `> now`. It does not check ordering. A pack may claim `selected_at` earlier than `ingested_at`, or `created_at` earlier than `selected_at`, and pass. There is also no lower bound — an epoch-zero `first_observed_at` is accepted. Add a monotonicity assertion (`first_observed_at ≤ ingested_at ≤ selected_at ≤ created_at ≤ now`) and a floor. Tests: one permutation per inversion.

Related: whether these four fields are schema-constrained to `utc-rfc3339` is unverifiable here (`contracts.js` and the schema JSON were not supplied). If any is a free-form string, `Date.parse` will happily accept implementation-defined formats like `"March 5 2026"`. Worth asserting directly in the wrapper rather than trusting the unseen schema.

### P2-2 — The `transport.manifest` cross-check cannot fail for an attacker

`candidate.ts:23` compares `transport.manifest` against `result.manifest`, but both derive from the same attacker-supplied bytes, and the check is skipped entirely when `transport.manifest` is absent. It catches transport-layer corruption and nothing else, while reading like a provenance check. Either compare against an operator-pinned expected digest, or delete it and drop `manifest` from the accepted top-level keys. Test: assert a mismatched `transport.manifest` throws `hash_mismatch` (currently untested either way).

### P2-3 — `MAX_JSON_BYTES` (2 MB) is below `MAX_PACK_BYTES` (4 MB)

`json.js:3` vs `pack.js:5`. The transport envelope is a single JSON string containing every file, so `parseStrict(raw)` at `candidate.ts:16` caps the whole pack at 2 MB *before* escaping overhead — a pack well under the 4 MB pack limit fails with a misleading `input_limit`. Reconcile the constants or give the envelope its own limit with a distinct error code. Test: a pack sized between the two limits should either import or fail with a specific, documented code.

### P2-4 — `verifyCandidatePack` never pins `schema_name` / `schema_version`

`verifySourcePack` explicitly checks `m.schema_version !== '1.0' || m.schema_name !== 'pa-source-pack'`. `verifyCandidatePack` has no equivalent and relies entirely on the unseen `CandidateManifest` ajv definition. If that definition does not pin `schema_name` with a `const`, a source-pack manifest can be presented as a candidate manifest. The asymmetry alone is worth closing explicitly. Test: mutate `schema_name` to `'pa-source-pack'` and assert `unsupported_version`.

### P2-5 — `PreparedCandidate` is largely `any`

All of `parseStrict`, `verifyCandidatePack`, and `digest` come from untyped `.js` modules, so `record`, `version`, `result`, and consequently `sourceVersion`, `candidate`, `rights`, `grant`, `wiki` in the exported type are `any`. The `as string` casts at `candidate.ts:32-33, 37` assert over values TypeScript knows nothing about. "Typecheck passed" is therefore weak evidence for this file specifically. Add `.d.ts` declarations for the `pa-v1` modules, or narrow at the boundary with runtime guards that match the casts.

### P2-6 — `fail()` does not narrow control flow

`fail` is a function *declaration* that always throws, so TypeScript infers `void`, not `never`. Every `if (...) fail(...)` reads to the compiler as a statement that falls through; if a `fail` call site is ever refactored into a branch that can return, nothing flags it. Declare the return type as `never` in a `.d.ts` (or convert to a const arrow with an explicit `never` annotation).

### P2-7 — Module specifier inconsistency between runtime and tests

`candidate.ts:3` imports `'../store'` extensionless while sibling imports use explicit `.js`; `candidate.test.ts` imports `'./candidate'`. Vitest resolves extensionless specifiers; plain Node ESM does not. If the production entry path is Node ESM rather than a bundler, the tests pass and the deployed import fails. Worth confirming against `tsconfig`/build config, which was not supplied.

### P2-8 — `.toThrow(string)` is substring matching

Vitest's `toThrow('scope_denied')` matches a substring of the message. Since `fail` sets a structured `code` and `recovery`, assert on the code: `expect(() => ...).toThrow(expect.objectContaining({ code: 'scope_denied' }))`. Low impact today, but it means a test can pass on the wrong error once codes start sharing substrings.

### P2-9 — Source withdrawal is only evaluated as of export time

`verifySourcePack` rejects `record.withdrawn_at`, but that is a snapshot of the producer's state when the pack was built. A source withdrawn after export imports cleanly. `binding.revoked` covers the actor, not the source. If the local store will hold withdrawal notices, check them here; otherwise document the gap on `occurrence`.

---

## Additional missing verification

Beyond the per-finding tests above, these branches have no coverage at all:

- Transport envelope: missing `files`, `files` as an array, non-string file values, extra top-level keys. (An array `files` is rejected only incidentally, by `safePath` two layers down — that is coincidence, not design.)
- `future_input` and `source_unavailable` — neither code is asserted anywhere.
- `binding.synthetic: false` — `contaminationReasons` branching is one-sided in the fixture.
- `parseStrict` beyond the duplicate-key case: depth overflow (`input_limit`), trailing bytes after the top-level value, invalid UTF-8, `__proto__` as a key, unsafe integers, `1e999`.
- `safePath` rejections other than `../escape.txt`: uppercase, no extension, `>160` chars, absolute paths.
- The `listed.size !== sourceFiles + 1 + wiki` stray-file check in `candidate-pack.js` — add a pack with an extra unlisted-but-present file and with a listed-but-absent file.

## Not verifiable from what was supplied

`contracts.js` (`validate`, `CONTRACT_DIGEST`), `candidate-pack.schema.json`, and `../store` (`isUuid`) were not included. That leaves open: whether every timestamp in the `times` array is format-constrained; whether `candidate_id` and `payload_digest` are typed as strings (the `as string` casts); whether `CandidateManifest` pins `schema_name`; whether `additionalProperties` is closed on the manifest and candidate definitions (if not, `extensions` and unknown fields ride through untouched); and the exact UUID acceptance set of `isUuid`. I'd want those four files before signing off on the schema-dependent findings.
