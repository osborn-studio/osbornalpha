# Research OS Phase 2：Signal Radar + Thesis Monitor Implementation Plan

> Spec: `docs/research-os/product-technical-spec.md` §3.1/§3.3/§4.3/§4.5/§10 Phase 2。Phase 1 已上线（main=0ae1a9e，schema v1 + sources/entities/axioms/memos）。

**Goal:** GitHub Radar 日报可一键导入为 source → LLM 提炼结构化 signals（实体解析落到种子公司/主题）→ thesis 全生命周期管理 → 每日 monitor 扫描产出 alert（用户裁决，系统不自动改状态）→ 一条本地日更脚本串起全链。

**Architecture:** 沿 Phase 1 全部约定（RESEARCH_OS_ENABLED 门控、better-sqlite3 懒加载、:memory: 测试、audit_log、provenance、免责声明）。**schema v2 迁移**走既有 `PRAGMA user_version` 通道（db.ts 里 1→2）：`alter table signals add column metadata text not null default '{}'; alter table signals add column llm_provenance text not null default '{}';`

**Branch:** `feat/research-os-phase2`。禁触 KlineChart.tsx / composer.ts；不碰 SaaS 文件。

**数据源事实（已侦察）:** GitHub Radar 产出在 `/Volumes/AIMATE_WORK/Developer/ClaudeCode/01_active/github-research-agent/reports/<YYYY-MM-DD>/`：`report.md`（日报全文）+ `cards/<owner>__<repo>.md`（YAML frontmatter: full_name/one_liner/relevance(0-10)/related_directions/better_than_mine/combo_innovation/maturity/recommend + 正文段落）。

---

### T1: GitHub Radar 导入适配器（TDD）

**Files:** `src/lib/research/ingest/github-radar.ts`（+test）、`scripts/research-ingest-radar.ts`

- `parseCardMarkdown(text) → {frontmatter, body} | null` 纯函数：手写 YAML 子集解析（string/number/bool/字符串数组足矣，勿引 yaml 依赖）；fixture 用真实卡片样例（含 relevance 0 与高分两例）。TDD。
- `ingestRadarDay(db, dayDir, {minRelevance=6})`：
  - `report.md` → 1 条 source（GITHUB_RADAR，title=`GitHub Radar 日报 <date>`，published_at=目录日期，trust MEDIUM，metadata {kind:'daily-report'}）。
  - relevance≥minRelevance 的卡片 → 每张 1 条 source（title=`Radar: <full_name> — <one_liner>`，url=github 仓库地址，metadata=frontmatter 全量）。
  - 复跑靠 content_hash 幂等（Phase 1 机制，返回 duplicate 计数）。audit_log('source.ingest_radar', detail:{day, inserted, duplicates})。
- 脚本 `scripts/research-ingest-radar.ts [dayDir|--all]`：默认扫 reports 下所有日期目录逐日导入，打印汇总。
- Commit: `feat(research): github radar ingest adapter`

### T2: Signal 提炼（LLM）+ 页面

**Files:** `src/lib/research/signals.ts`（+test）、`src/lib/research/signal-prompt.ts`（+test）、`src/app/api/research/signals/route.ts`、`extract/route.ts`、`src/app/(app)/research/signals/page.tsx`、db.ts v2 迁移

- 待处理源查询：`select * from source_documents where id not in (select je.value from signals s, json_each(s.source_document_ids) je)`（数据量小，够用）限 20 条/批。
- `buildSignalPrompt(sources, entities)` 纯函数（TDD）：注入实体清单（id+name+aliases）与源摘录（每源截 ~2000 字），要求输出 JSON 数组：{title, summary, signal_type∈枚举, direction, confidence, entity_names[], affected_company_names[], research_questions[]（≥1，"需要验证的问题"）, source_ids[]}；明示"无研究价值的源可以不产 signal；宁缺勿滥"。
- `resolveEntityNames(names, entities) → {ids, unmatched}` 纯函数（大小写/alias 匹配，TDD）；unmatched 存 signal.metadata.unmatched_names。
- `extractSignals(db)`：LLM（复用 src/lib/llm 栈）→ 校验枚举/引用的 source_ids 必须属于本批（防幻觉引用，违者剔除该 signal 并记 metadata）→ 落库（含 llm_provenance）→ audit_log('signal.extract')。
- 页面 /research/signals：按日分组列表，type/direction/confidence 徽章，关联实体 chips（点击去 company page），"🔄 提取新信号"按钮（POST extract，显示 {created, skippedSources}）。
- Commit: `feat(research): llm signal extraction + radar page`

