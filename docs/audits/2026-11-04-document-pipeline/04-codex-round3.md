Read-only review; no files changed or tests run. Section references below are to the third-draft document-pipeline spec unless prefixed **Plan 2**. “RESOLVED” means resolved in the proposed contract, not verified in implementation.

**Round-2 findings**

| Finding | Status | Assessment |
|---|---|---|
| N1 | PARTIAL | §§4.8, 4.12, 7.7 fix cross-request citation visibility, but evidence validation remains outside publication and iterates publication associations rather than all facts being published; move completeness enforcement into the publication transaction. |
| N2 | RESOLVED | §4.9 cascades evidence-link deletion when abandoned facts are deleted. |
| N3 | RESOLVED | §16(c) specifies input-key → fact-ID/outcome mappings, duplicate handling, chunking and implementation updates; this remains an explicit prerequisite amendment to Plan 2. |
| N4 | RESOLVED | §§4.1, 4.12 specify an invoker-security, public-only view and direct-role tests. |
| N5 | PARTIAL | §§4.6–4.8 remove automatic inheritance and strengthen human inheritance, but automatic approval compares `table_algo_version` against `input_snapshot`, whose declared shape omits it; persist it or explicitly join the extraction row. |
| N6 | PARTIAL | §7.7 establishes publication generations and active candidates, but §12 acceptance example 9 promises old-generation `asOf` visibility that Plan 2 §4.6 explicitly excludes through its current `filings.mapping_gen` join; align the acceptance contract or add generation-history reads. |
| N7 | PARTIAL | §§4.6, 4.8, 7.7 support new generations, but a second confirmation in the **same** generation restages every active candidate and rejects previously published associations; retrying an abandoned association also collides with its retained primary key unless an update/upsert transition is defined. |
| N8 | PARTIAL | §§4.8, 7.3 fix retry selection/counting, but selectors exclude attempts ≥3 before the claim function can mark exhaustion; third-attempt crashes remain indefinitely `pending`/`failed`. |
| N9 | PARTIAL | Same-version reprocessing is explicitly rejected, but §§4.8, 7.3 similarly exclude third-attempt extraction crashes before their promised `extract_failed` transition. |
| N10 | PARTIAL | §4.8 resolves lease ownership and adds missing administrative functions, but §7.3 writes candidate checks **after insertion**, while §§4, 4.8, 4.11 revoke direct updates and provide no checks-write RPC. |
| N11 | RESOLVED | §§6.1–6.2 add item-level progress and bounded failure handling; source-list completeness remains externally unverified. |
| N12 | RESOLVED | §§1.2, 6.1, 14 explicitly narrow replacement detection and defer periodic revalidation. |
| N13 | PARTIAL | §§4.6, 4.8 bind documents, extractions and filings, but the binding/completeness assertion is still separate from publication; its authoritative transaction boundary remains unresolved with N1. |
| N14 | RESOLVED | §§4.4, 7.2 consistently specify Unicode code-point offsets and fixtures. |
| N15 | RESOLVED | §§7.5–7.6 define decimal normalization, explicit numerical-check conversion and longest-token scale parsing. |
| N16 | RESOLVED | §§7.2–7.3 preserve header blocks and schedule English comparison candidates with explicit regeneration eligibility. |
| N17 | RESOLVED | §§4.6, 7.5–7.6 retain and check both statement-title and selected-column period evidence. |
| N18 | RESOLVED | §§4.8, 5.3, 9 apply the availability cutoff before version selection. |
| N19 | PARTIAL | §4.11 paginates the principal reads, but bounding `publicationsOf` to 100 **candidate IDs** does not bound returned publication rows across generations; `approvalsFor` also assumes rather than enforces a small result set. |
| N20 | PARTIAL | §7.3 adds scheduled promotion, but `promotionDue` excludes candidates with staged associations—the exact state requiring crash recovery in §7.7—and excludes already-promoted candidates needing a new publication generation. |
| N21 | RESOLVED | §7.7 explicitly requires Plan 2’s complete duplicate/conflict planner. |
| N22 | RESOLVED | §§1.1, 10 adopt the landed batch-status calculation and distinguish operational writes from content writes. |
| N23 | RESOLVED | §§6.3, 14 correct entry counts, scheduling and timezone wording, with deployment-plan confirmation pending. |
| N24 | RESOLVED | §§4.1–4.2, 4.10 replace the conflicting metadata sidecar with document/asset acquisition records. |

**New blocking defects introduced by draft 3**

The remaining defects above retain their round-2 IDs; they are not counted again here.

| Severity | Section | Issue | Fix |
|---|---|---|---|
| P1 — R3-1 | §§4.8, 7.7 steps 4–5 | **Bulk finalization falsely marks quarantined candidates as published.** `finish_candidate_publications(p_run)` changes *all* staged associations to published and their candidates to promoted. Step 4 calls it after `publishRun`, which can leave facts quarantined; step 5 simultaneously requires those associations to remain staged. A mixed successful/quarantined run therefore produces a misleading publication success state under the specified function contract. | Finalize only associations whose referenced facts are `ok` in a published run; retain quarantined associations as staged. Apply that predicate per association during normal completion and recovery, and test a mixed-status run. |

External semantics remain unverified: EDGAR historical/index shapes, HKEX limits and list stability, bilingual pairing and replacement behavior, cninfo pagination/category guarantees, PDF runtime capacity, and deployed Storage/PostgREST/Vercel behavior; §15 appropriately identifies verification work, but repository fixtures do not establish those guarantees.

**Verdict:** Not ready for an implementation plan: blocking items are publication-time evidence enforcement (N1/N13), the incomplete approval-version contract (N5), the incompatible historical-replay promise (N6), publication reuse/retry transitions (N7), the missing checks-write API (N10), and false publication finalization (R3-1).