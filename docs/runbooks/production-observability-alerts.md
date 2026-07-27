# osbornALPHA Production Observability Runbook

## Checks and thresholds

| Check | Window | Alert condition | Schedule (UTC / Beijing) |
|---|---|---|---|
| `ai_daily` | Previous complete Beijing calendar day | failure rate `> 10%`; p95 `> 90s`; any `running > 10m` | `16:15 UTC` / `00:15` |
| `quote_15m` | Previous complete 15-minute window | any full batch failure; any degraded batch; stale/cache ratio `> 20%` | GitHub Actions at minutes `7,22,37,52` |
| `auth_email_daily` | Previous complete Beijing calendar day | either signup-confirmation or recovery delivery is not `delivered` for every configured target | evaluated during the daily recovery probe |

AI alerts include a count by stable `error_code`. Provider messages, prompts, user IDs, email addresses, and ticker positions are not included in notifications.

Every check window is inserted into `service_alert_runs` before delivery. The unique key `(check_name, window_start)` prevents a retried Cron from sending the same alert twice.

The quote check uses GitHub Actions because Vercel Hobby only permits daily Cron schedules. The workflow calls the same bearer-protected production endpoint, while Vercel remains responsible for execution and logs.

## AI budget operations

### Policy and reset

| Feature | Free | Pro | Admin |
|---|---:|---:|---:|
| Copilot | 20/day | 100/day | Unlimited |
| Nine perspectives | 5/day | 50/day | Unlimited |
| Brief preview/manual generated brief | 2/day | 20/day | Unlimited |

- Non-admin platform-key calls share one `¥8.80` daily cost cap per user across all three features. Both count quotas and the cost cap reset at `00:00 Asia/Shanghai`.
- Copilot permits at most 12 model turns with `max_tokens=9000` per turn.
- Admin platform calls are count- and cap-exempt, but each call must create a durable `cap_exempt=true` incurred audit before the provider network request. Accepted provider usage is settled afterward; provider or settlement failure preserves the incurred conservative snapshot.
- BYO calls are outside platform count and cost enforcement. Terminal BYO runs retain token audit with zero platform cost.
- User-triggered LLM features outside the three-feature matrix must be BYO-only. HTTP shared-key daily brief, radar, and Research OS jobs require a valid `CRON_SECRET` bearer token and fail closed when it is absent or invalid.
- `scripts/research-daily.ts` is a separate operator-only local process with direct environment access; it is not an HTTP route and is not protected by `CRON_SECRET`. Restrict execution and environment credentials at the operator host/shell boundary.
- `/api/brief/send` is admin-only. Cron previews and manual invocations use the same `CRON_SECRET` bearer check as scheduled execution and fail closed when the secret is absent.

### Stable failures

| Error code | JSON HTTP | Meaning / first action |
|---|---:|---|
| `quota_exhausted` | 429 where returned as an error response | Feature run count is exhausted; confirm the Beijing-day window and effective plan. |
| `daily_cost_exhausted` | 429 | Non-exempt platform cost capacity is exhausted; use BYO or wait for Beijing midnight. |
| `pricing_unavailable` | 500 | Provider/model lacks a reviewed price; do not bypass pricing. |
| `budget_unavailable` | 503 | Cost ledger/RPC unavailable; platform calls fail closed. |
| `usage_audit_unavailable` | 503 | Durable feature-run audit unavailable; do not retry blindly. |
| `budget_invariant_violation` / `usage_audit_invariant` | 500 | Exact retry identity or ledger state conflicts; escalate before replay. |

Copilot starts an SSE response after its durable run audit is created. Errors discovered during later model turns therefore arrive as `type=error` events with the same stable `code` on an HTTP 200 stream, followed by `type=done`; clients must inspect the SSE event rather than only the HTTP status. The perspectives count-exhausted response is an intentional HTTP 200 degradation with `source=quota` and `quota.reason=quota_exhausted`. Authentication failures remain `401`; admin-only manual send returns `403` for an authenticated non-admin.

### Ledger lifecycle and reconciliation

