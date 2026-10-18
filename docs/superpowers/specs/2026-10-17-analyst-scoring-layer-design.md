# 分析师评分层（analyst）首轮设计

日期：2026-10-17。分支 `codex/analyst-scoring-m1`，基于 `main` `afa59b7`。状态：已实施（分支 `codex/analyst-scoring-m1`）；边界决定见 `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md`。

## 1. 边界决定

OsbornAlpha 内部分三层，只以「建议 id」单向连接：

| 层 | 路由 | 回答的问题 | 产出物 | 真值来源 |
|---|---|---|---|---|
| research 研究 | `/research` | 这家公司 / 这组股票值不值得做，为什么 | 建议（recommendation） | 人 + 工具的方法论 |
| analyst 评分 | `/analyst`（新） | 这些建议如果照做结果如何；谁的建议靠谱 | 分析师模拟账本 + 前向评分 | 冻结规则，系统自己是权威 |
| portfolio 实盘 | `/portfolio` | 我实际持有什么，赚亏多少 | 真实交易 + 持仓 | 外部事实（手工记录，将来券商同步） |

连接方向：research 产出建议 → analyst 登记、冻结成交价、模拟、打分 → portfolio 的一笔决定可以引用一条建议（采纳）。实盘永远不改写建议和评分；analyst 永远不写 `trades`。

这与 2026-09-22 v4 方案「把 OSanalyst 融进 /portfolio」的结论不同。v4 反对的是同一账户两份真值；这里实盘账本与分析师模拟账本是两个不同账户，模拟成交不进 `trades`，所以不冲突。v4 的 M1a（账户层、版本化账本）仍是 portfolio 将来接券商同步时的债务，本轮不动。

### 1.1 五个开放点的裁定

1. **「我的决定」属于 portfolio。** `decisions` 表是实盘账本上的采纳事件，留在 `/portfolio` 不迁移。它的前向打分内核（`review.ts`）抽成共享纯函数，analyst 用同一内核给建议打分。`/portfolio/review` 行为不变。
2. **S4/S6 留在 research，不搬。** 证据：`research_decisions.arm ∈ {human_baseline, ai_candidate, collab, averaged}`，四臂报表按 `(thesis_id, week_of)` 配对。它评的是研究方法哪条路径更准，是方法论自检，与 `/research/evals` 同类，不是分析师的建议表现。S5 引擎目前只服务这条路径（XNYS/USD/SPY），本轮 analyst 不接 S5。
3. **账本粒度按分析师。** 一个分析师一本模拟账本。论点（thesis）只是建议上的可选引用，按论点的统计是分组查询，不另开账本。
4. **AI Agent 是分析师。** `analyst_profiles.kind ∈ {human, agent}`。John Cameron、playbook 的 `PAPER_TRADE` 都是将来的建议来源；本轮只做手工录入，`source_type` 枚举预留 `copilot` / `playbook`。
5. **portfolio 本轮不加账户层。** 唯一改动是 `decisions.recommendation_id`（可空）作为采纳链接。

## 2. 范围

做：
- 新顶层区 `/analyst`，底部主导航第 7 个 tab「分析 / Analyst」。
- 分析师档案（含默认的「我」）。
- 建议录入（追加写入，只能撤回不能改）。
- 建议前向评分（5/20/60 交易日，复用 `review.ts` 算法）。
- 每位分析师一本等权轻量模拟账本（模拟持仓、浮动收益、已实现收益）。
- portfolio 决定可引用建议（采纳）。
- ADR 记录三层边界与术语。

不做（明确延后）：
- 现金 / NAV 曲线 / 目标权重 / 费用 / 汇率 / 拆股处理（v4 M2）。
- 建议的自动来源（copilot、playbook、飞书）。
- S4/S6 迁移或改名；S5 引擎接入 analyst。
- portfolio 账户层、trades 版本化（v4 M1a）。
- 多用户 / 团队权限（v4 M3）。
- 按论点开账本。

## 3. 产品形态

### 3.1 导航

`src/components/TabBar.tsx` 增加 `analyst` tab，`href: '/analyst'`，图标为线稿记分板。`common.nav.analyst` = 「分析」/ "Analyst"。portfolio 的 tab 文案「我的投资 / Portfolio」不变。

风险：7 个 tab 在 375px 宽度下每个约 53px，「我的投资」四字接近极限。实施时在 mobile 预设下截图核对；若溢出，优先缩短 analyst 文案，不改 portfolio。

