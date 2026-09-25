# REL 合成预算与恢复验证

本轮为 S6.4 工程增量：可注入合成 REL adapter、数据库预留/已调用/未知/结算状态、hard stop 与恢复验证。没有真实 Jev transport、付费账户或货币结算；`fixture_credit` 是测试额度，不能与 Alpha 既有货币预算混用或视为实测成本。

入口为 `src/lib/research/s6/rel-readiness.ts`，仅服务端函数，未开放浏览器或 evaluator RPC。默认使用 disabled；fixture 需要操作员在隔离本地库明确创建 `research_s6_rel_limits` 并关闭 hard_stop。没有配置或默认 hard_stop=true 时不调用 adapter。

## 状态和恢复

| 状态 | 占用额度 | 允许恢复 |
| --- | --- | --- |
| reserved | 完整预留 | `releaseRelReservation` 明确释放；尚未持久化 incurred，保证未 dispatch |
| incurred | 完整预留 | 不重试 adapter；有明确合成回执后 `settleRelFixture` 对账 |
| unknown | 完整预留 | 超时、抛错或无效输出均保留；不能自动释放或填 0 |
| settled | actualCredits | 相同对账回执幂等返回；不同回执冲突 |
| released | 0 | 已结束，重试不再 dispatch |

预留、incurred、结算各自与 S4 ControlEvent/audit/outbox 同事务提交。网络/adapter 阶段不持有数据库事务；因此结算失败时数据库保留 incurred，重启不会再次调用。额度检查和运行状态受同一 owner 锁保护。更新额度/hard_stop 也取得该锁；已在执行中的任务无法被 hard stop 追溯撤回。

请求固定 REL/fixture、授权合成范围、external_processing=deny、external_calls=0、超时和最大测试额度，不传入原文。输出仅接受 choice/actualCredits/receiptRef 三个字段；额外动作指令不会执行，也不会按成功结算。超预留回执按实际额度保存并打开 hard_stop，不能截小费用来制造余额。

hard_stop 为锁存标志：runtime 只能设置，不能解除或提高额度。操作员修改 limits 若遇 `owner_busy_retry` 应在当前任务结束后重试，避免行锁/owner 锁顺序反转。数据库同时约束初始 reserved 状态及总额度，不能直接插入 settled 绕过预留。reserved_at/state_changed_at 由数据库记录；unknown 记录 timeout/adapter_error/invalid_receipt 分类，不保留错误中的私有原文。

人工对账与在途 adapter 回执发生竞争时，迟到的有效回执追加 late_receipt；与已对账额度不同则锁停，不能静默丢弃或覆盖原对账。迟到差额的进一步更正流程尚未开放，不应解除停机来绕过差异。事件摘要只覆盖会计字段，不含只有三种可能的 choice，避免通过穷举摘要提前看到影子结果。

对账后返回的无效回执记录 late_receipt_invalid 分类。超时后 adapter 才完成的结果不自动结算，仍需显式回执对账。幂等对账仅指重试同一次 `settleRelFixture` 回执；已由 adapter 正常结算的完整回执含 choice，不能用简化的人工会计回执替代，调用会返回 idempotency_conflict。

会计接口只返回状态和额度，不返回 choice。未来显示 readiness 结果必须另外接 ExposureEvent 路径；当前已有 `runRelFixture` 展示路径仍负责每次展示的暴露记录。两条路径均不改写正常 ChangeCard、Wiki、Prompt 或冻结 Observation。

## 本地验证

实际隔离 PostgreSQL 覆盖：缺配置拒绝、预留后再 dispatch、同 key 不重复执行、改变 body 冲突、超时保留额度、重连后不重发、跨 owner RLS、未知费用禁止释放、显式对账、超额 hard stop、调用前 hard stop、结算 outbox 写失败整体回滚、并发预留单胜、带注入字段的无效输出隔离。

新增审计回归还覆盖：来源撤回后释放尚未 dispatch 的预留、相同对账回执幂等、迟到费用回执留存并锁停、runtime 不能解除停机/提高限额、事件摘要不可用三种 choice 穷举还原，以及数据库初始状态约束。outbox 的现有消费者只追加本地文件回执，无外部模型/上游投递；fixture 标签保留在 ControlEvent 中。

运行方法与 S6 一致：新建本地测试库，设置其 `S4_TEST_STATE`，运行 `npx vitest run src/lib/research/s6`。不要将该测试库状态文件或连接凭据写进仓库。

## 尚未完成的真实运行前置

真实账户/费用授权、账户全局预算或明确不重叠子额度、真实币种整数单位及费率版本、允许出站的材料范围、真实 adapter 和可验证供应商回执仍未接入。这些条件未满足前 `mode:shadow` 必须拒绝；本模块不能作为绕开 Alpha 既有货币预算的入口。Jev 实测状态仍为 not_run。
