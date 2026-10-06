# Registered arm report implementation contract (candidate)

Status: audited design; provenance bridge must be specified before adapter code; existing arm-report CLI remains legacy. Production runtime stays disabled. Implement this bounded slice before changing the CLI; do not silently reinterpret legacy rows.

## Verified source and problem

- `src/lib/research/s6/arm-report-db.ts` reads every selected decision and its latest raw evaluation in one owner transaction. It catches observation failures and returns decision/thesis/arm metadata with blocked codes; it never checks registered feed freshness.
- `src/lib/research/s4/ledger.ts:recordDecisionWithin` permits null observation_id and arbitrary same-owner cited judgments. Ownership does not establish a single candidate's grant over the entire decision.
- `src/lib/research/s6/arm-report.ts` pairs rows by thesis/week and uses input ordering to pick latest resolved results. Omitting denied rows or paginating then summarizing changes denominators and pairings.
- `scripts/arm-report.ts` loads developer environment and emits rows/summary through the legacy loader. No registered CLI replacement yet.
- `registeredObservationTransaction` owns a transaction; calling it per row cannot establish one final freshness checkpoint across the report. Use the existing bounded batch helper on one owner-locked client instead.

## First implementation slice

Create `loadRegisteredArmRows` as an internal candidate adapter with the same output type only for a fully eligible bounded window. Retain legacy function for existing fixtures until explicit CLI cutover acceptance. Do not add a fallback to legacy on failure.

1. Validate since as a real canonical date (round-trip, not Date.parse alone). Select at most101 decision routing rows in stable existing order under owner lock. No evaluation material in the selection query. More than100 rows fails input_limit; never return or summarize a partial page. Empty returns empty without batch invocation.
2. Version-one eligibility is intentionally restrictive: every decision must have an owned Observation. Null/missing observation, nonempty cited_judgment_ids or unprovable card linkage rejects the entire report with not_configured. No automatic repairs, inferred provenance or dropped rows. The ledger ResearchCard ID must be non-null; expose it as research_card_id. Validate ChangeCard linkage through Observation → S4 Decision → ChangeCard, never by equating these separate card namespaces. Reject duplicate observation_id across selected decisions (within or across arms) and stored arm=averaged. A trusted versioned bridge must bind the ledger decision thesis/week to the S4 decision/thesis revision/evaluation period; ownership alone is insufficient. Current InputSnapshot contains thesis_revision_ref rather than the ledger thesis_id and does not directly contain a week, so do not invent a direct column equality or infer a bridge by dates. Unmapped rows remain ineligible. This restriction is provisional until a versioned multi-source ledger provenance contract exists.
3. Resolve distinct observation candidate IDs/payload hashes on the same client. Reject inconsistent/missing rows. Resolve each distinct stored registration and call withRegisteredCandidatesInTransaction once, bounded100. Deduplicate shared candidate references, not decisions.
4. Inside the guard validate all selected candidates with validateRegisteredStoredCandidate and each observation with observationFor. Null authorization, cancelled observations, stale grants, tombstones or corrupt source/input links fail the whole report. Do not catch these and emit blocked metadata. This differs deliberately from the legacy partial report.
5. Only after authorization load the latest persisted evaluation for each observation by validated unique revision, without SQL casts on untrusted JSON. Fetch at most101 rows per observation and fail input_limit above100; reject malformed/duplicate revisions rather than hiding conflicts with timestamps or IDs. Revisions need not be contiguous: legitimate intent fences advance observation revision without creating an evaluation. All selected evaluation revisions must be positive safe integers no greater than current observation revision. Validate result hash, full historical receipt/body integrity and unique independent evaluation.append ControlEvent with matching candidate/observation/revision/hash. Explicitly require persisted input.observation_sha256 to equal the authorized observation payload hash and ControlEvent.candidate_id to equal the authorized candidate. Reuse or extract existing receipt/replay validation; do not call the live market adapter or recompute with a new engine. Missing evaluation is a legitimate null, corrupt evaluation is an error.
6. Record an exposure per distinct candidate containing actually disclosed decision/observation/evaluation IDs and source subject refs, without raw private content. Exposure and report validation share the same transaction; final batch freshness recheck precedes commit. Do not mint human labels or change frozen arm assignments.
7. Return existing ArmRow values in original ordering, blocked=null. A failure emits no rows, counts, thesis IDs or partial statistics. Outer error mapping uses existing branded revocation classification. No report stream before commit.

