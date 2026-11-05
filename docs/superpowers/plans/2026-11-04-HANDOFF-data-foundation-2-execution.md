# 交接文档：执行"数据底座二·披露事实库"实施计划

写于 2026-11-04（Fable 5.1 会话结束时）。接手会话的分工：**Opus 5.5 做总指挥与规划，Sonnet 5.5 写代码，Codex CLI gpt-6-astra（medium）做每个任务的审计与挑战**。本文档自足：不需要读旧会话。

---

## 1. 你要做什么

在分支 `claude/data-foundation-2` 上，按 `docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md`（18 个任务，约 9,400 行，含完整代码）逐任务实施，每个任务：Sonnet 5.5 实施子代理 → Opus 规格复审 → Opus 质量复审 → Codex 审计与挑战 → 修复 → 提交。全部完成后跑全量门禁，推送分支，开 PR 到 `main`。

计划实现的规格：`docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md`（第 8 稿；Codex 八轮审计后判定可实施；owner 决策 A/B/C 已取默认值并记录在 §14）。计划本身经 Codex 四轮审计，第四轮结论"ready for execution by implementer agents"（`docs/audits/2026-11-04-data-foundation-2-plan/`）。

总纲（硬约束，所有决策以它为准）：`docs/research/chaosai-integration-2026-11-04/EXPERT_PLAYBOOK_AND_BRIEF.md` §5 —— 只用一手来源；每个数字可回放（源文件哈希、行定位、可得日期、变换、代码版本）；事实与判断分离；缺失保持缺失（不填占位、不做代理指标、不换算、不混口径）。

## 2. 当前状态（一字不差）

- 仓库：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha`（主检出在 `main`）。工作树：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2`，分支 `claude/data-foundation-2`，HEAD = `1d16752`（已合并 `origin/main`，含已合并的 PR #100 计划一）。**在这个工作树里干活，不要 cd 到主检出。**
- 分支未推送到远端（所有提交只在本地）。
- 计划一（DQ 层 + 发行人主数据）已作为 PR #100 合并进 `main`（2026-11-04 23:32Z）；它的表、函数、`TableClient`、`startBatch/finishBatch`、`quarantine()`、`recordAttempt`、`resolveIssuer` 都在 `src/lib/dq`、`src/lib/db`、`src/lib/entities`，迁移 `supabase/migrations/20261105090000_dq_foundation.sql`、`20261105091000_issuers.sql`。
- `node_modules` 已在该工作树 `npm ci` 安装（233 个顶层包）。
- 未跟踪文件：`docs/audits/2026-11-04-data-foundation-2-plan/05-codex-plan-audit-round4.md`（计划第四轮审计报告，提交它）；`.claude/scratch/db-one.ts`（单文件数据库测试运行器，见 §5，不提交）。
- 代码一行都还没写：Task 1 尚未开始。
- 本机 `.env.local` 没有 `TUSHARE_TOKEN` 与 `EDGAR_USER_AGENT`；生产 Vercel 有 `TUSHARE_TOKEN`。owner 需把 `TUSHARE_TOKEN` 放在仓库外的 env 文件里供 Task 12/13 录制夹具；没有就走计划里写明的降级路径（合成夹具 + runbook"未核对"记录，不创建 `sync-cn.integration.test.ts`，CN cron 不加入 `vercel.json`）。

## 3. 执行顺序与任务定位（计划文件行号，HEAD `1d16752`）

先读计划第 1–276 行：仓库约定、文件结构、**共享契约**（`src/lib/facts/types.ts` 的原文）、契约补充、规格覆盖表、执行顺序表。任何任务都不得修改比它晚执行的任务创建的文件。

