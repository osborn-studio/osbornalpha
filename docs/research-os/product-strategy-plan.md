# Osborn Alpha Research OS 产品战略规划

版本：v0.1
日期：2026-07-04
目标读者：Chen Bin、Fable 5、后续产品/开发/内容协作者

## 1. 一句话定位

Osborn Alpha Research OS 是一个面向 AI/TMT 投资研究的长期研究脑：它持续积累公司和产业记忆，发现早期技术/产品/模型市场信号，生成可引用的投资 memo，监控 thesis 是否失效，并通过人工审批和 eval 让金融 agent 从“会写报告”变成“可复盘、可约束、可进化的研究系统”。

## 2. 为什么现在做

AI/TMT 研究正在变得越来越快、越来越碎。传统研究报告滞后，社媒信息噪音大，GitHub 和开发者生态里出现的信号又很难被普通投资者系统化利用。与此同时，LLM 已经能阅读资料、生成报告、做反方分析，但普通 ChatGPT 问答没有长期记忆、没有纪律、没有 thesis 生命周期，也没有可审计的决策流程。

你的优势正好在交叉点上：你对金融科技和 TMT 有兴趣，有 GitHub Product Radar 的数据管线，有 agent workflow 和 skill 体系积累，也已经在关注 gbrain、context infrastructure、eval、HITL、approval 等 agent 基础设施。这个产品不应该做成泛金融 AI，而应该从“AI/TMT 研究工作流”切入，先服务你自己，再逐步外化成内容、模板、工具或小范围 SaaS。

## 3. 产品合并逻辑

这 9 个 idea 不应该分开做。它们应该合并成一个系统：

- **Research Brain**：对应 Idea 1，负责长期知识和公司记忆。
- **Signal Radar**：对应 Idea 3、4、14，负责发现 AI/TMT 早期信号。
- **Memo Engine**：对应 Idea 8，负责把研究脑输出成可读 memo。
- **Thesis Monitor**：对应 Idea 10，负责监控判断是否失效。
- **Playbook Runner**：对应 Idea 2，负责把判断变成可审计行动。
- **Axiom + Eval Layer**：对应 Idea 12、40，负责纪律和质量评估。

CEO 角度看，这样合并后，产品不再是 9 个散点，而是一条完整研究链路：数据进入、信号出现、研究沉淀、memo 生成、thesis 监控、人工审批、历史评估、规则迭代。

## 4. 目标用户

### 4.1 第一用户：你自己

第一阶段最重要的用户是 Chen Bin 自己。原因很简单：这个产品需要高频真实使用才能打磨，不能靠想象用户需求。你每天已经在跑 GitHub Radar、看 TMT、做 idea 筛选、研究 agent workflow，这些都是天然输入。

目标是让系统在 30 天内成为你的每日研究工作台，而不是一个展示型 demo。

### 4.2 第二用户：AI/TMT 个人投资者和研究型创作者

他们关注 AI、芯片、模型、云、SaaS、内容平台，但缺少系统化研究流程。他们不一定需要自动交易，但需要：

- 快速理解一家公司或主题。
- 找到早期信号。
- 生成结构化 memo。
- 追踪自己的判断是否失效。
- 把研究内容转成视频、newsletter 或课程。

### 4.3 第三用户：小型基金、研究员、咨询顾问

这类用户可能更在意可审计、可引用、可导出和团队协作。不是 MVP 首要对象，但后续可通过 Research Studio、PPTX、memo deck 和 eval report 切入。

## 5. 不做什么

战略上必须克制。第一阶段不要做：

- 自动交易系统
- 荐股社区
- 收益率承诺
- 高频行情分析
- 万能金融机器人
- 全市场覆盖
- 多用户复杂权限
- 移动端 App
- 花哨仪表盘

产品要避开“AI 帮你赚钱”的危险叙事，定位为“AI/TMT 研究和决策纪律系统”。这更长期、更合规，也更符合你的能力。

## 6. 产品护城河

### 6.1 长期研究记忆

