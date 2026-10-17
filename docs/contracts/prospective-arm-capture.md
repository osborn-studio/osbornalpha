# Prospective arm capture: implementation and acceptance contract

Status: candidate design with inactive pure Batch A schema/payoff prerequisites; persistence, commands and runtime not implemented or enabled. Complements registered-arm-report-plan.md. Existing routing and receipt helpers remain internal. A historical ledger row is not a certified arm observation.

## Problem and product behavior

The weekly flow freezes a baseline without an observation/card, automatically records an AI stance when revealing cards, and allows an optional observation on a later collaboration decision. Therefore wiring a report reader alone cannot produce a trustworthy three-arm comparison. Source ownership, a matching thesis, or matching dates cannot supply the missing provenance.

A new comparison must be enrolled prospectively. Show the owner the candidate/source, thesis, evaluation period, evaluation rules and explicit limitations before enrollment. The owner confirms the baseline text/action and observation plan before seeing any AI card for that enrollment. AI stance and later collaboration decision are separate frozen records. No agent can claim the human confirmation or silently populate a missing arm. A missing arm is an enrollment status, not a zero return or fabricated comparison. Failed enrollment must be visible and retryable with the same idempotency key.

Keep the current reading/research flow available. Unsupported historical rows stay unsupported; do not rewrite frozen ledger rows or retroactively certify them. Do not activate this path until local acceptance, audit, and the existing release gates pass.

## Explicit design decisions

1. Enrollment identifies an owner, thesis, evaluation period and declared source/candidate scope, plus a versioned protocol. The source scope is fixed before baseline capture; later sources require a new enrollment. Start with one candidate only, because multi-source grant coverage is not yet implemented.
2. Declare exactly one slot before generation: the enrolled thesis entity_match ChangeCard from a fresh enrolled generation run. Refuse pre-existing ChangeCards for this candidate; never choose first/latest/best among generated results. Exploration/omission siblings are not slot candidates. Enrolled reveal returns only the declared slot, and records any sibling disclosure if a future UI shows siblings. Ordinary flows remain available only when they cannot bypass enrollment exposure tracking. The weekly ResearchCard generator is a different namespace and cannot supply the slot by guessed ID matching.
3. Human baseline, AI stance and collaboration have separate observation IDs. Sharing one observed return among all three arms is not evidence of differing decisions. No existing observation is assigned to multiple arms.
4. The owner confirms the baseline observation plan (security identity, direction/action semantics, evaluation rules and time cutoff) before AI exposure. Reusing the current submitDecision path is insufficient: it snapshots a ChangeCard and AI judgment. Implement a separate baseline freeze path whose immutable input excludes AI material. Do not equate a before_display label with this plan.
5. Observation construction can occur later only from that already-frozen plan, preserving its cutoff and policy. Construction time cannot become a new information cutoff or buy an advantageous start. Until the evaluator supports all plan semantics, reject unsupported actions; never map shadow/extend/invalidate to adopt by guesswork.
6. Baseline capture and AI reveal are different transactions with durable enrollment states. Baseline confirmation must commit before reveal. Reveal may retry without recapturing the baseline. Source revocation between steps stops the flow.
7. AI stance is recorded as machine-generated, with model/rule identity and exact input hashes. Collaboration is a separately confirmed user decision after declared exposure. Neither becomes an independent human baseline.
8. Registered reports compare only complete, authorized enrollments of the same protocol. They must not scan arbitrary weekly ledger rows and silently discard incomplete ones. The report request selects an explicit enrollment cohort; incomplete enrollment reporting exposes only separately authorized status, not partial investment metrics.

## Additive persistence contract (schema not yet applied)

Use an append-only enrollment event stream and an immutable arm-to-observation binding, rather than updating research_decisions. Final SQL design must reuse existing owner locks, audit/outbox and idempotency infrastructure.

- Enrollment: UUID, owner, protocol version, thesis, canonical week text/date, candidate and approved source/grant hashes, frozen policy, creation time.
- Event: enrollment/owner, sequence, event type, immutable payload/hash, server timestamp, actor kind, request key and request hash. State derives from events under the owner lock.
- Arm binding: enrollment/owner/arm, ledger decision ID if applicable, distinct observation ID, frozen plan record/hash, originating event/hash, candidate/source/grant reference. Baseline ResearchCard reference is explicitly absent; AI/collab card references are separate typed identifiers.
- Uniqueness: owner+request key, enrollment+arm, owner+observation. Composite owner foreign keys must prevent cross-owner references. Null card on baseline is a valid explicit variant, not an inferred fallback.
- Exact retry returns the persisted response; changed payload under the same key conflicts. No new event, label, exposure or observation on duplicate retry.
- All binding validation and registered source checks happen in the same owner-locked transaction as append. A failure rolls back events, bindings, audit/outbox and exposure together. No filesystem/network side effect inside that transaction.

