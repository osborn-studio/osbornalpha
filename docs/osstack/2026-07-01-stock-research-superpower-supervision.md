# Stock Research Superpower Osstack Supervision

Date: 2026-07-01
Status: Verified locally; pending merge/push/deploy decision

## Scope

Use osstack to manage and supervise the Stock Research Superpower lifecycle:

- development
- testing
- benchmark scoring
- verification evidence
- release handoff
- deployment readiness

Primary implementation branch:

```text
codex/stock-research-superpower
```

Primary worktree:

```text
/Users/gilbertchen/.config/superpowers/worktrees/stock-monitor/stock-research-superpower
```

## Source Inputs

- Design spec: `docs/superpowers/specs/2026-07-01-stock-research-superpower-design.md`
- Implementation plan: `docs/superpowers/plans/2026-07-01-stock-research-superpower.md`
- Benchmark reference: `skills/stock-research-superpower/references/benchmark-and-scoring.md`
- B fixture: `skills/stock-research-superpower/evals/fixtures/B-ai-optical-modules-pass.md`

## Osstack Runtime

Verified runtime:

```text
osstack CLI: 0.8.1
daemon: 0.8.1
dashboard: http://localhost:8799/dashboard
```

Available agents from `osstack config doctor`:

- `claude-code`
- `claude-cli`
- `codex-cli`
- `claude-design`

Unavailable optional agents:

- `opencode-cli`
- `ds-review`
- `ds-verify`
- `autoresearch`
- `google-stitch`

## Kanban

Card:

```text
card_e02369f4
Stock Research Superpower: dev/test/verify/deploy supervision
```

Current intended state:

```text
running -> ready after this runbook is committed
```

## Loop Evidence

Loop:

```text
loop_c3658119-77d2-407e-b786-d77bcb8291fc
```

Completed tasks:

- `task_7c45e683` - `code.test`
- `task_22cc0d64` - `code.review`
- `task_53c26983` - `release.proof`

All three tasks passed one local verification iteration.

Generated local evidence artifacts:

```text
STATE.md
LOOP-STATE.json
reports/osstack-report-loop_c3658119-77d2-407e-b786-d77bcb8291fc.md
release/osstack-scorecard-loop_c3658119-77d2-407e-b786-d77bcb8291fc.md
release/osstack-scorecard-loop_c3658119-77d2-407e-b786-d77bcb8291fc.html
release/osstack-proof-loop_c3658119-77d2-407e-b786-d77bcb8291fc.zip
release/osstack-proof-loop_c3658119-77d2-407e-b786-d77bcb8291fc/
```

These are local proof artifacts and should not be committed unless a release process explicitly asks for proof-pack archival.

## Verification Gates

Required local gates:

```bash
npm run typecheck
node scripts/score-stock-research-superpower.mjs --benchmark skills/stock-research-superpower/evals/benchmark.json --self-check
node scripts/score-stock-research-superpower.mjs --benchmark skills/stock-research-superpower/evals/benchmark.json --case B-ai-optical-modules --answer skills/stock-research-superpower/evals/fixtures/B-ai-optical-modules-pass.md
```

Latest known result:

```text
typecheck: pass
benchmark self-check: pass
B-ai-optical-modules fixture score: 91.83
passing_score: 80
excellent_score: 90
forbidden_hits: none
```

## Deployment Readiness

This feature is a local skill-pack/documentation change. Deployment means:

1. Merge or PR `codex/stock-research-superpower`.
2. Run the verification gates on the merged branch.
3. Let the repository's normal deployment pipeline run.
4. Post-merge smoke: confirm skill files exist and benchmark self-check still passes.

Osstack `release doctor --target primary` was also run. Its output is useful as an external release checklist, but it is oriented toward osstack's own npm/knowledge-cloud release template, not this Stock Monitor skill-pack deployment.

Relevant external release doctor blockers:

- missing osstack repository secrets such as `NPM_TOKEN`
- missing Knowledge Cloud deployment assets
- missing EdgeOne deployment credential

These are not direct blockers for merging this stock-monitor feature branch unless the release target expands to osstack npm/Knowledge Cloud publication.

## Next Actions

Recommended path:

1. Keep local proof artifacts uncommitted.
2. Commit this supervision runbook.
3. Move `card_e02369f4` to `ready`.
4. Choose integration mode:
   - merge locally to `main`
   - push branch and create PR
   - keep branch as-is for later
5. After integration, rerun all verification gates from the integration branch.

## Rollback

If the merged feature causes a problem:

1. Revert the feature commits on the integration branch.
2. Re-run `npm run typecheck`.
3. Re-run the benchmark self-check.
4. Move the osstack card back to `blocked` with the failing command and proof artifact path.
