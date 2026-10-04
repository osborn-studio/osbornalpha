# D1/D2 audit dispositions

Three real Claude CLI calls used `claude-opus-5-5`, restricted to supplied code and synthetic test evidence. Claude did not run tests; host execution supplied verification. Original responses are preserved, including the third response’s mistaken “second review” heading.

- R1: added CI migration rehearsal; hardened cleanup and PostgreSQL version checks; locked 39 historical migrations; enforced discovery of all 12 state-gated suites; expanded seeded upgrade/ACL checks.
- R1 suggestions not adopted: per-test marker protocol (existing SQL suites plus mandatory inventory suffice for this batch); fixed forever schema hash (legitimate future migrations must change schema).
- R2: made table permission revocation non-vacuous with rehearsal-only default grants and a positive control; removed password from pg_dump arguments; retained repeated-signal handlers through cleanup.
- R3: no blocking code findings. Applied its remaining recommendation to retain repeated-signal handlers in the full database runner too. This two-line change was host-tested after review, not reviewed a fourth time. Repeated signal delivery itself has no dedicated automated test.

Local acceptance: 1,557 full-suite assertions passed; 65 critical database assertions across 12 suites passed with zero skips; 39 migrations applied; fresh/seeded upgrade and selected ACL checks passed on PostgreSQL 17.10. Typecheck, lint and build passed. Linux CI remains a separate required observation.

Private execution receipts and full audit streams are retained outside the repository under the knowledge-cycle-alpha-a verification directory. Only code/synthetic summaries were supplied; no production rows or credentials. The isolated CLI reports no tools or MCP servers. Account-level context isolation is not independently guaranteed.

Release hold remains: verify automatic production migration/branching behavior before merge, and production history/roles, backup/recovery and release ownership before deployment. No production SQL was executed.
