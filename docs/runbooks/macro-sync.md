# 宏观工作台运行手册（macro-sync）

生产首次上线（合并之后）的逐步操作见 **§13**。适用：规格 `docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（第 4 稿）、迁移 `supabase/migrations/20261114090000_macro_workbench.sql`。
数据底座通用部分（DQ 批次、隔离、新鲜度、`/admin/dq`）见 `docs/runbooks/data-foundation.md`。

## 1. 组件

| 组件 | 位置 | 触发 | 写什么 |
|---|---|---|---|
| FRED 采集 + 美国发布 | `GET /api/cron/macro-sync`（`src/app/api/cron/macro-sync/route.ts`） | Vercel cron `30 5 * * *`（UTC，`vercel.json`） | 目录镜像、`macro.fred` 批次、证据、观测、派生、US 快照 |
| AKShare 采集 | `scripts/macro/collect.py`（owner 的 Mac，launchd，05:00 UTC；首次 `--mode backfill`，之后 `--mode daily`） | launchd | 只抓取与录制原始响应，POST 到 ingest |
| ingest + 中国发布 | `POST /api/macro/ingest`（start → chunk → finish） | collect.py | `macro.akshare` 批次、证据、观测（数值由 TS 解析器从字节取出）、CN 派生、CN 快照 |
| 读接口 | `/api/macro/overview`、`series/[id]`、`series/[id]/versions`、`snapshots/[id]`、`evidence/[sha256]`、`analyses` | 页面 | 只读（分析运行经 `create_macro_analysis_run`） |
| 隔离裁决 | `scripts/macro/resolve-quarantine.ts` | 人工 | `macro_resolve_conflict` RPC（成员见 `macro_quarantine_members`） |
| 回滚 | SQL `republish_macro_snapshot` | 人工 | 新 active 快照（复制旧快照） |
| FOMC 日程 | `scripts/macro/record-fomc.ts` → `src/lib/macro/data/fomc-meetings.json` + `src/lib/macro/fixtures/fomc/<sha256>.html` | 人工，每年 1–2 次（联储公布下一年日程后） | 仓库文件，走 PR |

## 2. 环境变量

| 变量 | 在哪里 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` | Vercel | 已有 |
| `CRON_SECRET` | Vercel | 已有；cron 与手动触发都用 `Authorization: Bearer` |
| `MACRO_INGEST_SECRET` | Vercel + Mac（钥匙串） | 新；ingest 只认它（常量时间比较，未配置 → 503） |
| `VERCEL_GIT_COMMIT_SHA` | Vercel（自动注入） | cron / ingest / analyses 只认它作 `code_version`（缺失 → 503 `code_version_unavailable`，`?preview=1` 不需要） |
| `MACRO_INGEST_URL` | Mac | 新；`https://<生产域名>/api/macro/ingest` |
| `MACRO_JUDGMENTS_ENABLED` | Vercel | 新；默认不设 = 判断层关闭。只有值为 `1` 才挂载判定槽位、才在 `snapshots/[id]` 返回判定字段、才让 `MacroReadApi` 读取已存判定、才在发布时计算并存储判定（`snapshots.ts`） |

不需要 `FRED_API_KEY`。生成 ingest 密钥：`openssl rand -hex 32`，同一个值写进 Vercel（`vercel env add MACRO_INGEST_SECRET production`）和 Mac 的登录钥匙串（`osbornalpha-macro-ingest`，launchd 运行时读取），不进仓库、不进聊天、不写进 plist。

## 3. 手动触发与 preview

```bash
BASE=https://osbornalpha.com     # 本地：http://localhost:3000
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/macro-sync?preview=1" | jq .   # 只抓取+解析，零数据库写入、零存证上传
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/macro-sync" | jq .             # 真实运行（采集 + 美国发布）
```

preview 回执 `{ok, preview:true, catalogVersion, counts:{fetched}, series:[{series_id, code, points, first, last, sample[3], sha256, bytes} | {series_id, code, error}]}`：每个 active FRED 序列应有 `points > 0`；任何一个 `error` 都使 `ok:false`。preview 零数据库写入、零存证上传（Task 7 测试断言）。真实运行回执含 `batchId`、`status`、`publish`、`counts / native_counts / native_usable / derived_counts`、`errors[]`（只有 code 与 key）。参数 `preview` 只接受 `1`，其余 → 400。

## 4. Python 采集器（owner 的 Mac）

```bash
cd ~/Developer/CodeX/OsbornAlpha                       # 外置 SSD 上的仓库（mount | grep -q AIMATE_WORK）
uv venv -p 3.12 scripts/macro/.venv
VIRTUAL_ENV=scripts/macro/.venv uv pip install -r scripts/macro/requirements.txt   # AKShare 锁 1.20.35
scripts/macro/.venv/bin/python scripts/macro/collect.py --mode backfill --dry-run "$(mktemp -d)"   # 抓取 + 录制，把 start/chunk/finish 请求体写进目录，不 POST；`--series CN_X ...` 可限定序列
scripts/macro/.venv/bin/python -m pytest scripts/macro -q                          # 离线单测
```

