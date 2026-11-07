OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b154-b28f-7842-a4a5-d305d819f71f
--------
user
commit 593c12e
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 593c12e; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1910ms:
---
name: code-review-and-quality
description: Conducts multi-axis code review. Use before merging any change. Use when reviewing code written by yourself, another agent, or a human. Use when you need to assess code quality across multiple dimensions before it enters the main branch.
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Every change gets reviewed before merge — no exceptions. Review covers five axes: correctness, readability, architecture, security, and performance.

**The approval standard:** Approve a change when it definitely improves overall code health, even if it isn't perfect. Perfect code doesn't exist — the goal is continuous improvement. Don't block a change because it isn't exactly how you would have written it. If it improves the codebase and follows the project's conventions, approve it.

## When to Use

- Before merging any PR or change
- After completing a feature implementation
- When another agent or model produced code you need to evaluate
- When refactoring existing code
- After any bug fix (review both the fix and the regression test)

## The Five-Axis Review

Every review evaluates code across these dimensions:

### 1. Correctness

Does the code do what it claims to do?

- Does it match the spec or task requirements?
- Are edge cases handled (null, empty, boundary values)?
- Are error paths handled (not just the happy path)?
- Does it pass all tests? Are the tests actually testing the right things?
- Are there off-by-one errors, race conditions, or state inconsistencies?

### 2. Readability & Simplicity

Can another engineer (or agent) understand this code without the author explaining it?