### 3.2 页面

| 路由 | 内容 |
|---|---|
| `/analyst` | 总览：分析师卡片列表（显示名、kind、建议数、命中率、平均 20 日收益、模拟持仓数），「新建分析师」表单，「新建建议」表单（选分析师、代码、市场、动作、参考价、理由、信心、目标价、止损、期限、论点引用）。「刷新评分」按钮触发评分任务。 |
| `/analyst/[analystId]` | 单个分析师：模拟持仓表（代码、份数、均价、最新价、浮动%、权重）、已平仓记录、建议时间线（含评分、采纳标记、撤回标记）、统计摘要。「撤回建议」在建议行上。 |

布局与 `/portfolio` 子页一致（`Panel` / `Metric` / `Tag` 组件，CSS 变量主题）。页脚固定免责声明：「分析师模拟盘为假设成交的记分工具，不构成投资建议。」双语。

i18n：新增 `messages/zh/analyst.json`、`messages/en/analyst.json`，按 G 系规范进 i18n 管辖（与 research 的 zh 硬编码豁免不同，analyst 是正式产品区）。

### 3.3 portfolio 的改动

`src/components/portfolio/DecisionForm.tsx` 增加可选下拉「采纳建议」，列出同 ticker、未撤回、近 90 天的建议；选中后写 `decisions.recommendation_id`。`/portfolio/decisions` 列表上显示「采纳自 ×× 分析师」标签。其余不动。

## 4. 数据模型

迁移 `supabase/migrations/20261017090000_analyst_scoring.sql`。全部表 RLS own-rows，select/insert/update 三动词；analyst_profiles 与 recommendations 不开 delete 策略（只归档 / 撤回），recommendation_scores 保留 delete，沿用 `20260702090000_decision_layer.sql` 的 `do $$ … $$` 模式。

```sql
create table public.analyst_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  kind         text not null default 'human' check (kind in ('human','agent')),
  is_self      boolean not null default false,
  note         text,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (user_id, id)
);
create unique index analyst_profiles_user_name on public.analyst_profiles (user_id, lower(btrim(display_name))) where archived_at is null;
create unique index analyst_profiles_user_self on public.analyst_profiles (user_id) where is_self;

create table public.recommendations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  analyst_id      uuid not null,
  ticker          text not null,
  market          text not null check (market in ('A','HK','US')),
  action          text not null check (action in ('buy','sell','trim','add','hold','pass')),
  reference_price numeric check (reference_price > 0),
  rationale       text,
  confidence      int check (confidence between 0 and 100),
  target_price    numeric,
  stop_loss       numeric,
  horizon         text check (horizon in ('short','mid','long')),
  thesis_ref      text,
  source_type     text not null default 'manual' check (source_type in ('manual','copilot','playbook','signal','import')),
  source_ref      jsonb,
  recommended_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  withdraw_reason text,
  fill_price      numeric check (fill_price > 0),
  fill_date       date,
  check ((fill_price is null) = (fill_date is null)),
  check (withdraw_reason is null or withdrawn_at is not null),
  unique (user_id, id),
  foreign key (user_id, analyst_id) references public.analyst_profiles(user_id, id) on delete cascade
);
create index recommendations_user_analyst on public.recommendations (user_id, analyst_id, recommended_at desc);
create index recommendations_user_ticker  on public.recommendations (user_id, ticker, recommended_at desc);

create table public.recommendation_scores (
  recommendation_id uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  scored_at         timestamptz not null default now(),
  forward_5d_pct    numeric,
  forward_20d_pct   numeric,
  forward_60d_pct   numeric,
  hit               boolean,
  score             numeric,
  calibration_bucket text,
  last_close        numeric,
  last_close_date   date,
  foreign key (user_id, recommendation_id) references public.recommendations(user_id, id) on delete cascade
);
create index recommendation_scores_user on public.recommendation_scores (user_id, recommendation_id);

alter table public.decisions add column recommendation_id uuid references public.recommendations(id) on delete set null;
create index decisions_recommendation on public.decisions (recommendation_id) where recommendation_id is not null;
```

语义约束（由应用层保证，与现有表同等级别）：

