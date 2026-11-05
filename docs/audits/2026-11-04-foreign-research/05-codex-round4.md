FR3-01 — RESOLVED: generation, approval, invalidation and publication compare against `summary_input_digest`.
FR3-02 — RESOLVED: target/field/occurrence identities preserve competing values for explicit review.
FR3-03 — RESOLVED: `event_id` deduplication and `claim_seq` ordering handle retract-before-register delivery.

| ID | Severity | Section | Finding | Concrete, prescriptive fix |
|---|---|---|---|---|
| FR4-01 | P2 | §6.1 | New `promotion_lost` recovery instructs re-upload but retains a withdrawn document with the unique SHA. Both intent creation and commit reject that re-upload as a duplicate. | “For `promotion_lost` documents, permit a replacement upload intent bound to the existing `document_id`; resume promotion into that document instead of inserting another SHA row. Keep it withdrawn and inaccessible until successful validation and promotion.” |
| FR4-02 | P2 | §§4.4, 4.11 | Disclosure recheck requires **all** surfaces to pass, including a restricted original title that publication explicitly permits behind `title_public`. After disclosure invalidation, that legitimate rewritten-title report cannot recover through recheck. | “Disclosure recheck uses the publication title policy: failure of `title_original` is permitted when a passing `title_public` replaces it and title citations are suppressed. Check approved snippets and summaries, not unpublished drafts. If recovery requires changing `title_restricted`, require unpublish and republish.” |
| FR4-03 | P2 | §6.4 | Requiring **every number** to match a field assertion rejects valid numeric security identifiers: `9988.HK 的目标价 100 HKD` contains identifier digits as well as the asserted value. Multi-target summaries require those identifiers. | “Tokenize recognized target identifiers before scanning numeric assertions. Identifier digits establish target identity and are excluded from numeric-value checks. Require exactly one field assertion per numeric sentence; every remaining numeric token must belong to that assertion’s value or unit, otherwise reject the sentence.” |

Unsure: live Storage promotion semantics and F3/F4 execution behavior were not verified.

Verdict: READY WITH P2 FIXES for implementation planning.