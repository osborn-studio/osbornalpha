# 统一数据源接入层 · P0 设计说明

日期：2026-11-24　依据：[方案](README.md)（负责人 2026-11-24 批准，范围 A + B，C 只读）
核对基线：`main` @ `efdc61b7`（方案里的调查取自 `a5868e93`，以下事实都在新基线上重新核对过）

P0 的约束只有一条：**不改变任何线上行为**。每个 PR 都要在描述里写明“什么没变、怎么证明的”。

## 1. P0 交付顺序

| PR | 内容 | 是否动运行时代码 |
|---|---|---|
| 1 | 方案入库 + 本说明 | 否 |
| 2 | 来源目录（代码）+ 校验测试；现有路由表行为不变，只是被目录校验 | 只新增文件 |
| 3 | Tushare 客户端合并：一个传输函数 + 一个限速器 | 是，逐字节等价测试 |
| 4 | SEC 客户端合并：一个传输函数 + 一个限速器 | 是，逐字节等价测试 |
| 5 | 数据集登记补全，每条登记带来源 | 是，字符串值不变 |
| 6 | 只读管理页 `/admin/sources`（先上画布） | 新增页面，仅管理员 |

## 2. 来源目录的形状

新文件 `src/lib/sources/catalog.ts`（不放进任何已有文件，原因见第 6 节）。目录是纯数据，不 import 任何客户端。

```ts
type SourceId = 'eastmoney' | 'sina' | 'tencent' | 'twse' | 'tpex' | 'eodhd' | 'datagateway'
              | 'tushare' | 'sec' | 'cninfo' | 'hkexnews' | 'fred' | 'akshare' | 'openfigi' | 'gleif' | …;

type DataDomain = 'quote' | 'kline_intraday' | 'kline_daily' | 'kline_weekly_monthly'
                | 'financial_facts' | 'filings' | 'documents' | 'entity_identifiers'
                | 'security_master' | 'industry_classification' | 'industry_marks'
                | 'macro_series' | 'filing_calendar' | 'company_snapshot';

interface Capability {
  domain: DataDomain;
  markets: readonly Market[];                    // 'A' | 'HK' | 'US' | 'TW' | 'JP' | 'KR'，或宏观的 'US' | 'CN'
  adjustments?: readonly ('qfq' | 'hfq' | 'none' | 'intraday')[];   // 只对 K 线有意义
  bars?: 'ohlcv' | 'close_only';                 // DataGateway 日线 = close_only
  role: 'primary_or_fallback' | 'fallback_only'; // close_only 一律 fallback_only
  dataClass: 'A' | 'B' | 'C';                    // 方案第 1 节的三类
}

interface SourceEntry {
  id: SourceId;
  name: { zh: string; en: string };
  aliases: readonly string[];                    // 路由表里实际出现的名字，如 'datagateway-wind'
  hosts: readonly string[];                      // 仅主机名，不含密钥
  credentials: readonly string[];                // 环境变量名，如 ['TUSHARE_TOKEN']；永不存值
  pacing: { minIntervalMs: number; scope: 'process' } | null;   // null = 无限速器（实时源靠超时和熔断）
  licence: { place: 'industry_dataset_licenses' | 'methodologies_licenses_json' | 'macro_catalog_rights' | 'none';
             keys: readonly string[] };          // 指向现有三处之一，目录不复制许可状态
  capabilities: readonly Capability[];
}
```

要点：

- **目录只描述，不决定。** P0 里路由仍由 `registry.ts` 和 `reliability.ts` 决定；测试把这两处产出的每一条路由拿去对目录，对不上就失败。
- **许可状态不抄进目录。** 目录只记“去哪一处、看哪个键”，状态仍从原处读，避免出现第四处。
- **凭据只记变量名。** 有一条测试断言目录里没有任何看起来像密钥的值，也不读 `process.env` 的值。

## 3. 校验测试（PR 2）

