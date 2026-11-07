# 数据底座三 实施日志

计划：`docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md`（Codex 计划审计四轮，`docs/audits/2026-11-05-data-foundation-3-plan/`）。每任务：Sonnet 5.5 实施 → Opus 规格复审 → Opus 质量复审 → Codex review + 对抗挑战（gpt-6-astra，medium）→ 修复 → 记录。

| 任务 | 提交 | 规格复审 | 质量复审 | Codex 结论 | 修复轮次 / 备注 |
|---|---|---|---|---|---|
| 1a 迁移一表与约束 | 52c5414, 0fd6c74, 8c07f0b | ✅（偏差：两处注释改写；issuers 集成测试 helper 补 valid_to_method） | Approved（minor 4 项已修；`SCHEMA_BOOTSTRAP_SQL` 自 local-db.ts 导出） | review P2 curated valid_from_method；challenge P2 dfe 收件 id/日期成对 → 修复后 review 无问题 | 2 |
| 1b 迁移一函数与触发器 | 6fdef0d, 8c18dde, a651281 | ✅（偏差：首个声明测试先拒绝旧声明以避开 pending 唯一键） | Changes requested → 修复（证据键、ISIN 值守卫、NO KEY UPDATE、attach isin 来源、咨询锁测试、拒绝不校验 detail） | challenge P1 私有证据进公共 provenance、P2 锁序死锁、P2 attach 修订 ticker；review P2 定位串过滤 → 两轮修复后 review 无问题。迁移已锁但未合并，原地修改并更新锁 sha（两次） | 3 |
| 2a 数据集登记、weekly、看板下拉、raw-store | 73393c4, f324aa7, 5679252 | ✅ | Approved（minor：节奏取自清单、头注释；保留下拉回填当前选择——理由：请求在途时选项不丢） | review P2 已中止预算仍上传；challenge P2 sidecar 丢扩展名、凭据过滤 → 修复后 review 无问题 | 2 |
| 2b claim/1、provenance 白名单、attachSecurity 方法列、调用方迁移 | 6488aca, 2949f93, e48debb, fb4bc0a, 9a11f37 | ❌→✅（TS 校验须不宽于 SQL `claim_provenance_safe`；suggested_op 须为字符串） | Approved（minor 5 项已修） | challenge P1 URL 凭据绕过 ×2 轮、P2 not_found 丢证据、P2 重复提交丢 sources → 修复；review 无问题 | 4 |
| 3a GLEIF 子集、HKEX 名单解析、核对记录 | 7507df2, 5ec2289, aa7cd12 | ✅（偏差：nodim、实际表头、.xls 文件；均实测） | Changes requested → 修复（ISIN 占位不计拒绝、图例行 non_data、-OLD 计数器剔除、GLEIF 全坏校验位测试） | challenge P2 .xls 以 xlsx MIME 入桶 → raw-store/桶 MIME 增 xls（迁移一原地改并更新锁）；review 无问题 | 2 |
| 3b OpenFIGI 适配器 + 无 key 实测 | 4189b45, a27a7c1, 250a894, a6a9212, 39d7e3f | ❌→✅（verification.md 交易所码按实测补 UA/UP） | Changes requested → 修复（复用 createPacer/可中止 sleep、预算不足不退避、共享退避、字段类型校验、夹具存在断言） | challenge P2 失败响应未入桶、节流跨调用失效、EXCH_MAP 原型属性；review 轮 2 P2 读体失败不重试；轮 3 P2 排队请求越过退避、预算不足不发布退避 → 均修复，末轮无问题 | 4 |
| 4a 标识符写入规划与应用 | 3f28c93, 65484a9, 867e46a | ✅（偏差：共映射 attach 声明加证据注记） | Approved（minor 7 项已修） | review/challenge P1 跨 ISIN FIGI 歧义仍自动写、P2 既有 FIGI 吞掉候选、HKEX 更正基于错误现值、OpenFIGI 证据去重丢失 → 修复后 review 无问题 | 2 |
| 4b fill-identifiers 驱动、E1 覆盖、fill-cninfo-org-id 改写 | 2b9f900, 7c85a51, 1784cf7 | ✅（偏差：HKEX 按文件 MIME、makeBudget(null)、RawKind cninfo） | Approved（minor 5 项已修，内存 rpc 不复刻安全检查——注释说明） | challenge P1 cninfo provenance 覆盖丢失 → 新增 SQL `set_issuer_identifier`（迁移一原地改，更新锁）；P2 未命中响应未入桶、mtime 冒充下载日 → 修复；review 无问题 | 2 |
| 5a 持有区间回填、E2 | 1f679ac, 3181d65, 4e9d1db | ✅（commander 批准偏差：新增 SQL `set_security_window` 于迁移一原地，更新锁；规划只传单键 provenance） | Changes requested → 修复（声明 attach/backdate 加同一 ticker 咨询锁、隔离后仍尝试关闭、内存 rpc not_found） | challenge/review P2 冲突挂旧键、双冲突丢证据、短页截断、缺 .BJ、最早行竞态、新鲜度误判、tie 页静默截断 → 两轮修复后 review 无问题 | 3 |
| 5b resolveIssuer asOf + resolve 路由 | f044fea, e6bcbe6 | ✅ | Approved（minor 3 项已修；public-route 改用 asOf） | review 与 challenge 均无问题 | 1 |
| 6a SEC submissions 抓取/解析/证据脚本/分页实测 | 09b75c9, 1305fb8, 4f42c19 | ❌→✅（恢复计划定位串格式、`SubmissionFiling` 不加必填 index） | Changes requested → 修复（全进程单一 SEC pacer 覆盖 companyfacts、失败证据挂 sha/path、非 primary 不猜、自身行冲突改 window_conflict、dry-run 规范化） | challenge P2 缺失列表变 []、每次调用新 pacer、冲突证据缺快照；review P2 冲突定位串指向错误下标 → 修复后无问题 | 3 |
| 6b load-sec 换码检测（E3） | 27d503e, 7c22918, 6b4e252 | ✅（commander 批准偏差：新增 SQL `patch_security_provenance`、`close_security_absent`（标记校验）；`set_security_window` 只做 delisting 并删除旧签名；迁移一原地改，更新锁） | Changes requested → 修复（拒绝路径留回执、claim 修复按本次关闭证据、全量分页、cadence 取自清单） | review P1 规范化 ticker 未用于确认；challenge P1 并发快照误关、拒绝行当缺失、ticker 身份不一致；P2 claim 不可恢复、签名重载、交易所文件未归档、last_seen 推断 → 两轮修复后无问题 | 3 |
| 7a 名称归一、A+H 配对 | 4146dde, 675d23e, 388ba8d, 4c9556f | ❌→✅（自动挂接只凭 HKEX ISIN；其余一律 claim/隔离；HKEX ISIN 来源；5 名实测抽查：HKEX 用简称，规则 2 命中率低，已记录） | Changes requested → 修复（稳定隔离键、mapTickers 失败入账、预索引） | challenge P1 -OLD 计数器可自动挂接；P2 去重先于校验、冲突证据丢失、job error 当空跑、候选选择；轮 2 P2 证据去重、未确认提示压制规则 2；轮 3 P2 多竞争者证据 → 全部修复，末轮无问题 | 4 |
| 7b ah-link 集成测试 + claims 路由 | 5965308, 8b03c81 | ✅（集成测试按 7a 落地行为重写；404 体 `{id,error:claim_not_found}`） | Changes requested → 修复（修订仅限 evidence_only、AMEND_OPS 三项、attach 修订需 ticker、记录 error.details） | review/challenge P2 非 evidence_only 修订落到 500 → 修复后无问题 | 1 |
| 8a 迁移二（一）：受理列、based_on_lineage、谱系读写、set_merge/set_dissolved | bfbd6ac, 51647ff, aa86d20 | ✅（偏差：拓扑守卫测试改用无引用方新发行人；database.types 留给 8c） | Changes requested → 修复（迁移重放全套件串行化咨询锁、空周期测试先取周期锁、锁序注释、非活跃发行人写指标 → stale_computation） | review P2 无周期时登记丢失（按决定 #6 由首周期重枚举，加注释与测试）；challenge P2 topology 占位 fetch_key 使显式同步失败 → sync.ts 视为缺失并推导 | 2 |
| 8b 迁移二（二）：fact_promote_rows 谓词、adopt_candidate、restore_reconciled、resolve_lineage_conflict | b4ea9a0, f99e785, ef8430a | ❌→✅（补 T6 新谓词的 restore 跳过用例、零版本 replay_required 用例） | Changes requested → 修复（锁内复核谱系目标与活跃、日期按 date 比较、scope_missing、target_not_active） | review/challenge P1 通用 resolve_facts_quarantine 绕过恢复哈希 → 迁移二重建并对 reconcile_mismatch/lineage_conflict 拒绝（use_dedicated_resolver）；P2 采用候选未查全谱系 → 全谱系锁与冲突检查；重放事务 deadlock_timeout=50ms 消除并发死锁 | 3 |
| 8c 迁移二（三）：游标函数、apply_reconcile_result、open_reconcile_cycle、锁定 | 1d6da0e, 5c79e7d, 6917afa | ✅（段号 12–14；fence 发行人不变式成立并测试） | Changes requested → 修复（UUID 规范化、已隔离行失败比较仍开 mismatch 项、周期内键全局唯一、项创建咨询锁、测试改进） | challenge P2 未校验冻结键集合、非 compared 可授予恢复；review P2 UUID 文本比较 → 修复后无问题。迁移二已锁未合并，原地修改并更新锁 | 3 |
| 9a FactsDb 扩展（三实现） | 0bf3b19, d59339f, fe4d167, 0444c67 | ✅（偏差：新增错误码映射；内存实现对齐落地 SQL） | Changes requested → 修复（SQL apply_reconcile_result 显式两侧校验 invalid_result、filingsForCalendar 按键分页去重与缺运行行一致省略、内存主键、UUID 全边界小写、信封严格解析） | challenge P2 内存接受 numeric compared 空值；review 轮 3 P2 UUID 部分规范化回归 → 修复后无问题。迁移二原地改并更新锁 | 4 |
| 9b FactsDb 共享契约用例（内存 + pg） | 7535a0d, a56c7bf, e209cef | ✅（cycle 辅助改键数组；夹具适配 pg 约束） | Approved（minor 5 项已修） | challenge P2 includeNonOk 用例无非 ok 行、stale 用例未单改成员 rev、采用用例缺"无 ok 竞争者"争议 → 加强；内存与 pg 无分歧 | 2 |
| 10 物化谱系契约 + 公共读路由 | f47981b, 51ecae3, 1683104 | ✅（偏差：sync-us 集成测试竞态包装改为 readFactsLineage） | Changes requested → 修复（冲突读取 limit:1 且不传播 truncated、历史 asOf 缓存说明、basedOn 缺目标抛错、metrics 参数先校验） | challenge P2 重试未重解目标、空结果跳过后置守卫、metrics 丢 conflicts → 修复后无问题 | 2 |
| 11 resolveFactsItem 分派 + quarantine 路由 + --pending-hooks（E8） | 0094157, d513043, a4b2a10 | ❌→✅（batch_mismatch 恢复为 500） | Changes requested → 修复（patch_quarantine_detail 先删旧签名、扫描逐项容错、谱系物化用持久化目标、restore_note 统一于 detail） | challenge P2 旧扫描覆盖新 pending 钩子 → patch_quarantine_detail 增 p_expect_hook_at CAS（迁移一原地改）；P2 恢复审计用重试体、扫描吞写失败 → 修复后无问题 | 3 |
| 12 SEC 受理时刻 + enrich-acceptance（E7 报告）+ sync 9b | 997bd69, c519460, 8118c46 | ✅（E7 实测需生产库，未跑——owner 事项；记录器延至 14c） | Changes requested → commander 决定：不可解析项（日期不符/歧义/未找到）为信息码不计 failed；3 年回看窗口（--full-history 解除）；冲突单错一条；sec-submissions 冲突副本不再后者胜；报告单查询 | review P2 失败未进回执、预算未查；challenge P2 无时间戳跳过比对、跨页歧义丢失 → 修复后无问题 | 3 |
| 13a 对账类型补全、精确十进制、inputs-hash、record.ts | 4bf500b, e1220d8, 33e45b5, 712d0eb | ✅ | Changes requested → 修复（比率按有效位、通过与否只按精确比较并在 detail 留 tolerance_exact/abs_diff_exact；record 字符串/非负/kind/outcome 运行时校验并规范化写入；decimal_overflow；穷尽检查；可注入 now） | review/challenge 首轮无问题；修复后 P2 自适应精度上界溢出 → 封顶 500 并加边界测试 | 2 |
| 13b 有界 XML 分词器 + iXBRL 子集解析 | ba8a6c0, b116bc6, 90cfb0e, 2972c14 | ✅ | Changes requested → 修复（script/style 结束标签不再整体小写——İ 偏移；文本前导负号 unsupported(sign)；缺 contextRef/unitRef、decimals 校验、重复属性、上限测试、scheme trim） | challenge P2 元组嵌套事实、单位命名空间、DEI 冲突取首、continuedAt 片段、超长数字中止全文 → 修复；末轮 P2 decimals 前导 + → 修复 | 3 |
| 13c iXBRL 裁剪器 + SEC 录制脚本 | a1d9562, 1abfcd0, 1338df3 | ❌→✅（嵌套事实丢失、祖先命名空间丢失） | Approved（minor 已修） | challenge P2 祖先命名空间、元组升格、重复 id 覆盖、嵌套事实、原始响应未入桶 → 加裁剪后等价性安全网 + 修复；轮 2 P2 维度上下文、resources 作用域 → 修复后无问题 | 2 |
| 14a 对账对登记、谱系同日对、美股 plan2 黄金对、inputsHashNow | 9f4eb18, e5e8a30, e142d32 | ✅ | Changes requested → 修复（谱系冲突仅对参与事实延缓、跨市场同键冲突 lineage_key_collision、仅失败时查谱系、无 as_of 只记录不隔离、冻结条目变更 entry_changed、经内存 apply 的端到端测试） | challenge P1 历史条目按今日解析持有人、合并后读目标绕过谱系冲突；P2 同发行人重复成员 → 修复；轮 2 P2 冲突延缓过宽 → 修复后无问题 | 3 |
| 14b 对账周期运行器 | c1a6e47, c2c8d84, 6769050 | ❌→✅（钩子 CAS、新鲜度可恢复） | Changes requested → 修复（批次异常收尾、新鲜度按序、targetOf 逐项、flush 不抛、attempts 说明） | review/challenge P1 钩子完成覆盖新 pending、P2 结算后新鲜度不可恢复；轮 2 P1 周期 detail 读改写丢 pending_members、P2 新鲜度非幂等 → 迁移二新增 `settle_reconcile_cycle`、`record_cycle_freshness`（原地改并更新锁）→ 无问题 | 3 |
| 14c 对账 cron、脚本、生产依赖、Step 3b 接线 | c2bd48d, 1b53450, 577486e, 39ab62e | ✅ | Changes requested → 修复（参数解析/CN 门纯函数替代派生进程测试、路由用 cnPairEnabled、记录去重） | review P1 iXBRL cron 先于对登记（移至 15a）；P2 追踪清单缺 admin 路由、脚本缺 CN 门、CN 门测试未触达 → 修复；轮 3 P2 去重比较数值列、并发 → detail 精确串比较，并发重复记为可接受（§15） | 3 |
| 15a 样本模型 + us.companyfacts_vs_ixbrl 对 | 46a40f3, 9b4a8dc, 67552d2 | ✅（共享 secPacer、vercel 条目在此加回、失败体入桶、doc_url 无查询串） | Approved（Important：标签回退不一致改 review_item 不隔离；429 即停；超大记录大小） | challenge P2 左侧精度由规范值推导、dry-run 写生产桶、字节上限在下载后、缺必选黄金 ticker 未报 → 修复；review P1 样本清单缺失（15b 同 PR 补） | 2 |
| 15b AAPL/MSFT iXBRL 录制、样本生成器、样本 v1 | e91bd7a, ea16739, 6caa5a4, 5a59b0f | ✅（两侧独立枚举、全部 both 属实） | Approved（minor 6 项：字节上限、目录存储不驻内存、仅保留入选 bytes、universe 失败入 unmet、usage、交易所大小写） | challenge P2 下载失败后样本静默缩水、生成证据未留存、测试不能发现键缺失；review P2 同 CIK 去重 → 修复；轮 3 P2 重取失败中止全跑 → 修复后无问题 | 3 |
| 15c 离线集成：美股 iXBRL 对与谱系同日对（critical） | 2874999, f4854e1 | ✅（ADMIN 插入为无害偏差） | Approved（minor 3 项已修） | challenge P2 期望键取自 runner 自身、谱系套件与 dq-extensions 锁序相反 → 修复（独立键集+归属断言；lineageStage 先取 pair advisory lock）；复审无问题 | 2 |

