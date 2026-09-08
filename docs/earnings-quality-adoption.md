# 财报质量候选：跨产品采用

Alpha 通过 `review_earnings_quality` 工具调用 Catalog 的同一份确定性代码，
不是再写一份提示词声称具备财报研究能力。与 Model 的固定提交与文件摘要见
`src/lib/research/earnings-quality-vendor/manifest.json`。

## 使用

Copilot 可把经核对的完整事实 JSON 作为 `input_json` 传给此只读工具。协议、
官方财报人工核对样本与限制随包提供。缺原始事实时必须请求材料，不能从 ticker
或模型记忆补造。工具不联网、不获取历史文件、不创建监控、不保存研究、不交易。

其他服务可直接导入 `reviewEarningsQuality`；SEC Companyfacts 文件可先通过
导出的 `fromSecCompanyFacts(raw, {cik,accession,asOf,current,prior,thesis})`
转换。这不是从任意PDF抽取数据，也不是实时provider集成。

输出保留 `input`、`output`、`sourceCommit`、`releaseDigest`；每个数值含公式和
事实编号，可返回来源定位。`unavailable` 是有效降级，不可伪装成0。定性Thesis
不自动判定，52/53周、跨口径和负分母须保留提示。CFO−capex不是FCFF。

## 更新与验收

从已提交且干净的 Catalog 工作副本执行其
`node scripts/sync-earnings-quality.mjs alpha /absolute/alpha-repo`，再检查vendor
diff并运行测试。不要单独编辑vendor文件；测试会验证文件哈希。

本次目标仅是首条财报质量链路的候选采用。原有研究方法、14项研究开放状态、
历史存档与交易权限均未调整。LLM如何解释工具结果尚需同题实测和人工评审。
