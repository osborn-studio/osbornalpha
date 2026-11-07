# F3 文档管道计划 — Codex 计划审计第 1 轮处置

- 审计：`docs/audits/2026-11-06-document-pipeline/01-codex-plan-round1.md`（4 个 P1、7 个 P2；行号对应计划提交 `b2d908b`）
- 计划：`docs/superpowers/plans/2026-11-06-document-pipeline.md`，改动记在 `## 整合记录` 的"Codex 计划审计第 1 轮处置"
- 处置：指挥裁决（P1-1 拒绝，其余接受），日期 2026-11-06

## P1-1 拒绝理由

规格决定 C：自动决定必须有 owner 记录的审批行，该行以评测 precision 与 recall 均 ≥ 0.95 为门槛（`extraction_approvals` 的 `ea_threshold` 约束；评测见 runbook §10(f)）。默认没有任何审批行，所以默认一切都是人工决定；cron 的 auto 阶段在没有审批行时什么也不做（Task 15 用例 "without an approval row nothing is decided"）。记录审批是 owner 本人的行为，不是代码或 cron 的行为。审批的范围很窄：按 `extractor_ref` + `extractor_version` / `table_algo_version` / `code_version` 三个版本列 + `concepts` 限定，版本任一变化即不再适用；可随时撤销（`revoked_at`）；并且在暂存发布时再查一次——已撤销则 `stage_candidate_publication` 把候选退回 `candidate` 并报 `approval_revoked`，整次晋升废弃。因此"按 owner 授权的提取器自动确认"本身就是 owner 的决定，保留 auto-decide，不改规格与代码。

## 处置表

