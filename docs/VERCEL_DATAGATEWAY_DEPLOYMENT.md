# Vercel 手动部署与 DataGateway 连通性验收

> 目标：`osborn-studio/osbornalpha` 的 `main` 通过 Vercel CLI 手动部署到 Vercel Production，并由 Vercel Function 成功访问 Mac Studio 上的 DataGateway/Wind。
>
> 最后更新：2026-10-18

## 1. 部署链路

```text
GitHub osborn-studio/osbornalpha main
  -> 人工执行 vercel deploy --prod --yes（见第 5 节；Vercel 项目未连接 Git，不会自动部署）
  -> Vercel Production
  -> GET/POST /api/quote/*
  -> DATAGATEWAY_BASE_URL（Funnel 8443 源站）+ /datagateway/... 路径
  -> Tailscale Funnel 8443，/datagateway 挂载点（Tailscale 转发前剥离 /datagateway 前缀）
  -> Mac Studio 127.0.0.1:8800 DataGateway
  -> Mac Studio 127.0.0.1:8766 Wind Adapter
  -> WindPy
```

公开域名：

```text
https://osbornalpha.com
https://www.osbornalpha.com
```

Mac Studio（`evas-mac-studio.tail4042ba.ts.net`）的 Funnel 端口分配（2026-10-18 实测）：

| Funnel 端口 | 路径 | 后端 | 说明 |
|---|---|---|---|
| 443 | — | 原始 TCP 转发到 Caddy | 提供仅 VPN 可达的 `data-gateway.com` 别名；**不得改动或挪作他用** |
| 8443 | `/` | `http://127.0.0.1:8877` | research-intake-api |
| 8443 | `/datagateway` | `http://127.0.0.1:8800` | DataGateway（本项目使用） |
| 10000 | `/` | Next.js 站点 | **不得改动或挪作他用** |

规则：

- Funnel 只有 443 / 8443 / 10000 三个有效端口，没有其他可用端口，也不要尝试新开端口。
- 本项目只使用 8443 的 `/datagateway` 挂载点；443（Caddy / `data-gateway.com`）和 10000 不得重新配置，否则会破坏其他服务。
- 8443 的 `/` 属于 research-intake-api，不要覆盖；DataGateway 必须以 `--set-path=/datagateway` 挂载。

## 2. Vercel 项目必须满足

在 Vercel Dashboard 的项目（`stock-monitor`）中确认：

| 设置 | 要求 |
|---|---|
| Settings → Git | **未连接**（当前所有部署均为 `source: cli`，没有 Git 集成；`main` 合并后不会自动触发部署） |
| Production Branch | 不适用（无 Git 集成）；生产部署只来自 `main` 的干净检出 |
| Root Directory | 仓库根目录，留空 |
| Framework Preset | Next.js |
| Node.js Version | `22.x` |

因为没有 Git 集成，合并 PR 之后如果没人执行第 5 节的部署，生产会停留在旧版本：“接口还能跑，但 `main` 的新功能没有部署”。判断方法：

```bash
# 生产应包含 main 的新功能
curl -sS https://osbornalpha.com/api/financials/AAPL

# 强制刷新行情，必须选择 datagateway-wind
curl -sS "https://osbornalpha.com/api/quote/batch?tickers=600519.SH,AAPL&_=$(date +%s)"
```

## 3. Vercel Production 环境变量

在 **Settings → Environment Variables → Production** 配置：

```text
DATAGATEWAY_BASE_URL=https://evas-mac-studio.tail4042ba.ts.net:8443
DATAGATEWAY_API_KEY=<DataGateway client token>
DATAGATEWAY_REALTIME_QUOTE_PATH=/datagateway/v1/market-data/tickers/query
DATAGATEWAY_DAILY_KLINE_PATH=/datagateway/v1/market-data/security-prices/history/query
```

说明：

- `DATAGATEWAY_BASE_URL` 是 HTTPS Funnel 源站（只含协议、主机名、端口 `8443`），**不含** `/datagateway`。
- 两个 `*_PATH` 变量必须带 `/datagateway` 前缀：该前缀是 Funnel 的挂载点，Tailscale 在转发给 `127.0.0.1:8800` 之前会剥离它，所以 DataGateway 自身看到的仍是 `/v1/...`。漏掉前缀时请求会落到 8443 `/` 的 research-intake-api。
- `DATAGATEWAY_API_KEY` 只放在 Vercel 服务端；不要提交到 Git，也不要交给浏览器或合作方。
- 日线/intraday 是否需要取决于实际套餐；实时快照只依赖前三项。
- 修改环境变量后必须新建一次 Production 部署（第 5 节）才会生效；已有部署不会读取新值。
- Funnel 流量始终经 DERP 中继，单次请求传输开销约 1.2–2.8 s；行情路由给批量 Wind 调用的预算是 5 s，不要在不了解的情况下调低。

## 4. Mac Studio 常驻要求

当前部署依赖 Mac Studio 开机联网。建议配置：

