OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0c8-e971-7ff1-8237-eedcdb8ee1ea
--------
user
commit ba8a6c0
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline ba8a6c0; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 4760ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-iqD8pXyr' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VJ3P3g0A' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3dHU0dd8' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LXLTeYVW' (errno=Operation not permitted)
ba8a6c0 feat(dq): bounded inline XBRL tokenizer and subset parser (namespaces, contexts, units, formats)
 .../dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm   |  35 +++
 src/lib/dq/reconcile/ixbrl.test.ts                 | 164 ++++++++++
 src/lib/dq/reconcile/ixbrl.ts                      | 336 +++++++++++++++++++++
 3 files changed, 535 insertions(+)

exec
/bin/zsh -lc 'pwd; ls -a | head -25; for d in . .. ../.. ../../.. ../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if [ -f "$d/$f" ]; then echo ==== $d/$f; cat "$d/$f"; fi; done; done; git show ba8a6c0 -- src/lib/dq/reconcile/ixbrl.ts src/lib/dq/reconcile/ixbrl.test.ts src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 33ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
zsh:1: === not found

exec
/bin/zsh -lc 'for d in . .. ../.. ../../.. ../../../..; do for f in AGENTS.override.md AGENTS.md CLAUDE.md; do if [ -f "$d/$f" ]; then printf '"'\\n%s\\n' \""'$d/$f"; cat "$d/$f"; fi; done; done; git show ba8a6c0 -- src/lib/dq/reconcile/ixbrl.ts src/lib/dq/reconcile/ixbrl.test.ts src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 365ms:

../../../AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pjw0XuzU' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Q9DMty1Z' (errno=Operation not permitted)
commit ba8a6c0b139e5bcac69e3dc79d838bc7792eaa3b
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:14:53 2026 -0800

    feat(dq): bounded inline XBRL tokenizer and subset parser (namespaces, contexts, units, formats)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm b/src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm
