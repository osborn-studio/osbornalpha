| # | Sev P1/P2/P3 | File:line | Defect | Fix |
|---|---|---|---|---|
| 1 | P3 | src/lib/macro/strategy/testing/fixture.ts:142 | Default snapshot counts differ from landed P1 semantics: an empty US snapshot reports **17 verified, 1 missing, 5 restricted**. P1 `snapshots.ts:57` counts weighted indicators and requires eligible observations for “verified.” These defaults can mask incorrect coverage numbers in later tests. | Require explicit counts or derive them using P1’s indicator scope and observation eligibility; cover empty and partial coverage. |
| 2 | P3 | src/lib/macro/strategy/port.ts:67 | The timeliness mock accepts impossible dates that landed `releaseTimeliness` rejects. For example, period `2026-02-31` returns `current`; the monthly branch never validates its input date. Existing tests miss this divergence. | Match P1’s strict date validation, including round-trip validation before monthly/quarterly arithmetic; add invalid-date parity cases. |

pass with P3 notes