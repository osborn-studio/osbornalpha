# 宏观工作台（Macro Workbench）设计规格 · P1 + P2

日期：2026-11-04
状态：草案，待 owner 评审
前置研究：`docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md`（对方站点逐组件拆解与克隆蓝图）、同目录 `REPORT.md`、`SOURCE_MAP.csv`
已定决策（2026-11-04 owner 确认）：范围 P1 纵向闭环 + P2 关联与事件；中国宏观数据首期走 AKShare 采集脚本；面向所有登录用户开放。

---

## 1. 目标与非目标

### 1.1 目标

把 ChaosAI 宏观策略页最有价值的阅读路径——**状态判定 → 判定依据 → 驱动指标 → 指标周期与事件 → 指标与资产的统计关系**——用 OsbornAlpha 的设计语言和现有工程基础独立实现，并修正对方的四类缺陷：规则类型错配、文案与数值脱节、新鲜度名不副实、来源不可复现。

成功标准：

1. `/intel/macro` 展示美国、中国两套真实指标（US 8、CN 12（含利率 3 项）），每个值都带数据期、最近同步时间、来源与新鲜度状态。
2. 象限判定可展开到逐指标贡献，同一 `snapshot_id` 驱动概览数字、贡献表、指标详情与 Today 卡片。
3. 指标详情页有历史序列、周期分段、事件标记、周期内资产区间收益。
4. 关联工作台可对任意"指标 × 资产"做水平 / 变化 / 滚动 / 事件窗口四种相关分析，结果可保存并复算。
5. Today 页 `MacroGlance` 不再读 mock。
6. 采集失败时页面显示最后一次成功快照并标 stale，永不显示 0 或合成数据。

### 1.2 本规格之外（后续阶段，另立规格，不是放弃）

- **P3**：传导链情景图、4 剧本 × 6 维度热力图、FOMC 加息/降息周期资产表。本规格的 `macro_events`、`macro_cycles`、资产 catalog 与 `analysis_runs` 就是为 P3 准备的底座；P3 规格在 P2 验收后立项。
- **P4**：LLM 生成的周期解读与核心结论、偏差案例库、月度复盘。本规格预留 `snapshot_id` 绑定点与 `ai_runs` 落库路径。
- 行业财务 / 估值分位、AI 生态榜单、外资研报（`REPORT.md` 的 D/E/F 阶段）。
- 本规格明确不做的两件事：把象限资产配置模板接到用户组合或交易；把归一化得分称为"概率"（首期输出 score / coverage / margin）。

---

## 2. 用户与权限

- 所有登录用户可读概览、指标详情、关联分析结果；受 `middleware.ts` 现有 session 门禁，不走 `requireResearchUser`。
- 创建关联分析任务（`POST /api/macro/analyses`）按 plan 配额：free 每日 10 次、pro 100 次，admin 不限，走 `limitFor(feature='macro_analysis', plan, role)`（`src/lib/billing/quota.ts` 新增 feature）。
- 采集与发布只允许服务端（cron secret / ingest secret），用户无写权限。
- 公共指标数据是公开数据，不做租户隔离；`analysis_runs` 按 `user_id` 隔离（RLS own-rows）。

---

## 3. 信息架构与 UI

### 3.1 路由

| 路由 | 说明 |
|---|---|
| `/intel` | 现有页新增第三个 tab "宏观"，内容为概览摘要卡 + "进入工作台"链接（不把整个工作台塞进 intel 页） |
| `/intel/macro` | 工作台首页：顶部地区切换（US / CN），页内 tab：概览 · 指标 · 关联 · 方法与来源 |
| `/intel/macro/[seriesId]` | 指标详情页 |
| `/intel/macro/analyses/[runId]` | 已保存的关联分析结果页（可分享给同账号） |

不新增底栏 tab；`TabBar` 的 `intel` navKey 对 `/intel/macro/*` 保持高亮（现有 `startsWith` 匹配即可，实施时核对）。

### 3.2 页面结构（桌面）

