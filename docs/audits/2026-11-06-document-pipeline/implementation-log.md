# F3 implementation log

Task 19 定稿于 2026-11-07（America/Los_Angeles；首次全量测试始于 11-06 23:56）。实施前 HEAD：`e64ad7f7de9667db747494b3bb786034df2cd91b`；基线范围 `6bf490c..HEAD`。本次只改文档、日志与审计归档；未改代码、兄弟模块或 migrations.lock.json。

以下每任务一行汇总原记录与后续修复。审计文件保留当时结论，常是“fail → 修复提交”；没有独立终审通过证据的任务不伪记为全绿。原实施逐步日志可从前一提交追溯。共同本次门禁结果见下表，不把历史沙箱数字当作本次实测。

- Task 1：迁移一、权限/状态机、UTF8 harness；提交 `c78fd420`、`ba92c1ea`、`907bd562`（审计归档 `d7b8f62c`；重编号 `388ae30c`）；原 Opus 规格/质量复审及 Codex challenge/recheck 的 NULL eligibility、period roles、cursor reset、renew coverage 已有修复；锁延至最终门禁，当前未锁。
- Task 2：契约、Supabase/内存 DB；提交 `234c037c`、`90cb28b7`、`87598151`（后续共享 mapper `78c63d88`）；Codex review/challenge/recheck 的原子写入、资产上限、scope 先验后改、微秒时间戳与 exact ratio 修复；共享契约测试保留。
- Task 3：pg DB 与 >1000 分页；提交 `731b7252`、`6a39e112`、`c0257d34`；Codex review/challenge/recheck 后修复时间戳归一/无效值与 pg 对齐；本次 DB 契约测试由 commander 续跑，不以 skipped 证明通过。
- Task 4：ObjectStore、精确十进制、pdfjs-dist；提交 `e588b541`、`d2d9dc95`、`59a37c10`；Codex review/challenge/recheck 后修复路径/字节/MIME 完整性、错误归一及 smoke 的文件系统资产路径；托管 Storage smoke 仍待 owner。
- Task 5：分类与 scope；提交 `d1e02408`、`8fde036a`；Codex review/challenge 后收紧 cninfo/HKEX 锚定、无后缀 zh、merged 排除、scope_confirmed_at 与短页遍历；scope 并发保护已落 SQL/内存/pg。
- Task 6：三来源适配器；提交 `e6893cff`、`2fec09ea`；Codex review/challenge 后加来源 allowlists、重定向、SEC UA 分流、完整性/限速/Retry-After；HKEX lang=en、cninfo category 留 owner 验证；EDGAR flag 仍 false。
- Task 7：同步核心；提交 `2eae37c1`、`d7895e4b`、`14b509ec`，SQLSTATE mapper 协同在 `78c63d88`；Codex recheck 的 2 P1/2 P2（基础设施误计尝试、quarantine 重放、release 失败、同哈希异发行人）均有对应修复和回归测试；按 ref 游标和 holder-only renew 已落地。
- Task 8：sync 装配/脚本/cron；提交 `2a5b3328`、`7ee68632`，共享 flags 在 `78c63d88`；Codex review/challenge 后修复门控、dry-run scope 与期限；vercel 仅三条 sync，默认开关关闭。
- Task 9：PDF/HTML/表格与 canonical pages.json；提交 `cfa00094`、`93940410`、`c617d50a`；Codex recheck 的 4 P2（误附标签、数字跨列拼接、年份词误判、注释 meta charset）有对应修复；真实布局还须 gold/preview 验证。
- Task 10：引用、worker 抽取、lease、preflight、脚本；提交 `3af98ad9`、`78c63d88`、`e7178d6f`；Codex recheck 的 4 P2（manifest tracing、注入客户端 deadline、响应体 deadline、terminal hash mismatch）均在后续修复；部署 worker/CJK/OOM smoke 未执行。
- Task 11：公共读/重处理/i18n；提交 `949890fe`、`a5c3ef52`，cursor-validation recheck 在 `78c63d88`；Codex review/challenge/11–12 recheck 后严格参数、游标值校验、successor 查找与权限/缓存修复。
- Task 12：licensed/private 上传与持有人读取；提交 `02e20195`、`570dbe7a`；Codex review/challenge/11–12 recheck 确认 upload_conflict、batchError、filename/许可限制与跨文档 extraction 防护；owner 读取审计失败仍不返回内容。
- Task 13：迁移二与 HkFactsPort；提交 `9cce0513`、`11126ba6`（重编号 `388ae30c`）；Codex review/challenge 后证据精确等于候选、market-aware source/origin、period≤64 与分页；保留 generic publish_sync_run 绕过证据的已知 residual risk 和 spec-2 接口请求。
- Task 14：HK 候选/标签/单位/期间与 F3_INFO_CODES；提交 `c4696527`、`2b587b9c`；Codex review/challenge 后修复双语冲突、未命中标签、EPS 子单位/币种证据与 BS 交错日期；不把歧义猜成数值。
- Task 15：确定性检查与 candidates/auto；提交 `1e0ecb68`、`f00ab001`；Codex review/challenge 后增加 label/period 重放、完整候选集 identity、缺输入 applicable:false、先 findings 后资格、auto 预算与主语言限制、zh/en 顺序独立；缺输入为明确跳过而非通过（不采纳“缺任何输入即全阻断”的建议）。
- Task 16：HK 晋升与候选 cron；提交 `5c576f73`、`4dc8553b`；Codex review/challenge 的 1 P1/1 P2 引出 pub_gen_required、版本组合钉住、due 资格/last_attempt_at 公平排序与逐发行人失败隔离；零输出代激活的审核空窗仍待 owner 决策。
- Task 17：候选/审批/撤销/再生/HK 裁决/事实引用；提交 `b5148de1`、`394404d9`，finalize 接线在 `f00ab001`/`ff8912f5`；Codex fix audit 原四项 CLOSED，新 T17-05 在 `ff8912f5` 接 production RPC/deadline/clock；MiniMax T17-07 由 commander 因已有 90s 前置预算拒绝，见 calibration。
- Task 18：四个 F3 critical 套件、录制 0268 子集、gold 模板、eval/validation；提交 `3759910f`、`ff8912f5`、`e64ad7f7`（merge 测试作用域修复 `388ae30c`）；Codex audit 六项在 ff8912f5 修复；MiniMax 接受项（缺 gold 文档/逐条覆盖/混版本/CLI 入口）在 e64ad7f7 修复，T18-03 被 commander 拒绝（有意 always-on 离线夹具层）；独立 gold ready:false，不能宣称真实财务验收完成。
- Task 19：runbook、仅 spec §17 的偏差/接口/风险表、此逐任务日志、所有原 untracked 审计文件及本次 gate 日志；提交为包含本行的唯一 `docs(documents): runbook, spec §17 deviations, implementation log (Task 19)`（自身 SHA 由提交后报告，不自引用）；文档交叉核对完成；npm test 失败（5838 pass/5 fail/594 skip + 1 error）、typecheck 0 错、lint 0 错/0 warning；两 timing 文件单独复跑 48/48；DB/锁/构建/生产验证未执行。

