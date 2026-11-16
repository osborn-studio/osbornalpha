# F3 文档管道计划 — Codex 计划审计第 4 轮处置

- 审计：`docs/audits/2026-11-06-document-pipeline/07-codex-plan-round4.md`（0 个 P1、2 个 P2）与 `task01-codex-recheck.md` 的 N1（P2）
- 计划：`docs/superpowers/plans/2026-11-06-document-pipeline.md`（第 3 轮已提交为 `84f973f`），改动记在 `## 整合记录` 的"Codex 计划审计第 4 轮处置"
- 处置：指挥裁决三项全部接受（R4-P2-1 按指挥改为 esbuild 预打包 worker），日期 2026-11-06
- Task 1 的计划文本未改动（由指挥按已落地代码同步）；沙箱用工作树里已落地的迁移一与其集成测试验证其后各任务

## 处置表

| ID | 处置 | 改动位置 |
|---|---|---|
| R4-P2-1 | 接受（按指挥改设计：取消 worker 里运行时注册 tsx）。新脚本 `scripts/documents/build-extract-worker.ts` 用 esbuild（`devDependencies` 加 `esbuild@0.28.1`，即 tsx 已带入的版本）把 `extract/worker-entry.ts`（由 `.mjs` 改为 TS 入口）连同 extract 代码与 pdfjs-dist（pdf.mjs、pdf.worker.mjs 内联）打成单个自包含 ESM：`build/extract-worker/extract-worker.mjs`（`build/` 已 gitignore，不提交）；`package.json` 加 `prebuild`；`isolate.workerEntry()` 指向该产物；CMaps/标准字体由主线程 `pdfjsAssets()` 经 `job.assets` 传给 worker。`F3_EXTRACT_FILES` 改为：bundle + `pdfjs-dist` 的 `cmaps/`、`standard_fonts/`、`legacy/build/pdf.worker.mjs`（去掉 tsx/esbuild/TS 源） | Task 10：`worker-entry.ts`、`worker-job.ts`（`assets`）、`isolate.ts`、`extract/deps.ts`、新脚本、`package.json`、`next.config.mjs` F3 块、`isolate.test.ts`（测试内构建到系统临时目录，目录里只有 bundle 与上述资源、无 node_modules，抽取 PDF 与 HTML 夹具并验证页数上限）、Files/`git add`、文件结构、契约补充 |
| R4-P2-2 | 接受。`withLeaseHeartbeat` 新选项 `remainingMs`/`reserveMs`（`FINAL_RESERVE_MS=20s`）：保留区内不再发起心跳；续租请求最多等 min(间隔, 剩余预算−保留)，超时视为暂时（续租只续持有者）；排空最多等 min(drainMs, 剩余预算−保留)；所有等待计时器无论哪边先到都清除。抽取、候选、晋升三处调用都传入各自的剩余预算 | Task 10 `lease.ts` + `lease.test.ts`（截止边缘：续租卡死时结果在保留区之前返回、无残留计时器；保留区内不起心跳；成功排空后 `vi.getTimerCount()===0`）、`extract/run.ts`；Task 15 `candidates/run.ts`；Task 16 `promote.ts`；契约补充 |
| Recheck N1 | 接受。迁移一（已落地）拒绝不带 `p_done`/`p_reset` 清空回填游标；Task 7 的 EDGAR 覆盖缺口重来改为显式 `reset`（`advanceCursor(…,null,false,true)`），这正是同步设计里的"有意重来"。内存实现同步该规则 | Task 7 `sync.ts`（及行为清单）+ `sync.test.ts`（缺口路径第二轮仍 success、游标为空、不 `cursor_regression`）；Task 2 内存 `advanceCursor`；`db-contract.ts`（不带 reset 清空 → `cursor_regression`，带 reset 重来成功；内存与真实迁移一的 pg 都跑） |

## 验证（沙箱：工作树副本 + 从计划抽出的文件 + 工作树已落地的迁移一；未在工作树内跑测试）

- `tsc --noEmit`：0 错误
- `eslint --max-warnings=0`：F3 全部 127 个文件 + `src/lib/dq/batches.ts`、`scripts/s4/local-db.ts`，0 输出
- vitest F3 单测：45 个文件、358 例全部通过（含：在只有 bundle 与 pdf.js 资源、没有 node_modules 的临时目录里运行打包后的 worker 抽取 PDF/HTML）
- 本机 PostgreSQL 17 四个 F3 critical 套件（真实迁移一）：65 例全部通过
- 未覆盖：`next build`/`prebuild` 在 Vercel 上的实际运行与路由 `.nft.json` 的内容（runbook §9 冒烟）
