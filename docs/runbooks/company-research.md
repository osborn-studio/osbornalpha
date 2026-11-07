# 公司研究与跟踪运行手册

适用迁移：`supabase/migrations/20261118090000_company_research.sql`（表、索引、触发器、RLS、授权）、`supabase/migrations/20261118091000_company_research_functions.sql`（全部函数与授权）、`supabase/migrations/20261118092000_company_evidence_fence.sql`（证据替换的尝试/版本围栏）。前提：规格二的 `20261106090000_financial_facts.sql` 已在库中。规格：`docs/superpowers/specs/2026-11-04-company-research-design.md`（§0 优先）。代码：`src/lib/company/*`、`/api/companies/*`、`/api/admin/companies/*`、`/api/tracking/*`、`/api/cron/company-digest`、`scripts/company/*`。

## 1. 表与权限

| 表 | 读 | 写 | 说明 |
|---|---|---|---|
| `issuer_events` | 仅 service_role（§0 #64） | 只经 `replace_company_digest` | 事实事件；`retired_at` 为墓碑，不删行；`first_seen_at` 跨重建保留 |
| `issuer_coverage` | anon / authenticated / service_role | 只经 `replace_company_digest` | 每 (发行人, 市场) 一行，计数与日期，无财务数值 |
| `company_digest_state` | 仅 service_role | 只经三个 digest 函数 | 物化游标、尝试身份、退避 |
| `company_fact_evidence` | 仅 service_role；公共读经 `company_fact_evidence(uuid[])` | 只经 `replace_company_fact_evidence` | 证据索引（快照 → 事实的全键匹配） |
| `company_watches` | 本人（RLS） | 本人（RLS）；触发器 `company_watches_limit` ≤ 200 | 跟踪；删除级联清回执 |
| `company_event_reads` | 本人（RLS） | 本人（RLS）；触发器拒绝跨发行人 `event_id` | 已读回执按事件 id |

## 2. 迁移应用顺序

合并顺序（owner 2026-11-07）：#112（宏观 WP-S6）→ F4（`20261116*`）→ F3（`20261117*`）→ 本模块 → 外资研报。本模块三份迁移已重编号为 `20261118*`（相对顺序不变），在本分支**未锁定**；合并到 main 时由合并者追加到 `supabase/migrations.lock.json`，之后不可再改字节。

1. 确认规格二迁移已在目标库：`select to_regclass('public.financial_facts') is not null;` 为 `true`。
2. 按文件名顺序应用：先 `20261118090000_company_research.sql`，再 `20261118091000_company_research_functions.sql`，再 `20261118092000_company_evidence_fence.sql`（与此前迁移相同的应用方式；生产走 Supabase Management API，令牌在钥匙串，不打印）。三份文件可重放；核对 `select to_regprocedure('public.replace_company_fact_evidence(uuid,text,bigint,bigint,jsonb)') is not null;` 为 `true`；旧三参函数 `select to_regprocedure('public.replace_company_fact_evidence(uuid,text,jsonb)') is null;` 也必须为 `true`（计划第 4 轮审计 S1）；合并后锁定在 `supabase/migrations.lock.json`，之后任何修改都要新迁移。
3. 核对：`select proname from pg_proc where proname like 'company_%' or proname in ('begin_company_digest_attempt','replace_company_digest','mark_company_digest_failed','replace_company_fact_evidence');` 列出全部函数；`select has_table_privilege('anon','public.issuer_events','select');` 为 `false`。

## 3. 首轮物化（owner，合并后）

在主检出（有 `.env.local`）运行，先 dry-run 再 apply：

```bash
node --env-file=.env.local --import tsx scripts/company/digest.ts --full
node --env-file=.env.local --import tsx scripts/company/digest.ts --full --apply
```

- `--apply` 需要代码版本（`VERCEL_GIT_COMMIT_SHA` 或 git 检出）；取不到 → `code_version_missing`，不写库。
- 可用 `--market US|CN`、`--issuer <ticker>` 分批。
- 结果看 `ingest_batches`（`producer='company-digest'`）与 `/admin/dq` 的 `company.events` 新鲜度。

### 3.1 cron 与脚本绝不同时运行

`/api/cron/company-digest` 每小时第 20 分运行（`vercel.json`），`recordAttempt('company.events')` 假设单一生产者。运行脚本前：

