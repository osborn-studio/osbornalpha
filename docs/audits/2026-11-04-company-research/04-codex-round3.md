**Not ready yet.** Read-only review; no files changed or tests run. “Resolved” means resolved in the design. Section references below are to draft 3 unless another document is named.

**Round-2 findings (#31–#52)**

| Finding | Disposition | Assessment |
|---|---|---|
| 31 | RESOLVED | §§4.6, 10.1(5): locking the upstream scope before revision validation closes the publication TOCTOU race; the replacement lock introduces a separate regression below. |
| 32 | PARTIAL | §§4.4, 4.7, 6.3: bootstrap, sweep advancement and ordering are defined; selecting an 80/20 quota does not reserve execution time before the deadline. |
| 33 | RESOLVED | §§4.6, 6.3: per-invocation rebuild IDs and stream deduplication fix same-batch retirement. |
| 34 | PARTIAL | §§4.1, 4.6: economic hashes and persistent change timestamps improve; ordering of same-revision metadata refreshes remains undefined. |
| 35 | RESOLVED | §§4.3, 6.2: explicit event-ID acknowledgements avoid marking omitted or subsequently committed events read. |
| 36 | RESOLVED | §§4.3, 6.2: existing watches are exempted before the capacity check. |
| 37 | RESOLVED | §5.3: quarterly derivation uses complete history; CN mapping and BS rejection are explicit. |
| 38 | PARTIAL | §§5.10, 6.1: CF and the overview DTO are corrected, but overview supplies `history:false` to a canonical derivation contract requiring `history:true` (plan 2 §8). |
| 39 | RESOLVED | §§4.1, 5.3, 7.2: deterministic unit selection and complete period keys replace arbitrary selection. |
| 40 | PARTIAL | §§5.6, 6.1, 10.1(2): metadata and code-version gating improve, but a pointer into an inaccessible snapshot is not reader-replayable evidence; pending CN citations may provide no alternative source. Evidence is also fetched “on demand,” without defining a pre-display gate for every numeric surface. |
| 41 | PARTIAL | §10.1: written acceptance, provenance joins and complete filings are requested; `computedAt` remains uncontracted, and a complete paginated filing list plus a revision label does not specify how coherence is established. |
| 42 | RESOLVED | §§1.2, 5.8, 15 G/J: defaults remove unsupported market numbers and scheduled dates; retaining market numbers requires an explicit mandate exception. |
| 43 | RESOLVED | §§5.4, 9.1: missing bridge inputs now prevent valuation unless supplied by the user. |
| 44 | RESOLVED | §9.1: unknown/ADR and unresolved multiple-security cases fail closed under an explicit eligibility rule; actual share-basis applicability still requires external verification. |
| 45 | RESOLVED | §9.1: one fact envelope and leaf provenance address revision mixing and coarse attribution; the new array merge introduces a separate defect below. |
| 46 | RESOLVED | §10.4: authoritative F4 display output replaces card-supplied calibration thresholds; F4 §§8–9 define the trusted gate. The obsolete local predicate should be clearly non-normative. |
| 47 | PARTIAL | §§7.3, 10.4: inbox integration is explicitly deferred, but the newly specified F4 replay request does not match F4’s actual contract; see below. |
| 48 | PARTIAL | §4.6: nested reference/value validation improves, but `status='ok'` does not establish current mapping generation or cutoff eligibility; `meta` also lacks an equivalent nested allowlist. |
| 49 | PARTIAL | §§4.6, 6.3: stale failures after successful newer revisions are suppressed and backlog affects freshness; the new revision-only guard loses legitimate sweep failures. |
| 50 | RESOLVED | §§4.5, 15 C: retention is the default; optional deletion locks before checking and requires deployment evidence. |
| 51 | PARTIAL | §§12–14: independent expectations and automated browser evidence are required; explicit between-write rollback injection and delayed-commit acknowledgement tests remain absent from the detailed DB suite, despite disposition claims. |
| 52 | PARTIAL | §§6.3, 10.1(6): deadline telemetry fallback is compatible with landed code; accounting mixes attempted streams with event outcomes and classifies unchanged upserts as inserts. A successful zero-event replacement can become `unaccounted` in `src/lib/dq/batches.ts`. |

**New blocking defects introduced by draft 3**

These are regressions in the new remedies, rather than restatements of unresolved round-2 findings.

| Severity | Section | Issue | Fix |
|---|---|---|---|
| P1 — #53 | §§4.6, 6.3, 12.2 | **The replacement shared lock does not serialize digest writers.** Removing the advisory lock and taking only `FOR SHARE` allows two replacements into the mutation phase together. If their output sets differ—for example across event-rule versions—each can insert its own events and retire before seeing the other’s uncommitted inserts; coverage then serializes too late, leaving a union of event sets inconsistent with the winning coverage row. The promised “two digest sessions serialize” test is not supported by this lock. | Take `FOR UPDATE` on the scope row before revision validation, or add a common exclusive digest lock before any event writes with a fixed lock order. Test concurrent differing replacement sets. |
| P1 — #54 | §§4.6–4.7, 6.3 | **A failed sweep at the current revision cannot be recorded.** After revision R succeeds, a citation-refresh or rule-rebuild attempt at R fails; `digested_rev < p_attempt_rev` is false, so failure status and backoff remain unchanged. If the next run hits its deadline before retrying that stream, `failed=0` and `backlogFailed=0` permit `ok=true`, despite the unresolved failure. | Track attempt identity and refresh/rebuild generation separately from fact revision. Suppress obsolete attempts only when a corresponding newer attempt succeeded; preserve same-revision sweep failures and backoff until recovery. |
| P1 — #55 | §9.1 | **Leaf merging can add model revenue to the company-total fact seed.** Only `revenueLines[0].baseRevenue` is seeded and gated. With a two-line LLM response, index-wise leaf merging can retain the second model line while replacing the first with total company revenue. The landed engine sums every line (`src/lib/dcf/engine.ts`, `buildYearly`), so the gate passes while the revenue base is inflated. | Require exactly one total-revenue line initially, or define an explicit allocation contract whose line bases reconcile to the factual total. Gate every base-revenue leaf used by the engine; test a multi-line LLM response. |
| P1 — #56 | §§5.10, 10.4 | **The new F4 replay call requests the wrong semantics.** Company draft 3 specifies `as_of`; F4 §10 specifies `view=as_known&asOf=` and defaults to `view=latest`. The written request therefore cannot establish historical replay: it can be rejected or return current cards with later settlements/calibration. | Use `subject_type=issuer&subject_key=…&view=as_known&asOf=…`; assert the returned view/cutoff and fail closed on mismatch. Add a contract test containing post-cutoff settlement and calibration records. |

For #53, PostgreSQL explicitly permits concurrent `FOR SHARE` holders; it blocks upstream updates but not another shared-lock digest. [PostgreSQL locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html)

External-semantics uncertainty: Tushare redistribution rights, public access to exact source observations, real issuer share-class completeness, and correspondence between cover-date shares and the selected security remain unverified. I do not treat those permissions or financial meanings as established. F4 and plan-2 behavior here are specification contracts, not verified implementations.

**Verdict: not ready for an implementation plan—blocking items are #53–#56 and the remaining replay-evidence/publication-gate gap in #40; owner decisions remain pending separately.**