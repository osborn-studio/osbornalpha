# S6 REL fixture 记账与真实 SPY 策略守卫审计

## 结论

没有发现 P0。核心安全属性都成立：

- `incurred` 状态在调用 adapter 之前已经提交。
- 重复请求不会再次调用 adapter。
- 同一 owner 的预算检查由 advisory lock 串行化。
- 状态转换由触发器限制，不能回退到 `released`。
- RLS 按 owner 隔离。
- 真实 SPY 在发起 fetch 之前就被拒绝。

发现 3 个 P1、若干 P2，另有一组测试缺口。只看代码不能证明这套机制已经可以用于真实流量，下面的修复也都只针对 fixture 和合成数据路径。

---

## P1

### P1-1 事件里的 `receipt_sha256` 可以反推出 REL choice，绕过 exposure 路径

**位置：** `rel-readiness.ts`，`runRelReadiness` 最后一个事务里的 `settled` 事件。

```ts
await event(db,actor,run,'settled',{actual_credits:r.actualCredits,receipt_ref:r.receiptRef,receipt_sha256:digest(receipt)});
```

- `receipt` 只有三个键：`{choice, actualCredits, receiptRef}`。
- 其中 `actualCredits` 和 `receiptRef` 已经以明文写进同一条 ControlEvent。
- `choice` 只有 3 种可能，所以任何能读到 `research_s4_records`（export、审计、报告）的人，把 3 种取值各算一次 `digest` 就能知道 choice。
- 这违反了"REL choice 不返回，只能走 exposure 路径展示"的前提，也就破坏了 blinding。

**修复：**
- 事件只对不含 choice 的部分做摘要：`receipt_sha256: digest({actualCredits:r.actualCredits, receiptRef:r.receiptRef})`。
- 如果需要保证 choice 的完整性，在 `research_s6_rel_runs` 里存加盐承诺：`choice_commitment = sha256(salt ‖ choice)`。`salt` 是 32 字节随机数，只放在 runs 表，不进入 records、outbox 或 audit。
- 补一条测试：对 ControlEvent 的 payload 遍历三种 choice 的摘要，断言都不匹配任何字段。

### P1-2 runtime 角色可以清除 `hard_stop` 这个锁存标志

**位置：** migration 中的 `grant update(hard_stop) on public.research_s6_rel_limits to alpha_s4_runtime;`

- 应用代码只会把 `hard_stop` 设为 `true`，但这条列级 grant 也允许 `true → false`。
- 任何持有 runtime DB 凭据的代码路径（bug、未来新增的函数、注入）都能解除 hard stop，从而重新打开 dispatch。
- hard stop 的作用就是"之后不再 dispatch"。它必须是单向锁存，只有 operator 能解除。

**修复：** 在现有的 `research_s6_rel_limit_lock` 触发器里加一段：

```sql
if tg_op='UPDATE' and old.hard_stop and not new.hard_stop and current_user='alpha_s4_runtime'
 then raise exception 'hard_stop_latched'; end if;
```

这个 migration 文件目前还没被 git 跟踪，可以直接改原文件，不需要新增 migration。如果本地库已经应用过，重建一次即可。

还要补测试：用 runtime 连接执行 `update ... set hard_stop=false`，应该被拒绝；执行 `update credit_limit`，应该因为没有列权限被拒绝。

### P1-3 调用仍在进行时被 `settleRelFixture` 结算，迟到的 receipt 会被静默丢弃

**位置：**
- `settleRelFixture` 允许从 `incurred` 结算。
- `runRelReadiness` 最后一个事务里，`if(run.state!=='incurred')return summary(run);` 直接返回。

**问题：**
- 允许从 `incurred` 结算是必要的，否则崩溃后留下的 `incurred` 没法恢复。
- 但如果 adapter 调用还在进行，operator 已经按 `actualCredits=2` 结算，随后 adapter 返回 `actualCredits=9`：
  - 这个真实回执既不写库也不留事件；
  - 超额没有触发 hard stop；
  - 账面少记了 7。
- durable accounting 的意义就在于回执不丢，所以这里是记账完整性缺陷。

**修复：** 在最后一个事务中，如果 `run.state!=='incurred'`，而且收到的回执有效：

