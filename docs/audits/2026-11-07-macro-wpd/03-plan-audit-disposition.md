# WP-D 计划审计第 1 轮处置（2026-11-07）

来源：`01-plan-codex.md`（Codex gpt-6-astra，13 项，verdict fix required）、`02-plan-mmx.md`（MiniMax-M3，71 项，verdict fix required）。计划修订提交见 git log（`docs(macro): WP-D plan — audit round 1 fixes`）。

## Codex（C1–C13）

| # | 处置 | 落点 |
|---|---|---|
| C1 evidence.ts ADAPTERS/PATH | 接受 | Task 10 Files + evidence.test |
| C2 migration `IN` deparses as `= ANY` | 接受：按列名正则定位、断言恰一条、按名 drop、幂等 | Task 9 |
| C3 AFRE header blank shifts columns | 接受：位置映射 + 内部空头拒绝 + 标题校验 + 回归用例 | Task 3 |
| C4 AFRE daily only newest year | 接受：daily = 当年 + 上一年 | Task 4 |
| C5 types.ts type-only imports stay in closure | 接受：闭包精确清单改为保留 facts/industry/kline 的 types 文件 | Task 11 |
| C6 inputLabel/notPublic/validation | 接受：macro-inputs 自带 label/notPublic/assertInputArgs；inputs.ts 委托 | Task 11 |
| C7 grouped ingest partial accounting | 接受：分组累加一次 + 测试 | Task 10 |
| C8 redirects | 接受：recorder `redirect:'error'`；collector `allow_redirects=False` + 3xx 失败 + URL 先校验 | Task 1 / 4 |
| C9 header-mismatch test encoding | 接受：改 Unicode 再编码 | Task 3 |
| C10 python bytes literal / stub | 接受 | Task 4 |
| C11 coverage < 0.6 → regime null | 接受 | Task 11 |
| C12 witness coverage | 接受：LPR 派生用例（Task 8）、WALCL as-of 集成用例（Task 10）；`awaiting_witness` 文案按规格 §9 不做 | Task 8 / 10 |
| C13 closure gate | 接受：`v2-closure.txt` 机器可检清单（含 pa-v1/json.js） | 约定节 |

## mmx（M1–M71）

接受并已落入计划（与 Codex 重合者不再列）：M3（PBOC 列表页按声明 charset 解码，拒绝猜测）、M4/M29（recorder 校验 host/path/Content-Type、manifest 含 requested/final URL 与 discovery 链）、M5/M51/M54（标题 社会融资规模存量统计表 精确匹配、块唯一）、M8（Content-Type ↔ 函数家族准入）、M9（`/diaochatongjisi/attachDir/` 与 `/fileDir/resource/cms/` 两个精确前缀）、M10/M64（captures 只在 finally 追加一次；无重定向）、M14（AFRE 滞后 15 天写明证据）、M15（RRPONTSYD 为成交额、immutable 理由写明）、M23（上线顺序六步、失败即停、v3 判断出现才算完成）、M24/M25（迁移按名、幂等）、M32（定位器复读用 canonical 文本不用 Number）、M33/M62（claims 非致命、HTML 结构检查失败保留证据）、M43（“目录版本 B”与“方法 v3”用词分开）、M44（`build-replay-fixture.ts macro --check`）、M45（同步测试断言 v2 行不变、hash/pin/code_version）、M47（备忘录区分一手发布方与 FRED 再分发）、M53（表头空白归一化）、M58（daily 含上一年页）、M65（事件输入唯一性由解析器与观测主键保证，注明）。

拒绝（含理由）：
- M1/M26/M27/M28 两次目录升级 + method_manifest + transmission：任务书明确“目录只升一次、v3”，method_manifest / transmission 不在 WP-D 归属（交接 macro-p5；规格 §5.8 请 macro-p5 修订）。
- M7 `evidence_adapter_mismatch`：ingest payload 无 adapter 字段，adapter 只能来自目录，无第二来源可比。
- M11/M12 事件 kind 名与 evidence 形状：US `policy_target_change` 原样不动；CN 新 kind `policy_rate_quote_change` 是有意的区分；`evidence` = 观测 id（与 US 事件一致，观测行再指向 retrieval+locator，可回放）。
- M13 `CN_LPR_1Y` 复用 id：该行此前 `missing`，库中无任何观测，无需 supersession。
- M16/M17 firstPeriod / 105 天：firstPeriod = FRED 序列页“Data ranges from …”的官方首期；105 天只是“回填已完成”的判定窗（否则每日全量重取），不影响数据。
- M18/M40 月度行定义：`month_end` 既有语义 = 日历月为 period_end、值 = 月内最后一次观测、见证另算；名称已写明“月内最后一次周观测”。
- M19 `displayInputsOf` 排除 weekly：派生的月度行（`US_WALCL`）是 monthly，自然包含；原生周行本就不该进展示冻结。
- M20 贡献算术：贡献 = 权重 × support（regime.ts 既有公式），mmx 算错；Codex C11 的 coverage 修正已接受。
- M21 retire v2：沿 #129 对 v1 的惯例（注册行保留、代码注册表移除）；任务书“v2 left registered”。
- M22 `ACCEPTED_F4_VERSIONS`：文件在 WP-B 分支，不在 main；交接。
- M31 LPR 非 20 日报价：官方报价日本来就会顺延（2026-02-24、2026-06-22 已见），任何 ≥ firstPeriod 的报价日都是合法事件。
- M35 `awaiting_witness`：规格 §9 明确不在 P5 内（C6 文件）。
- M38 `changeKind:'pct'`：changeKind 是“变化如何显示”的枚举，水平量用百分比变化正确。
- M41/M42 deps 收窄：db/freshness/dq-freshness 是基础设施，不参与公式；闭包清单已改为精确断言；v2→v3 parity 测试已加。
- M48/M59 当年窗口到 12-31：实测可用（2026-01-01…12-31 返回 10 条）。
- M52/M61 发现页作为证据：没有可用定位器种类（规格不新增），发现 URL 记入 manifest 即可复核。
- M70 FRED 夹具 cosd=2015：夹具为解析回归（标注“截断”），生产回填从 firstPeriod 全量。

P3 与其余文字类建议不逐条处置。