1. `quoteSourcesFor(market)` 在“已配置 / 未配置网关”两种环境下返回的每个名字，都能经别名映射到一个目录条目，且该条目对该市场有 `quote` 能力。
2. `klineProviderRoute(ticker, range, adjustment)` 对“每个市场的代表代码 × 每个区间 × 每种复权”的全部组合：每个名字在目录里有对应区间类别、对应市场、对应复权的能力。
3. 路由的第一位不能是 `fallback_only`（DataGateway 的日线是 `close_only`，因此永远排不到日线第一位；JP / KR 只有网关一个源，属于“唯一来源”，单独列为已知例外并写进测试）。
4. `hfq` 路由里只能出现目录中声明了 `hfq` 的来源（今天只有东方财富）。
5. 评分路由（`resolveScoringKline` 用的那一组，#316 引入）同样被检查。
6. 反向检查：故意构造的坏路由（网关做日线主源、新浪做后复权）必须被校验函数拒绝。
7. 扫描 `src/` 下对外请求的主机名，凡是属于数据供应商的都必须在目录的 `hosts` 里（LLM、邮件、支付等非数据主机列入豁免表）。

## 4. 统一来源接口（PR 3、4 落地，聚源日后照此接入）

批量类来源（B 类）的客户端都收敛到同一个形状：

```ts
interface SourceRequest { source: SourceId; label: string; url: string; init: RequestInit; timeoutMs: number }
interface SourceReply   { status: number; headers: Headers; bytes: Uint8Array; sha256: string; fetchedAt: string }
interface SourceDeps    { fetch?: typeof fetch; budget?: Budget; now?: () => number; sleep?: Sleep; pacer?: Pacer }

function sourceTransport(source: SourceId): (req: SourceRequest, deps?: SourceDeps) => Promise<SourceReply>
```

- 每个供应商一个模块级限速器（沿用 `createPacer`，串行放行），间隔取自目录。
- 传输层只做四件事：等限速、发请求、有界读取字节、算 sha256。**不解析、不重试、不缓存**；这些留在各调用方现有的封装里，所以调用方的错误类型、重试次数、缓存行为都不变。
- 错误信息是固定代码，响应正文和请求头永不进入错误信息或日志（请求头里可能有密钥或联系邮箱）。
- 测试一律注入 `fetch` 回放录制的夹具，CI 不发真实请求。

### 聚源客户端要满足的条件

1. 在目录里登记 `gildata` 条目：能力（行业聚合、估值、成分）、`credentials: ['GILDATA_API_KEY']`、限速值、许可指向（现行个人协议下为 `internal`，仅管理员可见）。
2. 所有请求都经 `sourceTransport('gildata')`，不自建 `fetch` 封装和限速器。
3. 密钥只放在 `Authorization` 请求头，不进 URL、不进错误信息、不进原始数据的元信息。
4. 返回原始字节和 sha256，入库走现有内容寻址存储；解析放在传输层之外。
5. 数据集名从 `src/lib/dq/datasets.ts` 取，登记时带 `source: 'gildata'`。
6. 类型放新文件，不改第 6 节列出的任何文件。
7. 测试用录制夹具；夹具里不得有密钥。

## 5. 现状盘点（`main` @ `efdc61b7`）

### 5.1 路由

| 数据 | 位置 | 顺序 |
|---|---|---|
| 报价 A / HK / US | `src/lib/data/sources/registry.ts` | [网关（已配置时）] → 东方财富 → 新浪 → 腾讯 |
| 报价 TW | 同上 | [网关] → TWSE |
| 报价 JP / KR | 同上 | [网关] → [EODHD（已配置时）] |
| 日 / 周 / 月线 A、HK | `src/lib/data/kline/reliability.ts` | 东方财富 → 腾讯 → [网关] |
| 日 / 周 / 月线 US | 同上 | 东方财富 → 新浪 → [网关] |
| 日线 TW | 同上 | TWSE 或 TPEx → [网关] |
| 日线 JP / KR | 同上 | 仅网关 |
| 后复权 A、HK | 同上 | 仅东方财富 |
| 分时 A | 同上 | [网关分时] → 东方财富 → 新浪 |
| 分时 HK、US | 同上 | [网关分时] → 东方财富 |
| 评分用日线 A、HK | 同上（`purpose: 'scoring'`） | 腾讯 → 东方财富 |
| 评分用日线 US | 同上 | 腾讯 → 新浪 → 东方财富 |

