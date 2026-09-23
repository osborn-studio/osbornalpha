# S6 续做证据

本轮新增 REL fixture 预算与故障恢复、真实证券政策拒绝路径；不包含真实 Jev 调用、收费预算、真实行情验收或生产部署。

- 全量：151 文件 / 1,176 测试通过；30 个迁移从空库应用。见 `alpha-tests.log`。
- 构建、lint、类型检查通过，日志同目录。
- 第一轮 [Opus 5.5 审计](opus55.md) 发现三项 P1，保留原始报告，不覆盖。
- [修复复核](opus55-final.md) 确认三项 P1 已关闭，没有新的 P0/P1；两轮 JSON 均验证返回模型 `claude-opus-5-5`、`is_error=false`。每轮输入文件 SHA 见对应 inputs 清单。
- 复核要求的角色条件已在隔离库实际验证：runtime 无 superuser/BYPASSRLS、不是表 owner 成员、无可调用且修改 limits 的 SECURITY DEFINER 函数，见 `role-check.json`。这不代表已核查生产数据库。

## 处置

| 项目 | 结果 |
| --- | --- |
| choice 可被摘要枚举 | 公开事件仅对会计字段做摘要；三值穷举回归通过 |
| runtime 解除 hard stop | 数据库仅允许 owner/superuser 解除；运行账号拒绝测试通过 |
| 人工对账竞争丢回执 | late_receipt 持久化，差异触发锁停；原对账不覆写 |
| reserved 无恢复 | releaseRelReservation 仅释放未 dispatch 的预留；撤权后亦可恢复 |
| 行锁/advisory 死锁 | limits 触发器用 try-lock，返回 owner_busy_retry，实测并发拒绝 |
| 初始状态/预算可绕过 | 数据库 before insert 再验 reserved 初始状态与预算 |
| 对账重试 | 原人工回执摘要相同幂等，不同内容冲突；适配器完整回执不可被简化回执替代 |
| 故障诊断 | 数据库时间戳与 timeout/adapter_error/invalid_receipt 分类 |
| outbox 范围 | 核查现有 anchor.ts 仅本地文件追加回执；保留 fixture 标签 |
| 真实身份错误 | 捕获/冻结/新输入三处关闭非合成评估；真实 market 行数检查为 0；旧 synthetic Replay 仍通过 |

最后复核后的两项小修：记录 late_receipt_invalid，并约束 unknown 必须有 failure_code、故障分类只能留在 unknown/settled。已增加回归并重跑全量测试/构建；未对这两项小修另作外部模型复核。

`s6-initial.log` 保留一次失败的测试构造：测试用撤权触发器最初没有 operator 权限，按预期被 runtime 权限拒绝。已将该故障注入限定为本地测试 owner 的 SECURITY DEFINER，测试结束删除；不属于生产 migration。

下一步范围见 ../../POLICY-NEXT.md 与 ../../REL-READINESS.md。fixture 超时后的输出不会自动结算；必须人工回执对账。迟到差额进一步更正仍未开放，应保持 hard stop。工程整体仍不能宣告真实行情通过。
