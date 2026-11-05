# 计划二实施计划 — Codex round-1 审计处置

审计：`01-codex-plan-audit-round1.md`（2026-11-04，24 条：9 P1 + 15 P2）。
对象：`docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md`（draft 1 → draft 2）。
处置：24 条全部 ACCEPT；每条的实现代码与断言它的测试都已改在计划正文里（代码保持完整内联）。无 DECLINE。

| # | 决定 | 落实位置 |
|---|---|---|
| 1 | ACCEPT | Task 1 Step 4 `financial_facts_lifecycle`：UPDATE 分支改为 19 个基列的显式 `is distinct from` 比较（不含生成列 `value_text` 与 `status`），头注说明 BEFORE 触发器里 NEW 的生成列未计算；Task 1 Step 1 触发器用例补齐四种允许转换（新增第二行做 staged→quarantined）与非 status 列（`raw_hash`）拒绝 |
| 2 | ACCEPT | Task 1 Step 4 `resolve_facts_quarantine`：临时成员集只用于定位 scope 锁；取锁后 `for update` 重读项并用新助手 `fact_item_members(jsonb)` 重建 `v_ids`，再做全部校验；Task 1 Step 1 新增"并入在裁决等锁期间提交 → 裁决看到新成员（`run_pending`）"的 barrier 用例（16 个用例） |
| 3 | ACCEPT | Task 1 Step 4 `fact_promote_rows`：新增 `not exists` —— 任一 open 的 `same_day_conflict` 项其 `payload.key`（issuer_id/market/concept/period_start/period_end/consolidation/unit/available_date）等于该行即阻塞，与成员列表无关；Task 2 Step 5 内存 `promote` 同规则（`disputes()`）；Task 2 Step 2 `db-contract.ts` 新增"identity 项裁决时另一同日争议仍 open → skipped，争议裁决后 r 可见、c3 仍 quarantined"用例（内存与 pg 共用） |
| 4 | ACCEPT | Task 4 `conceptsForTushare` 返回 `readonly ConceptDef[]`；Task 10 `ParseOptions.concepts`、Task 12 `fieldsFor(api,concepts:readonly ConceptDef[]=FACT_CONCEPTS)`、`FetchTushareOptions.concepts`、`ParseTushareOptions.concepts` 全部 `readonly`；契约补充表 `concepts.ts` 行注明 |
| 5 | ACCEPT | Task 10 Step 1：`type FetchFn=(input:RequestInfo\|URL,init?:RequestInit)=>Promise<Response>`，`vi.fn<FetchFn>(…)`，`fetch.mock.calls[0][1]?.headers`；Task 12 Step 1 同样 `vi.fn<FetchFn>`，中止用例的 mock 改为 `(_u,init)=>{init?.signal?.throwIfAborted()…}`；Task 12 Step 6 `call` mock 的 options 参数改为可选 `o:{limit?;offset?}={}` |
| 6 | ACCEPT | Task 2 Step 4 `db.ts`：删除 `eslint-disable-next-line @typescript-eslint/no-explicit-any`，改为说明注释（与 `table-client.ts` 同一做法，仓库 ESLint 未启用该规则）；Task 2 Step 6 增加 `npm run lint` 零警告的 Expected |
| 7 | ACCEPT（备注：`metricsOfIssuer` 原已 `.eq('formula_version')`，保留） | Task 2 Step 4 `db.ts`：`READ_PAGE=1000`、`IN_CHUNK=200`、`chunkIds`、`pageAll(make,limit?)`（按 `.range()` 固定序分页到短页或 `limit`）；`factsByIds`/`openConflicts`/`filingsOfIssuer`（无 `limit` 时取全集）/`scopeDue`/`scopeRows`/`metricsOfIssuer` 全部走 `pageAll`；Task 2 Step 5 内存与 Task 3 Step 4 pg 的 `filingsOfIssuer` 去掉隐式 1000 上限；Task 2 Step 2 `db.test.ts` 用可链式的 PostgREST 桩验证 1005/1002 行分页、`range` 序列、`eq('formula_version')`、`in()`；`db-contract.ts` 新增 1,001 份 filing / 1,001 条 metric 的全集读取用例（内存与 pg 都跑） |
| 8 | ACCEPT | Task 13 Step 3 `cninfo-link.ts`：新增 `KIND_VETO={annual:/半年/}`，`matchesAnnouncement` 先做否决；Task 13 Step 1 新增"年报 vs 半年报互斥"用例（含更正标题与 q3/q1 交叉），计数 7+1 |
| 9 | ACCEPT | Task 8 Step 6 `syncIssuerFacts`：三类解析器遗留（`ambiguous_value`/`odd_duration`/`missing_available_date`）移到 `no_rows` 早返回之前并计入 `quarantined`；Task 8 Step 2 新增"全部缺可得日期的响应 → 空运行发布且 2 条 `missing_available_date` 项"用例 |
| 10 | ACCEPT | Task 1 Step 4 `resolve_facts_quarantine`：锁后检查 `payload.run_id` 的运行仍 `staged` → `run_pending`（对有成员行的项同样成立，不改变其语义）；Task 2 Step 5 内存实现同；`db-contract.ts` 新增"零事实项在锚定运行 staged 时 `run_pending`，发布/废弃后可确认"用例；Task 9 Step 4 `facts-resolver.ts` 头注写明；Part A 自检更新 |
| 11 | ACCEPT | Task 8 Step 6：`publishedRun` 标志；`abandon()` 在已发布后为 no-op；新 `afterPublish(code,e)`：outcome 保持 `published`，原错误按自身码记入，`release('failed')`；`lease_lost`/预算中止/其他异常三条分支都按 `publishedRun` 分流；Task 8 Step 2 新增"发布后 materialize 抛未知错误 → 运行仍 published、错误 `unknown`、租约 failed 释放、不调 abandonRun"用例；runbook 8.8 与 §16 记录 |
| 12 | ACCEPT | Task 8 Step 6：`SyncDeps.coverageCn?:(parsed)=>CoverageEntry[]`，`skippedSummary(issuer,parsed.skipped)`（`skipped_summary` key `<issuer>:parser`，前 20 条 + `_more`）与 `compactCoverage`（`{"<api>:rt<n>":"<首年>-<末年>:<期末数>"}`，适配 500 字上限）写入 `out.errors`；Task 17 Step 3 `productionSyncDeps` 注入 `coverageCn:coverageSummary`，Task 13 Step 7 CN 回放 deps 同；Task 8 Step 2 新增用例；Task 17 Step 1 `deps.test.ts` 新增 `productionSyncDeps` 装配用例；§16 记录紧凑串 |
| 13 | ACCEPT | 共享契约 `FactsDb.scopeRows(market,issuerIds)`（Supabase 分页 `.in()`、内存、pg 三实现 + 契约断言）；Task 14 Step 3 新增 `scopeRowFor(tables,market,issuerId,{today})` 与 `ScopeInputRow`；Task 8 Step 6 `dueScopes` → `selectScopes`：显式发行人按 id 直取，缺行 apply 时 `reconcileScope` 补建（`reasons:['explicit']`）、dry-run 构造只读行，算不出的以 `outcome:'failed', code:'scope_unresolved'` 计入回执（dry-run 与 apply 两路径）；Task 8 Step 2 的 `vi.mock('./scope')` 增加 `scopeRowFor` 并新增用例；Task 14 Step 1 新增 `scopeRowFor` 用例；Task 17 Step 6 脚本头注、Task 18 Step 4 核对点、runbook 8.8、§16 行 |
| 14 | ACCEPT | Task 7 Step 3 `read.ts`：只对 ok 行建序列，非 ok 行（`includeNonOk`）附在序列外（`disclosure_seq` 空、`is_current=false`、`is_revision=false`），`history=false` 时自然排除；Task 7 Step 1 改原用例的期望并新增"同一组行喂给内存库 `readFacts` 与 `sequencesOf` 逐行比对（history 两种）"用例（7 个） |
| 15 | ACCEPT | Task 11 Step 2：修订用例不再恢复原夹具（注释说明），`let activeGen=MAPPING_GEN` 由 `run()` 默认透传；代号升级用例置 `activeGen=MAPPING_GEN+1` 并断言每份 AAPL filing 都在新代、`read_facts` 全部行在新代、`asOf` 回放与代无关；并发用例两次 `run` 都用 `activeGen`；物化与黄金用例在新代下读取 |
| 16 | ACCEPT | Task 13 Step 7：同日冲突用例改为把 type-1 行克隆进 **type-4 页**（同 `end_date`、同公告日 → 同 K 同 `available_date`，`report_type=4` → 不同 `source_ref`/filing，值 +1），断言两行来自两份 filing、全部 quarantined、当日无 ok 值、一个争议项；新增"同一 filing 改值重发 → 候选键重复，无新行无冲突"用例（6 个） |
| 17a | ACCEPT | Task 8 Step 2 `fails with parse_error…` 用例：期望 `filingsOfIssuer` 返回保留的 gen-0 filing（`abandon_sync_run` 不剪枝，`begin_sync_run` 只剪仍 staged 的运行），再跑一次正常运行断言它被复用并激活到 gen 1 |
| 17b | ACCEPT | Task 12 Step 6 `sums sga_expense…` 用例：`annual` 显式取 `fiscalYear===2023` 的 type-1 年报（注释说明 FY2022 同公告日排在前面且无 BS/CF 行） |
| 17c | ACCEPT | Task 15 Step 1 `materialize` 用例：期望 `{rows:2,…}`，`calls[0].rows.map(metric)` 为 `['gross_margin','q_single_revenue']`，并断言第二行 |
| 17d | ACCEPT | Task 16 Step 1：新增合法 uuid 常量 `OTHER`，替换 `'9'.repeat(36)` 两处，增加 `status 200` 与 `factsByIds` 调用参数断言 |
| 18 | ACCEPT | Task 10 Step 6 `REVISION` 增加 `start/end/baseVal`，`reviseEdgar` 按 accn + fp + start + end 选基准行并在 `base.val !== baseVal` 时 `fail`，追加条目用 `REVISION.start/end`；Task 10 Step 8 的核对脚本扩展为同时校验 revised.json 的 `__recorded.revision`、追加条目与基准值并以退出码表示 `REVISION OK/MISMATCH`，列出下游（Step 9、Task 11）依赖的全部字面量 |
| 19 | ACCEPT | Task 11 Step 1 黄金文件 `required.US:true`、新增 `ready:false`，note 写明语义；Task 11 Step 2 黄金用例：`required.US` → 每个夹具发行人（`CIK` 表）至少一条非 `<pending>` 条目否则失败并打印 owner 步骤；`ready` → 任何 `<pending>` 失败、每个被断言的美股发行人必须在 `CIK` 表、≥ 6 家 × 每家 ≥ 2 期 × ≥ 6 科目；已录入条目逐条回放；Task 13 Step 7 CN 黄金用例同构；Task 11 Step 5 / Task 13 Step 7 / Task 18 Step 5 的 Expected 写明"owner 录入前黄金用例为红、F2-7 不算完成"；runbook 8.11-6 写成阻塞项与操作步骤；§16 记录 |
| 20 | ACCEPT | 顶部"推荐合入顺序"改为带依赖列的"执行顺序"表（1–3 → 4–7 → 14、15 → 8、9 → 10–13 → 16–18）并规定"任务不得修改更晚任务创建的文件"；Task 15 删除 Step 5（Files 去掉 `sync-us.integration.test.ts`，提交只含 `derive.ts`/`derive.test.ts`）；"物化两次一致"用例并入 Task 11 Step 2（import `derive`）；文件结构、规格覆盖表、Part B 依赖说明、接口对齐记录 #19 同步 |
| 21 | ACCEPT | Task 8 Step 6 `linkFilings`：请求开始前 `budget.signal.aborted` → break 不计；请求抛错 → `failed++` 且仍 `updateFilingLink({link_attempts+1})`（catch 内若预算已取消则 break 不计）；none/ambiguous/成功/抛错四种都持久化；Task 8 Step 2 新增"抛错计次至 5 次封顶；预算取消不计"用例；实现要点与 runbook 8.8 更新 |
| 22 | ACCEPT | Task 14 Files 增加 `src/lib/entities/resolve.ts`（一行 `export const isCurrentSecurity=isCurrent;`）；`scope.ts` 的 `openSecurities` → `currentSecurities`：open 行分页 + `gte:{valid_to:today}` 单页，再过 `isCurrentSecurity`；`scopeRowFor` 与 Task 17 `deps.ts::cnIssuer`（新增 `LinkerOptions.today`）同用该谓词；Task 14 Step 1 新增"未来到期仍在范围、当日到期不在范围"用例，Task 17 Step 1 新增 `cninfoLinker` 有效期用例 |
| 23 | ACCEPT | Task 14 Step 1：`NOW_ISO=\`${TODAY}T00:00:00.000Z\``，`recordingDb()` 调 `db.setNow(NOW_ISO)`；到期查询仍用 `TODAY`；新增断言 `next_due_at===NOW_ISO`；Step 4 说明不冻结时钟的后果 |
| 24 | ACCEPT | Task 18 Step 2 runbook 8.10：分七段——客户端函数 → 内部助手（`fact_promote_rows`、`fact_item_members`、`fact_abandon_run`、`fact_run_lock`、`fact_scope_lock`）→ 五表 → 触发器函数（`financial_facts_lifecycle`、`filings_limited_update`）→ `dq_quarantine_fact_ids_idx` → 桶 → 两个清单查询（必须 0 行）；并要求合并前在 `test:db` 临时库演练"回滚 → 清单为空 → 重新应用迁移 → 集成测试通过" |

