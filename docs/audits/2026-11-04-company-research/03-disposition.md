# 公司研究与跟踪模块规格 · Codex 审计处置表

规格：`docs/superpowers/specs/2026-11-04-company-research-design.md`（第 3 稿）
审计：`01-codex-round1.md`（gpt-6-astra，medium，对第 1 稿，30 条）、`02-codex-round2.md`（对第 2 稿；round-1 逐条复核 + 新增 #31–#52）。按 owner 规则两轮为上限；第 3 稿按第二轮意见修订后**未再送审**，本表记录每条的处置。
处置码：ACCEPT（已改入第 3 稿）/ DECLINE（附理由）/ OWNER（交 owner 决策，§15）/ OPEN-verify（实施前核对，§16）。

Codex 第二轮判定原句：**"The second draft is substantially improved, but is not ready for implementation planning: digest concurrency, unread acknowledgements, quarterly derivation, DCF fallback safety, and mandatory evidence access remain unresolved."** 这五项分别对应 #31–#33、#35、#37、#43–#45、#40–#42，均在第 3 稿处置（见下）。

## 第一轮（第 1 稿 → 第 2 稿）

| # | 严重度 | 处置 | 第 3 稿落点 / 理由 |
|---|---|---|---|
| 1 | P1 | ACCEPT | 全文对齐规格二第 8 稿（`readFacts` 信封、`state_rev`、`fact_sync_runs`、无 service_role 直写）；§2、§4.7、§10.1 |
| 2 | P1 | ACCEPT | 所有表、键、路由、DCF 种子带 `market`；页头双流切换；§4、§5.1、§6 |
| 3 | P1 | ACCEPT | 单一事务函数 `replace_company_digest` 同时写事件与覆盖；§4.6 |
| 4 | P1 | ACCEPT | 以 `state_rev` 为游标、每流退避、sweep 有独立配额与 `swept_at`；§4.4、§6.3 |
| 5 | P1 | ACCEPT | 变更源 = `state_rev`（发布/提升/裁决都递增）；挂接读时联查；digest 用 service_role；§6.3 第 6 条、§10.1 第 5 条 |
| 6 | P1 | ACCEPT | 单信封读取、`truncated` 失败关闭、新 `CompanyDb` 契约；§4.7、§5.3、§6.3 |
| 7 | P1 | ACCEPT | 回放模式按 `asOf` 现算事件，不读物化表；§5.10、§6.1 `events` |
| 8 | P1 | ACCEPT | 自然键不含 fact_id、墓碑 `retired_at`、`first_seen_at` 保留、`payload_changed_at`；§4.1、§7.2 |
| 9 | P1 | ACCEPT | filing 合格条件 `mapping_gen > 0`；零事实 filing 事件与期间事件分离；§5.5、§7.2 |
| 10 | P1 | ACCEPT | 不存冻结状态；`freshness` 路由读时重算；流级只存事实（最近成功时间/结果）；§4.2、§6.1 |
| 11 | P1 | ACCEPT（第 3 稿再加强，见 #40） | 证据 DTO、代码版本缺失则不显示数值；§5.6 |
| 12 | P1 | ACCEPT（第 3 稿再加强，见 #43–#45） | 统一除数、口径标注、期末对齐；§9.1 |
| 13 | P1 | ACCEPT | 合并顺序 facts 高于 LLM、逐叶子来源、股权桥门控；§9.1 |
| 14 | P1 | ACCEPT（第 3 稿改为 OWNER 决策 J，见 #42） | 行情比率移除；行情行与 K 线默认移除；§1.2、§5.8、§15 J |
| 15 | P1 | ACCEPT | `canShowPercent` 失败关闭谓词；第 3 稿改为以 F4 契约为准并加客户端防御；§10.4 |
| 16 | P1 | ACCEPT（第 3 稿改默认为保留） | §4.5、§15 C |
| 17 | P2 | ACCEPT | `search_path=''`、全限定、payload 逐键校验、无直写；§4.6 |
| 18 | P2 | ACCEPT | 触发器强制上限、已存在键放行；§4.3 |
| 19 | P2 | ACCEPT | 第 3 稿改为按事件 id 回执；§4.3、§6.2 |
| 20 | P2 | ACCEPT | 按用户路由 `private, no-store`；目录无判断计数；§6、§8 |
| 21 | P2 | ACCEPT | 期间键、`Cell` 联合类型、每行单位与并列规则、字符串十进制格式化；§5.3 |
| 22 | P2 | ACCEPT | 上游清单补 `factCount/linkAttempts/mappingGen`、完整 filings；不推断缺失原因；§5.4、§5.7、§10.1 |
| 23 | P2 | ACCEPT | 专用 `packet` 路由；§6.1、§9.2 |
| 24 | P2 | ACCEPT | 读者清单重写（2 活跃调用 / 1 载荷消费 / 1 未用 / 1 注释），种子"静默为空"；§2 |
| 25 | P2 | ACCEPT | 视图 × 回放矩阵；§5.10 |
| 26 | P2 | ACCEPT | K 线表格视图（在决策 J 批准保留时）；§5.8 |
| 27 | P2 | ACCEPT | 默认只有 F4 空状态；§10.4、§15 A |
| 28 | P2 | ACCEPT | `MESSAGE_DOMAINS` 注册、对等测试、cookie 切语言；§12.1、§12.3 |
| 29 | P2 | ACCEPT | 夹具清单、独立来源期望值、交错测试、浏览器证据；§12 |
| 30 | P2 | ACCEPT | 估算与阈值标为假设；去掉对方价格复现与禁用态行业控件；§3、§13、§16 |

