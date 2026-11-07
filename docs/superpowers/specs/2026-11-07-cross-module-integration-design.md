# OsbornAlpha 研究重建：跨模块集成设计

日期：2026-11-07。
状态：设计规格；
不表示任何依赖 PR 已合并或开关已启用。

## 0. 范围、事实基线与落地边界

本规格只定义 F4 判断框架、F3 文档管道、公司、外资、宏观、行业与 F6 评测的接缝；
不改变各模块的业务方法。
数字必须能沿来源抽屉重放，判断必须带方法、结算与校准；
未校准概率不得显示百分比，缺失保留为缺失。
规范来源：`macro-workbench-bbde80/docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md:14`、`macro-workbench-bbde80/docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md:15`、`macro-workbench-bbde80/docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md:47`、`macro-workbench-bbde80/docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md:123`。

证据记法：以下 `worktree/path:line` 均指 2026-11-07 读取到的**该工作树文件**，不是 origin/main 的同名文件。
F4 尚在工作中，须以其合并时的 diff 再核一次。
`macro-workbench-bbde80/docs/superpowers/specs/2026-11-04-SPEC-INDEX.md:1` 是模块索引；
设计文字低于已实现代码的优先级。

基线：main 已有计划 1–3、F6、行业和宏观 P1–P4 + WP-S6；
宏观 P3/P4 的 F4 客户端只走 HTTP，不直接 import F4（`macro-workbench-bbde80/src/lib/macro/strategy/f4-client.ts:1`）。
F4 本地分支已经 import 宏观实现并在生产依赖中绑定（`judgment-framework-50f9e1/src/lib/judgments/deps.ts:43`），但未合并。
F3、公司分别在 PR #114、#115；
外资工作树目前只有 `src/lib/broker-research/versions.ts` 和数据库集成测试，无运行时 F3/F4 适配器（`foreign-research-f63683/src/lib/broker-research/versions.ts:1`；
`foreign-research-f63683/src/lib/broker-research/broker-research.integration.test.ts:1`）。

目标合并顺序：F4 → F3 #114 → 公司 #115 → 外资。
集成分支从最新 main 建立；
每个依赖落地后把该分支并入集成分支并重跑 PG17。
若必须先开发，局部叠在未合并分支上，在 PR 描述明确 base/stack 与待重放的 commit；
绝不声称未合并的 API 已在 main。
一个依赖对一个集成 PR，公共冲突修复可随首个涉及该文件的 PR 提交。
所有开关先保持 off；
只有真实 provider 的端到端测试通过后，才提出启用的部署变更。

## 1. 跨模块开关清单

`1` 是宏观/行业的启用值；
F3 与公司接受小写 `1` 或 `true`。
表内“默认”指环境变量未设置时的代码行为，不是生产环境当前值。

| 名称 | 读取位置 | 默认 | 控制内容 / 依赖对 |
|---|---|---|---|
| `MACRO_JUDGMENTS_ENABLED` | `macro-workbench-bbde80/src/lib/macro/read-api.ts:61`、`macro-workbench-bbde80/src/lib/macro/snapshots.ts:78`、`macro-workbench-bbde80/src/app/(app)/intel/macro/page.tsx:14`；F4 另读 `judgment-framework-50f9e1/src/lib/judgments/deps.ts:45` | off | 存储象限读取、发布回调、宏观 F4 UI 与 F4 宏观生产依赖；判断→宏观 |
| `MACRO_STRATEGY_ENABLED` | `macro-workbench-bbde80/src/lib/macro/strategy/flags.ts:11` | off | P3/P4 路由；判断→宏观的 HTTP 消费仅在策略本身启用后有意义 |
| `NEXT_PUBLIC_SITE_URL` | `macro-workbench-bbde80/src/lib/macro/strategy/f4-client.ts:53` | unset → F4 unavailable | P3/P4 同站绝对 URL；判断→宏观，配置项而非布尔开关 |
| `INDUSTRY_JUDGMENTS_ENABLED` | `macro-workbench-bbde80/src/lib/industry/judgment-contract.ts:39` | off | 行业页面 F4 请求；判断→行业 |
| `NEXT_PUBLIC_COMPANY_JUDGMENTS` | `company-research-ebd56f/src/lib/company/client.ts:52`、`company-research-ebd56f/src/components/company/JudgmentsView.tsx:13` | off | 公司 F4 卡片；判断→公司。真实名称并非 `COMPANY_JUDGMENTS_ENABLED` |
| `NEXT_PUBLIC_COMPANY_F3_DRAWER` | `company-research-ebd56f/src/lib/company/client.ts:51`、`company-research-ebd56f/src/components/company/FilingsView.tsx:12` | off | 公司来源抽屉；文档→公司。真实名称并非 `COMPANY_F3_DRAWER_ENABLED` |
| `DOCUMENTS_SYNC_ENABLED` | `document-pipeline-3cfbb4/src/lib/documents/flags.ts:5` | off | F3 同步作业；文档→公司/外资的资料前置条件 |
| `DOCUMENTS_EXTRACT_ENABLED` | `document-pipeline-3cfbb4/src/lib/documents/flags.ts:5` | off | F3 抽取作业；文档→公司/外资 |
| `DOCUMENTS_CANDIDATES_ENABLED` | `document-pipeline-3cfbb4/src/lib/documents/flags.ts:5` | off | F3 候选值作业；F6 extraction_gold 可用数据的前置条件 |
| `BROKER_RESEARCH_F3_ENABLED`、`BROKER_RESEARCH_LLM_ENABLED`、`BROKER_RESEARCH_F4_URL` | **无代码读取点**：外资工作树 `src/lib/broker-research/` 仅有版本文件和 DB 测试；接口仍见 `foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:654`、`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:658` | 不存在；不得当作已生效 | 外资 owner 在运行时 PR 确定名字、语义与默认 off；文档→外资、判断→外资 |
| F6 kind enablement | `macro-workbench-bbde80/src/lib/evals/kinds/registry.ts:9` | `extraction_gold=false`、`judgment_calibration=false` | F6→F3/F4；这是 registry 条目，非环境变量 |