- 2026-11-06 合并 origin/main（#104 A 股真实夹具与 §15 验证）：冲突 3 处——criticalSuites 并入 sync-cn；sync.ts 取 main 的 idle 心跳逻辑并保留本分支 inventoryEntry(dataset).cadence；vercel.json 保留 CN facts-sync 与两条 reconcile cron。typecheck/lint/相关单测与 sync-cn/sync-us/facts DB 套件全绿（2329970）。计划二 §15 1/4/5 公告日验证已由 #104 完成，本计划不重做。
| 16a A 股黄金集校验器与 cn.tushare_vs_cninfo_pdf_gold 对 | 4c24061, 34d5f6d | ✅（逐块等同计划） | 初审 Changes requested（测试强度：绑定唯一性、left_ambiguous/过滤/钉住、错误原因断言）→ 已补 | challenge P1 钉住事实跨文件被替代致误判 passed → incomplete_gold(entry_changed, binding_changed)；P2 合并发行人/多 ticker 同发行人 → 按 filing 所有者分组；P3 日期/时间戳/report_type 校验 → 修复；复审无问题。黄金文件仍不建（决策 C：抄录人/复核人未定；TUSHARE_TOKEN 已可用） | 2 |
| 16b A 股样本清单与 PDF 上传脚本、抄录指引、降级记录 | 593c12e, 18b9b52 | ✅（脚本逐块等同计划；降级条件四项全成立） | Approved with notes（措辞：disclosure_date 录制不依赖决策 C；recorded_at 时区格式；sha256 小写 → 指挥者文档修订 18b9b52） | review/challenge 均无问题 | 1 |
| 17b 申报人类别库与脚本（10-K 封面，逐财年） | 4d7f492, 1d342ea, 202a746 | ✅（偏差：共享 secPacer、计数忽略 .meta.json、测试去掉不存在的 action 列——均合理） | Changes requested → 已修（流式 50MB 上限复用 readLimited；逐文档隔离并必收尾批次；类别判定去重到 filerClass；补测试） | challenge P2 零预算记 fresh、坏文档中止整批、并发旧快照覆盖新证据；review P2 解析异常逃逸 → 前两项修复；并发覆盖记为已知限制（表无可排序列，需加列，后续项）；复审 P2 filerClass 漏识无连字符 non-accelerated → 修复后无问题。live 冒烟：AAPL 3 行 large_accelerated FY2024–2026 | 3 |
| 17a 日历规则 calendar.ts（期限表、Rule 0-3、52/53 周、状态矩阵） | 8081cb1, e15e7da | ✅（逐块等同计划；日志由指挥者另提交） | Changes requested → 已修（52/53 周 +7 规则为计划缺陷：改为 c/c+7 取近锚月末；回退锚 nearestMonthEnd；假日表补 2021–2023；rollForward 超限抛错） | challenge/review P2 回退锚未归一、估计期末挤掉有上游证据的已结束期 → 修复；裁决记入接口对齐记录 #69–72；复审无问题。sec.gov 闭馆公告用默认 UA 重取 200：2024-12-24、2025-12-24/26 已证实，2025-01-09 未证实；2021–2025 假日未经 OPM 复核（指挥者按观察日规则复算一致） | 2 |
| 18a 日历遍协议与期望写入 calendar-sync.ts | 2fd099b, 86394d3, aec0f18 | ✅（逐块等同计划；sidecar 计数偏差合理） | Approved with notes（批次收尾、CN 上传失败显式错误、端口单测 → 已修） | challenge/review P2：遍后异常致批次永久 running、档案写入绕过遍栅栏、历史页证据引用主页 sha、桶写失败记成功、0231 类无效财年末 → 全部修复；档案栅栏改为 replace_filing_expectations 5 参同事务（迁移一原地改+锁 sha，接口对齐记录 #73），DB 用例与 test:migrations 通过；复审 P2 证据页按 accession 取最后一份 → 改 (accession, filingDate) 键；再审无问题 | 3 |
| 19a /api/admin/dq 读模型扩展（日历、声明、按对账对、market） | f272c11, 3afa741 | ✅（偏差：按对 distinct natural_key 取最新行计数，执行 14c 裁决） | Approved with notes → 已修（restorable 实时核对限 25 次/并发 4/按请求记忆，超限 restorable_checked:false） | review/challenge P2 每次加载下载全部对账历史 → 迁移一新增 dq_reconcile_failed_counts() 与索引（接口对齐记录 #74，DB 用例与 test:migrations 通过）；P3 未上游行先限 100 再排序 → 查询内按应披露日排序；复审无问题。已知限制：离开样本的键保留最后一次失败计数 | 2 |
| 18b 生产装配、cron /api/cron/filing-calendar、脚本、vercel.json、日历集成（critical）＋ CN disclosure_date 真实核对 | 46c5b70, f82be60, 363f207, 858b7dd | ✅（5 参 replaceExpectations、64 位 sha、DB 5/5） | Approved with notes → 已修 | challenge P2 预览仍上传生产桶、CN code=0 响应不验形状/has_more 致虚假 overdue → 修复（raw 注入；bad_shape/has_more → unavailable；无排期行的期间保持 unknown_upstream）；复审无问题。真实 Tushare disclosure_date（600519.SH、000333.SZ）：HTTP 200 code=0、无积分错误；actual_date 与利润表 rt1 最早 ann_date 44/44 期一致、仅排期时为 null；ann_date 为排期记录日；modify_date 为修订时间戳 → CN_DISCLOSURE_VERIFIED=true（363f207）。--no-db 网络冒烟 AAPL/COST/WMT 通过 | 2 |
| 19b /admin/dq 页面面板与 i18n（对照 Claude Design 画布） | bbf66ae, 2af023c | ✅（布局按画布 7 个 artboard；未建画布额外项均非计划/规格要求） | Approved with notes → 已修（无障碍名与 aria-expanded、issuer_not_active 文案、未知 deadline_state 兜底、改正表单共享草稿与焦点回归） | challenge/review P2：成功恢复读错 restore_note 字段、候选/谱系行的通用 Accept 绕过所选项 → 修复（successNoticeCode/conflictCode、quarantineActions 纯函数按原因给按钮与 POST 体并单测；歧义行"采用所选/仅确认知晓/拒绝"，谱系行"按所选保留行接受/拒绝"）；复审无问题。未在浏览器中运行（本 worktree 无 .env.local/管理员会话）→ E9 owner 目检 | 2 |