- `recommendations` 追加写入。API 只开放创建和撤回；`fill_price` / `fill_date` 只由评分任务写一次。浏览器直写 Supabase 的路径与现有 `decisions` 表同样存在，属 v4 M1a 的既有债务，不在本轮解决。
- `reference_price` 只记录分析师当时说的价格，**不作为成交价**。成交价统一用建议日（或其后首个交易日）的 K 线收盘价，与评分基准同源（现有 `fetchEastmoneyKline` 默认：A 股前复权，港 / 美股不复权），避免分析师口述价与 K 线价混算。
- `analyst_profiles.is_self` 的档案在用户首次访问 `/analyst` 时由服务端 `ensureSelfProfile()` 懒创建，显示名取 profiles 昵称或「我」。
- `research_decisions.analyst_id`、`research_analyst_identities.analyst_id` 在语义上等于 `analyst_profiles.id`，但不建外键：S4 运行时连接 `ALPHA_S4_DATABASE_URL`，与组合库是否同库尚未核实（v4 §8.1）。
- `database.types.ts` 增加 `AnalystProfile`、`Recommendation`、`RecommendationScore` 类型及 `Decision.recommendation_id`。

## 5. 评分内核

抽取 `src/lib/portfolio/review.ts` 的 `scoreDecision` 为通用纯函数：

```ts
// src/lib/scoring/forward.ts
export interface ForwardCall { market: Market; action: DecisionAction; at: string; confidence: number | null }
export interface ForwardScore { base_close: number; base_date: string; forward_5d_pct: number | null; forward_20d_pct: number | null; forward_60d_pct: number | null; hit: boolean | null; score: number | null; calibration_bucket: string | null; last_close: number; last_close_date: string }
export function scoreForward(call: ForwardCall, bars: KlineBar[]): ForwardScore | null
```

规则与现有完全一致：基准 = 决定日交易所本地日期起首根 K 线收盘；5 日缺则不计分；hit = 5 日方向；score = 20 日（缺则 5 日）× 方向；hold 的 hit 与 score 为 null；pass 按看空方向计分（沿用 `review.ts` 既有规则：buy/add = +1，sell/trim/pass = −1）；信心分桶 20 一档。新增返回 `base_close`、`base_date`、`last_close`、`last_close_date` 供账本使用。`review.ts` 改为薄包装，现有 `review.test.ts` 不改且通过。

`src/lib/analyst/score-store.ts` 的 `refreshRecommendationScores()` 对未撤回且（无评分、或 fill 尚未写入、或 60 日窗口未满且建议未超过 130 天）的建议拉 K 线评分（每代码 120 根日线，4 路并发），首次评分时写 `fill_price = base_close`、`fill_date = base_date`。130 天而非 90 天：60 个交易日约 86–91 个自然日，跨春节 / 国庆更长，手动刷新需要余量；120 根日线仍覆盖基准 K 线。建议日早于完整 120 根窗口首根 K 线的建议跳过不计分（否则内核会误把窗口首根当基准并冻结错误成交价）；窗口不满 120 根说明是新上市，顺延到首根属正常。与 `/api/reviews` 一样是按需 POST 刷新，不做 cron（仓库没有 service-role 模式）。

## 6. 模拟账本

`src/lib/analyst/book.ts` 纯函数，输入该分析师全部建议（含 fill 与评分），输出持仓、已平仓与摘要。无需实时行情，全部来自已存数据，可复算。

规则：
- 单位：每条 `buy` / `add` 开 1 份等权名义仓；`trim` 减 1 份；`sell` 清掉该代码全部份数；`hold` / `pass` 不动账本但计入建议数与评分。
- 成交价 = `fill_price`；无 `fill_price`（尚未评分或 K 线不足）的建议计入「待定价」，不进账本。
- 对无持仓代码的 `sell` / `trim` 计入「无仓可卖」，不进账本。
- 已撤回的建议不进账本，也不进评分统计。
- 持仓行：代码、份数、均价（份数加权）、最新价（该代码最近一条评分的 `last_close`）、浮动% = 最新价 / 均价 − 1、权重 = 份数 / 总份数。
- 平仓：卖出时按均价结算，每份已实现% = 卖价 / 均价 − 1；账本已实现% = 全部已平份数的简单平均。
- 摘要：建议数、可计分数、命中率（hit 非 null 的样本）、平均 20 日收益、持仓数、浮动%均值、已实现%均值、待定价数、无仓可卖数。所有比率都带 n。

明确不算：现金、NAV、费用、滑点、汇率、分红、拆股调整（成交价与最新价同出一个 K 线源；港 / 美股不复权带来的拆股失真照实显示，不修正；跨币种只按币种分组不相加）。

