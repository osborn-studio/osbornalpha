# 宏观工作台 WP-D · 数据缺口 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 P5 规格 `docs/superpowers/specs/2026-11-07-macro-p5-chaosai-essence-design.md` §5（WP-D）落成三个可评审 PR：中国政策 / 信用序列（LPR 1Y、新增 LPR 5Y、社融存量同比；MLF 核实结论）、美联储流动性三序列（WALCL、RRPONTSYD、WTREGEN）、以及唯一一次目录版本升级（`CATALOG_VERSION` A（#129 所 pin）→ B）+ F4 `macro_regime@v3`；另附资产覆盖决策备忘录。每条序列必须落到现有体系：稳定 id、经济定义、单位、原生频率、可得时间、官方主机、原始证据与定位器、解析器 + 真实夹具、派生规则、修订政策、隔离规则、cron / 采集器接线、测试；缺失保持缺失。

**Architecture:** 目录是版本（`CATALOG_VERSION` 内容哈希），F4 方法按版本固定目录并把 `src/lib/macro/{catalog,regime,types,...}.ts` 纳入 `formula_hash` 闭包；因此**所有进入 v2 闭包或 `deps` 的文件只在最后一个 PR 改**（`types.ts`、`catalog.ts`、`snapshots.ts`、`freshness.ts`、`db.ts`），前两个 PR 只加解析器、夹具、采集器分支、provider 参数与单元规则（都在闭包之外）。新适配器 `official_http`（采集器 `requests.get` 经同一 `recorder.recording()` 录制，主机 = 官方站）复用 AKShare 的 ingest 批次、证据桶、定位器（`json_pointer` / `html_cell`）与 `cn-series.json` 协议；不新增定位器种类、不新增派生种类。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17）、vitest（node）、Python 3.12 + requests（采集器，AKShare 1.20.35 环境）、`pg` 集成测试。

实施分工（owner 规则）：Opus 5.5 指挥与复审；**Codex CLI gpt-6-sol（medium）写全部代码**（每任务一次 `codex exec -s workspace-write -c 'model="gpt-6-sol"' -c 'model_reasoning_effort="medium"' --skip-git-repo-check -o <out> - < <prompt>`，工作树根目录，后台 + 15 分钟看门狗）；每任务 mmx（MiniMax-M3）对抗审计，P1/P2 由 Opus 指挥 Codex 修；记录 `docs/audits/2026-11-07-macro-wpd/`（`task-<n>-{prompt,codex,mmx}.md`、`10-implementation-log.md`）。计划本身先经 Codex gpt-6-astra（只读）+ mmx 审计。

---

## 修订 B（2026-11-17，最终状态；本节优先于修订 A 与下文）

完整记录见 `docs/audits/2026-11-07-macro-wpd/FINAL-STATE-2026-11-17.md`。

- **B1 已交付**：美联储三序列（WALCL、RRPONTSYD、WTREGEN）以**仅展示**（权重 0）方式上线，走不入哈希的展示注册表（#227、#233），**没有**目录版本升级，`macro_regime@v2` 与 `macro-catalog/30bcaa2a33c5` 不变。
- **B2 LPR 1Y 经 BIS：已调研、已实现、未发布**。owner 2026-11-16 决定不申请 CFETS / PBOC 授权；BIS `WS_CBPOL`（`M.CN`）可再分发，#236 据此实现了 `macro_regime@v3`；owner 2026-11-17 决定**不发布 v3**，#238 回滚 #236。`CN_LPR_1Y` 保持 `missing`。代码停放在分支 `claude/macro-wpd-catalog-v3`，owner 未要求前不再开 PR。
- **B3 社融存量同比、MLF 1Y 保持 `missing`**：没有可再分发的官方来源（理由见最终记录 §1）。
- **B4 LPR 5Y 与报价日事件取消**：不进目录。
- **B5 “唯一一次目录升级 + v3”未发生**：下文 Task 9–12、修订 A 的 A5–A7 作废；#228 的解析器与采集器分支保留为离线、不可达的研究代码。
- **B6 剩余 owner 决定**：见 `docs/research/macro-asset-coverage-2026-11-16.md` 与最终记录 §5。

---

## 修订 A（2026-11-16，与 main 对账之后；本节与下文冲突时以本节为准）

完整对账见 `docs/audits/2026-11-07-macro-wpd/RECONCILE-2026-11-16.md`。

- **A1 权利门槛**（main #182）：中国货币网（CFETS）法律声明 §1 要求书面授权方可"电子抓取"，PBOC 法律声明未澄清商业再分发。因此 `CN_LPR_1Y`、新增 `CN_LPR_5Y` 与两个报价事件源、`CN_AFRE_STOCK_YOY` 在目录里是 **`restricted`**（`rights:'third_party'`，双语理由写明缺什么授权），**不是** `active`；owner 按 runbook §9 书面确认后才翻。受限行不进 `collectableOf`，没有任何采集器 / cron / 测试会请求它们。美联储三序列（FRED 公有领域）照原计划 `active`。
- **A2 Task 1 取代**：不提交录制器与原始响应。原始字节（2026-11-07 录制）只在本机 scratch；仓库里是 `scripts/macro/make-cn-http-excerpts.py` 产出的**摘录夹具**（`src/lib/macro/fixtures/cn-http/`：PBOC 存量表 2015 / 2019 / 2024 / 2026 的原表头与原行到存量行为止、逐单元格原样，行列下标与完整文件一致；LPR 两个合成信封 + 真实报价行；`manifest.json` 记录原文件 sha256）。
- **A3 Task 3 解析器的真实版式规则**（12 个年表核对后）：标题行 = 第一个单元格归一化后恰为 `社会融资规模存量统计表` 的唯一表；月份头 = 第一个含 `YYYY.M` 或 `YYYY.Qn` 单元格的行（2015 年表是季度头，期末月 = 3n）；其后一行为子头，成对的 `存量` / `增速（%）`（全角括号归一化）；存量行首格归一化后匹配 `^社会融资规模存量(AFRE\(stock\))?$`（2019 年表无 AFRE 后缀，后一行有孤立的 `AFRE(stock)`）；存量行下标不固定（7 或 8，有无空行），**不得写死**；列 = 按顺序的子头对。独立真值（colspan 感知网格，`afre_truth.py`）：2016–2025 每年 12 点，2015 年 4 个季末点，2026 年 9 点（10–12 月为空），合计 133 点。
- **A4 采集器**：`http_json`（含仅对 www.chinamoney.org.cn 开启 legacy renegotiation 的适配器）与 `http_html` 分支照 Task 4 写，但**休眠**：测试只用 stub，**不得请求真实站点**，无 dry-run 步骤。
- **A5 迁移编号**：`20261125090000_macro_wpd_catalog.sql`（main 最新 `20261124110000`；合并前再核对）。
- **A6 方法版本**：#132 已把 v2 的哈希集缩到 33 个文件（`v2-closure.txt`），`snapshots.ts` / `freshness.ts` / `db.ts` / `read-api.ts` 不再被哈希。Task 11 的 `macro-inputs.ts` 抽取**取消**；`macro_regime@v3` 只是 v2 的副本 + 新目录字面量 pin；v2 经迁移里的 SQL（`judgment_methodologies.status='retired'` + `judgment_methodology_events`）退役。
- **A7 唯一一次升级的时机**：任何 `restricted`→`active` 都会再次改变 `CATALOG_VERSION`。PR-3 要么在 O-LPR / O-AFRE 书面授权到位后一次性把对应行置 `active`，要么以 `restricted` 先发并接受以后的 v4；合并闸门由 commander / owner 决定。

## 仓库约定（动手前必读；每个 Codex 任务提示都附本节）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/prod-bringup-3d24d3`。分支：PR-1 `claude/macro-wpd-cn`（从 `origin/main` `0764bfae`）；PR-2 `claude/macro-wpd-fed`（从 `origin/main`）；PR-3 `claude/macro-wpd-catalog-v3`（从 **#129 `claude/integ-regime-drift` 合并后的 main**；#129 注册 `macro_regime@v2`，本计划的升级是 v3）。不要 `cd` 出去；不用裸 `git stash`（栈与其他工作树共享）。只改本任务 **Files** 列出的文件。
- **文件归属**：本计划拥有 `src/lib/macro/catalog.ts`、`src/lib/macro/{types,snapshots,freshness,cn-series,derive,events,series-extras,cycles,quality,ingest}.ts`、`src/lib/macro/providers/**`、`src/lib/macro/parsers/**`、`src/lib/macro/fixtures/**`、`scripts/macro/**`、`src/app/api/macro/ingest/**`、`src/app/api/cron/macro-sync/**`、`supabase/migrations/20261121*`、`src/lib/judgments/methodologies/macro-regime.v3.ts`、`src/lib/judgments/macro-inputs.ts`、`src/lib/judgments/registry.ts`、`src/lib/judgments/compensate.ts`（版本常量）、`src/lib/macro/strategy/{playbooks,deviations}.ts`（版本常量）、`docs/methodologies/macro_regime/v3.md`、`docs/runbooks/macro-sync.md`。**不改** `src/components/macro/**`、`src/app/**/macro/**` 页面、策略 UI、时钟 UI、`messages/*`（macro-p5 会话负责；需要它们改的点在 §交接 列出）。
- **F4 哈希红线（机器可检）**：`docs/audits/2026-11-07-macro-wpd/v2-closure.txt` = `macro_regime@v2`（#129）的 import 闭包（含类型导入与 `src/lib/research/ingest/pa-v1/json.js`）+ `deps`（`judgments/resolvers/macro.ts`、`macro/{read-api,snapshots,freshness,db}.ts`、`dq/freshness.ts`）+ 方法文档 `docs/methodologies/macro_regime/v2.md`。PR-1 / PR-2 的每个提交门禁：`git diff --name-only origin/main...HEAD | grep -xF -f docs/audits/2026-11-07-macro-wpd/v2-closure.txt` 输出必须为空（Task 5 / Task 8 的门禁步骤）。PR-3 合并前再用 `npx tsx -e "import('./src/lib/judgments/formula-hash').then(m=>console.log(m.importClosure(process.cwd(),'src/lib/judgments/methodologies/macro-regime.v2.ts').join('\n')))"` 重算一次核对清单仍准确（#129 若在此期间变动，更新清单）。
- **审计处置**：`docs/audits/2026-11-07-macro-wpd/03-plan-audit-disposition.md`（第 1 轮 Codex 13 项 / mmx 71 项的接受 / 拒绝与理由）；被拒绝的项不再在任务审计中重提，除非有新证据。
- **迁移**：只用 `20261121HHMMSS_*`；本计划只建 `20261121090000_macro_wpd_catalog.sql`（Task 9）；可重放；`supabase/migrations.lock.json` 追加 `{file, sha256}`（`shasum -a 256`）；`scripts/ci/research-checks.ts::migrationInventory` 要求未锁迁移晚于已锁最新（现 `20261118093000`；foreign research 持 `20261119*`，#121/#126 锁到 `20261118`）。
- **数据库测试**：`process.env.S4_TEST_STATE` → `adminUrl`，`describe.skipIf(!enabled)`；命令 `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db -- <path>`；`test:migrations` 同前缀。**绝不** `pkill -f "postgres -D"`。
- **采集器**：`scripts/macro/.venv/bin/python`（akshare 1.20.35、requests 2.34.2 已装）；`python -m pytest scripts/macro/test_collect.py`；真实夹具用 `--record-fixtures DIR`（Task 4 之后 http 序列也走它）；录制不需要 ingest 密钥。
- **提交**：`git commit` 单独一条命令，同一命令行不能出现 `-n` 记号（用 `git commit -F - <<'EOF'`），不用 `--no-verify`；信息末尾 `Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>`。
- **代码风格**：沿用 `src/lib/macro` 紧凑风格（单空格缩进、文件顶部职责注释含规格条目）；Python 沿用 `collect.py`。
- **测试命令**：`npm test -- <path>`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）。
- **禁用词**：代码 / 注释 / 文案不得出现 概率 / 置信度 / 胜率 / probability / confidence。
- **秘密**：永不打印 `TUSHARE_TOKEN`、`MACRO_INGEST_SECRET`；本计划不部署、不设 Vercel 环境变量。

## D0 · 来源核实记录（2026-11-07，Opus 实测；写入 runbook §10 的"WP-D 核实"小节，Task 13）

| 序列 | 实际 URL（host） | HTTP / Content-Type | 官方元数据原文 | 首期 | 结论 |
|---|---|---|---|---|---|
| WALCL | `https://fred.stlouisfed.org/graph/fredgraph.csv?id=WALCL&cosd=2000-01-01`（fred.stlouisfed.org） | 200 / `application/csv`，23 415 B，sha256 `6da6cc05…49ef`（录制时） | 序列页：**Units: Millions of U.S. Dollars, Not Seasonally Adjusted；Frequency: Weekly, As of Wednesday；Release: H.4.1 Factors Affecting Reserve Balances；Source: Board of Governors of the Federal Reserve System (US)；Tags: Public Domain: Citation Requested**；Updated Nov 5, 2026 3:32 PM CST，Next Release Nov 12 | 2002-12-18（周三）= 719542 | 可做：weekly / day（period_end = 周三） |
| RRPONTSYD | `…fredgraph.csv?id=RRPONTSYD&cosd=2000-01-01` | 200 / `application/csv`，95 777 B，6 196 数据行，其中 2 833 行值为空（无成交日） | **Units: Billions of US Dollars, NSA；Frequency: Daily；Release: Temporary Open Market Operations；Source: Federal Reserve Bank of New York**；Notes："constructed as the aggregated daily amount value of the RRP transactions reported by the New York Fed"；Updated Nov 6, 2026 1:03 PM CST | 2003-02-07 = 2.500（下一个非空 2003-03-19） | 可做：daily / day；空值 = 无操作日，**不产点**（fred-csv.ts 既有规则） |
| WTREGEN | `…fredgraph.csv?id=WTREGEN&cosd=2000-01-01` | 200 / `application/csv`，21 602 B | **Units: Millions of U.S. Dollars, NSA；Frequency: Weekly, Ending Wednesday；Release: H.4.1 … Table 1 … Week Average；Source: Board of Governors**；Public Domain: Citation Requested | 2002-12-18 = 5959 | 可做：weekly / day；值 = 该周**周平均**，不是时点余额 |
| LPR 1Y / 5Y | `https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate=YYYY-MM-DD&strEndDate=YYYY-MM-DD&pageNum=1&pageSize=50`（www.chinamoney.org.cn；无需 Referer / Cookie；**TLS 需要 legacy renegotiation**：OpenSSL 3 默认拒绝（Node fetch `ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED`、Python requests `SSLError`），Node 用 `https.Agent({secureOptions:SSL_OP_LEGACY_SERVER_CONNECT})`、Python 用挂在该主机上的 `HTTPAdapter`（`ctx.options |= ssl.OP_LEGACY_SERVER_CONNECT`）均实测 200；只对该主机放开） | 200 / `application/json;charset=UTF-8` | `{"head":{"rep_code":"200",…},"data":{"startDateCN","endDateCN","baseCurveCfgList":["1Y","5Y"],"message":""},"records":[{"5Y":"3.50","1Y":"3.00","showDateEN":"20 Oct 2026","showDateCN":"2026-10-20"},…]}`（新→旧）。窗口 > 1 个自然年 → `records:[]` 且 `data.message="只提供一年历史数据查询及下载"`（366 天即拒绝；同年 1-1…12-31 可）。2019-08-20 新机制首次报价起每月一行；此前为旧机制逐日 `1Y=4.31`、`5Y="---"`。页面 `lpr-cn.html` 只是 JS 壳；`LprHisExcel` 返回 xlsx（不收）。 | 新机制 2019-08-20：1Y 4.25、5Y 4.85 | 可做：event / day，`json_pointer` `/records/<i>/1Y`；按自然年窗口回填；`---` = 无值；**definition：仅 2019-08-20 起**（旧机制逐日报价不属于本序列） |
| 社融存量同比 | 调查统计司 › 统计数据 › `YYYY年统计数据` › 社会融资规模 › "社会融资规模存量统计表" 的 **htm**（`https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/2026101417444554195.htm`；2015–2018 年在 `/diaochatongjisi/fileDir/resource/cms/…htm`） | 200 / `text/html`，57 401 B，**gb2312**（Excel 导出 HTML，`<meta charset=gb2312>`）；**2015–2019 年表在 2025-11 重新生成，`<meta charset=utf-8>`（2019 年表 333 KB，UTF-8）**——解码必须按文件声明的 charset | 一张表：第 4 行月份头 `2026.1 … 2026.12`（每月一格，colspan 2），第 5 行子头 `存量 / 增速（%）` 交替，第 7 行 `社会融资规模存量 AFRE(stock)`：`449.11 8.2 451.40 8.2 … 468.17 7.1`（2026-09 止，10–12 月空）；单位 万亿元 / %。每年一个文件，**每月重新生成新文件名**（旧月份可被修订 → revisable）。列表页（年份栏）每年一页：2015 `2161324/2161336`、2016 `3013637/3013639`、2017 `3245697/3245811`、2018 `3471721/3471757`、2019 `3750274/3750282`、2020 `3959050/3959051`、2021 `4184109/4184110`、2022 `4458449/4458450`、2023 `4780803/4780804`、2024 `5225358/5225359`、2025 `5570903/5570885`、2026 `2026ntjsj/shrzgm`。 | 2015-01（2015 年表） | 可做：monthly / month，`html_cell`；"增速（%）" 即官方"社会融资规模存量同比增长"；**不读增量表**；PDF / XLS 不收 |
| MLF 1Y | PBOC 货币政策司 › 中期借贷便利：`125437/125446/125873`（月度"中期借贷便利招标公告"，正文）、`125437/125446/125876`（月度"操作表"，一张表：`时间 / 中期借贷便利余额（亿元）`，**无利率列**）；公开市场业务公告 / 交易公告均为正文 | 200 / `text/html` | 2026-10-23 公告："以固定数量、利率招标、多重价位中标方式开展 7000 亿元 MLF 操作，期限为 1 年期"——**2025-03 改革后 MLF 为多重价位中标，人民银行不再公布单一中标利率**；改革前中标利率只在公告正文 | — | **不可做**：无可定位的利率表格，且 2025-03 起该"利率"在制度上不存在。保持 `missing`，理由改写（Task 10）；权重 10 继续留在分母；余额表可另立 `CN_MLF_BALANCE`（owner 决策 O-MLF，本计划不做） |