普通 AI 问答没有历史记忆。这个系统会积累公司档案、过去 memo、thesis、错误、规则和复盘。时间越久，越了解你的判断框架。

### 6.2 早期技术信号

GitHub、OpenRouter、模型用量、开发者工具、API 文档、招聘等信号，比传统财经新闻更早反映 AI/TMT 变化。这是你已有 radar 能力的延伸。

### 6.3 决策纪律

Investment Axioms、Thesis Monitor 和 Playbook Approval 会把“不要冲动、要有失效条件、要有反方观点”变成系统规则，而不是靠意志力。

### 6.4 Eval 数据集

如果你能积累 20、50、100 个历史决策案例，就能形成金融 agent 评测资产。这个资产对外很稀缺。

### 6.5 内容复利

每份 memo、每条 signal、每次 thesis 更新都能变成 newsletter、短视频、PPT 或课程素材。产品本身会喂养内容 IP。

## 7. MVP 版本策略

### 7.1 MVP 名称

内部代号建议：`Osborn Alpha Research OS`
对外内容名可以更轻：`AI/TMT Research Brain` 或 `Alpha Signal Lab`

### 7.2 MVP 必须证明的 5 件事

1. 系统能比一次性 ChatGPT 问答更好地记住一家公司。
2. 系统每天能产生有研究价值的 AI/TMT signal。
3. 系统能生成一份有引用、有反方、有失效条件的 memo。
4. 系统能提醒某条 thesis 可能失效。
5. 系统能通过 axioms 和 approval 阻止低质量决策进入 playbook。

### 7.3 30 天验证计划

第 1 周：

- 确定 20 家 AI/TMT 公司。
- 建立 source、company、signal、memo、thesis 基础表。
- 导入已有 GitHub Radar 和手动资料。

第 2 周：

- 每天生成 signal report。
- 为 5 家公司生成 memo。
- 写 30 条 Investment Axioms 初版。

第 3 周：

- 创建 10 条 thesis。
- 启动 Thesis Monitor。
- 运行 Playbook Runner，所有行动只做纸面记录。

第 4 周：

- 建立 20 个历史 eval case。
- 复盘前 3 周输出质量。
- 选 3 份 memo 转成短视频或 newsletter。

## 8. 产品路线图

### Phase 0：手工系统验证

用 Markdown、JSON、SQLite/Postgres 和简单脚本跑通研究流程。目标不是漂亮，而是证明流程有用。

### Phase 1：本地 Web 工作台

做 Dashboard、Company Page、Signal Radar、Memo Workspace、Thesis Monitor、Playbook Review。支持单用户、手动导入、Markdown 导出。

### Phase 2：Agent 化和自动化

增加每日 ingest、signal extraction、thesis monitor、weekly digest、axiom check、eval run。引入后台任务和 agent logs。

### Phase 3：内容化输出

把 memo 和 signal 转成 PPTX、newsletter、短视频脚本、Seedance 视频素材。这里会连接你另一个 Seedance/IP 内容方向。

### Phase 4：小范围产品化

邀请 5-10 个 AI/TMT 研究型用户试用。验证他们是否愿意用它生成 memo、追踪 thesis、做内容输出。

## 9. 商业化可能性

### 9.1 自用 + 内容 IP

最现实的第一商业化路径。你用系统生产高质量 AI/TMT 内容，建立信任，再出售报告、课程、模板或咨询。

### 9.2 Research Template Pack

把 memo 模板、thesis 模板、axioms、eval cases、signal taxonomy 打包成付费模板。

### 9.3 小型 SaaS

面向个人投资者或研究型创作者，提供公司档案、signal radar、memo generator、thesis monitor。

### 9.4 B2B Research Studio

面向咨询顾问、小基金或研究员，提供可导出的 memo、PPTX、数据引用和团队审阅功能。

## 10. 定价假设

第一阶段不急着定价，但可以保留假设：

- 个人版：每月 19-49 美元，适合 AI/TMT 研究型用户。
- Pro 版：每月 99-199 美元，适合重度研究员和内容创作者。
- Template Pack：一次性 49-299 美元。
- 小团队版：每月 499 美元起，包含团队协作和导出报告。