| 序 | 任务 | 行号 | 依赖 |
|---|---|---|---|
| 1 | Task 1 迁移 + 锁文件 + Row 类型 + 集成测试 | 290–1604 | — |
| 2 | Task 2 类型、`FactsDb`、Supabase 与内存实现 | 1605–2604 | Task 1 |
| 3 | Task 3 pg 实现 + 真实库契约与并发测试 | 2605–2829 | Task 2 |
| 4 | Task 4 概念目录、单位、期间分类、无损数值 | 2858–3613 | Task 2 |
| 5 | Task 5 `planFactWrites` | 3614–3876 | Task 4 |
| 6 | Task 6 规则与警告汇总、`INFO_CODES` | 3877–4090 | Task 5 |
| 7 | Task 7 `sequencesOf` | 4091–4253 | Task 4 |
| 8 | Task 14 `scope.ts` | 7408–7687 | Task 2、4、7 |
| 9 | Task 15 `derive.ts` + `materialize`（只含纯实现与单测，不碰集成测试文件） | 7688–8075 | Task 2、4、7 |
| 10 | Task 8 快照存储与同步核心 | 4254–5137 | Task 14、15 |
| 11 | Task 9 处理钩子与路由接入 | 5138–5647 | Task 8 |
| 12 | Task 10 EDGAR 适配器 + 录制脚本 + 美股夹具 | 5680–6207 | Task 8 |
| 13 | Task 11 美股离线回放（critical）+ 黄金文件 | 6208–6465 | Task 10、15 |
| 14 | Task 12 `tushareCallRaw` + Tushare 适配器 + 夹具 | 6466–6978 | Task 8 |
| 15 | Task 13 巨潮挂接 + A 股离线回放（条件创建） | 6979–7386 | Task 12 |
| 16 | Task 16 三个公共读路由 + `/api/financials` 弃用头 | 8076–8582 | Task 15、8 |
| 17 | Task 17 cron 路由、生产依赖装配、脚本、`vercel.json` | 8583–9070 | Task 16 |
| 18 | Task 18 runbook 章节、规格 §16、全量门禁、真实 SEC dry-run | 9071–9338 | 全部 |

行号在你改计划前有效；改了就重新 `grep -n '^### Task'`。

## 4. 每个任务的工作流（owner 规则，不可省略）

1. **实施**：开一个 fresh 子代理，`model: sonnet`。提示词给：工作树路径与"不要 cd 出去、不要 `git stash`、只动本任务 Files 列表里的文件"；让它先读计划第 1–276 行，再读本任务的行号范围，然后**按步骤 TDD 执行**（先写失败测试、跑、实现、跑、`npm run typecheck && npm run lint`、按计划里的提交步骤提交）。要求它报告 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED 之一，列出提交 sha 与跑过的命令及结果。它不读规格，不读其他任务。
2. **规格复审**（Opus，fresh 子代理，只读）：对照计划该任务的要求与规格对应章节，检查缺项与越界；有问题回给同一个实施代理修。
3. **质量复审**（Opus，fresh 子代理，只读）：可读性、测试质量、与落地代码的模式一致；有问题回给实施代理修。
4. **Codex 审计**（在工作树根目录运行，读取 sha）：
   ```bash
   codex review --commit <sha> -c 'sandbox_mode="read-only"' -c 'model="gpt-6-astra"' -c 'model_reasoning_effort="medium"'
   ```
   再做对抗挑战（把提示词写进文件）：
   ```bash
   codex exec -s read-only -c 'model="gpt-6-astra"' -c 'model_reasoning_effort="medium"' --skip-git-repo-check -o <输出文件> - < <提示词文件>
   ```
   提示词要点：指明任务、提交 sha、规格章节；要求找"会导致错误公共数据、丢证据、违反总纲、与落地代码不兼容"的缺陷，输出 P1/P2/P3 表与修法。P1/P2 回给实施代理修，修完再 `codex review`。Codex 一次要 5–10 分钟，放后台跑。Codex 自己跑 vitest 会报 `__dirname is not defined`（它的 `--configLoader runner` 问题），与代码无关，忽略。
   注意 `codex review` 用 `-c model=`，不是 `-m`。
5. **记录**：每个任务一行写进 `docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md`（任务、sha、Codex 结论、修复轮次）。计划 Task 12/13 也会往这个文件写核对记录。
6. **不停**：任务之间不向 owner 汇报、不问"要不要继续"；只有 BLOCKED 无法自行解决、或计划本身错了（需要改规格）才停下来问。

## 5. 环境与命令（已验证的事实）

