# E3b 交接：Alpha 采用 market-policy/2.0 与引擎 0.3.0（2026-09-26）

分支 `codex/wp-e3b-policy-v2-adoption`（基于 `main`）。设计 `docs/superpowers/specs/2026-09-26-policy-v2-adoption-design.md`。上游：OSanalyst PR #2（`docs/handoffs/e3a/HANDOFF.md`）。

## 变化

| 层 | 变化 |
|---|---|
| 引擎 | `vendor/dsh-trade-strategy-evaluator-0.3.0.tgz`，SHA-256 `c39241a0465da6fe4a8b41da60367b78c7ab37b7e7a69ead1f027cfe635741d4`；0.2.0 保留供旧回放追溯。`scripts/s6/verify-engine.ts` 同时核两哈希与 1.0/2.0 golden。 |
| 政策 | `docs/handoffs/alpha-s6/market-policy-v2.json`（`identity_field=security.listing_mic`、目标 XNYS、基准 SPY/ARCX、`calendar_mic=XNYS`）+ `.sha256`（`9d7c851c…c566c`，与引擎 `POLICY_V2_HASH` 相等，由 `market-policy.test.ts` 断言）。`policy-v2.proposal.json` 状态 `released`。 |
| 契约 | `alpha-observation-contract-v2.schema.json`；S4 `submitDecision` 新注册一律 2.0（`stocks_universe.exchange` 的 XNYS/NYSE → `listing_mic='XNYS'`；SPY 不能作标的）。老观察不改。 |
| 行情 | `freezeMarketHandoff`：交接包 → `market-snapshot/2.0`，身份须命中 `identity-attestations.json` 中同一份身份文件的 sha256；标的腿带 `company_entity_id`，基准腿为 SPY/ARCX。kline DTO 路径仅合成材料，对 2.0 观察按观察身份重贴标签。 |
| 门 | 1.0 真实观察 → `rule_unsupported`（不变）；2.0 真实观察无 `ALPHA_S6_REAL_MARKET=1` → `policy_blocked`；合成观察只接受合成包与合成证明；真实包不能冻结到合成观察。 |
| 工具 | `scripts/s6/freeze-market-handoff.ts <state> <owner> <observation> <bundle> [--id]`；`scripts/s7/build-manifest.ts` 重发 S7 清单；`verify-handoff.ts` 增核 0.3.0、政策 v2、无真实证明、2.0 golden。 |

## 身份证明清单

`docs/handoffs/alpha-s6/identity-attestations.json`：`{ticker, listing_mic, currency, synthetic, identity_evidence_sha256, source_url, attested_at, attested_by}`。**当前只有两条合成条目**（S6SYNTH/XNYS、SPY/ARCX，来自 `market-interface/*.synthetic.json`）。真实条目由操作员核对发行人页面（SPY：NYSE Arca / ARCX）或交易所挂牌页原文快照后写入，`attested_by` 为具名操作员；`verify-handoff.ts` 在本仓库断言没有真实条目被随附。

## 验证

- 真库集成（`store.integration.test.ts`）：新观察为 2.0 且 `listing_mic=XNYS`；合成交接包两腿冻结、重复幂等、篡改 → `idempotency_conflict`；`prepareInput` → `evaluateObservation` 返回 `osanalyst-engine/1.1.0`、`rule_version market-policy/2.0`、`pending_start`；未证明身份 → `data_insufficient`；异证券 → `scope_denied`；真实包冻结到合成观察 → `scope_denied`；kline 真实 SPY → `rule_unsupported`。
- `market-policy.test.ts`、`market-pair.test.ts`、`market-handoff.test.ts` 更新；全量测试、typecheck、lint、build、`verify-engine.ts`、`verify-handoff.ts` 见 PR。

## 未完成（如实）

真实交接包与真实身份证明尚无；`ALPHA_S6_REAL_MARKET` 默认关闭；成熟窗口仍 pending；Jev not_run；无生产变更。
