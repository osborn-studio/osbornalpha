# 宏观工作台（Macro Workbench）设计规格 · P3 + P4

- 稿次：第 3 稿（2026-11-07；Codex 第一轮 `02-codex-spec-round1.md` 21 条 → 第 2 稿；第二轮 `04-codex-spec-round2.md` 14 条新问题与 14 条部分解决 → 第 3 稿，处置见 §0 与 §0.2；两轮上限已用完，残余风险由计划审计兜底）
- 上游：宏观工作台 P1 + P2 规格 `docs/superpowers/specs/2026-11-04-macro-workbench-design.md`（分支 `claude/macro-workbench-bbde80` 第 4 稿）与计划 `docs/superpowers/plans/2026-11-06-macro-workbench.md`（第 2 稿，"共享契约"与 Task 14 / 15）；F4 判断层规格 `docs/superpowers/specs/2026-11-04-judgment-framework-design.md`（分支 `claude/judgment-framework-50f9e1`）。
- 依据：ChaosAI 拆解 `docs/research/chaosai-integration-2026-11-04/MACRO_STRATEGY_DEEP_DIVE.md` §7（传导链、美联储→中国资产）、§8（历史周期表）、§10、§11.6；总纲 `EXPERT_PLAYBOOK_AND_BRIEF.md` §5。
- 审计目录：`docs/audits/2026-11-07-macro-p3-p4/`。设计稿：§16。

---

## 0. 第 2 稿处置（Codex 第一轮）

| # | 级别 | 处置 | 落点 |
|---|---|---|---|
| 1 | P1 | 窗口 N 改为"基期 = 生效月前一月月末，末期 = 生效月 + N − 1 月末"，恰好 N 个月末区间；价格类用简单百分比变化（与历史表一致），不用对数；给出带日期的例子 | §5.3 |
| 2 | P1/P2 | 每个维度先判定资格（两端点存在、且两端点之间每个月末都有观测），再按生效日**跨方向**统一贪心选不重叠窗口；记录排除原因；写明与 P2 的差异 | §5.3 |
| 3 | P1 | 非正基值拒绝；四分位用 type-7 线性插值；舍入只在展示层；利差端点是推导值，携带两条输入观测与公式 | §5.3、§5.6 |
| 4 | P1 | 衔接事件要求三条**确切日期**的观测（单一目标最后一条、上限与下限第一条，间隔 ≤ 5 个自然日），值全部取自观测；缺任一 → 显式缺口，不造事件；证据四元组定义 | §5.4 |
| 5 | P1 | 不复用 P2 `policyCycles` 的定义；另立"政策行动段"（`macro-policy-episodes/1`），给出与 P2 周期的区别与例子 | §5.5 |
| 6 | P1 | 边界查找加覆盖与最大间隔（7 个自然日）约束，超出 → 缺失；资产视角经 `aliasOf` / `derive.from` 解析到原生日序列 | §5.5、§5.6 |
| 7 | P1 | 引入冻结的**策略清单**（两区域 active 快照 + 共同截止 + 每个输入的观测 id 与来源），传导页只从清单取值 | §4.5、§5.1 |
| 8 | P1 | 所有 P3 / P4 计算的输入都落成可取回的清单（`macro_strategy_manifests`），重放读清单；缓存键 = 清单哈希 | §4.4、§4.5 |
| 9 | P1 | LLM 不再自由写事实句：事实句由模板从事实**确定性渲染**；模型只选择事实并写"机制假设"段 | §6.3 |
| 10 | P1 | 假设段禁止出现任何数字（含全角、中文数字记号、英文数词）与禁用词；标签改为"事实句由系统生成；假设句由模型生成，未经核实" | §6.3 |
| 11 | P1 | 原始输出只存 service-only 运行表；用户可读的是投影表（接受时的渲染正文或失败码） | §4.4、§6.3 |
| 12 | P1 | 复盘表只存事实；判断节在读取时经 F4 读接口取得（F4 当前发布准入生效），不落公共表；v1 解读的事实清单**不含判断** | §6.2、§6.3、§7 |
| 13 | P1 | 调用模型前原子认领 `(user_id, request_id)` 并绑定载荷哈希；进行中 / 超时放弃状态；载荷冲突 409；重放先于主体检查 | §6.3 |
| 14 | P2 | 写明真实调用序列：`checkQuota('perspectives')` → `beginUsageRun` → `runMeteredLlmCall` → `meteredUsageFromError` → `finalizeUsageRun`；校验拒绝照常计数 | §6.3 |
| 15 | P1 | 复盘拆为不可变结果（按完整输入身份唯一）+ 当前指针（期望代际 CAS）+ service-only 尝试日志 | §4.4、§6.2 |
| 16 | P2 | 明确为"月末对月末比较"；及时性按截止日计算并冻结；缺基线、同时刻排序的规则 | §6.2 |
| 17 | P1 | 判断节只读"截至月末已知的最新卡片"（F4 `view=as_known`）；偏差案例经 `/api/judgments/[id]/history` 分页到空页，读不完 → 显式 `incomplete` | §6.2、§6.4 |
| 18 | P1 | 偏差输入取 F4 判断详情里的冻结投影（`inputs[].snapshot`），按（序列, 数据期, 角色）匹配结算证据 | §6.4 |
| 19 | P1 | 只有当 F4 卡片的 `macro_snapshot` 输入等于正在显示的快照、且方法为 `macro_regime@v1` 时才高亮；否则写明"F4 判定对应较早快照" | §5.2 |
| 20 | P2 | 一张能力矩阵统一开关与依赖行为；剧本库在判断层关闭时仍以"静态假设框架"出现（不算判断泄露），验收改写 | §1.1、§9.1 |
| 21 | P2 | 删去矛盾句；字段级显示策略：P3 / P4 自己不渲染任何 F4 数字，F4 卡片只经 P1 `MacroJudgmentSlot`（F4 渲染规则） | §5.2、§7 |

### 0.2 第 3 稿处置（Codex 第二轮新问题 N1–N14；第一轮"部分解决"项随之闭合）

| # | 级别 | 处置 | 落点 |
|---|---|---|---|
| N1 | P1 | 快照绑定：一个序列在快照中有多条观测时，按 `period_end` 最大者为 `latest`，其次为 `comparison`（`prev` / `prev3m`）；快照解读的清单 = 所请求快照固定为本区域、`cutoff = 该快照 created_at`、对方区域取 `snapshotUpTo(cutoff)`；清单落库后再认领 | §4.5、§6.3 |
| N2 | P1 | 清单冻结计算所需的一切：目录投影（被用到的序列定义字段）、快照记录（id、created_at、catalog_counts）、每次读取的状态（ok / missing / truncated）、及时性结果、事件全史；重放不访问端口与当前目录 | §4.5 |
| N3 | P1 | 唯一身份 = 整份规范化清单（含 params、cutoff、全部冻结依赖、版本）的 SHA-256；RPC 唯一键与复盘结果唯一键都用它；LRU 键加 `code_version` 与 `catalog_version` | §4.4、§4.5 |
| N4 | P2 | 复盘清单冻结截至两个截止的全部政策事件；行动段身份 = `(direction, start)`；"新开" = 截止时存在、基线时不存在；"结束" = 基线时 `ongoing`、截止时不再 `ongoing` | §6.2 |
| N5 | P2 | 指针：不存在 = 代际 0，首次发布 → 1；先判"所给结果已是当前" → `replayed`（不前移、不报错），再判期望代际；`stale` 作为返回值并写尝试日志（不抛异常回滚） | §4.4 |
| N6 | P1 | 认领 RPC 生成 `explanation_id` 与 `usage_audit_key` 并返回 `{outcome, explanation_id, usage_audit_key, projection}`；只有 `outcome='claimed'` 能进入计费与模型调用 | §4.4、§6.3 |
| N7 | P2 | 终态写入幂等（同状态同载荷重复调用返回原投影，冲突终态 → `invalid_transition`）；运行行持久化 `accounting` 与 `finalized`；计量结算失败可凭运行行重试 `macro_mark_finalized`，不重跑模型；`abandoned` 后迟到的完成只写运行行（原始输出与计量），投影保持 `failed` | §4.4、§6.3 |
| N8 | P2 | 计量顺序改为与现有路由一致：先 `resolveUserLlm`；BYO 跳过特性配额；`checkQuota` 结果用 `!allowed` 判 429，`limit === -1` 视为不限 | §6.3 |
| N9 | P2 | 衔接要求精确日期：单一目标 2008-12-15、上下限 2008-12-16 三条观测；否则缺口 | §5.4 |
| N10 | P2 | 改写为"词法策略"（不宣称语义保证）：NFKC 归一；拒绝 Unicode 数字类（Nd / No，含全角、圈码）；中文数字只在数量语境（后接量词 / 单位或前接"第"）拒绝；英文数词按词边界；正反例夹具（"进一步""统一""someone"必须通过） | §6.3 |
| N11 | P2 | 禁用词扫描只覆盖生产文本面（`*.ts` 非测试、`*.tsx`、`messages`），排除 `*.test.ts` 与 `explain-validate.ts` 策略常量 | §12 |
| N12 | P1 | P3 / P4 页面不嵌 P1 `MacroJudgmentSlot`（它按最新卡片取数且绑定传入快照）。v1 只显示经校验的"F4 判定"标记与本模块的无数字摘要（类别、生命周期、校准态文字）；完整卡片嵌入需要 P1 渲染器接收"指定卡片 + 匹配快照"，列入 WP-S6 契约 | §5.2、§6.2、§9.2 |
| N13 | P2 | 偏差分类穷尽：结算有、登记无 → `newly_available`（子类 `later_period` / `backfill` / `new_series`）；只针对 `macro_regime@v1`；记录使用的结算 id | §6.4 |
| N14 | P2 | 组合路由（传导）恒 200 并带 `judgment_status: 'disabled'\|'unavailable'\|'ok'`；503 只给纯判断路由；顺序：session → 功能开关 → 幂等重放 → 底座 / 主体检查 | §8、§9.1 |

