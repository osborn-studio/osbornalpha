# 行业研究模块运行手册

`INDUSTRY_JUDGMENTS_ENABLED` 默认关闭。F4 已可冻结公开的 `industry_metrics` 输入，但尚无行业方法学、resolver 与结算策略（owner Q2）；判断区不应制造卡片。`industry_valuations` 输入在 I-3 完成前拒绝。

规格：`docs/superpowers/specs/2026-11-04-industry-research-design.md`（第 6 稿）；计划：`docs/superpowers/plans/2026-11-06-industry-research.md`。本手册覆盖本计划实际交付的部分：迁移 `20261111090000_industry_research.sql` / `20261111091000_industry_research_functions.sql` 的全部对象、A 股发行人装载、事实范围、申万来源记录/解析、SIC、时点聚合 + 内容寻址清单 + 离线回放、证券级标记采集、读接口、页面。**估值计算/对账/发布（I-3）未实施**：表、函数、权限、触发器已落地并有数据库测试，页面估值区恒显示"估值未启用"。

I-3 独立前置验证：[`2026-11-07-industry-closeout.md`](../audits/2026-11-07-industry-closeout.md) 记录 H 的可评审选项与授权/数据验证缺口；`scripts/industry/reconciliation-check.ts <input.json>` 仅离线检查已提供数值的 1%/90%/95%/24 门槛，不计算估值、不写库、不授予发布资格。

## 1. 作业与调度

| job | 运行方式（当前） | 计划频率（UTC，规格 §10） | 门（`src/lib/industry/jobs.ts::jobGate`） | 新鲜度数据集 | 入口 |
|---|---|---|---|---|---|
| `memberships-sic` | **cron**（`vercel.json`） | `0 2 * * *`（每天；每次最多 `limit=200` 个到期发行人，到期间隔 7 天，故每个发行人每周刷新一次） | 无（SEC 不需要 token） | `industry.sic.classifications`、`industry.sic.memberships`（weekly） | `/api/cron/industry-sync?job=memberships-sic&limit=200` |
| `load-a-share` | 脚本 | `30 22 * * *` | `TUSHARE_TOKEN` | `issuers.a_stock`（daily） | `scripts/industry/sync.ts --job load-a-share` |
| `facts-scope` | 脚本（apply 需开关） | `45 22 * * *` | apply 需 `FACTS_CN_INDUSTRY_UNIVERSE=1`（决策 E） | — | `--job facts-scope` |
| `memberships-sw` | 脚本 | `0 2 * * 1` | `TUSHARE_TOKEN` | `industry.sw2021.classifications`、`industry.sw2021.source`、`industry.sw2021.memberships`（均 weekly；三步各自一个批次） | `--job memberships-sw [--l1 801120.SI]...` |
| `marks` | 脚本 | `0 2 * * 6` | `TUSHARE_TOKEN` | `industry.marks`（weekly） | `--job marks --apply --trade-date YYYY-MM-DD ...`（交易日必须显式给出：`trade_cal` 随 I-3 延后） |
| `aggregate` | 脚本（Mac Studio launchd） | `0 3 * * 6` | apply 需 `FACTS_CN_ENABLED=1`（V4） | `industry.agg.sw2021`（weekly） | `--job aggregate [--facts-as-of YYYY-MM-DD]` |
| `official` / `valuation` | — | — | 延期（I-3）：返回 `skipped: deferred_i3` | — | — |

- 所有脚本默认 dry-run（不写库）；`memberships-sic`、`marks`、`aggregate` 的运行函数没有 dry-run 模式，dry-run 只回 `dry_run_unsupported`（不调用运行函数），必须 `--apply`；`--apply` 写批次回执、需要 code version（`VERCEL_GIT_COMMIT_SHA` 或 git 检出）。退出码：0 成功，1 失败/partial，2 参数错误或门拒绝。
- cron 路由同一套门：Tushare 作业无 token → 503 `tushare_unavailable`；`facts-scope`/`aggregate` 未开关 → 403 `job_disabled`；`official`/`valuation` → 200 `skipped`。HTTP 回执只含码与计数，不含错误消息。
- cron 与脚本不要同时跑同一 job（规格 §10）；延迟工作者由 `activate_industry_metric_run` 的 `obsolete_run` 兜底。
- 每周回放抽样：`node --env-file=<file> --import tsx scripts/industry/replay-check.ts [--run <id>] --sample 50`（默认 seed = ISO 周；只读；任一格 `value_differs`/`manifest_unreadable` → 退出 1，按 §8 处理）。

### 显式限定 A 股装载