## 审计"未验证"项的归属

- 真实 PostgreSQL 17 执行（迁移重放、触发器、锁竞争、托管角色权限、回滚）：Task 1 Step 6、Task 3 Step 5、Task 18 Step 2（8.10 演练）与 Step 5 在实施时执行。
- 完整装配后的 typecheck / vitest / build：各任务的 Run/Expected；本轮只做了静态改写，未在仓库里实际运行（计划文件不含可执行代码）。
- 录制夹具字面量：Task 10 Step 8 的核对脚本（现含修订夹具与退出码）。
- 黄金值：owner 步骤 runbook 8.11-6；在此之前 `sync-us.integration.test.ts` 的黄金用例为红是设计状态。

## 本轮顺带改动（不对应审计条目，为落实上述条目所需）

- 共享契约 `FactsDb` 由 18 个方法增至 19 个（`scopeRows`）；三实现、契约用例、自检记录同步。
- `sync.ts` 删除不再使用的 `FAR_FUTURE`；`SyncDeps` 新增可选 `coverageCn`；`IssuerOutcome` 新增 code `scope_unresolved`（`fetchKey:''`）。
- `cninfo-link.ts` 新增导出 `KIND_VETO`；`scope.ts` 新增导出 `currentSecurities`、`scopeRowFor`、`ScopeInputRow`；`db.ts` 新增导出 `READ_PAGE`、`IN_CHUNK`、`chunkIds`；迁移新增内部函数 `fact_item_members`。
- 计划各处用例计数与 Expected 行已按新增用例更新（facts.integration 16；pg 契约 9；db.test 18；read 7；sync 26；cninfo-link 7+1；sync-us 8；sync-cn 6；scope 6；deps 7）。