### 5.2 绕过路由、直接调供应商的调用方

| 调用方 | 直接调用 |
|---|---|
| `src/app/api/perspectives/[ticker]/route.ts` | 东方财富报价 |
| `src/lib/brief/composer.ts` | 东方财富报价 |
| `src/lib/signals/backtest.ts` | 东方财富 K 线 |
| `src/lib/signals/batchBacktest.ts` | 东方财富报价 |
| `src/lib/judgments/kline.ts` | 东方财富、网关日线（C 类，冻结输入，不动） |
| `src/app/api/quote/batch`、`radar/batch` | 走路由，另有 TWSE / 网关批量接口 |

P0 不改这些调用方（改了就是行为变化）；P1 再让 A 类的四个改走路由。

### 5.3 Tushare（一个主机 `api.tushare.pro`，四处发请求）

| 位置 | 函数 | 超时 | 限速 | 调用方 |
|---|---|---|---|---|
| `src/lib/data/sources/tushare.ts` | `tushareCall`（解析成行对象） | 8 s | 无 | `tushare-cached.ts` 的 17 个缓存封装 → 个股页、简报、观点 |
| 同上 | `tushareCallRaw`（保留字节和 sha256） | 30 s，受预算约束 | 调用方自带 | 财务事实 `tushare-statements.ts`（模块级限速器 **400 ms**）；行业 `tushare-industry.ts`（自己 `sleep` **350 ms**，与前者互不相通）；披露日历 `dq/calendar-deps.ts`（不限速） |
| `src/lib/securities/sources/tushare-client.ts` | `callTushare` | 10 s | 无 | 证券主数据 A / 可转债 / 基金 / 港股 |
| `src/app/api/diag/tushare/route.ts` | 路由内直接 `fetch` | 无 | 无 | 诊断接口 |

合并后：一个传输函数，一个进程级限速器，间隔取 **400 ms**（最保守值）。

### 5.4 SEC（`data.sec.gov`、`www.sec.gov`）

| 位置 | 用途 | 限速 |
|---|---|---|
| `src/lib/entities/identifiers/sec-submissions.ts` | submissions 快照（留原始字节） | 进程级 `secPacer` **120 ms** |
| `src/lib/facts/providers/edgar-companyfacts.ts` | companyfacts | 同一个 `secPacer` |
| `src/lib/dq/filer-categories.ts`、`dq/reconcile/pair-us-ixbrl.ts` | 文档 | 同一个 `secPacer` |
| `src/lib/industry/providers/sec-sic.ts` + `industry/sic.ts` | submissions 的 SIC、SIC 代码表 | 自己 `sleep` **150 ms**，不经 `secPacer` |
| `src/lib/documents/sources/edgar.ts`（经 `politeHttp`） | submissions 列表、filing index | 每个实例各自 **120 ms** |
| `src/lib/research/ingest/collectors/edgar.ts`（经 `createClient`） | submissions 列表、正文 | 每次运行各自 **120 ms** |
| `scripts/dq/*.ts` | 录夹具、抽样 | `secPacer` |

合并后：一个传输函数，全部经同一个 `secPacer`，间隔取 **150 ms**（最保守值；SEC 上限 10 次 / 秒）。

### 5.5 数据集登记

`src/lib/dq/datasets.ts` 登记了 22 个；下列数据集名在别处以字符串直写、没有登记：