---

## 1. 目标与非目标

### 1.1 目标

在 P1 + P2 的目录、存证观测、快照、派生政策事件之上，补齐 ChaosAI 宏观页剩下的两层，并修正对方在这两层的缺陷（B11 利差错期与错值、B13 占位节点、§7 编辑性箭头热力图、§8 多来源拼装的月末值、§4.3 把归一化得分叫概率、§6 / B04 / B05 文案与数字脱节）：

- **P3 传导与历史**
  1. **传导页** `/intel/macro/transmission`：六段"实时传导流"（节点标明 观测 / 推导 / 假设 / 缺失 / 受限 / 未纳入目录）；四象限**剧本库**（静态假设框架：触发条件逐字取自 P1 判定规则表，机制链与配置含义标"假设，未检验"）；**美联储政策 → 中美资产反应矩阵**（由派生政策事件与已核实序列计算出的事件窗口描述统计）。
  2. **历史页** `/intel/macro/history`：**联储政策行动段 × 资产区间变化表**，三种边界可切换，每格追溯到两端观测。
- **P4 解释层**
  3. **LLM 解读**：用户触发；事实句由系统从冻结事实模板渲染，模型只选择事实并写不含数字的机制假设；经确定性校验后显示。
  4. **月度复盘** `/intel/macro/review`：每区域每月一份确定性的"月末对月末"复盘，结果不可变、当前指针可前移、可重算。
  5. **偏差案例库**（判断层开启）：F4 `macro_regime` 已结算"未命中"的判断 → 登记时冻结输入与结算证据的逐项差异，不写叙事。

成功标准：

1. 传导页每个数值都来自一份冻结的**策略清单**（§4.5）中的存证观测，或由两条清单观测按十进制精确推导（显示两条输入）；无占位；目录外显示"未纳入目录"及理由，受限显示"受限"。
2. 任何 P3 / P4 页面与接口都不出现百分比形式的象限得分，不出现"概率 / 置信度 / 胜率"；判断层关闭时不出现"当前剧本"、规则命中状态与任何 F4 字段。剧本库的四个象限名称作为**静态假设框架**的标题出现，不属于判断。
3. 政策反应矩阵、历史表、传导流、复盘的每个数字可由其清单离线重算（`replay` 测试读清单，不重新查询最新历史）。
4. LLM 解读中的数字全部由系统模板产生；模型文本中出现任何数字或禁用词 → 拒绝。
5. 复盘同输入身份同结果；生成失败不改变当前指针。
6. 依赖与开关行为符合 §9.1 能力矩阵（事实功能不依赖 F4；F4 不可用只影响判断功能）。

### 1.2 本规格之外

- P1 + P2 的目录、采集、快照、判定、事件、周期、关联分析（只读其契约）；F4 的判断、结算、校准与 `JudgmentCard`（只经 F4 读接口与 P1 判定槽位渲染）。
- 资产配置建议与象限资产含义检验（F4 `macro_regime_asset_pair`，O3 未决）——不实现、不显示。
- 编辑性历史案例、北向资金、RRP / TGA、信用利差、中美股指：未纳入目录或权利未确认（§4.2、§15），显示缺失 / 受限。
- 系统级批量 LLM 生成；把 F4 判断送入 LLM。

---

## 2. 用户与权限

- 页面：所有登录用户可读（P1 §2 的 `(app)` 门禁）。
- 读接口 `/api/macro/strategy/*`：要求 session（P1 `requireSessionUser`），否则 401；参数白名单；成功 `Cache-Control: private, max-age=300`。
- LLM 解读：session；配额与计费复用 `perspectives` 特性（§6.3 给出真实调用序列）；不改 `usage_events` 枚举。
- 复盘结果、策略清单：公开参考数据（anon / authenticated 只读）；写只经 service RPC。
- 解读：用户只能读自己的**投影行**；模型原始输出只在 service-only 表。
- 偏差案例与复盘判断节：只在 `MACRO_JUDGMENTS_ENABLED` 开启时由服务端经 F4 公共读接口取得（F4 当前的 `publishable` 与校准有效性在 F4 侧生效），不落 P3 / P4 的公共表。

---

## 3. 信息架构与 UI 流程

### 3.1 路由

| 路由 | 说明 |
|---|---|
| `/intel/macro/transmission?region=US\|CN` | 传导：实时传导流 · 剧本库 · 政策反应矩阵 |
| `/intel/macro/history?boundary=event_day\|first_trading_day\|month_end` | 历史：政策行动段 × 资产区间变化 |
| `/intel/macro/review` | 复盘列表（US / CN × 近 36 个月） |
| `/intel/macro/review/[region]/[month]` | 单月复盘（`YYYY-MM`），含解读面板、（开启时）判断节与偏差案例 |

P1 工作台页内 tab 增加三个**链接型** tab："传导"、"历史"、"复盘"（P1 `MacroWorkbench.tsx` 一个 `// MACRO-P3` 围栏块，只在 `MACRO_STRATEGY_ENABLED` 开启时渲染）。

### 3.2 UI 流程

```
/intel/macro（P1）
  ├─ 传导 → /intel/macro/transmission
  │    ├─ 实时传导流 ── 观测节点 → P1 /intel/macro/[seriesId]
  │    │               └ 推导节点 → 推导抽屉（公式 + 两条输入 → 各自 P1 SourceDrawer）
  │    ├─ 剧本库（静态假设框架，四卡中性）
  │    │    └ 判断层开启 且 F4 卡片对应当前清单快照 → 该剧本加"F4 判定"标记（P1 MacroJudgmentSlot 在页首渲染卡片）
  │    │      对应较早快照 → 不高亮，显示"F4 判定对应较早快照 <日期>"
  │    └─ 政策反应矩阵（窗口 1 / 3 / 6）→ 单元格 → 逐事件抽屉（入选 / 排除及原因、端点观测、证据）
  ├─ 历史 → /intel/macro/history（边界切换；单元格 → 两端观测证据抽屉）
  └─ 复盘 → /intel/macro/review → /intel/macro/review/US/2026-10
       ├─ 本月事实（月末对月末）→ P1 详情 / 证据
       ├─ 判断节（开启）：截至月末已知的 F4 卡片（P1 MacroJudgmentSlot）
       ├─ 偏差案例（开启）：未命中判断的输入差异表
       └─ 解读面板：未生成 → 生成中 → 已接受（事实句 + 假设句分区）/ 未通过校验（失败码）/ 失败
```

### 3.3 传导页

```
┌ 宏观工作台 · 传导       US ◉ CN ○      清单 <manifest> · 截止 2026-11-03 06:02Z · 目录 macro-catalog/… ┐
├ 概览 | 指标 | 关联 | 传导 | 历史 | 复盘 | 方法与来源                                                     ┤
│ 实时传导流：① 经济数据 → ② 政策 → ③ 流动性 → ④ 无风险利率 → ⑤ 风险偏好 → ⑥ 资产                        │
│   [观测] CPI 同比 2.9（2026-09）  [推导] 中美 10Y 利差 = 4.10 − 1.85 = 2.25pp（两边 2026-10）           │
│   [缺失] ISM（目录 missing）  [未纳入目录] RRP/TGA  [受限] VIX   箭头 = 机制假设                        │
│ 剧本库（静态假设框架，不是判定）：复苏 | 过热 | 滞胀 | 衰退                                             │
│   触发条件（规则表原文 + 规则支持度）· 机制链（假设）· 配置含义（假设，未检验）· 监测序列                │
│ 美联储政策 → 中美资产反应（事件窗口 · 描述统计）   窗口 1M ○ 3M ◉ 6M ○                                 │
│   行：加息 / 降息 / QE·QT（缺失）；列：美元广义 % | 人民币中间价 % | 中美10Y利差 bp | 中债10Y bp | …        │
│   单元格：中位数（type-7 四分位）· n；n < 5 → 只给逐事件表                                              │
```

- 节点状态用文字徽章，不靠颜色；宏观指标数值不着红绿（P1 §3.2）；矩阵与历史表是资产变化，按 `data-color-scheme` 涨跌色三档浅底 + 正负号。
- 剧本卡四张同样式中性边框；判断层开启且满足 §5.2 条件时，选中卡加黄铜描边与"F4 判定"文字标记（卡内不显示任何 F4 数字）。

