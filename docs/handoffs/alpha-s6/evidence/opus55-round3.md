# S5/S6 最终修订复核（只读，未使用工具）

**结论：没有发现 P0 或 P1。** 下面都是 P2 级别的具体缺陷或测试缺口。范围仍然只是本地合成 PostgreSQL，没有部署，没有调用付费或实时 Jev，也不主张真实市场验收。这些发现都不需要扩大范围，也不需要生产部署。

## 已确认闭合

- **市场 ID 双时点校验**：`as_of` 和 `now` 两个时点都要匹配当前市场 ID。后冻结快照测试的第二个断言确实覆盖了 `now` 这一支。
- **写入服务端结果**：写入的是 `authoritative`、`computed.result` 和 `computed.result_sha256`。
- **幂等重试**：完全相同的重试在时间校验之前返回 `duplicate`，但仍会重新检查当前授权。
- **REL 重放**：每次重放都会追加 ExposureEvent（测试断言 `count+1`）。
- **Replay 校验**：先写曝光记录，再校验，任何失败都会整体回滚。
- **市场探针与 REL 边界**：探针标注为 `capability_only/not_passed`，`datagateway_called:false`，没有伪造拆股证明。REL 只支持 disabled/fixture，没有推断出任何 transport 或 billing 能力。

## P2 发现

**P2-1 `now` 校验受精度和事务时间影响** — `src/lib/research/s6/store.ts`（`commitEvaluationResult` 里的第二个 `currentMarketIds` 调用）
- `new Date(now).toISOString()` 会把数据库的微秒 `fetched_at` 截断到毫秒。同一毫秒内较早写入的快照会被排除掉。
- 如果 `serverTime` 返回的是事务开始时间 `now()`，而不是 `clock_timestamp()`：在本事务等待属主锁期间已提交的冻结，其 `fetched_at` 会大于这个 `now`，于是被排除。结果是用过期的快照集合被接受。
- **修复**：`now` 这一支不要用数据库 `fetched_at` 做上界。在属主锁下，所有已提交的行本来就可见，只保留 `snapshot->>'fetched_at' <= 服务端时间`。或者把 `serverTime` 的原始字符串直接传进 SQL，不要经过 `Date` 转换。
- **测试**：让一个 commit 事务阻塞在属主锁上，同时让 `freezeMarket` 先提交，断言结果是 `source_version_conflict`。

**P2-2 “数据库接收时间”可以被调用方写入** — `supabase/migrations/20260922100000_research_s6.sql`
- `research_s6_markets.fetched_at` 和 `research_s6_evaluations.created_at` 只是默认值。runtime 角色有 INSERT 权限，可以显式写入回溯的时间。这会让“tie-break 按数据库接收时间”失去意义。
- **修复**：参照 session 的做法，加一个 BEFORE INSERT 触发器，强制 `new.fetched_at` 和 `new.created_at` 等于 `clock_timestamp()`。
- **测试缺口**：目前没有测试覆盖 tie-break 本身。需要补一条：冻结两个 provider `fetched_at` 相同的快照，断言后冻结的那个在 `currentMarketIds` 中胜出。

**P2-3 session 时间戳测试证明不了触发器生效** — `src/lib/research/s6/store.integration.test.ts`（最后一条 insert）
- 当前写法是 `created_at=clock+1day, expires_at=clock+25h`。即使没有触发器，第二次 `clock_timestamp()` 也比第一次晚几微秒，照样会违反 `s6_session_max_lifetime`。所以这条测试在旧代码上也能通过。
- **修复**：改用固定字面量，例如 `created_at='2099-01-01', expires_at='2099-01-01 00:30'`。没有触发器时约束会通过，有触发器时会被拒。或者插入一条合法行，再断言存下的 `created_at` 近似 `clock_timestamp()`，而不是调用方传入的值。