`MACRO_STRATEGY_ENABLED` 与 `MACRO_JUDGMENTS_ENABLED` 的路由矩阵及首次部署保持后者关闭，见 `macro-workbench-bbde80/docs/runbooks/macro-strategy.md:11`、`macro-workbench-bbde80/docs/runbooks/macro-strategy.md:114`。
不能以策略开关暗中启用 F4。

## 2. 依赖对

### 2.1 判断 → 宏观：P1/P2 的方法和读 API，P3/P4 的 HTTP

**Provider 与 consumer。
** 宏观向 F4 提供 `MacroReadApi`：`observation(id)`、`snapshot(id)`、`snapshotsSince(marker,limit)`、`seriesCatalog(region)`、`classifyAsOf(region,referencePeriod,cutoff,version)`，返回象限及 `observation_refs`、catalog（`macro-workbench-bbde80/src/lib/macro/judgment-contract.ts:6`–`macro-workbench-bbde80/src/lib/macro/judgment-contract.ts:17`）。
实现通过 `MacroDb` 读取，`classifyAsOf` 重用 `buildRegimeInput` + `classifyRegime`，对方法版本和 cutoff 作校验（`macro-workbench-bbde80/src/lib/macro/read-api.ts:62`–`macro-workbench-bbde80/src/lib/macro/read-api.ts:100`）。
F4 的镜像类型与此字段对应（`judgment-framework-50f9e1/src/lib/judgments/types.ts:187`–`judgment-framework-50f9e1/src/lib/judgments/types.ts:194`），生产注入已经调用 `macroReadApi(supabaseMacroDb(...),{judgments:true})` 并归一化 `MacroUnavailable`（`judgment-framework-50f9e1/src/lib/judgments/deps.ts:43`–`judgment-framework-50f9e1/src/lib/judgments/deps.ts:67`）。
F4 的 `macro_regime@v1` 冻结 snapshot + observation inputs，要求主次象限、覆盖率 ≥0.6、margin_pp 单位一致；
claim 的分布明确 `scores_are_not_probabilities`，结算为 `macro_regime_replay`（`judgment-framework-50f9e1/src/lib/judgments/methodologies/macro-regime.v1.ts:28`–`judgment-framework-50f9e1/src/lib/judgments/methodologies/macro-regime.v1.ts:92`）。

宏观 P3/P4 另用同站 `/api/judgments`、`/[id]`、`/[id]/history`，
解析 `cards`、`judgment.inputs[].snapshot` 和 `settlements[].evidence`，3 秒超时，缺站点 URL 时 unavailable（`macro-workbench-bbde80/src/lib/macro/strategy/f4-client.ts:25`–`macro-workbench-bbde80/src/lib/macro/strategy/f4-client.ts:85`；
`macro-workbench-bbde80/src/lib/macro/strategy/f4-types.ts:5`–`macro-workbench-bbde80/src/lib/macro/strategy/f4-types.ts:8`）。
F4 列表真实返回 `{subject,asOf,view,cards}`（`judgment-framework-50f9e1/src/app/api/judgments/route.ts:13`–`judgment-framework-50f9e1/src/app/api/judgments/route.ts:25`）；
详情真实返回 `{view,asOf,card,judgment,settlements,calibration}`，其中 `judgment` 是带完整 inputs 的 ledger 行，settlements 为全量公开列表（`judgment-framework-50f9e1/src/app/api/judgments/[id]/route.ts:15`–`judgment-framework-50f9e1/src/app/api/judgments/[id]/route.ts:30`）。

**差异。
** ① F4 当前生产 gate 接受 `'true'`，宏观只接受 `'1'`；
若配置为 true，F4 能生产但宏观页面/发布不一致（`judgment-framework-50f9e1/src/lib/judgments/deps.ts:45`；
`macro-workbench-bbde80/src/lib/macro/read-api.ts:63`）。
统一为仅 `'1'`，修改 F4 `deps.ts`（这是集成适配而非新开关）。
② `macroReadApi.classifyAsOf` 只按数据 `available_at`/期间 cutoff 过滤，批次发布资格按**当前**状态判断；
晚于 cutoff 才 finalize 的批次可能进入历史结算（`macro-workbench-bbde80/src/lib/macro/read-api.ts:7`–`macro-workbench-bbde80/src/lib/macro/read-api.ts:8`、`macro-workbench-bbde80/src/lib/macro/read-api.ts:98`）。
宏观 owner 应在 `buildRegimeInput` 的读取路径增加历史发布可见性，或者 F4 将此方法明确标记不可用于历史校准；
未解决前禁止上线回放结算/校准。
③ F4 方法当前 `publishable=false` 因 license 未核实（`judgment-framework-50f9e1/src/lib/judgments/methodologies/macro-regime.v1.ts:7`）；
不能把内部方法卡当公开可展示。
④ HTTP 详情的 `inputs` 与 `settlements` 符合客户端字段；
但宏观解析器把缺失 `ref`/`snapshot` 归一成 `{}`，与“证据必须可重放”不符（`macro-workbench-bbde80/src/lib/macro/strategy/f4-client.ts:39`–`macro-workbench-bbde80/src/lib/macro/strategy/f4-client.ts:48`）。
改消费者为必填非空、按具体 input kind 校验；
无效即 unavailable。
⑤ F4 HTTP 使用 anon/RLS，不能以 service_role 补空卡；
方法需 publishable 后才能被公开读到（`judgment-framework-50f9e1/src/app/api/judgments/[id]/route.ts:2`–`judgment-framework-50f9e1/src/app/api/judgments/[id]/route.ts:6`）。

**修改/开关。
** P1/P2 的类型桥接保留宏观本地接口，在集成分支增加双向 `satisfies`/类型测试；
F4 归一化错误可留 `deps.ts`。
P3/P4 只改 `macro/strategy/f4-client.ts`；
不绕开 HTTP。
`MACRO_JUDGMENTS_ENABLED` 默认 off；
`MACRO_STRATEGY_ENABLED` 保持其独立部署决策。
只有许可证、历史 cutoff 和全链路通过后才设前者为 `1`。

