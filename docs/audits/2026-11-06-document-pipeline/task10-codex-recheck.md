Read-only review of `78c63d88`. Opus IDs below are descriptive. Full build/database suites were not run; an in-memory probe confirmed the response-body timeout gap.

| ID | CLOSED? | note |
|---|---|---|
| Review: selection failure cleanup | CLOSED | Rejected `storedDue`/`documentById` calls now trigger batch cleanup and failed freshness recording. |
| Review: stale CLI worker / T10-01 | CLOSED | CLI always rebuilds before extraction. |
| T10-02: external-call deadlines | NOT CLOSED | Admin client bypasses transport deadlines; response-body stalls bypass `deadlineFetch`. N2–N3. |
| T10-03: dry-run integrity | CLOSED | Shared hash check rejects corrupt bytes before extraction. |
| T10-04: fixture redirects | CLOSED | Each destination is checked before requesting; redirects are bounded. |
| T10-05: fixture overwrite | CLOSED | Validation precedes temporary-file write and atomic rename. |
| Opus: worker manifest/preflight | NOT CLOSED | Version checks work, but deployment tracing omits the required manifest. N1. |
| Opus: terminal hash mismatch | NOT CLOSED | Reclaim sequence works normally, but quarantine can exhaust terminalization’s budget. N4. |
| Opus: shared flags | CLOSED | Sync, extract and reprocess consistently accept exactly `'1'` and `'true'`. |
| Opus: worker resourceLimits | CLOSED | Worker old-generation heap limit configured. |
| Opus: finite hardMs | CLOSED | Nonfinite values rejected; oversized timer values clamped. |
| Opus: OOM mapping | CLOSED | Worker OOM becomes an extraction error. |
| Opus: idle | CLOSED | Only empty scheduled selection reports idle. |
| Opus: test hygiene | CLOSED | Reviewed assertions and timer/environment restoration changes address the supplied items. |
| Opus: reprocess setup 503 | CLOSED | Both `worker_missing` and `worker_stale` map to 503. |
| Opus: extractHtml budget | CLOSED | Worker passes the soft budget into HTML extraction. |

| ID | Sev | file:line | defect | fix |
|---|---|---|---|---|
| N1 | P2 | `next.config.mjs:4` | Deployment asset list includes the worker but omits its newly mandatory `.manifest.json`. A deployment containing the declared assets fails preflight with `worker_stale`, disabling extraction. The isolated-worker test bypasses deployment preflight. | Explicitly trace the manifest alongside the bundle; test preflight against packaged route assets. |
| N2 | P2 | `src/lib/documents/extract/deps.ts:40` | Supplying `admin` disables bounded clients. Reprocess supplies an ordinary admin client, while selection, quarantine and batch/freshness calls lack runner-level bounds. A stalled request can exceed `maxDuration=300`. | Apply deadline-aware transport even with an injected admin client; bound complete selection and finalization operations. |
| N3 | P2 | `src/lib/documents/deps.ts:47` | `deadlineFetch` clears its timer when fetch returns headers, before Supabase consumes the body. A stalled body can hang unwrapped selection/finalization calls indefinitely. Probe: body remained pending after the deadline and signal remained un-aborted. | Keep cancellation active through body consumption, and bound complete SDK operations through finalization. |
| N4 | P2 | `src/lib/documents/extract/run.ts:148` | Quarantine uses the grace-enabled table client **before** terminalization. A hash mismatch near the work deadline followed by a slow quarantine can exhaust the claim budget. The row remains `stored` with its lease/attempts, becoming retryable after expiry despite the promised terminal outcome. | Add an atomic holder-checked terminal-failure operation; reserve its budget independently of quarantine, preferably recording both atomically. |

The reclaim loop itself matches SQL semantics: attempt 1 → 2 → 3 → terminal `false`, clearing both lease fields. Row locking and ownership checks prevent interference with another batch’s live lease. However, `false` also means ownership/status rejection, so it does not prove terminalization.

Production’s version-only check accepts different sources with identical version strings. That is acceptable only under the enforced fresh-build packaging invariant; it is not source-provenance verification. Compare against an independently embedded build fingerprint if preflight must detect mixed artifacts.

The intended cron ceiling is **240 + 30 = 270 seconds**, within 300 seconds. N2–N3 prevent that from being an actual end-to-end guarantee.

VERDICT: fail (0 P1, 4 P2)