new file mode 100644
index 0000000..94d38aa
--- /dev/null
+++ b/src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm
@@ -0,0 +1,35 @@
+<?xml version="1.0" encoding="utf-8"?>
+<!-- Hand-trimmed unit-test fixture: Apple Inc. Form 10-K FY2023, accession 0000320193-23-000106, primary document aapl-20230930.htm.
+     Values equal the companyfacts entries of that accession in src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json.
+     Reproducible full trims are made by scripts/dq/record-ixbrl-fixture.ts (Task 13c). -->
+<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:us-gaap="http://fasb.org/us-gaap/2023" xmlns:dei="http://xbrl.sec.gov/dei/2023" xmlns:srt="http://fasb.org/srt/2023" xmlns:aapl="http://www.apple.com/20230930" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
+<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>aapl-20230930</title></head>
+<body>
+<div style="display:none"><ix:header><ix:hidden>
+<ix:nonNumeric name="dei:DocumentFiscalYearFocus" contextRef="c-1">2023</ix:nonNumeric>
+</ix:hidden><ix:resources>
+<xbrli:context id="c-1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2022-09-25</xbrli:startDate><xbrli:endDate>2023-09-30</xbrli:endDate></xbrli:period></xbrli:context>
+<xbrli:context id="c-2"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2021-09-26</xbrli:startDate><xbrli:endDate>2022-09-24</xbrli:endDate></xbrli:period></xbrli:context>
+<xbrli:context id="c-3"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2020-09-27</xbrli:startDate><xbrli:endDate>2021-09-25</xbrli:endDate></xbrli:period></xbrli:context>
+<xbrli:context id="c-4"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2023-09-30</xbrli:instant></xbrli:period></xbrli:context>
+<xbrli:context id="c-5"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2023-10-20</xbrli:instant></xbrli:period></xbrli:context>
+<xbrli:context id="c-6"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">aapl:IPhoneMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2022-09-25</xbrli:startDate><xbrli:endDate>2023-09-30</xbrli:endDate></xbrli:period></xbrli:context>
+<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
+<xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>
+<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
+</ix:resources></ix:header></div>
+<p>For the fiscal year ended <ix:nonNumeric name="dei:DocumentPeriodEndDate" contextRef="c-1" format="ixt:date-monthname-day-year-en">September 30, 2023</ix:nonNumeric></p>
+<p><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="c-1">Large Accelerated Filer</ix:nonNumeric></p>
+<p><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding" contextRef="c-5" unitRef="shares" decimals="INF" scale="0" format="ixt:num-dot-decimal">15,552,752,000</ix:nonFraction> shares of common stock were issued and outstanding as of October&#160;20, 2023.</p>
+<table>
+<tr><td>Total net sales</td><td>$<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-1" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">383,285</ix:nonFraction></td><td>$<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-2" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">394,328</ix:nonFraction></td><td>$<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-3" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">365,817</ix:nonFraction></td></tr>
+<tr><td>iPhone</td><td>$<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-6" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">200,583</ix:nonFraction></td></tr>
+<tr><td>Net income</td><td>$<ix:nonFraction name="us-gaap:NetIncomeLoss" contextRef="c-1" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">96,995</ix:nonFraction></td></tr>
+<tr><td>Basic earnings per share</td><td>$<ix:nonFraction name="us-gaap:EarningsPerShareBasic" contextRef="c-1" unitRef="usdPerShare" decimals="2" scale="0" format="ixt:num-dot-decimal">6.16</ix:nonFraction></td></tr>
+<tr><td>Cash generated by/(used in) investing activities</td><td><ix:nonFraction name="us-gaap:NetCashProvidedByUsedInInvestingActivities" contextRef="c-1" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">3,705</ix:nonFraction></td><td>(<ix:nonFraction name="us-gaap:NetCashProvidedByUsedInInvestingActivities" contextRef="c-2" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal" sign="-">22,354</ix:nonFraction>)</td></tr>
+<tr><td>Total assets</td><td>$<ix:nonFraction name="us-gaap:Assets" contextRef="c-4" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">352,583</ix:nonFraction></td></tr>
+<tr><td>Total shareholders' equity</td><td><ix:nonFraction name="us-gaap:StockholdersEquity" contextRef="c-4" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">62,146</ix:nonFraction></td></tr>
+</table>
+<p>Total net sales were $<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-1" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">383,285</ix:nonFraction> million in 2023.</p>
+</body>
+</html>
diff --git a/src/lib/dq/reconcile/ixbrl.test.ts b/src/lib/dq/reconcile/ixbrl.test.ts
new file mode 100644
index 0000000..60ec4a2
--- /dev/null
+++ b/src/lib/dq/reconcile/ixbrl.test.ts
@@ -0,0 +1,164 @@
+// src/lib/dq/reconcile/ixbrl.test.ts
+import {readFileSync} from 'node:fs';
+import {describe,expect,it} from 'vitest';
+import {IXBRL_PARSER_VERSION,IxbrlParseError,decodeEntities,indexIxFacts,ixFactKey,parseInlineXbrl,tokenizeXml} from './ixbrl';
+import type {IxFact} from './ixbrl';
+
+const AAPL=readFileSync(new URL('../fixtures/ixbrl/aapl-10k-2023.handtrim.htm',import.meta.url),'utf8');
+/** Renames every prefix: xmlns declarations, element names, QName attribute values and QName text (measure, explicitMember). */
+function rewritePrefixes(doc:string,map:Record<string,string>):string{
+ let out=doc;
+ for(const [from,to] of Object.entries(map)){
+  const esc=from.replace(/[-]/g,'\\-');
+  out=out.replaceAll(`xmlns:${from}=`,`xmlns:${to}=`).replace(new RegExp(`(?<=[<\\/"\\s>])${esc}:`,'g'),`${to}:`);
+ }
+ return out;
+}
+const HEAD='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:ixt3="http://www.xbrl.org/inlineXBRL/transformation/2015-02-26" xmlns:ixt5="http://www.xbrl.org/inlineXBRL/transformation/2022-02-16" xmlns:ixt-sec="http://www.sec.gov/inlineXBRL/transformation/2015-08-31" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';
+const ENTITY='<xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier>';
+const DUR='<xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate>';
+const ctx=(id:string,period:string,o:{segment?:string;scenario?:string}={})=>`<xbrli:context id="${id}"><xbrli:entity>${ENTITY}${o.segment?`<xbrli:segment>${o.segment}</xbrli:segment>`:''}</xbrli:entity><xbrli:period>${period}</xbrli:period>${o.scenario?`<xbrli:scenario>${o.scenario}</xbrli:scenario>`:''}</xbrli:context>`;
+const USD='<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>';
+const RES=ctx('d',DUR)+ctx('i','<xbrli:instant>2024-12-31</xbrli:instant>')+USD;
+const doc=(body:string,res=RES)=>`${HEAD}<body><div style="display:none"><ix:header><ix:resources>${res}</ix:resources></ix:header></div>${body}</body></html>`;
+const nf=(attrs:string,text:string,name='us-gaap:Revenues',contextRef='d',unitRef='usd')=>`<ix:nonFraction name="${name}" contextRef="${contextRef}" unitRef="${unitRef}" ${attrs}>${text}</ix:nonFraction>`;
+const one=(body:string,res?:string)=>parseInlineXbrl(doc(body,res));
+const valueOf=(body:string)=>{const d=one(body);return d.facts.length===1?d.facts[0].value:d.unsupported.map(u=>u.reason).join(',');};
+const byName=(facts:IxFact[],name:string)=>facts.filter(f=>f.name===name);
+
+describe('parseInlineXbrl on the AAPL FY2023 10-K fixture',()=>{
+ const d=parseInlineXbrl(AAPL);
+ it('extracts the 11 non-dimensional facts with canonical names, contexts, units and scaled values',()=>{
+  expect(IXBRL_PARSER_VERSION).toBe('ixbrl/1');
+  expect(d.unsupported).toEqual([]);
+  expect(d.facts).toHaveLength(11);
+  const rev=byName(d.facts,'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax');
+  expect(rev.map(f=>[f.periodStart,f.periodEnd,f.value])).toEqual([['2022-09-25','2023-09-30','383285000000'],['2021-09-26','2022-09-24','394328000000'],['2020-09-27','2021-09-25','365817000000'],['2022-09-25','2023-09-30','383285000000']]);
+  expect(rev[0]).toMatchObject({unit:'USD',decimals:'-6',scale:6,entity:'http://www.sec.gov/CIK#0000320193',contextRef:'c-1',unitRef:'usd'});
+  expect(byName(d.facts,'us-gaap:EarningsPerShareBasic')[0]).toMatchObject({value:'6.16',unit:'USD/share',decimals:'2',scale:0});
+  expect(byName(d.facts,'us-gaap:NetCashProvidedByUsedInInvestingActivities').map(f=>f.value)).toEqual(['3705000000','-22354000000']);
+  expect(byName(d.facts,'us-gaap:Assets')[0]).toMatchObject({periodStart:null,periodEnd:'2023-09-30',value:'352583000000'});
+  expect(byName(d.facts,'dei:EntityCommonStockSharesOutstanding')[0]).toMatchObject({periodStart:null,periodEnd:'2023-10-20',unit:'shares',value:'15552752000',decimals:'INF'});
+ });
+ it('skips the dimensional (segment) context: the iPhone member value is not a fact and not unsupported',()=>{
+  expect(d.facts.some(f=>f.value==='200583000000')).toBe(false);
+ });
+ it('reads only the three dei nonNumeric facts, whitespace-collapsed',()=>{
+  expect(d.nonNumeric).toEqual({'dei:DocumentFiscalYearFocus':'2023','dei:DocumentPeriodEndDate':'September 30, 2023','dei:EntityFilerCategory':'Large Accelerated Filer'});
+ });
+ it('repeated tagging of one value collapses to one value per right-side key',()=>{
+  const idx=indexIxFacts(d.facts);
+  const k=ixFactKey(byName(d.facts,'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax')[0]);
+  expect(idx.get(k)?.values).toEqual(['383285000000']);
+  expect(idx.get(k)?.facts).toHaveLength(2);
+ });
+ it('resolves namespaces by xmlns declarations: a document with every prefix renamed parses identically',()=>{
+  const variant=rewritePrefixes(AAPL,{ix:'inl',xbrli:'xi',xbrldi:'xd',iso4217:'cur','us-gaap':'g',dei:'d',ixt:'tr',srt:'s'});
+  expect(variant).not.toContain('<ix:nonFraction');expect(variant).toContain('<inl:nonFraction name="g:Assets"');expect(variant).toContain('>cur:USD<');
+  expect(parseInlineXbrl(variant)).toEqual(d);
+ });
+ it('an element named nonFraction in a foreign namespace is not a fact',()=>{
+  const foreign=AAPL.replace('</body>','<p><foo:nonFraction xmlns:foo="urn:not-ix" name="us-gaap:Liabilities" contextRef="c-4" unitRef="usd">1</foo:nonFraction></p></body>');
+  expect(parseInlineXbrl(foreign).facts).toHaveLength(11);
+ });
+});
+
+describe('ix:nonFraction text grammar by format (spec §5.2 regexes)',()=>{
+ it.each([
+  ['',' 1,234.5 ','1234.5'],
+  ['','-12','-12'],
+  ['','1.234,5','format'],
+  ['format="ixt:num-dot-decimal"','1,234,567.89','1234567.89'],
+  ['format="ixt3:numdotdecimal"','12.5','12.5'],
+  ['format="ixt5:num-dot-decimal"','7','7'],
+  ['format="ixt:num-comma-decimal"','1.234.567,89','1234567.89'],
+  ['format="ixt3:numcommadecimal"','12,5','12.5'],
+  ['format="ixt:fixed-zero"','—','0'],
+  ['format="ixt3:zerodash"','-','0'],
+  ['format="ixt3:numwordsen"',' None ','0'],
+  ['format="ixt3:numwordsen"','no','0'],
+  ['format="ixt3:numwordsen"','three','format'],
+  ['format="ixt-sec:numwordsen"','no','format'],
+  ['format="ixt:date-monthname-day-year-en"','1','format'],
+  ['format="foo:num-dot-decimal"','1','format'],
+  ['format="ixt:num-dot-decimal"','1,000&#160;','1000'],
+ ])('%s %j → %s',(attrs,text,want)=>{expect(valueOf(nf(attrs,text))).toBe(want);});
+ it('applies scale and sign; rejects a malformed scale or sign',()=>{
+  expect(valueOf(nf('scale="3"','1.5'))).toBe('1500');
+  expect(valueOf(nf('scale="-2"','150'))).toBe('1.5');
+  expect(valueOf(nf('scale="6" sign="-"','22,354'))).toBe('-22354000000');
+  expect(valueOf(nf('sign="-"','0'))).toBe('0');
+  expect(valueOf(nf('sign="+"','1'))).toBe('sign');
+  expect(valueOf(nf('scale="x"','1'))).toBe('scale');
+ });
+ it('xsi:nil → unsupported(nil) with name and period, never a fact',()=>{
+  const d=one(nf('xsi:nil="true"',''));
+  expect(d.facts).toEqual([]);
+  expect(d.unsupported).toEqual([{reason:'nil',name:'us-gaap:Revenues',contextRef:'d',periodStart:'2024-01-01',periodEnd:'2024-12-31'}]);
+ });
+ it('a nested nonFraction gives the outer fact the innermost text; ix:exclude text is not fact text',()=>{
+  const d=one(`<ix:nonFraction name="us-gaap:Assets" contextRef="i" unitRef="usd">(<ix:nonFraction name="us-gaap:LiabilitiesAndStockholdersEquity" contextRef="i" unitRef="usd">5</ix:nonFraction>)</ix:nonFraction><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer<ix:exclude> (see note 1)</ix:exclude></ix:nonNumeric>`);
+  expect(d.facts.map(f=>[f.name,f.value])).toEqual([['us-gaap:LiabilitiesAndStockholdersEquity','5'],['us-gaap:Assets','5']]);
+  expect(d.nonNumeric['dei:EntityFilerCategory']).toBe('Accelerated Filer');
+ });
+});
+
+describe('contexts and units',()=>{
+ it('ANY child element of segment or scenario makes the context dimensional (skipped, not unsupported)',()=>{
+  const res=RES+ctx('typed',DUR,{segment:'<xbrldi:typedMember dimension="us-gaap:X"><us-gaap:Y>1</us-gaap:Y></xbrldi:typedMember>'})+ctx('scen',DUR,{scenario:'<foo:Plan xmlns:foo="urn:x">budget</foo:Plan>'})+ctx('emptyseg',DUR,{segment:' '});
+  const d=parseInlineXbrl(doc(nf('','1','us-gaap:Revenues','typed')+nf('','2','us-gaap:Revenues','scen')+nf('','3','us-gaap:Revenues','emptyseg'),res));
+  expect(d.facts.map(f=>f.value)).toEqual(['3']);   // an empty segment has no child element
+  expect(d.unsupported).toEqual([]);
+ });
+ it('two contexts with the same entity and period give facts with the same key (normalised dedupe)',()=>{
+  const d=parseInlineXbrl(doc(nf('','10','us-gaap:Revenues','d')+nf('','10','us-gaap:Revenues','d2')+nf('','11','us-gaap:Revenues','d3'),RES+ctx('d2',DUR)+ctx('d3',DUR)));
+  const keys=d.facts.map(ixFactKey);
+  expect(new Set(keys).size).toBe(1);
+  expect(indexIxFacts(d.facts).get(keys[0])?.values).toEqual(['10','11']);   // two values under one key → right_ambiguous at the pair
+ });
+ it('unknown context, unknown unit, forever period, non-ISO date → unsupported with a reason',()=>{
+  const res=RES+ctx('f','<xbrli:forever/>')+ctx('bad','<xbrli:instant>2024-12-31T00:00:00</xbrli:instant>');
+  const d=parseInlineXbrl(doc(nf('','1','us-gaap:Revenues','nope')+nf('','1','us-gaap:Revenues','d','nounit')+nf('','1','us-gaap:Revenues','f')+nf('','1','us-gaap:Revenues','bad'),res));
+  expect(d.facts).toEqual([]);
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['context','unit','period','period']);
+ });
+ it('divide → <num>/<den> normalised by units.ts; multiplied or unknown measures → unsupported(unit)',()=>{
+  const res=RES+'<xbrli:unit id="eps"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>'
+   +'<xbrli:unit id="two"><xbrli:measure>iso4217:USD</xbrli:measure><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>'
+   +'<xbrli:unit id="yr" xmlns:utr="http://www.xbrl.org/2009/utr"><xbrli:measure>utr:Y</xbrli:measure></xbrli:unit>'
+   +'<xbrli:unit id="pure"><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unit>';
+  const d=parseInlineXbrl(doc(nf('','1.5','us-gaap:EarningsPerShareBasic','d','eps')+nf('','1','us-gaap:Revenues','d','two')+nf('','1','us-gaap:Revenues','d','yr')+nf('','0.2','us-gaap:Revenues','d','pure'),res));
+  expect(d.facts.map(f=>[f.unit,f.value])).toEqual([['EUR/share','1.5'],['pure','0.2']]);
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['unit','unit']);
+ });
+});
+
+describe('document-level behaviour and the tokenizer bounds',()=>{
+ it('a document without any ix element is not_inline_xbrl',()=>{
+  expect(parseInlineXbrl('<html><body><p>Annual report</p></body></html>')).toEqual({facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]});
+ });
+ it('ix:fraction, ix:tuple and tuple members are unsupported; conflicting dei texts keep the first and report',()=>{
+  const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"></ix:tuple><ix:fraction name="us-gaap:F" contextRef="d" unitRef="usd"><ix:numerator>1</ix:numerator><ix:denominator>2</ix:denominator></ix:fraction>'+nf('tupleRef="t1"','1')+'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>');
+  expect(d.facts).toEqual([]);
+  expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','ix_fraction','tuple_member','nonnumeric_conflict']);
+  expect(d.nonNumeric['dei:EntityFilerCategory']).toBe('Accelerated Filer');
+ });
+ it('decodes the five XML entities, &nbsp; and numeric references; leaves unknown entities literal',()=>{
+  expect(decodeEntities('a&lt;b&gt;&amp;&quot;&apos;&nbsp;&#65;&#x42;&bogus;')).toBe('a<b>&"\' AB&bogus;');
+ });
+ it('skips comments, PIs, a DOCTYPE without internal subset; script content is raw text; CDATA is text',()=>{
+  const d=parseInlineXbrl('<?xml version="1.0"?><!DOCTYPE html>'+doc('<!-- <ix:nonFraction> --><script>if(a<b&&c){x()}</script><![CDATA[ignored]]>'+nf('','4')));
+  expect(d.facts.map(f=>f.value)).toEqual(['4']);
+ });
+ it('refuses an internal DTD subset, a mismatched close tag and unclosed elements with IxbrlParseError codes',()=>{
+  const code=(s:string)=>{try{parseInlineXbrl(s);return 'parsed';}catch(e){return e instanceof IxbrlParseError?e.code:'other';}};
+  expect(code('<!DOCTYPE x [<!ENTITY a "b">]><x/>')).toBe('dtd_unsupported');
+  expect(code('<a><b></a>')).toBe('mismatched_close');
+  expect(code('<a><b></b>')).toBe('unclosed_elements');
+  expect(code('<a x=1></a>')).toBe('bad_attribute');
+ });
+ it('tokens carry source offsets (used by the trimmer)',()=>{
+  const src='<a x="1">hi</a>';
+  expect([...tokenizeXml(src)].map(t=>[t.t,src.slice(t.start,t.end)])).toEqual([['open','<a x="1">'],['text','hi'],['close','</a>']]);
+ });
+});
diff --git a/src/lib/dq/reconcile/ixbrl.ts b/src/lib/dq/reconcile/ixbrl.ts
new file mode 100644
index 0000000..d3c7e33
--- /dev/null
+++ b/src/lib/dq/reconcile/ixbrl.ts
@@ -0,0 +1,336 @@
+// src/lib/dq/reconcile/ixbrl.ts
+// Inline XBRL subset parser (spec §5.2), IXBRL_PARSER_VERSION='ixbrl/1'.
+// A bounded streaming XML tokenizer (elements, attributes, the five XML entities plus &nbsp; and numeric
+// character references; comments, processing instructions and a DOCTYPE WITHOUT internal subset are
+// skipped; an internal DTD subset is refused; CDATA is literal text; script/style content is raw text;
+// depth <= 1000, attributes <= 256 per element) feeds a parser that resolves every element name and every
+// QName value through the in-scope xmlns declarations, so prefixes never matter.
+// Supported subset (each has a test); everything else lands in `unsupported` and is never merged:
+//  - xbrli:context: entity/identifier; period startDate+endDate | instant, dates YYYY-MM-DD. ANY child
+//    element inside segment or scenario marks the context dimensional and its facts are skipped (out of
+//    scope by design, not reported). Facts carry (entity, period), so equal contexts with different ids
+//    give the same key (ixFactKey) — the normalised dedupe.
+//  - xbrli:unit: one measure, or divide with exactly one numerator and one denominator measure; iso4217
+//    and xbrli measures become USD / shares / pure, then facts/units.ts normalizeUnit ('USD/shares' →
+//    'USD/share'); anything else → unsupported(unit).
+//  - ix:nonFraction: name, contextRef, unitRef, scale, sign, decimals, format, xsi:nil. Text grammar by
+//    format (transformation registries 2015-02-26, 2020-02-12, 2022-02-16 only):
+//      (no format), num-dot-decimal, numdotdecimal   ^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$   commas dropped
+//      num-comma-decimal, numcommadecimal            ^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$    dots dropped, comma = point
+//      fixed-zero, zerodash                          → 0
+//      numwordsen                                    'no' | 'none' (trimmed, case-insensitive) → 0
+//    any other format or no match → unsupported(format); xsi:nil = true|1 → unsupported(nil).
+//    value = canonical decimal × 10^scale, negated when sign='-'. A nested ix:nonFraction gives the outer
+//    fact the innermost text; text inside ix:exclude is not fact text.
+//  - ix:nonNumeric: only dei:EntityFilerCategory, dei:DocumentFiscalYearFocus, dei:DocumentPeriodEndDate
+//    (whitespace-collapsed raw text; a second, different text → unsupported(nonnumeric_conflict)).
+//  - ix:fraction, ix:tuple and facts with tupleRef → unsupported. No ix element at all → not_inline_xbrl.
+// Malformed XML throws IxbrlParseError(code); the pair turns that into unsupported results.
+import {canonicalDecimal} from '../../facts/json-numbers';
+import {normalizeUnit} from '../../facts/units';
+
+export const IXBRL_PARSER_VERSION='ixbrl/1';
+export const MAX_IXBRL_BYTES=50*1024*1024;
+export const NS={ix:'http://www.xbrl.org/2013/inlineXBRL',xbrli:'http://www.xbrl.org/2003/instance',xbrldi:'http://xbrl.org/2006/xbrldi',xsi:'http://www.w3.org/2001/XMLSchema-instance',iso4217:'http://www.xbrl.org/2003/iso4217',xml:'http://www.w3.org/XML/1998/namespace'} as const;
+export const TRANSFORM_NS:readonly string[]=['http://www.xbrl.org/inlineXBRL/transformation/2015-02-26','http://www.xbrl.org/inlineXBRL/transformation/2020-02-12','http://www.xbrl.org/inlineXBRL/transformation/2022-02-16'];
+export const DEI_NON_NUMERIC:readonly string[]=['dei:EntityFilerCategory','dei:DocumentFiscalYearFocus','dei:DocumentPeriodEndDate'];
+
+export interface IxFact{name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number;entity:string;contextRef:string;unitRef:string}
+export interface IxUnsupported{reason:string;name?:string;contextRef?:string;periodStart?:string|null;periodEnd?:string}
+export interface IxbrlDocument{facts:IxFact[];nonNumeric:Record<string,string>;unsupported:IxUnsupported[]}
+export class IxbrlParseError extends Error{constructor(public readonly code:string){super(code);this.name='IxbrlParseError';}}
+
+// ---------------- tokenizer ----------------
+export type XmlToken=
+ |{t:'open';name:string;attrs:[string,string][];self:boolean;start:number;end:number}
+ |{t:'close';name:string;start:number;end:number}
+ |{t:'text';text:string;start:number;end:number};
+const MAX_DEPTH=1000,MAX_ATTRS=256;
+const NAME_RE=/[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y;
+const NAMED:Record<string,string>={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",nbsp:' '};
+const fail=(code:string):never=>{throw new IxbrlParseError(code);};
+const isWs=(c:number)=>c===32||c===9||c===10||c===13;
+function nameAt(doc:string,at:number):string|null{NAME_RE.lastIndex=at;const m=NAME_RE.exec(doc);return m?m[0]:null;}
+
+export function decodeEntities(s:string):string{
+ if(!s.includes('&'))return s;
+ return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,31});/g,(m,b:string)=>{
+  if(b[0]!=='#')return NAMED[b]??m;
+  const cp=b[1]==='x'||b[1]==='X'?Number.parseInt(b.slice(2),16):Number.parseInt(b.slice(1),10);
+  return cp>0&&cp<=0x10ffff&&(cp<0xd800||cp>0xdfff)?String.fromCodePoint(cp):m;
+ });
+}
+
+/** Streaming tokens with source offsets [start, end). Throws IxbrlParseError on malformed markup. */
+export function* tokenizeXml(doc:string):Generator<XmlToken>{
+ const n=doc.length;let i=doc.charCodeAt(0)===0xfeff?1:0;let depth=0;let rawEnd:string|null=null;let lower:string|null=null;
+ while(i<n){
+  if(rawEnd!==null){
+   lower??=doc.toLowerCase();
+   const e=lower.indexOf(rawEnd,i);if(e<0)fail('unterminated_raw_text');
+   if(e>i)yield {t:'text',text:doc.slice(i,e),start:i,end:e};
+   rawEnd=null;i=e;continue;
+  }
+  const lt=doc.indexOf('<',i);
+  if(lt<0){yield {t:'text',text:decodeEntities(doc.slice(i)),start:i,end:n};break;}
+  if(lt>i)yield {t:'text',text:decodeEntities(doc.slice(i,lt)),start:i,end:lt};
+  if(doc.startsWith('<!--',lt)){const e=doc.indexOf('-->',lt+4);if(e<0)fail('unterminated_comment');i=e+3;continue;}
+  if(doc.startsWith('<![CDATA[',lt)){const e=doc.indexOf(']]>',lt+9);if(e<0)fail('unterminated_cdata');yield {t:'text',text:doc.slice(lt+9,e),start:lt,end:e+3};i=e+3;continue;}
+  if(doc.startsWith('<?',lt)){const e=doc.indexOf('?>',lt+2);if(e<0)fail('unterminated_pi');i=e+2;continue;}
+  if(doc.startsWith('<!',lt)){const e=doc.indexOf('>',lt+2);if(e<0)fail('unterminated_declaration');if(doc.slice(lt,e).includes('['))fail('dtd_unsupported');i=e+1;continue;}
+  if(doc.charCodeAt(lt+1)===47){
+   const name=nameAt(doc,lt+2)??fail('bad_close_tag');
+   let j=lt+2+name.length;while(j<n&&isWs(doc.charCodeAt(j)))j++;
+   if(doc[j]!=='>')fail('bad_close_tag');
+   depth--;if(depth<0)fail('unbalanced_close');
+   yield {t:'close',name,start:lt,end:j+1};i=j+1;continue;
+  }
+  const name=nameAt(doc,lt+1)??fail('bad_open_tag');
+  let j=lt+1+name.length;const attrs:[string,string][]=[];let self=false;
+  for(;;){
+   while(j<n&&isWs(doc.charCodeAt(j)))j++;
+   if(j>=n)fail('unterminated_tag');
+   if(doc.startsWith('/>',j)){self=true;j+=2;break;}
+   if(doc[j]==='>'){j++;break;}
+   const an=nameAt(doc,j)??fail('bad_attribute');j+=an.length;
+   while(j<n&&isWs(doc.charCodeAt(j)))j++;
+   if(doc[j]!=='=')fail('bad_attribute');
+   j++;while(j<n&&isWs(doc.charCodeAt(j)))j++;
+   const q=doc[j];if(q!=='"'&&q!=="'")fail('bad_attribute');
+   const e=doc.indexOf(q,j+1);if(e<0)fail('unterminated_attribute');
+   attrs.push([an,decodeEntities(doc.slice(j+1,e))]);j=e+1;
+   if(attrs.length>MAX_ATTRS)fail('too_many_attributes');
+  }
+  yield {t:'open',name,attrs,self,start:lt,end:j};
+  if(!self){
+   depth++;if(depth>MAX_DEPTH)fail('too_deep');
+   const local=name.slice(name.indexOf(':')+1).toLowerCase();
+   if(local==='script'||local==='style')rawEnd=`</${name.toLowerCase()}`;
+  }
+  i=j;
+ }
+ if(rawEnd!==null)fail('unterminated_raw_text');
+}
+
+// ---------------- names ----------------
+export type NsMap=ReadonlyMap<string,string>;   // prefix ('' = default namespace) → URI
+/** Element names and QName values use the default namespace when unprefixed (useDefault); plain attribute names never do. */
+export function resolveQName(q:string,ns:NsMap,useDefault:boolean):{uri:string|null;local:string}{
+ const k=q.indexOf(':');
+ if(k<0)return {uri:useDefault?(ns.get('')??null):null,local:q};
+ const p=q.slice(0,k);
+ return {uri:p==='xml'?NS.xml:(ns.get(p)??null),local:q.slice(k+1)};
+}
+/** Canonical concept name: us-gaap / dei / ifrs-full / srt by namespace URI pattern (any taxonomy year), else Clark notation {uri}local. */
+export function canonicalConcept(uri:string|null,local:string):string{
+ if(uri!==null){
+  if(/^http:\/\/fasb\.org\/us-gaap\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `us-gaap:${local}`;
+  if(/^http:\/\/xbrl\.sec\.gov\/dei\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `dei:${local}`;
+  if(/^https?:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full$/.test(uri))return `ifrs-full:${local}`;
+  if(/^http:\/\/fasb\.org\/srt\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `srt:${local}`;
+ }
+ return `{${uri??''}}${local}`;
+}
+const attrOf=(attrs:readonly [string,string][],name:string)=>attrs.find(([k])=>k===name)?.[1];
+function nsAttr(attrs:readonly [string,string][],ns:NsMap,uri:string,local:string):string|undefined{
+ for(const [k,v] of attrs){
+  const i=k.indexOf(':');if(i<0)continue;
+  const p=k.slice(0,i);if(p==='xmlns')continue;
+  if(ns.get(p)===uri&&k.slice(i+1)===local)return v;
+ }
+ return undefined;
+}
+
+// ---------------- values ----------------
+const RE_DOT=/^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$/;
+const RE_COMMA=/^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$/;
+/** Digits (no exponent) for a format's text, or null when the text does not match the format's grammar. */
+export function parseFactText(format:string,text:string):string|null{
+ switch(format){
+  case 'none':case 'num-dot-decimal':case 'numdotdecimal':return RE_DOT.test(text)?text.replace(/[\s,]/g,''):null;
+  case 'num-comma-decimal':case 'numcommadecimal':return RE_COMMA.test(text)?text.replace(/[\s.]/g,'').replace(',','.'):null;
+  case 'fixed-zero':case 'zerodash':return '0';
+  case 'numwordsen':{const t=text.trim().toLowerCase();return t==='no'||t==='none'?'0':null;}
+  default:return null;
+ }
+}
+function formatOf(q:string|undefined,ns:NsMap):string|null{
+ if(q===undefined)return 'none';
+ const r=resolveQName(q.trim(),ns,true);
+ return r.uri!==null&&TRANSFORM_NS.includes(r.uri)?r.local:null;
+}
+/** Right-side key of a fact: (concept, canonical context = entity + period, unit). */
+export const ixFactKey=(f:Pick<IxFact,'name'|'entity'|'periodStart'|'periodEnd'|'unit'>)=>[f.name,f.entity,f.periodStart??'',f.periodEnd,f.unit].join('|');
+/** Facts grouped by ixFactKey with their DISTINCT values (canonical decimal equality), in document order. */
+export function indexIxFacts(facts:readonly IxFact[]):Map<string,{values:string[];facts:IxFact[]}>{
+ const out=new Map<string,{values:string[];facts:IxFact[]}>();
+ for(const f of facts){
+  const k=ixFactKey(f);const g=out.get(k)??{values:[],facts:[]};
+  if(!g.values.includes(f.value))g.values.push(f.value);
+  g.facts.push(f);out.set(k,g);
+ }
+ return out;
+}
+
+// ---------------- parser ----------------
+interface Frame{name:string;ns:NsMap;uri:string|null;local:string}
+interface RawCtx{id:string;scheme:string;ident:string;start:string;end:string;instant:string;forever:boolean;dimensional:boolean}
+interface RawUnit{id:string;measures:string[];num:string[];den:string[]}
+interface FactFrame{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;inner:string|null}
+interface RawFact{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string}
+/**
+ * Mutable parser state, one explicitly typed object (plan audit P7): the open/close callbacks and the token
+ * loop all read and write it through `st.*`. Closure `let`s assigned inside callbacks are invisible to the
+ * loop's control-flow analysis (TS narrows them to their initial null/false → `never`, TS2322/TS2339 under
+ * strict 5.9); property reads of a typed object are narrowed per use instead.
+ */
+interface ParseState{
+ sawIx:boolean;exclude:number;
+ ctx:RawCtx|null;ctxField:'ident'|'start'|'end'|'instant'|null;segDepth:number;
+ unit:RawUnit|null;unitPart:'num'|'den'|null;measure:{ns:NsMap;text:string}|null;
+}
+const DATE=/^\d{4}-\d{2}-\d{2}$/;
+
+function periodOf(c:RawCtx):{start:string|null;end:string}|null{
+ if(c.forever)return null;
+ const s=c.start.trim(),e=c.end.trim(),i=c.instant.trim();
+ if(i!==''&&s===''&&e==='')return DATE.test(i)?{start:null,end:i}:null;
+ if(i===''&&DATE.test(s)&&DATE.test(e)&&s<=e)return {start:s,end:e};
+ return null;
+}
+function unitString(u:RawUnit):string|null{
+ if(u.num.length>0||u.den.length>0)return u.num.length===1&&u.den.length===1&&u.measures.length===0?`${u.num[0]}/${u.den[0]}`:null;
+ return u.measures.length===1?u.measures[0]:null;
+}
+
+export function parseInlineXbrl(doc:string):IxbrlDocument{
+ const out:IxbrlDocument={facts:[],nonNumeric:{},unsupported:[]};
+ const root:NsMap=new Map([['xml',NS.xml]]);
+ const stack:Frame[]=[];
+ const contexts=new Map<string,RawCtx>();const units=new Map<string,RawUnit>();const rawFacts:RawFact[]=[];
+ const open:FactFrame[]=[];
+ const st:ParseState={sawIx:false,exclude:0,ctx:null,ctxField:null,segDepth:-1,unit:null,unitPart:null,measure:null};
+
+ const onOpen=(f:Frame,attrs:[string,string][])=>{
+  if(st.ctx!==null&&st.segDepth>=0){st.ctx.dimensional=true;return;}   // any element inside segment / scenario
+  if(f.uri===NS.ix){
+   st.sawIx=true;
+   if(f.local==='nonFraction'||f.local==='nonNumeric'){
+    if(attrOf(attrs,'tupleRef')!==undefined)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
+    open.push({kind:f.local==='nonFraction'?'nf':'nn',attrs,ns:f.ns,text:'',inner:null});
+   }else if(f.local==='exclude')st.exclude++;
+   else if(f.local==='fraction'||f.local==='tuple')out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
+   return;
+  }
+  if(f.uri!==NS.xbrli)return;
+  if(f.local==='context'){st.ctx={id:attrOf(attrs,'id')??'',scheme:'',ident:'',start:'',end:'',instant:'',forever:false,dimensional:false};return;}
+  if(st.ctx!==null){
+   if(f.local==='segment'||f.local==='scenario'){st.segDepth=stack.length;return;}
+   if(f.local==='identifier'){st.ctx.scheme=attrOf(attrs,'scheme')??'';st.ctxField='ident';return;}
+   if(f.local==='startDate'){st.ctxField='start';return;}
+   if(f.local==='endDate'){st.ctxField='end';return;}
+   if(f.local==='instant'){st.ctxField='instant';return;}
+   if(f.local==='forever'){st.ctx.forever=true;return;}
+   return;
+  }
+  if(f.local==='unit'){st.unit={id:attrOf(attrs,'id')??'',measures:[],num:[],den:[]};return;}
+  if(st.unit!==null){
+   if(f.local==='unitNumerator')st.unitPart='num';
+   else if(f.local==='unitDenominator')st.unitPart='den';
+   else if(f.local==='measure')st.measure={ns:f.ns,text:''};
+  }
+ };
+ const onClose=(f:Frame)=>{
+  if(f.uri===NS.ix){
+   if(f.local==='exclude'){st.exclude=Math.max(0,st.exclude-1);return;}
+   if(f.local==='nonFraction'||f.local==='nonNumeric'){
+    const fr=open.pop();if(!fr)return;
+    const text=fr.inner??fr.text;
+    const parent=open[open.length-1];
+    if(parent){if(parent.kind==='nf')parent.inner=text;else parent.text+=text;}
+    rawFacts.push({kind:fr.kind,attrs:fr.attrs,ns:fr.ns,text});
+   }
+   return;
+  }
+  if(f.uri!==NS.xbrli)return;
+  if(st.ctx!==null){
+   if(f.local==='context'){contexts.set(st.ctx.id,st.ctx);st.ctx=null;st.ctxField=null;st.segDepth=-1;return;}
+   if((f.local==='segment'||f.local==='scenario')&&st.segDepth===stack.length){st.segDepth=-1;return;}
+   if(f.local==='identifier'||f.local==='startDate'||f.local==='endDate'||f.local==='instant')st.ctxField=null;
+   return;
+  }
+  if(st.unit!==null){
+   if(f.local==='unit'){units.set(st.unit.id,st.unit);st.unit=null;st.unitPart=null;return;}
+   if(f.local==='measure'&&st.measure!==null){
+    const r=resolveQName(st.measure.text.trim(),st.measure.ns,true);
+    const m=r.uri===NS.iso4217||r.uri===NS.xbrli?r.local:`{${r.uri??''}}${r.local}`;
+    (st.unitPart==='num'?st.unit.num:st.unitPart==='den'?st.unit.den:st.unit.measures).push(m);st.measure=null;return;
+   }
+   if(f.local==='unitNumerator'||f.local==='unitDenominator')st.unitPart=null;
+  }
+ };
+
+ for(const tok of tokenizeXml(doc)){
+  if(tok.t==='text'){
+   if(st.ctx!==null&&st.ctxField!==null&&st.segDepth<0)st.ctx[st.ctxField]+=tok.text;
+   if(st.measure!==null)st.measure.text+=tok.text;
+   if(open.length>0&&st.exclude===0)open[open.length-1].text+=tok.text;
+   continue;
+  }
+  if(tok.t==='open'){
+   const parent=stack.length>0?stack[stack.length-1].ns:root;
+   let ns:NsMap=parent;
+   const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
+   if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
+   const {uri,local}=resolveQName(tok.name,ns,true);
+   const frame:Frame={name:tok.name,ns,uri,local};
+   if(tok.self){onOpen(frame,tok.attrs);onClose(frame);}
+   else{onOpen(frame,tok.attrs);stack.push(frame);}
+   continue;
+  }
+  const frame=stack.pop();
+  if(!frame||frame.name!==tok.name)throw new IxbrlParseError('mismatched_close');
+  onClose(frame);
+ }
+ if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
+ if(!st.sawIx)return {facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]};
+
+ for(const f of rawFacts){
+  const nameQ=attrOf(f.attrs,'name');
+  if(!nameQ){out.unsupported.push({reason:'name'});continue;}
+  const q=resolveQName(nameQ.trim(),f.ns,true);const name=canonicalConcept(q.uri,q.local);
+  if(f.kind==='nn'){
+   if(!DEI_NON_NUMERIC.includes(name))continue;
+   const text=f.text.replace(/\s+/g,' ').trim();
+   const prev=out.nonNumeric[name];
+   if(prev===undefined)out.nonNumeric[name]=text;
+   else if(prev!==text)out.unsupported.push({reason:'nonnumeric_conflict',name});
+   continue;
+  }
+  if(attrOf(f.attrs,'tupleRef')!==undefined)continue;   // reported when opened
+  const contextRef=attrOf(f.attrs,'contextRef')??'';
+  const c=contexts.get(contextRef);
+  if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
+  if(c.dimensional)continue;
+  const period=periodOf(c);
+  if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
+  const where={name,contextRef,periodStart:period.start,periodEnd:period.end};
+  const nil=nsAttr(f.attrs,f.ns,NS.xsi,'nil');
+  if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
+  const unitRef=attrOf(f.attrs,'unitRef')??'';
+  const u=units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
+  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
+  const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
+  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
+  const sign=attrOf(f.attrs,'sign');
+  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
+  const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
+  const digits=fmt===null?null:parseFactText(fmt,f.text);
+  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
+  const scale=Number(scaleRaw);
+  let value=canonicalDecimal(`${digits}e${scale}`);
+  if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
+  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:attrOf(f.attrs,'decimals')??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
+ }
+ return out;
+}

exec
/bin/zsh -lc "find src -iname '*agents*' -o -name CLAUDE.md; cat src/lib/facts/units.ts; cat src/lib/facts/json-numbers.ts; sed -n '135,200p' src/lib/dq/reconcile/ixbrl.test.ts; rg -n '13b|continu|MAX_IXBRL|tuple' docs/* -g '*ixbrl*' -g '*recon*' -g '*foundation*'; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 229ms:
// src/lib/facts/units.ts
// Unit normalisation (spec §3). companyfacts units become 'USD' (or another ISO currency as-is),
// 'shares', '<CCY>/share' and 'pure'; Tushare money is 'CNY', eps 'CNY/share', total_share
// 'shares'. The unit is part of the fact key, so this is the only place where two spellings may
// be merged; anything else is kept distinct or rejected (null) and never silently converted.
import type {UnitKind} from './types';

/** Active + retired-since-2008 ISO 4217 alphabetic codes (funds/metals/test codes, XDR and XSU excluded), sorted; older filings (companyfacts goes back to ~2009) use retired codes; other currencies are kept as-is (spec §3). */
export const CURRENCIES=['AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BYR','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUC','CUP','CVE','CYP','CZK','DJF','DKK','DOP','DZD','EEK','EGP','ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LTL','LVL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRO','MRU','MTL','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SKK','SLE','SLL','SOS','SRD','SSP','STD','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD','UYU','UZS','VEF','VES','VND','VUV','WST','XAF','XCD','XCG','XOF','XPF','YER','ZAR','ZMK','ZMW','ZWG','ZWL'] as const;
const CURRENCY=new Set<string>(CURRENCIES);
export const MAX_UNIT_LENGTH=16;

/** companyfacts unit → stored unit, or null when the shape is not one we store (e.g. 'USD/EUR', 'Year', 'sqft'). */
export function normalizeUnit(raw:string):string|null{
 if(raw==='shares'||raw==='pure')return raw;
 if(CURRENCY.has(raw))return raw;
 const m=/^([A-Z]{3})\/shares$/.exec(raw);
 if(m&&CURRENCY.has(m[1]))return `${m[1]}/share`;
 return null;
}

/** Stored unit of a Tushare column by unit kind; money and per-share values are in CNY. */
export function rawUnitOf(kind:UnitKind,currency:string='CNY'):string{
 if(!CURRENCY.has(currency))throw new Error(`unknown_currency:${currency}`);
 return kind==='money'?currency:kind==='shares'?'shares':`${currency}/share`;
}

/** Units a concept of this kind may carry; feed to unitRule('unit_'+kind, unit, allowedUnits(kind)). */
export function allowedUnits(kind:UnitKind):readonly string[]{
 return kind==='money'?CURRENCIES:kind==='shares'?['shares']:CURRENCIES.map(c=>`${c}/share`);
}

/** Kind of a stored unit, or null for units no concept carries ('pure'). */
export function unitKindOf(unit:string):UnitKind|null{
 if(unit==='shares')return 'shares';
 if(CURRENCY.has(unit))return 'money';
 const m=/^([A-Z]{3})\/share$/.exec(unit);
 return m&&CURRENCY.has(m[1])?'per_share':null;
}
// src/lib/facts/json-numbers.ts
// Lossless numeric decoding (spec §6.2, audit N8/R3-7). JSON.parse would turn a 20-digit integer
// or 1e5 into a double, so scanJsonNumbers first rewrites every numeric literal outside strings
// into {"__num":"<literal>"} and parses that. decodeWithSchema then decodes by field name:
// control fields (cik, fy, code, has_more, report_type, …) → integer JS number; decimal fields
// (val, statement value columns) → canonicalDecimal string, inserted into numeric as text;
// any other numeric field → JS number. Equality of values is always on the canonical form.
export interface NumToken{__num:string}
export const isNumToken=(v:unknown):v is NumToken=>typeof v==='object'&&v!==null&&typeof (v as NumToken).__num==='string'&&Object.keys(v as object).length===1;

const TOKEN=/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const JSON_INT=/^-?(?:0|[1-9]\d*)(?![\d])/;
/** True when the string token at [end) is followed by optional JSON whitespace and ':' (i.e. it is an object key). */
function isKeyAt(text:string,end:number):boolean{
 for(let i=end;i<text.length;i++){
  const c=text.charCodeAt(i);
  if(c===32||c===9||c===10||c===13)continue;
  return c===58;
 }
 return false;
}
/**
 * JSON.parse with every numeric literal wrapped as {__num:'<original text>'}. Strings are left intact.
 * The input is first validated with a plain JSON.parse (malformed text fails fast, before the regex pass), and
 * fails closed if an object key decodes to the reserved marker `__num` (also in escaped spellings).
 */
export function scanJsonNumbers(input:Uint8Array|string):unknown{
 const text=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true}).decode(input);
 JSON.parse(text);
 const rewritten=text.replace(TOKEN,(m,offset:number)=>{
  if(m.charCodeAt(0)===34){
   // only a string that could decode to '__num' (7..64 chars, starts with '"_' or has an escape) is parsed
   if(m.length>=7&&m.length<=64&&(m.charCodeAt(1)===95||m.includes('\\'))&&isKeyAt(text,offset+m.length)&&JSON.parse(m)==='__num')throw new Error('reserved_key:__num');
   return m;
  }
  if(!JSON_INT.test(m))throw new Error(`invalid_json_number:${m.slice(0,40)}`);
  return `{"__num":"${m}"}`;
 });
 return JSON.parse(rewritten);
}

