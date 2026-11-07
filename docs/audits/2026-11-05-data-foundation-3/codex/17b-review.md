OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b159-5bc0-7041-9908-c78ad7757223
--------
user
commit 4d7f492
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat 4d7f492; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1764ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-y57P8BNG' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-OKeutD4f' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ehxsR8A7' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4lX5gu09' (errno=Operation not permitted)
commit 4d7f4923d6f8f8740bfbb0f4d6a0103df09c2179
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:52:51 2026 -0800

    feat(dq): per-fiscal-year filer categories from 10-K covers (raw evidence, sec.filer_category record, script)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 scripts/dq/filer-categories.ts      |  74 +++++++++++++++++++
 src/lib/dq/filer-categories.test.ts | 121 +++++++++++++++++++++++++++++++
 src/lib/dq/filer-categories.ts      | 141 ++++++++++++++++++++++++++++++++++++
 3 files changed, 336 insertions(+)

exec
/bin/zsh -lc 'pwd; ls -a; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; git show 4d7f492 --; cat package.json' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BfTsrgT9' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-1NIre75t' (errno=Operation not permitted)
commit 4d7f4923d6f8f8740bfbb0f4d6a0103df09c2179
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:52:51 2026 -0800

    feat(dq): per-fiscal-year filer categories from 10-K covers (raw evidence, sec.filer_category record, script)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/dq/filer-categories.ts b/scripts/dq/filer-categories.ts
