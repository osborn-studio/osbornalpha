# 判断台账表设计（WP-A3） / Judgment ledger design

日期：2026-09-26。来源：《实施总纲 2026-09-22》§5.4、§5.5、§5.7、§7.2、§8.2 WP-A3。分支叠在 WP-A1（`codex/wp-a1-source-extension`）之上。用户已确认：O1 契约未导出前按 §5.4/5.5 建表并在本文写契约对齐说明；`research_judgments` 不保留 `decision_id` 列。设计已批准。

## 目标 / Goal

在 Alpha 落四张只追加的台账表：`research_judgments`、`research_labels`、`research_decisions`、`research_outcomes`；提供内容寻址 id 生成器与写入/回放函数；用真库测试证明"同输入得同 judgment_id"、"update/delete 一律被拒"、"回放按 `available_at ≤ as_of` 过滤且顺序确定"。不接触生产库。

## 非目标 / Non-goals

- 不做 fan-out 监控与三后端调用（A6）、不做四臂界面与自动建 observation（A9）、不做战绩映射（A10）。
- 不导出 JSON Schema（O1 归 ontology 仓）；本文"契约对齐"一节是给 O1 的输入。
- **WP-O1 已导出（2026-09-26）**：契约为 ontology-driven `docs/contracts/judgment-ledger-v1.md` + `schemas/judgment-ledger-v1.json`（分支 `codex/wp-o1-judgment-ledger-contract`）。其中 `$defs.alpha_judgment_row` 即本文 `research_judgments` 一行的 JSON 形态；本仓 `ledger.ts` 的 `judgmentId()`/`snapshotId()` 与契约 §2 一致，四表触发器对应契约 §3，`replayJudgments()` 对应 §5。后续改动以契约为准，先改契约再改表。
- 不改 S4 现有表、触发器、`transaction()` 语义。

## 契约对齐说明 / Contract alignment with the ontology pilot

来自 `coworker/semantic/pilot.py`（a3ac0a2）并在本设计中采用的语义：

| pilot 语义 | 本设计对应 |
|---|---|
| 纯派生对象内容寻址（`finding_id = sha(payload)`） | `judgment_id = uuid(sha256(snapshot_id + question_set_version + backend + backend_model + question_id))`；`snapshot_id = sha256(canonical snapshot)` |
| 只追加事件链，人写事件不可改写 | 四张表 BEFORE UPDATE/DELETE 触发器 `research_s4_immutable()`（errcode 23514） |
| 决定绑定当时的 finding_hash 与版本，过期证据拒绝 | `research_decisions.cited_judgment_ids` 必须全部存在且属于同一用户；`human_baseline` 必带 `frozen_at`（看卡前冻结） |
| 结果只能引用当前被接受的决定 | `research_outcomes.decision_id` 外键到 `research_decisions(user_id,id)` |
| 回放不改写历史 | `replayJudgments()` 只读；按 Source `available_at ≤ as_of` 过滤后再按 `snapshot_id` 稳定排序 |

未采用：pilot 的 `case version` 递增与 `StaleDecision`（Alpha 一期无并发裁决入口，A9 再议）。

## 数据 / Schema `supabase/migrations/20260926000000_research_judgment_ledger.sql`

所有表 `(user_id, id)` 主键，`user_id references auth.users(id) on delete cascade`。

```sql
create unique index if not exists research_theses_owner_id on public.research_theses(user_id,id); -- 供复合外键

create table public.research_judgments (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,                    -- 内容寻址，见 ledger.ts judgmentId()
  snapshot_id text not null,           -- sha256(canonical snapshot)
  snapshot jsonb not null,             -- {source_id, source_version, thesis_id, thesis_version, entity_table_version}
  source_id uuid not null,             -- 冗余自 snapshot，供回放按 available_at 过滤
  thesis_id uuid not null,             -- 冗余自 snapshot
  run_id uuid not null,
  question_set_version text not null,
  question_id text not null,
  backend text not null check (backend in ('rule','llm_deepseek','jev','jev_escalated','local_probe','human')),
  backend_model text not null,
  prompt_sha256 text check (prompt_sha256 is null or prompt_sha256 ~ '^[0-9a-f]{64}$'),
  input_token_count integer check (input_token_count is null or input_token_count >= 0),
  distribution jsonb not null,
  selected text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  abstained boolean not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  cost_micros bigint check (cost_micros is null or cost_micros >= 0),
  created_at timestamptz not null,
  primary key (user_id,id),
  foreign key (user_id,source_id) references public.research_source_documents(user_id,id),
  foreign key (user_id,thesis_id) references public.research_theses(user_id,id)
);
create index research_judgments_thesis_idx on public.research_judgments(user_id,thesis_id,created_at,id);
create index research_judgments_run_idx on public.research_judgments(user_id,run_id);

create table public.research_labels (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  judgment_id uuid not null,
  label text not null,
  labeler text not null,
  labeled_at timestamptz not null,
  primary key (user_id,id),
  foreign key (user_id,judgment_id) references public.research_judgments(user_id,id)
);
create index research_labels_judgment_idx on public.research_labels(user_id,judgment_id);

create table public.research_decisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  thesis_id uuid not null,
  week_of date not null,
  arm text not null check (arm in ('human_baseline','ai_candidate','collab','averaged')),
  action text not null check (action in ('adopt','shadow','reject','extend','invalidate')),
  reason text not null check (length(btrim(reason)) > 0),
  cited_judgment_ids uuid[] not null default '{}',
  card_id text,
  time_spent_minutes integer check (time_spent_minutes is null or time_spent_minutes >= 0),
  frozen_at timestamptz,
  workspace text not null default 'personal' check (workspace = 'personal' or workspace ~ '^team:[A-Za-z0-9_-]{1,64}$'),
  analyst_id uuid,
  created_at timestamptz not null,
  primary key (user_id,id),
  foreign key (user_id,thesis_id) references public.research_theses(user_id,id),
  constraint research_decisions_baseline_frozen check (arm <> 'human_baseline' or frozen_at is not null)
);
create index research_decisions_thesis_week_idx on public.research_decisions(user_id,thesis_id,week_of);

create table public.research_outcomes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  decision_id uuid not null,
  window_weeks integer not null check (window_weeks > 0),
  evaluation_id text,
  pillar_results jsonb not null default '{}',
  price_result jsonb not null default '{}',
  judged_by text not null,
  judged_at timestamptz not null,
  primary key (user_id,id),
  foreign key (user_id,decision_id) references public.research_decisions(user_id,id)
);
create index research_outcomes_decision_idx on public.research_outcomes(user_id,decision_id);
```

