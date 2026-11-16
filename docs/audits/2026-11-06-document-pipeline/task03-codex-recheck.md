Reviewed `6a39e112` read-only; executed commit-source reproductions in memory. No PostgreSQL/PostgREST integration suite was run.

| ID | CLOSED? | note |
|---|---|---|
| F1 | CLOSED | Pre-epoch microseconds use floor division and nonnegative remainder. |
| F2 | CLOSED | Original invalid-date/long-fraction fallback removed. Boundary coverage remains incomplete; see N3. |
| F3 | CLOSED | All three approval writers validate and canonicalize decimals; 513-character precision rejected. |
| F4 | CLOSED | Years below 1000 rejected; no `Date.UTC` century remapping. Reader regression: N1. |
| F5 | CLOSED | pg `extractionsOf` now shares `timestampUuidCursor`; one-element cursor rejected. |
| Opus: pre-1970 floor | CLOSED | Negative microsecond round-trip verified. |
| Opus: half-even rounding | CLOSED | Even/odd ties verified; carry across day/month/year works. |
| Opus: zone-less/leap-second/date-only rejection | CLOSED | Parser rejects all three. |
| Opus: years 1000–9999 | CLOSED | Input and normalized UTC output bounded; carry into 10000 rejected. |
| Opus: `ts()` bad_timestamp | CLOSED | Invalid strings produce `DocumentsDbError('unknown','bad_timestamp')`. |
| Opus: cursor validation | CLOSED | Requested pg validator reuse implemented. |
| Opus: timestamp-only comparison | CLOSED | `cmpTs` limited to timestamp fields; identifiers/filenames retain ordinary comparison. |

| ID | Sev | file:line | defect | fix |
|---|---|---|---|---|
| N1 | P2 | `src/lib/documents/db.ts:125` | Reader now applies writer year restrictions. Persisted `0999-03-20 00:00:00+00` throws `bad_timestamp`, breaking reads containing that row, while the equivalent `Date` still succeeds. Schema has no matching year constraint. | Separate reader normalization from writer restrictions; preserve supported historical rows or explicitly migrate/constrain existing data. |
| N2 | P2 | `src/lib/documents/memory-documents-db.ts:188` | `releaseSyncLease` clears lease ownership and records success **before** validating `nextDue`. Reproduced invalid February 31 rejection with lease cleared and `last_status='success'`; SQL adapters reject before mutation. | Validate and normalize `nextDue` before changing any state. |
| N3 | P2 | `src/lib/documents/memory-documents-db.ts:189` | Timestamp validation is not universal: empty `nextDue` defaults to now; duplicate document/upload paths return before validating timestamps (lines 205/223). SQL adapters reject these same inputs through `tsArg`/`docArg`. | Normalize required timestamps unconditionally at entry, before duplicate returns; remove the empty-value fallback. |

Adversarial checks: `+08` and `-03:30` decode correctly. `.9999995` carries correctly across midnight, month-end, and year-end. `infinity` produces `bad_timestamp`; it already failed through the previous fallback, so this is not a new regression. PostgreSQL supports historical years and emits infinity unchanged. [PostgreSQL datetime documentation](https://www.postgresql.org/docs/current/datatype-datetime.html)

Both SQL implementations cover explicit timestamp writer arguments; memory has N2/N3 exceptions. Async conversions correctly return rejected promises without issuing SQL calls; no additional async side effect found.

VERDICT: fail (0 P1, 3 P2)