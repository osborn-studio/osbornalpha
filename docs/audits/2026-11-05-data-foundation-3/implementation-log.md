# 数据底座三 实施日志

计划：`docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md`（Codex 计划审计四轮，`docs/audits/2026-11-05-data-foundation-3-plan/`）。每任务：Sonnet 5.5 实施 → Opus 规格复审 → Opus 质量复审 → Codex review + 对抗挑战（gpt-6-astra，medium）→ 修复 → 记录。

| 任务 | 提交 | 规格复审 | 质量复审 | Codex 结论 | 修复轮次 / 备注 |
|---|---|---|---|---|---|
| 1a 迁移一表与约束 | 52c5414, 0fd6c74, 8c07f0b | ✅（偏差：两处注释改写；issuers 集成测试 helper 补 valid_to_method） | Approved（minor 4 项已修；`SCHEMA_BOOTSTRAP_SQL` 自 local-db.ts 导出） | review P2 curated valid_from_method；challenge P2 dfe 收件 id/日期成对 → 修复后 review 无问题 | 2 |
| 1b 迁移一函数与触发器 | 6fdef0d, 8c18dde, a651281 | ✅（偏差：首个声明测试先拒绝旧声明以避开 pending 唯一键） | Changes requested → 修复（证据键、ISIN 值守卫、NO KEY UPDATE、attach isin 来源、咨询锁测试、拒绝不校验 detail） | challenge P1 私有证据进公共 provenance、P2 锁序死锁、P2 attach 修订 ticker；review P2 定位串过滤 → 两轮修复后 review 无问题。迁移已锁但未合并，原地修改并更新锁 sha（两次） | 3 |
| 2a 数据集登记、weekly、看板下拉、raw-store | 73393c4, f324aa7, 5679252 | ✅ | Approved（minor：节奏取自清单、头注释；保留下拉回填当前选择——理由：请求在途时选项不丢） | review P2 已中止预算仍上传；challenge P2 sidecar 丢扩展名、凭据过滤 → 修复后 review 无问题 | 2 |
| 2b claim/1、provenance 白名单、attachSecurity 方法列、调用方迁移 | 6488aca, 2949f93, e48debb, fb4bc0a, 9a11f37 | ❌→✅（TS 校验须不宽于 SQL `claim_provenance_safe`；suggested_op 须为字符串） | Approved（minor 5 项已修） | challenge P1 URL 凭据绕过 ×2 轮、P2 not_found 丢证据、P2 重复提交丢 sources → 修复；review 无问题 | 4 |
