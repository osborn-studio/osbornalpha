# F6 评测与黄金集 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规格 `docs/superpowers/specs/2026-11-04-evals-and-gold-sets-design.md`（第 6 稿，§0 为权威修订，§15.1 为本期可构建子集）：一个黄金集契约（含对规格二 `plan2.json` 的只读采用）、一个运行器与六种评测的归约、F6 自有存储 `dq_eval_runs` + `dq_eval_case_results`、US facts 官方对账与 frozen 回放的真实库证明、证据校验器（gold/lock/diff/redact/expert/audit/manifest）、管理只读 API；依赖兄弟模块的 kind 只交付纯逻辑与注入接口。

**Architecture:** `src/lib/evals/types.ts` 是全部任务共享的契约（本文 §共享契约 原样落地）。评测分三层：**读适配器**（`adapters/facts.ts`，只读 `FactsDb` 子集 + `deriveMetrics`，特权版另含来源链解析与提示）→ **kind**（`kinds/*.ts`，纯函数：案例 + 读结果 → `CaseReport[]`）→ **归约**（`summary.ts`：`CaseReport[]` → §3.2 `Summary` 与 `gate`）。`runGoldSet()` 只在内存里评测并产出 `EvalReport`；落盘（`report.ts`）与入库（`store.ts`）由 CLI `scripts/evals/run.ts` 按 §6.3 的顺序执行。真实库证明在两个 critical 集成测试里：存储（不依赖规格二）与 facts（F6 自有确定性建库 `replay/setup.ts`）。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase（PostgreSQL 17 + PostgREST + Storage）、vitest、`pg`（集成测试）、`tsx` 脚本、node `child_process`（git）。复用：计划一 `TableClient`/`memoryTableClient`/`pgTableClient`、`resolveIssuer`；计划二 `FactsDb`（`pgFactsDb`、`memoryFactsDb`、`supabaseFactsDb`）、`runFactsSync`、`deriveMetrics`、`FORMULA_VERSION`、`DERIVE_CONCEPTS`、`CONCEPT_IDS`、`MAPPING_GEN`、`rawHashOf`、`parseCompanyFacts`、`snapshotPath`、`canonicalDecimal`、`resolveCodeVersion`。

执行（owner 规则）：Opus 5.5 指挥；每个任务一个 Sonnet 5.5 实施子代理（TDD）→ Opus 规格复审 → Opus 质量复审 → Codex CLI（gpt-6-astra，medium）`codex review --commit` + 对抗挑战 → 修 P1/P2；记录在 `docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md`。

---

## 仓库约定（动手前必读）