launchd：模板 `scripts/macro/launchd.plist.template`（Label `studio.osborn.alpha.macro-collect`，`--mode daily`）。替换占位 `{{REPO}}`、`{{HOUR}}`/`{{MINUTE}}`（05:00 UTC 换算成 Mac 本地时间）、`{{MACRO_INGEST_URL}}`、`{{HOME}}`；密钥不进 plist，一次性存入登录钥匙串 `security add-generic-password -a "$USER" -s osbornalpha-macro-ingest -w '<MACRO_INGEST_SECRET>'`，plist 运行时读取。完整步骤见 §13.4。然后：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/studio.osborn.alpha.macro-collect.plist
launchctl kickstart -k gui/$(id -u)/studio.osborn.alpha.macro-collect     # 立即跑一次
launchctl print gui/$(id -u)/studio.osborn.alpha.macro-collect | head -40 # 状态与上次退出码
```

卸载：`launchctl bootout gui/$(id -u)/studio.osborn.alpha.macro-collect`。日志：`~/Library/Logs/osbornalpha-macro-collect.log`。单写者租约在 `macro_ingest_runs`（每个 dataset 至多一个 `open`/`finishing` run），每个 run 有一个所有者令牌（`owner_token`，`start` 返回，之后每个 `chunk`/`finish` 都带它；第 5 稿 P1-3）：

- `start` 返回 409 `batch_running`：上一次还没结束或卡住（409 的那次批次被记为 `rejected`）。超过 2 小时的 live run 在下一次 `start` 时被作废（`state='aborted'`，progress `{aborted:{by,reason:'max_age'}}`，其批次以 `failed`、错误 `aborted` 结束）。
- 块回 409 `chunk_in_progress`：同一块正被另一请求处理；采集器退避重试 4 次。若仍是 processing（请求崩溃于写入之后、`completeChunk` 之前），采集器**整次重来**：`start {takeover:true}`——旧 run 有一块 processing 超过 10 分钟（`processing_timeout`）时被作废（`reason:'stalled_chunk'`），否则回 409 并被轮询（每 60 秒，最多 15 次）——然后把内存中的全部结果按新批次重新分块发送，**从不**补发旧批次的剩余块。Vercel `maxDuration`（300 秒）小于处理超时，健康请求不会被误判。
- 任何响应为 409 `fenced`：这个批次已被接管，旧 worker 的每一次写入（retrieval、观测、隔离链接、块、finish、发布）都被数据库拒绝；采集器同样整次重来一次（不轮询）；仍 `fenced` 则退出码 1（另一采集器持有租约）。
- `finish` 可安全重试，而且独占：只有令牌所有者能开始（其他令牌 → `fenced`）；每次开始都换新的 `finish_token`，同一所有者的并发 finish 中较早的那个在下一步得到 `fenced`。已完成的步骤（派生、批次结束、新鲜度、发布）不会重做：批次结束走宏观 RPC `macro_finalize_batch`（校验所有者 + finish 令牌，只在批次仍 running 时写，已结束则读回状态）；新鲜度走 `macro_record_freshness`（`dq_freshness` 写入与 `freshness_recorded` 检查点同一事务，崩溃时要么都在、要么都不在，重试不会重复计错误也不会丢记录；第 6 稿 P1-1）。被换掉 finish 令牌的旧 finisher 在这两步得到 `fenced`，改不了批次与新鲜度；发布按 `publish_key = 'ingest:<batch_id>'` 幂等，崩溃于发布之后的重试回放同一快照。可重试的发布失败（再试一次后仍 `stale_publisher`、瞬时 rpc 错误）→ 503 `publish_pending`，`finish_progress.attempts` 记下诊断，run 保持 `finishing`，采集器以同一令牌重试；一直失败则该 run 在下一次采集（> 2 小时）时被作废——批次此前已 `success`，其数据合格，下一次成功的采集会发布。已结束的批次原样返回存储的回执。
- 全部来源失败或只有被拒值重交付（本次没有任何可用原生行：`Σ native_usable = 0`，`previously_rejected` 虽计入 duplicates 但不算可用，第 6 稿 P2-1）：不派生、不发布（`publish:{status:'skipped',reason:'no_native_outcomes'}`），批次 `failed`（只有隔离行或被拒重交付落地时为 `partial`，共用 DQ 规则），`dq_freshness` 记一次失败。cron（FRED）同一规则。cron 在派生期遇到无法绑定的隔离行（`quarantine_link_failed`）等致命中止时，以显式 `failed` 与实际计数结束批次（`macro_finalize_batch`，第 6 稿 P2-4），已写的原生行永不进入发布。
- 查看块的可用行：`select seq, counts, native_usable from macro_ingest_chunks where batch_id = '<batch>' order by seq;`。
- 查看：`select batch_id,state,owner_token,finish_progress from macro_ingest_runs order by created_at desc limit 5;`（`finish_progress.aborted` 说明谁、为何作废了它；`attempts` 是发布重试的诊断）。

## 5. 采集状态与发布及时性

- 采集状态：`dq_freshness` 中 `macro.fred`、`macro.akshare`（cadence daily）；状态 `fresh | stale | error | missing`，连续 2 次失败才是 `error`。`/admin/dq` 与页面头部“采集”标签读同一来源。
- 发布及时性：逐序列计算（下一期期末 + `releaseLagDays` + 3 天）。重复抓到旧值不会变绿。
- 采集失败时页面继续显示最后一次已发布快照并标出采集状态，永不显示 0。

## 6. 快照与发布

每次发布在 `publish_macro_snapshot` 里一个事务完成：区域行锁；带 `publish_key`（cron `'cron:<batch>'`、ingest `'ingest:<batch>'`）且该键已发布过 → 直接返回那个快照（`replayed:true`），什么都不写；否则 `revision` 与 `input_revision` 都对得上才写，否则 `stale_publisher`（后到者放弃，旧 active 不动）；清单 `observation_ids` 与冻结的迷你图历史 `history_ids` 都必须**合格**——观测 ok、所属批次 `success`/`partial`、派生行的全部祖先递归合格（`macro_ineligible_ids`）——否则 `invalid_manifest`。所以未结束或失败批次留下的行永远进不了快照。新快照 active，旧 active → superseded。失败只写 `record_failed_macro_snapshot`，不动 active。概览只读快照冻结的 id，之后的修订 / 裁决只影响下一次发布。

## 7. 隔离裁决

```bash
node --env-file=.env.local --import tsx scripts/macro/resolve-quarantine.ts                 # 列出 open 的 macro.* 隔离项
node --env-file=.env.local --import tsx scripts/macro/resolve-quarantine.ts --json
node --env-file=.env.local --import tsx scripts/macro/resolve-quarantine.ts --accept <quarantine id> --observation <member observation id> --by <admin user uuid>
node --env-file=.env.local --import tsx scripts/macro/resolve-quarantine.ts --reject <quarantine id> --by <admin user uuid>
```

- 列表里每个条目下列出它的成员（`macro_quarantine_members`：被隔离的观测行 id、版本、值、状态）。一个 open 条目可能绑定同一 `series|period` 的多个不同值（`quarantine()` 复用 open 条目并保留第一次的 payload，所以**以成员为准，不看 payload**）。
- `--by` 必须是 `profiles.role='admin'` 的用户 id（脚本先检查）。退出码：0 成功；2 非管理员；3 被 SQL 拒绝（`already_resolved`、`not_found`、`reject_only`、`not_member`、`not_quarantined`、`member_ineligible`）。
- 接受：必须用 `--observation` 指定要接受的成员；它转为 `ok`（版本号更高即最新），该条目其余成员转为 `rejected`，`input_revision+1`，写 `research_audit_log`。拒绝：全部成员转为 `rejected` + 审计。`rejected` 永久不可恢复、永不进入发布；同值再交付（无论多新）不会再插入，只得到信息性的 `previously_rejected`（不建新条目，第 5 稿 P1-2）。
- 同一条目可能有两个同值成员：失败批次留下的隔离行，与后来成功批次重交付时新插入的隔离行（第 5 稿 P1-6：失败批次的行不被复用）。**接受成功批次那一个**；接受失败批次的成员会被 SQL 以 `member_ineligible` 拒绝（它永远不可能进入发布）。成员所属批次的状态：`select o.observation_id, o.version, b.status from macro_observations o join ingest_batches b using (batch_id) where o.observation_id = any('{<ids>}');`。
- 裁决与采集并发时，采集侧的链接会锁住同一条目行：若裁决先关闭了条目，采集侧检查它要链接的确切行——该行已是本条目成员且已被这次裁决接受 / 拒绝 → 链接即完成（第 6 稿 P2-3，不中止、不建空条目）；该行仍是 `quarantined`（裁决之后出现的新冲突值）→ 得到 `quarantine_closed`，自动新建一个 open 条目并重新链接（第 5 稿 P2-3），所以新冲突值出现在新条目下，而不会挂到已关闭的条目上。
- 被接管的旧 worker 可能在 `dq_quarantine` 里留下一个**没有成员**的 open 条目（`quarantine()` 是共用助手、不带令牌，但它随后的链接被 `fenced`）。它无害：下一次同键冲突会复用并链接它；否则直接 `--reject`。
- 已发布快照不改；下一次发布（cron 或 ingest finish）反映裁决。需要立即反映时按 §3 手动触发。
- 原因码：`unexpected_revision`（不可修订序列出新值）、`conflicting_rows`（同一证据内矛盾）、`stale_delivery`（迟到交付）、`adapter_mismatch`（TS 解析值 ≠ AKShare 值）、`rule_failed:<id>`（范围/单位/跳变）。`adapter_mismatch` 与 `rule_failed:*` **只能拒绝**：这两类值从未写入（没有成员），SQL 对接受抛 `reject_only`，脚本在调用前也拒绝（列表里标 `[reject-only]`）。处理办法：查上游与解析器，修好后下一次采集会正常写入，再拒绝旧条目。`conflicting_rows` 同样没有存储行（没有成员），接受得到 `not_member`；`stale_delivery` 与 `unexpected_revision` 可接受。

## 8. 回滚 active 快照

快照行不可改（触发器只允许 active → superseded），回滚 = **以旧快照为模板发布一个新的 active 快照**：service-only RPC `republish_macro_snapshot(p_snapshot_id, p_expected_revision, p_expected_input_revision)` 在一个事务里锁区域、核对两个修订号（`stale_publisher`）、重新校验旧快照清单与历史的发布资格（`invalid_manifest`），复制其清单、历史、目录计数与判定结果为新快照（新 id、`revision+1`），并把当前 active 置 superseded。用数据库属主在 SQL 编辑器 / Management API 执行：

```sql
select revision, input_revision from macro_publish_state where region = 'US';                     -- 记下两个值
select public.republish_macro_snapshot('<要恢复的 snapshot_id>', <revision>, <input_revision>);   -- 返回 {snapshot_id, revision, source_snapshot_id}
```

`stale_publisher` 表示期间有写入或发布：重读两个值再执行。执行后 `GET /api/macro/overview?region=US` 的 `snapshotId` 应为新返回的 id（内容与源快照相同）。注意：下一次成功发布会按当前合格输入生成新快照——如果是坏输入导致的问题：**先暂停发布者**（§13.6 第 2 条）；已发布的 `ok` 观测不能拒绝，更正路径见 §13.6 第 1 条；否则回滚会被下一次发布覆盖。在 `docs/audits/` 记录原因与时间。

## 9. 启用受限（restricted）序列

前提：owner 书面确认展示与再分发权利（VIXCLS、SP500 / NASDAQCOM / DJIA via FRED、中证 300）。步骤：

1. 在 `docs/audits/` 记录确认人、日期、范围与依据。
2. 改 `src/lib/macro/catalog.ts` 对应条目：`status` `'restricted'` → `'active'`，删 `reason`，`rights` 改为确认后的值，`attribution` 写权利方要求的标注。`CATALOG_VERSION` 随内容自动变化。
3. 同步更新 `catalog.test.ts` 中的 A/M/R 期望；判定权重不变（`WEIGHTS_V1` 已含该序列，覆盖率分母固定）。
4. FRED 序列：本地 `?preview=1` 看到该序列能抓取、解析；AKShare 序列：录制夹具并加解析器测试（Task 8/9 的流程）。
5. PR → 合并 → 部署；下一次 cron/ingest 先 upsert 目录（新 `catalog_version` 追加进 `macro_catalog_versions`），再回填。

## 10. 中国序列核实记录

每个 CN A 状态序列在实施时以真实录制的夹具核实（`src/lib/macro/fixtures/cn/manifest.json`）；核实失败的项改为 M 并写理由（Task 8 规则）。下表由 `src/lib/macro/fixtures/cn/manifest.json` 与 `verification.json` 生成（Task 18 核对；抓取时间 UTC，2026-11-07 02:41 起；逐序列实时点数与最新期见 `docs/audits/2026-11-06-macro-workbench/21-live-checks.md`）。之后每次升级 AKShare 版本重新录制并更新：

| series_id | AKShare 函数与参数 | 实际请求主机 | akshare 版本 | 夹具文件（sha256） | 核实日期 | 结果 |
|---|---|---|---|---|---|---|
| CN_CPI_INDEX | `macro_china_nbs_nation`，指标列「居民消费价格指数(上年同月=100)」，路径 `全国居民消费价格分类指数(上年同月=100)(2026-)` | data.stats.gov.cn | 1.20.35 | `CN_CPI_INDEX-00.json` `69216e8ef8d01132d256f14da1a5c80154e6be97579848e9c408a3eb5132bc19` | 2026-11-07 | 通过 |
| CN_PPI_INDEX | `macro_china_nbs_nation`，指标列「工业生产者出厂价格指数(上年同月=100)」，路径 `工业生产者出厂价格指数(上年同月=100)` | data.stats.gov.cn | 1.20.35 | `CN_PPI_INDEX-00.json` `30f50c4d1e52f0d270b081679626a3b5ef28bd2ed1baf7c5d2d75e72b9108a65` | 2026-11-07 | 通过 |
| CN_PMI_MFG | `macro_china_nbs_nation`，指标列「制造业采购经理指数(%)」，路径 `制造业采购经理指数` | data.stats.gov.cn | 1.20.35 | `CN_PMI_MFG-00.json` `d44657d7682f4275057d4411e6507de195178e455a8c147d6e0b75379015df2c` | 2026-11-07 | 通过 |
| CN_GDP_INDEX | `macro_china_nbs_nation`，指标列「国内生产总值指数(上年同期=100)当季值」，路径 `国内生产总值指数` | data.stats.gov.cn | 1.20.35 | `CN_GDP_INDEX-00.json` `cae08b7943ccb2044f2bf47e11b7639708a76f4f734d07aa46f39e5dc7e11ca9` | 2026-11-07 | 通过 |
| CN_M2_YOY | `macro_china_nbs_nation`，指标列「货币和准货币(M2)供应量_同比增长(%)」，路径 `货币供应量` | data.stats.gov.cn | 1.20.35 | `CN_M2_YOY-00.json` `e144c9939d84b7654d4d9bface151173910b932fd31f3dc4f18da490964faa89` | 2026-11-07 | 通过 |
| CN_EXPORT_YOY | `macro_china_nbs_nation`，指标列「出口总值同比增长(%)」，路径 `货物进出口总额` | data.stats.gov.cn | 1.20.35 | `CN_EXPORT_YOY-00.json` `60b968182b0b4e353e967357ddae0f66db129e48957cb418450196953094915c` | 2026-11-07 | 通过 |
| CN_CGB_10Y_D | `bond_china_yield`，曲线「中债国债收益率曲线」，列「10年」 | yield.chinabond.com.cn | 1.20.35 | `CN_CGB_10Y_D-00.html` `727350f408afabfc5e3cd08c050f3fe24522a77a0398e59bdbf2a8066f08aa04` | 2026-11-07 | 通过 |
| CN_USDCNY_CP_D | `currency_boc_safe`，列「美元」 | www.safe.gov.cn | 1.20.35 | `CN_USDCNY_CP_D-00.html` `ec5144b975e31f4c4cc23ef49ad408a63ff5c71d5f98b6e367e4d7d268957346` | 2026-11-07 | 通过 |

已知限制（owner 已确认）：
- **SAFE 历史深度**：`currency_boc_safe` 的 2026 年以前历史在外汇局 XLSX 里；桶不收 XLSX、也没有 xlsx 定位器，所以只有 `RMBQuery.do` 的 HTML 是证据，`CN_USDCNY_CP_D` 的历史从该 HTML 的首个日期开始（录制时为 2026-01-05）。更早的值**不解析、保持缺失**，不得用 AKShare 的 DataFrame 值补。需要更长历史时另立任务：桶允许 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` 并新增 `xlsx_cell` 定位器（迁移变更）。
- **NBS CPI 分期叶子**：`CN_CPI_INDEX` 的 `seriesKey` 指向 `(2026-)` 叶子，历史从 `(2021-2025)`、`(2016-2020)` 兄弟叶子回填（`cn-series.ts`）。NBS 开新一期叶子（约 2031 年）时必须改目录键（`CATALOG_VERSION` 随之改变）。
- **未定位的 AKShare 交叉核对值**：周期不在 TS 解析出的原始点里的 claim 不进隔离；每块存下 claim 键与定位键，`finish` 按整批去重计数，向批次写一条 INFO `skipped_summary`（`key: unlocated_claims`）。
- **采集失败的序列**：`collect.py` 在 `finish` 的 `series_outcomes` 里报告每个序列的成败；失败序列计入批次 `failed` 并写错误 `{code, key: series_id}`，批次为 `partial`（全部失败为 `failed`），`dq_freshness.detail.failed_series` 列出它们。