### T3: Thesis CRUD + 状态机（TDD）

**Files:** `src/lib/research/theses.ts`（+test）、`src/app/api/research/theses/route.ts`、`[id]/route.ts`、`[id]/transition/route.ts`、`src/app/(app)/research/theses/page.tsx`、`[id]/page.tsx`

- `createThesis`：必填 title/body/invalidation_conditions≥1/watch_metrics≥1/next_review_at（缺失 → 422，呼应 AX001 精神：无失效条件不允许存在）。初始 DRAFT。
- `transitionThesis(db, id, to, reason)`：允许表 `DRAFT→ACTIVE|CLOSED; ACTIVE→WATCH|AT_RISK|INVALIDATED|CLOSED; WATCH→ACTIVE|AT_RISK|INVALIDATED|CLOSED; AT_RISK→ACTIVE|WATCH|INVALIDATED|CLOSED; INVALIDATED→CLOSED`（非法 → 422）；每次转移写 thesis_events(kind:'STATUS_CHANGE', detail:{from,to,reason}) + audit_log。TDD 全表。
- 页面：列表按状态分组（状态徽章配色）；创建表单（失效条件/观察指标为多行输入）；详情页=正文+条件/指标+事件时间线+状态操作按钮。
- Commit: `feat(research): thesis lifecycle with guarded transitions`

### T4: Thesis Monitor + 每日脚本 + Dashboard alerts

**Files:** `src/lib/research/monitor.ts`（+test）、`src/lib/research/monitor-prompt.ts`（+test）、`src/app/api/research/theses/[id]/monitor/route.ts`、`monitor-all/route.ts`、`[id]/alerts/[eventId]/route.ts`（裁决）、`scripts/research-daily.ts`、dashboard 修改

- `monitorThesis(db, thesis)`：取该 thesis 上次监控事件之后的新 signals + 新 sources（关联实体交集 或 全量近 7 天，量小从简：近 7 天全量）→ prompt 输出 {verdict: 'SUPPORT'|'WEAKEN'|'INVALIDATE'|'NONE', rationale, cited_signal_ids[], suggested_status}；NONE 不落事件；其余写 thesis_events(kind=verdict, detail:{rationale, cited_signal_ids, suggested_status, pending:true}) —— **系统绝不自动改 thesis 状态**（spec §3.3：用户必须裁决）。llm_provenance 进 detail。
- 裁决 API：PATCH alerts/[eventId] {action:'IGNORE'|'WATCH'|'CONFIRM_AT_RISK'|'CLOSE'|'ACKNOWLEDGE'}——detail.pending=false + detail.resolution；WATCH/CONFIRM_AT_RISK/CLOSE 同时走 transitionThesis（复用 T3 守卫）。
- `scripts/research-daily.ts`：ingest 最新 radar 日目录 → extractSignals → monitor 所有 ACTIVE/WATCH/AT_RISK theses → 控制台 digest（新源/新信号/新 alert 计数与标题）。README 注一行 launchd/cron 示例（用户自选，不代配）。
- Dashboard：新增 "⚠️ 待裁决 alerts" 卡（pending 事件按 thesis 列出，链到详情）+ 今日 signals 计数。
- monitor-prompt 组装与 verdict 校验纯函数 TDD。
- Commit: `feat(research): thesis monitor with human-adjudicated alerts + daily script`

### T5: 终审 + 验收（coordinator）

- 真跑验收（spec §10 Phase 2 裁剪）：导入真实 radar 2026-07-04 日报 → extract 出真 signals（检查实体解析落到种子公司）→ 建 ≥2 条真 thesis（如"NVIDIA 推理需求可持续增长""AI infra 开源生态加速"，含失效条件/观察指标）→ ACTIVE → 跑 monitor → 出 alert → 裁决一条（WATCH）验证状态机+事件闭环。
- gates：tsc / npm test（369+新）/ build（无 RESEARCH_OS_ENABLED）/ e2e 10+1 不回归。
- merge main + push + 记忆更新。

**不做（YAGNI）:** OpenRouter 抓取器（模型用量走 sources 页手动 MODEL_USAGE 粘贴，已可用）；signals 向量检索；thesis 与 memo 的自动关联（Phase 3 playbook 时做）；Vercel cron（本地产品）；多用户。
