# WP-A8 变化卡生成器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 落地 spec `2026-09-26-change-cards-design.md`。

**Architecture:** 纯函数三段（证据选取 → 选卡 → 生成校验）+ 一个 runner（S4 池读台账、Supabase 写卡）+ 迁移 + 脚本 + 只读页面。

**Tech Stack:** Next.js 15 / TypeScript / vitest / Supabase mock / 隔离 PostgreSQL 17。

---

### Task 1 迁移 + 类型 + 真库测试 — RED → GREEN → 提交
- [ ] `types.ts`：`CardKind`、`CARD_FIELDS`、`CardAssertion`、`ResearchCard`
- [ ] `src/lib/research/cards/cards.integration.test.ts` → RED；迁移 `20260926120000_research_cards.sql` → GREEN
- [ ] 提交 `feat(cards): research_cards table and types`

### Task 2 证据选取 + 选卡 — RED → GREEN → 提交
- [ ] `cards/evidence.test.ts`、`cards/evidence.ts`；`cards/select.test.ts`、`cards/select.ts`
- [ ] 提交 `feat(cards): weekly evidence selection and card selection`

### Task 3 axiom AX006 + 生成校验 — RED → GREEN → 提交
- [ ] `axioms.ts` AX006 + `checkCardAxioms`；`seed.ts` 种子；`axioms.test.ts`
- [ ] `cards/generate.test.ts`、`cards/generate.ts`（prompt、解析、校验、blocked）
- [ ] 提交 `feat(cards): seven-field generation with citation validation and trading-advice axiom`

### Task 4 runner + 脚本 + API + 页面 — 提交
- [ ] `cards/run.ts`（`runCards`，台账加载器可注入）、`cards/run.test.ts`
- [ ] `scripts/research-cards.ts`；`GET /api/research/cards`；`/research/cards` 页面；sources 行锚点；导航
- [ ] 提交 `feat(cards): runner, script, API and /research/cards page`

### Task 5 验证、本地演练、Codex、PR（base `main`）
- [ ] 全量测试（`S4_TEST_STATE`）、typecheck、lint、build
- [ ] 合成台账 + 假 LLM 本地演练 → `docs/handoffs/alpha-a8/`
- [ ] `codex review --base origin/main`；修 P1/P2；push；PR；bind（Auto-fix 待授权）
