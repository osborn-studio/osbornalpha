- **P2 — `src/lib/macro/strategy/wiring.ts:70`: history limits differ from `memoryStrategyPort`.** The delegated `MacroDb.seriesHistory` counts all visible versions before deduplicating periods; the reference counts the resulting periods. Example: two periods, one revised, `maxRows: 2` returns two observations in the reference but throws `truncated` through this adapter. At the production limit, revision-heavy histories become falsely unavailable. **Fix:** select the highest visible version per period before enforcing `maxRows`; add a parity test containing revisions at the limit.

- **P2 — `docs/runbooks/macro-strategy.md:189`: preview selects a month that is not closed.** On November 1–2, the command selects October, whose cutoff is November 3. The cron returns 400 instead of the documented successful preview. **Fix:** omit `month` from the preview request, capture the response’s server-selected `month`, and reuse it for publication.

- **P2 — `docs/runbooks/macro-strategy.md:145`: missing-secret diagnosis contradicts the review cron.** With `CRON_SECRET` unset, `/api/cron/macro-review` returns **401 `unauthorized`**, not 503 `cron_unavailable`: `authorizedCronRequest` returns false immediately. An operator following this check receives the wrong diagnostic expectation. **Fix:** document the actual per-route behavior, or explicitly implement the promised missing-secret 503 before bearer validation.

VERDICT: not ready
---
## Disposition (Opus, 2026-11-07)

Model gpt-6-astra, medium, read-only, combined review + adversarial challenge over `7cc16eca..a05c9975`. No P1. All three P2 verified and fixed in `cecc4a72`:
1. `seriesHistory` maxRows parity: wiring.ts applies `maxRows` after per-period dedup (internal caps ×1/×4/×16, ceiling 100 000); parity test with revisions at the limit.
2. Runbook review-cron preview: preview without `month`, reuse the server-selected month.
3. Runbook: missing `CRON_SECRET` → 401 `unauthorized` on `/api/cron/macro-review`.

Gate after fixes: `npm test` 5867 passed / 0 failed; typecheck, lint clean. `test:migrations` PASS; `test:db` 6409 passed, 2 failed in known local research flakes (`fanout/calibration` passes 35/35 in isolation; `s4/anchor-two-phase` listed in runbook §7) — run before the wiring.ts fix, which touches no SQL.
