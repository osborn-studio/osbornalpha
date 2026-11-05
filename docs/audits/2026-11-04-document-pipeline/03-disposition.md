# F3 披露文档管道规格 · Codex 审计处置表

规格：`docs/superpowers/specs/2026-11-04-document-pipeline-design.md`（第 3 稿）
审计：`01-codex-round1.md`（25 项，verdict "not ready"）、`02-codex-round2.md`（25 项一轮处置复核 + 24 项新发现 N1–N24，verdict "not ready"）。两轮为 owner 规则上限；第 3 稿吸收下表全部 ACCEPT 项，未再跑第三轮——owner 评审时可按本表逐项核对。

决定含义：ACCEPT = 已改入第 3 稿；DECLINE = 不改，附理由；OWNER = 需 owner 决定（已列入规格 §14）；OPEN-verify = 实施前核对（已列入规格 §15）。

## 第一轮（01）

| # | 决定 | 第 3 稿处理 |
|---|---|---|
| 1 重抽取删页与引用冲突 | ACCEPT | 不可变 `document_extractions` 版本，`document_pages` 以 `extraction_id` 为键、永不删改；引用挂抽取版本（§4.3–4.5） |
| 2 旧抽取快照未保留 | ACCEPT | `pages.json` 按输出哈希寻址 `extractions/{sha}/{pages_json_sha}.pages.json`，版本行记录哈希（§4.3、§4.10） |
| 3 私有响应继承公共缓存头 | ACCEPT | §9 按响应类别：会话响应一律 `private, no-store`；路由测试含 owner→匿名、A→B |
| 4 上传去重跨租户 | ACCEPT | `source_ref = '<owner>/<sha256>'`，`insert_upload_document` 持 owner 咨询锁，`source_url` 对上传为 null（§5.1、§4.8） |
| 5 抽取租约无持有者令牌 | ACCEPT | `extract_lease_batch_id`、`candidates_lease_batch_id`；所有抽取/候选函数校验租约；采集写入经 `insert_document_version`（同步租约）（§4.1、§4.3、§4.8） |
| 6 自动晋升违反生命周期 | ACCEPT | `decision_kind human/auto`、`ec_decision_shape`、`decide_candidate` 一个函数（§4.6、§4.8） |
| 7 人工晋升未强制阻断检查 | ACCEPT | `decide_candidate` 人工确认要求 `checks_passed`；活动候选集资格（kind/source/permission/language/issuer/当前版本）在 §7.7 |
| 8 事实先于证据公开 | ACCEPT | 证据在 `publishRun` 前以 `insert_fact_citations` 暂存并 `assert_run_evidence_complete`；可见性随事实状态（§4.12、§7.7） |
| 9 港股 filing 标识合并不同披露 | ACCEPT | `filings.source_ref = 'hkex:<文件标识>:v<version>'`；替换版本 `available_at = fetched_at`，`published_at` 保留（§4.9、§5.2） |
| 10 港股期间模型不完整 | ACCEPT | BS instant、`period_start` 推导规则、列头日期、中文数字、中期 BS 比较列缺失即缺失（§7.5 第 2 条） |
| 11 单位/符号错误 | ACCEPT | 货币、倍数、每股子单位分别解析，`scale=null` 阻断；概念级符号规则，`sign_flip` 记录（§7.5 第 3–5 条） |
| 12 四角色引用不可重建 | ACCEPT | 候选持久化 `citations{value,label,unit,period[]}`；偏移在规范化时产生（§4.6、§7.2） |
| 13 映射代与增量确认冲突 | ACCEPT | `HK_PUB_GEN` 作为规格二 `mapping_gen`；活动候选集 + 整份 filing 重建 + 零输出 filing 进 manifest（§7.7） |
| 14 迁移时间戳与 Non-append 门禁 | ACCEPT | §12 合并顺序规则 + owner 决策 G |
| 15 回填无法推进 | ACCEPT | 段 + 项级游标 `{segment, index, item_attempts}`，已知项先过滤再计上限（§6.1） |
| 16 夹具哈希不可能 | ACCEPT | 合成字节用自身真实哈希；录制抽取层与编排层分开；真实字节验证脚本（§11.3） |
| 17 私有读取审计不可执行 | ACCEPT | authenticated 对私有行无 RLS；持有人只经服务端路由；用现有 `audit()`（`object_type/detail`）；审计失败 → 500（§4.12、§8.2） |
| 18 候选引用对公众可见 | ACCEPT | `document_citations` 可见性 = `visibility='public'`（仅 human/module）或被 ok 事实引用（§4.5、§4.12） |
| 19 歧义与检查语义矛盾 | ACCEPT | 连续页序列规则；`blocking` 标志；英文版作 `comparison` 角色产候选（§7.3、§7.5、§7.6） |
| 20 抽取→候选崩溃缺口 | ACCEPT | `candidates_status/role` 独立阶段与租约；`request_document_extract` 转换（§4.3、§4.8、§7.3） |
| 21 部分资产写入不可恢复 | ACCEPT | 文档 + 资产在 `insert_document_version` 一个事务；版本分配在行锁内（§4.8） |
| 22 规格二读/派生缺改 | ACCEPT | §16 (c)(e)(f) 列出 ticker 路由、派生口径、`financial_facts` 无 `source` 列（改用 `filings.source`） |
| 23 PostgREST 截断 | ACCEPT | 游标分页契约，每个读方法显式分页或有界完整读（§4.11、§9） |
| 24 自动晋升门槛未绑定版本 | ACCEPT | `extraction_approvals` 绑定 `extractor_ref/extractor_version/table_algo_version/code_version/concepts`；精确率与召回率都 ≥ 0.95（§4.7） |
| 25 可得时间语义变化未说明 | ACCEPT | §2 来源扩展行与 §5.2 明示有意改变 |

