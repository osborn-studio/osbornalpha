<!-- 03_USER_JOURNEY_AND_USE_CASES — osbornalpha 端到端用户旅程、首登/复访/多端场景与用例表 — 最后更新 2026-07-28 -->

# 03 · 用户旅程与用例（User Journey & Use Cases）

> 术语以 [`00_TERMINOLOGY_CONSISTENCY.md`](./00_TERMINOLOGY_CONSISTENCY.md) 为准。
> 权限与隔离细节见 [`08_SECURITY_AND_PERMISSIONS.md`](./08_SECURITY_AND_PERMISSIONS.md)，UI 细节见 [`24_LIVE_WORKBENCH_UI_SPEC.md`](./24_LIVE_WORKBENCH_UI_SPEC.md)。

osbornalpha 是多租户 AI 投研监控 SaaS。**公开面只有落地页 `/`；产品本体全部在 `(app)` 路由组内，登录后才可访问。** 登录闸门由两层守卫强制（2026-06-20 上线）：

1. `src/middleware.ts` —— 边缘中间件。公开路径白名单 `{ '/', '/about', '/login', '/register', '/forgot-password', '/reset-password' }`，外加 `/auth/*`（OAuth / 邮件回调）与 `/api/*`（各自携带 RLS / 鉴权）。未登录访问受保护路径 → `302` 跳 `/login?next={原路径}`；已登录访问 `/login` 或 `/register` → 跳 `/dashboard`。
2. `src/app/(app)/layout.tsx` —— 服务端兜底守卫。即便中间件被绕过，`(app)` 布局仍在服务端 `auth.getUser()`，无 user 即 `redirect('/login')`。

> 当 Supabase 环境变量缺失（本地 dev，URL 含 `placeholder`）时两层守卫均放行，方便无凭证跑通；线上 osbornalpha.com 始终强制。**访客模式（Guest mode）已移除**——产品功能不再对陌生人开放，落地页是陌生人唯一能看到的产品表面。

---

## 1. 端到端主旅程（Happy Path）

```
陌生人
  │  访问 osbornalpha.com（落地页 /）
  ▼
落地页 /  ── 看到 Hero「你的 AI 投资 PM」+ 4 大功能卡 + 定价（Free / Pro「即将上线」）+ 免责声明
  │  CTA：未登录显示「免费注册 →」「登录」；已登录显示「进入工作台 →」
  ▼
注册 /register  ──或──  Google 一键登录 / 登录 /login
  │  邮箱+密码：signUp → 发确认邮件 → 点链接 → /auth/callback → 建会话
  │  Google OAuth：signInWithOAuth → 授权 → /auth/callback → 建会话
  │  魔法链接（/login 内可选）：signInWithOtp → 邮件链接 → /auth/callback
  ▼
工作台 /dashboard  ── 三栏：左 Watchlist 侧栏 · 中 个股详情 · 右 News & macro
  │  首登默认选中 00700.HK（腾讯）
  ▼
建股票池 /watchlist  ── 看板（Kanban）拖拽组织；搜索/批量导入 A/H/US 标的
  │  登录用户 → 写 Supabase（watchlists + watchlist_items，多端同步）
  ▼
阅读每日 AI 简报 /briefs  ── Sentinel Morning Note：Top Call + Top5 异动 + Trade Ideas + 委员会信心
  │  普通用户只阅读；管理员可在 /settings 手动推送到服务端托管的 Telegram / Email 目的地
  ▼
看雷达 /radar  ── 每只股一份 morning note，按 🔴关注/🟡留意/⚪️平静 分级
  │  ─→ 看委员会 /stock/[ticker] 的「AI 观点」标签：9 位大师独立研判
  ▼
回测 /backtest  ── 全股票池并发回测排行榜：质量分 / 命中率 / 信号活跃度
  ▼
设置 /settings  ── 账号管理（改邮箱/密码、绑定第三方、登出）+ 语言/时区 + 固定简报时间换算；管理员另见托管推送控件
```

