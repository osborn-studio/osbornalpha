<!-- 08 安全与权限 · osbornalpha 威胁模型与控制措施总览 · 最后更新 2026-06-20 -->

# 08 · 安全与权限（Security & Permissions）

本文件描述 osbornalpha（代号 stock-monitor）的安全模型：边界在哪、用什么控制、风险与缓解。
所有内容以仓库实际代码为准，引用文件均给出路径。

技术栈：Next.js 14 App Router + Supabase（Auth + Postgres + RLS，`@supabase/ssr`），部署在 Vercel（osbornalpha.com）。Supabase 项目 ref = `mzfcaabhuwtfvsvadvsv`。

---

## 1. 信任边界（Trust Boundaries）

```
浏览器 (不可信)
  │  HTTPS + Supabase 会话 Cookie
  ▼
Vercel Edge / Next.js (半可信)
  ├── src/middleware.ts            ← 第一道：认证门 (auth gate)
  ├── src/app/(app)/layout.tsx     ← 第二道：服务端守卫 (server guard)
  └── src/app/api/**               ← 每个路由各自校验 auth + 走 RLS
  │  Supabase 客户端 (anon key, 受 RLS 约束)
  ▼
Supabase Postgres (可信，最终防线)
  └── Row Level Security 按 auth.uid() 行级隔离  ← 数据隔离主干
```

关键原则：**前端和 API 都可能被绕过或伪造，唯一不可绕过的隔离层是数据库的 RLS。** 上层（middleware、layout、API 校验）是纵深防御，不是隔离的根本依靠。

---

## 2. 认证门：双层防御（Auth Gate）

产品**不可公开浏览**。除营销落地页和认证页外，一切都需要有效 Supabase 会话。

### 2.1 第一道 — middleware（`src/middleware.ts`）

- 公开白名单 `PUBLIC_PATHS`：`/`、`/about`、`/login`、`/register`、`/forgot-password`、`/reset-password`。
- 前缀放行：`/auth/*`（OAuth / 邮件回调）、`/api/*`（API 路由自带 RLS/鉴权）。
- 行为：
  - 未登录访问受保护路径 → 302 到 `/login?next=<原路径>`。
  - 已登录访问 `/login` 或 `/register` → 302 到 `/dashboard`。
- 用 `createServerClient` + `supabase.auth.getUser()` 校验会话（读 Cookie）。
- **降级开关**：当 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 缺失或含 `placeholder`（本地 dev）时，门**整体关闭**，让应用无 env 也能跑。这是有意设计，但意味着：**生产环境必须保证这两个变量正确，否则等于全站公开。**
- `matcher` 排除 `_next/static`、`_next/image`、`favicon.ico`。

### 2.2 第二道 — 服务端守卫（`src/app/(app)/layout.tsx`）

- 受保护路由组 `(app)`（dashboard / stock / watchlist / radar / briefs / backtest / settings）的服务端 layout。
- `serverIsSupabaseConfigured()` 为真时，`getServerSupabase().auth.getUser()`，无 user 直接 `redirect('/login')`。
- 定位：belt-and-suspenders（背带加吊带）。即使 middleware 被绕过（如 matcher 配置失误），server guard 也不会把产品 UI 泄露给未登录用户。
- 同样有 dev 降级：未配置 Supabase 时放行。

---

## 3. RLS：数据隔离主干（Row Level Security）

这是真正的多租户隔离层。见 `supabase/migrations/20260515000000_initial_schema.sql` 与 `20260621000000_profiles_and_billing_hooks.sql`。

### 3.1 规则

- **所有表 `enable row level security`。** 无例外。
- 每用户表（`watchlists`、`watchlist_items`、`briefs`、`stock_signals`、`perspectives`、`news_items`、`broker_reports`、`user_preferences`、`profiles`）的策略一律用 `auth.uid() = user_id`（`profiles` / `user_preferences` 用 `auth.uid() = id` / `= user_id`）。
- 公共参考表（`stocks_universe`、`financial_history`）：`for select using (true)`，所有人可读、无人可写（无 insert/update/delete 策略 = 客户端写入被拒）。
- `profiles`：仅 `self read` + `self update`，**没有 client 端 insert / delete 策略** —— 行由注册触发器（security definer）创建，由 `auth.users` 级联删除清理。
- 写策略用 `with check (auth.uid() = user_id)`，确保用户不能替别人写入。