- Are names descriptive and consistent with project conventions? (No `temp`, `data`, `result` without context)
- Is the control flow straightforward (avoid nested ternaries, deep callbacks)?
- Is the code organized logically (related code grouped, clear module boundaries)?
- Are there any "clever" tricks that should be simplified?
- **Could this be done in fewer lines?** (1000 lines where 100 suffice is a failure)
- **Are abstractions earning their complexity?** (Don't generalize until the third use case)
- Would comments help clarify non-obvious intent? (But don't comment obvious code.)
- Are there dead code artifacts: no-op variables (`_unused`), backwards-compat shims, or `// removed` comments?

### 3. Architecture

Does the change fit the system's design?

- Does it follow existing patterns or introduce a new one? If new, is it justified?
- Does it maintain clean module boundaries?
- Is there code duplication that should be shared?
- Are dependencies flowing in the right direction (no circular dependencies)?
- Is the abstraction level appropriate (not over-engineered, not too coupled)?

### 4. Security

For detailed security guidance, see `security-and-hardening`. Does the change introduce vulnerabilities?

- Is user input validated and sanitized?
- Are secrets kept out of code, logs, and version control?
- Is authentication/authorization checked where needed?
- Are SQL queries parameterized (no string concatenation)?
- Are outputs encoded to prevent XSS?
- Are dependencies from trusted sources with no known vulnerabilities?
- Is data from external sources (APIs, logs, user content, config files) treated as untrusted?
- Are external data flows validated at system boundaries before use in logic or rendering?

### 5. Performance

For detailed profiling and optimization, see `performance-optimization`. Does the change introduce performance problems?

- Any N+1 query patterns?
- Any unbounded loops or unconstrained data fetching?
- Any synchronous operations that should be async?
- Any unnecessary re-renders in UI components?
- Any missing pagination on list endpoints?
- Any large objects created in hot paths?

## Change Sizing

Small, focused changes are easier to review, faster to merge, and safer to deploy. Target these sizes:

```
~100 lines changed   → Good. Reviewable in one sitting.
~300 lines changed   → Acceptable if it's a single logical change.
~1000 lines changed  → Too large. Split it.
```

**What counts as "one change":** A single self-contained modification that addresses one thing, includes related tests, and keeps the system functional after submission. One part of a feature — not the whole feature.

**Splitting strategies when a change is too large:**

| Strategy | How | When |
|----------|-----|------|
| **Stack** | Submit a small change, start the next one based on it | Sequential dependencies |
| **By file group** | Separate changes for groups needing different reviewers | Cross-cutting concerns |
| **Horizontal** | Create shared code/stubs first, then consumers | Layered architecture |
| **Vertical** | Break into smaller full-stack slices of the feature | Feature work |

**When large changes are acceptable:** Complete file deletions and automated refactoring where the reviewer only needs to verify intent, not every line.

**Separate refactoring from feature work.** A change that refactors existing code and adds new behavior is two changes — submit them separately. Small cleanups (variable renaming) can be included at reviewer discretion.

## Change Descriptions

Every change needs a description that stands alone in version control history.

**First line:** Short, imperative, standalone. "Delete the FizzBuzz RPC" not "Deleting the FizzBuzz RPC." Must be informative enough that someone searching history can understand the change without reading the diff.

**Body:** What is changing and why. Include context, decisions, and reasoning not visible in the code itself. Link to bug numbers, benchmark results, or design docs where relevant. Acknowledge approach shortcomings when they exist.

**Anti-patterns:** "Fix bug," "Fix build," "Add patch," "Moving code from A to B," "Phase 1," "Add convenience functions."

## Review Process

### Step 1: Understand the Context

Before looking at code, understand the intent:

```
- What is this change trying to accomplish?
- What spec or task does it implement?
- What is the expected behavior change?
```

### Step 2: Review the Tests First

Tests reveal intent and coverage:

```
- Do tests exist for the change?
- Do they test behavior (not implementation details)?
- Are edge cases covered?
- Do tests have descriptive names?
- Would the tests catch a regression if the code changed?
```

### Step 3: Review the Implementation

Walk through the code with the five axes in mind:

```
For each file changed:
1. Correctness: Does this code do what the test says it should?
2. Readability: Can I understand this without help?
3. Architecture: Does this fit the system?
4. Security: Any vulnerabilities?
5. Performance: Any bottlenecks?
```

### Step 4: Categorize Findings

Label every comment with its severity so the author knows what's required vs optional:

| Prefix | Meaning | Author Action |
|--------|---------|---------------|
| *(no prefix)* | Required change | Must address before merge |
| **Critical:** | Blocks merge | Security vulnerability, data loss, broken functionality |
| **Nit:** | Minor, optional | Author may ignore — formatting, style preferences |
| **Optional:** / **Consider:** | Suggestion | Worth considering but not required |
| **FYI** | Informational only | No action needed — context for future reference |

This prevents authors from treating all feedback as mandatory and wasting time on optional suggestions.

### Step 5: Verify the Verification

Check the author's verification story:

```
- What tests were run?
- Did the build pass?
- Was the change tested manually?
- Are there screenshots for UI changes?
- Is there a before/after comparison?
```

## Multi-Model Review Pattern

Use different models for different review perspectives:

```
Model A writes the code
    │
    ▼
Model B reviews for correctness and architecture
    │
    ▼
Model A addresses the feedback
    │
    ▼
Human makes the final call
```

This catches issues that a single model might miss — different models have different blind spots.

**Example prompt for a review agent:**
```
Review this code change for correctness, security, and adherence to
our project conventions. The spec says [X]. The change should [Y].
Flag any issues as Critical, Important, or Suggestion.
```

## Dead Code Hygiene

After any refactoring or implementation change, check for orphaned code:

1. Identify code that is now unreachable or unused
2. List it explicitly
3. **Ask before deleting:** "Should I remove these now-unused elements: [list]?"

Don't leave dead code lying around — it confuses future readers and agents. But don't silently delete things you're not sure about. When in doubt, ask.

```
DEAD CODE IDENTIFIED:
- formatLegacyDate() in src/utils/date.ts — replaced by formatDate()
- OldTaskCard component in src/components/ — replaced by TaskCard
- LEGACY_API_URL constant in src/config.ts — no remaining references
→ Safe to remove these?
```

## Review Speed

Slow reviews block entire teams. The cost of context-switching to review is less than the waiting cost imposed on others.

- **Respond within one business day** — this is the maximum, not the target
- **Ideal cadence:** Respond shortly after a review request arrives, unless deep in focused coding. A typical change should complete multiple review rounds in a single day
- **Prioritize fast individual responses** over quick final approval. Quick feedback reduces frustration even if multiple rounds are needed
- **Large changes:** Ask the author to split them rather than reviewing one massive changeset

## Handling Disagreements

When resolving review disputes, apply this hierarchy:

1. **Technical facts and data** override opinions and preferences
2. **Style guides** are the absolute authority on style matters
3. **Software design** must be evaluated on engineering principles, not personal preference
4. **Codebase consistency** is acceptable if it doesn't degrade overall health

**Don't accept "I'll clean it up later."** Experience shows deferred cleanup rarely happens. Require cleanup before submission unless it's a genuine emergency. If surrounding issues can't be addressed in this change, require filing a bug with self-assignment.

## Honesty in Review

When reviewing code — whether written by you, another agent, or a human:

- **Don't rubber-stamp.** "LGTM" without evidence of review helps no one.
- **Don't soften real issues.** "This might be a minor concern" when it's a bug that will hit production is dishonest.
- **Quantify problems when possible.** "This N+1 query will add ~50ms per item in the list" is better than "this could be slow."
- **Push back on approaches with clear problems.** Sycophancy is a failure mode in reviews. If the implementation has issues, say so directly and propose alternatives.
- **Accept override gracefully.** If the author has full context and disagrees, defer to their judgment. Comment on code, not people — reframe personal critiques to focus on the code itself.

## Dependency Discipline

Part of code review is dependency review:

**Before adding any dependency:**
1. Does the existing stack solve this? (Often it does.)
2. How large is the dependency? (Check bundle impact.)
3. Is it actively maintained? (Check last commit, open issues.)
4. Does it have known vulnerabilities? (`npm audit`)
5. What's the license? (Must be compatible with the project.)

**Rule:** Prefer standard library and existing utilities over new dependencies. Every dependency is a liability.

## The Review Checklist

```markdown
## Review: [PR/Change title]

### Context
- [ ] I understand what this change does and why

### Correctness
- [ ] Change matches spec/task requirements
- [ ] Edge cases handled
- [ ] Error paths handled
- [ ] Tests cover the change adequately

### Readability
- [ ] Names are clear and consistent
- [ ] Logic is straightforward
- [ ] No unnecessary complexity

### Architecture
- [ ] Follows existing patterns
- [ ] No unnecessary coupling or dependencies
- [ ] Appropriate abstraction level

### Security
- [ ] No secrets in code
- [ ] Input validated at boundaries
- [ ] No injection vulnerabilities
- [ ] Auth checks in place
- [ ] External data sources treated as untrusted

### Performance
- [ ] No N+1 patterns
- [ ] No unbounded operations
- [ ] Pagination on list endpoints

### Verification
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Manual verification done (if applicable)

### Verdict
- [ ] **Approve** — Ready to merge
- [ ] **Request changes** — Issues must be addressed
```
## See Also

- For detailed security review guidance, see `references/security-checklist.md`
- For performance review checks, see `references/performance-checklist.md`

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It works, that's good enough" | Working code that's unreadable, insecure, or architecturally wrong creates debt that compounds. |
| "I wrote it, so I know it's correct" | Authors are blind to their own assumptions. Every change benefits from another set of eyes. |
| "We'll clean it up later" | Later never comes. The review is the quality gate — use it. Require cleanup before merge, not after. |
| "AI-generated code is probably fine" | AI code needs more scrutiny, not less. It's confident and plausible, even when wrong. |
| "The tests pass, so it's good" | Tests are necessary but not sufficient. They don't catch architecture problems, security issues, or readability concerns. |

## Red Flags

- PRs merged without any review
- Review that only checks if tests pass (ignoring other axes)
- "LGTM" without evidence of actual review
- Security-sensitive changes without security-focused review
- Large PRs that are "too big to review properly" (split them)
- No regression tests with bug fix PRs
- Review comments without severity labels — makes it unclear what's required vs optional
- Accepting "I'll fix it later" — it never happens

## Verification

After review is complete:

- [ ] All Critical issues are resolved
- [ ] All Important issues are resolved or explicitly deferred with justification
- [ ] Tests pass
- [ ] Build succeeds
- [ ] The verification story is documented (what changed, how it was verified)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ExTKGVjX' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-waDQUbbE' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/16b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4F0T8X6T' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xXI8me9s' (errno=Operation not permitted)
593c12eb feat(dq): A-share gold sample template and PDF upload scripts, transcription guide; record E5 as not achieved (CN degraded)
 .../2026-11-05-data-foundation-3/verification.md   | 10 ++++
 docs/runbooks/cn-gold-transcription.md             | 47 ++++++++++++++++++
 scripts/dq/gold-pdf.ts                             | 56 ++++++++++++++++++++++
 scripts/dq/select-cn-sample.ts                     | 47 ++++++++++++++++++
 4 files changed, 160 insertions(+)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || { echo "$p"; cat "$p"; }; done; ls -a; git show 593c12e --; cat package.json' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>.
..
.claude
.cursor
.edgeone
.env.example
.git
.gitattributes
.github
.gitignore
.osstack
.vercelignore
DESIGN.md
LICENSE
README.md
STITCH_PROMPTS.md
TODOS.md
config
data
docs
e2e
eslint.config.mjs
hermes
legacy-demo
messages
next.config.mjs
node_modules
ops
osstack-contracts.cjs
osstack.contracts.json
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public
reports
scripts
skills
src
supabase
tailwind.config.ts
tsconfig.json
tsconfig.tsbuildinfo
vendor
vercel.json
vitest.config.ts
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rI93NWNT' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-UfrHBrpX' (errno=Operation not permitted)
commit 593c12eb15ba7899f6318f452c8fa749021d0d6c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:47:43 2026 -0800

    feat(dq): A-share gold sample template and PDF upload scripts, transcription guide; record E5 as not achieved (CN degraded)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
index b7660c04..903cb9b1 100644
--- a/docs/audits/2026-11-05-data-foundation-3/verification.md
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -80,3 +80,13 @@
 - 夹具使用真实 CIK 与 accession（计划未要求改键）。
 - 未纳入：30 家生产样本 v2（需网络与 owner 决策 E；`--live`），E4 以 v2 计量。
 - `ixt-sec:*` 格式出现次数：AAPL 1 / MSFT 0（规格 §14 开放问题 6 的首个数据点）。
+
+## F3-6 A 股黄金集（Task 16，降级，2026-11-06）
+
+- 状态：**E5 未达成（CN 降级）**，不报任何通过率数字（规格 T15）。
+- 情形变化（相对计划文本）：`TUSHARE_TOKEN` 现已可用（存于仓库外 `~/.config/osbornalpha/secrets.env`，未打印、未落盘），且 PR #104 已把真实录制的 Tushare 夹具（600519.SH、000333.SZ、600036.SH、000858.SZ）与计划二 §15 核对记录合入本分支（`docs/audits/2026-11-04-data-foundation-2/17-tushare-verification.md`）。"无 token / 无真实录制"不再是降级原因。
+- 降级仍然成立的唯一阻塞：owner 决策 C（抄录人 R1、复核人 R2 与交付日期）未给出；与抄录同时才能完成的巨潮 PDF（`pdf_sha256`、`cninfo_announcement_id`）和 `disclosure_date` 挂接核实也因此未做。故无 `src/lib/dq/fixtures/gold/cn-annual-v1.json`，不放占位或代理值。
+- 已交付：校验器 `src/lib/dq/reconcile/gold-cn.ts`（Task 16a：精确乘积、`tushare_source_ref` 核对、印刷精度区间、复核/隔离边界）、对账对 `cn.tushare_vs_cninfo_pdf_gold`（读不到黄金文件时以 `invalid_gold_file` 拒绝启动）、`scripts/dq/select-cn-sample.ts`（模板）、`scripts/dq/gold-pdf.ts --upload`、抄录指引 `docs/runbooks/cn-gold-transcription.md`。
+- 有意未做：`gold-cn.integration.test.ts` 未创建、未登记 `criticalSuites`；`vercel.json` 无 CN 对账 cron（`pair=cn.` 计数 0）；路由对 `cn.*` 在 `FACTS_CN_ENABLED!=='1'` 时 403。
+- 脚本冒烟（无 `.env.local`，不连库）：`select-cn-sample.ts --count 0` 与无参 `gold-pdf.ts` 均打印用法、退出码 2；`gold-pdf.ts` 对合成 PDF + 三行（一行匹配、一行缺失、一行 `<pending>`）的黄金文件输出 `found` 与 `missing_locally`，汇总 `distinct_pdfs=2, pending_rows=1, failed=1`，退出码 1。`select-cn-sample.ts` 的真实库运行（需 `fact_sync_scope` 的 CN 行）与 `gold-pdf.ts --upload`（需 `reconcile-raw` 桶）是 owner 动作，未在本环境执行。
+- 解除降级的 owner 步骤：(1) 指定 R1/R2（决策 C）；(2) 运行 `select-cn-sample.ts` 得到模板，按抄录指引抄录、复核、下载并上传 PDF；(3) 抄录完成后，据已有 Tushare 夹具与新录的 `disclosure_date` 响应另开任务创建并登记 `gold-cn.integration.test.ts`（N 家夹具 → CN 同步 → 本对账对 → 每黄金行恰一结果、`passed/expected >= 95%`、非 passed 全部在 `exceptions.json`），通过后再加 CN cron 并设 `FACTS_CN_ENABLED=1`。
diff --git a/docs/runbooks/cn-gold-transcription.md b/docs/runbooks/cn-gold-transcription.md
new file mode 100644
index 00000000..2acb91f7
--- /dev/null
+++ b/docs/runbooks/cn-gold-transcription.md
@@ -0,0 +1,47 @@
+# A 股黄金集抄录指引（草稿，计划三 Task 16b；规格三 §5.4）
+
+> 适用：`src/lib/dq/fixtures/gold/cn-annual-v1.json`（`schema: gold/cn-annual/1`）。抄录人 R1、复核人 R2 用代号，二者不得相同（owner 决策 C）。
+
+## 1. 范围
+- 发行人：`scripts/dq/select-cn-sample.ts` 生成模板时 `fact_sync_scope(market='CN', priority>0)` 的主 A 股 ticker，升序取前 min(30, N)（决策 E、H）。N=0 时不开始。
+- 期间：FY2022、FY2023、FY2024、FY2025 四个年报；每份只抄"主要会计数据和财务指标"表的**本期**列。
+- 科目（固定六个）：营业收入 `revenue_operating`、归属于上市公司股东的净利润 `net_income_parent`、总资产 `total_assets`、归属于上市公司股东的净资产 `equity_parent`、经营活动产生的现金流量净额 `operating_cash_flow`、基本每股收益 `eps_basic`。
+- 文件必须是 `tickers × 4 × 6` 的**精确乘积**：一个组合一行，不多不少；缺一行即整份文件无效。
+
+## 2. 每行怎么填
+| 字段 | 填法 |
+|---|---|
+| `printed_value` | 表中数字原样去掉千分位逗号，保留印刷的小数位与负号；不换算、不四舍五入。例：`1,505,600,000.00` → `"1505600000.00"`；`(3.21)` 写 `"-3.21"` |
+| `printed_decimals` | `printed_value` 小数点后的位数（与印刷一致；`"1505600000.00"` → 2） |
+| `printed_unit_multiplier` | 表头单位：元=1、千元=1000、万元=10000、百万元=1000000、亿元=100000000；每股收益一律 1（元/股） |
+| `column` | 固定 `"本期"`；不抄"上年同期""调整后""调整前"等列 |
+| `source.document` | 公告标题原文（例："贵州茅台 2024 年年度报告"） |
+| `source.cninfo_announcement_id` | 巨潮公告 ID |
+| `source.announcement_date` | 公告日期 `YYYY-MM-DD` |
+| `source.pdf_url` | 巨潮 PDF 下载地址 |
+| `source.pdf_sha256` | 下载得到的 PDF 字节的 sha256（`shasum -a 256 <file>`）；上传后由 `gold-pdf.ts` 再核一次 |
+| `source.page` | 该表所在的 PDF 页码（阅读器显示的物理页，从 1 起） |
+| `source.table` | 固定 `"主要会计数据和财务指标"` |
+| `tushare_source_ref` | 见第 3 节 |
+| `report_type` | 原始年报不填（=1）；只有专门为"变更前原数"（type-5）建的行才填 5，并且必须有它自己核实的源文档 |
+| `recorded_at` | 抄录时刻 ISO 时间戳 |
+
+## 3. `tushare_source_ref` 的核实（规格 T14，最容易出错的一步）
+- 形式 `<ts_code>:<end_date>:<report_type>:<ann_date>`，取自计划二 `filings.source_ref`（例：`600519.SH:20241231:1:20250403`）。
+- **R1 与 R2 各自独立核实**它与本行 PDF（`pdf_sha256`）是同一版本：PDF 封面/公告日期与该引用的 `ann_date`（或 `f_ann_date`）一致；PDF 是**原始年报**，不是更正公告、不是次年年报的比较列。
+- 不得用 `filings.document_ref` 代替核实：计划二挂接器在存在 type-5 时会把 type-1 指向更正公告，type-4 会指向次年年报；`document_ref` 只用于交叉核对（不一致时对账行记 `document_ref_mismatch=true`，不改绑定）。
+- 找不到与 PDF 同版本的引用 → 该行**不提交**，整份文件因此不完整、暂不进入 F3-6；不得挑一个相近的引用凑数。
+
+## 4. 复核
+- R2 逐行对照 PDF 页面核对 `printed_value/printed_decimals/printed_unit_multiplier/page` 与第 3 节的引用；有异议的行由 R1 改，R2 再核。`recorded_by`/`reviewed_by` 写代号。
+- 校验：`npx tsx -e "import('./src/lib/dq/reconcile/gold-cn.ts').then(m=>{const r=m.validateGoldCn(require('./src/lib/dq/fixtures/gold/cn-annual-v1.json'));console.log(r.ok?'ok':r.errors.join('\\n'))})"` 必须打印 `ok`。
+- PDF 上传：`node --env-file=.env.local --import tsx scripts/dq/gold-pdf.ts --gold src/lib/dq/fixtures/gold/cn-annual-v1.json --pdf-dir <下载目录> --upload`，退出码 0 才算完成。
+
+## 5. 对账怎么用这些行（供理解，不需要操作）
+- 右侧值 = `printed_value × printed_unit_multiplier`，区间半径 = `0.5 × 10^(−printed_decimals) × multiplier`；Tushare 原文值落在区间内即通过。
+- 只有"以元、两位小数"印刷（multiplier=1 且 decimals=2）的不一致才自动隔离 Tushare 值；千元/万元等舍入印刷的不一致只建人工复核项（`reconcile_review`），由人判断是舍入差还是数据差。
+- 一行抄错 → 对账失败 → 隔离或复核 → 改 json 并经复核 → 重跑通过（`inputs_hash` 随文件 sha256 改变）→ 管理员恢复。
+
+## 6. 进入 CI 与 cron 的条件（T15）与当前状态
+- 当前（2026-11-06）：`TUSHARE_TOKEN` 已可用，真实 Tushare 夹具（600519.SH / 000333.SZ / 600036.SH / 000858.SZ）与计划二 §15 核对记录已随 PR #104 合入（`docs/audits/2026-11-04-data-foundation-2/17-tushare-verification.md`）。降级**仍然成立**，唯一原因是 owner 决策 C（抄录人 R1 与复核人 R2）未指定；巨潮 PDF 与 `disclosure_date` 挂接随抄录一并完成。
+- `gold-cn.integration.test.ts` 只有在真实录制并留存的 Tushare 三表、巨潮挂接与 `disclosure_date` 响应都存在且核对通过后才创建；CN 对账 cron 同时以 `FACTS_CN_ENABLED=1` 与黄金核实完成为门。在此之前 E5 记"未达成（CN 降级）"，不报数字。
diff --git a/scripts/dq/gold-pdf.ts b/scripts/dq/gold-pdf.ts
new file mode 100644
index 00000000..abaa3891
--- /dev/null
+++ b/scripts/dq/gold-pdf.ts
@@ -0,0 +1,56 @@
+// scripts/dq/gold-pdf.ts
+/**
+ * Verifies and uploads the annual-report PDFs referenced by an A-share gold file (spec §3.1 bucket reconcile-raw, §5.4).
+ *
+ *   node --env-file=.env.local --import tsx scripts/dq/gold-pdf.ts --gold <gold.json> --pdf-dir <dir> [--upload]
+ *
+ * For every distinct rows[].source.pdf_sha256 of the gold file (read leniently, so PDFs can be uploaded while the
+ * transcription is still in progress; '<pending>' hashes are skipped and counted): finds the local *.pdf in --pdf-dir
+ * whose bytes hash to it. Without --upload it only reports {sha256, file, announcement_ids}. With --upload each
+ * matched PDF goes to reconcile-raw as kind 'cn-gold-pdf' (content-addressed; an existing object is 'exists') and the
+ * stored sha256 must equal the gold file's value. A PDF that is missing locally, or a stored hash that differs, makes
+ * the exit code 1; nothing is ever renamed or rewritten. Exit 2 on bad arguments.
+ */
+import {createHash} from 'node:crypto';
+import {readFileSync,readdirSync} from 'node:fs';
+import {join} from 'node:path';
+import {supabaseRawStore} from '../../src/lib/dq/raw-store';
+import {budgetFor} from '../../src/lib/facts/providers/shared';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+const USAGE='usage: gold-pdf.ts --gold <gold.json> --pdf-dir <dir> [--upload]';
+const SHA=/^[0-9a-f]{64}$/;
+
+async function main(){
+ const argv=process.argv.slice(2);let gold='',dir='',upload=false;
+ for(let i=0;i<argv.length;i++){
+  const x=argv[i],v=argv[i+1];
+  if(x==='--gold'&&v){gold=v;i++;}else if(x==='--pdf-dir'&&v){dir=v;i++;}else if(x==='--upload')upload=true;else{console.error(USAGE);process.exit(2);}
+ }
+ if(!gold||!dir){console.error(USAGE);process.exit(2);}
+ const json=JSON.parse(readFileSync(gold,'utf8')) as {rows?:{source?:{pdf_sha256?:unknown;cninfo_announcement_id?:unknown}}[]};
+ const wanted=new Map<string,Set<string>>();let pending=0;
+ for(const r of json.rows??[]){
+  const sha=r.source?.pdf_sha256;
+  if(typeof sha!=='string'||!SHA.test(sha)){pending++;continue;}
+  const ids=wanted.get(sha)??new Set<string>();if(typeof r.source?.cninfo_announcement_id==='string')ids.add(r.source.cninfo_announcement_id);wanted.set(sha,ids);
+ }
+ const local=new Map<string,string>();
+ for(const name of readdirSync(dir).filter(f=>f.toLowerCase().endsWith('.pdf')).sort()){
+  const p=join(dir,name);local.set(createHash('sha256').update(readFileSync(p)).digest('hex'),p);
+ }
+ const raw=upload?supabaseRawStore(getAdminSupabase()):null;
+ let failed=0;
+ for(const [sha,ids] of [...wanted.entries()].sort(([a],[b])=>a<b?-1:1)){
+  const file=local.get(sha);
+  if(!file){failed++;console.log(JSON.stringify({sha256:sha,status:'missing_locally',announcement_ids:[...ids]}));continue;}
+  if(!raw){console.log(JSON.stringify({sha256:sha,status:'found',file,announcement_ids:[...ids]}));continue;}
+  const stored=await raw.put({kind:'cn-gold-pdf',bytes:new Uint8Array(readFileSync(file)),contentType:'application/pdf',meta:{announcement_ids:[...ids].join(',')}},budgetFor(120_000));
+  if(stored.sha256!==sha){failed++;console.log(JSON.stringify({sha256:sha,status:'hash_mismatch',stored:stored.sha256,file}));continue;}
+  console.log(JSON.stringify({sha256:sha,status:stored.status,path:stored.path,file}));
+ }
+ console.log(JSON.stringify({gold,distinct_pdfs:wanted.size,pending_rows:pending,failed,uploaded:upload}));
+ process.exit(failed>0?1:0);
+}
+
+main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
diff --git a/scripts/dq/select-cn-sample.ts b/scripts/dq/select-cn-sample.ts
new file mode 100644
index 00000000..9cda08a9
--- /dev/null
+++ b/scripts/dq/select-cn-sample.ts
@@ -0,0 +1,47 @@
+// scripts/dq/select-cn-sample.ts
+/**
+ * A-share gold-set sample and transcription template (spec §5.4; owner decisions C, E, H).
+ *
+ *   node --env-file=.env.local --import tsx scripts/dq/select-cn-sample.ts [--count 30] [--out docs/audits/2026-11-05-data-foundation-3/cn-gold-template.json]
+ *
+ * tickers = the primary A-share ticker (plan 2 chooseCnTicker over the issuer's CURRENT issuer_securities rows) of
+ * every fact_sync_scope row with market CN and priority > 0, ascending, the first min(count, N). The output is a
+ * transcription TEMPLATE (gold-cn.ts goldTemplate): the exact tickers × FY2022–FY2025 × six-concept product with
+ * every printed and source field '<pending>'. It fails validateGoldCn by design; recorder and reviewer fill it from
+ * the cninfo annual-report PDFs (docs/runbooks/cn-gold-transcription.md) and only the completed, reviewed file is
+ * committed as src/lib/dq/fixtures/gold/cn-annual-v1.json. The template holds tickers and primary-document locators
+ * only — no selection reasons, no names (decision H).
+ * N = 0 → nothing is written and exit 1 ("F3-6 cannot start": recorded, never faked). Exit 2 on bad arguments.
+ */
+import {writeFileSync} from 'node:fs';
+import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
+import {isCurrentSecurity} from '../../src/lib/entities/resolve';
+import {chooseCnTicker} from '../../src/lib/facts/scope';
+import {goldTemplate,pickCnSample} from '../../src/lib/dq/reconcile/gold-cn';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+const USAGE='usage: select-cn-sample.ts [--count <1..200>] [--out <path.json>]';
+
+async function main(){
+ const argv=process.argv.slice(2);let count=30;let out='docs/audits/2026-11-05-data-foundation-3/cn-gold-template.json';
+ for(let i=0;i<argv.length;i+=2){
+  const k=argv[i],v=argv[i+1];
+  if(k==='--count'&&v&&/^\d{1,3}$/.test(v)&&Number(v)>=1&&Number(v)<=200)count=Number(v);
+  else if(k==='--out'&&v&&v.endsWith('.json'))out=v;
+  else{console.error(USAGE);process.exit(2);}
+ }
+ const tables=supabaseTableClient(getAdminSupabase());const today=new Date().toISOString().slice(0,10);
+ const scope=(await selectAll(tables,'fact_sync_scope',{market:'CN'},'issuer_id')).filter(r=>Number(r.priority)>0);
+ const tickers:(string|null)[]=[];const unresolved:string[]=[];
+ for(const s of scope){
+  const secs=(await selectAll(tables,'issuer_securities',{issuer_id:String(s.issuer_id)},'ticker')).filter(r=>isCurrentSecurity(r,today));
+  const c=chooseCnTicker(secs);
+  if('ticker' in c)tickers.push(c.ticker);else{tickers.push(null);unresolved.push(`${String(s.issuer_id)}:${c.reason}`);}
+ }
+ const picked=pickCnSample(tickers,count);
+ if(picked.length===0){console.error(JSON.stringify({scope:scope.length,picked:0,unresolved,message:'F3-6 cannot start: no CN issuer in scope (N = 0)'}));process.exit(1);}
+ writeFileSync(out,`${JSON.stringify(goldTemplate(picked),null,1)}\n`);
+ console.log(JSON.stringify({out,scope:scope.length,picked:picked.length,rows:picked.length*24,unresolved}));
+}
+
+main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
{
  "name": "stock-monitor",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=22.19.0 <23"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "preflight:release": "tsx scripts/release-preflight.ts",
    "securities:sync": "tsx scripts/securities-sync.ts",
    "securities:reconcile": "tsx scripts/securities-reconcile.ts",
    "test:db": "tsx scripts/ci/research-db.ts",
    "test:migrations": "tsx scripts/ci/migration-rehearsal.ts",
    "supabase:types": "echo 'database.types.ts is hand-maintained; see docs/runbooks/data-foundation.md' && exit 1",
    "check:migration-history": "tsx scripts/ci/check-migration-history.ts",
    "test:runtime-privileges": "tsx scripts/s4/runtime-privileges-smoke.ts",
    "preflight:research": "tsx scripts/s4/runtime-preflight.ts",
    "test:runtime-tls": "tsx scripts/s4/runtime-tls-smoke.ts",
    "test:revocation-consumer": "tsx scripts/revocation/consumer-smoke.ts",
    "test:revocation-registration": "tsx scripts/revocation/registration-smoke.ts",
    "test:revocation-retention": "tsx scripts/revocation/retention-smoke.ts",
    "test:revocation-list": "tsx scripts/revocation/list-smoke.ts"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.46.1",
    "ajv": "8.20.0",
    "clsx": "^2.1.1",
    "dsh-trade-strategy-evaluator": "file:vendor/dsh-trade-strategy-evaluator-0.3.0.tgz",
    "geist": "^1.7.1",
    "iconv-lite": "^0.7.2",
    "lightweight-charts": "^4.2.1",
    "next": "15.5.28",
    "next-intl": "^4.13.1",
    "pg": "^8.23.0",
    "pinyin-pro": "^3.28.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "stripe": "^22.3.0",
    "svix": "^1.98.0",
    "tailwind-merge": "^2.5.4",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  },
  "devDependencies": {
    "@next/eslint-plugin-next": "^15.5.22",
    "@playwright/test": "^1.61.1",
    "@types/node": "^22.9.0",
    "@types/pg": "^8.23.1",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "autoprefixer": "^10.4.20",
    "eslint": "^10.8.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "tsx": "^4.23.1",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.65.0",
    "vitest": "^4.1.10"
  },
  "overrides": {
    "@swc/helpers": "0.5.23",
    "brace-expansion": "5.0.9",
    "nanoid": "3.3.18",
    "source-map-js": "1.2.2",
    "next": {
      "postcss": "8.5.26",
      "sharp": "0.35.5"
    }
  }
}

exec
/bin/zsh -lc 'cat src/lib/dq/raw-store.ts; cat src/lib/db/table-client.ts; cat src/lib/facts/scope.ts; cat src/lib/dq/reconcile/gold-cn.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/dq/raw-store.ts
// Raw evidence for identifiers, calendar and reconciliation (spec 3 §3.1 bucket reconcile-raw; plan 3
// contract C6). Content-addressed: put() hashes the bytes itself and stores them at
// <kind>/<sha256>.<ext> plus a <kind>/<sha256>.meta.json sidecar, both with upsert:false, so identical
// bytes fetched again answer 'exists' and stored evidence is never rewritten (the first sidecar wins).
// The sidecar holds metadata only: values that look like credentials (URL userinfo, token-like query
// parameters) are refused before any upload. Any other upload failure is
// RawStoreError('raw_upload_failed'): the caller marks that issuer/file failed and writes no row that
// depends on it. The budget's abort signal cuts the wait. Mirrors src/lib/facts/snapshot-store.ts.
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Budget} from '../facts/types';

