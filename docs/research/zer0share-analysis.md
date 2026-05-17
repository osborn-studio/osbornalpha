# zer0share 深度分析报告

> **被分析项目**：https://github.com/zer0quant/zer0share
> **分析时间**：2026-05-17
> **对照项目**：Stock Monitor（本仓库）
> **分析人**：Claude Opus 4.7

---

## 0. TL;DR

> zer0share 是一个**生产级的 A 股本地数据管道**（68 ⭐ / 14 fork，1 天前刚 push，8 个测试文件）。
>
> 它解决了我们 Stock Monitor 一个**关键架构缺陷**：当前每次用户请求都打 Tushare API，浪费 5000 积分配额、慢、无法做全市场扫描。
>
> 三大价值：① **Parquet+DuckDB 缓存层模式** ② **Tushare-compatible 本地 API 抽象（drop-in 替换）** ③ **股票池构建规则**（research_base / trade_base / hs300 / zz500 / zz1000 — 这是真正的 quant IP）。
>
> 已把**股票池规则**抽象 + TS 重写到 [src/lib/data/universe-rules.ts](../../src/lib/data/universe-rules.ts)。

---

## 1. 仓库元信息（vs 上一个 Financial-Query-Search）

| 维度 | zer0share | Financial-Query-Search |
|-----|----------|----------------------|
| Stars / Forks | **68 / 14** ✅ | 0 / 0 |
| Issues / 维护活跃度 | 0 issues, push 1 天前 ✅ | 0 issues, 1 次 bulk upload |
| 作者 | zer0quant（[公众号:极客投研笔记]）| ECUST 学生 |
| 测试 | **8 个测试文件 ~50KB** ✅ | **0** |
| 文档 | 6 份设计文档 in `docs/plans/` ✅ | 仅 README |
| License 文件 | ❌ 无（README badge 写 MIT）| ❌ 无 |
| Topics | a-share / duckdb / parquet / quant 等 9 个 | 无 |
| 包结构 | `pyproject.toml` + 模块化 `zer0share/` | 散乱 .py |
| 代码量 | 80 KB 实现 + 50 KB 测试 = 1.6:1 | 80KB 实现 + 0 测试 |
| 真实可用性 | **✅ 全套真实接通** | ⚠️ 4/4 MCP 占位、RAG 注释掉 |

判断：**专业开发者的真实项目**，不是课程作业。

---

## 2. 技术架构

### 2.1 整体形态

```
                   ┌──────────────────────────┐
                   │  Tushare Pro API         │
                   │  (耗 积分)                │
                   └────────────┬─────────────┘
                                │
                                ▼
              ┌────────────────────────────────┐
              │  TushareFetcher (fetcher.py)   │
              │  - 18+ 字段定义（BASIC_COLS    │
              │    DAILY_COLS DAILY_BASIC_COLS │
              │    …）                          │
              │  - 调用 Tushare pro_api()      │
              └────────────┬───────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  Pipeline (pipeline.py · 355 行)     │
        │  - 增量同步: last_date checkpoint    │
        │  - 幂等: partition_exists() 跳过      │
        │  - 失败告警: 企业微信 webhook         │
        └────────────┬─────────────────────────┘
                     │
                     ▼
   ┌────────────────────────────────────────────────┐
   │  存储层（关键设计）                              │
   │                                                │
   │  Parquet（数据）                               │
   │  data/                                         │
   │    ├── basic/data.parquet                      │
   │    ├── trade_cal/exchange=SSE/data.parquet     │
   │    ├── daily_kline/date=20240131/data.parquet  │
   │    ├── adj_factor/date=20240131/data.parquet   │
   │    ├── daily_basic/date=…/data.parquet         │
   │    ├── index_weight/index_code=399300.SZ/      │
   │    │       date=20240131/data.parquet          │
   │    └── universe/name=univ_trade_hs300/         │
   │                date=20240131/data.parquet      │
   │                                                │
   │  DuckDB（元数据 + 查询引擎）                    │
   │  meta.db                                       │
   │    ├── sync_meta (table_name, last_date)       │
   │    └── trade_cal (mirror from Parquet)         │
   │                                                │
   │  DuckDB 通过 read_parquet(hive_partitioning)    │
   │  直接 SQL Parquet 文件                          │
   └────────────────┬───────────────────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────────────────┐
   │  LocalPro (api.py)                             │
   │  Tushare-compatible drop-in 替换                │
   │  pro.stock_basic()  pro.daily()                │
   │  pro.daily_basic()  pro.adj_factor()           │
   │  pro_bar() 复权 (qfq/hfq)                      │
   │                                                │
   │  → 调用者完全不知道是本地读 vs 远程读           │
   │  → 0 Tushare 积分消耗                          │
   └────────────────┬───────────────────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────────────────┐
   │  Universe Builder (universe.py)                │
   │  univ_research_base / univ_trade_base /        │
   │  univ_trade_hs300 / zz500 / zz1000             │
   │                                                │
   │  → 这是**真正的 quant IP**                      │
   └────────────────────────────────────────────────┘
```

