# A9：周末决定流程（四臂）设计

日期：2026-09-26。来源：总纲 §7.1.3、§7.2、§5.7、WP-A9。分支 `codex/wp-a9-weekend-flow`，基于 `main` + A8（#55）+ E4（#57）。常设授权下按默认方案执行。

## 决定（默认，可改）

1. **观察自动创建不在本包。** S4 观察必须由候选（PA 包 → 卡 → 标签 → 曝光）注册，A8 的 thesis 级卡片没有 S4 候选。本包只记录四臂决定并允许把决定**关联到已存在的 S4 观察**（E4 `observation_id`）。为 thesis 级卡片直接注册观察需要新的候选来源设计，另立工作包。
2. 四臂落法：`human_baseline` 由用户在看卡前冻结（服务端时间戳）；`ai_candidate` 在卡片首次展示时由服务端按卡片种类自动记录（evidence → adopt，counter → reject），每卡一条、幂等；`collab` 由用户逐卡决定；`averaged` 不落决定，由 E4 报表配对推导。
3. **看卡门**：某周的卡片只返回给已冻结基线的 thesis；未冻结的 thesis 只返回「需要先冻结」列表，卡片正文不下发。服务端强制，不靠前端。
4. 多分析师 schema：新增 `research_analyst_identities(user_id, channel, external_id, analyst_id, created_at)`，主键 `(user_id, channel, external_id)`，owner RLS；UI 单用户，不做映射界面。

## 模块 `src/lib/research/weekly/weekly.ts`

依赖注入 `readCards(weekOf)`（生产传 A8 `listCards(ctx, weekOf)`），台账走 S4 池（`transaction(actor)`）。

- `weeklyStatus({actor, readCards, weekOf})` → `{week_of, theses:[{thesis_id, title?, cards:ResearchCard[]|null, baseline, collab_by_card, ai_candidate_by_card}], locked_theses:[thesis_id], all_unlocked}`；`cards` 为 null 表示未解锁。
- `freezeBaseline({actor, weekOf, thesis_id, action, reason, analyst_id?})`：同 thesis-week 已有基线 → `idempotency_conflict`；`recordDecision(arm human_baseline, frozen_at=serverTime)`。
- `revealCards({actor, readCards, weekOf})`：对已冻结 thesis 的每张卡，若尚无 `ai_candidate` 决定（按 `card_id`）则记录一条（引用卡内存在于台账的 judgment_ids）；返回卡片。
- `decideCard({actor, readCards, weekOf, card_id, action, reason, time_spent_minutes, observation_id?})`：卡不存在 → `scope_denied`；其 thesis 无基线 → `policy_blocked`；已有 collab 决定 → `idempotency_conflict`；否则 `recordDecision(arm collab, card_id, cited, time_spent_minutes, observation_id)`。
- `thesisObservations({actor, thesis_id})`：通过 S4 记录链（Observation → Decision.card_ref → ChangeCard.thesis_id）列出该 thesis 已有观察及状态，供关联下拉。

## API / 页面

`GET /api/research/weekly?week=` → status；`POST` body `{action:'freeze'|'reveal'|'decide', ...}`；`GET /api/research/weekly/observations?thesis=`。认证 `requireResearchUser`，actor `{userId, kind:'human'}`（与 `requireS4Actor` 的会话分支一致）。页面 `/research/weekly`：步骤 1 逐 thesis 冻结基线（动作 + 一句理由）→ 步骤 2 「显示本周卡片」→ 每卡 adopt/shadow/reject/extend + 理由 + 可选关联观察，页面计时写入 `time_spent_minutes`。导航加 `Weekly`。

## 测试

`weekly.integration.test.ts`（真库）：卡片在基线前不下发；冻结后 reveal 自动记 ai_candidate 且幂等；decide 需基线、每卡一次、写 cited/card_id/time；observation_id 关联到本 owner 的 S4 观察；E4 报表可见三臂决定；identity 表迁移可重放与 RLS。
