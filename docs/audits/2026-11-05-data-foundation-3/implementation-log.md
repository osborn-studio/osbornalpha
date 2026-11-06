# 数据底座三 实施日志

计划：`docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md`（Codex 计划审计四轮，`docs/audits/2026-11-05-data-foundation-3-plan/`）。每任务：Sonnet 5.5 实施 → Opus 规格复审 → Opus 质量复审 → Codex review + 对抗挑战（gpt-6-astra，medium）→ 修复 → 记录。

| 任务 | 提交 | 规格复审 | 质量复审 | Codex 结论 | 修复轮次 / 备注 |
|---|---|---|---|---|---|
| 1a 迁移一表与约束 | 52c5414, 0fd6c74, 8c07f0b | ✅（偏差：两处注释改写；issuers 集成测试 helper 补 valid_to_method） | Approved（minor 4 项已修；`SCHEMA_BOOTSTRAP_SQL` 自 local-db.ts 导出） | review P2 curated valid_from_method；challenge P2 dfe 收件 id/日期成对 → 修复后 review 无问题 | 2 |
| 1b 迁移一函数与触发器 | 6fdef0d, 8c18dde, a651281 | ✅（偏差：首个声明测试先拒绝旧声明以避开 pending 唯一键） | Changes requested → 修复（证据键、ISIN 值守卫、NO KEY UPDATE、attach isin 来源、咨询锁测试、拒绝不校验 detail） | challenge P1 私有证据进公共 provenance、P2 锁序死锁、P2 attach 修订 ticker；review P2 定位串过滤 → 两轮修复后 review 无问题。迁移已锁但未合并，原地修改并更新锁 sha（两次） | 3 |
| 2a 数据集登记、weekly、看板下拉、raw-store | 73393c4, f324aa7, 5679252 | ✅ | Approved（minor：节奏取自清单、头注释；保留下拉回填当前选择——理由：请求在途时选项不丢） | review P2 已中止预算仍上传；challenge P2 sidecar 丢扩展名、凭据过滤 → 修复后 review 无问题 | 2 |
| 2b claim/1、provenance 白名单、attachSecurity 方法列、调用方迁移 | 6488aca, 2949f93, e48debb, fb4bc0a, 9a11f37 | ❌→✅（TS 校验须不宽于 SQL `claim_provenance_safe`；suggested_op 须为字符串） | Approved（minor 5 项已修） | challenge P1 URL 凭据绕过 ×2 轮、P2 not_found 丢证据、P2 重复提交丢 sources → 修复；review 无问题 | 4 |
| 3a GLEIF 子集、HKEX 名单解析、核对记录 | 7507df2, 5ec2289, aa7cd12 | ✅（偏差：nodim、实际表头、.xls 文件；均实测） | Changes requested → 修复（ISIN 占位不计拒绝、图例行 non_data、-OLD 计数器剔除、GLEIF 全坏校验位测试） | challenge P2 .xls 以 xlsx MIME 入桶 → raw-store/桶 MIME 增 xls（迁移一原地改并更新锁）；review 无问题 | 2 |
| 3b OpenFIGI 适配器 + 无 key 实测 | 4189b45, a27a7c1, 250a894, a6a9212, 39d7e3f | ❌→✅（verification.md 交易所码按实测补 UA/UP） | Changes requested → 修复（复用 createPacer/可中止 sleep、预算不足不退避、共享退避、字段类型校验、夹具存在断言） | challenge P2 失败响应未入桶、节流跨调用失效、EXCH_MAP 原型属性；review 轮 2 P2 读体失败不重试；轮 3 P2 排队请求越过退避、预算不足不发布退避 → 均修复，末轮无问题 | 4 |
| 4a 标识符写入规划与应用 | 3f28c93, 65484a9, 867e46a | ✅（偏差：共映射 attach 声明加证据注记） | Approved（minor 7 项已修） | review/challenge P1 跨 ISIN FIGI 歧义仍自动写、P2 既有 FIGI 吞掉候选、HKEX 更正基于错误现值、OpenFIGI 证据去重丢失 → 修复后 review 无问题 | 2 |
| 4b fill-identifiers 驱动、E1 覆盖、fill-cninfo-org-id 改写 | 2b9f900, 7c85a51, 1784cf7 | ✅（偏差：HKEX 按文件 MIME、makeBudget(null)、RawKind cninfo） | Approved（minor 5 项已修，内存 rpc 不复刻安全检查——注释说明） | challenge P1 cninfo provenance 覆盖丢失 → 新增 SQL `set_issuer_identifier`（迁移一原地改，更新锁）；P2 未命中响应未入桶、mtime 冒充下载日 → 修复；review 无问题 | 2 |
| 5a 持有区间回填、E2 | 1f679ac, 3181d65, 4e9d1db | ✅（commander 批准偏差：新增 SQL `set_security_window` 于迁移一原地，更新锁；规划只传单键 provenance） | Changes requested → 修复（声明 attach/backdate 加同一 ticker 咨询锁、隔离后仍尝试关闭、内存 rpc not_found） | challenge/review P2 冲突挂旧键、双冲突丢证据、短页截断、缺 .BJ、最早行竞态、新鲜度误判、tie 页静默截断 → 两轮修复后 review 无问题 | 3 |
| 5b resolveIssuer asOf + resolve 路由 | f044fea, e6bcbe6 | ✅ | Approved（minor 3 项已修；public-route 改用 asOf） | review 与 challenge 均无问题 | 1 |
| 6a SEC submissions 抓取/解析/证据脚本/分页实测 | 09b75c9, 1305fb8, 4f42c19 | ❌→✅（恢复计划定位串格式、`SubmissionFiling` 不加必填 index） | Changes requested → 修复（全进程单一 SEC pacer 覆盖 companyfacts、失败证据挂 sha/path、非 primary 不猜、自身行冲突改 window_conflict、dry-run 规范化） | challenge P2 缺失列表变 []、每次调用新 pacer、冲突证据缺快照；review P2 冲突定位串指向错误下标 → 修复后无问题 | 3 |