## Required local verification

Use isolated PostgreSQL and explicit synthetic fixtures, never actual human labels. Existing arm-loader tests seed unverified evaluations directly and cannot establish the new receipt-integrity contract; new acceptance must generate genuine synthetic commits through the registered evaluator.

- Two eligible candidates/feeds and repeated decisions share one bounded batch; all rows and exact summary denominators retained.
- Empty, exactly100,101, malformed/normalized-overflow date, null observation, missing observation, cross-owner observation, cited-judgment and invalid ResearchCard-reference cases; no partial output/exposure on failure.
- Valid no-evaluation vs corrupt result/receipt/control, duplicate or malformed revisions, valid fence-created revision gaps, >100 evaluation rows, latest unique revision selection; no engine/network calls. Start from genuine synthetic registered commits, then record privileged fixture-only tampering with immutable triggers restored in finally; never seed fabricated receipts as positive integrity evidence.
- Null-ResearchCard/thesis/week mismatch, reused observation within/across arms and stored averaged arm reject without output/exposure. A positive provenance test needs an explicitly captured trusted bridge; no invented labels or inferred thesis mapping.
- Stale/revoked/tombstoned one of two candidates rejects whole report, including metadata; no silent omission or reduced denominator.
- Real delayed exposure insert with a later final freshness failure rolls back every exposure; owner-lock writer/consumer ordering uses actual lock witnesses, not timing alone.
- CLI cutover only after adapter acceptance. Use explicit local fixture state and registered loader, structured safe errors, finally-close, no .env loading in synthetic acceptance. Compare JSON/Markdown output for a fully eligible report. No production enablement.

## Unresolved wider work

Cited judgment provenance may span multiple candidate/source versions. Do not invent a reverse join based only on source ID; define approved mappings first. Terminal/archive/index, ledger writes, arm semantics and anchor integrity are separate tasks. This bounded adapter is not a full ledger authorization solution. Approval of the existing draft PR is not production rollout approval.


## Audit dispositions and next dependency

Opus5.5 task task_c1731699 identified decision/observation provenance and unbounded receipt selection as blockers. Accepted non-null card, unique observation, no stored averaged arm, explicit thesis/week bridge, bounded raw receipt selection, duplicate rejection, authorized hash/candidate binding and tamper-test requirements. Rejected the suggested contiguous-from1 revision rule: intent-fence legitimately consumes revisions, so evaluation gaps alone do not prove corruption.

Before implementation, specify the bridge from existing ledger decision ID to S4 Decision record/input snapshot/thesis revision/evaluation period. Verify how an actual confirmed user decision can create it atomically. Existing HumanLabel evaluation_period_id is an evidence reference, not permission to mint a label or guess a ledger week. If existing historical rows cannot be proven, keep them ineligible; do not bulk backfill. This dependency is independent of production login and remains actionable design work. No schema or runtime changed in this batch.


## Source-trace correction and structural first slice

Further callsite inspection found `weekly.ts:thesisObservations` already traverses Observation.decision_or_candidate_ref → S4 Decision.card_ref → ChangeCard.thesis_id. This is a useful existing lineage, but its query does not validate hashes/registration, and it is not itself an authorization proof. The weekly `decideCard` ledger card_id refers to a ResearchCard; it must not be assumed equal to the S4 ChangeCard ID. The direct card equality has been removed from the contract. Use a validated explicit relationship before enabling a loader; do not add a redundant new schema before testing whether the immutable chain plus confirmed ledger observation_id suffices. Baseline period comes from the referenced HumanLabel, not a fabricated timestamp join.