---

## 2. 阶段拆解

### 2.1 陌生人 → 落地页（`/`，公开）

- 落地页是 `force-dynamic` 服务端组件，进入时即用 `serverIsSupabaseConfigured()` + `auth.getUser()` 判断 `authed`，据此切换导航与 CTA 文案。
- 内容：品牌 `osbornalpha` · Hero「你的 AI 投资 PM」+ 副文案「选股、监控、决策，一个工作台搞定」+ 「登录后进入产品 · 数据按账户独立存储与隔离」；右侧示例「今日 AI 简报」卡（置信度 7.8、腾讯/英伟达/茅台样例行、委员会观点「中性偏多」）。
- 4 张功能卡：① 个人股票池 + 每日 AI 简报 ② AI 投资委员会（巴菲特/芒格/德鲁肯米勒等）③ 信号雷达 + 回测 ④ John Cameron · PM 决策（五段式决策管线）。
- 定价：Free ¥0（个人股票池 / 每日 AI 简报 / 基础信号雷达）；Pro「即将上线」（无限委员会 / 完整回测+数据导出 / John Cameron PM 决策，价格 `¥—`，按钮「敬请期待」）。
- 底部固定免责声明：所有内容由 AI 生成，仅作决策辅助，不构成投资建议。

### 2.2 注册 / 登录（`/register` `/login`，公开）

三种入口，全部经 `src/components/AuthForm.tsx` 或登录页内联流程：

| 入口 | 机制 | 成功后 |
|---|---|---|
| 邮箱+密码注册 | `signUp({ email, password, emailRedirectTo: /auth/callback })`，密码 ≥8 位 | 显示「✅ 确认邮件已发送到 {email}」，点邮件链接 → 回调建会话 → 去登录 |
| 邮箱+密码登录 | `signInWithPassword`，密码 ≥8 位 | toast「✓ 登录成功」→ `window.location.href = '/dashboard'` |
| Google OAuth | `signInWithOAuth({ provider:'google', redirectTo:/auth/callback })`（另含 github/apple 按钮） | 授权后回调建会话 |
| 魔法链接（登录页可选） | `signInWithOtp({ email, emailRedirectTo:/auth/callback })` | 「✅ 链接已发到 {email}」 |

- 找回密码 `/forgot-password`：`resetPasswordForEmail(email, { redirectTo:/reset-password })`，成功显示「✅ 重置链接已发到 {email}」。
- 重置密码 `/reset-password`：用户从邮件进入（Supabase 用 URL 片段建恢复会话），输两次新密码（≥8 位、需一致）→ `updateUser({ password })` → 「✅ 密码已更新」→ 去登录。
- 边界：Supabase 未配置时 AuthForm 显示「⚠️ Supabase 环境变量未配置」并禁用所有按钮。

> **已知细节**：中间件在重定向时附 `?next={原路径}`，但 `AuthForm` / 登录页当前未读取 `next`，密码登录一律硬跳 `/dashboard`（见 §6 文档/代码差异）。

### 2.3 首次进入工作台（First-Run）

- 触发点：注册/登录建会话后落到 `/dashboard`。
- 默认状态：`/dashboard` 读 `?s=` 查询参数，缺省 `00700.HK`（腾讯）作为首个选中标的，中栏即展示其行情。
- 股票池为空时：去 `/watchlist`，看板空态卡提示「股票池是空的。点任意看板上的「＋ 加入股票」开始添加。」首登引导自然落在「建股票池」。
- 默认看板分组（mock / 兜底）：`长期持有`、`机会跟踪`、`仅观察`。

### 2.4 建股票池（`/watchlist`）