### 3.4 历史页

表头：行动段（方向、起止生效日、上限利率起止、累计 bp、事件数、标注：左删失 / 进行中 / 数据缺口）；列：§5.5 列集；单元格：变化（% 或 bp）+ 次行"起值（日期）→ 止值（日期）"。顶部边界切换与定义原文。页脚："观测的可得时间为首次采集时间（first_seen），本表是回溯事实表，不代表当时可知"；清单 id 与输入哈希。附"每列中位数"小图（内联 SVG）与表格切换。

### 3.5 复盘页

列表：区域 × 月份网格，状态（已生成 / 数据不足 / 无结果）与生成时间；失败尝试只在 `/admin/dq` 风格的运维视图（service-only 日志）里看。详情：按 §6.2 节顺序；页底"方法 `macro-review/1` · 清单 <id> · 输入哈希 · 代码版本 · 代际 <n>"。

### 3.6 解读面板 `ExplanationPanel`

状态：未生成（按钮 + 今日剩余次数）→ 生成中 → **已接受**：上区"事实（系统生成）"逐条事实句，每条带清单引用；下区"机制假设（模型生成，未经核实）"逐条假设句，标注其关联的事实编号 → **未通过校验**：失败码列表（不显示模型文本）→ **失败**：模型调用失败，可用新请求重试。固定页眉："绑定 <快照 / 复盘> · 清单 <id> · 模型 <provider/model> · 提示 `macro-explain-prompt/1` · 校验 `macro-explain-validator/1`"。

### 3.7 移动端

传导流纵向堆叠；剧本卡纵向折叠；矩阵与历史表 < 640px 改为按列分组的列表；解读面板全宽。

### 3.8 设计约束

`DESIGN.md` 与 `globals.css` tokens：无紫色、无渐变文字、无发光、圆角 ≤ 6px、数字 `font-mono tabular-nums`、`[data-density="data"]`；黄铜只给选中态与"F4 判定"标记；每张图有表格视图；中英双语。

---

## 4. 数据与依赖

### 4.1 读取的 P1 + P2 契约（不修改）

- 类型：`src/lib/macro/types.ts`（`MacroSeriesDef`、`ObservationRow`、`SnapshotRecord`、`RegimeRecord`、`ChangeKind`、`Timeliness`）、`judgment-contract.ts`（`Regime`、`REGIMES`、`JudgmentCardView`）。
- 目录：`MACRO_CATALOG`、`catalogById`、`CATALOG_VERSION`（`aliasOf`、`derive.from` 用于解析原生序列）。
- 判定规则表：`regime.ts` 的 `RULES`、`RULES_VERSION`（剧本触发条件只渲染；本规格不写第二个分类或打分函数）。
- 事件：`events.ts` 的 `derivePolicyEvents`、`PolicyEvent`、`toBp`、`decimalSign`、`EVENTS_VERSION`、`US_TARGET_UPPER_ID` / `US_TARGET_LOWER_ID`。
- 十进制：`decimal.ts`（`subtract`、`compare`、`canonical`）。
- 及时性：`freshness.ts` 的 `releaseTimeliness`（复盘按截止日调用）。
- 读取：`MacroDb` 的 anon 读方法（`activeSnapshot`、`snapshot`、`snapshotsSince`、`observationsByIds`、`seriesHistory`、`latestObservations`）。

**依赖未合并时**：P3 / P4 只依赖窄端口 `StrategyReadPort`（§4.3）和 `src/lib/macro/strategy/contract.ts` 中对上述类型与常量签名的结构镜像（同 P1 镜像 F4 的办法：逐字复制所需字段并注释来源；P1 + P2 合并后改为 import，并以类型测试锁定双向可赋值）。规则表与事件派生函数在接线前由端口提供（`port.rules()`、`port.derivePolicyEvents()`），P3 不复制其实现。生产端口 `macroDbStrategyPort` 与目录增补在 P1 + P2 合并后的 rebase 中加入（WP-S6）；此前能力矩阵 §9.1 生效。

### 4.2 目录增补（接线时以 `// MACRO-P3` 围栏加入 P1 `catalog.ts`，产生新的 `CATALOG_VERSION`）

| id | role | 适配器 / seriesKey | 发布机构（via） | 频率 | weight | 状态 | 用途 |
|---|---|---|---|---|---|---|---|
| `US_FED_TARGET_D` | event_source | fred_csv / `DFEDTAR` | Fed（via FRED） | daily（序列止于 2008-12-15） | 0 | A（公有领域） | 2008-12-16 之前的单一目标利率事件（§5.4） |

`revisionPolicy='immutable'`，不进判定。RRP（`RRPONTSYD`）、TGA（`WTREGEN`）、联储总资产（`WALCL`，可支持 QE / QT 行）是 owner 事项 A；v1 不增补。

### 4.3 `StrategyReadPort`（`src/lib/macro/strategy/port.ts`）

```ts
export interface StrategyReadPort{
 activeSnapshot(region:Region):Promise<SnapshotRecord|null>;
 snapshot(snapshotId:string):Promise<SnapshotRecord|null>;
 snapshotsUpTo(region:Region,cutoff:string):Promise<SnapshotRecord|null>;   // created_at ≤ cutoff 的最新非 failed 快照；同 created_at 取 snapshot_id 最大
 observationsByIds(ids:string[]):Promise<ObservationRow[]>;                  // ok 行，输入顺序；缺失 id 不返回（调用方视为缺失）
 latestObservations(seriesIds:string[],opts:{asOf:string}):Promise<ObservationRow[]>;
 seriesHistory(seriesId:string,opts:{from?:string;to?:string;asOf:string;maxRows:number}):Promise<ObservationRow[]>;  // 读完或抛 truncated
 catalog():readonly MacroSeriesDef[];
 catalogVersion():string;
 rules():RulesView;                                                           // P1 RULES 的只读投影：{rulesVersion, rows:[{rule_id,type,condition:Bilingual,support}]}
 derivePolicyEvents(upper:EventInput[],lower:EventInput[]):PolicyEvent[];     // P2 原函数
 timeliness(def:MacroSeriesDef,latestPeriodEnd:string|null,today:string):Timeliness;   // P1 releaseTimeliness
}
```

`memoryStrategyPort(fixture)` 供单测。`snapshotsUpTo` 在 `MacroDb` 上用 `snapshotsSince` 键集分页实现，读不完 → 抛 `truncated`。

### 4.4 存储（迁移 `supabase/migrations/20261115090000_macro_strategy.sql`）

迁移**不引用** P1 / F4 的表（无外键），使本分支在 P1 + P2 合并前也能独立通过 `test:migrations`；跨模块一致性由服务端代码在写入前校验。

| 表 | 主要列 | 约束 / 权限 |
|---|---|---|
| `macro_strategy_manifests` | `manifest_id` uuid PK, kind ('transmission'/'policy_response'/'cycle_table'/'review'/'explain_facts'), `body` jsonb（§4.5 整份清单）, `manifest_hash` text（hex64）, cutoff timestamptz, method_version, code_version, catalog_version, created_at | UNIQUE(manifest_hash)；anon/authenticated select；写仅经 `macro_put_manifest` |
| `macro_review_results` | `result_id` uuid PK, region, month, status ('ok'/'insufficient'), manifest_id, manifest_hash, facts jsonb, method_version, code_version, created_at | UNIQUE(region, month, manifest_hash)；anon/authenticated select；不可变 |
| `macro_review_current` | (region, month) PK, result_id, generation bigint, cutoff timestamptz, updated_at | anon/authenticated select；写仅经 `macro_publish_review` |
| `macro_review_attempts` | attempt_id uuid PK, region, month, status ('ok'/'replayed'/'insufficient'/'failed'/'stale'), result_id null, error jsonb, created_at | service only |
| `macro_explanation_runs` | `explanation_id` uuid PK（RPC 生成）, user_id, request_id uuid, payload_hash, subject_kind, subject_id, locale, manifest_id, state ('running'/'accepted'/'rejected'/'failed'/'abandoned'), claimed_at, finished_at, provider, model, prompt_version, validator_version, raw_output jsonb, validation jsonb, `usage_audit_key`（RPC 生成 `'macro-explain:'||explanation_id`）, `accounting` jsonb, `finalized` boolean default false, `late_output` jsonb（abandoned 之后迟到的完成） | UNIQUE(user_id, request_id)；**service only** |
| `macro_explanations` | explanation_id PK, user_id, subject_kind, subject_id, locale, manifest_id, state, rendered jsonb（仅 accepted：`{facts:[{fact_id,text}], hypotheses:[{text,fact_ids}]}`）, failure_codes text[]（rejected / failed）, provider, model, prompt_version, validator_version, created_at, finished_at | RLS `user_id = auth.uid()` select 给 authenticated；写仅经 RPC |

RPC（全部 `security definer`、`set search_path = public`，`revoke execute … from public, anon, authenticated` 后只 grant service_role）：