**验证。
** 新建 `src/lib/judgments/integration/macro-bridge.integration.test.ts`，
PG17 上用真实 macro ingestion/发布 + 真实 F4 `productionJudgmentDeps`/producer/settler：同一快照只登记一次，inputs snapshot/hash 与实际观测一致；
未来才 finalize 的批次在历史 cutoff 不可见；
结算证据的 `observation_refs` 对应截止 vintage；
anon GET 详情与 P3/P4 真实 parser 连通。
不得用 `fixtureMacroReadApi` 代替 provider（该 fixture 仅用于 F4 单元测试，`judgment-framework-50f9e1/src/lib/judgments/macro-api.ts:67`）。
单元：开关值矩阵、null/坏 JSON、缺 snapshot、超时、score 不显示为概率。
阻塞：F4 分支未合并，license 与 cutoff owner 决策。

### 2.2 判断 → 行业

**合同。
** F4 的公开 `Input` 包含 `table_rows`，但 `PUBLIC_TABLES` 仅有 `issuer_industry_memberships`、`industry_classifications`、`macro_series`（`judgment-framework-50f9e1/src/lib/judgments/types.ts:73`–`judgment-framework-50f9e1/src/lib/judgments/types.ts:86`）；
`parseNaturalKey` 也只接受这三类（`judgment-framework-50f9e1/src/lib/judgments/inputs-db.ts:42`–`judgment-framework-50f9e1/src/lib/judgments/inputs-db.ts:50`）。
行业已交付 `industryTableRowsInput(db,ref)`，自然键 `industry_metrics:<run_id>:<code>:<period_end>`，只取 active run 的 ok 行，snapshot/hash/origin 含单一 manifest；
`industry_valuations` 直接 `unsupported_deferred_i3`（`macro-workbench-bbde80/src/lib/industry/judgment-input.ts:16`–`macro-workbench-bbde80/src/lib/industry/judgment-input.ts:23`、`macro-workbench-bbde80/src/lib/industry/judgment-input.ts:27`–`macro-workbench-bbde80/src/lib/industry/judgment-input.ts:35`、`macro-workbench-bbde80/src/lib/industry/judgment-input.ts:47`–`macro-workbench-bbde80/src/lib/industry/judgment-input.ts:66`）。
行业页面 GET `?subject_type=industry&subject_key=...&include_abstained=1`，只接收 `cards[]`，开关 off 不请求（`macro-workbench-bbde80/src/lib/industry/judgment-contract.ts:37`–`macro-workbench-bbde80/src/lib/industry/judgment-contract.ts:53`）；
F4 列表支持该参数（`judgment-framework-50f9e1/src/app/api/judgments/route.ts:17`–`judgment-framework-50f9e1/src/app/api/judgments/route.ts:24`）。

**差异。
** ① 白名单/NK 未加两张表，F4 当前 `buildTable` 不会调用行业适配器，直接 `input_not_allowed`（`judgment-framework-50f9e1/src/lib/judgments/inputs.ts:170`–`judgment-framework-50f9e1/src/lib/judgments/inputs.ts:185`）；
在 F4 `types.ts`/`inputs.ts`/`inputs-db.ts` 注册 `industry_metrics`，这是行业向 F4 已请求的 provider 白名单扩展。
`industry_valuations` 只保留类型预留，不允许产出直到 I-3 表/anon 视图和语义存在。
② F4 通用 `tableRows()` 使用 Supabase table client，行业适配器需要 `IndustryDb.metricRun`、`metricRowsOfRun` 来验证 active 和 manifest；
在 F4 的输入 builder 加一个委托到行业适配器，不从裸表绕过许可（`macro-workbench-bbde80/src/lib/industry/judgment-input.ts:48`–`macro-workbench-bbde80/src/lib/industry/judgment-input.ts:65`）。
③ 行业本地 `JudgmentCard` 是副本，`calibration` 联合及 `display.percent` 需与 F4 输出持续对齐（`macro-workbench-bbde80/src/lib/industry/judgment-contract.ts:9`–`macro-workbench-bbde80/src/lib/industry/judgment-contract.ts:35`）；
改消费者类型引入 F4 导出，保留 fail-closed 显示。
④ F4 registry 只有 `macroRegimeV1`，没有行业方法（`judgment-framework-50f9e1/src/lib/judgments/registry.ts:11`）；
输入接上也不会自动产生“景气/高低估”判断。
须由行业 owner 提供可证伪方法、resolver 与结算策略，F4 再按方法注册。
缺方法时 UI 应为空卡，不补造结论。

**开关/验证/阻塞。
** `INDUSTRY_JUDGMENTS_ENABLED` 默认 off。
新建 `src/lib/judgments/integration/industry-bridge.integration.test.ts`：真实行业聚合/激活 run，真实 anon `IndustryDb` → F4 `buildInput` → 公开卡；
断言旧/未激活 run、无许可、双 manifest、缺值均 abstain，归档 manifest 可回放；
I-3 拒绝；
实际卡不含未校准百分比。
单元覆盖自然键、更新时间和页面响应。
PG17 用真实行业 provider，不能构造 `tableRows` fixture。
行业方法及 F4 注册未落地，故开关保持 off。

### 2.3 判断 → 公司

**合同。
** 公司消费端请求 `GET /api/judgments?subject_type=issuer&subject_key=<issuerId>&view=latest|as_known&asOf=YYYY-MM-DD`（`company-research-ebd56f/src/lib/company/judgments.ts:22`–`company-research-ebd56f/src/lib/company/judgments.ts:25`）。
它要求 `cards`、`view`、回声 `asOf`，as_known 时拒绝登记/结算/校准晚于 cutoff 的卡（`company-research-ebd56f/src/lib/company/judgments.ts:59`–`company-research-ebd56f/src/lib/company/judgments.ts:77`）；
`displayPercent` 仅在 calibrated 且 open/settled 且数值有限时返回（`company-research-ebd56f/src/lib/company/judgments.ts:79`–`company-research-ebd56f/src/lib/company/judgments.ts:83`）。
F4 实际列表 route 的响应和 `viewParams` 契约匹配此形状（`judgment-framework-50f9e1/src/app/api/judgments/route.ts:17`–`judgment-framework-50f9e1/src/app/api/judgments/route.ts:25`）；
F4 判断卡组件已存在（`judgment-framework-50f9e1/src/components/judgments/JudgmentCard.tsx:83`）。

