# Thesis 扩展与证伪规则设计（WP-A7） / Thesis extension design

日期：2026-09-26。来源：《实施总纲 2026-09-22》§5.3、§7.4、§8.2 WP-A7。分支 `codex/wp-a7-thesis-extension`，基于 `main`。用户已确认：取代（supersede）只允许对已 INVALIDATED/CLOSED 的旧 thesis；修订失效条件不允许改支柱。

## 目标 / Goal

给 `research_theses` 加上 §5.3 字段，落实 §7.4 证伪规则中需要代码的两条路径（取代、失效条件修订），扩展表单与详情页，保持状态机与 A6 fan-out 兼容，并证明证伪不影响 S4 observation。

## 非目标 / Non-goals

- 不改状态机允许表 `THESIS_TRANSITIONS`；不让任何自动流程（monitor、fan-out）改状态或字段。
- 不做 observation 的 miss 计分与研究质量归因（A9/E4）。
- 不接触生产库。

## 数据 / Migration `supabase/migrations/20260926110000_research_thesis_extension.sql`

```sql
alter table public.research_theses
  add column if not exists opportunity_type text not null default 'other',
  add column if not exists pillars jsonb not null default '[]',
  add column if not exists catalysts jsonb not null default '[]',
  add column if not exists horizon_weeks integer[] not null default '{4,13,26}',
  add column if not exists supersedes uuid,
  add column if not exists kill_condition_revisions jsonb not null default '[]';
-- check: opportunity_type in ('B','C','other'); pillars/catalysts/kill_condition_revisions 必须是 jsonb 数组；
-- horizon_weeks 非空且全部 > 0；supersedes 自引用外键 (user_id, supersedes) → research_theses(user_id, id) on delete set null，
-- 需先建 unique index research_theses_owner_id (user_id, id)；supersedes <> id。
-- research_thesis_events.kind 约束加 'KILL_CONDITION_REVISED'（先 drop 再 add）。
```

可重放：全部 `if not exists` / drop-then-add。

## 类型 / Types

- `OpportunityType = 'B'|'C'|'other'`；`ThesisPillar {id, text, resolvable_by, deadline: string|null}`；`ThesisCatalyst {text, expected_date: string|null}`；`KillConditionRevision {index, old_text, new_text, reason, at}`。
- `Thesis` 增加 `opportunity_type`、`pillars`、`catalysts`、`horizon_weeks`、`supersedes: string|null`、`kill_condition_revisions`（TS 上声明为可选，与 A1 的 Source 字段同一做法，保证既有 fixture 编译；`rowToThesis` 总是填入迁移默认值）。
- `ThesisEventType` 增加 `'KILL_CONDITION_REVISED'`。

## 服务 / `theses.ts`

- `createThesis` 新可选输入：`opportunity_type`（默认 `other`）、`pillars`（每条 text 非空，id 缺省 `p1..pn`，`resolvable_by` 缺省 `''`）、`catalysts`、`horizon_weeks`（默认 `[4,13,26]`，须为正整数数组）。非法值 422。
- `supersedeThesis(ctx, oldId, input: CreateThesisInput)`：旧 thesis 不存在 → 404；状态不是 `INVALIDATED`/`CLOSED` → 422（`supersede requires the old thesis to be INVALIDATED or CLOSED`）；新 thesis 走 `createThesis` 全部校验（不继承字段），写 `supersedes = oldId`；旧 thesis 追加 `NOTE` 事件 `{superseded_by, reason}`；审计 `thesis.supersede`。窗口从零计：新 thesis `created_at` 即起点。
- `reviseKillCondition(ctx, id, {index, new_text, reason})`：thesis 不存在 → 404；`CLOSED` → 422；index 越界 / new_text 空 / reason 空 → 422；new_text 与旧文本相同 → 422。原子写：`invalidation_conditions[index] = new_text`，`kill_condition_revisions` 追加 `{index, old_text, new_text, reason, at}`，`updated_at = at`；事件 `KILL_CONDITION_REVISED` detail 同上；审计 `thesis.revise_kill_condition`。
- `killConditionRevisionsInQuarter(thesis, now = new Date())` 纯函数：按 UTC 自然季度统计 `at` 落在当季的修订数；`needsRevisionReview = count > 2`。
- `transitionThesis` 不变。

## API

- `POST /api/research/theses/[id]/supersede` body = CreateThesisInput（+ 可选 `reason`）→ 201 `{thesis, superseded}`。
- `POST /api/research/theses/[id]/kill-condition` body `{index, new_text, reason}` → 200 `{thesis}`。
- `GET /api/research/theses/[id]` 响应增加 `review: {kill_condition_revisions_this_quarter, needs_revision_review}`。

## A6 兼容

`fanout/run.ts` 的 `thesisVersion` 增加 `opportunity_type`、`pillars`；支柱或类型变化 → 版本变 → 重判。`kill_condition_revisions` 通过 `invalidation_conditions` 与 `updated_at` 已影响版本。

## UI

- 列表页表单：机会类型下拉（B/C/other）、支柱（每行一条）、催化剂（每行 `文本 | YYYY-MM-DD` 可选日期）、窗口周数（默认 `4,13,26`）。
- 详情页：显示机会类型、支柱、催化剂、窗口、`supersedes` 链接、修订历史与「本季修订 n 次（>2 需复盘）」标记；`INVALIDATED/CLOSED` 时显示「以新 thesis 取代」表单（复用创建表单字段）；非 CLOSED 时每条失效条件旁「修订」入口（新文本 + 原因）。

## 测试

- `theses.test.ts`（mock）：新字段创建与默认值；非法 `opportunity_type`/`horizon_weeks`/空支柱文本 422；`THESIS_TRANSITIONS` 允许表不变（T3 守卫）；supersede 对 DRAFT/ACTIVE/WATCH/AT_RISK 拒绝、对 INVALIDATED/CLOSED 成功且不继承字段、旧 thesis 有 NOTE 事件；修订：越界/空/相同拒绝，成功后原版保留、事件与审计写入；季度计数与 >2 标记；`transitionThesis` 只写 `research_theses`、`research_thesis_events`、`research_audit_log` 三表。
- `fanout/run.test.ts`：`thesisVersion` 随 pillars 变化。
- `thesis-extension.integration.test.ts`（`S4_TEST_STATE`）：迁移可重放；check 与自引用外键；`KILL_CONDITION_REVISED` 可写；证伪不影响 observation：建 thesis + S4 候选/记录 + `research_s4_observation_state(open)`，把 thesis 置 `INVALIDATED` 并插入取代 thesis 后，observation_state 行与 outbox 计数逐字节不变；`research_theses` 上没有指向 S4 表的触发器。

## 验收

`S4_TEST_STATE=<本地库> npm test`、typecheck、lint、build 通过；Codex（中等）无 P1；PR base `main`。
