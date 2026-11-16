# F3 文档管道计划 — Codex 计划审计第 2 轮处置

- 审计：`docs/audits/2026-11-06-document-pipeline/03-codex-plan-round2.md`（1 个 P1、2 个 P2，含第 1 轮未关闭的 P2-7；第 1 轮 P1-1 拒绝理由被认可、不重开）
- 计划：`docs/superpowers/plans/2026-11-06-document-pipeline.md`（第 1 轮已提交为 `535cc2f`），改动记在 `## 整合记录` 的"Codex 计划审计第 2 轮处置"
- 处置：指挥裁决三项全部接受，日期 2026-11-06

## 处置表

| ID | 处置 | 改动位置 |
|---|---|---|
| R2-P1-1（并关闭 P1-2） | 接受。`detectEpsUnit` 回报 `inherited`；仙/cents 这类不含币种的子单位，生成器另记表的金额单位引用 `FactCitations.unit_currency`（晋升时也以 role `unit` 写入 `fact_citations`）；检查只从已引用证据推币种：先读子单位本身，不含币种时用 `unit_currency` 引用的金额单位，没有该引用 → `eps_currency_uncited`；绝不读 `payload.unit`。迁移二 `assert_run_evidence_complete` 与内存实现：unit 引用"恰 1 条"改为"至少 1 条" | 共享契约 `FactCitations`（两处）；Task 14 `scale.ts`/`generate.ts`（Draft.unitCurrency、引用、指纹、page_nos）+ `scale.test.ts`；Task 15 `checks.ts`（`unitEvidence`、`citationIdsOf`）+ `checks.test.ts`（仙 + 人民幣千元：CNY 通过、改成 USD/share 阻断、缺币种引用阻断、cents + 千港元 通过）；`generate.test.ts` 生成→检查用例（CNY 表 + 仙，payload 改 USD/share → `scale_mismatch` 阻断）；Task 13 迁移二 SQL 与内存 `assertEvidence`；Task 16 `promote.ts` 证据 |
| R2-P2-1 | 接受。`detectAmountUnit` 返回 `evidence`（首个币种行与倍数行）与覆盖两行的单一引用范围 `cite`；该范围是检测输入（标题区 + 首表表头，页首连续行）的子段，检查对引用文本重放得到同一币种与倍数 | Task 14 `scale.ts` + `scale.test.ts`（分行、跨页 → `unit_split_pages`）；`generate.test.ts` 生成→检查用例（`人民幣` 与 `千元` 分两行，全部候选 `value_replays` 通过、`checks_passed`） |
| R1-P2-7（第 1 轮未关闭） | 接受。新文件 `lease.ts`：`withLeaseHeartbeat(renew, fn, {intervalMs})` 在被等待的长阶段期间每 `HEARTBEAT_MS=120s` 续租；续租返回 false → 立即以 `lease_lost` 拒绝并中止 AbortSignal；续租抛错视为暂时、下一拍重试；阶段结束（无论成败）停表并中止 signal。`guardCalls` 包装客户端，中止后一切调用抛 `lease_lost`，被放弃的阶段不再写。接入：抽取版面（pdf.js）、候选整段（生成、检查、写入，结果仅在完成时合并）、每个发行人的晋升（`promoteIssuer` 拆出 `promoteClaimed`）。阻塞工作有界：`ExtractBudget.maxPages`（`MAX_PDF_PAGES=1500`，超出 → `too_many_pages`）与每文档预算 `DOC_EXTRACT_MS=240s`（远小于 600 s 租约，逐页检查，页间 await 让心跳运行）；第 1 轮的阶段前续租保留 | Task 10 新文件 `lease.ts` + `lease.test.ts`（假定时器：长阶段中续租；接管 → 立即 `lease_lost`、被放弃的阶段写调用被拒；续租抛错重试）、`extract/run.ts` + 假定时器用例（3 次续租后接管 → `lease_lost`、无 pages.json/抽取）；Task 9 `pdf.ts`（`maxPages`、`ExtractTooManyPages`）+ 测试；Task 15 `candidates/run.ts`（`candidatesClaimed`）+ 假定时器用例（生成中续租、接管 → `lease_lost`、生成结束后仍无候选）；Task 16 `promote.ts` + 假定时器用例（规划中续租、接管 → `lease_lost`、之后不暂存任何东西）；文件结构、契约补充 |

## 验证（沙箱：工作树副本 + 从计划抽出的全部文件；未在工作树内跑测试）

- `tsc --noEmit`：0 错误
- `eslint --max-warnings=0`：F3 全部 121 个 TS 文件 + `src/lib/dq/batches.ts`、`scripts/s4/local-db.ts`，0 输出
- vitest F3 单测：44 个文件、346 例全部通过（第 1 轮后 337 例）
- 本机 PostgreSQL 17（`LC_ALL=C`，UTF8 harness）四个 F3 critical 套件：57 例全部通过