Required states: enrolled → baseline_confirmed → ai_exposed → collaboration_confirmed → observation_bindings_complete. Refusal/revocation/integrity failure are terminal for comparison use; resume must not erase exposure history. Missing optional collaboration is visible and cannot be promoted to complete by timeout.

## Implementation batches

A. Define versioned plan/enrollment payload schemas and transitions, with role and exposure invariants. Audit before migration. Confirm evaluator-supported direction/action semantics from the actual trade engine; unsupported plan shapes must fail closed.
B. Add append-only SQL constraints, owner/RLS grants and idempotency consistency checks. Isolated migration/restore acceptance only; no production changes.
C. Implement enrolled baseline command and confirmation UI. Use real actor/session authentication; client-supplied actor_kind or independent=true cannot confer human authority. Tests use explicit synthetic agent mode and never manufacture positive human evidence.
D. Implement guarded AI reveal and separately confirmed collaboration commands. Reuse existing source registration/freshness machinery; preserve distinct timestamps and input provenance. No retrospective binding API.
E. Construct observations from immutable plans, bind atomically, and adapt routing to enrollment variants. Keep legacy arm readers unchanged until candidate adapter acceptance. Existing non-null ResearchCard gate cannot be reused unchanged for baseline.
F. Implement cohort report transaction: resolve all enrolled scopes, acquire existing bounded registered batch guard, validate complete bindings and receipt/control history, append disclosure records, final freshness check and commit before returning. Report limits fail as a whole; no pagination-derived partial means.
G. Local UI/CLI acceptance, real synthetic trade engine execution, backup/restore and rollback verification; aggregate PR and release evidence. Production admission remains separate.

## Acceptance matrix

| Case | Required result |
|---|---|
| Agent/API body claims human baseline | Deny; no enrollment transition or exposure |
| Owner has not confirmed baseline | AI reveal denied; no automatic confirmation |
| Existing AI exposure for enrolled thesis/source | Independent baseline refused; no history reset |
| Retry same baseline request | Same frozen plan, no duplicate events |
| Same key with changed plan/action | Conflict; immutable original preserved |
| Two sessions capture/reveal concurrently | Owner-lock evidence proves baseline commit precedes reveal; exactly one event per key |
| Source revoked/stale between enrollment and reveal | Whole operation refused, no partial exposure or returned card |
| Two candidates or multiple declared comparison slots in v1 | Explicit unsupported state; no arbitrary first/latest selection |
| Historical ledger row offered for backfill | Refused; no source/date inference |
| Missing or shared observation binding | No complete comparison; no duplicated metrics |
| Plan cutoff changes at construction | Refused by hash/field checks |
| Fence gaps in evaluation history | Valid history accepted; malformed/duplicate receipts rejected |
| Cohort has one stale member | No partial report or partial disclosure writes |
| Refresh/restart or response loss | Persisted state recovered; same idempotency semantics |
| Rollback/restore | Bindings, events, exposure ordering and receipt hashes preserved |

These tests establish engineering behavior only. Real independent-human comparison quality and actual investment outcomes require genuine user activity after release. They cannot be supplied by this automation or by Claude audit.

## Audit resolutions: required before implementation

### One source of truth for exposure

Implement an owner-scoped enrollment-aware exposure predicate and writer used by every relevant read path, including weekly reveal, cards-page recordCardExposure, S4 reveal/citation/read, and registered report disclosure. Resolve candidate/source/wiki identity under the lock; do not limit evidence to the current week. Prior card generation for the candidate, prior relevant disclosure in any period, or an unprovable exposure history makes independent enrollment ineligible. Do not repair history or silently call it independent.

An ordinary read that would expose an active enrollment before baseline confirmation must either be refused or append a terminal contamination event before returning; choose refusal for v1. Unregistered/legacy read paths must be made enrollment-aware or unavailable for enrolled scope. No new bypass is acceptable because the original weekly UI remains available. S4 revealCards cannot be reused as baseline confirmation: it combines generation and exposure. Baseline confirmation and reveal remain separate durable commands. Reveal requires an authenticated owner confirmation; agent credentials cannot cause that transition. Record the AI stance actor as machine even though the owner requested reveal.

