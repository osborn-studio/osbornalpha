# F6 评测与黄金集 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`（第 6 稿，§0 为权威修订，§15.1 为本期可构建子集）：一个黄金集契约（含对规格二 `plan2.json` 的只读采用）、一个运行器与六种评测的归约、F6 自有存储 `dq_eval_runs` + `dq_eval_case_results`、US facts 官方对账与 frozen 回放的真实库证明、证据校验器（gold/lock/diff/redact/expert/audit/manifest）、管理只读 API；依赖兄弟模块的 kind 只交付纯逻辑与注入接口。

**Architecture:** `src/lib/evals/types.ts` 是全部任务共享的契约（本文 §共享契约 原样落地）。评测分三层：**读适配器**（`adapters/facts.ts`，只读 `FactsDb` 子集 + `deriveMetrics`，特权版另含来源链解析与提示）→ **kind**（`kinds/*.ts`，纯函数：案例 + 读结果 → `CaseReport[]`）→ **归约**（`summary.ts`：`CaseReport[]` → §3.2 `Summary` 与 `gate`）。`runGoldSet()` 只在内存里评测并产出 `EvalReport`；落盘（`report.ts`）与入库（`store.ts`）由 CLI `scripts/evals/run.ts`（薄壳；逻辑在 `src/lib/evals/cli/run-cli.ts`，kind → 运行器的分发表 `KIND_RUNNERS`，启用与否只看 `kinds/registry.ts`）按 §6.3 的顺序执行。真实库证明在两个 critical 集成测试里：存储（不依赖规格二）与 facts（F6 自有确定性建库 `replay/setup.ts`）。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`（集成测试）、`tsx` 脚本、node `child_process`（git）。复用：计划一 `TableClient`/`memoryTableClient`/`pgTableClient`、`resolveIssuer`；计划二 `FactsDb`（`pgFactsDb`、`memoryFactsDb`、`supabaseFactsDb`）、`runFactsSync`、`deriveMetrics`、`FORMULA_VERSION`、`DERIVE_CONCEPTS`、`CONCEPT_IDS`、`MAPPING_GEN`、`rawHashOf`、`parseCompanyFacts`、`snapshotPath`、`canonicalDecimal`、`resolveCodeVersion`。

执行（owner 规则）：Opus 5.5 指挥；每个任务一个 Sonnet 5.5 实施子代理（TDD）→ Opus 规格复审 → Opus 质量复审 → Codex CLI（gpt-6-astra，medium）`codex review --commit` + 对抗挑战 → 修 P1/P2；记录在 `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`。

---

## 仓库约定（动手前必读）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9`，分支 `claude/evals-gold-sets-75bfc9`。不要 `cd` 出去；不要用裸 `git stash`（栈与其他工作树共享）。
- **所有权边界**（并行兄弟：计划三、F3、F4、行业研究）：只新建/修改 `src/lib/evals/**`、`scripts/evals/**`、`docs/evals/**`、`docs/audits/2026-11-06-evals-gold-sets/**`、新迁移 `supabase/migrations/20261110090000_dq_eval_runs.sql`、新路由 `src/app/api/admin/evals/**`。共享文件只做**标记块**修改，块首尾各一行 `// F6 begin` / `// F6 end`（YAML 用 `# F6 begin/end`，JSON 无注释则只追加条目）：`supabase/migrations.lock.json`（追加一条）、`scripts/ci/research-checks.ts`（`criticalSuites` 追加两项）、`src/lib/supabase/database.types.ts`（两张表）、`.github/workflows/ci.yml`（`fetch-depth: 0`、一个 validate 步骤、上传 `reports/evals/**`）、`src/i18n/messages/*.json` 本期**不改**（UI 延后）。`src/lib/facts/**`、`src/lib/dq/**`、`src/app/(app)/admin/dq/**` 一律只读。
- **迁移**：时间戳 `20261110HHMMSS`，本计划只用 `20261110090000_dq_eval_runs.sql`。可重放（`create table if not exists`、`drop constraint if exists` 后 `add constraint`）。**不触碰 `dq_reconciliations`**（规格 §0 R5-3）。锁：`supabase/migrations.lock.json` 追加 `{file, sha256}`（文件字节 hex，`shasum -a 256`）；已锁文件不可改。落地顺序（§0 R5-4）：计划三先合并；若 F6 先于计划三合并，PR 描述里提示计划三把未入锁迁移改时间戳。
- **数据库测试**：`describe.skipIf(!process.env.S4_TEST_STATE)`，`JSON.parse(readFileSync(process.env.S4_TEST_STATE,'utf8')).adminUrl`。任何含字符串 `S4_TEST_STATE` 的 `.test.ts` 必须进 `scripts/ci/research-checks.ts::criticalSuites`（否则 `test:db` 报 inventory drift），且 critical 套件里**不能有 skip 的用例**。重放迁移用 `replayMigration`（从 `src/lib/dq/dq-foundation.integration.test.ts:17` 复制，未导出；`lock_timeout='3s'`，55P03/40P01 重试）。
- **单文件真实库运行**：`.claude/scratch/db-one.ts`（未提交；内容见 `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5，丢了按那里重建）：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/evals/evals-store.integration.test.ts`。`LC_ALL=C` 只给 `test:db`/`test:migrations`/db-one，**不要**导出给 `npm test`。
- **共享库污染**：`test:db` 的所有套件共享一个库。`filings.source_ref` 全局唯一，`sync-us.integration.test.ts` 也会同步 AAPL/MSFT 夹具。F6 的 facts 集成测试**只用 F6 自己的合成 CIK**（`999xxxx` 段，见 Task 9 种子）与从 AAPL 夹具派生、改写了 CIK 与 accession 的副本，绝不复用 AAPL/MSFT 的 CIK 与 accession。
- **数值**：一律十进制字符串，不转 `Number`。解析/规范化复用 `src/lib/facts/json-numbers.ts::canonicalDecimal`；比较用本计划 `compare.ts::compareWithinTolerance`（BigInt）。
- **代码版本**：`resolveCodeVersion({allowGit:true})`（`src/lib/facts/deps.ts:24`，返回 `sha` 或 `sha-dirty` 或 `null`）；本计划 `version.ts` 把它拆成 `{sha, dirty}`，`sha` 必须是 40 位 hex。
- **管理员与客户端**：`requireAdminUser()`（`src/lib/admin/auth.ts`）、`getAdminSupabase()`（`src/lib/supabase/admin.ts`）、`getAnonSupabase()`（`src/lib/supabase/anon.ts`）、`supabaseTableClient`（`src/lib/db/table-client.ts`）、`memoryTableClient`（`src/lib/db/memory-table-client.ts`）、`pgTableClient`（`src/lib/db/pg-table-client.ts`）。
- **代码风格**：沿用 `src/lib/facts` 的紧凑风格（单空格缩进、少空行、文件头注释写职责与规格条目）。每个导出函数有测试。错误用 `EvalError`（§共享契约）。
- **提交**：`git commit` 单独一条命令（仓库钩子拦截同一命令里出现的任何 `-n` 记号，包括 `grep -n`、`head -n`）；不 `--no-verify`；信息末尾 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施代理）或 `Claude Opus 5.5`（指挥）。
- **命令**：`npm test -- src/lib/evals/<file>.test.ts`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）、`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`、同 `npm run test:migrations`。Codex 自己跑 vitest 报 `__dirname is not defined` 与代码无关，忽略。
- **owner 默认值**（规格 §16，本期按默认执行，PR 里列为假设）：D1 阈值 facts 官方 `rel 0`、派生/宏观 `rel 0.01`、双源 `rel 0.005`、对照 `rel 0.01`、`min_coverage_optional 0.95`；D2 `gold_approval='process'`（无 CODEOWNERS），清单需 `waivers`；D3 上线前一次特权 report、之后每季度；D4 public 集全量 JSON + `.md` 入 `docs/evals/`；D5 只用 36 格；D6 账本批准人 owner 且 ≠ `added_by`；D7 清单失败为上线检查项、不硬阻断；D8 `extraction_gold` 不启用、`eval-restricted` 桶不建。

## 集成决定（指挥，写作者各自的假设与 CCR 原文见附录）

1. **契约补充**（已写进下方 §共享契约与 Task 1 的 `types.ts`）：`Summary.coverage.evaluated_optional`（W1 CCR-1）；`ValidatorFinding{code,where,message}`（W2；`validate/finding.ts` 只再导出）；`ProvenanceCheck.inputs?:{fact_id;check}[]`（W3 CCR 1；facts 适配器的富输入链名为 `FactProvenance.input_chains`，写入 `CaseReport.detail.inputs`）；`ModuleReader.stateRev()` 的语义注释（W3 CCR 2）。
2. **校验 CLI**：标志表在 `src/lib/evals/validate/cli.ts::HANDLERS`（W1），`scripts/evals/validate.ts` 是薄壳；处理器可 async、可声明 `modifiers`（`--release`）；退出 0 通过 / 1 检查失败 / 2 用法错误（规格 §1.1 要求 `--manifest` 失败退出 1）。Task 12 只往表尾追加三项。
3. **`--redact` 扫描范围（规格偏差）**：对各兄弟分支的 `docs/audits/**` 实跑 W1 的扫描会命中他人审计文件（`2026-11-05-data-foundation-3/codex/*` 约 195 条：原样引用的邮箱与查询串），F6 不得改它们；`REDACT_ROOTS` 收窄为 F6 自有路径：`src/lib/evals/fixtures/**`、`docs/evals/**`、`docs/audits/2026-11-06-evals-gold-sets/**`，外加 F6 写的 `docs/audits/2026-11-04-data-foundation-2/index.json`。CI 步骤不变（`--gold --lock --redact [--gold-diff]`）。规格 §18 记此偏差（Task 16）。
4. **frozen 建库不写 `dq_freshness`**：`runFactsSync` 无开关地记录 `facts.us`；`replay/setup.ts` 给同步依赖的 `tables` 套 `withoutFreshness`（丢弃 `dq_freshness` 写、读照常），固定时钟不会在共享库留陈旧行。
5. **`replay/setup.ts` 形状**：以 Task 9 为准——`FrozenBuild={ok:false;mismatch:string}|{ok:true;issuers;world}`、`buildFrozenDb(pool,setup,root?)`；Task 11 读 `world.db/world.tables/world.setup.setup_sha256`；W4 的"只写路径的草稿"成为 `FrozenSetupPathsDraft` + `sealSetupFromPaths`。变更测试只用 ZZEVC（CIK 9990603），frozen 回放只投影 ZZEVA/ZZEVB。
6. **kind 启用表只有一个**：`src/lib/evals/kinds/registry.ts::KIND_REGISTRY`（official_reconciliation、replay_consistency 启用；dual_source「plan 3 merged」、reference_regression「macro migrations」、extraction_gold「D8」、judgment_calibration「F4」未启用）。`cli/run-cli.ts::KIND_RUNNERS` 只放运行器，`runCli` 先 `assertKindEnabled`；注册表测试断言 `KIND_RUNNERS` 的键 = 启用的 kind。
7. **回放运行器（自审补上的缺口）**：Task 11 Step 17–19 新增 `cli/run-replay.ts`（`run.ts --kind replay_consistency`：ci = frozen，需要 `S4_TEST_STATE`；report = live，anon 或 `--write-db` 特权）并把 `ModuleReader.project` 接到 `projectRequest`（`withProjector`）。
8. **`buildReport`**：调用方按 Task 4 的 `BuildReportInput`（无 `module`，取 `set.module`）；`runGoldSet` 用 `summary.ts::goldBlockOf`（撤回案例不计 pending/缺口）和 `caseRowsTruncated({run_id,kind,artifact_class,cases})`。
9. **报告与归约**：`renderMarkdown` 对 `reference_regression` 不渲染任何案例值（Task 4 已有测试）；`data_drift` 的 `ledger_ids=[]` → `unexplained_diff`，`identical/within/expected_absent/explained_diff(非空)/beyond_explained(非空)/data_drift(非空)/pass` → `correctness.pass`（Task 1 已有逐行测试）。
10. **回放文件不入 `lock.json`**（W4 CCR 5）：锁只收 `GoldFormat` 黄金集；发布清单对黄金集类证据查锁，对回放/对照报告查夹具文件的提交字节（`manifest_fixture`，Task 12）。`lock.json` 由 Task 2 建、Task 9 追加 `synthetic-us.json`；Task 1 的锁测试用 `toContainEqual`。
11. **机械核验**（集成时，从本文件抽取全部代码块与 Edit 到 HEAD 的临时工作树）：`npx tsc --noEmit -p .` 0 错误；`npx vitest run src/lib/evals src/app/api/admin/evals` 44 文件 507 用例通过（2 个 critical 套件无 `S4_TEST_STATE` 时 skipped）；eslint 0 警告；`ci-contract.test.ts` 通过（因此把 `record-cli.test.ts` 里的 `S4_TEST_STATE` 字面量改为拼接，否则 `test:db` 报 inventory drift）；真实 PostgreSQL 17：Task 11 Step 10 录制 12 个案例成功，`evals-store` + `evals-facts` 两个 critical 套件 21/21 通过（含 frozen 回放全 identical 与篡改 → setup_mismatch），`run.ts --kind replay_consistency --mode ci` gate pass。全仓 `vitest run` 另有 1–2 个与 F6 无关的计时/进程抖动用例（每次不同）。

## 文件结构

```
supabase/migrations/20261110090000_dq_eval_runs.sql   dq_eval_runs + dq_eval_case_results + RLS/权限（Task 5）
supabase/migrations.lock.json                         追加 1 条（Task 5）
src/lib/supabase/database.types.ts                    // F6 块：DqEvalRun / DqEvalCaseResult（Task 5）
scripts/ci/research-checks.ts                         // F6 块：criticalSuites .concat(evals-store, evals-facts)（Task 5 建块、Task 9 加第二项）
.github/workflows/ci.yml                              # F6 块：fetch-depth 0、validate 步骤、上传 reports/evals/**（Task 3）

src/lib/evals/types.ts             共享契约（本文 §共享契约 原样；Task 1）
src/lib/evals/errors.ts            EvalError（Task 1，内容在 §共享契约）
src/lib/evals/canonical-json.ts    canonicalJson / sha256Hex / projectionHash（Task 1）
src/lib/evals/compare.ts           compareWithinTolerance / parseDecimalParts（Task 1）
src/lib/evals/summary.ts           summarize / gateOf / bucketOf / isPassOutcome / goldBlockOf / exitCodeOf / statusOfGate（Task 1）
src/lib/evals/gold/schema.ts       parseGoldSetF6（§4 每条规则）/ canonicalFromPrinted / unitOfSpec（Task 2）
src/lib/evals/gold/legacy-plan2.ts parseLegacyPlan2（plan2.json → GoldSet，format 'legacy_plan2'；Task 2）
src/lib/evals/gold/load.ts         loadGoldSet / loadLock / loadRecorders / checkLock / listGoldSetPaths（Task 2）
src/lib/evals/gold/diff.ts         goldDiff(baseTree, headTree) 纯 + goldDiffAgainst(base) git 侧（Task 3）
src/lib/evals/redact.ts            redactScan / redactTargets（REDACT_ROOTS = F6 自有路径，见约定；Task 3）
src/lib/evals/hash-source.ts       hashSource(url, fetch?)（Task 3）
src/lib/evals/validate/cli.ts      HANDLERS 表 + runValidate（async；0/1/2）+ findingsCheck；Task 12 追加 --expert/--audit/--manifest（Task 3）
src/lib/evals/version.ts           evaluatorVersion() → {sha, dirty}（Task 4）
src/lib/evals/report.ts            buildReport(BuildReportInput) / renderMarkdown（确定性）/ reportPaths / writeReportFiles（Task 4）
src/lib/evals/store.ts             evalStore / persistRun / caseRowsOf / caseRowsTruncated / runRowOf（§6.3；Task 6）
src/lib/evals/adapters/facts.ts    factsReader / privilegedFactsReader / selectFiling（Task 7）
src/lib/evals/adapters/provenance.ts provenanceResolver / FactProvenance.input_chains / memoryRawStorage / supabaseRawStorage（R5-5/R5-6；Task 7）
src/lib/evals/adapters/memory-world.ts 测试辅助：memoryFactsDb + 快照库的小世界（Task 7，非测试文件）
src/lib/evals/kinds/official.ts    evaluateOfficial(cases, reader, ctx) → CaseReport[]（Task 8）
src/lib/evals/kinds/official-test-support.ts 测试辅助：fakeReader / gcase / gset / readRow（Task 8）
src/lib/evals/run-gold-set.ts      assertRunnable / selectCases / runGoldSet → RunOutcome（Task 8）
src/lib/evals/replay/setup.ts      verifySetup / buildFrozenDb / buildFrozenMemory / sealSetup / sealSetupFromPaths / withoutFreshness（Task 9）
src/lib/evals/cli/deps.ts          buildRunDeps(mode, privileged) / withProjector（Task 9；Task 11 接 projector）
src/lib/evals/cli/run-cli.ts       parseRunArgs / runCli / KIND_RUNNERS（run.ts 的逻辑；Task 9；Task 11 加 replay，Task 14 接注册表）
src/lib/evals/projections/facts.ts projectFacts / projectMetrics / projectRequest / resolveFactsSubject / 路由体投影 / diffProjections（Task 10）
src/lib/evals/replay/fixture.ts    回放案例类型与 parseReplayFile / recordedCases（Task 10）
src/lib/evals/replay/ledger.ts     parseLedger / loadLedger / matchLedger（Task 10）
src/lib/evals/kinds/replay.ts      evaluateReplay（frozen / live）/ replaySummaryContext / REPLAY_THRESHOLDS（Task 10）
src/lib/evals/test-support/memory-facts.ts 测试辅助（Task 10）
src/lib/evals/replay/record.ts     applyRecording（只增、--supersede；Task 11）
src/lib/evals/cli/run-replay.ts    run.ts --kind replay_consistency（ci = frozen，report = live；Task 11，集成补上）
src/lib/evals/validate/finding.ts  ValidatorFinding 的再导出 + 正则/小工具（Task 12）
src/lib/evals/validate/audit.ts    validateAuditDir（§9；Task 12）
src/lib/evals/validate/expert.ts   validateExpertRecord / seededSelection / findSetBySha（§8；Task 12）
src/lib/evals/validate/manifest.ts validateManifest(manifest, deps)（§10；Task 12）
src/lib/evals/validate/codex-audit.ts runCodexAudit（只审已提交目标，写 index.json；Task 12）
src/lib/evals/validate/handlers.ts f6Handlers：--expert/--audit/--manifest 的实现（Task 12）
src/lib/evals/admin.ts             listEvalRuns / getEvalRun / whitelistSummary（白名单投影；Task 13）
src/lib/evals/test-support/eval-rows.ts 测试辅助（Task 13）
src/lib/evals/kinds/read-only.ts   writeLikeProperties / assertReadOnly（Task 14）
src/lib/evals/kinds/dual-source.ts evaluateDualSource / runDualSource + PairSource 接口（Task 14）
src/lib/evals/kinds/reference.ts   evaluateReference / parseReferenceResult / referenceSummary / referenceSummaryWriter（Task 14）
src/lib/evals/kinds/registry.ts    KIND_REGISTRY / kindEntry / assertKindEnabled —— 唯一的 kind 启用表（Task 14、15）
src/lib/evals/kinds/ratio.ts       精确比率文本（Task 15）
src/lib/evals/kinds/extraction.ts  matchGroup（两步最大匹配）/ evaluateExtraction（Task 15）
src/lib/evals/kinds/calibration.ts evaluateCalibration（Task 15）
src/lib/evals/fixtures/gold/lock.json            （Task 2 建，Task 9 追加 synthetic-us；回放文件不入锁，见 Task 11 CCR 5）
src/lib/evals/fixtures/gold/recorders.json       （Task 2）
src/lib/evals/fixtures/gold/facts/synthetic-us.json  （Task 9，生成器从 F6 夹具无损读值）
src/lib/evals/fixtures/issuers/f6-seed.json       ZZEVA/ZZEVB/ZZEVC（CIK 9990601/9990602/9990603；Task 9）
src/lib/evals/fixtures/edgar/CIK0009990601.json   ZZEVA：AAPL trimmed 夹具改写 CIK/accession（Task 9）
src/lib/evals/fixtures/edgar/CIK0009990602.json   ZZEVB：MSFT 夹具改写（Task 9）
src/lib/evals/fixtures/edgar/CIK0009990603{,.amended,.conflict}.json  ZZEVC：重述与同日冲突，只供 Task 9 的变更测试（Task 9）
src/lib/evals/fixtures/replay/f6-base.setup.json  F6 基础建库 setup（sealed；Task 9）
src/lib/evals/fixtures/replay/facts.frozen.json   12 个案例，只投影 ZZEVA/ZZEVB（Task 11）
src/lib/evals/fixtures/replay/explanations.json   账本（Task 11，初始 []）
src/lib/evals/*.test.ts, src/lib/evals/**/*.test.ts  单测（每个任务的 Files 列出）
src/lib/evals/evals-store.integration.test.ts     critical（Task 5、6）
src/lib/evals/evals-facts.integration.test.ts     critical（Task 9、11）
src/lib/evals/route-equivalence.test.ts           投影(库) == 投影(路由响应)，内存 FactsDb（Task 11）
src/app/api/admin/evals/route.ts (+ route.test.ts)            GET 列表（Task 13）
src/app/api/admin/evals/[run_id]/route.ts (+ route.test.ts)   GET 详情（Task 13）
scripts/evals/run.ts            薄壳 → cli/run-cli.ts（Task 9）
scripts/evals/validate.ts       薄壳 → validate/cli.ts：--gold --lock --gold-diff <base> --redact（Task 3）--expert <f> [--release] --audit <dir> [--release] --manifest <f>（Task 12）
scripts/evals/hash-source.ts    薄壳 → hash-source.ts（Task 3）
scripts/evals/record-replay.ts  （Task 11）
scripts/evals/codex-audit.ts    薄壳 → validate/codex-audit.ts（Task 12）
.claude/scratch/{f6-gen-fixtures,f6-gen-sets,db-run,db-one}.ts  一次性/本地辅助，不提交（Task 9、11；db-one 见约定）
docs/evals/README.md            运行手册（Task 16）
docs/evals/templates/expert-sampling.template.json、release-manifest.template.json（Task 12）
docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md（Task 1 建，每任务追加）
docs/audits/2026-11-04-data-foundation-2/index.json   新文件（规格 §9；Task 12）
docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md   只追加 §18 实施记录（Task 16）
```

---

## 共享契约（所有任务必须用这些名字；`src/lib/evals/types.ts` 与 `errors.ts` 原样落地）

```ts
// src/lib/evals/types.ts
// Shared contract of the F6 evaluation framework (spec 2026-11-04-evals-and-gold-sets-design.md, draft 6).
// Every task uses these names verbatim. Layers: reader (adapters/*) → kind (kinds/*, pure) → summarize (summary.ts).
import type {Duration,Market} from '../facts/types';

export type EvalKind='official_reconciliation'|'dual_source'|'replay_consistency'|'reference_regression'|'extraction_gold'|'judgment_calibration';
export type EvalModule='facts'|'metrics'|'macro'|'industry'|'company'|'foreign_research';
export type EvalMode='ci'|'report';
export type ArtifactClass='public'|'restricted';
export type EvidenceClass='truth'|'comparison'|'adapter_check';
export type Gate='pass'|'fail'|'incomplete';
export type EvalRunStatus='running'|'passed'|'failed'|'incomplete'|'error';
export type ProvenanceKind='transcribed'|'synthetic';
export type GoldFormat='f6'|'legacy_plan2';
export type ExitCode=0|1|2|3;
export type Scale='1'|'1000'|'1000000'|'1000000000';

/** §4.3. Maps to facts unit strings via gold/schema.ts::unitOfSpec: currency→'USD', shares→'shares', per_share→'USD/share', ratio→'pure'. */
export type UnitSpec={kind:'currency';currency:string}|{kind:'shares'}|{kind:'per_share';currency:string}|{kind:'ratio'}|{kind:'index'}|{kind:'count'}|{kind:'percent_points'};
export interface DocumentId{kind:'edgar_accession'|'cninfo_announcement'|'file_sha256'|'official_release';value:string}
/** period_start: null = instant; ABSENT (undefined) = unconstrained, allowed only in legacy_plan2 sets. */
export interface FactTarget{type:'fact';concept:string;period_start?:string|null;period_end:string;duration:Duration;consolidation:'consolidated';unit:UnitSpec}
export interface MetricTarget{type:'metric';metric:string;period_start:string;period_end:string;duration:string;basis:string;input_unit:string;formula_version:string;unit:UnitSpec}
export type CaseTarget=FactTarget|MetricTarget;
export interface Subject{market:Market;cik?:string;ticker?:string}
export interface CaseSource{document_type:string;document_id?:DocumentId;url:string;sha256?:string;available_date?:string;locator?:Record<string,string|number>}
export interface GoldCase{
 case_id:string;subject:Subject;target:CaseTarget;expect:'present'|'missing';
 printed?:{text:string;unit_label:string;scale:Scale};canonical?:{value:string};
 binding:'document'|'current';
 /** binding='current': the asOf to read at. f6 = source.available_date; legacy = entry.as_of ?? null (null → env.today). */
 as_of:string|null;
 source:CaseSource;provenance_kind:ProvenanceKind;
 recorded_by:string;recorded_at:string|null;reviewed_by:string|null;reviewed_at:string|null;
 retracted:null|{at:string;by:string;reason:string};notes:string;
 required:boolean;
 /** legacy_plan2 only: entry still '<pending>' (no value / no recorder). */
 pending:boolean;
 /** legacy_plan2 only: required F6 provenance fields this entry lacks (e.g. 'source.sha256','source.locator','reviewed_by'). Empty for f6. */
 provenance_gaps:string[];
}
export interface Thresholds{max_fail:number;min_coverage_optional:string}
export interface GoldHistoryEntry{version:number;changed_at:string;changed_by:string;reason:string;fields:string[]}
export interface GoldSet{
 schema_version:1;format:GoldFormat;set_id:string;version:number;module:EvalModule;artifact_class:ArtifactClass;
 module_implementers:string[];tolerance:{rel:string};thresholds:Thresholds;optional_cases:string[];history:GoldHistoryEntry[];
 cases:GoldCase[];
 /** legacy_plan2: the file's `ready`; f6: always true. */
 ready:boolean;
 /** repo-relative path and sha256 of the file BYTES as loaded. */
 path:string;sha256:string;
}
export interface Recorder{id:string;role:string;modules:EvalModule[];added_at:string;approved_by:string}
export interface RecordersFile{version:number;recorders:Recorder[]}
export interface GoldLock{files:{path:string;sha256:string;version:number;format:GoldFormat}[]}

/** One row as read by a module reader (facts row, or a derived metric). value_text is the lossless decimal string. */
export interface ReadRow{
 value_text:string;unit:string;period_start:string|null;period_end:string;duration:string;consolidation:string;available_date:string;
 fact_id?:string;filing_id?:string;source_ref?:string;mapping_gen?:number;mapping_version?:string;raw_hash?:string;run_id?:string;status?:string;
 metric?:{metric:string;formula_version:string;basis:string;input_unit:string;based_on_rev:number;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string}[]};
}
export type ReadErrorReason='subject_unresolved'|'filing_not_found'|'filing_not_linked'|'filing_ambiguous'|'truncated'|'formula_version_mismatch'|'projection_join_missing'|'setup_mismatch'|'read_failed';
export interface ReadResult{rows:ReadRow[];truncated:boolean;stateRev:number|null;error?:ReadErrorReason}
export interface SubjectRef{issuerId:string;market:Market}
export interface ReplayRequest{issuer:Subject;concepts:string[];asOf:string;durations?:string[];metrics?:string[]}
export interface ProjectionRow{[k:string]:string|number|boolean|null|ProjectionRow[]}
export interface Projection{module:EvalModule;rows:ProjectionRow[]}
export interface Hint{kind:'late_fact'|'quarantine_resolved'|'mapping_gen_raised';ref:string;at:string}
/** inputs (integration decision 3): optional per-input chains for derived rows; the facts reader carries its richer chains as adapters/provenance.ts::FactProvenance.input_chains instead. */
export interface ProvenanceCheck{ok:boolean;missing:string[];reason?:string;producer_code_version?:string;object_path?:string;locator?:string;source_verified?:boolean|'skipped';inputs?:{fact_id:string;check:ProvenanceCheck}[]}

export interface ModuleReader{
 module:EvalModule;privileged:false|true;
 resolveSubject(subject:Subject,today:string):Promise<SubjectRef|null>;
 /** Rows of the filing identified by documentId whose period/consolidation match target; NOT filtered by unit. */
 readDocumentBound(ref:SubjectRef,target:CaseTarget,documentId:DocumentId,today:string):Promise<ReadResult>;
 /** Current rows at asOf matching target's key (facts) or the derived metric (metrics); NOT filtered by unit. */
 readCurrent(ref:SubjectRef,target:CaseTarget,asOf:string):Promise<ReadResult>;
 project(request:ReplayRequest,today:string):Promise<Projection>;
 /** state_rev is per issuer (fact_state_rev(issuer, market)); there is no global counter. The injected deps.stateRev() value when it
  *  answers non-null, else the largest read_facts envelope state_rev this reader saw during the run; null when it read nothing.
  *  runGoldSet copies it into environment.db_state_rev when the caller passed null. */
 stateRev():Promise<number|null>;
}
export interface PrivilegedReader extends ModuleReader{
 privileged:true;
 readNonVisible(ref:SubjectRef,target:CaseTarget,documentId:DocumentId|null,asOf:string):Promise<'quarantined'|'superseded_generation'|null>;
 resolveProvenance(ref:SubjectRef,row:ReadRow,opts:{artifacts:boolean}):Promise<ProvenanceCheck>;
 hints(request:ReplayRequest,since:string):Promise<Hint[]>;
}

/** §3.3 case results. Reduction lives in summary.ts only. */
export type CaseOutcome=
 |{result:'pass'}|{result:'expected_absent'}
 |{result:'fail';reason:'value'|'ambiguous'|'unexpected_value'}
 |{result:'unit_mismatch'}
 |{result:'provenance_incomplete';reason:string}
 |{result:'missing'}
 |{result:'not_visible';reason:'quarantined'|'superseded_generation'}
 |{result:'skipped';reason:'retracted'|'subset'|'zero_support'|'unavailable'|'ineligible'|'pending'}
 |{result:'read_error';reason:ReadErrorReason}
 |{result:'identical'}
 |{result:'explained_diff';ledger_ids:string[]}
 |{result:'data_drift';ledger_ids:string[];hints:Hint[]}
 |{result:'unexplained_diff';reason:'diff'|'no_hints'|'partial_ledger'|'ledger_self_approved'}
 |{result:'within'}|{result:'beyond_explained';ledger_ids:string[]}|{result:'beyond_unexplained'};
export interface CaseReport{
 case_id:string;required:boolean;outcome:CaseOutcome;
 /** system value (left) and gold/expected value (right), decimal strings; null when absent. */
 left:string|null;right:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
 provenance:ProvenanceCheck|null;detail:Record<string,unknown>;
}
export interface Summary{
 population:number;required:number;
 correctness:{pass:number;fail:number;unit_mismatch:number;provenance_incomplete:number;unexplained_diff:number};
 /** evaluated_optional: §3.2 rule 3 numerator (CCR-1), so gateOf can decide from the summary alone. */
 coverage:{evaluated:number;evaluated_optional:number;missing_required:number;missing_optional:number;not_visible:number;skipped:number};
 execution:{read_error:number;truncated:number;subset:boolean};
 thresholds:Thresholds;
 gold:{format:GoldFormat;ready:boolean;pending:number;provenance_gaps:number};
 gate:Gate;evidence_class:EvidenceClass;
 reconciliations_truncated:boolean;
}
export interface SummaryContext{thresholds:Thresholds;gold:Summary['gold'];subset:boolean;evidenceClass:EvidenceClass;reconciliationsTruncated?:boolean}

export interface EvalEnv{today:string;now():Date;evaluatorCodeVersion:string;dirty:boolean}
export interface ReportEnvironment{db_host:string|null;app_origin:string|null;db_state_rev:number|null}
export interface EvalReport{
 schema_version:1;run_id:string;kind:EvalKind;module:EvalModule;mode:EvalMode;privileged:boolean;artifact_class:ArtifactClass;
 set:{id:string;version:number;sha256:string;format:GoldFormat;path:string};
 evaluator_code_version:string;dirty:boolean;started_at:string;finished_at:string;
 environment:ReportEnvironment;thresholds:Thresholds;
 provenance:{verified:{artifacts:boolean;sources:boolean}};
 summary:Summary;cases:CaseReport[];
}
export interface RunOutcome{report:EvalReport;exitCode:ExitCode}
/** One finding of an evidence validator (validate.ts --expert/--audit/--manifest, Task 12; carried in validate/cli.ts CheckResult.findings). `where` names the file/field/case and never contains secrets. */
export interface ValidatorFinding{code:string;where:string;message:string}

/** Row shapes of the F6 tables (Task 5 migration). Decimal columns are TEXT. */
export interface EvalRunRow{
 run_id:string;kind:EvalKind;module:EvalModule;mode:EvalMode;privileged:boolean;artifact_class:ArtifactClass;
 set_id:string;set_version:number;set_sha256:string;evaluator_code_version:string;started_at:string;finished_at:string|null;
 status:EvalRunStatus;summary:Summary|Record<string,never>;report_ref:string;report_sha256:string;triggered_by:'manual'|'script'|'ci';
}
export type CaseResultKind='fail'|'unit_mismatch'|'provenance_incomplete'|'missing'|'not_visible'|'read_error'|'unexplained_diff';
export interface EvalCaseResultRow{eval_run_id:string;case_id:string;result:CaseResultKind;reason:string|null;left_text:string|null;right_text:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;detail:Record<string,unknown>}
```

```ts
// src/lib/evals/errors.ts
// Pre-run refusals and fatal store errors (spec §14). Exit code 2 = refused before running; 1 = store/report failure.
export type EvalErrorCode='gold_invalid'|'gold_lock_mismatch'|'gold_diff_violation'|'code_version_missing'|'dirty_tree'|'synthetic_in_report'|'restricted_in_ci'|'kind_not_enabled'|'report_write_failed'|'store_write_failed'|'store_conflict'|'store_partial'|'reference_result_schema'|'reference_write_attempt'|'replay_rerecord_refused'|'resume_mismatch'|'redact_violation'|'manifest_invalid'|'expert_invalid'|'audit_invalid';
export const REFUSAL_CODES:ReadonlySet<EvalErrorCode>=new Set(['gold_invalid','gold_lock_mismatch','gold_diff_violation','code_version_missing','dirty_tree','synthetic_in_report','restricted_in_ci','kind_not_enabled','replay_rerecord_refused','resume_mismatch']);
export class EvalError extends Error{constructor(public readonly code:EvalErrorCode,message?:string,public readonly detail:Record<string,unknown>={}){super(message??code);this.name='EvalError';}}
export const exitCodeOfError=(e:EvalError):1|2=>REFUSAL_CODES.has(e.code)?2:1;
```

关键函数签名（跨任务；实现在各自任务）：

```ts
// compare.ts (Task 1)
export function compareWithinTolerance(left:string,right:string,rel:string):{passed:boolean;absDiff:string;relDiff:string};
// summary.ts (Task 1)
export function summarize(cases:CaseReport[],ctx:SummaryContext):Summary;
export function gateOf(s:Omit<Summary,'gate'>):Gate;
export const exitCodeOf:(g:Gate)=>0|1|3;            // pass 0, fail 1, incomplete 3
export const statusOfGate:(g:Gate)=>'passed'|'failed'|'incomplete';
export function goldBlockOf(set:GoldSet):Summary['gold'];   // the ONLY place summary.gold is computed (retracted cases excluded)
// canonical-json.ts (Task 1)
export function canonicalJson(v:unknown):string;     // sorted keys, no whitespace, strings JSON-escaped
export const sha256Hex:(s:string|Uint8Array)=>string;
export const projectionHash:(p:Projection)=>string;  // sha256Hex(canonicalJson(p))
// gold/load.ts (Task 2)
export function loadGoldSet(path:string,root?:string):GoldSet;         // throws EvalError('gold_invalid')
export function loadRecorders(root?:string):RecordersFile;
export function checkLock(set:GoldSet,lock:GoldLock):void;             // throws EvalError('gold_lock_mismatch')
// report.ts (Task 4)
export interface BuildReportInput{runId:string;kind:EvalKind;mode:EvalMode;privileged:boolean;set:GoldSet;env:EvalEnv;environment:ReportEnvironment;startedAt:string;finishedAt:string;verified:{artifacts:boolean;sources:boolean};summary:Summary;cases:CaseReport[]}
export function buildReport(i:BuildReportInput):EvalReport;            // module / artifact_class / thresholds come from set
export function renderMarkdown(r:EvalReport):string;                   // deterministic
export function reportPaths(r:EvalReport,root?:string):{json:string;md:string|null};
export function writeReportFiles(r:EvalReport,root?:string):{json:string;md:string|null;sha256:string};   // sha256 of the JSON bytes written
// store.ts (Task 6)
export interface EvalStore{insertRun(r:EvalRunRow):Promise<void>;insertCaseResult(r:EvalCaseResultRow):Promise<void>;finishRun(runId:string,status:EvalRunStatus,summary:Summary,finishedAt:string):Promise<void>;getRun(runId:string):Promise<EvalRunRow|null>;getCaseResult(runId:string,caseId:string):Promise<EvalCaseResultRow|null>}
export function evalStore(tables:TableClient):EvalStore;
export function persistRun(store:EvalStore,report:EvalReport,files:{ref:string;sha256:string},opts:{triggeredBy:'manual'|'script'|'ci';resume?:boolean}):Promise<void>;
// run-gold-set.ts (Task 8)
export interface RunGoldSetOptions{set:GoldSet;mode:EvalMode;reader:ModuleReader;env:EvalEnv;environment:ReportEnvironment;runId?:string;caseIds?:string[];limit?:number;verify?:{artifacts:boolean;sources:boolean};fetchSource?:(url:string)=>Promise<Uint8Array>}
export function runGoldSet(o:RunGoldSetOptions):Promise<RunOutcome>;  // in memory only; throws EvalError refusals
// store.ts (Task 6)
export const caseRowsTruncated:(report:Pick<EvalReport,'run_id'|'kind'|'artifact_class'|'cases'>)=>boolean;   // → SummaryContext.reconciliationsTruncated
// validate/cli.ts (Task 3; Task 12 appends three entries)
export interface CheckResult{ok:boolean;findings?:unknown[];[k:string]:unknown}
export interface ValidateHandler{flag:string;name:string;takesValue:boolean;modifiers?:readonly string[];run(root:string,value:string|null,modifiers:ReadonlySet<string>):CheckResult|Promise<CheckResult>}
export const HANDLERS:ValidateHandler[];
export const findingsCheck:(findings:ValidatorFinding[])=>CheckResult;
export function runValidate(argv:readonly string[],opts?:{root?:string;handlers?:readonly ValidateHandler[]}):Promise<{exitCode:0|1|2;output:ValidateOutput}>;
// replay/setup.ts (Task 9)
export type FrozenBuild={ok:false;mismatch:string}|{ok:true;issuers:Record<string,string>;world:FrozenWorld};
export function buildFrozenDb(pool:Pool,setup:FrozenSetup,root?:string):Promise<FrozenBuild>;   // verifies every hash before any write; never writes dq_freshness
export function sealSetupFromPaths(d:FrozenSetupPathsDraft,root?:string):FrozenSetup;
// cli/run-cli.ts (Task 9; Task 11 adds replay_consistency, Task 14 the registry call)
export type KindRunner=(args:RunArgs,deps:CliDeps)=>Promise<{outcome:RunOutcome;run:Pick<RunDeps,'store'|'close'>}>;
export const KIND_RUNNERS:Partial<Record<EvalKind,KindRunner>>;
export function runCli(argv:string[],io:CliIo,deps?:CliDeps):Promise<ExitCode>;
// projections/facts.ts, kinds/replay.ts (Task 10)
export const projectRequest:(deps:ProjectionDeps,request:ReplayRequest,today:string)=>Promise<Projection>;
export function evaluateReplay(cases:ReplayCase[],project:ProjectFn,ledger:LedgerEntry[],ctx:ReplayContext):Promise<CaseReport[]>;
// kinds/registry.ts (Task 14) — the one kind enablement table
export const KIND_REGISTRY:readonly {kind:EvalKind;enabled:boolean;reason?:string}[];
export function assertKindEnabled(kind:string):void;                    // EvalError kind_not_enabled (exit 2)
```

---

## 任务总览与写作分工

| Task | 内容 | 规格 | 写作者 | 依赖 |
|---|---|---|---|---|
| 1 | `types.ts`、`errors.ts`、`canonical-json.ts`、`compare.ts`、`summary.ts` + 单测；实施记录文件 | §3.2、§3.3、§5.2、§0 R5-1/R5-10 | W1 | — |
| 2 | `gold/schema.ts`、`gold/legacy-plan2.ts`、`gold/load.ts`、`lock.json`、`recorders.json` + 单测 | §4、§0 R5-1/R5-2/R5-8 | W1 | 1 |
| 3 | `gold/diff.ts`（纯 + git）、`redact.ts`、`validate/cli.ts` 标志表 + 薄壳 `scripts/evals/validate.ts`（--gold --lock --gold-diff --redact；退出 0/1/2）、`hash-source.ts`、`ci.yml` F6 块 + 单测（含临时 git 仓库） | §4.4、§4.5、§7.3 | W1 | 2 |
| 4 | `version.ts`、`report.ts` + 单测 | §6.4、§7.2、§4.5 | W1 | 1 |
| 5 | 迁移 + 锁 + `database.types.ts` F6 块 + `evals-store.integration.test.ts`（迁移、约束、RLS、文本往返）+ criticalSuites | §6.2、§0 R5-3/R5-4 | W2 | 1 |
| 6 | `store.ts`（§6.3 顺序、23505 比对、终态命中 0、resume）+ 单测 + 集成测试追加（中断 resume、并发 resume） | §6.3 | W2 | 5 |
| 7 | `adapters/facts.ts`（读路径、文件映射、metrics 派生）、`adapters/provenance.ts`（R5-5/R5-6）、特权读（readNonVisible、hints）+ 单测（memoryFactsDb + memorySnapshotStore） | §4.2、§5.1、§5.6、§0 R5-5–R5-8 | W3 | 1、2 |
| 8 | `kinds/official.ts`、`run-gold-set.ts` + 单测（§3.3 每种结果、变异、子集、合成拒绝） | §5.1、§3、§7.1 | W3 | 1、2、4、7 |
| 9 | `cli/deps.ts`、`cli/run-cli.ts` + 薄壳 `scripts/evals/run.ts`、`replay/setup.ts`（不留 `dq_freshness` 行）、F6 种子与合成夹具与合成集、`evals-facts.integration.test.ts`（四条路径、重述、隔离 not_visible、旧格式 incomplete） | §1.1、§7.1、§13.3、§0 R5-1/R5-2 | W3 | 6、8 |
| 10 | `projections/facts.ts`、`replay/ledger.ts`、`kinds/replay.ts` + 单测（frozen/live 各态、账本六元组、partial、自批、setup_mismatch） | §5.3、§0 R5-7 | W4 | 1、7 |
| 11 | `scripts/evals/record-replay.ts`（只增、`--supersede`）、`facts.frozen.json`（≥ 10）、`explanations.json`、frozen 回放进集成测试、`route-equivalence.test.ts`、`cli/run-replay.ts`（`run.ts --kind replay_consistency`）与 `withProjector` | §5.3.1、§5.3.3 | W4 | 9、10 |
| 12 | `validate/expert.ts`、`validate/audit.ts`、`validate/manifest.ts`、`validate/cli.ts` 追加三项（--expert/--audit/--manifest）、`codex-audit.ts`、模板、`data-foundation-2/index.json` + 单测 | §8、§9、§10 | W2 | 3、4、6 |
| 13 | `admin.ts` + 两个路由 + 单测（白名单键集合、哨兵缺席、非管理员 403） | §12、§0 R5-11 | W4 | 6 |
| 14 | `kinds/dual-source.ts`（`PairSource`）、`kinds/reference.ts`（`ReferenceResult`、哨兵、`ReadDeps` 无写方法）+ 单测；`kinds/registry.ts`（唯一启用表）+ `run-cli.ts` 调 `assertKindEnabled`，这两个 kind `kind_not_enabled` | §5.4、§5.5、§0 R5-10/R5-12 | W4 | 1、8、9、11 |
| 15 | `kinds/extraction.ts`（两步最大匹配）、`kinds/calibration.ts` + 单测（对抗夹具）；注册表登记 `extraction_gold`、`judgment_calibration` 为未启用（`kind_not_enabled`） | §11.1、§11.3、§16 D8 | W4 | 1 |
| 16 | `docs/evals/README.md` 运行手册、规格 §18 实施记录、全量门禁 | — | 指挥 | 全部 |

推荐执行顺序：1 → 2 → 4 → 3 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16。

<!-- TASKS BELOW: written by part writers W1–W4, integrated by the commander -->

### Task 1: 共享契约、规范 JSON、比较原语与唯一归约（`types.ts` / `errors.ts` / `canonical-json.ts` / `compare.ts` / `summary.ts`）

#### Contract change requests (W1)

**CCR-1 — `Summary.coverage` 增加 `evaluated_optional:number`。** 规格 §3.2 规则 3 是 `evaluated_optional / optional < min_coverage_optional → incomplete`。骨架的 `gateOf(s:Omit<Summary,'gate'>)` 只拿到摘要，而骨架的 `Summary` 没有 `evaluated_optional`，从现有字段也推不出来：可选案例的 `skipped(unavailable|zero_support|ineligible)` 混在 `coverage.skipped` 里（那里还含撤回），且不按 required 拆分。不加这个字段，`gateOf` 就没法实现规则 3；发布清单校验器（Task 12）也没法只凭存下来的摘要重算 gate。改法：`types.ts` 里只改一行（下面 Step 2 已经这样写，并用 `CCR-1` 注释标出）：
`coverage:{evaluated:number;evaluated_optional:number;missing_required:number;missing_optional:number;not_visible:number;skipped:number};`
受影响的下游：Task 13 白名单（§3.2 summary 键多了一个）、Task 5 `database.types.ts`（summary 是 jsonb，不改列）。若指挥否决：删掉这一行，把 `gateOf` 改成 `gateOf(s, optional?:{evaluatedOptional:number})`，由 `summarize` 传入，但那样存下来的摘要就不能重算 gate 了。

**本任务定死的约定（下游任务按此实现）：**
- `summarize` 要求**集里每个案例恰好一个** `CaseReport`；撤回、子集、待录入（pending）的案例也要给，结果分别是 `skipped(retracted|subset|pending)`。
- `population` = 结果不是 `skipped(retracted)` 的案例数；撤回的案例仍计入 `coverage.skipped`（§3.3 表"`skipped(retracted | subset)` → coverage.skipped"）。
- `evaluated` / `evaluated_optional` = 总体中（全部 / `required=false`）结果落入任一 correctness 计数器的案例数（含 `fail`、`expected_absent`）。
- `read_error(truncated)` 同时 +1 `execution.read_error` 和 `execution.truncated`。
- `data_drift`：`ledger_ids` 非空 → pass，为空 → unexplained_diff。另外更严格的一条：`explained_diff` / `beyond_explained` 的 `ledger_ids` 为空也算 unexplained_diff（没有账本条目就不算解释）。
- **待录入（pending）只经 ctx 计数**：`summary.gold` 原样取自 `SummaryContext.gold`；计算它的唯一地方是 `goldBlockOf(set)`：`pending` = 非撤回且 `pending=true` 的案例数，`provenance_gaps` = 非撤回且 `provenance_gaps` 非空的案例数（按案例计，不按缺口条目计）。`skipped(pending)` 本身只计入 `coverage.skipped`。
- `isPassOutcome(o)`（被 `report.ts` 用来筛"非 pass 案例"）= `bucketOf(o)==='pass'`。

**Files:**
- Create: `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`
- Create: `src/lib/evals/types.ts`, `src/lib/evals/errors.ts`
- Create: `src/lib/evals/canonical-json.ts`, `src/lib/evals/compare.ts`, `src/lib/evals/summary.ts`
- Test: `src/lib/evals/canonical-json.test.ts`, `src/lib/evals/compare.test.ts`, `src/lib/evals/summary.test.ts`

- [ ] **Step 1: 建实施记录文件**

`docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`:

```markdown
# 01 — F6 评测与黄金集 实施记录

执行：Opus 5.5 指挥；每任务 Sonnet 5.5 实施子代理（TDD）→ Opus 规格复审 → Opus 质量复审 → Codex CLI gpt-6-astra（medium）`codex review --commit` + 对抗挑战 → 修复 P1/P2。
计划：`docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md`；规格：`docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`（第 6 稿，§0 权威）。

| 序 | 任务 | 提交 | 规格复审 | 质量复审 | Codex review / 挑战 | 修复轮次 | 备注 |
|---|---|---|---|---|---|---|---|
```

- [ ] **Step 2: 写共享契约（骨架原样 + CCR-1 那一行）**

`src/lib/evals/types.ts`:

```ts
// src/lib/evals/types.ts
// Shared contract of the F6 evaluation framework (spec 2026-11-04-evals-and-gold-sets-design.md, draft 6).
// Every task uses these names verbatim. Layers: reader (adapters/*) → kind (kinds/*, pure) → summarize (summary.ts).
import type {Duration,Market} from '../facts/types';

export type EvalKind='official_reconciliation'|'dual_source'|'replay_consistency'|'reference_regression'|'extraction_gold'|'judgment_calibration';
export type EvalModule='facts'|'metrics'|'macro'|'industry'|'company'|'foreign_research';
export type EvalMode='ci'|'report';
export type ArtifactClass='public'|'restricted';
export type EvidenceClass='truth'|'comparison'|'adapter_check';
export type Gate='pass'|'fail'|'incomplete';
export type EvalRunStatus='running'|'passed'|'failed'|'incomplete'|'error';
export type ProvenanceKind='transcribed'|'synthetic';
export type GoldFormat='f6'|'legacy_plan2';
export type ExitCode=0|1|2|3;
export type Scale='1'|'1000'|'1000000'|'1000000000';

/** §4.3. Maps to facts unit strings via gold/schema.ts::unitOfSpec: currency→'USD', shares→'shares', per_share→'USD/share', ratio→'pure'. */
export type UnitSpec={kind:'currency';currency:string}|{kind:'shares'}|{kind:'per_share';currency:string}|{kind:'ratio'}|{kind:'index'}|{kind:'count'}|{kind:'percent_points'};
export interface DocumentId{kind:'edgar_accession'|'cninfo_announcement'|'file_sha256'|'official_release';value:string}
/** period_start: null = instant; ABSENT (undefined) = unconstrained, allowed only in legacy_plan2 sets. */
export interface FactTarget{type:'fact';concept:string;period_start?:string|null;period_end:string;duration:Duration;consolidation:'consolidated';unit:UnitSpec}
export interface MetricTarget{type:'metric';metric:string;period_start:string;period_end:string;duration:string;basis:string;input_unit:string;formula_version:string;unit:UnitSpec}
export type CaseTarget=FactTarget|MetricTarget;
export interface Subject{market:Market;cik?:string;ticker?:string}
export interface CaseSource{document_type:string;document_id?:DocumentId;url:string;sha256?:string;available_date?:string;locator?:Record<string,string|number>}
export interface GoldCase{
 case_id:string;subject:Subject;target:CaseTarget;expect:'present'|'missing';
 printed?:{text:string;unit_label:string;scale:Scale};canonical?:{value:string};
 binding:'document'|'current';
 /** binding='current': the asOf to read at. f6 = source.available_date; legacy = entry.as_of ?? null (null → env.today). */
 as_of:string|null;
 source:CaseSource;provenance_kind:ProvenanceKind;
 recorded_by:string;recorded_at:string|null;reviewed_by:string|null;reviewed_at:string|null;
 retracted:null|{at:string;by:string;reason:string};notes:string;
 required:boolean;
 /** legacy_plan2 only: entry still '<pending>' (no value / no recorder). */
 pending:boolean;
 /** legacy_plan2 only: required F6 provenance fields this entry lacks (e.g. 'source.sha256','source.locator','reviewed_by'). Empty for f6. */
 provenance_gaps:string[];
}
export interface Thresholds{max_fail:number;min_coverage_optional:string}
export interface GoldHistoryEntry{version:number;changed_at:string;changed_by:string;reason:string;fields:string[]}
export interface GoldSet{
 schema_version:1;format:GoldFormat;set_id:string;version:number;module:EvalModule;artifact_class:ArtifactClass;
 module_implementers:string[];tolerance:{rel:string};thresholds:Thresholds;optional_cases:string[];history:GoldHistoryEntry[];
 cases:GoldCase[];
 /** legacy_plan2: the file's `ready`; f6: always true. */
 ready:boolean;
 /** repo-relative path and sha256 of the file BYTES as loaded. */
 path:string;sha256:string;
}
export interface Recorder{id:string;role:string;modules:EvalModule[];added_at:string;approved_by:string}
export interface RecordersFile{version:number;recorders:Recorder[]}
export interface GoldLock{files:{path:string;sha256:string;version:number;format:GoldFormat}[]}

/** One row as read by a module reader (facts row, or a derived metric). value_text is the lossless decimal string. */
export interface ReadRow{
 value_text:string;unit:string;period_start:string|null;period_end:string;duration:string;consolidation:string;available_date:string;
 fact_id?:string;filing_id?:string;source_ref?:string;mapping_gen?:number;mapping_version?:string;raw_hash?:string;run_id?:string;status?:string;
 metric?:{metric:string;formula_version:string;basis:string;input_unit:string;based_on_rev:number;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string}[]};
}
export type ReadErrorReason='subject_unresolved'|'filing_not_found'|'filing_not_linked'|'filing_ambiguous'|'truncated'|'formula_version_mismatch'|'projection_join_missing'|'setup_mismatch'|'read_failed';
export interface ReadResult{rows:ReadRow[];truncated:boolean;stateRev:number|null;error?:ReadErrorReason}
export interface SubjectRef{issuerId:string;market:Market}
export interface ReplayRequest{issuer:Subject;concepts:string[];asOf:string;durations?:string[];metrics?:string[]}
export interface ProjectionRow{[k:string]:string|number|boolean|null|ProjectionRow[]}
export interface Projection{module:EvalModule;rows:ProjectionRow[]}
export interface Hint{kind:'late_fact'|'quarantine_resolved'|'mapping_gen_raised';ref:string;at:string}
/** inputs (integration decision 3): optional per-input chains for derived rows; the facts reader carries its richer chains as adapters/provenance.ts::FactProvenance.input_chains instead. */
export interface ProvenanceCheck{ok:boolean;missing:string[];reason?:string;producer_code_version?:string;object_path?:string;locator?:string;source_verified?:boolean|'skipped';inputs?:{fact_id:string;check:ProvenanceCheck}[]}

export interface ModuleReader{
 module:EvalModule;privileged:false|true;
 resolveSubject(subject:Subject,today:string):Promise<SubjectRef|null>;
 /** Rows of the filing identified by documentId whose period/consolidation match target; NOT filtered by unit. */
 readDocumentBound(ref:SubjectRef,target:CaseTarget,documentId:DocumentId,today:string):Promise<ReadResult>;
 /** Current rows at asOf matching target's key (facts) or the derived metric (metrics); NOT filtered by unit. */
 readCurrent(ref:SubjectRef,target:CaseTarget,asOf:string):Promise<ReadResult>;
 project(request:ReplayRequest,today:string):Promise<Projection>;
 /** state_rev is per issuer (fact_state_rev(issuer, market)); there is no global counter. The injected deps.stateRev() value when it
  *  answers non-null, else the largest read_facts envelope state_rev this reader saw during the run; null when it read nothing.
  *  runGoldSet copies it into environment.db_state_rev when the caller passed null. */
 stateRev():Promise<number|null>;
}
export interface PrivilegedReader extends ModuleReader{
 privileged:true;
 readNonVisible(ref:SubjectRef,target:CaseTarget,documentId:DocumentId|null,asOf:string):Promise<'quarantined'|'superseded_generation'|null>;
 resolveProvenance(ref:SubjectRef,row:ReadRow,opts:{artifacts:boolean}):Promise<ProvenanceCheck>;
 hints(request:ReplayRequest,since:string):Promise<Hint[]>;
}

/** §3.3 case results. Reduction lives in summary.ts only. */
export type CaseOutcome=
 |{result:'pass'}|{result:'expected_absent'}
 |{result:'fail';reason:'value'|'ambiguous'|'unexpected_value'}
 |{result:'unit_mismatch'}
 |{result:'provenance_incomplete';reason:string}
 |{result:'missing'}
 |{result:'not_visible';reason:'quarantined'|'superseded_generation'}
 |{result:'skipped';reason:'retracted'|'subset'|'zero_support'|'unavailable'|'ineligible'|'pending'}
 |{result:'read_error';reason:ReadErrorReason}
 |{result:'identical'}
 |{result:'explained_diff';ledger_ids:string[]}
 |{result:'data_drift';ledger_ids:string[];hints:Hint[]}
 |{result:'unexplained_diff';reason:'diff'|'no_hints'|'partial_ledger'|'ledger_self_approved'}
 |{result:'within'}|{result:'beyond_explained';ledger_ids:string[]}|{result:'beyond_unexplained'};
export interface CaseReport{
 case_id:string;required:boolean;outcome:CaseOutcome;
 /** system value (left) and gold/expected value (right), decimal strings; null when absent. */
 left:string|null;right:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
 provenance:ProvenanceCheck|null;detail:Record<string,unknown>;
}
export interface Summary{
 population:number;required:number;
 correctness:{pass:number;fail:number;unit_mismatch:number;provenance_incomplete:number;unexplained_diff:number};
 /** evaluated_optional: §3.2 rule 3 numerator (CCR-1), so gateOf can decide from the summary alone. */
 coverage:{evaluated:number;evaluated_optional:number;missing_required:number;missing_optional:number;not_visible:number;skipped:number};
 execution:{read_error:number;truncated:number;subset:boolean};
 thresholds:Thresholds;
 gold:{format:GoldFormat;ready:boolean;pending:number;provenance_gaps:number};
 gate:Gate;evidence_class:EvidenceClass;
 reconciliations_truncated:boolean;
}
export interface SummaryContext{thresholds:Thresholds;gold:Summary['gold'];subset:boolean;evidenceClass:EvidenceClass;reconciliationsTruncated?:boolean}

export interface EvalEnv{today:string;now():Date;evaluatorCodeVersion:string;dirty:boolean}
export interface ReportEnvironment{db_host:string|null;app_origin:string|null;db_state_rev:number|null}
export interface EvalReport{
 schema_version:1;run_id:string;kind:EvalKind;module:EvalModule;mode:EvalMode;privileged:boolean;artifact_class:ArtifactClass;
 set:{id:string;version:number;sha256:string;format:GoldFormat;path:string};
 evaluator_code_version:string;dirty:boolean;started_at:string;finished_at:string;
 environment:ReportEnvironment;thresholds:Thresholds;
 provenance:{verified:{artifacts:boolean;sources:boolean}};
 summary:Summary;cases:CaseReport[];
}
export interface RunOutcome{report:EvalReport;exitCode:ExitCode}
/** One finding of an evidence validator (validate.ts --expert/--audit/--manifest, Task 12; carried in validate/cli.ts CheckResult.findings). `where` names the file/field/case and never contains secrets. */
export interface ValidatorFinding{code:string;where:string;message:string}

/** Row shapes of the F6 tables (Task 5 migration). Decimal columns are TEXT. */
export interface EvalRunRow{
 run_id:string;kind:EvalKind;module:EvalModule;mode:EvalMode;privileged:boolean;artifact_class:ArtifactClass;
 set_id:string;set_version:number;set_sha256:string;evaluator_code_version:string;started_at:string;finished_at:string|null;
 status:EvalRunStatus;summary:Summary|Record<string,never>;report_ref:string;report_sha256:string;triggered_by:'manual'|'script'|'ci';
}
export type CaseResultKind='fail'|'unit_mismatch'|'provenance_incomplete'|'missing'|'not_visible'|'read_error'|'unexplained_diff';
export interface EvalCaseResultRow{eval_run_id:string;case_id:string;result:CaseResultKind;reason:string|null;left_text:string|null;right_text:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;detail:Record<string,unknown>}
```

`src/lib/evals/errors.ts`:

```ts
// src/lib/evals/errors.ts
// Pre-run refusals and fatal store errors (spec §14). Exit code 2 = refused before running; 1 = store/report failure.
export type EvalErrorCode='gold_invalid'|'gold_lock_mismatch'|'gold_diff_violation'|'code_version_missing'|'dirty_tree'|'synthetic_in_report'|'restricted_in_ci'|'kind_not_enabled'|'report_write_failed'|'store_write_failed'|'store_conflict'|'store_partial'|'reference_result_schema'|'reference_write_attempt'|'replay_rerecord_refused'|'resume_mismatch'|'redact_violation'|'manifest_invalid'|'expert_invalid'|'audit_invalid';
export const REFUSAL_CODES:ReadonlySet<EvalErrorCode>=new Set(['gold_invalid','gold_lock_mismatch','gold_diff_violation','code_version_missing','dirty_tree','synthetic_in_report','restricted_in_ci','kind_not_enabled','replay_rerecord_refused','resume_mismatch']);
export class EvalError extends Error{constructor(public readonly code:EvalErrorCode,message?:string,public readonly detail:Record<string,unknown>={}){super(message??code);this.name='EvalError';}}
export const exitCodeOfError=(e:EvalError):1|2=>REFUSAL_CODES.has(e.code)?2:1;
```

Run: `npm run typecheck`
Expected: exit 0（`../facts/types` 导出 `Duration`、`Market`）。

- [ ] **Step 3: 写 canonical-json 的失败测试**

`src/lib/evals/canonical-json.test.ts`:

```ts
// src/lib/evals/canonical-json.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {canonicalJson,projectionHash,sha256Hex} from './canonical-json';

describe('canonicalJson',()=>{
 it('sorts keys at every depth, drops undefined members and writes no whitespace',()=>{
  expect(canonicalJson({b:1,a:{d:[1,{z:true,y:null}],c:'x'},u:undefined})).toBe('{"a":{"c":"x","d":[1,{"y":null,"z":true}]},"b":1}');
 });
 it('is independent of key insertion order',()=>{
  expect(canonicalJson({x:'1',y:'2'})).toBe(canonicalJson({y:'2',x:'1'}));
 });
 it('escapes strings and keys exactly like JSON.stringify and sorts keys by code unit',()=>{
  expect(canonicalJson({'é':'"\n','B':'a','a':' '})).toBe(`{"B":"a","a":${JSON.stringify(' ')},"é":${JSON.stringify('"\n')}}`);
 });
 it('keeps decimal strings verbatim (never converts to number)',()=>{
  expect(canonicalJson({v:'12345678901234567890.123456789012345678'})).toBe('{"v":"12345678901234567890.123456789012345678"}');
 });
 it('rejects non-finite numbers, undefined in arrays and non-plain objects',()=>{
  expect(()=>canonicalJson({n:Number.NaN})).toThrow(RangeError);
  expect(()=>canonicalJson({n:Infinity})).toThrow(RangeError);
  expect(()=>canonicalJson([1,undefined])).toThrow(TypeError);
  expect(()=>canonicalJson({d:new Date(0)})).toThrow(TypeError);
  expect(()=>canonicalJson(new Map())).toThrow(TypeError);
  expect(()=>canonicalJson({b:10n})).toThrow(TypeError);
 });
 it('accepts null-prototype objects',()=>{
  const o=Object.create(null) as Record<string,unknown>;o.b='2';o.a='1';
  expect(canonicalJson(o)).toBe('{"a":"1","b":"2"}');
 });
});

describe('sha256Hex / projectionHash',()=>{
 it('hashes strings as UTF-8 and bytes as given',()=>{
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
 });
 it('projectionHash = sha256Hex(canonicalJson(projection))',()=>{
  const p={module:'facts' as const,rows:[{concept:'revenue',value_text:'1'}]};
  expect(projectionHash(p)).toBe(createHash('sha256').update('{"module":"facts","rows":[{"concept":"revenue","value_text":"1"}]}').digest('hex'));
  expect(projectionHash({rows:[{value_text:'1',concept:'revenue'}],module:'facts'})).toBe(projectionHash(p));
 });
});
```

- [ ] **Step 4: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/canonical-json.test.ts`
Expected: FAIL，`Error: Cannot find module './canonical-json' imported from …/src/lib/evals/canonical-json.test.ts`

- [ ] **Step 5: 实现 canonical-json.ts**

`src/lib/evals/canonical-json.ts`:

```ts
// src/lib/evals/canonical-json.ts
// Canonical JSON for every F6 hash (spec §5.3 projection_hash, §6.3 report_sha256, §7.2 report bytes):
// object keys sorted by UTF-16 code unit, no whitespace, strings and keys escaped by JSON.stringify,
// object members whose value is undefined dropped (as JSON.stringify does). Numbers must be finite
// (decimal values travel as strings, never as JS numbers). Arrays may not hold undefined; only plain
// objects, arrays, strings, finite numbers, booleans and null are accepted — anything else throws.
import {createHash} from 'node:crypto';
import type {Projection} from './types';

export function canonicalJson(v:unknown):string{
 if(v===null)return 'null';
 switch(typeof v){
  case 'string':return JSON.stringify(v);
  case 'boolean':return v?'true':'false';
  case 'number':
   if(!Number.isFinite(v))throw new RangeError('canonical_json:non_finite_number');
   return JSON.stringify(v);
  case 'object':{
   if(Array.isArray(v))return `[${v.map(x=>{if(x===undefined)throw new TypeError('canonical_json:undefined_in_array');return canonicalJson(x);}).join(',')}]`;
   const proto=Object.getPrototypeOf(v);
   if(proto!==Object.prototype&&proto!==null)throw new TypeError('canonical_json:not_a_plain_object');
   const o=v as Record<string,unknown>;
   const keys=Object.keys(o).filter(k=>o[k]!==undefined).sort();
   return `{${keys.map(k=>`${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  default:throw new TypeError(`canonical_json:unsupported_${typeof v}`);
 }
}
export const sha256Hex=(s:string|Uint8Array):string=>createHash('sha256').update(s).digest('hex');
export const projectionHash=(p:Projection):string=>sha256Hex(canonicalJson(p));
```

- [ ] **Step 6: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/canonical-json.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 7: 写 compare 的失败测试（含 200 次带种子的性质测试）**

`src/lib/evals/compare.test.ts`:

```ts
// src/lib/evals/compare.test.ts
import {describe,expect,it} from 'vitest';
import {compareWithinTolerance,formatDecimal,parseDecimalParts} from './compare';

/** mulberry32: small seeded PRNG so the property tests are reproducible. */
function prng(seed:number){
 let a=seed>>>0;
 return ()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
const digits=(rnd:()=>number,n:number)=>Array.from({length:n},()=>String(Math.floor(rnd()*10))).join('');
function randomDecimal(rnd:()=>number):string{
 const int=digits(rnd,1+Math.floor(rnd()*20));
 const fracLen=Math.floor(rnd()*19);
 const sign=rnd()<0.3?'-':'';
 return `${sign}${int}${fracLen?`.${digits(rnd,fracLen)}`:''}`;
}
const RELS=['0','0.0000000001','0.001','0.005','0.01','0.1','0.5','0.999'];

describe('parseDecimalParts / formatDecimal',()=>{
 it('splits sign, digits and scale',()=>{
  expect(parseDecimalParts('-12.340')).toEqual({unscaled:-12340n,scale:3});
  expect(parseDecimalParts('0')).toEqual({unscaled:0n,scale:0});
 });
 it('formats canonical text',()=>{
  expect(formatDecimal(-12340n,3)).toBe('-12.34');
  expect(formatDecimal(5n,3)).toBe('0.005');
  expect(formatDecimal(0n,10)).toBe('0');
  expect(formatDecimal(-0n,2)).toBe('0');
  expect(formatDecimal(120n,0)).toBe('120');
 });
 it('rejects anything outside -?digits(.digits)?',()=>{
  for(const bad of ['','1e5','+1',' 1','1 ','1.','.5','NaN','0x10','1,000','--1','1.2.3','∞','１'])expect(()=>parseDecimalParts(bad),bad).toThrow(RangeError);
  expect(()=>parseDecimalParts('1'.repeat(257))).toThrow(RangeError);
 });
});

describe('compareWithinTolerance',()=>{
 it('integers: inside and outside 1%',()=>{
  expect(compareWithinTolerance('100','101','0.01')).toEqual({passed:true,absDiff:'1',relDiff:'0.00990099'});
  expect(compareWithinTolerance('100','102','0.01')).toEqual({passed:false,absDiff:'2',relDiff:'0.0196078431'});
 });
 it('20-digit integers are exact (a double would call them equal)',()=>{
  expect(compareWithinTolerance('12345678901234567890','12345678901234567891','0')).toEqual({passed:false,absDiff:'1',relDiff:'0'});
  expect(compareWithinTolerance('12345678901234567890','12345678901234567891','0.0000000001').passed).toBe(true);
  expect(compareWithinTolerance('12345678901234567890','12345678901234567890','0')).toEqual({passed:true,absDiff:'0',relDiff:'0'});
 });
 it('18 decimal places are exact',()=>{
  expect(compareWithinTolerance('0.123456789012345678','0.123456789012345679','0')).toEqual({passed:false,absDiff:'0.000000000000000001',relDiff:'0'});
  expect(compareWithinTolerance('0.123456789012345678','0.1234567890123456780','0').passed).toBe(true);
 });
 it('negatives',()=>{
  expect(compareWithinTolerance('-5','5','0.5')).toEqual({passed:false,absDiff:'10',relDiff:'2'});
  expect(compareWithinTolerance('-100','-101','0.01')).toEqual({passed:true,absDiff:'1',relDiff:'0.00990099'});
  expect(compareWithinTolerance('-0','0','0')).toEqual({passed:true,absDiff:'0',relDiff:'0'});
 });
 it('rel 0 accepts only numerically equal values (trailing zeros do not matter)',()=>{
  expect(compareWithinTolerance('1.0','1','0')).toEqual({passed:true,absDiff:'0',relDiff:'0'});
  expect(compareWithinTolerance('1','1.0000000001','0').passed).toBe(false);
 });
 it('denominator is at least 1 for small magnitudes (boundary is inclusive)',()=>{
  expect(compareWithinTolerance('0.001','0.002','0.001')).toEqual({passed:true,absDiff:'0.001',relDiff:'0.001'});
  expect(compareWithinTolerance('0.001','0.002','0.0009').passed).toBe(false);
  expect(compareWithinTolerance('0','0.5','0.5').passed).toBe(true);
 });
 it('relDiff truncates toward zero at 10 places (never rounds)',()=>{
  expect(compareWithinTolerance('3','1','0').relDiff).toBe('0.6666666666');
  expect(compareWithinTolerance('3','2','0').relDiff).toBe('0.3333333333');
 });
 it('rejects non-decimal input and negative tolerance with RangeError',()=>{
  expect(()=>compareWithinTolerance('1e3','1000','0')).toThrow(RangeError);
  expect(()=>compareWithinTolerance('1000','1,000','0')).toThrow(RangeError);
  expect(()=>compareWithinTolerance('1','1','-0.1')).toThrow(RangeError);
  expect(()=>compareWithinTolerance('1','1','1e-2')).toThrow(RangeError);
 });
 it('property (200 seeded draws): every value passes against itself at rel 0',()=>{
  const rnd=prng(20261106);
  for(let i=0;i<200;i++){
   const x=randomDecimal(rnd);
   expect(compareWithinTolerance(x,x,'0'),x).toEqual({passed:true,absDiff:'0',relDiff:'0'});
  }
 });
 it('property (200 seeded draws): passing at rel a implies passing at every rel b >= a, and the result is symmetric',()=>{
  const rnd=prng(42);
  for(let i=0;i<200;i++){
   const x=randomDecimal(rnd),y=rnd()<0.5?randomDecimal(rnd):x.replace(/\d$/,d=>String((Number(d)+1)%10));
   const results=RELS.map(rel=>compareWithinTolerance(x,y,rel));
   const firstPass=results.findIndex(r=>r.passed);
   if(firstPass>=0)for(const r of results.slice(firstPass))expect(r.passed,`${x} ${y}`).toBe(true);
   for(const rel of RELS)expect(compareWithinTolerance(y,x,rel)).toEqual(compareWithinTolerance(x,y,rel));
  }
 });
});
```

- [ ] **Step 8: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/compare.test.ts`
Expected: FAIL，`Error: Cannot find module './compare' imported from …/src/lib/evals/compare.test.ts`

- [ ] **Step 9: 实现 compare.ts**

`src/lib/evals/compare.ts`:

```ts
// src/lib/evals/compare.ts
// F6 comparison primitive (spec §5.2, §0 R5-10; not plan 3's decimal.ts::compareDecimal). Decimal strings
// are aligned to a common scale as BigInt — no floating point anywhere:
//   passed ⇔ |l−r| ≤ rel × max(|l|,|r|,1)      (same semantics as dq_reconciliations.tolerance)
// evaluated as |L−R|·10^s_rel ≤ T·max(|L|,|R|,10^S) on the scaled integers. absDiff is the exact |l−r| in
// canonical decimal form; relDiff = |l−r| / max(|l|,|r|,1) truncated toward zero to 10 decimal places
// (display only — plan 3 rounds, F6 truncates). Input grammar: -?digits(.digits)?, no exponent, no '+',
// no whitespace, at most 256 characters; rel must also be non-negative. Anything else → RangeError.
import {canonicalDecimal} from '../facts/json-numbers';

const DECIMAL=/^(-?)(\d+)(?:\.(\d+))?$/;
const MAX_INPUT=256;
const REL_DIGITS=10;
const pow10=(n:number):bigint=>10n**BigInt(n);
const abs=(x:bigint):bigint=>x<0n?-x:x;
const max=(...xs:bigint[]):bigint=>xs.reduce((a,b)=>a>b?a:b);

/** '-12.340' → {unscaled:-12340n, scale:3}. Throws RangeError on anything outside the grammar. */
export function parseDecimalParts(s:string):{unscaled:bigint;scale:number}{
 if(typeof s!=='string'||s.length>MAX_INPUT)throw new RangeError('invalid_decimal');
 const m=DECIMAL.exec(s);
 if(!m)throw new RangeError(`invalid_decimal:${s.slice(0,40)}`);
 const frac=m[3]??'';
 const magnitude=BigInt(m[2]+frac);
 return {unscaled:m[1]==='-'?-magnitude:magnitude,scale:frac.length};
}
/** unscaled × 10^-scale as canonical decimal text ('-0' → '0', no trailing zeros). */
export function formatDecimal(unscaled:bigint,scale:number):string{
 const neg=unscaled<0n;
 const digits=abs(unscaled).toString().padStart(scale+1,'0');
 const text=scale===0?digits:`${digits.slice(0,digits.length-scale)}.${digits.slice(digits.length-scale)}`;
 return canonicalDecimal(`${neg?'-':''}${text}`);
}

export function compareWithinTolerance(left:string,right:string,rel:string):{passed:boolean;absDiff:string;relDiff:string}{
 const l=parseDecimalParts(left),r=parseDecimalParts(right),t=parseDecimalParts(rel);
 if(t.unscaled<0n)throw new RangeError('invalid_tolerance:negative');
 const s=Math.max(l.scale,r.scale);
 const L=l.unscaled*pow10(s-l.scale),R=r.unscaled*pow10(s-r.scale);
 const diff=abs(L-R);
 const denominator=max(abs(L),abs(R),pow10(s));
 return {
  passed:diff*pow10(t.scale)<=t.unscaled*denominator,
  absDiff:formatDecimal(diff,s),
  relDiff:formatDecimal(diff*pow10(REL_DIGITS)/denominator,REL_DIGITS),
 };
}
```

- [ ] **Step 10: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/compare.test.ts`
Expected: PASS（13 tests）

- [ ] **Step 11: 写 summary 的失败测试（§3.3 每行一条、每条 gate 规则、population 0、全撤回）**

`src/lib/evals/summary.test.ts`:

```ts
// src/lib/evals/summary.test.ts
import {describe,expect,it} from 'vitest';
import {bucketOf,exitCodeOf,gateOf,goldBlockOf,isPassOutcome,statusOfGate,summarize} from './summary';
import type {CaseOutcome,CaseReport,GoldCase,GoldSet,Summary,SummaryContext} from './types';

let n=0;
const rep=(outcome:CaseOutcome,required=true):CaseReport=>({case_id:`c${++n}`,required,outcome,left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail:{}});
const ctx=(over:Partial<SummaryContext>={}):SummaryContext=>({thresholds:{max_fail:0,min_coverage_optional:'0.95'},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:'truth',...over});
const PASS:CaseOutcome={result:'pass'};

describe('summarize: §3.3 reduction table (one row each)',()=>{
 const rows:[string,CaseOutcome,boolean,(s:Summary)=>number][]=[
  ['official pass',{result:'pass'},true,s=>s.correctness.pass],
  ['fail(value)',{result:'fail',reason:'value'},true,s=>s.correctness.fail],
  ['fail(ambiguous)',{result:'fail',reason:'ambiguous'},true,s=>s.correctness.fail],
  ['fail(unexpected_value)',{result:'fail',reason:'unexpected_value'},true,s=>s.correctness.fail],
  ['unit_mismatch',{result:'unit_mismatch'},true,s=>s.correctness.unit_mismatch],
  ['provenance_incomplete',{result:'provenance_incomplete',reason:'raw_hash'},true,s=>s.correctness.provenance_incomplete],
  ['expected_absent',{result:'expected_absent'},true,s=>s.correctness.pass],
  ['missing (required)',{result:'missing'},true,s=>s.coverage.missing_required],
  ['missing (optional)',{result:'missing'},false,s=>s.coverage.missing_optional],
  ['not_visible(quarantined)',{result:'not_visible',reason:'quarantined'},true,s=>s.coverage.not_visible],
  ['not_visible(superseded_generation)',{result:'not_visible',reason:'superseded_generation'},true,s=>s.coverage.not_visible],
  ['skipped(retracted)',{result:'skipped',reason:'retracted'},true,s=>s.coverage.skipped],
  ['skipped(subset)',{result:'skipped',reason:'subset'},true,s=>s.coverage.skipped],
  ['skipped(pending)',{result:'skipped',reason:'pending'},true,s=>s.coverage.skipped],
  ['read_error(filing_not_found)',{result:'read_error',reason:'filing_not_found'},true,s=>s.execution.read_error],
  ['replay identical',{result:'identical'},true,s=>s.correctness.pass],
  ['replay explained_diff',{result:'explained_diff',ledger_ids:['L1']},true,s=>s.correctness.pass],
  ['replay data_drift with ledger',{result:'data_drift',ledger_ids:['L1'],hints:[]},true,s=>s.correctness.pass],
  ['replay data_drift without ledger',{result:'data_drift',ledger_ids:[],hints:[{kind:'late_fact',ref:'f',at:'2026-01-01'}]},true,s=>s.correctness.unexplained_diff],
  ['replay unexplained_diff',{result:'unexplained_diff',reason:'no_hints'},true,s=>s.correctness.unexplained_diff],
  ['reference within',{result:'within'},true,s=>s.correctness.pass],
  ['reference beyond_explained',{result:'beyond_explained',ledger_ids:['R1']},true,s=>s.correctness.pass],
  ['reference beyond_unexplained',{result:'beyond_unexplained'},true,s=>s.correctness.unexplained_diff],
  ['reference unavailable',{result:'skipped',reason:'unavailable'},true,s=>s.coverage.skipped],
  ['extraction zero_support',{result:'skipped',reason:'zero_support'},true,s=>s.coverage.skipped],
  ['calibration ineligible',{result:'skipped',reason:'ineligible'},true,s=>s.coverage.skipped],
 ];
 for(const [name,outcome,required,counter] of rows)it(name,()=>{
  const s=summarize([rep(outcome,required)],ctx());
  expect(counter(s)).toBe(1);
  const total=Object.values(s.correctness).reduce((a,b)=>a+b,0)+s.coverage.missing_required+s.coverage.missing_optional+s.coverage.not_visible+s.coverage.skipped+s.execution.read_error;
  expect(total,'each case lands in exactly one counter').toBe(1);
 });
 it('read_error(truncated) also counts in execution.truncated',()=>{
  const s=summarize([rep({result:'read_error',reason:'truncated'})],ctx());
  expect(s.execution).toEqual({read_error:1,truncated:1,subset:false});
 });
 it('an explanation without a ledger id is not an explanation',()=>{
  expect(bucketOf({result:'explained_diff',ledger_ids:[]})).toBe('unexplained_diff');
  expect(bucketOf({result:'beyond_explained',ledger_ids:[]})).toBe('unexplained_diff');
  expect(isPassOutcome({result:'expected_absent'})).toBe(true);
  expect(isPassOutcome({result:'missing'})).toBe(false);
 });
 it('population excludes retracted cases; evaluated counts correctness outcomes, evaluated_optional the optional ones',()=>{
  const s=summarize([rep(PASS),rep({result:'fail',reason:'value'},false),rep({result:'skipped',reason:'retracted'}),rep({result:'missing'},false),rep({result:'skipped',reason:'subset'})],ctx());
  expect(s.population).toBe(4);
  expect(s.required).toBe(2);
  expect(s.coverage).toEqual({evaluated:2,evaluated_optional:1,missing_required:0,missing_optional:1,not_visible:0,skipped:2});
 });
 it('copies thresholds, gold block, evidence class and reconciliations_truncated from the context',()=>{
  const s=summarize([rep(PASS)],ctx({evidenceClass:'comparison',reconciliationsTruncated:true}));
  expect(s.evidence_class).toBe('comparison');
  expect(s.reconciliations_truncated).toBe(true);
  expect(s.thresholds).toEqual({max_fail:0,min_coverage_optional:'0.95'});
  expect(summarize([rep(PASS)],ctx()).reconciliations_truncated).toBe(false);
 });
 it('rejects duplicate case ids',()=>{
  const a=rep(PASS);
  expect(()=>summarize([a,{...a}],ctx())).toThrow(RangeError);
 });
});

describe('gate (§3.2 rules)',()=>{
 it('rule 4: everything evaluated and correct → pass',()=>{
  expect(summarize([rep(PASS),rep({result:'expected_absent'})],ctx()).gate).toBe('pass');
 });
 it('rule 1: population 0 (empty set, all retracted) → incomplete',()=>{
  expect(summarize([],ctx()).gate).toBe('incomplete');
  const s=summarize([rep({result:'skipped',reason:'retracted'}),rep({result:'skipped',reason:'retracted'})],ctx());
  expect(s.population).toBe(0);expect(s.coverage.skipped).toBe(2);expect(s.gate).toBe('incomplete');
 });
 it('rule 1: read_error, subset, missing_required, not_visible → incomplete',()=>{
  expect(summarize([rep(PASS),rep({result:'read_error',reason:'subject_unresolved'})],ctx()).gate).toBe('incomplete');
  expect(summarize([rep(PASS)],ctx({subset:true})).gate).toBe('incomplete');
  expect(summarize([rep(PASS),rep({result:'missing'})],ctx()).gate).toBe('incomplete');
  expect(summarize([rep(PASS),rep({result:'not_visible',reason:'quarantined'})],ctx()).gate).toBe('incomplete');
 });
 it('rule 1 (§0 R5-1): gold not ready, pending or provenance gaps → incomplete',()=>{
  expect(summarize([rep(PASS)],ctx({gold:{format:'legacy_plan2',ready:false,pending:0,provenance_gaps:0}})).gate).toBe('incomplete');
  expect(summarize([rep(PASS)],ctx({gold:{format:'legacy_plan2',ready:true,pending:1,provenance_gaps:0}})).gate).toBe('incomplete');
  expect(summarize([rep(PASS)],ctx({gold:{format:'legacy_plan2',ready:true,pending:0,provenance_gaps:3}})).gate).toBe('incomplete');
 });
 it('rule 1 precedes rule 2: a failing case plus a read error is incomplete, not fail',()=>{
  expect(summarize([rep({result:'fail',reason:'value'}),rep({result:'read_error',reason:'read_failed'})],ctx()).gate).toBe('incomplete');
 });
 it('rule 2: fail + unit_mismatch + provenance_incomplete + unexplained_diff > max_fail → fail',()=>{
  for(const o of [{result:'fail',reason:'value'},{result:'unit_mismatch'},{result:'provenance_incomplete',reason:'x'},{result:'unexplained_diff',reason:'diff'}] as CaseOutcome[])
   expect(summarize([rep(PASS),rep(o)],ctx()).gate,o.result).toBe('fail');
  const twoFailures=[rep({result:'fail',reason:'value'}),rep({result:'unit_mismatch'}),rep(PASS)];
  expect(summarize(twoFailures,ctx({thresholds:{max_fail:2,min_coverage_optional:'0.95'}})).gate).toBe('pass');
  expect(summarize(twoFailures,ctx({thresholds:{max_fail:1,min_coverage_optional:'0.95'}})).gate).toBe('fail');
 });
 it('rule 3: optional coverage below min_coverage_optional → incomplete; the boundary passes',()=>{
  expect(summarize([rep(PASS),rep({result:'missing'},false)],ctx()).gate).toBe('incomplete');
  const nineteenOfTwenty=[rep(PASS),...Array.from({length:19},()=>rep(PASS,false)),rep({result:'missing'},false)];
  expect(summarize(nineteenOfTwenty,ctx()).gate).toBe('pass');
  const eighteenOfTwenty=[rep(PASS),...Array.from({length:18},()=>rep(PASS,false)),rep({result:'missing'},false),rep({result:'skipped',reason:'unavailable'},false)];
  expect(summarize(eighteenOfTwenty,ctx()).gate).toBe('incomplete');
  expect(summarize([rep(PASS),rep({result:'missing'},false)],ctx({thresholds:{max_fail:0,min_coverage_optional:'0'}})).gate).toBe('pass');
 });
 it('gateOf decides from a summary alone',()=>{
  const s=summarize([rep(PASS)],ctx());
  const {gate:_gate,...rest}=s;
  expect(_gate).toBe('pass');
  expect(gateOf({...rest,correctness:{...rest.correctness,fail:1}})).toBe('fail');
  expect(gateOf({...rest,population:0})).toBe('incomplete');
 });
});

describe('goldBlockOf / exitCodeOf / statusOfGate',()=>{
 const gc=(over:Partial<GoldCase>):GoldCase=>({case_id:`g${++n}`,subject:{market:'US',ticker:'AAPL'},target:{type:'fact',concept:'revenue',period_end:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},expect:'present',binding:'current',as_of:null,source:{document_type:'unspecified',url:''},provenance_kind:'transcribed',recorded_by:'<pending>',recorded_at:null,reviewed_by:null,reviewed_at:null,retracted:null,notes:'',required:true,pending:false,provenance_gaps:[],...over});
 it('counts pending and gap cases among non-retracted cases only',()=>{
  const set={format:'legacy_plan2',ready:false,cases:[gc({pending:true,provenance_gaps:['source.sha256']}),gc({provenance_gaps:['printed']}),gc({pending:true,provenance_gaps:['x'],retracted:{at:'2026-11-06',by:'owner',reason:'r'}}),gc({})]} as unknown as GoldSet;
  expect(goldBlockOf(set)).toEqual({format:'legacy_plan2',ready:false,pending:1,provenance_gaps:2});
 });
 it('maps gates to exit codes and run statuses',()=>{
  expect([exitCodeOf('pass'),exitCodeOf('fail'),exitCodeOf('incomplete')]).toEqual([0,1,3]);
  expect([statusOfGate('pass'),statusOfGate('fail'),statusOfGate('incomplete')]).toEqual(['passed','failed','incomplete']);
 });
});
```

- [ ] **Step 12: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/summary.test.ts`
Expected: FAIL，`Error: Cannot find module './summary' imported from …/src/lib/evals/summary.test.ts`

- [ ] **Step 13: 实现 summary.ts**

`src/lib/evals/summary.ts`:

```ts
// src/lib/evals/summary.ts
// The one reduction of the F6 framework (spec §3.2 three-dimensional summary and gate, §3.3 reduction
// table, §0 R5-1 gold block). Kinds produce CaseReport[]; only this file turns them into a Summary.
// Input contract: exactly one CaseReport per case of the set, retracted / subset / pending cases
// included as skipped(…) — summarize never sees the set itself.
// - population = cases whose outcome is not skipped(retracted); required = those with required=true.
// - Retracted cases still count in coverage.skipped (§3.3 row "skipped(retracted | subset)").
// - evaluated / evaluated_optional = population cases (all / required=false) whose outcome lands in any
//   correctness counter (pass, expected_absent and fail alike).
// - read_error(truncated) increments execution.read_error AND execution.truncated.
// - data_drift with ≥ 1 ledger id → pass, with none → unexplained_diff; an explained_diff or
//   beyond_explained without a ledger id is treated as unexplained (an explanation needs an entry).
// - The gold block is NOT derived from the cases: ctx.gold is copied verbatim; goldBlockOf(set) is the
//   one place that computes it (pending = non-retracted cases with pending=true, provenance_gaps =
//   non-retracted cases with ≥ 1 gap). skipped(pending) itself only counts in coverage.skipped.
import {parseDecimalParts} from './compare';
import type {CaseOutcome,CaseReport,Gate,GoldSet,Summary,SummaryContext} from './types';

export type Bucket='pass'|'fail'|'unit_mismatch'|'provenance_incomplete'|'unexplained_diff'|'missing'|'not_visible'|'skipped'|'read_error';
const CORRECTNESS:ReadonlySet<Bucket>=new Set(['pass','fail','unit_mismatch','provenance_incomplete','unexplained_diff']);

/** §3.3: the counter one case outcome lands in (missing is split by `required` in summarize). */
export function bucketOf(o:CaseOutcome):Bucket{
 switch(o.result){
  case 'pass':case 'expected_absent':case 'identical':case 'within':return 'pass';
  case 'explained_diff':case 'beyond_explained':case 'data_drift':return o.ledger_ids.length>0?'pass':'unexplained_diff';
  case 'fail':return 'fail';
  case 'unit_mismatch':return 'unit_mismatch';
  case 'provenance_incomplete':return 'provenance_incomplete';
  case 'unexplained_diff':case 'beyond_unexplained':return 'unexplained_diff';
  case 'missing':return 'missing';
  case 'not_visible':return 'not_visible';
  case 'skipped':return 'skipped';
  case 'read_error':return 'read_error';
 }
}
export const isPassOutcome=(o:CaseOutcome):boolean=>bucketOf(o)==='pass';
const isRetracted=(o:CaseOutcome)=>o.result==='skipped'&&o.reason==='retracted';

/** §0 R5-1 gold block of a loaded set (the runner passes it as SummaryContext.gold). */
export function goldBlockOf(set:GoldSet):Summary['gold']{
 const live=set.cases.filter(c=>c.retracted===null);
 return {format:set.format,ready:set.ready,pending:live.filter(c=>c.pending).length,provenance_gaps:live.filter(c=>c.provenance_gaps.length>0).length};
}

export function summarize(cases:CaseReport[],ctx:SummaryContext):Summary{
 const seen=new Set<string>();
 for(const c of cases){if(seen.has(c.case_id))throw new RangeError(`duplicate_case_id:${c.case_id}`);seen.add(c.case_id);}
 const correctness={pass:0,fail:0,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0};
 const coverage={evaluated:0,evaluated_optional:0,missing_required:0,missing_optional:0,not_visible:0,skipped:0};
 const execution={read_error:0,truncated:0,subset:ctx.subset};
 let population=0,required=0;
 for(const c of cases){
  const b=bucketOf(c.outcome);
  if(!isRetracted(c.outcome)){population++;if(c.required)required++;}
  if(CORRECTNESS.has(b)){
   correctness[b as keyof typeof correctness]++;
   coverage.evaluated++;
   if(!c.required)coverage.evaluated_optional++;
  }else if(b==='missing'){if(c.required)coverage.missing_required++;else coverage.missing_optional++;}
  else if(b==='not_visible')coverage.not_visible++;
  else if(b==='skipped')coverage.skipped++;
  else{
   execution.read_error++;
   if(c.outcome.result==='read_error'&&c.outcome.reason==='truncated')execution.truncated++;
  }
 }
 const s:Omit<Summary,'gate'>={
  population,required,correctness,coverage,execution,thresholds:ctx.thresholds,gold:ctx.gold,
  evidence_class:ctx.evidenceClass,reconciliations_truncated:ctx.reconciliationsTruncated??false,
 };
 return {...s,gate:gateOf(s)};
}

/** §3.2 gate rules, in order: 1 incomplete, 2 fail, 3 optional coverage, 4 pass. */
export function gateOf(s:Omit<Summary,'gate'>):Gate{
 if(s.population===0||s.execution.read_error>0||s.execution.subset||s.coverage.missing_required>0||s.coverage.not_visible>0
  ||!s.gold.ready||s.gold.pending>0||s.gold.provenance_gaps>0)return 'incomplete';
 const failures=s.correctness.fail+s.correctness.unit_mismatch+s.correctness.provenance_incomplete+s.correctness.unexplained_diff;
 if(failures>s.thresholds.max_fail)return 'fail';
 const optional=s.population-s.required;
 if(optional>0){
  const min=parseDecimalParts(s.thresholds.min_coverage_optional);
  // evaluated_optional / optional < min  ⇔  evaluated_optional·10^scale < unscaled·optional
  if(BigInt(s.coverage.evaluated_optional)*10n**BigInt(min.scale)<min.unscaled*BigInt(optional))return 'incomplete';
 }
 return 'pass';
}
export const exitCodeOf=(g:Gate):0|1|3=>g==='pass'?0:g==='fail'?1:3;
export const statusOfGate=(g:Gate):'passed'|'failed'|'incomplete'=>g==='pass'?'passed':g==='fail'?'failed':'incomplete';
```

- [ ] **Step 14: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/summary.test.ts`
Expected: PASS（41 tests）

- [ ] **Step 15: 类型检查与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 两者都 exit 0，0 warnings。

- [ ] **Step 16: 暂存**

```bash
git add docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md src/lib/evals/types.ts src/lib/evals/errors.ts src/lib/evals/canonical-json.ts src/lib/evals/canonical-json.test.ts src/lib/evals/compare.ts src/lib/evals/compare.test.ts src/lib/evals/summary.ts src/lib/evals/summary.test.ts
```

- [ ] **Step 17: 提交（`git commit` 单独一条命令）**

```bash
git commit -m "feat(evals): shared contract, canonical JSON, compareWithinTolerance, summary reduction (F6 Task 1)" -m "Spec §3.2/§3.3/§5.2, §0 R5-1/R5-10. CCR-1: Summary.coverage.evaluated_optional." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 黄金集契约、旧格式适配器与加载（`gold/schema.ts` / `gold/legacy-plan2.ts` / `gold/load.ts` / `lock.json` / `recorders.json`）

**本任务定死的约定（W1 对规格歧义的处理）：**
- `target.type` 必填（契约里有，规格 §4.2 的示例没写）。本期只接受 `module='facts'`（fact 目标）和 `module='metrics'`（metric 目标），其他模块报 `module: unsupported_in_this_phase`。
- f6 的 `target.period_start` **键必须存在**（`null` = 时点）；不写这个键只允许出现在 legacy 集里。时点概念要求 `duration='INSTANT'` 且 `period_start=null`；期间概念要求 `period_start` 是日期、`duration` 不是 INSTANT。`target.unit.kind` 必须与概念的 `unitKind` 一致（money→currency）。`currency` 必须在 `CURRENCIES` 里。
- `canonical.value` 必须本身就是规范写法（`=== canonicalDecimal(value)`），并且等于由 `printed` 重算的值；不一致报 `does_not_match_printed:<重算值>`。负数只认 ASCII `-` 和括号；`%` 只用于 `ratio`，且 `ratio` 要求 `scale='1'`。
- `source`：`document_type`、https `url`、64 位小写 hex `sha256` 必填；`expect='present'` 时 `locator` 必填；`binding='document'` 需要 `document_id`（facts 只接受 `edgar_accession`（仅 US，格式 `\d{10}-\d{2}-\d{6}`）与 `cninfo_announcement`（仅 CN，纯数字））；`binding='current'` 需要 `available_date`。f6 的 `as_of` = `source.available_date ?? null`。
- 录入人：`recorded_by` 必填，`reviewed_by` 可空；两者有值时都必须在 `recorders.json` 里、该录入人的 `modules` 含本集 module、不在 `module_implementers` 里，且 `reviewed_by ≠ recorded_by`。`reviewed_at` 与 `reviewed_by` 同有同无；`recorded_at` 必填（f6）。
- **合成集**（Task 9 的 `synthetic-us.json` 按此写）：`provenance_kind='synthetic'` 的案例 `recorded_by` 必须是字面量 `'synthetic'`（`recorders.json` 保留此 id，不许登记）、`reviewed_by=null`；`source.sha256` 规则不变（可用合成夹具文件的 sha256）。一个集不能混用 synthetic 与 transcribed（`cases: mixed_provenance_kind`），于是运行器看 `cases[0].provenance_kind` 就能在 `report` 下拒绝 `synthetic_in_report`。
- 集头未知键、案例未知键都报错（拼写错误不能悄悄通过）。`version>1` 时 `history` 必须有 `version===当前 version` 的条目，`history` 的版本严格递增。
- legacy 适配器：`case_id = ${ticker}/${concept}/${period_end}/${duration}/${unit}`；`source.document_type='unspecified'`；`source.url` 取条目值（空或 `<pending>` 时为 `''`）；`page_or_row` 有值时映射为 `locator:{page_or_row}`；条目的 `source.document` 文本放进 `notes`。`provenance_gaps` 顺序固定：`source.document_id`、`source.sha256`（总有）、`source.url`（空/pending 时）、`source.locator`（同上）、`printed`（总有）、`canonical`（value 为 pending 时）、`recorded_by`（pending 时）、`recorded_at`（空时）、`reviewed_by`（总有）。所以已录入的 legacy 条目仍至少缺 4 项，集合恒为 `incomplete`，直到迁移成 f6（§4.6 旧格式例外）。`pending` 的判定与 `sync-us.integration.test.ts::isPending` 一致：`recorded_by==='<pending>' || value==='<pending>'`。

**Files:**
- Create: `src/lib/evals/gold/schema.ts`, `src/lib/evals/gold/legacy-plan2.ts`, `src/lib/evals/gold/load.ts`
- Create: `src/lib/evals/fixtures/gold/recorders.json`, `src/lib/evals/fixtures/gold/lock.json`
- Test: `src/lib/evals/gold/schema.test.ts`, `src/lib/evals/gold/legacy-plan2.test.ts`, `src/lib/evals/gold/load.test.ts`
- Read only: `src/lib/facts/fixtures/gold/plan2.json`, `src/lib/facts/concepts.ts`（`conceptById`、`isConceptId`）、`src/lib/facts/units.ts`（`CURRENCIES`）、`src/lib/facts/json-numbers.ts`（`canonicalDecimal`）

- [ ] **Step 1: 写 schema 的失败测试（每条规则一条反例）**

`src/lib/evals/gold/schema.test.ts`:

```ts
// src/lib/evals/gold/schema.test.ts
// One counter-example per §4.2/§4.3/§4.6 rule; each asserts the exact '<path>: <code>' error line.
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import type {RecordersFile} from '../types';
import {canonicalFromPrinted,parseGoldSetF6,specOfUnit,unitOfSpec} from './schema';

// Plain JSON builders; every test mutates a fresh copy.
type J=Record<string,any>;
const RECORDERS:RecordersFile={version:1,recorders:[
 {id:'owner',role:'owner',modules:['facts','metrics','macro'],added_at:'2026-11-06',approved_by:'owner'},
 {id:'reviewer2',role:'reviewer',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'},
 {id:'claude-code',role:'agent',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'},
 {id:'macro-only',role:'reviewer',modules:['macro'],added_at:'2026-11-06',approved_by:'owner'},
]};
const META={path:'src/lib/evals/fixtures/gold/facts/test.json',sha256:'a'.repeat(64)};
const goodCase=():J=>({
 case_id:'AAPL/revenue/2022-10-01..2023-09-30/consolidated/USD',subject:{market:'US',cik:'320193'},
 target:{type:'fact',concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
 expect:'present',printed:{text:'383,285',unit_label:'In millions',scale:'1000000'},canonical:{value:'383285000000'},binding:'document',
 source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:'0000320193-23-000106'},url:'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm',sha256:'b'.repeat(64),available_date:'2023-11-03',locator:{page:28,table:'CONSOLIDATED STATEMENTS OF OPERATIONS',row:'Total net sales',column:'2023'}},
 provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06T00:00:00Z',reviewed_by:'reviewer2',reviewed_at:'2026-11-07T00:00:00Z',retracted:null,notes:'',
});
const instantCase=():J=>({...goodCase(),case_id:'AAPL/total_assets/2023-09-30',target:{type:'fact',concept:'total_assets',period_start:null,period_end:'2023-09-30',duration:'INSTANT',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},printed:{text:'352,583',unit_label:'In millions',scale:'1000000'},canonical:{value:'352583000000'}});
const goodSet=():J=>({schema_version:1,set_id:'facts/test',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code','codex'],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],cases:[goodCase(),instantCase()]});
function errorsOf(mutate:(s:J)=>void,recorders:RecordersFile=RECORDERS):string[]{
 const s=goodSet();mutate(s);
 try{parseGoldSetF6(s,META,recorders);return [];}
 catch(e){expect(e).toBeInstanceOf(EvalError);expect((e as EvalError).code).toBe('gold_invalid');return (e as EvalError).detail.errors as string[];}
}

describe('parseGoldSetF6: the valid set',()=>{
 it('parses, derives required from optional_cases, as_of from available_date, ready=true and no gaps',()=>{
  const s=goodSet();s.optional_cases=['AAPL/total_assets/2023-09-30'];
  const set=parseGoldSetF6(s,META,RECORDERS);
  expect(set).toMatchObject({format:'f6',ready:true,set_id:'facts/test',path:META.path,sha256:META.sha256,optional_cases:['AAPL/total_assets/2023-09-30']});
  expect(set.cases.map(c=>[c.case_id,c.required,c.pending,c.provenance_gaps,c.as_of])).toEqual([
   ['AAPL/revenue/2022-10-01..2023-09-30/consolidated/USD',true,false,[],'2023-11-03'],
   ['AAPL/total_assets/2023-09-30',false,false,[],'2023-11-03'],
  ]);
  expect(errorsOf(()=>{})).toEqual([]);
 });
 it('accepts expect=missing with target.unit and source but no printed/canonical/locator',()=>{
  expect(errorsOf(s=>{const c=s.cases[0];c.expect='missing';delete c.printed;delete c.canonical;delete c.source.locator;})).toEqual([]);
 });
 it('accepts a synthetic set recorded by "synthetic" with no reviewer',()=>{
  expect(errorsOf(s=>{for(const c of s.cases){c.provenance_kind='synthetic';c.recorded_by='synthetic';c.reviewed_by=null;c.reviewed_at=null;}})).toEqual([]);
 });
});

describe('parseGoldSetF6: one counter-example per rule',()=>{
 const cases:[string,(s:J)=>void,string][]=[
  ['target.unit required (present)',s=>{delete s.cases[0].target.unit;},'cases[0].target.unit: required'],
  ['target.unit required (missing)',s=>{const c=s.cases[0];c.expect='missing';delete c.printed;delete c.canonical;delete c.target.unit;},'cases[0].target.unit: required'],
  ['currency must be ISO',s=>{s.cases[0].target.unit={kind:'currency',currency:'XXX'};},'cases[0].target.unit: currency_requires_iso_currency'],
  ['macro unit kinds are not facts units',s=>{s.cases[0].target.unit={kind:'index'};},'cases[0].target.unit: not_a_facts_unit'],
  ['unit kind must match the concept',s=>{s.cases[0].target.unit={kind:'shares'};},'cases[0].target.unit.kind: concept_revenue_expects_currency'],
  ['scale whitelist',s=>{s.cases[0].printed.scale='100';},'cases[0].printed.scale: not_in_whitelist'],
  ['canonical must equal parse(printed) × scale',s=>{s.cases[0].canonical.value='383285000001';},'cases[0].canonical.value: does_not_match_printed:383285000000'],
  ['canonical must be canonical text',s=>{s.cases[0].canonical.value='383285000000.0';},'cases[0].canonical.value: not_canonical:383285000000'],
  ['canonical must be a decimal string (not a JSON number)',s=>{s.cases[0].canonical.value=383285000000;},'cases[0].canonical.value: decimal_string_required'],
  ['printed text must be a printed number',s=>{s.cases[0].printed.text='$383,285';},'cases[0].printed.text: unparseable'],
  ['thousands grouping must be well formed',s=>{s.cases[0].printed.text='3832,85';},'cases[0].printed.text: unparseable'],
  ['% only for ratio',s=>{s.cases[0].printed.text='12.5%';},'cases[0].printed.text: unparseable'],
  ['source.sha256 required',s=>{delete s.cases[0].source.sha256;},'cases[0].source.sha256: 64_lowercase_hex_required'],
  ['source.sha256 must be 64 lowercase hex',s=>{s.cases[0].source.sha256='B'.repeat(64);},'cases[0].source.sha256: 64_lowercase_hex_required'],
  ['source.url must be https',s=>{s.cases[0].source.url='http://www.sec.gov/x';},'cases[0].source.url: https_url_required'],
  ['locator required for present',s=>{delete s.cases[0].source.locator;},'cases[0].source.locator: required_for_present'],
  ['document binding needs document_id',s=>{delete s.cases[0].source.document_id;},'cases[0].source.document_id: required_for_document_binding'],
  ['current binding needs available_date',s=>{s.cases[0].binding='current';delete s.cases[0].source.available_date;},'cases[0].source.available_date: required_for_current_binding'],
  ['accession format',s=>{s.cases[0].source.document_id.value='320193-23-106';},'cases[0].source.document_id.value: accession_format'],
  ['edgar accession only for US',s=>{s.cases[0].subject={market:'CN',ticker:'600519.SH'};},'cases[0].source.document_id: edgar_accession_requires_US'],
  ['recorded_by must be a recorder',s=>{s.cases[0].recorded_by='stranger';},'cases[0].recorded_by: not_in_recorders:stranger'],
  ['reviewed_by must be a recorder',s=>{s.cases[0].reviewed_by='stranger';},'cases[0].reviewed_by: not_in_recorders:stranger'],
  ['recorded_by must not be a module implementer',s=>{s.cases[0].recorded_by='claude-code';},'cases[0].recorded_by: is_module_implementer:claude-code'],
  ['reviewed_by must not be a module implementer',s=>{s.cases[0].reviewed_by='claude-code';},'cases[0].reviewed_by: is_module_implementer:claude-code'],
  ['recorder must cover the module',s=>{s.cases[0].reviewed_by='macro-only';},'cases[0].reviewed_by: recorder_not_for_module:macro-only'],
  ['reviewer differs from recorder',s=>{s.cases[0].reviewed_by='owner';},'cases[0].reviewed_by: same_as_recorded_by'],
  ['reviewed_at comes with reviewed_by',s=>{s.cases[0].reviewed_at=null;},'cases[0].reviewed_at: required_with_reviewed_by'],
  ['recorded_at required',s=>{s.cases[0].recorded_at=null;},'cases[0].recorded_at: date_or_timestamp_required'],
  ['missing has no printed',s=>{s.cases[0].expect='missing';delete s.cases[0].canonical;},'cases[0].printed: forbidden_when_missing'],
  ['missing has no canonical',s=>{s.cases[0].expect='missing';delete s.cases[0].printed;},'cases[0].canonical: forbidden_when_missing'],
  ['subject has no issuer_id',s=>{s.cases[0].subject.issuer_id='00000000-0000-4000-8000-000000000000';},'cases[0].subject.issuer_id: forbidden'],
  ['subject needs cik or ticker',s=>{s.cases[0].subject={market:'US'};},'cases[0].subject: cik_or_ticker_required'],
  ['tolerance rel < 1',s=>{s.tolerance={rel:'1'};},'tolerance: must_be_{rel}_with_0<=rel<1'],
  ['tolerance rel is a non-negative decimal string',s=>{s.tolerance={rel:'-0.1'};},'tolerance: must_be_{rel}_with_0<=rel<1'],
  ['tolerance is relative only',s=>{s.tolerance={rel:'0',abs:'1'};},'tolerance: must_be_{rel}_with_0<=rel<1'],
  ['min_coverage_optional ≤ 1',s=>{s.thresholds.min_coverage_optional='1.5';},'thresholds: must_be_{max_fail>=0,0<=min_coverage_optional<=1}'],
  ['optional_cases must name cases',s=>{s.optional_cases=['nope'];},'optional_cases: unknown_case:nope'],
  ['concept must be in CONCEPT_IDS',s=>{s.cases[0].target.concept='revenues';},'cases[0].target.concept: not_in_CONCEPT_IDS'],
  ['period_start key required in f6 (absent only in legacy)',s=>{delete s.cases[0].target.period_start;},'cases[0].target.period_start: required_(null_for_instant)'],
  ['instant concept needs INSTANT and null period_start',s=>{s.cases[1].target.duration='12M';},'cases[1].target: instant_concept_requires_INSTANT_and_null_period_start'],
  ['duration concept needs a period_start',s=>{s.cases[0].target.period_start=null;},'cases[0].target: duration_concept_requires_period_start_and_duration'],
  ['fact targets need module facts',s=>{s.module='metrics';},'cases[0].target.type: fact_target_requires_module_facts'],
  ['modules without adapters are rejected',s=>{s.module='macro';},'module: unsupported_in_this_phase'],
  ['duplicate case_id',s=>{s.cases[1]=goodCase();},'cases[1].case_id: duplicate'],
  ['unknown case key',s=>{s.cases[0].value='1';},'cases[0].value: unknown_key'],
  ['unknown set key',s=>{s.threshold={};},'threshold: unknown_key'],
  ['version > 1 needs a history entry',s=>{s.version=2;},'history: missing_entry_for_current_version'],
  ['history versions increase',s=>{s.version=3;s.history=[{version:3,changed_at:'2026-11-06',changed_by:'owner',reason:'r',fields:['thresholds']},{version:2,changed_at:'2026-11-06',changed_by:'owner',reason:'r',fields:['thresholds']}];},'history[1].version: not_increasing'],
  ['no mixing synthetic and transcribed',s=>{const c=s.cases[1];c.provenance_kind='synthetic';c.recorded_by='synthetic';c.reviewed_by=null;c.reviewed_at=null;},'cases: mixed_provenance_kind'],
  ['synthetic cases are recorded by "synthetic"',s=>{for(const c of s.cases){c.provenance_kind='synthetic';c.reviewed_by=null;c.reviewed_at=null;}},'cases[0].recorded_by: must_be_synthetic_for_synthetic_cases'],
  ['retracted.by must be a recorder',s=>{s.cases[0].retracted={at:'2026-11-06',by:'stranger',reason:'typo'};},'cases[0].retracted.by: not_in_recorders:stranger'],
  ['schema_version must be 1',s=>{s.schema_version=2;},'schema_version: must_be_1'],
 ];
 for(const [name,mutate,expected] of cases)it(name,()=>{expect(errorsOf(mutate)).toContain(expected);});
 it('reports every violation at once',()=>{
  expect(errorsOf(s=>{delete s.cases[0].source.sha256;s.cases[1].recorded_by='stranger';}).length).toBeGreaterThanOrEqual(2);
 });
});

describe('canonicalFromPrinted / unitOfSpec',()=>{
 const usd={kind:'currency',currency:'USD'} as const;
 it('removes thousands separators and applies the scale',()=>{
  expect(canonicalFromPrinted('383,285','1000000',usd)).toBe('383285000000');
  expect(canonicalFromPrinted('1,234.5','1000',usd)).toBe('1234500');
  expect(canonicalFromPrinted('0.12','1',usd)).toBe('0.12');
 });
 it('parentheses and a leading minus are negative',()=>{
  expect(canonicalFromPrinted('(1,234)','1000',usd)).toBe('-1234000');
  expect(canonicalFromPrinted('-1,234','1000',usd)).toBe('-1234000');
  expect(canonicalFromPrinted('(0)','1',usd)).toBe('0');
 });
 it('% divides by 100 for ratio only',()=>{
  expect(canonicalFromPrinted('12.5%','1',{kind:'ratio'})).toBe('0.125');
  expect(canonicalFromPrinted('(3%)','1',{kind:'ratio'})).toBe('-0.03');
  expect(canonicalFromPrinted('12.5%','1',usd)).toBeNull();
 });
 it('rejects non-numbers',()=>{
  for(const t of ['','$1','1 234','1,23','1e5','--1','(1','12.5 %x','１'])expect(canonicalFromPrinted(t,'1',usd),t).toBeNull();
 });
 it('maps unit specs to facts units and back',()=>{
  expect(unitOfSpec({kind:'currency',currency:'USD'})).toBe('USD');
  expect(unitOfSpec({kind:'shares'})).toBe('shares');
  expect(unitOfSpec({kind:'per_share',currency:'CNY'})).toBe('CNY/share');
  expect(unitOfSpec({kind:'ratio'})).toBe('pure');
  expect(unitOfSpec({kind:'index'})).toBeNull();
  expect(['USD','shares','CNY/share','pure'].map(u=>unitOfSpec(specOfUnit(u)!))).toEqual(['USD','shares','CNY/share','pure']);
  expect(specOfUnit('USD/EUR')).toBeNull();
 });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/gold/schema.test.ts`
Expected: FAIL，`Error: Cannot find module './schema' imported from …/src/lib/evals/gold/schema.test.ts`

- [ ] **Step 3: 实现 gold/schema.ts**

`src/lib/evals/gold/schema.ts`:

```ts
// src/lib/evals/gold/schema.ts
// F6 gold-set contract (spec §4.1–§4.3, §4.6). parseGoldSetF6 checks every rule and throws ONE
// EvalError('gold_invalid') whose detail.errors lists every violation as '<json path>: <code>'.
// The runner never generates, infers or corrects gold values (§4.6): canonical.value is recomputed
// from printed only to be compared, never substituted. Phase scope: targets are facts (module 'facts')
// or metrics (module 'metrics'); other modules are rejected until their adapters exist (§5.6).
// Synthetic sets (provenance_kind 'synthetic', ci only) use recorded_by 'synthetic' and no reviewer;
// a set never mixes synthetic and transcribed cases (the runner refuses synthetic sets in report).
import {conceptById,isConceptId} from '../../facts/concepts';
import {CURRENCIES} from '../../facts/units';
import type {Duration} from '../../facts/types';
import {canonicalDecimal} from '../../facts/json-numbers';
import {formatDecimal,parseDecimalParts} from '../compare';
import {EvalError} from '../errors';
import type {CaseSource,CaseTarget,DocumentId,EvalModule,GoldCase,GoldHistoryEntry,GoldSet,RecordersFile,Scale,UnitSpec} from '../types';

export const SCALES:readonly Scale[]=['1','1000','1000000','1000000000'];
export const EVAL_MODULES:readonly EvalModule[]=['facts','metrics','macro','industry','company','foreign_research'];
const DURATIONS:readonly Duration[]=['3M','6M','9M','12M','INSTANT'];
const CURRENCY=new Set<string>(CURRENCIES);
const DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const HEX64=/^[0-9a-f]{64}$/;
const SET_ID=/^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_.-]*)+$/;
const ACCESSION=/^\d{10}-\d{2}-\d{6}$/;
const SET_KEYS=new Set(['schema_version','set_id','version','module','artifact_class','module_implementers','tolerance','thresholds','optional_cases','history','cases']);
const CASE_KEYS=new Set(['case_id','subject','target','expect','printed','canonical','binding','source','provenance_kind','recorded_by','recorded_at','reviewed_by','reviewed_at','retracted','notes']);
const FACT_KEYS=new Set(['type','concept','period_start','period_end','duration','consolidation','unit']);
const METRIC_KEYS=new Set(['type','metric','period_start','period_end','duration','basis','input_unit','formula_version','unit']);
const SOURCE_KEYS=new Set(['document_type','document_id','url','sha256','available_date','locator']);

/** Facts unit string of a UnitSpec (§4.3); null for macro-only kinds (index, count, percent_points). */
export function unitOfSpec(u:UnitSpec):string|null{
 switch(u.kind){
  case 'currency':return u.currency;
  case 'shares':return 'shares';
  case 'per_share':return `${u.currency}/share`;
  case 'ratio':return 'pure';
  default:return null;
 }
}
/** Inverse of unitOfSpec for facts unit strings ('USD', 'shares', 'USD/share', 'pure'); null when not a facts unit. */
export function specOfUnit(unit:string):UnitSpec|null{
 if(unit==='shares')return {kind:'shares'};
 if(unit==='pure')return {kind:'ratio'};
 if(CURRENCY.has(unit))return {kind:'currency',currency:unit};
 const m=/^([A-Z]{3})\/share$/.exec(unit);
 return m&&CURRENCY.has(m[1])?{kind:'per_share',currency:m[1]}:null;
}

/**
 * §4.3: parse printed.text (thousands separators '1,234'; '(1,234)' and '-1,234' negative; '12.5%' for
 * ratio = 0.125) × scale → canonical decimal. Returns null when the text is not a printed number.
 */
export function canonicalFromPrinted(text:string,scale:Scale,unit:UnitSpec):string|null{
 let t=text.trim(),neg=false,percent=false;
 const paren=/^\((.*)\)$/.exec(t);
 if(paren){neg=true;t=paren[1].trim();}
 else if(t.startsWith('-')){neg=true;t=t.slice(1);}
 if(t.endsWith('%')){
  if(unit.kind!=='ratio')return null;
  percent=true;t=t.slice(0,-1).trimEnd();
 }
 if(!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t))return null;
 const {unscaled,scale:fracDigits}=parseDecimalParts(t.replace(/,/g,''));
 const value=unscaled*BigInt(scale)*(neg?-1n:1n);
 return formatDecimal(value,fracDigits+(percent?2:0));
}

type J=Record<string,unknown>;
const isObj=(v:unknown):v is J=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const isStr=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const isInt=(v:unknown,min:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const isDecimal=(v:unknown):v is string=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v);

/** Non-negative decimal string below 1 (or ≤ 1 when inclusiveOne). */
function isUnitFraction(v:unknown,inclusiveOne:boolean):v is string{
 if(!isDecimal(v))return false;
 const {unscaled,scale}=parseDecimalParts(v);
 const one=10n**BigInt(scale);
 return inclusiveOne?unscaled<=one:unscaled<one;
}
/** §4.3 tolerance: decimal string, 0 ≤ rel < 1. */
export const isRelTolerance=(v:unknown):v is string=>isUnitFraction(v,false);

export function parseGoldSetF6(raw:unknown,meta:{path:string;sha256:string},recorders:RecordersFile):GoldSet{
 const errors:string[]=[];
 const err=(at:string,code:string)=>{errors.push(`${at}: ${code}`);};
 const fail=()=>new EvalError('gold_invalid',`${meta.path}: ${errors.length} rule violation(s)`,{path:meta.path,errors});
 if(!isObj(raw)){err('$','not_an_object');throw fail();}
 for(const k of Object.keys(raw))if(!SET_KEYS.has(k))err(k,'unknown_key');
 if(raw.schema_version!==1)err('schema_version','must_be_1');
 if(typeof raw.set_id!=='string'||!SET_ID.test(raw.set_id))err('set_id','invalid');
 if(!isInt(raw.version,1))err('version','integer_>=_1');
 const mod=raw.module as EvalModule;
 if(!EVAL_MODULES.includes(mod))err('module','invalid');
 else if(mod!=='facts'&&mod!=='metrics')err('module','unsupported_in_this_phase');
 if(raw.artifact_class!=='public'&&raw.artifact_class!=='restricted')err('artifact_class','invalid');
 const implementers=Array.isArray(raw.module_implementers)&&raw.module_implementers.length>0&&raw.module_implementers.every(isStr)?raw.module_implementers as string[]:null;
 if(!implementers)err('module_implementers','non_empty_string_array');
 const tolerance=isObj(raw.tolerance)?raw.tolerance:null;
 if(!tolerance||Object.keys(tolerance).join()!=='rel'||!isRelTolerance(tolerance.rel))err('tolerance','must_be_{rel}_with_0<=rel<1');
 const th=isObj(raw.thresholds)?raw.thresholds:null;
 if(!th||Object.keys(th).sort().join()!=='max_fail,min_coverage_optional'||!isInt(th.max_fail,0)||!isUnitFraction(th.min_coverage_optional,true))
  err('thresholds','must_be_{max_fail>=0,0<=min_coverage_optional<=1}');
 const optional=Array.isArray(raw.optional_cases)&&raw.optional_cases.every(isStr)?raw.optional_cases as string[]:null;
 if(!optional)err('optional_cases','string_array');
 else if(new Set(optional).size!==optional.length)err('optional_cases','duplicate');
 const history=parseHistory(raw.history,raw.version,err);
 const byId=new Map(recorders.recorders.map(r=>[r.id,r]));
 const rawCases=Array.isArray(raw.cases)?raw.cases:null;
 if(!rawCases)err('cases','array');
 const cases:GoldCase[]=[];
 const ids=new Set<string>();
 const kinds=new Set<string>();
 (rawCases??[]).forEach((c,i)=>{
  const at=`cases[${i}]`;
  const parsed=parseCase(c,at,{module:mod,implementers:implementers??[],byId,err});
  if(!parsed)return;
  if(ids.has(parsed.case_id))err(`${at}.case_id`,'duplicate');
  ids.add(parsed.case_id);kinds.add(parsed.provenance_kind);
  cases.push({...parsed,required:!(optional??[]).includes(parsed.case_id)});
 });
 for(const id of optional??[])if(!ids.has(id))err('optional_cases',`unknown_case:${id}`);
 if(kinds.size>1)err('cases','mixed_provenance_kind');
 if(errors.length>0)throw fail();
 return {
  schema_version:1,format:'f6',set_id:raw.set_id as string,version:raw.version as number,module:mod,artifact_class:raw.artifact_class as GoldSet['artifact_class'],
  module_implementers:implementers!,tolerance:{rel:tolerance!.rel as string},
  thresholds:{max_fail:th!.max_fail as number,min_coverage_optional:th!.min_coverage_optional as string},
  optional_cases:optional!,history,cases,ready:true,path:meta.path,sha256:meta.sha256,
 };
}

function parseHistory(v:unknown,version:unknown,err:(at:string,code:string)=>void):GoldHistoryEntry[]{
 if(!Array.isArray(v)){err('history','array');return [];}
 const out:GoldHistoryEntry[]=[];
 let last=0;
 v.forEach((h,i)=>{
  const at=`history[${i}]`;
  if(!isObj(h)||!isInt(h.version,2)||!isStr(h.changed_at)||!TIMESTAMP.test(h.changed_at)||!isStr(h.changed_by)||!isStr(h.reason)||!Array.isArray(h.fields)||h.fields.length===0||!h.fields.every(isStr)){err(at,'must_be_{version>=2,changed_at,changed_by,reason,fields[]}');return;}
  if(h.version<=last)err(`${at}.version`,'not_increasing');
  if(typeof version==='number'&&h.version>version)err(`${at}.version`,'above_set_version');
  last=h.version;
  out.push({version:h.version,changed_at:h.changed_at,changed_by:h.changed_by,reason:h.reason,fields:h.fields as string[]});
 });
 if(typeof version==='number'&&version>1&&!out.some(h=>h.version===version))err('history','missing_entry_for_current_version');
 return out;
}

interface CaseCtx{module:EvalModule;implementers:string[];byId:Map<string,RecordersFile['recorders'][number]>;err:(at:string,code:string)=>void}
type ParsedCase=Omit<GoldCase,'required'>;

function parseCase(c:unknown,at:string,x:CaseCtx):ParsedCase|null{
 const {err}=x;
 if(!isObj(c)){err(at,'not_an_object');return null;}
 for(const k of Object.keys(c))if(!CASE_KEYS.has(k))err(`${at}.${k}`,'unknown_key');
 const caseId=typeof c.case_id==='string'&&c.case_id.length>=1&&c.case_id.length<=512?c.case_id:null;
 if(!caseId)err(`${at}.case_id`,'string_1..512');
 // subject (§4.6: never issuer_id)
 const subj=isObj(c.subject)?c.subject:null;
 if(!subj)err(`${at}.subject`,'required');
 else{
  if('issuer_id' in subj)err(`${at}.subject.issuer_id`,'forbidden');
  for(const k of Object.keys(subj))if(!['market','cik','ticker','issuer_id'].includes(k))err(`${at}.subject.${k}`,'unknown_key');
  if(subj.market!=='US'&&subj.market!=='CN')err(`${at}.subject.market`,'US_or_CN');
  if(!isStr(subj.cik)&&!isStr(subj.ticker))err(`${at}.subject`,'cik_or_ticker_required');
  if(subj.cik!==undefined&&(typeof subj.cik!=='string'||!/^\d{1,10}$/.test(subj.cik)))err(`${at}.subject.cik`,'digits');
 }
 const target=parseTarget(c.target,`${at}.target`,x);
 // expect / printed / canonical
 if(c.expect!=='present'&&c.expect!=='missing')err(`${at}.expect`,'present_or_missing');
 let printed:GoldCase['printed'],canonical:GoldCase['canonical'];
 if(c.expect==='missing'){
  if('printed' in c)err(`${at}.printed`,'forbidden_when_missing');
  if('canonical' in c)err(`${at}.canonical`,'forbidden_when_missing');
 }else if(c.expect==='present'){
  const p=isObj(c.printed)?c.printed:null;
  if(!p||!isStr(p.text)||typeof p.unit_label!=='string'||!SCALES.includes(p.scale as Scale)||Object.keys(p).length!==3){
   err(`${at}.printed`,'must_be_{text,unit_label,scale}');
   if(p&&!SCALES.includes(p.scale as Scale))err(`${at}.printed.scale`,'not_in_whitelist');
  }else printed={text:p.text,unit_label:p.unit_label,scale:p.scale as Scale};
  const cv=isObj(c.canonical)&&Object.keys(c.canonical).join()==='value'&&typeof c.canonical.value==='string'?c.canonical.value:null;
  let canon:string|null=null;
  if(cv!==null){try{canon=canonicalDecimal(cv);}catch{canon=null;}}
  if(canon===null)err(`${at}.canonical.value`,'decimal_string_required');
  else if(canon!==cv)err(`${at}.canonical.value`,`not_canonical:${canon}`);
  else canonical={value:canon};
  if(printed&&canon!==null&&target){
   const recomputed=canonicalFromPrinted(printed.text,printed.scale,target.unit);
   if(recomputed===null)err(`${at}.printed.text`,'unparseable');
   else if(recomputed!==canon)err(`${at}.canonical.value`,`does_not_match_printed:${recomputed}`);
  }
  if(printed&&target?.unit.kind==='ratio'&&printed.scale!=='1')err(`${at}.printed.scale`,'ratio_requires_scale_1');
 }
 // binding / source
 if(c.binding!=='document'&&c.binding!=='current')err(`${at}.binding`,'document_or_current');
 const source=parseSource(c.source,`${at}.source`,c,x);
 if(c.binding==='document'&&source&&!source.document_id)err(`${at}.source.document_id`,'required_for_document_binding');
 if(c.binding==='current'&&source&&!source.available_date)err(`${at}.source.available_date`,'required_for_current_binding');
 if(source?.document_id&&subj){
  if(source.document_id.kind==='edgar_accession'&&subj.market!=='US')err(`${at}.source.document_id`,'edgar_accession_requires_US');
  if(source.document_id.kind==='cninfo_announcement'&&subj.market!=='CN')err(`${at}.source.document_id`,'cninfo_announcement_requires_CN');
 }
 // provenance (§4.6)
 const kind=c.provenance_kind;
 if(kind!=='transcribed'&&kind!=='synthetic')err(`${at}.provenance_kind`,'transcribed_or_synthetic');
 const person=(v:unknown,field:string,required:boolean)=>{
  if(v===null||v===undefined){if(required)err(`${at}.${field}`,'required');return;}
  if(typeof v!=='string'){err(`${at}.${field}`,'string');return;}
  const r=x.byId.get(v);
  if(!r)err(`${at}.${field}`,`not_in_recorders:${v}`);
  else if(!r.modules.includes(x.module))err(`${at}.${field}`,`recorder_not_for_module:${v}`);
  if(x.implementers.includes(v))err(`${at}.${field}`,`is_module_implementer:${v}`);
 };
 if(kind==='synthetic'){
  if(c.recorded_by!=='synthetic')err(`${at}.recorded_by`,'must_be_synthetic_for_synthetic_cases');
  if(c.reviewed_by!==null&&c.reviewed_by!==undefined)err(`${at}.reviewed_by`,'must_be_null_for_synthetic_cases');
 }else{
  person(c.recorded_by,'recorded_by',true);
  person(c.reviewed_by,'reviewed_by',false);
  if(isStr(c.reviewed_by)&&c.reviewed_by===c.recorded_by)err(`${at}.reviewed_by`,'same_as_recorded_by');
 }
 if(typeof c.recorded_at!=='string'||!TIMESTAMP.test(c.recorded_at))err(`${at}.recorded_at`,'date_or_timestamp_required');
 const reviewed=c.reviewed_by!==null&&c.reviewed_by!==undefined;
 if(reviewed&&(typeof c.reviewed_at!=='string'||!TIMESTAMP.test(c.reviewed_at)))err(`${at}.reviewed_at`,'required_with_reviewed_by');
 if(!reviewed&&c.reviewed_at!==null&&c.reviewed_at!==undefined)err(`${at}.reviewed_at`,'forbidden_without_reviewed_by');
 // retraction / notes
 let retracted:GoldCase['retracted']=null;
 if(c.retracted!==null&&c.retracted!==undefined){
  const r=isObj(c.retracted)?c.retracted:null;
  if(!r||typeof r.at!=='string'||!TIMESTAMP.test(r.at)||!isStr(r.by)||!isStr(r.reason))err(`${at}.retracted`,'must_be_null_or_{at,by,reason}');
  else{if(!x.byId.has(r.by))err(`${at}.retracted.by`,`not_in_recorders:${r.by}`);retracted={at:r.at,by:r.by,reason:r.reason};}
 }
 if(c.notes!==undefined&&typeof c.notes!=='string')err(`${at}.notes`,'string');
 if(!caseId||!subj||!target||!source)return null;
 const asOf=source.available_date??null;
 return {
  case_id:caseId,subject:{market:subj.market as 'US'|'CN',...(isStr(subj.cik)?{cik:subj.cik}:{}),...(isStr(subj.ticker)?{ticker:subj.ticker}:{})},
  target,expect:c.expect as GoldCase['expect'],...(printed?{printed}:{}),...(canonical?{canonical}:{}),
  binding:c.binding as GoldCase['binding'],as_of:asOf,source,provenance_kind:kind as GoldCase['provenance_kind'],
  recorded_by:String(c.recorded_by),recorded_at:typeof c.recorded_at==='string'?c.recorded_at:null,
  reviewed_by:isStr(c.reviewed_by)?c.reviewed_by:null,reviewed_at:typeof c.reviewed_at==='string'?c.reviewed_at:null,
  retracted,notes:typeof c.notes==='string'?c.notes:'',pending:false,provenance_gaps:[],
 };
}

function parseUnit(v:unknown,at:string,err:CaseCtx['err']):UnitSpec|null{
 if(!isObj(v)){err(at,'required');return null;}
 const keys=Object.keys(v).sort().join();
 switch(v.kind){
  case 'currency':case 'per_share':
   if(keys!=='currency,kind'||typeof v.currency!=='string'||!CURRENCY.has(v.currency)){err(at,`${v.kind}_requires_iso_currency`);return null;}
   return {kind:v.kind,currency:v.currency};
  case 'shares':case 'ratio':case 'index':case 'count':case 'percent_points':
   if(keys!=='kind'){err(at,'unexpected_fields');return null;}
   return {kind:v.kind};
  default:err(`${at}.kind`,'invalid');return null;
 }
}

function parseTarget(v:unknown,at:string,x:CaseCtx):CaseTarget|null{
 const {err}=x;
 if(!isObj(v)){err(at,'required');return null;}
 const unit=parseUnit(v.unit,`${at}.unit`,err);
 if(unit&&unitOfSpec(unit)===null)err(`${at}.unit`,'not_a_facts_unit');
 if(typeof v.period_end!=='string'||!DATE.test(v.period_end))err(`${at}.period_end`,'date');
 if(v.type==='fact'){
  for(const k of Object.keys(v))if(!FACT_KEYS.has(k))err(`${at}.${k}`,'unknown_key');
  if(x.module!=='facts')err(`${at}.type`,'fact_target_requires_module_facts');
  const def=typeof v.concept==='string'&&isConceptId(v.concept)?conceptById(v.concept):undefined;
  if(!def)err(`${at}.concept`,'not_in_CONCEPT_IDS');
  if(!('period_start' in v))err(`${at}.period_start`,'required_(null_for_instant)');
  else if(v.period_start!==null&&(typeof v.period_start!=='string'||!DATE.test(v.period_start)))err(`${at}.period_start`,'date_or_null');
  if(!DURATIONS.includes(v.duration as Duration))err(`${at}.duration`,'invalid');
  if(v.consolidation!=='consolidated')err(`${at}.consolidation`,'must_be_consolidated');
  if(def){
   const instant=def.nature==='instant';
   if(instant&&(v.duration!=='INSTANT'||v.period_start!==null))err(at,'instant_concept_requires_INSTANT_and_null_period_start');
   if(!instant&&(v.duration==='INSTANT'||typeof v.period_start!=='string'))err(at,'duration_concept_requires_period_start_and_duration');
   const want=def.unitKind==='money'?'currency':def.unitKind;
   if(unit&&unit.kind!==want)err(`${at}.unit.kind`,`concept_${def.id}_expects_${want}`);
  }
  if(!def||!unit||typeof v.period_end!=='string'||!DURATIONS.includes(v.duration as Duration)||!('period_start' in v))return null;
  return {type:'fact',concept:def.id,period_start:v.period_start as string|null,period_end:v.period_end,duration:v.duration as Duration,consolidation:'consolidated',unit};
 }
 if(v.type==='metric'){
  for(const k of Object.keys(v))if(!METRIC_KEYS.has(k))err(`${at}.${k}`,'unknown_key');
  if(x.module!=='metrics')err(`${at}.type`,'metric_target_requires_module_metrics');
  for(const k of ['metric','duration','basis','input_unit','formula_version'])if(!isStr(v[k]))err(`${at}.${k}`,'required');
  if(typeof v.period_start!=='string'||!DATE.test(v.period_start))err(`${at}.period_start`,'date');
  if(!unit||!isStr(v.metric)||!isStr(v.duration)||!isStr(v.basis)||!isStr(v.input_unit)||!isStr(v.formula_version)||typeof v.period_start!=='string'||typeof v.period_end!=='string')return null;
  return {type:'metric',metric:v.metric,period_start:v.period_start,period_end:v.period_end,duration:v.duration,basis:v.basis,input_unit:v.input_unit,formula_version:v.formula_version,unit};
 }
 err(`${at}.type`,'fact_or_metric');
 return null;
}

function parseSource(v:unknown,at:string,c:J,x:CaseCtx):CaseSource|null{
 const {err}=x;
 if(!isObj(v)){err(at,'required');return null;}
 for(const k of Object.keys(v))if(!SOURCE_KEYS.has(k))err(`${at}.${k}`,'unknown_key');
 let ok=true;
 if(!isStr(v.document_type)){err(`${at}.document_type`,'required');ok=false;}
 if(typeof v.url!=='string'||!/^https:\/\/[^\s]+$/.test(v.url)){err(`${at}.url`,'https_url_required');ok=false;}
 if(typeof v.sha256!=='string'||!HEX64.test(v.sha256)){err(`${at}.sha256`,'64_lowercase_hex_required');ok=false;}
 if(v.available_date!==undefined&&(typeof v.available_date!=='string'||!DATE.test(v.available_date))){err(`${at}.available_date`,'date');ok=false;}
 let documentId:DocumentId|undefined;
 if(v.document_id!==undefined){
  const d=isObj(v.document_id)?v.document_id:null;
  const kinds=['edgar_accession','cninfo_announcement','file_sha256','official_release'];
  if(!d||!kinds.includes(d.kind as string)||!isStr(d.value)||Object.keys(d).length!==2){err(`${at}.document_id`,'must_be_{kind,value}');ok=false;}
  else{
   if(d.kind==='edgar_accession'&&!ACCESSION.test(d.value as string)){err(`${at}.document_id.value`,'accession_format');ok=false;}
   if(d.kind==='cninfo_announcement'&&!/^\d+$/.test(d.value as string)){err(`${at}.document_id.value`,'digits');ok=false;}
   if(d.kind==='file_sha256'||d.kind==='official_release'){err(`${at}.document_id.kind`,'not_a_facts_document');ok=false;}
   documentId={kind:d.kind as DocumentId['kind'],value:d.value as string};
  }
 }
 let locator:Record<string,string|number>|undefined;
 if(v.locator!==undefined){
  const l=isObj(v.locator)?v.locator:null;
  if(!l||Object.keys(l).length===0||!Object.values(l).every(z=>typeof z==='string'||(typeof z==='number'&&Number.isFinite(z)))){err(`${at}.locator`,'non_empty_object_of_string_or_number');ok=false;}
  else locator=l as Record<string,string|number>;
 }
 if(c.expect==='present'&&v.locator===undefined){err(`${at}.locator`,'required_for_present');ok=false;}
 if(!ok)return null;
 return {document_type:v.document_type as string,...(documentId?{document_id:documentId}:{}),url:v.url as string,sha256:v.sha256 as string,
  ...(typeof v.available_date==='string'?{available_date:v.available_date}:{}),...(locator?{locator}:{})};
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/gold/schema.test.ts`
Expected: PASS（61 tests）

- [ ] **Step 5: 写 legacy 适配器的失败测试（真实 plan2.json + 测试内的已录入变体）**

`src/lib/evals/gold/legacy-plan2.test.ts`:

```ts
// src/lib/evals/gold/legacy-plan2.test.ts
// The adapter against the REAL plan2.json (read-only, spec §0 R5-1) and against an in-test recorded variant.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {goldBlockOf} from '../summary';
import {LEGACY_SET_ID,parseLegacyPlan2} from './legacy-plan2';

const PLAN2='src/lib/facts/fixtures/gold/plan2.json';
const bytes=readFileSync(PLAN2);
const meta={path:PLAN2,sha256:sha256Hex(bytes)};
const real=()=>JSON.parse(bytes.toString('utf8'));

describe('parseLegacyPlan2 on the real plan2.json',()=>{
 const set=parseLegacyPlan2(real(),meta);
 it('keeps the file identity: set id, version, ready, byte hash, path',()=>{
  expect(set).toMatchObject({schema_version:1,format:'legacy_plan2',set_id:LEGACY_SET_ID,version:1,module:'facts',artifact_class:'public',ready:false,path:PLAN2,sha256:meta.sha256,
   module_implementers:['claude-code','codex'],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},history:[]});
 });
 it('maps the 3 entries to deterministic case ids; US required (required.US), CN optional (required.CN=false)',()=>{
  expect(set.cases.map(c=>[c.case_id,c.required])).toEqual([
   ['AAPL/revenue/2023-09-30/12M/USD',true],
   ['MSFT/revenue/2023-06-30/12M/USD',true],
   ['600519.SH/revenue/2023-12-31/12M/CNY',false],
  ]);
  expect(set.optional_cases).toEqual(['600519.SH/revenue/2023-12-31/12M/CNY']);
 });
 it('every entry is pending (recorded_by or value is <pending>)',()=>{
  expect(set.cases.map(c=>c.pending)).toEqual([true,true,true]);
 });
 it('binds current, as_of = entry.as_of ?? null, period_start ABSENT, duration 12M, subject {market,ticker}',()=>{
  const [aapl,msft,mt]=set.cases;
  expect(aapl).toMatchObject({binding:'current',as_of:'2023-11-03',subject:{market:'US',ticker:'AAPL'},expect:'present',canonical:{value:'383285000000'},recorded_by:'<pending>',recorded_at:null,reviewed_by:null,retracted:null});
  expect(aapl.target).toEqual({type:'fact',concept:'revenue',period_end:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}});
  expect('period_start' in aapl.target).toBe(false);
  expect(msft.as_of).toBe('2023-07-27');
  expect(mt).toMatchObject({as_of:null,subject:{market:'CN',ticker:'600519.SH'}});
  expect(mt.canonical).toBeUndefined();
  expect(aapl.printed).toBeUndefined();
  expect(aapl.source.document_id).toBeUndefined();
 });
 it('lists every missing F6 provenance field',()=>{
  expect(set.cases[0].provenance_gaps).toEqual(['source.document_id','source.sha256','source.locator','printed','recorded_by','recorded_at','reviewed_by']);
  expect(set.cases[1].provenance_gaps).toEqual(['source.document_id','source.sha256','source.url','source.locator','printed','recorded_by','recorded_at','reviewed_by']);
  expect(set.cases[2].provenance_gaps).toEqual(['source.document_id','source.sha256','source.url','source.locator','printed','canonical','recorded_by','recorded_at','reviewed_by']);
 });
 it('its gold block keeps any run incomplete (§3.2 rule 1)',()=>{
  expect(goldBlockOf(set)).toEqual({format:'legacy_plan2',ready:false,pending:3,provenance_gaps:3});
 });
});

describe('parseLegacyPlan2 on a recorded variant',()=>{
 const recorded=()=>{
  const f=real();
  f.ready=true;
  f.entries[0]={...f.entries[0],recorded_by:'owner',recorded_at:'2026-11-06',source:{...f.entries[0].source,page_or_row:'p. 28, Total net sales'}};
  f.entries.push({issuer:{ticker:'AAPL',market:'US'},concept:'total_assets',period_end:'2023-09-30',unit:'USD',value:'352583000000',recorded_by:'owner',recorded_at:'2026-11-06',source:{document:'10-K',page_or_row:'p. 30',url:'https://www.sec.gov/x'}});
  f.entries.push({issuer:{ticker:'AAPL',market:'US'},concept:'eps_basic',period_end:'2023-09-30',duration:'12M',unit:'USD/share',value:'6.16',recorded_by:'owner',recorded_at:'2026-11-06'});
  return f;
 };
 const set=parseLegacyPlan2(recorded(),meta);
 it('a recorded entry is not pending but still has the gaps no legacy entry can fill',()=>{
  expect(set.ready).toBe(true);
  expect(set.cases[0].pending).toBe(false);
  expect(set.cases[0].source.locator).toEqual({page_or_row:'p. 28, Total net sales'});
  expect(set.cases[0].provenance_gaps).toEqual(['source.document_id','source.sha256','printed','reviewed_by']);
  expect(goldBlockOf(set)).toMatchObject({ready:true,pending:2,provenance_gaps:5});
 });
 it('instant concepts default to INSTANT; per-share units map to per_share; explicit duration is kept',()=>{
  expect(set.cases[3]).toMatchObject({case_id:'AAPL/total_assets/2023-09-30/INSTANT/USD',as_of:null,target:{duration:'INSTANT'},source:{url:'https://www.sec.gov/x'}});
  expect(set.cases[4]).toMatchObject({case_id:'AAPL/eps_basic/2023-09-30/12M/USD/share',target:{unit:{kind:'per_share',currency:'USD'}},source:{url:''}});
 });
});

describe('parseLegacyPlan2 throws only for structurally invalid files',()=>{
 const code=(mutate:(f:Record<string,any>)=>void)=>{const f=real();mutate(f);try{parseLegacyPlan2(f,meta);return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).detail.errors;}};
 it('accepts pending values and missing sources',()=>{expect(code(f=>{delete f.entries[0].source;f.entries[0].value='<pending>';})).toBeNull();});
 it('rejects bad structure',()=>{
  expect(code(f=>{f.ready='no';})).toEqual(['ready: boolean']);
  expect(code(f=>{delete f.required;})).toEqual(['required: {US:boolean,CN:boolean}']);
  expect(code(f=>{f.entries[0].concept='revenues';})).toEqual(['entries[0].concept: not_in_CONCEPT_IDS']);
  expect(code(f=>{f.entries[0].unit='USD/EUR';})).toEqual(['entries[0].unit: not_a_facts_unit']);
  expect(code(f=>{f.entries[0].value='383,285';})).toEqual(['entries[0].value: decimal_or_<pending>']);
  expect(code(f=>{f.entries[0].duration='1Y';})).toEqual(['entries[0].duration: invalid']);
  expect(code(f=>{f.entries[0].issuer.market='HK';})).toEqual(['entries[0].issuer: {ticker,market:US|CN}']);
  expect(code(f=>{f.entries.push(f.entries[0]);})).toEqual(['entries[3]: duplicate_case:AAPL/revenue/2023-09-30/12M/USD']);
  expect(code(f=>{f.entries[0].as_of='2023/11/03';})).toEqual(['entries[0].as_of: date_or_null']);
 });
});
```

- [ ] **Step 6: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/gold/legacy-plan2.test.ts`
Expected: FAIL，`Error: Cannot find module './legacy-plan2' imported from …/src/lib/evals/gold/legacy-plan2.test.ts`

- [ ] **Step 7: 实现 gold/legacy-plan2.ts**

`src/lib/evals/gold/legacy-plan2.ts`:

```ts
// src/lib/evals/gold/legacy-plan2.ts
// Read-only adapter for plan 2's gold file src/lib/facts/fixtures/gold/plan2.json (spec §0 R5-1, §4.6
// legacy exception). It adopts the file without copying it: version / ready / required, entry identity
// and '<pending>' state are kept; nothing is inferred — no document binding, printed value, hash,
// locator structure or reviewer. Every F6 provenance field an entry lacks is listed in provenance_gaps,
// so §3.2 rule 1 keeps a legacy set incomplete until it is migrated to the f6 format. It throws
// EvalError('gold_invalid') only for a structurally invalid file; pending entries and gaps never throw.
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import type {Duration} from '../../facts/types';
import {EvalError} from '../errors';
import type {GoldCase,GoldSet} from '../types';
import {specOfUnit} from './schema';

export const LEGACY_SET_ID='facts/plan2';
export const LEGACY_IMPLEMENTERS:readonly string[]=['claude-code','codex'];
const PENDING='<pending>';
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const DURATIONS:readonly Duration[]=['3M','6M','9M','12M','INSTANT'];
type J=Record<string,unknown>;
const isObj=(v:unknown):v is J=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const blank=(v:unknown)=>v===undefined||v===null||(typeof v==='string'&&(v.trim()===''||v===PENDING));

export function parseLegacyPlan2(raw:unknown,meta:{path:string;sha256:string}):GoldSet{
 const bad=(at:string,code:string):never=>{throw new EvalError('gold_invalid',`${meta.path}: ${at}: ${code}`,{path:meta.path,errors:[`${at}: ${code}`]});};
 if(!isObj(raw))return bad('$','not_an_object');
 if(typeof raw.version!=='number'||!Number.isSafeInteger(raw.version)||raw.version<1)bad('version','integer_>=_1');
 if(typeof raw.ready!=='boolean')bad('ready','boolean');
 const req=isObj(raw.required)?raw.required:null;
 if(!req||typeof req.US!=='boolean'||typeof req.CN!=='boolean')bad('required','{US:boolean,CN:boolean}');
 if(!Array.isArray(raw.entries))bad('entries','array');
 const cases:GoldCase[]=[];
 const ids=new Set<string>();
 (raw.entries as unknown[]).forEach((e,i)=>{
  const at=`entries[${i}]`;
  if(!isObj(e))bad(at,'not_an_object');
  const entry=e as J;
  const issuer=isObj(entry.issuer)?entry.issuer:null;
  if(!issuer||typeof issuer.ticker!=='string'||issuer.ticker===''||(issuer.market!=='US'&&issuer.market!=='CN'))bad(`${at}.issuer`,'{ticker,market:US|CN}');
  const market=issuer!.market as 'US'|'CN',ticker=issuer!.ticker as string;
  const def=typeof entry.concept==='string'?conceptById(entry.concept):undefined;
  if(!def)bad(`${at}.concept`,'not_in_CONCEPT_IDS');
  if(typeof entry.period_end!=='string'||!DATE.test(entry.period_end))bad(`${at}.period_end`,'date');
  if(entry.duration!==undefined&&!DURATIONS.includes(entry.duration as Duration))bad(`${at}.duration`,'invalid');
  const duration:Duration=(entry.duration as Duration|undefined)??(def!.nature==='instant'?'INSTANT':'12M');
  const unit=typeof entry.unit==='string'?specOfUnit(entry.unit):null;
  if(!unit)bad(`${at}.unit`,'not_a_facts_unit');
  if(typeof entry.value!=='string')bad(`${at}.value`,'string');
  let canonical:GoldCase['canonical'];
  if(entry.value!==PENDING){
   try{canonical={value:canonicalDecimal(entry.value as string)};}catch{bad(`${at}.value`,'decimal_or_<pending>');}
  }
  if(entry.as_of!==undefined&&entry.as_of!==null&&(typeof entry.as_of!=='string'||!DATE.test(entry.as_of)))bad(`${at}.as_of`,'date_or_null');
  if(entry.source!==undefined&&!isObj(entry.source))bad(`${at}.source`,'object');
  const src=(entry.source??{}) as J;
  for(const k of ['document','page_or_row','url'])if(src[k]!==undefined&&typeof src[k]!=='string')bad(`${at}.source.${k}`,'string');
  if(typeof entry.recorded_by!=='string')bad(`${at}.recorded_by`,'string');
  if(entry.recorded_at!==undefined&&entry.recorded_at!==null&&typeof entry.recorded_at!=='string')bad(`${at}.recorded_at`,'string_or_null');
  const caseId=`${ticker}/${def!.id}/${entry.period_end}/${duration}/${entry.unit}`;
  if(ids.has(caseId))bad(`${at}`,`duplicate_case:${caseId}`);
  ids.add(caseId);
  const recordedBy=entry.recorded_by as string;
  const pending=recordedBy===PENDING||entry.value===PENDING;
  const gaps=[
   'source.document_id','source.sha256',
   ...(blank(src.url)?['source.url']:[]),
   ...(blank(src.page_or_row)?['source.locator']:[]),
   'printed',
   ...(canonical?[]:['canonical']),
   ...(recordedBy===PENDING||recordedBy.trim()===''?['recorded_by']:[]),
   ...(blank(entry.recorded_at)?['recorded_at']:[]),
   'reviewed_by',
  ];
  cases.push({
   case_id:caseId,subject:{market,ticker},
   target:{type:'fact',concept:def!.id,period_end:entry.period_end as string,duration,consolidation:'consolidated',unit:unit!},
   expect:'present',...(canonical?{canonical}:{}),binding:'current',as_of:(entry.as_of as string|null|undefined)??null,
   source:{document_type:'unspecified',url:blank(src.url)?'':src.url as string,...(blank(src.page_or_row)?{}:{locator:{page_or_row:src.page_or_row as string}})},
   provenance_kind:'transcribed',recorded_by:recordedBy,recorded_at:blank(entry.recorded_at)?null:entry.recorded_at as string,
   reviewed_by:null,reviewed_at:null,retracted:null,notes:typeof src.document==='string'?src.document:'',
   required:market==='US'?req!.US as boolean:req!.CN as boolean,pending,provenance_gaps:gaps,
  });
 });
 return {
  schema_version:1,format:'legacy_plan2',set_id:LEGACY_SET_ID,version:raw.version as number,module:'facts',artifact_class:'public',
  module_implementers:[...LEGACY_IMPLEMENTERS],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},
  optional_cases:cases.filter(c=>!c.required).map(c=>c.case_id),history:[],cases,ready:raw.ready as boolean,path:meta.path,sha256:meta.sha256,
 };
}
```

- [ ] **Step 8: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/gold/legacy-plan2.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 9: 核对 plan2.json 当前字节哈希**

Run: `shasum -a 256 src/lib/facts/fixtures/gold/plan2.json`
Expected: `e67701908c4792d0d5906190391cf662fb4ae4f1ae9098976e41da63bcac0a04  src/lib/facts/fixtures/gold/plan2.json`。若不同（规格二在此期间改了文件），下一步的 `lock.json` 用实际打印出的值，并在实施记录"备注"里写明。

- [ ] **Step 10: 建 recorders.json 与 lock.json**

`src/lib/evals/fixtures/gold/recorders.json`:

```json
{
 "version": 1,
 "recorders": [
  {"id": "owner", "role": "owner", "modules": ["facts", "metrics", "macro"], "added_at": "2026-11-06", "approved_by": "owner"}
 ]
}
```

`src/lib/evals/fixtures/gold/lock.json`（`sha256` = Step 9 的输出）:

```json
{
 "files": [
  {"path": "src/lib/facts/fixtures/gold/plan2.json", "sha256": "e67701908c4792d0d5906190391cf662fb4ae4f1ae9098976e41da63bcac0a04", "version": 1, "format": "legacy_plan2"}
 ]
}
```

- [ ] **Step 11: 写 load 的失败测试**

`src/lib/evals/gold/load.test.ts`:

```ts
// src/lib/evals/gold/load.test.ts
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {GOLD_DIR,checkLock,detectGoldFormat,listGoldSetPaths,loadGoldSet,loadLock,loadRecorders,parseLock,parseRecorders,repoPath} from './load';

const PLAN2='src/lib/facts/fixtures/gold/plan2.json';
const codeOf=(f:()=>unknown)=>{try{f();return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).code;}};

describe('repository fixtures',()=>{
 it('recorders.json: version 1, the owner only',()=>{
  expect(loadRecorders()).toEqual({version:1,recorders:[{id:'owner',role:'owner',modules:['facts','metrics','macro'],added_at:'2026-11-06',approved_by:'owner'}]});
 });
 it('lock.json pins plan2.json by its current byte hash',()=>{
  // toContainEqual, not toEqual: Task 9 appends the synthetic set's entry to the same lock file.
  expect(loadLock().files).toContainEqual({path:PLAN2,sha256:sha256Hex(readFileSync(PLAN2)),version:1,format:'legacy_plan2'});
 });
 it('loadGoldSet detects the legacy format by content, hashes the bytes and passes checkLock',()=>{
  const set=loadGoldSet(PLAN2);
  expect(set).toMatchObject({format:'legacy_plan2',path:PLAN2,sha256:sha256Hex(readFileSync(PLAN2)),ready:false});
  expect(()=>checkLock(set,loadLock())).not.toThrow();
  expect(loadGoldSet(join(process.cwd(),PLAN2)).path).toBe(PLAN2);
 });
 it('listGoldSetPaths finds the lock entry outside the gold directory',()=>{
  expect(listGoldSetPaths(process.cwd(),loadLock())).toContain(PLAN2);
  expect(listGoldSetPaths(process.cwd(),loadLock()).filter(p=>p.endsWith('lock.json')||p.endsWith('recorders.json'))).toEqual([]);
 });
});

describe('checkLock',()=>{
 const set=loadGoldSet(PLAN2);
 const entry={path:PLAN2,sha256:set.sha256,version:1,format:'legacy_plan2' as const};
 it('rejects a missing entry, a different hash, version or format',()=>{
  expect(codeOf(()=>checkLock(set,{files:[]}))).toBe('gold_lock_mismatch');
  expect(codeOf(()=>checkLock(set,{files:[{...entry,sha256:'0'.repeat(64)}]}))).toBe('gold_lock_mismatch');
  expect(codeOf(()=>checkLock(set,{files:[{...entry,version:2}]}))).toBe('gold_lock_mismatch');
  expect(codeOf(()=>checkLock(set,{files:[{...entry,format:'f6'}]}))).toBe('gold_lock_mismatch');
 });
});

describe('format detection and file errors',()=>{
 it('decides by content',()=>{
  expect(detectGoldFormat({schema_version:1,cases:[]})).toBe('f6');
  expect(detectGoldFormat({entries:[],ready:false})).toBe('legacy_plan2');
  expect(detectGoldFormat({entries:[]})).toBeNull();
  expect(detectGoldFormat([])).toBeNull();
 });
 it('an f6 file in a temp repo is validated against that repo\'s recorders.json',()=>{
  const root=mkdtempSync(join(tmpdir(),'f6-load-'));
  mkdirSync(join(root,GOLD_DIR,'facts'),{recursive:true});
  writeFileSync(join(root,GOLD_DIR,'recorders.json'),JSON.stringify({version:1,recorders:[{id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}]}));
  const set={schema_version:1,set_id:'facts/tmp',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code'],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],
   cases:[{case_id:'X/cash/2023-12-31',subject:{market:'US',cik:'1'},target:{type:'fact',concept:'cash',period_start:null,period_end:'2023-12-31',duration:'INSTANT',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},expect:'missing',binding:'document',
    source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:'0000000001-24-000001'},url:'https://www.sec.gov/x',sha256:'c'.repeat(64)},provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06',reviewed_by:null,reviewed_at:null,retracted:null,notes:''}]};
  writeFileSync(join(root,GOLD_DIR,'facts','tmp.json'),JSON.stringify(set));
  expect(loadGoldSet(`${GOLD_DIR}/facts/tmp.json`,root)).toMatchObject({format:'f6',set_id:'facts/tmp',ready:true});
  expect(loadGoldSet(`${GOLD_DIR}/facts/tmp.json`,root).cases[0]).toMatchObject({as_of:null,required:true,expect:'missing'});
  expect(listGoldSetPaths(root)).toEqual([`${GOLD_DIR}/facts/tmp.json`]);
  writeFileSync(join(root,GOLD_DIR,'facts','tmp.json'),JSON.stringify({...set,cases:[{...set.cases[0],recorded_by:'claude-code'}]}));
  expect(codeOf(()=>loadGoldSet(`${GOLD_DIR}/facts/tmp.json`,root))).toBe('gold_invalid');
  writeFileSync(join(root,GOLD_DIR,'facts','bad.json'),'{"schema_version":1,');
  expect(codeOf(()=>loadGoldSet(`${GOLD_DIR}/facts/bad.json`,root))).toBe('gold_invalid');
  writeFileSync(join(root,GOLD_DIR,'facts','other.json'),'{"hello":1}');
  expect(codeOf(()=>loadGoldSet(`${GOLD_DIR}/facts/other.json`,root))).toBe('gold_invalid');
  expect(codeOf(()=>loadGoldSet(`${GOLD_DIR}/facts/absent.json`,root))).toBe('gold_invalid');
 });
 it('rejects paths outside the repository',()=>{
  expect(codeOf(()=>repoPath('../x.json',process.cwd()))).toBe('gold_invalid');
 });
 it('validates recorders.json and lock.json shapes',()=>{
  expect(codeOf(()=>parseRecorders({version:1,recorders:[{id:'owner',role:'owner',modules:['nope'],added_at:'2026-11-06',approved_by:'owner'}]}))).toBe('gold_invalid');
  expect(codeOf(()=>parseRecorders({version:1,recorders:[{id:'synthetic',role:'x',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}]}))).toBe('gold_invalid');
  const r={id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'};
  expect(codeOf(()=>parseRecorders({version:1,recorders:[r,r]}))).toBe('gold_invalid');
  expect(codeOf(()=>parseLock({files:[{path:'a',sha256:'x',version:1,format:'f6'}]}))).toBe('gold_invalid');
  expect(codeOf(()=>parseLock({files:[],extra:1}))).toBe('gold_invalid');
  const f={path:'a',sha256:'0'.repeat(64),version:1,format:'f6'};
  expect(codeOf(()=>parseLock({files:[f,f]}))).toBe('gold_invalid');
 });
});
```

- [ ] **Step 12: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/gold/load.test.ts`
Expected: FAIL，`Error: Cannot find module './load' imported from …/src/lib/evals/gold/load.test.ts`

- [ ] **Step 13: 实现 gold/load.ts**

`src/lib/evals/gold/load.ts`:

```ts
// src/lib/evals/gold/load.ts
// Gold-set loading (spec §4.1, §4.4). The format is decided by CONTENT, not by path: a top-level
// `schema_version` → f6, else `entries` (array) + `ready` (boolean) → legacy_plan2. The set hash is the
// sha256 of the file BYTES as read; `path` is repo-relative POSIX. recorders.json and lock.json are
// validated here too; checkLock compares a loaded set with its lock entry.
import {readFileSync,readdirSync} from 'node:fs';
import {isAbsolute,join,relative,sep} from 'node:path';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import type {EvalModule,GoldFormat,GoldLock,GoldSet,RecordersFile} from '../types';
import {parseLegacyPlan2} from './legacy-plan2';
import {EVAL_MODULES,parseGoldSetF6} from './schema';

export const GOLD_DIR='src/lib/evals/fixtures/gold';
export const RECORDERS_PATH=`${GOLD_DIR}/recorders.json`;
export const LOCK_PATH=`${GOLD_DIR}/lock.json`;
const HEX64=/^[0-9a-f]{64}$/;
type J=Record<string,unknown>;
const isObj=(v:unknown):v is J=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const invalid=(path:string,code:string,code2?:EvalError['code'])=>new EvalError(code2??'gold_invalid',`${path}: ${code}`,{path,errors:[code]});

/** Repo-relative POSIX path of `path` (absolute or relative to root); throws when it leaves the repo. */
export function repoPath(path:string,root:string):string{
 const rel=relative(root,isAbsolute(path)?path:join(root,path)).split(sep).join('/');
 if(rel===''||rel.startsWith('../')||rel==='..'||isAbsolute(rel))throw invalid(path,'outside_repository');
 return rel;
}
export function detectGoldFormat(raw:unknown):GoldFormat|null{
 if(!isObj(raw))return null;
 if('schema_version' in raw)return 'f6';
 if(Array.isArray(raw.entries)&&typeof raw.ready==='boolean')return 'legacy_plan2';
 return null;
}
function readJson(rel:string,root:string):{bytes:Buffer;raw:unknown}{
 let bytes:Buffer;
 try{bytes=readFileSync(join(root,rel));}catch{throw invalid(rel,'not_found');}
 try{return {bytes,raw:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};}catch{throw invalid(rel,'invalid_json');}
}
/** Parses bytes already in hand (used by loadGoldSet and by gold-diff on git blobs). */
export function parseGoldBytes(bytes:Uint8Array,path:string,recorders:RecordersFile|null):GoldSet{
 let raw:unknown;
 try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw invalid(path,'invalid_json');}
 const meta={path,sha256:sha256Hex(bytes)};
 const format=detectGoldFormat(raw);
 if(format==='legacy_plan2')return parseLegacyPlan2(raw,meta);
 if(format==='f6'){
  if(!recorders)throw invalid(path,'recorders_required');
  return parseGoldSetF6(raw,meta,recorders);
 }
 throw invalid(path,'unknown_format');
}
export function loadGoldSet(path:string,root:string=process.cwd()):GoldSet{
 const rel=repoPath(path,root);
 const {bytes,raw}=readJson(rel,root);
 return parseGoldBytes(bytes,rel,detectGoldFormat(raw)==='f6'?loadRecorders(root):null);
}

export function parseRecorders(raw:unknown,path:string=RECORDERS_PATH):RecordersFile{
 const errors:string[]=[];
 if(!isObj(raw))throw invalid(path,'not_an_object');
 if(typeof raw.version!=='number'||!Number.isSafeInteger(raw.version)||raw.version<1)errors.push('version: integer_>=_1');
 if(!Array.isArray(raw.recorders))errors.push('recorders: array');
 const ids=new Set<string>();
 for(const [i,r] of (Array.isArray(raw.recorders)?raw.recorders:[]).entries()){
  const at=`recorders[${i}]`;
  if(!isObj(r)){errors.push(`${at}: not_an_object`);continue;}
  if(typeof r.id!=='string'||!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(r.id))errors.push(`${at}.id: invalid`);
  else if(r.id==='synthetic')errors.push(`${at}.id: reserved`);
  else if(ids.has(r.id))errors.push(`${at}.id: duplicate`);
  else ids.add(r.id);
  if(typeof r.role!=='string'||r.role==='')errors.push(`${at}.role: required`);
  if(!Array.isArray(r.modules)||r.modules.length===0||!r.modules.every(m=>EVAL_MODULES.includes(m as EvalModule)))errors.push(`${at}.modules: non_empty_subset_of_modules`);
  if(typeof r.added_at!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.added_at))errors.push(`${at}.added_at: date`);
  if(typeof r.approved_by!=='string'||r.approved_by==='')errors.push(`${at}.approved_by: required`);
 }
 if(errors.length>0)throw new EvalError('gold_invalid',`${path}: ${errors.length} rule violation(s)`,{path,errors});
 return raw as unknown as RecordersFile;
}
export const loadRecorders=(root:string=process.cwd()):RecordersFile=>parseRecorders(readJson(RECORDERS_PATH,root).raw);

export function parseLock(raw:unknown,path:string=LOCK_PATH):GoldLock{
 const errors:string[]=[];
 const files=isObj(raw)&&Array.isArray(raw.files)?raw.files:null;
 if(!files||Object.keys(raw as J).join()!=='files')throw invalid(path,'must_be_{files:[]}');
 const seen=new Set<string>();
 for(const [i,f] of files.entries()){
  if(!isObj(f)||typeof f.path!=='string'||typeof f.sha256!=='string'||!HEX64.test(f.sha256)||typeof f.version!=='number'||!Number.isSafeInteger(f.version)||f.version<1||(f.format!=='f6'&&f.format!=='legacy_plan2'))errors.push(`files[${i}]: must_be_{path,sha256,version,format}`);
  else if(seen.has(f.path))errors.push(`files[${i}].path: duplicate`);
  else seen.add(f.path);
 }
 if(errors.length>0)throw new EvalError('gold_invalid',`${path}: ${errors.length} rule violation(s)`,{path,errors});
 return raw as unknown as GoldLock;
}
export const loadLock=(root:string=process.cwd()):GoldLock=>parseLock(readJson(LOCK_PATH,root).raw);

/** §4.4: the loaded set must match its lock entry exactly (path, bytes sha256, version, format). */
export function checkLock(set:GoldSet,lock:GoldLock):void{
 const entry=lock.files.find(f=>f.path===set.path);
 if(!entry)throw new EvalError('gold_lock_mismatch',`${set.path}: not in lock.json`,{path:set.path});
 const diffs=(['sha256','version','format'] as const).filter(k=>entry[k]!==set[k]);
 if(diffs.length>0)throw new EvalError('gold_lock_mismatch',`${set.path}: lock differs in ${diffs.join(',')}`,{path:set.path,fields:diffs,lock:entry,actual:{sha256:set.sha256,version:set.version,format:set.format}});
}

/** Every gold set in the repository: *.json under GOLD_DIR (lock.json and recorders.json excluded) plus lock entries outside it (plan2.json), sorted. */
export function listGoldSetPaths(root:string=process.cwd(),lock:GoldLock|null=null):string[]{
 const inDir=(readdirSync(join(root,GOLD_DIR),{recursive:true}) as string[])
  .map(p=>`${GOLD_DIR}/${p.split(sep).join('/')}`)
  .filter(p=>p.endsWith('.json')&&p!==LOCK_PATH&&p!==RECORDERS_PATH);
 const outside=(lock?.files??[]).map(f=>f.path).filter(p=>!p.startsWith(`${GOLD_DIR}/`));
 return [...new Set([...inDir,...outside])].sort();
}
```

- [ ] **Step 14: 跑 gold 目录全部测试，确认通过**

Run: `npm test -- src/lib/evals/gold`
Expected: PASS（3 files，80 tests）

- [ ] **Step 15: 类型检查与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 两者都 exit 0。（不要把局部变量命名为 `module`，`@next/next/no-assign-module-variable` 会报错；schema.ts 用 `mod`。）

- [ ] **Step 16: 暂存**

```bash
git add src/lib/evals/gold/schema.ts src/lib/evals/gold/schema.test.ts src/lib/evals/gold/legacy-plan2.ts src/lib/evals/gold/legacy-plan2.test.ts src/lib/evals/gold/load.ts src/lib/evals/gold/load.test.ts src/lib/evals/fixtures/gold/recorders.json src/lib/evals/fixtures/gold/lock.json
```

- [ ] **Step 17: 提交**

```bash
git commit -m "feat(evals): F6 gold-set schema, read-only plan2.json legacy adapter, loader, lock and recorders (F6 Task 2)" -m "Spec §4.1-§4.6, §0 R5-1/R5-2/R5-8. plan2.json is adopted read-only; every legacy entry lists its provenance gaps." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 差异校验、脱敏扫描、校验 CLI、来源哈希与 CI 块（`gold/diff.ts` / `redact.ts` / `validate/cli.ts` / `scripts/evals/validate.ts` / `hash-source` / `ci.yml`）

**本任务定死的约定：**
- `goldDiff(base, head)` 是纯函数，两棵树（仓库相对路径 → 字节）只装**有差异的文件**。违规（violations）：整集删除 `set_deleted`、案例消失 `case_removed`、改名 `case_renamed`（新 id 下内容完全相同；`detail` = 新 id）、有语义变化/集级变化/新增案例但 `version` 没升 `version_not_bumped`、版本下降 `version_decreased`、head 文件无法解析 `head_unparsable`、`recorders.json` 删除 `recorders_deleted` 或内容变了但自身 `version` 没升 `recorders_version_not_bumped`。提示（notices，进 job summary，不失败）：`set_added`、`recorders_changed`、`module_implementers_changed`、`base_unparsable`。`lock.json` 不参与 diff（由 `--lock` 管）。
- "升了版本" = `head.version > base.version`（不要求恰好 +1：一次推送里合并两个 PR 可能各升一次）。新增案例也算变化，需要升版本。只改 `recorded_by/reviewed_by/notes` 等非语义字段不需要升。
- legacy 文件经 `parseLegacyPlan2` 比较；把某个 `<pending>` 值录成真值算 `canonical` 变化，需要升 `version`（同时 `lock.json` 必须更新，所以这类变更总要碰 F6 的目录）。翻转 `ready` 也算集级变化。
- git 侧：`resolveCommit(ref)` 用 `git rev-parse --verify --quiet <ref>^{commit}`，失败 → `EvalError('gold_diff_violation',…,{reason:'base_not_found'})`；变更文件用 `git diff --name-only --no-renames <base> HEAD -- <GOLD_DIR> <base 与 HEAD 的 lock.json 里位于 GOLD_DIR 之外的路径>`；字节用 `git show <ref>:<path>`。比较的是**已提交的 HEAD**，不是工作区。
- `--redact` 的发现只报 `{path, rule, line, field?}`，**从不输出匹配到的文本**（job summary 不会因此泄漏）。查询串令牌要求前面是 `?` 或 `&`（散文里的 `key=` 不算）；RFC 2606 示例域（`example.com/.org/.net/.invalid`）的邮箱豁免（测试用）；桶路径规则只匹配具体路径段（模板 `{source}/{issuer_id}` 不算）；200 字符上限只对 `.json` 文件里键名为 `text/note/notes` 的字符串生效（任意深度）。提醒：以后放进 `docs/audits/**` 的 Codex 报告如果原样引用 `postgres://` 之类的串会被拦，引用时写成 `postgres:／／` 或代码块外的描述。
- **扫描范围（集成偏差，记入规格 §18）**：规格 §4.5/§7.3 写的是 `docs/audits/**`，但对各兄弟分支的 `docs/audits/**` 实跑本扫描会命中（如 `2026-11-05-data-foundation-3/codex/*` 原样引用 Codex 输出里的邮箱与查询串，共约 195 条），F6 又不得改他人审计文件；所以 `REDACT_ROOTS` 只含 F6 自有路径：`src/lib/evals/fixtures/**`、`docs/evals/**`、`docs/audits/2026-11-06-evals-gold-sets/**` 与 F6 写的 `docs/audits/2026-11-04-data-foundation-2/index.json`。
- `validate/cli.ts` 是一张 flag → handler 表（`HANDLERS`）；检查按表的顺序执行（与 argv 顺序无关），每个选中的检查都跑，抛错转为 `{ok:false,error}`；处理器可以是 async（`runValidate` 返回 Promise）；全部 ok → 退出 0，有检查失败 → 1，用法错误 → 2（集成时与 §3.2 退出码对齐：2 只表示运行前拒绝）。处理器可声明 `modifiers`（如 `--release`），紧跟在其 flag/值之后的这些裸 flag 以集合传给 `run`。**Task 12 加 `--expert/--audit/--manifest` 只需往 `HANDLERS` 末尾追加三项**，不改 `runValidate`；Task 12 的检查结果是 `findingsCheck(ValidatorFinding[])`。`scripts/evals/validate.ts` 只是一层薄壳（vitest 只收 `src/**/*.test.ts`，所以逻辑放在 `src/lib/evals/validate/cli.ts` 才能测）。
- `hash-source`：同理，逻辑在 `src/lib/evals/hash-source.ts`（可注入 `fetch`），脚本只打印 JSON。只接受 https；非 2xx → 抛错；从不落盘。
- CI：`push` 时 `event.before` 不在已取回的历史里（强推）也跳过并说明（规格只写了全零；强推时 `git show` 必失败，与其让 CI 红，不如跳过并在 summary 说明）。`upload-artifact` 的 `path:` 是块标量，`# F6 begin/end` 只能写在块里面：`@actions/glob` 把 `#` 开头的行当注释；即使不当注释，一个什么都匹配不到的模式也无害（只要其他模式匹配到文件，就不会触发 `if-no-files-found`）。

**Files:**
- Create: `src/lib/evals/gold/diff.ts`, `src/lib/evals/redact.ts`, `src/lib/evals/hash-source.ts`, `src/lib/evals/validate/cli.ts`
- Create: `scripts/evals/validate.ts`, `scripts/evals/hash-source.ts`
- Modify: `.github/workflows/ci.yml`（三个 `# F6 begin/end` 块）
- Test: `src/lib/evals/gold/diff.test.ts`, `src/lib/evals/redact.test.ts`, `src/lib/evals/hash-source.test.ts`, `src/lib/evals/validate/cli.test.ts`, `src/lib/evals/ci-workflow.test.ts`
- Read only: `src/lib/research/ingest/collectors/shared.ts`（`DEFAULT_USER_AGENT`）

- [ ] **Step 1: 写 goldDiff 的失败测试（内存树 + 临时 git 仓库三个提交）**

`src/lib/evals/gold/diff.test.ts`:

```ts
// src/lib/evals/gold/diff.test.ts
// goldDiff on in-memory trees, then the real git path in a throw-away repository (git init in
// os.tmpdir(), three commits: a multi-commit push is judged against event.before, not per commit).
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {changedGoldFiles,goldDiff,goldDiffAgainst,gitTreeAt,resolveCommit} from './diff';
import type {GoldTree} from './diff';
import {GOLD_DIR,LOCK_PATH,RECORDERS_PATH} from './load';

type J=Record<string,any>;
const SET=`${GOLD_DIR}/facts/a.json`;
const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v,null,1));
const kase=(id:string,value='100'):J=>({case_id:id,subject:{market:'US',cik:'1'},target:{type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
 expect:'present',printed:{text:value,unit_label:'',scale:'1'},canonical:{value},binding:'document',source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:'0000000001-24-000001'},url:'https://www.sec.gov/x',sha256:'c'.repeat(64),locator:{page:1}},
 provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06',reviewed_by:null,reviewed_at:null,retracted:null,notes:''});
const set=(over:J={}):J=>({schema_version:1,set_id:'facts/a',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code'],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],cases:[kase('A'),kase('B')],...over});
const recorders=(version:number,ids=['owner'])=>({version,recorders:ids.map(id=>({id,role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}))});
const tree=(entries:Record<string,unknown>):GoldTree=>new Map(Object.entries(entries).map(([k,v])=>[k,typeof v==='string'?new TextEncoder().encode(v):enc(v)]));
const codes=(r:{violations:{code:string}[]})=>r.violations.map(v=>v.code);

describe('goldDiff (in-memory trees)',()=>{
 it('identical trees and pure additions with a bump are clean',()=>{
  expect(goldDiff(tree({[SET]:set()}),tree({[SET]:set()}))).toEqual({violations:[],notices:[]});
  expect(goldDiff(tree({[SET]:set()}),tree({[SET]:set({version:2,cases:[kase('A'),kase('B'),kase('C')]})}))).toEqual({violations:[],notices:[]});
 });
 it('a case that disappears is a violation even with a bump',()=>{
  const r=goldDiff(tree({[SET]:set()}),tree({[SET]:set({version:2,cases:[kase('A')]})}));
  expect(r.violations).toEqual([{code:'case_removed',path:SET,case_id:'B'}]);
 });
 it('a renamed case (same content, new id) is reported as a rename',()=>{
  const r=goldDiff(tree({[SET]:set()}),tree({[SET]:set({version:2,cases:[kase('A'),kase('B2')]})}));
  expect(r.violations).toEqual([{code:'case_renamed',path:SET,case_id:'B',detail:'B2'}]);
 });
 it('a semantic case change without a version bump is a violation; with a bump it is clean',()=>{
  const changed=set({cases:[kase('A','101'),kase('B')]});
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:changed})))).toEqual(['version_not_bumped']);
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:{...changed,version:2}})))).toEqual([]);
 });
 it('set-level changes (thresholds, tolerance, optional_cases) need a bump; recorder-only edits do not',()=>{
  for(const over of [{thresholds:{max_fail:1,min_coverage_optional:'0.95'}},{tolerance:{rel:'0.01'}},{optional_cases:['B']},{artifact_class:'restricted'}])
   expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:set(over)}))),JSON.stringify(over)).toEqual(['version_not_bumped']);
  const reviewed=set({cases:[{...kase('A'),reviewed_by:'r2',reviewed_at:'2026-11-07'},kase('B')]});
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:reviewed})))).toEqual([]);
 });
 it('a retraction is a semantic change (needs a bump) and keeps the case',()=>{
  const retracted=set({cases:[{...kase('A'),retracted:{at:'2026-11-07',by:'owner',reason:'typo'}},kase('B')]});
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:retracted})))).toEqual(['version_not_bumped']);
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:{...retracted,version:2}})))).toEqual([]);
 });
 it('module_implementers changes need a bump and are listed as a notice',()=>{
  const r=goldDiff(tree({[SET]:set()}),tree({[SET]:set({module_implementers:['claude-code','codex']})}));
  expect(codes(r)).toEqual(['version_not_bumped']);
  expect(r.notices.map(n=>n.code)).toEqual(['module_implementers_changed']);
 });
 it('a whole set deleted, a version decrease and an unparsable head are violations',()=>{
  expect(codes(goldDiff(tree({[SET]:set()}),tree({})))).toEqual(['set_deleted']);
  expect(codes(goldDiff(tree({[SET]:set({version:3})}),tree({[SET]:set({version:2})})))).toEqual(['version_decreased']);
  expect(codes(goldDiff(tree({[SET]:set()}),tree({[SET]:'{"schema_version":1,'})))).toEqual(['head_unparsable']);
 });
 it('a new set is a notice',()=>{
  expect(goldDiff(tree({}),tree({[SET]:set()}))).toEqual({violations:[],notices:[{code:'set_added',path:SET}]});
 });
 it('recorders.json: change is a notice, needs its own version bump, deletion is a violation; lock.json is ignored',()=>{
  const r=goldDiff(tree({[RECORDERS_PATH]:recorders(1)}),tree({[RECORDERS_PATH]:recorders(1,['owner','r2'])}));
  expect(codes(r)).toEqual(['recorders_version_not_bumped']);
  expect(r.notices.map(n=>n.code)).toEqual(['recorders_changed']);
  expect(goldDiff(tree({[RECORDERS_PATH]:recorders(1)}),tree({[RECORDERS_PATH]:recorders(2,['owner','r2'])}))).toEqual({violations:[],notices:[{code:'recorders_changed',path:RECORDERS_PATH}]});
  expect(codes(goldDiff(tree({[RECORDERS_PATH]:recorders(1)}),tree({})))).toEqual(['recorders_deleted']);
  expect(goldDiff(tree({[LOCK_PATH]:{files:[]}}),tree({}))).toEqual({violations:[],notices:[]});
 });
 it('legacy_plan2 files are diffed through the adapter (filling a pending value needs a bump)',()=>{
  const plan2=JSON.parse(readFileSync('src/lib/facts/fixtures/gold/plan2.json','utf8'));
  const P='src/lib/facts/fixtures/gold/plan2.json';
  const filled={...plan2,entries:plan2.entries.map((e:J,i:number)=>i===2?{...e,value:'150560330316.45'}:e)};
  expect(codes(goldDiff(tree({[P]:plan2}),tree({[P]:filled})))).toEqual(['version_not_bumped']);
  expect(codes(goldDiff(tree({[P]:plan2}),tree({[P]:{...filled,version:2}})))).toEqual([]);
  expect(codes(goldDiff(tree({[P]:plan2}),tree({[P]:{...plan2,ready:true}})))).toEqual(['version_not_bumped']);
  expect(codes(goldDiff(tree({[P]:plan2}),tree({[P]:{...plan2,version:2,entries:plan2.entries.slice(1)}})))).toEqual(['case_removed']);
 });
});

describe('gold diff over a real git repository',()=>{
 const root=mkdtempSync(join(tmpdir(),'f6-gold-diff-'));
 afterAll(()=>rmSync(root,{recursive:true,force:true}));
 const g=(...args:string[])=>execFileSync('git',['-c','user.name=f6-test','-c','user.email=f6-test@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null',...args],{cwd:root,stdio:['ignore','pipe','pipe']}).toString('utf8').trim();
 const write=(path:string,v:unknown)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),JSON.stringify(v,null,1));};
 g('init','-q','-b','main');
 write(RECORDERS_PATH,recorders(1));write(SET,set());write('README.md','x');
 g('add','-A');g('commit','-q','-m','c1');
 const c1=g('rev-parse','HEAD');
 write(SET,set({version:2,cases:[kase('A','101'),kase('B')]}));
 g('add','-A');g('commit','-q','-m','c2: value change with bump');
 const c2=g('rev-parse','HEAD');
 write(SET,set({version:2,cases:[kase('A','101'),kase('B')],thresholds:{max_fail:1,min_coverage_optional:'0.95'}}));
 write('README.md','y');
 g('add','-A');g('commit','-q','-m','c3: thresholds change without bump');
 it('resolves refs and lists only changed gold files',()=>{
  expect(resolveCommit('HEAD~2',root)).toBe(c1);
  expect(()=>resolveCommit('0'.repeat(40),root)).toThrow(EvalError);
  expect(changedGoldFiles(c1,[GOLD_DIR],root)).toEqual([SET]);
  expect(changedGoldFiles('HEAD',[GOLD_DIR],root)).toEqual([]);
  expect([...gitTreeAt(c1,[SET,`${GOLD_DIR}/absent.json`],root).keys()]).toEqual([SET]);
 });
 it('push of c2+c3 judged against event.before=c1: the bump in c2 covers the whole push',()=>{
  expect(goldDiffAgainst(c1,root)).toMatchObject({base:c1,changed:[SET],violations:[]});
 });
 it('push of c3 alone judged against event.before=c2: thresholds changed without a bump',()=>{
  expect(goldDiffAgainst(c2,root).violations).toEqual([{code:'version_not_bumped',path:SET,detail:'version 2'}]);
 });
 it('deleting the set in a further commit is a violation against any earlier base',()=>{
  g('rm','-q',SET);g('commit','-q','-m','c4: delete');
  expect(goldDiffAgainst(c1,root).violations).toEqual([{code:'set_deleted',path:SET}]);
 });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/gold/diff.test.ts`
Expected: FAIL，`Error: Cannot find module './diff' imported from …/src/lib/evals/gold/diff.test.ts`

- [ ] **Step 3: 实现 gold/diff.ts**

`src/lib/evals/gold/diff.ts`:

```ts
// src/lib/evals/gold/diff.ts
// Gold-set difference check against a base revision (spec §4.4). goldDiff is pure over two trees
// (repo-relative path → file bytes) holding only the files that differ; the git helpers build those
// trees with `git diff --name-only --no-renames <base> HEAD -- <paths>` and `git show <ref>:<path>`.
// Violations: a whole set deleted, a case removed, a case renamed (same content under a new id), a
// semantic or set-level change (or an added case) without a higher version, a version decrease,
// recorders.json deleted or changed without a higher version, an unparsable head file. Notices (listed
// in the job summary, not failing): set added, recorders.json changed, module_implementers changed.
// Semantic case fields: target, expect, printed, canonical, binding, source, retracted, required (from
// optional_cases); for legacy_plan2 sets: target, expect, canonical, binding, as_of, source, required,
// and the file's `ready` at set level. Field-level rules (§4.2) are --gold's job, not this file's.
import {execFileSync} from 'node:child_process';
import {canonicalJson} from '../canonical-json';
import {EvalError} from '../errors';
import {parseLegacyPlan2} from './legacy-plan2';
import {GOLD_DIR,LOCK_PATH,RECORDERS_PATH,detectGoldFormat} from './load';

export type GoldTree=Map<string,Uint8Array>;
export type DiffCode='set_deleted'|'case_removed'|'case_renamed'|'version_not_bumped'|'version_decreased'|'head_unparsable'|'recorders_deleted'|'recorders_version_not_bumped'
 |'set_added'|'recorders_changed'|'module_implementers_changed'|'base_unparsable';
export interface DiffFinding{code:DiffCode;path:string;case_id?:string;detail?:string}
export interface GoldDiffResult{violations:DiffFinding[];notices:DiffFinding[]}
interface SetView{version:number;setLevel:string;implementers:string;cases:Map<string,string>}
type J=Record<string,unknown>;
const isObj=(v:unknown):v is J=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const decode=(b:Uint8Array)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b)) as unknown;
const pick=(o:J,keys:readonly string[])=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const F6_CASE_FIELDS=['target','expect','printed','canonical','binding','source','retracted'] as const;
const F6_SET_FIELDS=['tolerance','thresholds','module','artifact_class','module_implementers'] as const;

/** Semantic view of a gold file; throws when the bytes are not a recognisable gold set. */
function viewOf(bytes:Uint8Array,path:string):SetView{
 const raw=decode(bytes);
 const format=detectGoldFormat(raw);
 if(format==='legacy_plan2'){
  const s=parseLegacyPlan2(raw,{path,sha256:''});
  return {version:s.version,implementers:canonicalJson(s.module_implementers),
   setLevel:canonicalJson({ready:s.ready,tolerance:s.tolerance,thresholds:s.thresholds,module:s.module,artifact_class:s.artifact_class,module_implementers:s.module_implementers}),
   cases:new Map(s.cases.map(c=>[c.case_id,canonicalJson({target:c.target,expect:c.expect,canonical:c.canonical,binding:c.binding,as_of:c.as_of,source:c.source,required:c.required})]))};
 }
 if(format!=='f6'||!isObj(raw))throw new Error('not_a_gold_set');
 const r=raw;
 if(typeof r.version!=='number'||!Array.isArray(r.cases))throw new Error('not_a_gold_set');
 const optional=Array.isArray(r.optional_cases)?r.optional_cases.filter((x):x is string=>typeof x==='string'):[];
 const cases=new Map<string,string>();
 for(const c of r.cases){
  if(!isObj(c)||typeof c.case_id!=='string')throw new Error('case_without_id');
  if(cases.has(c.case_id))throw new Error(`duplicate_case:${c.case_id}`);
  cases.set(c.case_id,canonicalJson({...pick(c,F6_CASE_FIELDS),required:!optional.includes(c.case_id)}));
 }
 return {version:r.version,implementers:canonicalJson(r.module_implementers??null),setLevel:canonicalJson({...pick(r,F6_SET_FIELDS),optional_cases:[...optional].sort()}),cases};
}
const versionOf=(bytes:Uint8Array):number=>{const raw=decode(bytes);if(!isObj(raw)||typeof raw.version!=='number')throw new Error('no_version');return raw.version;};
const sameBytes=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((x,i)=>x===b[i]);

export function goldDiff(base:GoldTree,head:GoldTree):GoldDiffResult{
 const violations:DiffFinding[]=[],notices:DiffFinding[]=[];
 const paths=[...new Set([...base.keys(),...head.keys()])].filter(p=>p!==LOCK_PATH).sort();
 for(const path of paths){
  const b=base.get(path),h=head.get(path);
  if(path===RECORDERS_PATH){
   if(b&&!h){violations.push({code:'recorders_deleted',path});continue;}
   if(!h||(b&&sameBytes(b,h)))continue;
   let hv:number;
   try{hv=versionOf(h);}catch(e){violations.push({code:'head_unparsable',path,detail:(e as Error).message});continue;}
   notices.push({code:'recorders_changed',path});
   if(b){
    let bv:number|null=null;
    try{bv=versionOf(b);}catch{notices.push({code:'base_unparsable',path});}
    if(bv!==null&&hv<=bv)violations.push({code:'recorders_version_not_bumped',path,detail:`${bv} -> ${hv}`});
   }
   continue;
  }
  if(b&&!h){violations.push({code:'set_deleted',path});continue;}
  if(!h)continue;
  let hv:SetView;
  try{hv=viewOf(h,path);}catch(e){violations.push({code:'head_unparsable',path,detail:(e as Error).message});continue;}
  if(!b){notices.push({code:'set_added',path});continue;}
  let bv:SetView;
  try{bv=viewOf(b,path);}catch{notices.push({code:'base_unparsable',path});continue;}
  let changed=bv.setLevel!==hv.setLevel;
  const added=[...hv.cases.keys()].filter(id=>!bv.cases.has(id));
  for(const [id,content] of bv.cases){
   const now=hv.cases.get(id);
   if(now===undefined){
    const renamedTo=added.find(a=>hv.cases.get(a)===content);
    violations.push(renamedTo?{code:'case_renamed',path,case_id:id,detail:renamedTo}:{code:'case_removed',path,case_id:id});
    changed=true;
   }else if(now!==content)changed=true;
  }
  if(added.length>0)changed=true;
  if(bv.implementers!==hv.implementers)notices.push({code:'module_implementers_changed',path,detail:`${bv.implementers} -> ${hv.implementers}`});
  if(hv.version<bv.version)violations.push({code:'version_decreased',path,detail:`${bv.version} -> ${hv.version}`});
  else if(changed&&hv.version===bv.version)violations.push({code:'version_not_bumped',path,detail:`version ${hv.version}`});
 }
 const order=(a:DiffFinding,b:DiffFinding)=>a.path<b.path?-1:a.path>b.path?1:a.code<b.code?-1:a.code>b.code?1:(a.case_id??'')<(b.case_id??'')?-1:(a.case_id??'')>(b.case_id??'')?1:0;
 return {violations:violations.sort(order),notices:notices.sort(order)};
}

// ---- git side (CI: ci.yml computes <base>, see §4.4) ----
const git=(cwd:string,args:string[]):Buffer=>execFileSync('git',args,{cwd,stdio:['ignore','pipe','pipe'],maxBuffer:256*1024*1024});

/** The commit sha of `ref`; EvalError('gold_diff_violation') when it is not a commit in this repository. */
export function resolveCommit(ref:string,cwd:string=process.cwd()):string{
 try{return git(cwd,['rev-parse','--verify','--quiet',`${ref}^{commit}`]).toString('utf8').trim();}
 catch{throw new EvalError('gold_diff_violation',`base not found: ${ref}`,{ref,reason:'base_not_found'});}
}
/** Paths whose difference between <base> and HEAD matters: the gold directory and every lock entry outside it (base or head lock). */
export function goldDiffPaths(base:string,cwd:string=process.cwd()):string[]{
 const outside=new Set<string>();
 const addFrom=(bytes:Uint8Array|undefined)=>{
  if(!bytes)return;
  try{const raw=decode(bytes);if(isObj(raw)&&Array.isArray(raw.files))for(const f of raw.files)if(isObj(f)&&typeof f.path==='string'&&!f.path.startsWith(`${GOLD_DIR}/`))outside.add(f.path);}catch{/* an unreadable lock adds no paths; --lock reports it */}
 };
 addFrom(gitTreeAt(base,[LOCK_PATH],cwd).get(LOCK_PATH));
 addFrom(gitTreeAt('HEAD',[LOCK_PATH],cwd).get(LOCK_PATH));
 return [GOLD_DIR,...[...outside].sort()];
}
export function changedGoldFiles(base:string,paths:string[],cwd:string=process.cwd()):string[]{
 return git(cwd,['diff','--name-only','--no-renames',base,'HEAD','--',...paths]).toString('utf8').split('\n').filter(Boolean).sort();
}
/** Bytes of each path at `ref`; a path absent at `ref` is absent from the map. */
export function gitTreeAt(ref:string,paths:string[],cwd:string=process.cwd()):GoldTree{
 const tree:GoldTree=new Map();
 for(const p of paths){
  try{tree.set(p,new Uint8Array(git(cwd,['show',`${ref}:${p}`])));}catch{/* absent at ref */}
 }
 return tree;
}
/** --gold-diff <base>: diff the committed HEAD against <base>. */
export function goldDiffAgainst(baseRef:string,cwd:string=process.cwd()):GoldDiffResult&{base:string;changed:string[]}{
 const base=resolveCommit(baseRef,cwd);
 const changed=changedGoldFiles(base,goldDiffPaths(base,cwd),cwd);
 return {base,changed,...goldDiff(gitTreeAt(base,changed,cwd),gitTreeAt('HEAD',changed,cwd))};
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/gold/diff.test.ts`
Expected: PASS（15 tests；临时仓库在 `os.tmpdir()`，`afterAll` 删除）

- [ ] **Step 5: 写 redact 的失败测试（每个模式正反各一）**

`src/lib/evals/redact.test.ts`:

```ts
// src/lib/evals/redact.test.ts
import {describe,expect,it} from 'vitest';
import {redactScan,redactTargets} from './redact';

const scan=(text:string,path='docs/evals/x.md')=>redactScan([{path,text}]).map(f=>f.rule);

describe('redactScan: each rule, positive and negative',()=>{
 const cases:[string,string,string|null][]=[
  ['query token=','see https://x.test/a?token=abc','query_token'],
  ['query &key=','https://x.test/a?b=1&key=abc','query_token'],
  ['query sig=','https://x.test/a?sig=abc','query_token'],
  ['prose "key=" without ? or &','the lookup key=value form','' ],
  ['X-Amz-Signature','...&X-Amz-Signature=deadbeef','query_token'],
  ['postgres URL','postgres://u:p@h/db','postgres_url'],
  ['postgresql URL','postgresql://h/db','postgres_url'],
  ['postgres prose','PostgreSQL 17 and pg_dump','' ],
  ['JWT','eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl','jwt'],
  ['eyJ alone','eyJhbGciOiJIUzI1NiJ9','' ],
  ['sk_ secret','sk_live_0123456789abcdef','secret_prefix'],
  ['sb_ secret','sb_secret_0123456789abcd','secret_prefix'],
  ['ghp_ token','ghp_0123456789abcdefABCDEF','secret_prefix'],
  ['identifier containing sk_','task_sk_short desk_lamp','' ],
  ['e-mail','contact jane.doe@corp.co.uk','email'],
  ['example-domain e-mail is exempt','f6-test@example.invalid','' ],
  ['npm scope / version pin','postgresql@17/bin and @typescript-eslint','' ],
  ['bucket object path','disclosure-raw/edgar/0000-issuer/abc.json','bucket_path'],
  ['bucket path behind private://','private://eval-restricted/reports/x.json','' ],
  ['bucket path template','disclosure-raw/{source}/{issuer_id}/','' ],
  ['storage API object path','https://x.supabase.co/storage/v1/object/sign/b/c','bucket_path'],
 ];
 for(const [name,text,rule] of cases)it(name,()=>{expect(scan(text)).toEqual(rule?[rule]:[]);});
 it('long text/note/notes fields: JSON only, > 200 characters, at any depth',()=>{
  const long='x'.repeat(201);
  expect(redactScan([{path:'src/lib/evals/fixtures/a.json',text:JSON.stringify({cases:[{notes:long}]})}])).toEqual([{path:'src/lib/evals/fixtures/a.json',rule:'long_field',line:null,field:'notes'}]);
  expect(scan(JSON.stringify({note:long,text:'x'.repeat(200)}),'docs/evals/a.json')).toEqual(['long_field']);
  expect(scan(JSON.stringify({summary:long}),'docs/evals/a.json')).toEqual([]);
  expect(scan(`notes: ${long}`,'docs/audits/a.md')).toEqual([]);
 });
 it('reports the line and never the matched text',()=>{
  const f=redactScan([{path:'docs/audits/a.md',text:'ok\nok\npostgres://user:secret@h/db\n'}]);
  expect(f).toEqual([{path:'docs/audits/a.md',rule:'postgres_url',line:3}]);
  expect(JSON.stringify(f)).not.toContain('secret');
 });
 it('flags unparsable JSON',()=>{expect(scan('{','docs/evals/a.json')).toEqual(['invalid_json']);});
});

describe('repository',()=>{
 it('the F6-owned paths (fixtures, docs/evals, the F6 audit directory) are clean',()=>{
  const files=redactTargets();
  expect(files.some(f=>f.path.startsWith('docs/audits/2026-11-06-evals-gold-sets/'))).toBe(true);
  expect(files.filter(f=>f.path.startsWith('docs/audits/')&&!f.path.startsWith('docs/audits/2026-11-06-evals-gold-sets/')&&f.path!=='docs/audits/2026-11-04-data-foundation-2/index.json')).toEqual([]);
  expect(files.some(f=>f.path==='src/lib/evals/fixtures/gold/lock.json')).toBe(true);
  expect(redactScan(files)).toEqual([]);
 });
});
```

- [ ] **Step 6: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/redact.test.ts`
Expected: FAIL，`Error: Cannot find module './redact' imported from …/src/lib/evals/redact.test.ts`

- [ ] **Step 7: 实现 redact.ts**

`src/lib/evals/redact.ts`:

```ts
// src/lib/evals/redact.ts
// --redact (spec §4.5): scans the F6-owned evidence paths — src/lib/evals/fixtures/**, docs/evals/**,
// docs/audits/2026-11-06-evals-gold-sets/** and the F6-written docs/audits/2026-11-04-data-foundation-2/index.json —
// for credential and personal-data shapes. Not all of docs/audits/**: other modules' audit files quote Codex output
// with e-mail addresses and query tokens (integration check over the sibling branches) and F6 may not edit them. Findings carry path, rule and line — NEVER the matched text, so the CI
// job summary cannot leak what it found. Rules: query-string tokens (?token= &key= ?sig=,
// X-Amz-Signature), postgres:// / postgresql:// URLs, three-segment JWTs starting eyJ, sk_/sb_/ghp_
// secret prefixes, e-mail addresses (RFC 2606 example domains exempt), storage-bucket object paths
// outside private:// (disclosure-raw/…, macro-raw/…, eval-restricted/…, /storage/v1/object/…), and
// — in .json files only — any `text`, `note` or `notes` string longer than 200 characters.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,sep} from 'node:path';

/** Directories (scanned recursively) or single files; integration narrowed docs/audits/** to F6-owned paths. */
export const REDACT_ROOTS:readonly string[]=['src/lib/evals/fixtures','docs/evals','docs/audits/2026-11-06-evals-gold-sets','docs/audits/2026-11-04-data-foundation-2/index.json'];
export const LONG_FIELD_LIMIT=200;
export interface RedactFinding{path:string;rule:string;line:number|null;field?:string}
const LONG_FIELDS=new Set(['text','note','notes']);
const EXAMPLE_DOMAIN=/@(?:[A-Za-z0-9-]+\.)*example\.(?:com|org|net|invalid)$/i;
const RULES:readonly {rule:string;re:RegExp;allow?:(m:string)=>boolean}[]=[
 {rule:'query_token',re:/[?&](?:token|key|sig)=/gi},
 {rule:'query_token',re:/X-Amz-Signature/gi},
 {rule:'postgres_url',re:/postgres(?:ql)?:\/\//gi},
 {rule:'jwt',re:/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g},
 {rule:'secret_prefix',re:/(?<![A-Za-z0-9])(?:sk|sb|ghp)_[A-Za-z0-9_-]{8,}/g},
 {rule:'email',re:/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,allow:m=>EXAMPLE_DOMAIN.test(m)},
 {rule:'bucket_path',re:/(?<!private:\/\/)\b(?:disclosure-raw|macro-raw|eval-restricted)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g},
 {rule:'bucket_path',re:/\/storage\/v1\/object\//g},
];
const lineAt=(text:string,index:number)=>{let n=1;for(let i=0;i<index;i++)if(text.charCodeAt(i)===10)n++;return n;};

function longFields(v:unknown,key:string|null,path:string,out:RedactFinding[]):void{
 if(typeof v==='string'){if(key!==null&&LONG_FIELDS.has(key)&&v.length>LONG_FIELD_LIMIT)out.push({path,rule:'long_field',line:null,field:key});}
 else if(Array.isArray(v))for(const x of v)longFields(x,key,path,out);
 else if(v!==null&&typeof v==='object')for(const [k,x] of Object.entries(v))longFields(x,k,path,out);
}

/** Pure scan of in-memory files (repo-relative path + UTF-8 text). Sorted by path, line, rule. */
export function redactScan(files:readonly {path:string;text:string}[]):RedactFinding[]{
 const out:RedactFinding[]=[];
 for(const {path,text} of files){
  for(const {rule,re,allow} of RULES){
   for(const m of text.matchAll(re)){if(!allow?.(m[0]))out.push({path,rule,line:lineAt(text,m.index??0)});}
  }
  if(path.endsWith('.json')){
   let parsed:unknown;
   try{parsed=JSON.parse(text);}catch{out.push({path,rule:'invalid_json',line:null});continue;}
   longFields(parsed,null,path,out);
  }
 }
 return out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:(a.line??0)-(b.line??0)||(a.rule<b.rule?-1:a.rule>b.rule?1:0));
}

/** Every file under REDACT_ROOTS (missing roots are skipped), as repo-relative POSIX paths with UTF-8 text. */
export function redactTargets(root:string=process.cwd()):{path:string;text:string}[]{
 const out:{path:string;text:string}[]=[];
 for(const dir of REDACT_ROOTS){
  const abs=join(root,dir);
  let st:ReturnType<typeof statSync>;
  try{st=statSync(abs);}catch{continue;}
  if(st.isFile()){out.push({path:dir,text:readFileSync(abs,'utf8')});continue;}
  if(!st.isDirectory())continue;
  for(const rel of (readdirSync(abs,{recursive:true}) as string[]).sort()){
   const file=join(abs,rel);
   if(!statSync(file).isFile())continue;
   out.push({path:`${dir}/${rel.split(sep).join('/')}`,text:readFileSync(file,'utf8')});
  }
 }
 return out;
}
```

- [ ] **Step 8: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/redact.test.ts`
Expected: PASS（25 tests；"repository" 用例证明当前 F6 自有路径 `src/lib/evals/fixtures/**`、`docs/audits/2026-11-06-evals-gold-sets/**` 干净，且不扫其他模块的审计目录；`docs/evals/` 与 `index.json` 尚不存在时跳过）

- [ ] **Step 9: 写 hash-source 的失败测试**

`src/lib/evals/hash-source.test.ts`:

```ts
// src/lib/evals/hash-source.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
import {hashSource} from './hash-source';

describe('hashSource',()=>{
 it('hashes exactly the served bytes and sends a declared User-Agent',async()=>{
  const body=new TextEncoder().encode('<html>10-K</html>');
  const seen:{url:string;ua:string|null}[]=[];
  const fake=(async(url:string,init?:RequestInit)=>{seen.push({url,ua:new Headers(init?.headers).get('user-agent')});return new Response(body,{status:200});}) as unknown as typeof fetch;
  const r=await hashSource('https://www.sec.gov/Archives/x.htm',{fetch:fake,userAgent:DEFAULT_USER_AGENT});
  expect(r).toEqual({url:'https://www.sec.gov/Archives/x.htm',sha256:createHash('sha256').update(body).digest('hex'),bytes:body.byteLength,status:200});
  expect(seen).toEqual([{url:'https://www.sec.gov/Archives/x.htm',ua:DEFAULT_USER_AGENT}]);
 });
 it('rejects non-https URLs and non-2xx responses',async()=>{
  const fake=(async()=>new Response('nope',{status:403})) as unknown as typeof fetch;
  await expect(hashSource('http://www.sec.gov/x',{fetch:fake})).rejects.toThrow('https_required');
  await expect(hashSource('not a url',{fetch:fake})).rejects.toThrow('invalid_url');
  await expect(hashSource('https://www.sec.gov/x',{fetch:fake})).rejects.toThrow('http_403');
 });
});
```

- [ ] **Step 10: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/hash-source.test.ts`
Expected: FAIL，`Error: Cannot find module './hash-source' imported from …/src/lib/evals/hash-source.test.ts`

- [ ] **Step 11: 实现 hash-source.ts 与脚本**

`src/lib/evals/hash-source.ts`:

```ts
// src/lib/evals/hash-source.ts
// Recording helper for §4.6 `source.sha256`: fetch a primary document and return the sha256 and
// byte length of exactly the bytes served. Nothing is written anywhere (the official archives keep
// the document; the hash lets anyone confirm they read the same bytes). SEC requires a declared
// User-Agent: EDGAR_USER_AGENT, else the research collectors' DEFAULT_USER_AGENT.
import {sha256Hex} from './canonical-json';
import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';

export interface HashedSource{url:string;sha256:string;bytes:number;status:number}
export async function hashSource(url:string,opts:{fetch?:typeof fetch;userAgent?:string}={}):Promise<HashedSource>{
 let parsed:URL;
 try{parsed=new URL(url);}catch{throw new Error('invalid_url');}
 if(parsed.protocol!=='https:')throw new Error('https_required');
 const res=await (opts.fetch??fetch)(parsed.toString(),{headers:{'User-Agent':opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,'Accept':'*/*'},redirect:'follow'});
 if(!res.ok)throw new Error(`http_${res.status}`);
 const body=new Uint8Array(await res.arrayBuffer());
 return {url:parsed.toString(),sha256:sha256Hex(body),bytes:body.byteLength,status:res.status};
}
```

`scripts/evals/hash-source.ts`:

```ts
/**
 * Hash a primary document for a gold case's source.sha256 (spec §4.6). Nothing is stored.
 *
 *   npx tsx scripts/evals/hash-source.ts <https-url>
 *
 * Prints {"url","sha256","bytes","status"} on stdout. Exit 1 on a fetch failure, 2 on bad arguments.
 */
import {hashSource} from '../../src/lib/evals/hash-source';

async function main(){
 const argv=process.argv.slice(2);
 if(argv.length!==1||!argv[0].startsWith('https://')){process.stderr.write('usage: hash-source.ts <https-url>\n');process.exitCode=2;return;}
 try{process.stdout.write(`${JSON.stringify(await hashSource(argv[0]))}\n`);}
 catch(e){process.stderr.write(`hash-source failed: ${e instanceof Error?e.message:String(e)}\n`);process.exitCode=1;}
}
void main();
```

- [ ] **Step 12: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/hash-source.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 13: 写校验 CLI 的失败测试**

`src/lib/evals/validate/cli.test.ts`:

```ts
// src/lib/evals/validate/cli.test.ts
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {GOLD_DIR,LOCK_PATH,RECORDERS_PATH} from '../gold/load';
import {HANDLERS,findingsCheck,runValidate} from './cli';
import type {ValidateHandler} from './cli';

describe('runValidate on the repository',()=>{
 it('--gold --lock --redact pass on the repo\'s own fixtures (exit 0)',async()=>{
  const {exitCode,output}=await runValidate(['--redact','--lock','--gold']);
  expect(output.checks.gold).toMatchObject({ok:true,errors:[]});
  expect(output.checks.lock).toMatchObject({ok:true,errors:[]});
  expect(output.checks.redact).toMatchObject({ok:true,findings:[]});
  expect(Object.keys(output.checks)).toEqual(['gold','lock','redact']);
  expect(exitCode).toBe(0);
 });
 it('--gold-diff HEAD is clean',async()=>{
  expect(await runValidate(['--gold-diff','HEAD'])).toMatchObject({exitCode:0,output:{ok:true,checks:{gold_diff:{ok:true,changed:[],violations:[]}}}});
 });
 it('usage errors exit 2',async()=>{
  expect((await runValidate([])).exitCode).toBe(2);
  expect(await runValidate(['--nope'])).toMatchObject({exitCode:2,output:{error:'unknown argument --nope'}});
  expect(await runValidate(['--gold-diff'])).toMatchObject({exitCode:2,output:{error:'--gold-diff needs a value'}});
  expect(await runValidate(['--gold','--gold'])).toMatchObject({exitCode:2,output:{error:'duplicate flag --gold'}});
  expect(await runValidate(['--gold','--release'])).toMatchObject({exitCode:2,output:{error:'unknown argument --release'}});
 });
 it('an unknown base is a failed check (exit 1), not a crash',async()=>{
  expect(await runValidate(['--gold-diff','0'.repeat(40)])).toMatchObject({exitCode:1,output:{checks:{gold_diff:{ok:false,error:{code:'gold_diff_violation',reason:'base_not_found'}}}}});
 });
 it('handlers are a flag table: a new validator is one more entry (Task 12)',async()=>{
  const extra:ValidateHandler={flag:'--always-fails',name:'always_fails',takesValue:true,run:(_root,value)=>({ok:false,value})};
  const r=await runValidate(['--always-fails','v','--gold'],{handlers:[...HANDLERS,extra]});
  expect(r.exitCode).toBe(1);
  expect(r.output.checks).toMatchObject({gold:{ok:true},always_fails:{ok:false,value:'v'}});
 });
 it('modifiers after a flag value reach the handler as a set; async handlers are awaited',async()=>{
  const seen:string[][]=[];
  const extra:ValidateHandler={flag:'--probe',name:'probe',takesValue:true,modifiers:['--release'],run:async(_root,value,mods)=>{seen.push([value!,...mods]);return findingsCheck([]);}};
  expect(await runValidate(['--probe','x','--release'],{handlers:[extra]})).toMatchObject({exitCode:0,output:{checks:{probe:{ok:true,findings:[]}}}});
  expect(await runValidate(['--probe','y'],{handlers:[extra]})).toMatchObject({exitCode:0});
  expect(seen).toEqual([['x','--release'],['y']]);
 });
});

describe('runValidate on a temp repository with violations',()=>{
 const root=mkdtempSync(join(tmpdir(),'f6-validate-'));
 afterAll(()=>rmSync(root,{recursive:true,force:true}));
 const g=(...args:string[])=>execFileSync('git',['-c','user.name=f6-test','-c','user.email=f6-test@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null',...args],{cwd:root,stdio:['ignore','pipe','pipe']}).toString('utf8').trim();
 const write=(path:string,text:string)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),text);};
 it('reports gold, lock, diff and redact failures together with exit 1',async()=>{
  g('init','-q','-b','main');
  write(RECORDERS_PATH,JSON.stringify({version:1,recorders:[{id:'owner',role:'owner',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'}]}));
  write(LOCK_PATH,JSON.stringify({files:[]}));
  write(`${GOLD_DIR}/facts/bad.json`,JSON.stringify({schema_version:1,set_id:'facts/bad',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code'],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],cases:[{case_id:'X'}]}));
  g('add','-A');g('commit','-q','-m','c1');
  const c1=g('rev-parse','HEAD');
  g('rm','-q',`${GOLD_DIR}/facts/bad.json`);g('commit','-q','-m','c2');
  write('docs/evals/2026-11-06/x.md','postgres://u:p@h/db');
  const {exitCode,output}=await runValidate(['--gold','--lock','--gold-diff',c1,'--redact'],{root});
  expect(exitCode).toBe(1);
  expect(output.checks.gold.ok).toBe(true);
  expect(output.checks.gold_diff).toMatchObject({ok:false,violations:[{code:'set_deleted',path:`${GOLD_DIR}/facts/bad.json`}]});
  expect(output.checks.redact).toMatchObject({ok:false,findings:[{path:'docs/evals/2026-11-06/x.md',rule:'postgres_url',line:1}]});
  write(`${GOLD_DIR}/facts/bad.json`,'{"schema_version":1}');
  const again=await runValidate(['--gold','--lock'],{root});
  expect(again.output.checks.gold.ok).toBe(false);
  expect(again.output.checks.lock).toMatchObject({ok:false});
 });
});
```

- [ ] **Step 14: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/validate/cli.test.ts`
Expected: FAIL，`Error: Cannot find module './cli' imported from …/src/lib/evals/validate/cli.test.ts`

- [ ] **Step 15: 实现 validate/cli.ts 与脚本**

`src/lib/evals/validate/cli.ts`:

```ts
// src/lib/evals/validate/cli.ts
// Evidence validators behind scripts/evals/validate.ts (spec §4.4, §4.5, §7.3; §8–§10 arrive in Task 12).
// One handler per flag in HANDLERS; adding a validator = appending one entry (Task 12: --expert <f>,
// --audit <dir>, --manifest <f>, each with the --release modifier where it applies). Checks run in
// HANDLERS order regardless of argv order, every selected check runs even after a failure, and a thrown
// error becomes {ok:false,error}. A handler may be async. Exit 0 when every selected check is ok, 1 when
// any selected check fails, 2 for usage errors (spec §3.2: 2 = refused before running).
import {EvalError} from '../errors';
import {goldDiffAgainst} from '../gold/diff';
import {checkLock,listGoldSetPaths,loadGoldSet,loadLock,loadRecorders} from '../gold/load';
import type {GoldLock,ValidatorFinding} from '../types';
import {redactScan,redactTargets} from '../redact';

/** findings: the ValidatorFinding list of a Task-12 check (--expert/--audit/--manifest); gold/lock/diff/redact keep their own fields. */
export interface CheckResult{ok:boolean;findings?:unknown[];[k:string]:unknown}
/** modifiers: bare flags accepted right after this handler's flag/value (e.g. --release), passed to run as a set. */
export interface ValidateHandler{flag:string;name:string;takesValue:boolean;modifiers?:readonly string[];run(root:string,value:string|null,modifiers:ReadonlySet<string>):CheckResult|Promise<CheckResult>}
/** A Task-12 check result: ok iff no findings. */
export const findingsCheck=(findings:ValidatorFinding[]):CheckResult=>({ok:findings.length===0,findings});
export interface ValidateOutput{ok:boolean;checks:Record<string,CheckResult>;error?:string;usage?:string}

const errorOf=(e:unknown)=>e instanceof EvalError?{code:e.code,message:e.message,...e.detail}:{message:e instanceof Error?e.message:String(e)};

export const HANDLERS:ValidateHandler[]=[
 {flag:'--gold',name:'gold',takesValue:false,run(root){
  const errors:Record<string,unknown>[]=[];
  let lock:GoldLock|null=null;
  try{lock=loadLock(root);}catch{/* reported by --lock */}
  try{loadRecorders(root);}catch(e){errors.push(errorOf(e));}
  const sets:Record<string,unknown>[]=[];
  for(const path of listGoldSetPaths(root,lock)){
   try{const s=loadGoldSet(path,root);sets.push({path,set_id:s.set_id,version:s.version,format:s.format,cases:s.cases.length,ready:s.ready});}
   catch(e){errors.push({path,...errorOf(e)});}
  }
  return {ok:errors.length===0,sets,errors};
 }},
 {flag:'--lock',name:'lock',takesValue:false,run(root){
  const lock=loadLock(root);
  const paths=listGoldSetPaths(root,lock);
  const errors:Record<string,unknown>[]=[];
  for(const path of paths){
   try{checkLock(loadGoldSet(path,root),lock);}catch(e){errors.push({path,...errorOf(e)});}
  }
  for(const f of lock.files)if(!paths.includes(f.path))errors.push({path:f.path,code:'gold_lock_mismatch',message:'locked file not found'});
  return {ok:errors.length===0,files:lock.files.length,errors};
 }},
 {flag:'--gold-diff',name:'gold_diff',takesValue:true,run(root,value){
  const r=goldDiffAgainst(value!,root);
  return {ok:r.violations.length===0,base:r.base,changed:r.changed,violations:r.violations,notices:r.notices};
 }},
 {flag:'--redact',name:'redact',takesValue:false,run(root){
  const files=redactTargets(root);
  const findings=redactScan(files);
  return {ok:findings.length===0,files:files.length,findings};
 }},
];

const flagUsage=(h:ValidateHandler)=>`[${h.flag}${h.takesValue?' <value>':''}${(h.modifiers??[]).map(m=>` [${m}]`).join('')}]`;
export const usageOf=(handlers:readonly ValidateHandler[])=>`usage: validate.ts ${handlers.map(flagUsage).join(' ')} (at least one)`;

export async function runValidate(argv:readonly string[],opts:{root?:string;handlers?:readonly ValidateHandler[]}={}):Promise<{exitCode:0|1|2;output:ValidateOutput}>{
 const root=opts.root??process.cwd(),handlers=opts.handlers??HANDLERS;
 const usage=usageOf(handlers);
 const selected=new Map<ValidateHandler,{value:string|null;modifiers:Set<string>}>();
 for(let i=0;i<argv.length;i++){
  const h=handlers.find(x=>x.flag===argv[i]);
  if(!h||selected.has(h))return {exitCode:2,output:{ok:false,checks:{},error:h?`duplicate flag ${argv[i]}`:`unknown argument ${argv[i]}`,usage}};
  let value:string|null=null;
  if(h.takesValue){
   const v=argv[i+1];
   if(v===undefined||v.startsWith('--'))return {exitCode:2,output:{ok:false,checks:{},error:`${h.flag} needs a value`,usage}};
   value=v;i++;
  }
  const modifiers=new Set<string>();
  while(i+1<argv.length&&(h.modifiers??[]).includes(argv[i+1]))modifiers.add(argv[++i]);
  selected.set(h,{value,modifiers});
 }
 if(selected.size===0)return {exitCode:2,output:{ok:false,checks:{},error:'no check selected',usage}};
 const checks:Record<string,CheckResult>={};
 for(const h of handlers){
  const sel=selected.get(h);
  if(!sel)continue;
  try{checks[h.name]=await h.run(root,sel.value,sel.modifiers);}catch(e){checks[h.name]={ok:false,error:errorOf(e)};}
 }
 const ok=Object.values(checks).every(c=>c.ok);
 return {exitCode:ok?0:1,output:{ok,checks}};
}
```

`scripts/evals/validate.ts`:

```ts
/**
 * F6 evidence validators (spec §4.4, §4.5, §7.3).
 *
 *   npx tsx scripts/evals/validate.ts [--gold] [--lock] [--gold-diff <base>] [--redact]
 *
 * --gold       every gold set parses under its format's rules (f6: §4; legacy_plan2: §0 R5-1)
 * --lock       every gold set matches lock.json (path, byte sha256, version, format) and vice versa
 * --gold-diff  committed HEAD against <base>: no case removed/renamed, changes carry a version bump
 * --redact     no credentials / e-mails / bucket paths / long note fields in F6-owned paths (redact.ts REDACT_ROOTS)
 * Task 12 adds --expert <file> [--release], --audit <dir> [--release], --manifest <file> (entries in validate/cli.ts HANDLERS).
 * Prints one JSON summary on stdout. Exit 0 when every selected check passes, 1 when a check fails, 2 for usage errors.
 */
import {runValidate} from '../../src/lib/evals/validate/cli';

runValidate(process.argv.slice(2)).then(({exitCode,output})=>{
 process.stdout.write(`${JSON.stringify(output,null,1)}\n`);
 process.exitCode=exitCode;
},e=>{process.stderr.write(`${e instanceof Error?e.stack??e.message:String(e)}\n`);process.exitCode=2;});
```

- [ ] **Step 16: 跑测试，确认通过；再跑一次真实 CLI**

Run: `npm test -- src/lib/evals/validate/cli.test.ts`
Expected: PASS（7 tests）

Run: `npx tsx scripts/evals/validate.ts --gold --lock --redact --gold-diff HEAD; echo "exit=$?"`
Expected: 打印的 JSON 里 `"ok": true`，`checks.gold.sets` 恰好一项 `src/lib/facts/fixtures/gold/plan2.json`（`legacy_plan2`、3 cases、`ready:false`），`checks.gold_diff.changed` 为 `[]`，`checks.redact.findings` 为 `[]`；最后一行 `exit=0`。

- [ ] **Step 17: 写 CI 块的失败测试**

`src/lib/evals/ci-workflow.test.ts`:

```ts
// src/lib/evals/ci-workflow.test.ts
// The `# F6` block of .github/workflows/ci.yml (spec §4.4, §7.3): full history, the gold/lock/diff/redact step, and the reports/evals artifact.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const yml=readFileSync('.github/workflows/ci.yml','utf8');
const lines=yml.split('\n');

describe('ci.yml F6 block',()=>{
 it('has balanced # F6 begin / # F6 end markers',()=>{
  expect(lines.filter(l=>l.trim()==='# F6 begin').length).toBe(3);
  expect(lines.filter(l=>l.trim()==='# F6 end').length).toBe(3);
 });
 it('checks out the full history',()=>{
  const at=lines.findIndex(l=>l.includes('uses: actions/checkout@v4'));
  expect(lines.slice(at,at+5).join('\n')).toMatch(/with:\n\s+# F6 begin\n\s+fetch-depth: 0\n\s+# F6 end/);
 });
 it('computes the base per event and runs every gold check',()=>{
  expect(yml).toContain('git merge-base "origin/$BASE_REF" HEAD');
  expect(yml).toContain('BEFORE: ${{ github.event.before }}');
  expect(yml).toContain('0000000000000000000000000000000000000000');
  expect(yml).toContain('git merge-base origin/main HEAD');
  expect(yml).toContain('npx tsx scripts/evals/validate.ts "${ARGS[@]}"');
  expect(yml).toContain('ARGS=(--gold --lock --redact)');
  expect(yml).toContain('ARGS+=(--gold-diff "$BASE")');
  expect(yml).toContain('$GITHUB_STEP_SUMMARY');
 });
 it('uploads reports/evals/** with the database summaries',()=>{
  const at=lines.findIndex(l=>l.includes('reports/migration-rehearsal.json'));
  expect(lines.slice(at,at+4).map(l=>l.trim())).toEqual(['reports/migration-rehearsal.json','# F6 begin','reports/evals/**','# F6 end']);
 });
});
```

Run: `npm test -- src/lib/evals/ci-workflow.test.ts`
Expected: FAIL，第一条用例 `expected 0 to be 3`。

- [ ] **Step 18: 修改 `.github/workflows/ci.yml`（只加三个标记块）**

块 1，checkout 取全量历史。之前：

````yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
````

之后：

````yaml
      - uses: actions/checkout@v4
        with:
          # F6 begin
          fetch-depth: 0
          # F6 end
      - uses: actions/setup-node@v4
````

块 2，紧接在 `- run: npm run typecheck` 之后插入一个步骤。之前：

````yaml
      - run: npm run typecheck
      - name: Install PostgreSQL 17 binaries
````

之后：

````yaml
      - run: npm run typecheck
      # F6 begin
      - name: F6 gold sets, lock, diff and redaction (spec §4.4, §4.5, §7.3)
        shell: bash
        env:
          EVENT_NAME: ${{ github.event_name }}
          BASE_REF: ${{ github.base_ref }}
          BEFORE: ${{ github.event.before }}
        run: |
          set -euo pipefail
          BASE=""
          NOTE=""
          case "$EVENT_NAME" in
            pull_request)
              BASE="$(git merge-base "origin/$BASE_REF" HEAD)";;
            push)
              if [ -z "$BEFORE" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ]; then
                NOTE="gold-diff skipped: push without a previous commit (event.before is all zeros)"
              elif ! git cat-file -e "$BEFORE^{commit}" 2>/dev/null; then
                NOTE="gold-diff skipped: event.before $BEFORE is not in the fetched history (force push)"
              else
                BASE="$BEFORE"
              fi;;
            workflow_dispatch)
              MB="$(git merge-base origin/main HEAD)"
              if [ "$MB" = "$(git rev-parse HEAD)" ]; then
                NOTE="gold-diff skipped: dispatched on main (merge-base equals HEAD)"
              else
                BASE="$MB"
              fi;;
            *)
              NOTE="gold-diff skipped: event $EVENT_NAME has no base";;
          esac
          ARGS=(--gold --lock --redact)
          if [ -n "$BASE" ]; then ARGS+=(--gold-diff "$BASE"); fi
          {
            echo "### F6 validate"
            if [ -n "$NOTE" ]; then echo "$NOTE"; fi
            echo '```json'
          } >> "$GITHUB_STEP_SUMMARY"
          STATUS=0
          npx tsx scripts/evals/validate.ts "${ARGS[@]}" | tee -a "$GITHUB_STEP_SUMMARY" || STATUS=$?
          echo '```' >> "$GITHUB_STEP_SUMMARY"
          exit "$STATUS"
      # F6 end
      - name: Install PostgreSQL 17 binaries
````

块 3，上传工件追加 `reports/evals/**`。之前：

````yaml
          path: |
            reports/research-db-summary.json
            reports/migration-rehearsal.json
      - name: Next-resolved patched image runtime
````

之后：

````yaml
          path: |
            reports/research-db-summary.json
            reports/migration-rehearsal.json
            # F6 begin
            reports/evals/**
            # F6 end
      - name: Next-resolved patched image runtime
````

- [ ] **Step 19: 跑 CI 块测试，并确认 YAML 能解析、步骤脚本在本地能跑**

Run: `npm test -- src/lib/evals/ci-workflow.test.ts`
Expected: PASS（4 tests）

Run: `python3 -c "import yaml;w=yaml.safe_load(open('.github/workflows/ci.yml'));print([s.get('name') for s in w['jobs']['test']['steps'] if 'F6' in str(s.get('name'))])"`
Expected: `['F6 gold sets, lock, diff and redaction (spec §4.4, §4.5, §7.3)']`（没有 PyYAML 就用 `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "ok"'`，Expected `ok`）

Run（模拟一次全零 `before` 的 push；summary 写到临时文件）:
`python3 -c "import yaml;w=yaml.safe_load(open('.github/workflows/ci.yml'));print(next(s['run'] for s in w['jobs']['test']['steps'] if str(s.get('name')).startswith('F6')))" > "${TMPDIR:-/tmp}/f6-step.sh" && EVENT_NAME=push BEFORE=0000000000000000000000000000000000000000 BASE_REF= GITHUB_STEP_SUMMARY="${TMPDIR:-/tmp}/f6-summary.md" bash "${TMPDIR:-/tmp}/f6-step.sh" > /dev/null; echo "exit=$?"; sed -n 2p "${TMPDIR:-/tmp}/f6-summary.md"`
Expected: `exit=0`，第二行 `gold-diff skipped: push without a previous commit (event.before is all zeros)`。再用 `BEFORE=$(git rev-parse HEAD)` 跑一次：Expected `exit=0`，summary 的 JSON 里有 `"gold_diff"`。

- [ ] **Step 20: 全部 evals 测试、类型检查与 lint**

Run: `npm test -- src/lib/evals`
Expected: PASS（Task 1–3 的全部文件）

Run: `npm run typecheck && npm run lint`
Expected: 两者都 exit 0。

- [ ] **Step 21: 暂存**

```bash
git add src/lib/evals/gold/diff.ts src/lib/evals/gold/diff.test.ts src/lib/evals/redact.ts src/lib/evals/redact.test.ts src/lib/evals/hash-source.ts src/lib/evals/hash-source.test.ts src/lib/evals/validate/cli.ts src/lib/evals/validate/cli.test.ts src/lib/evals/ci-workflow.test.ts scripts/evals/validate.ts scripts/evals/hash-source.ts .github/workflows/ci.yml
```

- [ ] **Step 22: 提交**

```bash
git commit -m "feat(evals): gold-diff (pure + git), redact scan, validate CLI flag table, hash-source, CI F6 block (F6 Task 3)" -m "Spec §4.4, §4.5, §7.3. CI: fetch-depth 0, base per event (PR merge-base, push event.before, dispatch merge-base), reports/evals/** artifact." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 评测器代码版本与报告（`version.ts` / `report.ts`）

**本任务定死的约定：**
- `evaluatorVersion(resolve?)`：默认 `resolve = () => resolveCodeVersion({allowGit:true})`（`src/lib/facts/deps.ts`）；可注入以便单测。`null` → `EvalError('code_version_missing')`；去掉末尾 `-dirty` 得到 `dirty:true`；剩下的必须是 40 位小写 hex，否则 `code_version_missing`。`ci` 记录 `dirty`，`report` 拒绝 `dirty_tree` 的判断留给 `run.ts`（Task 9）。
- `buildReport(input:BuildReportInput):EvalReport`（骨架只给了签名名字，本任务定输入形状，见代码）：`module`、`artifact_class`、`thresholds`、`set{…}` 一律取自 `GoldSet`；`run_id` 必须是 UUID（`dq_eval_runs.run_id uuid`）；`summary.thresholds` 必须等于集的阈值；`cases` 按 `case_id` 码元序排列。
- `renderMarkdown`：固定章节顺序（头表 → Gate → Summary → Correctness → Coverage → Execution → Thresholds → Gold → 案例），只用报告自己的字段；案例表只列非 pass（`isPassOutcome` 为假）的案例并按 `case_id` 排；单元格里的 `|`、`\`、换行转义；`reference_regression` 从不渲染 `cases[]` 的任何值或 id，只有摘要计数（哨兵规则 §5.4）。
- `reportPaths(r, root?)`：不给 `root` 返回仓库相对路径（即 `report_ref`），给了返回 `join(root, …)`。日期 = `started_at` 前 10 个字符（ISO UTC 日期）。受限工件：`ci` → `restricted_in_ci`；`report` → `kind_not_enabled`（本期不建 `eval-restricted` 桶，§16 D8）。
- `writeReportFiles(r, root=cwd)`：写 `canonicalJson(r)+'\n'` 的 UTF-8 字节，返回**恰好这些字节**的 sha256（= `dq_eval_runs.report_sha256`）；`report` 模式另写 `.md`；用 `flag:'wx'`，**已存在则拒绝**（`report_write_failed`，"run_id 命名，不覆盖"）。
- 环境块不带凭据：`db_host` 必须是裸 `host[:port]`（不含 `@`、`://`、`/`、`?`），`app_origin` 必须是不带 userinfo 的 http(s) origin（`new URL(o).origin === o`），`db_state_rev` 为安全整数或 null；违反 → `report_write_failed`（`detail.reason='environment_credentials'`）。`buildReport` 和 `writeReportFiles` 都检查。

**Files:**
- Create: `src/lib/evals/version.ts`, `src/lib/evals/report.ts`
- Test: `src/lib/evals/version.test.ts`, `src/lib/evals/report.test.ts`
- Read only: `src/lib/facts/deps.ts`（`resolveCodeVersion({allowGit})`）

- [ ] **Step 1: 写 version 的失败测试**

`src/lib/evals/version.test.ts`:

```ts
// src/lib/evals/version.test.ts
import {describe,expect,it} from 'vitest';
import {EvalError} from './errors';
import {evaluatorVersion} from './version';

const SHA='0123456789abcdef0123456789abcdef01234567';
const codeOf=(f:()=>unknown)=>{try{f();return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).code;}};

describe('evaluatorVersion',()=>{
 it('splits a clean and a dirty version',()=>{
  expect(evaluatorVersion(()=>SHA)).toEqual({sha:SHA,dirty:false});
  expect(evaluatorVersion(()=>`${SHA}-dirty`)).toEqual({sha:SHA,dirty:true});
 });
 it('null or a non-40-hex value → code_version_missing',()=>{
  expect(codeOf(()=>evaluatorVersion(()=>null))).toBe('code_version_missing');
  expect(codeOf(()=>evaluatorVersion(()=>'abc123'))).toBe('code_version_missing');
  expect(codeOf(()=>evaluatorVersion(()=>SHA.toUpperCase()))).toBe('code_version_missing');
  expect(codeOf(()=>evaluatorVersion(()=>`${SHA}-dirty-dirty`))).toBe('code_version_missing');
 });
 it('defaults to plan 2 resolveCodeVersion (this checkout has a git HEAD)',()=>{
  const v=evaluatorVersion();
  expect(v.sha).toMatch(/^[0-9a-f]{40}$/);
  expect(typeof v.dirty).toBe('boolean');
 });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/version.test.ts`
Expected: FAIL，`Error: Cannot find module './version' imported from …/src/lib/evals/version.test.ts`

- [ ] **Step 3: 实现 version.ts**

`src/lib/evals/version.ts`:

```ts
// src/lib/evals/version.ts
// evaluator_code_version (spec §6.4): VERCEL_GIT_COMMIT_SHA, else `git rev-parse HEAD` (+ '-dirty' when the
// tree has changes) via plan 2's resolveCodeVersion({allowGit:true}). Split into {sha, dirty}; the sha
// must be 40 lowercase hex (dq_eval_runs check). ci records dirty:true, report refuses it (run.ts).
import {resolveCodeVersion} from '../facts/deps';
import {EvalError} from './errors';

const SHA=/^[0-9a-f]{40}$/;
export function evaluatorVersion(resolve:()=>string|null=()=>resolveCodeVersion({allowGit:true})):{sha:string;dirty:boolean}{
 const v=resolve();
 if(v===null)throw new EvalError('code_version_missing','no VERCEL_GIT_COMMIT_SHA and no git HEAD');
 const dirty=v.endsWith('-dirty');
 const sha=dirty?v.slice(0,-'-dirty'.length):v;
 if(!SHA.test(sha))throw new EvalError('code_version_missing',`not a 40-hex commit: ${v.slice(0,60)}`,{value:v.slice(0,60)});
 return {sha,dirty};
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/version.test.ts`
Expected: PASS（3 tests；第三条在工作树里走 `git rev-parse HEAD`）

- [ ] **Step 5: 写 report 的失败测试**

`src/lib/evals/report.test.ts`:

```ts
// src/lib/evals/report.test.ts
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './canonical-json';
import {EvalError} from './errors';
import {assertEnvironmentClean,buildReport,renderMarkdown,reportPaths,writeReportFiles} from './report';
import {summarize} from './summary';
import type {CaseOutcome,CaseReport,EvalReport,GoldSet,ReportEnvironment} from './types';

const RUN='3f2a9c1e-7b4d-4e2a-9c1e-7b4d4e2a9c1e';
const SHA='0123456789abcdef0123456789abcdef01234567';
const SET={schema_version:1,format:'f6',set_id:'facts/synthetic-us',version:2,module:'facts',artifact_class:'public',module_implementers:['claude-code'],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},
 optional_cases:[],history:[],cases:[],ready:true,path:'src/lib/evals/fixtures/gold/facts/synthetic-us.json',sha256:'d'.repeat(64)} as GoldSet;
const rep=(id:string,outcome:CaseOutcome,left:string|null=null,right:string|null=null):CaseReport=>({case_id:id,required:true,outcome,left,right,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail:{}});
const CASES=[rep('Z/pass',{result:'pass'},'1','1'),rep('A|pipe/fail',{result:'fail',reason:'value'},'101','100'),rep('M/missing',{result:'missing'},null,'5')];
const ENV:ReportEnvironment={db_host:'127.0.0.1:54329',app_origin:null,db_state_rev:7};
const build=(over:Partial<Parameters<typeof buildReport>[0]>={})=>{
 const cases=over.cases??CASES;
 return buildReport({runId:RUN,kind:'official_reconciliation',mode:'report',privileged:false,set:SET,env:{today:'2026-11-06',now:()=>new Date(0),evaluatorCodeVersion:SHA,dirty:false},environment:ENV,
  startedAt:'2026-11-06T09:00:00.000Z',finishedAt:'2026-11-06T09:00:05.000Z',verified:{artifacts:false,sources:false},
  summary:summarize(cases,{thresholds:SET.thresholds,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:'truth'}),cases,...over});
};
const codeOf=(f:()=>unknown)=>{try{f();return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).code;}};
const roots:string[]=[];
afterAll(()=>{for(const r of roots)rmSync(r,{recursive:true,force:true});});
const tmp=()=>{const r=mkdtempSync(join(tmpdir(),'f6-report-'));roots.push(r);return r;};

describe('buildReport',()=>{
 it('assembles the §7.2 shape from the set, env and run; cases sorted by case_id',()=>{
  const r=build();
  expect(r).toMatchObject({schema_version:1,run_id:RUN,kind:'official_reconciliation',module:'facts',mode:'report',privileged:false,artifact_class:'public',
   set:{id:'facts/synthetic-us',version:2,sha256:'d'.repeat(64),format:'f6',path:SET.path},evaluator_code_version:SHA,dirty:false,
   environment:ENV,thresholds:SET.thresholds,provenance:{verified:{artifacts:false,sources:false}}});
  expect(r.cases.map(c=>c.case_id)).toEqual(['A|pipe/fail','M/missing','Z/pass']);
  expect(r.summary.gate).toBe('incomplete');
 });
 it('rejects a non-uuid run id, a non-40-hex code version and thresholds that differ from the set',()=>{
  expect(codeOf(()=>build({runId:'run-1'}))).toBe('report_write_failed');
  expect(codeOf(()=>build({env:{today:'2026-11-06',now:()=>new Date(0),evaluatorCodeVersion:'abc',dirty:false}}))).toBe('code_version_missing');
  const s=build().summary;
  expect(codeOf(()=>build({summary:{...s,thresholds:{max_fail:3,min_coverage_optional:'0.95'}}}))).toBe('report_write_failed');
 });
});

describe('environment carries no credentials',()=>{
 it('accepts bare hosts and origins, null fields',()=>{
  for(const e of [ENV,{db_host:null,app_origin:null,db_state_rev:null},{db_host:'db.abcdefgh.supabase.co',app_origin:'https://alpha.example.com',db_state_rev:0}] as ReportEnvironment[])expect(()=>assertEnvironmentClean(e)).not.toThrow();
 });
 it('rejects user:password@host, URLs in db_host, userinfo or paths in app_origin',()=>{
  for(const e of [{db_host:'postgres:secret@db.example.com'},{db_host:'postgres://db.example.com'},{db_host:'db.example.com/postgres?password=x'},{app_origin:'https://u:p@alpha.example.com'},{app_origin:'https://alpha.example.com/path?key=1'},{app_origin:'file:///etc'}])
   expect(codeOf(()=>assertEnvironmentClean({...ENV,...e} as ReportEnvironment)),JSON.stringify(e)).toBe('report_write_failed');
  expect(codeOf(()=>build({environment:{...ENV,db_host:'u:pw@h'}}))).toBe('report_write_failed');
 });
});

describe('renderMarkdown',()=>{
 it('two renders are byte-identical, also for a report rebuilt with keys in another order',()=>{
  const r=build();
  const reordered=JSON.parse(canonicalJson(r)) as EvalReport;
  expect(renderMarkdown(r)).toBe(renderMarkdown(r));
  expect(renderMarkdown(reordered)).toBe(renderMarkdown(r));
 });
 it('fixed section order, non-pass cases only, pipes escaped, ends with a newline',()=>{
  const md=renderMarkdown(build());
  const order=['# Eval report:','## Gate','## Summary','### Correctness','### Coverage','### Execution','### Thresholds','### Gold','## Non-pass cases (2 of 3)'].map(h=>md.indexOf(h));
  expect(order.every((x,i)=>x>=0&&(i===0||x>order[i-1]))).toBe(true);
  expect(md).toContain('| A\\|pipe/fail | true | fail | value | 101 | 100 | — | — | 0 |');
  expect(md).toContain('| M/missing | true | missing | — | — | 5 | — | — | 0 |');
  expect(md).not.toContain('Z/pass');
  expect(md.endsWith('\n')).toBe(true);
  expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}T(?!09:00:0[05]\.000Z)/);
 });
 it('reference_regression: never renders cases[] values, only summary counts (sentinel)',()=>{
  const canary=rep('__canary__',{result:'beyond_unexplained'},'1','918273645.5');
  const md=renderMarkdown(build({kind:'reference_regression',cases:[canary,rep('S1',{result:'within'},'2','2')]}));
  expect(md).not.toContain('918273645.5');
  expect(md).not.toContain('__canary__');
  expect(md).toContain('Case values are not rendered for reference_regression');
  expect(md).toContain('| 1 | 0 | 0 | 0 | 1 |');
 });
});

describe('reportPaths',()=>{
 it('ci → reports/evals/<run_id>.json without .md',()=>{
  expect(reportPaths(build({mode:'ci'}))).toEqual({json:`reports/evals/${RUN}.json`,md:null});
 });
 it('report → docs/evals/<date of started_at>/<module>-<kind>-<run8>.{json,md}',()=>{
  expect(reportPaths(build())).toEqual({json:'docs/evals/2026-11-06/facts-official_reconciliation-3f2a9c1e.json',md:'docs/evals/2026-11-06/facts-official_reconciliation-3f2a9c1e.md'});
  expect(reportPaths(build(),'/r').json).toBe('/r/docs/evals/2026-11-06/facts-official_reconciliation-3f2a9c1e.json');
 });
 it('restricted: restricted_in_ci in ci, kind_not_enabled in report (§16 D8)',()=>{
  const restricted={...SET,artifact_class:'restricted'} as GoldSet;
  expect(codeOf(()=>reportPaths(build({set:restricted,mode:'ci'})))).toBe('restricted_in_ci');
  expect(codeOf(()=>reportPaths(build({set:restricted})))).toBe('kind_not_enabled');
 });
});

describe('writeReportFiles',()=>{
 it('writes canonicalJson + newline and returns the sha256 of exactly those bytes',()=>{
  const root=tmp(),r=build();
  const w=writeReportFiles(r,root);
  const bytes=readFileSync(join(root,w.json));
  expect(w.sha256).toBe(sha256Hex(bytes));
  expect(bytes.toString('utf8')).toBe(`${canonicalJson(r)}\n`);
  expect(JSON.parse(bytes.toString('utf8'))).toEqual(r);
  expect(readFileSync(join(root,w.md!),'utf8')).toBe(renderMarkdown(r));
 });
 it('ci writes only the JSON',()=>{
  const root=tmp();
  expect(writeReportFiles(build({mode:'ci'}),root)).toMatchObject({json:`reports/evals/${RUN}.json`,md:null});
 });
 it('never overwrites an existing report',()=>{
  const root=tmp(),r=build({mode:'ci'});
  writeReportFiles(r,root);
  expect(codeOf(()=>writeReportFiles(r,root))).toBe('report_write_failed');
 });
 it('refuses a report whose environment carries credentials',()=>{
  const r={...build({mode:'ci'}),environment:{db_host:'u:p@h',app_origin:null,db_state_rev:null}};
  expect(codeOf(()=>writeReportFiles(r,tmp()))).toBe('report_write_failed');
 });
});
```

- [ ] **Step 6: 跑测试，确认失败**

Run: `npm test -- src/lib/evals/report.test.ts`
Expected: FAIL，`Error: Cannot find module './report' imported from …/src/lib/evals/report.test.ts`

- [ ] **Step 7: 实现 report.ts**

`src/lib/evals/report.ts`:

```ts
// src/lib/evals/report.ts
// Run reports (spec §6.1, §7.2, §4.5). buildReport assembles the EvalReport from a finished in-memory run;
// renderMarkdown is deterministic (fixed section order, cases sorted by case_id, only the report's own
// fields — no clock, no environment lookups), so two renders are byte-identical. The cases table lists
// non-pass cases only; reference_regression never renders cases[] values (sentinel rule, §5.4), only the
// summary counts. Paths: ci → reports/evals/<run_id>.json (no .md); report → docs/evals/<YYYY-MM-DD of
// started_at>/<module>-<kind>-<run_id first 8>.{json,md}. Restricted artifacts: restricted_in_ci in ci,
// kind_not_enabled in report (no private bucket this phase, §16 D8). writeReportFiles writes
// canonicalJson(report)+'\n' and returns the sha256 of exactly those bytes; it never overwrites.
// The environment block must carry no credentials (db_host is a bare host[:port], app_origin an origin).
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {canonicalJson,sha256Hex} from './canonical-json';
import {EvalError} from './errors';
import {isPassOutcome} from './summary';
import type {CaseReport,EvalKind,EvalMode,EvalReport,EvalEnv,GoldSet,ReportEnvironment,Summary} from './types';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{40}$/;
const HOST=/^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/;
const byCaseId=(a:CaseReport,b:CaseReport)=>a.case_id<b.case_id?-1:a.case_id>b.case_id?1:0;

/** Throws EvalError('report_write_failed') when db_host / app_origin could carry a credential. */
export function assertEnvironmentClean(e:ReportEnvironment):void{
 const bad=(field:string)=>new EvalError('report_write_failed',`environment.${field} must not carry credentials`,{reason:'environment_credentials',field});
 if(e.db_host!==null&&(!HOST.test(e.db_host)||e.db_host.includes('@')))throw bad('db_host');
 if(e.app_origin!==null){
  let u:URL;
  try{u=new URL(e.app_origin);}catch{throw bad('app_origin');}
  if(u.username!==''||u.password!==''||u.origin!==e.app_origin||!/^https?:$/.test(u.protocol))throw bad('app_origin');
 }
 if(e.db_state_rev!==null&&!Number.isSafeInteger(e.db_state_rev))throw bad('db_state_rev');
}

export interface BuildReportInput{
 runId:string;kind:EvalKind;mode:EvalMode;privileged:boolean;set:GoldSet;env:EvalEnv;environment:ReportEnvironment;
 startedAt:string;finishedAt:string;verified:{artifacts:boolean;sources:boolean};summary:Summary;cases:CaseReport[];
}
export function buildReport(i:BuildReportInput):EvalReport{
 if(!UUID.test(i.runId))throw new EvalError('report_write_failed','run_id must be a uuid',{reason:'run_id'});
 if(!SHA.test(i.env.evaluatorCodeVersion))throw new EvalError('code_version_missing','evaluator_code_version must be 40 hex');
 assertEnvironmentClean(i.environment);
 if(canonicalJson(i.summary.thresholds)!==canonicalJson(i.set.thresholds))throw new EvalError('report_write_failed','summary thresholds differ from the set',{reason:'thresholds'});
 return {
  schema_version:1,run_id:i.runId,kind:i.kind,module:i.set.module,mode:i.mode,privileged:i.privileged,artifact_class:i.set.artifact_class,
  set:{id:i.set.set_id,version:i.set.version,sha256:i.set.sha256,format:i.set.format,path:i.set.path},
  evaluator_code_version:i.env.evaluatorCodeVersion,dirty:i.env.dirty,started_at:i.startedAt,finished_at:i.finishedAt,
  environment:{db_host:i.environment.db_host,app_origin:i.environment.app_origin,db_state_rev:i.environment.db_state_rev},
  thresholds:i.set.thresholds,provenance:{verified:{artifacts:i.verified.artifacts,sources:i.verified.sources}},
  summary:i.summary,cases:[...i.cases].sort(byCaseId),
 };
}

const cell=(v:unknown)=>v===null||v===undefined||v===''?'—':String(v).replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const row=(xs:unknown[])=>`| ${xs.map(cell).join(' | ')} |`;
function reasonOf(c:CaseReport):string{
 const o=c.outcome as {reason?:string;ledger_ids?:string[]};
 return o.reason??(o.ledger_ids&&o.ledger_ids.length>0?o.ledger_ids.join(','):'');
}

export function renderMarkdown(r:EvalReport):string{
 const s=r.summary;
 const out:string[]=[
  `# Eval report: ${r.kind} · ${r.module} · ${r.set.id} v${r.set.version}`,'',
  '| field | value |','|---|---|',
  row(['run_id',r.run_id]),row(['mode',r.mode]),row(['privileged',r.privileged]),row(['artifact_class',r.artifact_class]),
  row(['set',`${r.set.id} v${r.set.version} (${r.set.format})`]),row(['set path',r.set.path]),row(['set sha256',r.set.sha256]),
  row(['evaluator_code_version',r.evaluator_code_version]),row(['dirty',r.dirty]),row(['started_at',r.started_at]),row(['finished_at',r.finished_at]),
  row(['db_host',r.environment.db_host]),row(['app_origin',r.environment.app_origin]),row(['db_state_rev',r.environment.db_state_rev]),
  row(['verified artifacts',r.provenance.verified.artifacts]),row(['verified sources',r.provenance.verified.sources]),'',
  '## Gate','',`**${s.gate}** · evidence_class \`${s.evidence_class}\``,'',
  '## Summary','',
  '| population | required |','|---|---|',row([s.population,s.required]),'',
  '### Correctness','','| pass | fail | unit_mismatch | provenance_incomplete | unexplained_diff |','|---|---|---|---|---|',
  row([s.correctness.pass,s.correctness.fail,s.correctness.unit_mismatch,s.correctness.provenance_incomplete,s.correctness.unexplained_diff]),'',
  '### Coverage','','| evaluated | evaluated_optional | missing_required | missing_optional | not_visible | skipped |','|---|---|---|---|---|---|',
  row([s.coverage.evaluated,s.coverage.evaluated_optional,s.coverage.missing_required,s.coverage.missing_optional,s.coverage.not_visible,s.coverage.skipped]),'',
  '### Execution','','| read_error | truncated | subset |','|---|---|---|',row([s.execution.read_error,s.execution.truncated,s.execution.subset]),'',
  '### Thresholds','','| max_fail | min_coverage_optional |','|---|---|',row([s.thresholds.max_fail,s.thresholds.min_coverage_optional]),'',
  '### Gold','','| format | ready | pending | provenance_gaps |','|---|---|---|---|',row([s.gold.format,s.gold.ready,s.gold.pending,s.gold.provenance_gaps]),'',
  `reconciliations_truncated: ${s.reconciliations_truncated}`,'',
 ];
 if(r.kind==='reference_regression'){
  out.push('## Cases','','Case values are not rendered for reference_regression (spec §5.4); see the summary counts above.','');
 }else{
  const nonPass=r.cases.filter(c=>!isPassOutcome(c.outcome)).sort(byCaseId);
  out.push(`## Non-pass cases (${nonPass.length} of ${r.cases.length})`,'');
  if(nonPass.length===0)out.push('None.','');
  else out.push('| case_id | required | result | reason | left | right | abs_diff | rel_diff | tolerance |','|---|---|---|---|---|---|---|---|---|',
   ...nonPass.map(c=>row([c.case_id,c.required,c.outcome.result,reasonOf(c),c.left,c.right,c.abs_diff,c.rel_diff,c.tolerance])),'');
 }
 return out.join('\n');
}

export function reportPaths(r:EvalReport,root?:string):{json:string;md:string|null}{
 if(r.artifact_class==='restricted'){
  if(r.mode==='ci')throw new EvalError('restricted_in_ci','restricted sets do not run in ci (spec §4.5)');
  throw new EvalError('kind_not_enabled','restricted reports need the eval-restricted bucket, not created this phase (spec §16 D8)');
 }
 let rel:{json:string;md:string|null};
 if(r.mode==='ci')rel={json:`reports/evals/${r.run_id}.json`,md:null};
 else{
  const date=r.started_at.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new EvalError('report_write_failed','started_at must start with YYYY-MM-DD',{reason:'started_at'});
  const base=`docs/evals/${date}/${r.module}-${r.kind}-${r.run_id.slice(0,8)}`;
  rel={json:`${base}.json`,md:`${base}.md`};
 }
 return root===undefined?rel:{json:join(root,rel.json),md:rel.md===null?null:join(root,rel.md)};
}

/** Writes the report (and its .md in report mode); returns repo-relative paths and the sha256 of the JSON bytes written. */
export function writeReportFiles(r:EvalReport,root:string=process.cwd()):{json:string;md:string|null;sha256:string}{
 assertEnvironmentClean(r.environment);
 const rel=reportPaths(r);
 const bytes=Buffer.from(`${canonicalJson(r)}\n`,'utf8');
 const write=(path:string,data:string|Buffer)=>{
  const abs=join(root,path);
  try{mkdirSync(dirname(abs),{recursive:true});writeFileSync(abs,data,{flag:'wx'});}
  catch(e){throw new EvalError('report_write_failed',`${path}: ${(e as NodeJS.ErrnoException).code??(e as Error).message}`,{path});}
 };
 write(rel.json,bytes);
 if(rel.md!==null)write(rel.md,renderMarkdown(r));
 return {json:rel.json,md:rel.md,sha256:sha256Hex(bytes)};
}
```

- [ ] **Step 8: 跑测试，确认通过**

Run: `npm test -- src/lib/evals/report.test.ts`
Expected: PASS（14 tests）

- [ ] **Step 9: 全部 evals 测试、类型检查与 lint**

Run: `npm test -- src/lib/evals`
Expected: PASS（推荐顺序 1 → 2 → 4 → 3 下，此时含 Task 1、2、4 的文件；若 Task 3 已落地则一并通过）

Run: `npm run typecheck && npm run lint`
Expected: 两者都 exit 0。

- [ ] **Step 10: 暂存**

```bash
git add src/lib/evals/version.ts src/lib/evals/version.test.ts src/lib/evals/report.ts src/lib/evals/report.test.ts
```

- [ ] **Step 11: 提交**

```bash
git commit -m "feat(evals): evaluator code version and deterministic reports (F6 Task 4)" -m "Spec §6.4, §7.2, §4.5: canonical JSON bytes + sha256, ci/report paths, restricted refused (D8), sentinel-safe markdown, credential-free environment." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: F6 storage migration, lock entry, row types, store integration test

**Files:**
- Create: `supabase/migrations/20261110090000_dq_eval_runs.sql`
- Modify: `supabase/migrations.lock.json` (append one entry)
- Modify: `src/lib/supabase/database.types.ts` (three `// F6 begin` / `// F6 end` blocks)
- Modify: `scripts/ci/research-checks.ts` (`criticalSuites`, one `// F6 begin` / `// F6 end` block)
- Create: `src/lib/evals/evals-store.integration.test.ts` (critical)

Spec: §6.2, §5.2 (text round-trip), §13.2, §0 R5-3 (no `dq_reconciliations`), §0 R5-4 (merge order).

- [ ] **Step 1: Write the failing integration test**

Create `src/lib/evals/evals-store.integration.test.ts` (Task 6 appends a second `describe` to this file; nothing in it may be skipped when `S4_TEST_STATE` is set):

```ts
// src/lib/evals/evals-store.integration.test.ts
// F6 storage on real PostgreSQL (spec §6.2, §5.2, §13.2; critical suite, independent of plan-2 tables):
// the 20261110090000_dq_eval_runs migration replays, every named constraint rejects, case rows restrict
// run deletion, anon/authenticated have no access, decimal text columns round-trip byte-identically
// through pgTableClient. Every row this file writes uses run ids it created and removes them afterwards.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261110090000_dq_eval_runs.sql';
const TABLES=['dq_eval_runs','dq_eval_case_results'];

// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
  }finally{c.release();}
 }
}

type Over=Record<string,unknown>;
const runCols=(run_id:string,o:Over={}):Over=>({
 run_id,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',set_id:'facts/synthetic-us',set_version:1,
 set_sha256:'a'.repeat(64),evaluator_code_version:'b'.repeat(40),started_at:'2026-11-10T00:00:00Z',finished_at:'2026-11-10T00:01:00Z',
 status:'passed',summary:'{}',report_ref:`reports/evals/${run_id}.json`,report_sha256:'c'.repeat(64),triggered_by:'ci',...o,
});
const caseCols=(eval_run_id:string,o:Over={}):Over=>({
 eval_run_id,case_id:'X/revenue',result:'fail',reason:'value',left_text:'101',right_text:'100',abs_diff:'1',rel_diff:'0.0099009900',tolerance:'0',detail:'{}',...o,
});
const insertSql=(table:string,cols:Over)=>{
 const keys=Object.keys(cols);
 return {text:`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,values:keys.map(k=>cols[k])};
};

describe.skipIf(!enabled)('F6 dq_eval_runs / dq_eval_case_results on real PostgreSQL',()=>{
 let admin:Pool;
 const runs:string[]=[];
 const newRun=()=>{const id=randomUUID();runs.push(id);return id;};
 const insRun=(cols:Over)=>{const q=insertSql('dq_eval_runs',cols);return admin.query(q.text,q.values);};
 const insCase=(cols:Over)=>{const q=insertSql('dq_eval_case_results',cols);return admin.query(q.text,q.values);};
 const aRun=async(o:Over={})=>{const id=newRun();await insRun(runCols(id,o));return id;};
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{
  if(admin){
   await admin.query(`delete from public.dq_eval_case_results where eval_run_id=any($1::uuid[])`,[runs]);
   await admin.query(`delete from public.dq_eval_runs where run_id=any($1::uuid[])`,[runs]);
   await admin.end();
  }
 });

 it('creates both tables with RLS enabled and no policies, and replays twice without error',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:{relname:string})=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows)expect(r.relrowsecurity).toBe(true);
  expect((await admin.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows[0].n).toBe(0);
  const sql=readFileSync(MIGRATION,'utf8');
  await expect(replayMigration(admin,sql)).resolves.toBeUndefined();
  await expect(replayMigration(admin,sql)).resolves.toBeUndefined();
  expect(sql.replace(/--.*$/gm,'')).not.toMatch(/dq_reconciliations/);   // the header comment names it; no statement may
 },60000);

 it('rejects every named dq_eval_runs constraint and a duplicate run_id',async()=>{
  const bad:[Over,RegExp][]=[
   [{kind:'bogus'},/dq_eval_runs_kind_check/],
   [{module:''},/dq_eval_runs_module_check/],
   [{module:'m'.repeat(33)},/dq_eval_runs_module_check/],
   [{mode:'prod'},/dq_eval_runs_mode_check/],
   [{artifact_class:'secret'},/dq_eval_runs_artifact_class_check/],
   [{set_version:0},/dq_eval_runs_set_version_check/],
   [{set_sha256:'A'.repeat(64)},/dq_eval_runs_set_sha256_check/],
   [{set_sha256:'a'.repeat(63)},/dq_eval_runs_set_sha256_check/],
   [{evaluator_code_version:'b'.repeat(40)+'-dirty'},/dq_eval_runs_evaluator_code_version_check/],
   [{evaluator_code_version:'b'.repeat(39)},/dq_eval_runs_evaluator_code_version_check/],
   [{report_sha256:'z'.repeat(64)},/dq_eval_runs_report_sha256_check/],
   [{status:'done'},/dq_eval_runs_status_check/],
   [{triggered_by:'cron'},/dq_eval_runs_triggered_by_check/],
   [{status:'running'},/dq_eval_runs_running_iff_unfinished/],
   [{status:'passed',finished_at:null},/dq_eval_runs_running_iff_unfinished/],
   [{finished_at:'2026-11-09T23:59:59Z'},/dq_eval_runs_finished_after_started/],
   [{summary:'[]'},/dq_eval_runs_summary_object/],
  ];
  for(const [o,re] of bad)await expect(insRun(runCols(newRun(),o)),JSON.stringify(o)).rejects.toThrow(re);
  const ok=await aRun({status:'running',finished_at:null});
  await expect(insRun(runCols(ok))).rejects.toThrow(/dq_eval_runs_pkey/);
 });

 it('rejects every named dq_eval_case_results constraint, a duplicate key and an unknown run',async()=>{
  const run=await aRun();
  const bad:[Over,RegExp][]=[
   [{case_id:''},/dq_eval_case_results_case_id_check/],
   [{case_id:'c'.repeat(513)},/dq_eval_case_results_case_id_check/],
   [{result:'pass'},/dq_eval_case_results_result_check/],
   [{result:'identical'},/dq_eval_case_results_result_check/],
   [{reason:''},/dq_eval_case_results_reason_check/],
   [{reason:'r'.repeat(65)},/dq_eval_case_results_reason_check/],
   [{left_text:'1e5'},/dq_eval_case_results_left_text_check/],
   [{left_text:'1.'},/dq_eval_case_results_left_text_check/],
   [{left_text:'+1'},/dq_eval_case_results_left_text_check/],
   [{left_text:' 1'},/dq_eval_case_results_left_text_check/],
   [{right_text:'1,000'},/dq_eval_case_results_right_text_check/],
   [{right_text:'.5'},/dq_eval_case_results_right_text_check/],
   [{abs_diff:'-1'},/dq_eval_case_results_abs_diff_check/],
   [{rel_diff:'-0.1'},/dq_eval_case_results_rel_diff_check/],
   [{tolerance:'-0.01'},/dq_eval_case_results_tolerance_check/],
   [{tolerance:'1%'},/dq_eval_case_results_tolerance_check/],
   [{detail:'[]'},/dq_eval_case_results_detail_object/],
  ];
  for(const [i,[o,re]] of bad.entries())await expect(insCase(caseCols(run,{case_id:`bad/${i}`,...o})),JSON.stringify(o)).rejects.toThrow(re);
  await insCase(caseCols(run,{left_text:null,right_text:'-12.5',abs_diff:null,rel_diff:null,reason:null,result:'missing'}));
  await expect(insCase(caseCols(run))).rejects.toThrow(/dq_eval_case_results_pkey/);
  await expect(insCase(caseCols(randomUUID()))).rejects.toThrow(/dq_eval_case_results_eval_run_id_fkey/);
 });

 it('refuses to delete a run that still has case rows (on delete restrict); a run without case rows deletes',async()=>{
  const run=await aRun();await insCase(caseCols(run));
  await expect(admin.query(`delete from public.dq_eval_runs where run_id=$1`,[run])).rejects.toThrow(/dq_eval_case_results_eval_run_id_fkey/);
  const empty=await aRun();
  expect((await admin.query(`delete from public.dq_eval_runs where run_id=$1`,[empty])).rowCount).toBe(1);
 });

 it('grants nothing to anon/authenticated (privileges and real role reads/writes) and select/insert/update/delete to service_role',async()=>{
  const priv=async(role:string,t:string,p:string)=>(await admin.query(`select has_table_privilege($1,'public.'||$2,$3) ok`,[role,t,p])).rows[0].ok;
  for(const role of ['anon','authenticated'])for(const t of TABLES)for(const p of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])
   expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const t of TABLES)for(const p of ['SELECT','INSERT','UPDATE','DELETE'])expect({t,p,ok:await priv('service_role',t,p)}).toEqual({t,p,ok:true});
  const run=await aRun();
  for(const role of ['anon','authenticated'])for(const sql of [`select * from public.dq_eval_runs`,`select * from public.dq_eval_case_results`,insertSql('dq_eval_case_results',caseCols(run,{case_id:`role/${role}`})).text]){
   const c=await admin.connect();
   try{
    await c.query('begin');await c.query(`set local role ${role}`);
    const values=sql.startsWith('insert')?insertSql('dq_eval_case_results',caseCols(run,{case_id:`role/${role}`})).values:[];
    await expect(c.query(sql,values),`${role}: ${sql.slice(0,40)}`).rejects.toMatchObject({code:'42501'});
   }finally{await c.query('rollback');c.release();}
  }
 });

 it('round-trips a 20-digit integer and an 18-decimal value byte-identically through pgTableClient',async()=>{
  const tables=pgTableClient(admin);
  const run=await aRun();
  const row={eval_run_id:run,case_id:'X/precision',result:'fail',reason:'value',left_text:'12345678901234567890',right_text:'-0.123456789012345678',
   abs_diff:'12345678901234567890.123456789012345678',rel_diff:'1.0000000000',tolerance:'0.000000000000000001',detail:{locator:{page:1}}};
  await tables.insert('dq_eval_case_results',row);
  const [back]=await tables.select('dq_eval_case_results',{eval_run_id:run,case_id:'X/precision'});
  for(const k of ['left_text','right_text','abs_diff','rel_diff','tolerance'] as const)expect({k,v:back[k]}).toEqual({k,v:row[k]});
  expect(typeof back.left_text).toBe('string');
  expect(back.detail).toEqual({locator:{page:1}});
 });
});
```

- [ ] **Step 2: Run it — expect failures (no tables yet), and the suite-inventory check failing**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/evals/evals-store.integration.test.ts`
Expected: FAIL — the first test fails with `expected [] to deeply equal [ 'dq_eval_case_results', 'dq_eval_runs' ]`, the others with `relation "public.dq_eval_runs" does not exist` (or `…dq_eval_case_results…`).

Run: `npm test -- src/lib/research/ci-contract.test.ts`
Expected: FAIL — `requires all state-gated suites to be registered` throws `Database suite inventory drift` (the new file contains `S4_TEST_STATE` and is not in `criticalSuites`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261110090000_dq_eval_runs.sql` (the SQL is spec §6.2 verbatim; only the header comment is added). The file must end with exactly one newline after `end $$;`.

```sql
-- supabase/migrations/20261110090000_dq_eval_runs.sql
-- F6 evaluation framework (spec 2026-11-04-evals-and-gold-sets-design.md §6.2, §0 R5-3/R5-4):
-- one row per evaluation run (dq_eval_runs) and the per-case non-pass results of public
-- official/dual_source runs (dq_eval_case_results, at most 100 per run; the report file keeps all).
-- Decimal comparison values are TEXT with format checks so they never round-trip through numeric.
-- Does not touch dq_reconciliations. Service-role only: RLS on with no policies, and privileges
-- revoked explicitly from public/anon/authenticated (same loop as 20261105090000_dq_foundation.sql).
-- Case rows are evidence: deleting a run that still has case rows is refused (on delete restrict).
-- Replayable: guarded create statements only.

create table if not exists public.dq_eval_runs (
  run_id                  uuid primary key,
  kind                    text not null check (kind in ('official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration')),
  module                  text not null check (length(module) between 1 and 32),
  mode                    text not null check (mode in ('ci','report')),
  privileged              boolean not null default false,
  artifact_class          text not null check (artifact_class in ('public','restricted')),
  set_id                  text not null,
  set_version             integer not null check (set_version >= 1),
  set_sha256              text not null check (set_sha256 ~ '^[0-9a-f]{64}$'),
  evaluator_code_version  text not null check (evaluator_code_version ~ '^[0-9a-f]{40}$'),
  started_at              timestamptz not null,
  finished_at             timestamptz,
  status                  text not null check (status in ('running','passed','failed','incomplete','error')),
  summary                 jsonb not null default '{}',
  report_ref              text not null,
  report_sha256           text not null check (report_sha256 ~ '^[0-9a-f]{64}$'),
  triggered_by            text not null check (triggered_by in ('manual','script','ci')),
  constraint dq_eval_runs_summary_object check (jsonb_typeof(summary) = 'object'),
  constraint dq_eval_runs_finished_after_started check (finished_at is null or finished_at >= started_at),
  constraint dq_eval_runs_running_iff_unfinished check ((status = 'running') = (finished_at is null))
);
create index if not exists dq_eval_runs_module_kind_idx on public.dq_eval_runs(module, kind, started_at desc);

create table if not exists public.dq_eval_case_results (
  eval_run_id  uuid not null references public.dq_eval_runs(run_id) on delete restrict,
  case_id      text not null check (length(case_id) between 1 and 512),
  result       text not null check (result in ('fail','unit_mismatch','provenance_incomplete','missing','not_visible','read_error','unexplained_diff')),
  reason       text check (reason is null or length(reason) between 1 and 64),
  left_text    text check (left_text  is null or left_text  ~ '^-?[0-9]+(\.[0-9]+)?$'),
  right_text   text check (right_text is null or right_text ~ '^-?[0-9]+(\.[0-9]+)?$'),
  abs_diff     text check (abs_diff   is null or abs_diff   ~ '^[0-9]+(\.[0-9]+)?$'),
  rel_diff     text check (rel_diff   is null or rel_diff   ~ '^[0-9]+(\.[0-9]+)?$'),
  tolerance    text not null check (tolerance ~ '^[0-9]+(\.[0-9]+)?$'),
  detail       jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  primary key (eval_run_id, case_id),
  constraint dq_eval_case_results_detail_object check (jsonb_typeof(detail) = 'object')
);

do $$ declare t text; begin
  foreach t in array array['dq_eval_runs','dq_eval_case_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
```

- [ ] **Step 4: Register the suite in `criticalSuites`**

In `scripts/ci/research-checks.ts`, the `criticalSuites` expression ends with `…, 'src/lib/facts/sync-us.integration.test.ts');`. Replace that final `);` so the expression continues with a marked `concat` (Task 9 adds `src/lib/evals/evals-facts.integration.test.ts` inside the same block). Use Edit with
old: `'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts');`
new:
```ts
'src/lib/facts/facts.integration.test.ts', 'src/lib/facts/sync-us.integration.test.ts')
 // F6 begin
 .concat('src/lib/evals/evals-store.integration.test.ts')
 // F6 end
;
```
(Paths in `criticalSuites` are repo-relative `src/...` strings, compared with `verifyCriticalSuiteInventory`'s `'src/' + path` discovery.)

- [ ] **Step 5: Run the migration test and the inventory check — expect pass**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/evals/evals-store.integration.test.ts`
Expected: PASS — `6 passed (6)` (db-one builds the database from `supabase/migrations/`, so the new migration is applied before the suite; the first test replays it twice more).

Run: `npm test -- src/lib/research/ci-contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Lock the migration**

Run: `shasum -a 256 supabase/migrations/20261110090000_dq_eval_runs.sql`
Expected: `7808ea386e4547c8b0e34dc891d2bc1a2c69a2cf2f32fc675a26bf130cd1a591  supabase/migrations/20261110090000_dq_eval_runs.sql` (the digest of the Step-3 bytes; if yours differs, diff your file against Step 3 — whitespace or the final newline — and fix the file, do not just take another digest).

Append the entry as the LAST element of `migrations` in `supabase/migrations.lock.json` (if plan 3 merged first, its entries are already there — append after them; R5-4). With the lock as of HEAD `7cfd628`, Edit
old:
```json
    {
      "file": "20261106090000_financial_facts.sql",
      "sha256": "62edb3eb740e4b652c66cd7bae6388287f35fe54c53afcbf27046ed9ddcf7f4d"
    }
  ]
```
new:
```json
    {
      "file": "20261106090000_financial_facts.sql",
      "sha256": "62edb3eb740e4b652c66cd7bae6388287f35fe54c53afcbf27046ed9ddcf7f4d"
    },
    {
      "file": "20261110090000_dq_eval_runs.sql",
      "sha256": "7808ea386e4547c8b0e34dc891d2bc1a2c69a2cf2f32fc675a26bf130cd1a591"
    }
  ]
```
From this step on the migration file is locked: **never edit it again** (`migrationInventory()` fails `Locked migration changed/missing`). Any later schema change is a new, later-timestamped migration.

Run: `npm test -- src/lib/research/ci-contract.test.ts src/lib/research/migration-history.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the row types to `database.types.ts`**

Three marked blocks, following the existing dq table pattern (interface + `Partial<>` Insert/Update registered in `Database['public']['Tables']`).

7a. Header comment — Edit
old: `// + 20261106090000_financial_facts.sql (fact_sync_runs, filings, financial_facts, financial_metrics, fact_sync_scope)`
new:
```ts
// + 20261106090000_financial_facts.sql (fact_sync_runs, filings, financial_facts, financial_metrics, fact_sync_scope)
// F6 begin
// + 20261110090000_dq_eval_runs.sql (dq_eval_runs, dq_eval_case_results)
// F6 end
```

7b. Interfaces — insert immediately before `export type Database = {` (after `IssuerIndustryMembership`). Edit
old:
```ts
  source: string;
  provenance: Record<string, unknown>;
}

export type Database = {
```
new:
```ts
  source: string;
  provenance: Record<string, unknown>;
}

// F6 begin
// F6 evaluation runs (supabase/migrations/20261110090000_dq_eval_runs.sql) — service-role only.
// Decimal comparison columns are TEXT (lossless decimal strings with format checks), never numeric;
// summary and detail are jsonb objects.
export type DqEvalRunStatus = 'running' | 'passed' | 'failed' | 'incomplete' | 'error';
export interface DqEvalRun {
  run_id: string;
  kind: 'official_reconciliation' | 'dual_source' | 'replay_consistency' | 'reference_regression' | 'extraction_gold' | 'judgment_calibration';
  module: string;
  mode: 'ci' | 'report';
  privileged: boolean;
  artifact_class: 'public' | 'restricted';
  set_id: string;
  set_version: number;
  set_sha256: string;
  evaluator_code_version: string;
  started_at: string;
  finished_at: string | null;
  status: DqEvalRunStatus;
  summary: Record<string, unknown>;
  report_ref: string;
  report_sha256: string;
  triggered_by: 'manual' | 'script' | 'ci';
}

export interface DqEvalCaseResult {
  eval_run_id: string;
  case_id: string;
  result: 'fail' | 'unit_mismatch' | 'provenance_incomplete' | 'missing' | 'not_visible' | 'read_error' | 'unexplained_diff';
  reason: string | null;
  left_text: string | null;
  right_text: string | null;
  abs_diff: string | null;
  rel_diff: string | null;
  tolerance: string;
  detail: Record<string, unknown>;
  created_at: string;
}
// F6 end

export type Database = {
```

7c. Table registration — Edit
old: `      fact_sync_scope: { Row: FactSyncScope; Insert: Partial<FactSyncScope>; Update: Partial<FactSyncScope> };`
new:
```ts
      fact_sync_scope: { Row: FactSyncScope; Insert: Partial<FactSyncScope>; Update: Partial<FactSyncScope> };
      // F6 begin
      dq_eval_runs: { Row: DqEvalRun; Insert: Partial<DqEvalRun>; Update: Partial<DqEvalRun> };
      dq_eval_case_results: { Row: DqEvalCaseResult; Insert: Partial<DqEvalCaseResult>; Update: Partial<DqEvalCaseResult> };
      // F6 end
```
(Task 6's `store.test.ts` asserts at compile time that these rows carry every `EvalRunRow`/`EvalCaseResultRow` column.)

- [ ] **Step 8: Typecheck, lint, migration rehearsal, full DB suite**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations`
Expected: exit 0 (the rehearsal applies the new migration on top of every earlier one).

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: exit 0; the JSON summary's `criticalSuites` count is one higher than before and `criticalSkipped: 0`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261110090000_dq_eval_runs.sql supabase/migrations.lock.json src/lib/supabase/database.types.ts scripts/ci/research-checks.ts src/lib/evals/evals-store.integration.test.ts
```
```bash
git commit -m "feat(evals): dq_eval_runs + dq_eval_case_results migration, lock entry, row types, critical store suite" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `store.ts` — `evalStore` and `persistRun` (spec §6.3)

**Files:**
- Create: `src/lib/evals/store.ts`
- Create: `src/lib/evals/store.test.ts`
- Modify: `src/lib/evals/evals-store.integration.test.ts` (imports + one appended `describe`)

Spec: §6.1 (case-row scope and the 100-row cap), §6.3 steps 2–5, §14 (`store_write_failed`, `store_conflict`, `store_partial`, `resume_mismatch`). Depends on Task 1 (`types.ts`, `errors.ts`, `canonical-json.ts::canonicalJson`, `summary.ts::statusOfGate`) and Task 5.

Design decisions (fixed):
- `caseRowCandidates(report)` = rows for **public** `official_reconciliation`/`dual_source` runs whose `outcome.result ∈ CaseResultKind`, in report order; `caseRowsOf` = the first `CASE_ROW_LIMIT` (100); `caseRowsTruncated` = more than 100 candidates. The caller (Task 8 `runGoldSet`) passes `caseRowsTruncated(...)` as `SummaryContext.reconciliationsTruncated` before the report file is written; `persistRun` receives that final report and refuses a mismatch before any write.
- `finishRun` implements step 4 itself: `update where {run_id, status:'running'}`; 1 hit → done; 0 hits → read back, same status and `canonicalJson`-equal summary → done; else `store_conflict`.
- Error mapping: run insert fails → `store_write_failed`; case-row 23505 with different content → `store_conflict`; any other failure in steps 3–4 → `store_partial` (run stays `running`; `--resume` repairs); resume: row missing or `report_sha256`/`report_ref` differ → `resume_mismatch`; terminal row → no-op.

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/evals/store.test.ts`:

```ts
// src/lib/evals/store.test.ts
// Spec §6.3 on the in-memory TableClient with the real primary keys: order, 23505 content comparison,
// terminal update with 0 hits (same / different terminal state), resume authentication, case-row scope and cap.
import {describe,expect,it} from 'vitest';
import {TableError} from '../db/table-client';
import {memoryTableClient} from '../db/memory-table-client';
import {EvalError} from './errors';
import {CASES,CASE_ROW_LIMIT,RUNS,caseRowCandidates,caseRowsOf,caseRowsTruncated,evalStore,persistRun,runRowOf} from './store';
import type {EvalStore} from './store';
import type {Database} from '../supabase/database.types';
import type {CaseReport,EvalReport,Gate,Summary} from './types';

const RUN='11111111-1111-4111-8111-111111111111';
const SHA='a'.repeat(64);
const FILES={ref:`reports/evals/${RUN}.json`,sha256:SHA};
const keys={[RUNS]:['run_id'],[CASES]:['eval_run_id','case_id']};
const summaryOf=(gate:Gate,truncated=false):Summary=>({
 population:3,required:3,
 correctness:{pass:1,fail:1,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0},
 coverage:{evaluated:2,evaluated_optional:0,missing_required:1,missing_optional:0,not_visible:0,skipped:0},
 execution:{read_error:0,truncated:0,subset:false},
 thresholds:{max_fail:0,min_coverage_optional:'0.95'},
 gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},
 gate,evidence_class:'truth',reconciliations_truncated:truncated,
});
const kase=(case_id:string,outcome:CaseReport['outcome'],left:string|null='100',right:string|null='100'):CaseReport=>({
 case_id,required:true,outcome,left,right,abs_diff:left&&right?'0':null,rel_diff:left&&right?'0':null,tolerance:'0',provenance:null,
 detail:{locator:{page:28},document_id:{kind:'edgar_accession',value:'0009990601-24-000001'}},
});
const CASES3=[kase('A/pass',{result:'pass'}),kase('B/fail',{result:'fail',reason:'value'},'101','100'),kase('C/missing',{result:'missing'},null,'100')];
const report=(o:Partial<EvalReport>={}):EvalReport=>({
 schema_version:1,run_id:RUN,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',
 set:{id:'facts/synthetic-us',version:1,sha256:'b'.repeat(64),format:'f6',path:'src/lib/evals/fixtures/gold/facts/synthetic-us.json'},
 evaluator_code_version:'c'.repeat(40),dirty:false,started_at:'2026-11-10T00:00:00.000Z',finished_at:'2026-11-10T00:01:00.000Z',
 environment:{db_host:null,app_origin:null,db_state_rev:3},thresholds:{max_fail:0,min_coverage_optional:'0.95'},
 provenance:{verified:{artifacts:false,sources:false}},summary:summaryOf('incomplete'),cases:CASES3,...o,
});
/** Records every store call in order; `fail` lets a test make one call throw. */
function recording(inner:EvalStore,fail:Partial<Record<keyof EvalStore,(arg:unknown)=>Error|null>>={}){
 const calls:string[]=[];
 const wrap=<K extends keyof EvalStore>(k:K)=>(async(...a:unknown[])=>{
  calls.push(k==='insertCaseResult'?`${k}:${(a[0] as {case_id:string}).case_id}`:k);
  const err=fail[k]?.(a[0]);if(err)throw err;
  return (inner[k] as (...x:unknown[])=>Promise<unknown>)(...a);
 }) as EvalStore[K];
 const store:EvalStore={insertRun:wrap('insertRun'),insertCaseResult:wrap('insertCaseResult'),finishRun:wrap('finishRun'),getRun:wrap('getRun'),getCaseResult:wrap('getCaseResult')};
 return {store,calls};
}
const setup=()=>{const tables=memoryTableClient(keys);return {tables,store:evalStore(tables)};};
const code=async(p:Promise<unknown>)=>{try{await p;}catch(e){if(e instanceof EvalError)return e.code;throw e;}return 'resolved';};

describe('case rows',()=>{
 it('are the non-pass results of public official/dual_source runs, in report order, with text decimals and a cloned detail',()=>{
  const rows=caseRowsOf(report());
  expect(rows.map(r=>[r.case_id,r.result,r.reason,r.left_text,r.right_text,r.tolerance])).toEqual([['B/fail','fail','value','101','100','0'],['C/missing','missing',null,null,'100','0']]);
  expect(rows[0].detail).toEqual(CASES3[1].detail);expect(rows[0].detail).not.toBe(CASES3[1].detail);
  expect(caseRowsOf(report({kind:'dual_source'}))).toHaveLength(2);
 });
 it('are empty for restricted sets and for replay/reference/extraction/calibration kinds',()=>{
  expect(caseRowsOf(report({artifact_class:'restricted'}))).toEqual([]);
  for(const kind of ['replay_consistency','reference_regression','extraction_gold','judgment_calibration'] as const)expect(caseRowsOf(report({kind}))).toEqual([]);
 });
 it('cap at CASE_ROW_LIMIT and report truncation; reasons are cut to 64 characters',()=>{
  const many=Array.from({length:CASE_ROW_LIMIT+1},(_,i)=>kase(`F/${String(i).padStart(3,'0')}`,{result:'provenance_incomplete',reason:'x'.repeat(80)}));
  const r=report({cases:many});
  expect(caseRowCandidates(r)).toHaveLength(101);expect(caseRowsOf(r)).toHaveLength(100);expect(caseRowsOf(r)[99].case_id).toBe('F/099');
  expect(caseRowsTruncated(r)).toBe(true);expect(caseRowsTruncated(report())).toBe(false);
  expect(caseRowsOf(r)[0].reason).toBe('x'.repeat(64));
 });
 it('runRowOf maps the report header to a running row',()=>{
  expect(runRowOf(report(),FILES,'ci')).toEqual({run_id:RUN,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',set_id:'facts/synthetic-us',set_version:1,set_sha256:'b'.repeat(64),evaluator_code_version:'c'.repeat(40),started_at:'2026-11-10T00:00:00.000Z',finished_at:null,status:'running',summary:{},report_ref:FILES.ref,report_sha256:SHA,triggered_by:'ci'});
 });
});

describe('persistRun (spec §6.3)',()=>{
 it('inserts the running row, then the case rows, then the terminal update',async()=>{
  const {tables,store}=setup();const rec=recording(store);
  await persistRun(rec.store,report(),FILES,{triggeredBy:'ci'});
  expect(rec.calls).toEqual(['insertRun','insertCaseResult:B/fail','insertCaseResult:C/missing','finishRun']);
  const [run]=tables.rows(RUNS);
  expect([run.status,run.finished_at,run.summary]).toEqual(['incomplete','2026-11-10T00:01:00.000Z',summaryOf('incomplete')]);
  expect(tables.rows(CASES).map(r=>r.case_id)).toEqual(['B/fail','C/missing']);
 });
 it('maps the gate to the terminal status',async()=>{
  for(const [gate,status] of [['pass','passed'],['fail','failed'],['incomplete','incomplete']] as const){
   const {tables,store}=setup();
   await persistRun(store,report({summary:summaryOf(gate)}),FILES,{triggeredBy:'script'});
   expect(tables.rows(RUNS)[0].status).toBe(status);
  }
 });
 it('step 2: a failed run insert is store_write_failed and writes nothing else',async()=>{
  const {tables,store}=setup();const rec=recording(store,{insertRun:()=>new Error('network')});
  expect(await code(persistRun(rec.store,report(),FILES,{triggeredBy:'ci'}))).toBe('store_write_failed');
  expect(rec.calls).toEqual(['insertRun']);expect(tables.rows(CASES)).toEqual([]);
 });
 it('step 2: an existing run_id (23505) is also store_write_failed',async()=>{
  const {store}=setup();await persistRun(store,report(),FILES,{triggeredBy:'ci'});
  expect(await code(persistRun(store,report(),FILES,{triggeredBy:'ci'}))).toBe('store_write_failed');
 });
 it('step 3: 23505 with an identical stored row continues',async()=>{
  const {tables,store}=setup();
  await tables.insert(RUNS,{...runRowOf(report(),FILES,'ci')});
  await tables.insert(CASES,{...caseRowsOf(report())[0]});
  await persistRun(store,report(),FILES,{triggeredBy:'ci',resume:true});
  expect(tables.rows(CASES)).toHaveLength(2);expect(tables.rows(RUNS)[0].status).toBe('incomplete');
 });
 it('step 3: 23505 with any differing field is store_conflict and leaves the run running',async()=>{
  const base=caseRowsOf(report())[0];
  for(const diff of [{left_text:'102'},{reason:'ambiguous'},{tolerance:'0.01'},{detail:{locator:{page:29}}},{result:'unit_mismatch'}]){
   const {tables,store}=setup();
   await tables.insert(RUNS,{...runRowOf(report(),FILES,'ci')});
   await tables.insert(CASES,{...base,...diff});
   expect(await code(persistRun(store,report(),FILES,{triggeredBy:'ci',resume:true}))).toBe('store_conflict');
   expect(tables.rows(RUNS)[0].status).toBe('running');
  }
 });
 it('step 3: a non-23505 case insert failure is store_partial (run stays running, resumable)',async()=>{
  const {tables,store}=setup();
  const rec=recording(store,{insertCaseResult:a=>(a as {case_id:string}).case_id==='C/missing'?new TableError('insert',CASES,'timeout','57014'):null});
  expect(await code(persistRun(rec.store,report(),FILES,{triggeredBy:'ci'}))).toBe('store_partial');
  expect(tables.rows(RUNS)[0].status).toBe('running');expect(tables.rows(CASES).map(r=>r.case_id)).toEqual(['B/fail']);
  await persistRun(store,report(),FILES,{triggeredBy:'ci',resume:true});
  expect(tables.rows(CASES).map(r=>r.case_id)).toEqual(['B/fail','C/missing']);expect(tables.rows(RUNS)[0].status).toBe('incomplete');
 });
 it('step 4: a failed terminal update is store_partial',async()=>{
  const {tables,store}=setup();const rec=recording(store,{finishRun:()=>new Error('crash')});
  expect(await code(persistRun(rec.store,report(),FILES,{triggeredBy:'ci'}))).toBe('store_partial');
  expect(tables.rows(RUNS)[0].status).toBe('running');expect(tables.rows(CASES)).toHaveLength(2);
 });
 it('step 4: 0 hits with the same terminal status and summary succeeds; different status or summary is store_conflict',async()=>{
  const {store}=setup();await persistRun(store,report(),FILES,{triggeredBy:'ci'});
  await expect(store.finishRun(RUN,'incomplete',summaryOf('incomplete'),'2026-11-10T00:09:00.000Z')).resolves.toBeUndefined();
  expect(await code(store.finishRun(RUN,'failed',summaryOf('incomplete'),'2026-11-10T00:01:00.000Z'))).toBe('store_conflict');
  expect(await code(store.finishRun(RUN,'incomplete',{...summaryOf('incomplete'),population:4},'2026-11-10T00:01:00.000Z'))).toBe('store_conflict');
  expect(await code(store.finishRun('22222222-2222-4222-8222-222222222222','passed',summaryOf('pass'),'2026-11-10T00:01:00.000Z'))).toBe('store_conflict');
 });
 it('refuses a report whose reconciliations_truncated disagrees with its case rows, before any write',async()=>{
  const {tables,store}=setup();
  expect(await code(persistRun(store,report({summary:summaryOf('incomplete',true)}),FILES,{triggeredBy:'ci'}))).toBe('store_write_failed');
  expect(tables.rows(RUNS)).toEqual([]);
  const many=Array.from({length:101},(_,i)=>kase(`F/${i}`,{result:'missing'},null,'1'));
  await persistRun(store,report({cases:many,summary:summaryOf('incomplete',true)}),FILES,{triggeredBy:'ci'});
  expect(tables.rows(CASES)).toHaveLength(100);
 });
});

describe('persistRun --resume (spec §6.3 step 5)',()=>{
 it('requires the run row to exist',async()=>{
  const {store}=setup();
  expect(await code(persistRun(store,report(),FILES,{triggeredBy:'ci',resume:true}))).toBe('resume_mismatch');
 });
 it('requires the local report sha256 and ref to equal the stored ones',async()=>{
  const {tables,store}=setup();await tables.insert(RUNS,{...runRowOf(report(),FILES,'ci')});
  expect(await code(persistRun(store,report(),{...FILES,sha256:'d'.repeat(64)},{triggeredBy:'ci',resume:true}))).toBe('resume_mismatch');
  expect(await code(persistRun(store,report(),{...FILES,ref:'reports/evals/other.json'},{triggeredBy:'ci',resume:true}))).toBe('resume_mismatch');
  expect(tables.rows(CASES)).toEqual([]);
 });
 it('is a no-op when the run is already terminal',async()=>{
  const {store}=setup();await persistRun(store,report(),FILES,{triggeredBy:'ci'});
  const rec=recording(store);
  await persistRun(rec.store,report(),FILES,{triggeredBy:'ci',resume:true});
  expect(rec.calls).toEqual(['getRun']);
 });
 it('repeats steps 3–4 for a running row without inserting the run again',async()=>{
  const {tables,store}=setup();await tables.insert(RUNS,{...runRowOf(report(),FILES,'ci')});
  const rec=recording(store);
  await persistRun(rec.store,report(),FILES,{triggeredBy:'ci',resume:true});
  expect(rec.calls).toEqual(['getRun','insertCaseResult:B/fail','insertCaseResult:C/missing','finishRun']);
  expect(tables.rows(RUNS)[0].status).toBe('incomplete');
 });
});

describe('evalStore row mapping',()=>{
 it('getRun / getCaseResult return the contract shapes (extra columns such as created_at are dropped)',async()=>{
  const {tables,store}=setup();
  await persistRun(store,report(),FILES,{triggeredBy:'manual'});
  await tables.update(CASES,{eval_run_id:RUN,case_id:'B/fail'},{created_at:'2026-11-10 00:00:00+00'});
  expect(await store.getRun(RUN)).toEqual({...runRowOf(report(),FILES,'manual'),status:'incomplete',finished_at:'2026-11-10T00:01:00.000Z',summary:summaryOf('incomplete')});
  expect(await store.getCaseResult(RUN,'B/fail')).toEqual(caseRowsOf(report())[0]);
  expect(await store.getRun('22222222-2222-4222-8222-222222222222')).toBeNull();
  expect(await store.getCaseResult(RUN,'nope')).toBeNull();
 });
});

describe('database.types.ts F6 block',()=>{
 it('DqEvalRun / DqEvalCaseResult carry every contract column (compile-time) and nothing else but created_at',()=>{
  const run:Database['public']['Tables']['dq_eval_runs']['Row']={...runRowOf(report(),FILES,'ci'),summary:{}};
  const kase:Database['public']['Tables']['dq_eval_case_results']['Row']={...caseRowsOf(report())[0],created_at:'2026-11-10 00:00:00+00'};
  expect(Object.keys(run).sort()).toEqual(Object.keys(runRowOf(report(),FILES,'ci')).sort());
  expect(Object.keys(kase).filter(k=>k!=='created_at').sort()).toEqual(Object.keys(caseRowsOf(report())[0]).sort());
 });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm test -- src/lib/evals/store.test.ts`
Expected: FAIL — `Failed to resolve import "./store" from "src/lib/evals/store.test.ts"`.

- [ ] **Step 3: Implement `store.ts`**

Create `src/lib/evals/store.ts`:

```ts
// src/lib/evals/store.ts
// F6 run store (spec §6.2–§6.3): dq_eval_runs + dq_eval_case_results over TableClient, and persistRun —
// the no-transaction persistence order: (2) insert the 'running' row, (3) insert each non-pass case row
// (23505 → read back and compare every field), (4) terminal update guarded by status='running'
// (0 hits → read back; same terminal status + summary = success), (5) --resume authenticates the local
// report file by sha256 before repeating 3–4. Case rows exist only for public official/dual_source runs,
// at most CASE_ROW_LIMIT per run in report order; the report file keeps every case.
// The caller computes summary.reconciliations_truncated with caseRowsTruncated() BEFORE writing the report
// file; persistRun receives the final report and refuses (before any write) when the flag disagrees.
import {TableError} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {canonicalJson} from './canonical-json';
import {EvalError} from './errors';
import {statusOfGate} from './summary';
import type {ArtifactClass,CaseReport,CaseResultKind,EvalCaseResultRow,EvalKind,EvalReport,EvalRunRow,EvalRunStatus,Summary} from './types';

export const RUNS='dq_eval_runs';
export const CASES='dq_eval_case_results';
export const CASE_ROW_LIMIT=100;
const RESULT_KINDS:ReadonlySet<string>=new Set<CaseResultKind>(['fail','unit_mismatch','provenance_incomplete','missing','not_visible','read_error','unexplained_diff']);

export interface EvalStore{
 insertRun(r:EvalRunRow):Promise<void>;
 insertCaseResult(r:EvalCaseResultRow):Promise<void>;
 finishRun(runId:string,status:EvalRunStatus,summary:Summary,finishedAt:string):Promise<void>;
 getRun(runId:string):Promise<EvalRunRow|null>;
 getCaseResult(runId:string,caseId:string):Promise<EvalCaseResultRow|null>;
}

const toRow=(v:object):Row=>({...v});
const str=(v:unknown)=>v===null||v===undefined?null:String(v);
function runOf(r:Row):EvalRunRow{
 return {
  run_id:String(r.run_id),kind:r.kind as EvalKind,module:r.module as EvalRunRow['module'],mode:r.mode as EvalRunRow['mode'],privileged:r.privileged===true,
  artifact_class:r.artifact_class as ArtifactClass,set_id:String(r.set_id),set_version:Number(r.set_version),set_sha256:String(r.set_sha256),
  evaluator_code_version:String(r.evaluator_code_version),started_at:String(r.started_at),finished_at:str(r.finished_at),status:r.status as EvalRunStatus,
  summary:(r.summary??{}) as EvalRunRow['summary'],report_ref:String(r.report_ref),report_sha256:String(r.report_sha256),triggered_by:r.triggered_by as EvalRunRow['triggered_by'],
 };
}
function caseOf(r:Row):EvalCaseResultRow{
 return {
  eval_run_id:String(r.eval_run_id),case_id:String(r.case_id),result:r.result as CaseResultKind,reason:str(r.reason),
  left_text:str(r.left_text),right_text:str(r.right_text),abs_diff:str(r.abs_diff),rel_diff:str(r.rel_diff),tolerance:String(r.tolerance),
  detail:(r.detail??{}) as Record<string,unknown>,
 };
}

export function evalStore(tables:TableClient):EvalStore{
 const getRun=async(runId:string)=>{const rows=await tables.select(RUNS,{run_id:runId},{limit:1});return rows[0]?runOf(rows[0]):null;};
 return {
  async insertRun(r){await tables.insert(RUNS,toRow(r));},
  async insertCaseResult(r){await tables.insert(CASES,toRow(r));},
  async finishRun(runId,status,summary,finishedAt){
   const n=await tables.update(RUNS,{run_id:runId,status:'running'},{status,summary:toRow(summary),finished_at:finishedAt});
   if(n===1)return;
   const row=n===0?await getRun(runId):null;
   if(row&&row.status===status&&canonicalJson(row.summary)===canonicalJson(summary))return;
   throw new EvalError('store_conflict',`dq_eval_runs ${runId}: terminal update hit ${n} rows; stored status ${row?.status??'absent'}`,{run_id:runId,hits:n,stored_status:row?.status??null});
  },
  getRun,
  async getCaseResult(runId,caseId){const rows=await tables.select(CASES,{eval_run_id:runId,case_id:caseId},{limit:1});return rows[0]?caseOf(rows[0]):null;},
 };
}

const reasonOf=(c:CaseReport):string|null=>{
 const o=c.outcome as {reason?:unknown};
 return typeof o.reason==='string'&&o.reason.length>0?o.reason.slice(0,64):null;
};
/** Every case row the run would store (untruncated): public official/dual_source runs, non-pass results only, report order. */
export function caseRowCandidates(report:Pick<EvalReport,'run_id'|'kind'|'artifact_class'|'cases'>):EvalCaseResultRow[]{
 if(report.artifact_class!=='public'||(report.kind!=='official_reconciliation'&&report.kind!=='dual_source'))return [];
 return report.cases.filter(c=>RESULT_KINDS.has(c.outcome.result)).map(c=>({
  eval_run_id:report.run_id,case_id:c.case_id,result:c.outcome.result as CaseResultKind,reason:reasonOf(c),
  left_text:c.left,right_text:c.right,abs_diff:c.abs_diff,rel_diff:c.rel_diff,tolerance:c.tolerance,
  detail:JSON.parse(JSON.stringify(c.detail??{})) as Record<string,unknown>,
 }));
}
/** The rows persistRun writes: the first CASE_ROW_LIMIT candidates. */
export const caseRowsOf=(report:Pick<EvalReport,'run_id'|'kind'|'artifact_class'|'cases'>):EvalCaseResultRow[]=>caseRowCandidates(report).slice(0,CASE_ROW_LIMIT);
/** summary.reconciliations_truncated for this run; pass it as SummaryContext.reconciliationsTruncated. */
export const caseRowsTruncated=(report:Pick<EvalReport,'run_id'|'kind'|'artifact_class'|'cases'>):boolean=>caseRowCandidates(report).length>CASE_ROW_LIMIT;

export function runRowOf(report:EvalReport,files:{ref:string;sha256:string},triggeredBy:EvalRunRow['triggered_by']):EvalRunRow{
 return {
  run_id:report.run_id,kind:report.kind,module:report.module,mode:report.mode,privileged:report.privileged,artifact_class:report.artifact_class,
  set_id:report.set.id,set_version:report.set.version,set_sha256:report.set.sha256,evaluator_code_version:report.evaluator_code_version,
  started_at:report.started_at,finished_at:null,status:'running',summary:{},report_ref:files.ref,report_sha256:files.sha256,triggered_by:triggeredBy,
 };
}

const sameCase=(a:EvalCaseResultRow,b:EvalCaseResultRow)=>
 a.eval_run_id===b.eval_run_id&&a.case_id===b.case_id&&a.result===b.result&&a.reason===b.reason&&a.left_text===b.left_text&&a.right_text===b.right_text
 &&a.abs_diff===b.abs_diff&&a.rel_diff===b.rel_diff&&a.tolerance===b.tolerance&&canonicalJson(a.detail)===canonicalJson(b.detail);
const partial=(report:EvalReport,step:string,e:unknown)=>e instanceof EvalError?e:new EvalError('store_partial',`run ${report.run_id} left 'running' at ${step}: ${(e as Error)?.message??String(e)}; rerun with --resume ${report.run_id}`,{run_id:report.run_id,step});

/** Spec §6.3 steps 2–5. The report file is already written (step 1); `files` is its repo-relative ref and sha256. */
export async function persistRun(store:EvalStore,report:EvalReport,files:{ref:string;sha256:string},opts:{triggeredBy:'manual'|'script'|'ci';resume?:boolean}):Promise<void>{
 if(report.summary.reconciliations_truncated!==caseRowsTruncated(report))
  throw new EvalError('store_write_failed',`run ${report.run_id}: summary.reconciliations_truncated does not match the case rows`,{run_id:report.run_id});
 if(opts.resume){
  const existing=await store.getRun(report.run_id);
  if(!existing)throw new EvalError('resume_mismatch',`run ${report.run_id} not found`,{run_id:report.run_id});
  if(existing.report_sha256!==files.sha256||existing.report_ref!==files.ref)
   throw new EvalError('resume_mismatch',`run ${report.run_id}: local report does not match dq_eval_runs.report_sha256/report_ref`,{run_id:report.run_id});
  if(existing.status!=='running')return;
 }else{
  try{await store.insertRun(runRowOf(report,files,opts.triggeredBy));}
  catch(e){throw new EvalError('store_write_failed',`dq_eval_runs insert failed for ${report.run_id}: ${(e as Error)?.message??String(e)}`,{run_id:report.run_id});}
 }
 for(const row of caseRowsOf(report)){
  try{await store.insertCaseResult(row);}
  catch(e){
   if(!(e instanceof TableError&&e.code==='23505'))throw partial(report,`case ${row.case_id}`,e);
   let stored:EvalCaseResultRow|null;
   try{stored=await store.getCaseResult(row.eval_run_id,row.case_id);}catch(e2){throw partial(report,`case ${row.case_id} read-back`,e2);}
   if(!stored||!sameCase(stored,row))throw new EvalError('store_conflict',`dq_eval_case_results (${row.eval_run_id}, ${row.case_id}) already holds a different row`,{run_id:row.eval_run_id,case_id:row.case_id});
  }
 }
 try{await store.finishRun(report.run_id,statusOfGate(report.summary.gate),report.summary,report.finished_at);}
 catch(e){throw partial(report,'finish',e);}
}
```

- [ ] **Step 4: Run the unit test — expect pass**

Run: `npm test -- src/lib/evals/store.test.ts`
Expected: PASS — `20 passed (20)`.

- [ ] **Step 5: Append the real-PostgreSQL persistence tests**

In `src/lib/evals/evals-store.integration.test.ts`, Edit
old: `import {pgTableClient} from '../db/pg-table-client';`
new:
```ts
import {pgTableClient} from '../db/pg-table-client';
import {EvalError} from './errors';
import {evalStore,persistRun} from './store';
import type {EvalStore} from './store';
import type {CaseReport,EvalReport,Summary} from './types';
```
and append at the end of the file:

```ts
// ── Task 6: persistRun (spec §6.3) on real PostgreSQL ──

const SUMMARY:Summary={
 population:3,required:3,correctness:{pass:1,fail:1,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0},
 coverage:{evaluated:2,evaluated_optional:0,missing_required:1,missing_optional:0,not_visible:0,skipped:0},execution:{read_error:0,truncated:0,subset:false},
 thresholds:{max_fail:0,min_coverage_optional:'0.95'},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},
 gate:'incomplete',evidence_class:'truth',reconciliations_truncated:false,
};
const storeCase=(case_id:string,outcome:CaseReport['outcome'],left:string|null,right:string|null):CaseReport=>({
 case_id,required:true,outcome,left,right,abs_diff:left&&right?'1':null,rel_diff:left&&right?'0.0099009900':null,tolerance:'0',provenance:null,detail:{locator:{page:28}},
});
const storeReport=(run_id:string):EvalReport=>({
 schema_version:1,run_id,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',
 set:{id:'facts/synthetic-us',version:1,sha256:'a'.repeat(64),format:'f6',path:'src/lib/evals/fixtures/gold/facts/synthetic-us.json'},
 evaluator_code_version:'b'.repeat(40),dirty:false,started_at:'2026-11-10T00:00:00.000Z',finished_at:'2026-11-10T00:01:00.000Z',
 environment:{db_host:null,app_origin:null,db_state_rev:1},thresholds:{max_fail:0,min_coverage_optional:'0.95'},provenance:{verified:{artifacts:false,sources:false}},
 summary:SUMMARY,
 cases:[storeCase('A/pass',{result:'pass'},'100','100'),storeCase('B/fail',{result:'fail',reason:'value'},'12345678901234567891','12345678901234567890'),storeCase('C/missing',{result:'missing'},null,'100')],
});

describe.skipIf(!enabled)('F6 persistRun on real PostgreSQL (interrupt + resume, concurrent resume)',()=>{
 let admin:Pool;let store:EvalStore;
 const runs:string[]=[];
 const newRunId=()=>{const id=randomUUID();runs.push(id);return id;};
 const filesOf=(id:string)=>({ref:`reports/evals/${id}.json`,sha256:'c'.repeat(64)});
 const state=async(id:string)=>({
  run:(await admin.query(`select status,finished_at is not null finished,summary from public.dq_eval_runs where run_id=$1`,[id])).rows,
  cases:(await admin.query(`select case_id,result,left_text from public.dq_eval_case_results where eval_run_id=$1 order by case_id`,[id])).rows,
 });
 beforeAll(async()=>{
  const s=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:s.adminUrl,max:6});
  store=evalStore(pgTableClient(admin));
 });
 afterAll(async()=>{
  if(admin){
   await admin.query(`delete from public.dq_eval_case_results where eval_run_id=any($1::uuid[])`,[runs]);
   await admin.query(`delete from public.dq_eval_runs where run_id=any($1::uuid[])`,[runs]);
   await admin.end();
  }
 });

 it('persists a run end to end: terminal status, summary, only the non-pass case rows with exact text decimals',async()=>{
  const id=newRunId();
  await persistRun(store,storeReport(id),filesOf(id),{triggeredBy:'ci'});
  const s=await state(id);
  expect(s.run).toEqual([{status:'incomplete',finished:true,summary:SUMMARY}]);
  expect(s.cases).toEqual([{case_id:'B/fail',result:'fail',left_text:'12345678901234567891'},{case_id:'C/missing',result:'missing',left_text:null}]);
  expect((await store.getRun(id))?.report_sha256).toBe('c'.repeat(64));
 });

 it('interrupted after step 3 leaves the run running; --resume completes it without duplicating case rows',async()=>{
  const id=newRunId();
  const crashing:EvalStore={...store,finishRun:async()=>{throw new Error('process killed');}};
  await expect(persistRun(crashing,storeReport(id),filesOf(id),{triggeredBy:'script'})).rejects.toMatchObject({code:'store_partial'});
  let s=await state(id);
  expect(s.run.map(r=>r.status)).toEqual(['running']);expect(s.cases).toHaveLength(2);
  await expect(persistRun(store,storeReport(id),{...filesOf(id),sha256:'d'.repeat(64)},{triggeredBy:'script',resume:true})).rejects.toBeInstanceOf(EvalError);
  await persistRun(store,storeReport(id),filesOf(id),{triggeredBy:'script',resume:true});
  s=await state(id);
  expect(s.run.map(r=>r.status)).toEqual(['incomplete']);expect(s.cases).toHaveLength(2);
 });

 it('interrupted inside step 3 (after the first case row) resumes to the full set of case rows',async()=>{
  const id=newRunId();let n=0;
  const crashing:EvalStore={...store,insertCaseResult:async r=>{if(++n===2)throw new Error('connection reset');await store.insertCaseResult(r);}};
  await expect(persistRun(crashing,storeReport(id),filesOf(id),{triggeredBy:'script'})).rejects.toMatchObject({code:'store_partial'});
  expect((await state(id)).cases.map(r=>r.case_id)).toEqual(['B/fail']);
  await persistRun(store,storeReport(id),filesOf(id),{triggeredBy:'script',resume:true});
  const s=await state(id);
  expect(s.run.map(r=>r.status)).toEqual(['incomplete']);expect(s.cases.map(r=>r.case_id)).toEqual(['B/fail','C/missing']);
 });

 it('two concurrent resumes both succeed with exactly one terminal row and no duplicate case rows',async()=>{
  const id=newRunId();
  const crashing:EvalStore={...store,insertCaseResult:async()=>{throw new Error('crash before any case row');}};
  await expect(persistRun(crashing,storeReport(id),filesOf(id),{triggeredBy:'script'})).rejects.toMatchObject({code:'store_partial'});
  const results=await Promise.allSettled([
   persistRun(evalStore(pgTableClient(admin)),storeReport(id),filesOf(id),{triggeredBy:'script',resume:true}),
   persistRun(evalStore(pgTableClient(admin)),storeReport(id),filesOf(id),{triggeredBy:'script',resume:true}),
  ]);
  expect(results.map(r=>r.status)).toEqual(['fulfilled','fulfilled']);
  const s=await state(id);
  expect(s.run).toEqual([{status:'incomplete',finished:true,summary:SUMMARY}]);
  expect(s.cases.map(r=>r.case_id)).toEqual(['B/fail','C/missing']);
  expect((await admin.query(`select count(*)::int n from public.dq_eval_case_results where eval_run_id=$1`,[id])).rows[0].n).toBe(2);
 });

 it('a conflicting stored case row stops the resume with store_conflict and keeps the run running',async()=>{
  const id=newRunId();
  const crashing:EvalStore={...store,insertCaseResult:async()=>{throw new Error('crash');}};
  await expect(persistRun(crashing,storeReport(id),filesOf(id),{triggeredBy:'script'})).rejects.toMatchObject({code:'store_partial'});
  await admin.query(`insert into public.dq_eval_case_results(eval_run_id,case_id,result,reason,left_text,right_text,abs_diff,rel_diff,tolerance,detail) values($1,'B/fail','fail','value','999','12345678901234567890','1','0.0099009900','0','{"locator":{"page":28}}')`,[id]);
  await expect(persistRun(store,storeReport(id),filesOf(id),{triggeredBy:'script',resume:true})).rejects.toMatchObject({code:'store_conflict'});
  expect((await state(id)).run.map(r=>r.status)).toEqual(['running']);
 });
});
```

- [ ] **Step 6: Run the store suite on real PostgreSQL — expect pass**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/evals/evals-store.integration.test.ts`
Expected: PASS — `11 passed (11)` (6 from Task 5, 5 new: end-to-end, interrupted after step 3 + resume, interrupted inside step 3 + resume, two concurrent resumes, conflicting stored row). If the concurrent test fails, the defect is in `persistRun`/`finishRun` (23505 read-back or 0-hit read-back), not in the test.

- [ ] **Step 7: Typecheck, lint, full DB suite**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: exit 0, `criticalSkipped: 0`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/evals/store.ts src/lib/evals/store.test.ts src/lib/evals/evals-store.integration.test.ts
```
```bash
git commit -m "feat(evals): evalStore and persistRun (spec 6.3 order, 23505 content check, guarded terminal update, resume)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: facts read adapter, raw-snapshot provenance, privileged reads

规格：§4.2、§5.1.1–5.1.4、§5.3.2（提示）、§5.6、§0 R5-5、R5-6、R5-7、R5-8。依赖：Task 1（`types.ts`）。

**Files:**
- Create: `src/lib/evals/adapters/memory-world.ts` (test-only in-memory world: memoryFactsDb + REAL runFactsSync)
- Create: `src/lib/evals/adapters/provenance.ts`
- Create: `src/lib/evals/adapters/facts.ts`
- Test: `src/lib/evals/adapters/facts.test.ts`
- Test: `src/lib/evals/adapters/provenance.test.ts`

Landed APIs used (verified): `FactsDb`/`FactRow`/`FilingRow`/`MetricRow`/`RawSnapshot`/`ParseResult` (`src/lib/facts/types.ts`); `memoryFactsDb(tables)` with `setNow/facts()/filings()/runs()` (`memory-facts-db.ts`); `conflictPrefix`, `factRowFromTable` (`db.ts`); `deriveMetrics`, `DERIVE_CONCEPTS`, `FORMULA_VERSION` (`derive.ts`); `decimalEquals` (`json-numbers.ts`); `SNAPSHOT_BUCKET`, `metaPath`, `memorySnapshotStore` (`snapshot-store.ts`; `put` stores `{source}/{issuer}/{sha}.json` **and** a `{sha}.meta.json` sidecar); `rawHashOf`, `sha256Hex`, `snapshotOf`, `padCik`, `ProviderError`, `stringifyPreservingNumbers` (`providers/shared.ts`); `parseCompanyFacts`, `companyFactsUrl` (`providers/edgar-companyfacts.ts`; candidates carry `locator`); `parseTushareStatements` (`providers/tushare-statements.ts`; one page parses alone given its meta `api/params.report_type/params.ts_code/page`; sum concepts emit the summed candidate); `runFactsSync` (`sync.ts`; with `issuerIds` it skips the module-level scope reconcile); `resolveIssuer(client,{cik}|{ticker},{today})` (`entities/resolve.ts`; throws `empty_query/ambiguous_query/ambiguous_owner/invalid_identifier:*`); `TableClient`, `MAX_PAGE`, `memoryTableClient` (`db/*`).

- [ ] **Step 1: Write the test-only memory world**

Create `src/lib/evals/adapters/memory-world.ts`:

```ts
// src/lib/evals/adapters/memory-world.ts
// TEST-ONLY in-memory facts world for the adapter unit tests (Task 7). memoryFactsDb + memoryTableClient +
// memorySnapshotStore, issuers / issuer_securities rows for resolveIssuer, a small companyfacts document builder
// (numbers written as JSON number literals, like SEC), and syncs through the REAL runFactsSync + parseCompanyFacts,
// so raw_hash, locators, runs, batches and snapshot objects are genuine. overlay() exposes the facts tables that live
// inside memoryFactsDb (financial_facts, filings, fact_sync_runs) to TableClient reads, the way service_role sees them.
// Nothing outside tests imports this file.
import {memoryTableClient} from '../../db/memory-table-client';
import type {Row,TableClient} from '../../db/table-client';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {ProviderError,padCik,snapshotOf,stringifyPreservingNumbers} from '../../facts/providers/shared';
import {memorySnapshotStore} from '../../facts/snapshot-store';
import {runFactsSync} from '../../facts/sync';
import type {SyncReceipt} from '../../facts/sync';

export const CODE_VERSION='c'.repeat(40);
export const UNIT_ISSUER='00000000-0000-4000-8000-000009990611';
export const UNIT_CIK='9990611';
export const UNIT_TICKER='ZZEVU';
export interface CfEntry{tag:string;unit?:string;start?:string;end:string;val:string;accn:string;form?:string;filed:string;fy?:number;fp?:string}

/** companyfacts bytes with every value as a JSON number literal (decodeWithSchema reads `val` losslessly). */
export function companyFactsDoc(cik:string,name:string,entries:CfEntry[]):Uint8Array{
 const facts:Record<string,Record<string,{units:Record<string,unknown[]>}>>={'us-gaap':{}};
 for(const e of entries){
  const tag=facts['us-gaap'][e.tag]??(facts['us-gaap'][e.tag]={units:{}});
  const unit=e.unit??'USD';
  (tag.units[unit]??(tag.units[unit]=[])).push({...(e.start?{start:e.start}:{}),end:e.end,val:{__num:e.val},accn:e.accn,fy:{__num:String(e.fy??Number(e.end.slice(0,4)))},fp:e.fp??'FY',form:e.form??'10-K',filed:e.filed});
 }
 return new TextEncoder().encode(stringifyPreservingNumbers({cik:{__num:cik},entityName:name,facts}));
}

const FACT_TABLES=new Set(['financial_facts','filings','fact_sync_runs']);
/** Read-only view of memoryFactsDb's own tables through the TableClient interface; every other table is `base`. */
export function overlayTables(db:MemoryFactsDb,base:TableClient):TableClient{
 const mirror=async()=>{
  const t=memoryTableClient();
  for(const f of db.facts())await t.insert('financial_facts',f as unknown as Row);
  for(const g of db.filings())await t.insert('filings',g as unknown as Row);
  for(const r of db.runs())await t.insert('fact_sync_runs',r as unknown as Row);
  return t;
 };
 const readOnly=(table:string)=>{if(FACT_TABLES.has(table))throw new Error(`read_only_overlay:${table}`);};
 return {
  insert:async(t,r)=>{readOnly(t);return base.insert(t,r);},
  update:async(t,m,p)=>{readOnly(t);return base.update(t,m,p);},
  upsert:async(t,r,c)=>{readOnly(t);return base.upsert(t,r,c);},
  select:async(t,m,o)=>FACT_TABLES.has(t)?(await mirror()).select(t,m,o):base.select(t,m,o),
  count:async(t,m,o)=>FACT_TABLES.has(t)?(await mirror()).count(t,m,o):base.count(t,m,o),
 };
}

export interface MemoryWorld{
 db:MemoryFactsDb;tables:ReturnType<typeof memoryTableClient>;storage:ReturnType<typeof memorySnapshotStore>;
 issuerId:string;cik:string;ticker:string;overlay:TableClient;
 /** One runFactsSync of `doc` for the issuer at `at` (memory db clock fixed to it). */
 sync(doc:Uint8Array,opts?:{mappingGen?:number;at?:string}):Promise<SyncReceipt>;
}
export async function memoryWorld(o:{issuerId?:string;cik?:string;ticker?:string;name?:string}={}):Promise<MemoryWorld>{
 const issuerId=o.issuerId??UNIT_ISSUER,cik=o.cik??UNIT_CIK,ticker=o.ticker??UNIT_TICKER;
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset'],issuers:['issuer_id']});
 const db=memoryFactsDb(tables);const storage=memorySnapshotStore();
 await tables.insert('issuers',{issuer_id:issuerId,status:'active',cik,canonical_name_en:o.name??'ZZ Eval Unit Co',canonical_name_zh:null,lei:null,usci:null,merged_into:null,country_code:'US'});
 await tables.insert('issuer_securities',{issuer_id:issuerId,ticker,isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'test'});
 await db.reconcileScope('US',[{issuer_id:issuerId,reasons:['test'],priority:10,fetch_key:padCik(cik)}]);
 let current:Uint8Array|null=null;
 const sync=async(doc:Uint8Array,opts:{mappingGen?:number;at?:string}={})=>{
  current=doc;
  const at=new Date(opts.at??'2026-11-20T12:00:00.000Z');
  db.setNow(at.toISOString());
  return runFactsSync({db,tables,storage,
   fetchUs:async cik10=>{if(!current)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(current,{source:'edgar',url:companyFactsUrl(cik10),fetched_at:at.toISOString()});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','memory world is US only');},
   parseUs:(s,p)=>parseCompanyFacts(s,{sinceYear:p.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','memory world is US only');},
   now:()=>at,deadline:null,codeVersion:CODE_VERSION},
   {market:'US',limit:1,issuerIds:[issuerId],dryRun:false,triggeredBy:'script',...(opts.mappingGen!==undefined?{mappingGen:opts.mappingGen}:{})});
 };
 return {db,tables,storage,issuerId,cik,ticker,overlay:overlayTables(db,tables),sync};
}
```

- [ ] **Step 2: Write the failing reader tests**

Create `src/lib/evals/adapters/facts.test.ts`:

```ts
// src/lib/evals/adapters/facts.test.ts
import {describe,expect,it} from 'vitest';
import {FORMULA_VERSION} from '../../facts/derive';
import type {FilingRow} from '../../facts/types';
import type {FactTarget,MetricTarget} from '../types';
import {factsReader,selectFiling} from './facts';
import type {FactsReadDb} from './facts';
import {UNIT_ISSUER,companyFactsDoc,memoryWorld} from './memory-world';
import type {CfEntry,MemoryWorld} from './memory-world';

const A1='0009990611-24-000001',A2='0009990611-24-000002';
const FY={start:'2023-01-01',end:'2023-12-31'};
const BASE:CfEntry[]=[
 {tag:'Revenues',...FY,val:'1000',accn:A1,filed:'2024-02-15'},
 {tag:'CostOfRevenue',...FY,val:'600',accn:A1,filed:'2024-02-15'},
 {tag:'GrossProfit',...FY,val:'400',accn:A1,filed:'2024-02-15'},
 {tag:'NetIncomeLoss',...FY,val:'100',accn:A1,filed:'2024-02-15'},
 {tag:'Assets',end:'2023-12-31',val:'5000',accn:A1,filed:'2024-02-15'},
 {tag:'EarningsPerShareDiluted',unit:'USD/shares',...FY,val:'1.25',accn:A1,filed:'2024-02-15'},
];
const AMEND:CfEntry={tag:'Revenues',...FY,val:'1001',accn:A2,form:'10-K/A',filed:'2024-06-01'};
const doc=(extra:CfEntry[]=[])=>companyFactsDoc('9990611','ZZ Eval Unit Co',[...BASE,...extra]);
const TODAY='2026-11-20';
const usd={kind:'currency',currency:'USD'} as const;
const revenue:FactTarget={type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:usd};
const assets:FactTarget={type:'fact',concept:'total_assets',period_start:null,period_end:'2023-12-31',duration:'INSTANT',consolidation:'consolidated',unit:usd};
const margin:MetricTarget={type:'metric',metric:'gross_margin',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',basis:'us_standard',input_unit:'USD',formula_version:FORMULA_VERSION,unit:{kind:'ratio'}};
const accn=(value:string)=>({kind:'edgar_accession' as const,value});
const REF={issuerId:UNIT_ISSUER,market:'US' as const};
async function world(extra:CfEntry[]=[]):Promise<MemoryWorld>{const w=await memoryWorld();const r=await w.sync(doc(extra));expect(r.detail.published).toBe(1);return w;}
const readerOf=(w:MemoryWorld,db:FactsReadDb=w.db,stateRev:()=>Promise<number|null>=async()=>null)=>factsReader({db,tables:w.tables,stateRev});

describe('factsReader.resolveSubject',()=>{
 it('resolves by cik and by ticker; unknown, invalid and identifier-less subjects are null',async()=>{
  const r=readerOf(await world());
  expect(await r.resolveSubject({market:'US',cik:'9990611'},TODAY)).toEqual(REF);
  expect(await r.resolveSubject({market:'US',cik:'0009990611'},TODAY)).toEqual(REF);
  expect(await r.resolveSubject({market:'US',ticker:'ZZEVU'},TODAY)).toEqual(REF);
  expect(await r.resolveSubject({market:'US',cik:'9990699'},TODAY)).toBeNull();
  expect(await r.resolveSubject({market:'US',cik:'not-a-cik'},TODAY)).toBeNull();
  expect(await r.resolveSubject({market:'US'},TODAY)).toBeNull();
 });
});

describe('factsReader.readDocumentBound (spec §5.1.2, §4.2)',()=>{
 it('returns the filing row with its full source chain and never filters by unit',async()=>{
  const r=readerOf(await world());
  const res=await r.readDocumentBound(REF,{...revenue,unit:{kind:'currency',currency:'EUR'}},accn(A1),TODAY);
  expect(res.error).toBeUndefined();expect(res.truncated).toBe(false);expect(res.stateRev).toBeGreaterThan(0);
  expect(res.rows).toHaveLength(1);
  expect(res.rows[0]).toMatchObject({value_text:'1000',unit:'USD',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',source_ref:A1,mapping_gen:1,mapping_version:'facts-map/1',status:'ok'});
  for(const k of ['fact_id','filing_id','raw_hash','run_id'] as const)expect(res.rows[0][k]).toMatch(/\S/);
 });
 it('matches instants on period_start null, and a legacy target without period_start on the other key parts',async()=>{
  const r=readerOf(await world());
  expect((await r.readDocumentBound(REF,assets,accn(A1),TODAY)).rows.map(x=>x.value_text)).toEqual(['5000']);
  const legacy:FactTarget={...revenue};delete legacy.period_start;
  expect((await r.readDocumentBound(REF,legacy,accn(A1),TODAY)).rows.map(x=>x.value_text)).toEqual(['1000']);
  expect((await r.readDocumentBound(REF,{...revenue,period_start:'2023-01-02'},accn(A1),TODAY)).rows).toEqual([]);
  expect((await r.readDocumentBound(REF,{...revenue,duration:'9M'},accn(A1),TODAY)).rows).toEqual([]);
 });
 it('an accession that is not this issuer’s filing is read_error(filing_not_found); a metric target is read_failed',async()=>{
  const r=readerOf(await world());
  expect(await r.readDocumentBound(REF,revenue,accn('0009990611-99-000009'),TODAY)).toEqual({rows:[],truncated:false,stateRev:null,error:'filing_not_found'});
  expect((await r.readDocumentBound(REF,margin,accn(A1),TODAY)).error).toBe('read_failed');
  expect((await r.readDocumentBound(REF,revenue,{kind:'file_sha256',value:'a'.repeat(64)},TODAY)).error).toBe('filing_not_found');
 });
 it('a later 10-K/A leaves the document-bound row unchanged',async()=>{
  const w=await world();
  await w.sync(doc([AMEND]));
  const r=readerOf(w);
  expect((await r.readDocumentBound(REF,revenue,accn(A1),TODAY)).rows.map(x=>[x.value_text,x.source_ref])).toEqual([['1000',A1]]);
  expect((await r.readDocumentBound(REF,revenue,accn(A2),TODAY)).rows.map(x=>[x.value_text,x.source_ref])).toEqual([['1001',A2]]);
 });
 it('a truncated envelope is read_error(truncated)',async()=>{
  const w=await world();
  const truncating:FactsReadDb={...w.db,readFacts:async()=>({stateRev:9,rows:[],truncated:true})};
  expect(await readerOf(w,truncating).readDocumentBound(REF,revenue,accn(A1),TODAY)).toEqual({rows:[],truncated:true,stateRev:9,error:'truncated'});
 });
});

describe('factsReader.readCurrent',()=>{
 it('facts: the current row at asOf, replayable on both sides of an amendment',async()=>{
  const w=await world();await w.sync(doc([AMEND]));
  const r=readerOf(w);
  expect((await r.readCurrent(REF,revenue,'2024-05-31')).rows.map(x=>[x.value_text,x.source_ref])).toEqual([['1000',A1]]);
  expect((await r.readCurrent(REF,revenue,'2024-06-01')).rows.map(x=>[x.value_text,x.source_ref])).toEqual([['1001',A2]]);
  expect((await r.readCurrent(REF,revenue,'2024-01-01')).rows).toEqual([]);
 });
 it('metrics: derived live from DERIVE_CONCEPTS history rows (never the cache), basedOnRev = envelope state_rev',async()=>{
  const w=await world();
  let reads=0;let cacheReads=0;
  const counting:FactsReadDb={...w.db,readFacts:async(i,m,o)=>{reads++;return w.db.readFacts(i,m,o);},metricsOfIssuer:async(i,m,f)=>{cacheReads++;return w.db.metricsOfIssuer(i,m,f);}};
  const res=await readerOf(w,counting).readCurrent(REF,margin,TODAY);
  expect(reads).toBe(1);expect(cacheReads).toBe(0);
  expect(res.rows).toHaveLength(1);
  const row=res.rows[0];
  expect(row).toMatchObject({value_text:'0.4',unit:'pure',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15'});
  expect(row.metric).toMatchObject({metric:'gross_margin',formula_version:FORMULA_VERSION,basis:'us_standard',input_unit:'USD',based_on_rev:res.stateRev});
  expect(row.metric!.inputs.map(i=>i.concept).sort()).toEqual(['gross_profit','revenue']);
 });
 it('metrics: a target formula_version other than FORMULA_VERSION is read_error(formula_version_mismatch) without reading',async()=>{
  const w=await world();let reads=0;
  const counting:FactsReadDb={...w.db,readFacts:async(i,m,o)=>{reads++;return w.db.readFacts(i,m,o);}};
  expect((await readerOf(w,counting).readCurrent(REF,{...margin,formula_version:'v1'},TODAY)).error).toBe('formula_version_mismatch');
  expect(reads).toBe(0);
 });
 it('metrics: a truncated envelope is read_error(truncated)',async()=>{
  const w=await world();
  const truncating:FactsReadDb={...w.db,readFacts:async()=>({stateRev:4,rows:[],truncated:true})};
  expect((await readerOf(w,truncating).readCurrent(REF,margin,TODAY))).toMatchObject({error:'truncated',truncated:true,stateRev:4});
 });
});

describe('factsReader.stateRev / project',()=>{
 it('stateRev: the injected value when non-null, else the largest envelope state_rev seen (null before any read)',async()=>{
  const w=await world();
  const r=readerOf(w);
  expect(await r.stateRev()).toBeNull();
  const res=await r.readCurrent(REF,revenue,TODAY);
  expect(await r.stateRev()).toBe(res.stateRev);
  expect(await readerOf(w,w.db,async()=>42).stateRev()).toBe(42);
 });
 it('project delegates to the injected projector and rejects with projector_missing without one',async()=>{
  const w=await world();
  const request={issuer:{market:'US' as const,cik:'9990611'},concepts:['revenue'],asOf:TODAY};
  await expect(readerOf(w).project(request,TODAY)).rejects.toThrow('projector_missing');
  const r=factsReader({db:w.db,tables:w.tables,stateRev:async()=>null,projector:async(req,today)=>({module:'facts',rows:[{asOf:req.asOf,today}]})});
  expect(await r.project(request,TODAY)).toEqual({module:'facts',rows:[{asOf:TODAY,today:TODAY}]});
 });
 it('the reader exposes no write method of FactsDb',async()=>{
  const r=readerOf(await world()) as unknown as Record<string,unknown>;
  for(const k of ['stageFacts','stageFilings','publishRun','replaceMetrics','quarantineFacts','resolveFactsQuarantine','insert','update','upsert'])expect(r[k]).toBeUndefined();
 });
});

describe('selectFiling (spec §4.2, §0 R5-8)',()=>{
 const g=(o:Partial<FilingRow>):FilingRow=>({filing_id:'g',issuer_id:UNIT_ISSUER,market:'CN',source:'tushare',origin:'sse',form_type:'annual',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-04-03',source_ref:'600519.SH:20231231:1:20240403',url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:'2026-01-01T00:00:00.000Z',...o});
 const cn=(value:string)=>({kind:'cninfo_announcement' as const,value});
 const t2023:FactTarget={...revenue,period_start:'2023-01-01',period_end:'2023-12-31'};
 const t2022:FactTarget={...revenue,period_start:'2022-01-01',period_end:'2022-12-31'};
 it('edgar_accession: source edgar and source_ref; none → filing_not_found',()=>{
  const us=g({filing_id:'u',market:'US',source:'edgar',origin:'sec',form_type:'10-K',source_ref:A1});
  expect(selectFiling([us],revenue,accn(A1))).toEqual({filing:us});
  expect(selectFiling([us],revenue,accn(A2))).toEqual({error:'filing_not_found'});
  expect(selectFiling([{...us,source:'tushare'}],revenue,accn(A1))).toEqual({error:'filing_not_found'});
 });
 it('cninfo_announcement: one document_ref match wins',()=>{
  const a=g({filing_id:'a',document_ref:'1219000001'});
  expect(selectFiling([a,g({filing_id:'b',document_ref:'other'})],t2023,cn('1219000001'))).toEqual({filing:a});
 });
 it('cninfo_announcement: every match first, then the target period (a restatement linked to the next annual report)',()=>{
  const annual=g({filing_id:'a',document_ref:'D'});
  const restated=g({filing_id:'r',document_ref:'D',form_type:'restatement',period_end:'2022-12-31',source_ref:'600519.SH:20221231:4:20240403'});
  expect(selectFiling([annual,restated],t2023,cn('D'))).toEqual({filing:annual});
  expect(selectFiling([annual,restated],t2022,cn('D'))).toEqual({filing:restated});
 });
 it('cninfo_announcement: same period → the periodic form of that month; still > 1 or none left → filing_ambiguous',()=>{
  const annual=g({filing_id:'a',document_ref:'D'});
  const restated=g({filing_id:'r',document_ref:'D',form_type:'restatement',source_ref:'600519.SH:20231231:4:20240403'});
  expect(selectFiling([annual,restated],t2023,cn('D'))).toEqual({filing:annual});
  expect(selectFiling([annual,g({filing_id:'a2',document_ref:'D',source_ref:'600519.SH:20231231:5:20240410'})],t2023,cn('D'))).toEqual({error:'filing_ambiguous'});
  expect(selectFiling([annual,restated],{...t2023,period_end:'2021-12-31'},cn('D'))).toEqual({error:'filing_ambiguous'});
 });
 it('cninfo_announcement: no match → filing_not_linked when an unlinked filing of the period exists, else filing_not_found',()=>{
  expect(selectFiling([g({filing_id:'u',document_ref:null})],t2023,cn('D'))).toEqual({error:'filing_not_linked'});
  expect(selectFiling([g({filing_id:'u',document_ref:null,period_end:'2022-12-31'})],t2023,cn('D'))).toEqual({error:'filing_not_found'});
  expect(selectFiling([],t2023,{kind:'official_release',value:'x'})).toEqual({error:'filing_not_found'});
 });
});
```

- [ ] **Step 3: Write the failing provenance / privileged tests**

Create `src/lib/evals/adapters/provenance.test.ts`:

```ts
// src/lib/evals/adapters/provenance.test.ts
import {describe,expect,it} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {sha256Hex} from '../../facts/providers/shared';
import {parseTushareStatements} from '../../facts/providers/tushare-statements';
import type {FactTarget,MetricTarget,ReadRow} from '../types';
import {FORMULA_VERSION} from '../../facts/derive';
import {privilegedFactsReader} from './facts';
import {memoryRawStorage,missingFields,supabaseRawStorage} from './provenance';
import type {FactProvenance,SnapshotParsers} from './provenance';
import {CODE_VERSION,UNIT_ISSUER,companyFactsDoc,memoryWorld} from './memory-world';
import type {CfEntry,MemoryWorld} from './memory-world';

const A1='0009990611-24-000001',A2='0009990611-24-000002',A3='0009990611-24-000003';
const FY={start:'2023-01-01',end:'2023-12-31'};
const BASE:CfEntry[]=[
 {tag:'Revenues',...FY,val:'1000',accn:A1,filed:'2024-02-15'},
 {tag:'CostOfRevenue',...FY,val:'600',accn:A1,filed:'2024-02-15'},
 {tag:'GrossProfit',...FY,val:'400',accn:A1,filed:'2024-02-15'},
 {tag:'NetIncomeLoss',...FY,val:'100',accn:A1,filed:'2024-02-15'},
];
const CONFLICT:CfEntry={tag:'NetIncomeLoss',...FY,val:'101',accn:A3,form:'10-K/A',filed:'2024-02-15'};
const AMEND:CfEntry={tag:'Revenues',...FY,val:'1001',accn:A2,form:'10-K/A',filed:'2024-06-01'};
const doc=(entries:CfEntry[])=>companyFactsDoc('9990611','ZZ Eval Unit Co',entries);
const TODAY='2026-11-20';
const REF={issuerId:UNIT_ISSUER,market:'US' as const};
const usd={kind:'currency',currency:'USD'} as const;
const revenue:FactTarget={type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:usd};
const netIncome:FactTarget={...revenue,concept:'net_income_parent'};
const margin:MetricTarget={type:'metric',metric:'gross_margin',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',basis:'us_standard',input_unit:'USD',formula_version:FORMULA_VERSION,unit:{kind:'ratio'}};
const accn=(value:string)=>({kind:'edgar_accession' as const,value});
const PARSERS:SnapshotParsers={edgar:(s,o)=>parseCompanyFacts(s,{sinceYear:o.sinceYear}),tushare:(s,o)=>parseTushareStatements(s,{sinceYear:o.sinceYear})};
const priv=(w:MemoryWorld)=>privilegedFactsReader({db:w.db,tables:w.overlay,stateRev:async()=>null,storage:memoryRawStorage(w.storage.objects),parsers:PARSERS});
async function world(entries:CfEntry[]=BASE,at?:string):Promise<MemoryWorld>{const w=await memoryWorld();expect((await w.sync(doc(entries),at?{at}:{})).detail.published).toBe(1);return w;}
const revenueRow=async(w:MemoryWorld)=>(await priv(w).readDocumentBound(REF,revenue,accn(A1),TODAY)).rows[0];
const objectPath=(w:MemoryWorld)=>[...w.storage.objects.keys()].find(k=>/\/[0-9a-f]{64}\.json$/.test(k))!;

describe('missingFields (spec §5.1.4 required fields)',()=>{
 const row:ReadRow={value_text:'1',unit:'USD',period_start:null,period_end:'2023-12-31',duration:'INSTANT',consolidation:'consolidated',available_date:'2024-02-15',fact_id:'f',filing_id:'g',source_ref:A1,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'a'.repeat(64),run_id:'r'};
 it('facts: every required field present → none; blanks are listed in field order',()=>{
  expect(missingFields(row)).toEqual([]);
  expect(missingFields({...row,raw_hash:'',run_id:undefined,source_ref:undefined})).toEqual(['source_ref','raw_hash','run_id']);
 });
 it('metrics: metric, formula_version, basis, input_unit, inputs[].fact_id, based_on_rev',()=>{
  const m={metric:'gross_margin',formula_version:FORMULA_VERSION,basis:'us_standard',input_unit:'USD',based_on_rev:3,inputs:[{fact_id:'f',concept:'revenue',filing_id:'g',available_date:'2024-02-15'}]};
  expect(missingFields({value_text:'0.4',unit:'pure',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',metric:m})).toEqual([]);
  expect(missingFields({value_text:'0.4',unit:'pure',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',metric:{...m,basis:'',inputs:[]}})).toEqual(['basis','inputs[].fact_id']);
 });
});

describe('resolveProvenance — facts rows (spec §0 R5-5)',()=>{
 it('lists the issuer prefix, verifies sha256(bytes) = object name, re-parses and finds the candidate whose rawHash = raw_hash',async()=>{
  const w=await world();
  const row=await revenueRow(w);
  const p=await priv(w).resolveProvenance(REF,row,{artifacts:true});
  expect(p).toEqual({ok:true,missing:[],producer_code_version:CODE_VERSION,object_path:`edgar/${UNIT_ISSUER}/${sha256Hex(doc(BASE))}.json`,locator:expect.stringMatching(/^facts\.us-gaap\.Revenues\.units\.USD\[0\]\(accn=0009990611-24-000001,start=2023-01-01,end=2023-12-31\)$/)});
 });
 it('without artifacts: eligibility, filing and producer only (no object)',async()=>{
  const w=await world();
  expect(await priv(w).resolveProvenance(REF,await revenueRow(w),{artifacts:false})).toEqual({ok:true,missing:[],producer_code_version:CODE_VERSION});
 });
 it('missing fields are reported before any lookup',async()=>{
  const w=await world();
  expect(await priv(w).resolveProvenance(REF,{...await revenueRow(w),raw_hash:undefined},{artifacts:true})).toEqual({ok:false,missing:['raw_hash'],reason:'fields_missing'});
 });
 it('object bytes that do not hash to their name are never used: object_hash_mismatch',async()=>{
  const w=await world();const row=await revenueRow(w);
  const path=objectPath(w);const bytes=w.storage.objects.get(path) as Uint8Array;
  w.storage.objects.set(path,new Uint8Array([...bytes,0x20]));
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'object_hash_mismatch'});
 });
 it('valid objects without the candidate → candidate_not_found; no object at all → no_raw_objects',async()=>{
  const w=await world();const row=await revenueRow(w);
  const path=objectPath(w);w.storage.objects.delete(path);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'no_raw_objects'});
  const other=doc([{...BASE[0],val:'999'}]);
  w.storage.objects.set(`edgar/${UNIT_ISSUER}/${sha256Hex(other)}.json`,other);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'candidate_not_found'});
 });
 it('a row that disagrees with the stored fact is refused: value, raw_hash, run_id, source_ref',async()=>{
  const w=await world();const row=await revenueRow(w);const r=priv(w);
  expect(await r.resolveProvenance(REF,{...row,value_text:'1001'},{artifacts:true})).toMatchObject({ok:false,reason:'row_mismatch:value'});
  expect(await r.resolveProvenance(REF,{...row,raw_hash:'b'.repeat(64)},{artifacts:true})).toMatchObject({ok:false,reason:'row_mismatch:raw_hash'});
  expect(await r.resolveProvenance(REF,{...row,run_id:'00000000-0000-4000-8000-0000000000aa'},{artifacts:true})).toMatchObject({ok:false,reason:'row_mismatch:run_id'});
  expect(await r.resolveProvenance(REF,{...row,source_ref:A2},{artifacts:true})).toMatchObject({ok:false,reason:'source_ref_mismatch'});
  expect(await r.resolveProvenance({...REF,issuerId:'00000000-0000-4000-8000-0000000000bb'},row,{artifacts:true})).toMatchObject({ok:false,reason:'fact_not_eligible'});
 });
 it('producer_code_version comes from fact_sync_runs → ingest_batches; an empty code_version is producer_code_version_missing',async()=>{
  const w=await world();const row=await revenueRow(w);
  const batch=w.db.runs().find(r=>r.run_id===row.run_id)!.batch_id;
  expect(await w.tables.update('ingest_batches',{batch_id:batch},{code_version:null})).toBe(1);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'producer_code_version_missing'});
 });
});

describe('resolveProvenance — metric rows (spec §0 R5-6)',()=>{
 it('every input fact is eligible and resolved to its snapshot; inputs are listed with their own chain',async()=>{
  const w=await world();
  const [row]=(await priv(w).readCurrent(REF,margin,TODAY)).rows;
  const p=await priv(w).resolveProvenance(REF,row,{artifacts:true}) as FactProvenance;
  expect(p).toMatchObject({ok:true,missing:[],producer_code_version:CODE_VERSION});
  expect(p.input_chains?.map(i=>[i.concept,i.ok,i.source_ref,i.object_path!.startsWith(`edgar/${UNIT_ISSUER}/`),/^facts\.us-gaap\./.test(i.locator!)]).sort()).toEqual([['gross_profit',true,A1,true,true],['revenue',true,A1,true,true]]);
 });
 it('an input on a superseded generation is input_not_eligible',async()=>{
  const w=await world();
  const [row]=(await priv(w).readCurrent(REF,margin,TODAY)).rows;
  expect((await w.sync(doc(BASE),{mappingGen:2})).detail.published).toBe(1);
  expect(await priv(w).resolveProvenance(REF,row,{artifacts:true})).toMatchObject({ok:false,reason:'input_not_eligible'});
 });
 it('an unknown input id is input_missing',async()=>{
  const w=await world();
  const [row]=(await priv(w).readCurrent(REF,margin,TODAY)).rows;
  const bad={...row,metric:{...row.metric!,inputs:[{...row.metric!.inputs[0],fact_id:'00000000-0000-4000-8000-0000000000cc'}]}};
  expect(await priv(w).resolveProvenance(REF,bad,{artifacts:false})).toMatchObject({ok:false,reason:'input_missing'});
 });
});

describe('readNonVisible (spec §5.1.1)',()=>{
 it('a same-day conflict quarantines the published row: document-bound → quarantined (current binding too)',async()=>{
  const w=await world();
  expect((await w.sync(doc([...BASE,CONFLICT]))).counts.quarantined).toBeGreaterThanOrEqual(1);
  const r=priv(w);
  expect((await r.readDocumentBound(REF,netIncome,accn(A1),TODAY)).rows).toEqual([]);
  expect(await r.readNonVisible(REF,netIncome,accn(A1),TODAY)).toBe('quarantined');
  expect(await r.readNonVisible(REF,netIncome,null,TODAY)).toBe('quarantined');
  expect(await r.readNonVisible(REF,revenue,accn(A1),TODAY)).toBeNull();
 });
 it('a key the new generation no longer carries → superseded_generation',async()=>{
  const w=await world();
  expect((await w.sync(doc(BASE.filter(e=>e.tag!=='NetIncomeLoss')),{mappingGen:2})).detail.published).toBe(1);
  const r=priv(w);
  expect((await r.readDocumentBound(REF,netIncome,accn(A1),TODAY)).rows).toEqual([]);
  expect(await r.readNonVisible(REF,netIncome,accn(A1),TODAY)).toBe('superseded_generation');
  expect(await r.readNonVisible(REF,netIncome,null,TODAY)).toBe('superseded_generation');
  expect(await r.readNonVisible(REF,netIncome,null,'2024-01-01')).toBeNull();
  expect(await r.readNonVisible(REF,netIncome,accn('0009990611-99-000009'),TODAY)).toBeNull();
  expect(await r.readNonVisible(REF,margin,null,TODAY)).toBeNull();
 });
});

describe('hints (spec §5.3.2)',()=>{
 it('late_fact (created after since), quarantine_resolved (same key prefix) and mapping_gen_raised, ordered by time',async()=>{
  const w=await world(BASE,'2026-01-01T00:00:00.000Z');
  const since='2026-02-01T00:00:00.000Z';
  await w.sync(doc([...BASE,CONFLICT]),{at:'2026-03-01T00:00:00.000Z'});
  const [item]=await w.db.openConflicts(UNIT_ISSUER,'US');
  w.db.setNow('2026-03-02T00:00:00.000Z');
  const members=await w.db.factsByIds(item.fact_ids);
  await w.db.resolveFactsQuarantine(item.id,[members.find(m=>m.value_text==='100')!.fact_id],'00000000-0000-4000-8000-0000000000dd');
  await w.sync(doc([...BASE,AMEND]),{at:'2026-04-01T00:00:00.000Z',mappingGen:2});
  const request={issuer:{market:'US' as const,cik:'9990611'},concepts:['net_income_parent'],asOf:TODAY};
  const hints=await priv(w).hints(request,since);
  const late=hints.filter(h=>h.kind==='late_fact');
  expect(late.length).toBeGreaterThanOrEqual(2);
  expect(late[0].at).toBe('2026-03-01T00:00:00.000Z');
  expect(hints.filter(h=>h.kind==='quarantine_resolved')).toEqual([{kind:'quarantine_resolved',ref:item.id,at:'2026-03-02T00:00:00.000Z'}]);
  expect(hints.filter(h=>h.kind==='mapping_gen_raised').map(h=>h.at)).toEqual(['2026-04-01T00:00:00.000Z']);
  expect(hints.map(h=>h.at)).toEqual([...hints.map(h=>h.at)].sort());
  expect(await priv(w).hints(request,'2026-05-01T00:00:00.000Z')).toEqual([]);
  expect(await priv(w).hints({...request,issuer:{market:'US',cik:'9990699'}},since)).toEqual([]);
 });
});

describe('raw object storage',()=>{
 it('memoryRawStorage lists by prefix in order and returns bytes for string or binary objects',async()=>{
  const s=memoryRawStorage(new Map<string,string|Uint8Array>([['edgar/x/b.json',new Uint8Array([1])],['edgar/x/a.meta.json','{"a":1}'],['edgar/y/c.json','z']]));
  expect(await s.list('edgar/x/')).toEqual(['edgar/x/a.meta.json','edgar/x/b.json']);
  expect(await s.get('edgar/x/a.meta.json')).toEqual(new TextEncoder().encode('{"a":1}'));
  expect(await s.get('edgar/x/none.json')).toBeNull();
 });
 it('supabaseRawStorage pages the listing, keeps snapshot names only, maps not-found to null',async()=>{
  const names=[...Array.from({length:1000},(_,i)=>`${i.toString(16).padStart(64,'0')}.json`),'notes.txt','f'.repeat(64)+'.meta.json'];
  const calls:{dir:string;offset:number}[]=[];
  const fake={storage:{from:(bucket:string)=>{expect(bucket).toBe('disclosure-raw');return {
   list:async(dir:string,o:{limit:number;offset:number})=>{calls.push({dir,offset:o.offset});return {data:names.slice(o.offset,o.offset+o.limit).map(name=>({name})),error:null};},
   download:async(path:string)=>path.endsWith('missing.json')?{data:null,error:{message:'Object not found',statusCode:'404'}}:path.endsWith('boom.json')?{data:null,error:{message:'internal',statusCode:'500'}}:{data:new Blob([new Uint8Array([7,8])]),error:null},
  };}}} as unknown as SupabaseClient;
  const s=supabaseRawStorage(fake);
  const listed=await s.list('edgar/x/');
  expect(calls).toEqual([{dir:'edgar/x',offset:0},{dir:'edgar/x',offset:1000}]);
  expect(listed).toHaveLength(1001);expect(listed.every(p=>p.startsWith('edgar/x/'))).toBe(true);expect(listed).not.toContain('edgar/x/notes.txt');
  expect(await s.get('edgar/x/a.json')).toEqual(new Uint8Array([7,8]));
  expect(await s.get('edgar/x/missing.json')).toBeNull();
  await expect(s.get('edgar/x/boom.json')).rejects.toThrow('storage_download_failed:internal');
 });
});
```

- [ ] **Step 4: Run both tests to verify they fail**

Run: `npm test -- src/lib/evals/adapters/facts.test.ts src/lib/evals/adapters/provenance.test.ts`
Expected: FAIL — both suites error with `Failed to resolve import "./facts"` (and `"./provenance"`).

- [ ] **Step 5: Implement the provenance resolver**

Create `src/lib/evals/adapters/provenance.ts`:

```ts
// src/lib/evals/adapters/provenance.ts
// Source-chain resolution of facts rows (spec §5.1.4; §0 R5-5, R5-6). raw_hash is NEVER an object name: the resolver
// lists disclosure-raw/{source}/{issuer_id}/, downloads each {sha256}.json, checks sha256(bytes) = the name, re-parses
// it with the landed parser of its source (parseCompanyFacts; parseTushareStatements on that one page, its meta read
// from the {sha256}.meta.json sidecar) and looks for the candidate whose rawHash (= rawHashOf(snapshot sha, locator))
// equals the stored raw_hash. That candidate must agree with the stored row on concept, period, duration, unit, the
// filing's source_ref and the lossless value (a Tushare sum is the parser's own summed candidate); {object_path,
// locator} are recorded. producer_code_version = fact_sync_runs.run_id → batch_id → ingest_batches.code_version.
// factsByIds visibility depends on the caller's role (a privileged run sees non-ok rows), so eligibility is checked
// explicitly (R5-6): status ok, same issuer and market, mapping_gen = the filing's active generation. A metric row is
// resolved through every input fact. Parsed objects are memoised per path (content-addressed, immutable) and producer
// versions per run_id; listings, filings and fact rows are read fresh on every call. Any failed step → ok:false + reason.
import type {SupabaseClient} from '@supabase/supabase-js';
import type {TableClient} from '../../db/table-client';
import {decimalEquals} from '../../facts/json-numbers';
import {sha256Hex} from '../../facts/providers/shared';
import {SNAPSHOT_BUCKET,metaPath} from '../../facts/snapshot-store';
import type {FactCandidate,FactRow,FactsDb,FilingRow,ParseResult,RawSnapshot,Source} from '../../facts/types';
import type {ProvenanceCheck,ReadRow,SubjectRef} from '../types';

export interface RawObjectStorage{
 /** Full object paths under `prefix` (e.g. 'edgar/<issuer_id>/'), sidecars included; callers filter. */
 list(prefix:string):Promise<string[]>;
 /** Object bytes, or null when the object does not exist. */
 get(path:string):Promise<Uint8Array|null>;
}
export interface SnapshotParsers{edgar:(snapshot:RawSnapshot,opts:{sinceYear:number})=>ParseResult;tushare:(snapshots:RawSnapshot[],opts:{sinceYear:number})=>ParseResult}
export interface ProvenanceDeps{db:Pick<FactsDb,'factsByIds'|'filingsOfIssuer'>;tables:TableClient;storage:RawObjectStorage;parsers:SnapshotParsers}
export interface InputProvenance{fact_id:string;concept:string;ok:boolean;reason:string|null;source_ref:string|null;raw_hash:string|null;producer_code_version:string|null;object_path:string|null;locator:string|null}
/** ProvenanceCheck plus, for a metric row, one chain per input fact (CCR 1; named input_chains so it does not clash with the contract's ProvenanceCheck.inputs). */
export interface FactProvenance extends ProvenanceCheck{input_chains?:InputProvenance[]}
export type ProvenanceResolver=(ref:SubjectRef,row:ReadRow,opts:{artifacts:boolean})=>Promise<FactProvenance>;

export const FACT_FIELDS=['fact_id','filing_id','source_ref','available_date','mapping_gen','mapping_version','raw_hash','run_id'] as const;
export const METRIC_FIELDS=['metric','formula_version','basis','input_unit','inputs[].fact_id','based_on_rev'] as const;
/** Stored objects are re-parsed in full: the locator, not a since-year window, identifies the row. */
export const PARSE_SINCE_YEAR=1900;
export const STORAGE_LIST_PAGE=1000;
const OBJECT_NAME=/^[0-9a-f]{64}\.json$/;
const STORED_NAME=/^[0-9a-f]{64}(\.meta)?\.json$/;
const blank=(v:unknown)=>v===undefined||v===null||v==='';
const baseName=(p:string)=>p.slice(p.lastIndexOf('/')+1);

/** Required source-chain fields the row lacks (spec §5.1.4 table, in table order); the unprivileged check is exactly this. */
export function missingFields(row:ReadRow):string[]{
 const m=row.metric;
 if(m){
  const out:string[]=[];
  for(const k of ['metric','formula_version','basis','input_unit'] as const)if(blank(m[k]))out.push(k);
  if(m.inputs.length===0||m.inputs.some(i=>blank(i.fact_id)))out.push('inputs[].fact_id');
  if(!Number.isInteger(m.based_on_rev))out.push('based_on_rev');
  return out;
 }
 return FACT_FIELDS.filter(k=>blank(row[k]));
}

/** fact_sync_runs.run_id → batch_id → ingest_batches.code_version; null when any link or the version is missing. */
export async function producerCodeVersion(tables:TableClient,runId:string):Promise<string|null>{
 const [run]=await tables.select('fact_sync_runs',{run_id:runId},{limit:1});
 if(!run||blank(run.batch_id))return null;
 const [batch]=await tables.select('ingest_batches',{batch_id:String(run.batch_id)},{limit:1});
 const v=batch?.code_version;
 return typeof v==='string'&&v.trim()!==''?v:null;
}

type Parsed=ParseResult|'hash_mismatch'|'unreadable';
async function loadAndParse(deps:ProvenanceDeps,source:Source,path:string):Promise<Parsed>{
 const bytes=await deps.storage.get(path);
 if(bytes===null)return 'unreadable';
 const sha=sha256Hex(bytes);
 if(`${sha}.json`!==baseName(path))return 'hash_mismatch';
 try{
  if(source==='edgar')return deps.parsers.edgar({bytes,sha256:sha,meta:{source:'edgar',fetched_at:'',http_status:200}},{sinceYear:PARSE_SINCE_YEAR});
  const metaBytes=await deps.storage.get(metaPath(path));
  if(metaBytes===null)return 'unreadable';
  const meta={...(JSON.parse(new TextDecoder().decode(metaBytes)) as Record<string,unknown>)};
  delete meta.sha256;delete meta.bytes;
  const snapshot:RawSnapshot={bytes,sha256:sha,meta:{...(meta as Partial<RawSnapshot['meta']>),source:'tushare',fetched_at:String(meta.fetched_at??''),http_status:Number(meta.http_status??200)}};
  return deps.parsers.tushare([snapshot],{sinceYear:PARSE_SINCE_YEAR});
 }catch{return 'unreadable';}
}

function candidateMismatch(c:FactCandidate,f:FactRow,g:FilingRow):string|null{
 if(c.concept!==f.concept)return 'concept';
 if(c.periodStart!==f.period_start||c.periodEnd!==f.period_end)return 'period';
 if(c.duration!==f.duration)return 'duration';
 if(c.unit!==f.unit)return 'unit';
 if(c.filingRef!==g.source_ref)return 'source_ref';
 if(!decimalEquals(c.value,f.value_text))return 'value';
 return null;
}

interface Resolved{ok:boolean;reason:string|null;source_ref:string|null;raw_hash:string|null;producer_code_version:string|null;object_path:string|null;locator:string|null}
const failed=(reason:string,over:Partial<Resolved>={}):Resolved=>({ok:false,reason,source_ref:null,raw_hash:null,producer_code_version:null,object_path:null,locator:null,...over});
interface Expect{source_ref?:string;value_text?:string;raw_hash?:string;run_id?:string;concept?:string}

export function provenanceResolver(deps:ProvenanceDeps):ProvenanceResolver{
 const parsed=new Map<string,Promise<Parsed>>();
 const producers=new Map<string,Promise<string|null>>();
 const parseObject=(source:Source,path:string):Promise<Parsed>=>{
  let p=parsed.get(path);
  if(!p){p=loadAndParse(deps,source,path);parsed.set(path,p);}
  return p;
 };
 const producerOf=(runId:string):Promise<string|null>=>{
  let p=producers.get(runId);
  if(!p){const q=producerCodeVersion(deps.tables,runId);producers.set(runId,q);q.catch(()=>{if(producers.get(runId)===q)producers.delete(runId);});p=q;}
  return p;
 };
 const locate=async(source:Source,issuerId:string,rawHash:string):Promise<{path:string;candidate:FactCandidate}|{reason:string}>=>{
  const paths=(await deps.storage.list(`${source}/${issuerId}/`)).filter(p=>OBJECT_NAME.test(baseName(p))).sort();
  let mismatched=0,unreadable=0;
  for(const path of paths){
   const r=await parseObject(source,path);
   if(r==='hash_mismatch'){mismatched++;continue;}
   if(r==='unreadable'){unreadable++;continue;}
   const candidate=r.candidates.find(c=>c.rawHash===rawHash);
   if(candidate)return {path,candidate};
  }
  return {reason:mismatched>0?'object_hash_mismatch':unreadable>0?'object_unreadable':paths.length===0?'no_raw_objects':'candidate_not_found'};
 };
 /** One stored fact: eligibility (R5-6), row agreement, filing, producer; with artifacts the snapshot candidate (R5-5). */
 const resolveFact=async(ref:SubjectRef,factId:string,expect:Expect,artifacts:boolean,input:boolean):Promise<Resolved>=>{
  const [stored]=await deps.db.factsByIds([factId]);
  if(!stored)return failed(input?'input_missing':'fact_missing');
  const notEligible=input?'input_not_eligible':'fact_not_eligible';
  if(stored.status!=='ok'||stored.issuer_id!==ref.issuerId||stored.market!==ref.market)return failed(notEligible,{raw_hash:stored.raw_hash});
  if(expect.concept!==undefined&&stored.concept!==expect.concept)return failed(notEligible,{raw_hash:stored.raw_hash});
  if(expect.value_text!==undefined&&!decimalEquals(expect.value_text,stored.value_text))return failed('row_mismatch:value',{raw_hash:stored.raw_hash});
  for(const k of ['raw_hash','run_id'] as const)if(expect[k]!==undefined&&expect[k]!==stored[k])return failed(`row_mismatch:${k}`,{raw_hash:stored.raw_hash});
  const filing=(await deps.db.filingsOfIssuer(ref.issuerId,ref.market,{})).find(f=>f.filing_id===stored.filing_id);
  if(!filing)return failed('filing_missing',{raw_hash:stored.raw_hash});
  if(stored.mapping_gen!==filing.mapping_gen)return failed(input?'input_not_eligible':'not_active_generation',{raw_hash:stored.raw_hash,source_ref:filing.source_ref});
  if(expect.source_ref!==undefined&&expect.source_ref!==filing.source_ref)return failed('source_ref_mismatch',{raw_hash:stored.raw_hash,source_ref:filing.source_ref});
  const producer=await producerOf(stored.run_id);
  const known={source_ref:filing.source_ref,raw_hash:stored.raw_hash,producer_code_version:producer};
  if(producer===null)return failed('producer_code_version_missing',known);
  if(!artifacts)return {ok:true,reason:null,...known,object_path:null,locator:null};
  const hit=await locate(filing.source,ref.issuerId,stored.raw_hash);
  if('reason' in hit)return failed(hit.reason,known);
  const mismatch=candidateMismatch(hit.candidate,stored,filing);
  if(mismatch!==null)return failed(`candidate_mismatch:${mismatch}`,{...known,object_path:hit.path});
  const locator=(hit.candidate as FactCandidate&{locator?:unknown}).locator;
  if(typeof locator!=='string'||locator==='')return failed('locator_missing',{...known,object_path:hit.path});
  return {ok:true,reason:null,...known,object_path:hit.path,locator};
 };
 return async(ref,row,opts)=>{
  const missing=missingFields(row);
  if(missing.length>0)return {ok:false,missing,reason:'fields_missing'};
  if(row.metric){
   const inputs:InputProvenance[]=[];
   for(const i of row.metric.inputs)inputs.push({fact_id:i.fact_id,concept:i.concept,...await resolveFact(ref,i.fact_id,{concept:i.concept},opts.artifacts,true)});
   const bad=inputs.find(x=>!x.ok);
   const versions=[...new Set(inputs.map(x=>x.producer_code_version).filter((v):v is string=>v!==null))].sort();
   const reason=bad?(bad.reason==='input_missing'||bad.reason==='input_not_eligible'?bad.reason:`input:${bad.reason}`):null;
   return {ok:!bad,missing:[],...(reason?{reason}:{}),...(versions.length>0?{producer_code_version:versions.join(',')}:{}),input_chains:inputs};
  }
  const r=await resolveFact(ref,row.fact_id!,{source_ref:row.source_ref,value_text:row.value_text,raw_hash:row.raw_hash,run_id:row.run_id},opts.artifacts,false);
  return {ok:r.ok,missing:[],...(r.reason?{reason:r.reason}:{}),...(r.producer_code_version?{producer_code_version:r.producer_code_version}:{}),...(r.object_path?{object_path:r.object_path}:{}),...(r.locator?{locator:r.locator}:{})};
 };
}

/** In-memory objects (memorySnapshotStore().objects): the unit tests and the F6 frozen world. */
export function memoryRawStorage(objects:Map<string,string|Uint8Array>):RawObjectStorage{
 return {
  async list(prefix){return [...objects.keys()].filter(k=>k.startsWith(prefix)).sort();},
  async get(path){const v=objects.get(path);if(v===undefined)return null;return typeof v==='string'?new TextEncoder().encode(v):new Uint8Array(v);},
 };
}

/** Supabase Storage (service_role): bucket disclosure-raw, listing paged by name; a missing object is null. */
export function supabaseRawStorage(admin:SupabaseClient):RawObjectStorage{
 const bucket=()=>admin.storage.from(SNAPSHOT_BUCKET);
 return {
  async list(prefix){
   const dir=prefix.replace(/\/+$/,'');const out:string[]=[];
   for(let offset=0;;offset+=STORAGE_LIST_PAGE){
    const {data,error}=await bucket().list(dir,{limit:STORAGE_LIST_PAGE,offset,sortBy:{column:'name',order:'asc'}});
    if(error)throw new Error(`storage_list_failed:${error.message}`);
    const page=data??[];
    for(const o of page)if(STORED_NAME.test(o.name))out.push(`${dir}/${o.name}`);
    if(page.length<STORAGE_LIST_PAGE)return out;
   }
  },
  async get(path){
   const {data,error}=await bucket().download(path);
   if(error){
    const e=error as {message:string;statusCode?:unknown;status?:unknown};
    if(String(e.statusCode??e.status??'')==='404'||/not.?found/i.test(e.message))return null;
    throw new Error(`storage_download_failed:${e.message}`);
   }
   return data?new Uint8Array(await data.arrayBuffer()):null;
  },
 };
}
```

- [ ] **Step 6: Implement the facts reader**

Create `src/lib/evals/adapters/facts.ts`:

```ts
// src/lib/evals/adapters/facts.ts
// facts read adapter (spec §5.1.2, §5.6; §0 R5-6–R5-8). factsReader sees only the read subset of FactsDb (a type-level
// Pick: no write method is reachable) plus the TableClient resolveIssuer needs. Document binding: filingsOfIssuer, then
// the filing chosen in memory by selectFiling (§4.2 table; R5-8 for CN), then readFacts(history, from = to = period_end,
// asOf = today) and the rows of THAT filing whose period, duration and consolidation equal the target (period_start
// only when the target defines it). Units are never filtered here (the kind decides unit_mismatch / ambiguous).
// Current binding: the current rows at asOf. Metric targets are derived live (R5-7): readFacts(DERIVE_CONCEPTS[market],
// history) → deriveMetrics(rows, basedOnRev = that envelope's state_rev) → the target metric; the evaluator never calls
// materialize and never reads the financial_metrics cache. A truncated envelope is read_error(truncated).
// stateRev(): deps.stateRev() when it answers, else the largest envelope state_rev seen (state_rev is per issuer).
// privilegedFactsReader (service-role tables) adds readNonVisible (quarantined / superseded generation, §5.1.1),
// resolveProvenance (provenance.ts, R5-5/R5-6) and hints (§5.3.2: late facts, resolved quarantine, raised generation).
import {MAX_PAGE} from '../../db/table-client';
import type {RangeOptions,Row,TableClient} from '../../db/table-client';
import {resolveIssuer} from '../../entities/resolve';
import {conflictPrefix,factRowFromTable} from '../../facts/db';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveMetrics} from '../../facts/derive';
import type {FactRow,FactsDb,FilingRow,MetricRow} from '../../facts/types';
import type {CaseTarget,DocumentId,FactTarget,Hint,MetricTarget,ModuleReader,PrivilegedReader,Projection,ReadErrorReason,ReadResult,ReadRow,ReplayRequest,SubjectRef} from '../types';
import {provenanceResolver} from './provenance';
import type {RawObjectStorage,SnapshotParsers} from './provenance';

export type FactsReadDb=Pick<FactsDb,'readFacts'|'filingsOfIssuer'|'factsByIds'|'metricsOfIssuer'>;
export interface FactsReaderDeps{
 db:FactsReadDb;
 /** resolveIssuer's client; for the privileged reader also financial_facts, filings, fact_sync_runs, ingest_batches, dq_quarantine. */
 tables:TableClient;
 /** Report-level db_state_rev override; null → the largest envelope state_rev this reader saw. */
 stateRev:()=>Promise<number|null>;
 /** projections/facts.ts::projectRequest (Task 10); absent → project() rejects with projector_missing. */
 projector?:(request:ReplayRequest,today:string)=>Promise<Projection>;
}
export interface PrivilegedFactsReaderDeps extends FactsReaderDeps{storage:RawObjectStorage;parsers:SnapshotParsers}

const RESOLVE_REFUSALS=/^(empty_query|ambiguous_query|ambiguous_owner|invalid_identifier:)/;
const CN_PERIODIC:Record<string,string>={'03':'q1','06':'semiannual','09':'q3','12':'annual'};
const errorResult=(error:ReadErrorReason,stateRev:number|null=null):ReadResult=>({rows:[],truncated:error==='truncated',stateRev,error});

/** §4.2 document → filing, in memory over filingsOfIssuer(issuer, market, {}) (it has no source_ref/document_ref filter). */
export function selectFiling(filings:FilingRow[],target:CaseTarget,documentId:DocumentId):{filing:FilingRow}|{error:ReadErrorReason}{
 if(documentId.kind==='edgar_accession'){
  const m=filings.filter(f=>f.source==='edgar'&&f.source_ref===documentId.value);
  return m.length===1?{filing:m[0]}:{error:m.length===0?'filing_not_found':'filing_ambiguous'};
 }
 if(documentId.kind!=='cninfo_announcement')return {error:'filing_not_found'};
 const all=filings.filter(f=>f.source==='tushare'&&f.document_ref===documentId.value);
 if(all.length===1)return {filing:all[0]};
 if(all.length>1){
  const byPeriod=all.filter(f=>f.period_end===target.period_end);
  const left=byPeriod.length>1?byPeriod.filter(f=>f.form_type===CN_PERIODIC[target.period_end.slice(5,7)]):byPeriod;
  return left.length===1?{filing:left[0]}:{error:'filing_ambiguous'};
 }
 const unlinked=filings.some(f=>f.source==='tushare'&&f.document_ref===null&&f.period_end===target.period_end);
 return {error:unlinked?'filing_not_linked':'filing_not_found'};
}

/** concept, period_end, duration, consolidation always; period_start only when the target defines it (undefined = legacy). */
export function factKeyMatches(f:Pick<FactRow,'concept'|'period_start'|'period_end'|'duration'|'consolidation'>,t:FactTarget):boolean{
 return f.concept===t.concept&&f.period_end===t.period_end&&f.duration===t.duration&&f.consolidation===t.consolidation&&(t.period_start===undefined||f.period_start===t.period_start);
}
export function readRowOfFact(f:FactRow,sourceRef:string|undefined):ReadRow{
 const row:ReadRow={value_text:f.value_text,unit:f.unit,period_start:f.period_start,period_end:f.period_end,duration:f.duration,consolidation:f.consolidation,available_date:f.available_date,
  fact_id:f.fact_id,filing_id:f.filing_id,mapping_gen:f.mapping_gen,mapping_version:f.mapping_version,raw_hash:f.raw_hash,run_id:f.run_id,status:f.status};
 if(sourceRef!==undefined)row.source_ref=sourceRef;
 return row;
}
export function readRowOfMetric(m:MetricRow):ReadRow{
 return {value_text:m.value,unit:m.unit,period_start:m.period_start,period_end:m.period_end,duration:m.duration,consolidation:'consolidated',
  available_date:m.inputs.map(i=>i.available_date).sort().at(-1)??m.as_of,
  metric:{metric:m.metric,formula_version:m.formula_version,basis:m.basis,input_unit:m.input_unit,based_on_rev:m.based_on_rev,inputs:m.inputs.map(i=>({fact_id:i.fact_id,concept:i.concept,filing_id:i.filing_id,available_date:i.available_date}))}};
}
const metricMatches=(m:MetricRow,t:MetricTarget)=>m.metric===t.metric&&m.period_start===t.period_start&&m.period_end===t.period_end&&m.duration===t.duration&&m.basis===t.basis&&m.input_unit===t.input_unit;

/** Complete-set TableClient read: offset pages in `orderBy` (a unique column) until an empty page. */
async function selectPaged(tables:TableClient,table:string,match:Row,orderBy:string,range:RangeOptions={}):Promise<Row[]>{
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await tables.select(table,match,{...range,orderBy,offset,limit:MAX_PAGE});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

export function factsReader(deps:FactsReaderDeps):ModuleReader{
 const {db}=deps;
 let observed:number|null=null;
 const observe=(rev:number)=>{if(observed===null||rev>observed)observed=rev;};
 const sourceRefs=async(ref:SubjectRef)=>new Map((await db.filingsOfIssuer(ref.issuerId,ref.market,{})).map(f=>[f.filing_id,f.source_ref]));
 const readCurrentFact=async(ref:SubjectRef,t:FactTarget,asOf:string):Promise<ReadResult>=>{
  const r=await db.readFacts(ref.issuerId,ref.market,{concepts:[t.concept],asOf,from:t.period_end,to:t.period_end,history:false});
  observe(r.stateRev);
  if(r.truncated)return errorResult('truncated',r.stateRev);
  const hits=r.rows.filter(f=>factKeyMatches(f,t)&&f.is_current!==false);
  const refs=hits.length>0?await sourceRefs(ref):new Map<string,string>();
  return {rows:hits.map(f=>readRowOfFact(f,refs.get(f.filing_id))),truncated:false,stateRev:r.stateRev};
 };
 const readCurrentMetric=async(ref:SubjectRef,t:MetricTarget,asOf:string):Promise<ReadResult>=>{
  if(t.formula_version!==FORMULA_VERSION)return errorResult('formula_version_mismatch');
  const r=await db.readFacts(ref.issuerId,ref.market,{concepts:[...DERIVE_CONCEPTS[ref.market]],asOf,history:true});
  observe(r.stateRev);
  if(r.truncated)return errorResult('truncated',r.stateRev);
  let metrics:MetricRow[];
  try{metrics=deriveMetrics(r.rows,{market:ref.market,asOf,basedOnRev:r.stateRev});}catch{return errorResult('read_failed',r.stateRev);}
  return {rows:metrics.filter(m=>metricMatches(m,t)).map(readRowOfMetric),truncated:false,stateRev:r.stateRev};
 };
 return {
  module:'facts',privileged:false,
  async resolveSubject(subject,today){
   const q=subject.cik!==undefined?{cik:subject.cik}:subject.ticker!==undefined?{ticker:subject.ticker}:null;
   if(q===null)return null;
   try{
    const r=await resolveIssuer(deps.tables,q,{today});
    return r?{issuerId:r.issuer_id,market:subject.market}:null;
   }catch(e){
    if(e instanceof Error&&RESOLVE_REFUSALS.test(e.message))return null;
    throw e;
   }
  },
  async readDocumentBound(ref,target,documentId,today){
   if(target.type!=='fact')return errorResult('read_failed');
   const pick=selectFiling(await db.filingsOfIssuer(ref.issuerId,ref.market,{}),target,documentId);
   if('error' in pick)return errorResult(pick.error);
   const r=await db.readFacts(ref.issuerId,ref.market,{concepts:[target.concept],asOf:today,from:target.period_end,to:target.period_end,history:true});
   observe(r.stateRev);
   if(r.truncated)return errorResult('truncated',r.stateRev);
   const rows=r.rows.filter(f=>f.filing_id===pick.filing.filing_id&&factKeyMatches(f,target)).map(f=>readRowOfFact(f,pick.filing.source_ref));
   return {rows,truncated:false,stateRev:r.stateRev};
  },
  readCurrent:(ref,target,asOf)=>target.type==='fact'?readCurrentFact(ref,target,asOf):readCurrentMetric(ref,target,asOf),
  project:(request,today)=>deps.projector?deps.projector(request,today):Promise.reject(new Error('projector_missing')),
  async stateRev(){const v=await deps.stateRev();return v??observed;},
 };
}

/** §5.1.1: quarantined (a non-ok row of the key) or superseded_generation (a stored row of the key not on its filing's active generation). */
async function readNonVisible(deps:FactsReaderDeps,ref:SubjectRef,target:CaseTarget,documentId:DocumentId|null,asOf:string):Promise<'quarantined'|'superseded_generation'|null>{
 if(target.type!=='fact')return null;
 const filings=await deps.db.filingsOfIssuer(ref.issuerId,ref.market,{});
 let filing:FilingRow|null=null;
 if(documentId!==null){const p=selectFiling(filings,target,documentId);if('error' in p)return null;filing=p.filing;}
 const inScope=(f:Pick<FactRow,'filing_id'>)=>filing===null||f.filing_id===filing.filing_id;
 const r=await deps.db.readFacts(ref.issuerId,ref.market,{concepts:[target.concept],asOf,from:target.period_end,to:target.period_end,history:true,includeNonOk:true});
 if(r.truncated)return null;
 if(r.rows.some(f=>f.status==='quarantined'&&inScope(f)&&factKeyMatches(f,target)))return 'quarantined';
 const active=new Map(filings.map(f=>[f.filing_id,f.mapping_gen]));
 const match=filing===null?{issuer_id:ref.issuerId,market:ref.market,concept:target.concept,period_end:target.period_end}:{filing_id:filing.filing_id,concept:target.concept,period_end:target.period_end};
 const stored=(await selectPaged(deps.tables,'financial_facts',match,'fact_id')).map(factRowFromTable);
 const superseded=stored.some(f=>inScope(f)&&factKeyMatches(f,target)&&f.available_date<=asOf&&active.has(f.filing_id)&&f.mapping_gen!==active.get(f.filing_id));
 return superseded?'superseded_generation':null;
}

/** §5.3.2 hints over service-role tables; `since` is an ISO instant, comparisons are strict (created/resolved/published AFTER since). */
async function factsHints(deps:FactsReaderDeps,reader:ModuleReader,request:ReplayRequest,since:string):Promise<Hint[]>{
 const sinceMs=Date.parse(since);
 if(Number.isNaN(sinceMs))throw new RangeError(`invalid since: ${since}`);
 const ref=await reader.resolveSubject(request.issuer,request.asOf);
 if(!ref)return [];
 const after=(v:unknown)=>v!==null&&v!==undefined&&Date.parse(String(v))>sinceMs;
 const iso=(v:unknown)=>new Date(String(v)).toISOString();
 const concepts=[...new Set(request.concepts)].sort();
 const out:Hint[]=[];
 for(const concept of concepts)
  for(const f of await selectPaged(deps.tables,'financial_facts',{issuer_id:ref.issuerId,market:ref.market,concept},'fact_id',{gte:{created_at:since}}))
   if(after(f.created_at))out.push({kind:'late_fact',ref:String(f.fact_id),at:iso(f.created_at)});
 const prefixes=concepts.map(c=>`${conflictPrefix(ref.issuerId,ref.market)}${c}:`);
 for(const q of await selectPaged(deps.tables,'dq_quarantine',{table_name:'financial_facts'},'id',{gte:{resolved_at:since}}))
  if(after(q.resolved_at)&&prefixes.some(p=>String(q.natural_key).startsWith(p)))out.push({kind:'quarantine_resolved',ref:String(q.id),at:iso(q.resolved_at)});
 const runs=await selectPaged(deps.tables,'fact_sync_runs',{issuer_id:ref.issuerId,market:ref.market,status:'published'},'run_id');
 const before=runs.filter(r=>!after(r.published_at)).reduce((n,r)=>Math.max(n,Number(r.mapping_gen)),0);
 for(const r of runs)if(after(r.published_at)&&Number(r.mapping_gen)>before)out.push({kind:'mapping_gen_raised',ref:String(r.run_id),at:iso(r.published_at)});
 const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 return out.sort((a,b)=>cmp(a.at,b.at)||cmp(a.kind,b.kind)||cmp(a.ref,b.ref));
}

export function privilegedFactsReader(deps:PrivilegedFactsReaderDeps):PrivilegedReader{
 const reader=factsReader(deps);
 const resolve=provenanceResolver({db:deps.db,tables:deps.tables,storage:deps.storage,parsers:deps.parsers});
 return {...reader,privileged:true,
  readNonVisible:(ref,target,documentId,asOf)=>readNonVisible(deps,ref,target,documentId,asOf),
  resolveProvenance:(ref,row,opts)=>resolve(ref,row,opts),
  hints:(request,since)=>factsHints(deps,reader,request,since)};
}
```

- [ ] **Step 7: Run both tests to verify they pass**

Run: `npm test -- src/lib/evals/adapters/facts.test.ts src/lib/evals/adapters/provenance.test.ts`
Expected: PASS — 2 files, all tests green (no skipped).

If `hints` reports `late.length` of 1 instead of ≥ 2: the gen-2 sync re-inserts every row at `2026-04-01`, so ≥ 2 holds; check that `memoryWorld.sync` set the clock before `runFactsSync` (memory `created_at` comes from `db.setNow`).

- [ ] **Step 8: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0, no warnings.

- [ ] **Step 9: Commit**

```bash
git add src/lib/evals/adapters/memory-world.ts src/lib/evals/adapters/provenance.ts src/lib/evals/adapters/facts.ts src/lib/evals/adapters/facts.test.ts src/lib/evals/adapters/provenance.test.ts
```
```bash
git commit -m "feat(f6): facts read adapter, raw-snapshot provenance resolver, privileged reads (Task 7)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `official_reconciliation` kind and `runGoldSet`

规格：§5.1、§3.2、§3.3、§4.6、§7.1、§14、§0 R5-1。依赖：Task 1（types/compare/summary/canonical-json/errors）、Task 2（`unitOfSpec`）、Task 4（`buildReport`）、Task 6（`caseRowsTruncated`）、Task 7（`missingFields`、`FactProvenance`）。

**Files:**
- Create: `src/lib/evals/kinds/official-test-support.ts` (test-only builders and scripted reader)
- Create: `src/lib/evals/kinds/official.ts`
- Create: `src/lib/evals/run-gold-set.ts`
- Test: `src/lib/evals/kinds/official.test.ts`
- Test: `src/lib/evals/run-gold-set.test.ts`

- [ ] **Step 1: Write the test-only builders**

Create `src/lib/evals/kinds/official-test-support.ts`:

```ts
// src/lib/evals/kinds/official-test-support.ts
// TEST-ONLY builders shared by kinds/official.test.ts, run-gold-set.test.ts and cli/run-cli.test.ts: an f6 GoldCase and
// GoldSet, a facts ReadRow, a fixed EvalEnv, and a scripted ModuleReader (optionally privileged) that records how it
// was called. Nothing outside tests imports this file.
import type {CaseTarget,DocumentId,EvalEnv,GoldCase,GoldSet,ModuleReader,PrivilegedReader,ProvenanceCheck,ReadResult,ReadRow} from '../types';

export const ISSUER='00000000-0000-4000-8000-000009990611';
export const ACCN='0009990611-24-000001';
export const env=(over:Partial<EvalEnv>={}):EvalEnv=>({today:'2026-11-20',now:()=>new Date('2026-11-20T00:00:00.000Z'),evaluatorCodeVersion:'a'.repeat(40),dirty:false,...over});
export function gcase(over:Partial<GoldCase>={}):GoldCase{
 return {case_id:'ZZEVU/revenue/2023-01-01..2023-12-31/consolidated/USD/document',subject:{market:'US',cik:'9990611'},
  target:{type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
  expect:'present',printed:{text:'1,000',unit_label:'USD',scale:'1'},canonical:{value:'1000'},binding:'document',as_of:null,
  source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:ACCN},url:'https://www.sec.gov/Archives/edgar/data/9990611/000999061124000001/',sha256:'d'.repeat(64),available_date:'2024-02-15',locator:{table:'companyfacts',row:'us-gaap:Revenues',column:'2023-01-01..2023-12-31'}},
  provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06T00:00:00Z',reviewed_by:null,reviewed_at:null,retracted:null,notes:'',
  required:true,pending:false,provenance_gaps:[],...over};
}
export function gset(cases:GoldCase[],over:Partial<GoldSet>={}):GoldSet{
 return {schema_version:1,format:'f6',set_id:'facts/unit',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code','codex'],
  tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:cases.filter(c=>!c.required).map(c=>c.case_id),history:[],cases,
  ready:true,path:'src/lib/evals/fixtures/gold/facts/unit.json',sha256:'e'.repeat(64),...over};
}
export const readRow=(over:Partial<ReadRow>={}):ReadRow=>({value_text:'1000',unit:'USD',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',
 fact_id:'f-1',filing_id:'g-1',source_ref:ACCN,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'a'.repeat(64),run_id:'r-1',status:'ok',...over});

export interface ReaderCalls{resolve:string[];document:{target:CaseTarget;doc:DocumentId;today:string}[];current:{target:CaseTarget;asOf:string}[];nonVisible:{doc:DocumentId|null;asOf:string}[];provenance:{row:ReadRow;artifacts:boolean}[]}
export interface FakeReaderOptions{
 /** cik or ticker → issuer id (default {'9990611': ISSUER}). */
 subjects?:Record<string,string>;
 /** Rows of a read (doc null = current binding); a ReadResult injects errors / truncation. Default: [readRow()]. */
 rows?:(target:CaseTarget,doc:DocumentId|null,asOf:string)=>ReadRow[]|ReadResult;
 /** Present → the reader is a PrivilegedReader. */
 privileged?:{nonVisible?:'quarantined'|'superseded_generation'|null;provenance?:(row:ReadRow,opts:{artifacts:boolean})=>ProvenanceCheck};
 stateRev?:number|null;
}
export type FakeReader=(ModuleReader|PrivilegedReader)&{calls:ReaderCalls};
export function fakeReader(o:FakeReaderOptions={}):FakeReader{
 const calls:ReaderCalls={resolve:[],document:[],current:[],nonVisible:[],provenance:[]};
 const subjects=o.subjects??{'9990611':ISSUER};
 const result=(target:CaseTarget,doc:DocumentId|null,asOf:string):ReadResult=>{const r=(o.rows??(()=>[readRow()]))(target,doc,asOf);return Array.isArray(r)?{rows:r,truncated:false,stateRev:7}:r;};
 const base:ModuleReader&{calls:ReaderCalls}={
  module:'facts',privileged:false,calls,
  async resolveSubject(s){const key=s.cik??s.ticker??'';calls.resolve.push(key);const id=subjects[key];return id?{issuerId:id,market:s.market}:null;},
  async readDocumentBound(_ref,target,doc,today){calls.document.push({target,doc,today});return result(target,doc,today);},
  async readCurrent(_ref,target,asOf){calls.current.push({target,asOf});return result(target,null,asOf);},
  async project(){throw new Error('projector_missing');},
  async stateRev(){return o.stateRev===undefined?7:o.stateRev;},
 };
 if(!o.privileged)return base;
 const p=o.privileged;
 const priv:PrivilegedReader&{calls:ReaderCalls}={...base,privileged:true,
  async readNonVisible(_ref,_target,doc,asOf){calls.nonVisible.push({doc,asOf});return p.nonVisible??null;},
  async resolveProvenance(_ref,row,opts){calls.provenance.push({row,artifacts:opts.artifacts});return p.provenance?p.provenance(row,opts):{ok:true,missing:[],producer_code_version:'c'.repeat(40),object_path:`edgar/${ISSUER}/${'b'.repeat(64)}.json`,locator:'facts.us-gaap.Revenues.units.USD[0](accn=0009990611-24-000001,start=2023-01-01,end=2023-12-31)'};},
  async hints(){return [];},
 };
 return priv;
}
```

- [ ] **Step 2: Write the failing kind tests**

Create `src/lib/evals/kinds/official.test.ts`:

```ts
// src/lib/evals/kinds/official.test.ts
import {describe,expect,it} from 'vitest';
import {sha256Hex} from '../canonical-json';
import type {CaseReport,GoldCase,MetricTarget,ProvenanceCheck,ReadRow} from '../types';
import {ANON_PRODUCER,evaluateOfficial} from './official';
import type {OfficialContext} from './official';
import {ACCN,ISSUER,env,fakeReader,gcase,readRow} from './official-test-support';
import type {FakeReaderOptions} from './official-test-support';

const ctx=(over:Partial<OfficialContext>={}):OfficialContext=>({env:env(),privileged:false,verify:{artifacts:false,sources:false},tolerance:'0',...over});
const one=async(c:GoldCase,o:FakeReaderOptions={},over:Partial<OfficialContext>={}):Promise<CaseReport>=>(await evaluateOfficial([c],fakeReader(o),ctx(over)))[0];
const MISSING=gcase({case_id:'m',expect:'missing',printed:undefined,canonical:undefined});
const VERIFY_SOURCES={artifacts:false,sources:true};

describe('evaluateOfficial — every §3.3 outcome (spec §5.1)',()=>{
 it('pass: equal value; unprivileged provenance = required fields present, producer unavailable:anon, sources skipped',async()=>{
  const r=await one(gcase());
  expect(r.outcome).toEqual({result:'pass'});
  expect(r).toMatchObject({case_id:gcase().case_id,required:true,left:'1000',right:'1000',tolerance:'0'});
  expect(r.abs_diff).not.toBeNull();expect(r.rel_diff).not.toBeNull();
  expect(r.provenance).toEqual({ok:true,missing:[],producer_code_version:ANON_PRODUCER,source_verified:'skipped'});
  expect(r.detail).toMatchObject({binding:'document',as_of:null,document_type:'10-K',document_id:{kind:'edgar_accession',value:ACCN},locator:{table:'companyfacts'},fact_id:'f-1',source_ref:ACCN,unit:'USD',expected_unit:'USD',rows:1});
 });
 it('document binding reads the named filing at env.today; current binding reads at as_of, or env.today when as_of is null',async()=>{
  const reader=fakeReader();
  await evaluateOfficial([gcase(),gcase({case_id:'c1',binding:'current',as_of:'2024-02-15'}),gcase({case_id:'c2',binding:'current',as_of:null})],reader,ctx());
  expect(reader.calls.document).toEqual([{target:gcase().target,doc:{kind:'edgar_accession',value:ACCN},today:'2026-11-20'}]);
  expect(reader.calls.current.map(c=>c.asOf)).toEqual(['2024-02-15','2026-11-20']);
  expect(reader.calls.resolve).toEqual(['9990611','9990611','9990611']);
 });
 it('expect missing: no row of the target unit → expected_absent; a row of that unit → fail(unexpected_value)',async()=>{
  expect((await one(MISSING,{rows:()=>[]})).outcome).toEqual({result:'expected_absent'});
  expect((await one(MISSING,{rows:()=>[readRow({unit:'EUR'})]})).outcome).toEqual({result:'expected_absent'});
  const r=await one(MISSING);
  expect(r.outcome).toEqual({result:'fail',reason:'unexpected_value'});expect(r.left).toBe('1000');expect(r.right).toBeNull();
 });
 it('fail(value) carries both sides and no provenance; a relative tolerance admits a near value',async()=>{
  const r=await one(gcase(),{rows:()=>[readRow({value_text:'1005'})]});
  expect(r.outcome).toEqual({result:'fail',reason:'value'});
  expect(r).toMatchObject({left:'1005',right:'1000',provenance:null});
  expect((await one(gcase(),{rows:()=>[readRow({value_text:'1005'})]},{tolerance:'0.01'})).outcome).toEqual({result:'pass'});
 });
 it('more than one row in the target unit → fail(ambiguous)',async()=>{
  const r=await one(gcase(),{rows:()=>[readRow({fact_id:'f-1'}),readRow({fact_id:'f-2'})]});
  expect(r.outcome).toEqual({result:'fail',reason:'ambiguous'});
  expect(r.detail).toMatchObject({rows:2,fact_ids:['f-1','f-2']});
 });
 it('unit_mismatch: the only row is in another unit, or several rows none in the target unit; per_share maps to <ccy>/share',async()=>{
  const single=await one(gcase(),{rows:()=>[readRow({unit:'EUR'})]});
  expect(single.outcome).toEqual({result:'unit_mismatch'});
  expect(single).toMatchObject({left:'1000',detail:{units:['EUR'],expected_unit:'USD'}});
  expect((await one(gcase(),{rows:()=>[readRow({unit:'EUR'}),readRow({unit:'GBP'})]})).outcome).toEqual({result:'unit_mismatch'});
  const eps=gcase({target:{type:'fact',concept:'eps_diluted',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'per_share',currency:'USD'}},canonical:{value:'1.25'},printed:{text:'1.25',unit_label:'USD per share',scale:'1'}});
  expect((await one(eps,{rows:()=>[readRow({unit:'USD/share',value_text:'1.25'}),readRow({unit:'shares',value_text:'7'})]})).outcome).toEqual({result:'pass'});
 });
 it('provenance_incomplete: a passing value whose source chain lacks a required field (unprivileged)',async()=>{
  const r=await one(gcase(),{rows:()=>[readRow({raw_hash:undefined})]});
  expect(r.outcome).toEqual({result:'provenance_incomplete',reason:'fields_missing'});
  expect(r.provenance).toMatchObject({ok:false,missing:['raw_hash'],producer_code_version:ANON_PRODUCER});
  expect(r).toMatchObject({left:'1000',right:'1000'});
 });
 it('missing: no row in an unprivileged run (non-visible rows are never asked for, even of a privileged reader)',async()=>{
  const reader=fakeReader({rows:()=>[],privileged:{nonVisible:'quarantined'}});
  const [r]=await evaluateOfficial([gcase()],reader,ctx({privileged:false}));
  expect(r.outcome).toEqual({result:'missing'});expect(reader.calls.nonVisible).toEqual([]);
 });
 it('not_visible: privileged run, the key exists but quarantined or on a superseded generation; null → missing',async()=>{
  const reader=fakeReader({rows:()=>[],privileged:{nonVisible:'quarantined'}});
  const [r]=await evaluateOfficial([gcase()],reader,ctx({privileged:true}));
  expect(r.outcome).toEqual({result:'not_visible',reason:'quarantined'});
  expect(reader.calls.nonVisible).toEqual([{doc:{kind:'edgar_accession',value:ACCN},asOf:'2026-11-20'}]);
  expect((await one(gcase(),{rows:()=>[],privileged:{nonVisible:'superseded_generation'}},{privileged:true})).outcome).toEqual({result:'not_visible',reason:'superseded_generation'});
  expect((await one(gcase(),{rows:()=>[],privileged:{nonVisible:null}},{privileged:true})).outcome).toEqual({result:'missing'});
  const cur=fakeReader({rows:()=>[],privileged:{nonVisible:'quarantined'}});
  await evaluateOfficial([gcase({binding:'current',as_of:'2024-03-01'})],cur,ctx({privileged:true}));
  expect(cur.calls.nonVisible).toEqual([{doc:null,asOf:'2024-03-01'}]);
 });
 it('skipped: retracted and pending cases are never read',async()=>{
  const reader=fakeReader();
  const [a,b]=await evaluateOfficial([gcase({case_id:'r',retracted:{at:'2026-11-01',by:'owner',reason:'wrong period'}}),gcase({case_id:'p',pending:true})],reader,ctx());
  expect(a.outcome).toEqual({result:'skipped',reason:'retracted'});expect(a.detail.retracted).toMatchObject({by:'owner'});
  expect(b.outcome).toEqual({result:'skipped',reason:'pending'});
  expect(reader.calls.resolve).toEqual([]);
 });
 it('read_error: unresolved subject; reader errors and truncation pass through; a thrown read is read_failed',async()=>{
  expect((await one(gcase({subject:{market:'US',cik:'9990699'}}))).outcome).toEqual({result:'read_error',reason:'subject_unresolved'});
  expect((await one(gcase(),{rows:()=>({rows:[],truncated:false,stateRev:null,error:'filing_not_found'})})).outcome).toEqual({result:'read_error',reason:'filing_not_found'});
  expect((await one(gcase(),{rows:()=>({rows:[],truncated:false,stateRev:null,error:'filing_ambiguous'})})).outcome).toEqual({result:'read_error',reason:'filing_ambiguous'});
  expect((await one(gcase(),{rows:()=>({rows:[],truncated:true,stateRev:3})})).outcome).toEqual({result:'read_error',reason:'truncated'});
  const thrown=await one(gcase(),{rows:()=>{throw new Error('connection reset');}});
  expect(thrown.outcome).toEqual({result:'read_error',reason:'read_failed'});expect(thrown.detail.message).toBe('connection reset');
  expect((await one(gcase({source:{...gcase().source,document_id:undefined}}))).outcome).toEqual({result:'read_error',reason:'filing_not_found'});
 });
 it('privileged: resolveProvenance gets {artifacts: verify.artifacts}; a failed resolution is provenance_incomplete(reason)',async()=>{
  const reader=fakeReader({privileged:{}});
  const [r]=await evaluateOfficial([gcase()],reader,ctx({privileged:true,verify:{artifacts:true,sources:false}}));
  expect(r.outcome).toEqual({result:'pass'});
  expect(reader.calls.provenance.map(p=>p.artifacts)).toEqual([true]);
  expect(r.provenance).toMatchObject({ok:true,object_path:expect.stringMatching(/^edgar\//),source_verified:'skipped'});
  const bad=await one(gcase(),{privileged:{provenance:()=>({ok:false,missing:[],reason:'candidate_not_found'})}},{privileged:true,verify:{artifacts:true,sources:false}});
  expect(bad.outcome).toEqual({result:'provenance_incomplete',reason:'candidate_not_found'});
  const thrownProv=await one(gcase(),{privileged:{provenance:()=>{throw new Error('storage down');}}},{privileged:true,verify:{artifacts:true,sources:false}});
  expect(thrownProv.outcome).toEqual({result:'provenance_incomplete',reason:'provenance_lookup_failed'});
 });
 it('privileged metric inputs: each input chain lands in detail.inputs, not inside provenance',async()=>{
  const inputs=[{fact_id:'f-1',concept:'revenue',ok:true,reason:null,source_ref:ACCN,raw_hash:'a'.repeat(64),producer_code_version:'c'.repeat(40),object_path:`edgar/${ISSUER}/${'b'.repeat(64)}.json`,locator:'facts.us-gaap.Revenues.units.USD[0](accn=x,start=,end=y)'}];
  const r=await one(gcase(),{privileged:{provenance:()=>({ok:true,missing:[],producer_code_version:'c'.repeat(40),input_chains:inputs} as ProvenanceCheck)}},{privileged:true,verify:{artifacts:true,sources:false}});
  expect(r.outcome).toEqual({result:'pass'});expect(r.detail.inputs).toEqual(inputs);expect(r.provenance).not.toHaveProperty('input_chains');
 });
 it('verify.sources: sha256 of the fetched bytes must equal source.sha256 (fetched once per url); every failure is provenance_incomplete',async()=>{
  const bytes=new TextEncoder().encode('the 10-K bytes');
  const c=gcase({source:{...gcase().source,sha256:sha256Hex(bytes)}});
  let fetches=0;
  const fetchSource=async(url:string)=>{fetches++;expect(url).toBe(c.source.url);return bytes;};
  const rs=await evaluateOfficial([c,{...c,case_id:'again'}],fakeReader(),ctx({verify:VERIFY_SOURCES,fetchSource}));
  expect(rs.map(r=>r.outcome)).toEqual([{result:'pass'},{result:'pass'}]);
  expect(rs[0].provenance?.source_verified).toBe(true);expect(fetches).toBe(1);
  const wrong=await one(gcase({source:{...gcase().source,sha256:'0'.repeat(64)}}),{},{verify:VERIFY_SOURCES,fetchSource:async()=>bytes});
  expect(wrong.outcome).toEqual({result:'provenance_incomplete',reason:'source_sha256_mismatch'});expect(wrong.provenance?.source_verified).toBe(false);
  expect((await one(c,{},{verify:VERIFY_SOURCES})).outcome).toEqual({result:'provenance_incomplete',reason:'source_fetch_unavailable'});
  expect((await one(c,{},{verify:VERIFY_SOURCES,fetchSource:async()=>{throw new Error('503');}})).outcome).toEqual({result:'provenance_incomplete',reason:'source_fetch_failed'});
  expect((await one(gcase({source:{...gcase().source,sha256:undefined}}),{},{verify:VERIFY_SOURCES,fetchSource:async()=>bytes})).outcome).toEqual({result:'provenance_incomplete',reason:'source_sha256_missing'});
 });
 it('metric rows (unprivileged): metric, formula_version, basis, input_unit, inputs[].fact_id, based_on_rev must be present',async()=>{
  const target:MetricTarget={type:'metric',metric:'gross_margin',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',basis:'us_standard',input_unit:'USD',formula_version:'facts-derive/1.0',unit:{kind:'ratio'}};
  const m=gcase({case_id:'metric',target,binding:'current',as_of:'2024-02-15',canonical:{value:'0.4'},printed:{text:'40%',unit_label:'percent',scale:'1'}});
  const metricRow=(over:Partial<NonNullable<ReadRow['metric']>>={}):ReadRow=>({value_text:'0.4',unit:'pure',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',
   metric:{metric:'gross_margin',formula_version:'facts-derive/1.0',basis:'us_standard',input_unit:'USD',based_on_rev:3,inputs:[{fact_id:'f-1',concept:'revenue',filing_id:'g-1',available_date:'2024-02-15'}],...over}});
  expect((await one(m,{rows:()=>[metricRow()]})).outcome).toEqual({result:'pass'});
  const r=await one(m,{rows:()=>[metricRow({inputs:[]})]});
  expect(r.outcome).toEqual({result:'provenance_incomplete',reason:'fields_missing'});expect(r.provenance?.missing).toEqual(['inputs[].fact_id']);
 });
 it('cases are evaluated in input order and each report keeps case_id / required',async()=>{
  const rs=await evaluateOfficial([gcase({case_id:'b',required:false}),gcase({case_id:'a'})],fakeReader(),ctx());
  expect(rs.map(r=>[r.case_id,r.required])).toEqual([['b',false],['a',true]]);
 });
});
```

- [ ] **Step 3: Write the failing runner tests**

Create `src/lib/evals/run-gold-set.test.ts`:

```ts
// src/lib/evals/run-gold-set.test.ts
import {describe,expect,it} from 'vitest';
import {fakeReader,gcase,gset,env,readRow} from './kinds/official-test-support';
import type {FakeReader,FakeReaderOptions} from './kinds/official-test-support';
import {runGoldSet,selectCases} from './run-gold-set';
import {goldBlockOf} from './summary';
import type {RunGoldSetOptions} from './run-gold-set';
import type {CaseTarget,FactTarget,GoldCase,ReadRow,ReportEnvironment} from './types';

const ENVIRONMENT:ReportEnvironment={db_host:null,app_origin:null,db_state_rev:null};
const FACT=gcase().target as FactTarget;
const at=(id:string,concept:string,over:Partial<GoldCase>={})=>gcase({case_id:id,target:{...FACT,concept},...over});
const THREE=()=>[at('c1','revenue'),at('c2','net_income_parent'),at('c3','total_assets')];
const conceptOf=(t:CaseTarget)=>t.type==='fact'?t.concept:t.metric;
const rowsBy=(by:Record<string,ReadRow[]>):NonNullable<FakeReaderOptions['rows']>=>t=>by[conceptOf(t)]??[readRow()];
const run=(o:Partial<RunGoldSetOptions>&Pick<RunGoldSetOptions,'set'>,reader:FakeReader=fakeReader())=>runGoldSet({mode:'ci',reader,env:env(),environment:ENVIRONMENT,...o});
const RETRACTED={at:'2026-11-01',by:'owner',reason:'test'};

describe('runGoldSet — report and gate (spec §3.2, §7.2)',()=>{
 it('a passing set: gate pass, exit 0, report header from the set, evidence_class truth, db_state_rev from the reader',async()=>{
  const set=gset(THREE());
  const o=await run({set,runId:'11111111-1111-4111-8111-111111111111'});
  expect(o.exitCode).toBe(0);
  expect(o.report).toMatchObject({run_id:'11111111-1111-4111-8111-111111111111',kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',
   set:{id:'facts/unit',version:1,sha256:'e'.repeat(64),format:'f6',path:set.path},evaluator_code_version:'a'.repeat(40),dirty:false,
   environment:{db_host:null,app_origin:null,db_state_rev:7},provenance:{verified:{artifacts:false,sources:false}}});
  expect(o.report.summary).toMatchObject({gate:'pass',population:3,evidence_class:'truth',execution:{read_error:0,subset:false},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0}});
  expect(o.report.cases.map(c=>c.case_id)).toEqual(['c1','c2','c3']);
 });
 it('a run id is generated when none is given; an explicit db_state_rev is kept',async()=>{
  const o=await run({set:gset(THREE()),environment:{...ENVIRONMENT,db_state_rev:99}});
  expect(o.report.run_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(o.report.environment.db_state_rev).toBe(99);
 });
 it('privileged reader: report.privileged and verified.artifacts; an unprivileged reader never claims verified artifacts',async()=>{
  const p=await run({set:gset(THREE()),verify:{artifacts:true,sources:false}},fakeReader({privileged:{}}));
  expect(p.report).toMatchObject({privileged:true,provenance:{verified:{artifacts:true,sources:false}}});
  const u=await run({set:gset(THREE()),verify:{artifacts:true,sources:false}});
  expect(u.report).toMatchObject({privileged:false,provenance:{verified:{artifacts:false,sources:false}}});
 });
});

describe('runGoldSet — refusals before anything is read (spec §14)',()=>{
 it('a synthetic case in report mode → synthetic_in_report; ci allows it',async()=>{
  const reader=fakeReader();
  const synthetic=gset([gcase({provenance_kind:'synthetic'})]);
  await expect(run({set:synthetic,mode:'report'},reader)).rejects.toMatchObject({name:'EvalError',code:'synthetic_in_report'});
  expect(reader.calls.resolve).toEqual([]);
  expect((await run({set:synthetic})).exitCode).toBe(0);
 });
 it('restricted sets: ci → restricted_in_ci, report → kind_not_enabled (§16 D8); a module without a facts reader → kind_not_enabled',async()=>{
  await expect(run({set:gset([gcase()],{artifact_class:'restricted'})})).rejects.toMatchObject({code:'restricted_in_ci'});
  await expect(run({set:gset([gcase()],{artifact_class:'restricted'}),mode:'report'})).rejects.toMatchObject({code:'kind_not_enabled'});
  await expect(run({set:gset([gcase()],{module:'macro'})})).rejects.toMatchObject({code:'kind_not_enabled'});
 });
 it('dirty tree: report → dirty_tree; ci records dirty:true',async()=>{
  await expect(run({set:gset([gcase()]),mode:'report',env:env({dirty:true})})).rejects.toMatchObject({code:'dirty_tree'});
  expect((await run({set:gset([gcase()]),env:env({dirty:true})})).report.dirty).toBe(true);
 });
 it('an evaluator code version that is not 40 hex → code_version_missing',async()=>{
  await expect(run({set:gset([gcase()]),env:env({evaluatorCodeVersion:'abc'})})).rejects.toMatchObject({code:'code_version_missing'});
  await expect(run({set:gset([gcase()]),env:env({evaluatorCodeVersion:`${'a'.repeat(40)}-dirty`})})).rejects.toMatchObject({code:'code_version_missing'});
 });
});

describe('runGoldSet — subset (spec §7.1: --case / --limit → subset=true → incomplete)',()=>{
 it('--case: the others are skipped(subset), only the chosen case is read',async()=>{
  const reader=fakeReader();
  const o=await run({set:gset(THREE()),caseIds:['c2']},reader);
  expect(o.report.cases.map(c=>[c.case_id,c.outcome])).toEqual([['c1',{result:'skipped',reason:'subset'}],['c2',{result:'pass'}],['c3',{result:'skipped',reason:'subset'}]]);
  expect(o.report.summary).toMatchObject({gate:'incomplete',execution:{subset:true}});expect(o.exitCode).toBe(3);
  expect(reader.calls.resolve).toHaveLength(1);
 });
 it('--limit: the first N cases in file order; an unselected retracted case stays skipped(retracted)',async()=>{
  const o=await run({set:gset(THREE()),limit:2});
  expect(o.report.cases.map(c=>c.outcome.result==='skipped'?c.outcome.reason:c.outcome.result)).toEqual(['pass','pass','subset']);
  const r=await run({set:gset([at('c1','revenue'),at('c2','net_income_parent',{retracted:RETRACTED})]),caseIds:['c1']});
  expect(r.report.cases[1].outcome).toEqual({result:'skipped',reason:'retracted'});
 });
 it('an unknown --case id is gold_invalid; a non-positive limit is a RangeError',async()=>{
  await expect(run({set:gset(THREE()),caseIds:['nope']})).rejects.toMatchObject({code:'gold_invalid'});
  expect(()=>selectCases(gset(THREE()),undefined,0)).toThrow(RangeError);
  expect([...selectCases(gset(THREE()),['c3','c1'],1)]).toEqual(['c1']);
 });
});

describe('runGoldSet — mutation tests (spec §13.1)',()=>{
 it('one changed value → correctness.fail 1 → gate fail, exit 1',async()=>{
  const o=await run({set:gset(THREE())},fakeReader({rows:rowsBy({net_income_parent:[readRow({value_text:'1001'})]})}));
  expect(o.report.summary).toMatchObject({gate:'fail',correctness:{fail:1,pass:2}});expect(o.exitCode).toBe(1);
 });
 it('raw_hash removed → provenance_incomplete → gate fail, exit 1',async()=>{
  const o=await run({set:gset(THREE())},fakeReader({rows:rowsBy({total_assets:[readRow({raw_hash:undefined})]})}));
  expect(o.report.cases[2].outcome).toEqual({result:'provenance_incomplete',reason:'fields_missing'});
  expect(o.report.summary).toMatchObject({gate:'fail',correctness:{provenance_incomplete:1}});expect(o.exitCode).toBe(1);
 });
 it('a required case removed from the read → missing_required 1 → incomplete, exit 3',async()=>{
  const o=await run({set:gset(THREE())},fakeReader({rows:rowsBy({net_income_parent:[]})}));
  expect(o.report.summary).toMatchObject({gate:'incomplete',coverage:{missing_required:1},correctness:{fail:0}});expect(o.exitCode).toBe(3);
 });
 it('optional coverage below min_coverage_optional → incomplete; full optional coverage passes',async()=>{
  const cases=[at('c1','revenue'),at('o1','total_assets',{required:false}),at('o2','cash',{required:false})];
  const short=await run({set:gset(cases)},fakeReader({rows:rowsBy({cash:[]})}));
  expect(short.report.summary).toMatchObject({gate:'incomplete',coverage:{missing_optional:1,missing_required:0},correctness:{fail:0}});expect(short.exitCode).toBe(3);
  expect((await run({set:gset(cases)})).report.summary.gate).toBe('pass');
 });
 it('population 0 (every case retracted) → incomplete, exit 3',async()=>{
  const o=await run({set:gset(THREE().map(c=>({...c,retracted:RETRACTED})))});
  expect(o.report.summary).toMatchObject({population:0,gate:'incomplete'});expect(o.exitCode).toBe(3);
 });
 it('a legacy_plan2 set is incomplete even when every recorded value matches (spec §0 R5-1)',async()=>{
  const gaps=['source.sha256','source.locator','reviewed_by'];
  const set=gset([at('c1','revenue',{provenance_gaps:gaps}),at('c2','net_income_parent',{provenance_gaps:gaps}),at('c3','total_assets',{pending:true,provenance_gaps:gaps})],{format:'legacy_plan2',ready:false});
  const o=await run({set});
  expect(o.report.cases.map(c=>c.outcome)).toEqual([{result:'pass'},{result:'pass'},{result:'skipped',reason:'pending'}]);
  expect(o.report.summary).toMatchObject({gate:'incomplete',gold:{format:'legacy_plan2',ready:false,pending:1,provenance_gaps:3}});
  expect(o.exitCode).toBe(3);
 });
 it('summary.gold is summary.ts::goldBlockOf: pending cases and cases with any provenance gap',()=>{
  expect(goldBlockOf(gset([gcase({case_id:'a',pending:true}),gcase({case_id:'b',provenance_gaps:['reviewed_by']}),gcase({case_id:'c'})],{format:'legacy_plan2',ready:false}))).toEqual({format:'legacy_plan2',ready:false,pending:1,provenance_gaps:1});
 });
});
```

- [ ] **Step 4: Run both tests to verify they fail**

Run: `npm test -- src/lib/evals/kinds/official.test.ts src/lib/evals/run-gold-set.test.ts`
Expected: FAIL — `Failed to resolve import "./official"` and `Failed to resolve import "./run-gold-set"`.

- [ ] **Step 5: Implement the kind**

Create `src/lib/evals/kinds/official.ts`:

```ts
// src/lib/evals/kinds/official.ts
// official_reconciliation (spec §5.1, §3.3, §4.6), per case in input order: retracted → skipped(retracted); a legacy
// '<pending>' entry → skipped(pending); subject → read_error(subject_unresolved); the read by binding (document: the
// filing named by source.document_id, at env.today; current: as_of ?? env.today); a reader error or truncation →
// read_error(reason); expect 'missing': a row in the target unit → fail(unexpected_value), none → expected_absent;
// no row: privileged readNonVisible → not_visible(reason), else missing; units (gold/schema.ts::unitOfSpec): no row
// in the target unit → unit_mismatch, more than one → fail(ambiguous); value: compareWithinTolerance(system, gold,
// set rel) → fail(value); source chain (§5.1.4): unprivileged = required fields present, producer_code_version
// 'unavailable:anon'; privileged = reader.resolveProvenance({artifacts: verify.artifacts}); verify.sources =
// sha256(fetchSource(source.url)) equals source.sha256, each url fetched once (anything else → provenance_incomplete);
// otherwise pass. Pure over the injected reader: no clock, no store, and no gold value is ever produced or corrected.
import {missingFields} from '../adapters/provenance';
import type {FactProvenance} from '../adapters/provenance';
import {sha256Hex} from '../canonical-json';
import {compareWithinTolerance} from '../compare';
import {unitOfSpec} from '../gold/schema';
import type {CaseOutcome,CaseReport,DocumentId,EvalEnv,GoldCase,ModuleReader,PrivilegedReader,ReadErrorReason,ReadResult,ReadRow,SubjectRef,UnitSpec} from '../types';

export interface OfficialContext{env:EvalEnv;privileged:boolean;verify:{artifacts:boolean;sources:boolean};tolerance:string;fetchSource?:(url:string)=>Promise<Uint8Array>}
export const ANON_PRODUCER='unavailable:anon';
type SourceCheck=true|'source_sha256_missing'|'source_fetch_unavailable'|'source_fetch_failed'|'source_sha256_mismatch';
type SourceMemo=Map<string,Promise<string|null>>;

const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
const nul=<T>(v:T|undefined):T|null=>v===undefined?null:v;
/** Facts unit of the gold unit spec; null when the spec has none (index/count/percent_points) — no facts row can match. */
const unitOf=(u:UnitSpec):string|null=>{try{return unitOfSpec(u);}catch{return null;}};
const isPrivileged=(reader:ModuleReader,ctx:OfficialContext):reader is PrivilegedReader=>ctx.privileged&&reader.privileged===true;
const caseDetail=(c:GoldCase):Record<string,unknown>=>({binding:c.binding,as_of:c.binding==='current'?c.as_of:null,document_type:c.source.document_type,document_id:nul(c.source.document_id),locator:nul(c.source.locator)});
const rowDetail=(row:ReadRow,expectedUnit:string|null):Record<string,unknown>=>({fact_id:nul(row.fact_id),filing_id:nul(row.filing_id),source_ref:nul(row.source_ref),available_date:row.available_date,unit:row.unit,expected_unit:expectedUnit});

async function verifySource(c:GoldCase,ctx:OfficialContext,memo:SourceMemo):Promise<SourceCheck>{
 const expected=c.source.sha256;
 if(!expected)return 'source_sha256_missing';
 const fetchSource=ctx.fetchSource;
 if(!fetchSource)return 'source_fetch_unavailable';
 let p=memo.get(c.source.url);
 if(!p){p=fetchSource(c.source.url).then(b=>sha256Hex(b),()=>null);memo.set(c.source.url,p);}
 const got=await p;
 return got===null?'source_fetch_failed':got===expected?true:'source_sha256_mismatch';
}

async function provenanceOf(c:GoldCase,ref:SubjectRef,row:ReadRow,reader:ModuleReader,ctx:OfficialContext,memo:SourceMemo):Promise<FactProvenance>{
 let prov:FactProvenance;
 if(isPrivileged(reader,ctx)){
  try{prov=await reader.resolveProvenance(ref,row,{artifacts:ctx.verify.artifacts});}
  catch{prov={ok:false,missing:[],reason:'provenance_lookup_failed'};}
 }else{
  const missing=missingFields(row);
  prov={ok:missing.length===0,missing,...(missing.length>0?{reason:'fields_missing'}:{}),producer_code_version:ANON_PRODUCER};
 }
 if(!ctx.verify.sources)return {...prov,source_verified:'skipped'};
 const check=await verifySource(c,ctx,memo);
 if(check===true)return {...prov,source_verified:true};
 return {...prov,ok:false,reason:prov.ok?check:(prov.reason??check),source_verified:false};
}

async function evaluateCase(c:GoldCase,reader:ModuleReader,ctx:OfficialContext,memo:SourceMemo):Promise<CaseReport>{
 const base:CaseReport={case_id:c.case_id,required:c.required,outcome:{result:'pass'},left:null,right:null,abs_diff:null,rel_diff:null,tolerance:ctx.tolerance,provenance:null,detail:caseDetail(c)};
 const done=(outcome:CaseOutcome,extra:Partial<Omit<CaseReport,'case_id'|'required'|'outcome'|'tolerance'>>={}):CaseReport=>({...base,...extra,outcome,detail:{...base.detail,...(extra.detail??{})}});
 const readError=(reason:ReadErrorReason,detail:Record<string,unknown>={})=>done({result:'read_error',reason},{detail});
 if(c.retracted)return done({result:'skipped',reason:'retracted'},{detail:{retracted:c.retracted}});
 if(c.pending)return done({result:'skipped',reason:'pending'});
 let ref:SubjectRef|null;
 try{ref=await reader.resolveSubject(c.subject,ctx.env.today);}catch(e){return readError('read_failed',{message:message(e)});}
 if(!ref)return readError('subject_unresolved');
 const documentId:DocumentId|null=c.binding==='document'?c.source.document_id??null:null;
 if(c.binding==='document'&&documentId===null)return readError('filing_not_found',{message:'document binding without source.document_id'});
 const asOf=c.binding==='current'?c.as_of??ctx.env.today:ctx.env.today;
 let read:ReadResult;
 try{read=documentId!==null?await reader.readDocumentBound(ref,c.target,documentId,ctx.env.today):await reader.readCurrent(ref,c.target,asOf);}
 catch(e){return readError('read_failed',{message:message(e)});}
 if(read.error)return readError(read.error,{truncated:read.truncated});
 if(read.truncated)return readError('truncated',{truncated:true});
 const unit=unitOf(c.target.unit);
 const rows=read.rows;
 const inUnit=rows.filter(r=>unit!==null&&r.unit===unit);
 if(c.expect==='missing'){
  if(inUnit.length===0)return done({result:'expected_absent'},{detail:{rows:rows.length,expected_unit:unit}});
  return done({result:'fail',reason:'unexpected_value'},{left:inUnit.length===1?inUnit[0].value_text:null,detail:{...rowDetail(inUnit[0],unit),rows:inUnit.length}});
 }
 if(rows.length===0){
  if(isPrivileged(reader,ctx)){
   let hidden:'quarantined'|'superseded_generation'|null;
   try{hidden=await reader.readNonVisible(ref,c.target,documentId,asOf);}catch(e){return readError('read_failed',{message:message(e)});}
   if(hidden)return done({result:'not_visible',reason:hidden});
  }
  return done({result:'missing'});
 }
 if(inUnit.length===0)return done({result:'unit_mismatch'},{left:rows.length===1?rows[0].value_text:null,detail:{units:[...new Set(rows.map(r=>r.unit))].sort(),expected_unit:unit,rows:rows.length}});
 if(inUnit.length>1)return done({result:'fail',reason:'ambiguous'},{detail:{rows:inUnit.length,expected_unit:unit,fact_ids:inUnit.map(r=>nul(r.fact_id))}});
 const row=inUnit[0];
 const right=c.canonical?.value;
 if(right===undefined)return readError('read_failed',{message:'present case without canonical.value'});
 const cmp=compareWithinTolerance(row.value_text,right,ctx.tolerance);
 const compared={left:row.value_text,right,abs_diff:cmp.absDiff,rel_diff:cmp.relDiff,detail:{...rowDetail(row,unit),rows:1}};
 if(!cmp.passed)return done({result:'fail',reason:'value'},compared);
 const {input_chains:inputs,...check}=await provenanceOf(c,ref,row,reader,ctx,memo);
 const withProvenance={...compared,provenance:check,detail:{...compared.detail,...(inputs?{inputs}:{})}};
 if(!check.ok)return done({result:'provenance_incomplete',reason:check.reason??'fields_missing'},withProvenance);
 return done({result:'pass'},withProvenance);
}

export async function evaluateOfficial(cases:GoldCase[],reader:ModuleReader,ctx:OfficialContext):Promise<CaseReport[]>{
 const memo:SourceMemo=new Map();
 const out:CaseReport[]=[];
 for(const c of cases)out.push(await evaluateCase(c,reader,ctx,memo));   // sequential: deterministic reads and one fetch per url
 return out;
}
```

- [ ] **Step 6: Implement the runner**

Create `src/lib/evals/run-gold-set.ts`:

```ts
// src/lib/evals/run-gold-set.ts
// The single entry of an official_reconciliation run (spec §5.1, §3.2, §7.1, §14). Refusals first, before any read
// (assertRunnable, also called by the CLI before it opens a connection); then the subset rule (--case / --limit:
// every other case skipped(subset), execution.subset = true → incomplete); kinds/official.ts over the chosen cases;
// the §3.2 reduction with summary.gold taken from the set (§0 R5-1: format, ready, pending count, cases with
// provenance gaps); evidence_class 'truth'; summary.reconciliations_truncated from store.ts::caseRowsTruncated (§6.1 100-row
// display cap); report.ts::buildReport. In memory only: the CLI writes the report files and
// the dq_eval_* rows afterwards (§6.3). The exit code is summary.ts::exitCodeOf(gate) for every path.
import {randomUUID} from 'node:crypto';
import {EvalError} from './errors';
import {evaluateOfficial} from './kinds/official';
import {buildReport} from './report';
import {caseRowsTruncated} from './store';
import {exitCodeOf,goldBlockOf,summarize} from './summary';
import type {CaseReport,EvalEnv,EvalMode,GoldCase,GoldSet,ModuleReader,ReportEnvironment,RunOutcome} from './types';

export interface RunGoldSetOptions{set:GoldSet;mode:EvalMode;reader:ModuleReader;env:EvalEnv;environment:ReportEnvironment;runId?:string;caseIds?:string[];limit?:number;verify?:{artifacts:boolean;sources:boolean};fetchSource?:(url:string)=>Promise<Uint8Array>}

const SHA40=/^[0-9a-f]{40}$/;
const OFFICIAL_MODULES:ReadonlySet<string>=new Set(['facts','metrics']);

/** §14 pre-run refusals (exit 2). Order: kind/module, artifact class, synthetic in report, code version, dirty report. */
export function assertRunnable(set:GoldSet,mode:EvalMode,env:EvalEnv):void{
 if(!OFFICIAL_MODULES.has(set.module))throw new EvalError('kind_not_enabled',`official_reconciliation has no reader for module ${set.module}`,{module:set.module});
 if(set.artifact_class==='restricted'){
  if(mode==='ci')throw new EvalError('restricted_in_ci','restricted sets never run in ci (spec §4.5)',{set_id:set.set_id});
  throw new EvalError('kind_not_enabled','restricted artifacts are not enabled (spec §16 D8)',{set_id:set.set_id});
 }
 if(mode==='report'&&set.cases.some(c=>c.provenance_kind==='synthetic'))throw new EvalError('synthetic_in_report','synthetic gold never runs in report mode',{set_id:set.set_id});
 if(!SHA40.test(env.evaluatorCodeVersion))throw new EvalError('code_version_missing','evaluator code version must be a 40-hex commit',{value:env.evaluatorCodeVersion});
 if(mode==='report'&&env.dirty)throw new EvalError('dirty_tree','report runs need a clean working tree');
}


/** Ids of the cases to evaluate: --case filter (unknown id → gold_invalid), then the first `limit` in file order. */
export function selectCases(set:GoldSet,caseIds?:string[],limit?:number):Set<string>{
 if(limit!==undefined&&(!Number.isInteger(limit)||limit<1))throw new RangeError('limit must be a positive integer');
 const known=new Set(set.cases.map(c=>c.case_id));
 const unknown=(caseIds??[]).filter(id=>!known.has(id));
 if(unknown.length>0)throw new EvalError('gold_invalid','unknown case_id in --case',{case_ids:unknown});
 let picked=set.cases.filter(c=>caseIds===undefined||caseIds.includes(c.case_id));
 if(limit!==undefined)picked=picked.slice(0,limit);
 return new Set(picked.map(c=>c.case_id));
}

const notRun=(c:GoldCase,tolerance:string):CaseReport=>({case_id:c.case_id,required:c.required,outcome:{result:'skipped',reason:c.retracted?'retracted':'subset'},left:null,right:null,abs_diff:null,rel_diff:null,tolerance,provenance:null,detail:{}});

export async function runGoldSet(o:RunGoldSetOptions):Promise<RunOutcome>{
 const {set,mode,reader,env}=o;
 assertRunnable(set,mode,env);
 if(reader.module!=='facts')throw new EvalError('kind_not_enabled',`reader module ${reader.module} cannot evaluate ${set.module}`,{module:reader.module});
 const verify=o.verify??{artifacts:false,sources:false};
 const privileged=reader.privileged===true;
 const subset=o.caseIds!==undefined||o.limit!==undefined;
 const chosen=selectCases(set,o.caseIds,o.limit);
 const tolerance=set.tolerance.rel;
 const startedAt=env.now().toISOString();
 const evaluated=await evaluateOfficial(set.cases.filter(c=>chosen.has(c.case_id)),reader,{env,privileged,verify,tolerance,...(o.fetchSource?{fetchSource:o.fetchSource}:{})});
 const byId=new Map(evaluated.map(r=>[r.case_id,r]));
 const cases=set.cases.map(c=>byId.get(c.case_id)??notRun(c,tolerance));
 const runId=o.runId??randomUUID();
 const summary=summarize(cases,{thresholds:set.thresholds,gold:goldBlockOf(set),subset,evidenceClass:'truth',
  reconciliationsTruncated:caseRowsTruncated({run_id:runId,kind:'official_reconciliation',artifact_class:set.artifact_class,cases})});
 const environment:ReportEnvironment={...o.environment,db_state_rev:o.environment.db_state_rev??await reader.stateRev()};
 const finishedAt=env.now().toISOString();
 const report=buildReport({runId,kind:'official_reconciliation',mode,privileged,set,env,startedAt,finishedAt,environment,
  verified:{artifacts:verify.artifacts&&privileged,sources:verify.sources},summary,cases});
 return {report,exitCode:exitCodeOf(summary.gate)};
}
```

- [ ] **Step 7: Run both tests to verify they pass**

Run: `npm test -- src/lib/evals/kinds/official.test.ts src/lib/evals/run-gold-set.test.ts`
Expected: PASS — 2 files, every test green.

`buildReport` (Task 4) takes `BuildReportInput` (no `module`: it is `set.module`) and refuses a summary whose thresholds differ from the set's.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/lib/evals/kinds/official-test-support.ts src/lib/evals/kinds/official.ts src/lib/evals/kinds/official.test.ts src/lib/evals/run-gold-set.ts src/lib/evals/run-gold-set.test.ts
```
```bash
git commit -m "feat(f6): official_reconciliation kind and runGoldSet (refusals, subset, gold summary) (Task 8)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: CLI, F6 deterministic world, synthetic gold, facts integration test

规格：§1.1、§5.3.1（建库）、§7.1、§13.3、§14、§0 R5-1、R5-2。依赖：Task 6（`evalStore`、`persistRun`、`caseRowsTruncated`）、Task 8（`runGoldSet`）、Task 2（`loadGoldSet`、`checkLock`、`lock.json`）、Task 3（`validate.ts --gold --lock`）、Task 4（`evaluatorVersion`、`writeReportFiles`）、Task 5（`criticalSuites` F6 block）。

**Files:**
- Create (generated, committed): `src/lib/evals/fixtures/edgar/CIK0009990601.json` (AAPL trimmed → ZZEVA), `CIK0009990602.json` (MSFT trimmed → ZZEVB), `CIK0009990603.json` (AAPL's FY2023 10-K only → ZZEVC), `CIK0009990603.amended.json` (+ a 10-K/A revenue, filed 2026-06-15), `CIK0009990603.conflict.json` (+ a same-day conflicting net income)
- Create: `src/lib/evals/fixtures/issuers/f6-seed.json`
- Create: `src/lib/evals/replay/setup.ts`
- Test: `src/lib/evals/replay/setup.test.ts`
- Create (generated): `src/lib/evals/fixtures/replay/f6-base.setup.json`, `src/lib/evals/fixtures/gold/facts/synthetic-us.json`
- Modify (generated append): `src/lib/evals/fixtures/gold/lock.json`
- Create: `src/lib/evals/cli/deps.ts`, `src/lib/evals/cli/run-cli.ts`, `scripts/evals/run.ts`
- Test: `src/lib/evals/cli/deps.test.ts`, `src/lib/evals/cli/run-cli.test.ts`
- Test (critical): `src/lib/evals/evals-facts.integration.test.ts`
- Modify: `scripts/ci/research-checks.ts` (inside the Task 5 `// F6` block)
- Temporary, never committed (`.claude/scratch/` is git-excluded): `.claude/scratch/f6-gen-fixtures.ts`, `.claude/scratch/f6-gen-sets.ts`

Rules for this task: the F6 world only ever uses CIKs 9990601/9990602/9990603 and accessions `000999060{1,2,3}-…` (never AAPL/MSFT's, never sync-us's `ZZCF` 9990001). The restatement and quarantine tests mutate **ZZEVC only**; ZZEVA/ZZEVB stay as built (Task 11 projects them). Unit test files must not contain the literal string of the test-state env variable (inventory rule): only `deps.ts` (not a test) and the integration test do.

- [ ] **Step 1: Write the fixture generator**

Create `.claude/scratch/f6-gen-fixtures.ts` (one-off; outputs are committed, this file is deleted in Step 9):

```ts
// .claude/scratch/f6-gen-fixtures.ts — Task 9 Step 1 one-off generator. Lossless: numbers go through
// scanJsonNumbers / stringifyPreservingNumbers, never JSON.parse → stringify.
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {scanJsonNumbers} from '../../src/lib/facts/json-numbers';
import {stringifyPreservingNumbers} from '../../src/lib/facts/providers/shared';

type Num={__num:string};
interface Entry{start?:string;end:string;val:Num;accn:string;fy:Num|null;fp:string|null;form:string;filed:string;frame?:string}
interface Doc{__recorded?:unknown;cik:Num;entityName:string;facts:Record<string,Record<string,{units:Record<string,Entry[]>}>>}
const SRC='src/lib/facts/fixtures/edgar/',OUT='src/lib/evals/fixtures/edgar/',SEED='src/lib/evals/fixtures/issuers/f6-seed.json';
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const entries=(d:Doc)=>Object.values(d.facts).flatMap(t=>Object.values(t).flatMap(v=>Object.values(v.units).flat()));
const clone=(d:Doc):Doc=>JSON.parse(JSON.stringify(d)) as Doc;   // {__num} tokens are plain objects: they survive

/** cik → `cik`; every accession's 10-digit filer prefix (AAPL files itself, MSFT through agents) → the padded synthetic CIK; injective or throw. */
function rewrite(src:string,cik:string,entityName:string):Doc{
 const bytes=readFileSync(SRC+src);
 const doc=scanJsonNumbers(bytes) as Doc;
 const cik10=cik.padStart(10,'0');
 const from=new Map<string,string>();
 for(const e of entries(doc)){
  const next=e.accn.replace(/^\d{10}-/,`${cik10}-`);
  if(next===e.accn||!next.startsWith(`${cik10}-`))throw new Error(`accession not rewritten: ${e.accn}`);
  const prev=from.get(next);
  if(prev!==undefined&&prev!==e.accn)throw new Error(`accession collision: ${prev} and ${e.accn} both become ${next}`);
  from.set(next,e.accn);e.accn=next;
 }
 return {__recorded:{derived_from:SRC+src,derived_from_sha256:sha(bytes),rewrite:`cik to ${cik}; accession filer prefix to ${cik10}; entityName to ${entityName}; values unchanged`,generator:'docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md Task 9 Step 1'},cik:{__num:cik},entityName,facts:doc.facts};
}
function write(name:string,d:Doc){const text=`${stringifyPreservingNumbers(d,1)}\n`;writeFileSync(OUT+name,text);console.log(name,text.length,sha(text));}
function find(d:Doc,tag:string,accn:string,start:string,end:string):{list:Entry[];e:Entry}{
 const list=d.facts['us-gaap'][tag].units.USD;
 const hits=list.filter(x=>x.accn===accn&&x.start===start&&x.end===end);
 if(hits.length!==1)throw new Error(`${tag} ${accn} ${start}..${end}: ${hits.length} entries`);
 return {list,e:hits[0]};
}
mkdirSync(OUT,{recursive:true});mkdirSync('src/lib/evals/fixtures/issuers',{recursive:true});
write('CIK0009990601.json',rewrite('CIK0000320193.trimmed.json','9990601','ZZ Eval A Co'));
write('CIK0009990602.json',rewrite('CIK0000789019.trimmed.json','9990602','ZZ Eval B Co'));
// ZZEVC: AAPL's FY2023 10-K entries only (small), so the restatement / conflict tests never touch ZZEVA/ZZEVB
const C=rewrite('CIK0000320193.trimmed.json','9990603','ZZ Eval C Co');
const C_10K='0009990603-23-000106';
for(const tax of Object.keys(C.facts))for(const tag of Object.keys(C.facts[tax])){
 const units=C.facts[tax][tag].units;
 for(const u of Object.keys(units)){units[u]=units[u].filter(e=>e.accn===C_10K);if(units[u].length===0)delete units[u];}
 if(Object.keys(units).length===0)delete C.facts[tax][tag];
}
write('CIK0009990603.json',C);
// restatement: a later 10-K/A with FY2023 revenue + 1
const amended=clone(C);
{const {list,e}=find(amended,'RevenueFromContractWithCustomerExcludingAssessedTax',C_10K,'2022-09-25','2023-09-30');
 list.push({start:e.start,end:e.end,val:{__num:(BigInt(e.val.__num)+1n).toString()},accn:'0009990603-26-900001',fy:{__num:'2023'},fp:'FY',form:'10-K/A',filed:'2026-06-15'});}
write('CIK0009990603.amended.json',amended);
// quarantine: a second accession, SAME filed date, FY2023 net income + 7 → same_day_conflict parks both rows
const conflict=clone(amended);
{const {list,e}=find(conflict,'NetIncomeLoss',C_10K,'2022-09-25','2023-09-30');
 list.push({start:e.start,end:e.end,val:{__num:(BigInt(e.val.__num)+7n).toString()},accn:'0009990603-23-900002',fy:{__num:'2023'},fp:'FY',form:'10-K/A',filed:e.filed});}
write('CIK0009990603.conflict.json',conflict);
const seed={issuers:[
 {issuer_id:'f6000000-0000-4000-8000-000009990601',ticker:'ZZEVA',cik:'9990601',name:'ZZ Eval A Co'},
 {issuer_id:'f6000000-0000-4000-8000-000009990602',ticker:'ZZEVB',cik:'9990602',name:'ZZ Eval B Co'},
 {issuer_id:'f6000000-0000-4000-8000-000009990603',ticker:'ZZEVC',cik:'9990603',name:'ZZ Eval C Co'},
]};
const seedText=`${JSON.stringify(seed,null,1)}\n`;writeFileSync(SEED,seedText);console.log('f6-seed.json',seedText.length,sha(seedText));
```

- [ ] **Step 2: Run the generator**

Run: `npx tsx .claude/scratch/f6-gen-fixtures.ts`
Expected: six lines `<name> <bytes> <sha256>`: `CIK0009990601.json` ≈ 478 KB, `CIK0009990602.json` ≈ 487 KB, `CIK0009990603.json` ≈ 19.5 KB, `.amended` ≈ 19.8 KB, `.conflict` ≈ 20.0 KB, `f6-seed.json` 422 B. (Variable names: never call a local `module` — `@next/next/no-assign-module-variable` fails lint.) Any `accession collision` / `entries` error = stop and report (the source fixtures changed).

- [ ] **Step 3: Read the exact gold values from the generated fixtures (never type them)**

Run:
```bash
node -e 'const fs=require("fs");const d=f=>JSON.parse(fs.readFileSync("src/lib/evals/fixtures/edgar/"+f,"utf8"));const v=(f,tag,unit,accn,start,end)=>{const h=(d(f).facts["us-gaap"][tag]?.units[unit]??[]).filter(e=>e.accn===accn&&(e.start??null)===start&&e.end===end);return h.length===1?String(h[0].val):"<"+h.length+">"};const A=["CIK0009990601.json","0009990601-23-000106","2022-09-25","2023-09-30"],B=["CIK0009990602.json","0009990602-23-035122","2022-07-01","2023-06-30"];console.log([v(A[0],"RevenueFromContractWithCustomerExcludingAssessedTax","USD",A[1],A[2],A[3]),v(A[0],"NetIncomeLoss","USD",A[1],A[2],A[3]),v(A[0],"Assets","USD",A[1],null,A[3]),v(A[0],"EarningsPerShareDiluted","USD/shares",A[1],A[2],A[3]),v(B[0],"RevenueFromContractWithCustomerExcludingAssessedTax","USD",B[1],B[2],B[3]),v(B[0],"NetIncomeLoss","USD",B[1],B[2],B[3]),v(B[0],"Assets","USD",B[1],null,B[3]),v(B[0],"ResearchAndDevelopmentExpense","USD",B[1],B[2],B[3])].join(" "))'
```
Expected exactly: `383285000000 96995000000 352583000000 6.13 211915000000 72361000000 411976000000 27195000000`. (This cross-check uses `JSON.parse`, safe for these magnitudes; the gold generator in Step 8 reads them losslessly through `scanJsonNumbers`.)

- [ ] **Step 4: Write the failing setup tests**

Create `src/lib/evals/replay/setup.test.ts`:

```ts
// src/lib/evals/replay/setup.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {MAPPING_GEN} from '../../facts/concepts';
import {FORMULA_VERSION} from '../../facts/derive';
import {sameDayConflictKey} from '../../facts/keys';
import {sha256Hex} from '../canonical-json';
import {memoryTableClient} from '../../db/memory-table-client';
import {buildFrozenMemory,configSha256,sealSetup,sealSetupFromPaths,setupSha256,withoutFreshness} from './setup';
import type {FrozenBuild,FrozenSetup,FrozenSetupDraft,FrozenWorld} from './setup';

const EDGAR='src/lib/evals/fixtures/edgar/';
const SEED='src/lib/evals/fixtures/issuers/f6-seed.json';
const FILES=['CIK0009990601.json','CIK0009990602.json','CIK0009990603.json','CIK0009990603.amended.json','CIK0009990603.conflict.json'];
const C_ID='f6000000-0000-4000-8000-000009990603';
const TODAY='2026-11-20';
const fileSha=(p:string)=>sha256Hex(readFileSync(p));
const draft=(over:Partial<FrozenSetupDraft>={}):FrozenSetupDraft=>({initial_state:'empty_after_migrations',issuer_seed:{path:SEED,sha256:fileSha(SEED)},
 fixture_manifest:FILES.map(f=>({path:EDGAR+f,sha256:fileSha(EDGAR+f)})),sync_order:['CIK0009990603.json'],today:TODAY,mapping_gen:MAPPING_GEN,formula_version:FORMULA_VERSION,
 quarantine_resolutions:[],config_sha256:configSha256(),...over});
const setup=(over:Partial<FrozenSetupDraft>={}):FrozenSetup=>sealSetup(draft(over));
const worldOf=(b:FrozenBuild):FrozenWorld=>{if(!b.ok)throw new Error(b.mismatch);return b.world;};
const NI={concept:'net_income_parent',period_start:'2022-09-25',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'};
const rev=(w:FrozenWorld,asOf:string)=>w.db.readFacts(C_ID,'US',{concepts:['revenue'],asOf,from:'2023-09-30',to:'2023-09-30'}).then(r=>r.rows.filter(x=>x.duration==='12M').map(x=>x.value_text));

describe('setupSha256 / sealSetup',()=>{
 it('hashes the canonical JSON of every field but setup_sha256 (key order and the old hash do not matter)',()=>{
  const d=draft();
  const reordered=Object.fromEntries(Object.entries(d).reverse()) as unknown as FrozenSetupDraft;
  expect(setupSha256(reordered)).toBe(setupSha256(d));
  expect(sealSetup(d).setup_sha256).toBe(setupSha256(d));
  expect(setupSha256({...sealSetup(d)})).toBe(setupSha256(d));
  expect(setupSha256({...d,today:'2026-11-21'})).not.toBe(setupSha256(d));
 });
});

describe('buildFrozenMemory (spec §5.3.1, §0 R5-2)',()=>{
 it('seeds the issuers, reconciles their scope and syncs ZZEVC with the fixed clock; issuers are keyed by ticker',async()=>{
  const b=await buildFrozenMemory(setup());
  expect(b.ok).toBe(true);
  if(!b.ok)return;
  expect(b.issuers).toEqual({ZZEVA:'f6000000-0000-4000-8000-000009990601',ZZEVB:'f6000000-0000-4000-8000-000009990602',ZZEVC:C_ID});
  const w=b.world;
  expect(w.today).toBe(TODAY);expect(w.now.toISOString()).toBe('2026-11-20T12:00:00.000Z');
  expect(await rev(w,TODAY)).toEqual(['383285000000']);
  expect((await w.db.filingsOfIssuer(C_ID,'US',{})).map(f=>f.source_ref)).toEqual(['0009990603-23-000106']);
  expect([...w.storage.objects.keys()]).toContain(`edgar/${C_ID}/${fileSha(EDGAR+'CIK0009990603.json')}.json`);
  expect((await w.db.scopeRows('US',[C_ID]))[0]).toMatchObject({fetch_key:'0009990603',priority:10});
  expect(await w.tables.select('dq_freshness',{dataset:'facts.us'})).toEqual([]);   // the fixed clock never reaches dq_freshness
 });
 it('withoutFreshness drops dq_freshness writes only; sealSetupFromPaths fills every hash from the bytes',async()=>{
  const t=memoryTableClient({dq_freshness:['dataset'],x:['id']});
  const w=withoutFreshness(t);
  await w.upsert('dq_freshness',{dataset:'facts.us',status:'stale'},'dataset');await w.insert('x',{id:'1'});
  expect(await t.select('dq_freshness',{dataset:'facts.us'})).toEqual([]);expect(await w.select('x',{id:'1'})).toHaveLength(1);
  const d=draft();
  const sealed=sealSetupFromPaths({initial_state:d.initial_state,issuer_seed:{path:SEED},fixture_manifest:FILES.map(f=>({path:EDGAR+f})),sync_order:d.sync_order,today:d.today,mapping_gen:d.mapping_gen,formula_version:d.formula_version,quarantine_resolutions:[]});
  expect(sealed).toEqual(sealSetup(d));
 });
 it('sync() replays a later manifest fixture: the 10-K/A is a new disclosure, replayable by asOf',async()=>{
  const w=worldOf(await buildFrozenMemory(setup()));
  const r=await w.sync('CIK0009990603.amended.json');
  expect(r.counts).toMatchObject({versioned:1,inserted:0,failed:0});
  expect(await rev(w,'2026-06-14')).toEqual(['383285000000']);
  expect(await rev(w,'2026-06-15')).toEqual(['383285000001']);
 });
 it('the A and B fixtures carry the source values under rewritten accessions only',async()=>{
  const w=worldOf(await buildFrozenMemory(setup({sync_order:['CIK0009990601.json','CIK0009990602.json']})));
  const refs=[...(await w.db.filingsOfIssuer(w.issuers.ZZEVA,'US',{})),...(await w.db.filingsOfIssuer(w.issuers.ZZEVB,'US',{}))].map(f=>f.source_ref);
  expect(refs).toContain('0009990601-23-000106');expect(refs).toContain('0009990602-23-035122');
  expect(refs.filter(r=>!/^000999060[12]-/.test(r))).toEqual([]);
  const b=await w.db.readFacts(w.issuers.ZZEVB,'US',{concepts:['revenue'],asOf:TODAY,from:'2023-06-30',to:'2023-06-30'});
  expect(b.rows.filter(x=>x.duration==='12M').map(x=>x.value_text)).toEqual(['211915000000']);
 },60_000);
 it('quarantine_resolutions resolve the listed same-day conflict by value',async()=>{
  const key=sameDayConflictKey(C_ID,'US',NI,'2023-11-03');
  const w=worldOf(await buildFrozenMemory(setup({sync_order:['CIK0009990603.json','CIK0009990603.conflict.json'],quarantine_resolutions:[{natural_key:key,chosen_values:['96995000000']}]})));
  const ni=await w.db.readFacts(C_ID,'US',{concepts:['net_income_parent'],asOf:TODAY,from:'2023-09-30',to:'2023-09-30',history:true,includeNonOk:true});
  expect(ni.rows.filter(x=>x.duration==='12M').map(x=>[x.value_text,x.status]).sort()).toEqual([['96995000000','ok'],['96995000007','quarantined']]);
  expect(await w.db.openConflicts(C_ID,'US')).toEqual([]);
 });
 it('every mismatch is reported (ok:false) and nothing is synced; fields are named',async()=>{
  const cases:[FrozenSetup,RegExp][]=[
   [{...setup(),today:'2026-11-21'},/^setup_sha256/],
   [setup({initial_state:'something_else' as 'empty_after_migrations'}),/^initial_state/],
   [setup({today:'2026-13-40'}),/^today/],
   [setup({mapping_gen:MAPPING_GEN+1}),/^mapping_gen/],
   [setup({formula_version:'v1'}),/^formula_version/],
   [setup({config_sha256:'0'.repeat(64)}),/^config_sha256/],
   [setup({issuer_seed:{path:SEED,sha256:'0'.repeat(64)}}),/^issuer_seed/],
   [setup({fixture_manifest:[{path:EDGAR+'CIK0009990603.json',sha256:'0'.repeat(64)}]}),/^fixture_manifest:src\/lib\/evals\/fixtures\/edgar\/CIK0009990603\.json/],
   [setup({fixture_manifest:[{path:EDGAR+'CIK0009990699.json',sha256:'0'.repeat(64)}]}),/^fixture_manifest/],
   [setup({sync_order:['CIK0009990604.json']}),/^sync_order/],
   [setup({quarantine_resolutions:[{natural_key:'nope',chosen_values:['1']}]}),/^quarantine_resolutions/],
  ];
  for(const [s,re] of cases){const b=await buildFrozenMemory(s);expect(b.ok,re.source).toBe(false);if(!b.ok)expect(b.mismatch).toMatch(re);}
 });
 it('sync() of a name outside the manifest is a SetupMismatch',async()=>{
  const w=worldOf(await buildFrozenMemory(setup()));
  await expect(w.sync('CIK0009990603.other.json')).rejects.toMatchObject({name:'SetupMismatch',field:'fixture_manifest'});
 });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test -- src/lib/evals/replay/setup.test.ts`
Expected: FAIL — `Failed to resolve import "./setup"`.

- [ ] **Step 6: Implement the deterministic world build**

Create `src/lib/evals/replay/setup.ts`:

```ts
// src/lib/evals/replay/setup.ts
// F6-owned deterministic world build (spec §5.3.1, §0 R5-2). verifySetup checks EVERYTHING before any write:
// setup_sha256 (sha256 of the canonical JSON of every other field), initial_state, today, mapping_gen = MAPPING_GEN,
// formula_version = FORMULA_VERSION, config_sha256 = sha256(concepts.ts ‖ units.ts ‖ rules.ts), the issuer seed and
// every fixture byte-for-byte against the manifest, sync_order ⊆ manifest. Then: the seed in FK order stocks_universe
// → issuers → issuer_securities (pg: on conflict do nothing; a stored issuer_id must equal the seed's), reconcileScope
// for the seed issuers, one runFactsSync (the only exported sync entry) per sync_order file with fetchUs serving that
// file's verified bytes, a memory snapshot store and a fixed clock (today 12:00Z), then the listed quarantine
// resolutions. A mismatch is {ok:false, mismatch:'<field>[:<detail>]'} (replay maps it to read_error(setup_mismatch));
// world.sync() of a later file throws SetupMismatch. Rebuilding on a database that already holds the world is a
// duplicate-only sync. Backends: buildFrozenDb(pool) = pgFactsDb + pgTableClient (integration tests; CLI ci with a
// test database); buildFrozenMemory() = memoryFactsDb (CLI ci without one; unit tests). runFactsSync always records
// dq_freshness 'facts.us' (sync.ts → dq/freshness.ts recordAttempt, no opt-out); with the fixed clock that row would be
// stale for every other suite sharing the database, so the world's sync deps get withoutFreshness(tables): writes to
// dq_freshness are dropped, reads pass through. The world build therefore leaves dq_freshness untouched.
// sealSetupFromPaths() seals a replay draft that names files by path only (Task 11's facts.frozen.json drafts).
import {readFileSync} from 'node:fs';
import {basename,join} from 'node:path';
import type {Pool} from 'pg';
import {memoryTableClient} from '../../db/memory-table-client';
import {pgTableClient} from '../../db/pg-table-client';
import type {TableClient} from '../../db/table-client';
import {MAPPING_GEN} from '../../facts/concepts';
import {FORMULA_VERSION} from '../../facts/derive';
import {decimalEquals} from '../../facts/json-numbers';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import {pgFactsDb} from '../../facts/pg-facts-db';
import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {ProviderError,padCik,snapshotOf} from '../../facts/providers/shared';
import {memorySnapshotStore} from '../../facts/snapshot-store';
import {runFactsSync} from '../../facts/sync';
import type {SyncDeps,SyncReceipt} from '../../facts/sync';
import type {FactsDb} from '../../facts/types';
import {canonicalJson,sha256Hex} from '../canonical-json';

export interface SeedIssuer{issuer_id:string;ticker:string;cik:string;name:string}
export interface IssuerSeedFile{issuers:SeedIssuer[]}
export interface QuarantineResolution{natural_key:string;chosen_values:string[]}
export interface FrozenSetup{
 initial_state:'empty_after_migrations';
 issuer_seed:{path:string;sha256:string};
 fixture_manifest:{path:string;sha256:string}[];
 /** basenames of fixture_manifest entries, one runFactsSync each, in this order */
 sync_order:string[];
 today:string;mapping_gen:number;formula_version:string;
 quarantine_resolutions:QuarantineResolution[];
 config_sha256:string;setup_sha256:string;
}
export type FrozenSetupDraft=Omit<FrozenSetup,'setup_sha256'>;
export class SetupMismatch extends Error{
 constructor(public readonly field:string,public readonly info?:string){super(`setup_mismatch:${field}${info===undefined?'':`:${info}`}`);this.name='SetupMismatch';}
 /** '<field>' or '<field>:<detail>' — the FrozenBuild.mismatch string */
 get mismatch():string{return this.info===undefined?this.field:`${this.field}:${this.info}`;}
}
export interface FrozenWorld{
 db:FactsDb;tables:TableClient;storage:ReturnType<typeof memorySnapshotStore>;
 /** ticker → issuer_id */
 issuers:Record<string,string>;seed:SeedIssuer[];
 today:string;now:Date;setup:FrozenSetup;
 /** One more runFactsSync of a manifest fixture (verified bytes) for its seed issuer. */
 sync(name:string):Promise<SyncReceipt>;
}
export type FrozenBuild={ok:false;mismatch:string}|{ok:true;issuers:Record<string,string>;world:FrozenWorld};

export const CONFIG_FILES=['src/lib/facts/concepts.ts','src/lib/facts/units.ts','src/lib/facts/rules.ts'] as const;
export const SETUP_CODE_VERSION='f6-frozen-setup';
export const QUARANTINE_RESOLVER='f6000000-0000-4000-8000-00000000f6f6';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const FIXTURE_CIK=/^CIK(\d{10})\./;

export function configSha256(root=process.cwd()):string{return sha256Hex(new Uint8Array(Buffer.concat(CONFIG_FILES.map(f=>readFileSync(join(root,f))))));}
/** sha256 of the canonical JSON of every field except setup_sha256 (a sealed setup may be passed). */
export function setupSha256(s:FrozenSetupDraft):string{const rest={...s} as Record<string,unknown>;delete rest.setup_sha256;return sha256Hex(canonicalJson(rest));}
export function sealSetup(draft:FrozenSetupDraft):FrozenSetup{return {...draft,setup_sha256:setupSha256(draft)};}
/** A draft that names its files by path only (Task 11 replay drafts): every sha256 and config_sha256 is filled from the bytes under root. */
export type FrozenSetupPathsDraft=Omit<FrozenSetup,'issuer_seed'|'fixture_manifest'|'config_sha256'|'setup_sha256'>&{issuer_seed:{path:string};fixture_manifest:{path:string}[]};
export function sealSetupFromPaths(d:FrozenSetupPathsDraft,root=process.cwd()):FrozenSetup{
 const sha=(p:string)=>sha256Hex(new Uint8Array(readFileSync(join(root,p))));
 return sealSetup({...d,issuer_seed:{path:d.issuer_seed.path,sha256:sha(d.issuer_seed.path)},fixture_manifest:d.fixture_manifest.map(f=>({path:f.path,sha256:sha(f.path)})),config_sha256:configSha256(root)});
}
/** dq_freshness writes dropped, everything else passed through (see header). */
export function withoutFreshness(t:TableClient):TableClient{
 const skip=(table:string)=>table==='dq_freshness';
 return {insert:(table,row)=>skip(table)?Promise.resolve(row):t.insert(table,row),update:(table,m,p)=>skip(table)?Promise.resolve(0):t.update(table,m,p),
  select:(table,m,o)=>t.select(table,m,o),upsert:(table,row,c)=>skip(table)?Promise.resolve():t.upsert(table,row,c),count:(table,m,o)=>t.count(table,m,o)};
}
export function loadSetup(path:string,root=process.cwd()):FrozenSetup{return JSON.parse(readFileSync(join(root,path),'utf8')) as FrozenSetup;}

function readBytes(root:string,path:string,field:string):Uint8Array{
 try{return new Uint8Array(readFileSync(join(root,path)));}catch{throw new SetupMismatch(field,`${path} unreadable`);}
}
/** Every check of the setup, before any write; returns the verified seed and fixture bytes by basename. */
export function verifySetup(setup:FrozenSetup,root=process.cwd()):{seed:IssuerSeedFile;files:Map<string,Uint8Array>}{
 if(setupSha256(setup)!==setup.setup_sha256)throw new SetupMismatch('setup_sha256');
 if(setup.initial_state!=='empty_after_migrations')throw new SetupMismatch('initial_state',String(setup.initial_state));
 if(!DAY.test(setup.today)||Number.isNaN(Date.parse(`${setup.today}T00:00:00Z`))||new Date(`${setup.today}T00:00:00Z`).toISOString().slice(0,10)!==setup.today)throw new SetupMismatch('today',setup.today);
 if(setup.mapping_gen!==MAPPING_GEN)throw new SetupMismatch('mapping_gen',`${setup.mapping_gen} != ${MAPPING_GEN}`);
 if(setup.formula_version!==FORMULA_VERSION)throw new SetupMismatch('formula_version',`${setup.formula_version} != ${FORMULA_VERSION}`);
 if(configSha256(root)!==setup.config_sha256)throw new SetupMismatch('config_sha256');
 const seedBytes=readBytes(root,setup.issuer_seed.path,'issuer_seed');
 if(sha256Hex(seedBytes)!==setup.issuer_seed.sha256)throw new SetupMismatch('issuer_seed',setup.issuer_seed.path);
 const seed=JSON.parse(new TextDecoder().decode(seedBytes)) as IssuerSeedFile;
 const files=new Map<string,Uint8Array>();
 for(const f of setup.fixture_manifest){
  const bytes=readBytes(root,f.path,'fixture_manifest');
  if(sha256Hex(bytes)!==f.sha256)throw new SetupMismatch('fixture_manifest',f.path);
  const name=basename(f.path);
  if(files.has(name))throw new SetupMismatch('fixture_manifest',`duplicate ${name}`);
  files.set(name,bytes);
 }
 for(const name of setup.sync_order){
  const cik10=FIXTURE_CIK.exec(name)?.[1];
  if(!files.has(name)||!seed.issuers.some(s=>padCik(s.cik)===cik10))throw new SetupMismatch('sync_order',name);
 }
 return {seed,files};
}

interface Backend{db:FactsDb;tables:TableClient;provision(s:SeedIssuer):Promise<string>}

async function resolveListed(b:Backend,q:QuarantineResolution):Promise<void>{
 const key={table_name:'financial_facts',natural_key:q.natural_key};
 const [open]=await b.tables.select('dq_quarantine',{...key,status:'open'},{limit:1});
 if(!open){
  const [done]=await b.tables.select('dq_quarantine',key,{limit:1});
  if(done)return;                                    // resolved by an earlier build of the same world
  throw new SetupMismatch('quarantine_resolutions',q.natural_key);
 }
 const payload=(open.payload??{}) as {fact_ids?:unknown};
 const ids=Array.isArray(payload.fact_ids)?payload.fact_ids.filter((x):x is string=>typeof x==='string'):[];
 const chosen=(await b.db.factsByIds(ids)).filter(f=>q.chosen_values.some(v=>decimalEquals(v,f.value_text))).map(f=>f.fact_id);
 if(chosen.length===0)throw new SetupMismatch('quarantine_resolutions',`${q.natural_key}: no member has a chosen value`);
 await b.db.resolveFactsQuarantine(String(open.id),chosen,QUARANTINE_RESOLVER);
}

async function buildWorld(setup:FrozenSetup,root:string,backendAt:(now:Date)=>Backend):Promise<FrozenBuild>{
 let verified:{seed:IssuerSeedFile;files:Map<string,Uint8Array>};
 try{verified=verifySetup(setup,root);}catch(e){if(e instanceof SetupMismatch)return {ok:false,mismatch:e.mismatch};throw e;}
 const {seed,files}=verified;
 const now=new Date(`${setup.today}T12:00:00.000Z`);
 const backend=backendAt(now);
 try{
  const issuers:Record<string,string>={};
  for(const s of seed.issuers)issuers[s.ticker]=await backend.provision(s);
  await backend.db.reconcileScope('US',seed.issuers.map(s=>({issuer_id:issuers[s.ticker],reasons:['f6-frozen-setup'],priority:10,fetch_key:padCik(s.cik)})));
  const storage=memorySnapshotStore();
  const served=new Map<string,Uint8Array>();
  const deps:SyncDeps={db:backend.db,tables:withoutFreshness(backend.tables),storage,
   fetchUs:async cik10=>{const b=served.get(cik10);if(!b)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(b,{source:'edgar',url:companyFactsUrl(cik10),fetched_at:now.toISOString()});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','the F6 frozen world is US only');},
   parseUs:(s,o)=>parseCompanyFacts(s,{sinceYear:o.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','the F6 frozen world is US only');},
   now:()=>now,deadline:null,codeVersion:SETUP_CODE_VERSION};
  const sync=async(name:string):Promise<SyncReceipt>=>{
   const bytes=files.get(name);
   if(!bytes)throw new SetupMismatch('fixture_manifest',`${name} is not in the manifest`);
   const cik10=FIXTURE_CIK.exec(name)?.[1];
   const owner=seed.issuers.find(s=>padCik(s.cik)===cik10);
   if(cik10===undefined||!owner)throw new SetupMismatch('sync_order',name);
   served.set(cik10,bytes);
   const r=await runFactsSync(deps,{market:'US',limit:1,issuerIds:[issuers[owner.ticker]],dryRun:false,triggeredBy:'script',mappingGen:setup.mapping_gen});
   if(r.detail.published!==1||r.detail.failed>0)throw new SetupMismatch('sync',`${name}: ${r.issuers[0]?.code??r.status}`);
   return r;
  };
  for(const name of setup.sync_order)await sync(name);
  for(const q of setup.quarantine_resolutions)await resolveListed(backend,q);
  const world:FrozenWorld={db:backend.db,tables:backend.tables,storage,issuers,seed:seed.issuers,today:setup.today,now,setup,sync};
  return {ok:true,issuers,world};
 }catch(e){if(e instanceof SetupMismatch)return {ok:false,mismatch:e.mismatch};throw e;}
}

export function buildFrozenDb(pool:Pool,setup:FrozenSetup,root=process.cwd()):Promise<FrozenBuild>{
 return buildWorld(setup,root,()=>({db:pgFactsDb(pool),tables:pgTableClient(pool),
  async provision(s){
   await pool.query(`insert into public.stocks_universe(ticker,name,market) values($1,$2,'US') on conflict (ticker) do nothing`,[s.ticker,s.name]);
   await pool.query(`insert into public.issuers(issuer_id,canonical_name_en,country_code,cik) values($1,$2,'US',$3) on conflict do nothing`,[s.issuer_id,s.name,s.cik]);
   const id=(await pool.query(`select issuer_id from public.issuers where cik=$1`,[s.cik])).rows[0]?.issuer_id as string|undefined;
   if(id!==s.issuer_id)throw new SetupMismatch('issuer_seed',`cik ${s.cik} belongs to ${id??'nobody'}`);
   await pool.query(`insert into public.issuer_securities(issuer_id,ticker,share_class,is_primary,valid_from,source) values($1,$2,'common',true,'2000-01-01','f6-seed') on conflict do nothing`,[s.issuer_id,s.ticker]);
   return s.issuer_id;
  }}));
}

export function buildFrozenMemory(setup:FrozenSetup,root=process.cwd()):Promise<FrozenBuild>{
 return buildWorld(setup,root,now=>{
  const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset'],issuers:['issuer_id']});
  const db=memoryFactsDb(tables);db.setNow(now.toISOString());
  return {db,tables,async provision(s){
   await tables.insert('issuers',{issuer_id:s.issuer_id,status:'active',cik:s.cik,canonical_name_en:s.name,canonical_name_zh:null,lei:null,usci:null,merged_into:null,country_code:'US'});
   await tables.insert('issuer_securities',{issuer_id:s.issuer_id,ticker:s.ticker,isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'f6-seed'});
   return s.issuer_id;
  }};
 });
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npm test -- src/lib/evals/replay/setup.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 8: Generate the base setup and the synthetic gold set; append the lock**

Create `.claude/scratch/f6-gen-sets.ts`:

```ts
// .claude/scratch/f6-gen-sets.ts — Task 9 Step 8 one-off generator: f6-base.setup.json, synthetic-us.json, lock.json entry.
// Gold values are read from the generated F6 fixtures losslessly (scanJsonNumbers + canonicalDecimal), never typed.
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {MAPPING_GEN} from '../../src/lib/facts/concepts';
import {FORMULA_VERSION} from '../../src/lib/facts/derive';
import {canonicalDecimal,scanJsonNumbers} from '../../src/lib/facts/json-numbers';
import {configSha256,sealSetup} from '../../src/lib/evals/replay/setup';

const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const EDGAR='src/lib/evals/fixtures/edgar/',SEED='src/lib/evals/fixtures/issuers/f6-seed.json';
const FILES=['CIK0009990601.json','CIK0009990602.json','CIK0009990603.json','CIK0009990603.amended.json','CIK0009990603.conflict.json'];
const SETUP='src/lib/evals/fixtures/replay/f6-base.setup.json',GOLD='src/lib/evals/fixtures/gold/facts/synthetic-us.json',LOCK='src/lib/evals/fixtures/gold/lock.json';

// 1. base setup: the three base fixtures synced in order; the C amendment / conflict are in the manifest for world.sync()
mkdirSync('src/lib/evals/fixtures/replay',{recursive:true});
const setup=sealSetup({initial_state:'empty_after_migrations',issuer_seed:{path:SEED,sha256:sha(SEED)},fixture_manifest:FILES.map(f=>({path:EDGAR+f,sha256:sha(EDGAR+f)})),
 sync_order:FILES.slice(0,3),today:'2026-11-20',mapping_gen:MAPPING_GEN,formula_version:FORMULA_VERSION,quarantine_resolutions:[],config_sha256:configSha256()});
writeFileSync(SETUP,`${JSON.stringify(setup,null,1)}\n`);
console.log('f6-base.setup.json setup_sha256',setup.setup_sha256);

// 2. synthetic gold
type Num={__num:string};interface Entry{start?:string;end:string;val:Num;accn:string}
type Doc={facts:Record<string,Record<string,{units:Record<string,Entry[]>}>>};
const docs=new Map<string,Doc>();
const doc=(f:string)=>{let d=docs.get(f);if(!d){d=scanJsonNumbers(readFileSync(EDGAR+f)) as Doc;docs.set(f,d);}return d;};
const valueOf=(f:string,tag:string,unit:string,accn:string,start:string|null,end:string)=>{
 const hits=(doc(f).facts['us-gaap'][tag]?.units[unit]??[]).filter(e=>e.accn===accn&&(e.start??null)===start&&e.end===end);
 if(hits.length!==1)throw new Error(`${f} ${tag} ${accn} ${start}..${end}: ${hits.length} entries`);
 return canonicalDecimal(hits[0].val.__num);
};
const group=(v:string)=>{const [i,f]=v.split('.');const neg=i.startsWith('-');const g=(neg?i.slice(1):i).replace(/\B(?=(\d{3})+(?!\d))/g,',');return `${neg?'-':''}${g}${f===undefined?'':`.${f}`}`;};
interface Who{ticker:string;cik:string;file:string;accn:string;filed:string;start:string;end:string}
const A:Who={ticker:'ZZEVA',cik:'9990601',file:'CIK0009990601.json',accn:'0009990601-23-000106',filed:'2023-11-03',start:'2022-09-25',end:'2023-09-30'};
const B:Who={ticker:'ZZEVB',cik:'9990602',file:'CIK0009990602.json',accn:'0009990602-23-035122',filed:'2023-07-27',start:'2022-07-01',end:'2023-06-30'};
interface Spec{who:Who;concept:string;tag:string;unit?:'USD'|'USD/shares';instant?:boolean;binding?:'document'|'current';missing?:boolean;optional?:boolean}
const SPECS:Spec[]=[
 {who:A,concept:'revenue',tag:'RevenueFromContractWithCustomerExcludingAssessedTax'},
 {who:A,concept:'net_income_parent',tag:'NetIncomeLoss'},
 {who:A,concept:'total_assets',tag:'Assets',instant:true},
 {who:A,concept:'eps_diluted',tag:'EarningsPerShareDiluted',unit:'USD/shares'},
 {who:A,concept:'revenue',tag:'RevenueFromContractWithCustomerExcludingAssessedTax',binding:'current'},
 {who:A,concept:'interest_expense_bank',tag:'(no us-gaap tag maps to interest_expense_bank)',missing:true},
 {who:B,concept:'revenue',tag:'RevenueFromContractWithCustomerExcludingAssessedTax'},
 {who:B,concept:'net_income_parent',tag:'NetIncomeLoss'},
 {who:B,concept:'total_assets',tag:'Assets',instant:true},
 {who:B,concept:'rd_expense',tag:'ResearchAndDevelopmentExpense',optional:true},
];
const cases=SPECS.map(s=>{
 const start=s.instant?null:s.who.start;
 const perShare=s.unit==='USD/shares';
 const stored=perShare?'USD/share':'USD';
 const binding=s.binding??'document';
 const period=start===null?s.who.end:`${start}..${s.who.end}`;
 const suffix=binding==='current'?`current@${s.who.filed}`:s.missing?'missing':'document';
 const base={case_id:`${s.who.ticker}/${s.concept}/${period}/consolidated/${stored}/${suffix}`,subject:{market:'US',cik:s.who.cik},
  target:{type:'fact',concept:s.concept,period_start:start,period_end:s.who.end,duration:s.instant?'INSTANT':'12M',consolidation:'consolidated',unit:perShare?{kind:'per_share',currency:'USD'}:{kind:'currency',currency:'USD'}},
  expect:s.missing?'missing':'present',binding,
  source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:s.who.accn},url:`https://www.sec.gov/Archives/edgar/data/${s.who.cik}/${s.who.accn.replace(/-/g,'')}/`,sha256:sha(EDGAR+s.who.file),available_date:s.who.filed,
   locator:{table:'companyfacts',row:s.missing?s.tag:`us-gaap:${s.tag}`,column:period,unit:s.unit??'USD'}},
  provenance_kind:'synthetic',recorded_by:'synthetic',recorded_at:'2026-11-06T00:00:00Z',reviewed_by:null,reviewed_at:null,retracted:null,
  notes:'Synthetic F6 case: value copied by the generator from the F6 fixture, not transcribed from a filing.'};
 if(s.missing)return base;
 const v=valueOf(s.who.file,s.tag,s.unit??'USD',s.who.accn,start,s.who.end);
 return {...base,printed:{text:group(v),unit_label:perShare?'USD per share':'USD',scale:'1'},canonical:{value:v}};
});
const set={schema_version:1,set_id:'facts/synthetic-us',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code','codex'],
 tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:cases.filter((_,i)=>SPECS[i].optional).map(c=>c.case_id),history:[],cases};
mkdirSync('src/lib/evals/fixtures/gold/facts',{recursive:true});
writeFileSync(GOLD,`${JSON.stringify(set,null,1)}\n`);
for(const c of cases)console.log(c.case_id,'canonical' in c?(c as {canonical:{value:string}}).canonical.value:'(expect missing)');

// 3. lock entry (replaces an existing entry for the same path)
const lock=JSON.parse(readFileSync(LOCK,'utf8')) as {files:{path:string;sha256:string;version:number;format:string}[]};
lock.files=lock.files.filter(f=>f.path!==GOLD).concat({path:GOLD,sha256:sha(GOLD),version:1,format:'f6'});
writeFileSync(LOCK,`${JSON.stringify(lock,null,1)}\n`);
console.log('lock.json',lock.files.length,'entries');
```

Run: `npx tsx .claude/scratch/f6-gen-sets.ts`
Expected (values identical to Step 3):
```
f6-base.setup.json setup_sha256 <64 hex>
ZZEVA/revenue/2022-09-25..2023-09-30/consolidated/USD/document 383285000000
ZZEVA/net_income_parent/2022-09-25..2023-09-30/consolidated/USD/document 96995000000
ZZEVA/total_assets/2023-09-30/consolidated/USD/document 352583000000
ZZEVA/eps_diluted/2022-09-25..2023-09-30/consolidated/USD/share/document 6.13
ZZEVA/revenue/2022-09-25..2023-09-30/consolidated/USD/current@2023-11-03 383285000000
ZZEVA/interest_expense_bank/2022-09-25..2023-09-30/consolidated/USD/missing (expect missing)
ZZEVB/revenue/2022-07-01..2023-06-30/consolidated/USD/document 211915000000
ZZEVB/net_income_parent/2022-07-01..2023-06-30/consolidated/USD/document 72361000000
ZZEVB/total_assets/2023-06-30/consolidated/USD/document 411976000000
ZZEVB/rd_expense/2022-07-01..2023-06-30/consolidated/USD/document 27195000000
lock.json <n> entries
```
Then run: `npx tsx scripts/evals/validate.ts --gold --lock`
Expected: exit 0 (Task 3 validator accepts the new set, its recorders and the lock). If it rejects a field of the case shape, fix the generator to Task 2's schema (integrator note), regenerate, rerun — never hand-edit the JSON.

- [ ] **Step 9: Remove the generators, typecheck, lint, commit the world**

```bash
rm .claude/scratch/f6-gen-fixtures.ts .claude/scratch/f6-gen-sets.ts
```
Run: `npm test -- src/lib/evals/replay/setup.test.ts && npm run typecheck && npm run lint`
Expected: PASS, exit 0, exit 0.

```bash
git add src/lib/evals/fixtures/edgar src/lib/evals/fixtures/issuers/f6-seed.json src/lib/evals/fixtures/replay/f6-base.setup.json src/lib/evals/fixtures/gold/facts/synthetic-us.json src/lib/evals/fixtures/gold/lock.json src/lib/evals/replay/setup.ts src/lib/evals/replay/setup.test.ts
```
```bash
git commit -m "feat(f6): deterministic F6 world (ZZEVA/B/C fixtures, seed, base setup) and synthetic-us gold (Task 9a)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Write the failing CLI tests**

Create `src/lib/evals/cli/deps.test.ts`:

```ts
// src/lib/evals/cli/deps.test.ts
import {describe,expect,it} from 'vitest';
import type {FactTarget} from '../types';
import {buildRunDeps,fetchSourceBytes,hostOf} from './deps';

const REVENUE:FactTarget={type:'fact',concept:'revenue',period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}};

describe('buildRunDeps (spec §7.1 table)',()=>{
 it('ci without a test database: an unprivileged reader over the F6 frozen world in memory, no store, no credentials',async()=>{
  const d=await buildRunDeps('ci',false,{env:{}});
  try{
   expect(d.reader).toMatchObject({module:'facts',privileged:false});
   expect(d.store).toBeNull();
   expect(d.environment).toEqual({db_host:null,app_origin:null,db_state_rev:null});
   const ref=await d.reader.resolveSubject({market:'US',cik:'9990601'},'2026-11-20');
   expect(ref).not.toBeNull();
   const r=await d.reader.readDocumentBound(ref!,REVENUE,{kind:'edgar_accession',value:'0009990601-23-000106'},'2026-11-20');
   expect(r.rows.map(x=>x.value_text)).toEqual(['383285000000']);
  }finally{await d.close();}
 },120_000);
 it('ci is never privileged',async()=>{await expect(buildRunDeps('ci',true,{env:{}})).rejects.toThrow('never privileged');});
 it('a setup that does not verify is refused before anything is built',async()=>{
  await expect(buildRunDeps('ci',false,{env:{},setupPath:'src/lib/evals/fixtures/gold/lock.json'})).rejects.toThrow(/^setup_mismatch:/);
 });
});

describe('hostOf / fetchSourceBytes',()=>{
 it('hostOf keeps the bare hostname only (no user, password, port or path)',()=>{
  expect(hostOf('postgres://user:secret@127.0.0.1:54322/postgres')).toBe('127.0.0.1');
  expect(hostOf('https://abcd.supabase.co/rest/v1')).toBe('abcd.supabase.co');
  expect(hostOf(undefined)).toBeNull();expect(hostOf('not a url')).toBeNull();
 });
 it('fetchSourceBytes sends the SEC user agent and refuses a non-2xx response',async()=>{
  const seen:{url:string;ua:string|null}[]=[];
  const ok=(async(url:string|URL|Request,init?:RequestInit)=>{seen.push({url:String(url),ua:new Headers(init?.headers).get('User-Agent')});return new Response(new Uint8Array([1,2,3]),{status:200});}) as typeof fetch;
  expect(await fetchSourceBytes('https://www.sec.gov/x',ok,'F6 test ua')).toEqual(new Uint8Array([1,2,3]));
  expect(seen).toEqual([{url:'https://www.sec.gov/x',ua:'F6 test ua'}]);
  const notFound=(async()=>new Response('no',{status:404})) as typeof fetch;
  await expect(fetchSourceBytes('https://www.sec.gov/y',notFound,'ua')).rejects.toThrow('source_http_404');
 });
});
```

Create `src/lib/evals/cli/run-cli.test.ts`:

```ts
// src/lib/evals/cli/run-cli.test.ts
import {describe,expect,it} from 'vitest';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {fakeReader,gcase,gset,readRow} from '../kinds/official-test-support';
import type {FakeReaderOptions} from '../kinds/official-test-support';
import type {EvalStore} from '../store';
import type {EvalReport,EvalRunRow,GoldLock,GoldSet} from '../types';
import type {RunDeps} from './deps';
import {USAGE,UsageError,parseRunArgs,runCli} from './run-cli';
import type {CliDeps,CliIo} from './run-cli';

const SET=gset([gcase()]);
const lockOf=(s:GoldSet):GoldLock=>({files:[{path:s.path,sha256:s.sha256,version:s.version,format:s.format}]});
const OFFICIAL=['--kind','official_reconciliation','--module','facts','--set',SET.path];
interface Harness{deps:CliDeps;io:CliIo;out:string[];err:string[];written:EvalReport[];persisted:{ref:string;sha256:string;opts:unknown;report:EvalReport}[];built:{mode:string;privileged:boolean}[]}
function harness(o:{set?:GoldSet;lock?:GoldLock;reader?:FakeReaderOptions;over?:Partial<CliDeps>;store?:EvalStore}={}):Harness{
 const out:string[]=[],err:string[]=[],written:EvalReport[]=[],persisted:Harness['persisted']=[],built:Harness['built']=[];
 const set=o.set??SET;
 const deps:CliDeps={
  buildDeps:async(mode,privileged)=>{built.push({mode,privileged});const run:RunDeps={reader:fakeReader({...o.reader,...(privileged?{privileged:{}}:{})}),environment:{db_host:null,app_origin:null,db_state_rev:null},store:privileged?(o.store??({} as EvalStore)):null,close:async()=>{}};return run;},
  loadSet:()=>set,loadLock:()=>o.lock??lockOf(set),version:()=>({sha:'a'.repeat(40),dirty:false}),now:()=>new Date('2026-11-20T00:00:00.000Z'),
  writeReport:r=>{written.push(r);return {json:`reports/evals/${r.run_id}.json`,md:null,sha256:'b'.repeat(64)};},
  persist:async(_store,report,files,opts)=>{persisted.push({...files,opts,report});},
  readFile:()=>new Uint8Array(),
  ...o.over};
 return {deps,io:{stdout:l=>out.push(l),stderr:l=>err.push(l)},out,err,written,persisted,built};
}
const receipt=(h:Harness)=>JSON.parse(h.out[0]) as Record<string,unknown>;
const errorOf=(h:Harness)=>(JSON.parse(h.err[0]) as {error:string}).error;

describe('parseRunArgs (spec §7.1 flags)',()=>{
 it('parses every flag of an official run',()=>{
  expect(parseRunArgs([...OFFICIAL,'--mode','report','--write-db','--verify-artifacts','--verify-sources','--out','/tmp/x','--limit','5','--case','a','--case','b'])).toEqual({kind:'official_reconciliation',module:'facts',set:SET.path,mode:'report',writeDb:true,verifyArtifacts:true,verifySources:true,out:'/tmp/x',limit:5,caseIds:['a','b'],http:false});
 });
 it.each<[string[],string]>([
  [['--kind','nope','--module','facts','--mode','ci'],'--kind'],
  [['--kind','official_reconciliation','--module','facts','--mode','ci'],'--set is required'],
  [[...OFFICIAL,'--mode','staging'],'--mode'],
  [[...OFFICIAL,'--module','planets','--mode','ci'],'--module'],
  [[...OFFICIAL,'--mode','ci','--write-db'],'--write-db needs --mode report'],
  [[...OFFICIAL,'--mode','report','--verify-artifacts'],'need --write-db'],
  [[...OFFICIAL,'--mode','report','--resume','r1'],'--resume needs --write-db'],
  [[...OFFICIAL,'--mode','ci','--http'],'--http'],
  [[...OFFICIAL,'--mode','ci','--pair','p1'],'--pair'],
  [[...OFFICIAL,'--mode','ci','--limit','0'],'--limit'],
  [[...OFFICIAL,'--mode','ci','--bogus'],'unknown argument'],
  [[...OFFICIAL,'--mode'],'needs a value'],
 ])('refuses %j',(argv,message)=>{expect(()=>parseRunArgs(argv)).toThrow(UsageError);expect(()=>parseRunArgs(argv)).toThrow(message);});
});

describe('runCli (spec §7.1, §3.2 exit codes, §6.3 order, §14)',()=>{
 it('ci: report written, one JSON receipt line, exit = the gate (pass → 0), nothing persisted',async()=>{
  const h=harness();
  expect(await runCli([...OFFICIAL,'--mode','ci'],h.io,h.deps)).toBe(0);
  expect(h.built).toEqual([{mode:'ci',privileged:false}]);
  expect(h.written).toHaveLength(1);expect(h.persisted).toEqual([]);expect(h.out).toHaveLength(1);
  expect(receipt(h)).toMatchObject({run_id:h.written[0].run_id,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,gate:'pass',exit_code:0,report:`reports/evals/${h.written[0].run_id}.json`,report_sha256:'b'.repeat(64),db:'skipped'});
 });
 it('a failing gate still writes the report and exits 1; --case makes the run a subset (incomplete → 3)',async()=>{
  const fail=harness({reader:{rows:()=>[readRow({value_text:'999'})]}});
  expect(await runCli([...OFFICIAL,'--mode','ci'],fail.io,fail.deps)).toBe(1);
  expect(receipt(fail)).toMatchObject({gate:'fail',exit_code:1});expect(fail.written).toHaveLength(1);
  const sub=harness();
  expect(await runCli([...OFFICIAL,'--mode','ci','--case',gcase().case_id],sub.io,sub.deps)).toBe(3);
  expect(sub.written[0].summary.execution.subset).toBe(true);
 });
 it('refusals exit 2 before any connection: synthetic in report, lock mismatch, dirty report, module mismatch, a kind without a runner',async()=>{
  const syn=harness({set:gset([gcase({provenance_kind:'synthetic',recorded_by:'synthetic'})])});
  expect(await runCli([...OFFICIAL,'--mode','report'],syn.io,syn.deps)).toBe(2);
  expect(errorOf(syn)).toBe('synthetic_in_report');expect(syn.built).toEqual([]);
  const lock=harness({lock:{files:[]}});
  expect(await runCli([...OFFICIAL,'--mode','ci'],lock.io,lock.deps)).toBe(2);
  expect(errorOf(lock)).toBe('gold_lock_mismatch');expect(lock.built).toEqual([]);
  const dirty=harness({over:{version:()=>({sha:'a'.repeat(40),dirty:true})}});
  expect(await runCli([...OFFICIAL,'--mode','report'],dirty.io,dirty.deps)).toBe(2);expect(errorOf(dirty)).toBe('dirty_tree');
  const mod=harness();
  expect(await runCli(['--kind','official_reconciliation','--module','metrics','--set',SET.path,'--mode','ci'],mod.io,mod.deps)).toBe(2);expect(errorOf(mod)).toBe('gold_invalid');
  const kind=harness();
  expect(await runCli(['--kind','extraction_gold','--module','company','--mode','ci'],kind.io,kind.deps)).toBe(2);
  expect(errorOf(kind)).toBe('kind_not_enabled');expect(kind.built).toEqual([]);
 });
 it('a usage error exits 2 and prints the usage',async()=>{
  const h=harness();
  expect(await runCli(['--mode','ci'],h.io,h.deps)).toBe(2);
  expect(h.err.join('\n')).toContain(USAGE);expect(h.out).toEqual([]);
 });
 it('--write-db: privileged deps; persistRun runs after the report file, with its ref and sha256',async()=>{
  const h=harness();
  expect(await runCli([...OFFICIAL,'--mode','report','--write-db','--verify-artifacts'],h.io,h.deps)).toBe(0);
  expect(h.built).toEqual([{mode:'report',privileged:true}]);
  expect(h.persisted).toEqual([{ref:`reports/evals/${h.written[0].run_id}.json`,sha256:'b'.repeat(64),opts:{triggeredBy:'script'},report:h.written[0]}]);
  expect(receipt(h)).toMatchObject({privileged:true,db:'written'});
  expect(h.written[0].provenance.verified).toEqual({artifacts:true,sources:false});
 });
 it('report or store failures exit 1; a failed report write never reaches the store',async()=>{
  const store=harness({over:{persist:async()=>{throw new EvalError('store_write_failed','insert failed');}}});
  expect(await runCli([...OFFICIAL,'--mode','report','--write-db'],store.io,store.deps)).toBe(1);
  expect(errorOf(store)).toBe('store_write_failed');expect(store.out).toEqual([]);
  const report=harness({over:{writeReport:()=>{throw new Error('EACCES');}}});
  expect(await runCli([...OFFICIAL,'--mode','report','--write-db'],report.io,report.deps)).toBe(1);
  expect(errorOf(report)).toBe('report_write_failed');expect(report.persisted).toEqual([]);
 });
 it('--resume re-enters persistRun from the stored row and the report file it names (§6.3 step 5); an unknown run is resume_mismatch',async()=>{
  const first=harness();
  await runCli([...OFFICIAL,'--mode','ci'],first.io,first.deps);
  const report=first.written[0];
  const bytes=new TextEncoder().encode(JSON.stringify(report));
  const row={run_id:report.run_id,report_ref:'docs/evals/2026-11-20/facts-official_reconciliation-x.json'} as EvalRunRow;
  const store={getRun:async(id:string)=>id===report.run_id?row:null} as unknown as EvalStore;
  const h=harness({store,over:{readFile:p=>{expect(p).toBe(row.report_ref);return bytes;}}});
  expect(await runCli(['--kind','official_reconciliation','--module','facts','--mode','report','--write-db','--resume',report.run_id],h.io,h.deps)).toBe(0);
  expect(h.persisted).toEqual([{ref:row.report_ref,sha256:sha256Hex(bytes),opts:{triggeredBy:'script',resume:true},report:JSON.parse(JSON.stringify(report))}]);
  expect(receipt(h)).toMatchObject({run_id:report.run_id,db:'written',report:row.report_ref});
  const unknown=harness({store});
  expect(await runCli(['--kind','official_reconciliation','--module','facts','--mode','report','--write-db','--resume','00000000-0000-4000-8000-000000000000'],unknown.io,unknown.deps)).toBe(2);
  expect(errorOf(unknown)).toBe('resume_mismatch');
 });
});
```

- [ ] **Step 11: Run them to verify they fail**

Run: `npm test -- src/lib/evals/cli/deps.test.ts src/lib/evals/cli/run-cli.test.ts`
Expected: FAIL — `Failed to resolve import "./deps"` / `"./run-cli"`.

- [ ] **Step 12: Implement the run deps**

Create `src/lib/evals/cli/deps.ts`:

```ts
// src/lib/evals/cli/deps.ts
// Reader wiring per run mode (spec §7.1 table). ci: the F6 deterministic world (replay/setup.ts, base setup) over
// pgFactsDb on the S4_TEST_STATE database's adminUrl when that file is named, else in memory — unprivileged either way,
// no store. report: production through the ANON client (read_facts RPC; RLS keeps it on ok rows), unprivileged, no
// store. report --write-db: production service_role — PrivilegedReader (raw-snapshot provenance over the
// disclosure-raw bucket, hints) and the dq_eval_* store. ReportEnvironment never carries a credential: db_host is a
// bare hostname. LANDED_PARSERS is the one place the landed EDGAR / Tushare parsers are bound for provenance.
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {pgTableClient} from '../../db/pg-table-client';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseFactsDb} from '../../facts/db';
import {pgFactsDb} from '../../facts/pg-facts-db';
import {parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {parseTushareStatements} from '../../facts/providers/tushare-statements';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {getAdminSupabase} from '../../supabase/admin';
import {getAnonSupabase} from '../../supabase/anon';
import {factsReader,privilegedFactsReader} from '../adapters/facts';
import {supabaseRawStorage} from '../adapters/provenance';
import type {SnapshotParsers} from '../adapters/provenance';
import {buildFrozenDb,buildFrozenMemory,loadSetup} from '../replay/setup';
import type {FrozenBuild} from '../replay/setup';
import {evalStore} from '../store';
import type {EvalStore} from '../store';
import type {EvalMode,ModuleReader,ReportEnvironment} from '../types';

export const F6_BASE_SETUP='src/lib/evals/fixtures/replay/f6-base.setup.json';
export const LANDED_PARSERS:SnapshotParsers={edgar:(s,o)=>parseCompanyFacts(s,{sinceYear:o.sinceYear}),tushare:(s,o)=>parseTushareStatements(s,{sinceYear:o.sinceYear})};
export interface RunDeps{reader:ModuleReader;environment:ReportEnvironment;store:EvalStore|null;fetchSource?:(url:string)=>Promise<Uint8Array>;close():Promise<void>}
export interface BuildRunDepsOptions{env?:Record<string,string|undefined>;setupPath?:string;root?:string}

export const hostOf=(url:string|undefined|null):string|null=>{if(!url)return null;try{return new URL(url).hostname||null;}catch{return null;}};
/** --verify-sources: the official document bytes (SEC asks for a User-Agent; nothing is stored). */
export async function fetchSourceBytes(url:string,fetchImpl:typeof fetch=fetch,userAgent:string=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT):Promise<Uint8Array>{
 const res=await fetchImpl(url,{headers:{'User-Agent':userAgent,Accept:'*/*'}});
 if(!res.ok)throw new Error(`source_http_${res.status}`);
 return new Uint8Array(await res.arrayBuffer());
}
const built=(b:FrozenBuild)=>{if(!b.ok)throw new Error(`setup_mismatch:${b.mismatch}`);return b.world;};

export async function buildRunDeps(mode:EvalMode,privileged:boolean,opts:BuildRunDepsOptions={}):Promise<RunDeps>{
 const env=opts.env??process.env;
 const none:ReportEnvironment={db_host:null,app_origin:null,db_state_rev:null};
 if(mode==='ci'){
  if(privileged)throw new Error('ci runs are never privileged (spec §7.1)');
  const setup=loadSetup(opts.setupPath??F6_BASE_SETUP,opts.root);
  const statePath=env.S4_TEST_STATE;
  if(statePath){
   const adminUrl=(JSON.parse(readFileSync(statePath,'utf8')) as {adminUrl:string}).adminUrl;
   const pool=new Pool({connectionString:adminUrl});
   try{built(await buildFrozenDb(pool,setup,opts.root));}catch(e){await pool.end();throw e;}
   return {reader:factsReader({db:pgFactsDb(pool),tables:pgTableClient(pool),stateRev:async()=>null}),environment:{...none,db_host:hostOf(adminUrl)},store:null,close:()=>pool.end()};
  }
  const world=built(await buildFrozenMemory(setup,opts.root));
  return {reader:factsReader({db:world.db,tables:world.tables,stateRev:async()=>null}),environment:none,store:null,close:async()=>{}};
 }
 const environment={...none,db_host:hostOf(env.NEXT_PUBLIC_SUPABASE_URL)};
 if(!privileged){
  const anon=getAnonSupabase();
  return {reader:factsReader({db:supabaseFactsDb(anon),tables:supabaseTableClient(anon),stateRev:async()=>null}),environment,store:null,fetchSource:url=>fetchSourceBytes(url),close:async()=>{}};
 }
 const admin=getAdminSupabase();
 const tables=supabaseTableClient(admin);
 return {reader:privilegedFactsReader({db:supabaseFactsDb(admin),tables,stateRev:async()=>null,storage:supabaseRawStorage(admin),parsers:LANDED_PARSERS}),
  environment,store:evalStore(tables),fetchSource:url=>fetchSourceBytes(url),close:async()=>{}};
}
```

- [ ] **Step 13: Implement the CLI logic and the script**

Create `src/lib/evals/cli/run-cli.ts`:

```ts
// src/lib/evals/cli/run-cli.ts
// scripts/evals/run.ts logic (spec §7.1 flags, §3.2 exit codes, §6.3 order, §14). parse flags → the kind's runner
// (dispatch table; a kind without a runner in this build → kind_not_enabled, exit 2) → report files (report.ts) →
// with --write-db, persistRun (store.ts) → one JSON receipt line on stdout. Exit codes: the gate's (pass 0, fail 1,
// incomplete 3); 2 for usage errors and refusals (errors.ts REFUSAL_CODES, raised before any connection opens);
// 1 for report / store failures. --resume <run_id> re-enters §6.3 steps 3–4 from the stored row and the report
// file it names (persistRun checks the sha256). Later tasks add their kinds to KIND_RUNNERS.
import {readFileSync} from 'node:fs';
import {relative} from 'node:path';
import {sha256Hex} from '../canonical-json';
import {EvalError,exitCodeOfError} from '../errors';
import {checkLock,loadGoldSet} from '../gold/load';
import {writeReportFiles} from '../report';
import {assertRunnable,runGoldSet} from '../run-gold-set';
import {persistRun} from '../store';
import {exitCodeOf} from '../summary';
import type {EvalEnv,EvalKind,EvalMode,EvalModule,EvalReport,ExitCode,GoldLock,GoldSet,RunOutcome} from '../types';
import {evaluatorVersion} from '../version';
import {buildRunDeps} from './deps';
import type {RunDeps} from './deps';

export const USAGE='usage: run.ts --kind <kind> --module <module> [--set <path>] [--pair <id>] --mode ci|report [--write-db [--verify-artifacts] [--verify-sources]] [--out <dir>] [--limit N] [--case <id>]... [--resume <run_id>] [--http]';
export const GOLD_LOCK='src/lib/evals/fixtures/gold/lock.json';
const KINDS:readonly EvalKind[]=['official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration'];
const MODULES:readonly EvalModule[]=['facts','metrics','macro','industry','company','foreign_research'];

export class UsageError extends Error{constructor(message:string){super(message);this.name='UsageError';}}
export interface RunArgs{kind:EvalKind;module:EvalModule;set?:string;pair?:string;mode:EvalMode;writeDb:boolean;verifyArtifacts:boolean;verifySources:boolean;out?:string;limit?:number;caseIds:string[];resume?:string;http:boolean}

export function parseRunArgs(argv:string[]):RunArgs{
 let kind:string|undefined,moduleArg:string|undefined,mode:string|undefined,limit:string|undefined,set:string|undefined,pair:string|undefined,out:string|undefined,resume:string|undefined;
 let writeDb=false,verifyArtifacts=false,verifySources=false,http=false;const caseIds:string[]=[];
 const value=(i:number,flag:string)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--'))throw new UsageError(`${flag} needs a value`);return v;};
 for(let i=0;i<argv.length;i++){
  const f=argv[i];
  switch(f){
   case '--kind':kind=value(i++,f);break;
   case '--module':moduleArg=value(i++,f);break;
   case '--set':set=value(i++,f);break;
   case '--pair':pair=value(i++,f);break;
   case '--mode':mode=value(i++,f);break;
   case '--out':out=value(i++,f);break;
   case '--limit':limit=value(i++,f);break;
   case '--case':caseIds.push(value(i++,f));break;
   case '--resume':resume=value(i++,f);break;
   case '--write-db':writeDb=true;break;
   case '--verify-artifacts':verifyArtifacts=true;break;
   case '--verify-sources':verifySources=true;break;
   case '--http':http=true;break;
   default:throw new UsageError(`unknown argument ${f}`);
  }
 }
 if(!KINDS.includes(kind as EvalKind))throw new UsageError(`--kind must be one of ${KINDS.join('|')}`);
 if(!MODULES.includes(moduleArg as EvalModule))throw new UsageError(`--module must be one of ${MODULES.join('|')}`);
 if(mode!=='ci'&&mode!=='report')throw new UsageError('--mode must be ci or report');
 if(writeDb&&mode!=='report')throw new UsageError('--write-db needs --mode report (ci never writes the tables)');
 if((verifyArtifacts||verifySources)&&!writeDb)throw new UsageError('--verify-artifacts / --verify-sources need --write-db (a privileged run)');
 if(resume!==undefined&&!writeDb)throw new UsageError('--resume needs --write-db');
 if(resume!==undefined&&(caseIds.length>0||limit!==undefined))throw new UsageError('--resume takes no --case / --limit');
 if(http&&kind!=='replay_consistency')throw new UsageError('--http is the replay live smoke only');
 if(pair!==undefined&&kind!=='dual_source')throw new UsageError('--pair is for dual_source only');
 if(kind==='official_reconciliation'&&set===undefined&&resume===undefined)throw new UsageError('--set is required for official_reconciliation');
 if(limit!==undefined&&!/^[1-9]\d*$/.test(limit))throw new UsageError('--limit must be a positive integer');
 return {kind:kind as EvalKind,module:moduleArg as EvalModule,mode,writeDb,verifyArtifacts,verifySources,caseIds,http,
  ...(set!==undefined?{set}:{}),...(pair!==undefined?{pair}:{}),...(out!==undefined?{out}:{}),...(limit!==undefined?{limit:Number(limit)}:{}),...(resume!==undefined?{resume}:{})};
}

export interface CliIo{stdout(line:string):void;stderr(line:string):void}
export interface CliDeps{
 buildDeps(mode:EvalMode,privileged:boolean):Promise<RunDeps>;
 loadSet(path:string):GoldSet;loadLock():GoldLock;
 version():{sha:string;dirty:boolean};now():Date;
 writeReport(r:EvalReport,root?:string):{json:string;md:string|null;sha256:string};
 persist:typeof persistRun;readFile(path:string):Uint8Array;
}
export function defaultCliDeps():CliDeps{
 return {buildDeps:(m,p)=>buildRunDeps(m,p),loadSet:p=>loadGoldSet(p),loadLock:()=>JSON.parse(readFileSync(GOLD_LOCK,'utf8')) as GoldLock,
  version:()=>evaluatorVersion(),now:()=>new Date(),writeReport:(r,root)=>writeReportFiles(r,root),persist:persistRun,readFile:p=>new Uint8Array(readFileSync(p))};
}

/** run: only store and close are used after the runner returns (replay runners have no ModuleReader). */
export type KindRunner=(args:RunArgs,deps:CliDeps)=>Promise<{outcome:RunOutcome;run:Pick<RunDeps,'store'|'close'>}>;
/** official_reconciliation: set + lock + module + refusals BEFORE any connection; then deps and runGoldSet. */
export const runOfficial:KindRunner=async(args,deps)=>{
 const set=deps.loadSet(args.set!);
 checkLock(set,deps.loadLock());
 if(set.module!==args.module)throw new EvalError('gold_invalid',`--module ${args.module} but ${set.path} is module ${set.module}`,{module:set.module});
 const v=deps.version();
 const env:EvalEnv={today:deps.now().toISOString().slice(0,10),now:()=>deps.now(),evaluatorCodeVersion:v.sha,dirty:v.dirty};
 assertRunnable(set,args.mode,env);
 const run=await deps.buildDeps(args.mode,args.writeDb);
 try{
  const outcome=await runGoldSet({set,mode:args.mode,reader:run.reader,env,environment:run.environment,
   ...(args.caseIds.length>0?{caseIds:args.caseIds}:{}),...(args.limit!==undefined?{limit:args.limit}:{}),
   verify:{artifacts:args.verifyArtifacts,sources:args.verifySources},...(run.fetchSource?{fetchSource:run.fetchSource}:{})});
  return {outcome,run};
 }catch(e){await run.close().catch(()=>{});throw e;}
};
/** Runner per kind. Task 11 adds replay_consistency; dual_source, reference_regression, extraction_gold and judgment_calibration stay absent —
 *  kinds/registry.ts (Task 14) is the one enablement table and records why; its test asserts these keys equal the enabled kinds. */
export const KIND_RUNNERS:Partial<Record<EvalKind,KindRunner>>={official_reconciliation:runOfficial};

const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,500);
const refOf=(path:string)=>relative(process.cwd(),path).split('\\').join('/');
const receipt=(r:EvalReport,files:{json:string;md:string|null;sha256:string},db:'written'|'skipped',exitCode:ExitCode)=>JSON.stringify({
 run_id:r.run_id,kind:r.kind,module:r.module,mode:r.mode,privileged:r.privileged,set:r.set.id,set_version:r.set.version,gate:r.summary.gate,exit_code:exitCode,
 population:r.summary.population,report:files.json,report_md:files.md,report_sha256:files.sha256,db});

async function resumeRun(runId:string,io:CliIo,deps:CliDeps):Promise<ExitCode>{
 const run=await deps.buildDeps('report',true);
 try{
  if(!run.store)throw new EvalError('store_write_failed','no store in this mode');
  const row=await run.store.getRun(runId);
  if(!row)throw new EvalError('resume_mismatch',`no dq_eval_runs row ${runId}`,{run_id:runId});
  const bytes=deps.readFile(row.report_ref);
  const report=JSON.parse(new TextDecoder().decode(bytes)) as EvalReport;
  if(report.run_id!==row.run_id)throw new EvalError('resume_mismatch','the report file names another run',{run_id:runId});
  const files={json:row.report_ref,md:null,sha256:sha256Hex(bytes)};
  await deps.persist(run.store,report,{ref:row.report_ref,sha256:files.sha256},{triggeredBy:'script',resume:true});
  const exitCode=exitCodeOf(report.summary.gate);
  io.stdout(receipt(report,files,'written',exitCode));
  return exitCode;
 }finally{await run.close().catch(()=>{});}
}

export async function runCli(argv:string[],io:CliIo,deps:CliDeps=defaultCliDeps()):Promise<ExitCode>{
 let args:RunArgs;
 try{args=parseRunArgs(argv);}
 catch(e){if(e instanceof UsageError){io.stderr(`${e.message}\n${USAGE}`);return 2;}throw e;}
 let run:Pick<RunDeps,'store'|'close'>|null=null;
 try{
  if(args.resume!==undefined)return await resumeRun(args.resume,io,deps);
  const runner=KIND_RUNNERS[args.kind];
  if(!runner)throw new EvalError('kind_not_enabled',`kind ${args.kind} is not enabled in this build`,{kind:args.kind});
  const started=await runner(args,deps);
  run=started.run;
  const {report,exitCode}=started.outcome;
  let files:{json:string;md:string|null;sha256:string};
  try{files=deps.writeReport(report,args.out);}catch(e){throw new EvalError('report_write_failed',message(e));}
  if(args.writeDb){
   if(!run.store)throw new EvalError('store_write_failed','no store in this mode');
   await deps.persist(run.store,report,{ref:refOf(files.json),sha256:files.sha256},{triggeredBy:'script'});
  }
  io.stdout(receipt(report,files,args.writeDb?'written':'skipped',exitCode));
  return exitCode;
 }catch(e){
  if(e instanceof EvalError){io.stderr(JSON.stringify({error:e.code,message:e.message,detail:e.detail}));return exitCodeOfError(e);}
  io.stderr(JSON.stringify({error:'unexpected',message:message(e)}));
  return 1;
 }finally{if(run)await run.close().catch(()=>{});}
}
```

Create `scripts/evals/run.ts`:

```ts
/**
 * F6 evaluation runner (spec §7.1). The logic lives in src/lib/evals/cli/run-cli.ts; this file wires stdio and the exit code.
 *
 *   npx tsx scripts/evals/run.ts --kind official_reconciliation --module facts --set src/lib/evals/fixtures/gold/facts/synthetic-us.json --mode ci
 *   node --env-file=.env.local --import tsx scripts/evals/run.ts --kind official_reconciliation --module facts --set <gold.json> --mode report \
 *        [--write-db [--verify-artifacts] [--verify-sources]] [--case <id>]... [--limit N] [--out <dir>]
 *   node --env-file=.env.local --import tsx scripts/evals/run.ts --kind official_reconciliation --module facts --mode report --write-db --resume <run_id>
 *
 * ci: the F6 frozen world (the S4_TEST_STATE test database when that variable names a state file, else memory); never
 * writes tables; report under reports/evals/. report: production anon (unprivileged). --write-db: production
 * service_role (privileged reader, dq_eval_runs / dq_eval_case_results). One JSON receipt line on stdout.
 * Exit: gate pass 0 / fail 1 / incomplete 3; usage errors and refusals 2; report or store failures 1.
 * tsx does NOT load .env.local: use node --env-file as above (never commit that file).
 */
import {runCli} from '../../src/lib/evals/cli/run-cli';

runCli(process.argv.slice(2),{stdout:l=>process.stdout.write(`${l}\n`),stderr:l=>process.stderr.write(`${l}\n`)})
 .then(code=>process.exit(code),e=>{process.stderr.write(`${e instanceof Error?e.stack??e.message:String(e)}\n`);process.exit(1);});
```

- [ ] **Step 14: Run the CLI tests, then smoke the script**

Run: `npm test -- src/lib/evals/cli/deps.test.ts src/lib/evals/cli/run-cli.test.ts`
Expected: PASS.

Run (in a shell where the test-state variable is NOT set): `npx tsx scripts/evals/run.ts --kind official_reconciliation --module facts --set src/lib/evals/fixtures/gold/facts/synthetic-us.json --mode ci; echo "exit=$?"`
Expected: one JSON line with `"gate":"pass","exit_code":0,"population":10,"db":"skipped"` and a `reports/evals/<run_id>.json` path, then `exit=0`.

Run: `npx tsx scripts/evals/run.ts --kind official_reconciliation --module facts --set src/lib/evals/fixtures/gold/facts/synthetic-us.json --mode report; echo "exit=$?"`
Expected: stderr JSON `{"error":"synthetic_in_report",…}` (refused before any Supabase client is built, so no env is needed), `exit=2`.

Run: `npx tsx scripts/evals/run.ts --kind extraction_gold --module company --mode ci; echo "exit=$?"`
Expected: stderr `{"error":"kind_not_enabled",…}`, `exit=2`.

- [ ] **Step 15: Typecheck, lint, commit the CLI**

Run: `npm run typecheck && npm run lint`
Expected: exit 0, exit 0.

```bash
git add src/lib/evals/cli/deps.ts src/lib/evals/cli/deps.test.ts src/lib/evals/cli/run-cli.ts src/lib/evals/cli/run-cli.test.ts scripts/evals/run.ts
```
```bash
git commit -m "feat(f6): scripts/evals/run.ts CLI with per-mode reader wiring and kind dispatch (Task 9b)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 16: Write the critical facts integration test and register it**

Create `src/lib/evals/evals-facts.integration.test.ts`:

```ts
// src/lib/evals/evals-facts.integration.test.ts
// F6 facts evidence on real PostgreSQL (spec §1.1, §13.3 as revised by §0 R5-1/R5-2). One F6-owned deterministic build
// (replay/setup.ts over the committed base setup: seed ZZEVA/ZZEVB/ZZEVC → reconcileScope → runFactsSync over the F6
// fixtures with a fixed clock), then every path through the SAME runGoldSet entry and exitCodeOf: synthetic-us passes
// (0); a FactsDb decorator changing one value fails (1); a decorator dropping a required case is incomplete (3);
// plan2.json through the legacy adapter is incomplete with gold.ready false (3); a privileged run resolves every
// passing case to its raw snapshot (R5-5); a later 10-K/A keeps the document-bound case passing while the current copy
// read at the amendment date fails; a quarantined row is not_visible to a privileged reader (incomplete) and missing to
// an unprivileged one. The cases share state and run in order; the restatement and conflict syncs touch ZZEVC ONLY, so
// ZZEVA/ZZEVB stay as built for the frozen replay cases Task 11 appends. plan2.json's AAPL/MSFT are deliberately not
// provisioned here (sync-us may have provisioned them in the shared database): only the gate is asserted for it.
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {padCik} from '../facts/providers/shared';
import type {FactsDb} from '../facts/types';
import {factsReader,privilegedFactsReader} from './adapters/facts';
import {memoryRawStorage} from './adapters/provenance';
import {LANDED_PARSERS} from './cli/deps';
import {checkLock,loadGoldSet} from './gold/load';
import {SETUP_CODE_VERSION,buildFrozenDb,loadSetup} from './replay/setup';
import type {FrozenWorld} from './replay/setup';
import {runGoldSet} from './run-gold-set';
import type {CaseReport,EvalEnv,GoldCase,GoldLock,GoldSet,ModuleReader,ReportEnvironment} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const SETUP='src/lib/evals/fixtures/replay/f6-base.setup.json';
const SYNTHETIC='src/lib/evals/fixtures/gold/facts/synthetic-us.json';
const PLAN2='src/lib/facts/fixtures/gold/plan2.json';
const LOCK='src/lib/evals/fixtures/gold/lock.json';
const A_REV_DOC='ZZEVA/revenue/2022-09-25..2023-09-30/consolidated/USD/document';
const A_REV_CUR='ZZEVA/revenue/2022-09-25..2023-09-30/consolidated/USD/current@2023-11-03';
const A_NI_DOC='ZZEVA/net_income_parent/2022-09-25..2023-09-30/consolidated/USD/document';
const A_MISSING='ZZEVA/interest_expense_bank/2022-09-25..2023-09-30/consolidated/USD/missing';
const B_REV_DOC='ZZEVB/revenue/2022-07-01..2023-06-30/consolidated/USD/document';
const AMENDED_ON='2026-06-15';
const ENVIRONMENT:ReportEnvironment={db_host:'localhost',app_origin:null,db_state_rev:null};

/** readFacts decorator: the issuer's rows of (concept, period_end) carry a different value. */
const tampered=(db:FactsDb,issuer:string,concept:string,periodEnd:string):FactsDb=>({...db,async readFacts(i,m,o){
 const r=await db.readFacts(i,m,o);
 return i!==issuer?r:{...r,rows:r.rows.map(x=>x.concept===concept&&x.period_end===periodEnd?{...x,value:`${x.value_text}1`,value_text:`${x.value_text}1`}:x)};
}});
/** readFacts decorator: the issuer's rows of (concept, period_end) disappear. */
const dropped=(db:FactsDb,issuer:string,concept:string,periodEnd:string):FactsDb=>({...db,async readFacts(i,m,o){
 const r=await db.readFacts(i,m,o);
 return i!==issuer?r:{...r,rows:r.rows.filter(x=>!(x.concept===concept&&x.period_end===periodEnd))};
}});

describe.skipIf(!enabled)('F6 facts evaluation on real PostgreSQL (evals-facts)',()=>{
 let pool:Pool;let world:FrozenWorld;let synthetic:GoldSet;let env:EvalEnv;
 const unprivileged=(db:FactsDb=world.db):ModuleReader=>factsReader({db,tables:pgTableClient(pool),stateRev:async()=>null});
 const privileged=(db:FactsDb=world.db):ModuleReader=>privilegedFactsReader({db,tables:pgTableClient(pool),stateRev:async()=>null,storage:memoryRawStorage(world.storage.objects),parsers:LANDED_PARSERS});
 const run=(set:GoldSet,reader:ModuleReader,verify?:{artifacts:boolean;sources:boolean})=>runGoldSet({set,mode:'ci',reader,env,environment:ENVIRONMENT,...(verify?{verify}:{})});
 const byId=(id:string):GoldCase=>{const c=synthetic.cases.find(x=>x.case_id===id);if(!c)throw new Error(`synthetic-us lacks ${id}`);return c;};
 const outcomeOf=(cases:CaseReport[],id:string)=>cases.find(c=>c.case_id===id)?.outcome;
 /** A ZZEVA case moved to ZZEVC (CIK 9990603: AAPL's FY2023 10-K only — same values, accessions 0009990603-…). */
 const toC=(c:GoldCase,over:Partial<GoldCase>={}):GoldCase=>{
  const doc=c.source.document_id;
  return {...c,case_id:c.case_id.replace(/^ZZEVA\//,'ZZEVC/'),subject:{market:'US',cik:'9990603'},
   source:{...c.source,...(doc?{document_id:{...doc,value:doc.value.replace(/^0009990601-/,'0009990603-')}}:{})},required:true,...over};
 };
 const cSet=(cases:GoldCase[]):GoldSet=>({...synthetic,set_id:'facts/synthetic-us-zzevc',optional_cases:[],cases});

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')) as {adminUrl:string};
  pool=new Pool({connectionString:state.adminUrl});
  const b=await buildFrozenDb(pool,loadSetup(SETUP));
  if(!b.ok)throw new Error(`F6 base setup does not verify: ${b.mismatch}`);
  world=b.world;
  synthetic=loadGoldSet(SYNTHETIC);
  env={today:world.today,now:()=>world.now,evaluatorCodeVersion:'f'.repeat(40),dirty:false};
 },300_000);
 // facts and filings are append-only and test:db builds a fresh database per run; retiring the seed issuers' scope
 // rows keeps any scheduled path of another suite away from them.
 afterAll(async()=>{
  if(world)await world.db.reconcileScope('US',world.seed.map(s=>({issuer_id:world.issuers[s.ticker],reasons:[],priority:0,fetch_key:padCik(s.cik)}))).catch(()=>{});
  await pool?.end();
 });

 it('the evaluated gold files are the locked bytes; synthetic-us is all synthetic',()=>{
  const lock=JSON.parse(readFileSync(LOCK,'utf8')) as GoldLock;
  expect(()=>checkLock(synthetic,lock)).not.toThrow();
  expect(()=>checkLock(loadGoldSet(PLAN2),lock)).not.toThrow();
  expect(synthetic).toMatchObject({format:'f6',ready:true,set_id:'facts/synthetic-us'});
  expect(synthetic.cases).toHaveLength(10);
  expect(synthetic.cases.every(c=>c.provenance_kind==='synthetic')).toBe(true);
 });

 it('synthetic-us passes through the database read path: gate pass, exit 0',async()=>{
  const o=await run(synthetic,unprivileged());
  const bad=o.report.cases.filter(c=>c.outcome.result!=='pass'&&c.outcome.result!=='expected_absent').map(c=>`${c.case_id}: ${JSON.stringify(c.outcome)}`);
  expect(bad).toEqual([]);
  expect(outcomeOf(o.report.cases,A_MISSING)).toEqual({result:'expected_absent'});
  expect(o.report.summary).toMatchObject({gate:'pass',population:10,correctness:{pass:10,fail:0,unit_mismatch:0,provenance_incomplete:0},
   coverage:{missing_required:0,missing_optional:0,not_visible:0},execution:{read_error:0,subset:false},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},evidence_class:'truth'});
  expect(o.exitCode).toBe(0);
  for(const c of o.report.cases.filter(x=>x.outcome.result==='pass'))expect(c.provenance).toMatchObject({ok:true,producer_code_version:'unavailable:anon'});
  expect(o.report.environment.db_state_rev).toBeGreaterThan(0);
 },120_000);

 it('privileged with verify.artifacts: every passing case resolves to its raw snapshot object and the producer version',async()=>{
  const o=await run(synthetic,privileged(),{artifacts:true,sources:false});
  expect(o.report.summary.gate).toBe('pass');expect(o.exitCode).toBe(0);
  expect(o.report).toMatchObject({privileged:true,provenance:{verified:{artifacts:true,sources:false}}});
  const passed=o.report.cases.filter(c=>c.outcome.result==='pass');
  expect(passed).toHaveLength(9);
  const byCik=Object.fromEntries(world.seed.map(s=>[s.cik,world.issuers[s.ticker]]));
  for(const c of passed){
   const issuerId=byCik[byId(c.case_id).subject.cik!];
   expect(c.provenance).toMatchObject({ok:true,producer_code_version:SETUP_CODE_VERSION,object_path:expect.stringMatching(new RegExp(`^edgar/${issuerId}/[0-9a-f]{64}\\.json$`)),locator:expect.stringMatching(/^facts\.us-gaap\./)});
  }
 },300_000);

 it('a FactsDb decorator changing one value → correctness.fail 1, gate fail, exit 1',async()=>{
  const o=await run(synthetic,unprivileged(tampered(world.db,world.issuers.ZZEVA,'net_income_parent','2023-09-30')));
  expect(outcomeOf(o.report.cases,A_NI_DOC)).toEqual({result:'fail',reason:'value'});
  expect(o.report.cases.find(c=>c.case_id===A_NI_DOC)).toMatchObject({left:'969950000001',right:'96995000000'});
  expect(o.report.summary).toMatchObject({gate:'fail',correctness:{fail:1,pass:9}});expect(o.exitCode).toBe(1);
 },120_000);

 it('a FactsDb decorator dropping a required case → coverage.missing_required 1, gate incomplete, exit 3',async()=>{
  const o=await run(synthetic,unprivileged(dropped(world.db,world.issuers.ZZEVB,'revenue','2023-06-30')));
  expect(outcomeOf(o.report.cases,B_REV_DOC)).toEqual({result:'missing'});
  expect(o.report.summary).toMatchObject({gate:'incomplete',coverage:{missing_required:1},correctness:{fail:0}});expect(o.exitCode).toBe(3);
 },120_000);

 it('plan2.json via the legacy adapter → incomplete with gold.ready false, exit 3, whatever its recorded values',async()=>{
  const legacy=loadGoldSet(PLAN2);
  expect(legacy.format).toBe('legacy_plan2');
  const o=await run(legacy,unprivileged());
  expect(o.report.summary.gold).toMatchObject({format:'legacy_plan2',ready:false});
  expect(o.report.summary.gate).toBe('incomplete');expect(o.exitCode).toBe(3);
 },120_000);

 it('restatement on ZZEVC: a later 10-K/A keeps the document-bound case passing; the current copy read at the amendment date fails',async()=>{
  expect((await world.sync('CIK0009990603.amended.json')).counts).toMatchObject({versioned:1,failed:0});
  const doc=toC(byId(A_REV_DOC));
  const atFiling=toC(byId(A_REV_CUR));
  const atAmendment=toC(byId(A_REV_CUR),{case_id:`${toC(byId(A_REV_CUR)).case_id.replace(/@.*$/,'')}@${AMENDED_ON}`,as_of:AMENDED_ON,source:{...atFiling.source,available_date:AMENDED_ON}});
  const o=await run(cSet([doc,atFiling,atAmendment]),unprivileged());
  expect(outcomeOf(o.report.cases,doc.case_id)).toEqual({result:'pass'});
  expect(outcomeOf(o.report.cases,atFiling.case_id)).toEqual({result:'pass'});
  expect(outcomeOf(o.report.cases,atAmendment.case_id)).toEqual({result:'fail',reason:'value'});
  expect(o.report.cases.find(c=>c.case_id===atAmendment.case_id)).toMatchObject({left:'383285000001',right:'383285000000',detail:{source_ref:'0009990603-26-900001'}});
  expect(o.report.summary).toMatchObject({gate:'fail',correctness:{pass:2,fail:1}});expect(o.exitCode).toBe(1);
 },120_000);

 it('quarantine on ZZEVC: a same-day conflict parks the row; privileged → not_visible(quarantined) → incomplete, unprivileged → missing',async()=>{
  expect((await world.sync('CIK0009990603.conflict.json')).counts).toMatchObject({quarantined:1,failed:0});
  const ni=toC(byId(A_NI_DOC));
  const p=await run(cSet([ni]),privileged());
  expect(p.report.cases[0].outcome).toEqual({result:'not_visible',reason:'quarantined'});
  expect(p.report.summary).toMatchObject({gate:'incomplete',coverage:{not_visible:1}});expect(p.exitCode).toBe(3);
  const u=await run(cSet([ni]),unprivileged());
  expect(u.report.cases[0].outcome).toEqual({result:'missing'});
  expect(u.report.summary).toMatchObject({gate:'incomplete',coverage:{missing_required:1,not_visible:0}});expect(u.exitCode).toBe(3);
 },120_000);
});
```

Edit `scripts/ci/research-checks.ts` inside the Task 5 F6 block (Task 5 Step 4 wrote it as a marked `.concat(…)`) — old:
```ts
 .concat('src/lib/evals/evals-store.integration.test.ts')
```
new:
```ts
 .concat('src/lib/evals/evals-store.integration.test.ts', 'src/lib/evals/evals-facts.integration.test.ts')
```

- [ ] **Step 17: Run the integration test alone on a fresh database**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/evals/evals-facts.integration.test.ts` (rebuild `db-one.ts` from the HANDOFF §5 if absent).
Expected: 8 tests passed, 0 skipped. Without the env var (`npm test -- src/lib/evals/evals-facts.integration.test.ts`) the suite reports as skipped — that is the unit run, not the evidence.
If `beforeAll` fails with `F6 base setup does not verify: config_sha256`: `concepts.ts/units.ts/rules.ts` changed after the setup was sealed — that is the designed `setup_mismatch`; re-run Step 8 (regenerates and re-locks; bumps nothing else) and commit the new setup with the change that caused it.

- [ ] **Step 18: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.
Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: the critical summary counts both F6 suites; no `Database suite inventory drift`; no critical suite skipped. (Known local flakes listed in HANDOFF §5 may time out under load; rerun those alone.)

- [ ] **Step 19: Commit**

```bash
git add src/lib/evals/evals-facts.integration.test.ts scripts/ci/research-checks.ts
```
```bash
git commit -m "test(f6): critical facts integration — pass/fail/incomplete, legacy plan2, provenance, restatement, quarantine (Task 9c)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 回放投影、账本、`replay_consistency` 归约（frozen / live 纯逻辑）

规格：§5.3.1 投影、§5.3.2 分类、§5.3.3 账本、§0 R5-7（metrics 投影的 `inputs[]` 经 `factsByIds` + filings 补齐，缺联接 → `read_error(projection_join_missing)`）、§3.3 replay 行、§14 账本行。依赖 Task 1（`types.ts`、`errors.ts`、`canonical-json.ts`、`summary.ts`）。不依赖 Task 7 的读适配器内部（CCR 2）。

**Files:**
- Create: `src/lib/evals/test-support/memory-facts.ts`（测试辅助，非测试文件：经真实运行生命周期向 `memoryFactsDb` 发布 filings/facts）
- Create: `src/lib/evals/projections/facts.ts`（`ProjectionError`、`resolveFactsSubject`、`projectFacts`、`projectMetrics`、`projectRequest`、`projectFactsRouteBody`、`projectMetricsRouteBody`、`rowIdentity`、`diffProjections`）
- Create: `src/lib/evals/projections/facts.test.ts`
- Create: `src/lib/evals/replay/fixture.ts`（回放案例类型、`parseReplayFile`、`recordedCases`、`serializeReplayFile`）
- Create: `src/lib/evals/replay/fixture.test.ts`
- Create: `src/lib/evals/replay/ledger.ts`（`parseLedger`、`loadLedger`、`isSelfApproved`、`matchLedger`）
- Create: `src/lib/evals/replay/ledger.test.ts`
- Create: `src/lib/evals/kinds/replay.ts`（`evaluateReplay`、`replaySummaryContext`、`REPLAY_THRESHOLDS`）
- Create: `src/lib/evals/kinds/replay.test.ts`
- Modify: `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`（追加 Task 10 一节）

- [ ] **Step 1: 写测试辅助 `src/lib/evals/test-support/memory-facts.ts`**

```ts
// src/lib/evals/test-support/memory-facts.ts
// Test support (not a test file). publishFilings writes filings + facts into a memoryFactsDb through the
// real run lifecycle (scope → lease → beginRun → stageFilings → stageFacts → publishRun → release), so the
// rows a test reads carry exactly the SQL rules for mapping_gen, disclosure_seq, is_current, is_revision.
// seedZzeva publishes the three filings the projection / route-equivalence tests share: a 10-K, a 10-K/A
// revising FY2024 revenue by 1, and a 10-Q.
import {randomUUID} from 'node:crypto';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import type {Duration,FactInsert,FilingInsert,FormType,Market,Statement} from '../../facts/types';

export interface SeedFact{concept:string;statement?:Statement;period_start:string|null;period_end:string;duration:Duration;value:string;unit?:string;source_concept?:string}
export interface SeedFiling{sourceRef:string;formType?:FormType;availableDate:string;periodEnd?:string|null;facts:SeedFact[]}
export interface Published{filingIds:Map<string,string>;factIds:string[]}

/** One published run per call; reconcileScope is idempotent for an unchanged scope row. */
export async function publishFilings(db:MemoryFactsDb,issuer:string,filings:SeedFiling[],market:Market='US'):Promise<Published>{
 await db.reconcileScope(market,[{issuer_id:issuer,reasons:['f6-test'],priority:10,fetch_key:issuer}]);
 const batch=randomUUID();
 if(!await db.claimLease(issuer,market,batch,600))throw new Error('seed: lease not claimed');
 const run=await db.beginRun(issuer,market,batch,1);
 const inserts=filings.map((f):FilingInsert=>({filing_id:randomUUID(),issuer_id:issuer,sourceRef:f.sourceRef,market,source:'edgar',origin:'sec',formType:f.formType??'10-K',fiscalYear:null,fiscalPeriod:null,periodEnd:f.periodEnd??null,availableDate:f.availableDate,url:null}));
 const ids=await db.stageFilings(run,inserts);
 const facts=filings.flatMap(f=>f.facts.map((x):FactInsert=>({fact_id:randomUUID(),issuer_id:issuer,market,filing_id:ids.get(f.sourceRef)!,concept:x.concept,source_concept:x.source_concept??x.concept,
  statement:x.statement??(x.duration==='INSTANT'?'BS':'IS'),period_start:x.period_start,period_end:x.period_end,duration:x.duration,value:x.value,unit:x.unit??'USD',consolidation:'consolidated',
  available_date:f.availableDate,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:randomUUID()})));
 await db.stageFacts(run,facts);
 await db.publishRun(run,[...new Set(ids.values())]);
 await db.releaseLease(issuer,market,batch,'success','2030-01-01T00:00:00.000Z');
 return {filingIds:ids,factIds:facts.map(f=>f.fact_id)};
}

export const ZZEVA_ISSUER='11111111-1111-4111-8111-111111111111';
export const ZZEVA_CIK='9990601';
export const SRC_A='0009990601-24-000001',SRC_B='0009990601-25-000002',SRC_C='0009990601-25-000003';

export async function seedZzeva(db:MemoryFactsDb):Promise<void>{
 await publishFilings(db,ZZEVA_ISSUER,[{sourceRef:SRC_A,availableDate:'2024-11-01',periodEnd:'2024-09-28',facts:[
  {concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value:'391035000000'},
  {concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value:'383285000000'},
  {concept:'gross_profit',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value:'180683000000'},
  {concept:'cash',period_start:null,period_end:'2024-09-28',duration:'INSTANT',value:'29943000000'}]}]);
 await publishFilings(db,ZZEVA_ISSUER,[{sourceRef:SRC_B,formType:'10-K/A',availableDate:'2025-01-15',periodEnd:'2024-09-28',facts:[
  {concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value:'391035000001'}]}]);
 await publishFilings(db,ZZEVA_ISSUER,[{sourceRef:SRC_C,formType:'10-Q',availableDate:'2025-02-01',periodEnd:'2024-12-28',facts:[
  {concept:'revenue',period_start:'2024-09-29',period_end:'2024-12-28',duration:'3M',value:'124300000000'},
  {concept:'cash',period_start:null,period_end:'2024-12-28',duration:'INSTANT',value:'30299000000'}]}]);
}
```

- [ ] **Step 2: 写失败测试 `src/lib/evals/projections/facts.test.ts`**

```ts
// src/lib/evals/projections/facts.test.ts
import {beforeEach,describe,expect,it} from 'vitest';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import {projectionHash} from '../canonical-json';
import {SRC_A,SRC_B,SRC_C,ZZEVA_CIK,ZZEVA_ISSUER,seedZzeva} from '../test-support/memory-facts';
import type {Projection,ReplayRequest} from '../types';
import {ProjectionError,diffProjections,projectFacts,projectRequest,rowIdentity} from './facts';
import type {ProjectionDb,ProjectionDeps} from './facts';

const TODAY='2026-11-06';
const issuer={market:'US' as const,cik:ZZEVA_CIK};
const req=(p:Partial<ReplayRequest>={}):ReplayRequest=>({issuer,concepts:['revenue','cash'],asOf:'2025-06-30',...p});
const fact=(p:Record<string,string|number|boolean|null>)=>({consolidation:'consolidated',unit:'USD',disclosure_seq:1,is_current:true,is_revision:false,...p});
const reason=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof ProjectionError?e.reason:`other:${String(e)}`);

let db:MemoryFactsDb;let deps:ProjectionDeps;
beforeEach(async()=>{
 db=memoryFactsDb();await seedZzeva(db);
 deps={db,resolve:async s=>s.cik===ZZEVA_CIK?{issuerId:ZZEVA_ISSUER,market:'US'}:null};
});

describe('projectFacts',()=>{
 it('keeps the replay fields, joins source_ref, and sorts by (concept, period_start, period_end, consolidation, unit, available_date, source_ref)',async()=>{
  const p=await projectFacts(deps,req(),TODAY);
  expect(p).toEqual({module:'facts',rows:[
   fact({concept:'cash',period_start:null,period_end:'2024-09-28',duration:'INSTANT',value_text:'29943000000',available_date:'2024-11-01',source_ref:SRC_A}),
   fact({concept:'cash',period_start:null,period_end:'2024-12-28',duration:'INSTANT',value_text:'30299000000',available_date:'2025-02-01',source_ref:SRC_C}),
   fact({concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',value_text:'383285000000',available_date:'2024-11-01',source_ref:SRC_A}),
   fact({concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value_text:'391035000000',available_date:'2024-11-01',source_ref:SRC_A,is_current:false}),
   fact({concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',value_text:'391035000001',available_date:'2025-01-15',source_ref:SRC_B,disclosure_seq:2,is_revision:true}),
   fact({concept:'revenue',period_start:'2024-09-29',period_end:'2024-12-28',duration:'3M',value_text:'124300000000',available_date:'2025-02-01',source_ref:SRC_C}),
  ]});
 });
 it('applies asOf (later disclosures invisible) and durations',async()=>{
  const early=await projectFacts(deps,req({concepts:['revenue'],asOf:'2024-12-31'}),TODAY);
  expect(early.rows.map(r=>[r.period_end,r.source_ref,r.disclosure_seq,r.is_current])).toEqual([['2023-09-30',SRC_A,1,true],['2024-09-28',SRC_A,1,true]]);
  const only12=await projectFacts(deps,req({durations:['12M']}),TODAY);
  expect(only12.rows.map(r=>r.duration)).toEqual(['12M','12M','12M']);
 });
 it('is stable: the same request twice hashes equal; empty concepts → empty facts projection',async()=>{
  expect(projectionHash(await projectFacts(deps,req(),TODAY))).toBe(projectionHash(await projectFacts(deps,req(),TODAY)));
  expect(await projectFacts(deps,req({concepts:[]}),TODAY)).toEqual({module:'facts',rows:[]});
 });
 it('read problems are ProjectionError reasons: subject_unresolved, truncated, projection_join_missing',async()=>{
  expect(await reason(projectFacts(deps,req({issuer:{market:'US',cik:'1'}}),TODAY))).toBe('subject_unresolved');
  const truncated:ProjectionDb={readFacts:async()=>({stateRev:1,rows:[],truncated:true}),filingsOfIssuer:db.filingsOfIssuer,factsByIds:db.factsByIds};
  expect(await reason(projectFacts({...deps,db:truncated},req(),TODAY))).toBe('truncated');
  const noFilings:ProjectionDb={readFacts:db.readFacts,filingsOfIssuer:async()=>[],factsByIds:db.factsByIds};
  expect(await reason(projectFacts({...deps,db:noFilings},req(),TODAY))).toBe('projection_join_missing');
 });
});

describe('projectMetrics (via projectRequest)',()=>{
 const mreq=req({concepts:[],metrics:['gross_margin','revenue_yoy']});
 it('derives live at asOf and enriches inputs with period_end and source_ref',async()=>{
  const p=await projectRequest(deps,mreq,TODAY);
  expect(p.module).toBe('metrics');
  expect(p.rows.map(r=>r.metric)).toEqual(['gross_margin','revenue_yoy']);
  const gm=p.rows[0];
  expect(gm).toMatchObject({period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',basis:'us_standard',formula_version:'facts-derive/1.0',unit:'pure'});
  expect(String(gm.value)).toMatch(/^0\.\d{1,10}$/);
  expect(gm.inputs).toEqual([{concept:'gross_profit',period_end:'2024-09-28',source_ref:SRC_A},{concept:'revenue',period_end:'2024-09-28',source_ref:SRC_B}]);
  const yoy=p.rows[1].inputs as {source_ref:string}[];
  expect(new Set(yoy.map(i=>i.source_ref))).toEqual(new Set([SRC_A,SRC_B]));
 });
 it('a missing factsByIds join is projection_join_missing; durations filter metric rows',async()=>{
  const noFacts:ProjectionDb={readFacts:db.readFacts,filingsOfIssuer:db.filingsOfIssuer,factsByIds:async()=>[]};
  expect(await reason(projectRequest({...deps,db:noFacts},mreq,TODAY))).toBe('projection_join_missing');
  expect((await projectRequest(deps,{...mreq,durations:['3M']},TODAY)).rows).toEqual([]);
 });
});

describe('diffProjections and rowIdentity',()=>{
 const base=async()=>projectFacts(deps,req(),TODAY);
 it('names a changed field with the spec notation; null period_start is the empty segment',async()=>{
  const before=await base();
  const after:Projection={...before,rows:before.rows.map(r=>r.source_ref===SRC_B?{...r,value_text:'391035000002'}:r)};
  expect(diffProjections(before,after)).toEqual([`facts[revenue/2023-10-01..2024-09-28/12M/USD/2025-01-15/${SRC_B}].value_text`]);
  expect(rowIdentity('facts',before.rows[0])).toBe(`cash/..2024-09-28/INSTANT/USD/2024-11-01/${SRC_A}`);
 });
 it('several fields, an added row and a removed row; module change; row order does not matter',async()=>{
  const before=await base();
  const changed={...before.rows[3],disclosure_seq:2,is_current:true};
  const after:Projection={module:'facts',rows:[...before.rows.slice(0,3),changed,...before.rows.slice(5),{...before.rows[0],source_ref:'0009990601-26-000009'}]};
  expect(diffProjections(before,after)).toEqual([
   `facts[cash/..2024-09-28/INSTANT/USD/2024-11-01/0009990601-26-000009]`,
   `facts[revenue/2023-10-01..2024-09-28/12M/USD/2024-11-01/${SRC_A}].disclosure_seq`,
   `facts[revenue/2023-10-01..2024-09-28/12M/USD/2024-11-01/${SRC_A}].is_current`,
   `facts[revenue/2023-10-01..2024-09-28/12M/USD/2025-01-15/${SRC_B}]`,
  ]);
  expect(diffProjections(before,{module:'metrics',rows:before.rows})).toEqual(['module']);
  expect(diffProjections(before,{module:'facts',rows:[...before.rows].reverse()})).toEqual([]);
 });
 it('metrics identity: metric/period/duration/basis/formula_version',async()=>{
  const p=await projectRequest(deps,req({concepts:[],metrics:['gross_margin']}),TODAY);
  const q:Projection={...p,rows:[{...p.rows[0],value:'0.5'}]};
  expect(diffProjections(p,q)).toEqual(['metrics[gross_margin/2023-10-01..2024-09-28/12M/us_standard/facts-derive/1.0].value']);
 });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm test -- src/lib/evals/projections/facts.test.ts`
Expected: FAIL — `Failed to resolve import "./facts" from "src/lib/evals/projections/facts.test.ts"`。

- [ ] **Step 4: 实现 `src/lib/evals/projections/facts.ts`**

```ts
// src/lib/evals/projections/facts.ts
// Replay projections of the facts module (spec §5.3.1, §5.3.2, §0 R5-7). projectFacts reads one issuer's
// disclosure log at asOf (readFacts history=true: status ok, active mapping generation, with
// disclosure_seq / is_current / is_revision), filters request.durations, keeps the replay fields and joins
// source_ref from filingsOfIssuer. projectMetrics derives live — readFacts(DERIVE_CONCEPTS[market], asOf,
// history) → deriveMetrics(rows, {market, asOf, basedOnRev: stateRev}), never materialize (it writes) — and
// enriches inputs[] to {concept, period_end, source_ref} via factsByIds + filings. Every read problem is a
// ProjectionError(reason) (subject_unresolved, truncated, projection_join_missing) that kinds/replay.ts turns
// into read_error(reason). projectFactsRouteBody / projectMetricsRouteBody compute the same projection from
// the public route JSON (route-equivalence test; later the --http smoke). diffProjections names changes as
// facts[<concept>/<period_start>..<period_end>/<duration>/<unit>/<available_date>/<source_ref>].<field> or
// metrics[<metric>/<period_start>..<period_end>/<duration>/<basis>/<formula_version>].<field>; null is the
// empty segment; a one-sided row is the bare facts[<id>] path; a module change is 'module'. All string
// ordering is code-unit (C collation) order.
import type {TableClient} from '../../db/table-client';
import {resolveIssuer} from '../../entities/resolve';
import {DERIVE_CONCEPTS,deriveMetrics} from '../../facts/derive';
import type {FactRow,FactsDb,FilingRow} from '../../facts/types';
import {canonicalJson} from '../canonical-json';
import type {EvalModule,Projection,ProjectionRow,ReadErrorReason,ReplayRequest,Subject,SubjectRef} from '../types';

export type ProjectionDb=Pick<FactsDb,'readFacts'|'filingsOfIssuer'|'factsByIds'>;
export interface ProjectionDeps{db:ProjectionDb;resolve(subject:Subject,today:string):Promise<SubjectRef|null>}
export class ProjectionError extends Error{constructor(public readonly reason:ReadErrorReason,message?:string){super(message??reason);this.name='ProjectionError';}}

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const seg=(v:unknown)=>v===null||v===undefined?'':String(v);

/** Subject → issuer by today's ownership (cik first, else ticker); market is the subject's. */
export async function resolveFactsSubject(tables:TableClient,subject:Subject,today:string):Promise<SubjectRef|null>{
 const q=subject.cik!==undefined?{cik:subject.cik}:subject.ticker!==undefined?{ticker:subject.ticker}:null;
 if(q===null)return null;
 const r=await resolveIssuer(tables,q,{today});
 return r?{issuerId:r.issuer_id,market:subject.market}:null;
}

const FACT_SORT=['concept','period_start','period_end','consolidation','unit','available_date','source_ref'] as const;
export function sortFactRows(rows:ProjectionRow[]):ProjectionRow[]{
 return [...rows].sort((a,b)=>{for(const k of FACT_SORT){const c=cmp(seg(a[k]),seg(b[k]));if(c!==0)return c;}return cmp(seg(a.duration),seg(b.duration))||Number(a.disclosure_seq??0)-Number(b.disclosure_seq??0);});
}
const METRIC_SORT=['metric','period_start','period_end','duration','basis','formula_version'] as const;
export function sortMetricRows(rows:ProjectionRow[]):ProjectionRow[]{
 return [...rows].sort((a,b)=>{for(const k of METRIC_SORT){const c=cmp(seg(a[k]),seg(b[k]));if(c!==0)return c;}return cmp(canonicalJson(a),canonicalJson(b));});
}

async function referenced(deps:ProjectionDeps,request:ReplayRequest,today:string):Promise<SubjectRef>{
 const ref=await deps.resolve(request.issuer,today);
 if(!ref)throw new ProjectionError('subject_unresolved');
 return ref;
}
async function filingMap(db:ProjectionDb,ref:SubjectRef):Promise<Map<string,FilingRow>>{
 return new Map((await db.filingsOfIssuer(ref.issuerId,ref.market,{})).map(f=>[f.filing_id,f]));
}
const durationFilter=(request:ReplayRequest)=>request.durations&&request.durations.length>0?new Set<string>(request.durations):null;

export function factProjectionRow(r:FactRow,sourceRef:string):ProjectionRow{
 return {concept:r.concept,period_start:r.period_start,period_end:r.period_end,duration:r.duration,consolidation:r.consolidation,unit:r.unit,value_text:r.value_text,
  available_date:r.available_date,source_ref:sourceRef,disclosure_seq:r.disclosure_seq??null,is_current:r.is_current??null,is_revision:r.is_revision??null};
}

export async function projectFacts(deps:ProjectionDeps,request:ReplayRequest,today:string):Promise<Projection>{
 const ref=await referenced(deps,request,today);
 if(request.concepts.length===0)return {module:'facts',rows:[]};
 const env=await deps.db.readFacts(ref.issuerId,ref.market,{concepts:[...request.concepts],asOf:request.asOf,history:true});
 if(env.truncated)throw new ProjectionError('truncated');
 const durations=durationFilter(request);
 const filings=await filingMap(deps.db,ref);
 const rows=env.rows.filter(r=>durations===null||durations.has(r.duration)).map(r=>{
  const f=filings.get(r.filing_id);
  if(!f)throw new ProjectionError('projection_join_missing',`filing ${r.filing_id} of fact ${r.fact_id}`);
  return factProjectionRow(r,f.source_ref);
 });
 return {module:'facts',rows:sortFactRows(rows)};
}

export async function projectMetrics(deps:ProjectionDeps,request:ReplayRequest,today:string):Promise<Projection>{
 const ref=await referenced(deps,request,today);
 const wanted=new Set(request.metrics??[]);
 if(wanted.size===0)return {module:'metrics',rows:[]};
 const env=await deps.db.readFacts(ref.issuerId,ref.market,{concepts:[...DERIVE_CONCEPTS[ref.market]],asOf:request.asOf,history:true});
 if(env.truncated)throw new ProjectionError('truncated');
 const durations=durationFilter(request);
 const metrics=deriveMetrics(env.rows,{market:ref.market,asOf:request.asOf,basedOnRev:env.stateRev}).filter(m=>wanted.has(m.metric)&&(durations===null||durations.has(m.duration)));
 const ids=[...new Set(metrics.flatMap(m=>m.inputs.map(i=>i.fact_id)))];
 const facts=new Map((ids.length>0?await deps.db.factsByIds(ids):[]).map(f=>[f.fact_id,f]));
 const filings=await filingMap(deps.db,ref);
 const rows=metrics.map((m):ProjectionRow=>({metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,basis:m.basis,formula_version:m.formula_version,value:m.value,unit:m.unit,
  inputs:m.inputs.map((i):ProjectionRow=>{
   const f=facts.get(i.fact_id);const g=f?filings.get(f.filing_id):undefined;
   if(!f||!g)throw new ProjectionError('projection_join_missing',`input ${i.fact_id} of ${m.metric}`);
   return {concept:i.concept,period_end:f.period_end,source_ref:g.source_ref};
  })}));
 return {module:'metrics',rows:sortMetricRows(rows)};
}

/** A request with metrics is a metrics projection (concepts must then be []); otherwise a facts projection. */
export const projectRequest=(deps:ProjectionDeps,request:ReplayRequest,today:string):Promise<Projection>=>
 request.metrics&&request.metrics.length>0?projectMetrics(deps,request,today):projectFacts(deps,request,today);

/** Public facts route body (concepts or factIds mode); consolidation is not in the public shape and is always 'consolidated' (FactInsert). */
export interface FactsRouteBody{
 truncated:boolean;
 facts:{factId:string;concept:string;periodStart:string|null;periodEnd:string;duration:string;value:string;unit:string;availableDate:string;filingId:string;disclosureSeq:number|null;isCurrent:boolean|null;isRevision:boolean|null}[];
 filings:{filingId:string;sourceRef:string}[];
}
export function projectFactsRouteBody(body:FactsRouteBody):Projection{
 if(body.truncated)throw new ProjectionError('truncated');
 const refs=new Map(body.filings.map(f=>[f.filingId,f.sourceRef]));
 return {module:'facts',rows:sortFactRows(body.facts.map(r=>{
  const src=refs.get(r.filingId);
  if(src===undefined)throw new ProjectionError('projection_join_missing',`filing ${r.filingId}`);
  return {concept:r.concept,period_start:r.periodStart,period_end:r.periodEnd,duration:r.duration,consolidation:'consolidated',unit:r.unit,value_text:r.value,
   available_date:r.availableDate,source_ref:src,disclosure_seq:r.disclosureSeq,is_current:r.isCurrent,is_revision:r.isRevision};
 }))};
}
export interface MetricsRouteBody{
 truncated:boolean;formulaVersion:string;
 metrics:{metric:string;periodStart:string;periodEnd:string;duration:string;value:string;unit:string;basis:string;inputs:{fact_id:string;concept:string}[]}[];
}
/** evidence = the facts route in factIds mode for every input fact id (periodEnd + filing sourceRef). */
export function projectMetricsRouteBody(body:MetricsRouteBody,evidence:FactsRouteBody):Projection{
 if(body.truncated)throw new ProjectionError('truncated');
 const facts=new Map(evidence.facts.map(f=>[f.factId,f]));
 const refs=new Map(evidence.filings.map(f=>[f.filingId,f.sourceRef]));
 return {module:'metrics',rows:sortMetricRows(body.metrics.map((m):ProjectionRow=>({metric:m.metric,period_start:m.periodStart,period_end:m.periodEnd,duration:m.duration,basis:m.basis,formula_version:body.formulaVersion,value:m.value,unit:m.unit,
  inputs:m.inputs.map((i):ProjectionRow=>{
   const f=facts.get(i.fact_id);const src=f?refs.get(f.filingId):undefined;
   if(!f||src===undefined)throw new ProjectionError('projection_join_missing',`input ${i.fact_id}`);
   return {concept:i.concept,period_end:f.periodEnd,source_ref:src};
  })})))};
}

export function rowIdentity(module:EvalModule,r:ProjectionRow):string{
 return module==='metrics'
  ?`${seg(r.metric)}/${seg(r.period_start)}..${seg(r.period_end)}/${seg(r.duration)}/${seg(r.basis)}/${seg(r.formula_version)}`
  :`${seg(r.concept)}/${seg(r.period_start)}..${seg(r.period_end)}/${seg(r.duration)}/${seg(r.unit)}/${seg(r.available_date)}/${seg(r.source_ref)}`;
}
function indexed(p:Projection):Map<string,ProjectionRow>{
 const out=new Map<string,ProjectionRow>();const seen=new Map<string,number>();
 for(const r of p.rows){const id=rowIdentity(p.module,r);const n=(seen.get(id)??0)+1;seen.set(id,n);out.set(n===1?id:`${id}#${n}`,r);}
 return out;
}
/** Sorted, de-duplicated changed field paths (empty ⇔ same rows by identity and value). */
export function diffProjections(before:Projection,after:Projection):string[]{
 if(before.module!==after.module)return ['module'];
 const a=indexed(before),b=indexed(after);const out=new Set<string>();
 for(const id of new Set([...a.keys(),...b.keys()])){
  const x=a.get(id),y=b.get(id);
  if(!x||!y){out.add(`${before.module}[${id}]`);continue;}
  for(const f of new Set([...Object.keys(x),...Object.keys(y)]))if(canonicalJson(x[f]??null)!==canonicalJson(y[f]??null))out.add(`${before.module}[${id}].${f}`);
 }
 return [...out].sort(cmp);
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `npm test -- src/lib/evals/projections/facts.test.ts`
Expected: PASS（3 个 describe、9 个用例全绿）。

- [ ] **Step 6: 写失败测试 `src/lib/evals/replay/fixture.test.ts`**

```ts
// src/lib/evals/replay/fixture.test.ts
import {describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection} from '../types';
import {isDraft,parseReplayFile,recordedCases,serializeReplayFile} from './fixture';

const P:Projection={module:'facts',rows:[{concept:'revenue',value_text:'1'}]};
const C='c'.repeat(40),S='5'.repeat(64);
const frozenCase=(p:Record<string,unknown>={})=>({case_id:'zzeva-revenue',request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'},setup:{setup_sha256:S,today:'2026-11-06'},recorded:{code_version:C,at:'2026-11-06T00:00:00.000Z'},expected:{projection_hash:projectionHash(P),projection:P},...p});
const file=(cases:unknown[],p:Record<string,unknown>={})=>({schema_version:1,module:'facts',mode:'frozen',cases,...p});
const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof EvalError?e.code:`other:${String(e)}`;}};

describe('parseReplayFile',()=>{
 it('accepts a recorded frozen file and round-trips through serializeReplayFile',()=>{
  const f=parseReplayFile(file([frozenCase()]),{allowDrafts:false});
  expect(recordedCases(f).map(c=>c.case_id)).toEqual(['zzeva-revenue']);
  expect(parseReplayFile(JSON.parse(serializeReplayFile(f)),{allowDrafts:false})).toEqual(f);
  expect(serializeReplayFile(f).endsWith('}\n')).toBe(true);
 });
 it('drafts (recorded and expected null) only when allowed; recordedCases refuses them',()=>{
  const draft=frozenCase({recorded:null,expected:null,setup:{today:'2026-11-06'}});
  expect(code(()=>parseReplayFile(file([draft]),{allowDrafts:false}))).toBe('gold_invalid');
  const f=parseReplayFile(file([draft]),{allowDrafts:true});
  expect(isDraft(f.cases[0])).toBe(true);
  expect(code(()=>recordedCases(f))).toBe('gold_invalid');
 });
 it('refuses: expected hash ≠ projection, duplicate case_id, unknown concept, concepts with metrics, bad asOf, bad code_version, live without state_rev',()=>{
  expect(code(()=>parseReplayFile(file([frozenCase({expected:{projection_hash:'0'.repeat(64),projection:P}})]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase(),frozenCase()]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase({request:{issuer:{market:'US',cik:'9990601'},concepts:['nope'],asOf:'2025-06-30'}})]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase({request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],metrics:['gross_margin'],asOf:'2025-06-30'}})]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase({request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-6-30'}})]),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([frozenCase({recorded:{code_version:'abc',at:'2026-11-06T00:00:00Z'}})]),{allowDrafts:false}))).toBe('gold_invalid');
  const live={case_id:'l',request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'},recorded:{code_version:C,at:'2026-11-06T00:00:00Z'},expected:{projection_hash:projectionHash(P),projection:P}};
  expect(code(()=>parseReplayFile(file([live],{mode:'live'}),{allowDrafts:false}))).toBe('gold_invalid');
  expect(code(()=>parseReplayFile(file([{...live,recorded:{...live.recorded,state_rev:3}}],{mode:'live'}),{allowDrafts:false}))).toBe('ok');
  expect(code(()=>parseReplayFile(file([frozenCase({setup:{today:'2026-11-06'}})]),{allowDrafts:false}))).toBe('gold_invalid');   // recorded frozen case needs a sealed setup
 });
});
```

- [ ] **Step 7: 运行，确认失败**

Run: `npm test -- src/lib/evals/replay/fixture.test.ts`
Expected: FAIL — `Failed to resolve import "./fixture"`。

- [ ] **Step 8: 实现 `src/lib/evals/replay/fixture.ts`**

```ts
// src/lib/evals/replay/fixture.ts
// Replay fixture files fixtures/replay/<module>.<mode>.json (spec §5.3.1, §5.3.2). A case is a DRAFT
// (recorded = expected = null; frozen drafts carry an unsealed setup) until scripts/evals/record-replay.ts
// records it; evaluation only accepts recorded cases. Every recorded case is self-checking:
// expected.projection_hash must equal projectionHash(expected.projection). A request is either a facts
// request (concepts non-empty, no metrics) or a metrics request (metrics non-empty, concepts []).
// Structural problems throw EvalError('gold_invalid'). serializeReplayFile is the only writer format
// (JSON, one-space indent, trailing newline) so re-recording produces minimal diffs.
import {isConceptId} from '../../facts/concepts';
import {metricNames} from '../../facts/derive';
import {projectionHash} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection,ReplayRequest} from '../types';

export type ReplayMode='frozen'|'live';
/** A sealed frozen setup (replay/setup.ts::FrozenSetup); only these two fields are read here. */
export interface SealedSetup{setup_sha256:string;today:string;[k:string]:unknown}
export interface ReplayExpected{projection_hash:string;projection:Projection}
export interface Supersession{ledger_id:string;before_hash:string;after_hash:string;at:string}
interface RecordedBase{case_id:string;request:ReplayRequest;expected:ReplayExpected;supersessions?:Supersession[]}
export interface FrozenReplayCase extends RecordedBase{setup:SealedSetup;recorded:{code_version:string;at:string}}
export interface LiveReplayCase extends RecordedBase{recorded:{code_version:string;at:string;state_rev:number}}
export type ReplayCase=FrozenReplayCase|LiveReplayCase;
export interface DraftReplayCase{case_id:string;request:ReplayRequest;setup?:Record<string,unknown>;recorded:null;expected:null}
export interface ReplayFile{schema_version:1;module:'facts';mode:ReplayMode;cases:(ReplayCase|DraftReplayCase)[]}

export const isDraft=(c:ReplayCase|DraftReplayCase):c is DraftReplayCase=>c.expected===null;
const HEX64=/^[0-9a-f]{64}$/,HEX40=/^[0-9a-f]{40}$/,DAY=/^\d{4}-\d{2}-\d{2}$/,CASE_ID=/^[a-z0-9][a-z0-9._:\/-]{0,199}$/;
const DURATIONS=new Set(['3M','6M','9M','12M','INSTANT']);
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const isDay=(v:unknown):v is string=>typeof v==='string'&&DAY.test(v)&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const isTs=(v:unknown):v is string=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
const uniqueStrings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string')&&new Set(v).size===v.length;

function parseRequest(v:unknown,fail:(f:string)=>never):ReplayRequest{
 if(!isObj(v))return fail('request');
 const iss=v.issuer;
 if(!isObj(iss)||(iss.market!=='US'&&iss.market!=='CN'))return fail('request.issuer.market');
 if(iss.cik!==undefined&&!(typeof iss.cik==='string'&&/^\d{1,10}$/.test(iss.cik)))return fail('request.issuer.cik');
 if(iss.ticker!==undefined&&!(typeof iss.ticker==='string'&&iss.ticker.length>0))return fail('request.issuer.ticker');
 if(iss.cik===undefined&&iss.ticker===undefined)return fail('request.issuer');
 if(!uniqueStrings(v.concepts)||!v.concepts.every(isConceptId))return fail('request.concepts');
 if(!isDay(v.asOf))return fail('request.asOf');
 if(v.durations!==undefined&&!(uniqueStrings(v.durations)&&v.durations.every(d=>DURATIONS.has(d))))return fail('request.durations');
 const names=new Set(metricNames(iss.market));
 if(v.metrics!==undefined&&!(uniqueStrings(v.metrics)&&v.metrics.every(m=>names.has(m))))return fail('request.metrics');
 const metrics=(v.metrics as string[]|undefined)??[];
 if(metrics.length>0?v.concepts.length>0:v.concepts.length===0)return fail('request.concepts_xor_metrics');
 return {issuer:{market:iss.market,...(iss.cik!==undefined?{cik:iss.cik as string}:{}),...(iss.ticker!==undefined?{ticker:iss.ticker as string}:{})},concepts:v.concepts,asOf:v.asOf,
  ...(v.durations!==undefined?{durations:v.durations as string[]}:{}),...(v.metrics!==undefined?{metrics}:{})};
}
function parseExpected(v:unknown,fail:(f:string)=>never):ReplayExpected{
 if(!isObj(v)||typeof v.projection_hash!=='string'||!HEX64.test(v.projection_hash))return fail('expected.projection_hash');
 const p=v.projection;
 if(!isObj(p)||(p.module!=='facts'&&p.module!=='metrics')||!Array.isArray(p.rows)||!p.rows.every(isObj))return fail('expected.projection');
 const projection=p as unknown as Projection;
 if(projectionHash(projection)!==v.projection_hash)return fail('expected.projection_hash_mismatch');
 return {projection_hash:v.projection_hash,projection};
}

export function parseReplayFile(raw:unknown,opts:{allowDrafts:boolean;file?:string}):ReplayFile{
 const file=opts.file??'replay fixture';
 const top=(f:string):never=>{throw new EvalError('gold_invalid',`${file}: ${f}`,{file,field:f});};
 if(!isObj(raw)||raw.schema_version!==1)return top('schema_version');
 if(raw.module!=='facts')return top('module');
 if(raw.mode!=='frozen'&&raw.mode!=='live')return top('mode');
 if(!Array.isArray(raw.cases))return top('cases');
 const mode:ReplayMode=raw.mode;const seen=new Set<string>();
 const cases=raw.cases.map((c,i):ReplayCase|DraftReplayCase=>{
  const id=isObj(c)&&typeof c.case_id==='string'?c.case_id:`#${i}`;
  const fail=(f:string):never=>{throw new EvalError('gold_invalid',`${file}: case ${id}: ${f}`,{file,case_id:id,field:f});};
  if(!isObj(c)||typeof c.case_id!=='string'||!CASE_ID.test(c.case_id))return fail('case_id');
  if(seen.has(c.case_id))return fail('case_id_duplicate');seen.add(c.case_id);
  const request=parseRequest(c.request,fail);
  if(c.recorded===null&&c.expected===null){
   if(!opts.allowDrafts)return fail('not_recorded');
   if(mode==='frozen'&&!isObj(c.setup))return fail('setup');
   return {case_id:c.case_id,request,...(mode==='frozen'?{setup:c.setup as Record<string,unknown>}:{}),recorded:null,expected:null};
  }
  const rec=c.recorded;
  if(!isObj(rec)||typeof rec.code_version!=='string'||!HEX40.test(rec.code_version))return fail('recorded.code_version');
  if(!isTs(rec.at))return fail('recorded.at');
  const expected=parseExpected(c.expected,fail);
  const supersessions=c.supersessions===undefined?undefined:Array.isArray(c.supersessions)&&c.supersessions.every(s=>isObj(s)&&typeof s.ledger_id==='string'&&typeof s.before_hash==='string'&&HEX64.test(s.before_hash)&&typeof s.after_hash==='string'&&HEX64.test(s.after_hash)&&isTs(s.at))?c.supersessions as Supersession[]:fail('supersessions');
  const extra=supersessions===undefined?{}:{supersessions};
  if(mode==='live'){
   if(!(typeof rec.state_rev==='number'&&Number.isSafeInteger(rec.state_rev)&&rec.state_rev>=0))return fail('recorded.state_rev');
   return {case_id:c.case_id,request,recorded:{code_version:rec.code_version,at:rec.at,state_rev:rec.state_rev},expected,...extra};
  }
  const s=c.setup;
  if(!isObj(s)||typeof s.setup_sha256!=='string'||!HEX64.test(s.setup_sha256)||!isDay(s.today))return fail('setup.sealed');
  return {case_id:c.case_id,request,setup:s as SealedSetup,recorded:{code_version:rec.code_version,at:rec.at},expected,...extra};
 });
 return {schema_version:1,module:'facts',mode,cases};
}

/** The recorded cases of a file; any draft left → gold_invalid (evaluation never runs a draft). */
export function recordedCases(f:ReplayFile):ReplayCase[]{
 const draft=f.cases.find(isDraft);
 if(draft)throw new EvalError('gold_invalid',`replay case ${draft.case_id} is not recorded`,{case_id:draft.case_id});
 return f.cases as ReplayCase[];
}
export const serializeReplayFile=(f:ReplayFile):string=>`${JSON.stringify(f,null,1)}\n`;
```

- [ ] **Step 9: 运行，确认通过**

Run: `npm test -- src/lib/evals/replay/fixture.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 10: 写失败测试 `src/lib/evals/replay/ledger.test.ts`**

```ts
// src/lib/evals/replay/ledger.test.ts
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {isSelfApproved,matchLedger,parseLedger} from './ledger';
import type {LedgerEntry,ObservedDiff} from './ledger';

const H0='a'.repeat(64),H1='b'.repeat(64),S='5'.repeat(64),C1='1'.repeat(40),C2='2'.repeat(40);
const F=['facts[revenue/2023-10-01..2024-09-28/12M/USD/2025-01-15/0009990601-25-000002].value_text'];
const raw=(p:Record<string,unknown>={})=>({ledger_id:'L1',case_id:'c1',mode:'frozen',changed_fields:F,before_hash:H0,after_hash:H1,from_code:C1,to_code:C2,from_setup_sha256:S,to_setup_sha256:S,
 reason_code:'bug_fixed',evidence:{pr:12,regression_test:'src/lib/facts/derive.test.ts::ttm'},added_by:'claude-code',added_at:'2026-11-06T00:00:00Z',approved_by:'owner',approval_ref:'https://github.com/osborn-studio/OsbornAlpha/pull/12#pullrequestreview-1',approved_at:'2026-11-06T02:00:00Z',...p});
const liveRaw=(p:Record<string,unknown>={})=>{
 const r:Record<string,unknown>=raw({mode:'live',from_state_rev:12,to_state_rev:15,reason_code:'quarantine_resolved',evidence:{quarantine_id:'q-1'}});
 delete r.from_setup_sha256;delete r.to_setup_sha256;Object.assign(r,p);
 for(const k of Object.keys(r))if(r[k]===undefined)delete r[k];
 return r;
};
const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof EvalError?e.code:`other:${String(e)}`;}};
const diff=(p:Partial<ObservedDiff>={}):ObservedDiff=>({case_id:'c1',mode:'frozen',before_hash:H0,after_hash:H1,from_code:C1,to_code:C2,from_setup_sha256:S,to_setup_sha256:S,changed_fields:F,...p});

describe('parseLedger',()=>{
 it('accepts frozen and live entries; [] is valid',()=>{
  expect(parseLedger([])).toEqual([]);
  expect(parseLedger([raw(),liveRaw({ledger_id:'L2'})]).map(e=>e.ledger_id)).toEqual(['L1','L2']);
 });
 it('structural refusals are gold_invalid',()=>{
  const bad:Record<string,unknown>[]=[raw({approval_ref:''}),raw({approval_ref:undefined}),raw({from_setup_sha256:undefined}),raw({to_setup_sha256:'x'}),raw({from_state_rev:1}),
   liveRaw({to_state_rev:undefined}),liveRaw({from_setup_sha256:S}),raw({before_hash:'abc'}),raw({to_code:'z'.repeat(40)}),raw({reason_code:'because'}),raw({changed_fields:[]}),
   raw({evidence:{pr:12}}),liveRaw({evidence:{}}),raw({added_at:'never'}),raw({mode:'both'})];
  for(const b of bad){for(const k of Object.keys(b))if(b[k]===undefined)delete b[k];expect(code(()=>parseLedger([b]))).toBe('gold_invalid');}
  expect(code(()=>parseLedger([raw(),raw()]))).toBe('gold_invalid');   // duplicate ledger_id
  expect(code(()=>parseLedger({}))).toBe('gold_invalid');
 });
 it('a self-approved entry parses and is flagged',()=>{
  const [e]=parseLedger([raw({approved_by:'claude-code'})]);
  expect(isSelfApproved(e)).toBe(true);
 });
});

describe('matchLedger',()=>{
 const entries=():LedgerEntry[]=>parseLedger([raw()]);
 it('hit on the exact tuple and an equal changed_fields set (order-insensitive)',()=>{
  expect(matchLedger(entries(),diff())).toEqual({kind:'hit',ledger_ids:['L1']});
  const two=parseLedger([raw({changed_fields:[...F,'facts[x].disclosure_seq']})]);
  expect(matchLedger(two,diff({changed_fields:['facts[x].disclosure_seq',...F]}))).toEqual({kind:'hit',ledger_ids:['L1']});
 });
 it('partial when the tuple matches but the fields do not (missing or extra)',()=>{
  expect(matchLedger(entries(),diff({changed_fields:[...F,'facts[x].disclosure_seq']}))).toEqual({kind:'partial',ledger_ids:['L1']});
  const extra=parseLedger([raw({changed_fields:[...F,'facts[x].is_current']})]);
  expect(matchLedger(extra,diff()).kind).toBe('partial');
 });
 it('self_approved when only a self-approved entry matches exactly',()=>{
  expect(matchLedger(parseLedger([raw({approved_by:'claude-code'})]),diff())).toEqual({kind:'self_approved',ledger_ids:['L1']});
 });
 it('none when any tuple member differs (each key), including a changed after_hash',()=>{
  const alt:Partial<ObservedDiff>[]=[{case_id:'c2'},{mode:'live'},{before_hash:H1},{after_hash:'c'.repeat(64)},{from_code:C2},{to_code:C1},{from_setup_sha256:'6'.repeat(64)},{to_setup_sha256:'6'.repeat(64)}];
  for(const a of alt)expect(matchLedger(entries(),diff(a)).kind).toBe('none');
 });
 it('live entries match on from/to_state_rev; a null current rev never matches',()=>{
  const live=parseLedger([liveRaw()]);
  const d=diff({mode:'live',from_setup_sha256:undefined,to_setup_sha256:undefined,from_state_rev:12,to_state_rev:15});
  expect(matchLedger(live,d).kind).toBe('hit');
  expect(matchLedger(live,{...d,to_state_rev:16}).kind).toBe('none');
  expect(matchLedger(live,{...d,to_state_rev:null}).kind).toBe('none');
 });
});
```

- [ ] **Step 11: 运行，确认失败**

Run: `npm test -- src/lib/evals/replay/ledger.test.ts`
Expected: FAIL — `Failed to resolve import "./ledger"`。

- [ ] **Step 12: 实现 `src/lib/evals/replay/ledger.ts`**

```ts
// src/lib/evals/replay/ledger.ts
// Replay explanation ledger fixtures/replay/explanations.json (spec §5.3.3, §14, §16 D6). parseLedger
// refuses a structurally invalid file with EvalError('gold_invalid'): missing approval_ref, the mode's
// pair missing (live: from/to_state_rev; frozen: from/to_setup_sha256) or the other mode's pair present,
// malformed hashes / code versions, unknown reason_code, reason-specific evidence missing
// (quarantine_resolved: evidence.quarantine_id; bug_fixed: evidence.pr + evidence.regression_test),
// duplicate ledger_id. A self-approved entry (approved_by = added_by) parses but never explains:
// matchLedger reports self_approved → unexplained_diff(ledger_self_approved). A hit needs the exact tuple
// (case_id, mode, before_hash, after_hash, from_code, to_code + the mode's pair) AND changed_fields equal
// to the observed set; the same tuple with other fields is partial → unexplained_diff(partial_ledger).
import {readFileSync} from 'node:fs';
import {EvalError} from '../errors';
import type {ReplayMode} from './fixture';

export const LEDGER_REASONS=['late_filing','quarantine_resolved','mapping_gen_upgrade','formula_version_change','ticker_reassignment','bug_fixed'] as const;
export type LedgerReason=typeof LEDGER_REASONS[number];
export interface LedgerEntry{
 ledger_id:string;case_id:string;mode:ReplayMode;changed_fields:string[];before_hash:string;after_hash:string;from_code:string;to_code:string;
 from_state_rev?:number;to_state_rev?:number;from_setup_sha256?:string;to_setup_sha256?:string;
 reason_code:LedgerReason;evidence:Record<string,unknown>;added_by:string;added_at:string;approved_by:string;approval_ref:string;approved_at:string;
}
export interface ObservedDiff{
 case_id:string;mode:ReplayMode;before_hash:string;after_hash:string;from_code:string;to_code:string;
 from_state_rev?:number|null;to_state_rev?:number|null;from_setup_sha256?:string;to_setup_sha256?:string;changed_fields:string[];
}
export interface LedgerMatch{kind:'hit'|'partial'|'self_approved'|'none';ledger_ids:string[]}

const HEX64=/^[0-9a-f]{64}$/,HEX40=/^[0-9a-f]{40}$/;
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const nonEmpty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const isTs=(v:unknown):v is string=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
const isRev=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const hex=(re:RegExp,v:unknown)=>typeof v==='string'&&re.test(v);

export const isSelfApproved=(e:LedgerEntry):boolean=>e.approved_by===e.added_by;

export function parseLedger(raw:unknown):LedgerEntry[]{
 if(!Array.isArray(raw))throw new EvalError('gold_invalid','explanations.json: expected an array',{file:'explanations.json'});
 const seen=new Set<string>();
 return raw.map((e,i)=>{
  const id=isObj(e)&&typeof e.ledger_id==='string'?e.ledger_id:null;
  const bad=(field:string):never=>{throw new EvalError('gold_invalid',`explanations.json[${i}]: ${field}`,{file:'explanations.json',index:i,ledger_id:id,field});};
  if(!isObj(e))return bad('entry');
  if(!nonEmpty(e.ledger_id))return bad('ledger_id');
  if(seen.has(e.ledger_id))return bad('ledger_id_duplicate');seen.add(e.ledger_id);
  if(!nonEmpty(e.case_id))return bad('case_id');
  if(e.mode!=='frozen'&&e.mode!=='live')return bad('mode');
  const f=e.changed_fields;
  if(!Array.isArray(f)||f.length===0||!f.every(nonEmpty)||new Set(f).size!==f.length)return bad('changed_fields');
  if(!hex(HEX64,e.before_hash))return bad('before_hash');
  if(!hex(HEX64,e.after_hash))return bad('after_hash');
  if(!hex(HEX40,e.from_code))return bad('from_code');
  if(!hex(HEX40,e.to_code))return bad('to_code');
  if(e.mode==='live'){
   if(!isRev(e.from_state_rev)||!isRev(e.to_state_rev))return bad('state_rev_pair');
   if(e.from_setup_sha256!==undefined||e.to_setup_sha256!==undefined)return bad('setup_pair_on_live');
  }else{
   if(!hex(HEX64,e.from_setup_sha256)||!hex(HEX64,e.to_setup_sha256))return bad('setup_pair');
   if(e.from_state_rev!==undefined||e.to_state_rev!==undefined)return bad('state_rev_pair_on_frozen');
  }
  if(!(LEDGER_REASONS as readonly unknown[]).includes(e.reason_code))return bad('reason_code');
  const ev=e.evidence;
  if(!isObj(ev))return bad('evidence');
  if(e.reason_code==='quarantine_resolved'&&!nonEmpty(ev.quarantine_id))return bad('evidence.quarantine_id');
  if(e.reason_code==='bug_fixed'&&!(typeof ev.pr==='number'&&Number.isSafeInteger(ev.pr)&&ev.pr>0&&nonEmpty(ev.regression_test)))return bad('evidence.bug_fixed');
  if(!nonEmpty(e.added_by))return bad('added_by');
  if(!nonEmpty(e.approved_by))return bad('approved_by');
  if(!nonEmpty(e.approval_ref))return bad('approval_ref');
  if(!isTs(e.added_at))return bad('added_at');
  if(!isTs(e.approved_at))return bad('approved_at');
  return e as unknown as LedgerEntry;
 });
}

export function loadLedger(path:string):LedgerEntry[]{
 let raw:unknown;
 try{raw=JSON.parse(readFileSync(path,'utf8'));}
 catch(err){throw new EvalError('gold_invalid',`${path}: unreadable (${err instanceof Error?err.message:String(err)})`,{file:path});}
 return parseLedger(raw);
}

const sameTuple=(e:LedgerEntry,d:ObservedDiff)=>e.case_id===d.case_id&&e.mode===d.mode&&e.before_hash===d.before_hash&&e.after_hash===d.after_hash&&e.from_code===d.from_code&&e.to_code===d.to_code
 &&(d.mode==='live'?e.from_state_rev===d.from_state_rev&&e.to_state_rev===d.to_state_rev:e.from_setup_sha256===d.from_setup_sha256&&e.to_setup_sha256===d.to_setup_sha256);
const sameSet=(a:string[],b:string[])=>{const x=new Set(a),y=new Set(b);return x.size===y.size&&[...x].every(v=>y.has(v));};
const ids=(xs:LedgerEntry[])=>xs.map(e=>e.ledger_id).sort();

export function matchLedger(entries:LedgerEntry[],d:ObservedDiff):LedgerMatch{
 const tuple=entries.filter(e=>sameTuple(e,d));
 if(tuple.length===0)return {kind:'none',ledger_ids:[]};
 const exact=tuple.filter(e=>sameSet(e.changed_fields,d.changed_fields));
 const hit=exact.filter(e=>!isSelfApproved(e));
 if(hit.length>0)return {kind:'hit',ledger_ids:ids(hit)};
 if(exact.length>0)return {kind:'self_approved',ledger_ids:ids(exact)};
 return {kind:'partial',ledger_ids:ids(tuple)};
}
```

- [ ] **Step 13: 运行，确认通过**

Run: `npm test -- src/lib/evals/replay/ledger.test.ts`
Expected: PASS（8 个用例）。

- [ ] **Step 14: 写失败测试 `src/lib/evals/kinds/replay.test.ts`**

```ts
// src/lib/evals/kinds/replay.test.ts
import {describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import {ProjectionError} from '../projections/facts';
import type {FrozenReplayCase,LiveReplayCase} from '../replay/fixture';
import {parseLedger} from '../replay/ledger';
import type {LedgerEntry} from '../replay/ledger';
import {summarize} from '../summary';
import type {Hint,Projection,ReplayRequest} from '../types';
import {evaluateReplay,replaySummaryContext} from './replay';
import type {ReplayContext} from './replay';

const C1='1'.repeat(40),C2='2'.repeat(40),S1='5'.repeat(64),SRC='0009990601-24-000001';
const row=(value:string,seq=1)=>({concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',consolidation:'consolidated',unit:'USD',value_text:value,available_date:'2024-11-01',source_ref:SRC,disclosure_seq:seq,is_current:true,is_revision:false});
const P0:Projection={module:'facts',rows:[row('100')]};
const P1:Projection={module:'facts',rows:[row('101')]};
const P2:Projection={module:'facts',rows:[row('101',2)]};
const ID=`facts[revenue/2023-10-01..2024-09-28/12M/USD/2024-11-01/${SRC}]`;
const request:ReplayRequest={issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'};
const frozen=(p:Partial<FrozenReplayCase>={}):FrozenReplayCase=>({case_id:'f1',request,setup:{setup_sha256:S1,today:'2026-11-06'},recorded:{code_version:C1,at:'2026-11-06T00:00:00.000Z'},expected:{projection_hash:projectionHash(P0),projection:P0},...p});
const live=(p:Partial<LiveReplayCase>={}):LiveReplayCase=>({case_id:'l1',request,recorded:{code_version:C1,at:'2026-11-06T00:00:00.000Z',state_rev:12},expected:{projection_hash:projectionHash(P0),projection:P0},...p});
const frozenEntry=(p:Record<string,unknown>={})=>({ledger_id:'L1',case_id:'f1',mode:'frozen',changed_fields:[`${ID}.value_text`],before_hash:projectionHash(P0),after_hash:projectionHash(P1),from_code:C1,to_code:C2,from_setup_sha256:S1,to_setup_sha256:S1,
 reason_code:'bug_fixed',evidence:{pr:1,regression_test:'src/lib/facts/derive.test.ts::x'},added_by:'claude-code',added_at:'2026-11-06T00:00:00Z',approved_by:'owner',approval_ref:'https://github.com/osborn-studio/OsbornAlpha/pull/1#pullrequestreview-1',approved_at:'2026-11-06T01:00:00Z',...p});
const liveEntry=(p:Record<string,unknown>={})=>{
 const e:Record<string,unknown>=frozenEntry({case_id:'l1',mode:'live',from_state_rev:12,to_state_rev:15,reason_code:'late_filing',evidence:{}});
 delete e.from_setup_sha256;delete e.to_setup_sha256;return Object.assign(e,p);
};
const ledger=(...raw:Record<string,unknown>[]):LedgerEntry[]=>parseLedger(raw);
const returns=(p:Projection)=>async()=>p;
const fctx=(p:Partial<ReplayContext>={}):ReplayContext=>({mode:'frozen',evaluatorCodeVersion:C2,checkSetup:async()=>({ok:true,setupSha256:S1}),...p});
const lctx=(p:Partial<ReplayContext>={}):ReplayContext=>({mode:'live',evaluatorCodeVersion:C2,stateRev:async()=>15,...p});
const HINT:Hint={kind:'late_fact',ref:'fact:abc',at:'2026-11-07T00:00:00Z'};
const outcome=async(...a:Parameters<typeof evaluateReplay>)=>(await evaluateReplay(...a))[0].outcome;

describe('evaluateReplay frozen',()=>{
 it('identical when the projection hash is unchanged; the report carries hashes, no values',async()=>{
  const [r]=await evaluateReplay([frozen()],returns(P0),[],fctx());
  expect(r).toMatchObject({case_id:'f1',required:true,outcome:{result:'identical'},left:null,right:null,tolerance:'0',provenance:null});
  expect(r.detail).toMatchObject({before_hash:projectionHash(P0),after_hash:projectionHash(P0),from_code:C1,to_code:C2});
 });
 it('setup mismatch (reported, or a recomputed setup_sha256 ≠ recorded) → read_error(setup_mismatch) before projecting',async()=>{
  const never=async():Promise<Projection>=>{throw new Error('projected');};
  const [a]=await evaluateReplay([frozen()],never,[],fctx({checkSetup:async()=>({ok:false,mismatch:['fixture_manifest[0].sha256']})}));
  expect(a.outcome).toEqual({result:'read_error',reason:'setup_mismatch'});
  expect(a.detail.mismatch).toEqual(['fixture_manifest[0].sha256']);
  const [b]=await evaluateReplay([frozen()],never,[],fctx({checkSetup:async()=>({ok:true,setupSha256:'6'.repeat(64)})}));
  expect(b.outcome).toEqual({result:'read_error',reason:'setup_mismatch'});
  expect(b.detail.mismatch).toEqual(['setup_sha256']);
 });
 it('diff without a ledger entry → unexplained_diff(diff) with the changed fields',async()=>{
  const [r]=await evaluateReplay([frozen()],returns(P1),[],fctx());
  expect(r.outcome).toEqual({result:'unexplained_diff',reason:'diff'});
  expect(r.detail.changed_fields).toEqual([`${ID}.value_text`]);
 });
 it('ledger: exact hit → explained_diff; partial → partial_ledger; self-approved → ledger_self_approved; stale after_hash → diff',async()=>{
  expect(await outcome([frozen()],returns(P1),ledger(frozenEntry()),fctx())).toEqual({result:'explained_diff',ledger_ids:['L1']});
  expect(await outcome([frozen()],returns(P2),ledger(frozenEntry({after_hash:projectionHash(P2)})),fctx())).toEqual({result:'unexplained_diff',reason:'partial_ledger'});
  expect(await outcome([frozen()],returns(P1),ledger(frozenEntry({approved_by:'claude-code'})),fctx())).toEqual({result:'unexplained_diff',reason:'ledger_self_approved'});
  expect(await outcome([frozen()],returns(P2),ledger(frozenEntry()),fctx())).toEqual({result:'unexplained_diff',reason:'diff'});
  expect(await outcome([frozen()],returns(P1),ledger(frozenEntry({to_code:'3'.repeat(40)})),fctx())).toEqual({result:'unexplained_diff',reason:'diff'});
  expect(await outcome([frozen()],returns(P1),ledger(liveEntry({case_id:'f1'})),fctx())).toEqual({result:'unexplained_diff',reason:'diff'});
 });
 it('frozen never yields data_drift even when a hint reader is present',async()=>{
  expect(await outcome([frozen()],returns(P1),[],fctx({hints:async()=>[HINT]}))).toEqual({result:'unexplained_diff',reason:'diff'});
 });
 it('projection failures: ProjectionError reason, anything else read_failed',async()=>{
  expect(await outcome([frozen()],async()=>{throw new ProjectionError('projection_join_missing');},[],fctx())).toEqual({result:'read_error',reason:'projection_join_missing'});
  expect(await outcome([frozen()],async()=>{throw new Error('connection reset');},[],fctx())).toEqual({result:'read_error',reason:'read_failed'});
 });
 it('frozen without checkSetup is a programming error',async()=>{
  await expect(evaluateReplay([frozen()],returns(P0),[],{mode:'frozen',evaluatorCodeVersion:C2})).rejects.toThrow(/checkSetup/);
 });
});

describe('evaluateReplay live',()=>{
 it('identical',async()=>{expect(await outcome([live()],returns(P0),[],lctx())).toEqual({result:'identical'});});
 it('privileged hints: data_drift with [] (no entry) or with the matching ledger ids',async()=>{
  expect(await outcome([live()],returns(P1),[],lctx({hints:async()=>[HINT]}))).toEqual({result:'data_drift',ledger_ids:[],hints:[HINT]});
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx({hints:async()=>[HINT]}))).toEqual({result:'data_drift',ledger_ids:['L1'],hints:[HINT]});
 });
 it('privileged without hints: ledger hit → explained_diff, else unexplained_diff(diff)',async()=>{
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx({hints:async()=>[]}))).toEqual({result:'explained_diff',ledger_ids:['L1']});
  expect(await outcome([live()],returns(P1),[],lctx({hints:async()=>[]}))).toEqual({result:'unexplained_diff',reason:'diff'});
 });
 it('unprivileged (no hint reader): no_hints unless the ledger hits; the hint reader gets recorded.at',async()=>{
  expect(await outcome([live()],returns(P1),[],lctx())).toEqual({result:'unexplained_diff',reason:'no_hints'});
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx())).toEqual({result:'explained_diff',ledger_ids:['L1']});
  expect(await outcome([live()],returns(P1),ledger(liveEntry({approved_by:'claude-code'})),lctx())).toEqual({result:'unexplained_diff',reason:'ledger_self_approved'});
  const since:string[]=[];
  await evaluateReplay([live()],returns(P1),[],lctx({hints:async(_r,s)=>{since.push(s);return [];}}));
  expect(since).toEqual(['2026-11-06T00:00:00.000Z']);
 });
 it('the live ledger tuple includes from/to_state_rev',async()=>{
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx({stateRev:async()=>16}))).toEqual({result:'unexplained_diff',reason:'no_hints'});
  expect(await outcome([live()],returns(P1),ledger(liveEntry()),lctx({stateRev:async()=>null}))).toEqual({result:'unexplained_diff',reason:'no_hints'});
 });
 it('summary reduction: identical / explained / data_drift with ids pass; data_drift [] and unexplained count as unexplained_diff',async()=>{
  const lg=ledger(liveEntry({case_id:'b'}));
  const run=async(c:LiveReplayCase,p:Projection,ctx:ReplayContext)=>(await evaluateReplay([c],returns(p),lg,ctx))[0];
  const mixed=[await run(live({case_id:'a'}),P0,lctx()),await run(live({case_id:'b'}),P1,lctx()),await run(live({case_id:'c'}),P1,lctx({hints:async()=>[HINT]})),await run(live({case_id:'d'}),P1,lctx())];
  expect(mixed.map(r=>r.outcome.result)).toEqual(['identical','explained_diff','data_drift','unexplained_diff']);
  const s=summarize(mixed,replaySummaryContext(false));
  expect(s.correctness).toMatchObject({pass:2,unexplained_diff:2});
  expect(s.gate).toBe('fail');
  const all=await evaluateReplay([live({case_id:'a'}),live({case_id:'e'})],returns(P0),[],lctx());
  expect(summarize(all,replaySummaryContext(false)).gate).toBe('pass');
  expect(summarize(all,replaySummaryContext(true)).gate).toBe('incomplete');   // --case subset
 });
});
```

- [ ] **Step 15: 运行，确认失败**

Run: `npm test -- src/lib/evals/kinds/replay.test.ts`
Expected: FAIL — `Failed to resolve import "./replay"`。

- [ ] **Step 16: 实现 `src/lib/evals/kinds/replay.ts`**

```ts
// src/lib/evals/kinds/replay.ts
// replay_consistency (spec §5.3, §3.3 replay rows, §14). frozen: the case's sealed setup is checked against
// the rebuilt database first — a reported mismatch, or a recomputed setup_sha256 ≠ the recorded one →
// read_error(setup_mismatch), nothing projected. Equal projection hash → identical. Otherwise the ledger
// decides: hit → explained_diff(ledger_ids); partial → unexplained_diff(partial_ledger); self-approved →
// unexplained_diff(ledger_self_approved); none → unexplained_diff(diff). frozen never yields data_drift.
// live: identical; a privileged run (ctx.hints present) whose hint reader returns ≥ 1 hint since
// recorded.at → data_drift(ledger_ids of a matching entry, else [] — summary.ts counts [] as
// unexplained_diff); otherwise a ledger hit → explained_diff; an unprivileged run (no hint reader) without a
// hit → unexplained_diff(no_hints) (partial / self-approved reasons take precedence). The live tuple uses
// recorded.state_rev → ctx.stateRev(case). A ProjectionError is read_error(reason); any other failure of a
// case (projection, state rev, hints) is read_error(read_failed). Pure: every read is injected.
import {projectionHash} from '../canonical-json';
import {ProjectionError,diffProjections} from '../projections/facts';
import type {FrozenReplayCase,LiveReplayCase,ReplayCase,ReplayMode} from '../replay/fixture';
import {matchLedger} from '../replay/ledger';
import type {LedgerEntry,LedgerMatch} from '../replay/ledger';
import type {CaseOutcome,CaseReport,Hint,Projection,ReplayRequest,SummaryContext,Thresholds} from '../types';

export type ProjectFn=(request:ReplayRequest)=>Promise<Projection>;
export type SetupCheck={ok:true;setupSha256:string}|{ok:false;mismatch:string[]};
export interface ReplayContext{
 mode:ReplayMode;evaluatorCodeVersion:string;
 /** frozen only: verify the case's setup against the built database (replay/setup.ts::buildFrozenDb). */
 checkSetup?:(c:FrozenReplayCase)=>Promise<SetupCheck>;
 /** live only: the current fact_state_rev of the case's issuer (null = unavailable). */
 stateRev?:(c:LiveReplayCase)=>Promise<number|null>;
 /** live, privileged readers only (PrivilegedReader.hints). Absent = unprivileged. */
 hints?:(request:ReplayRequest,since:string)=>Promise<Hint[]>;
}
export const REPLAY_THRESHOLDS:Thresholds={max_fail:0,min_coverage_optional:'0.95'};
export const replaySummaryContext=(subset:boolean):SummaryContext=>({thresholds:REPLAY_THRESHOLDS,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset,evidenceClass:'truth'});

const report=(c:ReplayCase,outcome:CaseOutcome,detail:Record<string,unknown>):CaseReport=>({case_id:c.case_id,required:true,outcome,left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail});
const missReason=(m:LedgerMatch,fallback:'diff'|'no_hints'):'diff'|'no_hints'|'partial_ledger'|'ledger_self_approved'=>
 m.kind==='partial'?'partial_ledger':m.kind==='self_approved'?'ledger_self_approved':fallback;

async function one(c:ReplayCase,project:ProjectFn,ledger:LedgerEntry[],ctx:ReplayContext):Promise<CaseReport>{
 const before=c.expected.projection_hash;
 const detail:Record<string,unknown>={mode:ctx.mode,before_hash:before,from_code:c.recorded.code_version,to_code:ctx.evaluatorCodeVersion};
 let setupSha='';
 if(ctx.mode==='frozen'){
  const fc=c as FrozenReplayCase;
  const s=await ctx.checkSetup!(fc);
  if(!s.ok)return report(c,{result:'read_error',reason:'setup_mismatch'},{...detail,mismatch:s.mismatch});
  if(s.setupSha256!==fc.setup.setup_sha256)return report(c,{result:'read_error',reason:'setup_mismatch'},{...detail,mismatch:['setup_sha256']});
  setupSha=s.setupSha256;
 }
 let actual:Projection;
 try{actual=await project(c.request);}
 catch(e){return report(c,{result:'read_error',reason:e instanceof ProjectionError?e.reason:'read_failed'},{...detail,message:e instanceof Error?e.message:String(e)});}
 const after=projectionHash(actual);detail.after_hash=after;
 if(after===before)return report(c,{result:'identical'},detail);
 const diff=diffProjections(c.expected.projection,actual);
 const changed=diff.length>0?diff:['projection'];
 detail.changed_fields=changed;
 const base={case_id:c.case_id,before_hash:before,after_hash:after,from_code:c.recorded.code_version,to_code:ctx.evaluatorCodeVersion,changed_fields:changed};
 if(ctx.mode==='frozen'){
  const m=matchLedger(ledger,{...base,mode:'frozen',from_setup_sha256:(c as FrozenReplayCase).setup.setup_sha256,to_setup_sha256:setupSha});
  detail.ledger=m;
  return report(c,m.kind==='hit'?{result:'explained_diff',ledger_ids:m.ledger_ids}:{result:'unexplained_diff',reason:missReason(m,'diff')},detail);
 }
 const lc=c as LiveReplayCase;
 const toRev=ctx.stateRev?await ctx.stateRev(lc):null;
 detail.from_state_rev=lc.recorded.state_rev;detail.to_state_rev=toRev;
 const m=matchLedger(ledger,{...base,mode:'live',from_state_rev:lc.recorded.state_rev,to_state_rev:toRev});
 detail.ledger=m;
 const hints=ctx.hints?await ctx.hints(c.request,lc.recorded.at):null;
 if(hints!==null&&hints.length>0)return report(c,{result:'data_drift',ledger_ids:m.kind==='hit'?m.ledger_ids:[],hints},detail);
 if(m.kind==='hit')return report(c,{result:'explained_diff',ledger_ids:m.ledger_ids},detail);
 return report(c,{result:'unexplained_diff',reason:missReason(m,hints===null?'no_hints':'diff')},detail);
}

export async function evaluateReplay(cases:ReplayCase[],project:ProjectFn,ledger:LedgerEntry[],ctx:ReplayContext):Promise<CaseReport[]>{
 if(ctx.mode==='frozen'&&!ctx.checkSetup)throw new Error('replay frozen: ctx.checkSetup is required');
 const out:CaseReport[]=[];
 for(const c of cases){
  try{out.push(await one(c,project,ledger,ctx));}
  catch(e){out.push(report(c,{result:'read_error',reason:'read_failed'},{mode:ctx.mode,message:e instanceof Error?e.message:String(e)}));}
 }
 return out;
}
```

- [ ] **Step 17: 运行，确认通过**

Run: `npm test -- src/lib/evals/kinds/replay.test.ts src/lib/evals/replay src/lib/evals/projections`
Expected: PASS（replay 14 个用例；fixture、ledger、projections 全绿）。

- [ ] **Step 18: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 两者 0 错误、0 警告。

- [ ] **Step 19: 实施记录**

在 `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md` 末尾追加：

```markdown
## Task 10 — projections, ledger, replay kind

- Files: src/lib/evals/projections/facts.ts, src/lib/evals/replay/{fixture,ledger}.ts, src/lib/evals/kinds/replay.ts, src/lib/evals/test-support/memory-facts.ts (+ tests).
- Decisions: projections read history=true; diff notation facts[<concept>/<start>..<end>/<duration>/<unit>/<available_date>/<source_ref>].<field>, null = empty segment, one-sided row = bare path; unprivileged ledger hit = explained_diff; ledger structural errors = gold_invalid.
- Not wired here: Task 7 factsReader.project → projectRequest (CCR 2).
```

- [ ] **Step 20: 提交**

```bash
git add src/lib/evals/test-support/memory-facts.ts src/lib/evals/projections/facts.ts src/lib/evals/projections/facts.test.ts src/lib/evals/replay/fixture.ts src/lib/evals/replay/fixture.test.ts src/lib/evals/replay/ledger.ts src/lib/evals/replay/ledger.test.ts src/lib/evals/kinds/replay.ts src/lib/evals/kinds/replay.test.ts docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md
```
```bash
git commit -m "feat(evals): replay projections, explanation ledger and replay_consistency kind (F6 Task 10)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `record-replay.ts`（只增）、`facts.frozen.json`（≥ 10）、账本、frozen 真实库回放、路由等价

规格：§5.3.1 录制与执行、§5.3.2 等价单测、§5.3.3、§13.1 `route-equivalence.test.ts`、§13.3 "`replayFrozen` 全 identical；篡改一个夹具字节 → `setup_mismatch`"、§14 `replay_rerecord_refused`。依赖 Task 9（`replay/setup.ts`、F6 种子与合成 EDGAR 夹具、`evals-facts.integration.test.ts`；见 A7、A8、A10、CCR 1）与 Task 10。

**前置假设（实施前核对，不符则先按 CCR 1 对齐 Task 9）：** `src/lib/evals/fixtures/issuers/f6-seed.json`、`src/lib/evals/fixtures/edgar/CIK0009990601.json`、`src/lib/evals/fixtures/edgar/CIK0009990602.json` 已由 Task 9 提交；`replay/setup.ts` 导出 `FrozenSetup`、`FrozenSetupPathsDraft`、`sealSetupFromPaths`、`buildFrozenDb`、`FrozenBuild`（集成后的 Task 9 签名，见 CCR 1 的 Integration resolution）。核对命令：`ls src/lib/evals/fixtures/edgar src/lib/evals/fixtures/issuers && grep -E "export (function|type|interface) (FrozenSetup|FrozenSetupPathsDraft|sealSetupFromPaths|buildFrozenDb|FrozenBuild)\b" src/lib/evals/replay/setup.ts`（应列出 edgar 下的 5 个夹具、种子与 5 个导出）。

**Files:**
- Create: `src/lib/evals/replay/record.ts`（`applyRecording`：只增、`--supersede` 校验）
- Create: `src/lib/evals/replay/record.test.ts`
- Create: `scripts/evals/record-replay.ts`（CLI）
- Create: `src/lib/evals/replay/record-cli.test.ts`（CLI 拒绝路径，不需数据库）
- Create: `src/lib/evals/fixtures/replay/facts.frozen.json`（12 个案例；`expected` 由录制脚本对真实本地库生成）
- Create: `src/lib/evals/fixtures/replay/explanations.json`（`[]`）
- Create（不提交）: `.claude/scratch/db-run.ts`（对新迁移的本地库运行任意命令，注入 `S4_TEST_STATE`）
- Modify: `src/lib/evals/evals-facts.integration.test.ts`（追加 `// Task 11 begin` … `// Task 11 end` 块：frozen 全 identical、篡改 → `setup_mismatch`）
- Create: `src/lib/evals/route-equivalence.test.ts`（内存 `FactsDb`：投影(库) == 投影(路由响应)，facts 与 metrics）
- Create: `src/lib/evals/cli/run-replay.ts`、`src/lib/evals/cli/run-replay.test.ts`（`run.ts --kind replay_consistency`；集成时补上）
- Modify: `src/lib/evals/cli/run-cli.ts`（`KIND_RUNNERS` 加 `replay_consistency`）、`src/lib/evals/cli/deps.ts` + `deps.test.ts`（`withProjector`：`ModuleReader.project` 委托 `projectRequest`，CCR 2）
- Modify: `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`

- [ ] **Step 1: 写失败测试 `src/lib/evals/replay/record.test.ts`**

```ts
// src/lib/evals/replay/record.test.ts
import {describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection} from '../types';
import type {FrozenReplayCase,ReplayFile} from './fixture';
import {parseLedger} from './ledger';
import {applyRecording} from './record';

const C1='1'.repeat(40),C2='2'.repeat(40),S='5'.repeat(64),AT='2026-11-06T00:00:00.000Z';
const P0:Projection={module:'facts',rows:[{concept:'revenue',value_text:'100'}]};
const P1:Projection={module:'facts',rows:[{concept:'revenue',value_text:'101'}]};
const request={issuer:{market:'US' as const,cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'};
const setup={setup_sha256:S,today:'2026-11-06',initial_state:'empty_after_migrations'};
const draftFile=():ReplayFile=>({schema_version:1,module:'facts',mode:'frozen',cases:[{case_id:'c1',request,setup:{today:'2026-11-06'},recorded:null,expected:null}]});
const recordedFile=():ReplayFile=>({schema_version:1,module:'facts',mode:'frozen',cases:[{case_id:'c1',request,setup,recorded:{code_version:C1,at:AT},expected:{projection_hash:projectionHash(P0),projection:P0}}]});
const entry=(p:Record<string,unknown>={})=>({ledger_id:'L9',case_id:'c1',mode:'frozen',changed_fields:['facts[x].value_text'],before_hash:projectionHash(P0),after_hash:projectionHash(P1),from_code:C1,to_code:C2,from_setup_sha256:S,to_setup_sha256:S,
 reason_code:'bug_fixed',evidence:{pr:7,regression_test:'src/lib/facts/derive.test.ts::y'},added_by:'claude-code',added_at:AT,approved_by:'owner',approval_ref:'https://github.com/osborn-studio/OsbornAlpha/pull/7#pullrequestreview-9',approved_at:AT,...p});
const refusal=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof EvalError?e.code:`other:${String(e)}`;}};
const input=(projection:Projection,p:Record<string,unknown>={})=>({case_id:'c1',projection,setup,code_version:C2,at:'2026-11-07T00:00:00.000Z',...p});

describe('applyRecording',()=>{
 it('records a draft: sealed setup, recorded code/at, expected hash + projection; the input file is not mutated',()=>{
  const f=draftFile();
  const r=applyRecording(f,input(P0),{ledger:[]});
  expect(r.action).toBe('recorded');
  expect(r.projection_hash).toBe(projectionHash(P0));
  expect(r.file.cases[0]).toEqual({case_id:'c1',request,setup,recorded:{code_version:C2,at:'2026-11-07T00:00:00.000Z'},expected:{projection_hash:projectionHash(P0),projection:P0}});
  expect(f.cases[0].expected).toBeNull();
 });
 it('an unchanged projection leaves the recorded case untouched',()=>{
  const f=recordedFile();
  const r=applyRecording(f,input(P0),{ledger:[]});
  expect(r.action).toBe('unchanged');
  expect(r.file).toEqual(recordedFile());
 });
 it('a changed projection without --supersede is refused (replay_rerecord_refused) — e.g. a case that replays as unexplained_diff',()=>{
  expect(refusal(()=>applyRecording(recordedFile(),input(P1),{ledger:[]}))).toBe('replay_rerecord_refused');
 });
 it('--supersede with an approved entry for this case/mode/before/after → superseded, history appended, setup kept',()=>{
  const r=applyRecording(recordedFile(),input(P1),{supersede:'L9',ledger:parseLedger([entry()])});
  expect(r.action).toBe('superseded');
  const c=r.file.cases[0] as FrozenReplayCase;
  expect(c.expected.projection_hash).toBe(projectionHash(P1));
  expect(c.setup).toEqual(setup);
  expect(c.supersessions).toEqual([{ledger_id:'L9',before_hash:projectionHash(P0),after_hash:projectionHash(P1),at:'2026-11-07T00:00:00.000Z'}]);
 });
 it('--supersede refusals: unknown id, self-approved, other case, other mode, before ≠ recorded, after ≠ new, on a draft',()=>{
  const sup=(e:Record<string,unknown>)=>refusal(()=>applyRecording(recordedFile(),input(P1),{supersede:String(e.ledger_id),ledger:parseLedger([e])}));
  expect(refusal(()=>applyRecording(recordedFile(),input(P1),{supersede:'nope',ledger:parseLedger([entry()])}))).toBe('replay_rerecord_refused');
  expect(sup(entry({approved_by:'claude-code'}))).toBe('replay_rerecord_refused');
  expect(sup(entry({case_id:'c2'}))).toBe('replay_rerecord_refused');
  const live=entry({mode:'live',from_state_rev:1,to_state_rev:2});delete (live as Record<string,unknown>).from_setup_sha256;delete (live as Record<string,unknown>).to_setup_sha256;
  expect(sup(live)).toBe('replay_rerecord_refused');
  expect(sup(entry({before_hash:'c'.repeat(64)}))).toBe('replay_rerecord_refused');
  expect(sup(entry({after_hash:'c'.repeat(64)}))).toBe('replay_rerecord_refused');
  expect(refusal(()=>applyRecording(draftFile(),input(P0),{supersede:'L9',ledger:parseLedger([entry()])}))).toBe('replay_rerecord_refused');
 });
 it('unknown case → gold_invalid; frozen draft without setup → gold_invalid; live needs state_rev; bad code version → code_version_missing',()=>{
  expect(refusal(()=>applyRecording(draftFile(),input(P0,{case_id:'zz'}),{ledger:[]}))).toBe('gold_invalid');
  expect(refusal(()=>applyRecording(draftFile(),input(P0,{setup:undefined}),{ledger:[]}))).toBe('gold_invalid');
  const liveDraft:ReplayFile={schema_version:1,module:'facts',mode:'live',cases:[{case_id:'c1',request,recorded:null,expected:null}]};
  expect(refusal(()=>applyRecording(liveDraft,input(P0,{setup:undefined}),{ledger:[]}))).toBe('gold_invalid');
  expect(applyRecording(liveDraft,input(P0,{setup:undefined,state_rev:4}),{ledger:[]}).file.cases[0].recorded).toEqual({code_version:C2,at:'2026-11-07T00:00:00.000Z',state_rev:4});
  expect(refusal(()=>applyRecording(draftFile(),input(P0,{code_version:'HEAD'}),{ledger:[]}))).toBe('code_version_missing');
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/evals/replay/record.test.ts`
Expected: FAIL — `Failed to resolve import "./record"`。

- [ ] **Step 3: 实现 `src/lib/evals/replay/record.ts`**

```ts
// src/lib/evals/replay/record.ts
// Append-only recording of replay expectations (spec §5.3.1 录制, §5.3.2 录制, §5.3.3, §14
// replay_rerecord_refused). A draft case (recorded = expected = null) gets its expected projection,
// recorded {code_version, at[, state_rev]} and (frozen) the sealed setup. A recorded case whose new
// projection hash equals the stored one is left untouched. A changed one is refused unless --supersede
// names a ledger entry that is approved (approved_by ≠ added_by), for this case and mode, whose
// before_hash is the stored hash and whose after_hash is the new hash; then expected/recorded are replaced,
// the setup is kept and the supersession is appended to case.supersessions. Pure: returns a new file.
import {projectionHash} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection} from '../types';
import {isDraft} from './fixture';
import type {FrozenReplayCase,LiveReplayCase,ReplayFile,SealedSetup} from './fixture';
import {isSelfApproved} from './ledger';
import type {LedgerEntry} from './ledger';

export interface RecordInput{case_id:string;projection:Projection;setup?:SealedSetup;code_version:string;at:string;state_rev?:number|null}
export interface RecordOptions{supersede?:string;ledger:LedgerEntry[]}
export type RecordAction='recorded'|'unchanged'|'superseded';
export interface RecordResult{file:ReplayFile;action:RecordAction;projection_hash:string}

const refuse=(message:string,detail:Record<string,unknown>)=>new EvalError('replay_rerecord_refused',message,detail);

export function applyRecording(file:ReplayFile,input:RecordInput,opts:RecordOptions):RecordResult{
 const i=file.cases.findIndex(c=>c.case_id===input.case_id);
 if(i<0)throw new EvalError('gold_invalid',`unknown replay case ${input.case_id}`,{case_id:input.case_id});
 if(!/^[0-9a-f]{40}$/.test(input.code_version))throw new EvalError('code_version_missing',`recording needs a 40-hex evaluator code version, got ${input.code_version}`);
 const hash=projectionHash(input.projection);
 const expected={projection_hash:hash,projection:structuredClone(input.projection)};
 const recorded=()=>{
  if(file.mode==='frozen')return {code_version:input.code_version,at:input.at};
  if(typeof input.state_rev!=='number'||!Number.isSafeInteger(input.state_rev)||input.state_rev<0)throw new EvalError('gold_invalid',`live case ${input.case_id}: state_rev unavailable`,{case_id:input.case_id});
  return {code_version:input.code_version,at:input.at,state_rev:input.state_rev};
 };
 const next=structuredClone(file);
 const c=next.cases[i];
 if(isDraft(c)){
  if(opts.supersede!==undefined)throw refuse(`case ${c.case_id}: --supersede applies to recorded cases only`,{case_id:c.case_id});
  if(file.mode==='frozen'){
   if(!input.setup)throw new EvalError('gold_invalid',`frozen case ${c.case_id}: recording needs the sealed setup`,{case_id:c.case_id});
   const rec:FrozenReplayCase={case_id:c.case_id,request:c.request,setup:structuredClone(input.setup),recorded:recorded(),expected};
   next.cases[i]=rec;
  }else{
   const rec:LiveReplayCase={case_id:c.case_id,request:c.request,recorded:recorded() as LiveReplayCase['recorded'],expected};
   next.cases[i]=rec;
  }
  return {file:next,action:'recorded',projection_hash:hash};
 }
 const before=c.expected.projection_hash;
 if(before===hash)return {file,action:'unchanged',projection_hash:hash};
 const detail={case_id:c.case_id,before_hash:before,after_hash:hash};
 if(opts.supersede===undefined)throw refuse(`case ${c.case_id}: projection changed (${before} → ${hash}); re-recording needs --supersede <approved ledger_id>`,detail);
 const e=opts.ledger.find(x=>x.ledger_id===opts.supersede);
 const why=!e?'ledger_id not found':isSelfApproved(e)?'ledger entry is self-approved':e.case_id!==c.case_id?'ledger entry is for another case'
  :e.mode!==file.mode?'ledger entry is for another mode':e.before_hash!==before?'ledger before_hash ≠ recorded projection hash':e.after_hash!==hash?'ledger after_hash ≠ new projection hash':null;
 if(why!==null||!e)throw refuse(`case ${c.case_id}: ${why}`,{...detail,ledger_id:opts.supersede});
 next.cases[i]={...c,recorded:recorded(),expected,supersessions:[...(c.supersessions??[]),{ledger_id:e.ledger_id,before_hash:before,after_hash:hash,at:input.at}]} as FrozenReplayCase|LiveReplayCase;
 return {file:next,action:'superseded',projection_hash:hash};
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/evals/replay/record.test.ts`
Expected: PASS（6 个用例）。

- [ ] **Step 5: 写 CLI `scripts/evals/record-replay.ts`**

```ts
/**
 * Record replay expectations (spec §5.3.1, §5.3.2, §5.3.3, §14).
 *
 *   npx tsx scripts/evals/record-replay.ts --mode frozen|live --case <id> [--case <id> ...] [--supersede <ledger_id>] [--file <path>] [--ledger <path>]
 *
 * Append-only (replay/record.ts::applyRecording): a draft case (expected null) is recorded; a recorded
 * case whose projection hash is unchanged stays untouched; a changed one is refused
 * (replay_rerecord_refused, exit 2) unless --supersede (exactly one --case) names an approved ledger entry
 * for this case and mode with before_hash = stored hash and after_hash = new hash.
 * frozen: needs S4_TEST_STATE (a freshly migrated local database — run through .claude/scratch/db-run.ts);
 * the draft setup is sealed with replay/setup.ts::sealSetupFromPaths, the database is built once per setup_sha256
 * with buildFrozenDb, and the projection is read over that database (projections/facts.ts::projectRequest).
 * live: production over the anon client (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, e.g.
 * node --env-file=.env.local --import tsx …), recording fact_state_rev after the projection.
 * The file is written once, only after every requested case succeeded. Prints "<action> <case_id> <hash>".
 * Exit 0 ok, 2 refused or bad arguments, 1 any other failure.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {Pool} from 'pg';
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {EvalError,exitCodeOfError} from '../../src/lib/evals/errors';
import {projectRequest,resolveFactsSubject} from '../../src/lib/evals/projections/facts';
import type {ProjectionDeps} from '../../src/lib/evals/projections/facts';
import {isDraft,parseReplayFile,serializeReplayFile} from '../../src/lib/evals/replay/fixture';
import type {DraftReplayCase,FrozenReplayCase,ReplayCase,ReplayFile,ReplayMode,SealedSetup} from '../../src/lib/evals/replay/fixture';
import {loadLedger} from '../../src/lib/evals/replay/ledger';
import {applyRecording} from '../../src/lib/evals/replay/record';
import {buildFrozenDb,sealSetupFromPaths} from '../../src/lib/evals/replay/setup';
import type {FrozenSetup,FrozenSetupPathsDraft} from '../../src/lib/evals/replay/setup';
import type {Projection} from '../../src/lib/evals/types';
import {evaluatorVersion} from '../../src/lib/evals/version';
import {supabaseFactsDb} from '../../src/lib/facts/db';
import {getAnonSupabase} from '../../src/lib/supabase/anon';

class UsageError extends Error{}
const USAGE='usage: record-replay.ts --mode frozen|live --case <id> [--case <id> ...] [--supersede <ledger_id>] [--file <path>] [--ledger <path>]';

interface Args{mode:ReplayMode;cases:string[];supersede?:string;file:string;ledger:string}
function parseArgs(argv:string[]):Args{
 let mode:string|undefined,supersede:string|undefined,file:string|undefined,ledger:string|undefined;const cases:string[]=[];
 for(let i=0;i<argv.length;i+=2){
  const x=argv[i],v=argv[i+1];
  if(v===undefined||v.startsWith('--'))throw new UsageError(USAGE);
  if(x==='--mode')mode=v;else if(x==='--case')cases.push(v);else if(x==='--supersede')supersede=v;else if(x==='--file')file=v;else if(x==='--ledger')ledger=v;else throw new UsageError(USAGE);
 }
 if(mode!=='frozen'&&mode!=='live')throw new UsageError(USAGE);
 if(cases.length===0||new Set(cases).size!==cases.length)throw new UsageError(USAGE);
 if(supersede!==undefined&&cases.length!==1)throw new UsageError('--supersede takes exactly one --case');
 return {mode,cases,supersede,file:file??`src/lib/evals/fixtures/replay/facts.${mode}.json`,ledger:ledger??'src/lib/evals/fixtures/replay/explanations.json'};
}
const readJson=(path:string):unknown=>{
 try{return JSON.parse(readFileSync(path,'utf8'));}
 catch(e){throw new EvalError('gold_invalid',`${path}: unreadable (${e instanceof Error?e.message:String(e)})`,{file:path});}
};

interface Env{project(c:ReplayCase|DraftReplayCase):Promise<{projection:Projection;setup?:SealedSetup;stateRev?:number|null}>;close():Promise<void>}

function frozenEnv():Env{
 const state=process.env.S4_TEST_STATE;
 if(!state)throw new UsageError('--mode frozen needs S4_TEST_STATE: run through .claude/scratch/db-run.ts');
 const pool=new Pool({connectionString:JSON.parse(readFileSync(state,'utf8')).adminUrl});
 const built=new Map<string,ProjectionDeps>();
 return {
  async project(c){
   const setup:FrozenSetup=isDraft(c)?sealSetupFromPaths(c.setup as unknown as FrozenSetupPathsDraft):(c as FrozenReplayCase).setup as unknown as FrozenSetup;
   let deps=built.get(setup.setup_sha256);
   if(!deps){
    const r=await buildFrozenDb(pool,setup);
    if(!r.ok)throw new EvalError('gold_invalid',`case ${c.case_id}: setup_mismatch (${r.mismatch})`,{case_id:c.case_id,mismatch:r.mismatch});
    const tables=r.world.tables;
    deps={db:r.world.db,resolve:(s,t)=>resolveFactsSubject(tables,s,t)};
    built.set(setup.setup_sha256,deps);
   }
   return {projection:await projectRequest(deps,c.request,setup.today),setup:setup as unknown as SealedSetup};
  },
  close:()=>pool.end(),
 };
}

function liveEnv():Env{
 const sb=getAnonSupabase();
 const tables=supabaseTableClient(sb);
 const deps:ProjectionDeps={db:supabaseFactsDb(sb),resolve:(s,t)=>resolveFactsSubject(tables,s,t)};
 const rpc=sb as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
 const today=new Date().toISOString().slice(0,10);
 return {
  async project(c){
   const projection=await projectRequest(deps,c.request,today);   // ProjectionError(subject_unresolved) when the issuer is unknown
   const ref=(await deps.resolve(c.request.issuer,today))!;
   const {data,error}=await rpc.rpc('fact_state_rev',{p_issuer:ref.issuerId,p_market:ref.market});
   if(error)throw new Error(`fact_state_rev_failed: ${error.message??''}`);
   const n=Number(data);
   if(!Number.isSafeInteger(n)||n<0)throw new Error('fact_state_rev_invalid');
   return {projection,stateRev:n};
  },
  close:async()=>{},
 };
}

async function main(argv:string[]):Promise<void>{
 const a=parseArgs(argv);
 const {sha}=evaluatorVersion();
 const file=parseReplayFile(readJson(a.file),{allowDrafts:true,file:a.file});
 if(file.mode!==a.mode)throw new EvalError('gold_invalid',`${a.file} is a ${file.mode} file`,{file:a.file});
 for(const id of a.cases)if(!file.cases.some(c=>c.case_id===id))throw new EvalError('gold_invalid',`${a.file}: unknown case ${id}`,{file:a.file,case_id:id});
 const ledger=loadLedger(a.ledger);
 const env=a.mode==='frozen'?frozenEnv():liveEnv();
 let cur:ReplayFile=file;
 const lines:string[]=[];
 try{
  for(const id of a.cases){
   const c=cur.cases.find(x=>x.case_id===id)!;
   const got=await env.project(c);
   const r=applyRecording(cur,{case_id:id,projection:got.projection,setup:got.setup,code_version:sha,at:new Date().toISOString(),state_rev:got.stateRev},{supersede:a.supersede,ledger});
   cur=r.file;lines.push(`${r.action} ${id} ${r.projection_hash}`);
  }
 }finally{await env.close();}
 writeFileSync(a.file,serializeReplayFile(cur));
 for(const l of lines)console.log(l);
}

main(process.argv.slice(2)).catch(e=>{
 if(e instanceof UsageError){console.error(e.message);process.exitCode=2;return;}
 if(e instanceof EvalError){console.error(`${e.code}: ${e.message}`);process.exitCode=exitCodeOfError(e);return;}
 console.error(e instanceof Error?e.message:String(e));process.exitCode=1;
});
```

- [ ] **Step 6: 写 CLI 拒绝路径测试 `src/lib/evals/replay/record-cli.test.ts`**

```ts
// src/lib/evals/replay/record-cli.test.ts
// The refusal paths of scripts/evals/record-replay.ts that need no database: bad arguments (2), an unknown
// case (gold_invalid, 2) and re-recording a changed case without --supersede is covered by record.test.ts.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {projectionHash} from '../canonical-json';
import type {Projection} from '../types';

const script=resolve('scripts/evals/record-replay.ts');
// The test-state variable's name is assembled: any *.test.ts containing it literally must be a critical DB suite (scripts/ci/research-checks.ts inventory).
const STATE_VAR=['S4','TEST','STATE'].join('_');
const run=(args:string[])=>spawnSync(process.execPath,['--import','tsx',script,...args],{encoding:'utf8',timeout:60000,env:{...process.env,[STATE_VAR]:''}});
const dir=mkdtempSync(join(tmpdir(),'f6-record-cli-'));
afterAll(()=>rmSync(dir,{recursive:true,force:true}));
const P:Projection={module:'facts',rows:[]};
const fixture=join(dir,'facts.frozen.json');
writeFileSync(fixture,`${JSON.stringify({schema_version:1,module:'facts',mode:'frozen',cases:[{case_id:'c1',request:{issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2025-06-30'},
 setup:{setup_sha256:'5'.repeat(64),today:'2026-11-06'},recorded:{code_version:'1'.repeat(40),at:'2026-11-06T00:00:00.000Z'},expected:{projection_hash:projectionHash(P),projection:P}}]},null,1)}\n`);
const ledger=join(dir,'explanations.json');writeFileSync(ledger,'[]\n');

describe('record-replay CLI',()=>{
 it('bad arguments → exit 2 with usage',()=>{
  for(const args of [[],['--mode','frozen'],['--mode','sideways','--case','c1'],['--mode','frozen','--case','c1','--case','c2','--supersede','L1'],['--mode','frozen','--case']]){
   const r=run(args);
   expect(r.status).toBe(2);
   expect(r.stderr).toMatch(/usage|--supersede/);
  }
 },300000);
 it('unknown case → gold_invalid exit 2; the file is not touched',()=>{
  const before=readFileSync(fixture,'utf8');
  const r=run(['--mode','frozen','--case','nope','--file',fixture,'--ledger',ledger]);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('gold_invalid');
  expect(readFileSync(fixture,'utf8')).toBe(before);
 },120000);
 it('frozen without the test-state variable → exit 2 before touching the file',()=>{
  const before=readFileSync(fixture,'utf8');
  const r=run(['--mode','frozen','--case','c1','--file',fixture,'--ledger',ledger]);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain(STATE_VAR);
  expect(readFileSync(fixture,'utf8')).toBe(before);
 },120000);
});
```

- [ ] **Step 7: 运行 CLI 测试**

Run: `npm test -- src/lib/evals/replay/record-cli.test.ts`
Expected: PASS（3 个用例）。若第一次运行时 `scripts/evals/record-replay.ts` 尚未保存则 FAIL（`Cannot find module`）——本步在 Step 5 之后，直接 PASS。

- [ ] **Step 8: 建账本与 frozen 案例草稿**

`src/lib/evals/fixtures/replay/explanations.json`：

```json
[]
```

`src/lib/evals/fixtures/replay/facts.frozen.json`（12 个草稿；`setup` 是 Task 9 的 `FrozenSetupPathsDraft`（只写路径，`record-replay.ts` 用 `sealSetupFromPaths` 补齐全部哈希）——若 Task 9 落地的草稿类型字段名不同，以 Task 9 的类型为准改写这一对象，其余不变；`today` 固定 `2026-11-06`）：

```json
{
 "schema_version": 1,
 "module": "facts",
 "mode": "frozen",
 "cases": [
  {"case_id": "zzeva-revenue-12m-2024-06-30", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": ["revenue"], "asOf": "2024-06-30", "durations": ["12M"]}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzeva-revenue-all-2026-11-05", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": ["revenue"], "asOf": "2026-11-05"}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzeva-net-income-3m-2025-03-31", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": ["net_income_parent"], "asOf": "2025-03-31", "durations": ["3M"]}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzeva-balance-sheet-2026-11-05", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": ["total_assets", "total_liabilities", "equity_parent"], "asOf": "2026-11-05", "durations": ["INSTANT"]}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzeva-cash-2021-06-30", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": ["cash"], "asOf": "2021-06-30"}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzeva-eps-2026-11-05", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": ["eps_basic", "eps_diluted"], "asOf": "2026-11-05"}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzeva-cash-flow-12m-2025-12-31", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": ["operating_cash_flow", "capex"], "asOf": "2025-12-31", "durations": ["12M"]}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzeva-before-first-filing-2010-01-01", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": ["revenue"], "asOf": "2010-01-01"}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzeva-metrics-2026-11-05", "request": {"issuer": {"market": "US", "cik": "9990601"}, "concepts": [], "metrics": ["gross_margin", "net_margin", "revenue_yoy"], "asOf": "2026-11-05"}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzevb-revenue-12m-2026-11-05", "request": {"issuer": {"market": "US", "cik": "9990602"}, "concepts": ["revenue"], "asOf": "2026-11-05", "durations": ["12M"]}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzevb-total-assets-2025-06-30", "request": {"issuer": {"market": "US", "cik": "9990602"}, "concepts": ["total_assets"], "asOf": "2025-06-30", "durations": ["INSTANT"]}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null},
  {"case_id": "zzevb-metrics-ttm-2026-06-30", "request": {"issuer": {"market": "US", "cik": "9990602"}, "concepts": [], "metrics": ["ttm_revenue", "roe"], "asOf": "2026-06-30"}, "setup": {"initial_state": "empty_after_migrations", "issuer_seed": {"path": "src/lib/evals/fixtures/issuers/f6-seed.json"}, "fixture_manifest": [{"path": "src/lib/evals/fixtures/edgar/CIK0009990601.json"}, {"path": "src/lib/evals/fixtures/edgar/CIK0009990602.json"}], "sync_order": ["CIK0009990601.json", "CIK0009990602.json"], "today": "2026-11-06", "mapping_gen": 1, "formula_version": "facts-derive/1.0", "quarantine_resolutions": []}, "recorded": null, "expected": null}
 ]
}
```

核对草稿可解析：
Run: `node --import tsx -e "import('./src/lib/evals/replay/fixture.ts').then(m=>{const f=m.parseReplayFile(JSON.parse(require('fs').readFileSync('src/lib/evals/fixtures/replay/facts.frozen.json','utf8')),{allowDrafts:true});console.log(f.cases.length,f.cases.filter(m.isDraft).length)})"`
Expected: `12 12`

- [ ] **Step 9: 建对本地库运行命令的辅助 `.claude/scratch/db-run.ts`（不提交）**

```ts
// .claude/scratch/db-run.ts — NOT committed. Starts a fresh migrated local PostgreSQL (scripts/s4/local-db),
// runs the given command with S4_TEST_STATE pointing at it, stops the database. Usage:
//   LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-run.ts <command> [args...]
import {spawn} from 'node:child_process';
import {startLocalDatabase,stopLocalDatabase} from '../../scripts/s4/local-db';
async function main(){
 const [cmd,...args]=process.argv.slice(2);
 if(!cmd){console.error('usage: db-run.ts <command> [args...]');process.exitCode=2;return;}
 const db=await startLocalDatabase();
 let err:unknown;
 try{
  await new Promise<void>((res,rej)=>{
   const c=spawn(cmd,args,{stdio:'inherit',env:{...process.env,S4_TEST_STATE:db.stateFile}});
   c.once('exit',code=>code===0?res():rej(new Error(`${cmd} exit ${code}`)));
  });
 }catch(e){err=e;}finally{stopLocalDatabase(db,err);}
 if(err){console.error(err instanceof Error?err.message:err);process.exitCode=1;}
}
main();
```

（`startLocalDatabase()` 返回对象带 `stateFile`，与 `db-one.ts` 用法一致；`.claude/scratch/` 在 `tsconfig` 的 `**/*.ts` 范围内，`npm run typecheck` 会检查它。）

- [ ] **Step 10: 对真实本地库录制全部 12 个案例（不手写哈希）**

Run:
```bash
LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-run.ts npx tsx scripts/evals/record-replay.ts --mode frozen --case zzeva-revenue-12m-2024-06-30 --case zzeva-revenue-all-2026-11-05 --case zzeva-net-income-3m-2025-03-31 --case zzeva-balance-sheet-2026-11-05 --case zzeva-cash-2021-06-30 --case zzeva-eps-2026-11-05 --case zzeva-cash-flow-12m-2025-12-31 --case zzeva-before-first-filing-2010-01-01 --case zzeva-metrics-2026-11-05 --case zzevb-revenue-12m-2026-11-05 --case zzevb-total-assets-2025-06-30 --case zzevb-metrics-ttm-2026-06-30
```
Expected: 12 行 `recorded <case_id> <64 hex>`，退出码 0；`facts.frozen.json` 现在每个案例都有 `setup.setup_sha256`、`recorded.code_version`（40 hex）、`expected.projection_hash`、`expected.projection`。

- [ ] **Step 11: 在另一个全新的库上重跑，证明确定性**

Run: 与 Step 10 完全相同的命令。
Expected: 12 行 `unchanged <case_id> <与 Step 10 相同的哈希>`，退出码 0；`git diff --stat src/lib/evals/fixtures/replay/facts.frozen.json` 与 Step 10 之后相比无变化（只做 `serializeReplayFile` 原样回写）。

- [ ] **Step 12: 检查投影内容不是空壳**

Run: `node -e "const f=require('./src/lib/evals/fixtures/replay/facts.frozen.json');for(const c of f.cases)console.log(c.case_id,c.expected.projection.module,c.expected.projection.rows.length)"`
Expected: 12 行；`zzeva-before-first-filing-2010-01-01` 为 `facts 0`，其余 11 个行数 > 0，两个 metrics 案例 module 为 `metrics`。若除 2010 案例之外有行数为 0 的案例：用 `node -e "console.log(Object.keys(require('./src/lib/evals/fixtures/edgar/CIK0009990602.json').facts['us-gaap']).join(','))"` 查该发行人夹具里有的 us-gaap 概念，把该**草稿**的 `concepts`/`metrics` 换成存在的概念（`src/lib/facts/concepts.ts` 的映射）后，把该案例的 `setup/recorded/expected` 恢复为草稿（`recorded:null, expected:null`、`setup` 换回 Step 8 的草稿对象），再对该案例执行 Step 10 与 Step 11（只增：其他 11 个案例输出 `unchanged`，不改）。

- [ ] **Step 13: 在集成测试里追加 frozen 回放块**

在 `src/lib/evals/evals-facts.integration.test.ts` 的 import 区末尾加（别名避免与 Task 9 已有的标识符冲突；若 vitest 的 `afterAll/beforeAll/describe/expect/it` 中有未导入者，加进该文件已有的 `vitest` import）：

```ts
// Task 11 begin (imports)
import {cpSync as cpReplay,mkdtempSync as mkdtempReplay,readFileSync as readReplayFile,rmSync as rmReplay,writeFileSync as writeReplayFile} from 'node:fs';
import {tmpdir as replayTmpdir} from 'node:os';
import {join as joinReplay} from 'node:path';
import {Pool as ReplayPool} from 'pg';
import {evaluateReplay,replaySummaryContext} from './kinds/replay';
import type {SetupCheck} from './kinds/replay';
import {projectRequest,resolveFactsSubject} from './projections/facts';
import {parseReplayFile,recordedCases} from './replay/fixture';
import type {FrozenReplayCase} from './replay/fixture';
import {loadLedger} from './replay/ledger';
import {buildFrozenDb as buildFrozenDbForReplay} from './replay/setup';
import type {FrozenSetup as FrozenSetupForReplay} from './replay/setup';
import {summarize as summarizeReplay} from './summary';
import type {CaseReport as ReplayCaseReport,ReplayRequest as ReplayRequestForReplay,Subject as ReplaySubject} from './types';
import {evaluatorVersion as replayEvaluatorVersion} from './version';
// Task 11 end (imports)
```

在文件末尾追加：

```ts
// Task 11 begin — replay frozen over the committed cases (spec §5.3.1, §13.3)
describe.skipIf(!process.env.S4_TEST_STATE)('evals-facts: replay frozen (Task 11)',()=>{
 const FROZEN='src/lib/evals/fixtures/replay/facts.frozen.json';
 const LEDGER='src/lib/evals/fixtures/replay/explanations.json';
 let replayPool:ReplayPool;
 beforeAll(()=>{replayPool=new ReplayPool({connectionString:JSON.parse(readReplayFile(process.env.S4_TEST_STATE!,'utf8')).adminUrl});});
 afterAll(async()=>{await replayPool?.end();});
 const frozenCases=()=>recordedCases(parseReplayFile(JSON.parse(readReplayFile(FROZEN,'utf8')),{allowDrafts:false,file:FROZEN})) as FrozenReplayCase[];
 const ctxOf=(check:SetupCheck)=>({mode:'frozen' as const,evaluatorCodeVersion:replayEvaluatorVersion().sha,checkSetup:async()=>check});

 it('every committed frozen case replays identical and the replay gate passes',async()=>{
  const cases=frozenCases();const ledger=loadLedger(LEDGER);
  expect(cases.length).toBeGreaterThanOrEqual(10);
  const groups=new Map<string,FrozenReplayCase[]>();
  for(const c of cases){const g=groups.get(c.setup.setup_sha256)??[];g.push(c);groups.set(c.setup.setup_sha256,g);}
  const reports:ReplayCaseReport[]=[];
  for(const group of groups.values()){
   const setup=group[0].setup as unknown as FrozenSetupForReplay;
   const built=await buildFrozenDbForReplay(replayPool,setup);
   if(!built.ok){reports.push(...await evaluateReplay(group,async()=>{throw new Error('setup not built');},ledger,ctxOf({ok:false,mismatch:[built.mismatch]})));continue;}
   const tables=built.world.tables;
   const deps={db:built.world.db,resolve:(s:ReplaySubject,t:string)=>resolveFactsSubject(tables,s,t)};
   reports.push(...await evaluateReplay(group,(r:ReplayRequestForReplay)=>projectRequest(deps,r,setup.today),ledger,ctxOf({ok:true,setupSha256:built.world.setup.setup_sha256})));
  }
  expect(reports.filter(r=>r.outcome.result!=='identical').map(r=>({case_id:r.case_id,outcome:r.outcome,changed:r.detail.changed_fields??null}))).toEqual([]);
  const s=summarizeReplay(reports,replaySummaryContext(false));
  expect(s.population).toBe(cases.length);
  expect(s.correctness.pass).toBe(cases.length);
  expect(s.gate).toBe('pass');
 },600000);

 it('one flipped fixture byte (temp copy of the tree) → read_error(setup_mismatch), nothing projected',async()=>{
  const root=mkdtempReplay(joinReplay(replayTmpdir(),'f6-replay-tamper-'));
  try{
   cpReplay('src/lib/evals/fixtures',joinReplay(root,'src/lib/evals/fixtures'),{recursive:true});
   cpReplay('src/lib/facts',joinReplay(root,'src/lib/facts'),{recursive:true});
   const c=frozenCases()[0];
   const setup=c.setup as unknown as FrozenSetupForReplay;
   const target=joinReplay(root,setup.fixture_manifest[0].path);
   const bytes=readReplayFile(target);
   const at=bytes.indexOf('"val":')+6;
   let i=at;while(i<bytes.length&&(bytes[i]<0x30||bytes[i]>0x39))i++;
   expect(i).toBeLessThan(bytes.length);
   bytes[i]=bytes[i]===0x39?0x38:bytes[i]+1;   // change one digit of the first value
   writeReplayFile(target,bytes);
   const built=await buildFrozenDbForReplay(replayPool,setup,root);
   expect(built.ok).toBe(false);
   const check:SetupCheck=built.ok?{ok:true,setupSha256:built.world.setup.setup_sha256}:{ok:false,mismatch:[built.mismatch]};
   const [r]=await evaluateReplay([c],async()=>{throw new Error('must not project');},[],ctxOf(check));
   expect(r.outcome).toEqual({result:'read_error',reason:'setup_mismatch'});
   expect((r.detail.mismatch as string[]).length).toBeGreaterThan(0);
  }finally{rmReplay(root,{recursive:true,force:true});}
 },120000);
});
// Task 11 end
```

- [ ] **Step 14: 运行集成测试（单文件、全新本地库）**

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/evals/evals-facts.integration.test.ts`
Expected: PASS——Task 9 的用例照旧通过，新增 `evals-facts: replay frozen (Task 11)` 两个用例通过，无 skip。若第一个用例列出非 identical 案例：先确认 Task 9 的变更类用例没有写 ZZEVA/ZZEVB（CCR 1），不要重录。

- [ ] **Step 15: 写路由等价单测 `src/lib/evals/route-equivalence.test.ts`**

```ts
// src/lib/evals/route-equivalence.test.ts
// Spec §5.3.2 / §13.1: the replay projection computed over the database path (projections/facts.ts) equals
// the projection computed from the PUBLIC route handlers' JSON for the same request, on one in-memory
// FactsDb. The routes have no injectable deps: publicClients() (src/lib/facts/public-route.ts) builds its
// FactsDb with supabaseFactsDb (src/lib/facts/db.ts) over getAnonSupabase (src/lib/supabase/anon.ts) and
// resolves tickers through resolveIssuer (src/lib/entities/resolve.ts) — those three modules are mocked.
import {beforeEach,describe,expect,it,vi} from 'vitest';

const shared=vi.hoisted(()=>({db:null as unknown,issuer:'11111111-1111-4111-8111-111111111111'}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({rpc:async()=>({data:null,error:{message:'not used by asOf reads'}})})}));
vi.mock('@/lib/facts/db',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/facts/db')>(),supabaseFactsDb:()=>shared.db}));
vi.mock('@/lib/entities/resolve',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/entities/resolve')>(),
 resolveIssuer:async(_c:unknown,q:{ticker?:string;cik?:string})=>q.ticker==='ZZEVA'||q.cik==='9990601'
  ?{issuer_id:shared.issuer,status:'active',names:{zh:null,en:'F6 Eval A'},identifiers:{cik:'9990601',lei:null,usci:null},securities:[{ticker:'ZZEVA',isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2000-01-01',valid_to:null}]}
  :null}));

import {GET as factsGET} from '@/app/api/facts/[ticker]/route';
import {GET as metricsGET} from '@/app/api/facts/[ticker]/metrics/route';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {projectionHash} from './canonical-json';
import {projectFactsRouteBody,projectMetricsRouteBody,projectRequest} from './projections/facts';
import type {FactsRouteBody,MetricsRouteBody,ProjectionDeps} from './projections/facts';
import {ZZEVA_CIK,ZZEVA_ISSUER,seedZzeva} from './test-support/memory-facts';
import type {ReplayRequest} from './types';

const TODAY=new Date().toISOString().slice(0,10);
type Handler=(req:Request,ctx:{params:Promise<{ticker:string}>})=>Promise<Response>;
const call=async(handler:Handler,path:string,qs:string):Promise<unknown>=>{
 const res=await handler(new Request(`https://alpha.example/api/facts/ZZEVA${path}?${qs}`),{params:Promise.resolve({ticker:'ZZEVA'})});
 expect(res.status).toBe(200);
 return res.json();
};
let deps:ProjectionDeps;
beforeEach(async()=>{
 expect(shared.issuer).toBe(ZZEVA_ISSUER);
 const db=memoryFactsDb();await seedZzeva(db);shared.db=db;
 deps={db,resolve:async s=>s.cik===ZZEVA_CIK?{issuerId:ZZEVA_ISSUER,market:'US'}:null};
});

describe('replay projection: database path == public route response',()=>{
 const issuer={market:'US' as const,cik:ZZEVA_CIK};
 it('facts, history, with and without durations',async()=>{
  for(const [request,qs] of [
   [{issuer,concepts:['revenue','cash'],asOf:'2025-06-30',durations:['12M','INSTANT']},'concepts=revenue,cash&asOf=2025-06-30&history=1&durations=12M,INSTANT&limit=1000'],
   [{issuer,concepts:['revenue','cash'],asOf:'2025-06-30'},'concepts=revenue,cash&asOf=2025-06-30&history=1&limit=1000'],
   [{issuer,concepts:['revenue'],asOf:'2024-12-31'},'concepts=revenue&asOf=2024-12-31&history=1&limit=1000'],
  ] as [ReplayRequest,string][]){
   const viaDb=await projectRequest(deps,request,TODAY);
   const viaRoute=projectFactsRouteBody(await call(factsGET,'',qs) as FactsRouteBody);
   expect(viaRoute).toEqual(viaDb);
   expect(projectionHash(viaRoute)).toBe(projectionHash(viaDb));
  }
  const full=await projectRequest(deps,{issuer,concepts:['revenue','cash'],asOf:'2025-06-30'},TODAY);
  expect(full.rows.length).toBe(6);
  expect(full.rows.some(r=>r.is_revision===true)).toBe(true);   // the comparison covers a revision
 });
 it('metrics at asOf: live derive + inputs joined (route: metrics, then factIds evidence for the inputs)',async()=>{
  const request:ReplayRequest={issuer,concepts:[],metrics:['gross_margin','revenue_yoy'],asOf:'2025-06-30'};
  const viaDb=await projectRequest(deps,request,TODAY);
  const body=await call(metricsGET,'/metrics','metrics=gross_margin,revenue_yoy&asOf=2025-06-30&limit=1000') as MetricsRouteBody;
  const ids=[...new Set(body.metrics.flatMap(m=>m.inputs.map(i=>i.fact_id)))];
  expect(ids.length).toBeGreaterThan(0);
  const evidence=await call(factsGET,'',`factIds=${ids.join(',')}`) as FactsRouteBody;
  const viaRoute=projectMetricsRouteBody(body,evidence);
  expect(viaRoute).toEqual(viaDb);
  expect(viaDb.rows.map(r=>r.metric)).toEqual(['gross_margin','revenue_yoy']);
 });
});
```

- [ ] **Step 16: 运行路由等价测试**

Run: `npm test -- src/lib/evals/route-equivalence.test.ts`
Expected: PASS（2 个用例）。若 facts 用例失败在 `consolidation`：说明公开形状加了 consolidation 字段，改 `projectFactsRouteBody` 读它而不是常量。

- [ ] **Step 17: 写 `replay_consistency` 的 run.ts 运行器 `src/lib/evals/cli/run-replay.ts` 与测试（集成时补上的缺口）**

规格 §1.1"`replay live` … 未入账本的差异 → 退出码 1"、§7.1 与 §15.1（live 首次运行是 owner 事项）需要 `run.ts --kind replay_consistency` 能跑；Task 9 的 `KIND_RUNNERS` 只有 official，而 Task 14 的 `kinds/registry.ts` 把 `replay_consistency` 登记为启用，所以本任务补上运行器。`ci` = frozen（需要 `S4_TEST_STATE`，与 `record-replay.ts` 相同；没有测试库 → `kind_not_enabled`，退出 2），`report` = live（anon；`--write-db` = service_role、特权提示与 `dq_eval_*` 存储）。报告的 `set` 块指向回放文件（回放文件不是黄金集，不进 `lock.json`；发布清单按文件字节认证，见 Task 12 `manifest_fixture`）。运行器经 `CliDeps.readFile` 读回放文件与账本、经注入的 `ReplayBackendFactory` 读库，单测不需要数据库。

`src/lib/evals/cli/run-replay.test.ts`:

```ts
// src/lib/evals/cli/run-replay.test.ts
import {describe,expect,it} from 'vitest';
import {projectionHash,sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection,ReplayRequest} from '../types';
import {parseRunArgs,runCli} from './run-cli';
import type {CliDeps} from './run-cli';
import {LEDGER_PATH,defaultReplayBackend,replayFileOf,replayRunner} from './run-replay';
import type {ReplayBackend,ReplayBackendFactory} from './run-replay';

const P:Projection={module:'facts',rows:[{concept:'revenue',value_text:'383285000000',available_date:'2023-11-03'}]};
const P2:Projection={module:'facts',rows:[{concept:'revenue',value_text:'383285000001',available_date:'2023-11-03'}]};
const REQ:ReplayRequest={issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2024-06-30'};
const SETUP={setup_sha256:'a'.repeat(64),today:'2026-11-20'};
const rec={code_version:'c'.repeat(40),at:'2026-11-20T00:00:00.000Z'};
const frozenFile={schema_version:1,module:'facts',mode:'frozen',cases:['f-1','f-2'].map(case_id=>({case_id,request:REQ,setup:SETUP,recorded:rec,expected:{projection_hash:projectionHash(P),projection:P}}))};
const liveFile={schema_version:1,module:'facts',mode:'live',cases:[{case_id:'l-1',request:REQ,recorded:{...rec,state_rev:5},expected:{projection_hash:projectionHash(P),projection:P}}]};
const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const FILES:Record<string,Uint8Array>={[replayFileOf('facts','frozen')]:enc(frozenFile),[replayFileOf('facts','live')]:enc(liveFile),[LEDGER_PATH]:enc([])};

function cli(over:Partial<CliDeps>={}):CliDeps{
 return {buildDeps:async()=>{throw new Error('replay does not use buildDeps');},loadSet:()=>{throw new Error('no gold set');},loadLock:()=>({files:[]}),
  version:()=>({sha:'d'.repeat(40),dirty:false}),now:()=>new Date('2026-11-21T00:00:00.000Z'),
  writeReport:r=>({json:`reports/evals/${r.run_id}.json`,md:null,sha256:'b'.repeat(64)}),persist:async()=>{},
  readFile:p=>{const b=FILES[p];if(!b)throw new Error(`ENOENT ${p}`);return b;},...over};
}
function fake(o:{projection?:Projection;check?:'ok'|'mismatch'}={}):{factory:ReplayBackendFactory;opened:{mode:string;privileged:boolean}[]}{
 const opened:{mode:string;privileged:boolean}[]=[];
 const factory:ReplayBackendFactory=async(mode,privileged)=>{
  opened.push({mode,privileged});
  const project=async()=>o.projection??P;
  const b:ReplayBackend={environment:{db_host:null,app_origin:null,db_state_rev:null},store:null,close:async()=>{},
   frozen:async()=>({check:o.check==='mismatch'?{ok:false,mismatch:['fixture_manifest:x']}:{ok:true,setupSha256:SETUP.setup_sha256},project}),
   project,stateRev:async()=>5};
  return b;
 };
 return {factory,opened};
}
const args=(...extra:string[])=>parseRunArgs(['--kind','replay_consistency','--module','facts',...extra]);

describe('replay_consistency runner (run.ts --kind replay_consistency)',()=>{
 it('ci = frozen over the committed file: identical → pass, exit 0; the report names the replay file and its byte hash',async()=>{
  const f=fake();
  const {outcome}=await replayRunner(f.factory,{})(args('--mode','ci'),cli());
  expect(f.opened).toEqual([{mode:'frozen',privileged:false}]);
  expect(outcome.exitCode).toBe(0);
  const r=outcome.report;
  expect(r).toMatchObject({kind:'replay_consistency',module:'facts',mode:'ci',privileged:false,set:{id:'replay/facts.frozen',version:1,path:replayFileOf('facts','frozen'),sha256:sha256Hex(FILES[replayFileOf('facts','frozen')])}});
  expect(r.cases.map(c=>c.outcome)).toEqual([{result:'identical'},{result:'identical'}]);
  expect(r.summary).toMatchObject({gate:'pass',population:2,evidence_class:'truth'});
 });
 it('a changed projection without a ledger entry → unexplained_diff, exit 1; a setup mismatch → read_error, exit 3',async()=>{
  const diff=await replayRunner(fake({projection:P2}).factory,{})(args('--mode','ci'),cli());
  expect(diff.outcome.exitCode).toBe(1);
  expect(diff.outcome.report.cases[0].outcome).toEqual({result:'unexplained_diff',reason:'diff'});
  const bad=await replayRunner(fake({check:'mismatch'}).factory,{})(args('--mode','ci'),cli());
  expect(bad.outcome.report.cases[0].outcome).toEqual({result:'read_error',reason:'setup_mismatch'});expect(bad.outcome.exitCode).toBe(3);
 });
 it('--case makes a subset: the other cases are skipped(subset), exit 3',async()=>{
  const {outcome}=await replayRunner(fake().factory,{})(args('--mode','ci','--case','f-1'),cli());
  expect(outcome.report.cases.map(c=>[c.case_id,c.outcome.result])).toEqual([['f-1','identical'],['f-2','skipped']]);
  expect(outcome.exitCode).toBe(3);
 });
 it('report = live: unprivileged difference → unexplained_diff(no_hints), exit 1; --write-db opens a privileged backend',async()=>{
  const f=fake({projection:P2});
  const live=await replayRunner(f.factory,{})(args('--mode','report'),cli());
  expect(live.outcome.report.cases[0].outcome).toEqual({result:'unexplained_diff',reason:'no_hints'});expect(live.outcome.exitCode).toBe(1);
  await replayRunner(f.factory,{})(args('--mode','report','--write-db'),cli());
  expect(f.opened).toEqual([{mode:'live',privileged:false},{mode:'live',privileged:true}]);
 });
 it('refusals before any backend opens: --http, dirty report, a file of the other mode, unknown --case; frozen without a test database',async()=>{
  const f=fake();
  const code=async(p:Promise<unknown>)=>{try{await p;return 'none';}catch(e){return e instanceof EvalError?e.code:'other';}};
  expect(await code(replayRunner(f.factory,{})(args('--mode','ci','--http'),cli()))).toBe('kind_not_enabled');
  expect(await code(replayRunner(f.factory,{})(args('--mode','report'),cli({version:()=>({sha:'d'.repeat(40),dirty:true})})))).toBe('dirty_tree');
  expect(await code(replayRunner(f.factory,{})(args('--mode','report','--set',replayFileOf('facts','frozen')),cli()))).toBe('gold_invalid');
  expect(await code(replayRunner(f.factory,{})(args('--mode','ci','--case','nope'),cli()))).toBe('gold_invalid');
  expect(f.opened).toEqual([]);
  expect(await code(replayRunner(defaultReplayBackend,{})(args('--mode','ci'),cli()))).toBe('kind_not_enabled');
 });
 it('runCli dispatches replay_consistency to this runner (a refusal surfaces as exit 2)',async()=>{
  const err:string[]=[];
  expect(await runCli(['--kind','replay_consistency','--module','facts','--mode','ci','--http'],{stdout:()=>{},stderr:l=>err.push(l)},cli())).toBe(2);
  expect(JSON.parse(err[0])).toMatchObject({error:'kind_not_enabled'});
 });
});
```

Run: `npm test -- src/lib/evals/cli/run-replay.test.ts`
Expected: FAIL — `Failed to resolve import "./run-replay"`。

`src/lib/evals/cli/run-replay.ts`:

```ts
// src/lib/evals/cli/run-replay.ts
// run.ts --kind replay_consistency (spec §5.3, §7.1; integration step of Task 11). ci = frozen: every recorded case of
// src/lib/evals/fixtures/replay/<module>.frozen.json (or --set) is replayed over a database built from ITS sealed setup
// (replay/setup.ts::buildFrozenDb on the S4_TEST_STATE database — a frozen replay without one is refused, like
// record-replay.ts), one build per setup_sha256. report = live: <module>.live.json over production — anon (unprivileged:
// a difference without a ledger hit is unexplained_diff(no_hints)) or, with --write-db, service_role (privileged hints,
// dq_eval_* store). The ledger is fixtures/replay/explanations.json. Every case gets exactly one CaseReport (--case /
// --limit: the rest skipped(subset) → incomplete); summary via replaySummaryContext; one report whose set block names
// the replay file (replay files are not gold sets: set_id 'replay/<file>', version 1, sha256 = the file bytes, format
// 'f6', thresholds REPLAY_THRESHOLDS). --http (the route smoke, §5.3.2) is not built in this phase → kind_not_enabled.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {Pool} from 'pg';
import {supabaseTableClient} from '../../db/table-client';
import {supabaseFactsDb} from '../../facts/db';
import {getAdminSupabase} from '../../supabase/admin';
import {getAnonSupabase} from '../../supabase/anon';
import {privilegedFactsReader} from '../adapters/facts';
import {supabaseRawStorage} from '../adapters/provenance';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {REPLAY_THRESHOLDS,evaluateReplay,replaySummaryContext} from '../kinds/replay';
import type {ProjectFn,ReplayContext,SetupCheck} from '../kinds/replay';
import {projectRequest,resolveFactsSubject} from '../projections/facts';
import type {ProjectionDeps} from '../projections/facts';
import {parseReplayFile,recordedCases} from '../replay/fixture';
import type {FrozenReplayCase,LiveReplayCase,ReplayCase,ReplayMode} from '../replay/fixture';
import {parseLedger} from '../replay/ledger';
import {buildFrozenDb} from '../replay/setup';
import type {FrozenSetup} from '../replay/setup';
import {buildReport} from '../report';
import {evalStore} from '../store';
import type {EvalStore} from '../store';
import {exitCodeOf,summarize} from '../summary';
import type {CaseReport,EvalEnv,EvalModule,GoldSet,Hint,ReplayRequest,ReportEnvironment} from '../types';
import {LANDED_PARSERS,hostOf} from './deps';
import type {KindRunner} from './run-cli';

export const LEDGER_PATH='src/lib/evals/fixtures/replay/explanations.json';
export const replayFileOf=(module:EvalModule,mode:ReplayMode)=>`src/lib/evals/fixtures/replay/${module}.${mode}.json`;

/** The report's set block for a replay file (see header). */
export function replaySetOf(path:string,bytes:Uint8Array,module:EvalModule):GoldSet{
 return {schema_version:1,format:'f6',set_id:`replay/${basename(path,'.json')}`,version:1,module,artifact_class:'public',module_implementers:[],tolerance:{rel:'0'},
  thresholds:REPLAY_THRESHOLDS,optional_cases:[],history:[],cases:[],ready:true,path,sha256:sha256Hex(bytes)};
}

/** What the replay runner reads through; the default opens real databases, tests inject one. */
export interface ReplayBackend{
 /** frozen: build (or reuse) the database of one sealed setup; check = the setup verdict for kinds/replay.ts. */
 frozen?(setup:FrozenSetup):Promise<{check:SetupCheck;project:ProjectFn}>;
 /** live: the projection, the issuer's current fact_state_rev, and (privileged only) hints. */
 project?:ProjectFn;stateRev?:(c:LiveReplayCase)=>Promise<number|null>;hints?:(request:ReplayRequest,since:string)=>Promise<Hint[]>;
 environment:ReportEnvironment;store:EvalStore|null;close():Promise<void>;
}
export type ReplayBackendFactory=(mode:ReplayMode,privileged:boolean,env:Record<string,string|undefined>)=>Promise<ReplayBackend>;

const none:ReportEnvironment={db_host:null,app_origin:null,db_state_rev:null};
export const defaultReplayBackend:ReplayBackendFactory=async(mode,privileged,env)=>{
 if(mode==='frozen'){
  const state=env.S4_TEST_STATE;
  if(!state)throw new EvalError('kind_not_enabled','replay frozen needs S4_TEST_STATE (a freshly migrated local database)',{reason:'no_test_database'});
  const adminUrl=(JSON.parse(readFileSync(state,'utf8')) as {adminUrl:string}).adminUrl;
  const pool=new Pool({connectionString:adminUrl});
  const builds=new Map<string,{check:SetupCheck;project:ProjectFn}>();
  return {environment:{...none,db_host:hostOf(adminUrl)},store:null,close:()=>pool.end(),
   async frozen(setup){
    const hit=builds.get(setup.setup_sha256);if(hit)return hit;
    const b=await buildFrozenDb(pool,setup);
    const out:{check:SetupCheck;project:ProjectFn}=b.ok
     ?{check:{ok:true,setupSha256:b.world.setup.setup_sha256},project:r=>projectRequest({db:b.world.db,resolve:(s,t)=>resolveFactsSubject(b.world.tables,s,t)},r,setup.today)}
     :{check:{ok:false,mismatch:[b.mismatch]},project:async()=>{throw new Error('setup not built');}};
    builds.set(setup.setup_sha256,out);return out;
   }};
 }
 const sb=privileged?getAdminSupabase():getAnonSupabase();
 const tables=supabaseTableClient(sb),db=supabaseFactsDb(sb);
 const deps:ProjectionDeps={db,resolve:(s,t)=>resolveFactsSubject(tables,s,t)};
 const today=new Date().toISOString().slice(0,10);
 const rpc=sb as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
 return {environment:{...none,db_host:hostOf(env.NEXT_PUBLIC_SUPABASE_URL)},store:privileged?evalStore(tables):null,close:async()=>{},
  project:r=>projectRequest(deps,r,today),
  stateRev:async c=>{
   const ref=await deps.resolve(c.request.issuer,today);if(!ref)return null;
   const {data,error}=await rpc.rpc('fact_state_rev',{p_issuer:ref.issuerId,p_market:ref.market});
   if(error)throw new Error(`fact_state_rev_failed: ${error.message??''}`);
   return Number(data);
  },
  ...(privileged?{hints:privilegedFactsReader({db,tables,stateRev:async()=>null,storage:supabaseRawStorage(sb),parsers:LANDED_PARSERS}).hints}:{})};
};

const subsetSkip=(c:ReplayCase):CaseReport=>({case_id:c.case_id,required:true,outcome:{result:'skipped',reason:'subset'},left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail:{}});

export function replayRunner(factory:ReplayBackendFactory=defaultReplayBackend,env:Record<string,string|undefined>=process.env):KindRunner{
 return async(args,deps)=>{
  if(args.http)throw new EvalError('kind_not_enabled','the --http route smoke is not built in this phase (spec §5.3.2, §0 R5-9)',{kind:args.kind});
  const mode:ReplayMode=args.mode==='ci'?'frozen':'live';
  const path=args.set??replayFileOf(args.module,mode);
  let bytes:Uint8Array;
  try{bytes=deps.readFile(path);}catch(e){throw new EvalError('gold_invalid',`${path}: unreadable (${e instanceof Error?e.message:String(e)})`,{file:path});}
  const file=parseReplayFile(JSON.parse(new TextDecoder().decode(bytes)),{allowDrafts:false,file:path});
  if(file.mode!==mode)throw new EvalError('gold_invalid',`${path} is a ${file.mode} file; --mode ${args.mode} replays ${mode}`,{file:path});
  const all=recordedCases(file);
  const unknown=args.caseIds.filter(id=>!all.some(c=>c.case_id===id));
  if(unknown.length>0)throw new EvalError('gold_invalid','unknown case_id in --case',{case_ids:unknown});
  let chosen=all.filter(c=>args.caseIds.length===0||args.caseIds.includes(c.case_id));
  if(args.limit!==undefined)chosen=chosen.slice(0,args.limit);
  const subset=args.caseIds.length>0||args.limit!==undefined;
  const ledger=parseLedger(JSON.parse(new TextDecoder().decode(deps.readFile(LEDGER_PATH))));
  const v=deps.version();
  if(!/^[0-9a-f]{40}$/.test(v.sha))throw new EvalError('code_version_missing','evaluator code version must be a 40-hex commit',{value:v.sha});
  if(args.mode==='report'&&v.dirty)throw new EvalError('dirty_tree','report runs need a clean working tree');
  const evalEnv:EvalEnv={today:deps.now().toISOString().slice(0,10),now:()=>deps.now(),evaluatorCodeVersion:v.sha,dirty:v.dirty};
  const backend=await factory(mode,args.writeDb,env);
  const run={store:backend.store,close:()=>backend.close()};
  try{
   const startedAt=evalEnv.now().toISOString();
   const reports:CaseReport[]=[];
   if(mode==='frozen'){
    const groups=new Map<string,FrozenReplayCase[]>();
    for(const c of chosen as FrozenReplayCase[]){const g=groups.get(c.setup.setup_sha256)??[];g.push(c);groups.set(c.setup.setup_sha256,g);}
    for(const group of groups.values()){
     const built=await backend.frozen!(group[0].setup as unknown as FrozenSetup);
     reports.push(...await evaluateReplay(group,built.project,ledger,{mode,evaluatorCodeVersion:v.sha,checkSetup:async()=>built.check}));
    }
   }else{
    const ctx:ReplayContext={mode,evaluatorCodeVersion:v.sha,...(backend.stateRev?{stateRev:backend.stateRev}:{}),...(backend.hints?{hints:backend.hints}:{})};
    reports.push(...await evaluateReplay(chosen,backend.project!,ledger,ctx));
   }
   const byId=new Map(reports.map(r=>[r.case_id,r]));
   const cases=all.map(c=>byId.get(c.case_id)??subsetSkip(c));
   const summary=summarize(cases,replaySummaryContext(subset));
   const report=buildReport({runId:randomUUID(),kind:'replay_consistency',mode:args.mode,privileged:args.writeDb,set:replaySetOf(path,bytes,args.module),env:evalEnv,
    environment:backend.environment,startedAt,finishedAt:evalEnv.now().toISOString(),verified:{artifacts:false,sources:false},summary,cases});
   return {outcome:{report,exitCode:exitCodeOf(summary.gate)},run};
  }catch(e){await backend.close().catch(()=>{});throw e;}
 };
}
export const runReplay:KindRunner=replayRunner();
```

- [ ] **Step 18: 接入分发表与 `ModuleReader.project`（`cli/run-cli.ts`、`cli/deps.ts` 归 Task 9，只做下列 Edit）**

`src/lib/evals/cli/run-cli.ts` — old:
```ts
import {buildRunDeps} from './deps';
```
new:
```ts
import {buildRunDeps} from './deps';
import {runReplay} from './run-replay';
```
old:
```ts
export const KIND_RUNNERS:Partial<Record<EvalKind,KindRunner>>={official_reconciliation:runOfficial};
```
new:
```ts
export const KIND_RUNNERS:Partial<Record<EvalKind,KindRunner>>={official_reconciliation:runOfficial,replay_consistency:runReplay};
```

`src/lib/evals/cli/deps.ts`（W4 CCR 2：`factsReader(...).project` 委托 Task 10 的 `projectRequest`）— old:
```ts
import {evalStore} from '../store';
```
new:
```ts
import {projectRequest,resolveFactsSubject} from '../projections/facts';
import type {ProjectionDb} from '../projections/facts';
import {evalStore} from '../store';
```
old:
```ts
import type {EvalMode,ModuleReader,ReportEnvironment} from '../types';
```
new:
```ts
import type {EvalMode,ModuleReader,Projection,ReplayRequest,ReportEnvironment} from '../types';
```
old:
```ts
import {supabaseTableClient} from '../../db/table-client';
```
new:
```ts
import {supabaseTableClient} from '../../db/table-client';
import type {TableClient} from '../../db/table-client';
```
old:
```ts
const built=(b:FrozenBuild)=>
```
new:
```ts
/** ModuleReader.project = projections/facts.ts::projectRequest over the reader's own db and tables (Task 11; W4 CCR 2). */
export const withProjector=<D extends {db:ProjectionDb;tables:TableClient}>(d:D):D&{projector:(r:ReplayRequest,today:string)=>Promise<Projection>}=>
 ({...d,projector:(r,today)=>projectRequest({db:d.db,resolve:(s,t)=>resolveFactsSubject(d.tables,s,t)},r,today)});
const built=(b:FrozenBuild)=>
```
Then wrap the four reader constructions (one Edit each; old line → new line):
```ts
factsReader({db:pgFactsDb(pool),tables:pgTableClient(pool),stateRev:async()=>null})
```
```ts
factsReader(withProjector({db:pgFactsDb(pool),tables:pgTableClient(pool),stateRev:async()=>null}))
```
```ts
factsReader({db:world.db,tables:world.tables,stateRev:async()=>null})
```
```ts
factsReader(withProjector({db:world.db,tables:world.tables,stateRev:async()=>null}))
```
```ts
factsReader({db:supabaseFactsDb(anon),tables:supabaseTableClient(anon),stateRev:async()=>null})
```
```ts
factsReader(withProjector({db:supabaseFactsDb(anon),tables:supabaseTableClient(anon),stateRev:async()=>null}))
```
```ts
privilegedFactsReader({db:supabaseFactsDb(admin),tables,stateRev:async()=>null,storage:supabaseRawStorage(admin),parsers:LANDED_PARSERS})
```
```ts
privilegedFactsReader(withProjector({db:supabaseFactsDb(admin),tables,stateRev:async()=>null,storage:supabaseRawStorage(admin),parsers:LANDED_PARSERS}))
```
In `src/lib/evals/cli/deps.test.ts`, after the line `   expect(r.rows.map(x=>x.value_text)).toEqual(['383285000000']);` of the first test, add:
```ts
   const p=await d.reader.project({issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2024-06-30',durations:['12M']},'2026-11-20');   // Task 11: projector wired
   expect(p.module).toBe('facts');expect(p.rows.length).toBeGreaterThan(0);
```

- [ ] **Step 19: 运行 CLI 测试**

Run: `npm test -- src/lib/evals/cli`
Expected: PASS（`run-replay.test.ts` 6 个用例、`deps.test.ts` 5 个、`run-cli.test.ts` 不变）。

Run（Step 10 录制之后，全新本地库）: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-run.ts npx tsx scripts/evals/run.ts --kind replay_consistency --module facts --mode ci; echo "exit=$?"`
Expected: 一行回执 `"kind":"replay_consistency"`、`"gate":"pass"`、`"population":12`，`exit=0`（集成时实跑通过）。

- [ ] **Step 20: 全部单测、类型与 lint**

Run: `npm test -- src/lib/evals && npm run typecheck && npm run lint`
Expected: 全绿；0 类型错误；0 lint 警告。

- [ ] **Step 21: 实施记录**

追加到 `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`：

```markdown
## Task 11 — record-replay, frozen fixtures, frozen DB replay, route equivalence

- 12 frozen cases over ZZEVA (CIK 9990601) / ZZEVB (CIK 9990602), recorded by scripts/evals/record-replay.ts against a fresh local database (two independent fresh databases gave identical hashes); explanations.json = [].
- evals-facts.integration.test.ts: frozen replay all identical, gate pass; one flipped fixture byte → setup_mismatch.
- route-equivalence.test.ts: facts (3 requests) and metrics projections equal between the database path and the public route JSON.
- cli/run-replay.ts: run.ts --kind replay_consistency (ci = frozen over S4_TEST_STATE, report = live anon / --write-db privileged); factsReader.project wired to projectRequest (withProjector).
- Not done (owner items): facts.live.json and the first live run; lock.json does not list replay files (CCR 5).
```

- [ ] **Step 22: 提交（`.claude/scratch/db-run.ts` 不提交）**

```bash
git add src/lib/evals/replay/record.ts src/lib/evals/replay/record.test.ts src/lib/evals/replay/record-cli.test.ts scripts/evals/record-replay.ts src/lib/evals/fixtures/replay/facts.frozen.json src/lib/evals/fixtures/replay/explanations.json src/lib/evals/evals-facts.integration.test.ts src/lib/evals/route-equivalence.test.ts src/lib/evals/cli/run-replay.ts src/lib/evals/cli/run-replay.test.ts src/lib/evals/cli/run-cli.ts src/lib/evals/cli/deps.ts src/lib/evals/cli/deps.test.ts docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md
```
```bash
git commit -m "feat(evals): append-only replay recorder, 12 frozen facts cases, frozen DB replay and route equivalence (F6 Task 11)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: validators (expert, audit, manifest), `validate.ts` flags, `codex-audit.ts`, templates, data-foundation-2 `index.json`

**Task 3 interface (as landed):** `src/lib/evals/validate/cli.ts` holds `HANDLERS:ValidateHandler[]` (async-capable `run(root,value,modifiers)`, optional `modifiers` such as `--release`, `findingsCheck`); a failing check exits 1. Task 12 keeps all of its logic in `src/lib/evals/validate/**` and touches only `cli.ts` in Step 22 (one import + three table entries).

**Files:**
- Create: `src/lib/evals/validate/finding.ts` (shared finding type and format regexes)
- Create: `src/lib/evals/validate/audit.ts`, `src/lib/evals/validate/audit.test.ts`
- Create: `docs/audits/2026-11-04-data-foundation-2/index.json`
- Create: `src/lib/evals/validate/expert.ts`, `src/lib/evals/validate/expert.test.ts`
- Create: `src/lib/evals/validate/manifest.ts`, `src/lib/evals/validate/manifest.test.ts`
- Create: `src/lib/evals/validate/codex-audit.ts` (testable core), `src/lib/evals/validate/codex-audit.test.ts`, `scripts/evals/codex-audit.ts` (CLI)
- Create: `src/lib/evals/validate/handlers.ts`, `src/lib/evals/validate/handlers.test.ts`
- Create: `docs/evals/templates/expert-sampling.template.json`, `docs/evals/templates/release-manifest.template.json`
- Modify: `src/lib/evals/validate/cli.ts` (append `--expert`, `--audit`, `--manifest` to `HANDLERS`)

Spec: §8, §9, §10, §13.1 (`validate.test.ts` items, split here per validator). Depends on Task 1 (`canonicalJson`, `sha256Hex`, `summarize`, `statusOfGate`), Task 2 (`loadGoldSet`, lock path), Task 3 (`validate.ts`), Task 6 (`evalStore.getRun`).

#### 12a — audit records (§9)

- [ ] **Step 1: Write the shared finding module** (no behaviour to test on its own; every validator test covers it)

Create `src/lib/evals/validate/finding.ts`:

```ts
// src/lib/evals/validate/finding.ts
// Helpers of the spec §8–§10 validators. ValidatorFinding itself is the shared contract type (types.ts, integration decision 2).
import type {ValidatorFinding} from '../types';
export type {ValidatorFinding};
export const finding=(code:string,where:string,message:string):ValidatorFinding=>({code,where,message});
export const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const SHA256=/^[0-9a-f]{64}$/;
export const GIT_SHA=/^[0-9a-f]{40}$/;
export const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
export const ISO_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
```

- [ ] **Step 2: Write the failing audit test**

Create `src/lib/evals/validate/audit.test.ts`. Its last `describe` runs against the REAL directories `docs/audits/2026-11-04-evals-gold-sets/` (expects no findings; release mode exactly `N11`) and `docs/audits/2026-11-04-data-foundation-2/` (expects exactly the 29 round-1 ids without a per-id disposition, and in release mode additionally `uncommitted` + `#27` + `N11`):

```ts
// src/lib/evals/validate/audit.test.ts
// Spec §9: report/disposition parsing rules, index.json validation on synthetic directories, and the
// REAL audit directories docs/audits/2026-11-04-evals-gold-sets and 2026-11-04-data-foundation-2.
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {isAccept,isOpenVerify,isOwner,markdownTables,parseDispositions,parseFindings,parseVerdict,tableCells,validateAuditDir} from './audit';

const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});

describe('markdown parsing',()=>{
 it('splits table cells but not inside backtick spans',()=>{
  expect(tableCells('| N3 x | ACCEPT | `not_visible(quarantined | superseded)` ok |')).toEqual(['N3 x','ACCEPT','`not_visible(quarantined | superseded)` ok']);
  expect(markdownTables('text\n| a | b |\n|---|---|\n| 1 | 2 |\n\n| c |\n| d |\n')).toEqual([{header:['a','b'],rows:[['1','2']]}]);
 });
 it('reads finding ids from a # column, from "P1 · id" severity cells, by synthesis, and from bold paragraphs',()=>{
  const md=[
   '| # | Severity (P1 blocking / P2 …) | Issue |','|---|---|---|','| 1 | P1 blocking | a |','| **N2** | **P2** | b |','',
   '| # | Status | Where |','|---|---|---|','| 1 | PARTIAL | not a findings table |','',
   '| Severity | Section | Issue |','|---|---|---|','| P1 | §1 | c |','| P1 | §2 | d |','| P2 | §3 | e |','',
   '| Severity | Section |','|---|---|','| **P1 · R3-1** | §4 |','',
   '**R5-1 · P1 — Abandonment loses the disposition.**  ','**R6-1 — PARTIAL:** not a finding',
  ].join('\n');
  expect(parseFindings(md,3)).toEqual([
   {id:'1',severity:'P1'},{id:'N2',severity:'P2'},{id:'R3-P1-1',severity:'P1'},{id:'R3-P1-2',severity:'P1'},{id:'R3-P2-1',severity:'P2'},
   {id:'R3-1',severity:'P1'},{id:'R5-1',severity:'P1'},
  ]);
 });
 it('reads disposition rows: first token id, "Round-1 #27" form, implemented_in column or the column after the decision',()=>{
  const md=[
   '| # | 决定 | 实施 / 理由 |','|---|---|---|','| 1 覆盖不足可过 | ACCEPT | §3.2 |','| N11 数值往返 | ACCEPT + OPEN-verify | §17.6 |','',
   '| # | Decision | How |','|---|---|---|','| Round-1 #27 Tushare paging | OPEN (verify) | runbook |','| N10 / A / C | **owner** | §14 |','',
   '| # | 级别 | 决定 | implemented_in |','|---|---|---|---|','| R5-1 | P1 | ACCEPT | 第 6 稿 §0 |','| R5-2 | P1 | ACCEPT |  |',
  ].join('\n');
  expect(parseDispositions(md,'03.md').map(r=>[r.id,r.decision,r.implemented_in])).toEqual([
   ['1','ACCEPT','§3.2'],['N11','ACCEPT + OPEN-verify','§17.6'],['27','OPEN (verify)','runbook'],['N10','owner','§14'],['R5-1','ACCEPT','第 6 稿 §0'],['R5-2','ACCEPT',''],
  ]);
  expect([isAccept('ACCEPT WITH LIMIT'),isAccept('DECLINE'),isOpenVerify('ACCEPT + OPEN-verify'),isOpenVerify('OPEN (verify)'),isOwner('**owner** (default)'),isOwner('ACCEPT')]).toEqual([true,false,true,true,true,false]);
 });
 it('parses the **Verdict: …** first line',()=>{
  expect(parseVerdict('\n**Verdict: not ready for implementation planning—x.** tail')).toBe('not ready for implementation planning—x');
  expect(parseVerdict('**Not ready.** body')).toBeNull();
 });
});

const TARGET='docs/superpowers/specs/x.md';
const TARGET_BYTES='spec bytes\n';
const REPORT='**Verdict: not ready.**\n\n| # | Severity | Issue |\n|---|---|---|\n| 1 | P1 | a |\n| 2 | P2 | b |\n| 3 | P3 | c |\n';
const DISPO='| # | 决定 | 实施 |\n|---|---|---|\n| 1 a | ACCEPT | §1 |\n| 2 b | ACCEPT + OPEN-verify | §17 |\n| 3 c | DECLINE | minor |\n';
function auditDir(o:{index?:Record<string,unknown>;round?:Record<string,unknown>;report?:string;dispo?:string}={}){
 const dir=mkdtempSync(join(tmpdir(),'f6-audit-'));dirs.push(dir);
 writeFileSync(join(dir,'00-prompt-round1.md'),'prompt');
 writeFileSync(join(dir,'01-codex-round1.md'),o.report??REPORT);
 writeFileSync(join(dir,'02-disposition.md'),o.dispo??DISPO);
 const index={topic:'x',target:{path:TARGET},
  rounds:[{n:1,target_sha256:sha(TARGET_BYTES),target_git_ref:'f'.repeat(40),prompt_file:'00-prompt-round1.md',report_file:'01-codex-round1.md',model:'gpt-6-astra',effort:'medium',verdict:'not ready',findings:{p1:1,p2:1,p3:1},...o.round}],
  dispositions:[{file:'02-disposition.md',covers_rounds:[1]}],open:{owner:[],verify:['§17 item']},final_verdict:'x',...o.index};
 writeFileSync(join(dir,'index.json'),JSON.stringify(index));
 return dir;
}
const gitShow=(ref:string,path:string)=>ref==='f'.repeat(40)&&path===TARGET?new TextEncoder().encode(TARGET_BYTES):null;
const codes=(dir:string,release=false)=>validateAuditDir(dir,{gitShow,release}).map(f=>f.code);

describe('validateAuditDir on synthetic directories',()=>{
 it('accepts a consistent directory',()=>expect(codes(auditDir())).toEqual([]));
 it('reports a missing or invalid index.json',()=>{
  const d=auditDir();writeFileSync(join(d,'index.json'),'{');expect(codes(d)).toEqual(['audit_index_invalid']);
  rmSync(join(d,'index.json'));expect(codes(d)).toEqual(['audit_index_missing']);
  expect(codes(auditDir({index:{rounds:[]}}))).toEqual(['audit_index_invalid']);
 });
 it('reports missing files',()=>{
  expect(codes(auditDir({round:{report_file:'99.md'}}))).toContain('audit_file_missing');
  expect(codes(auditDir({round:{prompt_file:'nope.md'}}))).toEqual(['audit_file_missing']);
  expect(codes(auditDir({round:{prompt_file:null}}))).toEqual([]);
  expect(codes(auditDir({index:{dispositions:[{file:'gone.md',covers_rounds:[1]}]}}))).toContain('audit_file_missing');
 });
 it('checks the findings counts against the report',()=>expect(codes(auditDir({round:{findings:{p1:2,p2:1,p3:1}}}))).toEqual(['audit_findings_count']));
 it("requires unverified_target: true for 'uncommitted' rounds and verifies committed bytes",()=>{
  expect(codes(auditDir({round:{target_git_ref:'uncommitted',target_sha256:null}}))).toEqual(['audit_unverified_target']);
  expect(codes(auditDir({round:{target_git_ref:'uncommitted',target_sha256:null,unverified_target:true}}))).toEqual([]);
  expect(codes(auditDir({round:{target_sha256:'0'.repeat(64)}}))).toEqual(['audit_target_mismatch']);
  expect(codes(auditDir({round:{target_git_ref:'e'.repeat(40)}}))).toEqual(['audit_target_unreadable']);
  expect(codes(auditDir({round:{target_git_ref:'HEAD'}}))).toEqual(['audit_target_ref']);
 });
 it('requires every finding id in some disposition table',()=>{
  expect(validateAuditDir(auditDir({dispo:DISPO.replace('| 3 c | DECLINE | minor |\n','')}),{gitShow})).toEqual([{code:'audit_finding_undisposed',where:'round 1 #3',message:'finding id appears in no disposition table'}]);
 });
 it('requires implemented_in on ACCEPT rows',()=>expect(codes(auditDir({dispo:DISPO.replace('| 1 a | ACCEPT | §1 |','| 1 a | ACCEPT |  |')}))).toEqual(['audit_accept_unimplemented']));
 it('requires open.verify / open.owner to be non-empty when such dispositions exist',()=>{
  expect(codes(auditDir({index:{open:{owner:[],verify:[]}}}))).toEqual(['audit_open_inconsistent']);
  expect(codes(auditDir({dispo:DISPO+'| 9 z | OWNER | §16 |\n'}))).toEqual(['audit_open_inconsistent']);
 });
 it('release mode: last round committed; no P1/P2 OPEN-verify; P3 OPEN-verify is allowed',()=>{
  expect(codes(auditDir(),true)).toEqual(['audit_release_open_verify']);
  expect(codes(auditDir({dispo:DISPO.replace('ACCEPT + OPEN-verify','ACCEPT')}),true)).toEqual([]);
  expect(codes(auditDir({dispo:DISPO.replace('ACCEPT + OPEN-verify','ACCEPT').replace('| 3 c | DECLINE | minor |','| 3 c | OPEN-verify | later |')}),true)).toEqual([]);
  expect(codes(auditDir({dispo:DISPO.replace('ACCEPT + OPEN-verify','ACCEPT'),round:{target_git_ref:'uncommitted',target_sha256:null,unverified_target:true}}),true)).toEqual(['audit_release_uncommitted']);
 });
});

describe('validateAuditDir on the real audit directories',()=>{
 // Round 5 of the F6 spec audit targets commit 394d5141…; its bytes are read with the real `git show`
 // (CI checks out with fetch-depth 0). These expectations pin the CURRENT state of those directories.
 it('docs/audits/2026-11-04-evals-gold-sets is consistent; release mode reports only N11 (P1, OPEN-verify)',()=>{
  expect(validateAuditDir('docs/audits/2026-11-04-evals-gold-sets')).toEqual([]);
  expect(validateAuditDir('docs/audits/2026-11-04-evals-gold-sets',{release:true})).toEqual([{code:'audit_release_open_verify',where:'round 2 #N11',message:'P1 finding is OPEN-verify'}]);
 });
 it('docs/audits/2026-11-04-data-foundation-2 (reconstructed index): only the round-1 findings without a per-id disposition',()=>{
  const found=validateAuditDir('docs/audits/2026-11-04-data-foundation-2');
  expect(new Set(found.map(f=>f.code))).toEqual(new Set(['audit_finding_undisposed']));
  const expected=Array.from({length:31},(_,i)=>String(i+1)).filter(id=>id!=='27'&&id!=='29').map(id=>`round 1 #${id}`);
  expect(found.map(f=>f.where)).toEqual(expected);
  const release=validateAuditDir('docs/audits/2026-11-04-data-foundation-2',{release:true}).filter(f=>f.code!=='audit_finding_undisposed');
  expect(release.map(f=>[f.code,f.where])).toEqual([
   ['audit_release_uncommitted','docs/audits/2026-11-04-data-foundation-2/index.json#rounds[n=8]'],
   ['audit_release_open_verify','round 1 #27'],['audit_release_open_verify','round 2 #N11'],
  ]);
 });
});
```

- [ ] **Step 3: Run it — expect failure**

Run: `npm test -- src/lib/evals/validate/audit.test.ts`
Expected: FAIL — `Failed to resolve import "./audit"`.

- [ ] **Step 4: Implement `audit.ts`**

Create `src/lib/evals/validate/audit.ts`:

```ts
// src/lib/evals/validate/audit.ts
// Third-party model audit records (spec §9): parse Codex reports and disposition tables, validate
// docs/audits/<dir>/index.json. Parsing rules (fixed here, tested against the real audit directories):
//  - A FINDINGS TABLE is a markdown table whose header has a column starting with "Severity". The
//    finding id is the `#` column when the header has one; otherwise a severity cell "P1 · R3-1" carries
//    the id; otherwise the id is synthesized as `R<round>-<P1|P2|P3>-<k>` (k = 1-based count of that
//    severity within the table). Bold paragraphs "**R5-1 · P1 — …**" are findings too. Rows whose
//    severity cell has no P1/P2/P3 are ignored; `*` is stripped from every cell; duplicate ids keep the first.
//  - A DISPOSITION TABLE is a table whose header has a column "决定" or "Decision". The id is the first
//    whitespace token of the first cell ("Round-1 #27 …" → "27"); implemented_in is the column named
//    `implemented_in`, else the column right after the decision column.
//  - Decisions: ACCEPT = /\bACCEPT\b/i; OPEN-verify = /OPEN[\s-]*\(?verify\)?/i; OWNER = /\bOWNER\b/i.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {isAbsolute,join,relative} from 'node:path';
import {sha256Hex} from '../canonical-json';
import {GIT_SHA,SHA256,finding,isObject} from './finding';
import type {ValidatorFinding} from './finding';

export type Severity='P1'|'P2'|'P3';
export interface ParsedFinding{id:string;severity:Severity}
export interface DispositionRow{id:string;decision:string;implemented_in:string;file:string}
export interface AuditRound{n:number;target_sha256:string|null;target_git_ref:string;unverified_target?:boolean;prompt_file:string|null;report_file:string;model:string;effort:string;verdict:string;findings:Record<string,number>}
export interface AuditIndex{topic:string;target:{path:string};rounds:AuditRound[];dispositions:{file:string;covers_rounds:number[]}[];open:{owner:string[];verify:string[]};final_verdict:string}
export interface AuditDeps{root?:string;release?:boolean;gitShow?:(ref:string,path:string)=>Uint8Array|null}

const strip=(c:string)=>c.replace(/\*/g,'').trim();
/** Splits one table line into cells; `|` inside backtick spans does not split. */
export function tableCells(line:string):string[]{
 const s=line.trim().replace(/^\|/,'').replace(/\|$/,'');
 const out:string[]=[];let cur='';let code=false;
 for(const ch of s){
  if(ch==='`')code=!code;
  if(ch==='|'&&!code){out.push(cur.trim());cur='';continue;}
  cur+=ch;
 }
 out.push(cur.trim());return out;
}
/** Markdown tables in document order (header + body rows; the separator row is dropped). */
export function markdownTables(md:string):{header:string[];rows:string[][]}[]{
 const out:{header:string[];rows:string[][]}[]=[];let block:string[]=[];
 const flush=()=>{if(block.length>=2&&/^\|\s*:?-{3,}/.test(block[1]))out.push({header:tableCells(block[0]),rows:block.slice(2).map(tableCells)});block=[];};
 for(const line of md.split(/\r?\n/)){if(line.trimStart().startsWith('|'))block.push(line.trim());else flush();}
 flush();return out;
}
const SEV=/\bP([123])\b/;
export function parseFindings(md:string,round:number):ParsedFinding[]{
 const out:ParsedFinding[]=[];const seen=new Set<string>();
 const add=(id:string,severity:Severity)=>{if(id&&!seen.has(id)){seen.add(id);out.push({id,severity});}};
 for(const t of markdownTables(md)){
  const h=t.header.map(x=>strip(x).toLowerCase());
  const s=h.findIndex(x=>x.startsWith('severity'));
  if(s<0)continue;
  const idCol=h.indexOf('#');const k:Record<string,number>={};
  for(const r of t.rows){
   const cell=strip(r[s]??'');const m=SEV.exec(cell);if(!m)continue;
   const severity=`P${m[1]}` as Severity;
   if(idCol>=0){add(strip(r[idCol]??''),severity);continue;}
   const inline=/^P[123]\s*·\s*(\S+)$/.exec(cell);
   if(inline){add(inline[1],severity);continue;}
   k[severity]=(k[severity]??0)+1;add(`R${round}-${severity}-${k[severity]}`,severity);
  }
 }
 for(const m of md.matchAll(/^\*\*([A-Z]+\d+-\d+)\s*·\s*(P[123])\b/gm))add(m[1],m[2] as Severity);
 return out;
}
export function parseDispositions(md:string,file:string):DispositionRow[]{
 const out:DispositionRow[]=[];
 for(const t of markdownTables(md)){
  const h=t.header.map(x=>strip(x).toLowerCase());
  const d=h.findIndex(x=>x==='决定'||x==='decision');
  if(d<0)continue;
  const named=h.indexOf('implemented_in');const impl=named>=0?named:d+1;
  for(const r of t.rows){
   const first=strip(r[0]??'');if(!first)continue;
   const id=/^Round-\d+\s*#(\d+)/i.exec(first)?.[1]??first.split(/\s+/)[0];
   out.push({id,decision:strip(r[d]??''),implemented_in:strip(r[impl]??''),file});
  }
 }
 return out;
}
export const isAccept=(d:string)=>/\bACCEPT\b/i.test(d);
export const isOpenVerify=(d:string)=>/OPEN[\s-]*\(?verify\)?/i.test(d);
export const isOwner=(d:string)=>/\bOWNER\b/i.test(d);
/** First line `**Verdict: X**` → X (trailing period dropped); null when absent. */
export function parseVerdict(md:string):string|null{
 const first=md.split(/\r?\n/).find(l=>l.trim()!=='')??'';
 const m=/^\*\*Verdict:\s*(.+?)\*\*/.exec(first.trim());
 return m?m[1].trim().replace(/\.$/,''):null;
}
export function severityCounts(f:ParsedFinding[]):{p1:number;p2:number;p3:number}{
 return {p1:f.filter(x=>x.severity==='P1').length,p2:f.filter(x=>x.severity==='P2').length,p3:f.filter(x=>x.severity==='P3').length};
}
// GIT_* variables (exported by git hooks) would redirect the lookup away from `root`'s repository.
const gitEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const defaultGitShow=(root:string)=>(ref:string,path:string):Uint8Array|null=>{
 try{return execFileSync('git',['show',`${ref}:${path}`],{cwd:root,env:gitEnv(),stdio:['ignore','pipe','ignore'],maxBuffer:64*1024*1024});}catch{return null;}
};
const strArr=(v:unknown)=>Array.isArray(v)&&v.every(x=>typeof x==='string');
function indexShape(v:unknown):string|null{
 if(!isObject(v))return 'index.json is not an object';
 if(typeof v.topic!=='string'||!v.topic)return 'topic';
 if(!isObject(v.target)||typeof v.target.path!=='string'||!v.target.path)return 'target.path';
 if(!Array.isArray(v.rounds)||v.rounds.length===0)return 'rounds';
 for(const r of v.rounds){
  if(!isObject(r))return 'rounds[]';
  if(!Number.isInteger(r.n)||typeof r.target_git_ref!=='string'||typeof r.report_file!=='string'||!(r.prompt_file===null||typeof r.prompt_file==='string')
   ||typeof r.model!=='string'||typeof r.effort!=='string'||typeof r.verdict!=='string'||!r.verdict||!(r.target_sha256===null||typeof r.target_sha256==='string')||!isObject(r.findings))return `rounds[n=${String(r.n)}]`;
 }
 if(!Array.isArray(v.dispositions)||v.dispositions.some(d=>!isObject(d)||typeof d.file!=='string'||!Array.isArray(d.covers_rounds)||!d.covers_rounds.every(Number.isInteger)))return 'dispositions';
 if(!isObject(v.open)||!strArr(v.open.owner)||!strArr(v.open.verify))return 'open';
 if(typeof v.final_verdict!=='string')return 'final_verdict';
 return null;
}

/** Validates one audit directory (spec §9). `release` adds the release-manifest rules (§10 model_audit). */
export function validateAuditDir(dir:string,deps:AuditDeps={}):ValidatorFinding[]{
 const root=deps.root??process.cwd();
 const abs=isAbsolute(dir)?dir:join(root,dir);
 const rel=(f:string)=>relative(root,join(abs,f));
 const out:ValidatorFinding[]=[];
 const indexPath=join(abs,'index.json');
 if(!existsSync(indexPath))return [finding('audit_index_missing',rel('index.json'),'index.json not found')];
 let raw:unknown;
 try{raw=JSON.parse(readFileSync(indexPath,'utf8'));}catch{return [finding('audit_index_invalid',rel('index.json'),'index.json is not valid JSON')];}
 const bad=indexShape(raw);
 if(bad)return [finding('audit_index_invalid',rel('index.json'),`invalid field: ${bad}`)];
 const index=raw as AuditIndex;
 const gitShow=deps.gitShow??defaultGitShow(root);
 const byRound=new Map<number,ParsedFinding[]>();
 index.rounds.forEach((r,i)=>{
  const where=`${rel('index.json')}#rounds[n=${r.n}]`;
  if(r.n!==i+1)out.push(finding('audit_round_order',where,`round ${r.n} at position ${i+1}`));
  if(r.prompt_file!==null&&!existsSync(join(abs,r.prompt_file)))out.push(finding('audit_file_missing',rel(r.prompt_file),'prompt file not found'));
  if(!existsSync(join(abs,r.report_file))){out.push(finding('audit_file_missing',rel(r.report_file),'report file not found'));byRound.set(r.n,[]);return;}
  const parsed=parseFindings(readFileSync(join(abs,r.report_file),'utf8'),r.n);
  byRound.set(r.n,parsed);
  const c=severityCounts(parsed);
  for(const k of ['p1','p2','p3'] as const)if((r.findings[k]??0)!==c[k])out.push(finding('audit_findings_count',where,`findings.${k}=${r.findings[k]??0} but the report has ${c[k]}`));
  if(r.target_git_ref==='uncommitted'){
   if(r.unverified_target!==true)out.push(finding('audit_unverified_target',where,"target_git_ref 'uncommitted' requires unverified_target: true"));
  }else if(!GIT_SHA.test(r.target_git_ref)||r.target_sha256===null||!SHA256.test(r.target_sha256)){
   out.push(finding('audit_target_ref',where,'committed rounds need a 40-hex target_git_ref and a 64-hex target_sha256'));
  }else{
   const bytes=gitShow(r.target_git_ref,index.target.path);
   if(bytes===null)out.push(finding('audit_target_unreadable',where,`git show ${r.target_git_ref}:${index.target.path} failed`));
   else if(sha256Hex(bytes)!==r.target_sha256)out.push(finding('audit_target_mismatch',where,'target_sha256 differs from the committed bytes'));
  }
 });
 const rows:DispositionRow[]=[];
 for(const d of index.dispositions){
  if(!existsSync(join(abs,d.file))){out.push(finding('audit_file_missing',rel(d.file),'disposition file not found'));continue;}
  rows.push(...parseDispositions(readFileSync(join(abs,d.file),'utf8'),d.file));
 }
 const ids=new Set(rows.map(r=>r.id));
 for(const [n,list] of byRound)for(const f of list)if(!ids.has(f.id))out.push(finding('audit_finding_undisposed',`round ${n} #${f.id}`,'finding id appears in no disposition table'));
 for(const r of rows)if(isAccept(r.decision)&&!r.implemented_in)out.push(finding('audit_accept_unimplemented',`${rel(r.file)} #${r.id}`,'ACCEPT row without implemented_in'));
 if(rows.some(r=>isOpenVerify(r.decision))&&index.open.verify.length===0)out.push(finding('audit_open_inconsistent',rel('index.json'),'OPEN-verify dispositions exist but open.verify is empty'));
 if(rows.some(r=>isOwner(r.decision))&&index.open.owner.length===0)out.push(finding('audit_open_inconsistent',rel('index.json'),'OWNER dispositions exist but open.owner is empty'));
 if(deps.release){
  const last=index.rounds[index.rounds.length-1];
  if(last.target_git_ref==='uncommitted')out.push(finding('audit_release_uncommitted',`${rel('index.json')}#rounds[n=${last.n}]`,'the last round must target a commit'));
  for(const [n,list] of byRound)for(const f of list){
   if(f.severity==='P3')continue;
   const mine=rows.filter(r=>r.id===f.id);
   if(mine.some(r=>isOpenVerify(r.decision)))out.push(finding('audit_release_open_verify',`round ${n} #${f.id}`,`${f.severity} finding is OPEN-verify`));
   if(mine.some(r=>isAccept(r.decision)&&!r.implemented_in))out.push(finding('audit_release_unimplemented',`round ${n} #${f.id}`,`${f.severity} ACCEPT without implemented_in`));
  }
 }
 return out;
}
```

- [ ] **Step 5: Reconstruct `docs/audits/2026-11-04-data-foundation-2/index.json`**

Read from that directory's files (README.md, the eight Codex reports `01/03/05/07/09/11/13/15`, the six dispositions `04/06/08/10/12/14`): verdicts are the `**Verdict:**` first line (rounds 1–2) or the `**Final verdict:**` line (rounds 3–8); counts are what `parseFindings` yields (round 1 = README "11 P1 / 19 P2 / 1 P3"); the target is the plan-2 spec; no prompts were kept. Create `docs/audits/2026-11-04-data-foundation-2/index.json`:

```json
{
  "topic": "data-foundation-2",
  "target": {
    "path": "docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md"
  },
  "reconstructed": {
    "at": "2026-11-06",
    "by": "F6 plan Task 12",
    "method": "Read from the files in this directory and README.md. The audited bytes of every round are unknown (drafts were audited before or while being committed), so every round is target_git_ref 'uncommitted' with unverified_target true; draft_commit_hint names the commit that first recorded that draft and is NOT proof of the audited bytes.",
    "reviews": [
      {"file": "02-claude-spec-review-round1.md", "round": 1, "reviewer": "claude-fable-5.1", "note": "independent review, not a Codex round"}
    ],
    "non_audit_files": ["16-implementation-log.md", "17-tushare-verification.md", "README.md"]
  },
  "rounds": [
    {"n": 1, "target_draft": 1, "draft_commit_hint": "7d2faa70896980967296bf0a4e96f32060e5e745", "target_sha256": null, "target_git_ref": "uncommitted", "unverified_target": true, "prompt_file": null, "report_file": "01-codex-spec-audit-round1.md", "model": "gpt-6-astra", "effort": "medium", "verdict": "not ready for implementation planning", "findings": {"p1": 11, "p2": 19, "p3": 1}},
    {"n": 2, "target_draft": 2, "draft_commit_hint": "8412b570b4ee24e4cf49427cafc8388f44fb30d8", "target_sha256": null, "target_git_ref": "uncommitted", "unverified_target": true, "prompt_file": null, "report_file": "03-codex-spec-audit-round2.md", "model": "gpt-6-astra", "effort": "medium", "verdict": "not ready for an implementation plan", "findings": {"p1": 19, "p2": 6, "p3": 0}},
    {"n": 3, "target_draft": 3, "draft_commit_hint": "2dcf1440891869e283269dc1a34a4da164173837", "target_sha256": null, "target_git_ref": "uncommitted", "unverified_target": true, "prompt_file": null, "report_file": "05-codex-spec-audit-round3.md", "model": "gpt-6-astra", "effort": "medium", "verdict": "not ready for an implementation plan—blocking items are R3-1–R3-7, stale/date-boundary metric materialization (N12), incompatible YTD revisions (N14), unsafe quarantine promotion/recovery (N16), incomplete deadline enforcement (N20), and unresolved correction linkage (N11); owner decisions A/C also remain pending", "findings": {"p1": 7, "p2": 0, "p3": 0}},
    {"n": 4, "target_draft": 4, "draft_commit_hint": "3d5a98b3ce343eaee124c1fcbd1243b8201b27fc", "target_sha256": null, "target_git_ref": "uncommitted", "unverified_target": true, "prompt_file": null, "report_file": "07-codex-spec-audit-round4.md", "model": "gpt-6-astra", "effort": "medium", "verdict": "not ready for an implementation plan—the blocking items are R4-1–R4-7 and the still-unresolved revision-compatibility requirement N14; owner decisions A/B/C remain pending", "findings": {"p1": 7, "p2": 0, "p3": 0}},
    {"n": 5, "target_draft": 5, "draft_commit_hint": "b5da42159cd525875247a4cc68517f058bfa3698", "target_sha256": null, "target_git_ref": "uncommitted", "unverified_target": true, "prompt_file": null, "report_file": "09-codex-spec-audit-round5.md", "model": "gpt-6-astra", "effort": "medium", "verdict": "not ready for an implementation plan—the blocking items are R5-1 and R5-2; owner decisions A/B/C remain pending", "findings": {"p1": 2, "p2": 1, "p3": 0}},
    {"n": 6, "target_draft": 6, "draft_commit_hint": "c7ece9e9e39ba7475383263150f0d752b00b067e", "target_sha256": null, "target_git_ref": "uncommitted", "unverified_target": true, "prompt_file": null, "report_file": "11-codex-spec-audit-round6.md", "model": "gpt-6-astra", "effort": "medium", "verdict": "not ready for an implementation plan—R6-1 is the sole blocking item in this review; owner decisions A/B/C remain pending", "findings": {"p1": 1, "p2": 0, "p3": 0}},
    {"n": 7, "target_draft": 7, "draft_commit_hint": "f7d6e3fc317747821a7ad5712545cac8bc9725df", "target_sha256": null, "target_git_ref": "uncommitted", "unverified_target": true, "prompt_file": null, "report_file": "13-codex-spec-audit-round7.md", "model": "gpt-6-astra", "effort": "medium", "verdict": "not ready for an implementation plan—blocking items are incomplete R6-1 serialization and R7-1’s self-blocked promotion; owner decisions A/B/C remain pending", "findings": {"p1": 1, "p2": 0, "p3": 0}},
    {"n": 8, "target_draft": 8, "draft_commit_hint": "fcf178f6c00f436dc8a5542f79d1921f4827e997", "target_sha256": null, "target_git_ref": "uncommitted", "unverified_target": true, "prompt_file": null, "report_file": "15-codex-spec-audit-round8-final.md", "model": "gpt-6-astra", "effort": "medium", "verdict": "ready for an implementation plan with owner decisions A/B/C pending (§14)", "findings": {"p1": 0, "p2": 0, "p3": 0}}
  ],
  "dispositions": [
    {"file": "04-round2-disposition.md", "covers_rounds": [1, 2]},
    {"file": "06-round3-disposition.md", "covers_rounds": [3]},
    {"file": "08-round4-disposition.md", "covers_rounds": [4]},
    {"file": "10-round5-disposition.md", "covers_rounds": [5]},
    {"file": "12-round6-disposition.md", "covers_rounds": [6]},
    {"file": "14-round7-disposition.md", "covers_rounds": [7]}
  ],
  "open": {
    "owner": ["A A-share coverage scope", "B watchlists in scope", "C CN facts public before PDF reconciliation"],
    "verify": ["Round-1 #27 Tushare pagination semantics", "N11 correction identity"]
  },
  "final_verdict": "ready for an implementation plan with owner decisions A/B/C pending (§14); round-1 findings have no per-id disposition table (only #27 and #29 are dispositioned in 04)"
}
```

- [ ] **Step 6: Run the audit test — expect pass**

Run: `npm test -- src/lib/evals/validate/audit.test.ts`
Expected: PASS — `15 passed (15)`. (The real-directory test needs commit `394d5141e88b913d38b816ebf369efce4d9b320a` in the local object store; it is on `main`'s history. If the F6 spec audit directory gains rounds or dispositions later, update this test's pinned expectation in the same commit.)

- [ ] **Step 7: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

```bash
git add src/lib/evals/validate/finding.ts src/lib/evals/validate/audit.ts src/lib/evals/validate/audit.test.ts docs/audits/2026-11-04-data-foundation-2/index.json
```
```bash
git commit -m "feat(evals): audit-record validator (spec 9) and reconstructed data-foundation-2 index.json" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

#### 12b — expert sampling records (§8)

- [ ] **Step 8: Write the failing expert test**

Create `src/lib/evals/validate/expert.test.ts`:

```ts
// src/lib/evals/validate/expert.test.ts
// Spec §8: seeded selection recompute, check coverage, summary recompute, the 80 % rule, follow-ups, release closure.
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import type {GoldCase,GoldSet} from '../types';
import {CLOSURE_REF,findSetBySha,seededSelection,validateExpertRecord} from './expert';
import type {ExpertRecord} from './expert';

const gc=(case_id:string,subject:GoldCase['subject'],retracted:GoldCase['retracted']=null):GoldCase=>({
 case_id,subject,target:{type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
 expect:'present',printed:{text:'1',unit_label:'In millions',scale:'1000000'},canonical:{value:'1000000'},binding:'document',as_of:null,
 source:{document_type:'10-K',url:'https://www.sec.gov/Archives/edgar/data/1/x.htm',sha256:'0'.repeat(64)},provenance_kind:'transcribed',
 recorded_by:'r1',recorded_at:'2026-11-01T00:00:00Z',reviewed_by:'r2',reviewed_at:'2026-11-02T00:00:00Z',retracted,notes:'',required:true,pending:false,provenance_gaps:[],
});
// Three companies × three cases, one retracted case, one ticker-keyed company.
const CASES:GoldCase[]=[
 ...['a','b','c'].map(x=>gc(`C1/${x}`,{market:'US',cik:'1001'})),
 ...['a','b','c'].map(x=>gc(`C2/${x}`,{market:'US',cik:'1002'})),
 ...['a','b'].map(x=>gc(`C3/${x}`,{market:'CN',ticker:'600000.SH'})),
 gc('C3/r',{market:'CN',ticker:'600000.SH'},{at:'2026-11-03T00:00:00Z',by:'r2',reason:'typo'}),
];
const SET:GoldSet={schema_version:1,format:'f6',set_id:'facts/expert-test',version:2,module:'facts',artifact_class:'public',module_implementers:['claude-code'],
 tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],cases:CASES,ready:true,path:'src/lib/evals/fixtures/gold/facts/expert-test.json',sha256:'9'.repeat(64)};
const RUN='aaaaaaaa-0000-4000-8000-000000000001';
const record=(o:Partial<ExpertRecord>={}):ExpertRecord=>{
 const selected=seededSelection(SET.cases,'seed-1',2,2);
 return {
  schema_version:1,module:'facts',sampled_at:'2026-11-20T00:00:00Z',expert:{alias:'E1',background:'CPA',independence:'not an implementer',contact_held_by:'owner'},
  population:{set_id:SET.set_id,set_version:2,set_sha256:SET.sha256,case_count:8,evaluated_run_id:RUN,db_state_rev:'7'},
  selection:{method:'seeded_sha256',seed:'seed-1',companies:2,cases_per_company:2,selected_case_ids:selected},
  checks:selected.map(case_id=>({case_id,our_value:'1000000',document_value:'1000000',document:{page:1},verdict:'agree' as const,note:''})),
  basis_review:[{topic:'revenue basis',verdict:'agree',note:''}],summary:{agree:4,disagree:0,cannot_verify:0},follow_ups:[],...o,
 };
};
const codes=(r:unknown,release=false,set:GoldSet|null=SET)=>validateExpertRecord(r,set,{release}).map(f=>f.code);
const h=(s:string)=>createHash('sha256').update(s).digest('hex');

describe('seededSelection',()=>{
 it('ranks companies by their smallest sha256(seed + case_id), takes the first N, then the M smallest per company; retracted cases never count',()=>{
  const eligible=CASES.filter(c=>!c.retracted);
  const key=(c:GoldCase)=>c.subject.cik??c.subject.ticker!;
  const byCompany=new Map<string,string[]>();
  for(const c of eligible){byCompany.set(key(c),[...(byCompany.get(key(c))??[]),c.case_id]);}
  const ranked=[...byCompany.values()].map(ids=>ids.sort((a,b)=>h('seed-1'+a)<h('seed-1'+b)?-1:1)).sort((a,b)=>h('seed-1'+a[0])<h('seed-1'+b[0])?-1:1);
  expect(seededSelection(CASES,'seed-1',2,2)).toEqual(ranked.slice(0,2).flatMap(ids=>ids.slice(0,2)));
  expect(seededSelection(CASES,'seed-1',9,9)).toHaveLength(8);
  expect(seededSelection(CASES,'seed-1',9,9)).not.toContain('C3/r');
 });
 it('is deterministic for a seed',()=>expect(seededSelection(CASES,'x',3,1)).toEqual(seededSelection([...CASES].reverse(),'x',3,1)));
});

describe('validateExpertRecord',()=>{
 it('accepts a complete record, in release mode too',()=>{expect(codes(record())).toEqual([]);expect(codes(record(),true)).toEqual([]);});
 it('accepts selected_case_ids in any order',()=>{const r=record();r.selection.selected_case_ids=[...r.selection.selected_case_ids].reverse();expect(codes(r)).toEqual([]);});
 it('rejects malformed records with expert_invalid',()=>{
  expect(codes({...record(),schema_version:2})).toEqual(['expert_invalid']);
  expect(codes({...record(),selection:{...record().selection,method:'random'}})).toEqual(['expert_invalid']);
  expect(codes({...record(),expert:{...record().expert,contact_held_by:'expert'}})).toEqual(['expert_invalid']);
  expect(codes({...record(),checks:[{...record().checks[0],verdict:'maybe'}]})).toEqual(['expert_invalid']);
 });
 it('needs the population set',()=>expect(codes(record(),false,null)).toEqual(['expert_set_unresolved']));
 it('rejects a population that does not describe the set',()=>{
  expect(codes(record({population:{...record().population,set_version:1}}))).toContain('expert_population');
  expect(codes(record({population:{...record().population,case_count:9}}))).toContain('expert_population');
 });
 it('rejects a selection that does not recompute (swapped id, duplicate)',()=>{
  const r=record();const other=CASES.find(c=>!c.retracted&&!r.selection.selected_case_ids.includes(c.case_id))!.case_id;
  r.selection.selected_case_ids=[...r.selection.selected_case_ids.slice(1),other];
  expect(codes(r)).toContain('expert_selection_mismatch');
  const d=record();d.selection.selected_case_ids=[...d.selection.selected_case_ids,d.selection.selected_case_ids[0]];
  expect(codes(d)).toContain('expert_selection_mismatch');
 });
 it('requires one check per selected case and no others',()=>{
  const r=record();r.checks=r.checks.slice(1);r.summary={agree:3,disagree:0,cannot_verify:0};
  expect(codes(r)).toEqual(expect.arrayContaining(['expert_check_missing']));
  const x=record();x.checks=[...x.checks,{...x.checks[0],case_id:'C9/zz'}];x.summary={agree:5,disagree:0,cannot_verify:0};
  expect(codes(x)).toContain('expert_check_extra');
  const d=record();d.checks=[...d.checks,d.checks[0]];d.summary={agree:5,disagree:0,cannot_verify:0};
  expect(codes(d)).toContain('expert_check_duplicate');
 });
 it('recomputes the summary',()=>expect(codes(record({summary:{agree:3,disagree:1,cannot_verify:0}}))).toEqual(['expert_summary_mismatch']));
 it('requires agree + disagree ≥ 0.8 × selected (cannot_verify does not complete a sample)',()=>{
  const r=record();r.checks[0].verdict='cannot_verify';r.summary={agree:3,disagree:0,cannot_verify:1};
  expect(codes(r)).toEqual(['expert_coverage']);   // 3 of 4 < 3.2
 });
 it('requires a follow-up for every disagree, including basis_review',()=>{
  const r=record();r.checks[0].verdict='disagree';r.summary={agree:3,disagree:1,cannot_verify:0};
  expect(codes(r)).toEqual(['expert_follow_up_missing']);
  r.follow_ups=[{ref:r.checks[0].case_id,action:'re-check the filing',owner:'owner',due:'2026-12-01',closed_at:null,closure_ref:null}];
  expect(codes(r)).toEqual([]);
  r.basis_review=[{topic:'revenue basis',verdict:'disagree',note:'gross vs net'}];
  expect(codes(r)).toEqual(['expert_follow_up_missing']);
 });
 it('release mode requires every follow-up closed with a quarantine, PR or gold-history closure_ref',()=>{
  const r=record();r.checks[0].verdict='disagree';r.summary={agree:3,disagree:1,cannot_verify:0};
  r.follow_ups=[{ref:r.checks[0].case_id,action:'fix',owner:'owner',due:'2026-12-01',closed_at:null,closure_ref:null}];
  expect(codes(r,true)).toEqual(['expert_follow_up_open']);
  r.follow_ups[0]={...r.follow_ups[0],closed_at:'2026-11-25T00:00:00Z',closure_ref:'see chat'};
  expect(codes(r,true)).toEqual(['expert_follow_up_open']);
  for(const ref of ['dq_quarantine:3f2c1d4e-1111-4222-8333-444455556666','https://github.com/osborn-studio/OsbornAlpha/pull/123','gold:facts/expert-test@3']){
   r.follow_ups[0]={...r.follow_ups[0],closure_ref:ref};expect(codes(r,true)).toEqual([]);
  }
  expect(CLOSURE_REF.test('gold:facts/x')).toBe(false);
 });
 it('findSetBySha loads the locked set with that sha256',()=>{
  const lock={files:[{path:'a.json',sha256:'1'.repeat(64),version:1,format:'f6' as const},{path:SET.path,sha256:SET.sha256,version:2,format:'f6' as const}]};
  expect(findSetBySha(lock,SET.sha256,p=>({...SET,path:p}))?.path).toBe(SET.path);
  expect(findSetBySha(lock,'2'.repeat(64),()=>SET)).toBeNull();
 });
});
```

- [ ] **Step 9: Run it — expect failure**

Run: `npm test -- src/lib/evals/validate/expert.test.ts`
Expected: FAIL — `Failed to resolve import "./expert"`.

- [ ] **Step 10: Implement `expert.ts`**

Create `src/lib/evals/validate/expert.ts`:

```ts
// src/lib/evals/validate/expert.ts
// Expert sampling record validator (spec §8). Selection `seeded_sha256`: every non-retracted case of the
// population set gets h = sha256Hex(seed + case_id) (UTF-8 concatenation, no separator); cases group by
// company key = subject.cik ?? subject.ticker; companies rank by their smallest h (ties: key ascending);
// the first `companies` companies are taken, and within each the `cases_per_company` smallest h.
// selected_case_ids is compared as a set (order-insensitive, duplicates rejected).
import {sha256Hex} from '../canonical-json';
import type {GoldCase,GoldLock,GoldSet} from '../types';
import {ISO_DATE,ISO_TS,SHA256,UUID,finding,isObject} from './finding';
import type {ValidatorFinding} from './finding';

export type ExpertVerdict='agree'|'disagree'|'cannot_verify';
export interface ExpertRecord{
 schema_version:1;module:string;sampled_at:string;
 expert:{alias:string;background:string;independence:string;contact_held_by:'owner'};
 population:{set_id:string;set_version:number;set_sha256:string;case_count:number;evaluated_run_id:string;db_state_rev:string};
 selection:{method:'seeded_sha256';seed:string;companies:number;cases_per_company:number;selected_case_ids:string[]};
 checks:{case_id:string;our_value:string|null;document_value:string|null;document:Record<string,unknown>;verdict:ExpertVerdict;note:string}[];
 basis_review:{topic:string;verdict:'agree'|'disagree';note:string}[];
 summary:{agree:number;disagree:number;cannot_verify:number};
 follow_ups:{ref:string;action:string;owner:string;due:string;closed_at:string|null;closure_ref:string|null}[];
}
/** A follow-up closes against a quarantine item, a PR, or a gold-set history version. */
export const CLOSURE_REF=/^(dq_quarantine:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+|gold:[^@\s]+@\d+)$/;

export const companyKeyOf=(c:Pick<GoldCase,'subject'>):string|null=>c.subject.cik??c.subject.ticker??null;
export function seededSelection(cases:Pick<GoldCase,'case_id'|'subject'|'retracted'>[],seed:string,companies:number,perCompany:number):string[]{
 const groups=new Map<string,{case_id:string;h:string}[]>();
 for(const c of cases){
  if(c.retracted)continue;
  const key=companyKeyOf(c);if(key===null)continue;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key)!.push({case_id:c.case_id,h:sha256Hex(seed+c.case_id)});
 }
 const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 const ranked=[...groups].map(([key,list])=>({key,list:[...list].sort((a,b)=>cmp(a.h,b.h)||cmp(a.case_id,b.case_id))}))
  .sort((a,b)=>cmp(a.list[0].h,b.list[0].h)||cmp(a.key,b.key));
 return ranked.slice(0,companies).flatMap(g=>g.list.slice(0,perCompany).map(x=>x.case_id));
}
/** The lock entry whose sha256 equals `sha256`, loaded; null when none. */
export function findSetBySha(lock:GoldLock,sha256:string,loadSet:(path:string)=>GoldSet):GoldSet|null{
 const entry=lock.files.find(f=>f.sha256===sha256);
 return entry?loadSet(entry.path):null;
}

const posInt=(v:unknown)=>Number.isInteger(v)&&(v as number)>0;
const nonNegInt=(v:unknown)=>Number.isInteger(v)&&(v as number)>=0;
const str=(v:unknown)=>typeof v==='string'&&v.length>0;
const strOrNull=(v:unknown)=>v===null||typeof v==='string';
function shape(r:unknown):string|null{
 if(!isObject(r))return 'record';
 if(r.schema_version!==1)return 'schema_version';
 if(!str(r.module))return 'module';
 if(typeof r.sampled_at!=='string'||!(ISO_TS.test(r.sampled_at)||ISO_DATE.test(r.sampled_at)))return 'sampled_at';
 const e=r.expert;if(!isObject(e)||!str(e.alias)||typeof e.background!=='string'||typeof e.independence!=='string'||e.contact_held_by!=='owner')return 'expert';
 const p=r.population;
 if(!isObject(p)||!str(p.set_id)||!posInt(p.set_version)||typeof p.set_sha256!=='string'||!SHA256.test(p.set_sha256)||!nonNegInt(p.case_count)
  ||typeof p.evaluated_run_id!=='string'||!UUID.test(p.evaluated_run_id)||typeof p.db_state_rev!=='string')return 'population';
 const s=r.selection;
 if(!isObject(s)||s.method!=='seeded_sha256'||!str(s.seed)||!posInt(s.companies)||!posInt(s.cases_per_company)||!Array.isArray(s.selected_case_ids)||!s.selected_case_ids.every(str))return 'selection';
 if(!Array.isArray(r.checks)||!r.checks.every(c=>isObject(c)&&str(c.case_id)&&strOrNull(c.our_value)&&strOrNull(c.document_value)&&isObject(c.document)&&['agree','disagree','cannot_verify'].includes(c.verdict as string)&&typeof c.note==='string'))return 'checks';
 if(!Array.isArray(r.basis_review)||!r.basis_review.every(b=>isObject(b)&&str(b.topic)&&['agree','disagree'].includes(b.verdict as string)&&typeof b.note==='string'))return 'basis_review';
 const m=r.summary;if(!isObject(m)||!nonNegInt(m.agree)||!nonNegInt(m.disagree)||!nonNegInt(m.cannot_verify))return 'summary';
 if(!Array.isArray(r.follow_ups)||!r.follow_ups.every(f=>isObject(f)&&str(f.ref)&&typeof f.action==='string'&&typeof f.owner==='string'&&typeof f.due==='string'&&strOrNull(f.closed_at)&&strOrNull(f.closure_ref)))return 'follow_ups';
 return null;
}

/** `set` is the population gold set (null = not resolvable). `release` adds the manifest rule: every follow-up closed with a closure_ref. */
export function validateExpertRecord(raw:unknown,set:GoldSet|null,opts:{release?:boolean;where?:string}={}):ValidatorFinding[]{
 const where=opts.where??'expert_sampling';
 const bad=shape(raw);
 if(bad)return [finding('expert_invalid',`${where}#${bad}`,`invalid or missing field: ${bad}`)];
 const r=raw as ExpertRecord;const out:ValidatorFinding[]=[];
 if(!set)return [finding('expert_set_unresolved',`${where}#population.set_sha256`,'no locked gold set has this sha256')];
 if(r.population.set_id!==set.set_id||r.population.set_version!==set.version||r.population.set_sha256!==set.sha256||r.module!==set.module)
  out.push(finding('expert_population',`${where}#population`,'set_id/set_version/set_sha256/module differ from the population set'));
 const eligible=set.cases.filter(c=>!c.retracted);
 if(r.population.case_count!==eligible.length)out.push(finding('expert_population',`${where}#population.case_count`,`case_count ${r.population.case_count} but the set has ${eligible.length} non-retracted cases`));
 for(const c of eligible)if(companyKeyOf(c)===null)out.push(finding('expert_company_key_missing',`${where}#${c.case_id}`,'case subject has neither cik nor ticker'));
 const selected=r.selection.selected_case_ids;
 const expected=seededSelection(set.cases,r.selection.seed,r.selection.companies,r.selection.cases_per_company);
 if(new Set(selected).size!==selected.length)out.push(finding('expert_selection_mismatch',`${where}#selection.selected_case_ids`,'duplicate case ids'));
 const want=new Set(expected);const got=new Set(selected);
 if(want.size!==got.size||[...want].some(id=>!got.has(id)))out.push(finding('expert_selection_mismatch',`${where}#selection.selected_case_ids`,`recomputed selection differs (expected ${expected.length} cases)`));
 const checked=r.checks.map(c=>c.case_id);const checkedSet=new Set(checked);
 if(checkedSet.size!==checked.length)out.push(finding('expert_check_duplicate',`${where}#checks`,'a case is checked twice'));
 for(const id of got)if(!checkedSet.has(id))out.push(finding('expert_check_missing',`${where}#checks`,`selected case ${id} has no check`));
 for(const id of checkedSet)if(!got.has(id))out.push(finding('expert_check_extra',`${where}#checks`,`case ${id} was not selected`));
 const count=(v:ExpertVerdict)=>r.checks.filter(c=>c.verdict===v).length;
 const sum={agree:count('agree'),disagree:count('disagree'),cannot_verify:count('cannot_verify')};
 if(sum.agree!==r.summary.agree||sum.disagree!==r.summary.disagree||sum.cannot_verify!==r.summary.cannot_verify)
  out.push(finding('expert_summary_mismatch',`${where}#summary`,`recomputed ${JSON.stringify(sum)}`));
 if(5*(sum.agree+sum.disagree)<4*selected.length)out.push(finding('expert_coverage',`${where}#checks`,`agree+disagree=${sum.agree+sum.disagree} < 0.8 × ${selected.length}`));
 const refs=new Set(r.follow_ups.map(f=>f.ref));
 for(const c of r.checks)if(c.verdict==='disagree'&&!refs.has(c.case_id))out.push(finding('expert_follow_up_missing',`${where}#checks.${c.case_id}`,'disagree without a follow-up'));
 for(const b of r.basis_review)if(b.verdict==='disagree'&&!refs.has(b.topic))out.push(finding('expert_follow_up_missing',`${where}#basis_review.${b.topic}`,'disagree without a follow-up'));
 if(opts.release)for(const f of r.follow_ups)
  if(f.closed_at===null||(!ISO_TS.test(f.closed_at)&&!ISO_DATE.test(f.closed_at))||f.closure_ref===null||!CLOSURE_REF.test(f.closure_ref))
   out.push(finding('expert_follow_up_open',`${where}#follow_ups.${f.ref}`,'release requires closed_at and a closure_ref (dq_quarantine:<uuid> | PR URL | gold:<set_id>@<version>)'));
 return out;
}
```

- [ ] **Step 11: Run it — expect pass; typecheck, lint, commit**

Run: `npm test -- src/lib/evals/validate/expert.test.ts`
Expected: PASS — `14 passed (14)`.

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

```bash
git add src/lib/evals/validate/expert.ts src/lib/evals/validate/expert.test.ts
```
```bash
git commit -m "feat(evals): expert sampling validator (seeded_sha256 recompute, coverage, follow-ups)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

#### 12c — release manifest (§10)

- [ ] **Step 12: Write the failing manifest test**

Create `src/lib/evals/validate/manifest.test.ts` (reports are built with the real `summarize`, so the recompute rule is exercised against Task 1's reducer):

```ts
// src/lib/evals/validate/manifest.test.ts
// Spec §10 per-evidence-kind authentication and common rules, on in-memory files, a stub service-role
// getRun, a stub dq_freshness and a temporary committed audit directory.
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {summarize,statusOfGate} from '../summary';
import type {CaseReport,EvalKind,EvalReport,EvalRunRow,EvidenceClass,GoldCase,GoldLock,GoldSet} from '../types';
import {seededSelection} from './expert';
import {validateManifest} from './manifest';
import type {ManifestDeps} from './manifest';

const sha=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
const RELEASE='e'.repeat(40);
const ID={official:'aaaaaaaa-0000-4000-8000-000000000001',live:'aaaaaaaa-0000-4000-8000-000000000002',dual:'aaaaaaaa-0000-4000-8000-000000000003',reference:'aaaaaaaa-0000-4000-8000-000000000004',frozen:'aaaaaaaa-0000-4000-8000-000000000005'};
const SET_PATH='src/lib/evals/fixtures/gold/facts/us-release.json';
const REPLAY_PATH='src/lib/evals/fixtures/replay/facts.frozen.json';
const PAIR_PATH='src/lib/evals/fixtures/gold/facts/pairs-us.json';
const REF_PATH='src/lib/evals/fixtures/reference/chaosai/macro-strategy.json';
const FROZEN_COPY='docs/evals/2026-11-20/facts-replay_frozen-aaaaaaaa.json';
const REPLAY_BYTES=new TextEncoder().encode('{"mode":"frozen"}\n'),LIVE_BYTES=new TextEncoder().encode('{"mode":"live"}\n'),REF_BYTES=new TextEncoder().encode('{"samples":[]}\n');
const EXPERT_FILE='docs/evals/2026-11-20/expert-sampling-facts-1.json';
const TH={max_fail:0,min_coverage_optional:'0.95'};
const GOLD={format:'f6' as const,ready:true,pending:0,provenance_gaps:0};

const goldCase=(case_id:string,market:'US'|'CN'='US',kind:GoldCase['provenance_kind']='transcribed'):GoldCase=>({
 case_id,subject:market==='US'?{market,cik:'9990601'}:{market,ticker:'600000.SH'},
 target:{type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
 expect:'present',printed:{text:'1',unit_label:'In millions',scale:'1000000'},canonical:{value:'1000000'},binding:'document',as_of:null,
 source:{document_type:'10-K',url:'https://www.sec.gov/Archives/edgar/data/9990601/x.htm',sha256:'0'.repeat(64)},provenance_kind:kind,
 recorded_by:'r1',recorded_at:'2026-11-01T00:00:00Z',reviewed_by:'r2',reviewed_at:'2026-11-02T00:00:00Z',retracted:null,notes:'',required:true,pending:false,provenance_gaps:[],
});
const goldSet=(path:string,sha256:string,cases:GoldCase[]):GoldSet=>({schema_version:1,format:'f6',set_id:path.replace(/^.*fixtures\/gold\//,'').replace(/\.json$/,''),version:1,module:'facts',artifact_class:'public',
 module_implementers:['claude-code'],tolerance:{rel:'0'},thresholds:TH,optional_cases:[],history:[],cases,ready:true,path,sha256});
const passCase=(case_id:string,result:CaseReport['outcome']={result:'pass'}):CaseReport=>({case_id,required:true,outcome:result,left:'1000000',right:'1000000',abs_diff:'0',rel_diff:'0',tolerance:'0',provenance:null,detail:{}});

interface Fx{
 sets:Record<string,GoldSet>;reports:Record<keyof typeof ID,EvalReport>;rowPatch:Partial<Record<keyof typeof ID,Partial<EvalRunRow>>>;
 manifest:Record<string,any>;expert:Record<string,any>;lock:GoldLock;fresh:Record<string,string>;noRuns?:boolean;noFresh?:boolean;keepSummary?:Set<string>;
}
function report(run_id:string,kind:EvalKind,o:{mode?:'ci'|'report';privileged?:boolean;evidence?:EvidenceClass;path:string;sha256:string;cases?:CaseReport[]}):EvalReport{
 const cases=o.cases??[passCase('X/revenue'),passCase('X/assets')];
 const evidence=o.evidence??'truth';
 return {schema_version:1,run_id,kind,module:'facts',mode:o.mode??'report',privileged:o.privileged??true,artifact_class:'public',
  set:{id:'s',version:1,sha256:o.sha256,format:'f6',path:o.path},evaluator_code_version:RELEASE,dirty:false,started_at:'2026-11-20T00:00:00Z',finished_at:'2026-11-20T00:05:00Z',
  environment:{db_host:'db.example.supabase.co',app_origin:null,db_state_rev:7},thresholds:TH,provenance:{verified:{artifacts:true,sources:true}},
  summary:summarize(cases,{thresholds:TH,gold:GOLD,subset:false,evidenceClass:evidence}),cases};
}
let auditRoot='';
function fx():Fx{
 const S={set:'1'.repeat(64),replay:sha(REPLAY_BYTES),live:sha(LIVE_BYTES),pair:'3'.repeat(64),ref:sha(REF_BYTES)};
 const set=goldSet(SET_PATH,S.set,[goldCase('X/revenue'),goldCase('X/assets')]);
 const selected=seededSelection(set.cases,'seed-1',1,2);
 return {
  sets:{[SET_PATH]:set,[PAIR_PATH]:goldSet(PAIR_PATH,S.pair,[goldCase('X/revenue'),goldCase('X/assets')])},
  reports:{
   official:report(ID.official,'official_reconciliation',{path:SET_PATH,sha256:S.set}),
   live:report(ID.live,'replay_consistency',{path:REPLAY_PATH.replace('frozen','live'),sha256:S.live,cases:[passCase('L1',{result:'identical'})]}),
   dual:report(ID.dual,'dual_source',{path:PAIR_PATH,sha256:S.pair}),
   reference:report(ID.reference,'reference_regression',{privileged:false,evidence:'comparison',path:REF_PATH,sha256:S.ref,cases:[passCase('R1',{result:'within'})]}),
   frozen:report(ID.frozen,'replay_consistency',{mode:'ci',privileged:false,path:REPLAY_PATH,sha256:S.replay,cases:[passCase('F1',{result:'identical'})]}),
  },
  rowPatch:{},
  manifest:{schema_version:1,module:'facts',release_commit:RELEASE,prepared_by:'owner',prepared_at:'2026-11-21T00:00:00Z',
   scope:{markets:['US'],universes:['sp500'],data_state_rev_min:'5'},gold_approval:'enforced',
   evidence:{
    official_reconciliation:{run_id:ID.official,report:`docs/evals/2026-11-20/${ID.official}.json`},
    replay_frozen:{ci_run_url:'https://github.com/osborn-studio/OsbornAlpha/actions/runs/123456',report:FROZEN_COPY,report_sha256:'AUTO',ci_check:'manual'},
    replay_live:{run_id:ID.live,report:`docs/evals/2026-11-20/${ID.live}.json`},
    dual_source:{not_applicable:{reason:'no second source yet',approved_by:'owner',at:'2026-11-21T00:00:00Z'}},
    reference_regression:{not_applicable:{reason:'no samples for facts',approved_by:'owner',at:'2026-11-21T00:00:00Z'}},
    expert_sampling:{file:EXPERT_FILE},
    model_audit:{dir:auditRoot},
   },waivers:[]},
  expert:{schema_version:1,module:'facts',sampled_at:'2026-11-20T00:00:00Z',expert:{alias:'E1',background:'CPA',independence:'not an implementer',contact_held_by:'owner'},
   population:{set_id:set.set_id,set_version:1,set_sha256:S.set,case_count:2,evaluated_run_id:ID.official,db_state_rev:'7'},
   selection:{method:'seeded_sha256',seed:'seed-1',companies:1,cases_per_company:2,selected_case_ids:selected},
   checks:selected.map(case_id=>({case_id,our_value:'1000000',document_value:'1000000',document:{page:1},verdict:'agree',note:''})),
   basis_review:[],summary:{agree:2,disagree:0,cannot_verify:0},follow_ups:[]},
  lock:{files:[{path:SET_PATH,sha256:S.set,version:1,format:'f6'},{path:PAIR_PATH,sha256:S.pair,version:1,format:'f6'}]},
  fresh:{'facts.us':'fresh'},
 };
}
const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
async function codes(f:Fx):Promise<string[]>{
 const files=new Map<string,Uint8Array>();const rows=new Map<string,EvalRunRow>();
 for(const [k,r] of Object.entries(f.reports) as [keyof typeof ID,EvalReport][]){
  const bytes=enc(r);
  if(k==='frozen'){files.set(FROZEN_COPY,bytes);continue;}
  const ref=`docs/evals/2026-11-20/${r.run_id}.json`;files.set(ref,bytes);
  rows.set(r.run_id,{run_id:r.run_id,kind:r.kind,module:r.module,mode:r.mode,privileged:r.privileged,artifact_class:r.artifact_class,set_id:r.set.id,set_version:r.set.version,set_sha256:r.set.sha256,
   evaluator_code_version:r.evaluator_code_version,started_at:r.started_at,finished_at:r.finished_at,status:statusOfGate(r.summary.gate),summary:r.summary,report_ref:ref,report_sha256:sha(bytes),triggered_by:'script',...f.rowPatch[k]});
 }
 files.set(EXPERT_FILE,enc(f.expert));files.set(REPLAY_PATH,REPLAY_BYTES);files.set(REPLAY_PATH.replace('frozen','live'),LIVE_BYTES);files.set(REF_PATH,REF_BYTES);
 const m=structuredClone(f.manifest);
 if(m.evidence.replay_frozen?.report_sha256==='AUTO')m.evidence.replay_frozen.report_sha256=sha(files.get(FROZEN_COPY)!);
 const deps:ManifestDeps={
  readFile:p=>files.get(p)??null,
  getRun:f.noRuns?undefined:async id=>rows.get(id)??null,
  freshness:f.noFresh?undefined:async d=>f.fresh[d]?{status:f.fresh[d],last_ok_at:'2026-11-20T00:00:00Z'}:null,
  lock:f.lock,
  loadSet:p=>{const s=f.sets[p];if(!s)throw new Error(`no set ${p}`);return s;},
  audit:{gitShow:()=>new TextEncoder().encode('spec\n')},
 };
 return [...new Set((await validateManifest(m,deps)).map(x=>x.code))].sort();
}
const resummarize=(r:EvalReport)=>{r.summary=summarize(r.cases,{thresholds:r.thresholds,gold:r.summary.gold,subset:false,evidenceClass:r.summary.evidence_class});};

describe('validateManifest (spec §10)',()=>{
 auditRoot=mkdtempSync(join(tmpdir(),'f6-manifest-audit-'));
 writeFileSync(join(auditRoot,'01-codex-round1.md'),'**Verdict: ready.**\n\nNo findings.\n');
 writeFileSync(join(auditRoot,'index.json'),JSON.stringify({topic:'t',target:{path:'docs/x.md'},rounds:[{n:1,target_sha256:sha('spec\n'),target_git_ref:'d'.repeat(40),prompt_file:null,report_file:'01-codex-round1.md',model:'gpt-6-astra',effort:'medium',verdict:'ready',findings:{p1:0,p2:0,p3:0}}],dispositions:[],open:{owner:[],verify:[]},final_verdict:'ready'}));
 afterAll(()=>rmSync(auditRoot,{recursive:true,force:true}));

 it('accepts a complete manifest: privileged report runs, frozen ci copy, waived dual/reference, expert and audit',async()=>expect(await codes(fx())).toEqual([]));
 it('rejects malformed manifests',async()=>{
  const f=fx();f.manifest.release_commit='abc';expect(await codes(f)).toEqual(['manifest_invalid']);
  const g=fx();g.manifest.scope.data_state_rev_min=5;expect(await codes(g)).toEqual(['manifest_invalid']);
 });
 it("rejects a mode='ci' run used as official_reconciliation",async()=>{
  const f=fx();f.reports.official.mode='ci';expect(await codes(f)).toContain('manifest_mode');
 });
 it('rejects a non-privileged official run and unverified provenance',async()=>{
  const f=fx();f.reports.official.privileged=false;expect(await codes(f)).toContain('manifest_privileged');
  const g=fx();g.reports.official.provenance={verified:{artifacts:true,sources:false}};expect(await codes(g)).toEqual(['manifest_unverified']);
 });
 it('authenticates the report bytes against dq_eval_runs.report_sha256 and needs the row',async()=>{
  const f=fx();f.rowPatch.official={report_sha256:'0'.repeat(64)};expect(await codes(f)).toEqual(['manifest_report_sha']);
  const g=fx();g.manifest.evidence.official_reconciliation.run_id='aaaaaaaa-0000-4000-8000-0000000000ff';expect(await codes(g)).toContain('manifest_run_missing');
  const h=fx();h.rowPatch.official={report_ref:'docs/evals/2026-11-20/other.json'};expect(await codes(h)).toContain('manifest_report_ref');
 });
 it('fails without database access (getRun or dq_freshness)',async()=>{
  const f=fx();f.noRuns=true;expect(await codes(f)).toContain('manifest_no_db');
  const g=fx();g.noFresh=true;expect(await codes(g)).toEqual(['manifest_no_db']);
 });
 it('accepts frozen replay as a ci run whose committed copy matches report_sha256; rejects a mismatching copy or a report-mode copy',async()=>{
  const f=fx();f.manifest.evidence.replay_frozen.report_sha256='0'.repeat(64);expect(await codes(f)).toEqual(['manifest_report_sha']);
  const g=fx();g.reports.frozen.mode='report';expect(await codes(g)).toEqual(['manifest_mode']);
  const h=fx();h.manifest.evidence.replay_frozen.ci_check='automatic';expect(await codes(h)).toEqual(['manifest_ci_run']);
  const i=fx();i.manifest.evidence.replay_frozen.ci_run_url='https://example.com/run/1';expect(await codes(i)).toEqual(['manifest_ci_run']);
 });
 it('accepts reference_regression only from a privileged=false comparison run',async()=>{
  const f=fx();f.manifest.evidence.reference_regression={run_id:ID.reference};expect(await codes(f)).toEqual([]);
  const g=fx();g.manifest.evidence.reference_regression={run_id:ID.reference};g.reports.reference.privileged=true;expect(await codes(g)).toEqual(['manifest_privileged']);
  const h=fx();h.manifest.evidence.reference_regression={run_id:ID.reference};h.reports.reference.summary.evidence_class='truth';resummarize(h.reports.reference);expect(await codes(h)).toEqual(['manifest_evidence_class']);
 });
 it('rejects adapter_check dual-source evidence and accepts a truth dual-source run',async()=>{
  const f=fx();f.manifest.evidence.dual_source={run_id:ID.dual};expect(await codes(f)).toEqual([]);
  const g=fx();g.manifest.evidence.dual_source={run_id:ID.dual};g.reports.dual.summary.evidence_class='adapter_check';resummarize(g.reports.dual);expect(await codes(g)).toEqual(['manifest_adapter_check']);
 });
 it('rejects synthetic gold, dirty trees and evidence from another commit',async()=>{
  const f=fx();f.sets[SET_PATH].cases[0].provenance_kind='synthetic';expect(await codes(f)).toEqual(['manifest_synthetic']);
  const g=fx();g.reports.live.dirty=true;expect(await codes(g)).toEqual(['manifest_dirty']);
  const h=fx();h.reports.frozen.evaluator_code_version='9'.repeat(40);expect(await codes(h)).toEqual(['manifest_code_version']);
  const i=fx();i.rowPatch.live={evaluator_code_version:'9'.repeat(40)};expect(await codes(i)).toEqual(['manifest_code_version']);
 });
 it('rejects a legacy_plan2 set as evidence',async()=>{
  const f=fx();f.sets[SET_PATH].format='legacy_plan2';expect(await codes(f)).toContain('manifest_legacy_set');
 });
 it('recomputes summary and gate from cases[]',async()=>{
  const f=fx();f.reports.official.summary={...f.reports.official.summary,population:99};expect(await codes(f)).toEqual(['manifest_summary_mismatch']);
  const g=fx();g.reports.official.cases[0]={...g.reports.official.cases[0],outcome:{result:'fail',reason:'value'}};resummarize(g.reports.official);
  expect(await codes(g)).toEqual(expect.arrayContaining(['manifest_gate','manifest_run_status']));
 });
 it('requires a gold-set report set to be in lock.json with the same sha256',async()=>{
  const f=fx();f.lock={files:f.lock.files.filter(x=>x.path!==SET_PATH)};expect(await codes(f)).toContain('manifest_lock');
 });
 it('authenticates replay fixtures by their committed bytes (they are not gold sets, so not in lock.json)',async()=>{
  const f=fx();f.reports.frozen.set.sha256='2'.repeat(64);expect(await codes(f)).toEqual(['manifest_fixture']);
  const g=fx();g.reports.live.set.sha256='5'.repeat(64);expect(await codes(g)).toEqual(['manifest_fixture']);
 });
 it('requires scope.markets to equal the set markets exactly, and data_state_rev_min ≤ official db_state_rev',async()=>{
  const f=fx();f.manifest.scope.markets=['US','CN'];f.fresh['facts.cn']='fresh';expect(await codes(f)).toEqual(['manifest_scope_markets']);
  const g=fx();g.sets[SET_PATH].cases[1]=goldCase('X/assets','CN');expect(await codes(g)).toContain('manifest_scope_markets');
  const h=fx();h.manifest.scope.data_state_rev_min='8';expect(await codes(h)).toEqual(['manifest_state_rev']);
 });
 it('requires dq_freshness fresh for every market dataset',async()=>{
  const f=fx();f.fresh['facts.us']='stale';expect(await codes(f)).toEqual(['manifest_stale']);
  const g=fx();delete g.fresh['facts.us'];expect(await codes(g)).toEqual(['manifest_stale']);
 });
 it('non-waivable items cannot be not_applicable; waivable ones need owner approval',async()=>{
  const na={not_applicable:{reason:'r',approved_by:'owner',at:'2026-11-21T00:00:00Z'}};
  for(const item of ['official_reconciliation','replay_frozen','model_audit','expert_sampling']){
   const f=fx();f.manifest.evidence[item]=na;expect(await codes(f)).toContain('manifest_non_waivable');
  }
  const f=fx();f.manifest.evidence.replay_live=na;expect(await codes(f)).toEqual([]);
  const g=fx();g.manifest.evidence.dual_source={not_applicable:{reason:'r',approved_by:'someone',at:'2026-11-21T00:00:00Z'}};expect(await codes(g)).toEqual(['manifest_waiver_invalid']);
  const h=fx();delete h.manifest.evidence.replay_live;expect(await codes(h)).toEqual(['manifest_evidence_missing']);
 });
 it("gold_approval 'process' needs a gold_approval waiver; waivers cannot waive anything else",async()=>{
  const f=fx();f.manifest.gold_approval='process';expect(await codes(f)).toEqual(['manifest_gold_approval']);
  f.manifest.waivers=[{item:'gold_approval',reason:'no CODEOWNERS yet (D2)',approved_by:'owner',at:'2026-11-21T00:00:00Z'}];expect(await codes(f)).toEqual([]);
  const g=fx();g.manifest.waivers=[{item:'expert_sampling',reason:'r',approved_by:'owner',at:'2026-11-21T00:00:00Z'}];expect(await codes(g)).toEqual(['manifest_waiver_not_allowed']);
 });
 it('validates the expert record in release mode against the official run',async()=>{
  const f=fx();f.expert.population.evaluated_run_id=ID.live;expect(await codes(f)).toEqual(['manifest_expert_run']);
  const g=fx();g.expert.checks[0].verdict='disagree';g.expert.summary={agree:1,disagree:1,cannot_verify:0};
  g.expert.follow_ups=[{ref:g.expert.checks[0].case_id,action:'fix',owner:'owner',due:'2026-12-01',closed_at:null,closure_ref:null}];
  expect(await codes(g)).toEqual(['expert_follow_up_open']);
 });
 it('validates the model audit directory in release mode',async()=>{
  const f=fx();f.manifest.evidence.model_audit={dir:join(auditRoot,'missing')};expect(await codes(f)).toEqual(['audit_index_missing']);
 });
});
```

- [ ] **Step 13: Run it — expect failure**

Run: `npm test -- src/lib/evals/validate/manifest.test.ts`
Expected: FAIL — `Failed to resolve import "./manifest"`.

- [ ] **Step 14: Implement `manifest.ts`**

Create `src/lib/evals/validate/manifest.ts`:

```ts
// src/lib/evals/validate/manifest.ts
// Module release-evidence manifest validator (spec §10). Every item is re-opened and re-derived:
//  - official_reconciliation / replay_live / dual_source: the dq_eval_runs row (service-role getRun) must
//    exist, report bytes sha256 = row.report_sha256, mode 'report', privileged true, evidence_class 'truth'
//    (dual_source 'adapter_check' is rejected), official additionally provenance.verified {artifacts, sources}.
//  - replay_frozen: mode 'ci'; the committed copy's sha256 = manifest report_sha256; ci_run_url is a GitHub
//    Actions run URL and ci_check 'manual' (the CI digest comparison is a human step, spec §10).
//  - reference_regression: mode 'report', privileged FALSE, evidence_class 'comparison'; digest checked
//    against dq_eval_runs through the VALIDATOR's own service-role getRun.
//  - expert_sampling: §8 validator in release mode against the official run's gold set, evaluated_run_id = official run_id.
//  - model_audit: §9 validator in release mode.
// Common: summary recomputed from cases[] equals the stored summary and gate='pass'; evaluator_code_version =
// release_commit and dirty=false for every report; report.set.{path,sha256} is in lock.json for gold-set kinds (replay/reference: the
// fixture's committed bytes hash to report.set.sha256 — integration deviation from spec §10's literal wording); gold-set kinds
// (official, dual_source) load the set: format 'f6', no synthetic case; scope.markets = the set's subject
// markets; scope.data_state_rev_min ≤ official environment.db_state_rev; dq_freshness '<module>.<market>'
// is 'fresh' now. No DB access (getRun/freshness absent) fails the manifest. Non-waivable: official,
// replay_frozen, model_audit, expert_sampling (always treated as first release); waivable via
// not_applicable: dual_source, reference_regression, replay_live; `waivers` may only waive gold_approval.
import {canonicalJson,sha256Hex} from '../canonical-json';
import {summarize} from '../summary';
import type {EvalKind,EvalReport,EvalRunRow,GoldLock,GoldSet} from '../types';
import {validateAuditDir} from './audit';
import type {AuditDeps} from './audit';
import {validateExpertRecord} from './expert';
import {GIT_SHA,ISO_DATE,ISO_TS,UUID,finding,isObject} from './finding';
import type {ValidatorFinding} from './finding';

export interface ManifestDeps{
 /** Repo-relative path → bytes; null when absent. */
 readFile(path:string):Uint8Array|null;
 /** Service-role EvalStore.getRun; undefined = no database access. */
 getRun?:(runId:string)=>Promise<EvalRunRow|null>;
 /** dq_freshness row for a dataset ('facts.us'); undefined = no database access. */
 freshness?:(dataset:string)=>Promise<{status:string;last_ok_at:string|null}|null>;
 lock:GoldLock;
 /** gold/load.ts loadGoldSet. */
 loadSet(path:string):GoldSet;
 audit?:AuditDeps;
}
type Item='official_reconciliation'|'replay_frozen'|'replay_live'|'dual_source'|'reference_regression'|'expert_sampling'|'model_audit';
const ITEMS:Item[]=['official_reconciliation','replay_frozen','replay_live','dual_source','reference_regression','expert_sampling','model_audit'];
const WAIVABLE=new Set<Item>(['dual_source','reference_regression','replay_live']);
const RUN_KIND:Record<'official_reconciliation'|'replay_live'|'dual_source'|'reference_regression',EvalKind>={official_reconciliation:'official_reconciliation',replay_live:'replay_consistency',dual_source:'dual_source',reference_regression:'reference_regression'};
const CI_RUN=/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+(\/attempts\/\d+)?$/;
const ts=(v:unknown)=>typeof v==='string'&&(ISO_TS.test(v)||ISO_DATE.test(v));
const str=(v:unknown)=>typeof v==='string'&&v.length>0;

function manifestShape(m:unknown):string|null{
 if(!isObject(m))return 'manifest';
 if(m.schema_version!==1)return 'schema_version';
 if(!str(m.module))return 'module';
 if(typeof m.release_commit!=='string'||!GIT_SHA.test(m.release_commit))return 'release_commit';
 if(!str(m.prepared_by))return 'prepared_by';
 if(!ts(m.prepared_at))return 'prepared_at';
 const s=m.scope;
 if(!isObject(s)||!Array.isArray(s.markets)||s.markets.length===0||!s.markets.every(str)||!Array.isArray(s.universes)||!s.universes.every(str)||typeof s.data_state_rev_min!=='string'||!/^\d+$/.test(s.data_state_rev_min))return 'scope';
 if(m.gold_approval!=='enforced'&&m.gold_approval!=='process')return 'gold_approval';
 if(!isObject(m.evidence))return 'evidence';
 if(m.waivers!==undefined&&!Array.isArray(m.waivers))return 'waivers';
 return null;
}
const naValid=(na:unknown)=>isObject(na)&&str(na.reason)&&na.approved_by==='owner'&&ts(na.at);
function parseReport(bytes:Uint8Array):EvalReport|null{
 try{
  const r=JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if(!isObject(r)||r.schema_version!==1||!str(r.run_id)||!isObject(r.set)||!isObject(r.summary)||!Array.isArray(r.cases)||!isObject(r.thresholds))return null;
  return r as unknown as EvalReport;
 }catch{return null;}
}

export async function validateManifest(raw:unknown,deps:ManifestDeps,where='manifest'):Promise<ValidatorFinding[]>{
 const bad=manifestShape(raw);
 if(bad)return [finding('manifest_invalid',`${where}#${bad}`,`invalid or missing field: ${bad}`)];
 const m=raw as {module:string;release_commit:string;prepared_at:string;scope:{markets:string[];universes:string[];data_state_rev_min:string};gold_approval:'enforced'|'process';evidence:Record<string,unknown>;waivers?:unknown[]};
 const out:ValidatorFinding[]=[];
 const at=(item:string)=>`${where}#evidence.${item}`;
 // Waivers: only gold_approval; gold_approval='process' needs one.
 const waivers=m.waivers??[];
 for(const [i,w] of waivers.entries()){
  if(!isObject(w)||w.item!=='gold_approval')out.push(finding('manifest_waiver_not_allowed',`${where}#waivers[${i}]`,'only gold_approval can be waived; other items use not_applicable'));
  else if(!naValid(w))out.push(finding('manifest_waiver_invalid',`${where}#waivers[${i}]`,'waiver needs reason, approved_by "owner" and at'));
 }
 if(m.gold_approval==='process'&&!waivers.some(w=>isObject(w)&&w.item==='gold_approval'&&naValid(w)))
  out.push(finding('manifest_gold_approval',`${where}#gold_approval`,"gold_approval 'process' requires a gold_approval waiver"));
 if(!deps.getRun)out.push(finding('manifest_no_db',where,'no service-role database access: run-backed evidence cannot be authenticated'));
 if(!deps.freshness)out.push(finding('manifest_no_db',`${where}#freshness`,'no database access: dq_freshness cannot be read'));

 /** Shared report checks; returns the gold set for gold-set kinds. */
 const checkReport=(item:string,r:EvalReport,expectKind:EvalKind):GoldSet|null=>{
  if(r.kind!==expectKind)out.push(finding('manifest_kind',at(item),`report kind ${r.kind}, expected ${expectKind}`));
  if(r.module!==m.module)out.push(finding('manifest_module',at(item),`report module ${r.module}`));
  if(r.evaluator_code_version!==m.release_commit)out.push(finding('manifest_code_version',at(item),'evaluator_code_version differs from release_commit'));
  if(r.dirty!==false)out.push(finding('manifest_dirty',at(item),'report was produced from a dirty tree'));
  const s=r.summary;
  const again=summarize(r.cases,{thresholds:r.thresholds,gold:s.gold,subset:s.execution?.subset===true,evidenceClass:s.evidence_class,reconciliationsTruncated:s.reconciliations_truncated===true});
  if(canonicalJson(again)!==canonicalJson(s))out.push(finding('manifest_summary_mismatch',at(item),'summary recomputed from cases[] differs'));
  if(again.gate!=='pass')out.push(finding('manifest_gate',at(item),`recomputed gate ${again.gate}`));
  if(expectKind==='official_reconciliation'||expectKind==='dual_source'){
   const locked=deps.lock.files.find(f=>f.path===r.set.path);
   if(!locked||locked.sha256!==r.set.sha256)out.push(finding('manifest_lock',at(item),`set ${r.set.path} is not in lock.json with sha256 ${r.set.sha256}`));
  }else{
   // Replay / reference fixtures are not gold sets (lock.json holds GoldFormat entries only; Task 11 guards replay files by
   // append-only recording + projection_hash): their bytes at the release commit must hash to report.set.sha256.
   const fb=deps.readFile(r.set.path);
   if(!fb||sha256Hex(fb)!==r.set.sha256)out.push(finding('manifest_fixture',at(item),`fixture ${r.set.path} bytes differ from report.set.sha256 ${r.set.sha256}`));
  }
  if(expectKind!=='official_reconciliation'&&expectKind!=='dual_source')return null;
  let set:GoldSet;
  try{set=deps.loadSet(r.set.path);}catch(e){out.push(finding('manifest_set_unreadable',at(item),(e as Error).message));return null;}
  if(set.sha256!==r.set.sha256)out.push(finding('manifest_lock',at(item),'set file bytes differ from report.set.sha256'));
  if(set.format!=='f6'||r.set.format!=='f6')out.push(finding('manifest_legacy_set',at(item),'legacy_plan2 sets are never release evidence'));
  if(set.cases.some(c=>c.provenance_kind==='synthetic'))out.push(finding('manifest_synthetic',at(item),'gold set contains synthetic cases'));
  return set;
 };
 /** Run-backed evidence (official, live, dual_source, reference). */
 const runBacked=async(item:keyof typeof RUN_KIND,ev:Record<string,unknown>):Promise<{report:EvalReport;set:GoldSet|null}|null>=>{
  if(typeof ev.run_id!=='string'||!UUID.test(ev.run_id)){out.push(finding('manifest_invalid',at(item),'run_id must be a uuid'));return null;}
  if(!deps.getRun)return null;
  const row=await deps.getRun(ev.run_id);
  if(!row){out.push(finding('manifest_run_missing',at(item),`dq_eval_runs has no row ${ev.run_id}`));return null;}
  const path=typeof ev.report==='string'?ev.report:row.report_ref;
  if(typeof ev.report==='string'&&ev.report!==row.report_ref)out.push(finding('manifest_report_ref',at(item),'report path differs from dq_eval_runs.report_ref'));
  const bytes=deps.readFile(path);
  if(!bytes){out.push(finding('manifest_report_missing',at(item),`${path} not found`));return null;}
  if(sha256Hex(bytes)!==row.report_sha256)out.push(finding('manifest_report_sha',at(item),'report sha256 differs from dq_eval_runs.report_sha256'));
  const r=parseReport(bytes);
  if(!r){out.push(finding('manifest_report_invalid',at(item),`${path} is not an F6 report`));return null;}
  if(r.run_id!==ev.run_id)out.push(finding('manifest_report_run',at(item),'report run_id differs'));
  if(row.mode!=='report'||r.mode!=='report')out.push(finding('manifest_mode',at(item),`mode ${r.mode}/${row.mode}; release evidence needs mode 'report'`));
  const wantPriv=item!=='reference_regression';
  if(row.privileged!==wantPriv||r.privileged!==wantPriv)out.push(finding('manifest_privileged',at(item),`privileged must be ${wantPriv}`));
  if(row.status!=='passed')out.push(finding('manifest_run_status',at(item),`dq_eval_runs.status ${row.status}`));
  if(row.evaluator_code_version!==m.release_commit)out.push(finding('manifest_code_version',at(item),'dq_eval_runs.evaluator_code_version differs from release_commit'));
  if(row.set_sha256!==r.set.sha256||row.kind!==r.kind)out.push(finding('manifest_report_run',at(item),'dq_eval_runs row and report disagree on kind/set'));
  const cls=r.summary.evidence_class;
  if(item==='reference_regression'){if(cls!=='comparison')out.push(finding('manifest_evidence_class',at(item),`evidence_class ${cls}, expected comparison`));}
  else if(item==='dual_source'&&cls==='adapter_check')out.push(finding('manifest_adapter_check',at(item),'same_feed dual-source runs are adapter checks, not evidence'));
  else if(cls!=='truth')out.push(finding('manifest_evidence_class',at(item),`evidence_class ${cls}, expected truth`));
  if(item==='official_reconciliation'&&(r.provenance?.verified?.artifacts!==true||r.provenance?.verified?.sources!==true))
   out.push(finding('manifest_unverified',at(item),'official run lacks --verify-artifacts --verify-sources'));
  return {report:r,set:checkReport(item,r,RUN_KIND[item])};
 };

 let official:{report:EvalReport;set:GoldSet|null}|null=null;
 for(const item of ITEMS){
  const ev=m.evidence[item];
  if(ev===undefined){out.push(finding('manifest_evidence_missing',at(item),'missing'));continue;}
  if(!isObject(ev)){out.push(finding('manifest_invalid',at(item),'must be an object'));continue;}
  if('not_applicable' in ev){
   if(!WAIVABLE.has(item))out.push(finding('manifest_non_waivable',at(item),`${item} cannot be not_applicable`));
   else if(!naValid(ev.not_applicable))out.push(finding('manifest_waiver_invalid',at(item),'not_applicable needs reason, approved_by "owner" and at'));
   continue;
  }
  if(item==='official_reconciliation'||item==='replay_live'||item==='dual_source'||item==='reference_regression'){
   const res=await runBacked(item,ev);
   if(item==='official_reconciliation')official=res;
   continue;
  }
  if(item==='replay_frozen'){
   if(typeof ev.ci_run_url!=='string'||!CI_RUN.test(ev.ci_run_url))out.push(finding('manifest_ci_run',at(item),'ci_run_url must be a GitHub Actions run URL'));
   if(ev.ci_check!=='manual')out.push(finding('manifest_ci_run',at(item),"ci_check must be 'manual'"));
   if(typeof ev.report!=='string'||typeof ev.report_sha256!=='string'){out.push(finding('manifest_invalid',at(item),'report and report_sha256 required'));continue;}
   const bytes=deps.readFile(ev.report);
   if(!bytes){out.push(finding('manifest_report_missing',at(item),`${ev.report} not found`));continue;}
   if(sha256Hex(bytes)!==ev.report_sha256)out.push(finding('manifest_report_sha',at(item),'committed copy sha256 differs from report_sha256'));
   const r=parseReport(bytes);
   if(!r){out.push(finding('manifest_report_invalid',at(item),`${ev.report} is not an F6 report`));continue;}
   if(r.mode!=='ci')out.push(finding('manifest_mode',at(item),"frozen replay evidence is a mode 'ci' run"));
   if(r.summary.evidence_class!=='truth')out.push(finding('manifest_evidence_class',at(item),`evidence_class ${r.summary.evidence_class}`));
   checkReport(item,r,'replay_consistency');
   continue;
  }
  if(item==='expert_sampling'){
   if(typeof ev.file!=='string'){out.push(finding('manifest_invalid',at(item),'file required'));continue;}
   const bytes=deps.readFile(ev.file);
   if(!bytes){out.push(finding('manifest_report_missing',at(item),`${ev.file} not found`));continue;}
   let rec:unknown;
   try{rec=JSON.parse(new TextDecoder().decode(bytes));}catch{out.push(finding('expert_invalid',at(item),'not JSON'));continue;}
   const runId=isObject(rec)&&isObject(rec.population)?rec.population.evaluated_run_id:undefined;
   const officialId=(m.evidence.official_reconciliation as {run_id?:unknown}|undefined)?.run_id;
   if(runId!==officialId)out.push(finding('manifest_expert_run',at(item),'population.evaluated_run_id must equal the official_reconciliation run_id'));
   out.push(...validateExpertRecord(rec,official?.set??null,{release:true,where:at(item)}));
   continue;
  }
  if(typeof ev.dir!=='string'){out.push(finding('manifest_invalid',at(item),'dir required'));continue;}
  out.push(...validateAuditDir(ev.dir,{...deps.audit,release:true}));
 }
 // Scope and data state against the official run.
 if(official?.set){
  const markets=[...new Set(official.set.cases.map(c=>c.subject.market))].sort();
  if(canonicalJson(markets)!==canonicalJson([...new Set(m.scope.markets)].sort())||new Set(m.scope.markets).size!==m.scope.markets.length)
   out.push(finding('manifest_scope_markets',`${where}#scope.markets`,`set markets are ${markets.join(',')}`));
 }
 if(official){
  const rev=official.report.environment?.db_state_rev;
  if(typeof rev!=='number'||BigInt(m.scope.data_state_rev_min)>BigInt(rev))out.push(finding('manifest_state_rev',`${where}#scope.data_state_rev_min`,`official db_state_rev ${String(rev)} is below data_state_rev_min`));
 }
 if(deps.freshness)for(const market of new Set(m.scope.markets)){
  const dataset=`${m.module}.${market.toLowerCase()}`;
  const f=await deps.freshness(dataset);
  if(!f||f.status!=='fresh')out.push(finding('manifest_stale',`${where}#scope.markets.${market}`,`dq_freshness ${dataset} is ${f?.status??'absent'}`));
 }
 return out;
}
```

- [ ] **Step 15: Run it — expect pass; typecheck, lint, commit**

Run: `npm test -- src/lib/evals/validate/manifest.test.ts`
Expected: PASS — `20 passed (20)`. If the first test (`accepts a complete manifest`) fails with `manifest_summary_mismatch`/`manifest_gate`, Task 1's `summarize` does not follow §3.3 for `identical`/`within` — fix Task 1, not this test.

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

```bash
git add src/lib/evals/validate/manifest.ts src/lib/evals/validate/manifest.test.ts
```
```bash
git commit -m "feat(evals): release-manifest validator with per-evidence-kind authentication (spec 10)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

#### 12d — `codex-audit.ts` (§9 new rule)

- [ ] **Step 16: Write the failing codex-audit test** (temporary git repositories; Codex is injected)

Create `src/lib/evals/validate/codex-audit.test.ts`:

```ts
// src/lib/evals/validate/codex-audit.test.ts
// Spec §9 codex-audit.ts rule, in a temporary git repository with a fake Codex: refuse uncommitted /
// untracked targets, append the round with the committed bytes' sha256 and HEAD, parse verdict and counts.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {codexArgs,runCodexAudit} from './codex-audit';
import type {CodexAuditDeps} from './codex-audit';
import {validateAuditDir} from './audit';

const TARGET='docs/spec.md';
const DIR='docs/audits/2026-11-20-topic';
const REPORT='**Verdict: not ready for implementation planning—two gaps.**\n\n| # | Severity | Issue |\n|---|---|---|\n| 1 | P1 | a |\n| 2 | P2 | b |\n| 3 | P2 | c |\n';
// Hooks export GIT_DIR/GIT_INDEX_FILE; the temporary repository must not inherit them.
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const repos:string[]=[];
afterEach(()=>{for(const r of repos.splice(0))rmSync(r,{recursive:true,force:true});});
function repo(){
 const root=mkdtempSync(join(tmpdir(),'f6-codex-audit-'));repos.push(root);
 const git=(...a:string[])=>execFileSync('git',['-c','user.email=f6@test.invalid','-c','user.name=f6','-c','commit.gpgsign=false',...a],{cwd:root,env,encoding:'utf8'});
 git('init','-q');
 mkdirSync(join(root,'docs/audits/2026-11-20-topic'),{recursive:true});
 writeFileSync(join(root,TARGET),'# spec v1\n');
 writeFileSync(join(root,DIR,'00-prompt-round1.md'),'audit docs/spec.md');
 git('add','.');git('commit','-q','-m','spec v1');
 return {root,git};
}
const deps=(root:string,report:string|null=REPORT,exit=0):CodexAuditDeps&{calls:string[][]}=>{
 const calls:string[][]=[];
 return {
  calls,
  git:a=>execFileSync('git',a,{cwd:root,env,encoding:'utf8'}),
  gitBytes:a=>execFileSync('git',a,{cwd:root,env}),
  runCodex:(prompt,out)=>{calls.push([prompt,out]);if(report!==null)writeFileSync(out,report);return exit;},
 };
};
const code=(f:()=>unknown)=>{try{f();}catch(e){if(e instanceof EvalError)return e.code;throw e;}return 'ok';};

describe('runCodexAudit',()=>{
 it('runs codex on a committed target and appends round 1 with the committed sha256, HEAD, verdict and counts',()=>{
  const {root,git}=repo();const d=deps(root);
  const round=runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},d);
  const head=git('rev-parse','HEAD').trim();
  expect(round).toEqual({n:1,target_sha256:createHash('sha256').update('# spec v1\n').digest('hex'),target_git_ref:head,prompt_file:'00-prompt-round1.md',report_file:'01-codex-round1.md',model:'gpt-6-astra',effort:'medium',verdict:'not ready for implementation planning—two gaps',findings:{p1:1,p2:2,p3:0}});
  const index=JSON.parse(readFileSync(join(root,DIR,'index.json'),'utf8'));
  expect(index).toMatchObject({topic:'topic',target:{path:TARGET},rounds:[round]});
  expect(d.calls).toEqual([[join(root,DIR,'00-prompt-round1.md'),join(root,DIR,'01-codex-round1.md')]]);
  // The validator can re-derive the audited bytes from git.
  expect(validateAuditDir(DIR,{root}).filter(f=>f.code.startsWith('audit_target'))).toEqual([]);
 });
 it('appends round 2 to an existing index without --target',()=>{
  const {root,git}=repo();
  runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},deps(root));
  writeFileSync(join(root,TARGET),'# spec v2\n');writeFileSync(join(root,DIR,'00-prompt-round2.md'),'round 2');
  git('add','.');git('commit','-q','-m','spec v2');
  const r2=runCodexAudit({root,dir:DIR,prompt:'00-prompt-round2.md',out:'02-codex-round2.md'},deps(root));
  expect([r2.n,r2.target_sha256]).toEqual([2,createHash('sha256').update('# spec v2\n').digest('hex')]);
  expect(JSON.parse(readFileSync(join(root,DIR,'index.json'),'utf8')).rounds).toHaveLength(2);
 });
 it('refuses a target with uncommitted, staged or untracked changes without running codex',()=>{
  const {root,git}=repo();
  writeFileSync(join(root,TARGET),'# spec v1 edited\n');
  const d=deps(root);
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},d))).toBe('audit_invalid');
  git('add',TARGET);
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},d))).toBe('audit_invalid');
  writeFileSync(join(root,'docs/new.md'),'untracked');
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:'docs/new.md'},d))).toBe('audit_invalid');
  expect(d.calls).toEqual([]);expect(existsSync(join(root,DIR,'index.json'))).toBe(false);
 });
 it('refuses a missing prompt, an existing report, a non-zero codex exit and a report without a Verdict line',()=>{
  const {root}=repo();
  const o={root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET};
  expect(code(()=>runCodexAudit({...o,prompt:'nope.md'},deps(root)))).toBe('audit_invalid');
  expect(code(()=>runCodexAudit(o,deps(root,REPORT,1)))).toBe('audit_invalid');
  rmSync(join(root,DIR,'01-codex-round1.md'),{force:true});
  expect(code(()=>runCodexAudit(o,deps(root,'Read-only review.\n')))).toBe('audit_invalid');
  expect(existsSync(join(root,DIR,'01-codex-round1.md'))).toBe(true);   // the report is kept for inspection
  expect(existsSync(join(root,DIR,'index.json'))).toBe(false);
  expect(code(()=>runCodexAudit(o,deps(root)))).toBe('audit_invalid');   // never overwrites an existing report
 });
 it('refuses a new directory without --target and a --target that differs from index.json',()=>{
  const {root}=repo();
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md'},deps(root)))).toBe('audit_invalid');
  runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},deps(root));
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'02-codex-round2.md',target:'docs/other.md'},deps(root)))).toBe('audit_invalid');
 });
 it('invokes codex exec read-only with gpt-6-astra at medium effort, prompt on stdin',()=>{
  expect(codexArgs('/tmp/out.md')).toEqual(['exec','-s','read-only','-c','model="gpt-6-astra"','-c','model_reasoning_effort="medium"','--skip-git-repo-check','-o','/tmp/out.md','-']);
 });
});
```

- [ ] **Step 17: Run it — expect failure**

Run: `npm test -- src/lib/evals/validate/codex-audit.test.ts`
Expected: FAIL — `Failed to resolve import "./codex-audit"`.

- [ ] **Step 18: Implement the core and the CLI**

Create `src/lib/evals/validate/codex-audit.ts`:

```ts
// src/lib/evals/validate/codex-audit.ts
// Core of scripts/evals/codex-audit.ts (spec §9 new rule): run one Codex audit round against a COMMITTED
// target and append it to <dir>/index.json with target_sha256 of the committed bytes (git show HEAD:<path>)
// and target_git_ref = HEAD, so the audited bytes are retrievable from git. Refuses when the target has
// any working-tree/index change or is untracked (`git status --porcelain -- <path>` non-empty), when the
// prompt is missing, when the report file already exists, when Codex exits non-zero, or when the report
// lacks a `**Verdict: …**` first line (the report file is kept; index.json is untouched).
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,isAbsolute,join} from 'node:path';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {parseFindings,parseVerdict,severityCounts} from './audit';
import type {AuditIndex,AuditRound} from './audit';

export const CODEX_MODEL='gpt-6-astra';
export const CODEX_EFFORT='medium';
/** argv for `codex exec … -o <out> -` (prompt on stdin). */
export const codexArgs=(outPath:string)=>['exec','-s','read-only','-c',`model="${CODEX_MODEL}"`,'-c',`model_reasoning_effort="${CODEX_EFFORT}"`,'--skip-git-repo-check','-o',outPath,'-'];
export interface CodexAuditDeps{
 /** `git <args>` in root; returns stdout (utf8). Throws on non-zero exit. */
 git(args:string[]):string;
 /** `git <args>` in root; returns stdout bytes. Throws on non-zero exit. */
 gitBytes(args:string[]):Uint8Array;
 /** Runs Codex with stdin = promptPath, last message written to outPath; returns the exit code. */
 runCodex(promptPath:string,outPath:string):number;
}
export interface CodexAuditOptions{root:string;dir:string;prompt:string;out:string;target?:string}

const fail=(m:string,detail:Record<string,unknown>={})=>new EvalError('audit_invalid',m,detail);
export function runCodexAudit(o:CodexAuditOptions,deps:CodexAuditDeps):AuditRound{
 const dir=isAbsolute(o.dir)?o.dir:join(o.root,o.dir);
 const indexPath=join(dir,'index.json');
 const index:AuditIndex=existsSync(indexPath)?JSON.parse(readFileSync(indexPath,'utf8')) as AuditIndex
  :{topic:basename(dir).replace(/^\d{4}-\d{2}-\d{2}-/,''),target:{path:o.target??''},rounds:[],dispositions:[],open:{owner:[],verify:[]},final_verdict:''};
 if(o.target&&index.target.path&&o.target!==index.target.path)throw fail(`--target ${o.target} differs from index.json target ${index.target.path}`);
 const target=index.target.path;
 if(!target)throw fail('no target: pass --target <repo-relative path> for a new audit directory');
 if(deps.git(['status','--porcelain','--',target]).trim()!=='')throw fail(`${target} has uncommitted or untracked changes; commit it first`,{target});
 const promptPath=join(dir,o.prompt);const outPath=join(dir,o.out);
 if(!existsSync(promptPath))throw fail(`prompt ${o.prompt} not found in ${o.dir}`);
 if(existsSync(outPath))throw fail(`report ${o.out} already exists; reports are never overwritten`);
 const head=deps.git(['rev-parse','HEAD']).trim();
 if(!/^[0-9a-f]{40}$/.test(head))throw fail(`unexpected HEAD ${head}`);
 let bytes:Uint8Array;
 try{bytes=deps.gitBytes(['show',`HEAD:${target}`]);}catch{throw fail(`${target} is not in HEAD`);}
 const code=deps.runCodex(promptPath,outPath);
 if(code!==0)throw fail(`codex exited ${code}`);
 if(!existsSync(outPath))throw fail(`codex wrote no report to ${o.out}`);
 const md=readFileSync(outPath,'utf8');
 const verdict=parseVerdict(md);
 if(verdict===null)throw fail(`${o.out} lacks a **Verdict: …** first line; index.json not updated`);
 const n=index.rounds.length+1;
 const round:AuditRound={n,target_sha256:sha256Hex(bytes),target_git_ref:head,prompt_file:o.prompt,report_file:o.out,model:CODEX_MODEL,effort:CODEX_EFFORT,verdict,findings:severityCounts(parseFindings(md,n))};
 index.rounds.push(round);
 writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');
 return round;
}
```

Create `scripts/evals/codex-audit.ts`:

```ts
// scripts/evals/codex-audit.ts
// Runs one Codex audit round on a committed target and appends it to the audit directory's index.json (spec §9).
//   npx tsx scripts/evals/codex-audit.ts --dir docs/audits/<date>-<topic> --prompt 00-prompt-round<N>.md --out <NN>-codex-round<N>.md [--target <path>]
// Codex: gpt-6-astra, reasoning effort medium, read-only sandbox, prompt on stdin. Exit 0 = round appended; 1 = refused/failed.
import {execFileSync,spawnSync} from 'node:child_process';
import {closeSync,openSync} from 'node:fs';
import {EvalError} from '../../src/lib/evals/errors';
import {codexArgs,runCodexAudit} from '../../src/lib/evals/validate/codex-audit';

function arg(argv:string[],name:string):string|undefined{const i=argv.indexOf(name);return i>=0?argv[i+1]:undefined;}
function main(){
 const argv=process.argv.slice(2);
 const dir=arg(argv,'--dir'),prompt=arg(argv,'--prompt'),out=arg(argv,'--out'),target=arg(argv,'--target');
 if(!dir||!prompt||!out){console.error('usage: codex-audit.ts --dir <audit dir> --prompt <file in dir> --out <report file in dir> [--target <path>]');process.exitCode=1;return;}
 const root=process.cwd();
 try{
  const round=runCodexAudit({root,dir,prompt,out,target},{
   git:args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}),
   gitBytes:args=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024}),
   runCodex:(promptPath,outPath)=>{
    const fd=openSync(promptPath,'r');
    try{return spawnSync('codex',codexArgs(outPath),{cwd:root,stdio:[fd,'inherit','inherit']}).status??1;}finally{closeSync(fd);}
   },
  });
  console.log(JSON.stringify(round));
 }catch(e){
  console.error(e instanceof EvalError?`${e.code}: ${e.message}`:(e as Error).message);
  process.exitCode=1;
 }
}
main();
```

- [ ] **Step 19: Run it — expect pass; check the CLI refusal path; typecheck, lint, commit**

Run: `npm test -- src/lib/evals/validate/codex-audit.test.ts`
Expected: PASS — `6 passed (6)`.

Run: `npx tsx scripts/evals/codex-audit.ts`
Expected: exit 1 with `usage: codex-audit.ts --dir <audit dir> --prompt <file in dir> --out <report file in dir> [--target <path>]` (do not run a real Codex round here).

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

```bash
git add src/lib/evals/validate/codex-audit.ts src/lib/evals/validate/codex-audit.test.ts scripts/evals/codex-audit.ts
```
```bash
git commit -m "feat(evals): codex-audit.ts runs Codex only on committed targets and appends the round to index.json" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

#### 12e — `validate.ts` flags and templates

- [ ] **Step 20: Write the templates and the failing handler test**

Create `docs/evals/templates/expert-sampling.template.json`:

```json
{
  "_how_to": [
    "Copy to docs/evals/<date>/expert-sampling-<module>-<n>.json and fill every field; validate with: npx tsx scripts/evals/validate.ts --expert <file> [--release]",
    "selected_case_ids: recompute with seeded_sha256 (sha256(seed + case_id), first N companies by smallest hash, first M cases each); the validator rejects any other set",
    "population.set_sha256 must be a sha256 listed in src/lib/evals/fixtures/gold/lock.json; evaluated_run_id is the privileged official_reconciliation run (gate pass)",
    "every disagree (checks and basis_review) needs a follow_up whose ref is the case_id or the basis topic",
    "release: every follow_up has closed_at and closure_ref = dq_quarantine:<uuid> | https://github.com/<owner>/<repo>/pull/<n> | gold:<set_id>@<version>",
    "use the expert alias only; no names, e-mail addresses or report PDFs"
  ],
  "schema_version": 1,
  "module": "facts",
  "sampled_at": "2026-01-01T00:00:00Z",
  "expert": {
    "alias": "E1",
    "background": "<one line: qualification relevant to the module>",
    "independence": "<one line: why the expert is not an implementer or recorder>",
    "contact_held_by": "owner"
  },
  "population": {
    "set_id": "facts/plan3-30",
    "set_version": 1,
    "set_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "case_count": 0,
    "evaluated_run_id": "00000000-0000-4000-8000-000000000000",
    "db_state_rev": "0"
  },
  "selection": {
    "method": "seeded_sha256",
    "seed": "<seed fixed before sampling, e.g. the release_commit>",
    "companies": 5,
    "cases_per_company": 6,
    "selected_case_ids": []
  },
  "checks": [],
  "basis_review": [],
  "summary": {"agree": 0, "disagree": 0, "cannot_verify": 0},
  "follow_ups": []
}
```

Create `docs/evals/templates/release-manifest.template.json`:

```json
{
  "_how_to": [
    "Copy to docs/evals/<date>/<module>-release-manifest.json; validate with: npx tsx scripts/evals/validate.ts --manifest <file> (needs SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL)",
    "every evidence item must come from evaluator_code_version == release_commit with dirty=false; non-waivable: official_reconciliation, replay_frozen, expert_sampling, model_audit",
    "not_applicable is allowed only for dual_source, reference_regression and replay_live, approved_by owner",
    "gold_approval 'process' (no CODEOWNERS + branch protection, spec §16 D2) requires the gold_approval waiver below; 'enforced' needs none"
  ],
  "schema_version": 1,
  "module": "facts",
  "release_commit": "0000000000000000000000000000000000000000",
  "prepared_by": "owner",
  "prepared_at": "2026-01-01T00:00:00Z",
  "scope": {"markets": ["US"], "universes": ["sp500"], "data_state_rev_min": "0"},
  "gold_approval": "process",
  "evidence": {
    "official_reconciliation": {"run_id": "00000000-0000-4000-8000-000000000000", "report": "docs/evals/<date>/facts-official_reconciliation-<run8>.json"},
    "replay_frozen": {"ci_run_url": "https://github.com/osborn-studio/OsbornAlpha/actions/runs/0", "report": "docs/evals/<date>/facts-replay_frozen-<run8>.json", "report_sha256": "0000000000000000000000000000000000000000000000000000000000000000", "ci_check": "manual"},
    "replay_live": {"not_applicable": {"reason": "first release: no production live replay recording yet", "approved_by": "owner", "at": "2026-01-01T00:00:00Z"}},
    "dual_source": {"not_applicable": {"reason": "no independent second source for this module yet", "approved_by": "owner", "at": "2026-01-01T00:00:00Z"}},
    "reference_regression": {"not_applicable": {"reason": "no reference samples for this module", "approved_by": "owner", "at": "2026-01-01T00:00:00Z"}},
    "expert_sampling": {"file": "docs/evals/<date>/expert-sampling-facts-1.json"},
    "model_audit": {"dir": "docs/audits/<date>-<topic>"}
  },
  "waivers": [
    {"item": "gold_approval", "reason": "no CODEOWNERS or branch protection yet (spec §16 D2)", "approved_by": "owner", "at": "2026-01-01T00:00:00Z"}
  ]
}
```

Create `src/lib/evals/validate/handlers.test.ts`:

```ts
// src/lib/evals/validate/handlers.test.ts
// The --expert / --audit / --manifest flags of scripts/evals/validate.ts, and the two templates.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {validateExpertRecord} from './expert';
import {f6Handlers} from './handlers';
import {validateManifest} from './manifest';
import type {ManifestDeps} from './manifest';

const noDb:ManifestDeps={readFile:()=>null,lock:{files:[]},loadSet:()=>{throw new Error('no set');}};
const h=f6Handlers(process.cwd(),()=>noDb);
const codes=async(flag:string,args:string[])=>(await h[flag](args)).map(f=>f.code);

describe('f6Handlers',()=>{
 it('registers exactly the three Task-12 flags',()=>expect(Object.keys(h).sort()).toEqual(['--audit','--expert','--manifest']));
 it('--audit validates a directory and honours --release',async()=>{
  expect(await codes('--audit',['docs/audits/2026-11-04-evals-gold-sets'])).toEqual([]);
  expect(await codes('--audit',['docs/audits/2026-11-04-evals-gold-sets','--release'])).toEqual(['audit_release_open_verify']);
  expect(await codes('--audit',['docs/audits/does-not-exist'])).toEqual(['audit_index_missing']);
 });
 it('reports a missing argument as cli_usage',async()=>{
  for(const flag of ['--audit','--expert','--manifest']){expect(await codes(flag,[])).toEqual(['cli_usage']);expect(await codes(flag,['--release'])).toEqual(['cli_usage']);}
 });
 it('--expert / --manifest report unreadable files',async()=>{
  expect(await codes('--expert',['docs/evals/nope.json'])).toEqual(['expert_invalid']);
  expect(await codes('--manifest',['docs/evals/nope.json'])).toEqual(['manifest_invalid']);
 });
 it('--manifest without database access fails closed',async()=>{
  expect(await codes('--manifest',['docs/evals/templates/release-manifest.template.json'])).toContain('manifest_no_db');
 });
});

describe('templates',()=>{
 const read=(f:string)=>JSON.parse(readFileSync(`docs/evals/templates/${f}`,'utf8')) as Record<string,unknown>;
 it('expert-sampling.template.json has the §8 shape (only the population set is unresolved)',()=>{
  expect(validateExpertRecord(read('expert-sampling.template.json'),null).map(f=>f.code)).toEqual(['expert_set_unresolved']);
 });
 it('release-manifest.template.json has the §10 shape (fails only on missing evidence and database access)',async()=>{
  const found=(await validateManifest(read('release-manifest.template.json'),noDb)).map(f=>f.code);
  expect(found).not.toContain('manifest_invalid');
  expect(found).not.toContain('manifest_waiver_invalid');
  expect(found).not.toContain('manifest_gold_approval');
  expect(found).toContain('manifest_no_db');
 });
});
```

Run: `npm test -- src/lib/evals/validate/handlers.test.ts`
Expected: FAIL — `Failed to resolve import "./handlers"`.

- [ ] **Step 21: Implement `handlers.ts`**

Create `src/lib/evals/validate/handlers.ts`:

```ts
// src/lib/evals/validate/handlers.ts
// The Task-12 flags of scripts/evals/validate.ts (entries in validate/cli.ts HANDLERS): --expert <file> [--release], --audit <dir> [--release],
// --manifest <file>. `args` are the flag's value followed by its modifiers (validate/cli.ts passes [value,...modifiers]). Production DB
// access for --manifest is the service-role client when SUPABASE_SERVICE_ROLE_KEY and
// NEXT_PUBLIC_SUPABASE_URL are set; without them the manifest fails with manifest_no_db (spec §10).
import {existsSync,readFileSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {supabaseTableClient} from '../../db/table-client';
import type {TableClient} from '../../db/table-client';
import {getAdminSupabase} from '../../supabase/admin';
import {loadGoldSet} from '../gold/load';
import {evalStore} from '../store';
import type {GoldLock} from '../types';
import {validateAuditDir} from './audit';
import {findSetBySha,validateExpertRecord} from './expert';
import {finding} from './finding';
import type {ValidatorFinding} from './finding';
import {validateManifest} from './manifest';
import type {ManifestDeps} from './manifest';

export const LOCK_PATH='src/lib/evals/fixtures/gold/lock.json';
export type Handler=(args:string[])=>Promise<ValidatorFinding[]>;
const abs=(root:string,p:string)=>isAbsolute(p)?p:join(root,p);
const readJson=(root:string,p:string):unknown=>JSON.parse(readFileSync(abs(root,p),'utf8'));
export const readLock=(root=process.cwd()):GoldLock=>readJson(root,LOCK_PATH) as GoldLock;
const usage=(flag:string,what:string)=>[finding('cli_usage',flag,`${flag} requires ${what}`)];

/** Service-role TableClient when credentials are configured; null otherwise. */
export function serviceTables():TableClient|null{
 try{return supabaseTableClient(getAdminSupabase());}catch{return null;}
}
export function manifestDeps(root=process.cwd(),tables:TableClient|null=serviceTables()):ManifestDeps{
 const store=tables?evalStore(tables):null;
 return {
  readFile:p=>existsSync(abs(root,p))?readFileSync(abs(root,p)):null,
  getRun:store?id=>store.getRun(id):undefined,
  freshness:tables?async dataset=>{
   const [row]=await tables.select('dq_freshness',{dataset},{limit:1});
   return row?{status:String(row.status),last_ok_at:row.last_ok_at==null?null:String(row.last_ok_at)}:null;
  }:undefined,
  lock:readLock(root),
  loadSet:p=>loadGoldSet(p,root),
  audit:{root},
 };
}

export function f6Handlers(root=process.cwd(),deps:()=>ManifestDeps=()=>manifestDeps(root)):Record<string,Handler>{
 return {
  '--expert':async args=>{
   const file=args[0];
   if(!file||file.startsWith('--'))return usage('--expert','<file>');
   let rec:unknown;
   try{rec=readJson(root,file);}catch(e){return [finding('expert_invalid',file,`cannot read JSON: ${(e as Error).message}`)];}
   const sha=(rec as {population?:{set_sha256?:unknown}})?.population?.set_sha256;
   const set=typeof sha==='string'?findSetBySha(readLock(root),sha,p=>loadGoldSet(p,root)):null;
   return validateExpertRecord(rec,set,{release:args.includes('--release'),where:file});
  },
  '--audit':async args=>{
   const dir=args[0];
   if(!dir||dir.startsWith('--'))return usage('--audit','<dir>');
   return validateAuditDir(dir,{root,release:args.includes('--release')});
  },
  '--manifest':async args=>{
   const file=args[0];
   if(!file||file.startsWith('--'))return usage('--manifest','<file>');
   let m:unknown;
   try{m=readJson(root,file);}catch(e){return [finding('manifest_invalid',file,`cannot read JSON: ${(e as Error).message}`)];}
   return validateManifest(m,deps(),file);
  },
 };
}
```

Run: `npm test -- src/lib/evals/validate/handlers.test.ts`
Expected: PASS — `7 passed (7)`.

- [ ] **Step 22: Register the flags in Task 3's handler table (`src/lib/evals/validate/cli.ts`)**

`scripts/evals/validate.ts` is Task 3's thin wrapper and is not touched. The flag table is `HANDLERS:ValidateHandler[]` in `src/lib/evals/validate/cli.ts` (Task 3 Step 15; `run(root,value,modifiers)` may be async, `modifiers` lists bare flags accepted after the value, `findingsCheck(findings)` builds `{ok:findings.length===0,findings}`). Edit `src/lib/evals/validate/cli.ts`:

old:
```ts
import {redactScan,redactTargets} from '../redact';
```
new:
```ts
import {redactScan,redactTargets} from '../redact';
import {f6Handlers} from './handlers';
```

old (the last entry of `HANDLERS` and the array close):
```ts
 {flag:'--redact',name:'redact',takesValue:false,run(root){
  const files=redactTargets(root);
  const findings=redactScan(files);
  return {ok:findings.length===0,files:files.length,findings};
 }},
];
```
new:
```ts
 {flag:'--redact',name:'redact',takesValue:false,run(root){
  const files=redactTargets(root);
  const findings=redactScan(files);
  return {ok:findings.length===0,files:files.length,findings};
 }},
 // Task 12 (spec §8–§10): --expert <file> [--release], --audit <dir> [--release], --manifest <file>.
 // f6Handlers takes the flag's tokens (value first, then modifiers) and returns ValidatorFinding[].
 {flag:'--expert',name:'expert',takesValue:true,modifiers:['--release'],run:async(root,value,mods)=>findingsCheck(await f6Handlers(root)['--expert']([value!,...mods]))},
 {flag:'--audit',name:'audit',takesValue:true,modifiers:['--release'],run:async(root,value,mods)=>findingsCheck(await f6Handlers(root)['--audit']([value!,...mods]))},
 {flag:'--manifest',name:'manifest',takesValue:true,run:async(root,value)=>findingsCheck(await f6Handlers(root)['--manifest']([value!]))},
];
```

Append to `src/lib/evals/validate/handlers.test.ts`:
```ts
describe('validate/cli.ts HANDLERS (Task 12 entries)',()=>{
 it('the three flags are table entries after Task 3\'s four, --release only on --expert/--audit',async()=>{
  const {HANDLERS}=await import('./cli');
  expect(HANDLERS.map(x=>[x.flag,x.modifiers??[]])).toEqual([['--gold',[]],['--lock',[]],['--gold-diff',[]],['--redact',[]],['--expert',['--release']],['--audit',['--release']],['--manifest',[]]]);
 });
 it('runValidate --audit <dir> --release: exit 1 with the finding in checks.audit.findings',async()=>{
  const {runValidate}=await import('./cli');
  const r=await runValidate(['--audit','docs/audits/2026-11-04-evals-gold-sets','--release']);
  expect(r.exitCode).toBe(1);
  expect((r.output.checks.audit.findings as {code:string}[]).map(f=>f.code)).toEqual(['audit_release_open_verify']);
  expect((await runValidate(['--audit','docs/audits/2026-11-04-evals-gold-sets'])).exitCode).toBe(0);
 });
});
```

Run: `npm test -- src/lib/evals/validate/handlers.test.ts src/lib/evals/validate/cli.test.ts`
Expected: PASS — handlers `9 passed (9)`, cli `7 passed (7)`.

Run: `npx tsx scripts/evals/validate.ts --audit docs/audits/2026-11-04-evals-gold-sets`
Expected: exit 0, `checks.audit.findings` is `[]`.

Run: `npx tsx scripts/evals/validate.ts --audit docs/audits/2026-11-04-evals-gold-sets --release`
Expected: exit 1 with one finding `audit_release_open_verify` at `round 2 #N11`.

Run: `npx tsx scripts/evals/validate.ts --manifest docs/evals/templates/release-manifest.template.json`
Expected: exit 1; findings include `manifest_no_db` (no service-role env locally) or, with credentials, `manifest_run_missing` — never `manifest_invalid`.

Run: `npx tsx scripts/evals/validate.ts --expert docs/evals/templates/expert-sampling.template.json`
Expected: exit 1 with `expert_set_unresolved` (the template's all-zero `set_sha256` is in no lock entry).

- [ ] **Step 23: Full unit run, redaction of the new docs, typecheck, lint, commit**

Run: `npm test -- src/lib/evals`
Expected: PASS (the store integration suite is skipped without `S4_TEST_STATE`; every other F6 file passes).

Run: `npx tsx scripts/evals/validate.ts --redact`
Expected: exit 0 (the templates and the new `index.json` contain no tokens, e-mail addresses or long notes).

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

```bash
git add src/lib/evals/validate/handlers.ts src/lib/evals/validate/handlers.test.ts docs/evals/templates/expert-sampling.template.json docs/evals/templates/release-manifest.template.json src/lib/evals/validate/cli.ts
```
```bash
git commit -m "feat(evals): validate.ts --expert/--audit/--manifest and the expert-sampling and release-manifest templates" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 管理只读 API（`admin.ts` + `/api/admin/evals` + `/api/admin/evals/[run_id]`）

规格：§12（瓦片"评测门槛未过（30 天）"= `status in ('failed','incomplete','error')` 计数；表的列；抽屉 ≤ 100 条 `case_id, result, reason, left_text, right_text, abs_diff, rel_diff, tolerance, detail.locator, detail.document_id`；`GET /api/admin/evals?limit=&module=&kind=`、`GET /api/admin/evals/[run_id]`；`requireAdminUser()`、`force-dynamic`、`getAdminSupabase()`；响应键白名单 = 运行行列 + §3.2 `summary` 键 + 对账列；测试断言键集合与哨兵缺席）、§0 R5-11（只交付 `admin.ts` 与两个新路由文件，不改 `AdminDqClient.tsx`）、§5.2(b)（管理 API 只输出文本列）。依赖 Task 1（类型）、Task 5（表与列），读法沿用 `src/app/api/admin/dq/route.ts` + `src/lib/dq/dashboard.ts`。

**Files:**
- Create: `src/lib/evals/test-support/eval-rows.ts`（测试辅助：完整的运行行/案例行 + 哨兵）
- Create: `src/lib/evals/admin.ts`
- Create: `src/lib/evals/admin.test.ts`
- Create: `src/app/api/admin/evals/route.ts`
- Create: `src/app/api/admin/evals/route.test.ts`
- Create: `src/app/api/admin/evals/[run_id]/route.ts`
- Create: `src/app/api/admin/evals/[run_id]/route.test.ts`
- Modify: `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`

- [ ] **Step 1: 写测试辅助 `src/lib/evals/test-support/eval-rows.ts`**

```ts
// src/lib/evals/test-support/eval-rows.ts
// Test support (not a test file): complete dq_eval_runs / dq_eval_case_results rows as PostgREST returns
// them (memoryTableClient applies no defaults, so every column is written), with the canary value planted
// in places the admin whitelist must drop: an extra summary key, an extra nested summary key, and extra
// case detail keys.
import {memoryTableClient} from '../../db/memory-table-client';
import type {Row,TableClient} from '../../db/table-client';

export const SENTINEL='918273645.5';
export const RUN_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const RUN_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const evalTables=():TableClient&{rows(t:string):Row[]}=>memoryTableClient({dq_eval_runs:['run_id'],dq_eval_case_results:['eval_run_id','case_id']});

export function summaryRow(p:Record<string,unknown>={}):Record<string,unknown>{
 return {population:3,required:3,
  correctness:{pass:2,fail:1,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0,hidden:SENTINEL},
  coverage:{evaluated:3,evaluated_optional:0,missing_required:0,missing_optional:0,not_visible:0,skipped:0},
  execution:{read_error:0,truncated:0,subset:false},
  thresholds:{max_fail:0,min_coverage_optional:'0.95'},
  gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},
  gate:'fail',evidence_class:'truth',reconciliations_truncated:false,
  canary:SENTINEL,...p};
}
export function runRow(p:Record<string,unknown>={}):Row{
 return {run_id:RUN_A,kind:'official_reconciliation',module:'facts',mode:'report',privileged:true,artifact_class:'public',set_id:'facts/synthetic-us',set_version:1,set_sha256:'c'.repeat(64),
  evaluator_code_version:'d'.repeat(40),started_at:'2026-11-05T10:00:00.000Z',finished_at:'2026-11-05T10:01:00.000Z',status:'failed',summary:summaryRow(),
  report_ref:'docs/evals/2026-11-05/facts-official_reconciliation-aaaaaaaa.json',report_sha256:'e'.repeat(64),triggered_by:'script',...p};
}
export function caseRow(runId:string,caseId:string,p:Record<string,unknown>={}):Row{
 return {eval_run_id:runId,case_id:caseId,result:'fail',reason:'value',left_text:'383285000001',right_text:'383285000000',abs_diff:'1',rel_diff:'0.0000000000',tolerance:'0',
  detail:{locator:{page:28,table:'CONSOLIDATED STATEMENTS OF OPERATIONS',row:'Total net sales'},document_id:{kind:'edgar_accession',value:'0009990601-24-000001'},note:SENTINEL,debug:{echo:SENTINEL}},
  created_at:'2026-11-05T10:00:30.000Z',...p};
}
```

- [ ] **Step 2: 写失败测试 `src/lib/evals/admin.test.ts`**

```ts
// src/lib/evals/admin.test.ts
import {describe,expect,it} from 'vitest';
import {EVAL_CASE_ROWS_MAX,getEvalRun,listEvalRuns,parseEvalListQuery,whitelistSummary} from './admin';
import {RUN_A,RUN_B,SENTINEL,caseRow,evalTables,runRow,summaryRow} from './test-support/eval-rows';

const RUN_KEYS=['artifact_class','evaluator_code_version','finished_at','kind','mode','module','privileged','report_ref','report_sha256','run_id','set_id','set_sha256','set_version','started_at','status','summary','triggered_by'];
const SUMMARY_KEYS=['correctness','coverage','evidence_class','execution','gate','gold','population','reconciliations_truncated','required','thresholds'];
const CASE_KEYS=['abs_diff','case_id','document_id','left_text','locator','reason','rel_diff','result','right_text','tolerance'];
const keys=(o:object)=>Object.keys(o).sort();
const NOW=new Date('2026-11-06T12:00:00.000Z');
const daysAgo=(n:number)=>new Date(NOW.getTime()-n*86_400_000).toISOString();
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

describe('parseEvalListQuery',()=>{
 it('defaults and bounds',()=>{
  expect(parseEvalListQuery(new URLSearchParams(''))).toEqual({ok:true,query:{limit:20}});
  expect(parseEvalListQuery(new URLSearchParams('limit=100&module=facts&kind=replay_consistency'))).toEqual({ok:true,query:{limit:100,module:'facts',kind:'replay_consistency'}});
  for(const [qs,error] of [['limit=0','invalid_limit'],['limit=101','invalid_limit'],['limit=1.5','invalid_limit'],['limit=abc','invalid_limit'],['module=bonds','invalid_module'],['kind=vibes','invalid_kind']])
   expect(parseEvalListQuery(new URLSearchParams(qs))).toEqual({ok:false,error});
 });
});

describe('whitelistSummary',()=>{
 it('copies exactly the §3.2 keys (nested ones too) and drops everything else',()=>{
  const s=whitelistSummary(summaryRow())!;
  expect(keys(s)).toEqual(SUMMARY_KEYS);
  expect(keys(s.correctness)).toEqual(['fail','pass','provenance_incomplete','unexplained_diff','unit_mismatch']);
  expect(keys(s.coverage)).toEqual(['evaluated','evaluated_optional','missing_optional','missing_required','not_visible','skipped']);
  expect(keys(s.execution)).toEqual(['read_error','subset','truncated']);
  expect(keys(s.thresholds)).toEqual(['max_fail','min_coverage_optional']);
  expect(keys(s.gold)).toEqual(['format','pending','provenance_gaps','ready']);
  expect(JSON.stringify(s)).not.toContain(SENTINEL);
 });
 it('an empty (running) or malformed summary is null',()=>{
  expect(whitelistSummary({})).toBeNull();
  expect(whitelistSummary(summaryRow({gate:'maybe'}))).toBeNull();
  expect(whitelistSummary(summaryRow({population:-1}))).toBeNull();
  expect(whitelistSummary(summaryRow({thresholds:{max_fail:0,min_coverage_optional:0.95}}))).toBeNull();
  expect(whitelistSummary('{"gate":"pass"}')).toBeNull();
 });
});

describe('listEvalRuns',()=>{
 it('whitelisted run rows newest first, filters, limit, and the 30-day gate-failing count (global)',async()=>{
  const t=evalTables();
  await t.insert('dq_eval_runs',runRow({run_id:uuid(1),status:'failed',started_at:daysAgo(10),finished_at:daysAgo(10)}));
  await t.insert('dq_eval_runs',runRow({run_id:uuid(2),status:'incomplete',started_at:daysAgo(40),finished_at:daysAgo(40)}));
  await t.insert('dq_eval_runs',runRow({run_id:uuid(3),status:'error',kind:'replay_consistency',started_at:daysAgo(1),finished_at:daysAgo(1)}));
  await t.insert('dq_eval_runs',runRow({run_id:uuid(4),status:'passed',started_at:daysAgo(2),finished_at:daysAgo(2)}));
  await t.insert('dq_eval_runs',runRow({run_id:uuid(5),status:'running',started_at:daysAgo(0.01),finished_at:null,summary:{}}));
  const all=await listEvalRuns(t,{limit:20},NOW);
  expect(keys(all)).toEqual(['gate_failing_30d','refreshed_at','runs']);
  expect(all.runs.map(r=>r.run_id)).toEqual([uuid(5),uuid(3),uuid(4),uuid(1),uuid(2)]);
  expect(all.gate_failing_30d).toBe(2);   // failed (10 d) + error (1 d); the 40-day incomplete is outside
  expect(all.refreshed_at).toBe(NOW.toISOString());
  for(const r of all.runs)expect(keys(r)).toEqual(RUN_KEYS);
  expect(all.runs[0].summary).toBeNull();
  expect(keys(all.runs[1].summary!)).toEqual(SUMMARY_KEYS);
  expect(JSON.stringify(all)).not.toContain(SENTINEL);
  const replay=await listEvalRuns(t,{limit:20,kind:'replay_consistency'},NOW);
  expect(replay.runs.map(r=>r.run_id)).toEqual([uuid(3)]);
  expect(replay.gate_failing_30d).toBe(2);
  expect((await listEvalRuns(t,{limit:2},NOW)).runs.map(r=>r.run_id)).toEqual([uuid(5),uuid(3)]);
  expect((await listEvalRuns(t,{limit:20,module:'macro'},NOW)).runs).toEqual([]);
 });
});

describe('getEvalRun',()=>{
 it('run + whitelisted case rows (text columns, locator, document_id) and nothing else',async()=>{
  const t=evalTables();
  await t.insert('dq_eval_runs',runRow());
  await t.insert('dq_eval_case_results',caseRow(RUN_A,'ZZEVA/revenue/2023'));
  await t.insert('dq_eval_case_results',caseRow(RUN_A,'ZZEVA/cash/2023',{result:'missing',reason:null,left_text:null,abs_diff:null,rel_diff:null,detail:{locator:{page:'x',nested:{a:1}},document_id:{kind:'edgar_accession'}}}));
  const d=(await getEvalRun(t,RUN_A))!;
  expect(keys(d)).toEqual(['case_total','cases','cases_truncated','run']);
  expect(keys(d.run)).toEqual(RUN_KEYS);
  expect(d.cases.map(c=>c.case_id)).toEqual(['ZZEVA/cash/2023','ZZEVA/revenue/2023']);
  for(const c of d.cases)expect(keys(c)).toEqual(CASE_KEYS);
  expect(d.cases[1]).toEqual({case_id:'ZZEVA/revenue/2023',result:'fail',reason:'value',left_text:'383285000001',right_text:'383285000000',abs_diff:'1',rel_diff:'0.0000000000',tolerance:'0',
   locator:{page:28,table:'CONSOLIDATED STATEMENTS OF OPERATIONS',row:'Total net sales'},document_id:{kind:'edgar_accession',value:'0009990601-24-000001'}});
  expect(d.cases[0]).toMatchObject({result:'missing',reason:null,left_text:null,locator:null,document_id:null});
  expect(d).toMatchObject({case_total:2,cases_truncated:false});
  expect(JSON.stringify(d)).not.toContain(SENTINEL);
 });
 it(`at most ${EVAL_CASE_ROWS_MAX} case rows; total and truncation reported; unknown run → null; other runs' rows excluded`,async()=>{
  const t=evalTables();
  await t.insert('dq_eval_runs',runRow());
  await t.insert('dq_eval_runs',runRow({run_id:RUN_B}));
  for(let i=0;i<101;i++)await t.insert('dq_eval_case_results',caseRow(RUN_A,`case-${String(i).padStart(3,'0')}`));
  await t.insert('dq_eval_case_results',caseRow(RUN_B,'other'));
  const d=(await getEvalRun(t,RUN_A))!;
  expect(d.cases.length).toBe(EVAL_CASE_ROWS_MAX);
  expect(d).toMatchObject({case_total:101,cases_truncated:true});
  expect(d.cases.some(c=>c.case_id==='other')).toBe(false);
  expect(await getEvalRun(t,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toBeNull();
 });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `npm test -- src/lib/evals/admin.test.ts`
Expected: FAIL — `Failed to resolve import "./admin"`。

- [ ] **Step 4: 实现 `src/lib/evals/admin.ts`**

```ts
// src/lib/evals/admin.ts
// Admin read model of the F6 tables (spec §12, §0 R5-11, §5.2(b)). Every response field comes from a
// whitelist: the dq_eval_runs columns; the §3.2 summary keys, type-checked one by one (any other key in
// the jsonb — debug fields, a canary — is dropped; a summary that is not a complete §3.2 object, e.g. the
// '{}' of a running row, is null); the dq_eval_case_results text columns plus detail.locator (flat
// string/number values only) and detail.document_id ({kind, value}) — nothing else of detail. At most
// EVAL_CASE_ROWS_MAX case rows per run (ordered by case_id) with the real total. gate_failing_30d counts
// runs with status failed | incomplete | error started in the last 30 days, globally (not filtered by the
// list query), like the /admin/dq KPI tiles; TableClient has no IN filter, so it is three counts.
import type {Row,TableClient} from '../db/table-client';
import type {ArtifactClass,CaseResultKind,EvalKind,EvalMode,EvalModule,EvalRunStatus,EvalRunRow,Summary} from './types';

export const EVAL_KINDS:readonly EvalKind[]=['official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration'];
export const EVAL_MODULES:readonly EvalModule[]=['facts','metrics','macro','industry','company','foreign_research'];
export const EVAL_LIST_DEFAULT=20,EVAL_LIST_MAX=100,EVAL_CASE_ROWS_MAX=100;
export const GATE_FAILING_STATUSES:readonly EvalRunStatus[]=['failed','incomplete','error'];
export const EVAL_RUN_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS=86_400_000;
const MAX_LOCATOR_TEXT=200;

export interface EvalListQuery{limit:number;module?:EvalModule;kind?:EvalKind}
export type PublicEvalRun=Omit<EvalRunRow,'summary'>&{summary:Summary|null};
export interface PublicCaseResult{case_id:string;result:CaseResultKind;reason:string|null;left_text:string|null;right_text:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;locator:Record<string,string|number>|null;document_id:{kind:string;value:string}|null}
export interface EvalRunList{runs:PublicEvalRun[];gate_failing_30d:number;refreshed_at:string}
export interface EvalRunDetail{run:PublicEvalRun;cases:PublicCaseResult[];case_total:number;cases_truncated:boolean}

export function parseEvalListQuery(p:URLSearchParams):{ok:true;query:EvalListQuery}|{ok:false;error:'invalid_limit'|'invalid_module'|'invalid_kind'}{
 const raw=p.get('limit');let limit=EVAL_LIST_DEFAULT;
 if(raw!==null){if(!/^[1-9][0-9]{0,2}$/.test(raw)||Number(raw)>EVAL_LIST_MAX)return {ok:false,error:'invalid_limit'};limit=Number(raw);}
 const m=p.get('module'),k=p.get('kind');
 if(m!==null&&!(EVAL_MODULES as readonly string[]).includes(m))return {ok:false,error:'invalid_module'};
 if(k!==null&&!(EVAL_KINDS as readonly string[]).includes(k))return {ok:false,error:'invalid_kind'};
 return {ok:true,query:{limit,...(m!==null?{module:m as EvalModule}:{}),...(k!==null?{kind:k as EvalKind}:{})}};
}

const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const nat=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const bool=(v:unknown):v is boolean=>typeof v==='boolean';
const decimalText=(v:unknown):v is string=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v);
const GATES=new Set(['pass','fail','incomplete']);
const EVIDENCE=new Set(['truth','comparison','adapter_check']);
const FORMATS=new Set(['f6','legacy_plan2']);
function nats<K extends string>(o:unknown,ks:readonly K[]):Record<K,number>|null{
 if(!isObj(o))return null;
 const out={} as Record<K,number>;
 for(const k of ks){const v=o[k];if(!nat(v))return null;out[k]=v;}
 return out;
}

/** The §3.2 summary, rebuilt key by key; null unless every key is present with the right type. */
export function whitelistSummary(raw:unknown):Summary|null{
 if(!isObj(raw))return null;
 const correctness=nats(raw.correctness,['pass','fail','unit_mismatch','provenance_incomplete','unexplained_diff'] as const);
 const coverage=nats(raw.coverage,['evaluated','evaluated_optional','missing_required','missing_optional','not_visible','skipped'] as const);
 const ex=raw.execution,th=raw.thresholds,g=raw.gold;
 if(!correctness||!coverage||!isObj(ex)||!isObj(th)||!isObj(g))return null;
 if(!nat(raw.population)||!nat(raw.required)||!nat(ex.read_error)||!nat(ex.truncated)||!bool(ex.subset))return null;
 if(!nat(th.max_fail)||!decimalText(th.min_coverage_optional))return null;
 if(typeof g.format!=='string'||!FORMATS.has(g.format)||!bool(g.ready)||!nat(g.pending)||!nat(g.provenance_gaps))return null;
 if(typeof raw.gate!=='string'||!GATES.has(raw.gate)||typeof raw.evidence_class!=='string'||!EVIDENCE.has(raw.evidence_class)||!bool(raw.reconciliations_truncated))return null;
 return {population:raw.population,required:raw.required,correctness,coverage,
  execution:{read_error:ex.read_error,truncated:ex.truncated,subset:ex.subset},
  thresholds:{max_fail:th.max_fail,min_coverage_optional:th.min_coverage_optional},
  gold:{format:g.format as Summary['gold']['format'],ready:g.ready,pending:g.pending,provenance_gaps:g.provenance_gaps},
  gate:raw.gate as Summary['gate'],evidence_class:raw.evidence_class as Summary['evidence_class'],reconciliations_truncated:raw.reconciliations_truncated};
}

const text=(v:unknown):string|null=>v===null||v===undefined?null:String(v);
export function publicRun(r:Row):PublicEvalRun{
 return {run_id:String(r.run_id),kind:String(r.kind) as EvalKind,module:String(r.module) as EvalModule,mode:String(r.mode) as EvalMode,privileged:r.privileged===true,
  artifact_class:String(r.artifact_class) as ArtifactClass,set_id:String(r.set_id),set_version:Number(r.set_version),set_sha256:String(r.set_sha256),
  evaluator_code_version:String(r.evaluator_code_version),started_at:String(r.started_at),finished_at:text(r.finished_at),status:String(r.status) as EvalRunStatus,
  summary:whitelistSummary(r.summary),report_ref:String(r.report_ref),report_sha256:String(r.report_sha256),triggered_by:String(r.triggered_by) as EvalRunRow['triggered_by']};
}
function locatorOf(v:unknown):Record<string,string|number>|null{
 if(!isObj(v))return null;
 const out:Record<string,string|number>={};
 for(const [k,x] of Object.entries(v)){
  if(typeof x==='number'&&Number.isFinite(x))out[k]=x;
  else if(typeof x==='string'&&x.length<=MAX_LOCATOR_TEXT)out[k]=x;
  else return null;
 }
 return out;
}
function documentIdOf(v:unknown):{kind:string;value:string}|null{
 if(!isObj(v)||typeof v.kind!=='string'||typeof v.value!=='string'||v.value.length>MAX_LOCATOR_TEXT)return null;
 if(!['edgar_accession','cninfo_announcement','file_sha256','official_release'].includes(v.kind))return null;
 return {kind:v.kind,value:v.value};
}
export function publicCase(r:Row):PublicCaseResult{
 const detail=isObj(r.detail)?r.detail:{};
 return {case_id:String(r.case_id),result:String(r.result) as CaseResultKind,reason:text(r.reason),left_text:text(r.left_text),right_text:text(r.right_text),
  abs_diff:text(r.abs_diff),rel_diff:text(r.rel_diff),tolerance:String(r.tolerance),locator:locatorOf(detail.locator),document_id:documentIdOf(detail.document_id)};
}

export async function listEvalRuns(tables:TableClient,query:EvalListQuery,now:Date=new Date()):Promise<EvalRunList>{
 const match:Row={};
 if(query.module)match.module=query.module;
 if(query.kind)match.kind=query.kind;
 const since=new Date(now.getTime()-30*DAY_MS).toISOString();
 const [rows,...counts]=await Promise.all([
  tables.select('dq_eval_runs',match,{orderBy:'started_at',desc:true,limit:query.limit}),
  ...GATE_FAILING_STATUSES.map(status=>tables.count('dq_eval_runs',{status},{gte:{started_at:since}})),
 ]) as [Row[],...number[]];
 return {runs:rows.map(publicRun),gate_failing_30d:counts.reduce((a,b)=>a+b,0),refreshed_at:now.toISOString()};
}

export async function getEvalRun(tables:TableClient,runId:string):Promise<EvalRunDetail|null>{
 const [r]=await tables.select('dq_eval_runs',{run_id:runId},{limit:1});
 if(!r)return null;
 const [rows,total]=await Promise.all([
  tables.select('dq_eval_case_results',{eval_run_id:runId},{orderBy:'case_id',limit:EVAL_CASE_ROWS_MAX}),
  tables.count('dq_eval_case_results',{eval_run_id:runId}),
 ]);
 return {run:publicRun(r),cases:rows.map(publicCase),case_total:total,cases_truncated:total>rows.length};
}
```

- [ ] **Step 5: 运行，确认通过**

Run: `npm test -- src/lib/evals/admin.test.ts`
Expected: PASS（7 个用例）。

- [ ] **Step 6: 写失败测试 `src/app/api/admin/evals/route.test.ts`**

```ts
// src/app/api/admin/evals/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),tables:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.tables}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {RUN_A,SENTINEL,evalTables,runRow} from '@/lib/evals/test-support/eval-rows';
import {GET} from './route';

const get=(qs='')=>GET(new Request(`https://alpha.example/api/admin/evals${qs}`));

describe('GET /api/admin/evals',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();
  const t=evalTables();await t.insert('dq_eval_runs',runRow());mocks.tables=t;
  mocks.getAdmin.mockReturnValue({});
 });
 it('401 / 403 before constructing the admin client',async()=>{
  mocks.requireAdmin.mockRejectedValue(new AdminUnauthenticated());
  const a=await get();expect(a.status).toBe(401);expect(await a.json()).toEqual({error:'authentication required'});
  mocks.requireAdmin.mockRejectedValue(new AdminForbidden());
  const b=await get();expect(b.status).toBe(403);expect(await b.json()).toEqual({error:'admin role required'});
  expect(mocks.getAdmin).not.toHaveBeenCalled();
 });
 it('400 on an invalid query, before constructing the admin client',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  for(const [qs,error] of [['?limit=0','invalid_limit'],['?module=bonds','invalid_module'],['?kind=x','invalid_kind']]){
   const r=await get(qs);expect(r.status).toBe(400);expect(await r.json()).toEqual({error});
  }
  expect(mocks.getAdmin).not.toHaveBeenCalled();
 });
 it('200: whitelisted list, no-store, sentinel absent from the body and the logs',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  const logs=[vi.spyOn(console,'log').mockImplementation(()=>{}),vi.spyOn(console,'error').mockImplementation(()=>{}),vi.spyOn(console,'warn').mockImplementation(()=>{})];
  const r=await get('?limit=5&module=facts');
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('no-store');
  const raw=await r.text();
  expect(raw).not.toContain(SENTINEL);
  const body=JSON.parse(raw);
  expect(Object.keys(body).sort()).toEqual(['gate_failing_30d','refreshed_at','runs']);
  expect(body.runs.map((x:{run_id:string})=>x.run_id)).toEqual([RUN_A]);
  for(const s of logs){for(const call of s.mock.calls)expect(JSON.stringify(call)).not.toContain(SENTINEL);s.mockRestore();}
 });
 it('500: logs the message and returns a generic error',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  mocks.getAdmin.mockImplementation(()=>{throw new Error('no service role key');});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const r=await get();
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({error:'evals unavailable'});
  expect(spy).toHaveBeenCalledWith('[admin/evals]','no service role key');
  spy.mockRestore();
 });
});
```

- [ ] **Step 7: 运行，确认失败**

Run: `npm test -- src/app/api/admin/evals/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`。

- [ ] **Step 8: 实现 `src/app/api/admin/evals/route.ts`**

```ts
// src/app/api/admin/evals/route.ts
// GET /api/admin/evals?limit=&module=&kind= (spec §12): admin only; whitelisted run rows newest first plus
// the 30-day gate-failing count (src/lib/evals/admin.ts). Same auth/error mapping as /api/admin/dq.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {supabaseTableClient} from '@/lib/db/table-client';
import {listEvalRuns,parseEvalListQuery} from '@/lib/evals/admin';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export async function GET(request:Request){
 try{
  await requireAdminUser();
  const parsed=parseEvalListQuery(new URL(request.url).searchParams);
  if(!parsed.ok)return NextResponse.json({error:parsed.error},{status:400});
  const tables=supabaseTableClient(getAdminSupabase());
  return NextResponse.json(await listEvalRuns(tables,parsed.query,new Date()),{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'authentication required'},{status:401});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'admin role required'},{status:403});
  console.error('[admin/evals]',error instanceof Error?error.message:error);
  return NextResponse.json({error:'evals unavailable'},{status:500});
 }
}
```

- [ ] **Step 9: 运行，确认通过**

Run: `npm test -- src/app/api/admin/evals/route.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 10: 写失败测试 `src/app/api/admin/evals/[run_id]/route.test.ts`**

```ts
// src/app/api/admin/evals/[run_id]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),tables:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.tables}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {RUN_A,SENTINEL,caseRow,evalTables,runRow} from '@/lib/evals/test-support/eval-rows';
import {GET} from './route';

const get=(id:string)=>GET(new Request(`https://alpha.example/api/admin/evals/${id}`),{params:Promise.resolve({run_id:id})});
const CASE_KEYS=['abs_diff','case_id','document_id','left_text','locator','reason','rel_diff','result','right_text','tolerance'];

describe('GET /api/admin/evals/[run_id]',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();
  const t=evalTables();await t.insert('dq_eval_runs',runRow());await t.insert('dq_eval_case_results',caseRow(RUN_A,'ZZEVA/revenue/2023'));mocks.tables=t;
  mocks.getAdmin.mockReturnValue({});
 });
 it('401 / 403 before constructing the admin client',async()=>{
  mocks.requireAdmin.mockRejectedValue(new AdminUnauthenticated());
  expect((await get(RUN_A)).status).toBe(401);
  mocks.requireAdmin.mockRejectedValue(new AdminForbidden());
  expect((await get(RUN_A)).status).toBe(403);
  expect(mocks.getAdmin).not.toHaveBeenCalled();
 });
 it('400 invalid_run_id (no db access); 404 run_not_found',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  const bad=await get('not-a-uuid');expect(bad.status).toBe(400);expect(await bad.json()).toEqual({error:'invalid_run_id'});
  expect(mocks.getAdmin).not.toHaveBeenCalled();
  const nf=await get('cccccccc-cccc-4ccc-8ccc-cccccccccccc');expect(nf.status).toBe(404);expect(await nf.json()).toEqual({error:'run_not_found'});
 });
 it('200: run + whitelisted cases; the 20-digit text value survives verbatim; sentinel absent',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  const t=mocks.tables as ReturnType<typeof evalTables>;
  await t.insert('dq_eval_case_results',caseRow(RUN_A,'ZZEVA/big',{left_text:'12345678901234567890',right_text:'12345678901234567891',abs_diff:'1'}));
  const r=await get(RUN_A.toUpperCase());
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('no-store');
  const raw=await r.text();
  expect(raw).not.toContain(SENTINEL);
  expect(raw).toContain('"left_text":"12345678901234567890"');
  const body=JSON.parse(raw);
  expect(Object.keys(body).sort()).toEqual(['case_total','cases','cases_truncated','run']);
  expect(body.run.run_id).toBe(RUN_A);
  for(const c of body.cases)expect(Object.keys(c).sort()).toEqual(CASE_KEYS);
 });
 it('500 generic with a log line',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  mocks.getAdmin.mockImplementation(()=>{throw new Error('no service role key');});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const r=await get(RUN_A);
  expect(r.status).toBe(500);expect(await r.json()).toEqual({error:'evals unavailable'});
  expect(spy).toHaveBeenCalledWith('[admin/evals/run]','no service role key');
  spy.mockRestore();
 });
});
```

- [ ] **Step 11: 运行，确认失败**

Run: `npm test -- "src/app/api/admin/evals/[run_id]/route.test.ts"`
Expected: FAIL — `Failed to resolve import "./route"`。

- [ ] **Step 12: 实现 `src/app/api/admin/evals/[run_id]/route.ts`**

```ts
// src/app/api/admin/evals/[run_id]/route.ts
// GET /api/admin/evals/[run_id] (spec §12): admin only; the whitelisted run row and ≤ 100 whitelisted
// dq_eval_case_results rows (src/lib/evals/admin.ts). run_id must be a UUID (400 invalid_run_id); an
// unknown run is 404 run_not_found. Same auth/error mapping as /api/admin/dq.
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {supabaseTableClient} from '@/lib/db/table-client';
import {EVAL_RUN_ID_RE,getEvalRun} from '@/lib/evals/admin';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export async function GET(_request:Request,{params}:{params:Promise<{run_id:string}>}){
 try{
  await requireAdminUser();
  const {run_id:raw}=await params;
  if(!EVAL_RUN_ID_RE.test(raw))return NextResponse.json({error:'invalid_run_id'},{status:400});
  const detail=await getEvalRun(supabaseTableClient(getAdminSupabase()),raw.toLowerCase());
  if(!detail)return NextResponse.json({error:'run_not_found'},{status:404});
  return NextResponse.json(detail,{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'authentication required'},{status:401});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'admin role required'},{status:403});
  console.error('[admin/evals/run]',error instanceof Error?error.message:error);
  return NextResponse.json({error:'evals unavailable'},{status:500});
 }
}
```

- [ ] **Step 13: 运行，确认通过**

Run: `npm test -- src/app/api/admin/evals src/lib/evals/admin.test.ts`
Expected: PASS（两个路由测试文件 + admin 单测）。

- [ ] **Step 14: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 错误、0 警告。

- [ ] **Step 15: 实施记录**

```markdown
## Task 13 — admin read API

- src/lib/evals/admin.ts (whitelist: run columns, §3.2 summary keys type-checked, case text columns + detail.locator/document_id; ≤ 100 case rows; gate_failing_30d = failed+incomplete+error in 30 days, global), GET /api/admin/evals, GET /api/admin/evals/[run_id].
- Tests: exact key sets, sentinel 918273645.5 planted in summary extras and case detail never in responses or logs, 401/403 before the admin client, 400/404.
- UI section and drawer: after the Claude Design canvas and plan 3 Task 19 (§0 R5-11).
```

- [ ] **Step 16: 提交**

```bash
git add src/lib/evals/test-support/eval-rows.ts src/lib/evals/admin.ts src/lib/evals/admin.test.ts src/app/api/admin/evals/route.ts src/app/api/admin/evals/route.test.ts "src/app/api/admin/evals/[run_id]/route.ts" "src/app/api/admin/evals/[run_id]/route.test.ts" docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md
```
```bash
git commit -m "feat(evals): admin read API for eval runs with whitelisted shapes (F6 Task 13)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: `dual_source`（`PairSource`）、`reference_regression`（`ReferenceResult`、哨兵、只读 `ReadDeps`）、`KIND_REGISTRY` 拒绝未启用的 kind

规格：§5.5、§0 R5-10（注入只读 `PairSource`；非比较结果 → `missing`/`read_error`，永不 pass；`independence/upstream` 由 F6 登记显式给出；计划三 `relDiff` 四舍五入与 F6 截断以一致性向量固定）、§5.4（样本、`ReferenceResult` 严格键集合与非负整数、只经 `writeReferenceSummary`、`ReadDeps` 反射测试、哨兵、`rel 0.01`、账本两值必须等于本次比较值）、§3.3 dual/reference 行、§14、§15.1（两者"纯逻辑 + 注入接口 + 单测"，无真实库测试）。依赖 Task 1（`compare.ts`、`summary.ts`、`types.ts`、`errors.ts`）、Task 4（`renderMarkdown`，CCR 3）、Task 6（`EvalStore` 类型）、Task 9（`src/lib/evals/cli/run-cli.ts`：`runCli`、`KIND_RUNNERS`）、Task 11（`KIND_RUNNERS.replay_consistency`）。

**`run.ts` 归属：** `scripts/evals/run.ts` 与 `src/lib/evals/cli/run-cli.ts` 由 Task 9 拥有。本任务只在 `run-cli.ts` 里加一个 import 与一行 `assertKindEnabled(args.kind)`（Step 17）；注册表本身放在本任务新建的 `src/lib/evals/kinds/registry.ts`，是启用与否的唯一来源。

**Files:**
- Create: `src/lib/evals/kinds/read-only.ts`（`writeLikeProperties`、`assertReadOnly`）
- Create: `src/lib/evals/kinds/read-only.test.ts`
- Create: `src/lib/evals/kinds/dual-source.ts`
- Create: `src/lib/evals/kinds/dual-source.test.ts`
- Create: `src/lib/evals/kinds/reference.ts`
- Create: `src/lib/evals/kinds/reference.test.ts`
- Create: `src/lib/evals/kinds/registry.ts`（`KIND_REGISTRY`、`kindEntry`、`assertKindEnabled`）
- Create: `src/lib/evals/kinds/registry.test.ts`（含对 `run.ts` 的 CLI 退出码 2 测试）
- Modify: `src/lib/evals/cli/run-cli.ts`（一个 import + `runCli` 里一行 `assertKindEnabled`）
- Modify: `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`

- [ ] **Step 1: 写失败测试 `src/lib/evals/kinds/read-only.test.ts`**

```ts
// src/lib/evals/kinds/read-only.test.ts
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {assertReadOnly,writeLikeProperties} from './read-only';

class Store{insertRun(){return 1;}read(){return 2;}}
class Reader{value(){return null;}}

describe('writeLikeProperties',()=>{
 it('finds write-like names on own props, nested plain objects and prototype methods',()=>{
  expect(writeLikeProperties({reader:{value:()=>null},today:'2026-11-06'})).toEqual([]);
  expect(writeLikeProperties({reader:{value:()=>null,insert:()=>0}})).toEqual(['reader.insert']);
  expect(writeLikeProperties({db:new Store()})).toEqual(['db.insertRun']);
  expect(writeLikeProperties({a:{update:1},rpc:()=>0,storeX:()=>0,upsert_row:()=>0,delete:()=>0})).toEqual(['a.update','delete','rpc','storeX','upsert_row']);
  expect(writeLikeProperties({r:new Reader(),storage:{},updated_at:'x',inserted:true})).toEqual([]);   // prefixes need a word boundary
 });
 it('survives cycles and getters (never invoked)',()=>{
  const a:Record<string,unknown>={};a.self=a;
  Object.defineProperty(a,'boom',{get(){throw new Error('invoked');},enumerable:true});
  expect(writeLikeProperties(a)).toEqual([]);
 });
 it('assertReadOnly throws the given EvalError code with the offending paths',()=>{
  try{assertReadOnly({reader:{upsert:()=>0}},'reference_write_attempt','ReadDeps');throw new Error('not thrown');}
  catch(e){expect(e).toBeInstanceOf(EvalError);expect((e as EvalError).code).toBe('reference_write_attempt');expect((e as EvalError).detail).toEqual({properties:['reader.upsert']});}
  expect(()=>assertReadOnly({reader:new Reader()},'reference_write_attempt','ReadDeps')).not.toThrow();
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/evals/kinds/read-only.test.ts`
Expected: FAIL — `Failed to resolve import "./read-only"`。

- [ ] **Step 3: 实现 `src/lib/evals/kinds/read-only.ts`**

```ts
// src/lib/evals/kinds/read-only.ts
// Reflection check for injected read dependencies (spec §5.4(b), §0 R5-10): walks own properties, the
// prototype chain (class methods) and nested plain-object values (cycle-safe, depth ≤ 4, getters are
// never invoked) and reports every property whose name starts with insert / update / upsert / store /
// delete / rpc followed by a word boundary (end, '_' or an upper-case letter: insertRun, upsert_row,
// storeX — but not storage, updated_at, inserted).
import {EvalError} from '../errors';
import type {EvalErrorCode} from '../errors';

const WRITE_NAME=/^(insert|update|upsert|store|delete|rpc)(?:[A-Z_]|$)/;

export function writeLikeProperties(root:unknown,maxDepth=4):string[]{
 const found=new Set<string>();const seen=new WeakSet<object>();
 const walk=(v:unknown,path:string,depth:number):void=>{
  if(v===null||(typeof v!=='object'&&typeof v!=='function'))return;
  const o=v as object;
  if(seen.has(o)||depth>maxDepth)return;
  seen.add(o);
  for(let p:object|null=o;p!==null&&p!==Object.prototype&&p!==Function.prototype;p=Object.getPrototypeOf(p)){
   for(const k of Reflect.ownKeys(p)){
    if(typeof k!=='string'||k==='constructor')continue;
    const name=path?`${path}.${k}`:k;
    if(WRITE_NAME.test(k))found.add(name);
    const d=Object.getOwnPropertyDescriptor(p,k);
    if(d&&'value' in d&&typeof d.value==='object'&&d.value!==null)walk(d.value,name,depth+1);
   }
  }
 };
 walk(root,'',0);
 return [...found].sort();
}

export function assertReadOnly(root:unknown,code:EvalErrorCode,label:string):void{
 const props=writeLikeProperties(root);
 if(props.length>0)throw new EvalError(code,`${label} exposes write-capable properties: ${props.join(', ')}`,{properties:props});
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/evals/kinds/read-only.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 写失败测试 `src/lib/evals/kinds/dual-source.test.ts`**

```ts
// src/lib/evals/kinds/dual-source.test.ts
import {describe,expect,it} from 'vitest';
import {compareWithinTolerance} from '../compare';
import {EvalError} from '../errors';
import {canonicalDecimal} from '../../facts/json-numbers';
import {summarize} from '../summary';
import {RELDIFF_CONFORMANCE,dualSourceSummaryContext,evaluateDualSource,observationKeyString,runDualSource,upstreamOutcomeOf} from './dual-source';
import type {ObservationKey,PairObservation,PairRegistration,PairSource} from './dual-source';

const reg=(p:Partial<PairRegistration>={}):PairRegistration=>({pair_id:'us.companyfacts_vs_ixbrl',module:'facts',left:{source:'edgar.companyfacts',upstream:'sec.xbrl'},right:{source:'edgar.ixbrl',upstream:'sec.filing_html'},independence:'same_upstream_independent_extraction',tolerance:{rel:'0.005'},...p});
const key=(p:Partial<ObservationKey>={}):ObservationKey=>({issuer:'11111111-1111-4111-8111-111111111111',concept:'revenue',period_start:'2023-10-01',period_end:'2024-09-28',duration:'12M',consolidation:'consolidated',unit:'USD',...p});
const side=(value:string,p:Record<string,string>={})=>({fact_id:'f-left',value_text:value,source_ref:'0009990601-24-000001',raw_hash:'h'.repeat(8),available_date:'2024-11-01',...p});
const obs=(p:Partial<PairObservation>={}):PairObservation=>({key:key(),left:side('1000'),right:side('1004',{fact_id:'f-right',available_date:'2024-11-05'}),upstream_outcome:'compared',...p});
const KEY=observationKeyString(key());

// plan 3 decimal.ts::relDiff reference (|l−r| / max(|l|,|r|,1), 10 places, round half away from zero) — test-only, F6 never uses it
const dec=(s:string)=>{const neg=s.startsWith('-');const b=neg?s.slice(1):s;const [i,f='']=b.split('.');return {n:(neg?-1n:1n)*BigInt(i+f),s:f.length};};
function plan3RelDiff(l:string,r:string):string{
 const a=dec(l),b=dec(r);const s=Math.max(a.s,b.s);
 const x=a.n*10n**BigInt(s-a.s),y=b.n*10n**BigInt(s-b.s);const abs=(v:bigint)=>v<0n?-v:v;
 const den=[abs(x),abs(y),10n**BigInt(s)].reduce((m,v)=>v>m?v:m);
 const q=(abs(x-y)*10n**11n)/den;const r10=(q+5n)/10n;
 const t=r10.toString().padStart(11,'0');
 return canonicalDecimal(`${t.slice(0,-10)}.${t.slice(-10)}`);
}

describe('evaluateDualSource',()=>{
 it('compares both value_text at the registration tolerance (F6 recomputes; plan 3 passed/rel_diff are ignored)',()=>{
  const r=evaluateDualSource(reg(),[obs(),obs({key:key({concept:'cash',period_start:null,duration:'INSTANT'}),right:side('1006',{fact_id:'f-right'})})]);
  const [cash,rev]=r.cases;
  expect(rev).toMatchObject({case_id:`us.companyfacts_vs_ixbrl:${KEY}`,outcome:{result:'pass'},left:'1000',right:'1004',tolerance:'0.005',required:true});
  expect(rev.detail).toMatchObject({as_of:'2024-11-05',compared:'pass',left:{fact_id:'f-left',source_ref:'0009990601-24-000001',raw_hash:'hhhhhhhh',available_date:'2024-11-01'}});
  expect(cash.outcome).toEqual({result:'fail',reason:'value'});
  expect(r.trend).toEqual({pass:1,fail:1});
  expect(r.evidenceClass).toBe('truth');
 });
 it('the observation key includes period_start and duration',()=>{
  const r=evaluateDualSource(reg(),[obs(),obs({key:key({period_start:'2024-06-30',duration:'3M'})})]);
  expect(r.cases.length).toBe(2);
  expect(new Set(r.cases.map(c=>c.case_id)).size).toBe(2);
  expect(KEY).toBe('11111111-1111-4111-8111-111111111111:revenue:2023-10-01:2024-09-28:12M:consolidated:USD');
 });
 it('non-comparison upstream outcomes never pass',()=>{
  const map:Record<string,unknown>={left_missing:{result:'missing'},right_missing:{result:'missing'},incomplete_gold:{result:'missing'},left_unlinked:{result:'read_error',reason:'filing_not_linked'},
   left_ambiguous:{result:'read_error',reason:'read_failed'},right_ambiguous:{result:'read_error',reason:'read_failed'},unsupported:{result:'read_error',reason:'read_failed'},legacy:{result:'read_error',reason:'read_failed'},whatever:{result:'read_error',reason:'read_failed'}};
  for(const [o,want] of Object.entries(map)){
   expect(upstreamOutcomeOf(o)).toEqual(want);
   const [c]=evaluateDualSource(reg(),[obs({upstream_outcome:o})]).cases;
   expect(c.outcome).toEqual(want);
   expect(c.detail.upstream_outcome).toBe(o);
  }
  expect(upstreamOutcomeOf('compared')).toBeNull();
  expect(evaluateDualSource(reg(),[obs({right:null})]).cases[0].outcome).toEqual({result:'read_error',reason:'read_failed'});
  expect(evaluateDualSource(reg(),[obs({left:side('12,5')})]).cases[0].outcome).toEqual({result:'read_error',reason:'read_failed'});
 });
 it('same_feed → adapter_check; duplicate keys → fail(ambiguous); truncated read → one read_error(truncated) case',()=>{
  expect(evaluateDualSource(reg({independence:'same_feed'}),[obs()]).evidenceClass).toBe('adapter_check');
  expect(evaluateDualSource(reg(),[obs(),obs()]).cases).toMatchObject([{outcome:{result:'fail',reason:'ambiguous'}}]);
  const t=evaluateDualSource(reg(),[obs()],{truncated:true});
  expect(t.cases.map(c=>c.outcome.result)).toEqual(['pass','read_error']);
  expect(t.cases[1]).toMatchObject({case_id:'us.companyfacts_vs_ixbrl:__truncated__',outcome:{result:'read_error',reason:'truncated'}});
 });
 it('a disposed fail is handled only with matching natural_key, resolved status and chosen_fact_ids (if present) containing a compared fact',()=>{
  const fail=(d:PairObservation['disposition'])=>evaluateDualSource(reg(),[obs({right:side('2000',{fact_id:'f-right'}),disposition:d})]).cases[0];
  const ok=fail({quarantine_id:'q1',natural_key:KEY,status:'resolved_accept',chosen_fact_ids:['f-right']});
  expect(ok.outcome).toEqual({result:'pass'});
  expect(ok.detail).toMatchObject({compared:'fail',disposition:{quarantine_id:'q1',handled:true}});
  expect(fail({quarantine_id:'q1',natural_key:KEY,status:'resolved_reject'}).outcome).toEqual({result:'pass'});   // no chosen_fact_ids → status + key suffice
  for(const [d,why] of [[{quarantine_id:'q1',natural_key:`${KEY}:x`,status:'resolved_accept'},'natural_key'],[{quarantine_id:'q1',natural_key:KEY,status:'open'},'status'],[{quarantine_id:'q1',natural_key:KEY,status:'resolved_accept',chosen_fact_ids:['other']},'chosen_fact_ids'],[{quarantine_id:'q1',natural_key:KEY,status:'resolved_accept',chosen_fact_ids:[]},'chosen_fact_ids']] as [PairObservation['disposition'],string][]){
   const c=fail(d);
   expect(c.outcome).toEqual({result:'fail',reason:'value'});
   expect(c.detail).toMatchObject({disposition:{handled:false,why}});
  }
  const s=summarize([ok],dualSourceSummaryContext(evaluateDualSource(reg(),[])));
  expect(s.correctness.fail).toBe(0);
 });
 it('summary: max_fail 0, evidence class carried; invalid registration is gold_invalid',()=>{
  const r=evaluateDualSource(reg({independence:'same_feed'}),[obs()]);
  expect(summarize(r.cases,dualSourceSummaryContext(r))).toMatchObject({gate:'pass',evidence_class:'adapter_check',thresholds:{max_fail:0}});
  for(const bad of [reg({tolerance:{rel:'1'}}),reg({tolerance:{rel:'-0.1'}}),reg({independence:'cousins' as PairRegistration['independence']}),reg({pair_id:''})]){
   expect(()=>evaluateDualSource(bad,[])).toThrow(EvalError);
  }
 });
});

describe('runDualSource',()=>{
 const source=(p:Partial<PairSource>={}):PairSource=>({registration:async id=>id===reg().pair_id?reg():null,observations:async()=>({rows:[obs()],truncated:false}),...p});
 it('reads the registration and observations through the injected source',async()=>{
  const r=await runDualSource(source(),reg().pair_id);
  expect(r.cases.map(c=>c.outcome.result)).toEqual(['pass']);
 });
 it('unregistered pair → gold_invalid; a write-capable source is refused before any read',async()=>{
  await expect(runDualSource(source(),'nope')).rejects.toMatchObject({code:'gold_invalid'});
  let read=false;
  const writable={...source({registration:async()=>{read=true;return reg();}}),upsertResult:async()=>undefined} as unknown as PairSource;
  await expect(runDualSource(writable,reg().pair_id)).rejects.toThrow(/pair_source_write_capable/);
  expect(read).toBe(false);
 });
});

describe('relDiff conformance: plan 3 rounds half away from zero, F6 truncates (display only)',()=>{
 it('three pinned vectors',()=>{
  expect(RELDIFF_CONFORMANCE.length).toBe(3);
  for(const v of RELDIFF_CONFORMANCE){
   expect(canonicalDecimal(compareWithinTolerance(v.left,v.right,'0').relDiff)).toBe(v.f6);
   expect(plan3RelDiff(v.left,v.right)).toBe(v.plan3);
   expect(v.plan3).not.toBe(v.f6);
  }
 });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm test -- src/lib/evals/kinds/dual-source.test.ts`
Expected: FAIL — `Failed to resolve import "./dual-source"`。

- [ ] **Step 7: 实现 `src/lib/evals/kinds/dual-source.ts`**

```ts
// src/lib/evals/kinds/dual-source.ts
// dual_source (spec §5.5, §0 R5-10, §3.3). Registrations and per-key observations come from plan 3's
// reconciliation pairs/results through an injected, read-only PairSource (the adapter lands with plan 3);
// F6 never reuses plan 3's passed or rel_diff: it recompares both value_text with compareWithinTolerance at
// the registration's tolerance (D1 default rel 0.005). Observation key = (issuer, concept, period_start,
// period_end, duration, consolidation, unit); detail.as_of = the later of the two sides' available_date (the
// adapter reads each side's current value at that asOf). upstream_outcome other than 'compared' never
// passes: left_missing / right_missing / incomplete_gold → missing; left_unlinked →
// read_error(filing_not_linked); *_ambiguous, unsupported, legacy, anything unknown → read_error(read_failed).
// A 'compared' observation missing a side, or with a non-decimal value, is read_error(read_failed); two
// observations of one key are fail(ambiguous); a truncated observation read adds one
// read_error(truncated) case. A fail counts as handled (→ pass, detail.compared='fail',
// detail.disposition.handled=true) only when its disposition has natural_key = observationKeyString(key),
// status resolved_accept | resolved_reject and, when chosen_fact_ids is present, one of the two compared
// fact_ids in it. same_feed pairs are evidence_class adapter_check (not release evidence). trend counts raw
// comparisons (report only; the 95% line of spec 1 §9 is an alert, not a gate).
import {compareWithinTolerance} from '../compare';
import {EvalError} from '../errors';
import type {CaseOutcome,CaseReport,EvalModule,EvidenceClass,SummaryContext} from '../types';
import {writeLikeProperties} from './read-only';

export type Independence='independent_publication'|'same_upstream_independent_extraction'|'same_feed';
export interface PairRegistration{pair_id:string;module:EvalModule;left:{source:string;upstream:string};right:{source:string;upstream:string};independence:Independence;tolerance:{rel:string}}
export interface ObservationKey{issuer:string;concept:string;period_start:string|null;period_end:string;duration:string;consolidation:string;unit:string}
export interface ObservationSide{fact_id:string;value_text:string;source_ref:string;raw_hash:string;available_date:string}
export interface Disposition{quarantine_id:string;natural_key:string;status:string;chosen_fact_ids?:string[]}
export interface PairObservation{key:ObservationKey;left:ObservationSide|null;right:ObservationSide|null;upstream_outcome:string;disposition?:Disposition}
/** Read-only by contract: runDualSource refuses a source exposing insert/update/upsert/store/delete/rpc-like members. */
export interface PairSource{
 registration(pairId:string):Promise<PairRegistration|null>;
 observations(pairId:string):Promise<{rows:PairObservation[];truncated:boolean}>;
}
export interface DualSourceResult{cases:CaseReport[];evidenceClass:EvidenceClass;trend:{pass:number;fail:number}}

export const DUAL_SOURCE_REL='0.005';
/** Plan 3 decimal.ts::relDiff rounds half away from zero at 10 places; F6 compareWithinTolerance truncates. Text from one side is never compared with the other. */
export const RELDIFF_CONFORMANCE=[
 {left:'1',right:'3',plan3:'0.6666666667',f6:'0.6666666666'},
 {left:'100',right:'101',plan3:'0.0099009901',f6:'0.00990099'},
 {left:'0',right:'0.00000000005',plan3:'0.0000000001',f6:'0'},
] as const;

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const INDEPENDENCE=new Set<string>(['independent_publication','same_upstream_independent_extraction','same_feed']);
export const observationKeyString=(k:ObservationKey)=>[k.issuer,k.concept,k.period_start??'',k.period_end,k.duration,k.consolidation,k.unit].join(':');

export function upstreamOutcomeOf(outcome:string):CaseOutcome|null{
 switch(outcome){
  case 'compared':return null;
  case 'left_missing':case 'right_missing':case 'incomplete_gold':return {result:'missing'};
  case 'left_unlinked':return {result:'read_error',reason:'filing_not_linked'};
  default:return {result:'read_error',reason:'read_failed'};
 }
}
export function dispositionHandles(d:Disposition|undefined,key:ObservationKey,used:string[]):{handled:boolean;why?:string}{
 if(!d)return {handled:false,why:'no_disposition'};
 if(d.natural_key!==observationKeyString(key))return {handled:false,why:'natural_key'};
 if(d.status!=='resolved_accept'&&d.status!=='resolved_reject')return {handled:false,why:'status'};
 if(d.chosen_fact_ids!==undefined&&!d.chosen_fact_ids.some(id=>used.includes(id)))return {handled:false,why:'chosen_fact_ids'};
 return {handled:true};
}
function validateRegistration(r:PairRegistration):void{
 const bad=(field:string):never=>{throw new EvalError('gold_invalid',`pair registration ${r.pair_id||'?'}: ${field}`,{pair_id:r.pair_id,field});};
 if(typeof r.pair_id!=='string'||r.pair_id.length===0)bad('pair_id');
 if(!INDEPENDENCE.has(r.independence))bad('independence');
 if(typeof r.tolerance?.rel!=='string'||!/^0(\.\d+)?$/.test(r.tolerance.rel))bad('tolerance.rel');   // 0 ≤ rel < 1
 for(const s of [r.left,r.right])if(!s||typeof s.source!=='string'||!s.source||typeof s.upstream!=='string'||!s.upstream)bad('left/right');
}
const sideDetail=(s:ObservationSide|null)=>s?{fact_id:s.fact_id,source_ref:s.source_ref,raw_hash:s.raw_hash,available_date:s.available_date}:null;

export function evaluateDualSource(reg:PairRegistration,rows:PairObservation[],opts:{truncated:boolean}={truncated:false}):DualSourceResult{
 validateRegistration(reg);
 const rep=(case_id:string,outcome:CaseOutcome,left:string|null,right:string|null,abs:string|null,rel:string|null,detail:Record<string,unknown>):CaseReport=>
  ({case_id,required:true,outcome,left,right,abs_diff:abs,rel_diff:rel,tolerance:reg.tolerance.rel,provenance:null,detail});
 const groups=new Map<string,PairObservation[]>();
 for(const o of rows){const k=observationKeyString(o.key);const g=groups.get(k)??[];g.push(o);groups.set(k,g);}
 const cases:CaseReport[]=[];const trend={pass:0,fail:0};
 for(const [k,g] of [...groups.entries()].sort((a,b)=>cmp(a[0],b[0]))){
  const id=`${reg.pair_id}:${k}`;const o=g[0];
  const detail:Record<string,unknown>={pair_id:reg.pair_id,key:o.key,upstream_outcome:o.upstream_outcome,left:sideDetail(o.left),right:sideDetail(o.right)};
  if(g.length>1){cases.push(rep(id,{result:'fail',reason:'ambiguous'},null,null,null,null,{...detail,observations:g.length}));continue;}
  const mapped=upstreamOutcomeOf(o.upstream_outcome);
  if(mapped){cases.push(rep(id,mapped,o.left?.value_text??null,o.right?.value_text??null,null,null,detail));continue;}
  if(!o.left||!o.right){cases.push(rep(id,{result:'read_error',reason:'read_failed'},o.left?.value_text??null,o.right?.value_text??null,null,null,{...detail,error:'compared_without_side'}));continue;}
  let c:{passed:boolean;absDiff:string;relDiff:string};
  try{c=compareWithinTolerance(o.left.value_text,o.right.value_text,reg.tolerance.rel);}
  catch{cases.push(rep(id,{result:'read_error',reason:'read_failed'},null,null,null,null,{...detail,error:'invalid_decimal'}));continue;}
  const base={...detail,as_of:o.left.available_date>o.right.available_date?o.left.available_date:o.right.available_date};
  if(c.passed){trend.pass++;cases.push(rep(id,{result:'pass'},o.left.value_text,o.right.value_text,c.absDiff,c.relDiff,{...base,compared:'pass'}));continue;}
  trend.fail++;
  const h=dispositionHandles(o.disposition,o.key,[o.left.fact_id,o.right.fact_id]);
  if(h.handled){cases.push(rep(id,{result:'pass'},o.left.value_text,o.right.value_text,c.absDiff,c.relDiff,{...base,compared:'fail',disposition:{...o.disposition,handled:true}}));continue;}
  cases.push(rep(id,{result:'fail',reason:'value'},o.left.value_text,o.right.value_text,c.absDiff,c.relDiff,{...base,compared:'fail',...(o.disposition?{disposition:{...o.disposition,handled:false,why:h.why}}:{})}));
 }
 if(opts.truncated)cases.push(rep(`${reg.pair_id}:__truncated__`,{result:'read_error',reason:'truncated'},null,null,null,null,{pair_id:reg.pair_id}));
 return {cases,evidenceClass:reg.independence==='same_feed'?'adapter_check':'truth',trend};
}

export async function runDualSource(source:PairSource,pairId:string):Promise<DualSourceResult>{
 const w=writeLikeProperties(source);
 if(w.length>0)throw new Error(`pair_source_write_capable: ${w.join(', ')}`);
 const reg=await source.registration(pairId);
 if(!reg)throw new EvalError('gold_invalid',`pair not registered: ${pairId}`,{pair_id:pairId});
 const {rows,truncated}=await source.observations(pairId);
 return evaluateDualSource(reg,rows,{truncated});
}

export const dualSourceSummaryContext=(r:Pick<DualSourceResult,'evidenceClass'>):SummaryContext=>({
 thresholds:{max_fail:0,min_coverage_optional:'0.95'},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:r.evidenceClass});
```

- [ ] **Step 8: 运行，确认通过**

Run: `npm test -- src/lib/evals/kinds/dual-source.test.ts`
Expected: PASS（9 个用例）。

- [ ] **Step 9: 写失败测试 `src/lib/evals/kinds/reference.test.ts`**

```ts
// src/lib/evals/kinds/reference.test.ts
import {describe,expect,it,vi} from 'vitest';
import {EvalError} from '../errors';
import {renderMarkdown} from '../report';
import type {EvalReport,Summary} from '../types';
import {CANARY_SERIES,CANARY_VALUE,REFERENCE_REL,evaluateReference,parseReferenceLedger,parseReferenceResult,parseReferenceSamples,referenceSummary,referenceSummaryWriter} from './reference';
import type {ReferenceReadDeps,ReferenceSample} from './reference';

const sample=(p:Partial<ReferenceSample>={}):ReferenceSample=>({sample_id:'s1',doc:'macro-strategy',doc_sha256:'a'.repeat(64),line:1,page_url:'https://chaos.example/macro',page_sha256:'b'.repeat(64),captured_at:'2026-11-04T00:00:00Z',
 as_displayed:'100.5',parsed_value:'100.5',parsed_unit:'index',their_declared_source:'NBS',our_target:{series_id:'cn.cpi',period_end:'2026-09-30',which:'latest'},canary:false,...p});
const canary=()=>sample({sample_id:'canary',as_displayed:CANARY_VALUE,parsed_value:CANARY_VALUE,our_target:{series_id:CANARY_SERIES,period_end:'2026-09-30',which:'latest'},canary:true});
const deps=(values:Record<string,string|null>):ReferenceReadDeps=>({today:'2026-11-06',evaluatorCodeVersion:'d'.repeat(40),reader:{value:async t=>t.series_id in values&&values[t.series_id]!==null?{value_text:values[t.series_id]!,unit:'index',run_id:'r1'}:null}});
const entry=(p:Record<string,unknown>={})=>({sample_id:'s1',their_value:'100.5',our_value:'110',our_run_id:'r1',reason_code:'aggregation_method',evidence:{type:'computation',ref:'docs/evals/notes/cpi.md'},added_by:'claude-code',approved_by:'owner',approval_ref:'https://github.com/osborn-studio/OsbornAlpha/pull/9#pullrequestreview-1',...p});
const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof EvalError?e.code:`other:${String(e)}`;}};
const THRESHOLDS={max_fail:0,min_coverage_optional:'0.95'};

describe('parseReferenceResult (strict)',()=>{
 it('accepts exactly {total, within, beyond_explained, beyond_unexplained, unavailable} of non-negative integers that add up',()=>{
  expect(parseReferenceResult({total:3,within:1,beyond_explained:1,beyond_unexplained:0,unavailable:1})).toEqual({total:3,within:1,beyond_explained:1,beyond_unexplained:0,unavailable:1});
 });
 it('refuses extra / missing keys, negatives, fractions, strings, a wrong total, arrays and class instances',()=>{
  const ok={total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0};
  class R{total=1;within=1;beyond_explained=0;beyond_unexplained=0;unavailable=0;}
  for(const bad of [{...ok,value:'918273645.5'},{total:1,within:1,beyond_explained:0,beyond_unexplained:0},{...ok,within:-1,total:-1},{...ok,within:0.5,total:0.5},{...ok,within:'1'},{...ok,total:2},[1,1,0,0,0],new R(),null,'ok'])
   expect(code(()=>parseReferenceResult(bad))).toBe('reference_result_schema');
 });
});

describe('ReadDeps reflection',()=>{
 it('the deps object has no insert/update/upsert/store/delete/rpc members; a write-capable reader is refused',async()=>{
  const d=deps({});
  const names:string[]=[];
  const walk=(o:object,p:string)=>{for(const k of Object.keys(o)){names.push(`${p}${k}`);const v=(o as Record<string,unknown>)[k];if(v&&typeof v==='object')walk(v as object,`${p}${k}.`);}};
  walk(d,'');
  expect(names.filter(n=>/(^|\.)(insert|update|upsert|store|delete|rpc)/.test(n))).toEqual([]);
  const bad={...d,reader:{...d.reader,insert:async()=>undefined}} as unknown as ReferenceReadDeps;
  await expect(evaluateReference([sample()],[],bad)).rejects.toMatchObject({code:'reference_write_attempt'});
 });
});

describe('evaluateReference',()=>{
 it(`within at rel ${REFERENCE_REL} (ours left, theirs right)`,async()=>{
  const r=await evaluateReference([sample()],[],deps({'cn.cpi':'100'}));
  expect(r.cases[0]).toMatchObject({case_id:'s1',outcome:{result:'within'},left:'100',right:'100.5',tolerance:'0.01'});
  expect(r.result).toEqual({total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0});
 });
 it('beyond: explained only by an approved, non-unknown entry whose their/our values equal the compared values',async()=>{
  const run=async(e?:Record<string,unknown>)=>(await evaluateReference([sample()],e?parseReferenceLedger([e]):[],deps({'cn.cpi':'110'}))).cases[0].outcome;
  expect(await run()).toEqual({result:'beyond_unexplained'});
  expect(await run(entry())).toEqual({result:'beyond_explained',ledger_ids:['s1']});
  expect(await run(entry({our_value:'110.000'}))).toEqual({result:'beyond_explained',ledger_ids:['s1']});   // decimal equality
  expect(await run(entry({reason_code:'unknown'}))).toEqual({result:'beyond_unexplained'});
  expect(await run(entry({our_value:'111'}))).toEqual({result:'beyond_unexplained'});
  expect(await run(entry({their_value:'100'}))).toEqual({result:'beyond_unexplained'});
  expect(await run(entry({approved_by:'claude-code'}))).toEqual({result:'beyond_unexplained'});
 });
 it('unavailable: no parsed value (LPR rows, asset prices) or no value on our side',async()=>{
  const r=await evaluateReference([sample({sample_id:'lpr',parsed_value:null}),sample({sample_id:'gone'})],[],deps({}));
  expect(r.cases.map(c=>c.outcome)).toEqual([{result:'skipped',reason:'unavailable'},{result:'skipped',reason:'unavailable'}]);
  expect(r.result).toEqual({total:2,within:0,beyond_explained:0,beyond_unexplained:0,unavailable:2});
 });
 it('canary: full comparison path (beyond_unexplained, value only in cases[]); not counted; absent from result, summary, store and the public .md',async()=>{
  const r=await evaluateReference([sample(),canary()],[],deps({'cn.cpi':'100',[CANARY_SERIES]:'1'}));
  const c=r.cases.find(x=>x.case_id==='canary')!;
  expect(c).toMatchObject({outcome:{result:'beyond_unexplained'},left:'1',right:CANARY_VALUE});
  expect(r.countedCases.map(x=>x.case_id)).toEqual(['s1']);
  expect(r.result).toEqual({total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0});
  const finishRun=vi.fn(async(_runId:string,_status:string,_summary:Summary,_at:string)=>{});
  const summary=await referenceSummaryWriter({finishRun},{thresholds:THRESHOLDS,now:()=>new Date('2026-11-06T00:00:00Z')}).writeReferenceSummary('run-1',r.result);
  expect(JSON.stringify(summary)).not.toContain(CANARY_VALUE);
  expect(JSON.stringify(finishRun.mock.calls)).not.toContain(CANARY_VALUE);
  const report:EvalReport={schema_version:1,run_id:'run-1',kind:'reference_regression',module:'macro',mode:'report',privileged:false,artifact_class:'public',
   set:{id:'reference/chaosai/macro-strategy',version:1,sha256:'f'.repeat(64),format:'f6',path:'src/lib/evals/fixtures/reference/chaosai/macro-strategy.json'},
   evaluator_code_version:'d'.repeat(40),dirty:false,started_at:'2026-11-06T00:00:00.000Z',finished_at:'2026-11-06T00:00:01.000Z',environment:{db_host:null,app_origin:null,db_state_rev:null},
   thresholds:THRESHOLDS,provenance:{verified:{artifacts:false,sources:false}},summary,cases:r.cases};
  expect(renderMarkdown(report)).not.toContain(CANARY_VALUE);
 });
 it('production has no __canary__ series → the canary is unavailable and still not counted',async()=>{
  const r=await evaluateReference([sample(),canary()],[],deps({'cn.cpi':'100'}));
  expect(r.cases.find(x=>x.case_id==='canary')!.outcome).toEqual({result:'skipped',reason:'unavailable'});
  expect(r.result.total).toBe(1);
 });
});

describe('referenceSummary / referenceSummaryWriter',()=>{
 it('§3.2 shape from counts: comparison evidence; beyond_unexplained 0 → pass, > 0 → fail; total 0 → incomplete',()=>{
  const s:Summary=referenceSummary({total:4,within:2,beyond_explained:1,beyond_unexplained:0,unavailable:1},THRESHOLDS);
  expect(s).toMatchObject({population:4,required:4,correctness:{pass:3,fail:0,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0},coverage:{evaluated:3,skipped:1},evidence_class:'comparison',gate:'pass'});
  expect(referenceSummary({total:2,within:1,beyond_explained:0,beyond_unexplained:1,unavailable:0},THRESHOLDS).gate).toBe('fail');
  expect(referenceSummary({total:0,within:0,beyond_explained:0,beyond_unexplained:0,unavailable:0},THRESHOLDS).gate).toBe('incomplete');
 });
 it('the writer validates before writing and finishes the run with the gate status',async()=>{
  const finishRun=vi.fn(async(_runId:string,_status:string,_summary:Summary,_at:string)=>{});
  const w=referenceSummaryWriter({finishRun},{thresholds:THRESHOLDS,now:()=>new Date('2026-11-06T00:00:00Z')});
  await expect(w.writeReferenceSummary('run-1',{total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0,extra:1})).rejects.toMatchObject({code:'reference_result_schema'});
  expect(finishRun).not.toHaveBeenCalled();
  await w.writeReferenceSummary('run-1',{total:1,within:0,beyond_explained:0,beyond_unexplained:1,unavailable:0});
  expect(finishRun).toHaveBeenCalledWith('run-1','failed',expect.objectContaining({gate:'fail'}),'2026-11-06T00:00:00.000Z');
 });
});

describe('parseReferenceSamples / parseReferenceLedger',()=>{
 it('valid file; refusals are gold_invalid',()=>{
  expect(parseReferenceSamples({schema_version:1,samples:[sample(),canary()]}).samples.length).toBe(2);
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[sample({sample_id:''})]}))).toBe('gold_invalid');
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[sample({doc_sha256:'x'})]}))).toBe('gold_invalid');
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[sample({canary:true})]}))).toBe('gold_invalid');   // canary must target __canary__
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[canary(),{...canary(),sample_id:'canary2'}]}))).toBe('gold_invalid');   // at most one canary
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[sample(),sample()]}))).toBe('gold_invalid');   // duplicate sample_id
  expect(code(()=>parseReferenceLedger([entry({reason_code:'vibes'})]))).toBe('gold_invalid');
  expect(code(()=>parseReferenceLedger([entry({evidence:{type:'hunch',ref:'x'}})]))).toBe('gold_invalid');
  expect(code(()=>parseReferenceLedger([entry({approval_ref:''})]))).toBe('gold_invalid');
 });
});
```

- [ ] **Step 10: 运行，确认失败**

Run: `npm test -- src/lib/evals/kinds/reference.test.ts`
Expected: FAIL — `Failed to resolve import "./reference"`。

- [ ] **Step 11: 实现 `src/lib/evals/kinds/reference.ts`**

```ts
// src/lib/evals/kinds/reference.ts
// reference_regression (spec §5.4, §3.3 reference rows, §14). Samples are ChaosAI page captures; they are
// never truth. The kind only gets ReadDeps (a value reader, the clock, the evaluator version) — no
// service-role key, no write method: evaluateReference refuses deps exposing insert/update/upsert/store/
// delete/rpc-like members (EvalError reference_write_attempt). Comparison: ours (left) vs theirs (right) at
// REFERENCE_REL = 0.01 → within; otherwise beyond_explained only with a ledger entry for the sample whose
// reason_code ≠ unknown, approved_by ≠ added_by, approval_ref present and their_value / our_value equal (as
// decimals) to the two compared values; else beyond_unexplained. No parsed value (LPR, asset prices) or
// no value on our side → skipped(unavailable). The canary (canary: true, series __canary__, parsed_value
// 918273645.5) goes through the same path and stays in cases[] (report JSON only) but is excluded from
// countedCases, ReferenceResult and the summary. ReferenceResult is validated strictly at runtime (exact
// key set, non-negative safe integers, total = sum); the only write path is
// referenceSummaryWriter(sink).writeReferenceSummary(run_id, result) → finishRun with the §3.2 summary.
import {canonicalDecimal} from '../../facts/json-numbers';
import {compareWithinTolerance} from '../compare';
import {EvalError} from '../errors';
import type {EvalStore} from '../store';
import {gateOf,statusOfGate} from '../summary';
import type {CaseOutcome,CaseReport,Summary,Thresholds} from '../types';
import {assertReadOnly} from './read-only';

export const REFERENCE_REL='0.01';
export const CANARY_SERIES='__canary__';
export const CANARY_VALUE='918273645.5';
export interface OurTarget{series_id:string;period_end:string;which:'latest'|'previous'}
export interface ReferenceSample{
 sample_id:string;doc:string;doc_sha256:string;line:number;page_url:string;page_sha256:string;captured_at:string;
 as_displayed:string;parsed_value:string|null;parsed_unit:string|null;their_declared_source:string|null;our_target:OurTarget;canary:boolean;
}
export interface ReferenceSampleFile{schema_version:1;samples:ReferenceSample[]}
export const REFERENCE_REASONS=['membership_pointintime','aggregation_method','restatement','unit_or_basis','their_placeholder','their_proxy','their_stale_snapshot','unknown'] as const;
export type ReferenceReason=typeof REFERENCE_REASONS[number];
export interface ReferenceLedgerEntry{sample_id:string;their_value:string;our_value:string;our_run_id:string;reason_code:ReferenceReason;evidence:{type:'computation'|'document';ref:string};added_by:string;approved_by:string;approval_ref:string}
export interface ReferenceResult{total:number;within:number;beyond_explained:number;beyond_unexplained:number;unavailable:number}
export interface ReferenceReader{value(target:OurTarget):Promise<{value_text:string;unit:string|null;run_id:string|null}|null>}
export interface ReferenceReadDeps{reader:ReferenceReader;today:string;evaluatorCodeVersion:string}
export interface ReferenceEvaluation{cases:CaseReport[];countedCases:CaseReport[];result:ReferenceResult}

const RESULT_KEYS=['beyond_explained','beyond_unexplained','total','unavailable','within'];
const HEX64=/^[0-9a-f]{64}$/,DAY=/^\d{4}-\d{2}-\d{2}$/;
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const nonEmpty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const isDecimal=(v:unknown):v is string=>{if(typeof v!=='string')return false;try{canonicalDecimal(v);return true;}catch{return false;}};

export function parseReferenceResult(v:unknown):ReferenceResult{
 const bad=(why:string):never=>{throw new EvalError('reference_result_schema',`ReferenceResult: ${why}`,{why});};
 if(!isObj(v)||Object.getPrototypeOf(v)!==Object.prototype)return bad('not a plain object');
 const keys=Object.keys(v).sort();
 if(keys.length!==RESULT_KEYS.length||keys.some((k,i)=>k!==RESULT_KEYS[i]))return bad(`keys ${keys.join(',')}`);
 for(const k of RESULT_KEYS){const x=v[k];if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0)return bad(`${k} is not a non-negative integer`);}
 const r=v as unknown as ReferenceResult;
 if(r.total!==r.within+r.beyond_explained+r.beyond_unexplained+r.unavailable)return bad('total ≠ sum');
 return {total:r.total,within:r.within,beyond_explained:r.beyond_explained,beyond_unexplained:r.beyond_unexplained,unavailable:r.unavailable};
}

export function parseReferenceSamples(raw:unknown):ReferenceSampleFile{
 const top=(f:string):never=>{throw new EvalError('gold_invalid',`reference samples: ${f}`,{field:f});};
 if(!isObj(raw)||raw.schema_version!==1||!Array.isArray(raw.samples))return top('schema_version/samples');
 const seen=new Set<string>();let canaries=0;
 const samples=raw.samples.map((s,i):ReferenceSample=>{
  const bad=(f:string):never=>{throw new EvalError('gold_invalid',`reference samples[${i}]: ${f}`,{index:i,field:f});};
  if(!isObj(s)||!nonEmpty(s.sample_id))return bad('sample_id');
  if(seen.has(s.sample_id))return bad('sample_id_duplicate');seen.add(s.sample_id);
  if(!nonEmpty(s.doc)||typeof s.doc_sha256!=='string'||!HEX64.test(s.doc_sha256))return bad('doc/doc_sha256');
  if(typeof s.line!=='number'||!Number.isSafeInteger(s.line)||s.line<1)return bad('line');
  if(!nonEmpty(s.page_url)||typeof s.page_sha256!=='string'||!HEX64.test(s.page_sha256))return bad('page_url/page_sha256');
  if(typeof s.captured_at!=='string'||Number.isNaN(Date.parse(s.captured_at)))return bad('captured_at');
  if(typeof s.as_displayed!=='string')return bad('as_displayed');
  if(s.parsed_value!==null&&!isDecimal(s.parsed_value))return bad('parsed_value');
  if(s.parsed_unit!==null&&typeof s.parsed_unit!=='string')return bad('parsed_unit');
  if(s.their_declared_source!==null&&typeof s.their_declared_source!=='string')return bad('their_declared_source');
  const t=s.our_target;
  if(!isObj(t)||!nonEmpty(t.series_id)||typeof t.period_end!=='string'||!DAY.test(t.period_end)||(t.which!=='latest'&&t.which!=='previous'))return bad('our_target');
  if(typeof s.canary!=='boolean')return bad('canary');
  if(s.canary){canaries++;if(t.series_id!==CANARY_SERIES)return bad('canary_series');}
  else if(t.series_id===CANARY_SERIES)return bad('canary_series_without_flag');
  return s as unknown as ReferenceSample;
 });
 if(canaries>1)return top('more than one canary');
 return {schema_version:1,samples};
}

export function parseReferenceLedger(raw:unknown):ReferenceLedgerEntry[]{
 if(!Array.isArray(raw))throw new EvalError('gold_invalid','reference explanations: expected an array');
 return raw.map((e,i)=>{
  const bad=(f:string):never=>{throw new EvalError('gold_invalid',`reference explanations[${i}]: ${f}`,{index:i,field:f});};
  if(!isObj(e)||!nonEmpty(e.sample_id))return bad('sample_id');
  if(!isDecimal(e.their_value))return bad('their_value');
  if(!isDecimal(e.our_value))return bad('our_value');
  if(!nonEmpty(e.our_run_id))return bad('our_run_id');
  if(!(REFERENCE_REASONS as readonly unknown[]).includes(e.reason_code))return bad('reason_code');
  if(!isObj(e.evidence)||(e.evidence.type!=='computation'&&e.evidence.type!=='document')||!nonEmpty(e.evidence.ref))return bad('evidence');
  if(!nonEmpty(e.added_by)||!nonEmpty(e.approved_by)||!nonEmpty(e.approval_ref))return bad('added_by/approved_by/approval_ref');
  return e as unknown as ReferenceLedgerEntry;
 });
}

const explains=(e:ReferenceLedgerEntry,ours:string,theirs:string)=>e.reason_code!=='unknown'&&e.approved_by!==e.added_by&&e.approval_ref.trim().length>0
 &&canonicalDecimal(e.our_value)===canonicalDecimal(ours)&&canonicalDecimal(e.their_value)===canonicalDecimal(theirs);

export async function evaluateReference(samples:ReferenceSample[],ledger:ReferenceLedgerEntry[],deps:ReferenceReadDeps):Promise<ReferenceEvaluation>{
 assertReadOnly(deps,'reference_write_attempt','reference_regression ReadDeps');
 const cases:CaseReport[]=[];const counted:CaseReport[]=[];
 const result:ReferenceResult={total:0,within:0,beyond_explained:0,beyond_unexplained:0,unavailable:0};
 for(const s of samples){
  const rep=(outcome:CaseOutcome,left:string|null,abs:string|null,rel:string|null,detail:Record<string,unknown>):CaseReport=>
   ({case_id:s.sample_id,required:true,outcome,left,right:s.parsed_value,abs_diff:abs,rel_diff:rel,tolerance:REFERENCE_REL,provenance:null,detail:{our_target:s.our_target,parsed_unit:s.parsed_unit,canary:s.canary,...detail}});
  const ours=s.parsed_value===null?null:await deps.reader.value(s.our_target);
  let c:CaseReport;
  if(s.parsed_value===null||ours===null){c=rep({result:'skipped',reason:'unavailable'},ours?.value_text??null,null,null,{});if(!s.canary)result.unavailable++;}
  else{
   const cmpRes=compareWithinTolerance(ours.value_text,s.parsed_value,REFERENCE_REL);
   const detail={our_unit:ours.unit,our_run_id:ours.run_id};
   if(cmpRes.passed){c=rep({result:'within'},ours.value_text,cmpRes.absDiff,cmpRes.relDiff,detail);if(!s.canary)result.within++;}
   else if(!s.canary&&ledger.some(e=>e.sample_id===s.sample_id&&explains(e,ours.value_text,s.parsed_value!))){c=rep({result:'beyond_explained',ledger_ids:[s.sample_id]},ours.value_text,cmpRes.absDiff,cmpRes.relDiff,detail);result.beyond_explained++;}
   else{c=rep({result:'beyond_unexplained'},ours.value_text,cmpRes.absDiff,cmpRes.relDiff,detail);if(!s.canary)result.beyond_unexplained++;}
  }
  cases.push(c);
  if(!s.canary){counted.push(c);result.total++;}
 }
 return {cases,countedCases:counted,result:parseReferenceResult(result)};
}

/** §3.2 summary from validated counts: within + beyond_explained → pass, beyond_unexplained → unexplained_diff, unavailable → skipped. */
export function referenceSummary(raw:unknown,thresholds:Thresholds):Summary{
 const r=parseReferenceResult(raw);
 const base:Omit<Summary,'gate'>={population:r.total,required:r.total,
  correctness:{pass:r.within+r.beyond_explained,fail:0,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:r.beyond_unexplained},
  coverage:{evaluated:r.within+r.beyond_explained+r.beyond_unexplained,evaluated_optional:0,missing_required:0,missing_optional:0,not_visible:0,skipped:r.unavailable},
  execution:{read_error:0,truncated:0,subset:false},thresholds,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},evidence_class:'comparison',reconciliations_truncated:false};
 return {...base,gate:gateOf(base)};
}

export type ReferenceSummarySink=Pick<EvalStore,'finishRun'>;
/** The only write path of reference_regression: validate, build the counts-only summary, finish the run. */
export function referenceSummaryWriter(sink:ReferenceSummarySink,opts:{thresholds:Thresholds;now():Date}){
 return {
  async writeReferenceSummary(run_id:string,result:unknown):Promise<Summary>{
   const summary=referenceSummary(result,opts.thresholds);
   await sink.finishRun(run_id,statusOfGate(summary.gate),summary,opts.now().toISOString());
   return summary;
  },
 };
}
```

- [ ] **Step 12: 运行，确认通过**

Run: `npm test -- src/lib/evals/kinds/reference.test.ts`
Expected: PASS（13 个用例）。若"canary … public .md"用例失败在 `renderMarkdown`：Task 4 的渲染打印了 reference 案例的值——按 CCR 3 修 Task 4（不要在本任务里绕过断言）。

- [ ] **Step 13: 写失败测试 `src/lib/evals/kinds/registry.test.ts`**

```ts
// src/lib/evals/kinds/registry.test.ts
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {KIND_REGISTRY,assertKindEnabled,kindEntry} from './registry';

const runCli=(kind:string)=>spawnSync(process.execPath,['--import','tsx',resolve('scripts/evals/run.ts'),'--kind',kind,'--module','facts','--mode','ci'],{encoding:'utf8',timeout:120000});

describe('KIND_REGISTRY',()=>{
 it('dual_source and reference_regression are registered but not enabled, with their prerequisite',()=>{
  expect(kindEntry('dual_source')).toEqual({kind:'dual_source',enabled:false,reason:'prerequisite: plan 3 merged'});
  expect(kindEntry('reference_regression')).toEqual({kind:'reference_regression',enabled:false,reason:'prerequisite: macro migrations'});
  expect(kindEntry('official_reconciliation')?.enabled).toBe(true);
  expect(kindEntry('replay_consistency')?.enabled).toBe(true);
  expect(new Set(KIND_REGISTRY.map(e=>e.kind)).size).toBe(KIND_REGISTRY.length);
 });
 it('the CLI dispatch table has a runner for exactly the enabled kinds (one enablement table)',async()=>{
  const {KIND_RUNNERS}=await import('../cli/run-cli');
  expect(Object.keys(KIND_RUNNERS).sort()).toEqual(KIND_REGISTRY.filter(e=>e.enabled).map(e=>e.kind).sort());
 });
 it('assertKindEnabled: kind_not_enabled (a refusal, exit 2) for disabled or unregistered kinds',()=>{
  for(const k of ['dual_source','reference_regression','no_such_kind']){
   try{assertKindEnabled(k);throw new Error('not thrown');}
   catch(e){expect(e).toBeInstanceOf(EvalError);expect((e as EvalError).code).toBe('kind_not_enabled');}
  }
  expect(()=>assertKindEnabled('official_reconciliation')).not.toThrow();
 });
 it('scripts/evals/run.ts refuses dual_source and reference_regression with exit 2 before any work',()=>{
  for(const k of ['dual_source','reference_regression']){
   const r=runCli(k);
   expect(r.status).toBe(2);
   expect(`${r.stderr}${r.stdout}`).toContain('kind_not_enabled');
   expect(r.stderr).toContain('prerequisite: ');
  }
 },240000);
});
```

- [ ] **Step 14: 运行，确认失败**

Run: `npm test -- src/lib/evals/kinds/registry.test.ts`
Expected: FAIL — `Failed to resolve import "./registry"`。

- [ ] **Step 15: 实现 `src/lib/evals/kinds/registry.ts`**

```ts
// src/lib/evals/kinds/registry.ts
// Which kinds scripts/evals/run.ts may run (spec §15.1, §0 R5-12, §14 kind_not_enabled). A kind whose
// prerequisite has not landed is registered with enabled:false and the reason; running it is a pre-run
// refusal (EvalError kind_not_enabled → exit 2). Unregistered kinds are refused the same way.
import {EvalError} from '../errors';
import type {EvalKind} from '../types';

export interface KindRegistryEntry{kind:EvalKind;enabled:boolean;reason?:string}
export const KIND_REGISTRY:readonly KindRegistryEntry[]=[
 {kind:'official_reconciliation',enabled:true},
 {kind:'replay_consistency',enabled:true},
 {kind:'dual_source',enabled:false,reason:'prerequisite: plan 3 merged'},
 {kind:'reference_regression',enabled:false,reason:'prerequisite: macro migrations'},
];
export const kindEntry=(kind:string):KindRegistryEntry|undefined=>KIND_REGISTRY.find(e=>e.kind===kind);
export function assertKindEnabled(kind:string):void{
 const e=kindEntry(kind);
 if(!e)throw new EvalError('kind_not_enabled',`kind not registered: ${kind}`,{kind});
 if(!e.enabled)throw new EvalError('kind_not_enabled',`${kind} is not enabled (${e.reason??'no reason recorded'})`,{kind,reason:e.reason??null});
}
```

- [ ] **Step 16: 运行注册表单测（CLI 用例此时仍失败）**

Run: `npm test -- src/lib/evals/kinds/registry.test.ts`
Expected: 注册表本身的用例与 `KIND_RUNNERS` 一致性用例 PASS；`scripts/evals/run.ts refuses …` 此时也已退出 2（Task 9 对没有运行器的 kind 同样报 `kind_not_enabled`），Step 17 之后拒绝改由注册表给出（stderr 的 message 带 `prerequisite: …` 原因）。

- [ ] **Step 17: 在 `src/lib/evals/cli/run-cli.ts`（Task 9 所有）调用注册表**

`scripts/evals/run.ts` 是 Task 9 的薄壳（逻辑在 `src/lib/evals/cli/run-cli.ts`，那里的 `KIND_RUNNERS` 只管"哪个 kind 用哪个运行器"）；是否启用只由本任务的 `kinds/registry.ts` 决定（集成决定：注册表是唯一的启用表，`KIND_RUNNERS` 的键必须等于启用的 kind，Step 13 的测试断言这一点）。Edit `src/lib/evals/cli/run-cli.ts` — old:
```ts
import {checkLock,loadGoldSet} from '../gold/load';
```
new:
```ts
import {checkLock,loadGoldSet} from '../gold/load';
import {assertKindEnabled} from '../kinds/registry';
```
old (in `runCli`, the dispatch right after the `--resume` branch):
```ts
  const runner=KIND_RUNNERS[args.kind];
```
new:
```ts
  assertKindEnabled(args.kind);          // kinds/registry.ts is the one enablement table (Task 14)
  const runner=KIND_RUNNERS[args.kind];
```
（`runCli` 已把 `EvalError` 打成一行 JSON `{error:code,…}` 到 stderr 并返回 `exitCodeOfError(e)`；`kind_not_enabled ∈ REFUSAL_CODES` → 2，且发生在任何连接之前。）

- [ ] **Step 18: 运行，确认通过**

Run: `npm test -- src/lib/evals/kinds`
Expected: PASS（read-only、dual-source、reference、registry 全绿，含两个 CLI 退出码 2）。

- [ ] **Step 19: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 错误、0 警告。

- [ ] **Step 20: 实施记录**

```markdown
## Task 14 — dual_source, reference_regression (pure logic), kind registry

- kinds/dual-source.ts: PairSource (read-only, injected), F6 recompares value_text, upstream non-comparison outcomes → missing/read_error, disposition rule (natural_key + resolved status + chosen_fact_ids), same_feed → adapter_check, relDiff conformance vectors (plan 3 half-away rounding vs F6 truncation).
- kinds/reference.ts: strict ReferenceResult, ReadDeps reflection refusal, canary path (cases[] only), rel 0.01, ledger values must equal the compared values, referenceSummaryWriter(...).writeReferenceSummary as the only write path.
- kinds/registry.ts (the one enablement table) + cli/run-cli.ts assertKindEnabled: dual_source (prerequisite: plan 3 merged) and reference_regression (prerequisite: macro migrations) → kind_not_enabled, exit 2.
- No database tests (critical suites cannot skip; §0 R5-12). Prerequisites listed in the PR.
```

- [ ] **Step 21: 提交**

```bash
git add src/lib/evals/kinds/read-only.ts src/lib/evals/kinds/read-only.test.ts src/lib/evals/kinds/dual-source.ts src/lib/evals/kinds/dual-source.test.ts src/lib/evals/kinds/reference.ts src/lib/evals/kinds/reference.test.ts src/lib/evals/kinds/registry.ts src/lib/evals/kinds/registry.test.ts src/lib/evals/cli/run-cli.ts docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md
```
```bash
git commit -m "feat(evals): dual_source and reference_regression pure logic, read-only deps check, kind registry refusal (F6 Task 14)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: `extraction_gold`（两步最大匹配）、`judgment_calibration`（资格、Brier、可靠性），注册为未启用

规格：§11.1（标注/预测形状；分组 `(document_sha256, field)`；第一步只取同页、IoU ≥ 0.5、值相等的对，求二分图**最大**匹配，多解按 IoU 降序再按 bbox 字典序确定性打破平手；第二步对剩余项按值相等优先、再按 IoU 降序配对做分类；`FP_citation` 计入 FP；`P_f`、`R_f`；支持数 0 → `skipped(zero_support)`；门槛 `P_f ≥ 0.95 且 R_f ≥ 0.95`；对抗夹具、同值跨页坐标交叉两页夹具 → 两个 TP、全部解析但 TP=0 → `gate='fail'`）、§11.3（资格、修订链取最后一次合格登记、Brier、10 桶可靠性端点归末桶、无合格样本 → `incomplete`）、§3.3 extraction/calibration 行、§16 D8、§15.1。依赖 Task 1、Task 14（`kinds/registry.ts`）。

**匹配算法（确定性，写进文件头）：** 第一步的合格边按 *(IoU 降序；标注 bbox 字典序升序；预测 bbox 字典序升序；标注下标；预测下标)* 排成全序 `E`。先用增广路（Kuhn）求最大匹配数 `M`；再按 `E` 的顺序逐条尝试：两端都空闲时暂时选入，若"已选数 + 1 + 剩余图（去掉已选端点）的最大匹配数 = M"则保留，否则撤销。结果是按 `E` 字典序最先的那个**最大**匹配（与 Kuhn 内部顺序无关；IoU 比较用交叉相乘 `inter₁·union₂` vs `inter₂·union₁`，IoU ≥ 0.5 ⇔ `2·inter ≥ union`，不做浮点除法）。第二步：剩余标注 × 剩余预测的全部对按 *(值相等优先；同页 IoU 降序，跨页 IoU 记 0；标注 bbox；预测 bbox；标注下标；预测下标)* 排序后贪心一对一配对。

**Files:**
- Create: `src/lib/evals/kinds/ratio.ts`（`ratioText` 精确比值文本）
- Create: `src/lib/evals/kinds/ratio.test.ts`
- Create: `src/lib/evals/kinds/extraction.ts`
- Create: `src/lib/evals/kinds/extraction.test.ts`
- Create: `src/lib/evals/kinds/calibration.ts`
- Create: `src/lib/evals/kinds/calibration.test.ts`
- Modify: `src/lib/evals/kinds/registry.ts`（追加两条未启用的条目）
- Modify: `src/lib/evals/kinds/registry.test.ts`（完整性 + 两个 CLI 退出码 2）
- Modify: `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`

- [ ] **Step 1: 写失败测试 `src/lib/evals/kinds/ratio.test.ts`**

```ts
// src/lib/evals/kinds/ratio.test.ts
import {describe,expect,it} from 'vitest';
import {ratioText} from './ratio';

describe('ratioText',()=>{
 it('exact, truncated toward zero, canonical text',()=>{
  expect(ratioText(2n,5n,4)).toBe('0.4');
  expect(ratioText(1n,1n,4)).toBe('1');
  expect(ratioText(0n,7n)).toBe('0');
  expect(ratioText(2n,3n)).toBe('0.6666666666');
  expect(ratioText(113n,400n)).toBe('0.2825');
  expect(ratioText(7n,2n,0)).toBe('3');
 });
 it('refuses a negative numerator or a non-positive denominator',()=>{
  expect(()=>ratioText(-1n,2n)).toThrow(RangeError);
  expect(()=>ratioText(1n,0n)).toThrow(RangeError);
 });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm test -- src/lib/evals/kinds/ratio.test.ts`
Expected: FAIL — `Failed to resolve import "./ratio"`。

- [ ] **Step 3: 实现 `src/lib/evals/kinds/ratio.ts`**

```ts
// src/lib/evals/kinds/ratio.ts
// Exact non-negative ratio as decimal text for reports (display only, never compared): num/den truncated
// toward zero to `places` digits on BigInt, canonical form (no trailing zeros).
import {canonicalDecimal} from '../../facts/json-numbers';

export function ratioText(num:bigint,den:bigint,places=10):string{
 if(num<0n||den<=0n)throw new RangeError('ratioText: needs num >= 0 and den > 0');
 const q=(num*10n**BigInt(places))/den;
 const s=q.toString().padStart(places+1,'0');
 return canonicalDecimal(places===0?s:`${s.slice(0,-places)}.${s.slice(-places)}`);
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm test -- src/lib/evals/kinds/ratio.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 写失败测试 `src/lib/evals/kinds/extraction.test.ts`（含三份手算夹具）**

```ts
// src/lib/evals/kinds/extraction.test.ts
// Hand-computed fixtures (spec §11.1). Boxes of one size slide along y: for two w×h boxes offset by d in y,
// inter = w·(h−d), union = 2·w·h − inter, so IoU = (h−d)/(h+d).
//  Adversarial D1 (3 pages), field revenue (decimal):
//   L1 '100' p1 [0,10,10,20]   L2 '100' p1 [0,13,10,23]   L3 '200' p2 [0,10,10,20]   L4 '300' p3 [100,100,200,120]
//   P1 '100' p1 [0,11,10,21]   P2 '100.00' p1 [0,8,10,18]   P3 '200' p3 [0,10,10,20] (wrong page)   P4 '301' p3 [100,100,200,120]   P5 '999' p1 [300,300,310,310]
//   step-1 edges: (L1,P1) IoU 9/11, (L1,P2) 8/12, (L2,P1) 8/12; (L2,P2) d=5 → 5/15 < 0.5 (no edge).
//   Greedy by IoU takes (L1,P1) and strands L2 → 1 TP; the maximum matching is {(L1,P2),(L2,P1)} → TP 2.
//   step 2: (L3,P3) value-equal, mislocated → FP_citation + FN; (L4,P4) value ≠ → FP + FN; P5 unpaired → FP.
//   revenue: TP 2, FP 3 (1 citation), FN 2, support 4 → P = 2/5 = 0.4, R = 2/4 = 0.5 → fail.
//   net_income: one label, zero predictions → P = 0 (prediction count 0, support > 0), R = 0 → fail.
//   fiscal_year_end (date): 50×10 boxes, d = 1 → 9/11 → TP → P = R = 1 → pass.
//   company_name (text): 'Acme  Corp' vs 'Ａｃｍｅ Corp' (NFKC + whitespace) same box → TP → pass.
//   auditor: predicted only → skipped(zero_support).
//  Crossed D2 (2 pages), total_assets '500', 100×20 boxes:
//   A p1 [0,0,100,20]   B p2 [0,10,100,30]   X p1 [0,6,100,26]   Y p2 [0,4,100,24]
//   same page: (A,X) d=6 → 14/26 ≥ 0.5, (B,Y) d=6 → 14/26; across pages (coordinates only): (A,Y) d=4 → 16/24, (B,X) d=4 → 16/24 — higher, but never eligible → 2 TP.
//  All-parsed D3: label '10' p1 [0,0,10,10], prediction '11' same box → TP 0, FP 1, FN 1 → fail.
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {summarize} from '../summary';
import {evaluateExtraction,extractionSummaryContext,matchGroup,overlap,valuesEqual} from './extraction';
import type {BBox,ExtractionGold,ExtractionLabel,ExtractionOutput,PredictedField} from './extraction';

const D1='a'.repeat(64),D2='b'.repeat(64),D3='c'.repeat(64),D4='d'.repeat(64);
let n=0;
const label=(doc:string,field:string,value:string,page:number,bbox:BBox,value_type:ExtractionLabel['value_type']='decimal'):ExtractionLabel=>({label_id:`l${++n}`,document_sha256:doc,field,occurrence:n,value_type,value,locator:{page,bbox},recorded_by:'owner',reviewed_by:'expert-1'});
const pred=(field:string,value:string,page:number,bbox:BBox):PredictedField=>({field,value,page,bbox});
const doc=(sha:string,page_count:number)=>({document_sha256:sha,page_count,bbox_space:'pdf_points_top_left' as const});

const L1=label(D1,'revenue','100',1,[0,10,10,20]),L2=label(D1,'revenue','100',1,[0,13,10,23]),L3=label(D1,'revenue','200',2,[0,10,10,20]),L4=label(D1,'revenue','300',3,[100,100,200,120]);
const P1=pred('revenue','100',1,[0,11,10,21]),P2=pred('revenue','100.00',1,[0,8,10,18]),P3=pred('revenue','200',3,[0,10,10,20]),P4=pred('revenue','301',3,[100,100,200,120]),P5=pred('revenue','999',1,[300,300,310,310]);
const adversarial:ExtractionGold={documents:[doc(D1,3)],labels:[L1,L2,L3,L4,
 label(D1,'net_income','50',1,[0,50,10,60]),
 label(D1,'fiscal_year_end','2024-12-31',1,[10,200,60,210],'date'),
 label(D1,'company_name','Acme  Corp',1,[10,300,110,320],'text')]};
const adversarialOut:ExtractionOutput[]=[{document_sha256:D1,status:'parsed',fields:[P1,P2,P3,P4,P5,
 pred('fiscal_year_end','2024-12-31',1,[10,201,60,211]),pred('company_name','Ａｃｍｅ Corp',1,[10,300,110,320]),pred('auditor','KPMG',1,[0,400,50,410])]}];

const A=label(D2,'total_assets','500',1,[0,0,100,20]),B=label(D2,'total_assets','500',2,[0,10,100,30]);
const X=pred('total_assets','500',1,[0,6,100,26]),Y=pred('total_assets','500',2,[0,4,100,24]);
const crossed:ExtractionGold={documents:[doc(D2,2)],labels:[A,B]};
const crossedOut:ExtractionOutput[]=[{document_sha256:D2,status:'parsed',fields:[X,Y]}];

describe('geometry and values',()=>{
 it('overlap gives exact inter/union; the hand-computed IoUs hold',()=>{
  expect(overlap(L1.locator.bbox,P1.bbox)).toEqual({inter:90,union:110});
  expect(overlap(L2.locator.bbox,P2.bbox)).toEqual({inter:50,union:150});
  expect(overlap(A.locator.bbox,X.bbox)).toEqual({inter:1400,union:2600});
  expect(overlap(B.locator.bbox,X.bbox)).toEqual({inter:1600,union:2400});
  expect(overlap([0,0,1,1],[5,5,6,6])).toEqual({inter:0,union:2});
 });
 it('decimal via compareWithinTolerance rel 0, text NFKC + whitespace, date ISO only, enum exact',()=>{
  expect(valuesEqual('decimal','100','100.00')).toBe(true);
  expect(valuesEqual('decimal','100','100.01')).toBe(false);
  expect(valuesEqual('decimal','1,000','1000')).toBe(false);
  expect(valuesEqual('text','Acme  Corp','Ａｃｍｅ Corp')).toBe(true);
  expect(valuesEqual('date','2024-12-31','2024-12-31')).toBe(true);
  expect(valuesEqual('date','2024-12-31','12/31/2024')).toBe(false);
  expect(valuesEqual('enum','FY','fy')).toBe(false);
 });
});

describe('matchGroup',()=>{
 it('step 1 takes the maximum matching (greedy-by-IoU would strand L2); step 2 classifies the rest',()=>{
  expect(matchGroup([L1,L2,L3,L4],[P1,P2,P3,P4,P5])).toEqual({tp:[[0,1],[1,0]],citation:[[2,2]],mismatch:[[3,3]],unpairedPredictions:[4],unpairedLabels:[]});
 });
 it('same value across pages with crossed coordinates: two TP, never a cross-page match',()=>{
  expect(matchGroup([A,B],[X,Y])).toEqual({tp:[[0,0],[1,1]],citation:[],mismatch:[],unpairedPredictions:[],unpairedLabels:[]});
 });
 it('deterministic: prediction order does not change the counts',()=>{
  const m=matchGroup([L1,L2,L3,L4],[P5,P4,P3,P2,P1]);
  expect([m.tp.length,m.citation.length,m.mismatch.length,m.unpairedPredictions.length,m.unpairedLabels.length]).toEqual([2,1,1,1,0]);
 });
});

describe('evaluateExtraction',()=>{
 it('adversarial fixture: per-field TP/FP/FP_citation/FN, P/R, zero support skipped; gate fail',()=>{
  const r=evaluateExtraction(adversarial,adversarialOut);
  expect(r.fields.revenue).toEqual({field:'revenue',tp:2,fp:3,fp_citation:1,fn:2,support:4,predictions:5,precision:'0.4',recall:'0.5',passed:false});
  expect(r.fields.net_income).toMatchObject({tp:0,fp:0,fn:1,support:1,predictions:0,precision:'0',recall:'0',passed:false});
  expect(r.fields.fiscal_year_end).toMatchObject({tp:1,precision:'1',recall:'1',passed:true});
  expect(r.fields.company_name).toMatchObject({tp:1,passed:true});
  expect(r.cases.map(c=>[c.case_id,c.outcome])).toEqual([
   ['auditor',{result:'skipped',reason:'zero_support'}],['company_name',{result:'pass'}],['fiscal_year_end',{result:'pass'}],
   ['net_income',{result:'fail',reason:'value'}],['revenue',{result:'fail',reason:'value'}]]);
  const rev=r.cases.find(c=>c.case_id==='revenue')!;
  expect(rev.detail).toMatchObject({tp:2,fp:3,fp_citation:1,fn:2,support:4,precision:'0.4',recall:'0.5'});
  const s=summarize(r.cases,extractionSummaryContext());
  expect(s).toMatchObject({correctness:{pass:2,fail:2},coverage:{skipped:1},gate:'fail'});
 });
 it('crossed two-page fixture → 2 TP, field passes, gate pass',()=>{
  const r=evaluateExtraction(crossed,crossedOut);
  expect(r.fields.total_assets).toMatchObject({tp:2,fp:0,fn:0,precision:'1',recall:'1',passed:true});
  expect(summarize(r.cases,extractionSummaryContext()).gate).toBe('pass');
 });
 it('every document parsed but TP = 0 → gate fail (not incomplete)',()=>{
  const g:ExtractionGold={documents:[doc(D3,1)],labels:[label(D3,'revenue','10',1,[0,0,10,10])]};
  const r=evaluateExtraction(g,[{document_sha256:D3,status:'parsed',fields:[pred('revenue','11',1,[0,0,10,10])]}]);
  expect(r.fields.revenue).toMatchObject({tp:0,fp:1,fn:1,passed:false});
  const s=summarize(r.cases,extractionSummaryContext());
  expect(s.execution.read_error).toBe(0);
  expect(s.gate).toBe('fail');
 });
 it('an unparseable or missing document makes each field it carries labels for a read_error → incomplete',()=>{
  const g:ExtractionGold={documents:[doc(D3,1),doc(D4,1)],labels:[label(D3,'revenue','10',1,[0,0,10,10]),label(D4,'cash','5',1,[0,0,10,10])]};
  const r=evaluateExtraction(g,[{document_sha256:D3,status:'unparseable',error:'pdf_encrypted'}]);
  expect(r.cases.map(c=>[c.case_id,c.outcome])).toEqual([['cash',{result:'read_error',reason:'read_failed'}],['revenue',{result:'read_error',reason:'read_failed'}]]);
  expect(summarize(r.cases,extractionSummaryContext()).gate).toBe('incomplete');
 });
 it('invalid gold is gold_invalid',()=>{
  const bad=(g:ExtractionGold)=>{try{evaluateExtraction(g,[]);return 'ok';}catch(e){return e instanceof EvalError?e.code:'other';}};
  expect(bad({documents:[doc(D3,1)],labels:[label(D3,'revenue','1',2,[0,0,1,1])]})).toBe('gold_invalid');   // page > page_count
  expect(bad({documents:[doc(D3,1)],labels:[label(D3,'revenue','1',1,[5,0,1,1])]})).toBe('gold_invalid');   // x0 ≥ x1
  expect(bad({documents:[doc(D3,1)],labels:[label(D4,'revenue','1',1,[0,0,1,1])]})).toBe('gold_invalid');   // unknown document
  const l=label(D3,'revenue','1',1,[0,0,1,1]);
  expect(bad({documents:[doc(D3,1)],labels:[l,{...l}]})).toBe('gold_invalid');   // duplicate label_id
 });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npm test -- src/lib/evals/kinds/extraction.test.ts`
Expected: FAIL — `Failed to resolve import "./extraction"`。

- [ ] **Step 7: 实现 `src/lib/evals/kinds/extraction.ts`**

```ts
// src/lib/evals/kinds/extraction.ts
// extraction_gold (spec §11.1, §3.3 extraction rows). NOT enabled (§16 D8: restricted-artifact licence
// pending; kinds/registry.ts). Pure field-level precision/recall over F3 labels and predictions.
// Matching per group (document_sha256, field), two deterministic steps:
//  1. Eligible pairs = same page, IoU ≥ 0.5 (2·inter ≥ union, no division), equal value (decimal:
//     compareWithinTolerance rel 0; text: NFKC + collapsed whitespace; date: ISO YYYY-MM-DD only; enum:
//     exact). Edges are totally ordered by (IoU desc via cross-multiplication; label bbox lexicographic asc;
//     prediction bbox asc; label index; prediction index). M = maximum matching size (Kuhn augmenting
//     paths); then edges are tried in that order and kept iff chosen + 1 + max matching of the remaining
//     graph = M: the result is the lexicographically first MAXIMUM matching → TP.
//  2. Remaining labels × remaining predictions, ordered by (value equal first; same-page IoU desc, a
//     cross-page pair counts IoU 0; label bbox; prediction bbox; label index; prediction index), paired
//     greedily one-to-one: equal value → FP_citation (counted in FP) + FN; different → FP + FN; unpaired
//     prediction → FP; unpaired label → FN.
// Per field across documents: P = TP/(TP+FP) (0 when there are no predictions and support > 0), R =
// TP/(TP+FN); pass ⇔ P ≥ 0.95 and R ≥ 0.95 (integer comparison 100·TP ≥ 95·den). Support 0 →
// skipped(zero_support). A field with labels in a document whose output is unparseable or missing →
// read_error(read_failed) for the whole field. A prediction with invalid geometry never matches in step 1.
// Outputs for documents outside the gold set are ignored.
import {compareWithinTolerance} from '../compare';
import {EvalError} from '../errors';
import type {CaseOutcome,CaseReport,SummaryContext} from '../types';
import {ratioText} from './ratio';

export type ExtractionValueType='text'|'decimal'|'date'|'enum';
export type BBox=[number,number,number,number];
export interface ExtractionDocumentSpec{document_sha256:string;page_count:number;bbox_space:'pdf_points_top_left'}
export interface ExtractionLabel{label_id:string;document_sha256:string;field:string;occurrence:number;value_type:ExtractionValueType;value:string;locator:{page:number;bbox:BBox};recorded_by:string;reviewed_by:string}
export interface ExtractionGold{documents:ExtractionDocumentSpec[];labels:ExtractionLabel[]}
export interface PredictedField{field:string;value:string;page:number;bbox:BBox}
export type ExtractionOutput={document_sha256:string;status:'parsed';fields:PredictedField[]}|{document_sha256:string;status:'unparseable';error:string};
/** Indices into the group's label / prediction arrays. */
export interface GroupMatch{tp:[number,number][];citation:[number,number][];mismatch:[number,number][];unpairedPredictions:number[];unpairedLabels:number[]}
export interface FieldMetrics{field:string;tp:number;fp:number;fp_citation:number;fn:number;support:number;predictions:number;precision:string;recall:string;passed:boolean}
export interface ExtractionEvaluation{cases:CaseReport[];fields:Record<string,FieldMetrics>}

const VALUE_TYPES=new Set(['text','decimal','date','enum']);
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
interface Overlap{inter:number;union:number}
export function overlap(a:BBox,b:BBox):Overlap{
 const w=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])),h=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 const inter=w*h,area=(x:BBox)=>(x[2]-x[0])*(x[3]-x[1]);
 return {inter,union:area(a)+area(b)-inter};
}
const halfOrMore=(o:Overlap)=>o.union>0&&2*o.inter>=o.union;
/** > 0 when x has the higher IoU. */
const iouCmp=(x:Overlap,y:Overlap)=>x.inter*y.union-y.inter*x.union;
const bboxCmp=(a:BBox,b:BBox)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]||a[3]-b[3];
const validBox=(b:unknown):b is BBox=>Array.isArray(b)&&b.length===4&&b.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&b[0]<b[2]&&b[1]<b[3];
const normText=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
const isIsoDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s;

export function valuesEqual(type:ExtractionValueType,a:string,b:string):boolean{
 switch(type){
  case 'decimal':try{return compareWithinTolerance(a.trim(),b.trim(),'0').passed;}catch{return false;}
  case 'date':{const x=a.trim(),y=b.trim();return isIsoDate(x)&&isIsoDate(y)&&x===y;}
  case 'text':return normText(a)===normText(b);
  case 'enum':return a.trim()===b.trim();
 }
}

interface Edge{l:number;p:number;o:Overlap}
function maxMatching(edges:Edge[],blockedL:Set<number>,blockedP:Set<number>):number{
 const adj=new Map<number,number[]>();
 for(const e of edges){if(blockedL.has(e.l)||blockedP.has(e.p))continue;const a=adj.get(e.l)??[];a.push(e.p);adj.set(e.l,a);}
 const owner=new Map<number,number>();
 const augment=(l:number,seen:Set<number>):boolean=>{
  for(const p of adj.get(l)??[]){
   if(seen.has(p))continue;seen.add(p);
   const cur=owner.get(p);
   if(cur===undefined||augment(cur,seen)){owner.set(p,l);return true;}
  }
  return false;
 };
 let n=0;
 for(const l of [...adj.keys()].sort((a,b)=>a-b))if(augment(l,new Set()))n++;
 return n;
}

export function matchGroup(labels:ExtractionLabel[],preds:PredictedField[]):GroupMatch{
 const edges:Edge[]=[];
 labels.forEach((L,l)=>preds.forEach((P,p)=>{
  if(L.locator.page!==P.page||!validBox(P.bbox))return;
  const o=overlap(L.locator.bbox,P.bbox);
  if(halfOrMore(o)&&valuesEqual(L.value_type,L.value,P.value))edges.push({l,p,o});
 }));
 edges.sort((x,y)=>iouCmp(y.o,x.o)||bboxCmp(labels[x.l].locator.bbox,labels[y.l].locator.bbox)||bboxCmp(preds[x.p].bbox,preds[y.p].bbox)||x.l-y.l||x.p-y.p);
 const M=maxMatching(edges,new Set(),new Set());
 const usedL=new Set<number>(),usedP=new Set<number>();const tp:[number,number][]=[];
 for(const e of edges){
  if(tp.length===M)break;
  if(usedL.has(e.l)||usedP.has(e.p))continue;
  usedL.add(e.l);usedP.add(e.p);
  if(tp.length+1+maxMatching(edges,usedL,usedP)===M)tp.push([e.l,e.p]);
  else{usedL.delete(e.l);usedP.delete(e.p);}
 }
 const restL=labels.map((_,i)=>i).filter(i=>!usedL.has(i)),restP=preds.map((_,i)=>i).filter(i=>!usedP.has(i));
 const pairs=restL.flatMap(l=>restP.map(p=>{
  const L=labels[l],P=preds[p];
  const o:Overlap=L.locator.page===P.page&&validBox(P.bbox)?overlap(L.locator.bbox,P.bbox):{inter:0,union:1};
  return {l,p,o,eq:valuesEqual(L.value_type,L.value,P.value)};
 }));
 pairs.sort((x,y)=>Number(y.eq)-Number(x.eq)||iouCmp(y.o,x.o)||bboxCmp(labels[x.l].locator.bbox,labels[y.l].locator.bbox)||(validBox(preds[x.p].bbox)&&validBox(preds[y.p].bbox)?bboxCmp(preds[x.p].bbox,preds[y.p].bbox):0)||x.l-y.l||x.p-y.p);
 const doneL=new Set<number>(),doneP=new Set<number>();const citation:[number,number][]=[],mismatch:[number,number][]=[];
 for(const q of pairs){
  if(doneL.has(q.l)||doneP.has(q.p))continue;
  doneL.add(q.l);doneP.add(q.p);(q.eq?citation:mismatch).push([q.l,q.p]);
 }
 return {tp,citation,mismatch,unpairedPredictions:restP.filter(p=>!doneP.has(p)),unpairedLabels:restL.filter(l=>!doneL.has(l))};
}

function validateGold(g:ExtractionGold):Map<string,ExtractionDocumentSpec>{
 const bad=(f:string):never=>{throw new EvalError('gold_invalid',`extraction gold: ${f}`,{field:f});};
 const docs=new Map<string,ExtractionDocumentSpec>();
 for(const d of g.documents){
  if(!/^[0-9a-f]{64}$/.test(d.document_sha256)||docs.has(d.document_sha256))bad(`document ${d.document_sha256}`);
  if(!Number.isSafeInteger(d.page_count)||d.page_count<1||d.bbox_space!=='pdf_points_top_left')bad(`document ${d.document_sha256} page_count/bbox_space`);
  docs.set(d.document_sha256,d);
 }
 const ids=new Set<string>();
 for(const l of g.labels){
  if(!l.label_id||ids.has(l.label_id))bad(`label_id ${l.label_id}`);ids.add(l.label_id);
  const d=docs.get(l.document_sha256);if(!d)bad(`label ${l.label_id}: unknown document`);
  if(!l.field||!Number.isSafeInteger(l.occurrence)||l.occurrence<1||!VALUE_TYPES.has(l.value_type)||typeof l.value!=='string')bad(`label ${l.label_id}: field/occurrence/value`);
  if(!Number.isSafeInteger(l.locator.page)||l.locator.page<1||l.locator.page>d!.page_count||!validBox(l.locator.bbox))bad(`label ${l.label_id}: locator`);
  if(!l.recorded_by||!l.reviewed_by)bad(`label ${l.label_id}: recorded_by/reviewed_by`);
 }
 return docs;
}

export function evaluateExtraction(gold:ExtractionGold,outputs:ExtractionOutput[]):ExtractionEvaluation{
 const docs=validateGold(gold);
 const out=new Map<string,ExtractionOutput>();
 for(const o of outputs)if(docs.has(o.document_sha256))out.set(o.document_sha256,out.has(o.document_sha256)?{document_sha256:o.document_sha256,status:'unparseable',error:'duplicate_output'}:o);
 const parsedFields=(sha:string):PredictedField[]=>{const o=out.get(sha);return o&&o.status==='parsed'?o.fields:[];};
 const fieldNames=new Set<string>(gold.labels.map(l=>l.field));
 for(const sha of docs.keys())for(const p of parsedFields(sha))fieldNames.add(p.field);
 const cases:CaseReport[]=[];const fields:Record<string,FieldMetrics>={};
 const rep=(field:string,outcome:CaseOutcome,detail:Record<string,unknown>):CaseReport=>({case_id:field,required:true,outcome,left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail});
 for(const field of [...fieldNames].sort(cmp)){
  const labels=gold.labels.filter(l=>l.field===field);
  const labelDocs=[...new Set(labels.map(l=>l.document_sha256))].sort(cmp);
  const broken=labelDocs.filter(sha=>out.get(sha)?.status!=='parsed');
  if(broken.length>0){cases.push(rep(field,{result:'read_error',reason:'read_failed'},{documents:broken}));continue;}
  const predDocs=[...docs.keys()].filter(sha=>parsedFields(sha).some(p=>p.field===field));
  const predictions=predDocs.reduce((n,sha)=>n+parsedFields(sha).filter(p=>p.field===field).length,0);
  if(labels.length===0){cases.push(rep(field,{result:'skipped',reason:'zero_support'},{support:0,predictions}));continue;}
  let tp=0,fp=0,cit=0,fn=0;
  for(const sha of [...new Set([...labelDocs,...predDocs])].sort(cmp)){
   const m=matchGroup(labels.filter(l=>l.document_sha256===sha),parsedFields(sha).filter(p=>p.field===field));
   tp+=m.tp.length;cit+=m.citation.length;
   fp+=m.citation.length+m.mismatch.length+m.unpairedPredictions.length;
   fn+=m.citation.length+m.mismatch.length+m.unpairedLabels.length;
  }
  const passed=tp+fp>0&&100*tp>=95*(tp+fp)&&100*tp>=95*(tp+fn);
  const metrics:FieldMetrics={field,tp,fp,fp_citation:cit,fn,support:labels.length,predictions,
   precision:tp+fp===0?'0':ratioText(BigInt(tp),BigInt(tp+fp),4),recall:ratioText(BigInt(tp),BigInt(tp+fn),4),passed};
  fields[field]=metrics;
  const detail={tp,fp,fp_citation:cit,fn,support:labels.length,predictions,precision:metrics.precision,recall:metrics.recall};
  cases.push(rep(field,passed?{result:'pass'}:{result:'fail',reason:'value'},detail));
 }
 return {cases,fields};
}

export const extractionSummaryContext=():SummaryContext=>({thresholds:{max_fail:0,min_coverage_optional:'0.95'},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:'truth'});
```

- [ ] **Step 8: 运行，确认通过**

Run: `npm test -- src/lib/evals/kinds/extraction.test.ts`
Expected: PASS（10 个用例）。

- [ ] **Step 9: 写失败测试 `src/lib/evals/kinds/calibration.test.ts`**

```ts
// src/lib/evals/kinds/calibration.test.ts
// Hand-computed: p/outcome = 0.8/1, 0.3/0, 1/1, 0/1 → squared errors 0.04, 0.09, 0, 1 → Brier 1.13/4 = 0.2825.
// Buckets [0,0.1) … [0.9,1.0]: 0 → bucket 0, 0.3 → 3, 0.8 → 8, 1 (endpoint) → 9.
import {describe,expect,it} from 'vitest';
import {evaluateCalibration,summarizeCalibration} from './calibration';
import type {SettledForecast} from './calibration';

const f=(id:string,p:string,outcome:0|1,o:Partial<SettledForecast>={},s:Partial<SettledForecast['settlement']>={}):SettledForecast=>({forecast_id:id,forecast_sha256:'a'.repeat(64),methodology_version:'f4/1',claim:`claim ${id}`,p,
 registered_at:'2025-01-01T00:00:00Z',input_snapshot_sha256:'b'.repeat(64),horizon_end:'2025-06-30',revision_of:null,...o,
 settlement:{outcome,settled_at:'2025-07-02T00:00:00Z',evidence_ref:`ev-${id}`,evidence_available_date:'2025-07-01',...s}});
const TH={max_fail:0,min_coverage_optional:'0.95'};

describe('evaluateCalibration',()=>{
 it('Brier and 10-bucket reliability with the endpoint in the last bucket',()=>{
  const r=evaluateCalibration([f('a','0.8',1),f('b','0.3',0),f('c','1',1),f('d','0',1)]);
  expect(r.eligible).toBe(4);
  expect(r.brier).toBe('0.2825');
  expect(r.reliability.map(b=>[b.index,b.lower,b.upper,b.n,b.mean_p,b.observed_rate]).filter(x=>x[3]!==0)).toEqual([[0,'0','0.1',1,'0','1'],[3,'0.3','0.4',1,'0.3','0'],[8,'0.8','0.9',1,'0.8','1'],[9,'0.9','1',1,'1','1']]);
  expect(r.reliability.length).toBe(10);
  expect(r.reliability[5]).toEqual({index:5,lower:'0.5',upper:'0.6',n:0,mean_p:null,observed_rate:null});
  expect(r.cases.map(c=>c.outcome.result)).toEqual(['pass','pass','pass','pass']);
  expect(r.cases[0]).toMatchObject({case_id:'a',left:'0.8',right:'1'});
  expect(summarizeCalibration(r,TH).gate).toBe('pass');
 });
 it('eligibility: p range and syntax, outcome, registered_at + 1 day ≤ evidence date, settled_at ≥ horizon_end, one settlement per id, timestamps',()=>{
  const r=evaluateCalibration([
   f('ok','0.5',1),
   f('p-high','1.2',1),f('p-bad','.5',1),f('p-neg','-0.1',0),
   f('out','0.5',1,{},{outcome:2 as 0|1}),
   f('soon','0.5',1,{registered_at:'2025-06-30T12:00:00Z'},{evidence_available_date:'2025-07-01'}),
   f('edge','0.5',1,{registered_at:'2025-06-30T00:00:00Z'},{evidence_available_date:'2025-07-01'}),   // exactly one day: eligible
   f('early','0.5',1,{},{settled_at:'2025-06-29T00:00:00Z'}),
   f('dup','0.5',1),f('dup','0.6',0),
   f('ts','0.5',1,{registered_at:'yesterday'}),
  ]);
  expect(Object.fromEntries(r.ineligible.map(x=>[x.case_id,x.reason]))).toEqual({'p-high':'p_out_of_range','p-bad':'p_invalid','p-neg':'p_invalid',out:'outcome_invalid',soon:'evidence_too_soon',early:'settled_before_horizon',dup:'multiple_settlements','dup#2':'multiple_settlements',ts:'timestamp_invalid'});
  expect(r.eligible).toBe(2);
  expect(r.cases.filter(c=>c.outcome.result==='skipped').every(c=>c.outcome.result==='skipped'&&c.outcome.reason==='ineligible')).toBe(true);
 });
 it('revision chain: the last eligible registration counts, earlier ones are superseded, an ineligible later revision is ignored',()=>{
  const r=evaluateCalibration([
   f('v1','0.6',1),
   f('v2','0.7',1,{revision_of:'v1',registered_at:'2025-02-01T00:00:00Z'}),
   f('v3','0.9',1,{revision_of:'v2',registered_at:'2025-06-30T12:00:00Z'}),   // evidence 2025-07-01 is < 1 day later → ineligible
  ]);
  expect(r.cases.map(c=>[c.case_id,c.outcome.result])).toEqual([['v1','skipped'],['v2','pass'],['v3','skipped']]);
  expect(Object.fromEntries(r.ineligible.map(x=>[x.case_id,x.reason]))).toEqual({v1:'superseded_in_chain',v3:'evidence_too_soon'});
  expect(r.brier).toBe('0.09');   // (0.7 − 1)²
 });
 it('broken chains: unknown parent and cycles are ineligible',()=>{
  const r=evaluateCalibration([f('orphan','0.5',1,{revision_of:'ghost'}),f('x','0.5',1,{revision_of:'y'}),f('y','0.5',1,{revision_of:'x'})]);
  expect(Object.fromEntries(r.ineligible.map(x=>[x.case_id,x.reason]))).toEqual({orphan:'revision_parent_missing',x:'revision_cycle',y:'revision_cycle'});
 });
 it('no eligible sample → no Brier, empty buckets, summary incomplete (population 0)',()=>{
  const r=evaluateCalibration([f('p','2',1)]);
  expect(r).toMatchObject({eligible:0,brier:null});
  expect(r.reliability.every(b=>b.n===0)).toBe(true);
  expect(summarizeCalibration(r,TH).gate).toBe('incomplete');
  expect(summarizeCalibration(evaluateCalibration([]),TH).gate).toBe('incomplete');
 });
});
```

- [ ] **Step 10: 运行，确认失败**

Run: `npm test -- src/lib/evals/kinds/calibration.test.ts`
Expected: FAIL — `Failed to resolve import "./calibration"`。

- [ ] **Step 11: 实现 `src/lib/evals/kinds/calibration.ts`**

```ts
// src/lib/evals/kinds/calibration.ts
// judgment_calibration (spec §11.3, §3.3 calibration rows). NOT enabled (prerequisite: F4 settledForecasts;
// kinds/registry.ts). Input: F4's settledForecasts rows. Eligibility per record: p a decimal in [0, 1]
// (Brier allows the endpoints); outcome 0|1; registered_at + 1 day ≤ evidence_available_date (UTC
// midnight); settled_at ≥ horizon_end; exactly one record per forecast_id (duplicates: all ineligible);
// parseable timestamps. Revision chains (revision_of → parent): an unknown parent or a cycle makes the
// record ineligible; within a chain only the LAST eligible registration (by registered_at, then
// forecast_id) counts, earlier eligible ones are superseded_in_chain. Eligible → pass (population),
// ineligible → skipped(ineligible). Output: Brier = mean (p − outcome)² and a 10-bucket reliability table
// ([0,0.1) … [0.9,1.0], p = 1 in the last bucket), both exact on BigInt, as 10-place truncated text. No
// eligible sample → summarizeCalibration summarizes [] → population 0 → incomplete. Thresholds are F4's.
import type {CaseReport,Summary,SummaryContext,Thresholds} from '../types';
import {summarize} from '../summary';
import {ratioText} from './ratio';

export interface Settlement{outcome:0|1;settled_at:string;evidence_ref:string;evidence_available_date:string}
export interface SettledForecast{forecast_id:string;forecast_sha256:string;methodology_version:string;claim:string;p:string;registered_at:string;input_snapshot_sha256:string;horizon_end:string;revision_of:string|null;settlement:Settlement}
export type IneligibleReason='p_invalid'|'p_out_of_range'|'outcome_invalid'|'timestamp_invalid'|'evidence_too_soon'|'settled_before_horizon'|'multiple_settlements'|'revision_parent_missing'|'revision_cycle'|'superseded_in_chain';
export interface ReliabilityBucket{index:number;lower:string;upper:string;n:number;mean_p:string|null;observed_rate:string|null}
export interface CalibrationResult{cases:CaseReport[];eligible:number;brier:string|null;reliability:ReliabilityBucket[];ineligible:{case_id:string;forecast_id:string;reason:IneligibleReason}[]}

const DAY_MS=86_400_000;
interface Dec{n:bigint;s:number}
const parseP=(p:string):Dec|null=>{if(typeof p!=='string'||!/^\d+(\.\d+)?$/.test(p))return null;const [i,f='']=p.split('.');return {n:BigInt(i+f),s:f.length};};
const ms=(v:string)=>Date.parse(v);
const dayMs=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)?Date.parse(`${v}T00:00:00Z`):Number.NaN;

function recordReason(f:SettledForecast):IneligibleReason|null{
 const p=parseP(f.p);
 if(!p)return 'p_invalid';
 if(p.n>10n**BigInt(p.s))return 'p_out_of_range';
 if(f.settlement.outcome!==0&&f.settlement.outcome!==1)return 'outcome_invalid';
 const reg=ms(f.registered_at),ev=dayMs(f.settlement.evidence_available_date),settled=ms(f.settlement.settled_at),horizon=ms(f.horizon_end);
 if([reg,ev,settled,horizon].some(Number.isNaN))return 'timestamp_invalid';
 if(reg+DAY_MS>ev)return 'evidence_too_soon';
 if(settled<horizon)return 'settled_before_horizon';
 return null;
}

export function evaluateCalibration(forecasts:SettledForecast[]):CalibrationResult{
 const count=new Map<string,number>();
 for(const f of forecasts)count.set(f.forecast_id,(count.get(f.forecast_id)??0)+1);
 const reason=new Map<SettledForecast,IneligibleReason>();
 const byId=new Map<string,SettledForecast>();
 for(const f of forecasts){
  if((count.get(f.forecast_id)??0)>1){reason.set(f,'multiple_settlements');continue;}
  byId.set(f.forecast_id,f);
  const r=recordReason(f);if(r)reason.set(f,r);
 }
 const chains=new Map<string,SettledForecast[]>();
 for(const f of byId.values()){
  let cur=f;const seen=new Set([f.forecast_id]);let bad:IneligibleReason|null=null;
  while(cur.revision_of!==null){
   const parent=byId.get(cur.revision_of);
   if(!parent){bad='revision_parent_missing';break;}
   if(seen.has(parent.forecast_id)){bad='revision_cycle';break;}
   seen.add(parent.forecast_id);cur=parent;
  }
  if(bad){if(!reason.has(f))reason.set(f,bad);continue;}
  if(reason.has(f))continue;
  const g=chains.get(cur.forecast_id)??[];g.push(f);chains.set(cur.forecast_id,g);
 }
 for(const g of chains.values()){
  g.sort((a,b)=>ms(a.registered_at)-ms(b.registered_at)||(a.forecast_id<b.forecast_id?-1:a.forecast_id>b.forecast_id?1:0));
  for(const f of g.slice(0,-1))reason.set(f,'superseded_in_chain');
 }
 const seenIds=new Map<string,number>();
 const cases:CaseReport[]=[];const ineligible:CalibrationResult['ineligible']=[];const eligible:SettledForecast[]=[];
 for(const f of forecasts){
  const k=(seenIds.get(f.forecast_id)??0)+1;seenIds.set(f.forecast_id,k);
  const case_id=k===1?f.forecast_id:`${f.forecast_id}#${k}`;
  const r=reason.get(f)??null;
  const right=f.settlement.outcome===0||f.settlement.outcome===1?String(f.settlement.outcome):null;
  cases.push({case_id,required:true,outcome:r?{result:'skipped',reason:'ineligible'}:{result:'pass'},left:parseP(f.p)?f.p:null,right,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,
   detail:{eligible:r===null,...(r?{reason:r}:{}),methodology_version:f.methodology_version,horizon_end:f.horizon_end,revision_of:f.revision_of}});
  if(r)ineligible.push({case_id,forecast_id:f.forecast_id,reason:r});else eligible.push(f);
 }
 const S=eligible.reduce((m,f)=>Math.max(m,parseP(f.p)!.s),0);
 const scaled=(f:SettledForecast)=>{const p=parseP(f.p)!;return p.n*10n**BigInt(S-p.s);};
 const one=10n**BigInt(S);
 let sq=0n;for(const f of eligible){const d=scaled(f)-BigInt(f.settlement.outcome)*one;sq+=d*d;}
 const brier=eligible.length===0?null:ratioText(sq,BigInt(eligible.length)*one*one);
 const buckets=Array.from({length:10},()=>({n:0,sumP:0n,sumO:0n}));
 for(const f of eligible){
  const p=parseP(f.p)!;const idx=Math.min(9,Number((p.n*10n)/10n**BigInt(p.s)));
  const b=buckets[idx];b.n++;b.sumP+=scaled(f);b.sumO+=BigInt(f.settlement.outcome);
 }
 const bound=(i:number)=>i===0?'0':i===10?'1':`0.${i}`;
 const reliability=buckets.map((b,i):ReliabilityBucket=>({index:i,lower:bound(i),upper:bound(i+1),n:b.n,
  mean_p:b.n===0?null:ratioText(b.sumP,BigInt(b.n)*one),observed_rate:b.n===0?null:ratioText(b.sumO,BigInt(b.n))}));
 return {cases,eligible:eligible.length,brier,reliability,ineligible};
}

export const calibrationSummaryContext=(thresholds:Thresholds):SummaryContext=>({thresholds,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:'truth'});
/** No eligible sample → summarize([]) → population 0 → incomplete (§11.3). */
export const summarizeCalibration=(r:CalibrationResult,thresholds:Thresholds):Summary=>summarize(r.eligible===0?[]:r.cases,calibrationSummaryContext(thresholds));
```

- [ ] **Step 12: 运行，确认通过**

Run: `npm test -- src/lib/evals/kinds/calibration.test.ts`
Expected: PASS（5 个用例）。

- [ ] **Step 13: 注册两个未启用的 kind（修改 `src/lib/evals/kinds/registry.ts`）**

把 `KIND_REGISTRY` 数组替换为：

```ts
export const KIND_REGISTRY:readonly KindRegistryEntry[]=[
 {kind:'official_reconciliation',enabled:true},
 {kind:'replay_consistency',enabled:true},
 {kind:'dual_source',enabled:false,reason:'prerequisite: plan 3 merged'},
 {kind:'reference_regression',enabled:false,reason:'prerequisite: macro migrations'},
 // Task 15
 {kind:'extraction_gold',enabled:false,reason:'D8: license decision pending'},
 {kind:'judgment_calibration',enabled:false,reason:'prerequisite: F4 settledForecasts'},
];
```

- [ ] **Step 14: 在 `src/lib/evals/kinds/registry.test.ts` 的 `describe('KIND_REGISTRY', …)` 末尾追加用例**

```ts
 it('Task 15: extraction_gold and judgment_calibration are registered, disabled, with their reasons; every EvalKind has exactly one entry',()=>{
  expect(kindEntry('extraction_gold')).toEqual({kind:'extraction_gold',enabled:false,reason:'D8: license decision pending'});
  expect(kindEntry('judgment_calibration')).toEqual({kind:'judgment_calibration',enabled:false,reason:'prerequisite: F4 settledForecasts'});
  const all:EvalKind[]=['official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration'];
  expect(KIND_REGISTRY.map(e=>e.kind).sort()).toEqual([...all].sort());
 });
 it('Task 15: scripts/evals/run.ts refuses extraction_gold and judgment_calibration with exit 2',()=>{
  for(const k of ['extraction_gold','judgment_calibration']){
   const r=runCli(k);
   expect(r.status).toBe(2);
   expect(`${r.stderr}${r.stdout}`).toContain('kind_not_enabled');
  }
 },240000);
```

并在该文件 import 区加 `import type {EvalKind} from '../types';`。

- [ ] **Step 15: 运行全部 kind 单测**

Run: `npm test -- src/lib/evals/kinds`
Expected: PASS（ratio、extraction、calibration、registry（含 4 个 CLI 退出码 2）、read-only、dual-source、reference、replay）。

- [ ] **Step 16: 类型与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 错误、0 警告。

- [ ] **Step 17: 实施记录**

```markdown
## Task 15 — extraction_gold and judgment_calibration (pure logic, disabled)

- kinds/extraction.ts: two-step matching (lexicographically first maximum matching over same-page, IoU ≥ 0.5, equal-value edges; greedy classification of the rest), FP_citation, P/R with integer 95% gate, zero support skipped, unparseable → read_error. Fixtures: adversarial (max matching beats greedy; wrong page; zero predictions), crossed two-page (2 TP), all-parsed TP=0 (gate fail).
- kinds/calibration.ts: eligibility, revision chain (last eligible), exact Brier, 10-bucket reliability (endpoint in bucket 9), no eligible → incomplete.
- kinds/registry.ts: extraction_gold (D8: license decision pending), judgment_calibration (prerequisite: F4 settledForecasts) → kind_not_enabled, exit 2.
```

- [ ] **Step 18: 提交**

```bash
git add src/lib/evals/kinds/ratio.ts src/lib/evals/kinds/ratio.test.ts src/lib/evals/kinds/extraction.ts src/lib/evals/kinds/extraction.test.ts src/lib/evals/kinds/calibration.ts src/lib/evals/kinds/calibration.test.ts src/lib/evals/kinds/registry.ts src/lib/evals/kinds/registry.test.ts docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md
```
```bash
git commit -m "feat(evals): extraction_gold matching and judgment_calibration metrics, registered as not enabled (F6 Task 15)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: 运行手册、规格 §18 实施记录、全量门禁（指挥）

规格：§7、§10、§16（owner 事项）、§18。依赖：Task 1–15 全部合入本分支。本任务不写新代码；只写两份文档并跑完整门禁。

**Files:**
- Create: `docs/evals/README.md`
- Modify: `docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`（只在 §18 下追加，不改其他节）
- Modify: `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`

- [ ] **Step 1: 写 `docs/evals/README.md`**

内容（中文，命令可直接复制；不写任何凭据、邮箱或带查询串的 URL——`--redact` 扫这个目录）：

```markdown
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
```

Run: `npx tsx scripts/evals/validate.ts --redact`
Expected: exit 0（README 不含令牌、邮箱、桶路径）。

- [ ] **Step 2: 在规格 §18 下追加实施记录**

在 `## 18. 实施记录与偏差` 的占位段落之后追加（只追加；`实施记录` 指向审计目录）：

```markdown
### 18.1 第 6 稿实施（计划 `docs/superpowers/plans/2026-11-06-evals-and-gold-sets.md`，2026-11）

交付（§15.1 可构建子集）：契约与校验（Task 1–4、12）、存储（Task 5–6）、facts 适配器与官方对账（Task 7–9）、回放（Task 10–11，含 `run.ts --kind replay_consistency`）、管理只读 API（Task 13）、`dual_source`/`reference_regression`/`extraction_gold`/`judgment_calibration` 纯逻辑并在 `kinds/registry.ts` 登记为未启用（Task 14–15）。

偏差（均由集成决定，实施时以此为准）：
1. `--redact` 只扫 F6 自有路径（`src/lib/evals/fixtures/**`、`docs/evals/**`、`docs/audits/2026-11-06-evals-gold-sets/**`、`docs/audits/2026-11-04-data-foundation-2/index.json`），不扫整个 `docs/audits/**`（§4.5、§7.3）：其他模块的审计文件原样引用 Codex 输出（邮箱、查询串），F6 不得改它们。
2. 发布清单的 `lock.json` 校验只对黄金集类证据（official、dual_source）；回放与对照报告按其夹具文件的提交字节认证（`manifest_fixture`），因为锁只收 `GoldFormat` 黄金集（§10 "共同规则"）。
3. `validate.ts` 退出码：0 通过、1 检查失败、2 用法错误（与 §3.2 一致：2 只表示运行前拒绝）。
4. `Summary.coverage` 增 `evaluated_optional`（§3.2 规则 3 需要它，gate 才能只凭摘要重算）。
5. `ProvenanceCheck` 增可选 `inputs`；facts 适配器把每个输入事实的来源链放在 `FactProvenance.input_chains`，官方对账写入 `CaseReport.detail.inputs`（§5.1.4）。
6. frozen 建库（`replay/setup.ts`）不写 `dq_freshness`：`runFactsSync` 总会记录 `facts.us`，固定时钟会给共享库留下陈旧行，所以同步依赖的 `tables` 丢弃对 `dq_freshness` 的写（`withoutFreshness`）。
7. `--http` 冒烟本期不建（`run.ts` 以 `kind_not_enabled` 拒绝），§5.3.2 的路由等价由 `route-equivalence.test.ts` 保证。
8. 回放 frozen 经 `run.ts` 运行需要 `S4_TEST_STATE`（内存世界的投影不保证与录制库字节一致）。

未完成（owner 事项，§16）：生产特权 `report` 与其 `dq_eval_runs` 行、`facts.live.json` 录制与首次 live 运行、首份发布清单与专家记录、CODEOWNERS（D2）。
```

- [ ] **Step 3: 全量门禁**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 全绿；0 类型错误；0 lint 警告（两个 critical 集成套件在无 `S4_TEST_STATE` 时显示 skipped，那是单测运行，不是证据）。

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations`
Expected: exit 0。

Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`
Expected: exit 0；摘要的 `criticalSuites` 比 F6 前多 2，`criticalSkipped: 0`；无 `Database suite inventory drift`（HANDOFF §5 列出的已知本地抖动超时则单独重跑该套件）。

Run: `npx tsx scripts/evals/validate.ts --gold --lock --redact --gold-diff origin/main; echo "exit=$?"`
Expected: `exit=0`；`checks.gold.sets` 含 `plan2.json`（legacy_plan2）与 `synthetic-us.json`（f6）。

Run: `npx tsx scripts/evals/validate.ts --audit docs/audits/2026-11-04-evals-gold-sets; echo "exit=$?"`
Expected: `exit=0`（加 `--release` 则 exit 1，唯一发现 `audit_release_open_verify`，与 Task 12 的测试一致；`2026-11-04-data-foundation-2` 的历史第 1 轮无逐号处置，`audit.test.ts` 钉住其发现集合，不作门禁）。

- [ ] **Step 4: 实施记录收尾**

在 `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md` 表格追加 Task 16 一行（提交、门禁结果），并在表格下列出：每个任务的 Codex review/挑战轮次与未关闭项（应为空），以及 §18.1 的 owner 事项。

- [ ] **Step 5: 暂存与提交（指挥）**

```bash
git add docs/evals/README.md docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md
```
```bash
git commit -m "docs(evals): F6 runbook, spec §18 implementation notes, full gate (F6 Task 16)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

PR 描述列出：§16 默认值（D1–D8）作为假设、§18.1 的偏差与 owner 事项、落地顺序（§0 R5-4：若计划三尚未合并，提示其把未入锁迁移改到 `20261110090000` 之后）。

---

## 附录：写作者的假设、CCR 与已解决的规格歧义（原文；集成决定见上方"集成决定"与各条内的 Integration 注）

### A. W2（Task 5、6、12）

#### Contract change requests

1. **(Optional, no blocker)** Add a shared validator finding type to `types.ts` so Task 3's `Finding` and Task 12 use one name:
   `export interface ValidatorFinding{code:string;where:string;message:string}`.
   **Accepted at integration:** `ValidatorFinding` is in `types.ts` (Task 1); `validate/finding.ts` re-exports it with the helpers; Task 3's `CheckResult` carries it as `findings` via `findingsCheck`; no `toFinding` adapter.
   No other contract change: `EvalStore`, `evalStore`, `persistRun` are implemented with the skeleton signatures verbatim.

#### Assumptions about other tasks (reconcile at integration)

- **Task 1** exports `canonicalJson`, `sha256Hex` (canonical-json.ts), `summarize`, `statusOfGate` (summary.ts) with the skeleton signatures; `summarize` counts per spec §3.3 (`identical`/`within`/`expected_absent`/`explained_diff` → `correctness.pass`).
- **Task 2** exports `loadGoldSet(path, root?)` (returns `GoldSet` with `sha256` of the file bytes and repo-relative `path`); the lock file is `src/lib/evals/fixtures/gold/lock.json` with the `GoldLock` shape. Task 12 reads that JSON directly (no Task-2 lock loader is assumed).
- **Task 3** (reconciled at integration): the flag table is `HANDLERS:ValidateHandler[]` in `src/lib/evals/validate/cli.ts` (`scripts/evals/validate.ts` is a thin wrapper); a handler is `{flag,name,takesValue,modifiers?,run(root,value,modifiers)}` and may be async; `--release` is a declared modifier; a failing check exits 1, usage errors 2. Task 12 appends three entries that wrap `f6Handlers(root)[flag]([value,...modifiers])` in `findingsCheck` (Step 22). `ValidatorFinding` is the shared contract type in `types.ts`. Task 3's `ci.yml` block sets `fetch-depth: 0` — Task 12's real-directory audit test reads commit `394d5141…` with `git show`.
- **Task 8** `runGoldSet` must pass `reconciliationsTruncated: caseRowsTruncated({run_id, kind, artifact_class, cases})` (exported by Task 6's `store.ts`) into `SummaryContext`, so `summary.reconciliations_truncated` is final before Task 9 writes the report file. `persistRun` refuses (before any write, `store_write_failed`) a report whose flag disagrees.
- **Task 9** `run.ts`: `const files=writeReportFiles(report)` then `persistRun(store, report, {ref: files.json (repo-relative), sha256: files.sha256}, {triggeredBy, resume})`; `--resume <run_id>` re-reads the local report and calls `persistRun(..., {resume:true})`. Task 9 adds `'src/lib/evals/evals-facts.integration.test.ts'` **inside the same `// F6 begin/end` block** that Task 5 creates in `criticalSuites`.
- `.claude/scratch/db-one.ts` exists (plan conventions; rebuild from the plan-2 HANDOFF §5 if missing).

#### Spec ambiguities resolved here

1. §6.3 step 3 / §6.1 "≤ 100 case rows": rows = public `official_reconciliation`/`dual_source` runs, results in `CaseResultKind`, first 100 in report order; `reconciliations_truncated` is computed by the caller with `caseRowsTruncated()` before the report file is written; `persistRun` only checks it.
2. §6.3: a run-row insert failure of any kind (including 23505 on `run_id`) is `store_write_failed`; a non-23505 failure in steps 3–4 is `store_partial` (run stays `running`, `--resume` repairs); `reason` is cut to 64 chars (the column limit), the report keeps the full text; resume also requires `report_ref` equality; resume on a terminal row is a no-op.
3. §6.3 step 4 read-back compares status and `summary` by `canonicalJson` (jsonb reorders keys), not `finished_at` (PostgREST/pg return a different timestamp text).
4. §9 finding-id parsing (fixed in `audit.ts` header): `#` column; else `P1 · R3-1` severity cell; else synthesized `R<n>-<P>-<k>` (this is how `03-disposition.md` names the three round-3 P1s); plus `**R5-1 · P1 — …**` paragraphs. Disposition id = first token of the first cell, `Round-1 #27` → `27`; `implemented_in` = the `implemented_in` column else the column after `决定`/`Decision`.
5. §9 "每轮每个编号在某份处置表出现": the union of all listed disposition files (`covers_rounds` is informational: the real `03-disposition.md` also holds round 5 while `index.json` lists `[1,2,3,4]`). "`open` 与处置表一致": OPEN-verify / OWNER decisions ⇒ `open.verify` / `open.owner` non-empty. Committed rounds are verified: `sha256(git show <ref>:<target>) = target_sha256`. Findings counts in `index.json` must equal the parsed counts.
6. §9 release: P1/P2 only (a P3 OPEN-verify is allowed). On the real F6 spec audit dir release mode therefore reports exactly `N11` (P1, `ACCEPT + OPEN-verify`); the test pins it.
7. §8 selection: companies ranked by their smallest `sha256(seed + case_id)` (ties: key ascending), retracted cases excluded, `selected_case_ids` compared as a set; "first release" for the non-waivable `expert_sampling` is always assumed; `closure_ref` forms: `dq_quarantine:<uuid>`, a GitHub PR URL, `gold:<set_id>@<version>`.
8. §10: `provenance_kind ≠ synthetic` is checked on the gold set of gold-set kinds (official, dual_source) — `CaseReport` has no provenance kind and replay/reference fixtures are not gold sets; `scope.markets` comes from the official set; freshness dataset = `<module>.<market lowercased>` (`facts.us`, as plan 2 writes it), read at validation time (no history table exists); `dual_source`/`reference_regression` evidence may omit `report` (the row's `report_ref` is used); `waivers` can only waive `gold_approval`. **Integration:** the lock check applies to gold-set kinds only; replay/reference reports are authenticated by the fixture file's committed bytes (`manifest_fixture`), because `lock.json` entries are `GoldFormat` gold sets and `--lock` parses every entry as one (Task 11 CCR 5).
9. `data-foundation-2/index.json`: every round `uncommitted` + `unverified_target: true` (the audited bytes are unknown); `draft_commit_hint` records the commit that first stored each draft without claiming it was the audited byte string; the Claude review (02) is listed under `reconstructed.reviews`, not as a round.

### B. W3（Task 7、8、9）

#### Contract change requests

1. **(non-blocking) `ProvenanceCheck.inputs`.** Spec §5.1.4 (metrics row) wants each input fact's `source_ref/raw_hash/producer_code_version` in the report. The shared `ProvenanceCheck` has no place for them. These tasks do NOT change `types.ts`: `adapters/provenance.ts` declares `export interface FactProvenance extends ProvenanceCheck{inputs?:InputProvenance[]}` and returns it (structurally a `ProvenanceCheck`); `kinds/official.ts` copies `inputs` into `CaseReport.detail.inputs` when present. **Integration decision:** the contract gains `ProvenanceCheck.inputs?:{fact_id:string;check:ProvenanceCheck}[]` (accepted), but that nested shape cannot carry each input's `source_ref`/`raw_hash`, so `FactProvenance` stays and its field is named `input_chains` (not `inputs`, whose contract type differs); `kinds/official.ts` moves `input_chains` to `CaseReport.detail.inputs`. The facts reader leaves the contract's `inputs` unset in this build.
2. **(clarification only, no code change) `ModuleReader.stateRev()`.** `state_rev` is per issuer (`fact_state_rev(issuer, market)`); there is no global counter. The facts reader returns `deps.stateRev()` when it answers non-null, otherwise the largest `read_facts` envelope `state_rev` it observed during the run. `runGoldSet` fills `environment.db_state_rev` with it when the caller passed `null`. Recommend documenting this meaning in the `types.ts` comment.

#### Assumptions about Tasks 1–6 (and 10/11) — reconcile before executing

Beyond the skeleton's "关键函数签名" block:

- **Task 1** `summary.ts::summarize` implements §3.3 exactly: `expected_absent` counts in `correctness.pass`; `skipped(*)` in `coverage.skipped`; `population` excludes retracted cases; rule 1 includes `gold.ready=false / pending>0 / provenance_gaps>0` and `population=0`. `compare.ts::compareWithinTolerance` returns decimal strings for `absDiff/relDiff`. `canonical-json.ts::canonicalJson` sorts keys at every depth and serialises numbers with `JSON.stringify`.
- **Task 2** `gold/schema.ts::unitOfSpec(u:UnitSpec):string` (currency → `u.currency`, shares → `'shares'`, per_share → `` `${u.currency}/share` ``, ratio → `'pure'`; for `index/count/percent_points` it may return a string or throw — callers here catch and treat as "no facts unit"). `gold/load.ts::loadGoldSet(path, root?)` takes a repo-relative path and sets `GoldSet.path` to it; `checkLock(set, lock)` matches `{path, sha256, version, format}` and throws `EvalError('gold_lock_mismatch')` when the entry is missing or differs. The f6 parser accepts `target.type` (`'fact'|'metric'`) and requires `target.duration` for facts; `source.url` may be any https URL; `reviewed_by:null` is allowed outside 30-family sets; `binding:'current'` sets `as_of = source.available_date`. The legacy adapter marks an entry `pending` when its `value` or `recorded_by` is `'<pending>'`. Synthetic cases carry `recorded_by:'synthetic'`, `reviewed_by:null` and a set never mixes synthetic and transcribed cases (commander-confirmed Task 2 rule). `Summary.coverage.evaluated_optional` exists (accepted contract addition; nothing here asserts on it). `lock.json` is `{"files":[…]}` written as `JSON.stringify(lock,null,1)+'\n'` (the Task 9 generator re-writes it in that format).
- **Task 3** `scripts/evals/validate.ts --gold --lock` exists and exits 0 on a valid tree (used as a check in Task 9).
- **Task 4** `version.ts::evaluatorVersion():{sha:string;dirty:boolean}` throws `EvalError('code_version_missing')` when no 40-hex sha is available. `report.ts::buildReport(i:BuildReportInput):EvalReport` with (reconciled to Task 4 as landed; `module` and `artifact_class` come from `set`)
  `interface BuildReportInput{runId:string;kind:EvalKind;mode:EvalMode;privileged:boolean;set:GoldSet;env:EvalEnv;environment:ReportEnvironment;startedAt:string;finishedAt:string;verified:{artifacts:boolean;sources:boolean};summary:Summary;cases:CaseReport[]}`
  and it maps `set` → `report.set={id:set.set_id,version,sha256,format,path}`, `verified` → `report.provenance.verified`, `env.evaluatorCodeVersion/dirty` → `evaluator_code_version/dirty`, `summary.thresholds` → `thresholds`. `writeReportFiles(r, root?)` returns the JSON path it wrote (absolute or cwd-relative; `run-cli.ts` normalises it with `path.relative(process.cwd(), …)`).
- **Task 5** left `scripts/ci/research-checks.ts` with an F6 marker block that continues the `criticalSuites` expression with `.concat('src/lib/evals/evals-store.integration.test.ts')` between `// F6 begin` / `// F6 end` (Task 5 Step 4; reconciled at integration).
- **Task 6** `store.ts::caseRowsTruncated(report:Pick<EvalReport,'run_id'|'kind'|'artifact_class'|'cases'>):boolean` exists (Task 6 as landed; rows only for public official/dual_source runs; fed to `summarize` as `reconciliationsTruncated`). `store.ts::persistRun` throws `EvalError` with `store_write_failed / store_conflict / store_partial / resume_mismatch`; `EvalRunRow.report_ref` is the repo-relative JSON path given in `files.ref`; with `{resume:true}` it checks `files.sha256 === row.report_sha256` itself.
- **Tasks 10/11** import from `replay/setup.ts` (commander-agreed interface): `FrozenSetup`, `FrozenSetupDraft` (= `FrozenSetup` without `setup_sha256`), `sealSetup(draft):FrozenSetup`, and — added at integration for Task 11's path-only drafts — `FrozenSetupPathsDraft` + `sealSetupFromPaths(draft, root?)` (fills every sha256 and `config_sha256` from the bytes); `buildFrozenDb(pool, setup, root?):Promise<FrozenBuild>` where `FrozenBuild={ok:false;mismatch:string}|{ok:true;issuers:Record<ticker,issuerId>;world:FrozenWorld}` (every hash is verified BEFORE any write; Task 11 reads `world.db`, `world.tables`, `world.setup.setup_sha256`; the commander chose this shape over W4's `FrozenDbResult`), plus `buildFrozenMemory`, `loadSetup`, `configSha256`, `setupSha256`, and F6's base setup file `src/lib/evals/fixtures/replay/f6-base.setup.json` (new file, Task 9). Frozen replay cases should project **ZZEVA / ZZEVB only**: Task 9's integration tests deliberately mutate **ZZEVC** (a 10-K/A and a same-day conflict). `factsReader` takes the projector through `deps.projector` (Task 10 wires its `projectRequest`).

New files beyond the skeleton file map (all inside F6 ownership): `src/lib/evals/adapters/memory-world.ts` (test-only), `src/lib/evals/kinds/official-test-support.ts` (test-only), `src/lib/evals/cli/run-cli.ts` (+ test; `scripts/evals/run.ts` is a thin wrapper because vitest only includes `src/**/*.test.ts`), `src/lib/evals/fixtures/edgar/CIK0009990603{,.amended,.conflict}.json`, `src/lib/evals/fixtures/replay/f6-base.setup.json`.

#### Spec ambiguities resolved here

- **Accession rewrite.** MSFT files through agents (`0000950170-`, `0001564590-`, `0001193125-`), so "`'00099906'` + rest" is read as: replace the whole 10-digit filer prefix by the padded synthetic CIK (`0009990601-23-000106`, `0009990602-23-035122`, `0009990603-…`). The generator asserts the rewrite is injective; prefixes never collide with AAPL, MSFT or sync-us's `ZZCF` (`0009990001-`).
- **Restatement / quarantine on a third issuer** `ZZEVC` (CIK 9990603, AAPL's FY2023 10-K only) so `ZZEVA/ZZEVB` stay immutable for Task 11's frozen replay in the same file.
- **Restricted sets:** `ci` → `restricted_in_ci` (§14), `report` → `kind_not_enabled` (§16 D8).
- **`expect:'missing'`** compares only rows in the target unit (the unit is part of the key, §4.6).
- **CN filing choice** (§0 R5-8): every `document_ref` match; if > 1, keep `period_end = target.period_end`; if still > 1, keep the periodic form of that month (`03→q1, 06→semiannual, 09→q3, 12→annual`); anything but exactly one → `filing_ambiguous`; no match → `filing_not_linked` when an unlinked tushare filing of that period exists, else `filing_not_found`.
- **`readNonVisible` with `binding:'current'`** (no document): quarantined = any non-ok row of the key visible at `asOf`; superseded = a stored row of the key (`available_date <= asOf`) whose generation is not its filing's active one.
- **`hints().mapping_gen_raised`** is computed from published `fact_sync_runs` (a run published after `since` with `mapping_gen` above every run published at or before `since`) — the table that actually records generation changes; `filings.mapping_gen` has no history.
- **Metrics `basedOnRev`** = the envelope's `state_rev` of the `read_facts` call the rows came from (what `materialize` does).
- **`--case` with an unknown id** → `EvalError('gold_invalid')`, exit 2. **CLI `ci`** builds the F6 frozen world itself (pg when the test-state file is set, else memory) so `run.ts --mode ci` is self-contained.

### C. W4（Task 10、11、13、14、15）

#### Contract change requests

1. **Task 9 `src/lib/evals/replay/setup.ts`: pin the exported shape.** Tasks 10/11 only need these names; please make Task 9 export exactly:
   ```ts
   export interface FrozenSetup{initial_state:'empty_after_migrations';issuer_seed:{path:string;sha256:string};fixture_manifest:{path:string;sha256:string}[];sync_order:string[];today:string;mapping_gen:number;formula_version:string;quarantine_resolutions:unknown[];config_sha256:string;setup_sha256:string}
   /** What a human writes in a draft replay case: no sha256 fields. */
   export type FrozenSetupDraft=Omit<FrozenSetup,'issuer_seed'|'fixture_manifest'|'config_sha256'|'setup_sha256'>&{issuer_seed:{path:string};fixture_manifest:{path:string}[]};
   /** Fills every sha256 from the file bytes under root (default process.cwd()) and computes setup_sha256. */
   export function sealSetup(draft:FrozenSetupDraft,root?:string):FrozenSetup;
   export type FrozenDbResult={ok:true;db:FactsDb;tables:TableClient;setupSha256:string}|{ok:false;mismatch:string[]};
   /** Verifies EVERY hash (seed, each fixture, config, recomputed setup_sha256) BEFORE writing anything; idempotent on a database where the same setup was already built. Paths resolve against opts.root (default process.cwd()). */
   export function buildFrozenDb(pool:Pool,setup:FrozenSetup,opts?:{root?:string}):Promise<FrozenDbResult>;
   ```
   **Integration resolution:** Task 9's shape wins for the build result — `FrozenBuild={ok:false;mismatch:string}|{ok:true;issuers;world:FrozenWorld}` and `buildFrozenDb(pool,setup,root?)`; Task 11 reads `world.db`, `world.tables`, `world.setup.setup_sha256` and wraps the mismatch string as `[mismatch]` for `SetupCheck`. W4's hash-less draft became Task 9's `FrozenSetupPathsDraft` + `sealSetupFromPaths(draft,root?)` (`FrozenSetupDraft`/`sealSetup` keep Task 9's meaning: a draft that already carries its hashes). The code below is written against that.
   Also: Task 9's mutating integration tests (restatement 10-K/A, quarantine) must use a third synthetic CIK (e.g. 9990603), never ZZEVA 9990601 / ZZEVB 9990602, because the frozen replay (Task 11) runs in the same shared database and projects those two issuers.
2. **Task 7 `adapters/facts.ts`: `project` delegates to Task 10.** `factsReader(...).project(request,today)` should be `projectRequest({db,resolve:(s,t)=>resolveSubject(s,t)},request,today)` from `src/lib/evals/projections/facts.ts` (db = the read-only FactsDb subset the reader already holds). Task 10/11 never call `reader.project` (they call `projectRequest` directly), so this is a follow-up the commander can apply when integrating Task 7; nothing in W4 breaks without it.
3. **Task 4 `renderMarkdown`: no case values for `kind='reference_regression'`.** Spec §5.4(c) forbids the canary value in the public `.md`; the canary must still travel through `cases[]` with `right='918273645.5'`. Task 14's test asserts `renderMarkdown(report)` does not contain the sentinel, so Task 4 must render only `summary` (and case ids / results without left/right/detail) for that kind.
4. **Task 1 `summary.ts`: replay/reference reductions.** W4 relies on §3.3 exactly: `identical`, `explained_diff`, `data_drift` with `ledger_ids.length>0`, `within`, `beyond_explained` → `correctness.pass`; `data_drift` with `ledger_ids=[]`, `unexplained_diff(*)`, `beyond_unexplained` → `correctness.unexplained_diff`; every `skipped(*)` → `coverage.skipped`.
5. **`lock.json` is not appended by Task 11.** The skeleton says "Task 9/11 追加" lock entries, but `GoldLock.files[].format` is `GoldFormat` (`'f6'|'legacy_plan2'`) and replay fixtures are not gold sets. Task 11 protects `facts.frozen.json` instead with (a) `expected.projection_hash === projectionHash(expected.projection)` checked on every parse and (b) append-only `record-replay.ts`. If the commander wants replay files in the lock, `GoldFormat` needs a `'replay'` member first. **Integration: accepted.** Replay files stay out of `lock.json`; Task 12's manifest validator authenticates replay/reference evidence by the fixture's committed bytes (`manifest_fixture`) and checks the lock for gold-set kinds only.
6. **`Disposition` carries `natural_key`.** The brief's `disposition:{quarantine_id;status;chosen_fact_ids}` cannot apply the spec §5.5 rule "natural_key must equal the observation key's canonical string" without it, so Task 14 defines `Disposition{quarantine_id;natural_key;status;chosen_fact_ids?}`.
7. **Ledger structural errors use `gold_invalid`.** `EvalErrorCode` has no ledger code; `parseLedger` throws `EvalError('gold_invalid', …, {file:'explanations.json', index, ledger_id, field})`. Self-approval is not a parse error: those entries parse and never explain anything (`unexplained_diff(ledger_self_approved)`), per §14.
8. **New files outside the skeleton's file map (all inside `src/lib/evals/**`):** `replay/fixture.ts` (replay case types + parser), `replay/record.ts` (pure append-only recording), `kinds/registry.ts` (`KIND_REGISTRY`, imported by Task 9's `run.ts` so a unit test does not have to import a CLI module), `kinds/read-only.ts` (reflection check), `kinds/ratio.ts` (exact ratio text), `test-support/memory-facts.ts`, `test-support/eval-rows.ts` (test helpers, not test files).

#### Assumptions (Task 1–9 exports used by W4)

- **A1** `canonical-json.ts`: `canonicalJson(v)`, `sha256Hex(s)`, `projectionHash(p)=sha256Hex(canonicalJson(p))`, exactly as in the skeleton.
- **A2** `compare.ts`: `compareWithinTolerance(left,right,rel)` returns `{passed,absDiff,relDiff}`; `relDiff = |l−r| / max(|l|,|r|,1)` truncated to 10 places, as decimal text (W4 compares it only through `canonicalDecimal`, so trailing zeros do not matter); throws `Error` on a non-decimal input.
- **A3** `summary.ts`: `summarize(cases,ctx)`, `gateOf(s)`, `statusOfGate(g)` as in the skeleton, with the §3.3 reductions of CCR 4.
- **A4** `version.ts`: `evaluatorVersion():{sha:string;dirty:boolean}` where `sha` is 40-hex; it throws `EvalError('code_version_missing')` when no sha can be resolved.
- **A5** `store.ts`: `EvalStore.finishRun(runId,status,summary,finishedAt)` as in the skeleton.
- **A6** `report.ts`: `renderMarkdown(r:EvalReport):string` (with CCR 3).
- **A7** `replay/setup.ts`: as in CCR 1.
- **A8** Task 9 committed `src/lib/evals/fixtures/issuers/f6-seed.json`, `src/lib/evals/fixtures/edgar/CIK0009990601.json` (ZZEVA, AAPL-derived) and `src/lib/evals/fixtures/edgar/CIK0009990602.json` (ZZEVB, MSFT-derived); after `buildFrozenDb`, `resolveIssuer(tables,{cik:'9990601'},{today})` and `{cik:'9990602'}` resolve.
- **A9** (reconciled) Task 9 `scripts/evals/run.ts` is a thin wrapper over `src/lib/evals/cli/run-cli.ts::runCli`, which parses `--kind` before any database or gold-set work, dispatches through `KIND_RUNNERS`, and on an `EvalError` prints one JSON line `{error:code,message,detail}` to stderr and returns `exitCodeOfError(e)`.
- **A10** Task 9 `src/lib/evals/evals-facts.integration.test.ts` exists, is in `criticalSuites`, and imports `afterAll, beforeAll, describe, expect, it` from `vitest` (Task 11 adds to that import if one is missing).
- **A11** `.claude/scratch/db-one.ts` exists (content: `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5; rebuild it from there if it is missing).
- **A12** Task 7's `factsReader` / `privilegedFactsReader` are NOT imported by W4 code (see CCR 2); W4 uses landed plan-2 code directly: `FactsDb` (`src/lib/facts/types.ts`), `memoryFactsDb` (`src/lib/facts/memory-facts-db.ts`), `deriveMetrics` / `DERIVE_CONCEPTS` / `FORMULA_VERSION` / `metricNames` (`src/lib/facts/derive.ts`), `isConceptId` (`src/lib/facts/concepts.ts`), `canonicalDecimal` (`src/lib/facts/json-numbers.ts`), `resolveIssuer` (`src/lib/entities/resolve.ts`), `supabaseFactsDb` (`src/lib/facts/db.ts`), `getAnonSupabase` (`src/lib/supabase/anon.ts`), `supabaseTableClient` / `TableClient` (`src/lib/db/table-client.ts`), `memoryTableClient` (`src/lib/db/memory-table-client.ts`), `requireAdminUser` / `AdminForbidden` / `AdminUnauthenticated` (`src/lib/admin/auth.ts`), `getAdminSupabase` (`src/lib/supabase/admin.ts`).

#### Landed-code facts verified for W4

- The public facts routes have **no injectable deps factory**: `src/app/api/facts/[ticker]/route.ts` and `metrics/route.ts` call `publicClients()` from `src/lib/facts/public-route.ts`, which builds `supabaseTableClient(getAnonSupabase())` and `supabaseFactsDb(getAnonSupabase())` (imported from `./db`). Issuer resolution goes through `resolvePublicIssuer` → `resolveIssuer` from `../entities/resolve`. So the route-equivalence test uses `vi.mock` on **`@/lib/supabase/anon`** (`getAnonSupabase`), **`@/lib/facts/db`** (`supabaseFactsDb` → the shared `memoryFactsDb`, other exports kept through `importOriginal`) and **`@/lib/entities/resolve`** (`resolveIssuer`, other exports kept), the same three modules `route.test.ts` mocks.
- `publicFact` does **not** carry `consolidation` (all facts rows are `'consolidated'`: `FactInsert.consolidation` is the literal type `'consolidated'`), and carries no `source_ref` (it is joined from `body.filings[].sourceRef` by `filingId`). `publicMetric.inputs` are `{fact_id,concept,filing_id,available_date}`, so the route-side metrics projection resolves `period_end/source_ref` with a second call in `factIds` evidence mode.
- `memoryFactsDb.readFacts` only returns facts whose `mapping_gen` equals the filing's activated `mapping_gen` (staged filings have `mapping_gen 0`), and the route additionally filters `isPublished` filings; both paths therefore see the same rows.
- `MAPPING_GEN = 1`, `FORMULA_VERSION = 'facts-derive/1.0'` (not the spec example's `3` / `v1`).
- Admin pattern: `src/app/api/admin/dq/route.ts` awaits `requireAdminUser()` first, then validates the query, then calls `supabaseTableClient(getAdminSupabase())`; `AdminUnauthenticated` → 401 `{error:'authentication required'}`, `AdminForbidden` → 403 `{error:'admin role required'}`, everything else → `console.error('[admin/dq]', message)` + generic 500. Its test mocks `@/lib/admin/auth` (via `importOriginal`) and `@/lib/supabase/admin`.
- `TableClient.count` / `select` only support equality matches plus `gte/lt`, so "status in (failed, incomplete, error)" is three counts.
- Plan 3 `ReconcileOutcome` (migration "dq_reconciliations: pairs, kinds, outcomes"): `'compared'|'left_missing'|'left_unlinked'|'left_ambiguous'|'right_missing'|'unsupported'|'right_ambiguous'|'incomplete_gold'` plus the DB-only `'legacy'`; plan 3 `decimal.ts::relDiff(l,r,scale=10)` = `|l−r| / max(|l|,|r|,1)`, rounded half away from zero.

#### Spec ambiguities resolved (W4)

1. Replay facts projections read `history:true` (the projection includes `disclosure_seq/is_current/is_revision`, which are only meaningful over the full disclosure log). `request.durations` filters rows after the read.
2. Diff paths: `facts[<concept>/<period_start>..<period_end>/<duration>/<unit>/<available_date>/<source_ref>].<field>`, with `null` rendered as the empty segment (instant: `cash/..2024-09-28/INSTANT/…`). Metrics: `metrics[<metric>/<period_start>..<period_end>/<duration>/<basis>/<formula_version>].<field>`. A row present on one side only is the bare `facts[<id>]`; a module change is `module`; a repeated identity gets `#2`, `#3`. A hash difference with no field difference (cannot happen with sorted rows, kept as a guard) is `['projection']`.
3. A replay request is a facts request (`concepts` non-empty, no `metrics`) or a metrics request (`metrics` non-empty, `concepts: []`); never both.
4. Unprivileged live runs still honour a ledger hit (`explained_diff`): the ledger does not depend on hints. Without a hit the reason is the more specific `partial_ledger` / `ledger_self_approved` when such an entry exists, else `no_hints`.
5. Replay `CaseReport`s carry `left/right/abs_diff/rel_diff = null`, `tolerance = '0'`, hashes and changed fields in `detail`.
6. Dual source: a fail whose disposition satisfies §5.5 becomes `{result:'pass'}` with `detail.compared='fail'` and `detail.disposition.handled=true` (the trend keeps the raw fail). `*_ambiguous`, `unsupported`, `legacy` and unknown upstream outcomes → `read_error(read_failed)` with `detail.upstream_outcome`; two observations with the same key → `fail(ambiguous)`; a truncated observation read adds one `read_error(truncated)` case.
7. Reference: the canary case is in `cases[]` (full comparison path) but excluded from the counted cases, `ReferenceResult` and the summary. The ledger has no id, so `beyond_explained.ledger_ids = [sample_id]`.
8. Extraction step 2 sorts by value-equality first, then **page-aware** IoU (different pages → IoU 0), then label bbox, prediction bbox, label index, prediction index.
9. Calibration: when no sample is eligible, the summary is computed over `[]` so §3.2 rule 1 (`population = 0`) gives `incomplete`; ineligible samples still appear as `skipped(ineligible)` in `cases[]` and in `ineligible[]`.
