# 判断层（F4）运行手册

依据：[规格](../superpowers/specs/2026-11-04-judgment-framework-design.md)、[实施记录](../audits/2026-11-06-judgment-framework/implementation-log.md)。迁移为 `supabase/migrations/20261116090000_judgments.sql`。**合并前保持未锁**：不得修改 `supabase/migrations.lock.json`。合并顺序为 macro #112、再 F4；合并者确认最终 SQL 后运行 `shasum -a 256 supabase/migrations/20261116090000_judgments.sql`，把 `{file,sha256}` 追加到锁文件。锁定后该 SQL 永不再改，后续修复另建迁移。

## 1. 表、函数与权限

九表：`judgment_methodologies`、`judgment_methodology_events`、`judgments`、`judgment_settlements`、`judgment_settle_queue`、`judgment_calibrations`、`judgment_calibration_validity`、`judgment_job_state`、`judgment_calibration_cohort_members`。公共读按方法当前 `publishable` 受 RLS 门控；队列、作业状态、冻结成员仅服务角色可读；登记、结算、校准只经 RPC 写。队列 `last_detail.incident` 保存未解决隔离事件，首次隔离时间决定最长七天复核窗。私有 Storage 桶为 `judgments-calibration`。

函数唯一清单见 `src/lib/judgments/rpc-inventory.ts`；服务函数均为 service_role 独占，内部函数不向客户端授权。公共读 RPC：`judgments_server_time`、`judgment_envelope_of`、`latest_judgment_cards`、`judgment_history`、`calibration_cohort`、`methodology_state_at`、`judgment_envelope_by_id`。

服务写 RPC（含服务专用读）：`calibration_cohort_internal`、`sync_methodology`、`register_judgment`、`claim_due_judgments`、`claim_judgment`、`release_lease`、`append_settlement`、`quarantine_settlement`、`apply_quarantine_override`、`resolve_closed_judgment_quarantine`、`reject_quarantined_settlement`、`freeze_calibration_cohort`、`calibration_cohort_members`、`clear_calibration_generation`、`insert_calibration`、`set_job_state`、`repair_stale_batches`。

内部函数：`judgments_settle_after_date`、`judgments_grace_days`、`judgment_operation_payload`、`judgment_settlement_payload`、`judgment_replay_status`、`judgment_append_settlement_internal`。触发器函数随表删除。RPC 签名以 inventory 和迁移为准；`claim_due_judgments` 返回 jsonb 数组，`set_job_state` 返回 `{ok,updated_at}`。

## 2. 部署顺序