- 看板（Kanban）形态：横向滚动列，卡片可跨列拖拽、列头可拖拽重排。每 60s 自动刷新报价（`useBatchQuotes`）。
- 加股票：列内联搜索（debounce 250ms → `/api/search?q=`），支持代码/名称/拼音；无匹配可「强制加入」。
- 批量导入：CSV / Excel（`.xlsx/.xls/.xlsm/.xlsb`，≤2MB）/ 粘贴文本，自动识别 Wind / Yahoo / Sina / 雪球 / 同花顺 代码方言（`normalizeWindTicker`），去重后建新看板。
- 导出：YAML（`watchlist-{date}.yml`）。
- **持久化与隔离**：
  - 登录用户 → 写 Supabase `watchlists` + `watchlist_items`（按 `sort_order` 排序），RLS 按 `user_id` 隔离，多端同步。
  - 未登录/未配置 Supabase → 退化为浏览器 `localStorage`（键 `stock-monitor:watchlist:v2`），并显示「👤 访客模式（数据存浏览器本地）」横幅引导登录。
  - 该 `localStorage` 键被 watchlist / radar / backtest / stock-detail 四处共享读取。

### 2.5 阅读每日 AI 简报（`/briefs`）

- 简报历史页列出最近 30 天，每行链到 `/briefs/{date}` 详情；含信号命中率统计卡。
- 简报由 `src/lib/brief/composer.ts → generateDailyBrief()` 生成（结构见 [`21_REPORT_TEMPLATES_AND_OUTPUTS.md`](./21_REPORT_TEMPLATES_AND_OUTPUTS.md)）：Sentinel Morning Note 风格，含 Top Call、Overnight & Pre-Market（Top5）、Trade Ideas（置信 ≥7 才出）、委员会信心 X/10 + 标签。
- 推送目的地由服务端环境变量管理。管理员可在 `/settings` 发测试消息或立即生成并推送；普通用户不显示手动发送控件，也不能把该端点当作任意内容/收件人的转发器。任何页面都不展示完整收件地址/Chat ID。

### 2.6 看雷达 / 委员会（`/radar`、`/stock/[ticker]` 的「AI 观点」）

- 雷达：`GET /api/radar/batch?tickers=...` 为股票池每只股生成一份 morning note，按分值分 🔴关注（≥8）/🟡留意（≥4）/⚪️平静（<4）。卡片可看 Top Call、触发信号、北上/连板/公告一行摘要、完整 markdown 弹窗。
- 委员会：进个股 → 「AI 观点」标签 → `usePerspectives(ticker)` → `GET /api/perspectives/{ticker}`，9 位大师（buffett / munger / druckenmiller / marks / lynch / burry / zhang_kun / li_lu / duan_yongping）并发独立研判，按 看多/中性/看空 分组展示，附共识分与成本/耗时元信息。

### 2.7 回测（`/backtest`）

- `useBatchBacktest(tickers, days)`：对整股票池并发跑 N 天（30/60/90/120）回测排行榜。
- 质量分 = `60×Wilson 置信下限 + 20×log10(1+信号数)×1.2 + 20×min(5d 平均收益×5,1)`；可按质量分/置信下限/命中率/信号数/5d/20d 排序，按市场（A/HK/US）筛选。
- Headline 卡：命中率最高 / 最低 / 信号最活跃。

### 2.8 设置 / 账号管理（`/settings`）

- 账号区 `AccountSettings`：显示邮箱 + 套餐（Free/Pro，读 `profiles.plan`）+ 用户 ID 前 8 位；改邮箱、改密码、绑定/解绑第三方（google/github/apple，至少保留一种登录方式）、登出。
- 推送渠道：仅管理员显示 Telegram/Email「发测试」「立即生成并推送」；目的地明确标注为服务端托管，不提供收件人输入框、客户端存储或请求覆盖。普通用户调用发送 API 返回 `403`，不能代发/转发。
- 语言切换即时写入浏览器 `NEXT_LOCALE` cookie，并在已登录且 Supabase 已配置时同步写入 `user_preferences.language`；时区写入 `user_preferences.timezone` 并可跨端加载。简报时间不是可编辑偏好，页面只把固定的 00:30 UTC cron 换算为当前显示时区。管理员身份来自已认证服务端响应，不读取客户端存储。