1. `select count(*) from public.ingest_batches where producer='company-digest' and status='running';` 必须为 0（有则等它结束；超过 10 分钟仍 running，按数据底座手册"悬空 running 批次"处理）。
2. 在两次 cron 之间开始（如每小时 :25）；预计超过 50 分钟的全量用 `--market`/`--issuer` 分批，每批在下一个 :20 之前结束。
3. 数据库层面 `replace_company_digest` 对 `fact_sync_scope` 行 `for update`，并发写不会损坏数据；本规则保护的是新鲜度记录与批次计数。

## 4. 证据索引重建

公共 `/api/companies` 与 `/api/companies/*` 在 `src/middleware.ts` 的 `// COMPANY` 块跳过会话读取。原始 `issuer_events` 仅 service_role 可读，公共事件必须经过证据门槛。重叠的增量 / sweep 流保留在 sweep 列表；`invalid_event` 仍记录失败并退避。Storage 读取错误时拒绝替换证据，避免删除旧证据。

证据索引在 digest 每个流开始时重建（快照 → 已落地解析器重解析 → 全键匹配；任何不确定 → 不写行，该事实 `evidence_incomplete`）。以下情况全量重跑 `digest.ts --full --apply`：规格二解析器或映射代（`MAPPING_GEN`）变化、`EVIDENCE_INDEX_VERSION` / `EVENTS_VERSION` / `FORMULA_VERSION` 变化、快照桶迁移。使用已实现的 `--full`。检查：公共 `statements` 响应的 `withheld.evidenceIncomplete` 计数在重建后下降或不变。

## 5. 开关与环境变量

| 变量 | 作用 | 缺省 |
|---|---|---|
| `NEXT_PUBLIC_COMPANY_F3_DRAWER` | F3 源抽屉；关闭时新窗口打开 `url`/`documentUrl` | 关 |
| `NEXT_PUBLIC_COMPANY_JUDGMENTS` | F4 判断视图；关闭时空状态 | 关 |
| `CRON_SECRET` | cron Bearer；缺失 503、错误 401 | — |
| `VERCEL_GIT_COMMIT_SHA` | 批次 `code_version`；cron 缺失 → 503 | — |

`NEXT_PUBLIC_*` 在构建时内联：改动后要重新部署（本项目手动 Vercel CLI 部署）。

## 6. 本机 e2e（决策 I：报告附 PR + 复审者复跑）

前提：Supabase CLI、Docker、`npm ci` 完成的工作树（**不放任何 `.env*` 文件**，否则 `test:db` 拒绝运行）。e2e 的 shell 与 `test:db` 的 shell 分开。

```bash
supabase start && supabase db reset
eval "$(supabase status -o env | sed -E -n 's/^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=/export SB_\1=/p')"
export NEXT_PUBLIC_SUPABASE_URL="$SB_API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$SB_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY"
export VERCEL_GIT_COMMIT_SHA="$(git rev-parse HEAD)" CRON_SECRET="local-e2e-cron"
export E2E_EMAIL="e2e-company@example.test" E2E_PASSWORD="$(openssl rand -hex 16)" E2E_COMPANY=1
node --import tsx scripts/company/e2e-seed.ts --apply
npx playwright test e2e/company.spec.ts --reporter=list,html
```

- e2e 整套仅在 base URL 主机为 `localhost` / `127.0.0.1` 时运行，否则跳过（会修改跟踪数据）。
- 种子脚本只接受本机 Supabase URL；夹具账号是本机测试值，不进仓库。
- 种子：AAPL、MSFT（美股夹具回放）、腾讯（仅 HK 证券，用于 F3 空状态）；物化与 digest 全量；清空夹具账号的 watch。可重复运行；禁用可选的实时 SEC acceptance enrichment，回放只读录制的 companyfacts。
- 若 `supabase db reset` 因 `config.toml` 的 `major_version` 失败：本机临时改为 17，不提交。
- 报告：`playwright-report/`（含截图与 trace）打包附 PR；复审者用同一段命令复跑。

## 7. 跟踪运维

- 上限 200（决策 F）由触发器强制；改上限需要新迁移，并同步 `src/lib/company/db.ts::MAX_COMPANY_WATCHES`（唯一定义）。
- 未读计数是扫描式（每页 200、最多 25 页，每个发行人数到 100 即 `99+`）；扫描未完时显示 `n+`，响应带 `unreadComplete:false`。若用户普遍出现 `n+`，在规格 §16 登记并考虑新增计数函数（新迁移）。
- 收件箱只读未静音的 watch；公司页跟踪视图含静音发行人。回放模式不读物化表、不记已读。
- 取消跟踪即级联删除回执；重新跟踪后旧事件重新计为未读（预期行为）。

## 8. 故障处理