## 11. FOMC 日程

联储公布下一年日程后：`npx tsx scripts/macro/record-fomc.ts`（先 `--dry-run` 看年份与会议数），提交新增的 `fixtures/fomc/<sha256>.html` 与更新后的 JSON；`npm test -- src/lib/macro/fomc.test.ts` 会重新哈希并解析每个被引用的页面。

## 12. 判断层开关

`MACRO_JUDGMENTS_ENABLED=1` 只在 F4 判断层上线后设置。`macro_regime_results` 只授 service_role（第 6 稿 P1-2）：判定从不经公开 anon key 可读，只在服务端、开关打开时经 `MacroReadApi` / 路由读出。关闭时页面与 API 不出现象限 / 得分 / margin；开启但 F4 `/api/judgments` 不可用时，槽位显示“判断层暂不可用”，不回退到宏观自算数字。

F4 接入规则：F4 判断层**只能在服务端经 `MacroReadApi`**（`src/lib/macro/read-api.ts`，F4 契约镜像 `judgment-contract.ts`）读取宏观事实与（开关打开时）已存判定；不得用公开 anon key 直连 `macro_*` 表读判定，也不得在客户端组件里读 `MACRO_JUDGMENTS_ENABLED`（页面在服务端读它，`pages.test.ts` 断言）。`MacroReadApi` 在判断关闭时不读 `macro_regime_results`，regime 一律为 null。