`load-a-share` 可重复传 `--ticker`，只接受 1–10 个不同的规范代码（六位数字 + `.SH` / `.SZ` / `.BJ`，如 `600519.SH`）。不接受别名、小写、空白、逗号列表或重复值；其他 job 不支持该选项。省略时保留原有全宇宙行为。

```sh
# 默认 dry-run；沿用已有授权环境配置。此示例本身不加载凭据。
node --import tsx scripts/industry/sync.ts --job load-a-share \
  --ticker 600519.SH --ticker 000333.SZ --ticker 300750.SZ
```

经审核后，原命令加 `--apply` 才写入。每个目标仅请求自己的 `stock_basic` L/P/D 行，再执行原有资格、身份与冲突检查；重复证券的证据 claim（包括免 lookup 的快速路径）也只处理选中代码。任一目标缺失、不在 active `a_stock`、被行校验拒绝或已退市，整个选择报 `explicit_ticker_not_eligible`，在 org lookup 和发行人、证券、claim 写入之前失败。此模式不写退市记录；全量装载继续处理退市数据。

资格检查仍读取 active 宇宙。apply 保存 `issuers.a_stock.targeted` 批次回执和配置的目标页面原始快照，可能发生在资格预检失败之前。显式选择不更新全量 `issuers.a_stock` 的新鲜度。dry-run 只验证装载资格，不写入或执行 cninfo lookup。`--limit` 可限制 cninfo lookup；若因 lookup 限额或身份检查导致任何选中的证券未写入或匹配已有证券，apply 返回失败或部分完成。装载后仍需单独处理 facts 调度和公开覆盖。

## 2. owner 决策（规格 §16）与当前默认

| 决策 | 当前默认（本计划按此实施） | 改变时要做的事 |
|---|---|---|
| A Tushare 转载数据授权 | `scheme:sw2021:2021`、`marks:tushare-daily_basic`、`official:tushare-sw_daily` = `internal`；`scheme:sic:sec-current` = `public` | 按 §4 授权开关流程逐个数据集切换 |
| B 首发方案 | 两者都做；授权后默认 `sw2021` | 无代码改动（列表页默认 `scheme=sw2021`，未授权时显示 SIC 入口） |
| C 积分/估值发布 | 估值不发布 | I-3 另立计划 |
| D 未校准判断展示 | 只显示类别标签 + 徽标 + 可证伪条件；无分数/百分比/颜色等级 | `src/lib/industry/judgment-contract.ts::judgmentCardView` |
| E A 股事实公开宇宙 | 未选：`facts-scope` 与 `aggregate` 不进 `vercel.json`、不在生产自动运行 | 置 `FACTS_CN_INDUSTRY_UNIVERSE=1`；满足 §3 后再开 `aggregate` |
| F anon 与 authenticated | 同等 | — |
| G 历史重建期 | 显示 + "历史重建"徽标（v1 申万 run 全部 `reconstruction`） | 若选"抑制"：列表/详情在 `historyClass==='reconstruction'` 时改渲染说明态（页面一处条件） |
| H 估值对照口径（规格第 7 稿 §6.4，K1） | 未选：I-3 不实施，估值区恒"未启用"；`security_marks.free_share` 照常采集 | (a) 申万算法对照指标 `pe_ttm_sw`（用 `free_share`）或 (b) 无官方锚点不发布 → 先修订规格 §6.3/§6.4，再为 I-3 另立计划 |

## 3. CN 启用依赖（规格 §4.10 V4）

`facts-scope` 只写调度范围，不是采集。CN 事实真正进入数据库还需要（缺一不可）：

1. 完成计划二记录的 CN 真实数据核对（规格二 §16、计划二 Task 12/13 的未核对项）；
2. `TUSHARE_TOKEN` 已在 `~/.config/osbornalpha/secrets.env`（仓库外；脚本用 `node --env-file="$HOME/.config/osbornalpha/secrets.env" --import tsx …`；生产 Vercel 环境变量另设；绝不打印或提交）；
3. 设置 `FACTS_CN_ENABLED=1`（`src/app/api/cron/facts-sync/route.ts`）并配置 CN 事实 worker（`vercel.json` 目前只有 US）。

在此之前：允许离线实施与夹具测试；生产聚合保持关闭（`aggregate` 不进 cron，cron 路由对它返回 403 `job_disabled`）；**不得声称 95% 就绪门可通过**。

## 4. 授权开关流程（规格 §4.8）