new file mode 100644
index 00000000..bc3eca8c
--- /dev/null
+++ b/scripts/dq/filer-categories.ts
@@ -0,0 +1,74 @@
+// scripts/dq/filer-categories.ts
+/**
+ * Filer categories from 10-K covers (spec §6.1). Dry run by default.
+ *
+ *   node --env-file=.env.local --import tsx scripts/dq/filer-categories.ts [--issuer <issuer_uuid>]... [--limit n] [--apply]
+ *   node --import tsx scripts/dq/filer-categories.ts --no-db --cik 320193 [--cik ...]
+ *
+ * Dry run: reads the US scope, fetches submissions + the latest three 10-K primary documents, parses
+ * the covers and prints the rows; documents go to an in-memory raw store; nothing is written. --apply
+ * writes the raw documents to bucket reconcile-raw, upserts issuer_filer_categories, records
+ * sec.filer_category, finishes an ingest_batches receipt (triggered_by script) and needs a code
+ * version. --no-db (with --cik) needs no environment at all: synthetic issuer ids, memory stores.
+ * Exit 0 on success, 1 when the batch (or, in a dry run, any issuer) failed, 2 on bad arguments.
+ */
+import {supabaseTableClient} from '../../src/lib/db/table-client';
+import {memoryTableClient} from '../../src/lib/db/memory-table-client';
+import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
+import {fetchSecDocument,submissionsView,syncFilerCategories} from '../../src/lib/dq/filer-categories';
+import type {FilerCategoryDeps} from '../../src/lib/dq/filer-categories';
+import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
+import {supabaseFactsDb} from '../../src/lib/facts/db';
+import {resolveCodeVersion} from '../../src/lib/facts/deps';
+import {padCik} from '../../src/lib/facts/providers/shared';
+import {makeBudget} from '../../src/lib/facts/sync';
+import type {ScopeRow} from '../../src/lib/facts/types';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+const USAGE='usage: filer-categories.ts [--issuer <uuid>]... [--limit n] [--apply] | --no-db --cik <cik> [--cik ...]';
+const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
+interface Args{issuers:string[];ciks:string[];limit:number;apply:boolean;noDb:boolean}
+function parseArgs(argv:string[]):Args{
+ const a:Args={issuers:[],ciks:[],limit:500,apply:false,noDb:false};
+ const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
+ for(let i=0;i<argv.length;i++){
+  const x=argv[i];
+  if(x==='--issuer'){const v=next(i++);if(!UUID.test(v)){console.error('--issuer takes an issuer_id uuid');process.exit(2);}a.issuers.push(v);}
+  else if(x==='--cik')a.ciks.push(next(i++));
+  else if(x==='--limit')a.limit=Number(next(i++));
+  else if(x==='--apply')a.apply=true;
+  else if(x==='--no-db')a.noDb=true;
+  else{console.error(USAGE);process.exit(2);}
+ }
+ if(!Number.isInteger(a.limit)||a.limit<1||a.limit>5000){console.error('--limit must be 1..5000');process.exit(2);}
+ if(a.noDb&&(a.apply||a.ciks.length===0||a.issuers.length>0)){console.error('--no-db needs --cik and excludes --apply/--issuer');process.exit(2);}
+ if(!a.noDb&&a.ciks.length>0){console.error('--cik is only for --no-db');process.exit(2);}
+ if(a.ciks.some(c=>!/^\d{1,10}$/.test(c))){console.error('--cik must be digits');process.exit(2);}
+ return a;
+}
+const scopeRow=(issuer_id:string,cik10:string):ScopeRow=>({issuer_id,market:'US',reasons:['cli'],priority:10,fetch_key:cik10,next_due_at:new Date().toISOString(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
+
+async function main(){
+ const args=parseArgs(process.argv.slice(2));
+ const codeVersion=resolveCodeVersion({allowGit:true})??(args.apply?null:'dry-run');
+ if(!codeVersion){console.error('code version unavailable; refusing --apply');process.exit(2);}
+ const budget=makeBudget(null);
+ let deps:FilerCategoryDeps;
+ if(args.noDb){
+  const rows=args.ciks.map((c,i)=>scopeRow(`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,padCik(c)));
+  const raw=memoryRawStore();
+  deps={tables:memoryTableClient({issuer_filer_categories:['issuer_id','fiscal_year']}),db:{scopeAll:async()=>rows},raw,
+   submissions:async(cik10,b)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:`${new Date().getUTCFullYear()-4}-01-01`})),
+   fetchDocument:(url,b)=>fetchSecDocument(url,b),now:()=>new Date(),budget,codeVersion};
+ }else{
+  const admin=getAdminSupabase();
+  const raw=args.apply?supabaseRawStore(admin):memoryRawStore();
+  deps={tables:supabaseTableClient(admin),db:supabaseFactsDb(admin),raw,
+   submissions:async(cik10,b)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:`${new Date().getUTCFullYear()-4}-01-01`})),
+   fetchDocument:(url,b)=>fetchSecDocument(url,b),now:()=>new Date(),budget,codeVersion};
+ }
+ const receipt=await syncFilerCategories(deps,{issuerIds:args.issuers.length?args.issuers:undefined,limit:args.limit,dryRun:!args.apply,triggeredBy:'script'});
+ console.log(JSON.stringify({mode:args.apply?'apply':'dry-run (nothing written; pass --apply)',codeVersion,...receipt},null,1));
+ process.exit(args.apply?(receipt.status==='success'?0:1):(receipt.counts.failed>0?1:0));
+}
+main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
diff --git a/src/lib/dq/filer-categories.test.ts b/src/lib/dq/filer-categories.test.ts
new file mode 100644
index 00000000..57a4f656
--- /dev/null
+++ b/src/lib/dq/filer-categories.test.ts
@@ -0,0 +1,121 @@
+// src/lib/dq/filer-categories.test.ts
+import {describe,expect,it} from 'vitest';
+import {memoryTableClient} from '../db/memory-table-client';
+import {applicableCategory,computeExpectations} from './calendar';
+import type {FilerCategoryRow} from './calendar';
+import {coverOf,latestTenKs,parseFilerCategory,submissionsView,syncFilerCategories} from './filer-categories';
+import type {SubmissionsView} from './filer-categories';
+import {memoryRawStore} from './raw-store';
+import type {Budget,FactsDb,ScopeRow} from '../facts/types';
+
+const ISSUER='00000000-0000-4000-8000-0000000000f1';
+const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
+/** Minimal inline-XBRL 10-K cover: namespaces declared, dei facts as ix:nonNumeric. */
+const cover=(category:string|null,periodEnd='2024-12-31')=>`<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:dei="http://xbrl.sec.gov/dei/2023" xmlns:xbrli="http://www.xbrl.org/2003/instance"><body>
+<ix:header><ix:resources><xbrli:context id="c1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>${periodEnd}</xbrli:endDate></xbrli:period></xbrli:context></ix:resources></ix:header>
+<p>Annual report for the fiscal year ended <ix:nonNumeric name="dei:DocumentPeriodEndDate" contextRef="c1">${periodEnd}</ix:nonNumeric></p>
+${category===null?'':`<p>Filer category: <ix:nonNumeric name="dei:EntityFilerCategory" contextRef="c1">${category}</ix:nonNumeric></p>`}
+</body></html>`;
+const entry=(accn:string,filingDate:string,reportDate:string,p:Partial<SubmissionsView['entries'][number]>={})=>({accessionNumber:accn,filingDate,reportDate,form:'10-K',primaryDocument:`${accn}.htm`,isInlineXBRL:true,...p});
+
+describe('parseFilerCategory (dei:EntityFilerCategory cover text)',()=>{
+ it.each([
+  ['Large Accelerated Filer','large_accelerated',null],
+  ['Large accelerated filer','large_accelerated',null],
+  ['Accelerated Filer','accelerated',null],
+  ['Non-accelerated Filer','non_accelerated',null],
+  ['Non-Accelerated Filer','non_accelerated',null],
+  ['Smaller Reporting Accelerated Filer','accelerated',true],
+  ['Non-accelerated Filer  Smaller Reporting Company','non_accelerated',true],
+ ])('%s → %s (SRC %s)',(raw,acceleration,src)=>{expect(parseFilerCategory(raw)).toEqual({acceleration,smaller_reporting:src});});
+ it.each(['Smaller Reporting Company','Emerging Growth Company','','—'])('%j alone → no usable category',raw=>{expect(parseFilerCategory(raw)).toBeNull();});
+});
+
+describe('cover and 10-K selection',()=>{
+ it('reads dei values from the inline XBRL cover',()=>{
+  expect(coverOf(cover('Large Accelerated Filer'))).toEqual({category:'Large Accelerated Filer',periodEnd:'2024-12-31'});
+  expect(coverOf(cover(null))).toEqual({category:null,periodEnd:'2024-12-31'});
+ });
+ it('takes the latest 3 original 10-Ks by filing date, never amendments',()=>{
+  const v:SubmissionsView={cik10:'0000000001',sha256:'s',category:null,fiscalYearEnd:'1231',entries:[
+   entry('a1','2022-02-20','2021-12-31'),entry('a2','2023-02-20','2022-12-31'),entry('a3','2024-02-20','2023-12-31'),entry('a4','2025-02-20','2024-12-31'),
+   entry('a5','2025-03-01','2024-12-31',{form:'10-K/A'}),entry('a6','2025-04-01','2025-03-31',{form:'10-Q'})]};
+  expect(latestTenKs(v).map(e=>e.accessionNumber)).toEqual(['a4','a3','a2']);
+ });
+});
+
+describe('N−1 applicability (Rule 12b-2)',()=>{
+ const row=(fy:number,acceleration:FilerCategoryRow['acceleration']):FilerCategoryRow=>({issuer_id:ISSUER,fiscal_year:fy,acceleration,smaller_reporting:null,category_raw:acceleration,source:'ixbrl_dei',accession:`x-${fy}`,evidence_sha256:'e',as_of:'2026-11-01'});
+ it('fiscal year N uses the FY N−1 cover; the FY N cover is ignored for N',()=>{
+  expect(applicableCategory([row(2025,'accelerated'),row(2026,'large_accelerated')],2026)?.acceleration).toBe('accelerated');
+ });
+ it('no FY N−1 cover → the calendar has no rule for FY N',()=>{
+  const rows=computeExpectations({profile:{issuer_id:ISSUER,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:null,as_of:'2026-11-01'},categories:[row(2026,'large_accelerated')],filings:[],upstream:{lookup:'ok',us:[]},today:'2026-11-05'});
+  expect(rows.every(r=>r.deadline_state==='no_rule'&&r.due_rule==='none.no_category_for_fy/1')).toBe(true);
+ });
+});
+
+describe('syncFilerCategories',()=>{
+ const scopeRow=(issuer:string,cik:string,priority=10):ScopeRow=>({issuer_id:issuer,market:'US',reasons:['t'],priority,fetch_key:cik,next_due_at:'2026-01-01T00:00:00Z',lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
+ const OTHER='00000000-0000-4000-8000-0000000000f2';
+ function harness(docs:Record<string,string>,view:SubmissionsView|Error){
+  const tables=memoryTableClient({issuer_filer_categories:['issuer_id','fiscal_year'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
+  const raw=memoryRawStore();
+  const urls:string[]=[];
+  const deps={tables,raw,db:{scopeAll:async()=>[scopeRow(ISSUER,'0000000001'),scopeRow(OTHER,'0000000002',0)]} as Pick<FactsDb,'scopeAll'>,
+   submissions:async(cik:string)=>{if(view instanceof Error)throw view;expect(cik).toBe('0000000001');return view;},
+   fetchDocument:async(url:string)=>{urls.push(url);const name=url.split('/').at(-1)!;const d=docs[name];if(d===undefined)throw new Error('404');return new TextEncoder().encode(d);},
+   now:()=>new Date('2026-11-05T03:00:00Z'),budget:budget(),codeVersion:'c'.repeat(40)};
+  return {deps,tables,raw,urls};
+ }
+ const view:SubmissionsView={cik10:'0000000001',sha256:'sub-sha',category:'Large accelerated filer',fiscalYearEnd:'1231',entries:[
+  entry('0000000001-25-000010','2025-02-20','2024-12-31'),entry('0000000001-24-000010','2024-02-21','2023-12-31'),entry('0000000001-23-000010','2023-02-22','2022-12-31'),entry('0000000001-22-000010','2022-02-23','2021-12-31')]};
+ const docs={'0000000001-25-000010.htm':cover('Large Accelerated Filer','2024-12-31'),'0000000001-24-000010.htm':cover('Accelerated Filer','2023-12-31'),'0000000001-23-000010.htm':cover('Smaller Reporting Company','2022-12-31')};
+ it('writes one row per usable cover with the stored document hash, skips SRC-only covers, records sec.filer_category, and only scope priority>0',async()=>{
+  const {deps,tables,raw,urls}=harness(docs,view);
+  const r=await syncFilerCategories(deps,{limit:25,dryRun:false,triggeredBy:'script'});
+  expect(urls).toEqual(['https://www.sec.gov/Archives/edgar/data/1/000000000125000010/0000000001-25-000010.htm','https://www.sec.gov/Archives/edgar/data/1/000000000124000010/0000000001-24-000010.htm','https://www.sec.gov/Archives/edgar/data/1/000000000123000010/0000000001-23-000010.htm']);
+  const stored=tables.rows('issuer_filer_categories').sort((a,b)=>Number(a.fiscal_year)-Number(b.fiscal_year));
+  expect(stored.map(s=>[s.fiscal_year,s.acceleration,s.category_raw,s.accession])).toEqual([[2023,'accelerated','Accelerated Filer','0000000001-24-000010'],[2024,'large_accelerated','Large Accelerated Filer','0000000001-25-000010']]);
+  expect([...raw.objects.keys()].filter(k=>!k.endsWith('.meta.json'))).toHaveLength(3);   // each document also has an immutable .meta.json sidecar
+  for(const s of stored)expect([...raw.objects.keys()].some(k=>k.includes(String(s.evidence_sha256)))).toBe(true);
+  expect(r.counts).toMatchObject({fetched:2,inserted:2,failed:0});
+  expect(r.status).toBe('success');
+  expect(r.errors).toContainEqual({code:'skipped_summary',key:'filer-categories',message:JSON.stringify({category_unusable:1})});
+  const rec=tables.rows('dq_reconciliations');
+  expect(rec).toHaveLength(1);
+  expect(rec[0]).toMatchObject({pair:'sec.filer_category',kind:'text',outcome:'compared',passed:true,natural_key:'0000000001:0000000001-25-000010',left_value:null,right_value:null});
+  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'dq.filer-categories',status:'fresh'});
+ });
+ it('a cover that disagrees with submissions category records passed=false (record only, nothing else changes)',async()=>{
+  const {deps,tables}=harness(docs,{...view,category:'Non-accelerated filer'});
+  const r=await syncFilerCategories(deps,{limit:25,dryRun:false,triggeredBy:'script'});
+  expect(tables.rows('dq_reconciliations')[0].passed).toBe(false);
+  expect(r.rows).toHaveLength(2);
+ });
+ it('dry run writes nothing; an unavailable submissions fetch fails that issuer',async()=>{
+  const dry=harness(docs,view);
+  const r=await syncFilerCategories(dry.deps,{limit:25,dryRun:true,triggeredBy:'script'});
+  expect(r.status).toBe('dry_run');expect(r.rows).toHaveLength(2);
+  expect(dry.tables.rows('issuer_filer_categories')).toHaveLength(0);expect(dry.tables.rows('ingest_batches')).toHaveLength(0);expect(dry.tables.rows('dq_reconciliations')).toHaveLength(0);
+  const down=harness(docs,new Error('sec_unavailable'));
+  const f=await syncFilerCategories(down.deps,{limit:25,dryRun:false,triggeredBy:'script'});
+  expect(f.status).toBe('failed');expect(f.errors[0]).toMatchObject({code:'sec_unavailable',key:ISSUER});
+ });
+ it('a missing document is a failed document, the others still land; non-inline 10-Ks are skipped',async()=>{
+  const {deps}=harness({'0000000001-25-000010.htm':docs['0000000001-25-000010.htm']},{...view,entries:[...view.entries.slice(0,2),entry('0000000001-23-000010','2023-02-22','2022-12-31',{isInlineXBRL:false})]});
+  const r=await syncFilerCategories(deps,{limit:25,dryRun:false,triggeredBy:'script'});
+  expect(r.counts).toMatchObject({fetched:2,inserted:1,failed:1});
+  expect(r.status).toBe('partial');
+  expect(r.errors).toContainEqual({code:'document_unavailable',key:`${ISSUER}:0000000001-24-000010`});
+  expect(r.errors).toContainEqual({code:'skipped_summary',key:'filer-categories',message:JSON.stringify({not_inline_xbrl:1})});
+ });
+ it('submissionsView keeps only the fields the calendar reads',()=>{
+  const parsed={cik:'1',name:'X',category:'Accelerated filer',fiscalYearEnd:'0630',tickers:['X'],tickerPositions:[0],exchanges:[],formerNames:[],files:[],
+   filings:[{accessionNumber:'a',filingDate:'2025-08-01',reportDate:'',acceptanceDateTime:null,form:'10-K',primaryDocument:'a.htm',isInlineXBRL:true,page:'main'},
+    {accessionNumber:'b',filingDate:'2025-05-01',reportDate:null,acceptanceDateTime:null,form:'10-Q',primaryDocument:null,isInlineXBRL:null,page:'main'}]};
+  expect(submissionsView({cik:'1',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'s',path:'sec-submissions/s.json'},pages:[],parsed,complete:true}))
+   .toEqual({cik10:'0000000001',sha256:'s',category:'Accelerated filer',fiscalYearEnd:'0630',entries:[{accessionNumber:'a',filingDate:'2025-08-01',reportDate:null,form:'10-K',primaryDocument:'a.htm',isInlineXBRL:true},
+    {accessionNumber:'b',filingDate:'2025-05-01',reportDate:null,form:'10-Q',primaryDocument:'',isInlineXBRL:false}]});
+ });
+});
diff --git a/src/lib/dq/filer-categories.ts b/src/lib/dq/filer-categories.ts
new file mode 100644
index 00000000..7c9a79a2
--- /dev/null
+++ b/src/lib/dq/filer-categories.ts
@@ -0,0 +1,141 @@
+// src/lib/dq/filer-categories.ts
+// Per-fiscal-year filer categories from 10-K covers (spec §6.1 申报人类别, §3.1 issuer_filer_categories).
+// For each in-scope US issuer: SEC submissions → its latest 3 original 10-Ks → each primary document
+// (raw bytes into bucket reconcile-raw, sha256 = evidence_sha256) → the §5.2 inline-XBRL parser →
+// dei:EntityFilerCategory → acceleration. Only-SRC / unparseable covers write no row (no usable
+// category; the calendar then has no rule for that fiscal year). The latest 10-K's cover is also
+// compared with submissions `category` as pair sec.filer_category (record.ts, kind text, record only).
+// fiscal_year = calendar year of the month end nearest the 10-K's period end (calendar.ts
+// fiscalYearOfPeriodEnd), the same label the calendar uses for its N−1 lookup.
+import {PacerError,secPacer,sleep} from '../facts/providers/shared';
+import type {Budget,FactsDb} from '../facts/types';
+import type {TableClient} from '../db/table-client';
+import {emptyCounts,finishBatch,startBatch} from './batches';
+import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
+import {recordAttempt} from './freshness';
+import {DATASETS,DQ_DATASET_INVENTORY} from './datasets';
+import type {RawStore} from './raw-store';
+import {CALENDAR_RULES_VERSION,fiscalYearOfPeriodEnd} from './calendar';
+import type {Acceleration,FilerCategoryRow} from './calendar';
+import {IXBRL_PARSER_VERSION,parseInlineXbrl} from './reconcile/ixbrl';
+import {recordReconciliation} from './reconcile/record';
+import {primaryDocumentUrl} from '../research/ingest/collectors/edgar';
+import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
+import type {SubmissionsSnapshot} from '../entities/identifiers/sec-submissions';
+
+/** The submissions fields the calendar and this module read. Built only by submissionsView (one adaptation point to Task 6's snapshot). */
+export interface SubmissionsEntryView{accessionNumber:string;filingDate:string;reportDate:string|null;form:string;primaryDocument:string;isInlineXBRL:boolean}
+export interface SubmissionsView{cik10:string;sha256:string;category:string|null;fiscalYearEnd:string|null;entries:SubmissionsEntryView[]}
+// Task 6a shape (Part B): SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:ParsedSubmissions, complete};
+// parsed.filings already merges recent with the fetched files[] pages; primaryDocument / isInlineXBRL may be null.
+export function submissionsView(s:SubmissionsSnapshot):SubmissionsView{
+ return {cik10:s.cik.padStart(10,'0'),sha256:s.main.sha256,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,
+  entries:s.parsed.filings.map(e=>({accessionNumber:e.accessionNumber,filingDate:e.filingDate,reportDate:e.reportDate||null,form:e.form,primaryDocument:e.primaryDocument??'',isInlineXBRL:e.isInlineXBRL===true}))};
+}
+
+/**
+ * Cover text → category. The non-accelerated test runs first because "Non-accelerated Filer" also
+ * contains "accelerated filer" (spec §6.1 lists large → accelerated → non; same outcomes). Smaller
+ * reporting status is only ever `true` (the words appear) or null (unknown) — never inferred false.
+ */
+export function parseFilerCategory(raw:string):{acceleration:Acceleration;smaller_reporting:boolean|null}|null{
+ const t=raw.replace(/\s+/g,' ').trim().toLowerCase();
+ const src=t.includes('smaller reporting')?true:null;
+ if(/non-?\s?accelerated/.test(t))return {acceleration:'non_accelerated',smaller_reporting:src};
+ if(t.includes('large accelerated'))return {acceleration:'large_accelerated',smaller_reporting:src};
+ if(t.includes('accelerated filer'))return {acceleration:'accelerated',smaller_reporting:src};
+ return null;
+}
+const norm=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
+/** Latest n original 10-Ks by filing date (amendments never: a 10-K/A cover restates, it does not determine status). */
+export const latestTenKs=(v:SubmissionsView,n=3)=>v.entries.filter(e=>e.form==='10-K'&&e.primaryDocument!=='').sort((a,b)=>b.filingDate.localeCompare(a.filingDate)||b.accessionNumber.localeCompare(a.accessionNumber)).slice(0,n);
+const ISO=/^\d{4}-\d{2}-\d{2}$/;
+/** dei values by local name; Task 13's parser keys nonNumeric by the canonical 'dei:<Local>' QName. */
+export function coverOf(doc:string):{category:string|null;periodEnd:string|null}{
+ const nn=parseInlineXbrl(doc).nonNumeric;
+ const cat=nn['dei:EntityFilerCategory'];const pe=nn['dei:DocumentPeriodEndDate'];
+ return {category:cat!==undefined&&cat.trim()!==''?cat.trim():null,periodEnd:pe!==undefined&&ISO.test(pe.trim())?pe.trim():null};
+}
+
+export const MAX_DOCUMENT_BYTES=50*1024*1024;
+const RESERVE_MS=20_000;
+// Shares THE process-wide SEC pacer (submissions, companyfacts, documents): the fair-access limit is per source address.
+const pacer=secPacer;
+export const resetDocumentPacing=()=>pacer.reset();
+export class FilerCategoryError extends Error{constructor(public readonly code:'document_unavailable'|'document_too_large',message?:string){super(message??code);this.name='FilerCategoryError';}}
+export interface DocumentFetchOptions{fetch?:typeof fetch;userAgent?:string;sleep?:typeof sleep;now?:()=>number}
+/** One SEC archive document (UA, 120 ms pacing, 60 s timeout, 50 MB cap). Thrown messages carry status codes only. */
+export async function fetchSecDocument(url:string,budget:Budget,opts:DocumentFetchOptions={}):Promise<Uint8Array>{
+ try{await pacer.admit({budget,reserveMs:RESERVE_MS,now:opts.now,sleep:opts.sleep});}catch(e){throw new FilerCategoryError('document_unavailable',e instanceof PacerError?e.code:'budget_aborted');}
+ const timeoutMs=Math.min(60_000,budget.remainingMs()-RESERVE_MS);
+ if(timeoutMs<=0)throw new FilerCategoryError('document_unavailable','budget_exhausted');
+ let res:Response;
+ try{res=await (opts.fetch??fetch)(url,{headers:{'User-Agent':opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'text/html'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});}
+ catch{throw new FilerCategoryError('document_unavailable','network');}
+ if(!res.ok)throw new FilerCategoryError('document_unavailable',`http_${res.status}`);
+ if(Number(res.headers.get('content-length')??'0')>MAX_DOCUMENT_BYTES)throw new FilerCategoryError('document_too_large');
+ const bytes=new Uint8Array(await res.arrayBuffer());
+ if(bytes.byteLength>MAX_DOCUMENT_BYTES)throw new FilerCategoryError('document_too_large');
+ return bytes;
+}
+
+export interface FilerCategoryDeps{
+ tables:TableClient;db:Pick<FactsDb,'scopeAll'>;raw:RawStore;
+ submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
+ fetchDocument:(url:string,b:Budget)=>Promise<Uint8Array>;
+ now:()=>Date;budget:Budget;codeVersion:string|null;
+}
+export interface FilerCategoryOptions{issuerIds?:string[];limit:number;dryRun:boolean;triggeredBy:TriggeredBy}
+export interface FilerCategoryReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];rows:FilerCategoryRow[];reconciliations:{natural_key:string;passed:boolean}[]}
+/** Stop starting issuers when less than this remains (one submissions + three documents). */
+export const MIN_ISSUER_MS=30_000;
+
+export async function syncFilerCategories(deps:FilerCategoryDeps,opts:FilerCategoryOptions):Promise<FilerCategoryReceipt>{
+ const today=deps.now().toISOString().slice(0,10);
+ const scope=(await deps.db.scopeAll('US')).filter(r=>opts.issuerIds?opts.issuerIds.includes(r.issuer_id):r.priority>0);
+ const members=scope.sort((a,b)=>a.issuer_id.localeCompare(b.issuer_id)).slice(0,opts.issuerIds?undefined:opts.limit);
+ const counts=emptyCounts();const errors:BatchError[]=[];const rows:FilerCategoryRow[]=[];const recs:FilerCategoryReceipt['reconciliations']=[];
+ const skipped:Record<string,number>={};const skip=(r:string)=>{skipped[r]=(skipped[r]??0)+1;};
+ const batchId=opts.dryRun?null:(await startBatch(deps.tables,{producer:'filer-categories',dataset:DATASETS.filerCategories,toolVersions:{parser:IXBRL_PARSER_VERSION,rules:CALENDAR_RULES_VERSION},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy})).batchId;
+ for(const m of members){
+  if(deps.budget.remainingMs()<MIN_ISSUER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:members.length-members.indexOf(m)})});break;}
+  let view:SubmissionsView;
+  try{view=await deps.submissions(m.fetch_key,deps.budget);}
+  catch(e){counts.fetched++;counts.failed++;errors.push({code:'sec_unavailable',key:m.issuer_id,message:(e as Error).message.slice(0,200)});continue;}
+  const seen=new Set<number>();
+  for(const [i,e] of latestTenKs(view).entries()){
+   if(!e.isInlineXBRL){skip('not_inline_xbrl');continue;}
+   const fail=(code:string)=>{counts.fetched++;counts.failed++;errors.push({code,key:`${m.issuer_id}:${e.accessionNumber}`});};
+   let bytes:Uint8Array,sha256:string;
+   try{bytes=await deps.fetchDocument(primaryDocumentUrl(view.cik10,e.accessionNumber,e.primaryDocument),deps.budget);}
+   catch(err){fail(err instanceof FilerCategoryError?err.code:'document_unavailable');continue;}
+   try{sha256=(await deps.raw.put({kind:'sec-document',bytes,contentType:'text/html',meta:{cik:view.cik10,accession:e.accessionNumber,document:e.primaryDocument}},deps.budget)).sha256;}
+   catch{fail('raw_upload_failed');continue;}   // no evidence in the bucket → no row depends on it (spec §3.1 bucket rule)
+   const cover=coverOf(new TextDecoder().decode(bytes));
+   if(i===0&&view.category!==null&&cover.category!==null){
+    const passed=norm(view.category)===norm(cover.category);
+    recs.push({natural_key:`${view.cik10}:${e.accessionNumber}`,passed});
+    if(batchId)await recordReconciliation(deps.tables,{pair:'sec.filer_category',batch_id:batchId,natural_key:`${view.cik10}:${e.accessionNumber}`,kind:'text',outcome:'compared',passed,
+     left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec_submissions.category',right_source:'ixbrl_dei.EntityFilerCategory',
+     detail:{left_text:view.category,right_text:cover.category,left:{sha256:view.sha256},right:{document:e.primaryDocument,sha256}},action:'record'});
+   }
+   const parsed=cover.category===null?null:parseFilerCategory(cover.category);
+   if(!parsed){skip(cover.category===null?'no_category':'category_unusable');continue;}
+   const periodEnd=e.reportDate&&ISO.test(e.reportDate)?e.reportDate:cover.periodEnd;
+   if(!periodEnd){skip('no_period_end');continue;}
+   const fiscalYear=fiscalYearOfPeriodEnd(periodEnd);
+   if(seen.has(fiscalYear)){skip('fiscal_year_duplicate');continue;}   // a newer 10-K already covers this fiscal year
+   seen.add(fiscalYear);
+   const row:FilerCategoryRow={issuer_id:m.issuer_id,fiscal_year:fiscalYear,acceleration:parsed.acceleration,smaller_reporting:parsed.smaller_reporting,category_raw:cover.category!,source:'ixbrl_dei',accession:e.accessionNumber,evidence_sha256:sha256,as_of:today};
+   rows.push(row);
+   if(batchId)await deps.tables.upsert('issuer_filer_categories',{...row},'issuer_id,fiscal_year');
+   counts.fetched++;counts.inserted++;
+  }
+ }
+ if(Object.keys(skipped).length)errors.push({code:'skipped_summary',key:'filer-categories',message:JSON.stringify(skipped)});
+ if(!batchId)return {batchId:null,status:'dry_run',counts,errors,rows,reconciliations:recs};
+ const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
+ const cadence=DQ_DATASET_INVENTORY.find(d=>d.dataset===DATASETS.filerCategories)!.cadence;
+ await recordAttempt(deps.tables,DATASETS.filerCategories,{ok:status==='success',cadence,now:deps.now(),detail:{batch_id:batchId,rows:rows.length,issuers:members.length}});
+ return {batchId,status,counts,errors,rows,reconciliations:recs};
+}
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
/bin/zsh -lc 'cat src/lib/dq/batches.ts; cat src/lib/dq/reconcile/ixbrl.ts; cat src/lib/entities/identifiers/sec-submissions.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// Ingest receipts (spec §5.1 ingest_batches). Every producer starts a batch, writes rows that
// reference batch_id, and finishes with counts + errors. Status is derived from counts and
// errors so dashboards never guess: success = no failures and no non-informational errors;
// quarantined rows and informational entries (INFO_CODES) do not degrade status. The row is written with finished_at:null so the DB invariant
// (status='running' iff finished_at is null) holds. Only a running batch can be finished.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';

export type BatchStatus='running'|'success'|'partial'|'failed'|'rejected';
export type TriggeredBy='cron'|'manual'|'script';
/**
 * Receipt counters, all non-negative safe integers:
 * - fetched: rows read from the source;
 * - inserted: new rows written; duplicates: rows already present unchanged (no write);
 * - versioned: rows that superseded an existing version; quarantined: rows parked in dq_quarantine;
 * - failed: rows that could not be processed at all.
 * inserted+duplicates+versioned+quarantined+failed is the number of rows with an outcome; it may
 * be below fetched (rows filtered out by design), but fetched > 0 with no outcome at all means the
 * producer lost track of its rows and the batch finishes as failed ('unaccounted').
 */
export interface BatchCounts{fetched:number;inserted:number;duplicates:number;versioned:number;quarantined:number;failed:number}
export interface BatchError{code:string;key?:string;message?:string}
export interface StartBatchInput{producer:string;dataset:string;toolVersions?:Record<string,string>;codeVersion?:string;triggeredBy?:TriggeredBy}

const TRIGGERS:readonly TriggeredBy[]=['cron','manual','script'];
export const emptyCounts=():BatchCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});

const COUNTERS:readonly (keyof BatchCounts)[]=['fetched','inserted','duplicates','versioned','quarantined','failed'];
const MAX_ERRORS=100,MAX_MESSAGE=500;

function assertCounts(counts:BatchCounts):void{
 if(!counts||COUNTERS.some(k=>!Number.isSafeInteger(counts[k])||counts[k]<0))throw new Error('invalid_counts');
}

/** First MAX_ERRORS errors with messages capped, plus a `truncated` marker for the rest. */
function capErrors(errors:BatchError[]):BatchError[]{
 const kept=errors.slice(0,MAX_ERRORS).map(e=>e.message!==undefined&&e.message.length>MAX_MESSAGE?{...e,message:e.message.slice(0,MAX_MESSAGE)}:e);
 return errors.length>MAX_ERRORS?[...kept,{code:'truncated',message:`${errors.length-MAX_ERRORS} more`}]:kept;
}

/**
 * Error codes that only inform the receipt reader: `skipped_summary` (input rows left out by
 * expected filtering, e.g. not in the universe or not promotable yet) and `relink` (a research
 * entity re-pointed to another issuer), `rule_warning_summary` (one per warning rule per batch, facts spec §7.2),
 * `coverage_summary` (Tushare coverage summary, §6.3), `deadline_hit` (issuers not started after the deadline, §6.1) and `claims_summary` (identifier claims filed per op, data foundation 3 §4.2.2/§8). They stay in `errors` but never make a batch partial or
 * failed. `rejected_summary` (malformed or invalid input rows) is deliberately NOT informational:
 * it makes the batch partial, or failed when nothing landed.
 */
export const INFO_CODES=['skipped_summary','relink','rule_warning_summary','coverage_summary','deadline_hit','claims_summary'] as const;
export type InfoCode=typeof INFO_CODES[number];
export const isInfoError=(e:BatchError)=>(INFO_CODES as readonly string[]).includes(e.code);

const accounted=(c:BatchCounts)=>c.inserted+c.duplicates+c.versioned+c.quarantined+c.failed;
export const UNACCOUNTED_ERROR:BatchError={code:'unaccounted',message:'fetched rows without outcomes'};

/**
 * Pure status: rejected flag wins; fetched rows with no outcome → failed; any failure or
 * non-informational error → partial if something landed, else failed. Errors whose code is in
 * INFO_CODES are ignored here (a run whose only entries are skips/relinks is a success).
 */
export function batchStatusFromCounts(counts:BatchCounts,errors:BatchError[],flags:{rejected?:boolean}={}):BatchStatus{
 assertCounts(counts);
 if(flags.rejected)return 'rejected';
 if(counts.fetched>0&&accounted(counts)===0)return 'failed';
 const landed=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined;
 if(counts.failed>0||errors.some(e=>!isInfoError(e)))return landed>0?'partial':'failed';
 return 'success';
}

export async function startBatch(client:TableClient,input:StartBatchInput):Promise<{batchId:string}>{
 const ok=(s:unknown)=>typeof s==='string'&&s.length>=1&&s.length<=64;
 const trigger=input.triggeredBy??'script';
 if(!ok(input.producer)||!ok(input.dataset)||!TRIGGERS.includes(trigger))throw new Error('invalid_batch');
 const batchId=randomUUID();
 await client.insert('ingest_batches',{
  batch_id:batchId,producer:input.producer,dataset:input.dataset,status:'running',
  started_at:new Date().toISOString(),finished_at:null,counts:emptyCounts(),errors:[],
  tool_versions:input.toolVersions??{},code_version:input.codeVersion??null,triggered_by:trigger,
 });
 return {batchId};
}

/**
 * Finishes a running batch. An unaccounted receipt (fetched > 0, no outcomes) finishes as failed
 * with an appended {code:'unaccounted'} error. Throws invalid_now when `now` or the stored
 * started_at is not a valid date, rather than writing a NaN finished_at.
 */
export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean},now=new Date()):Promise<BatchStatus>{
 const status=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_now');
 const unaccounted=!result.rejected&&result.counts.fetched>0&&accounted(result.counts)===0;
 const errors=unaccounted?[UNACCOUNTED_ERROR,...result.errors]:result.errors;
 const [batch]=await client.select('ingest_batches',{batch_id:batchId},{limit:1});
 if(!batch||batch.status!=='running')throw new Error('batch_not_running');
 const startedAt=Date.parse(String(batch.started_at));
 if(!Number.isFinite(startedAt))throw new Error('invalid_now');
 // Never before started_at (DB check finished_after_started), even under clock skew.
 const finishedAt=new Date(Math.max(now.getTime(),startedAt));
 // Matching on status='running' keeps a concurrent finish from being overwritten.
 const n=await client.update('ingest_batches',{batch_id:batchId,status:'running'},{status,counts:result.counts,errors:capErrors(errors),finished_at:finishedAt.toISOString()});
 if(n!==1)throw new Error('batch_not_running');
 return status;
}
// src/lib/dq/reconcile/ixbrl.ts
// Inline XBRL subset parser (spec §5.2), IXBRL_PARSER_VERSION='ixbrl/1'.
// A bounded streaming XML tokenizer (elements, attributes, the five XML entities plus &nbsp; and numeric
// character references; comments, processing instructions and a DOCTYPE WITHOUT internal subset are
// skipped; an internal DTD subset is refused; CDATA is literal text; script/style content is raw text;
// depth <= 1000, attributes <= 256 per element) feeds a parser that resolves every element name and every
// QName value through the in-scope xmlns declarations, so prefixes never matter.
// Supported subset (each has a test); everything else lands in `unsupported` and is never merged:
//  - xbrli:context: entity/identifier; period startDate+endDate | instant, dates YYYY-MM-DD. ANY child
//    element inside segment or scenario marks the context dimensional and its facts are skipped (out of
//    scope by design, not reported). Facts carry (entity, period), so equal contexts with different ids
//    give the same key (ixFactKey) — the normalised dedupe.
//  - xbrli:unit: one measure, or divide with exactly one numerator and one denominator measure; iso4217
//    and xbrli measures become USD / shares / pure, then facts/units.ts normalizeUnit ('USD/shares' →
//    'USD/share'); anything else → unsupported(unit).
//  - ix:nonFraction: name, contextRef, unitRef, scale, sign, decimals, format, xsi:nil. Text grammar by
//    format (transformation registries 2015-02-26, 2020-02-12, 2022-02-16 only):
//      (no format), num-dot-decimal, numdotdecimal   ^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$   commas dropped
//      num-comma-decimal, numcommadecimal            ^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$    dots dropped, comma = point
//      fixed-zero, zerodash                          → 0
//      numwordsen                                    'no' | 'none' (trimmed, case-insensitive) → 0
//    any other format or no match → unsupported(format); xsi:nil = true|1 → unsupported(nil).
//    value = canonical decimal × 10^scale, negated when sign='-'. A nested ix:nonFraction gives the outer
//    fact the innermost text; text inside ix:exclude is not fact text.
//  - ix:nonNumeric: only dei:EntityFilerCategory, dei:DocumentFiscalYearFocus, dei:DocumentPeriodEndDate
//    (whitespace-collapsed raw text; a second, different text → unsupported(nonnumeric_conflict)).
//  - ix:fraction, ix:tuple and facts with tupleRef → unsupported. No ix element at all → not_inline_xbrl.
// Malformed XML throws IxbrlParseError(code); the pair turns that into unsupported results.
import {canonicalDecimal} from '../../facts/json-numbers';
import {normalizeUnit} from '../../facts/units';

export const IXBRL_PARSER_VERSION='ixbrl/1';
export const MAX_IXBRL_BYTES=50*1024*1024;
export const NS={ix:'http://www.xbrl.org/2013/inlineXBRL',xbrli:'http://www.xbrl.org/2003/instance',xbrldi:'http://xbrl.org/2006/xbrldi',xsi:'http://www.w3.org/2001/XMLSchema-instance',iso4217:'http://www.xbrl.org/2003/iso4217',xml:'http://www.w3.org/XML/1998/namespace'} as const;
export const TRANSFORM_NS:readonly string[]=['http://www.xbrl.org/inlineXBRL/transformation/2015-02-26','http://www.xbrl.org/inlineXBRL/transformation/2020-02-12','http://www.xbrl.org/inlineXBRL/transformation/2022-02-16'];
export const DEI_NON_NUMERIC:readonly string[]=['dei:EntityFilerCategory','dei:DocumentFiscalYearFocus','dei:DocumentPeriodEndDate'];

export interface IxFact{name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number;entity:string;contextRef:string;unitRef:string}
export interface IxUnsupported{reason:string;name?:string;contextRef?:string;periodStart?:string|null;periodEnd?:string}
export interface IxbrlDocument{facts:IxFact[];nonNumeric:Record<string,string>;unsupported:IxUnsupported[]}
export class IxbrlParseError extends Error{constructor(public readonly code:string){super(code);this.name='IxbrlParseError';}}

// ---------------- tokenizer ----------------
export type XmlToken=
 |{t:'open';name:string;attrs:[string,string][];self:boolean;start:number;end:number}
 |{t:'close';name:string;start:number;end:number}
 |{t:'text';text:string;start:number;end:number};
const MAX_DEPTH=1000,MAX_ATTRS=256;
const NAME_RE=/[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y;
const NAMED:Record<string,string>={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",nbsp:' '};
const fail=(code:string):never=>{throw new IxbrlParseError(code);};
const isWs=(c:number)=>c===32||c===9||c===10||c===13;
function nameAt(doc:string,at:number):string|null{NAME_RE.lastIndex=at;const m=NAME_RE.exec(doc);return m?m[0]:null;}

export function decodeEntities(s:string):string{
 if(!s.includes('&'))return s;
 return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,31});/g,(m,b:string)=>{
  if(b[0]!=='#')return NAMED[b]??m;
  const cp=b[1]==='x'||b[1]==='X'?Number.parseInt(b.slice(2),16):Number.parseInt(b.slice(1),10);
  return cp>0&&cp<=0x10ffff&&(cp<0xd800||cp>0xdfff)?String.fromCodePoint(cp):m;
 });
}

/** Streaming tokens with source offsets [start, end). Throws IxbrlParseError on malformed markup. */
export function* tokenizeXml(doc:string):Generator<XmlToken>{
 const n=doc.length;let i=doc.charCodeAt(0)===0xfeff?1:0;let depth=0;let rawEnd:string|null=null;
 while(i<n){
  if(rawEnd!==null){
   // end tag: '</' + the element name (case-insensitive) + whitespace or '>'; no whole-document lowercasing (length-changing case folds)
   let e=-1;
   for(let k=doc.indexOf('</',i);k>=0;k=doc.indexOf('</',k+2)){
    const nm=doc.slice(k+2,k+2+rawEnd.length);
    const nx=doc.charCodeAt(k+2+rawEnd.length);
    if(nm.toLowerCase()===rawEnd&&(nx===62||isWs(nx))){e=k;break;}
   }
   if(e<0)fail('unterminated_raw_text');
   if(e>i)yield {t:'text',text:doc.slice(i,e),start:i,end:e};
   rawEnd=null;i=e;continue;
  }
  const lt=doc.indexOf('<',i);
  if(lt<0){yield {t:'text',text:decodeEntities(doc.slice(i)),start:i,end:n};break;}
  if(lt>i)yield {t:'text',text:decodeEntities(doc.slice(i,lt)),start:i,end:lt};
  if(doc.startsWith('<!--',lt)){const e=doc.indexOf('-->',lt+4);if(e<0)fail('unterminated_comment');i=e+3;continue;}
  if(doc.startsWith('<![CDATA[',lt)){const e=doc.indexOf(']]>',lt+9);if(e<0)fail('unterminated_cdata');yield {t:'text',text:doc.slice(lt+9,e),start:lt,end:e+3};i=e+3;continue;}
  if(doc.startsWith('<?',lt)){const e=doc.indexOf('?>',lt+2);if(e<0)fail('unterminated_pi');i=e+2;continue;}
  if(doc.startsWith('<!',lt)){const e=doc.indexOf('>',lt+2);if(e<0)fail('unterminated_declaration');if(doc.slice(lt,e).includes('['))fail('dtd_unsupported');i=e+1;continue;}
  if(doc.charCodeAt(lt+1)===47){
   const name=nameAt(doc,lt+2)??fail('bad_close_tag');
   let j=lt+2+name.length;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='>')fail('bad_close_tag');
   depth--;if(depth<0)fail('unbalanced_close');
   yield {t:'close',name,start:lt,end:j+1};i=j+1;continue;
  }
  const name=nameAt(doc,lt+1)??fail('bad_open_tag');
  let j=lt+1+name.length;const attrs:[string,string][]=[];let self=false;
  for(;;){
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(j>=n)fail('unterminated_tag');
   if(doc.startsWith('/>',j)){self=true;j+=2;break;}
   if(doc[j]==='>'){j++;break;}
   const an=nameAt(doc,j)??fail('bad_attribute');j+=an.length;
   if(attrs.some(([k])=>k===an))fail('bad_attribute');   // duplicate attribute
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='=')fail('bad_attribute');
   j++;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   const q=doc[j];if(q!=='"'&&q!=="'")fail('bad_attribute');
   const e=doc.indexOf(q,j+1);if(e<0)fail('unterminated_attribute');
   attrs.push([an,decodeEntities(doc.slice(j+1,e))]);j=e+1;
   if(j<n&&!isWs(doc.charCodeAt(j))&&doc[j]!=='>'&&doc[j]!=='/')fail('bad_attribute');   // attributes need separating whitespace
   if(attrs.length>MAX_ATTRS)fail('too_many_attributes');
  }
  yield {t:'open',name,attrs,self,start:lt,end:j};
  if(!self){
   depth++;if(depth>MAX_DEPTH)fail('too_deep');
   const local=name.slice(name.indexOf(':')+1).toLowerCase();
   if(local==='script'||local==='style')rawEnd=name.toLowerCase();
  }
  i=j;
 }
 if(rawEnd!==null)fail('unterminated_raw_text');
}

// ---------------- names ----------------
export type NsMap=ReadonlyMap<string,string>;   // prefix ('' = default namespace) → URI
/** Element names and QName values use the default namespace when unprefixed (useDefault); plain attribute names never do. */
export function resolveQName(q:string,ns:NsMap,useDefault:boolean):{uri:string|null;local:string}{
 const k=q.indexOf(':');
 if(k<0)return {uri:useDefault?(ns.get('')??null):null,local:q};
 const p=q.slice(0,k);
 return {uri:p==='xml'?NS.xml:(ns.get(p)??null),local:q.slice(k+1)};
}
/** Canonical concept name: us-gaap / dei / ifrs-full / srt by namespace URI pattern (any taxonomy year), else Clark notation {uri}local. */
export function canonicalConcept(uri:string|null,local:string):string{
 if(uri!==null){
  if(/^http:\/\/fasb\.org\/us-gaap\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `us-gaap:${local}`;
  if(/^http:\/\/xbrl\.sec\.gov\/dei\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `dei:${local}`;
  if(/^https?:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full$/.test(uri))return `ifrs-full:${local}`;
  if(/^http:\/\/fasb\.org\/srt\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `srt:${local}`;
 }
 return `{${uri??''}}${local}`;
}
const attrOf=(attrs:readonly [string,string][],name:string)=>attrs.find(([k])=>k===name)?.[1];
function nsAttr(attrs:readonly [string,string][],ns:NsMap,uri:string,local:string):string|undefined{
 for(const [k,v] of attrs){
  const i=k.indexOf(':');if(i<0)continue;
  const p=k.slice(0,i);if(p==='xmlns')continue;
  if(ns.get(p)===uri&&k.slice(i+1)===local)return v;
 }
 return undefined;
}

// ---------------- values ----------------
const RE_DOT=/^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$/;
const RE_COMMA=/^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$/;
/** Digits (no exponent) for a format's text, or null when the text does not match the format's grammar. */
export function parseFactText(format:string,text:string):string|null{
 switch(format){
  case 'none':case 'num-dot-decimal':case 'numdotdecimal':return RE_DOT.test(text)?text.replace(/[\s,]/g,''):null;
  case 'num-comma-decimal':case 'numcommadecimal':return RE_COMMA.test(text)?text.replace(/[\s.]/g,'').replace(',','.'):null;
  case 'fixed-zero':case 'zerodash':return '0';
  case 'numwordsen':{const t=text.trim().toLowerCase();return t==='no'||t==='none'?'0':null;}
  default:return null;
 }
}
function formatOf(q:string|undefined,ns:NsMap):string|null{
 if(q===undefined)return 'none';
 const r=resolveQName(q.trim(),ns,true);
 return r.uri!==null&&TRANSFORM_NS.includes(r.uri)?r.local:null;
}
/** Right-side key of a fact: (concept, canonical context = entity + period, unit). */
export const ixFactKey=(f:Pick<IxFact,'name'|'entity'|'periodStart'|'periodEnd'|'unit'>)=>[f.name,f.entity,f.periodStart??'',f.periodEnd,f.unit].join('|');
/** Facts grouped by ixFactKey with their DISTINCT values (canonical decimal equality), in document order. */
export function indexIxFacts(facts:readonly IxFact[]):Map<string,{values:string[];facts:IxFact[]}>{
 const out=new Map<string,{values:string[];facts:IxFact[]}>();
 for(const f of facts){
  const k=ixFactKey(f);const g=out.get(k)??{values:[],facts:[]};
  if(!g.values.includes(f.value))g.values.push(f.value);
  g.facts.push(f);out.set(k,g);
 }
 return out;
}

// ---------------- parser ----------------
interface Frame{name:string;ns:NsMap;uri:string|null;local:string}
interface RawCtx{id:string;scheme:string;ident:string;start:string;end:string;instant:string;forever:boolean;dimensional:boolean}
interface RawUnit{id:string;measures:string[];num:string[];den:string[];bad:boolean}
interface FactFrame{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;inner:string|null;tuple:boolean}
interface RawFact{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;tuple:boolean}
/**
 * Mutable parser state, one explicitly typed object (plan audit P7): the open/close callbacks and the token
 * loop all read and write it through `st.*`. Closure `let`s assigned inside callbacks are invisible to the
 * loop's control-flow analysis (TS narrows them to their initial null/false → `never`, TS2322/TS2339 under
 * strict 5.9); property reads of a typed object are narrowed per use instead.
 */
interface ParseState{
 sawIx:boolean;exclude:number;tuple:number;
 ctx:RawCtx|null;ctxField:'ident'|'start'|'end'|'instant'|null;segDepth:number;
 unit:RawUnit|null;unitPart:'num'|'den'|null;measure:{ns:NsMap;text:string}|null;
}
const DATE=/^\d{4}-\d{2}-\d{2}$/;

function periodOf(c:RawCtx):{start:string|null;end:string}|null{
 if(c.forever)return null;
 const s=c.start.trim(),e=c.end.trim(),i=c.instant.trim();
 if(i!==''&&s===''&&e==='')return DATE.test(i)?{start:null,end:i}:null;
 if(i===''&&DATE.test(s)&&DATE.test(e)&&s<=e)return {start:s,end:e};
 return null;
}
function unitString(u:RawUnit):string|null{
 if(u.bad)return null;
 if(u.num.length>0||u.den.length>0)return u.num.length===1&&u.den.length===1&&u.measures.length===0?`${u.num[0]}/${u.den[0]}`:null;
 return u.measures.length===1?u.measures[0]:null;
}

export function parseInlineXbrl(doc:string):IxbrlDocument{
 const out:IxbrlDocument={facts:[],nonNumeric:{},unsupported:[]};
 const root:NsMap=new Map([['xml',NS.xml]]);
 const stack:Frame[]=[];
 const contexts=new Map<string,RawCtx>();const units=new Map<string,RawUnit>();const rawFacts:RawFact[]=[];
 const open:FactFrame[]=[];
 const dupCtx=new Set<string>(),dupUnits=new Set<string>(),conflicted=new Set<string>();
 const st:ParseState={sawIx:false,exclude:0,tuple:0,ctx:null,ctxField:null,segDepth:-1,unit:null,unitPart:null,measure:null};

 const onOpen=(f:Frame,attrs:[string,string][])=>{
  if(st.ctx!==null&&st.segDepth>=0){st.ctx.dimensional=true;return;}   // any element inside segment / scenario
  if(f.uri===NS.ix){
   st.sawIx=true;
   if(f.local==='nonFraction'||f.local==='nonNumeric'){
    const member=attrOf(attrs,'tupleRef')!==undefined||st.tuple>0;   // directly or transitively inside ix:tuple
    if(member)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
    open.push({kind:f.local==='nonFraction'?'nf':'nn',attrs,ns:f.ns,text:'',inner:null,tuple:member});
   }else if(f.local==='exclude')st.exclude++;
   else if(f.local==='fraction'||f.local==='tuple'){
    if(f.local==='tuple')st.tuple++;
    out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
   }
   return;
  }
  if(f.uri!==NS.xbrli)return;
  if(f.local==='context'){st.ctx={id:attrOf(attrs,'id')??'',scheme:'',ident:'',start:'',end:'',instant:'',forever:false,dimensional:false};return;}
  if(st.ctx!==null){
   if(f.local==='segment'||f.local==='scenario'){st.segDepth=stack.length;return;}
   if(f.local==='identifier'){st.ctx.scheme=(attrOf(attrs,'scheme')??'').trim();st.ctxField='ident';return;}
   if(f.local==='startDate'){st.ctxField='start';return;}
   if(f.local==='endDate'){st.ctxField='end';return;}
   if(f.local==='instant'){st.ctxField='instant';return;}
   if(f.local==='forever'){st.ctx.forever=true;return;}
   return;
  }
  if(f.local==='unit'){st.unit={id:attrOf(attrs,'id')??'',measures:[],num:[],den:[],bad:false};return;}
  if(st.unit!==null){
   if(f.local==='unitNumerator')st.unitPart='num';
   else if(f.local==='unitDenominator')st.unitPart='den';
   else if(f.local==='measure')st.measure={ns:f.ns,text:''};
  }
 };
 const onClose=(f:Frame)=>{
  if(f.uri===NS.ix){
   if(f.local==='exclude'){st.exclude=Math.max(0,st.exclude-1);return;}
   if(f.local==='tuple'){st.tuple=Math.max(0,st.tuple-1);return;}
   if(f.local==='nonFraction'||f.local==='nonNumeric'){
    const fr=open.pop();if(!fr)return;
    const text=fr.inner??fr.text;
    const parent=open[open.length-1];
    if(parent){if(parent.kind==='nf')parent.inner=text;else parent.text+=text;}
    rawFacts.push({kind:fr.kind,attrs:fr.attrs,ns:fr.ns,text,tuple:fr.tuple});
   }
   return;
  }
  if(f.uri!==NS.xbrli)return;
  if(st.ctx!==null){
   if(f.local==='context'){if(contexts.has(st.ctx.id))dupCtx.add(st.ctx.id);contexts.set(st.ctx.id,st.ctx);st.ctx=null;st.ctxField=null;st.segDepth=-1;return;}
   if((f.local==='segment'||f.local==='scenario')&&st.segDepth===stack.length){st.segDepth=-1;return;}
   if(f.local==='identifier'||f.local==='startDate'||f.local==='endDate'||f.local==='instant')st.ctxField=null;
   return;
  }
  if(st.unit!==null){
   if(f.local==='unit'){if(units.has(st.unit.id))dupUnits.add(st.unit.id);units.set(st.unit.id,st.unit);st.unit=null;st.unitPart=null;return;}
   if(f.local==='measure'&&st.measure!==null){
    const r=resolveQName(st.measure.text.trim(),st.measure.ns,true);
    // namespace and local name are validated together: iso4217 → ISO currency code, xbrli → shares | pure
    const okMeasure=(r.uri===NS.iso4217&&/^[A-Z]{3}$/.test(r.local))||(r.uri===NS.xbrli&&(r.local==='shares'||r.local==='pure'));
    if(!okMeasure)st.unit.bad=true;
    const m=okMeasure?r.local:`{${r.uri??''}}${r.local}`;
    (st.unitPart==='num'?st.unit.num:st.unitPart==='den'?st.unit.den:st.unit.measures).push(m);st.measure=null;return;
   }
   if(f.local==='unitNumerator'||f.local==='unitDenominator')st.unitPart=null;
  }
 };

 for(const tok of tokenizeXml(doc)){
  if(tok.t==='text'){
   if(st.ctx!==null&&st.ctxField!==null&&st.segDepth<0)st.ctx[st.ctxField]+=tok.text;
   if(st.measure!==null)st.measure.text+=tok.text;
   if(open.length>0&&st.exclude===0)open[open.length-1].text+=tok.text;
   continue;
  }
  if(tok.t==='open'){
   const parent=stack.length>0?stack[stack.length-1].ns:root;
   let ns:NsMap=parent;
   const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
   if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
   const {uri,local}=resolveQName(tok.name,ns,true);
   const frame:Frame={name:tok.name,ns,uri,local};
   if(tok.self){onOpen(frame,tok.attrs);onClose(frame);}
   else{onOpen(frame,tok.attrs);stack.push(frame);}
   continue;
  }
  const frame=stack.pop();
  if(!frame||frame.name!==tok.name)throw new IxbrlParseError('mismatched_close');
  onClose(frame);
 }
 if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
 if(!st.sawIx)return {facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]};

 for(const f of rawFacts){
  const nameQ=attrOf(f.attrs,'name');
  if(!nameQ){out.unsupported.push({reason:'name'});continue;}
  const q=resolveQName(nameQ.trim(),f.ns,true);const name=canonicalConcept(q.uri,q.local);
  if(f.kind==='nn'){
   if(!DEI_NON_NUMERIC.includes(name)||f.tuple)continue;
   if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
   if(conflicted.has(name))continue;   // once conflicting, unavailable for good
   const text=f.text.replace(/\s+/g,' ').trim();
   const prev=out.nonNumeric[name];
   if(prev===undefined)out.nonNumeric[name]=text;
   else if(prev!==text){delete out.nonNumeric[name];conflicted.add(name);out.unsupported.push({reason:'nonnumeric_conflict',name});}
   continue;
  }
  if(f.tuple)continue;   // reported when opened
  if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
  const contextRef=attrOf(f.attrs,'contextRef')??'';
  const c=contextRef===''?undefined:contexts.get(contextRef);
  if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
  if(dupCtx.has(contextRef)){out.unsupported.push({reason:'context_duplicate',name,contextRef});continue;}
  if(c.dimensional)continue;
  if(c.ident.trim()===''||c.scheme.trim()===''){out.unsupported.push({reason:'entity',name,contextRef});continue;}
  const period=periodOf(c);
  if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
  const where={name,contextRef,periodStart:period.start,periodEnd:period.end};
  const nil=nsAttr(f.attrs,f.ns,NS.xsi,'nil');
  if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
  const unitRef=attrOf(f.attrs,'unitRef')??'';
  const u=unitRef===''||dupUnits.has(unitRef)?undefined:units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
  const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
  const decimalsRaw=attrOf(f.attrs,'decimals')?.trim();
  if(decimalsRaw!==undefined&&!/^(INF|[+-]?\d+)$/.test(decimalsRaw)){out.unsupported.push({reason:'decimals',...where});continue;}
  const sign=attrOf(f.attrs,'sign');
  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
  const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
  const digits=fmt===null?null:parseFactText(fmt,f.text);
  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
  if(digits.startsWith('-')){out.unsupported.push({reason:'sign',...where});continue;}   // the sign belongs in the sign attribute
  const scale=Number(scaleRaw);
  let value:string;
  try{value=canonicalDecimal(`${digits}e${scale}`);}catch{out.unsupported.push({reason:'decimal_bounds',...where});continue;}
  if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:decimalsRaw===undefined?null:decimalsRaw.replace(/^\+/,''),scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
 }
 return out;
}
// src/lib/entities/identifiers/sec-submissions.ts
// SEC submissions (spec §4.3.3; reused by acceptance times §4.5 and the filing calendar §6.1).
// One fetch per CIK serves several consumers. submissionsClient paces requests (declared
// User-Agent; at least SEC_MIN_INTERVAL_MS apart within one client), stores the exact bytes of the
// main document and of each fetched filings.files[] page in reconcile-raw, and returns the parsed,
// merged snapshot. An accession repeated across pages is kept once when the copies agree; copies that
// disagree on filingDate/acceptanceDateTime are ALL kept (consumers see the conflict: filingsByAccession
// leaves such an accession out, acceptance enrichment skips it). Parsers are pure and strict about the columnar `filings.recent` shape (every
// column has one entry per accession). 8-A12B/8-A12G/25/25-NSE become evidence_only claims that
// never prefill a security or an effective date (the reviewer reads the filing, spec §4.2.1).
import type {Budget} from '../../facts/types';
import type {Pacer} from '../../facts/providers/shared';
import {PacerError,SEC_MIN_INTERVAL_MS as SHARED_INTERVAL,secPacer} from '../../facts/providers/shared';
import type {RawStore} from '../../dq/raw-store';
import {normalizeCik} from '../../research/entity-keys/identifiers';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import type {ClaimInput} from '../claims';
import type {ClaimEvidence} from '../types';

export const SEC_SUBMISSIONS_BASE='https://data.sec.gov/submissions/';
export const SEC_MIN_INTERVAL_MS=SHARED_INTERVAL;
export const SUBMISSIONS_PARSER_VERSION='sec-submissions/1';
const PAGE_NAME=/^CIK\d{10}-submissions-\d{3}\.json$/;
export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalizeCik(cik).padStart(10,'0')}.json`;

export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string}
export interface SubmissionsPageRef{name:string;filingCount:number|null;filingFrom:string|null;filingTo:string|null}
export interface FormerName{name:string;from:string|null;to:string|null}
export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];/** index of each tickers[] entry in the raw document (blank entries are dropped, positions kept) */tickerPositions:number[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
export interface StoredDoc{name:string;sha256:string;path:string}
export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
export class SecSubmissionsError extends Error{
 constructor(readonly code:'sec_unavailable'|'invalid_schema',detail?:string,readonly raw?:{sha256:string;path:string}){super(detail?`${code}: ${detail}`:code);this.name='SecSubmissionsError';}
}
export type FilerAcceleration='large_accelerated'|'accelerated'|'non_accelerated'|'unknown';

/** Acceleration named in submissions `category` (reference only; deadlines use the 10-K cover, spec §6.1). Only "Smaller reporting company" → unknown. */
export function submissionsCategory(raw:string|null|undefined):FilerAcceleration{
 const s=(raw??'').toLowerCase();
 if(s.includes('non-accelerated'))return 'non_accelerated';
 if(s.includes('large accelerated'))return 'large_accelerated';
 if(s.includes('accelerated filer'))return 'accelerated';
 return 'unknown';
}

const text=(v:unknown)=>typeof v==='string'&&v.trim()!==''?v:null;
const invalid=(detail:string)=>new SecSubmissionsError('invalid_schema',detail);

function columnar(o:unknown,page:string):SubmissionFiling[]{
 if(!o||typeof o!=='object'||Array.isArray(o))throw invalid(`${page}: not an object`);
 const c=o as Record<string,unknown>;
 const acc=c.accessionNumber;
 if(!Array.isArray(acc))throw invalid(`${page}: accessionNumber`);
 const col=(k:string,required:boolean):unknown[]|null=>{
  const v=c[k];
  if(v===undefined&&!required)return null;
  if(!Array.isArray(v)||v.length!==acc.length)throw invalid(`${page}: ${k}`);
  return v;
 };
 const fd=col('filingDate',true)!,form=col('form',true)!;
 const rd=col('reportDate',false),ad=col('acceptanceDateTime',false),pd=col('primaryDocument',false),ix=col('isInlineXBRL',false);
 return acc.map((a,i)=>{
  if(typeof a!=='string'||typeof fd[i]!=='string'||typeof form[i]!=='string')throw invalid(`${page}: row ${i}`);
  const x=ix?.[i];
  return {accessionNumber:a,filingDate:fd[i] as string,reportDate:text(rd?.[i]),acceptanceDateTime:text(ad?.[i]),form:form[i] as string,
   primaryDocument:text(pd?.[i]),isInlineXBRL:x===1||x===true?true:x===0||x===false?false:null,page};
 });
}
const parseJson=(json:string,what:string)=>{try{return JSON.parse(json) as unknown;}catch{throw invalid(`${what}: not JSON`);}};

export function parseSubmissionsPage(json:string,name:string):SubmissionFiling[]{return columnar(parseJson(json,name),name);}

export function parseSubmissions(json:string):ParsedSubmissions{
 const doc=parseJson(json,'main');
 if(!doc||typeof doc!=='object'||Array.isArray(doc))throw invalid('main: not an object');
 const d=doc as Record<string,unknown>;
 let cik:string;
 try{cik=normalizeCik(d.cik);}catch{throw invalid('cik');}
 const filings=d.filings as {recent?:unknown;files?:unknown}|undefined;
 if(!filings||typeof filings!=='object')throw invalid('filings');
 // Absent or malformed tickers / files are NOT empty lists: consumers read [] as "SEC lists none", so they fail instead.
 const requiredArray=(v:unknown,what:string):unknown[]=>{if(!Array.isArray(v))throw invalid(what);return v;};
 const requiredStrings=(v:unknown,what:string)=>requiredArray(v,what).map(x=>{if(typeof x!=='string')throw invalid(what);return x;});
 const tickerList=(v:unknown)=>{
  const all=requiredStrings(v,'tickers').map(t=>t.trim().toUpperCase());
  const tickerPositions=all.flatMap((t,i)=>t===''?[]:[i]);
  return {tickers:tickerPositions.map(i=>all[i]),tickerPositions};
 };
 const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.trim()!==''):[];
 const fye=text(d.fiscalYearEnd);
 return {
  cik,name:text(d.name),category:text(d.category),
  fiscalYearEnd:fye&&/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(fye)?fye:null,
  ...tickerList(d.tickers),exchanges:strings(d.exchanges),
  formerNames:(Array.isArray(d.formerNames)?d.formerNames:[]).flatMap(f=>{
   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
   return n?[{name:n,from:text(o.from),to:text(o.to)}]:[];
  }),
  filings:columnar(filings.recent,'recent'),
  files:requiredArray(filings.files,'filings.files').map(f=>{
   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
   if(!n||!PAGE_NAME.test(n))throw invalid('files[].name');
   return {name:n,filingCount:typeof o.filingCount==='number'?o.filingCount:null,filingFrom:text(o.filingFrom),filingTo:text(o.filingTo)};
  }),
 };
}

export interface FetchSubmissionsDeps{fetch:typeof fetch;raw:RawStore;userAgent?:string;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;clock?:()=>Date;budget?:Budget;
 /** Default: one process-wide SEC pacer shared by every client and fetchSubmissions call. Tests inject their own for isolation. */pacer?:Pacer}

const FETCH_TIMEOUT_MS=30_000;
/** Runs a parse of stored bytes; a schema failure carries the stored document's sha256/path so the evidence can be found. */
function parseStored<T>(doc:StoredDoc,parse:()=>T):T{
 try{return parse();}
 catch(e){
  if(e instanceof SecSubmissionsError&&!e.raw)throw new SecSubmissionsError(e.code,e.message.replace(/^[a-z_]+: ?/,''),{sha256:doc.sha256,path:doc.path});
  throw e;
 }
}
// Process-wide: SEC's limit is per source address, so every SEC caller (also companyfacts) shares secPacer.
const SEC_PACER:Pacer=secPacer;
const unlimited=():Budget=>({remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal});

export function submissionsClient(deps:FetchSubmissionsDeps){
 const ua=deps.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const clock=deps.clock??(()=>new Date());
 const budget=deps.budget??unlimited();
 const pacer=deps.pacer??SEC_PACER;
 // The User-Agent may contain a contact address: it goes on the request only, never into raw metadata.
 const get=async(url:string,cik:string,name:string):Promise<{bytes:Uint8Array;doc:StoredDoc}>=>{
  try{
   await pacer.admit({budget,reserveMs:0,now:deps.now,sleep:deps.sleep as never});
  }catch(e){
   if(e instanceof PacerError)throw new SecSubmissionsError('sec_unavailable',`${name}: ${e.code}`);
   throw e;
  }
  let res:Response;
  try{res=await deps.fetch(url,{headers:{'User-Agent':ua,Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(FETCH_TIMEOUT_MS)])});}
  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
  let bytes:Uint8Array;
  try{bytes=new Uint8Array(await res.arrayBuffer());}
  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
  const contentType=(res.headers.get('content-type')??'').includes('html')?'text/html' as const:'application/json' as const;
  if(!res.ok){
   // Evidence first: the failure body is kept as received (an aborted budget starts no upload), then the failure is reported with its sha256/path.
   let stored:{sha256:string;path:string};
   try{stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);}
   catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status} (raw not stored: ${e instanceof Error?e.message:String(e)})`);}
   throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status}`,{sha256:stored.sha256,path:stored.path});
  }
  const stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);
  return {bytes,doc:{name,sha256:stored.sha256,path:stored.path}};
 };
 return {
  /** coverFrom: also fetch every files[] page whose filingTo >= coverFrom ('YYYY-MM-DD'); null/undefined: main document only. */
  async fetch(cik:string,opts:{coverFrom?:string|null}={}):Promise<SubmissionsSnapshot>{
   const c=normalizeCik(cik);
   const fetchedAt=clock().toISOString();
   const main=await get(submissionsUrl(c),c,'main');
   const parsed=parseStored(main.doc,()=>{const x=parseSubmissions(new TextDecoder().decode(main.bytes));if(x.cik!==c)throw invalid(`cik ${x.cik} != ${c}`);return x;});
   const from=opts.coverFrom??null;
   const wanted=from===null?[]:parsed.files.filter(f=>f.filingTo===null||f.filingTo>=from);
   const pages:StoredDoc[]=[];
   const filings=[...parsed.filings];
   // An accession repeated across pages is kept once only when the copies agree; a copy with a different filingDate/acceptanceDateTime is KEPT so consumers can see the conflict (additive: plan 3 Task 12).
   const sig=(f:SubmissionFiling)=>`${f.accessionNumber}|${f.filingDate}|${f.acceptanceDateTime??''}`;
   const seen=new Set(filings.map(sig));
   for(const f of wanted){
    const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
    pages.push(p.doc);
    for(const x of parseStored(p.doc,()=>parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name)))if(!seen.has(sig(x))){seen.add(sig(x));filings.push(x);}
   }
   return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
  },
 };
}