```
┌ 宏观工作台                      US ◉ CN ○      截至 2026-11-03 · 同步 03:12 · ● fresh ┐
├ 概览 | 指标 | 关联 | 方法与来源                                                       ┤
│ ┌ 状态卡 ──────────────────────┐ ┌ 本期变化 ────────────────┐                        │
│ │ 增长 ↓ 收缩   通胀 → 温和      │ │ 新发布 3 · 转向 1 · 缺失 1 │                        │
│ │ 主判定 过热 score 34          │ │ CPI 2.9 (+0.3) 2026-08    │                        │
│ │ 次判定 衰退 score 24 margin 10│ │ PMI 48.7 (−0.4) 2026-09   │                        │
│ │ coverage 92%  方法 v1.0       │ │ NAPM 来源缺失 → 已排除     │                        │
│ └ 查看贡献明细 ▸ ───────────────┘ └──────────────────────────┘                        │
│ ┌ 贡献明细（折叠）: 指标 | 值 | 规则 | 得分×权重 | 贡献 | 象限 ─────────────────────┐ │
│ ┌ 指标表: 名称 | 值 | 变化(类型化口径) | 数据期 | 发布日 | 状态 | 迷你走势 ─────────┐ │
│ │  行选中 → 右侧/下方 IndicatorDetail 预览（历史 + 周期色带 + 事件）                 │ │
│ └ 来源条: FRED · NBS · PBoC · GAC · yfinance  ▸ 打开血缘抽屉 ─────────────────────┘ │
```

- 两条主轴（增长动能 / 通胀动能）是一等公民，象限名是派生标签。与对方"四张高饱和象限卡"不同，这里用一张状态卡 + 四个象限 score 的水平条（当前态黄铜描边，其余中性）。
- `DESIGN.md` 约束：无紫色、无渐变文字、无发光、圆角 ≤ 6px、数字 Geist Mono、密度层 `[data-density="data"]`。
- 涨跌色沿用 `data-color-scheme`；但宏观指标"上升"不等于"利好"，表格里只用中性箭头 + 文字，不着红绿色；资产区间收益才用红绿。

### 3.3 指标详情页

顺序固定为：**当前值 → 与上一可比期的变化（类型化口径）→ 数据期 → 发布/可得时间 → 走势（周期色带 + 事件标记）→ 周期内资产区间收益 → 计算口径 → 来源与修订**。

- 走势图：`lightweight-charts` LineSeries；周期分段用背景区间色（加息/上行 = `--warn` 低透明，降息/下行 = `--accent-wash`），事件用 marker，hover 显示事件标题与来源链接。
- 窗口切换：3Y / 5Y / 10Y / 全部；变换切换：原值 / 同比 / 环比差（按 `series_type` 允许的集合）。
- 所有图表有"表格视图"开关。

### 3.4 关联工作台

表单：指标（catalog 中 `role=indicator`）× 资产（`role=asset`）× 模式（水平 / 变化 / 滚动 / 事件窗口）× 窗口 × 滞后（−12…+12 月）× 频率（月）。提交后创建 `analysis_run`，结果页显示：
- 水平 / 变化：双轴折线 + 散点回归（内联 SVG）+ `r, R², n, 样本区间, 变换, 方法版本` + 规则生成的一句统计事实。
- 滚动：36 个月滚动 r 折线。
- 事件窗口：以 `macro_events` 为锚，事件前后 ±N 月资产收益分布（中位数、四分位、样本数、极端案例列表）。

"热门分析"区预置 8 组（对方页面的 6+6 组中去掉错误的 MLF↔CGB），作为种子 run，每次新快照自动重算。

### 3.5 Today 页

`MacroGlance` 改为读 `GET /api/macro/overview?region=all&compact=1`：显示 US / CN 各一行状态（主判定 + margin）、3 个最新变化、`stale` 徽标，点击进入工作台。原来的指数行情行（SSE/HSI/Nasdaq/DXY）继续由现有行情链路提供，不混入宏观 snapshot。

### 3.6 移动端

- 状态卡 → 本期变化 → 指标表（折叠为"名称 + 值 + 变化"三列，点击进入详情页，不做行内预览）。
- 关联工作台表单纵向堆叠；图表宽度 100%，散点图在 < 640px 隐藏改为表格。

