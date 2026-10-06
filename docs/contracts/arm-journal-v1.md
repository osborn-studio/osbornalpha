# Prospective arm journal v1: typed event and replay implementation contract

Status: implementation contract only. No forward-event writer, authenticated confirmation, complete replay verifier or production migration exists. Complements prospective-arm-capture.md and inactive arm-plan/arm-state helpers. The refusal-only SQL under prototypes stays outside the deployable migration chain.

## Scope and compatibility admission

One owner, one registered candidate/source, one predeclared thesis slot and one fixed prospective calendar/price-payoff protocol. No historical backfill, source/slot inference or shared observations. Exact keys and canonical pa-jcs/1.0 values, lowercase UUID/hash and canonical millisecond UTC timestamps are mandatory.

Full journal storage must be designed as a new versioned contract, not by treating prototype refusal rows as confirmed evidence. The prototype lacks actor/origin provenance and persisted responses. Before any migration admission, prove zero prototype rows in the intended release target; if nonzero, hold release and document an explicit immutable compatibility strategy. Never delete or rewrite those rows to pass admission. Development tests use fresh isolated databases.

## Trusted command and actor boundary

Actor context comes from the existing authenticated owner/session or agent resolver and registered operation guard, never body fields. An owner session identifies a principal; it does not independently prove a natural person, independent judgment, or the quality of a decision. The automation must not manufacture actual owner confirmations or human labels.

Every confirming command requires explicit owner intent for this enrollment, correct session class and existing CSRF protections. Agent credentials cannot confirm baseline, reveal or collaboration. AI stance uses machine provenance even when an owner requests reveal. Persist minimal actor subject/class and a reference/hash to the server-created authorization/confirmation record; never JWTs, session secrets or provider credentials. A label actor_kind or independent flag supplied by a client confers no authority.

Generation/model processing still requires the source's actual permission and configured budget. This contract does not expand current private-data or external-model permissions and cannot auto-enable a dormant capability.

## Frozen cohort and wire event envelope

The full cohort uses alpha-arm-cohort/2.0 and its frozen plans use alpha-arm-plan/2.0. Existing alpha-arm-plan/1.0 helpers remain inactive legacy mathematical/schema prerequisites and are not accepted by this journal. No projection or silent field addition is allowed. Its creation records the authoritative candidate/source/grant/version/mapping references, predeclared thesis slot, three preallocated distinct observation IDs, immutable calendar/evaluation/security hashes, confirmation deadline and common future anchor. Registration must prove these from trusted records, not the submitted cohort alone.

A full event envelope has exactly: protocol, id, owner_id, enrollment_id, cohort_hash, sequence, previous_event_hash, type, occurred_at, actor_ref, authorization_ref, authorization_hash, request_ref, request_hash, payload. Version: alpha-arm-journal/1.0. Hash is digest(envelope); the separately stored event_hash is not inside its own preimage. Sequence starts at1; previous hash at1 is the trusted cohort creation hash, not null. Later events reference the preceding event digest. This intentionally differs from the refusal prototype.

occurred_at comes from serverTime(db) inside the owner-locked transaction. DB recorded_at is a server-controlled insertion timestamp and is not substituted for the frozen command cutoff. References and their hashes resolve to immutable owner-scoped records. Actor/ref provenance must be validated, not just UUID-shaped. The creation record and authoritative last-head snapshot supply the expected cohort/head; a hash self-reported by an uploaded event list cannot establish authority.

## Closed payload variants