资产覆盖（§5.6）本计划只写备忘录（Task 13），不加目录行。

## PR 矩阵

| PR | 分支 | 目录版本 | 内容 | 任务 |
|---|---|---|---|---|
| PR-1 中国政策 / 信用序列 | `claude/macro-wpd-cn` | 不改 | 本计划 + 审计记录；真实夹具（LPR 8 个年窗 JSON、社融 12 个年表 HTM）；`parsers/chinamoney.ts`、`parsers/pboc-afre.ts`（以夹具字节直接单测，不经 `parserFor`）；采集器 `http_json` / `http_html` 分支 + 列表页发现 + pytest；CN 报价事件 `deriveRateQuoteEvents`（新字段，不改既有 US 事件类型） | 1–5 |
| PR-2 美联储流动性 | `claude/macro-wpd-fed` | 不改 | 三条 FRED 夹具 + 解析回归；`fredCosdFor(…, firstPeriod)` + cron 回填窗口按首期；`quality.ts` 单位 `usd_mn` / `usd_bn`；weekly `month_end` 派生测试 | 6–8 |
| PR-3 目录升级 + v3 | `claude/macro-wpd-catalog-v3` | **v3（一次）** | 迁移（weekly、official_http）；`types.ts`；目录 6 行美国 + LPR 4 行 + 社融翻活 + MLF 理由；`cn-series/2` + `cn-series.json`；`parserFor` 分派；ingest adapter 按目录；`freshness` weekly；D0 `displayInputsOf`；`macro-inputs.ts` 抽取 + `macro_regime@v3`（闭包收窄）+ 三处版本常量；runbook；资产备忘录 | 9–14 |

## 文件结构

```
PR-1（claude/macro-wpd-cn）
docs/superpowers/plans/2026-11-07-macro-wpd-data-gaps.md                    本计划
docs/audits/2026-11-07-macro-wpd/{01-plan-codex.md,02-plan-mmx.md,10-implementation-log.md,task-N-*.md}
scripts/macro/record-cn-http-fixtures.ts                                   一次性联网录制器（Task 1）
src/lib/macro/fixtures/cn-http/{CN_LPR_Q-2019.json … CN_LPR_Q-2026.json, CN_AFRE_STOCK-2015.htm … -2026.htm, manifest.json}
src/lib/macro/parsers/chinamoney.ts  chinamoney.test.ts                     LPR JSON 解析（Task 2）
src/lib/macro/parsers/pboc-afre.ts   pboc-afre.test.ts                      社融存量表解析（Task 3）
scripts/macro/collect.py  test_collect.py                                  http_json / http_html 分支（Task 4）
src/lib/macro/events.ts  events.test.ts  series-extras.ts  cycles.ts       报价事件（Task 5）

PR-2（claude/macro-wpd-fed）
scripts/macro/record-fred-fixtures.ts                                      --codes 参数（Task 6）
src/lib/macro/fixtures/fred/{WALCL,RRPONTSYD,WTREGEN}.csv + manifest.json
src/lib/macro/parsers/fred-csv.test.ts                                     周频 / 空值回归（Task 6）
src/lib/macro/providers/fred.ts  fred.test.ts                              fredCosdFor firstPeriod、fredBackfillDoneBy（Task 7）
src/app/api/cron/macro-sync/route.ts  route.test.ts                        backfillComplete 按首期（Task 7）
src/lib/macro/quality.ts  quality.test.ts  derive.test.ts                  单位区间；weekly month_end（Task 8）

PR-3（claude/macro-wpd-catalog-v3）
supabase/migrations/20261121090000_macro_wpd_catalog.sql + migrations.lock.json + macro.integration.test.ts（Task 9）
src/lib/macro/types.ts  catalog.ts  catalog.test.ts  cn-series.ts  cn-series.test.ts  scripts/macro/cn-series.json
src/lib/macro/parsers/index.ts  cn-parsers.test.ts  ingest.ts  src/app/api/macro/ingest/route.ts (+test)
src/lib/macro/freshness.ts  freshness.test.ts  snapshots.ts  snapshots.test.ts  replay.test.ts     （Task 10）
src/lib/judgments/macro-inputs.ts  inputs.ts  methodologies/macro-regime.v3.ts (+test)  registry.ts
src/lib/judgments/compensate.ts  src/lib/macro/strategy/{playbooks,deviations}.ts  docs/methodologies/macro_regime/v3.md
fixtures/judgments/replay/macro-regime.json  src/lib/judgments/testing/macro-fixture.ts                （Task 11）
src/lib/judgments/methodology-sync.test.ts                                                                 （Task 12）
docs/runbooks/macro-sync.md  docs/research/macro-asset-coverage-2026-11-07.md                            （Task 13）
```

## 共享契约（各任务逐字一致）

```ts
// src/lib/macro/types.ts（Task 10 才改；前面的任务只能"假定"这些形状存在于测试用的本地类型里）
export type Adapter='fred_csv'|'akshare'|'official_http';
export type NativeFrequency='daily'|'weekly'|'monthly'|'quarterly'|'event';
export interface MacroSeriesDef{ …; /** first period of this series' definition (inclusive, ISO date): FRED cosd floor; LPR excludes pre-reform daily quotes */ firstPeriod?:string; }
```

```ts
// src/lib/macro/cn-series.ts（Task 10）
export type CnFunction='macro_china_nbs_nation'|'bond_china_yield'|'currency_boc_safe'|'http_json'|'http_html';
export interface CnSeriesSpec{ …既有…;
 /** http_json / http_html: URL template; {start}/{end} = ISO dates of a window; evidence_path_match 'exact'|'prefix' */
 url?:string;evidence_path_match?:'exact'|'prefix';
 /** http_json: JSON pointer to the records array and the record field; tenor column name */
 pointer?:string;field?:string;
 /** http_html (pboc-afre): list discovery pages {year, url} newest first; daily mode fetches only the first */
 pages?:{year:number;url:string}[];
 /** window rule for http_json: 'calendar_year' (one call per year from first_period to today) */
 windows?:'calendar_year';first_period?:string;
}
export const CN_SPEC_VERSION='cn-series/2';
```

seriesKey 约定（目录 → `cnSpecOf`）：
- `http_json|/ags/ms/cm-u-bk-currency/LprHis|1Y`（host `www.chinamoney.org.cn`）→ `function:'http_json'`, `url:'https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate={start}&strEndDate={end}&pageNum=1&pageSize=50'`, `evidence_path:'/ags/ms/cm-u-bk-currency/LprHis'`, `evidence_path_match:'exact'`, `pointer:'/records'`, `field:'1Y'`, `column:'1Y'`, `windows:'calendar_year'`, `first_period:'2019-08-20'`, `period:'day'`。
- `http_html|/diaochatongjisi/attachDir/|社会融资规模存量`（host `www.pbc.gov.cn`）→ `function:'http_html'`, `evidence_path:'/diaochatongjisi/'`, `evidence_path_match:'prefix'`, `column:'增速（%）'`, `pages:AFRE_PAGES`（下表，Task 10 写死；每年 1 月 owner 按 runbook §14 追加新年份页，**不是**目录键的一部分所以不改 `CATALOG_VERSION`——`pages` 在 `cn-series.ts` 常量里，不在 `catalog.ts`）。

```ts
// src/lib/macro/cn-series.ts（Task 10）— verified 2026-11-07 (D0c)
export const AFRE_PAGES:{year:number;url:string}[]=[
 {year:2026,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2026ntjsj/shrzgm/index.html'},
 {year:2025,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/5570903/5570885/index.html'},
 {year:2024,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/5225358/5225359/index.html'},
 {year:2023,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4780803/4780804/index.html'},
 {year:2022,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4458449/4458450/index.html'},
 {year:2021,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4184109/4184110/index.html'},
 {year:2020,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3959050/3959051/index.html'},
 {year:2019,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3750274/3750282/index.html'},
 {year:2018,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3471721/3471757/index.html'},
 {year:2017,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3245697/3245811/index.html'},
 {year:2016,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3013637/3013639/index.html'},
 {year:2015,url:'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2161324/2161336/index.html'},
];
```
（全部 12 个子页 URL 已于 2026-11-07 实测；Task 1 的录制器从年份页重新发现并打印子页 URL，若与上表不同以录制器为准并更新上表。每年 1 月 owner 追加新年份页（runbook §14）。）

```ts
// 解析器签名（Task 2 / Task 3；Task 10 的 parserFor 按 function 分派）
export function parseLprHis(bytes:Uint8Array,opts:{seriesId:string;field:'1Y'|'5Y';firstPeriod:string}):ParsedPoint[];   // locator json_pointer `/records/<i>/<field>`
export function parseAfreStockYoy(bytes:Uint8Array,opts:{seriesId:string}):ParsedPoint[];                               // locator html_cell {table,row,cell}
```

```ts
// 报价事件（Task 5）— US PolicyEvent 类型与 derivePolicyEvents 原样不动
export interface RateQuoteEvent{kind:'policy_rate_quote_change';region:'CN';series_id:string;effective_date:string;from:string;to:string;change_bp:string;source:'derived';evidence:[string,string];version:string}
export function deriveRateQuoteEvents(seriesId:string,quotes:readonly EventInput[]):RateQuoteEvent[];
export const EVENTS_VERSION='macro-events/2';
// series-extras.ts：SeriesExtras 增 `quoteEvents:RateQuoteEvent[]`（US 为 []）；`events` 字段含义不变
```

---

### Task 1: 真实夹具录制器 + 夹具（LPR、社融）

**Files:**
- Create: `scripts/macro/record-cn-http-fixtures.ts`
- Create: `src/lib/macro/fixtures/cn-http/` 下 20 个文件 + `manifest.json`（由脚本写出，提交原始字节）

- [ ] **Step 1: 写录制器**

```ts
// scripts/macro/record-cn-http-fixtures.ts
// One-time networked recorder for the WP-D official_http parsers (plan Task 1). Records the exact response bytes of
//   (a) chinamoney LprHis, one calendar-year window per year 2019..today (the endpoint refuses windows > 1 year), and
//   (b) the PBOC "社会融资规模存量统计表" HTM of every year page listed below (year page → the 社会融资规模 sub page → the one
//       a2015 block whose title is exactly 社会融资规模存量统计表 → its htm link). Discovery pages are not evidence (no locator) but
//       their URLs are written to the manifest so the chain is reviewable.
// Every request: https only, host must be the expected official host, redirects are errors, Content-Type must match the
// expected family, HTTP 200 only. Transport = node:https request (not global fetch): www.chinamoney.org.cn needs
// SSL_OP_LEGACY_SERVER_CONNECT (fetch fails with ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED, verified 2026-11-07); the option is
// enabled for that host only (LEGACY_TLS_HOSTS). Writes src/lib/macro/fixtures/cn-http/<name> and manifest.json.
// Run: npx tsx scripts/macro/record-cn-http-fixtures.ts
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const DIR=join(process.cwd(),'src/lib/macro/fixtures/cn-http');
const UA='OsbornAlpha-macro-fixture-recorder/1';
const PBOC='www.pbc.gov.cn',CFETS='www.chinamoney.org.cn';
const YEAR_PAGES:[number,string][]=[[2026,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2026ntjsj/index.html'],[2025,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/5570903/index.html'],
 [2024,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/5225358/index.html'],[2023,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4780803/index.html'],[2022,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4458449/index.html'],
 [2021,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/4184109/index.html'],[2020,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3959050/index.html'],[2019,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3750274/index.html'],
 [2018,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3471721/index.html'],[2017,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3245697/index.html'],[2016,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/3013637/index.html'],
 [2015,'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2161324/index.html']];
interface Entry{file:string;series:string;requested_url:string;final_url:string;fetched_at:string;http_status:number;content_type:string;sha256:string;bytes:number;discovery?:string[]}
/** GET with the evidence rules: https, expected host, no redirect, 200, Content-Type family. */
async function get(url:string,host:string,family:'application/json'|'text/html'){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.host!==host)throw new Error(`refused url ${url}`);
 const res=await fetch(url,{headers:{'user-agent':UA},redirect:'error'});
 const ct=res.headers.get('content-type')??'';
 if(res.status!==200)throw new Error(`${url}: HTTP ${res.status}`);
 if(!ct.toLowerCase().startsWith(family))throw new Error(`${url}: content-type ${ct}`);
 const bytes=new Uint8Array(await res.arrayBuffer());
 return {res,bytes,ct};
}
/** PBOC list pages declare charset=utf-8 (verified 2026-11-07); refuse anything else rather than guess. */
function pageText(bytes:Uint8Array,url:string):string{
 const head=new TextDecoder('latin1').decode(bytes.slice(0,2048));
 const m=/charset=([\w-]+)/i.exec(head);
 if(!m||m[1].toLowerCase()!=='utf-8')throw new Error(`${url}: unexpected charset ${m?.[1]??'none'}`);
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function record(file:string,series:string,requested:string,final:string,res:Response,bytes:Uint8Array,ct:string,manifest:Entry[],discovery?:string[]){
 writeFileSync(join(DIR,file),bytes);
 manifest.push({file,series,requested_url:requested,final_url:final,fetched_at:new Date().toISOString(),http_status:res.status,content_type:ct,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.byteLength,...(discovery?{discovery}:{})});
 console.log(`${file}\t${bytes.byteLength} bytes`);
}
/** year page → 社会融资规模 sub page → the one a2015 block titled 社会融资规模存量统计表 → its htm href. */
async function discoverAfre(yearUrl:string):Promise<{subPage:string;htm:string}>{
 const base=`https://${PBOC}`;
 const y=await get(yearUrl,PBOC,'text/html');
 const subs=[...pageText(y.bytes,yearUrl).matchAll(/href=["'](\/diaochatongjisi\/116219\/116319\/[^"']+)["'][^>]*>\s*社会融资规模/g)].map(m=>m[1]);
 if(new Set(subs).size!==1)throw new Error(`${yearUrl}: ${subs.length} 社会融资规模 sub pages`);
 const subPage=base+subs[0];
 const s=await get(subPage,PBOC,'text/html');
 const blocks=(pageText(s.bytes,subPage).match(/<table[^>]*class="a2015"[^>]*>[\s\S]*?<\/table>/g)??[]).filter(b=>/社会融资规模存量统计表/.test(b.replace(/<[^>]+>/g,'').replace(/\s+/g,'')));
 if(blocks.length!==1)throw new Error(`${subPage}: ${blocks.length} stock-table blocks`);
 const htm=/href=["']([^"']+\.htm)["']/.exec(blocks[0]);
 if(!htm)throw new Error(`${subPage}: no htm link in the stock-table block`);
 return {subPage,htm:base+htm[1]};
}
async function main(){
 mkdirSync(DIR,{recursive:true});
 const manifest:Entry[]=[];
 const thisYear=new Date().getUTCFullYear();
 for(let year=2019;year<=thisYear;year++){
  const url=`https://${CFETS}/ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate=${year}-01-01&strEndDate=${year}-12-31&pageNum=1&pageSize=50`;
  const {res,bytes,ct}=await get(url,CFETS,'application/json');
  const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(doc?.head?.rep_code!=='200')throw new Error(`LprHis ${year}: rep_code ${doc?.head?.rep_code}`);
  if(doc?.data?.message!=='')throw new Error(`LprHis ${year}: refused: ${doc?.data?.message}`);   // the only documented message is the one-year-window refusal
  if(!Array.isArray(doc?.records))throw new Error(`LprHis ${year}: no records array`);
  record(`CN_LPR_Q-${year}.json`,'CN_LPR_Q',url,res.url||url,res,bytes,ct,manifest);
 }
 for(const [year,yearUrl] of YEAR_PAGES){
  const {subPage,htm}=await discoverAfre(yearUrl);
  console.log(`AFRE ${year}: ${yearUrl} → ${subPage} → ${htm}`);
  const {res,bytes,ct}=await get(htm,PBOC,'text/html');
  const title=new TextDecoder('gb18030',{fatal:true}).decode(bytes);
  if(!title.includes('社会融资规模存量统计表'))throw new Error(`${htm}: not the stock table`);
  record(`CN_AFRE_STOCK-${year}.htm`,'CN_AFRE_STOCK_YOY',htm,res.url||htm,res,bytes,ct,manifest,[yearUrl,subPage]);
 }
 manifest.sort((a,b)=>a.file.localeCompare(b.file));
 writeFileSync(join(DIR,'manifest.json'),JSON.stringify({recorder:'record-cn-http-fixtures/1',files:manifest},null,1)+'\n');
}
main().catch(e=>{console.error(e);process.exit(1);});
```

- [ ] **Step 2: 运行并核对**

Run: `npx tsx scripts/macro/record-cn-http-fixtures.ts`
Expected: `2019..<当年>` 每年一行 `CN_LPR_Q-YYYY.json`（2026 年运行 = 8 行），12 行 `CN_AFRE_STOCK-YYYY.htm`（2015…2026），12 行 `AFRE <year>: … → <sub page> → …htm`；无异常。把 12 条 sub page URL 与 §共享契约 `AFRE_PAGES` 逐条比对，不同处以录制器为准改表（记入 `10-implementation-log.md`）。

- [ ] **Step 3: 人工复核三个值对得上原始字节**

Run: `python3 -I -c "import json;d=json.load(open('src/lib/macro/fixtures/cn-http/CN_LPR_Q-2019.json'));print([(r['showDateCN'],r['1Y'],r['5Y']) for r in d['records'][:5]])"`
Expected: `[('2019-12-20','4.15','4.80'),('2019-11-20','4.15','4.80'),('2019-10-21','4.20','4.85'),('2019-09-20','4.20','4.85'),('2019-08-20','4.25','4.85')]`
Run: `iconv -f gb2312 -t utf-8 src/lib/macro/fixtures/cn-http/CN_AFRE_STOCK-2025.htm | grep -o '社会融资规模存量 AFRE(stock)' | head -1`
Expected: 一行命中。

- [ ] **Step 4: 提交**

```bash
git add scripts/macro/record-cn-http-fixtures.ts src/lib/macro/fixtures/cn-http
git commit -F - <<'EOF'
test(macro): record official_http fixtures for LPR (chinamoney) and AFRE stock tables (PBOC)

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 2: LPR 解析器 `parsers/chinamoney.ts`