### Fixed start and explicit outcome semantics

Enrollment fixes a confirmation deadline and a common prospective session anchor under an immutable calendar/policy version. All required arm plans must be confirmed before that deadline; otherwise enrollment remains incomplete and cannot be shifted forward to fit a favorable start. Observation construction uses the frozen plan and anchor, never its current server time. Repeated construction returns the same immutable observation; differing IDs are allocated once at plan freeze and persisted. Delayed construction tests compare the complete persisted observation bytes/hash and plan, excluding no fields opportunistically. No newObservation=false or last_observation_id reuse is allowed.

Host inspection of the installed trade package (0.3.0, src/engine/observation.js) confirms evaluateObservation computes adjusted price change and benchmark difference without an action/direction input. Separate strategy.js has SELL semantics, but Alpha observation evaluation does not use that path. Consequently adopt/reject observations today are descriptive market outcomes, not decision P&L, avoided losses or causal AI benefit. Distinct observation IDs alone do not create distinct investment outcomes.

Batch A must first define and verify a versioned action/payoff schema and supported evaluator path using synthetic fixtures. Do not invent a mapping from evidence/counter card kind. Until that contract is implemented, the enrollment schema/migration and comparative investment report are not ready to activate. Capture-completeness status can be designed separately, but cannot be labelled strategy performance. This is an engineering dependency, not a request for the user to fabricate historical labels.

### Added acceptance requirements

- One matched thesis plus exploration sibling: only predeclared slot bound; no arbitrary sibling return or unrecorded exposure.
- Candidate with pre-existing ChangeCard: independent enrollment refused.
- Prior-period same-source/wiki exposure: refused, with no current-week reset.
- Ordinary cards-page read before baseline confirmation: refused before disclosure.
- Agent-triggered reveal: denied with no state transition. AI stance actor remains machine.
- Card/source bytes changed after an initial read: owner-locked recheck fails, no response/exposure.
- Missed enrollment deadline: no anchor shift, no completed comparison.
- Delayed observation construction: identical preallocated ID, cutoff, anchor and immutable bytes/hash.
- AI stance inferred solely from card kind, unsupported action, or shared observation ID: refused.
- Same market path with different action semantics: evaluator conformance demonstrates the declared payoff rule; current observation price returns alone cannot satisfy this test.

## Batch A partial implementation: explicit price-payoff protocol

Local arm-payoff.ts implements alpha-arm-price-payoff/1.0 with an explicit long or cash choice and hypothetical unit-notional gross price return. Cash earns zero by declared convention. Benchmark difference uses the installed trade computeAlpha; gross long values are checked against exported BUY computeReturn. Invalid/pending prices remain unavailable even for cash. No SELL/short or legacy adopt/reject/card-kind mapping is accepted. Dividends,interest,fees,financing,tax and execution remain excluded. This is a pure mathematical protocol, not an authenticated frozen plan or a registered evaluator/report integration. Next bind the protocol into the enrollment payload/immutable plan with real confirmation and fixed anchor before persistence/runtime activation.

## Batch A partial implementation: frozen plan wire schema

Local arm-plan.ts defines alpha-arm-plan/1.0: one owner/candidate/thesis, frozen security/calendar/policy digests, canonical UTC instants with enrolled_at < deadline < common anchor, and three distinct preallocated observation identities. Freeze accepts explicit long/cash before deadline and binds every common field plus arm/cutoff/choice into an integrity digest. Exact plain own-data fields reject getters, symbols, foreign prototypes and Proxy traps; detached nested snapshots are frozen.

This structural schema is inactive. A digest is not consent or authority. Future owner-locked command must resolve configured security/calendar/policy, registered grants and exposure history, use trusted server time and persisted cohort, enforce first-write uniqueness per arm and exact idempotent retry, then preserve frozen bytes during delayed observation construction. It cannot call freeze again at construction to move the cutoff. No positive human confirmation, enrollment transition or deployment is claimed by synthetic schema tests. Next: append-only event/state contract and refusal rules, followed by additive DB constraints/owner/RLS/idempotency acceptance.

### Delayed construction integrity prerequisite

