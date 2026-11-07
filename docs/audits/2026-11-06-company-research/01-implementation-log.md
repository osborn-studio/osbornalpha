# 01 — 公司研究实施记录

执行：Opus 5.5 指挥；每任务 Sonnet 5.5 实施 → Opus 规格复审 → Opus 质量复审 → Codex gpt-6-astra（medium）review + 对抗挑战 → 修复 P1/P2。
计划：`docs/superpowers/plans/2026-11-06-company-research.md`；规格：`docs/superpowers/specs/2026-11-04-company-research-design.md`（第 6 稿）。

| 序 | 任务 | 提交 | 规格复审 | 质量复审 | Codex review / 挑战 | 修复轮次 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | Task 1 表迁移 + RLS/授权 + 触发器 + Row 类型 + 集成测试骨架 | 0adb23b8, 54c4fcab | ✅（缺 `company_event_reads service all` 策略 → 补） | 修后通过（pg_policies 断言、空断言改计数、不可变键三列、服务端时间戳、两索引） | review: 无缺陷；挑战: 无缺陷 | 1 | 6/6 真实 PG |
| 2 | Task 2 函数迁移 + canonical JSON + 并发/角色集成测试 + 锁定 | b7265619, df4ca565 | ✅ | 修后通过（ambiguousUnits 用例隔离、helper 授权全覆盖、时钟偏差 flake、嵌套 token、captured_at 格式） | review: P2 canonical 稀疏数组；挑战: **P2 证据替换无尝试/版本围栏 → 新迁移 `20261112092000_company_evidence_fence.sql`（5 参签名，stale_computation/stale_attempt）**；修复复审无缺陷 | 1 | 21/21 真实 PG；test:migrations 通过；三份迁移已锁 |
| 3 | Task 3 types + CompanyDb 契约 + supabase/内存实现 + 同快照读取器 | d6aebe0f, 7411a29c | ✅ | 修后通过（supabase 桩全覆盖、证据新规则契约用例、时间戳往返校验、name 排序 null 末位、未知发行人） | review/挑战: **P2 内存快照读取器在并发发布下混合状态 → 前后 rev 一致才返回（≤5 次重试）**；修复复审无缺陷 | 1 | 35 单测 |
| 4 | Task 4 pgCompanyDb + 真实库契约（RLS 下按用户方法） | 36ea43c5 | ✅ | Approved（5 项 minor：测试专用助手的 null 守卫/错误形状，未改） | review/挑战: 无缺陷 | 0 | 35/35 真实 PG（含 11 个契约用例） |
| 5 | Task 5 events + coverage + decimal 差值 + 夹具清单骨架 | 64f07cf5, 8273bb4a | ✅（含与 SQL 校验逐项核对：factCount、occurred_on 由 filing 日期外键保证一致） | 修后通过（非 ok 行直传、性质测试加 SQL 不变量、比较器只按 disclosure_seq、cutoff 往返校验） | review/挑战: 无缺陷 | 1 | 28 单测 |
| 6 | Task 6 证据索引构建器 + pdf-locator + 证据门槛 | 7099c2f9, 6f5edfc9 | ✅ | 修后通过（filing 来源校验、零输入派生置空、index_version 校验、逐快照只缓存解析结果、故障路径测试、重复字段拒绝） | 挑战: P2 无效 PDF 定位可公开 → 页码/行/列校验；修复复审: **P1 存储瞬时错误部分构建会删旧证据 → Task 8 拒绝含 storageError 的构建** | 1 | 128 单测（company 目录） |
| 7 | Task 7 显示格式化 + 指标目录 + 报表网格 | 89de094c, 05307216 | ✅（badgesOf 5→6 参偏差已记录） | 修后通过（缺序列字段/非历史信封抛错、sourceConcepts 本流、测试补全） | review/挑战: P2 单季派生格丢 U 徽标 → `GridResult.otherUnitsAlso`；修复复审无缺陷 | 1 | 18+ 单测 |
| 8 | Task 8 digest + deps + cron + 脚本 + vercel.json + 回放集成 | 5a7b8724, 5589f604, 59eedec3, 0665b3de, 3304afdb | ✅（回放验证 §1.1 第 4 条；Task 5/6 的事件与证据行通过 SQL 校验） | 修后通过（混合批次计数用真实 finishBatch、失败原因进批次错误、回执去消息、测试补全、回放超时 30 s） | review: P2 重叠流丢 sweep 份额 → 重叠流留 sweep 列表（计划偏差，已接受）、P2 批次级缓存 → 每流缓存；Task 6 修复复审 **P1 storageError 时不替换证据** | 3 | 40/40 真实 PG；27 单测 |
| 9 | Task 9 路由共用层 + statements + facts 抽屉 + admin 变体 | c1e99d1b, 319969dd（后者同时含 Task 10 文件，并发暂存所致） | ✅ | 修后通过（真实门槛 statements 测试、fake 门槛对缺 filing 的 US 事实失败关闭、asOf 截断回落读取、派生置空 factId 取最严重原因者） | 挑战: **P2 中间件对 /api/companies 调 getUser（可能 Set-Cookie）→ `// COMPANY` 块跳过**；review 无缺陷 | 1 | 70 项定向测试 |
| 10 | Task 10 overview/events/metrics/filings/freshness/snapshot + admin | 319969dd（随 Task 9 修复一起提交）, 6d658f0a（同时含 Task 15） | ✅ | 修后通过（gateEvents asOf 截断 + 共用 fact-scope 过滤、freshness 缺行 status:null、真实门槛 CN/asOf 用例） | review: P2 大写 UUID 查不到证据 → 小写化；挑战: P2 指标输入丢 quarter/ytd_rule → DerivedCell.inputs 增 quarter/ytdRule（types.ts 加法改动），混合规则不合并 | 1 | 214 单测 |
| 14 | Task 14 dcf-seed + assemble + /api/dcf + DcfStudio 股权桥 | 431c36fe, 0c5cbb1d, 4c661cdb | ✅（截断读取 → 不种子） | 修后通过（覆盖值与 LLM 值范围校验、非经常性覆盖保留、提示词口径、仅取候选叶子证据、"期末在外股数"标签） | review: P2 nonRecurring 被丢；挑战: P2 运行记录与 GET 种子不一致、跨公司竞态、截断误判为缺失；修复复审: P2 taxRate 口径 → 修 | 2 | 189 单测 |
| 15 | Task 15 packet + agent financials 工具 + 删 useFinancials + consensus mock 关闭 | 6d658f0a（与 Task 10 修复同一提交，并发暂存）, b7588ba4 | ✅ | 修后通过（clipped 只计真正裁掉的期、回退清零 withheld、零输入指标置空、§9.5 grep 干净） | 挑战: P2 packet 指标丢输入谱系 → 复用 derivedCellOf + gateCell；修复复审无缺陷 | 1 | 248 单测 |
| 11 | Task 11 i18n 两域 + 服务端 page + CompanyPage 外壳 + 旧视图迁出 + 决策 E/J | 62e2a7fb, dd7afa6a, 26956a4d | ✅（404 判定改为与 page-data 同一规范化 + 市场后缀） | 修后通过（ReplayBar 失焦/回车/应用按钮、最小日期、可取消；无硬编码文案） | review: P2 AI 结果切页签丢失 → 提升到外壳、P2 freshness null；挑战: P2 抓取结果未绑定 URL（回放日期变化时短暂显示越界文件）、移动端标签错位、错误无重试；修复复审: P2 Cancel 上回车误应用 → 修 | 2 | 191 单测 |
| 12 | Task 12 报表视图 + 披露历史抽屉 + 公式抽屉 + 概念说明 + CSV + 迷你柱 | 6fa7d5b3, 281447b0, f0f039d1 | ✅（抽屉 scale 指数按单位取 0 修正） | 修后通过（抽屉栈纯 reducer + inert/焦点归还、portal 浮层、移动端卡片、可访问性细项） | review: P2 抽屉不随 admin 视图、截断显示为空；挑战: P2 其他单位行不可达证据、"— U" 格不可点、公式抽屉缺缩放说明、叠放抽屉焦点丢失；修复复审: P2 单季派生 "— U" 无直接事实 → 单季口径下不可点并提示 | 2 | 37 单测（components/company + i18n）；无浏览器验证（Task 19 e2e） |

