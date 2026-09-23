# 复审结论：之前 3 个 P1 已关闭，没有发现新的 P0/P1

## 之前的 P1 逐项确认

**1. 公开事件摘要可被暴力枚举出 REL 选项：已关闭**
- 三条事件路径（`settled`、`late_receipt`、`reconciled`）的 `receipt_sha256` 现在都只对 `{actualCredits, receiptRef}` 做摘要，不含 `choice`。所以无法再用三个候选值逐一比对。
- `settleRelFixture` 的入参 schema 只接受这两个键，外部没法把 `choice` 塞进去。
- 包含 `choice` 的完整 `receipt_hash` 只存在 runs 表里。这张表受 RLS 限制只有 owner 能读，而 owner 本来就能直接看到 `choice` 列，所以不算新增泄露。
- 测试里有"事件摘要与三种 choice 的摘要都不相等"的断言，覆盖了这一点。

**2. 运行时可以重置 hard_stop：已关闭**
- 运行时角色没有 limits 表的 insert/delete 权限，也没有 `credit_limit` 的 update 权限，只能改 `hard_stop`。
- 触发器规定：只有表 owner 或 superuser 才能把 `hard_stop` 从 true 改回 false。
- 这个结论有两个前提，我这次没能核实（本轮只读、没用工具），建议你自己确认一下：
  - `s4_app` / `alpha_s4_runtime` 不是表 owner 角色的成员，也没有 BYPASSRLS 权限；
  - 生产环境里没有由表 owner 拥有、运行时又能调用的 SECURITY DEFINER 函数去改 limits 表。否则在这类函数里 `current_user` 就等于 owner，会绕过检查。测试里的 `rel_test_revoke` 只在测试中存在，可以忽略。
- try-advisory 的设计是对的：运行时事务的包装层已经持有同一把 owner 锁，而 advisory 锁可以重入，所以运行时自己的 latch 更新不会被误拒；只有并发的外部会话会立刻收到 `owner_busy_retry`，而不是互相等待形成死锁。

**3. 并发对账丢弃迟到回执：已关闭**
- 当 run 状态已经不是 `incurred` 时，有效的迟到回执现在会落一条 `late_receipt` 事件（不含 `choice`）。如果它的金额和已对账的 `actual` 不一致，就会触发 latch。
- 此时唯一能出现的状态是 `settled`：`unknown` 只能由这个函数自己写入，而从 `incurred` 不能转到 `released`。所以 `run.actual` 一定有值，金额比较逻辑成立。

## 附带检查，未发现问题
- DB 的状态转换触发器要求每次 update 都必须改变状态，所以 settled 之后无法再补写 `choice` 或 `actual`。
- insert 初始状态有保护，预算在 DB 层做了二次校验。
- `state_changed_at` 由 BEFORE 触发器写入，不受列级 update 授权的影响。
- 真实标的：`captureAlphaKline`、`freezeMarket`、`inputFor` 三处都已关闭。`authorized-provider` 加 synthetic 标的的组合会被"security.synthetic 必须与 observation 一致"这条规则挡住。现存的真实 market 行数经断言为 0。

## P2（简要，不扩大范围）
1. **无效的迟到回执被静默丢弃。** 对账胜出后，如果 adapter 返回的回执无效、超时或报错，既不记事件也不触发 latch。建议至少记一条 `late_receipt_invalid` 审计事件。
2. **adapter 路径结算的 run 永远无法做幂等对账。** 这类 run 的 `receipt_hash` 含 `choice`，之后调用 `settleRelFixture` 必然返回 `idempotency_conflict`。行为安全，但语义容易误导，建议在文档里写明。
3. **`failure_code` 缺少状态约束。** DB 只要求 `failure_code` 取值合法，没有限制它只能出现在 `unknown` 状态，也没有要求 `unknown` 状态必须带 `failure_code`。可以补一条 check。
4. **`unknown`（超时）之后，adapter 的真实结果不会被接收。** 这是"必须显式对账"的既定设计，fixture 本身也是可信的，只提一句。

## 结论
在上面第 2 项的两个前提成立的情况下，这一轮 fixture 范围可以通过，没有阻断项。
