# OsbornAlpha 产品演示视频 · 分镜脚本

日期：2026-10-19 · 成片：`docs/demo/2026-10-19-product-demo.mp4` · 复现方法：`docs/demo/README.md`

目标时长 5–6 分钟（成片实际时长见 README 的产出记录）。旁白中文为主，字幕逐句烧录；每个镜头括号里的英文是给海外观众的一句话摘要，不进旁白。

## 主线与亮点

脚本按「一个人一天的工作流」走：看盘 → 情报 → 研究 → 分析打分 → 实盘决策 → 设置。贯穿全片的核心思想是 ADR `docs/adr/2026-10-17-research-analyst-portfolio-boundary.md` 定义的三层边界：

| 层 | 路由 | 产出 | 真值来源 |
|---|---|---|---|
| 研究 Research | `/research` | 建议 | 人 + 工具的方法论 |
| 分析 Analyst | `/analyst` | 模拟账本 + 前向评分 | 冻结规则，系统自己是权威 |
| 我的投资 Portfolio | `/portfolio` | 真实交易 + 持仓 | 外部事实 |

层间只以建议 id 单向连接：研究产出建议 → 分析登记、冻结成交价、打分 → 实盘决定可「采纳」某条建议。实盘永远不改写建议和评分；analyst 永远不写 trades。

演示的 9 个亮点，每个至少有一个真实操作镜头：

1. Today 看盘：市场时钟 + 雷达流（镜头 2）
2. 行情链路与 K 线：公开源 + DataGateway 回退，多周期、复权标注（镜头 3）
3. Watchlist 股票池：表格 / 看板、证券主数据核验的搜索添加、批量导入（镜头 4）
4. Intel 情报向导（镜头 5）
5. 三层边界（镜头 6，贯穿 7–11）
6. Research OS：公司档案、论点（失效条件强制）、Playbook 人工审批（镜头 7、8）
7. PAPER_TRADE 一键登记为分析师建议，自动归档到「Research Playbook」Agent（镜头 9）
8. Analyst 模拟账本与 5/20/60 日前向评分，只记分不交易（镜头 10）
9. Portfolio 驾驶舱采纳建议、决策日志「采纳自」标签、复盘评分；外加 Copilot ⌘K 与设置多语言 / 主题（镜头 11–13）

## 录制口径

- 环境：本地 dev server（`http://localhost:3000`）+ 本地 Supabase，演示账号 `demo@osbornalpha.local`（admin），全部数据由 `docs/demo/record/seed-demo.ts` 造出，可公开。
- 画面 1600×900，深色主题，中文界面；镜头 13 临时切英文和浅色后切回。
- 旁白：macOS `say -v Tingting`，逐句生成并测长，字幕按句与旁白对齐。
- 录屏：Playwright `recordVideo`，每个镜头一个独立 context 和 webm；屏幕上叠加一个合成光标，便于看清点击位置。

## 分镜

时长为旁白时长的估计值；成片以旁白实际时长为准，画面不足时冻结末帧补齐。

### 镜头 1 · 开场（约 15 s）

- 画面：`/today`。标题卡叠加「OsbornAlpha · 产品演示」，随后淡出露出 Today 页。
- 旁白：
  1. OsbornAlpha 是一个面向个人投资者的 AI 投资监控与研究工作台。
  2. 它用 Next.js 和 Supabase 构建，覆盖 A 股、港股和美股。
  3. 接下来我们沿着一天的工作流，看看它的核心亮点。
- 亮点：产品定位。(An AI research and monitoring workbench for individual investors, covering A-shares, HK and US.)

### 镜头 2 · Today 看盘（约 25 s）

- 画面：`/today`。鼠标依次指向顶部市场时钟、雷达流中的红 / 黄标的、右栏持仓一瞥 / 宏观 / 简报；缓慢下滚。
- 旁白：
  1. 一天从 Today 页开始。
  2. 顶部是各市场的交易时钟，告诉你现在是盘前、盘中还是休市。
  3. 中间的雷达流按关注级别，把股票池和持仓里值得看的标的排在前面。
  4. 右侧是持仓一瞥、宏观和今日简报的入口。
- 亮点 1：Today 看盘与雷达流。(Today: market clocks, radar stream ranked by attention level, portfolio / macro / brief glance.)

### 镜头 3 · 行情链路与 K 线（约 30 s）

- 画面：点击雷达流里的贵州茅台，进入 `/stock/600519.SH`。依次点击周期按钮 1M → 1Y → 5Y，鼠标指向图右上角的「前复权」标注；再点「AI 观点」「财报」「新闻」标签后回到「行情」。
- 旁白：
  1. 点进任意标的，进入个股页。
  2. 行情来自东方财富、新浪等公开源，并以自建 DataGateway 作为回退，保证链路可用。
  3. K 线支持日内到五年的多个周期，A 股默认前复权，图上会标出复权方式。
  4. 下方六个标签分别是行情、AI 观点、财报、新闻、信号与持仓。
- 亮点 2：行情链路与多周期复权 K 线。(Quotes from public sources with a self-hosted DataGateway fallback; multi-range K-line with adjustment labelling.)

