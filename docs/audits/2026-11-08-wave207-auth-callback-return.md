# Wave207 auth callback return destination

Base: `b7c21abd1c728d0415c18b4f57b9d623742f44f5` (includes #203 and #205).

## Reproduction and fix

The real callback handler, using real Request/URL/NextResponse and a mocked Supabase auth/database boundary, returned `Location: https://alpha.example@evil.example/` for successful code exchange with `next=@evil.example`. The URL host is `evil.example`. Before the fix the initial regression suite had 17 failing and 9 passing cases.

The callback now reuses `loginReturnDestination`, already used by middleware and password login. Unsafe destinations fall back to `/macro`; arbitrary queries/fragments are removed and only validated industry selectors survive. Analytics receives the sanitized destination. Exact `/reset-password` and `/en/reset-password` remain accepted to preserve previously accepted local reset destinations; queries, fragments, encoded equivalents and trailing slashes cannot enter this exception. The shared validator is unchanged.

## Flow inspection and limits

The sole code-exchange callback is `/auth/callback`. OAuth uses this callback without `next`. Signup/resend use an `aid` callback without `next`; tests cover this exact shape and preserve email attribution. No separate signInWithOtp/verifyOtp callback exists in the inspected source. The existing callback's successful code exchange and failed/missing-code behavior are unchanged.

Recovery currently calls `resetPasswordForEmail` with `redirectTo = origin + '/reset-password'` and relies on browser Supabase fragment handling. That flow is separate and unchanged. The exact reset exception is compatibility preservation, not a demonstrated caller or recovery remediation. No live email, OAuth, magic-link, recovery, browser or production verification was performed. Request-origin trust remains pre-existing and out of scope. No grants, providers, configuration, migrations, deployment or credentials changed.

## Verification

Node `v22.22.1`; pre-existing full dependencies consumed read-only. All scratch, Vitest cache and typecheck output were routed to the external task directory.

- Initial RED: 17 failed / 9 passed, including the external Location above.
- Full suite after production fix: 735 files passed / 52 skipped; 8240 tests passed / 807 skipped; exit 0. Skips are not passes.
- Final focused suite after adding exception-boundary and aid-only cases: 86 tests passed across 8 files, including 36 callback cases, middleware, AuthForm, auth helpers and real React auth lifecycle regressions.
- Project TypeScript check: exit 0.
- Final focused ESLint and `git diff --check`: clean.
- Full suite predates ten final added regression cases; the final focused run covers all ten. Production code did not change after the full suite.

## Independent mmx audit

Attempt 1 exhausted 6000 tokens with `stop_reason=max_tokens`, thinking only and no final answer: incomplete, not a pass. Attempt 2 completed with `stop_reason=end_turn`, nonempty final text and 11120 output tokens. It found no concrete introduced redirect bypass or callback security blocker. This is static independent review, not live proof or merge approval.

The reviewer requested reset exception near-misses and aid-only callback coverage: both are included in the final passing suite. Its recovery concern was that an unused-in-current-flow compatibility exception must not be represented as a recovery fix. This report makes that distinction. A browser recovery test remains parent-owned and is not claimed here.

## Evidence

External task evidence: `/Volumes/AIMATE_WORK/tmp/osstack/osbornalpha-wave207/auth-callback-return/`. Files include `TASK_PLAN.md`, `PROGRESS.md`, `REPORT.md`, `red.log`, `full-tests.log`, `final-green.log`, `typecheck.log`, `final-lint.log`, `verification-commands.txt`, `vitest.config.mjs`, `mmx-audit.json`, `mmx-audit-attempt2.json`, and extracted `mmx-final.md`.

Completed mmx response SHA-256: `f0099e12823a02c7df0800cb11c7936cdd203afe422a1b199d83e17602d57356`.