| 项目 | 要求 |
|---|---|
| 系统休眠 | 接入电源时不要休眠；仅允许显示器休眠 |
| Tailscale | 登录自启动，并保持 Funnel 配置为当前有效配置 |
| DataGateway API | Docker 容器 restart policy 为 `unless-stopped`，监听 `127.0.0.1:8800` |
| Wind Adapter | LaunchAgent `KeepAlive=true`，监听 `127.0.0.1:8766` |
| Funnel | `https://evas-mac-studio.tail4042ba.ts.net:8443/datagateway -> http://127.0.0.1:8800`（同端口 `/` 为 research-intake-api `127.0.0.1:8877`，勿覆盖） |

检查命令：

```bash
tailscale funnel status
docker ps --filter name=datagateway
lsof -nP -iTCP:8800 -iTCP:8766 -sTCP:LISTEN
```

`tailscale funnel status` 应同时显示 8443 `/` 和 8443 `/datagateway` 两个挂载点；缺少后者的处理见第 6 节。

## 5. 手动部署与验收

Vercel 项目没有 Git 集成，合并到 `main` 不会触发部署。每次需要上线时由人工执行：

1. 合并 PR 到 `main`。
2. 从 `main` 的干净检出部署（不要从带有未提交改动的工作目录部署），使用临时 detached worktree，并把 `.vercel/project.json` 拷进去（该文件不在 Git 中）：

```bash
git fetch origin main
git worktree add --detach ../osbornalpha-deploy origin/main
mkdir -p ../osbornalpha-deploy/.vercel
cp .vercel/project.json ../osbornalpha-deploy/.vercel/project.json
cd ../osbornalpha-deploy
vercel deploy --prod --yes --env VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)   # 必须：CLI 部署时 Vercel 不填 VERCEL_GIT_COMMIT_SHA，缺它时 facts-sync、filing-calendar、reconcile、macro-sync、industry-sync 的真实运行与 macro ingest 返回 503 code_version_unavailable
cd - && git worktree remove --force ../osbornalpha-deploy
```

3. 修改过 Vercel 环境变量后，也必须按同样步骤重新部署一次。
4. 部署完成后（`vercel deploy` 输出 Production URL 且别名已指向 `osbornalpha.com`）执行：

```bash
curl -sS "https://osbornalpha.com/api/quote/batch?tickers=600519.SH,AAPL&_=$(date +%s)" \
  | jq -e '
    .meta.failed == 0 and
    .meta.stale == 0 and
    .meta.selected_sources["600519.SH"] == "datagateway-wind" and
    .meta.selected_sources["AAPL"] == "datagateway-wind"
  '
```

该检查失败时，即使接口返回了公开源回退数据，也视为“Vercel 未真正到达 Mac Studio DataGateway”。

注意：

- DataGateway 的供应商熔断器在连续 3 次失败后打开，300 s 后才复位。短时间内反复手动探测会让 Wind 看起来“宕机”约 5 分钟。验收时只跑上面一次检查；失败后先等待，不要连续重试。
- 仓库中的 `.github/workflows/quote-service-alert.yml` 每 15 分钟执行同类探测，这个频率就是预期的探测频率，用于持续监控这一条链路。网关探测与原有 15 分钟行情窗口告警在独立 job 中运行，任一失败或超时都不会跳过另一项检查。

## 6. 常见故障定位

| 现象 | 优先检查 |
|---|---|
| 合并后生产没有新功能 / Vercel 没有新部署 | 项目未连接 Git，不会自动部署；按第 5 节在 `main` 的干净检出上执行 `vercel deploy --prod --yes`。修改环境变量后同样需要重新部署 |
| 返回 `datagateway-wind` HTTP 401 | Vercel `DATAGATEWAY_API_KEY` 与 DataGateway client token 是否一致 |
| 返回 `datagateway-wind` 超时/连接失败 | Tailscale Funnel、Mac 是否在线、`8800` 是否监听；Funnel 经 DERP 中继，单次请求约 1.2–2.8 s |
| 返回 `eastmoney/sina/tencent` | DataGateway 未命中；检查 Funnel、API 容器、Wind Adapter |
| `600519.SH` 可达但 `AAPL` 不可达 | 检查 DataGateway/Wind 对美股代码和权限的支持 |
| `GET https://evas-mac-studio.tail4042ba.ts.net:8443/health` 返回 research-intake-api | `/datagateway` 挂载丢失（8443 `/` 本来就是 research-intake-api）。在 Studio 上以 `eva` 用户执行 `tailscale funnel --bg --https=8443 --set-path=/datagateway http://127.0.0.1:8800`，再用 `tailscale funnel status` 确认；不要动 443 和 10000 |
| 约 5 分钟内所有探测都失败（通常发生在一阵集中探测之后） | DataGateway 供应商熔断器（3 次失败后打开，300 s 复位）。等待 300 s，不要继续连续探测，否则会反复重置计时 |
| 告警报告 `preferred_source` degraded | 先 curl 一次 `https://evas-mac-studio.tail4042ba.ts.net:8443/datagateway/v1/health`，应返回 `{"ok":true,"service":"dadao-data-gateway"}`；返回其他内容见上面两行（挂载缺失 / 熔断器），正常则再看 Wind Adapter 和 DataGateway 日志 |