Implemented `arm-eligibility.ts` as a pure routing-shape gate only: canonical since date, maximum100 rows, no partial filtering, required IDs, unsupported cited/averaged/null-observation rows rejected, reused observations/decisions rejected, immutable minimal projection without reasons. This does not check ownership, hashes, thesis/week lineage or feed authority, and no runtime caller uses it yet. It is a prerequisite, not a registered report implementation.

Structural audit follow-up: projection names research_card_id explicitly; UUID helper already requires lowercase, now tested. Fields are snapshotted once before validation/projection. The module remains inactive. The eventual report must explicitly settle repeated thesis/week/arm pairing and week-boundary semantics before CLI adoption; the shape gate alone does not decide them.


### Inactive lineage prerequisite (2026-10-06)
The pure checker now traces six immutable S4 records and restricts ledger action compatibility to adopt/reject with matching observation kind. Ledger decision_id is not S4 Decision.id; ResearchCard is not ChangeCard. Neither the structural nor lineage checker authorizes disclosure. DB writer round-trip, ResearchCard provenance, supersession, schema compatibility, repeated-arm semantics and the registered transaction remain required before adoption. Cross-candidate reused ThesisRevision is conservatively unsupported.

### Actual writer validation follow-up
Correction: buildCards creates a fresh candidate-scoped ThesisRevision with previous_revision_id linking history; repeat reveal reuses same-candidate ChangeCards. Earlier host claim of cross-candidate revision reuse was incorrect. The integration suite uses actual legacy S4 writers and synthetic agent input, not registered disclosure or a persisted ledger/ResearchCard bridge. The future routing query must project week_of as canonical date text and pass the structural gate; it must not rely on node-pg date parsing.

### Cohort and current writer compatibility (2026-10-06 04:53)
The inactive gate rejects duplicate thesis/week/arm even with distinct observation/card IDs. This deliberately refuses multi-card weekly cohorts; it does not select one by input order or quality. Pairing multiple evidence/counter cards needs a new explicit protocol before admission.

Current weekly writers cannot produce a full eligible three-arm cohort: freezeBaseline writes neither card nor observation; revealCards writes no observation and may cite multiple judgments; decideCard permits optional observation and citations. Therefore this gate is a prerequisite only, not a usable three-arm report. Structural positive fixtures are hypothetical, not writer evidence. Never backfill or invent those links. Any future routing query must select persisted id AS decision_id, week_of::text, cited_judgment_ids and card/observation IDs directly, without empty-array defaults. Define prospective user-confirmed arm-to-observation capture with temporal/exposure ordering before changing writers or adopting the report. Existing reports remain legacy.

Final prerequisite audit: the returned label identifier is prior_label_id, not a certification of a human baseline. A human_baseline routing row additionally refuses any label lacking actor_kind=human and independent=true. These checks do not establish full arm provenance or replace temporal/exposure validation. The synthetic agent writer fixture is explicitly rejected under human_baseline; no positive human judgment is fabricated.

Routing prerequisite now reads persisted date as text, citations without defaults and101 rows to detect overflow. It rejects observation reuse anywhere in the same owner ledger, including outside since. Internal loader is not an authorization/disclosure API; no runtime caller. Real ledger append/query tests do not establish ResearchCard existence or full arm provenance.

Evaluation prerequisite: verifyArmEvaluationBatch verifies each supplied persisted receipt plus one matching append control, pins the authorized observation hash, rejects duplicate IDs/revisions and over100 rows/controls, and returns highestInBatch only. It cannot prove omitted pairs are absent. The future locked loader must fetch101 evaluation rows and observation-scoped append controls without revision filtering, reject overflow, and only then claim global latest. Do not infer completeness by partitioning observation_state.revision into evaluations and fences alone: anchoring also increments that revision. Real fence-created gaps are accepted; current engine is not re-executed by the verifier.

The internal loadArmEvaluationHistory adapter now performs the complete bounded read for one authorized observation inside a caller-owned owner lock:101 evaluations,101 observation-OR-evaluation-linked append controls, no candidate filter or revision casts. Actual writer tests prove100-row success,overflow refusal,real fence gaps and rollback of orphan/wrong-observation control inserts. No report caller or disclosure authority has been added; aggregate grant/freshness/exposure handling and prospective arm capture remain open.