const DECIMAL=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
/** Raw-input cap, exponent cap and output cap are chosen together: every accepted output is <= MAX_LITERAL chars, so canonicalDecimal is idempotent. */
const MAX_LITERAL=512;
const MAX_EXPONENT=200;
/** Canonical decimal text: no exponent, no leading/trailing zeros, '-0' → '0'. Throws invalid_decimal. */
export function canonicalDecimal(raw:string):string{
 if(raw.length>MAX_LITERAL)throw new Error('invalid_decimal:length');
 const m=DECIMAL.exec(raw);
 if(!m)throw new Error(`invalid_decimal:${raw.slice(0,40)}`);
 const exp=m[4]===undefined?0:Number(m[4]);
 if(!Number.isSafeInteger(exp)||Math.abs(exp)>MAX_EXPONENT)throw new Error('invalid_decimal:exponent');
 const digits=m[2]+(m[3]??'');
 const point=m[2].length+exp;
 let intPart:string,fracPart:string;
 if(point<=0){intPart='0';fracPart='0'.repeat(-point)+digits;}
 else if(point>=digits.length){intPart=digits+'0'.repeat(point-digits.length);fracPart='';}
 else{intPart=digits.slice(0,point);fracPart=digits.slice(point);}
 intPart=intPart.replace(/^0+(?=\d)/,'');
 let end=fracPart.length;
 while(end>0&&fracPart.charCodeAt(end-1)===48)end--;
 fracPart=fracPart.slice(0,end);
 const zero=intPart==='0'&&fracPart==='';
 const out=`${m[1]==='-'&&!zero?'-':''}${intPart}${fracPart?`.${fracPart}`:''}`;
 if(out.length>MAX_LITERAL)throw new Error('invalid_decimal:length');
 return out;
}
export const decimalEquals=(a:string,b:string):boolean=>canonicalDecimal(a)===canonicalDecimal(b);

