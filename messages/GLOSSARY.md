# 金融术语表 (Financial Glossary)

**目的**: 统一 osbornalpha 全站中英文金融术语翻译。G1b/G1c 阶段所有新增翻译**必须**遵循本表，避免同一概念在不同页面出现不同英译。

**状态**: G1a 阶段建立，随翻译推进持续补充。发现新术语时在此追加，不要在业务代码或字典文件里另造译法。

## 核心术语对照

| 中文 | English | 备注 |
|---|---|---|
| 浮盈 / 浮亏 | Unrealized P&L | 也可视上下文用 "Unrealized Gain/Loss" |
| 已实现盈亏 | Realized P&L | |
| 止损 | Stop Loss | |
| 止盈 | Take Profit | |
| 仓位 | Position | |
| 建仓 | Open Position | |
| 平仓 | Close Position | |
| 加仓 | Add to Position | |
| 减仓 | Reduce Position | |
| 择时 | Market Timing | |
| 标的 | Ticker / Instrument | 视上下文选择；泛指证券用 Instrument，具体代码用 Ticker |
| 复盘 | Review | 如"决策复盘" → "Decision Review" |
| 股票池 | Watchlist | |
| 驾驶舱 | Cockpit | |
| 简报 | Brief | 如"每日简报" → "Daily Brief" |
| 雷达 | Radar | 如"信号雷达" → "Signal Radar" |
| 九人观点 / 投资委员会 | Committee Perspectives | 也可用 "Investment Committee" 指代群体 |
| 时长卡 | Time Pass | |
| 决策 | Decision | |
| 建议（分析师建议） | Recommendation | analyst 层对象；与"决策 Decision"（portfolio 实盘采纳事件）区分 |
| 分析师 | Analyst | 含 AI Agent；主导航 tab「分析」= Analyst |
| 模拟账本 / 模拟持仓 | Simulated Book / Simulated Position | analyst 层等权假设账本，不是实盘；不用 paper |
| 模拟成交价 | Simulated Fill | 建议日 K 线收盘，非真实成交；表头可缩写 Sim. Fill |
| 采纳 | Adopt | 实盘决定引用一条建议 |
| 撤回 | Withdraw | 建议只能撤回不能修改 |
| 份 / 份数 | Unit / Units | 等权名义仓单位，不是股数 Shares |
| 份数权重 | Unit Weight | 份数 / 总份数，不是市值权重 |
| 命中率 | Hit Rate | 5 日方向命中；analyst 统一用命中率，不用胜率 |
| 评分 | Score | 方向调整后的 20 日收益（缺则 5 日） |
| 参考价 | Reference Price | 分析师口述价格，不作成交价 |
| 期限 | Horizon | short / mid / long |
| 待定价 | Unpriced | 尚无模拟成交价的建议 |
| 关联研究 | Linked Research | 建议上的可选 thesis 引用（`thesis_ref`） |
| 平仓价 | Exit Price | 模拟账本平仓用的成交价 |
| 交易 | Trade | |
| 持仓 | Holding | 与"仓位/Position"近义，静态展示语境用 Holding |
| 回测 | Backtest | |
| 信号 | Signal | |
| 信心 / 置信度 | Confidence | 产品文案统一用「信心」 |
| 免责声明 | Disclaimer | |
| 工作台 | Workbench | 落地页语境亦可用 "Cockpit"，两者互斥，同一页面内保持一致 |
| 委托 / 委托单 | Order | |
| 成交量 | Volume | |
| 财报 | Earnings Report | |
| 评级 | Rating | |
| 情绪（新闻情绪） | Sentiment | |
| 异动 | Anomaly / Unusual Move | |
| 大师 / 投资大师 | Investment Master | |
| 护城河 | Moat | |
| 估值 | Valuation | |
| 现金流折现 | DCF (Discounted Cash Flow) | |
| 财务分析 | Financial Analysis | |
| 择股 | Stock Selection | |
| 用量 | Usage | |
| 配额 | Quota | |
| 订阅 / 升级 | Subscription / Upgrade | |
| 试用 | Trial | |
| 账号 | Account | |
| 设置 | Settings | |
| 通知 | Notification | |
| 推送 | Push (as in push notification) | |
| 日股 | Japan | G3 市场标签；货币符号用 JP¥（避免与人民币 ¥ 混淆） |
| 韩股 | Korea | G3 市场标签；货币符号 ₩ |
| 台股 | Taiwan | G3 市场标签；货币符号 NT$ |
| 数据源未接入 | Data source not connected | G3 JP/KR 占位态（market.stock.sourcePending） |

## 使用规则

1. **一词一译**：同一中文术语在全站必须使用同一英文译法（表内已固定的除外说明）。
2. **发现新术语先查表**：翻译 landing/auth/settings 等新字典文件前，先检查本表是否已有对应词条。
3. **无对应词条时**：按此表格式追加一行，注明选择理由，再使用。
4. **人名不译**：投资大师人名（巴菲特、芒格等）在英文版可保留拼音/威妥玛拼写或通用英文名（Warren Buffett、Charlie Munger），由 G1b/c 具体页面翻译时统一查证补充至本表，不在此提前列出人名全表。
5. **代码内部保持中文**：agent 工具描述、LLM prompt、代码注释、mock 数据默认不受本表约束（见 spec §1 "明确不动"）。

## 九人投资委员会人名对照（G1a about 页确立）

| 中文 | English |
|---|---|
| 巴菲特 | Warren Buffett / Buffett |
| 芒格 | Charlie Munger / Munger |
| 德鲁肯米勒 | Stanley Druckenmiller / Druckenmiller |
| 霍华德·马克斯 | Howard Marks |
| 彼得·林奇 | Peter Lynch |
| 迈克尔·伯里 | Michael Burry |
| 张坤 | Zhang Kun |
| 李录 | Li Lu |
| 段永平 | Duan Yongping |
