# F6 评测运行手册

规格：`docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`（第 6 稿，§0 权威）。计划：`docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md`。

## 1. 每个 PR（CI 自动）
- `npx tsx scripts/evals/validate.ts --gold --lock --redact [--gold-diff <base>]`：退出 0 通过、1 有检查失败、2 用法错误；结果 JSON 进 job summary。
- `npm run test:db` 里的两个 critical 套件：`src/lib/evals/evals-store.integration.test.ts`、`src/lib/evals/evals-facts.integration.test.ts`（官方对账四条路径、重述、隔离、frozen 回放全 identical、篡改夹具 → setup_mismatch）。

## 2. 本地
- 单文件真实库：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/evals/evals-facts.integration.test.ts`（`db-one.ts` 不提交，内容见 `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5）。
- 合成集（只在 ci）：`npx tsx scripts/evals/run.ts --kind official_reconciliation --module facts --set src/lib/evals/fixtures/gold/facts/synthetic-us.json --mode ci` → 报告在 `reports/evals/`。
- frozen 回放：`npx tsx .claude/scratch/db-run.ts npx tsx scripts/evals/run.ts --kind replay_consistency --module facts --mode ci`（需要 `S4_TEST_STATE`，`db-run.ts` 见计划 Task 11 Step 9）。

## 3. 生产（owner 事项，规格 §16）
- 特权官方对账（需真实黄金值与 service 密钥，`.env.local` 不提交）：
  `node --env-file=.env.local --import tsx scripts/evals/run.ts --kind official_reconciliation --module facts --set <f6 黄金集> --mode report --write-db --verify-artifacts --verify-sources`
  中断后：同一命令换成 `--resume <run_id>`（不带 `--case/--limit`）。
- 在线回放：先 `node --env-file=.env.local --import tsx scripts/evals/record-replay.ts --mode live --case <id> …` 录制 `src/lib/evals/fixtures/replay/facts.live.json`，再
  `node --env-file=.env.local --import tsx scripts/evals/run.ts --kind replay_consistency --module facts --mode report --write-db`；未入账本的差异 → 退出 1。
- 账本条目（`src/lib/evals/fixtures/replay/explanations.json`）：`approved_by` 必须与 `added_by` 不同，`approval_ref` 必填（D6）。
- 已有回放案例的期望变化只能 `record-replay.ts --supersede <ledger_id>`（单个 `--case`），否则 `replay_rerecord_refused`。

## 4. 发布证据
- 专家抽样：复制 `docs/evals/templates/expert-sampling.template.json` 到 `docs/evals/<date>/expert-sampling-<module>-<n>.json`，`validate.ts --expert <file> --release`。
- 第三方模型审计：`npx tsx scripts/evals/codex-audit.ts …`（只审已提交目标），`validate.ts --audit <dir> --release`。
- 清单：复制 `docs/evals/templates/release-manifest.template.json` 到 `docs/evals/<date>/<module>-release-manifest.json`，`validate.ts --manifest <file>`（需要 service-role 读 `dq_eval_runs` 与 `dq_freshness`；无库访问即不通过）。frozen 回放证据是 CI 运行的报告副本（`mode='ci'`，`report_sha256` = 提交副本的字节哈希）；回放与对照的报告按夹具文件的提交字节认证，黄金集按 `lock.json`。

## 5. 本期未启用的 kind（`src/lib/evals/kinds/registry.ts`）
`dual_source`（计划三合并）、`reference_regression`（宏观迁移）、`extraction_gold`（D8 许可）、`judgment_calibration`（F4 settledForecasts）：`run.ts` 以 `kind_not_enabled` 拒绝，退出 2。启用 = 改注册表一行 + 在 `cli/run-cli.ts::KIND_RUNNERS` 加运行器（注册表测试断言两者一致）。

## 6. 默认值（规格 §16，本期按默认执行）
D1 阈值、D2 `gold_approval='process'`（清单需 `waivers`）、D3 上线前一次特权 report 后每季度、D4 public 集全量 JSON + `.md` 入 `docs/evals/`、D5 只用 36 格、D6 账本批准人 owner、D7 清单失败为上线检查项、D8 `extraction_gold` 不启用且不建 `eval-restricted` 桶。