### 2.2 子系统评分

| 模块 | 文件 | 行数 | 评分 | 亮点 |
|-----|-----|----|-----|------|
| `storage.py` | 200+ | **9/10** | Parquet 分区 + DuckDB hive_partitioning，零数据库服务 |
| `api.py` | 15KB | **9/10** | Tushare-compatible drop-in `LocalPro` 类 |
| `universe.py` | 7KB | **10/10** | quant IP，跨研究池/交易池/指数成分 5 套规则 |
| `pipeline.py` | 12KB | **8/10** | 增量同步 + 幂等 + 企微告警 |
| `fetcher.py` | 6KB | **7/10** | Tushare 字段定义齐全 |
| `scheduler.py` | 2KB | **7/10** | APScheduler 3 个 job 错峰 |
| `cli.py` | 5KB | **7/10** | `sync` / `build-universe` / `schedule` 子命令 |
| `notifier.py` | 0.7KB | **6/10** | 简单企微 webhook，但够用 |
| 测试 | 50KB | **8/10** | 1.6:1 测试比，覆盖各层 |

---

## 3. 这个项目对我们 Stock Monitor 有何帮助？

### 当前我们的痛点（zer0share 正好解决）

| 痛点 | 当前状态 | zer0share 启示 |
|-----|--------|--------------|
| **每个用户请求都打 Tushare** | `/api/quote/[t]` 每次 hit Tushare | 应该有本地缓存层 |
| **Tushare 5000 积分被快速耗光** | 浏览 30 只票 ≈ 60 次调用 | 本地缓存后零积分消耗 |
| **无法全市场扫描** | 「ROE>20 AND PE<15 的所有 A 股」做不到 | LocalPro 一句 SQL 解决 |
| **冷启动慢** | Vercel function 每次 cold start + Tushare 1-2s | 本地查询毫秒级 |
| **回测受限** | 当前 backtest 只能 60 天 / 单只票 | 全市场 5 年回测变得可行 |
| **股票池概念缺失** | 用户只能逐只加 watchlist | universe（沪深300 等）一键加入 |

### 解决路径（适配 Vercel Serverless 架构）

zer0share 是为本地/服务器设计的（Parquet 文件 + 本地 DuckDB）。我们 Stock Monitor 在 Vercel **无文件系统**，需要适配：

**方案 A：Supabase 镜像版**（推荐 — 我们已有付费 Supabase）
- Supabase Postgres 表镜像 Parquet schema：`tushare_basic`, `tushare_daily_kline`, `tushare_daily_basic` 等
- Vercel Cron 每日 22:00 跑 Python 同步脚本（用 Vercel Python runtime 或 Modal/Railway 独立 worker）
- 我们的 `/api/quote/[t]` 改为查 Supabase 而非 Tushare
- 0 Tushare 积分被用户行为消耗（仅每日 1 次同步消耗）

**方案 B：Cloudflare R2 + DuckDB-Wasm**（更激进）
- Parquet 文件存 R2（S3 兼容）
- Vercel Edge Function 用 DuckDB-Wasm 直接 SQL R2 Parquet
- 完全无 Postgres，但 Wasm 体积大、Edge 内存限制

