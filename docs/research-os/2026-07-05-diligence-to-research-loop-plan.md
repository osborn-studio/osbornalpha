# company-diligence → Research OS 闭环 Implementation Plan

> Spec: `docs/research-os/2026-07-05-diligence-to-research-loop-spec.md`（4 审阅点用户已全采纳默认：简报=source、NOTE+metadata、版本放 metadata、重生成=用户触发+30天过期）。
> Research OS 在 stock-monitor 仓库内、admin 门控、Supabase `research_*` 表。复用 `ingestSource`/`upsertEntity`/`requireResearchUser`/`audit`。

**Goal:** company-diligence 简报一键存进研究脑=一条 `research_source_documents`（NOTE + metadata.kind='diligence'），带版本链、待核实归档；sources 页显示尽调徽章+版本+过期提示+🔄重生成。

**禁触:** KlineChart.tsx / composer.ts。分支 `feat/diligence-research-loop`。

---

### T1: 版本链 + ingestDiligence 服务（TDD）

**Files:** `src/lib/research/diligence.ts`（+test）

- `interface IngestDiligenceInput { ticker: string; canonical_name?: string; one_line?: string; unverified?: string[]; markdown: string; tool_refs?: string[]; provenance?: { model?: string; generated_at?: string }; }`
- `diligenceVersion(ctx, ticker) → { version: number; supersedes: string | null }` 纯查询：select 该 user 下 `metadata->>kind = 'diligence' AND metadata->>ticker = ticker` 的 sources，按 `ingested_at desc`；`version = count + 1`，`supersedes = 最新一条 id | null`。
- `ingestDiligence(ctx, input) → IngestResult & { version, entity_id }`：
  1. `entity_id = await upsertEntity(ctx, { type:'COMPANY', name: canonical_name || ticker, ticker })`（find-or-create）。
  2. `{ version, supersedes } = await diligenceVersion(ctx, ticker)`。
  3. `ingestSource(ctx, { source_type:'NOTE', title:`尽调简报：${canonical_name||ticker}（${ticker}）`, raw_text: markdown, trust_level:'MEDIUM', entity_ids:[entity_id], metadata:{ kind:'diligence', method:'company-diligence', ticker, canonical_name, one_line, unverified: unverified??[], version, supersedes, provenance: provenance??{}, tool_refs: tool_refs??[] } })`。
     ⚠️ `ingestSource` 现签名可能不接受 `metadata`——**检查 IngestSourceInput**：若无 metadata 字段则加上（透传进 insert；research_source_documents.metadata jsonb 列已存在）。
  4. `audit(ctx, 'source.ingest_diligence', { ticker, version, duplicate })`。
  5. content_hash 撞（同 markdown）→ ingestSource 返回 duplicate=true，则 version 不算新（返回既有）；实现：dedup 时直接返回 `{ ...result, version: <既有那条的 version> }`（从 supersedes 链或重查）。**简化**：dedup 命中就返回 `{ duplicate:true, id, version: version-1 }` 并跳过——注明。
- **Tests（mock ctx，复用 test-support）**：version 从空库=1、有 2 条历史=3 且 supersedes=最新 id；entity find-or-create（upsert 调用参数）；metadata 形状含 kind/ticker/version/unverified；dedup 路径返回 duplicate 不递增。
- Commit: `feat(research): ingestDiligence service with version chain`

### T2: from-diligence API

**Files:** `src/app/api/research/sources/from-diligence/route.ts`

- `POST`：`withResearch(async () => { const ctx = await requireResearchUser(); const body = await req.json(); /* 校验 ticker+markdown 非空 → SourceValidationError */ return await ingestDiligence(ctx, body); })`。
- 非 admin → requireResearchUser 抛 ResearchForbidden → api.ts 映射 403（现成）。校验失败 → 400（现成）。
- Commit: `feat(research): POST /api/research/sources/from-diligence`

### T3: CopilotClient「存入研究脑」按钮

**Files:** `src/app/(app)/copilot/CopilotClient.tsx`、`messages/{zh,en}/market.json`

- company-diligence run 完成且有 `verdict`（收尾 summary JSON）时，在 verdict 卡片区显示「📥 存入研究脑」按钮。**仅** `methodId==='company-diligence'` 显示（其它方法不显示）。
- 点击 → `POST /api/research/sources/from-diligence` body `{ ticker: verdict.ticker || ticker, canonical_name: verdict.canonical_name, one_line: verdict.one_line, unverified: verdict.unverified, markdown: text, tool_refs: calls.map(c=>c.name), provenance:{ generated_at: new Date().toISOString() } }`。
- 状态：saving / 成功「已存入研究脑 · 第 N 版」+ 链 `/research/sources` / 403「需 admin 权限」/ 其它错误红字。照抄 adoptVerdict 的状态机模式（新 `saving`/`saved` state）。
- i18n：`market.copilot.saveToBrain` / `saved`(带 {version}) / `savingBrain` / `needAdmin`。zh/en。
- Commit: `feat(copilot): save company-diligence brief into Research OS`

### T4: Sources 页尽调徽章 + 版本 + 过期 + 重生成

**Files:** `src/lib/research/sources.ts`（rowToSource 带 metadata）、`src/lib/research/types.ts`（SourceDocument 加 `metadata?`）、`src/app/(app)/research/sources/page.tsx`

- `SourceDocument` 加 `metadata?: Record<string, unknown>`；`rowToSource` 透传 row.metadata。（现列表不返 metadata——补上，不破坏既有字段。）
- sources 页：`s.metadata?.kind === 'diligence'` 时——
  - 徽章「🏢 尽调 v{metadata.version}」替代/附加于 source_type 徽章旁。
  - 过期：`Date.now() - Date.parse(s.ingested_at) > 30*86400e3` → 小字「简报可能已过时」。
  - 「🔄 重新生成」链 → `/copilot?method=company-diligence&ticker=${metadata.ticker}`。
- i18n：`research` 域/或就地（sources 页本属 research 命名空间，本模块 zh 硬编码可豁免——与既有 research 页一致，注明）。
- Commit: `feat(research): diligence badge + version + staleness + regenerate on sources page`

### T5: 终审 + 合并（coordinator）

- 改动面审计：仅 research/copilot 命名空间 + i18n；禁触文件未动。
- gates：tsc / npm test（524+新）/ build。
- 真跑冒烟（本地 dev + admin 态或 service-role 脚本）：跑一次 company-diligence（或用既有 300308.SZ 简报文本）→ 调 from-diligence → 云库出现一条 NOTE(kind=diligence, version=1)；再调一次 → version=2, supersedes 指向 v1；dedup（同文本）→ duplicate。
- merge main + push + 记忆更新。

**不做（YAGNI，spec §7）:** 独立 diligence 表、DILIGENCE 枚举、独立 version 表、自动 source→memo、信号驱动重生成、工具级溯源。
