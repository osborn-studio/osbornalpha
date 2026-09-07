<!-- 13 运维手册 · 用途：部署/env/迁移/换密钥/故障处置/监控/on-call · 最后更新 2026-07-28 -->

# 13 · 运维手册（Runbook）

osbornalpha 生产运维。托管 Vercel（osbornalpha.com，阿里云 DNS）；数据层 Supabase（ref `mzfcaabhuwtfvsvadvsv`，Tokyo / Free）；计量平台 LLM 为已复核定价的 DeepSeek V4 Flash；数据源 Tushare + Eastmoney/Sina/Tencent。

---

## 1. 部署

`main` 使用 Vercel Git Integration 自动部署。Production build 会先验证最新 Watchlist schema marker，数据库未迁移时构建失败关闭。`Application checks` 与 `Watchlist production release` 仍保留为独立验证和受控迁移链路，但不再是 Vercel 自动部署的前置条件。不要在应用生产迁移前用最新 release marker 阻断前置 CI，否则会形成迁移发布死锁。手动发布：

```bash
npm test
npm run typecheck
npm run build
npm run preflight:release            # 在已注入生产 env 的受控环境运行；只输出 provider/model 等非秘密信息
npm run watchlist:provider-check     # 真实探测已配置 Watchlist Provider；会产生少量外部请求
npm run watchlist:rls-check          # 两个独立验收账号；只读验证私有表双向隔离
vercel --prod --yes                  # 直接发 Production
```

`preflight:release` 必须解析出 `deepseek / deepseek-v4-flash`、通过精确价格注册表校验，并确认 service-role key 已注入；命令不会打印任何 key 或指纹。部署后冒烟：打开 https://www.osbornalpha.com → 未登录见落地页 → 登录 → `/dashboard`。回滚：Vercel Dashboard → Deployments → 选上一个绿的 → **Promote to Production**（或 `vercel rollback`）。

---

## 2. 环境变量管理

在 Vercel → Project → Settings → Environment Variables（Production / Preview 分别设）。代码实际引用的变量：

| 变量 | 必需 | 用途 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL（`https://mzfcaabhuwtfvsvadvsv.supabase.co`） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 前端 anon/publishable key（`sb_publishable_…`） |
| `WATCHLIST_RUNTIME_EMAIL` / `WATCHLIST_RUNTIME_PASSWORD` | CI 发布门 | 专用只读验收账号 A，用于部署后调用真实 Watchlist overview，并作为 RLS Canary 一侧；仅存 GitHub `production` environment secrets |
| `WATCHLIST_RUNTIME_EMAIL_B` / `WATCHLIST_RUNTIME_PASSWORD_B` | CI 发布门 | 独立验收账号 B，用于双向验证租户隔离；仅存 GitHub `production` environment secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 平台计量、成本预留/审计、管理路由所需；仅服务端，绝不入库/暴露 |
| `NEXT_PUBLIC_APP_URL` | ✅ | `https://www.osbornalpha.com`（生产） |
| `LLM_PROVIDER` | ✅（推荐显式） | 生产设为 `deepseek`；显式 provider 缺自己的 key 时失败关闭，不自动换 provider |
| `LLM_MODEL` | ✅（推荐显式） | 生产设为已复核定价的 `deepseek-v4-flash` |
| `DEEPSEEK_API_KEY` | ✅（平台 AI） | DeepSeek 服务端密钥；值仅存部署平台 secret |
| `DEEPSEEK_MODEL` / `ANTHROPIC_API_KEY` | 旧 facade 按需 | 仅旧 `data/sources/llm.ts` 路径；不能替代上述平台计量配置 |
| `LLM_DAILY_COST_LIMIT_MICRORMB` | ✅ | 生产 `8800000`（¥8.80） |
| `LLM_USD_CNY_MICROS` | ✅ | 经评审的 USD/CNY 微单位值，当前 `7200000` |
| `LLM_RESERVATION_TTL_SECONDS` | ✅ | 成本预留 TTL，当前 `300` |
| `TUSHARE_TOKEN` | 数据 | A 股深度数据 |
| `WATCHLIST_REQUIRED_PROVIDERS` | CI 发布门 | GitHub `production` environment variable；逗号分隔：`search,hk-financials,structured-research,official-documents,trading-calendar`，必须显式设置且列入后不可降级发布 |
| `SEARCH_PROVIDER` / `TAVILY_API_KEY` / `BRAVE_SEARCH_API_KEY` / `SERPER_API_KEY` | Watchlist 研究 | 联网搜索 Provider 与服务端密钥 |
| `WATCHLIST_SEARCH_CANARY_QUERIES` | 可选探针 | 以 `|` 分隔的搜索 Canary 查询；默认覆盖 A/H/US 三市场 |
| `HK_FINANCIALS_API_URL` / `HK_FINANCIALS_API_TOKEN` | 可选数据 | 港股财务结构化 Provider |
| `STRUCTURED_RESEARCH_API_URL` / `STRUCTURED_RESEARCH_API_TOKEN` | 可选数据 | 港美股结构化研报 Provider |
| `OFFICIAL_DOCUMENT_API_URL` / `OFFICIAL_DOCUMENT_API_TOKEN` | 可选数据 | 官方公告正文抽取 Provider |
| `OFFICIAL_DOCUMENT_CANARY_URL` | 官方文档探针 | 允许抽取的 SEC/交易所官方公告 URL |
| `TRADING_CALENDAR_URL` / `TRADING_CALENDAR_API_KEY` | 可选数据 | 六市场交易日历 Provider |
| `SEC_USER_AGENT` | 可选 | SEC EDGAR 请求联系标识；建议设置为 `产品名/版本 运维邮箱` |
| `CRON_SECRET` | 建议 | `/api/cron/*` 的 Bearer 鉴权 |
| `WATCHLIST_REVIEW_REMINDER_LIMIT` | 建议 | Dispatcher 单轮生成 Review 到期提醒的上限，生产建议 `500` |
| `WATCHLIST_DISPATCH_CONCURRENCY` | 建议 | Dispatcher 同一执行波次并发数，默认 `2`；依赖任务不会并发越序 |
| `WATCHLIST_DISPATCH_BUDGET_MS` / `WATCHLIST_DISPATCH_JOB_TIMEOUT_MS` | 建议 | 单次 Dispatcher 总预算与单任务硬超时，默认 `270000` / `90000` 毫秒 |
| `WATCHLIST_DISPATCH_LOOKBACK_MINUTES` / `WATCHLIST_DISPATCH_SLOT_LIMIT` | 建议 | 漏调补跑窗口与单次最多领取的 15 分钟时间槽，默认 `120` 分钟 / `8` 个 |
| `WATCHLIST_DISPATCH_LEASE_MINUTES` | 建议 | 调度时间槽租约，默认 `5` 分钟；超时调用由后续 Dispatcher 回收 |
| `WATCHLIST_REQUIRE_SCHEMA_GATE` | 生产默认开启 | Vercel Production 构建前验证最新 Watchlist release marker；仅紧急回滚时显式设为 `false` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 通知 | 简报/告警推送 |
| `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_TO` | 通知 | 邮件简报/告警 |
| `WATCHLIST_DELIVERY_CANARY_EMAIL` / `WATCHLIST_DELIVERY_CANARY_FROM` | CI 发布门 | 专用通知验收收件人 secret 与已验证发件人 repository variable；发布时发送幂等邮件并等待 Resend `delivered` 状态 |
| `CACHE_PURGE_SECRET` | 可选 | `/api/cache/revalidate` 鉴权 |
| `LLM_DIGEST_TAKE` | 可选 | 摘要 take 开关 |