- **工作树**：`/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/evals-gold-sets-75bfc9`，分支 `claude/evals-gold-sets-75bfc9`。不要 `cd` 出去；不要用裸 `git stash`（栈与其他工作树共享）。
- **所有权边界**（并行兄弟：计划三、F3、F4、行业研究）：只新建/修改 `src/lib/evals/**`、`scripts/evals/**`、`docs/evals/**`、`docs/audits/2026-11-06-evals-gold-sets/**`、新迁移 `supabase/migrations/20261110090000_dq_eval_runs.sql`、新路由 `src/app/api/admin/evals/**`。共享文件只做**标记块**修改，块首尾各一行 `// F6 begin` / `// F6 end`（YAML 用 `# F6 begin/end`，JSON 无注释则只追加条目）：`supabase/migrations.lock.json`（追加一条）、`scripts/ci/research-checks.ts`（`criticalSuites` 追加两项）、`src/lib/supabase/database.types.ts`（两张表）、`.github/workflows/ci.yml`（`fetch-depth: 0`、一个 validate 步骤、上传 `reports/evals/**`）、`src/i18n/messages/*.json` 本期**不改**（UI 延后）。`src/lib/facts/**`、`src/lib/dq/**`、`src/app/(app)/admin/dq/**` 一律只读。
- **迁移**：时间戳 `20261110HHMMSS`，本计划只用 `20261110090000_dq_eval_runs.sql`。可重放（`create table if not exists`、`drop constraint if exists` 后 `add constraint`）。**不触碰 `dq_reconciliations`**（规格 §0 R5-3）。锁：`supabase/migrations.lock.json` 追加 `{file, sha256}`（文件字节 hex，`shasum -a 256`）；已锁文件不可改。落地顺序（§0 R5-4）：计划三先合并；若 F6 先于计划三合并，PR 描述里提示计划三把未入锁迁移改时间戳。
- **数据库测试**：`describe.skipIf(!process.env.S4_TEST_STATE)`，`JSON.parse(readFileSync(process.env.S4_TEST_STATE,'utf8')).adminUrl`。任何含字符串 `S4_TEST_STATE` 的 `.test.ts` 必须进 `scripts/ci/research-checks.ts::criticalSuites`（否则 `test:db` 报 inventory drift），且 critical 套件里**不能有 skip 的用例**。重放迁移用 `replayMigration`（从 `src/lib/dq/dq-foundation.integration.test.ts:17` 复制，未导出；`lock_timeout='3s'`，55P03/40P01 重试）。
- **单文件真实库运行**：`.claude/scratch/db-one.ts`（未提交；内容见 `docs/superpowers/plans/2026-11-04-HANDOFF-data-foundation-2-execution.md` §5，丢了按那里重建）：`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npx tsx .claude/scratch/db-one.ts src/lib/evals/evals-store.integration.test.ts`。`LC_ALL=C` 只给 `test:db`/`test:migrations`/db-one，**不要**导出给 `npm test`。
- **共享库污染**：`test:db` 的所有套件共享一个库。`filings.source_ref` 全局唯一，`sync-us.integration.test.ts` 也会同步 AAPL/MSFT 夹具。F6 的 facts 集成测试**只用 F6 自己的合成 CIK**（`999xxxx` 段，见 Task 9 种子）与从 AAPL 夹具派生、改写了 CIK 与 accession 的副本，绝不复用 AAPL/MSFT 的 CIK 与 accession。
- **数值**：一律十进制字符串，不转 `Number`。解析/规范化复用 `src/lib/facts/json-numbers.ts::canonicalDecimal`；比较用本计划 `compare.ts::compareWithinTolerance`（BigInt）。
- **代码版本**：`resolveCodeVersion({allowGit:true})`（`src/lib/facts/deps.ts:24`，返回 `sha` 或 `sha-dirty` 或 `null`）；本计划 `version.ts` 把它拆成 `{sha, dirty}`，`sha` 必须是 40 位 hex。
- **管理员与客户端**：`requireAdminUser()`（`src/lib/admin/auth.ts`）、`getAdminSupabase()`（`src/lib/supabase/admin.ts`）、`getAnonSupabase()`（`src/lib/supabase/anon.ts`）、`supabaseTableClient`（`src/lib/db/table-client.ts`）、`memoryTableClient`（`src/lib/db/memory-table-client.ts`）、`pgTableClient`（`src/lib/db/pg-table-client.ts`）。
- **代码风格**：沿用 `src/lib/facts` 的紧凑风格（单空格缩进、少空行、文件头注释写职责与规格条目）。每个导出函数有测试。错误用 `EvalError`（§共享契约）。
- **提交**：`git commit` 单独一条命令（仓库钩子拦截同一命令里出现的任何 `-n` 记号，包括 `grep -n`、`head -n`）；不 `--no-verify`；信息末尾 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（实施代理）或 `Claude Opus 5.5`（指挥）。
- **命令**：`npm test -- src/lib/evals/<file>.test.ts`、`npm run typecheck`、`npm run lint`（`--max-warnings=0`）、`LC_ALL=C PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH npm run test:db`、同 `npm run test:migrations`。Codex 自己跑 vitest 报 `__dirname is not defined` 与代码无关，忽略。
- **owner 默认值**（规格 §16，本期按默认执行，PR 里列为假设）：D1 阈值 facts 官方 `rel 0`、派生/宏观 `rel 0.01`、双源 `rel 0.005`、对照 `rel 0.01`、`min_coverage_optional 0.95`；D2 `gold_approval='process'`（无 CODEOWNERS），清单需 `waivers`；D3 上线前一次特权 report、之后每季度；D4 public 集全量 JSON + `.md` 入 `docs/evals/`；D5 只用 36 格；D6 账本批准人 owner 且 ≠ `added_by`；D7 清单失败为上线检查项、不硬阻断；D8 `extraction_gold` 不启用、`eval-restricted` 桶不建。