**Files:**
- Create: `src/lib/macro/parsers/chinamoney.ts`
- Test: `src/lib/macro/parsers/chinamoney.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/macro/parsers/chinamoney.test.ts
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {ChinamoneyParseError,CHINAMONEY_PARSER_VERSION,parseLprHis} from './chinamoney';

const FIX=join(process.cwd(),'src/lib/macro/fixtures/cn-http');
const manifest=JSON.parse(readFileSync(join(FIX,'manifest.json'),'utf8')) as {files:{file:string;sha256:string}[]};
const bytesOf=(file:string)=>{const b=new Uint8Array(readFileSync(join(FIX,file)));expect(createHash('sha256').update(b).digest('hex')).toBe(manifest.files.find(f=>f.file===file)!.sha256);return b;};
const enc=(o:unknown)=>new TextEncoder().encode(JSON.stringify(o));
const doc=(records:unknown[],data:Record<string,unknown>={})=>enc({head:{rep_code:'200'},data:{startDateCN:'2026-01-01',endDateCN:'2026-12-31',baseCurveCfgList:['1Y','5Y'],message:'',...data},records});
const codeOf=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return (e as {code?:string}).code??String(e);}};
const Q1={seriesId:'CN_LPR_1Y_Q',field:'1Y' as const,firstPeriod:'2019-08-20'};

describe('parseLprHis (real fixture bytes)',()=>{
 it('2019: five reform-era quotes, ascending, pre-2019-08-20 daily rows and "---" excluded',()=>{
  const pts=parseLprHis(bytesOf('CN_LPR_Q-2019.json'),Q1);
  expect(pts.map(p=>[p.periodEnd,p.valueText])).toEqual([['2019-08-20','4.25'],['2019-09-20','4.2'],['2019-10-21','4.2'],['2019-11-20','4.15'],['2019-12-20','4.15']]);
  expect(pts[0].locator).toEqual({kind:'json_pointer',pointer:'/records/4/1Y'});   // records are newest first in the file
  const five=parseLprHis(bytesOf('CN_LPR_Q-2019.json'),{...Q1,seriesId:'CN_LPR_5Y_Q',field:'5Y'});
  expect(five.map(p=>[p.periodEnd,p.valueText])).toEqual([['2019-08-20','4.85'],['2019-09-20','4.85'],['2019-10-21','4.85'],['2019-11-20','4.8'],['2019-12-20','4.8']]);
 });
 it('2026: ten quotes through October, every 1Y = 3 and 5Y = 3.5',()=>{
  const pts=parseLprHis(bytesOf('CN_LPR_Q-2026.json'),Q1);
  expect(pts.map(p=>p.periodEnd)).toEqual(['2026-01-20','2026-02-24','2026-03-20','2026-04-20','2026-05-20','2026-06-22','2026-07-20','2026-08-20','2026-09-20','2026-10-20']);
  expect(new Set(pts.map(p=>p.valueText))).toEqual(new Set(['3']));
  expect(new Set(parseLprHis(bytesOf('CN_LPR_Q-2026.json'),{...Q1,field:'5Y'}).map(p=>p.valueText))).toEqual(new Set(['3.5']));
 });
 it('every yearly fixture parses and the pointer re-reads the same text from the bytes',()=>{
  for(const f of manifest.files.filter(f=>f.file.startsWith('CN_LPR_Q-'))){
   const b=bytesOf(f.file);const d=JSON.parse(new TextDecoder().decode(b));
   for(const p of parseLprHis(b,Q1)){const [,,i,field]=p.locator.kind==='json_pointer'?p.locator.pointer.split('/'):[];expect(d.records[Number(i)][field]).toMatch(/^\d+\.\d+$/);expect(Number(d.records[Number(i)][field])).toBe(Number(p.valueText));}
  }
 });
});
describe('parseLprHis (synthetic)',()=>{
 it('keeps a duplicate date with the same value once and refuses conflicting values',()=>{
  const r=(d:string,v:string)=>({'1Y':v,'5Y':'3.50',showDateEN:'x',showDateCN:d});
  expect(parseLprHis(doc([r('2026-02-24','3.00'),r('2026-02-24','3.00'),r('2026-01-20','3.10')]),Q1).map(p=>[p.periodEnd,p.valueText])).toEqual([['2026-01-20','3.1'],['2026-02-24','3']]);
  expect(codeOf(()=>parseLprHis(doc([r('2026-02-24','3.00'),r('2026-02-24','3.05')]),Q1))).toBe('lpr_conflicting_rows');
 });
 it('fails closed: window refused, bad rep_code, missing tenor, bad value, bad date, bad json',()=>{
  expect(codeOf(()=>parseLprHis(doc([],{message:'只提供一年历史数据查询及下载'}),Q1))).toBe('lpr_window_refused');
  expect(codeOf(()=>parseLprHis(enc({head:{rep_code:'500'},data:{message:''},records:[]}),Q1))).toBe('lpr_unsuccessful');
  expect(codeOf(()=>parseLprHis(doc([],{baseCurveCfgList:['1Y']}),{...Q1,field:'5Y'}))).toBe('lpr_tenor_missing');
  expect(codeOf(()=>parseLprHis(doc([{'1Y':'3,0','5Y':'3.5',showDateCN:'2026-01-20'}]),Q1))).toBe('lpr_bad_value');
  expect(codeOf(()=>parseLprHis(doc([{'1Y':'3.0','5Y':'3.5',showDateCN:'20 Jan 2026'}]),Q1))).toBe('lpr_bad_date');
  expect(codeOf(()=>parseLprHis(new TextEncoder().encode('<html>'),Q1))).toBe('lpr_bad_json');
  expect(parseLprHis(doc([]),Q1)).toEqual([]);   // an empty year window is not an error (the recorder refuses it; the parser just reports no points)
  expect(new ChinamoneyParseError('x').name).toBe('ChinamoneyParseError');expect(CHINAMONEY_PARSER_VERSION).toBe('chinamoney-lprhis/1');
 });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/lib/macro/parsers/chinamoney.test.ts`
Expected: FAIL（`Cannot find module './chinamoney'`）。

- [ ] **Step 3: 实现**

```ts
// src/lib/macro/parsers/chinamoney.ts
// CFETS (chinamoney.org.cn) LPR history JSON → ParsedPoint (plan WP-D Task 2; spec P5 §5.3). Evidence = exact bytes of
// GET /ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate=…&strEndDate=…&pageNum=1&pageSize=50 (one calendar-year window;
// a wider window answers records:[] with data.message "只提供一年历史数据查询及下载" → lpr_window_refused, never "no data").
// records[] are newest first: {"1Y":"3.00","5Y":"3.50","showDateCN":"2026-10-20",…}; "---" = no quote for that tenor (the 5Y
// tenor starts 2019-08-20). Series definition: quotes on or after firstPeriod (2019-08-20, the reform mechanism); the daily
// pre-reform rows (1Y 4.31) are a different instrument and are excluded, not interpolated. Row key = showDateCN; the same date
// twice with the same text is one point; different texts → lpr_conflicting_rows (the whole page is refused). Locator:
// json_pointer /records/<index>/<field> into the recorded bytes. Values keep their text (canonical decimal, never Number()).
import {canonical} from '../decimal';
import {isIsoDate} from '../periods';
import type {ParsedPoint} from '../types';

export const CHINAMONEY_PARSER_VERSION='chinamoney-lprhis/1';
const PLAIN_DECIMAL=/^-?[0-9]+(\.[0-9]+)?$/;
export class ChinamoneyParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='ChinamoneyParseError';this.code=code;}
}
interface LprDoc{head?:{rep_code?:unknown};data?:{message?:unknown;baseCurveCfgList?:unknown};records?:unknown}

export function parseLprHis(bytes:Uint8Array,opts:{seriesId:string;field:'1Y'|'5Y';firstPeriod:string}):ParsedPoint[]{
 let doc:LprDoc;
 try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ChinamoneyParseError('lpr_bad_json');}
 if(!doc||typeof doc!=='object'||doc.head?.rep_code!=='200')throw new ChinamoneyParseError('lpr_unsuccessful');
 const message=doc.data?.message;
 if(typeof message==='string'&&message!=='')throw new ChinamoneyParseError('lpr_window_refused',message);
 const tenors=doc.data?.baseCurveCfgList;
 if(!Array.isArray(tenors)||!tenors.includes(opts.field))throw new ChinamoneyParseError('lpr_tenor_missing',opts.field);
 if(!Array.isArray(doc.records))throw new ChinamoneyParseError('lpr_bad_json','records');
 const byDate=new Map<string,ParsedPoint>();
 doc.records.forEach((rec,i)=>{
  if(!rec||typeof rec!=='object')throw new ChinamoneyParseError('lpr_bad_row',`records/${i}`);
  const r=rec as Record<string,unknown>;
  const date=r.showDateCN;
  if(typeof date!=='string'||!isIsoDate(date))throw new ChinamoneyParseError('lpr_bad_date',`records/${i}`);
  if(date<opts.firstPeriod)return;
  const raw=r[opts.field];
  if(raw===undefined||raw===null||raw==='---'||raw==='')return;
  if(typeof raw!=='string'||!PLAIN_DECIMAL.test(raw))throw new ChinamoneyParseError('lpr_bad_value',`records/${i}/${opts.field}`);
  let valueText:string;
  try{valueText=canonical(raw);}catch{throw new ChinamoneyParseError('lpr_bad_value',`records/${i}/${opts.field}`);}
  const prev=byDate.get(date);
  if(prev){if(prev.valueText!==valueText)throw new ChinamoneyParseError('lpr_conflicting_rows',date);return;}
  byDate.set(date,{seriesId:opts.seriesId,periodEnd:date,valueText,locator:{kind:'json_pointer',pointer:`/records/${i}/${opts.field}`}});
 });
 return [...byDate.values()].sort((a,b)=>a.periodEnd<b.periodEnd?-1:1);
}
```

- [ ] **Step 4: 测试通过**

Run: `npm test -- src/lib/macro/parsers/chinamoney.test.ts`
Expected: PASS（7 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/macro/parsers/chinamoney.ts src/lib/macro/parsers/chinamoney.test.ts
git commit -F - <<'EOF'
feat(macro): chinamoney LprHis parser (json_pointer, reform-era quotes only, conflicting rows refused)

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 3: 社融存量同比解析器 `parsers/pboc-afre.ts`