- `macro_put_manifest(p_kind, p_body, p_manifest_hash, p_cutoff, p_method_version, p_code_version, p_catalog_version)`：同 `manifest_hash` 存在 → 返回已有 id；否则插入。`manifest_hash = sha256(canonicalJson(body))`，`body` 即 §4.5 的整份清单（含 kind、params、cutoff、全部冻结依赖与版本），服务端计算；集成测试断言同一 body 两次调用返回同一 id、body 任一字段不同则不同 id。
- `macro_publish_review(p_region, p_month, p_expected_generation, p_cutoff, p_status, p_manifest_id, p_manifest_hash, p_facts, p_method_version, p_code_version)`：对 `(region, month)` 事务级咨询锁 → 按 `(region, month, manifest_hash)` 取或插入结果行 → 读当前指针（不存在视为 `generation=0, cutoff=null, result_id=null`）：① 指针已指向该结果 → `outcome='replayed'`（不前移，无论期望代际）；② `generation <> p_expected_generation` → `outcome='stale'`；③ 当前 `cutoff` 非空且 `p_cutoff < cutoff` → `outcome='stale'`；④ 否则指针指向该结果、`generation+1`（首次发布得 1）、`cutoff = p_cutoff` → `outcome='advanced'`。每次调用都在同一事务内写一条尝试日志（`ok`/`replayed`/`stale`）；`stale` 是返回值，不抛异常。返回 `{result_id, generation, outcome}`。
- `macro_record_review_attempt(p_region, p_month, p_status, p_error)`：只记失败尝试（计算或清单阶段的异常）。
- `macro_claim_explanation(p_user_id, p_request_id, p_payload_hash, p_subject_kind, p_subject_id, p_locale, p_manifest_id)`：对 `(user_id, request_id)` 加事务级咨询锁；已存在：`payload_hash` 不同 → 抛 `payload_conflict`；`running` 且 `claimed_at` 早于 5 分钟 → 原子改 `abandoned`、投影 `failed`（`failure_codes=['abandoned']`），返回 `{outcome:'existing', …}`；其他 → `{outcome:'existing', explanation_id, usage_audit_key, projection}`；不存在 → 生成 `explanation_id`、`usage_audit_key = 'macro-explain:'||explanation_id`，插入 `running` 运行行与投影，返回 `{outcome:'claimed', explanation_id, usage_audit_key, projection}`。**只有 `claimed` 的调用方可以进入计费与模型调用。**
- `macro_finish_explanation(p_explanation_id, p_state, p_provider, p_model, p_prompt_version, p_validator_version, p_raw_output, p_validation, p_rendered, p_failure_codes, p_accounting)`：`running → accepted/rejected/failed` 写运行行与投影；行已处于**同一**终态且 `raw_output` 相同 → 返回现有投影（幂等）；行已处于其他终态 → 抛 `invalid_transition`；行为 `abandoned` → 只写 `late_output` 与 `accounting`（投影保持 `failed`），返回投影。
- `macro_mark_finalized(p_explanation_id)`：计量结算成功后置 `finalized=true`（幂等）。运维脚本可列出 `state` 为终态且 `finalized=false` 的运行行，凭其 `accounting` 重试 `finalizeUsageRun`，不重跑模型。

全部表先 `revoke all … from public, anon, authenticated, service_role` 再按表 grant select；无角色有直接写权限。`supabase/migrations.lock.json` 追加；`database.types.ts` 以 `// MACRO-P3` 块加类型。

### 4.5 策略清单（`manifest.ts`，所有 P3 / P4 计算的唯一输入）

```ts
interface ManifestInput{series_id:string;role:string;               // 例如 'node:us_dgs10'、'dim:US_DTWEXBGS:base'
 observation_id:string;period_end:string;value_text:string;version:number;available_at:string;
 source:{kind:'snapshot';snapshot_id:string}|{kind:'history';as_of:string}}
interface StrategyManifest{kind:ManifestKind;params:Record<string,string|number>;cutoff:string;
 snapshots:{US:FrozenSnapshot|null;CN:FrozenSnapshot|null};          // 两区域在 cutoff 时的快照（冻结记录）
 baseline?:{cutoff:string;US:FrozenSnapshot|null;CN:FrozenSnapshot|null};   // 仅复盘
 catalog:FrozenSeriesDef[];                                          // 计算用到的每个目录序列的定义投影（id, region, role, type, name, unit, status, reason, aliasOf, derive, changeKind, releaseLagDays）
 rules?:RulesView;                                                   // 仅传导（剧本触发条件）
 reads:Array<{series_id:string;purpose:string;state:'ok'|'missing'|'truncated'}>;   // 每次读取的结果状态
 inputs:ManifestInput[];events?:StrategyPolicyEvent[];gaps?:EventGap[];
 timeliness?:Array<{series_id:string;state:Timeliness}>;            // 仅复盘，按截止日计算后冻结
 catalog_version:string;method_version:string;code_version:string}
interface FrozenSnapshot{snapshot_id:string;created_at:string;as_of:string;catalog_counts:{verified:number;missing:number;restricted:number};observation_ids:string[];history_ids:string[]}
```

- **快照内观测的角色**：同一序列在快照 `observation_ids ∪ history_ids` 中可能有多条（最新期、上一可比期、3 个月前）。`period_end` 最大者角色 `latest`，用于节点与"当前值"；`prev`（前一个 `period_end`）与 `prev3m`（3 个月前的 `period_end`，季度序列取前一季度）角色用于变化事实；其余不入清单。
- **重放**：`replay(body)` 只读清单本身——目录投影、规则、快照记录、读取状态、及时性结果都在清单里，不访问端口与当前目录；测试断言重放视图与原视图逐字段相等。

- **截止** `cutoff`：传导 / 矩阵 / 历史表 = 两区域 active 快照 `created_at` 的较大者（任一区域无快照则取另一者；都无 → 传导页"尚无发布快照"，矩阵与历史表用请求时刻）；复盘 = 该月最后一天 `23:59:59Z`；解读 = 主体（快照 / 复盘）的清单截止。
- **取值规则**：一个序列若在其区域在截止时的快照 `observation_ids` 中 → 取那条（`source.kind='snapshot'`）；否则 → `latestObservations([id], {asOf: cutoff})`（`source.kind='history'`）。历史窗口序列一律 `seriesHistory(id, {asOf: cutoff})`。
- **冻结**：计算前组装清单 → `manifest_hash = sha256(canonicalJson(body))`（唯一身份，§4.4）→ `macro_put_manifest`（幂等）→ 计算只读清单。响应带 `manifest_id`。
- **缓存**：进程内 LRU 键 = `(kind, params, 两区域快照 id, cutoff, catalog_version, code_version)` → 已存清单 id 与视图；新快照发布或代码 / 目录版本变化 → 键变化。
- **快照解读的清单**：所请求快照固定为其区域的 `snapshots[region]`，`cutoff = 该快照 created_at`；对方区域 = `snapshotUpTo(对方, cutoff)`；其余规则同上。清单落库后才认领解读（§6.3）。

---

## 5. P3 计算（纯函数，输入均为清单）

### 5.1 实时传导流 `transmission.ts`（`macro-transmission/1`）

代码即配置 `data/transmission-v1.ts`：`Record<Region, StageDef[]>`，六段 `economy → policy → liquidity → rates → risk → assets`。

```ts
type NodeDef=
 |{kind:'observed';id:string;seriesId:string}
 |{kind:'derived';id:string;op:'spread';a:string;b:string;unit:'pp'}       // a − b，要求同一 period_end
 |{kind:'assumption';id:string;text:Bilingual}
 |{kind:'not_in_catalog';id:string;label:Bilingual;reason:Bilingual};
interface StageDef{stage:Stage;label:Bilingual;nodes:NodeDef[];edgeToNext:{text:Bilingual}}   // 边恒为机制假设
```

节点集同第 1 稿（US：CPI 同比、失业率、PPI、ISM〔missing〕/ DFF / RRP·TGA〔not_in_catalog〕/ 美债 10Y、美元广义、中美 10Y 利差〔derived〕/ VIX〔restricted〕、信用利差〔not_in_catalog〕/ WTI、中美股指〔restricted〕；CN：PMI、CPI、PPI、GDP、出口 / LPR·MLF〔missing〕/ M2、社融〔missing〕/ 中债 10Y、人民币中间价、同一利差 / 无 / 中债 10Y 资产视角、沪深 300〔restricted〕）。

`buildTransmission(manifest, catalog)`：
- observed：清单中该序列 `role='node:<id>'` 的输入 → `{value_text, period_end, available_at, observation_id, source}`；目录 missing / restricted → 同名状态与目录理由；目录 active 但清单无输入 → `missing`（"截止时无观测"）。
- derived `spread`：清单含 a、b 两条输入且 `period_end` 相同 → `value_text = subtract(a,b)`（十进制精确），`inputs=[a,b]`；期不同 → `missing`（"两条输入数据期不同：a=…，b=…"）；任一缺 → `missing`。
- 视图 `TransmissionView{region, manifest_id, cutoff, snapshots, catalog_version, version, stages}`。