## 文件结构

```
supabase/migrations/20261110090000_dq_eval_runs.sql   dq_eval_runs + dq_eval_case_results + RLS/权限（Task 5）
supabase/migrations.lock.json                         追加 1 条（Task 5）
src/lib/supabase/database.types.ts                    // F6 块：DqEvalRun / DqEvalCaseResult（Task 5）
scripts/ci/research-checks.ts                         criticalSuites += evals/evals-store、evals/evals-facts（Task 5、9）
.github/workflows/ci.yml                              # F6 块：fetch-depth 0、validate 步骤、上传 reports/evals/**（Task 3）

src/lib/evals/types.ts             共享契约（本文 §共享契约 原样；Task 1）
src/lib/evals/errors.ts            EvalError（Task 1，内容在 §共享契约）
src/lib/evals/canonical-json.ts    canonicalJson / sha256Hex / projectionHash（Task 1）
src/lib/evals/compare.ts           compareWithinTolerance / parseDecimalParts（Task 1）
src/lib/evals/summary.ts           summarize / gateOf / exitCodeOf / statusOfGate（Task 1）
src/lib/evals/gold/schema.ts       parseGoldSetF6（§4 每条规则）/ canonicalFromPrinted / unitOfSpec（Task 2）
src/lib/evals/gold/legacy-plan2.ts parseLegacyPlan2（plan2.json → GoldSet，format 'legacy_plan2'；Task 2）
src/lib/evals/gold/load.ts         loadGoldSet(path) 按内容识别格式；loadRecorders；checkLock（Task 2）
src/lib/evals/gold/diff.ts         goldDiff(baseTree, headTree) 纯 + gitTreeAt(ref) / changedGoldFiles（Task 3）
src/lib/evals/redact.ts            redactScan(files) → findings（Task 3）
src/lib/evals/version.ts           evaluatorVersion() → {sha, dirty}（Task 4）
src/lib/evals/report.ts            buildReport / renderMarkdown（确定性）/ reportPaths / writeReportFiles（Task 4）
src/lib/evals/store.ts             evalStore(tables) 与 persistRun（§6.3 顺序、23505 比对、resume）（Task 6）
src/lib/evals/adapters/facts.ts    factsReader(deps) / privilegedFactsReader(deps)（Task 7）
src/lib/evals/adapters/provenance.ts resolveFactProvenance（§0 R5-5/R5-6；Task 7）
src/lib/evals/kinds/official.ts    evaluateOfficial(cases, reader, ctx) → CaseReport[]（Task 8）
src/lib/evals/run-gold-set.ts      runGoldSet(options) → RunOutcome（Task 8）
src/lib/evals/cli/deps.ts          buildRunDeps(mode, privileged)（ci：S4_TEST_STATE/内存；report：anon；--write-db：service_role；Task 9）
src/lib/evals/replay/setup.ts      buildFrozenDb(pool, setup) 确定性建库（Task 9）
src/lib/evals/projections/facts.ts projectFacts(reader, request) / diffProjections（Task 10）
src/lib/evals/kinds/replay.ts      evaluateReplay(cases, project, ledger, ctx)（frozen / live）（Task 10）
src/lib/evals/replay/ledger.ts     parseLedger / matchLedger（Task 10）
src/lib/evals/validate/expert.ts   validateExpertRecord（Task 12）
src/lib/evals/validate/audit.ts    validateAuditDir（Task 12）
src/lib/evals/validate/manifest.ts validateManifest(manifest, deps)（Task 12）
src/lib/evals/admin.ts             listEvalRuns / getEvalRun（白名单投影；Task 13）
src/lib/evals/kinds/dual-source.ts evaluateDualSource + PairSource 接口（Task 14）
src/lib/evals/kinds/reference.ts   evaluateReference + parseReferenceResult + writeReferenceSummary（Task 14）
src/lib/evals/kinds/extraction.ts  matchExtraction / evaluateExtraction（Task 15）
src/lib/evals/kinds/calibration.ts evaluateCalibration（Task 15）
src/lib/evals/fixtures/gold/lock.json            （Task 2 建，Task 9/11 追加）
src/lib/evals/fixtures/gold/recorders.json       （Task 2）
src/lib/evals/fixtures/gold/facts/synthetic-us.json  （Task 9）
src/lib/evals/fixtures/issuers/f6-seed.json       （Task 9）
src/lib/evals/fixtures/edgar/CIK0009990601.json   F6 合成 companyfacts（由 AAPL trimmed 夹具改写 CIK/accession 生成并提交；Task 9）
src/lib/evals/fixtures/replay/facts.frozen.json   ≥ 10 案例（Task 11）
src/lib/evals/fixtures/replay/explanations.json   账本（Task 11，初始 []）
src/lib/evals/*.test.ts, src/lib/evals/**/*.test.ts  单测
src/lib/evals/evals-store.integration.test.ts     critical（Task 5、6）
src/lib/evals/evals-facts.integration.test.ts     critical（Task 9、11）
src/lib/evals/route-equivalence.test.ts           投影(库) == 投影(路由响应)，内存 FactsDb（Task 11）
src/app/api/admin/evals/route.ts                  GET 列表（Task 13）
src/app/api/admin/evals/[run_id]/route.ts         GET 详情（Task 13）
scripts/evals/run.ts            CLI（Task 9）
scripts/evals/validate.ts       CLI：--gold --lock --gold-diff <base> --redact --expert <f> --audit <dir> --manifest <f>（Task 3 起，Task 12 补全）
scripts/evals/hash-source.ts    （Task 3）
scripts/evals/record-replay.ts  （Task 11）
scripts/evals/codex-audit.ts    （Task 12）
docs/evals/README.md            运行手册（Task 16）
docs/evals/templates/expert-sampling.template.json、release-manifest.template.json（Task 12）
docs/audits/2026-11-06-evals-gold-sets/01-implementation-log.md（Task 1 建，每任务追加）
docs/audits/2026-11-04-data-foundation-2/index.json   新文件（规格 §9；Task 12）
```

