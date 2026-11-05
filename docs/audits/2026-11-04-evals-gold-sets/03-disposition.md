# F6 评测与黄金集规格 · Codex 两轮审计处置表

目标：`docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`
审计：`01-codex-round1.md`（gpt-6-astra, medium，针对第 1 稿，28 条）、`02-codex-round2.md`（针对第 2 稿，22 条新发现 N1–N22 + 对第一轮 28 条的解决状态）、`04-codex-round3.md`（针对第 3 稿，3 条新 P1 + N1–N22 的状态，其中 12 条 PARTIAL）。
处置人：架构师（Claude Fable 5.1）。决定：ACCEPT（已在第 3 稿实施，`implemented_in` 指向节号）/ DECLINE（附理由）/ OWNER（需 owner 决定，已列入规格 §16）/ OPEN-verify（实施前核对，已列入规格 §17）。
按 common brief 规则 Codex 规格审计最多两轮；协调人随后追加了第三轮（针对第 3 稿）与第四轮（针对第 4 稿，只问新缺陷与最终判语）。

Codex 第二轮最终判语（针对第 2 稿）："**Verdict: not ready for implementation planning—the rewrite improves structure substantially, but still permits misleading passes and leaves incompatible read, replay, persistence, and release-evidence contracts.**" 第 3 稿逐条处置如下；第二轮判语针对的是第 2 稿，不是第 3 稿。

## 第一轮（01）

| # | 决定 | 实施 / 理由 |
|---|---|---|
| 1 覆盖不足可过 | ACCEPT | §3.2 三维结论、`gate` 四条规则、`incomplete` 不作证据；必需案例缺失直接 `incomplete` |
| 2 FactsDb 接口陈旧 | ACCEPT | §2 按规格二第 8 稿 `readFacts/filingsOfIssuer/factsByIds/metricsOfIssuer` 重写；market `A→CN`（§4.2）；`truncated → read_error` |
| 3 不绑定文件 | ACCEPT | §4.2 `binding`、§5.1.2 按 filing 选行；`current` 用 `asOf = available_date` |
| 4 单位契约矛盾 | ACCEPT | §4.2/§4.3 `printed` 与 `canonical` 分列、`target.unit` 词汇表、括号负数、`%`→ratio、AAPL 示例改 `scale=1000000` |
| 5 来源链 | ACCEPT | §4.2 `source.sha256` 必填；§5.1.4 来源链可解析（特权运行查桶与 `ingest_batches.code_version`） |
| 6 回放不可离线复现 | ACCEPT | §5.3.1 frozen 输入包（夹具 sha、同步顺序、`today`、配置哈希）+ 自然键投影 |
| 7 账本可永久遮蔽 | ACCEPT | §5.3.3 六元组 + `changed_fields` 全覆盖 + 另一人批准；`data_drift` 独立分类 |
| 8 响应方代码版本 | ACCEPT | §5.3.2 在线回放走库路径（无 CDN）；`--http` 只冒烟并记 `x-vercel-cache/x-code-version`；§17.5 |
| 9 对照隔离只在类型层 | ACCEPT | §5.4 `ReadDeps` 无写能力、`ReferenceResult` 运行时严格 schema、表内容哈希、哨兵值 |
| 10 私有证据边界 | ACCEPT | §4.5 `artifact_class` 决定目的地、受限桶、`--redact` 覆盖 `docs/audits/**`；§16 D8 |
| 11 锁 ≠ 独立授权 | ACCEPT + OWNER | §4.4 `--gold-diff` 对基线、集级字段版本化；独立审批依赖 CODEOWNERS/分支保护（§16 D2），`gold_approval` 入清单 |
| 12 绝对容差与表语义 | ACCEPT | §4.3 只允许相对容差；§6.2 `left_text/right_text` 文本投影列；§5.2 三层序列化测试 |
| 13 F3 契约 | ACCEPT | §11.1 类型化标注、一对一匹配、FP_citation、零支持、bbox 约定、手算夹具 |
| 14 F4 契约 | ACCEPT | §11.3 `forecast_sha256/input_snapshot_sha256/evidence_available_date`、资格规则 |
| 15 双源独立性 | ACCEPT | §5.5 `upstream/independence`、`same_feed → adapter_check`、观测键含 `period_start/duration`、`asOf` 取最大 |
| 16 无发布证据门 | ACCEPT | §10 发布清单、不可豁免项、校验器重算 |
| 17 人工记录只验格式 | ACCEPT | §8 种子重算、合计重算、80% 阈、follow-up 关闭；§9 `index.json` 每轮哈希与编号覆盖 |
| 18 证据被覆盖 | ACCEPT | §6.1 run_id 命名、文件全量、表为展示上限；cron 延后 |
| 19 结果/模式矛盾 | ACCEPT | §3.3 归约表、§7.1 模式矩阵、§1.1 命令含 `--write-db` |
| 20 持久化非原子 | ACCEPT | §6.3 顺序、幂等键、resume |
| 21 origin 约束冲突 | ACCEPT | §6.2 去掉该约束，`eval_run_id` 用 `restrict` |
| 22 读路径不可得 | ACCEPT | §5.3.2 提示读取器特权；§6.2 `detail` 列存定位 |
| 23 集成顺序 | ACCEPT | §15 F6-A 独立于规格二、F6-B 在 F2-3/F2-6 后；§13.3 负例走支持的写路径 |
| 24 变异测试只测校验 | ACCEPT | §13.1/§13.3 变异作用于读结果（装饰器），黄金不动 |
| 25 CI 工件 | ACCEPT | §7.3 显式 `reports/evals/**`、`if: always()`；§13.4 集合相等 |
| 26 cron | ACCEPT | §7.3 延后到 F6-后续 |
| 27 EVIDENCE.json 非语料 | ACCEPT | §2/§5.4 只用已转录单元格（36 格），LPR 行与资产 `unavailable` |
| 28 估算与决策 | ACCEPT + OWNER | §15 重排、§16 D1–D8 |