| Event | Exact payload fields | Mandatory origin and checks |
|---|---|---|
| baseline.confirmed | plan_ref, plan_hash, confirmation_ref, confirmation_hash | Authenticated owner intent; frozen baseline plan excludes AI material; common deadline; no prior relevant exposure/generation in any period |
| generation.reserved | reservation_ref, reservation_hash, baseline_event_ref, baseline_event_hash | Exactly one journaled generation slot; baseline committed in an earlier transaction; immutable input/model/processor/budget and preallocated output IDs |
| stance.generated | reservation_ref, reservation_hash, stance_ref, stance_hash | Dedicated verified worker; same reserved execution; one completion; current capture/processing permissions |
| ai.exposed | ai_plan_ref, ai_plan_hash, stance_ref, stance_hash, disclosure_ref, disclosure_hash, reveal_confirmation_ref, reveal_confirmation_hash | Machine stance/model-input provenance; declared fresh thesis slot only; owner-requested reveal; baseline already committed; AI plan frozen before first disclosure |
| collaboration.confirmed | plan_ref, plan_hash, confirmation_ref, confirmation_hash, disclosure_ref, disclosure_hash | Separate owner intent after declared exposure; no inferred adoption; distinct frozen observation ID; deadline met |
| bindings.completed | baseline_binding_ref, baseline_binding_hash, ai_binding_ref, ai_binding_hash, collaboration_binding_ref, collaboration_binding_hash | All three immutable plans/observations match their originating events; no reused observation across enrollments/arms; construction preserves original cutoff/anchor/IDs |
| terminated | reason, previous_state, cause_ref, cause_hash | Contextual refusal/revocation/contamination/deadline evidence; preserve prior events/exposure; current state and cause verified |

Every reference resolves to the correct versioned record type and namespace. A ResearchCard is not an S4 ChangeCard; a ledger decision is not an S4 Decision; none can be linked by guessed ID equality. Each record/payload digest is recomputed after JSONB roundtrip and binding to owner/enrollment/candidate. Exact field sets include no arbitrary label or free-form confirmation fallback.

AI stance generation follows the journaled reservation and precedes reveal without disclosing it; freeze and validate its plan at the single verified completion before the exposure event is committed. Generation and exposure must not inherit the legacy revealCards combined path. The event's command actor may be the requesting owner; its referenced stance actor remains machine.

## Complete replay and terminal handling

Load the explicit enrollment under the owner lock with trusted creation/head metadata. Query every event for that owner/enrollment with101-row overflow detection, stable sequence ordering and no kind/revision/time filtering that could hide a corrupt row. Bound100 includes all terminal/control events. Overflow, omitted event, duplicate IDs/sequence/request references, gap, owner/cohort mismatch, wrong previous hash or wrong typed reference fails the entire replay. Head count/last-sequence/last-hash must agree with the complete rows; do not accept a caller-truncated prefix.

Verify envelope digests, actor/authorization/origin records and all closed payload variants before advancing the new full-journal ordering gate. Forward transitions for the full journal use the new six-edge protocol below; the existing four-edge helper cannot be used unchanged. Any event after terminated is invalid, including a second terminal. A complete state is not current report authorization; source revocation/freshness must still be checked at use.

A missed deadline leaves an incomplete enrollment or appends a verified terminal cause; it never shifts anchor or fills an arm. Integrity failure in a corrupt chain cannot append a fabricated valid terminal with guessed previous_state. Quarantine through a separate existing integrity/control mechanism, return an integrity refusal, and preserve corrupt bytes for authorized investigation. Recovery needs an explicit verified procedure; never clear exposure/history by retry.

## Atomic append and idempotent response transaction

1. Authenticate principal/session without earlier mutation; use the existing bounded registered owner transaction and approved source mapping. Acquire the existing owner lock and read canonical enrollment/head. Validate scope, current source/grant freshness, integrity and intended command permission.
2. Resolve an owner-global, namespaced arm request key. Hash only canonical client intent plus resolved immutable identifiers/version; exclude newly sampled server time or newly generated IDs so exact retries can match. A different intent under the same key conflicts before new events/exposure.
3. Exact replay must recheck current source/disclosure permission before returning persisted content. Revoked/stale grants do not authorize cached results. Return persisted canonical response bytes, with replay status in a separate transport field/header; no new event, plan or exposure.
4. For a new command, verify complete history, deadline/exposure constraints and typed origins. Sample server time and allocate any event/ref IDs once. Append new records, event, binding reservations, audit/outbox and persisted response in this same transaction. CAS head must advance from the verified old head; distinct request keys cannot bypass one-time arm freeze.
5. Recheck registered freshness through the existing final commit fence. Commit before returning any protected response. Failure rolls back every record/event/response/exposure reservation together. No network/filesystem/anchor side effect inside the SQL transaction.