唯一写路径：`POST /api/admin/industries/licenses`（admin 会话；body `{dataset_key, status, note}`；同源 JSON）。它调用 `set_industry_dataset_license`，写 `research_audit_log`（action `industry.license_set`），再 `revalidateTag('industries')`。

**撤回（public → internal）必须按这个顺序**：

1. `POST … {"dataset_key":"scheme:sw2021:2021","status":"internal","note":"<原因>"}`（RLS 立即对 anon/authenticated 返回 0 行）。
2. 路由已调用 `revalidateTag('industries')`（分类树缓存失效）；确认响应 200。
3. 验证（anon key，0 行即正确）：
   `curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/industry_classifications?select=code&scheme=eq.sw2021&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"` → `[]`；
   `curl -s "$SITE/api/industries?scheme=sw2021"` → 403 `unlicensed`。
4. CDN 残留 ≤ 一个 UTC 日界（成功响应的 `s-maxage` 不越过下一个 UTC 午夜；`/replay` 为 `max-age=3600`）——规格接受。页面的"上次成功响应"内存缓存在下一次读到 `unlicensed` 时清除。

公开（internal → public）只需第 1、2 步，并在 PR/实施记录写明 owner 决策 A 的依据。`official:tushare-sw_daily` 公开只影响 `/replay` 估值格的 `officialValue` 字段（官方值永不进入任何公共表或清单）。

估值可见性只由 scheme 授权门控（`scheme:sw2021:2021` 等）；估值用到的 `marks:tushare-daily_basic` 的授权必须在 I-3 上线前单独复核（此前估值区恒"未启用"，不依赖它）。

## 5. 核对项与未核对事项

| 项 | 状态 | 影响 |
|---|---|---|
| 核对项 1：`sw_daily` PE/PB 口径 → `comparator_basis` | **完成（K1，2026-11-06）**：PE 为 TTM，但按申万算法（A 股自由流通市值加权调和平均、申万季度日历、亏损股市值留在分子）；PB 未定 | §6.3 现行公式无法通过对照 → **owner 决策 H** 未选，I-3 不进计划；估值区恒"未启用"；`security_marks.free_share` 已采集备用 |
| 核对项 2：`daily_basic.total_share` 是否含 H/B 股 | **完成（K2）**：含全部股份类别（A+H+B） | `METHOD_CONFIG.total_share_basis='all_classes_incl_h_b'`；`marks` 采集照常（只存观测，不发布） |
| 核对项 3：`index_member_all` 两遍覆盖、`out_date`、2021 版前 `in_date`、`parent_code` 命名空间 | **完成（K3）**：31/134/346；`parent_code`=`industry_code`；`out_date` 是最后成员日（含）；退市不关窗；2021-07-30 前为回溯映射；别名 850412→850401 | 窗口 `valid_to=min(out_date+1, delist_date)`；`membership_after_delist`；`history_class` 恒 `reconstruction` |
| Tushare 字段表（`stock_basic`/`index_classify`/`index_member_all`/`daily_basic`/`trade_cal`/`sw_daily`） | **已用真实响应核对**（2026-11-06，夹具 `src/lib/industry/fixtures/tushare/`，证据 `docs/audits/2026-11-06-industry-research/03-tushare-verification.md`） | 重录：`node --env-file="$HOME/.config/osbornalpha/secrets.env" --import tsx scripts/industry/record-fixture.ts --sw-classify` 等（先录到临时目录再挑选） |
| SEC SIC 码表页 URL | `https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list`（录制脚本常量，Task 9 夹具为准） | 页面改版时重录 `--sic-codes` |
| 核对项 4（K4，实施复审发现） | **完成**：退市股不建发行人，其来源记录永不解析；`n_unresolved` 排除 `industry_security_delistings` 中 `delist_date <= on` 的 ts_code，否则退市后永久计为未解析 | `load-a-share` 的 `stock_basic list_status='D'` 遍把 `delist_date`（含页面证据）写入 `industry_security_delistings`；日期变化隔离 `delist_date_changed`；仅 service_role 可读写；已解析成员按 `delist_date` 截断 |
| 退市 A 股的三表可得性（§17.1） | **完成**：`stock_basic` 需显式 `list_status='D'`；退市公司 `income` 可取 | `load-a-share` 取 L/D/P 三遍（D 行只记 `skipped_summary(delisted)`）；解析用 D 行的 `delist_date` 截断窗口 |

## 6. E2E（规格 §13.5）

