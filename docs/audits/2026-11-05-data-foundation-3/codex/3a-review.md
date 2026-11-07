OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1afe0-0ad9-7422-a0e0-7f8c3fd9d4b2
--------
user
commit 7507df2
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 7507df2; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 447ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-EE80lrFL' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0aXK7Z8t' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qUOWAFbq' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-r7yuVYwu' (errno=Operation not permitted)
7507df2 feat(entities): GLEIF ISIN-LEI subset and header-driven HKEX list parsing, with live header check record
 .../2026-11-05-data-foundation-3/verification.md   | 18 +++++
 scripts/entity-keys/probe-hkex.ts                  | 15 ++++
 src/lib/entities/identifiers/gleif.test.ts         | 41 +++++++++++
 src/lib/entities/identifiers/gleif.ts              | 49 +++++++++++++
 src/lib/entities/identifiers/hkex-list.test.ts     | 78 ++++++++++++++++++++
 src/lib/entities/identifiers/hkex-list.ts          | 82 ++++++++++++++++++++++
 6 files changed, 283 insertions(+)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || { echo "$p"; cat "$p"; }; done; ls -a; git show 7507df2 --; find . -name '"'*AGENTS*' -o -name CLAUDE.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 46ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-9kDxg2UH' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xqxMZ2v3' (errno=Operation not permitted)
