<!-- 25 账号作用域与权限模型 · osbornalpha 每账号数据隔离/套餐/生命周期 · 最后更新 2026-06-20 -->

# 25 · 账号作用域与权限模型（Account Scope & Permission Model）

本文件描述 osbornalpha 的"每账号"数据模型：每张表如何被 `auth.uid()` 作用域化、`profiles` 的 plan/role 语义、free vs pro 权益（当前桩 + Phase 2 强制计划）、账号生命周期、第三方身份绑定、多设备会话。以仓库实际代码为准。

来源文件：`supabase/migrations/20260515000000_initial_schema.sql`、`20260621000000_profiles_and_billing_hooks.sql`、`src/lib/billing/entitlements.ts`、`src/components/AccountSettings.tsx`、`src/lib/supabase/{client,server}.ts`。

---

## 1. 作用域根：`auth.uid()`

每个登录用户对应 `auth.users` 中一行，其 `id`（UUID）就是租户键。所有"每用户"表通过外键 `user_id → auth.users(id)`（或 `id → auth.users(id)`）挂到这个根，并用 RLS 把 `auth.uid()` 当过滤器。

```
auth.users(id)  ← 租户根
   │ on delete cascade
   ├── profiles(id = auth.users.id)         1:1，套餐/角色/用量
   ├── user_preferences(user_id)            1:1，语言/配色/通知
   ├── watchlists(user_id) ──┐
   │     └── watchlist_items(watchlist_id, user_id)
   ├── briefs(user_id) ──────┐
   │     ├── stock_signals(brief_id, user_id)
   │     └── perspectives(brief_id, user_id)
   ├── news_items(user_id)
   └── broker_reports(user_id)

公共参考（无租户键，全员可读）：
   stocks_universe, financial_history
```

### 每张表的作用域策略

| 表 | 作用域键 | 客户端可执行的操作（RLS 策略） |
|---|---|---|
| `profiles` | `auth.uid() = id` | select（self read）、update（self update）。**无** insert / delete |
| `user_preferences` | `auth.uid() = user_id` | select / insert / update。**无** delete（随用户级联删） |
| `watchlists` | `auth.uid() = user_id` | select / insert / update / delete |
| `watchlist_items` | `auth.uid() = user_id` | select / insert / update / delete |
| `briefs` | `auth.uid() = user_id` | select / insert / delete（无 update） |
| `stock_signals` | `auth.uid() = user_id` | select / insert（无 update / delete；随 brief 级联删） |
| `perspectives` | `auth.uid() = user_id` | select / insert（同上） |
| `news_items` | `auth.uid() = user_id` | select / insert |
| `broker_reports` | `auth.uid() = user_id` | select / insert |
| `stocks_universe` | —（公共） | select only（`using (true)`），无写策略 |
| `financial_history` | —（公共） | select only，无写策略 |

要点：
- 子表（`watchlist_items`、`stock_signals`、`perspectives`）都**冗余存了 `user_id`**，使 RLS 策略能直接用 `auth.uid() = user_id` 而不必 join 父表 —— 简单、快、安全。
- 写入路径（如 `src/app/api/watchlist/route.ts`）显式带 `user_id: user.id`，与 RLS 的 `with check` 一致。
- 唯一约束保证作用域内不重复：`watchlist_items (watchlist_id, ticker)`、`briefs (user_id, brief_date, language)`。

---

## 2. `profiles`：plan / role / usage 语义

`profiles` 与 `auth.users` 1:1（`id` 同为 PK + FK，`on delete cascade`）。字段（见 `20260621000000_*.sql`）：

| 字段 | 类型 | 默认 | 语义 |
|---|---|---|---|
| `id` | uuid | — | = `auth.users.id`，租户根 |
| `email` | text | — | 注册时由触发器写入 `new.email` |
| `display_name` | text | null | 展示名（暂未在 UI 填写） |
| `plan` | text | `'free'` | `free` \| `pro`（Phase 2 计费目标列） |
| `role` | text | `'user'` | `user` \| `admin`（应用级角色） |
| `usage` | jsonb | `'{}'` | 预留：计数器 / 限额状态 |
| `stripe_customer_id` | text | null | 预留 Phase 2 Stripe |
| `created_at` / `updated_at` | timestamptz | `now()` | — |

权限语义（关键）：
- `plan` 与 `role` **当前在 RLS 上是用户自身可 update 的**（`profiles self update` 策略覆盖整行）。即 Phase 1 下，理论上用户能改自己的 `plan`/`role`。这是**已知的 Phase 1 限制**：迁移注释明确写道 "plan/role are NOT client-writable in Phase 2 (enforce via a column grant or trigger then)"。Phase 2 必须收紧（列级 grant 或 update 触发器拦截 plan/role/usage 列）。
- `role = 'admin'` 目前**无代码消费**（grep 无引用）—— 是预留位，不构成提权风险，但 Phase 2 引入 admin 能力前必须先锁死 `role` 的客户端可写性。
- 读取入口：服务端 `src/lib/billing/entitlements.ts`（`select('plan')`）；客户端 `AccountSettings.tsx`（展示套餐）。

---

## 3. Free vs Pro 权益（Entitlements）

定义于 `src/lib/billing/entitlements.ts`。**当前为只读桩，无任何强制。**

```ts
type Plan = 'free' | 'pro';
interface Entitlements {
  plan: Plan;
  maxWatchlistItems: number;   // -1 = unlimited
  aiCommitteePerDay: number;   // -1 = unlimited
  canExport: boolean;
}
const PLANS = {
  free: { plan:'free', maxWatchlistItems: 50, aiCommitteePerDay: 20, canExport: true },
  pro:  { plan:'pro',  maxWatchlistItems: -1, aiCommitteePerDay: -1, canExport: true },
};
```