## 第二轮（02）新发现

| # | 决定 | 实施 / 理由 |
|---|---|---|
| N1 归约不完整 | ACCEPT | §3.3 所有 kind 的案例结果 → 计数器映射一张表；dual_source 恢复 `max_fail=0`（已处置 fail 不计）；reference 结果走同一归约 |
| N2 单位错误变 missing | ACCEPT | §4.2 `target.unit` 对 present/missing 都必填；§5.1.2 不按单位过滤，单行不同单位 → `unit_mismatch`；`expected_absent` 单列 |
| N3 文件绑定仍是可见性查询 | ACCEPT | §5.1.1 明确评的是"当前解释"；特权运行区分 `not_visible(quarantined | superseded_generation)` 归覆盖维度 → `incomplete` |
| N4 CN/metrics 适配不完整 | ACCEPT | §4.2 `document_id.kind` 映射表（accession→`source_ref`，巨潮→`document_ref`，未挂接→`read_error`）；metrics 类型化 target + 实时 `derive` |
| N5 来源链只验字段存在 | ACCEPT | §4.6 `sha256` 必填；§5.1.4 特权解析桶对象、`factsByIds`、`producer_code_version`；不可解析 → `provenance_incomplete` |
| N6 frozen/live 共文件 | ACCEPT | §4.1 分 `.frozen.json/.live.json`；§5.3.1 `setup` 配方（含 `today`、同步顺序、隔离处置、配置哈希）与 `setup_mismatch`；重录只增不改，`--supersede` 需已批准账本；测试重录被拒 |
| N7 账本忽略代码对 | ACCEPT | §5.3.3 命中六元组 + `state_rev` 对 + `changed_fields` 全覆盖；`approval_ref` 指 PR 审核而非提交哈希 |
| N8 自声明的独立性 | ACCEPT + OWNER | §4.4 集级字段与 `recorders.json` 版本化；§10 清单默认只接受 `enforced`，`process` 需 `waivers`（§16 D2） |
| N9 对照隔离 | ACCEPT | §5.4 `ReferenceResult` 运行时严格键集合、反射断言无写方法、哨兵值跨 API/日志/`.md`/`summary` 断言、anon 构造 |
| N10 受限工件路由矛盾 | ACCEPT + OWNER | §4.5 类别在序列化前决定目的地；受限集 `ci` 不运行；`--redact` 扩模式与范围；受限 kind 在许可决策前不启用（§16 D8） |
| N11 数值往返 | ACCEPT + OPEN-verify | §6.2 `left_text/right_text` 生成列；§5.2 三层测试（pg 往返、PostgREST 录制夹具、生产人工核对）；§17.6 |
| N12 resume 幂等 | ACCEPT | §6.3 23505 内容比对、`case_id` 必填约束、终态命中数检查、resume 先验报告哈希、并发测试 |
| N13 清单信任声明 | ACCEPT | §10 校验器打开文件重算 gate、核对 `report_sha256`、拒绝 `ci`/合成/脏/错提交/`adapter_check`、范围绑定、不可豁免项 |
| N14 人工记录可空洞 | ACCEPT | §8 `agree+disagree ≥ 0.8×selected`、`basis_review` 进 follow-up、绑定 `evaluated_run_id`；§9 `target_git_ref`、`unverified_target`、`implemented_in` |
| N15 验收测试证不了失败 | ACCEPT | §1.1/§13.3 三条路径经同一入口（装饰器改值 / 去必需案例）并断言退出码；必需案例缺失直接 `incomplete`，不靠比例 |
| N16 分期前提冲突 | ACCEPT | §13.2/§13.3 拆两个集成测试；§15 F6-A 只动 `dq_*`；§11.2 规格二保留自身断言至替换、IFRS 作 `optional_cases`、不静默缩减 |
| N17 双源观测不对等 | ACCEPT | §5.5 完整观测键、`asOf = max`、`same_feed` 清单拒收、已处置 fail 规则 |
| N18 29 格不存在 | ACCEPT | §2 逐格盘点：36 格可定位，LPR 行与资产 `unavailable`；§5.4 账本须绑定本次两值 |
| N19 抽取匹配不完整 | ACCEPT | §11.1 一对一匹配、值错 = FP+FN、零支持排除、bbox 约定、`occurrence` |
| N20 校准资格数据缺 | ACCEPT | §11.3 返回 `methodology_version`、`evidence_available_date`；提前量 1 天；端点 p 允许 |
| N21 gold-diff 基线 | ACCEPT | §4.4 PR merge-base / push `HEAD~1` / dispatch `origin/main`；`fetch-depth: 0` |
| N22 依赖修订 | ACCEPT | 题头与 §2 钉到规格二第 8 稿提交 `15b17e6`；`fact_state_rev` 对 anon 可用 |

