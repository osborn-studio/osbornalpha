# 变化卡生成器设计（WP-A8） / Change card generator design

日期：2026-09-26。来源：《实施总纲 2026-09-22》§7.1.2、§7.5、§11、§8.2 WP-A8。分支 `codex/wp-a8-change-cards`，基于 `main`（A3 台账、A6 fan-out 已合并）。用户已确认设计；「陌生来源」= 本周之前从未出现过的 URL 主机。

## 目标 / Goal

每周（周五）从判断台账挑出「至少一个后端判相关、首发（cluster_first）、非转述」的公开证据，按 thesis 聚合，用现有平台模型生成 ≤5 张七字段变化卡（其中固定 1 张反证/陌生来源卡），落 `research_cards`，页面 `/research/cards` 展示；每条断言链接 `source@version`；卡内买卖建议由 axiom 拦截。

## 非目标 / Non-goals

- 不做采纳/影子/否决/延期与 observation（A9）。
- 不接 Jev（生成模型为 `trustedPlatformLlm`，DeepSeek；评审用另一家是 A9/B3 的事）。
- 不上 Vercel cron：台账在 S4 池，`s4Pool` 只接受本地库；与 fan-out 一样是本地脚本。
- 不接触生产库。

## 数据 / Migration `supabase/migrations/20260926120000_research_cards.sql`

```
research_cards(
  user_id uuid, id uuid, week_of date, thesis_id uuid, kind text check in ('evidence','counter'),
  title text, fields jsonb, assertions jsonb, evidence jsonb, generation jsonb, axiom_results jsonb,
  status text check in ('generated','blocked'), created_at timestamptz,
  primary key (user_id,id), unique (user_id,week_of,thesis_id,kind),
  fk (user_id,thesis_id) → research_theses(user_id,id))
```
`fields` = 七字段，每字段为断言 id 数组或文本「待研究」；`assertions` = `[{id, field, text, source_id, source_version, judgment_ids[]}]`；`evidence` = `{support, counter, independent_sources, uncertainty, excluded_private, unfamiliar_hosts[]}`；`generation` = `{model, prompt_sha256, run_id, generated_at, unsupported_dropped}`。RLS 与台账同款（owner self select/insert，`alpha_s4_runtime` 不需要）。可重放。

七字段键：`change_and_timing`、`profit_or_moat_transmission`、`beneficiaries_and_losers`、`market_may_underestimate`、`support_counter_independence`、`next_fact_to_verify`、`watch_points_weeks_and_half_year`。

## 证据选取（`src/lib/research/cards/evidence.ts`，纯函数）

输入：本周窗口 `[week_of, week_of+7d)` 内 `research_judgments` 行（`source_id, thesis_id, question_id, backend, selected, abstained, id, snapshot`）+ 对应 Source 行。
规则（按 `(source, thesis)` 对）：
1. 相关：任一后端 Q1 `selected='true'`。
2. 首发：`cluster_first !== false`（`null` 视为首发）。
3. 非转述：没有任一后端 Q3 `selected='retelling'`；没有任一后端 Q5 `selected='true'`。
4. 可外发：`mayLeaveMachine(source)`（public、非 private_observation、非 S4 受控副本）；不满足的计入 `excluded_private`，不进卡、不进提示词。
5. 方向：Q2 任一后端 `support` → 支持；`weaken`/`trigger_invalidation` → 反证；两者皆有 → 两边都记。
6. 来源类别：Q3 优先非 rule 后端的非弃权答案，否则 rule，否则 `unknown`。独立来源数 = 去重 `(origin, host)`。
7. 陌生来源：Source 的 URL 主机在 `week_of` 之前的任何 Source 中都未出现。

输出：`ThesisEvidence[]`（每 thesis：support[]、counter[]、independent_sources、unfamiliar[]）。

## 选卡（`select.ts`，纯函数）

- evidence 卡：按 `support.length + counter.length` 降序、thesis_id 升序取前 4。
- counter 卡：`counter.length` 最多的 thesis（>0）；否则含陌生来源证据最多的 thesis；两者皆无则不出 counter 卡，摘要 `counter_card: 'none'`。counter 卡的 thesis 若已在 evidence 卡中，则 evidence 卡减到 4 张以内仍含该 thesis 的 counter 卡（同 thesis 两张 kind 不同）。
- 总数 ≤5。

## 生成（`generate.ts`）

- 提示词：system 固定（七字段 JSON 结构、每条断言 `{text, source_ids}`、不得给买卖建议/仓位/目标价、不足写「待研究」）；user 含 thesis 标题/正文/支柱/失效条件 + 证据列表（`source_id@version`、标题、Q2 方向、Q3 类别、正文前 1500 字）。`prompt_sha256` 入 provenance。
- 校验：每字段为数组；断言 `source_ids` 必须 ⊆ 本卡证据 id，否则丢弃并计 `unsupported_dropped`；字段无断言 → `'待研究'`。`assertions` 展开为带 `source_version`、`judgment_ids` 的记录。
- Axiom：`checkCardAxioms(card)`：AX005 承诺语 + 新 AX006 `买入|卖出|建仓|加仓|减仓|清仓|目标价|止损|止盈|仓位|做多|做空|买点|卖点|抄底|逃顶`（BLOCK）→ `status='blocked'`。AX006 加入 `AXIOM_SEEDS`。
- 写入 `research_cards`；审计 `card.generate`（每卡）与 `cards.run`（每次）。
- 幂等：`(user_id, week_of, thesis_id, kind)` 已存在 → 跳过并计 `skipped_existing`；`--force` 不提供。

## 运行 / `runCards(ctx, actor, {weekOf?, llm, dryRun?})` 与 `scripts/research-cards.ts [--week YYYY-MM-DD] [--dry-run]`

`weekOf` 缺省 = 本周一（UTC）。台账读取走 `transaction(actor)`（S4 池）；Source/thesis/写卡走 service Supabase ctx。`--dry-run` 只打印选卡与证据统计，不调模型、不写库。

## 页面 / `/research/cards` + `GET /api/research/cards?week=`

按 `week_of` 倒序分组；每卡显示 kind、thesis 链接、七字段；断言文本后跟 `[source@version]` 链接到 `/research/sources#src-<id>`（sources 页行加 `id="src-<id>"`）；blocked 卡只显示标题与拦截原因。导航加 `Cards`。

## 测试

- `evidence.test.ts`：相关/首发/非转述/可外发四个过滤各一例；方向归类；独立来源计数；陌生主机。
- `select.test.ts`：排序与 ≤5；counter 优先反证、其次陌生来源、否则无；同 thesis 两 kind。
- `generate.test.ts`（假 LLM）：JSON 校验、无引用断言丢弃、字段缺省「待研究」、AX006 拦截 → blocked、provenance。
- `axioms.test.ts`：AX006 规则。
- `run.test.ts`（mock ctx + 假台账加载器）：端到端写卡、幂等跳过、dry-run 不写、excluded_private 计数。
- `cards.integration.test.ts`（`S4_TEST_STATE`）：迁移可重放、唯一键、check、外键。

## 验收

`S4_TEST_STATE=<本地库> npm test`、typecheck、lint、build；Codex（中等）无 P1；本地库上用合成台账跑一次 `research-cards.ts --dry-run` 与带假 LLM 的生成，证据存 `docs/handoffs/alpha-a8/`。