export const RECONCILE_RAW_BUCKET='reconcile-raw';
export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo'|'sec-tickers-exchange'|'sec-companyfacts';
export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo','sec-tickers-exchange','sec-companyfacts'];
export type RawContentType='application/json'|'text/html'|'application/pdf'|'text/csv'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/vnd.ms-excel'|'application/zip';
export interface RawPut{kind:RawKind;bytes:Uint8Array;contentType:RawContentType;meta?:Record<string,string|number>}
export interface RawStored{sha256:string;path:string;status:'stored'|'exists'}
export interface RawStore{put(item:RawPut,budget?:Budget):Promise<RawStored>;sha256Of(path:string):string}
export const RAW_EXT:Record<RawContentType,string>={
 'application/json':'json','text/html':'html','application/pdf':'pdf','text/csv':'csv',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/vnd.ms-excel':'xls','application/zip':'zip',
};
export const rawPath=(kind:RawKind,sha256:string,ext:string)=>`${kind}/${sha256}.${ext}`;
// Full object filename + .meta.json: the same bytes stored under two content types get distinct sidecars.
export const rawMetaPath=(path:string)=>`${path}.meta.json`;

export class RawStoreError extends Error{
 constructor(readonly code:'raw_upload_failed'|'raw_invalid',readonly reason?:string){
  super(reason?`${code}: ${reason}`:code);
  this.name='RawStoreError';
 }
}

