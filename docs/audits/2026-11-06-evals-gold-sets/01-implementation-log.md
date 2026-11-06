# 01 — F6 评测与黄金集 实施记录

执行：Opus 5.5 指挥；每任务 Sonnet 5.5 实施子代理（TDD）→ Opus 规格复审 → Opus 质量复审 → Codex CLI gpt-6-astra（medium）`codex review --commit` + 对抗挑战 → 修复 P1/P2。
计划：`docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md`；规格：`docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`（第 6 稿，§0 权威）。

| 序 | 任务 | 提交 | 规格复审 | 质量复审 | Codex review / 挑战 | 修复轮次 | 备注 |
|---|---|---|---|---|---|---|---|

## Task 10 — projections, ledger, replay kind

- Files: src/lib/evals/projections/facts.ts, src/lib/evals/replay/{fixture,ledger}.ts, src/lib/evals/kinds/replay.ts, src/lib/evals/test-support/memory-facts.ts (+ tests).
- Decisions: projections read history=true; diff notation facts[<concept>/<start>..<end>/<duration>/<unit>/<consolidation>/<available_date>/<source_ref>].<field>, null = empty segment, one-sided row = bare path; unprivileged ledger hit = explained_diff; ledger structural errors = gold_invalid.
- Not wired here: Task 7 factsReader.project → projectRequest (CCR 2).

## Task 11 — record-replay, frozen fixtures, frozen DB replay, route equivalence

- 12 frozen cases over ZZEVA (CIK 9990601) / ZZEVB (CIK 9990602), recorded by scripts/evals/record-replay.ts against a fresh local database from committed code (da8a299d); a second fresh database reproduced all 12 hashes (`unchanged`). explanations.json = [].
- evals-facts.integration.test.ts: frozen replay all identical, gate pass (CI=1 also writes reports/evals/<run_id>.json); rebuild of the same setup is an isolated database; one flipped fixture byte -> read_error(setup_mismatch).
- route-equivalence.test.ts: facts (3 requests) and metrics projections equal between the database path and the public route JSON.
- cli/run-replay.ts: run.ts --kind replay_consistency (ci = frozen over S4_TEST_STATE, report = live anon / --write-db privileged); factsReader.project wired through withProjector (projectWithRev).
- ci.yml: F6 frozen replay report digest step after test:db.
- Deviations from plan text: ledger loads take the injected policy (loadRecorders().recorders); live recording / replay use projectWithRev so state_rev binds the projection; record.test self-approval case uses added_by=approved_by=owner (an implementer approver no longer parses); recorded in a clean detached git worktree because an untracked docs/audits/.../tasks/ directory dirties the main tree.
- Not done (owner items): facts.live.json and the first live run; lock.json does not list replay files (CCR 5).

## Task 13 — admin read API

- src/lib/evals/admin.ts (whitelist: run columns, §3.2 summary keys type-checked incl. coverage.evaluated_optional, case text columns + detail.locator/document_id; ≤ 100 case rows; gate_failing_30d = failed+incomplete+error in 30 days, global), GET /api/admin/evals, GET /api/admin/evals/[run_id].
- Tests: exact key sets, sentinel 918273645.5 planted in summary extras and case detail never in responses or logs, 401/403 before the admin client, 400/404.
- UI section and drawer: after the Claude Design canvas and plan 3 Task 19 (§0 R5-11).

## Task 14 — dual_source, reference_regression (pure logic), kind registry

- kinds/dual-source.ts: PairSource (read-only, injected), F6 recompares value_text, upstream non-comparison outcomes -> missing/read_error, disposition rule (natural_key + resolved status + chosen_fact_ids), same_feed -> adapter_check, relDiff conformance vectors (plan 3 half-away rounding vs F6 truncation).
- kinds/reference.ts: strict ReferenceResult, ReadDeps reflection refusal, canary path (cases[] only), rel 0.01, ledger values must equal the compared values, referenceSummaryWriter(...).writeReferenceSummary as the only write path. reduce.ts::reduceForKind is the one fixture-authenticated reduction (Task 12 reuses it).
- kinds/registry.ts (the one enablement table) + cli/run-cli.ts assertKindEnabled (after the --resume branch, before the runner lookup): dual_source (prerequisite: plan 3 merged) and reference_regression (prerequisite: macro migrations) -> kind_not_enabled, exit 2. Test asserts KIND_RUNNERS keys == enabled kinds.
- No database tests (critical suites cannot skip; R5-12). kinds/ratio.ts is Task 15's, not built here.
