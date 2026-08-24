# Research OS Phase 5：Postgres 迁移 + 现网部署 Implementation Plan

> 用户决策（2026-07-04）：Research OS 上现网，"个人云工具"规格——Supabase Postgres + user_id 自读自写 RLS + **仅 admin 角色可见**（将来放开=开权限非改架构）。
> 生产 schema 已由协调者落库：`supabase/migrations/20260705000000_research_os_tables.sql`（12 张 `research_*` 表；jsonb 列与 SQLite JSON-text 一一对应；user_id+四策略 RLS；source 不可变触发器；已应用 ref mzfcaabhuwtfvsvadvsv）。

**Goal:** 存储层 SQLite→Supabase；/research 全功能上 osbornalpha.com（admin-only）；本地雷达导入直写云库；信号提炼+thesis 巡检上 Vercel cron；本地存量数据无损搬迁。

**Architecture 核心变化:**
- `src/lib/research/db.ts` 的 SQLite 世界退役 → 新 `src/lib/research/store.ts`：`requireResearchUser()`（照抄 portfolio/store.ts 的 requireUser：getServerSupabase + user，未登录抛 'not authenticated'）+ **admin 校验**（profiles.role==='admin' 否则抛 `ResearchForbidden` → API 403）；服务函数签名统一改 `(ctx: {supabase, userId}, ...args)` 异步。
- 表名全加 `research_` 前缀；数组字段读写仍是 JSON（jsonb 直传对象，supabase-js 自动序列化——**读回来是对象不是字符串**，Json 读写器要分叉或删除）。
- ⚠️ **PostgREST 把 numeric 列序列化为字符串**（本仓库 P0 级复发坑）：`research_eval_runs.total_score` 读边界必须 coerce（Number()），照 store.ts 的 coerce*Row 模式。
- `RESEARCH_OS_ENABLED` 门整体删除（连同 501 逻辑）——访问控制=登录 + admin 角色。better-sqlite3 从依赖移除，`research-data/` 从 .gitignore 保留（本地遗留文件不入库）。
- 脚本改用 **service-role client**（`src/lib/supabase/admin.ts` 有现成 createAdminClient——注意其"仅 webhook 可 import"注释需放宽为"webhook 与 scripts/"，改注释并在文件头列出白名单）+ `RESEARCH_OWNER_USER_ID` env 指定归属用户。

**测试策略（关键，防 521 大滑坡）:** 纯函数测试（prompt 组装/axiom 检查/状态机转移/解析器/校验守卫——占绝大多数）零改动保留；SQLite 集成测试（db.test/各服务的 :memory: 落库断言）改为**轻量 supabase mock**（手写 chainable stub：from().select().eq()… 返回预置数据，断言调用参数）或改写为纯函数抽取——不追求 DB 行为单测（唯一约束/触发器/RLS 由生产 schema 保证，终审 T5 live 冒烟实证）。**目标：总测试数不低于 480**，绝不删纯逻辑测试。

**Branch:** `feat/research-os-phase5`。禁触 KlineChart.tsx / composer.ts。SaaS 文件仅允许改：`src/lib/supabase/admin.ts`（注释白名单）、`vercel.json`（加 cron）、`src/app/(app)/research/**`、`src/app/api/research/**`、`src/lib/research/**`、`scripts/research-*`、package.json/lock、docs/research-os。

---

### T1: store.ts + 服务层异步化（sources/entities/axioms）

- `store.ts`：requireResearchUser（登录+admin）+ `ResearchForbidden`；api.ts 增 403 映射；audit() 改写 research_audit_log（带 user_id）。
- sources.ts / entities.ts / axioms.ts / seed.ts 改异步 supabase（insert/select 带 user_id；唯一冲突 23505 → duplicate 语义保留）；对应路由 await 化。
- 测试：校验守卫/解析纯函数保留；落库断言改 mock。
- Commit: `refactor(research): supabase store + async sources/entities/axioms`

### T2: memos/signals/theses/monitor/playbooks/evals 异步化

- 六服务全量迁移（llmCall 依赖注入模式保留）；jsonb 直传；total_score coerce；transitionThesis/审批状态机语义逐字节不变（测试锁定）。
- 全部 /api/research/* 路由 await + 403 路径。
- Commit: `refactor(research): async services on postgres (memos/signals/theses/monitor/playbooks/evals)`

### T3: 页面 admin 化 + 导航

- /research 页面对非 admin：服务端读 profiles.role，非 admin 渲染"该模块暂未开放"卡（不 404，留申请引导语）；layout 导航在 admin 时显示。删除 RESEARCH_OS_ENABLED 相关 UI 提示。
- （可选加分）TabBar 仍不动——/research 直达。
- Commit: `feat(research): admin-gated pages on production auth`

### T4: 脚本 + cron + 数据搬迁

- `scripts/research-seed.ts` / `research-ingest-radar.ts` / `research-eval-bootstrap.ts`：service-role client + `RESEARCH_OWNER_USER_ID`（env 校验，缺失即退出并提示）。
- `scripts/research-daily.ts`：本地跑=radar 直写云库 → 调 extract+monitor（直接调服务函数，service-role ctx）。
- 新 `/api/cron/research-daily/route.ts`：CRON_SECRET 鉴权（照抄 daily-radar），跑 extractSignals + monitor 全部活跃 theses（**不含 radar 导入**——文件在本地）；ctx 用 service-role + RESEARCH_OWNER_USER_ID（Vercel env，终审时协调者配）。vercel.json 加 `{"path":"/api/cron/research-daily","schedule":"30 1 * * *"}`（09:30 北京，雷达日报本地 08:30 前导入的假设写注释）。
- 新 `scripts/research-migrate-local.ts`：读 `research-data/research.db`（better-sqlite3 此脚本内联 require——依赖已移除，脚本头注释注明需 `npx -y better-sqlite3` 或跳过；更稳做法：**迁移脚本在依赖移除 commit 之前先跑**——T4 内先写脚本+跑通搬迁，再在同 task 尾 commit 依赖移除）→ 12 表按序插入云库（id 保留、user_id=OWNER、jsonb 直传、幂等=按 id upsert）。
- Commit: `feat(research): cloud scripts + vercel cron + local data migration`

### T5: 终审 + 上线验收（coordinator）

- 跑 `research-migrate-local.ts` 搬 17 源/14 信号/thesis/playbooks/evals 上云并核数。
- Vercel env 配 `RESEARCH_OWNER_USER_ID`（osbornhello 的 auth uid，Management API 查）。
- gates：tsc / npm test（≥480）/ build / e2e 10+1。
- merge + push → 部署后线上验收：admin 登录态 curl /api/research/sources 有数据；非登录 401/403；cron 端点带 CRON_SECRET 手触一次。
- 记忆更新。

**不做:** 多用户开放（权限一开即用，但产品决策等 30 天验证）；radar 云端抓取；SQLite 双后端兼容层。
