# 第六站行情来源核查

核查日期：2026-09-22（America/Los_Angeles）。结论：Alpha 已有可复用的美股日线入口；本次新浪真实响应已取得，但尚没有满足 S6 全部要求的行情证据包。用户指示检查并复用现有接口，不等于声明所有供应商响应已通过拆股与时间口径验收。

## 已有实现

| 入口/来源 | 代码行为 | 对 S6 的限制 |
| --- | --- | --- |
| `GET /api/kline/[ticker]?range=all&adjust=none` | 返回 bars、source、currencyCode、timezone、fetchedAt、缓存/降级状态 | `fetchedAt` 不是逐日历史发布时间；US 分类不提供完整交易所身份凭据 |
| `src/lib/data/kline/reliability.ts` | 美股日线按 eastmoney → sina → 已配置 datagateway 尝试 | 必须记录实际命中的来源、失败与缓存状态，不能只记录预期来源 |
| `src/lib/data/sources/eastmoney.ts` | 日线 `klt=101`，不复权请求 `fqt=0`，按 105/106/107 市场前缀尝试 | 未保存实际命中的 secid；未返回拆股因子/完整公司行为历史 |
| `src/lib/data/sources/sina.ts` | `US_MinKService.getDailyK`，读取 d/o/h/l/c/v | `adjustment: none` 由适配器填写，上游响应没有对应证明字段；没有拆股证据 |
| `src/lib/data/sources/datagateway.ts` | `POST /v1/market-data/security-prices/history/query`；支持收盘价响应 | 收盘价可被补成 OHLC、volume=0；缺失 adjustment 时采用调用者预期值。这些回填不能充当原始行情口径证明 |
| `src/lib/data/sources/tushare.ts` | `dividend` 提供送转/派息字段 | 当前没有接入美股拆股证据链，不能直接用于 XNYS/USD/SPY 验收 |

## 本次真实探测

使用 `scripts/s6/probe-public-market.ts` 调用现有东方财富/新浪适配器；固定 IBM、SPY 两个符号，每次只取最近 5 个日线供能力检查。新浪端点实际返回完整历史，原始字节完整保留，随后由现有适配器截取 5 条。

- 新浪：IBM、SPY 均 HTTP 200，返回的最近日线范围均为 2026-09-16 至 2026-09-22。
- 东方财富：两个符号的三个现有市场前缀请求均连接失败。本次失败不代表服务全局不可用。
- DataGateway：当前执行进程没有成对的 URL/API key 配置；未调用。没有检查或修改线上部署凭据。
- 原始响应仅见 `a/c/d/h/l/o/v` 字段，没有可直接作为已验证拆股因子或历史发布时间的字段。
- 接收时间和原始响应 SHA-256 见 [探测记录](evidence/public-market-probe.json)。原始文件保存在本机私有目录 `/Users/osborn/Library/Application Support/OsbornAlpha/s6-acceptance/20260922/public-market-probe/`，按 SHA-256 命名。

真实数据只用于只读能力探测，未混入 S3.4 合成观察、未写入生产组合、未执行交易，也未标记为已通过 S6 的 MarketSnapshot。

## 接线与证据边界

继续复用现有 `/api/kline` 入口。`src/lib/research/s6/market.ts` 已提供有超时/体积限制、不跟随重定向的原始响应捕获，以及独立 `evidenceFor` 解析入口。没有可信证据解析器时拒绝冻结，不能默认 `split_factor=1`、填写 `verified=true` 或用现在的抓取时间倒填历史可用时间。

S6 真实行情捕获/冻结暂时明确拒绝 `datagateway` 来源，因为当前 DTO 无法区分收盘价派生 OHLC；普通行情展示仍保持现状。待 Gateway 提供可验证原始日线与来源证据合同后再开放，不能仅通过打开真实行情开关绕过这一限制。

完整真实验收还需补齐：

1. 来源确证的不复权口径及证券身份，实际来源/市场代码与原始响应可追溯。
2. 覆盖验收期间的拆股记录或已验证因子及证据引用；“没有返回拆股事件”不是“期间没有拆股”的证据。
3. 原始字节、抓取完成时间、哈希与逐条时间证据。当前抓取只能保守地证明当前可见；历史 as-of 需要当时的版本/发布记录，不能从交易日期推断。
4. 缺日、停牌、缓存降级、SPY 对齐与 5/20/60 窗口的实源回放验证。现有合成窗口测试不能替代这项验收。

本次核查已消除“Alpha 没有行情接口”的误判；剩余问题是接口的证据字段与实源口径，不再要求用户重新指定已有行情入口。

## 续做发现：真实基准身份与冻结政策冲突

发行人当前列出 SPY 的挂牌市场为 NYSE Arca（ARCX），而固定 S5 包只接受 XNYS security.exchange。Alpha 暂停所有非合成证券的评估行情抓取/冻结及新评估输入构建，返回 rule_unsupported；独立公开数据能力探针继续可用。详见 [官方来源、契约修订要求与回归清单](POLICY-NEXT.md)。这一问题需要新版本政策/引擎与发行人身份凭据，不能通过补一个因子或改旧 Observation 的 exchange 解决。
