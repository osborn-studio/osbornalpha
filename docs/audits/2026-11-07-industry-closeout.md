# I-3 独立收尾与 owner 决策方案

代码作者：当前 gpt-6.1-sol CLI。依据：行业规格 §6.1–6.4/§13.4/§16、运行手册 §2/§5/§9，以及 [K1–K3 核对记录](2026-11-06-industry-research/03-tushare-verification.md)。本次只核对仓库中的规格、迁移、代码和已记录证据，未重新抓取官方页面或生产数据。

## 当前结论与实际交付

**I-3 估值计算、官方采集、对账写入、分位与发布流水线仍未实现。** H 未决，不能用 `comparator_basis='ttm'` 推导出“现公式已获批准”。本次交付离线数值诊断函数、脚本和测试；没有接入 job、路由、发布 RPC 或任何环境开关。

- §6.3 现公式：`pe_ttm = Σ(close_A × total_share_all_classes) / Σ(ttm_net_income_parent)`；PB 用最近可见归母权益。K2 已确认 `total_share` 含 A/H/B；这不是纯 A 股市值。
- K1 的申万 TTM 证据是自由流通市值加权、申万季度日历取财报；食饮实测还要求亏损股市值留在分子。现公式银行偏差约 +17%，不能用相同的“TTM”名称混同算法。
- K1 仅覆盖两行业、2026-10-26 至 30 的十格，全部在 0.5% 内；这是探索证据，不是独立黄金集、完整历史回放或 24 对序列验收。2012 官方说明与实测亏损处理存在冲突；Tushare `free_share` 只是申万自由流通股本的代理。
- PB 仍未核定：食饮不同权益口径偏差 1.1%–4.4%，继续不具备序列资格。`market_cap` 无官方对照资格。
- 已有 SQL 的 `stage_industry_valuation_pairs` 从同格当前官方观测导出状态；不信任调用者的对账状态。`publish_industry_valuations` 执行 90%/95%/24 门槛并禁止 PB 资格，但这些基础设施不等于 H 已选或 I-3 已交付。当前 stage 对两种 PE 都映射官方 `pe`；与规格“basis 不匹配 → not_applicable”的差异应随 H 修订一起解决，本次不变更 SQL。

## 独立离线验证

`scripts/industry/reconciliation-check.ts` 只接受一个本地 JSON 文件，每次一个行业/指标序列：

```json
{
  "expectedDates": ["2026-10-30"],
  "pairs": [{"tradeDate": "2026-10-30", "computedValue": "100", "officialValue": "100"}]
}
```

```sh
node --import tsx scripts/industry/reconciliation-check.ts /tmp/osstack/industry-closeout/input.json
```

示例为合成数据。值须为普通十进制字符串或 null；期望日须为非空、唯一、合法日期集合。调用者负责用已批准的交易日历给出完整期望日、匹配同一自然键及当前有效观测；脚本无法验证这些来源条件。漏给的期望格计 `no_computed`，重复/额外日期和无效数值拒绝，不能靠重复格冲高样本数。缺自算优先计 `no_computed`；缺官方计 `no_official`；官方值 ≤0 计 `invalid_denominator`。

日比较用精确十进制交叉相乘，`abs(computed-official) <= official*0.01`（官方正值），避免把 1% 外的极近值先四舍五入成 `within`。统计完整期望集合：`n_pairs=within+outside`；`n_pairs>=24`；`n_pairs/n_expected>=90%`；`within/n_pairs>=95%`。输出仅计数与布尔值，`assessment='diagnostic_only'`，不输出官方数值或日级明细；输入文件仍是内部材料，不能因此公开。

退出码：0 仅表示数值门槛通过；1 表示未通过；2 表示输入无效。**0 不表示 method/basis/授权/发布资格通过**。数值门槛之外仍须由数据库的发布与激活不变量、已批准方法和来源授权把关。

## 待 owner 评审的具体选项（不代表批准）

| 项 | H(a)：新增申万对照指标 | H(b)：保留自有整体法 |
|---|---|---|
| 指标与公式 | 新增 `pe_ttm_sw`，拟用 `Σ FFS / Σ(E_sw × FFS / TS)`；TTM 日历、亏损保留、FFS/TS 股本类别与缺数集合须逐项签字 | 保留现行 `pe_ttm`；官方 PE 对账均 `not_applicable`，不声称可比 |
| 既有自有 PE | 保持独立方法身份；不能从 `pe_ttm_sw` 的资格继承发布权 | 无官方锚点，按现门控不发布 |
| PB | 未核定，不资格、不发布 | 同左 |
| 必须修订 | §6.3/§6.4、指标枚举/迁移约束、方法配置/版本/hash、对照映射、清单与回放、读接口；现 U5 不能发布 `not_applicable` 自有 PE，若想发布须另批规则 | §6.4 对照映射与缺口说明；保留停用，不绕过 U5 |
| 发布结果 | 数值核对只是前置；授权及 U5/U6 全部满足后另行审批 | 仍不发布估值；内部研究可另立实现计划 |

建议先评审 H(a) 的验证实验，不先采纳公式。owner 需记录选择、签字人/日期、适用指标与版本；若选择 H(a)，需明确新股第六交易日、暂停/退市、负利润、负权益、≤5 样本规则如何处理，以及这些处理与现存实测的冲突。不能由实现者静默补齐。

## 进入估值实现之前的验证与授权清单

1. **H/方法 owner**：修订规格，确定上述公式细节及自有 PE 是否永不公开；方法/hash/公式版本变化强制历史全算，不承接旧方法结果。
2. **数据核对 owner**：取得可回放原始证据，覆盖 5–8 月、9–10 月、11 月切换及披露前后；包括亏损多行业、A+H/A+B、缺标记/FFS、新股/暂停上市。现两行业五日不能外推到这些情形。
3. **对账验证**：每个候选行业/指标至少 24 个有效日对，期望集合来自完整交易日历；包含承接日并重新读取当前官方版本。用本诊断器检查数值门槛，再做真实数据库 stage/publish/activate 与回放验收；不可把不同序列合并成 24 对。另验证 superseded/错自然键官方观测不被接受。
4. **黄金集 owner**：抄录 5 公司（含 A+H）×2 日交易所股本/价格、3 行业×4 日官方 PE/PB，保留来源证据。它们是独立断言，不替代在线官方观测、序列门槛或 PB 方法核定。
5. **授权 owner A/C**：申万方案、Tushare marks、official 默认 internal，估值默认不发布；每个数据集分别复核。`official` public 只控制 `/replay` 的官方值字段，不授予自有估值发布权。本 PR 不写许可证、不调用 admin 授权端点。
6. **运行 owner E/Q2**：CN 真实事实验收、worker/就绪门与行业判断方法仍是独立前置；不改变 `FACTS_CN_ENABLED`、`FACTS_CN_INDUSTRY_UNIVERSE`、`INDUSTRY_JUDGMENTS_ENABLED` 或生产 cron。`official`/`valuation` job 继续 `deferred_i3`。

本次自动测试使用合成序列，不证明市场口径、Tushare 授权、生产就绪、数据库发布路径或黄金集完成。实际命令和 mmx 审查结果由 PR/最终报告记录。
