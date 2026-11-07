# 浏览器核对（2026-11-07，本机 guest 模式，HEAD 6afe800 + Task 18 进行中）

环境：工作树内 `npx next dev -p 3107`，无 `.env.local`（没有 Supabase），Claude 桌面内置浏览器。所有 `/api/macro/*` 读路由要求登录 session，所以 guest 模式下返回 401——这正是 §2 的预期行为，页面应显示错误态而不是数字或崩溃。

| 页面 | 结果 |
|---|---|
| `/intel/macro` | 标题、"仅事实……判断层默认关闭"说明、US/CN 切换、四个 tab 正常；正文显示 "Could not load: unauthenticated"；**无任何判定/象限/得分文案** |
| `/intel/macro/US_DGS10` | 头部字段显示 `—`、可得依据 "first seen (first_seen)"、窗口 3Y/5Y/10Y/All 与 Level/Period change 控件在出错后仍可见；历史区显示 "Could not load: unauthenticated" |
| `/today` | "Macro glance" 卡显示 "Macro data unavailable" 与 "Open macro workbench →"；**SSE/HSI/Nasdaq/DXY/US10Y 的 mock 行已不存在** |
| `/intel` | 新 "MACRO" 摘要卡显示 "Macro data unavailable" 与 "Open workbench →" |

控制台：仅 401（预期）。未做：带真实数据的渲染核对——本机 harness 没有 PostgREST/Auth，需要在生产启用后由 prod 会话按 runbook "Production bring-up" 第 5 步用登录用户核对（指标表、证据抽屉字段、详情页表格视图、关联工作台、Today 卡显示 US/CN 事实）。