- `entitlementsForPlan(plan)`：把 `profiles.plan` 映射成能力标志；未知值回退 `free`。
- `getEntitlements()`：服务端解析当前用户权益；Supabase 未配置 / 无 user / 无 profile 时回退 `free`。
- **现状事实**：这些标志（`maxWatchlistItems` 等）**在代码任何地方都未被检查**。注释自陈 "Phase 1 returns generous free-tier values; not yet enforced anywhere"。所以当前 free 与 pro 的实际能力**没有差别**。
- 文件头注释仍写 "Defaults to free for guests" —— 这是**遗留措辞**：访客模式（guest mode）已随 2026-06-20 的 auth gate 移除，此处"guest"应理解为"未登录/未配置回退"。

### Phase 2 强制计划（来自代码注释与 AUTH_SETUP §5）

1. 接入 Stripe：checkout + webhook，webhook 写 `profiles.plan` 与 `stripe_customer_id`。
2. 在 `entitlements.ts` 增加强制逻辑；在写入路径（如加自选 `POST /api/watchlist`）检查 `maxWatchlistItems`、在 AI 委员会调用处检查 `aiCommitteePerDay`（配合 `profiles.usage` 计数）。
3. 锁死 `plan`/`role`/`usage` 的客户端可写性（见 §2）。
4. 套餐升降级 UI。

---

## 4. 账号生命周期（Lifecycle）

### 4.1 注册 → 默认行（触发器）

`handle_new_user()`（security definer，`set search_path = public`），由 `on_auth_user_created`（`after insert on auth.users`）触发：

```sql
insert into watchlists (user_id, name, description, is_default)
  values (new.id, '我的股票池', '默认股票池', true);
insert into user_preferences (user_id) values (new.id);
insert into profiles (id, email)
  values (new.id, new.email) on conflict (id) do nothing;
```

- 新用户落地即有：一个默认股票池（`is_default = true`）、一份默认偏好（语言 zh、配色 cn 红涨、时区 Asia/Shanghai、每日简报 08:30）、一行 profile（默认 free / user）。
- `security definer` 让触发器以函数所有者权限插入，绕过 RLS（用户此刻还没会话）。`on conflict do nothing` 保证幂等。
- 迁移含**回填**：为应用迁移前已存在的用户补 `profiles` 行。

### 4.2 删除 → 级联清理

- 删除 `auth.users` 中一行 → **所有**外键 `on delete cascade` 链式清空该用户的 profiles / preferences / watchlists（→ items）/ briefs（→ signals / perspectives）/ news_items / broker_reports。
- 即"删账号"是单点操作，数据自动连根拔除，无孤儿行。
- 当前**应用内无自助删号 UI**；删除经由 Supabase 控制台 / Admin API。

---

## 5. 第三方身份绑定（Identity Linking）

实现于 `src/components/AccountSettings.tsx`，依赖 Supabase Auth 的 manual linking（AUTH_SETUP 中已在控制台开启）。

- 可绑定 provider：Google、GitHub、Apple（`LINKABLE`）。
- 绑定：`auth.linkIdentity({ provider, options:{ redirectTo: origin + '/auth/callback' }})`。
- 解绑：`auth.unlinkIdentity(identity)`，但**强制至少保留一种登录方式**（`identities.length <= 1` 时拒绝，提示"至少保留一种登录方式"）—— 防止用户把自己锁在门外。
- 同一 `auth.users` 可挂多个 identity；`user.identities` 列出已绑定 provider，UI 据此显示"已绑定/绑定/解绑"。
- Google OAuth 走 `linkIdentity` 做账号绑定（而非新建账号），实现"一个账号多登录入口"。

---

## 6. 多设备会话（Multi-device Sessions）

- 会话基于 `@supabase/ssr` 的 Cookie + JWT（access token + refresh token），每个浏览器/设备独立持有一份。
- 同一账号可在多设备同时在线 —— 各自独立刷新令牌，互不影响。
- 登出（`AccountSettings.logout()` 或 `/api/auth/logout`）调用 `signOut()`，默认作用于**当前设备会话**（清当前 Cookie）；其他设备会话不受影响，直到其令牌过期或被显式登出。
- 改密码（`updateUser({ password })`）由 Supabase Auth 处理，其它会话的失效行为遵循 Supabase 默认策略。
- RLS 与会话无关：无论几台设备，查询都按该会话 JWT 的 `auth.uid()` 行级裁剪 —— 多设备不放大数据可见范围。

---

## 7. 已知遗留与待清理（与权限相关）

供后续维护参考，均为事实陈述：
- `entitlements.ts` 头注释 / `getEntitlements` 仍以 "guest" 措辞描述未登录回退；访客模式已移除。
- `AccountSettings.tsx` 在 `!user` 时仍渲染"访客模式 — 数据存浏览器本地"分支；在 auth gate 下未登录用户根本到不了 `/settings`，该分支已不可达，属遗留 UI。
- `src/app/api/watchlist/route.ts` 的未配置分支返回文案含 "guest mode uses localStorage" —— 遗留措辞。
- Phase 1 下 `plan`/`role` 客户端可写（§2），Phase 2 必须收紧。

---

## 8. 关联文档

- 威胁模型与控制 → `08_SECURITY_AND_PERMISSIONS.md`
- 生产 SQL / RLS-by-default / 迁移规范 → `20_SQL_SAFETY_AND_AUDIT_POLICY.md`
- 控制台配置 → `docs/AUTH_SETUP.md`
