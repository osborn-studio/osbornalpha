# S4 implementation ledger — in progress

Branch: `codex/s4-alpha-observations`; base: `64d01e58f9066165ca43e6d17f241b4be2cc290a`.

S3 handoff permits only explicitly authorized synthetic material locally. No
production migration, trading, Jev or material processing by external models.
Claude CLI Opus 5 is authorized for code auditing; prompts exclude material,
trusted configuration and grants. Static audit is separate from executed tests.

## Current slice

The consumer vendors the frozen PA schemas and verifier. Alpha checks a separate
local actor binding, revoked bindings, independently approved payload/manifest digests, envelope equality, content availability
and future input times. Original SourceRef is retained independently from raw
content hash. Imported exposure history remains unknown and research descriptive.
The unchanged S3 golden is fixture-only and rejected by the operational wrapper.

The authorized S3 synthetic download was independently checked by the new Alpha
wrapper at 2026-09-22T13:38:55.877Z. Payload digest remains
`d54fc67a3f91335990c1eb5b72bbf00bed214d779973428db917ccd7d2246cc1`.
This proves verification only, **not database import**. Material is still in the
controlled S3 directory and has not been copied into this handoff.

## Registered market choices

`market-policy.json` and `calendar.json` select XNYS, America/New_York and the
2026–2028 official holiday/early-close schedule, before any price results were
examined. Source: https://www.nyse.com/trade/hours-calendars (read 2026-09-22).
Digests use the frozen PA JCS profile. Calendar dates outside this snapshot are
unsupported. The rule planner does not fabricate prices, split factors or results.

## Remaining acceptance work

- Database SourceVersion/occurrence persistence and independent scope binding.
- Atomic Decision/version/audit/outbox CAS, immutable observations and receipts.
- Company/security/claim mapping, frozen inputs, judgment and human-label history.
- S4b bounded baseline fan-out, change cards, pre-display exposure and review UI.
- Real local SQL concurrency/RLS/rollback and browser acceptance.
- Final observation contract, golden, evaluator-auth design, K-line DTO and S5 handoff.
- Final Opus 5 review and disposition after implementation.

S4a/S4b are not accepted yet. The market policy is registered, but the final S4
handoff is not published. No deployment has occurred.

## Import boundary and clock

The single JSON transport has a deliberate 2 MiB total UTF-8 limit (including
JSON escaping), stricter than PA's directory-pack 4 MiB aggregate. Oversize
transport returns `input_limit`. The wrapper takes time from the server clock;
tests use Vitest fake timers, never an HTTP-supplied time. Operator binding is
trusted configuration and must never be sourced from an uploaded package.
`approvedManifestHash` is the PA JCS digest of the full manifest;
`approvedPayloadHash` comes from the independently accepted handoff. Both must
match. Upstream IDs are external references. The prepared tenant and idempotency
key are explicit, but do not constitute a database uniqueness/CAS implementation.

Local verification command (binding contains independently reviewed pins and
an isolated synthetic Alpha user; keep it outside the repository):

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/s4-verify-candidate.ts PACK LOCAL_BINDING
```

Current-source withdrawal/control notices are not connected yet. Revocation
and authorization must be checked again before database persistence or display;
there is no activated HTTP importer in this slice.

## Audit disposition

First-round Opus findings and actual model usage are preserved in `evidence/`.
The material/configuration was excluded from all prompts. The first silent
invocation was terminated and is not a valid audit. Returned reviews are static
reviews, separate from locally run tests.

Accepted: independently pinned package integrity; deny relabelled frozen golden;
server clock; preserve bound local owner; positive generated-byte fixture tests;
causal ordering; explicit wait/count/early-close semantics; calendar invariants;
coverage, immutable rules, timestamp normalization, malformed-date checks.

Qualified/rejected: identical UUID strings in independently configured namespaces
are not inherently unauthorized (synthetic isolation is explicitly enforced);
JCS content digests deliberately ignore formatting and are required by the shared
contract, while sidecars were independently computed in Python. Next uses bundler
resolution and the actual Next build/tsx smoke imports pass. Price endpoint and
suspension resolution remain S6 computation, not a fabricated result in this planner.
The calendar range error has status `data_insufficient`, reason `rule_unsupported`;
those are different fields, not alternative outcomes. Old market-policy draft is
retained; this refinement occurred before any persisted observation or price query.

Still limited: inherited JS validator type inference; actual control-event source
withdrawal; API/DB permissions and concurrency; final observation/S5 handoff.
These are not claimed passed or implemented here.

## Final current-slice review

Opus 5 round 3 found no concrete residual P0/P1 in the supplied production slice.
The actual model usage and prompt/source hashes are in
`evidence/opus-5-final-receipt.json`; full review is `evidence/opus-5-final.md`.
Actual local checks: 147 test files / 1,148 tests; typecheck, lint, build passed.
Tests received additional assertions after review; production code is unchanged.
This is DONE_WITH_CONCERNS for the current slice, not S4a/S4b completion.

Final P2 dispositions:

- The original fixture candidate payload digest is `d59c334cf30c16d094f5c912f19c870ac5dcee3ef8caa5500acea7fd1a1b2e29`.
  The separately authorized S3.4 sample is `d54fc67a3f91335990c1eb5b72bbf00bed214d779973428db917ccd7d2246cc1`.
  These are two different candidate packs, not source-vs-candidate hashes and
  not a stale constant. The unchanged fixture and verified sample remain separate.
- Binding tests now omit all seven required fields and inject an extra misspelled
  key. A different upstream workspace is rejected in a generated positive-case test.
- SourceRef owner_scope (including workspace_id) participates in the checked payload;
  one pack cannot be accepted with a different upstream scope. Alpha currently has
  a user-only local binding. Any future local-workspace tenancy needs an explicit
  schema and uniqueness-key design before DB activation.
- Calendar range metadata lacks its own runtime schema validation. Current checked-in
  range is valid and full-window checks prevent out-of-calendar endpoints. Add strict
  calendar-root validation before exposing final registration; this remains a P2.
- Inherited JS boundary types and control-event revocation integration remain listed
  above; no authentication, database, concurrency or UI acceptance is inferred.
