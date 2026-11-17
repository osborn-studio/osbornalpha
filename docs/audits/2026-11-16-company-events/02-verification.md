# Company events stream — production verification (2026-11-16)

Follows `01-diagnosis.md`. Read through the Supabase Management API and the public freshness
route; times are UTC.

## Result

`company.events` is `fresh` with `consecutive_errors` 0 on two consecutive natural cron runs
(15:20 and 16:20). The failed backlog went from 8 streams to 1. The one remaining stream is
Cisco, which is in a 24 h backoff and has not yet been retried on the new code.

## What was changed in production

| time | action | check |
|---|---|---|
| 13:13 | migration `20261124110000_company_digest_retry_selection` (#220) applied with its history row | see `01-diagnosis.md` addendum |
| 14:01 | PR #230 merged (`f2b6d2c2`) | — |
| 14:03 | migration `20261129090000_company_evidence_chunked_replace` rehearsed in `begin … rollback` (`rehearsal_ok`, production unchanged afterwards: 0 functions, 0 history rows), then applied in one transaction with its history row; 0 digest batches running | below |
| 14:04–14:09 | `vercel deploy --prod --yes --env VERCEL_GIT_COMMIT_SHA=633c28eafdd55dda4eede2638dee422bc3e7475d` from a clean detached worktree of `origin/main` | deployment `dpl_8rehLicXZded1ifmPxu8ZVNCh6v4`, ready, target production, aliased to osbornalpha.com |

The deployed commit `633c28ea` is `origin/main` at deploy time. Besides #230 it carries #228
(macro WP-D CN groundwork), #231 (macro P5 WP-B), #229, #227, #226 and #225, all merged by the
owner. Before the deploy, the only migration on `origin/main` missing from production history
was `20261129090000`.

No data repair, backfill or manual digest run was performed. Every run below was the hourly cron.

### Migration 20261129090000 after commit

| function | security / volatility / `search_path` | owner / ACL | execute: service_role / anon / authenticated |
|---|---|---|---|
| `upsert_company_fact_evidence(uuid,text,bigint,bigint,jsonb)` | definer / volatile / `""` | `postgres` / `{postgres=X/postgres,service_role=X/postgres}` | true / false / false |
| `prune_company_fact_evidence(uuid,text,bigint,bigint,uuid[])` | definer / volatile / `""` | same | true / false / false |
| `company_digest_backlog_detail(integer)` | definer / stable / `""` | same | true / false / false |

`replace_company_fact_evidence(uuid,text,bigint,bigint,jsonb)` and `company_digest_backlog()`
are still present and unchanged. History row: `20261129090000 company_evidence_chunked_replace`,
1 statement, sha256 of the stored text `4aa2e1e85b354113b5f5cd52883dc75a7e07355fc73127bb906e70cedfdba948`,
equal to the file on `origin/main`.

## Runs

| run (cron) | code | batch | streams attempted / succeeded / failed | evidence rows written | duration | backlog after | freshness after |
|---|---|---|---|---|---|---|---|
| 12:20 | `bea837db` | partial | 14 / 12 / 2 | 19 441 | 120 s | 4 | error, 51 |
| 13:20 | `bea837db` | partial | 14 / 6 / 8 | — | 222 s | 10 | error, 52 |
| 14:20 | `633c28ea` | success | 3 / 3 / 0 | 8 905 | 54 s | 8 | error, 53 |
| 15:20 | `633c28ea` | success | 8 / 8 / 0 | 16 862 | 95 s | 2 | **fresh, 0** |
| 16:20 | `633c28ea` | success | 7 / 7 / 0 | 18 448 | 98 s | 1 | **fresh, 0** |

- The 13:20 run was the last on the old code: seven `evidence_index_failed` and one
  `digest_issuer_failed` (Xunlei, `6cc46e40…`), all `canceling statement due to statement timeout`.
- The 14:20 run was the first on the new code. It succeeded, and freshness stayed `error`
  correctly: the backlog (8) was above the tolerance (5 for 577 active streams).
- On the new code, 18 streams were attempted in three runs with 0 failures and no batch errors.
  The streams average about 2 450 evidence rows each (44 215 rows / 18), the size range that
  timed out before. Microsoft and Synopsys (14:20), Xunlei and five others (15:20) and Crocs
  (16:20) all recovered from `failed` on their first retry.
- Public route `GET /api/companies/freshness` at 16:23: `company.events` `fresh`,
  `lastOkAt 2026-11-16T16:22:12Z`.

## Before / after

| | before (12:22) | after (16:22) |
|---|---|---|
| status | error | fresh |
| consecutive_errors | 51 (53 at peak, 14:21) | 0 |
| last_ok_at | 2026-11-14 09:20 | 2026-11-16 16:22 |
| streams `failed` / `success` | 4 / 573 (10 / 567 at 13:24) | 1 / 576 |
| stream failures per run | 2 and 8 in the last two old-code runs | 0 in three runs |

## Remaining backlog

| issuer | error | state | why it is still there |
|---|---|---|---|
| Cisco Systems (CSCO), `271ef479-d768-4c06-830a-8fe896842b27`, US | `evidence_index_failed`, statement timeout; last failure 13:20 on the old code | `consecutive_failures` 6, `next_attempt_at` 2026-11-17 13:20:47 | Its sixth failure set the maximum 24 h backoff 43 minutes before the fix was live. It is not selectable until then, so the new code has not attempted it. |

It is listed in `dq_freshness.detail.failedStreams` and `detail.degraded` is `true`. Expectation,
not yet observed: the 2026-11-17 13:20 cron run retries it and it succeeds, as the other streams
of its size did (2 928 evidence rows). If it fails again the batch will be `partial` with its key.

## Not verified

- Cisco on the new code (above).
- The two consecutive fresh runs both had one stream in the backlog. Under the previous rule
  (`backlogFailed === 0`) they would have been recorded as errors; freshness is `fresh` because
  of the new tolerance, by design.
- A run large enough to approach the 240 s deadline on the new code. The largest so far was
  8 streams in 95 s.

## Observations, not acted on

- `documents.edgar`: last attempt 2026-11-07 09:14, 188 documents; document sync flags unset.
- `supabase/migrations.lock.json` ends at `20261120093000`; the four later migrations on main
  (`20261121090000`, `20261123110000`, `20261124110000`, `20261129090000`) are applied in
  production but not locked.
- Evidence rows are rewritten on every digest even when unchanged (about 1 M row rewrites per
  sweep cycle).