## 第二轮（02）新发现

| # | 决定 | 第 3 稿处理 |
|---|---|---|
| N1 延迟约束跨请求失效 | ACCEPT | 取消延迟触发器；证据经 `insert_fact_citations` 即时校验，可见性由 RLS 随事实状态推导，`assert_run_evidence_complete` 在 `publishRun` 前校验四角色齐全（§4.8、§4.9、§4.12、§7.7） |
| N2 证据阻止废弃运行删除 | ACCEPT | `fact_citations.fact_id on delete cascade`；非级联 delete 由触发器禁止；ok 行永不删除故已发布证据不消失（§4.9） |
| N3 `stage_facts` 不返回 id | ACCEPT（接口） | §16 (c) 给出具体契约：调用方生成 `fact_id` 随行传入，函数返回 `{input_key: {fact_id, outcome}}` |
| N4 视图 RLS 不安全 | ACCEPT | `disclosure_documents_public` 为 `security_invoker=true` 且 `where permission='public'`、不含敏感列；集成测试直接查视图（§4.1、§4.12） |
| N5 决定继承绕过审批 | ACCEPT | 自动决定永不继承；人工决定按完整 `fingerprint` 继承，新 `decided_at`、`inherited_from`；晋升时 `stage_candidate_publication` 复核审批未撤销（§4.6、§4.8、§7.3） |
| N6 修正值无法替换已发布值 | ACCEPT | `HK_PUB_GEN` 作为 `mapping_gen`（任一抽取/映射版本改动或修正 +1）；活动候选集唯一（当前抽取版本 + 当前 extractor_ref）（§7.7） |
| N7 重建无法处理已晋升候选 | ACCEPT | `candidate_publications(candidate, pub_gen, run, fact_id, state)` 替代单指针；`confirmed/promoted` 都可进入新代（§4.6、§4.8） |
| N8 候选失败不再重试 | ACCEPT | `claim_candidates_lease` 接受 `pending|failed`，计数只在 claim，三次后 `exhausted`（§4.3、§4.8） |
| N9 同版本重处理与唯一键冲突 | ACCEPT | `request_document_extract` 对已存在版本抛 `revision_exists`（409）；`extract_attempts` 只在 claim 计数，`storedDue` 排除 ≥ 3（§4.8、§7.3） |
| N10 写入面不完整、租约总则矛盾 | ACCEPT | §4.8 改为"变更清单"：每个函数写明锁与授权来源；新增 `reclassify_document`、`request_candidates_regen`、`advance_document_cursor`、`abandon/finish_candidate_publications` |
| N11 回填无法在页内续传 | ACCEPT | 游标含段内 `index` 与 `item_attempts`，每项处理后即前进；失败项三次后隔离并前进（§6.1） |
| N12 替换承诺超出轮询 | ACCEPT（收窄承诺） | 轮询窗口 = `last_success_at − 1 天`（一个 cron 周期）；替换只在回填/轮询窗口内发现，周期性重核验为 owner 事项（§1.2、§6.1、§14） |
| N13 证据只校验发行人不校验 filing | ACCEPT | `insert_fact_citations`/`assert_run_evidence_complete` 要求引用文档 = filing 的 `primary_document_id` 且抽取版本 = 当前；候选表加 `(document_id, extraction_id)` 外键（§4.6、§4.8） |
| N14 UTF-16 与 SQL 字符坐标不一致 | ACCEPT | 全部偏移为 Unicode 码点，JS 用 `Array.from`；增补平面/emoji 夹具（§4.4、§7.2、§11） |
| N15 数值检查边界与倍数词重叠 | ACCEPT | `decimal.ts` 字符串算术；检查前显式 `Number()` 转换并说明精度；倍数最长匹配、先剔除货币词（§7.5 第 3、5 条、§7.6） |
| N16 表头与英文对照缺少输入 | ACCEPT | 表头块原样保留（含中文数字）；英文版 `candidates_role='comparison'` 产候选；再生用同一资格规则（§7.2、§7.3） |
| N17 比较列期间证据不成立 | ACCEPT | `citations.period` 为数组：`statement_title` + 所选 `column_header`；`fact_citations` 主键改为 `(fact_id, role, citation_id)`，`period` 至少一条（§4.6、§4.9、§7.5） |
| N18 最新版本先于时点过滤 | ACCEPT | `read_documents(p_as_of)` 先按 `available_date <= as_of` 再取最高版本；`/api/documents/[ticker]` 加 `asOf`（§4.8、§5.3、§9） |
| N19 分页不完整 | ACCEPT | `documentVersions`、`extractionsOf`、`candidatesOf` 全部分页；`pagesOf/citationsByIds/publicationsOf` 有显式上限（§4.11） |
| N20 自动确认无晋升触发 | ACCEPT | `documents-candidates` cron 三阶段：候选 → 自动决定（幂等、不限批次）→ `promotionDue` 晋升（§7.3） |
| N21 未跑规格二同日冲突规划 | ACCEPT | 原样使用规格二 `planFactWrites` + `openConflicts`；港股替换版同日冲突走同一机制（§4.9、§7.7） |
| N22 回执状态与 `batchStatusFromCounts` 不符 | ACCEPT | §10 按 landed 规则重写；"不变"收窄为内容表与桶（§1.1） |
| N23 cron 数量/时区/分钟碰撞 | ACCEPT | 五条新 cron 合计十一条；`documents-candidates` 改 `25 * * * *`；EDGAR 冬/夏令时说明；Pro 计划要求（§6.3、§14） |
| N24 `meta.json` 不是内容寻址 | ACCEPT | 取消旁路文件；获取记录进每行 `acquisition jsonb`（§4.1、§4.2、§4.10） |