const PATH=new RegExp(`^(${RAW_KINDS.join('|')})/([0-9a-f]{64})\\.(${Object.values(RAW_EXT).join('|')})$`);
const CREDENTIAL=/:\/\/[^/\s]*@|[?&#](?:token|key|apikey|api_key|access_token|sig|signature|auth|secret|password)=/i;
const CREDENTIAL_NAME=/api[-_]?key|token|secret|password|authorization|cookie|^(?:key|sig|signature|auth)$/i;
/** A string value that parses as a URL is also checked by its decoded query/fragment parameter names and userinfo. */
function urlHasCredential(v:string):boolean{
 let u:URL;
 try{u=new URL(v);}catch{return false;}
 if(u.username||u.password)return true;
 for(const name of u.searchParams.keys())if(CREDENTIAL_NAME.test(name))return true;
 const frag=u.hash.replace(/^#/,'');
 if(frag.includes('='))for(const name of new URLSearchParams(frag).keys())if(CREDENTIAL_NAME.test(name))return true;
 return false;
}

export const sha256Hex=(bytes:Uint8Array):string=>createHash('sha256').update(bytes).digest('hex');

/** The sha256 a content-addressed data path names; throws raw_invalid for anything else (sidecars included). */
function sha256Of(path:string):string{
 const m=PATH.exec(path);
 if(!m)throw new RawStoreError('raw_invalid',`path:${path.slice(0,80)}`);
 return m[2];
}

export function prepare(item:RawPut):{sha256:string;path:string;meta:string}{
 if(!RAW_KINDS.includes(item.kind))throw new RawStoreError('raw_invalid',`kind:${String(item.kind).slice(0,40)}`);
 const ext=RAW_EXT[item.contentType];
 if(!ext)throw new RawStoreError('raw_invalid',`content_type:${String(item.contentType).slice(0,80)}`);
 if(!(item.bytes instanceof Uint8Array))throw new RawStoreError('raw_invalid','bytes');
 for(const [k,v] of Object.entries(item.meta??{})){
  if(typeof v==='number'?!Number.isFinite(v):typeof v!=='string')throw new RawStoreError('raw_invalid',`meta:${k}`);
  if(CREDENTIAL_NAME.test(k))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
  if(typeof v==='string'&&(CREDENTIAL.test(v)||urlHasCredential(v)))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
 }
 const sha256=sha256Hex(item.bytes);
 // System keys last: caller meta can never overwrite what the sidecar asserts about the bytes.
 const meta=JSON.stringify({...item.meta,kind:item.kind,sha256,bytes:item.bytes.byteLength,content_type:item.contentType});
 return {sha256,path:rawPath(item.kind,sha256,ext),meta};
}

interface UploadError{message:string;statusCode?:string|number;status?:number}
const isExists=(e:UploadError)=>String(e.statusCode??e.status??'')==='409'||/already exists|duplicate/i.test(e.message);

function withinBudget<T>(p:Promise<T>,budget?:Budget):Promise<T>{
 if(!budget)return p;
 if(budget.signal.aborted)return Promise.reject(new RawStoreError('raw_upload_failed','budget_exhausted'));
 return new Promise<T>((resolve,reject)=>{
  const onAbort=()=>reject(new RawStoreError('raw_upload_failed','budget_exhausted'));
  budget.signal.addEventListener('abort',onAbort,{once:true});
  p.then(v=>{budget.signal.removeEventListener('abort',onAbort);resolve(v);},e=>{budget.signal.removeEventListener('abort',onAbort);reject(e);});
 });
}

export function supabaseRawStore(admin:SupabaseClient):RawStore{
 const bucket=()=>admin.storage.from(RECONCILE_RAW_BUCKET);
 const upload=async(path:string,body:Uint8Array|string,contentType:string,budget?:Budget):Promise<'stored'|'exists'>=>{
  // checked before the call: an already-aborted budget performs zero uploads
  if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
  const {error}=await withinBudget(bucket().upload(path,body,{contentType,upsert:false}),budget);
  if(!error)return 'stored';
  if(isExists(error as UploadError))return 'exists';
  throw new RawStoreError('raw_upload_failed',(error as UploadError).message);
 };
 return {
  sha256Of,
  async put(item,budget){
   const {sha256,path,meta}=prepare(item);
   const status=await upload(path,item.bytes,item.contentType,budget);
   await upload(rawMetaPath(path),meta,'application/json',budget);
   return {sha256,path,status};
  },
 };
}

export function memoryRawStore():RawStore&{objects:Map<string,Uint8Array>}{
 const objects=new Map<string,Uint8Array>();
 return {
  objects,
  sha256Of,
  async put(item,budget){
   const {sha256,path,meta}=prepare(item);
   if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
   // a copy: later mutation of the caller's buffer cannot rewrite evidence; stored objects and sidecars are immutable
   const status:RawStored['status']=objects.has(path)?'exists':'stored';
   if(status==='stored')objects.set(path,new Uint8Array(item.bytes));
   if(!objects.has(rawMetaPath(path)))objects.set(rawMetaPath(path),new TextEncoder().encode(meta));
   return {sha256,path,status};
  },
 };
}
// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
// PostgREST caps every response (max_rows, default 1000), so select() returns at most one
// page. Reads that may exceed one page must use selectAll(), which pages in a fixed order.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
/** Inclusive lower (`gte`) and exclusive upper (`lt`) bounds per column. ISO timestamp strings compare as text, numbers numerically. */
export interface RangeOptions{gte?:Record<string,string|number>;lt?:Record<string,string|number>}
// offset requires orderBy: unordered pages are not stable across requests.
// limit is an integer 1..MAX_PAGE; offset a non-negative safe integer.
export interface SelectOptions extends RangeOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}

/** Largest page PostgREST returns by default; also the limit and selectAll page-size ceiling. */
export const MAX_PAGE=1000;

/** Table operation failure; `code` is the PostgreSQL SQLSTATE when known (e.g. '23505' unique violation). */
export class TableError extends Error{
 readonly details?:string;
 readonly hint?:string;
 constructor(readonly op:string,readonly table:string,message:string,readonly code:string|null=null,extra:{details?:string|null;hint?:string|null;cause?:unknown}={}){
  super(`${table} ${op}: ${message}`,extra.cause===undefined?undefined:{cause:extra.cause});
  this.name='TableError';
  if(extra.details)this.details=extra.details;
  if(extra.hint)this.hint=extra.hint;
 }
}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 /** Returns the number of rows the match hit. An empty match is rejected (no whole-table updates). */
 update(table:string,match:Row,patch:Row):Promise<number>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
 count(table:string,match:Row,opts?:RangeOptions):Promise<number>;
 /**
  * Calls a service-role SQL function and returns its result (plan 3: the row-locking jsonb patches
  * append_claim_evidence / patch_quarantine_detail / set_security_identifier of migration 20261107090000). Optional so the landed
  * test stubs stay valid; callers go through callRpc, which fails loudly when it is missing.
  */
 rpc?(fn:string,args:Row):Promise<unknown>;
}