export interface NumberSchema{control:readonly string[];decimal:readonly string[]}
export const EDGAR_NUMBER_SCHEMA:NumberSchema={control:['cik','fy'],decimal:['val']};
/** Tushare control columns; the adapter adds the statement's value columns as `decimal`. */
export const TUSHARE_CONTROL_FIELDS:readonly string[]=['code','has_more','report_type','comp_type','is_calc','update_flag','end_type'];

export function decodeNumber(raw:string,mode:'control'|'decimal'|'number',field:string|null):string|number{
 if(mode==='decimal')return canonicalDecimal(raw);
 if(mode==='control'){
  // integrality on the exact decimal text first; Number() would round 1.00000000000000001 to 1 and 1e-400 to 0
  let canon:string;
  try{canon=canonicalDecimal(raw);}catch{throw new Error(`invalid_control_field:${field??''}`);}
  const n=Number(canon);
  if(!/^-?\d+$/.test(canon)||!Number.isSafeInteger(n))throw new Error(`invalid_control_field:${field??''}`);
  return n;
 }
 return Number(raw);
}
const modeOf=(schema:NumberSchema,field:string|null)=>field!==null&&schema.decimal.includes(field)?'decimal':field!==null&&schema.control.includes(field)?'control':'number';

/** Walks a scanJsonNumbers result and decodes every NumToken by the name of its nearest enclosing field. */
export function decodeWithSchema(value:unknown,schema:NumberSchema,field:string|null=null):unknown{
 if(isNumToken(value))return decodeNumber(value.__num,modeOf(schema,field),field);
 if(Array.isArray(value))return value.map(v=>decodeWithSchema(v,schema,field));
 if(value!==null&&typeof value==='object'){
  // fromEntries defines own properties, so a '__proto__' key stays data and never touches the prototype
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,v])=>[k,decodeWithSchema(v,schema,k)]));
 }
 return value;
}

