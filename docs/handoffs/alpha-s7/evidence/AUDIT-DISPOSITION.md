# Opus 5.5 审计处置

Claude CLI 实际模型 `claude-opus-5-5`，工具禁用；[原始结果](opus55.json)、[可读结果](opus55.md)、[输入逐文件哈希](opus55-inputs.json)。结论：供审版本无 P0/P1，提出 P2 改进。审计未执行测试，以下修改由本地回归验证，不冒称最终修改已获外部复审。

| 项目 | 处置 |
| --- | --- |
| P2-1 收盘前已取得未来收盘证据 | 价格原件、无有效收盘/停牌原件接收时间不得早于相应会话收盘。新增回归。availability 类型也可承载静态说明，其接收时间可早于收盘，不能替代价格原件；所有时间仍属未核验声明 |
| P2-2 URL token | 禁止查询串、fragment 和 userinfo；新增两项回归。原始请求参数在受控原件保留，不能塞进出处 URL |
| P2-3 时间自报 | 固定增加 availability_timestamps_unverified blocker |
| P2-4 synthetic 自报 | 固定增加 synthetic_flag_unverified blocker，文档禁止未来转换器据此授予合成通道 |
| P2-5 未来会话 | 查询含未收盘会话返回 future_input，不归类 missing；新增回归 |
| P2-6 CLI 错误/FIFO | 内容无效为 1、I/O/用法为 3；O_NONBLOCK 拒绝 FIFO，回归覆盖。依赖缺失等模块启动错误仍由 Node 报告，文档明确不保证该类失败为 JSON |
| P2-7 安装包与 tarball | 输出改为 vendor_tarball: unchanged，只声明被哈希核验的 vendor 文件。独立 verify-engine 脚本实际干净安装固定包并重算/Replay；证据另列 |
| P2-8 S4 清单 | 固定 contract-hashes.json 自身 SHA-256、非空表，strict parser 处理清单和 golden。strict 后转换 plain object 满足冻结引擎格式，不抹除重复键检查 |
| P2-9 交付覆盖 | manifest 列出 40 个选定文件，加入 package.json/package-lock.json。明确额外文档/日志不自动进入清单。成功前强制 cwd 等于脚本所在 checkout 根。README 补 CLI 回归命令，交付时提交源码 |
| 低优先级 no-op split/成本 | 拒绝 1:1 事件；覆盖/事件证据接收时间预聚合，减少 bar×event 重复日期解析。其余 provider 原件解析及 JSON pointer 诊断留后续版本，不影响不准入边界 |

本轮回归覆盖离线合同与 CLI；全量测试继续覆盖既有 PostgreSQL / HTTP。未修改生产行情接口，没有实源验收或生产部署。
