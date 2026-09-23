# 行情接口联调包 v1.0

给行情接口负责人：交付日线适配结果及原始证据文件，用以下命令自检。此包不规定供应商 HTTP 路由，不改现有实时行情接口，也不需要数据库或密钥。Alpha 的观察评价用日线，实时报价不能替代收盘证据。

```sh
# 仓库根目录，Node 22.19–22.x，已安装锁定依赖
npx tsx scripts/s6/check-market-handoff.ts docs/handoffs/alpha-s6/market-interface/split.synthetic.json
npx tsx scripts/s6/check-market-handoff.ts /受控目录/provider-bundle.json
# 标的与 SPY 基准都备齐后
npx tsx scripts/s6/check-market-pair.ts /受控目录/target.json /受控目录/spy.json
```

退出码：0 表示结构和引用完整；2 表示缺交易日或拆股覆盖未完成；1 表示无效包内容；3 表示用法/文件读取错误。运行环境缺依赖等启动失败可能由 Node 输出诊断并非 JSON，应先修复安装。每次输出 `accepted_for_evaluation:false`，不把供应商声明视为已验证。该离线格式为 `alpha-market-handoff/1.0`，不是现有引擎的 MarketSnapshot；真实路径仍关闭，转换/核验器及新政策、新引擎另行交付。

## 字段与证据

机器格式见 [schema.json](schema.json)，完整正例见 [split.synthetic.json](split.synthetic.json)，SPY/ARCX 合成基准见 [spy.synthetic.json](spy.synthetic.json)，缺日反例见 [missing.synthetic.json](missing.synthetic.json)。样例全部虚构，仅供测试，不是证券数据、授权或投资结果。双包检查按 [尚未发布的 V2 口径提案](policy-v2.proposal.json) 限定标的为 XNYS、基准为 SPY/ARCX、相同日历版本与范围、相同合成属性；允许标的挂牌 MIC 与基准不同。只有两腿都有日线的会话可对齐，两腿复用同一价格证据或在真实模式下出现完全相同的 OHLCV 序列会单列待查；已解释的停牌会单列 `documented_unavailable_sessions`，仍不可计算；未知缺日另列 `unaligned_sessions`。结果保留两腿哈希、提案 JCS 摘要与不可用日期；JCS 摘要不是 manifest 中的原始文件字节 SHA-256，`contract_valid` 仍只是结构检查。未知字段拒绝，包括 `verified:true`；版本变化须另发契约，不能静默改旧包。

- `security.listing_mic` 是挂牌市场；`calendar_version` 是会话日历。SPY 的真实挂牌身份问题见 [POLICY-NEXT](../POLICY-NEXT.md)。格式接受 MIC 字符串不等于确认其真实身份或日历兼容性。
- `interval=1d`、`adjustment=raw`、`includes_cash_dividends=false` 是待核验的供应商声明。不得用收盘价复制生成 OHLC；须另提供能证明价格口径的供应商文档和原始响应。检查器校验 OHLC 数值边界，尚不解析各供应商原始响应或验证其中的价格对应关系。
- `evidence[].content` 是原始 UTF-8 文本；其 SHA-256 按该文本的 UTF-8 字节计算，不重新排版 JSON。这里不支持二进制原件或压缩响应；保留解码前原件另行交付解析适配。单包最多 2 MiB；每证据最多 1,000,000 字符、100 件，最多 2,000 条日线/事件。源 URL 仅作出处，不会被访问；URL 查询串、fragment 和内嵌用户名/密码全部拒绝；出处请使用无查询参数的文档/接口地址，原始请求参数另在受控原件中保留。原件放受控目录，不进代码仓。
- `received_at` 是本次实际收到这份证据的时间；`observed_at` 是形成交接包的时间。所有时间使用毫秒 UTC。此版仅支持保守的 `local_retrieval_only`：每条日线 `available_at` 不早于收盘，以及价格、拆股覆盖、拆股事件和可用性证据的实际接收时间，不晚于包观察时间。价格原件本身必须在对应日收盘之后取得，停牌/缺收盘原件亦同；可用性说明可能是事先取得的静态说明，不能单独当价格接收回执。历史行情今天获得就不能填历史收盘时已知。
- `splits.coverage` 交代整个查询区间的完整性和来源。没有事件并不自动等于已证明无拆股；即使 `complete=true` 仍需人工/供应商适配核验其原件。`basis_date` 固定为查询末日。`split_factor` 是原始价格换算到末日股数基础的乘数：对该日之后至末日的所有拆股取 `old_shares/new_shares` 连乘。正拆 2:1 为 0.5；反拆 1:10 为 10；现金分红不进入因子。覆盖/事件证据缺失不能填 1 通过。
- `range` 内每个冻结日历会话必须有日线，或有带证据的 `unavailable_sessions`（停牌/没有有效收盘）。查询范围只含已收盘会话；尚未收盘返回 `future_input`，缩小至已成熟范围重试，不归类缺日。未知缺日列入 `missing_sessions`，不补 0。显式 unavailable 只表示交接解释完整，不代表可计算收益。
- `price_ref`、`split_ref`、`availability_ref`、`identity_ref` 和覆盖/事件引用必须指向对应类型证据。哈希仅验证内容一致，不证明签发者、授权或证据真实性。

## 接口交付与验收顺序

1. 接口负责人分别导出标的与基准的原始日线、身份、拆股覆盖与接收时间证据。支持按范围重取，保持原始响应与 provider/version；修订产生新包。
2. 本工具进行离线结构、哈希、时间、会话覆盖检查。缺数据按退出码 2 修复；不可补造。
3. Alpha/OSanalyst 核验许可、证券身份、原始价格与因子解析，发布区分挂牌市场/会话日历的新版本政策与引擎；旧观察继续使用旧版本。
4. 用同一获准材料进行真实冻结、5/20/60 窗口及 Replay 验收。未成熟窗口保留 pending。此包不代表第六站实源验收已经完成。

`synthetic`、接收时间和全部可用时间也都是包内声明，检查器固定列出未核验 blocker。后续转换器必须从独立可信配置/回执取得合成身份和实际接收时间，不能凭供应商自报 `synthetic:true` 进入合成通道。

提案把证券挂牌 `listing_mic` 与 XNYS 会话日历分开，保留原 market-policy/1.0 哈希。ARCX 与 XNYS 实际交易日历兼容性仍需独立核验；共用一个版本只是一项待检验的输入口径。它尚不是 `market-policy/2.0` 发布包；旧 S4 观察与固定 S5 引擎仍仅按旧版本解释。双包检查输出提案哈希供联调，真实价格路径仍关闭。
