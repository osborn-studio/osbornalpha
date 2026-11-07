# 宏观工作台实施记录

每任务一行：Sonnet 5.5 实施 → Opus 复审（规格 + 质量，一个代理两阶段）→ Codex gpt-6-astra medium 一轮（审阅 + 挑战合并，owner 2026-11-06 节约指令）→ 批量修复。Codex 报告 `task-<N>-codex.md`。

| 任务 | 提交 | Opus 复审 | Codex 结论 | 修复轮次 / 备注 |
|---|---|---|---|---|
| 2 | 4640b10 | Spec PASS / Quality APPROVE (2 Minor, no change) | clean | 0 |
| 4 | 2bbd484 | Spec PASS / Quality APPROVE (Minor 1 plain-decimal guard) | clean | 1 (df4a85e) |
| 5 | 0c08880 | Spec PASS / Quality CHANGES (Important month-end witness; Minor canonical guard) | T5-1 P2 (same) | 1 (df4a85e) |
| 8 | 1a12998 | Spec PASS / Quality APPROVE (4 Minor) | T8-1..3 P2 | 1 (b503e32; period='2026-' verified live) |
| 10 | f7b274e | Spec PASS / Quality APPROVE (Minor: active-status guard → batched) | clean | pending batch |
| 1 | 7357de1 | Spec PASS / Quality CHANGES (1 Important, 4 Minor) | A1 P1 + A2–A4 P2 | 1 (213f9da) + Codex recheck |
| 3 | 587f661 | Spec PASS / Quality CHANGES (memory twin parity) | T3-1, T3-2 P2 | 1 (213f9da) |
| 1/3 recheck | 213f9da | — | R1 P1 race, R2 plan, R3 P2 | 1 (23accbf; R2 → task-11 amendment) |
| 6 | 610b6bc | Spec PASS / Quality CHANGES (lost assertion, fake state) | T6-1 P1 | 1 (aa90eb2); recheck clean |
| 7 | c00a20c | Spec PASS / Quality APPROVE (4 Minor) | T7-1..3 P2 | 1 (de2de8d) |
| 14 | 304c3c9 | Spec PASS / Quality APPROVE (4 Minor) | T14-2, T14-3 P2 (T14-1 = deferral to T13) | 1 (485f6f2) |
| 9 | 661d525 | Spec PASS / Quality APPROVE (5 Minor) | T9-1..3 P2 | 1 (4506542; residual: counts-only loss on crash between derive writes and checkpoint — documented) |
| 11 | 7f09318 | Spec PASS / Quality APPROVE (3 Minor) | clean | 1 (cc9eff0) |
| 13 | fb4d7cd | Spec PASS / Quality CHANGES (diff provenance) | T13-1..4 P2 | 1 (aee92f1) |
| 15 | 2793fc3 | Spec PASS / Quality CHANGES (retry outcome) | T15-1, T15-2 P2 | 1 (5ef0447) |
| 12 | 42ddb29 | Spec PASS / Quality CHANGES (Critical F4 composite id; MacroUnavailable; circular replay) | T12-1, T12-2 P2 | 1 (cc9eff0) |
| 16 | 9e7554d | Spec PASS / Quality CHANGES (versions route auth order, current-row label) | T16-1, T16-2 P2, T16-3 P3 | combined UI fix |
| 17 | cf9918c | Spec PASS (YoY transform plan gap) / Quality CHANGES (client diff, point limit, workbench codes) | T17-1..4 P2 | combined UI fix |

## Task 18 — 隔离裁决 CLI、运行手册、全量闸门与验收证据（2026-11-06）

交付：`src/lib/macro/quarantine-cli.ts` + 测试（7 个）、`scripts/macro/resolve-quarantine.ts`、`docs/runbooks/macro-sync.md`（按当前代码重写：ingest start/chunk/finish 协议、owner/finish 令牌与 takeover、reject-only 隔离原因、`republish_macro_snapshot` 回滚、SAFE 历史自 2026-01-05、FRED `first_seen`、派生期崩溃只丢计数、失败分析不计配额、`MACRO_JUDGMENTS_ENABLED` 默认关且 F4 必须经服务端 `MacroReadApi`；新增 §13“生产上线（合并之后）”六步）。实况检查见 `21-live-checks.md`。

