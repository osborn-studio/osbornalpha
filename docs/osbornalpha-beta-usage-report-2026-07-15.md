# osbornALPHA 内测用户行为分析报告

生成时间：2026-07-15 07:27 北京时间  
数据窗口：Supabase 全量业务表；Vercel 最近日志样本约 2026-07-15 06:33-07:28 北京时间  
口径说明：当前产品没有独立行为埋点表，因此本报告基于注册/auth、股票池业务表、Vercel 请求日志和用户截图反馈综合判断。Vercel 样本受日志保留/轮询噪音影响，不能等同整夜全量 PV/UV。

## 1. 核心结论

昨晚公布内测后，注册转化是成立的：过去 36 小时新增 7 个确认用户，全部完成邮箱确认，其中 6 个用户实际添加了股票。最强的行为信号不是“看页面”，而是“建股票池”：新增 18 个 watchlist_items，占全库 33 个条目的 55%。

产品当前的早期价值被用户理解为“自选股/股票池监控工具”，而不是完整的“AI 投资研究工作台”。证据是：股票池和行情轮询活跃，但 `briefs`、`perspectives`、`news_items`、`broker_reports` 全部为 0，说明 AI 分析产物没有落库，或用户没有触达/触发到这些持久化路径。

最大的体验风险在移动端和数据可靠性：朋友截图显示移动端顶部布局被压成竖排；Vercel 样本中 `/api/quote/batch` 有 160/2000 条 error log，约 8%，主要是上游行情源 connect timeout。虽然接口返回 200，但用户会感知为报价失败/卡顿。

## 2. 注册与激活

Supabase auth 全量：

- 总用户：12
- 已确认邮箱：11
- 过去 36 小时新增用户：7
- 过去 36 小时新增且确认：7
- 有 last_sign_in_at 的用户：11

过去 36 小时新增用户行为：

| 用户匿名 ID | 注册时间 UTC | 最近登录 UTC | 股票池数 | 股票数 | 邮箱域 |
|---|---:|---:|---:|---:|---|
| 390bc907 | 2026-07-14 15:45 | 2026-07-14 15:45 | 1 | 3 | gmail.com |
| 73cf6a25 | 2026-07-14 15:19 | 2026-07-14 15:21 | 1 | 0 | qq.com |
| aec0caed | 2026-07-14 14:53 | 2026-07-14 14:53 | 1 | 4 | gmail.com |
| 9fbca9ea | 2026-07-14 14:53 | 2026-07-14 14:53 | 1 | 1 | gmail.com |
| 26476800 | 2026-07-14 14:52 | 2026-07-14 14:52 | 1 | 6 | gmail.com |
| ca8231ba | 2026-07-14 14:47 | 2026-07-14 14:52 | 1 | 2 | gmail.com |
| 20705511 | 2026-07-14 08:25 | 2026-07-14 08:25 | 1 | 1 | gmail.com |

激活判断：

- 注册到确认：很顺畅，7/7 新用户确认。
- 注册到添加股票：6/7 新用户添加股票，激活率约 86%。
- 添加深度：新增用户平均添加 18 / 7 = 2.57 只；在已添加用户中平均 3 只。
- 只有 1 个新用户注册后未添加股票，可能卡在空股票池、搜索、移动端布局或不知道下一步。

## 3. 股票池行为

业务表全量：

- watchlists：16
- watchlist_items：33
- user_preferences：12
- briefs / stock_signals / perspectives / news_items / broker_reports：均为 0

过去 36 小时：

- 新增 watchlists：8
- 新增 watchlist_items：18
- 新增 briefs：0

热门/重复添加股票：

| Ticker | 次数 | 观察 |
|---|---:|---|
| 002624.SZ | 4 | 最明显的早期兴趣标的，可能来自朋友共同关注/测试 |
| 600588.SH | 2 | A 股软件方向，有重复需求 |
| 601318.SH | 1 | 对应朋友截图里的 John Cameron 分析 |
| AAPL / BABA / BIDU / GOOGL / COIN | 各 1 | 海外科技/中概也有人测试 |
| 510300.SH / 518880.SH / 588000.SH / 159326.SZ / 512890.SH | 各 1 | 有用户把 ETF 当股票池资产加入 |

行为解释：

用户不是只随手点开，而是在试图把自己的真实关注资产迁入系统。ETF、A 股、港股、美股混合出现，说明 osbornALPHA 的多市场定位是对的，但搜索、代码规范化和报价覆盖必须稳定。

## 4. Vercel 日志样本

最近日志样本 2000 条，时间跨度约 2026-07-15 06:38-07:25 北京时间：

- `/api/quote/batch`：1840 次，占 92%
- `/`：80 次
- `/login`：40 次
- `/wp-admin/install.php`：40 次，疑似外部扫描/机器人
- error log：160 次，全部在 `/api/quote/batch`
- 状态码：1958 次 200；40 次 307；2 次 0

进一步按路径查询最近窗口：

- 首页 `/`：7 次
- `/watchlist`：1 次
- `/login`：5 次
- `/api/quote/batch`：至少 1000 次
- `/api/search`、`/api/radar`、`/api/stocks`、`/api/watchlist`：最近窗口未命中

解释：

行情接口 60 秒自动刷新会放大请求量，不能直接当作用户数。但连续 `/api/quote/batch` 说明至少有用户长时间保持页面打开。当前服务端日志缺少 IP、UA、session_id 和 query 参数，所以无法把请求聚合成真实会话，也无法知道用户搜索了什么。

错误模式：

`/api/quote/batch` 的 error message 主要是 `TypeError: fetch failed`，原因是上游地址 `119.3.232.150:443`、`120.79.191.232:443` connect timeout。接口仍返回 200，前端会表现为部分股票拉取失败，而不是页面崩溃。