commit 7507df2d1dfeef1eb9f1ac774b4e8d208c8b74c1
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:00:38 2026 -0800

    feat(entities): GLEIF ISIN-LEI subset and header-driven HKEX list parsing, with live header check record
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
new file mode 100644
index 0000000..cc6c5cd
--- /dev/null
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -0,0 +1,18 @@
+# 数据底座三 · 实施前实测核对记录
+
+每节记录：核对日期、命令、原始文件 sha256、观察值、与代码假设是否一致、处置。原始文件不入库（GLEIF/HKEX 原文件在 `fill-identifiers --apply` 时入桶 `reconcile-raw`）。
+
+## Task 3a · HKEX 证券名单与 GLEIF 表头（规格 §4.1.1、§4.1.4、§14-3）
+
+核对日期 2026-11-05（服务器时间 2026-11-06 UTC）。命令：`curl -sSL -A "OsbornAlpha research osbornhello@gmail.com"` 下载到 `.claude/scratch/verify/`，再 `npx tsx scripts/entity-keys/probe-hkex.ts <file> <file-id>`。
+
+| 项 | 观察值 | 与代码一致 | 处置 |
+|---|---|---|---|
+| ListOfSecurities.xlsx sha256 / 下载日 | `9f1b9dc5d2869ee6afd9d6d8772878678843d8a8afee0146590b920269dbfe79`（1,341,530 字节，页眉 "Updated as at 06/11/2026"） | — | — |
+| 表头行号与列（probe `headerRow`、`columns`） | 表头在第 3 行（`Stock Code, Name of Securities, Category, Sub-Category, Board Lot, ISIN, …` 共 18 列）；`stockCode=0 name=1 category=2 isin=5`；17,080 行 | 列均找到。**偏差 1**：工作表声明的 `<dimension>` 是 `A1:R8`（实际 `A1:R17083`），SheetJS 默认读取只得 5 行 | `parseHkexList` 以 `nodim:true` 读取，补回归用例（改写 dimension 的夹具）；不加则只读到 1 行 |
+| ISIN 列存在、`withIsin` / `rows` | 有 ISIN 列；13,809 / 17,080（债券等无 ISIN 的行为空） | — | 港股 ISIN 可由第一份文件直接取得 |
+| `Category` 取值（含 `Equity` 的确切写法） | `Equity`（2,809）、`Real Estate Investment Trusts`、`Debt Securities`、`Equity Warrants (Main Board)`、`Equity Warrants (GEM)`、`Exchange Traded Products`、`Derivative Warrants`、`Callable Bull/Bear Contracts` | `link-ah` 按小写 `equity` 比较：一致（REIT/权证类不被误含） | `HKEX_EQUITY_CATEGORY` 取 `equity`（Task 7a） |
+| "ISINs assigned by HKEX" URL、表头、`withIsin` | `https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-HKEX/isinsehk.xls`（.xls，sha256 `374cb4b5c56e984015616fc8b764d01465c4eace931479e995461b59d480ed96`，1,671,168 字节）；表头第 18 行 `Stocks, ISIN Code, HK Stock Code, Type, …`（第 75 行再出现一次表头）；5,333 行、5,333 带 ISIN | **偏差 2**：列名是 `HK Stock Code` / `Stocks`，不是 `Stock Code` / `Name of Securities`；文件是 `.xls` | `parseHkexList` 接受 `hk stock code` 与 `stocks`，跳过重复表头行，补用例；`HKEX_LIST_FILES` 的 `file` 名改为 `isinsehk.xls`，`url` 写回 |
+| "Other Numbering Agencies" URL、表头、`withIsin` | `…/ISINs-assigned-by-Other-Numbering-Agencies/isino.xls`（sha256 `facffd9cbc16ee79d86e1ad39b484d1df3d16e7f951d3b276e3847ace9676382`，1,839,616 字节，"Update Date: 02 November 2026"）；表头第 19 行同上加 `Place of Incorporation/Depot:`、`*National Numbering Agency`；11,916 行、8,607 带有效 ISIN；3,309 行 ISIN 被拒（"Not Available" 或权证的非校验位 ISIN，如 `NLBNPHK1FT88`） | 同偏差 2 | 同上；被拒 ISIN 视为无 ISIN（可接受：这些是权证/待上市证券，不进研究股票池） |
+| 三文件合并（`mergeHkexIsins`） | 00700 → `KYG875721634`、02318 → `CNE1000003X6`、00005 → `GB0005405286`、00939 → `CNE1000002H1`、00941 → `HK0941009539`，均来自第一份；跨文件 ISIN 冲突 0 条 | — | — |
+| GLEIF zip 内文件名、首行、sha256 | 下载 `https://mapping.gleif.org/api/v2/isin-lei/latest/download`（200，`x-gleif-publish-date: 2026-11-05T08:15:08Z`，33,089,731 字节，sha256 `5d79561beef1633a2b88ed2cb4994d550d0189995f237fb09dccdd158652ba1a`）；zip 内唯一文件 `lei-isin-20261105T081508.csv`（320,581,079 字节，9,428,856 行）；首行 `LEI,ISIN`（无 BOM，LF 行尾）；Apple LEI `HWUPKR0MPOU8FGXBT394` 有 949 行（含 `US0378331005`） | 一致 | — |
diff --git a/scripts/entity-keys/probe-hkex.ts b/scripts/entity-keys/probe-hkex.ts
new file mode 100644
index 0000000..cac518f
--- /dev/null
+++ b/scripts/entity-keys/probe-hkex.ts
@@ -0,0 +1,15 @@
+/**
+ * Verification helper (spec §4.1.4, §14-3): prints how parseHkexList reads real HKEX list files.
+ *   npx tsx scripts/entity-keys/probe-hkex.ts <file.xlsx> [list_of_securities|isin_hkex|isin_other_agencies]
+ * Read-only: no network, no database.
+ */
+import {readFileSync} from 'node:fs';
+import {parseHkexList,type HkexFileId} from '../../src/lib/entities/identifiers/hkex-list';
+
+const [file,id='list_of_securities']=process.argv.slice(2);
+if(!file){console.error('usage: probe-hkex.ts <file.xlsx> [file-id]');process.exit(2);}
+const p=parseHkexList(new Uint8Array(readFileSync(file)),id as HkexFileId);
+const withIsin=p.rows.filter(r=>r.isin).length;
+const categories:Record<string,number>={};
+for(const r of p.rows)categories[r.category??'(none)']=(categories[r.category??'(none)']??0)+1;
+console.log(JSON.stringify({file,sha256:p.sha256,headerRow:p.headerRow,columns:p.columns,rows:p.rows.length,withIsin,rejected:p.rejected.length,categories,first:p.rows.slice(0,3)},null,1));
diff --git a/src/lib/entities/identifiers/gleif.test.ts b/src/lib/entities/identifiers/gleif.test.ts
new file mode 100644
index 0000000..e6a3dd4
--- /dev/null
+++ b/src/lib/entities/identifiers/gleif.test.ts
@@ -0,0 +1,41 @@
+// src/lib/entities/identifiers/gleif.test.ts
+import {describe,it,expect} from 'vitest';
+import {GLEIF_HEADER,filterGleifLines,parseGleifCsv,subsetForLeis} from './gleif';
+
+const APPLE='HWUPKR0MPOU8FGXBT394',MSFT='INR2EJN1ERAN0W5ZP974',ABSENT='5493001KJTIIGC8Y1R12';
+// US037833AK68 is an Apple bond ISIN: stage A keeps it (type judged in stage B). US0378331006 has a bad check digit.
+const LINES=[GLEIF_HEADER,`${MSFT},US5949181045`,`${APPLE},US0378331005`,`${APPLE},US037833AK68`,`${APPLE},US0378331005`,'ZZZZZZZZZZZZZZZZZZ00,US88160R1014',`${MSFT},US0378331006`];
+async function* stream(xs:string[]){for(const x of xs)yield x;}
+
+describe('subsetForLeis',()=>{
+ it('keeps wanted LEIs, dedupes, keeps bond ISINs, drops bad check digits and lists LEIs without ISINs',()=>{
+  const s=subsetForLeis(LINES,new Set([APPLE,MSFT,ABSENT]));
+  expect([...s.byLei]).toEqual([[APPLE,['US0378331005','US037833AK68']],[MSFT,['US5949181045']]]);
+  expect(s.missing).toEqual([ABSENT]);
+  expect(s.invalidIsins).toEqual([`${MSFT},US0378331006`]);
+  expect(s.csv).toBe(`LEI,ISIN\n${APPLE},US0378331005\n${APPLE},US037833AK68\n${MSFT},US5949181045\n`);
+  expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
+ });
+ it('is order independent: a shuffled input gives the same subset bytes and hash',()=>{
+  const a=subsetForLeis(LINES,new Set([APPLE,MSFT]));
+  const b=subsetForLeis([LINES[0],...LINES.slice(1).reverse()],new Set([MSFT,APPLE]));
+  expect(b.csv).toBe(a.csv);expect(b.sha256).toBe(a.sha256);
+ });
+ it('rejects a wrong header with invalid_schema',()=>{
+  expect(()=>subsetForLeis(['LEI;ISIN',`${APPLE};US0378331005`],new Set([APPLE]))).toThrow('invalid_schema');
+  expect(()=>subsetForLeis([],new Set([APPLE]))).toThrow('invalid_schema');
+ });
+ it('replays a stored subset with parseGleifCsv',()=>{
+  const s=subsetForLeis(LINES,new Set([APPLE,MSFT]));
+  expect([...parseGleifCsv(s.csv)]).toEqual([...s.byLei]);
+  expect(()=>parseGleifCsv('LEI,ISIN\nnocomma\n')).toThrow('invalid_schema');
+ });
+});
+
+describe('filterGleifLines',()=>{
+ it('strips a BOM and CR, keeps the header and the wanted lines only',async()=>{
+  const out:string[]=[];
+  for await(const l of filterGleifLines(stream([`﻿${GLEIF_HEADER}\r`,`${APPLE},US0378331005\r`,'OTHER,US5949181045\r']),new Set([APPLE])))out.push(l);
+  expect(out).toEqual([GLEIF_HEADER,`${APPLE},US0378331005`]);
+ });
+});
diff --git a/src/lib/entities/identifiers/gleif.ts b/src/lib/entities/identifiers/gleif.ts
new file mode 100644
index 0000000..fcd80af
--- /dev/null
+++ b/src/lib/entities/identifiers/gleif.ts
@@ -0,0 +1,49 @@
+// src/lib/entities/identifiers/gleif.ts
+// Stage A (spec §4.1.1): GLEIF ISIN↔LEI mapping (`LEI,ISIN` CSV, public domain). The ~300 MB file
+// is pre-filtered line by line (filterGleifLines) and the kept lines go through the landed
+// selectIsinsForLeis, which validates the header (invalid_schema). The subset is rendered
+// deterministically (sorted, deduplicated, check-digit valid) so its sha256 is stable evidence for
+// reconcile-raw. Bond ISINs are kept here: stage B (OpenFIGI) judges the security type.
+import {createHash} from 'node:crypto';
+import {selectIsinsForLeis} from '../../research/entity-keys/parsers';
+import {isValidIsin} from '../../research/entity-keys/identifiers';
+
+export const GLEIF_HEADER='LEI,ISIN';
+export const GLEIF_URL='https://mapping.gleif.org/api/v2/isin-lei/latest/download';
+export interface GleifSubset{csv:string;sha256:string;byLei:Map<string,string[]>;missing:string[];invalidIsins:string[]}
+
+const stripBom=(s:string)=>s.charCodeAt(0)===0xfeff?s.slice(1):s;
+
+/** Streams the file, yielding the header (BOM/CR stripped) and the lines whose LEI is wanted. */
+export async function* filterGleifLines(lines:AsyncIterable<string>,leis:ReadonlySet<string>):AsyncGenerator<string>{
+ let first=true;
+ for await(const raw of lines){
+  const line=raw.replace(/\r$/,'');
+  if(first){first=false;yield stripBom(line);continue;}
+  const comma=line.indexOf(',');
+  if(comma>0&&leis.has(line.slice(0,comma)))yield line;
+ }
+}
+
+/** Header + candidate lines → validated subset. Throws invalid_schema (landed parser) on a wrong or missing header. */
+export function subsetForLeis(lines:Iterable<string>,leis:ReadonlySet<string>):GleifSubset{
+ const {found}=selectIsinsForLeis(lines,new Set(leis));
+ const byLei=new Map<string,string[]>();
+ const invalidIsins:string[]=[];
+ for(const lei of Object.keys(found).sort()){
+  const isins=[...new Set(found[lei].map(s=>s.trim().toUpperCase()))].sort().filter(i=>{
+   if(isValidIsin(i))return true;
+   invalidIsins.push(`${lei},${i}`);return false;
+  });
+  if(isins.length)byLei.set(lei,isins);
+ }
+ const csv=[GLEIF_HEADER,...[...byLei].flatMap(([lei,isins])=>isins.map(i=>`${lei},${i}`))].join('\n')+'\n';
+ return {csv,sha256:createHash('sha256').update(csv,'utf8').digest('hex'),byLei,missing:[...leis].filter(l=>!byLei.has(l)).sort(),invalidIsins:invalidIsins.sort()};
+}
+
+/** Replays a stored subset (every LEI in it). */
+export function parseGleifCsv(csv:string):Map<string,string[]>{
+ const lines=stripBom(csv).split('\n').map(l=>l.replace(/\r$/,'')).filter((l,i)=>i===0||l!=='');
+ const leis=new Set(lines.slice(1).map(l=>{const c=l.indexOf(',');return c<0?l:l.slice(0,c);}));
+ return subsetForLeis(lines,leis).byLei;
+}
diff --git a/src/lib/entities/identifiers/hkex-list.test.ts b/src/lib/entities/identifiers/hkex-list.test.ts
new file mode 100644
index 0000000..f99c4b0
--- /dev/null
+++ b/src/lib/entities/identifiers/hkex-list.test.ts
@@ -0,0 +1,78 @@
+// src/lib/entities/identifiers/hkex-list.test.ts
+import * as XLSX from 'xlsx';
+import {describe,it,expect} from 'vitest';
+import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList} from './hkex-list';
+
+/** Builds an in-memory .xlsx so no binary fixture is committed. */
+const book=(rows:unknown[][])=>{
+ const wb=XLSX.utils.book_new();
+ XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'ListOfSecurities');
+ return new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'}) as ArrayBuffer);
+};
+// Header layout mirrors ListOfSecurities.xlsx (title rows, then the header row); values are real
+// HKEX codes/ISINs (Tencent, Ping An H, HSBC) with one bad code and one bad ISIN check digit.
+const LIST=book([
+ ['List of Securities'],['Updated as at 04/11/2026'],[],
+ ['Stock Code','Name of Securities','Category','Sub-Category','Board Lot','ISIN'],
+ ['00700','TENCENT','Equity','Equity Securities (Main Board)','100','KYG875721634'],
+ [2318,'PING AN','Equity','Equity Securities (Main Board)','500','CNE1000003X6'],
+ ['04335','HKGB 2.48 2030','Debt Securities','Government Bonds','50000',''],
+ ['ABC','BAD CODE','Equity','',null,null],
+ ['00005','HSBC HOLDINGS','Equity','','400','GB0005405280'],
+]);
+
+describe('parseHkexList',()=>{
+ it('finds columns by header text, pads stock codes, validates ISINs and reports rejects',()=>{
+  const p=parseHkexList(LIST,'list_of_securities');
+  expect(p.headerRow).toBe(4);
+  expect(p.columns).toEqual({stockCode:0,name:1,category:2,isin:5});
+  expect(p.rows.map(r=>[r.stockCode,r.name,r.category,r.isin])).toEqual([
+   ['00700','TENCENT','Equity','KYG875721634'],['02318','PING AN','Equity','CNE1000003X6'],
+   ['04335','HKGB 2.48 2030','Debt Securities',null],['00005','HSBC HOLDINGS','Equity',null],
+  ]);
+  expect(p.rejected).toEqual([{row:8,reason:'invalid_stock_code'},{row:9,reason:'invalid_isin'}]);
+  expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
+ });
+ it('accepts any column order and a file without an ISIN column',()=>{
+  const p=parseHkexList(book([['Category','Name of Securities','Stock Code'],['Equity','TENCENT','700']]),'list_of_securities');
+  expect(p.columns).toEqual({stockCode:2,name:1,category:0,isin:null});
+  expect(p.rows).toEqual([{stockCode:'00700',name:'TENCENT',category:'Equity',isin:null,row:2}]);
+ });
+ it('reads every row even when the sheet declares a stale <dimension> (live HKEX file: A1:R8 for 17k rows)',()=>{
+  const wb=XLSX.utils.book_new();
+  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Stock Code','ISIN'],['00001','KYG217651051'],['00002','HK0002007356'],['00003','HK0003000038']]),'S');
+  // Stored (uncompressed) zip: the sheet XML is plain bytes, so the dimension can be patched in place at equal length.
+  const bytes=new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx',compression:false}) as ArrayBuffer);
+  const xml=Buffer.from(bytes).toString('latin1'),from='<dimension ref="A1:B4"/>';
+  expect(xml).toContain(from);
+  const patched=new Uint8Array(Buffer.from(xml.replace(from,'<dimension ref="A1:B2"/>'),'latin1'));
+  expect(XLSX.read(patched,{type:'array'}).Sheets.S['!ref']).toBe('A1:B2');   // precondition: the default reader is fooled
+  expect(parseHkexList(patched,'list_of_securities').rows.map(r=>r.stockCode)).toEqual(['00001','00002','00003']);
+ });
+ it('reads the HKEX ISIN workbooks ("HK Stock Code" / "ISIN Code" / "Stocks" headers, repeated header rows, preamble)',()=>{
+  const p=parseHkexList(book([['ISINs assigned by Other Numbering Agencies'],[],['Stocks ','ISIN Code','HK Stock Code','Type '],['TENCENT HOLDINGS LIMITED','KYG875721634','00700','ORD SH'],['Stocks','ISIN Code','HK Stock Code','Type'],['AB&B BIO-TECH CO., LTD. JS','CNE1000071P9','02627','ORD SH']]),'isin_other_agencies');
+  expect(p.columns).toEqual({stockCode:2,name:0,category:null,isin:1});
+  expect(p.rows.map(r=>[r.stockCode,r.name,r.isin])).toEqual([['00700','TENCENT HOLDINGS LIMITED','KYG875721634'],['02627','AB&B BIO-TECH CO., LTD. JS','CNE1000071P9']]);
+  expect(p.rejected).toEqual([]);
+ });
+ it('fails with invalid_schema when no header row names "Stock Code"',()=>{
+  expect(()=>parseHkexList(book([['Code','Name'],['00700','TENCENT']]),'list_of_securities')).toThrow('invalid_schema');
+ });
+});
+
+describe('mergeHkexIsins',()=>{
+ it('takes the ISIN from the highest-priority file and records disagreements',()=>{
+  const list=parseHkexList(LIST,'list_of_securities');
+  const other=parseHkexList(book([['Stock Code','ISIN Code'],['00700','US88160R1014'],['00941','HK0941009539']]),'isin_hkex');
+  const m=mergeHkexIsins([other,list]);
+  expect(m.hasIsinColumn).toBe(true);
+  expect(m.byCode.get('00700')).toMatchObject({isin:'KYG875721634',file:'list_of_securities',row:5});
+  expect(m.byCode.get('00941')).toMatchObject({isin:'HK0941009539',file:'isin_hkex'});
+  expect(m.conflicts).toEqual([{stockCode:'00700',isins:[{file:'list_of_securities',isin:'KYG875721634'},{file:'isin_hkex',isin:'US88160R1014'}]}]);
+  expect(HKEX_LIST_FILES.map(f=>f.id)).toEqual(['list_of_securities','isin_hkex','isin_other_agencies']);
+ });
+ it('reports hasIsinColumn=false when no file carries ISINs',()=>{
+  const m=mergeHkexIsins([parseHkexList(book([['Stock Code','Name of Securities'],['700','TENCENT']]),'list_of_securities')]);
+  expect(m.hasIsinColumn).toBe(false);expect(m.byCode.size).toBe(0);
+ });
+});
diff --git a/src/lib/entities/identifiers/hkex-list.ts b/src/lib/entities/identifiers/hkex-list.ts
new file mode 100644
index 0000000..1a7a581
--- /dev/null
+++ b/src/lib/entities/identifiers/hkex-list.ts
@@ -0,0 +1,82 @@
+// src/lib/entities/identifiers/hkex-list.ts
+// Stage D (spec §4.1.4): HKEX securities lists → (stock code, name, category, ISIN). Columns are
+// located by header text, never by position (HKEX changed the layout; circular CT/118/25 added ISIN
+// to ListOfSecurities.xlsx). A file without an ISIN column still yields names and categories, which
+// the A+H name match uses (§4.2.2). ISIN precedence follows HKEX_LIST_FILES priority.
+import {createHash} from 'node:crypto';
+import * as XLSX from 'xlsx';
+import {isValidIsin} from '../../research/entity-keys/identifiers';
+
+export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
+export type HkexFileId='list_of_securities'|'isin_hkex'|'isin_other_agencies';
+export interface HkexListFile{id:HkexFileId;file:string;url:string|null;priority:number}
+/** Expected file names inside `--hkex <dir>`. URLs and file names verified 2026-11-05 (docs/audits/2026-11-05-data-foundation-3/verification.md). */
+export const HKEX_LIST_FILES:readonly HkexListFile[]=[
+ {id:'list_of_securities',file:'ListOfSecurities.xlsx',url:'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx',priority:1},
+ {id:'isin_hkex',file:'isinsehk.xls',url:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-HKEX/isinsehk.xls',priority:2},
+ {id:'isin_other_agencies',file:'isino.xls',url:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-Other-Numbering-Agencies/isino.xls',priority:3},
+];
+export interface HkexListRow{stockCode:string;name:string|null;category:string|null;isin:string|null;row:number}
+export interface HkexListParse{
+ file:HkexFileId;sha256:string;headerRow:number;
+ columns:{stockCode:number;name:number|null;category:number|null;isin:number|null};
+ rows:HkexListRow[];rejected:{row:number;reason:'invalid_stock_code'|'invalid_isin'}[];
+}
+export interface HkexIsin{isin:string;file:HkexFileId;sha256:string;row:number}
+
+const norm=(v:unknown)=>v==null?'':String(v).replace(/\s+/g,' ').trim().toLowerCase();
+/** ListOfSecurities.xlsx says "Stock Code"; the two ISIN workbooks (verified 2026-11-05) say "HK Stock Code". */
+const isCodeHeader=(h:string)=>h==='stock code'||h==='hk stock code';
+const text=(v:unknown)=>v==null||String(v).trim()===''?null:String(v).trim();
+
+export function parseHkexList(bytes:Uint8Array,file:HkexFileId):HkexListParse{
+ let grid:unknown[][];
+ try{
+  // nodim: the live HKEX file declares a stale <dimension> (A1:R8 for 17k rows), which would truncate the grid.
+  const wb=XLSX.read(bytes,{type:'array',nodim:true} as XLSX.ParsingOptions);
+  const ws=wb.Sheets[wb.SheetNames[0]];
+  if(!ws)throw new Error('no sheet');
+  grid=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,raw:false,defval:null,blankrows:true});
+ }catch{throw new Error('invalid_schema');}
+ const headerIdx=grid.slice(0,30).findIndex(r=>Array.isArray(r)&&r.some(c=>isCodeHeader(norm(c))));
+ if(headerIdx<0)throw new Error('invalid_schema');
+ const header=(grid[headerIdx] as unknown[]).map(norm);
+ const find=(pred:(h:string)=>boolean)=>{const i=header.findIndex(pred);return i<0?null:i;};
+ const columns={
+  stockCode:header.findIndex(isCodeHeader),
+  name:find(h=>h==='name of securities'||h==='name of security'||h==='name'||h==='stocks'),
+  category:find(h=>h==='category'),
+  isin:find(h=>h.startsWith('isin')),
+ };
+ const rows:HkexListRow[]=[];
+ const rejected:HkexListParse['rejected']=[];
+ for(let i=headerIdx+1;i<grid.length;i++){
+  const r=grid[i];
+  if(!Array.isArray(r)||r.every(c=>text(c)===null))continue;
+  const code=text(r[columns.stockCode])??'';
+  if(isCodeHeader(norm(code)))continue;   // the ISIN workbooks repeat the header above their second table
+  if(!/^\d{1,5}$/.test(code)){rejected.push({row:i+1,reason:'invalid_stock_code'});continue;}
+  const cell=(c:number|null)=>c===null?null:text(r[c]);
+  let isin=cell(columns.isin)?.toUpperCase()??null;
+  if(isin!==null&&!isValidIsin(isin)){rejected.push({row:i+1,reason:'invalid_isin'});isin=null;}
+  rows.push({stockCode:code.padStart(5,'0'),name:cell(columns.name),category:cell(columns.category),isin,row:i+1});
+ }
+ return {file,sha256:createHash('sha256').update(bytes).digest('hex'),headerRow:headerIdx+1,columns,rows,rejected};
+}
+
+/** Stock code → ISIN by file priority (first file wins); a different ISIN in a later file is listed in conflicts. */
+export function mergeHkexIsins(parses:readonly HkexListParse[]):{byCode:Map<string,HkexIsin>;conflicts:{stockCode:string;isins:{file:HkexFileId;isin:string}[]}[];hasIsinColumn:boolean}{
+ const prio=(f:HkexFileId)=>HKEX_LIST_FILES.find(x=>x.id===f)!.priority;
+ const ordered=[...parses].sort((a,b)=>prio(a.file)-prio(b.file));
+ const byCode=new Map<string,HkexIsin>();
+ const seen=new Map<string,{file:HkexFileId;isin:string}[]>();
+ for(const p of ordered)for(const r of p.rows){
+  if(!r.isin)continue;
+  const list=seen.get(r.stockCode)??[];
+  if(!list.some(x=>x.isin===r.isin))list.push({file:p.file,isin:r.isin});
+  seen.set(r.stockCode,list);
+  if(!byCode.has(r.stockCode))byCode.set(r.stockCode,{isin:r.isin,file:p.file,sha256:p.sha256,row:r.row});
+ }
+ const conflicts=[...seen].filter(([,l])=>l.length>1).map(([stockCode,isins])=>({stockCode,isins})).sort((a,b)=>a.stockCode<b.stockCode?-1:1);
+ return {byCode,conflicts,hasIsinColumn:parses.some(p=>p.columns.isin!==null)};
+}