## 13. 生产上线（合并之后）/ Production bring-up (after merge)

供一个独立的生产会话逐步执行。顺序不可调换：**先迁移，再设环境变量，再部署，再 cron / 采集**。生产库是 `stock-monitor`（ref `mzfcaabhuwtfvsvadvsv`，PostgreSQL 17）；托管的 `postgres` 角色**不是超级用户**（有 CREATEROLE），没有 DB 密码、没有 `supabase link`。前提：

```bash
mount | grep -q AIMATE_WORK || echo "SSD NOT MOUNTED — stop"
cd ~/Developer/CodeX/OsbornAlpha && git fetch origin main && git status -sb | head -3
git log origin/main --oneline -5 | cat       # 确认宏观工作台的合并提交已在 origin/main
```

> **P3 + P4（传导 / 历史 / 复盘）/ strategy layer:** 本节完成并验证之后，再按 [`docs/runbooks/macro-strategy.md`](macro-strategy.md) 第 8 节上线（P3 迁移 `20261115090000`、`US_FED_TARGET_D` 数据、`MACRO_STRATEGY_ENABLED=1`、复盘 cron preview、smoke checks、回滚）。`MACRO_STRATEGY_ENABLED` 与 `MACRO_JUDGMENTS_ENABLED` 在本节全程保持不设置；§13.2 的 flag 矩阵不变。