export const fetchSubmissions=(cik:string,deps:FetchSubmissionsDeps,opts:{coverFrom?:string|null}={})=>submissionsClient(deps).fetch(cik,opts);
/** Accessions whose kept copies disagree on filingDate or acceptanceDateTime. */
export function conflictingAccessions(filings:readonly SubmissionFiling[]):Set<string>{
 const first=new Map<string,SubmissionFiling>();const bad=new Set<string>();
 for(const f of filings){const s=first.get(f.accessionNumber);if(!s)first.set(f.accessionNumber,f);else if(s.filingDate!==f.filingDate||s.acceptanceDateTime!==f.acceptanceDateTime)bad.add(f.accessionNumber);}
 return bad;
}
/** accession → filing; an accession with conflicting copies is left out (never last-wins). */
export function filingsByAccession(parsed:ParsedSubmissions):Map<string,SubmissionFiling>{
 const bad=conflictingAccessions(parsed.filings);
 const m=new Map<string,SubmissionFiling>();
 for(const f of parsed.filings)if(!bad.has(f.accessionNumber)&&!m.has(f.accessionNumber))m.set(f.accessionNumber,f);
 return m;
}

export const EVIDENCE_FORMS:Readonly<Record<string,{suggested_op:'backdate_window'|'close_security';note:string}>>={
 '8-A12B':{suggested_op:'backdate_window',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'},
 '8-A12G':{suggested_op:'backdate_window',note:'12(g) 注册，非交易所上市'},
 '25':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
 '25-NSE':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
};

/** One evidence_only claim per 8-A/25 filing; value = accession number (Part B contract issue 6). */
export function submissionsEvidenceClaims(issuerId:string,snap:SubmissionsSnapshot,asOf:string):ClaimInput[]{
 const shaOf=(page:string)=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
 const done=new Set<string>();
 return snap.parsed.filings.flatMap(f=>{
  if(done.has(f.accessionNumber))return [];   // conflicting copies of one accession: one claim
  const rule=Object.prototype.hasOwnProperty.call(EVIDENCE_FORMS,f.form)?EVIDENCE_FORMS[f.form]:null;
  const sha=rule?shaOf(f.page):null;
  if(!rule||!sha)return [];
  done.add(f.accessionNumber);
  const evidence:ClaimEvidence={source:'sec_submissions',as_of:asOf,evidence_sha256:sha,locator:`${f.page}#accessionNumber=${f.accessionNumber}`,note:rule.note};
  return [{issuer_id:issuerId,id_type:'ticker' as const,value:f.accessionNumber,source:'sec_submissions',op:'evidence_only' as const,detail:{
   schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:issuerId},
   params:{suggested_op:rule.suggested_op,accession:f.accessionNumber,form:f.form,filing_date:f.filingDate,note:rule.note},evidence,sources:[evidence],
  }}];
 });
}

