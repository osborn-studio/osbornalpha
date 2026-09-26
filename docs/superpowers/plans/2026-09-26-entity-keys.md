# 实体对照表实施计划（WP-A2） / Entity Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落 `research_entity_keys` / `research_entity_securities` 两表、校验位函数、GLEIF/SEC 解析器、21 家首批数据、幂等写库与 `entityTableVersion()`。

**Architecture:** 迁移沿 Research OS 惯例（authenticated owner 策略）；`src/lib/research/entity-keys/` 内纯函数（identifiers、parsers）与 Supabase 客户端 store 分层；数据以 JSON 随仓库提交并由测试逐键校验。规格：`docs/superpowers/specs/2026-09-26-entity-keys-design.md`。

**Tech Stack:** PostgreSQL 17（`scripts/s4/local-db.ts`）、Supabase JS、vitest、`pa-v1/json.js` 的 `digest`。

---

### Task 1: 校验位函数（TDD）
**Files:** Create `src/lib/research/entity-keys/identifiers.ts`, Test `identifiers.test.ts`
- [ ] 失败测试：`isValidIsin('US0378331005')` 真、`'US0378331006'` 假、小写/长度错假；`isValidLei('549300UVN46B3BBDHO85')` 真、改一位假；`isValidUsci('913300002539329145')` 真、改末位假、含 I/O/S/V/Z 假；`normalizeCik('0001321655')==='1321655'`，`isValidCik('abc')` 假。
- [ ] RED → 实现 → GREEN → 提交 `feat(entity-keys): identifier check digits`。

### Task 2: 解析器（TDD）
**Files:** Create `parsers.ts`, Test `parsers.test.ts`
- [ ] 失败测试：`parseSecCompanyTickers` 对 fixture `{"0":{"cik_str":1321655,"ticker":"PLTR","title":"Palantir Technologies Inc."}}` 与 `['PLTR','ZZZZ']` 返回 `{PLTR:{cik:'1321655',title}}` 且报告 `missing:['ZZZZ']`；`selectIsinsForLeis` 对多行 fixture（含表头、CRLF、非目标 LEI）只返回目标 LEI 的 ISIN 数组，保持文件顺序。
- [ ] RED → 实现（`selectIsinsForLeis` 接受 `Iterable<string>`，逐行）→ GREEN → 提交。

### Task 3: 迁移与真库测试
**Files:** Create `supabase/migrations/20260926010000_research_entity_keys.sql`, Test `entity-keys.integration.test.ts`
- [ ] 失败测试（`S4_TEST_STATE`）：两表存在、RLS 启用、四条 self 策略、`alpha_s4_runtime` 只有 select；复合外键拒绝他人 entity；`valid_to <= valid_from` 拒绝；同用户重复 LEI 拒绝；迁移重放无错。
- [ ] RED → 写迁移，对运行中库执行 → GREEN → 提交。

### Task 4: 首批数据 + 数据测试
**Files:** Create `first-cohort.json`, Test `cohort.test.ts`, Create `docs/templates/entity-keys-a-share-manual.csv`
- [ ] 失败测试：加载 JSON；21 家；每家 `names_en[0]` 非空、`home_market` 合法、至少一条 `is_primary` 证券带 `valid_from`；每个非空键校验位通过；`missing` 与空键一致；LEI/USCI/CIK/ISIN/exchange_code 全表无重复；每个有值键有 `provenance.source`。
- [ ] RED（文件不存在）→ 写 JSON（规格"首批数据来源"）与模板 → GREEN → 提交。

### Task 5: store 与 seed（mock 测试 + 真库）
**Files:** Create `store.ts`, `seed.ts`, Test `store.test.ts`, 扩展 `entity-keys.integration.test.ts`
- [ ] 失败测试（真库，用 service-role 直连 pg 模拟 Supabase？否——用 `@supabase/supabase-js` 需 PostgREST；改为：store 函数接受 `ResearchCtx`，mock 测试验证 upsert 调用序列与 payload；真库测试用 admin pool 直接插入两家并验证 `entityTableVersion` 的 SQL 等价实现）。
  - 决定：`store.ts` 走 Supabase 客户端；`entityTableVersion` 的哈希输入由 `versionInput(rows)` 纯函数给出，真库测试用 pg 读行后调用同一纯函数，断言同数据两次相同、改一键即变、与 `provenance/updated_at` 无关。
- [ ] RED → 实现 → GREEN → 提交。

### Task 6: 脚本
**Files:** Create `scripts/entity-keys/{parse-sec-tickers,parse-gleif-isin-lei,seed}.ts`
- [ ] 各脚本只做参数解析 + 调用库函数 + 打印；用会话临时目录中的真实文件手动跑一次，输出与 `first-cohort.json` 一致（CIK 9/9，ISIN 10/10）。
- [ ] 提交。

### Task 7: 全量验证与评审
- [ ] 新库 `S4_TEST_STATE=… npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
- [ ] `codex review --base origin/main`（中等）；修 P1/P2。
- [ ] 推送，开 PR（base `main`）。