**差异。
** 公司 `judgment-card-adapter.tsx` 仍用本地渲染器，并写明 F4 组件不存在；
这已被 F4 分支事实取代（`company-research-ebd56f/src/components/company/judgment-card-adapter.tsx:2`–`company-research-ebd56f/src/components/company/judgment-card-adapter.tsx:12`）。
在消费者此文件引入 F4 组件，传入经 `displayPercent` 脱敏后的卡；
F4 `JudgmentCard` 的 `AnyCard` 类型需做结构对齐，绝不把原始未校准 `display.percent` 交给显示组件。
公司 DTO 允许 `condition/settlement/calibration_summary` 为 null，并未证明其类型完全等同 F4；
以真实 F4 route 响应做契约测试（`company-research-ebd56f/src/lib/company/judgments.ts:10`–`company-research-ebd56f/src/lib/company/judgments.ts:18`、`company-research-ebd56f/src/lib/company/judgments.ts:34`–`company-research-ebd56f/src/lib/company/judgments.ts:57`）。
F4 registry 目前只有宏观方法，无公司方法（`judgment-framework-50f9e1/src/lib/judgments/registry.ts:11`）；
公司页面即使打开也可能合法返回空卡。
不得用 hand-written fixture 当 provider，fixture 自述待替换为录制响应（`company-research-ebd56f/src/lib/company/fixtures/judgments/latest.json:2`）。

**开关/验证/阻塞。
** `NEXT_PUBLIC_COMPANY_JUDGMENTS` 默认 off。
`src/lib/company/judgments-bridge.integration.test.ts`：PG17 登记并公开一条真实 F4 issuer 方法卡，通过实际 route + `checkJudgmentsResponse` 验证 latest/as_known 回声与 cutoff，结算后不泄漏未来证据，未校准百分比 null；
用服务端渲染测试验证组件。
单位测试保留 malformed/恶意 href/late timestamps。
若尚无 issuer 方法，仅可做真实空列表契约，不能据此启用开关；
owner 须交付方法、授权和结算口径。

### 2.4 文档 → 公司：SourceDrawer、引用和文档库

**合同。
** F3 已实现 `GET /api/documents/[ticker]`，返回 `issuerId,ticker,asOf,extractorVersion,classifierGen,documents,nextCursor`（`document-pipeline-3cfbb4/src/app/api/documents/[ticker]/route.ts:15`–`document-pipeline-3cfbb4/src/app/api/documents/[ticker]/route.ts:31`）；
详情、文件、页路由分别在 `document-pipeline-3cfbb4/src/app/api/documents/doc/[id]/route.ts:14`–`document-pipeline-3cfbb4/src/app/api/documents/doc/[id]/route.ts:34`、`document-pipeline-3cfbb4/src/app/api/documents/doc/[id]/file/route.ts:16`–`document-pipeline-3cfbb4/src/app/api/documents/doc/[id]/file/route.ts:38`、`document-pipeline-3cfbb4/src/app/api/documents/doc/[id]/pages/[n]/route.ts:13`–`document-pipeline-3cfbb4/src/app/api/documents/doc/[id]/pages/[n]/route.ts:42`。
引用详情为 `GET /api/citations/[id]`，返回页文本切片、bbox、integrity/currentExtraction、文档摘要，private owner 走审计分支、其他人 404（`document-pipeline-3cfbb4/src/lib/documents/citations.ts:14`–`document-pipeline-3cfbb4/src/lib/documents/citations.ts:19`；
`document-pipeline-3cfbb4/src/app/api/citations/[id]/route.ts:15`–`document-pipeline-3cfbb4/src/app/api/citations/[id]/route.ts:40`）。
按事实找引用的路由是 `GET /api/citations?factId=<uuid>`（`document-pipeline-3cfbb4/src/app/api/citations/route.ts:25`–`document-pipeline-3cfbb4/src/app/api/citations/route.ts:54`）。

公司 `FilingsView` 仅在 `F3_SOURCE_DRAWER_AVAILABLE` 时展示抽屉（`company-research-ebd56f/src/components/company/FilingsView.tsx:12`、`company-research-ebd56f/src/components/company/FilingsView.tsx:79`），
但当前适配器常量为 false，组件返回 null（`company-research-ebd56f/src/components/company/f3-source-drawer.tsx:8`–`company-research-ebd56f/src/components/company/f3-source-drawer.tsx:12`）。
它期待 `<SourceDrawer documentId page? bbox? />` 和 `/api/documents/by-filing/[filingId]`（同文件 `company-research-ebd56f/src/components/company/f3-source-drawer.tsx:2`–`company-research-ebd56f/src/components/company/f3-source-drawer.tsx:7`）。
F3 工作树没有该路由，也没有可复用的 `src/components/documents/SourceDrawer.tsx`；
现有宏观、行业 SourceDrawer 是模块专用组件（`document-pipeline-3cfbb4/src/components/macro/SourceDrawer.tsx:27`；
`document-pipeline-3cfbb4/src/components/industries/SourceDrawer.tsx:20`）。
F3 规格 §17.2 将“公司/行业来源抽屉”列为交接请求，不是已实现组件（`document-pipeline-3cfbb4/docs/superpowers/specs/2026-11-04-document-pipeline-design.md:999`–`document-pipeline-3cfbb4/docs/superpowers/specs/2026-11-04-document-pipeline-design.md:1004`）。

