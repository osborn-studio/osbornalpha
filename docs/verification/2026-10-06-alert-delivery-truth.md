# Alert delivery outcome visibility — local candidate, 2026-10-06

## Contract

A unique insert conflict proves existence, not delivery. Read the stored check name and both window boundaries; return stored metrics and violations only for a structurally consistent healthy run or an alerting run with recorded successful configured channels. Missing, failed, partial, all-unconfigured or in-progress receipts fail visibly. Unknown externally delivered messages are not automatically resent.

For a first alerting run, persist channel results before returning success. Catch exceptions separately per channel, retain earlier success and Telegram partial chunk counts, and store fixed error codes without exception text. An unexpected dispatcher rejection also stores a fixed failed receipt. Receipt update errors and incomplete delivery throw; callers retain their existing generic failure response.

## Verification and audit

- Initial finite osstack task_de46da5c passed.
- Strict Claude CLI claude-opus-5-5 audit task_cdf72101 reviewed source and synthetic tests only, without tools/MCP/private data. Accepted all three findings: catch thrown channel sends, validate stored status/violation consistency, and add read/filter/update/partial/unconfigured/malformed/error regressions. Also retained partial Telegram chunk counts.
- Post-audit task_67af0e02 failed. Fixed duplicate-property TypeScript warnings and a test hook bug: returning mockReset() from beforeEach returned a function that Vitest executed as cleanup. The throwing dispatcher mock then ran again after the test. A block-bodied hook returns nothing; the intended service rejection was already caught. No rejection suppression was introduced.
- Final task_71b9e9d1: eight observability/alert-route suites, typecheck, lint and diff checks passed; zero verifier issues. Service tests 21 and new per-channel tests 3. Every send used mocks. Final fixes were host verified, not re-reviewed by Claude.

Audit evidence: /Users/osborn/.osborn/verification/knowledge-cycle-alpha-i1/opus-alert-delivery-truth-20261006-1824/disposition.md.

## Remaining gates and debt

No schema, schedule, live alerts, provider calls, deployment, production DB changes or automatic retry/recovery. Existing unique key is check_name/window_start; a different window_end conflict remains unavailable until explicit reconciliation. Concurrent retries see an unresolved receipt and fail conservatively. A successful provider receipt does not prove human receipt. Current update checks error but does not select back an affected row; production role/update acceptance still needs verification. Outbox, reconciliation, reliable recovery, stale telemetry detection and D3.4 continuous ordinary-schedule evidence remain open; D3.3 is partial. Failed delivery now becomes visible but is not repaired automatically.