**我的建议**：**v0.7 走方案 A**。Supabase 已付费，schema 镜像零成本，可直接复用现有 RLS。

---

## 4. 值得借鉴的 5 大模式

### 模式 1 ⭐⭐⭐：本地缓存层 = drop-in API 替换

```python
# zer0share 的核心抽象
pro = LocalPro(data_dir)
df = pro.stock_basic()             # 从 Parquet 读，不是 Tushare
df = pro.daily(ts_code='600519.SH', start_date='2024-01-01')
```

**TS 移植路径**：
```ts
// src/lib/data/sources/tushare-cache.ts
export class CachedTushare {
  async dailyBasic(ticker: string) {
    return supabase.from('tushare_daily_basic')
      .select('*')
      .eq('ts_code', ticker)
      .order('trade_date', { ascending: false })
      .limit(1)
      .single();
  }
}
```

我们当前的 `tushare.ts` 应该改造为：先查 Supabase 缓存，miss 时降级到 Tushare HTTP。

**实施优先级：高**（v0.7）

### 模式 2 ⭐⭐⭐：Universe 股票池规则（已克隆到本地）

这是 zer0share 最有价值的部分——把"什么算可交易的 A 股"做成代码：

- `univ_research_base` = A 股主板 + 已上市 + 未退市 + 非 ST + 上市 ≥ 6 个月 + 20 日均额 ≥ 1 万元 + 总市值不在底部 2%
- `univ_trade_base` = research + 非停牌 + 非一字涨/跌停 + 总市值不在底部 5%
- `univ_trade_hs300/zz500/zz1000` = trade_base ∩ 指数成分

**我已经抽象成 TypeScript** → 见 [src/lib/data/universe-rules.ts](../../src/lib/data/universe-rules.ts)

**实施优先级：极高**（直接 v0.7 集成）

### 模式 3 ⭐⭐：Parquet 分区 + DuckDB hive_partitioning

```sql
-- DuckDB 可以直接读 Hive 风格分区
SELECT * FROM read_parquet('data/daily_kline/date=*/data.parquet',
                            hive_partitioning=true)
WHERE trade_date >= '2024-01-01'
  AND ts_code = '600519.SH'
```

- 自动按 `date=YYYYMMDD` 切片
- 谓词下推：只扫匹配的 partition
- 我们在 Supabase 版本里对应：用 `trade_date` 作为分区键 + `partial index`

**实施优先级：中**（v1.0 优化用）

### 模式 4 ⭐⭐：增量同步 + 幂等

```python
# 关键模式
last = meta_store.get_last_date('daily_kline')
start = (last + timedelta(days=1)) if last else FIRST_DATE
for trade_date in trading_days_between(start, today):
    if partition_exists(trade_date):
        continue  # 幂等：跳过已写
    df = tushare.fetch_daily(trade_date)
    write_parquet(trade_date, df)
    meta_store.update_last_date('daily_kline', trade_date)
```

- 重复跑同样的命令永远安全
- 失败可重试不会写脏数据
- 进度可观测（last_date）

**实施优先级：中**（同步脚本时实施）

### 模式 5 ⭐：APScheduler 错峰

```python
scheduler.add_job(sync_basic,      CronTrigger(hour=22))     # 22:00
scheduler.add_job(sync_daily_kline, CronTrigger(hour=22, minute=30))  # 22:30
scheduler.add_job(sync_adj_factor, CronTrigger(hour=23))     # 23:00
```

我们 Vercel Cron 只有 1 个 job/Hobby plan，可以把多个同步串行在一个 `/api/cron/daily-sync` 里。

**实施优先级：中**（v0.7 同步脚本时）

---

## 5. 法律可克隆性

- **License 文件**：❌ 不存在
- **README badge**：写 "license-MIT-green"
- **GitHub 默认**：无 LICENSE = all rights reserved

矛盾状态：作者**意图**是 MIT（badge），但**未正式发布**（缺 LICENSE 文件）。

**安全策略**：
- ✅ Fork 个人学习 — 允许
- ✅ 学习架构思想 → 用 TS 重写 — 完全合法
- ❌ 直接 copy `.py` 文件到我们仓库 — 灰色
- 📨 可联系作者请求添加 LICENSE 文件（作者活跃，1 天前还 push，回复概率高）