### 5.2 剧本库 `playbooks.ts`（`macro-playbooks/1`）

```ts
interface PlaybookDef{regime:Regime;title:Bilingual;mechanism:Bilingual[];
 implications:{favored:Bilingual[];disfavored:Bilingual[]};watch:string[]}   // watch ⊂ 目录 id
```

- 触发条件不在剧本中定义：`playbookTriggers(rules, regime)` = 规则表中 `support[regime] > 0` 的行（按 `support[regime]` 降序、`rule_id` 升序），渲染"类型 · 条件原文 · 规则支持度 0.x"。
- **字段级显示策略**：剧本卡内只渲染上述静态文本与规则表参数；不渲染任何 F4 字段、`distribution`、`margin_pp`、命中率。
- **"F4 判定"标记**（仅判断层开启）：服务端经 F4 `GET /api/judgments?subject_type=macro_region&subject_key=<region>&types=macro_regime` 取卡片，再取 `GET /api/judgments/[id]` 详情；同时满足 ① `methodology.id='macro_regime' && version='v1'`、② 判断输入中的 `macro_snapshot` 输入 `ref.snapshot_id` 等于传导清单的该区域快照 id、③ `lifecycle ∈ {open, settled}` → 标记 `claim.selected` 对应的剧本；② 不满足 → 不标记，显示"F4 判定对应较早快照 <as_of>"；F4 不可用 → "判断层暂不可用"。
- **v1 不嵌入 P1 `MacroJudgmentSlot`**：该组件按最新卡片取数并把传入快照的规则命中挂到每张卡上，不能保证与标记的卡片一致。P3 / P4 只显示无数字摘要 `F4Summary`：类别名、生命周期文字（进行中 / 已结算：命中 / 未命中）、校准态文字（"未校准"等，取自卡片 `calibration`）、方法 `id@version`、截至日期、到 `/intel/methods/...`（F4 页面）的链接。完整卡片嵌入需要 P1 渲染器接收"指定卡片 + 匹配快照"，是 WP-S6 的契约项。
- 判断层关闭：接口不调用 F4、不返回任何判断字段。

### 5.3 政策反应矩阵 `policy-response.ts`（`macro-policy-response/1`）

- **锚**：§5.4 的美国政策事件（清单 `events`），方向 = `decimalSign(change_bp)`。
- **维度**（`data/response-dims-v1.ts`）：`US_DTWEXBGS`（pct）、`CN_USDCNY_CP`（pct）、推导 `US_DGS10 − CN_CGB_10Y`（bp）、`CN_CGB_10Y`（bp）、`US_DGS10`（bp）、`US_WTI`（pct）；restricted 列（`US_SP500`、`CN_CSI300`）整列 `restricted`；北向 `not_in_catalog`；QE / QT 行恒 `missing`（"目录无联储资产负债表序列"）。全部使用**月度**序列（P1 月末派生）。
- **窗口**：N ∈ {1, 3, 6}。事件生效日所在月为 m：基期 = m − 1 月的月末观测，末期 = m + N − 1 月的月末观测（恰好 N 个月末区间，含生效月）。例：2022-03-16 加息，N = 3 → 基期 2022-02 月末，末期 2022-05 月末。
- **变化**：pct = `(末/基 − 1) × 100`（基值 ≤ 0 → 该事件该维度排除，原因 `non_positive_base`）；bp = `toBp(末 − 基)`（十进制精确）；推导利差维度的端点值 = 同月两条输入的十进制差（任一缺 → 端点缺失），端点记录两条输入观测。
- **资格（每个维度、每个 N 分别判定）**：基期月到末期月之间的每个月末都有观测（P2 Task 15 的完整窗口要求）→ 合格；否则排除，原因 `incomplete_window`。
- **独立性**：合格事件按生效日升序**跨方向**统一扫描：选第一个，跳过窗口 `[m−1, m+N−1]`（月）与任一已选事件窗口重叠的后续事件（原因 `overlap`），继续。与 P2 的差异：P2 单资产、单方向事件集；这里一次覆盖加息与降息，避免一段行情同时计入两行。
- **单元格**：按方向分组的入选事件 `n`：`n ≥ 5` → `{median, q1, q3, n}`（type-7 线性插值，全精度计算，展示层四舍五入到 0.1% 或 1bp）；`1 ≤ n < 5` → `{n}` 仅逐事件表；`n = 0` → `insufficient`。每格附 `events[]`（入选与排除，含原因、端点观测 id、值、变化）。
- **文案**（`policy-response-explain.ts`）："N 次独立加息后 M 个月末，美元广义指数变化的中位数为 x%（四分位 a% 至 b%）"，只陈述数字。
- **样本区间**：每列表头写实际覆盖区间（首末可用月末）。
- 视图 `PolicyResponseView{version, window, manifest_id, cutoff, rows, dims}`。

### 5.4 政策事件合并 `policy-events.ts`（`macro-strategy-events/1`）

- 2008-12-16 起：`port.derivePolicyEvents(upper, lower)` 原样（P2 函数）。
- 单一目标期：`US_FED_TARGET_D` 相邻两个有效观测值不同 → 事件；`upper_from = lower_from = 前值`，`upper_to = lower_to = 后值`，`basis:'single_target'`，`evidence = [prev, cur, prev, cur]`（四元组位置语义同 P2：上限前、上限后、下限前、下限后；单一目标时上下限同源）。
- 衔接：要求三条**精确日期**的观测——单一目标 s（`period_end = 2008-12-15`）、上限 u 与下限 l（`period_end = 2008-12-16`），且 s 是单一目标序列的最后一条、u / l 是上下限序列的第一条 → 事件 `basis:'single_to_range'`，`upper_from = lower_from = s.value`，`upper_to = u.value`，`lower_to = l.value`，`change_bp = toBp(u.value − s.value)`，`evidence = [s, u, s, l]`；值全部来自观测，不写常量。条件不满足 → 不产生事件，返回 `gaps:[{kind:'transition_unverified', reason}]`，行动段在该处断开并在历史表标注"数据缺口"。
- 输入严格升序（P2 `assertAscending` 语义）；同输入同输出。`StrategyPolicyEvent = PolicyEvent & {basis:'range'|'single_target'|'single_to_range'}`，不改 P2 类型。

### 5.5 政策行动段 × 资产表 `cycle-table.ts`（`macro-cycle-table/1`，行动段 `macro-policy-episodes/1`）

- **政策行动段**（与 P2 周期不同的另一定义，名称与版本独立）：§5.4 事件按生效日排序，同方向连续合并；方向翻转开新段；段 = `{direction:'hike'|'cut', start: 首事件生效日, end: 末事件生效日, events, upper_from, upper_to, cumulative_bp}`。与 P2 `policyCycles` 的区别：P2 段延伸到翻转前一日或数据末日并引入平台期；行动段只覆盖**有变动的区间**（首次到末次变动）。例：2022-03-16 起七次加息至 2023-07-26 → 行动段 2022-03-16 → 2023-07-26；P2 周期则为 2022-03-16 → 2024-09-17 前一日并在 12 个月无变动后另起平台期。
- `left_censored`：数据中第一个事件所属段（真实起点可能更早）；`ongoing`：最后一段且数据末日（清单截止日）距其末事件 < 12 个月且未翻转（只是标注，`end` 仍为末事件日）；`gap_after`：§5.4 缺口所在处。
- **列**：目录 `role=asset` 且 active 的序列与两列视角（`US_DTWEXBGS`、`CN_USDCNY_CP`）；restricted 资产整列"受限"。每列经 `aliasOf` 与 `derive.from` 解析到**原生日序列**（`US_UST10Y → US_DGS10 → US_DGS10_D`；`CN_CGB10Y → CN_CGB_10Y → CN_CGB_10Y_D`；`US_WTI → US_WTI_D`；`US_DTWEXBGS → US_DTWEXBGS_D`；`CN_USDCNY_CP → CN_USDCNY_CP_D`）用于日边界，月度序列用于月末边界。
- **边界**：
  - `event_day`：起 = 原生日序列 `period_end < start` 的最后一条，止 = `period_end ≤ end` 的最后一条；
  - `first_trading_day`：起 = `period_end ≥ start` 的第一条，止 = `period_end ≥ end` 的第一条；
  - `month_end`：起 = `start` 所在月前一月的月末观测，止 = `end` 所在月的月末观测（月未结束 → 缺失）。
  - **覆盖与间隔**：所选观测与边界日期相差 > 7 个自然日（日边界）或不是所要的那个月（月边界）→ `missing`（`out_of_coverage`）；边界早于序列首个观测或晚于末个观测 → `missing`。起止选中同一条观测 → `missing`（`degenerate`）。
- **单元格**：`{status, from:{observation_id, period_end, value_text}, to:{…}, change_text, change_kind}`；pct = `(止/起 − 1) × 100`（起 ≤ 0 → `non_positive_base`）；bp = `toBp(止 − 起)`；展示层舍入。
- 页脚可得性说明同 §3.4。视图 `CycleTableView{version, boundary, manifest_id, cutoff, episodes, columns, cells, gaps}`。

### 5.6 共用数值规则（`numeric.ts`）