---

## 3. 复访用户（Returning User）

- 已登录会话存在（Supabase cookie）：再次访问 `/` 时落地页 CTA 变「进入工作台 →」；访问 `/login` / `/register` 被中间件直接弹回 `/dashboard`。
- 工作台股票池从 Supabase 拉取（多端一致）；雷达/回测自动以当前股票池为输入。
- 复访典型动线：`/dashboard`（看昨夜异动）→ `/radar` 刷新（生成今日 morning notes）→ 对 🔴 标的进 `/stock/[ticker]` 看委员会 → `/briefs` 复盘。

---

## 4. 多端 / 跨设备（Multi-Device）

- **登录用户**：股票池存 Supabase（RLS 隔离），换设备登录即同步；账号、邮箱、绑定关系、套餐随账户走。
- **语言与时区**：时区保存到 `user_preferences` 并跨端加载；语言切换同时写 `user_preferences` 和浏览器 `NEXT_LOCALE` cookie，但当前界面 locale 仍由各浏览器的 cookie 解析。
- **简报时间与目的地**：每日简报固定 00:30 UTC 调度，设置页只显示对应本地时间；Telegram/Email 目的地是服务端部署配置，不是用户偏好，客户端不提供输入或存储。
- **未登录**：股票池仅在当前浏览器（`localStorage`），换设备不可见 —— 这是引导注册的核心动机。
- 会话由 Supabase SSR cookie 维持，中间件在每次请求刷新 user。

---

## 5. 访客受阻路径（Guest-Blocked）

| 陌生人尝试访问 | 结果 |
|---|---|
| `/dashboard` `/watchlist` `/radar` `/briefs` `/backtest` `/settings` `/stock/[ticker]` | 中间件 `302 → /login?next={路径}`；服务端布局兜底再 `redirect('/login')` |
| `/login` `/register`（已登录时） | `302 → /dashboard` |
| `/` `/about` | 放行（公开） |
| `/api/*` | 放行进路由，但各路由自带鉴权 / RLS；个人数据按 `user_id` 隔离 |
| 本地 dev（Supabase 未配置） | 两层守卫均放行，便于无凭证调试 |

**数据隔离原则**：所有用户业务数据（股票池等）由 Postgres RLS 按 `auth.uid()` 隔离，A 用户永远读不到 B 用户的股票池；公开数据（行情、财报、新闻）无隔离需求。

---

## 6. 用例表（Use-Case Table）

