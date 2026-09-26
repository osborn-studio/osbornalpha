# 采集器实施计划（WP-A4 第一切片） / Collectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EDGAR、巨潮、HKEX 三个采集器 + 版本化写入 + 编排脚本 + orgId 回填脚本，全部夹具测试。

**Architecture:** 每源一个纯解析层（响应 → 记录）+ 一个 I/O 层（注入 fetch）；共享 `write.ts` 负责版本化 `ingestSource`；`run.ts` 隔离失败并写审计。规格：`docs/superpowers/specs/2026-09-26-collectors-design.md`。

**Tech Stack:** TypeScript、vitest、Supabase JS（mock 测试）、fetch。

---

### Task 1 版本化写入（TDD）
Modify `src/lib/research/sources.ts`（`IngestSourceInput.source_version?`、`origin_type?`），Create `ingest/collectors/write.ts`, Test `write.test.ts`
- [ ] 失败测试：v1 → duplicate → v2 新行保留旧行；非法 version 拒绝；`origin_type` 非法拒绝。RED → 实现 → GREEN → 提交。

### Task 2 EDGAR（TDD）
Create `collectors/types.ts`, `collectors/edgar.ts`, fixtures, Test `edgar.test.ts`
- [ ] 失败测试（规格"测试"节）。RED → 实现 → GREEN → 提交。

### Task 3 巨潮（TDD）
Create `collectors/cninfo.ts`, fixtures, Test `cninfo.test.ts`
- [ ] RED → 实现 → GREEN → 提交。

### Task 4 HKEX（TDD）
Create `collectors/hkexnews.ts`, fixture HTML, Test `hkexnews.test.ts`
- [ ] RED → 实现 → GREEN → 提交。

### Task 5 编排 + 脚本 + orgId 回填
Create `collectors/run.ts`, `scripts/research-collect.ts`, `scripts/entity-keys/fill-cninfo-org-id.ts`, Tests `run.test.ts`, `fill-cninfo-org-id.test.ts`
- [ ] RED → 实现 → GREEN；跑回填脚本更新 `first-cohort.json`（10/10 orgId）→ `cohort.test.ts` 通过 → 提交。

### Task 6 全量验证与评审
- [ ] 本地库实抓一次并存回执；`npm test`、typecheck、lint、build；`codex review --base origin/main`；修 P1/P2；推送；开 PR（base `main`）。