## Task 16 跟踪 API

- 路由：`/api/tracking/watches`（GET/POST）、`/watches/[issuerId]`（PATCH/DELETE）、`/watches/[issuerId]/read`、`/watches/import-watchlist`、`/inbox`；全部 `private, no-store`，未登录 401 `not_authenticated`，变更类校验 JSON Content-Type 与同源 Origin。
- `issuer_events` 只经 service_role `CompanyDb` 读取，发行人集合 = 用户 watch（未静音；或显式 `issuerId`）。
- 偏差（指挥决定）：`watch_not_found` 404；新建 201；收件箱 `issuerId` 参数；未读计数为扫描式（25×200 上限，超出给下界 `n+`）；HK 发行人可跟踪（`resolveIssuer`）。
- 实施偏差：路由测试里 `vi.mock('@/lib/company/db')` 改为展开 `importOriginal`，否则 `MAX_COMPANY_WATCHES` 缺失导致 500。
- 规格 §17 待记：未读计数无 SQL 计数函数（迁移已锁）。
| 13 | Task 13 指标视图 + 估值区、文件视图（F3 开关）、概览、判断视图（F4 开关）、跟踪接入点 | 7e0e2bef, bbace952, da249b6b | ✅（判断回放截止也查校准时间） | 修后通过（概览货币与缩放标注、未知表单类型、链接可访问性、flag 开无发行人提示） | review: P2 概览金额无单位、判断嵌套字段未校验会崩；挑战: P2 admin 抽屉跨视图、判断卡无证据链接；修复复审: P2 与 F4 §9.2 契约对齐（href 可空、computed_at 非必填） | 2 | 275+ 单测 |
| 16 | Task 16 跟踪 API（watches/read/import/inbox）+ inbox.ts | 519ffdc6, 18b06cfb | ✅（只经 service_role 读用户所跟踪发行人的事件；未跟踪 issuerId 在调用前 404） | 修后通过（未读计数只重扫未饱和发行人、合并发行人目标校验、cursor 错误码、CSRF/500 用例） | review: P2 导入 1000 行截断 → 全量分页 + 并发 8 解析、P2 大写 UUID；挑战: P2 同前；修复复审无缺陷 | 1 | 47 单测 |

