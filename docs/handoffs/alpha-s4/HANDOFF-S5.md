# S4 → S5 开工交接

S4a/S4b 的实现范围是本地最小研究闭环。生产迁移、真实行情收益计算、真实 evaluator 会话和 Jev shadow 接入不在本次交付中。执行证据及最终审计状态见 [ACCEPTANCE.md](ACCEPTANCE.md)。

## 入口与现状

- 分支 `codex/s4-alpha-observations`；已验收源码 SHA：`9a36dba42943b202846bd99cfc185eb813b22e9e`；后续文档提交只补验收索引，不改变被审查源码。
- UI `/research/observations`；只在显式启用本地 S4 服务后可操作。
- PA 候选 JSON → 独立 operator binding → Source/SourceVersion/Occurrence → 先保存已有判断 → 基线变化卡及 ExposureEvent → 六类决定 → 冻结 Observation → CAS、审计、outbox → 数据库外持久化摘要回执。
- 已有公司/证券目录继续使用；不建立第二套证券或预算账本。基线为确定性规则，外部模型调用、token 和费用均为零。未知公司保留 null；证券须人工选择，并满足冻结的单市场规则。
- 获准 S3.4 工程样例来自 PA walkthrough。代理在隔离合成账号下操作，所有验收样本为 synthetic、descriptive。它证明软件闭环，不证明真实投资判断、独立 human_before 或预测效果。

## 冻结的研究语义

`alpha-observation-contract.schema.json` 是 `alpha-observation-contract/1.0` 登记契约；`alpha-observation-golden.json` 是人工构造的合成 golden。运行时登记校验此 schema。它描述不可变的登记记录，**不是 S5 计算结果 schema**；后续结果应追加，不能把原登记 JSON 的 null 结果改成价格。

`contract-hashes.json` 同时提供每个契约、fixture、日历和规则的文件 SHA-256 与 PA JCS SHA-256。JCS 与上游冻结实现相同，不进行 Unicode/换行归一化。

规则固定在 `market-policy.json`，交易日历固定在 `calendar.json`：XNYS、America/New_York、USD、冻结/资格时间两者较晚之后首个完整常规交易日有效收盘、最长等待天数、5/20/60 交易日窗口、SPY 基准、复权与缺数据策略均已在查看结果前冻结。`start_plan` 只规划日期，不承诺这些日期有有效价格。`actual_start_at` 与全部结果保持 null；状态 `pending_start`。

`record_origin=forward` 表示服务端现在登记，和 `research_stream=descriptive` 不冲突；上游暴露未知、代理操作、有影子暴露均不能升级为独立样本。延期引用原 Observation；显式追加新观察保留 predecessor_id；拒绝可追加 shadow Observation，原观察和旧窗口永不覆盖。

## S5 纯计算要求

1. 不 import Alpha 数据库/UI、PA 运行时或 Jev SDK。接收可序列化输入，输出自有计算契约；宿主认证/取数/持久化由宿主负责。
2. 验证 `market_policy_hash`、`calendar_hash`、输入摘要，按 frozen_at 与 eligibility_at 的较晚时间选择起点。不能只用 eligibility_at。
3. 不支持旧冻结规则时返回 `data_insufficient` / `rule_unsupported`，不得悄悄用新规则重算旧记录。
4. 缺有效收盘、复权因子、基准或完整窗口时保留 pending/明确缺数据；不可用最近现价、零收益或后见起点填补。按冻结的最大等待规则判定何时停止等待。
5. 分离公司与证券，保留 ticker、exchange MIC、currency、synthetic。合成样本不得进入真实效果评测；S4 限制 candidate 与 security 的 synthetic 属性一致。
6. 传回输入/规则/适配器版本与确定性摘要，保留数据可用时间。未来版本不能进入原 InputSnapshot。不同结果算法需新版本/追加对照，不能覆写原决定。
7. 样本的 anchor_pending / integrity_failed / local_receipt 必须保留；本机回执不是独立可信时间戳。不可把它用于冒充独立样本的提升。

## K 线宿主 DTO

`kline-dto.schema.json` 对应现有 `src/app/api/kline/[ticker]/route.ts`、`src/lib/chart/kline.ts` 的成功/失败结构，不把它误认作 S5 的引擎接口。`kline-{qfq,hfq,none,empty,missing}.synthetic.json` 全部是**合成**样例，含 fetchedAt、coverage、completeness、fallback、warnings、empty/missing 分支；未抓取行情，未开付费源。真实路由配合合成 provider 的测试验证其输出通过 schema。

`bars[].time` 是 UTC 秒数；`meta.coverageStart/End/asOf` 保留宿主字符串格式；`fetchedAt` 是抓取时间，不能当公开可用时间。qfq/hfq/none 是 DTO 复权标志，不保证满足冻结规则对复权因子的要求；S5/S6 必须检查具体算法和因子，不能仅凭字符串假定可比收益。