## 第三轮（04，针对第 3 稿）→ 第 4 稿

| # | 决定 | 实施 / 理由 |
|---|---|---|
| R3-P1-1 清单与冻结回放/对照证据矛盾 | ACCEPT | §10 改为按证据种类认证：生产运行对 `dq_eval_runs`；`replay_frozen` 接受 `mode='ci'`，认证仓库副本 sha256 + `ci_run_url`（`ci_check:'manual'`）；`reference_regression` 接受 `evidence_class='comparison'`；§1.1 成功标准同步 |
| R3-P1-2 抽取归约把"已评分"当通过 | ACCEPT | §3.3 抽取案例 = 字段，`pass ⇔ P_f ≥ 0.95 ∧ R_f ≥ 0.95`，否则 `fail`；零支持 `skipped`；§11.1 定义 `P_f` 零预测 = 0；§13.1 增"全解析 TP=0 → fail"夹具 |
| R3-P1-3 七天宽限 | ACCEPT | §10 删除；所有证据 `evaluator_code_version == release_commit`（在线回放走库路径，重跑便宜） |
| N1 PARTIAL | ACCEPT | §3.2 定义 `evaluated_optional/evaluated` 的增量；明确各 kind 内部结果对象只是中间产物，`summary` 永远是 §3.2 形状 |
| N5 PARTIAL | ACCEPT | §5.1.4 `--verify-artifacts`（下载快照、重算 sha256、按 `raw_hash` 规则定位到值）与 `--verify-sources`（取官方文件比对 `source.sha256`）；metrics 对每个输入事实递归同样解析；清单要求 `provenance.verified` |
| N6 PARTIAL | ACCEPT | §5.3.1 `setup` 增 `initial_state`、`issuer_seed`、`setup_sha256` |
| N7 PARTIAL | ACCEPT | §5.3.3 frozen 命中加 `from_setup_sha256/to_setup_sha256` |
| N9 PARTIAL | ACCEPT | §5.4 哨兵走完整比较路径（测试读适配器对 `__canary__` 返回值）；增 (d) 用 anon 客户端真实尝试写入并断言被拒 |
| N11 PARTIAL | ACCEPT | §5.2 (b) 读路径只读文本列、API 不输出数值列；夹具同时覆盖 numeric 作字符串与作数字两种到达形态 |
| N13 PARTIAL | ACCEPT | §10 `scope.markets` 必须等于集内 subject 市场集合、`data_state_rev_min` 校验、新鲜度读 `dq_freshness`；审计开放 P1/P2 阻断 |
| N14 PARTIAL | ACCEPT | §9 `codex-audit.ts` 要求被审文件已提交并写入 `target_sha256`（字节可由 git 取回）；清单拒绝未实施/未核实的 P1/P2 |
| N16 PARTIAL | ACCEPT | §13.3 facts 集成只哈希三张 facts 表；宏观三表移到 `evals-reference.integration.test.ts`，F6-C2 标明宏观迁移为前置 |
| N17 PARTIAL | ACCEPT | §5.5 报告两边 `fact_id/raw_hash` 并特权解析；"已处置"要求隔离项 `natural_key` 等于观测键且 `chosen_fact_ids` 含所用行 |
| N19 PARTIAL | ACCEPT | §11.1 确定性配对顺序（IoU、page、bbox 字典序）；`FP_citation` 计入 FP；零预测正支持 `P_f=0` |
| N21 PARTIAL | ACCEPT | §4.4 push 用 `github.event.before`、dispatch 用 merge-base 并在 main 上跳过；§13.1 增临时 git 仓库测试 |