## 混合提交与审计归档

- `78c63d88` 标题是 Task 10，同时包含 Task 11 cursor-validation recheck（db.ts、pg mapper、read-routes 测试）和 Task 7 `toDocumentsDbError` 保留 sqlstate 的修改；不能只按提交标题分配归属。
- 委托中的示例称 `a5c3ef52` 含 Task 7 db.ts mapper，但实际 `git show --stat a5c3ef52` 仅七个 public route/read-route/test 文件，没有 db.ts；该 mapper 的可核查归属是 `78c63d88`。本日志以提交内容为准。
- `ff8912f5` 同时修 Task 17 hook repair 与 Task 18 eval/validation/public integration；`388ae30c` 同时重编号两迁移并修合并后的测试作用域。
- 计划轮次 01–11（六轮报告与五份 dispositions）最终 11 为 ready；这是计划审计，不代表 Task 19 的全门禁/生产已通过。Tasks 1–9 部分归档集中在 `d7b8f62c`、`74e941c7`；本次提交剩余 Task 7/9/10–18 review/challenge/recheck/audit/prompt 与 Kimi/MiniMax 原记录，保留历史 fail 与 commander calibration。

## Task 19 gate（本次实测）

执行环境实际为 Node `v26.5.0`、Vitest `4.1.11`（日志打印），不同于 package.json Node >=22.19.0 <23；没有更改运行时/依赖/配置来规避门禁。commander 应在规定 Node 22 与可监听的环境完成最终 gate。未出现 anchor-two-phase/anchor-store 的 FileHandle GC flake，无该 flake 重跑。