**Files:**
- Create: `src/lib/macro/parsers/pboc-afre.ts`
- Test: `src/lib/macro/parsers/pboc-afre.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/macro/parsers/pboc-afre.test.ts
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {canonical} from '../decimal';
import {htmlTables} from './html-table';
import {PBOC_AFRE_PARSER_VERSION,PbocAfreParseError,afreDecoderLabel,parseAfreStockYoy} from './pboc-afre';

const FIX=join(process.cwd(),'src/lib/macro/fixtures/cn-http');
const manifest=JSON.parse(readFileSync(join(FIX,'manifest.json'),'utf8')) as {files:{file:string;sha256:string}[]};
const bytesOf=(file:string)=>{const b=new Uint8Array(readFileSync(join(FIX,file)));expect(createHash('sha256').update(b).digest('hex')).toBe(manifest.files.find(f=>f.file===file)!.sha256);return b;};
const S={seriesId:'CN_AFRE_STOCK_YOY'};
const codeOf=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return (e as {code?:string}).code??String(e);}};
/** gb2312 bytes of a minimal Excel-export table shaped like the official one. */
const gb=(s:string)=>new Uint8Array(require('node:child_process').execFileSync('iconv',['-f','utf-8','-t','gb2312'],{input:s}));
const table=(months:string[],stockRow:string,extraRows='')=>gb(`<html><head><meta http-equiv=Content-Type content="text/html; charset=gb2312"></head><body><table>
<tr><td colspan=4>社会融资规模存量统计表</td></tr><tr><td colspan=4>Aggregate Financing to the Real Economy (Stock)</td></tr><tr><td colspan=2>单位：万亿元人民币</td></tr><tr><td colspan=2>Unit: Trillion Yuan</td></tr>
<tr><td></td>${months.map(m=>`<td colspan=2>${m}</td>`).join('')}<td></td></tr>
<tr><td>项目 Items</td>${months.map(()=>'<td>存量</td><td>增速（%）</td>').join('')}<td></td></tr>
<tr><td></td>${months.map(()=>'<td>Stock</td><td>Growth Rate(%)</td>').join('')}<td></td></tr>
<tr>${stockRow}</tr>${extraRows}</table></body></html>`);

describe('parseAfreStockYoy (real fixture bytes)',()=>{
 it('2025: twelve months of the official growth rate, month ends, html_cell locators into the one table',()=>{
  const pts=parseAfreStockYoy(bytesOf('CN_AFRE_STOCK-2025.htm'),S);
  expect(pts.map(p=>[p.periodEnd,p.valueText])).toEqual([['2025-01-31','8'],['2025-02-28','8.2'],['2025-03-31','8.4'],['2025-04-30','8.7'],['2025-05-31','8.7'],['2025-06-30','8.9'],['2025-07-31','9'],['2025-08-31','8.8'],['2025-09-30','8.7'],['2025-10-31','8.5'],['2025-11-30','8.5'],['2025-12-31','8.3']]);
  expect(pts[11].locator).toEqual({kind:'html_cell',table:0,row:7,cell:24});
 });
 it('2026: nine months (January–September), later months empty → no point',()=>{
  const pts=parseAfreStockYoy(bytesOf('CN_AFRE_STOCK-2026.htm'),S);
  expect(pts.map(p=>[p.periodEnd,p.valueText])).toEqual([['2026-01-31','8.2'],['2026-02-28','8.2'],['2026-03-31','7.9'],['2026-04-30','7.8'],['2026-05-31','7.7'],['2026-06-30','7.4'],['2026-07-31','7.4'],['2026-08-31','7.2'],['2026-09-30','7.1']]);
 });
 it('every yearly fixture 2015..2026 parses 12 points (the current year fewer), by its declared charset, and each locator re-reads the same cell text',()=>{
  for(const f of manifest.files.filter(f=>f.file.startsWith('CN_AFRE_STOCK-'))){
   const b=bytesOf(f.file);const pts=parseAfreStockYoy(b,S);
   const year=Number(f.file.slice(14,18));
   expect(pts.length,f.file).toBe(year<2026?12:9);
   expect(afreDecoderLabel(b),f.file).toBe(year<=2019?'utf-8':'gb18030');   // PBOC regenerated 2015–2019 as UTF-8 in 2025-11 (D0c)
   const tables=htmlTables(new TextDecoder(afreDecoderLabel(b)!).decode(b));
   for(const p of pts){const l=p.locator;if(l.kind!=='html_cell')throw new Error('locator');expect(canonical(tables[l.table].rows[l.row][l.cell].trim())).toBe(p.valueText);}   // text-exact, never Number()
  }
 });
});
describe('parseAfreStockYoy (synthetic)',()=>{
 it('reads the growth cell after each month\'s stock cell; "" and "-" mean no value',()=>{
  const pts=parseAfreStockYoy(table(['2026.1','2026.2','2026.3'],'<td>社会融资规模存量 AFRE(stock)</td><td>449.11</td><td>8.2</td><td>451.40</td><td>-</td><td></td><td></td><td></td>'),S);
  expect(pts).toEqual([{seriesId:'CN_AFRE_STOCK_YOY',periodEnd:'2026-01-31',valueText:'8.2',locator:{kind:'html_cell',table:0,row:7,cell:2}}]);
 });
 it('fails closed: no stock row, header mismatch, bad month, bad value, bad encoding, two stock rows',()=>{
  expect(codeOf(()=>parseAfreStockYoy(table(['2026.1'],'<td>人民币贷款 RMB loans</td><td>1</td><td>2</td><td></td>'),S))).toBe('afre_row_missing');
  expect(codeOf(()=>parseAfreStockYoy(gb(new TextDecoder('gb18030').decode(table(['2026.1'],'<td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>2</td><td></td>')).replace('增速（%）','同比')),S))).toBe('afre_header_mismatch');   // mutate the Unicode HTML, then re-encode
  expect(codeOf(()=>parseAfreStockYoy(gb('<table><tr><td>其他表</td></tr><tr><td></td><td colspan=2>2026.1</td><td></td></tr><tr><td>项目 Items</td><td>存量</td><td>增速（%）</td><td></td></tr><tr><td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>2</td><td></td></tr></table>'),S))).toBe('afre_title_missing');
  expect(codeOf(()=>parseAfreStockYoy(table(['2026.13'],'<td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>2</td><td></td>'),S))).toBe('afre_bad_month');
  expect(codeOf(()=>parseAfreStockYoy(table(['2026.1'],'<td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>8,2</td><td></td>'),S))).toBe('afre_bad_value');
  expect(codeOf(()=>parseAfreStockYoy(new Uint8Array([0xff,0xfe,0x81]),S))).toBe('afre_bad_encoding');           // no charset declaration
  expect(codeOf(()=>parseAfreStockYoy(new TextEncoder().encode('<meta charset=iso-8859-1><table></table>'),S))).toBe('afre_bad_encoding');   // unsupported charset
  expect(codeOf(()=>parseAfreStockYoy(new Uint8Array([...new TextEncoder().encode('<meta charset=utf-8>'),0xff,0xfe]),S))).toBe('afre_bad_encoding');   // undecodable under the declared charset
  // the same table declared as UTF-8 parses identically (2015–2019 files)
  const utf8=new TextEncoder().encode('<html><head><meta http-equiv=Content-Type content="text/html; charset=utf-8"></head><body><table><tr><td colspan=4>社会融资规模存量统计表</td></tr><tr><td></td><td colspan=2>2019.1</td><td></td></tr><tr><td>项目 Items</td><td>存量</td><td>增速（%）</td><td></td></tr><tr><td>社会融资规模存量 AFRE(stock)</td><td>200.75</td><td>10.4</td><td></td></tr></table></body></html>');
  expect(parseAfreStockYoy(utf8,S).map(p=>[p.periodEnd,p.valueText])).toEqual([['2019-01-31','10.4']]);
  // an interior blank month header shifts nothing: positions are kept, the blank is refused (a value must never be assigned to the wrong period)
  expect(codeOf(()=>parseAfreStockYoy(gb('<table><tr><td colspan=4>社会融资规模存量统计表</td></tr><tr><td></td><td colspan=2>2026.1</td><td colspan=2></td><td colspan=2>2026.3</td><td></td></tr><tr><td>项目 Items</td><td>存量</td><td>增速（%）</td><td>存量</td><td>增速（%）</td><td>存量</td><td>增速（%）</td><td></td></tr><tr><td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>8.2</td><td>2</td><td>8.1</td><td>3</td><td>7.9</td><td></td></tr></table>'),S))).toBe('afre_bad_month');
  expect(codeOf(()=>parseAfreStockYoy(table(['2026.1'],'<td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>2</td><td></td>','<tr><td>社会融资规模存量 AFRE(stock)</td><td>1</td><td>3</td><td></td></tr>'),S))).toBe('afre_row_ambiguous');
  expect(new PbocAfreParseError('x').name).toBe('PbocAfreParseError');expect(PBOC_AFRE_PARSER_VERSION).toBe('pboc-afre-stock/1');
 });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- src/lib/macro/parsers/pboc-afre.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// src/lib/macro/parsers/pboc-afre.ts
// PBOC 调查统计司 "社会融资规模存量统计表" (one Excel-exported HTML file per year, charset gb2312) → ParsedPoint
// (plan WP-D Task 3; spec P5 §5.4). Verified structure (2026-11-07): a single <table>; row 4 = month headers
// "YYYY.M" (one cell per month, colspan 2); row 5 = "存量" / "增速（%）" alternating; row 7 = "社会融资规模存量 AFRE(stock)" with
// stock, growth, stock, growth … per month. Only the official growth column ("增速（%）" = 社会融资规模存量同比增长, %) is read;
// the stock level and the flow table are never used. The file is regenerated every month under a new name: an earlier month's
// value may change → the series is revisable (versions, never overwrite). "" / "-" = not yet published → no point.
// Locator: html_cell {table, row, cell} into the recorded bytes (html-table.ts numbering). Decoding: by the file's own
// <meta charset=…> (first 2 KB scanned as latin1): utf-8 → 'utf-8'; gb2312 / gbk / gb18030 → 'gb18030'; missing or other →
// afre_bad_encoding; undecodable bytes under the declared charset → afre_bad_encoding (never guessed: PBOC regenerated the
// 2015–2019 files as UTF-8 in 2025-11 while 2025/2026 are gb2312, verified 2026-11-07).
import {canonical} from '../decimal';
import {monthEnd} from '../periods';
import type {ParsedPoint} from '../types';
import {htmlTables} from './html-table';

export const PBOC_AFRE_PARSER_VERSION='pboc-afre-stock/1';
const MONTH=/^(\d{4})\.(\d{1,2})$/;
const PLAIN_DECIMAL=/^-?[0-9]+(\.[0-9]+)?$/;
const STOCK_ROW=/^社会融资规模存量\s*AFRE\s*\(stock\)$/;
const TITLE='社会融资规模存量统计表';
const GROWTH='增速（%）';
const norm=(s:string)=>s.replace(/[\s\u3000]+/g,'');
export class PbocAfreParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='PbocAfreParseError';this.code=code;}
}

const CHARSET_LABEL:Record<string,string>={'utf-8':'utf-8',utf8:'utf-8',gb2312:'gb18030',gbk:'gb18030',gb18030:'gb18030'};
/** The charset the file declares in its first 2 KB (latin1 scan), mapped to a TextDecoder label; null when missing or unsupported. */
export function afreDecoderLabel(bytes:Uint8Array):string|null{
 const head=new TextDecoder('latin1').decode(bytes.slice(0,2048));
 const m=/charset=["']?([\w-]+)/i.exec(head);
 return m?CHARSET_LABEL[m[1].toLowerCase()]??null:null;
}

export function parseAfreStockYoy(bytes:Uint8Array,opts:{seriesId:string}):ParsedPoint[]{
 const label=afreDecoderLabel(bytes);
 if(!label)throw new PbocAfreParseError('afre_bad_encoding','charset');
 let html:string;
 try{html=new TextDecoder(label,{fatal:true}).decode(bytes);}catch{throw new PbocAfreParseError('afre_bad_encoding',label);}
 // the one table whose first cell is the official title; anything else (0 or >1) is refused
 const tables=htmlTables(html).filter(t=>t.rows.length>0&&norm(t.rows[0][0]??'')===TITLE);
 if(tables.length!==1)throw new PbocAfreParseError('afre_title_missing',String(tables.length));
 const t=tables[0];
 const hi=t.rows.findIndex(r=>r.some(c=>MONTH.test(norm(c))));
 if(hi<0)throw new PbocAfreParseError('afre_bad_month','no month header');
 // positional: header cell i (i ≥ 1) ↔ data cells 2i−1 (stock) and 2i (growth); only trailing cells may be blank
 const hdr=t.rows[hi].map(norm);
 let last=hdr.length-1;while(last>=1&&hdr[last]==='')last--;
 const months:[number,string][]=[];
 for(let i=1;i<=last;i++){if(!MONTH.test(hdr[i]))throw new PbocAfreParseError('afre_bad_month',`header cell ${i}: ${hdr[i]}`);months.push([i,hdr[i]]);}
 if(months.length===0)throw new PbocAfreParseError('afre_bad_month','no months');
 const sub=(t.rows[hi+1]??[]).map(norm);
 const rows=t.rows.map((r,i)=>[r,i] as const).filter(([r])=>r.length>0&&STOCK_ROW.test(r[0]));
 if(rows.length===0)throw new PbocAfreParseError('afre_row_missing');
 if(rows.length>1)throw new PbocAfreParseError('afre_row_ambiguous');
 const [row,ri]=rows[0];
 const out:ParsedPoint[]=[];
 months.forEach(([i,m])=>{
  const cell=2*i;
  if(sub[cell]!==norm(GROWTH)||sub[cell-1]!=='存量')throw new PbocAfreParseError('afre_header_mismatch',`cell ${cell}: ${sub[cell-1]??''}/${sub[cell]??''}`);
  const [,y,mo]=MONTH.exec(m)!;
  const month=Number(mo);
  if(month<1||month>12||Number(y)<2000||Number(y)>2100)throw new PbocAfreParseError('afre_bad_month',m);
  const raw=norm(row[cell]??'');
  if(raw===''||raw==='-')return;
  if(!PLAIN_DECIMAL.test(raw))throw new PbocAfreParseError('afre_bad_value',`row ${ri} cell ${cell}`);
  let valueText:string;
  try{valueText=canonical(raw);}catch{throw new PbocAfreParseError('afre_bad_value',`row ${ri} cell ${cell}`);}
  out.push({seriesId:opts.seriesId,periodEnd:monthEnd(Number(y),month),valueText,locator:{kind:'html_cell',table:t.index,row:ri,cell}});
 });
 return out;
}
```

- [ ] **Step 4: 测试通过**

Run: `npm test -- src/lib/macro/parsers/pboc-afre.test.ts`
Expected: PASS（6 用例；2025 的第 12 点定位 `{table:0,row:7,cell:24}`，2026 共 9 点；内部空月头被拒）。负值同比是合法值（本解析器只读存量行；范围由 `quality.ts` 的 `liquidity_yoy` 档 −50…100 管）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/macro/parsers/pboc-afre.ts src/lib/macro/parsers/pboc-afre.test.ts
git commit -F - <<'EOF'
feat(macro): PBOC AFRE stock-table parser (official growth column only, gb2312, html_cell)

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 4: 采集器 `official_http` 分支（`http_json` / `http_html`）

**Files:**
- Modify: `scripts/macro/collect.py`（`calls_for`、`collect_series`、`claims_from_frame` → 新 `claims_from_http`、`is_evidence`、`EXT`；顶部 `import ssl`、`import requests`、`import requests.adapters`；test_collect 加一例：`_http_get` 对 `www.chinamoney.org.cn` 挂 `_LegacyTlsAdapter`、对 `www.pbc.gov.cn` 不挂（monkeypatch `requests.Session.mount` 记录调用））
- Modify: `scripts/macro/test_collect.py`

说明：目录与 `cn-series.json` 本 PR 不动；本任务用测试里的本地 spec 字典验证分支。`cn-series.json` 的 `version` 仍为 `cn-series/1`；`load_specs` 同时接受 `cn-series/1` 与 `cn-series/2`（Task 10 导出 v2 后无需再改 Python）。

- [ ] **Step 1: 写失败测试**（追加到 `scripts/macro/test_collect.py`）

```python
LPR = {"series_id": "CN_LPR_1Y_Q", "function": "http_json", "fetch_host": "www.chinamoney.org.cn", "period": "day",
       "evidence_path": "/ags/ms/cm-u-bk-currency/LprHis", "evidence_path_match": "exact", "column": "1Y",
       "url": "https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate={start}&strEndDate={end}&pageNum=1&pageSize=50",
       "pointer": "/records", "field": "1Y", "windows": "calendar_year", "first_period": "2019-08-20"}
AFRE = {"series_id": "CN_AFRE_STOCK_YOY", "function": "http_html", "fetch_host": "www.pbc.gov.cn", "period": "month",
        "evidence_path": "/diaochatongjisi/attachDir/", "evidence_path_match": "prefix", "evidence_path_prefixes": ["/diaochatongjisi/attachDir/", "/diaochatongjisi/fileDir/resource/cms/"], "column": "增速（%）",
        "pages": [{"year": 2026, "url": "https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2026ntjsj/shrzgm/index.html"},
                  {"year": 2025, "url": "https://www.pbc.gov.cn/diaochatongjisi/116219/116319/5570903/5570885/index.html"}]}


def test_calls_for_http_json_uses_calendar_year_windows():
    today = dt.date(2026, 11, 7)
    daily = collect.calls_for(LPR, "daily", today)
    assert daily == [{"url": LPR["url"].format(start="2026-01-01", end="2026-12-31")}]
    back = collect.calls_for(LPR, "backfill", today)
    assert [c["url"][-70:] for c in back][0].count("2019-01-01") == 1 and len(back) == 8
    assert back[-1] == daily[0]


def test_calls_for_http_html_daily_first_page_backfill_all():
    today = dt.date(2026, 11, 7)
    assert collect.calls_for(AFRE, "daily", today) == [{"page": p["url"]} for p in AFRE["pages"][:2]]   # current + previous year (December lands in January; prior-year revisions)
    assert collect.calls_for(AFRE, "backfill", today) == [{"page": p["url"]} for p in AFRE["pages"]]


def test_is_evidence_prefixes_exact_and_content_type():
    cap = lambda url, ct="text/html", status=200: collect.Capture(method="GET", url=url, status=status, content_type=ct, body=b"", fetched_at="2026-11-07T00:00:00.000Z")
    assert collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/x.htm"))
    assert collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/fileDir/resource/cms/2016/02/x.htm"))   # 2015–2018 files
    assert not collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/116219/116319/2026ntjsj/shrzgm/index.html"))  # list pages are not evidence
    assert not collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/x.pdf"))
    assert not collect.is_evidence(AFRE, cap("https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/x.htm", ct="application/json"))
    assert collect.is_evidence(LPR, cap("https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?lang=CN&strStartDate=2026-01-01&strEndDate=2026-12-31&pageNum=1&pageSize=50", ct="application/json;charset=UTF-8"))
    assert not collect.is_evidence(LPR, cap("https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHis?x=1", ct="text/html"))
    assert not collect.is_evidence(LPR, cap("https://www.chinamoney.org.cn/ags/ms/cm-u-bk-currency/LprHisExcel", ct="application/json"))


def test_claims_from_http_json_is_non_fatal():
    body = json.dumps({"head": {"rep_code": "200"}, "data": {"message": ""}, "records": [
        {"1Y": "3.00", "5Y": "3.50", "showDateCN": "2026-10-20"}, {"1Y": "4.31", "5Y": "---", "showDateCN": "2019-08-01"}]}).encode("utf-8")
    assert collect.claims_from_http(LPR, body) == ([{"series_id": "CN_LPR_1Y_Q", "period_label": "2026-10-20", "value_text": "3.0"}], None)
    assert collect.claims_from_http({**LPR, "field": "5Y", "series_id": "CN_LPR_5Y_Q"}, body) == ([{"series_id": "CN_LPR_5Y_Q", "period_label": "2026-10-20", "value_text": "3.5"}], None)
    assert collect.claims_from_http(LPR, b"<html>") == ([], "claims_bad_json")   # evidence is kept; the TS parser decides
    assert collect.claims_from_http(LPR, json.dumps({"head": {"rep_code": "200"}, "data": {"message": "只提供一年历史数据查询及下载"}, "records": []}).encode()) == ([], "lpr_window_refused")


def test_discover_afre_htm_from_sub_page():
    page = ('<table class="a2015"><tr><td>社会融资规模增量统计表</td><td><a href="/diaochatongjisi/attachDir/a.htm">htm</a></td></tr></table>'
            '<table class="a2015"><tr><td>社会融资规模存量统计表<br>Aggregate Financing (Stock)</td><td><a href="/diaochatongjisi/attachDir/2026/10/b.htm">htm</a>'
            '<a href="/diaochatongjisi/attachDir/2026/10/b.pdf">pdf</a></td></tr></table>')
    utf8 = ('<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /></head>' + page).encode("utf-8")
    assert collect.discover_afre_htm("https://www.pbc.gov.cn", utf8) == "https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/b.htm"
    with pytest.raises(RuntimeError):
        collect.discover_afre_htm("https://www.pbc.gov.cn", b"<html><meta charset=utf-8></html>")
    with pytest.raises(RuntimeError):   # two stock blocks = ambiguous
        collect.discover_afre_htm("https://www.pbc.gov.cn", ('<meta charset=utf-8>' + page + page).encode("utf-8"))
    with pytest.raises(RuntimeError):   # undeclared / other charset is refused, never guessed
        collect.discover_afre_htm("https://www.pbc.gov.cn", ('<meta charset=gb2312>' + page).encode("gb2312"))


class _Resp:
    def __init__(self, url, body, ct, status=200):
        self.url, self.content, self.status_code, self.headers = url, body, status, {"content-type": ct}
    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


LIST_PAGE = '<meta charset=utf-8><table class="a2015"><tr><td>社会融资规模存量统计表</td><td><a href="/diaochatongjisi/attachDir/2026/10/b.htm">htm</a></td></tr></table>'.encode("utf-8")


def test_collect_series_http_html_records_only_the_htm(monkeypatch):
    import requests
    htm = "<html><meta charset=gb2312><table><tr><td>社会融资规模存量统计表</td></tr><tr><td>2026.1</td></tr></table></html>".encode("gb2312")
    calls = []
    def fake_request(self, method, url, *a, **k):
        calls.append((url, k.get("allow_redirects")))
        return _Resp(url, LIST_PAGE if url.endswith("index.html") else htm, "text/html")
    monkeypatch.setattr(requests.Session, "request", fake_request)
    r = collect.collect_series({**AFRE, "pages": AFRE["pages"][:1]}, "daily", dt.date(2026, 11, 7), ak=None)
    assert r["error"] is None and [c.url for c in r["evidence"]] == ["https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/10/b.htm"]
    assert len(r["captures"]) == 2 and r["claims"] == []   # html series carry no Python claims; the TS parser is the only reader
    assert all(ar is False for _, ar in calls)             # redirects are never followed


def test_collect_series_http_html_fails_but_keeps_evidence_when_the_table_is_not_the_stock_table(monkeypatch):
    import requests
    htm = "<html><meta charset=gb2312><table><tr><td>社会融资规模增量统计表</td></tr></table></html>".encode("gb2312")
    monkeypatch.setattr(requests.Session, "request", lambda self, m, url, *a, **k: _Resp(url, LIST_PAGE if url.endswith("index.html") else htm, "text/html"))
    r = collect.collect_series({**AFRE, "pages": AFRE["pages"][:1]}, "daily", dt.date(2026, 11, 7), ak=None)
    assert r["code"] == "afre_title_missing" and len(r["evidence"]) == 1


def test_collect_series_http_redirect_is_a_failure(monkeypatch):
    import requests
    monkeypatch.setattr(requests.Session, "request", lambda self, m, url, *a, **k: _Resp(url, b"", "text/html", status=302))
    r = collect.collect_series(LPR, "daily", dt.date(2026, 11, 7), ak=None)
    assert r["error"] is not None and r["evidence"] == []
```
并把既有 `test_committed_spec_file_lists_every_cn_series_once` 的两个集合改为 `<= {... , "http_json", "http_html"}` 与 `<= {..., "www.chinamoney.org.cn", "www.pbc.gov.cn"}`。