### 镜头 4 · Watchlist 股票池（约 30 s）

- 画面：`/watchlist`。先在表格视图停留，切到看板视图再切回表格；在「机会跟踪」分组的搜索框输入「比亚迪」，从结果中点击加入；最后鼠标指向「批量导入」按钮。
- 旁白：
  1. 股票池是整个系统的输入。
  2. 表格视图实时刷新报价，看板视图可以拖拽分组。
  3. 搜索支持代码、名称和拼音，只有通过证券主数据核验的标的才能加入。
  4. 也可以从 CSV 或 Excel 批量导入，自动识别各家券商的代码方言。
- 亮点 3：股票池管理与证券主数据核验。(Watchlist: table / kanban, master-data-validated search, CSV / Excel import.)

### 镜头 5 · Intel 情报（约 18 s）

- 画面：`/intel`。在「发现」页指向两张向导卡，切到「研究」标签，再切回。
- 旁白：
  1. Intel 页把 AI 研究向导放在手边。
  2. 发现页的向导可以围绕一个主题或标的发起卡脖子分析和产业链梳理。
  3. 研究页则汇总已经生成的研究产出。
- 亮点 4：情报向导。(Intel: AI research wizards and generated outputs.)

### 镜头 6 · 三层边界（约 35 s）

- 画面：`/research` Dashboard。页面之上叠加一张半透明的三层边界图（研究 → 分析 → 我的投资，箭头标注「建议 id · 单向」），每念到一层高亮一层。
- 旁白：
  1. 接下来是这个产品最重要的设计思想：三层边界。
  2. 研究层只产出建议，回答「这家公司值不值得做」。
  3. 分析层把建议登记进模拟账本，用冻结的规则打分，永远不写真实交易。
  4. 我的投资层才是实盘入口，一笔决定可以采纳某条建议，但实盘永远不会改写建议和评分。
  5. 三层之间只靠建议 id 单向连接。
- 亮点 5：三层边界。(The three-layer boundary: research produces recommendations, analyst only scores, portfolio is the only live-money entry.)

### 镜头 7 · Research OS：公司与论点（约 28 s）

- 画面：`/research/companies`，鼠标停在「贵州茅台」卡片上（卡片右上角是核验过的证券 600519.SH）和主题标签上；再到 `/research/theses`，点开活跃论点「茅台：批价企稳 + 直销占比提升」，鼠标依次指向支柱、失效条件、观察指标。
- 旁白：
  1. Research OS 是管理员专用的研究模块。
  2. Companies 维护公司与主题档案，并挂接核验过的证券代码。
  3. Theses 是研究论点：每条论点必须写明失效条件和观察指标，没有失效条件的论点不允许存在。
  4. 我们已经有一条关于贵州茅台的活跃论点。
- 亮点 6a：公司档案与带失效条件的论点。(Research OS: company profiles with verified securities; theses must carry invalidation conditions.)

### 镜头 8 · Playbook 发起与人工审批（约 35 s）

- 画面：`/research/playbooks`。来源选 `[thesis · ACTIVE] 茅台：…`，动作选 `PAPER_TRADE`，填理由与风险，点「创建 playbook run」；运行出现在「② 待审批」；输入审批意见「批价连续两周企稳，按论点执行纸面记录」，点「✅ 批准」。
- 旁白：
  1. Playbooks 把论点推进为行动。
  2. 选择来源论点，动作选 PAPER_TRADE，填写理由与风险，创建运行。
  3. PAPER_TRADE 是高风险动作，必须人工审批。
  4. 写下审批意见，批准。注意，这里没有任何真实交易通道。
- 亮点 6b：Playbook 人工审批闸。(Playbooks: PAPER_TRADE requires a human approval; there is no trading channel.)

### 镜头 9 · 一键登记为分析师建议（约 30 s）

- 画面：同页「③ 历史」里的已批准行出现「登记为建议」按钮；点击展开内联表单，看到预填的公司「贵州茅台 / 600519.SH / A股 / 买入」，把建议时间改为 `2026-09-01 10:00`，点「登记 1 条」；该行变为「已登记 1 条 · 查看」。
- 旁白：
  1. 审批通过后，这一行出现「登记为建议」按钮。
  2. 表单已经根据论点预填了公司、代码和市场；建议时间默认是审批时间，可以改早，但不能晚于现在。
  3. 提交后，它会自动归到名为 Research Playbook 的 Agent 档案，并回链到这次运行与论点。
- 亮点 7：研究到分析的投递通道。(One click registers an approved PAPER_TRADE run as a recommendation under the "Research Playbook" agent, with a back-link to the run and thesis.)

### 镜头 10 · Analyst 模拟账本与前向评分（约 40 s）

- 画面：`/analyst`。看到「我」「John Cameron」「Research Playbook」三张分析师卡片；鼠标指向「刷新评分」按钮与卡片上的命中率 / 平均评分（评分已由离线评分脚本按产品同一套函数写入，见 README）；点开「Research Playbook」账本：账本摘要、模拟持仓、建议时间线里的模拟成交价与 5d / 20d 列；再点返回总览，点开「John Cameron」账本看一眼多条建议的命中情况。
- 旁白：
  1. 进入分析页。
  2. 每位分析师，不论是人还是 Agent，都有一本等权模拟账本。
  3. 评分由「刷新评分」任务完成：取建议日的 K 线收盘作为模拟成交价并冻结，再用 5、20、60 个交易日的前向收益打分。
  4. 打开 Research Playbook 的账本：模拟持仓、浮动收益和建议时间线一目了然。
  5. 这里只记分，不下单。