### 3.7 GUI 与 UI 流程设计稿

由 Claude Design 生成的高保真稿与流程图作为本规格的视觉附件（见第 16 节链接，实施前以其为准）。设计稿必须使用 OsbornAlpha 既有 tokens；凡与 `DESIGN.md` 冲突以 `DESIGN.md` 为准。

---

## 4. 数据架构

### 4.1 三类时间与版本

每个观测记录 `period_end`（数据期）、`available_at`（发布/可得时间，缺省取供应商首次出现时间）、`ingested_at`（入库时间）、`vintage_id`（修订版本）。历史回放只能用 `available_at <= asOf` 的版本。

### 4.2 序列目录 `macro_series`（代码即配置）

`src/lib/macro/catalog.ts` 导出 `MACRO_CATALOG: MacroSeriesDef[]`，迁移时同步写入 `macro_series` 表（表是只读镜像，便于 SQL join 与后台查看）。

```ts
type SeriesType =
  | 'policy_rate' | 'bond_yield' | 'fx' | 'inflation_yoy'
  | 'pmi' | 'labor_rate' | 'growth_yoy' | 'liquidity_yoy'
  | 'risk_index' | 'asset_price';

interface MacroSeriesDef {
  id: string;               // 内部主键，例如 'US_DFF'、'CN_CPI_YOY'、'ASSET_IXIC'
  region: 'US' | 'CN' | 'GLOBAL';
  role: 'indicator' | 'asset';
  type: SeriesType;
  name: { zh: string; en: string };
  unit: '%' | 'index' | 'pct_yoy' | 'ratio' | 'price';
  frequency: 'daily' | 'monthly' | 'quarterly';
  provider: 'fred' | 'akshare' | 'yfinance';
  providerSeriesId: string; // FRED code / AKShare 函数+字段 / yfinance ticker
  origin: string;           // 原发布机构，例如 'BLS'、'国家统计局'、'人民银行'
  transform?: 'yoy_from_index';     // 派生规则
  weight: number;           // 判定权重；asset 为 0
  changeKind: 'bp' | 'pp' | 'pct' | 'points';  // 变化口径
  releaseCalendar?: 'bls_cpi' | 'bls_jobs' | 'ism' | 'nbs_month' | 'pboc_money' | 'gac_trade' | 'nbs_gdp';
  definitionVersion: number;
}
```

首期目录：

| id | type | provider / 上游 id | origin | 频率 | weight | changeKind |
|---|---|---|---|---|---|---|
| US_DFF | policy_rate | fred / DFF | Fed | daily→月末 | 25 | bp |
| US_DGS10 | bond_yield | fred / DGS10 | Treasury | daily→月末 | 15 | bp |
| US_DTWEXBGS | fx | fred / DTWEXBGS | Fed | daily→月末 | 10 | pct |
| US_CPI_YOY | inflation_yoy | fred / CPIAUCSL（yoy_from_index） | BLS | monthly | 15 | pp |
| US_UNRATE | labor_rate | fred / UNRATE | BLS | monthly | 10 | pp |
| US_ISM_PMI | pmi | **akshare / macro_usa_ism_pmi**（FRED 已移除） | ISM | monthly | 15 | points |
| US_PPI_FD_YOY | inflation_yoy | fred / PPIFIS（yoy_from_index，名称"最终需求"） | BLS | monthly | 5 | pp |
| US_VIX | risk_index | fred / VIXCLS | Cboe | daily→月末 | 5 | points |
| CN_MLF_1Y | policy_rate | akshare / macro_china_mlf（事件型） | 人民银行 | event | 10 | bp |
| CN_LPR_1Y / CN_LPR_5Y | policy_rate | akshare / macro_china_lpr | 同业拆借中心 | monthly | 5 / 5 | bp |
| CN_CGB_10Y | bond_yield | akshare / bond_zh_us_rate | 中债 | daily→月末 | 15 | bp |
| CN_USDCNY | fx | akshare / fx_spot_quote 或 currency_boc_sina | 外汇交易中心 | daily→月末 | 5 | pct |
| CN_CPI_YOY | inflation_yoy | akshare / macro_china_cpi_yearly | 国家统计局 | monthly | 10 | pp |
| CN_PPI_YOY | inflation_yoy | akshare / macro_china_ppi_yearly | 国家统计局 | monthly | 15 | pp |
| CN_GDP_YOY | growth_yoy | akshare / macro_china_gdp_yearly | 国家统计局 | quarterly | 5 | pp |
| CN_M2_YOY | liquidity_yoy | akshare / macro_china_money_supply | 人民银行 | monthly | 10 | pp |
| CN_AFRE_STOCK_YOY | liquidity_yoy | akshare / macro_china_shrzgm **存量同比字段**（不是增量） | 人民银行 | monthly | 20 | pp |
| CN_PMI | pmi | akshare / macro_china_pmi_yearly（官方制造业） | 国家统计局 | monthly | 15 | points |
| CN_EXPORT_YOY | growth_yoy | akshare / macro_china_exports_yoy | 海关总署 | monthly | 10 | pp |
| ASSET_IXIC / SPX / DJI / CSI300 / HSI / GOLD / COPPER / WTI / TLT / DXY | asset_price | yfinance / ^IXIC ^GSPC ^DJI 000300.SS ^HSI GC=F HG=F CL=F TLT DX-Y.NYB | 交易所/ICE | daily→月末 | 0 | pct |