exec
/bin/zsh -lc "cat src/lib/dq/reconcile/record.ts; rg -n 'issuer_filer_categories|filer.category|filer-categories' supabase/migrations src/lib/dq/calendar.ts src/lib/dq/datasets.ts; cat src/lib/dq/raw-store.ts | head -100; rg -n 'makeBudget|scopeAll' src/lib/facts/{sync,db}.ts; find . -name AGENTS.override.md -o -name AGENTS.md -o -name CLAUDE.md | head -30; ls /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/{AGENTS*,CLAUDE*} 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 146ms:
// src/lib/dq/reconcile/record.ts
// Out-of-cycle reconciliation rows (spec §5.1): sec.filing_date_vs_submissions, sec.filer_category and
// entities.isin_hkex_vs_gleif are recorded inline by their producers. Only action 'record' exists here:
// no work item, no visibility change, and cycle_id/issuer_id/market/attempt all null (constraint
// dq_reconciliations_cycle_cols). Cycle pairs must go through run.ts / apply_reconcile_result. The kind
// rules mirror the two table constraints (numeric compared needs both sides; text/date keep the values in
// detail.left_text/right_text and leave every numeric column null) so a bad row fails here with a code.
// Dedupe is best-effort: re-recording identical evidence for the same (pair, natural_key) writes nothing, judged
// on the exact strings kept in detail (left_exact/right_exact, left_text/right_text) — never on the numeric
// columns, which PostgREST returns as JSON numbers. There is no unique constraint for out-of-cycle rows and
// they have no business effect, so concurrent writers may each insert one row. Readers (the /admin/dq
// dashboard read model, Task 19a) must therefore count DISTINCT (pair, natural_key), not rows.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../../db/table-client';
import {DATASETS} from '../datasets';
import {compareDecimal,isDecimalText} from './decimal';
import {canonicalDecimal} from '../../facts/json-numbers';
import {CYCLE_PAIR_IDS,RECONCILE_OUTCOMES,RECONCILE_PAIR_IDS} from './types';
import type {ReconcilePairId,ReconcileResultInput} from './types';