这些只是后续验证假设。当前第一目标是证明产品让你自己的研究质量和内容产出显著提升。

## 11. 内容战略

这个产品天然适合做内容 IP。建议内容栏目：

1. **每周 AI/TMT Signal**：展示 3 个开发者/模型市场/产品信号。
2. **一家公司一份 Memo**：用系统生成并人工修订一份公开版 memo。
3. **Thesis Watch**：记录一个判断如何被支持或削弱。
4. **Agent Research Workflow**：拆解系统如何生成研究结果。
5. **投资 Axioms**：每周解释一条投资规则。

内容要强调研究方法，不要强调荐股。

## 12. 关键指标

### 产品使用指标

- 每日 ingest source 数
- 每日有效 signal 数
- memo 生成数
- memo 人工保留率
- thesis 监控数
- thesis alert 有效率
- playbook 审批数
- eval case 数

### 质量指标

- memo 引用覆盖率
- 反方观点出现率
- 失效条件完整率
- 低置信度标记准确率
- 人工编辑幅度
- eval 平均分

### 内容指标

- 每周可发布内容数
- memo 转视频数量
- newsletter / 视频反馈
- 外部用户咨询或试用请求数

## 13. 风险与应对

### 13.1 合规风险

风险：用户把系统理解成荐股或自动交易。
应对：明确定位为研究辅助；不接交易 API；所有输出带免责声明；高风险动作必须人工审批。

### 13.2 幻觉和错误引用

风险：LLM 生成看似可信但错误的结论。
应对：所有 memo 必须有 source ids；无来源结论标低置信度；保留 raw source；引入 eval。

### 13.3 数据源噪音

风险：GitHub、社媒、新闻信号噪音过高。
应对：signal 必须包含研究问题和影响假设；低可信来源降权；人工反馈进入评分。

### 13.4 范围过大

风险：一次性做完整 hedge fund OS。
应对：MVP 只做 20 家公司、10 条 thesis、10 份 memo、20 个 eval cases。

### 13.5 内容分发不稳定

风险：研究系统很好，但没有外部反馈。
应对：从第 3-4 周开始把 memo 转 newsletter / 视频，尽早测试外部兴趣。

## 14. 竞争定位

不要和 Bloomberg、Wind、Koyfin、Perplexity、ChatGPT、Seeking Alpha 正面竞争。更准确的定位是：

- 比 ChatGPT 更有长期研究记忆。
- 比 Perplexity 更有个人 thesis 和复盘。
- 比传统行情软件更懂 AI/TMT 开发者信号。
- 比投研模板更自动化。
- 比自动交易 bot 更安全、可审计。

核心差异不是数据最多，而是“研究判断能积累、能被约束、能被复盘”。

## 15. 下一步给 Fable 5 的任务

请先开发技术 MVP，不要先做营销页。

优先级：

1. 数据模型和数据库迁移。
2. Source ingest 和 raw source 保存。
3. Company / Entity 基础页面。
4. Signal Radar 初版。
5. Memo Generator 初版。
6. Thesis Monitor 初版。
7. Axiom Check 初版。
8. Playbook Approval 初版。
9. Eval Case 初版。

首个可验收 demo：

- 选择 NVIDIA 或 Microsoft。
- 导入 5-10 个 source。
- 生成 3 条 signals。
- 生成 1 份 memo。
- 创建 1 条 thesis。
- 运行一次 axiom check。
- 生成一个 playbook run，并完成 approve/reject。

## 16. 成功判断

如果 30 天后满足以下条件，继续投入：

- 你愿意每天打开它看 AI/TMT signal。
- 你愿意用它生成和维护 memo。
- 它至少 3 次提醒你某个 thesis 需要更新。
- 它至少 3 次阻止了低质量判断进入 playbook。
- 它能产出 5 条以上可公开发布的内容。
- 你能明确说出它相对 ChatGPT/Perplexity 的优势。

如果这些条件不成立，应该收缩为内部研究脚本，不要急着 SaaS 化。