- [ ] **Step 2: 跑测试确认失败**

Run: `scripts/macro/.venv/bin/python -m pytest scripts/macro/test_collect.py -q`
Expected: 新用例 FAIL（`AttributeError: … claims_from_http` 等）。

- [ ] **Step 3: 实现**（`collect.py` 的变更点，逐段）

```python
# load_specs: 接受两个版本
    if doc.get("version") not in ("cn-series/1", "cn-series/2") or not isinstance(doc.get("series"), list):

# calls_for: 新增两个分支（放在 raise 之前）
    if fn == "http_json":
        if spec.get("windows") != "calendar_year":
            raise SystemExit(f"{spec['series_id']}: unsupported windows {spec.get('windows')!r}")
        first = _dt.date.fromisoformat(spec["first_period"])
        years = range(first.year, today.year + 1) if mode == "backfill" else [today.year]
        return [{"url": spec["url"].format(start=f"{y}-01-01", end=f"{y}-12-31")} for y in years]
    if fn == "http_html":
        pages = spec["pages"] if mode == "backfill" else spec["pages"][:1]
        return [{"page": p["url"]} for p in pages]

# is_evidence: 支持 prefix 列表 + Content-Type 家族（http_json → application/json；http_html → text/html）
CT_FAMILY = {"http_json": "application/json", "http_html": "text/html"}

def is_evidence(spec, cap):
    parts = urlsplit(cap.url)
    if cap.status != 200 or parts.scheme != "https" or parts.hostname != spec["fetch_host"]:
        return False
    fam = CT_FAMILY.get(spec["function"])
    if fam and not cap.content_type.lower().startswith(fam):
        return False
    if spec.get("evidence_path_match") == "prefix":
        prefixes = spec.get("evidence_path_prefixes") or [spec["evidence_path"]]
        return parts.path.endswith(".htm") and any(parts.path.startswith(p) for p in prefixes)
    return parts.path == spec["evidence_path"]

# claims（http_json 只用 JSON 字段做交叉核对；失败不致命：返回 (claims, code)；http_html 无 claim）
def claims_from_http(spec, body: bytes):
    if spec["function"] != "http_json":
        return [], None
    try:
        doc = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return [], "claims_bad_json"
    data = doc.get("data") if isinstance(doc, dict) else None
    if isinstance(data, dict) and data.get("message"):
        return [], "lpr_window_refused"
    out = []
    for rec in _json_pointer(doc, spec["pointer"]) or []:
        if not isinstance(rec, dict):
            continue
        d = rec.get("showDateCN")
        if not isinstance(d, str) or d < spec["first_period"]:
            continue
        vt = value_text(rec.get(spec["field"]))
        if vt is not None:
            out.append({"series_id": spec["series_id"], "period_label": d, "value_text": vt})
    return out, None

def _json_pointer(doc, pointer: str):
    cur = doc
    for part in pointer.split("/")[1:]:
        cur = cur[int(part)] if isinstance(cur, list) else cur.get(part)
        if cur is None:
            return None
    return cur

# 列表页解码 + 发现 htm（只认标题恰为 社会融资规模存量统计表 的 a2015 表块；0 或 >1 块 = 错误）
def _page_text(page: bytes) -> str:
    """PBOC list pages declare charset=utf-8 (verified 2026-11-07); any other declaration is refused, never guessed."""
    head = page[:2048].decode("latin-1")
    m = re.search(r"charset=([\w-]+)", head, re.I)
    if not m or m.group(1).lower() != "utf-8":
        raise RuntimeError(f"unexpected charset {m.group(1) if m else 'none'}")
    return page.decode("utf-8")


def discover_afre_htm(base: str, page: bytes) -> str:
    text = _page_text(page)
    blocks = [b for b in re.findall(r'<table[^>]*class="a2015"[^>]*>.*?</table>', text, re.S)
              if "社会融资规模存量统计表" in re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", b))]
    if len(blocks) != 1:
        raise RuntimeError(f"{len(blocks)} stock-table blocks on the AFRE page")
    m = re.search(r'href=["\']([^"\']+\.htm)["\']', blocks[0])
    if not m:
        raise RuntimeError("no htm link in the stock-table block")
    return base + m.group(1)


class ClaimsUnavailable(RuntimeError):
    """Evidence was received but is not usable as claimed; str(e) is the series outcome code."""


LEGACY_TLS_HOSTS = {"www.chinamoney.org.cn"}   # server requires legacy renegotiation (verified 2026-11-07); OpenSSL 3 refuses by default


class _LegacyTlsAdapter(requests.adapters.HTTPAdapter):
    """OP_LEGACY_SERVER_CONNECT for one host only; everything else keeps the default context."""
    def init_poolmanager(self, *a, **k):
        ctx = ssl.create_default_context()
        ctx.options |= ssl.OP_LEGACY_SERVER_CONNECT
        k["ssl_context"] = ctx
        return super().init_poolmanager(*a, **k)


def _http_get(url: str, host: str):
    """Official-host GET: https, exact host, redirects are failures (3xx raises), 4xx/5xx raise. requests.Session.request is what
    recorder.recording() wraps, so these responses are captured like AKShare's."""
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname != host:
        raise RuntimeError(f"refused url {url}")
    s = requests.Session()
    if host in LEGACY_TLS_HOSTS:
        s.mount(f"https://{host}/", _LegacyTlsAdapter())
    res = s.get(url, headers={"user-agent": UA, "accept": "application/json,text/html;q=0.9"}, timeout=60, allow_redirects=False)
    if 300 <= res.status_code < 400:
        raise RuntimeError(f"redirect {res.status_code} from {url}")
    res.raise_for_status()
    return res


# collect_series: fn 解析改为按 function 分派（AKShare 函数仍走 getattr(ak, …)，只在非 http_* 时取；ak 可为 None）
    host = spec["fetch_host"]
    for kwargs in calls_for(spec, mode, today):
        got: List[Capture] = []
        try:
            with recording() as got:                      # the ONLY place captures are collected (appended once, in finally)
                if spec["function"] == "http_json":
                    res = _http_get(kwargs["url"], host)
                    found, code = claims_from_http(spec, res.content)
                    if code:                              # evidence stays in `got`; the series is reported failed with the code
                        raise ClaimsUnavailable(code)
                    claims.extend(found)
                elif spec["function"] == "http_html":
                    page = _http_get(kwargs["page"], host)
                    htm = _http_get(discover_afre_htm(f"https://{host}", page.content), host)
                    if "社会融资规模存量统计表".encode("gb2312") not in htm.content:   # structural check; the TS parser is still the only reader
                        raise ClaimsUnavailable("afre_title_missing")
                else:
                    df = fn(**kwargs)
                    claims.extend(claims_from_frame(spec, df, today))
        finally:
            caps.extend(got); evidence.extend(c for c in got if is_evidence(spec, c))
    ...
    if not claims and spec["function"] != "http_html":
        raise EmptySeries(...)
    # except: code = str(e) if isinstance(e, ClaimsUnavailable) else ("empty_series" if EmptySeries else f"collect_{type}")
```
`UA = "OsbornAlpha-macro-collect/1 (+https://osbornalpha.com)"` 常量。版本修订语义（社融）：每年一个文件、每月换新文件名；采集顺序 = `available_at`（`availability_basis='first_seen'` 既有规则），同期新值经 `macro_write_observations` 对 `revisable` 行写新版本；文件名中的发布日期（`attachDir/2026/10/2026101417…`）不作为版本键，只在 runbook §10 记录为核实信息。`EXT` 已含 `text/html` → `.html`；录制夹具名后缀对 htm 评价用 `html` 即可。`verification()` 的 `_numbers_in` 对 html 走既有 `>…<` 正则，gb2312 字节用 `errors="replace"` 解码后数字仍可定位。

- [ ] **Step 4: 测试通过**

Run: `scripts/macro/.venv/bin/python -m pytest scripts/macro/test_collect.py -q`
Expected: 全部 PASS。

- [ ] **Step 5: 真实 dry-run 核对（不发任何请求到 ingest）**

Run（临时 spec 文件，不提交）：
```bash
cat > /tmp/wpd-specs.json <<'EOF'
{"version":"cn-series/2","series":[ <LPR 与 AFRE 两个 spec 字典，同测试> ]}
EOF
scripts/macro/.venv/bin/python scripts/macro/collect.py --mode daily --dry-run /tmp/wpd-dry --spec /tmp/wpd-specs.json
```
（`--spec` 为本任务新增的可选参数，默认 `cn-series.json`。）
Expected: `/tmp/wpd-dry/chunk-0.json` 含两条 evidence（LprHis 2026 窗口 JSON、2026 年存量 htm），`claims` 只有 LPR；`finish` 的 `series_outcomes` 两个 `ok:true`。把 evidence 的 `sha256` 与 Task 1 夹具 manifest 对比（LPR 2026 窗口与当日录制若无新报价应相同；AFRE 若 PBOC 已换月文件则不同——记录在实施日志）。

- [ ] **Step 6: 提交**

```bash
git add scripts/macro/collect.py scripts/macro/test_collect.py
git commit -F - <<'EOF'
feat(macro): collector official_http branch (http_json calendar-year windows, http_html AFRE discovery, --spec)

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 5: CN 报价事件 `deriveRateQuoteEvents`（不改 US 事件类型）

**Files:**
- Modify: `src/lib/macro/events.ts`、`src/lib/macro/events.test.ts`、`src/lib/macro/series-extras.ts`、`src/lib/macro/cycles.ts`（`policyCycles` 输入泛化为 `Pick<PolicyEvent,'effective_date'|'change_bp'>`）
- Test: `src/lib/macro/events.test.ts`、`src/lib/macro/series-extras.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// events.test.ts 追加
describe('deriveRateQuoteEvents',()=>{
 const q=(id:string,d:string,v:string):EventInput=>({observation_id:id,period_end:d,value_text:v});
 it('one event per quote whose value differs from the previous quote; effective_date = quote date; change in bp',()=>{
  const ev=deriveRateQuoteEvents('CN_LPR_1Y_Q',[q('a','2019-08-20','4.25'),q('b','2019-09-20','4.20'),q('c','2019-10-21','4.20'),q('d','2019-11-20','4.15')]);
  expect(ev).toEqual([
   {kind:'policy_rate_quote_change',region:'CN',series_id:'CN_LPR_1Y_Q',effective_date:'2019-09-20',from:'4.25',to:'4.2',change_bp:'-5',source:'derived',evidence:['a','b'],version:'macro-events/2'},
   {kind:'policy_rate_quote_change',region:'CN',series_id:'CN_LPR_1Y_Q',effective_date:'2019-11-20',from:'4.2',to:'4.15',change_bp:'-5',source:'derived',evidence:['c','d'],version:'macro-events/2'},
  ]);
 });
 it('requires ascending dates and returns [] for < 2 quotes',()=>{
  expect(deriveRateQuoteEvents('X',[q('a','2026-01-20','3')])).toEqual([]);
  expect(()=>deriveRateQuoteEvents('X',[q('a','2026-02-24','3'),q('b','2026-01-20','3')])).toThrow('events_unsorted');
 });
 it('EVENTS_VERSION is macro-events/2 and US derivePolicyEvents output is unchanged in shape',()=>{expect(EVENTS_VERSION).toBe('macro-events/2');});
});
```
`series-extras.test.ts` 加：CN `policy_rate` 且 `derive.from` 以 `_Q` 结尾的行 → `quoteEvents` 来自 `_Q` 历史、`cycles` 来自 `policyCycles(quoteEvents,lastQuoteDay)`；US 行 `quoteEvents:[]`；`eventsVersion==='macro-events/2'`。既有 US 事件断言只改 version 字面量。

- [ ] **Step 2: 确认失败** — Run: `npm test -- src/lib/macro/events.test.ts src/lib/macro/series-extras.test.ts` → FAIL。

- [ ] **Step 3: 实现**

```ts
// events.ts 追加（文件头注释补一段：CN quote events, macro-events/2）
export const EVENTS_VERSION='macro-events/2';
export interface RateQuoteEvent{kind:'policy_rate_quote_change';region:'CN';series_id:string;effective_date:string;from:string;to:string;change_bp:string;source:'derived';evidence:[string,string];version:string}
/** CN policy-rate quote events: consecutive quotes of one event-source series (ascending) whose value differs. */
export function deriveRateQuoteEvents(seriesId:string,quotes:readonly EventInput[]):RateQuoteEvent[]{
 assertAscending(quotes,seriesId);
 const out:RateQuoteEvent[]=[];
 for(let i=1;i<quotes.length;i++){
  const p=quotes[i-1],c=quotes[i];const d=subtract(c.value_text,p.value_text);
  if(decimalSign(d)===0)continue;
  out.push({kind:'policy_rate_quote_change',region:'CN',series_id:seriesId,effective_date:c.period_end,from:canonicalDecimal(p.value_text),to:canonicalDecimal(c.value_text),change_bp:toBp(d),source:'derived',evidence:[p.observation_id,c.observation_id],version:EVENTS_VERSION});
 }
 return out;
}
```
`cycles.ts::policyCycles(events:readonly Pick<PolicyEvent,'effective_date'|'change_bp'>[],lastDate)`（实现只用这两个字段，签名放宽即可）。`series-extras.ts`：`SeriesExtras` 增 `quoteEvents:RateQuoteEvent[]`；`if(def.region==='CN'&&def.type==='policy_rate'&&def.derive?.from.endsWith('_Q')){const quotes=await read(def.derive.from,DAILY_MAX_ROWS);quoteEvents=deriveRateQuoteEvents(def.derive.from,quotes);if(quotes.length)cycles=policyCycles(quoteEvents,quotes[quotes.length-1].period_end);}`（放在既有 US 分支之后、月度 `seriesCycles` 分支之前）。目录里此时还没有 `_Q` 行，所以生产行为不变；测试用本地 def。

- [ ] **Step 4: 通过 + 闭包自检**

Run: `npm test -- src/lib/macro` ; `npm run typecheck` ; `npm run lint`
Run: `npx tsx -e "import('./src/lib/judgments/formula-hash').then(m=>console.log(m.importClosure(process.cwd(),'src/lib/judgments/methodologies/macro-regime.v1.ts').filter(f=>/events|series-extras|cycles|parsers|collect/.test(f))))"`
Expected: `[]`（本 PR 没碰闭包文件）；`git diff --name-only origin/main` 不含 `types.ts`/`catalog.ts`/`snapshots.ts`/`freshness.ts`/`db.ts`。

- [ ] **Step 5: 提交 → PR-1**

```bash
git add src/lib/macro/events.ts src/lib/macro/events.test.ts src/lib/macro/series-extras.ts src/lib/macro/series-extras.test.ts src/lib/macro/cycles.ts
git commit -F - <<'EOF'
feat(macro): CN policy-rate quote events (macro-events/2) and quoteEvents in series extras

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```
PR 正文（Opus 写）：序列表（LPR 1Y/5Y、社融存量同比、MLF 结论）、证据样本（夹具 sha256 + 定位器示例）、回放测试结果（三个测试文件通过数）、仍缺失项（MLF：无单一利率；LPR/社融目录行仍 missing，待 PR-3 翻活）。

---

### Task 6: FRED 夹具与解析回归（PR-2 起点）

**Files:**
- Modify: `scripts/macro/record-fred-fixtures.ts`（`--codes A,B,C` 可选参数：给定时只录这些 code，`series_id` 取 `--ids` 或与 code 同名）
- Create: `src/lib/macro/fixtures/fred/{WALCL,RRPONTSYD,WTREGEN}.csv`；Modify `manifest.json`（追加三条，保持按 code 排序）
- Test: `src/lib/macro/parsers/fred-csv.test.ts`

- [ ] **Step 1: 录制**

Run: `npx tsx scripts/macro/record-fred-fixtures.ts --codes WALCL,RRPONTSYD,WTREGEN --ids US_WALCL_W,US_RRPONTSYD_D,US_WTREGEN_W`
Expected: 三行 `<CODE>\t<bytes> bytes`；manifest 共 13 条。实现：`--codes` 存在时 `defs` 改为 `codes.map((code,i)=>({id:ids[i]??code,source:{seriesKey:code}}))` 的最小对象，其余逻辑不变；读取现有 manifest 合并去重后写回。

- [ ] **Step 2: 失败测试**

```ts
// fred-csv.test.ts 追加
describe('weekly and sparse daily FRED series (WP-D fixtures)',()=>{
 const fx=(code:string)=>new Uint8Array(readFileSync(join(process.cwd(),'src/lib/macro/fixtures/fred',`${code}.csv`)));
 it('WALCL: weekly Wednesday levels parse with period day; first and last rows match the bytes',()=>{
  const pts=parseFredCsv(fx('WALCL'),{seriesId:'US_WALCL_W',code:'WALCL',period:'day'});
  expect(pts[0]).toEqual({seriesId:'US_WALCL_W',periodEnd:'2015-01-07',valueText:expect.stringMatching(/^\d+$/),locator:{kind:'csv_row',line:2,column:1}});
  for(const p of pts)expect(new Date(`${p.periodEnd}T00:00:00Z`).getUTCDay(),p.periodEnd).toBe(3);   // every period_end is a Wednesday
 });
 it('WTREGEN: weekly week-average levels, Wednesdays only',()=>{
  for(const p of parseFredCsv(fx('WTREGEN'),{seriesId:'US_WTREGEN_W',code:'WTREGEN',period:'day'}))expect(new Date(`${p.periodEnd}T00:00:00Z`).getUTCDay()).toBe(3);
 });
 it('RRPONTSYD: empty values (no operation that day) produce no point; values keep decimal text',()=>{
  const text=new TextDecoder().decode(fx('RRPONTSYD'));const empty=text.split('\n').filter(l=>/^\d{4}-\d{2}-\d{2},$/.test(l)).length;
  const pts=parseFredCsv(fx('RRPONTSYD'),{seriesId:'US_RRPONTSYD_D',code:'RRPONTSYD',period:'day'});
  expect(empty).toBeGreaterThan(0);expect(pts.length+empty).toBe(text.trimEnd().split('\n').length-1);
  expect(pts.every(p=>/^-?\d+(\.\d+)?$/.test(p.valueText))).toBe(true);
 });
});
```
（录制用 `cosd=2015-01-01`，首行 2015-01-07 是周三。）

- [ ] **Step 3: 跑测试** — Run: `npm test -- src/lib/macro/parsers/fred-csv.test.ts` → PASS（解析器无需改动；本步只证明周频 / 空值已被覆盖）。

- [ ] **Step 4: 提交**

```bash
git add scripts/macro/record-fred-fixtures.ts src/lib/macro/fixtures/fred src/lib/macro/parsers/fred-csv.test.ts
git commit -F - <<'EOF'
test(macro): record WALCL / RRPONTSYD / WTREGEN fixtures; weekly and sparse-daily parser regressions

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 7: `fredCosdFor(…, firstPeriod)` 与按首期判定回填完成