## Task 17 跟踪页与公司页跟踪视图

- 页面 `/watchlist/tracking`；组件 `src/components/company/tracking/*`；公司页 `view=tracking`（CompanyPage 已接线）与页头 `TrackButton`（CompanyHeader 已接线，无需补线）。
- 偏差（指挥决定）："本页"= 已加载的全部行；收件箱数值不做抽屉；概念名缺标签时显示 id；移动端"管理"展开面板。
- 实施偏差（按指令跟随已提交 DTO / 概览做法）：事件金额不再按披露单位原样分组，而是与概览一致经 `defaultScale` + `formatValue` 缩放，并附 `unitCaption`（缩放 · 币种，如“亿 · CNY”）；`valueView`/`eventSummary` 增加 `locale` 参数，值为 `{kind:'value',text,caption}`。headline/from/to 的 withheld 标记读取 `.value`，`relChange` 可为 withheld 对象。
- 实施偏差：Step S 的纯逻辑抽到 `mark-scope.ts`（`marketRows`/`unreadIds`/`shouldApply`/`applyMarkResult`）并有测试；公司页与收件箱共用。收件箱在被选发行人被移除后自动回到“全部”。`TrackButton` 保留 Task 11 的失败关闭语义（401→登录提示，其他读失败→不可用）。
- 未显示"预计披露日"（决策 G 默认）。未做本机目视核对（需登录的本机栈），留给 Task 19 e2e。

## Task 18 覆盖目录

- `GET /api/companies`（公共、anon、无会话、无按用户字段）；`/intel/companies`（需登录，决策 H 默认）；`/intel` 研究页签入口卡；`isTabActive` 段前缀高亮。
- 偏差（指挥决定）：`q` 白名单字符集；`conceptsTotal` 由响应给出；空状态区分"无事实"与"无匹配"。
- 实施偏差：新鲜度条的 status 允许 null，经 `freshnessKey` 映射为"未知"（复用 `company.header.freshness` 文案）；“最近同步”只写时间与结果，不用状态色。

| 序 | 任务 | 提交 | 规格复审 | 质量复审 | Codex review / 挑战 | 修复轮次 | 备注 |
|---|---|---|---|---|---|---|---|
| 17 | Task 17 /watchlist/tracking 收件箱 + 公司页跟踪视图 | f4828691, d6ff101a, 5479a4af（深链参数接入报表视图） | ✅ | 修后通过（44px 触控、Tailwind 透明度修饰符对 var() token 不生效 → color-mix 全局替换、本地日分组、按钮语义） | review: P2 跟踪后视图不同步、筛选失败残留可操作；挑战: P2 headline 链接应用 headlineAsOf、折叠子项无链接；修复复审: P2 深链参数未被页面消费 → 接入 | 2 | 385 单测 |

| 18 | Task 18 /api/companies + /intel/companies + /intel 入口卡 | f7ebf011, 3449419f, b8b07321 | ✅（响应形状收回 §6.1 {total, conceptsTotal, rows}） | 修后通过（按语言显示名称并与 SQL 排序键一致、q 客户端校验、Seg/ErrorCard/scope、加载态） | review: P2 参数变化后残留旧结果；挑战: P2 证券富化 1000 行截断 → 分页到尽；修复复审: P2 缓存成功掩盖新失败 → 请求代次 | 2 | 721 单测（全目录） |


