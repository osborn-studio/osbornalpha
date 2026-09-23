# 真实 SPY 的下一版契约交接

状态：已发现并阻断当前契约冲突；新引擎/政策包尚未发布。不能以此文档替换任何已有 Observation 的 policy/hash。

## 已核实事实

2026-09-22 查看 [SPY 发行人页面](https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy)，Listing Information 列出 NYSE ARCA、USD、SPY、ISIN US78462F1030。[ISO 10383 登记附件](https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC_Annexes_April2025.pdf) 将 NYSE ARCA 列为 ARCX。

固定 S5 `dsh-trade-strategy-evaluator@0.2.0` 的 `validateMarketSnapshot` 要求每个 security.exchange 均为 XNYS。S4 market-policy/1.0 同时登记了 XNYS 和 SPY。这混合了证券挂牌身份与用于观察窗口的交易日历。即使某段交易时段相同，也不能把 ARCX 身份改写成 XNYS。

Alpha 在发行人身份凭据和下一版契约就绪前，对所有非合成证券的评估行情捕获/冻结及新输入构建返回 `rule_unsupported`；捕获在网络请求前阻断。只封 SPY 无法防止别的非 XNYS 证券被错误标记，因此本轮采用完整关闭真实路径的方式。独立公开行情能力探针仍可运行；合成 SPY 与旧冻结 Replay 保持原行为。已通过回归用例。

IBM [官方拆股说明](https://www.ibm.com/investor/help/ibm-stock-splits-and-ibm-stock-dividends)称最后一次拆股发生在 1999 年。这能作为后续因子核验的一个来源，但不能单独证明新浪历史价格不含现金分红调整，也不能替 SPY 提供完整拆股历史。本次没有据此填写 verified=true。

## 生产者下一版必须交付

1. 明确区分挂牌 MIC 与会话 calendar 引用：例如标的 IBM/XNYS、基准 SPY/ARCX；不能将 calendar.exchange 相同当成证券身份校验。
2. 新的 market-policy 版本和新观察使用新契约；明确 ARCX 基准与 XNYS 标的的会话对齐、缺日、早收市和可用时间规则。保留旧版本解释器与旧包 SHA。
3. S5 引擎、Alpha Kline adapter、输入输出 schema、golden、conformance 与固定包同步发布新版本，不能覆盖 0.2.0 tarball。
4. 验证原始价格口径、拆股因子来源/覆盖区间、现金分红排除和逐条可用时间；缺证据返回不足，不能填因子 1。
5. 同一真实材料/行情切换 provider 后旧回放摘要保持一致；新 provider 修订只生成新 snapshot/result。

## 消费者验收清单

- 非合成 SPY/ARCX 在新政策下可映射；SPY/XNYS 被身份验证拒绝。
- 旧合成 input/result 和旧包 SHA 完全不变；旧真实不兼容政策继续明确拒绝。
- 挂牌身份缺失、不匹配、provider 元数据矛盾均不以 US/USD 猜测通过。
- 必须能证明拆股因子覆盖区间，无拆股事件返回不等于已证明无拆股。
- 现在获得的历史行情仅以现在的接收时间说明可见性，不倒填当时可见；未成熟前向窗口继续 pending。

本交接不宣告真实行情通过，也不授权生产部署或收费调用。
