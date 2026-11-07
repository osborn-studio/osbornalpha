| id | P1/P2/P3 | file:line | defect | concrete fix |
|---|---|---|---|---|
| T6-1 | P1 | src/lib/macro/ingest.ts:211 | Quality filtering hides duplicate-period conflicts. Reproduced DGS10 same-date values `4,10`: `10` fails jump validation and `4` becomes publishable; reversed order quarantines both. Violates §4.4’s “neither value writes” contract. | Detect distinct canonical values per `(series, period)` before quality/claim filtering. Quarantine the entire conflicting group, exclude it from the jump baseline, and test both input orders. |

Verdict: fix P1/P2