1. 写入 `rel.readiness.late_receipt` 事件，包含 `actual_credits`、`receipt_ref` 和不含 choice 的摘要（同 P1-1）。不改 run 的状态。
2. 如果 `r.actualCredits > Number(run.actual ?? run.reserved)`，设置 `hard_stop=true`。实际 credits 和对账结果不一致时，按停止处理。

对应测试：让 adapter 阻塞在一个 deferred 上，期间调用 `settleRelFixture(2)`，再让 adapter 以 9 返回。断言出现 late 事件、`hard_stop=true`、run 的 `actual` 仍是 2。

---

## P2

### P2-1 停在 `reserved` 的 run 永远占用预算，且没有恢复路径

有两种触发方式：

1. **崩溃：** 第一个事务已提交、第二个事务尚未提交时进程崩溃。重试会走 `old` 分支，返回 `reserved`，且不做 dispatch。
2. **source 撤销：** 两个事务之间 source 被撤销，第二个事务里的 `observationFor` 抛错并整体回滚。run 留在 `reserved`，重试时第一个事务又会因 `observationFor` 失败。

结果是这部分预算被永久占用。`settleRelFixture` 只接受 `unknown` 和 `incurred`，所以只能靠 admin 手写 SQL 清理。这是 fail-closed（只会多占预算、不会少记），因此定为 P2。

**修复：**
- 在第二个事务里对 `observationFor` 抛出的 `fail()` 做 catch。它是 JS 错误，事务本身没有中止；为保险也可以用 savepoint。捕获后执行 `reserved→released`，写 `released` 事件，`reason: 'source_denied_before_dispatch'`，提交后返回 `released`。
- 新增显式 operator 函数 `releaseRelReservation(actor,key)`，只允许 `reserved→released`，写事件，`reason: 'operator_abandoned_before_dispatch'`。这是安全的：dispatch 前必须先提交 `incurred`，而 owner 锁会串行化状态转换。并发的第二个事务之后会看到非 `reserved` 状态，不会 dispatch。

### P2-2 limits 表的加锁顺序反转，可能死锁

- admin 执行 `UPDATE limits` 时，先拿行锁，再在 BEFORE ROW 触发器里等 advisory lock。
- runtime 事务先持有 advisory lock，在超额结算（或测试里的 `rel_test_stop`）时再去等这一行的行锁。

两者同时发生时 PostgreSQL 会检测到死锁并终止一方。如果 runtime 一方被终止，有效回执丢失，run 停留在 `incurred`。这不影响安全，但会丢失对账信息。

**修复：** 通过一个 SECURITY DEFINER 函数 `research_s6_set_rel_limit(...)` 修改 limits：先取 advisory lock，再 update。触发器只断言锁已持有（查 `pg_locks` 中本 pid 的 advisory lock），没有持有就拒绝。

### P2-3 数据库层没有约束插入时的状态和预算

- runtime 对 runs 表有 insert 权限，可以直接插入 `state='settled'`、任意 `actual`/`choice` 的行，这等于伪造账目。
- 预算不变量（`used + reserved ≤ credit_limit` 且未 hard stop）目前只由应用代码保证。

**修复：** 加一个 BEFORE INSERT 触发器：

- 要求 `new.state='reserved' and new.actual is null and new.choice is null`；
- 在同一个触发器里重新计算 `used`，并检查 `hard_stop` 和 `credit_limit`；
- 可选：给 `request_key` 加 `check (request_key ~ '^[A-Za-z0-9:_-]{8,128}$')`。

### P2-4 `settleRelFixture` 不幂等

- 如果提交成功但确认丢失，重试会得到 `revision_conflict`，调用方无法区分"已按同一回执结算"和"冲突"。
- 它也不像 adapter 路径那样拒绝多余的键：`digest(receipt)` 会把未校验的额外字段也算进去。

**修复：**
- 在 runs 表加 `receipt_ref` 列，加 unique 约束。
- 如果已 `settled` 且 `receipt_ref` 和 `actual` 都相同，返回 `duplicate`；否则报冲突。
- 对入参做精确键校验，只允许 `actualCredits` 和 `receiptRef`。

### P2-5 可诊断性不足