数据库无关的夹具模式：`INDUSTRY_E2E_FIXTURES=1`、非生产（`NODE_ENV!=='production'`）、非 Vercel（`VERCEL` 未设）且未配置 Supabase 凭据（`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 均未设）时 `src/lib/industry/public-deps.ts` 返回 `src/lib/industry/e2e-fixture.ts` 的合成依赖；cookie `industry_e2e=unlicensed` 切换申万授权态。

```bash
# 不能带 Supabase 环境变量（(app) 布局在未配置 Supabase 时放行）；不要用 3000 以外被占用的端口
env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  INDUSTRY_E2E_FIXTURES=1 npx playwright test e2e/industries.spec.ts
```

覆盖：列表热力图（含"历史重建"徽标与缺失格 "—"）→ 抽屉（原样回放 `reproduced`）→ 表格视图；详情（序列 + 表格等价视图、估值未启用、判断区关闭）；成分（日期驱动、未解析只给计数、成分行抽屉）；未授权空态；390px 无横向滚动、抽屉为底部弹层。`.cursor/skills/verify-osbornalpha` 的 guest/gate 模式没有数据库，本模块页面在那里只能看到 `error` 态（不在本计划拥有的路径内，未改动该技能）。

## 7. 错误码速查（规格 §11）

| 场景 | 码 | 处理 |
|---|---|---|
| 公共读接口参数错 | 400 `invalid_parameter:<name>` | 调用方修正 |
| 数据集未公开 | 403 `unlicensed` | 见 §4；admin 在页面看到"内部预览"条 |
| 未知行业 / 发行人 / run / 格 | 404 `unknown_industry` / `unknown_issuer` / `unknown_run` / `unknown_cell` | `failed` run 与未发布格只经 `/api/admin/industries/replay` |
| `/replay` 超限 | 429 `rate_limited` | 每 IP 每分钟 10 次（单实例内存计数，多实例尽力而为） |
| cron 门 | 503 `tushare_unavailable`、403 `job_disabled`、503 `code_version_unavailable` | 见 §1、§3 |
| 激活失败 | `incomplete_run` / `obsolete_run` / `dependencies_incomplete` / `dependency_regression` | `dependency_regression`：重跑即可；其余看 `/api/admin/industries/runs` 的 `coverage_summary.failure_reason` |
| 回放不一致 | 页面红框"回放不一致"；隔离 `manifest_mismatch` | `/admin/dq` 处理；`replay-check` 记录 |

## 8. 回放不一致的处理

1. `GET /api/admin/industries/replay?runId=&code=&periodEnd=` 取完整清单与逐格 `reproduced`。
2. 若清单不可读（桶对象缺失）：确认 `industry_manifests` 索引行仍在，GC 是否误删（`gc_industry_manifest_candidates` 只列未被引用的哈希）。
3. 若值不同：`replayFromManifest` 与 `computeAggregateCell` 不一致是代码缺陷。已激活的坏 run 不能被"冻结"（激活 run 只能被取代），按下列步骤撤下并替换，**不要直接改表**：
   1. 立即撤下：`POST /api/admin/industries/licenses`，body `{"dataset_key":"scheme:sw2021:2021","status":"internal","note":"<原因>"}`（admin 会话，同源 JSON）；写审计日志并自动 `revalidateTag('industries')`，公共读立即变为 `unlicensed`。
   2. 保留证据：该 run 与其清单原样保留，不删除、不改状态。
   3. 开缺陷单、修复代码，运行经验证的替代聚合并激活，确认新 run 的回放 `reproduced`。
   4. 复原：再次 `POST /api/admin/industries/licenses`，`status:'public'`。

## 9. 黄金集待办（规格 §13.4，需 owner 抄录）

- 证监会 2021Q3 行业分类 30 家概念对照（人工抄录 PDF）。
- 5 家（含 A+H）× 2 日：交易所公布总股本/收盘价 vs `security_marks`。
- 3 行业 × 4 日：申万官方 PE/PB 人工抄录（仅夹具内断言，不替代发布门）。

抄录后放 `src/lib/industry/fixtures/golden/`，由 I-3 计划接入断言。

## 10. 回滚

- 页面/路由：回退本模块提交即可（`src/lib/industry/**`、`src/app/(app)/intel/industries/**`、`src/app/api/industries/**`、`src/app/api/admin/industries/**`、`src/app/api/cron/industry-sync/**`、`src/app/api/entities/[issuerId]/industries/**`、`src/components/industries/**`）；共享文件只需删除 `// INDUSTRY:BEGIN … // INDUSTRY:END` 块与 `vercel.json` 的 `industry-sync` 一项。
- 数据：迁移只增不删；先把三个 Tushare 数据集置 `internal`（§4），再停 cron（删 `vercel.json` 项）。