exec
/bin/zsh -lc "cat src/lib/research/entity-keys/parsers.ts; cat package.json; rg 'nodim' node_modules/xlsx -n | head; rg 'subsetForLeis|parseHkexList|mergeHkexIsins' src scripts; ls docs/specs | tail; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'; cat /Users/osborn/.agents/skills/using-agent-skills/SKILL.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/**
 * WP-A2 parsers for the two public identifier sources. Pure functions over
 * already-downloaded content; nothing here touches the network or the database.
 */
import { fail } from '../ingest/pa-v1/json.js';
import { normalizeCik } from './identifiers';

export interface SecTickerHit { cik: string; title: string }
export interface SecTickerResult { found: Record<string, SecTickerHit>; missing: string[] }

/** SEC `company_tickers.json`: an object of {cik_str, ticker, title} rows keyed by index. */
export function parseSecCompanyTickers(json: string, tickers: string[]): SecTickerResult {
  let doc: unknown;
  try { doc = JSON.parse(json); } catch { fail('invalid_schema'); }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) fail('invalid_schema');
  const byTicker = new Map<string, SecTickerHit>();
  for (const row of Object.values(doc as Record<string, unknown>)) {
    const r = row as { cik_str?: unknown; ticker?: unknown; title?: unknown };
    const ticker = r?.ticker, title = r?.title, cik = r?.cik_str;
    if (typeof ticker !== 'string' || typeof title !== 'string' || (typeof cik !== 'number' && typeof cik !== 'string')) { fail('invalid_schema'); continue; }
    byTicker.set(ticker.toUpperCase(), { cik: normalizeCik(cik), title });
  }
  const found: Record<string, SecTickerHit> = {}, missing: string[] = [];
  for (const t of tickers) {
    const hit = byTicker.get(t.toUpperCase());
    if (hit) found[t] = hit; else missing.push(t);
  }
  return { found, missing };
}

