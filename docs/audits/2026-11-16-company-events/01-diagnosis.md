# Company events stream — production diagnosis (2026-11-16)

Read-only. All SQL ran through the Supabase Management API against project `stock-monitor`
at 2026-11-16 13:07–13:25 UTC. Nothing was written to production for this document.

## Verdict

`company.events` is in `error` because of one cause and one amplifier.

1. **Cause — the evidence replace exceeds the 8 s statement timeout.**
   `replace_company_fact_evidence` validates and rewrites a stream's whole evidence index in one
   statement. Through the API the statement runs under the `authenticator` role setting
   `statement_timeout=8s` (`service_role` has no setting of its own). For a large stream the
   validation alone takes 4.8–8.0 s on a cold cache.
2. **Amplifier — the freshness rule.** A run records `ok` only when `failed = 0` **and** the
   global failed backlog is 0 (`src/lib/company/digest.ts:204`). One stream in backoff therefore
   marks every run as an error, including runs where every attempted stream succeeded.

The missing retry selector (#220) is real but secondary: it is not in production, and it is not
what keeps the stream in error today.

Nothing new was found: every failure since 2026-11-14 has the same code and the same message.

## Evidence

### Freshness row

| dataset | status | consecutive_errors | last_ok_at | last_attempt_at |
|---|---|---|---|---|
| `company.events` | error | 51 | 2026-11-14 09:20:34 | 2026-11-16 12:22:33 |

Last `detail`: attempted 14, succeeded 12, failed 2, backlogFailed 4, swept 1, evidence 19 441
facts indexed. For reference, `documents.edgar` is `fresh` by its stored row but its last
attempt is 2026-11-07 09:14 (document sync flags unset; report only).

### What failed since 2026-11-14 09:30 UTC

- 51 cron batches (`ingest_batches`, producer `company-digest`, code version `bea837db`):
  31 with stream failures, 20 `success`.
- 56 stream failures across 37 distinct issuers, all market US. Every one is
  `evidence_index_failed` with message `canceling statement due to statement timeout`.
  One `deadline_hit` (11-14 10:20, 16 streams not started). No other code.
- Not every run fails, and no fixed set of rows blocks freshness. 33 of the 37 issuers
  succeeded on a later attempt. The failures follow stream size and cache state:
  failing streams hold 1 690–3 399 evidence rows; the per-stream distribution is
  min 248, p50 2 057, p90 2 839, max 3 399 (577 streams, 1 050 818 rows, 822 MB).
- All 20 `success` batches still recorded a freshness error, because the backlog was above 0 at
  the time. Example: 11-16 06:20 through 10:20, five consecutive `success` batches, while CSCO
  sat in backoff.

### Current failed backlog (4 of 577 streams; 573 are `success`)

| issuer | ticker | consecutive failures | evidence rows | next attempt (UTC) |
|---|---|---|---|---|
| `271ef479-d768-4c06-830a-8fe896842b27` Cisco Systems | CSCO | 5 | 2 928 | 11-16 12:21 |
| `67a15c08-1e4e-4592-ad94-438c3431b3b1` Crocs | CROX | 1 | 2 972 | 11-16 12:21 |
| `2fb7eb4d-430a-42b4-8272-45b4e527d1ab` Microsoft | MSFT | 1 | 3 033 | 11-16 13:22 |
| `2f376468-5b29-4df6-8e46-91dcca7f8deb` Synopsys | SNPS | 1 | 2 676 | 11-16 13:21 |

CSCO is the nearest thing to a permanently failing issuer: five timeouts in a row, each retry
arriving after a backoff of up to 24 h, so each one starts cold again.

### Why the replace is slow (measured, read-only)

The function was not executed. Its read-only parts were timed with `explain (analyze, buffers)`
on the rows already stored for two issuers:

| step | CSCO (2 928 rows, 2.39 MB JSON) | `3247a7e8…` (3 399 rows, 2.77 MB JSON) |
|---|---|---|
| `company_evidence_check` per row, cold | 7 953 ms, 1 717 block reads | 4 817 ms, 1 311 block reads |
| same, warm (immediate rerun) | 2 642 ms | 616 ms |
| delete anti-join (as a select) | 96 ms | 86 ms |

The per-row check does a primary-key lookup into `financial_facts` (708 MB, 1.05 M rows) and a
`filings` lookup for every row. Cold, that step alone sits at the 8 s limit before the upsert of
every row (two indexes) and the delete have run. The upsert was not timed, since timing it needs
a write. The delete is not the problem. Client stage times of 9–17 s seen in wave223 fit a
2–3 MB request body plus an 8 s server-side cancel.

### Why it turned into a continuous error on 2026-11-14

`company_digest_state.swept_at` shows the universe was onboarded on 11-08 and 11-09 (48 streams
first swept on 11-09 alone). The 7-day sweep made those streams due again from 11-14 onward, so
every hourly run since has carried large sweep streams, and the backlog has not been 0 at the
end of a run since 11-14 09:20. Before that date the same timeout appears in the batch history
(partial batches on every day from 11-08), but idle hours let the backlog reach 0.

### Retry selector (#220) is not in production

- `supabase_migrations.schema_migrations` ends at `20261123110000 company_evidence_fact_lookup`.
  There is no `20261124110000` row.
- Catalog: `company_sweep_due(timestamptz,timestamptz,integer,text)` exists, security definer,
  stable, `search_path=""`, owner `postgres`, ACL `{postgres=X/postgres,service_role=X/postgres}`.
  Its body does not contain the `last_status = 'failed'` branch.
- Effect today: small. The four backlog streams are already selectable without it, three by
  `company_digest_due` (state revision ahead of digested revision) and CROX by the 7-day sweep
  (`swept_at` 11-09). #220 only matters for a failed stream whose revision is current and whose
  last sweep is under 7 days old. Applying it is still correct and is the next step.

### Deployed version

Batches carry `code_version = bea837db`. Production is two merges behind `origin/main`
(`68701c48`): #225 (docs) and #226 (CLI evidence failure correlation). Neither changes the
cron path's behaviour.

## What follows from this

1. Apply migration `20261124110000_company_digest_retry_selection.sql` (merged, reviewed).
2. Code fix: write the evidence index in bounded chunks so no single statement approaches 8 s,
   keeping the attempt and revision fence on every chunk and deleting stale rows last.
3. Freshness: stop one stream in backoff from failing the whole dataset, while keeping the
   failed streams named in the freshness detail and in `ingest_batches.errors`.

Not proposed here, owner decisions if wanted: raising `statement_timeout` for `service_role`
(a role setting, wider than this stream), and skipping the rewrite of unchanged evidence rows
(about 1 M row rewrites per sweep cycle today; 126 k dead tuples at the time of reading).

## Addendum — migration 20261124110000 applied (2026-11-16 13:13 UTC)

`supabase/migrations/20261124110000_company_digest_retry_selection.sql` (PR #220, merged
2026-11-09, byte-identical to `origin/main` `68701c48`, sha256
`ba3f2218e4f48c278f319e699df224046697bd84404ab2a89a0a9ca263831195`).

1. Rehearsal: `begin; <file>; <catalog probe that raises>; rollback;` returned `rehearsal_ok`
   with one function, the retry branch present and owner, ACL, volatility and `search_path`
   unchanged. A follow-up read confirmed production was unchanged (no retry branch, no
   history row).
2. Preconditions: 0 `company-digest` batches running; applied at :13, between cron runs.
3. Apply: one request, one transaction:
   `begin; <file>; insert into supabase_migrations.schema_migrations(version,name,statements)
   values ('20261124110000','company_digest_retry_selection',array[<file>]); commit;`
4. Verification after commit:

| check | result |
|---|---|
| signature | `company_sweep_due(timestamp with time zone,timestamp with time zone,integer,text)`, one overload |
| security / volatility / config | definer / stable / `search_path=""` (as in the migration) |
| owner / ACL | `postgres` / `{postgres=X/postgres,service_role=X/postgres}` (unchanged) |
| execute: service_role / anon / authenticated | true / false / false |
| body has `d.last_status = 'failed'` | true |
| history row | `20261124110000 company_digest_retry_selection`, 1 statement, sha256 of the stored text equals the file's |
| smoke call `company_sweep_due(now()-7d, now(), 200, null)` | 14 streams due |

Observation, not acted on: `supabase/migrations.lock.json` has no entry for `20261123110000`
or `20261124110000`.
