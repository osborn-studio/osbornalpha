# Opus 5.5 实现审计处置

三轮 CLI 响应、输入清单及 SHA-256 见 `evidence/opus55-*`。第三轮原始报告 [在此](evidence/opus55-round3.md)，实际返回模型为 `claude-opus-5-5`，`is_error=false`，结论无 P0/P1。以下小修在第三轮返回后完成，本地全量测试/构建复验；没有把它们描述为再次获得 Claude 审计。

| 第三轮项目 | 核实与处置 |
| --- | --- |
| P2-1 时间精度/事务时间 | `serverTime` 实际使用 `clock_timestamp()`，不是事务开始的 `now()`；微秒精度问题有效。当前权威集合查询改为 owner 锁下所有已提交行，并用数据库时钟检查 provider fetched_at，as-of 查询仍保留历史边界。已有新快照冲突/旧回执重试测试通过 |
| P2-2 回执时钟/tie-break | 新增第 29 个迁移，INSERT 强制数据库时间；测试回溯时间被覆盖，同 provider fetched_at 时后冻结快照胜出 |
| P2-3 session 测试 | 改用固定 2099 年字面量，避免两次 clock_timestamp 的微秒差导致假阳性 |
| P2-4 HTTP 鉴权 | 原 transaction 已在 SQL/profile 前校验 UUID、会话 preAuth 也在 profile 前，因此报告的 500/账号枚举路径并不存在；仍将 bearer 正则收紧并测试 malformed/不存在 UUID 均返回 401。owner_scope 覆盖同时断言 403 和 scope_denied |
| P2-5 Replay | 校验 replay UUID、冻结观察哈希、回执幂等键和 owner；非法 replay ID 返回 invalid_schema，不进入 UUID SQL |
| P2-6 TAP 守卫 | 要求 pass=tests，TODO 不再假绿；仅从 stdout 解析官方 TAP 汇总，stderr 只展示。310 测试全量检查重新通过 |
| P2-7 Gateway 派生 OHLC | 不改动普通图表行为；S6 真实捕获/冻结拒绝 datagateway 来源并有拒绝用例。完整 Gateway 证据合同仍未实现，不主张该来源通过真实验收 |
| P2-8 探针表述 | limitations 明确 adapter_adjustment 不是上游不复权认证；保留实际请求时间/响应哈希，不改变探测结果 |

补充核实：固定 S5 包 `validateMarketSnapshot` 在 `src/engine/observation.js` 中调用 `fail(...)` 抛异常，不是返回 `{ok:false}`；未忽略失败返回值。

第一、二轮修复还包括：服务器重算并持久化结果、授权在昂贵计算/owner 锁前后检查、跨观察市场键冲突、导出全部原始行情证据、超过 100 项历史的独立回放查询、会话最大存活期、TRUNCATE 禁止、REL 重复展示曝光、浏览器丢回执重试和写入成功但刷新失败的分离提示。

未完成范围保持不变：实源拆股/历史可用时间证据、成熟观察实源窗口、真实 REL 授权/预算/结算、异地恢复与生产部署。上述项目不能由这次代码审计替代。
