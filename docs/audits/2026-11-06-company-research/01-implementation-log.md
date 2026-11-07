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
