# Vercel 自动部署与 DataGateway 连通性验收

> 目标：`osborn-studio/osbornalpha` 的 `main` 自动部署到 Vercel Production，并由 Vercel Function 成功访问 Mac Studio 上的 DataGateway/Wind。
>
> 最后更新：2026-09-23

## 1. 部署链路

```text
GitHub osborn-studio/osbornalpha main
  -> Vercel Production
  -> GET/POST /api/quote/*
  -> DATAGATEWAY_BASE_URL
  -> Tailscale Funnel
  -> Mac Studio 127.0.0.1:8800 DataGateway
  -> Mac Studio 127.0.0.1:8766 Wind Adapter
  -> WindPy
```

公开域名：

```text
https://osbornalpha.com
https://www.osbornalpha.com
```

## 2. Vercel 项目必须满足

在 Vercel Dashboard 的项目 **Settings → Git** 中确认：

| 设置 | 要求 |
|---|---|
| Git Repository | `osborn-studio/osbornalpha` |
| Production Branch | `main` |
| Root Directory | 仓库根目录，留空 |
| Framework Preset | Next.js |
| Node.js Version | `22.x` |

如果 Git Repository 指向旧仓库，生产会出现“接口还能跑，但 `main` 的新功能没有部署”的状态。判断方法：

```bash
# 生产应包含 main 的新功能
curl -sS https://osbornalpha.com/api/financials/AAPL

# 强制刷新行情，必须选择 datagateway-wind
curl -sS "https://osbornalpha.com/api/quote/batch?tickers=600519.SH,AAPL&_=$(date +%s)"
```

## 3. Vercel Production 环境变量

在 **Settings → Environment Variables → Production** 配置：

```text
DATAGATEWAY_BASE_URL=https://<machine>.<tailnet>.ts.net:8443
DATAGATEWAY_API_KEY=<DataGateway client token>
DATAGATEWAY_REALTIME_QUOTE_PATH=/v1/market-data/tickers/query
DATAGATEWAY_DAILY_KLINE_PATH=/v1/market-data/security-prices/history/query
```

说明：

- `DATAGATEWAY_BASE_URL` 必须是 HTTPS Funnel 地址，并包含实际 Funnel 端口。
- `DATAGATEWAY_API_KEY` 只放在 Vercel 服务端；不要提交到 Git，也不要交给浏览器或合作方。
- 日线/intraday 是否需要取决于实际套餐；实时快照只依赖前三项。
- 修改环境变量后必须重新部署 Production。

## 4. Mac Studio 常驻要求

当前部署依赖 Mac Studio 开机联网。建议配置：

| 项目 | 要求 |
|---|---|
| 系统休眠 | 接入电源时不要休眠；仅允许显示器休眠 |
| Tailscale | 登录自启动，并保持 Funnel 配置为当前有效配置 |
| DataGateway API | Docker 容器 restart policy 为 `unless-stopped`，监听 `127.0.0.1:8800` |
| Wind Adapter | LaunchAgent `KeepAlive=true`，监听 `127.0.0.1:8766` |
| Funnel | `https://<machine>.<tailnet>.ts.net:8443 -> http://127.0.0.1:8800` |

检查命令：

```bash
tailscale funnel status
docker ps --filter name=datagateway
lsof -nP -iTCP:8800 -iTCP:8766 -sTCP:LISTEN
```

## 5. 自动部署验收

1. 合并 PR 到 `main`。
2. 确认 Vercel Production 出现由 `main` 新 commit 触发的新部署。
3. 部署完成后执行：

```bash
curl -sS "https://osbornalpha.com/api/quote/batch?tickers=600519.SH,AAPL&_=$(date +%s)" \
  | jq -e '
    .meta.failed == 0 and
    .meta.selected_sources["600519.SH"] == "datagateway-wind" and
    .meta.selected_sources["AAPL"] == "datagateway-wind"
  '
```

该检查失败时，即使接口返回了公开源回退数据，也视为“Vercel 未真正到达 Mac Studio DataGateway”。

仓库中的 `.github/workflows/quote-service-alert.yml` 每 15 分钟执行同类探测，用于持续监控这一条链路。

## 6. 常见故障定位

| 现象 | 优先检查 |
|---|---|
| Vercel 没有新部署 | Settings → Git 的仓库/生产分支是否正确；Vercel 是否连接到了 `osborn-studio/osbornalpha` |
| 返回 `datagateway-wind` HTTP 401 | Vercel `DATAGATEWAY_API_KEY` 与 DataGateway client token 是否一致 |
| 返回 `datagateway-wind` 超时/连接失败 | Tailscale Funnel、Mac 是否在线、`8800` 是否监听 |
| 返回 `eastmoney/sina/tencent` | DataGateway 未命中；检查 Funnel、API 容器、Wind Adapter |
| `600519.SH` 可达但 `AAPL` 不可达 | 检查 DataGateway/Wind 对美股代码和权限的支持 |
