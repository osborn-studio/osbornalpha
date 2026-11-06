OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1afe7-64af-7422-aadd-d0737bcf2b9e
--------
user
commit aa7cd12
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat aa7cd12; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-lhZULPcg' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XORMGmQ8' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/3a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-V345qtUu' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-SGbKInf2' (errno=Operation not permitted)
commit aa7cd12edf5f97f89b3213df8c8f73861069e9c3
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:08:44 2026 -0800

    fix(entities): HKEX ISIN placeholders, legend rows and superseded -OLD counters; GLEIF all-invalid LEI test
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 .../2026-11-05-data-foundation-3/verification.md   |  3 ++-
 src/lib/entities/identifiers/gleif.test.ts         |  7 +++++++
 src/lib/entities/identifiers/gleif.ts              |  3 ++-
 src/lib/entities/identifiers/hkex-list.test.ts     | 21 ++++++++++++++++----
 src/lib/entities/identifiers/hkex-list.ts          | 23 ++++++++++++++++++----
 5 files changed, 47 insertions(+), 10 deletions(-)
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

exec
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show aa7cd12 --; ls -a | head -35; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md; do test ! -f "$p" || cat "$p"; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 251ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-15reZyfh' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gy8qRY2Z' (errno=Operation not permitted)
commit aa7cd12edf5f97f89b3213df8c8f73861069e9c3
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:08:44 2026 -0800

    fix(entities): HKEX ISIN placeholders, legend rows and superseded -OLD counters; GLEIF all-invalid LEI test
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
index 39a6364..2e567ac 100644
--- a/docs/audits/2026-11-05-data-foundation-3/verification.md
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -16,5 +16,6 @@
 | "Other Numbering Agencies" URL、表头、`withIsin` | `…/ISINs-assigned-by-Other-Numbering-Agencies/isino.xls`（sha256 `facffd9cbc16ee79d86e1ad39b484d1df3d16e7f951d3b276e3847ace9676382`，1,839,616 字节，"Update Date: 02 November 2026"）；表头第 19 行同上加 `Place of Incorporation/Depot:`、`*National Numbering Agency`；11,916 行、8,607 带有效 ISIN；3,309 行 ISIN 被拒（"Not Available" 或权证的非校验位 ISIN，如 `NLBNPHK1FT88`） | 同偏差 2 | 同上；被拒 ISIN 视为无 ISIN（可接受：这些是权证/待上市证券，不进研究股票池） |
 | 三文件合并（`mergeHkexIsins`） | 00700 → `KYG875721634`、02318 → `CNE1000003X6`、00005 → `GB0005405286`、00939 → `CNE1000002H1`、00941 → `HK0941009539`，均来自第一份；跨文件 ISIN 冲突 0 条 | — | — |
 | GLEIF zip 内文件名、首行、sha256 | 下载 `https://mapping.gleif.org/api/v2/isin-lei/latest/download`（200，`x-gleif-publish-date: 2026-11-05T08:15:08Z`，33,089,731 字节，sha256 `5d79561beef1633a2b88ed2cb4994d550d0189995f237fb09dccdd158652ba1a`）；zip 内唯一文件 `lei-isin-20261105T081508.csv`（320,581,079 字节，9,428,856 行）；首行 `LEI,ISIN`（无 BOM，LF 行尾）；Apple LEI `HWUPKR0MPOU8FGXBT394` 有 949 行（含 `US0378331005`） | 一致 | — |
-| 被拒的非 ISIN 行 | `isinsehk.xls`：2 行 `invalid_stock_code`（第 74、5356 行：说明/页脚行，非证券）；`isino.xls`：37 行 `invalid_stock_code`（及上文 3,309 行 `invalid_isin`）；`ListOfSecurities.xlsx`：0 | — | 被拒行不进入合并；`rejected` 随解析结果保留，Task 4b 汇总进批次信息 |
+| 被拒 / 跳过行（质量复审后规则） | `ListOfSecurities.xlsx`：0 拒绝、0 跳过。`isinsehk.xls`：0 拒绝、2 跳过（`non_data`）。`isino.xls`：0 拒绝、37 跳过（`non_data`：`National Numbering Agencies` 图例表的缩写-全称条目与 `Note:` 说明）。原先的 3,309 行 `invalid_isin` 全是占位值 `Not Available`（`NLBNPHK1FT88` 等权证 ISIN 校验位正确，不被拒）；占位值（`Not Available`、`N/A`、`-`、空）= 无 ISIN，不计拒绝。`isino.xls` 11,916 行中 8,607 行带 ISIN | 规则：非数字股票代码且无 ISIN 形态的值 → `skipped(non_data)`；非数字代码但带 ISIN 形态的值 → `invalid_stock_code` | `parseHkexList` 增 `skipped`；占位集 `PLACEHOLDER_ISIN` |
+| `-OLD` 并行交易柜台 | 合并后 16 个名称以 `-OLD` 结尾的柜台（如 02934 `CHINA SANDI-OLD`、02936 `SG GROUP H-OLD`、02942 `STAR GROUP-OLD`）被剔除，原因 `superseded_counter`；跨文件 ISIN 冲突仍为 0 | — | `mergeHkexIsins` 返回 `dropped` |
 | 原始文件内容类型 | `ListOfSecurities.xlsx` = zip（`PK`，OOXML）；`isinsehk.xls`、`isino.xls` = OLE（`d0cf11e0`） | 复审发现：原先三份都会按 OOXML MIME/`.xlsx` 入桶 | `HKEX_LIST_FILES[].contentType`（xlsx / `application/vnd.ms-excel`）；`RawContentType` 增 `application/vnd.ms-excel`→`xls`；`reconcile-raw` 桶 `allowed_mime_types` 增该项 |