## 两轮"无法核实"项的归属

| 项 | 归属 |
|---|---|
| EDGAR `files[]`/`index.json`/`_htm.xml` 形态 | §15 问题 1（OPEN-verify，F3-1） |
| HKEX 范围上限、替换频率、中英成对 | §15 问题 2（OPEN-verify，F3-1）；重核验节奏 OWNER（§14） |
| 巨潮 `category` 取值 | §15 问题 4（以规格二核对为准） |
| `pdfjs-dist` 在 Vercel 的可行性与最大年报性能 | §15 问题 3；§7.1 冒烟标准改为含范围内最大年报；OWNER 决策 D 含降级路径 |
| Storage SDK 重复上传/签名 URL、生产 `max_rows` | §15 问题 6（F3-0/F3-3 核对） |
| Vercel 计划与每小时 cron | OWNER（§14） |
| 黄金集证据 | F3-4 交付物（§11.4）；审批阈值在约束里 |
| `roe_annual` 未定 | 已决定：本规格不请求新增指标，港股 `roe` 保持缺失（§16 (f)） |
| 工作量估计精度 | §12 注明为逐包判断后相加，不是测量 |
| 表格聚类阈值未验证 | §7.2：F3-2 用录制主表页校验列数一致，结果进评测报告（§15 问题 5） |
| 7 天轮询窗口无依据 | 改为一个 cron 周期（1 天）（§6.1） |
| 签名 URL 300 s 的依据 | §8.1 改为"只用于随即发起的一次下载，owner 可调"的默认值 |