export interface IsinLeiResult { found: Record<string, string[]>; missing: string[] }

/** GLEIF ISIN↔LEI mapping (`LEI,ISIN` CSV), consumed line by line so the ~300 MB file never sits in memory. */
export function selectIsinsForLeis(lines: Iterable<string>, leis: Set<string>): IsinLeiResult {
  const found: Record<string, string[]> = {};
  let first = true;
  for (const raw of lines) {
    const line = raw.replace(/\r?\n$/, '');
    if (first) { first = false; if (line !== 'LEI,ISIN') fail('invalid_schema'); continue; }
    if (line === '') continue;
    const comma = line.indexOf(',');
    if (comma < 0) fail('invalid_schema');
    const lei = line.slice(0, comma), isin = line.slice(comma + 1);
    if (leis.has(lei)) (found[lei] ??= []).push(isin);
  }
  if (first) fail('invalid_schema');
  return { found, missing: [...leis].filter(l => !found[l]) };
}

export interface SecExchangeRow { cik: string; name: string; ticker: string; exchange: string }
export interface SecExchangeParse {
  rows: SecExchangeRow[];
  rejected: { index: number; reason: 'invalid_cik' | 'missing_ticker' | 'missing_name' }[];
}

/** A CIK that normalizeCik accepts (1–10 digits, not zero; number or digit string), unpadded. */
function secExchangeCik(v: unknown): string | null {
  try { return normalizeCik(v); } catch { return null; }
}