diff --git a/src/lib/entities/identifiers/gleif.test.ts b/src/lib/entities/identifiers/gleif.test.ts
index e6a3dd4..73a8a16 100644
--- a/src/lib/entities/identifiers/gleif.test.ts
+++ b/src/lib/entities/identifiers/gleif.test.ts
@@ -21,6 +21,13 @@ describe('subsetForLeis',()=>{
   const b=subsetForLeis([LINES[0],...LINES.slice(1).reverse()],new Set([MSFT,APPLE]));
   expect(b.csv).toBe(a.csv);expect(b.sha256).toBe(a.sha256);
  });
+ it('reports a LEI in missing when every one of its ISINs fails the check digit',()=>{
+  const s=subsetForLeis([GLEIF_HEADER,`${APPLE},US0378331006`,`${APPLE},US5949181046`,`${MSFT},US5949181045`],new Set([APPLE,MSFT]));
+  expect([...s.byLei.keys()]).toEqual([MSFT]);
+  expect(s.missing).toEqual([APPLE]);
+  expect(s.invalidIsins).toEqual([`${APPLE},US0378331006`,`${APPLE},US5949181046`]);
+  expect(s.csv).toBe(`LEI,ISIN\n${MSFT},US5949181045\n`);
+ });
  it('rejects a wrong header with invalid_schema',()=>{
   expect(()=>subsetForLeis(['LEI;ISIN',`${APPLE};US0378331005`],new Set([APPLE]))).toThrow('invalid_schema');
   expect(()=>subsetForLeis([],new Set([APPLE]))).toThrow('invalid_schema');
diff --git a/src/lib/entities/identifiers/gleif.ts b/src/lib/entities/identifiers/gleif.ts
index fcd80af..cfc5522 100644
--- a/src/lib/entities/identifiers/gleif.ts
+++ b/src/lib/entities/identifiers/gleif.ts
@@ -25,7 +25,8 @@ export async function* filterGleifLines(lines:AsyncIterable<string>,leis:Readonl
  }
 }
 
-/** Header + candidate lines → validated subset. Throws invalid_schema (landed parser) on a wrong or missing header. */
+/** Header + candidate lines → validated subset. Throws invalid_schema (landed parser) on a wrong or missing header.
+ * A LEI whose every ISIN fails the check digit has no usable ISIN: it is absent from byLei, listed in `missing`, and its bad rows are in `invalidIsins`. */
 export function subsetForLeis(lines:Iterable<string>,leis:ReadonlySet<string>):GleifSubset{
  const {found}=selectIsinsForLeis(lines,new Set(leis));
  const byLei=new Map<string,string[]>();
diff --git a/src/lib/entities/identifiers/hkex-list.test.ts b/src/lib/entities/identifiers/hkex-list.test.ts
index 16fcf00..e80d8bb 100644
--- a/src/lib/entities/identifiers/hkex-list.test.ts
+++ b/src/lib/entities/identifiers/hkex-list.test.ts
@@ -19,6 +19,9 @@ const LIST=book([
  [2318,'PING AN','Equity','Equity Securities (Main Board)','500','CNE1000003X6'],
  ['04335','HKGB 2.48 2030','Debt Securities','Government Bonds','50000',''],
  ['ABC','BAD CODE','Equity','',null,null],
+ ['Legend: * = suspended'],
+ ['ACD','Aex - Clearing and Depository N.V.'],
+ ['XYZ','BAD CODE REAL ISIN','Equity','',null,'US88160R1014'],
  ['00005','HSBC HOLDINGS','Equity','','400','GB0005405280'],
 ]);
 
@@ -31,7 +34,8 @@ describe('parseHkexList',()=>{
    ['00700','TENCENT','Equity','KYG875721634'],['02318','PING AN','Equity','CNE1000003X6'],
    ['04335','HKGB 2.48 2030','Debt Securities',null],['00005','HSBC HOLDINGS','Equity',null],
   ]);
-  expect(p.rejected).toEqual([{row:8,reason:'invalid_stock_code'},{row:9,reason:'invalid_isin'}]);
+  expect(p.skipped).toEqual([{row:8,reason:'non_data'},{row:9,reason:'non_data'},{row:10,reason:'non_data'}]);   // empty-ISIN row with a non-numeric code, legend text, a legend table row
+  expect(p.rejected).toEqual([{row:11,reason:'invalid_stock_code'},{row:12,reason:'invalid_isin'}]);
   expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('accepts any column order and a file without an ISIN column',()=>{
@@ -51,10 +55,11 @@ describe('parseHkexList',()=>{
   expect(parseHkexList(patched,'list_of_securities').rows.map(r=>r.stockCode)).toEqual(['00001','00002','00003']);
  });
  it('reads the HKEX ISIN workbooks ("HK Stock Code" / "ISIN Code" / "Stocks" headers, repeated header rows, preamble)',()=>{
-  const p=parseHkexList(book([['ISINs assigned by Other Numbering Agencies'],[],['Stocks ','ISIN Code','HK Stock Code','Type '],['TENCENT HOLDINGS LIMITED','KYG875721634','00700','ORD SH'],['Stocks','ISIN Code','HK Stock Code','Type'],['AB&B BIO-TECH CO., LTD. JS','CNE1000071P9','02627','ORD SH']]),'isin_other_agencies');
+  const p=parseHkexList(book([['ISINs assigned by Other Numbering Agencies'],[],['Stocks ','ISIN Code','HK Stock Code','Type '],['TENCENT HOLDINGS LIMITED','KYG875721634','00700','ORD SH'],['Stocks','ISIN Code','HK Stock Code','Type'],['AB&B BIO-TECH CO., LTD. JS','CNE1000071P9','02627','ORD SH'],['ASIA-PAC FINANCIAL RTS','Not Available','08555','RTS'],['X','  n/a ','08556','RTS'],['Y','-','08557','RTS'],['Z',null,'08558','RTS']]),'isin_other_agencies');
   expect(p.columns).toEqual({stockCode:2,name:0,category:null,isin:1});
-  expect(p.rows.map(r=>[r.stockCode,r.name,r.isin])).toEqual([['00700','TENCENT HOLDINGS LIMITED','KYG875721634'],['02627','AB&B BIO-TECH CO., LTD. JS','CNE1000071P9']]);
-  expect(p.rejected).toEqual([]);
+  expect(p.rows.map(r=>[r.stockCode,r.name,r.isin])).toEqual([['00700','TENCENT HOLDINGS LIMITED','KYG875721634'],['02627','AB&B BIO-TECH CO., LTD. JS','CNE1000071P9'],['08555','ASIA-PAC FINANCIAL RTS',null],['08556','X',null],['08557','Y',null],['08558','Z',null]]);
+  expect(p.rejected).toEqual([]);   // placeholders mean "no ISIN", not a malformed one
+  expect(p.skipped).toEqual([]);
  });
  it('fails with invalid_schema when no header row names "Stock Code"',()=>{
   expect(()=>parseHkexList(book([['Code','Name'],['00700','TENCENT']]),'list_of_securities')).toThrow('invalid_schema');
@@ -72,6 +77,14 @@ describe('mergeHkexIsins',()=>{
   expect(m.conflicts).toEqual([{stockCode:'00700',isins:[{file:'list_of_securities',isin:'KYG875721634'},{file:'isin_hkex',isin:'US88160R1014'}]}]);
   expect(HKEX_LIST_FILES.map(f=>f.id)).toEqual(['list_of_securities','isin_hkex','isin_other_agencies']);
  });
+ it('drops superseded -OLD counters from the merge and lists them, so the live counter keeps the code',()=>{
+  const other=parseHkexList(book([['Stocks','ISIN Code','HK Stock Code'],['BEIJING DEEPZERO TECH CO., LTD.-OLD','CNE1000002H1','02938'],['BEIJING DEEPZERO TECH CO., LTD.','CNE1000003X6','02938'],['OLD ECONOMY LTD','KYG875721634','02939']]),'isin_other_agencies');
+  const m=mergeHkexIsins([other]);
+  expect(m.byCode.get('02938')).toMatchObject({isin:'CNE1000003X6'});
+  expect(m.byCode.get('02939')).toMatchObject({isin:'KYG875721634'});   // only a name ENDING in -OLD is superseded
+  expect(m.dropped).toEqual([{stockCode:'02938',file:'isin_other_agencies',row:2,name:'BEIJING DEEPZERO TECH CO., LTD.-OLD',reason:'superseded_counter'}]);
+  expect(m.conflicts).toEqual([]);
+ });
  it('reports hasIsinColumn=false when no file carries ISINs',()=>{
   const m=mergeHkexIsins([parseHkexList(book([['Stock Code','Name of Securities'],['700','TENCENT']]),'list_of_securities')]);
   expect(m.hasIsinColumn).toBe(false);expect(m.byCode.size).toBe(0);
diff --git a/src/lib/entities/identifiers/hkex-list.ts b/src/lib/entities/identifiers/hkex-list.ts
index 6867588..d0acb72 100644
--- a/src/lib/entities/identifiers/hkex-list.ts
+++ b/src/lib/entities/identifiers/hkex-list.ts
@@ -22,12 +22,16 @@ export interface HkexListParse{
  file:HkexFileId;sha256:string;headerRow:number;
  columns:{stockCode:number;name:number|null;category:number|null;isin:number|null};
  rows:HkexListRow[];rejected:{row:number;reason:'invalid_stock_code'|'invalid_isin'}[];
+ skipped:{row:number;reason:'non_data'}[];   // legend/footer text: neither a stock code nor an ISIN (not a defect)
 }
 export interface HkexIsin{isin:string;file:HkexFileId;sha256:string;row:number}
 
 const norm=(v:unknown)=>v==null?'':String(v).replace(/\s+/g,' ').trim().toLowerCase();
 /** ListOfSecurities.xlsx says "Stock Code"; the two ISIN workbooks (verified 2026-11-05) say "HK Stock Code". */
 const isCodeHeader=(h:string)=>h==='stock code'||h==='hk stock code';
+/** HKEX writes these where a counter has no ISIN yet (isino.xls: "Not Available"); they mean "none", not a malformed value. */
+const PLACEHOLDER_ISIN=new Set(['','not available','n/a','na','-','--','nil']);
+const ISIN_SHAPE=/^[A-Z]{2}[A-Z0-9]{9}\d$/;
 const text=(v:unknown)=>v==null||String(v).trim()===''?null:String(v).trim();
 
 export function parseHkexList(bytes:Uint8Array,file:HkexFileId):HkexListParse{
@@ -51,33 +55,44 @@ export function parseHkexList(bytes:Uint8Array,file:HkexFileId):HkexListParse{
  };
  const rows:HkexListRow[]=[];
  const rejected:HkexListParse['rejected']=[];
+ const skipped:HkexListParse['skipped']=[];
  for(let i=headerIdx+1;i<grid.length;i++){
   const r=grid[i];
   if(!Array.isArray(r)||r.every(c=>text(c)===null))continue;
   const code=text(r[columns.stockCode])??'';
   if(isCodeHeader(norm(code)))continue;   // the ISIN workbooks repeat the header above their second table
-  if(!/^\d{1,5}$/.test(code)){rejected.push({row:i+1,reason:'invalid_stock_code'});continue;}
   const cell=(c:number|null)=>c===null?null:text(r[c]);
   let isin=cell(columns.isin)?.toUpperCase()??null;
+  if(isin!==null&&PLACEHOLDER_ISIN.has(norm(isin)))isin=null;
+  if(!/^\d{1,5}$/.test(code)){
+   // No code and no ISIN-shaped value (live isino.xls ends with an agency legend table): legend / footer text, not a data row. A bad code beside a real ISIN is still a defect.
+   if(isin===null||!ISIN_SHAPE.test(isin))skipped.push({row:i+1,reason:'non_data'});else rejected.push({row:i+1,reason:'invalid_stock_code'});
+   continue;
+  }
   if(isin!==null&&!isValidIsin(isin)){rejected.push({row:i+1,reason:'invalid_isin'});isin=null;}
   rows.push({stockCode:code.padStart(5,'0'),name:cell(columns.name),category:cell(columns.category),isin,row:i+1});
  }
- return {file,sha256:createHash('sha256').update(bytes).digest('hex'),headerRow:headerIdx+1,columns,rows,rejected};
+ return {file,sha256:createHash('sha256').update(bytes).digest('hex'),headerRow:headerIdx+1,columns,rows,rejected,skipped};
 }
 
 /** Stock code → ISIN by file priority (first file wins); a different ISIN in a later file is listed in conflicts. */
-export function mergeHkexIsins(parses:readonly HkexListParse[]):{byCode:Map<string,HkexIsin>;conflicts:{stockCode:string;isins:{file:HkexFileId;isin:string}[]}[];hasIsinColumn:boolean}{
+export interface HkexDropped{stockCode:string;file:HkexFileId;row:number;name:string;reason:'superseded_counter'}
+/** A name ending "-OLD" marks a superseded parallel-trading counter (e.g. 02947 BEIJING DEEPZERO TECH CO., LTD.-OLD); it never supplies an ISIN. */
+const SUPERSEDED=/-\s*old$/i;
+export function mergeHkexIsins(parses:readonly HkexListParse[]):{byCode:Map<string,HkexIsin>;dropped:HkexDropped[];conflicts:{stockCode:string;isins:{file:HkexFileId;isin:string}[]}[];hasIsinColumn:boolean}{
  const prio=(f:HkexFileId)=>HKEX_LIST_FILES.find(x=>x.id===f)!.priority;
  const ordered=[...parses].sort((a,b)=>prio(a.file)-prio(b.file));
  const byCode=new Map<string,HkexIsin>();
  const seen=new Map<string,{file:HkexFileId;isin:string}[]>();
+ const dropped:HkexDropped[]=[];
  for(const p of ordered)for(const r of p.rows){
   if(!r.isin)continue;
+  if(r.name&&SUPERSEDED.test(r.name.trim())){dropped.push({stockCode:r.stockCode,file:p.file,row:r.row,name:r.name,reason:'superseded_counter'});continue;}
   const list=seen.get(r.stockCode)??[];
   if(!list.some(x=>x.isin===r.isin))list.push({file:p.file,isin:r.isin});
   seen.set(r.stockCode,list);
   if(!byCode.has(r.stockCode))byCode.set(r.stockCode,{isin:r.isin,file:p.file,sha256:p.sha256,row:r.row});
  }
  const conflicts=[...seen].filter(([,l])=>l.length>1).map(([stockCode,isins])=>({stockCode,isins})).sort((a,b)=>a.stockCode<b.stockCode?-1:1);
- return {byCode,conflicts,hasIsinColumn:parses.some(p=>p.columns.isin!==null)};
+ return {byCode,dropped,conflicts,hasIsinColumn:parses.some(p=>p.columns.isin!==null)};
 }
.
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

exec
/bin/zsh -lc 'for p in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do ls "$p"/AGENTS* 2>/dev/null; done; cat src/lib/entities/identifiers/hkex-list.ts; rg '"'mergeHkexIsins|HkexListParse|\\.skipped|\\.dropped' src/lib/entities scripts -n; cat package.json; find . -maxdepth 2 -iname '*instructions*' -o -name CLAUDE.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS*
// src/lib/entities/identifiers/hkex-list.ts
// Stage D (spec §4.1.4): HKEX securities lists → (stock code, name, category, ISIN). Columns are
// located by header text, never by position (HKEX changed the layout; circular CT/118/25 added ISIN
// to ListOfSecurities.xlsx). A file without an ISIN column still yields names and categories, which
// the A+H name match uses (§4.2.2). ISIN precedence follows HKEX_LIST_FILES priority.
import {createHash} from 'node:crypto';
import * as XLSX from 'xlsx';
import {isValidIsin} from '../../research/entity-keys/identifiers';

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
export const XLS_MIME='application/vnd.ms-excel' as const;
export type HkexFileId='list_of_securities'|'isin_hkex'|'isin_other_agencies';
export interface HkexListFile{id:HkexFileId;file:string;contentType:typeof XLSX_MIME|typeof XLS_MIME;url:string|null;priority:number}
/** Expected file names inside `--hkex <dir>`; Task 4b stores each under its own `contentType` (the two ISIN workbooks are legacy OLE .xls). URLs and file names verified 2026-11-05 (docs/audits/2026-11-05-data-foundation-3/verification.md). */
export const HKEX_LIST_FILES:readonly HkexListFile[]=[
 {id:'list_of_securities',file:'ListOfSecurities.xlsx',contentType:XLSX_MIME,url:'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx',priority:1},
 {id:'isin_hkex',file:'isinsehk.xls',contentType:XLS_MIME,url:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-HKEX/isinsehk.xls',priority:2},
 {id:'isin_other_agencies',file:'isino.xls',contentType:XLS_MIME,url:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-Other-Numbering-Agencies/isino.xls',priority:3},
];
export interface HkexListRow{stockCode:string;name:string|null;category:string|null;isin:string|null;row:number}
export interface HkexListParse{
 file:HkexFileId;sha256:string;headerRow:number;
 columns:{stockCode:number;name:number|null;category:number|null;isin:number|null};
 rows:HkexListRow[];rejected:{row:number;reason:'invalid_stock_code'|'invalid_isin'}[];
 skipped:{row:number;reason:'non_data'}[];   // legend/footer text: neither a stock code nor an ISIN (not a defect)
}
export interface HkexIsin{isin:string;file:HkexFileId;sha256:string;row:number}

const norm=(v:unknown)=>v==null?'':String(v).replace(/\s+/g,' ').trim().toLowerCase();
/** ListOfSecurities.xlsx says "Stock Code"; the two ISIN workbooks (verified 2026-11-05) say "HK Stock Code". */
const isCodeHeader=(h:string)=>h==='stock code'||h==='hk stock code';
/** HKEX writes these where a counter has no ISIN yet (isino.xls: "Not Available"); they mean "none", not a malformed value. */
const PLACEHOLDER_ISIN=new Set(['','not available','n/a','na','-','--','nil']);
const ISIN_SHAPE=/^[A-Z]{2}[A-Z0-9]{9}\d$/;
const text=(v:unknown)=>v==null||String(v).trim()===''?null:String(v).trim();

export function parseHkexList(bytes:Uint8Array,file:HkexFileId):HkexListParse{
 let grid:unknown[][];
 try{
  // nodim: the live HKEX file declares a stale <dimension> (A1:R8 for 17k rows), which would truncate the grid.
  const wb=XLSX.read(bytes,{type:'array',nodim:true} as XLSX.ParsingOptions);
  const ws=wb.Sheets[wb.SheetNames[0]];
  if(!ws)throw new Error('no sheet');
  grid=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,raw:false,defval:null,blankrows:true});
 }catch{throw new Error('invalid_schema');}
 const headerIdx=grid.slice(0,30).findIndex(r=>Array.isArray(r)&&r.some(c=>isCodeHeader(norm(c))));
 if(headerIdx<0)throw new Error('invalid_schema');
 const header=(grid[headerIdx] as unknown[]).map(norm);
 const find=(pred:(h:string)=>boolean)=>{const i=header.findIndex(pred);return i<0?null:i;};
 const columns={
  stockCode:header.findIndex(isCodeHeader),
  name:find(h=>h==='name of securities'||h==='name of security'||h==='name'||h==='stocks'),
  category:find(h=>h==='category'),
  isin:find(h=>h.startsWith('isin')),
 };
 const rows:HkexListRow[]=[];
 const rejected:HkexListParse['rejected']=[];
 const skipped:HkexListParse['skipped']=[];
 for(let i=headerIdx+1;i<grid.length;i++){
  const r=grid[i];
  if(!Array.isArray(r)||r.every(c=>text(c)===null))continue;
  const code=text(r[columns.stockCode])??'';
  if(isCodeHeader(norm(code)))continue;   // the ISIN workbooks repeat the header above their second table
  const cell=(c:number|null)=>c===null?null:text(r[c]);
  let isin=cell(columns.isin)?.toUpperCase()??null;
  if(isin!==null&&PLACEHOLDER_ISIN.has(norm(isin)))isin=null;
  if(!/^\d{1,5}$/.test(code)){
   // No code and no ISIN-shaped value (live isino.xls ends with an agency legend table): legend / footer text, not a data row. A bad code beside a real ISIN is still a defect.
   if(isin===null||!ISIN_SHAPE.test(isin))skipped.push({row:i+1,reason:'non_data'});else rejected.push({row:i+1,reason:'invalid_stock_code'});
   continue;
  }
  if(isin!==null&&!isValidIsin(isin)){rejected.push({row:i+1,reason:'invalid_isin'});isin=null;}
  rows.push({stockCode:code.padStart(5,'0'),name:cell(columns.name),category:cell(columns.category),isin,row:i+1});
 }
 return {file,sha256:createHash('sha256').update(bytes).digest('hex'),headerRow:headerIdx+1,columns,rows,rejected,skipped};
}

/** Stock code → ISIN by file priority (first file wins); a different ISIN in a later file is listed in conflicts. */
export interface HkexDropped{stockCode:string;file:HkexFileId;row:number;name:string;reason:'superseded_counter'}
/** A name ending "-OLD" marks a superseded parallel-trading counter (e.g. 02947 BEIJING DEEPZERO TECH CO., LTD.-OLD); it never supplies an ISIN. */
const SUPERSEDED=/-\s*old$/i;
export function mergeHkexIsins(parses:readonly HkexListParse[]):{byCode:Map<string,HkexIsin>;dropped:HkexDropped[];conflicts:{stockCode:string;isins:{file:HkexFileId;isin:string}[]}[];hasIsinColumn:boolean}{
 const prio=(f:HkexFileId)=>HKEX_LIST_FILES.find(x=>x.id===f)!.priority;
 const ordered=[...parses].sort((a,b)=>prio(a.file)-prio(b.file));
 const byCode=new Map<string,HkexIsin>();
 const seen=new Map<string,{file:HkexFileId;isin:string}[]>();
 const dropped:HkexDropped[]=[];
 for(const p of ordered)for(const r of p.rows){
  if(!r.isin)continue;
  if(r.name&&SUPERSEDED.test(r.name.trim())){dropped.push({stockCode:r.stockCode,file:p.file,row:r.row,name:r.name,reason:'superseded_counter'});continue;}
  const list=seen.get(r.stockCode)??[];
  if(!list.some(x=>x.isin===r.isin))list.push({file:p.file,isin:r.isin});
  seen.set(r.stockCode,list);
  if(!byCode.has(r.stockCode))byCode.set(r.stockCode,{isin:r.isin,file:p.file,sha256:p.sha256,row:r.row});
 }
 const conflicts=[...seen].filter(([,l])=>l.length>1).map(([stockCode,isins])=>({stockCode,isins})).sort((a,b)=>a.stockCode<b.stockCode?-1:1);
 return {byCode,dropped,conflicts,hasIsinColumn:parses.some(p=>p.columns.isin!==null)};
}
src/lib/entities/link-research.ts:94:  if('invalid' in ids){plan.skipped.push({entity_key,reason:`invalid_identifier:${ids.invalid}`});continue;}
src/lib/entities/link-research.ts:95:  if(!ids.lei&&!ids.usci&&!ids.cik){plan.skipped.push({entity_key,reason:'no_hard_identifier'});continue;}
src/lib/entities/link-research.ts:97:  if(!canonical_name_zh&&!canonical_name_en){plan.skipped.push({entity_key,reason:'name_required'});continue;}
src/lib/entities/link-research.ts:106:  const skip=(reason:string)=>plan.skipped.push({entity_key,security_id:s.id,reason});
src/lib/entities/link-research.ts:142: const skippedSummary=summarizeSkips(plan.skipped.filter(s=>!isReject(s.reason)).map(s=>s.reason));
src/lib/entities/link-research.ts:143: const rejectedSummary=summarizeSkips(plan.skipped.filter(s=>isReject(s.reason)).map(s=>s.reason));
scripts/research-daily.ts:47:      `skipped_low_relevance=${r.skippedLowRelevance}`,
scripts/research-daily.ts:58:      `dropped=${extraction.dropped.length} skippedSources=${extraction.skippedSources}`,
src/lib/entities/load-sec.test.ts:45:  expect(plan.skipped).toEqual(['ZZZZ']);
src/lib/entities/load-sec.test.ts:65:  expect(plan.skipped).toEqual([]);
src/lib/entities/load-sec.test.ts:101:  expect(res.skippedSummary).toEqual({not_in_universe:1});
src/lib/entities/load-sec.test.ts:133:  expect(res.skippedSummary).toEqual({});
src/lib/entities/identifiers/hkex-list.test.ts:5:import {HKEX_LIST_FILES,XLSX_MIME,XLS_MIME,mergeHkexIsins,parseHkexList} from './hkex-list';
src/lib/entities/identifiers/hkex-list.test.ts:37:  expect(p.skipped).toEqual([{row:8,reason:'non_data'},{row:9,reason:'non_data'},{row:10,reason:'non_data'}]);   // empty-ISIN row with a non-numeric code, legend text, a legend table row
src/lib/entities/identifiers/hkex-list.test.ts:62:  expect(p.skipped).toEqual([]);
src/lib/entities/identifiers/hkex-list.test.ts:69:describe('mergeHkexIsins',()=>{
src/lib/entities/identifiers/hkex-list.test.ts:73:  const m=mergeHkexIsins([other,list]);
src/lib/entities/identifiers/hkex-list.test.ts:82:  const m=mergeHkexIsins([other]);
src/lib/entities/identifiers/hkex-list.test.ts:85:  expect(m.dropped).toEqual([{stockCode:'02938',file:'isin_other_agencies',row:2,name:'BEIJING DEEPZERO TECH CO., LTD.-OLD',reason:'superseded_counter'}]);
src/lib/entities/identifiers/hkex-list.test.ts:89:  const m=mergeHkexIsins([parseHkexList(book([['Stock Code','Name of Securities'],['700','TENCENT']]),'list_of_securities')]);
src/lib/entities/identifiers/hkex-list.ts:21:export interface HkexListParse{
src/lib/entities/identifiers/hkex-list.ts:37:export function parseHkexList(bytes:Uint8Array,file:HkexFileId):HkexListParse{
src/lib/entities/identifiers/hkex-list.ts:57: const rejected:HkexListParse['rejected']=[];
src/lib/entities/identifiers/hkex-list.ts:58: const skipped:HkexListParse['skipped']=[];
src/lib/entities/identifiers/hkex-list.ts:82:export function mergeHkexIsins(parses:readonly HkexListParse[]):{byCode:Map<string,HkexIsin>;dropped:HkexDropped[];conflicts:{stockCode:string;isins:{file:HkexFileId;isin:string}[]}[];hasIsinColumn:boolean}{
src/lib/entities/link-research.test.ts:64:  expect(plan.skipped).toEqual([{entity_key:`${U}:e2`,reason:'no_hard_identifier'},{entity_key:`${U}:e3`,security_id:'s3',reason:'ticker_not_in_universe:NOPE'}]);
src/lib/entities/link-research.test.ts:90:  expect(plan.skipped.map(s=>s.reason)).toEqual(['invalid_identifier:lei','invalid_identifier:usci','invalid_identifier:cik','invalid_identifier:cik','name_required']);
src/lib/entities/link-research.test.ts:107:  expect(plan.skipped.map(s=>s.reason)).toEqual(['invalid_ticker:ABCDEF','market_mismatch:00941.HK']);
src/lib/entities/link-research.test.ts:117:  expect(plan.skipped).toEqual([]);
src/lib/entities/link-research.test.ts:226:  expect(ok.skippedSummary).toEqual({ticker_not_in_universe:1});
src/lib/entities/link-research.test.ts:237:  expect(bad.skippedSummary).toEqual({ticker_not_in_universe:1});
src/lib/entities/load-sec.ts:123: const skippedSummary=summarizeSkips(plan.skipped.map(()=>'not_in_universe'));
scripts/research-ingest-radar.ts:55:      `skipped_low_relevance=${r.skippedLowRelevance} cards_seen=${r.cardsSeen}`,
scripts/entity-keys/load-sec-issuers.ts:61:  issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped.length,
scripts/entity-keys/load-sec-issuers.ts:62:  firstSkipped:plan.skipped.slice(0,10),firstRejected:parsed.rejected.slice(0,10),
scripts/entity-keys/load-sec-issuers.ts:78:  skipped=result.skippedSummary;
scripts/entity-keys/link-research-entities.ts:60:  issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped,
scripts/entity-keys/link-research-entities.ts:78:  skipped=result.skippedSummary;
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
/bin/zsh -lc 'cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; cat vitest.config.*; cat src/lib/entities/identifiers/gleif.ts; git log -3 --oneline; node node_modules/vitest/vitest.mjs run src/lib/entities/identifiers/hkex-list.test.ts src/lib/entities/identifiers/gleif.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 362ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
// src/lib/entities/identifiers/gleif.ts
// Stage A (spec §4.1.1): GLEIF ISIN↔LEI mapping (`LEI,ISIN` CSV, public domain). The ~300 MB file
// is pre-filtered line by line (filterGleifLines) and the kept lines go through the landed
// selectIsinsForLeis, which validates the header (invalid_schema). The subset is rendered
// deterministically (sorted, deduplicated, check-digit valid) so its sha256 is stable evidence for
// reconcile-raw. Bond ISINs are kept here: stage B (OpenFIGI) judges the security type.
import {createHash} from 'node:crypto';
import {selectIsinsForLeis} from '../../research/entity-keys/parsers';
import {isValidIsin} from '../../research/entity-keys/identifiers';

export const GLEIF_HEADER='LEI,ISIN';
export const GLEIF_URL='https://mapping.gleif.org/api/v2/isin-lei/latest/download';
export interface GleifSubset{csv:string;sha256:string;byLei:Map<string,string[]>;missing:string[];invalidIsins:string[]}

const stripBom=(s:string)=>s.charCodeAt(0)===0xfeff?s.slice(1):s;

/** Streams the file, yielding the header (BOM/CR stripped) and the lines whose LEI is wanted. */
export async function* filterGleifLines(lines:AsyncIterable<string>,leis:ReadonlySet<string>):AsyncGenerator<string>{
 let first=true;
 for await(const raw of lines){
  const line=raw.replace(/\r$/,'');
  if(first){first=false;yield stripBom(line);continue;}
  const comma=line.indexOf(',');
  if(comma>0&&leis.has(line.slice(0,comma)))yield line;
 }
}

/** Header + candidate lines → validated subset. Throws invalid_schema (landed parser) on a wrong or missing header.
 * A LEI whose every ISIN fails the check digit has no usable ISIN: it is absent from byLei, listed in `missing`, and its bad rows are in `invalidIsins`. */
export function subsetForLeis(lines:Iterable<string>,leis:ReadonlySet<string>):GleifSubset{
 const {found}=selectIsinsForLeis(lines,new Set(leis));
 const byLei=new Map<string,string[]>();
 const invalidIsins:string[]=[];
 for(const lei of Object.keys(found).sort()){
  const isins=[...new Set(found[lei].map(s=>s.trim().toUpperCase()))].sort().filter(i=>{
   if(isValidIsin(i))return true;
   invalidIsins.push(`${lei},${i}`);return false;
  });
  if(isins.length)byLei.set(lei,isins);
 }
 const csv=[GLEIF_HEADER,...[...byLei].flatMap(([lei,isins])=>isins.map(i=>`${lei},${i}`))].join('\n')+'\n';
 return {csv,sha256:createHash('sha256').update(csv,'utf8').digest('hex'),byLei,missing:[...leis].filter(l=>!byLei.has(l)).sort(),invalidIsins:invalidIsins.sort()};
}

/** Replays a stored subset (every LEI in it). */
export function parseGleifCsv(csv:string):Map<string,string[]>{
 const lines=stripBom(csv).split('\n').map(l=>l.replace(/\r$/,'')).filter((l,i)=>i===0||l!=='');
 const leis=new Set(lines.slice(1).map(l=>{const c=l.indexOf(',');return c<0?l:l.slice(0,c);}));
 return subsetForLeis(lines,leis).byLei;
}
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iN00r0A7' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZUAAsyhQ' (errno=Operation not permitted)
aa7cd12 fix(entities): HKEX ISIN placeholders, legend rows and superseded -OLD counters; GLEIF all-invalid LEI test
5ec2289 fix(entities): store HKEX .xls workbooks as application/vnd.ms-excel with per-file content types
7507df2 feat(entities): GLEIF ISIN-LEI subset and header-driven HKEX list parsing, with live header check record
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/entities/identifiers/gleif.test.ts (0 test)
 ❯ src/lib/entities/identifiers/hkex-list.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/entities/identifiers/gleif.test.ts [ src/lib/entities/identifiers/gleif.test.ts ]
 FAIL  src/lib/entities/identifiers/hkex-list.test.ts [ src/lib/entities/identifiers/hkex-list.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/Rmi_O527tbbm3h8tvMgKH/ssr'

 Test Files  2 failed (2)
      Tests  no tests
   Start at  00:09:22
   Duration  108ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯



codex
No actionable regressions were identified in the parser, merge logic, or added tests. Test execution was attempted but blocked by the read-only sandbox before any tests ran.
No actionable regressions were identified in the parser, merge logic, or added tests. Test execution was attempted but blocked by the read-only sandbox before any tests ran.