**我的做法**：思想克隆，代码重写。Universe 规则是公共领域 quant 规则（不是 zer0quant 独创），重写没有版权问题。

---

## 6. 已完成的本地化操作

### 6.1 抽象克隆：[src/lib/data/universe-rules.ts](../../src/lib/data/universe-rules.ts)

把 `zer0share/universe.py` 的核心判定规则用 TypeScript 重写，可在浏览器 / Node / Edge runtime 都跑：

- `isAShareCommon()` — 普通 A 股主板（非 B 股、非 CDR）
- `isOldEnough()` — 上市 ≥ 6 个月
- `passesResearchMV()` / `passesTradeMV()` — 总市值不在底部 2% / 5%
- `isOnePriceLimit()` — 一字涨/跌停
- `classifyUniverse()` — 一次性返回 research/trade/HS300/ZZ500/ZZ1000 归属
- 完整 TypeScript 类型 + JSDoc + 来源注明（zer0share 思想 + 公共域 quant 规则）

### 6.2 文档：本报告

提交在 `docs/research/zer0share-analysis.md`。

### 6.3 暂未做的（留 v0.7 / v1.0）
- Supabase tushare_* 镜像表迁移
- CachedTushare API 封装
- Python 同步脚本 + Vercel Cron 接入

---

## 7. 行动建议（按优先级）

### 立刻可做（本周）
1. ✅ **已做：Universe 规则 TS 化** — 见上节
2. ⏳ **决定缓存策略**：Supabase Postgres vs Cloudflare R2 vs Vercel KV
3. ⏳ **设计 Supabase schema** mirroring Tushare 字段（参考 `fetcher.py` 的 _COLS 定义）

### v0.7（2-3 周）
4. 写 Python 同步脚本（Tushare → Supabase）
5. 配 Vercel Cron 或 Modal 跑同步（每日 23:00 CST）
6. 改造 `src/lib/data/sources/tushare.ts` → `CachedTushare` 优先查 Supabase
7. 监控 Tushare 积分用量（应该从 ~100/天 降到 ~1/天）

### v1.0（1-2 月）
8. Universe 选股进入 watchlist UI（"一键加入沪深 300"）
9. 全市场扫描功能（"找出所有 ROE > 20% 的 A 股"）
10. 全市场回测（Sentinel 信号在全 A 上的命中率）

### 可选（如果想认真做）
- 邮件作者请求 LICENSE（mailto: 公众号「极客投研笔记」）
- 整体迁移 fork 加 attribution，长期 sync 上游更新

---

## 8. 与 Financial-Query-Search 对比（连看两个项目的总结）

| 维度 | zer0share | Financial-Query-Search |
|-----|----------|----------------------|
| 解决的问题 | A 股本地数据管道 | 金融 Q&A 对话 |
| 对我们的杠杆 | **极高**（解决核心架构缺陷）| 中（提供编排模式参考）|
| 代码可复用度 | 高（universe 规则可直接 port）| 中（抽象 OK 但实现弱）|
| 项目成熟度 | 生产可用 | demo 级 |
| 推荐采纳方式 | 思想克隆 + 架构搬迁（v0.7）| 编排模式（v2.0 agentic）|

---

## 9. 评分总表

| 维度 | zer0share | 满分 |
|-----|----------|----|
| 产品成熟度 | 8 | 10 |
| 架构智慧 | **9** | 10 |
| 代码质量 | 8 | 10 |
| **测试覆盖** | **8** | 10 |
| License 友好度 | 3 | 10 |
| 文档（设计 + README）| 8 | 10 |
| 社区健康度 | 6 | 10（68 ⭐ 起步阶段）|
| **对 Stock Monitor 的战略价值** | **10** | 10 |
| **综合借鉴值** | **8.5** | 10 |

---

**报告完。**

主交付物：
1. 本报告：`docs/research/zer0share-analysis.md`
2. 抽象克隆：`src/lib/data/universe-rules.ts`（实施步骤 6.1）