Existing s4/records.ts replayRequest/saveRequest provide immutable owner-global request storage, but replayRequest changes response by adding duplicate:true and does not itself authorize disclosure. Reuse storage only after a typed arm response/version adapter and current authorization checks are implemented; do not copy it blindly as an exact-byte or security guarantee. Request-key collision policy must include the existing S4 namespace; a second journal-local unique index alone is not global idempotency.

## Required isolated acceptance and release gates

- Agent/body authority claims refused without state/exposure mutation; no fabricated real human positive labels.
- All sequential/terminal/omission/hash/type/namespace/owner mutations fail as a whole; bounded101 overflow is explicit.
- Correct owner claims with foreign real candidate/origin/event references fail; API roles cannot read/write; dedicated runtime cannot override server time, update/delete/truncate history or reserve another owner's IDs.
- Two sessions, same request and distinct requests: genuine owner-lock/CAS/idempotency proof, not array-order simulation. Response loss and restart replay identical persisted bytes; stale permission refuses cached content.
- Delayed construction preserves original plans and preallocated observation bytes; post-deadline command cannot refreeze. Revocation between baseline, generation, reveal, collaboration and report causes whole-operation refusal.
- Source/stance/sibling reads cannot bypass enrollment exposure predicate. Every ordinary weekly/cards/S4/report read path needs explicit integration acceptance.
- Fresh isolated SQL replay plus backup/restore preserve events/head/reservations/response hashes. New versioned migration and full actor/origin payload compatibility audited before deployment admission.

This document closes schema/transaction design questions only. It does not deliver the runtime feature, genuine user comparison data or investment performance evidence. The next implementation batch is exact event/payload parsing and bounded replay against trusted head metadata with synthetic machine/refusal fixtures, followed by actual SQL actor/origin/response/reservation constraints and authenticated command integration.

## Audited implementation decisions

### Single genesis and version separation

The one genesis preimage is the exact alpha-arm-cohort/2.0 creation payload, including owner/enrollment/candidate/thesis/preallocated IDs/calendar/security/evaluation/payoff protocol, created_at/deadline/anchor, creator actor and authorization references/hashes, and exact approved source/grant/version/mapping references/hashes. Store that payload as an immutable typed ArmCohortGenesis record. genesis_hash=digest(payload). No wrapper ID or DB recorded_at is inside this preimage; payload.created_at is the trusted sampled DB time. Stored row IDs/owner/record type must separately match the payload and references.

Every alpha-arm-plan/2.0 cohort_hash and every journal envelope cohort_hash must equal this same genesis_hash. Sequence1 previous_event_hash equals genesis_hash; later previous hash equals the last complete event envelope digest. No v1 projection or v1 plan can enter v2 journal verification. New v2 plan parser/build/verify must bind the complete genesis digest; do not adapt current v1 helpers by dropping added source/actor fields.

### Response storage, key ownership and permission purposes

Use additive typed protocol/request_kind/response_version/canonical_response_text/response_hash fields on the existing owner-global research_s4_requests namespace, with an explicit legacy.untyped discriminator for old rows, without rewriting their original request/response. Arm replay accepts only the exact arm protocol/version/kind plus matching intent hash. A legacy/other-kind occupied key conflicts regardless of prefix or coincident hash. All S4 request writers/readers must enforce this discriminator before arm activation; old replayRequest cannot return an arm record as a spread JSON object. Deployment admission must verify no incompatible old request writer remains. Prefixes are readability only.

Persist canonical response text and digest of its exact UTF-8 bytes atomically with the arm event/head/reservations. Replay verifies the response digest and returns that text unchanged, with duplicate status outside the body. No JSONB-to-bytes reconstruction claim. Each command uses the exact intent variants below. Newly generated confirmation/authorization records are output origins, never client-supplied approval or intent hash fields.

The closed multi-purpose grant bundle and per-command authority rules below govern all new use and protected replay. Registered freshness alone supplies no use authority.

Lock order across legacy and new callers is owner advisory lock, registered guard/mapping resolution, candidate row, enrollment/head/typed request/reservations. No nested transaction or earlier candidate row lock. Recheck final registered freshness before commit. Exact success replay after a missed confirmation deadline is allowed only as an immutable already-committed response under CURRENT matching disclosure permission; it creates no new arm or state. Revocation/stale permission returns a typed current policy_blocked/registered-source refusal without overwriting the stored success or advancing head. An incomplete old command cannot use retry to bypass the deadline.