## 5. 朋友截图 bug 复盘

### Bug A：AI 分析页暴露工具调用 JSON

截图现象：

- John Cameron 投资助手的分析内容底部出现 `工具 search`、`工具 quote`、`工具 financials` 等原始 JSON。
- 用户会把这理解为“内部调试信息泄漏”，降低专业感和可信度。

当前仓库定位：

- 当前 `stock-monitor` 代码里没有 `John Cameron - 投研助手` 页面/组件文本，可能是生产分支或另一套页面。
- 当前仓库的 `/radar` 只展示 markdown，不应直接出现截图里的工具调用 JSON。

产品影响：

- 高优先级 P0/P1。投资分析产品的信任感很脆，工具调用外露会让用户感觉结果未经打磨。

建议修复：

- 在 Agent 渲染层过滤 tool-call/tool-result block，只展示最终 answer、引用摘要、证据表。
- 如果需要透明度，把工具调用折叠为“数据来源”面板，不显示 raw JSON。
- 对所有 LLM 输出加一个 sanitizer：移除以 `工具 ` 开头的调试块、JSON lines、source/raw/results 字段。

### Bug B：移动端股票池顶部布局挤压，搜索添加体验不清晰

截图现象：

- 顶部说明文字被压到左侧逐字换行。
- 操作按钮挤在同一行，移动端首屏非常拥挤。
- 输入 `002463` 显示“没有匹配。回车以「002463」强制加入”，用户不确定最终是否会变成标准 A 股代码。

已在本地修复：

- `/watchlist` 顶部在移动端改为纵向布局，按钮行可横向滚动。
- 搜索无结果时，提示展示规范化后的 fallback ticker，例如 `002463.SZ`。
- TypeScript 校验通过。

仍需生产部署后验证：

- 朋友截图里的生产版本是否与当前本地代码一致。
- 东财搜索在移动端慢网环境下是否仍长时间“搜索中”。

## 6. 产品改进优先级

### P0：修信任和可用性

1. 隐藏 AI 工具调用 raw JSON  
这是最影响“专业可信”的问题。不要让用户看到内部管线。

2. 行情源 timeout 降级  
`/api/quote/batch` 需要更明确的 per-ticker fallback、缓存和前端提示。建议：
- 单 ticker 失败不污染整批。
- 对 60 秒内相同 ticker 使用 stale cache。
- 错误日志从 `console.error` 降为结构化 warning，只有全源失败才 error。

3. 移动端首屏布局  
股票池是用户第一激活动作，移动端必须稳定。当前本地已修顶部挤压。

### P1：提升激活到“看到价值”

1. 空股票池 onboarding  
新用户注册后默认空股票池，只显示“加入股票”。建议预设 3 个示例入口：
- 输入股票代码
- 批量导入自选股
- 使用示例股票池

2. 添加股票后立即给一条 AI 反馈  
用户加入股票后，不要只显示卡片。可以立即生成一句“为什么值得监控/下一事件/风险点”，把用户从“工具录入”带到“AI 价值感”。

3. 搜索要覆盖 ETF/可转债/裸代码  
现有用户已经添加 ETF 和疑似可转债代码。搜索结果要明确标注：股票/ETF/可转债/港股/美股。

### P2：补数据闭环

1. 建行为埋点表 `events`

建议字段：

- `id`
- `user_id nullable`
- `anonymous_id`
- `session_id`
- `event_name`
- `path`
- `properties jsonb`
- `created_at`
- `user_agent`
- `referrer`

第一批事件：

- `signup_started`
- `signup_confirmed`
- `watchlist_viewed`
- `stock_search_submitted`
- `stock_search_result_clicked`
- `stock_force_added`
- `watchlist_stock_added`
- `quote_batch_loaded`
- `quote_batch_failed`
- `ai_analysis_started`
- `ai_analysis_completed`
- `ai_analysis_copied`

2. 给 AI 分析结果落库  
目前 `briefs/perspectives` 都是 0。至少把单股分析请求落到 `ai_runs` 或 `research_runs`，否则无法复盘用户真正想分析什么。

3. 区分人类访问与机器人扫描  
`/wp-admin/install.php` 已出现扫描请求。报告里需要排除这类路径；系统层可以加简单 deny/ignore。

## 7. 下一步 7 天行动计划

Day 1：

- 部署移动端股票池布局修复。
- 修 AI raw JSON 外露。
- 给 `/api/quote/batch` 加 per-source timeout 统计和 stale cache。

Day 2：

- 加最小行为埋点表和事件 API。
- 埋 `signup_confirmed`、`watchlist_stock_added`、`stock_search_submitted`、`ai_analysis_started/completed`。

Day 3：

- 新用户空状态改造：示例股票池 + 批量导入 + 添加后即时分析。
- 搜索结果补充 ETF/可转债类型提示。

Day 4-5：

- 建一个内部 `/admin/usage` 页面：注册、激活、添加股票、热门 ticker、错误率、AI run 成功率。
- 将 Vercel timeout 与 ticker/source 关联，定位最不稳定的数据源。

Day 6-7：

- 约 3-5 个内测用户做 15 分钟访谈，只问三件事：
  1. 你第一次打开后想完成什么？
  2. 哪一步让你困惑/卡住？
  3. 如果每天只推送一条信息，你希望是什么？

## 8. 判断

这次内测不是“没人用”的问题，而是“用户愿意录入自选资产，但还没被稳定带到 AI 投资洞察”的问题。下一步不要急着做更多页面，先把注册后 3 分钟体验打穿：添加股票稳定、移动端不破、立刻产出可信的一条分析、并且把行为数据记录下来。