AKShare 具体函数名以实施时 AKShare 当前版本文档为准；采集脚本必须记录 `akshare.__version__` 与函数名到回执。`DXY`（ICE）与 `DTWEXBGS`（广义）是两个 ID，界面名称分别为"美元指数 DXY"与"广义美元指数"。

### 4.3 存储（Supabase 迁移 `supabase/migrations/2026110xxxxxxx_macro_workbench.sql`）

| 表 | 主要列 | 约束 / RLS |
|---|---|---|
| `macro_series` | id PK, region, role, type, unit, frequency, provider, provider_series_id, origin, weight, change_kind, definition_version, updated_at | public read；写仅 service role |
| `macro_observations` | id, series_id FK, period_end date, value numeric, available_at timestamptz, ingested_at, vintage_id text, raw_hash text, status ('ok'/'quarantined'), batch_id | UNIQUE(series_id, period_end, vintage_id)；public read where status='ok' |
| （共用）`ingest_batches` | 见数据底座规格 §5.1；本模块以 `dataset='macro'`、producer ∈ {'ts-fred','py-akshare','py-yfinance'} 写入，不单建 `macro_ingest_batches` | admin 可读，service 写 |
| `macro_snapshots` | snapshot_id PK, region, as_of, methodology_version, status ('active'/'superseded'/'failed'), observation_ids bigint[], coverage numeric, freshness jsonb, created_at | public read；每 region 仅一条 active（partial unique index） |
| `macro_regime_results` | snapshot_id FK, region, scores jsonb {recovery,overheat,stagflation,recession}, contributions jsonb[], primary_state, secondary_state, margin, coverage, growth_axis, inflation_axis | public read |
| `macro_events` | event_id PK, region, event_date, announced_at, event_type ('policy_rate'/'fomc'/'data_release'/'shock'/'manual'), title {zh,en}, value_change numeric, related_series text[], source_url, source_kind ('official'/'editorial'), revised_from | public read；写 service / admin |
| `macro_cycles` | cycle_id, series_id, kind ('hike'/'cut'/'up'/'down'/'easing'/'tightening'), start_period, end_period (null=进行中), method_version, derived_from_event_ids | public read |
| `macro_analysis_runs` | run_id PK, user_id, kind ('level'/'change'/'rolling'/'event_window'), spec jsonb, snapshot_id, results jsonb, code_version, status, created_at | own-rows RLS；`seed=true` 的系统 run public read |

原始响应 JSON 存 Supabase Storage bucket `macro-raw/<batch_id>/<series_id>.json`，`raw_hash` 指向它。

### 4.4 采集链路