/** Positional rows (Tushare items) → objects keyed by `fields`, each cell decoded by its column name. */
export function decodeColumns(fields:string[],items:unknown[][],schema:NumberSchema):Record<string,unknown>[]{
 return items.map(row=>{
  if(row.length!==fields.length)throw new Error(`invalid_row_width:${row.length}`);
  return Object.fromEntries(fields.map((f,i)=>[f,decodeWithSchema(row[i],schema,f)]));
 });
}

describe('document-level behaviour and the tokenizer bounds',()=>{
 it('a document without any ix element is not_inline_xbrl',()=>{
  expect(parseInlineXbrl('<html><body><p>Annual report</p></body></html>')).toEqual({facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]});
 });
 it('ix:fraction, ix:tuple and tuple members are unsupported; conflicting dei texts keep the first and report',()=>{
  const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"></ix:tuple><ix:fraction name="us-gaap:F" contextRef="d" unitRef="usd"><ix:numerator>1</ix:numerator><ix:denominator>2</ix:denominator></ix:fraction>'+nf('tupleRef="t1"','1')+'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>');
  expect(d.facts).toEqual([]);
  expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','ix_fraction','tuple_member','nonnumeric_conflict']);
  expect(d.nonNumeric['dei:EntityFilerCategory']).toBe('Accelerated Filer');
 });
 it('decodes the five XML entities, &nbsp; and numeric references; leaves unknown entities literal',()=>{
  expect(decodeEntities('a&lt;b&gt;&amp;&quot;&apos;&nbsp;&#65;&#x42;&bogus;')).toBe('a<b>&"\' AB&bogus;');
 });
 it('skips comments, PIs, a DOCTYPE without internal subset; script content is raw text; CDATA is text',()=>{
  const d=parseInlineXbrl('<?xml version="1.0"?><!DOCTYPE html>'+doc('<!-- <ix:nonFraction> --><script>if(a<b&&c){x()}</script><![CDATA[ignored]]>'+nf('','4')));
  expect(d.facts.map(f=>f.value)).toEqual(['4']);
 });
 it('refuses an internal DTD subset, a mismatched close tag and unclosed elements with IxbrlParseError codes',()=>{
  const code=(s:string)=>{try{parseInlineXbrl(s);return 'parsed';}catch(e){return e instanceof IxbrlParseError?e.code:'other';}};
  expect(code('<!DOCTYPE x [<!ENTITY a "b">]><x/>')).toBe('dtd_unsupported');
  expect(code('<a><b></a>')).toBe('mismatched_close');
  expect(code('<a><b></b>')).toBe('unclosed_elements');
  expect(code('<a x=1></a>')).toBe('bad_attribute');
 });
 it('tokens carry source offsets (used by the trimmer)',()=>{
  const src='<a x="1">hi</a>';
  expect([...tokenizeXml(src)].map(t=>[t.t,src.slice(t.start,t.end)])).toEqual([['open','<a x="1">'],['text','hi'],['close','</a>']]);
 });
});
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1630:  if(!universe.has(ticker)){skipped.push(r.ticker);continue;}
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1680:  try{const out=await upsertIssuerByIdentifiers(client,i);if(out.conflict){counts.quarantined++;errors.push({code:'issuer_conflict',key:i.cik});continue;}idByCik.set(i.cik,out.issuer_id!);out.created?counts.inserted++:counts.duplicates++;}
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1684:  const issuer_id=idByCik.get(s.cik);if(!issuer_id)continue;
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1762:  if(!k.lei&&!k.usci&&!k.cik){skipped.push({entity_key,reason:'no_hard_identifier'});continue;}
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1768:  const entity_key=`${s.user_id}:${s.entity_id}`;if(!linked.has(entity_key))continue;
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1770:  if(!universe.has(ticker)){skipped.push({entity_key,reason:`ticker_not_in_universe:${ticker}`});continue;}
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1814:   if(out.conflict){counts.quarantined++;errors.push({code:'issuer_conflict',key:i.entity_key});continue;}
docs/superpowers/plans/2026-11-04-data-foundation-1-dq-and-issuers.md:1821:  const issuer_id=idByKey.get(s.entity_key);if(!issuer_id)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2394:   if(!f||f.issuer_id!==issuer||f.market!==market||f.status!=='quarantined')continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2395:   if(runs.get(f.run_id)?.status!=='published')continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2396:   if(filings.get(f.filing_id)?.mapping_gen!==f.mapping_gen)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2397:   if(open.some(i=>idsOf(i).includes(id)))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2398:   if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2399:   if(resolvedConflicts.some(i=>idsOf(i).includes(id)&&!chosenOf(i).includes(id)))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2436:    if(existing){if(existing.issuer_id===r.issuer_id&&existing.market===r.market)out.set(row.sourceRef,existing.filing_id);continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2453:    if(existingKeys.has(candidate))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2479:    const ids=idsOf(it);if(!ids.some(id=>runIds.has(id)))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:2562:    if(!s){scope.set(k,{issuer_id:row.issuer_id,market,reasons:[...row.reasons],priority:row.priority,fetch_key:row.fetch_key,next_due_at:now(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});n++;continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3810:  if(existingKeys.has(ck)){result.duplicates.push(c);continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3818:  if(values.size>1){result.ambiguous.push({naturalKey:ambiguousKey(issuerId,market,k,cands[0].filingRef,mappingGen),key:keyComponents(issuerId,market,k),candidates:cands});result.counts.quarantined+=cands.length;continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3840:  if(open){result.contestedJoins.push({itemId:open.id,factIds:inserts.map(r=>r.fact_id)});park();continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:3846:   park();continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5036:  if(have.has(id))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5038:  if(row===null)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5055:  if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5091:   if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);attempted++;failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5093:   if(quota){skipped++;errors.push(summary(scope.issuer_id,'quota_exhausted'));continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5895:   await backoff(attempt,budget,wait);continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5900:   await backoff(attempt,budget,wait);continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5956:   if(!units||typeof units!=='object')continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5959:    if(!Array.isArray(entries))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5964:    if(unit===null){bump(`unit_not_allowed:${qualified}:${rawUnit}`);continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5966:     if(!isDate(e?.end)||typeof e.val!=='string'||typeof e.accn!=='string'){bump('entry_shape');continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5967:     if(e.end<sinceDate){bump('before_since_year');continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5969:     if(isDuration!==(concept.nature==='duration')){bump(`nature_mismatch:${qualified}`);continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5970:     if(!isDate(e.filed)){out.missingAvailableDate.push({accn:e.accn,tag:qualified,start:e.start??null,end:e.end,unit:rawUnit,form:e.form??null});continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5973:     if(taken.has(key))continue;                       // a higher-priority tag already covers this period
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5983:    if(duration==='odd'){const days=daysBetween(first.start!,first.end);out.oddDuration.push(Object.assign(build(first,nearestDuration(days)),{periodDays:days}));continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:5986:     continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6049:   if(!TAGS.has(`${tax}:${tag}`))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6052:   if(!Object.keys(units).length)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6799: for(const c of concepts){const t=c.tushare;if(!t||t.api!==api)continue;if('field' in t)set.add(t.field);else t.sum.forEach(f=>set.add(f));}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6881:    const t=c.tushare;if(!t||t.api!==d.api)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6885:    if(value===null){bump(`null:${c.id}`);continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6891:    if(duration==='odd'){out.oddDuration.push(Object.assign(cand,{periodDays:days}));continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:6909:  const api=API_OF_STATEMENT[c.statement];if(!api)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7608:  if(!id){bump(skipped,'unknown_ticker');continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7610:  if(!issuer){bump(skipped,'issuer_not_active');continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7612:  try{key=fetchKey('US',{cik:str(issuer.cik)});}catch{bump(skipped,'no_cik');continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7627:  if(!id||s.is_primary!==true||!CN_TICKER.test(t))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7633:  if(tickers.length===0){bump(skipped,'no_cn_ticker');continue;}
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7946:  const dec=parseDec(row.value);if(!dec)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7976:  if(!isDuration(rev)||isZero(rev.dec))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7986:  if(!isDuration(ocf))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7987:  const cx=same(capexC,ocf);if(!cx)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7992:  if(st.row.duration!=='INSTANT')continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7993:  const lt=instant('long_term_borrowings',st.row.period_end,st.row.unit);if(!lt)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:7995:  if(market==='CN'&&!bonds)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:8002:   if(!isDuration(cur))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:8004:   if(!prior||isZero(prior.dec))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:8019:   const bDur=STEP[a.row.duration];if(!bDur)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:8021:   if(!b||!compatible(a,b))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:8028:   if(w.some((q,j)=>j>0&&(q.unit!==w[0].unit||q.start!==addDays(w[j-1].end,1))))continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:8037:  if(!e0||!e1)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:8038:  const v=div(times(t.dec,2n),add(e0.dec,e1.dec));if(!v)continue;
docs/superpowers/plans/2026-11-04-data-foundation-2-disclosure-facts.md:8055:  catch(e){if(attempt===0&&e instanceof FactsDbError&&e.code==='stale_computation')continue;throw e;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:90:src/lib/dq/reconcile/ixbrl.ts        parseInlineXbrl / IXBRL_PARSER_VERSION（Task 13b；ixbrl-trim.ts 13c）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:324:| §5.1–§5.6 对账 | Task 13a（类型、十进制、哈希、record）、13b（iXBRL 解析）、13c（裁剪与录制）、14a（对登记、lineage 与 US gold 对、`inputsHashNow`）、14b（运行器）、14c（cron 与接线）、15a/15b/15c（美股 iXBRL、样本、集成）、16a/16b（A 股） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:348:| 8 | Task 13a → 13b → 13c | Task 9a（types.ts 的 C3 子集）、12 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:351:| 11 | Task 17a → 17b → 18a → 18b | Task 13b（filer-categories 用 iXBRL 解析器）、13a（`record.ts`）、6a、9a |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:399:| 38 | `IxFact`/`unsupported` 字段（D6） | 增 `entity/contextRef/unitRef` 与 `unsupported` 的可选定位字段，C3/C7 原字段不变 | Task 13b（原稿） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:404:| 43 | iXBRL `ixt-sec:*` 转换（D11） | 只认规格三个注册表；`ixt-sec:*` → `unsupported(format)`，频率在 E4 报告统计 | Task 13b（原稿） |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:424:| 63 | 严格 TS 5.9.3 编译阻断（P7–P11） | P7：`ixbrl.ts` 解析器状态收进显式类型对象 `ParseState`（`st.*`）；P8：`apply.test.ts` 的 `SecFixture` 显式类型；P9：17a/18a 日历夹具补 `acceptance_source:null`；P10：`new Response(new Uint8Array(bytes))`、`sampleBytes:Uint8Array`；P11：`lineage.integration.test.ts` 在 `beforeAll` 插入 `ADMIN` 到 `auth.users`（审计外键不放宽） | Task 13b Step 3/5；Task 4a Step 2；Task 17a/18a Step 1；Task 15a/15c Step 1；Task 15c Step 1 |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:2556:  if(name==='node_modules'||name==='fixtures')continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:3608:   if(x===undefined)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4304:  if(first){first=false;yield stripBom(line);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4388:  if(!Array.isArray(r)||r.every(c=>text(c)===null))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4390:  if(!/^\d{1,5}$/.test(code)){rejected.push({row:i+1,reason:'invalid_stock_code'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4406:  if(!r.isin)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4794:  if(!x){unsupported.push(t);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4821:  if(r.marketSector!=='Equity'){skipped.push(`market_sector:${r.marketSector??'null'}`);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4822:  if(!r.securityType||!ALLOWED_SECURITY_TYPES.has(r.securityType)){skipped.push(`security_type:${r.securityType??'null'}`);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4825:  if(!FIGI.test(figi)){skipped.push('invalid_figi');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4827:  if(!t.ok){skipped.push(t.reason);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4873:  if(res.exhausted){console.error(`${label}: rate limited / unavailable`);process.exitCode=1;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5273:   if(!iss.lei)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5276:    if(!r){out.skipped.push('figi_not_queried');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5277:    if(r.status!=='ok'){out.skipped.push(`openfigi_${r.status}`);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5289:      continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5291:     if(!input.universe.has(c.ticker)){out.skipped.push('ticker_not_in_universe');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5294:      out.ahCandidates.push({issuer_id:iss.issuer_id,ticker:c.ticker,isin,evidence});out.skipped.push('ah_link_candidate');continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5310:   if(!m)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5312:   if(!hk){out.skipped.push('hkex_code_not_listed');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5330:   if(hasFigi(row))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5332:   if(!r)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5333:   if(r.status!=='ok'){out.skipped.push(r.status==='not_found'?'figi_not_found':'openfigi_error');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5337:   if(!c){out.skipped.push('figi_not_found');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5350:    if(current===p.value)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5355:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5360:  if(current===null){write('set');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5361:  if(current===p.value){if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5422:   if(outcome==='written'){counts.inserted++;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5423:   if(outcome==='duplicate'){counts.duplicates++;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5428:    if(stored===null||stored===w.value){counts.failed++;errors.push({code:'row_changed',key:where,message:'stored value changed after conflict'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5429:    await fileOne(claimFor(w,'correct_identifier',stored));continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5438:    continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5714:  catch(e){counts.failed++;errors.push({code:'cninfo_error',key:t.code,message:errorMessage(e)});planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'failed'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5715:  if(!look.hit){skippedSummary.org_id_not_found=(skippedSummary.org_id_not_found??0)+1;planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'not_found'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5718:  if(opts.batchId===null){plan('planned');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5733:    if(n===1){counts.inserted++;plan('written');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5735:    if(now?.cninfo_org_id===orgId){counts.duplicates++;plan('duplicate');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5736:    if(now?.status==='active'&&typeof now.cninfo_org_id==='string'){await claim('correct_identifier',now.cninfo_org_id);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5739:    if(isUnique(e)){await claim('set_identifier',null);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:5961:   if(!existsSync(p))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6270:  if(!u){plan.skipped.push('not_in_universe');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6304:  if(c.kind==='to'&&blocked.has(id)){counts.failed++;errors.push({code:'blocked_by_from_change',key:keyOf(c.row)});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6309:   if(n===1){counts.versioned++;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6314:   if(isUnique(e)){await park(c.row,'ownership_conflict',{reason:'window_overlaps_other_row',change:c.kind,new_value:c.kind==='from'?c.newValidFrom:c.newValidTo});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6699:   if(rows.length===0)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6768:  if(!v)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7253:  if(!ticker||!input.universe.has(ticker)){skip('ticker_not_in_universe');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7254:  if(held.has(ticker)){counts.duplicates++;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7333:     continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7663:   if(!cik){skipped.push('no_cik');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7669:    continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7676:    continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7682:    continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7684:   if(Date.parse(input.fetchedAt)-Date.parse(pc.first_missing_fetched_at)<CLOSE_MIN_DAYS*DAY_MS||input.fileSha256===pc.first_missing_sha256){skipped.push('close_pending');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7686:   if(!conf){skipped.push('close_unconfirmed');errors.push({code:'sec_unavailable',key:cik,message:'submissions not available: close deferred'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7687:   if(conf.tickers.map(t=>t.trim().toUpperCase()).includes(ticker)){skipped.push('close_unconfirmed');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7688:   if(pc.first_missing_as_of<=validFrom){counts.failed++;errors.push({code:'invalid_window',key:`${ticker}:${validFrom}`,message:`first_missing_as_of ${pc.first_missing_as_of} <= valid_from`});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7692:   if(await client.update('issuer_securities',key,{valid_to:pc.first_missing_as_of,valid_to_method:'sec_file_absent',provenance})!==1){changed();continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8105:  if(!i.lei)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8108:   if(!r||r.status!=='ok')continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8110:    if(c.market!=='HK')continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8131:  if(!i)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8132:  if(i.hTickers.length){plan.skipped.push('already_has_h');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8134:  if(seen.has(k))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8137:  if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8139:  if(owner===h.issuer_id){plan.skipped.push('already_attached');linked.add(h.issuer_id);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8142:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8157:   if(r.category?.trim().toLowerCase()!==HKEX_EQUITY_CATEGORY||!r.name)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8159:   if(!n)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8163:   if(linked.has(i.issuer_id)||i.aTickers.length===0||i.hTickers.length>0)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8165:   if(!names.size){plan.skipped.push('name_match_no_name');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8168:   if(codes.size!==1){plan.skipped.push(codes.size?'name_match_multiple':'name_match_none');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8172:   if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:8174:   if(owner!==undefined){plan.skipped.push(owner===i.issuer_id?'already_attached':'name_match_owned');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11410:   if(!f||f.issuer_id!==issuer||f.market!==market||f.status!=='quarantined')continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11411:   if(runs.get(f.run_id)?.status!=='published')continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11412:   if(!visible(f))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11413:   if(open.some(i=>idsOf(i).includes(id)))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11414:   if(open.some(i=>i.reason_code==='same_day_conflict'&&disputes(i,f)))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11415:   if(resolvedConflicts.some(i=>idsOf(i).includes(id)&&!chosenOf(i).includes(id)))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11416:   if(lineageVerdicts.some(i=>(idsOf(i).includes(id)||listOf(detailOf(i).quarantined_fact_ids).includes(id))&&!chosenOf(i).includes(id)))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11417:   if(mismatches.some(i=>idsOf(i).includes(id)&&!passing(i)))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11434:    if(new Set(g.map(f=>f.issuer_id)).size<2||g.every(f=>numericEquals(f.value,g[0].value)))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11688:    const d=detailOf(c);if(!Array.isArray(d.pending_members))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:11690:    const take=list.filter(p=>listed.has(pendingKey(p)));if(take.length===0)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:12366:  catch(e){if(attempt===0&&e instanceof FactsDbError&&e.code==='stale_computation')continue;throw e;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:12421:   if(rows.length===0)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13769:  if(!e||e.acceptedAt===null){notFound++;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13777:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13971:**任务拆分（相对骨架）**：Task 13 → 13a/13b/13c；Task 14 → 14a/14b/14c；Task 15 → 15a/15b/15c；Task 16 → 16a/16b。编号仍在 13–16 内，执行顺序即字母顺序。
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:13980:| `IxFact` 增字段 `entity`、`contextRef`、`unitRef`；`IxUnsupported`（`{reason;name?;contextRef?;periodStart?;periodEnd?}`）；`IxbrlParseError`；`MAX_IXBRL_BYTES`；`NS`；`TRANSFORM_NS`；`DEI_NON_NUMERIC`；`XmlToken`；`tokenizeXml(doc)`；`decodeEntities(s)`；`NsMap`；`resolveQName(q,ns,useDefault)`；`canonicalConcept(uri,local)`；`parseFactText(format,text)`；`ixFactKey(f)`；`indexIxFacts(facts)` | 见 Task 13b | `reconcile/ixbrl.ts` |
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14335:### Task 13b: 内联 XBRL 有界分词器与子集解析器 `ixbrl.ts`（§5.2）
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14531: it('ix:fraction, ix:tuple and tuple members are unsupported; conflicting dei texts keep the first and report',()=>{
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14532:  const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"></ix:tuple><ix:fraction name="us-gaap:F" contextRef="d" unitRef="usd"><ix:numerator>1</ix:numerator><ix:denominator>2</ix:denominator></ix:fraction>'+nf('tupleRef="t1"','1')+'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>');
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14534:  expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','ix_fraction','tuple_member','nonnumeric_conflict']);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14592://  - ix:fraction, ix:tuple and facts with tupleRef → unsupported. No ix element at all → not_inline_xbrl.
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14598:export const MAX_IXBRL_BYTES=50*1024*1024;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14637:   rawEnd=null;i=e;continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14642:  if(doc.startsWith('<!--',lt)){const e=doc.indexOf('-->',lt+4);if(e<0)fail('unterminated_comment');i=e+3;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14643:  if(doc.startsWith('<![CDATA[',lt)){const e=doc.indexOf(']]>',lt+9);if(e<0)fail('unterminated_cdata');yield {t:'text',text:doc.slice(lt+9,e),start:lt,end:e+3};i=e+3;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14644:  if(doc.startsWith('<?',lt)){const e=doc.indexOf('?>',lt+2);if(e<0)fail('unterminated_pi');i=e+2;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14645:  if(doc.startsWith('<!',lt)){const e=doc.indexOf('>',lt+2);if(e<0)fail('unterminated_declaration');if(doc.slice(lt,e).includes('['))fail('dtd_unsupported');i=e+1;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14651:   yield {t:'close',name,start:lt,end:j+1};i=j+1;continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14702:  const i=k.indexOf(':');if(i<0)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14703:  const p=k.slice(0,i);if(p==='xmlns')continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14784:    if(attrOf(attrs,'tupleRef')!==undefined)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14787:   else if(f.local==='fraction'||f.local==='tuple')out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14843:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14854:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14865:  if(!nameQ){out.unsupported.push({reason:'name'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14868:   if(!DEI_NON_NUMERIC.includes(name))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14873:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14875:  if(attrOf(f.attrs,'tupleRef')!==undefined)continue;   // reported when opened
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14878:  if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14879:  if(c.dimensional)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14881:  if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14884:  if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14887:  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14889:  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14891:  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:14894:  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15027:  if(tok.t==='text')continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15031:   close(el,tok.end);continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15086:import {IXBRL_PARSER_VERSION,MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15097: if(bytes.byteLength>MAX_IXBRL_BYTES)throw new Error(`too_large ${url}`);
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15453:  if(((r.detail??{}) as {pair?:unknown}).pair!==pair)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15457:  if(factIds.length===0||!nk.startsWith(prefix)||!nk.endsWith(`:${factIds[0]}`))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15576:    if(!e){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'entry_removed'}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15577:    if(e.pending||e.value===null){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'pending',gold_index:e.index}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15583:    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{gold_index:e.index,fact_ids:rows.map(r=>r.fact_id)}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15585:    if(!left){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{gold_index:e.index,as_of:e.as_of}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15669:     if(!left||!right){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'conflict_rows_missing',fact_ids:ids}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15673:     continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:15676:    if(ok.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',{left_source:'facts.lineage',right_source:'facts.lineage'},{target:member.issuerId,reason:'no_ok_value',values}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16219:  const k=mkey(p.issuer_id,p.market);if(listed.has(k))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16240:  if(have.has(mkey(m.issuer_id,m.market)))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16347:  if(c.state==='failed'){failedMembers++;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16370:   if(want&&!want.has(plan.issuerId))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16396:  if(want&&!want.has(issuerId))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16397:  if(!claimable(c,deps.now()))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16399:  if(!plan){errors.push({code:'member_failed',key,message:'cursor_without_member'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16400:  if(budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',key});members.push({issuerId,market,outcome:'not_started'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:16402:  if(!fence){errors.push({code:'skipped_summary',key:`${key}:claimed`});members.push({issuerId,market,outcome:'claimed_elsewhere'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17109:  if(!entityIs(f.entity,cik))continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17111:  if(!c||unitKindOf(f.unit)!==c.unitKind||(c.nature==='duration')!==(f.periodStart!==null)||f.periodEnd<sinceDate)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17199:   if(picked.length<n){picked.push(incoming);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17242:import {IXBRL_PARSER_VERSION,IxbrlParseError,MAX_IXBRL_BYTES,indexIxFacts,ixFactKey,parseInlineXbrl} from './ixbrl';
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17265:   if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17269:  if(Number(res.headers.get('content-length')??'0')>MAX_IXBRL_BYTES)return {status:'too_large'};
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17271:  return bytes.byteLength>MAX_IXBRL_BYTES?{status:'too_large'}:{status:'ok',bytes};
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17341:    if(!entry){every('unsupported',{reason:'sample_changed'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17343:    if(!filing){every('left_unlinked',{});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17358:     if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha}});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17360:     if(rows.length===0){results[i]=nc('left_missing',{right:rightBase});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17361:     if(rows.length>1){results[i]=nc('left_ambiguous',{fact_ids:rows.map(r=>r.fact_id),right:rightBase});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17370:      continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17374:     if(hit.values.length>1){results[i]=nc('right_ambiguous',{right:{...rightBase,locator,values:hit.values}});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17491:    if(!l){found.push({natural_key:nk,outcome:'left_missing'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17497:     found.push({natural_key:nk,outcome:unsupported?'unsupported':'right_missing'});continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17499:    if(hit.values.length>1){found.push({natural_key:nk,outcome:'right_ambiguous'});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17588:  if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17590:  if(!s)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:17600:  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18443:    if(!row){out.push(notCompared(k.naturalKey,'numeric','incomplete_gold',SIDES,{reason:'row_removed'}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18445:    if(!filing){out.push(notCompared(k.naturalKey,'numeric','left_unlinked',SIDES,{tushare_source_ref:row.tushare_source_ref}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18452:    if(rows.length===0){out.push(notCompared(k.naturalKey,'numeric','left_missing',SIDES,{filing_id:filing.filing_id,...flag}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18453:    if(rows.length>1){out.push(notCompared(k.naturalKey,'numeric','left_ambiguous',SIDES,{fact_ids:rows.map(r=>r.fact_id),...flag}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18603:  if(typeof sha!=='string'||!SHA.test(sha)){pending++;continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18614:  if(!file){failed++;console.log(JSON.stringify({sha256:sha,status:'missing_locally',announcement_ids:[...ids]}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18615:  if(!raw){console.log(JSON.stringify({sha256:sha,status:'found',file,announcement_ids:[...ids]}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:18617:  if(stored.sha256!==sha){failed++;console.log(JSON.stringify({sha256:sha,status:'hash_mismatch',stored:stored.sha256,file}));continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19205:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19217:  if(!p.kind)continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19545:  catch(e){counts.fetched++;counts.failed++;errors.push({code:'sec_unavailable',key:m.issuer_id,message:(e as Error).message.slice(0,200)});continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19548:   if(!e.isInlineXBRL){skip('not_inline_xbrl');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19552:   catch(err){fail(err instanceof FilerCategoryError?err.code:'document_unavailable');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19554:   catch{fail('raw_upload_failed');continue;}   // no evidence in the bucket → no row depends on it (spec §3.1 bucket rule)
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19564:   if(!parsed){skip(cover.category===null?'no_category':'category_unusable');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19566:   if(!periodEnd){skip('no_period_end');continue;}
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:19568:   if(seen.has(fiscalYear)){skip('fiscal_year_duplicate');continue;}   // a newer 10-K already covers this fiscal year
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20188:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20196:   continue;
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:20500: * continue a pass. --issuer is preview-only (a pass always works on its frozen members).
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
/bin/zsh -lc "nl -ba src/lib/dq/reconcile/ixbrl.ts | sed -n '210,340p'; ls node_modules/typescript/lib/typescript.js; rg -n 'continu|tuple|512|bounded' docs/superpowers/specs/2026-11-05-data-foundation-3* | head -25; git status --short; find /Volumes/AIMATE_WORK/Developer -maxdepth 2 -name AGENTS.md -o -name AGENTS.override.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 90ms:
   210	 const contexts=new Map<string,RawCtx>();const units=new Map<string,RawUnit>();const rawFacts:RawFact[]=[];
   211	 const open:FactFrame[]=[];
   212	 const st:ParseState={sawIx:false,exclude:0,ctx:null,ctxField:null,segDepth:-1,unit:null,unitPart:null,measure:null};
   213	
   214	 const onOpen=(f:Frame,attrs:[string,string][])=>{
   215	  if(st.ctx!==null&&st.segDepth>=0){st.ctx.dimensional=true;return;}   // any element inside segment / scenario
   216	  if(f.uri===NS.ix){
   217	   st.sawIx=true;
   218	   if(f.local==='nonFraction'||f.local==='nonNumeric'){
   219	    if(attrOf(attrs,'tupleRef')!==undefined)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
   220	    open.push({kind:f.local==='nonFraction'?'nf':'nn',attrs,ns:f.ns,text:'',inner:null});
   221	   }else if(f.local==='exclude')st.exclude++;
   222	   else if(f.local==='fraction'||f.local==='tuple')out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
   223	   return;
   224	  }
   225	  if(f.uri!==NS.xbrli)return;
   226	  if(f.local==='context'){st.ctx={id:attrOf(attrs,'id')??'',scheme:'',ident:'',start:'',end:'',instant:'',forever:false,dimensional:false};return;}
   227	  if(st.ctx!==null){
   228	   if(f.local==='segment'||f.local==='scenario'){st.segDepth=stack.length;return;}
   229	   if(f.local==='identifier'){st.ctx.scheme=attrOf(attrs,'scheme')??'';st.ctxField='ident';return;}
   230	   if(f.local==='startDate'){st.ctxField='start';return;}
   231	   if(f.local==='endDate'){st.ctxField='end';return;}
   232	   if(f.local==='instant'){st.ctxField='instant';return;}
   233	   if(f.local==='forever'){st.ctx.forever=true;return;}
   234	   return;
   235	  }
   236	  if(f.local==='unit'){st.unit={id:attrOf(attrs,'id')??'',measures:[],num:[],den:[]};return;}
   237	  if(st.unit!==null){
   238	   if(f.local==='unitNumerator')st.unitPart='num';
   239	   else if(f.local==='unitDenominator')st.unitPart='den';
   240	   else if(f.local==='measure')st.measure={ns:f.ns,text:''};
   241	  }
   242	 };
   243	 const onClose=(f:Frame)=>{
   244	  if(f.uri===NS.ix){
   245	   if(f.local==='exclude'){st.exclude=Math.max(0,st.exclude-1);return;}
   246	   if(f.local==='nonFraction'||f.local==='nonNumeric'){
   247	    const fr=open.pop();if(!fr)return;
   248	    const text=fr.inner??fr.text;
   249	    const parent=open[open.length-1];
   250	    if(parent){if(parent.kind==='nf')parent.inner=text;else parent.text+=text;}
   251	    rawFacts.push({kind:fr.kind,attrs:fr.attrs,ns:fr.ns,text});
   252	   }
   253	   return;
   254	  }
   255	  if(f.uri!==NS.xbrli)return;
   256	  if(st.ctx!==null){
   257	   if(f.local==='context'){contexts.set(st.ctx.id,st.ctx);st.ctx=null;st.ctxField=null;st.segDepth=-1;return;}
   258	   if((f.local==='segment'||f.local==='scenario')&&st.segDepth===stack.length){st.segDepth=-1;return;}
   259	   if(f.local==='identifier'||f.local==='startDate'||f.local==='endDate'||f.local==='instant')st.ctxField=null;
   260	   return;
   261	  }
   262	  if(st.unit!==null){
   263	   if(f.local==='unit'){units.set(st.unit.id,st.unit);st.unit=null;st.unitPart=null;return;}
   264	   if(f.local==='measure'&&st.measure!==null){
   265	    const r=resolveQName(st.measure.text.trim(),st.measure.ns,true);
   266	    const m=r.uri===NS.iso4217||r.uri===NS.xbrli?r.local:`{${r.uri??''}}${r.local}`;
   267	    (st.unitPart==='num'?st.unit.num:st.unitPart==='den'?st.unit.den:st.unit.measures).push(m);st.measure=null;return;
   268	   }
   269	   if(f.local==='unitNumerator'||f.local==='unitDenominator')st.unitPart=null;
   270	  }
   271	 };
   272	
   273	 for(const tok of tokenizeXml(doc)){
   274	  if(tok.t==='text'){
   275	   if(st.ctx!==null&&st.ctxField!==null&&st.segDepth<0)st.ctx[st.ctxField]+=tok.text;
   276	   if(st.measure!==null)st.measure.text+=tok.text;
   277	   if(open.length>0&&st.exclude===0)open[open.length-1].text+=tok.text;
   278	   continue;
   279	  }
   280	  if(tok.t==='open'){
   281	   const parent=stack.length>0?stack[stack.length-1].ns:root;
   282	   let ns:NsMap=parent;
   283	   const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
   284	   if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
   285	   const {uri,local}=resolveQName(tok.name,ns,true);
   286	   const frame:Frame={name:tok.name,ns,uri,local};
   287	   if(tok.self){onOpen(frame,tok.attrs);onClose(frame);}
   288	   else{onOpen(frame,tok.attrs);stack.push(frame);}
   289	   continue;
   290	  }
   291	  const frame=stack.pop();
   292	  if(!frame||frame.name!==tok.name)throw new IxbrlParseError('mismatched_close');
   293	  onClose(frame);
   294	 }
   295	 if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
   296	 if(!st.sawIx)return {facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]};
   297	
   298	 for(const f of rawFacts){
   299	  const nameQ=attrOf(f.attrs,'name');
   300	  if(!nameQ){out.unsupported.push({reason:'name'});continue;}
   301	  const q=resolveQName(nameQ.trim(),f.ns,true);const name=canonicalConcept(q.uri,q.local);
   302	  if(f.kind==='nn'){
   303	   if(!DEI_NON_NUMERIC.includes(name))continue;
   304	   const text=f.text.replace(/\s+/g,' ').trim();
   305	   const prev=out.nonNumeric[name];
   306	   if(prev===undefined)out.nonNumeric[name]=text;
   307	   else if(prev!==text)out.unsupported.push({reason:'nonnumeric_conflict',name});
   308	   continue;
   309	  }
   310	  if(attrOf(f.attrs,'tupleRef')!==undefined)continue;   // reported when opened
   311	  const contextRef=attrOf(f.attrs,'contextRef')??'';
   312	  const c=contexts.get(contextRef);
   313	  if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
   314	  if(c.dimensional)continue;
   315	  const period=periodOf(c);
   316	  if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
   317	  const where={name,contextRef,periodStart:period.start,periodEnd:period.end};
   318	  const nil=nsAttr(f.attrs,f.ns,NS.xsi,'nil');
   319	  if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
   320	  const unitRef=attrOf(f.attrs,'unitRef')??'';
   321	  const u=units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
   322	  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
   323	  const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
   324	  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
   325	  const sign=attrOf(f.attrs,'sign');
   326	  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
   327	  const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
   328	  const digits=fmt===null?null:parseFactText(fmt,f.text);
   329	  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
   330	  const scale=Number(scaleRaw);
   331	  let value=canonicalDecimal(`${digits}e${scale}`);
   332	  if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
   333	  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:attrOf(f.attrs,'decimals')??null,scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
   334	 }
   335	 return out;
   336	}
node_modules/typescript/lib/typescript.js
zsh:1: no matches found: docs/superpowers/specs/2026-11-05-data-foundation-3*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xDvlHrBC' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-6GAntdgv' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13b-review.md
/Volumes/AIMATE_WORK/Developer/osstack/AGENTS.md
/Volumes/AIMATE_WORK/Developer/伴元科技/AGENTS.md

exec
/bin/zsh -lc "node -e 'const fs=require(\"fs\"),ts=require(\"typescript\");require.extensions[\".ts\"]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,\"utf8\"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);const {parseInlineXbrl}=require(\"./src/lib/dq/reconcile/ixbrl.ts\");const base=fs.readFileSync(\"src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm\",\"utf8\"); for(const [label,extra] of [[\"tuple\","'`<ix:tuple name="aapl:Tuple" tupleID="t"><ix:nonFraction name="us-gaap:Liabilities" contextRef="c-4" unitRef="usd" order="1">123</ix:nonFraction></ix:tuple>`],["continued",`<ix:nonNumeric name="dei:DocumentFiscalYearFocus" contextRef="c-1" continuedAt="cont">20</ix:nonNumeric><ix:continuation id="cont">23</ix:continuation>`],["long",`<ix:nonFraction name="us-gaap:Liabilities" contextRef="c-4" unitRef="usd">${"1".repeat(513)}</ix:nonFraction>`]]){try {const d=parseInlineXbrl(base.replace("</body>",extra+"</body>"));console.log(label,JSON.stringify({facts:d.facts.filter(x=>x.name==="us-gaap:Liabilities"),unsupported:d.unsupported}));}catch(e){console.log(label,e.constructor.name,e.message);}}'"'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1537ms:
tuple {"facts":[{"name":"us-gaap:Liabilities","periodStart":null,"periodEnd":"2023-09-30","unit":"USD","value":"123","decimals":null,"scale":0,"entity":"http://www.sec.gov/CIK#0000320193","contextRef":"c-4","unitRef":"usd"}],"unsupported":[{"reason":"ix_tuple","name":"aapl:Tuple"}]}
continued {"facts":[],"unsupported":[{"reason":"nonnumeric_conflict","name":"dei:DocumentFiscalYearFocus"}]}
long Error invalid_decimal:length

codex
Targeted executions confirmed that nested tuple members are accepted, continuation fragments produce incorrect results, and oversized numeric literals abort document parsing. These cases undermine the parser's unsupported-data handling.

Full review comments:

- [P2] Exclude facts nested inside unsupported tuples — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl.ts:218-222
  Tuple membership can be established by nesting inside `ix:tuple`, without a `tupleRef` attribute. Such a child currently enters `facts` as an ordinary non-dimensional fact, despite the tuple being reported as unsupported, and can consequently contaminate `indexIxFacts` results. Track tuple ancestry and exclude these members as well as explicitly referenced members.

- [P2] Reject or resolve continued nonnumeric facts — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl.ts:302-307
  When a supported DEI fact has `continuedAt`, only its initial fragment is recorded; the referenced `ix:continuation` is silently ignored. For example, fiscal-year text `20` continued by `23` becomes `20`, or creates a false conflict with another complete `2023` tag. Resolve continuation chains or report these facts as unsupported instead of publishing partial values.

- [P2] Handle decimal bounds failures per fact — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl.ts:328-331
  A numeric text containing 513 digits passes `parseFactText` but makes `canonicalDecimal` throw a plain `Error('invalid_decimal:length')`. This aborts parsing the entire filing, discarding otherwise valid facts, and bypasses the documented `IxbrlParseError` error contract. Catch decimal conversion failures and record an unsupported result for that fact.
Targeted executions confirmed that nested tuple members are accepted, continuation fragments produce incorrect results, and oversized numeric literals abort document parsing. These cases undermine the parser's unsupported-data handling.

Full review comments:

- [P2] Exclude facts nested inside unsupported tuples — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl.ts:218-222
  Tuple membership can be established by nesting inside `ix:tuple`, without a `tupleRef` attribute. Such a child currently enters `facts` as an ordinary non-dimensional fact, despite the tuple being reported as unsupported, and can consequently contaminate `indexIxFacts` results. Track tuple ancestry and exclude these members as well as explicitly referenced members.

- [P2] Reject or resolve continued nonnumeric facts — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl.ts:302-307
  When a supported DEI fact has `continuedAt`, only its initial fragment is recorded; the referenced `ix:continuation` is silently ignored. For example, fiscal-year text `20` continued by `23` becomes `20`, or creates a false conflict with another complete `2023` tag. Resolve continuation chains or report these facts as unsupported instead of publishing partial values.

- [P2] Handle decimal bounds failures per fact — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl.ts:328-331
  A numeric text containing 513 digits passes `parseFactText` but makes `canonicalDecimal` throw a plain `Error('invalid_decimal:length')`. This aborts parsing the entire filing, discarding otherwise valid facts, and bypasses the documented `IxbrlParseError` error contract. Catch decimal conversion failures and record an unsupported result for that fact.