## 第四轮（05，针对第 4 稿；两条 P2 按 Codex 处方在第 5 稿实施，未再送审）

判语："**Verdict: not ready for implementation planning—the fourth draft closes two round-3 P1s, but the authentication rewrite and extraction matching rule introduce two P2 defects.**" 三条 R3 P1：两条 CLOSED，一条 PARTIAL（即 R4-1）。

| # | 决定 | 处置 |
|---|---|---|
| R4-1 P2 §10 对照证据继承了 `privileged=true` | ACCEPT — implemented per Codex's prescribed fix (round 4), not re-audited（第 5 稿 §10） | §10 认证表为 `reference_regression` 单列一行——运行必须 `privileged=false`（anon 读取器，无 service 密钥），报告哈希由校验器用自己的 service-role 连接对 `dq_eval_runs.report_sha256` 核对；不继承生产者的特权要求 |
| R4-2 P2 §11.1 贪心配对先看 IoU 后看页 | ACCEPT — implemented per Codex's prescribed fix (round 4), not re-audited（第 5 稿 §11.1、§13.1） | 候选对先限定同页且 IoU ≥ 0.5 的同值对，在其中最大化匹配数（按 IoU 降序、bbox 字典序确定性打破平手），其余再分类；增"同值跨页坐标交叉"两页夹具 |

## 汇总

- 第一轮 28 + 第二轮 22 + 第三轮 3 新 P1 与 12 条 PARTIAL 复核：全部 ACCEPT（#11、#28、N8、N10 同时标 OWNER；N11 另标 OPEN-verify）。
- 第四轮 2 条 P2：ACCEPT，已按 Codex 处方在第 5 稿实施，未再审计。
- DECLINE：0。
- OWNER 决策：§16 D1–D8。
- OPEN-verify：§17 1–8。
