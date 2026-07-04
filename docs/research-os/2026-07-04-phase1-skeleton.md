# Research OS Phase 1 骨架 Implementation Plan（stock-monitor 内模块 + SQLite）

> Spec: `docs/research-os/product-technical-spec.md`（§6 数据模型、§4.4 memo 模板、§4.7 axioms、§13 开发备注）+ `product-strategy-plan.md`（§15 验收）。
> 用户决策（2026-07-04）：落在 stock-monitor 仓库内作为独立模块；数据库用 **SQLite**（better-sqlite3，本地单用户）。

**Goal:** 可运行研究闭环：source 导入（不可变）→ 实体档案 → 带引用/反方/失效条件/axiom 门/LLM provenance 的 memo 生成编辑 → markdown 导出。

**Architecture:**
- 命名空间隔离：`src/lib/research/*`（全部逻辑）、`src/app/(app)/research/**`（页面，随现有 auth 门）、`src/app/api/research/**`（API）。**不碰**现有 SaaS 任何模块。
- SQLite 文件 `research-data/research.db`（gitignore `research-data/`）；better-sqlite3 同步 API；测试用 `:memory:`。
- **生产安全阀（关键）**：stock-monitor push=Vercel 自动部署，Vercel 无持久磁盘 → 一切 research 功能由 `RESEARCH_OS_ENABLED=1` 门控（仅本地 .env.local 设置）：未设时 API 全部 501 `{error:'research os is local-only'}`、页面渲染"本地专用"提示、TabBar/导航**不加**入口（Phase 1 用直达 URL /research）。better-sqlite3 只在 `getDb()` 内动态 require，未启用绝不加载（防 Vercel 构建/运行期炸）。
- LLM：**复用现有 `src/lib/llm`**（resolveLlm→env DeepSeek，已配好）；provenance 自记 {model, prompt_sha256, source_document_ids, generated_at, edits[]}。
- 合规红线：全输出免责声明；无来源结论 LOW_CONFIDENCE；audit_log 记 ingest/generate/review。

**Branch:** `feat/research-os-phase1`。禁触 KlineChart.tsx / composer.ts。

---

### T1: SQLite 层 + schema + 类型

**Files:** `src/lib/research/db.ts`、`src/lib/research/schema.sql`、`src/lib/research/types.ts`、`src/lib/research/db.test.ts`

- `npm i better-sqlite3 && npm i -D @types/better-sqlite3`。
- schema.sql（§6 全模型的 SQLite 化）：12 表 entities / entity_relations / source_documents / signals / memos / theses / thesis_events / playbook_runs / axioms / eval_cases / eval_runs / audit_log。规则：
  - id TEXT PRIMARY KEY（应用层 `crypto.randomUUID()`）；时间戳 TEXT ISO-8601（`new Date().toISOString()`）。
  - 数组/对象字段一律 TEXT 存 JSON（如 memos.supporting_evidence、signals.entity_ids），类型层给 `Json<T>` 读写器。
  - CHECK 约束照搬（type/status/confidence 枚举）。
  - `create unique index source_documents_hash_idx on source_documents(content_hash);`
  - **不可变触发器**：`create trigger source_documents_immutable before update on source_documents when new.raw_text<>old.raw_text or new.content_hash<>old.content_hash or new.source_type<>old.source_type or ifnull(new.url,'')<>ifnull(old.url,'') begin select raise(abort,'source raw fields are immutable'); end;`
- `db.ts`：`getDb(path = process.env.RESEARCH_DB_PATH ?? 'research-data/research.db')`——懒加载单例；首连时 `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;` 并按 `PRAGMA user_version` 执行 schema.sql（version 0→1）；`assertEnabled()` 检查 `RESEARCH_OS_ENABLED==='1'` 否则抛 `ResearchDisabled`（API 层转 501）。导出 `openTestDb()`= `:memory:` 建全 schema 供测试。
- 测试（:memory:）：建库成功、source 插入后 update raw_text 被触发器拒绝、content_hash 唯一冲突、JSON 读写器 round-trip。
- Commit: `feat(research): sqlite layer + full schema + immutability trigger`

### T2: Sources ingest

**Files:** `src/lib/research/sources.ts`（+test）、`src/app/api/research/sources/route.ts`、`src/app/api/research/sources/[id]/route.ts`、`src/app/(app)/research/sources/page.tsx`

- `ingestSource(db, input)` 纯服务函数：校验（raw_text 非空、source_type 枚举）→ content_hash=sha256 → 撞 hash 返回 `{duplicate:true, id}`（幂等）→ 插入 + audit_log('source.ingest')。TDD。
- API：GET 列表（时间倒序，?type= 过滤）/ POST / GET by id。全部先 `assertEnabled()`。
- 页面：粘贴表单（标题/类型/URL/trust/正文）+ 列表。'use client' + fetch；文案本模块 Phase 1 **可暂 zh 硬编码**（单用户本地工具，不进 G 系 i18n 管辖——在页面顶部注释注明豁免）。
- Commit: `feat(research): source ingest (immutable, idempotent)`