const isStr=(v:unknown):v is string=>typeof v==='string';
/** Numeric columns are written canonical; ratio columns (rel_diff) are derived/display, pass/fail is `passed`, decided by exact comparison.
 * detail.tolerance_exact / abs_diff_exact keep the exact values next to the columns. */
export type RecordInput=ReconcileResultInput&{pair:ReconcilePairId;batch_id:string|null};
export async function recordReconciliation(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<string>{return (await recordReconciliationDetailed(tables,input,opts)).id;}
/** Re-recording the same (pair, natural_key) with identical outcome, values and text sides writes nothing and answers the existing row: {duplicate:true} (a re-run over unchanged evidence adds no rows). */
export async function recordReconciliationDetailed(tables:TableClient,input:RecordInput,opts:{now?:()=>Date}={}):Promise<{id:string;duplicate:boolean}>{
 if(!(RECONCILE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('invalid_pair');
 if((CYCLE_PAIR_IDS as readonly string[]).includes(input.pair))throw new Error('cycle_pair_requires_runner');
 if(input.action!=='record')throw new Error('record_action_only');
 if(input.item!==undefined)throw new Error('record_has_no_item');
 if(!(['numeric','text','date'] as readonly unknown[]).includes(input.kind))throw new Error('invalid_kind');
 if(!(RECONCILE_OUTCOMES as readonly unknown[]).includes(input.outcome))throw new Error('invalid_outcome');
 const numeric=input.kind==='numeric';
 if(numeric&&input.outcome==='compared'&&(input.left_value===null||input.right_value===null))throw new Error('numeric_sides_required');
 if(!numeric&&(input.left_value!==null||input.right_value!==null||input.abs_diff!==null||input.rel_diff!==null))throw new Error('nonnumeric_sides_must_be_null');
 for(const v of [input.left_value,input.right_value,input.abs_diff,input.rel_diff])if(v!==null&&(!isStr(v)||!isDecimalText(v)))throw new Error('invalid_decimal_field');
 if(!isStr(input.tolerance)||!isDecimalText(input.tolerance)||compareDecimal(input.tolerance,'0')<0)throw new Error('invalid_tolerance');
 if(input.abs_diff!==null&&compareDecimal(input.abs_diff,'0')<0)throw new Error('negative_abs_diff');
 if(input.rel_diff!==null&&compareDecimal(input.rel_diff,'0')<0)throw new Error('negative_rel_diff');
 if(input.outcome!=='compared'&&input.passed)throw new Error('passed_requires_compared');
 const c=(v:string|null)=>v===null?null:canonicalDecimal(v);
 const tolerance=canonicalDecimal(input.tolerance),abs=c(input.abs_diff);
 const text=(d:unknown,k:string)=>{const v=(d as Record<string,unknown>|null|undefined)?.[k];return v===undefined?null:v;};
 const lx=c(input.left_value),rx=c(input.right_value);
 const lt=text(input.detail,'left_text'),rt=text(input.detail,'right_text');
 for(const e of await tables.select('dq_reconciliations',{pair:input.pair,natural_key:input.natural_key}))
  if(e.outcome===input.outcome&&e.passed===input.passed&&text(e.detail,'left_exact')===lx&&text(e.detail,'right_exact')===rx&&text(e.detail,'left_text')===lt&&text(e.detail,'right_text')===rt)return {id:String(e.id),duplicate:true};
 const id=randomUUID();
 await tables.insert('dq_reconciliations',{
  id,dataset:DATASETS.reconcile(input.pair),pair:input.pair,kind:input.kind,outcome:input.outcome,natural_key:input.natural_key,
  left_source:input.left_source,right_source:input.right_source,left_value:c(input.left_value),right_value:c(input.right_value),
  abs_diff:abs,rel_diff:c(input.rel_diff),tolerance,passed:input.passed,
  detail:{...input.detail,tolerance_exact:tolerance,...(abs===null?{}:{abs_diff_exact:abs}),...(lx===null?{}:{left_exact:lx}),...(rx===null?{}:{right_exact:rx}),...(input.inputs_hash===undefined?{}:{inputs_hash:input.inputs_hash})},
  batch_id:input.batch_id,cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:(opts.now??(()=>new Date()))().toISOString(),
 });
 return {id,duplicate:false};
}
src/lib/dq/datasets.ts:15: filerCategories:'dq.filer-categories',
src/lib/dq/datasets.ts:29: 'sec.filer_category':{producer:'filer-categories',cadence:'event'},
src/lib/dq/datasets.ts:43: {dataset:DATASETS.filerCategories,producer:'filer-categories',cadence:'event'},
src/lib/dq/calendar.ts:47:/** Fiscal year label = calendar year of the month end nearest the fiscal-year-end date (shared with filer-categories). */
supabase/migrations/20261107090000_identifiers_and_dq.sql:190:create table if not exists public.issuer_filer_categories (
supabase/migrations/20261107090000_identifiers_and_dq.sql:252:  foreach t in array array['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'] loop
supabase/migrations/20261107090000_identifiers_and_dq.sql:263:-- Plain registries written by the calendar sync and filer-category scripts through TableClient.
supabase/migrations/20261107090000_identifiers_and_dq.sql:264:grant select, insert, update, delete on public.issuer_filer_categories, public.issuer_filing_profiles to service_role;
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
src/lib/facts/db.ts:223:  async scopeAll(market){return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).order('issuer_id'))).map(scopeFromTable);},
src/lib/facts/sync.ts:128:export function makeBudget(deadline:Date|null,now:()=>Date=()=>new Date()):Budget{
src/lib/facts/sync.ts:416: const budget=makeBudget(deps.deadline,deps.now);
src/lib/facts/sync.ts:448:  const failingActive=idle&&(await deps.db.scopeAll(market)).some(s=>s.priority>0&&s.last_status==='failed');
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*

codex
An unhandled cover-parser exception can abort the entire ingestion run and strand its batch receipt. Document-level parsing failures need the same isolation as download failures.

Review comment:

- [P2] Handle cover parsing failures per document — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/filer-categories.ts:112-112
  When a downloaded document contains malformed XML or markup unsupported by the tokenizer, `parseInlineXbrl` throws `IxbrlParseError` through `coverOf`. Unlike fetch and raw-upload failures, this exception escapes the document loop, preventing subsequent documents and issuers from being processed and leaving an apply run's batch permanently `running` without a freshness update. Catch parsing failures here, record a failed-document outcome, and continue so the batch can be finalized.
An unhandled cover-parser exception can abort the entire ingestion run and strand its batch receipt. Document-level parsing failures need the same isolation as download failures.

Review comment:

- [P2] Handle cover parsing failures per document — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/filer-categories.ts:112-112
  When a downloaded document contains malformed XML or markup unsupported by the tokenizer, `parseInlineXbrl` throws `IxbrlParseError` through `coverOf`. Unlike fetch and raw-upload failures, this exception escapes the document loop, preventing subsequent documents and issuers from being processed and leaving an apply run's batch permanently `running` without a freshness update. Catch parsing failures here, record a failed-document outcome, and continue so the batch can be finalized.