加固（沿 S4 迁移的循环写法）：四张表 `before update or delete` 触发器 `research_s4_immutable()`；`enable/force row level security`；策略 `s4_owner ... to alpha_s4_runtime using (user_id = auth.uid()) with check (user_id = auth.uid())`；`grant select, insert ... to alpha_s4_runtime`；另按 Research OS 惯例为 `authenticated` 建 `"<t> self select"`/`"<t> self insert"` 策略（不建 update/delete 策略）。`cited_judgment_ids` 的存在性由 `ledger.ts` 在事务内校验（PostgreSQL 数组元素无法建外键）。

## 代码 / Code `src/lib/research/s4/ledger.ts`

- `snapshotId(snapshot)`：校验五字段（`source_id`/`thesis_id` uuid，其余非空字串），返回 `digest(snapshot)`（RFC 8785 规范化 + sha256，复用 `pa-v1/json.js`）。
- `judgmentId({snapshot_id, question_set_version, backend, backend_model, question_id})`：`sha256(canonicalize(五字段))` 前 32 个十六进制位，改写版本位 `8` 与变体位 `8|9|a|b`，格式化为 uuid（RFC 9562 v8，"内容寻址"）。纯函数，同输入同输出。
- `recordJudgment(actor, input)`：在 `transaction()` 内 —— 校验字段（backend 枚举、`distribution` 为对象、`confidence` ∈[0,1]、`prompt_sha256` 形状）→ 算 id → `select ... where user_id,id`：不存在则 insert + 审计 `ledger.judgment`；存在且各字段（除 `run_id`、`created_at`、`latency_ms`、`cost_micros`、`input_token_count` 这些运行时字段）一致则返回 `{id, duplicate:true}`；存在且不一致 → `fail('idempotency_conflict')`。
- `addLabel(actor, {judgment_id, label, labeler})`：判断必须存在；`labeled_at` 取服务器时间；审计 `ledger.label`。
- `recordDecision(actor, input)`：校验 arm/action 枚举、`reason` 非空、`cited_judgment_ids` 全部存在于本用户 → insert + 审计 `ledger.decision`；`human_baseline` 缺 `frozen_at` → `fail('invalid_schema')`（数据库约束兜底）。
- `recordOutcome(actor, input)`：决定必须存在；`judged_at` 取服务器时间；审计 `ledger.outcome`。
- `replayJudgments(actor, thesis_id, as_of)`：`as_of` 严格 ISO 时刻；SQL：judgments join `research_source_documents` on `(user_id,source_id)`，`thesis_id = $2 and available_at <= $3`，`order by snapshot_id, question_set_version, question_id, backend, backend_model, id`。返回行数组（不含 raw_text）。
- 全部写入不进 `research_s4_outbox`（台账非 S4 候选记录）。`created_at`/`labeled_at`/`judged_at` 一律 `serverTime(db)`。

## 测试 / Tests

- `src/lib/research/s4/ledger.test.ts`（纯函数）：`judgmentId` 确定性与字段顺序无关；任一字段改变 id 改变；输出为合法 uuid 且版本位为 8；`snapshotId` 拒绝缺字段/非 uuid。
- `src/lib/research/s4/ledger.integration.test.ts`（`S4_TEST_STATE` 存在时运行）：迁移重放无错；四表存在且 RLS 强制；`recordJudgment` 幂等（第二次 `duplicate:true`，行数不变）、同 id 不同 `selected` → `idempotency_conflict`；跨用户读不到；admin 直接 `update`/`delete` 四表均被 `immutable_record` 拒绝；`recordDecision` 引用他人/不存在判断 → 拒绝；`human_baseline` 无 `frozen_at` → 拒绝；`replayJudgments` 只返回 `available_at ≤ as_of` 的判断且两次调用结果字节相同；`recordOutcome` 引用不存在决定 → 拒绝；审计日志各写一条。

## 验收 / Acceptance

`S4_TEST_STATE=<本地库> npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 通过；Codex CLI（中等）评审无 P1；PR 叠在 #46 之上；不接触生产库。