/** Calls `fn` through client.rpc. A client without rpc is a wiring error (rpc_unavailable:<fn>), never a silent no-op. */
export async function callRpc(client:TableClient,fn:string,args:Row):Promise<unknown>{
 if(!client.rpc)throw new Error(`rpc_unavailable:${fn}`);
 return client.rpc(fn,args);
}

/** Rejects `undefined` match values: they would otherwise be dropped or match nothing silently. */
export function assertMatch(match:Row):void{
 if(!match||typeof match!=='object')throw new Error('undefined_match_value');
 for(const v of Object.values(match))if(v===undefined)throw new Error('undefined_match_value');
}

export function assertUpdateMatch(match:Row):void{
 assertMatch(match);
 if(Object.keys(match).length===0)throw new Error('empty_update_match');
}

const okBound=(v:unknown)=>typeof v==='string'||(typeof v==='number'&&Number.isFinite(v));
function checkRange(opts:RangeOptions):void{
 for(const r of [opts.gte,opts.lt]){
  if(r===undefined)continue;
  if(!r||typeof r!=='object'||Object.values(r).some(v=>!okBound(v)))throw new Error('invalid_select_options');
 }
}

export function checkSelectOptions(opts:SelectOptions):void{
 if(opts.limit!==undefined&&(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>MAX_PAGE))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&(!Number.isSafeInteger(opts.offset)||opts.offset<0))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');
 checkRange(opts);
}

export function checkRangeOptions(opts:RangeOptions):void{checkRange(opts);}

/**
 * Reads every matching row, paging by `offset` in `orderBy` order and stopping only on an empty
 * page, so a server max_rows below pageSize cannot truncate the result. `orderBy` must be a
 * unique column (ties make offset pages overlap or skip). Pages are separate requests, so the
 * result is not a snapshot: concurrent writes can be missed or seen twice.
 */
export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE)throw new Error(`selectAll pageSize must be 1..${MAX_PAGE}`);
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

// `.eq(k,null)` renders `k=eq.null`, which never matches in SQL; null must use `.is`.
const applyMatch=(q:any,match:Row)=>{for(const [k,v] of Object.entries(match))q=v===null?q.is(k,null):q.eq(k,v);return q;};
const applyRange=(q:any,opts:RangeOptions)=>{
 for(const [k,v] of Object.entries(opts.gte??{}))q=q.gte(k,v);
 for(const [k,v] of Object.entries(opts.lt??{}))q=q.lt(k,v);
 return q;
};