| # | 用例 | 主角色 | 入口 | 前置条件 | 主流程（关键步骤） | 涉及代码 | 异常 / 受阻 |
|---|---|---|---|---|---|---|---|
| UC-01 | 陌生人了解产品 | 访客 | `/` | 无 | 看 Hero/功能/定价/免责 → 决定注册 | `app/page.tsx` | 无（公开） |
| UC-02 | 邮箱注册 | 访客 | `/register` | Supabase 已配 | 填邮箱密码 → 收确认邮件 → 点链接 → 建会话 | `AuthForm`, `/auth/callback` | 密码<8 位被拦；未配置则禁用 |
| UC-03 | Google 登录 | 访客 | `/login` | 已配 Google OAuth | 点 Google → 授权 → 回调建会话 → `/dashboard` | `AuthForm.oauth` | OAuth 未配则失败 toast |
| UC-04 | 魔法链接登录 | 访客 | `/login` | 已配 | 输邮箱 → 发链接 → 点击 → 回调 | login 页内联 `signInWithOtp` | — |
| UC-05 | 找回 / 重置密码 | 注册用户 | `/forgot-password` → `/reset-password` | 有账号 | 发重置链接 → 点击 → 设新密码 | 两个 auth 页 | 链接过期需重申请 |
| UC-06 | 首次建股票池 | 新用户 | `/watchlist` | 已登录 | 搜索/导入加股票 → 拖拽分组 → 写 Supabase | `watchlist/page.tsx`, `/api/search` | 空态引导；未登录退化 localStorage |
| UC-07 | 批量导入标的 | 用户 | `/watchlist` 导入弹窗 | 已登录 | 上传 CSV/Excel 或粘贴 → 方言识别去重 → 建新看板 | `ImportDialog`, `normalizeWindTicker` | >2MB / 解析失败报错 |
| UC-08 | 查看个股全景 | 用户 | `/stock/[ticker]` | 已登录 | 行情/AI 观点/财报/新闻/信号/持仓 6 标签 | `stock/[ticker]/page.tsx`, `StockCenterPanel` | mock 缺数据→「未找到标的」 |
| UC-09 | 调阅 AI 投资委员会 | 用户 | 个股「AI 观点」 | 已登录、已配 LLM | 9 大师并发研判 → 看多/中性/看空 分组 | `/api/perspectives/[ticker]`, `personas.ts` | 无 LLM key → 配置引导块 |
| UC-10 | 生成每日雷达 | 用户 | `/radar` | 已登录、股票池非空 | 刷新 → 每股 morning note → 按级别筛选 | `/api/radar/batch`, `radar.ts` | 空池引导去 watchlist；单股失败单独标错 |
| UC-11 | 阅读每日简报 / 管理员手动推送 | 用户（阅读）/管理员（推送） | `/briefs`；管理员 `/settings` | 阅读需登录；手动推送需管理员 | 用户看历史/详情；管理员向服务端托管的 TG/Email 目的地立即推送 | `composer.ts`, `/api/brief/*` | 普通用户调用发送 API 返回 `403`；服务端未配渠道则跳过该 channel |
| UC-12 | 跑回测排行榜 | 用户 | `/backtest` | 已登录、股票池非空 | 选天数 → 并发回测 → 排序/筛选/看 headline | `useBatchBacktest`, `/api/backtest` | 跑中 loading；错误红卡 |
| UC-13 | 全局搜索跳转 | 用户 | TopBar 搜索（⌘K） | 已登录 | 输代码/名称 → 选结果 → `/stock/{ticker}` | `SearchInput`, `/api/search` | 无匹配显示「没有匹配结果」 |
| UC-14 | 管理账号 | 用户 | `/settings` 账号区 | 已登录 | 改邮箱/密码、绑定/解绑第三方、登出 | `AccountSettings` | 解绑后须留≥1 种登录方式 |
| UC-15 | 跨设备同步股票池 | 用户 | 任意设备 `/watchlist` | 已登录 | 换端登录 → 从 Supabase 拉取一致股票池 | Supabase RLS | 时区从服务端偏好加载；语言显示仍依赖各浏览器的 `NEXT_LOCALE` cookie |
| UC-16 | 访客被拦 | 访客 | 任意 `(app)` 路径 | 未登录 | 中间件 + 布局双重 `redirect('/login')` | `middleware.ts`, `(app)/layout.tsx` | 本地 dev 放行 |

---

## 7. 关键边界小结

- 公开仅 `/`、`/about` 与 auth 页族；其余皆需登录。
- 访客模式已下线；未登录的本地 `localStorage` 仅为「未配置 Supabase 的 dev 退化」与提示用，不是正式产品形态。
- 业务数据 Supabase RLS 隔离；行情/财报/新闻等公开数据共享。
- 时区是服务端账户偏好；语言选择虽同步写入服务端，但当前界面解析仍依赖浏览器 `NEXT_LOCALE` cookie。简报调度固定为 00:30 UTC，Telegram/Email 目的地仅由服务端部署配置管理，二者都不是本地用户偏好。
