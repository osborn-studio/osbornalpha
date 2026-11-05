**Not ready for an implementation plan.** The third draft resolves several contracts, but still permits misleading passes and contains an unsatisfiable release-evidence requirement.

Below, section references refer to the [third-draft spec](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md). Round-2 findings means **N1–N22**; carried-over defects remain in the status table rather than being relabeled as new.

| Round-2 finding | Status | Assessment |
|---|---|---|
| N1 — Outcome reduction | PARTIAL | §3.3 adds the mapping, but never defines increments to `evaluated_optional`; reference summaries still conflict with §12’s whitelist, and extraction scores do not affect the common gate. |
| N2 — Unit errors becoming missing | RESOLVED | §§4.2, 4.6, 5.1.2 require absence-case units, inspect rows before unit filtering, and distinguish `expected_absent`. |
| N3 — Document visibility semantics | RESOLVED | §5.1.1 explicitly evaluates the current interpretation and makes quarantine/generation invisibility incomplete. |
| N4 — CN and metrics adapters | RESOLVED | §§4.2, 5.1.2 specify CN document mapping, typed metric targets, and historical derivation instead of cached metrics. |
| N5 — Replayable provenance | PARTIAL | §§4.6, 5.1.4 require hashes but retain neither the hashed official document nor digest verification; object existence is insufficient, and metric operands receive no recursive artifact/producer verification. |
| N6 — Frozen/live execution | PARTIAL | §5.3 separates files and protects rerecording, but the setup recipe still does not explicitly pin issuer/security state or define a clean initial database state. |
| N7 — Ledger identity | PARTIAL | §5.3.3 matches code pairs and live revisions, but its actual matching rule omits the frozen setup hashes mentioned in the schema comment—and does not bind the complete input bundle. |
| N8 — Independent approval | RESOLVED | §§4.4, 10 define protected independent approval and an explicit owner waiver for process-only approval; activation remains D2. |
| N9 — Reference isolation | PARTIAL | §5.4 adds runtime validation and anon construction, but the canary is always skipped as `unavailable`, so it never exercises comparison-value leakage; reflection is not a denied-write test. |
| N10 — Restricted artifacts | RESOLVED | §§4.5, 6.1 route restricted artifacts before serialization, specify ownership/access, and disable extraction pending D8. |
| N11 — Decimal transport | PARTIAL | §§5.2, 6.2 add text projections, but the transport fixture still assumes **numeric columns** arrive as JSON strings; test numeric fields and generated text fields distinctly through the admin response. |
| N12 — Resume integrity | RESOLVED | §6.3 adds report-digest verification, duplicate-content comparison, checked finalization, and concurrent-resume tests. |
| N13 — Release authentication | PARTIAL | §10 adds recomputation but does not enforce universe/data-revision scope or freshness; its universal eligibility checks also contradict mandatory frozen evidence. |
| N14 — Human/audit closure | PARTIAL | §8 fixes verified coverage and basis follow-ups; §9 still specifies commit-reference presence rather than verifying historical bytes/hash, and §10 does not explicitly reject unresolved blocking audit findings. |
| N15 — Negative acceptance tests | RESOLVED | §§1.1, 13.3 keep gold fixed, mutate actual reads, and require missing mandatory cases to produce exit 3. |
| N16 — Phase dependencies | PARTIAL | §§13.2, 15 separate storage and facts, but §13.3 still requires six-table reference tests—including macro tables—without declaring macro prerequisites. |
| N17 — Dual-source comparability | PARTIAL | §5.5 fixes observation keys, cutoff, and independence class; it still records only source references, not pinned input artifacts, and accepts “resolved” quarantine without verifying the exact observations/publication disposition. |
| N18 — Reference inventory | RESOLVED | §§2, 5.4 correctly identify 36 transcribed numeric cells, exclude ambiguous LPR/assets, and bind explanations to both compared values. |
| N19 — Extraction scoring | PARTIAL | §11.1 adds one-to-one matching, but equal-value repeated occurrences lack deterministic citation-aware assignment; `FP_citation`’s denominator contribution and positive-support/zero-prediction precision remain unspecified. |
| N20 — Calibration eligibility | RESOLVED | §11.3 returns methodology and evidence availability, defines revision eligibility and minimum lead time, and allows probability endpoints. |
| N21 — Gold-diff baseline | PARTIAL | §4.4 adds history fetching, but `HEAD~1` misses earlier commits in a multi-commit push; dispatch on main compares against itself; §13.1 still tests only memory trees. |
| N22 — Dependency revision | RESOLVED | The header and §2 explicitly pin Plan 2 draft 8 at `15b17e6`, including anonymous `fact_state_rev`. |

**New blocking defects introduced by the third draft**

| Severity | Section | Issue | Fix |
|---|---|---|---|
| P1 | §§5.3.1, 7.1, 10; §§13.1, 15 | **Mandatory frozen evidence cannot satisfy the new manifest validator.** Frozen replay runs in `ci`, writes no run row, and is non-waivable; §10 nevertheless requires every report to be `mode='report'` and match `dq_eval_runs.report_sha256`. It also universally requires `evidence_class='truth'`, although §5.4 expressly assigns reference evidence `comparison`. F6-B3 therefore cannot pass as specified. | Define eligibility/authentication **per evidence kind**: authenticate frozen artifacts against the successful CI run, commit, and digest without requiring a production row; accept reference evidence as comparison. Reject CI evidence only where production evidence is required. |
| P1 | §§3.2–3.3, 11.1 | **The new extraction reduction makes successful scoring equivalent to correctness.** Every `scored` document increments `correctness.pass`; P/R remain only in `detail`. An extractor with zero correct predictions can therefore satisfy the common gate and §10’s prescribed recomputation despite §11.1’s 0.95 requirement. | Separate scoring completion from acceptance. Incorporate field-level P/R thresholds into the authoritative gate and manifest recomputation; test a fully scored, zero-TP corpus returning `fail`. |
| P1 | §10 | **The new seven-day live-replay exception accepts evidence from different executable code.** A passing run from yesterday can validate today’s release even when today changes the reader, projection, or derivation; commit age establishes no equivalence. | Require the release commit, or verify an explicit evidence-only change policy proving evaluated executable/configuration content is identical. |

**Verdict:** Not ready for an implementation plan until the listed P1 defects and remaining misleading-pass/evidence-integrity gaps are closed; §16 owner decisions D1–D8 remain pending separately.

Read-only review; no files changed or implementation tests run.