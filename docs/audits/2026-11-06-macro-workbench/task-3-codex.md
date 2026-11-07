| id | P1/P2/P3 | file:line | defect | concrete fix |
|---|---|---|---|---|
| T3-1 | P2 | src/lib/macro/db.ts:268 | Multi-RPC writes discard committed counts and conflict IDs when a later RPC fails. Earlier quarantined rows can remain unlinked; callers count committed rows as failures. Memory’s atomic implementation masks this. | Make each `writeObservations` invocation one atomic RPC; leave chunking and receipt processing to the ingest layer. Test failure after a chunk boundary. |
| T3-2 | P2 | src/lib/macro/db.ts:307,325 | `versionsOf` and `quarantineMembers` silently truncate at PostgREST’s 1,000-row limit despite promising complete results. Resolution can reject members the operator never saw. The member lookup also puts up to 1,000 UUIDs into one URL. | Page both reads with stable ordering; fetch member observations in `IN_CHUNK` batches. Test more than 1,000 versions/members. |

Verdict: fix P1/P2