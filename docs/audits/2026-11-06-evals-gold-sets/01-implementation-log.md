# 01 — F6 评测与黄金集 实施记录

执行：Opus 5.5 指挥；每任务 Sonnet 5.5 实施子代理（TDD）→ Opus 规格复审 → Opus 质量复审 → Codex CLI gpt-6-astra（medium）`codex review --commit` + 对抗挑战 → 修复 P1/P2。
计划：`docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md`；规格：`docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`（第 6 稿，§0 权威）。

| 序 | 任务 | 提交 | 规格复审 | 质量复审 | Codex review / 挑战 | 修复轮次 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | 契约、规范 JSON、比较、归约 | 2409a7b, 42c671e, fb9f541 | ✅ | ✅（minor 并入） | review P2 稀疏数组 → 修；挑战 P3 max_fail → 修 | 2 | 63→92 测 |
| 2 | 黄金集 schema、plan2 旧格式适配、加载、锁 | 94a1ce2, 57dc33b, 5a101d6 | 需改 → ✅（metric 绑定、retracted.by 与实施者分离） | 需改 → ✅ | review/挑战 4×P2（metric 键、日期、borrowings INSTANT、cn_incl_bonds）→ 全修 | 2 | 130 测 |
| 3 | gold-diff、redact、validate CLI、hash-source、ci.yml | bb82e7b, 20d824f | 需改 → ✅（语义字段、锁移除、query token） | 需改 → ✅ | review P2 锁移除；挑战 4×P2（subject 字段、锁、git 引号路径、JSON 转义绕过）→ 全修 | 1 | redact 范围收窄到 F6 路径 |
| 4 | 代码版本、报告 | 704ad08, cb6b357, cef3cd9, a3391b4 | ✅（git 失败时 fail closed） | ✅ | 挑战 2×P2（git 失败当干净、半写文件）；复审 P2 临时文件泄漏 → 全修 | 2 | 原子发布 |
| 5 | 迁移、锁、行类型、存储集成测试 | f65c302 | ✅ | ✅ | review/挑战：无缺陷 | 0 | 6/6 真实 PG；test:migrations 通过 |
| 6 | store.ts / persistRun | 9c4eb4f, 90fa45f | 需改 → ✅（resume 对终态行不校验） | ✅ | 挑战 P2 同上 → 修；复审无缺陷 | 1 | 11/11 真实 PG |
| 7 | facts 读适配器、来源链、特权读 | 2ca2be0, 523357a, d2ea917 | 需改 → ✅（旧代判定、R5-5/R5-6 测试） | ✅ | review **P1** Tushare 同行多概念选错候选；挑战 3×P2；复审 **P1** 公共读取器查 service-only 表 → 全修 | 2 | 55 测 |
| 8 | official kind、runGoldSet | 83d8bb7, 23322c5, 3f2a9e3, a506fd4 | 需改 → ✅（verified 空集为真） | 需改 → ✅ | 挑战 **P1** 特权运行隔离行被当 expected_absent；2×P2；复审 P2 512 位差值格式化 → 全修 | 3 | |
| 9 | CLI、F6 世界、合成黄金、facts 集成测试 | f6c81d5, 5bb6e6a, 6f9f420, e42992a | 需改 → ✅（子集写库） | ✅ | 挑战 3×P2（子集写库、--out 路径、setup 不匹配丢证据）→ 全修 | 1 | 8/8→11/11 真实 PG |
| 10 | 投影、账本、replay kind | 2296893, 939865f, c3d1683 | 需改 → ✅（账本批准人校验） | 需改 → ✅ | 挑战 **P1** 不合格指标输入仍 identical；P2 state_rev 绑定、TTM、日期；复审 P2 quarter 归一 → 全修 | 2 | |
| 11 | record-replay、frozen 夹具、CI 报告、路由等价 | da8a299, 3becbb1, 4b89d83, c88cced, 383b3ca | ✅ | ✅（池错误监听） | review P2 / 挑战 **P1** 模块错标；3×P2（setup 迁移、CI 先写报告、explained_diff）→ 全修 | 2 | 12 案例两库复现一致 |
| 12 | 专家/审计/清单校验器、codex-audit、模板 | 7834b46, …（见下） | 需改（见修复） | ✅ | 挑战 3×**P1**（审计漏解析、空白处置、无证据 agree）+ 2×P2；review 2×P2 | 进行中 | |
| 13 | 管理只读 API | 9b48556, b46e014 | ✅ | ✅ | 挑战 2×P2（截断标志、长定位）→ 修 | 1 | UI 待画布 |
| 14 | dual_source、reference、registry、reduce | 573feac, a39de12, 171f341 | 需改 → ✅（对登记归 F6、resume 拦截） | ✅ | review P2；挑战 4×P2（单位、账本 run_id、阈值、读错）→ 全修 | 1 | |
| 15 | extraction、calibration（未启用） | b46e014（被并入）、142b2a8 | 需改 → ✅（不可解析无标注文档） | ✅ | review P2 / 挑战 3×P2（日期、缺失文档）→ 全修 | 1 | 提交归属见 §18.1 #23 |
| 16 | 运行手册、§18.1、全量门禁 | （本提交） | — | — | — | — | 见门禁节 |

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

## Task 15 — extraction_gold and judgment_calibration (pure logic, disabled)

- kinds/extraction.ts: two-step matching (lexicographically first maximum matching over same-page, IoU ≥ 0.5, equal-value edges; greedy classification of the rest), FP_citation, P/R with integer 95% gate, zero support skipped, unparseable → read_error. Fixtures: adversarial (max matching beats greedy; wrong page; zero predictions), crossed two-page (2 TP), all-parsed TP=0 (gate fail).
- kinds/calibration.ts: eligibility, revision chain (last eligible), exact Brier, 10-bucket reliability (endpoint in bucket 9), no eligible → incomplete.
- kinds/registry.ts: extraction_gold (D8: license decision pending), judgment_calibration (prerequisite: F4 settledForecasts) → kind_not_enabled, exit 2.