## Task 20 收尾（2026-11-07）

### 门禁（HEAD dc0b281，含 19b 修复 2af023c）

| 命令 | 结果 |
|---|---|
| `npm test` | 341 文件通过、30 跳过；3596 通过、384 跳过（共 3980），0 失败 |
| `npm run typecheck` | 退出 0 |
| `npm run lint`（`--max-warnings=0`） | 退出 0 |
| `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db` | 末次：371 文件通过、3978 通过、2 跳过；`criticalSuites:31`、`criticalPassed:383`、`criticalSkipped:0`、`migrations:52`，无 inventory drift（PostgreSQL 17.10，隔离集群，已清理） |
| `... npm run test:migrations` | PASS：fresh schema equals seeded upgrade；现有行保留；两个本地集群已停止 |

`test:db` 本机偶发失败：同一 HEAD 上连续三次全量运行，第 1 次 `dq-extensions.integration.test.ts` "read_facts is a wrapper…"（`deadlock detected`），第 2 次 `owned-process-group.test.ts`（真实进程组终止），均与本机其他进程并发运行同时发生（`ps` 见另有 vitest/postgres 进程）；两个文件单独重跑 55/55 通过，第 3 次全量全绿。第 1 次失败的是计划自身的 critical 套件，死锁在并发负载下出现、单独重跑不复现，未在代码里修（不属本任务；若 CI 上复现请回到 Task 8 系套件查锁序）。