> 已废弃、务必从所有环境删除：`SITE_PASSWORD`、`SITE_AUTH_SECRET`（共享密码门已下线）。
> `NEXT_PUBLIC_GUEST_MODE_ALLOWED` 为历史遗留变量，访客模式已移除，门禁不再依赖它。

---

## 3. Supabase 迁移

迁移文件在 `supabase/migrations/`。上线前以文件名顺序核对所有未应用迁移；当前 Watchlist 最新 release marker 为 `watchlist_cron_dispatch_acl_health`，由 `20260904630000_watchlist_cron_dispatch_acl_health.sql` 写入。两种应用方式：

**A. CLI（推荐）**
```bash
supabase login
supabase link --project-ref mzfcaabhuwtfvsvadvsv   # 输入 DB 密码（Dashboard→Settings→Database）
supabase db push                                    # 应用所有未应用迁移
```

**B. SQL Editor（无 CLI 时）** — Dashboard → SQL Editor，严格按文件名顺序执行尚未应用的迁移。不要整批重跑已登记迁移；约束、策略与数据迁移可能不是任意次数幂等。

应用后必须运行 `npm run watchlist:production-check`。失败时先停止代码发布，修复数据库迁移；回滚优先恢复上一版应用代码。数据库迁移均为向前兼容的加法变更，不应在事故中直接删除新列或新表。

**Seed**：`supabase/seed.sql`（30 只股票 universe）—— `supabase db push --include-seed` 或 SQL Editor 粘贴；`on conflict do update` 可重复执行。

---

## 4. 轮换密钥

1. 在源头生成新 key（Supabase / DeepSeek / Tushare / Resend / Telegram 各自控制台）。
2. Vercel → Settings → Env 更新对应变量（Production + Preview）。
3. 重新部署使新值生效（`vercel --prod` 或 redeploy）。

主分支的 `Watchlist production release` workflow 在 `Application checks` 全绿后按顺序执行生产 migration、schema check、Provider Canary、双账号 RLS Canary、通知投递 Canary、Vercel build/deploy 与 authenticated runtime check。GitHub `production` environment 必须配置 Supabase、Provider、两套验收账号、Resend Canary 与 Vercel secrets；任一必需 Provider、fixture、隔离或投递检查失败都会在部署前停止。Vercel Git 自动构建即使提前触发，也会被 production schema gate 阻止在旧 schema 上发布。
4. 源头吊销旧 key。
5. **Supabase service_role / `sb_secret_`**：泄漏即视为最高级事故，立即在 Dashboard → Settings → API 轮换并全环境替换。

