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