1. 合并 macro #112 后，再合并 F4。由合并者锁定最终迁移并核对 SHA。用生产迁移流程执行 `20261116090000_judgments.sql`，登记 `supabase_migrations.schema_migrations` 对应版本；先确认私有桶 `judgments-calibration` 已建且 `public=false`。
2. 核对 SQL 授权：anon 对 `judgments` 无 INSERT、对 `register_judgment(jsonb,jsonb)` 无 EXECUTE；service_role 对表无直接 INSERT、可执行登记 RPC；anon 可执行 `judgments_server_time()`。检查九表、RLS、桶。
3. 在配置生产库的环境运行 `node --env-file=.env.local --import tsx scripts/judgments/sync-methodologies.ts --dry-run`，审阅每个 action / problems / hash；无 drift 后同命令去掉 `--dry-run` 应用。`formula_hash_drift` 必须升方法版本，不能覆盖旧版。
4. 配置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`，按准备程度配置 `MACRO_JUDGMENTS_ENABLED=1`。当前真实 `MacroReadApi` 已接入，但宏观方法 `active`、`publishable=false`；开启生产宏观登记前核对目录输入可用时间与许可。关闭开关时补偿报告 `macro_unavailable`。
5. 核对 Vercel 套餐支持两个路由的 `maxDuration=300`，再部署。`vercel.json` 的 `/api/cron/judgments-settle` 为 `0 3 * * *`、`/api/cron/judgments-calibrate` 为 `0 4 * * 1`（UTC）。用 `Authorization: Bearer $CRON_SECRET` 调各路由 `?preview=1`，核对回执、批次新鲜度与 `/api/methodologies`。正式 cron 必须在迁移和注册表同步之后启用。

**零判断的旧版。** `macro_regime@v1` 已由 v2 取代，生产库中已注册的 v1 行保留原样；代码 REGISTRY 只列 v2，`sync-methodologies.ts` 仅遍历 REGISTRY 并按 id/version 查询，忽略未列出的 v1 行。先确认 v1 判断数为零，再同步 v2；不覆盖、删除或退役 v1 行。

## 3. 发布准入

初始方法均 `publishable=false`。owner 核对每个方法 `input_kinds` 可达的 `kind×adapter` 来源，取得公开展示许可，在 `docs/methodologies/licenses.json` 填 `confirmed`、`confirmed_by`、`confirmed_at`、`evidence`。该文件位于公式哈希闭包外，许可变更不触发 `formula_hash` 漂移。评审合并后先用 `scripts/judgments/sync-methodologies.ts --dry-run --publishable <id>@<version> --owner-confirmation '<人/日期/证据>'` 审阅，再去掉 `--dry-run` 应用。任何来源许可未确认均不发布。撤销许可时改回 `unverified` 并用脚本 `--unpublish <id>@<version>`；公共 RLS 立即隐藏该方法判断。需 owner 再核对东方财富和 DataGateway 的结算证据展示许可。

## 4. 复权验证

运行 `node --import tsx scripts/judgments/verify-adjustment.ts --help` 查看录制参数，用交易所公告事件、前后窗口的 none/qfq/hfq K 线录制并判定，评审夹具后更新 `src/lib/judgments/resolvers/price-capabilities.ts`。当前仅 eastmoney A qfq、HK qfq、US hfq 为 verified；其他组合包括全部 DataGateway 均 unverified。未验证组合按 `adjustment_unsupported` 作废，不能当作可用能力。

## 5. 宏观与私有适配器

`macro_regime@v2` 已使用真实宏观分类函数和 `MacroReadApi`，状态 `active`、`publishable=false`。`MACRO_JUDGMENTS_ENABLED` 控制生产装配；目录 `created_at/updated_at` 不可证时输入弃权，当前缺失 / 受限序列不等同于合成夹具。`recommendation_call@v1` 仅私有只读卡片和自评，不写公共 judgments，也不同步公共方法注册表；`pending_fill.condition=null`。私有百分比不发布。

## 6. 日常结算与隔离

`/admin/judgments` 查看队列、手动结算、撤回与重开；手动结算通过 `claimOne` 取得租约。隔离在 `/admin/dq` 裁决，`last_detail.incident` 保存 `quarantine_id/reason_code/evidence_hash/cutoff/quarantined_at`；复核期限为 `max(settle_by, 首次隔离+7天)`，重复隔离不延长。接受和拒绝都绑定证据哈希与截止时间，409 stale 时刷新再操作。连续三次补偿失败会跳过该快照并报 `compensation_skipped`，检查 `judgment_job_state` 的 failing/skipped。结算的 280 秒 deadline 不硬性约束已发出的 DB 等待；写入仍有租约栅栏。回放使用 `node --import tsx scripts/judgments/replay.ts --id <judgment_id> --json`，哈希不符退出 2。

## 7. 校准对象清理

每周校准的 `cohorts/<sha256>.json` 为内容寻址成品，`partial/<unit>/<generation>/...` 为续跑分页。先查 `judgment_job_state` 的 `calibrate:%` 当前 generation 和 `judgment_calibrations.cohort_path`，只删除均无引用的 partial 对象；不得删成品或仍被状态引用的对象。冻结成员的孤儿可查 `cohort:<generation>` 标记：仅当没有任何 `calibrate:%` 状态引用该 generation 时，由 service_role 调 `clear_calibration_generation(uuid)`，其会同时清成员和标记。存储扫描失败时保留对象供下次人工复核。

## 8. 回滚

先停两个 cron，导出九表及 judgments 隔离项作为审计证据，清空私有桶对象。以下清单涵盖 `rpc-inventory.ts` 所有非触发器函数；按实际 `pg_proc` 签名由迁移角色逐个 `drop function`（先处理依赖它们的视图 / 策略，再删表），不可 `cascade` 到非 F4 对象：

`judgments_server_time`, `judgment_envelope_of`, `latest_judgment_cards`, `judgment_history`, `calibration_cohort`, `methodology_state_at`, `judgment_envelope_by_id`, `calibration_cohort_internal`, `sync_methodology`, `register_judgment`, `claim_due_judgments`, `claim_judgment`, `release_lease`, `append_settlement`, `quarantine_settlement`, `apply_quarantine_override`, `resolve_closed_judgment_quarantine`, `reject_quarantined_settlement`, `freeze_calibration_cohort`, `calibration_cohort_members`, `clear_calibration_generation`, `insert_calibration`, `set_job_state`, `repair_stale_batches`, `judgments_settle_after_date`, `judgments_grace_days`, `judgment_operation_payload`, `judgment_settlement_payload`, `judgment_replay_status`, `judgment_append_settlement_internal`。

然后按外键逆序删除九表及 `judgment_envelope` 类型，再删 F4 触发器函数；桶清空后删除 `storage.buckets` 的 `judgments-calibration` 行。重新部署已移除 cron 的版本。检查 `pg_proc` / `pg_class` 中无 F4 遗留；回滚演练在临时库执行。

## 9. 验证

本地执行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。PostgreSQL 套件由 commander 使用 db-one runner 执行 `judgments.integration.test.ts`、`judgments-db.integration.test.ts`、`settle.integration.test.ts`、`calibrate.integration.test.ts`；包含 `S4_TEST_STATE` 的套件均在 `scripts/ci/research-checks.ts` F4 critical 清单，领取 due judgments 的测试在 `withClaimLock` 内。全量 `test:db` / `test:migrations` 在可启动本地 PostgreSQL 的环境执行。

## 10. owner 事项（规格 §17）

| 项 | 当前默认 / 待决事项 |
|---|---|
| O1 | 首批公共 macro_regime@v2 + 私有 recommendation_call@v1；decisions 适配器待决定 |
| O2 | threshold_n=100、ece_max=0.10、window_years=3，待确认 |
| O3 | 截止 vintage 同分类函数重算；asset_pair 后续立项待决定 |
| O4 | trading_sessions 用 K 线序号，待确认 |
| O5 | 分析师档位 + 自评已做；私有只追加结算证据表待决定 |
| O6 | 未验证复权组合 void(adjustment_unsupported)；DataGateway 需补录，待确认 |
| O7 | 补登记不恢复前瞻资格，待确认 |
| 发布 | 来源展示许可、licenses.json、publishable 准入由 owner 签认 |
| 画布 | §9.6 七项和实施偏差待 owner 过目 |
| 生产 | 迁移、注册表、桶、cron、300 秒套餐和部署由 owner 执行 |
| 方法文档 | 安排买方分析师阅读并记录反馈 |

## 11. 后续

跟踪宏观目录输入时间证据、DataGateway 复权录制、场景条件可求值能力；这些限制及接受风险见规格 §19。
