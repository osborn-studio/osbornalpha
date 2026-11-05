**Verdict: not ready for implementation planning—the fourth draft closes two round-3 P1s, but the authentication rewrite and extraction matching rule introduce two P2 defects.**

| Round-3 P1 | Status | Where |
|---|---|---|
| Per-evidence-kind authentication | **PARTIAL** | §10 permits frozen `mode='ci'` evidence without a production row and accepts reference `comparison`. Frozen authentication explicitly relies on manual CI digest comparison. However, reference authentication now inherits an incompatible privilege requirement; see R4-1. |
| Extraction gate uses field-level P/R | **CLOSED** | §§3.3, 11.1 make each supported field pass only when both P/R ≥ 0.95; §§11.1, 13.1 require fully parsed, zero-TP input to fail. |
| Remove seven-day live-replay exception | **CLOSED** | §10 requires `evaluator_code_version == release_commit` and explicitly removes the time allowance. |

| # | Severity (P1/P2/P3) | Spec section | Issue | Why it matters | Suggested fix |
|---|---|---|---|---|---|
| R4-1 | P2 | §10 authentication table; §§5.4, 7.1 | Reference authentication says “same as first row,” thereby inheriting `privileged=true`. The third draft limited that requirement to official/live evidence; reference execution still requires an anon reader without service credentials. | A correctly isolated reference run cannot satisfy the revised manifest contract. Accepting `comparison` fixes the class mismatch but leaves reference evidence ineligible. | Explicitly require an anon reference reader and authenticate its persisted report digest separately through the validator’s service-role connection. Do not inherit the producer’s privilege requirement. |
| R4-2 | P2 | §11.1 | The new greedy matching order ranks bbox IoU before page compatibility. Equal-value occurrences on different pages can consume each other’s predictions because coordinates overlap more closely across pages. | Two valid predictions with same-page IoU ≥ 0.5 can become two citation failures when their cross-page IoUs are higher. This incorrectly lowers P/R and can fail the newly authoritative gate. | Match equal-value, same-page, IoU-qualified pairs first, maximizing valid matches with deterministic tie-breaking. Classify remaining pairs afterward. Add a repeated-value, crossed-coordinate, two-page fixture. |

**No new P1 defects found; two new P2 defects found.** Findings are limited to fourth-draft changes, checked against the mandate, Plan 2 at `15b17e6`, and the specified landed code.

External behavior was not verified: frozen CI authentication remains a manual check as specified, and deployed PostgREST serialization remains §17 implementation-time verification. No files modified.