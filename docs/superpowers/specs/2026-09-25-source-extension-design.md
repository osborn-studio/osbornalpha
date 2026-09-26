# Source 扩展迁移设计（WP-A1） / Source extension design

日期：2026-09-25。来源：《实施总纲 2026-09-22》§5.1、§8.2 WP-A1。用户已确认：MODEL_USAGE 与 EARNINGS_CALL 也回填为 `public`；现有行 `market` 回填 `null`；`source_version` 列与 S4 的 `research_source_versions` 表共存不合并；`available_at` 与 `source_version` 写入后不可变。设计已批准。

## 目标 / Goal

给 `public.research_source_documents` 增加总纲 §5.1 的列与索引，回填现有行，保持所有既有读写路径与 498+ 测试不变，并让 `ingestSource` 能可选地写入新字段。迁移可重放，不接触生产库。

## 非目标 / Non-goals

- 不做实体对照（A2）、去重聚簇（A5）、origin_type 判定（A6）；这些列只预留。
- 不改 S4 的 `research_source_versions` 语义，不改不可变触发器对原四个字段的规则。
- 不生成回滚脚本（Alpha 迁移目录无此惯例）；本迁移只加列与索引，回滚即删列。

## 迁移 / Migration `supabase/migrations/20260925230000_research_source_extension.sql`

```sql
alter table public.research_source_documents
  add column if not exists event_time     timestamptz,
  add column if not exists available_at   timestamptz,
  add column if not exists source_version text not null default '1',
  add column if not exists cluster_id     uuid,
  add column if not exists cluster_first  boolean,
  add column if not exists origin_type    text,
  add column if not exists market         text,
  add column if not exists permission     text not null default 'public';
-- 回填：首次可获得时间 = 入库时间；NOTE/MANUAL 默认 private，其余 public。
update public.research_source_documents set available_at = ingested_at where available_at is null;
update public.research_source_documents set permission = 'private'
  where source_type in ('NOTE','MANUAL') and permission = 'public';
alter table public.research_source_documents alter column available_at set not null;
alter table public.research_source_documents alter column available_at set default now();
-- 约束（先删后建以便重放）
alter table public.research_source_documents drop constraint if exists research_sources_origin_type_check;
alter table public.research_source_documents add constraint research_sources_origin_type_check
  check (origin_type is null or origin_type in ('filing','company_statement','third_party_data','analyst_or_media','retelling','private_observation','unknown'));
alter table public.research_source_documents drop constraint if exists research_sources_market_check;
alter table public.research_source_documents add constraint research_sources_market_check
  check (market is null or market in ('A','HK','US','other'));
alter table public.research_source_documents drop constraint if exists research_sources_permission_check;
alter table public.research_source_documents add constraint research_sources_permission_check
  check (permission in ('public','licensed','private'));
alter table public.research_source_documents drop constraint if exists research_sources_source_version_check;
alter table public.research_source_documents add constraint research_sources_source_version_check
  check (source_version ~ '^[1-9][0-9]{0,8}$');
create index if not exists research_sources_user_available_idx on public.research_source_documents (user_id, available_at desc);
create index if not exists research_sources_user_cluster_idx on public.research_source_documents (user_id, cluster_id) where cluster_id is not null;
create index if not exists research_sources_user_market_idx on public.research_source_documents (user_id, market, available_at desc) where market is not null;
create index if not exists research_sources_user_permission_idx on public.research_source_documents (user_id, permission);
-- 不可变触发器扩展：available_at 与 source_version 写入后不可改。
create or replace function public.research_forbid_source_mutation() returns trigger as $$ ... 原四字段 + available_at + source_version ... $$;
```

重放规则：所有 `add column if not exists`、`create index if not exists`、`drop constraint if exists` 后重建；两次回填语句幂等（第二次不匹配任何行）。注意 `permission` 回填只针对仍为默认值 `public` 的 NOTE/MANUAL 行，用户后来手动改成 `public` 的行在重放时会被改回 private，这只影响验证库重放，生产迁移只执行一次。

## 代码 / Code

- `types.ts`：`SourceDocument` 增加（在 TS 类型上声明为可选，以保持既有 fixture 与 prompt 测试编译；数据库与 `rowToSource` 总会填值） `event_time: string|null`、`available_at: string`、`source_version: string`、`cluster_id: string|null`、`cluster_first: boolean|null`、`origin_type: OriginType|null`、`market: Market|null`、`permission: Permission`；导出 `ORIGIN_TYPES`、`MARKETS`、`PERMISSIONS` 常量与类型。
- `sources.ts`：`rowToSource` 对缺列的旧行给默认（`available_at ?? ingested_at`、`source_version ?? '1'`、`permission ?? 'public'`、其余 `null`），保证 mock 与旧库行为不变；`IngestSourceInput` 增加可选 `event_time`、`available_at`、`market`、`permission`，逐一校验（ISO 时间、枚举），插入时 `available_at` 缺省等于本次 `ingested_at`，`permission` 缺省按 source_type（NOTE/MANUAL → private，其余 public），与回填规则一致。
- `s4/import.ts` 的插入语句不改：新列全部有默认或允许 null；`available_at` 由数据库默认 `now()` 填充，`ingested_at` 同时刻。

## 测试 / Tests

- `sources.test.ts`：新字段校验（非法 permission/market/时间被拒）；缺省 `available_at` 等于 `ingested_at`；缺省 permission 按类型；`rowToSource` 对无新列的行给默认值；既有断言不变。
- `s4/source-extension.integration.test.ts`（`S4_TEST_STATE` 存在时运行）：迁移文件对本地库重放第二次无错；插入 NEWS/NOTE 行后验证回填默认；非法 `market`/`permission`/`origin_type`/`source_version` 被 check 拒绝；更新 `available_at` 或 `source_version` 被触发器拒绝而更新 `event_time`/`permission` 允许；`select *` 经 `rowToSource` 得到完整字段。
- 既有 1198 项测试保持通过。

## 验收 / Acceptance

`S4_TEST_STATE=<本地库> npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 通过；Codex CLI（中等）评审无 P1；不接触生产库，生产应用另走发布流程。