### 3.2 为什么 RLS 是根本

因为前端用的是 **anon/publishable key**，它本身没有特权 —— 它带着用户会话 JWT 去查库，Postgres 用 `auth.uid()` 在行级裁剪结果。即使攻击者伪造 API 请求或直接拿 anon key 连库，也只能看到自己 `auth.uid()` 的行。**绕过 UI ≠ 绕过 RLS。**

---

## 4. 密钥管理：什么是公开的，什么不能泄露（Secrets）

| 变量 | 性质 | 是否公开 | 用途 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 项目 URL | **公开**（打进前端 bundle） | 客户端/服务端建 Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`（新版 `sb_publishable_…`） | anon / publishable key | **公开**（设计如此） | 受 RLS 约束的客户端访问 |
| `SUPABASE_SERVICE_ROLE_KEY`（新版 `sb_secret_…`） | service_role / secret key | **绝密**，仅服务端，**永不**加 `NEXT_PUBLIC_` 前缀 | 绕过 RLS 的高权限操作 |
| `CRON_SECRET` | Cron 鉴权 Bearer | 绝密 | 见 §7 |
| `CACHE_PURGE_SECRET` | 缓存清除头 | 绝密 | 见 §7 |
| LLM / 数据源 key（`DEEPSEEK_API_KEY` 等） | 第三方 key | 绝密，仅服务端 | AI 委员会、行情数据 |

要点：
- **anon key 公开是正常的、安全的** —— 它的权限完全由 RLS 决定。把它当机密反而是误解。
- **service_role key 会绕过所有 RLS。** 一旦泄露到客户端 = 全库裸奔。规则：永不带 `NEXT_PUBLIC_` 前缀，永不出现在任何会进 bundle 的代码里。
- **现状（重要事实）**：`SUPABASE_SERVICE_ROLE_KEY` 已由服务端 admin client 用于平台计量/成本审计、Stripe webhook 与管理路径，因此生产必需。缺失时相关高权限路径失败关闭；它仍然只能存在于服务端 secret store，绝不进入客户端 bundle。

---

## 5. OAuth 回调地址白名单（Redirect URL Allowlist）

OAuth / magic-link / 重置密码都依赖 Supabase 的 Redirect URL 白名单。配置不当会导致开放重定向或回调失败。

实际配置（见 `docs/AUTH_SETUP.md`）：
- **Supabase 端 OAuth provider 回调**（Google / GitHub 填这个）：`https://mzfcaabhuwtfvsvadvsv.supabase.co/auth/v1/callback`。
- **应用端 Redirect URLs**（Supabase → Auth → URL Configuration）：
  - Site URL：`https://www.osbornalpha.com`
  - 通配：`www.osbornalpha.com/**`、`osbornalpha.com/**`、`localhost:3000/**`
  - 显式：`/auth/callback`、`/reset-password`（及预览域名同两条，按需）。
- 应用内回调路由：`src/app/auth/callback/route.ts` —— 用 `exchangeCodeForSession(code)` 换会话，成功后跳 `next`（默认 `/dashboard`），失败跳 `/login?error=auth_failed`。
- 第三方绑定 `linkIdentity` 的 `redirectTo` 固定为 `${window.location.origin}/auth/callback`（`src/components/AccountSettings.tsx`）。

风险：白名单过宽（如裸 `**`）会被滥用做开放重定向。当前用域名前缀通配 + 显式路径，范围可控。新增部署域名时同步加白名单。

---

## 6. 会话 Cookie（`@supabase/ssr`）

- 浏览器侧：`createBrowserClient`（`src/lib/supabase/client.ts`）。
- 服务端侧：`createServerClient` + Next `cookies()`（`src/lib/supabase/server.ts`）；middleware 用 request/response 的 cookie 桥接。
- 会话存于 Supabase 管理的 HTTP Cookie，由 `@supabase/ssr` 在 SSR / middleware / RSC 间同步读写。
- RSC 上下文不能写 Cookie，`server.ts` 的 `setAll` 用 `try/catch` 静默吞掉写失败（注释明确：safe to ignore）—— 刷新令牌的写入交给 middleware/route handler 完成。
- 登出：`src/app/api/auth/logout/route.ts`（GET/POST 都 `signOut()` 清 Cookie）+ 客户端 `AccountSettings` 的 `signOut()`。
- Cookie 安全属性（HttpOnly/Secure/SameSite）由 `@supabase/ssr` 默认值控制；生产为 HTTPS（osbornalpha.com）确保 Secure 生效。

