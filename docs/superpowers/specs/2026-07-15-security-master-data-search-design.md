# osbornALPHA 证券主数据与稳定搜索设计

**日期：** 2026-07-15
**状态：** 已获产品方向批准，待规格复核
**范围：** 证券主数据、证券集合成员关系、搜索和股票池加入链路

## 1. 背景

当前 `stocks_universe` 表已经存在，但生产环境为 0 行。`GET /api/search`
仅搜索约 30 条内置样例和东方财富建议接口。东方财富超时、限流或漏数时，
`002463` 等合法 A 股代码会退化为“强制加入 -> 浏览器确认 -> 行情重试”。
加入后的名称又依赖浏览器 `localStorage` 中的自定义证券注册表，换设备或服务端
渲染时不能稳定复用。

这不是行情覆盖问题，而是证券身份主数据没有进入产品主链路。证券代码、名称、
交易所和上市状态应当先存在本地数据库；价格、财务和新闻仍按需从外部数据源读取。

## 2. 已批准覆盖范围

主数据只收录可在产品中搜索和加入股票池的证券：

1. 全部在市 A 股公司股票，包括主板、创业板、科创板和北交所。
2. 全部 A 股场内挂牌基金，包括 ETF、LOF、封闭式基金和基础设施 REITs，
   不包括只能场外申购赎回的基金。
3. 在市可转债。
4. 香港交易所主板公司股票，不包括 GEM、权证、牛熊证、债券和其他衍生品。
5. S&P 500 当前全部成分证券。指数可能因双重股权类别而超过 500 个 ticker。
6. NASDAQ 上市普通股按每日收盘总市值排名前 500。
7. NYSE、NASDAQ 和 NYSE American 上市的中概普通股与 ADR，不包括 OTC。

以下内容不在本期范围：实时行情落库、场外基金、港股 GEM、美国 OTC、期权、
期货、权证和完整全球股票库。

## 3. 目标与成功标准

### 3.1 产品目标

- 输入 `002463`、`002463.SZ` 或公司名称时稳定返回同一条证券主数据。
- 已知证券只需点击一次即可加入股票池，不出现强制加入确认框。
- 行情源故障不阻止加入；卡片先显示正确身份，再异步显示行情。
- 新股、更名、退市和集合变更在一个工作日内自动反映。
- 搜索不再把单个外部建议接口当作可用性的前置条件。

### 3.2 服务指标

- 精确代码搜索暖态 P95 小于 200 ms。
- 名称和拼音搜索暖态 P95 小于 300 ms。
- 本期覆盖范围内精确代码的本地命中率不低于 99.9%。
- 外部搜索全部不可用时，本地已同步证券仍可搜索和加入。
- 上线后 7 天内 `stock_force_added / stock_search_submitted` 比率下降至少 90%。
- 主数据同步失败时继续提供最后一次有效快照，不清空线上结果。

## 4. 方案选择

### 4.1 方案 A：Supabase 主数据和每日同步（采用）

把稳定的证券身份保存在 Supabase，使用受保护的后台任务做全量快照同步和增量
状态更新。搜索本地优先，外部接口只用于异常补查。这一方案首次开发量较大，但
搜索延迟、数据一致性和运维能力最好。

### 4.2 方案 B：仓库静态 JSON（不采用）

读取速度快，但新股、更名和退市都要求修改仓库并重新部署；多市场数据会迅速
膨胀，也无法提供同步审计和最后有效快照。

### 4.3 方案 C：外部搜索加命中缓存（不采用）

改动较少，但冷查询仍依赖外部服务，不能解决 `002463` 第一次搜索失败的问题。
缓存还会把上游错误长期固化。

## 5. 数据模型

### 5.1 扩展 `stocks_universe`