verifyFrozenArmPlan reconstructs canonical field equality from persisted cutoff/cohort and checks against a separately trusted originating freeze-event hash. It has no construction-time clock and returns detached frozen values. Rehashed changed position, cutoff, anchor or IDs cannot pass against the original event hash. Canonical out-of-window persisted cutoff and cohort drift are integrity refusals (hash_mismatch), separate from current construction admission. The future transaction must resolve that event/hash under owner lock; accepting a client-supplied expected hash would destroy this guarantee. Registered grant/freshness/revocation checks remain mandatory and are not supplied by this helper. No observation creation or runtime path enabled.

## Batch A partial implementation: enrollment ordering gate

arm-state.ts permits exactly enrolled → baseline_confirmed → ai_exposed → collaboration_confirmed → observation_bindings_complete. Every nonterminal state, including completed, can transition to terminated; terminated never resumes or accepts another event. A skipped/repeated edge fails invalid_transition; a terminal event attempt fails terminal_state. Neither is a configuration/retry signal. The abstract matrix tests establish ordering only, not authenticated human evidence or complete event-stream integrity.

Every future terminated event must persist a typed reason (refusal, revocation, contamination, missed deadline or integrity failure), pre-termination state and originating references. Do not erase prior events or exposure. Deadline lapse must be checked under owner lock against trusted server time/frozen deadline and reported as explicit incomplete status or appended terminal event; the common anchor cannot shift. Optional collaboration means the user may leave comparison incomplete, never complete with a missing arm. Status readers must show that distinction and the termination reason.

Authenticated owner confirmation, source/exposure/deadline validation and all distinct frozen observation bindings remain mandatory transaction checks before calling the gate. Resolve exact idempotent retries from persisted response before transition; a repeated confirmation under a different request key is a refusal, not a refreeze. A future event replay validator must verify complete sequence, owner/cohort/hash/typed payload integrity and map corrupt history to integrity refusal, rather than use this ordering helper alone as evidence. No persistence, confirmed commands or runtime report has been enabled.

## Candidate storage migration: refusal-only prototype

docs/contracts/prototypes/arm-enrollment-storage.sql is explicitly applied by the isolated test only, outside the deployable migration chain. It adds forced-owner-RLS immutable enrollment snapshots and a single refused-before-exposure terminal record. This deliberately supports only sequence1 terminated from enrolled, with closed refusal-only reason/previous_state fields and unique enrollment/request keys. Forward confirmed/exposed/binding events are unavailable until their typed payload, authentication and complete replay contract exist in a later migration. This is not the full enrollment journal or usable comparison feature.

Closed cohort fields/identities, canonical UTC timestamps/chronology and distinct preallocated IDs are checked; enrollment timestamp must be no more than5minutes before server-recorded time and cannot be in its future; deadline must remain after server-recorded time. Runtime INSERT excludes recorded_at; owner/admin truncation is also refused by statement trigger. Only the dedicated server role gets SELECT and allowed-column INSERT, with FORCE RLS. That role can set session owner claims, so this boundary protects against wrong-owner application operations, not a compromised server role. API roles remain unprivileged.

Hashes remain format-only at this storage layer; typed application validation and canonical digests must be verified under owner lock before future commands use them. Observation IDs are not yet globally reserved across enrollments; thesis/security/source authority, current revocation, event hash/sequence replay and exact persisted-response idempotency remain future work. The unique request key prevents duplicates but does not itself return the original response. Actual local PostgreSQL acceptance uses synthetic refused storage only; no human confirmed label or investment outcome is generated. No production migration, feature flag or route activation.

Final audit hold: do not move this prototype into supabase/migrations or allow real row writes until the full typed event/actor/origin contract and immutable compatibility strategy exist. Only reason=refusal before exposure is supported. Missed deadline, contamination and revocation reasons need later trusted event/source checks. The isolated test applies this file explicitly; ordinary production migration tooling cannot discover it.

### Refusal prototype negative acceptance follow-up

Actual isolated DB evidence now includes named composite FK refusals under correct owner claims referencing a foreign real fixture, actual API-role INSERT denials, bounded type/null/shape/event mutations and valid-cohort controls preceding mutation loops. Fixture time comes from PostgreSQL with generous deadline margins. Sequence1 accepts no previous hash; no unreachable forward hash-format branch or hash-format coverage claim remains. These tests validate refusal storage constraints only; full journal/actor/source/digest/observation/idempotent-response obligations remain unfinished.