### 13.1 应用迁移 `20261114090000_macro_workbench.sql`

迁移文件已锁定，**一个字符都不改**。它不含 `alter … owner`、不建扩展，只引用 `storage.buckets`（建私有桶 `macro-raw`），可在非超级用户下执行；依赖已存在的 `ingest_batches`、`dq_quarantine`、`dq_freshness`、`research_audit_log`、`profiles`（来自 `20261105090000_dq_foundation.sql` 与更早的迁移）。方法同 `alpha-production-deploy-and-hosted-db` 记忆与 `docs/runbooks/data-foundation.md` §8 的生产迁移步骤：Supabase Management API 的 SQL 端点，令牌取自 macOS 钥匙串（Supabase CLI 登录态）。令牌只放在 shell 变量里，不打印、不落盘、不进仓库。

```bash
REF=mzfcaabhuwtfvsvadvsv
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)   # sbp_…
q(){ jq -n --arg q "$1" '{query:$q}' | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @-; }

# 0) 前置对象与历史（应列出 dq 底座与 financial_facts 迁移；macro 迁移此时不应存在）
q "select to_regclass('public.ingest_batches') ib, to_regclass('public.dq_quarantine') dq, to_regclass('public.dq_freshness') fr, to_regclass('public.research_audit_log') al, to_regclass('public.profiles') pr"
q "select version, name from supabase_migrations.schema_migrations order by version desc limit 5"
```

任何前置对象为 null → 停，先补齐更早的迁移。然后执行（文件约 100 KB；端点把整个请求作为一个事务执行，失败整体回滚，可原样重跑，迁移是可重放的）：

```bash
# 迁移与迁移历史在**同一个请求 = 同一个事务**里执行：要么一起成功，要么一起回滚，不会出现"历史已记但迁移未执行"。
SQL="$(cat supabase/migrations/20261114090000_macro_workbench.sql)
insert into supabase_migrations.schema_migrations(version, name, statements) values ('20261114090000','macro_workbench', array[]::text[]) on conflict (version) do nothing;"
OUT=$(jq -n --arg q "$SQL" '{query:$q}' | curl -sS -w '\n%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @-)
CODE=$(printf '%s' "$OUT" | tail -1); BODY=$(printf '%s' "$OUT" | sed '$d')
echo "HTTP $CODE"; echo "$BODY" | head -c 600; echo
[ "$CODE" = "201" ] || [ "$CODE" = "200" ] || { echo "STOP: migration request failed"; }
# 必须同时满足：HTTP 2xx 且 BODY 是 [] 且下一行查询返回 1 行；任一不满足即停，不要手工补记历史
q "select version from supabase_migrations.schema_migrations where version='20261114090000'"
```

验证查询（逐条执行，对照期望）：

```bash
# 1) 12 张表都在
q "select count(*) from pg_tables where schemaname='public' and tablename like 'macro\_%'"                                  # 期望 12
# 2) 每张表都开了 RLS
q "select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'macro\_%' order by 1"   # 期望 12 行全部 true
# 3) 没有任何角色对宏观表有 INSERT/UPDATE/DELETE（含 service_role；写入只经函数）
q "select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name like 'macro\_%' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE') and grantee in ('anon','authenticated','service_role','public')"   # 期望 []
# 4) SELECT 授权按设计：anon 只有 macro_series / catalog_versions / evidence_objects / retrievals / snapshots / observations；macro_regime_results 只有 service_role
q "select table_name, string_agg(grantee, ',' order by grantee) from information_schema.role_table_grants where table_schema='public' and table_name like 'macro\_%' and privilege_type='SELECT' and grantee in ('anon','authenticated','service_role') group by 1 order by 1"
# 5) 私有桶 macro-raw
q "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='macro-raw'"                         # 期望 public=false, 52428800, {text/csv,application/json,text/html,text/plain}
# 6) 发布状态已预置 US / CN
q "select region, revision, input_revision from public.macro_publish_state order by region"                                  # 期望 CN 0 0、US 0 0
# 7) 函数在，执行授权按设计（触发器函数不计）
q "select p.proname, has_function_privilege('anon',p.oid,'execute') anon_x, has_function_privilege('authenticated',p.oid,'execute') auth_x, has_function_privilege('service_role',p.oid,'execute') svc_x from pg_proc p where p.pronamespace='public'::regnamespace and p.prorettype<>'trigger'::regtype and (p.proname like 'macro\_%' or p.proname in ('publish_macro_snapshot','republish_macro_snapshot','record_failed_macro_snapshot','create_macro_analysis_run')) order by 1"
```

第 7 条期望：全部函数 `svc_x=true`；`anon_x`/`auth_x` 只对 `macro_latest_observations`、`macro_snapshots_since`、`macro_batch_eligible` 为 true，其余全部 false（Supabase 默认权限会给新函数授 anon/authenticated 执行权，迁移已对每个函数 `revoke … from public, anon, authenticated`；若出现非预期的 true，**不要**改迁移，在生产上补 `revoke execute on function … from public, anon, authenticated;` 并记入 `docs/audits/`）。还应有：`select count(*) from public.macro_series` 为 0（目录镜像由首次 cron 写入）。