`usage_events` is the feature-run ledger. A run is inserted as `pending` before model spend, with immutable user, feature, provider/model, pricing/FX, and BYO identity. It is finalized exactly once as `completed` or `failed`; an identical finalization retry is idempotent, while any changed retry is an invariant error. Only `completed AND byo=false` rows count toward feature quotas. `fail_stale_usage_runs(900, 100)` deterministically marks old pending rows failed; inspect them before and after reconciliation.

`llm_cost_reservations` is the per-provider-call ledger:

- `reserved`: capacity held, no provider call yet; unexpired non-exempt rows count against the cap and expired rows do not.
- `incurred`: conservative usage/pricing snapshot was committed before network spend; it always counts and must never be released.
- `settled`: provider usage was accepted and actual cost replaced the conservative amount.
- `released`: pre-network reservation was safely abandoned.
- `cap_exempt=true`: admin platform spend is visible in total cost but excluded from cap-used cost.

An `incurred` row left after provider or settlement failure is a durable conservative charge. Reconcile it only from provider/request evidence. Never settle or release an incurred row merely because it is old: settle only when accepted provider usage is available; otherwise preserve the conservative incurred snapshot. The settings UI deliberately distinguishes total platform spend (`usedMicrormb`) from non-exempt cap consumption (`capUsedMicrormb`).

Safe triage query concepts (run with an authorized database role; substitute bounded user/day values):

```sql
-- Run lifecycle by feature; pending older than 15 minutes needs review.
select feature, status, byo, count(*)
from usage_events
where user_id = '<user_uuid>'
  and created_at >= '<beijing_day_start_utc>'
  and created_at < '<beijing_day_end_utc>'
group by feature, status, byo;

-- Cost lifecycle and cap exemption; compare settled actual vs conservative held/incurred.
select status, cap_exempt, count(*),
       sum(case when status = 'settled' then settled_micrormb
                when status in ('reserved', 'incurred') then reserved_micrormb
                else 0 end) as micrormb
from llm_cost_reservations
where user_id = '<user_uuid>'
  and created_at >= '<beijing_day_start_utc>'
  and created_at < '<beijing_day_end_utc>'
group by status, cap_exempt;

-- Read-only stale pending candidates; this query does not mutate rows.
select id, feature, created_at
from usage_events
where status = 'pending'
  and created_at < now() - interval '15 minutes'
order by created_at, id
limit 100;

-- Read-only incurred candidates. Resolve <user_uuid>, <day_start_utc>, and
-- <day_end_utc> from the incident/user before querying; never run globally.
-- The time bounds are UTC instants for one Asia/Shanghai calendar day.
-- Age alone never authorizes settlement/release; require provider/request evidence.
select id, feature, cap_exempt, created_at, pricing_version, usd_cny_micros
from llm_cost_reservations
where user_id = '<user_uuid>'
  and created_at >= '<day_start_utc>'
  and created_at < '<day_end_utc>'
  and created_at < now() - interval '15 minutes'
  and status = 'incurred'
order by created_at, id
limit 100;

-- service_role only: count the bounded pending page, reconcile with the exact
-- installed signature, then count the next bounded page. Review candidates first.
select count(*) as stale_pending_before
from (
  select id
  from usage_events
  where status = 'pending'
    and created_at < now() - interval '15 minutes'
  order by created_at, id
  limit 100
) as candidates;

select public.fail_stale_usage_runs(900, 100) as rows_marked_failed;

select count(*) as stale_pending_after
from (
  select id
  from usage_events
  where status = 'pending'
    and created_at < now() - interval '15 minutes'
  order by created_at, id
  limit 100
) as candidates;
```

### Release order and pricing review