```
Vercel cron 05:30 UTC  →  GET /api/cron/macro-sync        (CRON_SECRET)
                             ├─ FRED adapter (TS)  → 写 observations (producer=ts-fred)
                             ├─ 触发 Python 采集?  否：Python 由 Mac Studio launchd 自行调度
                             └─ 结束后调用 publish(region) 重新计算 snapshot

Mac Studio launchd 05:00 UTC → python scripts/macro/collect.py --producer akshare,yfinance
                             → POST /api/macro/ingest  (Bearer MACRO_INGEST_SECRET)
                               body: { batch, observations[], tool_versions }
```

- FRED 适配器 `src/lib/macro/providers/fred.ts`：`GET https://api.stlouisfed.org/fred/series/observations?series_id=..&api_key=FRED_API_KEY&observation_start=2010-01-01`；月度指标取原频率，日频指标在 `normalize.ts` 里取月末值（并保存日频原值）。
- Python 采集器 `scripts/macro/collect.py`（仓库已有 Python 脚本先例 `scripts/quotes/probe_quality.py`），依赖 `akshare`、`yfinance`、`requests`，`scripts/macro/requirements.txt` 锁版本；输出规范化记录 `{series_id, period_end, value, available_at?, raw}`，不做任何派生计算。
- `POST /api/macro/ingest`：校验 secret → ajv schema 校验 → 范围检查（`quality.ts`：单位范围、跳变 > N σ 隔离）→ 幂等写入（同键同值跳过，同键不同值 quarantined + 新 vintage）→ 返回回执。
- 发布 `src/lib/macro/snapshots.ts::publish(region)`：读各序列最新 ok 观测 → 计算 regime → 一致性检查（coverage ≥ 0.6，否则 snapshot status=failed，保留旧 active）→ 事务内切换 active。
- 失败策略：任一 provider 失败不阻塞其他；新快照失败不覆盖旧快照；回执写共用的 `ingest_batches.errors`（见数据底座规格 §5.1）。

### 4.5 新鲜度

`freshness.ts` 按 `releaseCalendar` 判断：数据期 + 预期发布滞后（CPI ≈ 15 天、PMI ≈ 1 天、中国月度 ≈ 15 天、GDP ≈ 20 天）→ 若当前日期超过预期发布日 + 3 天仍无新观测，标 `stale`；provider 失败连续 2 次标 `error`；catalog 存在但无观测标 `missing`。状态在指标表、状态卡、Today 卡片同时显示。

---

## 5. 判定引擎 `src/lib/macro/regime.ts`

### 5.1 规则类型化

```ts
type Rule = { when: (v: number, delta: number) => boolean; support: Partial<Record<State, number>>; label: {zh,en} };
const RULES: Record<SeriesType, Rule[]> = { policy_rate: [...], fx: [...], ... };
```

一个序列只会匹配自己 `type` 下的规则；没有匹配则该指标不贡献且计入 `uncovered_weight`。单元测试覆盖"汇率值 7.12 永远不命中 policy_rate 规则"。

### 5.2 v1.0 规则表（修正自对方规则，阈值可在 `methodology_version` 内调参）

