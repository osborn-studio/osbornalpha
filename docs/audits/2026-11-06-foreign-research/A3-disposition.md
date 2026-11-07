# A3 audit disposition (MiniMax `mmx`; commander verification)

| ID | Verdict | Reason |
|---|---|---|
| A3-01, A3-02 | rejected | `field_id` is an opaque id listed in spec §4.11 / plan D amendment 5; base tables stay unreachable (tested) |
| A3-03 | rejected (false positive) | spread currency is derived from `broker_report_targets_public_v`, whose `target_price` is already null when the licence forbids it |
| **A3-04** | **accepted, fixed** | spread view excludes rows with null effective currency; rating-only regression added |
| A3-05, A3-06 | rejected | the 10,001-report case is the SQL-level regression for P-R6-05; pagination is D1's concern |
| A3-07 | no finding (mmx itself) | |
| **A3-08** | **accepted, fixed** | visibility-flip test now includes `broker_spread_latest_v` |
| A3-09 | rejected | inlined CTE per view is the spec rule (views call no functions) |
| test fix | fixed | view writes may fail with 55000 (non-updatable) before 42501; both accepted, write must fail |

DB: full suite 44/45 then the single failing fixture fixed and the spread subset 3/3 green; `test:migrations` PASS.