interface PgError{message:string;code?:string;details?:string|null;hint?:string|null}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type does describe the dq/issuer tables, but TableClient takes
 // table names as plain strings so the same callers run over the in-memory client too; the
 // loosely typed handle keeps that parity instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 const fail=(op:string,table:string,error:PgError):never=>{throw new TableError(op,table,error.message,error.code??null,{details:error.details,hint:error.hint,cause:error});};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)fail('insert',table,error);return data as Row;},
  // Exact count from Content-Range; no rows are returned. A missing count fails closed.
  async update(table,match,patch){
   assertUpdateMatch(match);
   const {count,error}=await applyMatch(db.from(table).update(patch,{count:'exact'}),match);
   if(error)fail('update',table,error);
   if(count===null||count===undefined)throw new Error('update_count_unavailable');
   return count as number;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let q=applyRange(applyMatch(db.from(table).select('*'),match),opts);
   if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});
   if(opts.limit!==undefined||opts.offset!==undefined){const from=opts.offset??0;q=q.range(from,from+(opts.limit??MAX_PAGE)-1);}
   const {data,error}=await q;if(error)fail('select',table,error);return (data??[]) as Row[];
  },
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)fail('upsert',table,error);},
  async count(table,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   const {count,error}=await applyRange(applyMatch(db.from(table).select('*',{count:'exact',head:true}),match),opts);
   if(error)fail('count',table,error);
   if(count===null||count===undefined)throw new Error('count_unavailable');
   return count as number;
  },
  async rpc(fn,args){
   const {data,error}=await (client as unknown as {rpc:(f:string,a:Row)=>PromiseLike<{data:unknown;error:PgError|null}>}).rpc(fn,args);
   if(error)fail('rpc',fn,error);
   return data;
  },
 };
}
// src/lib/facts/scope.ts
// Sync scope (spec §6.4). reconcileScope is idempotent: it computes the desired set for one market
// from the sources, marks rows that vanished with priority 0, and hands everything to
// FactsDb.reconcileScope (SQL reconcile_fact_sync_scope), which only touches reasons/priority/
// fetch_key and never the scheduling or lease columns.
//  US: active tickers of universes sp500/nasdaq_top500/us_china → the issuer currently owning the
//      ticker (issuer_securities row current at `today` by the landed predicate of
//      entities/resolve.ts — a scheduled future end keeps the owner current, round-1 #22) that has
//      a CIK; fetch_key = 10-digit CIK; priority 10.
//  CN: research_entity_keys.in_scope and issuer_id is not null → the issuer's current primary
//      .SH/.SZ/.BJ ticker; reasons ['cohort']; priority 10 (owner decision A).
//  Watchlists are never a source (owner decision B).
// scopeRowFor derives ONE issuer's row the same way for explicit --issuer / replay runs (round-1
// #13; reasons ['explicit']). Source reads go through TableClient and always page to exhaustion
// (selectAll, fixed order; completeness is never inferred from one page). Rows already in the scope
// table are read through FactsDb.scopeAll (the table client cannot see the memory adapter's rows).
// CN ticker choice: the current primary A-share (.SH/.SZ/.BJ, B shares excluded); no primary → the
// single current A-share; several primaries or several non-primary candidates → ambiguous_cn_ticker.
import {MAX_PAGE,selectAll} from '../db/table-client';
import type {RangeOptions,Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import type {FactsDb,Market} from './types';

export const US_UNIVERSES=['sp500','nasdaq_top500','us_china'] as const;
export const SCOPE_PRIORITY=10;
const CN_TICKER=/\.(SH|SZ|BJ)$/;
// B shares trade under A-share-looking codes but are another class (same pattern as entities/link-research.ts, not exported there).
const B_SHARE=/^(900\d{3}\.SH|200\d{3}\.SZ)$/;

export function fetchKey(market:Market,issuer:{cik?:string|null;ticker?:string|null}):string{
 if(market==='US'){
  const cik=issuer.cik?.trim();
  if(!cik||!/^\d{1,10}$/.test(cik))throw new Error('missing_cik');
  return cik.padStart(10,'0');
 }
 const t=issuer.ticker?.trim().toUpperCase();
 if(!t||!CN_TICKER.test(t))throw new Error('not_cn_ticker');
 return t;
}

export interface ScopeDeps{tables:TableClient;db:Pick<FactsDb,'reconcileScope'|'scopeAll'>}
export interface ScopeReconcileResult{desired:number;retired:number;changed:number;skipped:Record<string,number>}
/** One reconcile_fact_sync_scope input row. */
export type ScopeInputRow={issuer_id:string;reasons:string[];priority:number;fetch_key:string};
type DesiredRow=ScopeInputRow;

const FETCH_KEY_ERRORS=new Set(['missing_cik','not_cn_ticker']);   // the only errors scopeRowFor turns into null
const str=(v:unknown)=>typeof v==='string'?v:null;
const normTicker=(t:string)=>t.trim().toUpperCase().replace(/\//g,'.');
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
const isoToday=()=>new Date().toISOString().slice(0,10);

/**
 * Keyset paging for tables whose key is composite while TableClient orders by ONE column: page on
 * `orderBy` (not unique), and after a full page restart from the last value INCLUSIVE (gte), so every
 * row tied with the boundary value is read again from its first row; `keyCols` de-duplicate. Offset
 * paging would drop or repeat tied rows at a page boundary (a dropped current row retires an issuer).
 * A single tie group of MAX_PAGE rows or more cannot advance and fails loudly.
 */
async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:string[]):Promise<Row[]>{
 const seen=new Set<string>(),out:Row[]=[];
 let cursor:string|null=null;
 for(;;){
  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);}}
  if(page.length<MAX_PAGE)return out;
  const last=String(page[page.length-1][orderBy]);
  if(last===cursor)throw new Error('scope_tie_group_overflow');
  cursor=last;
 }
}
const SEC_KEY=['issuer_id','ticker','valid_from'];

/**
 * Security rows current at `today` by the landed predicate (isCurrentSecurity). Open rows page by
 * ticker (unique among them: issuer_securities_open_owner_idx); rows with a scheduled end are few
 * and read in one page (gte valid_to today, then the predicate keeps valid_to > today only).
 */
export async function currentSecurities(tables:TableClient,today:string):Promise<Row[]>{
 const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
 // Rows with a scheduled end: several validity windows per ticker are allowed, so ticker is not unique: keyset paging.
 const ending=await keysetAll(tables,'issuer_securities',{},{gte:{valid_to:today}},'ticker',SEC_KEY);
 return [...open,...ending].filter(r=>isCurrentSecurity(r,today));
}

async function desiredUs(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DesiredRow[]>{
 const reasonsByTicker=new Map<string,Set<string>>();
 for(const u of US_UNIVERSES){
  for(const m of await selectAll(tables,'security_universe_memberships',{universe:u,is_active:true},'ticker')){
   const t=normTicker(String(m.ticker));
   (reasonsByTicker.get(t)??reasonsByTicker.set(t,new Set()).get(t)!).add(`universe:${u}`);
  }
 }
 const ownerByTicker=new Map<string,string>();
 for(const s of await currentSecurities(tables,today)){const id=str(s.issuer_id);if(id)ownerByTicker.set(normTicker(String(s.ticker)),id);}
 const issuers=new Map<string,Row>();
 for(const i of await selectAll(tables,'issuers',{status:'active'},'issuer_id'))issuers.set(String(i.issuer_id),i);
 const out=new Map<string,DesiredRow>();
 for(const [ticker,reasons] of reasonsByTicker){
  const id=ownerByTicker.get(ticker);
  if(!id){bump(skipped,'unknown_ticker');continue;}
  const issuer=issuers.get(id);
  if(!issuer){bump(skipped,'issuer_not_active');continue;}
  let key:string;
  try{key=fetchKey('US',{cik:str(issuer.cik)});}catch{bump(skipped,'no_cik');continue;}
  const row=out.get(id)??out.set(id,{issuer_id:id,reasons:[],priority:SCOPE_PRIORITY,fetch_key:key}).get(id)!;
  row.reasons=[...new Set([...row.reasons,...reasons])].sort();
 }
 return [...out.values()];
}

/**
 * The issuer's A-share ticker among its current securities rows: primary first, else the single
 * candidate; null + reason when none or ambiguous.
 */
export function chooseCnTicker(secs:Row[]):{ticker:string}|{reason:'no_cn_ticker'|'ambiguous_cn_ticker'}{
 const cands=new Map<string,Row>();
 for(const r of secs){const t=normTicker(String(r.ticker));if(CN_TICKER.test(t)&&!B_SHARE.test(t))cands.set(t,r);}
 const narrow=(list:[string,Row][])=>{
  if(list.length<=1)return list;
  const a=list.filter(([,r])=>str(r.share_class)?.toUpperCase()==='A');
  return a.length===1?a:list;
 };
 const all=[...cands.entries()];
 const primary=narrow(all.filter(([,r])=>r.is_primary===true));
 if(primary.length===1)return {ticker:primary[0][0]};
 if(primary.length>1)return {reason:'ambiguous_cn_ticker'};
 const rest=narrow(all);
 if(rest.length===1)return {ticker:rest[0][0]};
 return {reason:rest.length===0?'no_cn_ticker':'ambiguous_cn_ticker'};
}

async function desiredCn(tables:TableClient,today:string,skipped:Record<string,number>):Promise<DesiredRow[]>{
 // (user_id, entity_id) is the key and TableClient orders by one column: keyset paging on entity_id, de-duplicated on the full key.
 const keys=await keysetAll(tables,'research_entity_keys',{in_scope:true},{},'entity_id',['user_id','entity_id']);
 const issuerIds=new Set<string>();
 for(const k of keys){const id=str(k.issuer_id);if(id)issuerIds.add(id);else bump(skipped,'no_issuer');}
 const byIssuer=new Map<string,Row[]>();
 for(const s of await currentSecurities(tables,today)){
  const id=str(s.issuer_id);if(!id)continue;
  (byIssuer.get(id)??byIssuer.set(id,[]).get(id)!).push(s);
 }
 const out:DesiredRow[]=[];
 for(const id of [...issuerIds].sort()){
  const c=chooseCnTicker(byIssuer.get(id)??[]);
  if('reason' in c){bump(skipped,c.reason);continue;}
  out.push({issuer_id:id,reasons:['cohort'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:c.ticker})});
 }
 return out;
}