| type | 条件 | 复苏 | 过热 | 滞胀 | 衰退 |
|---|---|---|---|---|---|
| policy_rate | v < 2.5 | 0.2 | — | — | 0.7 |
| policy_rate | 2.5 ≤ v < 4.5 | 0.3 | 0.2 | 0.1 | 0.1 |
| policy_rate | v ≥ 4.5 且 Δ ≥ 0 | — | 0.6 | 0.3 | — |
| policy_rate | v ≥ 4.5 且 Δ < 0 | — | 0.2 | 0.2 | 0.4 |
| bond_yield | Δ(3M) ≥ +25bp | — | 0.5 | 0.3 | — |
| bond_yield | Δ(3M) ≤ −25bp | 0.2 | — | — | 0.5 |
| bond_yield | 其他 | 0.2 | 0.2 | 0.2 | 0.2 |
| fx (美元类) | 3M 变化 ≥ +2% | — | 0.4 | 0.3 | — |
| fx | 3M 变化 ≤ −2% | 0.5 | — | — | 0.2 |
| inflation_yoy | v < 1 | 0.1 | — | — | 0.7 |
| inflation_yoy | 1 ≤ v < 2 | 0.5 | — | — | 0.3 |
| inflation_yoy | 2 ≤ v ≤ 3 | 0.4 | 0.3 | 0.1 | 0.1 |
| inflation_yoy | 3 < v ≤ 4 | — | 0.6 | 0.3 | — |
| inflation_yoy | v > 4 | — | 0.4 | 0.6 | — |
| pmi | v ≥ 55 | 0.3 | 0.6 | — | — |
| pmi | 50 ≤ v < 55 | 0.5 | 0.3 | — | — |
| pmi | 47 ≤ v < 50 | 0.1 | — | 0.4 | 0.4 |
| pmi | v < 47 | — | — | 0.3 | 0.7 |
| labor_rate | Δ(3M) ≥ +0.3pp | — | — | 0.4 | 0.5 |
| labor_rate | Δ(3M) ≤ −0.1pp | 0.5 | 0.4 | — | — |
| growth_yoy (CN GDP/出口) | Δ ≥ 0 且 v ≥ 5 | 0.5 | 0.3 | — | — |
| growth_yoy | v < 4.5 | — | — | 0.3 | 0.6 |
| liquidity_yoy | v ≥ 8 且 Δ ≥ 0 | 0.5 | 0.3 | — | — |
| liquidity_yoy | v ≥ 8 且 Δ < 0 | 0.2 | 0.4 | 0.2 | — |
| liquidity_yoy | v < 8 | — | — | 0.3 | 0.5 |
| risk_index | v < 15 | 0.4 | 0.4 | — | — |
| risk_index | 15 ≤ v < 25 | 0.3 | 0.3 | 0.2 | 0.2 |
| risk_index | v ≥ 25 | — | — | 0.5 | 0.5 |

Δ 默认与上一可比期比较；标注 Δ(3M) 的用 3 个月前。

### 5.3 输出

```
score[s]    = Σ_i weight_i × support_i[s]
coverage    = Σ(matched weight) / Σ(catalog weight for region)
norm[s]     = score[s] / Σ score   （coverage < 0.6 → 不发布）
primary     = argmax norm；secondary = 次高；margin = norm[primary] − norm[secondary]
growth_axis = 由 pmi/labor/growth 类的加权倾向 → 'expanding' | 'contracting' | 'flat'
inflation_axis = 由 inflation_yoy 类 → 'rising' | 'falling' | 'stable'
```

界面文案：`margin < 5` 显示"四象限接近，判定不稳"；`5–15` 显示"相邻象限可能漂移"；`> 15` 不提示。所有数字标注 `methodology_version`。

---

## 6. 事件与周期（P2）

### 6.1 事件来源

- 自动：`policy_rate` 序列的任何变化自动生成 `policy_rate` 事件（value_change = bp，source_kind=official，source_url 指向 FRED/人民银行）；FOMC 日程从一个版本化 JSON `src/lib/macro/data/fomc-meetings.json` 导入（手工维护，官方日程）。
- 编辑型：admin 通过 `scripts/macro/events-import.ts` 从 `docs/macro/events.yaml` 导入（对方站点那类"YY-MM 事件标签"），`source_kind=editorial`，界面上与官方事件用不同 marker 形状区分。

### 6.2 周期分段 `cycles.ts`

- `policy_rate`：按事件方向分段，同方向连续事件合并；方向翻转开启新周期；> 12 个月无变化记"平台期"。
- 其他序列：对 12 个月移动中位数求方向，连续同向 ≥ 6 个月成段；最小段长 6 个月，短于则并入前段。方法版本化（`method_version`）。
- 每段计算"周期内资产区间收益"：资产序列在 `start_period` 月末与 `end_period`（或最新）月末的 pct；收益率类资产用 bp。

---

## 7. 关联分析 `correlation.ts`（P2）