**修改。
** 在公司侧 `f3-source-drawer.tsx` 做 consumer adapter：以 filing 的 source_ref/issuer/ticker 查询 F3 文档列表并确定**唯一**匹配版本；
需要的 filing↔document 稳定绑定当前不存在，应优先由 F3 按 §17.2 已接受的请求提供只读绑定 route 或 DB 函数。
未有绑定时保留 `F3_SOURCE_DRAWER_AVAILABLE=false` 和外链退路；
不能用 ticker 最近文档冒充该 filing。
抽屉以 F3 文档详情/页/引用 route 构建，保留 `integrity`、`currentExtraction` 与 private 404；
数值链接优先 `factId → /api/citations?factId= → /api/citations/[id]`，不能仅拼 PDF 页码。
文档库按 F3 `/api/documents/[ticker]` 分页，显式展示版本和来源，不把“无可见文档”解释为“无披露”。

**开关/验证/阻塞。
** `NEXT_PUBLIC_COMPANY_F3_DRAWER` 默认 off，F3 作业开关单独保持 off。
`src/lib/company/documents-bridge.integration.test.ts`：PG17 真实 F3 同步/抽取/发布文档 + 真实公司 filing/事实；
断言精确绑定、同 ticker 多版本、引用 slice 与 hash、不可见 owner 文档 404、过期 extraction 标识；
通过真实 route，不 mock `DocumentsDb`。
单元测抽屉关闭、无绑定退路、restricted 状态。
阻塞：F3 绑定端点/共享抽屉接口未实现；
F3 #114、公司 #115 未合并。

### 2.5 文档 → 外资

**合同。
** 外资规格请求 `DocumentExtraction`、`extractDocument(input,{deadline,authorization})`、`sliceText`、`F3Timeout`，
产物由外资指定 `reports/{sha}.extract.{run_id}` 与 `...pages.{run_id}/`，同版本同字节须一致（`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:654`–`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:656`）。
外资处理前须检查 `allows_llm_processing` 与许可，lease/fenced update 后将 `parse_run_id` 绑定产物（同文件 `foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:119`、`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:448`）；
其 bucket 私有、无 anon storage policy（`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:332`）。
F3 真实代码导出的抽取入口是管道内部 `ExtractDeps.extractPdf(bytes,budget)`/`extractHtml` 和 `runExtract` 调度，不存在上述独立 `extractDocument` 与 `sliceText` 公共接口（`document-pipeline-3cfbb4/src/lib/documents/extract/run.ts:51`–`document-pipeline-3cfbb4/src/lib/documents/extract/run.ts:63`、`document-pipeline-3cfbb4/src/lib/documents/extract/run.ts:93`–`document-pipeline-3cfbb4/src/lib/documents/extract/run.ts:100`）。

**差异/修改。
** ① F3 接口名称、输入/返回结构、授权、deadline、outputPrefix 尚不存在；
不要把 F3 的 `runExtract` 直接用于 broker bucket，因为它持有 F3 的文档 lease、表和存储路径（`document-pipeline-3cfbb4/src/lib/documents/extract/run.ts:2`–`document-pipeline-3cfbb4/src/lib/documents/extract/run.ts:18`）。
按 F3 §17.2 对外资 license/field schema 的已接受交接请求，由 F3 owner 暴露低层无 DB 副作用的 PDF layout extraction + `sliceText`，外资侧适配为 `DocumentExtraction` 并持有自己的写入/租约/许可。
② F3 的 `document_pages` 文本切片以 code point offset、hash 验证（`document-pipeline-3cfbb4/src/lib/documents/citations.ts:2`–`document-pipeline-3cfbb4/src/lib/documents/citations.ts:8`）；
外资 `span_verbatim` 要在其 artefact 的同一 offset 约定复核（`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:491`）。
③ 外资只有迁移/DB 测试，现无 `BROKER_RESEARCH_F3_ENABLED` 的真实读取点；
由外资 owner 实现并默认 off。
④ 许可可能禁止 LLM 但允许本地解析；
不得把 F3 抽取成功当作 LLM 授权（`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:119`、`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:448`）。

**验证/阻塞。
** `src/lib/broker-research/f3-bridge.integration.test.ts`：PG17、真实 F3 PDF extractor、真实 broker lease/DB、合成 PDF；
断言相同字节/版本产物 hash、文字 span 原样回放、超时无部分产物、失租不提交、许可拒绝不触发抽取，restricted artifact 不经 anon 可见。
单位测 `sliceText` Unicode、页面边界、输出路径和授权组合。
F3 API 与外资运行时均未落地；
开关不存在且不得声称可打开。

### 2.6 F6 对 F3/F4 的评测钩子

F6 `KIND_REGISTRY` 里 `extraction_gold` 因 D8 license 待决为 disabled，`judgment_calibration` 因 F4 `settledForecasts`/thresholds 未就绪为 disabled；
`assertKindEnabled` 会在运行前拒绝（`macro-workbench-bbde80/src/lib/evals/kinds/registry.ts:9`–`macro-workbench-bbde80/src/lib/evals/kinds/registry.ts:23`）。
F6 extraction 类型要求 document_sha256/page_count/bbox_space、labels 与 `fields[{field,value,page,bbox}]`，并对缺文档整体标 `read_error`（`macro-workbench-bbde80/src/lib/evals/kinds/extraction.ts:17`–`macro-workbench-bbde80/src/lib/evals/kinds/extraction.ts:35`）。
F3 的 `DocumentRow`/`ExtractionRow` 与 citations 分属 DB 读模型（`document-pipeline-3cfbb4/src/lib/documents/types.ts:112`–`document-pipeline-3cfbb4/src/lib/documents/types.ts:153`），没有 F6 `ExtractionOutput` 适配器；
F3 §17.2 仍请求 F6 gold/阈值对齐（`document-pipeline-3cfbb4/docs/superpowers/specs/2026-11-04-document-pipeline-design.md:1002`）。