- 十进制字符串运算只用 P1 `decimal.ts`；浮点只在 pct 比值与四分位处各发生一次（`Number(value_text)`），结果保持全精度存入视图的 `*_raw` 字段，展示字段由展示层舍入。
- type-7 四分位：排序后 `h = (n−1)p`，`q = x[⌊h⌋] + (h − ⌊h⌋)(x[⌊h⌋+1] − x[⌊h⌋])`。

---

## 6. P4 解释层

### 6.1 事实 `facts.ts`（`macro-facts/1`）

```ts
interface Fact{fact_id:string;      // 'obs:<series>' | 'chg:<series>' | 'evt:<date>' | 'node:<id>' | 'cell:<dir>:<dim>:<N>' | 'rev:<series>'
 kind:'level'|'change'|'policy_event'|'derived'|'response_cell'|'revision'|'release'|'timeliness';
 template:string;                   // 模板 id（§6.3 渲染）
 slots:Record<string,{value_text:string;unit:string}|string>;   // 模板槽（数字只在这里）
 series_id?:string;period_end?:string;source_inputs:string[]}  // 清单输入 role 列表
```

- `snapshotFacts(manifest)`：区域快照指标的当前值（`level`）、与上一可比期变化（`change`，P1 类型化口径，前值也在清单）、最近一次政策事件、推导节点；**不含任何判断**。
- `reviewFacts(reviewResult)`：复盘 `facts` 逐项转换。
- 事实只从清单计算；`facts` 与清单 id 一起冻结。

### 6.2 月度复盘 `review.ts`（`macro-review/1`）

**范围**：月末对月末比较（不是逐日活动账本）。截止 `cutoff = 月末 23:59:59Z`；基线截止 = 上月末。

- 快照：`snapshotsUpTo(region, cutoff)` 与 `snapshotsUpTo(region, 基线截止)`（`created_at` 相同按 `snapshot_id` 定序，§4.3）。当月截止快照不存在 → `status='insufficient'`（原因 `no_snapshot`）；基线不存在 → 第 1、2 节为空并标 `baseline_missing`，其余节照常。
- 清单：两张快照的冻结记录与观测 + 资产与视角序列在两截止处的月末观测（`latestObservations` asOf）+ 截至 cutoff 的**全部**政策事件（事件日序列全史，asOf = cutoff；基线时的事件集 = 其中生效日 ≤ 基线截止日者）+ 目录投影 + 冻结的及时性结果。
- 行动段身份 = `(direction, start)`；"新开" = 截止时存在、基线时不存在的段；"结束" = 基线时 `ongoing`、截止时不再 `ongoing` 的段（翻转或 12 个月无变动）。
- 七节（全部从清单计算）：
  1. `releases`：截止快照中 `period_end` 晚于基线快照的序列（旧期 → 新期、值）；
  2. `revisions`：两快照中同一序列同一 `period_end`、截止快照版本更高（旧值 → 新值）；**只覆盖各序列在快照中的最新期**（更早期的修订不在 v1 范围，页面写明）；
  3. `timeliness`：对截止快照的每个目录 active 指标调用 `port.timeliness(def, latest_period_end, today = 月末日期)`，冻结 `late` / `missing`；目录 missing / restricted 项计入"目录缺失 / 受限"，不与"迟发"混淆；
  4. `policy_events`：生效日落在本月的 §5.4 事件；
  5. `episode_changes`：截止时相对基线时新开或结束的政策行动段（§5.5 定义）；
  6. `asset_moves`：资产与视角序列本月月末相对上月末的变化（口径同 §5.5 月末边界）；
  7. `coverage`：截止快照的目录计数（计数，不是百分比）。
- 生成：`/api/cron/macro-review`（`vercel.json` `0 6 3 * *`，生成上一个月两区域；`?month=YYYY-MM&region=` 手动；`?preview=1` 零写入；`authorizedCronRequest`）。流程：读当前指针 `generation` → 组装清单 → `macro_put_manifest` → 计算 → `macro_publish_review(expected_generation, cutoff, …)`；异常 → `macro_record_review_attempt('failed')`，指针不动。
- **判断节**（仅判断层开启，读时）：页面服务端调用 F4 `GET /api/judgments?subject_type=macro_region&subject_key=<region>&types=macro_regime&view=as_known&asOf=<月末>`，得到截至月末已知的最新卡片，以 `F4Summary`（§5.2，无数字）渲染；不落 P3 表。

### 6.3 LLM 解读（`explain-request.ts`、`explain-render.ts`、`explain-validate.ts`；提示 `macro-explain-prompt/1`，校验器 `macro-explain-validator/1`）

**输出分工**：
- 事实句 = 系统模板（`explain-render.ts`，中英各一套，模板 id ↔ 渲染函数）对事实 `slots` 的确定性渲染（数字格式化规则固定：pp / bp / % 的小数位、千分位、日期格式）。
- 模型只返回 JSON：`{points:[{fact_ids:string[1..4], hypothesis:string}], counterpoints:[{fact_ids:string[1..4], text:string}]}`（`points` 1–6 条，每段 ≤ 240 字符）。页面先渲染所引事实的事实句，再渲染模型的假设句，二者分区显示。

**校验**（纯函数，任一失败 → `rejected`）。这是**词法策略**，不是语义证明：它保证模型文本里没有可识别的数字记号与禁用词，不保证假设正确（页眉如实标注）。
1. ajv 结构；条数与长度；
2. 每个 `fact_id` 存在于该次事实清单；
3. **归一化**：`text.normalize('NFKC')`，再做以下检查；
4. **数字记号**（失败码 `numeral`）：任一 Unicode 数字类字符（`\p{Nd}`、`\p{No}`，含全角、圈码、上标）；`%`、`‰`、`bp`/`pp`（英文词边界）；`基点`、`百分点`、`百分之`、`成`前接中文数字；中文数字串 `[〇零一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟]+` **仅在数量语境**拒绝：后接量词或单位（`个次年月日周倍成点%`、`个百分点`、`基点`）或前接`第`；英文数词按词边界（`\b(zero|one|two|…|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|double|twice|triple|dozen)\b`，不区分大小写）。正例夹具必须通过："进一步""统一""一致""万一""someone""none""often""happen"；反例夹具必须拒绝："3""３""③""三个月""第二""两倍""百分之五""five""twice""25bp"；
5. **禁用词**（`FORBIDDEN_TERMS`，失败码 `forbidden_term`；中文子串匹配，英文词边界、不区分大小写；单测逐条）：概率、置信、胜率、把握、可能性为、赔率、将会、必然、一定会、probability、probable、confidence、likelihood、odds、win rate、chance of、will rise、will fall、will increase、will decrease、is going to；
6. **象限词恒禁止**（失败码 `regime_term`；v1 解读不含判断）：复苏、过热、滞胀、衰退、recovery、overheat、overheating、stagflation、recession；
7. 校验器版本、全部失败项（失败码 + 所在段 + 命中片段）写入运行表；投影只存失败码集合。

页眉文案："事实句由系统从冻结数据生成；机制假设由模型生成，未经核实。"——不宣称"已通过事实校验"。

**请求流程**（`POST /api/macro/strategy/explanations`，body `{request_id, subject:{kind:'snapshot'|'review', id}, locale}`）：
处理顺序（§9.1 能力矩阵的前两层先于一切）：
1. `getServerSupabase().auth.getUser()`（无 → 401）→ `MACRO_STRATEGY_ENABLED`（关 → 404）→ body ajv → `payload_hash = sha256(canonicalJson({subject, locale}))`。
2. **幂等重放**：服务端用 admin 客户端查 `(user_id, request_id)` 的运行行；存在 → `payload_hash` 不同 → 409 `payload_conflict`，否则经 `macro_claim_explanation` 返回其投影（含超时 `abandoned` 处理）——在底座与主体检查之前。
3. 底座（端口为 null → 503）与主体检查：快照须为非 failed 快照；复盘须为存在的结果行。构造事实清单（§4.5"快照解读的清单"或复盘结果的清单）→ `macro_put_manifest(kind 'explain_facts')`。
4. LLM 与配额（与 `src/app/api/perspectives/[ticker]/route.ts` 一致的顺序）：`resolveUserLlm()`（null → 该路由同样的"未配置模型"响应）→ 非 BYO 时 `checkQuota('perspectives')`：`!quota.allowed` → 429 `quota_exceeded`（`limit === -1` 表示不限；`checkQuota` 抛错按该路由的 fail-open 规则）；BYO 跳过特性配额。
5. **认领**：`macro_claim_explanation(...)` → `outcome='existing'` → 直接返回投影（并发请求的输家在此停止，不进入计费）；`outcome='claimed'` → 继续，拿到 RPC 生成的 `explanation_id` 与 `usage_audit_key`。
6. `beginUsageRun(userId, usageAuditKey, 'perspectives', {provider, model, pricingVersion, usdCnyMicros, byo})`（失败 → 该路由同样的 `cost_quota` 响应；`macro_finish_explanation('failed', failure_codes=['usage_audit_unavailable'])`）。
7. `runMeteredLlmCall({feature:'perspectives', provider, userId, budgetExempt, maxOutputTokens, call})`（与该路由同一 limiter 的 `runWithBudgetRetry`）；异常 → `meteredUsageFromError` → `macro_finish_explanation('failed', accounting)` → `finalizeUsageRun(..., failed)` → `macro_mark_finalized`。
8. 解析 + 校验 → `accepted` 或 `rejected`，两种都是**已完成**的模型调用：`macro_finish_explanation(state, raw, validation, rendered|failure_codes, accounting)` → `finalizeUsageRun(..., completed, accounting)`（已发生的提供方成本不退；BYO 与 admin 豁免沿用已有规则）→ `macro_mark_finalized`。结算失败不影响用户响应，运行行留 `finalized=false` 供重试。