| ID | 处置 | 改动位置 |
|---|---|---|
| P1-1 | **拒绝**，不改代码。规格决定 C：自动决定必须有 owner 记录的审批行，且该行以评测 precision 与 recall 均 ≥ 0.95 为门槛（`ea_threshold`）；默认没有审批行，所以一切都是人工决定。记录审批是 owner 本人的行为；审批按 `extractor_ref` + 三个版本列 + `concepts` 限定，可撤销，并在暂存时再查一次（撤销 → `approval_revoked`，候选回 `candidate`，整次晋升废弃）。保留 auto-decide。 | 无 |
| P1-2 | 接受。新增阻断检查 `value_replays`：用值引用的 snippet 经 `values.ts::cellValue`（记录的 scale，十进制字符串精确算术）与 `applySign`（标签引用）重算规范值，必须等于 `payload.value`；记录的 unit/scale 必须是单位引用经 `scale.ts::detectAmountUnit`/`detectEpsUnit` 读出的值，`sign_flip` 必须与标签证据一致。检查数 7 → 8 | Task 15 `checks.ts`（`valueReplays`、`unitEvidence`、`CHECK_ORDER`）、`checks.test.ts`（snippet 1 / scale 1000 / value 999 → 阻断；超双精度差 1；sign_flip 不符；scale 与单位引用不符、币种不符、无倍数、eps 子单位、非法 scale；`cand` 助手改为一致的单位证据，默认 scale 1）、`test-support.ts` 种子单位行改为 `單位：元 幣種：人民幣`（与种子 scale 1 一致）、`candidates/run.test.ts`（`checks.length===8`） |
| P1-3 | 接受。`applySign`：抵免类标签一律 −\|x\|，只在符号确实改变时记 `sign_flip` | Task 14 `values.ts`、`values.test.ts`（`-5000` 抵免 → `-5000` 不翻转；0；已负值）、`generate.test.ts` 新用例（经生成：`(10,185)` → −10185000 不翻转；`24,458` → −24458000 翻转；`0`、`(0)` → 0 不翻转；`run` 助手接受 `PagesJson`）；§17 偏差表措辞。晋升测试不覆盖税项，未加 |
| P1-4 | 接受。`publish_hk_run` 加第 6 参 `p_zero_output jsonb`（`[{document_id, extraction_id}]`）：格式错 → `invalid_input`；在文档锁下、并对预期抽取行 `for share`（文档 → 抽取的锁序）复核：仍是本发行人公开中文 HKEX 文档、绑定在本运行的 filing 上、当前抽取未变、primary、候选 done，否则 `stale_plan`（调用方按原 stale_plan 路径废弃并下次重规划）。端口 `publishHkRun(…,expectedRev,zeroOutput)` 三实现同步；新类型 `HkZeroOutput` | Task 13 迁移二 SQL + 头注、`facts-port.ts`（接口、Supabase、内存）、`pg-facts-port.ts`、`facts-port-contract.ts`（端到端用有效选择发布；格式错；新用例：选择与发布之间文档换到新抽取 → `stale_plan`、不前进代、事实仍 staged；当前但候选未 done 也 `stale_plan`）、`fact-citations.integration.test.ts`（`F3_RPC` 签名、null 参数）、全部 5 参调用补 `[]`；Task 16 `promote.ts` 传零输出选择 + 竞态测试（发布前另一工作者重抽 → `stale_plan`、filing 代不变、可见事实不变）；计划头部接口与契约补充 |
| P2-1 | 接受。`db.ts` 加 `LOOKAHEAD_MAX=999`、`lookaheadLimit`、`checkApprovalsLimit`：`documentVersions`/`extractionsOf` 每页 ≤ 999 行（预读请求 ≤ 1000，PostgREST 上限内），`approvalsFor` 的 limit > 999 → `invalid_input`；三实现一致 | Task 2 `db.ts`、`memory-documents-db.ts`、`db.test.ts`（存根：limit 1000 请求 1000 行、页 999 行且有 next；`approvalsFor(1000)` 不发请求即拒绝）、`db-contract.ts`（`approvalsFor(1000)` → `invalid_input`）；Task 3 `pg-documents-db.ts`、>1000 行用例（首页 999 行）；契约补充表 |
| P2-2 | 接受。新文件 `src/lib/documents/fresh-db.ts`：`freshMigratedDatabase(adminUrl)` 用 harness 超级用户建 `f3_replay_<随机>` 临时库、装与 `local-db.ts` 相同的 auth/storage 桩、按序应用全部迁移；`replayFiles` 重放；`drop()` 删库。所有重放断言改在临时库里跑，不再碰共享库（`test:migrations` 的双库排演不变） | Task 1 新文件 + `documents.integration.test.ts`（删 `replayMigration`；迁移一重放两次）；Task 13 `fact-citations.integration.test.ts`（删 `replayMigration`；迁移二重放、规格二 → 迁移二重放的定义比对都在临时库）；仓库约定、文件结构、契约补充、Task 1 `git add` |
| P2-3 | 接受。迁移一七个触发器函数各加 `revoke execute … from public, anon, authenticated, service_role`；权限测试按迁移文件里的函数名从 `pg_proc` 枚举全部签名，要求恰为 写函数 ∪ 内部 ∪ 触发器 ∪ `read_documents`，且 anon/authenticated 只能执行 `read_documents`；迁移二同样按文件枚举，要求恰为 `F3_RPC ∪ F3_INTERNAL` | Task 1 SQL、`documents.integration.test.ts`（`TRIGGER_FUNCTIONS`、枚举断言）；Task 13 `fact-citations.integration.test.ts` |
| P2-4 | 接受。`syncIssuer` 认领租约后重读本行（`scopeRows`），模式与游标取重读值；`advance_document_cursor` 加 `p_reset boolean default false`：不带 reset 时已完成回填只接受重复完成（不得改回未完成、不得写新回填游标），游标带 `seq` 后新游标 `seq` 必须严格递增，否则 `cursor_regression`（P0001）；TS `advanceCursor(…,done,reset?)`、错误码 `cursor_regression` 三实现同步 | Task 1 SQL + 测试（回退被拒、reset 允许）；共享契约 `types.ts` 两处；Task 2 `db.ts`（`MESSAGE_CODES`、Supabase）、内存实现、`db-contract.ts` 新用例；Task 3 pg；Task 7 `sync.ts` + 并发用例（选择与认领之间别的批次完成回填并释放 → 本批次走轮询、不回退）、运维重放用例改用 reset；runbook §6 |
| P2-5 | 接受。游标改为 source_ref 检查点 `{segment,last_ref,settled,attempts,seq}`：续跑时 `settled` 跳过、已入库且不晚于 `last_ref` 新位置的跳过、未入库项一律处理；重试次数按 source_ref；`knownSourceRefs` 查整张新列表 | 共享契约 `DocScopeCursor`；Task 7 `sync.ts`（头注、续跑算法、`ItemResult.stored`）、`sync.test.ts`（全部游标断言改形；新用例：检查点项被移出列表时不跳过 B、检查点前插入的 X 仍抓取、失败项前再插入时次数仍记在 r-c、第三次耗尽隔离）；Task 6 `pollSegment` 测试游标；Part B 说明与 runbook §6 SQL |
| P2-6 | 接受。`hk_promotion_due` 条件 (c) 排除"运行已发布且事实仍隔离"的暂存发布行（等 owner 裁决，0a 步也动不了它）；裁决使事实变 ok 或消失后重新到期。内存实现同步 | Task 13 迁移二 SQL + 头注、内存 `promotionDue`、契约用例（裁决前不到期、裁决后到期）；Task 16 `promote.test.ts` 新用例（limit 1：首个发行人等隔离裁决时第二个发行人被选中；第二批空；裁决后首个发行人回来） |
| P2-7 | 接受。迁移一新增 `renew_document_extract_lease`、`renew_candidates_lease`（持有者续租、不计尝试；被接管或状态已变 → false）；`DocumentsDb.renewExtractLease`/`renewCandidatesLease` 三实现；抽取在上传 pages.json 与 `finishExtract` 前续租；候选在生成、插入、写检查、隔离前续租，生成与检查前查预算（`MIN_PHASE_MS=20s`，不足 → `deadline_hit`、`finishCandidates(failed)`）；晋升在第 2/3/4 步前以同批次 `claimLease` 续租，第 2、4 步前查预算。被接管 → `lease_lost`、不再写 | Task 1 SQL + 权限列表；共享契约两处；Task 2/3 三实现 + 契约用例；Task 10 `extract/run.ts` + 用例（被接管 → 无 pages.json、无抽取；未被接管 → 续租后完成）；Task 15 `candidates/run.ts` + 2 个用例；Task 16 `promote.ts` + 用例（被接管 → 无 filing/事实/发布行；预算不足 → `deadline_hit`、运行废弃、租约释放）；runbook §4 |

## 验证（沙箱：工作树副本 + 从计划抽出的全部文件，未在工作树内跑测试）

- `tsc --noEmit`：0 错误
- `eslint --max-warnings=0`：F3 全部 119 个 TS 文件 + `src/lib/dq/batches.ts`、`scripts/s4/local-db.ts`，0 输出
- vitest F3 单测：43 个文件、337 例全部通过（处置前 322 例）
- 本机 PostgreSQL 17（`LC_ALL=C`，UTF8 harness）四个 F3 critical 套件（`documents`、`fact-citations`、`sync-hk`、`sync-us`）：57 例全部通过（处置前 54 例）
