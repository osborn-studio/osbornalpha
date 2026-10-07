# Inactive ledger timestamp-filtered view

Existing replayJudgments is a retrospective source-availability view: a judgment generated later against an earlier source is still returned for an earlier source cutoff. No production/HTTP/report callers were found. Preserve that API and its existing deterministic output semantics; it must not be mistaken for historical user knowledge.

New replayTimestampFilteredJudgments shares the query but requires source available_at AND judgment created_at at or before cutoff. Exact UTC6-digit microsecond text is returned for timestamps in this new view, allowing inclusive cutoff roundtrip without pg Date truncation. Legacy output remains millisecond formatting. No route/CLI/report adoption, activation, schema migration or stored history rewrite.

created_at remains an application-supplied pre-commit wall-clock stamp. INSERT-capable principals can backdate it, clocks can step and rows can commit after cutoff. This view only filters stored timestamps; it proves neither actual historical visibility/exposure, valid origin, source-version integrity, registered authority nor authentic human judgment. Full point-in-time/report admission still needs trusted timestamp/origin and permission design; bounded aggregation remains separate.

Finite osstack task_c80aedbb initially passed; strict source/synthetic claude-opus-5-5 review handled3 findings: explicit semantics/name without imposing a legacy timestamp migration, independent future-source AND witness, and exact microseconds/tie/roundtrip. Finaltask_4e849e35 passes2076 tests,14 critical suites/114 critical tests/0 skips,42 migrations, ownedPG17.10 stopped,typecheck/lint/diff0 issues. Genuine synthetic rule writer covers inclusive cutoff/later judgment on earlier source; privileged synthetic time/ID rows prove filtering only, not valid origins/content-addresses. Future-availability source proves the conjunction. Final refinements host verified, not second-reviewed.

Evidence /Users/osborn/.osborn/verification/knowledge-cycle-alpha-i1/opus-recorded-ledger-20261006-2354/{disposition.md,final-db-summary.json,final-loop-task.json,receipt.json}. Published5e86401 Linux CI37546678685 passed including patched native image/high-audit gates; this local follow-up is outside that run and held for later aggregate push. No production/private-data/provider/notification changes or manufactured human labels.


## Bounded result prerequisite — 2026-10-07

New inactive timestamp-filtered view now requests101 rows in deterministic total order and rejects input_limit when more than100 match, without returning a partial prefix. Legacy source-only view passes LIMIT NULL and remains uncapped. This bounds returned rows only; SQL scan/sort cost, distribution byte size, source registration and genuine historical visibility remain separate gates.

Finite initialtask_6177c843 and finaltask_5c240404 passed. Final2077 tests/115 critical/14 critical suites/0 skips/42 migrations,ownedPG17.10 stopped,typecheck/lint/diff0 issues. Actual synthetic rule writers prove100 eligible,101 refusal, future source excluded before counting and earlier cutoff still100 after later insertion. A pg Client query spy observes actual SQL execution, verifying LIMIT $5 and101/101/null values; no DB fake response. Strict source/synthetic Opus5.5 identified2 test gaps, both accepted; final refinements host verified not second-reviewed. No new callers/schema/private-data/provider/production/notifications/activation. Held for later aggregate push, outside published5e Linux success.

Evidence /Users/osborn/.osborn/verification/knowledge-cycle-alpha-i1/opus-bounded-ledger-20261007-0024/{disposition.md,final-db-summary.json,final-loop-task.json,receipt.json}.
