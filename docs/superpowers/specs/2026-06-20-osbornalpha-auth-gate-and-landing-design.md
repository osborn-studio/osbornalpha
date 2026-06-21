# osbornalpha — 门禁 + 营销落地页 设计规格

- 日期: 2026-06-20
- 项目: stock-monitor (对外品牌 osbornalpha.com)
- 关联 OSStack 卡: `card_94e2aab2`(design)、`card_2df2b68d`/`card_987d7058`/`card_350ff89c`/`card_d4ca7a8f`/`card_41284585`(code/test/ship)、`card_d65f3891`(文档包,独立线)
- 状态: 已批准(用户选定 Approach A + osbornalpha 主品牌 + Free/Pro 定价 + Claude Design 高保真 GUI)

## 1. 背景与问题(此前的逻辑错误)

当前 [src/middleware.ts](../../../src/middleware.ts) 只刷新 Supabase 会话、**不拦截任何路由**(注释明文写 "the app is publicly browsable (guest mode)")。所有页面对任何人直接渲染:陌生人访问 osbornalpha.com 即可使用完整产品 + 演示数据 + 公开股票库。

- RLS 确实隔离了用户私有数据(watchlists/briefs/perspectives 按 `auth.uid()`),访客查询返回空,**不存在用户间数据泄露**。
- 但**产品本身没有门禁**:一个要对外售卖的 SaaS,不应让陌生人随意浏览整个产品。付费墙/门禁应在最前面。这是此前 guest-mode 决策的错误,本规格修正它。

> 注:用户提到的"渠道分析/品类分析/客户类型/每日收入趋势"报告**不属于 stock-monitor**(本产品页面是 股票池/雷达/简报/回测),疑似另一个项目;本规格只处理 osbornalpha/stock-monitor。

## 2. 决策

| 项 | 决策 |
|---|---|
| 门禁模型 | 营销落地页 + 应用全门禁 |
| 路由架构 | Approach A:Next.js 路由组拆分(URL 基本不变) |
| 品牌 | 全站统一 `osbornalpha`(app 头部 StockMonitor → osbornalpha,副标「AI 投资监控工作台」) |
| 定价 | 落地页展示 Free / Pro,Pro 标「即将上线」(Stripe = Phase 2) |
| 高保真 GUI | 落地页 + 登录/注册页 用 frontend-design(Claude Design)skill 出深色高保真,匹配 app 视觉;Stitch 可作风格参考 |

## 3. 路由架构(Approach A)

```
src/app/
  page.tsx                 → 改为【公开营销落地页】
  about/page.tsx           → 公开(保留)
  login|register|forgot-password|reset-password  → 公开(保留,去掉访客入口)
  auth/callback            → 公开(OAuth/邮件回调)
  (app)/                   → 新建【受保护路由组】
    layout.tsx             → 服务端 auth 守卫 + app 外壳(头部/底部导航)
    dashboard/page.tsx     → 工作台(从原 / 迁入)
    watchlist/page.tsx     → 迁入(URL 仍为 /watchlist)
    radar/page.tsx         → 迁入(/radar)
    briefs/page.tsx        → 迁入(/briefs)
    backtest/page.tsx      → 迁入(/backtest)
    settings/page.tsx      → 迁入(/settings)
```

- 路由组 `(app)` 不改变 URL 路径:`/watchlist` 等保持原样,只是统一套上登录守卫 + 外壳。
- 原工作台在 `/`,迁到 `/dashboard`;导航「首页」指向 `/dashboard`。
- 原 app 外壳(头部 + 底部导航)从根 layout 下沉到 `(app)/layout.tsx`;根 layout 只保留 `<html>`/全局样式,使落地页与登录页不带 app 外壳。

## 4. 门禁强制(双保险)

1. `middleware.ts`:
   - 未登录访问受保护路径 → 302 `/login`(可带 `?next=` 回跳)。
   - 已登录访问 `/login`、`/register` → 302 `/dashboard`。
   - 公开白名单:`/`、`/about`、`/login`、`/register`、`/forgot-password`、`/reset-password`、`/auth/callback`、`/_next/*`、`favicon`、静态资源。
   - 删除 "publicly browsable (guest mode)" 逻辑与注释。
2. `(app)/layout.tsx`:服务端 `getServerSupabase().auth.getUser()`,无会话 `redirect('/login')`。即便中间件被绕过也守得住。

## 5. 登录后流向

- 登录 / 注册 / Google 成功 → `/auth/callback` → `/dashboard`(回调 redirect 目标改为 /dashboard 或 `next`)。
- 已登录访问 `/`:落地页 hero 的 CTA 显示「进入工作台」(→ /dashboard)而非「登录/注册」。不强制跳转,允许已登录用户查看营销页。

## 6. 移除 guest 模式

- 登录页删除「← 返回(继续访客模式)」入口。
- 各产品页内 `!user` 的「访客提示/登录后同步」分支简化或移除(登录已是进入前提)。
- `src/lib/data/mock.ts` 保留,仅用于空态/演示,不再作为"访客可浏览"卖点。

## 7. 营销落地页内容(`/`)

深色,匹配 app 视觉,frontend-design 出高保真:
- Hero:`osbornalpha — 你的 AI 投资 PM`;副标「选股、监控、决策,一个工作台搞定」;CTA 免费注册 / 登录;市场标签 A股·港股·美股;一行「登录后进入产品」。
- 功能区 ×4:个人股票池+每日 AI 简报 · AI 投资委员会(多大师视角)· 信号雷达+回测 · John Cameron PM 决策。
- 定价:Free(¥0:股票池/每日简报/基础雷达)· Pro(即将上线:无限委员会/完整回测+导出/PM 决策)。
- 免责声明 + 页脚。

## 8. 不做(YAGNI)

Stripe 实付、Pro 真功能闸(entitlements 仍只读)、只读 demo 模式、Apple/GitHub provider(按钮在,未配)。

## 9. 验收 / 测试

- 未登录访问 `/dashboard`、`/watchlist` 等 → 跳 `/login`。
- 登录后访问受保护页正常;访问 `/login`、`/register` → 跳 `/dashboard`。
- `/` 落地页对所有人可见;已登录显示「进入工作台」。
- 两个账号 RLS 隔离不变(回归)。
- `npm run typecheck` + `npm run build` 绿。
- 线上:重新部署 osbornalpha,未登录看到落地页而非产品。

## 10. 文档包(并行第二条线,card_d65f3891)

门禁定稿落地后,把本架构变更并入产品设计 Markdown 文档包(00–27 适配 osbornalpha)。独立交付,不阻塞本门禁实现。