| 命令 | 退出码 | 精确计数 / 结论 | 证据 |
|---|---|---|---|
| `npm test` | 1 | 文件 523 passed / 6 failed / 39 skipped = 568；测试 5838 passed / 5 failed / 594 skipped = 6437；另 1 unhandled error；100.69s | [原输出](task19-test.log) |
| `npm run typecheck` | 0 | 0 TypeScript errors；无测试计数 | [原输出](task19-typecheck.log) |
| `npm run lint` | 0 | 0 errors、0 warnings（--max-warnings=0）；无测试计数 | [原输出](task19-lint.log) |
| `npm test -- src/lib/research/fanout/calibration.test.ts src/lib/macro/replay.test.ts` | 0 | timing 故障隔离复跑一次：2 files passed、48 tests passed、0 failed/0 skipped；44.21s | [原输出](task19-timing-rerun.log) |
| `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db` | 未执行 | 0 executed；commander 负责，sandbox 不能监听端口 | 本次任务边界 |
| `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations` | 未执行 | 0 executed；commander 负责 | 本次任务边界 |
| `npm run check:migration-history` / `npm run build` | 未执行 | 原 T19 后续 gate；用户本次只授权执行前三项 | 不宣称通过 |

失败逐项（均未改代码）：

1. `src/lib/dq/datasets.test.ts`：已知 origin/main 上游失败，命中 `src/lib/macro/db-contract.ts:279` 的硬编码 dataset；本次仍复现。
2. `src/lib/research/migration-history.test.ts`：tsx CLI 创建 IPC pipe 被 sandbox `listen EPERM` 拒绝。
3. `src/lib/data/sources/tushare-timeout.test.ts`：真实 localhost body-stream 测试 `listen EPERM 127.0.0.1`。
4. `src/lib/research/s6/market.test.ts`：同一监听限制导致 suite hook 10,000ms 超时及 1 个 unhandled socket error（解释 6 failed files 而只有 5 failed tests）。
5. `src/lib/research/fanout/calibration.test.ts`：全量负载下计时 6833ms 超过 <4000ms；隔离复跑通过。
6. `src/lib/macro/replay.test.ts`：US replay 全量时 60,000ms 超时；隔离复跑通过。

**总门禁未通过。** 两个 timing 重跑不能抹去首次全量失败，DB 两 gate 未执行；本次未锁两份 F3 迁移。commander 在最终门禁全部通过后才追加锁条目（sha256 取文件字节，追加末尾），并继续 history/build 验证。

## 未完成（owner / commander；PR body 交接）

- 运行两 DB gate、在规定 Node 22/可监听环境完成全门禁与锁；生产先应用两份 20261115 迁移、关闭三旗部署、各来源 --apply --limit 5，再开 sync。
- Preview 验证 bundle+manifest traced 文件起 worker、CJK CMaps、最大报告页数/耗时/内存、Storage duplicate/signed URL、生产 PostgREST 分页；通过后按 runbook 分别加 extract/candidates cron 并开独立开关。
- 0268 子集夹具已提交；真实 HKEX lang=en/_e.pdf、cninfo category、EDGAR 历史列形状及 fixtures/flag 提交、每来源 3 家 dry-run、首 20 家容量测量仍待留痕。EDGAR files[]/Archives index 形状的 2026-11-07 live 核对为 commander 提供，本次未联网复验。
- 独立抄录完整 gold 并评测/真实字节验证；owner 决定自动审批（默认无）、容量、许可/片段、HKEX 周期重核验，以及 §4.11(d) 空代隐藏旧事实而候选仍待审核的语义；上线后 5% 引用抽样。
- 规格二接口：.HK facts/filings/citations=1、HK metrics basis/物化与 state_rev 安全调度、Market/Source/Origin 类型、market-aware publish_sync_run 授权、facts.hk 通用裁决分派、US/CN filing-document 绑定授权。
- F4 citation snapshots/发布；F6 gold/评测 harness；计划三同源 HK 对账与租约合并；研报许可/field schema；公司/行业来源抽屉 UI。完整请求见 [runbook §13](../../runbooks/document-pipeline.md#13-接口请求owner-决策与退出门禁) 与 spec §17.2。