- 对齐：月度 `period_end` 内连接；缺失不插值；`n < 24` 拒绝计算。
- 变换：`level`；`change`（指标 Δ 与资产对数收益）；`rolling`（36M 窗口 r 序列）；`event_window`（按事件 ±N 月的资产收益分布）。
- 输出 `results: { r, r2, slope, intercept, n, from, to, lag, transform, series_versions, code_version }`。
- 统计事实文案由 `explain.ts` 规则生成：`|r| < 0.3` "弱" / `< 0.6` "中等" / 否则 "强"，符号与数字强绑定；不写机制解释。
- 种子 run 由 `publish()` 之后异步重算；用户 run 在请求内同步计算（120×2 点，毫秒级）。

---

## 8. API 契约

| 方法 路径 | 返回 | 约束 |
|---|---|---|
| `GET /api/macro/overview?region=US\|CN\|all&compact=1` | `{snapshotId, asOf, methodologyVersion, regime, changes[], freshness, sources[]}` | 读 active snapshot；`Cache-Control: s-maxage=300` |
| `GET /api/macro/series/[id]?from&to&transform&asOf` | `{def, observations[], cycles[], events[], assetsByCycle[], provenance}` | 白名单 id；最多 600 点 |
| `GET /api/macro/snapshots/[id]` | 快照全文（贡献表、observation_ids） | 公开 |
| `POST /api/macro/analyses` | 创建 run，返回 `{runId}` | session + 配额；ajv 校验 spec |
| `GET /api/macro/analyses/[runId]` | run 结果 | own 或 seed |
| `GET /api/macro/events?region&from&to` | 事件列表 | 公开 |
| `POST /api/macro/ingest` | 回执 | `MACRO_INGEST_SECRET`；body ≤ 2 MB |
| `GET /api/cron/macro-sync?preview=1` | 同步 + 发布回执 | `CRON_SECRET`，沿用 `authorizedCronRequest` |

所有读接口响应含 `snapshotId`、`asOf`、`methodologyVersion`、`freshness`；错误用 `{error:{code,message}}`。

---

## 9. 代码结构

```
src/lib/macro/
  catalog.ts            MACRO_CATALOG + 类型
  providers/fred.ts     FRED 适配器（fetch + 解析 + 回执）
  normalize.ts          月末取值、yoy_from_index、单位校验
  quality.ts            范围 / 跳变 / 唯一性
  ingest.ts             写入与隔离逻辑（供 API 与 cron 共用）
  freshness.ts
  regime.ts             规则表 + 评分
  cycles.ts  events.ts  correlation.ts  explain.ts
  snapshots.ts          publish / active / 回放
  *.test.ts             每个模块同目录测试
src/app/api/macro/...   路由
src/app/api/cron/macro-sync/route.ts
src/app/(app)/intel/macro/{page.tsx,[seriesId]/page.tsx,analyses/[runId]/page.tsx}
src/components/macro/
  RegimeSummary.tsx  ContributionTable.tsx  IndicatorTable.tsx  IndicatorDetail.tsx
  CorrelationWorkbench.tsx  SourceFooter.tsx  SourceDrawer.tsx
  charts/{MacroLineChart.tsx (lightweight-charts), Sparkline.tsx, ScatterFit.tsx, ScoreBars.tsx}
  macro-format.ts       变化口径格式化（bp/pp/pct/points），可测
scripts/macro/collect.py  requirements.txt  events-import.ts
messages/{zh,en}/macro.json（注册到 MESSAGE_DOMAINS）
supabase/migrations/..._macro_workbench.sql
```

---

## 10. i18n

新域 `macro`；指标名称来自 catalog（zh/en 双写），规则标签、状态文案、表头、来源抽屉文案进 `messages/*/macro.json`；`messages-parity.test.ts` 自动校验双语对等。

---

## 11. 错误处理与数据质量

| 情形 | 行为 |
|---|---|
| provider 超时/5xx | 重试 3 次退避；写 batch.errors；其余序列继续 |
| 同键不同值 | 新行 `quarantined` + 新 `vintage_id`，旧值继续服务；admin 页列出待处理 |
| 单位异常（CPI 同比 > 50、PMI > 100） | 拒收，回执标错 |
| coverage < 0.6 | 不发布新快照；概览显示旧快照 + "数据覆盖不足"横幅 |
| catalog 新增序列无历史 | `missing`，判定排除，不补中性分 |
| 用户 run 参数非法 | 400 + 字段级错误 |