## 第三轮（04）

规格第 4 稿处理。第三轮把第二轮 N1/N5/N6/N7/N8/N9/N10/N13/N19/N20 评为 PARTIAL，并新增 R3-1。

| # | 决定 | 第 4 稿处理 |
|---|---|---|
| R3-1 批量终结把被隔离候选标为已发布 | ACCEPT | `finish_candidate_publications` 改为逐条判定：事实 `ok` → `published`；`quarantined` → 保持 `staged`；事实不存在 → `abandoned`；返回 `{published, still_staged, abandoned}`；要求运行已 `published`；同一函数用于恢复；§12 验收样例 10 为混合结果运行（§4.6、§4.8、§7.7） |
| N1 / N13 证据校验在发布事务之外 | ACCEPT | 新增 `publish_hk_run`：一个事务内先 `assert_run_evidence_complete`（对运行内**全部** staged 事实，不按发布行迭代；含引用 `integrity`、文档 = filing 的 `primary_document_id`、抽取版本 = 当前、每个事实恰有一条本运行发布行），再调用规格二 `publish_sync_run`；校验失败整体回滚。它是港股事实唯一的发布入口；§16 (d) 列出规格二需允许同事务内调用（§4.8、§7.7） |
| N5 审批版本比对引用快照中不存在的列 | ACCEPT | `input_snapshot` 补 `table_algo_version`，但版本比对一律连接 `document_extractions` 行的三列，快照只作记录（§4.6、§4.8、§7.3） |
| N6 验收样例 9 承诺旧代 `asOf` 可见 | ACCEPT | 样例 9 改为：旧代行保留为历史，`asOf` 读取不再返回，`factIds` 证据查询仍可取回（规格二 `factsByIds` 不限代）（§12） |
| N7 同代二次确认与重试迁移 | ACCEPT | 本次暂存集合 = 活动集中在当前代下无 `staged|published` 行的候选；`abandoned→staged` 为同主键行更新；`staged` 且事实隔离的候选等待；`already_staged` 由筛选规则避免；同代再次发布要求规格二对相等代不抛回归（§4.6、§4.8、§7.7、§16 (d)） |
| N8 / N9 第三次崩溃永远 pending | ACCEPT | `storedDue`/`candidatesDue` 不按 attempts 过滤；`claim_*` 在 attempts ≥ 3 时执行终态转换（`extract_failed`/`exhausted`）并返回 false（§4.8、§4.11、§7.3） |
| N10 缺 checks 写入 RPC | ACCEPT | `write_candidate_checks(p_extraction, p_batch, p_rows)`：候选租约下、只对 `status='candidate'` 行、`checks` 列唯一写入路径；已决定行冻结（§4.8、§7.3） |
| N19 `publicationsOf`/`approvalsFor` 未分页 | ACCEPT | `publicationsOf` 游标分页（按 candidateIds 或 runId）；`approvalsFor(limit 100)` 超限抛 `too_many_approvals` 并停止自动决定（§4.11） |
| N20 `promotionDue` 遗漏恢复与新代 | ACCEPT | `promotionDue(pubGen)` 三类条件：待首发、`promoted` 但新代无行、当前代有 `staged` 行（恢复）；`runHkFactsSync` 第 0 步做恢复（§4.11、§7.3、§7.7） |
| 外部语义未核实（EDGAR/HKEX/巨潮/PDF 运行时/Storage/PostgREST/Vercel） | OPEN-verify | 与前两轮相同，§15 问题 1–6、§14 |

## 第四轮（05）—— 未处理，按协调指示停止

第四轮 verdict："Verdict: not ready."（R3-1、N5、N6、N7 判 RESOLVED；N1/N13、N10 判 PARTIAL；新增 R4-1～R4-4 为 P1，R4-5～R4-7 为 P2）。协调方规则：第四轮仍 not ready 则停止并上报，不再改稿。以下为待 owner/下一轮处理的阻塞项，Codex 已给出可逐字套用的修法（见 `05-codex-round4.md`）：