| 现象 | 查 | 处理 |
|---|---|---|
| `company.events` 新鲜度 `ok=false` | `select issuer_id, market, last_status, consecutive_failures, next_attempt_at from public.company_digest_state where last_status='failed';` | 看批次 `errors` 的码：`read_truncated`（事实超读上限，规格二问题）、`invalid_event`（本模块 bug，修代码后 `--issuer` 重跑）、`digest_issuer_failed`（网络/存储，等退避或手动 `--issuer`） |
| 页面大量"来源记录不完整" | 证据索引行数与快照 | §4 重建；仍缺 → 快照或 sidecar 缺失，回规格二同步 |
| CN 值全部"引用待挂接" | 预期：PDF 逐值定位（规格三）未落地 | 无需处理；admin 用 `/api/admin/companies/…` 查看 |
| 收件箱 500 | 服务端日志 `[tracking/inbox]` | 多为 service-role 环境变量缺失 |

## 9. owner 事项

| 事项 | 默认 / 状态 |
|---|---|
| 决策 A 判断视图是否列出 `recommendations` | 否（空状态） |
| 决策 B `/api/financials` 退役时点 | 保留一个发布周期后删除 |
| 决策 C `financial_history` | 保留；删除需生产行数与无外部消费者证据 |
| 决策 D consensus mock 关闭、news 页签退役 | 关闭、退役 |
| 决策 E "模型观点（未校准）"改名去数字 | 改 |
| 决策 F `MAX_COMPANY_WATCHES` | 200 |
| 决策 G 预计披露日 | 不显示 |
| 决策 H 目录页需登录 | 需登录 |
| 决策 I e2e | 本机报告 + 复跑 |
| 决策 J 公司页行情行与 K 线 | 移除 |
| 决策 K 分数凯利 | `k = 0.25`，无星级 |
| Tushare 原始快照再分发 | 仅 admin |
| 夹具清单人工抄录（`src/lib/company/fixtures/manifest.json` 三条 pending） | 待抄录；抄录人不得是实施者 |
| 事件黄金集 `docs/audits/2026-11-04-company-research/events-gold.md` | 待抄录 |
| 专家抽样 `expert-sampling.md`（AAPL、600519.SH、000333.SZ 五处口径） | 待安排 |
| 回归对照 `regression-sample.md`（信息性） | 目录上线后 |
| 生产执行三份迁移；首轮 `digest.ts --full --apply` | 合并后 |

## 10. 接口请求清单（对规格二 / 规格三 / F3 / F4）

1. 规格二：`read_facts` 增 `p_include_filings`（本模块以 `company_read_snapshot` 适配）。
2. 规格二：`fact_evidence(fact_ids)` 与快照 meta 可查登记（本模块以证据索引适配）。
3. 规格二：`METRIC_CATALOG` 公式文本（本模块 `metric-catalog.ts`）。
4. 规格二：`financial_metrics.computed_at` 进入 `MetricRow` 与 `/metrics` DTO。
5. 规格二：EDGAR 快照稳定下载端点（本模块 `/api/companies/snapshot?fact=`）。
6. 规格三：CN 逐值 PDF 定位登记（本模块 `PdfLocatorSource`，缺省空 → CN 公共 withheld）。
7. F3：`<SourceDrawer>` 与 `/api/documents/by-filing/[filingId]`（开关 `NEXT_PUBLIC_COMPANY_F3_DRAWER`）。
8. F4：`JudgmentCard` + `GET /api/judgments?view=as_known&asOf=`；带稳定 id 的事件 DTO（收件箱合并，C5）。

## 11. 回滚

三份迁移合并后锁定，回滚 = 经审查的新迁移。依赖清理不能直接复制执行：先清点函数签名及依赖（包括 company_read_snapshot 的返回类型依赖）。顺序：先从 `vercel.json` 删除 `/api/cron/company-digest` 并部署；再在新迁移里按依赖倒序 `drop table if exists public.company_event_reads, public.company_watches, public.issuer_events, public.issuer_coverage, public.company_digest_state, public.company_fact_evidence;`，并 `drop function if exists` 本模块全部函数（签名见计划"共享契约 / SQL 函数签名"表）。按用户数据（watch、回执）会丢失：执行前导出 `company_watches` 与 `company_event_reads`。

## 12. 本次验证范围（2026-11-06）

Task 19 按 owner 指令只跑定向单测、typecheck、lint；本机 Supabase、种子实跑、Playwright、全量 npm test、test:db、test:migrations 由指挥执行。本手册的命令是复跑说明，不代表已执行。四个夹具哈希已核对，三条期望保持 pending；不得宣称黄金矩阵通过。