---

## 共享契约（所有任务必须用这些名字；`src/lib/evals/types.ts` 与 `errors.ts` 原样落地）

```ts
// src/lib/evals/types.ts
// Shared contract of the F6 evaluation framework (spec 2026-11-04-evals-and-gold-sets-design.md, draft 6).
// Every task uses these names verbatim. Layers: reader (adapters/*) → kind (kinds/*, pure) → summarize (summary.ts).
import type {Duration,Market} from '../facts/types';

export type EvalKind='official_reconciliation'|'dual_source'|'replay_consistency'|'reference_regression'|'extraction_gold'|'judgment_calibration';
export type EvalModule='facts'|'metrics'|'macro'|'industry'|'company'|'foreign_research';
export type EvalMode='ci'|'report';
export type ArtifactClass='public'|'restricted';
export type EvidenceClass='truth'|'comparison'|'adapter_check';
export type Gate='pass'|'fail'|'incomplete';
export type EvalRunStatus='running'|'passed'|'failed'|'incomplete'|'error';
export type ProvenanceKind='transcribed'|'synthetic';
export type GoldFormat='f6'|'legacy_plan2';
export type ExitCode=0|1|2|3;
export type Scale='1'|'1000'|'1000000'|'1000000000';

/** §4.3. Maps to facts unit strings via gold/schema.ts::unitOfSpec: currency→'USD', shares→'shares', per_share→'USD/share', ratio→'pure'. */
export type UnitSpec={kind:'currency';currency:string}|{kind:'shares'}|{kind:'per_share';currency:string}|{kind:'ratio'}|{kind:'index'}|{kind:'count'}|{kind:'percent_points'};
export interface DocumentId{kind:'edgar_accession'|'cninfo_announcement'|'file_sha256'|'official_release';value:string}
/** period_start: null = instant; ABSENT (undefined) = unconstrained, allowed only in legacy_plan2 sets. */
export interface FactTarget{type:'fact';concept:string;period_start?:string|null;period_end:string;duration:Duration;consolidation:'consolidated';unit:UnitSpec}
export interface MetricTarget{type:'metric';metric:string;period_start:string;period_end:string;duration:string;basis:string;input_unit:string;formula_version:string;unit:UnitSpec}
export type CaseTarget=FactTarget|MetricTarget;
export interface Subject{market:Market;cik?:string;ticker?:string}
export interface CaseSource{document_type:string;document_id?:DocumentId;url:string;sha256?:string;available_date?:string;locator?:Record<string,string|number>}
export interface GoldCase{
 case_id:string;subject:Subject;target:CaseTarget;expect:'present'|'missing';
 printed?:{text:string;unit_label:string;scale:Scale};canonical?:{value:string};
 binding:'document'|'current';
 /** binding='current': the asOf to read at. f6 = source.available_date; legacy = entry.as_of ?? null (null → env.today). */
 as_of:string|null;
 source:CaseSource;provenance_kind:ProvenanceKind;
 recorded_by:string;recorded_at:string|null;reviewed_by:string|null;reviewed_at:string|null;
 retracted:null|{at:string;by:string;reason:string};notes:string;
 required:boolean;
 /** legacy_plan2 only: entry still '<pending>' (no value / no recorder). */
 pending:boolean;
 /** legacy_plan2 only: required F6 provenance fields this entry lacks (e.g. 'source.sha256','source.locator','reviewed_by'). Empty for f6. */
 provenance_gaps:string[];
}
export interface Thresholds{max_fail:number;min_coverage_optional:string}
export interface GoldHistoryEntry{version:number;changed_at:string;changed_by:string;reason:string;fields:string[]}
export interface GoldSet{
 schema_version:1;format:GoldFormat;set_id:string;version:number;module:EvalModule;artifact_class:ArtifactClass;
 module_implementers:string[];tolerance:{rel:string};thresholds:Thresholds;optional_cases:string[];history:GoldHistoryEntry[];
 cases:GoldCase[];
 /** legacy_plan2: the file's `ready`; f6: always true. */
 ready:boolean;
 /** repo-relative path and sha256 of the file BYTES as loaded. */
 path:string;sha256:string;
}
export interface Recorder{id:string;role:string;modules:EvalModule[];added_at:string;approved_by:string}
export interface RecordersFile{version:number;recorders:Recorder[]}
export interface GoldLock{files:{path:string;sha256:string;version:number;format:GoldFormat}[]}

/** One row as read by a module reader (facts row, or a derived metric). value_text is the lossless decimal string. */
export interface ReadRow{
 value_text:string;unit:string;period_start:string|null;period_end:string;duration:string;consolidation:string;available_date:string;
 fact_id?:string;filing_id?:string;source_ref?:string;mapping_gen?:number;mapping_version?:string;raw_hash?:string;run_id?:string;status?:string;
 metric?:{metric:string;formula_version:string;basis:string;input_unit:string;based_on_rev:number;inputs:{fact_id:string;concept:string;filing_id:string;available_date:string}[]};
}
export type ReadErrorReason='subject_unresolved'|'filing_not_found'|'filing_not_linked'|'filing_ambiguous'|'truncated'|'formula_version_mismatch'|'projection_join_missing'|'setup_mismatch'|'read_failed';
export interface ReadResult{rows:ReadRow[];truncated:boolean;stateRev:number|null;error?:ReadErrorReason}
export interface SubjectRef{issuerId:string;market:Market}
export interface ReplayRequest{issuer:Subject;concepts:string[];asOf:string;durations?:string[];metrics?:string[]}
export interface ProjectionRow{[k:string]:string|number|boolean|null|ProjectionRow[]}
export interface Projection{module:EvalModule;rows:ProjectionRow[]}
export interface Hint{kind:'late_fact'|'quarantine_resolved'|'mapping_gen_raised';ref:string;at:string}
export interface ProvenanceCheck{ok:boolean;missing:string[];reason?:string;producer_code_version?:string;object_path?:string;locator?:string;source_verified?:boolean|'skipped'}

export interface ModuleReader{
 module:EvalModule;privileged:false|true;
 resolveSubject(subject:Subject,today:string):Promise<SubjectRef|null>;
 /** Rows of the filing identified by documentId whose period/consolidation match target; NOT filtered by unit. */
 readDocumentBound(ref:SubjectRef,target:CaseTarget,documentId:DocumentId,today:string):Promise<ReadResult>;
 /** Current rows at asOf matching target's key (facts) or the derived metric (metrics); NOT filtered by unit. */
 readCurrent(ref:SubjectRef,target:CaseTarget,asOf:string):Promise<ReadResult>;
 project(request:ReplayRequest,today:string):Promise<Projection>;
 stateRev():Promise<number|null>;
}
export interface PrivilegedReader extends ModuleReader{
 privileged:true;
 readNonVisible(ref:SubjectRef,target:CaseTarget,documentId:DocumentId|null,asOf:string):Promise<'quarantined'|'superseded_generation'|null>;
 resolveProvenance(ref:SubjectRef,row:ReadRow,opts:{artifacts:boolean}):Promise<ProvenanceCheck>;
 hints(request:ReplayRequest,since:string):Promise<Hint[]>;
}

/** §3.3 case results. Reduction lives in summary.ts only. */
export type CaseOutcome=
 |{result:'pass'}|{result:'expected_absent'}
 |{result:'fail';reason:'value'|'ambiguous'|'unexpected_value'}
 |{result:'unit_mismatch'}
 |{result:'provenance_incomplete';reason:string}
 |{result:'missing'}
 |{result:'not_visible';reason:'quarantined'|'superseded_generation'}
 |{result:'skipped';reason:'retracted'|'subset'|'zero_support'|'unavailable'|'ineligible'|'pending'}
 |{result:'read_error';reason:ReadErrorReason}
 |{result:'identical'}
 |{result:'explained_diff';ledger_ids:string[]}
 |{result:'data_drift';ledger_ids:string[];hints:Hint[]}
 |{result:'unexplained_diff';reason:'diff'|'no_hints'|'partial_ledger'|'ledger_self_approved'}
 |{result:'within'}|{result:'beyond_explained';ledger_ids:string[]}|{result:'beyond_unexplained'};
export interface CaseReport{
 case_id:string;required:boolean;outcome:CaseOutcome;
 /** system value (left) and gold/expected value (right), decimal strings; null when absent. */
 left:string|null;right:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;
 provenance:ProvenanceCheck|null;detail:Record<string,unknown>;
}
export interface Summary{
 population:number;required:number;
 correctness:{pass:number;fail:number;unit_mismatch:number;provenance_incomplete:number;unexplained_diff:number};
 coverage:{evaluated:number;missing_required:number;missing_optional:number;not_visible:number;skipped:number};
 execution:{read_error:number;truncated:number;subset:boolean};
 thresholds:Thresholds;
 gold:{format:GoldFormat;ready:boolean;pending:number;provenance_gaps:number};
 gate:Gate;evidence_class:EvidenceClass;
 reconciliations_truncated:boolean;
}
export interface SummaryContext{thresholds:Thresholds;gold:Summary['gold'];subset:boolean;evidenceClass:EvidenceClass;reconciliationsTruncated?:boolean}

export interface EvalEnv{today:string;now():Date;evaluatorCodeVersion:string;dirty:boolean}
export interface ReportEnvironment{db_host:string|null;app_origin:string|null;db_state_rev:number|null}
export interface EvalReport{
 schema_version:1;run_id:string;kind:EvalKind;module:EvalModule;mode:EvalMode;privileged:boolean;artifact_class:ArtifactClass;
 set:{id:string;version:number;sha256:string;format:GoldFormat;path:string};
 evaluator_code_version:string;dirty:boolean;started_at:string;finished_at:string;
 environment:ReportEnvironment;thresholds:Thresholds;
 provenance:{verified:{artifacts:boolean;sources:boolean}};
 summary:Summary;cases:CaseReport[];
}
export interface RunOutcome{report:EvalReport;exitCode:ExitCode}

/** Row shapes of the F6 tables (Task 5 migration). Decimal columns are TEXT. */
export interface EvalRunRow{
 run_id:string;kind:EvalKind;module:EvalModule;mode:EvalMode;privileged:boolean;artifact_class:ArtifactClass;
 set_id:string;set_version:number;set_sha256:string;evaluator_code_version:string;started_at:string;finished_at:string|null;
 status:EvalRunStatus;summary:Summary|Record<string,never>;report_ref:string;report_sha256:string;triggered_by:'manual'|'script'|'ci';
}
export type CaseResultKind='fail'|'unit_mismatch'|'provenance_incomplete'|'missing'|'not_visible'|'read_error'|'unexplained_diff';
export interface EvalCaseResultRow{eval_run_id:string;case_id:string;result:CaseResultKind;reason:string|null;left_text:string|null;right_text:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;detail:Record<string,unknown>}
```

