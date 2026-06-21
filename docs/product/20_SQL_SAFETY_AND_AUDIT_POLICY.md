<!-- 20 SQL 安全与审计策略 · osbornalpha 数据库变更/RLS默认/生产SQL规范 · 最后更新 2026-06-20 -->

# 20 · SQL 安全与审计策略（SQL Safety & Audit Policy）

本文件规定在 osbornalpha（Supabase 项目 ref `mzfcaabhuwtfvsvadvsv`）上做数据库工作的安全规范：迁移流程、RLS-by-default 硬规则、service_role 禁用范围、破坏性操作复核、备份、审计/日志期望，以及对生产库跑 SQL 的"可做/不可做"边界。

适用对象：任何对该项目数据库执行 DDL/DML 的人或 agent。以仓库 `supabase/migrations/` 实际文件为准。

---

## 1. 迁移流程（Migrations Workflow）

唯一可信来源是 `supabase/migrations/`，文件按时间戳前缀排序：

```
supabase/migrations/
  20260515000000_initial_schema.sql              # 10 表 + RLS + handle_new_user 触发器
  20260621000000_profiles_and_billing_hooks.sql  # +profiles 表（共 11）+ 扩展触发器 + 回填
```

规则：
1. **一切结构变更先写迁移文件，再应用。** 不允许"先在控制台改、回头补文件"，否则迁移历史与实际库漂移。
2. 文件命名 `YYYYMMDDHHMMSS_<描述>.sql`，单调递增。
3. 每个迁移**自带幂等防御**，遵循现有风格：`create table if not exists`、`drop trigger if exists` 后重建、`on conflict do nothing`、`create or replace function`。这样迁移在新库 / 已有库 / 乱序应用下都安全（见 `20260621000000_*.sql` 注释 "Recreate defensively in case this migration is applied to a fresh DB out of order"）。
4. 两种应用方式（二选一，均已在本项目使用过）：
   - CLI：`supabase link --project-ref mzfcaabhuwtfvsvadvsv` → `supabase db push`。
   - Supabase **SQL Editor**：把迁移 SQL 贴入执行（初始 schema 与 profiles 迁移都曾经此路径应用，见 `docs/AUTH_SETUP.md`）。
5. 用 SQL Editor 手动应用后，**必须**确认对应迁移文件已提交进仓库，保持二者一致。

---

## 2. RLS-by-default（硬规则）

这是本项目数据安全的根基，不可妥协。

- **任何新表，建表语句之后立即 `alter table ... enable row level security`，并在同一迁移里写完该表的 RLS 策略。** 没有策略的启用 = 默认拒绝一切（对 anon 而言等于表不可用），漏写策略 = 要么功能坏、要么（若忘记 enable）数据裸奔。
- 每用户表：策略一律基于 `auth.uid() = user_id`（或 `= id`），select/insert/update/delete 按需逐条声明；写策略用 `with check (auth.uid() = user_id)`。
- 公共参考表（`stocks_universe`、`financial_history`）：只给 `for select using (true)`，**不给任何写策略** —— 客户端无法写，写入只能走服务端特权路径或迁移/种子。
- 敏感列收紧（Phase 2 待办）：`profiles.plan/role/usage` 当前被 `self update` 整行策略覆盖即客户端可改；Phase 2 须用列级 grant 或 BEFORE UPDATE 触发器拦截这些列（见 `25_ACCOUNT_SCOPE_AND_PERMISSION_MODEL.md` §2）。
- Code review 检查项：PR 含建表 → 必须同时含 `enable row level security` + 策略；否则打回。

---

## 3. service_role：客户端绝对禁用

- `SUPABASE_SERVICE_ROLE_KEY`（新版 `sb_secret_…`）**绕过所有 RLS**。
- **禁止**出现在任何会进前端 bundle 的位置；**禁止**带 `NEXT_PUBLIC_` 前缀；**禁止**在客户端组件（`'use client'`）中引用。
- 现状（事实）：全仓 `src/` 与 `supabase/` **无任何代码引用** service_role key（已 grep 验证）。它仅在 `.env.example` 中作为预留变量列出。当前应用的所有 DB 访问都走 anon key + 用户会话 + RLS。
- Phase 2 若需服务端特权写库（如 Stripe webhook 写 `profiles.plan`），只能：在服务端运行时（Route Handler / Server Action / 后端 cron）读取该 env 建专用 client，且该 client 实例绝不下传客户端。