---

## 5. 故障处置（Incident Playbook）

### 5.1 登录/认证不可用
- 症状：用户卡 `/login`，或受保护页全跳登录。
- 排查：①Vercel `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` 是否被改坏（含 `placeholder` 会触发门禁放行）；②Supabase 项目是否在线（Dashboard 状态）；③Auth → URL Configuration 的 Site URL / Redirect URLs 是否含当前域名；④OAuth 报错查 provider Client ID/Secret 与回调地址。
- 缓解：env 回滚到上一个已知好的值 → redeploy。

### 5.2 数据源中断（Tushare/抓取）
- 症状：`/api/quote|kline|financials|radar` 返回 500 或空。
- 排查：`GET /api/diag/tushare` 看 token；抓取源（Eastmoney/Sina/Tencent）可能限流/改版。
- 缓解：单源故障应优雅降级（不让整页 500）；必要时临时切 mock（`lib/data/mock.ts`）保证页面可用，并记录受影响接口。

### 5.3 LLM 失败（简报/委员会）
- 症状：`/api/brief/preview` 或 cron 简报 500/超时。
- 排查：先在受控环境运行 `npm run preflight:release`；若是 `pricing_unavailable`，核对实际解析出的 provider/model 与价格注册表；若是 `budget_unavailable` / `usage_audit_unavailable`，核对 service-role key 与 Supabase RPC/迁移；再检查 DeepSeek 配额/超时。
- 缓解：保持 `LLM_PROVIDER=deepseek`、`LLM_MODEL=deepseek-v4-flash`，必要时降 `topN` 或用 `?skipLLM=true` 隔离数据管线；不得通过切换到未复核定价的模型绕过门禁。

### 5.4 cron 未跑 / 被滥用
- 排查：日级任务在 Vercel `vercel.json`；高频 `/api/cron/watchlist-dispatch` 与 `/api/cron/watchlist-perspectives` 由 GitHub Actions `Watchlist external scheduler` 每 5 分钟调用。该 workflow 使用 repository secret `CRON_SECRET`（必须与 Vercel Production 完全一致）、repository variable `WATCHLIST_SCHEDULER_URL`（HTTPS 生产基地址）和 `WATCHLIST_SCHEDULER_ENABLED=true`。新建或迁移期间保持该开关为 `false`，待最新应用部署成功后再开启，避免旧版本端点缺失时反复失败。查看 GitHub Actions 运行记录及端点响应，`metric-refresh` 必须先于 `metric-alerts`，`skipped_dependency` 表示上游失败，`watchlist_cron_job_timeout` 表示单任务超过独立时限。
- 加固：设 `CRON_SECRET`，裸调 `/api/cron/*` 应返回 401。

### 5.5 Review 提醒未送达或重复
- 排查：先运行 `npm run watchlist:production-check`，确认 `watchlist_review_reminders` marker 与 `enqueue_watchlist_review_reminders` RPC；再检查 `alert_events`、投递队列、重试和死信状态。
- 行为：提醒以 `watchlist_item_id + review + review_date` 幂等；暂停或已作废标的不发送。即时模式进入 Email/Telegram 队列，Digest 模式遵循用户时区和静默时段。
- 缓解：队列积压时降低 Dispatcher 其他任务并发，但不要重置幂等键或手工重复插入提醒事件。

---

## 6. 监控与 on-call

- **告警通道**：cron 失败时路由自动推 Telegram（`TELEGRAM_*`）+ Email（`RESEND_*`/`EMAIL_*`）。保证至少一条通道配好。
- **日常巡检**：Vercel Deployments（构建/函数错误率）、Vercel Crons（每日两个 job 是否绿）、Supabase Dashboard（DB 用量、Auth 用户数、SMTP 配额）。
- **健康探针**：`npm run watchlist:provider-check`（外部 Provider）、`npm run watchlist:production-check`（Schema 与队列健康）、`npm run watchlist:rls-check`（双账号只读隔离）、`GET /api/brief/preview?skipLLM=true`（数据管线）、`GET /api/diag/tushare`（数据源 token）。
- **Watchlist 历史与告警**：`/api/cron/alerts/watchlist` 每 15 分钟将健康快照写入 `service_alert_runs(check_name='watchlist_15m')`；异常复用 Email/Telegram 运维通道。
- **Watchlist 调度器**：GitHub Actions 每 5 分钟顺序调用 `/api/cron/watchlist-dispatch` 与 `/api/cron/watchlist-perspectives`，适配 Vercel Hobby 的日级 Cron 限制。dispatcher 的 120 分钟补跑窗口会吸收 Actions 的调度延迟；数据库租约和幂等键阻止重试或重叠运行造成重复执行。报价告警与运营健康每轮执行；Review 提醒、指标、观点结果和研究刷新按 dispatcher slot 分散执行。
- **on-call 基本动作**：①确认影响面（全站 vs 单接口）；②先看 Vercel 部署日志 + Supabase 状态；③能 env 回滚就回滚 + redeploy；④数据/LLM 单点故障走 §5 降级；⑤事后记录根因与改进项。
