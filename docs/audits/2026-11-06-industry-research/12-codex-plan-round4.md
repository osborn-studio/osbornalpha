Read-only audit completed; no files changed or tests executed. References are to [the plan](docs/superpowers/plans/2026-11-06-industry-research.md).

| Priority | Finding | Status | Evidence and fix |
|---|---|---|---|
| P1 | R3-1 — empty corrected windows fail open | **RESOLVED** | Reconciliation routes empty open or closed windows to correction (**7852–7857**). SQL atomically quarantines existing rows without inserting invalid successors (**3164–3169**); memory matches (**5151–5153**). Tests cover delisting before and exactly on the start, aggregation exclusion, and third-run idempotency (**7653–7677**); shared contract checks all three rows become quarantined (**4112–4117**). No further fix required. |
| P2 | R3-2 — lease expiry after lock wait | **RESOLVED** | SQL locks the scope row, then separately checks ownership and `clock_timestamp()` before provenance or membership writes (**3208–3221**). Two-connection regression holds the issuer lock across expiry and asserts `lease_lost`, zero memberships, and unchanged provenance (**2591–2607**). No further fix required. |
| P3 | R4-1 — contradictory lease documentation | **OPEN** | Interface convention **397** still states `lease_until > now()` immediately before explaining the corrected wall-clock check. Replace that predicate with `lease_until > clock_timestamp()` to match **3214**. Nonblocking documentation cleanup. |

No newly introduced functional defects or remaining P1 blockers identified within the requested scope.

**ready for execution**