F6 calibration 要 `SettledForecast`，
包括十进制字符串 `p`、`settlement.outcome` 0/1、evidence_available_date、horizon_end、revision_of，并要求 F4 阈值（`macro-workbench-bbde80/src/lib/evals/kinds/calibration.ts:18`–`macro-workbench-bbde80/src/lib/evals/kinds/calibration.ts:22`、`macro-workbench-bbde80/src/lib/evals/kinds/calibration.ts:39`–`macro-workbench-bbde80/src/lib/evals/kinds/calibration.ts:51`）。
F4 对外返回 JudgmentCard/ledger settlement，未提供命名为 `settledForecasts` 的公共 API；
其 registry 当前只有 categorical `macro_regime@v1`（`judgment-framework-50f9e1/src/lib/judgments/registry.ts:11`），不能把象限分布的 scores 伪装成预测概率（`judgment-framework-50f9e1/src/lib/judgments/methodologies/macro-regime.v1.ts:66`–`judgment-framework-50f9e1/src/lib/judgments/methodologies/macro-regime.v1.ts:67`）。

消费者侧新增 F6 `kinds/f3-adapter.ts`：读经许可批准的 F3 gold 和真实抽取版本，映射页码、bbox 坐标与原值，维持 `read_error`。
`kinds/f4-adapter.ts`：只取 F4 真实 probability 方法、settled 且可见且校准合格的快照；
把证据可得日、修订链和阈值逐字段映射，无法提供字段即保持 disabled，不用空字符串填。
若 F4 没有可供安全枚举的读 API，由 F4 owner在其规格认可的评测导出边界提供只读导出；
不能直接扩大 anon RLS。
PG17 `src/lib/evals/f3-hook.integration.test.ts`、`f4-hook.integration.test.ts` 分别以真实 provider 生成输入再跑 F6 evaluator，断言撤回/缺页/许可、retrospective/void/未校准/重复 settlement 被排除；
单位测映射和门控。
F6 registry 两项默认 false，只有 license 和阈值确定、真实 provider E2E 通过后改 true。

## 3. 共享文件合并冲突地图

合并检查应覆盖以下具体失败形状；这些是上述各 PR 的验收断言，不能以“路由返回 200”代替。

| 文件 | 已见修改与风险 | 合并规则 |
|---|---|---|
| `supabase/migrations/*.sql`、`migrations.lock.json` | 迁移必须唯一 14 位 timestamp 且 lock 的已锁文件字节不能变；main 检查在 `macro-workbench-bbde80/scripts/ci/research-checks.ts:30`–`macro-workbench-bbde80/scripts/ci/research-checks.ts:52`。F4/F3/外资各自带迁移。 | 先按落地顺序追加；重名 timestamp 给后落地的**未应用**迁移改名并重算 lock；已应用文件不改字节；PG17 从空库重放。 |
| `src/lib/supabase/database.types.ts` | 多个分支新增表/RPC，手维护类型可能覆盖；F3 自述关系未全入类型（`document-pipeline-3cfbb4/src/app/api/citations/route.ts:20`–`document-pipeline-3cfbb4/src/app/api/citations/route.ts:22`）。 | 在最终 schema 上一次重新生成/校验，保留各分支的表/RPC；不接受盲选一侧。 |
| `scripts/ci/research-checks.ts` | main 的 F6、行业、宏观、P3 追加在 `macro-workbench-bbde80/scripts/ci/research-checks.ts:16`–`macro-workbench-bbde80/scripts/ci/research-checks.ts:28`；F4/F3/公司/外资各自 push critical suites（`judgment-framework-50f9e1/scripts/ci/research-checks.ts:27`；`document-pipeline-3cfbb4/scripts/ci/research-checks.ts:30`；`company-research-ebd56f/scripts/ci/research-checks.ts:30`；`foreign-research-f63683/scripts/ci/research-checks.ts:27`）。 | 保留全部 push、去重；任何新增 DB E2E 加到 criticalSuites，并让 `verifyCriticalSuiteInventory` 通过。 |
| `vercel.json` | 各 cron 分支可能编辑同一数组；外资 outbox cron仍只是规格请求（`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:554`）。 | 按 path 合并且无重复，核 maxDuration/schedule；不存在的 route 不入 cron。 |
| `src/i18n/request.ts` / `MESSAGE_DOMAINS` | F4/F3/公司分支均扩展同一列表（`judgment-framework-50f9e1/src/i18n/request.ts:10`；`document-pipeline-3cfbb4/src/i18n/request.ts:10`；`company-research-ebd56f/src/i18n/request.ts:10`）。 | union、去重、核中英文域文件都在；加载失败不能悄悄回退。 |
| `src/lib/dq/batches.ts` / `INFO_CODES` | F4 有 `JUDGMENT_INFO_CODES`（`judgment-framework-50f9e1/src/lib/dq/batches.ts:72`）；F3 有 `F3_INFO_CODES`（`document-pipeline-3cfbb4/src/lib/dq/batches.ts:54`）；基础列表相同（main `macro-workbench-bbde80/src/lib/dq/batches.ts:49`）。 | 并集保留两个专用列表及 status 语义，重跑各模块批次测试；不得把真实失败加为 info。 |
| `src/middleware.ts`（若实际路径不同，以 `rg --files` 核） | 多分支可能加路由授权/公开路径；F3 private 引用需要 owner 审计而 F4 公开读依赖 anon RLS（`document-pipeline-3cfbb4/src/app/api/citations/[id]/route.ts:2`–`document-pipeline-3cfbb4/src/app/api/citations/[id]/route.ts:6`；`judgment-framework-50f9e1/src/app/api/judgments/[id]/route.ts:2`–`judgment-framework-50f9e1/src/app/api/judgments/[id]/route.ts:6`）。 | 逐 route 合并鉴权，不用 middleware 把私有文档公开，也不把公开判断误导向登录；用真实 401/403/404 路由测试。 |


### 3.1 PG17 跨模块验收场景

每项测试以真实 provider 的迁移、RLS、代码和 route 运行。
测试可以注入时钟、网络响应与合成原始文件。
测试不得注入一个返回期望 DTO 的假 provider。
数据库从当前合并后的迁移序列启动。
测试使用匿名、登录用户和 service role 三种身份各自的真实授权路径。
状态不满足时，断言精确的空值、abstain 或错误码，不制造替代值。

