Reviewed **Draft 4** as the authoritative text; the request’s references to Draft 2 are stale.

Round-3 dispositions:

- **T-C1 — closed:** Publisher-margin and F4-margin reconciliation now use their respective arithmetic and tolerances; both existing fixtures must pass.
- **T-C2 — closed:** Contribution IDs must identify the frozen latest observation; duplicate-period versions are rejected.
- **T-C3 — closed:** The constraint lookup now distinguishes the adapter enum CHECK from `macro_evidence_path`.
- **T-C4 — closed:** Historical v1 tests are explicitly isolated from the production registry and current catalog/hash.
- **T-C5 — closed with documented limitation:** Expanded history is labelled separately from snapshot values; batch-eligibility differences are explicitly deferred.
- **T-C6 — closed:** POST retains `seriesHistory`; presets use historical eligibility. The false equivalence claim is removed.
- **T-C7 — closed:** Comparison availability is represented separately as factual metadata without reevaluating predicates.
- **T-C8 — closed:** D1 now includes `awaiting_witness`; the pre-D1 limitation is explicit.
- **T-C9 — closed:** Detail lifecycle is authoritative, with list/detail identity, method and snapshot checks.
- **T-C10 — closed:** The inherited sections and acceptance table are restored; D0a metadata verification is an explicit prerequisite.

Earlier P1 dispositions checked against code:

- **Closed:** R-C1, R-C2, R-C3, R-C4, R-C5, R-C8, R-C13.
- **Closed with documented limitation:** R-C6.

These are design closures, not claims that the proposed implementation exists.

**D1:** Flag-gated reading of stored regime/contributions is permitted by P1’s server-read contract. Display additionally requires the same-snapshot, publishable F4 card and reconciliation. P1 §3.2’s explicit amendment now permits labelled rule shares while categorical `display.percent` remains null; this does not violate the owner’s publication condition.

**Presets:** P1 explicitly amends “预填表单，不预存运行” to permit on-demand computation without stored runs or quota charges. This is a fixed-preset exception, not an arbitrary-analysis bypass. Database/computation costs remain; process-local memoization does not eliminate cold-instance costs.

Only **new defects** follow.

| # | Severity P1/P2/P3 | Section | Defect | Concrete fix |
|---|---|---|---|---|
| N1 | P1 | §3.3–§3.4, §5.2, §8 | **The new method manifest introduces an unchecked second representation of the displayed calculation.** D1 instructs the clock to prefer `method_manifest` for rows, weights, roles, support and contributions. All eight invariants still validate `rec.contributions`, current weights and `rec.regime`; none binds the preferred manifest fields to those validated values. Changing only a manifest contribution or latest-observation ID can therefore leave reconciliation passing while the table or evidence disagrees with the card. The database CHECK validates only that the manifest is an object. | Define mandatory manifest validation: version identity, complete/unique row membership, denominator, observation roles and IDs, and exact correspondence of matched rows to `rec.contributions`. Render exclusively from the validated representation. Add corruption tests that modify only the manifest while leaving the legacy result and F4 claim intact. |
| N2 | P1 | §5.7–§5.8 | **The specified retirement event SQL cannot execute against the baseline schema.** It selects `coalesce(max(seq),0)+1` from `judgment_methodologies`, which has no `seq` column. Sequence numbers live in `judgment_methodology_events`. Simply changing the source table also leaves the ungrouped metadata selections unresolved. This blocks the migration before the proposed deployment sequence can complete. | Supply executable SQL: lock the methodology row, read its metadata, compute the next sequence from its event rows, update status and insert the event atomically with `occurred_at`. Define replay/no-op behavior and test against a registered v1 with multiple existing events. |
| N3 | P2 | §3.2–§3.3 | **The prescribed version gate requires data that has not been read.** The route checks all three versions before fetching observations and `regimeOf`. `SnapshotRecord` contains catalog and methodology versions, but no `rules_version`; that field belongs to `RegimeRecord`. An implementer must either invent a source, skip the rule-version check, or violate the required precedence/read sequence. | Read the regime record before checking its rules version. Specify precedence when the record is absent, and distinguish snapshot-version checks from the record’s rules-version check. Test missing record and wrong rules version independently. |
| N4 | P2 | §5.2, §5.8 | **Rollback publication drops the new frozen method manifest.** The spec updates the publish RPC but omits `republish_macro_snapshot`. Its existing explicit INSERT copies only regime, contributions, rules version and uncovered weight. Republishing a D1 snapshot therefore creates an active snapshot with `method_manifest=null`, silently losing the new frozen row/role contract. | Extend republish to copy `method_manifest` unchanged. Specify whether a post-D1 record without a manifest is rejected or supported through an explicit legacy path. Test publish → supersede → republish and verify manifest equality and clock output. |
| N5 | P2 | §4.2, §5.3 | **Date-only event identity collapses distinct CN policy changes.** §4.2 deduplicates derived events by `effective_date`, justified by the current US event generator. §5.3 adds events per LPR series/tenor; 1Y and 5Y changes on the same date are distinct events with different values and evidence. The specified shared identity rule can discard one. | Define derived-event identity using kind, region, series/tenor and effective date; keep calendar identity separate. Specify which CN events each detail page receives. Test simultaneous 1Y/5Y changes with different magnitudes and preserve both evidence chains. |
| N6 | P2 | §4.4 | **“Inputs changed” fires even when every observation is unchanged.** `freezeInputs` includes `cutoff`, and `inputsHash` hashes the entire frozen object. Presets use `snapshot.created_at`; saving uses the current time. Their hashes therefore differ solely because the cutoff changed, so the proposed comparison cannot establish that underlying data changed. | Preserve the full receipt hash for replay, but compare a separate canonical data identity containing series definitions, observation IDs/values and event inputs. Distinguish “cutoff changed” from “data changed”; test identical observations under different cutoffs and an actual revision. |

not ready