`macro.fred`、`macro.akshare`、`judgments.settle`、`judgments.produce.macro_regime`、`judgments.calibrate`、`industry.agg.sw2021`、`industry.agg.sic`、`industry.sw2021.memberships`、`industry.sic.memberships`、`industry.sw2021.classifications`、`industry.sic.classifications`、`industry.sw2021.source`、`industry.marks`、`industry.official`、`issuers.a_stock`、`facts.hk`、`documents.candidates`、`documents.extract`，以及隔离区用的 `judgments`。

（完整清单由 PR 5 用程序扫描 `startBatch` / `recordAttempt` / 隔离写入的实参得出，以扫描结果为准。）

### 5.6 许可的三处

| 处 | 位置 | 键 |
|---|---|---|
| 行业 | 表 `industry_dataset_licenses`，闭集 `DATASET_KEYS`（`src/lib/industry/licenses.ts`） | 4 个：申万分类、SIC 分类、Tushare 每日指标、Tushare 申万日行情 |
| 判断 | `docs/methodologies/licenses.json` | `输入种类×来源`，如 `financial_fact×tushare` |
| 宏观 | `src/lib/macro/catalog.ts` 每条序列的 `rights` | `public_domain` / `official_open` / 第三方 |

## 6. 对旧调查的更正

1. **分析师评分已不再直连东方财富。** #316 之后 `src/lib/scoring/daily-bars.ts` 走 `resolveScoringKline`（腾讯 → [新浪] → 东方财富）；`score-store.ts`、`portfolio/review*.ts`、`scoring/forward.ts` 只引用了类型。方案 2 节“评分基准价每次从东方财富重读”应改为“每次经评分路由重读，命中的来源仍未留痕”。
2. **不能动的文件不止 3 个。** `macro_regime@v2` 的 `implementation_sha256` 覆盖其整个本地 import 闭包，实测 **30 个文件**（清单见 [frozen-files.txt](frozen-files.txt)），其中包括 `src/lib/data/sources/eastmoney.ts`、`src/lib/data/sources/datagateway.ts`、`src/lib/data/kline/types.ts`、`src/lib/dq/raw-store.ts`、`src/lib/dq/reconcile/types.ts`、`src/lib/supabase/database.types.ts`。改其中任何一个字节都会变公式哈希。所以目录和传输层都放新文件，东方财富和网关的客户端在 P0 里一行不改。
3. **Tushare 是四处发请求，不是三个客户端。** `tushare.ts` 自己就有两个互不相干的发送函数。限速器实际只有两个（400 ms 和 350 ms），另外两处完全不限速。
4. **SEC 的 `secPacer` 已经被 4 个模块共用**，游离在外的是三处：行业 SIC（150 ms）、文档流水线（每实例 120 ms）、研究采集器（每次运行 120 ms）。
5. **K 线路由有两套并行定义**：`klineProviderRoute`（只给名字，供接口元信息用）和 `providerDefinitions`（真正执行）。两者今天一致，但没有测试保证；PR 2 的校验同时覆盖两者并断言它们一致。
6. 报价路由里网关的名字是 `datagateway-wind`，K 线里是 `datagateway`；目录用别名把两者归到同一个来源。

## 7. 推迟到 P1 及以后

- 路由配置表和管理页上的修改控件（P1，需要 1 个迁移）。
- 让 5.2 节的四个 A 类调用方改走路由（P1，属于行为变化）。
- 报价 / K 线的来源健康指标持久化（P1）；P0 的管理页只显示已经有度量的部分（数据集新鲜度、最近批次），实时源的熔断状态是进程内存里的，无服务器环境下跨实例不可见，P0 不展示成“全局状态”。
- 评分基准价、退市表等的来源留痕（P2）。
- 东方财富、网关客户端并入统一传输层：受公式哈希闭包约束，需要与一次方法版本升级一起做，不在 P0。
- 文档流水线的巨潮、披露易两条重复流水线合并（P0 只做 Tushare 和 SEC）。
- 三处许可的统一存储（P4）；P0 只做只读汇总。
