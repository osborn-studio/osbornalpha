# F3 文档管道计划 — Codex 计划审计第 3 轮处置

- 审计：`docs/audits/2026-11-06-document-pipeline/05-codex-plan-round3.md`（1 个 P1、2 个 P2，含第 1 轮遗留的 P2-7；R2-P1-1、R2-P2-1 已判 CLOSED）
- 计划：`docs/superpowers/plans/2026-11-06-document-pipeline.md`（第 2 轮已提交为 `4b484c2`），改动记在 `## 整合记录` 的"Codex 计划审计第 3 轮处置"
- 处置：指挥裁决三项全部接受，日期 2026-11-06
- Task 1 的计划文本未改动（Task 1 正由实施者在工作树里落地）；本轮的 SQL 改动全部在迁移二（Task 13）

## 处置表

| ID | 处置 | 改动位置 |
|---|---|---|
| R3-P1-1 | 接受。借来的表币种引用改用自己的角色 `unit_currency`（迁移二 `fact_citations.role` 检查、`insert_fact_citations` 角色校验、`CitationRole`/`CITATION_ROLES`）；`unit` 恢复"恰 1 条"（SQL 与内存）；`assert_run_evidence_complete` 新增 `unit_evidence`：已发布的 `unit` 必须是候选声明的那条，`unit_currency` 恰为候选声明的那条（只有仙/cents EPS 才声明），否则为零；检查 `unitEvidence` 对金额与显式币种 EPS 上的 `unit_currency` 一律 `unit_currency_unexpected` 阻断 | 共享契约 `CitationRole`/`FactCitations` 注释（两处）；Task 13 迁移二 SQL（表、`insert_fact_citations`、`assert_run_evidence_complete`）、内存 `assertEvidence`、`CITATION_ROLES`、契约用例（金额事实多一条 `unit_currency`、多一条 `unit` → `evidence_incomplete`，pg 与内存）；Task 15 `checks.ts` + `checks.test.ts`（金额 + 美元币种证据、显式 RMB cents + 币种证据均阻断）；`test-support.ts` 种子支持 `cents`（标签带（仙）、`unit` 引用仙、`unit_currency` 引用单位行、scale 0.01）；Task 16 `promote.ts` 以 `unit_currency` 角色写证据 + 端到端用例（仙 EPS 过检查、发布后恰 1 条 `unit` 与 1 条 `unit_currency`，收益无 `unit_currency`） |
| R3-P2-1 | 接受。落地的规格二 SQL 没有只续持有者的函数（`claim_fact_sync_lease` 会接手无主/过期/已释放的范围），迁移二新增 `renew_hk_fact_lease`：只在本批次持有且未过期时延长；端口 `renewLease` 三实现；晋升的心跳与阶段续租都改用它。`withLeaseHeartbeat` 给阶段传 `quiesce()`：停表并等在途续租（≤ `drainMs`，幂等）；阶段释放租约前调用（晋升 `release`、候选 `finishCandidates` 前），返回结果前总会调用 | Task 13 迁移二 SQL、`F3_RPC`、端口接口（两处）、Supabase/pg/内存实现、契约用例（无主、他批次、已释放都不接手）；Task 10 `lease.ts` + 用例（结果等在途续租落定、之后不再续租）；Task 15 `candidates/run.ts`；Task 16 `promote.ts` + 假定时器用例（心跳续租卡住超过排空上限：晋升照常发布并释放，迟到的续租被只续持有者的函数拒绝，范围保持已释放）；契约补充 |
| R1-P2-7（定稿） | 接受。阻塞抽取（PDF 与 HTML）在 `node:worker_threads` 里跑：`extract/worker-entry.mjs`（纯 ESM，为本线程注册 tsx 加载器后运行 `worker-job.ts`）、`extract/isolate.ts::extractInWorker`（主线程保留心跳；硬截止 `worker.terminate()` → `extract_timeout`；心跳中止 → 终止并 `lease_lost`）。生产 `extract/deps.ts` 的 `extractPdf`/`extractHtml` 都经 worker（worker 自身软预算比硬截止短 5 s）；`ExtractBudget` 加 `signal`；`extractHtml` 依赖可异步；页数上限保留。`next.config.mjs` 的 F3 块改为共用常量 `F3_EXTRACT_FILES`：pdf.js 资源 + `worker-entry.mjs` + `extract/*.ts` + `types.ts` + tsx/esbuild 运行文件，随三条抽取路由打包；Vercel 上能否起 worker 由 runbook §9 冒烟核对，失败按决策 D 只在本机抽取 | Task 9 `pdf.ts`（`ExtractBudget.signal`）；Task 10 新文件 `worker-job.ts`、`worker-entry.mjs`、`isolate.ts`、`isolate.test.ts`、测试用 `fixtures/worker/slow-worker.mjs`（最后一页卡住、事件循环被同步死循环阻塞：都在硬截止被终止，期间主线程 50 ms 心跳持续跳动；心跳中止 → `lease_lost`；真实入口抽 PDF/HTML 且页数上限生效），`run.ts`（`layoutOf` 统一预算、带 signal），`deps.ts`，`next.config.mjs` F3 块；契约补充 |

## 验证（沙箱：工作树副本 + 从计划抽出的全部文件；未在工作树内跑测试）

- `tsc --noEmit`：0 错误
- `eslint --max-warnings=0`：F3 全部 126 个 TS/MJS 文件 + `src/lib/dq/batches.ts`、`scripts/s4/local-db.ts`，0 输出
- vitest F3 单测：45 个文件、356 例全部通过（第 2 轮后 346 例；含真实 `worker_threads` 用例）
- 本机 PostgreSQL 17（`LC_ALL=C`，UTF8 harness）四个 F3 critical 套件：59 例全部通过（含 pg 端的 `renew_hk_fact_lease` 与证据形状用例）
- 未覆盖：`next build` 与 Vercel 上 worker 的实际启动（runbook §9 冒烟）
