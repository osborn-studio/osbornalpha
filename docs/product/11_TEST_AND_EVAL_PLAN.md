<!-- 11 测试与评估计划 · 用途：单元测试、静态门、e2e、LLM eval、回归 · 最后更新 2026-09-04 -->

# 11 · 测试与评估计划（Test & Eval Plan）

验证策略分为四层：Vitest 单元/契约测试 → 静态门（typecheck + build + lint）→ Playwright 与生产运行时检查 → LLM 输出评估。每次部署前必须完整执行回归门禁。

---

## 1. 静态门（每次提交/部署必过）

```bash
npm test            # Vitest 单元、契约、迁移与安全回归
npm run typecheck   # tsc --noEmit —— 类型零错误
npm run build       # next build —— App Router 全量构建通过
npm run lint        # ESLint 零 warning
npm run watchlist:perspective-eval # 固定 A/HK/US 观点合规与引用回归集
```

**门通过标准：** 四条命令均为 0 退出码。`build` 在缺 Supabase env 时仍应成功（占位值降级，见 `server.ts` 的 placeholder 兜底）；缺 env 报错时按 `EDGEONE_DEPLOY.md` 用占位 public 值过构建。

---

## 2. 运行时 / 预览 e2e 清单（手动或 preview 工具）

启动 `npm run dev`（或对预览/生产域名）逐项核对。可用 `curl -I` 看跳转码，或 preview 工具加载页面看快照。

### 2.1 门禁跳转
- [ ] 未登录 GET `/dashboard`、`/watchlist`、`/radar`、`/briefs`、`/backtest`、`/settings` → `302/307 → /login?next=…`。
- [ ] 未登录 GET `/`、`/about`、`/login`、`/register`、`/forgot-password`、`/reset-password` → `200`（公开）。
- [ ] 已登录 GET `/login`、`/register` → 跳 `/dashboard`。
- [ ] 已登录 GET `/dashboard` → `200` 正常渲染。
- [ ] 本地无 Supabase env 时：门禁放行（middleware + `(app)/layout` 均不拦），app 可跑。

### 2.2 注册触发器建行
- [ ] 新邮箱注册（确认后）→ Supabase `profiles`、`watchlists`（默认「我的股票池」）、`user_preferences` 各新增 1 行，`user_id`/`id` 对应新用户。

### 2.3 RLS 双账号隔离（核心安全验收）
- [ ] 在受控环境为两个账号准备完整私有表 fixture，再运行 `npm run watchlist:rls-check`；结果 `ok:true`，所有表均为 `coverage:full`。
- [ ] 账号 A 加自选股；账号 B 登录后 `/watchlist` 看不到 A 的条目。
- [ ] 用 A 的会话直接打 `/api/watchlist`，仅返回 A 的数据；B 同理。
- [ ] 公开 reference 表（`stocks_universe`/`financial_history`）两账号都可读（`/api/search`、`/api/stocks/[ticker]` 返回数据）。

### 2.4 OAuth 流程（配好 provider 后）
- [ ] Google 一键登录 → 回调 `/auth/callback` → 落 `/dashboard`；首次登录建齐 profiles 行。
- [ ] `/settings → 账号` 绑定/解绑第三方生效。

### 2.5 邮箱链路
- [ ] 注册 → 收确认邮件 → 确认 → 密码登录成功。
- [ ] 忘记密码 → 收重置邮件 → `/reset-password` 设新密码 → 新密码登录。

### 2.6 简报生成（数据 + LLM 管线）
- [ ] `GET /api/brief/preview?skipLLM=true&format=markdown` → 返回结构化简报（无 LLM 成本，验证数据管线）。
- [ ] `GET /api/brief/preview?topN=5&format=json`（配 `DEEPSEEK_API_KEY` 后）→ 返回含 9 视角的 JSON，`overall_confidence` 在 0–10。
- [ ] cron：`GET /api/cron/daily-brief`（带 `Authorization: Bearer $CRON_SECRET`）→ `ok:true`；不带 secret 且已设 `CRON_SECRET` → `401`。

### 2.7 数据接口冒烟
- [ ] `/api/quote/[ticker]`、`/api/kline/[ticker]`、`/api/financials/[ticker]`、`/api/radar/[ticker]`、`/api/signals/[ticker]` 各返回 200 + 合理 payload（或在数据源未配时优雅降级，不 500）。
- [ ] `/api/diag/tushare` 用于诊断 Tushare token 是否生效。

---

## 3. LLM 输出评估（AI 委员会 / 简报质量）

无确定性断言，用结构 + 抽样人审：

- **结构校验**：9 视角输出每条含 `persona ∈ personas`、`stance ∈ {bullish,neutral,bearish}`、`confidence ∈ [0,10]`、非空 `summary`。`perspectives`/`stock_signals` 入库前校验 enum 与区间（schema 已有 `check` 约束兜底）。
- **成本守卫**：`llm.ts` 的 `est_cost_usd` 每调用估算；抽查单次简报成本，对齐 ROADMAP 红线（日 LLM 成本 >$300/月切自托管）。
- **免责声明强制**：简报输出必须含免责声明文案（合规后处理注入），人审抽样确认未被模型省略。
- **人审打分（每周抽 3–5 份简报）**：相关性、是否捏造数据（hallucination）、口径一致（红涨绿跌/币种）、可读性。打脸率纳入 ROADMAP 退出策略统计。
- **provider 回退**：`LLM_PROVIDER` 未 pin 时 DeepSeek 优先、Anthropic 回退；验证拔掉 `DEEPSEEK_API_KEY` 后仍能用 `ANTHROPIC_API_KEY` 出简报。
- **固定离线回归**：`npm run watchlist:perspective-eval` 必须全部通过；覆盖真实/伪造网页引用、上下文存在/不存在的结构化指标、直接投资建议措辞和空输出。Prompt 或模型版本升级必须先更新并评审固定集，禁止通过降低断言绕过失败。

---

## 4. 部署前回归清单（go/no-go）

每次 `vercel --prod` 前：

1. [ ] `npm run typecheck && npm run build` 双绿。
2. [ ] §2.1 门禁跳转抽测（至少 1 受保护 + 1 公开 + 已登录跳转）。
3. [ ] §2.3 RLS 双账号隔离（最关键，绝不可回归）。
4. [ ] `/api/brief/preview?skipLLM=true` 返回 200（数据管线健康）。
5. [ ] 落地页 `/` 未登录可见、CTA 指向正确。
6. [ ] 关键 env 在 Vercel Production 已设（见 `13_RUNBOOK.md` env 表）。
7. [ ] 迁移若有新增：已在 Supabase 应用（`supabase db push` 或 SQL Editor）。
8. [ ] 部署后线上冒烟：打开 osbornalpha.com → 落地页 → 登录 → `/dashboard`。
