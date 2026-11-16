| ID | CLOSED? | note |
|---|---|---|
| R5-P2-1 | CLOSED | `predev` prepares the worker; `extract.ts` builds it when absent. Production preflight detects `worker_missing` before reads or claims, fails the apply batch, and records failed freshness without consuming document attempts. |

No new P1/P2 found in the specified diff. Read-only static review; no builds or tests executed.

VERDICT: ready