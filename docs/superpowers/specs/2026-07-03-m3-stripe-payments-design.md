# M3 支付（Stripe 双轨）— 设计文档

**日期**: 2026-07-03　**状态**: 已获用户逐节批准
**前提**: 用户已有激活的 Stripe live 账户；三个密钥已入 Vercel 生产 env（`STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`）。调研结论：Stripe 上支付宝/微信仅支持单次支付，信用卡才能自动续费 → **双轨**。

## 0. 已确认决策

| 决策 | 结论 |
|---|---|
| 渠道 | Stripe（用户已有 live 账户，跳过实体问题） |
| 计费形态 | **双轨**：时长卡（单次 ¥68 / 30 天，支付宝/微信/卡）+ 信用卡自动订阅（¥68/月） |
| 定价 | **双币种**：¥68 CNY + $9.9 USD（Stripe multi-currency price，Checkout 按买家地区自动选币；2026-07-03 全球化战略修订），首发值可改 |
| 到期降级 | 惰性判定（effectivePlan 纯函数），零 cron |
| 时长卡叠加 | 允许：`expires = max(now, 现有) + 30d` |

## 1. Stripe 商品（API 创建，非手动）

Product `OsbornAlpha Pro`；Price A one-time（lookup_key `pass_30d`）与 Price B recurring 月付（lookup_key `sub_monthly`），**均为 multi-currency**：`currency: cny, unit_amount: 6800` + `currency_options.usd.unit_amount: 990`。Checkout 按买家可用支付方式/地区自动选币。创建脚本一次性执行，price id 写入 Vercel env `STRIPE_PRICE_PASS_30D` / `STRIPE_PRICE_SUB_MONTHLY`。

## 2. 数据模型

迁移：`alter table profiles add column plan_expires_at timestamptz;`（`supabase db push` 直上生产）。

```ts
// src/lib/billing/plan.ts (纯函数, TDD)
effectivePlan(plan: string|null, expiresAt: string|null, now: Date): 'free'|'pro'|string
// plan==='pro' && (expiresAt===null || expiresAt>now) → 'pro'；pro 已过期 → 'free'；
// 其他值（admin 由 role 处理，plan 原样透传后仍按 free/pro 二元入 limitFor）
extendPass(current: string|null, now: Date, days=30): string  // max(now, current)+days ISO
```
`quota.ts checkQuota` 与 `/api/usage/today` 改用 effectivePlan(plan, plan_expires_at)。

## 3. 路由

- **POST `/api/stripe/checkout`**（需登录，401 否则）：body `{mode:'pass'|'subscription'}`；复用/创建 customer（email 绑定，回写 `stripe_customer_id`）；Checkout Session：pass → `mode:'payment'`, `payment_method_types:['alipay','wechat_pay','card']`（wechat_pay 需 `payment_method_options.wechat_pay.client='web'`），line_items=[PASS price]；subscription → `mode:'subscription'`, `['card']`；`success_url: /settings?upgraded=1`, `cancel_url: /settings`；`client_reference_id=user.id`, `metadata.user_id`；返回 `{url}`。
- **POST `/api/stripe/webhook`**（公开路径，签名即鉴权）：`stripe.webhooks.constructEvent(await req.text(), sig, whsec)`；事件：
  - `checkout.session.completed`：`metadata.user_id` 定位用户；`mode==='payment'` → `plan='pro', plan_expires_at=extendPass(现值)`；`mode==='subscription'` → `plan='pro', plan_expires_at=null`；写库用 service 路径？——**用 Management-API 同款问题：webhook 无用户会话**。解法：**Supabase service-role client**（新 env `SUPABASE_SERVICE_ROLE_KEY`，用户从 Supabase 控制台取出填入 Vercel——唯一新增秘钥）建 `src/lib/supabase/admin.ts`（仅 webhook 使用，绕 RLS，文件头注释警示）。
  - `customer.subscription.updated`（status ∉ active,trialing）与 `customer.subscription.deleted`：按 customer id 反查 profile → `plan='free'`（若 plan_expires_at 有未过期时长卡余量则改回 pass 语义：`plan='pro'` 保留 expires——实现为：仅当 expires 为 null 或已过期才降 free）。
  - `invoice.payment_failed`：console.warn 记日志。
  - 幂等性：所有写操作天然幂等（set 语义/extendPass 例外——对 `checkout.session.completed` 以 session.id 做去重：新表不建，复用 usage_events? 不。简化：查 `stripe_customer_id`+metadata 不可靠 → **建轻表 `stripe_events (id text primary key, created_at)`**，插入冲突即跳过（同迁移一并建，无 RLS 需求但仍加 service-only）。

## 4. 前端

- 设置页「升级 Pro」卡（`src/components/UpgradeCard.tsx`）：显示 effective 档位+到期日（读 /api/usage/today 已含 plan？——扩展该路由返回 `{plan, plan_expires_at}`）；两按钮 POST /api/stripe/checkout → `window.location=url`；`?upgraded=1` → 成功横幅。
- QuotaNotice 加「升级 Pro →」链接至 `/settings#upgrade`。

## 5. 测试

effectivePlan/extendPass TDD（过期边界、叠加、null 语义）；webhook 分发测试（constructEvent 用测试 whsec 生成签名 payload；grant/降级/时长卡余量保护/重复事件去重各一例）；checkout 路由 401。

## 6. 不做

退款自动处理（人工 Dashboard 操作+手动改库）· 发票/收据定制（Stripe 默认邮件）· 多档位/年付 · Customer Portal（订阅取消引导用户联系或 Dashboard 后续加）。

## 上线动作

① 用户核对 Stripe webhook endpoint URL=`https://www.osbornalpha.com/api/stripe/webhook` + 四事件勾选；② 用户从 Supabase 控制台复制 service_role key → Vercel env `SUPABASE_SERVICE_ROLE_KEY`（或授权我经 Management API 读取 secrets 配置——可代办）；③ 上线验证一笔真实 ¥68 支付宝支付 + Dashboard 退款；④ Roll secret key 并更新 Vercel。