### 真实 SEC 冒烟（无库写入，默认 UA，详见 `verification.md` "日历冒烟（2026-11-07 UTC）"）

- `filer-categories.ts --no-db`（AAPL/COST/WMT）：9 行均 `large_accelerated`，`sec.filer_category` 对账 3/3 passed，failed 0。
- `calendar-sync.ts --market US --no-db`：每家 6 行，错误 0。AAPL、COST 估计行与 SEC `reportDate` 差 0–7 天；**COST 第三季度差 20–21 天（pending，不产生 overdue）**，±7 天对 12/12/12/16 周型申报人不足；WMT 无估计行。
- US 对账冒烟：`reconcile.ts` 无无库模式，记"需 owner 环境（已同步 facts.us + 样本清单）"，未改脚本。

### 退出条件

| # | 标准 | 结果 | 证据 |
|---|---|---|---|
| E1 | FIGI ≥ 95%、ISIN ≥ 90% | 待 owner 首轮 `fill-identifiers --apply` 后 `coverage.ts`（无 OpenFIGI key，按 25 请求/分钟） | — |
| E2 | 可回填行 `listing_date` 100% | 待 `backfill-windows --apply` | — |
| E3 | 换码夹具三个 asOf | 通过 | `load-sec` 单测（`npm test` 全绿）、Task 6b |
| E4 | `us.companyfacts_vs_ixbrl` ≥ 98% | 待 owner 周期回执；离线夹具（AAPL/MSFT，全部 origin=both，例外 0）已通过 `ixbrl-pair.integration.test.ts` | `ixbrl-run-<date>.md`（待产生） |
| E5 | `cn.tushare_vs_cninfo_pdf_gold` ≥ 95% | **未达成**，不报数字；降级仅因 owner 决策 C（`TUSHARE_TOKEN` 已可用、真实 Tushare 夹具已并入） | runbook 9.5、`verification.md` F3-6 |
| E6 | 每个范围内发行人有最近已结束期行 | 待 owner `calendar-sync --apply` 回执（`issuers_done`、`by_deadline_state`、`upstream_unavailable`）；`calendar.integration.test.ts` 通过 | — |
| E7 | `accepted_at` ≥ 99% | **未测量**：`enrich-acceptance --report` 需生产库（owner 动作）；逻辑与 DB 用例通过 | Task 12 |
| E8 | `ambiguous_value` 选定 → 读接口值与 `based_on_lineage` 变化 | 通过 | `dq-extensions.integration.test.ts`（含 `resolveFactsItem` 分派） |
| E9 | 下拉含登记表；逾期卡与日历面板按市场筛选、显示 `no_rule`/估计行 | 路由与视图单测通过；**页面未在浏览器运行**（本 worktree 无 `.env.local`/管理员会话），人工视觉验收待 owner | Task 19b 行 |