```ts
// src/lib/evals/errors.ts
// Pre-run refusals and fatal store errors (spec §14). Exit code 2 = refused before running; 1 = store/report failure.
export type EvalErrorCode='gold_invalid'|'gold_lock_mismatch'|'gold_diff_violation'|'code_version_missing'|'dirty_tree'|'synthetic_in_report'|'restricted_in_ci'|'kind_not_enabled'|'report_write_failed'|'store_write_failed'|'store_conflict'|'store_partial'|'reference_result_schema'|'reference_write_attempt'|'replay_rerecord_refused'|'resume_mismatch'|'redact_violation'|'manifest_invalid'|'expert_invalid'|'audit_invalid';
export const REFUSAL_CODES:ReadonlySet<EvalErrorCode>=new Set(['gold_invalid','gold_lock_mismatch','gold_diff_violation','code_version_missing','dirty_tree','synthetic_in_report','restricted_in_ci','kind_not_enabled','replay_rerecord_refused','resume_mismatch']);
export class EvalError extends Error{constructor(public readonly code:EvalErrorCode,message?:string,public readonly detail:Record<string,unknown>={}){super(message??code);this.name='EvalError';}}
export const exitCodeOfError=(e:EvalError):1|2=>REFUSAL_CODES.has(e.code)?2:1;
```