读取：`GET /api/macro/strategy/explanations?subject_kind&subject_id` → 本人投影最近 20 条（`private, no-store`）。POST、GET、重放都返回同一投影形状。

### 6.4 偏差案例 `deviations.ts`（`macro-deviations/1`，仅判断层开启）

- 枚举：先 `GET /api/judgments?…types=macro_regime` 取最新卡片 id，再 `GET /api/judgments/[id]/history?limit=500&before=…` 分页**直到空页**；单区域累计超过 5000 条 → 返回 `{incomplete:true}` 并在页面显示"案例列表不完整"。只保留 `lifecycle='settled'` 且结算结果为未命中（`settlement.outcome='miss'`）。
- 每条：`GET /api/judgments/[id]` 取 `{judgment, settlements}`：登记值 = `judgment.inputs` 中 `macro_observation` 输入的冻结投影 `snapshot{series_id, period_end, vintage_id, value}` 与 `macro_snapshot` 输入的冻结投影；结算值 = 最新结算行证据中的重算输入（`observation_refs`）。证据缺这一字段 → 案例 `evidence_incomplete`，不自行重算。
- 范围：只针对 `macro_regime@v1`（其他方法 / 版本的卡片跳过）。
- 匹配键 = `(series_id, period_end)`，角色 = 该观测在登记快照中的用途（`latest` / `comparison`，由 `period_end` 与该序列登记时最新期比较得出；结算侧同理）。分类穷尽：
  - 两边都有且 `vintage_id` 不同 → `revised`；相同 → `unchanged`（默认折叠）；
  - 登记有、结算无 → `dropped`；
  - 结算有、登记无 → `newly_available`，子类：`later_period`（晚于登记时该序列最新期）、`backfill`（不晚于登记时最新期）、`new_series`（登记时该序列没有任何观测）。
- 输出 `DeviationCase{judgment_id, settlement_id, region, as_of, selected, realized, diffs, evidence_state}`；不写叙事。

---

## 7. 判断边界（不变量）

1. 象限判定、`distribution`、`margin_pp`、历史准确率、校准状态都属于 F4；P3 / P4 不计算、不存储、不渲染这些数字（F4 卡片只经 P1 `MacroJudgmentSlot` 按 F4 §9.3 渲染）。
2. 本规格没有第二个分类或打分函数（单测：`src/lib/macro/strategy/**` 不导出返回 `Regime` 的函数；剧本 `regime` 字段是静态配置键）。
3. 判断层关闭：不调用 F4；接口无 `judgment`、`contributions`、`f4` 字段；页面无"F4 判定"标记。
4. 判断层开启：只加剧本标记（§5.2 三条件）、复盘判断节（读时）、偏差案例（读时）。
5. 剧本库的象限名称与配置含义是静态假设框架，带"未检验"与 F4 `macro_regime_asset_pair` 未实现说明。
6. 矩阵与历史表是描述统计，不登记判断、不出现预测措辞。
7. v1 LLM 解读输入不含任何判断；象限词恒禁止。

---

## 8. API 契约

| 方法 路径 | 返回 | 约束 |
|---|---|---|
| `GET /api/macro/strategy/transmission?region=US\|CN` | `{transmission, playbooks, judgment_status:'disabled'\|'unavailable'\|'ok', f4?:{mark:{regime, judgment_id, snapshot_match:boolean, as_of}, summary:F4Summary}}` | 登录；恒 200（事实部分可用时）；`f4` 仅 `judgment_status='ok'` |
| `GET /api/macro/strategy/policy-response?window=1\|3\|6` | `PolicyResponseView` | 登录 |
| `GET /api/macro/strategy/cycle-table?boundary=event_day\|first_trading_day\|month_end` | `CycleTableView` | 登录 |
| `GET /api/macro/strategy/manifests/[id]` | 清单全文 | 登录 |
| `GET /api/macro/strategy/reviews?region=US\|CN` | `{items:[{region, month, status, generation, result_id, updated_at}]}`（近 36 个月） | 登录 |
| `GET /api/macro/strategy/reviews/[region]/[month]` | 当前结果 `{result, manifest_id, generation}` | 登录；无指针 → 404 |
| `GET /api/macro/strategy/deviations?region=` | `{cases, incomplete}` | 登录；判断层关闭 → 404 `judgments_disabled`；F4 不可用 → 503 `judgments_unavailable` |
| `POST /api/macro/strategy/explanations` | 投影 `{explanation_id, state, rendered?, failure_codes?}` | 登录；ajv；配额；幂等 |
| `GET /api/macro/strategy/explanations?subject_kind&subject_id` | 本人投影列表 | 登录；`private, no-store` |
| `GET /api/cron/macro-review?preview=1&month&region` | 回执 | `CRON_SECRET`；`vercel.json` 登记 |

错误统一 `{error:{code,message}}`；读响应带 `version`、`catalogVersion`、`manifest_id`。

---

## 9. 代码结构、开关与所有权

### 9.1 能力矩阵

| 条件 | 页面 / tab | 事实接口（传导、矩阵、历史、复盘、清单） | 解读 | 剧本标记 / 判断节 / 偏差 |
|---|---|---|---|---|
| `MACRO_STRATEGY_ENABLED` 未设 | 子路由 404，tab 不渲染 | 404 `strategy_disabled` | 404 | 404 |
| 开启，P1+P2 未接线（端口为 null） | 页面"宏观数据底座未就绪" | 503 `macro_foundation_unavailable` | 503 | 503 |
| 开启，已接线，判断层关闭 | 正常 | 正常 | 正常（不含判断） | 不出现；偏差接口 404 `judgments_disabled` |
| 开启，已接线，判断层开启，F4 不可用 | 正常，判断位置"判断层暂不可用" | 正常 | 正常 | 503 `judgments_unavailable`；页面降级 |
| 全部可用 | 正常 | 正常 | 正常 | 正常 |

判定顺序（所有路由）：session（401）→ `MACRO_STRATEGY_ENABLED`（404）→ 解读 POST 的幂等重放 → 底座（503）→ 主体 / 参数检查 → 判断层：组合路由（传导、复盘详情）恒 200 并带 `judgment_status`，只有纯判断路由（偏差案例）返回 404 / 503。

F4 读取经 `f4-client.ts`（服务端 `fetch` 本站 `/api/judgments*`，带超时 3 秒；F4 路由不存在 → 视为不可用）。F4 合并后若提供进程内读函数，改为直接调用（WP-S6）。

### 9.2 文件

```
src/lib/macro/strategy/
  contract.ts  port.ts  wiring.ts（WP-S6）  manifest.ts  numeric.ts
  transmission.ts  playbooks.ts  policy-events.ts  policy-response.ts  policy-response-explain.ts  cycle-table.ts
  facts.ts  review.ts  explain-request.ts  explain-render.ts  explain-validate.ts  deviations.ts  f4-client.ts  flags.ts
  db.ts（四组 RPC + 读取；supabase + memory）
  data/{transmission-v1,playbooks-v1,response-dims-v1}.ts  prompts/macro-explain-v1.{zh,en}.md
  *.test.ts  replay.test.ts  strategy.integration.test.ts（S4_TEST_STATE；criticalSuites）
src/app/api/macro/strategy/{transmission,policy-response,cycle-table,manifests/[id],reviews,reviews/[region]/[month],deviations,explanations}/route.ts
src/app/api/cron/macro-review/route.ts
src/app/(app)/intel/macro/{transmission,history,review,review/[region]/[month]}/page.tsx
src/components/macro/strategy/
  TransmissionFlow.tsx  PlaybookGrid.tsx  PolicyResponseMatrix.tsx  CycleReturnsTable.tsx  ReviewIndex.tsx  ReviewView.tsx
  DeviationCases.tsx  ExplanationPanel.tsx  EvidencePairDrawer.tsx  DependencyState.tsx  F4Summary.tsx  strategy-view-model.ts  use-strategy-t.ts
messages/{zh,en}/macroStrategy.json
supabase/migrations/20261115090000_macro_strategy.sql
docs/runbooks/macro-strategy.md
```

