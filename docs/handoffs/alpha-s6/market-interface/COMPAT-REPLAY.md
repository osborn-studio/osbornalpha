# 版本化提案与冻结引擎兼容回放 / Versioned proposal and frozen-engine compatibility replay

日期：2026-09-25。范围：交接第 9 节工作包 E 的离线部分。只用仓内合成 fixtures、未发布的 [policy-v2.proposal.json](policy-v2.proposal.json) 和固定的 `dsh-trade-strategy-evaluator@0.2.0`；不联网、不取真实行情、不改引擎或政策版本。

## 结论 / Findings

1. **提案是版本化且失效关闭的。** `validateMarketPair` 把提案的 `status`、`real_evaluation`、父政策 SHA、会话日历版本与日历 MIC 作为前置栅栏，任何漂移都返回 `rule_unsupported`；配对摘要 `pair_sha256` 绑定提案的 JCS 摘要，提案内容变一字则摘要变。现在有测试证明：把提案改成 `released`、提前打开 `real_evaluation`、父政策 SHA 或日历漂移，都被拒绝。
2. **冻结引擎不能消费 V2 身份。** 0.2.0 的 `mapAlphaKline` 在映射阶段就以 `data_insufficient/market_mismatch` 拒绝 `SPY/ARCX`；映射后改标签的快照也被 `validateMarketSnapshot` 拒绝。`contract_valid` 的双包结果始终 `engine_compatible:false`、`accepted_for_evaluation:false`，并保留 `engine_policy_upgrade_required` 等 blocker。这就是“冻结引擎不能直接消费未发布 V2 提案”的可执行形式。
3. **失败可归因到腿。** 目标包或基准包任一失败都带 `leg` 字段，供应商能知道该修哪个包；同一 SPY 作为两腿被拒。
4. **实源适配器兼容方案没有新代码可写。** 现有 `s6/market.ts` 对所有非合成证券在网络请求前返回 `rule_unsupported`，并拒绝 `datagateway` 来源；新增真实适配必须与新引擎版本、输入输出 schema、golden 和固定包一起发布（见 [POLICY-NEXT](../POLICY-NEXT.md)）。本轮不伪造这一步。

突变检查：去掉提案状态栅栏、去掉腿归因、去掉基准 ticker 规则、把提案从配对摘要中移除，各自使对应测试失败后已恢复。

## 仓库状态发现 / Repository state

- Alpha 的 S4–S7 实现（`codex/s5-s6-alpha-integration`，12 个提交、225 个文件）只存在于本机工作树，未推送、无 PR，`origin/main` 上没有 `src/lib/research/s4|s6`。本轮在该分支与 `origin/main` 的干净合并之上工作。
- 合并 `origin/main` 后 `scripts/s7/verify-handoff.ts` 失败：main 的 “align lockfile with npm 10” 改变了 `package-lock.json`，与共享契约清单里固定的锁文件不一致。集成时需按发布流程重新固定清单，不能只改数字。

## 变更 / Changes

- 新增 `src/lib/research/s6/market-pair-compat.test.ts`（9 个场景）。
- 未改动运行时、引擎、政策、提案或 fixtures。

The two-leg handoff now has executable proof that the V2 proposal is versioned and fails closed on any drift, that the frozen 0.2.0 adapter and engine refuse the proposal's ARCX benchmark identity, and that failures name their leg. No real-source adapter was written: that step is gated on a versioned engine release, not on more offline code.