关键函数签名（跨任务；实现在各自任务）：

```ts
// compare.ts (Task 1)
export function compareWithinTolerance(left:string,right:string,rel:string):{passed:boolean;absDiff:string;relDiff:string};
// summary.ts (Task 1)
export function summarize(cases:CaseReport[],ctx:SummaryContext):Summary;
export function gateOf(s:Omit<Summary,'gate'>):Gate;
export const exitCodeOf:(g:Gate)=>0|1|3;            // pass 0, fail 1, incomplete 3
export const statusOfGate:(g:Gate)=>'passed'|'failed'|'incomplete';
// canonical-json.ts (Task 1)
export function canonicalJson(v:unknown):string;     // sorted keys, no whitespace, strings JSON-escaped
export const sha256Hex:(s:string|Uint8Array)=>string;
export const projectionHash:(p:Projection)=>string;  // sha256Hex(canonicalJson(p))
// gold/load.ts (Task 2)
export function loadGoldSet(path:string,root?:string):GoldSet;         // throws EvalError('gold_invalid')
export function loadRecorders(root?:string):RecordersFile;
export function checkLock(set:GoldSet,lock:GoldLock):void;             // throws EvalError('gold_lock_mismatch')
// report.ts (Task 4)
export function renderMarkdown(r:EvalReport):string;                   // deterministic
export function reportPaths(r:EvalReport,root?:string):{json:string;md:string|null};
export function writeReportFiles(r:EvalReport,root?:string):{json:string;md:string|null;sha256:string};   // sha256 of the JSON bytes written
// store.ts (Task 6)
export interface EvalStore{insertRun(r:EvalRunRow):Promise<void>;insertCaseResult(r:EvalCaseResultRow):Promise<void>;finishRun(runId:string,status:EvalRunStatus,summary:Summary,finishedAt:string):Promise<void>;getRun(runId:string):Promise<EvalRunRow|null>;getCaseResult(runId:string,caseId:string):Promise<EvalCaseResultRow|null>}
export function evalStore(tables:TableClient):EvalStore;
export function persistRun(store:EvalStore,report:EvalReport,files:{ref:string;sha256:string},opts:{triggeredBy:'manual'|'script'|'ci';resume?:boolean}):Promise<void>;
// run-gold-set.ts (Task 8)
export interface RunGoldSetOptions{set:GoldSet;mode:EvalMode;reader:ModuleReader;env:EvalEnv;environment:ReportEnvironment;runId?:string;caseIds?:string[];limit?:number;verify?:{artifacts:boolean;sources:boolean};fetchSource?:(url:string)=>Promise<Uint8Array>}
export function runGoldSet(o:RunGoldSetOptions):Promise<RunOutcome>;  // in memory only; throws EvalError refusals
```