| # | 严重度 | 要点 | 建议处置 |
|---|---|---|---|
| R4-1 | P1 | §7.7 第 0 步恢复在取得规格二租约之前调用 `abandonRun` | 接受：先 `reconcileScope` + `claimLease`，持租约再做第 0 步，所有退出路径释放租约 |
| R4-2 | P1 | `publish_hk_run` 校验证据时未锁定 `fact_sync_scope`、相关 `filings`、`disclosure_documents`，`current_extraction_id`/`primary_document_id` 可在校验后、发布前被改 | 接受：按 Codex 给出的锁顺序（scope 行 → filings 按 id → documents 按 id，均 `for update`）后再校验、再 `publish_sync_run`，锁持有到事务结束 |
| R4-3 | P1 | `assert_run_evidence_complete` 只检查 `staged`，第 4 步先隔离的行绕过证据校验 | 接受：谓词改为 `status in ('staged','quarantined')`，任一不全则整次发布中止 |
| R4-4 | P1 | 继承确认的候选在插入时即 `confirmed`，`checks` 为空且 RPC 拒绝已决定行，永远不可晋升 | 接受：`insert_candidates` 一律插 `candidate`；`write_candidate_checks` 写完检查后对通过者原子套用继承 |
| R4-5 | P2 | `promotionDue` 条件 (b) 漏掉"已晋升候选在新代 `abandoned`"的重试 | 接受：(a)(b) 合并为"活动候选无 `pub_gen=当前 and state in ('staged','published')` 的行" |
| R4-6 | P2 | §7.3 的 `storedDue` 仍写 `extract_attempts < 3`，与 §4.8/§4.11 矛盾 | 接受：删除该过滤；claim 返回 false 即跳过 |
| R4-7 | P2 | 发布后、物化前崩溃 → 恢复只终结关联、走 `nothing_to_publish` 退出，不再物化 | 接受：发行人级"待物化"持久标记，由 `publish_hk_run` 原子置位、物化成功后清除，并纳入 `promotionDue` |

## 第四轮（05）—— 第 5 稿按协调指示逐字落入，未再审计

| # | 决定 | 第 5 稿处理 |
|---|---|---|
| R4-1 恢复先于租约 | implemented per Codex's prescribed fix (round 4), not re-audited | §7.7 第 0 步：`reconcileScope` → `claimLease`，false 则 `skipped_summary(leased)` 且不做恢复写入；持租约后恢复，恢复完成后才 `beginRun`；所有正常退出释放租约 |
| R4-2 发布事务未锁定绑定 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.8 `publish_hk_run` 锁契约：`fact_sync_scope` 行 → filings（按 id）→ documents（按 id）`FOR UPDATE`，校验租约与运行归属，取锁后校验证据，再 `publish_sync_run`，锁持有到事务结束 |
| R4-3 隔离事实绕过证据校验 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.8 `assert_run_evidence_complete` 谓词 `status IN ('staged','quarantined')`，"该集合中的每个事实"，隔离不豁免 |
| R4-4 继承确认永不可晋升 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.8 `insert_candidates` 一律插 `candidate` 不套用继承；`write_candidate_checks` 持候选行锁，先写检查，通过者原子套用人工继承；已决定行不可改 |
| R4-5 `promotionDue` 漏重试 | implemented per Codex's prescribed fix (round 4), not re-audited | §4.11 (a)(b) 合并为"活动候选 `status in ('confirmed','promoted')` 且无 `pub_gen=pubGen and state in ('staged','published')` 行"；保留 (c)；新增 (d) 物化标记 |
| R4-6 `storedDue` 残留 attempts 过滤 | implemented per Codex's prescribed fix (round 4), not re-audited | §7.3 去掉过滤；claim 返回 false 即跳过该文档全部写入 |
| R4-7 发布后物化丢失 | implemented per Codex's prescribed fix (round 4), not re-audited | §7.7 第 0 步 `needs_materialization`；空运行退出前物化；§4.9 新表 `hk_materialization_due` 由 `publish_hk_run` 原子置位、`clear_materialization_due` 修订号校验后清除；`promotionDue` 条件 (d) |