### 收尾说明

- 文档提交：runbook 第 9 章、规格三 §15（偏差表含接口对齐记录 #69–74 与实施期遗留清单）、规格一 §3.2 ISIN 撤回标注、规格二 §15 指向与分派例外、`verification.md` 冒烟节、本节。无代码改动。
- 已核对遗留清单中"Task X must…"项均已落地：`use_dedicated_resolver`/`target_not_active` 映射（`facts-resolver.ts`、quarantine 路由）、`recordDateMismatch` 接线（`deps.ts`、`enrich-acceptance.ts`）、iXBRL 对使用共享 `secPacer`（`pair-us-ixbrl.ts`）、vercel.json 含 `reconcile?pair=us.companyfacts_vs_ixbrl` 02:00 条目。
- 未能核对/未做：Task 8c 的"reconcile_mismatch 项不跨谱系"仅作为限制登记，没有另行证明；2021–2025 SEC 假日表与 `SEC_CLOSURES` 2025-01-09 仍未经 OPM/SEC 公告复核；北交所 `disclosure_date` 未抽查；E1/E2/E4/E6/E7 的生产数字与 E9 视觉验收均待 owner。

## 指挥者终审（2026-11-06）

- Task 20 文档（505d74f）Codex：challenge P1 回滚允许清空对账证据、P2 materialize 无 dry-run、calendar `--issuer` 不能与 `--apply` 同用 → 指挥者修订 runbook（e7f943d），复审无问题。
- 门禁复跑（HEAD 含 19b、Task 20）：`test:db` 连续两次 371 文件 / 3978 通过 / 2 跳过；第一次另有 1 个未处理错误来自既有 S4 `anchor-store.test.ts`（FileHandle 被 GC 关闭，计划三未触及），第二次 exit 0。Task 20 前两次运行中出现的 `dq-extensions` 死锁与 `owned-process-group.test.ts` 失败在其后 4 次全量运行中未再出现，记为本机并发负载下的偶发项。