1. Apply Supabase migrations through `20260728150000_profile_entitlement_security.sql` before deploying application code.
2. Verify the pricing registry contains the exact key `deepseek:deepseek-v4-flash`; the configured platform provider/model must resolve to `deepseek` / `deepseek-v4-flash`.
3. Verify `LLM_DAILY_COST_LIMIT_MICRORMB=8800000`, `LLM_USD_CNY_MICROS=7200000`, `LLM_RESERVATION_TTL_SECONDS=300`, and `CRON_SECRET`; never expose these through client configuration.
4. The rates were reviewed on 2026-07-28. `PRICING_VERSION=deepseek-2026-04-24` is the provider effective/release version key, not the review date.
5. Deploy the app, then smoke-test a BYO call, a metered platform call, an admin cap-exempt call, and a bearer-authenticated cron without logging prompts or keys.
6. Check the official DeepSeek model pricing and the approved USD/CNY policy before each release and after any provider pricing notice. Update the registry/version and FX configuration through code review; historical rows are never repriced.

### Repository verification status

The feature tests, standalone TypeScript check, production build, database reset, pgTAP suite, concurrency harness, database lint, diff hygiene, and LLM call-site audit pass locally. This does not mean every repository quality gate is available:

- `CI=1 npm run lint` is **BLOCKED / not available non-interactively**. The script invokes deprecated `next lint`, the repository has no ESLint configuration, and Next prompts `How would you like to configure ESLint?`; under `CI=1` it exits 1 before linting files.
- Therefore standalone application lint is not a passing gate. The passing production build and `npm run typecheck` are recorded separately and must not be presented as a substitute for standalone lint.
- No ESLint configuration, codemod, or dependency upgrade was introduced in this AI-budget scope. Establishing the repository lint baseline requires a separate approved change.

## Delivery

- Primary: Resend email to `ALERT_EMAIL_TO`.
- Optional secondary: Telegram when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured.
- Sender: `ALERT_EMAIL_FROM`, normally `osbornALPHA Alerts <alerts@mail.osbornalpha.com>`.
- Resend errors are stored as stable delivery codes; raw provider responses are not persisted.

## Auth email probes

The probe targets are stored only in encrypted Vercel environment variables. Database rows contain an HMAC-SHA256 recipient identifier and the public email domain, never the raw address.

1. `02:00 UTC / 10:00 Beijing`: create or resend the signup confirmation for each synthetic account.
2. `02:10 UTC / 10:10 Beijing`: request a password reset for each account.
3. Resend posts signed delivery events to `/api/webhooks/resend`.
4. The webhook verifies the raw payload with Svix, deduplicates by `svix-id + recipient hash`, and records `pending`, `delayed`, `delivered`, or `failed`.
5. The following day's recovery probe evaluates the previous complete day and alerts on missing or failed delivery.

The first empty historical window after deployment is stored as a healthy bootstrap baseline. Once that baseline exists, a completely missing probe day alerts normally.

Resend webhooks are at-least-once and may arrive out of order. The handler retains the newest event timestamp. See the official [signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests) and [delivery event](https://resend.com/docs/webhooks/emails/delivered) documentation.

## Triage

1. Open `/admin/usage` and inspect the latest check window and violation codes.
2. For AI, inspect failure counts by `error_code` and stale `running` rows before retrying any workload.
3. For quotes, compare full failures, degraded batches, and cache ratio; then inspect deployment logs by deployment ID.
4. For auth email, check Resend delivery events and suppression status. Do not disable email confirmation as a workaround.
5. Record the incident, mitigation, and production verification on the active osstack card.

## Manual weekly delivery check

Run every Monday between 10:30 and 11:00 Beijing time with fresh Gmail, QQ, and 163 addresses. Keep click/open tracking disabled.

| Provider | Signup received | Reset received | Inbox/spam | SPF/DKIM pass | Links return to production | Latency | Operator/date |
|---|---:|---:|---|---:|---:|---:|---|
| Gmail | [ ] | [ ] | [ ] | [ ] | [ ] | — | — |
| QQ Mail | [ ] | [ ] | [ ] | [ ] | [ ] | — | — |
| 163 Mail | [ ] | [ ] | [ ] | [ ] | [ ] | — | — |

Automated probes verify mail-server delivery; this manual check remains necessary for inbox placement, spam classification, visible sender, subject encoding, and unmodified action links.