- `unknown` 事件没有记录原因分类（`timeout`、`adapter_error`、`invalid_receipt`），对账时无从判断。只记分类，不记回执内容，避免落入 P1-1 的泄露问题。
- runs 表没有服务端时间戳，比如 `reserved_at` 和 `state_changed_at`（用 `clock_timestamp()`）。有了它们，P2-1 的滞留检测才能按年龄进行。

### P2-6 REL fixture 事件会进入 outbox

`addRecord` 默认会写 `research_s4_outbox`。如果 outbox 有外部或上游消费者，fixture 记账事件会混进真实溯源流。

请确认 outbox 的消费方。如果它不是纯本地的，给这些事件传 `{outbox:false}`。注意：测试里的原子失败注入依赖 outbox 触发器，改了之后要换一个注入点，比如 `research_audit_log`。

### P2-7 真实 SPY 守卫是单 ticker 黑名单

`requireCurrentPolicy` 只拦截 `!synthetic && ticker==='SPY'`。但 frozen S5 引擎对所有证券都只接受 XNYS，所以任何在 NYSE Arca 等交易所上市的真实证券，只要 `stocks_universe` 里填成 XNYS，都能通过。目前真实路径还有 `ALPHA_S6_REAL_MARKET=1` 和 `authorized-provider` 两道门，所以定为 P2；一旦打开这个开关，就升为 P1。

**建议：**
- 真实证券一律 fail-closed（`rule_unsupported`），直到有一个带版本的 policy 和引擎，并附带上市交易所身份证据；或者改为经过核实的 XNYS 白名单。
- 不要改写现有 policy 或 exchange 标签。

另外还有两点：

- **已入库的真实 SPY 快照：** 守卫只作用于 freeze 和 capture。如果开关打开期间已经存进过 `synthetic=false` 的 SPY 快照，`prepareInput`、`currentMarketIds` 和 commit 仍然会用它们产生新评估。
  - 修复：在新 commit 或 prepare 路径上同样调用 `requireCurrentPolicy`。历史 Replay 保持可重放，但不作为当前授权依据。
  - 验收时跑一遍：`select count(*) from research_s6_markets where snapshot->'security'->>'ticker'='SPY' and (snapshot->'security'->>'synthetic')::boolean is not true`，结果应为 0。
- **缺一个引擎策略绊线测试：** 断言 frozen 引擎版本和它接受的交易所集合仍是 `['XNYS']`。引擎升级后测试会失败，迫使有人重新审视这个守卫，而不是自动放行。

---

## 测试缺口

1. **hard stop 断言不独立：** 在 overrun 用例里，下一次调用即使没有 hard stop 也会因 `used=10, +1>10` 被预算拦截。应让 overrun 后 `used` 仍低于上限，并直接查库断言 `hard_stop=true`。
2. **两个事务之间撤销 source：** 用 after insert 触发器撤销 binding，断言 `calls===0`，最终状态为 `released`（修完 P2-1 后）。
3. **P1-1 泄露：** 对 ControlEvent 做三种 choice 的摘要穷举，断言都不匹配。
4. **P1-2 锁存：** runtime 连接不能清除 `hard_stop`，也不能改 `credit_limit`。
5. **P1-3 迟到回执：** 调用进行中被结算、回执随后到达的竞态。
6. **P2-3 插入约束：** runtime 直接插入 `settled`/`released` 行应被拒绝。
7. **P2-4 结算重试：** 用同一回执重试 `settleRelFixture`，应返回 `duplicate`。
8. **`freezeMarket` 守卫：** `market.test.ts` 只覆盖了 `captureAlphaKline`，还要补：
   - `freezeMarket(..., 真实 SPY, 'authorized-provider')` 在进入数据库之前抛出 `rule_unsupported`；
   - 合成 SPY 仍然可以 freeze 和 Replay（集成测试已覆盖，建议显式断言）。

## 已确认不是缺陷

以下各项都符合你给出的前提：

- `incurred` 先于 dispatch 持久化；
- 重复请求和崩溃后重试都不会 dispatch；
- 同 key 并发时第二个请求只返回摘要；
- 预算竞态只有一个请求胜出；
- 状态转换触发器阻止 `unknown→released`；
- 超时后保留全部预留，不做推断性释放；
- 跨 owner 的 RLS 返回空；
- source 撤销后仍允许对账，且不展示结果；
- SPY 守卫位于 fetch 之前；
- 合成 SPY 基准可以继续 Replay。