/** Upper bounds checked before the JSON is parsed / the plan is built. */
export const MAX_SEC_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_SEC_ROWS = 100_000;

const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * SEC `company_tickers_exchange.json`: `{fields:[...], data:[[...], ...]}` with at least
 * cik/name/ticker/exchange columns. Malformed rows are listed in `rejected`, never coerced.
 * Throws file_too_large above MAX_SEC_FILE_BYTES (before parsing) and too_many_rows above MAX_SEC_ROWS.
 */
export function parseSecCompanyTickersExchange(json: string): SecExchangeParse {
  if (json.length > MAX_SEC_FILE_BYTES || Buffer.byteLength(json, 'utf8') > MAX_SEC_FILE_BYTES) throw new Error('file_too_large');
  let doc: unknown;
  try { doc = JSON.parse(json); } catch { throw new Error('invalid_sec_exchange_file'); }
  const d = doc as { fields?: unknown; data?: unknown } | null;
  if (typeof d !== 'object' || d === null || !Array.isArray(d.fields) || !Array.isArray(d.data)) throw new Error('invalid_sec_exchange_file');
  const fields = d.fields as unknown[];
  const col = (name: string) => fields.indexOf(name);
  const [ci, ni, ti, ei] = ['cik', 'name', 'ticker', 'exchange'].map(col);
  if (ci < 0 || ni < 0 || ti < 0 || ei < 0) throw new Error('invalid_sec_exchange_file');
  if (d.data.length > MAX_SEC_ROWS) throw new Error('too_many_rows');
  const out: SecExchangeParse = { rows: [], rejected: [] };
  (d.data as unknown[]).forEach((raw, index) => {
    const r = Array.isArray(raw) ? raw : [];
    const cik = secExchangeCik(r[ci]);
    if (cik === null) { out.rejected.push({ index, reason: 'invalid_cik' }); return; }
    const ticker = nonEmpty(r[ti]);
    if (ticker === null) { out.rejected.push({ index, reason: 'missing_ticker' }); return; }
    const name = nonEmpty(r[ni]);
    if (name === null) { out.rejected.push({ index, reason: 'missing_name' }); return; }
    const exchange = typeof r[ei] === 'string' ? (r[ei] as string).trim() : '';
    out.rows.push({ cik, name, ticker, exchange });
  });
  return out;
}
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
node_modules/xlsx/types/index.d.ts:242:    nodim?: boolean;
node_modules/xlsx/xlsx.mjs:15891:		if(ref && !(opts && opts.nodim)) parse_ws_xml_dim(s, ref[1]);
node_modules/xlsx/xlsx.mjs:15931:	if(opts && opts.nodim) refguess.s.c = refguess.s.r = 0;
node_modules/xlsx/xlsx.mjs:16216:		if(!opts.nodim) {
node_modules/xlsx/xlsx.mjs:16359:			if(opts.nodim) {
node_modules/xlsx/xlsx.js:15802:		if(ref && !(opts && opts.nodim)) parse_ws_xml_dim(s, ref[1]);
node_modules/xlsx/xlsx.js:15842:	if(opts && opts.nodim) refguess.s.c = refguess.s.r = 0;
node_modules/xlsx/xlsx.js:16127:		if(!opts.nodim) {
node_modules/xlsx/xlsx.js:16270:			if(opts.nodim) {
scripts/entity-keys/probe-hkex.ts: * Verification helper (spec §4.1.4, §14-3): prints how parseHkexList reads real HKEX list files.
scripts/entity-keys/probe-hkex.ts:import {parseHkexList,type HkexFileId} from '../../src/lib/entities/identifiers/hkex-list';
scripts/entity-keys/probe-hkex.ts:const p=parseHkexList(new Uint8Array(readFileSync(file)),id as HkexFileId);
src/lib/entities/identifiers/gleif.ts:export function subsetForLeis(lines:Iterable<string>,leis:ReadonlySet<string>):GleifSubset{
src/lib/entities/identifiers/gleif.ts: return subsetForLeis(lines,leis).byLei;
src/lib/entities/identifiers/gleif.test.ts:import {GLEIF_HEADER,filterGleifLines,parseGleifCsv,subsetForLeis} from './gleif';
src/lib/entities/identifiers/gleif.test.ts:describe('subsetForLeis',()=>{
src/lib/entities/identifiers/gleif.test.ts:  const s=subsetForLeis(LINES,new Set([APPLE,MSFT,ABSENT]));
src/lib/entities/identifiers/gleif.test.ts:  const a=subsetForLeis(LINES,new Set([APPLE,MSFT]));
src/lib/entities/identifiers/gleif.test.ts:  const b=subsetForLeis([LINES[0],...LINES.slice(1).reverse()],new Set([MSFT,APPLE]));
src/lib/entities/identifiers/gleif.test.ts:  expect(()=>subsetForLeis(['LEI;ISIN',`${APPLE};US0378331005`],new Set([APPLE]))).toThrow('invalid_schema');
src/lib/entities/identifiers/gleif.test.ts:  expect(()=>subsetForLeis([],new Set([APPLE]))).toThrow('invalid_schema');
src/lib/entities/identifiers/gleif.test.ts:  const s=subsetForLeis(LINES,new Set([APPLE,MSFT]));
src/lib/entities/identifiers/hkex-list.test.ts:import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList} from './hkex-list';
src/lib/entities/identifiers/hkex-list.test.ts:describe('parseHkexList',()=>{
src/lib/entities/identifiers/hkex-list.test.ts:  const p=parseHkexList(LIST,'list_of_securities');
src/lib/entities/identifiers/hkex-list.test.ts:  const p=parseHkexList(book([['Category','Name of Securities','Stock Code'],['Equity','TENCENT','700']]),'list_of_securities');
src/lib/entities/identifiers/hkex-list.test.ts:  expect(parseHkexList(patched,'list_of_securities').rows.map(r=>r.stockCode)).toEqual(['00001','00002','00003']);
src/lib/entities/identifiers/hkex-list.test.ts:  const p=parseHkexList(book([['ISINs assigned by Other Numbering Agencies'],[],['Stocks ','ISIN Code','HK Stock Code','Type '],['TENCENT HOLDINGS LIMITED','KYG875721634','00700','ORD SH'],['Stocks','ISIN Code','HK Stock Code','Type'],['AB&B BIO-TECH CO., LTD. JS','CNE1000071P9','02627','ORD SH']]),'isin_other_agencies');
src/lib/entities/identifiers/hkex-list.test.ts:  expect(()=>parseHkexList(book([['Code','Name'],['00700','TENCENT']]),'list_of_securities')).toThrow('invalid_schema');
src/lib/entities/identifiers/hkex-list.test.ts:describe('mergeHkexIsins',()=>{
src/lib/entities/identifiers/hkex-list.test.ts:  const list=parseHkexList(LIST,'list_of_securities');
src/lib/entities/identifiers/hkex-list.test.ts:  const other=parseHkexList(book([['Stock Code','ISIN Code'],['00700','US88160R1014'],['00941','HK0941009539']]),'isin_hkex');
src/lib/entities/identifiers/hkex-list.test.ts:  const m=mergeHkexIsins([other,list]);
src/lib/entities/identifiers/hkex-list.test.ts:  const m=mergeHkexIsins([parseHkexList(book([['Stock Code','Name of Securities'],['700','TENCENT']]),'list_of_securities')]);
src/lib/entities/identifiers/hkex-list.ts:export function parseHkexList(bytes:Uint8Array,file:HkexFileId):HkexListParse{
src/lib/entities/identifiers/hkex-list.ts:export function mergeHkexIsins(parses:readonly HkexListParse[]):{byCode:Map<string,HkexIsin>;conflicts:{stockCode:string;isins:{file:HkexFileId;isin:string}[]}[];hasIsinColumn:boolean}{
ls: docs/specs: No such file or directory
---
name: using-agent-skills
description: Discovers and invokes agent skills. Use when starting a session or when you need to discover which skill applies to the current task. This is the meta-skill that governs how all other skills are discovered and invoked.
---

# Using Agent Skills

## Overview

Agent Skills is a collection of engineering workflow skills organized by development phase. Each skill encodes a specific process that senior engineers follow. This meta-skill helps you discover and apply the right skill for your current task.

## Skill Discovery

When a task arrives, identify the development phase and apply the corresponding skill:

```
Task arrives
    │
    ├── Vague idea/need refinement? ──→ idea-refine
    ├── New project/feature/change? ──→ spec-driven-development
    ├── Have a spec, need tasks? ──────→ planning-and-task-breakdown
    ├── Implementing code? ────────────→ incremental-implementation
    │   ├── UI work? ─────────────────→ frontend-ui-engineering
    │   ├── API work? ────────────────→ api-and-interface-design
    │   ├── Need better context? ─────→ context-engineering
    │   └── Need doc-verified code? ───→ source-driven-development
    ├── Writing/running tests? ────────→ test-driven-development
    │   └── Browser-based? ───────────→ browser-testing-with-devtools
    ├── Something broke? ──────────────→ debugging-and-error-recovery
    ├── Reviewing code? ───────────────→ code-review-and-quality
    │   ├── Security concerns? ───────→ security-and-hardening
    │   └── Performance concerns? ────→ performance-optimization
    ├── Committing/branching? ─────────→ git-workflow-and-versioning
    ├── CI/CD pipeline work? ──────────→ ci-cd-and-automation
    ├── Writing docs/ADRs? ───────────→ documentation-and-adrs
    └── Deploying/launching? ─────────→ shipping-and-launch
```

## Core Operating Behaviors

These behaviors apply at all times, across all skills. They are non-negotiable.

### 1. Surface Assumptions

Before implementing anything non-trivial, explicitly state your assumptions:

```
ASSUMPTIONS I'M MAKING:
1. [assumption about requirements]
2. [assumption about architecture]
3. [assumption about scope]
→ Correct me now or I'll proceed with these.
```

Don't silently fill in ambiguous requirements. The most common failure mode is making wrong assumptions and running with them unchecked. Surface uncertainty early — it's cheaper than rework.

### 2. Manage Confusion Actively

When you encounter inconsistencies, conflicting requirements, or unclear specifications:

1. **STOP.** Do not proceed with a guess.
2. Name the specific confusion.
3. Present the tradeoff or ask the clarifying question.
4. Wait for resolution before continuing.

**Bad:** Silently picking one interpretation and hoping it's right.
**Good:** "I see X in the spec but Y in the existing code. Which takes precedence?"

### 3. Push Back When Warranted

You are not a yes-machine. When an approach has clear problems:

- Point out the issue directly
- Explain the concrete downside (quantify when possible — "this adds ~200ms latency" not "this might be slower")
- Propose an alternative
- Accept the human's decision if they override with full information

Sycophancy is a failure mode. "Of course!" followed by implementing a bad idea helps no one. Honest technical disagreement is more valuable than false agreement.

### 4. Enforce Simplicity

Your natural tendency is to overcomplicate. Actively resist it.

Before finishing any implementation, ask:
- Can this be done in fewer lines?
- Are these abstractions earning their complexity?
- Would a staff engineer look at this and say "why didn't you just..."?

If you build 1000 lines and 100 would suffice, you have failed. Prefer the boring, obvious solution. Cleverness is expensive.

### 5. Maintain Scope Discipline

Touch only what you're asked to touch.

Do NOT:
- Remove comments you don't understand
- "Clean up" code orthogonal to the task
- Refactor adjacent systems as a side effect
- Delete code that seems unused without explicit approval
- Add features not in the spec because they "seem useful"

Your job is surgical precision, not unsolicited renovation.

### 6. Verify, Don't Assume

Every skill includes a verification step. A task is not complete until verification passes. "Seems right" is never sufficient — there must be evidence (passing tests, build output, runtime data).

## Failure Modes to Avoid

These are the subtle errors that look like productivity but create problems:

1. Making wrong assumptions without checking
2. Not managing your own confusion — plowing ahead when lost
3. Not surfacing inconsistencies you notice
4. Not presenting tradeoffs on non-obvious decisions
5. Being sycophantic ("Of course!") to approaches with clear problems
6. Overcomplicating code and APIs
7. Modifying code or comments orthogonal to the task
8. Removing things you don't fully understand
9. Building without a spec because "it's obvious"
10. Skipping verification because "it looks right"

## Skill Rules

1. **Check for an applicable skill before starting work.** Skills encode processes that prevent common mistakes.

2. **Skills are workflows, not suggestions.** Follow the steps in order. Don't skip verification steps.

3. **Multiple skills can apply.** A feature implementation might involve `idea-refine` → `spec-driven-development` → `planning-and-task-breakdown` → `incremental-implementation` → `test-driven-development` → `code-review-and-quality` → `shipping-and-launch` in sequence.

4. **When in doubt, start with a spec.** If the task is non-trivial and there's no spec, begin with `spec-driven-development`.

## Lifecycle Sequence

For a complete feature, the typical skill sequence is:

```
1. idea-refine                 → Refine vague ideas
2. spec-driven-development     → Define what we're building
3. planning-and-task-breakdown → Break into verifiable chunks
4. context-engineering         → Load the right context
5. source-driven-development   → Verify against official docs
6. incremental-implementation  → Build slice by slice
7. test-driven-development     → Prove each slice works
8. code-review-and-quality     → Review before merge
9. git-workflow-and-versioning → Clean commit history
10. documentation-and-adrs     → Document decisions
11. shipping-and-launch        → Deploy safely
```

Not every task needs every skill. A bug fix might only need: `debugging-and-error-recovery` → `test-driven-development` → `code-review-and-quality`.

## Quick Reference

| Phase | Skill | One-Line Summary |
|-------|-------|-----------------|
| Define | idea-refine | Refine ideas through structured divergent and convergent thinking |
| Define | spec-driven-development | Requirements and acceptance criteria before code |
| Plan | planning-and-task-breakdown | Decompose into small, verifiable tasks |
| Build | incremental-implementation | Thin vertical slices, test each before expanding |
| Build | source-driven-development | Verify against official docs before implementing |
| Build | context-engineering | Right context at the right time |
| Build | frontend-ui-engineering | Production-quality UI with accessibility |
| Build | api-and-interface-design | Stable interfaces with clear contracts |
| Verify | test-driven-development | Failing test first, then make it pass |
| Verify | browser-testing-with-devtools | Chrome DevTools MCP for runtime verification |
| Verify | debugging-and-error-recovery | Reproduce → localize → fix → guard |
| Review | code-review-and-quality | Five-axis review with quality gates |
| Review | security-and-hardening | OWASP prevention, input validation, least privilege |
| Review | performance-optimization | Measure first, optimize only what matters |
| Ship | git-workflow-and-versioning | Atomic commits, clean history |
| Ship | ci-cd-and-automation | Automated quality gates on every change |
| Ship | documentation-and-adrs | Document the why, not just the what |
| Ship | shipping-and-launch | Pre-launch checklist, monitoring, rollback plan |

exec
/bin/zsh -lc "./node_modules/.bin/vitest run src/lib/entities/identifiers/gleif.test.ts src/lib/entities/identifiers/hkex-list.test.ts; rg -n '4.1.4|Task 3a|mergeHkex|GLEIF' docs/plans/*foundation* | head -45" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 396ms:
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/entities/identifiers/gleif.test.ts (0 test)
 ❯ src/lib/entities/identifiers/hkex-list.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/entities/identifiers/gleif.test.ts [ src/lib/entities/identifiers/gleif.test.ts ]
 FAIL  src/lib/entities/identifiers/hkex-list.test.ts [ src/lib/entities/identifiers/hkex-list.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/3VlabASWgrc5_DyvcYaK_/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  00:01:30
   Duration  103ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)

zsh:1: no matches found: docs/plans/*foundation*

exec
/bin/zsh -lc "rg -l '4.1.4|Task 3a' docs | head -15; cat src/lib/research/entity-keys/identifiers.ts | tail -65; ls .claude; test "'! -f /Users/osborn/.codex/config.toml || grep -n '"'project_doc' /Users/osborn/.codex/config.toml" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
docs/superpowers/specs/2026-09-26-collectors-design.md
docs/runbooks/data-foundation.md
docs/superpowers/specs/2026-11-04-foreign-research-design.md
docs/audits/2026-11-04-data-foundation-2/09-codex-spec-audit-round5.md
docs/research-os/2026-07-05-phase5-postgres-deploy.md
docs/audits/2026-11-04-data-foundation-2/01-codex-spec-audit-round1.md
docs/superpowers/specs/2026-11-04-company-research-design.md
docs/audits/2026-11-04-company-research/02-codex-round2.md
docs/audits/2026-11-04-data-foundation-2/03-codex-spec-audit-round2.md
docs/superpowers/specs/2026-10-18-llm-registry-adoption-design.md
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md
docs/audits/2026-11-04-company-research/01-codex-round1.md
docs/audits/2026-11-04-evals-gold-sets/01-codex-round1.md
docs/audits/2026-11-04-data-foundation-2/05-codex-spec-audit-round3.md
docs/superpowers/specs/2026-07-15-beta-report-completion-design.md
/**
 * WP-A2 identifier check digits. The database only constrains shape; these
 * pure functions are the authority on validity for ISIN, LEI, USCI and CIK.
 */
// Same error shape as ingest/pa-v1/json.js fail(), without importing it: that module pulls in
// node:crypto and this file is also bundled for the browser (research setup wizard).
const fail = (code: string): never => { throw Object.assign(new Error(code), { code, recovery: 'Check the source and retry.' }); };

const base36 = (s: string) => [...s].map(c => parseInt(c, 36).toString()).join('');

/** ISO 6166: letters → two digits, then Luhn over the whole expansion. */
export function isValidIsin(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) return false;
  const digits = base36(value);
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d *= 2;
    total += Math.floor(d / 10) + (d % 10);
  }
  return total % 10 === 0;
}

/** ISO 17442: letters → two digits, whole number mod 97 must equal 1. */
export function isValidLei(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Z0-9]{18}[0-9]{2}$/.test(value)) return false;
  let remainder = 0;
  for (const ch of base36(value)) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

const USCI_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const USCI_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

/** GB 32100-2015 统一社会信用代码: 17 weighted characters + mod-31 check character. */
export function isValidUsci(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 18 || ![...value].every(c => USCI_CHARS.includes(c))) return false;
  let total = 0;
  for (let i = 0; i < 17; i++) total += USCI_CHARS.indexOf(value[i]) * USCI_WEIGHTS[i];
  return USCI_CHARS[(31 - (total % 31)) % 31] === value[17];
}

/** SEC CIK stored without zero padding, 1–10 digits. */
export function isValidCik(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value);
}

export function normalizeCik(value: unknown): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9]{1,10}$/.test(text)) fail('invalid_schema');
  const stripped = text.replace(/^0+/, '');
  if (!isValidCik(stripped)) fail('invalid_schema');
  return stripped;
}
agents
launch.json
scratch

codex
No actionable defects were identified in the new parsers, merge logic, or verification helper. Test execution was blocked by the read-only sandbox's temporary-directory restrictions, so runtime verification remains incomplete.
No actionable defects were identified in the new parsers, merge logic, or verification helper. Test execution was blocked by the read-only sandbox's temporary-directory restrictions, so runtime verification remains incomplete.
