# M3 Stripe 支付 Implementation Plan

> superpowers:subagent-driven-development or executing-plans。Spec: `docs/superpowers/specs/2026-07-03-m3-stripe-payments-design.md`（双币种修订版）。
> **分工约定**: T0（Stripe 商品创建、service-role key 配置等秘钥操作）由 coordinator 亲自执行，不入 subagent 转录；T1-T4 实现者执行。

## File Structure

- Create: `supabase/migrations/20260703120000_stripe_billing.sql` — `alter table profiles add column plan_expires_at timestamptz;` + `create table stripe_events (id text primary key, created_at timestamptz not null default now());`（无 RLS——仅 service-role 写；加注释说明）
- Modify: `database.types.ts`（Profile.plan_expires_at + stripe_events 注册）
- Create: `src/lib/billing/plan.ts` + `plan.test.ts` — effectivePlan / extendPass 纯函数
- Modify: `src/lib/billing/quota.ts`、`src/app/api/usage/today/route.ts` — 改用 effectivePlan；usage/today 响应加 `{plan_effective, plan_expires_at}`
- Create: `src/lib/supabase/admin.ts` — service-role client（文件头警示：绕 RLS，仅 webhook/系统上下文可 import）
- Create: `src/lib/billing/stripe.ts` — Stripe SDK 单例 + `getOrCreateCustomer(userId, email)`（读写 profiles.stripe_customer_id）
- Create: `src/app/api/stripe/checkout/route.ts`、`src/app/api/stripe/webhook/route.ts` + `webhook-handlers.ts` + `webhook-handlers.test.ts`（分发逻辑抽纯函数便于 TDD：输入 event 对象+admin client mock，输出动作）
- Create: `src/components/UpgradeCard.tsx`；Modify: settings 页挂载、`QuotaNotice.tsx` 加升级链接
- 依赖: `npm i stripe`

## Tasks

### T0（coordinator 亲自）: Stripe 商品 + service-role env
① Management API 取 Supabase service_role key → `vercel env add SUPABASE_SERVICE_ROLE_KEY production`（stdin，不落转录）。② Stripe API 建 Product+双币 Prices（先按 lookup_key 查重，幂等）→ price id → `vercel env add STRIPE_PRICE_PASS_30D / STRIPE_PRICE_SUB_MONTHLY`。③ 本地 `.env.local` 不配（测试用 mock）。

### T1: 迁移 + 类型
SQL 如上；`supabase db push`；migration list 对齐回执。types 同步。
Commit: `feat(billing): plan_expires_at + stripe_events migration`

### T2: plan.ts (TDD) + quota 接线 + admin client
```ts
effectivePlan(plan: string|null, expiresAt: string|null, now: Date): string
// 'pro' && (expiresAt null || > now) → 'pro'; 'pro' 过期 → 'free'; 其余原样（'free'/null→'free'）
extendPass(current: string|null, now: Date, days = 30): string  // ISO of max(now, current)+days
```
测试 ≥7：null expires（订阅态）、未过期、恰好 now（过期，用 > 严格比较且测试锁定）、过期回落、extendPass 从零/从未来余量叠加/从过期起算。quota.ts 与 usage/today 改造（同源 effectivePlan）；admin.ts（createClient(url, SERVICE_ROLE_KEY, {auth:{persistSession:false}})，缺 env 时 throw 带清晰信息）。
Commit: `feat(billing): effective-plan resolution (TDD) + service-role client`

### T3: checkout + webhook
- checkout：401 未登录；body.mode 白名单；`getOrCreateCustomer`；Session 参数照 spec §3（pass: payment_method_types ['alipay','wechat_pay','card'] + `payment_method_options.wechat_pay.client='web'`；subscription: ['card']；`client_reference_id`+`metadata.user_id`；success `/settings?upgraded=1`）；返回 {url}。
- webhook：`export const dynamic='force-dynamic'`；raw body `await req.text()`；constructEvent 校验失败 → 400；**先插 stripe_events 去重**（冲突→200 'duplicate' 直接返回）；分发到 `webhook-handlers.ts` 纯函数（handleCheckoutCompleted / handleSubscriptionEnded），由其返回要执行的 profiles 更新，route 用 admin client 落库。降级保护：subscription 结束时仅当 `plan_expires_at` null 或已过期才降 free（时长卡余量保护，spec §3）。
- handlers 测试：completed-payment 发卡（extendPass 叠加）、completed-subscription（expires 置 null）、sub-deleted 有余量保护/无余量降级、重复 event 去重、坏签名 400（route 层测试用 stripe.webhooks.generateTestHeaderString）。
Commit: `feat(billing): stripe checkout + idempotent webhook`

### T4: UpgradeCard + 接入
UpgradeCard：读 /api/usage/today 的 plan_effective/plan_expires_at 显示当前档位与到期日；两按钮 POST checkout {mode} → location=url；`?upgraded=1`（useSearchParams？settings 页是 client——直接 window.location.search 读，避免 Suspense 问题）→ 成功横幅。挂 settings（UsageToday 下方，id="upgrade"）；QuotaNotice 加 `<Link href="/settings#upgrade">升级 Pro →</Link>`。
Commit: `feat(billing): upgrade card + quota-notice upsell`

### T5: 终审 + 合并 + 上线验证
终审重点：webhook 签名/幂等/余量保护、admin client 泄漏面（grep 只有 webhook import）、checkout 401。合并 push 后上线清单：用户核对 Stripe endpoint URL+四事件 → 真实 ¥68 支付宝支付一笔 → /settings 档位变 pro、到期日 +30d → Dashboard 退款（手动，库不自动回滚——spec §6）→ Roll secret key。