**判断→宏观测试矩阵，归属 PR A。**

- M01：`MACRO_JUDGMENTS_ENABLED` 未设时发布宏观快照，不调用 F4 回调。
- M02：设为 `true` 时与未设同义；仅 `1` 可启用完整链路。
- M03：同一 active snapshot 重试发布，F4 ledger 只有一个 `judgment_id`。
- M04：snapshot `observation_ids` 每个都能读回相同 vintage 与值。
- M05：任一 observation 不可公开时登记 abstain，不留下 active 判断。
- M06：`coverage<0.6` 时不输出主观概率或卡片百分比。
- M07：`margin_pp` 的百分点与小数单位混淆时 abstain。
- M08：宏观方法版本不同于 F4 上游版本时只保留版本异常，不静默计算。
- M09：settlement 的 `observation_refs` 与 cutoff 下可见版本逐项一致。
- M10：截止日前仍未 finalize 的批次不会因后来 finalize 被历史重放使用。
- M11：匿名 GET 列表能被 `cardLite` 读取，且 `selected` 来自 `display.value`。
- M12：匿名 GET 详情能被 `judgmentDetailOf` 读取，保留 `inputs[].snapshot`。
- M13：settlement evidence 丢失或不合法时 P3/P4 标 unavailable。
- M14：`GET /api/judgments/[id]/history` 的分页与 cutoff 不漏、不重复。
- M15：无 `NEXT_PUBLIC_SITE_URL`、超时、非 JSON 与非 2xx 都不制造卡片。
- M16：公开许可未核实的方法不会通过 anon 路由被展示。

**判断→行业测试矩阵，归属 PR B。**

- I01：`industry_metrics` natural key 严格解析 run/code/date。
- I02：错误的 run UUID、含冒号 code、错误日期均拒绝。
- I03：未激活 run 的行不能构成 F4 输入。
- I04：active 但 anon 不可见的许可数据不能构成输入。
- I05：只取 `status='ok'` 且匹配 code/period_end 的行。
- I06：一组 rows 的排序稳定，不随 DB 返回顺序改变 hash。
- I07：`updated_at` 缺失时输入拒绝，不借用 period_end。
- I08：多 manifest hash 时返回 `input_ambiguous_manifest`。
- I09：单 manifest origin locator 可找到内容寻址清单。
- I10：`industry_valuations` 在 I-3 未实现时保持 `unsupported_deferred_i3`。
- I11：匿名 F4 查询 subject key 与行业页面 key 一致。
- I12：无行业方法时 cards 为空，页面不补造判断。
- I13：未校准卡片只显示类别、条件与方法，不显示分数/百分比。
- I14：开关 off 时不发 `/api/judgments` 请求。

**判断→公司测试矩阵，归属 PR C。**

- C01：真实 F4 `latest` 响应回声为 `view='latest'`。
- C02：真实 F4 `as_known` 回声为精确请求日期。
- C03：晚于 cutoff 登记的卡不出现。
- C04：晚于 cutoff 的 settlement 不出现在 as_known。
- C05：晚于 cutoff 的 calibration 不使旧卡解锁百分比。
- C06：`retrospective` 角标仍可见，不能计作前瞻命中。
- C07：F4 `condition:null` 与未结算 `settlement:null` 可渲染。
- C08：未知 input href 保留纯文本，不拼未经验证的 URL。
- C09：未校准 probability 即便 DTO 意外带 number，组件收到的 percent 仍为 null。
- C10：合格 calibrated probability 的百分比只由 F4 的公开字段提供。
- C11：卡片 DTO 缺 methodology/title 时公司页面 fail closed。
- C12：无 issuer 方法时合法空列表显示“暂无判断”，开关仍 off。

**文档→公司测试矩阵，归属 PR D。**

- D01：`filing_id` 绑定唯一 `document_id`，跨 issuer 不串文档。
- D02：同 ticker 的多份年报不会让“最近一份”覆盖精确绑定。
- D03：文档旧版本和替代版本分别可定位。
- D04：文档列表分页稳定，不跳过 sourceVersion。
- D05：事实 citation 的 `valueText` 与页面实际展示值一致。
- D06：citation snippet 是原页文本的 code point slice。
- D07：page text hash 不符时抽屉显示 integrity failure。
- D08：citation 对旧 extraction 时显示 `currentExtraction=false`。
- D09：未登录访问 private file 返回授权错误，不返回签名链接。
- D10：非 owner 访问 private citation 为 404。
- D11：owner 访问 private citation 时生成审计记录。
- D12：审计写失败时不给 private 内容。
- D13：事实无公开引用时显示缺失来源，仍保留原事实的可得日。
- D14：绑定 route 未交付时抽屉可用性为 false，保留披露原文外链。

**文档→外资测试矩阵，归属 PR E。**

- B01：许可禁止处理时 parser 不读取 broker PDF 字节。
- B02：只禁止 LLM 时，本地 parser 与 LLM 各遵守独立授权。
- B03：租约未取得时不写 artefact。
- B04：租约过期后较旧 token 不可提交解析结果。
- B05：同 SHA、同 extractor version 重跑得到相同 artefact bytes/hash。
- B06：不同 run_id 使用不同路径，不覆盖旧产物。
- B07：原 PDF 有 Unicode 组合字符时 span 的 code point 切片不漂移。
- B08：page_no 超出范围时 `span_verbatim` 拒绝。
- B09：超时不留下可被发布引用的部分产物。
- B10：无法提取文本时状态仍是明确的 no text，而非伪造空值。
- B11：broker bucket 对匿名角色没有直接读权限。
- B12：撤回许可后旧公开引用不再通过公开视图泄漏。

**F6 钩子测试矩阵，归属 PR F/G。**