- 单测：`npm test -- src/lib/facts/xxx.test.ts`；类型与 lint：`npm run typecheck && npm run lint`（lint 是 `--max-warnings=0`）。
- 数据库测试：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`（本机 PostgreSQL 17 在 Homebrew）。**`LC_ALL=C` 只给 `test:db`/`test:migrations` 用，导出给 `npm test` 会让三个 CLI 单测误判。** 全量 `test:db` 跑约 10 分钟以上；机器负载高时 5–6 个 main 上已有的研究套件会 5 秒超时级联失败（`s6/store`、`s6/arm-lineage`、`fanout/run`、`s4/ledger`、`s4/checkpoint-registry`、`s4/anchor-two-phase`），它们单独跑都过；Linux CI 是正式门禁。
- 只跑一个文件对空库：工作树里 `.claude/scratch/db-one.ts`（未提交；内容如下，丢了就重建）：
  ```ts
  import { spawn } from 'node:child_process';
  import { startLocalDatabase, stopLocalDatabase } from '../../scripts/s4/local-db';
  async function main(){
    const files=process.argv.slice(2);
    const db=await startLocalDatabase();
    let err:unknown;
    try{
      await new Promise<void>((res,rej)=>{
        const c=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run',...files],{stdio:'inherit',env:{...process.env,S4_TEST_STATE:db.stateFile}});
        c.once('exit',code=>code===0?res():rej(new Error('vitest exit '+code)));
      });
    }catch(e){err=e;}finally{stopLocalDatabase(db,err);}
    if(err)process.exitCode=1;
  }
  main();
  ```
  用法：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/facts/facts.integration.test.ts`。
