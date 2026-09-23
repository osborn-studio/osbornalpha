# 实时行情 API 对接说明

> 适用范围：外部合作方、脚本、Agent 或其他服务读取 osbornalpha 的实时/准实时股票快照。
>
> 生产 Base URL：`https://stock-monitor-nu.vercel.app`
>
> 最后更新：2026-09-23

## 1. 对接结论

- osbornalpha 提供 **REST 快照接口**，不是 WebSocket/SSE 推送接口。
- 行情源优先使用服务端已接入的 **DataGateway/Wind**；失败时自动回退到 Eastmoney、Sina、Tencent、TWSE 或 Tushare（按市场决定）。
- 行情接口当前**无需调用方鉴权**，也不需要向调用方提供 DataGateway 地址或 API Key。
- 推荐由对方**服务端调用**。当前接口没有开放 CORS 响应头，浏览器从其他域名直接跨域调用会被拦截；如必须浏览器直连，需要我们在服务端按对方 Origin 增加白名单。
- 当前是“服务端秒级快照 + 30～60 秒缓存”的准实时模式，不承诺逐笔/Level-2/推送级实时性。

DataGateway 的上游调用链如下，这部分只在 osbornalpha 服务端内部使用：

```text
对方系统 -> osbornalpha /api/quote/* -> DataGateway/Wind -> 本机 WindPy
                                      \-> 公开行情源回退
```

## 2. 接入配置

对方只需要配置：

```text
BASE_URL=https://stock-monitor-nu.vercel.app
AUTH=none
```

不要向对方提供：

```text
DATAGATEWAY_BASE_URL
DATAGATEWAY_API_KEY
DATAGATEWAY_REALTIME_QUOTE_PATH
```

如果后续要改为私有接入，可在现有接口前增加合作方 API Key、IP allowlist 或网关限流；当前生产版本尚无这层配置。

## 3. 标的代码格式

| 市场 | 格式 | 示例 |
|---|---|---|
| A 股 | 6 位代码 + `.SH` / `.SZ` / `.BJ` | `600519.SH`、`000001.SZ`、`830799.BJ` |
| 港股 | 4～5 位代码 + `.HK` | `0700.HK`、`00700.HK` |
| 美股 | 大写 ticker | `AAPL`、`NVDA` |
| 台股 | 代码 + `.TW` / `.TWO` | `2330.TW`、`6488.TWO` |
| 日股 | 代码 + `.T` | `7203.T` |
| 韩股 | 代码 + `.KS` / `.KQ` | `005930.KS` |

## 4. 单标的行情

```http
GET /api/quote/{ticker}
```

示例：

```bash
curl -sS 'https://stock-monitor-nu.vercel.app/api/quote/600519.SH'
```

成功响应示例：

```json
{
  "source": "datagateway-wind",
  "ticker": "600519.SH",
  "name": "贵州茅台",
  "market": "A",
  "currency": "¥",
  "price": 1252.79,
  "change": 4.16,
  "change_pct": 0.33,
  "open": 1248.0,
  "high": 1258.0,
  "low": 1244.0,
  "prev_close": 1248.63,
  "volume": 123456,
  "amount": 154321000,
  "updated_at": "2026-09-23T03:27:21.923Z",
  "delayed": false
}
```

主要字段：

| 字段 | 说明 |
|---|---|
| `source` | 实际数据源；使用 DataGateway 时为 `datagateway-wind` |
| `price` | 最新价/最近快照价 |
| `change` / `change_pct` | 涨跌额、涨跌幅（百分比数值） |
| `open/high/low/prev_close` | 当日开高低与昨收 |
| `volume` / `amount` | 成交量、成交额；不同源的单位和覆盖度可能不同 |
| `updated_at` | 数据源时间或服务端处理时间，ISO 8601 |
| `delayed` | `false` 表示不是明确标记的延迟源；不等同于逐笔实时 |

如果所有数据源都返回空，单标接口返回 HTTP `404`，并包含 `source: "none"`、`error` 和 `chain_tried`。

## 5. 批量行情

```http
GET /api/quote/batch?tickers={comma-separated-tickers}
```

示例：

```bash
curl -sS 'https://stock-monitor-nu.vercel.app/api/quote/batch?tickers=600519.SH,0700.HK,AAPL'
```

参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `tickers` | 是 | 逗号分隔，服务端最多处理前 40 个 |
| `_` | 否 | 任意值，例如 `&_=1760000000000`，用于绕过服务端 60 秒内存缓存；不要每次轮询都使用 |

示例响应（行情字段已节选）：