**Files:**
- Modify: `src/lib/macro/providers/fred.ts`、`src/lib/macro/providers/fred.test.ts`
- Modify: `src/app/api/cron/macro-sync/route.ts`、`src/app/api/cron/macro-sync/route.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// fred.test.ts 追加
it('fredCosdFor floors the full window at firstPeriod and ignores it once backfilled',()=>{
 expect(fredCosdFor('day',false,'2026-11-06','2002-12-18')).toBe('2002-12-18');
 expect(fredCosdFor('day',false,'2026-11-06','1999-01-01')).toBe('2000-01-01');
 expect(fredCosdFor('day',true,'2026-11-06','2002-12-18')).toBe('2025-10-02');
 expect(fredCosdFor('day',false,'2026-11-06')).toBe('2000-01-01');
});
it('fredBackfillDoneBy: 105 days after the series start, never before FRED_BACKFILL_DONE_BY',()=>{
 expect(fredBackfillDoneBy()).toBe('2000-04-15');
 expect(fredBackfillDoneBy('2002-12-18')).toBe('2003-04-02');
 expect(fredBackfillDoneBy('1999-06-01')).toBe('2000-04-15');
});
```
`route.test.ts` 加一例：一条 `firstPeriod:'2002-12-18'` 的测试目录行（route 测试已有注入目录的办法；若没有，用 `vi.mock('@/lib/macro/catalog')` 注入），数据库里已有 2003-01 的 eligible 行 → 第二次运行取 `cosd=` 400 天窗口而非 `2000-01-01`。

- [ ] **Step 2: 确认失败** — Run: `npm test -- src/lib/macro/providers/fred.test.ts` → FAIL。

- [ ] **Step 3: 实现**