### T3: Entities + 种子 + Company Page

**Files:** `src/lib/research/entities.ts`（+test）、`src/app/api/research/entities/route.ts` + `[id]/route.ts`、`src/app/(app)/research/companies/page.tsx` + `[id]/page.tsx`、`scripts/research-seed.ts`

- 种子（幂等 upsert by (type, lower(name))）：20 家公司（NVDA/MSFT/GOOGL/AMZN/ORCL/NET/AMD/AVGO/TSM/ASML/ADBE/CRM/NOW/PLTR/DDOG 带 ticker；OpenAI/Anthropic/Mistral/xAI/Google DeepMind 无 ticker）+ 6 主题（AI inference/Model APIs/Data centers/Power/Developer tools/AI chips）。`npx tsx scripts/research-seed.ts`。
- Company Page：档案头 + 关联 sources（entity_ids JSON 包含查询：`where exists (select 1 from json_each(source_documents.entity_ids) where value=?)`）+ 关联 memos + open_questions 汇总；signals/theses 空态占位。
- Commit: `feat(research): entities + 20-company seed + company page`

### T4: Axioms 种子 + 纯检查器（TDD）

**Files:** `src/lib/research/axioms.ts`（+test）、`scripts/research-seed.ts` 追加、`src/app/api/research/axioms/check/route.ts`

- 5 条种子：AX001 无失效条件不得 REVIEWED（BLOCK）；AX002 独立引用<3 不得 HIGH（BLOCK）；AX003 无反方不得进审批（BLOCK）；AX004 仅单一 LOW-trust source 的 evidence 提示（WARN）；AX005 结论含"必涨|保证|稳赚|无风险"→BLOCK。
- `checkMemoAxioms(memo, sources, axioms) → AxiomCheckResult[]` 纯函数，每规则≥2 测例。
- Commit: `feat(research): investment axioms + pure checker`

### T5: Memo Engine（核心）

**Files:** `src/lib/research/memo-prompt.ts`（+test）、`src/lib/research/memos.ts`、`src/app/api/research/memos/route.ts`、`generate/route.ts`、`[id]/route.ts`（GET/PATCH）、`[id]/review/route.ts`、`src/app/(app)/research/memos/page.tsx` + `[id]/page.tsx`

- generate 入参 {entity_id, question?}：取该实体全部 sources（新→旧，正文按预算截断，id+title 清单注入 prompt）→ 要求输出 §4.4 十段 JSON，每条 evidence 带 source_document_ids，引用不了的进 open_questions；LLM 走 `src/lib/llm` 现栈（`chat` + extractJson 既有工具），失败/未配 → 结构化 `{source:'no-key'|'error'}` 不崩。
- 落库即跑 checkMemoAxioms 存 axiom_check_results；provenance {model, prompt_sha256, source_document_ids, generated_at}；audit_log('memo.generate')。
- PATCH：provenance.edits[] 追加 {at, fields}；review：BLOCK 未清零 → 422，通过 → REVIEWED + audit_log。
- 页面：分段编辑 + 引用侧栏（点开看 source 摘录）+ axiom 面板 + "导出 Markdown"（尾注免责声明：本内容为研究辅助，不构成投资建议）。
- prompt 组装与 evidence 引用校验纯函数 TDD。
- Commit: `feat(research): memo engine with citations, axiom gate, provenance`

### T6: Research 壳层

**Files:** `src/app/(app)/research/layout.tsx`、`src/app/(app)/research/page.tsx`

- /research 子导航（Dashboard/Companies/Sources/Memos + 灰置 Signals/Theses/Playbooks/Evals "Phase 2/3"）；Dashboard：source/memo 计数、最近 5 条、`RESEARCH_OS_ENABLED` 未设时全页显示"本地专用模式未启用"说明；footer 免责声明。**不改 TabBar**（避免 SaaS 导航污染，Phase 1 直达 /research）。
- `.gitignore` 加 `research-data/`；`.env.local` 加 `RESEARCH_OS_ENABLED=1`（提交 .env.example 说明即可，.env.local 不入库）。
- Commit: `feat(research): shell + dashboard (env-gated, local-only)`

### T7: 终审 + 验收（coordinator）

- 验收：seed → NVIDIA 导入 3-5 source（curl）→ generate memo（本地 DeepSeek key 真跑）→ 断言引用非空/反方≥2/失效条件≥1/axiom 面板有果/provenance 全 → PATCH → review → 导出 markdown 带免责声明。
- 生产安全验证：`RESEARCH_OS_ENABLED` 未设时 `npm run build` 通过且 /api/research/* 全 501；现有 318 测试零回归；e2e 10+1 不回归。
- merge main + push（Vercel 部署不受影响）+ 记忆更新。
