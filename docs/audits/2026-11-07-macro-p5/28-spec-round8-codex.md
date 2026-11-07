Reviewed **DRAFT 8**; “draft-2” is a stale reference. Closures concern the specified fixes against current code contracts, not completed implementation or passing tests.

- **N11 — closed.** Invariant 9 now partitions scoring and display-only rows. Scoring rows equal `keys(regionWeights)`; display rows have zero weight and null scoring fields. §8 requires a successful three-liquidity-row fixture plus duplicate/misclassification rejection.
- **N9 / N10 — closed.** The RPC signature places required parameters before defaults; unit changes explicitly cover `strategy-view-model.ts::unitSuffix`, `nodeDisplay`, and `flowRows`.
- **Earlier publication/reconciliation P1s — closed.** Same-snapshot F4 eligibility, number-free failures, contribution/support checks, null-regime handling, and manifest validation have adequate specified fixes.
- **Earlier integration/migration P1s — closed.** Method pins and production constants, mixed-adapter ingestion, republish copying, retirement-event fields, and schema-before-code rollout address the cited code contracts.

**D1:** Flag-gated snapshot reads are permitted by the existing server-read contract. Clock display additionally requires a publishable, eligible, same-snapshot F4 card and successful reconciliation. Revised P1 §3.2 expressly permits labelled rule shares while categorical `display.percent` stays null. This violates neither that rule nor “只有满足既有发布条件才展示”.

**Presets:** The explicit P1 amendment permits fixed-preset computation without stored runs or quota charges. Arbitrary saved analyses retain `create_macro_analysis_run` quota enforcement. Database/CPU costs and per-instance cold starts remain documented limitations.

| # | Severity P1/P2/P3 | Section | Defect | Concrete fix |
|---|---|---|---|---|
| — | — | Draft 8 | No new P1 defects or additional actionable P2/P3 findings. | — |

ready for an implementation plan