### Typed origin tables, termination authority and generation ordering

Use new versioned arm origin records with explicit protocol/kind, owner/enrollment/candidate, actor class/subject, authorization ref/hash, origin command ref/hash, occurred_at and exact payload/hash. Required kinds: ArmCohortGenesis, ArmAuthorization, ArmOwnerConfirmation, ArmFrozenPlan, ArmGenerationReservation, ArmMachineStance, ArmDisclosure, ArmObservationBinding, ArmTerminationCause. They do not use addRecord's free-form kind/audit actor as a sufficient proof. New table/kind schema plus foreign ownership/version/hash checks is mandatory before persistence activation; referenced S4 records keep their original namespaces.

| Terminal reason | Allowed appending principal | Required immutable cause and validation |
|---|---|---|
| refusal | Authenticated owner intent | ArmTerminationCause referencing separately recorded owner refusal confirmation and current verified head |
| revocation | Owner command observing revocation, or dedicated server revocation worker | ArmTerminationCause binds trusted PA revocation feed/sequence/grant evidence; worker has dedicated server authorization, not agent token |
| contamination | Owner command or dedicated server exposure guard | ArmTerminationCause references the actual immutable exposure record and registered scope; do not fabricate a clean pre-exposure refusal |
| missed_deadline | Owner command or dedicated server deadline worker | ArmTerminationCause binds genesis hash/deadline and trusted observed DB time >= deadline; no anchor shift |
| integrity_failure | No journal append if chain/head is corrupt | Separate integrity quarantine/control incident preserves corrupt history; never guess valid previous_state or previous hash |

Acceptance agents cannot terminate or confirm production enrollments. Dedicated worker principals require new verified server authorization/ref recording, not a widened S4Actor.kind or a body claimed system class; no worker is enabled by this design. previous_state must equal complete trusted replay output. A valid owner cancellation/revocation after completion remains terminal; no event after terminal.

ArmMachineStance must carry the baseline event ID/hash, origin generation command and server-generated timestamp. Under owner lock the baseline confirmation is already committed in a DIFFERENT transaction before generation is admitted. Generation uses the new journal reservation/completion events below (no first disclosure), with generated_at strictly after baseline occurred_at; timestamp equality refuses/retries generation without shifting frozen cutoff. Reveal verifies that same baseline binding and stance origin/time, frozen AI plan and exact declared slot before disclosure/ai.exposed append. Stance generated before baseline or for another enrollment cannot be reused. Server timestamps/hash linkage establish engineering ordering, not genuine human independence or causal investment benefit.

### Exact intent variants to freeze in the command adapter

All intents have exactly protocol=`alpha-arm-command/1.0`, kind, source_bundle and the fields in the row below. source_bundle is exactly the alpha-arm-source-bundle/1.0 wrapper below, including explicit generation_mode and processor; do not infer mode from a missing processing grant. Values resolve against the trusted registered/purpose-specific records; submitted reference metadata is never an approval. Non-creation intents additionally have enrollment_id, genesis_hash, expected_head_sequence and expected_head_hash. Creation expects no generated enrollment/event/head ID.

| kind | Additional exact fields |
|---|---|
| create | candidate_id, thesis_id, security_identity_hash, calendar_session_ref, calendar_hash, evaluation_policy_hash, payoff_protocol |
| baseline.confirm | payoff_position |
| generation.reserve | generation_policy_ref, generation_policy_hash, processor_ref, processor_policy_hash |
| stance.complete | reservation_ref, reservation_hash, result_ref, result_hash |
| ai.reveal | stance_ref, stance_hash |
| collaboration.confirm | payoff_position, disclosure_ref, disclosure_hash |
| bindings.construct | no additional client fields; resolve all frozen plans/observations from complete server history |
| terminate | reason, cause_ref, cause_hash; reason/class permissions come from the trusted resolver and matrix |

