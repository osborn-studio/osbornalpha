| id | P1/P2/P3 | file:line | defect | concrete fix |
|---|---|---|---|---|
| T5-1 | P2 | src/lib/macro/derive.ts:49 | `month_end` requires a later-month observation but omits it from provenance. Verified: September + October inputs emit September; replaying its recorded `derived_from` emits `[]`. `available_at` also predates the required October evidence, violating replayability and §0.2 M6. | Include the later-month completion witness in `derived_from`; set `available_at` to the maximum input timestamp. Add a regression replaying only recorded inputs and checking availability. |

Verdict: fix P1/P2