/**
 * One issuer's scope input row for explicit runs (scripts --issuer, replay tests): US from
 * issuers.cik, CN from the current primary .SH/.SZ/.BJ listing. Null when the issuer is unknown,
 * merged, or has no fetch key — the sync core reports that issuer as scope_unresolved.
 */
export async function scopeRowFor(tables:TableClient,market:Market,issuerId:string,opts:{today?:string}={}):Promise<ScopeInputRow|null>{
 const today=opts.today??isoToday();
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 if(!issuer||issuer.status==='merged')return null;
 const secs=market==='CN'?(await keysetAll(tables,'issuer_securities',{issuer_id:issuerId},{},'ticker',SEC_KEY)).filter(r=>isCurrentSecurity(r,today)):[];   // DB errors propagate
 try{
  if(market==='US')return {issuer_id:issuerId,reasons:['explicit'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('US',{cik:str(issuer.cik)})};
  const c=chooseCnTicker(secs);
  if('reason' in c)return null;
  return {issuer_id:issuerId,reasons:['explicit'],priority:SCOPE_PRIORITY,fetch_key:fetchKey('CN',{ticker:c.ticker})};
 }catch(e){if(e instanceof Error&&FETCH_KEY_ERRORS.has(e.message))return null;throw e;}
}

/**
 * Safety margin subtracted from the client clock for the default snapshotAt. The snapshot is compared
 * with the database's now() (scope_confirmed_at); if this host's clock runs ahead by up to the margin, a
 * change another run made just after our sources were read would still look "older" than the snapshot
 * and be retired by our stale view. Backdating the snapshot makes skew fail safe: it can only DELAY a
 * retirement to the next reconcile (rows changed within the last margin are never retired), never
 * retire a newer activation. A clock running behind only delays further.
 */
export const SNAPSHOT_SKEW_MARGIN_MS=5*60_000;

/**
 * snapshotAt (default: now minus SNAPSHOT_SKEW_MARGIN_MS, taken BEFORE any source is read) travels with
 * the write: the database retires a still-active row only if no newer reconcile changed it since.
 * `now` is a test hook for the clock.
 */
export async function reconcileScope(deps:ScopeDeps,market:Market,opts:{today?:string;snapshotAt?:string;now?:()=>number}={}):Promise<ScopeReconcileResult>{
 const snapshotAt=opts.snapshotAt??new Date((opts.now??Date.now)()-SNAPSHOT_SKEW_MARGIN_MS).toISOString();
 const today=opts.today??isoToday();
 const skipped:Record<string,number>={};
 const desired=market==='US'?await desiredUs(deps.tables,today,skipped):await desiredCn(deps.tables,today,skipped);
 const wanted=new Set(desired.map(d=>d.issuer_id));
 // Rows that left the sources keep their fetch_key and drop to priority 0 (never deleted: scheduling history stays).
 const retired:DesiredRow[]=(await deps.db.scopeAll(market))
  .filter(r=>Number(r.priority)>0&&!wanted.has(String(r.issuer_id)))
  .map(r=>({issuer_id:String(r.issuer_id),reasons:[],priority:0,fetch_key:String(r.fetch_key)}));
 const rows=[...desired,...retired].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
 const changed=rows.length===0?0:await deps.db.reconcileScope(market,rows,snapshotAt);
 return {desired:desired.length,retired:retired.length,changed,skipped};
}
// src/lib/dq/reconcile/gold-cn.ts
// A-share annual-report gold set (spec §5.4, T14; schema 'gold/cn-annual/1'), validator and the printed-precision
// rules. Fixed: the six concepts of the annual report table 主要会计数据和财务指标 (BS concepts INSTANT, IS/CF 12M,
// eps CNY/share with multiplier 1), fiscal years FY2022–FY2025 (owner decision E), only the 本期 column, recorder
// and reviewer as code names that must differ. The validator rejects anything that is not the EXACT product
// tickers × fiscal_years × concepts. Every row carries tushare_source_ref = <ts_code>:<end_date>:<report_type>:<ann_date>,
// independently verified by recorder and reviewer to be the same version as the PDF (pdf_sha256); the pair binds the
// left side ONLY through it (filings.document_ref is a cross-check). Interval: center = printed × multiplier,
// radius = 0.5 × 10^-decimals × multiplier; automatic quarantine only for exact printing (multiplier 1, two
// decimals), rounded printing gets a review item. goldTemplate builds the transcription template (every printed and
// source field '<pending>', so it fails validation until transcribed); pickCnSample is §5.4's sample rule.
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import {mulDecimal} from './decimal';

export const GOLD_CN_SCHEMA='gold/cn-annual/1';
export const CN_GOLD_PATH='src/lib/dq/fixtures/gold/cn-annual-v1.json';
export const CN_GOLD_PARSER='gold-cn/1';
export const CN_GOLD_CONCEPTS=['revenue_operating','net_income_parent','total_assets','equity_parent','operating_cash_flow','eps_basic'] as const;
export type CnGoldConcept=typeof CN_GOLD_CONCEPTS[number];
export const CN_GOLD_FISCAL_YEARS:readonly number[]=[2022,2023,2024,2025];
export const CN_GOLD_MULTIPLIERS:readonly number[]=[1,1000,10000,1000000,100000000];
export interface GoldCnSource{document:string;cninfo_announcement_id:string;announcement_date:string;pdf_url:string;pdf_sha256:string;page:number;table:string}
export interface GoldCnRow{ticker:string;fiscal_year:number;concept:CnGoldConcept;printed_value:string;printed_unit_multiplier:number;printed_decimals:number;column:'本期';report_type?:number;source:GoldCnSource;tushare_source_ref:string;recorded_at:string}
export interface GoldCnFile{schema:typeof GOLD_CN_SCHEMA;tickers:string[];fiscal_years:number[];concepts:string[];recorded_by:string;reviewed_by:string;rows:GoldCnRow[]}

const TICKER=/^\d{6}\.(SH|SZ|BJ)$/,CODE=/^[A-Za-z0-9_-]{1,32}$/,DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,PRINTED=/^-?\d+(\.\d+)?$/;
const REF=/^(\d{6}\.(?:SH|SZ|BJ)):(\d{8}):(\d+):(\d{8})$/;
const str=(v:unknown):v is string=>typeof v==='string'&&v.trim()!=='';
const TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
/** A real calendar date: YYYY-MM-DD or YYYYMMDD (round-trips through Date.UTC). */
const calendar=(v:string):boolean=>{const m=/^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);if(!m)return false;const [y,mo,d]=[Number(m[1]),Number(m[2]),Number(m[3])];const t=new Date(Date.UTC(y,mo-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d;};
const fraction=(v:string)=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};

export const cnGoldKey=(r:Pick<GoldCnRow,'ticker'|'fiscal_year'|'concept'|'tushare_source_ref'>)=>`${r.ticker}:${r.fiscal_year}:${r.concept}:${r.tushare_source_ref.split(':')[2]??''}`;

export function validateGoldCn(json:unknown):{ok:true;file:GoldCnFile}|{ok:false;errors:string[]}{
 const errors:string[]=[];const e=(m:string)=>{errors.push(m);};
 const f=json as Partial<GoldCnFile>|null;
 if(!f||typeof f!=='object')return {ok:false,errors:['not_an_object']};
 if(f.schema!==GOLD_CN_SCHEMA)e('schema');
 const tickers=Array.isArray(f.tickers)?f.tickers:[];
 if(tickers.length===0)e('tickers: empty');
 if(tickers.some(t=>typeof t!=='string'||!TICKER.test(t)))e('tickers: invalid ticker');
 if(new Set(tickers).size!==tickers.length)e('tickers: duplicate');
 const years=Array.isArray(f.fiscal_years)?f.fiscal_years:[];
 if(JSON.stringify([...years].sort())!==JSON.stringify([...CN_GOLD_FISCAL_YEARS]))e('fiscal_years: must be FY2022–FY2025');
 const concepts=Array.isArray(f.concepts)?f.concepts:[];
 if(concepts.length!==CN_GOLD_CONCEPTS.length||!CN_GOLD_CONCEPTS.every(c=>concepts.includes(c)))e('concepts: must be the fixed six');
 if(!str(f.recorded_by)||!CODE.test(f.recorded_by))e('recorded_by: code name');
 if(!str(f.reviewed_by)||!CODE.test(f.reviewed_by))e('reviewed_by: code name');
 if(f.recorded_by===f.reviewed_by)e('recorded_by == reviewed_by');
 const rows=Array.isArray(f.rows)?f.rows:[];
 const seen=new Set<string>();
 rows.forEach((r,i)=>{
  const at=`rows[${i}]`;
  if(!r||typeof r!=='object'){e(`${at}: not an object`);return;}
  const combo=`${r.ticker}|${r.fiscal_year}|${r.concept}`;
  if(!tickers.includes(r.ticker)||!years.includes(r.fiscal_year)||!(CN_GOLD_CONCEPTS as readonly string[]).includes(r.concept))e(`${at}: ${combo} outside the product`);
  if(seen.has(combo))e(`${at}: duplicate ${combo}`);seen.add(combo);
  if(typeof r.printed_value!=='string'||!PRINTED.test(r.printed_value))e(`${at}.printed_value`);
  else if(!Number.isInteger(r.printed_decimals)||r.printed_decimals<0||r.printed_decimals>6||fraction(r.printed_value)!==r.printed_decimals)e(`${at}.printed_decimals`);
  if(!CN_GOLD_MULTIPLIERS.includes(r.printed_unit_multiplier))e(`${at}.printed_unit_multiplier`);
  if(r.concept==='eps_basic'&&r.printed_unit_multiplier!==1)e(`${at}: eps multiplier must be 1`);
  if(r.column!=='本期')e(`${at}.column`);
  const s=(r.source??{}) as Partial<GoldCnSource>;
  if(!Number.isInteger(s.page)||(s.page as number)<1)e(`${at}.source.page`);
  if(typeof s.pdf_sha256!=='string'||!SHA.test(s.pdf_sha256))e(`${at}.source.pdf_sha256`);
  if(!str(s.cninfo_announcement_id))e(`${at}.source.cninfo_announcement_id`);
  if(typeof s.announcement_date!=='string'||!DATE.test(s.announcement_date)||!calendar(s.announcement_date))e(`${at}.source.announcement_date`);
  if(!str(s.document))e(`${at}.source.document`);
  if(!str(s.table))e(`${at}.source.table`);
  if(typeof s.pdf_url!=='string'||!/^https?:\/\//.test(s.pdf_url))e(`${at}.source.pdf_url`);
  const m=typeof r.tushare_source_ref==='string'?REF.exec(r.tushare_source_ref):null;
  if(!m)e(`${at}.tushare_source_ref`);
  else{
   if(m[1]!==r.ticker)e(`${at}.tushare_source_ref: ts_code ${m[1]} != ${r.ticker}`);
   if(m[2]!==`${r.fiscal_year}1231`)e(`${at}.tushare_source_ref: end_date ${m[2]} != ${r.fiscal_year}1231`);
   if(!calendar(m[2]))e(`${at}.tushare_source_ref: end_date not a calendar date`);
   if(!calendar(m[4]))e(`${at}.tushare_source_ref: ann_date ${m[4]} not a calendar date`);
   if(m[3]!==String(r.report_type??1))e(`${at}.tushare_source_ref: report_type ${m[3]} != ${r.report_type??1}`);
  }
  if(r.report_type!==undefined&&(!Number.isInteger(r.report_type)||r.report_type<1))e(`${at}.report_type`);
  if(typeof r.recorded_at!=='string'||!TS.test(r.recorded_at)||Number.isNaN(Date.parse(r.recorded_at)))e(`${at}.recorded_at`);
 });
 for(const t of tickers)for(const y of years)for(const c of CN_GOLD_CONCEPTS)if(!seen.has(`${t}|${y}|${c}`))e(`missing ${t}|${y}|${c}`);
 return errors.length>0?{ok:false,errors}:{ok:true,file:f as GoldCnFile};
}

export function printedInterval(r:Pick<GoldCnRow,'printed_value'|'printed_unit_multiplier'|'printed_decimals'>):{center:string;radius:string}{
 const mult=String(r.printed_unit_multiplier);
 return {center:mulDecimal(canonicalDecimal(r.printed_value),mult),radius:mulDecimal(canonicalDecimal(`5e-${r.printed_decimals+1}`),mult)};
}
export const autoQuarantinable=(r:Pick<GoldCnRow,'printed_unit_multiplier'|'printed_decimals'>):boolean=>r.printed_unit_multiplier===1&&r.printed_decimals===2;
export function cnPeriodOf(fy:number,concept:string):{period_start:string|null;period_end:string;duration:'12M'|'INSTANT';unit:'CNY'|'CNY/share'}{
 const def=conceptById(concept);if(!def)throw new Error(`unknown_concept:${concept}`);
 const instant=def.nature==='instant';
 return {period_start:instant?null:`${fy}-01-01`,period_end:`${fy}-12-31`,duration:instant?'INSTANT':'12M',unit:def.unitKind==='per_share'?'CNY/share':'CNY'};
}

/** §5.4 sample: valid unique tickers ascending, the first min(n, N). */
export function pickCnSample(tickers:readonly (string|null)[],n=30):string[]{
 return [...new Set(tickers.filter((t):t is string=>typeof t==='string'&&TICKER.test(t)))].sort().slice(0,Math.max(0,n));
}
/** Transcription template: the exact product, every printed/source field '<pending>' (fails validateGoldCn until filled). */
export function goldTemplate(tickers:readonly string[]):Omit<GoldCnFile,'rows'>&{rows:Record<string,unknown>[]}{
 const P='<pending>';
 return {schema:GOLD_CN_SCHEMA,tickers:[...tickers],fiscal_years:[...CN_GOLD_FISCAL_YEARS],concepts:[...CN_GOLD_CONCEPTS],recorded_by:P,reviewed_by:P,
  rows:tickers.flatMap(ticker=>CN_GOLD_FISCAL_YEARS.flatMap(fiscal_year=>CN_GOLD_CONCEPTS.map(concept=>({ticker,fiscal_year,concept,printed_value:P,printed_unit_multiplier:concept==='eps_basic'?1:P,printed_decimals:P,column:'本期',
   source:{document:P,cninfo_announcement_id:P,announcement_date:P,pdf_url:P,pdf_sha256:P,page:P,table:'主要会计数据和财务指标'},tushare_source_ref:P,recorded_at:P}))))};
}

exec
/bin/zsh -lc "node --import tsx -e \"import('./src/lib/dq/reconcile/gold-cn.ts').then(m=>console.log(Object.keys(m), typeof m.validateGoldCn))\"; find .claude scripts docs -iname '*agents*' -o -name CLAUDE.md; cat src/lib/supabase/admin.ts; rg -n 'gold-pdf|pdf_sha256|cn-gold-pdf' docs/plans/*3* docs/specs/*3* 2>/dev/null | head -45; for d in . .. ../.. ../../..; do for n in AGENTS.override.md AGENTS.md; do test "'! -f "$d/$n" || echo "$d/$n"; done; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 39ms:
[
  'CN_GOLD_CONCEPTS',
  'CN_GOLD_FISCAL_YEARS',
  'CN_GOLD_MULTIPLIERS',
  'CN_GOLD_PARSER',
  'CN_GOLD_PATH',
  'GOLD_CN_SCHEMA',
  'autoQuarantinable',
  'cnGoldKey',
  'cnPeriodOf',
  'default',
  'goldTemplate',
  'module.exports',
  'pickCnSample',
  'printedInterval',
  'validateGoldCn'
] function
.claude/agents
// ⚠️ SERVICE-ROLE CLIENT — BYPASSES ROW LEVEL SECURITY. ⚠️
//
// This client authenticates as the Supabase service_role and can read/write
// ANY row in ANY table, ignoring every RLS policy. It must ONLY be imported
// from trusted system contexts: unauthenticated webhooks that verify their own
// signatures, or admin routes after a user-session and role check has passed.
//
// Browser-originated routes must use getServerSupabase() for their access
// checks before constructing this client. Never use a request parameter or
// cookie value alone to authorize service-role access.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

function adminCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) not configured — admin client unavailable'
    );
  }
  return { url, serviceRoleKey };
}

export function getAdminSupabase() {
  const { url, serviceRoleKey } = adminCredentials();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Narrow RPC schema: the legacy Database table shapes omit Relationships/Views
// required by current supabase-js inference. Keep this new RPC fully typed
// without changing every existing table client or casting arguments to never.
type QuoteAlertDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Pick<Database['public']['Functions'], 'quote_alert_window_samples'>;
  };
};
export function getQuoteAlertSupabase() {
  const { url, serviceRoleKey } = adminCredentials();
  return createClient<QuoteAlertDatabase>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
zsh:1: no matches found: docs/plans/*3*
../../../AGENTS.md

codex
No actionable defects were identified in the new scripts or transcription workflow. The changes are consistent with the existing gold-template, ticker-selection, and raw-storage interfaces; live database selection and PDF uploads were not exercised.
No actionable defects were identified in the new scripts or transcription workflow. The changes are consistent with the existing gold-template, ticker-selection, and raw-storage interfaces; live database selection and PDF uploads were not exercised.