**P2-4 HTTP 鉴权映射有 500 缺口** — `src/lib/research/s6/http.ts`
- 正则 `[0-9a-f-]{36}` 会接受非 UUID，比如 36 个 `-`。这个值作为 `userId` 进入 `transaction` 后会触发 pg 22P02 错误，映射成 500 而不是 401。
- 对于合法但不存在的 UUID：如果 `transaction` 在执行 `authorizeSession` 钩子之前先做 profile/role 检查，就会抛 `ResearchForbidden`，映射成 403。这会暴露账号是否存在，状态码也不对。
- **修复**：把正则改成严格 UUID。
- **测试**：malformed 前缀和随机未知 UUID 前缀两种情况都应断言 401 且 code 为 `not_authenticated`。
- 另外，owner_scope 覆盖那条测试只断言了 `status 403`，建议同时断言 `error.code`，避免被其他 403 分支意外满足。

**P2-5 Replay 输入校验不完整** — `src/lib/research/s6/report.ts`
- `replayId` 没有做格式校验，非 UUID 会得到 pg 22P02 和 500。应该复用 UUID 正则，返回 `invalid_schema`。
- 缺少 `selected.input.observation_sha256 === o.payload_hash` 的检查，冻结登记和当前观测没有被绑定。
- 缺少 `receipt.idempotency_key === selected.idempotency_key`，以及 `receipt.owner_scope.user_id === actor.userId` 的检查。
- **测试**：用 admin 绕过不可变触发器不现实，所以至少补上非法 `replayId` 返回 422 这一条。

**P2-6 Node 22 TAP 测试守卫可能误判为通过** — `OSanalyst/scripts/test-summary.js`、`OSanalyst/scripts/assert-tests-ran.js`
- 失败的 `{todo:true}` 测试只计入 `# todo`，不计入 fail。例如 `tests 308 / pass 307 / fail 0` 仍然能通过守卫。
  - **修复**：增加 `todo` 计数并要求为 0，或者要求 `pass === tests`。
- 汇总是从 `stdout + stderr` 中取最后一次匹配。stderr 被拼接在后面，如果其中出现行首的 `# fail 0` 之类，就会覆盖真实汇总。
  - **修复**：只解析 `result.stdout`，TAP reporter 的汇总就写在那里。
- **测试**：在 `tests/unit/test-summary.test.js` 补两个用例：
  - `# todo 1` 且 `pass < tests` 必须被拒；
  - 在 stdout 汇总之后追加一个伪造的 stderr 汇总，结果必须以 stdout 为准。

**P2-7 DataGateway 由收盘价派生的 K 线没有标记** — `src/lib/data/sources/datagateway.ts`（`parseDatagatewayDailyKline`）
- 纯收盘价数据被转换成 `open=前收, high/low=max/min, volume=0`，返回的 `SourceKlineSeries` 却和真实 OHLC 结构完全一样，还声称 `volumeUnit:'shares'`。
- 如果 Alpha `/api/kline` 的回退链走到了 DataGateway，`captureAlphaKline` 抓到的就是看起来像真实 OHLC 的数据。
- 目前真实市场路径受 `ALPHA_S6_REAL_MARKET` 保护，并且没有主张验收，所以不定为 P1。
- **修复**：在 series 上加 `derivation:'close_only'`（或同类标记），并让 `mapAlphaKline` 或 S6 冻结流程拒绝这种数据。
- **测试**：close-only 负载输出必须带上这个标记，而且 S6 映射必须拒绝它。

**P2-8 探针报告没说明复权是适配器硬编码的** — `scripts/s6/probe-public-market.ts`、`docs/handoffs/alpha-s6/evidence/public-market-probe.json`
- 字段名 `adapter_adjustment` 本身区分得对，但 `limitations` 里缺少一句明确说明。例如：“`adapter_adjustment: 'none'` 由适配器硬编码，不是上游对未复权数据的认证。”
- 建议补上这一句。当前关于检索时间和历史发布可用性的区分已经写对，不需要改。

## 需要顺手确认的一点（不单列为缺陷）

`validateMarketSnapshot(...)` 在 `src/lib/research/s6/market.ts` 里没有使用返回值。如果它和 `validateCommit` 一样失败时抛异常，就没问题。如果它像 `mapAlphaKline` 那样返回 `{ok:false}`，这次校验就不起作用。建议补一条单测，把未来时间或非法快照传给 `freezeMarket`，断言被拒。