payoff_position is exactly long or cash; no adopt/reject/card-kind inference. Calendar/session and policy references resolve immutable versions before creation; the server derives confirmation_deadline and session_anchor from those resolved calendar/evaluation versions, never from client fields; the client cannot choose or shift either time. New server timestamps, allocated IDs, authorization records and authentication transport are not request hash fields. Every preexisting intent reference/hash must already be fixed and authoritative; a missing reference cannot be opportunistically regenerated on retry. Hash preimage is exactly `{owner_id: resolvedOwner, intent: validatedExactIntent}`; response version and journal protocol are explicit in the stored typed request record. Unknown commands/keys/types refuse, and none of these additional kinds currently exists as a runtime endpoint.

### Final audit resolution: generation is part of the journal

The full journal requires a new state/replay protocol, not the current four-edge arm-state helper. Exact forward states: enrolled → baseline_confirmed → generation_reserved → stance_generated → ai_exposed → collaboration_confirmed → observation_bindings_complete. Termination remains irreversible from every nonterminal state. Add two closed event payloads: generation.reserved has reservation_ref, reservation_hash, baseline_event_ref, baseline_event_hash; stance.generated has reservation_ref, reservation_hash, stance_ref, stance_hash. All event envelopes bind the same genesis and contiguous authoritative head.

Reserve exactly one generation slot per owner/enrollment under owner lock and journal/head CAS, with a unique reservation and one unique completion. Distinct request keys cannot produce another reservation or select another stance. The reservation fixes baseline event/hash, declared thesis slot, generation/model/input policy hashes, processor, bounded budget reservation and preallocated result/AI-plan IDs. Persist request response plus authorized job/outbox intent in the SQL transaction before any worker/model call. Execution is outside that transaction with a dedicated trusted worker, current source/processing permission, existing admission/stop/budget gates and stable job identity. No worker is enabled here.

Known failure/abandoned/unknown delivery leaves the reserved slot visibly held/incomplete; never delete/release the slot or silently rerun generation with new inputs/IDs. Query/recover only that same authorized execution when the provider supports trustworthy status; an unsupported unknown outcome stays held for an explicit recovery decision. Completion can freeze one matching machine stance/AI plan and append stance.generated once after current guards. Reveal accepts only this reserved/completed stance, never a first/latest/client-selected alternative. Missed deadlines do not shift anchor; stopping/terminal policy does not erase execution history. Full replay verifies reservation and completion counts/origins, including held execution state.

### Final audit resolution: closed multi-purpose grant bundle

Genesis binds one exact source_reference (feed/source/version) plus purpose_map with keys exactly capture, disclosure, processing. capture and disclosure are required; processing is null for predeclared local-only generation and otherwise required. Each non-null entry has exactly grant_id, grant_version, grant_hash, mapping_hash, purpose, recipient. Capture/disclosure use alpha_arm_capture/alpha-local and alpha_arm_disclosure/alpha-local. Processing uses external_model_processing plus the single frozen allowlisted processor recipient. All entries resolve the SAME enrolled upstream owner/workspace/source/version and their separately approved mappings; no other-source grant can be substituted. Bundle, local/external mode and processor are immutable genesis fields.

Every intent supplies this same complete source_bundle; its canonical digest must equal digest(genesis.source_bundle) (creation validates all before genesis allocation). Commands require the appropriate entry or entries: creation/baseline/collaboration/bindings/generation reservation need capture; reveal/report need disclosure; external reservation/execution/completion need capture AND processing, and any content return also disclosure. Every cached protected response kind requires current disclosure permission; generation responses with model output additionally require current processing permission. Status-only responses need an explicit versioned minimal projection, not an exemption that leaks source/model content.

The chosen rotation policy is refusal: any approved bundle entry version/mapping/source version no longer matching trusted current records blocks new commands/protected replay/report; never rebind the genesis silently. A verified worker may terminate with corresponding revocation cause under the authority matrix. Multi-reference registered guards must cover all bundle entries atomically and count each reference against the existing batch budget; overflow rejects the whole request, without partial metrics/disclosure.

Current PA-v1 ProcessingGrant schemas only admit alpha_research_import and external_model_processing. Therefore alpha_arm_capture/alpha_arm_disclosure require NEW versioned producer approval/policy and purpose-mapping schemas/authorizer, before command activation. The current single-grant candidate binding cannot supply this bundle. Do not broaden the old enum in place or treat import as capture/disclosure. Existing registered import validation remains an additional prerequisite, not the purpose-specific use authority. Missing new approvals keeps the full feature unavailable and does not ask this automation to fabricate permissions.

