# 双包联调 Opus 5.5 审计处置

使用 Claude CLI `claude-opus-5-5`、工具禁用。[首轮原始输出](opus55-pair.json)与[输入哈希](opus55-pair-inputs.json)提出一项 P1：非 XNYS 标的可使用 XNYS 日历返回结构通过。[聚焦复审](opus55-pair-final.json)确认该 P1 已关闭，未发现新的 P0/P1；复审输入哈希见 [清单](opus55-pair-final-inputs.json)。模型只读代码，没有运行测试。复审后的少量 P2 修改由本地用例验证，不冒称它们已获再次外审。

| 发现 | 处置 |
| --- | --- |
| P1 非 XNYS 标的 | 未发布提案限定 `target_listing_mics=["XNYS"]`；XHKG 测试要求 `market_identity_mismatch`。SPY 基准仍为 ARCX，实际 ARCX/XNYS 会话兼容性继续标未核验 |
| 清单未提交及指向资料未固定 | `POLICY-NEXT.md` 与 S6 README 加入清单；本轮源码、样例与清单同一提交，提交后用干净 worktree 再核验 |
| 提案状态未检查 | 双包检查要求 `unreleased` 且关闭真实评价；S7 核验检查输出状态 |
| 配对摘要未绑定提案 | 新摘要包含提案 JCS hash、日历 hash 和两腿 bundle hash；输出字段区分 JCS 与清单中的文件字节 hash |
| 两腿共用价格证据 | 真实模式下共用原始价格证据 hash 或完全相同 OHLCV 路径均降为 incomplete，单列原因；合成样例改用独立价格/身份证据 |
| 错误缺少腿别 | 文件读取与单腿内容检查的错误输出标记 target/benchmark，测试分别覆盖；配对语义错误由错误码表示 |
| 停牌与缺日混用 | 已说明不可用日增加 `documented_unavailable_sessions`；缺日仍列 `unaligned_sessions`，双包 CLI 覆盖退出码 2 |
| 父政策未核验 | 运行时核对提案父 hash 与冻结 v1 政策 JCS hash，日历版本和提案标识也核对 |
| 无会话可通过 | 单腿校验已要求 `sessions.length>0`；双包状态再要求 `aligned.length>0` |
| 条件性问题：非价格 kind、lowercase ticker | 单腿校验已要求价格引用指向 `kind=prices`，ticker schema 只允许大写；无需增加重复分支 |
| 相同 URL、不同字节 | 多证券原始响应可能来自同一端点，仅同 URL 不足以认定复制；保留字节/价格路径检查和未核验 blocker |
| 工作目录错误与 symlink 父目录诊断 | 无假通过路径；当前 README 要求从仓库根执行，CLI 以进程权限读取用户选定文件，不充当特权服务。后续接口实现再定义服务端路径策略 |

本轮不发布正式 `market-policy/2.0` 或新引擎，不开放真实行情评价；这需要实际供应商原件、许可、证券身份和交易日历核验。