用 PostgREST 与匿名 key 再确认一次公开面（`vercel env pull` 得到 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`）：`macro_regime_results` 与 `macro_publish_state` 对 anon 应返回 401/403 或空，`rpc/macro_write_observations` 应 401/403/404。

### 13.2 Vercel 环境变量与部署

项目 `stock-monitor`（团队 gilosbornhellos-projects），**未连接 Git**；`.vercel/project.json` 在主检出的仓库根（不在 Git 中）。

```bash
vercel env ls production | grep -E 'CRON_SECRET|MACRO_'                       # CRON_SECRET 必须已存在；MACRO_JUDGMENTS_ENABLED 必须不存在
openssl rand -hex 32 | tee >(pbcopy) | vercel env add MACRO_INGEST_SECRET production   # 生成并写入；同一值同时在剪贴板，用于 §13.4 存钥匙串，之后清空剪贴板
```

- `MACRO_INGEST_SECRET`：新增（上面生成）。不要在聊天或日志里回显它。
- `MACRO_JUDGMENTS_ENABLED`：**保持不设置**（判断层关闭；只有 F4 上线后才设为 `1`）。
- `MACRO_STRATEGY_ENABLED`：**保持不设置**；P3 + P4 的上线与该开关见 `macro-strategy.md` 第 8 节。
- `CRON_SECRET`：确认已存在（`vercel env ls`）；缺失会让 cron 503 `cron_unavailable`。不需要 `FRED_API_KEY`。
- 不需要 `MACRO_INGEST_URL`（它在 Mac 端）。

部署（环境变量改动必须重新部署；按 `docs/VERCEL_DATAGATEWAY_DEPLOYMENT.md` §5，从 `origin/main` 的干净检出）：

```bash
git fetch origin main
D=~/Developer/CodeX/.worktrees/OsbornAlpha/deploy          # 外置 SSD 上的统一工作树位置（全局规则：不在内置盘、不建兄弟目录）
mkdir -p "$(dirname "$D")"
git worktree add --detach "$D" origin/main
mkdir -p "$D/.vercel" && cp .vercel/project.json "$D/.vercel/project.json"
( cd "$D" && vercel deploy --prod --yes --env VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD) )   # 必须带 --env：见 data-foundation.md §10.7
git worktree remove --force "$D" && git worktree prune
```

`vercel.json` 已含 `/api/cron/macro-sync` `30 5 * * *`；该文件里还有每 4 小时一次的 `facts-sync`，套餐要求见 `data-foundation.md` §8.11（已满足才会部署成功）。部署完成后用未带令牌的请求确认路由存在：`curl -s -o /dev/null -w '%{http_code}\n' https://osbornalpha.com/api/cron/macro-sync` 期望 401（不是 404）。

### 13.3 Cron 首次触发

令牌读取（只存在 shell 变量里）：从 owner 的密码管理器取 `CRON_SECRET`，或 `vercel env pull "$TMPDIR/prod.env" --environment=production` 后 `CRON_SECRET=$(sed -n 's/^CRON_SECRET="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$TMPDIR/prod.env")`，用完立刻 `rm "$TMPDIR/prod.env"`（标为敏感的变量拉不下来，此时向 owner 要）。

```bash
BASE=https://osbornalpha.com
# 1) preview：只抓取 + 解析，零写入。9 个 active FRED 序列都应 points>0，ok:true
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/macro-sync?preview=1" | jq '{ok, preview, catalogVersion, counts, series:[.series[]|{series_id,points,first,last,error}]}'
# 2) 真实运行（目录镜像 + 回填 + 美国发布）。首次从 2000-01-01 全量抓取，几十秒到数分钟（maxDuration 300 s，240 s 截止；超时 → 500 sync_failed，批次留作 failed，重跑即可）
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/macro-sync" | jq .
```

读回执：`status` 应为 `success`（`ok:true`）；`publish` 应为 `{status:'published', region:'US', snapshot_id, revision, observation_count…}`（`stale` = 并发发布者抢先，`failed` = 已记失败快照；两者旧 active 都不动）；`native_usable > 0`；`errors` 为空。`publish.status:'skipped'` 带 `reason`（`batch_failed` / `no_native_outcomes`）说明没有发布，旧快照继续服务。常见：`unauthorized` 401（令牌错）、`cron_unavailable` 503（未设 `CRON_SECRET`）、`code_version_unavailable` 503（部署缺 `VERCEL_GIT_COMMIT_SHA`，应从 git 检出部署）。

数据库侧核对（`q` 为 §13.1 的函数）：

```bash
q "select batch_id, status, started_at, finished_at, counts->>'inserted' ins, counts->>'failed' failed from ingest_batches where dataset='macro.fred' order by started_at desc limit 3"     # 期望首行 success
q "select dataset, last_ok_at, consecutive_errors, status from dq_freshness where dataset like 'macro.%'"                                                                                            # macro.fred 有 last_ok_at
q "select region, snapshot_id, revision, as_of, status, created_at from macro_snapshots where region='US' order by created_at desc limit 3"                                                  # 期望一个 active
q "select region, revision, input_revision from macro_publish_state order by region"                                                                                                                # US revision 1
q "select count(*) from macro_series"                                                                                                                                                                 # 目录镜像已写入
```

（这些查询都是只读的。）

### 13.4 owner 在自己的 Mac 上运行 AKShare 采集

在 owner 的 Mac 上执行（不在 Vercel、不在生产会话的服务器上）。仓库在外置 SSD。

```bash
cd ~/Developer/CodeX/OsbornAlpha && git pull --ff-only          # 已含合并后的 scripts/macro
uv venv -p 3.12 scripts/macro/.venv
VIRTUAL_ENV=scripts/macro/.venv uv pip install -r scripts/macro/requirements.txt     # akshare==1.20.35 全量锁定
scripts/macro/.venv/bin/python -m pytest scripts/macro -q                             # 离线单测应全绿

# 1) 把 ingest 密钥放进登录钥匙串（值 = Vercel 的 MACRO_INGEST_SECRET；用 §13.2 剪贴板里的那个，写完清剪贴板）
security add-generic-password -a "$USER" -s osbornalpha-macro-ingest -w "$(pbpaste)" && pbcopy </dev/null

# 2) 先 dry-run 看一眼（真实 AKShare，不 POST）。约 3–4 分钟（中债按月分段取 11 次）
scripts/macro/.venv/bin/python scripts/macro/collect.py --mode backfill --dry-run "$(mktemp -d)"
# 期望 8 行 `CN_… evidence=N claims=M ok`

# 3) 首次回填（真实发送）
export MACRO_INGEST_URL=https://osbornalpha.com/api/macro/ingest
export MACRO_INGEST_SECRET=$(security find-generic-password -s osbornalpha-macro-ingest -w)
scripts/macro/.venv/bin/python scripts/macro/collect.py --mode backfill ; echo "exit=$?"
unset MACRO_INGEST_SECRET
```

退出码 0 才算成功；非 0 时先读 §4 的 409 / fenced / takeover 说明，不要反复手工重发块。回填成功后装 launchd 的**日常**任务：