---

## 任务总览与写作分工

| Task | 内容 | 规格 | 写作者 | 依赖 |
|---|---|---|---|---|
| 1 | `types.ts`、`errors.ts`、`canonical-json.ts`、`compare.ts`、`summary.ts` + 单测；实施记录文件 | §3.2、§3.3、§5.2、§0 R5-1/R5-10 | W1 | — |
| 2 | `gold/schema.ts`、`gold/legacy-plan2.ts`、`gold/load.ts`、`lock.json`、`recorders.json` + 单测 | §4、§0 R5-1/R5-2/R5-8 | W1 | 1 |
| 3 | `gold/diff.ts`（纯 + git）、`redact.ts`、`scripts/evals/validate.ts`（--gold --lock --gold-diff --redact）、`hash-source.ts`、`ci.yml` F6 块 + 单测（含临时 git 仓库） | §4.4、§4.5、§7.3 | W1 | 2 |
| 4 | `version.ts`、`report.ts` + 单测 | §6.4、§7.2、§4.5 | W1 | 1 |
| 5 | 迁移 + 锁 + `database.types.ts` F6 块 + `evals-store.integration.test.ts`（迁移、约束、RLS、文本往返）+ criticalSuites | §6.2、§0 R5-3/R5-4 | W2 | 1 |
| 6 | `store.ts`（§6.3 顺序、23505 比对、终态命中 0、resume）+ 单测 + 集成测试追加（中断 resume、并发 resume） | §6.3 | W2 | 5 |
| 7 | `adapters/facts.ts`（读路径、文件映射、metrics 派生）、`adapters/provenance.ts`（R5-5/R5-6）、特权读（readNonVisible、hints）+ 单测（memoryFactsDb + memorySnapshotStore） | §4.2、§5.1、§5.6、§0 R5-5–R5-8 | W3 | 1、2 |
| 8 | `kinds/official.ts`、`run-gold-set.ts` + 单测（§3.3 每种结果、变异、子集、合成拒绝） | §5.1、§3、§7.1 | W3 | 1、2、4、7 |
| 9 | `cli/deps.ts`、`scripts/evals/run.ts`、`replay/setup.ts`、F6 种子与合成夹具与合成集、`evals-facts.integration.test.ts`（四条路径、重述、隔离 not_visible、旧格式 incomplete） | §1.1、§7.1、§13.3、§0 R5-1/R5-2 | W3 | 6、8 |
| 10 | `projections/facts.ts`、`replay/ledger.ts`、`kinds/replay.ts` + 单测（frozen/live 各态、账本六元组、partial、自批、setup_mismatch） | §5.3、§0 R5-7 | W4 | 1、7 |
| 11 | `scripts/evals/record-replay.ts`（只增、`--supersede`）、`facts.frozen.json`（≥ 10）、`explanations.json`、frozen 回放进集成测试、`route-equivalence.test.ts` | §5.3.1、§5.3.3 | W4 | 9、10 |
| 12 | `validate/expert.ts`、`validate/audit.ts`、`validate/manifest.ts`、`validate.ts` 补全、`codex-audit.ts`、模板、`data-foundation-2/index.json` + 单测 | §8、§9、§10 | W2 | 3、4、6 |
| 13 | `admin.ts` + 两个路由 + 单测（白名单键集合、哨兵缺席、非管理员 403） | §12、§0 R5-11 | W4 | 6 |
| 14 | `kinds/dual-source.ts`（`PairSource`）、`kinds/reference.ts`（`ReferenceResult`、哨兵、`ReadDeps` 无写方法）+ 单测；`run.ts` 对这两个 kind 在无适配器时拒绝 | §5.4、§5.5、§0 R5-10/R5-12 | W4 | 1、8 |
| 15 | `kinds/extraction.ts`（两步最大匹配）、`kinds/calibration.ts` + 单测（对抗夹具）；`run.ts` 拒绝 `extraction_gold`（`kind_not_enabled`） | §11.1、§11.3、§16 D8 | W4 | 1 |
| 16 | `docs/evals/README.md` 运行手册、规格 §18 实施记录、全量门禁 | — | 指挥 | 全部 |

推荐执行顺序：1 → 2 → 4 → 3 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16。

<!-- TASKS BELOW: written by part writers W1–W4, integrated by the commander -->
