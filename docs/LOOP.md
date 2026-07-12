# Closed Loop Contract

> Repo: stock-monitor (core_product)

## Product/Repo Purpose
OsbornAlpha — a personal AI-assisted stock-monitoring product (A-shares / HK /
US). Next.js 15 app on Vercel with a multi-tenant Supabase Postgres backend
(RLS), a daily-brief / radar pipeline (Vercel cron), and the Hiphon PM
("John Cameron") advisory skill layer.

## Inputs
_What the loop consumes._
- Owner-authored goals and Execution Contracts (`osstack start`).
- Market/news data pulled by existing API routes and cron jobs
  (`/api/cron/daily-radar`, `/api/cron/daily-brief`, `/api/cron/research-daily`).
- Supabase schema + migrations under `supabase/migrations/`.

## Judgments
_What quality means here._
- Typecheck, lint, and unit tests pass (see Verification).
- No RLS / tenancy regressions; no secret exposure.
- Product behavior matches the declared IBKR-style workspace UX.

## Actions
_What the loop may do._
- Propose changes on a branch / worktree (policy `mode: propose`).
- Auto-applicable only: `docs`, `tests`, `lint` (still surfaced, not merged).
- Everything else (source, dependencies, ci, migrations, deploy/config,
  product scope) requires human approval; secrets / destructive git /
  unreviewed external actions are forbidden.

## Verification
- `npm run typecheck`
- `npm run lint`
- `npm test`

_Provenance: no CI workflow exists (README notes GitHub Actions was removed in
favor of Vercel auto-deploy); these are the deterministic `package.json`
scripts. `npm run e2e` (Playwright) is intentionally excluded from the gate as
it needs a running server/browsers. `npm run build` is the build command._

## Feedback Assets
_Eval cases, pitfall lessons, knowledge memories, and runbook notes distilled from failed runs._

## Improvement Proposals
_Risk-rated changes derived from feedback assets (eval/test/docs = low, prompt/skill = medium, policy = high)._

## Self-Update Gates
- Low-risk changes may auto-apply only after deterministic gates pass.
- Prompt/skill changes require human approval.
- Policy/routing/evaluator changes require human approval and an anchor-case check.

## Human Approval Boundaries
- No destructive or irreversible action without human approval.
- No evaluator promotion without anchor cases.
- Database migrations, production deploy, and production config always require
  human approval (production Supabase + Vercel auto-deploy from `main`).

## Metrics
_Loop success rate, cost, and domain outcome metrics._

## Evaluator Epochs
_Each evaluator version is frozen inside an epoch; challengers must beat the incumbent on anchor cases before promotion._

## Anchor Cases
_Human-reviewed reference cases used to keep evaluators honest._

## Adversarial Cases
_Cases where an evaluator disagreed with a human verdict._