```bash
date -u +%H:%M; date +%H:%M                       # 算出 05:00 UTC 对应的本地小时/分钟（HOUR/MINUTE）
sed -e "s#{{REPO}}#$HOME/Developer/CodeX/OsbornAlpha#g" -e "s#{{HOUR}}#<本地小时>#" -e "s#{{MINUTE}}#<本地分钟>#" \
    -e "s#{{MACRO_INGEST_URL}}#https://osbornalpha.com/api/macro/ingest#" -e "s#{{HOME}}#$HOME#g" \
    scripts/macro/launchd.plist.template > ~/Library/LaunchAgents/studio.osborn.alpha.macro-collect.plist
plutil -lint ~/Library/LaunchAgents/studio.osborn.alpha.macro-collect.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/studio.osborn.alpha.macro-collect.plist
launchctl kickstart -k gui/$(id -u)/studio.osborn.alpha.macro-collect         # 立即跑一次 daily，验证钥匙串读取与网络
launchctl print gui/$(id -u)/studio.osborn.alpha.macro-collect | grep -E 'state|last exit'
tail -20 ~/Library/Logs/osbornalpha-macro-collect.log
```

Mac 睡眠时 launchd 会在唤醒后补跑错过的 `StartCalendarInterval`。验证 CN 快照（`q` 同 §13.1，由生产会话或 owner 执行）：

```bash
q "select batch_id, status, started_at, finished_at, counts->>'inserted' ins, counts->>'failed' failed from ingest_batches where dataset='macro.akshare' order by started_at desc limit 3"      # 期望首行 success（部分序列失败则 partial）
q "select batch_id, state, finish_progress->>'attempts' attempts from macro_ingest_runs order by created_at desc limit 3"                                                                                 # state finished
q "select dataset, last_ok_at, consecutive_errors, status, detail from dq_freshness where dataset='macro.akshare'"
q "select region, snapshot_id, revision, status, created_at from macro_snapshots where region='CN' order by created_at desc limit 3"                                                                    # 一个 active
```

`partial` / `failed_series`：`dq_freshness.detail.failed_series` 列出失败序列；先看是不是上游暂时故障，次日自动重试；持续失败再按 §10 的已知限制与 §4 排查。未定位的 AKShare 交叉核对值不是错误，只记一条 INFO `skipped_summary`。

### 13.5 上线后检查

1. 登录一个普通用户，打开 `/intel/macro`：US 与 CN 都有数据，头部有区域切换与“采集 / 快照”状态，**页面上没有任何判断层 UI**（控制台：`document.body.innerText.match(/象限|得分|margin|recovery|overheat|stagflation|recession|覆盖率/i)` 为 `null`）；点击数值，抽屉里有来源 / URL / SHA-256 / 定位 / 适配器等取证字段。未登录访问 `/api/macro/overview` → 401。
2. `/today` 的“宏观一览”卡片显示美国与中国事实；没有 SSE / HSI / Nasdaq / DXY 行；缺失显示“缺失”，不显示 0。`/intel` 有宏观摘要卡。
3. `/admin/dq`（管理员账号）：最近批次里有 `macro.fred`、`macro.akshare`，新鲜度表里两者都有 `last_ok_at` 且状态 `fresh`；批次计数与 §13.3 / §13.4 的回执一致。
4. `GET /api/macro/overview?region=all`（带登录 cookie）：`regions.US.snapshotId` 与 `regions.CN.snapshotId` 都非空；`regions.US.collection[]` 与 `regions.CN.collection[]`（各自数据集）的 `status` 为 `fresh`；抽查一个序列，`GET /api/macro/series/US_UNRATE` 的最新 `value_text` 与 FRED CSV 逐字符一致。
5. 次日 05:30 UTC 之后再看一次 `ingest_batches`（dataset `macro.fred`）：应有新的 `success` 批次，且没有 `quarantine` 打开项（`node --env-file=.env.local --import tsx scripts/macro/resolve-quarantine.ts` → `no open macro quarantine items`，需要服务角色密钥，仅在 owner 的机器上运行）。

### 13.6 回滚（迁移不可 drop）

迁移是**锁定**的、只增不删：**不得 `drop table` / `drop function` / `drop policy`，也不得改迁移文件或 `schema_migrations` 历史**。表与桶留着无害——没有人写入时它们是惰性的。安全回滚按影响面由小到大：

1. **坏数据已发布 → 先停发布者，再重发布旧快照**：
   - 先暂停两个发布者（见下面第 2 条：撤 cron 条目或部署前移除路由、`launchctl bootout` AKShare 任务），否则下一次成功发布会按当前合格输入重新生成快照，把回滚覆盖掉。
   - 再执行 §8 的 `republish_macro_snapshot`（新 active 快照复制旧清单）。
   - **已发布的 `ok` 观测不能被拒绝**：生命周期触发器不允许 `ok → rejected`，`resolve-quarantine` 只作用于隔离中的成员（§7）。P1 没有"原地更正已发布观测"的受支持路径。正确的更正只有两种：上游发布更正值（下一次采集按修订规则写入新版本，或对不可修订序列进入隔离后由 owner 接受），或另立一个更正迁移 / RPC（新迁移，需审计）。在更正到位之前保持发布者暂停，并在 `docs/audits/` 记录。
2. **停止自动采集**：
   - FRED：从 `vercel.json` 删掉 `/api/cron/macro-sync` 条目，经 PR → 合并 → §13.2 手动部署；或在不改代码的前提下撤掉 `CRON_SECRET`（会让所有 cron 失效，**不推荐**）。
   - AKShare：`launchctl bootout gui/$(id -u)/studio.osborn.alpha.macro-collect`；要同时拒绝一切 ingest：`vercel env rm MACRO_INGEST_SECRET production` 后重新部署（ingest 未配置 → 503）。
3. **页面下线**：回退到不含宏观路由的上一个部署（`vercel rollback` / 重新部署旧提交）。用户界面停止展示，数据库里的表与已发布快照保持不变（页面不读它们就不会暴露；公开读策略见 §6）。
4. 判断层始终是关的（`MACRO_JUDGMENTS_ENABLED` 不设），无需回滚。

任何回滚都在 `docs/audits/` 记录原因、时间与执行的命令。

### 13.7 生产启用记录 2026-11-07（P1+P2，main `86a77ec1`）

由生产启用会话执行；底座部分与部署细节见 `data-foundation.md` §10。时间 UTC。P3+P4（#110，迁移 `20261115090000_macro_strategy.sql`）**不在 main**，未应用、未部署。