- 每个含 `S4_TEST_STATE` 的测试文件必须加进 `scripts/ci/research-checks.ts::criticalSuites`，否则 `test:db` 报 "Database suite inventory drift"。
- 迁移锁：`supabase/migrations.lock.json` 追加 `{file, sha256}`（文件字节 hex）；已锁文件不可再改；`npm run test:migrations` 做新库 vs 升级库对比。
- 提交：`git commit` 必须单独一条命令，同一命令里不能出现任何 `-n` 记号（`grep -n` 也不行，仓库钩子会拦）；信息末尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`（实施代理换成它自己的模型名也可以，owner 没有要求固定）。不要 `--no-verify`。
- git stash 栈与其他工作树共享：不要用裸 `git stash`。
- Supabase：本地 harness 只建了 `storage.buckets` 五列（迁移不能引用 `storage.objects`）；本地 PostgREST `max_rows=1000`（返回表的函数会被截断，所以 `read_facts` 返回 jsonb 信封）；托管实例 `stock-monitor`（ref `mzfcaabhuwtfvsvadvsv`）是 PostgreSQL 17，`postgres` 角色非超级用户。
- EDGAR 抓取无需 token（SEC 只要求 User-Agent，缺省用 `src/lib/research/ingest/collectors/shared.ts` 的 `DEFAULT_USER_AGENT`）；Task 18 的真实 SEC dry-run 可以直接跑。
- Tushare 文档已核对的事实（2026-11-04）：`report_type` 1 = 最新合并报表，4 = 本年度公布的上年同期数，5 = 变更前保留的原数；`balancesheet.total_share` 单位为股；三表接口需 ≥ 2000 积分、只能按单只股票取；`update_flag` "1 最新"。未核对：type 1 被更正后公告日是否变化、同日并存、`limit/offset/has_more` 行为（计划 Task 12 Step 10 要在有 token 时核对并记录）。

## 6. 必须守住的设计不变量（审计八轮换来的）

- 事实表是披露日志：每份文件每个值一行，不按值去重；版本（`disclosure_seq`、`is_revision`）只在读取时按 `available_date` 算。
- 可得性只到日期精度；`asOf` 是日期。
- 每次同步是一个 `fact_sync_runs` 行；所有事实层写入经 `security definer` 函数，函数开头对 `fact_sync_scope` 行 `for update` 并校验租约；`publish_sync_run` 一个事务内发布 + 从 open 的 `same_day_conflict` 项推导处置 + 激活 `filings.mapping_gen` + `state_rev+1`；废弃先标后删；已发布运行的 `quarantined` 行是证据，不删。
- 没有任何角色能直接写事实层表（例外：`filings` 三列对 service_role 的列级 update、`reconcile_fact_sync_scope`）。
- `read_facts` 单语句单快照，返回 `{state_rev, rows, truncated, row_count}` 信封；规划与派生在 `truncated` 时拒绝继续。
- 同日冲突与到达顺序无关；裁决经 `resolve_facts_quarantine` 原子完成（含 `run_pending` 检查所有成员行的运行）。
- 数值从原文按十进制字符串无损解析（`scanJsonNumbers` + 模式解码 + `canonicalDecimal`），入库 `numeric`，接口返回 `value_text`。
- 单位是事实键的一部分；派生只在单位一致时算；YTD 差分只在"同一 filing 或两边都从未修订"时产出；缺失保持缺失。
- 概念目录 34 个，口径不同的度量是不同概念（`capex` vs `capex_incl_intangibles`、`dividends_paid` vs `dividends_and_interest_paid`、`cash` vs `cash_and_restricted_cash`、`interest_expense` vs `interest_expense_bank`、`net_change_in_cash` 两种）。
- A 股范围 = `research_entity_keys.in_scope` 队列；自选股不进；CN 事实公共可见并带 `citation`（`linked`/`pending`）。

## 7. 全部完成后

1. 全量门禁：`npm test`、`npm run typecheck`、`npm run lint`、`LC_ALL=C PATH=… npm run test:db`、`LC_ALL=C PATH=… npm run test:migrations`；本机 `test:db` 的负载级联失败按 §5 的隔离法复核后写进 PR。
2. Task 18 的真实 SEC dry-run（AAPL/MSFT/NVDA）结果贴进 PR。
3. 推送：`git push -u origin claude/data-foundation-2`；`gh pr create` 到 `main`，描述包含：摘要、复审轨迹（每任务 Codex 结论）、测试计划（勾选项）、已知后续（计划三、CN 降级状态、owner 事项），结尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。规格与计划文档在同一 PR 里。
4. 部署前 owner 事项（规格 §14）：Vercel 环境变量 `EDGAR_USER_AGENT`、确认 `TUSHARE_TOKEN`、`CRON_SECRET`；合并后按 runbook 新章节执行迁移（含建桶与函数）、`scripts/facts/sync.ts --market US --limit 20 --apply` 首轮、黄金集抄录（6 家 × 2 期 × 6 科目，人从一手文件抄）。
5. 生产迁移方法见记忆 `alpha-production-deploy-and-hosted-db.md`（Supabase Management API，token 在 macOS keychain）。

## 8. 这之后的路线（已有规格，待写计划）

索引：`docs/superpowers/specs/2026-11-04-SPEC-INDEX.md`。顺序：计划三（标识符补全 + 对账 + 日历新鲜度，依赖本计划落地）→ F3 文档管道 → F4 判断层 → F6 评测 → 行业研究 → 公司研究 → 外资研报；宏观工作台在 F4 后对齐。除计划二与外资研报外，其余规格停在 Codex 第四轮"not ready"但已按 Codex 原方案逐字落实、未复审：写各自计划前先做一轮增量 Codex 审计（提示词限定"新引入缺陷 + 终审结论"）。四个页面规格的 Claude Design 画布已完成并链接在规格末尾（提交 `aec296b`）。

写计划的方法（本计划就是这样写出来的，可复用）：先写骨架（仓库约定、文件结构、共享契约），四个子代理并行写任务组，一个整合代理对齐跨组接口并做 writing-plans 自检，然后 Codex 审计计划本身、修到"ready"。

## 9. 记忆文件（`~/.claude/projects/-Volumes-AIMATE-WORK-Developer-CodeX-OsbornAlpha/memory/`）

`alpha-data-foundation-status.md`（项目状态）、`alpha-local-db-harness-env.md`（harness 事实）、`alpha-production-deploy-and-hosted-db.md`（生产部署）、`alpha-research-rebuild-brief.md`（总纲）、`codex-audit-every-task.md`、`model-split-fable-design-opus-code.md`（owner 旧规则：Fable 设计/Opus 写码；本次执行按 owner 2026-11-04 新指示改为 Opus 指挥/Sonnet 写码）、`claude-design-for-all-ui.md`、`block-no-verify-hook-false-positive.md`。

## 10. 风险与未决

- Task 1 的迁移是整个计划最重的一步（五表、十余个 plpgsql 函数、触发器、权限）；Codex 四轮静态审计过，但没有在真实 PostgreSQL 上跑过——第一次 `test:db` 很可能暴露 plpgsql 细节错误，按测试修，不要改设计。
- Task 11 的黄金断言在 owner 抄录前按计划设计会让 `sync-us.integration.test.ts` 处于红灯（`ready:false` 时不计入；`ready:true` 后缺条目即失败）——执行到 Task 11 时按计划 Step 1/2 的说明处理，并在 PR 里标明。
- A 股路径在无 token 时整体是"合成夹具 + 未核对"，CN cron 不开；PR 里明示。
- 计划第 2853 行附近记录了 Part B 对 Task 14/15 导出名的依赖（`reconcileScope`、`scopeRowFor`、`materialize`、`FORMULA_VERSION`）；按执行顺序先做 Task 14/15 即可。