## 第二轮（第 2 稿 → 第 3 稿）

| # | 严重度 | 处置 | 第 3 稿落点 / 理由 |
|---|---|---|---|
| 31 | P1 | ACCEPT | `replace_company_digest` 先对 `fact_sync_scope` 行取 `for share`（与规格二发布函数的 `for update` 互斥），锁内读 `state_rev` 比对，锁持有到事务结束；去掉独立 advisory 锁；集成测试加发布/物化交错；§4.6、§12.2、§10.1 第 5 条 |
| 32 | P1 | ACCEPT | `p_sweep` 参数由函数写 `swept_at`；`sweepDue` 最旧优先（null 最先）；80/20 配额保证 sweep 不饿死；缺行的流按 `digested_rev=0, swept_at=null` 左联；7 天改为目标值并加吞吐实测开放问题；§4.4、§4.7、§6.3、§16.4 |
| 33 | P1 | ACCEPT | 每次调用一个 `rebuild_id`，退役按 `rebuild_id <> p_rebuild_id`；选流列表去重；§4.1、§4.6、§6.3 |
| 34 | P2 | ACCEPT | `payload`（经济内容，进哈希）与 `meta`（`headlineAsOf` 等）分离；`payload_changed_at` 未变化时保留；`citation/url` 不进 payload；§4.1、§4.6 |
| 35 | P1 | ACCEPT | 放弃时间戳确认，改为 `company_event_reads` 按事件 id 回执（`on conflict do nothing`，触发器校验 id 属于该发行人，取消跟踪级联清理）；`POST …/read {eventIds}`；§4.3、§6.2、§7.3 |
| 36 | P2 | ACCEPT | 触发器对已存在 `(user_id, issuer_id)` 放行给 `on conflict do nothing`；§4.3、§6.2 |
| 37 | P1 | ACCEPT | `quarterly` 口径改为 `history:true` 信封 + 规格二规范派生函数；CN 收入 `revenue_operating`；BS 的 quarterly 返回 400；§5.3 |
| 38 | P2 | ACCEPT | `statement=IS|BS|CF`；overview 的 `latest` DTO 从同一信封取事实并用 derive 算比率，不读物化指标表；§5.10、§6.1 |
| 39 | P2 | ACCEPT | 行单位确定性规则（期间数最多、并列按码点）；期间事件按完整期间键分组、固定 `consolidated`、多单位概念列入 `ambiguousUnits` 而非任选；§4.1、§5.3、§7.2 |
| 40 | P1 | ACCEPT（部分） | 公共证据 DTO `fact_evidence` / `GET /api/facts/evidence`（原始快照元数据、JSON 指针定位、运行代码版本、映射与单位规则；无 token）；证据取不到或代码版本为空 → **不显示数值**。原始快照字节仍仅 admin 可下载：Tushare 响应原文再分发受条款限制（OWNER 事项，§15），对公众的"一手证据"是披露文件本身（EDGAR/巨潮链接）；§5.6、§5.7、§10.1 第 2 条 |
| 41 | P1 | ACCEPT | §10.1 改为 C0 退出条件要求规格二**书面接受**（不接受"记为偏差"）；列出 `fact_sync_runs` RLS 矛盾、runs→batches 的代码版本联查、行级 `run_id`、完整 filings 列表带 `stateRev`、`INFO_CODES`；§10.1、§13 C0 |
| 42 | P1 | OWNER（决策 J）+ ACCEPT | 规格不再自行豁免：默认本次从公司页**移除**行情行与 K 线、不显示"预计披露日"（决策 G 默认改为不显示）；owner 可书面批准总纲例外。理由：行情链路的回放契约属于行情规格，本规格无权替它承诺；§1.2、§5.2、§5.8、§15 G/J |
| 43 | P1 | ACCEPT | 股权桥三项（基期收入、股数、净债务）必须 `fact` 或 `user` 来源，否则路由返回 `status='unavailable'` 不运行引擎；`DcfStudio` 不再挂载即运行，先展示股权桥输入面板；§5.4、§9.1、§11 |
| 44 | P1 | ACCEPT | 股数适用性改为肯定式检查：`share_class ∈ {common, A}` ∧ 该市场唯一未关闭证券 ∧ 封面日期单一股数事实；`unknown/ADR/preferred/H/other` 与多类别 → 不种子。承认在规格三之前美股股数种子多数不可用；§9.1 |
| 45 | P1 | ACCEPT | 叶子路径来源（`revenueLines[0].baseRevenue` 与 `cagr` 分别标注）、深合并；种子与派生来自**同一** `readFacts` 信封（不读物化指标表）；`currency/currencyUnit/divisor` 进入提示、默认与 overrides 解释；§9.1 |
| 46 | P1 | ACCEPT | 谓词改为以 F4 发布的受信校准政策为准（`minN` 来自政策，不来自卡）、`appliesTo` 的 kind/horizon 匹配、`p`/`brier` 有限与范围、定义非空；并与并行编写的 F4 规格 §9.2 对齐：本页只渲染 F4 的 `display.percent` 并加客户端失败关闭防御；§10.4 |
| 47 | P2 | ACCEPT | F4 `as_of` 返回当时版本的卡（结算、校准不得晚于 `as_of`）；F4 事件合并明确推迟到 F4 定义事件 DTO 后（C5）；§1.2、§5.10、§7.3、§10.4 |
| 48 | P2 | ACCEPT | 函数内按 kind 固定 schema 逐键校验嵌套 payload；每个 `factId` 必须是本流 `ok` 行且值等于 `value_text`；每个 `filingId` 必须是本流已激活 filing；`event_id/payload_hash` 服务端计算；§4.6、§12.2 |
| 49 | P2 | ACCEPT | `mark_company_digest_failed(…, p_attempt_rev)` 只在该版本尚未成功时生效；新鲜度 `ok = failed=0 ∧ backlogFailed=0`（空转不洗绿）；cron 与脚本不同时运行（单一生产者）；§4.4、§4.6、§6.3 |
| 50 | P2 | ACCEPT + OWNER（决策 C） | 默认改为**本次保留** `financial_history`；删除迁移改为先 `lock table … access exclusive` 再检查空表，并要求 owner 提供部署证据后另立迁移；§4.5、§15 C |
| 51 | P2 | ACCEPT | 期望值必须独立来源（黄金断言 + 人工从 EDGAR index 抄录的 filing 列表）；集成测试加发布/物化交错、同批次两次 replace、回执迟提交；C1 退出要求可复现的浏览器证据（本机报告 + 复审者复跑），手动清单不算完成；§12.0、§12.2、§12.3 |
| 52 | P2 | ACCEPT | `deadline_hit` 依赖规格二把它加入 `INFO_CODES`；落地前只写 `detail.deadlineHit`，不进 `errors`；批次六计数器映射明确；§6.3、§10.1 第 6 条 |

## 未送审的第 3 稿改动（供下一轮或实施者复核）

- 新增表 `company_event_reads`（替代 `last_seen_at`）与其触发器。
- `replace_company_digest` 签名增加 `p_rebuild_id`、`p_sweep`；`mark_company_digest_failed` 增加 `p_attempt_rev`。
- `issuer_events` 增加 `meta`、`rebuild_id`；`issuer_coverage` 增加 `rebuild_id`。
- 决策 J（行情行与 K 线去留）、决策 K（分数凯利 `k`、无星级）为新增 owner 事项；决策 C、G 的默认值改变。
- §10.4 对齐 F4 规格 §9.2 的 `JudgmentCard` 契约。

## 两轮都确认必须保留的要点（Codex "must not be regressed"）

市场分流与单信封读取、`truncated` 失败关闭；事件/覆盖原子替换、语义事件身份、墓碑与首次可见时间保留；按 `asOf` 现算回放、明确的回放排除；公共事实与私有用户状态分离；mock 共识/财务/新闻移除、港股缺失保持缺失；DCF 单位统一与事实种子不被 LLM 覆盖；读时新鲜度、RLS、`private, no-store`、表格等价、双语注册、critical 套件注册。