1. **迁移**（§13.1）：`20261114090000_macro_workbench` 与其前置的 8 个底座/行业迁移一起，先在生产 `begin…rollback` 演练，再单独一个事务 + 历史行执行，成功。§13.1 的 7 项核对全部符合期望（12 表、全部 RLS、无写授权、SELECT 授权按设计、`macro-raw` 私有 52428800 四种 MIME、`macro_publish_state` US/CN 0 0、anon 只能执行 3 个公开函数）。anon PostgREST：`macro_regime_results`/`macro_publish_state`/`macro_ingest_runs` 401，`rpc/macro_write_observations` 404。偏差：历史行 `statements` 存了文件原文而不是 `array[]::text[]`（与 2026-10 以前的行一致）。
2. **环境**（§13.2）：`CRON_SECRET` 已存在；`MACRO_JUDGMENTS_ENABLED` 未设（判断层关闭，保持）；`MACRO_INGEST_SECRET` **未设**——按指挥要求不由会话生成或写入密钥，列为 owner 步骤（下面第 5 条）。
3. **部署**：当前生产 `stock-monitor-dxnq1om1q-gilosbornhellos-projects.vercel.app` → osbornalpha.com。第一次部署（`stock-monitor-43m78oi4m`）上 `macro-sync` 真实运行返回 503 `code_version_unavailable`：CLI 部署时 `VERCEL_GIT_COMMIT_SHA` 为空；以 `--env VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)` 重新部署后正常。§13.2 的部署命令已改为带 `--env`。
4. **FRED**（§13.3）：
   - preview：`ok:true`，`catalogVersion macro-catalog/ec304166c325`，fetched 42009；9 个序列全部 `points>0`、无 error（US_FEDFUNDS_EFF_D 9806 点至 2026-11-05、US_UNRATE 321 点至 2026-10-31、US_CPI_INDEX 320 点至 2026-09-30 等）。
   - 真实运行（07:25，手动以 `CRON_SECRET` 触发；批次 `triggered_by` 记为 `cron`）：HTTP 200，批次 `2b060c08-9a6e-48c1-b9c5-de4895d9fd41` **success**，fetched/inserted 43723（原生 42009 + 派生 1714），duplicates/quarantined/failed 0，`errors []`；`publish = published US revision 1`，snapshot `53ad1ad1-2180-4e58-9565-ea3893cd8ab4`，observation_count 18，`uncovered_weight 40`，`hook skipped`。
   - 库侧：`macro_series` 40、US 快照 1 个 active（as_of 2026-11-07）、`macro_publish_state` US 1/54、CN 0/0、`dq_freshness macro.fred` fresh。anon 读 `macro_observations`：`US_UNRATE` 2026-10-31 = `4.1`、2026-09-30 = `4.2`。本机访问 FRED CSV 超时，未能逐字符比对（证据对象 SHA-256 已入 `macro_evidence_objects`）。
   - **文档与代码不一致（记录，不改）**：§2 说 `MACRO_JUDGMENTS_ENABLED=1` 时才"在发布时计算并存储判定"；实际 `snapshots.ts` 总是计算 regime 并写 `macro_regime_results`（现有 1 行），开关只控制钩子与读取。该表只授 service_role，未经开关不会被读出或暴露。
5. **AKShare / CN**（§13.4）：本会话在本机按文档的降级路径只做了 dry-run：`uv venv -p 3.12` + `requirements.txt`（akshare 1.20.35），`pytest scripts/macro -q` 25 passed；`collect.py --mode backfill --dry-run <临时目录>` 3 分 25 秒，退出码 0，8 个序列全部 ok（CN_CPI_INDEX evidence 3/claims 129、CN_PPI_INDEX 1/129、CN_PMI_MFG 1/130、CN_GDP_INDEX 1/43、CN_M2_YOY 1/129、CN_EXPORT_YOY 1/129、CN_CGB_10Y_D 11/2711、CN_USDCNY_CP_D 1/203），写出 start + 4 块 + finish 请求体，未 POST。CN 快照因此**尚未发布**（`macro_publish_state` CN 0/0），`/intel/macro` 的 CN 区当前无数据。owner 步骤：
   ```bash
   openssl rand -hex 32 | tee >(pbcopy) | vercel env add MACRO_INGEST_SECRET production
   # 然后按 data-foundation.md §10.9 第 3 条重新部署（带 --env VERCEL_GIT_COMMIT_SHA）
   security add-generic-password -a "$USER" -s osbornalpha-macro-ingest -w "$(pbpaste)" && pbcopy </dev/null
   export MACRO_INGEST_URL=https://osbornalpha.com/api/macro/ingest
   export MACRO_INGEST_SECRET=$(security find-generic-password -s osbornalpha-macro-ingest -w)
   scripts/macro/.venv/bin/python scripts/macro/collect.py --mode backfill ; echo "exit=$?" ; unset MACRO_INGEST_SECRET
   # 成功后按 §13.4 安装 launchd 日常任务
   ```
6. **页面**（§13.5）：`/intel/macro` 未登录 → 307 登录页；本会话没有生产账号会话，也不代为登录，**页面渲染与"无判断层 UI"检查留给 owner**（§13.5 第 1–4 条）。`/api/macro/overview` 未登录 → 401（符合）。

## 14. 已知限制与设计取舍（实施 Task 18 时核实）

- **`available_at` 来自首次看到**：FRED 的 CSV 不带历史发布时间，所以每个观测的 `available_at` 是系统**首次取得该值**的时间（`availability_basis = 'first_seen'`），回填历史的 `available_at` 是回填那一刻，不是真实发布日。时点回放（`asOf`）因此只对上线之后的首次取得有意义；不要把回填值当作“当时已知”。
- **派生期崩溃只丢计数**：`ingestEvidence` 之后、派生写入与检查点之间若进程崩溃，已写入的派生行不会丢，但该批次的计数少记这部分（重试时它们作为 duplicates 出现）；批次状态仍按真实可用原生行判定。无数据错误，只有计数偏差（已记录的残留，见 `20-implementation-log.md` 任务 9）。
- **失败的分析不计配额**：`create_macro_analysis_run` 只统计 `ok` 的运行；失败运行靠请求校验与 `request_id` 幂等限制滥用（`analyses/route.ts` 已注明）。
- **SAFE 历史深度、NBS CPI 分期叶子、未定位的交叉核对值、采集失败序列**：见 §10 末尾四条。SAFE 的 `CN_USDCNY_CP_D` 历史从 2026-01-05 开始（不是缺陷，是设计取舍）。
- **判断层默认关闭**：见 §12。
