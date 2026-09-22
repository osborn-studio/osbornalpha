# S4a / S4b 本地验收

状态：**S4a / S4b 本地最小闭环完成，S5 可开工。** 源码 SHA：`9a36dba42943b202846bd99cfc185eb813b22e9e`。

最终验证：149 个测试文件、1,164 项测试通过（设置真实 PostgreSQL 集成环境）；typecheck、lint、build 通过。Opus 5 第三轮及最终增量复核均无具体残留 P0/P1。静态审查与实际执行测试分开记录。

[结构化验收结果](evidence/s4-acceptance.json) · [Opus 5 第三轮](evidence/opus-5-s4-round3.md) · [最终增量复核](evidence/opus-5-s4-final.md) · [第五站开工交接](HANDOFF-S5.md)

范围：真实本地 PostgreSQL、受控 S3.4 工程样例、代理操作的实际 Next/Chromium 页面。没有生产迁移、真实投资结论、行情收益或独立人工标签。

已执行：完整 25 个迁移、PA 独立候选校验、一次导入及重复导入、跨用户拒绝、同 CAS 两请求仅一成功、请求键冲突、延期保留原观察、故障注入 fsync 后 SQL ack 失败、独立新进程回执恢复、UI 真实服务与真实数据库（无 API mock）。

可重复的验证脚本：

- `scripts/s4/local-db.ts` 创建隔离本地 PostgreSQL；状态文件 0600，不输出密码。
- `scripts/s4/import-smoke.ts STATE BINDING PACK` 仅在空测试库使用获准包；不会创建授权。
- `scripts/s4/decision-smoke.ts STATE` 登记合成代理决定与冻结观察。
- `scripts/s4/anchor-smoke.ts STATE` SQL 故障注入与新进程恢复。
- `S4_TEST_STATE=STATE npm test` 实际执行 SQL 集成测试；未设置该变量时集成用例会跳过，不冒称数据库已验证。
- `scripts/s4/local-web.ts STATE` 运行受限本地 Next 验收服务；`scripts/s4/browser-smoke.ts STATE` 在真实 Chromium 检查页面与数据库。

自动测试 pack 每次用随机字节新建，只用于独立测试用户，不修改或提升旧 producer golden。固定的 S5 golden 明确 synthetic。完整静态审查仅传源码，不传候选正文、rights/grants、密码或截图材料。


## 验收记录与持久化

隔离合成候选 `d6885801-c783-4f6d-9be4-72d76ebf63f8`，实际冻结观察 `11e06e4f-0f44-4a0e-bdb5-1c285ac021f9`。观察保持 pending_start、结果 null；取得 local_receipt，不是独立可信时间戳。

数据库 dump、25 行最终摘要日志备份、浏览器截图及备份摘要存放在本机受控目录 `/Users/osborn/Library/Application Support/OsbornAlpha/s4-acceptance/20260922`。目录/文件为 0700/0600；它在 Alpha 数据库 data 目录与 Git 仓库之外，不上传材料。临时测试库的连接配置继续保留在原始 0600 state 文件，备份记录其路径，不把口令写入交接或命令输出。

## 审查处置和残余边界

- 首轮有效问题已修复：恢复回执逐字段重建核验、损坏 JSON 降级、去掉生命周期容量上限、Synthetic 双向隔离、UTF-8 引用边界、受控来源入口隔离、时钟与错误处理。
- 第二轮提出的 RLS P0 不成立：现有迁移的 owner policy 默认 TO PUBLIC；完整迁移与非 owner、非 BYPASSRLS 账号下的真实资料/公司/12 thesis 召回测试证明有效。SourceKey 始终为完整版本化 SourceRef 的 JCS digest；同文多传播、新版本及引用查询也已实测。
- 回执损坏会持久化 owner 隔离标记，即使尚无观察；停止新导入、揭示及决定，保留历史查看和审计。不会通过自动截断/重新签名恢复“可信”。整个 owner 链保守隔离是明示设计。
- 原有独立授权的同正文 Source 保留自身授权，兼容旧去重约束；新 S4 副本才加不可移除的 controlled-copy 标记。S4 路径仍独立重验候选授权。
- 剩余 P2：历史回执校验仍随累计日志增长，需 S6 分段/备份域优化；视图暴露每次追加是审计要求，不做丢记录式去重。现有候选列表上限 100、证券选项 1,000、召回范围上限 100，并明确记录截断及随机审查。
- 延用观察时，Decision.selection 中 null 表示本次未重选；观察的真实冻结范围以 observation_ref 指向的不可变 securities 为准。更换非空证券/公司/观点必须新观察。最后增量复核指出此语义应由下游保留。
- 冻结日历有限（2026–2028），无法覆盖新窗口时明确 data_insufficient；不得自动改写旧规则。新日历需新版本。
- 正常人工认证复用已有 Research admin 流程；真实浏览器验收使用仅能产生 agent 身份的本地 HMAC 适配器。没有验证真实 Supabase 云登录或独立人工判断。S5 可用 frozen golden/fake auth 开工；S6 负责真实认证、行情、部署与外部备份域。