```json
{
  "quotes": {
    "600519.SH": {
      "source": "datagateway-wind",
      "ticker": "600519.SH",
      "updated_at": "2026-09-23T03:27:21.923Z",
      "delayed": false
    },
    "0700.HK": {
      "source": "datagateway-wind",
      "ticker": "0700.HK",
      "updated_at": "2026-09-23T03:27:36.700Z",
      "delayed": false
    },
    "AAPL": {
      "source": "datagateway-wind",
      "ticker": "AAPL",
      "updated_at": "2026-09-23T03:27:36.700Z",
      "delayed": false
    }
  },
  "meta": {
    "attempted": 3,
    "failed": 0,
    "stale": 0,
    "duration_ms": 2219,
    "sources": {
      "datagateway-wind": {
        "attempted": 2,
        "succeeded": 2,
        "failed": 0,
        "retries": 0,
        "duration_ms": 4438
      }
    },
    "failed_tickers": [],
    "selected_sources": {
      "600519.SH": "cache",
      "0700.HK": "datagateway-wind",
      "AAPL": "datagateway-wind"
    }
  }
}
```

批量的 `meta` 字段：

| 字段 | 说明 |
|---|---|
| `attempted` | 本次处理的标的数 |
| `failed` / `failed_tickers` | 没有取到行情的数量和代码 |
| `stale` | 使用了过期缓存的标的数 |
| `duration_ms` | 服务端处理耗时 |
| `sources` | 每个上游源的尝试、成功、失败、重试和耗时统计 |
| `selected_sources` | 每个标的最终采用的来源；可能是 `cache` 或 `stale-cache` |

批量接口即使部分标的失败也可能返回 HTTP `200`。调用方必须同时检查每个 `quotes[ticker]` 是否为 `null`，以及 `meta.failed_tickers`、`meta.stale` 和每个标的的 `source`。

## 6. 数据源与可用性

配置 DataGateway 后，A/HK/US 以及配置支持的其他市场优先走：

```text
datagateway-wind -> Eastmoney -> Sina -> Tencent -> A 股可选 Tushare
```

可能看到的 `source`：

| 来源 | 含义 |
|---|---|
| `datagateway-wind` | DataGateway/Wind 实时快照 |
| `eastmoney` / `sina` / `tencent` | 公开行情回退源；部分市场可能为延迟数据 |
| `twse` | 台湾证交所/柜台买卖中心行情 |
| `eodhd` | 已配置 EODHD 时的 JPY/KRW 回退源 |
| `tushare` / `tushare-daily` | A 股日线兜底，通常是延迟数据 |
| `cache` / `stale-cache` | 服务端短期缓存 |

DataGateway 当前依赖本机 Mac、Tailscale Funnel 和本机 Wind。Mac 休眠、断网或 DataGateway 停止时，Vercel 会自动降级到公开源；因此调用方不能假设 `source` 永远是 `datagateway-wind`，应依据 `source`、`delayed`、`updated_at` 和 `meta` 决定是否展示“实时/延迟/陈旧”状态。

## 7. 轮询建议

- 建议轮询间隔：`30～60` 秒。
- 单次批量建议 `10～40` 个标的；超过 40 个请拆分请求。
- 普通轮询不要传 `_`，让服务端使用 60 秒缓存。
- 只有用户手动刷新或确需检查源健康时才传 `&_=<timestamp>`。
- 当前没有针对第三方合作方的独立 QPS/配额协议；正式放量前应增加合作方 API Key、限流和监控，避免公开端点被滥用。

## 8. 对方接入检查清单

- [ ] 配置 `BASE_URL=https://stock-monitor-nu.vercel.app`
- [ ] 使用 `GET /api/quote/{ticker}` 或 `GET /api/quote/batch?tickers=...`
- [ ] 不配置 DataGateway 地址和 Key；请求也不需要 `Authorization`
- [ ] 统一 ticker 到本文档格式
- [ ] 按 30～60 秒轮询，批量不超过 40 个
- [ ] 处理 `quotes[ticker] === null`、`meta.failed_tickers`、`meta.stale`
- [ ] 记录 `source`、`delayed`、`updated_at`
- [ ] 如果由浏览器直接跨域调用，先提供准确 `Origin`，由服务端增加 CORS 白名单
- [ ] 明确当前是 REST 快照，不是 WebSocket/SSE 或逐笔推送

## 9. 给对方的接入摘要

```text
接口：GET https://stock-monitor-nu.vercel.app/api/quote/{ticker}
批量：GET https://stock-monitor-nu.vercel.app/api/quote/batch?tickers=600519.SH,0700.HK,AAPL
鉴权：无
来源：优先 DataGateway/Wind，失败自动回退公开源
模式：REST 快照 + 30～60 秒缓存，不是推送
建议：由服务端调用；浏览器跨域需服务端增加 CORS 白名单
```