- 亮点 8：模拟账本与前向评分。(Analyst: equal-weight simulated book per analyst, frozen fills, 5/20/60-day forward scoring; scoring only, never trading.)

### 镜头 11 · Portfolio 采纳建议、决策日志、复盘（约 45 s）

- 画面：`/portfolio?s=600519.SH`。三栏驾驶舱；在中栏决策条点「买入」，展开后「采纳建议」下拉选中 `2026-09-01 · 买入 · …`，理由填「采纳研究建议，分批建仓」，点「记录决策」；跳到 `/portfolio/decisions`，最新一行来源列显示「采纳自 Research Playbook」；再到 `/portfolio/review`，看复盘概览、信心校准和「决策 vs 信号」表。
- 旁白：
  1. 实盘入口在「我的投资」。
  2. 驾驶舱左侧是持仓与股票池，中间是焦点标的，右侧是信号。
  3. 在决策条点买入，「采纳建议」下拉里会列出同标的、未撤回的建议，选中后记录决策。
  4. 决策日志里，这条决定带上了「采纳自 Research Playbook」的标签。
  5. 复盘页用同一套前向评分内核，给我自己的决定打分，并与信号命中率对照。
- 亮点 9：实盘入口与采纳链路。(Portfolio cockpit: adopt a recommendation into a decision, see the "Adopted from" tag, review decisions with the same scoring kernel.)

### 镜头 12 · Copilot ⌘K（约 17 s）

- 画面：回到 `/stock/600519.SH`，按 ⌘K 拉出右侧 Copilot 抽屉，代码框已自动带入 600519.SH；鼠标依次指向代码框、「让 John 分析」按钮和「展开」链接（不发起分析，避免依赖 LLM 密钥）；再按 ⌘K 关闭。
- 旁白：
  1. 任何页面按 Command K 都能呼出 Copilot，标的会自动带入当前页面。
  2. 让 John Cameron 给出分析后，结论可以一键采纳为决策或存入研究脑，但同样不会替你下单。
- 亮点：Copilot。(⌘K Copilot on any page, scoped to the current ticker; its verdict can be adopted as a decision or saved to the research brain.)

### 镜头 13 · 设置：多语言与主题（约 25 s）

- 画面：`/settings`。点「English」，界面与底部导航变英文；点「中文」切回；点右上角 🎨，选「浅色」，再选回「深色」。
- 旁白：
  1. 设置页支持中英文切换，界面语言立即生效，并同步到账户偏好。
  2. 主题支持深色与浅色，还有红涨绿跌与绿涨红跌两种配色。
- 亮点：多语言与主题。(Settings: zh / en switch synced to account preferences; dark / light theme and CN / US colour schemes.)

### 镜头 14 · 结尾（约 18 s）

- 画面：结尾卡：三层边界图 + 一句话定位 + 免责声明。
- 旁白：
  1. 回顾一下：研究产出建议，分析只记分不交易，实盘才是真实入口。
  2. OsbornAlpha：给信号、给视角、给可追溯的判断，不替你下单。
  3. 所有内容仅作决策辅助，不构成投资建议。
- 亮点：收束到三层边界与合规口径。(Recap of the three layers; decision support only, not investment advice.)

## 镜头与源素材对照

| 镜头 | 路由 | 录制函数（`docs/demo/record/record.ts`） | 依赖的演示数据（`seed-demo.ts`） |
|---|---|---|---|
| 1 | `/today` | `s01_intro` | 股票池 + 持仓 |
| 2 | `/today` | `s02_today` | 同上 |
| 3 | `/stock/600519.SH` | `s03_stock` | 无（实时行情） |
| 4 | `/watchlist` | `s04_watchlist` | 股票池；`stocks_universe` 含比亚迪 |
| 5 | `/intel` | `s05_intel` | 无 |
| 6 | `/research` | `s06_boundary` | 研究种子（来源 / 信号） |
| 7 | `/research/companies`、`/research/theses/[id]` | `s07_research` | 茅台实体 + 证券 + 活跃论点 |
| 8 | `/research/playbooks` | `s08_playbook` | 活跃论点、axioms |
| 9 | `/research/playbooks` | `s09_register` | 镜头 8 产生的已批准 run |
| 10 | `/analyst`、`/analyst/[id]` | `s10_analyst` | 「我」「John Cameron」档案与历史建议；镜头 9 的建议 |
| 11 | `/portfolio*` | `s11_portfolio` | 持仓、历史决定；镜头 9 的建议 |
| 12 | `/stock/600519.SH` | `s12_copilot` | 无 |
| 13 | `/settings` | `s13_settings` | 无 |
| 14 | 结尾卡 | `s14_outro`（静态图） | 无 |
