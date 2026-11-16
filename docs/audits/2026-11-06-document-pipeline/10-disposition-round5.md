# F3 文档管道计划 — Codex 计划审计第 5 轮处置

- 审计：`docs/audits/2026-11-06-document-pipeline/09-codex-plan-round5.md`（0 个 P1、1 个 P2）
- 计划：`docs/superpowers/plans/2026-11-06-document-pipeline.md`（第 4 轮已提交为 `014150e`），改动记在 `## 整合记录` 的"Codex 计划审计第 5 轮处置"
- 处置：指挥裁决接受，日期 2026-11-06；Task 1 文本未改

## 处置表

| ID | 处置 | 改动位置 |
|---|---|---|
| R5-P2-1 | 接受。`ExtractDeps.preflight?()`：生产实现检查 worker bundle（`workerEntry()`）存在，缺失 → `worker_missing`；`runDocumentsExtract` 在读取/认领任何文档之前执行：apply 时批次以 `worker_missing` 失败（`counts.failed=1`、新鲜度失败、不认领、不耗尝试），dry-run 时回执同码且不抽取。`scripts/documents/extract.ts` 缺 bundle 时先调用 `buildExtractWorker()`；`package.json` 加 `predev`（与 `prebuild` 相同）；runbook §2 写明 | Task 10 `extract/run.ts`（`preflight`、头注）、`extract/deps.ts`、`scripts/documents/extract.ts`、`package.json` 说明、`run.test.ts`（缺 bundle → `worker_missing`、0 次认领、`extract_attempts` 仍 0、文档仍 `stored`；dry-run 同码；就绪后同一文档正常抽取）；Task 19 runbook §2 |

## 验证（沙箱：工作树副本 + 计划抽出文件 + 工作树已落地的迁移一；未在工作树内跑测试）

- `tsc --noEmit`：0 错误
- `eslint --max-warnings=0`：F3 全部文件 + `batches.ts`、`local-db.ts`，0 输出
- vitest F3 单测：45 个文件、359 例全部通过
- 本机 PostgreSQL 17 四个 F3 critical 套件：65 例全部通过
- 未覆盖：在全新 checkout 上实跑 `extract.ts --apply`（需真实 Supabase 环境）与 `npm run dev` 的 `predev`