```ts
// fred.ts
export function fredCosdFor(period:PeriodKind,backfilled:boolean,today:string,firstPeriod?:string):string{
 if(!backfilled)return firstPeriod&&firstPeriod>FRED_COSD?firstPeriod:FRED_COSD;
 …既有…
}
/** The date by which a series' persisted history must reach back for its backfill to count as complete: FRED_BACKFILL_DONE_BY,
 *  or 105 days after a later firstPeriod (covers a quarterly first period). */
export function fredBackfillDoneBy(firstPeriod?:string):string{
 if(!firstPeriod||firstPeriod<=FRED_COSD)return FRED_BACKFILL_DONE_BY;
 const d=new Date(`${firstPeriod}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+105);return d.toISOString().slice(0,10);
}
```
`route.ts`：`backfillComplete(deps,def)` 改查 `{from:fredCosdFor(def.period,false,today,def.firstPeriod),to:fredBackfillDoneBy(def.firstPeriod)}`；调用 `fredCosdFor(def.period,await backfillComplete(deps,def),today,def.firstPeriod)`。`def.firstPeriod` 在 PR-2 时类型上尚不存在 → 用 `(def as {firstPeriod?:string}).firstPeriod`（Task 10 删掉断言）。

- [ ] **Step 4: 通过** — Run: `npm test -- src/lib/macro/providers src/app/api/cron/macro-sync` → PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/macro/providers/fred.ts src/lib/macro/providers/fred.test.ts src/app/api/cron/macro-sync/route.ts src/app/api/cron/macro-sync/route.test.ts
git commit -F - <<'EOF'
feat(macro): FRED full-window floor and backfill-complete check honour a series' firstPeriod

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 8: 单位区间 `usd_mn` / `usd_bn`；weekly `month_end` 派生测试

**Files:**
- Modify: `src/lib/macro/quality.ts`、`src/lib/macro/quality.test.ts`、`src/lib/macro/derive.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// quality.test.ts
it('usd_mn / usd_bn profiles (Fed balance-sheet levels, RRP volumes)',()=>{
 expect(KNOWN_UNITS).toContain('usd_mn');expect(KNOWN_UNITS).toContain('usd_bn');
 expect(profileOf({unit:'usd_mn',type:null})).toEqual({min:0,max:20_000_000,maxRelJump:0.5});
 expect(profileOf({unit:'usd_bn',type:null})).toEqual({min:0,max:10_000,maxRelJump:null});
 expect(validatePoint({unit:'usd_mn',type:null},'6748145','6745635').passed).toBe(true);
 expect(validatePoint({unit:'usd_mn',type:null},'6748145','3000000').passed).toBe(false);   // > 50 % week-on-week jump
 expect(validatePoint({unit:'usd_bn',type:null},'0.15','2500').passed).toBe(true);          // RRP collapses are real
});
// derive.test.ts
describe('deriveSeries month_end over weekly Wednesday inputs',()=>{
 const me=def('US_WALCL',{kind:'month_end',from:'US_WALCL_W'});
 it('takes the last Wednesday observation of each completed month; a month whose last Wednesday is early is not padded',()=>{
  const w=['2026-09-02','2026-09-09','2026-09-16','2026-09-23','2026-09-30','2026-10-07','2026-10-14','2026-10-21','2026-10-28','2026-11-04'].map((d,i)=>obs('US_WALCL_W',d,String(6700000+i)));
  const out=deriveSeries(me,w,{now:new Date('2026-11-06T05:30:00Z')});
  expect(out.map(o=>[o.period_end,o.value_text])).toEqual([['2026-09-30','6700004'],['2026-10-31','6700008']]);
  expect(out[1].derived_from).toEqual([w[8].observation_id,w[9].observation_id]);   // Oct 28 + witness Nov 4
 });
 it('a month with no observation produces no row',()=>{
  const w=[obs('US_WALCL_W','2026-08-26','1'),obs('US_WALCL_W','2026-10-07','2'),obs('US_WALCL_W','2026-11-04','3')];
  expect(deriveSeries(me,w,{now:new Date('2026-11-06T05:30:00Z')}).map(o=>o.period_end)).toEqual(['2026-08-31','2026-10-31']);
 });
});
describe('deriveSeries month_end over LPR quote dates (event source)',()=>{
 const lpr=def('CN_LPR_1Y',{kind:'month_end',from:'CN_LPR_1Y_Q'},'month','immutable');
 it('two quotes in one month → the later one; a month without a quote → no row; the current month → no row; available_at = witness',()=>{
  const a=obs('CN_LPR_1Y_Q','2026-08-20','3','2026-08-20T01:30:00.000Z'),b=obs('CN_LPR_1Y_Q','2026-08-25','3.1','2026-08-25T01:30:00.000Z'),c=obs('CN_LPR_1Y_Q','2026-10-20','3.1','2026-10-20T01:30:00.000Z'),d=obs('CN_LPR_1Y_Q','2026-11-20','3','2026-11-20T01:30:00.000Z');
  const out=deriveSeries(lpr,[a,b,c,d],{now:new Date('2026-11-21T05:30:00Z')});
  expect(out).toEqual([
   {series_id:'CN_LPR_1Y',period_end:'2026-08-31',value_text:'3.1',available_at:c.available_at,revisable:false,derived_from:[b.observation_id,c.observation_id],transform:'month_end@1'},   // September has no quote: no row, witness is October
   {series_id:'CN_LPR_1Y',period_end:'2026-10-31',value_text:'3.1',available_at:d.available_at,revisable:false,derived_from:[c.observation_id,d.observation_id],transform:'month_end@1'},
  ]);
 });
});
```

- [ ] **Step 2: 确认失败**，**Step 3: 实现**（`KNOWN_UNITS` 追加两项；`BY_UNIT` 加 `usd_mn:{min:0,max:20_000_000,maxRelJump:0.5}`、`usd_bn:{min:0,max:10_000,maxRelJump:null}`；派生代码不改），**Step 4: 通过**：`npm test -- src/lib/macro/quality.test.ts src/lib/macro/derive.test.ts`。

- [ ] **Step 5: 门禁 + 闭包自检 + 提交 → PR-2**

Run: `npm run typecheck && npm run lint && npm test -- src/lib/macro src/app/api/cron/macro-sync`；`git diff --name-only origin/main` 不含闭包 / deps 文件。
```bash
git add src/lib/macro/quality.ts src/lib/macro/quality.test.ts src/lib/macro/derive.test.ts
git commit -F - <<'EOF'
feat(macro): usd_mn / usd_bn quality profiles; weekly month_end derivation regressions

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```
PR 正文：序列表（三条 + 月末派生行，单位 / 频率 / 对齐规则：WALCL 周三水平、WTREGEN 周平均以周三标记、RRPONTSYD 日成交额且无操作日无点；月度行 = 月内最后一次周观测，**不是**月末余额）、夹具 sha256、解析回归结果、尚未入目录的说明（PR-3）。

---

### Task 9: 迁移 `20261121090000_macro_wpd_catalog.sql`（PR-3 起点；分支基于含 #129 的 main）

**Files:**
- Create: `supabase/migrations/20261121090000_macro_wpd_catalog.sql`
- Modify: `supabase/migrations.lock.json`（追加）、`src/lib/macro/macro.integration.test.ts`

- [ ] **Step 1: 失败的集成测试**（在既有 `describe.skipIf(!enabled)` 块内）

```ts
it('WP-D migration: native_frequency accepts weekly, evidence adapter accepts official_http',async()=>{
 const nf=await q(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.macro_series'::regclass and pg_get_constraintdef(oid) like '%native_frequency%'`);
 expect(nf[0].d).toContain(`'weekly'`);
 const ad=await q(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.macro_evidence_objects'::regclass and pg_get_constraintdef(oid) like '%adapter%' and contype='c'`);
 expect(ad.map((r:{d:string})=>r.d).join(' ')).toContain(`'official_http'`);
 await expect(q(`insert into public.macro_evidence_objects(sha256,object_path,adapter,content_type,byte_length) values(repeat('a',64),'official_http/'||repeat('a',64)||'.json','official_http','application/json',1)`)).resolves.toBeDefined();
});
```

- [ ] **Step 2: 迁移**

```sql
-- supabase/migrations/20261121090000_macro_wpd_catalog.sql
-- WP-D (plan 2026-11-07-macro-wpd-data-gaps, Task 9): two CHECK widenings. Replayable: each block asserts exactly one
-- CHECK on the column (the inline column check of 20261114090000 is named <table>_<column>_check by PostgreSQL; the
-- deparsed definition reads `... = ANY (ARRAY[...])`, so matching is by column name, not by the literal "in"), drops it
-- by its found name and re-adds the widened one under the canonical name; a second run finds the widened constraint and
-- re-creates the identical definition.
--   macro_series.native_frequency: ('daily','monthly','quarterly','event') → + 'weekly'   (FRED WALCL / WTREGEN)
--   macro_evidence_objects.adapter: ('fred_csv','akshare') → + 'official_http'             (chinamoney LPR, PBOC AFRE)
-- Verify after apply:
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.macro_series'::regclass and conname='macro_series_native_frequency_check';
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.macro_evidence_objects'::regclass and conname='macro_evidence_objects_adapter_check';
-- The object-path CHECK macro_evidence_path ('^' || adapter || '/' || sha256 || '\.(csv|json|html|txt)$') already admits the new adapter and is not touched.
do $$ declare c text; n int; begin
 select count(*), min(conname) into n, c from pg_constraint
  where conrelid='public.macro_series'::regclass and contype='c' and pg_get_constraintdef(oid) ~ '\mnative_frequency\M';
 if n <> 1 then raise exception 'expected exactly one CHECK on macro_series.native_frequency, found %', n; end if;
 execute format('alter table public.macro_series drop constraint %I', c);
 alter table public.macro_series add constraint macro_series_native_frequency_check check (native_frequency in ('daily','weekly','monthly','quarterly','event'));

 select count(*), min(conname) into n, c from pg_constraint
  where conrelid='public.macro_evidence_objects'::regclass and contype='c' and pg_get_constraintdef(oid) ~ '\madapter\M' and conname <> 'macro_evidence_path';
 if n <> 1 then raise exception 'expected exactly one CHECK on macro_evidence_objects.adapter, found %', n; end if;
 execute format('alter table public.macro_evidence_objects drop constraint %I', c);
 alter table public.macro_evidence_objects add constraint macro_evidence_objects_adapter_check check (adapter in ('fred_csv','akshare','official_http'));
end $$;
```
（`macro_retrievals` 无 adapter 列——Task 9 实施前用 `grep -n adapter supabase/migrations/20261114090000_macro_workbench.sql` 再确认；若有同类 CHECK，同法处理。）集成测试追加：应用两次后两条约束定义相同；`insert … adapter='bogus'` 被拒；`macro_evidence_path` 约束仍存在；`native_frequency='weekly'` 行可经 `macro_upsert_catalog` 写入 `macro_series`。

- [ ] **Step 3: 锁与门禁**

Run: `shasum -a 256 supabase/migrations/20261121090000_macro_wpd_catalog.sql` → 追加到 `migrations.lock.json` 末尾；`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:migrations` → PASS；`… npm run test:db -- src/lib/macro/macro.integration.test.ts` → PASS。

- [ ] **Step 4: 提交**

```bash
git add supabase/migrations/20261121090000_macro_wpd_catalog.sql supabase/migrations.lock.json src/lib/macro/macro.integration.test.ts
git commit -F - <<'EOF'
feat(macro): migration 20261121090000 — weekly native frequency, official_http evidence adapter

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 10: 类型 + 目录（一次升级）+ `cn-series/2` + 分派 + ingest 按目录 adapter + weekly 新鲜度 + D0

**Files:**
- Modify: `src/lib/macro/types.ts`、`catalog.ts`、`catalog.test.ts`、`evidence.ts`（`ADAPTERS` + `PATH` 正则加 `official_http`）、`evidence.test.ts`、`cn-series.ts`、`cn-series.test.ts`、`scripts/macro/cn-series.json`（`npx tsx scripts/macro/export-cn-series.ts`）、`parsers/index.ts`、`read-api-asof.integration.test.ts`、`parsers/cn-parsers.test.ts`、`ingest.ts`（`DATASET_OF.official_http='macro.akshare'`）、`src/app/api/macro/ingest/route.ts`（+test）、`freshness.ts`、`freshness.test.ts`、`snapshots.ts`、`snapshots.test.ts`、`replay.test.ts`、`src/app/api/cron/macro-sync/route.ts`（去掉 Task 7 的类型断言）、`quality.test.ts:63`（目录单位全在 `KNOWN_UNITS`——自动覆盖新单位）

- [ ] **Step 1: 失败测试（目录精确列表）**

```ts
// catalog.test.ts 改动点
const AKSHARE_HOSTS=new Set(['data.stats.gov.cn','yield.chinabond.com.cn','www.safe.gov.cn']);
const HTTP_HOSTS=new Set(['www.chinamoney.org.cn','www.pbc.gov.cn']);
// 主机：adapter akshare → AKSHARE_HOSTS；official_http → HTTP_HOSTS；fred_csv → fred.stlouisfed.org
// missing 精确集合：['CN_MLF_1Y','US_ISM_PMI']
// weights：CN 列表加 CN_LPR_5Y → 0；weightOf('CN') 仍 125（LPR 5Y weight 0）；US 仍 100（新六行 weight 0）
// lag 规则：daily / event / month_end 行 undefined；weekly 原生行 releaseLagDays === 1；monthly/quarterly 原生按表
it('WP-D rows',()=>{
 expect(catalogById('US_WALCL_W')).toMatchObject({role:'indicator',type:null,unit:'usd_mn',nativeFrequency:'weekly',period:'day',adjustment:'na',status:'active',revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:1,firstPeriod:'2002-12-18',source:{adapter:'fred_csv',seriesKey:'WALCL',rights:'public_domain'}});
 expect(catalogById('US_WALCL')).toMatchObject({nativeFrequency:'monthly',period:'month',derive:{kind:'month_end',from:'US_WALCL_W'},weight:0,unit:'usd_mn'});
 expect(catalogById('US_RRPONTSYD_D')).toMatchObject({unit:'usd_bn',nativeFrequency:'daily',revisionPolicy:'immutable',firstPeriod:'2003-02-07',source:{seriesKey:'RRPONTSYD',publisher:{en:'Federal Reserve Bank of New York'}}});
 expect(catalogById('US_WTREGEN_W')).toMatchObject({unit:'usd_mn',nativeFrequency:'weekly',releaseLagDays:1,firstPeriod:'2002-12-18',source:{seriesKey:'WTREGEN'}});
 expect(catalogById('CN_LPR_1Y_Q')).toMatchObject({role:'event_source',type:'policy_rate',nativeFrequency:'event',period:'day',status:'active',weight:0,revisionPolicy:'immutable',firstPeriod:'2019-08-20',source:{adapter:'official_http',fetchHost:'www.chinamoney.org.cn',seriesKey:'http_json|/ags/ms/cm-u-bk-currency/LprHis|1Y',rights:'official_open'}});
 expect(catalogById('CN_LPR_5Y_Q')!.source!.seriesKey).toBe('http_json|/ags/ms/cm-u-bk-currency/LprHis|5Y');
 expect(catalogById('CN_LPR_1Y')).toMatchObject({status:'active',weight:10,nativeFrequency:'monthly',derive:{kind:'month_end',from:'CN_LPR_1Y_Q'},revisionPolicy:'immutable'});
 expect(catalogById('CN_LPR_5Y')).toMatchObject({status:'active',weight:0,type:'policy_rate',derive:{kind:'month_end',from:'CN_LPR_5Y_Q'}});
 expect(catalogById('CN_AFRE_STOCK_YOY')).toMatchObject({status:'active',weight:20,revisionPolicy:'revisable',releaseLagDays:15,source:{adapter:'official_http',fetchHost:'www.pbc.gov.cn',seriesKey:'http_html|/diaochatongjisi/attachDir/|社会融资规模存量'}});
 expect(catalogById('CN_MLF_1Y')!.reason!.zh).toContain('多重价位');
 expect(indicatorsOf('US').map(d=>d.id)).toEqual(['US_DFF','US_DGS10','US_DTWEXBGS','US_CPI_YOY','US_UNRATE','US_PPI_FD_YOY','US_ISM_PMI','US_VIX','US_WALCL','US_RRPONTSYD','US_WTREGEN']);
 expect(indicatorsOf('CN').map(d=>d.id)).toEqual(['CN_CPI_YOY','CN_PPI_YOY','CN_PMI_MFG','CN_GDP_YOY','CN_M2_YOY','CN_EXPORT_YOY','CN_CGB_10Y','CN_USDCNY_CP','CN_LPR_1Y','CN_LPR_5Y','CN_MLF_1Y','CN_AFRE_STOCK_YOY']);
 expect(regimeInputsOf('CN').map(d=>d.id)).toEqual(['CN_CPI_YOY','CN_PPI_YOY','CN_PMI_MFG','CN_GDP_YOY','CN_M2_YOY','CN_EXPORT_YOY','CN_CGB_10Y','CN_USDCNY_CP','CN_LPR_1Y','CN_AFRE_STOCK_YOY']);   // weight > 0 only
 expect(regimeInputsOf('US').map(d=>d.id)).toEqual(['US_DFF','US_DGS10','US_DTWEXBGS','US_CPI_YOY','US_UNRATE','US_PPI_FD_YOY']);
 expect(collectableOf('fred_csv').map(d=>d.source!.seriesKey)).toEqual(['DFF','DFEDTARU','DFEDTARL','DFEDTAR','DGS10','DTWEXBGS','CPIAUCSL','UNRATE','PPIFIS','DCOILWTICO','WALCL','RRPONTSYD','WTREGEN']);
 expect(collectableOf('official_http').map(d=>d.id)).toEqual(['CN_LPR_1Y_Q','CN_LPR_5Y_Q','CN_AFRE_STOCK_YOY']);
 expect(CATALOG_VERSION).not.toBe('macro-catalog/30bcaa2a33c5');
});
```
`cn-series.test.ts`：`cnSpecOf` 对 `http_json|…|1Y` / `http_html|…` 的输出等于 §共享契约；`cnSeriesSpecs()` = `collectableOf('akshare')` ∪ `collectableOf('official_http')`；提交的 `cn-series.json` 等于 `cnSeriesDocument()`（version `cn-series/2`）。
`cn-parsers.test.ts:129-143` 的 `parserFor` 精确列表加三条（`CN_LPR_1Y_Q`→`chinamoney-lprhis/1`，`CN_LPR_5Y_Q`，`CN_AFRE_STOCK_YOY`→`pboc-afre-stock/1`）；`parserFor('CN_LPR_1Y')` 为 null（派生）。
`freshness.test.ts`：`releaseTimeliness({nativeFrequency:'weekly',period:'day',releaseLagDays:1},'2026-10-28','2026-11-08')` = current（下期 11-04 + 1 + 3 = 11-08），`'2026-11-09'` = late。
`snapshots.test.ts`：`catalogItemsOf('US')` 含 `US_WALCL`；`buildRegimeInput` 冻结 `displayInputsOf` 中有数据的 weight-0 行（观测进 `observation_ids`），`classifyRegime` 结果与只喂 weight>0 行时相同（同一输入下 scores / coverage 相等）。
`replay.test.ts:116`：`expectedDerived` US 加 `'US_WALCL'`，CN 加 `'CN_LPR_1Y'`（回放夹具需含对应原生点：US 用 WALCL.csv 夹具、CN 用 `cn-http/CN_LPR_Q-2026.json`——`replay.test.ts` 的夹具装载按 adapter 分派，`official_http` 走 `fixtures/cn-http`）。
`ingest/route.test.ts`：一块混合 `akshare` + `official_http` 证据：各自 `adapter` 从目录推导（payload 本身没有 adapter 字段，所以没有第二个来源可比；`parserFor` 为空 = `unknown_series`），按 adapter 分组后分别 `ingestEvidence`，**分组计数累加**：第一组成功、第二组 `quarantine_link_failed` 时 `completeChunk` 的 counts / usable / errors = 第一组回执 + 第二组 partial（各只计一次），再投递同一块得到同一回执；`official_http` 项的 `evidence_not_allowed`：`prefix` 匹配只接受 `spec.evidence_path_prefixes` 之一开头且 `.htm` 结尾；Content-Type 家族不匹配（`http_json` 非 `application/json*`、`http_html` 非 `text/html*`）→ `evidence_not_allowed`；解析失败的 `official_http` 证据以 `adapter:'official_http'` 入库（经真实 `evidence.ts` 路径）。
`evidence.test.ts`：`evidencePath('official_http',sha,'application/json;charset=UTF-8')==='official_http/<sha>.json'`；`text/html` → `.html`；`bogus/` 非法。
`read-api-asof.integration.test.ts`：WALCL 周观测 10-28（available 10-29）+ 11-04（available 11-05）→ 10 月月度行 `available_at` = 11-05；`asOf=2026-11-04` 读不到该月度行，`asOf=2026-11-05` 读到（完成见证的 as-of 可见性）。
`freshness.test.ts` 再加：最新周观测 10-07、today 11-08 → late（多周陈旧按最新观测算，不按"应有"期）。

- [ ] **Step 2: 确认失败** — Run: `npm test -- src/lib/macro src/app/api/macro/ingest` → FAIL。

- [ ] **Step 3: 实现**

`types.ts`：契约节三行。`catalog.ts`：

```ts
const NYFED:Bilingual={zh:'纽约联邦储备银行',en:'Federal Reserve Bank of New York'};
const CFETS:Bilingual={zh:'全国银行间同业拆借中心',en:'China Foreign Exchange Trade System (National Interbank Funding Center)'};
const http=(fetchHost:string,seriesKey:string,publisher:Bilingual):SeriesSource=>({adapter:'official_http',fetchHost,publisher,seriesKey,rights:'official_open',attribution:{zh:`来源：${publisher.zh}`,en:`Source: ${publisher.en}`}});
const S_WALCL=fred('WALCL',FED),S_RRP=fred('RRPONTSYD',NYFED),S_TGA=fred('WTREGEN',FED);
const S_LPR1=http('www.chinamoney.org.cn','http_json|/ags/ms/cm-u-bk-currency/LprHis|1Y',CFETS),S_LPR5=http('www.chinamoney.org.cn','http_json|/ags/ms/cm-u-bk-currency/LprHis|5Y',CFETS);
const S_AFRE=http('www.pbc.gov.cn','http_html|/diaochatongjisi/attachDir/|社会融资规模存量',PBOC);
// US（插在 US_DJIA 之后、CN 之前）— verified 2026-11-07 (plan D0a): units/frequency quoted from the FRED series pages
{id:'US_WALCL_W',region:'US',role:'indicator',type:null,name:{zh:'联储总资产（周三水平，周）',en:'Fed total assets, Wednesday level (weekly)'},unit:'usd_mn',nativeFrequency:'weekly',period:'day',adjustment:'na',status:'active',source:S_WALCL,revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:1,firstPeriod:'2002-12-18',definitionVersion:1},
{id:'US_WALCL',region:'US',role:'indicator',type:null,name:{zh:'联储总资产（月内最后一次周观测）',en:'Fed total assets (last weekly observation of the month)'},unit:'usd_mn',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_WALCL,derive:{kind:'month_end',from:'US_WALCL_W'},revisionPolicy:'revisable',weight:0,changeKind:'pct',definitionVersion:1},
// RRPONTSYD is a daily transaction amount (NY Fed TOMO results), not a balance: immutable (a different value for a past day is a source error → quarantine, never a silent version)
{id:'US_RRPONTSYD_D',region:'US',role:'indicator',type:null,name:{zh:'隔夜逆回购成交额（国债，日）',en:'Overnight reverse repo, Treasury securities sold (daily volume)'},unit:'usd_bn',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_RRP,revisionPolicy:'immutable',weight:0,changeKind:'pct',firstPeriod:'2003-02-07',definitionVersion:1},
{id:'US_RRPONTSYD',region:'US',role:'indicator',type:null,name:{zh:'隔夜逆回购成交额（月内最后一个操作日）',en:'Overnight reverse repo volume (last operation day of the month)'},unit:'usd_bn',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_RRP,derive:{kind:'month_end',from:'US_RRPONTSYD_D'},revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
{id:'US_WTREGEN_W',region:'US',role:'indicator',type:null,name:{zh:'财政部一般账户（周平均，以周三标记）',en:'Treasury General Account, week average (dated Wednesday)'},unit:'usd_mn',nativeFrequency:'weekly',period:'day',adjustment:'na',status:'active',source:S_TGA,revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:1,firstPeriod:'2002-12-18',definitionVersion:1},
{id:'US_WTREGEN',region:'US',role:'indicator',type:null,name:{zh:'财政部一般账户（月内最后一次周平均观测）',en:'Treasury General Account (last weekly average of the month)'},unit:'usd_mn',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_TGA,derive:{kind:'month_end',from:'US_WTREGEN_W'},revisionPolicy:'revisable',weight:0,changeKind:'pct',definitionVersion:1},
// CN：CN_LPR_1Y 行改为（status active、source S_LPR1、derive month_end from CN_LPR_1Y_Q、名称"（月内最后一次报价）"、definitionVersion:2，reason 删除）；新增：
{id:'CN_LPR_1Y_Q',region:'CN',role:'event_source',type:'policy_rate',name:{zh:'1 年期 LPR 报价（报价日）',en:'1-year LPR quote (quote date)'},unit:'pct',nativeFrequency:'event',period:'day',adjustment:'na',status:'active',source:S_LPR1,revisionPolicy:'immutable',weight:0,changeKind:'bp',firstPeriod:'2019-08-20',definitionVersion:1},
{id:'CN_LPR_5Y_Q',region:'CN',role:'event_source',type:'policy_rate',name:{zh:'5 年期以上 LPR 报价（报价日）',en:'5-year-plus LPR quote (quote date)'},unit:'pct',nativeFrequency:'event',period:'day',adjustment:'na',status:'active',source:S_LPR5,revisionPolicy:'immutable',weight:0,changeKind:'bp',firstPeriod:'2019-08-20',definitionVersion:1},
{id:'CN_LPR_5Y',region:'CN',role:'indicator',type:'policy_rate',name:{zh:'5 年期以上贷款市场报价利率（月内最后一次报价）',en:'5-year-plus loan prime rate (last quote of the month)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_LPR5,derive:{kind:'month_end',from:'CN_LPR_5Y_Q'},revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
// CN_MLF_1Y：status missing 不变，reason 改为
reason:{zh:'2025 年 3 月起 MLF 改为多重价位中标，人民银行不再公布单一中标利率；此前利率仅见于公告正文，无可定位的官方表格（核实 2026-11-07）',en:'Since March 2025 MLF is allotted at multiple prices and the PBOC publishes no single rate; earlier rates appear only in announcement prose, with no locatable official table (verified 2026-11-07)'}
// CN_AFRE_STOCK_YOY：status active、source S_AFRE、releaseLagDays 15（证据：2026-09 数据的文件 `attachDir/2026/10/20261014…` 于 10-14 生成，2025-12 数据的文件于 2026-02-14 生成；PBOC 金融统计数据报告惯例为次月 10–15 日，取 15）、名称 en 改 'Aggregate financing to the real economy, stock, year over year (official growth rate)'、definitionVersion 2，reason 删除
```
目录顺序：新 CN 行插在 `CN_LPR_1Y` 之后、`CN_MLF_1Y` 之前（`CN_LPR_1Y_Q`、`CN_LPR_5Y_Q`、`CN_LPR_5Y`）。`WEIGHTS_V1` 不改（`CN_LPR_5Y` 权重 0 不在表里也合法：`regimeInputsOf` 过滤 weight>0；`catalog.test` 的权重断言只列表内 id）。
`cn-series.ts`：契约节；`cnSpecOf` 增两分支；`parsers/index.ts::parserFor` 允许 `official_http` 并按 `spec.function` 分派 `parseLprHis(b,{seriesId,field:spec.field,firstPeriod:def.firstPeriod!})` / `parseAfreStockYoy(b,{seriesId})`。`ingest/route.ts`：`adapter=catalogById(e.series_id)!.source!.adapter`（`parserFor` 非空已保证存在）用于 `EvidenceInput.adapter`、`putRetrieval`、分组后对每组各调一次 `ingestEvidence({adapter,…})`；路径校验 `spec.evidence_path_match==='prefix'?url.pathname.startsWith(spec.evidence_path)&&url.pathname.endsWith('.htm'):url.pathname===spec.evidence_path`。`freshness.ts::nextPeriodEnd` 不动；`releaseTimeliness` 在 `event` 判定后加 `if(def.nativeFrequency==='weekly'){const deadline=parseDate(latestPeriodEnd)+7*DAY+(def.releaseLagDays+GRACE_DAYS)*DAY;…}`。`snapshots.ts`（D0）：`export const displayInputsOf=(region:Region)=>indicatorsOf(region).filter(d=>d.status==='active'&&d.nativeFrequency!=='daily'&&d.nativeFrequency!=='event'&&d.nativeFrequency!=='weekly')`；`catalogItemsOf=indicatorsOf`；`buildRegimeInput` 用 `displayInputsOf`（`classifyRegime` 只遍历 `regionWeights`，多出的序列不影响分数）；`catalogCounts` 分母随之变大（测试更新）。

- [ ] **Step 4: 导出 + 通过**

Run: `npx tsx scripts/macro/export-cn-series.ts && npm test -- src/lib/macro src/app/api/macro src/app/api/cron && npm run typecheck && npm run lint`
Run: `npx tsx -e "import('./src/lib/macro/catalog').then(m=>console.log(m.CATALOG_VERSION))"` → 记下新值 **B**（Task 11 用字面量）。
Run: `LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db -- src/lib/macro`

- [ ] **Step 5: 提交**

```bash
git add src/lib/macro scripts/macro/cn-series.json src/app/api/macro/ingest src/app/api/cron/macro-sync
git commit -F - <<'EOF'
feat(macro): catalog v3 — Fed liquidity (WALCL/RRPONTSYD/WTREGEN), LPR 1Y/5Y quotes + month-end, AFRE stock yoy active; weekly freshness; official_http wiring; display inputs frozen (D0)

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 11: `macro-inputs.ts` 抽取 + `macro_regime@v3`（闭包收窄）+ 版本常量 + 文档

**Files:**
- Create: `src/lib/judgments/macro-inputs.ts`、`src/lib/judgments/methodologies/macro-regime.v3.ts`、`macro-regime.v3.test.ts`、`docs/methodologies/macro_regime/v3.md`
- Modify: `src/lib/judgments/inputs.ts`（`buildObservation`/`buildSnapshot` 移到 `macro-inputs.ts`，这里 `import` 回来；行为逐字不变）、`registry.ts`（`REGISTRY=[macroRegimeV3]`）、`compensate.ts::MACRO_METHOD`→`v3`、`src/lib/macro/strategy/playbooks.ts`、`deviations.ts::METHOD`→`v3`、`src/lib/judgments/testing/macro-fixture.ts`（v3）、`fixtures/judgments/replay/macro-regime.json`（重建）、`fixtures/judgments/macro/us-wpd-v3.json`（新快照夹具，`catalog_version` = B）

- [ ] **Step 1: 失败测试**

```ts
// macro-regime.v3.test.ts（复制 #129 的 v2 测试结构并改以下断言）
it('pins the current catalog version as a literal and the formula closure is exactly the macro-relevant set',()=>{
 expect(macroRegimeV3.params.catalog_version).toBe(CATALOG_VERSION);   // literal === runtime; a later catalog change turns this red first
 // Exact expected closure. Type-only imports count (judgments/types.ts pulls facts/types, industry/types, data/kline/types — kept: they are type
 // surfaces); what leaves vs v2 is the executable non-macro code: inputs.ts, kline.ts, facts/{derive,classify,json-numbers}.ts, industry/judgment-input.ts,
 // data/sources/{datagateway,eastmoney}.ts, db/table-client.ts, dq/{raw-store,reconcile/types}.ts, supabase/database.types.ts, research/ingest/pa-v1/json.js
 expect(importClosure(process.cwd(),macroRegimeV3.module)).toEqual([
  'src/lib/data/kline/types.ts','src/lib/facts/types.ts','src/lib/industry/types.ts',
  'src/lib/judgments/canonical.ts','src/lib/judgments/errors.ts','src/lib/judgments/macro-api.ts','src/lib/judgments/macro-inputs.ts',
  'src/lib/judgments/methodologies/macro-regime.v3.ts','src/lib/judgments/origins.ts','src/lib/judgments/time.ts','src/lib/judgments/types.ts',
  'src/lib/macro/catalog.ts','src/lib/macro/decimal.ts','src/lib/macro/judgment-contract.ts','src/lib/macro/regime.ts','src/lib/macro/types.ts',
 ]);   // implementer re-derives this with importClosure and pastes the actual sorted output; an unexpected file is a design error to fix, not a line to add
 expect(macroRegimeV3.deps).toEqual(['src/lib/judgments/resolvers/macro.ts','src/lib/macro/read-api.ts','src/lib/macro/snapshots.ts']);
 // deps dropped vs v2 (macro/db.ts, macro/freshness.ts, dq/freshness.ts): v3 never reads them; read-api.ts (classifyAsOf) and snapshots.ts (buildRegimeInput) are what the resolver replays
});
it('v2 → v3 parity: identical inputs give deep-equal gather/compute/condition results',async()=>{
 // setup copies the #129 module (git show origin/claude/integ-regime-drift:src/lib/judgments/methodologies/macro-regime.v2.ts) into
 // src/lib/judgments/testing/macro-regime.v2.frozen.ts with its pin edited to catalog B; run both over loadMacroFixture('us-wpd-v3') and the abstain
 // fixtures (binding_missing, snapshot_not_published, coverage_below_threshold, observation_missing, margin_unit_mismatch); expect deep equality
});
it('v3 computes on a snapshot of catalog B; a v2-era snapshot (30bcaa2a33c5 / #129 pin) abstains upstream_version_mismatch',…);
it('hand-computable CN case: LPR 1Y 3.00 and AFRE stock yoy 7.1 (prev 7.2) add {recovery 3, overheat 2, stagflation 7, recession 11}',()=>{
 // contribution = weight × support: CN_LPR_1Y 10 × policy.2_5to4_5 {0.3,0.2,0.1,0.1} = {3,2,1,1}; CN_AFRE_STOCK_YOY 20 × liq.lt8 {stagflation 0.3, recession 0.5} = {0,0,6,10}
 const r=classifyRegime({region:'CN',series:{CN_LPR_1Y:{latest:ref('2026-09-30','3')},CN_AFRE_STOCK_YOY:{latest:ref('2026-09-30','7.1'),prev:ref('2026-08-31','7.2')}}});
 expect(r.contributions.map(c=>[c.series_id,c.rule_id,c.contribution])).toEqual([
  ['CN_LPR_1Y','policy.2_5to4_5',{recovery:3,overheat:2,stagflation:1,recession:1}],
  ['CN_AFRE_STOCK_YOY','liq.lt8',{recovery:0,overheat:0,stagflation:6,recession:10}],
 ]);
 expect(r.uncoveredWeight).toBe(95);expect(r.regime).toBeNull();   // coverage 30/125 = 0.24 < 0.6 → regime.ts returns no regime; contributions are still reported
 // full-coverage variant: fixtures/judgments/macro/cn-wpd-v3.json (all CN inputs incl. these two) → coverage ≥ 0.6 and the same two contribution rows present
});
```
`methodology-sync.test.ts`（Task 12）另写。`inputs.test.ts` 不改（行为不变）。

- [ ] **Step 2: 确认失败**，**Step 3: 实现**

`macro-inputs.ts`：从 `inputs.ts` 原样搬 `buildObservation`→`buildMacroObservation`、`buildSnapshot`→`buildMacroSnapshot`、`viaMacro`、`iso`、`isoMax`、`notPublic`，加 `macroInputLabel`（只认两种 macro kind，输出与 `inputLabel` 对这两种 kind 逐字相同；`inputs.ts::inputLabel` 对这两种 kind 改为委托它）与 `assertInputArgs(asOf,observedAt)`（`buildInput` 开头两条校验原样搬来，`buildInput` 改为调用它）；导出 `buildMacroInput(req,db,asOf,observedAt)`（先校验再分派）。只 import `./macro-api`、`./origins`、`./canonical`、`./errors`、`./types`、`./time`、`@/lib/macro/judgment-contract`；**不** import `./inputs`（否则闭包回到 v2 大小并成环）。`inputs.ts` 改为从 `./macro-inputs` 导入；`inputs.test.ts` 不改且必须仍全绿。
`macro-regime.v3.ts`：复制 v2 文件，`version:'v3'`，`params.catalog_version:'<B 字面量>'`，`doc:'docs/methodologies/macro_regime/v3.md'`，`module` 指向自身，`import {buildMacroObservation,buildMacroSnapshot} from '@/lib/judgments/macro-inputs'` 替换 `buildInput`，`deps` 三项；文件头注释写明闭包收窄与 D0（`observation_ids` = 评分 ∪ 展示，`compute` 的长度检查按 `observation_ids`，仍成立）。
`v3.md`：复制 v2.md，§3 改 pin B（完整 `macro-catalog/<12 hex>` 字面量；文中称“目录版本 B”，“v3”只指 F4 方法），§7 版本历史加 v3 行："目录 v3（WP-D：美联储流动性三序列、LPR 1Y/5Y、社融存量同比翻活；MLF 保持缺失）；闭包收窄到 macro-inputs；deps 去掉 db/freshness/dq-freshness；v2 数据库行保留、零判断、代码注册表不再列出；v2 判断按 `catalog_version_mismatch` 到期作废"；§3 算例加上面的 CN 手算表。
`registry.ts`、`compensate.ts`、`playbooks.ts`、`deviations.ts`、`macro-fixture.ts`：`v2`→`v3`；`npx tsx scripts/judgments/build-replay-fixture.ts macro --check` 先看旧夹具对 v3 失败的原因只是版本 / pin，再 `npx tsx scripts/judgments/build-replay-fixture.ts macro` 重建 `fixtures/judgments/replay/macro-regime.json`，重建后 `--check` 通过；夹具 `us-wpd-v3.json` 的 `catalog_version` 字面量 = B；新增 `cn-wpd-v3.json`（CN 全覆盖输入含 LPR 1Y 与社融两行）。

- [ ] **Step 4: 通过** — Run: `npm test -- src/lib/judgments src/lib/macro/strategy && npm run typecheck && npm run lint`；`LC_ALL=C … npm run test:db -- src/lib/judgments`。

- [ ] **Step 5: 提交**

```bash
git add src/lib/judgments docs/methodologies/macro_regime/v3.md fixtures/judgments src/lib/macro/strategy/playbooks.ts src/lib/macro/strategy/deviations.ts
git commit -F - <<'EOF'
feat(judgments): macro_regime@v3 pinned to catalog v3; macro-inputs extracted so the formula closure holds only macro modules

Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
EOF
```

---

### Task 12: 同步计划测试（register v3，无 drift，v2 孤行保留）

**Files:** Modify `src/lib/judgments/methodology-sync.test.ts`

- [ ] **Step 1: 测试**：复制 #129 的 "ignores an orphan macro_regime@v1 DB row and registers the v2 code definition" 用例为 v2 孤行 + v3 注册；断言 `plan` 恰一项 `{key:'macro_regime@v3',action:'register',problems:[],existing:null}` 且 `row.formula_hash===formulaHashOf(macroRegimeV3).formula_hash`、`row.params.catalog_version===macroRegimeV3.params.catalog_version`、`row.code_version` = 传入值；`planExitCode(plan)===0`；应用后 `db.methodology('macro_regime','v2')` 整行与应用前深相等；再次 `planMethodologySync` → v3 `resync`、无 drift；改动 v3 的 `params` 后 → `drift`、exit 2、不写。
- [ ] **Step 2: 跑** `npm test -- src/lib/judgments/methodology-sync.test.ts` → PASS（若失败则 Task 11 有漏）。
- [ ] **Step 3: 提交** `test(judgments): sync plan registers macro_regime@v3 with v2 row left as is`。

---

### Task 13: runbook + 资产覆盖决策备忘录

**Files:**
- Modify: `docs/runbooks/macro-sync.md`（§10 新小节"WP-D 核实记录 2026-11-07"= 本计划 D0 表 + 夹具 sha256；§13 新小节“目录版本 B / macro_regime@v3 上线顺序（每步失败即停）”：① 迁移 `20261121090000`（rehearse begin..rollback，再 begin;file;history row;commit，同 §13.1）→ ② `scripts/judgments/sync-methodologies.ts --dry-run`（计划恰为 `register macro_regime@v3`，v2 行不在计划内、无 drift）→ 应用 → ③ 部署（`vercel deploy --prod --yes --env VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)`，由 prod-rollout 会话执行）→ ④ cron 05:30 UTC 首次发布：核对 `macro_snapshots` 最新 US 行 `catalog_version` = B、`observation_ids` 含 `US_WALCL` 等展示行；若仍是 A → 停 → ⑤ owner 在 Mac 上 `collect.py --mode backfill`（LPR 8 个年窗 + 社融 12 页）→ CN 快照 `catalog_version` = B，`CN_LPR_1Y` / `CN_AFRE_STOCK_YOY` 为 verified → ⑥ judgments-settle cron 的 compensate 对新快照 produce v3：`judgments` 出现 `methodology_version='v3'` 行后才算完成；v2 既有判断按 `catalog_version_mismatch` 到期作废（不 retire v2，与 #129 对 v1 的处理一致）；回滚 = §13.6；§14 新条目：`month_end` 完成见证延迟（LPR / WALCL 月度行在下一次观测到达后才生成）、AFRE 年份页每年 1 月追加（`cn-series.ts::AFRE_PAGES`，不改目录版本）、chinamoney 一年窗口限制、MLF 不可做的理由）
- Create: `docs/research/macro-asset-coverage-2026-11-07.md`

备忘录结构（每资产一节：候选一手来源 / 许可与再分发状态 / 价格 vs 总回报 / 交易日对齐 / 动作 / owner 决策编号）：

| 资产 | 候选一手来源 | 许可 | 口径 | 交易日对齐 | 动作 |
|---|---|---|---|---|---|
| 美股三指数（SP500 / NASDAQCOM / DJIA） | 一手 = S&P Dow Jones Indices / Nasdaq, Inc.（版权方）；FRED 只是再分发者（目录 `via`） | third_party，FRED 页 "Copyright, 2016, S&P Dow Jones Indices LLC…" 类条款；**owner 未确认** | 价格指数 | 美国交易日；月末派生 = 月内最后交易日 | 保持 `restricted`；owner 决策 **O-US-IDX**（runbook §9 流程） |
| 沪深 300 | 一手 = 中证指数有限公司（csindex.com.cn） | third_party；未确认 | 价格指数（另有全收益 H00300） | A 股交易日 | 保持 `restricted`；**O-CSI300** |
| 港股（恒指 / 恒生科技） | 一手 = 恒生指数有限公司（HKEX 是交易所，不是指数发布方） | third_party；目录 `Region` 只有 US/CN | 价格指数；恒生科技 2020-07-27 起 | 港交所交易日 | 不入目录；先扩 `Region`（另立规格）；**O-HK** |
| 黄金、铜 | 一手 = LBMA（金价）/ LME（铜官方价），版权数据；World Bank Pink Sheet 是再分发的月平均（XLSX，CC BY 4.0） | Pink Sheet CC BY 4.0 可再分发；LBMA/LME 需许可 | 月平均 ≠ 月末；现货 ≠ 期货 | 月度 | Pink Sheet 需 `xlsx_cell` 定位器 + 桶 MIME（迁移）；**O-COMMOD** |
| 债券总回报 | 无公开一手总回报指数（彭博 / 中债全价指数均受限） | — | 收益率 bp ≠ 持有回报 | — | 不做；历史表列头提示"收益率变动，非持有回报"（macro-p5） |

每项附"owner 需书面确认的句子"模板。

- [ ] 提交 `docs(macro): WP-D verification records, v3 bring-up order, asset coverage memo`。

---

### Task 14: 全量门禁 → PR-3

- [ ] `npm test`、`LC_ALL=C PATH=… npm run test:db`、`… npm run test:migrations`、`npm run typecheck`、`npm run lint`、`npm run build` 全绿（已知本机负载 flake 按 memory 规则单跑复核）。
- [ ] `npx tsx scripts/judgments/sync-methodologies.ts --dry-run`（本地库或内存）计划 = `register macro_regime@v3`，无 drift。
- [ ] PR 正文：序列表（全部 WP-D 行：id / 定义 / 单位 / 频率 / 首期 / 主机 / 定位器 / 派生 / 修订政策 / 权重）、证据样本、回放测试结果、`CATALOG_VERSION` A（#129）→ B、v3 pin、仍缺失项（MLF；资产 O-* 决策）、生产顺序链接 runbook §13。

---

## 交接（macro-p5 会话 / owner）

- macro-p5：`acceptedVersions:['v3']`（时钟路由）；`macro-format.ts::KNOWN_UNITS` + `messages/*/macro.json units.usd_mn/usd_bn`（"百万美元" / "USD mn"、"十亿美元" / "USD bn"）与 `frequency.weekly` 文案；`SeriesExtras.quoteEvents` 的标记渲染；`method_manifest` 不在 WP-D（若时钟仍需要，由 macro-p5 在 D0 之后加列 + publish 参数）；传导页 `TRANSMISSION_V2`（美国流动性节点 `not_in_catalog` → `observed`）由 macro-p5 在 PR-3 合并后做。
- macro-p5（规格）：P5 规格 §5.7/§5.8 写的是两次目录升级（D1→A/v2、D5→B/v3）；本计划按任务书只升一次（A = #129 所 pin，B = PR-3），请在规格第 4 稿把 §5.8 改为“P5-D1 不改目录；P5-D5 = B/v3”；`ACCEPTED_F4_VERSIONS` / 时钟路由 `acceptedVersions` 不在 main 上（WP-B 文件），PR-3 合并后由 WP-B 切到 `['v3']`。
- owner：O-MLF（是否要 `CN_MLF_BALANCE` 余额序列）、O-US-IDX、O-CSI300、O-HK、O-COMMOD；每年 1 月追加 AFRE 年份页；首次 `collect.py --mode backfill`。

## 自检（writing-plans）

- 规格覆盖：§5.2 六行 + weekly + 单位 + `firstPeriod`（Task 7/8/10）；§5.3 LPR（1/2/4/5/10）；§5.4 社融（1/3/4/10）；§5.5 MLF（D0 结论 + Task 10 理由）；§5.6 资产（13）；§5.7 方法版本（11/12）；§5.8 迁移与 PR 矩阵（9；PR 矩阵改为 3 个 PR，目录只升一次 = 本任务书要求）；§5.9 测试各项分布在 2/3/5/6/8/10/11。
- 不在本计划：`method_manifest`（交接）、transmission v2（交接）、v2 retire 迁移（沿 #129 惯例保留注册行）、`awaiting_witness` 时效文案（规格 §9：C6 文件，P5 不做）。
- 审计第 1 轮处置：`docs/audits/2026-11-07-macro-wpd/03-plan-audit-disposition.md`。
