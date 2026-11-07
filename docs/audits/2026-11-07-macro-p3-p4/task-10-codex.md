| # | Sev P1/P2/P3 | File:line | Defect | Fix |
|---|---|---|---|---|
| 1 | P3 | `src/lib/macro/strategy/explain-validate.ts:55` | Diagnostics retain only the first match per rule family. For example, `probability confidence recession stagflation` records only `probability` and `stagflation`. Rejection works, but the diagnostic list falls short of spec §6.3’s requirement to retain all failure items. | Collect distinct matched fragments within each family; add a multiple-matches regression test. |
| 2 | P3 | `src/lib/macro/strategy/explain-render.test.ts:32` | The claimed producer/template compatibility test compares renderer IDs against handwritten samples; it never invokes `facts.ts` or `review.ts`. Producer template or slot changes can therefore break rendering while this test passes. | Render facts generated from snapshot and review fixtures in both locales, including restricted status and non-positive asset-base branches. |

pass with P3 notes