### 闸门结果

| 命令 | 结果 |
|---|---|
| `npm test` | 338 文件通过 / 1 失败：`owned-process-group.test.ts`（`kill EPERM`，进程组测试，与宏观无关）；该文件单独重跑 2/2 通过。其余 3323 通过 / 266 跳过 |
| `npm run typecheck` | 通过（`tsc --noEmit`，0 错误） |
| `npm run lint` | 通过（`--max-warnings=0`） |
| `npm run build` | 通过（`/today` 等路由生成，无客户端打包导入服务端模块的错误） |
| `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db` | 363 文件 / 3588 通过 / 2 跳过；关键套件 25 个 265 通过；迁移 51 个；PostgreSQL 17.10；本次没有出现已知的 load-cascade 抖动，无需重跑 |
| `… npm run test:migrations` | `PASS: fresh schema equals seeded upgrade; existing rows preserved; both local clusters stopped.` |
| `scripts/macro/.venv/bin/python -m pytest scripts/macro -q` | 25 passed |

### 验收证据（规格 §14 项 1–4）

1. **目录逐项核实或带原因缺失；无 yfinance / eastmoney / jin10 / sina 来源**：`npm test -- replay.test.ts catalog.test.ts regime.test.ts pages.test.ts macro-messages.test.ts macro-sync/route.test.ts freshness.test.ts routes.test.ts` → 8 文件 148 通过。`rg -i "yfinance|eastmoney|jin10|sina" src/lib/macro scripts/macro src/app/api/macro`（排除夹具与 venv）只命中两处测试里的“禁用词”断言：`catalog.test.ts:8`（`BANNED` 正则）与 `evidence.test.ts:44`（用 `adapter:'yfinance'` 断言存证被拒）；没有任何取数主机、适配器或 seriesKey 命中。浏览器里“缺失原因”截图由指挥官完成（清单见 `21-live-checks.md`）。
2. **规则错配回归（FX / GDP 观测从不命中利率 / PMI 规则）**：`regime.test.ts` 的 `type isolation` 组，例如 `an fx level of 7.12 never matches a policy_rate rule`。
3. **离线 `macro-sync`：概览继续服务旧快照、连续两次失败后采集为 `error`、不出现 0**：`src/app/api/cron/macro-sync/route.test.ts` 的 `all series failing → failed batch, one more consecutive error, no observations`、`all series failing AFTER a populated run is still failed: no derivation, no duplicate inflation, freshness not refreshed`、`publishes US once per real run … an all-failed run after a populated one skips with no_native_outcomes`（发布被跳过 = active 快照不变）；`src/lib/dq/freshness.test.ts` 的 `is missing without a successful run, error after two consecutive failures`。可选的非生产离线演练未做（无非生产 Supabase）。
4. **判断层关闭：页面与 API 无象限 / 得分 / margin；开启但 F4 不可用显示“暂不可用”**：`pages.test.ts`（`only the workbench server page reads MACRO_JUDGMENTS_ENABLED`）、`macro-messages.test.ts`（`copy outside the judgment slot never uses judgment vocabulary`）、`routes.test.ts` / `read-api.test.ts`（关闭时快照路由不返回 `regime` / `contributions`，`MacroReadApi` regime 为 null）。浏览器控制台正则与槽位截图由指挥官完成。

### 未完成 / 说明

- 浏览器检查（Step 8）、概览延迟 p95（Step 7.3）、路由 `?preview=1` 的 HTTP 层实测：未做，指挥官清单见 `21-live-checks.md`。
- 计划里的日志路径 `10-implementation-log.md` 实际为本文件（`20-implementation-log.md`）。
| 18 | 30b11ef | (runbook/gate task; Codex round below) | pending | — |
