# Quote alert bounded scalar snapshot — local candidate

The previous SELECT/count guard refused busy windows above PostgREST's row cap. The cron now requests one scalar JSONB snapshot containing only event name, count and stale. SQL limits the snapshot to 10001; the route accepts at most 10000 and refuses missing/malformed results before recording or delivering. This is completeness for committed rows visible to that statement, not a guarantee of all events ever assigned to the window.

The additive migration `20261006212400_quote_alert_window_samples.sql` uses STABLE, SECURITY INVOKER, empty search_path, service_role-only execution, and existing table permissions. It does not change table grants or RLS. Float8 projection removes arbitrary metadata and preserves existing JS numeric normalization; extra_float_digits=3 is pinned around JSON creation so caller settings cannot round a value across Math.round boundaries. No count/threshold policy changes. The new narrowly typed admin RPC client avoids the legacy Database schema's missing Views/Relationships without changing existing table clients.

## Verification

- osstack task_22f18b22 initially refused unregistered DB suite/type inference; task_1ae0fa16 exposed the old 13-suite assertion. Both corrected without disabling checks.
- task_3c5eb99a: isolated PostgreSQL17.10 full2066 tests passed,14 critical suites/113 critical tests/0 critical skips,42 migration files applied; owned database stopped. Typecheck, lint, production build and diff passed. The combined task remained escalated because the new gateway test incorrectly expected403 for the anonymous role; this does not count as a successful whole task.
- task_08248440: corrected gateway acceptance plus typecheck/lint/diff succeeded with0 verifier issues. Real owned loopback PostgREST16.4, max-rows1000: table query truncated1500 to1000 while scalar RPC returned1500; oversized window returned10001 sentinel; anon401/authenticated403 with42501. Owned gateway and PostgreSQL stopped. Synthetic data only, local fixture grants only; no production permission proof.
- Database numeric parity exercises the actual projected JSONB under caller extra_float_digits0/1, including malformed values, fractional boundaries and extreme numbers. A separate two-connection test shows an uncommitted failure is invisible until commit and a later read.
- Strict Claude CLI claude-opus-5-5 audit task_4bc72507: three findings accepted (suite count, JSON numeric GUC, late commits). Source-only isolated wrapper, no tools/MCP/private data. Followup task_dc8b1223 confirmed those fixes and found3 harness failure-path gaps: error/exit ownership, independent bounded cleanup, and actionable redacted diagnostics. All handled, with actual failed-spawn and hung-child negative tests. Final fixes host verified, not a third Opus review.

Final task_c2ace555 passed the whole DB/gateway/typecheck/lint/build/diff batch with0 verifier issues: **2069 tests,14 critical suites/113 critical tests/0 critical skips,42 migrations**. Owned PostgreSQL17.10 and PostgREST16.4 stopped. The extra3 tests exercise gateway failure cleanup. Evidence: `/Users/osborn/.osborn/verification/knowledge-cycle-alpha-i1/opus-quote-snapshot-20261006-2124/disposition.md`.

## Deployment sequence and remaining gates

Apply the migration before switching cron code; reload the target PostgREST schema cache and verify target service_role SELECT/EXECUTE plus scalar response shape at its actual version/settings. Missing RPC produces visible500, never false healthy. [PostgREST function documentation](https://docs.postgrest.org/en/stable/references/api/functions.html) describes scalar return values and schema-cache reload after function changes; the local gateway validates this candidate on16.4 only.

Inspect target query cost and existing created_at / event_name-created_at indices against expected volume. LIMIT bounds response bytes and returned rows, not total scan/sort work. Do not add an unmeasured production index. No production load tests performed.

Late commits/backdated inserts can arrive after the window snapshot. Current windows and existing delivery idempotency cannot reconcile that automatically; settle event ingestion lateness, lag/watermark and safe repeat evaluation before claiming lossless alert coverage. Merely adding an arbitrary lag would hide rather than close this gate. The new regression demonstrates the limitation.

Rollback code first to the prior guarded SELECT path if needed; leave additive functions in place until unused and reviewed. Prior path again conservatively refuses row-cap truncation. No destructive rollback SQL supplied. Real Next fetch/runtime/request-rate verification, receipt UPDATE role/RLS acceptance, outbox/reconciliation/recovery, ordinary24h acceptance, and production/login/human-input gates remain open. This change enables no dormant cron or paid processing and sends no alerts.