## evaluator-auth/1.0：设计冻结，S6 实现

此协议尚无真实 endpoint/密钥。`evaluator-auth-fake.json` 仅供 S5 mock，不可用于登录。

- 由 Alpha operator 在既有获准设施签发受限机器会话，默认最长 1 小时。高熵 opaque token，服务端只保存 token 摘要、session ID、subject、audience、owner_scope、allowed purposes、expiry、revoked_at；不把 owner_scope 从请求 body 当权限。
- audience 固定 `alpha-evaluator`。权限分离为 `observation:read` 与 `evaluation:append`；禁止修改 Source、Thesis、Decision、Observation 原件及 operator bindings。
- 所有请求先解析实际机器主体，再校验 owner、用途、会话未撤销且未到期、材料权利仍有效；按 owner 隔离。跨 owner 查找返回 404，scope/purpose/body 权限覆盖尝试返回 403，缺失/错误/到期/撤销/错误 audience token 返回 401。不可借 service-role 绕过实际主体检查。
- append 必须带 request_key、输入与规则摘要及预期物化 revision，冲突返回 409；结果、审计和 outbox 一次 CAS 事务。原登记记录不改写。
- token 取得/撤销、备份域和真实网络部署由 S6 ADR 及单独上线授权确定。S5 使用 fake auth，不等待密钥。

## 本地运行与迁移

`supabase/migrations/20260922090000_research_s4.sql` 为新增迁移。当前只在临时本机 PostgreSQL 17 跑完整 25 个 public migrations；测试 harness 的 auth/storage 是兼容最小壳，**没有验证真实 Supabase 登录/云部署**。

运行账号必须为非 owner、非 superuser、非 BYPASSRLS，继承 `alpha_s4_runtime`。迁移/绑定由 operator 管理；该角色不能更新 bindings，也不能更新不可变记录。S4 tables FORCE RLS，按 auth.uid() 限制；legacy source 读取和模型入口屏蔽受控副本，撤销/过期后 S4 读写也关闭。迁移 definer 函数的 owner 需有读取受 FORCE RLS 保护表的权限；本次使用本地迁移管理员，不擅自给运行账号提权。

本地服务配置：`ALPHA_S4_ENABLED=1`、`ALPHA_S4_DATABASE_URL`（仅 loopback）、`ALPHA_S4_ORIGIN`（准确 Host/port）。真实人工流程复用既有 Research admin 认证。验收适配器另需 `ALPHA_S4_LOCAL_AUTH=1` 与至少 32 字符随机 `ALPHA_S4_LOCAL_SESSION_SECRET`；HMAC cookie 只能产生 agent 身份，绝不能据此宣称真人独立标签。不在浏览器、日志、Git 存 DB URL、grant 或 cookie。

operator bindings 按 owner + independently approved payload/manifest hashes 预置，上传包不能自我授权；授权撤回由 operator 更新 revoked 或撤回配置，下一次读取/显示/决定重验。已单独拥有的同正文旧 Source 保留原有独立授权；S4 新副本以 immutable `s4_controlled_copy` 标记隔离。

`node --import tsx scripts/s4/anchor-worker.ts --once` 导出至 `ALPHA_S4_RECEIPT_DIR`；另需 `ALPHA_S4_ACTOR_ID`。`--watch` 启动时导出并每 24 小时尝试排空待导出队列（最多 20 轮，仍有积压明确报告并可重跑）；**本次不安装后台守护任务**。首次 fsync 后、SQL ack 前失败，可新进程原样重放。每轮最多新增 500 行，历史校验流式分页，无累计行数上限。文件只含摘要及最小引用，受控目录应位于数据库 data 目录之外，权限 0700/0600。

任何截断/损坏/字段不符都会隔离整个 owner 链并记录 ControlEvent，保守保持 descriptive；不会自动截断、重建或“恢复可信”。操作员需核查原始 DB 与备份并追加处置记录。日志与本地 DB 同机，不抵抗同 UID 管理员对两者同时重写；独立备份域/外部可信锚留 S6。

HTTP 错误：401 not_authenticated；403 scope_denied/policy_blocked/exposure_required/anchor_integrity_failed；409 revision_conflict/idempotency_conflict/source_version_conflict/observation_scope_conflict；413 input_limit；422 invalid_schema/future_input/invalid_timeline/hash_mismatch/fixture_not_operational/security_unresolved/data_insufficient/source_unavailable；503 not_configured；未识别错误仅返回 internal_error。worker 的 anchor_integrity_failed 会持久化 owner 隔离标志；新登记也返回该错误，历史/状态仍可查看以便核查。