继续使用现有公共参考表，每个 canonical ticker 一行：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ticker` | text PK | 标准代码，如 `002463.SZ`、`00700.HK`、`AAPL` |
| `symbol` | text | 不带市场后缀的交易代码 |
| `name` | text | 产品主要展示名称 |
| `name_en` | text nullable | 英文名称 |
| `full_name` | text nullable | 公司或基金全称 |
| `pinyin` | text nullable | 中文拼音或拼音首字母 |
| `market` | `market_t` | `A`、`HK` 或 `US` |
| `exchange` | text | `SSE`、`SZSE`、`BSE`、`HKEX`、`NASDAQ`、`NYSE`、`AMEX` |
| `asset_type` | text | 沿用现有契约：`stock`、`etf`、`convertible_bond`、`fund`、`index`、`unknown` |
| `fund_subtype` | text nullable | `etf`、`lof`、`closed_end`、`reit`、`other_exchange_fund` |
| `instrument_form` | text nullable | `common_stock`、`adr`、`share_class`、`fund_unit`、`bond` |
| `currency` | text | `CNY`、`HKD` 或 `USD` |
| `country_code` | text nullable | 发行人或主要经营地国家代码 |
| `industry` | text nullable | 来源提供的行业 |
| `list_status` | text | `listed`、`paused`、`delisted`、`pending` |
| `list_date` | date nullable | 上市日期 |
| `delist_date` | date nullable | 退市日期 |
| `is_active` | boolean | 是否进入默认搜索结果 |
| `source` | text | 当前身份记录的权威来源 |
| `source_updated_at` | timestamptz | 上游数据时间 |
| `metadata` | jsonb | 通过 schema 校验的供应商扩展字段 |
| `updated_at` | timestamptz | 本地最后更新时间 |

现有 `last_price` 不参与主数据同步，也不作为搜索正确性的条件。本期保留该字段以
避免无关迁移，后续单独决定是否废弃。

`asset_type` 不扩展新枚举，避免破坏当前 `AssetType` 的前后端契约。ADR 使用
`asset_type=stock, instrument_form=adr`；LOF、封闭式基金和 REITs 使用
`asset_type=fund` 并通过 `fund_subtype` 区分；ETF 保持 `asset_type=etf`。新增字段在
旧客户端中均为可选字段。

索引：

- `ticker` 和 `symbol` 的 B-tree / prefix 索引。
- `market, asset_type, is_active` 组合索引。
- `name`、`name_en`、`pinyin` 的 `pg_trgm` GIN 索引。
- 所有公开读取继续使用 RLS；浏览器没有写权限。

### 5.2 新建 `security_aliases`

保存用户可能输入的不同代码形式，避免依赖前缀猜市场：

| 字段 | 说明 |
| --- | --- |
| `alias` | 归一化后别名，复合主键的一部分 |
| `ticker` | 外键到 `stocks_universe.ticker` |
| `alias_type` | `symbol`、`vendor`、`former_symbol`、`name`、`pinyin` |
| `source` | 别名来源 |

示例：`002463`、`sz002463` 和 `002463.SZ` 都映射到 `002463.SZ`；
`BRK-B`、`BRK/B` 映射到产品 canonical ticker `BRK.B`。

复合主键为 `(alias, ticker, alias_type)`，并分别索引 `alias` 和 `ticker`。名称、旧代码
以及跨市场纯数字输入可能合法地对应多只证券，因此 alias 不要求全局唯一。exact
canonical ticker 永远优先；alias 命中多条时必须返回候选让用户选择，不能静默加入。

### 5.3 新建 `security_universe_memberships`

证券身份和动态集合成员关系分离。主键为 `(ticker, universe)`：

| 字段 | 说明 |
| --- | --- |
| `ticker` | 证券代码 |
| `universe` | `a_stock`、`a_exchange_fund`、`a_cb`、`hk_main`、`sp500`、`nasdaq_top500`、`us_china` |
| `rank` | NASDAQ 市值排名，其他集合可为空 |
| `market_cap_usd` | 排名时使用的美元市值；无法可靠换算时为空且不参与排名 |
| `as_of_date` | 集合快照日期 |
| `is_active` | 当前是否属于集合 |
| `source` | 集合来源 |
| `updated_at` | 本地更新时间 |

同一证券可以同时属于多个集合，搜索结果只出现一次。集合变化覆盖当前状态，不在
本期保存每日排名历史；同步运行记录保留每次变化数量。

### 5.4 新建 `security_sync_runs`

每个来源和集合的同步任务写一行：

- `source`、`scope`、`status`。
- `started_at`、`completed_at`、`source_as_of`。
- `fetched_count`、`accepted_count`、`inserted_count`、`updated_count`、
  `deactivated_count`。
- `error_code` 和经过清洗的 `error_message`。
- `checksum`，用于判断重复快照和幂等性。
- `snapshot_path`，指向私有对象存储中的规范化有效快照。

该表仅管理员可读，仅服务角色可写。

### 5.5 新建 `security_discovery_candidates`

外部 fallback 只负责发现候选，不直接修改主数据：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID 主键 |
| `normalized_query` | 触发补查的清洗后查询词 |
| `proposed_ticker` | adapter 给出的 canonical ticker |
| `source` | 候选来源 |
| `normalized_payload` | 通过候选 schema 校验后的最小身份字段 |
| `status` | `pending`、`verified`、`promoted`、`rejected` |
| `seen_count` | 重复发现次数 |
| `first_seen_at`、`last_seen_at` | 首次和最近发现时间 |
| `review_reason` | 自动或人工验证结果，不保存凭据和原始响应体 |

服务端按 `(proposed_ticker, source)` 幂等写入。每日同步使用已批准的数据源交叉验证；
只有验证通过并满足所属 scope 规则的候选才能在同一事务中写入主表并标记
`promoted`。浏览器无读写权限，普通 fallback 产生的未验证候选不能因单次搜索直接
提升；第 10.1 节的“已批准身份主源 exact resolve”属于同步逻辑的受限即时执行。

### 5.6 新建 `security_sync_staging`

批量同步跨多个 HTTP 请求和数据库连接，不能使用 session-local PostgreSQL 临时表。
staging 使用持久表并由服务角色隔离：

| 字段 | 说明 |
| --- | --- |
| `run_id` | 外键到 `security_sync_runs` |
| `record_kind` | `security`、`alias`、`membership` |
| `natural_key` | 对应记录的稳定业务键 |
| `normalized_payload` | 通过对应 schema 校验后的规范化记录 |
| `created_at` | 写入时间 |

主键为 `(run_id, record_kind, natural_key)`。事务函数只读取状态为 `staged` 且属于该
run 的记录；成功后立即清理，失败或 rejected 的 staging 最长保留 24 小时供诊断后
自动删除。该表不开放匿名或登录用户访问。

## 6. Canonical ticker 规则

- 上交所：`600519.SH`。
- 深交所：`002463.SZ`。
- 北交所：`430047.BJ`。
- 港股：五位补零并添加 `.HK`，例如 `00700.HK`。
- 美股：大写交易所 symbol，不额外添加市场后缀，例如 `AAPL`、`BABA`、`BRK.B`。
- 基金和可转债沿用交易所后缀，由主数据决定类型，不仅靠代码前缀推断。

所有供应商格式先经过独立 adapter，再进入统一模型。供应商原始代码只写入 alias，
不进入用户股票池。

## 7. 数据来源

### 7.1 A 股、场内基金和可转债

主来源为现有 Tushare 凭据：

- `stock_basic(list_status='L')`：在市 A 股。
- `fund_basic(market='E', status='L')`：全部在市场内基金身份基线。
- `etf_basic(list_status='L')`：ETF 的确定性子集与 ETF 专属字段。
- `cb_basic`：可转债历史列表，保留 `list_date <= today` 且 `delist_date` 为空或晚于
  今天的记录为 active。

2026-07-15 只读探测返回 5,528 只在市 A 股、2,142 只场内基金、1,606 只明确
ETF，以及 1,146 条可转债历史记录；按日期筛选后有 353 只 active 可转债。现有
token 对这些接口均有权限。

`fund_basic.fund_type` 是投资类型，不能用来判断 ETF、LOF 或封闭式基金。分类规则为：

1. 命中 `etf_basic` 的记录标记为 `asset_type=etf, fund_subtype=etf`。
2. `fund_basic.fund_type=REITs` 的记录标记为 `asset_type=fund, fund_subtype=reit`。
3. 其余场内基金通过上交所、深交所产品分类或经过代码审查的版本化映射区分
   `lof` 和 `closed_end`；没有可靠分类时使用 `other_exchange_fund`，但仍以
   `asset_type=fund` 进入搜索，避免因为展示分类缺失造成合法场内代码零结果。
4. 名称包含 `ETF`、代码前缀或投资风格只能做校验信号，不能单独决定分类。

Tushare 官方 `stock_basic` 文档建议一次拉取全市场后保存到本地使用；`fund_basic`
文档明确 `market=E` 表示场内，ETF 专题另有 `etf_basic`：
https://tushare.pro/document/1?doc_id=25
https://tushare.pro/document/1?doc_id=19
https://tushare.pro/document/2?doc_id=385

### 7.2 港股主板

Tushare `hk_basic(list_status='L')` 提供名称和上市状态，2026-07-15 探测返回
2,751 行，其中主板 2,444 行、GEM 307 行。同步时只接受 `market=主板` 的公司股票。

HKEX `Full List of Securities` 用于校验交易板块和证券类型；GEM、ETF、权证、
债券和衍生品不得进入 `hk_main`：
https://www.hkex.com.hk/services/trading/securities/securities-lists?sc_lang=en

### 7.3 美国交易所基础代码和市值

NASDAQ Trader Symbol Directory 提供 NASDAQ 和其他美国交易所代码、ETF 标志、
测试证券标志和状态，是交易代码身份基线：
https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs

NASDAQ 官方 screener adapter 提供名称、国家、行业和市值。2026-07-15 探测结果：

- NASDAQ：4,136 行，4,133 行有市值。
- NYSE：2,716 行，2,336 行有市值。
- AMEX / NYSE American：292 行，275 行有市值。

Screener 是可替换 adapter，不作为唯一代码基线。请求失败、字段变化或数量保护未
通过时保留最后有效快照。后续更换为付费美国基础数据源时不改变数据库和搜索接口。

### 7.4 S&P 500

成员关系来自 S&P Dow Jones Indices 发布的当前成分资料。官方页面当前显示 503 个
成分证券，并说明指数按季度再平衡：
https://www.spglobal.com/spdji/en/indices/equity/sp-500/

同步 adapter 每日检查变化，但只在合法完整快照通过校验后更新。若自动下载受格式
或授权限制，则使用经过来源日期和 checksum 标记的官方快照文件作为最后有效版本，
不得改用搜索结果拼凑成分列表。

商业化或公开再分发前，数据授权复核是发布门禁。产品只保存搜索所需的证券身份、
当前成员关系和来源日期，不对外提供来源文件下载。

### 7.5 NASDAQ 市值前 500

从 NASDAQ Symbol Directory 中选择 NASDAQ 正常上市、非测试、非 ETF 的普通股或
ADR，排除 unit、权证、优先股和债务证券。与 screener 的美元市值连接后，按
`market_cap_usd DESC, ticker ASC` 稳定排序并取前 500；市值为空的证券不参与排名。
每个上市 ticker 独立排名，双重股权类别不按发行人合并。使用稳定 ticker 作为连接键，
并对供应商连字符、斜线和点号做 alias 映射。

### 7.6 美国中概股和 ADR

本期采用明确、可审计的产品口径：

1. 交易所必须为 NYSE、NASDAQ 或 NYSE American。
2. 证券必须为普通股或 ADR。
3. screener `country` 为 China 或 Hong Kong，或者命中经过代码审查的中概人工
   include 列表；注册在开曼等地但主要经营和管理在中国的发行人依赖 include 进入。
4. ETF、SPAC unit、权证、优先股、债券和 OTC 全部排除。
5. 人工 exclude 列表可以修正仅在中国有少量业务但不属于中概的公司。

2026-07-15 初步 country 过滤得到 NASDAQ 308、NYSE 29、AMEX 5 条；最终数量会在
证券类型过滤和人工修正后下降。人工覆盖文件必须记录理由、来源 URL、审核日期和
审核人，不能只保存 ticker。每周把交易所当前代码、country 过滤结果和版本化人工
参考集做三方 reconciliation；存在未分类或身份冲突时 `us_china` 同步标记 degraded
并告警，不得宣称“全量完成”。本规格中的“全部中概股”定义为上述可审计并集在三家
候选并集与三家交易所当前普通股/ADR 清单的交集，而不是仅靠注册地字段推断。

## 8. 同步架构

### 8.1 初次回填

提供只在服务端运行的 CLI：

```text
npm run securities:sync -- --scope all --dry-run
npm run securities:sync -- --scope all --apply
```

`dry-run` 输出各范围数量、重复代码、字段缺失、将新增/更新/停用的数量，不写库。
`apply` 创建 `security_sync_runs`，分批写入 staging，再调用数据库事务函数完成 upsert
和成员差异更新。

### 8.2 每日任务

- 北京时间 05:30：A 股、场内基金、可转债和港股身份同步。
- 北京时间 08:30：美国代码、市值、S&P 500、NASDAQ Top 500 和中概集合同步。
- 所有 Cron 路由要求 `CRON_SECRET`，不接受客户端 token 或任意来源 URL。
- 单一 scope 失败不阻止其他 scope；每个 scope 独立记录运行结果。

### 8.3 快照发布流程

1. Fetch：外部 adapter 拉取原始快照。
2. Normalize：转为 canonical 模型和 alias；中文名称生成全拼和首字母 alias。
3. Validate：执行数量、字段、重复和停用比例门禁。
4. Stage：按 `run_id` 批量写持久 staging 表并计算 checksum。
5. Archive：把规范化有效快照写入私有对象存储，以 scope、来源日期和 checksum
   命名并保留 30 天；归档失败时不进入 Commit。
6. Commit：事务内 upsert 主数据、alias 和集合成员。
7. Finalize：标记 sync run 成功并清理 staging。

事务失败时不改变线上 active 集合。不得在 fetch 开始前把旧行批量标为 inactive。

身份停用和集合退出分开处理：动态集合可在完整快照通过门禁后更新 membership；证券
`is_active` 只有在主来源明确给出退市/摘牌状态，或连续两次成功快照缺失且由第二来源
确认后才能关闭。screener 缺行、市值为空或单次网络缺失不能停用证券身份。

## 9. 数据安全门禁

首次回填最低数量：

| scope | 最低可接受数量 |
| --- | ---: |
| `a_stock` | 5,000 |
| `a_exchange_fund` | 1,800 |
| `a_cb` active | 300 |
| `hk_main` | 2,200 |
| NASDAQ 代码基线 | 4,000 |
| `sp500` | 490 |
| `nasdaq_top500` | 500 |
| `us_china` | 200 |

后续运行还必须满足：

- 接受数量不低于最近成功快照的 80%。
- 非动态集合单次停用比例不超过最近成功快照的 5%。
- S&P 500 单次成员变化不超过 5%，NASDAQ Top 500 不超过 15%。
- ticker、name、market、exchange 和 asset_type 必填。
- canonical ticker 不得重复；同一来源的 primary vendor identity 不得映射到多个
  canonical ticker。普通名称和跨市场 symbol alias 允许一对多，但必须标记歧义。
- 任何门禁失败都把 run 标记为 rejected，并继续服务旧快照。

管理员可以显式 override 被拒绝的同步，但 override 必须记录原因；Cron 不具备自动
override 能力。

## 10. 搜索和加入数据流

### 10.1 搜索

`GET /api/search?q=<query>&limit=<n>` 保持无副作用，只读取本地主数据：

1. 清理输入并生成可能的 alias key。
2. 查询 exact alias / ticker。
3. 查询 ticker prefix、名称、英文名和拼音。
4. 对结果按 exact、prefix、name、pinyin、fuzzy 顺序评分。
5. 默认只返回 `is_active=true`；完整 ticker 可返回 inactive 结果并明确标记状态。
6. 本地有结果时立即返回，不等待东方财富。

当 GET 零结果且输入像完整代码时，客户端在同一加载状态内自动调用已认证的
`POST /api/securities/resolve`，请求体为 `{ query }`：

1. 在 1.5 秒预算内调用对应市场的已批准身份主源做 exact resolve。
2. 只有主源返回唯一证券，并且能证明它属于至少一个已批准 scope，才允许即时提升。
3. 服务端复用同步 normalize、validate 和 writer，在事务中写入主数据、alias 和
   membership，然后把它作为 `selectable=true` 结果返回。
4. 主源无法验证时才调用普通外部搜索做发现。候选通过 schema 和 canonical 校验后
   标记 `source=external-unverified, selectable=false`，并由该 POST 幂等写入
   `security_discovery_candidates`。
5. 未验证候选经后续同步交叉验证后才能进入主表。浏览器不写 `localStorage`，也不能
   把 `selectable=false` 的结果强制加入股票池。

GET 不写数据库，所有自愈和候选入队副作用都在 POST 内完成。POST 通过主表、alias、
membership 和 candidate 的自然键 upsert 保证重试不产生重复记录，并要求登录、按用户
和 IP 限流、客户端 debounce 以及短期否定缓存，防止零结果查询被用来放大外部请求。

返回结构保留现有 `t/n/py/m/asset_type` 字段以兼容客户端，并增加：

```json
{
  "source": "security-master",
  "stale": false,
  "results": [
    {
      "t": "002463.SZ",
      "n": "...",
      "py": "...",
      "m": "A",
      "asset_type": "stock",
      "exchange": "SZSE",
      "list_status": "listed",
      "match_kind": "exact",
      "verification_status": "verified",
      "selectable": true
    }
  ]
}
```

### 10.2 加入股票池

- 用户选择搜索结果后直接写入 `watchlist_items`，不再二次确认。
- 服务端再次解析 ticker 并验证主数据存在，防止客户端伪造名称和市场。
- 客户端只允许选择 `selectable=true`；即时自愈产生的记录已在返回前进入主表，因此
  与日常本地命中使用同一加入链路。
- `POST /api/watchlist` 和 `/api/watchlist/sync` 的所有新增路径执行同一验证。初始主数据
  回填并核对历史股票池后，为 `watchlist_items.ticker` 添加到 `stocks_universe.ticker`
  的 `ON DELETE RESTRICT` 外键，防止未来旁路写入未知代码。新加入还要求主数据
  `is_active=true` 且身份已验证。
- 股票池读取时批量关联 `stocks_universe`，名称不依赖设备 localStorage。
- 行情请求与加入操作解耦。行情失败时仍渲染证券名称、代码、市场和资产类型，并显示
  “行情暂不可用”。自动重试行情不能重复写 watchlist item。
- “强制加入未知代码”从普通用户产品中删除。管理员诊断页只能把未知代码提交到
  discovery candidate，不能绕过主数据直接写入用户股票池。

## 11. API 与模块边界

建议模块：

- `src/lib/securities/model.ts`：canonical 类型和校验。
- `src/lib/securities/normalize.ts`：跨供应商代码归一化。
- `src/lib/securities/search.ts`：数据库查询和排序。
- `src/lib/securities/discovery.ts`：fallback 候选入队、去重和验证状态转换。
- `src/lib/securities/sync/*`：每个来源一个 adapter，不直接依赖 UI。
- `src/app/api/search/route.ts`：HTTP 参数、错误映射和遥测。
- `src/app/api/securities/resolve/route.ts`：已认证、限流、可重试的 exact 自愈和候选入队。
- `src/app/api/watchlist/route.ts` 和 `sync/route.ts`：所有新增入口在写入前验证 canonical
  ticker 在主数据中存在且可选择。
- `src/app/api/cron/securities-sync/route.ts`：受保护同步入口。
- `scripts/securities-sync.ts`：dry-run 和人工回填入口。

adapter 统一返回：

```ts
interface SecuritySnapshot {
  source: string;
  scope: SecurityUniverse;
  asOf: string;
  securities: NormalizedSecurity[];
  memberships: NormalizedMembership[];
}
```

adapter 不写数据库；验证器不发网络请求；数据库 writer 不理解供应商字段。

## 12. 安全与权限

- `stocks_universe`、active alias 和 active membership 允许匿名只读。
- 所有写操作仅允许服务角色，服务角色只能存在于服务器、CLI 和受保护 Cron。
- `security_sync_runs` 的错误信息必须去除 URL 查询参数、token 和原始响应体。
- `security_discovery_candidates` 和同步快照均为私有数据，浏览器不可读写；快照按
  30 天生命周期自动删除。
- `security_sync_staging` 仅服务角色可访问，失败记录在 24 小时后删除。
- `POST /api/securities/resolve` 要求登录、用户/IP 速率限制和总超时；客户端
  不能指定 adapter、来源 URL、scope 或任意 metadata。
- 搜索参数限制长度、结果上限和允许字符，数据库 RPC 使用参数绑定。
- 外部响应先做 schema 校验，不把任意 JSON 写入 `metadata`。
- 人工中概覆盖文件进入 Git 审查，不通过管理页面直接编辑。

## 13. 可观测性

管理员仪表盘增加：

- 各 scope 当前 active 数量、最后成功时间、数据年龄。
- 最近同步 fetched / accepted / changed / deactivated 数量。
- rejected 和 failed run 的清洗错误码。
- 搜索本地命中率、零结果率、外部 fallback 率和强制加入率。
- exact 搜索 P50 / P95 延迟。
- `002463`、`113001`、`00700`、`AAPL`、`BABA` 五个生产 canary。

告警条件：任一核心 scope 超过 36 小时没有成功快照、同步被门禁拒绝、exact canary
无结果、搜索零结果率较 7 日基线增加 50%，或 force-add 比率回升。

## 14. 测试策略

### 14.1 单元测试

- A/HK/US canonical ticker 和 alias 归一化。
- ETF、LOF、封闭式基金、REITs、可转债、普通股和 ADR 分类；验证 ETF/ADR 不会
  扩展现有 `asset_type` 枚举。
- 名称、拼音、代码 prefix 和 exact 排序。
- 中概 include/exclude 规则和 NASDAQ Top 500 排名。
- 数量骤降、停用比例、重复 alias 和缺字段门禁。

### 14.2 集成测试

- staging 到主数据、alias、membership 和候选状态的事务 upsert 与幂等重跑。
- `GET /api/search` 不产生写操作；重复 resolve POST 只生成一条主数据和成员记录。
- 一个 scope 失败不会停用其他 scope 或旧数据。
- 匿名只能读取，不能修改主数据。
- `GET /api/search` 在外部 adapter 超时情况下仍返回本地结果。
- 股票池加入后即使行情 503，也只产生一条 watchlist item。

### 14.3 固定验收样本

至少覆盖：

- `002463` / `002463.SZ`：深市中小板历史代码体验用例。
- `600519`：沪市股票。
- `430047`：北交所股票。
- `510300`、`159915`：场内 ETF。
- `113001`：可转债。
- `00700`：港股主板。
- `AAPL`：NASDAQ / S&P 500。
- `BRK.B`：美股类别代码 alias。
- `BABA`：NYSE 中概 ADR。
- `PDD`：NASDAQ 中概股。

每个样本必须验证代码、名称、市场、资产类型、集合标签和一键加入。中文展示名称的
断言使用同步 fixture，不在测试中实时访问外部服务。

## 15. 上线计划

### 15.1 osstack 交付门禁

本项目由 osstack 卡片 `card_d3e2dd44` 跟踪，状态流转必须有对应证据：

- `todo`：本规格等待用户批准；此阶段不改生产数据库或 Vercel。
- `ready`：规格批准并生成逐任务实施计划，明确迁移、代码、测试和回滚负责人。
- `running`：在隔离 worktree 中开发；每个阶段由 osstack 记录执行、测试和评审结果。
- `blocked`：数据授权、生产凭据或门禁失败时停止部署，并记录可操作的解除条件。
- `done`：代码评审、全量验证、生产部署和部署后冒烟检查全部通过，并保存 proof pack。

开发代理不能自行把“构建通过”视为上线批准。部署阶段必须读取本规格第 17 节门禁，
由独立 verify/review 步骤确认后才能执行 Vercel 生产发布和数据库 apply。

### 15.2 发布顺序

1. 添加数据库字段、alias、membership、sync run、candidate、staging 和事务函数。
2. 添加 adapter、normalize、validate、CLI 和测试。
3. 在生产库执行全量 dry-run，保存输出但不改搜索。
4. apply 初始快照，核对数量、抽样和 checksum；解析全部历史 `watchlist_items`。本期
   范围外或暂时无法验证的历史 ticker 创建 `is_active=false, list_status=pending,
   source=legacy-watchlist` 的最小身份行，只用于保留既有展示和外键，不进入搜索或允许
   新增。确认没有删除用户数据后添加并验证 ticker 外键。
5. 用 `SECURITY_MASTER_SEARCH_ENABLED` 开启双读：旧搜索响应用户，新搜索只记录差异。
6. 观察 exact 命中、零结果和延迟，修复差异。
7. 切换为主数据优先，保留东方财富 fallback。
8. 切换股票池名称解析，停止新增 browser custom-stock 记录。
9. 启用两个每日 Cron 和管理员同步健康面板。
10. 生产监控至少 24 小时后删除旧 mock-first 分支和普通用户强制加入入口；管理员仅
    保留 candidate 诊断能力。

## 16. 回滚

- 搜索回滚：关闭 feature flag，立即恢复旧搜索实现。
- 数据回滚：主数据迁移为增量结构，不在紧急回滚中删表；旧应用会忽略新字段。
- 同步回滚：禁用 Cron，继续读取最后成功快照。
- 错误快照：由管理员显式选择错误 run 之前的最近已知正常
  `security_sync_runs.snapshot_path`，从私有对象存储重放规范化快照；若已超过 30 天
  保留期，则从数据库备份恢复。不得通过反向猜测成员差异回滚。
- 用户 `watchlist_items` 不随主数据同步删除，退市证券仅显示 inactive 状态。

## 17. 验收门禁

上线必须同时满足：

- 数据库迁移 dry-run 与 apply 成功，RLS 测试通过。
- 所有 scope 通过最低数量和相对数量门禁。
- 所有历史 `watchlist_items.ticker` 都能关联已验证身份或 inactive legacy 身份，外键
  生效且没有删除用户记录；legacy 身份不能被新加入。
- `stocks_universe` active 去重总数不少于 10,000；`nasdaq_top500` 恰好 500 条且重复
  排名得到相同顺序。
- `us_china` reconciliation 没有未分类、身份冲突或 OTC 证券；所有人工覆盖项都有
  来源和审核记录。
- 固定验收样本全部本地命中。
- `002463` 从输入到加入不出现 confirm、不触发 force-add。
- `GET /api/search` 的数据库写入计数保持为 0；重复 resolve 不产生重复证券或成员记录。
- 关闭外部搜索和行情网络后，主数据搜索与加入仍成功。
- 全量单元、集成、类型和生产构建通过。
- 移动端与桌面端搜索结果不溢出，长名称和资产标签可读。
- Vercel 生产部署 Ready，Cron 鉴权、同步日志和管理员健康面板可用。
- 发布后 30 分钟无新增 500、无批量停用、无主数据读取错误。