- E01：D8 未决时 `extraction_gold` 在运行前返回 `kind_not_enabled`。
- E02：gold 声明的文档缺失时所有受影响字段 `read_error`。
- E03：F3 的 bbox 空间是 `pdf_points_top_left`，转换必须明确。
- E04：同一文档不同 extraction version 不可混用标注与预测。
- E05：restricted 文档未获许可时不读取原文来做 gold。
- E06：F4 无 threshold 时 calibration 总体 `incomplete`。
- E07：F4 categorical scores 不映射为 probability `p`。
- E08：F4 void/withdrawn/retrospective 样本不进前瞻总体。
- E09：同 forecast 重复结算不重复计入样本。
- E10：晚于 evidence_available_date 的登记不得获得前瞻资格。
- E11：修订链必须保留 revision_of 和最终有效登记。
- E12：真实 F4 阈值与 evaluator 使用的阈值相同且有版本。

### 3.2 变更边界

以上矩阵是后续代码 PR 的测试设计，不要求本规格 PR 新增测试文件。
每个矩阵编号要进入相应 PR 的测试名称或用例注释，便于证明覆盖。
失败时记录本地 PG17 版本、迁移列表、角色和输入 SHA；不要只截取 UI。
跑数据库测试前核查同一测试库的全局 claim lock，F4 已定义跨文件 advisory lock（`judgment-framework-50f9e1/src/lib/judgments/db-contract.ts:39`–`judgment-framework-50f9e1/src/lib/judgments/db-contract.ts:46`）。
各 PR 的测试须与 `criticalSuites` 列表及 inventory 检查同步（`macro-workbench-bbde80/scripts/ci/research-checks.ts:55`–`macro-workbench-bbde80/scripts/ci/research-checks.ts:74`）。

## 4. 执行顺序与 PR 清单

1. **PR A：F4 ↔ 宏观。** F4 落 main 后处理 `MacroReadApi` 双向类型、gate、历史 cutoff、P3/P4 HTTP 详情校验与 PG17 E2E；记录 license 阻塞，未过不得开 `MACRO_JUDGMENTS_ENABLED`。
2. **PR B：F4 ↔ 行业。** 白名单、自然键/委托 input builder、方法 registry 与真实行业 provider E2E；I-3 仍 deferred。若方法未准备好，只交输入契约且保持 UI flag off，在 PR 中写明范围。
3. **PR C：F4 ↔ 公司。** 在 F4 与公司 #115 都落地后换卡片 adapter，校验 latest/as_known；issuer 方法未交付时保留 off。
4. **PR D：F3 ↔ 公司。** F3 #114 和公司 #115 落地后补稳定 filing 绑定、SourceDrawer/引用与文档库；不允许仅用 ticker 猜文档。
5. **PR E：F3 ↔ 外资。** 外资 runtime 到位后，F3 低层 extraction 接口与 broker adapter、许可/租约 E2E；`BROKER_RESEARCH_F3_ENABLED` 在实现前不存在。
6. **PR F：F6 ↔ F3。** D8 license 决议、gold 输入适配、真实抽取 E2E，最后改 registry。
7. **PR G：F6 ↔ F4。** 概率方法、settledForecasts/阈值导出、真实结算 E2E，最后改 registry。外资→F4 的 claims/events 虽是后续依赖，当前 F4 未有该端点；外资规格明说这是“请求的集成契约”（`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:658`–`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:660`）。单独后续 PR，不塞进 F3 桥。

每个 PR 声明依赖的已合并 SHA、剩余 off 的开关、真实 provider 测试命令与 PG17 结果；
若 stacked，明确 parent PR 与 rebase 计划。
迁移、RLS、route 与 `criticalSuites` 必须在该 PR 完整，不以 fixture-provider 通过替代端到端验收。

## 5. 给 owner 的未决问题

1. F4 宏观 `macro_regime@v1` 的来源许可何时核实，历史 cutoff 应以哪条不可变的批次发布事实判资格？见 `judgment-framework-50f9e1/src/lib/judgments/methodologies/macro-regime.v1.ts:7` 和 `macro-workbench-bbde80/src/lib/macro/read-api.ts:7`–`macro-workbench-bbde80/src/lib/macro/read-api.ts:8`。
2. 行业/公司首个可证伪方法、resolver、settlement owner 与公开许可分别是谁？F4 registry 目前只有宏观（`judgment-framework-50f9e1/src/lib/judgments/registry.ts:11`）。
3. F3/公司能否接受稳定 `filing_id → document_id` 绑定 route，而非公司当前期待的 `/api/documents/by-filing/[filingId]` 名称？该 route 尚不存在（`company-research-ebd56f/src/components/company/f3-source-drawer.tsx:2`–`company-research-ebd56f/src/components/company/f3-source-drawer.tsx:7`；`document-pipeline-3cfbb4/docs/superpowers/specs/2026-11-04-document-pipeline-design.md:1001`）。
4. 外资许可模型允许 F3 本地 parser 在 `allows_llm_processing=false` 时运行吗？F3 公共抽取层由哪个 owner 输出？见 `foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:119`、`foreign-research-f63683/docs/superpowers/specs/2026-11-04-foreign-research-design.md:656`。
5. F6 D8 gold license 与 F4 概率方法阈值何时批准？在此之前两项 registry 保持 disabled（`macro-workbench-bbde80/src/lib/evals/kinds/registry.ts:15`–`macro-workbench-bbde80/src/lib/evals/kinds/registry.ts:16`）。

## 6. 审计处置（mmx 第一轮）

见 `docs/audits/2026-11-07-integration/01-spec-mmx.md`（18 条）与 `02-spec-disposition.md`（全部接受）。
更正 §2.4：F3 `disclosure_documents.filing_source_ref`（`document-pipeline-3cfbb4/supabase/migrations/20261117090000_disclosure_documents.sql:51`）是与 `filings.source_ref` 的精确键；`filing_documents` 只用于 HK。
PR D 以 `(source, filing_source_ref)` 精确匹配并按 F3 as-of 版本规则取唯一文档；匹配不唯一或缺失即不显示抽屉，绝不按 ticker 最近文档猜测。

迁移时间戳顺序与合并顺序一致：F4 `20261116090000`、F3 `20261117*`、公司 `20261118*`、外资 `20261119*`，无冲突。