### Owner confirmation record allocation and non-circular intent hashing

Owner confirmation references in event payloads are generated server records in the SAME new confirming command transaction; they are not client authority objects and are not prerequisites with an unknown future enrollment ID. Exact baseline/create/reveal/collaboration intent variants above therefore omit newly generated confirmation/authorization IDs and hashes. Authenticated explicit owner action plus current guards creates the typed owner-intent/confirmation record once, bound to validated canonical business intent, owner/candidate, and the newly allocated or preexisting enrollment. Its sampled cutoff is the command's trusted freeze time; the event/plan bind that record/hash. No later command reconstructs an earlier cutoff or fabricates a confirmation from a body flag. Exact replay returns the persisted records/response without reallocating them. Preexisting disclosure/stance/policy references remain exact intent fields; newly allocated reservation/budget/execution IDs are output/origin fields, not digest inputs.


### Structural replay prerequisite scope

Inactive arm-journal-integrity checks a bounded complete structural chain against separately supplied trusted head metadata; it does not resolve genesis, typed actor/origin records, source-purpose approvals or deadline authority. New arm artifact UUIDs (plans, confirmations, reservation, stance, disclosure, bindings, cause) are distinct logical objects within an enrollment and disjoint from event/request IDs. References back to an already created artifact retain that same ID. This new journal identity rule cannot be projected onto legacy records or the refusal prototype; full persistence must enforce the same rule before activation. Digest equality or structural replay success never admits a report or machine execution.


### Source bundle wire prerequisite

The inactive alpha-arm-source-bundle/1.0 wrapper freezes exactly protocol, source_reference, generation_mode, processor and purpose_map. Local mode has null processor/processing; external mode has a bounded opaque processor identifier and matching processing recipient. This structural equality is not an allowlist, endpoint or model-call instruction. Separately approved purpose-specific grants require distinct grant IDs and complete grant digests across roles. A shared mapping_hash may identify common source scope, but the future trusted resolver must still bind each approved mapping to the particular grant/purpose/recipient and upstream owner/workspace/source/version. Neither digest shape nor bundle parsing supplies permission. New producer/policy schemas and full authority validation remain required before activation.


### Exact v2 genesis implementation prerequisite

alpha-arm-cohort/2.0 has exactly protocol, owner_id, enrollment_id, candidate_id, thesis_id, observation_ids, calendar_session_ref, calendar_hash, security_identity_hash, evaluation_policy_hash, payoff_protocol, created_at, confirmation_deadline, session_anchor, creator_actor_ref, authorization_ref, authorization_hash, source_bundle. The complete parsed payload is the single genesis preimage, including the full source wrapper/mode/processor. Creation samples created_at from locked DB server time; resolves deadline/anchor from fixed calendar/evaluation versions, without client inference.

New v2 enrollment/candidate/thesis/calendar-session/authorization/observation/feed/source/grant IDs are pairwise distinct. owner_id and creator_actor_ref may equal each other as principal identifiers; no logical object/record/event/request/artifact may reuse either principal ID. Do not retrofit this rule onto existing legacy/prototype rows. The wire parser/digest supplies neither trusted ownership nor authentic origin records; these remain mandatory before runtime admission.


### Stored snapshot structural binder prerequisite

The inactive binder joins exact alpha-arm-genesis-record/1.0 (ArmCohortGenesis wrapper) and alpha-arm-bound-head/1.0 snapshots to independently resolved owner/enrollment/candidate scope, verifies payload/head identity/time/hash and complete structural replay. It performs no SQL loading or authentication: snapshots must later be loaded from trusted storage under the owner lock. Record wrapper IDs are outside genesis preimage and cannot alias logical objects or principals. New allocated event/request/artifact IDs cannot alias reserved genesis/principal IDs. Actor and authorization namespaces are disjoint from non-authorization logical objects; lawful reference reuse still needs immutable origin and per-command authority checks. The one allocatedJournalRefs table is shared by replay and binder. No result authorizes a report, processing or genuine user comparison.