所有权：上表全部路径与迁移 `20261115*`。共享文件改动包在 `// MACRO-P3` … `// /MACRO-P3`：`src/i18n/request.ts`、`src/lib/supabase/database.types.ts`、`scripts/ci/research-checks.ts`、`vercel.json`（只追加）、`supabase/migrations.lock.json`（只追加）；WP-S6 接线时：P1 `catalog.ts`（§4.2）、P1 `MacroWorkbench.tsx`（链接型 tab）。开关：`MACRO_STRATEGY_ENABLED`（新，默认关）；判断层沿用 `MACRO_JUDGMENTS_ENABLED`。

---

## 10. i18n

新域 `macroStrategy`（注册到 `MESSAGE_DOMAINS`，`// MACRO-P3` 块）；配置文本 `Bilingual` 双写；表头、状态、边界定义、失败码、页眉与免责声明进 `messages/{zh,en}/macroStrategy.json`；专用测试 `src/components/macro/strategy/strategy-messages.test.ts`（键集合、占位符、文案不含 `FORBIDDEN_TERMS`）。

---

## 11. 错误处理

| 情形 | 行为 |
|---|---|
| 能力矩阵中的不可用态 | 按 §9.1 |
| 两区域都无快照 | 传导页"尚无发布快照"；矩阵与历史表以请求时刻为截止照常计算 |
| 历史读取 `truncated` | 该维度 / 列整列 `missing`（`history_truncated`） |
| 推导输入期不同 / 缺一 | 节点或端点 `missing`，写明原因 |
| 衔接事件不可核实 | 不造事件；`gaps` + 历史表"数据缺口" |
| F4 卡片对应较早快照 | 不标记，显示对应快照日期 |
| LLM 失败 / 未通过校验 | `failed` / `rejected`；计量按 §6.3 |
| 解读请求重复 / 载荷冲突 / 超时 | 返回原投影 / 409 / `failed(abandoned)` |
| 复盘并发、过期代际、旧截止 | 咨询锁；`stale_generation` / 不前移；尝试日志 |
| 偏差枚举超上限 | `incomplete:true` |

---

## 12. 测试策略

- 纯函数（vitest，`memoryStrategyPort` 夹具）：`manifest`（截止选择、快照 vs 历史来源、哈希稳定、同 created_at 定序）；`transmission`（五种节点态、同期 / 错期推导）；`playbooks`（触发条件 = 规则表投影与排序；三条件标记矩阵）；`policy-events`（单一目标、衔接成功、衔接缺上限 / 下限 / 间隔 > 5 天 → 缺口）；`policy-response`（N=1/3/6 端点、例子 2022-03-16、完整窗口资格、跨方向贪心、排除原因、n<5、QE/QT、受限列、非正基值、type-7、推导端点）；`cycle-table`（行动段 vs P2 周期例子、左删失、进行中、三种边界、7 天间隔、覆盖外、degenerate、别名解析）；`review`（七节、无快照、缺基线、及时性按月末、修订只覆盖最新期）；`explain-render`（模板中英、格式）；`explain-validate`（数字：ASCII / 全角 / 中文数字 / 英文数词 / % / bp / pp；禁用词逐条；象限词；结构；合法文本通过）；`deviations`（四种差异、证据缺字段、分页到空页、上限 incomplete）。
- `replay.test.ts`：提交的清单夹具 → 传导、矩阵、历史表、复盘视图与期望 JSON 完全一致（读清单，不调端口）。
- 禁用词扫描只覆盖生产文本面：`src/lib/macro/strategy/**/*.ts` 中非 `*.test.ts` 且非 `explain-validate.ts`（策略常量）的文件、`src/components/macro/strategy/**/*.tsx`、`messages/*/macroStrategy.json`、`src/lib/macro/strategy/data/**`、`prompts/**`；校验器的反例夹具留在 `explain-validate.test.ts`，由运行时拒绝测试覆盖。
- 数据库（`test:db`，`S4_TEST_STATE`，`criticalSuites`）：六表 grants / RLS（anon 读清单与复盘；读不到运行表、尝试表；用户只读自己的投影）；`macro_put_manifest` 幂等；`macro_publish_review`（同身份重放、A→B→A 指针前移语义、过期代际、旧截止不前移、并发）；`macro_claim_explanation`（载荷冲突、超时放弃、重复返回）；`macro_finish_explanation` 状态机。
- 迁移：`npm run test:migrations`；锁文件追加。
- API：401；参数白名单；能力矩阵五态；判断层关闭响应无判断字段；解读：重放先于主体检查、409、429、假提供者返回含数字文本 → `rejected` 且仍 `finalizeUsageRun(completed)`。
- 端到端（WP-S6 后）：三个子路由；边界切换；解读拒绝态。

---

## 13. 性能与运维

- 矩阵与历史表：输入 ≤ 12 条序列 × ≤ 7000 日点；p95 < 500 ms（清单命中缓存时 < 100 ms）。
- 复盘 cron 每月一次、每区域一个单元。
- 环境变量：`MACRO_STRATEGY_ENABLED`（新）、`MACRO_JUDGMENTS_ENABLED`、`CRON_SECRET`；无新密钥。
- 运行手册 `docs/runbooks/macro-strategy.md`：能力矩阵、接线步骤（WP-S6）、复盘重算、解读失败码说明、目录增补流程。

---

## 14. 分期与验收

| 工作包 | 交付 | 退出条件 |
|---|---|---|
| WP-S1 契约、端口、存储 | `contract.ts`、`port.ts`（内存）、`flags.ts`、迁移 + 锁 + 类型、`db.ts`、集成测试 | test:db / test:migrations |
| WP-S2 P3 计算 | manifest、numeric、policy-events、transmission、playbooks、policy-response、cycle-table、replay | 夹具全绿；禁用词扫描 |
| WP-S3 P4 计算 | facts、review、explain-render、explain-validate、explain-request（假提供者）、deviations、f4-client | 校验器用例全覆盖 |
| WP-S4 接口与 cron | 十个路由、cron、vercel.json | API 测试（能力矩阵） |
| WP-S5 UI | 四个页面、组件、i18n、移动端、表格视图 | 画布对照；DESIGN.md |
| WP-S6 接线（P1+P2 合并后；F4 合并后） | `wiring.ts`、目录增补、MacroWorkbench tab、契约镜像换 import、F4 进程内读取 | 端到端 verify；真实夹具 replay |

验收样例：
1. 利差节点：同期显示 `a − b` 与两条输入；错期显示缺失（对照 B11）。
2. 判断层关闭时，传导 / 复盘页面与接口 JSON 中无 `f4Mark`、`contributions`、"概率"。
3. 历史表 `month_end` 边界下 2022-03-16 → 2023-07-26 加息行动段的美债 10Y bp 变化 = 夹具 2023-07 月末值 − 2022-02 月末值（十进制，× 100）。
4. 模型假设句含"3"或"三成" → `rejected`，用量仍记一次完成调用。

---

## 15. owner 事项与默认假设

默认（按已记录的 owner 决策，未另行请示）：
1. 判断层默认关闭；`MACRO_STRATEGY_ENABLED` 默认关，WP-S6 验收后由 owner 开启。
2. 不做配置模板、不做象限资产含义检验（F4 O3 未决）。
3. 受限序列（VIX、SP500 / NASDAQ / DJIA、沪深 300）保持 restricted；矩阵与历史表对应列显示"受限"。
4. 解读复用 `perspectives` 配额特性。
5. 历史类比只用计算出的行动段表，不写编辑性案例。
6. 本 PR 合并顺序在 P1 + P2 之后（迁移时间戳 `20261115*` 晚于 `20261114*`）。

待 owner：
- A. 目录增补：RRP（`RRPONTSYD`）、TGA（`WTREGEN`）、联储总资产（`WALCL`，支持 QE / QT 行）——FRED 公有领域，需确认周频契约。
- B. 宏观解读是否单设配额特性（改 `usage_events` 枚举与计费）。
- C. 中美股指、恒指权利确认（解锁股指列）。

---

## 16. Claude Design 画布

### 16.1 待设计清单

1. UI 流程与数据链路。
2. 传导页（判断层关闭）：传导流六段、节点各态、剧本库、政策反应矩阵。
3. 剧本库（判断层开启）：F4 判定标记、"对应较早快照"态。
4. 推导抽屉与逐事件抽屉（入选 / 排除及原因）。
5. 历史页：三种边界、左删失 / 进行中 / 数据缺口、单元格证据、列中位数小图 + 表格切换。
6. 单月复盘（判断层开启）：七节、判断节、偏差案例、解读面板。
7. 解读面板各态（未生成 / 生成中 / 已接受〔事实区 + 假设区〕/ 未通过校验 / 失败）。
8. 依赖未就绪、判断层暂不可用、复盘列表。
9. 移动端：传导、历史。

### 16.2 画布

https://claude.ai/artifact/2s8t4QpQGAGCXWZNfQ2TUW（私有，10 块画板：UI 流程与数据链路、传导页·判断层关闭、剧本库·判断层开启、推导 / 逐事件抽屉、历史页、单月复盘·判断层开启、解读面板五态、依赖未就绪 / 复盘列表、手机·传导、手机·历史）。画板数值为示意。第 2 稿的改动（解读面板改为"事实区 + 假设区"、F4 标记三条件、行动段命名）以本规格为准，画布在 WP-S5 开工前同步。