---

## 12. 测试策略

- 纯函数单元测试（vitest，`src/**/*.test.ts`）：`regime`（类型隔离、coverage、margin、固定夹具重现对方 US/CN 快照并对比修正后的结果）、`normalize`（yoy_from_index、月末取值）、`cycles`（分段）、`correlation`（与 numpy 预算值对比的夹具）、`macro-format`（bp/pp/pct）。
- 迁移：`npm run test:migrations` + `check:migration-history`。
- 数据库集成（`test:db`）：ingest 幂等与隔离、active snapshot 唯一、RLS（匿名可读 ok 行、不可读 quarantined）。
- API：`/api/macro/ingest` schema 拒收夹具；`/api/cron/macro-sync?preview=1`。
- E2E（Playwright）：登录 → `/intel/macro` 概览可见 → 展开贡献 → 进入指标详情 → 创建一个 level 分析 → Today 卡片显示状态。
- Python：`scripts/macro/test_collect.py` 对采集器输出 schema 做离线夹具测试（不打网络）。

---

## 13. 性能与运维

- 概览接口 p95 < 300ms（读单表 + jsonb）；指标详情 < 500ms；页面首屏 payload < 60 KB（不含图表库）。
- 采集：FRED 18 个请求 / 日；Python 约 15 次 AKShare + 10 次 yfinance / 日。
- 环境变量新增：`FRED_API_KEY`、`MACRO_INGEST_SECRET`；Python 侧 `MACRO_INGEST_URL`、`MACRO_INGEST_SECRET`。
- 运行手册 `docs/runbooks/macro-sync.md`：手动触发、隔离处理、回滚 active snapshot。

---

## 14. 分期与验收

| 工作包 | 交付 | 退出条件 |
|---|---|---|
| WP-M1 目录与迁移 | catalog、迁移、RLS、ingest API、FRED 适配器、cron 骨架 | `preview=1` 返回 US 8 序列回执；test:db 通过 |
| WP-M2 Python 采集 | collect.py、requirements、launchd plist 模板、ingest 对接 | CN 12 + 资产 10 序列入库；回执含 tool_versions |
| WP-M3 判定与快照 | regime、snapshots、freshness、overview API | 夹具重现 + 修正；active 切换事务 |
| WP-M4 工作台 UI | 概览、指标表、详情、来源抽屉、Today 替换、i18n | E2E 通过；DESIGN.md 审查 |
| WP-M5 事件与周期 | events、fomc json、cycles、详情页色带与资产区间收益 | 分段单测；事件 marker 可见 |
| WP-M6 关联工作台 | correlation、analyses API、UI、种子 run | 四种模式；配额生效 |

验收样例（沿用 `REPORT.md` 12.3 的 1–8 条）加：
9. 对方站点 2026-09-11 快照夹具输入我们的 v1.0 规则，DTWEXBGS / USDCNY / GDP 三项不再命中利率或 PMI 规则。
10. 断网运行 `macro-sync`：概览仍返回旧 snapshot，`freshness.status='error'`，无 0 值。

---

## 15. 开放问题

1. AKShare 的 `macro_china_shrzgm` 是否含存量同比字段；若无，需从人民银行月度存量表另算（WP-M2 第一周验证）。
2. 美国 ISM PMI 走 AKShare `macro_usa_ism_pmi` 的数据使用许可是否可接受；否则缺失，并在方法说明里公开。
3. Python 采集器部署在 Mac Studio（与 DataGateway 同机）还是 GitHub Actions；默认 Mac Studio launchd，失败时可手动跑。
4. 对方站点那些"YY-MM 事件标签"是否要整理成我们的 `events.yaml` 种子；需逐条附来源链接，否则只保留官方自动事件。

---

## 16. 附件

- 对方站点拆解与克隆蓝图：`docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md`
- GUI / UI 流程设计稿（Claude Design 画布，私有链接，含 6 块画板：UI 流程与数据链路、概览页、指标详情页、关联工作台、手机概览、Today 卡片）：https://claude.ai/artifact/StRedLKWSN4EVb26GSg7KH