---

## 4. 破坏性操作复核（Destructive Ops Review）

`DROP` / `ALTER ... DROP COLUMN` / `TRUNCATE` / 无 `WHERE` 的 `UPDATE`/`DELETE` / 改 RLS 策略 / 改 `handle_new_user` 触发器 —— 一律视为高风险，需复核。

规则：
1. **生产库上禁止即兴执行破坏性 SQL。** 必须先写成迁移、本地或 staging 验证、再应用。
2. 任何 `DELETE`/`UPDATE` 必须带明确 `WHERE`；批量改数据前先 `SELECT count(*)` 确认影响行数。
3. 改 RLS 策略 = 改安全边界：改前确认不会放宽跨租户可见性；改后用"两账户互不可见"实测验证（AUTH_SETUP §4 验收项 4）。
4. 改 `on delete cascade` 关系前评估级联范围（删 `auth.users` 一行会连根删该用户全部数据，见 §账号生命周期）。
5. 破坏性迁移在执行窗口前确保有可用备份（§6）。
6. 改 `handle_new_user()`（security definer）须格外小心：它以高权限运行，逻辑错误会影响每个新注册用户；保持 `set search_path = public` 防止 search_path 注入。

---

## 5. 对生产库跑 SQL：可做 / 不可做

**可以（低风险，只读或受控）：**
- `SELECT` 排查（注意：在 SQL Editor 中以服务角色运行，会绕过 RLS，看到全部租户数据 —— 仅用于运维排障，不得外泄个体用户数据）。
- 通过已评审的迁移文件做结构变更。
- 受控、带 `WHERE`、已确认影响面的数据修正（最好也走迁移）。
- 创建索引、补 RLS 策略等加固性变更。

**不可以（除非经复核 + 备份 + 迁移化）：**
- 即兴 `DROP TABLE` / `DROP COLUMN` / `TRUNCATE`。
- 无 `WHERE` 的 `UPDATE` / `DELETE`。
- 临时关闭某表 RLS（`disable row level security`）"图方便"。
- 在生产直接造 service_role 用法绕过 RLS 写业务数据。
- 把生产数据导出到不受控环境。

---

## 6. 备份（Backups）

- 依赖 Supabase 平台备份：当前为 Free tier（AUTH_SETUP 标注 "Free / Tokyo"），备份能力受套餐限制 —— 上线增长后应升级套餐以获得每日自动备份 / PITR（Point-in-Time Recovery）。
- 任何破坏性迁移**执行前**：确认存在可恢复的近期备份；必要时先手动导出相关表（`pg_dump` / SQL Editor 导出）。
- 备份恢复演练：至少在 Phase 2 前验证一次"从备份恢复"流程可用，避免真正出事时才发现恢复链路有问题。

---

## 7. 审计与日志期望（Audit & Logging）

现状（事实）：
- **数据库层无应用级审计表**（无 `audit_log` 等表；schema 中不存在）。变更可追溯性当前依赖：① 迁移文件的 git 历史；② Supabase 平台自带的 Postgres / Auth 日志。
- 应用层关键操作有运行时日志：cron 路由（`daily-radar`/`daily-brief`）在失败时跨渠道告警（Telegram + Email），并返回 `duration_ms`、`errors`、成本等结构化字段。
- Supabase Dashboard 的 Auth 日志可查注册 / 登录 / 失败等认证事件。

期望（规范）：
- **所有 schema 变更必须可在 git 中追溯到一个迁移文件 + commit。** 不留"幽灵改动"。
- 在生产 SQL Editor 执行的任何非只读语句，应在 PR / 变更记录中留痕（贴出执行的 SQL + 时间 + 执行人 + 影响行数）。
- Phase 2 引入计费 / admin 能力时，建议为 `profiles.plan/role` 等敏感列变更加审计触发器（写入专用 audit 表），因为这些列直接关系收费与权限。

---

## 8. 关联文档

- 密钥分级、auth gate、RLS 作为隔离主干 → `08_SECURITY_AND_PERMISSIONS.md`
- 每账号数据模型、plan/role 语义、生命周期级联 → `25_ACCOUNT_SCOPE_AND_PERMISSION_MODEL.md`
- 迁移外部应用步骤 / 控制台配置 → `docs/AUTH_SETUP.md`
