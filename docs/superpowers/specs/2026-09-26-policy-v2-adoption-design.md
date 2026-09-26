# E3b：Alpha 采用 market-policy/2.0 与引擎 0.3.0（设计）

日期：2026-09-26。来源：总纲 WP-E3 重划、Alpha `docs/handoffs/alpha-s6/POLICY-NEXT.md` 消费者验收清单、OSanalyst `docs/handoffs/e3a/HANDOFF.md`。分支 `codex/wp-e3b-policy-v2-adoption`，基于 `main`。常设授权下按默认方案执行。

## 目标

新注册的 S4 观察使用 `alpha-observation-contract/2.0`（挂牌身份 `listing_mic` 与会话日历分离，基准 SPY/ARCX）；S6 通过 `mapMarketHandoff` 冻结交接包行情；真实证券的评价路径只对「2.0 观察 + 已核验身份证明 + `ALPHA_S6_REAL_MARKET=1`」打开；旧 1.0 观察、旧 golden、旧回放逐字节不变。

## 非目标

不产出真实交接包（接口负责人事项）；不改 REL/Jev；不改 UI；不动生产。

## 决定（默认）

1. `vendor/dsh-trade-strategy-evaluator-0.3.0.tgz`（SHA-256 `c39241a0465da6fe4a8b41da60367b78c7ab37b7e7a69ead1f027cfe635741d4`）替换依赖；0.2.0 tarball 保留在 `vendor/` 供追溯，`verify-engine.ts` 同时核 0.2.0/0.3.0 哈希与两套 golden。
2. 发布 `docs/handoffs/alpha-s6/market-policy-v2.json`（与引擎 handoff 同一字节）+ `.sha256`，`alpha-observation-contract-v2.schema.json`，`identity-attestations.json`（本轮只含合成条目；真实条目字段与来源要求写在 README）。`policy-v2.proposal.json` 的 `status` 改 `released`、`real_evaluation` 改 `open_for_policy_2_observations_with_attested_handoff_bundles`；`market-pair.ts` 改为核对已发布政策文件。
3. `market-policy.ts` 新增 `MARKET_POLICY_V2`/`MARKET_POLICY_V2_HASH` 与 `planObservationSessions(frozenAt, eligibilityAt, version='market-policy/2.0')`；断言 V2 哈希等于引擎 `POLICY_V2_HASH`。
4. `s4/decisions.ts`：新观察一律 2.0。`stocks_universe.exchange` 的 `XNYS`/`NYSE` 映射为 `listing_mic='XNYS'`；Ajv 按 2.0 schema 校验；`security_mapping` 记 `listing_mic` 与 `source_exchange`。老观察 defer 继续沿用原记录。
5. `s6/market.ts` 新增 `freezeMarketHandoff(actor, observationId, {raw, id})`：观察必须 2.0（否则 `rule_unsupported`）；身份证明从 `identity-attestations.json` 读取；标的腿传 `security=observation.securities[0]`，基准腿传政策基准身份；合成观察只接受合成包，真实观察要求 `ALPHA_S6_REAL_MARKET=1` 且包与证明均非合成；证据 `{kind:'attested-handoff'|'synthetic', proof:{bundle_sha256, attestation}}`。`marketFor` 接受 `attested-handoff`（真实需 env）。旧 kline 路径对真实证券保持关闭。
6. `s6/store.ts` `inputFor`：1.0 真实观察仍 `rule_unsupported`；2.0 真实观察在 `ALPHA_S6_REAL_MARKET=1` 下允许。
7. `scripts/s6/fixtures.ts` 增 `syntheticHandoff(security, sessions, {k, split})` 与 `syntheticAttestations(bundles)`；`scripts/s6/freeze-market-handoff.ts <state> <observation> <bundle.json> [--id]` 操作员脚本。
8. S7 manifest 重新生成（新增 `scripts/s7/build-manifest.ts`），`verify-handoff.ts` 增核 0.3.0、golden v2、released 状态。

## 测试

- `market-policy.test.ts`：V2 哈希 = 引擎常量、= `.sha256` 文件；1.0 断言不变。
- `market-pair.test.ts`：`proposed_policy_status` 为 `released`。
- `store.integration.test.ts`（真库）：新观察 `schema_version 2.0`、`listing_mic XNYS`；`freezeMarketHandoff` 合成标的+SPY 冻结、重复幂等、篡改哈希拒绝；`prepareInput` 生成 2.0 输入并 `evaluateObservation` 返回 `engine_version 1.1.0`、`rule_version market-policy/2.0`、`pending_start`；真实观察缺 env → `policy_blocked`；1.0 kline 路径对真实仍 `rule_unsupported`。
- `verify-engine.ts` 与 `verify-handoff.ts` 通过；既有全量测试通过。