---

## 7. API 鉴权（API Auth）

middleware 对 `/api/*` 整体放行（前缀豁免），因此**每个需要保护的 API 路由必须自己校验**。现状：

- **用户数据路由**（如 `src/app/api/watchlist/route.ts`）：`getServerSupabase().auth.getUser()`，无 user 返回 `401 Not authenticated`；写入显式带 `user_id: user.id`，再叠加 RLS 双保险。
- **Cron 路由**（`src/app/api/cron/daily-radar`、`daily-brief`）：用 `Authorization: Bearer ${CRON_SECRET}` 校验；`?preview=1` 跳过鉴权只返回渲染结果不发送；`?force=1` 可在设了 secret 时手动触发。**注意**：若 `CRON_SECRET` 未设置，鉴权被跳过（`if (secret && ...)`）—— 生产必须设置该变量。
- **缓存清除**（`src/app/api/cache/revalidate`）：有 `CACHE_PURGE_SECRET` 时校验 `X-Purge-Secret` 头；否则注释假设"middleware 的会话门已挡住未认证请求"。**这条假设在当前 auth gate 下不再成立**（`/api/*` 被前缀豁免，middleware 不再拦 API），故**生产务必设置 `CACHE_PURGE_SECRET`**，否则该端点对任何人开放。

---

## 8. 邮箱确认与账号操作（Email Confirmation）

- Supabase Auth 开启 **Confirm email**：注册后需点确认邮件链接（见 AUTH_SETUP）。
- 改邮箱（`AccountSettings.changeEmail`）：`updateUser({ email })` 会向新旧邮箱各发确认邮件。
- 改密码：`updateUser({ password })`，要求 ≥ 8 位（前端校验）。
- 忘记/重置密码：`/forgot-password` → 邮件 → `/reset-password`。
- 邮件配额：默认 Supabase SMTP 配额低；正式上线建议配自有 SMTP（Resend/SES），避免确认邮件被限流导致注册卡死。

---

## 9. 常见风险与缓解（Risks & Mitigations）

| 风险 | 缓解 |
|---|---|
| 生产 Supabase env 缺失 → auth gate 自动关闭 → 全站公开 | 部署校验：上线前确认 `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` 已设且不含 `placeholder`；监控首屏是否要求登录 |
| service_role key 泄露 → 绕过全部 RLS | 永不加 `NEXT_PUBLIC_`；仅服务端 admin client 读取；发布前只验证存在性，不输出值/指纹 |
| API 路由漏写鉴权 → 数据越权 | RLS 兜底（越权写入被拒）；新增 `/api` 路由 checklist 必含 `getUser()` + 401 |
| Cron / 缓存清除端点 secret 未设 → 公开触发 | 生产必设 `CRON_SECRET`、`CACHE_PURGE_SECRET`；§7 已标注 |
| OAuth 回调白名单过宽 → 开放重定向 | 域名前缀通配 + 显式路径；回调失败统一跳 `/login?error=auth_failed` |
| RLS 策略遗漏某表 → 跨租户泄露 | "RLS-by-default"硬规则（见 `20_SQL_SAFETY_AND_AUDIT_POLICY.md`）；建表即写策略，code review 检查 |
| 注册触发器失败 → 用户无默认行 | `handle_new_user()` 为 security definer + `on conflict do nothing`；迁移含回填 |
| XSS 注入 LLM/外部内容 | Cron HTML 邮件用 `escapeHtml()` 转义；前端渲染 markdown 需走可信渲染器 |
| 暴力撞库 / 滥用注册 | 依赖 Supabase Auth 内置速率限制 + 邮箱确认；Phase 2 可加额外限流 |

---

## 10. 与其他文档的关系

- 账号级数据模型与权限语义 → `25_ACCOUNT_SCOPE_AND_PERMISSION_MODEL.md`
- 在生产库跑 SQL / 迁移 / RLS-by-default 规则 → `20_SQL_SAFETY_AND_AUDIT_POLICY.md`
- 外部控制台配置步骤 → `docs/AUTH_SETUP.md`
