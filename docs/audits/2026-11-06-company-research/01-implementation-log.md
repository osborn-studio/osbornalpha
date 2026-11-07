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