已知局限：成交价在首次评分时冻结，之后 A 股前复权因送转 / 分红重算历史、或港美股不复权的拆股，会让成交价与最新价基准漂移；某代码上所有建议停止再评分后（60 日已满或超过 130 天），其最新价冻结在最后一次评分。两者都如实显示 `last_close_date`，不修正。

## 7. API

与 `/api/decisions` 同模式：`force-dynamic`，服务端 `getServerSupabase()` 以登录用户身份读写，401 / 400 / 500 三类错误。

| 方法 路径 | 作用 |
|---|---|
| `GET /api/analyst/profiles` | 列出未归档档案（含 self），附每人摘要统计 |
| `POST /api/analyst/profiles` | 新建档案 |
| `PATCH /api/analyst/profiles/[id]` | 改名 / 备注 / 归档；self 不可归档 |
| `GET /api/analyst/recommendations?analyst=&ticker=&open=1` | 列表（含评分、采纳的 decision id） |
| `POST /api/analyst/recommendations` | 新建建议 |
| `POST /api/analyst/recommendations/[id]/withdraw` | 撤回（带原因） |
| `GET /api/analyst/book?analyst=` | 服务端算账本，返回持仓 / 平仓 / 摘要 |
| `POST /api/analyst/scores` | 刷新评分（返回 scored 数） |

校验在 `src/lib/analyst/validate.ts`，镜像 `portfolio/validate.ts`（ticker 大写、市场枚举、文本上限 4000、`source_ref` ≤ 16 KiB）。`parseDecisionInput` 增加可选 `recommendation_id` uuid 校验；`createDecision` 在插入前确认该建议属于当前用户且未撤回。

## 8. 错误与降级

- K 线源不可用：评分任务跳过该建议并在返回里计数 `skipped`，页面显示「评分待刷新」，账本把它归入「待定价」。
- 档案被归档后其建议仍可读、仍计分；归档档案在总览隐藏，详情页可直达。
- 删除档案不提供 API，只归档；analyst_profiles 与 recommendations 不开 delete 策略，靠 RLS 保护。外键用 cascade 只为 auth 用户删除时级联。
- 采纳链接指向的建议被撤回：决定上保留链接并标「建议已撤回」。

## 9. 测试

- `src/lib/scoring/forward.test.ts`：从 `review.test.ts` 复制用例并补 `base_close` / `last_close` 断言；`review.test.ts` 原样通过。
- `src/lib/analyst/book.test.ts`：开仓 / 加仓均价 / trim 减份 / sell 清仓与已实现% / 无仓可卖 / 待定价 / 撤回不入账 / hold 不动账本 / 权重和为 1 / 空输入。
- `src/lib/analyst/validate.test.ts`：每个字段的边界与枚举。
- `src/lib/analyst/store.test.ts`：PostgREST numeric 字符串 coerce（同 `portfolio/store.test.ts` 只测纯映射）。
- `portfolio/validate.test.ts` 增 `recommendation_id` 用例。
- `npm run test:migrations`：新迁移可重放。
- e2e：`e2e/authed.spec.ts` 增 `/analyst` 可渲染且含免责声明（有凭据时运行）。
- `typecheck` / `lint` / `build` 全绿；mobile 预设截图核对 7 tab。

## 10. 交付物

- 迁移 + `database.types.ts`
- `src/lib/scoring/forward.ts`（抽取）+ `portfolio/review.ts` 薄包装
- `src/lib/analyst/{validate,store,score-store,book}.ts`
- `src/app/api/analyst/**`
- `src/app/(app)/analyst/{page,[analystId]/page}.tsx` + `src/components/analyst/*`
- `TabBar.tsx`、`messages/{zh,en}/{common,analyst}.json`、`messages/GLOSSARY.md`（新增：建议 Recommendation、分析师 Analyst、模拟账本 Simulated Book、采纳 Adopt、撤回 Withdraw）
- `DecisionForm.tsx` 采纳下拉、`/portfolio/decisions` 标签
- `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md`：三层边界、术语（研究 / 分析 / 我的投资）、S4 不搬的理由、与 v4 的关系

## 11. 实施顺序（供计划拆分）

1. 评分内核抽取（纯函数，先跑旧测试）
2. 迁移与类型
3. `analyst` lib：validate → book → store → score-store，带测试
4. API 路由
5. 页面、组件、导航、i18n
6. portfolio 采纳链接
7. ADR 与术语表
8. 全量验证（test / typecheck / lint / build / migrations / e2e / 截图）
